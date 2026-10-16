import Foundation

/// Immutable certified output-to-source field; generates neither fields nor models.
/// Caller must provide the ACTUAL APPLIED sampling field after freeze/protection,
/// not the requested brush displacement. Certification proves the supplied field's
/// geometry only: it cannot establish that a renderer really applied that field.
/// Mapping a brush center alone does not preserve its radius or shape under warp.
/// Matches web-manual-liquify-map.mjs. Coordinates are normalized TOP-LEFT pixel
/// centers: grid node x is (x + .5)/width, not x/(width-1).
public struct LocalWarpCoordinateMap: Sendable {
    public struct Point: Equatable, Sendable {
        public let x: Double, y: Double
        public init(x: Double, y: Double) { self.x = x; self.y = y }
    }
    public enum MapError: Error { case invalidField, boundary, noncontractive, invalidPoint, outside, inverseDidNotConverge, binding }
    public let assetID: UUID
    public let originalSHA256: String
    public let geometryRevision: String
    public let inputWidth: Int, inputHeight: Int
    public let width: Int, height: Int
    private let sourceX: [Float], sourceY: [Float]
    private static let lipschitz = 0.65
    private static let tolerance = 1e-5

    public init(assetID: UUID, originalSHA256: String, geometryRevision: String,
                inputWidth: Int, inputHeight: Int, width: Int, height: Int,
                sourceX: [Float], sourceY: [Float]) throws {
        try Task.checkCancellation()
        guard isSHA256(originalSHA256), !geometryRevision.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              geometryRevision.utf8.count <= 512,
              (1...65_536).contains(inputWidth), (1...65_536).contains(inputHeight) else { throw MapError.binding }
        guard width > 0, height > 0, width <= 8_000_000, height <= 8_000_000,
              width <= 8_000_000 / height, sourceX.count == width * height,
              sourceY.count == sourceX.count else { throw MapError.invalidField }
        // Swift Array value semantics isolate subsequent caller mutations (COW).
        self.assetID = assetID; self.originalSHA256 = originalSHA256.lowercased()
        self.geometryRevision = geometryRevision; self.inputWidth = inputWidth; self.inputHeight = inputHeight
        self.width = width; self.height = height; self.sourceX = sourceX; self.sourceY = sourceY
        for y in 0..<height {
            try Task.checkCancellation()
            for x in 0..<width {
                let i = y * width + x
                guard sourceX[i].isFinite, sourceY[i].isFinite else { throw MapError.invalidField }
                if x == 0 || y == 0 || x == width-1 || y == height-1 {
                    guard Double(sourceX[i]) == Double(x), Double(sourceY[i]) == Double(y) else { throw MapError.boundary }
                }
            }
        }
        if width > 1 && height > 1 {
            for y in 0..<(height-1) {
                try Task.checkCancellation()
                for x in 0..<(width-1) {
                    let i = y * width + x
                    try Self.certify(Double(sourceX[i])-Double(x), Double(sourceX[i+1])-Double(x+1),
                        Double(sourceX[i+width])-Double(x), Double(sourceX[i+width+1])-Double(x+1))
                    try Self.certify(Double(sourceY[i])-Double(y), Double(sourceY[i+1])-Double(y),
                        Double(sourceY[i+width])-Double(y+1), Double(sourceY[i+width+1])-Double(y+1))
                }
            }
        }
        try Task.checkCancellation()
    }
    private static func certify(_ a: Double, _ b: Double, _ c: Double, _ d: Double) throws {
        guard max(abs(b-a),abs(d-c)) + max(abs(c-a),abs(d-b)) <= lipschitz else { throw MapError.noncontractive }
    }
    public func validateBinding(assetID: UUID, originalSHA256: String, geometryRevision: String,
                                inputWidth: Int, inputHeight: Int) throws {
        guard self.assetID == assetID, self.originalSHA256 == originalSHA256.lowercased(),
              self.geometryRevision == geometryRevision, self.inputWidth == inputWidth,
              self.inputHeight == inputHeight else { throw MapError.binding }
    }
    private func checked(_ p: Point) throws {
        try Task.checkCancellation()
        guard p.x.isFinite, p.y.isFinite, (0...1).contains(p.x), (0...1).contains(p.y) else { throw MapError.invalidPoint }
    }
    private func displacement(_ qx: Double, _ qy: Double) -> Point {
        let x = max(0,min(Double(width-1),qx)), y = max(0,min(Double(height-1),qy))
        let ax = Int(floor(x)), ay = Int(floor(y)), bx = min(width-1,ax+1), by = min(height-1,ay+1)
        let u = x-Double(ax), v = y-Double(ay)
        let indices = [ay*width+ax,ay*width+bx,by*width+ax,by*width+bx]
        let weights = [(1-u)*(1-v),u*(1-v),(1-u)*v,u*v]
        var dx = 0.0, dy = 0.0
        for k in 0..<4 {
            let i = indices[k]
            dx += (Double(sourceX[i])-Double(i%width))*weights[k]
            dy += (Double(sourceY[i])-Double(i/width))*weights[k]
        }
        return Point(x: dx, y: dy)
    }
    private func normalized(_ x: Double, _ y: Double) throws -> Point {
        guard x.isFinite, y.isFinite, x >= -0.5-Self.tolerance, y >= -0.5-Self.tolerance,
              x <= Double(width)-0.5+Self.tolerance, y <= Double(height)-0.5+Self.tolerance else { throw MapError.outside }
        return Point(x: max(0,min(1,(x+0.5)/Double(width))), y: max(0,min(1,(y+0.5)/Double(height))))
    }
    public func outputToSource(_ p: Point) throws -> Point {
        try checked(p)
        let x = p.x*Double(width)-0.5, y = p.y*Double(height)-0.5, d = displacement(x,y)
        return try normalized(x+d.x,y+d.y)
    }
    public func sourceToOutput(_ p: Point) throws -> Point {
        try checked(p)
        let sx = p.x*Double(width)-0.5, sy = p.y*Double(height)-0.5
        var x = sx, y = sy
        for _ in 0..<96 {
            try Task.checkCancellation()
            let d = displacement(x,y), residual = max(abs(x+d.x-sx),abs(y+d.y-sy))
            if residual <= Self.tolerance && residual/(1-Self.lipschitz) <= Self.tolerance {
                return try normalized(x,y)
            }
            x = sx-d.x; y = sy-d.y
        }
        throw MapError.inverseDidNotConverge
    }
}
