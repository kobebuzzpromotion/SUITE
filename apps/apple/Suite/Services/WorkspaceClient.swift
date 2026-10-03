import Foundation
import SuiteCore

enum WorkspaceClientFailure: LocalizedError {
    case insecureEndpoint, invalidIdentifier, authentication, invalidResponse, unavailable(Int)
    var errorDescription: String? {
        switch self {
        case .insecureEndpoint: "Workspace接続にはHTTPSが必要です。"
        case .invalidIdentifier: "WorkspaceまたはProject識別子が不正です。"
        case .authentication: "認証またはWorkspaceの所属・権限を確認してください。"
        case .invalidResponse: "Workspace応答の境界またはデータを検証できません。"
        case .unavailable(let status): "Workspace通信を完了できません (\(status))。"
        }
    }
}

/// Do not forward an authenticated request to a redirect destination.
private final class WorkspaceNoRedirect: NSObject, URLSessionTaskDelegate, Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

/// Authentication session/token lifecycle is supplied by the caller, not implemented here.
/// No bundled credentials, tenant-header authority, global URL cache, or Original download on list operations.
actor WorkspaceClient {
    private let endpoint: URL
    private let session: URLSession
    private let accessToken: @Sendable () async throws -> String
    init(endpoint: URL, accessToken: @escaping @Sendable () async throws -> String) throws {
        guard endpoint.scheme?.lowercased() == "https", endpoint.host != nil,
              endpoint.user == nil, endpoint.password == nil, endpoint.query == nil, endpoint.fragment == nil else {
            throw WorkspaceClientFailure.insecureEndpoint
        }
        self.endpoint = endpoint; self.accessToken = accessToken
        let configuration = URLSessionConfiguration.ephemeral
        configuration.urlCache = nil; configuration.httpCookieStorage = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        self.session = URLSession(configuration: configuration, delegate: WorkspaceNoRedirect(), delegateQueue: nil)
    }
    private func identifier(_ value: String) throws -> String {
        guard !value.isEmpty, value.count <= 512,
              value.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) || $0 == "-" || $0 == "_" }) else {
            throw WorkspaceClientFailure.invalidIdentifier
        }
        return value
    }
    private func path(_ workspace: String, _ suffix: String = "") throws -> String {
        "v1/workspaces/\(try identifier(workspace))" + suffix
    }
    private func request<T: Decodable & Sendable>(_ path: String, method: String = "GET", body: Data? = nil,
                                                 permitConflict: Bool = false) async throws -> T {
        var request = URLRequest(url: endpoint.appendingPathComponent(path))
        request.httpMethod = method; request.httpBody = body
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let token = try await accessToken()
        guard !token.isEmpty, !token.contains("\n"), !token.contains("\r") else { throw WorkspaceClientFailure.authentication }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (data, response) = try await session.data(for: request)
        try Task.checkCancellation()
        guard let response = response as? HTTPURLResponse, response.url == request.url else { throw WorkspaceClientFailure.invalidResponse }
        if response.statusCode == 401 || response.statusCode == 403 { throw WorkspaceClientFailure.authentication }
        guard (200..<300).contains(response.statusCode) || (permitConflict && response.statusCode == 409) else {
            throw WorkspaceClientFailure.unavailable(response.statusCode)
        }
        return try JSONDecoder().decode(T.self, from: data)
    }
    func workspaces() async throws -> [WorkspaceSummary] {
        struct Response: Decodable, Sendable { let workspaces: [WorkspaceSummary] }
        let result: Response = try await request("v1/workspaces")
        guard result.workspaces.allSatisfy({ $0.deletedAt == nil }) else { throw WorkspaceClientFailure.invalidResponse }
        return result.workspaces
    }
    func createWorkspace(name: String) async throws -> WorkspaceSummary {
        struct Response: Decodable, Sendable { let workspace: WorkspaceSummary }
        let result: Response = try await request("v1/workspaces", method: "POST", body: JSONEncoder().encode(["name": name]))
        return result.workspace
    }
    func projects(workspace: String) async throws -> [WorkspaceProject] {
        struct Response: Decodable, Sendable { let projects: [WorkspaceProject] }
        let result: Response = try await request(path(workspace, "/projects"))
        guard result.projects.allSatisfy({ $0.workspaceId == workspace && $0.deletedAt == nil }) else { throw WorkspaceClientFailure.invalidResponse }
        return result.projects
    }
    func members(workspace: String) async throws -> [WorkspaceMember] {
        struct Response: Decodable, Sendable { let members: [WorkspaceMember] }
        let result: Response = try await request(path(workspace, "/members"))
        guard result.members.allSatisfy({ $0.workspaceId == workspace && $0.removedAt == nil }) else { throw WorkspaceClientFailure.invalidResponse }
        return result.members
    }
    func presets(workspace: String) async throws -> [WorkspacePreset] {
        struct Response: Decodable, Sendable { let presets: [WorkspacePreset] }
        let result: Response = try await request(path(workspace, "/presets"))
        guard result.presets.allSatisfy({ $0.workspaceId == workspace && $0.deletedAt == nil }) else { throw WorkspaceClientFailure.invalidResponse }
        return result.presets
    }
    func storage(workspace: String) async throws -> WorkspaceStorageUsage {
        struct Response: Decodable, Sendable { let usage: WorkspaceStorageUsage }
        let result: Response = try await request(path(workspace, "/storage"))
        guard result.usage.workspaceId == workspace else { throw WorkspaceClientFailure.invalidResponse }
        try result.usage.validate(); return result.usage
    }
    func assets(workspace: String, project: String) async throws -> [WorkspaceAsset] {
        struct Response: Decodable, Sendable { let assets: [WorkspaceAsset] }
        let result: Response = try await request(path(workspace, "/projects/\(try identifier(project))/assets"))
        guard result.assets.allSatisfy({ $0.tenantId == workspace && $0.deletedAt == nil && $0.size > 0 }) else { throw WorkspaceClientFailure.invalidResponse }
        return result.assets
    }
    func recipe(workspace: String, project: String, asset: String) async throws -> WorkspaceRecipeVersion? {
        struct Response: Decodable, Sendable { let recipe: WorkspaceRecipeVersion? }
        let result: Response = try await request(path(workspace, "/projects/\(try identifier(project))/assets/\(try identifier(asset))/recipe"))
        if let recipe = result.recipe { try checkScope(recipe, workspace: workspace, project: project, asset: asset) }
        return result.recipe
    }
    func saveRecipe(workspace: String, project: String, asset: String, baseVersion: Int64,
                    recipe: RecipeDocument) async throws -> WorkspaceRecipeSaveResult {
        struct Body: Encodable { let baseVersion: Int64; let recipe: RecipeDocument }
        guard baseVersion >= 0 && baseVersion < 9_007_199_254_740_991 else { throw WorkspaceClientFailure.invalidResponse }
        let result: WorkspaceRecipeSaveResult = try await request(path(workspace, "/projects/\(try identifier(project))/assets/\(try identifier(asset))/recipe"),
            method: "PUT", body: JSONEncoder().encode(Body(baseVersion: baseVersion, recipe: recipe)), permitConflict: true)
        try checkScope(result.version, workspace: workspace, project: project, asset: asset)
        // Return the conflict and retained branch to the caller; never retry as unconditional overwrite.
        return result
    }
    private func checkScope(_ version: WorkspaceRecipeVersion, workspace: String, project: String, asset: String) throws {
        guard version.workspaceId == workspace && version.projectId == project && version.assetId == asset else {
            throw WorkspaceClientFailure.invalidResponse
        }
    }
}
