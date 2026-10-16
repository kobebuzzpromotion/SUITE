import Foundation
import Vision
import SuiteCore

/// Bounds of measured 2D points, not anatomical surface reconstruction.
enum LocalManualPartProposal {
    struct Region: Equatable {
        let x, y, width, height: Double
        let explanation: String
    }
    static func propose(part: LocalManualPartWarpAdapter.Part,
                        detail: LocalDetailedPortraitAnalysis.Result, faceID: UUID,
                        body: LocalBodyGeometryService.Body?) throws -> Region {
        try Task.checkCancellation()
        guard detail.visionRequestRevision == 3,
              detail.topologyID == "apple-vision-face-landmarks-revision3-constellation76-regions-v1",
              detail.faces.filter({ $0.target.faceTargetID == faceID }).count == 1,
              let face = detail.faces.first(where: { $0.target.faceTargetID == faceID }) else {
            throw SuiteValidationError.invalidValue("現在の詳細顔解析が必要です")
        }
        var points: [(Double, Double)] = []
        let explanation: String
        switch part {
        case .nose:
            guard face.regions.filter({ $0.name == "nose" }).count == 1,
                  let region = face.regions.first(where: { $0.name == "nose" }), region.points.count >= 3 else {
                throw SuiteValidationError.invalidValue("鼻の観測点が不足しています。手動で領域を指定してください")
            }
            points = region.points.map { ($0.x, 1-$0.y) }
            explanation = "実鼻landmarkの外接範囲。鼻全体のsemantic境界ではありません。"
        case .leftEye, .rightEye:
            let eyes = face.regions.filter { $0.name == "leftEye" || $0.name == "rightEye" }
            guard eyes.count == 2, Set(eyes.map(\.name)).count == 2,
                  eyes.allSatisfy({ $0.points.count >= 3 && $0.points.count <= 128 && $0.points.allSatisfy { $0.x.isFinite && $0.y.isFinite } }) else {
                throw SuiteValidationError.invalidValue("両目の観測点が不足しています。手動で領域を指定してください")
            }
            let sorted = eyes.sorted { a, b in
                a.points.reduce(0) { $0+$1.x } / Double(a.points.count) < b.points.reduce(0) { $0+$1.x } / Double(b.points.count)
            }
            let leftX = sorted[0].points.reduce(0) { $0+$1.x } / Double(sorted[0].points.count)
            let rightX = sorted[1].points.reduce(0) { $0+$1.x } / Double(sorted[1].points.count)
            guard leftX < rightX else { throw SuiteValidationError.invalidValue("画像左右を区別できません。手動指定してください") }
            points = sorted[part == .leftEye ? 0 : 1].points.map { ($0.x, 1-$0.y) }
            explanation = "画像左右で選んだ実目landmarkの外接範囲。左右の自動連動はありません。"
        case .torso:
            guard let body else { throw SuiteValidationError.invalidValue("実身体解析と人物対応を明示確定してください") }
            let names: [VNHumanBodyPoseObservation.JointName] = [.leftShoulder, .rightShoulder, .leftHip, .rightHip]
            for name in names {
                let measured = body.joints.filter { $0.name == name.rawValue.rawValue }
                guard measured.count == 1, let joint = measured.first, joint.confidence.isFinite,
                      joint.confidence > 0, joint.confidence <= 1 else {
                    throw SuiteValidationError.invalidValue("肩・腰の観測点が不足しています。手動で領域を指定してください")
                }
                points.append((joint.x, joint.y))
            }
            explanation = "実測の両肩・両腰を囲む範囲。胴の輪郭推定ではなく、背景保護は別途実maskで検証します。"
        case .leftChest, .rightChest:
            throw SuiteValidationError.invalidValue("現在の観測に左右胸の境界はありません。推測せず手動領域を使用してください")
        }
        guard points.count <= 128, points.allSatisfy({ $0.0.isFinite && $0.1.isFinite && (0...1).contains($0.0) && (0...1).contains($0.1) }),
              let x = points.map(\.0).min(), let right = points.map(\.0).max(),
              let y = points.map(\.1).min(), let bottom = points.map(\.1).max(), right > x, bottom > y else {
            throw SuiteValidationError.invalidValue("観測領域が退化しています。手動で指定してください")
        }
        return Region(x: x, y: y, width: right-x, height: bottom-y, explanation: explanation)
    }
}
