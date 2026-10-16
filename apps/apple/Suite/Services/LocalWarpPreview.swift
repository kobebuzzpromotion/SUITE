import Foundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import SuiteCore
import CryptoKit

/// All-or-nothing, unsaved preview. The exact same certified field samples the
/// image and every supplied mask. No UI, Recipe persistence or automatic body AI.
actor LocalWarpPreview {
    enum PreviewError: Error { case busy, invalidReference, inconsistentInput, resourceLimit, unavailable }
    struct Result: Sendable {
        let png: Data
        let map: LocalWarpCoordinateMap
        let warpedMasks: [LocalWarpMaskAdapter.Result]
        let analysisSHA256: String
        let preprocessingVersion: String
        let engineVersion: String
        let referencePNGSHA256: String
    }
    private let context = CIContext(options: [.cacheIntermediates: false, .outputPremultiplied: true])
    private let masksAdapter = LocalWarpMaskAdapter()
    private var busy = false

    func render(referencePNG: Data, prepared: LocalFacePixels.Prepared, geometryRevision: String,
                operations: [LocalWarpFieldBuilder.Operation], protectionTopLeftL8: Data? = nil,
                masks: [LocalWarpMaskAdapter.Mask] = []) async throws -> Result {
        guard !busy else { throw PreviewError.busy }
        busy = true; defer { busy = false }
        try resources()
        guard prepared.inputWidth > 0, prepared.inputHeight > 0,
              prepared.inputWidth <= 1600, prepared.inputHeight <= 1600,
              prepared.inputWidth * prepared.inputHeight <= 2_560_000,
              !referencePNG.isEmpty, referencePNG.count <= 32 * 1024 * 1024,
              masks.count <= 16, operations.count <= 128, geometryRevision.utf8.count <= 512,
              !geometryRevision.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw PreviewError.resourceLimit }
        let count = prepared.inputWidth * prepared.inputHeight
        var totalMaskBytes = 0
        for mask in masks {
            guard mask.space == .source, mask.assetID == prepared.assetID,
                  mask.originalSHA256.lowercased() == prepared.originalSHA256.lowercased(),
                  mask.geometryRevision == geometryRevision,
                  mask.inputWidth == prepared.inputWidth, mask.inputHeight == prepared.inputHeight,
                  mask.width == prepared.inputWidth, mask.height == prepared.inputHeight,
                  mask.bytes.count == count,
                  mask.bytes.count <= 32 * 1024 * 1024 - totalMaskBytes else { throw PreviewError.inconsistentInput }
            totalMaskBytes += mask.bytes.count
        }
        if let protectionTopLeftL8 {
            guard protectionTopLeftL8.count == count,
                  count <= 32 * 1024 * 1024 - totalMaskBytes else { throw PreviewError.resourceLimit }
            totalMaskBytes += count
        }
        guard Double(count) * 224 + Double(totalMaskBytes) * 3
                < Double(ProcessInfo.processInfo.physicalMemory) / 3 else { throw PreviewError.resourceLimit }
        // Keep all Core Image objects in this synchronous scope. Only Data and
        // the certified value map survive to the first inter-actor await below.
        let rendered = try renderImage(referencePNG: referencePNG, prepared: prepared,
            geometryRevision: geometryRevision, operations: operations, protection: protectionTopLeftL8)
        var warped: [LocalWarpMaskAdapter.Result] = []
        for mask in masks {
            try resources()
            let result = try await masksAdapter.warp(mask, using: rendered.map, outputRowOrder: mask.rowOrder)
            try resources()
            warped.append(result)
        }
        try resources()
        return Result(png: rendered.png, map: rendered.map, warpedMasks: warped,
            analysisSHA256: prepared.analysisSHA256, preprocessingVersion: prepared.preprocessingVersion,
            engineVersion: "suite-local-warp-preview-input-v1",
            referencePNGSHA256: SHA256.hash(data: referencePNG).map { String(format: "%02x", $0) }.joined())
    }

    private func renderImage(referencePNG: Data, prepared: LocalFacePixels.Prepared,
                             geometryRevision: String, operations: [LocalWarpFieldBuilder.Operation],
                             protection: Data?) throws -> (png: Data, map: LocalWarpCoordinateMap) {
        guard let source = CGImageSourceCreateWithData(referencePNG as CFData,
                  [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source), type as String == UTType.png.identifier,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              properties[kCGImagePropertyPixelWidth] as? Int == prepared.inputWidth,
              properties[kCGImagePropertyPixelHeight] as? Int == prepared.inputHeight,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1,
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              image.width == prepared.inputWidth, image.height == prepared.inputHeight else { throw PreviewError.invalidReference }
        // Prepared verifies the white-composited BGR analysis pixels only, not
        // original-file provenance or distinct PNG alpha/metadata. Caller owns
        // that provenance; Result additionally binds the exact supplied PNG bytes.
        let measured = try LocalFacePixels.prepare(uprightUnmirrored: image,
            assetID: prepared.assetID, originalSHA256: prepared.originalSHA256)
        guard measured.analysisSHA256 == prepared.analysisSHA256, measured.bgr == prepared.bgr,
              measured.width == prepared.width, measured.height == prepared.height,
              measured.stride == prepared.stride, measured.preprocessingVersion == prepared.preprocessingVersion else {
            throw PreviewError.inconsistentInput
        }
        try resources()
        let map = try LocalWarpFieldBuilder.build(photoID: prepared.assetID,
            originalSHA256: prepared.originalSHA256, geometryRevision: geometryRevision,
            width: prepared.inputWidth, height: prepared.inputHeight, operations: operations,
            protectionTopLeftL8: protection)
        let rendered = try LocalWarpImageRenderer(context: context).apply(.init(image: CIImage(cgImage: image),
            space: .source, assetID: prepared.assetID, originalSHA256: prepared.originalSHA256,
            geometryRevision: geometryRevision), map: map)
        try resources()
        guard let color = CGColorSpace(name: CGColorSpace.sRGB),
              let png = context.pngRepresentation(of: rendered.image, format: .RGBA8,
                  colorSpace: color, options: [:]), png.count <= 32 * 1024 * 1024 else { throw PreviewError.unavailable }
        try resources()
        return (png, map)
    }

    private func resources() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw PreviewError.resourceLimit
        default: break
        }
    }
}
