import Foundation

/// Override §15 plus required measured Mac/RAW/lifecycle gates.
/// These are distinct from iPhone/iPad physical-device QA; commercial V1/App Store/security gates are additional.
public enum MobileReleaseRequirement: String, CaseIterable, Codable, Sendable {
    case iPhoneDevice, iPadDevice, photoImport, rawAndJPEG, editing, aiProcessing, batch
    case beforeAfter, save, export, backgroundResume, offlineBehavior, permissionHandling
    case memoryPressure, thermalBehavior, batteryBehavior, errorRecovery, humanFactors
    case accessibility, performance, renderedReality
    case macBuildAndTests, realRAWLoad100, realRAWLoad500, realRAWLoad1000, fullLifecycleSyncRecovery
}

public enum EvidenceOutcome: String, Codable, Sendable { case pass, fail, unknown }

public struct GateEvidence: Codable, Equatable, Sendable {
    public let requirementID: String
    public let buildID: String
    public let outcome: EvidenceOutcome
    public let artifactReference: String
    public let observedAt: Date
    public let expiresAt: Date

    public init(requirementID: String, buildID: String, outcome: EvidenceOutcome,
                artifactReference: String, observedAt: Date, expiresAt: Date) {
        self.requirementID = requirementID
        self.buildID = buildID
        self.outcome = outcome
        self.artifactReference = artifactReference
        self.observedAt = observedAt
        self.expiresAt = expiresAt
    }
}

public struct ReleaseAssessment: Equatable, Sendable {
    public let blockedRequirements: [String]
    public var canRelease: Bool { blockedRequirements.isEmpty }
}

public enum ReleaseGate {
    /// Evidence must originate from the trusted QA/release service. A local struct is not an attestation.
    public static func evaluate(buildID: String, requirements: [String], evidence: [GateEvidence],
                                now: Date = Date()) -> ReleaseAssessment {
        guard !buildID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !requirements.isEmpty, now.timeIntervalSince1970.isFinite else {
            return ReleaseAssessment(blockedRequirements: ["invalid_release_context"])
        }
        let blocked = Set(requirements).sorted().filter { requirement in
            if requirement.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return true }
            let matching = evidence.filter { $0.requirementID == requirement && $0.buildID == buildID }
            // Conflicting/duplicate evidence must be resolved by the authority, not guessed locally.
            guard matching.count == 1, let item = matching.first else { return true }
            return item.outcome != .pass
                || item.artifactReference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                || !item.observedAt.timeIntervalSince1970.isFinite || !item.expiresAt.timeIntervalSince1970.isFinite
                || item.observedAt > now || item.expiresAt <= now || item.observedAt >= item.expiresAt
        }
        return ReleaseAssessment(blockedRequirements: blocked)
    }

    public static func evaluateMobile(buildID: String, additionalRequirements: [String],
                                      evidence: [GateEvidence], now: Date = Date()) -> ReleaseAssessment {
        evaluate(buildID: buildID,
                 requirements: MobileReleaseRequirement.allCases.map(\.rawValue) + additionalRequirements,
                 evidence: evidence, now: now)
    }
}
