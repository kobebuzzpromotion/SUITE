import Foundation
import CryptoKit
import Combine
import SuiteCore

/// Explicit local face registration UI state. Never writes a Recipe or assigns a
/// person's correction automatically. Names/embeddings stay in the local gallery.
@MainActor
final class LocalPeopleModel: ObservableObject {
    enum ModelKind { case yunet, sface }
    enum ManualRetouchEffect: String, CaseIterable { case smoothing, clone }
    @Published private(set) var bodyGeometry: LocalBodyGeometryService.Result?
    @Published var selectedBodyID: UUID? { didSet { bodyPersonMapping = nil; invalidateWarp() } }
    @Published private(set) var bodyPersonMapping: String?
    @Published private(set) var warpedBodyJoints: [LocalBodyGeometryService.Joint] = []
    private let bodyGeometryService = LocalBodyGeometryService()
    private var bodyMappingAssignments: PhotoPersonAssignments?
    private var bodyMappingFaceID: UUID?
    private struct BodyPoseBinding: Equatable {
        let analysisID: UUID
        let bodyID: UUID
        let analysisSHA256: String
        let faceID: UUID
        let personID: FaceIdentity.PersonID
    }
    private var previewBodyPoseBinding: BodyPoseBinding?
    func useBodyJointAsBrushCenter(_ name: String) throws {
        guard !isBusy, try currentBodyPoseBinding() != nil, let geometry = bodyGeometry,
              let body = geometry.bodies.first(where: { $0.id == selectedBodyID }),
              let joint = body.joints.first(where: { $0.name == name }), joint.confidence > 0 else { throw PeopleError.noPhoto }
        // Explicitly selected measured point only. No radius, intent strength,
        // semantic region or displacement is inferred from a joint name.
        warpCenterXText = String(joint.x); warpCenterYText = String(joint.y)
        personBodyConfirmed = false
    }
    func prepareObservedBodyWarp() throws {
        guard canPreviewManualWarp, !isBusy, let binding = try currentBodyPoseBinding(),
              let body = bodyGeometry?.bodies.first(where: { $0.id == binding.bodyID }) else { throw PeopleError.noPhoto }
        let amount: Double
        if bodyStrengthLevel == "CUSTOM" {
            guard let custom = Double(bodyIntentValueText) else { throw PeopleError.noPhoto }; amount = custom
        } else {
            guard let values = UserDefaults.standard.dictionary(forKey:bodyStrengthPreferenceKey),
                  let value = values[bodyStrengthLevel] as? Double, value.isFinite, (-1...1).contains(value) else {
                throw SuiteValidationError.invalidValue("この項目のLOW/MEDIUM/HIGH設定を先に明示保存してください")
            }
            amount = value
        }
        let operations = try LocalObservedBodyWarpBuilder.operations(body:body, control:personBodyControl, customAmount:amount)
        guard let operation = operations.first, operations.allSatisfy({ $0.center.x-$0.rx >= 0 && $0.center.y-$0.ry >= 0 && $0.center.x+$0.rx <= 1 && $0.center.y+$0.ry <= 1 }) else {
            throw SuiteValidationError.invalidValue("観測領域が画像外へ出ます。手動領域を使用してください")
        }
        personBodyEnabled = true; bodyInstanceProtectionEnabled = true
        manualPartProtectionRequired = false; manualPartBinding = nil
        bodyIntentValueText = String(amount)
        warpKind = operation.kind; warpCenterXText = String(operation.center.x); warpCenterYText = String(operation.center.y)
        warpRadiusXText = String(operation.rx); warpRadiusYText = String(operation.ry)
        warpAmountText = String(operation.amount); warpDXText = "0"; warpDYText = "0"; warpAngleText = "0"
        let x = operations.map { $0.center.x-$0.rx }.min()!, y = operations.map { $0.center.y-$0.ry }.min()!
        let right = operations.map { $0.center.x+$0.rx }.max()!, bottom = operations.map { $0.center.y+$0.ry }.max()!
        bodyXText = String(x); bodyYText = String(y)
        bodyWidthText = String(right-x); bodyHeightText = String(bottom-y)
        personBodyConfirmed = false
        pendingWarpGroup = operations
    }
    private func currentBodyPoseBinding() throws -> BodyPoseBinding? {
        guard bodyPersonMapping != nil else { return nil }
        guard let geometry = bodyGeometry, geometry.assetID == prepared?.assetID,
              geometry.originalSHA256 == prepared?.originalSHA256,
              geometry.analysisSHA256 == prepared?.analysisSHA256,
              let bodyID = selectedBodyID, geometry.bodies.contains(where: { $0.id == bodyID }),
              let faceID = selectedFaceID, faceID == bodyMappingFaceID,
              let assignments, assignments == bodyMappingAssignments,
              let personID = assignments.assignments[faceID] else { throw PeopleError.noPhoto }
        return BodyPoseBinding(analysisID: geometry.id, bodyID: bodyID, analysisSHA256: geometry.analysisSHA256,
            faceID: faceID, personID: personID)
    }

    func analyzeBodyGeometry() async {
        await perform {
            self.bodyGeometry = nil; self.selectedBodyID = nil; self.bodyPersonMapping = nil
            guard let prepared = self.prepared, let png = self.referencePNG else { throw PeopleError.noPhoto }
            let epoch = self.generation
            let result = try await self.bodyGeometryService.analyze(referencePNG: png, prepared: prepared)
            guard epoch == self.generation, self.referencePNG == png,
                  self.prepared?.assetID == result.assetID, self.prepared?.analysisSHA256 == result.analysisSHA256 else { throw CancellationError() }
            self.bodyGeometry = result
            return "実身体jointを取得しました。人物との対応は自動確定しません。mesh・肌maskではありません。"
        }
    }
    func confirmBodyPersonMapping() throws {
        guard !isBusy, let bodyGeometry, bodyGeometry.assetID == prepared?.assetID,
              bodyGeometry.analysisSHA256 == prepared?.analysisSHA256,
              let selectedBodyID, bodyGeometry.bodies.contains(where: { $0.id == selectedBodyID }),
              assignmentLookupSucceeded, !assignmentRestoreBlocked, let assignments,
              let face = selectedFaceID, let person = assignments.assignments[face],
              people.contains(where: { $0.id == person.value }) else { throw PeopleError.noPhoto }
        bodyMappingAssignments = assignments; bodyMappingFaceID = face
        bodyPersonMapping = "身体 \(selectedBodyID) → 確定人物 \(person.value)（今回解析のみ・未保存）"
        invalidateWarp()
    }
    @Published var personSmoothingEnabled = false { didSet { personSmoothingRegionConfirmed = false; invalidateManualRetouch() } }
    @Published var personSmoothingRegionConfirmed = false { didSet { invalidateManualRetouch() } }
    private let personSmoothingService = LocalPersonSkinSmoothingService()
    private var personSmoothingCandidate: LocalPersonSkinSmoothingService.Candidate?
    @Published var personBodyEnabled = false { didSet { personBodyConfirmed = false; invalidateWarp() } }
    @Published var bodyInstanceProtectionEnabled = false { didSet { personBodyConfirmed = false; invalidateWarp() } }
    private func bodyInstanceStillCurrent(_ candidate: LocalPersonBodyWarpService.Candidate) -> Bool {
        guard let mask = candidate.instanceProtection else { return !bodyInstanceProtectionEnabled }
        guard bodyInstanceProtectionEnabled, let detail = detailedAnalysis,
              detail.analysisSHA256 == prepared?.analysisSHA256,
              detail.analysisVersion == candidate.instanceAnalysisVersion,
              detail.faces.contains(where: { $0.target.faceTargetID == candidate.faceTargetID && $0.personInstanceID == mask.instanceID }),
              let current = detail.masks.first(where: { $0.instanceID == mask.instanceID }) else { return false }
        return current.width == mask.width && current.height == mask.height && current.bottomUpLuminance8 == mask.bottomUpLuminance8
    }
    @Published var personBodyConfirmed = false {
        didSet { let group = pendingWarpGroup; invalidateWarp(); pendingWarpGroup = group }
    }
    @Published var bodyStrengthLevel = "CUSTOM" { didSet { personBodyConfirmed = false; invalidateWarp() } }
    @Published var bodyLowText = ""
    @Published var bodyMediumText = ""
    @Published var bodyHighText = ""
    private var bodyStrengthPreferenceKey: String { "suite.user-body-strength.v1." + personBodyControl.rawValue }
    func saveBodyStrengthMapping() throws {
        guard !isBusy, [.waist,.bodyLine,.arm,.leg].contains(personBodyControl),
              let low = Double(bodyLowText), let medium = Double(bodyMediumText), let high = Double(bodyHighText),
              [low,medium,high].allSatisfy({ $0.isFinite && (-1...1).contains($0) }) else {
            throw SuiteValidationError.invalidValue("LOW/MEDIUM/HIGHを各−1〜1で指定してください")
        }
        // User-authored numeric preference only; no default, learned ideal,
        // personal features, measurement or consent is persisted here.
        UserDefaults.standard.set(["LOW":low,"MEDIUM":medium,"HIGH":high], forKey:bodyStrengthPreferenceKey)
        personBodyConfirmed = false; invalidateWarp()
    }
    func loadBodyStrengthMapping() {
        let values = UserDefaults.standard.dictionary(forKey:bodyStrengthPreferenceKey) ?? [:]
        bodyLowText = (values["LOW"] as? Double).map { String($0) } ?? ""
        bodyMediumText = (values["MEDIUM"] as? Double).map { String($0) } ?? ""
        bodyHighText = (values["HIGH"] as? Double).map { String($0) } ?? ""
    }
    @Published var personBodyControl: RetouchControl = .localShapeAdjustment { didSet { personBodyConfirmed = false; invalidateWarp() } }
    @Published var bodyXText = "" { didSet { personBodyConfirmed = false; invalidateWarp() } }
    @Published var bodyIntentValueText = "" { didSet { personBodyConfirmed = false; invalidateWarp() } }
    @Published var bodyYText = "" { didSet { personBodyConfirmed = false; invalidateWarp() } }
    @Published var bodyWidthText = "" { didSet { personBodyConfirmed = false; invalidateWarp() } }
    @Published var bodyHeightText = "" { didSet { personBodyConfirmed = false; invalidateWarp() } }
    private let bodyWarpService: LocalPersonBodyWarpService
    @Published var adaptiveBodyRequestText = "" { didSet { adaptiveBodyConfirmed = false; invalidateWarp() } }
    @Published var adaptiveBodyConfirmed = false { didSet { invalidateWarp() } }
    private var adaptiveBodyCandidateActive = false
    func previewAdaptiveBodyRule() async {
        await perform {
            guard self.adaptiveBodyConfirmed, let prepared = self.prepared, let png = self.referencePNG,
                  let asset = self.correctionAsset, let analysis = self.latestAnalysis,
                  let detailed = self.detailedAnalysis, let assignments = self.assignments,
                  let target = self.selectedFaceID, let person = assignments.assignments[target],
                  self.assignmentLookupSucceeded, !self.assignmentRestoreBlocked else { throw PeopleError.noPhoto }
            let request = try LocalAdaptiveBodyWarpService.Request.decode(self.adaptiveBodyRequestText)
            // Approved 2D scope: the user explicitly supplies the current-photo
            // rectangle. Real instance protection below remains mandatory.
            let observedRectangle = request.region.rectangle
            let base = self.currentLocalWarp
            guard self.warpCursor == (base?.operations.count ?? 0) else {
                throw SuiteValidationError.invalidValue("未保存の操作列を先に保存またはリセットしてください")
            }
            self.personBodyEnabled = true; self.bodyInstanceProtectionEnabled = true
            self.personBodyConfirmed = true
            self.manualPartProtectionRequired = false
            let epoch = self.generation, revision = self.warpInputRevision
            let fixedRequest = self.adaptiveBodyRequestText
            let poseBinding = try self.currentBodyPoseBinding()
            let service = LocalAdaptiveBodyWarpService(maskStore:self.bodyMaskStore)
            let candidate = try await service.makeCandidate(rule:request.rule, region:request.region,
                evidence:request.evidence, observedRectangle:observedRectangle, ruleConfirmed:true, referencePNG:png, prepared:prepared,
                analysis:analysis, asset:asset, assignments:assignments,
                intent:.init(personID:person.value, settings:[request.rule.setting]), faceTargetID:target,
                consentedPersonIDs:Set(self.people.map { FaceIdentity.PersonID($0.id) }),
                protection:base?.protectionRectangle, currentRecipe:base, detailed:detailed)
            try Task.checkCancellation()
            guard self.generation == epoch, self.warpInputRevision == revision,
                  self.referencePNG == png, self.currentLocalWarp == base,
                  self.assignments == assignments, self.selectedFaceID == target,
                  self.adaptiveBodyConfirmed, self.adaptiveBodyRequestText == fixedRequest,
                  self.bodyInstanceStillCurrent(candidate), try self.currentBodyPoseBinding() == poseBinding else { throw CancellationError() }
            self.warpOperations = try candidate.recipe.operations.map { try $0.runtimeOperation() }
            self.warpCursor = self.warpOperations.count
            self.warpGroupEnds = Array(1...self.warpCursor); self.updateWarpCounts()
            self.warpPreview = .init(png:candidate.png, recipe:candidate.recipe,
                referencePNGSHA256:SHA256.hash(data:png).map { String(format:"%02x",$0) }.joined())
            self.bodyWarpCandidate = candidate; self.previewBodyPoseBinding = poseBinding
            self.warpCommitRevision = revision; self.warpCommitEpoch = epoch; self.warpCommitPNG = png
            self.adaptiveBodyCandidateActive = true
            return "本人指定の2D領域へ規則を対応しました。実人物mask保護済みの候補・未保存。実寸や距離を推定した結果ではありません。"
        }
    }
    private let bodyMaskStore: LocalBackdropRecipeStore
    private var bodyWarpCandidate: LocalPersonBodyWarpService.Candidate?
    @Published var manualWarpPart: LocalManualPartWarpAdapter.Part = .nose {
        didSet { manualPartRegionProposal = nil; partProposalBinding = nil; manualPartAdjustment = manualWarpPart.isBody ? .width : .size; manualPartStrength = 0; invalidateWarp() }
    }
    @Published var manualPartAdjustment: LocalManualPartWarpAdapter.Adjustment = .size {
        didSet { manualPartStrength = 0; invalidateWarp() }
    }
    @Published var manualPartStrength: Double = 0 {
        didSet {
            manualPartConfirmed = false
            warpAmountText = "0"; warpDXText = "0"; warpDYText = "0"; warpAngleText = "0"
            invalidateWarp()
        }
    }
    private var manualPartProtectionRequired = false
    @Published private(set) var manualPartRegionProposal: LocalManualPartProposal.Region?
    private var partProposalBinding: (epoch: UUID, face: UUID, part: LocalManualPartWarpAdapter.Part, body: UUID?, assignments: PhotoPersonAssignments)?
    private func currentManualPartProposal() throws -> LocalManualPartProposal.Region {
        guard !isBusy, let prepared, let detail = detailedAnalysis,
              detail.assetID == prepared.assetID, detail.originalSHA256 == prepared.originalSHA256,
              detail.analysisSHA256 == prepared.analysisSHA256,
              let target = selectedFaceID, assignmentLookupSucceeded, !assignmentRestoreBlocked,
              assignments?.assignments[target] != nil else { throw PeopleError.noPhoto }
        var body: LocalBodyGeometryService.Body?
        if manualWarpPart == .torso {
            guard let binding = try currentBodyPoseBinding(), let geometry = bodyGeometry else { throw PeopleError.noPhoto }
            body = geometry.bodies.first { $0.id == binding.bodyID }
        }
        return try LocalManualPartProposal.propose(part: manualWarpPart, detail: detail, faceID: target, body: body)
    }
    func proposeManualPartRegion() throws {
        manualPartRegionProposal = nil; partProposalBinding = nil
        let proposal = try currentManualPartProposal()
        guard let face = selectedFaceID, let assignments else { throw PeopleError.noPhoto }
        partProposalBinding = (generation, face, manualWarpPart, selectedBodyID, assignments)
        manualPartRegionProposal = proposal
    }
    func adoptManualPartRegion() throws {
        guard let binding = partProposalBinding, binding.epoch == generation,
              binding.face == selectedFaceID, binding.part == manualWarpPart,
              binding.body == selectedBodyID, binding.assignments == assignments,
              let proposal = manualPartRegionProposal, try currentManualPartProposal() == proposal else {
            throw SuiteValidationError.invalidValue("部位候補が失効しました。現在の解析から再取得してください")
        }
        warpCenterXText = String(proposal.x + proposal.width/2)
        warpCenterYText = String(proposal.y + proposal.height/2)
        warpRadiusXText = String(proposal.width/2); warpRadiusYText = String(proposal.height/2)
        bodyXText = String(proposal.x); bodyYText = String(proposal.y)
        bodyWidthText = String(proposal.width); bodyHeightText = String(proposal.height)
        manualPartStrength = 0; manualPartConfirmed = false; personBodyConfirmed = false
        manualPartRegionProposal = nil; partProposalBinding = nil
    }
    @Published var manualPartConfirmed = false { didSet { invalidateWarp() } }
    private var manualPartBinding: (epoch: UUID, face: UUID, person: FaceIdentity.PersonID, assignments: PhotoPersonAssignments)?
    @Published var warpKind: LocalWarpFieldBuilder.Kind = .translate { didSet { invalidateWarp() } }
    @Published var warpCenterXText = "" { didSet { invalidateWarp() } }
    @Published var warpCenterYText = "" { didSet { invalidateWarp() } }
    @Published var warpRadiusXText = "" { didSet { invalidateWarp() } }
    @Published var warpRadiusYText = "" { didSet { invalidateWarp() } }
    @Published var warpAmountText = "" { didSet { invalidateWarp() } }
    @Published var warpDXText = "" { didSet { invalidateWarp() } }
    @Published var warpDYText = "" { didSet { invalidateWarp() } }
    @Published var warpAngleText = "" { didSet { invalidateWarp() } }
    @Published var warpProtectionEnabled = false { didSet { invalidateWarp() } }
    @Published var warpProtectionXText = "" { didSet { invalidateWarp() } }
    @Published var warpProtectionYText = "" { didSet { invalidateWarp() } }
    @Published var warpProtectionWidthText = "" { didSet { invalidateWarp() } }
    @Published var warpProtectionHeightText = "" { didSet { invalidateWarp() } }
    @Published private(set) var warpPreview: LocalWarpRecipePreview.Result?
    private var warpInputRevision = UUID()
    private let warpService = LocalWarpRecipePreview()
    private var currentLocalWarp: LocalWarpRecipe?
    private var warpBaseInvalid = false
    private var warpCommitRevision: UUID?
    private var warpCommitEpoch: UUID?
    private var warpCommitPNG: Data?
    var canCommitManualWarp: Bool {
        !isBusy && !warpBaseInvalid && warpCursor > 0 && warpPreview != nil &&
            warpCommitRevision == warpInputRevision && warpCommitEpoch == generation && warpCommitPNG == referencePNG
    }
    /// Explicit removal targets the saved base, independently of any unsaved
    /// preview. resetWarpOperations only resets the in-memory editing session.
    var canRemoveSavedWarp: Bool {
        guard !isBusy, !warpBaseInvalid, let base = currentLocalWarp, let prepared else { return false }
        return base.assetID == prepared.assetID && base.originalSHA256 == prepared.originalSHA256
    }
    @Published private(set) var warpOperationCount = 0
    @Published private(set) var warpRedoCount = 0
    private var warpOperations: [LocalWarpFieldBuilder.Operation] = []
    private var warpCursor = 0
    private var warpGroupEnds: [Int] = []
    private var pendingWarpGroup: [LocalWarpFieldBuilder.Operation]?
    private struct WarpCandidate {
        let operations: [LocalWarpFieldBuilder.Operation]
        let epoch: UUID, revision: UUID
        let referencePNG: Data
    }
    private var warpCandidate: WarpCandidate?
    var canAppendWarpCandidate: Bool { !isBusy && warpCandidate != nil && warpPreview != nil && warpCursor < 128 }
    var canUndoWarp: Bool { !isBusy && warpCursor > 0 }
    var canRedoWarp: Bool { !isBusy && warpCursor < warpOperations.count }
    var canPreviewManualWarp: Bool { prepared != nil && referencePNG != nil && !isBusy }
    @Published var manualRetouchEffect: ManualRetouchEffect = .smoothing { didSet { invalidateManualRetouch() } }
    @Published var manualXText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualYText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualWidthText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualHeightText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualProtectionEnabled = false { didSet { invalidateManualRetouch() } }
    @Published var manualProtectionXText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualProtectionYText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualProtectionWidthText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualProtectionHeightText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualStrengthText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualRadiusText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualOffsetXText = "" { didSet { invalidateManualRetouch() } }
    @Published var manualOffsetYText = "" { didSet { invalidateManualRetouch() } }
    @Published private(set) var manualRetouchPreview: LocalRetouchRecipePreview.Result?
    private var manualInputRevision = UUID()
    private let manualRenderer = LocalRetouchRecipePreview()
    private var currentLocalRetouch: LocalRetouchRecipe?
    var canPreviewManualRetouch: Bool { prepared != nil && referencePNG != nil && !isBusy }
    /// Immutable uncropped proxy snapshot for the isolated background preview.
    /// The parent closes this panel when the selected photo changes.
    var backdropPreviewSource: (png: Data, assetID: UUID, sha256: String)? {
        guard !isBusy, let prepared, let referencePNG, let asset = correctionAsset,
              asset.id == prepared.assetID,
              asset.sha256.lowercased() == prepared.originalSHA256.lowercased() else { return nil }
        return (referencePNG, prepared.assetID, prepared.originalSHA256)
    }
    var manualInputWidth: Int { prepared?.inputWidth ?? 0 }
    var manualInputHeight: Int { prepared?.inputHeight ?? 0 }
    enum PeopleError: LocalizedError {
        case noPhoto, noFace, nameRequired, consentRequired, policyRequired, unavailable
        var errorDescription: String? {
            switch self {
            case .noPhoto: return "対象写真を選択してください。"
            case .noFace: return "現在の写真から登録する顔を選択してください。"
            case .nameRequired: return "登録する人物の表示名を入力してください。"
            case .consentRequired: return "対象本人の許可を確認してから登録してください。"
            case .policyRequired: return "照合の閾値・候補差・設定版を入力してください。"
            case .unavailable: return "顔解析ライブラリが未組込みのため、推論はまだ実行できません。"
            }
        }
    }
    @Published private(set) var status = "モデルをローカル導入し、写真を選んで解析してください。"
    @Published private(set) var isBusy = false
    @Published private(set) var faces: [LocalFaceAnalysisService.Face] = []
    @Published private(set) var people: [LocalPersonGalleryStore.Entry] = []
    @Published private(set) var matches: [FaceIdentity.Match] = []
    @Published private(set) var modelStatus: LocalFaceModelStatus.Snapshot?
    @Published private(set) var assignments: PhotoPersonAssignments? { didSet { bodyPersonMapping = nil; bodyMappingAssignments = nil } }
    @Published private(set) var savedAssignments: PhotoPersonAssignments?
    @Published private(set) var assignmentStorageStatus = "写真の解析後に保存済みの人物対応を読み込みます。"
    @Published private(set) var assignmentRestoreBlocked = false
    @Published private(set) var correctionCandidate: PersonFaceBrightnessPlan.Plan?
    @Published private(set) var detailedAnalysis: LocalDetailedPortraitAnalysis.Result? {
        didSet { faceRegionProposal = nil }
    }
    @Published private(set) var faceRegionProposal: LocalFaceRegionProposal.Result?
    @Published var exposureText = "" { didSet { correctionCandidate = nil } }
    @Published var regionIoUText = "" { didSet { correctionCandidate = nil; detailedAnalysis = nil } }
    @Published var regionMarginText = "" { didSet { correctionCandidate = nil; detailedAnalysis = nil } }
    @Published var regionPolicyRevision = "" { didSet { correctionCandidate = nil; detailedAnalysis = nil } }
    @Published var selectedPersonID: UUID? { didSet { correctionCandidate = nil } }
    @Published var selectedFaceID: UUID? {
        didSet { if selectedFaceID != oldValue { registrationConsent = false; personSmoothingRegionConfirmed = false; personBodyConfirmed = false; bodyPersonMapping = nil } }
    }
    @Published var displayName = "" {
        didSet { if displayName != oldValue { registrationConsent = false } }
    }
    @Published var registrationConsent = false
    @Published var thresholdText = ""
    @Published var marginText = ""
    @Published var policyRevision = ""

    var canReloadAssignmentHistory: Bool { latestAnalysis != nil && !isBusy }
    var canResetAssignmentHistory: Bool {
        !isBusy && assignmentLookupSucceeded && assignmentRestoreBlocked
            && latestAnalysis != nil && savedAssignments != nil
            && savedAssignments?.originalSHA256 == latestAnalysis?.originalSHA256
    }

    var nativeAvailable: Bool {
        #if canImport(SuiteFaceCore)
        true
        #else
        false
        #endif
    }
    private let modelStore: LocalAIModelStore
    private let gallery: LocalPersonGalleryStore
    private let analysisService: LocalFaceAnalysisService
    private let correctionService = LocalPersonCorrectionService()
    private let detailedService = LocalDetailedPortraitAnalysis()
    private let faceRegionService = LocalFaceRegionProposal()
    private var prepared: LocalFacePixels.Prepared?
    private var correctionAsset: AssetRecord?
    private var referencePNG: Data?
    private var latestAnalysis: LocalFaceAnalysisService.Analysis?
    private var currentPortrait: PortraitRecipe?
    private var assignmentRevision: UUID?
    private var assignmentLookupSucceeded = false
    private var task: Task<Void, Never>?
    private var generation = UUID()

    init(root: URL) throws {
        bodyMaskStore = try LocalBackdropRecipeStore(root: root)
        bodyWarpService = LocalPersonBodyWarpService(maskStore: bodyMaskStore)
        modelStore = try LocalAIModelStore(root: root.appendingPathComponent("LocalFaceModels", isDirectory: true))
        gallery = try LocalPersonGalleryStore(root: root.appendingPathComponent("LocalPersonGallery", isDirectory: true))
        // Detector thresholds only; these are NOT identity-match acceptance policy.
        analysisService = try LocalFaceAnalysisService(store: modelStore, scoreThreshold: 0.9,
                                                       nmsThreshold: 0.3)
        if !nativeAvailable { status = "顔推論のnativeライブラリ未組込みです。モデル導入と登録一覧の管理は可能です。" }
    }

    /// Photo switch invalidates in-flight inference and previous selections.
    /// No old-photo coordinate or identity decision is carried to the new photo.
    func setPhoto(_ value: LocalFacePixels.Prepared?, asset: AssetRecord? = nil, referencePNG: Data? = nil,
                  currentPortrait: PortraitRecipe? = nil, currentLocalRetouch: LocalRetouchRecipe? = nil,
                  currentLocalWarp: LocalWarpRecipe? = nil) async {
        cancel()
        manualPartProtectionRequired = false; manualPartBinding = nil; manualPartStrength = 0
        manualPartRegionProposal = nil; partProposalBinding = nil
        resetWarpOperations()
        prepared = value
        correctionAsset = asset; self.referencePNG = referencePNG
        self.currentPortrait = currentPortrait
        self.currentLocalRetouch = currentLocalRetouch
        self.currentLocalWarp = currentLocalWarp; warpBaseInvalid = false
        warpProtectionEnabled = false
        if let base = currentLocalWarp {
            do {
                try base.validate()
                guard let value, base.assetID == value.assetID, base.originalSHA256 == value.originalSHA256,
                      value.inputWidth > 0, value.inputHeight > 0,
                      abs(Double(value.inputWidth)/Double(value.inputHeight)-base.referenceAspect)
                        <= 1/Double(base.referenceHeight)+1/Double(value.inputHeight) else {
                    throw SuiteValidationError.invalidValue("warpBasePhoto")
                }
                warpOperations = try base.operations.map { try $0.runtimeOperation() }
                warpCursor = warpOperations.count
                warpGroupEnds = Array(1...warpCursor)
                updateWarpCounts()
                if let rect = base.protectionRectangle {
                    warpProtectionXText = String(rect.x); warpProtectionYText = String(rect.y)
                    warpProtectionWidthText = String(rect.width); warpProtectionHeightText = String(rect.height)
                    warpProtectionEnabled = true
                }
            } catch { warpBaseInvalid = true }
        }
        latestAnalysis = nil; correctionCandidate = nil
        bodyGeometry = nil; selectedBodyID = nil; bodyPersonMapping = nil; bodyMappingAssignments = nil
        assignments = nil; selectedPersonID = nil
        clearAssignmentStorageState()
        faces = []; matches = []; selectedFaceID = nil
        displayName = ""; registrationConsent = false
        let epoch = generation
        await analysisService.beginNewGeneration()
        guard generation == epoch else { return }
        if warpBaseInvalid { status = "保存した手動変形の写真参照が不正です。変形の保存を停止しています。"; return }
        status = value == nil ? "写真が未選択です。" : (nativeAvailable
            ? "写真を受け取りました。解析は明示操作で開始します。"
            : "写真を受け取りました。nativeライブラリ未組込みのため推論はまだ実行できません。")
    }

    func cancel() {
        invalidateWarp()
        invalidateManualRetouch()
        task?.cancel(); task = nil
        detailedAnalysis = nil
        generation = UUID(); isBusy = false
        status = "処理を取り消しました。確定済みのモデル・登録は削除しません。"
    }

    /// Synchronous photo invalidation for EditorModel. No delayed nil-photo Task
    /// can race and clear a subsequently opened photo. Actor work is cancelled
    /// through its owning task; the next setPhoto also advances cache generation.
    func clearPhoto() {
        cancel()
        manualPartProtectionRequired = false; manualPartBinding = nil; manualPartStrength = 0
        manualPartRegionProposal = nil; partProposalBinding = nil
        resetWarpOperations()
        prepared = nil
        correctionAsset = nil; referencePNG = nil; latestAnalysis = nil; correctionCandidate = nil
        bodyGeometry = nil; selectedBodyID = nil; bodyPersonMapping = nil; bodyMappingAssignments = nil
        currentPortrait = nil
        currentLocalRetouch = nil
        currentLocalWarp = nil; warpBaseInvalid = false
        assignments = nil; selectedPersonID = nil
        clearAssignmentStorageState()
        faces = []; matches = []; selectedFaceID = nil
        displayName = ""; registrationConsent = false
        status = "写真が未選択です。"
    }

    func importModel(_ kind: ModelKind, from url: URL) async {
        await perform {
            let manifest = try kind == .yunet ? PinnedFaceModels.yuNet() : PinnedFaceModels.sFace()
            let installed = try await self.modelStore.install(from: url, manifest: manifest)
            return "導入済み: \(installed.modelID)（\(installed.byteCount) bytes、SHA照合済み）。推論動作の確認とは別です。"
        }
        await refreshModelStatus()
    }

    func refreshModelStatus() async {
        await perform {
            let epoch = self.generation
            let snapshot = try await LocalFaceModelStatus.snapshot(store: self.modelStore)
            try Task.checkCancellation()
            guard epoch == self.generation else { throw CancellationError() }
            self.modelStatus = snapshot
            return "モデルの保存状態を更新しました。推論実行や品質確認とは別です。"
        }
    }

    private func clearAssignmentStorageState() {
        savedAssignments = nil; assignmentRevision = nil; assignmentLookupSucceeded = false
        assignmentRestoreBlocked = false
        assignmentStorageStatus = "写真の解析後に保存済みの人物対応を読み込みます。"
    }

    private func freshAssignments(for analysis: LocalFaceAnalysisService.Analysis) throws -> PhotoPersonAssignments {
        try PhotoPersonAssignments(assetID: analysis.assetID, originalSHA256: analysis.originalSHA256,
            analysisVersion: analysis.analysisVersion, analysisSHA256: analysis.analysisSHA256,
            targets: analysis.faces.map(\.target))
    }

    /// Storage failures never become an empty replacement. A changed analysis
    /// preserves the old encrypted record until an explicit reset is confirmed.
    private func acceptAssignments(for analysis: LocalFaceAnalysisService.Analysis) async throws {
        let epoch = generation
        let fresh = try freshAssignments(for: analysis)
        assignmentLookupSucceeded = false
        correctionCandidate = nil
        do {
            let saved = try await gallery.assignmentRecord(assetID: analysis.assetID)
            try Task.checkCancellation()
            guard epoch == generation else { throw CancellationError() }
            savedAssignments = saved?.document; assignmentRevision = saved?.revision
            assignmentLookupSucceeded = true; selectedPersonID = nil
            if let saved {
                do {
                    try saved.document.validate(assetID: analysis.assetID, originalSHA256: analysis.originalSHA256,
                        analysisVersion: analysis.analysisVersion, analysisSHA256: analysis.analysisSHA256,
                        targets: analysis.faces.map(\.target))
                    assignments = saved.document; assignmentRestoreBlocked = false
                    assignmentStorageStatus = "端末内から復元済み：対応 \(saved.document.assignments.count) 件・履歴 \(saved.document.history.count) 件。"
                } catch {
                    assignments = fresh; assignmentRestoreBlocked = true
                    assignmentStorageStatus = "保存済み履歴と今回の解析が一致しません。旧履歴は保持し、適用・上書きを保留しています。"
                }
            } else {
                assignments = fresh; assignmentRestoreBlocked = false
                assignmentStorageStatus = "保存済みの人物対応はありません。明示した対応変更は端末内へ暗号化保存します。"
            }
        } catch {
            if epoch == generation {
                assignments = nil; assignmentRestoreBlocked = true
                assignmentStorageStatus = "保存履歴を読み込めません。空データで上書きせず、人物対応を停止しています。"
            }
            throw error
        }
    }

    func assignSelectedPerson(removing: Bool = false) async {
        await perform {
            guard self.assignmentLookupSucceeded, !self.assignmentRestoreBlocked,
                  let assignments = self.assignments, let selected = self.selectedFaceID,
                  let face = self.faces.first(where: { $0.target.faceTargetID == selected }) else { throw PeopleError.noFace }
            let person: FaceIdentity.PersonID?
            if removing { person = nil }
            else {
                guard let id = self.selectedPersonID, self.people.contains(where: { $0.id == id }) else { throw PeopleError.noFace }
                person = .init(id)
            }
            let next = try assignments.assigning(person, to: face.target, explicitlyConfirmed: true,
                reason: removing ? "user-unassignment" : "user-confirmed-assignment")
            let epoch = self.generation
            self.correctionCandidate = nil
            do {
                let saved = try await self.gallery.saveAssignments(next, expectedRevision: self.assignmentRevision)
                guard epoch == self.generation else { throw CancellationError() }
                self.assignments = saved.document; self.savedAssignments = saved.document
                self.assignmentRevision = saved.revision
                self.assignmentStorageStatus = "人物対応・訂正履歴を端末内へ暗号化保存しました。"
                return "人物対応を保存しました。写真の補正設定は変更していません。"
            } catch {
                if epoch == self.generation { self.assignmentStorageStatus = "変更を保存できませんでした。最後に保存できた人物対応を保持しています。" }
                throw error
            }
        }
    }

    /// Destructive only for this photo's correspondence history, and exposed in
    /// the UI through an explicit confirmation dialog. Gallery/Recipe stay intact.
    func resetAssignmentsToCurrentAnalysis() async {
        await perform {
            guard self.assignmentLookupSucceeded, self.assignmentRestoreBlocked,
                  let analysis = self.latestAnalysis, let previous = self.savedAssignments,
                  previous.originalSHA256 == analysis.originalSHA256 else { throw PeopleError.noPhoto }
            let fresh = try self.freshAssignments(for: analysis)
            let epoch = self.generation
            let saved = try await self.gallery.saveAssignments(fresh, expectedRevision: self.assignmentRevision,
                                                               replacingAnalysis: true)
            guard epoch == self.generation else { throw CancellationError() }
            self.assignments = saved.document; self.savedAssignments = saved.document
            self.assignmentRevision = saved.revision; self.assignmentRestoreBlocked = false
            self.correctionCandidate = nil; self.selectedPersonID = nil
            self.assignmentStorageStatus = "現在の解析で人物対応履歴を作り直しました。元写真と編集履歴は変更していません。"
            return self.assignmentStorageStatus
        }
    }

    func reloadAssignmentHistory() async {
        await perform {
            guard let analysis = self.latestAnalysis else { throw PeopleError.noPhoto }
            let epoch = self.generation
            let people = try await self.gallery.snapshot()
            try Task.checkCancellation()
            guard epoch == self.generation else { throw CancellationError() }
            try await self.acceptAssignments(for: analysis)
            guard epoch == self.generation else { throw CancellationError() }
            self.people = people
            return self.assignmentStorageStatus
        }
    }

    func proposeFaceRegions() async {
        await perform {
            self.faceRegionProposal = nil
            guard let detailed = self.detailedAnalysis else { throw PeopleError.noFace }
            let epoch = self.generation
            let policy = [self.regionIoUText, self.regionMarginText, self.regionPolicyRevision]
            let result = try await self.faceRegionService.propose(detailed)
            try Task.checkCancellation()
            guard epoch == self.generation,
                  self.detailedAnalysis?.assetID == detailed.assetID,
                  self.detailedAnalysis?.analysisVersion == detailed.analysisVersion,
                  self.detailedAnalysis?.analysisSHA256 == detailed.analysisSHA256,
                  policy == [self.regionIoUText, self.regionMarginText, self.regionPolicyRevision] else {
                throw CancellationError()
            }
            self.faceRegionProposal = result
            return "顔内の幾何候補 \(result.proposals.count) 件・保留 \(result.pending.count) 件。肌・しわ・傷跡の認識や補正はしていません。"
        }
    }

    func analyzeDetailedRegions() async {
        await perform {
            self.detailedAnalysis = nil
            guard let prepared = self.prepared, let asset = self.correctionAsset,
                  let png = self.referencePNG, let analysis = self.latestAnalysis else { throw PeopleError.noPhoto }
            let iouText = self.regionIoUText, marginText = self.regionMarginText
            let revision = self.regionPolicyRevision
            guard let iou = Double(iouText), let margin = Double(marginText),
                  !revision.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw PeopleError.policyRequired
            }
            let epoch = self.generation
            let policy = FaceRegionAssociation.Policy(revision: revision, minimumIoU: iou, minimumMargin: margin)
            let result = try await self.detailedService.analyze(referencePNG: png, prepared: prepared,
                analysis: analysis, asset: asset, analysisVersion: analysis.analysisVersion, policy: policy)
            try Task.checkCancellation()
            guard epoch == self.generation, self.latestAnalysis?.analysisVersion == analysis.analysisVersion,
                  self.regionIoUText == iouText, self.regionMarginText == marginText,
                  self.regionPolicyRevision == revision else { throw CancellationError() }
            self.detailedAnalysis = result
            return "詳細領域 \(result.faces.count) 件・保留 \(result.associations.count - result.faces.count) 件。解析用写真の結果で、補正・保存はしていません。"
        }
    }

    func prepareBrightnessCandidate() async {
        await perform {
            guard self.assignmentLookupSucceeded, !self.assignmentRestoreBlocked,
                  let prepared = self.prepared, let asset = self.correctionAsset,
                  let png = self.referencePNG, let analysis = self.latestAnalysis,
                  let assignments = self.assignments else { throw PeopleError.noPhoto }
            guard let personID = self.selectedPersonID, let ev = Double(self.exposureText),
                  let iou = Double(self.regionIoUText), let margin = Double(self.regionMarginText),
                  !self.regionPolicyRevision.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw PeopleError.policyRequired
            }
            let policy = FaceRegionAssociation.Policy(revision: self.regionPolicyRevision,
                minimumIoU: iou, minimumMargin: margin)
            let epoch = self.generation
            self.correctionCandidate = nil
            let people = try await self.gallery.snapshot()
            try Task.checkCancellation()
            guard epoch == self.generation else { throw CancellationError() }
            let candidate = try await self.correctionService.makePlan(referencePNG: png, prepared: prepared,
                analysis: analysis, asset: asset, assignments: assignments,
                analysisVersion: assignments.analysisVersion,
                intents: [.init(personID: .init(personID), exposureEV: ev)], policy: policy,
                consentedPersonIDs: Set(people.map { FaceIdentity.PersonID($0.id) }),
                currentPortrait: self.currentPortrait)
            try Task.checkCancellation()
            guard epoch == self.generation else { throw CancellationError() }
            self.correctionCandidate = candidate
            return "顔明度の候補 \(candidate.resolved.count) 件・保留 \(candidate.pending.count) 件。編集への適用・保存はしていません。"
        }
    }

    /// Called only by the editor's explicit Apply action. No save or render here.
    /// Rechecks enrollment after asynchronous work, before handing off a candidate.
    func confirmedBrightnessCandidate() async throws -> PortraitRecipe {
        guard !isBusy, assignmentLookupSucceeded, !assignmentRestoreBlocked,
              let candidate = correctionCandidate, !candidate.resolved.isEmpty,
              candidate.pending.isEmpty, let assignments, let asset = correctionAsset else {
            throw PeopleError.noFace
        }
        let epoch = generation
        let expectedRevision = assignmentRevision
        let people = try await gallery.snapshot()
        let saved = try await gallery.assignmentRecord(assetID: asset.id)
        try Task.checkCancellation()
        guard epoch == generation, !isBusy,
              self.assignments == assignments,
              correctionCandidate?.candidatePortrait == candidate.candidatePortrait else {
            throw CancellationError()
        }
        guard let saved, saved.revision == expectedRevision, saved.document == assignments else {
            correctionCandidate = nil
            assignmentStorageStatus = "保存済みの人物対応が別の操作で変更されました。履歴を再読み込みしてください。"
            throw PeopleError.noFace
        }
        let ids = Set(people.map { FaceIdentity.PersonID($0.id) })
        guard candidate.resolved.allSatisfy({ ids.contains($0.personID)
            && assignments.assignments[$0.photoFaceTargetID] == $0.personID }) else {
            throw PeopleError.noFace
        }
        try candidate.candidatePortrait.validate(asset: asset)
        if let currentPortrait { try candidate.candidatePortrait.validate(against: currentPortrait) }
        return candidate.candidatePortrait
    }

    func analyze() async {
        await perform {
            self.detailedAnalysis = nil
            guard self.nativeAvailable else { throw PeopleError.unavailable }
            guard let prepared = self.prepared else { throw PeopleError.noPhoto }
            let epoch = self.generation
            let result = try await self.analysisService.analyze(prepared)
            try Task.checkCancellation()
            guard epoch == self.generation else { throw CancellationError() }
            self.latestAnalysis = result; self.correctionCandidate = nil
            self.faces = result.faces; self.matches = []
            self.selectedFaceID = nil; self.registrationConsent = false
            try await self.acceptAssignments(for: result)
            return "顔検出 \(result.faces.count) 件。人物登録・照合・補正はまだ実行していません。"
        }
    }

    func refreshPeople() async {
        await perform {
            let epoch = self.generation
            let entries = try await self.gallery.snapshot()
            try Task.checkCancellation()
            guard epoch == self.generation else { throw CancellationError() }
            self.people = entries
            return "端末内の登録人物: \(entries.count) 件。"
        }
    }

    func enrollSelected() async {
        await perform {
            guard self.registrationConsent else { throw PeopleError.consentRequired }
            guard let selected = self.selectedFaceID,
                  let face = self.faces.first(where: { $0.target.faceTargetID == selected }),
                  let prepared = self.prepared,
                  let analysis = self.latestAnalysis,
                  analysis.assetID == prepared.assetID,
                  analysis.originalSHA256 == prepared.originalSHA256,
                  analysis.analysisSHA256 == prepared.analysisSHA256,
                  analysis.analysisWidth == prepared.width, analysis.analysisHeight == prepared.height,
                  analysis.inputWidth == prepared.inputWidth, analysis.inputHeight == prepared.inputHeight,
                  analysis.faces.filter({ $0.target.faceTargetID == selected }).count == 1,
                  analysis.faces.first(where: { $0.target.faceTargetID == selected })?.embedding == face.embedding,
                  face.target.assetID == prepared.assetID,
                  face.target.originalSHA256 == prepared.originalSHA256 else { throw PeopleError.noFace }
            let name = self.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !name.isEmpty else { throw PeopleError.nameRequired }
            let consent = LocalPersonGalleryStore.Consent(purpose: "local-cross-photo-face-matching",
                                                          explanationVersion: "1", confirmedAt: Date())
            let epoch = self.generation
            let source = LocalPersonGalleryStore.EnrollmentSource(assetID: prepared.assetID,
                originalSHA256: prepared.originalSHA256, analysisSHA256: prepared.analysisSHA256,
                analysisVersion: analysis.analysisVersion, faceTargetID: selected,
                modelSHA256: face.embedding.modelSHA256,
                preprocessingVersion: face.embedding.preprocessingVersion, dimension: face.embedding.dimension)
            let entry = try await self.gallery.enroll(displayName: name, embeddings: [face.embedding],
                                                     sources: [source], consent: consent, permissionConfirmed: true)
            // Enrollment is an explicit durable action. A cancellation after its
            // commit does not roll it back or cause a duplicate automatic retry.
            if epoch == self.generation {
                self.registrationConsent = false
                self.people.removeAll { $0.id == entry.id }; self.people.append(entry)
                self.matches = []
            }
            return "端末内へ人物を登録しました。写真の補正は変更していません。"
        }
    }

    func deletePerson(id: UUID) async {
        await perform {
            let epoch = self.generation
            try await self.gallery.remove(id: id)
            if epoch == self.generation {
                self.people.removeAll { $0.id == id }
                self.assignments = nil; self.selectedPersonID = nil
                self.correctionCandidate = nil
                self.matches = []
                self.registrationConsent = false
                self.clearAssignmentStorageState()
                if let analysis = self.latestAnalysis {
                    try await self.acceptAssignments(for: analysis)
                }
            }
            return "指定人物と、その人物を含む写真対応記録を削除しました。原本写真と編集履歴は変更していません。"
        }
    }

    func matchPeople() async {
        await perform {
            self.detailedAnalysis = nil
            guard self.nativeAvailable else { throw PeopleError.unavailable }
            guard let prepared = self.prepared else { throw PeopleError.noPhoto }
            guard let threshold = Double(self.thresholdText), let margin = Double(self.marginText),
                  !self.policyRevision.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw PeopleError.policyRequired
            }
            let policy = try FaceIdentity.Policy(revision: self.policyRevision,
                modelSHA256: PinnedFaceModels.sFaceSHA256,
                preprocessingVersion: PinnedFaceModels.recognizerPreprocessingVersion,
                dimension: 128, threshold: threshold, margin: margin)
            let epoch = self.generation
            let entries = try await self.gallery.snapshot()
            try Task.checkCancellation()
            guard epoch == self.generation else { throw CancellationError() }
            let templates = entries.flatMap { entry in
                entry.embeddings.map { FaceIdentity.GalleryEntry(personID: .init(entry.id), embedding: $0) }
            }
            let result = try await self.analysisService.match(prepared, gallery: templates, policy: policy)
            try Task.checkCancellation()
            guard epoch == self.generation else { throw CancellationError() }
            self.people = entries; self.faces = result.analysis.faces; self.matches = result.matches
            self.latestAnalysis = result.analysis; self.correctionCandidate = nil
            self.selectedFaceID = nil; self.registrationConsent = false
            try await self.acceptAssignments(for: result.analysis)
            let matched = result.matches.filter { if case .matched = $0.decision { return true }; return false }.count
            let ambiguous = result.matches.filter { if case .ambiguous = $0.decision { return true }; return false }.count
            return "指定閾値で候補 \(matched) 件、曖昧 \(ambiguous) 件、不明 \(result.matches.count - matched - ambiguous) 件。精度保証・自動補正ではありません。"
        }
    }

    private func invalidateManualRetouch() {
        personSmoothingCandidate = nil
        manualInputRevision = UUID(); manualRetouchPreview = nil
    }

    private func invalidateWarp() {
        adaptiveBodyCandidateActive = false
        warpedBodyJoints = []
        bodyWarpCandidate = nil
        previewBodyPoseBinding = nil
        warpInputRevision = UUID(); warpPreview = nil; warpCandidate = nil
        pendingWarpGroup = nil
        warpCommitRevision = nil; warpCommitEpoch = nil; warpCommitPNG = nil
    }

    func previewManualWarp() async {
        await previewWarp(includeCandidate: true)
    }
    /// Prepares only; the existing preview, explicit append, Undo and CAS save
    /// remain mandatory. A label is never passed off as detected anatomy.
    func prepareManualPartWarp() throws {
        guard canPreviewManualWarp, !isBusy, !warpBaseInvalid,
              manualPartConfirmed, assignmentLookupSucceeded, !assignmentRestoreBlocked,
              let assignments, let face = selectedFaceID, let person = assignments.assignments[face],
              people.contains(where: { $0.id == person.value }),
              let x = Double(warpCenterXText), let y = Double(warpCenterYText),
              let rx = Double(warpRadiusXText), let ry = Double(warpRadiusYText), let prepared,
              rx * Double(prepared.inputWidth) >= 1, ry * Double(prepared.inputHeight) >= 1 else {
            throw SuiteValidationError.invalidValue("manualPartRegion")
        }
        let operation = try LocalManualPartWarpAdapter.operation(part: manualWarpPart,
            adjustment: manualPartAdjustment, centerX: x, centerY: y,
            radiusX: rx, radiusY: ry, strength: manualPartStrength)
        // Nose/eyes use the manual face-region route, never a body intent.
        if !manualWarpPart.isBody { personBodyEnabled = false }
        if manualWarpPart.isBody { bodyInstanceProtectionEnabled = true }
        manualPartProtectionRequired = true
        manualPartBinding = (generation, face, person, assignments)
        personBodyConfirmed = false
        warpKind = operation.kind
        warpAmountText = String(operation.amount); warpDXText = String(operation.dx)
        warpDYText = String(operation.dy); warpAngleText = String(operation.angle)
    }
    /// Original upright image, normalized top-left coordinates only. Prepares
    /// A bounded translate group; preview and explicit addition remain required.
    func prepareWarpDrag(startX: Double, startY: Double, endX: Double, endY: Double) throws {
        guard canPreviewManualWarp, !isBusy, !warpBaseInvalid, let prepared,
              (1...1600).contains(prepared.inputWidth), (1...1600).contains(prepared.inputHeight),
              [startX,startY,endX,endY].allSatisfy({ $0.isFinite && (0...1).contains($0) }),
              let rx = Double(warpRadiusXText), let ry = Double(warpRadiusYText),
              rx.isFinite, ry.isFinite, rx > 0, rx <= 1, ry > 0, ry <= 1,
              rx * Double(prepared.inputWidth) >= 1, ry * Double(prepared.inputHeight) >= 1,
              rx * Double(currentLocalWarp?.referenceWidth ?? prepared.inputWidth) >= 1,
              ry * Double(currentLocalWarp?.referenceHeight ?? prepared.inputHeight) >= 1 else {
            throw SuiteValidationError.invalidValue("手動変形の写真・ドラッグ座標・半径を確認してください")
        }
        let dx = (endX-startX)/(rx*0.18), dy = (endY-startY)/(ry*0.18)
        guard dx != 0 || dy != 0 else { throw SuiteValidationError.invalidValue("ドラッグの移動量がありません") }
        let required = ceil(max(abs(dx), abs(dy)))
        guard dx.isFinite, dy.isFinite, required <= Double(128 - warpCursor) else {
            throw SuiteValidationError.invalidValue("分割後の総操作数が128を超えます。半径を広げるか移動を短くしてください")
        }
        let count = max(1, Int(required))
        let group = try (0..<count).map { index in
            try LocalWarpFieldBuilder.Operation(kind: .translate,
                center: .init(x: startX + (endX - startX) * Double(index) / Double(count),
                              y: startY + (endY - startY) * Double(index) / Double(count)),
                rx: rx, ry: ry, amount: 0, dx: dx / Double(count), dy: dy / Double(count), angle: 0)
        }
        warpKind = .translate
        warpCenterXText = String(startX); warpCenterYText = String(startY)
        warpAmountText = "0"; warpDXText = String(dx / Double(count)); warpDYText = String(dy / Double(count)); warpAngleText = "0"
        pendingWarpGroup = group
    }
    func previewCurrentWarpOperations() async {
        await previewWarp(includeCandidate: false)
    }
    func appendWarpCandidate() throws {
        guard canAppendWarpCandidate, let candidate = warpCandidate,
              candidate.epoch == generation, candidate.revision == warpInputRevision,
              candidate.referencePNG == referencePNG else { throw SuiteValidationError.invalidValue("staleWarpCandidate") }
        guard !candidate.operations.isEmpty, warpCursor + candidate.operations.count <= 128 else {
            throw SuiteValidationError.invalidValue("warpOperationLimit")
        }
        warpGroupEnds = warpGroupEnds.filter { $0 <= warpCursor }
        warpOperations = Array(warpOperations.prefix(warpCursor)) + candidate.operations
        warpCursor += candidate.operations.count; warpGroupEnds.append(warpCursor)
        updateWarpCounts(); invalidateWarp()
    }
    func undoWarpOperation() {
        guard canUndoWarp else { return }
        warpCursor = warpGroupEnds.last(where: { $0 < warpCursor }) ?? 0
        updateWarpCounts(); invalidateWarp()
    }
    func redoWarpOperation() {
        guard canRedoWarp else { return }
        warpCursor = warpGroupEnds.first(where: { $0 > warpCursor }) ?? warpOperations.count
        updateWarpCounts(); invalidateWarp()
    }
    func resetWarpOperations() {
        guard !isBusy else { return }
        warpOperations = []; warpGroupEnds = []; warpCursor = 0; updateWarpCounts(); invalidateWarp()
    }
    private func updateWarpCounts() {
        warpOperationCount = warpCursor; warpRedoCount = warpOperations.count - warpCursor
    }
    private func previewWarp(includeCandidate: Bool) async {
        await perform {
            self.warpPreview = nil; self.warpCandidate = nil
            self.warpCommitRevision = nil; self.warpCommitEpoch = nil; self.warpCommitPNG = nil
            guard !self.warpBaseInvalid else { throw SuiteValidationError.invalidValue("warpInvalidBase") }
            guard let prepared = self.prepared, let png = self.referencePNG else { throw PeopleError.noPhoto }
            let epoch = self.generation, inputRevision = self.warpInputRevision
            func number(_ text: String) throws -> Double {
                guard let value = Double(text), value.isFinite else { throw SuiteValidationError.invalidValue("manualWarpNumber") }
                return value
            }
            let candidateOperations: [LocalWarpFieldBuilder.Operation]
            if includeCandidate {
                guard self.warpCursor < 128 else { throw SuiteValidationError.invalidValue("warpOperationLimit") }
                if let group = self.pendingWarpGroup { candidateOperations = group }
                else { candidateOperations = [try LocalWarpFieldBuilder.Operation(kind: self.warpKind,
                center: .init(x: number(self.warpCenterXText), y: number(self.warpCenterYText)),
                rx: number(self.warpRadiusXText), ry: number(self.warpRadiusYText),
                amount: number(self.warpAmountText), dx: number(self.warpDXText),
                dy: number(self.warpDYText), angle: number(self.warpAngleText))] }
            } else { candidateOperations = [] }
            let operations = Array(self.warpOperations.prefix(self.warpCursor)) + candidateOperations
            guard operations.count <= 128 else { throw SuiteValidationError.invalidValue("warpOperationLimit") }
            let w = prepared.inputWidth, h = prepared.inputHeight
            guard (1...1600).contains(w), (1...1600).contains(h) else { throw SuiteValidationError.invalidValue("manualWarpSize") }
            let base = self.currentLocalWarp
            var protection: LocalRetouchRecipe.Rectangle?
            if self.warpProtectionEnabled {
                let rect = try LocalRetouchRecipe.Rectangle(x: number(self.warpProtectionXText), y: number(self.warpProtectionYText),
                    width: number(self.warpProtectionWidthText), height: number(self.warpProtectionHeightText))
                protection = rect
            }
            let savedOperations = try operations.map { op -> LocalWarpRecipe.Operation in
                guard let kind = LocalWarpRecipe.Operation.Kind(rawValue: op.kind.rawValue) else { throw SuiteValidationError.invalidValue("warpKind") }
                return try .init(kind: kind, center: .init(x: op.center.x, y: op.center.y),
                    rx: op.rx, ry: op.ry, amount: op.amount, dx: op.dx, dy: op.dy, angle: op.angle)
            }
            var recipe = try LocalWarpRecipe(assetID: prepared.assetID, originalSHA256: prepared.originalSHA256,
                referenceWidth: base?.referenceWidth ?? w, referenceHeight: base?.referenceHeight ?? h,
                operations: savedOperations, protectionRectangle: protection, bodyMask: base?.bodyMask)
            let result: LocalWarpRecipePreview.Result
            var bodyCandidate: LocalPersonBodyWarpService.Candidate?
            let poseBinding = try self.currentBodyPoseBinding()
            if self.personBodyEnabled {
                guard self.assignmentLookupSucceeded, !self.assignmentRestoreBlocked,
                      let analysis = self.latestAnalysis, let asset = self.correctionAsset,
                      let assignments = self.assignments, let target = self.selectedFaceID,
                      let person = assignments.assignments[target], self.personBodyConfirmed else { throw PeopleError.noPhoto }
                let prefix = base?.operations ?? []
                guard savedOperations.count > prefix.count,
                      Array(savedOperations.prefix(prefix.count)) == prefix else {
                    throw SuiteValidationError.invalidValue("人物補正では保存済操作を保持して新しい操作を追加してください")
                }
                let region = try LocalRetouchRecipe.Rectangle(x: number(self.bodyXText), y: number(self.bodyYText),
                    width: number(self.bodyWidthText), height: number(self.bodyHeightText))
                // The explicit intent value is recorded, never converted into
                // guessed geometry; the separately reviewed operations are exact.
                let setting = RetouchSetting(control: self.personBodyControl,
                    strength: try .init(level: .custom, customValue: number(self.bodyIntentValueText)))
                let bound = try await self.bodyWarpService.makeCandidate(referencePNG: png, prepared: prepared,
                    analysis: analysis, asset: asset, assignments: assignments,
                    intent: .init(personID: person.value, settings: [setting]), setting: setting, faceTargetID: target,
                    consentedPersonIDs: Set(self.people.map { FaceIdentity.PersonID($0.id) }),
                    manualRegionConfirmed: self.personBodyConfirmed, manualRegion: region,
                    operations: Array(savedOperations.dropFirst(prefix.count)), protection: protection, currentRecipe: base,
                    detailed: self.bodyInstanceProtectionEnabled ? self.detailedAnalysis : nil)
                guard self.bodyInstanceStillCurrent(bound) else { throw CancellationError() }
                guard self.assignments == assignments, self.selectedFaceID == target,
                      self.personBodyConfirmed else { throw CancellationError() }
                bodyCandidate = bound
                result = .init(png: bound.png, recipe: bound.recipe,
                    referencePNGSHA256: SHA256.hash(data: png).map { String(format: "%02x", $0) }.joined())
            } else {
                let maskBytes: Data?
                if self.manualPartProtectionRequired {
                    // Explicitly selected face -> measured instance; no facial
                    // region is inferred and no body intent is fabricated.
                    guard let binding = self.manualPartBinding, binding.epoch == self.generation,
                          self.manualPartConfirmed, self.assignments == binding.assignments,
                          self.selectedFaceID == binding.face,
                          let detailed = self.detailedAnalysis, let target = self.selectedFaceID,
                          detailed.assetID == prepared.assetID,
                          detailed.originalSHA256 == prepared.originalSHA256,
                          detailed.analysisSHA256 == prepared.analysisSHA256,
                          detailed.faces.filter({ $0.target.faceTargetID == target }).count == 1,
                          let face = detailed.faces.first(where: { $0.target.faceTargetID == target }),
                          detailed.masks.filter({ $0.instanceID == face.personInstanceID }).count == 1,
                          let mask = detailed.masks.first(where: { $0.instanceID == face.personInstanceID }),
                          mask.width == w, mask.height == h, mask.bottomUpLuminance8.count == w*h else {
                        throw SuiteValidationError.invalidValue("部位変形には現在の詳細解析と対象人物の選択が必要です")
                    }
                    let bottom = [UInt8](mask.bottomUpLuminance8)
                    var top = [UInt8](repeating: 0, count: bottom.count)
                    for y in 0..<h {
                        try Task.checkCancellation()
                        for x in 0..<w { top[y*w+x] = bottom[(h-1-y)*w+x] }
                    }
                    let bytes = Data(top)
                    let digest = try await self.bodyMaskStore.install(mask: bytes)
                    guard self.selectedFaceID == target,
                          self.detailedAnalysis?.analysisSHA256 == detailed.analysisSHA256,
                          self.detailedAnalysis?.analysisVersion == detailed.analysisVersion else { throw CancellationError() }
                    let ref = try LocalBackdropRecipe.MaskReference(sha256: digest, width: w, height: h, byteCount: bytes.count)
                    guard recipe.bodyMask == nil || recipe.bodyMask == ref else {
                        throw SuiteValidationError.invalidValue("保存済みの人物保護maskを変更できません")
                    }
                    recipe = try LocalWarpRecipe(assetID: recipe.assetID, originalSHA256: recipe.originalSHA256,
                        referenceWidth: recipe.referenceWidth, referenceHeight: recipe.referenceHeight,
                        operations: recipe.operations, protectionRectangle: recipe.protectionRectangle, bodyMask: ref)
                    maskBytes = bytes
                } else if let ref = recipe.bodyMask {
                    maskBytes = try await self.bodyMaskStore.bytes(sha256: ref.sha256, expectedCount: ref.byteCount)
                } else { maskBytes = nil }
                result = try await self.warpService.render(referencePNG: png, prepared: prepared, recipe: recipe,
                                                          bodyMaskBytes: maskBytes)
            }
            try Task.checkCancellation()
            guard self.generation == epoch, self.warpInputRevision == inputRevision,
                  self.referencePNG == png, self.prepared?.assetID == prepared.assetID,
                  self.prepared?.originalSHA256 == prepared.originalSHA256,
                  self.prepared?.analysisSHA256 == prepared.analysisSHA256,
                  self.prepared?.inputWidth == w, self.prepared?.inputHeight == h,
                  self.prepared?.width == prepared.width, self.prepared?.height == prepared.height,
                  self.prepared?.stride == prepared.stride,
                  self.prepared?.preprocessingVersion == prepared.preprocessingVersion,
                  self.prepared?.bgr == prepared.bgr, self.currentLocalWarp == base else { throw CancellationError() }
            var transformed: [LocalBodyGeometryService.Joint] = []
            if self.personBodyEnabled, let poseBinding, let geometry = self.bodyGeometry {
                transformed = try await self.bodyGeometryService.transformedJoints(geometry,
                    bodyID: poseBinding.bodyID, recipe: result.recipe)
            }
            guard self.generation == epoch, self.warpInputRevision == inputRevision,
                  self.currentLocalWarp == base,
                  try self.currentBodyPoseBinding() == poseBinding else { throw CancellationError() }
            self.warpPreview = result
            self.bodyWarpCandidate = bodyCandidate
            self.warpedBodyJoints = transformed
            self.previewBodyPoseBinding = poseBinding
            if includeCandidate {
                self.warpCandidate = WarpCandidate(operations: candidateOperations, epoch: epoch, revision: inputRevision, referencePNG: png)
            } else {
                self.warpCommitRevision = inputRevision; self.warpCommitEpoch = epoch; self.warpCommitPNG = png
            }
            return "手動変形の未保存プレビューです。原本・編集履歴・他のマスクには適用していません。"
        }
    }

    func confirmedManualWarpCandidate() async throws -> LocalWarpRecipe {
        guard !adaptiveBodyCandidateActive || adaptiveBodyConfirmed else { throw PeopleError.noPhoto }
        guard canCommitManualWarp, let preview = warpPreview, let prepared,
              preview.recipe.assetID == prepared.assetID,
              preview.recipe.originalSHA256 == prepared.originalSHA256,
              preview.recipe.operations.count == warpCursor else { throw SuiteValidationError.invalidValue("warpStaleCandidate") }
        try preview.recipe.validate()
        if manualPartProtectionRequired {
            guard let binding = manualPartBinding, binding.epoch == generation, manualPartConfirmed,
                  selectedFaceID == binding.face, assignments == binding.assignments,
                  preview.recipe.bodyMask != nil else { throw PeopleError.noPhoto }
            let revision = warpInputRevision, savedRevision = assignmentRevision
            let record = try await gallery.assignmentRecord(assetID: prepared.assetID)
            let members = try await gallery.snapshot()
            try Task.checkCancellation()
            guard canCommitManualWarp, binding.epoch == generation, revision == warpInputRevision,
                  manualPartConfirmed, selectedFaceID == binding.face, assignments == binding.assignments,
                  record?.revision == savedRevision, record?.document == binding.assignments,
                  members.contains(where: { $0.id == binding.person.value }) else { throw CancellationError() }
        }
        if let base = currentLocalWarp {
            guard preview.recipe.referenceWidth == base.referenceWidth,
                  preview.recipe.referenceHeight == base.referenceHeight else { throw SuiteValidationError.invalidValue("warpReferenceChanged") }
        }
        if personBodyEnabled {
            guard try currentBodyPoseBinding() == previewBodyPoseBinding else { throw PeopleError.noPhoto }
            guard let bound = bodyWarpCandidate, bound.recipe == preview.recipe,
                  bound.baseRecipe == currentLocalWarp, bound.assignments == assignments,
                  selectedFaceID == bound.faceTargetID, personBodyConfirmed,
                  assignmentLookupSucceeded, !assignmentRestoreBlocked,
                  bodyInstanceStillCurrent(bound) else { throw PeopleError.noPhoto }
            let epoch = generation, revision = warpInputRevision, savedRevision = assignmentRevision
            let stored = try await gallery.assignmentRecord(assetID: prepared.assetID)
            let members = try await gallery.snapshot()
            try Task.checkCancellation()
            guard try currentBodyPoseBinding() == previewBodyPoseBinding,
                  bodyInstanceStillCurrent(bound) else { throw CancellationError() }
            guard canCommitManualWarp, epoch == generation, revision == warpInputRevision,
                  stored?.revision == savedRevision, stored?.document == bound.assignments,
                  assignments == bound.assignments, currentLocalWarp == bound.baseRecipe,
                  selectedFaceID == bound.faceTargetID, personBodyConfirmed,
                  members.contains(where: { $0.id == bound.personID.value }) else { throw CancellationError() }
        }
        return preview.recipe
    }

    func previewManualRetouch() async {
        await perform {
            self.manualRetouchPreview = nil
            self.personSmoothingCandidate = nil
            guard let prepared = self.prepared, let png = self.referencePNG else { throw PeopleError.noPhoto }
            let epoch = self.generation, settings = self.manualInputRevision
            let w = prepared.inputWidth, h = prepared.inputHeight
            guard (1...1600).contains(w), (1...1600).contains(h) else {
                throw SuiteValidationError.invalidValue("manualRetouchDimensions")
            }
            let base = self.currentLocalRetouch
            if let base {
                try base.validate()
                guard base.assetID == prepared.assetID, base.originalSHA256 == prepared.originalSHA256,
                      abs(Double(w) / Double(h) - base.referenceAspect)
                        <= 1 / Double(base.referenceHeight) + 1 / Double(h) else {
                    throw SuiteValidationError.invalidValue("manualRetouchBaseBinding")
                }
            }
            let rw = base?.referenceWidth ?? w, rh = base?.referenceHeight ?? h
            func rectangle(_ xText: String, _ yText: String, _ widthText: String, _ heightText: String) throws -> LocalRetouchRecipe.Rectangle {
                guard let x = Double(xText), let y = Double(yText), let width = Double(widthText), let height = Double(heightText),
                      [x, y, width, height].allSatisfy(\.isFinite), x >= 0, y >= 0,
                      width > 0, height > 0, x + width <= 1, y + height <= 1 else {
                    throw SuiteValidationError.invalidValue("manualRetouchRectangle")
                }
                return try .init(x: x, y: y, width: width, height: height)
            }
            let selected = try rectangle(self.manualXText, self.manualYText, self.manualWidthText, self.manualHeightText)
            let protection: LocalRetouchRecipe.Rectangle?
            if self.manualProtectionEnabled {
                protection = try rectangle(self.manualProtectionXText, self.manualProtectionYText,
                                      self.manualProtectionWidthText, self.manualProtectionHeightText)
            } else { protection = nil }
            guard let strength = Double(self.manualStrengthText) else { throw SuiteValidationError.invalidValue("manualRetouchStrength") }
            let effect: LocalRetouchRecipe.Effect
            switch self.manualRetouchEffect {
            case .smoothing:
                guard let radius = Double(self.manualRadiusText), radius.isFinite,
                      radius > 0, radius <= 32 else { throw SuiteValidationError.invalidValue("manualRetouchRadius") }
                effect = try .init(kind: .skinSmoothing, strength: strength,
                    radiusReferencePixels: radius / min(Double(w) / Double(rw), Double(h) / Double(rh)))
            case .clone:
                guard let x = Int(self.manualOffsetXText), let y = Int(self.manualOffsetYText) else {
                    throw SuiteValidationError.invalidValue("manualRetouchOffset")
                }
                effect = try .init(kind: .localRepair, strength: strength,
                    sourceOffsetX: Double(x) / Double(w), sourceOffsetY: Double(y) / Double(h))
            }
            let layer = try LocalRetouchRecipe.Layer(selection: selected, protection: protection, effect: effect)
            let recipe = try LocalRetouchRecipe(assetID: prepared.assetID, originalSHA256: prepared.originalSHA256,
                referenceWidth: rw, referenceHeight: rh, layers: (base?.layers ?? []) + [layer])
            let result: LocalRetouchRecipePreview.Result
            var bound: LocalPersonSkinSmoothingService.Candidate?
            if self.personSmoothingEnabled {
                guard self.assignmentLookupSucceeded,
                      !self.assignmentRestoreBlocked, let analysis = self.latestAnalysis,
                      let asset = self.correctionAsset, let assignments = self.assignments,
                      let target = self.selectedFaceID, let person = assignments.assignments[target] else { throw PeopleError.noPhoto }
                let radius = self.manualRetouchEffect == .smoothing ? (Double(self.manualRadiusText) ?? .nan) : 0
                let value = try await self.personSmoothingService.makeCandidate(referencePNG: png, prepared: prepared,
                    analysis: analysis, asset: asset, assignments: assignments, personID: person, faceTargetID: target,
                    consentedPersonIDs: Set(self.people.map { FaceIdentity.PersonID($0.id) }),
                    regionConfirmed: self.personSmoothingRegionConfirmed, selection: selected, protection: protection,
                    strength: strength, radiusInputPixels: radius, currentRecipe: base,
                    repairEffect: self.manualRetouchEffect == .clone ? effect : nil)
                guard self.assignments == assignments, self.selectedFaceID == target,
                      self.personSmoothingRegionConfirmed else { throw CancellationError() }
                bound = value; result = .init(png: value.png, recipe: value.recipe)
            } else {
                result = try await self.manualRenderer.render(referencePNG: png, prepared: prepared, recipe: recipe)
            }
            try Task.checkCancellation()
            guard self.generation == epoch, self.manualInputRevision == settings,
                  self.prepared?.analysisSHA256 == prepared.analysisSHA256,
                  self.referencePNG == png, self.currentLocalRetouch == base else { throw CancellationError() }
            self.manualRetouchPreview = result
            self.personSmoothingCandidate = bound
            return "手動局所補正のプレビューを作成しました。原本・編集履歴には未適用です。"
        }
    }

    func confirmedManualRetouchCandidate() async throws -> LocalRetouchRecipe {
        guard !isBusy, let preview = manualRetouchPreview, let prepared,
              referencePNG != nil, preview.recipe.assetID == prepared.assetID,
              preview.recipe.originalSHA256 == prepared.originalSHA256 else { throw PeopleError.noPhoto }
        try preview.recipe.validate()
        let oldLayers = currentLocalRetouch?.layers ?? []
        guard preview.recipe.layers.count == oldLayers.count + 1,
              Array(preview.recipe.layers.prefix(oldLayers.count)) == oldLayers else {
            throw SuiteValidationError.invalidValue("manualRetouchStaleCandidate")
        }
        if personSmoothingEnabled {
            guard let bound = personSmoothingCandidate, bound.recipe == preview.recipe,
                  bound.baseRecipe == currentLocalRetouch, bound.assignments == assignments,
                  selectedFaceID == bound.faceTargetID, personSmoothingRegionConfirmed,
                  assignmentLookupSucceeded, !assignmentRestoreBlocked else { throw PeopleError.noPhoto }
            let epoch = generation, settings = manualInputRevision, revision = assignmentRevision
            let saved = try await gallery.assignmentRecord(assetID: prepared.assetID)
            let currentPeople = try await gallery.snapshot()
            try Task.checkCancellation()
            guard epoch == generation, settings == manualInputRevision,
                  saved?.revision == revision, saved?.document == bound.assignments,
                  assignments == bound.assignments, currentLocalRetouch == bound.baseRecipe,
                  selectedFaceID == bound.faceTargetID, personSmoothingRegionConfirmed,
                  currentPeople.contains(where: { $0.id == bound.personID.value }) else { throw CancellationError() }
        }
        return preview.recipe
    }

    private func perform(_ operation: @escaping @MainActor () async throws -> String) async {
        guard !isBusy else { return }
        let epoch = generation
        isBusy = true
        let running = Task { @MainActor [weak self] in
            do {
                try Task.checkCancellation()
                let message = try await operation()
                guard let self, self.generation == epoch else { return }
                self.status = message
            } catch {
                guard let self, self.generation == epoch else { return }
                self.status = error is CancellationError ? "取り消しました。" : "未完了: \((error as? LocalizedError)?.errorDescription ?? String(describing: error))"
            }
            guard let self, self.generation == epoch else { return }
            self.isBusy = false; self.task = nil
        }
        task = running
        await withTaskCancellationHandler { await running.value } onCancel: { running.cancel() }
    }
}
