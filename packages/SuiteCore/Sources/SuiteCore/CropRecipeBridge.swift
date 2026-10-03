import Foundation

/// Additional user-approved settings inside the existing plain-JSON extension boundary.
/// No schema version, storage contract or old Recipe is replaced.
public extension RecipeParameters {
    func cropSettings() throws -> CropSettings? {
        guard let value = extendedParameters["crop"] else { return nil }
        return try JSONDecoder().decode(CropSettings.self, from: JSONEncoder().encode(value))
    }

    func exportSettings() throws -> ExportSettings? {
        guard let value = extendedParameters["export"] else { return nil }
        return try JSONDecoder().decode(ExportSettings.self, from: JSONEncoder().encode(value))
    }

    func setting(crop: CropSettings, export: ExportSettings) throws -> RecipeParameters {
        try crop.validate()
        try export.validate()
        var result = self
        result.rotationDegrees = crop.rotation
        result.extendedParameters["crop"] = try JSONDecoder().decode(RecipeValue.self, from: JSONEncoder().encode(crop))
        result.extendedParameters["export"] = try JSONDecoder().decode(RecipeValue.self, from: JSONEncoder().encode(export))
        result.processingOrder.removeAll { $0 == .crop }
        if !result.processingOrder.contains(.rotation) { result.processingOrder.append(.rotation) }
        result.processingOrder.append(.crop)
        try result.validate()
        return result
    }

    func validateCropExportExtensions() throws {
        if let crop = try cropSettings() {
            try crop.validate()
            guard crop.rotation == rotationDegrees, processingOrder.last == .crop else {
                throw SuiteValidationError.invalidValue("cropRotationOrOrder")
            }
        }
        if let settings = try exportSettings() {
            try settings.validate()
            if let crop = try cropSettings(), crop.requestedDPI != settings.requestedDPI {
                throw SuiteValidationError.invalidValue("cropExportDPIMismatch")
            }
        }
    }
}
