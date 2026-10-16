import Foundation
import Combine
import Darwin
import SuiteCore

@MainActor
final class SessionLookPartialApplyModel: ObservableObject {
    private struct Import: Decodable {
        let schemaVersion: Int
        let session: TetherSessionState
        let binding: SessionImageBinding
    }
    @Published private(set) var status = "固定SessionLookと写真bindingのJSONを読み込んでください。"
    @Published private(set) var rows: [String] = []
    @Published private(set) var previewJSON = ""
    @Published private(set) var busy = false
    @Published private(set) var canApply = false
    private var checkpoint: ProjectCheckpoint
    private let projects: ProjectStore
    private let evidence: PhotoAnalysisEvidence?
    private let validateCurrent: @MainActor (ProjectCheckpoint) async -> Bool
    private let onApplied: @MainActor (ProjectCheckpoint) -> Void
    private let beginApply: @MainActor () -> Bool
    private let endApply: @MainActor () -> Void
    private let coordinator = SessionLookPartialApplyCoordinator()
    private var imported: Import?
    private var candidate: SessionLookPartialApplyCoordinator.Candidate?
    private var ids: [SessionLookPartialApplication.Effect: UUID] = [:]
    private var generation = UUID()

    init(checkpoint: ProjectCheckpoint, projects: ProjectStore, evidence: PhotoAnalysisEvidence? = nil,
         validateCurrent: @escaping @MainActor (ProjectCheckpoint) async -> Bool,
         beginApply: @escaping @MainActor () -> Bool, endApply: @escaping @MainActor () -> Void,
         onApplied: @escaping @MainActor (ProjectCheckpoint) -> Void) {
        self.checkpoint = checkpoint; self.projects = projects; self.evidence = evidence
        self.validateCurrent = validateCurrent; self.onApplied = onApplied
        self.beginApply = beginApply; self.endApply = endApply
    }
    func cancel() { generation = UUID(); candidate = nil; canApply = false }
    func load(_ url: URL) {
        guard !busy else { return }
        cancel(); imported = nil; rows = []; previewJSON = ""; ids = [:]
        do {
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            guard url.isFileURL, url.standardizedFileURL.path == url.resolvingSymlinksInPath().path else { throw CocoaError(.fileReadInvalidFileName) }
            let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW)
            guard fd >= 0 else { throw CocoaError(.fileReadUnknown) }
            let file = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? file.close() }
            var info = stat(); let cap = 1024 * 1024
            guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
                  info.st_size > 0, info.st_size <= cap else { throw CocoaError(.fileReadTooLarge) }
            let bytes = try file.read(upToCount: cap + 1) ?? Data()
            guard bytes.count == Int(info.st_size),
                  let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
                  Set(object.keys) == Set(["schemaVersion", "session", "binding"]) else { throw CocoaError(.fileReadCorruptFile) }
            let value = try JSONDecoder().decode(Import.self, from: bytes)
            guard value.schemaVersion == 1, value.binding.assetID == checkpoint.asset.id,
                  value.binding.originalSHA256.lowercased() == checkpoint.asset.sha256.lowercased(),
                  value.binding.inputRecipeRevision <= checkpoint.revision else { throw SessionLookPartialApplyCoordinator.Failure.staleInput }
            try value.session.validate()
            guard value.session.bindings.contains(value.binding) else { throw SessionLookError.invalidBinding }
            imported = value
            status = "固定依頼を読み込みました。解析証拠はJSONから受け取りません。"
        } catch { status = "読込不可: \(error)" }
    }
    func prepare() async {
        guard !busy, let imported else { return }
        busy = true; defer { busy = false }
        candidate = nil; canApply = false
        let epoch = generation, input = checkpoint
        do {
            guard await validateCurrent(input), epoch == generation else { throw CancellationError() }
            // Reuse durable IDs after reopening, never create a second effect.
            let recovery = try await projects.partialLookRecovery(binding: imported.binding)
            for effect in [SessionLookPartialApplication.Effect.globalColor, .outputIntent] {
                ids[effect] = recovery?.receipts.first(where: { $0.effect == effect })?.id ?? ids[effect] ?? UUID()
            }
            let result = try await coordinator.prepareGlobal(session: imported.session, binding: imported.binding,
                checkpoint: input, evidence: evidence, receiptIDs: ids, projects: projects)
            guard await validateCurrent(input), epoch == generation else { throw CancellationError() }
            rows = result.application.parts.map { part in
                "\(part.effect): \(part.state) / 不足解析: \(part.plan.missingAnalysis.map(\.rawValue).sorted().joined(separator: ", ")) / 未対応: \(part.plan.unsupportedCapabilities.map(\.rawValue).sorted().joined(separator: ", "))"
            }
            let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            previewJSON = String(decoding: try encoder.encode(result.checkpoint.history.current), as: UTF8.self)
            candidate = result; canApply = !result.receipts.isEmpty
            status = "適用候補 \(result.receipts.count)件 / 保存済 \(result.alreadyAppliedReceipts.count)件。保留・未対応は適用しません。"
        } catch { status = "計画不可: \(error)" }
    }
    func apply() async {
        guard !busy, canApply, let candidate else { return }
        guard beginApply() else { status = "編集中のため保存を開始できません。"; return }
        defer { endApply() }
        busy = true; defer { busy = false }; canApply = false
        let epoch = generation
        do {
            guard await validateCurrent(candidate.input), epoch == generation else { throw CancellationError() }
            let report = try await coordinator.apply(candidate, projects: projects)
            // Do not suppress committed receipts merely because the view closed.
            self.candidate = nil
            status = "保存 \(report.savedReceiptIDs.count)件。\(report.failure ?? (report.cancelled ? "取消" : "完了"))"
            // Reconciliation must survive the UI task's cancellation after a
            // partial commit. This fresh task only reads; it never resumes apply.
            let store = projects, assetID = checkpoint.asset.id
            let latest = try await Task.detached { try await store.load(id: assetID) }.value
            if let latest {
                checkpoint = latest
                onApplied(latest) // Host rechecks editor context before adopting; never edit/save twice.
            }
        } catch { status = "保存確認が必要です: \(error)"; self.candidate = nil }
    }
}
