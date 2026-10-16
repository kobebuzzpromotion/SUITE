import Foundation
import SuiteCore

/// Reprojects an explicitly supplied immutable mask using the SAME inverse map
/// as the image/brush path. Does not generate a body shape or freeze the warp.
actor LocalWarpMaskAdapter {
    enum RowOrder: String, Sendable { case topLeft, bottomUp }
    enum Space: String, Sendable { case source, warped }
    enum AdapterError: Error { case invalidMask, invalidMapping, resourceLimit }
    struct Mask: Sendable {
        let assetID: UUID
        let originalSHA256: String
        /// Exact coordinate-map revision; caller must not reuse stale masks.
        let geometryRevision: String
        let inputWidth: Int
        let inputHeight: Int
        let width: Int
        let height: Int
        let rowOrder: RowOrder
        /// A warped result cannot be fed back through the same mapping. Rebinding
        /// to another source frame requires explicit caller reconstruction/proof.
        let space: Space
        /// Tightly packed L8. Mask purpose remains the caller's responsibility:
        /// a protection mask is not an instruction to regenerate/freeze a field.
        let bytes: Data
    }
    struct Result: Sendable {
        let mask: Mask
        let mappingDirection: String
    }

    func warp(_ source: Mask, using map: LocalWarpCoordinateMap,
              outputRowOrder: RowOrder) throws -> Result {
        try resources()
        guard source.space == .source else { throw AdapterError.invalidMask }
        guard source.width > 0, source.height > 0,
              source.width <= 32768, source.height <= 32768,
              source.width * source.height <= 8_000_000,
              source.bytes.count == source.width * source.height,
              map.width > 0, map.height > 0, map.width * map.height <= 8_000_000,
              Double(source.bytes.count) * 8
                + Double(map.width * map.height) * 8 < Double(ProcessInfo.processInfo.physicalMemory) / 3 else {
            throw AdapterError.resourceLimit
        }
        try map.validateBinding(assetID: source.assetID, originalSHA256: source.originalSHA256,
            geometryRevision: source.geometryRevision, inputWidth: source.inputWidth, inputHeight: source.inputHeight)
        // Same input-space mask must have the declared input dimensions. The map
        // grid can differ; normalized pixel-center sampling handles that scaling.
        guard source.width == source.inputWidth, source.height == source.inputHeight else {
            throw AdapterError.invalidMask
        }
        let snapshot = [UInt8](source.bytes)
        // Preserve mask resolution, not the possibly smaller field-grid size.
        let outputWidth = source.width, outputHeight = source.height
        var output = Data(count: outputWidth * outputHeight)
        func sample(_ x: Int, _ y: Int) -> Double {
            let row = source.rowOrder == .topLeft ? y : source.height - 1 - y
            return Double(snapshot[row * source.width + x])
        }
        for y in 0..<outputHeight {
            try resources()
            let row = outputRowOrder == .topLeft ? y : outputHeight - 1 - y
            for x in 0..<outputWidth {
                let p = try map.outputToSource(.init(x: (Double(x) + 0.5) / Double(outputWidth),
                                                     y: (Double(y) + 0.5) / Double(outputHeight)))
                guard p.x.isFinite, p.y.isFinite, (0...1).contains(p.x), (0...1).contains(p.y) else {
                    throw AdapterError.invalidMapping
                }
                // Convert normalized centers back to raster coordinates; clamp
                // only sampling at the outer half-pixel strip, matching Web.
                let sx = max(0, min(Double(source.width - 1), p.x * Double(source.width) - 0.5))
                let sy = max(0, min(Double(source.height - 1), p.y * Double(source.height) - 0.5))
                let ax = Int(floor(sx)), ay = Int(floor(sy))
                let bx = min(source.width - 1, ax + 1), by = min(source.height - 1, ay + 1)
                let u = sx - Double(ax), v = sy - Double(ay)
                let value = sample(ax, ay) * (1-u) * (1-v) + sample(bx, ay) * u * (1-v)
                    + sample(ax, by) * (1-u) * v + sample(bx, by) * u * v
                output[row * outputWidth + x] = UInt8(max(0, min(255, value.rounded())))
            }
        }
        try resources()
        return Result(mask: Mask(assetID: source.assetID, originalSHA256: source.originalSHA256,
            geometryRevision: source.geometryRevision, inputWidth: source.inputWidth,
            inputHeight: source.inputHeight, width: outputWidth, height: outputHeight,
            rowOrder: outputRowOrder, space: .warped, bytes: output), mappingDirection: "output-to-source-pixel-center-bilinear-v1")
    }

    private func resources() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw AdapterError.resourceLimit
        default: break
        }
    }
}
