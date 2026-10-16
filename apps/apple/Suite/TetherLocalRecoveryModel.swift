import Foundation
import Combine
import Darwin
import SuiteCore

/// Explicit local reopening only. No SDK, camera dispatch or fabricated arrival.
@MainActor
final class TetherLocalRecoveryModel: ObservableObject {
    struct Context: Sendable {
        /// All three must describe the same app-private root. The editor must
        /// serialize other writers/consent changes while this host is processing.
        let root: URL
        let projects: ProjectStore
        let pipeline: PhotoPipeline
        let proxyLongEdge: Int
        let beginOperation: @MainActor @Sendable () -> Bool
        let endOperation: @MainActor @Sendable () -> Void
        let onChanged: @MainActor @Sendable () async -> Void
        var onArrival: (@MainActor @Sendable (UUID) async -> Void)? = nil
    }
    struct Row: Identifiable {
        let id: String
        let recordID: UUID
        let stage: String
        let status: String
        let detail: String?
        let retryAllowed: Bool
    }
    @Published private(set) var busy = false
    @Published private(set) var status = "固定セッションJSONを選択してください。"
    @Published private(set) var rows: [Row] = []
    @Published private(set) var sessionID: UUID?
    @Published private(set) var workerSummary = "人物入力は未提供です。SDK通信は行いません。"
    @Published private(set) var canLoadNextPage = false
    @Published private(set) var arrivals: [TetherLocalSessionHost.ArrivalStatus] = []
    private let context: Context
    private var host: TetherLocalSessionHost?
    private var receiptOffset = 0
    private var jobOffset = 0

    init(context: Context) { self.context = context }

    /// Only an already persisted, explicitly selected final member can enter.
    /// No capture key, RAW pairing or identity is invented from the filename.
    func receive(_ url: URL, contextID: UUID) async {
        guard let host, begin() else { return }
        var arrived: UUID?
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            status = "確定原本を照合・取込中。人物不明は保留します。"
            let delivery = try await host.receiveSelectedOriginal(downloadedFile: url,
                contextID: contextID, proxyLongEdge: context.proxyLongEdge)
            arrived = delivery.assetID
            if let report = await host.lastWorkerReport { showWorker(report) }
            status = "原本を登録しました。補正の完了／保留は別に表示します。"
        } catch { status = "受信を完了できません：\(error)。既存の保存・相関は保持します。" }
        await finish(arrived: arrived)
    }

    func load(_ url: URL) async {
        guard begin() else { return }
        do {
            // Reject replacement while a host owns the same queue lock. Reopen
            // is an explicit operation; no new imported JSON overwrites a ledger.
            host = nil; rows = []; arrivals = []; sessionID = nil; canLoadNextPage = false
            let bytes = try await Task.detached { try Self.readSession(url) }.value
            try Task.checkCancellation()
            let session = try JSONDecoder().decode(TetherSessionState.self, from: bytes)
            try session.validate()
            let opening = try await TetherLocalSessionHost.openAndRecover(root: context.root,
                initialSession: session, projects: context.projects, pipeline: context.pipeline,
                proxyLongEdge: context.proxyLongEdge, maximumItems: 128)
            try Task.checkCancellation()
            host = opening.host; sessionID = session.id
            show(opening.recoveryReport, append: false)
            status = "ローカルセッションを開きました。既存台帳がある場合、その固定Lookを優先します。"
        } catch { status = "開けません：\(error)（確定済みの台帳は変更・削除しません）" }
        await finish()
    }

    func process() async {
        guard let host, begin() else { return }
        do {
            try await host.resume()
            let report = try await host.processPending(maximumOperations: 96)
            showWorker(report)
            status = "処理結果を表示しました。表示中の旧復旧一覧は再照合で更新できます。"
        } catch { status = "処理を停止：\(error)。未確定commitは再照合してください。" }
        await finish()
    }
    func loadAnalysisConfiguration(_ url: URL) async {
        guard let host, begin() else { return }
        do {
            let bytes = try await Task.detached { try Self.readSession(url) }.value
            guard bytes.count <= 65_536,
                  let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
                  Set(object.keys) == Set(["jobID", "scoreThreshold", "nmsThreshold", "minimumIoU", "minimumMargin", "policyRevision", "resolutions"]),
                  let resolutions = object["resolutions"] as? [[String: Any]],
                  resolutions.allSatisfy({ Set($0.keys) == Set(["personID", "exposureEV"]) }) else { throw CocoaError(.fileReadCorruptFile) }
            let configuration = try JSONDecoder().decode(TetherLocalAnalysisAdapter.Configuration.self, from: bytes)
            try Task.checkCancellation()
            let measurements = try await host.prepareWorkerInput(configuration)
            workerSummary = measurements.map { "\($0.personID): 顔枠の線形輝度 \($0.meanLinearLuminance)、\($0.samples) 画素" }.joined(separator: "\n")
            status = "実解析と明示EVを準備しました。自動EV推定ではありません。再開は別操作です。"
        } catch { status = "人物入力は未準備：\(error)。新写真の本人対応は人物画面で明示確定してください。" }
        await finish()
    }

    func recover(nextPage: Bool = false) async {
        guard let host, begin() else { return }
        do {
            // Pause prevents a status refresh from silently starting another
            // batch. Recovery still reconciles real saved receipts/handoffs.
            try await host.pause()
            let report = try await host.recover(proxyLongEdge: context.proxyLongEdge, maximumItems: 128,
                receiptOffset: nextPage ? receiptOffset : 0, jobOffset: nextPage ? jobOffset : 0)
            show(report, append: nextPage)
            status = "停止状態で台帳を再照合しました。"
        } catch { status = "再照合未完了：\(error)" }
        await finish()
    }

    func retry(_ id: UUID, discardAnalysis: Bool) async {
        guard let host, begin() else { return }
        do {
            try await host.retryWorkerJob(jobID: id, discardAnalysis: discardAnalysis)
            status = "\(id.uuidString) を再試行待ちへ戻しました。「再開して処理」で進めます。"
            rows = rows.map { row in
                row.recordID == id && row.retryAllowed
                    ? Row(id: row.id, recordID: row.recordID, stage: row.stage, status: "再試行待ち", detail: nil, retryAllowed: false) : row
            }
        } catch { status = "再試行へ移せません：\(error)。不確定commitを未実行扱いにはしません。" }
        await finish()
    }
    private func begin() -> Bool {
        guard !busy, !Task.isCancelled else { return false }
        guard context.beginOperation() else { status = "別の編集・保存処理が進行中です。"; return false }
        busy = true; return true
    }
    private func finish(arrived: UUID? = nil) async {
        // Cancellation or disappearing UI cannot hide a durable commit. This
        // unstructured callback does not inherit the operation's cancellation.
        // Keep the editor write lease until its read-only refresh completes.
        if let host {
            do { arrivals = try await Task { try await host.arrivalStatuses() }.value }
            catch { arrivals = []; status += " / 撮影状態の再読込未完了：\(error)" }
        }
        await Task { @MainActor [context] in
            if let arrived, let onArrival = context.onArrival { await onArrival(arrived) }
            await context.onChanged()
        }.value
        context.endOperation(); busy = false
    }
    private func show(_ report: TetherLookRecoveryCoordinator.Report, append: Bool) {
        let next = report.items.map { item in
            Row(id: "\(item.stage)-\(item.id)", recordID: item.id,
                stage: String(describing: item.stage), status: String(describing: item.status), detail: item.detail,
                retryAllowed: { if case .explicitRetryRequired = item.status { return true }; return false }())
        }
        rows = append ? rows + next : next
        receiptOffset = report.nextReceiptOffset; jobOffset = report.nextJobOffset
        canLoadNextPage = report.limitReached
        if let worker = report.worker { showWorker(worker) }
        if let failure = report.queueReadFailure { workerSummary = "台帳読取失敗：" + failure }
        if report.cancelled { status = "中止。既に確定した処理は保持されます。" }
    }
    private func showWorker(_ report: TetherLookLocalWorker.Report) {
        workerSummary = "今回の保存完了 \(report.completed.count) 件"
        if let id = report.blockedJobID { workerSummary += " / 保留 \(id.uuidString)" }
        if let reason = report.reason { workerSummary += " / \(reason)" }
        if report.cancelled { workerSummary += " / 中止（確定済みは保持）" }
        if report.limitReached { workerSummary += " / 1回の処理上限。明示再開で続行可能" }
    }
    nonisolated private static func readSession(_ url: URL) throws -> Data {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard url.isFileURL, url.standardizedFileURL == url.resolvingSymlinksInPath() else { throw CocoaError(.fileReadInvalidFileName) }
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw CocoaError(.fileReadNoPermission) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
              info.st_size > 0, info.st_size <= 4 * 1024 * 1024 else { throw CocoaError(.fileReadTooLarge) }
        let bytes = try handle.read(upToCount: 4 * 1024 * 1024 + 1) ?? Data()
        guard bytes.count == Int(info.st_size) else { throw CocoaError(.fileReadCorruptFile) }
        return bytes
    }
}
