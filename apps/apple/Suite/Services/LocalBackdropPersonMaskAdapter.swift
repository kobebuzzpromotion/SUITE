import Foundation
import Vision
import ImageIO
import CoreVideo
import UniformTypeIdentifiers

/// Same Vision revision/scaled-mask path as PortraitPipeline, but explicitly
/// includes ALL detected person instances; no face-dependent person selection.
actor LocalBackdropPersonMaskAdapter {
    struct Result: Sendable { let l8: Data; let width: Int; let height: Int; let people: Int }
    enum Failure: Error { case unavailable, input, resources, mask }
    func generate(sourcePNG: Data) throws -> Result {
        try Task.checkCancellation()
        guard #available(iOS 17, macOS 14, *) else { throw Failure.unavailable }
        guard !sourcePNG.isEmpty, sourcePNG.count <= 32 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(sourcePNG as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1,
              CGImageSourceGetType(source) as String? == UTType.png.identifier,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              (1...32768).contains(width), (1...32768).contains(height), width * height <= 8_000_000,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1 else { throw Failure.input }
        guard UInt64(width * height) * 128 < ProcessInfo.processInfo.physicalMemory / 3,
              ![ProcessInfo.ThermalState.serious, .critical].contains(ProcessInfo.processInfo.thermalState),
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw Failure.resources }
        let handler = VNImageRequestHandler(cgImage: image, orientation: .up, options: [:])
        let request = VNGeneratePersonInstanceMaskRequest()
        request.revision = VNGeneratePersonInstanceMaskRequestRevision1
        try handler.perform([request]); try Task.checkCancellation()
        guard let observations = request.results, observations.count == 1,
              let observation = observations.first, !observation.allInstances.isEmpty,
              observation.allInstances.count <= 64 else { throw Failure.mask }
        let buffer = try observation.generateScaledMaskForImage(forInstances: observation.allInstances, from: handler)
        try Task.checkCancellation()
        guard CVPixelBufferGetWidth(buffer) == width, CVPixelBufferGetHeight(buffer) == height else { throw Failure.mask }
        let format = CVPixelBufferGetPixelFormatType(buffer)
        guard format == kCVPixelFormatType_OneComponent8 || format == kCVPixelFormatType_OneComponent32Float,
              CVPixelBufferLockBaseAddress(buffer, .readOnly) == kCVReturnSuccess else { throw Failure.mask }
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { throw Failure.mask }
        let stride = CVPixelBufferGetBytesPerRow(buffer)
        guard stride >= width * (format == kCVPixelFormatType_OneComponent8 ? 1 : 4) else { throw Failure.mask }
        var bytes = [UInt8](repeating: 0, count: width * height)
        // Vision's image-aligned CVPixelBuffer rows are top-to-bottom. Read the
        // actual row stride; do not apply CoreImage bottom-up inversion here.
        for y in 0..<height {
            try Task.checkCancellation()
            for x in 0..<width {
                if format == kCVPixelFormatType_OneComponent8 {
                    bytes[y * width + x] = base.load(fromByteOffset: y * stride + x, as: UInt8.self)
                } else {
                    let value = base.load(fromByteOffset: y * stride + x * 4, as: Float.self)
                    guard value.isFinite, (0...1).contains(value) else { throw Failure.mask }
                    bytes[y * width + x] = UInt8((value * 255).rounded())
                }
            }
        }
        guard bytes.contains(where: { $0 > 0 }) else { throw Failure.mask }
        return Result(l8: Data(bytes), width: width, height: height, people: observation.allInstances.count)
    }
}
