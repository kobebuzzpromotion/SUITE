import Foundation
import SuiteCore

/// Serial, proxy-only local worker. This does not identify unknown people or
/// invent an exposure/WB measurement. The host supplies current, real evidence
/// and explicit EV resolutions; unsupported controls remain blocked.
/// HOST CONTRACT: serialize gallery/assignment revocation as well as queue
/// controls with this operation (cancel and await it first). Separate actors'
/// final snapshot checks are not an atomic cross-store permission fence.
actor TetherLookLocalWorker {
    enum Failure: Error { case busy, staleInput, unsupported, missingInput, invalidLimit }
    struct FaceInput: Sendable {
        /// Same app-private gallery used by the editor; re-read before work/commit.
        let gallery: LocalPersonGalleryStore
        let assignmentsRevision: UUID
        let assignments: PhotoPersonAssignments
        let analysisSHA256: String
        let analysisVersion: String
        let policy: FaceRegionAssociation.Policy
        let consentedPersonIDs: Set<FaceIdentity.PersonID>
        let resolutions: [SessionLookPartialApplyCoordinator.ExposureResolution]
    }
    struct Input: Sendable {
        let binding: SessionImageBinding
        /// Genuine photo-bound evidence (including exposure where required), not
        /// a list of flags inferred from enabled controls.
        let evidence: PhotoAnalysisEvidence
        let face: FaceInput?
    }
    struct Authorization: Codable, Equatable, Sendable {
        struct Resolution: Codable, Equatable, Sendable {
            let personID: UUID
            let setting: RetouchSetting
            let exposureEV: Double
        }
        let assignments: PhotoPersonAssignments
        let assignmentsRevision: UUID
        let analysisSHA256: String
        let analysisVersion: String
        let policyRevision: String
        let minimumIoU: Double
        let minimumMargin: Double
        let consentedPeople: [UUID]
        let resolutions: [Resolution]
        init(_ face: FaceInput) {
            assignments = face.assignments; assignmentsRevision = face.assignmentsRevision
            analysisSHA256 = face.analysisSHA256
            analysisVersion = face.analysisVersion; policyRevision = face.policy.revision
            minimumIoU = face.policy.minimumIoU; minimumMargin = face.policy.minimumMargin
            consentedPeople = face.consentedPersonIDs.map(\.value).sorted { $0.uuidString < $1.uuidString }
            resolutions = face.resolutions.map { Resolution(personID: $0.personID, setting: $0.setting, exposureEV: $0.exposureEV) }
                .sorted { $0.personID.uuidString < $1.personID.uuidString }
        }
    }
    struct Report: Sendable {
        var completed: [UUID] = []
        var blockedJobID: UUID?
        var reason: String?
        var cancelled = false
        var limitReached = false
    }
    private let projects: ProjectStore
    private let pipeline: PhotoPipeline
    private let queue: TetherLookQueueStore
    private let commit: TetherLookCommitCoordinator
    private let artifacts: TetherLookWorkerArtifacts
    private let faceAnalysis: LocalFaceAnalysisService?
    private let correction = LocalPersonCorrectionService()
    private var inputs: [UUID: Input] = [:]
    private var inputEngines: [UUID: LocalFaceAnalysisService] = [:]
    private var active = false

    init(root: URL, projects: ProjectStore, pipeline: PhotoPipeline,
         queue: TetherLookQueueStore, commit: TetherLookCommitCoordinator,
         faceAnalysis: LocalFaceAnalysisService? = nil) throws {
        self.projects = projects; self.pipeline = pipeline; self.queue = queue
        self.commit = commit; self.faceAnalysis = faceAnalysis
        artifacts = try TetherLookWorkerArtifacts(root: root)
    }

    /// Host serializes consent revocation, queue controls, and this worker. Inputs
    /// are deliberately not restored as fresh consent after process restart.
    func setInput(_ input: Input?, jobID: UUID, analysis: LocalFaceAnalysisService? = nil) throws {
        guard !active else { throw Failure.busy }
        guard input == nil || inputs[jobID] != nil || inputs.count < 32 else { throw Failure.invalidLimit }
        inputs[jobID] = input
        inputEngines[jobID] = input == nil ? nil : analysis
    }

    func run(maximumOperations: Int = 96) async throws -> Report {
        guard !active else { throw Failure.busy }
        guard (1...3072).contains(maximumOperations) else { throw Failure.invalidLimit }
        active = true; defer { active = false }
        var report = Report()
        for _ in 0..<maximumOperations {
            if Task.isCancelled { report.cancelled = true; return report }
            switch ProcessInfo.processInfo.thermalState {
            case .serious, .critical: report.reason = "thermal-resource-pause"; return report
            default: break
            }
            let snapshot = try await queue.snapshot()
            guard !snapshot.paused, snapshot.session.controls.autoApply else { report.reason = "paused-or-auto-apply-off"; return report }
            guard let job = snapshot.jobs.first(where: { $0.phase != .completed && $0.phase != .skipped }) else { return report }
            guard job.leaseID == nil, job.phase == .pending || job.phase == .rendered else {
                report.blockedJobID = job.id; report.reason = "retry-or-reconciliation-required"; return report
            }
            let capabilities = SessionLookExplicitRecipeAdapter.capabilities(for: job.frozenSession.currentLook).union([.adaptiveFace])
            let input = inputs[job.id]
            let parts = try job.frozenSession.partialApplicationPlan(for: job.binding,
                capabilities: capabilities, supportedControls: [.faceBrightness], analysis: input?.evidence ?? job.analysis)
            guard parts.unsupported.isEmpty else {
                report.blockedJobID = job.id; report.reason = "unsupported-control"; return report
            }
            let hasPeople = parts.parts.contains { if case .person = $0.effect { return true }; return false }
            let needsInput = hasPeople || parts.parts.contains { $0.effect == .globalColor }
            guard !needsInput || (input?.binding == job.binding && (!hasPeople || (input?.face != nil && (inputEngines[job.id] ?? faceAnalysis) != nil))) else {
                report.blockedJobID = job.id; report.reason = "fresh-photo-evidence-consent-and-explicit-values-required"; return report
            }
            if let saved = job.analysis, needsInput, input?.evidence != saved {
                report.blockedJobID = job.id; report.reason = "analysis-evidence-changed-explicit-retry-required"; return report
            }
            guard let work = try await queue.beginNext(capabilities: capabilities) else {
                // beginNext can durably skip the head without returning a lease.
                // Continue only after observing that terminal transition, never
                // spin on paused/active/failed state or assume a claim occurred.
                let after = try await queue.snapshot()
                if let head = after.jobs.first(where: { $0.id == job.id }),
                   head.phase == .skipped || head.phase == .completed { continue }
                return report
            }
            do {
                // Snapshot -> claim crosses actors. Even though the host must
                // serialize access, never use one head's evidence for another
                // returned lease after an outside queue mutation.
                guard work.jobID == job.id, work.binding == job.binding,
                      work.plan.binding == job.binding,
                      work.plan.lookSnapshot == job.frozenSession.currentLook else { throw Failure.staleInput }
                let claimed = try await queue.snapshot()
                guard let leased = claimed.jobs.first(where: { $0.id == work.jobID }),
                      leased.leaseID == work.leaseID, leased.binding == work.binding,
                      leased.frozenSession == job.frozenSession,
                      leased.analysis == work.analysis else { throw Failure.staleInput }
                switch work.kind {
                case .analyze:
                    let checkpoint = try await current(work)
                    // Real proxy decoding/render validation, not metadata-only success.
                    _ = try await pipeline.preview(asset: checkpoint.asset, parameters: checkpoint.history.current)
                    let evidence = input?.evidence ?? PhotoAnalysisEvidence(id: UUID(), assetID: checkpoint.asset.id,
                        originalSHA256: checkpoint.asset.sha256, implementationVersion: "suite-proxy-decode-only-v1",
                        completed: [], people: [])
                    if hasPeople { _ = try await corrected(checkpoint, work: work, input: input) }
                    try Task.checkCancellation()
                    try await queue.acknowledgeAnalysis(jobID: work.jobID, leaseID: work.leaseID,
                        evidence: evidence, capabilities: capabilities)
                case .render:
                    let checkpoint = try await current(work)
                    var parameters = checkpoint.history.current
                    let application = try job.frozenSession.partialApplicationPlan(for: work.binding,
                        capabilities: capabilities, supportedControls: [.faceBrightness], analysis: work.analysis)
                    guard application.parts.allSatisfy({ $0.state == .readyForAdapter }) else { throw Failure.missingInput }
                    if hasPeople { parameters = try await corrected(checkpoint, work: work, input: input) }
                    for part in application.parts where part.effect == .globalColor || part.effect == .outputIntent {
                        parameters = try SessionLookExplicitRecipeAdapter.apply(part, to: parameters)
                    }
                    var history = checkpoint.history; history.apply(parameters)
                    let output = ProjectCheckpoint(asset: checkpoint.asset, history: history, revision: checkpoint.revision + 1)
                    try output.validate()
                    let jpeg = try await pipeline.preview(asset: output.asset, parameters: parameters)
                    try Task.checkCancellation()
                    let artifact = try await artifacts.save(work: work, input: checkpoint, output: output,
                        jpeg: jpeg, authorization: (input?.face).map { Authorization($0) })
                    try await queue.acknowledgeRender(jobID: work.jobID, leaseID: work.leaseID, artifact: artifact)
                case .commit:
                    if let face = input?.face { try await validateConsent(face, assetID: work.binding.assetID) }
                    let output = try await artifacts.output(work: work, authorization: (input?.face).map { Authorization($0) })
                    switch try await commit.commit(work: work, checkpoint: output) {
                    case .committed, .reconciled:
                        report.completed.append(work.jobID); inputs.removeValue(forKey: work.jobID)
                        inputEngines.removeValue(forKey: work.jobID)
                    case .reconciliationRequired:
                        report.blockedJobID = work.jobID; report.reason = "durable-reconciliation-required"; return report
                    }
                }
            } catch {
                let queue = self.queue
                let reason = String(String(describing: error).prefix(1024))
                await Task.detached {
                    // Do not replace an acknowledged render, completed commit,
                    // or reconciliation state with a generic error. Only the
                    // still-owned lease can transition; committing -> uncertain
                    // is enforced by the queue, never reset to pending/failed.
                    guard let state = try? await queue.snapshot(),
                          let current = state.jobs.first(where: { $0.id == work.jobID }),
                          current.leaseID == work.leaseID,
                          [.analyzing, .rendering, .committing].contains(current.phase) else { return }
                    try? await queue.fail(jobID: work.jobID, leaseID: work.leaseID,
                        reason: current.phase == .committing ? "commit-outcome-requires-durable-reconciliation: " + reason : reason)
                }.value
                report.blockedJobID = work.jobID
                if case .commit = work.kind { report.reason = "durable-reconciliation-required: " + reason }
                else { report.reason = reason }
                report.cancelled = Task.isCancelled
                return report
            }
        }
        report.limitReached = true
        return report
    }

    private func current(_ work: TetherLookQueue.Work) async throws -> ProjectCheckpoint {
        guard let checkpoint = try await projects.load(id: work.binding.assetID),
              checkpoint.asset.sha256.lowercased() == work.binding.originalSHA256.lowercased(),
              checkpoint.revision == work.binding.inputRecipeRevision,
              checkpoint.revision < 9_007_199_254_740_991 else { throw Failure.staleInput }
        try checkpoint.validate(); return checkpoint
    }

    private func corrected(_ checkpoint: ProjectCheckpoint, work: TetherLookQueue.Work,
                           input: Input?) async throws -> RecipeParameters {
        guard let input, input.binding == work.binding, let face = input.face,
              let faceAnalysis = inputEngines[work.jobID] ?? faceAnalysis, input.evidence.assetID == checkpoint.asset.id,
              input.evidence.originalSHA256.lowercased() == checkpoint.asset.sha256.lowercased(),
              work.analysis == nil || work.analysis == input.evidence else { throw Failure.staleInput }
        try await validateConsent(face, assetID: checkpoint.asset.id)
        #if os(iOS)
        let reference = try await pipeline.prepareLocalPeople(asset: checkpoint.asset)
        let analysis = try await faceAnalysis.analyze(reference.pixels)
        guard analysis.analysisSHA256 == face.analysisSHA256, analysis.analysisVersion == face.analysisVersion else { throw Failure.staleInput }
        let people = work.plan.people
        guard face.resolutions.count == people.count,
              Set(face.resolutions.map(\.personID)).count == people.count else { throw Failure.missingInput }
        for person in people {
            guard person.settings.count == 1, let setting = person.settings.first, setting.control == .faceBrightness,
                  face.resolutions.contains(where: { $0.personID == person.personID && $0.setting == setting }) else { throw Failure.unsupported }
        }
        let portrait = try checkpoint.history.current.portraitRecipe()
            ?? PortraitPipeline.neutralPortrait(from: checkpoint.history, asset: checkpoint.asset)
        let plan = try await correction.makePlan(referencePNG: reference.referencePNG, prepared: reference.pixels,
            analysis: analysis, asset: checkpoint.asset, assignments: face.assignments, analysisVersion: face.analysisVersion,
            intents: face.resolutions.map { .init(personID: .init($0.personID), exposureEV: $0.exposureEV) },
            policy: face.policy, consentedPersonIDs: face.consentedPersonIDs, currentPortrait: portrait)
        guard plan.pending.isEmpty, plan.resolved.count == people.count else { throw Failure.missingInput }
        try await validateConsent(face, assetID: checkpoint.asset.id)
        return try checkpoint.history.current.settingPortrait(plan.candidatePortrait)
        #else
        throw Failure.unsupported
        #endif
    }
    private func validateConsent(_ face: FaceInput, assetID: UUID) async throws {
        try Task.checkCancellation()
        guard let saved = try await face.gallery.assignmentRecord(assetID: assetID),
              saved.revision == face.assignmentsRevision, saved.document == face.assignments else { throw Failure.staleInput }
        let entries = try await face.gallery.snapshot()
        let registered = Set(entries.map { FaceIdentity.PersonID($0.id) })
        let requested = Set(face.resolutions.map { FaceIdentity.PersonID($0.personID) })
        guard requested.isSubset(of: face.consentedPersonIDs), requested.isSubset(of: registered) else { throw Failure.missingInput }
        try Task.checkCancellation()
    }
}
