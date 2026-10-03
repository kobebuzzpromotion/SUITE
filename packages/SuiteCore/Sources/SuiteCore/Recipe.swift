import Foundation

public enum SuiteValidationError: Error, Equatable, Sendable {
    case invalidValue(String)
    case unsupportedSchema(Int)
    case unsupportedFields([String])
}

struct AnyField: CodingKey {
    let stringValue: String
    let intValue: Int? = nil
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}

func rejectUnknownFields(_ decoder: any Decoder, allowed: Set<String>) throws {
    let container = try decoder.container(keyedBy: AnyField.self)
    let unknown = container.allKeys.map(\.stringValue).filter { !allowed.contains($0) }.sorted()
    if !unknown.isEmpty { throw SuiteValidationError.unsupportedFields(unknown) }
}

/// All §10 RAW controls remain contract targets; presence here does not assert rendering support.
public enum RAWAdjustment: String, Codable, CaseIterable, Sendable {
    case whiteBalance, tint, exposure, contrast, highlight, shadow, white, black
    case temperature, saturation, vibrance, hsl, toneCurve, sharpness, noiseReduction
    case lensCorrection, postDecodeAdjustments, crop, rotation
}

/// Data only: values cannot contain or execute preset code. Namespaced future parameters round-trip intact.
public indirect enum RecipeValue: Codable, Equatable, Sendable {
    case number(Double), text(String), flag(Bool), array([RecipeValue]), object([String: RecipeValue])

    /// Portable JSON values, shared with the backend. There are no Swift enum-tag envelopes and no null value.
    public init(from decoder: any Decoder) throws {
        let value = try decoder.singleValueContainer()
        guard !value.decodeNil() else { throw SuiteValidationError.invalidValue("recipeNull") }
        if let boolean = try? value.decode(Bool.self) { self = .flag(boolean) }
        else if let number = try? value.decode(Double.self) { self = .number(number) }
        else if let text = try? value.decode(String.self) { self = .text(text) }
        else if let array = try? value.decode([RecipeValue].self) { self = .array(array) }
        else if let object = try? value.decode([String: RecipeValue].self) { self = .object(object) }
        else { throw SuiteValidationError.invalidValue("recipeJSONValue") }
        try validate()
    }

    public func encode(to encoder: any Encoder) throws {
        try validate()
        var container = encoder.singleValueContainer()
        switch self {
        case .number(let value): try container.encode(value)
        case .text(let value): try container.encode(value)
        case .flag(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }

    public func validate(depth: Int = 0) throws {
        guard depth <= 32 else { throw SuiteValidationError.invalidValue("recipeNesting") }
        switch self {
        case .number(let value):
            if !value.isFinite { throw SuiteValidationError.invalidValue("recipeNumber") }
        case .text, .flag: break
        case .array(let values): try values.forEach { try $0.validate(depth: depth + 1) }
        case .object(let values):
            guard values.keys.allSatisfy({ !$0.isEmpty }) else { throw SuiteValidationError.invalidValue("recipeKey") }
            try values.values.forEach { try $0.validate(depth: depth + 1) }
        }
    }
}

public struct RecipeParameters: Codable, Equatable, Sendable {
    public var exposure: Double
    public var contrast: Double
    public var saturation: Double
    public var rotationDegrees: Int
    public var extendedParameters: [String: RecipeValue]
    /// Explicit, portable order. Engines must reject stages they cannot render, never silently drop them.
    public var processingOrder: [RAWAdjustment]

    public init(exposure: Double = 0, contrast: Double = 1, saturation: Double = 1,
                rotationDegrees: Int = 0, extendedParameters: [String: RecipeValue] = [:],
                processingOrder: [RAWAdjustment] = [.exposure, .contrast, .saturation, .rotation]) {
        self.exposure = exposure
        self.contrast = contrast
        self.saturation = saturation
        self.rotationDegrees = rotationDegrees
        self.extendedParameters = extendedParameters
        self.processingOrder = processingOrder
    }

    public func validate() throws {
        guard exposure.isFinite, contrast.isFinite, saturation.isFinite,
              contrast >= 0, saturation >= 0,
              (-9_007_199_254_740_991...9_007_199_254_740_991).contains(rotationDegrees),
              Set(processingOrder).count == processingOrder.count,
              exposure == 0 || processingOrder.contains(.exposure),
              contrast == 1 || processingOrder.contains(.contrast),
              saturation == 1 || processingOrder.contains(.saturation),
              rotationDegrees % 360 == 0 || processingOrder.contains(.rotation),
              (extendedParameters["postDecodeAdjustments"] != nil) == processingOrder.contains(.postDecodeAdjustments),
              extendedParameters.keys.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
            throw SuiteValidationError.invalidValue("recipeParameters")
        }
        try extendedParameters.values.forEach { try $0.validate() }
        try validateCropExportExtensions()
        try validatePortraitExtension()
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case exposure, contrast, saturation, rotationDegrees, extendedParameters, processingOrder
    }

    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let values = try decoder.container(keyedBy: CodingKeys.self)
        exposure = try values.decode(Double.self, forKey: .exposure)
        contrast = try values.decode(Double.self, forKey: .contrast)
        saturation = try values.decode(Double.self, forKey: .saturation)
        rotationDegrees = try values.decode(Int.self, forKey: .rotationDegrees)
        extendedParameters = try values.decode([String: RecipeValue].self, forKey: .extendedParameters)
        processingOrder = try values.decode([RAWAdjustment].self, forKey: .processingOrder)
        try validate()
    }

    public func encode(to encoder: any Encoder) throws {
        try validate()
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(exposure, forKey: .exposure)
        try values.encode(contrast, forKey: .contrast)
        try values.encode(saturation, forKey: .saturation)
        try values.encode(rotationDegrees, forKey: .rotationDegrees)
        try values.encode(extendedParameters, forKey: .extendedParameters)
        try values.encode(processingOrder, forKey: .processingOrder)
    }
}

/// Canonical cross-platform wire document. Stored history still contains RecipeParameters snapshots.
public struct RecipeDocument: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let parameters: RecipeParameters

    public init(parameters: RecipeParameters) throws {
        schemaVersion = 1
        self.parameters = parameters
        try parameters.validate()
    }

    private enum CodingKeys: String, CodingKey, CaseIterable { case schemaVersion, parameters }

    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let values = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try values.decode(Int.self, forKey: .schemaVersion)
        guard schemaVersion == 1 else { throw SuiteValidationError.unsupportedSchema(schemaVersion) }
        parameters = try values.decode(RecipeParameters.self, forKey: .parameters)
    }

    public func encode(to encoder: any Encoder) throws {
        guard schemaVersion == 1 else { throw SuiteValidationError.unsupportedSchema(schemaVersion) }
        try parameters.validate()
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(schemaVersion, forKey: .schemaVersion)
        try values.encode(parameters, forKey: .parameters)
    }
}

public struct EditHistoryEntry: Codable, Equatable, Sendable {
    public let parameters: RecipeParameters
    /// An identity reference only; authorization is enforced by the workspace/backend adapter.
    public let editorID: String?
    public let timestamp: Date

    public init(parameters: RecipeParameters, editorID: String? = nil, timestamp: Date = Date()) {
        self.parameters = parameters
        self.editorID = editorID
        self.timestamp = timestamp
    }

    private enum CodingKeys: String, CodingKey, CaseIterable { case parameters, editorID, timestamp }

    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let values = try decoder.container(keyedBy: CodingKeys.self)
        parameters = try values.decode(RecipeParameters.self, forKey: .parameters)
        editorID = try values.decodeIfPresent(String.self, forKey: .editorID)
        timestamp = try values.decode(Date.self, forKey: .timestamp)
        guard timestamp.timeIntervalSince1970.isFinite, editorID == nil || !(editorID?.isEmpty ?? true) else {
            throw SuiteValidationError.invalidValue("historyEntry")
        }
    }
}

public struct EditHistory: Codable, Equatable, Sendable {
    public private(set) var entries: [EditHistoryEntry]
    public private(set) var cursor: Int

    public init(parameters: RecipeParameters = .init()) {
        entries = [.init(parameters: parameters)]
        cursor = 0
    }

    public var current: RecipeParameters { entries[cursor].parameters }
    public var canUndo: Bool { cursor > 0 }
    public var canRedo: Bool { cursor + 1 < entries.count }

    public mutating func apply(_ parameters: RecipeParameters) {
        apply(parameters, editorID: nil, timestamp: Date())
    }

    public mutating func apply(_ parameters: RecipeParameters, editorID: String?, timestamp: Date) {
        guard parameters != current else { return }
        // A new edit after Undo forks the timeline and invalidates only the abandoned redo branch.
        entries.removeSubrange((cursor + 1)..<entries.count)
        entries.append(.init(parameters: parameters, editorID: editorID, timestamp: timestamp))
        cursor = entries.count - 1
    }

    public mutating func undo() { if canUndo { cursor -= 1 } }
    public mutating func redo() { if canRedo { cursor += 1 } }

    public func validate() throws {
        guard !entries.isEmpty, entries.indices.contains(cursor) else {
            throw SuiteValidationError.invalidValue("historyCursor")
        }
        for entry in entries {
            try entry.parameters.validate()
            guard entry.timestamp.timeIntervalSince1970.isFinite,
                  entry.editorID == nil || !(entry.editorID?.isEmpty ?? true) else {
                throw SuiteValidationError.invalidValue("historyEntry")
            }
        }
    }

    private enum CodingKeys: String, CodingKey, CaseIterable { case entries, cursor }

    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let values = try decoder.container(keyedBy: CodingKeys.self)
        entries = try values.decode([EditHistoryEntry].self, forKey: .entries)
        cursor = try values.decode(Int.self, forKey: .cursor)
        try validate()
    }
}
