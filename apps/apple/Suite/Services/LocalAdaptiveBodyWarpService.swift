import Foundation
import SuiteCore

/// Approved 2D rules against THIS photo's explicitly reviewed bounding region.
/// Imported evidence is only untrusted provenance metadata. Its completed flags,
/// passed identities, scale or distance NEVER grant automatic-analysis capability.
actor LocalAdaptiveBodyWarpService {
    struct Rule: Codable, Sendable {
        let revision: String
        let setting: RetouchSetting
        /// Operation centers/radii are fractions of the measured region.
        /// Signed coefficients use the existing engine unchanged.
        let relativeOperations: [LocalWarpRecipe.Operation]
    }
    struct MeasuredRegion: Codable, Sendable {
        let reference: PhotoBoundRegion
        let analysisSHA256: String
        let rectangle: LocalRetouchRecipe.Rectangle
    }
    enum Failure: Error { case evidence, rule, consent, busy }
    struct Request: Decodable {
        let schemaVersion: Int
        let rule: Rule
        let region: MeasuredRegion
        let evidence: PhotoAnalysisEvidence?
        static func decode(_ text: String) throws -> Self {
            guard let data = text.data(using:.utf8), data.count <= 65_536,
                  let root = try JSONSerialization.jsonObject(with:data) as? [String:Any],
                  Set(root.keys).isSubset(of:["schemaVersion","rule","region","evidence"]),
                  Set(["schemaVersion","rule","region"]).isSubset(of:Set(root.keys)),
                  let rule = root["rule"] as? [String:Any], Set(rule.keys) == ["revision","setting","relativeOperations"],
                  let operations = rule["relativeOperations"] as? [Any], (1...128).contains(operations.count),
                  let region = root["region"] as? [String:Any], Set(region.keys) == ["reference","analysisSHA256","rectangle"] else { throw Failure.rule }
            if let evidence = root["evidence"] {
                guard let object = evidence as? [String:Any],
                      Set(object.keys) == ["id","assetID","originalSHA256","implementationVersion","completed","people"],
                      let people = object["people"] as? [Any], people.count <= 512 else { throw Failure.rule }
            }
            let value = try JSONDecoder().decode(Self.self, from:data)
            guard value.schemaVersion == 1 else { throw Failure.rule }
            return value
        }
    }
    private let renderer: LocalPersonBodyWarpService
    private var active = false
    init(maskStore: LocalBackdropRecipeStore) { renderer = LocalPersonBodyWarpService(maskStore: maskStore) }

    /// Runtime-only entry, deliberately NOT connected to the JSON editor.
    /// The analysis owner must attest the exact evidence/region before and after
    /// rendering. A typed value alone is not proof that inference occurred.
    /// Rules remain explicit; this does not invent a LOW/MEDIUM/HIGH mapping.
    func makeRuntimeCandidate(rule: Rule, region: MeasuredRegion, evidence: PhotoAnalysisEvidence,
                              validateRuntime: @Sendable (PhotoAnalysisEvidence, MeasuredRegion) async throws -> Bool,
                              ruleConfirmed: Bool, referencePNG: Data, prepared: LocalFacePixels.Prepared,
                              analysis: LocalFaceAnalysisService.Analysis, asset: AssetRecord,
                              assignments: PhotoPersonAssignments, intent: PersonLookIntent, faceTargetID: UUID,
                              consentedPersonIDs: Set<FaceIdentity.PersonID>,
                              protection: LocalRetouchRecipe.Rectangle?, currentRecipe: LocalWarpRecipe? = nil,
                              detailed: LocalDetailedPortraitAnalysis.Result) async throws -> LocalPersonBodyWarpService.Candidate {
        let required = CorrectionAnalysisRequirements.forControl(rule.setting.control).analysis
        guard required.isSubset(of:evidence.completed),
              evidence.people.filter({ $0.personID == intent.personID && $0.identityMatch == .passed }).count == 1,
              try await validateRuntime(evidence, region) else { throw Failure.evidence }
        try Task.checkCancellation()
        let candidate = try await makeCandidate(rule:rule, region:region, evidence:evidence,
            observedRectangle:region.rectangle, ruleConfirmed:ruleConfirmed, referencePNG:referencePNG,
            prepared:prepared, analysis:analysis, asset:asset, assignments:assignments, intent:intent,
            faceTargetID:faceTargetID, consentedPersonIDs:consentedPersonIDs, protection:protection,
            currentRecipe:currentRecipe, detailed:detailed)
        try Task.checkCancellation()
        guard try await validateRuntime(evidence, region) else { throw Failure.evidence }
        return candidate
    }

    /// Returns an unapplied candidate for the existing explicit acceptance/CAS
    /// path. Caller must recheck photo, rule, consent and evidence before saving.
    func makeCandidate(rule: Rule, region: MeasuredRegion, evidence: PhotoAnalysisEvidence?,
                       observedRectangle: LocalRetouchRecipe.Rectangle,
                       ruleConfirmed: Bool, referencePNG: Data, prepared: LocalFacePixels.Prepared,
                       analysis: LocalFaceAnalysisService.Analysis, asset: AssetRecord,
                       assignments: PhotoPersonAssignments, intent: PersonLookIntent, faceTargetID: UUID,
                       consentedPersonIDs: Set<FaceIdentity.PersonID>,
                       protection: LocalRetouchRecipe.Rectangle?, currentRecipe: LocalWarpRecipe? = nil,
                       detailed: LocalDetailedPortraitAnalysis.Result) async throws -> LocalPersonBodyWarpService.Candidate {
        guard !active else { throw Failure.busy }
        active = true; defer { active = false }
        try Task.checkCancellation(); try intent.validate(); try region.rectangle.validate()
        guard ruleConfirmed else { throw Failure.consent }
        guard rule.setting.control.category == .body, rule.setting.strength.level != .off,
              intent.settings.contains(rule.setting), !rule.revision.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty,
              rule.revision.utf8.count <= 256, (1...128).contains(rule.relativeOperations.count) else { throw Failure.rule }
        try observedRectangle.validate()
        guard region.rectangle == observedRectangle else { throw Failure.evidence }
        try BodyWarp2DRequirements.validate(control:rule.setting.control, region:region.rectangle, operations:rule.relativeOperations)
        guard region.reference.assetID == asset.id,
              region.reference.originalSHA256.lowercased() == asset.sha256.lowercased(),
              region.analysisSHA256 == prepared.analysisSHA256,
              !region.reference.regionReference.isEmpty, region.reference.regionReference.utf8.count <= 512 else { throw Failure.evidence }
        if let evidence {
        guard evidence.assetID == asset.id, evidence.originalSHA256.lowercased() == asset.sha256.lowercased(),
              !evidence.implementationVersion.isEmpty, evidence.implementationVersion.utf8.count <= 512,
              evidence.people.count <= 512,
              evidence.people.filter({ $0.personID == intent.personID }).count == 1,
              let person = evidence.people.first(where: { $0.personID == intent.personID }),
              person.bodyRegion == region.reference,
              region.reference.assetID == asset.id,
              region.reference.originalSHA256.lowercased() == asset.sha256.lowercased(),
              region.reference.analysisID == evidence.id,
              !region.reference.regionReference.isEmpty, region.reference.regionReference.utf8.count <= 512,
              region.analysisSHA256 == prepared.analysisSHA256,
              let background = person.protectedBackgroundRegion,
              background.assetID == asset.id, background.originalSHA256.lowercased() == asset.sha256.lowercased(),
              background.analysisID == evidence.id, !background.regionReference.isEmpty else { throw Failure.evidence }
        }
        let r = region.rectangle
        var operations: [LocalWarpRecipe.Operation] = []
        for relative in rule.relativeOperations {
            try Task.checkCancellation(); _ = try relative.runtimeOperation()
            guard relative.center.x-relative.rx >= 0, relative.center.y-relative.ry >= 0,
                  relative.center.x+relative.rx <= 1, relative.center.y+relative.ry <= 1 else { throw Failure.rule }
            operations.append(try .init(kind:relative.kind,
                center:.init(x:r.x+relative.center.x*r.width, y:r.y+relative.center.y*r.height),
                rx:relative.rx*r.width, ry:relative.ry*r.height,
                amount:relative.amount, dx:relative.dx, dy:relative.dy, angle:relative.angle))
        }
        // Existing service enforces actual instance destination/donor protection,
        // immutable prior operations/mask and measured photo/assignment binding.
        return try await renderer.makeCandidate(referencePNG:referencePNG, prepared:prepared,
            analysis:analysis, asset:asset, assignments:assignments, intent:intent, setting:rule.setting,
            faceTargetID:faceTargetID, consentedPersonIDs:consentedPersonIDs, manualRegionConfirmed:true,
            manualRegion:r, operations:operations, protection:protection, currentRecipe:currentRecipe, detailed:detailed)
    }
}
