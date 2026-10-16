import Foundation
import Vision
import SuiteCore

/// Reuses delta66-portrait-body.mjs body/waist formulas with real 2D joints.
/// Does not claim physical scale/distance, ideal anatomy or 3D reconstruction.
enum LocalObservedBodyWarpBuilder {
    static func operations(body: LocalBodyGeometryService.Body, control: RetouchControl,
                          customAmount: Double) throws -> [LocalWarpFieldBuilder.Operation] {
        guard customAmount.isFinite, (-1...1).contains(customAmount),
              [.waist, .bodyLine, .arm, .leg].contains(control) else {
            throw SuiteValidationError.invalidValue("実関節規則は胴・腰・腕・脚に対応しています。その他は手動領域を使用してください")
        }
        func joint(_ name: VNHumanBodyPoseObservation.JointName) throws -> LocalBodyGeometryService.Joint {
            let values = body.joints.filter { $0.name == name.rawValue.rawValue }
            guard values.count == 1, let point = values.first,
                  point.confidence.isFinite, point.confidence >= 0.5, point.confidence <= 1,
                  point.x.isFinite, point.y.isFinite, (0...1).contains(point.x), (0...1).contains(point.y) else {
                throw SuiteValidationError.invalidValue("肩・腰の実観測が不足しています。手動で指定してください")
            }
            return point
        }
        let ls = try joint(.leftShoulder), rs = try joint(.rightShoulder)
        let lh = try joint(.leftHip), rh = try joint(.rightHip)
        let sx = (ls.x+rs.x)/2, sy = (ls.y+rs.y)/2
        let hx = (lh.x+rh.x)/2, hy = (lh.y+rh.y)/2
        let tx = (sx+hx)/2, ty = (sy+hy)/2
        let width = max(0.04, abs(ls.x-rs.x)), height = max(0.06, abs(hy-sy))
        if control == .arm || control == .leg {
            var result: [LocalWarpFieldBuilder.Operation] = []
            let sides: [(VNHumanBodyPoseObservation.JointName,VNHumanBodyPoseObservation.JointName,VNHumanBodyPoseObservation.JointName,VNHumanBodyPoseObservation.JointName,VNHumanBodyPoseObservation.JointName)] = [
                (.leftShoulder,.leftElbow,.leftHip,.leftKnee,.leftAnkle),
                (.rightShoulder,.rightElbow,.rightHip,.rightKnee,.rightAnkle)]
            for (shoulder,elbow,hip,knee,ankle) in sides {
                if control == .arm {
                    let s = try joint(shoulder), e = try joint(elbow)
                    result.append(try .init(kind:.scaleX, center:.init(x:(s.x+e.x)/2,y:(s.y+e.y)/2),
                        rx:min(0.99,width*0.35), ry:min(0.99,height*0.65), amount:customAmount))
                } else {
                    let h = try joint(hip), k = try joint(knee), a = try joint(ankle)
                    result.append(try .init(kind:.scaleX, center:.init(x:(h.x+k.x)/2,y:(h.y+k.y)/2),
                        rx:min(0.99,width*0.35), ry:min(0.99,max(0.04,abs(k.y-h.y))), amount:customAmount))
                    result.append(try .init(kind:.scaleX, center:.init(x:(k.x+a.x)/2,y:(k.y+a.y)/2),
                        rx:min(0.99,width*0.3), ry:min(0.99,max(0.04,abs(a.y-k.y))), amount:customAmount))
                }
            }
            return result
        }
        let waist = control == .waist
        return [try .init(kind:.scaleX, center:.init(x:waist ? (tx+hx)/2 : tx, y:waist ? (ty+hy)/2 : ty),
            rx:min(0.99, width*(waist ? 0.7 : 1)), ry:min(0.99, height*(waist ? 0.4 : 1)), amount:customAmount)]
    }
}
