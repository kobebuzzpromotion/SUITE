import Foundation
import SuiteCore

/// Executes existing face brightness and explicit global/export Recipe adapters.
/// Returns a CAS-ready candidate; apply saves each effect+receipt atomically.
/// The host must recheck current consent/settings before explicitly calling apply.
actor SessionLookPartialApplyCoordinator {
    enum Failure: Error { case busy, staleInput, invalidExposureResolution, capacity }
    struct ExposureResolution: Sendable {
        let personID: UUID
        let setting: RetouchSetting
        /// Explicit caller-approved EV. LOW/MEDIUM/HIGH have no invented mapping.
        let exposureEV: Double
    }
    struct Candidate: Sendable {
        let input: ProjectCheckpoint
        let checkpoint: ProjectCheckpoint
        /// Commit in order, each with the preceding revision as CAS expectation.
        /// Do not submit the final checkpoint directly across multiple revisions.
        let checkpoints: [ProjectCheckpoint]
        let application: SessionLookPartialApplication
        let receipts: [SessionLookPartialReceiptLedger.Receipt]
        /// Previously durable effects are not newly applied by this candidate.
        let alreadyAppliedReceipts: [SessionLookPartialReceiptLedger.Receipt]
        let unresolvedPersonIDs: Set<UUID>
        let isPersisted = false
    }
    private let correction = LocalPersonCorrectionService()
    private var active = false

    /// Global/output can proceed independently while individual people await
    /// analysis. Values are absolute Recipe values, not invented adaptive targets.
    /// Global evidence requirements remain enforced by the shared planner.
    func prepareGlobal(session: TetherSessionState, binding: SessionImageBinding,
                       checkpoint: ProjectCheckpoint, evidence: PhotoAnalysisEvidence?,
                       receiptIDs: [SessionLookPartialApplication.Effect: UUID],
                       projects: ProjectStore) async throws -> Candidate {
        guard !active else { throw Failure.busy }
        active = true; defer { active = false }
        try Task.checkCancellation(); try checkpoint.validate(); try session.validate()
        guard checkpoint.asset.id == binding.assetID,
              checkpoint.asset.sha256.lowercased() == binding.originalSHA256.lowercased(),
              checkpoint.revision >= binding.inputRecipeRevision,
              Set(receiptIDs.values).count == receiptIDs.count,
              receiptIDs.keys.allSatisfy({ $0 == .globalColor || $0 == .outputIntent }),
              let look = session.lookRevisions.first(where: { $0.id == binding.lookID && $0.revision == binding.lookRevision }) else {
            throw Failure.staleInput
        }
        let application = try session.partialApplicationPlan(for: binding,
            capabilities: SessionLookExplicitRecipeAdapter.capabilities(for: look), analysis: evidence)
        guard let recovery = try await projects.partialLookRecovery(binding: binding),
              recovery.checkpoint == checkpoint,
              recovery.receipts.allSatisfy({ $0.lookSnapshot == application.lookSnapshot }) else { throw Failure.staleInput }
        let saved = recovery.receipts
        if saved.isEmpty {
            guard checkpoint.revision == binding.inputRecipeRevision else { throw Failure.staleInput }
        } else {
            guard recovery.lastAppliedCheckpoint == checkpoint else { throw Failure.staleInput }
        }
        var ledger = SessionLookPartialReceiptLedger()
        for receipt in saved { _ = try ledger.record(receipt) }
        var current = checkpoint
        var checkpoints: [ProjectCheckpoint] = []
        var receipts: [SessionLookPartialReceiptLedger.Receipt] = []
        var unresolved = Set<UUID>()
        for part in application.parts {
            if case let .person(id, _) = part.effect { unresolved.insert(id) }
            if case let .personalColor(id) = part.effect { unresolved.insert(id) }
            guard part.effect == .globalColor || part.effect == .outputIntent else { continue }
            if let prior = saved.first(where: { $0.effect == part.effect }) {
                if let retryID = receiptIDs[part.effect], retryID != prior.id { throw Failure.staleInput }
                continue
            }
            guard part.state == .readyForAdapter, let receiptID = receiptIDs[part.effect] else { continue }
            try Task.checkCancellation()
            guard current.revision < 9_007_199_254_740_991 else { throw Failure.capacity }
            let input = current.history.current
            let output = try SessionLookExplicitRecipeAdapter.apply(part, to: input)
            let receipt = try SessionLookPartialReceiptLedger.Receipt(id: receiptID, part: part,
                application: application, inputRevision: current.revision, outputRevision: current.revision + 1,
                input: input, output: output, adapterVersion: SessionLookExplicitRecipeAdapter.version)
            _ = try ledger.record(receipt)
            var history = current.history; history.apply(output)
            current = ProjectCheckpoint(asset: current.asset, history: history, revision: current.revision + 1)
            try current.validate(); checkpoints.append(current); receipts.append(receipt)
        }
        try Task.checkCancellation()
        return Candidate(input: checkpoint, checkpoint: current, checkpoints: checkpoints,
            application: application, receipts: receipts, alreadyAppliedReceipts: saved,
            unresolvedPersonIDs: unresolved)
    }

    struct ApplyReport: Sendable {
        var savedReceiptIDs: [UUID] = []
        var cancelled = false
        var failedReceiptID: UUID?
        var failure: String?
        var requiresReconciliation = false
    }

    /// Each effect is a separate CAS transaction. A later failure retains prior
    /// successes; do not retry with new IDs or silently overwrite manual edits.
    func apply(_ candidate: Candidate, projects: ProjectStore) async throws -> ApplyReport {
        guard !active else { throw Failure.busy }
        active = true; defer { active = false }
        guard candidate.checkpoints.count == candidate.receipts.count else { throw Failure.staleInput }
        try candidate.input.validate()
        var expected = candidate.input
        var ledger = SessionLookPartialReceiptLedger()
        for receipt in candidate.alreadyAppliedReceipts {
            guard receipt.binding == candidate.application.binding,
                  receipt.lookSnapshot == candidate.application.lookSnapshot else { throw Failure.staleInput }
            _ = try ledger.record(receipt)
        }
        // Prevalidate the entire batch before the first write.
        for (output, receipt) in zip(candidate.checkpoints, candidate.receipts) {
            try output.validate(); _ = try ledger.record(receipt)
            guard receipt.binding == candidate.application.binding,
                  receipt.lookSnapshot == candidate.application.lookSnapshot,
                  receipt.inputRevision == expected.revision, receipt.input == expected.history.current,
                  output.revision == receipt.outputRevision, output.history.current == receipt.output,
                  output.asset == expected.asset else { throw Failure.staleInput }
            expected = output
        }
        guard expected == candidate.checkpoint else { throw Failure.staleInput }
        var report = ApplyReport()
        for (output, receipt) in zip(candidate.checkpoints, candidate.receipts) {
            if Task.isCancelled { report.cancelled = true; return report }
            do {
                try await projects.savePartialLookCommit(output, expectedRevision: receipt.inputRevision, receipt: receipt)
                // No cancellation throw after commit: preserve/report that success.
                report.savedReceiptIDs.append(receipt.id)
            } catch {
                report.failedReceiptID = receipt.id
                report.failure = String(String(describing: error).prefix(1024))
                report.requiresReconciliation = (error as? ProjectStoreError) == .tetherCommitDurabilityUncertain
                return report
            }
        }
        return report
    }

    /// Restart reconciliation compares the complete receipt, not ID alone. nil
    /// means no record, not authority to replace a newer manual edit.
    func reconcile(_ receipt: SessionLookPartialReceiptLedger.Receipt,
                   projects: ProjectStore) async throws -> Bool {
        guard !active else { throw Failure.busy }
        active = true; defer { active = false }
        try Task.checkCancellation(); try receipt.validate()
        return try await projects.reconcilePartialLookReceipt(receipt)
    }

    func prepare(session: TetherSessionState, binding: SessionImageBinding,
                 checkpoint: ProjectCheckpoint, evidence: PhotoAnalysisEvidence,
                 referencePNG: Data, prepared: LocalFacePixels.Prepared,
                 analysis: LocalFaceAnalysisService.Analysis, assignments: PhotoPersonAssignments,
                 analysisVersion: String, policy: FaceRegionAssociation.Policy,
                 consentedPersonIDs: Set<FaceIdentity.PersonID>,
                 resolutions: [ExposureResolution], receiptIDs: [UUID: UUID],
                 projects: ProjectStore? = nil) async throws -> Candidate {
        guard !active else { throw Failure.busy }
        active = true; defer { active = false }
        try Task.checkCancellation(); try checkpoint.validate()
        guard checkpoint.asset.id == binding.assetID,
              checkpoint.asset.sha256.lowercased() == binding.originalSHA256.lowercased(),
              checkpoint.revision >= binding.inputRecipeRevision,
              checkpoint.revision < 9_007_199_254_740_991,
              resolutions.count <= 256,
              Set(resolutions.map(\.personID)).count == resolutions.count,
              Set(receiptIDs.values).count == receiptIDs.count else { throw Failure.staleInput }
        // Advertising only the adapter actually used below keeps global/output,
        // texture and unsupported controls visible as unsupported rather than done.
        let application = try session.partialApplicationPlan(for: binding,
            capabilities: [.adaptiveFace], supportedControls: [.faceBrightness], analysis: evidence)
        var savedReceipts: [SessionLookPartialReceiptLedger.Receipt] = []
        if let projects {
            guard let recovery = try await projects.partialLookRecovery(binding: binding),
                  recovery.checkpoint == checkpoint else { throw Failure.staleInput }
            savedReceipts = recovery.receipts
            guard savedReceipts.allSatisfy({ $0.lookSnapshot == application.lookSnapshot }) else { throw Failure.staleInput }
            if !savedReceipts.isEmpty {
                // Any later manual edit, Undo/Redo or other binding prevents this
                // automatic continuation. A new explicit binding is required.
                guard recovery.lastAppliedCheckpoint == checkpoint else { throw Failure.staleInput }
            } else if checkpoint.revision != binding.inputRecipeRevision { throw Failure.staleInput }
        } else if checkpoint.revision != binding.inputRecipeRevision { throw Failure.staleInput }
        var current = checkpoint
        var receipts: [SessionLookPartialReceiptLedger.Receipt] = []
        var checkpoints: [ProjectCheckpoint] = []
        var unresolved = Set<UUID>()
        var ledger = SessionLookPartialReceiptLedger()
        for receipt in savedReceipts { _ = try ledger.record(receipt) }
        for part in application.parts {
            guard case let .person(personID, control) = part.effect, control == .faceBrightness else { continue }
            if let saved = savedReceipts.first(where: { $0.effect == part.effect }) {
                // Different retry IDs do not authorize applying this effect twice.
                if let requestedID = receiptIDs[personID], requestedID != saved.id { throw Failure.staleInput }
                continue
            }
            guard part.state == .readyForAdapter else { unresolved.insert(personID); continue }
            guard let setting = part.plan.people.first(where: { $0.personID == personID })?.settings.first,
                  let resolution = resolutions.first(where: { $0.personID == personID }),
                  resolution.setting == setting, resolution.exposureEV.isFinite,
                  (-4...4).contains(resolution.exposureEV), let receiptID = receiptIDs[personID] else {
                unresolved.insert(personID); continue
            }
            try Task.checkCancellation()
            let portrait = try current.history.current.portraitRecipe()
                ?? PortraitPipeline.neutralPortrait(from: current.history, asset: current.asset)
            let plan = try await correction.makePlan(referencePNG: referencePNG, prepared: prepared,
                analysis: analysis, asset: current.asset, assignments: assignments, analysisVersion: analysisVersion,
                intents: [.init(personID: FaceIdentity.PersonID(personID), exposureEV: resolution.exposureEV)],
                policy: policy, consentedPersonIDs: consentedPersonIDs, currentPortrait: portrait)
            guard plan.pending.isEmpty, plan.resolved.count == 1,
                  plan.resolved.first?.personID == FaceIdentity.PersonID(personID) else {
                unresolved.insert(personID); continue
            }
            let input = current.history.current
            let output = try input.settingPortrait(plan.candidatePortrait)
            guard current.revision < 9_007_199_254_740_991 else { throw Failure.capacity }
            let receipt = try SessionLookPartialReceiptLedger.Receipt(id: receiptID, part: part,
                application: application, inputRevision: current.revision, outputRevision: current.revision + 1,
                input: input, output: output, adapterVersion: "local-face-brightness-explicit-ev-v1")
            _ = try ledger.record(receipt)
            var history = current.history; history.apply(output)
            current = ProjectCheckpoint(asset: current.asset, history: history, revision: current.revision + 1)
            try current.validate()
            checkpoints.append(current)
            receipts.append(receipt)
        }
        try Task.checkCancellation()
        return Candidate(input: checkpoint, checkpoint: current, checkpoints: checkpoints, application: application,
                         receipts: receipts, alreadyAppliedReceipts: savedReceipts, unresolvedPersonIDs: unresolved)
    }
}
