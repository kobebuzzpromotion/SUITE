import Foundation
import SuiteCore

/// Person-bound MANUAL body intent resolution. This does not detect a waist,
/// limb, silhouette or background, and never maps strength labels to coefficients.
/// The user must select the region and approve the exact supplied operations.
actor LocalPersonBodyWarpService {
    enum Failure: Error { case busy, binding, consent, unsupportedIntent, region, protectionChanged }
    struct Candidate: Sendable {
        let personID: FaceIdentity.PersonID
        let faceTargetID: UUID
        let setting: RetouchSetting
        let assignments: PhotoPersonAssignments
        let analysisVersion: String
        let manualRegion: LocalRetouchRecipe.Rectangle
        let baseRecipe: LocalWarpRecipe?
        let recipe: LocalWarpRecipe
        let png: Data
        let instanceProtection: LocalDetailedPortraitAnalysis.Mask?
        let instanceAnalysisVersion: String?
    }
    private let preview = LocalWarpRecipePreview()
    private let maskStore: LocalBackdropRecipeStore
    private var busy = false
    init(maskStore: LocalBackdropRecipeStore) { self.maskStore = maskStore }

    func makeCandidate(referencePNG: Data, prepared: LocalFacePixels.Prepared,
                       analysis: LocalFaceAnalysisService.Analysis, asset: AssetRecord,
                       assignments: PhotoPersonAssignments, intent: PersonLookIntent,
                       setting: RetouchSetting, faceTargetID: UUID,
                       consentedPersonIDs: Set<FaceIdentity.PersonID>, manualRegionConfirmed: Bool,
                       manualRegion: LocalRetouchRecipe.Rectangle,
                       operations: [LocalWarpRecipe.Operation],
                       protection: LocalRetouchRecipe.Rectangle?,
                       currentRecipe: LocalWarpRecipe? = nil,
                       detailed: LocalDetailedPortraitAnalysis.Result? = nil) async throws -> Candidate {
        guard !busy else { throw Failure.busy }
        busy = true; defer { busy = false }
        try Task.checkCancellation(); try asset.validate(); try intent.validate()
        let personID = FaceIdentity.PersonID(intent.personID)
        guard setting.control.category == .body, setting.strength.level != .off,
              intent.settings.contains(setting) else { throw Failure.unsupportedIntent }
        guard manualRegionConfirmed, consentedPersonIDs.contains(personID) else { throw Failure.consent }
        guard prepared.assetID == asset.id, prepared.originalSHA256 == asset.sha256.lowercased(),
              analysis.assetID == asset.id, analysis.originalSHA256 == prepared.originalSHA256,
              analysis.analysisSHA256 == prepared.analysisSHA256,
              analysis.inputWidth == prepared.inputWidth, analysis.inputHeight == prepared.inputHeight,
              analysis.analysisWidth == prepared.width, analysis.analysisHeight == prepared.height else { throw Failure.binding }
        try assignments.validate(assetID: asset.id, originalSHA256: asset.sha256,
            analysisVersion: analysis.analysisVersion, analysisSHA256: analysis.analysisSHA256,
            targets: analysis.faces.map(\.target))
        guard assignments.assignments[faceTargetID] == personID,
              analysis.faces.filter({ $0.target.faceTargetID == faceTargetID }).count == 1 else { throw Failure.binding }
        try manualRegion.validate(); try protection?.validate()
        var instanceProtection: LocalDetailedPortraitAnalysis.Mask?
        if let detailed {
            guard detailed.assetID == asset.id, detailed.originalSHA256 == prepared.originalSHA256,
                  detailed.analysisSHA256 == prepared.analysisSHA256,
                  detailed.faces.filter({ $0.target.faceTargetID == faceTargetID }).count == 1,
                  let face = detailed.faces.first(where: { $0.target.faceTargetID == faceTargetID }),
                  detailed.masks.filter({ $0.instanceID == face.personInstanceID }).count == 1,
                  let mask = detailed.masks.first(where: { $0.instanceID == face.personInstanceID }),
                  mask.width == prepared.inputWidth, mask.height == prepared.inputHeight,
                  mask.bottomUpLuminance8.count == mask.width * mask.height else { throw Failure.binding }
            instanceProtection = mask
        }
        guard !operations.isEmpty, operations.count <= 128 else { throw Failure.region }
        for operation in operations {
            try Task.checkCancellation(); _ = try operation.runtimeOperation()
            // Entire elliptical support must be explicitly inside the reviewed
            // rectangle. No clipping, radius reduction or guessed body region.
            guard operation.center.x - operation.rx >= manualRegion.x,
                  operation.center.y - operation.ry >= manualRegion.y,
                  operation.center.x + operation.rx <= manualRegion.x + manualRegion.width,
                  operation.center.y + operation.ry <= manualRegion.y + manualRegion.height else { throw Failure.region }
            if let mask = instanceProtection {
                // The mask is an actual measured person instance, NOT skin or
                // a mesh. Reject all uncertain/boundary/background support; do
                // not change coefficients or silently erode the brush.
                let bytes = [UInt8](mask.bottomUpLuminance8), w = mask.width, h = mask.height
                let cx = operation.center.x * Double(w), cy = operation.center.y * Double(h)
                let rx = operation.rx * Double(w), ry = operation.ry * Double(h)
                let x0 = max(0, Int(floor(cx-rx))-1), x1 = min(w-1, Int(ceil(cx+rx))+1)
                let y0 = max(0, Int(floor(cy-ry))-1), y1 = min(h-1, Int(ceil(cy+ry))+1)
                for y in y0...y1 {
                    try Task.checkCancellation()
                    for x in x0...x1 {
                        // Conservative bounding rectangle plus sampling margin.
                        guard bytes[(h-1-y)*w+x] == 255 else { throw Failure.region }
                    }
                }
            }
        }
        if let currentRecipe {
            try currentRecipe.validate(asset: asset)
            // A shared freeze rectangle affects ALL operations, so changing it
            // here would silently reinterpret previously approved adjustments.
            guard currentRecipe.protectionRectangle == protection else { throw Failure.protectionChanged }
        }
        var maskBytes: Data?
        var maskReference = currentRecipe?.bodyMask
        if let mask = instanceProtection {
            let bottom = [UInt8](mask.bottomUpLuminance8)
            var top = [UInt8](repeating: 0, count: bottom.count)
            for y in 0..<mask.height {
                try Task.checkCancellation()
                for x in 0..<mask.width { top[y*mask.width+x] = bottom[(mask.height-1-y)*mask.width+x] }
            }
            let data = Data(top)
            let digest = try await maskStore.install(mask: data)
            let next = try LocalBackdropRecipe.MaskReference(sha256: digest, width: mask.width, height: mask.height, byteCount: data.count)
            // An existing whole-operation protection contract cannot be replaced
            // implicitly by a new analysis result on a subsequent edit.
            if let prior = maskReference, prior != next { throw Failure.protectionChanged }
            maskReference = next; maskBytes = data
        } else if let reference = maskReference {
            maskBytes = try await maskStore.bytes(sha256: reference.sha256, expectedCount: reference.byteCount)
        }
        let recipe = try LocalWarpRecipe(assetID: asset.id, originalSHA256: asset.sha256,
            referenceWidth: currentRecipe?.referenceWidth ?? prepared.inputWidth,
            referenceHeight: currentRecipe?.referenceHeight ?? prepared.inputHeight,
            operations: (currentRecipe?.operations ?? []) + operations,
            protectionRectangle: protection, bodyMask: maskReference)
        if let mask = instanceProtection {
            let w = mask.width, h = mask.height, bytes = [UInt8](mask.bottomUpLuminance8)
            var frozen = [UInt8](repeating: 0, count: w*h)
            if let protection {
                for y in 0..<h {
                    try Task.checkCancellation()
                    for x in 0..<w where
                        min(Double(x+1),(protection.x+protection.width)*Double(w)) > max(Double(x),protection.x*Double(w)) &&
                        min(Double(y+1),(protection.y+protection.height)*Double(h)) > max(Double(y),protection.y*Double(h)) { frozen[y*w+x] = 255 }
                }
            }
            let map = try LocalWarpFieldBuilder.build(photoID: asset.id, originalSHA256: asset.sha256,
                geometryRevision: analysis.analysisVersion, width: w, height: h,
                operations: recipe.operations.map { try $0.runtimeOperation() }, protectionTopLeftL8: Data(frozen))
            for y in 0..<h {
                try Task.checkCancellation()
                for x in 0..<w {
                    let source = try map.outputToSource(.init(x: (Double(x)+0.5)/Double(w), y: (Double(y)+0.5)/Double(h)))
                    let sx = max(0,min(Double(w-1),source.x*Double(w)-0.5))
                    let sy = max(0,min(Double(h-1),source.y*Double(h)-0.5))
                    if abs(sx-Double(x)) <= 1e-8 && abs(sy-Double(y)) <= 1e-8 { continue }
                    guard bytes[(h-1-y)*w+x] == 255 else { throw Failure.region }
                    let ax = Int(floor(sx)), ay = Int(floor(sy)), bx = min(w-1,ax+1), by = min(h-1,ay+1)
                    let u = sx-Double(ax), v = sy-Double(ay)
                    for (px,py,weight) in [(ax,ay,(1-u)*(1-v)),(bx,ay,u*(1-v)),(ax,by,(1-u)*v),(bx,by,u*v)] where weight > 0 {
                        guard bytes[(h-1-py)*w+px] == 255 else { throw Failure.region }
                    }
                }
            }
        }
        // Existing renderer certifies actual applied field (pinned boundaries,
        // protected donor/destination and inverse bounds); rejection is retained.
        let result = try await preview.render(referencePNG: referencePNG, prepared: prepared, recipe: recipe,
                                              bodyMaskBytes: maskBytes)
        try Task.checkCancellation()
        return Candidate(personID: personID, faceTargetID: faceTargetID, setting: setting,
            assignments: assignments, analysisVersion: analysis.analysisVersion,
            manualRegion: manualRegion, baseRecipe: currentRecipe, recipe: result.recipe, png: result.png,
            instanceProtection: instanceProtection, instanceAnalysisVersion: detailed?.analysisVersion)
    }
}
