import Foundation
import Combine
import Darwin
import SuiteCore

@MainActor
final class LocalGenerationCandidateModel: ObservableObject {
    enum Input: String, CaseIterable { case manifest, output, subject, protection }
    @Published private(set) var candidate: LocalGenerationCandidate?
    @Published private(set) var handoff: LocalGenerationCandidateStore.Handoff?
    @Published private(set) var status = "外部で作成済みの背景候補だけを手動導入します。"
    @Published var licenseID = "" { didSet { clearConsent() } }
    @Published var licenseDeclaration = "" { didSet { clearConsent() } }
    @Published var permissionConfirmed = false { didSet { cancel() } }
    @Published var acceptanceConfirmed = false { didSet { cancel() } }
    @Published private(set) var busy = false
    private var generation = UUID()
    private var output: URL?
    private var subject: Data?
    private var protection: Data?
    private let store: LocalGenerationCandidateStore
    let assetID: UUID, originalSHA256: String, recipeRevision: Int
    init(store: LocalGenerationCandidateStore, assetID: UUID, originalSHA256: String, recipeRevision: Int) {
        self.store = store; self.assetID = assetID; self.originalSHA256 = originalSHA256; self.recipeRevision = recipeRevision
    }
    func cancel() { generation = UUID(); handoff = nil; busy = false }
    private func clearConsent() { permissionConfirmed = false; acceptanceConfirmed = false; handoff = nil }
    func load(_ kind: Input, url: URL) {
        cancel(); clearConsent()
        do {
            switch kind {
            case .manifest:
                candidate = nil; subject = nil; protection = nil; output = nil
                let c = try JSONDecoder().decode(LocalGenerationCandidate.self, from: read(url, maximum: 32 * 1024))
                try c.validateBinding(assetID: assetID, originalSHA256: originalSHA256, recipeRevision: recipeRevision)
                candidate = c
            case .output: output = url
            case .subject: subject = nil; subject = try read(url, maximum: 8_000_000)
            case .protection: protection = nil; protection = try read(url, maximum: 8_000_000)
            }
            status = "\(kind.rawValue)読込済み。全ファイルと許諾・写真対応を確認してください。"
        } catch { status = "入力を読めません: \(error)" }
    }
    func prepare() async {
        guard !busy, let candidate, let output, let subject, let protection,
              permissionConfirmed, acceptanceConfirmed else { return }
        let epoch = generation; busy = true
        let fixedID = licenseID, declaration = licenseDeclaration
        defer { if epoch == generation { busy = false } }
        do {
            try candidate.validateBinding(assetID: assetID, originalSHA256: originalSHA256, recipeRevision: recipeRevision)
            try await store.importCandidate(candidate, outputURL: output, subjectMask: subject, protectionMask: protection,
                licenseID: fixedID, licenseDeclaration: declaration, permission: .callerConfirmed, permissionConfirmed: true)
            let value = try await store.handoff(id: candidate.id, assetID: assetID,
                originalSHA256: originalSHA256, recipeRevision: recipeRevision, acceptanceConfirmed: true)
            try Task.checkCancellation()
            guard epoch == generation, permissionConfirmed, acceptanceConfirmed,
                  licenseID == fixedID, licenseDeclaration == declaration else { return }
            handoff = value; status = "検証済み受渡し候補。まだ編集には採用していません。"
        } catch { guard epoch == generation else { return }; status = "受渡し不可: \(error)" }
    }
    private func read(_ url: URL, maximum: Int) throws -> Data {
        let scope = url.startAccessingSecurityScopedResource(); defer { if scope { url.stopAccessingSecurityScopedResource() } }
        guard url.isFileURL, url.standardizedFileURL.path == url.resolvingSymlinksInPath().path else { throw CocoaError(.fileReadInvalidFileName) }
        let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw CocoaError(.fileReadUnknown) }
        let h = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? h.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG, info.st_size > 0, info.st_size <= maximum else { throw CocoaError(.fileReadTooLarge) }
        let data = try h.read(upToCount: maximum + 1) ?? Data()
        guard data.count == Int(info.st_size) else { throw CocoaError(.fileReadCorruptFile) }
        return data
    }
}
