import Foundation
import CoreImage
import CryptoKit
import SuiteCore

/// Prepared immutable bytes cross actor boundaries, never CIImage.
struct LocalBackdropRecipeRenderer {
    enum Purpose: Sendable { case preview, final }
    struct Resources: Sendable {
        let purpose: Purpose
        let recipe: LocalBackdropRecipe
        let mask: Data
        let background: Data
        let manifest: LocalBackdropAssetStore.Manifest
    }
    let context: CIContext
    static func prepare(_ recipe: LocalBackdropRecipe, root: URL, purpose: Purpose) async throws -> Resources {
        try recipe.validate()
        let masks = try LocalBackdropRecipeStore(root: root)
        let backdrops = try LocalBackdropAssetStore(root: root.appendingPathComponent("LocalBackdrops"))
        let catalog = try await backdrops.catalog()
        let b = recipe.background
        guard let manifest = catalog.manifests.first(where: {
            $0.assetID == b.assetID && $0.version == b.version && $0.expectedSHA256 == b.sha256 &&
            $0.expectedByteCount == b.byteCount && $0.width == b.width && $0.height == b.height
        }) else { throw LocalBackdropCompositeRenderer.Failure.binding }
        let background = try await backdrops.bytesForUse(manifest: manifest)
        let ref = purpose == .final ? recipe.finalMask : nil
        let mask = try await masks.bytes(sha256: ref?.sha256 ?? recipe.maskSHA256,
                                        expectedCount: ref?.byteCount ?? recipe.maskByteCount)
        try Task.checkCancellation()
        return Resources(purpose: purpose, recipe: recipe, mask: mask, background: background, manifest: manifest)
    }
    func apply(_ resources: Resources, to image: CIImage, assetID: UUID, originalSHA256: String) throws -> CIImage {
        let recipe = resources.recipe
        try Task.checkCancellation(); try recipe.validate()
        let extent = image.extent
        guard extent.origin == .zero, extent.width.isFinite, extent.height.isFinite,
              extent.width > 0, extent.height > 0, extent.width <= 32768, extent.height <= 32768,
              extent.width.rounded() == extent.width, extent.height.rounded() == extent.height else {
            throw LocalBackdropCompositeRenderer.Failure.invalidInput
        }
        let ref = resources.purpose == .final ? recipe.finalMask : nil
        let width = ref?.width ?? recipe.maskWidth, height = ref?.height ?? recipe.maskHeight
        guard Int(extent.width) == width, Int(extent.height) == height else { throw LocalBackdropCompositeRenderer.Failure.invalidInput }
        guard recipe.assetID == assetID, recipe.originalSHA256 == originalSHA256.lowercased() else {
            throw LocalBackdropCompositeRenderer.Failure.binding
        }
        let b = recipe.background, m = resources.manifest
        guard m.assetID == b.assetID, m.version == b.version, m.expectedSHA256 == b.sha256,
              m.expectedByteCount == b.byteCount, m.width == b.width, m.height == b.height,
              resources.mask.count == (ref?.byteCount ?? recipe.maskByteCount),
              SHA256.hash(data: resources.mask).map({ String(format: "%02x", $0) }).joined() == (ref?.sha256 ?? recipe.maskSHA256) else {
            throw LocalBackdropCompositeRenderer.Failure.binding
        }
        let shadow: LocalBackdropLighting.Shadow
        switch recipe.shadow {
        case .none: shadow = .none
        case .addDrop(let x, let y, let blur, let opacity):
            let sx = Double(width) / Double(recipe.maskWidth), sy = Double(height) / Double(recipe.maskHeight)
            guard blur == 0 || abs(sx - sy) <= 0.000001 else { throw LocalBackdropCompositeRenderer.Failure.invalidInput }
            shadow = .addDrop(offsetX: x * sx, offsetY: y * sy, blurRadius: blur * sx, opacity: opacity)
        }
        let p = recipe.placement
        return try LocalBackdropCompositeRenderer(context: context).apply(to: image, assetID: assetID,
            originalSHA256: originalSHA256,
            matte: .init(assetID: assetID, originalSHA256: originalSHA256, width: width,
                height: height, rows: .topLeft, l8: resources.mask),
            backgroundBytes: resources.background, backgroundManifest: resources.manifest,
            canvasWidth: width, canvasHeight: height,
            placement: .init(x: p.x, y: p.y, width: p.width, height: p.height),
            lighting: try .init(backgroundEV: recipe.backgroundEV, shadow: shadow))
    }
}
