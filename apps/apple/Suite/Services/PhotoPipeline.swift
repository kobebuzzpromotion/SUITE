import Foundation
import CoreImage
import ImageIO
import CryptoKit
import SuiteCore
import UniformTypeIdentifiers

enum PhotoPipelineError: LocalizedError {
    case unsupportedImage, proxyUnavailable, waitingForOriginal, integrityMismatch, unsupportedRecipe, resourcesUnavailable, exportVerification, insufficientResolution
    var errorDescription: String? {
        switch self {
        case .unsupportedImage: "この形式・カメラの読み込みに対応していません。原本は変更していません。"
        case .proxyUnavailable: "Proxyを表示できません。通常表示のためにOriginalを取得することはありません。"
        case .waitingForOriginal: "Original取得待ち"
        case .integrityMismatch: "Originalの整合性を確認できません。書き出しを中止しました。"
        case .unsupportedRecipe: "この編集内容は現在の処理エンジンでは書き出せません。内容は保持しています。"
        case .resourcesUnavailable: "端末の温度・メモリが回復するまで処理を待機します。"
        case .exportVerification: "書き出した画像を確認できません。"
        case .insufficientResolution: "指定実寸・dpiに対して原本の解像度が不足しています。dpi/実寸を変更してください。AI Upscaleは未接続で、自動実行しません。"
        }
    }
}

/// Candidate adapter, not an assertion of support for every RAW camera.
/// No cloud download is performed by this adapter.
actor PhotoPipeline: RAWProvider {
    struct ImportMeasurement: Sendable {
        let asset: AssetRecord
        let importTimeMs: Double
        let proxyGenerationTimeMs: Double
    }
    nonisolated let identifier = "apple-core-image-candidate"
    nonisolated let supportedAdjustments: Set<RAWAdjustment> = [.exposure, .contrast, .saturation, .rotation, .crop]
    private let root: URL
    private let context: CIContext
    private let portraitPipeline: PortraitPipeline
    private let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    init(root: URL) {
        self.root = root
        let context = CIContext(options: [.cacheIntermediates: false])
        self.context = context
        self.portraitPipeline = PortraitPipeline(context: context)
    }

    func installDownloadedOriginal(_ temporary: URL, asset: AssetRecord) throws {
        try asset.validate()
        guard try digest(temporary) == asset.sha256.lowercased() else {throw PhotoPipelineError.integrityMismatch}
        let original = root.appendingPathComponent(asset.originalRelativePath)
        if FileManager.default.fileExists(atPath: original.path) {
            guard try digest(original) == asset.sha256.lowercased() else {throw PhotoPipelineError.integrityMismatch}
            return
        }
        try FileManager.default.createDirectory(at: original.deletingLastPathComponent(), withIntermediateDirectories: true)
        let staging = original.deletingLastPathComponent().appendingPathComponent(".download-\(UUID().uuidString)")
        defer {try? FileManager.default.removeItem(at: staging)}
        try FileManager.default.copyItem(at: temporary, to: staging)
        guard try digest(staging) == asset.sha256.lowercased() else {throw PhotoPipelineError.integrityMismatch}
        try Task.checkCancellation()
        try FileManager.default.moveItem(at: staging, to: original)
    }

    func importFile(_ source: URL, proxyLongEdge: Int) throws -> AssetRecord {
        try importMeasured(source, proxyLongEdge: proxyLongEdge).asset
    }

    func importMeasured(_ source: URL, proxyLongEdge: Int) throws -> ImportMeasurement {
        let began = ProcessInfo.processInfo.systemUptime
        guard proxyLongEdge > 0 else { throw PhotoPipelineError.resourcesUnavailable }
        let id = UUID()
        let ext = source.pathExtension.isEmpty ? "image" : source.pathExtension
        let relative = "Originals/\(id.uuidString).\(ext)"
        let original = root.appendingPathComponent(relative)
        try FileManager.default.createDirectory(at: original.deletingLastPathComponent(), withIntermediateDirectories: true)
        // Unique asset path; copy fails rather than overwriting an existing original.
        try FileManager.default.copyItem(at: source, to: original)
        let checksum = try digest(original)
        let asset = AssetRecord(id: id, originalFilename: source.lastPathComponent, originalRelativePath: relative, sha256: checksum)
        try asset.validate()
        let copied = ProcessInfo.processInfo.systemUptime
        let image = try decodeOriginal(original, proxyLongEdge: proxyLongEdge)
        let proxy = proxyURL(asset)
        try FileManager.default.createDirectory(at: proxy.deletingLastPathComponent(), withIntermediateDirectories: true)
        let bounded = downscale(image, maxEdge: proxyLongEdge)
        guard let data = context.jpegRepresentation(of: bounded, colorSpace: colorSpace, options: [:]) else { throw PhotoPipelineError.unsupportedImage }
        #if os(iOS)
        try data.write(to: proxy, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: proxy, options: .atomic)
        #endif
        // Metadata is committed by the caller only after original+proxy are durable enough to read.
        return ImportMeasurement(asset: asset, importTimeMs: (copied - began) * 1000,
            proxyGenerationTimeMs: (ProcessInfo.processInfo.systemUptime - copied) * 1000)
    }

    func preview(asset: AssetRecord, parameters: RecipeParameters) throws -> Data {
        try Task.checkCancellation()
        try asset.validate()
        // Ordinary edit/compare reads only this proxy path.
        guard let image = CIImage(contentsOf: proxyURL(asset), options: [.applyOrientationProperty: true]) else { throw PhotoPipelineError.proxyUnavailable }
        let output = try apply(parameters, to: image, assetID: asset.id, originalSHA256: asset.sha256)
        guard let data = context.jpegRepresentation(of: output, colorSpace: colorSpace, options: [:]) else { throw PhotoPipelineError.proxyUnavailable }
        try Task.checkCancellation()
        return data
    }

    /// User-requested ordinary analysis reads this photo's proxy only, never hydrates an Original.
    func analyzePortrait(asset: AssetRecord) throws -> PortraitRecipe {
        try Task.checkCancellation()
        try asset.validate()
        guard let image = CIImage(contentsOf: proxyURL(asset), options: [.applyOrientationProperty: true]) else {
            throw PhotoPipelineError.proxyUnavailable
        }
        return try portraitPipeline.analyze(image: normalized(image), asset: asset)
    }

    /// Reopening target selection must validate real current proxy evidence without replacing saved IDs/anchors.
    func validatePortraitTargets(asset: AssetRecord, portrait: PortraitRecipe) throws {
        try portrait.validate(asset: asset)
        guard let image = CIImage(contentsOf: proxyURL(asset), options: [.applyOrientationProperty: true]) else {
            throw PhotoPipelineError.proxyUnavailable
        }
        _ = try portraitPipeline.apply(portrait, to: normalized(image))
    }

    /// Only cached local Original metadata is inspected, never downloaded or used as the edit preview.
    func sourceDimensions(asset: AssetRecord) -> PixelDimensions? {
        let url = root.appendingPathComponent(asset.originalRelativePath)
        guard let source = CGImageSourceCreateWithURL(url as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int, width > 0, height > 0 else { return nil }
        let orientation = properties[kCGImagePropertyOrientation] as? Int ?? 1
        return (5...8).contains(orientation) ? PixelDimensions(width: height, height: width) : PixelDimensions(width: width, height: height)
    }

    func export(checkpoint: ProjectCheckpoint, format: ExportFormat, sequence: Int = 1) async throws -> URL {
        let plan = try ExportPlan(checkpoint: checkpoint, format: format)
        let original = root.appendingPathComponent(checkpoint.asset.originalRelativePath)
        let directory = root.appendingPathComponent("Exports")
        let settings = try plan.parameters.exportSettings() ?? ExportSettings()
        let base = URL(fileURLWithPath: checkpoint.asset.originalFilename).deletingPathExtension().lastPathComponent
        let candidate = settings.fileNameTemplate.replacingOccurrences(of: "{original}", with: base)
            .replacingOccurrences(of: "{sequence}", with: String(sequence))
        // A unique suffix is mandatory: an existing Final or Original is never overwritten.
        let safeName = String(candidate.unicodeScalars.map { CharacterSet.alphanumerics.contains($0) || "-_ ".unicodeScalars.contains($0) ? String($0) : "_" }.joined().prefix(120))
        let ext = format == .tiff ? "tiff" : format == .png ? "png" : "jpg"
        let destination = directory.appendingPathComponent("\(safeName)-\(plan.id.uuidString).\(ext)")
        return try await render(RAWRenderRequest(plan: plan, originalURL: original, destinationURL: destination))
    }

    func validate(_ request: RAWRenderRequest) async throws {
        try Task.checkCancellation()
        try request.plan.validate()
        guard Set(request.plan.parameters.extendedParameters.keys).isSubset(of: ["crop", "export", "portrait"]),
              request.plan.canonicalGeneratedAssetIDs.isEmpty,
              Set(request.plan.parameters.processingOrder).isSubset(of: supportedAdjustments) else { throw PhotoPipelineError.unsupportedRecipe }
        try validatePortraitBinding(request.plan.parameters, assetID: request.plan.assetID, originalSHA256: request.plan.originalSHA256)
        let original = request.originalURL
        guard FileManager.default.fileExists(atPath: original.path) else { throw PhotoPipelineError.waitingForOriginal }
        guard try digest(original) == request.plan.originalSHA256.lowercased() else { throw PhotoPipelineError.integrityMismatch }
        if let portrait = try request.plan.parameters.portraitRecipe() {
            // A serialized, self-described target is not trusted independently of the persisted inventory.
            // Do not replace fixed input with a newer Recipe; mismatch means explicit refusal.
            let store = try ProjectStore(directory: root.appendingPathComponent("Recipes"))
            guard let saved = try await store.load(id: request.plan.assetID),
                  saved.revision == request.plan.recipeRevision,
                  saved.history.current == request.plan.parameters,
                  root.appendingPathComponent(saved.asset.originalRelativePath).standardizedFileURL.resolvingSymlinksInPath()
                    == original.standardizedFileURL.resolvingSymlinksInPath() else {
                throw PhotoPipelineError.unsupportedRecipe
            }
            try portrait.validate(asset: saved.asset)
            guard let reference = try saved.history.entries.compactMap({ try $0.parameters.portraitRecipe() }).first else {
                throw PhotoPipelineError.unsupportedRecipe
            }
            try portrait.validate(against: reference)
        }
    }

    func render(_ request: RAWRenderRequest) async throws -> URL {
        try await validate(request)
        // Never fall back to proxy if Original decode/fetch fails.
        let full = try decodeOriginal(request.originalURL, proxyLongEdge: nil)
        var output = try apply(request.plan.parameters, to: full, assetID: request.plan.assetID,
                               originalSHA256: request.plan.originalSHA256)
        var settings = try request.plan.parameters.exportSettings() ?? ExportSettings()
        // Explicit format buttons may override the stored format, but not quality/color/crop settings.
        guard let requestedFormat = CropExportFormat(rawValue: request.plan.format.rawValue) else { throw PhotoPipelineError.unsupportedRecipe }
        if settings.format == requestedFormat && requestedFormat == .png && settings.bitDepth != 8 {
            throw PhotoPipelineError.unsupportedRecipe
        }
        settings.format = requestedFormat
        if request.plan.format != .tiff { settings.bitDepth = 8; settings.tiffCompression = .none }
        if request.plan.format == .jpeg { settings.preserveAlpha = false }
        try settings.validate()
        if let crop = try request.plan.parameters.cropSettings(), let width = crop.widthMM, let height = crop.heightMM {
            let target = try CropExportMath.requiredPixels(widthMM: width, heightMM: height, dpi: settings.requestedDPI)
            guard Double(target.width) <= output.extent.width + 0.001,
                  Double(target.height) <= output.extent.height + 0.001 else { throw PhotoPipelineError.insufficientResolution }
            output = output.transformed(by: CGAffineTransform(scaleX: Double(target.width) / output.extent.width,
                                                               y: Double(target.height) / output.extent.height))
                .cropped(to: CGRect(x: 0, y: 0, width: target.width, height: target.height))
        }
        let extent = output.extent.integral
        guard extent.width > 0, extent.height > 0,
              Double(extent.width) * Double(extent.height) * 16 < Double(ProcessInfo.processInfo.physicalMemory) / 3 else {
            throw PhotoPipelineError.resourcesUnavailable
        }
        guard let destinationColorSpace = CGColorSpace(name: settings.colorSpace == .sRGB ? CGColorSpace.sRGB : CGColorSpace.adobeRGB1998) else {
            throw PhotoPipelineError.exportVerification
        }
        if request.plan.format == .jpeg || !settings.preserveAlpha {
            let white = CIImage(color: CIColor(red: 1, green: 1, blue: 1)).cropped(to: extent)
            output = output.composited(over: white)
        }
        // CIContext converts pixel values into the destination profile. No ICC-tag-only substitution.
        let pixelFormat: CIFormat = request.plan.format == .tiff && settings.bitDepth == 16 ? .RGBA16 : .RGBA8
        guard let pixels = context.createCGImage(output, from: extent, format: pixelFormat, colorSpace: destinationColorSpace) else {
            throw PhotoPipelineError.exportVerification
        }
        let directory = request.destinationURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let staging = directory.appendingPathComponent(".partial-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: staging) }
        try Task.checkCancellation()
        let type = request.plan.format == .tiff ? UTType.tiff.identifier : request.plan.format == .png ? UTType.png.identifier : UTType.jpeg.identifier
        guard let encoder = CGImageDestinationCreateWithURL(staging as CFURL, type as CFString, 1, nil) else { throw PhotoPipelineError.exportVerification }
        var encodeProperties: [CFString: Any] = [kCGImagePropertyDPIWidth: settings.requestedDPI, kCGImagePropertyDPIHeight: settings.requestedDPI,
            kCGImagePropertyOrientation: 1, kCGImageDestinationLossyCompressionQuality: Double(settings.jpegQuality) / 100.0]
        if settings.metadata == .preserve,
           let originalSource = CGImageSourceCreateWithURL(request.originalURL as CFURL, nil),
           let originalProperties = CGImageSourceCopyPropertiesAtIndex(originalSource, 0, nil) as? [CFString: Any] {
            // Copy descriptive groups, not source size/orientation/profile or embedded thumbnails.
            for key in [kCGImagePropertyExifDictionary, kCGImagePropertyIPTCDictionary, kCGImagePropertyGPSDictionary] {
                encodeProperties[key] = originalProperties[key]
            }
            var exif = encodeProperties[kCGImagePropertyExifDictionary] as? [CFString: Any] ?? [:]
            exif[kCGImagePropertyExifPixelXDimension] = pixels.width
            exif[kCGImagePropertyExifPixelYDimension] = pixels.height
            // Source EXIF color-space declaration must not contradict newly converted pixels.
            exif[kCGImagePropertyExifColorSpace] = settings.colorSpace == .sRGB ? 1 : 65535
            encodeProperties[kCGImagePropertyExifDictionary] = exif
        }
        if request.plan.format == .tiff {
            encodeProperties[kCGImagePropertyTIFFDictionary] = [kCGImagePropertyTIFFCompression: settings.tiffCompression == .none ? 1 : 5,
                kCGImagePropertyTIFFXResolution: settings.requestedDPI, kCGImagePropertyTIFFYResolution: settings.requestedDPI,
                kCGImagePropertyTIFFResolutionUnit: 2, kCGImagePropertyTIFFOrientation: 1]
        }
        CGImageDestinationAddImage(encoder, pixels, encodeProperties as CFDictionary)
        guard CGImageDestinationFinalize(encoder) else { throw PhotoPipelineError.exportVerification }
        guard let exported = CGImageSourceCreateWithURL(staging as CFURL, nil), CGImageSourceGetCount(exported) > 0,
              let properties = CGImageSourceCopyPropertiesAtIndex(exported, 0, nil) as? [CFString: Any],
              (properties[kCGImagePropertyPixelWidth] as? Int) == pixels.width,
              (properties[kCGImagePropertyPixelHeight] as? Int) == pixels.height,
              let dpiX = properties[kCGImagePropertyDPIWidth] as? Double,
              let dpiY = properties[kCGImagePropertyDPIHeight] as? Double,
              abs(dpiX - settings.requestedDPI) < 0.1, abs(dpiY - settings.requestedDPI) < 0.1,
              let decodedPixels = CGImageSourceCreateImageAtIndex(exported, 0, nil),
              decodedPixels.bitsPerComponent == (request.plan.format == .tiff ? settings.bitDepth : 8),
              let exportedColorSpace = decodedPixels.colorSpace,
              CFEqual(exportedColorSpace, destinationColorSpace) else { throw PhotoPipelineError.exportVerification }
        if request.plan.format == .tiff {
            let tiff = properties[kCGImagePropertyTIFFDictionary] as? [CFString: Any]
            guard (tiff?[kCGImagePropertyTIFFCompression] as? Int) == (settings.tiffCompression == .none ? 1 : 5) else {
                throw PhotoPipelineError.exportVerification
            }
        }
        if request.plan.format == .png && settings.preserveAlpha {
            guard (properties[kCGImagePropertyHasAlpha] as? Bool) == true else { throw PhotoPipelineError.exportVerification }
        }
        guard try digest(request.originalURL) == request.plan.originalSHA256.lowercased() else { throw PhotoPipelineError.integrityMismatch }
        let handle = try FileHandle(forWritingTo: staging)
        try handle.synchronize()
        try handle.close()
        try Task.checkCancellation()
        // Same directory, no overwrite. A cancelled/failed encoder never publishes a partial Final.
        try FileManager.default.moveItem(at: staging, to: request.destinationURL)
        return request.destinationURL
    }

    private func decodeOriginal(_ url: URL, proxyLongEdge: Int?) throws -> CIImage {
        if let raw = CIRAWFilter(imageURL: url) {
            if let limit = proxyLongEdge, let size = raw.outputImage?.extent.size {
                raw.scaleFactor = Float(min(1, Double(limit) / Double(max(size.width, size.height))))
            }
            guard let image = raw.outputImage else { throw PhotoPipelineError.unsupportedImage }
            return image
        }
        let rawExtensions = Set(["raw", "dng", "cr2", "cr3", "nef", "nrw", "arw", "raf", "rw2", "orf", "pef", "srw"])
        if UTType(filenameExtension: url.pathExtension)?.conforms(to: .rawImage) == true || rawExtensions.contains(url.pathExtension.lowercased()) {
            // ImageIO may expose an embedded preview for an unsupported RAW. It is never a Final source.
            throw PhotoPipelineError.unsupportedImage
        }
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let sourceType = CGImageSourceGetType(source) as String?,
              [UTType.jpeg.identifier, UTType.png.identifier, UTType.heic.identifier].contains(sourceType) else {
            // Unknown/RAW/TIFF-family containers are not trusted as raster Final inputs merely by extension.
            throw PhotoPipelineError.unsupportedImage
        }
        if let limit = proxyLongEdge,
           let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
               kCGImageSourceCreateThumbnailFromImageAlways: true,
               kCGImageSourceCreateThumbnailWithTransform: true,
               kCGImageSourceThumbnailMaxPixelSize: limit
           ] as CFDictionary) {
            return CIImage(cgImage: thumbnail)
        }
        if proxyLongEdge != nil { throw PhotoPipelineError.proxyUnavailable }
        guard let image = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else { throw PhotoPipelineError.unsupportedImage }
        return image
    }

    private func downscale(_ image: CIImage, maxEdge: Int) -> CIImage {
        let scale = min(1, Double(maxEdge) / Double(max(image.extent.width, image.extent.height)))
        return image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    }

    private func apply(_ p: RecipeParameters, to image: CIImage, assetID: UUID, originalSHA256: String) throws -> CIImage {
        try p.validate()
        guard Set(p.extendedParameters.keys).isSubset(of: ["crop", "export", "portrait"]) else { throw PhotoPipelineError.unsupportedRecipe }
        try validatePortraitBinding(p, assetID: assetID, originalSHA256: originalSHA256)
        var output = normalized(image)
        // Fixed engine-v1 portrait stage: upright photo-local coordinates, once, before global/rotate/crop.
        if let portrait = try p.portraitRecipe() { output = try portraitPipeline.apply(portrait, to: output) }
        for stage in p.processingOrder {
            switch stage {
            case .exposure: output = output.applyingFilter("CIExposureAdjust", parameters: [kCIInputEVKey: p.exposure])
            case .contrast: output = output.applyingFilter("CIColorControls", parameters: [kCIInputContrastKey: p.contrast])
            case .saturation: output = output.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: p.saturation])
            case .rotation: output = output.transformed(by: CGAffineTransform(rotationAngle: Double(p.rotationDegrees) * .pi / 180))
            case .crop:
                guard let crop = try p.cropSettings() else { throw PhotoPipelineError.unsupportedRecipe }
                let rect = crop.cropRect
                let extent = output.extent
                let region = CGRect(x: extent.minX + extent.width * rect.x,
                                    y: extent.minY + extent.height * (1 - rect.y - rect.height),
                                    width: extent.width * rect.width, height: extent.height * rect.height)
                if let ratio = crop.cropRatio {
                    guard abs(Double(region.width / region.height) - ratio.width / ratio.height) <= 0.003 else {
                        throw PhotoPipelineError.unsupportedRecipe
                    }
                }
                output = output.cropped(to: region)
            default: throw PhotoPipelineError.unsupportedRecipe
            }
        }
        return output.transformed(by: CGAffineTransform(translationX: -output.extent.minX, y: -output.extent.minY))
    }

    private func validatePortraitBinding(_ p: RecipeParameters, assetID: UUID, originalSHA256: String) throws {
        if let portrait = try p.portraitRecipe() {
            try portrait.validate()
            guard portrait.assetID == assetID, portrait.originalSHA256 == originalSHA256.lowercased() else {
                throw PhotoPipelineError.unsupportedRecipe
            }
        }
    }
    private func normalized(_ image: CIImage) -> CIImage {
        image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
    }

    private func proxyURL(_ asset: AssetRecord) -> URL { root.appendingPathComponent("Proxies/\(asset.id.uuidString).jpg") }
    private func digest(_ url: URL) throws -> String {
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        var hash = SHA256()
        while let data = try file.read(upToCount: 1024 * 1024), !data.isEmpty {
            try Task.checkCancellation()
            hash.update(data: data)
        }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
