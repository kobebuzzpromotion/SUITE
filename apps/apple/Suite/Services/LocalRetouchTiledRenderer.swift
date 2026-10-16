import Foundation
import CoreImage
import SuiteCore

/// Lazy, global-coordinate retouch. Host rendering context MUST use
/// extendedLinearSRGB/RGBAf. Writer/decoder allocations are separate budgets.
/// Core Image chooses callback regions; oversized requests fail, never shrink.
struct LocalRetouchTiledRenderer {
    enum Failure: Error { case binding, resourceLimit, invalidBuffer, invalidValue }
    final class Cancellation: @unchecked Sendable {
        private let lock = NSLock()
        private var cancelled = false
        func cancel() { lock.lock(); cancelled = true; lock.unlock() }
        func check() throws {
            lock.lock(); let value = cancelled; lock.unlock()
            if value { throw CancellationError() }
            try Task.checkCancellation()
            switch ProcessInfo.processInfo.thermalState {
            case .serious, .critical: throw Failure.resourceLimit
            default: break
            }
        }
    }
    private let cancellation: Cancellation
    init(context: CIContext, cancellation: Cancellation = Cancellation()) {
        // Context is supplied for API symmetry; graph evaluation uses the host's
        // context, not a hidden nested renderer that could recurse or allocate full frames.
        self.cancellation = cancellation
    }
    func apply(_ recipe: LocalRetouchRecipe, to image: CIImage,
               assetID: UUID, originalSHA256: String) throws -> CIImage {
        try recipe.validate(); try cancellation.check()
        let e = image.extent
        guard recipe.assetID == assetID, recipe.originalSHA256 == originalSHA256.lowercased(),
              e.origin == .zero, e.width.isFinite, e.height.isFinite,
              e.width >= 1, e.height >= 1, e.width <= 65536, e.height <= 65536,
              e.width.rounded() == e.width, e.height.rounded() == e.height,
              e.width * e.height <= 512_000_000,
              abs(Double(e.width / e.height) - recipe.referenceAspect)
                <= 1 / Double(recipe.referenceHeight) + 1 / Double(e.height) else { throw Failure.binding }
        var result = image
        for layer in recipe.layers {
            try cancellation.check()
            let radius: Int
            if let r = layer.effect.radiusReferencePixels {
                let scaled = ceil(r * min(Double(e.width) / Double(recipe.referenceWidth), Double(e.height) / Double(recipe.referenceHeight)))
                guard scaled > 0, scaled <= 1024 else { throw Failure.resourceLimit }
                radius = Int(scaled)
            } else { radius = 0 }
            let dx = Int(((layer.effect.sourceOffsetX ?? 0) * Double(e.width)).rounded())
            let dy = Int(((layer.effect.sourceOffsetY ?? 0) * Double(e.height)).rounded())
            let configuration = Configuration(layer: layer, width: Int(e.width), height: Int(e.height),
                radius: radius, dx: dx, dy: dy, cancellation: cancellation)
            // Separate shifted donor input avoids requesting a giant union ROI
            // when clone source and destination are far apart.
            // Clamping supplies buffers even for unselected edge tiles. Selected
            // donor coordinates are still explicitly bounded in process().
            let inputs = radius == 0 ? [result, result.transformed(by: CGAffineTransform(translationX: -CGFloat(dx), y: -CGFloat(dy))).clampedToExtent()] : [result]
            result = try Kernel.apply(withExtent: e, inputs: inputs, arguments: ["configuration": configuration])
        }
        return result
    }
    private final class Configuration: @unchecked Sendable {
        let layer: LocalRetouchRecipe.Layer
        let width: Int, height: Int, radius: Int, dx: Int, dy: Int
        let cancellation: Cancellation
        init(layer: LocalRetouchRecipe.Layer, width: Int, height: Int, radius: Int,
             dx: Int, dy: Int, cancellation: Cancellation) {
            self.layer = layer; self.width = width; self.height = height
            self.radius = radius; self.dx = dx; self.dy = dy; self.cancellation = cancellation
        }
        var extent: CGRect { CGRect(x: 0, y: 0, width: width, height: height) }
        func coverage(_ rect: LocalRetouchRecipe.Rectangle?, _ x: Int, _ y: Int) -> Double {
            guard let rect else { return 0 }
            let left = rect.x * Double(width), right = (rect.x + rect.width) * Double(width)
            let bottom = (1 - rect.y - rect.height) * Double(height), top = (1 - rect.y) * Double(height)
            let w = max(0, min(Double(x + 1), right) - max(Double(x), left))
            let h = max(0, min(Double(y + 1), top) - max(Double(y), bottom))
            return max(0, min(255, (w * h * 255).rounded())) / 255
        }
        func weight(_ x: Int, _ y: Int) -> Double {
            coverage(layer.selection, x, y) * (1 - coverage(layer.protection, x, y))
        }
    }
    private final class Kernel: CIImageProcessorKernel {
        // Serializes only CPU callbacks (not graph dependency evaluation). This
        // bounds our scratch allocation across concurrently requested output tiles.
        private static let allocationGate = NSLock()
        override class var outputFormat: CIFormat { .RGBAf }
        override class func formatForInput(at input: Int32) -> CIFormat { .RGBAf }
        override class func roi(forInput input: Int32, arguments: [String: Any]?, outputRect: CGRect) -> CGRect {
            guard let c = arguments?["configuration"] as? Configuration else { return .zero }
            return c.radius > 0 ? outputRect.insetBy(dx: -CGFloat(c.radius), dy: -CGFloat(c.radius)).intersection(c.extent).integral : outputRect.integral
        }
        override class func process(with inputs: [any CIImageProcessorInput]?, arguments: [String: Any]?,
                                    output: any CIImageProcessorOutput) throws {
            allocationGate.lock(); defer { allocationGate.unlock() }
            guard let c = arguments?["configuration"] as? Configuration,
                  let inputs, inputs.count == (c.radius > 0 ? 1 : 2), let source = inputs.first else { throw Failure.invalidBuffer }
            try c.cancellation.check()
            let region = output.region
            guard region == region.integral, !region.isEmpty, c.extent.contains(region),
                  region.width * region.height <= 1_048_576, output.format == .RGBAf,
                  output.bytesPerRow >= Int(region.width) * 16,
                  output.bytesPerRow <= 16 * 1024 * 1024 else { throw Failure.resourceLimit }
            for input in inputs {
                let r = input.region
                guard r == r.integral, !r.isEmpty, r.width.isFinite, r.height.isFinite,
                      r.width <= 65536, r.height <= 65536, r.width * r.height <= 16_777_216,
                      input.format == .RGBAf, input.bytesPerRow >= Int(r.width) * 16,
                      input.bytesPerRow <= 16 * 1024 * 1024 else { throw Failure.resourceLimit }
            }
            let x0 = Int(region.minX), y0 = Int(region.minY), w = Int(region.width), h = Int(region.height)
            // Explicit optional promotion also accepts SDK imports where these
            // CPU pointers are nullable; never dereference an unavailable surface.
            let outputAddress: UnsafeMutableRawPointer? = output.baseAddress
            guard let outputAddress else { throw Failure.invalidBuffer }
            let surfaces = inputs.reduce(0.0) { $0 + Double($1.bytesPerRow) * Double($1.region.height) }
            guard surfaces + Double(output.bytesPerRow) * Double(h) < Double(ProcessInfo.processInfo.physicalMemory) / 4 else { throw Failure.resourceLimit }
            func read(_ input: any CIImageProcessorInput, _ x: Int, _ y: Int, _ channel: Int) throws -> Float {
                guard CGFloat(x) >= input.region.minX, CGFloat(x) < input.region.maxX,
                      CGFloat(y) >= input.region.minY, CGFloat(y) < input.region.maxY else { throw Failure.invalidBuffer }
                let offset = (y - Int(input.region.minY)) * input.bytesPerRow + (x - Int(input.region.minX)) * 16 + channel * 4
                let address: UnsafeRawPointer? = input.baseAddress
                guard let address else { throw Failure.invalidBuffer }
                let value = address.load(fromByteOffset: offset, as: Float.self)
                guard value.isFinite else { throw Failure.invalidValue }
                return value
            }
            func write(_ x: Int, _ y: Int, _ channel: Int, _ value: Float) throws {
                guard value.isFinite else { throw Failure.invalidValue }
                let offset = (y - y0) * output.bytesPerRow + (x - x0) * 16 + channel * 4
                outputAddress.storeBytes(of: value, toByteOffset: offset, as: Float.self)
            }
            if c.radius == 0 {
                for y in y0..<(y0 + h) {
                    try c.cancellation.check()
                    for x in x0..<(x0 + w) {
                        let alpha = try read(source, x, y, 3), weight = c.weight(x, y) * c.layer.effect.strength
                        let sx = x + c.dx, sy = y + c.dy
                        let selected = c.coverage(c.layer.selection, x, y) > 0
                        if selected && !(sx >= 0 && sx < c.width && sy >= 0 && sy < c.height) { throw Failure.binding }
                        var amount = 0.0
                        if selected && alpha == 1 && c.coverage(c.layer.protection, sx, sy) == 0,
                           try read(inputs[1], x, y, 3) == 1 { amount = weight }
                        for channel in 0..<3 {
                            let original = try read(source, x, y, channel)
                            let value = amount > 0 ? Float(Double(original) * (1 - amount) + Double(try read(inputs[1], x, y, channel)) * amount) : original
                            try write(x, y, channel, value)
                        }
                        try write(x, y, 3, alpha)
                    }
                }
                return
            }
            let lowY = max(0, y0 - c.radius), highY = min(c.height, y0 + h + c.radius)
            let rows = highY - lowY
            let scratchBytes = w * rows * 16
            // Input surfaces + scratch + output are bounded before scratch allocation.
            guard scratchBytes <= 32 * 1024 * 1024,
                  surfaces + Double(scratchBytes) + Double(output.bytesPerRow) * Double(h) < Double(ProcessInfo.processInfo.physicalMemory) / 4 else { throw Failure.resourceLimit }
            var horizontal = [Float](repeating: 0, count: w * rows * 4)
            for y in lowY..<highY {
                try c.cancellation.check()
                var sums = [Double](repeating: 0, count: 4)
                func add(_ x: Int, _ sign: Double) throws {
                    guard x >= 0, x < c.width else { return }
                    guard try read(source, x, y, 3) == 1 else { return }
                    let weight = c.weight(x, y) * sign
                    for channel in 0..<3 { sums[channel] += Double(try read(source, x, y, channel)) * weight }
                    sums[3] += weight
                }
                for x in max(0, x0 - c.radius)...min(c.width - 1, x0 + c.radius) { try add(x, 1) }
                for x in x0..<(x0 + w) {
                    for channel in 0..<4 {
                        let value = Float(sums[channel]); guard value.isFinite else { throw Failure.invalidValue }
                        horizontal[((y - lowY) * w + x - x0) * 4 + channel] = value
                    }
                    if x + 1 < x0 + w {
                        try add(x - c.radius, -1); try add(x + c.radius + 1, 1)
                    }
                }
            }
            for x in x0..<(x0 + w) {
                try c.cancellation.check()
                var sums = [Double](repeating: 0, count: 4)
                func add(_ y: Int, _ sign: Double) {
                    guard y >= lowY, y < highY else { return }
                    for channel in 0..<4 { sums[channel] += Double(horizontal[((y - lowY) * w + x - x0) * 4 + channel]) * sign }
                }
                for y in max(0, y0 - c.radius)...min(c.height - 1, y0 + c.radius) { add(y, 1) }
                for y in y0..<(y0 + h) {
                    let alpha = try read(source, x, y, 3)
                    let amount = alpha == 1 && sums[3] > 1e-8 ? c.weight(x, y) * c.layer.effect.strength : 0
                    for channel in 0..<3 {
                        let original = try read(source, x, y, channel)
                        let value = amount > 0 ? Float(Double(original) * (1 - amount) + Double(Float(sums[channel] / sums[3])) * amount) : original
                        try write(x, y, channel, value)
                    }
                    try write(x, y, 3, alpha)
                    add(y - c.radius, -1); add(y + c.radius + 1, 1)
                }
            }
        }
    }
}
