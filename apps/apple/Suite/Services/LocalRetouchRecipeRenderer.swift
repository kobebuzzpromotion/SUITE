import Foundation
import CoreImage
import SuiteCore

/// Synchronous actor-local renderer. Input is the same upright, uncropped photo.
/// No model inference, image replacement, save or automatic semantic selection.
/// Bounded full-frame implementation: over-budget Final is rejected, never resized.
struct LocalRetouchRecipeRenderer {
    enum RenderError: Error { case binding, invalidFrame, resources, unavailable, donorOutOfBounds }
    let context: CIContext

    func apply(_ recipe: LocalRetouchRecipe, to image: CIImage,
               assetID: UUID, originalSHA256: String) throws -> CIImage {
        try recipe.validate(); try checkResources()
        guard recipe.assetID == assetID, recipe.originalSHA256 == originalSHA256.lowercased() else {
            throw RenderError.binding
        }
        let extent = image.extent
        guard extent.origin == .zero, extent.width.isFinite, extent.height.isFinite,
              extent.width > 0, extent.height > 0, extent.width.rounded() == extent.width,
              extent.height.rounded() == extent.height,
              extent.width <= 32768, extent.height <= 32768,
              extent.width * extent.height <= 16_000_000,
              // Float input/output/candidate/intermediate, mask planes, CI source
              // and returned bitmap are included in this conservative allowance.
              Double(extent.width * extent.height) * 192 < Double(ProcessInfo.processInfo.physicalMemory) / 3 else {
            throw RenderError.resources
        }
        let width = Int(extent.width), height = Int(extent.height)
        // Only resolution changes, never crop/aspect/rotation changes. Allow the
        // unavoidable one-pixel rounding of reference downsampling dimensions.
        guard abs(Double(width) / Double(height) - Double(recipe.referenceWidth) / Double(recipe.referenceHeight))
                <= 1 / Double(recipe.referenceHeight) + 1 / Double(height),
              let color = CGColorSpace(name: CGColorSpace.extendedLinearSRGB) else { throw RenderError.invalidFrame }
        var pixels = [Float](repeating: 0, count: width * height * 4)
        pixels.withUnsafeMutableBytes {
            context.render(image, toBitmap: $0.baseAddress!, rowBytes: width * 4 * MemoryLayout<Float>.size,
                           bounds: extent, format: .RGBAf, colorSpace: color)
        }
        guard pixels.allSatisfy(\.isFinite) else { throw RenderError.invalidFrame }
        for layer in recipe.layers {
            try checkResources()
            let mask = try coverage(layer.selection, width: width, height: height)
            let protection = try layer.protection.map { try coverage($0, width: width, height: height) }
            let source = pixels // Immutable within each layer; explicit layer ordering.
            switch layer.effect.kind {
            case .skinSmoothing:
                guard let referenceRadius = layer.effect.radiusReferencePixels else { throw RenderError.binding }
                let scaled = referenceRadius * min(Double(width) / Double(recipe.referenceWidth),
                                                    Double(height) / Double(recipe.referenceHeight))
                guard scaled.isFinite, scaled > 0, scaled <= 256 else { throw RenderError.resources }
                let candidate = try localMean(source, mask: mask, protection: protection,
                    width: width, height: height, radius: max(1, Int(ceil(scaled))))
                for p in mask.indices {
                    if p % width == 0 { try checkResources() }
                    guard source[p * 4 + 3] == 1 else { continue }
                    try blend(&pixels, source: source, donor: candidate, destination: p, donorPixel: p,
                          amount: Double(mask[p]) / 255 * layer.effect.strength * (1 - Double(protection?[p] ?? 0) / 255))
                }
            case .localRepair:
                guard let nx = layer.effect.sourceOffsetX, let ny = layer.effect.sourceOffsetY else { throw RenderError.binding }
                let dx = Int((nx * Double(width)).rounded()), dy = Int((ny * Double(height)).rounded())
                for y in 0..<height {
                    try checkResources()
                    for x in 0..<width {
                        let p = y * width + x
                        guard mask[p] > 0 else { continue }
                        let sx = x + dx, sy = y + dy
                        guard sx >= 0, sx < width, sy >= 0, sy < height else { throw RenderError.donorOutOfBounds }
                        let donor = sy * width + sx
                        guard source[p * 4 + 3] == 1, source[donor * 4 + 3] == 1,
                              (protection?[donor] ?? 0) == 0 else { continue }
                        try blend(&pixels, source: source, donor: source, destination: p, donorPixel: donor,
                              amount: Double(mask[p]) / 255 * layer.effect.strength * (1 - Double(protection?[p] ?? 0) / 255))
                    }
                }
            }
        }
        try checkResources()
        let data = pixels.withUnsafeBytes { Data($0) }
        return CIImage(bitmapData: data, bytesPerRow: width * 4 * MemoryLayout<Float>.size,
                       size: extent.size, format: .RGBAf, colorSpace: color)
    }

    /// Fractional pixel-area coverage avoids dropping subpixel rectangles. Stored
    /// top-left rectangles are converted explicitly to bottom-up raster rows.
    private func coverage(_ rect: LocalRetouchRecipe.Rectangle, width: Int, height: Int) throws -> [UInt8] {
        let left = rect.x * Double(width), right = (rect.x + rect.width) * Double(width)
        let bottom = (1 - rect.y - rect.height) * Double(height), top = (1 - rect.y) * Double(height)
        var mask = [UInt8](repeating: 0, count: width * height)
        for y in 0..<height {
            try checkResources()
            let h = max(0, min(Double(y + 1), top) - max(Double(y), bottom))
            guard h > 0 else { continue }
            for x in 0..<width {
                let w = max(0, min(Double(x + 1), right) - max(Double(x), left))
                mask[y * width + x] = UInt8(max(0, min(255, (w * h * 255).rounded())))
            }
        }
        return mask
    }

    private func blend(_ output: inout [Float], source: [Float], donor: [Float],
                       destination: Int, donorPixel: Int, amount: Double) throws {
        guard amount > 0 else { return }
        for c in 0..<3 {
            let value = Float(Double(source[destination * 4 + c]) * (1 - amount) + Double(donor[donorPixel * 4 + c]) * amount)
            guard value.isFinite else { throw RenderError.invalidFrame }
            output[destination * 4 + c] = value
        }
        // Alpha remains the immutable destination alpha.
    }

    /// Same domain-normalized local mean as the transient manual renderer. Kept
    /// synchronous here because this CIImage graph must stay in the caller actor.
    private func localMean(_ source: [Float], mask: [UInt8], protection: [UInt8]?,
                           width: Int, height: Int, radius: Int) throws -> [Float] {
        var horizontal = [Float](repeating: 0, count: width * height * 4)
        for y in 0..<height {
            try checkResources()
            var sum = [Double](repeating: 0, count: 4)
            func add(_ x: Int, _ sign: Double) {
                guard x >= 0, x < width else { return }
                let p = y * width + x
                guard source[p * 4 + 3] == 1 else { return }
                let weight = Double(mask[p]) / 255 * (1 - Double(protection?[p] ?? 0) / 255) * sign
                for c in 0..<3 { sum[c] += Double(source[p * 4 + c]) * weight }
                sum[3] += weight
            }
            for x in 0...min(radius, width - 1) { add(x, 1) }
            for x in 0..<width {
                for c in 0..<4 {
                    let value = Float(sum[c])
                    guard value.isFinite else { throw RenderError.invalidFrame }
                    horizontal[(y * width + x) * 4 + c] = value
                }
                add(x - radius, -1); add(x + radius + 1, 1)
            }
        }
        var result = source
        for x in 0..<width {
            try checkResources()
            var sum = [Double](repeating: 0, count: 4)
            func add(_ y: Int, _ sign: Double) {
                guard y >= 0, y < height else { return }
                for c in 0..<4 { sum[c] += Double(horizontal[(y * width + x) * 4 + c]) * sign }
            }
            for y in 0...min(radius, height - 1) { add(y, 1) }
            for y in 0..<height {
                if sum[3] > 1e-8 {
                    for c in 0..<3 {
                        let value = Float(sum[c] / sum[3])
                        guard value.isFinite else { throw RenderError.invalidFrame }
                        result[(y * width + x) * 4 + c] = value
                    }
                }
                add(y - radius, -1); add(y + radius + 1, 1)
            }
        }
        return result
    }

    private func checkResources() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw RenderError.resources
        default: break
        }
    }
}
