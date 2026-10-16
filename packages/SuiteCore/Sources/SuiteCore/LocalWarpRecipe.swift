import Foundation

/// Ordered manual operations in uncropped upright input coordinates. Current
/// protection applies to the entire list. No model, bitmap or transient map saved.
public struct LocalWarpRecipe: Codable, Equatable, Sendable {
    public static let supportedEngineVersion = "suite-manual-warp-applied-contractive-v1"
    public struct Point: Codable, Equatable, Sendable {
        public let x: Double, y: Double
        public init(x: Double, y: Double) throws {
            guard x.isFinite, y.isFinite, (0...1).contains(x), (0...1).contains(y) else { throw SuiteValidationError.invalidValue("warpCenter") }
            self.x = x; self.y = y
        }
        private enum CodingKeys: String, CodingKey, CaseIterable { case x,y }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(x: c.decode(Double.self, forKey: .x), y: c.decode(Double.self, forKey: .y))
        }
    }
    public struct Operation: Codable, Equatable, Sendable {
        public enum Kind: String, Codable, Sendable { case translate,scaleX,scaleY,scale,rotate,mShape,smooth,restore,pushLeft }
        public let kind: Kind
        public let center: Point
        public let rx: Double, ry: Double, amount: Double, dx: Double, dy: Double, angle: Double
        public init(kind: Kind, center: Point, rx: Double, ry: Double, amount: Double = 0,
                    dx: Double = 0, dy: Double = 0, angle: Double = 0) throws {
            self.kind = kind; self.center = center; self.rx = rx; self.ry = ry
            self.amount = amount; self.dx = dx; self.dy = dy; self.angle = angle
            _ = try runtimeOperation()
        }
        public func runtimeOperation() throws -> LocalWarpFieldBuilder.Operation {
            guard let type = LocalWarpFieldBuilder.Kind(rawValue: kind.rawValue) else { throw SuiteValidationError.invalidValue("warpKind") }
            return try .init(kind: type, center: .init(x: center.x, y: center.y), rx: rx, ry: ry,
                amount: amount, dx: dx, dy: dy, angle: angle)
        }
        private enum CodingKeys: String, CodingKey, CaseIterable { case kind,center,rx,ry,amount,dx,dy,angle }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(kind: c.decode(Kind.self, forKey: .kind), center: c.decode(Point.self, forKey: .center),
                rx: c.decode(Double.self, forKey: .rx), ry: c.decode(Double.self, forKey: .ry),
                amount: c.decode(Double.self, forKey: .amount), dx: c.decode(Double.self, forKey: .dx),
                dy: c.decode(Double.self, forKey: .dy), angle: c.decode(Double.self, forKey: .angle))
        }
    }
    public let schemaVersion: Int
    public let engineVersion: String
    public let assetID: UUID
    public let originalSHA256: String
    public let referenceWidth: Int, referenceHeight: Int
    public let operations: [Operation]
    public let protectionRectangle: LocalRetouchRecipe.Rectangle?
    /// Immutable raw L8 TOP-LEFT allowed-person region. Only 255 permits a
    /// displaced destination or positive-weight donor; uncertain edges protect.
    /// Renderers must resolve this exact asset and reject dimension mismatch.
    /// It is not silently scaled from preview to Final and is not a body mesh.
    public let bodyMask: LocalBackdropRecipe.MaskReference?
    public var referenceAspect: Double { Double(referenceWidth) / Double(referenceHeight) }
    public init(assetID: UUID, originalSHA256: String, referenceWidth: Int, referenceHeight: Int,
                operations: [Operation], protectionRectangle: LocalRetouchRecipe.Rectangle? = nil,
                bodyMask: LocalBackdropRecipe.MaskReference? = nil) throws {
        schemaVersion = 1; engineVersion = Self.supportedEngineVersion
        self.assetID = assetID; self.originalSHA256 = originalSHA256.lowercased()
        self.referenceWidth = referenceWidth; self.referenceHeight = referenceHeight
        self.operations = operations; self.protectionRectangle = protectionRectangle; self.bodyMask = bodyMask; try validate()
    }
    public func validate() throws {
        guard schemaVersion == 1, engineVersion == Self.supportedEngineVersion, isSHA256(originalSHA256),
              (1...1600).contains(referenceWidth), (1...1600).contains(referenceHeight),
              (1...128).contains(operations.count) else { throw SuiteValidationError.invalidValue("localWarpRecipe") }
        try protectionRectangle?.validate()
        try bodyMask?.validate()
        if let bodyMask {
            guard abs(Double(bodyMask.width)/Double(bodyMask.height)-referenceAspect)
                <= 1/Double(referenceHeight)+1/Double(bodyMask.height) else { throw SuiteValidationError.invalidValue("warpBodyMaskAspect") }
        }
        for op in operations {
            try Task.checkCancellation(); _ = try op.runtimeOperation()
            guard op.rx * Double(referenceWidth) >= 1, op.ry * Double(referenceHeight) >= 1 else {
                throw SuiteValidationError.invalidValue("localWarpReferenceRadius")
            }
        }
    }
    public func validate(asset: AssetRecord) throws {
        try validate(); try asset.validate()
        guard asset.id == assetID, asset.sha256.lowercased() == originalSHA256 else { throw SuiteValidationError.invalidValue("localWarpAsset") }
    }
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case schemaVersion,engineVersion,assetID,originalSHA256,referenceWidth,referenceHeight,operations,protectionRectangle,bodyMask
    }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let version = try c.decode(Int.self, forKey: .schemaVersion)
        guard version == 1 else { throw SuiteValidationError.unsupportedSchema(version) }
        guard try c.decode(String.self, forKey: .engineVersion) == Self.supportedEngineVersion else { throw SuiteValidationError.invalidValue("localWarpEngine") }
        var list = try c.nestedUnkeyedContainer(forKey: .operations), operations: [Operation] = []
        while !list.isAtEnd {
            guard operations.count < 128 else { throw SuiteValidationError.invalidValue("localWarpOperationLimit") }
            operations.append(try list.decode(Operation.self))
        }
        try self.init(assetID: c.decode(UUID.self, forKey: .assetID), originalSHA256: c.decode(String.self, forKey: .originalSHA256),
            referenceWidth: c.decode(Int.self, forKey: .referenceWidth), referenceHeight: c.decode(Int.self, forKey: .referenceHeight),
            operations: operations, protectionRectangle: c.decodeIfPresent(LocalRetouchRecipe.Rectangle.self, forKey: .protectionRectangle),
            bodyMask: c.decodeIfPresent(LocalBackdropRecipe.MaskReference.self, forKey: .bodyMask))
    }
}

extension RecipeParameters {
    public func localWarpRecipe() throws -> LocalWarpRecipe? {
        guard let value = extendedParameters["localWarp"] else { return nil }
        return try JSONDecoder().decode(LocalWarpRecipe.self, from: JSONEncoder().encode(value))
    }
    public func settingLocalWarp(_ recipe: LocalWarpRecipe) throws -> RecipeParameters {
        try recipe.validate(); var next = self
        next.extendedParameters["localWarp"] = try JSONDecoder().decode(RecipeValue.self, from: JSONEncoder().encode(recipe))
        try next.validate(); return next
    }
    public func validateLocalWarpExtension() throws { _ = try localWarpRecipe() }
}
