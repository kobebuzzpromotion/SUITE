import Foundation

/// Runtime field generation only. Current freeze mask applies to ALL operations,
/// not a historical per-stroke freeze state. No UI, image sampling or persistence.
/// Nine pure-renderer operations do not imply Web persisted-schema compatibility.
/// Pixel alpha is unknown here; the image sampler must preserve its own alpha contract.
public enum LocalWarpFieldBuilder {
    public enum Kind: String, Sendable { case translate, scaleX, scaleY, scale, rotate, mShape, smooth, restore, pushLeft }
    public struct Operation: Sendable {
        public let kind: Kind
        public let center: LocalWarpCoordinateMap.Point
        public let rx: Double, ry: Double, amount: Double, dx: Double, dy: Double, angle: Double
        public init(kind: Kind, center: LocalWarpCoordinateMap.Point, rx: Double, ry: Double,
                    amount: Double = 0, dx: Double = 0, dy: Double = 0, angle: Double = 0) throws {
            guard [center.x,center.y,rx,ry,amount,dx,dy,angle].allSatisfy(\.isFinite),
                  (0...1).contains(center.x), (0...1).contains(center.y), rx > 0, rx <= 1, ry > 0, ry <= 1,
                  [amount,dx,dy,angle].allSatisfy({ abs($0) <= 1 }) else { throw Failure.invalidOperation }
            self.kind = kind; self.center = center; self.rx = rx; self.ry = ry
            self.amount = amount; self.dx = dx; self.dy = dy; self.angle = angle
        }
    }
    public enum Failure: Error { case invalidOperation, capacity, invalidProtection, nonfinite }
    public static func build(photoID: UUID, originalSHA256: String, geometryRevision: String,
                             width: Int, height: Int, operations: [Operation],
                             protectionTopLeftL8: Data? = nil) throws -> LocalWarpCoordinateMap {
        try Task.checkCancellation()
        guard isSHA256(originalSHA256), !geometryRevision.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              geometryRevision.utf8.count <= 512 else { throw Failure.invalidOperation }
        guard width > 0, height > 0, width <= 65_536, height <= 65_536,
              width <= 8_000_000 / height, operations.count <= 128 else { throw Failure.capacity }
        let n = width * height
        guard Double(n) * 40 < Double(ProcessInfo.processInfo.physicalMemory) / 3 else { throw Failure.capacity }
        if let protectionTopLeftL8, protectionTopLeftL8.count != n { throw Failure.invalidProtection }
        // Data slices may retain a nonzero startIndex. Normalize once to a
        // zero-based immutable snapshot, included in the 40-byte/pixel budget.
        let protection = protectionTopLeftL8.map { [UInt8]($0) }
        var fx = [Float](repeating: 0, count: n), fy = fx
        for i in 0..<n {
            if i.isMultiple(of: 8192) { try Task.checkCancellation() }
            fx[i] = Float(i % width); fy[i] = Float(i / width)
        }
        var work = 0
        for op in operations {
            try Task.checkCancellation()
            let rx = op.rx * Double(width), ry = op.ry * Double(height)
            guard rx >= 1, ry >= 1 else { throw Failure.invalidOperation }
            // Web brush support uses center*width (NOT pixel-center mapping).
            let cx = op.center.x * Double(width), cy = op.center.y * Double(height)
            let x0 = max(0,Int(floor(cx-rx))), x1 = min(width-1,Int(ceil(cx+rx)))
            let y0 = max(0,Int(floor(cy-ry))), y1 = min(height-1,Int(ceil(cy+ry)))
            work += (x1-x0+1)*(y1-y0+1)
            guard work <= 128_000_000 else { throw Failure.capacity }
            let previousX = op.kind == .smooth ? fx : [], previousY = op.kind == .smooth ? fy : []
            for y in y0...y1 {
                try Task.checkCancellation()
                for x in x0...x1 {
                    let i = y*width+x
                    if (protection?[i] ?? 0) > 0 { continue }
                    let u = (Double(x)-cx)/rx, v = (Double(y)-cy)/ry, r2 = u*u+v*v
                    if r2 >= 1 { continue }
                    let edge = Double(min(x,y,width-1-x,height-1-y)) / max(1,min(rx,ry)*0.2)
                    let weight = (1-r2)*(1-r2)*max(0,min(1,edge))
                    var nx = Double(fx[i]), ny = Double(fy[i])
                    if op.kind == .restore {
                        nx += (Double(x)-nx)*abs(op.amount)*weight; ny += (Double(y)-ny)*abs(op.amount)*weight
                    } else if op.kind == .smooth {
                        // Smooth prior displacement, never blur image pixels.
                        let near = [x > 0 ? i-1 : i, x < width-1 ? i+1 : i,
                                    y > 0 ? i-width : i, y < height-1 ? i+width : i]
                        let sx = near.reduce(0.0) { $0 + Double(previousX[$1])-Double($1%width) }/4
                        let sy = near.reduce(0.0) { $0 + Double(previousY[$1])-Double($1/width) }/4
                        nx += (Double(x)+sx-nx)*abs(op.amount)*weight; ny += (Double(y)+sy-ny)*abs(op.amount)*weight
                    } else {
                        var sx = Double(x), sy = Double(y)
                        switch op.kind {
                        case .translate: sx -= op.dx*rx*0.18*weight; sy -= op.dy*ry*0.18*weight
                        case .scaleX: sx = cx+(Double(x)-cx)/(1+op.amount*0.18*weight)
                        case .scaleY: sy = cy+(Double(y)-cy)/(1+op.amount*0.18*weight)
                        case .scale:
                            sx = cx+(Double(x)-cx)/(1+op.amount*0.18*weight)
                            sy = cy+(Double(y)-cy)/(1+op.amount*0.18*weight)
                        case .rotate:
                            let a = op.angle * Double.pi/6*weight, c = cos(a), s = sin(a)
                            sx = cx+(Double(x)-cx)*c+(Double(y)-cy)*s
                            sy = cy-(Double(x)-cx)*s+(Double(y)-cy)*c
                        case .mShape: sy -= op.amount*ry*0.12*weight*cos(u*Double.pi*2)
                        case .pushLeft: sx -= op.amount*rx*0.15*weight*(v < 0 ? -1 : 1)
                        case .smooth, .restore: break
                        }
                        nx += sx-Double(x); ny += sy-Double(y)
                    }
                    guard nx.isFinite, ny.isFinite, Float(nx).isFinite, Float(ny).isFinite else { throw Failure.nonfinite }
                    fx[i] = Float(nx); fy[i] = Float(ny)
                }
            }
        }
        // Freeze actual sampling, not merely the requested field. Every positive
        // bilinear donor tap is checked; nearest-donor checks are insufficient.
        for y in 0..<height {
            try Task.checkCancellation()
            for x in 0..<width {
                let i = y*width+x, sx = Double(fx[i]), sy = Double(fy[i])
                var frozen = x == 0 || y == 0 || x == width-1 || y == height-1 || (protection?[i] ?? 0) > 0
                if sx < 0 || sy < 0 || sx > Double(width-1) || sy > Double(height-1) { frozen = true }
                if !frozen, let protection {
                    let ax = Int(floor(sx)), ay = Int(floor(sy)), bx = min(width-1,ax+1), by = min(height-1,ay+1)
                    let u = sx-Double(ax), v = sy-Double(ay)
                    let taps = [ay*width+ax,ay*width+bx,by*width+ax,by*width+bx]
                    let weights = [(1-u)*(1-v),u*(1-v),(1-u)*v,u*v]
                    frozen = (0..<4).contains { weights[$0] > 0 && protection[taps[$0]] > 0 }
                }
                if frozen { fx[i] = Float(x); fy[i] = Float(y) }
            }
        }
        // A protection discontinuity may fail certification. Reject the entire
        // request; never silently reduce strength or claim an uncertified result.
        return try LocalWarpCoordinateMap(assetID: photoID, originalSHA256: originalSHA256,
            geometryRevision: geometryRevision, inputWidth: width, inputHeight: height,
            width: width, height: height, sourceX: fx, sourceY: fy)
    }
}
