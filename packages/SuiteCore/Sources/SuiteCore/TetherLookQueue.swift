import Foundation

/// Durable *state*, not a camera, analyser, renderer or database commit. Host
/// persists each transition before executing Work or acknowledging ingest.
public struct TetherLookQueue: Codable, Equatable, Sendable {
    public enum Phase: String, Codable, Sendable {
        case pending, analyzing, rendering, rendered, committing
        case failed, reconciliationRequired, skipped, completed
    }
    public enum QueueError: Error, Equatable, Sendable {
        case capacity, conflictingArrival, invalidState, staleLease, attemptsExhausted
        case evidenceMismatch, commitReconciliationRequired, explicitActionRequired
    }
    public struct Artifact: Codable, Equatable, Sendable {
        public let reference: String
        public let sha256: String
        public let analysisID: UUID
        public init(reference: String, sha256: String, analysisID: UUID) {
            self.reference = reference; self.sha256 = sha256; self.analysisID = analysisID
        }
    }
    /// Actual persisted output receipt, supplied by the committing adapter.
    /// Queue validates bindings; it cannot authenticate a host's evidence.
    public struct CommitReceipt: Codable, Equatable, Sendable {
        public let commitID: UUID
        public let jobID: UUID
        public let assetID: UUID
        public let originalSHA256: String
        public let inputRecipeRevision: Int
        public let outputRecipeRevision: Int
        public let lookID: UUID
        public let lookRevision: Int
        public let artifactSHA256: String
        public init(commitID: UUID, jobID: UUID, assetID: UUID, originalSHA256: String,
                    inputRecipeRevision: Int, outputRecipeRevision: Int,
                    lookID: UUID, lookRevision: Int, artifactSHA256: String) {
            self.commitID = commitID; self.jobID = jobID; self.assetID = assetID
            self.originalSHA256 = originalSHA256; self.inputRecipeRevision = inputRecipeRevision
            self.outputRecipeRevision = outputRecipeRevision; self.lookID = lookID
            self.lookRevision = lookRevision; self.artifactSHA256 = artifactSHA256
        }
    }
    public struct Job: Codable, Equatable, Sendable, Identifiable {
        public let id: UUID
        public let sequence: Int
        public fileprivate(set) var ingestReceiptIDs: Set<UUID>
        /// Minimal per-arrival session: one Look revision, one photo binding.
        public let frozenSession: TetherSessionState
        public var binding: SessionImageBinding { frozenSession.bindings[0] }
        public fileprivate(set) var phase: Phase
        public fileprivate(set) var leaseID: UUID?
        public fileprivate(set) var attempts: Int = 0
        public fileprivate(set) var analysis: PhotoAnalysisEvidence?
        public fileprivate(set) var artifact: Artifact?
        public fileprivate(set) var receipt: CommitReceipt?
        public fileprivate(set) var reason: String?
    }
    public struct Work: Sendable {
        public enum Kind: Sendable { case analyze, render, commit }
        public let kind: Kind
        public let jobID: UUID
        public let leaseID: UUID
        public let binding: SessionImageBinding
        public let plan: SessionLookApplicationPlan
        public let analysis: PhotoAnalysisEvidence?
        public let artifact: Artifact?
        /// Use jobID as external commit idempotency key; leaseID fences attempts.
    }
    public let schemaVersion: Int
    public private(set) var session: TetherSessionState
    public private(set) var jobs: [Job]
    public private(set) var paused: Bool
    public private(set) var nextSequence: Int
    public init(session: TetherSessionState) throws {
        try session.validate(); schemaVersion = 1; self.session = session
        jobs = []; paused = false; nextSequence = 0
    }
    public mutating func updateLook(_ look: SessionLook, expectedRevision: Int) throws {
        try session.updateLook(look, expectedRevision: expectedRevision)
    }
    /// OFF arrivals are permanently skipped. Turning ON never reapplies them.
    /// Turning OFF revokes active analysis/render work; uncertain commits require
    /// reconciliation, not a blind second commit. ON resumes only pending ON jobs.
    public mutating func setControls(_ controls: SessionApplyControls) {
        session.setControls(controls)
        if !controls.autoApply { interruptActive(reason: "auto-apply-off") }
    }
    @discardableResult
    public mutating func enqueueArrival(checkpoint: ProjectCheckpoint, receiptID: UUID) throws -> UUID {
        try enqueueArrival(checkpoint: checkpoint, receiptID: receiptID, frozenCapture: nil)
    }
    /// Persist queue state before issuing capture/ingest. Preview/JPEG/RAW
    /// correlation must carry this ID; matching by arrival order is forbidden.
    public mutating func beginCapture(id: UUID = UUID()) throws -> CaptureContext {
        guard session.captureContexts.count < 10000 || session.captureContexts.contains(where: { $0.id == id }) else { throw QueueError.capacity }
        return try session.beginCapture(id: id)
    }
    @discardableResult
    public mutating func enqueueArrival(checkpoint: ProjectCheckpoint, receiptID: UUID,
                                        capture: CaptureContext) throws -> UUID {
        try enqueueArrival(checkpoint: checkpoint, receiptID: receiptID, frozenCapture: capture)
    }
    private mutating func enqueueArrival(checkpoint: ProjectCheckpoint, receiptID: UUID,
                                         frozenCapture capture: CaptureContext?) throws -> UUID {
        try checkpoint.validate()
        if let capture {
            try capture.validate()
            guard capture.sessionID == session.id, session.captureContexts.contains(capture) else { throw QueueError.conflictingArrival }
        }
        if let receiptJob = jobs.first(where: { $0.ingestReceiptIDs.contains(receiptID) }) {
            guard receiptJob.binding.assetID == checkpoint.asset.id,
                  capture == nil || receiptJob.binding.captureID == capture?.id else { throw QueueError.conflictingArrival }
        }
        if let index = jobs.firstIndex(where: { $0.ingestReceiptIDs.contains(receiptID) || $0.binding.assetID == checkpoint.asset.id || (capture != nil && $0.binding.captureID == capture?.id) }) {
            let b = jobs[index].binding
            guard b.assetID == checkpoint.asset.id, b.originalSHA256.lowercased() == checkpoint.asset.sha256.lowercased(),
                  b.inputRecipeRevision == checkpoint.revision else { throw QueueError.conflictingArrival }
            if let capture {
                guard b.captureID == capture.id, jobs[index].frozenSession.captureContexts.contains(capture) else { throw QueueError.conflictingArrival }
            }
            guard jobs[index].ingestReceiptIDs.contains(receiptID) || jobs[index].ingestReceiptIDs.count < 1000 else { throw QueueError.capacity }
            jobs[index].ingestReceiptIDs.insert(receiptID); return jobs[index].id
        }
        guard jobs.count < 10000, nextSequence < 9_007_199_254_740_991 else { throw QueueError.capacity }
        guard !session.bindings.contains(where: { $0.assetID == checkpoint.asset.id }) else { throw QueueError.conflictingArrival }
        var frozen = try TetherSessionState(id: session.id, look: capture?.look ?? session.currentLook,
                                           controls: capture?.controls ?? session.controls)
        for id in session.excludedPhotoIDs where id == checkpoint.asset.id { frozen.excludePhoto(id) }
        for id in session.excludedPersonIDs { frozen.excludePerson(id) }
        for exclusion in session.photoPersonExclusions where exclusion.assetID == checkpoint.asset.id {
            frozen.excludePerson(exclusion.personID, in: exclusion.assetID)
        }
        let binding: SessionImageBinding
        if let capture {
            try frozen.registerCapture(capture)
            binding = try frozen.bindNewPhoto(checkpoint, capture: capture)
        } else { binding = try frozen.bindNewPhoto(checkpoint) }
        let plan = try frozen.applicationPlan(for: binding)
        let reason: String?
        if case .skipped(let why) = plan.state { reason = why.rawValue } else { reason = nil }
        let job = Job(id: UUID(), sequence: nextSequence, ingestReceiptIDs: [receiptID], frozenSession: frozen,
                      phase: reason == nil ? .pending : .skipped, reason: reason)
        jobs.append(job); nextSequence += 1; return job.id
    }
    /// Strict FIFO among nonterminal jobs. Failed/reconciliation head blocks later
    /// jobs until explicit retry/skip/resolution. At most one leased operation.
    public mutating func beginNext(capabilities: Set<LookAdapterCapability>) throws -> Work? {
        try validate()
        guard !paused, session.controls.autoApply,
              !jobs.contains(where: { $0.leaseID != nil }),
              let i = jobs.firstIndex(where: { ![Phase.completed,.skipped].contains($0.phase) }) else { return nil }
        guard jobs[i].phase == .pending || jobs[i].phase == .rendered else { return nil }
        guard jobs[i].attempts < 1000 else { throw QueueError.attemptsExhausted }
        let plan = try jobs[i].frozenSession.applicationPlan(for: jobs[i].binding, capabilities: capabilities, analysis: jobs[i].analysis)
        let kind: Work.Kind
        switch plan.state {
        case .skipped(let reason): jobs[i].phase = .skipped; jobs[i].reason = reason.rawValue; return nil
        case .notSupported:
            jobs[i].phase = .failed; jobs[i].reason = "unsupported:" + plan.unsupportedCapabilities.map(\.rawValue).sorted().joined(separator: ","); return nil
        case .requiresAnalysis: kind = .analyze
        case .readyForAdapter: kind = jobs[i].artifact == nil ? .render : .commit
        }
        // Even an output-only Look gets fresh photo-bound analysis before render.
        let actualKind: Work.Kind = jobs[i].analysis == nil ? .analyze : kind
        let lease = UUID(); jobs[i].leaseID = lease; jobs[i].attempts += 1; jobs[i].reason = nil
        switch actualKind { case .analyze: jobs[i].phase = .analyzing; case .render: jobs[i].phase = .rendering; case .commit: jobs[i].phase = .committing }
        return Work(kind: actualKind, jobID: jobs[i].id, leaseID: lease, binding: jobs[i].binding,
                    plan: plan, analysis: jobs[i].analysis, artifact: jobs[i].artifact)
    }
    public mutating func acknowledgeAnalysis(jobID: UUID, leaseID: UUID, evidence: PhotoAnalysisEvidence,
                                             capabilities: Set<LookAdapterCapability>) throws {
        let i = try leased(jobID, leaseID, .analyzing)
        let plan = try jobs[i].frozenSession.applicationPlan(for: jobs[i].binding, capabilities: capabilities, analysis: evidence)
        guard evidence.assetID == jobs[i].binding.assetID,
              isSHA256(evidence.originalSHA256), !evidence.implementationVersion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              evidence.originalSHA256.lowercased() == jobs[i].binding.originalSHA256.lowercased() else { throw QueueError.evidenceMismatch }
        jobs[i].analysis = evidence; jobs[i].leaseID = nil
        if case .readyForAdapter = plan.state { jobs[i].phase = .pending; jobs[i].reason = nil }
        else { jobs[i].phase = .failed; jobs[i].reason = "analysis-incomplete-or-adapter-unavailable" }
    }
    /// Rendered is not completed: the output must next be durably committed.
    public mutating func acknowledgeRender(jobID: UUID, leaseID: UUID, artifact: Artifact) throws {
        let i = try leased(jobID, leaseID, .rendering)
        guard !artifact.reference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              artifact.reference.utf8.count <= 4096, isSHA256(artifact.sha256),
              artifact.analysisID == jobs[i].analysis?.id else { throw QueueError.evidenceMismatch }
        jobs[i].artifact = artifact; jobs[i].phase = .rendered; jobs[i].leaseID = nil
    }
    public mutating func acknowledgeCommit(jobID: UUID, leaseID: UUID, receipt: CommitReceipt) throws {
        if jobs.contains(where: { $0.id == jobID && $0.phase == .completed && $0.receipt == receipt }) { return }
        let i = try leased(jobID, leaseID, .committing); try checkReceipt(receipt, job: jobs[i])
        jobs[i].receipt = receipt; jobs[i].phase = .completed; jobs[i].leaseID = nil; jobs[i].reason = nil
    }
    public mutating func fail(jobID: UUID, leaseID: UUID, reason: String) throws {
        guard let i = jobs.firstIndex(where: { $0.id == jobID }), jobs[i].leaseID == leaseID else { throw QueueError.staleLease }
        jobs[i].phase = jobs[i].phase == .committing ? .reconciliationRequired : .failed
        jobs[i].leaseID = nil; jobs[i].reason = String(reason.prefix(1024))
    }
    public mutating func retry(jobID: UUID, discardAnalysis: Bool = false) throws {
        guard let i = jobs.firstIndex(where: { $0.id == jobID }), jobs[i].phase == .failed else { throw QueueError.invalidState }
        if discardAnalysis { jobs[i].analysis = nil; jobs[i].artifact = nil }
        jobs[i].phase = jobs[i].artifact == nil ? .pending : .rendered; jobs[i].reason = nil
    }
    public mutating func pause() { paused = true; interruptActive(reason: "paused") }
    public mutating func resume() { paused = false }
    /// Call after loading persisted state BEFORE executing any work. An old
    /// render may be retried, but an uncertain commit must be queried by jobID.
    public mutating func recoverAfterRestart() { interruptActive(reason: "process-restarted"); paused = true }
    private mutating func interruptActive(reason: String) {
        for i in jobs.indices where jobs[i].leaseID != nil {
            jobs[i].phase = jobs[i].phase == .committing ? .reconciliationRequired : .pending
            jobs[i].leaseID = nil; jobs[i].reason = reason
        }
    }
    public mutating func reconcile(jobID: UUID, committed receipt: CommitReceipt) throws {
        guard let i = jobs.firstIndex(where: { $0.id == jobID }), jobs[i].phase == .reconciliationRequired else { throw QueueError.invalidState }
        try checkReceipt(receipt, job: jobs[i]); jobs[i].receipt = receipt; jobs[i].phase = .completed; jobs[i].reason = nil
    }
    /// Only after host stopped/fenced the old worker AND queried its durable
    /// commit store to prove no commit. A momentary absent record is insufficient
    /// while an old worker could still publish. Queue tokens alone cannot fence
    /// an external database; commit adapter must enforce jobID idempotency/CAS.
    public mutating func confirmNotCommitted(jobID: UUID, evidenceReference: String) throws {
        guard !evidenceReference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              let i = jobs.firstIndex(where: { $0.id == jobID }), jobs[i].phase == .reconciliationRequired else { throw QueueError.invalidState }
        jobs[i].phase = .rendered; jobs[i].reason = "not-committed:" + String(evidenceReference.prefix(1000))
    }
    public mutating func skip(jobID: UUID, explicitlyRequested: Bool) throws {
        guard explicitlyRequested else { throw QueueError.explicitActionRequired }
        guard let i = jobs.firstIndex(where: { $0.id == jobID }), jobs[i].leaseID == nil,
              ![Phase.completed,.reconciliationRequired].contains(jobs[i].phase) else { throw QueueError.invalidState }
        jobs[i].phase = .skipped; jobs[i].reason = "explicit-user-skip"
    }
    private func leased(_ job: UUID, _ lease: UUID, _ phase: Phase) throws -> Int {
        guard let i = jobs.firstIndex(where: { $0.id == job }), jobs[i].leaseID == lease, jobs[i].phase == phase else { throw QueueError.staleLease }; return i
    }
    private func checkReceipt(_ receipt: CommitReceipt, job: Job) throws {
        let b = job.binding
        guard receipt.jobID == job.id, receipt.assetID == b.assetID,
              isSHA256(receipt.originalSHA256), receipt.originalSHA256.lowercased() == b.originalSHA256.lowercased(),
              receipt.inputRecipeRevision == b.inputRecipeRevision, receipt.outputRecipeRevision > b.inputRecipeRevision,
              receipt.outputRecipeRevision <= 9_007_199_254_740_991,
              receipt.lookID == b.lookID, receipt.lookRevision == b.lookRevision,
              isSHA256(receipt.artifactSHA256), receipt.artifactSHA256.lowercased() == job.artifact?.sha256.lowercased() else { throw QueueError.evidenceMismatch }
    }
    public func validate() throws {
        try session.validate()
        guard schemaVersion == 1, jobs.count <= 10000, session.captureContexts.count <= 10000, nextSequence >= 0, nextSequence <= 9_007_199_254_740_991,
              Set(jobs.map(\.id)).count == jobs.count, jobs.filter({ $0.leaseID != nil }).count <= 1 else { throw QueueError.invalidState }
        var receipts = Set<UUID>(), assets = Set<UUID>(), captures = Set<UUID>(), previous = -1
        for job in jobs {
            try job.frozenSession.validate()
            guard job.frozenSession.id == session.id, job.frozenSession.bindings.count == 1,
                  job.frozenSession.lookRevisions.count == 1, !job.ingestReceiptIDs.isEmpty, job.ingestReceiptIDs.count <= 1000,
                  receipts.isDisjoint(with: job.ingestReceiptIDs), job.sequence > previous, job.sequence < nextSequence,
                  (0...1000).contains(job.attempts), (job.reason?.utf8.count ?? 0) <= 4096 else { throw QueueError.invalidState }
            let binding = job.binding
            if let captureID = binding.captureID {
                guard captures.insert(captureID).inserted,
                      let context = job.frozenSession.captureContexts.first(where: { $0.id == captureID }),
                      session.captureContexts.contains(context) else { throw QueueError.invalidState }
            }
            guard binding.kind == .newCapture, assets.insert(binding.assetID).inserted,
                  session.lookRevisions.contains(job.frozenSession.currentLook),
                  [.analyzing,.rendering,.committing].contains(job.phase) == (job.leaseID != nil) else { throw QueueError.invalidState }
            if let evidence = job.analysis {
                _ = try job.frozenSession.applicationPlan(for: binding, capabilities: Set(LookAdapterCapability.allCases), analysis: evidence)
                guard isSHA256(evidence.originalSHA256), evidence.assetID == binding.assetID,
                      evidence.originalSHA256.lowercased() == binding.originalSHA256.lowercased(),
                      !evidence.implementationVersion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw QueueError.evidenceMismatch }
            }
            if let artifact = job.artifact { guard isSHA256(artifact.sha256), !artifact.reference.isEmpty,
                artifact.reference.utf8.count <= 4096, artifact.analysisID == job.analysis?.id else { throw QueueError.evidenceMismatch } }
            if [.rendering,.rendered,.committing,.reconciliationRequired,.completed].contains(job.phase) && job.analysis == nil { throw QueueError.invalidState }
            if [.rendering,.rendered,.committing,.reconciliationRequired,.completed].contains(job.phase) {
                let plan = try job.frozenSession.applicationPlan(for: binding, capabilities: Set(LookAdapterCapability.allCases), analysis: job.analysis)
                guard case .readyForAdapter = plan.state else { throw QueueError.evidenceMismatch }
            }
            if [.rendered,.committing,.reconciliationRequired,.completed].contains(job.phase) && job.artifact == nil { throw QueueError.invalidState }
            if job.phase == .completed { guard let receipt = job.receipt else { throw QueueError.invalidState }; try checkReceipt(receipt, job: job) }
            else if job.receipt != nil { throw QueueError.invalidState }
            receipts.formUnion(job.ingestReceiptIDs); previous = job.sequence
        }
    }
    public func encoded() throws -> Data {
        try validate(); let data = try JSONEncoder().encode(self)
        guard data.count <= 64*1024*1024 else { throw QueueError.capacity }; return data
    }
    public static func restore(_ data: Data) throws -> Self {
        guard data.count <= 64*1024*1024 else { throw QueueError.capacity }
        var queue = try JSONDecoder().decode(Self.self, from: data); try queue.validate()
        queue.recoverAfterRestart(); return queue
    }
    private enum CodingKeys: String, CodingKey, CaseIterable { case schemaVersion, session, jobs, paused, nextSequence }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decode(Int.self, forKey: .schemaVersion); session = try c.decode(TetherSessionState.self, forKey: .session)
        jobs = try c.decode([Job].self, forKey: .jobs); paused = try c.decode(Bool.self, forKey: .paused)
        nextSequence = try c.decode(Int.self, forKey: .nextSequence); try validate()
    }
}
