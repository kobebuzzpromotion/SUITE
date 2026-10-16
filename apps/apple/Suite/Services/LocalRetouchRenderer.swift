import Foundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import SuiteCore

/// Manual local preview kernel only; not automatic skin/defect recognition,
/// healing, original-resolution Final, UI integration or persistent Recipe editing.
actor LocalRetouchRenderer {
    enum RenderError: Error { case invalidReference, inconsistentInput, resources, unavailable }
    struct Result: Sendable {
        let png: Data
        let request: LocalRetouchRequest
        let rendererVersion: String
    }
    private let context = CIContext(options: [.cacheIntermediates: false])

    func render(referencePNG: Data, prepared: LocalFacePixels.Prepared,
                analysisVersion: String, request: LocalRetouchRequest) throws -> Result {
        try resources(); try request.validate()
        guard request.assetID == prepared.assetID,
              request.originalSHA256 == prepared.originalSHA256,
              request.analysisSHA256 == prepared.analysisSHA256,
              request.analysisVersion == analysisVersion,
              request.inputWidth == prepared.inputWidth, request.inputHeight == prepared.inputHeight,
              !referencePNG.isEmpty, referencePNG.count <= 32 * 1024 * 1024,
              Double(request.inputWidth) * Double(request.inputHeight) * 96 < Double(ProcessInfo.processInfo.physicalMemory) / 3,
              let source = CGImageSourceCreateWithData(referencePNG as CFData,
                [kCGImageSourceShouldCache: false] as CFDictionary), CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source), type as String == UTType.png.identifier,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              properties[kCGImagePropertyPixelWidth] as? Int == request.inputWidth,
              properties[kCGImagePropertyPixelHeight] as? Int == request.inputHeight,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1,
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              image.width == request.inputWidth, image.height == request.inputHeight else {
            throw RenderError.invalidReference
        }
        let measured = try LocalFacePixels.prepare(uprightUnmirrored: image,
            assetID: prepared.assetID, originalSHA256: prepared.originalSHA256)
        guard measured.analysisSHA256 == prepared.analysisSHA256, measured.bgr == prepared.bgr,
              measured.width == prepared.width, measured.height == prepared.height,
              measured.stride == prepared.stride,
              measured.preprocessingVersion == prepared.preprocessingVersion else { throw RenderError.inconsistentInput }
        try resources()
        let width = image.width, height = image.height
        let extent = CGRect(x: 0, y: 0, width: width, height: height)
        guard let color = CGColorSpace(name: CGColorSpace.sRGB) else { throw RenderError.unavailable }
        let input = CIImage(cgImage: image)
        let original = raster(input, extent: extent, width: width, height: height, color: color)
        var output = original
        let mask = [UInt8](request.maskL8BottomUp)
        let protection = request.protectionMaskL8BottomUp.map { [UInt8]($0) }
        let strength: Double
        let candidate: [UInt8]
        let offsetX: Int, offsetY: Int
        let isClone: Bool
        switch request.effect {
        case let .skinSmoothing(amount, radius):
            strength = amount; offsetX = 0; offsetY = 0; isClone = false
            // Radius is in this upright INPUT frame, never original/RAW pixels.
            candidate = try normalizedLocalMean(original, mask: mask, protection: protection,
                width: width, height: height, radius: Int(ceil(radius)))
        case let .localRepair(amount, dx, dy):
            strength = amount; offsetX = dx; offsetY = dy; isClone = true
            candidate = original // Immutable same-photo donor, no feedback accumulation.
        }
        for y in 0..<height {
            try resources()
            for x in 0..<width {
                let pixel = y * width + x, at = pixel * 4
                guard mask[pixel] > 0, original[at + 3] == 255 else { continue }
                let sx = x + offsetX, sy = y + offsetY
                guard sx >= 0, sx < width, sy >= 0, sy < height else { throw RenderError.inconsistentInput }
                let donor = sy * width + sx, from = donor * 4
                // Preserve transparent/semitransparent pixels rather than copying
                // premultiplied donor RGB under a different alpha.
                guard candidate[from + 3] == 255 else { continue }
                if isClone && (protection?[donor] ?? 0) > 0 { continue }
                let weight = Double(mask[pixel]) / 255 * strength * (1 - Double(protection?[pixel] ?? 0) / 255)
                for channel in 0..<3 {
                    output[at + channel] = UInt8(max(0, min(255,
                        (Double(original[at + channel]) * (1 - weight) + Double(candidate[from + channel]) * weight).rounded())))
                }
                // Original alpha and all excluded pixels remain byte-for-byte unchanged.
            }
        }
        try resources()
        let rendered = CIImage(bitmapData: Data(output), bytesPerRow: width * 4,
            size: CGSize(width: width, height: height), format: .RGBA8, colorSpace: color)
        guard let png = context.pngRepresentation(of: rendered, format: .RGBA8, colorSpace: color, options: [:]),
              png.count <= 32 * 1024 * 1024 else { throw RenderError.resources }
        try resources()
        return Result(png: png, request: request, rendererVersion: "suite-manual-domain-mean-clone-input-v2")
    }

    /// Separable normalized box convolution, equivalent to a local weighted mean.
    /// BOTH sampling and destination domains exclude protected/unselected pixels.
    /// Channel 3 carries coverage, not alpha. No edge replication or foreign color
    /// enters the mean; a zero denominator preserves the immutable original.
    private func normalizedLocalMean(_ original: [UInt8], mask: [UInt8], protection: [UInt8]?,
                                     width: Int, height: Int, radius: Int) throws -> [UInt8] {
        var horizontal = [Float](repeating: 0, count: width * height * 4)
        for y in 0..<height {
            try resources()
            var sum = [Double](repeating: 0, count: 4)
            func accumulate(_ x: Int, _ sign: Double) {
                guard x >= 0, x < width else { return }
                let pixel = y * width + x, at = pixel * 4
                guard original[at + 3] == 255 else { return }
                let weight = Double(mask[pixel]) / 255 * (1 - Double(protection?[pixel] ?? 0) / 255) * sign
                for c in 0..<3 { sum[c] += Double(original[at + c]) * weight }
                sum[3] += weight
            }
            for x in 0...min(radius, width - 1) { accumulate(x, 1) }
            for x in 0..<width {
                let at = (y * width + x) * 4
                for c in 0..<4 { horizontal[at + c] = Float(sum[c]) }
                accumulate(x - radius, -1); accumulate(x + radius + 1, 1)
            }
        }
        var result = original
        for x in 0..<width {
            try resources()
            var sum = [Double](repeating: 0, count: 4)
            func accumulate(_ y: Int, _ sign: Double) {
                guard y >= 0, y < height else { return }
                let at = (y * width + x) * 4
                for c in 0..<4 { sum[c] += Double(horizontal[at + c]) * sign }
            }
            for y in 0...min(radius, height - 1) { accumulate(y, 1) }
            for y in 0..<height {
                let at = (y * width + x) * 4
                if sum[3] > 1e-8 {
                    for c in 0..<3 {
                        result[at + c] = UInt8(max(0, min(255, (sum[c] / sum[3]).rounded())))
                    }
                }
                accumulate(y - radius, -1); accumulate(y + radius + 1, 1)
            }
        }
        return result
    }

    private func raster(_ image: CIImage, extent: CGRect, width: Int, height: Int,
                        color: CGColorSpace) -> [UInt8] {
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        bytes.withUnsafeMutableBytes { buffer in
            context.render(image, toBitmap: buffer.baseAddress!, rowBytes: width * 4,
                           bounds: extent, format: .RGBA8, colorSpace: color)
        }
        return bytes
    }
    private func resources() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw RenderError.resources
        default: break
        }
    }
}
