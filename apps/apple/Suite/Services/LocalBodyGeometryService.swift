import Foundation
import Vision
import ImageIO
import UniformTypeIdentifiers
import SuiteCore

/// Actual Vision 2D joints, not a body mesh, skin segmentation or person identity.
/// Coordinates match warp/retouch: upright unmirrored TOP-LEFT normalized.
/// Original provenance is host-attested; PNG is rechecked against prepared BGR.
actor LocalBodyGeometryService {
    enum Failure: Error { case input, resources, invalidResult }
    struct Joint: Sendable { let name: String; let x, y: Double; let confidence: Float }
    struct Body: Identifiable, Sendable { let id: UUID; let joints: [Joint] }
    struct Result: Sendable {
        let id: UUID
        let assetID: UUID
        let originalSHA256, analysisSHA256, analysisVersion: String
        let width, height: Int
        let bodies: [Body]
    }
    /// Applies the SAME engine-v1 applied-field construction to measured joints.
    /// This is an inverse coordinate solve, not outputToSource misused forwards.
    /// Only bounded editor-preview dimensions; not a surface mesh or Final map.
    func transformedJoints(_ geometry: Result, bodyID: UUID, recipe: LocalWarpRecipe) throws -> [Joint] {
        try check(); try recipe.validate()
        guard recipe.assetID == geometry.assetID, recipe.originalSHA256 == geometry.originalSHA256,
              let body = geometry.bodies.first(where: { $0.id == bodyID }),
              abs(Double(geometry.width)/Double(geometry.height)-recipe.referenceAspect)
                <= 1/Double(recipe.referenceHeight)+1/Double(geometry.height) else { throw Failure.input }
        let w = geometry.width, h = geometry.height
        var protection: Data?
        if let p = recipe.protectionRectangle {
            var bytes = [UInt8](repeating: 0, count: w*h)
            for y in 0..<h {
                try check()
                for x in 0..<w where
                    min(Double(x+1),(p.x+p.width)*Double(w)) > max(Double(x),p.x*Double(w)) &&
                    min(Double(y+1),(p.y+p.height)*Double(h)) > max(Double(y),p.y*Double(h)) { bytes[y*w+x] = 255 }
            }
            protection = Data(bytes)
        }
        let map = try LocalWarpFieldBuilder.build(photoID: geometry.assetID, originalSHA256: geometry.originalSHA256,
            geometryRevision: geometry.analysisVersion, width: w, height: h,
            operations: recipe.operations.map { try $0.runtimeOperation() }, protectionTopLeftL8: protection)
        return try body.joints.map { joint in
            try check()
            let point = try map.sourceToOutput(.init(x: joint.x, y: joint.y))
            return Joint(name: joint.name, x: point.x, y: point.y, confidence: joint.confidence)
        }
    }
    func analyze(referencePNG: Data, prepared: LocalFacePixels.Prepared) throws -> Result {
        try check()
        guard (1...1600).contains(prepared.inputWidth), (1...1600).contains(prepared.inputHeight),
              Double(prepared.inputWidth * prepared.inputHeight) * 224 < Double(ProcessInfo.processInfo.physicalMemory) / 3,
              !referencePNG.isEmpty, referencePNG.count <= 32 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(referencePNG as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source), type as String == UTType.png.identifier,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              properties[kCGImagePropertyPixelWidth] as? Int == prepared.inputWidth,
              properties[kCGImagePropertyPixelHeight] as? Int == prepared.inputHeight,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1,
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw Failure.input }
        let measured = try LocalFacePixels.prepare(uprightUnmirrored: image,
            assetID: prepared.assetID, originalSHA256: prepared.originalSHA256)
        guard measured.bgr == prepared.bgr, measured.analysisSHA256 == prepared.analysisSHA256,
              measured.width == prepared.width, measured.height == prepared.height,
              measured.stride == prepared.stride, measured.preprocessingVersion == prepared.preprocessingVersion else { throw Failure.input }
        let request = VNDetectHumanBodyPoseRequest()
        request.revision = VNDetectHumanBodyPoseRequestRevision1
        try check()
        try VNImageRequestHandler(cgImage: image, orientation: .up).perform([request])
        try check()
        let observations = request.results ?? []
        guard observations.count <= 64 else { throw Failure.resources }
        let bodies = try observations.map { observation -> Body in
            try check()
            let points = try observation.recognizedPoints(.all)
            guard points.count <= 128 else { throw Failure.resources }
            let joints = try points.map { name, point -> Joint in
                guard point.location.x.isFinite, point.location.y.isFinite, point.confidence.isFinite,
                      (0...1).contains(point.location.x), (0...1).contains(point.location.y),
                      (0...1).contains(point.confidence) else { throw Failure.invalidResult }
                return Joint(name: name.rawValue.rawValue, x: Double(point.location.x),
                    y: 1-Double(point.location.y), confidence: point.confidence)
            }.sorted { $0.name < $1.name }
            return Body(id: UUID(), joints: joints)
        }
        return Result(id: UUID(), assetID: prepared.assetID, originalSHA256: prepared.originalSHA256,
            analysisSHA256: prepared.analysisSHA256, analysisVersion: "apple-vision-body-pose-revision1-top-left-v1",
            width: prepared.inputWidth, height: prepared.inputHeight, bodies: bodies)
    }
    private func check() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw Failure.resources
        default: break
        }
    }
}
