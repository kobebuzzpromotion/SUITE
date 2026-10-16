import Foundation

/// Planning requirements, not a declaration that an adapter implements the effect.
/// Keep this exhaustive: new controls must explicitly choose their dependencies.
public struct CorrectionAnalysisRequirements: Equatable, Sendable {
    public let analysis: Set<PhotoAnalysisRequirement>
    public let capability: LookAdapterCapability
    /// Detailed regions cannot be inferred from a face box or a global completion flag.
    public let detailRequirement: PhotoAnalysisRequirement?

    public static func forControl(_ control: RetouchControl) -> Self {
        let identity: Set<PhotoAnalysisRequirement> = [.identityMatch, .orientation, .multiplePeople]
        let face = identity.union([.faceDetection, .faceLandmarks])
        let skin = identity.union([.skinRegion, .personSegmentation])
        func faceDetail(_ detail: PhotoAnalysisRequirement) -> Self {
            Self(analysis: face.union([.exposure, .scale, detail]), capability: .adaptiveFace,
                 detailRequirement: detail)
        }
        switch control {
        case .faceBrightness:
            return Self(analysis: face.union([.exposure]), capability: .adaptiveFace, detailRequirement: nil)
        case .localFaceContrast:
            return Self(analysis: face.union([.exposure, .scale]), capability: .adaptiveFace, detailRequirement: nil)
        case .poreReduction, .skinTexture:
            return Self(analysis: face.union([.skinRegion, .exposure, .scale]), capability: .adaptiveFace, detailRequirement: nil)
        case .underEyeAdjustment: return faceDetail(.underEyeRegion)
        case .nasolabialFoldAdjustment: return faceDetail(.nasolabialRegion)
        case .eyeAdjustment: return faceDetail(.eyeRegion)
        case .teethAdjustment: return faceDetail(.teethRegion)
        case .hairAdjustment: return faceDetail(.hairRegion)
        case .skinTone, .unevenSkinTone, .localRedness:
            return Self(analysis: skin.union([.exposure, .whiteBalance]), capability: .adaptiveSkin, detailRequirement: nil)
        case .skinSmoothness, .textureCorrection:
            return Self(analysis: skin.union([.exposure, .scale]), capability: .adaptiveSkin, detailRequirement: nil)
        case .blemishReduction, .stretchMarkReduction, .scarReduction, .scratchMarkReduction:
            return Self(analysis: skin.union([.exposure, .scale, .localSkinFeatures]), capability: .adaptiveSkin,
                        detailRequirement: .localSkinFeatures)
        case .waist, .abdomen, .bust, .arm, .leg, .shoulder, .bodyLine, .silhouette, .localShapeAdjustment:
            return Self(analysis: identity.union([.personSegmentation, .bodyLandmarks, .pose, .scale,
                                                   .subjectDistance, .background, .backgroundProtection]),
                        capability: .adaptiveBody, detailRequirement: nil)
        }
    }
}

/// Runtime-only supplement to the existing persisted PhotoAnalysisEvidence format.
/// The real adapter supplies a nonempty, photo-bound region for this exact person's
/// exact control. For example, a blemish region does not prove a scar was located.
/// Missing, ambiguous, or failed observations must not be emitted as passed evidence.
public struct PersonCorrectionAnalysisEvidence: Equatable, Sendable {
    public let personID: UUID
    public let control: RetouchControl
    public let status: VerificationStatus
    public let region: PhotoBoundRegion

    public init(personID: UUID, control: RetouchControl, status: VerificationStatus, region: PhotoBoundRegion) {
        self.personID = personID; self.control = control; self.status = status; self.region = region
    }
}
