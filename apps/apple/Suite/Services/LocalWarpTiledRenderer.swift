import Foundation
import CoreImage
import CryptoKit
import SuiteCore

/// Lazy Float/premultiplied warp. No full-image field or raster allocation.
/// Host context must evaluate in extendedLinearSRGB; all RGBA channels share
/// the certified global top-left map. CoreImage surfaces are bottom-left.
struct LocalWarpTiledRenderer {
    enum Failure: Error { case binding, resources, buffer, value }
    private let cancellation: LocalRetouchTiledRenderer.Cancellation
    init(context: CIContext, cancellation: LocalRetouchTiledRenderer.Cancellation = .init()) {
        self.cancellation = cancellation
    }
    func apply(_ recipe: LocalWarpRecipe, to image: CIImage, assetID: UUID, originalSHA256: String,
               bodyMaskBytes: Data? = nil) throws -> CIImage {
        try cancellation.check(); try recipe.validate()
        let e = image.extent
        guard e.origin == .zero, e.width.isFinite, e.height.isFinite,
              e.width >= 1, e.height >= 1, e.width <= 65536, e.height <= 65536,
              e == e.integral, e.width * e.height <= 512_000_000,
              recipe.assetID == assetID, recipe.originalSHA256 == originalSHA256.lowercased() else { throw Failure.binding }
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let hash = SHA256.hash(data: try encoder.encode(recipe)).map { String(format: "%02x", $0) }.joined()
        let evaluator = try LocalWarpWindowEvaluator(recipe: recipe, width: Int(e.width), height: Int(e.height),
            geometryRevision: "\(recipe.engineVersion):\(Int(e.width))x\(Int(e.height)):\(hash)")
        let cancellation = self.cancellation
        let certificate = try evaluator.certify(checkCancellation: { try cancellation.check() }); try cancellation.check()
        try LocalWarpBodyMaskGuard.validate(recipe, bytes: bodyMaskBytes, certificate: certificate,
            checkCancellation: { try cancellation.check() })
        return try Kernel.apply(withExtent: e, inputs: [image], arguments: ["configuration": Configuration(certificate, cancellation)])
    }
    private final class Configuration: @unchecked Sendable {
        let certificate: LocalWarpWindowEvaluator.Certificate
        let cancellation: LocalRetouchTiledRenderer.Cancellation
        private let lock = NSLock()
        private var failed = false
        init(_ certificate: LocalWarpWindowEvaluator.Certificate, _ cancellation: LocalRetouchTiledRenderer.Cancellation) {
            self.certificate = certificate; self.cancellation = cancellation
        }
        var width: Int { certificate.evaluator.width }
        var height: Int { certificate.evaluator.height }
        var extent: CGRect { CGRect(x: 0, y: 0, width: width, height: height) }
        func markFailed() { lock.lock(); failed = true; lock.unlock() }
        func check() throws {
            try cancellation.check(); lock.lock(); let rejected = failed; lock.unlock()
            if rejected { throw Failure.resources }
        }
        func windows(_ region: CGRect, body: (LocalWarpWindowEvaluator.Window) throws -> Void) throws {
            try check()
            guard region == region.integral, !region.isEmpty, extent.contains(region),
                  region.width * region.height <= 1_048_576 else { throw Failure.resources }
            let x0 = Int(region.minX), top = height - Int(region.maxY)
            for y in stride(from: top, to: top + Int(region.height), by: 256) {
                for x in stride(from: x0, to: Int(region.maxX), by: 256) {
                    try check()
                    let window = try certificate.window(.init(x: x, y: y,
                        width: min(256, Int(region.maxX) - x), height: min(256, top + Int(region.height) - y)),
                        checkCancellation: { try self.check() })
                    try check(); try body(window)
                }
            }
        }
    }
    private final class Kernel: CIImageProcessorKernel {
        private static let allocationGate = NSLock()
        override class var outputFormat: CIFormat { .RGBAf }
        override class func formatForInput(at input: Int32) -> CIFormat { .RGBAf }
        override class func roi(forInput input: Int32, arguments: [String: Any]?, outputRect: CGRect) -> CGRect {
            guard let c = arguments?["configuration"] as? Configuration else { return .zero }
            allocationGate.lock(); defer { allocationGate.unlock() }
            do {
                var roi = CGRect.null
                try c.windows(outputRect) { window in
                    let r = window.sourceBounds
                    roi = roi.union(CGRect(x: r.x, y: c.height-r.y-r.height, width: r.width, height: r.height))
                }
                guard !roi.isNull, roi.width * roi.height <= 16_777_216,
                      Double(roi.width * roi.height) * 16 < Double(ProcessInfo.processInfo.physicalMemory) / 4 else { throw Failure.resources }
                return roi
            } catch { c.markFailed(); return .zero }
        }
        override class func process(with inputs: [any CIImageProcessorInput]?, arguments: [String: Any]?,
                                    output: any CIImageProcessorOutput) throws {
            allocationGate.lock(); defer { allocationGate.unlock() }
            guard let c = arguments?["configuration"] as? Configuration, let inputs, inputs.count == 1,
                  let source = inputs.first else { throw Failure.buffer }
            try c.check()
            let region = output.region, inputRegion = source.region
            guard source.format == .RGBAf, output.format == .RGBAf,
                  inputRegion == inputRegion.integral, !inputRegion.isEmpty, c.extent.contains(inputRegion),
                  inputRegion.width * inputRegion.height <= 16_777_216,
                  source.bytesPerRow >= Int(inputRegion.width) * 16, source.bytesPerRow <= 16 * 1024 * 1024,
                  region == region.integral, !region.isEmpty, c.extent.contains(region), region.width * region.height <= 1_048_576,
                  output.bytesPerRow >= Int(region.width) * 16, output.bytesPerRow <= 16 * 1024 * 1024,
                  Double(source.bytesPerRow) * Double(inputRegion.height) + Double(output.bytesPerRow) * Double(region.height) + 16 * 1024 * 1024
                    < Double(ProcessInfo.processInfo.physicalMemory) / 4 else { throw Failure.resources }
            let from: UnsafeRawPointer? = source.baseAddress
            let to: UnsafeMutableRawPointer? = output.baseAddress
            guard let from, let to else { throw Failure.buffer }
            func read(_ x: Int, _ topY: Int, _ channel: Int) throws -> Double {
                let y = c.height - 1 - topY
                guard CGFloat(x) >= inputRegion.minX, CGFloat(x) < inputRegion.maxX,
                      CGFloat(y) >= inputRegion.minY, CGFloat(y) < inputRegion.maxY else { throw Failure.buffer }
                let offset = (y-Int(inputRegion.minY))*source.bytesPerRow + (x-Int(inputRegion.minX))*16 + channel*4
                let value = from.load(fromByteOffset: offset, as: Float.self)
                guard value.isFinite else { throw Failure.value }; return Double(value)
            }
            try c.windows(region) { window in
                for y in 0..<window.rect.height {
                    try c.check()
                    for x in 0..<window.rect.width {
                        let i = y*window.rect.width+x, sx = Double(window.sourceX[i]), sy = Double(window.sourceY[i])
                        guard sx.isFinite, sy.isFinite, sx >= 0, sy >= 0,
                              sx <= Double(c.width-1), sy <= Double(c.height-1) else { throw Failure.value }
                        let ax = Int(floor(sx)), ay = Int(floor(sy)), bx = min(c.width-1,ax+1), by = min(c.height-1,ay+1)
                        let u = sx-Double(ax), v = sy-Double(ay)
                        let ox = window.rect.x+x, oy = c.height-1-window.rect.y-y
                        for channel in 0..<4 {
                            let value = Float(try read(ax,ay,channel)*(1-u)*(1-v) + read(bx,ay,channel)*u*(1-v) + read(ax,by,channel)*(1-u)*v + read(bx,by,channel)*u*v)
                            guard value.isFinite else { throw Failure.value }
                            to.storeBytes(of: value, toByteOffset: (oy-Int(region.minY))*output.bytesPerRow + (ox-Int(region.minX))*16 + channel*4, as: Float.self)
                        }
                    }
                }
            }
        }
    }
}
