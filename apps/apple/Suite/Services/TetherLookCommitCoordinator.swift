import Foundation
import CryptoKit
import SuiteCore

/// Commit-only coordinator, used by the separate local analysis/render worker.
/// HOST CONTRACT: while this owner is active, all queue pause/control/close and
/// commit writes MUST be routed through one coordinator. Actor snapshots cannot
/// atomically fence a different actor between snapshot and ProjectStore save.
/// ProjectStore CAS protects unrelated edits; it is not a cross-process lock.
/// Renderer-owned artifacts must remain immutable until commit/reconciliation.
actor TetherLookCommitCoordinator {
    enum CommitError: Error { case busy, invalidWork, staleLease, invalidArtifact, resourceLimit }
    enum Outcome: Sendable {
        case committed(TetherLookQueue.CommitReceipt)
        case reconciled(TetherLookQueue.CommitReceipt)
        /// Durable state must be queried; never blind retry or confirmNotCommitted.
        case reconciliationRequired
    }
    private let root: URL
    private let projects: ProjectStore
    private let queue: TetherLookQueueStore
    private let maximumArtifactBytes: UInt64
    private var active = false

    init(root: URL, projects: ProjectStore, queue: TetherLookQueueStore,
         maximumArtifactBytes: UInt64 = 256 * 1024 * 1024) throws {
        guard root.isFileURL, maximumArtifactBytes > 0 else { throw CommitError.invalidArtifact }
        self.root = root.standardizedFileURL.resolvingSymlinksInPath()
        self.projects = projects; self.queue = queue
        self.maximumArtifactBytes = maximumArtifactBytes
    }

    /// Artifact.reference must name an existing relative file under TetherArtifacts.
    /// The renderer supplies the candidate checkpoint and meaningful artifact;
    /// this layer proves byte/binding integrity, not that a fake image is genuine.
    func commit(work: TetherLookQueue.Work, checkpoint: ProjectCheckpoint) async throws -> Outcome {
        guard !active else { throw CommitError.busy }
        active = true; defer { active = false }
        guard case .commit = work.kind else { throw CommitError.invalidWork }
        if Task.isCancelled {
            await markUncertain(work)
            return .reconciliationRequired
        }
        try checkpoint.validate()
        guard checkpoint.asset.id == work.binding.assetID,
              checkpoint.asset.sha256.lowercased() == work.binding.originalSHA256.lowercased(),
              work.binding.inputRecipeRevision < Int.max,
              checkpoint.revision == work.binding.inputRecipeRevision + 1,
              let artifact = work.artifact, let analysis = work.analysis,
              artifact.analysisID == analysis.id,
              analysis.assetID == checkpoint.asset.id,
              analysis.originalSHA256.lowercased() == checkpoint.asset.sha256.lowercased(),
              work.plan.binding == work.binding,
              work.plan.lookSnapshot.id == work.binding.lookID,
              work.plan.lookSnapshot.revision == work.binding.lookRevision,
              work.plan.state == .readyForAdapter else { throw CommitError.invalidWork }
        do {
            _ = try await validJob(work)
            if let previous = try await projects.tetherCommit(assetID: checkpoint.asset.id, jobID: work.jobID) {
                // A previous durable commit is never overwritten by another candidate.
                // Require the entire candidate checkpoint to match the saved output;
                // job identity alone does not make a different payload an exact retry.
                try await projects.saveTetherCommit(checkpoint,
                    expectedRevision: work.binding.inputRecipeRevision, receipt: previous)
                return await reconcileKnown(work: work, receipt: previous)
            }
            try verifyArtifact(artifact)
            _ = try await validJob(work)
            try Task.checkCancellation()
            let receipt = TetherLookQueue.CommitReceipt(commitID: UUID(), jobID: work.jobID,
                assetID: checkpoint.asset.id, originalSHA256: checkpoint.asset.sha256,
                inputRecipeRevision: work.binding.inputRecipeRevision, outputRecipeRevision: checkpoint.revision,
                lookID: work.binding.lookID, lookRevision: work.binding.lookRevision,
                artifactSHA256: artifact.sha256)
            try await projects.saveTetherCommit(checkpoint, expectedRevision: work.binding.inputRecipeRevision,
                                                receipt: receipt)
            // Cancellation or lease revocation after save cannot undo its receipt.
            // Acknowledge only a still-current lease, otherwise reconcile explicitly.
            _ = try await validJob(work)
            try await queue.acknowledgeCommit(jobID: work.jobID, leaseID: work.leaseID, receipt: receipt)
            return .committed(receipt)
        } catch {
            await markUncertain(work)
            return .reconciliationRequired
        }
    }

    /// Restart path: only the real commit store can provide completion evidence.
    /// An absent record is not proof a previously running writer cannot commit.
    func reconcile(jobID: UUID, assetID: UUID) async throws -> Outcome {
        guard !active else { throw CommitError.busy }
        active = true; defer { active = false }
        let snapshot = try await queue.snapshot()
        guard let job = snapshot.jobs.first(where: { $0.id == jobID }),
              job.binding.assetID == assetID else { throw CommitError.invalidWork }
        guard let receipt = try await projects.tetherCommit(assetID: assetID, jobID: jobID) else {
            return .reconciliationRequired
        }
        if job.phase == .completed {
            guard job.receipt == receipt else { throw CommitError.invalidWork }
            return .reconciled(receipt)
        }
        guard job.phase == .reconciliationRequired else { throw CommitError.staleLease }
        try await queue.reconcile(jobID: jobID, committed: receipt)
        return .reconciled(receipt)
    }

    func pause() async throws {
        guard !active else { throw CommitError.busy }
        active = true; defer { active = false }
        try await queue.pause()
    }
    func resume() async throws {
        guard !active else { throw CommitError.busy }
        active = true; defer { active = false }
        try await queue.resume()
    }
    func setControls(_ controls: SessionApplyControls) async throws {
        guard !active else { throw CommitError.busy }
        active = true; defer { active = false }
        try await queue.setControls(controls)
    }
    func close() async throws {
        guard !active else { throw CommitError.busy }
        active = true; defer { active = false }
        try await queue.close()
    }

    private func validJob(_ work: TetherLookQueue.Work) async throws -> TetherLookQueue.Job {
        let snapshot = try await queue.snapshot()
        guard !snapshot.paused, snapshot.session.controls.autoApply,
              let job = snapshot.jobs.first(where: { $0.id == work.jobID }),
              job.phase == .committing, job.leaseID == work.leaseID,
              job.binding == work.binding, job.analysis == work.analysis, job.artifact == work.artifact,
              job.frozenSession.lookRevisions.contains(work.plan.lookSnapshot) else { throw CommitError.staleLease }
        return job
    }

    private func markUncertain(_ work: TetherLookQueue.Work) async {
        let store = queue
        // Recovery must not inherit the caller's cancellation. If persistence is
        // poisoned, reopening the queue recovers the outstanding committing lease.
        await Task.detached {
            try? await store.fail(jobID: work.jobID, leaseID: work.leaseID,
                                  reason: "commit-outcome-requires-durable-reconciliation")
        }.value
    }
    private func reconcileKnown(work: TetherLookQueue.Work,
                                receipt: TetherLookQueue.CommitReceipt) async -> Outcome {
        await markUncertain(work)
        do {
            try await queue.reconcile(jobID: work.jobID, committed: receipt)
            return .reconciled(receipt)
        } catch { return .reconciliationRequired }
    }

    private func verifyArtifact(_ artifact: TetherLookQueue.Artifact) throws {
        let reference = artifact.reference
        guard reference.hasPrefix("TetherArtifacts/"), !reference.contains("\\"),
              !reference.split(separator: "/", omittingEmptySubsequences: false).contains(where: {
                  $0.isEmpty || $0 == "." || $0 == ".."
              }) else { throw CommitError.invalidArtifact }
        let directory = root.appendingPathComponent("TetherArtifacts", isDirectory: true)
        let url = root.appendingPathComponent(reference).standardizedFileURL
        guard url.path.hasPrefix(directory.path + "/"), url.resolvingSymlinksInPath() == url else {
            throw CommitError.invalidArtifact
        }
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true,
              let size = values.fileSize, size > 0, UInt64(size) <= maximumArtifactBytes else {
            throw CommitError.resourceLimit
        }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hash = SHA256(), count: UInt64 = 0
        while let bytes = try handle.read(upToCount: 1024 * 1024), !bytes.isEmpty {
            try Task.checkCancellation()
            guard UInt64(bytes.count) <= maximumArtifactBytes - count else { throw CommitError.resourceLimit }
            count += UInt64(bytes.count); hash.update(data: bytes)
        }
        let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
        guard count == UInt64(size), digest == artifact.sha256.lowercased() else { throw CommitError.invalidArtifact }
    }
}
