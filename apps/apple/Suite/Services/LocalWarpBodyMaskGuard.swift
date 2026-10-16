import Foundation
import CryptoKit
import SuiteCore

/// Persisted source-space permission, not a resized segmentation or a new warp.
/// Every displaced destination and positive-weight donor must be fully inside
/// the immutable person mask. Uncertain edges remain protected.
enum LocalWarpBodyMaskGuard {
    enum Failure: Error { case missing, binding, outsidePerson }

    static func validate(_ recipe: LocalWarpRecipe, bytes: Data?,
                         certificate: LocalWarpWindowEvaluator.Certificate,
                         checkCancellation: @Sendable () throws -> Void = { try Task.checkCancellation() }) throws {
        guard let reference = recipe.bodyMask else {
            guard bytes == nil else { throw Failure.binding }
            return
        }
        guard let bytes else { throw Failure.missing }
        let width = certificate.evaluator.width, height = certificate.evaluator.height
        guard certificate.evaluator.recipe == recipe,
              reference.width == width, reference.height == height,
              bytes.count == reference.byteCount,
              SHA256.hash(data: bytes).map({ String(format: "%02x", $0) }).joined() == reference.sha256 else {
            throw Failure.binding
        }
        for top in stride(from: 0, to: height, by: 256) {
            for left in stride(from: 0, to: width, by: 256) {
                try checkCancellation()
                let window = try certificate.window(.init(x: left, y: top,
                    width: min(256, width-left), height: min(256, height-top)),
                    checkCancellation: checkCancellation)
                for y in 0..<window.rect.height {
                    try checkCancellation()
                    for x in 0..<window.rect.width {
                        let i = y*window.rect.width+x, dx = left+x, dy = top+y
                        let sx = Double(window.sourceX[i]), sy = Double(window.sourceY[i])
                        if sx == Double(dx), sy == Double(dy) { continue }
                        guard bytes[dy*width+dx] == 255 else { throw Failure.outsidePerson }
                        let ax = Int(floor(sx)), ay = Int(floor(sy))
                        let bx = min(width-1, ax+1), by = min(height-1, ay+1)
                        let u = sx-Double(ax), v = sy-Double(ay)
                        for (px, py, weight) in [(ax,ay,(1-u)*(1-v)), (bx,ay,u*(1-v)),
                                                (ax,by,(1-u)*v), (bx,by,u*v)] where weight > 0 {
                            guard bytes[py*width+px] == 255 else { throw Failure.outsidePerson }
                        }
                    }
                }
            }
        }
        try checkCancellation()
    }
}
