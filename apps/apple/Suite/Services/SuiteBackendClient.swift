import Foundation
import SuiteCore

enum BackendFailure: LocalizedError {
    case insecureEndpoint, unauthorized, conflict, originalUnavailable, unavailable(Int), invalidResponse, transferPaused
    var errorDescription: String? {
        switch self {
        case .insecureEndpoint: "本番接続にはHTTPSが必要です。"
        case .unauthorized: "認証またはアクセス権を確認してください。"
        case .conflict: "別の編集版があります。未送信の編集内容は端末に保持しています。"
        case .originalUnavailable: "Original取得待ち"
        case .unavailable(let status): "通信処理を完了できません (\(status))。端末のデータは保持しています。"
        case .invalidResponse: "サーバー応答を検証できません。"
        case .transferPaused: "RAW転送は停止中です。通信設定と接続状態を確認してください。"
        }
    }
}

struct RemoteAsset: Codable, Sendable {
    let id: UUID
    let tenantId: String
    let name: String
    let originalKey: String
    let sha256: String
    let size: Int
    let cloudSafe: Bool
    let deletedAt: String?
}
struct RemoteRecipe: Codable, Sendable {
    let revision: Int
    let editor: String
    let updatedAt: String
    let body: RecipeDocument
}

/// Token comes from an authenticated session provider; never a tenant header, bundled key, or UserDefaults.
/// Auth UI/Keychain session lifecycle and production provider remain unconnected.
actor SuiteBackendClient {
    private let endpoint: URL
    private let session: URLSession
    private let accessToken: @Sendable () async throws -> String
    private let allowOriginalTransfer: @Sendable () async -> Bool
    init(endpoint: URL, session: URLSession = .shared,
         allowOriginalTransfer: @escaping @Sendable () async -> Bool = {false},
         accessToken: @escaping @Sendable () async throws -> String) throws {
        guard endpoint.scheme == "https", endpoint.host != nil, endpoint.user == nil, endpoint.password == nil,
              endpoint.query == nil, endpoint.fragment == nil else { throw BackendFailure.insecureEndpoint }
        self.endpoint = endpoint; self.session = session; self.accessToken = accessToken
        self.allowOriginalTransfer = allowOriginalTransfer
    }
    private func request(_ path: String, method: String) async throws -> URLRequest {
        var request = URLRequest(url: endpoint.appendingPathComponent(path))
        request.httpMethod = method
        let token = try await accessToken()
        guard !token.isEmpty else { throw BackendFailure.unauthorized }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.cachePolicy = .reloadIgnoringLocalCacheData
        return request
    }
    private func check(_ response: URLResponse, original: Bool = false) throws {
        guard let response = response as? HTTPURLResponse else { throw BackendFailure.invalidResponse }
        if original && [404, 409, 503].contains(response.statusCode) {throw BackendFailure.originalUnavailable}
        switch response.statusCode {
        case 200..<300: return
        case 401, 403: throw BackendFailure.unauthorized
        case 409: throw BackendFailure.conflict
        default: throw BackendFailure.unavailable(response.statusCode)
        }
    }
    func createAsset(_ asset: AssetRecord, size: Int) async throws -> RemoteAsset {
        struct Body: Encodable {let name: String; let sha256: String; let size: Int}
        var req = try await request("v1/assets", method: "POST")
        req.httpBody = try JSONEncoder().encode(Body(name: asset.originalFilename, sha256: asset.sha256, size: size))
        let (data, response) = try await session.data(for: req); try check(response)
        let remote = try JSONDecoder().decode(RemoteAsset.self, from: data)
        guard remote.sha256 == asset.sha256, remote.size == size else { throw BackendFailure.invalidResponse }
        return remote
    }
    func uploadOriginal(remote: RemoteAsset, file: URL) async throws -> RemoteAsset {
        guard await allowOriginalTransfer() else {throw BackendFailure.transferPaused}
        var req = try await request("v1/assets/\(remote.id.uuidString.lowercased())/original", method: "PUT")
        req.setValue("application/octet-stream", forHTTPHeaderField: "Content-Type")
        let (data, response) = try await session.upload(for: req, fromFile: file); try check(response)
        let verified = try JSONDecoder().decode(RemoteAsset.self, from: data)
        guard verified.id == remote.id, verified.sha256 == remote.sha256, verified.size == remote.size,
              verified.tenantId == remote.tenantId, verified.cloudSafe else { throw BackendFailure.invalidResponse }
        return verified
    }
    func saveRecipe(remoteID: UUID, expectedRevision: Int, document: RecipeDocument) async throws -> RemoteRecipe {
        struct Body: Encodable {let expectedRevision: Int; let recipe: RecipeDocument}
        var req = try await request("v1/assets/\(remoteID.uuidString.lowercased())/recipe", method: "PUT")
        req.httpBody = try JSONEncoder().encode(Body(expectedRevision: expectedRevision, recipe: document))
        let (data, response) = try await session.data(for: req); try check(response)
        return try JSONDecoder().decode(RemoteRecipe.self, from: data)
    }
    func latestRecipe(remoteID: UUID) async throws -> RemoteRecipe? {
        struct Body: Decodable {let recipe: RemoteRecipe?}
        let req = try await request("v1/assets/\(remoteID.uuidString.lowercased())/recipe", method: "GET")
        let (data, response) = try await session.data(for: req); try check(response)
        return try JSONDecoder().decode(Body.self, from: data).recipe
    }
    /// This API cannot be called with browse/edit intent. Returns a temporary download; caller verifies hash before publishing.
    func downloadOriginal(remoteID: UUID, format: ExportFormat) async throws -> URL {
        guard await allowOriginalTransfer() else {throw BackendFailure.transferPaused}
        var req = try await request("v1/assets/\(remoteID.uuidString.lowercased())/original", method: "GET")
        var components = URLComponents(url: req.url!, resolvingAgainstBaseURL: false)!
        let purpose = format == .jpeg ? "final-jpeg" : format == .tiff ? "final-tiff" : "high-precision"
        components.queryItems = [URLQueryItem(name: "purpose", value: purpose)]
        req.url = components.url
        do {
            let (file, response) = try await session.download(for: req)
            do {try check(response, original: true); return file}
            catch {try? FileManager.default.removeItem(at: file); throw error}
        } catch is CancellationError { throw CancellationError() }
        catch let error as BackendFailure {throw error}
        catch {throw BackendFailure.originalUnavailable}
    }
}
