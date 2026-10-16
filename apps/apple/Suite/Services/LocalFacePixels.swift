import Foundation
import CoreGraphics
import CryptoKit

/// Analysis-only raster preparation. The caller supplies an already upright,
/// unmirrored CGImage, after PhotoPipeline's orientation normalization. CGImage
/// has no EXIF contract: this API never reads or reapplies EXIF orientation.
/// Original SHA is caller-validated provenance, not a hash of the supplied proxy.
/// Input-to-original proxy mapping stays with the caller; scales here map back
/// to this exact supplied upright image, never pretend it has original pixels.
/// Owned buffers are bounded. CoreGraphics decoder/private allocations cannot
/// be given a hard process-memory guarantee by this adapter.
enum LocalFacePixels {
    static let preprocessingVersion = "suite-bgr8-srgb-white-downsample-v1"

    struct Limits: Sendable {
        var maximumAnalysisDimension = 1600
        var maximumAnalysisPixels = 2_560_000
        var maximumWorkingBytes = 64 * 1024 * 1024
        /// Admission estimate for the supplied decoded raster, not a product RAW
        /// size cap. A caller can supply an original-bound proxy instead.
        var maximumInputRasterBytes = 1024 * 1024 * 1024
    }

    enum PreparationError: Error {
        case invalidIdentity, invalidLimits, invalidImage, resourceLimit, contextUnavailable
    }

    struct Prepared: Sendable {
        let bgr: Data
        let width: Int
        let height: Int
        let stride: Int
        let inputWidth: Int
        let inputHeight: Int
        let assetID: UUID
        let originalSHA256: String
        let analysisSHA256: String
        let preprocessingVersion: String

        /// Pixel-edge coordinates, top-left origin. Dimension rounding can make
        /// X and Y scales slightly different; never replace these with one scale.
        var inputPixelsPerAnalysisPixelX: Double { Double(inputWidth) / Double(width) }
        var inputPixelsPerAnalysisPixelY: Double { Double(inputHeight) / Double(height) }

        func inputPoint(x: Double, y: Double) -> (x: Double, y: Double) {
            (x * inputPixelsPerAnalysisPixelX, y * inputPixelsPerAnalysisPixelY)
        }

        /// Vision/PortraitFaceAnchor uses normalized bottom-left coordinates;
        /// YuNet uses analysis top-left pixel coordinates. Conversion is explicit.
        func visionNormalizedRect(x: Double, y: Double, width w: Double, height h: Double) -> CGRect? {
            guard [x, y, w, h].allSatisfy(\.isFinite), w > 0, h > 0,
                  x >= 0, y >= 0, x + w <= Double(width), y + h <= Double(height) else { return nil }
            return CGRect(x: x / Double(width), y: 1 - (y + h) / Double(height),
                          width: w / Double(width), height: h / Double(height))
        }
    }

    static func prepare(uprightUnmirrored image: CGImage, assetID: UUID,
                        originalSHA256: String, limits: Limits = Limits()) throws -> Prepared {
        try Task.checkCancellation()
        let digest = originalSHA256.lowercased()
        guard digest.utf8.count == 64,
              digest.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else {
            throw PreparationError.invalidIdentity
        }
        guard limits.maximumAnalysisDimension > 0, limits.maximumAnalysisDimension <= 32_768,
              limits.maximumAnalysisPixels > 0, limits.maximumWorkingBytes > 0,
              limits.maximumInputRasterBytes > 0 else { throw PreparationError.invalidLimits }
        guard image.width > 0, image.height > 0, image.bytesPerRow > 0,
              !image.isMask, image.colorSpace != nil else { throw PreparationError.invalidImage }
        let inputBytes = try product(image.bytesPerRow, image.height)
        guard inputBytes <= limits.maximumInputRasterBytes else { throw PreparationError.resourceLimit }
        let longest = max(image.width, image.height)
        let dimensionScale = min(1, Double(limits.maximumAnalysisDimension) / Double(longest))
        let pixelScale = min(1, sqrt(Double(limits.maximumAnalysisPixels) /
                                   (Double(image.width) * Double(image.height))))
        let scale = min(dimensionScale, pixelScale)
        let width = max(1, Int((Double(image.width) * scale).rounded(.down)))
        let height = max(1, Int((Double(image.height) * scale).rounded(.down)))
        let pixels = try product(width, height)
        let rgbaStride = try product(width, 4)
        let rgbaBytes = try product(rgbaStride, height)
        let stride = try product(width, 3)
        let bgrBytes = try product(stride, height)
        let (workingBytes, overflow) = rgbaBytes.addingReportingOverflow(bgrBytes)
        guard !overflow, pixels <= limits.maximumAnalysisPixels,
              workingBytes <= limits.maximumWorkingBytes else { throw PreparationError.resourceLimit }

        var rgba = Data(count: rgbaBytes)
        try rgba.withUnsafeMutableBytes { (storage: UnsafeMutableRawBufferPointer) in
            guard let base = storage.baseAddress,
                  let color = CGColorSpace(name: CGColorSpace.sRGB),
                  let context = CGContext(data: base, width: width, height: height,
                                          bitsPerComponent: 8, bytesPerRow: rgbaStride, space: color,
                                          bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue |
                                            CGImageAlphaInfo.premultipliedLast.rawValue) else {
                throw PreparationError.contextUnavailable
            }
            // This is a raw Quartz bitmap context, not a UIKit (flipped) context.
            // Identity-CTM CGImage draw preserves CGImage scanline order: byte
            // row 0 is image top. Do not apply a UIKit vertical-flip recipe here.
            // Packed RGBA bytes are explicit (32Big + premultipliedLast); alpha
            // is composited over white before BGR packing, never just discarded.
            context.setFillColor(red: 1, green: 1, blue: 1, alpha: 1)
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
            context.setBlendMode(.normal)
            context.interpolationQuality = .high
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        try Task.checkCancellation()
        var bgr = Data(count: bgrBytes)
        try rgba.withUnsafeBytes { (source: UnsafeRawBufferPointer) in
            try bgr.withUnsafeMutableBytes { (destination: UnsafeMutableRawBufferPointer) in
                for y in 0..<height {
                    try Task.checkCancellation()
                    for x in 0..<width {
                        let input = y * rgbaStride + x * 4
                        let output = y * stride + x * 3
                        destination[output] = source[input + 2]
                        destination[output + 1] = source[input + 1]
                        destination[output + 2] = source[input]
                    }
                }
            }
        }
        try Task.checkCancellation()
        let analysisSHA256 = SHA256.hash(data: bgr).map { String(format: "%02x", $0) }.joined()
        return Prepared(bgr: bgr, width: width, height: height, stride: stride,
                        inputWidth: image.width, inputHeight: image.height, assetID: assetID,
                        originalSHA256: digest, analysisSHA256: analysisSHA256,
                        preprocessingVersion: preprocessingVersion)
    }

    private static func product(_ a: Int, _ b: Int) throws -> Int {
        let (value, overflow) = a.multipliedReportingOverflow(by: b)
        guard !overflow, value > 0 else { throw PreparationError.resourceLimit }
        return value
    }
}
