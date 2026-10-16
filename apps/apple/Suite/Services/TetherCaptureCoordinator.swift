import Foundation
import SuiteCore

/// Correlation/ingest handoff only: no camera SDK, inference or retouch worker.
/// All injected stores/pipeline must belong to the same app-owned root. The host
/// must serialize editing/queue workers with initial arrival registration.
actor TetherCaptureCoordinator {
    enum CoordinatorError: Error {
        case busy, missingCapture, conflictingCapture, missingReceipt, unsupportedReceiptState
        case projectConflict, queueConflict, invalidProxySize
        case correlationStoreRequired, correlationNotPersisted
        case handoffFailed(receiptID: UUID, durableQueueID: UUID?, retryStateFailed: Bool, cause: String)
    }
    /// Host has independently established final-original choice and exact camera
    /// correlation. Do not send preview, provisional JPEG and RAW for one capture.
    /// Automatic JPEG/RAW pairing or replacement is not implemented here.
    enum ArrivalRole: Sendable { case confirmedFinalOriginal }
    struct Delivery: Sendable {
        let receiptID: UUID
        let assetID: UUID
        let queueID: UUID
        /// Means ingest/queue handoff only, not rendering, cloud sync or SDK readiness.
        let handoffAcknowledged: Bool
    }
    private let queue: TetherLookQueueStore
    private let ingest: TetherIngestStore
    private let projects: ProjectStore
    private let pipeline: PhotoPipeline
    private let correlations: CaptureAssetCorrelationStore?
    private var working = false

    init(queue: TetherLookQueueStore, ingest: TetherIngestStore,
         projects: ProjectStore, pipeline: PhotoPipeline, correlations: CaptureAssetCorrelationStore? = nil) {
        self.queue = queue; self.ingest = ingest; self.projects = projects; self.pipeline = pipeline
        self.correlations = correlations
    }

    /// Only after this returns may the host dispatch capture/acquisition with it.
    /// A reused ID returns the durable snapshot, never the current changed Look.
    func beginCapture(id: UUID = UUID()) async throws -> CaptureContext {
        try await queue.beginCapture(id: id)
    }

    /// Host must persist the explicit correlation ledger before invoking this.
    /// Preview/JPEG notifications are never paired by name or arrival timestamp.
    func receiveCorrelatedOriginal(downloadedFile: URL, capture: CaptureContext,
                                   proxyLongEdge: Int) async throws -> Delivery {
        guard let correlations else { throw CoordinatorError.correlationStoreRequired }
        let saved = try await correlations.snapshot()
        return try await receiveCorrelatedOriginal(downloadedFile: downloadedFile, capture: capture,
                                                    correlation: saved, proxyLongEdge: proxyLongEdge)
    }

    /// Compatibility entry: an in-memory value alone no longer authorizes ingest.
    func receiveCorrelatedOriginal(downloadedFile: URL, capture: CaptureContext,
                                   correlation: CaptureAssetCorrelation,
                                   proxyLongEdge: Int) async throws -> Delivery {
        try correlation.validate()
        guard let correlations else { throw CoordinatorError.correlationStoreRequired }
        let saved = try await correlations.snapshot()
        guard let supplied = correlation.captures.first(where: { $0.contextID == capture.id }),
              saved.captures.first(where: { $0.contextID == capture.id }) == supplied else {
            throw CoordinatorError.correlationNotPersisted
        }
        guard let row = correlation.captures.first(where: { $0.contextID == capture.id }),
              let selected = row.finalReceiptID,
              let member = row.members.first(where: { $0.receiptID == selected }),
              member.role != .preview else { throw CoordinatorError.missingReceipt }
        // This receipt key is stable across redelivery of the selected member.
        // receiveOriginal verifies the actual bytes against the declared digest.
        return try await receiveOriginal(downloadedFile: downloadedFile,
            cameraReceiptKey: "correlated-v1:\(capture.id.uuidString):\(selected.uuidString)",
            expectedBytes: member.byteCount, expectedSHA256: member.sha256, capture: capture,
            role: .confirmedFinalOriginal, proxyLongEdge: proxyLongEdge)
    }

    func receiveOriginal(downloadedFile: URL, cameraReceiptKey: String, expectedBytes: UInt64,
                         expectedSHA256: String? = nil, capture: CaptureContext,
                         role: ArrivalRole, proxyLongEdge: Int) async throws -> Delivery {
        guard !working else { throw CoordinatorError.busy }
        working = true; defer { working = false }
        try validateProxyEdge(proxyLongEdge)
        try await validateCapture(capture)
        try Task.checkCancellation()
        let receipt = try await ingest.receive(downloadedFile: downloadedFile, cameraReceiptKey: cameraReceiptKey,
                                               expectedBytes: expectedBytes, expectedSHA256: expectedSHA256,
                                               capture: capture)
        // Once receive committed, cancellation leaves its durable receipt/original
        // available to resume. Never remove either to pretend the receive failed.
        return try await handoff(receiptID: receipt.id, proxyLongEdge: proxyLongEdge)
    }

    /// Resume only this persisted receipt. A nil/unknown context is a visible
    /// blocker; session current Look, arrival order and filenames are never guesses.
    func resume(receiptID: UUID, proxyLongEdge: Int) async throws -> Delivery {
        guard !working else { throw CoordinatorError.busy }
        working = true; defer { working = false }
        try validateProxyEdge(proxyLongEdge)
        return try await handoff(receiptID: receiptID, proxyLongEdge: proxyLongEdge)
    }

    private func handoff(receiptID: UUID, proxyLongEdge: Int) async throws -> Delivery {
        guard var row = await ingest.receipts().first(where: { $0.id == receiptID }) else {
            throw CoordinatorError.missingReceipt
        }
        guard let capture = row.capture else { throw CoordinatorError.missingCapture }
        try await validateCapture(capture)
        if row.state == .prepared { row = try await ingest.recoverPrepared(receiptID: receiptID) }
        if row.state == .handedOff {
            let snapshot = try await queue.snapshot()
            guard let job = snapshot.jobs.first(where: { $0.ingestReceiptIDs.contains(receiptID) }),
                  job.id.uuidString == row.downstreamQueueID else { throw CoordinatorError.queueConflict }
            try validate(job: job, row: row, capture: capture)
            // An ingest acknowledgement alone is not a surviving project. Never
            // recreate or overwrite an edited checkpoint to repair this case.
            guard let saved = try await projects.load(id: row.assetID),
                  saved.asset.id == row.assetID,
                  saved.asset.sha256.lowercased() == row.sha256?.lowercased(),
                  saved.asset.originalRelativePath == row.relativePath,
                  saved.asset.originalFilename == row.originalFilename else {
                throw CoordinatorError.projectConflict
            }
            return Delivery(receiptID: receiptID, assetID: row.assetID, queueID: job.id, handoffAcknowledged: true)
        }
        // Copy-interrupted needs source receive again; a live handingOff lease is
        // not stolen. On app restart ingest itself recovers it to stored.
        guard row.state == .stored else { throw CoordinatorError.unsupportedReceiptState }
        try Task.checkCancellation()
        let handoff = try await ingest.beginHandoff(receiptID: receiptID)
        var durableQueueID: UUID?
        do {
            guard handoff.capture == capture else { throw CoordinatorError.conflictingCapture }
            try await validateCapture(capture)
            let snapshot = try await queue.snapshot()
            if let existing = snapshot.jobs.first(where: { $0.ingestReceiptIDs.contains(receiptID) }) {
                // Crash after durable enqueue but before ingest ack: do not enqueue
                // again, or replace the already-running job's original checkpoint.
                try validate(job: existing, row: row, capture: capture)
                guard let saved = try await projects.load(id: handoff.asset.id), sameOriginal(saved.asset, handoff.asset) else {
                    throw CoordinatorError.projectConflict
                }
                durableQueueID = existing.id
            } else {
                let checkpoint: ProjectCheckpoint
                if let saved = try await projects.load(id: handoff.asset.id) {
                    try requireUnedited(saved, asset: handoff.asset)
                    checkpoint = saved
                } else {
                    let initial = ProjectCheckpoint(asset: handoff.asset, history: EditHistory(), revision: 0)
                    try await projects.save(initial, expectedRevision: nil)
                    checkpoint = initial
                }
                // Reuse the committed original, not importFile (which duplicates it).
                _ = try await pipeline.generateProxyForStoredAsset(asset: checkpoint.asset, proxyLongEdge: proxyLongEdge)
                try Task.checkCancellation()
                guard let saved = try await projects.load(id: handoff.asset.id), saved == checkpoint else {
                    throw CoordinatorError.projectConflict
                }
                try requireUnedited(saved, asset: handoff.asset)
                durableQueueID = try await queue.enqueueArrival(checkpoint: saved, receiptID: receiptID, capture: capture)
            }
            guard let queueID = durableQueueID else { throw CoordinatorError.queueConflict }
            // No post-enqueue cancellation throw: finish the acknowledgement if
            // possible. Its failure leaves the queue intact for exact-ID recovery.
            try await ingest.acknowledgeHandoff(receiptID: receiptID, lease: handoff.lease,
                                                persistedQueueID: queueID.uuidString)
            return Delivery(receiptID: receiptID, assetID: handoff.asset.id, queueID: queueID, handoffAcknowledged: true)
        } catch {
            var retryFailed = false
            do { try await ingest.retryHandoff(receiptID: receiptID, lease: handoff.lease) }
            catch { retryFailed = true }
            throw CoordinatorError.handoffFailed(receiptID: receiptID, durableQueueID: durableQueueID,
                                                retryStateFailed: retryFailed, cause: String(describing: error))
        }
    }

    private func validateCapture(_ capture: CaptureContext) async throws {
        try capture.validate()
        guard try await queue.capture(id: capture.id) == capture else { throw CoordinatorError.conflictingCapture }
    }

    private func validate(job: TetherLookQueue.Job, row: TetherIngestStore.Receipt,
                          capture: CaptureContext) throws {
        guard job.binding.assetID == row.assetID,
              job.binding.originalSHA256.lowercased() == row.sha256?.lowercased(),
              job.binding.captureID == capture.id,
              job.frozenSession.captureContexts.contains(capture) else { throw CoordinatorError.queueConflict }
    }

    private func requireUnedited(_ saved: ProjectCheckpoint, asset: AssetRecord) throws {
        try saved.validate()
        guard sameOriginal(saved.asset, asset), saved.revision == 0,
              saved.history.entries.count == 1, saved.history.cursor == 0,
              saved.history.current == RecipeParameters() else { throw CoordinatorError.projectConflict }
    }

    private func sameOriginal(_ a: AssetRecord, _ b: AssetRecord) -> Bool {
        // Ingest's Handoff currently creates a fresh createdAt on every delivery.
        // Keep ProjectStore's original timestamp; never rewrite its AssetRecord.
        a.id == b.id && a.sha256.lowercased() == b.sha256.lowercased()
            && a.originalRelativePath == b.originalRelativePath && a.originalFilename == b.originalFilename
    }

    private func validateProxyEdge(_ edge: Int) throws {
        guard edge > 0, edge <= 16_384 else { throw CoordinatorError.invalidProxySize }
    }
}
