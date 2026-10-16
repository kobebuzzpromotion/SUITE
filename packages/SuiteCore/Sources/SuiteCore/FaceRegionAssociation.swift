import Foundation

/// Photo-local geometry association, NOT identity recognition or a segmentation
/// generator. Five alignment points never become a detailed face/body mesh.
public enum FaceRegionAssociation {
    public enum AssociationError: Error, Sendable {
        case invalidFrame, differentFrames, invalidPolicy, invalidDetection, invalidRegions
    }
    public enum Orientation: String, Sendable { case uprightUnmirrored, other }
    public struct Frame: Equatable, Sendable {
        public let assetID: UUID
        public let originalSHA256: String
        public let uprightWidth: Int
        public let uprightHeight: Int
        /// Same explicit coordinate domain for both providers. A crop, warp or
        /// different proxy-to-original mapping requires a different revision.
        public let geometryRevision: String
        public let orientation: Orientation
        public init(assetID: UUID, originalSHA256: String, uprightWidth: Int,
                    uprightHeight: Int, geometryRevision: String, orientation: Orientation) {
            self.assetID = assetID; self.originalSHA256 = originalSHA256.lowercased()
            self.uprightWidth = uprightWidth; self.uprightHeight = uprightHeight
            self.geometryRevision = geometryRevision; self.orientation = orientation
        }
    }
    public struct Detection: Sendable {
        public let faceTargetID: UUID
        public let x: Double
        public let y: Double
        public let width: Double
        public let height: Double
        /// Upright input pixels, top-left origin (not reduced analysis pixels).
        public init(faceTargetID: UUID, x: Double, y: Double, width: Double, height: Double) {
            self.faceTargetID = faceTargetID; self.x = x; self.y = y
            self.width = width; self.height = height
        }
    }
    public struct Region: Sendable {
        public let id: UUID
        public let anchor: PortraitFaceAnchor
        public init(id: UUID, anchor: PortraitFaceAnchor) { self.id = id; self.anchor = anchor }
    }
    public struct Policy: Sendable {
        public let revision: String
        public let minimumIoU: Double
        public let minimumMargin: Double
        public init(revision: String, minimumIoU: Double, minimumMargin: Double) {
            self.revision = revision; self.minimumIoU = minimumIoU; self.minimumMargin = minimumMargin
        }
    }
    public struct Candidate: Equatable, Sendable {
        public let regionID: UUID
        public let intersectionOverUnion: Double
    }
    public enum Ambiguity: Equatable, Sendable { case insufficientMargin, competingDetections }
    public enum Decision: Equatable, Sendable {
        case matched(UUID)
        case ambiguous(Ambiguity)
        case unknown
    }
    public struct Match: Sendable {
        public let faceTargetID: UUID
        public let policyRevision: String
        public let decision: Decision
        public let best: Candidate?
        public let runnerUp: Candidate?
        public let gap: Double?
    }

    /// Require evidence that BOTH providers used the exact same upright frame.
    /// Original SHA alone does not prove uncropped/unwarped coordinate equivalence.
    /// Reject outside-image rectangles; no hidden clamp/stretch to manufacture a match.
    public static func associate(detections: [Detection], detectionFrame: Frame,
                                 regions: [Region], regionFrame: Frame,
                                 policy: Policy) throws -> [Match] {
        try validate(detectionFrame); try validate(regionFrame)
        guard detectionFrame == regionFrame else { throw AssociationError.differentFrames }
        guard text(policy.revision), policy.minimumIoU.isFinite, policy.minimumIoU > 0,
              policy.minimumIoU <= 1, policy.minimumMargin.isFinite,
              (0...1).contains(policy.minimumMargin) else { throw AssociationError.invalidPolicy }
        guard detections.count <= 512, Set(detections.map(\.faceTargetID)).count == detections.count else {
            throw AssociationError.invalidDetection
        }
        guard regions.count <= 64, Set(regions.map(\.id)).count == regions.count else {
            throw AssociationError.invalidRegions
        }
        // Overlapping regions are not discarded: competing geometry must remain
        // visible to the ambiguity pass. Downstream Recipe has its own stricter gate.
        for region in regions { try region.anchor.validate() }
        let frameW = Double(detectionFrame.uprightWidth), frameH = Double(detectionFrame.uprightHeight)
        var matches: [Match] = []
        var contenders: [UUID: Set<UUID>] = [:]
        for detection in detections {
            try Task.checkCancellation()
            guard [detection.x, detection.y, detection.width, detection.height].allSatisfy(\.isFinite),
                  detection.x >= 0, detection.y >= 0, detection.width > 0, detection.height > 0,
                  detection.x + detection.width <= frameW,
                  detection.y + detection.height <= frameH else { throw AssociationError.invalidDetection }
            let anchor = try PortraitFaceAnchor(x: detection.x / frameW,
                y: (frameH - detection.y - detection.height) / frameH,
                width: detection.width / frameW, height: detection.height / frameH)
            let ranked = try regions.map { region -> Candidate in
                let iou = anchor.intersectionOverUnion(region.anchor)
                guard iou.isFinite, (0...1).contains(iou) else { throw AssociationError.invalidRegions }
                return Candidate(regionID: region.id, intersectionOverUnion: iou)
            }.sorted {
                    $0.intersectionOverUnion == $1.intersectionOverUnion
                        ? $0.regionID.uuidString < $1.regionID.uuidString
                        : $0.intersectionOverUnion > $1.intersectionOverUnion
                }
            for candidate in ranked where candidate.intersectionOverUnion >= policy.minimumIoU {
                contenders[candidate.regionID, default: []].insert(detection.faceTargetID)
            }
            let best = ranked.first
            let runner = ranked.count > 1 ? ranked[1] : nil
            let gap = best.map { $0.intersectionOverUnion - (runner?.intersectionOverUnion ?? 0) }
            let decision: Decision
            if let best, let gap, best.intersectionOverUnion >= policy.minimumIoU {
                decision = gap >= policy.minimumMargin && (runner == nil || gap > 0)
                    ? .matched(best.regionID) : .ambiguous(.insufficientMargin)
            } else { decision = .unknown }
            matches.append(Match(faceTargetID: detection.faceTargetID, policyRevision: policy.revision,
                                 decision: decision, best: best, runnerUp: runner, gap: gap))
        }
        try Task.checkCancellation()
        return matches.map { match in
            guard case let .matched(id) = match.decision, (contenders[id]?.count ?? 0) > 1 else { return match }
            return Match(faceTargetID: match.faceTargetID, policyRevision: match.policyRevision,
                         decision: .ambiguous(.competingDetections), best: match.best,
                         runnerUp: match.runnerUp, gap: match.gap)
        }
    }

    private static func validate(_ frame: Frame) throws {
        guard frame.orientation == .uprightUnmirrored,
              frame.uprightWidth > 0, frame.uprightHeight > 0,
              frame.uprightWidth <= Int(Int32.max), frame.uprightHeight <= Int(Int32.max),
              text(frame.geometryRevision), frame.originalSHA256.utf8.count == 64,
              frame.originalSHA256.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else {
            throw AssociationError.invalidFrame
        }
    }
    private static func text(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf8.count <= 256
    }
}
