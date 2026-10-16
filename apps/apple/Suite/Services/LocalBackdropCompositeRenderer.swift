import Foundation
import CoreImage
import ImageIO
import CryptoKit
import UniformTypeIdentifiers

/// Explicit matte composition only. Host obtains background bytes through
/// LocalBackdropAssetStore.bytesForUse; no automatic segmentation or permission
/// inference. The source is upright/uncropped and its provenance is host-attested.
struct LocalBackdropCompositeRenderer {
    enum Failure: Error { case invalidInput, binding, resources, unavailable }
    enum Rows: Sendable { case topLeft, bottomUp }
    struct Matte: Sendable {
        let assetID: UUID
        let originalSHA256: String
        let width: Int
        let height: Int
        let rows: Rows
        let l8: Data
    }
    /// Background target rectangle in normalized TOP-LEFT canvas coordinates.
    /// No implicit fit/fill, rotation or crop. Any overflow is explicitly clipped
    /// to the canvas; uncovered canvas remains transparent.
    struct Placement: Sendable {
        let x: Double, y: Double, width: Double, height: Double
    }
    // Host context must use extendedLinearSRGB working space and premultiplied
    // output. Output format alone does not select CoreImage's working space.
    let context: CIContext

    func apply(to original: CIImage, assetID: UUID, originalSHA256: String,
               matte: Matte, backgroundBytes: Data,
               backgroundManifest: LocalBackdropAssetStore.Manifest,
               canvasWidth: Int, canvasHeight: Int, placement: Placement,
               lighting: LocalBackdropLighting = .none) throws -> CIImage {
        try resources(); try backgroundManifest.validate(); try lighting.validate()
        guard matte.assetID == assetID, matte.originalSHA256 == originalSHA256,
              backgroundManifest.permission == .callerConfirmed else { throw Failure.binding }
        guard (1...32768).contains(canvasWidth), (1...32768).contains(canvasHeight),
              canvasWidth * canvasHeight <= 8_000_000,
              matte.width == canvasWidth, matte.height == canvasHeight,
              matte.l8.count == canvasWidth * canvasHeight,
              original.extent == CGRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight),
              [placement.x, placement.y, placement.width, placement.height].allSatisfy(\.isFinite),
              (-4...4).contains(placement.x), (-4...4).contains(placement.y),
              (0.001...8).contains(placement.width), (0.001...8).contains(placement.height),
              Double(canvasWidth * canvasHeight + backgroundManifest.width * backgroundManifest.height) * 128
                < Double(ProcessInfo.processInfo.physicalMemory) / 3,
              backgroundBytes.count == backgroundManifest.expectedByteCount,
              SHA256.hash(data: backgroundBytes).map({ String(format: "%02x", $0) }).joined() == backgroundManifest.expectedSHA256,
              let source = CGImageSourceCreateWithData(backgroundBytes as CFData,
                  [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source), [UTType.png.identifier, UTType.jpeg.identifier].contains(type as String),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              properties[kCGImagePropertyPixelWidth] as? Int == backgroundManifest.width,
              properties[kCGImagePropertyPixelHeight] as? Int == backgroundManifest.height,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1,
              let background = CGImageSourceCreateImageAtIndex(source, 0, nil),
              background.width == backgroundManifest.width, background.height == backgroundManifest.height,
              let linear = CGColorSpace(name: CGColorSpace.extendedLinearSRGB) else { throw Failure.invalidInput }
        var mask = [UInt8](matte.l8)
        if matte.rows == .topLeft {
            let immutable = mask
            for y in 0..<canvasHeight {
                try resources()
                mask.replaceSubrange((y * canvasWidth)..<((y + 1) * canvasWidth),
                    with: immutable[((canvasHeight - 1 - y) * canvasWidth)..<((canvasHeight - y) * canvasWidth)])
            }
        }
        let bounds = original.extent
        // Coverage is linear, not an sRGB color. Preserve all 256 soft-edge values.
        let matteImage = CIImage(bitmapData: Data(mask), bytesPerRow: canvasWidth,
            size: bounds.size, format: .L8, colorSpace: nil)
        let clear = CIImage(color: .clear).cropped(to: bounds)
        let targetWidth = placement.width * Double(canvasWidth)
        let targetHeight = placement.height * Double(canvasHeight)
        let placed = CIImage(cgImage: background)
            .transformed(by: CGAffineTransform(scaleX: targetWidth / Double(background.width),
                                               y: targetHeight / Double(background.height)))
            .transformed(by: CGAffineTransform(translationX: placement.x * Double(canvasWidth),
                y: (1 - placement.y - placement.height) * Double(canvasHeight)))
            .cropped(to: bounds)
        // Multiply premultiplied foreground RGB AND alpha by the soft matte,
        // then source-over: transparent original pixels cannot erase background.
        let foreground = original.applyingFilter("CIBlendWithMask", parameters: [
            kCIInputBackgroundImageKey: clear, kCIInputMaskImageKey: matteImage])
        var backdrop = placed.composited(over: clear)
        if lighting.backgroundEV != 0 {
            backdrop = backdrop.applyingFilter("CIExposureAdjust", parameters: [kCIInputEVKey: lighting.backgroundEV])
        }
        let shadowImage: CIImage?
        let shadowOpacity: Double
        switch lighting.shadow {
        case .none:
            shadowImage = nil; shadowOpacity = 0
        case .addDrop(let x, let y, let radius, let opacity):
            guard abs(x) <= Double(canvasWidth), abs(y) <= Double(canvasHeight) else { throw Failure.invalidInput }
            var shifted = matteImage.transformed(by: CGAffineTransform(translationX: x, y: y))
            if radius > 0 { shifted = shifted.applyingFilter("CIGaussianBlur", parameters: [kCIInputRadiusKey: radius]) }
            shadowImage = shifted.cropped(to: bounds); shadowOpacity = opacity
        case .explicitMask(let supplied, let opacity):
            guard supplied.assetID == assetID, supplied.originalSHA256 == originalSHA256,
                  supplied.width == canvasWidth, supplied.height == canvasHeight,
                  supplied.l8.count == canvasWidth * canvasHeight else { throw Failure.binding }
            let sourceMask = [UInt8](supplied.l8)
            var aligned = [UInt8](repeating: 0, count: sourceMask.count)
            for y in 0..<canvasHeight {
                try resources()
                let sourceY = supplied.rows == .topLeft ? canvasHeight - 1 - y : y
                for x in 0..<canvasWidth {
                    let index = y * canvasWidth + x, value = sourceMask[sourceY * canvasWidth + x]
                    guard value == 0 || mask[index] == 0 else { throw Failure.invalidInput }
                    aligned[index] = value
                }
            }
            shadowImage = CIImage(bitmapData: Data(aligned), bytesPerRow: canvasWidth,
                size: bounds.size, format: .L8, colorSpace: nil)
            shadowOpacity = opacity
        }
        if let shadowImage, shadowOpacity > 0 {
            // RGB attenuation only: the background alpha remains unchanged.
            // The old photo background is never an input to this stage.
            let darker = backdrop.applyingFilter("CIColorMatrix", parameters: [
                "inputRVector": CIVector(x: 1 - shadowOpacity, y: 0, z: 0, w: 0),
                "inputGVector": CIVector(x: 0, y: 1 - shadowOpacity, z: 0, w: 0),
                "inputBVector": CIVector(x: 0, y: 0, z: 1 - shadowOpacity, w: 0),
                "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1)])
            backdrop = darker.applyingFilter("CIBlendWithMask", parameters: [
                kCIInputBackgroundImageKey: backdrop, kCIInputMaskImageKey: shadowImage])
        }
        let composed = foreground.composited(over: backdrop).cropped(to: bounds)
        try resources()
        // Materialize bounded linear Float output here, keeping CI evaluation
        // inside the synchronous call rather than deferring it beyond cancellation.
        var output = [Float](repeating: 0, count: canvasWidth * canvasHeight * 4)
        output.withUnsafeMutableBytes {
            context.render(composed, toBitmap: $0.baseAddress!, rowBytes: canvasWidth * 16,
                           bounds: bounds, format: .RGBAf, colorSpace: linear)
        }
        for y in 0..<canvasHeight {
            try resources()
            guard output[(y * canvasWidth * 4)..<((y + 1) * canvasWidth * 4)].allSatisfy(\.isFinite) else { throw Failure.invalidInput }
        }
        return CIImage(bitmapData: output.withUnsafeBytes { Data($0) }, bytesPerRow: canvasWidth * 16,
                       size: bounds.size, format: .RGBAf, colorSpace: linear)
    }

    private func resources() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw Failure.resources
        default: break
        }
    }
}
