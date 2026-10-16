import Foundation
import Combine
import CryptoKit
import Darwin
import SuiteCore

@MainActor
final class GenerationAuthorizationModel: ObservableObject {
    struct Configuration: Decodable, Equatable, Sendable {
        let schemaVersion: Int
        let provider, model, priceListVersion, currency: String
        let costDecimalPlaces: Int
        let maximumCostUnits: Int64
        let disclosureVersion, canonicalPayload: String
    }
    @Published private(set) var configuration: Configuration?
    @Published private(set) var status = "登録のみ。外部送信・残高予約・課金は行いません。"
    @Published private(set) var busy = false
    @Published private(set) var registered: GenerationAuthorization?
    @Published var reviewed = false { didSet { if reviewed != oldValue { invalidate() } } }
    private let input: Data
    private let coordinator: GenerationAuthorizationCoordinator
    private let host: GenerationAuthorizationCoordinator.HostValidation
    private var epoch = UUID()
    private var fixed: GenerationAuthorization?
    private var task: Task<Void, Never>?
    private lazy var fixedInputSHA256 = Self.sha(input)
    var inputSHA256: String { fixedInputSHA256 }
    var payloadSHA256: String? { configuration.map { Self.sha(Data($0.canonicalPayload.utf8)) } }

    init(inputData: Data, store: GenerationAuthorizationStore,
         validateCurrent: @escaping GenerationAuthorizationCoordinator.HostValidation) {
        input = inputData; coordinator = .init(store: store); host = validateCurrent
    }
    private func invalidate() {
        epoch = UUID(); task?.cancel(); fixed = nil
        // A completed durable registration is never erased by cancellation.
    }
    func cancel() {
        epoch = UUID(); task?.cancel()
        // Preserve the fixed body/ID for uncertain-write reconciliation. A
        // settings or consent change, unlike cancellation, requires a new body.
    }
    func load(_ url: URL) {
        guard !busy else { return }
        invalidate(); reviewed = false; configuration = nil
        do {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            guard url.isFileURL, url.standardizedFileURL.path == url.resolvingSymlinksInPath().path else { throw CocoaError(.fileReadInvalidFileName) }
            let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW)
            guard fd >= 0 else { throw CocoaError(.fileReadUnknown) }
            let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
            defer { try? handle.close() }
            var info = stat()
            let cap = 4 * 1024 * 1024
            guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
                  info.st_size > 0, info.st_size <= cap else { throw CocoaError(.fileReadTooLarge) }
            let data = try handle.read(upToCount: cap + 1) ?? Data()
            let keys: Set<String> = ["schemaVersion", "provider", "model", "priceListVersion", "currency", "costDecimalPlaces", "maximumCostUnits", "disclosureVersion", "canonicalPayload"]
            guard data.count == Int(info.st_size),
                  let object = try JSONSerialization.jsonObject(with: data) as? [String: Any], Set(object.keys) == keys else { throw CocoaError(.fileReadCorruptFile) }
            let config = try JSONDecoder().decode(Configuration.self, from: data)
            guard config.schemaVersion == 1, !config.canonicalPayload.isEmpty,
                  let payload = config.canonicalPayload.data(using: .utf8),
                  try JSONSerialization.jsonObject(with: payload) is [String: Any] else { throw CocoaError(.fileReadCorruptFile) }
            // Syntax validation only; never label imported pricing as authenticated.
            _ = try authorization(config, inputSHA: String(repeating: "0", count: 64))
            configuration = config
            status = "設定読込済み。価格の真正性・権利・全依頼内容を確認してください。未登録です。"
        } catch { status = "読込不可: \(error)" }
    }
    private func authorization(_ config: Configuration, inputSHA: String) throws -> GenerationAuthorization {
        try .init(idempotencyKey: UUID(), provider: config.provider, model: config.model,
            inputSHA256: inputSHA, recipeSHA256: Self.sha(Data(config.canonicalPayload.utf8)),
            priceListVersion: config.priceListVersion, currency: config.currency,
            costDecimalPlaces: config.costDecimalPlaces, maximumCostUnits: config.maximumCostUnits,
            consent: .init(explicitlyApproved: true, confirmationID: UUID(), disclosureVersion: config.disclosureVersion,
                confirmedAtUnixMilliseconds: Int64(Date().timeIntervalSince1970 * 1000)))
    }
    func register() {
        guard !busy, reviewed, let config = configuration else { return }
        guard !input.isEmpty, input.count <= 256 * 1024 * 1024 else { status = "入力画像の容量が範囲外です。"; return }
        do {
            if fixed == nil { fixed = try authorization(config, inputSHA: fixedInputSHA256) }
        } catch { status = "依頼を固定できません: \(error)"; return }
        guard let auth = fixed else { return }
        let generation = epoch, payload = Data(config.canonicalPayload.utf8), hostValidation = host
        busy = true
        task = Task { [weak self] in
            guard let self else { return }
            defer { self.busy = false; self.task = nil }
            do {
                let validate: GenerationAuthorizationCoordinator.HostValidation = { [weak self] candidate in
                    guard let self, await self.isCurrent(generation, configuration: config, authorization: candidate) else { return false }
                    guard try await hostValidation(candidate) else { return false }
                    return await self.isCurrent(generation, configuration: config, authorization: candidate)
                }
                let result = try await coordinator.register(inputData: input, canonicalPayloadData: payload,
                    authorization: auth, validatePriceAndConsent: validate)
                registered = result.authorization
                status = epoch == generation
                    ? "登録済み（未送信・未課金）: \(result.authorization.idempotencyKey)"
                    : "取消と保存が前後しました。旧依頼の登録は保持されています（未送信・未課金）: \(result.authorization.idempotencyKey)"
            } catch {
                if epoch == generation {
                    status = "登録成功を確認できません。同じ依頼で再確認できます: \(error)"
                } else {
                    status = "処理を中止しました。保存済み登録を取り消した意味ではありません。同じ固定依頼で再確認できます。"
                }
            }
        }
    }
    /// Imported configuration is a declared local ceiling, NOT an authenticated
    /// provider quote. Bind every declared field before and after the external
    /// photo-version callback; that callback alone checks no pricing fields.
    private func isCurrent(_ value: UUID, configuration expected: Configuration,
                           authorization candidate: GenerationAuthorization) -> Bool {
        guard epoch == value, reviewed, configuration == expected, fixed == candidate else { return false }
        return candidate.provider == expected.provider && candidate.model == expected.model
            && candidate.priceListVersion == expected.priceListVersion && candidate.currency == expected.currency
            && candidate.costDecimalPlaces == expected.costDecimalPlaces && candidate.maximumCostUnits == expected.maximumCostUnits
            && candidate.consent.disclosureVersion == expected.disclosureVersion && candidate.consent.explicitlyApproved
            && candidate.inputSHA256 == fixedInputSHA256
            && candidate.recipeSHA256 == Self.sha(Data(expected.canonicalPayload.utf8))
    }
    private static func sha(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
