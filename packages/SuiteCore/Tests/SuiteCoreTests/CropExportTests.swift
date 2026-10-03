import Foundation
import XCTest
@testable import SuiteCore

/// NOT RUN on Windows. Run this target on the Mac before claiming Swift parity.
final class CropExportTests: XCTestCase, @unchecked Sendable {
    private func fixture() throws -> [String: Any] {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        let data = try Data(contentsOf: root.appendingPathComponent("contracts/fixtures/print-presets.json"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }
    private func physical(_ w: Double, _ h: Double, dpi: Double = 300) -> CropSettings {
        .init(presetID: "custom.size", presetName: "Custom Size", widthMM: w, heightMM: h,
              orientation: w <= h ? .portrait : .landscape, cropRatio: .init(width: w, height: h),
              customSize: true, requestedDPI: dpi)
    }
    private func dictionary<T: Encodable>(_ value: T) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any])
    }
    func testCE01RequiredRatiosAndCenteredGeometry() throws {
        XCTAssertEqual(RatioCatalog.presets.map(\.name), ["Original", "Free", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "Custom Ratio"])
        for preset in RatioCatalog.presets {
            guard let ratio = preset.ratio else { continue }
            for (w, h) in [(6000, 4000), (4000, 6000)] {
                let rect = try CropExportMath.centeredRect(sourceWidth: w, sourceHeight: h, ratio: ratio)
                try rect.validate()
                XCTAssertEqual(Double(w) * rect.width / (Double(h) * rect.height), ratio.width / ratio.height, accuracy: 1e-10)
                XCTAssertEqual(rect.x * 2 + rect.width, 1, accuracy: 1e-10)
                XCTAssertEqual(rect.y * 2 + rect.height, 1, accuracy: 1e-10)
            }
        }
    }
    func testCE02CatalogMatchesSharedFixtureExactly() throws {
        let object = try fixture()
        let values = try XCTUnwrap(object["presets"])
        let data = try JSONSerialization.data(withJSONObject: values)
        let fromJSON = try JSONDecoder().decode([PrintPreset].self, from: data)
        XCTAssertEqual(PrintPresetCatalog.presets, fromJSON)
        XCTAssertEqual(fromJSON.count, 37); XCTAssertEqual(Set(fromJSON.map(\.id)).count, 37)
        XCTAssertEqual(fromJSON.filter { $0.category == .photoPrint }.count, 21)
    }
    func testCE03AllPhysicalPresetsBothOrientations() throws {
        for preset in PrintPresetCatalog.presets {
            let short = try XCTUnwrap(preset.widthMM), long = try XCTUnwrap(preset.heightMM)
            XCTAssertTrue(preset.available); XCTAssertNotNil(preset.sourceURL)
            for orientation in CropOrientation.allCases {
                let w = orientation == .portrait ? short : long, h = orientation == .portrait ? long : short
                let crop = CropSettings(presetID: preset.id, presetName: preset.name, widthMM: w, heightMM: h,
                                        orientation: orientation, cropRatio: .init(width: w, height: h))
                try crop.validate()
                let pixels = try CropExportMath.requiredPixels(widthMM: w, heightMM: h)
                XCTAssertEqual(pixels.width, Int(ceil(w / 25.4 * 300)))
                XCTAssertEqual(pixels.height, Int(ceil(h / 25.4 * 300)))
            }
        }
        let a0 = try XCTUnwrap(PrintPresetCatalog.presets.first { $0.id == "a.a0-double" })
        XCTAssertEqual(a0.widthMM, 1189); XCTAssertEqual(a0.heightMM, 1682)
        let b0 = try XCTUnwrap(PrintPresetCatalog.presets.first { $0.id == "b.b0-double" })
        XCTAssertEqual(b0.widthMM, 1456); XCTAssertEqual(b0.heightMM, 2060)
    }
    func testCE04CeilingCustomDPIAndOverflowRejection() throws {
        XCTAssertEqual(try CropExportMath.requiredPixels(widthMM: 210, heightMM: 297), .init(width: 2481, height: 3508))
        XCTAssertEqual(try CropExportMath.requiredPixels(widthMM: 210, heightMM: 297, dpi: 144), .init(width: 1191, height: 1684))
        XCTAssertEqual(try CropExportMath.requiredPixels(widthMM: 25.4, heightMM: 50.8), .init(width: 300, height: 600))
        XCTAssertEqual(try CropExportMath.requiredPixels(widthMM: 0.1, heightMM: 0.1, dpi: 72), .init(width: 1, height: 1))
        for value in [0, -1, Double.nan, Double.infinity] {
            XCTAssertThrowsError(try CropExportMath.requiredPixels(widthMM: value, heightMM: 10))
            XCTAssertThrowsError(try CropExportMath.requiredPixels(widthMM: 10, heightMM: value))
            XCTAssertThrowsError(try CropExportMath.requiredPixels(widthMM: 10, heightMM: 10, dpi: value))
        }
        XCTAssertThrowsError(try CropExportMath.requiredPixels(widthMM: Double.greatestFiniteMagnitude, heightMM: 10))
    }
    func testCE05ShortfallUsesCroppedSourceAndSafeRecommendedDPI() throws {
        var crop = physical(254, 254)
        crop.cropRect = .init(x: 1.0 / 3, y: 0.25, width: 1.0 / 3, height: 0.5)
        let result = try CropExportMath.resolutionAssessment(sourceWidth: 6000, sourceHeight: 4000, crop: crop)
        XCTAssertEqual(result.available, .init(width: 2000, height: 2000))
        XCTAssertEqual(result.required, .init(width: 3000, height: 3000))
        XCTAssertEqual(result.shortfallPercent, 100.0 / 3, accuracy: 1e-8)
        XCTAssertEqual(result.recommendedDPI, 200); XCTAssertTrue(result.needsUpscale)
        crop.requestedDPI = 200
        XCTAssertFalse(try CropExportMath.resolutionAssessment(sourceWidth: 6000, sourceHeight: 4000, crop: crop).needsUpscale)
    }
    func testCE06NoPhysicalTargetDoesNotInventDPIOrUpscale() throws {
        let result = try CropExportMath.resolutionAssessment(sourceWidth: 6000, sourceHeight: 4000, crop: .init())
        XCTAssertEqual(result.available, .init(width: 6000, height: 4000))
        XCTAssertNil(result.required); XCTAssertNil(result.recommendedDPI); XCTAssertFalse(result.needsUpscale)
    }
    func testCE07RotationSwapsSourceExactlyOnceNotMM() throws {
        var crop = physical(254, 381); crop.rotation = 90
        let result = try CropExportMath.resolutionAssessment(sourceWidth: 6000, sourceHeight: 4000, crop: crop)
        XCTAssertEqual(result.available, .init(width: 4000, height: 6000))
        XCTAssertEqual(result.required, .init(width: 3000, height: 4500))
        crop.rotation = -270
        XCTAssertEqual(try CropExportMath.resolutionAssessment(sourceWidth: 6000, sourceHeight: 4000, crop: crop), result)
        crop.rotation = 45; XCTAssertThrowsError(try crop.validate())
    }
    func testCE08InvalidCropAndMismatchedPresetAreRejected() throws {
        XCTAssertThrowsError(try NormalizedCropRect(x: -0.1, y: 0, width: 1, height: 1).validate())
        XCTAssertThrowsError(try NormalizedCropRect(x: 0, y: 0, width: 0, height: 1).validate())
        XCTAssertThrowsError(try CropRatio(width: 1, height: 0).validate())
        var crop = physical(210, 297); crop.presetID = "a.a4"; crop.customSize = false; try crop.validate()
        crop.widthMM = 100; crop.cropRatio = .init(width: 100, height: 297)
        XCTAssertThrowsError(try crop.validate())
        crop = physical(254, 254)
        XCTAssertThrowsError(try CropExportMath.resolutionAssessment(sourceWidth: 6000, sourceHeight: 4000, crop: crop))
    }
    func testCE09StrictPlainJSONRejectsUnknownNestedFieldsAndNull() throws {
        let rectJSON = #"{"x":0,"y":0,"width":1,"height":1,"ignored":true}"#
        XCTAssertThrowsError(try JSONDecoder().decode(NormalizedCropRect.self, from: Data(rectJSON.utf8)))
        let ratioJSON = #"{"width":1,"height":1,"ignored":true}"#
        XCTAssertThrowsError(try JSONDecoder().decode(CropRatio.self, from: Data(ratioJSON.utf8)))
        for key in ["width_mm", "height_mm", "crop_ratio"] {
            var object = try dictionary(CropSettings()); object[key] = NSNull()
            XCTAssertThrowsError(try JSONDecoder().decode(CropSettings.self, from: JSONSerialization.data(withJSONObject: object)))
        }
        var object = try dictionary(CropSettings()); object["future"] = true
        XCTAssertThrowsError(try JSONDecoder().decode(CropSettings.self, from: JSONSerialization.data(withJSONObject: object)))
        XCTAssertFalse(String(decoding: try JSONEncoder().encode(CropSettings()), as: UTF8.self).contains("null"))
    }
    func testCE10SharedWireExampleRoundTripsUnchangedIncludingRecipe() throws {
        let examples = try XCTUnwrap(fixture()["wire_examples"] as? [String: Any])
        let cropObject = try XCTUnwrap(examples["crop"]), exportObject = try XCTUnwrap(examples["export"])
        let recipeObject = try XCTUnwrap(examples["recipe"])
        let crop = try JSONDecoder().decode(CropSettings.self, from: JSONSerialization.data(withJSONObject: cropObject))
        let settings = try JSONDecoder().decode(ExportSettings.self, from: JSONSerialization.data(withJSONObject: exportObject))
        let document = try JSONDecoder().decode(RecipeDocument.self, from: JSONSerialization.data(withJSONObject: recipeObject))
        XCTAssertEqual(try dictionary(crop) as NSDictionary, try XCTUnwrap(examples["crop"] as? NSDictionary))
        XCTAssertEqual(try dictionary(settings) as NSDictionary, try XCTUnwrap(examples["export"] as? NSDictionary))
        XCTAssertEqual(try dictionary(document) as NSDictionary, try XCTUnwrap(examples["recipe"] as? NSDictionary))
        XCTAssertEqual(try document.parameters.cropSettings(), crop)
        XCTAssertEqual(try document.parameters.exportSettings(), settings)
        XCTAssertEqual(try RecipeParameters().setting(crop: crop, export: settings), document.parameters)
    }
    func testCE11JPEGDefault100AndExplicitFormatValidation() throws {
        let settings = ExportSettings(); try settings.validate(); XCTAssertEqual(settings.jpegQuality, 100)
        XCTAssertThrowsError(try ExportSettings(jpegQuality: 0).validate())
        XCTAssertThrowsError(try ExportSettings(jpegQuality: 101).validate())
        XCTAssertThrowsError(try ExportSettings(bitDepth: 16).validate())
        XCTAssertThrowsError(try ExportSettings(preserveAlpha: true).validate())
        XCTAssertThrowsError(try ExportSettings(tiffCompression: .lzw).validate())
    }
    func testCE12TIFFPNGColorMetadataAreOnlyModelCapabilities() throws {
        for depth in [8, 16] {
            for compression in TIFFCompression.allCases {
                for space in ExportColorSpace.allCases {
                    let settings = ExportSettings(format: .tiff, bitDepth: depth, colorSpace: space, tiffCompression: compression)
                    try settings.validate()
                    XCTAssertEqual(try JSONDecoder().decode(ExportSettings.self, from: JSONEncoder().encode(settings)), settings)
                }
            }
            try ExportSettings(format: .png, bitDepth: depth, preserveAlpha: true, metadata: .remove).validate()
        }
    }
    func testCE13UnsafeFilenameAndUnknownExportSettingRejected() throws {
        for name in ["../escape", "folder/file", "C:\\file", "{unknown}", "", String(repeating: "a", count: 129), "a\nb", "a\u{007f}b", "a\u{202e}b"] {
            XCTAssertThrowsError(try ExportSettings(fileNameTemplate: name).validate())
        }
        try ExportSettings(fileNameTemplate: "作品-{original}-{sequence}").validate()
        var object = try dictionary(ExportSettings()); object["unimplemented"] = true
        XCTAssertThrowsError(try JSONDecoder().decode(ExportSettings.self, from: JSONSerialization.data(withJSONObject: object)))
    }
    func testCE14BufferEstimateIsNotCompressedFileSize() throws {
        let pixels = PixelDimensions(width: 3000, height: 2000)
        XCTAssertEqual(try CropExportMath.estimatedUncompressedBytes(pixels: pixels, settings: .init()), 18_000_000)
        XCTAssertEqual(try CropExportMath.estimatedUncompressedBytes(pixels: pixels, settings: .init(format: .tiff, bitDepth: 16)), 36_000_000)
        XCTAssertEqual(try CropExportMath.estimatedUncompressedBytes(pixels: pixels, settings: .init(format: .png, preserveAlpha: true)), 24_000_000)
    }
    func testCE15RecipeStageRotationAndDPIConsistency() throws {
        let crop = CropSettings(rotation: 90)
        var recipe = try RecipeParameters().setting(crop: crop, export: .init())
        XCTAssertEqual(recipe.processingOrder.last, .crop); XCTAssertEqual(recipe.rotationDegrees, 90)
        recipe.rotationDegrees = 0; XCTAssertThrowsError(try recipe.validate())
        recipe = try RecipeParameters().setting(crop: crop, export: .init())
        recipe.processingOrder = [.crop, .exposure, .contrast, .saturation, .rotation]
        XCTAssertThrowsError(try recipe.validate())
        XCTAssertThrowsError(try RecipeParameters().setting(crop: crop, export: .init(requestedDPI: 240)))
    }
    func testCE17FourRecommendedExportPresetsAreDataOnly() throws {
        XCTAssertEqual(ExportPresetCatalog.presets.count, 4)
        for preset in ExportPresetCatalog.presets { try preset.settings.validate() }
        XCTAssertEqual(ExportPresetCatalog.presets[0].settings.jpegQuality, 100)
        XCTAssertEqual(ExportPresetCatalog.presets[2].settings.bitDepth, 16)
        XCTAssertEqual(ExportPresetCatalog.presets[2].settings.colorSpace, .adobeRGB)
        XCTAssertTrue(ExportPresetCatalog.presets[3].settings.preserveAlpha)
    }
    func testCE16CropAndExportPreserveHistoryAcrossProjectStoreReopen() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("suite-crop-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }
        let crop = CropSettings(rotation: 90), settings = ExportSettings(format: .png, preserveAlpha: true)
        let edited = try RecipeParameters().setting(crop: crop, export: settings)
        var history = EditHistory(); history.apply(edited)
        let asset = AssetRecord(originalFilename: "metadata-only", originalRelativePath: "originals/metadata-only",
                                sha256: String(repeating: "a", count: 64), createdAt: Date(timeIntervalSince1970: 1))
        let checkpoint = ProjectCheckpoint(asset: asset, history: history, revision: 0)
        let store = try ProjectStore(directory: directory); try await store.save(checkpoint, expectedRevision: nil)
        let reopened = try ProjectStore(directory: directory)
        let loaded = try await reopened.load(id: asset.id)
        let restored = try XCTUnwrap(loaded)
        XCTAssertEqual(restored, checkpoint)
        XCTAssertEqual(try restored.history.current.cropSettings(), crop)
        XCTAssertEqual(try restored.history.current.exportSettings(), settings)
        XCTAssertEqual(restored.asset.sha256, asset.sha256)
    }
}
