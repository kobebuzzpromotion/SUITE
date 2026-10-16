import Foundation
import SuiteCore

/// Absolute, explicit Recipe values only; no adaptive coefficient inference.
/// Texture and unsupported color controls are not advertised or silently dropped.
enum SessionLookExplicitRecipeAdapter {
    static let version = "session-explicit-recipe-values-v1"

    static func capabilities(for look: SessionLook) -> Set<LookAdapterCapability> {
        var result = Set<LookAdapterCapability>()
        if !look.globalColor.isEmpty, look.globalColor.allSatisfy({ intent in
            guard [.exposure, .contrast, .saturation].contains(intent.parameter),
                  case let .number(value) = intent.value, value.isFinite else { return false }
            return intent.parameter == .exposure || value >= 0
        }) { result.insert(.adaptiveGlobalColor) }
        if !look.outputIntent.isEmpty,
           (try? decodeOutput(look.outputIntent)) != nil { result.insert(.outputIntent) }
        return result
    }

    static func apply(_ part: SessionLookPartialApplication.Part,
                      to input: RecipeParameters) throws -> RecipeParameters {
        guard part.state == .readyForAdapter else { throw SuiteValidationError.invalidValue("partialNotReady") }
        var output = input
        switch part.effect {
        case .globalColor:
            guard capabilities(for: part.plan.lookSnapshot).contains(.adaptiveGlobalColor) else {
                throw SuiteValidationError.invalidValue("unsupportedGlobalLook")
            }
            for intent in part.plan.lookSnapshot.globalColor {
                guard case let .number(value) = intent.value else { throw SuiteValidationError.invalidValue("globalValue") }
                let stage: RAWAdjustment
                switch intent.parameter {
                case .exposure: output.exposure = value; stage = .exposure
                case .contrast: output.contrast = value; stage = .contrast
                case .saturation: output.saturation = value; stage = .saturation
                default: throw SuiteValidationError.invalidValue("unsupportedGlobalLook")
                }
                // Do not invent a pipeline order on behalf of the host.
                guard output.processingOrder.contains(stage) else { throw SuiteValidationError.invalidValue("globalStageMissing") }
            }
        case .outputIntent:
            let settings = try decodeOutput(part.plan.lookSnapshot.outputIntent)
            output.extendedParameters["export"] = try JSONDecoder().decode(RecipeValue.self, from: JSONEncoder().encode(settings))
            // Existing crop/DPI mismatch is rejected rather than changing its geometry.
        default: throw SuiteValidationError.invalidValue("unsupportedPartialAdapter")
        }
        try output.validate()
        return output
    }

    /// Exact existing ExportSettings JSON fields, all explicitly present. No defaults.
    private static func decodeOutput(_ values: [String: RecipeValue]) throws -> ExportSettings {
        try JSONDecoder().decode(ExportSettings.self, from: JSONEncoder().encode(RecipeValue.object(values)))
    }
}
