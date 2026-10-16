import Foundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import SuiteCore

/// Actor-owned Vision/CoreImage preparation of a candidate face-brightness plan.
/// Does not fetch originals, save Recipes, apply them to the editor or infer consent.
actor LocalPersonCorrectionService {
    enum CorrectionError: Error { case invalidReference, inconsistentAnalysis, resourcesUnavailable }
    private let context = CIContext(options: [.cacheIntermediates: false])

    func makePlan(referencePNG: Data, prepared: LocalFacePixels.Prepared,
                  analysis: LocalFaceAnalysisService.Analysis, asset: AssetRecord,
                  assignments: PhotoPersonAssignments, analysisVersion: String,
                  intents: [PersonFaceBrightnessPlan.Intent], policy: FaceRegionAssociation.Policy,
                  consentedPersonIDs: Set<FaceIdentity.PersonID>,
                  currentPortrait: PortraitRecipe? = nil) throws -> PersonFaceBrightnessPlan.Plan {
        try Task.checkCancellation()
        try asset.validate()
        try resources()
        guard !referencePNG.isEmpty, referencePNG.count <= 32 * 1024 * 1024,
              prepared.assetID == asset.id, prepared.originalSHA256 == asset.sha256.lowercased(),
              analysis.assetID == asset.id, analysis.originalSHA256 == prepared.originalSHA256,
              analysis.analysisSHA256 == prepared.analysisSHA256,
              analysis.analysisVersion == analysisVersion,
              analysis.analysisWidth == prepared.width, analysis.analysisHeight == prepared.height,
              analysis.inputWidth == prepared.inputWidth, analysis.inputHeight == prepared.inputHeight,
              prepared.inputWidth > 0, prepared.inputHeight > 0,
              prepared.inputWidth <= 1600, prepared.inputHeight <= 1600,
              Double(prepared.inputWidth) * Double(prepared.inputHeight) * 64
                < Double(ProcessInfo.processInfo.physicalMemory) / 3,
              let source = CGImageSourceCreateWithData(referencePNG as CFData,
                  [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source), (type as String) == UTType.png.identifier,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int,
              width == prepared.inputWidth, height == prepared.inputHeight,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1,
              let image = CGImageSourceCreateImageAtIndex(source, 0,
                  [kCGImageSourceShouldCacheImmediately: true] as CFDictionary),
              image.width == width, image.height == height else {
            throw CorrectionError.invalidReference
        }
        // Recreate exactly the preparation contract, rather than trusting a PNG
        // selected later or associating two images solely by an asset UUID.
        let measured = try LocalFacePixels.prepare(uprightUnmirrored: image,
            assetID: asset.id, originalSHA256: asset.sha256)
        guard measured.analysisSHA256 == prepared.analysisSHA256,
              measured.bgr == prepared.bgr, measured.width == prepared.width,
              measured.height == prepared.height, measured.stride == prepared.stride,
              measured.preprocessingVersion == prepared.preprocessingVersion,
              analysis.faces.count <= 512,
              Set(analysis.faces.map { $0.target.faceTargetID }).count == analysis.faces.count else {
            throw CorrectionError.inconsistentAnalysis
        }
        let detections = try analysis.faces.map { face -> FaceRegionAssociation.Detection in
            try Task.checkCancellation()
            try face.embedding.validate()
            guard face.target.assetID == asset.id,
                  face.target.originalSHA256 == prepared.originalSHA256,
                  face.embedding.modelSHA256 == PinnedFaceModels.sFaceSHA256,
                  face.embedding.preprocessingVersion == PinnedFaceModels.recognizerPreprocessingVersion,
                  face.embedding.dimension == 128,
                  face.analysisGeometry.count == 15, face.inputGeometry.count == 15,
                  face.analysisGeometry.allSatisfy(\.isFinite), face.inputGeometry.allSatisfy(\.isFinite) else {
                throw CorrectionError.inconsistentAnalysis
            }
            for index in 0..<14 {
                let scale = index.isMultiple(of: 2)
                    ? measured.inputPixelsPerAnalysisPixelX : measured.inputPixelsPerAnalysisPixelY
                guard Double(face.analysisGeometry[index]) * scale == face.inputGeometry[index] else {
                    throw CorrectionError.inconsistentAnalysis
                }
            }
            guard Double(face.analysisGeometry[14]) == face.inputGeometry[14] else {
                throw CorrectionError.inconsistentAnalysis
            }
            return .init(faceTargetID: face.target.faceTargetID, x: face.inputGeometry[0],
                         y: face.inputGeometry[1], width: face.inputGeometry[2], height: face.inputGeometry[3])
        }
        try assignments.validate(assetID: asset.id, originalSHA256: asset.sha256,
            analysisVersion: analysisVersion, analysisSHA256: measured.analysisSHA256,
            targets: analysis.faces.map(\.target))
        try resources()
        let portraitPipeline = PortraitPipeline(context: context)
        let ciImage = CIImage(cgImage: image)
        let portrait: PortraitRecipe
        if let currentPortrait {
            try currentPortrait.validate(asset: asset)
            // Reuse exact IDs/anchors only after real Vision face/person-mask
            // revalidation on the very same upright input. Returned graph is not
            // exported or saved; existing EV values are not applied to analysis.
            _ = try portraitPipeline.apply(currentPortrait, to: ciImage)
            portrait = currentPortrait
        } else {
            portrait = try portraitPipeline.analyze(image: ciImage, asset: asset)
        }
        try Task.checkCancellation()
        let frame = FaceRegionAssociation.Frame(assetID: asset.id, originalSHA256: asset.sha256,
            uprightWidth: measured.inputWidth, uprightHeight: measured.inputHeight,
            geometryRevision: "local-upright-" + measured.analysisSHA256,
            orientation: .uprightUnmirrored)
        let plan = try PersonFaceBrightnessPlan.make(intents: intents, assignments: assignments,
            analysisVersion: analysisVersion, analysisSHA256: measured.analysisSHA256,
            targets: analysis.faces.map(\.target), detections: detections,
            detectionFrame: frame, portraitFrame: frame, currentPortrait: portrait,
            associationPolicy: policy, consentedPersonIDs: consentedPersonIDs)
        try resources()
        try Task.checkCancellation()
        return plan
    }

    private func resources() throws {
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw CorrectionError.resourcesUnavailable
        default: break
        }
    }
}
