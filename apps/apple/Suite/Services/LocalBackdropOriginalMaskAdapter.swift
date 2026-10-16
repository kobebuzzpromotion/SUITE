import Foundation
import CryptoKit
import ImageIO
import UniformTypeIdentifiers
import SuiteCore

/// Explicit original-resolution PNG only. Not a RAW decoder, a proxy upscaler,
/// or a tiled huge-image segmentation implementation. Host must attest that the
/// supplied PNG is upright, uncropped, full-resolution data of the bound original.
actor LocalBackdropOriginalMaskAdapter {
    struct Binding: Sendable, Equatable {
        let assetID: UUID
        let originalSHA256: String
        let inputPNGSHA256: String
        let width: Int
        let height: Int
        let generation: UUID
    }
    struct Result: Sendable {
        let binding: Binding
        let mask: LocalBackdropRecipe.MaskReference
        let detectedPeople: Int
        // The host must require explicit boundary/old-shadow confirmation before
        // attaching this reference to a Recipe; inference is not quality approval.
        let boundaryConfirmed = false
    }
    enum Failure: Error { case input, staleOrUnauthorized, unsupportedSize }
    private let vision = LocalBackdropPersonMaskAdapter()

    func generate(sourcePNG: Data, binding: Binding, store: LocalBackdropRecipeStore,
                  authorize: @Sendable (Binding) async throws -> Bool) async throws -> Result {
        try Task.checkCancellation()
        let validSHA: (String) -> Bool = { value in
            value.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
        }
        guard validSHA(binding.originalSHA256), validSHA(binding.inputPNGSHA256),
              !sourcePNG.isEmpty, sourcePNG.count <= 32 * 1024 * 1024 else { throw Failure.input }
        guard (1...32768).contains(binding.width), (1...32768).contains(binding.height),
              binding.width * binding.height <= 8_000_000 else { throw Failure.unsupportedSize }
        // PNG digest is distinct from original-camera-file digest. Equality is
        // neither assumed nor invented; provenance comes from current host state.
        guard SHA256.hash(data: sourcePNG).map({ String(format: "%02x", $0) }).joined() == binding.inputPNGSHA256,
              let source = CGImageSourceCreateWithData(sourcePNG as CFData,
                  [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1,
              CGImageSourceGetType(source) as String? == UTType.png.identifier,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              properties[kCGImagePropertyPixelWidth] as? Int == binding.width,
              properties[kCGImagePropertyPixelHeight] as? Int == binding.height,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1 else { throw Failure.input }
        guard try await authorize(binding) else { throw Failure.staleOrUnauthorized }
        try Task.checkCancellation()
        // Reuses the bounded worker, including thermal/RAM admission. No decode
        // at all is attempted for larger dimensions, and no hidden resizing occurs.
        let generated = try await vision.generate(sourcePNG: sourcePNG)
        try Task.checkCancellation()
        guard generated.width == binding.width, generated.height == binding.height,
              generated.l8.count == binding.width * binding.height,
              try await authorize(binding) else { throw Failure.staleOrUnauthorized }
        try Task.checkCancellation()
        let digest = try await store.install(mask: generated.l8)
        try Task.checkCancellation()
        guard try await authorize(binding) else { throw Failure.staleOrUnauthorized }
        try Task.checkCancellation()
        // A cancellation after install may leave an immutable unreferenced object;
        // it never modifies the active Recipe or deletes shared mask assets.
        return Result(binding: binding,
            mask: try .init(sha256: digest, width: binding.width, height: binding.height,
                            byteCount: generated.l8.count), detectedPeople: generated.people)
    }
}
