import Foundation

public enum ShootingMode: String, Codable, CaseIterable, Sendable { case wedding, nightWork, fashion, beauty, custom }
public enum RetouchCategory: String, Codable, Sendable { case face, skin, body }
public enum RetouchControl: String, Codable, CaseIterable, Sendable {
    case faceBrightness, poreReduction, skinTexture, underEyeAdjustment, nasolabialFoldAdjustment
    case eyeAdjustment, teethAdjustment, localFaceContrast, hairAdjustment
    case skinTone, skinSmoothness, blemishReduction, stretchMarkReduction, scarReduction
    case scratchMarkReduction, unevenSkinTone, localRedness, textureCorrection
    case waist, abdomen, bust, arm, leg, shoulder, bodyLine, silhouette, localShapeAdjustment

    public var category: RetouchCategory {
        switch self {
        case .faceBrightness, .poreReduction, .skinTexture, .underEyeAdjustment, .nasolabialFoldAdjustment,
             .eyeAdjustment, .teethAdjustment, .localFaceContrast, .hairAdjustment: .face
        case .skinTone, .skinSmoothness, .blemishReduction, .stretchMarkReduction, .scarReduction,
             .scratchMarkReduction, .unevenSkinTone, .localRedness, .textureCorrection: .skin
        case .waist, .abdomen, .bust, .arm, .leg, .shoulder, .bodyLine, .silhouette, .localShapeAdjustment: .body
        }
    }
}

public enum RetouchStrengthLevel: String, Codable, CaseIterable, Sendable { case off, low, medium, high, custom }

public struct RetouchStrength: Codable, Equatable, Sendable {
    public let level: RetouchStrengthLevel
    public let customValue: Double?

    /// No invented numeric mapping for LOW/MEDIUM/HIGH, and no new feature-specific range.
    public init(level: RetouchStrengthLevel, customValue: Double? = nil) throws {
        self.level = level
        self.customValue = customValue
        try validate()
    }

    public func validate() throws {
        guard (level == .custom) == (customValue != nil), customValue?.isFinite != false else {
            throw SuiteValidationError.invalidValue("retouchStrength")
        }
    }
    private enum CodingKeys: String, CodingKey, CaseIterable { case level, customValue }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(level: c.decode(RetouchStrengthLevel.self, forKey: .level),
                      customValue: c.decodeIfPresent(Double.self, forKey: .customValue))
    }
}

public struct RetouchSetting: Codable, Equatable, Sendable {
    public let control: RetouchControl
    public let strength: RetouchStrength
    public init(control: RetouchControl, strength: RetouchStrength) { self.control = control; self.strength = strength }
}

public struct PersonLookIntent: Codable, Equatable, Sendable {
    /// Stable session identity, never an array index meaning "everyone in the next image".
    public let personID: UUID
    public let settings: [RetouchSetting]
    public init(personID: UUID, settings: [RetouchSetting]) { self.personID = personID; self.settings = settings }
    public func validate() throws {
        guard Set(settings.map(\.control)).count == settings.count else { throw SuiteValidationError.invalidValue("duplicatePersonControl") }
        try settings.forEach { try $0.strength.validate() }
    }
}

public enum GlobalColorParameter: String, Codable, CaseIterable, Sendable {
    case whiteBalance, tint, exposure, contrast, highlight, shadow, white, black, temperature
    case saturation, vibrance, hsl, toneCurve, colorMatrix, selectiveSkinProtection, colorGrading
}
public struct GlobalColorIntent: Codable, Equatable, Sendable {
    public let parameter: GlobalColorParameter
    public let value: RecipeValue
    public init(parameter: GlobalColorParameter, value: RecipeValue) { self.parameter = parameter; self.value = value }
}

public enum PersonalColorDirection: String, Codable, CaseIterable, Sendable { case spring, summer, autumn, winter }
public enum PersonalColorSelectionOrigin: String, Codable, Sendable { case user, photographer, explicitlyAcceptedSuggestion }
public enum PersonalColorParameter: String, Codable, CaseIterable, Sendable {
    case skinToneDirection, whiteBalanceBias, tint, highlightColor, shadowColor
    case saturationBalance, hsl, lipSkinColor, colorGrading
}
public struct PersonalColorAdjustment: Codable, Equatable, Sendable {
    public let parameter: PersonalColorParameter
    public let value: RecipeValue
    public init(parameter: PersonalColorParameter, value: RecipeValue) { self.parameter = parameter; self.value = value }
}

/// Optional, explicitly selected color direction; it has no face geometry/body/beautification-strength fields.
public struct PersonalColorIntent: Codable, Equatable, Sendable {
    public let direction: PersonalColorDirection
    public let selectionOrigin: PersonalColorSelectionOrigin
    public let targetPersonIDs: Set<UUID>
    public let adjustments: [PersonalColorAdjustment]

    public init(direction: PersonalColorDirection, selectionOrigin: PersonalColorSelectionOrigin,
                targetPersonIDs: Set<UUID>, adjustments: [PersonalColorAdjustment]) throws {
        self.direction = direction
        self.selectionOrigin = selectionOrigin
        self.targetPersonIDs = targetPersonIDs
        self.adjustments = adjustments
        try validate()
    }

    public func validate() throws {
        guard !targetPersonIDs.isEmpty, Set(adjustments.map(\.parameter)).count == adjustments.count else {
            throw SuiteValidationError.invalidValue("personalColorIntent")
        }
        try adjustments.forEach { try $0.value.validate() }
    }
    private enum CodingKeys: String, CodingKey, CaseIterable { case direction, selectionOrigin, targetPersonIDs, adjustments }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(direction: c.decode(PersonalColorDirection.self, forKey: .direction),
                      selectionOrigin: c.decode(PersonalColorSelectionOrigin.self, forKey: .selectionOrigin),
                      targetPersonIDs: c.decode(Set<UUID>.self, forKey: .targetPersonIDs),
                      adjustments: c.decode([PersonalColorAdjustment].self, forKey: .adjustments))
    }
}

public struct SessionLook: Codable, Equatable, Sendable, Identifiable {
    public let schemaVersion: Int
    public let id: UUID
    public let revision: Int
    public let referenceAssetID: UUID
    public let referenceRecipeRevision: Int
    public let mode: ShootingMode
    public let globalColor: [GlobalColorIntent]
    public let people: [PersonLookIntent]
    public let personalColor: PersonalColorIntent?
    /// Data-only intents, interpreted only by a supporting adapter; no default numeric presets are invented.
    public let textureIntent: [String: RecipeValue]
    public let outputIntent: [String: RecipeValue]

    public init(id: UUID = UUID(), revision: Int, referenceAssetID: UUID, referenceRecipeRevision: Int,
                mode: ShootingMode, globalColor: [GlobalColorIntent], people: [PersonLookIntent],
                personalColor: PersonalColorIntent? = nil, textureIntent: [String: RecipeValue] = [:],
                outputIntent: [String: RecipeValue] = [:]) throws {
        schemaVersion = 1
        self.id = id
        self.revision = revision
        self.referenceAssetID = referenceAssetID
        self.referenceRecipeRevision = referenceRecipeRevision
        self.mode = mode
        self.globalColor = globalColor
        self.people = people
        self.personalColor = personalColor
        self.textureIntent = textureIntent
        self.outputIntent = outputIntent
        try validate()
    }

    public func validate() throws {
        guard schemaVersion == 1 else { throw SuiteValidationError.unsupportedSchema(schemaVersion) }
        guard (0...9_007_199_254_740_991).contains(revision),
              (0...9_007_199_254_740_991).contains(referenceRecipeRevision),
              Set(people.map(\.personID)).count == people.count,
              Set(globalColor.map(\.parameter)).count == globalColor.count else {
            throw SuiteValidationError.invalidValue("sessionLook")
        }
        try people.forEach { try $0.validate() }
        try globalColor.forEach { try $0.value.validate() }
        try personalColor?.validate()
        try RecipeValue.object(textureIntent).validate()
        try RecipeValue.object(outputIntent).validate()
    }

    /// Returns metadata only, not processed pixels or an applied Recipe. The renderer currently rejects this extension.
    public func recipeExtensionValue() throws -> RecipeValue {
        try validate()
        return try JSONDecoder().decode(RecipeValue.self, from: JSONEncoder().encode(self))
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case schemaVersion, id, revision, referenceAssetID, referenceRecipeRevision, mode
        case globalColor, people, personalColor, textureIntent, outputIntent
    }

    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
        id = try c.decode(UUID.self, forKey: .id)
        revision = try c.decode(Int.self, forKey: .revision)
        referenceAssetID = try c.decode(UUID.self, forKey: .referenceAssetID)
        referenceRecipeRevision = try c.decode(Int.self, forKey: .referenceRecipeRevision)
        mode = try c.decode(ShootingMode.self, forKey: .mode)
        globalColor = try c.decode([GlobalColorIntent].self, forKey: .globalColor)
        people = try c.decode([PersonLookIntent].self, forKey: .people)
        personalColor = try c.decodeIfPresent(PersonalColorIntent.self, forKey: .personalColor)
        textureIntent = try c.decode([String: RecipeValue].self, forKey: .textureIntent)
        outputIntent = try c.decode([String: RecipeValue].self, forKey: .outputIntent)
        try validate()
    }
}

public struct SessionApplyControls: Codable, Equatable, Sendable {
    public let autoApply: Bool
    public let globalColor: Bool
    public let faceRetouch: Bool
    public let skinRetouch: Bool
    public let bodyRetouch: Bool
    public let personalColor: Bool

    public init(autoApply: Bool, globalColor: Bool, faceRetouch: Bool, skinRetouch: Bool,
                bodyRetouch: Bool, personalColor: Bool) {
        self.autoApply = autoApply; self.globalColor = globalColor; self.faceRetouch = faceRetouch
        self.skinRetouch = skinRetouch; self.bodyRetouch = bodyRetouch; self.personalColor = personalColor
    }

    public func permits(_ category: RetouchCategory) -> Bool {
        switch category {
        case .face: faceRetouch
        case .skin: skinRetouch
        case .body: bodyRetouch
        }
    }
}

public enum LookApplicationKind: String, Codable, Sendable { case newCapture, explicitPastPhoto }

public struct SessionImageBinding: Codable, Equatable, Sendable, Identifiable {
    public let id: UUID
    public let sessionID: UUID
    public let assetID: UUID
    public let originalSHA256: String
    public let inputRecipeRevision: Int
    public let lookID: UUID
    public let lookRevision: Int
    public let kind: LookApplicationKind
    public let controls: SessionApplyControls

    init(sessionID: UUID, checkpoint: ProjectCheckpoint, look: SessionLook,
         kind: LookApplicationKind, controls: SessionApplyControls) throws {
        try checkpoint.validate(); try look.validate()
        id = UUID(); self.sessionID = sessionID
        assetID = checkpoint.asset.id; originalSHA256 = checkpoint.asset.sha256
        inputRecipeRevision = checkpoint.revision; lookID = look.id; lookRevision = look.revision
        self.kind = kind; self.controls = controls
    }
}

public struct PhotoPersonExclusion: Codable, Equatable, Hashable, Sendable {
    public let assetID: UUID
    public let personID: UUID
    public init(assetID: UUID, personID: UUID) { self.assetID = assetID; self.personID = personID }
}

public enum SessionLookError: Error, Equatable, Sendable {
    case revisionConflict, invalidBinding, explicitActionRequired, photoNotInSession, analysisDoesNotMatchPhoto
}

/// A non-destructive state model. Persistence, ingest observation, queue execution and ML adapters remain separate.
public struct TetherSessionState: Codable, Equatable, Sendable {
    public let id: UUID
    public private(set) var lookRevisions: [SessionLook]
    public private(set) var controls: SessionApplyControls
    public private(set) var bindings: [SessionImageBinding]
    public private(set) var excludedPhotoIDs: Set<UUID>
    public private(set) var excludedPersonIDs: Set<UUID>
    public private(set) var photoPersonExclusions: Set<PhotoPersonExclusion>
    public var currentLook: SessionLook { lookRevisions[lookRevisions.count - 1] }

    public init(id: UUID = UUID(), look: SessionLook, controls: SessionApplyControls) throws {
        try look.validate()
        self.id = id; lookRevisions = [look]; self.controls = controls
        bindings = []; excludedPhotoIDs = []; excludedPersonIDs = []; photoPersonExclusions = []
    }

    public mutating func updateLook(_ next: SessionLook, expectedRevision: Int) throws {
        try next.validate()
        guard currentLook.id == next.id, currentLook.revision == expectedRevision,
              expectedRevision < 9_007_199_254_740_991, next.revision == expectedRevision + 1 else {
            throw SessionLookError.revisionConflict
        }
        // Existing bindings and recipes are untouched. Only subsequently accepted captures select this revision.
        lookRevisions.append(next)
    }

    public mutating func setControls(_ controls: SessionApplyControls) { self.controls = controls }
    public mutating func excludePhoto(_ assetID: UUID) { excludedPhotoIDs.insert(assetID) }
    public mutating func includePhoto(_ assetID: UUID) { excludedPhotoIDs.remove(assetID) }
    public mutating func excludePerson(_ personID: UUID) { excludedPersonIDs.insert(personID) }
    public mutating func includePerson(_ personID: UUID) { excludedPersonIDs.remove(personID) }
    public mutating func excludePerson(_ personID: UUID, in assetID: UUID) { photoPersonExclusions.insert(.init(assetID: assetID, personID: personID)) }
    public mutating func includePerson(_ personID: UUID, in assetID: UUID) { photoPersonExclusions.remove(.init(assetID: assetID, personID: personID)) }

    public mutating func bindNewPhoto(_ checkpoint: ProjectCheckpoint) throws -> SessionImageBinding {
        try checkpoint.validate()
        if let previous = bindings.first(where: { $0.assetID == checkpoint.asset.id && $0.kind == .newCapture }) {
            guard previous.originalSHA256 == checkpoint.asset.sha256 else { throw SessionLookError.invalidBinding }
            return previous
        }
        let binding = try SessionImageBinding(sessionID: id, checkpoint: checkpoint, look: currentLook,
                                               kind: .newCapture, controls: controls)
        bindings.append(binding)
        return binding
    }

    public mutating func reapplyPastPhotos(_ checkpoints: [ProjectCheckpoint], explicitlyRequested: Bool) throws -> [SessionImageBinding] {
        guard explicitlyRequested else { throw SessionLookError.explicitActionRequired }
        guard Set(checkpoints.map { $0.asset.id }).count == checkpoints.count else { throw SessionLookError.invalidBinding }
        // Validate all candidates before changing the state; failures cannot partially enqueue a batch.
        let planned = try checkpoints.map { checkpoint in
            guard bindings.contains(where: { $0.assetID == checkpoint.asset.id && $0.originalSHA256 == checkpoint.asset.sha256 }) else {
                throw SessionLookError.photoNotInSession
            }
            return try SessionImageBinding(sessionID: id, checkpoint: checkpoint, look: currentLook,
                                            kind: .explicitPastPhoto, controls: controls)
        }
        bindings.append(contentsOf: planned)
        return planned
    }

    public func validate() throws {
        guard !lookRevisions.isEmpty else { throw SuiteValidationError.invalidValue("emptySessionLookHistory") }
        for (index, look) in lookRevisions.enumerated() {
            try look.validate()
            if index > 0 {
                let previous = lookRevisions[index - 1]
                guard look.id == previous.id, previous.revision < 9_007_199_254_740_991,
                      look.revision == previous.revision + 1 else { throw SessionLookError.revisionConflict }
            }
        }
        guard Set(bindings.map(\.id)).count == bindings.count else { throw SessionLookError.invalidBinding }
        let originals = bindings.filter { $0.kind == .newCapture }
        guard Set(originals.map(\.assetID)).count == originals.count else { throw SessionLookError.invalidBinding }
        for binding in bindings {
            guard binding.sessionID == id, isSHA256(binding.originalSHA256), binding.inputRecipeRevision >= 0,
                  lookRevisions.contains(where: { $0.id == binding.lookID && $0.revision == binding.lookRevision }) else {
                throw SessionLookError.invalidBinding
            }
        }
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, lookRevisions, controls, bindings, excludedPhotoIDs, excludedPersonIDs, photoPersonExclusions
    }

    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(UUID.self, forKey: .id)
        lookRevisions = try c.decode([SessionLook].self, forKey: .lookRevisions)
        controls = try c.decode(SessionApplyControls.self, forKey: .controls)
        bindings = try c.decode([SessionImageBinding].self, forKey: .bindings)
        excludedPhotoIDs = try c.decode(Set<UUID>.self, forKey: .excludedPhotoIDs)
        excludedPersonIDs = try c.decode(Set<UUID>.self, forKey: .excludedPersonIDs)
        photoPersonExclusions = try c.decode(Set<PhotoPersonExclusion>.self, forKey: .photoPersonExclusions)
        try validate()
    }
}
