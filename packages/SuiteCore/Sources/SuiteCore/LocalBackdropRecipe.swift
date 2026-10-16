import Foundation

/// Content-addressed, non-destructive backdrop. The raw L8 mask is top-left row
/// order at exact upright input dimensions; implicit enlargement for Final is forbidden.
public struct LocalBackdropRecipe: Codable, Equatable, Sendable {
    public struct MaskReference: Codable, Equatable, Sendable {
        public let sha256: String
        public let width: Int, height: Int, byteCount: Int
        public init(sha256: String, width: Int, height: Int, byteCount: Int) throws {
            self.sha256 = sha256.lowercased(); self.width = width; self.height = height; self.byteCount = byteCount
            try validate()
        }
        public func validate() throws {
            guard isSHA256(sha256), (1...32768).contains(width), (1...32768).contains(height),
                  width * height <= 8_000_000, byteCount == width * height else { throw SuiteValidationError.invalidValue("backdropFinalMask") }
        }
        private enum CodingKeys: String, CodingKey, CaseIterable { case sha256,width,height,byteCount }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(sha256: c.decode(String.self, forKey: .sha256), width: c.decode(Int.self, forKey: .width),
                          height: c.decode(Int.self, forKey: .height), byteCount: c.decode(Int.self, forKey: .byteCount))
        }
    }
    public struct Background: Codable, Equatable, Sendable {
        public let assetID: UUID
        public let version: String
        public let sha256: String
        public let byteCount: Int
        public let width: Int, height: Int
        public init(assetID: UUID, version: String, sha256: String, byteCount: Int, width: Int, height: Int) throws {
            self.assetID = assetID; self.version = version; self.sha256 = sha256.lowercased()
            self.byteCount = byteCount; self.width = width; self.height = height
            try validate()
        }
        public func validate() throws {
            guard !version.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  version.utf8.count <= 256, !version.contains("\0"), isSHA256(sha256),
                  (1...32 * 1024 * 1024).contains(byteCount),
                  (1...32768).contains(width), (1...32768).contains(height), width * height <= 8_000_000 else {
                throw SuiteValidationError.invalidValue("backdropBackground")
            }
        }
        private enum CodingKeys: String, CodingKey, CaseIterable { case assetID,version,sha256,byteCount,width,height }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(assetID: c.decode(UUID.self, forKey: .assetID), version: c.decode(String.self, forKey: .version),
                sha256: c.decode(String.self, forKey: .sha256), byteCount: c.decode(Int.self, forKey: .byteCount),
                width: c.decode(Int.self, forKey: .width), height: c.decode(Int.self, forKey: .height))
        }
    }
    /// Normalized canvas placement, top-left x right/y down, matching CompositeRenderer.
    public struct Placement: Codable, Equatable, Sendable {
        public let x: Double, y: Double, width: Double, height: Double
        public init(x: Double, y: Double, width: Double, height: Double) throws {
            self.x = x; self.y = y; self.width = width; self.height = height; try validate()
        }
        public func validate() throws {
            guard [x,y,width,height].allSatisfy(\.isFinite), (-4...4).contains(x), (-4...4).contains(y),
                  (0.001...8).contains(width), (0.001...8).contains(height) else { throw SuiteValidationError.invalidValue("backdropPlacement") }
        }
        private enum CodingKeys: String, CodingKey, CaseIterable { case x,y,width,height }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(x: c.decode(Double.self, forKey: .x), y: c.decode(Double.self, forKey: .y),
                width: c.decode(Double.self, forKey: .width), height: c.decode(Double.self, forKey: .height))
        }
    }
    public enum Shadow: Codable, Equatable, Sendable {
        case none
        /// Exact mask input pixels, x right/y up. Not inferred original shadow.
        case addDrop(offsetX: Double, offsetY: Double, blurRadius: Double, opacity: Double)
        public func validate() throws {
            if case let .addDrop(x,y,blur,opacity) = self {
                guard [x,y,blur,opacity].allSatisfy(\.isFinite), abs(x) <= 32768, abs(y) <= 32768,
                      (0...128).contains(blur), (0...1).contains(opacity) else { throw SuiteValidationError.invalidValue("backdropShadow") }
            }
        }
        private enum Keys: String, CodingKey { case kind,offsetX,offsetY,blurRadius,opacity }
        public init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: Keys.self)
            switch try c.decode(String.self, forKey: .kind) {
            case "none":
                try rejectUnknownFields(decoder, allowed: ["kind"]); self = .none
            case "addDrop":
                try rejectUnknownFields(decoder, allowed: ["kind","offsetX","offsetY","blurRadius","opacity"])
                self = .addDrop(offsetX: try c.decode(Double.self, forKey: .offsetX), offsetY: try c.decode(Double.self, forKey: .offsetY),
                    blurRadius: try c.decode(Double.self, forKey: .blurRadius), opacity: try c.decode(Double.self, forKey: .opacity))
            default: throw SuiteValidationError.invalidValue("backdropShadowKind")
            }
            try validate()
        }
        public func encode(to encoder: any Encoder) throws {
            try validate(); var c = encoder.container(keyedBy: Keys.self)
            switch self {
            case .none: try c.encode("none", forKey: .kind)
            case let .addDrop(x,y,blur,opacity):
                try c.encode("addDrop", forKey: .kind); try c.encode(x, forKey: .offsetX); try c.encode(y, forKey: .offsetY)
                try c.encode(blur, forKey: .blurRadius); try c.encode(opacity, forKey: .opacity)
            }
        }
    }
    public let schemaVersion: Int
    public let assetID: UUID
    public let originalSHA256: String
    public let background: Background
    public let maskSHA256: String
    public let maskWidth: Int, maskHeight: Int, maskByteCount: Int
    public let placement: Placement
    public let backgroundEV: Double
    public let shadow: Shadow
    public let finalMask: MaskReference?
    public init(assetID: UUID, originalSHA256: String, background: Background, maskSHA256: String,
                maskWidth: Int, maskHeight: Int, maskByteCount: Int, placement: Placement,
                backgroundEV: Double = 0, shadow: Shadow = .none, finalMask: MaskReference? = nil) throws {
        schemaVersion = 1; self.assetID = assetID; self.originalSHA256 = originalSHA256.lowercased()
        self.background = background; self.maskSHA256 = maskSHA256.lowercased()
        self.maskWidth = maskWidth; self.maskHeight = maskHeight; self.maskByteCount = maskByteCount
        self.placement = placement; self.backgroundEV = backgroundEV; self.shadow = shadow
        self.finalMask = finalMask
        try validate()
    }
    public func validate() throws {
        guard schemaVersion == 1, isSHA256(originalSHA256), isSHA256(maskSHA256),
              (1...32768).contains(maskWidth), (1...32768).contains(maskHeight),
              maskWidth * maskHeight <= 8_000_000, maskByteCount == maskWidth * maskHeight,
              backgroundEV.isFinite, (-5...5).contains(backgroundEV) else { throw SuiteValidationError.invalidValue("localBackdrop") }
        try background.validate(); try placement.validate(); try shadow.validate()
        if let finalMask {
            try finalMask.validate()
            guard abs(Double(finalMask.width) / Double(finalMask.height) - Double(maskWidth) / Double(maskHeight))
                <= 1 / Double(maskHeight) + 1 / Double(finalMask.height) else { throw SuiteValidationError.invalidValue("backdropFinalMaskAspect") }
        }
    }
    public func validate(asset: AssetRecord) throws {
        try validate(); try asset.validate()
        guard asset.id == assetID, asset.sha256.lowercased() == originalSHA256 else { throw SuiteValidationError.invalidValue("backdropAsset") }
    }
    /// Decoder dimensions, not export paper dimensions. Never silently resample.
    public func validateInputDimensions(width: Int, height: Int) throws {
        try validate()
        guard width == maskWidth, height == maskHeight else { throw SuiteValidationError.invalidValue("backdropExactMaskDimensions") }
    }
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case schemaVersion,assetID,originalSHA256,background,maskSHA256,maskWidth,maskHeight,maskByteCount,placement,backgroundEV,shadow,finalMask
    }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let version = try c.decode(Int.self, forKey: .schemaVersion)
        guard version == 1 else { throw SuiteValidationError.unsupportedSchema(version) }
        try self.init(assetID: c.decode(UUID.self, forKey: .assetID), originalSHA256: c.decode(String.self, forKey: .originalSHA256),
            background: c.decode(Background.self, forKey: .background), maskSHA256: c.decode(String.self, forKey: .maskSHA256),
            maskWidth: c.decode(Int.self, forKey: .maskWidth), maskHeight: c.decode(Int.self, forKey: .maskHeight),
            maskByteCount: c.decode(Int.self, forKey: .maskByteCount), placement: c.decode(Placement.self, forKey: .placement),
            backgroundEV: c.decode(Double.self, forKey: .backgroundEV), shadow: c.decode(Shadow.self, forKey: .shadow),
            finalMask: c.decodeIfPresent(MaskReference.self, forKey: .finalMask))
    }
    public func encode(to encoder: any Encoder) throws {
        try validate(); var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion); try c.encode(assetID, forKey: .assetID)
        try c.encode(originalSHA256, forKey: .originalSHA256); try c.encode(background, forKey: .background)
        try c.encode(maskSHA256, forKey: .maskSHA256); try c.encode(maskWidth, forKey: .maskWidth)
        try c.encode(maskHeight, forKey: .maskHeight); try c.encode(maskByteCount, forKey: .maskByteCount)
        try c.encode(placement, forKey: .placement); try c.encode(backgroundEV, forKey: .backgroundEV); try c.encode(shadow, forKey: .shadow)
        try c.encodeIfPresent(finalMask, forKey: .finalMask)
    }
}

extension RecipeParameters {
    public func localBackdropRecipe() throws -> LocalBackdropRecipe? {
        guard let value = extendedParameters["localBackdrop"] else { return nil }
        return try JSONDecoder().decode(LocalBackdropRecipe.self, from: JSONEncoder().encode(value))
    }
    public func settingLocalBackdrop(_ recipe: LocalBackdropRecipe) throws -> RecipeParameters {
        try recipe.validate(); var next = self
        next.extendedParameters["localBackdrop"] = try JSONDecoder().decode(RecipeValue.self, from: JSONEncoder().encode(recipe))
        try next.validate(); return next
    }
    public func validateLocalBackdropExtension() throws { _ = try localBackdropRecipe() }
}
