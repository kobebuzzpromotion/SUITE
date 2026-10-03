import XCTest
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import CryptoKit
import SuiteCore
@testable import SUITE

/// Generated PNG unit fixtures ONLY. These are not RAW, a RAW load benchmark, or device QA evidence.
/// Windows cannot run this target: every test remains NOT_RUN until an Apple test result is recorded.
final class CropExportPipelineTests: XCTestCase {
    private func temporaryRoot() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("suite-crop-unit-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    private func makePNGFixture(at root: URL, transparent: Bool = false) throws -> URL {
        let width = 800, height = 600
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        for y in 0..<height {
            for x in 0..<width {
                let alpha = transparent && y < 160 ? (x < 160 ? 0 : x < 320 ? 128 : 255) : 255
                let index = (y * width + x) * 4
                bytes[index] = UInt8((x % 256) * alpha / 255)
                bytes[index + 1] = UInt8((y % 256) * alpha / 255)
                bytes[index + 2] = UInt8(((x * y) % 256) * alpha / 255)
                bytes[index + 3] = UInt8(alpha)
            }
        }
        let space = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let provider = try XCTUnwrap(CGDataProvider(data: Data(bytes) as CFData))
        let image = try XCTUnwrap(CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 32,
            bytesPerRow: width * 4, space: space,
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue).union(.byteOrder32Big),
            provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent))
        let file = root.appendingPathComponent("generated-unit-fixture-not-RAW.png")
        let writer = try XCTUnwrap(CGImageDestinationCreateWithURL(file as CFURL, UTType.png.identifier as CFString, 1, nil))
        CGImageDestinationAddImage(writer, image, [kCGImagePropertyExifDictionary: [
            kCGImagePropertyExifUserComment: "SUITE generated fixture metadata"
        ]] as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(writer))
        return file
    }

    private func info(_ url: URL) throws -> (CGImage, [CFString: Any]) {
        let source = try XCTUnwrap(CGImageSourceCreateWithURL(url as CFURL, nil))
        let image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
        let properties = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        return (image, properties)
    }

    private func rgba8(_ image: CGImage, in space: CGColorSpace) throws -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: image.width * image.height * 4)
        try bytes.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: image.width, height: image.height,
                bitsPerComponent: 8, bytesPerRow: image.width * 4, space: space,
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue))
            context.interpolationQuality = .none
            context.draw(image, in: CGRect(x: 0, y: 0, width: CGFloat(image.width), height: CGFloat(image.height)))
        }
        return bytes
    }

    private func physicalCrop(widthMM: Double = 25.4, heightMM: Double = 25.4, dpi: Double = 300) throws -> CropSettings {
        let ratio = CropRatio(width: widthMM, height: heightMM)
        return CropSettings(presetID: "custom.mm", presetName: "Custom mm", widthMM: widthMM, heightMM: heightMM,
            orientation: widthMM < heightMM ? .portrait : .landscape,
            cropRect: try CropExportMath.centeredRect(sourceWidth: 800, sourceHeight: 600, ratio: ratio),
            cropRatio: ratio, customSize: true, requestedDPI: dpi)
    }

    private func checkpoint(_ asset: AssetRecord, crop: CropSettings = .init(), output: ExportSettings = .init()) throws -> ProjectCheckpoint {
        let parameters = try RecipeParameters().setting(crop: crop, export: output)
        return ProjectCheckpoint(asset: asset, history: EditHistory(parameters: parameters), revision: 0)
    }

    private func checksum(_ url: URL) throws -> String {
        SHA256.hash(data: try Data(contentsOf: url)).map { String(format: "%02x", $0) }.joined()
    }

    func testGeneratedPNGDefaultJPEGQuality100AndExplicitLowerQuality() async throws {
        let root = try temporaryRoot(); defer {try? FileManager.default.removeItem(at: root)}
        let fixture = try makePNGFixture(at: root)
        let pipeline = PhotoPipeline(root: root.appendingPathComponent("library"))
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 200)
        let defaultCheckpoint = try checkpoint(asset)
        XCTAssertEqual(try defaultCheckpoint.history.current.exportSettings()?.jpegQuality, 100)
        let best = try await pipeline.export(checkpoint: defaultCheckpoint, format: .jpeg, sequence: 7)
        let lower = try checkpoint(asset, output: ExportSettings(jpegQuality: 30))
        let reduced = try await pipeline.export(checkpoint: lower, format: .jpeg, sequence: 7)
        XCTAssertGreaterThan(try Data(contentsOf: best).count, try Data(contentsOf: reduced).count)
        XCTAssertEqual(try info(best).0.width, 800)
        XCTAssertEqual(try info(best).0.height, 600)
        XCTAssertNotEqual(best, reduced)
        XCTAssertTrue(best.lastPathComponent.hasPrefix("generated-unit-fixture-not-RAW-7-"))
        XCTAssertEqual(try checksum(fixture), asset.sha256)
        XCTAssertEqual(try checksum(root.appendingPathComponent("library").appendingPathComponent(asset.originalRelativePath)), asset.sha256)
        // Size comparison detects the explicit quality effect; it is not a universal visual-quality metric.
    }

    func testGeneratedPNGTIFF8And16BitNoneAndLZW() async throws {
        let root = try temporaryRoot(); defer {try? FileManager.default.removeItem(at: root)}
        let fixture = try makePNGFixture(at: root)
        let library = root.appendingPathComponent("library")
        let pipeline = PhotoPipeline(root: library)
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 200)
        for depth in [8, 16] {
            for compression in TIFFCompression.allCases {
                let output = ExportSettings(format: .tiff, bitDepth: depth, tiffCompression: compression)
                let url = try await pipeline.export(checkpoint: checkpoint(asset, output: output), format: .tiff)
                let (image, properties) = try info(url)
                XCTAssertEqual(image.bitsPerComponent, depth)
                let tiff = try XCTUnwrap(properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any])
                XCTAssertEqual(tiff[kCGImagePropertyTIFFCompression] as? Int, compression == .none ? 1 : 5)
                XCTAssertEqual(image.width, 800); XCTAssertEqual(image.height, 600)
            }
        }
        XCTAssertEqual(try checksum(library.appendingPathComponent(asset.originalRelativePath)), asset.sha256)
    }

    func testGeneratedPNGPreservesTransparentAndPartialAlphaPixels() async throws {
        let root = try temporaryRoot(); defer {try? FileManager.default.removeItem(at: root)}
        let fixture = try makePNGFixture(at: root, transparent: true)
        let pipeline = PhotoPipeline(root: root.appendingPathComponent("library"))
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 200)
        let output = ExportSettings(format: .png, preserveAlpha: true)
        let url = try await pipeline.export(checkpoint: checkpoint(asset, output: output), format: .png)
        let (image, properties) = try info(url)
        XCTAssertEqual(properties[kCGImagePropertyHasAlpha] as? Bool, true)
        let pixels = try rgba8(image, in: XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB)))
        let alpha = stride(from: 3, to: pixels.count, by: 4).map {pixels[$0]}
        XCTAssertTrue(alpha.contains(0)); XCTAssertTrue(alpha.contains(255))
        XCTAssertTrue(alpha.contains(where: { $0 >= 126 && $0 <= 130 }))
        XCTAssertEqual(try checksum(fixture), asset.sha256)
    }

    func testGeneratedPNGColorConversionIsNotOnlyAnICCTagChange() async throws {
        let root = try temporaryRoot(); defer {try? FileManager.default.removeItem(at: root)}
        let fixture = try makePNGFixture(at: root)
        let source = try info(fixture).0
        let srgb = try XCTUnwrap(CGColorSpace(name: CGColorSpace.sRGB))
        let adobe = try XCTUnwrap(CGColorSpace(name: CGColorSpace.adobeRGB1998))
        let sourceRGB = try rgba8(source, in: srgb)
        let adobeReference = try rgba8(source, in: adobe)
        let referenceDifference = zip(sourceRGB, adobeReference).enumerated().filter {$0.offset % 4 != 3}
            .reduce(0.0) { $0 + abs(Double($1.element.0) - Double($1.element.1)) } / Double(source.width * source.height * 3)
        XCTAssertGreaterThan(referenceDifference, 1, "Fixture must actually exercise a pixel-space conversion")
        let pipeline = PhotoPipeline(root: root.appendingPathComponent("library"))
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 200)
        for color in ExportColorSpace.allCases {
            let space = color == .sRGB ? srgb : adobe
            let reference = color == .sRGB ? sourceRGB : adobeReference
            let output = ExportSettings(format: .png, colorSpace: color)
            let url = try await pipeline.export(checkpoint: checkpoint(asset, output: output), format: .png)
            let image = try info(url).0
            XCTAssertTrue(CFEqual(try XCTUnwrap(image.colorSpace), space))
            let actual = try rgba8(image, in: space)
            let error = zip(actual, reference).enumerated().filter {$0.offset % 4 != 3}
                .reduce(0.0) { $0 + abs(Double($1.element.0) - Double($1.element.1)) } / Double(image.width * image.height * 3)
            XCTAssertLessThan(error, 3, "Converted pixel values, not just profile labels, must agree with the independent CoreGraphics conversion")
        }
        // This unit tolerance is not camera RAW color-fidelity, printer-proof or display-calibration approval.
    }

    func testGeneratedPNGPhysicalCropHasExactPixelsAndDensityInAllFormats() async throws {
        let root = try temporaryRoot(); defer {try? FileManager.default.removeItem(at: root)}
        let fixture = try makePNGFixture(at: root)
        let pipeline = PhotoPipeline(root: root.appendingPathComponent("library"))
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 200)
        for dpi in [150.0, 300.0] {
            let crop = try physicalCrop(widthMM: 50.8, heightMM: 25.4, dpi: dpi)
            for format in ExportFormat.allCases {
                let output = ExportSettings(format: try XCTUnwrap(CropExportFormat(rawValue: format.rawValue)), requestedDPI: dpi)
                let url = try await pipeline.export(checkpoint: checkpoint(asset, crop: crop, output: output), format: format)
                let (image, properties) = try info(url)
                XCTAssertEqual(image.width, Int(dpi * 2)); XCTAssertEqual(image.height, Int(dpi))
                XCTAssertEqual(try XCTUnwrap(properties[kCGImagePropertyDPIWidth] as? Double), dpi, accuracy: 0.1)
                XCTAssertEqual(try XCTUnwrap(properties[kCGImagePropertyDPIHeight] as? Double), dpi, accuracy: 0.1)
                XCTAssertEqual(try checksum(fixture), asset.sha256)
            }
        }
    }

    func testGeneratedPNGPortraitCropAppliesRotationExactlyOnce() async throws {
        let root = try temporaryRoot(); defer {try? FileManager.default.removeItem(at: root)}
        let fixture = try makePNGFixture(at: root)
        let library = root.appendingPathComponent("library")
        let pipeline = PhotoPipeline(root: library)
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 200)
        let ratio = CropRatio(width: 1, height: 2)
        let crop = CropSettings(presetID: "custom.mm", presetName: "Portrait custom", widthMM: 25.4, heightMM: 50.8,
            orientation: .portrait, cropRect: try CropExportMath.centeredRect(sourceWidth: 600, sourceHeight: 800, ratio: ratio),
            cropRatio: ratio, rotation: 90, customSize: true)
        let saved = try checkpoint(asset, crop: crop, output: ExportSettings(format: .png))
        XCTAssertEqual(saved.history.current.rotationDegrees, 90)
        XCTAssertEqual(saved.history.current.processingOrder.last, .crop)
        let url = try await pipeline.export(checkpoint: saved, format: .png)
        let (image, properties) = try info(url)
        XCTAssertEqual(image.width, 300); XCTAssertEqual(image.height, 600)
        XCTAssertEqual(properties[kCGImagePropertyOrientation] as? Int ?? 1, 1)
        XCTAssertEqual(try checksum(library.appendingPathComponent(asset.originalRelativePath)), asset.sha256)
    }

    func testGeneratedPNGInsufficientResolutionPublishesNoFinalOrPartial() async throws {
        let root = try temporaryRoot(); defer {try? FileManager.default.removeItem(at: root)}
        let fixture = try makePNGFixture(at: root)
        let library = root.appendingPathComponent("library")
        let pipeline = PhotoPipeline(root: library)
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 200)
        let crop = try physicalCrop(widthMM: 1000, heightMM: 1000)
        do {
            _ = try await pipeline.export(checkpoint: checkpoint(asset, crop: crop), format: .jpeg)
            XCTFail("Insufficient source pixels must never be silently upscaled or metadata-only labeled")
        } catch PhotoPipelineError.insufficientResolution {} catch { XCTFail("Unexpected error: \(error)") }
        let exports = library.appendingPathComponent("Exports")
        if FileManager.default.fileExists(atPath: exports.path) {
            XCTAssertTrue(try FileManager.default.contentsOfDirectory(atPath: exports.path).isEmpty)
        }
        XCTAssertEqual(try checksum(library.appendingPathComponent(asset.originalRelativePath)), asset.sha256)
    }

    func testCropCheckpointReopenAndFixedExportPlanIgnoreLaterRecipeEdits() async throws {
        let root = try temporaryRoot(); defer {try? FileManager.default.removeItem(at: root)}
        let fixture = try makePNGFixture(at: root)
        let library = root.appendingPathComponent("library")
        let pipeline = PhotoPipeline(root: library)
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 200)
        let output = ExportSettings(format: .png)
        let first = try checkpoint(asset, crop: physicalCrop(), output: output)
        let metadata = root.appendingPathComponent("checkpoints")
        let store = try ProjectStore(directory: metadata)
        try await store.save(first, expectedRevision: nil)
        let frozen = try ExportPlan(checkpoint: first, format: .png)
        let newerParameters = try RecipeParameters().setting(crop: physicalCrop(widthMM: 50.8, heightMM: 25.4), export: output)
        var history = first.history; history.apply(newerParameters)
        let second = ProjectCheckpoint(asset: asset, history: history, revision: 1)
        try await store.save(second, expectedRevision: 0)
        let reopened = try ProjectStore(directory: metadata)
        let loaded = try await reopened.load(id: asset.id)
        XCTAssertEqual(loaded?.history.current, newerParameters)
        XCTAssertEqual(loaded?.revision, 1)
        XCTAssertEqual(frozen.parameters, first.history.current)
        XCTAssertEqual(frozen.recipeRevision, 0)
        let request = try RAWRenderRequest(plan: frozen, originalURL: library.appendingPathComponent(asset.originalRelativePath),
            destinationURL: root.appendingPathComponent("fixed-input-output.png"))
        let url = try await pipeline.render(request)
        XCTAssertEqual(try info(url).0.width, 300); XCTAssertEqual(try info(url).0.height, 300)
        XCTAssertEqual(try checksum(library.appendingPathComponent(asset.originalRelativePath)), asset.sha256)
        XCTAssertEqual(try first.history.current.cropSettings(), try JSONDecoder().decode(ProjectCheckpoint.self,
            from: JSONEncoder().encode(first)).history.current.cropSettings())
    }

    func testCropMissingOriginalWaitsInsteadOfExportingProxy() async throws {
        let root = try temporaryRoot(); defer {try? FileManager.default.removeItem(at: root)}
        let fixture = try makePNGFixture(at: root)
        let library = root.appendingPathComponent("library")
        let pipeline = PhotoPipeline(root: library)
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 200)
        let saved = try checkpoint(asset, crop: physicalCrop())
        // Removing a generated test fixture is not user RAW removal.
        try FileManager.default.removeItem(at: library.appendingPathComponent(asset.originalRelativePath))
        let preview = try await pipeline.preview(asset: asset, parameters: saved.history.current)
        XCTAssertFalse(preview.isEmpty)
        do {
            _ = try await pipeline.export(checkpoint: saved, format: .png)
            XCTFail("Proxy must not be used as Final when Original is absent")
        } catch PhotoPipelineError.waitingForOriginal {} catch { XCTFail("Unexpected error: \(error)") }
    }

    func testGeneratedPNGMetadataRemoveDoesNotLeakDescriptiveExif() async throws {
        let root = try temporaryRoot(); defer {try? FileManager.default.removeItem(at: root)}
        let fixture = try makePNGFixture(at: root)
        let sourceEXIF = try XCTUnwrap(try info(fixture).1[kCGImagePropertyExifDictionary] as? [CFString: Any])
        XCTAssertEqual(sourceEXIF[kCGImagePropertyExifUserComment] as? String, "SUITE generated fixture metadata")
        let pipeline = PhotoPipeline(root: root.appendingPathComponent("library"))
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 200)
        for policy in ExportMetadataPolicy.allCases {
            let output = ExportSettings(metadata: policy)
            let url = try await pipeline.export(checkpoint: checkpoint(asset, output: output), format: .jpeg)
            let exif = try info(url).1[kCGImagePropertyExifDictionary] as? [CFString: Any]
            if policy == .preserve {
                XCTAssertEqual(exif?[kCGImagePropertyExifUserComment] as? String, "SUITE generated fixture metadata")
            } else { XCTAssertNil(exif?[kCGImagePropertyExifUserComment]) }
        }
    }
}
