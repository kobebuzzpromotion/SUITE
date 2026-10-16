import Foundation
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import SuiteCore

/// Photo-local detail bridge. No Recipe changes, identity inference or disk writes.
actor LocalDetailedPortraitAnalysis {
    enum AnalysisError: Error { case invalidReference, inconsistentAnalysis, resourceLimit }
    struct Point: Sendable { let x: Double; let y: Double }
    struct Region: Sendable { let name: String; let points: [Point] }
    struct Mask: Sendable {
        let instanceID: Int
        let width: Int
        let height: Int
        var rowBytes: Int { width }
        var format: String { "luminance8-bottom-up-input-upright-v1" }
        /// One byte/pixel, tightly packed, rows from BOTTOM to TOP in upright
        /// input space. 0 excludes, 255 includes. Not an original-resolution mask.
        let bottomUpLuminance8: Data
    }
    struct Face: Sendable {
        let target: FaceIdentity.PhotoFaceID
        /// Points are normalized to the upright INPUT image, bottom-left origin.
        let regions: [Region]
        let personInstanceID: Int
    }
    struct Result: Sendable {
        let assetID: UUID
        let originalSHA256: String
        let analysisSHA256: String
        let analysisVersion: String
        let frame: FaceRegionAssociation.Frame
        let topologyID: String
        let visionRequestRevision: Int
        let faces: [Face]
        let masks: [Mask]
        /// Includes unknown/ambiguous matches; these never receive another face's details.
        let associations: [FaceRegionAssociation.Match]
    }
    private let context = CIContext(options: [.cacheIntermediates: false])

    func analyze(referencePNG: Data, prepared: LocalFacePixels.Prepared,
                 analysis: LocalFaceAnalysisService.Analysis, asset: AssetRecord,
                 analysisVersion: String, policy: FaceRegionAssociation.Policy,
                 maximumMaskBytes: Int = 32 * 1024 * 1024) throws -> Result {
        try resources(); try asset.validate()
        guard maximumMaskBytes > 0, maximumMaskBytes <= 64 * 1024 * 1024,
              !referencePNG.isEmpty, referencePNG.count <= 32 * 1024 * 1024,
              prepared.assetID == asset.id, prepared.originalSHA256 == asset.sha256.lowercased(),
              analysis.assetID == asset.id, analysis.originalSHA256 == prepared.originalSHA256,
              analysis.analysisSHA256 == prepared.analysisSHA256,
              analysis.analysisVersion == analysisVersion, !analysisVersion.isEmpty,
              analysis.analysisWidth == prepared.width, analysis.analysisHeight == prepared.height,
              analysis.inputWidth == prepared.inputWidth, analysis.inputHeight == prepared.inputHeight,
              prepared.inputWidth > 0, prepared.inputHeight > 0,
              prepared.inputWidth <= 1600, prepared.inputHeight <= 1600,
              Double(prepared.inputWidth) * Double(prepared.inputHeight) * 64 < Double(ProcessInfo.processInfo.physicalMemory) / 3,
              let source = CGImageSourceCreateWithData(referencePNG as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1,
              let type = CGImageSourceGetType(source), (type as String) == UTType.png.identifier,
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              properties[kCGImagePropertyPixelWidth] as? Int == prepared.inputWidth,
              properties[kCGImagePropertyPixelHeight] as? Int == prepared.inputHeight,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1,
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
              image.width == prepared.inputWidth, image.height == prepared.inputHeight else { throw AnalysisError.invalidReference }
        let measured = try LocalFacePixels.prepare(uprightUnmirrored: image, assetID: asset.id, originalSHA256: asset.sha256)
        guard measured.analysisSHA256 == prepared.analysisSHA256, measured.bgr == prepared.bgr,
              measured.width == prepared.width, measured.height == prepared.height,
              measured.stride == prepared.stride, measured.preprocessingVersion == prepared.preprocessingVersion,
              analysis.faces.count <= 512,
              Set(analysis.faces.map { $0.target.faceTargetID }).count == analysis.faces.count else { throw AnalysisError.inconsistentAnalysis }
        let detections = try analysis.faces.map { face -> FaceRegionAssociation.Detection in
            try resources(); try face.embedding.validate()
            guard face.target.assetID == asset.id, face.target.originalSHA256 == prepared.originalSHA256,
                  face.embedding.modelSHA256 == PinnedFaceModels.sFaceSHA256,
                  face.embedding.preprocessingVersion == PinnedFaceModels.recognizerPreprocessingVersion,
                  face.embedding.dimension == 128, face.analysisGeometry.count == 15,
                  face.inputGeometry.count == 15, face.analysisGeometry.allSatisfy(\.isFinite),
                  face.inputGeometry.allSatisfy(\.isFinite) else { throw AnalysisError.inconsistentAnalysis }
            for index in 0..<14 {
                let scale = index.isMultiple(of: 2) ? measured.inputPixelsPerAnalysisPixelX : measured.inputPixelsPerAnalysisPixelY
                guard Double(face.analysisGeometry[index]) * scale == face.inputGeometry[index] else { throw AnalysisError.inconsistentAnalysis }
            }
            guard Double(face.analysisGeometry[14]) == face.inputGeometry[14] else { throw AnalysisError.inconsistentAnalysis }
            return .init(faceTargetID: face.target.faceTargetID, x: face.inputGeometry[0], y: face.inputGeometry[1],
                         width: face.inputGeometry[2], height: face.inputGeometry[3])
        }
        try resources()
        let details = try PortraitPipeline(context: context).detailedAnalysis(image: CIImage(cgImage: image), asset: asset)
        guard details.faces.count <= 64, details.extent == CGRect(x: 0, y: 0, width: image.width, height: image.height),
              !details.topologyID.isEmpty,
              Set(details.faces.map(\.personInstanceID)).count == details.faces.count else { throw AnalysisError.inconsistentAnalysis }
        let frame = FaceRegionAssociation.Frame(assetID: asset.id, originalSHA256: asset.sha256,
            uprightWidth: image.width, uprightHeight: image.height,
            geometryRevision: "local-upright-" + measured.analysisSHA256, orientation: .uprightUnmirrored)
        let ids = details.faces.map { _ in UUID() }
        let matches = try FaceRegionAssociation.associate(detections: detections, detectionFrame: frame,
            regions: zip(ids, details.faces).map { .init(id: $0.0, anchor: $0.1.anchor) }, regionFrame: frame, policy: policy)
        var faces: [Face] = []; var masks: [Mask] = []; var usedInstances = Set<Int>()
        let bytesPerMask = image.width * image.height
        for match in matches {
            try resources()
            guard case let .matched(id) = match.decision,
                  let index = ids.firstIndex(of: id),
                  let target = analysis.faces.first(where: { $0.target.faceTargetID == match.faceTargetID })?.target else { continue }
            let detail = details.faces[index]
            guard detail.regions.count <= 32, detail.personInstanceID > 0,
                  detail.personMask.extent.contains(details.extent) else { throw AnalysisError.resourceLimit }
            let regions = try detail.regions.map { region -> Region in
                guard region.points.count <= 512, region.points.allSatisfy({ $0.x.isFinite && $0.y.isFinite && (0...1).contains($0.x) && (0...1).contains($0.y) }) else { throw AnalysisError.inconsistentAnalysis }
                return Region(name: region.name, points: region.points.map { Point(x: Double($0.x), y: Double($0.y)) })
            }
            if usedInstances.insert(detail.personInstanceID).inserted {
                guard masks.count < maximumMaskBytes / bytesPerMask else { throw AnalysisError.resourceLimit }
                var bytes = Data(count: bytesPerMask)
                bytes.withUnsafeMutableBytes { buffer in
                    context.render(detail.personMask, toBitmap: buffer.baseAddress!, rowBytes: image.width,
                                   bounds: details.extent, format: .L8, colorSpace: CGColorSpaceCreateDeviceGray())
                }
                masks.append(Mask(instanceID: detail.personInstanceID, width: image.width, height: image.height, bottomUpLuminance8: bytes))
            }
            faces.append(Face(target: target, regions: regions, personInstanceID: detail.personInstanceID))
        }
        try resources()
        return Result(assetID: asset.id, originalSHA256: prepared.originalSHA256,
            analysisSHA256: measured.analysisSHA256, analysisVersion: analysisVersion, frame: frame,
            topologyID: details.topologyID, visionRequestRevision: details.requestRevision,
            faces: faces, masks: masks, associations: matches)
    }

    private func resources() throws {
        try Task.checkCancellation()
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw AnalysisError.resourceLimit
        default: break
        }
    }
}
