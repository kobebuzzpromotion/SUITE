import Foundation

/// Narrow face-brightness adapter plan; does not replace SessionLook planning,
/// infer identity, save a Recipe or claim any rendered pixels.
public enum PersonFaceBrightnessPlan {
    public enum PlanError: Error, Sendable {
        case invalidIntents, invalidBinding, invalidTargets, duplicateRegion
    }
    public struct Intent: Sendable {
        public let personID: FaceIdentity.PersonID
        public let exposureEV: Double
        public init(personID: FaceIdentity.PersonID, exposureEV: Double) {
            self.personID = personID; self.exposureEV = exposureEV
        }
    }
    public enum PendingReason: Equatable, Sendable {
        case personNotInConsentedGallery
        case noExplicitPhotoAssignment
        case unknownRegion
        case ambiguousRegion
    }
    public struct Pending: Sendable {
        public let personID: FaceIdentity.PersonID
        public let reason: PendingReason
    }
    public struct Resolved: Sendable {
        public let personID: FaceIdentity.PersonID
        public let photoFaceTargetID: UUID
        public let portraitRegionID: UUID
        public let exposureEV: Double
    }
    public struct Plan: Sendable {
        /// A candidate only. The caller must revalidate current revision/consent
        /// and obtain explicit apply approval before committing it.
        public let candidatePortrait: PortraitRecipe
        public let resolved: [Resolved]
        public let pending: [Pending]
        public let associationPolicyRevision: String
        public var isRendered: Bool { false }
    }

    /// Exact current-photo evidence is required. Geometry matches are recomputed
    /// here rather than accepting unbound Match values from another photograph.
    /// Unresolved people leave their existing portrait values unchanged. Global
    /// color is not accepted as input and cannot be modified by this plan.
    public static func make(intents: [Intent], assignments: PhotoPersonAssignments,
                            analysisVersion: String, analysisSHA256: String,
                            targets: [FaceIdentity.PhotoFaceID],
                            detections: [FaceRegionAssociation.Detection],
                            detectionFrame: FaceRegionAssociation.Frame,
                            portraitFrame: FaceRegionAssociation.Frame,
                            currentPortrait: PortraitRecipe,
                            associationPolicy: FaceRegionAssociation.Policy,
                            consentedPersonIDs: Set<FaceIdentity.PersonID>) throws -> Plan {
        guard intents.count <= 256,
              Set(intents.map(\.personID)).count == intents.count,
              intents.allSatisfy({ $0.exposureEV.isFinite && (-4...4).contains($0.exposureEV) }) else {
            throw PlanError.invalidIntents
        }
        try currentPortrait.validate()
        guard currentPortrait.assetID == portraitFrame.assetID,
              currentPortrait.originalSHA256 == portraitFrame.originalSHA256,
              detectionFrame.assetID == currentPortrait.assetID,
              detectionFrame.originalSHA256 == currentPortrait.originalSHA256 else {
            throw PlanError.invalidBinding
        }
        try assignments.validate(assetID: detectionFrame.assetID,
            originalSHA256: detectionFrame.originalSHA256, analysisVersion: analysisVersion,
            analysisSHA256: analysisSHA256, targets: targets)
        guard targets.count == detections.count,
              Set(targets.map(\.faceTargetID)).count == targets.count,
              Set(detections.map(\.faceTargetID)) == Set(targets.map(\.faceTargetID)) else {
            throw PlanError.invalidTargets
        }
        let associations = try FaceRegionAssociation.associate(detections: detections,
            detectionFrame: detectionFrame,
            regions: currentPortrait.targets.map { .init(id: $0.id, anchor: $0.anchor) },
            regionFrame: portraitFrame, policy: associationPolicy)
        let associationByFace = Dictionary(uniqueKeysWithValues: associations.map { ($0.faceTargetID, $0) })
        let assigned = assignments.assignments
        var candidate = currentPortrait
        var resolved: [Resolved] = []
        var pending: [Pending] = []
        var usedRegions = Set<UUID>()
        for intent in intents {
            try Task.checkCancellation()
            guard consentedPersonIDs.contains(intent.personID) else {
                pending.append(.init(personID: intent.personID, reason: .personNotInConsentedGallery))
                continue
            }
            let faces = assigned.filter { $0.value == intent.personID }.map(\.key)
            guard faces.count == 1, let faceID = faces.first else {
                pending.append(.init(personID: intent.personID, reason: .noExplicitPhotoAssignment))
                continue
            }
            guard let association = associationByFace[faceID] else { throw PlanError.invalidTargets }
            switch association.decision {
            case .unknown:
                pending.append(.init(personID: intent.personID, reason: .unknownRegion))
            case .ambiguous:
                pending.append(.init(personID: intent.personID, reason: .ambiguousRegion))
            case let .matched(regionID):
                guard currentPortrait.targets.filter({ $0.id == regionID }).count == 1,
                      usedRegions.insert(regionID).inserted else { throw PlanError.duplicateRegion }
                // Absolute setting, never +=. Only existing current-photo anchor
                // survives; an intent contains no old-photo coordinates to copy.
                if candidate.targets.first(where: { $0.id == regionID })?.exposureEV != intent.exposureEV {
                    candidate = try candidate.settingExposure(intent.exposureEV, targetID: regionID)
                }
                resolved.append(.init(personID: intent.personID, photoFaceTargetID: faceID,
                                      portraitRegionID: regionID, exposureEV: intent.exposureEV))
            }
        }
        try candidate.validate(against: currentPortrait)
        try Task.checkCancellation()
        return Plan(candidatePortrait: candidate, resolved: resolved, pending: pending,
                    associationPolicyRevision: associationPolicy.revision)
    }
}
