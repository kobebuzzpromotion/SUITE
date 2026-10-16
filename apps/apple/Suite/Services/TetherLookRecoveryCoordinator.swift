import Foundation
import SuiteCore

/// Host-invoked recovery with an optional bounded local worker, not SDK transport. Inject
/// the same app-root stores/coordinators and serialize other capture/commit hosts
/// for this batch. No active lease is stolen and no missing context is guessed.
actor TetherLookRecoveryCoordinator {
    enum RecoveryError: Error { case busy, invalidLimit }
    enum Stage: Sendable { case ingest, commit, queue }
    enum Status: Sendable {
        case handoffAcknowledged, commitReconciled, alreadyCompleted, skipped
        case unknownCapture, sourceRedeliveryRequired, activeLease
        case workerRequired, explicitRetryRequired, reconciliationRequired, conflict
    }
    struct Item: Sendable {
        let id: UUID
        let stage: Stage
        let status: Status
        let detail: String?
    }
    struct Report: Sendable {
        var items: [Item] = []
        var cancelled = false
        var limitReached = false
        var queueReadFailure: String?
        var nextReceiptOffset = 0
        var nextJobOffset = 0
        /// Worker presence is not evidence that every control or picture rendered.
        var automaticWorkerImplemented = false
        var worker: TetherLookLocalWorker.Report?
    }
    private let ingest: TetherIngestStore
    private let queue: TetherLookQueueStore
    private let capture: TetherCaptureCoordinator
    private let commit: TetherLookCommitCoordinator
    private let worker: TetherLookLocalWorker?
    private var active = false

    init(ingest: TetherIngestStore, queue: TetherLookQueueStore,
         capture: TetherCaptureCoordinator, commit: TetherLookCommitCoordinator,
         worker: TetherLookLocalWorker? = nil) {
        self.ingest = ingest; self.queue = queue; self.capture = capture; self.commit = commit
        self.worker = worker
    }

    /// Returns partial progress on cancellation or per-record failure. Completed
    /// durable writes remain committed. Repeat calls use the existing receipt IDs.
    /// Offsets page a host-quiesced ledger. Restart at zero after any outside
    /// structural change; receipt/job operations themselves remain idempotent.
    func recover(proxyLongEdge: Int, maximumItems: Int = 512,
                 receiptOffset: Int = 0, jobOffset: Int = 0) async throws -> Report {
        guard !active else { throw RecoveryError.busy }
        guard (1...4096).contains(maximumItems), (1...16_384).contains(proxyLongEdge),
              receiptOffset >= 0, jobOffset >= 0 else {
            throw RecoveryError.invalidLimit
        }
        active = true; defer { active = false }
        var report = Report()
        report.automaticWorkerImplemented = worker != nil
        report.nextReceiptOffset = receiptOffset; report.nextJobOffset = jobOffset
        let receipts = await ingest.receipts()
        for (index, receipt) in receipts.enumerated().dropFirst(receiptOffset) {
            if Task.isCancelled { report.cancelled = true; return report }
            if report.items.count >= maximumItems { report.limitReached = true; return report }
            var status: Status
            var detail: String?
            if receipt.capture == nil {
                status = .unknownCapture
            } else {
                switch receipt.state {
                case .copying, .handingOff: status = .activeLease
                case .interrupted: status = .sourceRedeliveryRequired
                case .prepared, .stored, .handedOff:
                    do {
                        _ = try await capture.resume(receiptID: receipt.id, proxyLongEdge: proxyLongEdge)
                        status = .handoffAcknowledged
                    } catch {
                        status = .conflict
                        detail = String(String(describing: error).prefix(1024))
                    }
                }
            }
            report.items.append(Item(id: receipt.id, stage: .ingest, status: status, detail: detail))
            report.nextReceiptOffset = index + 1
        }
        if Task.isCancelled { report.cancelled = true; return report }
        let snapshot: TetherLookQueue
        do { snapshot = try await queue.snapshot() }
        catch {
            report.queueReadFailure = String(String(describing: error).prefix(1024))
            return report
        }
        for (index, job) in snapshot.jobs.enumerated().dropFirst(jobOffset) {
            if Task.isCancelled { report.cancelled = true; return report }
            if report.items.count >= maximumItems { report.limitReached = true; return report }
            var status: Status
            var detail: String?
            var stage: Stage = .queue
            if job.leaseID != nil {
                status = .activeLease
            } else {
                switch job.phase {
                case .reconciliationRequired:
                    stage = .commit
                    do {
                        switch try await commit.reconcile(jobID: job.id, assetID: job.binding.assetID) {
                        case .committed, .reconciled: status = .commitReconciled
                        case .reconciliationRequired: status = .reconciliationRequired
                        }
                    } catch {
                        status = .conflict
                        detail = String(String(describing: error).prefix(1024))
                    }
                case .completed: status = .alreadyCompleted
                case .skipped: status = .skipped
                case .failed: status = .explicitRetryRequired
                case .pending, .rendered: status = .workerRequired
                case .analyzing, .rendering, .committing: status = .activeLease
                }
            }
            report.items.append(Item(id: job.id, stage: stage, status: status, detail: detail))
            report.nextJobOffset = index + 1
        }
        // Reconcile durable commits BEFORE invoking fresh analysis/render work.
        // A missing model, stale identity input, or worker I/O failure must not
        // prevent recognition of an already committed checkpoint after restart.
        // On paginated calls the host finishes the ledger scan first; no work is
        // started by an incomplete scan. Reopening remains paused by the store.
        if !Task.isCancelled, let worker {
            do {
                report.worker = try await worker.run(maximumOperations: min(3072, maximumItems * 3))
            } catch {
                report.worker = .init(reason: "worker-paused: " + String(String(describing: error).prefix(1024)),
                                      cancelled: Task.isCancelled)
            }
        }
        report.cancelled = Task.isCancelled
        return report
    }
}
