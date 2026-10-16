import Foundation
import SuiteCore

/// Local composition root. The supplied shared ProjectStore and PhotoPipeline
/// MUST use this same app-private root. The editor must serialize its own writes
/// with arrival registration; ProjectStore CAS still rejects unrelated edits.
/// No SDK events, camera IDs, downloaded bytes or identity evidence are fabricated.
actor TetherLocalSessionHost {
    enum HostError: Error { case busy, missingCapture }
    private let correlations: CaptureAssetCorrelationStore
    private let ingest: TetherIngestStore
    private let queue: TetherLookQueueStore
    private let capture: TetherCaptureCoordinator
    private let commit: TetherLookCommitCoordinator
    private let recovery: TetherLookRecoveryCoordinator
    private let worker: TetherLookLocalWorker
    private let localAnalysis: TetherLocalAnalysisAdapter
    private(set) var lastWorkerReport: TetherLookLocalWorker.Report?
    private var active = false

    struct ArrivalStatus: Sendable, Identifiable {
        let id: UUID
        let label: String
        let finalSelected: Bool
        let assetID: UUID?
    }

    /// A quiescent snapshot of durable facts, not camera polling or inferred identity.
    func arrivalStatuses() async throws -> [ArrivalStatus] {
        try enter(); defer { active = false }
        let state = try await queue.snapshot()
        let correlated = try await correlations.snapshot()
        return state.session.captureContexts.map { context in
            let member = correlated.captures.first { $0.contextID == context.id }
            let job = state.jobs.first { $0.binding.captureID == context.id }
            let label: String
            if member?.finalReceiptID == nil { label = "原本未確定（RAW/JPEGの明示選択待ち）" }
            else if let job {
                switch job.phase {
                case .analyzing: label = "解析中"
                case .rendering, .rendered: label = "補正・描画中／保存待ち"
                case .committing, .reconciliationRequired: label = "保存結果を照合中"
                case .completed: label = "保存済み"
                case .skipped: label = "明示スキップ"
                case .pending, .failed:
                    if lastWorkerReport?.blockedJobID == job.id,
                       lastWorkerReport?.reason == "fresh-photo-evidence-consent-and-explicit-values-required" {
                        label = "人物・解析入力保留（本人確定／同意／明示値の確認が必要）"
                    } else { label = "処理待ち／保留：" + (job.reason ?? "解析入力を確認してください") }
                }
            } else { label = "原本確定・ローカル受信待ち" }
            return ArrivalStatus(id: context.id, label: label,
                finalSelected: member?.finalReceiptID != nil, assetID: job?.binding.assetID)
        }
    }

    struct Opening: Sendable {
        let host: TetherLocalSessionHost
        let recoveryReport: TetherLookRecoveryCoordinator.Report
    }

    /// The integration host uses this on reopening a session before accepting
    /// camera arrivals. Recovery is bounded and its unresolved/page state is
    /// returned explicitly; opening does not claim pending photos were rendered.
    static func openAndRecover(root: URL, initialSession: TetherSessionState,
                               projects: ProjectStore, pipeline: PhotoPipeline,
                               proxyLongEdge: Int, maximumItems: Int = 512,
                               faceAnalysis: LocalFaceAnalysisService? = nil) async throws -> Opening {
        try Task.checkCancellation()
        let host = try TetherLocalSessionHost(root: root, initialSession: initialSession,
                                             projects: projects, pipeline: pipeline, faceAnalysis: faceAnalysis)
        let report = try await host.recover(proxyLongEdge: proxyLongEdge, maximumItems: maximumItems)
        return Opening(host: host, recoveryReport: report)
    }

    init(root: URL, initialSession: TetherSessionState,
         projects: ProjectStore, pipeline: PhotoPipeline,
         faceAnalysis: LocalFaceAnalysisService? = nil) throws {
        let correlations = try CaptureAssetCorrelationStore(root: root)
        let ingest = try TetherIngestStore(root: root)
        let queue = try TetherLookQueueStore(root: root, initialSession: initialSession)
        let capture = TetherCaptureCoordinator(queue: queue, ingest: ingest, projects: projects,
                                               pipeline: pipeline, correlations: correlations)
        let commit = try TetherLookCommitCoordinator(root: root, projects: projects, queue: queue)
        let worker = try TetherLookLocalWorker(root: root, projects: projects, pipeline: pipeline,
            queue: queue, commit: commit, faceAnalysis: faceAnalysis)
        self.correlations = correlations; self.ingest = ingest; self.queue = queue
        self.capture = capture; self.commit = commit
        self.worker = worker
        localAnalysis = try TetherLocalAnalysisAdapter(root: root, projects: projects, pipeline: pipeline)
        recovery = TetherLookRecoveryCoordinator(ingest: ingest, queue: queue, capture: capture,
                                                 commit: commit, worker: worker)
    }

    /// Caller keeps the same ID on retry. Dispatch the external acquisition only
    /// after return: both the frozen Look and explicit camera key are durable.
    /// If the second write fails, the first is retained and the same ID can retry.
    func beginCapture(id: UUID, key: CaptureAssetCorrelation.Key) async throws -> CaptureContext {
        try enter(); defer { active = false }
        try key.validate()
        let ledger = try await correlations.snapshot()
        if let existing = ledger.captures.first(where: { $0.contextID == id || $0.key == key }) {
            guard existing.contextID == id, existing.key == key else {
                throw CaptureAssetCorrelation.Failure.conflict
            }
        }
        let context = try await capture.beginCapture(id: id)
        try await correlations.bind(contextID: context.id, key: key)
        return context
    }

    /// SDK/host supplies actual received-byte SHA and size, not provisional IDs.
    /// Final ingest independently verifies downloaded bytes against this record.
    func recordMember(contextID: UUID, key: CaptureAssetCorrelation.Key,
                      member: CaptureAssetCorrelation.Member) async throws {
        try enter(); defer { active = false }
        guard try await queue.capture(id: contextID) != nil else { throw HostError.missingCapture }
        try await correlations.record(contextID: contextID, key: key, member: member)
    }

    /// Explicit JPEG or RAW choice is persisted before return and cannot later be
    /// replaced by another member. Preview is rejected by the shared core contract.
    @discardableResult
    func selectFinal(contextID: UUID, receiptID: UUID) async throws -> CaptureAssetCorrelation.Member {
        try enter(); defer { active = false }
        guard try await queue.capture(id: contextID) != nil else { throw HostError.missingCapture }
        return try await correlations.selectFinal(contextID: contextID, receiptID: receiptID)
    }

    /// Resubmission reads the durable selection after restart; no in-memory ledger
    /// is accepted. Delivery acknowledges ingest; lastWorkerReport separately
    /// reports actual processing or a block and must not be conflated with it.
    func receiveSelectedOriginal(downloadedFile: URL, contextID: UUID,
                                 proxyLongEdge: Int) async throws -> TetherCaptureCoordinator.Delivery {
        try enter(); defer { active = false }
        guard let context = try await queue.capture(id: contextID) else { throw HostError.missingCapture }
        let delivery = try await capture.receiveCorrelatedOriginal(downloadedFile: downloadedFile,
                                                            capture: context, proxyLongEdge: proxyLongEdge)
        // Ingest success remains distinct from processing success. Do not make
        // the camera re-send an already-durable arrival when the worker blocks.
        do { lastWorkerReport = try await worker.run() }
        catch { lastWorkerReport = .init(blockedJobID: nil, reason: String(describing: error), cancelled: Task.isCancelled) }
        return delivery
    }

    /// Page offsets belong to a quiescent ledger; restart at zero after new arrivals.
    /// Cancellation returns partial progress and never undoes a durable handoff.
    func recover(proxyLongEdge: Int, maximumItems: Int = 512, receiptOffset: Int = 0,
                 jobOffset: Int = 0) async throws -> TetherLookRecoveryCoordinator.Report {
        try enter(); defer { active = false }
        return try await recovery.recover(proxyLongEdge: proxyLongEdge, maximumItems: maximumItems,
                                          receiptOffset: receiptOffset, jobOffset: jobOffset)
    }

    func updateLook(_ look: SessionLook, expectedRevision: Int) async throws {
        try enter(); defer { active = false }
        try await queue.updateLook(look, expectedRevision: expectedRevision)
    }
    func setControls(_ controls: SessionApplyControls) async throws {
        try enter(); defer { active = false }
        try await commit.setControls(controls)
    }
    func pause() async throws {
        try enter(); defer { active = false }
        try await commit.pause()
    }
    func resume() async throws {
        try enter(); defer { active = false }
        try await commit.resume()
    }
    /// Explicit current-photo evidence and consent, not a camera callback guess.
    func setWorkerInput(_ input: TetherLookLocalWorker.Input?, jobID: UUID) async throws {
        try enter(); defer { active = false }
        try await worker.setInput(input, jobID: jobID)
    }
    /// Explicit settings + already confirmed identities; never assigns a new face.
    func prepareWorkerInput(_ configuration: TetherLocalAnalysisAdapter.Configuration) async throws -> [TetherLocalAnalysisAdapter.Measurement] {
        try enter(); defer { active = false }
        let snapshot = try await queue.snapshot()
        guard let job = snapshot.jobs.first(where: { $0.id == configuration.jobID }), job.leaseID == nil,
              job.phase != .completed, job.phase != .skipped, job.phase != .reconciliationRequired else { throw TetherLookLocalWorker.Failure.staleInput }
        let result = try await localAnalysis.prepare(job: job, configuration: configuration)
        let current = try await queue.snapshot()
        guard let latest = current.jobs.first(where: { $0.id == job.id }), latest == job else { throw TetherLookLocalWorker.Failure.staleInput }
        try Task.checkCancellation()
        try await worker.setInput(result.input, jobID: job.id, analysis: result.analysis)
        return result.measurements
    }
    func retryWorkerJob(jobID: UUID, discardAnalysis: Bool = false) async throws {
        try enter(); defer { active = false }
        try await queue.retry(jobID: jobID, discardAnalysis: discardAnalysis)
    }
    @discardableResult
    func processPending(maximumOperations: Int = 96) async throws -> TetherLookLocalWorker.Report {
        try enter(); defer { active = false }
        let report = try await worker.run(maximumOperations: maximumOperations)
        lastWorkerReport = report
        return report
    }
    private func enter() throws {
        guard !active else { throw HostError.busy }
        try Task.checkCancellation()
        active = true
    }
}
