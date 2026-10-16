import Foundation

public enum LookAdapterCapability: String, Codable, CaseIterable, Sendable {
    case adaptiveGlobalColor, adaptiveFace, adaptiveSkin, adaptiveBody, personalColor, texture, outputIntent
}
public enum PhotoAnalysisRequirement: String, Codable, CaseIterable, Sendable {
    case exposure, whiteBalance, faceDetection, faceLandmarks, personSegmentation, bodyLandmarks
    case skinRegion, pose, orientation, scale, subjectDistance, background, multiplePeople, identityMatch, backgroundProtection
    // Additive vocabulary: old evidence stays readable. Older readers explicitly
    // reject new values rather than treating detailed regions as generic landmarks.
    case eyeRegion, teethRegion, hairRegion, underEyeRegion, nasolabialRegion, localSkinFeatures
}

/// A mask/region reference belongs to the newly analysed photo, never to fixed reference-photo coordinates.
public struct PhotoBoundRegion: Codable, Equatable, Sendable {
    public let assetID: UUID
    public let originalSHA256: String
    public let analysisID: UUID
    public let regionReference: String
    public init(assetID: UUID, originalSHA256: String, analysisID: UUID, regionReference: String) {
        self.assetID = assetID; self.originalSHA256 = originalSHA256
        self.analysisID = analysisID; self.regionReference = regionReference
    }
    func belongsTo(_ evidence: PhotoAnalysisEvidence) -> Bool {
        assetID == evidence.assetID && originalSHA256.lowercased() == evidence.originalSHA256.lowercased()
            && analysisID == evidence.id && !regionReference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}

public struct PhotoPersonObservation: Codable, Equatable, Sendable {
    public let personID: UUID
    public let identityMatch: VerificationStatus
    public let faceRegion: PhotoBoundRegion?
    public let skinRegion: PhotoBoundRegion?
    public let bodyRegion: PhotoBoundRegion?
    public let protectedBackgroundRegion: PhotoBoundRegion?
    public init(personID: UUID, identityMatch: VerificationStatus, faceRegion: PhotoBoundRegion? = nil,
                skinRegion: PhotoBoundRegion? = nil, bodyRegion: PhotoBoundRegion? = nil,
                protectedBackgroundRegion: PhotoBoundRegion? = nil) {
        self.personID = personID; self.identityMatch = identityMatch
        self.faceRegion = faceRegion; self.skinRegion = skinRegion; self.bodyRegion = bodyRegion
        self.protectedBackgroundRegion = protectedBackgroundRegion
    }
}

/// Supplied only by a real analysis adapter. This package does not detect, identify or segment people.
public struct PhotoAnalysisEvidence: Codable, Equatable, Sendable, Identifiable {
    public let id: UUID
    public let assetID: UUID
    public let originalSHA256: String
    public let implementationVersion: String
    public let completed: Set<PhotoAnalysisRequirement>
    public let people: [PhotoPersonObservation]
    public init(id: UUID, assetID: UUID, originalSHA256: String, implementationVersion: String,
                completed: Set<PhotoAnalysisRequirement>, people: [PhotoPersonObservation]) {
        self.id = id; self.assetID = assetID; self.originalSHA256 = originalSHA256
        self.implementationVersion = implementationVersion; self.completed = completed; self.people = people
    }
}

public enum LookPlanSkipReason: String, Codable, Sendable { case autoApplyOff, photoExcluded, noEnabledIntent }
public enum LookPlanState: Equatable, Sendable {
    case skipped(LookPlanSkipReason), requiresAnalysis, notSupported, readyForAdapter
}

public struct SessionLookApplicationPlan: Equatable, Sendable {
    public let binding: SessionImageBinding
    public let lookSnapshot: SessionLook
    public let people: [PersonLookIntent]
    public let personalColorTargetIDs: Set<UUID>
    public let globalColorEnabled: Bool
    public let state: LookPlanState
    public let missingAnalysis: Set<PhotoAnalysisRequirement>
    public let unsupportedCapabilities: Set<LookAdapterCapability>
    /// Readiness is only an input plan; it is never a claim that pixels were processed or a Recipe committed.
    public var isRendered: Bool { false }
}

extension TetherSessionState {
    public func applicationPlan(for binding: SessionImageBinding,
                                capabilities: Set<LookAdapterCapability> = [],
                                analysis: PhotoAnalysisEvidence? = nil,
                                correctionEvidence: [PersonCorrectionAnalysisEvidence] = []) throws -> SessionLookApplicationPlan {
        try scopedApplicationPlan(for: binding, capabilities: capabilities, analysis: analysis,
                                  correctionEvidence: correctionEvidence, scope: nil)
    }

    // Internal only: the public partial planner constructs subsets from the validated snapshot.
    func scopedApplicationPlan(for binding: SessionImageBinding,
                               capabilities: Set<LookAdapterCapability>, analysis: PhotoAnalysisEvidence?,
                               correctionEvidence: [PersonCorrectionAnalysisEvidence],
                               scope: SessionLook?) throws -> SessionLookApplicationPlan {
        try validate()
        guard bindings.contains(binding), binding.sessionID == id,
              let originalLook = lookRevisions.first(where: { $0.id == binding.lookID && $0.revision == binding.lookRevision }) else {
            throw SessionLookError.invalidBinding
        }
        let look = scope ?? originalLook
        func skipped(_ reason: LookPlanSkipReason) -> SessionLookApplicationPlan {
            SessionLookApplicationPlan(binding: binding, lookSnapshot: look, people: [], personalColorTargetIDs: [],
                                       globalColorEnabled: false, state: .skipped(reason), missingAnalysis: [], unsupportedCapabilities: [])
        }
        if excludedPhotoIDs.contains(binding.assetID) { return skipped(.photoExcluded) }
        if binding.kind == .newCapture && (!controls.autoApply || !binding.controls.autoApply) { return skipped(.autoApplyOff) }

        let excluded = excludedPersonIDs.union(photoPersonExclusions.filter { $0.assetID == binding.assetID }.map(\.personID))
        let people = look.people.filter { !excluded.contains($0.personID) }.compactMap { intent -> PersonLookIntent? in
            let settings = intent.settings.filter { $0.strength.level != .off && binding.controls.permits($0.control.category) }
            return settings.isEmpty ? nil : PersonLookIntent(personID: intent.personID, settings: settings)
        }
        let personalTargets = binding.controls.personalColor
            ? (look.personalColor?.targetPersonIDs.subtracting(excluded) ?? []) : []
        let global = binding.controls.globalColor && !look.globalColor.isEmpty
        var needed: Set<LookAdapterCapability> = []
        var required: Set<PhotoAnalysisRequirement> = []
        if global { needed.insert(.adaptiveGlobalColor); required.formUnion([.exposure, .whiteBalance, .background]) }
        if !look.textureIntent.isEmpty { needed.insert(.texture); required.formUnion([.skinRegion, .personSegmentation]) }
        if !look.outputIntent.isEmpty { needed.insert(.outputIntent) }
        if !personalTargets.isEmpty {
            needed.insert(.personalColor)
            required.formUnion([.skinRegion, .personSegmentation, .identityMatch, .exposure, .whiteBalance, .orientation])
        }
        for person in people {
            for setting in person.settings {
                let dependencies = CorrectionAnalysisRequirements.forControl(setting.control)
                needed.insert(dependencies.capability)
                required.formUnion(dependencies.analysis)
            }
        }
        if needed.isEmpty { return skipped(.noEnabledIntent) }
        var missing = required
        if let analysis {
            guard analysis.assetID == binding.assetID, isSHA256(analysis.originalSHA256),
                  analysis.originalSHA256.lowercased() == binding.originalSHA256.lowercased(),
                  !analysis.implementationVersion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  Set(analysis.people.map(\.personID)).count == analysis.people.count else {
                throw SessionLookError.analysisDoesNotMatchPhoto
            }
            missing.subtract(analysis.completed)
            let targetIDs = Set(people.map(\.personID)).union(personalTargets)
            for personID in targetIDs {
                guard let observation = analysis.people.first(where: { $0.personID == personID }),
                      observation.identityMatch == .passed else { missing.insert(.identityMatch); continue }
                let settings = people.first(where: { $0.personID == personID })?.settings ?? []
                let dependencies = settings.map { CorrectionAnalysisRequirements.forControl($0.control) }
                let personRequirements = dependencies.reduce(into: Set<PhotoAnalysisRequirement>()) { $0.formUnion($1.analysis) }
                if personRequirements.contains(.faceLandmarks) && observation.faceRegion?.belongsTo(analysis) != true { missing.insert(.faceLandmarks) }
                if (personRequirements.contains(.skinRegion) || personalTargets.contains(personID)) && observation.skinRegion?.belongsTo(analysis) != true { missing.insert(.skinRegion) }
                if personRequirements.contains(.bodyLandmarks) {
                    if observation.bodyRegion?.belongsTo(analysis) != true { missing.insert(.bodyLandmarks) }
                    if observation.protectedBackgroundRegion?.belongsTo(analysis) != true { missing.insert(.backgroundProtection) }
                }
                for setting in settings {
                    guard let detail = CorrectionAnalysisRequirements.forControl(setting.control).detailRequirement else { continue }
                    let candidates = correctionEvidence.filter { $0.personID == personID && $0.control == setting.control }
                    // Multiple or unknown observations are ambiguous, never first/nearest fallback.
                    guard candidates.count == 1, let evidence = candidates.first,
                          evidence.status == .passed, evidence.region.belongsTo(analysis) else {
                        missing.insert(detail); continue
                    }
                }
            }
        }
        let unsupported = needed.subtracting(capabilities)
        let state: LookPlanState = !unsupported.isEmpty ? .notSupported : !missing.isEmpty ? .requiresAnalysis : .readyForAdapter
        return SessionLookApplicationPlan(binding: binding, lookSnapshot: look, people: people,
                                           personalColorTargetIDs: personalTargets, globalColorEnabled: global,
                                           state: state, missingAnalysis: missing, unsupportedCapabilities: unsupported)
    }
}
