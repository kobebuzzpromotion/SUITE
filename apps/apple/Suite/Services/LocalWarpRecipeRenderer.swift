import Foundation
import CoreImage
import CryptoKit
import SuiteCore

/// Actor-local, full-frame renderer for a saved manual warp. The host supplies
/// the upright, uncropped same-photo source exactly once, before global/crop.
/// CIImage has no EXIF identity: orientation and original provenance are caller
/// responsibilities. No shrinking, automatic body inference or mask remapping.
struct LocalWarpRecipeRenderer {
    enum RenderError: Error { case binding, invalidFrame, resourceLimit, subpixelRadius }
    let context: CIContext

    func apply(_ recipe: LocalWarpRecipe, to image: CIImage,
               assetID: UUID, originalSHA256: String, bodyMaskBytes: Data? = nil) throws -> CIImage {
        try checkResources()
        try recipe.validate()
        guard recipe.assetID == assetID,
              recipe.originalSHA256 == originalSHA256.lowercased() else { throw RenderError.binding }
        let extent = image.extent
        guard extent.origin == .zero, extent.width.isFinite, extent.height.isFinite,
              extent.width > 0, extent.height > 0,
              extent.width.rounded() == extent.width, extent.height.rounded() == extent.height,
              extent.width <= 32768, extent.height <= 32768,
              extent.width * extent.height <= 8_000_000,
              // Includes field construction/snapshots, masks, Float source and
              // destination, bitmap copy and CI backing allowance; no unbounded
              // CoreImage cache guarantee. Oversized Final is explicitly refused.
              Double(extent.width * extent.height) * 192
                < Double(ProcessInfo.processInfo.physicalMemory) / 3 else { throw RenderError.resourceLimit }
        let width = Int(extent.width), height = Int(extent.height)
        // Resolution may change, not crop/aspect. Reference proxy dimensions can
        // differ by one rounding pixel from the upright original aspect.
        guard abs(Double(width) / Double(height) - recipe.referenceAspect)
                <= 1 / Double(recipe.referenceHeight) + 1 / Double(height) else { throw RenderError.invalidFrame }
        let operations = try recipe.operations.map { operation in
            try checkResources()
            guard operation.rx * Double(width) >= 1,
                  operation.ry * Double(height) >= 1 else { throw RenderError.subpixelRadius }
            return try operation.runtimeOperation()
        }
        var protection: Data?
        if let rectangle = recipe.protectionRectangle {
            // Positive-area overlap is a hard lock, not rounded L8 coverage:
            // even a subpixel intersection protects the entire touched pixel.
            let left = rectangle.x * Double(width)
            let top = rectangle.y * Double(height)
            let right = (rectangle.x + rectangle.width) * Double(width)
            let bottom = (rectangle.y + rectangle.height) * Double(height)
            var bytes = [UInt8](repeating: 0, count: width * height)
            for y in 0..<height {
                try checkResources()
                guard min(Double(y + 1), bottom) > max(Double(y), top) else { continue }
                for x in 0..<width where min(Double(x + 1), right) > max(Double(x), left) {
                    bytes[y * width + x] = 255
                }
            }
            protection = Data(bytes)
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        let digest = SHA256.hash(data: try encoder.encode(recipe)).map { String(format: "%02x", $0) }.joined()
        let revision = "\(recipe.engineVersion):\(width)x\(height):\(digest)"
        if recipe.bodyMask != nil || bodyMaskBytes != nil {
            let evaluator = try LocalWarpWindowEvaluator(recipe: recipe, width: width, height: height,
                geometryRevision: revision)
            try LocalWarpBodyMaskGuard.validate(recipe, bytes: bodyMaskBytes, certificate: evaluator.certify())
        }
        let map = try LocalWarpFieldBuilder.build(photoID: assetID, originalSHA256: originalSHA256,
            geometryRevision: revision, width: width, height: height,
            operations: operations, protectionTopLeftL8: protection)
        try checkResources()
        // Builder returns the certified actual field AFTER protection. Sampling
        // uses that exact map; never independently replays a requested field.
        let result = try LocalWarpImageRenderer(context: context).apply(.init(image: image, space: .source,
            assetID: assetID, originalSHA256: originalSHA256, geometryRevision: revision), map: map)
        try checkResources()
        return result.image
    }

    private func checkResources() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw RenderError.resourceLimit
        default: break
        }
    }
}
