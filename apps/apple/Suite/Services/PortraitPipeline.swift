import Foundation
import CoreImage
import Vision
import SuiteCore

enum PortraitPipelineError: LocalizedError {
    case noFaces, ambiguousTarget, missingPersonMask, ambiguousPersonMask, invalidMask, unsupportedAdjustment, resourcesUnavailable
    var errorDescription: String? {
        switch self {
        case .noFaces: "顔を検出できません。人物補正は適用していません。"
        case .ambiguousTarget: "保存した顔を一意に照合できません。別の人物への適用を防ぐため停止しました。"
        case .missingPersonMask: "対象人物のマスクを取得できません。背景への適用を防ぐため停止しました。"
        case .ambiguousPersonMask: "顔と人物マスクの対応が曖昧です。補正を停止しました。"
        case .invalidMask: "人物・背景の分離を確認できません。補正を停止しました。"
        case .unsupportedAdjustment: "この人物補正は未対応です。編集内容は保持しています。"
        case .resourcesUnavailable: "人物解析に必要なメモリ・温度条件を満たしません。処理を停止しました。"
        }
    }
}

/// Adapter dispatch deliberately supports one adjustment, not the full retouch specification.
/// Instances and images stay within the owning PhotoPipeline actor; no Vision object enters UI state.
protocol PortraitAdjustmentAdapter {
    var adjustmentType: PortraitAdjustmentType { get }
    func render(target: PortraitFaceTarget, image: CIImage, mask: CIImage) throws -> CIImage
}

struct FaceBrightnessAdapter: PortraitAdjustmentAdapter {
    let adjustmentType = PortraitAdjustmentType.faceBrightness
    func render(target: PortraitFaceTarget, image: CIImage, mask: CIImage) throws -> CIImage {
        guard target.adjustmentType == adjustmentType else { throw PortraitPipelineError.unsupportedAdjustment }
        try target.validate()
        if target.exposureEV == 0 { return image }
        guard let exposure = CIFilter(name: "CIExposureAdjust"), let blend = CIFilter(name: "CIBlendWithMask") else {
            throw PortraitPipelineError.unsupportedAdjustment
        }
        exposure.setValue(image, forKey: kCIInputImageKey)
        exposure.setValue(target.exposureEV, forKey: kCIInputEVKey)
        guard let adjusted = exposure.outputImage else { throw PortraitPipelineError.unsupportedAdjustment }
        blend.setValue(adjusted, forKey: kCIInputImageKey)
        blend.setValue(image, forKey: kCIInputBackgroundImageKey)
        blend.setValue(mask, forKey: "inputMaskImage")
        guard let output = blend.outputImage else { throw PortraitPipelineError.invalidMask }
        return output.cropped(to: image.extent)
    }
}

/// Real on-device Vision analysis. A fresh request/handler is used for each image, including Final.
/// No cross-photo identity matching or generated/replacement mask is implemented.
struct PortraitPipeline {
    private let context: CIContext
    private let adapters: [any PortraitAdjustmentAdapter] = [FaceBrightnessAdapter()]
    init(context: CIContext) { self.context = context }

    /// Pure matching seam for independent tests. Array positions are transient results, never target IDs.
    static func resolveTargets(_ targets: [PortraitFaceTarget], detected: [PortraitFaceAnchor]) throws -> [Int] {
        guard !targets.isEmpty, targets.count == detected.count, Set(targets.map(\.id)).count == targets.count else {
            throw PortraitPipelineError.ambiguousTarget
        }
        try validateSeparatedFaces(targets.map(\.anchor))
        try validateSeparatedFaces(detected)
        var used = Set<Int>()
        return try targets.map { target in
            try target.validate()
            let candidates = detected.indices.filter { target.anchor.intersectionOverUnion(detected[$0]) >= 0.5 }
            guard candidates.count == 1, let candidate = candidates.first, used.insert(candidate).inserted else {
                throw PortraitPipelineError.ambiguousTarget
            }
            return candidate
        }
    }
    static func validateSeparatedFaces(_ faces: [PortraitFaceAnchor]) throws {
        for (index, face) in faces.enumerated() {
            try face.validate()
            guard !faces.dropFirst(index + 1).contains(where: { face.intersectionOverUnion($0) > 0 }) else {
                throw PortraitPipelineError.ambiguousTarget
            }
        }
    }

    /// Pure Undo/reanalysis seam: reuse the existing inventory, including a hidden redo branch.
    /// Only explicit subsequent selection may change neutral values; no old EV is automatically restored.
    static func neutralPortrait(from history: EditHistory, asset: AssetRecord) throws -> PortraitRecipe? {
        let remembered = try history.entries.compactMap { try $0.parameters.portraitRecipe() }.first
        guard let remembered else { return nil }
        try remembered.validate(asset: asset)
        var neutral = remembered
        for target in remembered.targets { neutral = try neutral.settingExposure(0, targetID: target.id) }
        return neutral
    }

    func analyze(image: CIImage, asset: AssetRecord) throws -> PortraitRecipe {
        try asset.validate()
        let analysis = try detect(image)
        try Self.validateSeparatedFaces(analysis.faces)
        // Check every offered face's real person mask before exposing it as an editable target.
        var used = Set<Int>()
        let targets = try analysis.faces.map { face in
            let person = try personMask(for: face, analysis: analysis)
            guard used.insert(person.instance).inserted else { throw PortraitPipelineError.ambiguousPersonMask }
            return try PortraitFaceTarget(anchor: face)
        }
        return try PortraitRecipe(assetID: asset.id, originalSHA256: asset.sha256, targets: targets)
    }

    func apply(_ recipe: PortraitRecipe, to image: CIImage) throws -> CIImage {
        try recipe.validate()
        // Reanalysis uses this exact upright source. Final is never supplied a proxy by PhotoPipeline.
        let analysis = try detect(image)
        let matches = try Self.resolveTargets(recipe.targets, detected: analysis.faces)
        var usedInstances = Set<Int>()
        var output = image
        for (target, faceIndex) in zip(recipe.targets, matches) {
            try Task.checkCancellation()
            guard let adapter = adapters.first(where: { $0.adjustmentType == target.adjustmentType }) else {
                throw PortraitPipelineError.unsupportedAdjustment
            }
            let face = analysis.faces[faceIndex]
            let person = try personMask(for: face, analysis: analysis)
            guard usedInstances.insert(person.instance).inserted else { throw PortraitPipelineError.ambiguousPersonMask }
            let mask = try faceMask(face, person: person.mask, extent: image.extent)
            // Neutral values still undergo binding/analysis validation, but do not alter pixels.
            if target.exposureEV != 0 { output = try adapter.render(target: target, image: output, mask: mask) }
        }
        return output
    }

    private struct Analysis {
        let faces: [PortraitFaceAnchor]
        let instances: VNInstanceMaskObservation
        let handler: VNImageRequestHandler
        let extent: CGRect
    }

    private func detect(_ image: CIImage) throws -> Analysis {
        try Task.checkCancellation()
        let extent = image.extent
        guard extent.origin == .zero, extent.width.isFinite, extent.height.isFinite,
              extent.width > 0, extent.height > 0,
              Double(extent.width) * Double(extent.height) * 64 < Double(ProcessInfo.processInfo.physicalMemory) / 3 else {
            throw PortraitPipelineError.resourcesUnavailable
        }
        switch ProcessInfo.processInfo.thermalState {
        case .serious, .critical: throw PortraitPipelineError.resourcesUnavailable
        default: break
        }
        // Rasterization is analysis-only. The original CIImage remains the full-quality render source.
        guard let color = CGColorSpace(name: CGColorSpace.sRGB),
              let pixels = context.createCGImage(image, from: extent, format: .RGBA8, colorSpace: color) else {
            throw PortraitPipelineError.resourcesUnavailable
        }
        let handler = VNImageRequestHandler(cgImage: pixels, orientation: .up, options: [:])
        let faces = VNDetectFaceRectanglesRequest()
        let people = VNGeneratePersonInstanceMaskRequest()
        faces.revision = VNDetectFaceRectanglesRequestRevision3
        people.revision = VNGeneratePersonInstanceMaskRequestRevision1
        try handler.perform([faces, people])
        try Task.checkCancellation()
        guard let detected = faces.results, !detected.isEmpty, detected.count <= 64 else { throw PortraitPipelineError.noFaces }
        // Masks remain referenced by the lazy output graph. Bound their aggregate, not just the source raster.
        guard Double(extent.width) * Double(extent.height) * Double(64 + detected.count * 8)
                < Double(ProcessInfo.processInfo.physicalMemory) / 3 else { throw PortraitPipelineError.resourcesUnavailable }
        guard let masks = people.results, masks.count == 1, let instances = masks.first,
              !instances.allInstances.isEmpty else { throw PortraitPipelineError.missingPersonMask }
        let anchors = try detected.map { observation in
            let b = observation.boundingBox
            return try PortraitFaceAnchor(x: Double(b.minX), y: Double(b.minY), width: Double(b.width), height: Double(b.height))
        }.sorted { $0.x == $1.x ? $0.y > $1.y : $0.x < $1.x }
        return Analysis(faces: anchors, instances: instances, handler: handler, extent: extent)
    }

    private func personMask(for face: PortraitFaceAnchor, analysis: Analysis) throws -> (instance: Int, mask: CIImage) {
        var candidates: [(Int, CIImage)] = []
        let faceRect = rect(face, extent: analysis.extent)
        for instance in analysis.instances.allInstances {
            try Task.checkCancellation()
            let buffer = try analysis.instances.generateMask(forInstances: IndexSet(integer: instance))
            let low = normalized(CIImage(cvPixelBuffer: buffer))
            guard low.extent.width > 0, low.extent.height > 0 else { throw PortraitPipelineError.invalidMask }
            let scaled = low.transformed(by: CGAffineTransform(scaleX: analysis.extent.width / low.extent.width,
                                                               y: analysis.extent.height / low.extent.height))
                .cropped(to: analysis.extent)
            let coverage = try statistic("CIAreaAverage", image: scaled, region: faceRect)
            // Engine-v1 safety policy: substantial own-face coverage; competing coverage is ambiguous.
            if coverage >= 0.5 { candidates.append((instance, scaled)) }
            else if coverage > 0.05 { throw PortraitPipelineError.ambiguousPersonMask }
        }
        guard candidates.count == 1, let selected = candidates.first else { throw PortraitPipelineError.ambiguousPersonMask }
        let fullBuffer = try analysis.instances.generateScaledMaskForImage(forInstances: IndexSet(integer: selected.0), from: analysis.handler)
        let native = normalized(CIImage(cvPixelBuffer: fullBuffer))
        guard native.extent.width > 0, native.extent.height > 0 else { throw PortraitPipelineError.invalidMask }
        let mask = native.transformed(by: CGAffineTransform(scaleX: analysis.extent.width / native.extent.width,
                                                           y: analysis.extent.height / native.extent.height))
            .cropped(to: analysis.extent)
        let minimum = try statistic("CIAreaMinimum", image: mask, region: analysis.extent)
        let maximum = try statistic("CIAreaMaximum", image: mask, region: analysis.extent)
        let average = try statistic("CIAreaAverage", image: mask, region: analysis.extent)
        guard minimum <= 0.05, maximum >= 0.8, average > 0.001, average < 0.995,
              try statistic("CIAreaAverage", image: mask, region: faceRect) >= 0.5 else { throw PortraitPipelineError.invalidMask }
        return (selected.0, mask)
    }

    private func faceMask(_ face: PortraitFaceAnchor, person: CIImage, extent: CGRect) throws -> CIImage {
        let box = rect(face, extent: extent)
        guard let radial = CIFilter(name: "CIRadialGradient"), let blend = CIFilter(name: "CIBlendWithMask") else {
            throw PortraitPipelineError.invalidMask
        }
        radial.setValue(CIVector(x: 0, y: 0), forKey: kCIInputCenterKey)
        radial.setValue(0.75, forKey: "inputRadius0")
        radial.setValue(1.0, forKey: "inputRadius1")
        radial.setValue(CIColor(red: 1, green: 1, blue: 1), forKey: "inputColor0")
        radial.setValue(CIColor(red: 0, green: 0, blue: 0), forKey: "inputColor1")
        guard let circle = radial.outputImage else { throw PortraitPipelineError.invalidMask }
        let ellipse = circle.transformed(by: CGAffineTransform(a: box.width / 2, b: 0, c: 0, d: box.height / 2,
                                                               tx: box.midX, ty: box.midY)).cropped(to: extent)
        let black = CIImage(color: CIColor(red: 0, green: 0, blue: 0)).cropped(to: extent)
        blend.setValue(person, forKey: kCIInputImageKey)
        blend.setValue(black, forKey: kCIInputBackgroundImageKey)
        blend.setValue(ellipse, forKey: "inputMaskImage")
        guard let mask = blend.outputImage else { throw PortraitPipelineError.invalidMask }
        // Explicit zero outside the matched face box. Distinct matched boxes are required
        // to be disjoint before rendering, so one person's pixels cannot be reprocessed.
        return mask.cropped(to: box).composited(over: black).cropped(to: extent)
    }

    private func statistic(_ filterName: String, image: CIImage, region: CGRect) throws -> Double {
        guard let filter = CIFilter(name: filterName), !region.isEmpty else { throw PortraitPipelineError.invalidMask }
        filter.setValue(image, forKey: kCIInputImageKey)
        filter.setValue(CIVector(cgRect: region), forKey: kCIInputExtentKey)
        guard let output = filter.outputImage else { throw PortraitPipelineError.invalidMask }
        var pixel = [Float](repeating: 0, count: 4)
        pixel.withUnsafeMutableBytes { bytes in
            if let address = bytes.baseAddress {
                context.render(output, toBitmap: address, rowBytes: 4 * MemoryLayout<Float>.size,
                               bounds: CGRect(x: 0, y: 0, width: 1, height: 1), format: .RGBAf, colorSpace: nil)
            }
        }
        guard pixel[0].isFinite, pixel[0] >= 0, pixel[0] <= 1.001 else { throw PortraitPipelineError.invalidMask }
        return Double(pixel[0])
    }
    private func rect(_ face: PortraitFaceAnchor, extent: CGRect) -> CGRect {
        CGRect(x: extent.width * face.x, y: extent.height * face.y,
               width: extent.width * face.width, height: extent.height * face.height)
    }
    private func normalized(_ image: CIImage) -> CIImage {
        image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
    }
}
