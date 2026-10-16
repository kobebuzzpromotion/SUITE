import Foundation
import CoreImage
import CryptoKit
import ImageIO
import UniformTypeIdentifiers
import SuiteCore

/// Display-only result of the saved manual-warp renderer. Prepared comparison
/// proves its white-composited BGR analysis input, not original file provenance;
/// original identity and upright/unmirrored provenance remain caller obligations.
/// No persistence or automatic body recognition. All CI objects stay in this actor.
actor LocalWarpRecipePreview {
    enum PreviewError: Error { case invalidReference, inconsistentInput, resources, unavailable }
    struct Result: Sendable {
        let png: Data
        let recipe: LocalWarpRecipe
        let referencePNGSHA256: String
    }
    private let context = CIContext(options: [.cacheIntermediates: false, .outputPremultiplied: true])

    func render(referencePNG: Data, prepared: LocalFacePixels.Prepared,
                recipe: LocalWarpRecipe, bodyMaskBytes: Data? = nil) throws -> Result {
        try resources(); try recipe.validate()
        guard recipe.assetID == prepared.assetID,
              recipe.originalSHA256 == prepared.originalSHA256,
              prepared.inputWidth > 0, prepared.inputHeight > 0,
              prepared.inputWidth <= 1600, prepared.inputHeight <= 1600,
              prepared.inputWidth * prepared.inputHeight <= 2_560_000,
              Double(prepared.inputWidth * prepared.inputHeight) * 224
                < Double(ProcessInfo.processInfo.physicalMemory) / 3,
              !referencePNG.isEmpty, referencePNG.count <= 32 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(referencePNG as CFData,
                  [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source), type as String == UTType.png.identifier,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              properties[kCGImagePropertyPixelWidth] as? Int == prepared.inputWidth,
              properties[kCGImagePropertyPixelHeight] as? Int == prepared.inputHeight,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1,
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              image.width == prepared.inputWidth, image.height == prepared.inputHeight else {
            throw PreviewError.invalidReference
        }
        try resources()
        let measured = try LocalFacePixels.prepare(uprightUnmirrored: image,
            assetID: prepared.assetID, originalSHA256: prepared.originalSHA256)
        guard measured.analysisSHA256 == prepared.analysisSHA256,
              measured.bgr == prepared.bgr, measured.width == prepared.width,
              measured.height == prepared.height, measured.stride == prepared.stride,
              measured.inputWidth == prepared.inputWidth, measured.inputHeight == prepared.inputHeight,
              measured.preprocessingVersion == prepared.preprocessingVersion else {
            throw PreviewError.inconsistentInput
        }
        try resources()
        // Reference dimensions belong to the saved recipe, not this proxy.
        // Shared renderer validates aspect and rejects subpixel brush radii.
        let rendered = try LocalWarpRecipeRenderer(context: context).apply(recipe,
            to: CIImage(cgImage: image), assetID: prepared.assetID,
            originalSHA256: prepared.originalSHA256, bodyMaskBytes: bodyMaskBytes)
        try resources()
        guard let color = CGColorSpace(name: CGColorSpace.sRGB),
              let png = context.pngRepresentation(of: rendered, format: .RGBA8,
                  colorSpace: color, options: [:]), png.count <= 32 * 1024 * 1024 else {
            throw PreviewError.unavailable
        }
        try resources()
        let digest = SHA256.hash(data: referencePNG).map { String(format: "%02x", $0) }.joined()
        // No suspension points: concurrent requests cannot interleave CI work.
        return Result(png: png, recipe: recipe, referencePNGSHA256: digest)
    }

    private func resources() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw PreviewError.resources
        default: break
        }
    }
}
