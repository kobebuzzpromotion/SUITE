import Foundation
import SuiteCore

/// Manual-review lower-face proposal, NOT semantic skin, wrinkle or scar detection.
/// Vision's ordered open jaw contour is closed directly between its endpoints;
/// this deliberately excludes upper-face/forehead areas. No hull or invented points.
actor LocalFaceRegionProposal {
    enum Failure: Error { case invalidInput, resources }
    enum PendingReason: String, Sendable {
        case missingRegions, invalidPolygon, missingPersonMask, emptyIntersection, ambiguousFace
    }
    struct Pending: Sendable { let faceTargetID: UUID; let reason: PendingReason }
    struct Proposal: Sendable {
        let faceTargetID: UUID
        let width: Int, height: Int
        /// Tight L8 rows, bottom-up, in upright INPUT proxy space, not original space.
        let maskL8BottomUp: Data
        let coveragePixelCount: Int
    }
    struct Result: Sendable {
        let assetID: UUID
        let originalSHA256: String, analysisSHA256: String, analysisVersion: String, topologyID: String
        let proposals: [Proposal]
        let pending: [Pending]
    }
    private typealias Point = LocalDetailedPortraitAnalysis.Point
    private let required = ["faceContour", "leftEyebrow", "rightEyebrow", "leftEye", "rightEye", "outerLips", "innerLips", "nose"]

    func propose(_ detailed: LocalDetailedPortraitAnalysis.Result) throws -> Result {
        try resources()
        let w = detailed.frame.uprightWidth, h = detailed.frame.uprightHeight
        func digest(_ value: String) -> Bool {
            value.utf8.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
        }
        guard (1...1600).contains(w), (1...1600).contains(h), detailed.faces.count <= 64,
              digest(detailed.originalSHA256), digest(detailed.analysisSHA256),
              detailed.associations.count <= 512,
              Set(detailed.associations.map(\.faceTargetID)).count == detailed.associations.count,
              detailed.frame.assetID == detailed.assetID,
              detailed.frame.originalSHA256 == detailed.originalSHA256,
              detailed.frame.orientation == .uprightUnmirrored,
              detailed.topologyID == "apple-vision-face-landmarks-revision3-constellation76-regions-v1",
              detailed.visionRequestRevision == 3,
              !detailed.analysisVersion.isEmpty,
              Set(detailed.faces.map { $0.target.faceTargetID }).count == detailed.faces.count,
              Set(detailed.masks.map(\.instanceID)).count == detailed.masks.count else { throw Failure.invalidInput }
        let byteCount = w * h
        guard detailed.masks.count <= 64, detailed.masks.count <= (32 * 1024 * 1024) / byteCount else { throw Failure.resources }
        for mask in detailed.masks {
            guard mask.width == w, mask.height == h, mask.bottomUpLuminance8.count == byteCount else { throw Failure.invalidInput }
        }
        var proposals: [Proposal] = [], pending: [Pending] = []
        for association in detailed.associations {
            if case .matched = association.decision {} else {
                pending.append(.init(faceTargetID: association.faceTargetID, reason: .ambiguousFace))
            }
        }
        for face in detailed.faces {
            try resources()
            let id = face.target.faceTargetID
            guard face.target.assetID == detailed.assetID, face.target.originalSHA256 == detailed.originalSHA256 else { throw Failure.invalidInput }
            guard let association = detailed.associations.first(where: { $0.faceTargetID == id }),
                  case .matched = association.decision else { throw Failure.invalidInput }
            guard required.allSatisfy({ name in face.regions.filter { $0.name == name }.count == 1 }) else {
                pending.append(.init(faceTargetID: id, reason: .missingRegions)); continue
            }
            let polygons = required.map { name in face.regions.first { $0.name == name }!.points }
            guard polygons.allSatisfy(validPolygon) else {
                pending.append(.init(faceTargetID: id, reason: .invalidPolygon)); continue
            }
            guard let person = detailed.masks.first(where: { $0.instanceID == face.personInstanceID }) else {
                pending.append(.init(faceTargetID: id, reason: .missingPersonMask)); continue
            }
            guard proposals.count < (32 * 1024 * 1024) / byteCount else { throw Failure.resources }
            var mask = Data(count: byteCount), covered = 0
            let bounds = polygons.map { polygon in
                (minX: polygon.map(\.x).min()!, maxX: polygon.map(\.x).max()!,
                 minY: polygon.map(\.y).min()!, maxY: polygon.map(\.y).max()!)
            }
            // Include the same boundary tolerance as onSegment. Only centers
            // outside every possible contour hit are omitted from traversal.
            let jaw = bounds[0], epsilon = 1e-12
            let firstX = max(0, min(w, Int(ceil((jaw.minX - epsilon) * Double(w) - 0.5))))
            let afterX = max(firstX, min(w, Int(floor((jaw.maxX + epsilon) * Double(w) - 0.5)) + 1))
            let firstY = max(0, min(h, Int(ceil((jaw.minY - epsilon) * Double(h) - 0.5))))
            let afterY = max(firstY, min(h, Int(floor((jaw.maxY + epsilon) * Double(h) - 0.5)) + 1))
            for y in firstY..<afterY {
                try resources()
                for x in firstX..<afterX {
                    let index = y * w + x
                    guard person.bottomUpLuminance8[index] > 0 else { continue }
                    let point = Point(x: (Double(x) + 0.5) / Double(w), y: (Double(y) + 0.5) / Double(h))
                    guard contains(point, polygon: polygons[0]),
                          !polygons.indices.dropFirst().contains(where: { index in
                              let box = bounds[index]
                              guard point.x >= box.minX - epsilon, point.x <= box.maxX + epsilon,
                                    point.y >= box.minY - epsilon, point.y <= box.maxY + epsilon else { return false }
                              return contains(point, polygon: polygons[index])
                          }) else { continue }
                    mask[index] = person.bottomUpLuminance8[index]; covered += 1
                }
            }
            if covered == 0 { pending.append(.init(faceTargetID: id, reason: .emptyIntersection)) }
            else { proposals.append(.init(faceTargetID: id, width: w, height: h, maskL8BottomUp: mask, coveragePixelCount: covered)) }
        }
        try resources()
        return Result(assetID: detailed.assetID, originalSHA256: detailed.originalSHA256,
            analysisSHA256: detailed.analysisSHA256, analysisVersion: detailed.analysisVersion,
            topologyID: detailed.topologyID, proposals: proposals, pending: pending)
    }
    private func cross(_ a: Point, _ b: Point, _ c: Point) -> Double {
        (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x)
    }
    private func onSegment(_ p: Point, _ a: Point, _ b: Point) -> Bool {
        abs(cross(a,b,p)) <= 1e-12 && p.x >= min(a.x,b.x)-1e-12 && p.x <= max(a.x,b.x)+1e-12 &&
            p.y >= min(a.y,b.y)-1e-12 && p.y <= max(a.y,b.y)+1e-12
    }
    private func validPolygon(_ points: [Point]) -> Bool {
        guard (3...256).contains(points.count), points.allSatisfy({ $0.x.isFinite && $0.y.isFinite && (0...1).contains($0.x) && (0...1).contains($0.y) }) else { return false }
        var area = 0.0
        for i in points.indices {
            let a = points[i], b = points[(i+1)%points.count]
            guard abs(a.x-b.x)+abs(a.y-b.y) > 1e-12 else { return false }
            area += a.x*b.y-b.x*a.y
            for j in points.indices where j > i+1 && !(i == 0 && j == points.count-1) {
                let c = points[j], d = points[(j+1)%points.count]
                if onSegment(c,a,b) || onSegment(d,a,b) || onSegment(a,c,d) || onSegment(b,c,d) { return false }
                if cross(a,b,c)*cross(a,b,d) < 0 && cross(c,d,a)*cross(c,d,b) < 0 { return false }
            }
        }
        return abs(area) > 1e-10
    }
    private func contains(_ p: Point, polygon: [Point]) -> Bool {
        var inside = false
        for i in polygon.indices {
            let a = polygon[i], b = polygon[(i+1)%polygon.count]
            if onSegment(p,a,b) { return true }
            if (a.y > p.y) != (b.y > p.y), p.x < (b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x { inside.toggle() }
        }
        return inside
    }
    private func resources() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw Failure.resources
        default: break
        }
    }
}
