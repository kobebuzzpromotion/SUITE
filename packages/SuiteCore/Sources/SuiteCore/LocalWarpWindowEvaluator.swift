import Foundation

/// Full-resolution field evaluation with bounded windows, not a resized proxy
/// map. Keeps engine-v1 operation ordering, global coordinates and Float rounding.
/// No image decoding, rendering, persistence or claim of D06 completion.
public struct LocalWarpWindowEvaluator: Sendable {
    public struct Rect: Equatable, Sendable {
        public let x: Int, y: Int, width: Int, height: Int
        public init(x: Int, y: Int, width: Int, height: Int) {
            self.x = x; self.y = y; self.width = width; self.height = height
        }
    }
    public struct Window: Sendable {
        public let rect: Rect
        /// Absolute TOP-LEFT source pixel coordinates, row-major within rect.
        public let sourceX: [Float], sourceY: [Float]
        /// Integer source pixels containing every bilinear donor tap, including
        /// the extra floor+1 sample. Convert to bottom-left only at the CI boundary.
        public let sourceBounds: Rect
    }
    public struct Certificate: Sendable {
        public let evaluator: LocalWarpWindowEvaluator
        fileprivate init(_ evaluator: LocalWarpWindowEvaluator) { self.evaluator = evaluator }
        public func window(_ rect: Rect,
                           checkCancellation: @Sendable () throws -> Void = { try Task.checkCancellation() }) throws -> Window {
            try evaluator.evaluate(rect, checkCancellation: checkCancellation)
        }
    }
    public enum Failure: Error { case invalidDimensions, capacity, invalidWindow, nonfinite, noncontractive, boundary }
    public let recipe: LocalWarpRecipe
    public let width: Int, height: Int
    public let geometryRevision: String
    private let halo: Int
    /// Bounds total recomputation during certification. Caller cannot silently
    /// lower quality/strength to fit this limit. Rendering adds its own budget.
    private static let workLimit: Double = 8_000_000_000

    public init(recipe: LocalWarpRecipe, width: Int, height: Int, geometryRevision: String) throws {
        try recipe.validate()
        guard (1...65_536).contains(width), (1...65_536).contains(height),
              Double(width) * Double(height) <= 512_000_000,
              !geometryRevision.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              geometryRevision.utf8.count <= 512,
              abs(Double(width) / Double(height) - recipe.referenceAspect)
                <= 1 / Double(recipe.referenceHeight) + 1 / Double(height) else { throw Failure.invalidDimensions }
        for op in recipe.operations {
            guard op.rx * Double(width) >= 1, op.ry * Double(height) >= 1 else { throw Failure.invalidDimensions }
        }
        self.recipe = recipe; self.width = width; self.height = height; self.geometryRevision = geometryRevision
        halo = recipe.operations.filter { $0.kind == .smooth }.count
        let tileCount = Double((width + 255) / 256) * Double((height + 255) / 256)
        let side = Double(257 + 2 * halo)
        guard tileCount * side * side * Double(recipe.operations.count + 2) <= Self.workLimit,
              side * side * 40 < Double(ProcessInfo.processInfo.physicalMemory) / 3 else { throw Failure.capacity }
    }

    /// Checks every node and bilinear cell, including tile seams, before any
    /// caller may publish output. The immutable certificate binds the exact recipe.
    public func certify(checkCancellation: @Sendable () throws -> Void = { try Task.checkCancellation() }) throws -> Certificate {
        for top in stride(from: 0, to: height, by: 256) {
            for left in stride(from: 0, to: width, by: 256) {
                try checkCancellation()
                let r = Rect(x: left, y: top, width: min(257, width-left), height: min(257, height-top))
                let result = try evaluate(r, checkCancellation: checkCancellation)
                for y in 0..<r.height {
                    try checkCancellation()
                    for x in 0..<r.width {
                        let i = y*r.width+x, gx = left+x, gy = top+y
                        if gx == 0 || gy == 0 || gx == width-1 || gy == height-1 {
                            guard result.sourceX[i] == Float(gx), result.sourceY[i] == Float(gy) else { throw Failure.boundary }
                        }
                        guard x+1 < r.width, y+1 < r.height else { continue }
                        let j = i+r.width
                        try Self.certifyRow(Double(result.sourceX[i])-Double(gx), Double(result.sourceX[i+1])-Double(gx+1),
                            Double(result.sourceX[j])-Double(gx), Double(result.sourceX[j+1])-Double(gx+1))
                        try Self.certifyRow(Double(result.sourceY[i])-Double(gy), Double(result.sourceY[i+1])-Double(gy),
                            Double(result.sourceY[j])-Double(gy+1), Double(result.sourceY[j+1])-Double(gy+1))
                    }
                }
            }
        }
        try checkCancellation(); return Certificate(self)
    }
    private static func certifyRow(_ a: Double, _ b: Double, _ c: Double, _ d: Double) throws {
        guard max(abs(b-a), abs(d-c)) + max(abs(c-a), abs(d-b)) <= 0.65 else { throw Failure.noncontractive }
    }
    private func protected(_ x: Int, _ y: Int) -> Bool {
        guard let p = recipe.protectionRectangle else { return false }
        return min(Double(x+1), (p.x+p.width)*Double(width)) > max(Double(x), p.x*Double(width)) &&
            min(Double(y+1), (p.y+p.height)*Double(height)) > max(Double(y), p.y*Double(height))
    }
    private func evaluate(_ r: Rect, checkCancellation: @Sendable () throws -> Void) throws -> Window {
        try checkCancellation()
        guard r.x >= 0, r.y >= 0, (1...257).contains(r.width), (1...257).contains(r.height),
              r.x <= width-r.width, r.y <= height-r.height else { throw Failure.invalidWindow }
        let left = max(0,r.x-halo), top = max(0,r.y-halo)
        let right = min(width,r.x+r.width+halo), bottom = min(height,r.y+r.height+halo)
        let sw = right-left, sh = bottom-top
        var fx = [Float](repeating: 0, count: sw*sh), fy = fx
        for y in top..<bottom {
            try checkCancellation()
            for x in left..<right { let i = (y-top)*sw+x-left; fx[i] = Float(x); fy[i] = Float(y) }
        }
        var vx0 = left, vy0 = top, vx1 = right, vy1 = bottom
        for op in recipe.operations {
            try checkCancellation()
            let rx = op.rx*Double(width), ry = op.ry*Double(height)
            let cx = op.center.x*Double(width), cy = op.center.y*Double(height)
            let oldX = op.kind == .smooth ? fx : [], oldY = op.kind == .smooth ? fy : []
            if op.kind == .smooth {
                // Discard one dependency boundary per smoothing stage, except
                // real image boundaries where the original kernel repeats self.
                if vx0 > 0 { vx0 += 1 }; if vy0 > 0 { vy0 += 1 }
                if vx1 < width { vx1 -= 1 }; if vy1 < height { vy1 -= 1 }
            }
            for y in vy0..<vy1 {
                try checkCancellation()
                for x in vx0..<vx1 {
                    if protected(x,y) { continue }
                    let u = (Double(x)-cx)/rx, v = (Double(y)-cy)/ry, r2 = u*u+v*v
                    if r2 >= 1 { continue }
                    let i = (y-top)*sw+x-left
                    let edge = Double(min(x,y,width-1-x,height-1-y))/max(1,min(rx,ry)*0.2)
                    let weight = (1-r2)*(1-r2)*max(0,min(1,edge))
                    var nx = Double(fx[i]), ny = Double(fy[i])
                    if op.kind == .restore {
                        nx += (Double(x)-nx)*abs(op.amount)*weight; ny += (Double(y)-ny)*abs(op.amount)*weight
                    } else if op.kind == .smooth {
                        let near = [(max(0,x-1),y),(min(width-1,x+1),y),(x,max(0,y-1)),(x,min(height-1,y+1))]
                        let sx = near.reduce(0.0) { $0 + Double(oldX[($1.1-top)*sw+$1.0-left])-Double($1.0) }/4
                        let sy = near.reduce(0.0) { $0 + Double(oldY[($1.1-top)*sw+$1.0-left])-Double($1.1) }/4
                        nx += (Double(x)+sx-nx)*abs(op.amount)*weight; ny += (Double(y)+sy-ny)*abs(op.amount)*weight
                    } else {
                        var sx = Double(x), sy = Double(y)
                        switch op.kind {
                        case .translate: sx -= op.dx*rx*0.18*weight; sy -= op.dy*ry*0.18*weight
                        case .scaleX: sx = cx+(Double(x)-cx)/(1+op.amount*0.18*weight)
                        case .scaleY: sy = cy+(Double(y)-cy)/(1+op.amount*0.18*weight)
                        case .scale:
                            sx = cx+(Double(x)-cx)/(1+op.amount*0.18*weight); sy = cy+(Double(y)-cy)/(1+op.amount*0.18*weight)
                        case .rotate:
                            let a = op.angle*Double.pi/6*weight, c = cos(a), s = sin(a)
                            sx = cx+(Double(x)-cx)*c+(Double(y)-cy)*s; sy = cy-(Double(x)-cx)*s+(Double(y)-cy)*c
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
        var ox = [Float](), oy = [Float](); ox.reserveCapacity(r.width*r.height); oy.reserveCapacity(r.width*r.height)
        var minX = width-1, minY = height-1, maxX = 0, maxY = 0
        for y in r.y..<(r.y+r.height) {
            try checkCancellation()
            for x in r.x..<(r.x+r.width) {
                let i = (y-top)*sw+x-left
                var sx = Double(fx[i]), sy = Double(fy[i])
                var frozen = x == 0 || y == 0 || x == width-1 || y == height-1 || protected(x,y)
                if sx < 0 || sy < 0 || sx > Double(width-1) || sy > Double(height-1) { frozen = true }
                if !frozen {
                    let ax = Int(floor(sx)), ay = Int(floor(sy)), bx = min(width-1,ax+1), by = min(height-1,ay+1)
                    let u = sx-Double(ax), v = sy-Double(ay)
                    let taps = [(ax,ay,(1-u)*(1-v)),(bx,ay,u*(1-v)),(ax,by,(1-u)*v),(bx,by,u*v)]
                    frozen = taps.contains { $0.2 > 0 && protected($0.0,$0.1) }
                }
                if frozen { sx = Double(x); sy = Double(y) }
                ox.append(Float(sx)); oy.append(Float(sy))
                minX = min(minX,Int(floor(sx))); minY = min(minY,Int(floor(sy)))
                maxX = max(maxX,min(width-1,Int(floor(sx))+1)); maxY = max(maxY,min(height-1,Int(floor(sy))+1))
            }
        }
        return Window(rect: r, sourceX: ox, sourceY: oy,
            sourceBounds: Rect(x:minX,y:minY,width:maxX-minX+1,height:maxY-minY+1))
    }
}
