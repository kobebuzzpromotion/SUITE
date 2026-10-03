import Foundation

/// Photo-local anchor only. Never a cross-photo identity or a reusable segmentation mask.
/// Vision normalized coordinates use the upright image's lower-left origin.
public struct PortraitFaceAnchor: Codable, Equatable, Sendable {
    public let x: Double
    public let y: Double
    public let width: Double
    public let height: Double
    public init(x: Double, y: Double, width: Double, height: Double) throws {
        self.x = x; self.y = y; self.width = width; self.height = height
        try validate()
    }
    public func validate() throws {
        guard [x,y,width,height].allSatisfy(\.isFinite), x >= 0, y >= 0, width > 0, height > 0,
              x + width <= 1, y + height <= 1 else { throw SuiteValidationError.invalidValue("portraitAnchor") }
    }
    public func intersectionOverUnion(_ other: PortraitFaceAnchor) -> Double {
        let w = max(0, min(x + width, other.x + other.width) - max(x, other.x))
        let h = max(0, min(y + height, other.y + other.height) - max(y, other.y))
        let intersection = w * h
        return intersection / (width * height + other.width * other.height - intersection)
    }
    private enum CodingKeys: String, CodingKey, CaseIterable { case x,y,width,height }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(x:c.decode(Double.self,forKey:.x), y:c.decode(Double.self,forKey:.y),
                      width:c.decode(Double.self,forKey:.width), height:c.decode(Double.self,forKey:.height))
    }
}

public enum PortraitAdjustmentType: String, Codable, Sendable { case faceBrightness = "face_brightness" }

public struct PortraitFaceTarget: Codable, Equatable, Sendable, Identifiable {
    public let id: UUID
    public let anchor: PortraitFaceAnchor
    /// Explicit CUSTOM EV. No invented LOW/MEDIUM/HIGH or AUTO beauty preset.
    public let adjustmentType: PortraitAdjustmentType
    public let value: Double
    public var exposureEV: Double { value }
    public init(id: UUID = UUID(), anchor: PortraitFaceAnchor, exposureEV: Double = 0) throws {
        self.id = id; self.anchor = anchor; self.adjustmentType = .faceBrightness; self.value = exposureEV
        try validate()
    }
    public func validate() throws {
        try anchor.validate()
        guard exposureEV.isFinite, (-4...4).contains(exposureEV) else { throw SuiteValidationError.invalidValue("portraitExposureEV") }
    }
    private enum CodingKeys: String, CodingKey, CaseIterable { case id,anchor,adjustmentType,value }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = try c.decode(PortraitAdjustmentType.self,forKey:.adjustmentType)
        guard type == .faceBrightness else { throw SuiteValidationError.invalidValue("unsupportedPortraitAdjustment") }
        try self.init(id:c.decode(UUID.self,forKey:.id), anchor:c.decode(PortraitFaceAnchor.self,forKey:.anchor),
                      exposureEV:c.decode(Double.self,forKey:.value))
    }
}

/// One supported local face-brightness implementation, NOT the complete SessionLook/retouch engine.
public struct PortraitRecipe: Codable, Equatable, Sendable {
    public static let supportedEngineVersion = "apple-vision-face-exposure-1"
    public let schemaVersion: Int
    public let engineVersion: String
    public let assetID: UUID
    public let originalSHA256: String
    public let targets: [PortraitFaceTarget]
    public let createdAt: String
    public let updatedAt: String
    public var personGeometryInventory: PersonGeometryInventory {
        .init(assetID: assetID, originalSHA256: originalSHA256,
              targets: targets.map { .init(id: $0.id, anchor: $0.anchor) })
    }
    public init(assetID: UUID, originalSHA256: String, targets: [PortraitFaceTarget],
                engineVersion: String = PortraitRecipe.supportedEngineVersion,
                createdAt: String? = nil, updatedAt: String? = nil) throws {
        schemaVersion = 1; self.engineVersion = engineVersion; self.assetID = assetID
        self.originalSHA256 = originalSHA256.lowercased(); self.targets = targets
        let now = Self.timestamp()
        self.createdAt = createdAt ?? now; self.updatedAt = updatedAt ?? createdAt ?? now
        try validate()
    }
    public func validate() throws {
        guard schemaVersion == 1, engineVersion == Self.supportedEngineVersion, isSHA256(originalSHA256),
              !targets.isEmpty, targets.count <= 64, Set(targets.map(\.id)).count == targets.count,
              let created = Self.date(createdAt), let updated = Self.date(updatedAt), updated >= created else {
            throw SuiteValidationError.invalidValue("portraitRecipe")
        }
        try targets.forEach { try $0.validate() }
        try PersonGeometryIntegrity.validate(personGeometryInventory)
    }
    public func validate(asset: AssetRecord) throws {
        try validate(); try PersonGeometryIntegrity.validate(personGeometryInventory, asset: asset)
    }
    public func validate(against reference: PortraitRecipe) throws {
        try validate(); try reference.validate()
        try PersonGeometryIntegrity.validate(personGeometryInventory, against: reference.personGeometryInventory)
        for target in targets {
            guard let known = reference.targets.first(where: { $0.id == target.id }),
                  known.anchor == target.anchor, known.adjustmentType == target.adjustmentType else {
                throw SuiteValidationError.invalidValue("portraitPersonBinding")
            }
        }
    }
    public func settingExposure(_ value: Double, targetID: UUID) throws -> PortraitRecipe {
        try validate()
        guard targets.contains(where: { $0.id == targetID }) else { throw SuiteValidationError.invalidValue("portraitTargetMissing") }
        let next = try targets.map { t in try PortraitFaceTarget(id:t.id,anchor:t.anchor,exposureEV:t.id == targetID ? value : t.exposureEV) }
        guard let previousUpdate = Self.date(updatedAt) else { throw SuiteValidationError.invalidValue("portraitRecipe") }
        let editTime = max(previousUpdate, Date())
        return try PortraitRecipe(assetID:assetID,originalSHA256:originalSHA256,targets:next,engineVersion:engineVersion,
                                  createdAt:createdAt,updatedAt:Self.timestamp(editTime))
    }
    public static func timestamp(_ date: Date = Date()) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        f.timeZone = TimeZone(secondsFromGMT:0); return f.string(from:date)
    }
    private static func date(_ value: String) -> Date? {
        guard value.hasSuffix("Z") else { return nil }
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime,.withFractionalSeconds]
        f.timeZone = TimeZone(secondsFromGMT:0)
        if let date = f.date(from:value), f.string(from:date) == value { return date }
        f.formatOptions = [.withInternetDateTime]
        guard let date = f.date(from:value), f.string(from:date) == value else { return nil }
        return date
    }
    private enum CodingKeys: String, CodingKey, CaseIterable { case schemaVersion,engineVersion,assetID,originalSHA256,targets,createdAt,updatedAt }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed:Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy:CodingKeys.self)
        schemaVersion = try c.decode(Int.self,forKey:.schemaVersion)
        engineVersion = try c.decode(String.self,forKey:.engineVersion)
        assetID = try c.decode(UUID.self,forKey:.assetID)
        originalSHA256 = try c.decode(String.self,forKey:.originalSHA256).lowercased()
        targets = try c.decode([PortraitFaceTarget].self,forKey:.targets)
        createdAt = try c.decode(String.self,forKey:.createdAt); updatedAt = try c.decode(String.self,forKey:.updatedAt)
        try validate()
    }
}

extension RecipeParameters {
    public func portraitRecipe() throws -> PortraitRecipe? {
        guard let value = extendedParameters["portrait"] else { return nil }
        return try JSONDecoder().decode(PortraitRecipe.self,from:JSONEncoder().encode(value))
    }
    public func settingPortrait(_ portrait: PortraitRecipe) throws -> RecipeParameters {
        try portrait.validate()
        var next = self
        next.extendedParameters["portrait"] = try JSONDecoder().decode(RecipeValue.self,from:JSONEncoder().encode(portrait))
        try next.validate(); return next
    }
    /// Invoked at rendering/setting boundary; unrelated future extensions remain intact.
    public func validatePortraitExtension() throws { _ = try portraitRecipe() }
}
