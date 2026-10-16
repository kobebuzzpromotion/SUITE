import Foundation
import CoreImage
import SuiteCore

/// Synchronous, actor-local image sampler. Uses the supplied certified ACTUAL
/// field unchanged; does not create body geometry, freeze regions or save edits.
struct LocalWarpImageRenderer {
    enum Space { case source, warped }
    enum RenderError: Error { case invalidFrame, alreadyWarped, resourceLimit, invalidPixels }
    /// CIImage stays in the host actor. Rewrapping a result as a new source is an
    /// explicit caller operation, never an implicit repeated application.
    /// Binding metadata is caller-attested: the renderer does not hash original
    /// file bytes or prove that the supplied CIImage belongs to that photo.
    struct Frame {
        let image: CIImage
        let space: Space
        let assetID: UUID
        let originalSHA256: String
        let geometryRevision: String
    }
    let context: CIContext

    func apply(_ source: Frame, map: LocalWarpCoordinateMap) throws -> Frame {
        try resources()
        guard source.space == .source else { throw RenderError.alreadyWarped }
        let extent = source.image.extent
        guard extent.origin == .zero, extent.width.isFinite, extent.height.isFinite,
              extent.width > 0, extent.height > 0, extent.width <= 32768, extent.height <= 32768,
              extent.width.rounded() == extent.width, extent.height.rounded() == extent.height,
              extent.width * extent.height <= 8_000_000,
              Double(extent.width * extent.height) * 128 + Double(map.width * map.height) * 8
                < Double(ProcessInfo.processInfo.physicalMemory) / 3 else { throw RenderError.resourceLimit }
        let width = Int(extent.width), height = Int(extent.height)
        try map.validateBinding(assetID: source.assetID, originalSHA256: source.originalSHA256,
            geometryRevision: source.geometryRevision, inputWidth: width, inputHeight: height)
        guard let color = CGColorSpace(name: CGColorSpace.extendedLinearSRGB) else { throw RenderError.invalidFrame }
        var input = [Float](repeating: 0, count: width * height * 4)
        input.withUnsafeMutableBytes { buffer in
            context.render(source.image, toBitmap: buffer.baseAddress!, rowBytes: width * 16,
                           bounds: extent, format: .RGBAf, colorSpace: color)
        }
        for row in 0..<height {
            try resources()
            guard input[(row * width * 4)..<((row + 1) * width * 4)].allSatisfy(\.isFinite) else {
                throw RenderError.invalidPixels
            }
        }
        // Immutable premultiplied RGBA source. Unlike the old Web RGB-only
        // sampler, alpha travels with RGB here to avoid colored transparency halos.
        let immutable = input
        var output = [Float](repeating: 0, count: input.count)
        for topY in 0..<height {
            try resources()
            let outputBottomY = height - 1 - topY
            for x in 0..<width {
                let mapped = try map.outputToSource(.init(x: (Double(x) + 0.5) / Double(width),
                                                         y: (Double(topY) + 0.5) / Double(height)))
                guard mapped.x.isFinite, mapped.y.isFinite,
                      (0...1).contains(mapped.x), (0...1).contains(mapped.y) else { throw RenderError.invalidFrame }
                // Map is TOP-LEFT pixel-center normalized; bitmap rows are bottom-up.
                // Edge-node clamp is sampling only, not a change to the certified field.
                let sx = max(0, min(Double(width - 1), mapped.x * Double(width) - 0.5))
                let sy = max(0, min(Double(height - 1), mapped.y * Double(height) - 0.5))
                let ax = Int(floor(sx)), ay = Int(floor(sy))
                let bx = min(width - 1, ax + 1), by = min(height - 1, ay + 1)
                let u = sx - Double(ax), v = sy - Double(ay)
                let indices = [((height - 1 - ay) * width + ax) * 4,
                               ((height - 1 - ay) * width + bx) * 4,
                               ((height - 1 - by) * width + ax) * 4,
                               ((height - 1 - by) * width + bx) * 4]
                let weights = [(1-u)*(1-v), u*(1-v), (1-u)*v, u*v]
                for channel in 0..<4 {
                    var sum = 0.0
                    for tap in 0..<4 { sum += Double(immutable[indices[tap] + channel]) * weights[tap] }
                    let value = Float(sum)
                    guard value.isFinite else { throw RenderError.invalidPixels }
                    output[(outputBottomY * width + x) * 4 + channel] = value
                }
            }
        }
        try resources()
        let bytes = output.withUnsafeBytes { Data($0) }
        let image = CIImage(bitmapData: bytes, bytesPerRow: width * 16,
            size: extent.size, format: .RGBAf, colorSpace: color)
        return Frame(image: image, space: .warped, assetID: source.assetID,
            originalSHA256: source.originalSHA256, geometryRevision: source.geometryRevision)
    }

    private func resources() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw RenderError.resourceLimit
        default: break
        }
    }
}
