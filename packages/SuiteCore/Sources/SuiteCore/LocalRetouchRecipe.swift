import Foundation

/// Re-renderable manual instructions in the uncropped upright input domain.
/// No bitmap, identity inference or automatic defect detection is persisted.
public struct LocalRetouchRecipe: Codable, Equatable, Sendable {
    public struct Rectangle: Codable, Equatable, Sendable {
        public let x: Double, y: Double, width: Double, height: Double
        public init(x: Double, y: Double, width: Double, height: Double) throws {
            self.x = x; self.y = y; self.width = width; self.height = height; try validate()
        }
        public func validate() throws {
            guard [x,y,width,height].allSatisfy(\.isFinite), x >= 0, y >= 0,
                  width > 0, height > 0, x + width <= 1, y + height <= 1 else { throw Self.invalid }
        }
        private static var invalid: SuiteValidationError { .invalidValue("localRetouchRectangle") }
        private enum CodingKeys: String, CodingKey, CaseIterable { case x,y,width,height }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(x: c.decode(Double.self, forKey: .x), y: c.decode(Double.self, forKey: .y),
                          width: c.decode(Double.self, forKey: .width), height: c.decode(Double.self, forKey: .height))
        }
    }
    public struct Effect: Codable, Equatable, Sendable {
        public enum Kind: String, Codable, Sendable { case skinSmoothing, localRepair }
        public let kind: Kind
        public let strength: Double
        public let radiusReferencePixels: Double?
        /// Source = destination + offset; normalized x right/y UP, unlike rectangle y.
        public let sourceOffsetX: Double?, sourceOffsetY: Double?
        public init(kind: Kind, strength: Double, radiusReferencePixels: Double? = nil,
                    sourceOffsetX: Double? = nil, sourceOffsetY: Double? = nil) throws {
            self.kind = kind; self.strength = strength; self.radiusReferencePixels = radiusReferencePixels
            self.sourceOffsetX = sourceOffsetX; self.sourceOffsetY = sourceOffsetY; try validate()
        }
        public func validate() throws {
            guard strength.isFinite, (0...1).contains(strength) else { throw Self.invalid }
            switch kind {
            case .skinSmoothing:
                guard let r = radiusReferencePixels, r.isFinite, r > 0, r <= 32,
                      sourceOffsetX == nil, sourceOffsetY == nil else { throw Self.invalid }
            case .localRepair:
                guard radiusReferencePixels == nil, let x = sourceOffsetX, let y = sourceOffsetY,
                      x.isFinite, y.isFinite, abs(x) < 1, abs(y) < 1, x != 0 || y != 0 else { throw Self.invalid }
            }
        }
        private static var invalid: SuiteValidationError { .invalidValue("localRetouchEffect") }
        private enum CodingKeys: String, CodingKey, CaseIterable { case kind,strength,radiusReferencePixels,sourceOffsetX,sourceOffsetY }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(kind: c.decode(Kind.self, forKey: .kind), strength: c.decode(Double.self, forKey: .strength),
                radiusReferencePixels: c.decodeIfPresent(Double.self, forKey: .radiusReferencePixels),
                sourceOffsetX: c.decodeIfPresent(Double.self, forKey: .sourceOffsetX),
                sourceOffsetY: c.decodeIfPresent(Double.self, forKey: .sourceOffsetY))
        }
    }
    public struct Layer: Codable, Equatable, Sendable {
        public let id: UUID
        public let selection: Rectangle
        public let protection: Rectangle?
        public let effect: Effect
        public init(id: UUID = UUID(), selection: Rectangle, protection: Rectangle? = nil, effect: Effect) throws {
            self.id = id; self.selection = selection; self.protection = protection; self.effect = effect; try validate()
        }
        public func validate() throws {
            try selection.validate(); try protection?.validate(); try effect.validate()
            if effect.kind == .localRepair, let dx = effect.sourceOffsetX, let dy = effect.sourceOffsetY {
                // Rectangles are top-left; donor dy is bottom-left/upward.
                guard selection.x + dx >= 0, selection.x + selection.width + dx <= 1,
                      selection.y - dy >= 0, selection.y + selection.height - dy <= 1 else {
                    throw SuiteValidationError.invalidValue("localRetouchDonorBounds")
                }
            }
        }
        private enum CodingKeys: String, CodingKey, CaseIterable { case id,selection,protection,effect }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(id: c.decode(UUID.self, forKey: .id), selection: c.decode(Rectangle.self, forKey: .selection),
                protection: c.decodeIfPresent(Rectangle.self, forKey: .protection), effect: c.decode(Effect.self, forKey: .effect))
        }
    }
    public let schemaVersion: Int
    public let assetID: UUID
    public let originalSHA256: String
    public let referenceWidth: Int, referenceHeight: Int
    public let layers: [Layer]
    public var referenceAspect: Double { Double(referenceWidth) / Double(referenceHeight) }
    public init(assetID: UUID, originalSHA256: String, referenceWidth: Int, referenceHeight: Int, layers: [Layer]) throws {
        schemaVersion = 1; self.assetID = assetID; self.originalSHA256 = originalSHA256.lowercased()
        self.referenceWidth = referenceWidth; self.referenceHeight = referenceHeight; self.layers = layers; try validate()
    }
    public func validate() throws {
        guard schemaVersion == 1, isSHA256(originalSHA256), (1...1600).contains(referenceWidth),
              (1...1600).contains(referenceHeight), !layers.isEmpty, layers.count <= 16,
              Set(layers.map(\.id)).count == layers.count else { throw SuiteValidationError.invalidValue("localRetouchRecipe") }
        try layers.forEach { try $0.validate() }
    }
    public func validate(asset: AssetRecord) throws {
        try validate(); try asset.validate()
        guard asset.id == assetID, asset.sha256.lowercased() == originalSHA256 else { throw SuiteValidationError.invalidValue("localRetouchAsset") }
    }
    private enum CodingKeys: String, CodingKey, CaseIterable { case schemaVersion,assetID,originalSHA256,referenceWidth,referenceHeight,layers }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let version = try c.decode(Int.self, forKey: .schemaVersion)
        guard version == 1 else { throw SuiteValidationError.unsupportedSchema(version) }
        var list = try c.nestedUnkeyedContainer(forKey: .layers); var layers: [Layer] = []
        while !list.isAtEnd {
            guard layers.count < 16 else { throw SuiteValidationError.invalidValue("localRetouchLayerLimit") }
            layers.append(try list.decode(Layer.self))
        }
        try self.init(assetID: c.decode(UUID.self, forKey: .assetID), originalSHA256: c.decode(String.self, forKey: .originalSHA256),
            referenceWidth: c.decode(Int.self, forKey: .referenceWidth), referenceHeight: c.decode(Int.self, forKey: .referenceHeight), layers: layers)
    }
}

extension RecipeParameters {
    public func localRetouchRecipe() throws -> LocalRetouchRecipe? {
        guard let value = extendedParameters["localRetouch"] else { return nil }
        return try JSONDecoder().decode(LocalRetouchRecipe.self, from: JSONEncoder().encode(value))
    }
    public func settingLocalRetouch(_ recipe: LocalRetouchRecipe) throws -> RecipeParameters {
        try recipe.validate(); var next = self
        next.extendedParameters["localRetouch"] = try JSONDecoder().decode(RecipeValue.self, from: JSONEncoder().encode(recipe))
        try next.validate(); return next
    }
    public func validateLocalRetouchExtension() throws { _ = try localRetouchRecipe() }
}
