import Foundation
import SuiteCore

/// Explicit, person-bound MANUAL rectangle smoothing or donor-based repair. A face assignment does
/// not prove that a selected rectangle is skin: caller must review that region.
/// No semantic detection, strength preset mapping, save or automatic application.
actor LocalPersonSkinSmoothingService {
    enum Failure: Error { case busy, binding, consent, invalidRegion }
    struct Candidate: Sendable {
        let personID: FaceIdentity.PersonID
        let faceTargetID: UUID
        let analysisVersion: String
        let assignments: PhotoPersonAssignments
        let baseRecipe: LocalRetouchRecipe?
        let recipe: LocalRetouchRecipe
        let png: Data
    }
    private let preview = LocalRetouchRecipePreview()
    private var busy = false

    func makeCandidate(referencePNG: Data, prepared: LocalFacePixels.Prepared,
                       analysis: LocalFaceAnalysisService.Analysis, asset: AssetRecord,
                       assignments: PhotoPersonAssignments, personID: FaceIdentity.PersonID,
                       faceTargetID: UUID, consentedPersonIDs: Set<FaceIdentity.PersonID>,
                       regionConfirmed: Bool, selection: LocalRetouchRecipe.Rectangle,
                       protection: LocalRetouchRecipe.Rectangle?, strength: Double,
                       radiusInputPixels: Double, currentRecipe: LocalRetouchRecipe? = nil,
                       repairEffect: LocalRetouchRecipe.Effect? = nil) async throws -> Candidate {
        guard !busy else { throw Failure.busy }; busy = true; defer { busy = false }
        try Task.checkCancellation(); try asset.validate()
        guard regionConfirmed, consentedPersonIDs.contains(personID) else { throw Failure.consent }
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
        try selection.validate(); try protection?.validate()
        // Do not infer skin or crop a supplied region to a detector box. The
        // reviewed rectangle is persisted exactly, including its protection.
        let rw = currentRecipe?.referenceWidth ?? prepared.inputWidth
        let rh = currentRecipe?.referenceHeight ?? prepared.inputHeight
        if let currentRecipe { try currentRecipe.validate(asset: asset) }
        guard prepared.inputWidth > 0, prepared.inputHeight > 0, rw > 0, rh > 0 else { throw Failure.invalidRegion }
        let effect: LocalRetouchRecipe.Effect
        if let repairEffect {
            // Same immutable-photo donor chosen explicitly by the caller. This
            // is NOT scar/wrinkle detection or synthesized/healed skin.
            guard repairEffect.kind == .localRepair, repairEffect.strength == strength else { throw Failure.invalidRegion }
            effect = repairEffect
        } else {
            guard radiusInputPixels.isFinite, radiusInputPixels > 0, radiusInputPixels <= 32 else { throw Failure.invalidRegion }
            let scale = min(Double(prepared.inputWidth) / Double(rw), Double(prepared.inputHeight) / Double(rh))
            effect = try LocalRetouchRecipe.Effect(kind: .skinSmoothing, strength: strength,
                                                   radiusReferencePixels: radiusInputPixels / scale)
        }
        let layer = try LocalRetouchRecipe.Layer(selection: selection, protection: protection, effect: effect)
        let recipe = try LocalRetouchRecipe(assetID: asset.id, originalSHA256: asset.sha256,
            referenceWidth: rw, referenceHeight: rh, layers: (currentRecipe?.layers ?? []) + [layer])
        // Shared saved renderer performs PNG/up/dimensions/BGR digest comparison,
        // source-domain protection, resource/thermal checks and Float rendering.
        let rendered = try await preview.render(referencePNG: referencePNG, prepared: prepared, recipe: recipe)
        try Task.checkCancellation()
        return Candidate(personID: personID, faceTargetID: faceTargetID, analysisVersion: analysis.analysisVersion,
            assignments: assignments, baseRecipe: currentRecipe, recipe: rendered.recipe, png: rendered.png)
    }
}
