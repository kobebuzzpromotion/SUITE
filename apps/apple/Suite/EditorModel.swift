import Foundation
import Combine
import UIKit
import SuiteCore
import METISMobileCore
import CryptoKit

@MainActor
final class EditorModel: ObservableObject {
    @Published var assets: [AssetRecord] = []
    @Published var selectedAsset: AssetRecord?
    @Published var preview: UIImage?
    @Published var parameters = RecipeParameters()
    @Published var isBusy = false
    @Published var errorMessage: String?
    @Published var statusMessage = "ローカル編集の開発版。クラウド同期は未接続です。"
    @Published var isComparing = false
    @Published var showImporter = false
    @Published var shareURL: URL?
    @Published var isExporting = false
    @Published var allowLargePrintResampling = false
    @Published var showCropExport = false
    @Published var cropPreview: UIImage?
    @Published var sourcePixels: PixelDimensions?
    @Published var batchShareURLs: [URL] = []
    @Published var batchResults: [String] = []
    @Published var portraitReferencePreview: UIImage?
    @Published var selectedPortraitTargetID: UUID?
    @Published private(set) var localPeople: LocalPeopleModel?
    private(set) var localBackdropStore: LocalBackdropAssetStore?
    private(set) var localBackdropRecipeStore: LocalBackdropRecipeStore?
    private(set) var localGenerationCandidateStore: LocalGenerationCandidateStore?
    private(set) var generationAuthorizationStore: GenerationAuthorizationStore?
    private(set) var generationResponseAdapter: GenerationResponseCandidateAdapter?
    var localGenerationRecipeRevision: Int? { localPeopleCheckpoint?.revision }
    @Published private(set) var localPeopleReference: UIImage?
    @Published private(set) var isPreparingLocalPeople = false
    @Published var showLocalPeople = false
    private var localPeopleSetupError: String?
    private var localPeopleTask: Task<Void, Never>?
    private var localPeopleGeneration = UUID()
    private var localPeopleCheckpoint: ProjectCheckpoint?
    private var localPeopleBasePortrait: PortraitRecipe?
    private var localPeopleApplyTask: Task<Void, Never>?
    private var isApplyingLocalPeople = false
    private var partialLookLease: UUID?
    private var tetherRecoveryLease: UUID?
    private var storageRoot: URL?
    var tetherRecoveryContext: TetherLocalRecoveryModel.Context? {
        guard let root = storageRoot, let projects = store, let pipeline else { return nil }
        let lease = UUID()
        return .init(root: root, projects: projects, pipeline: pipeline, proxyLongEdge: 1600,
            beginOperation: { [weak self] in
                guard let self, !self.isBusy, !self.isExporting, !self.saveFailed,
                      self.pendingSaves == 0, self.tetherRecoveryLease == nil else { return false }
                self.tetherRecoveryLease = lease; self.isBusy = true
                return true
            }, endOperation: { [weak self] in
                guard let self, self.tetherRecoveryLease == lease else { return }
                self.tetherRecoveryLease = nil; self.isBusy = false
            }, onChanged: { [weak self] in
                guard let self, self.tetherRecoveryLease == lease else { return }
                let selected = self.selectedAsset
                do {
                    let records = try await projects.list()
                    let saved: ProjectCheckpoint?
                    if let selected { saved = try await projects.load(id: selected.id) }
                    else { saved = nil }
                    guard self.tetherRecoveryLease == lease, self.selectedAsset == selected else { return }
                    self.assets = records.map(\.asset)
                    if let saved, saved != self.checkpoint {
                        self.closeLocalPeople()
                        self.checkpoint = saved; self.selectedAsset = saved.asset
                        self.parameters = saved.history.current; self.isComparing = false
                        self.preview = nil; self.portraitReferencePreview = nil; self.selectedPortraitTargetID = nil
                        self.refreshPreview()
                    }
                } catch {
                    self.errorMessage = "撮影キュー処理後の表示を再読込できません。保存済み記録は保持しています: \(error.localizedDescription)"
                }
            }, onArrival: { [weak self] assetID in
                guard let self, self.tetherRecoveryLease == lease else { return }
                do {
                    guard let saved = try await projects.load(id: assetID) else {
                        throw PhotoPipelineError.proxyUnavailable
                    }
                    guard self.tetherRecoveryLease == lease else { return }
                    // The host's acknowledged delivery identifies this exact
                    // durable asset. Never select by filename or arrival time.
                    self.invalidatePortraitSelection()
                    self.previewTask?.cancel(); self.previewGeneration = UUID()
                    self.checkpoint = saved; self.selectedAsset = saved.asset
                    self.parameters = saved.history.current; self.isComparing = false
                    self.preview = nil; self.portraitReferencePreview = nil
                    self.selectedPortraitTargetID = nil
                    self.refreshPreview()
                } catch {
                    self.errorMessage = "受信原本は保持しましたが表示を更新できません：\(error.localizedDescription)"
                }
            })
    }
    struct PartialLookContext {
        let checkpoint: ProjectCheckpoint
        let projects: ProjectStore
        let validateCurrent: @MainActor (ProjectCheckpoint) async -> Bool
        let beginApply: @MainActor () -> Bool
        let endApply: @MainActor () -> Void
        let onApplied: @MainActor (ProjectCheckpoint) -> Void
    }
    var partialLookContext: PartialLookContext? {
        guard let fixed = localPeopleCheckpoint, let projects = store else { return nil }
        let epoch = localPeopleGeneration, lease = UUID()
        let current: @MainActor () -> Bool = { [weak self] in
            guard let self else { return false }
            return self.showLocalPeople && self.localPeopleGeneration == epoch &&
                self.checkpoint == fixed && self.parameters == fixed.history.current &&
                self.selectedAsset == fixed.asset && !self.saveFailed && self.pendingSaves == 0 &&
                !self.isExporting && (!self.isBusy || self.partialLookLease == lease)
        }
        return PartialLookContext(checkpoint: fixed, projects: projects,
            validateCurrent: { input in input == fixed && current() },
            beginApply: { [weak self] in
                guard let self, current(), !self.isBusy, self.partialLookLease == nil else { return false }
                self.partialLookLease = lease; self.isBusy = true
                return true
            }, endApply: { [weak self] in
                guard let self, self.partialLookLease == lease else { return }
                self.partialLookLease = nil; self.isBusy = false
            }, onApplied: { [weak self] saved in
                guard let self, self.partialLookLease == lease, saved.asset == fixed.asset,
                      saved.revision >= fixed.revision else { return }
                // A dismissed sheet can still have completed an atomic receipt.
                // With the editor write lease held, refresh that same input only.
                guard self.checkpoint == fixed, self.parameters == fixed.history.current,
                      self.selectedAsset == fixed.asset else { return }
                self.closeLocalPeople()
                self.checkpoint = saved; self.parameters = saved.history.current
                self.isComparing = false; self.preview = nil
                self.portraitReferencePreview = nil; self.selectedPortraitTargetID = nil
                self.refreshPreview()
            })
    }
    private var checkpoint: ProjectCheckpoint?
    private var store: ProjectStore?
    private var pipeline: PhotoPipeline?
    private var transfer: CloudTransferCoordinator?
    private var generationBackend: SuiteBackendClient?
    var canConnectServerGeneration: Bool { generationBackend != nil && transfer != nil }
    private var previewTask: Task<Void, Never>?
    private var saveTask: Task<Void, Never>?
    private var exportTask: Task<Void, Never>?
    private var previewGeneration = UUID()
    private var pendingSaves = 0
    private var saveFailed = false
    private var unsavedCheckpoints: [ProjectCheckpoint] = []
    private var loaded = false
    var canUndo: Bool { checkpoint?.history.canUndo == true && !saveFailed }
    var canRedo: Bool { checkpoint?.history.canRedo == true && !saveFailed }
    var canRetrySave: Bool { saveFailed && !isBusy }
    var canRetryLoad: Bool { !loaded && !isBusy }
    var canSyncSelected: Bool { transfer != nil && selectedAsset != nil && !isBusy && !saveFailed }
    var portraitTargets: [PortraitFaceTarget] { (try? parameters.portraitRecipe())?.targets ?? [] }
    var selectedPortraitTarget: PortraitFaceTarget? {
        portraitTargets.first { $0.id == selectedPortraitTargetID }
    }

    /// Internal, backward-compatible test DI. The application still uses its existing default directory.
    init(backend: SuiteBackendClient? = nil, storageRoot: URL? = nil) {
        do {
            let root: URL
            if let storageRoot {
                guard storageRoot.isFileURL else { throw SuiteValidationError.invalidValue("localStorageRoot") }
                root = storageRoot.standardizedFileURL
            } else {
                let support = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
                root = support.appendingPathComponent("SUITE")
            }
            try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
            self.storageRoot = root.resolvingSymlinksInPath()
            store = try ProjectStore(directory: root.appendingPathComponent("Recipes"))
            pipeline = PhotoPipeline(root: root)
            // Failure in the optional identity store must not disable ordinary editing.
            do { localPeople = try LocalPeopleModel(root: root.resolvingSymlinksInPath()) }
            catch { localPeopleSetupError = "端末内人物登録を開けません: \(error.localizedDescription)" }
            // Optional background storage must not prevent ordinary photo editing.
            localBackdropStore = try? LocalBackdropAssetStore(
                root: root.resolvingSymlinksInPath().appendingPathComponent("LocalBackdrops", isDirectory: true))
            localBackdropRecipeStore = try? LocalBackdropRecipeStore(root: root.resolvingSymlinksInPath())
            localGenerationCandidateStore = try? LocalGenerationCandidateStore(root: root.resolvingSymlinksInPath())
            generationAuthorizationStore = try? GenerationAuthorizationStore(root: root.resolvingSymlinksInPath())
            generationResponseAdapter = try? GenerationResponseCandidateAdapter(root: root.resolvingSymlinksInPath())
            if let backend {transfer = CloudTransferCoordinator(client: backend, root: root); generationBackend = backend}
        } catch { errorMessage = "保存領域を開けません: \(error.localizedDescription)" }
    }

    func load() async {
        guard !loaded, !isBusy, let store else { return }
        loaded = true
        isBusy = true
        invalidatePortraitSelection()
        var firstAsset: AssetRecord?
        do {
            let records = try await store.list()
            assets = records.map(\.asset)
            firstAsset = assets.first
        } catch {
            loaded = false
            invalidatePortraitSelection()
            errorMessage = "保存データを復元できません。原本・記録は保持しています: \(error.localizedDescription)"
        }
        // Release the list gate before select acquires its own gate; no MainActor suspension in between.
        isBusy = false
        if let firstAsset { select(firstAsset) }
    }

    func select(_ asset: AssetRecord) {
        guard !isBusy, !saveFailed, let store else { return }
        allowLargePrintResampling = false
        isBusy = true
        invalidatePortraitSelection()
        previewTask?.cancel()
        previewGeneration = UUID()
        Task {
            await saveTask?.value
            defer { isBusy = false }
            guard !saveFailed else { return }
            do {
                guard let saved = try await store.load(id: asset.id) else { throw PhotoPipelineError.proxyUnavailable }
                checkpoint = saved
                selectedAsset = saved.asset
                parameters = saved.history.current
                isComparing = false
                preview = nil
                portraitReferencePreview = nil
                selectedPortraitTargetID = nil
                errorMessage = nil
                refreshPreview()
            } catch {
                invalidatePortraitSelection()
                errorMessage = error.localizedDescription
            }
        }
    }

    func importFile(_ url: URL) {
        guard !isBusy, !saveFailed, let store, let pipeline else { return }
        allowLargePrintResampling = false
        isBusy = true
        invalidatePortraitSelection()
        errorMessage = nil
        statusMessage = "原本を保持してProxyを作成中"
        Task {
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() }; isBusy = false }
            do {
                await saveTask?.value
                guard !saveFailed else { return }
                let edge = proxyLongEdge()
                guard edge > 0 else { throw PhotoPipelineError.resourcesUnavailable }
                let asset = try await pipeline.importFile(url, proxyLongEdge: edge)
                let saved = ProjectCheckpoint(asset: asset, history: EditHistory(), revision: 0)
                try await store.save(saved, expectedRevision: nil)
                assets.insert(asset, at: 0)
                checkpoint = saved
                selectedAsset = asset
                parameters = saved.history.current
                isComparing = false
                preview = nil
                portraitReferencePreview = nil
                selectedPortraitTargetID = nil
                statusMessage = "端末に保存済み・クラウド未同期"
                refreshPreview()
            } catch {
                invalidatePortraitSelection()
                errorMessage = error.localizedDescription
                statusMessage = "読み込みを完了できませんでした"
            }
        }
    }

    func setExposure(_ value: Double) { var p = parameters; p.exposure = value; edit(p) }
    func setContrast(_ value: Double) { var p = parameters; p.contrast = value; edit(p) }
    func setSaturation(_ value: Double) { var p = parameters; p.saturation = value; edit(p) }
    /// Ordinary user-triggered analysis uses only the selected photo's local proxy.
    /// The upright reference intentionally ignores global rotation/crop so anchors are never transformed twice.
    func preparePortraitTargets() {
        guard !isBusy, !saveFailed, let asset = selectedAsset, let pipeline else { return }
        let fixedParameters = parameters
        let fixedHistory = checkpoint?.history
        isBusy = true
        errorMessage = nil
        statusMessage = "この写真の顔と人物マスクをProxyで確認中"
        invalidatePortraitSelection()
        Task {
            defer { isBusy = false }
            do {
                let portrait: PortraitRecipe
                let isNew: Bool
                if let saved = try fixedParameters.portraitRecipe() {
                    try saved.validate(asset: asset)
                    try await pipeline.validatePortraitTargets(asset: asset, portrait: saved)
                    portrait = saved
                    isNew = false
                } else {
                    // Undo may leave the earlier analysis in the redo branch. Reuse its photo-local identities;
                    // do not assign fresh UUIDs or silently restore the abandoned branch's brightness values.
                    if let fixedHistory, let remembered = try PortraitPipeline.neutralPortrait(from: fixedHistory, asset: asset) {
                        portrait = remembered
                        try await pipeline.validatePortraitTargets(asset: asset, portrait: portrait)
                    } else {
                        portrait = try await pipeline.analyzePortrait(asset: asset)
                    }
                    isNew = true
                }
                let data = try await pipeline.preview(asset: asset, parameters: RecipeParameters())
                try Task.checkCancellation()
                guard !saveFailed, selectedAsset?.id == asset.id, parameters == fixedParameters,
                      let reference = UIImage(data: data) else { throw PhotoPipelineError.proxyUnavailable }
                portraitReferencePreview = reference
                selectedPortraitTargetID = nil // Explicit selection is required before a CUSTOM value can be edited.
                if isNew {
                    let next = try fixedParameters.settingPortrait(portrait)
                    // edit() rejects isBusy by design. This successful, fixed-asset operation uses the same history/CAS path.
                    guard var history = checkpoint?.history else { throw PhotoPipelineError.unsupportedRecipe }
                    history.apply(next)
                    commit(history)
                } else {
                    statusMessage = "対象の顔を選び、CUSTOM EVを指定してください"
                }
            } catch {
                invalidatePortraitSelection()
                errorMessage = error.localizedDescription
                statusMessage = "人物補正の対象確認を完了できませんでした・編集内容は保持"
            }
        }
    }
    func selectPortraitTarget(_ id: UUID) {
        guard !isBusy, !saveFailed, portraitReferencePreview != nil, portraitTargets.contains(where: { $0.id == id }) else {
            // An invalid/unknown request must never leave an earlier person implicitly active.
            selectedPortraitTargetID = nil
            return
        }
        selectedPortraitTargetID = id
    }
    private func invalidatePortraitSelection() {
        closeLocalPeople()
        portraitReferencePreview = nil
        selectedPortraitTargetID = nil
    }

    func openLocalPeople() {
        guard !isBusy, !saveFailed, !isPreparingLocalPeople,
              let asset = selectedAsset, let pipeline else { return }
        guard let localPeople else {
            errorMessage = localPeopleSetupError ?? "人物登録の保存領域が未設定です。"
            return
        }
        closeLocalPeople()
        guard let fixedCheckpoint = checkpoint, fixedCheckpoint.asset.id == asset.id,
              fixedCheckpoint.asset.sha256 == asset.sha256,
              fixedCheckpoint.history.current == parameters else { return }
        let fixedParameters = parameters
        let epoch = localPeopleGeneration
        isPreparingLocalPeople = true
        localPeopleTask = Task {
            defer {
                if epoch == localPeopleGeneration {
                    isPreparingLocalPeople = false
                    localPeopleTask = nil
                }
            }
            do {
                await saveTask?.value
                try Task.checkCancellation()
                guard !saveFailed, epoch == localPeopleGeneration,
                      checkpoint == fixedCheckpoint, parameters == fixedParameters else { throw CancellationError() }
                let basePortrait = try fixedParameters.portraitRecipe()
                    ?? PortraitPipeline.neutralPortrait(from: fixedCheckpoint.history, asset: asset)
                if let basePortrait { try basePortrait.validate(asset: asset) }
                let input = try await pipeline.prepareLocalPeople(asset: asset)
                try Task.checkCancellation()
                guard epoch == localPeopleGeneration, selectedAsset?.id == asset.id,
                      selectedAsset?.sha256 == asset.sha256,
                      !saveFailed, checkpoint == fixedCheckpoint, parameters == fixedParameters,
                      let reference = UIImage(data: input.referencePNG), reference.imageOrientation == .up,
                      reference.cgImage?.width == input.pixels.inputWidth,
                      reference.cgImage?.height == input.pixels.inputHeight else { throw CancellationError() }
                await localPeople.setPhoto(input.pixels, asset: asset, referencePNG: input.referencePNG,
                                           currentPortrait: basePortrait,
                                           currentLocalRetouch: try fixedParameters.localRetouchRecipe(),
                                           currentLocalWarp: try fixedParameters.localWarpRecipe())
                try Task.checkCancellation()
                guard epoch == localPeopleGeneration, selectedAsset?.id == asset.id,
                      selectedAsset?.sha256 == asset.sha256, !saveFailed,
                      checkpoint == fixedCheckpoint, parameters == fixedParameters else { throw CancellationError() }
                localPeopleCheckpoint = fixedCheckpoint
                localPeopleBasePortrait = basePortrait
                localPeopleReference = reference
                showLocalPeople = true
            } catch is CancellationError {
                // Selection changed or this explicit operation was dismissed.
            } catch {
                if epoch == localPeopleGeneration { errorMessage = "人物登録用の写真を開けません: \(error.localizedDescription)" }
            }
        }
    }

    func closeLocalPeople() {
        localPeopleTask?.cancel(); localPeopleTask = nil
        localPeopleApplyTask?.cancel(); localPeopleApplyTask = nil
        if isApplyingLocalPeople && partialLookLease == nil { isBusy = false }
        isApplyingLocalPeople = false
        localPeopleCheckpoint = nil
        localPeopleBasePortrait = nil
        localPeopleGeneration = UUID()
        isPreparingLocalPeople = false
        showLocalPeople = false
        localPeopleReference = nil
        localPeople?.clearPhoto()
    }

    /// Only the user's confirmed preview enters the existing edit/Undo/CAS path.
    /// The snapshot includes redo history, so even an edit-then-undo invalidates it.
    func applyLocalManualRetouch() {
        guard showLocalPeople, !isBusy, !saveFailed, !isApplyingLocalPeople,
              let localPeople, let fixed = localPeopleCheckpoint,
              checkpoint == fixed, parameters == fixed.history.current,
              selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else { return }
        let epoch = localPeopleGeneration
        isApplyingLocalPeople = true; isBusy = true
        localPeopleApplyTask = Task {
            defer {
                if epoch == localPeopleGeneration {
                    isApplyingLocalPeople = false; isBusy = false; localPeopleApplyTask = nil
                }
            }
            do {
                await saveTask?.value
                try Task.checkCancellation()
                guard !saveFailed, epoch == localPeopleGeneration, showLocalPeople,
                      checkpoint == fixed, parameters == fixed.history.current,
                      selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else {
                    throw CancellationError()
                }
                let candidate = try await localPeople.confirmedManualRetouchCandidate()
                try Task.checkCancellation()
                guard !saveFailed, epoch == localPeopleGeneration, showLocalPeople,
                      checkpoint == fixed, parameters == fixed.history.current,
                      selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else {
                    throw CancellationError()
                }
                try candidate.validate(asset: fixed.asset)
                let previous = try fixed.history.current.localRetouchRecipe()
                let priorLayers = previous?.layers ?? []
                guard candidate.layers.count == priorLayers.count + 1,
                      Array(candidate.layers.prefix(priorLayers.count)) == priorLayers else {
                    throw SuiteValidationError.invalidValue("localRetouchExistingLayersChanged")
                }
                if let previous {
                    guard candidate.referenceWidth == previous.referenceWidth,
                          candidate.referenceHeight == previous.referenceHeight else {
                        throw SuiteValidationError.invalidValue("localRetouchReferenceChanged")
                    }
                }
                let next = try fixed.history.current.settingLocalRetouch(candidate)
                // No suspension: consume the one-shot candidate before editing.
                closeLocalPeople()
                edit(next)
            } catch is CancellationError {
                // Stale photo/settings never become a saved edit.
            } catch {
                if epoch == localPeopleGeneration {
                    errorMessage = "局所補正を適用できません。編集内容は保持しています: \(error.localizedDescription)"
                }
            }
        }
    }

    /// Persist only the snapshot confirmed in the background preview. Asset
    /// storage completed before this callback; editing uses the existing Undo/CAS.
    func applyLocalBackdrop(_ candidate: LocalBackdropRecipe) {
        guard showLocalPeople, !isBusy, !saveFailed, !isApplyingLocalPeople,
              let fixed = localPeopleCheckpoint,
              checkpoint == fixed, parameters == fixed.history.current,
              selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else { return }
        let epoch = localPeopleGeneration
        isApplyingLocalPeople = true; isBusy = true
        localPeopleApplyTask = Task {
            defer {
                if epoch == localPeopleGeneration {
                    isApplyingLocalPeople = false; isBusy = false; localPeopleApplyTask = nil
                }
            }
            do {
                await saveTask?.value
                try Task.checkCancellation()
                guard !saveFailed, epoch == localPeopleGeneration, showLocalPeople,
                      checkpoint == fixed, parameters == fixed.history.current,
                      selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else {
                    throw CancellationError()
                }
                try candidate.validate(asset: fixed.asset)
                let next = try fixed.history.current.settingLocalBackdrop(candidate)
                // Consume the panel before committing; no await between these calls.
                closeLocalPeople()
                edit(next)
            } catch is CancellationError {
                // The new immutable mask may remain unreferenced; never remove
                // it here because another saved history may already reference it.
            } catch {
                if epoch == localPeopleGeneration {
                    errorMessage = "背景合成を保存できません。現在の編集は保持しています: \(error.localizedDescription)"
                }
            }
        }
    }

    /// Candidate ID is also the immutable background asset ID, so the stored
    /// Recipe resolves to its fixed provenance record without a second schema.
    /// Only binds a local, unsubmitted request to the currently saved photo.
    /// The request screen separately validates its frozen price/payload and
    /// explicit consent. This does not authenticate an external price provider.
    func generationAuthorizationValidation(inputData: Data) -> GenerationAuthorizationCoordinator.HostValidation {
        let fixed = localPeopleCheckpoint
        let epoch = localPeopleGeneration
        let digest = SHA256.hash(data: inputData).map { String(format: "%02x", $0) }.joined()
        return { [weak self] authorization in
            await MainActor.run {
                guard let self, let fixed, self.showLocalPeople,
                      self.localPeopleGeneration == epoch,
                      self.localPeopleCheckpoint == fixed, self.checkpoint == fixed,
                      self.selectedAsset?.id == fixed.asset.id,
                      self.selectedAsset?.sha256 == fixed.asset.sha256,
                      self.parameters == fixed.history.current,
                      !self.isBusy, !self.isExporting, !self.saveFailed,
                      self.pendingSaves == 0, !self.isApplyingLocalPeople,
                      self.localPeople?.isBusy == false,
                      authorization.inputSHA256 == digest else { return false }
                return true
            }
        }
    }

    func prepareServerGeneration(inputData: Data) async throws -> ServerGenerationLaunchView.Session {
        guard let backend = generationBackend, let transfer, let root = storageRoot,
              let fixed = localPeopleCheckpoint, showLocalPeople else { throw ServerGenerationClient.Failure.unconfigured }
        let epoch = localPeopleGeneration
        let digest = ServerGenerationClient.sha(inputData)
        let localValid: @MainActor () -> Bool = { [weak self] in
            guard let self, self.showLocalPeople, self.localPeopleGeneration == epoch,
                  self.localPeopleCheckpoint == fixed, self.checkpoint == fixed,
                  self.parameters == fixed.history.current, self.selectedAsset?.id == fixed.asset.id,
                  self.selectedAsset?.sha256 == fixed.asset.sha256, !self.isBusy, !self.isExporting,
                  !self.saveFailed, !self.isApplyingLocalPeople, self.pendingSaves == 0,
                  self.localPeople?.isBusy == false,
                  let source = self.localPeople?.backdropPreviewSource,
                  source.assetID == fixed.asset.id, source.sha256 == fixed.asset.sha256,
                  ServerGenerationClient.sha(source.png) == digest else { return false }
            return true
        }
        guard localValid() else { throw ServerGenerationClient.Failure.stale }
        let remote = try await transfer.generationBinding(for:fixed)
        let client = try await backend.generationClient()
        guard localValid() else { throw ServerGenerationClient.Failure.stale }
        return .init(client:client,binding:remote,journalRoot:root,
            validateCurrent:{
                guard localValid() else { return false }
                let checked = try await transfer.generationBinding(for:fixed)
                return localValid() && checked == remote
            })
    }

    func applyGenerationBackdrop(_ id: UUID, _ recipe: LocalBackdropRecipe) {
        guard let store = localGenerationCandidateStore, let fixed = localPeopleCheckpoint,
              showLocalPeople, !isBusy, !isApplyingLocalPeople, !isExporting, !saveFailed,
              localPeople?.isBusy == false, checkpoint == fixed,
              parameters == fixed.history.current, selectedAsset?.id == fixed.asset.id,
              selectedAsset?.sha256 == fixed.asset.sha256 else { return }
        let epoch = localPeopleGeneration
        isApplyingLocalPeople = true; isBusy = true
        localPeopleApplyTask = Task {
            defer {
                if epoch == localPeopleGeneration {
                    isApplyingLocalPeople = false; isBusy = false; localPeopleApplyTask = nil
                }
            }
            do {
                await saveTask?.value
                try Task.checkCancellation()
                let handed = try await store.handoff(id: id, assetID: fixed.asset.id,
                    originalSHA256: fixed.asset.sha256, recipeRevision: fixed.revision, acceptanceConfirmed: true)
                try Task.checkCancellation()
                guard !saveFailed, epoch == localPeopleGeneration, checkpoint == fixed, showLocalPeople,
                      localPeopleCheckpoint == fixed, parameters == fixed.history.current,
                      selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256,
                      recipe.background.assetID == id,
                      recipe.background.sha256 == handed.background.expectedSHA256,
                      recipe.background.version == handed.background.version,
                      recipe.background.byteCount == handed.background.expectedByteCount,
                      recipe.background.width == handed.background.width,
                      recipe.background.height == handed.background.height,
                      recipe.maskSHA256 == handed.candidate.subjectMask.sha256,
                      recipe.maskWidth == handed.candidate.subjectMask.width,
                      recipe.maskHeight == handed.candidate.subjectMask.height,
                      recipe.maskByteCount == handed.candidate.subjectMask.byteCount,
                      recipe.finalMask == nil else { throw CancellationError() }
                try recipe.validate(asset: fixed.asset)
                let next = try fixed.history.current.settingLocalBackdrop(recipe)
                // Same Undo/CAS path as ordinary backdrop adoption, with no
                // suspension between the last version check and consumption.
                closeLocalPeople()
                edit(next)
            } catch { if epoch == localPeopleGeneration { errorMessage = "生成候補は採用できません: \(error.localizedDescription)" } }
        }
    }

    var canRemoveLocalBackdrop: Bool {
        guard showLocalPeople, !isBusy, !saveFailed, !isApplyingLocalPeople,
              let localPeople, !localPeople.isBusy, let fixed = localPeopleCheckpoint,
              checkpoint == fixed, parameters == fixed.history.current,
              selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256,
              let backdrop = try? fixed.history.current.localBackdropRecipe() else { return false }
        return backdrop.assetID == fixed.asset.id && backdrop.originalSHA256 == fixed.asset.sha256.lowercased()
    }

    /// Undoable recipe removal only. Immutable background/mask files and old
    /// history remain available to Undo/Redo and other saved versions.
    func removeLocalBackdrop() {
        guard canRemoveLocalBackdrop, let localPeople, let fixed = localPeopleCheckpoint else { return }
        let epoch = localPeopleGeneration
        isApplyingLocalPeople = true; isBusy = true
        localPeopleApplyTask = Task {
            defer {
                if epoch == localPeopleGeneration {
                    isApplyingLocalPeople = false; isBusy = false; localPeopleApplyTask = nil
                }
            }
            do {
                await saveTask?.value
                try Task.checkCancellation()
                guard !saveFailed, !localPeople.isBusy, epoch == localPeopleGeneration, showLocalPeople,
                      checkpoint == fixed, parameters == fixed.history.current,
                      selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else {
                    throw CancellationError()
                }
                guard let previous = try fixed.history.current.localBackdropRecipe() else { return }
                try previous.validate(asset: fixed.asset)
                var next = fixed.history.current
                next.extendedParameters.removeValue(forKey: "localBackdrop")
                try next.validate()
                closeLocalPeople()
                edit(next)
            } catch is CancellationError {
                // Changed photo/settings cannot remove another photo's backdrop.
            } catch {
                if epoch == localPeopleGeneration {
                    errorMessage = "保存済み背景を解除できません。編集内容は保持しています: \(error.localizedDescription)"
                }
            }
        }
    }

    /// Persist the confirmed session result, including its explicit undo/reset choices.
    func applyLocalManualWarp() {
        guard showLocalPeople, !isBusy, !saveFailed, !isApplyingLocalPeople,
              let localPeople, let fixed = localPeopleCheckpoint,
              checkpoint == fixed, parameters == fixed.history.current,
              selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else { return }
        let epoch = localPeopleGeneration
        isApplyingLocalPeople = true; isBusy = true
        localPeopleApplyTask = Task {
            defer {
                if epoch == localPeopleGeneration {
                    isApplyingLocalPeople = false; isBusy = false; localPeopleApplyTask = nil
                }
            }
            do {
                await saveTask?.value
                try Task.checkCancellation()
                guard !saveFailed, epoch == localPeopleGeneration, showLocalPeople,
                      checkpoint == fixed, parameters == fixed.history.current,
                      selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else {
                    throw CancellationError()
                }
                let candidate = try await localPeople.confirmedManualWarpCandidate()
                try Task.checkCancellation()
                guard !saveFailed, epoch == localPeopleGeneration, showLocalPeople,
                      checkpoint == fixed, parameters == fixed.history.current,
                      selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else {
                    throw CancellationError()
                }
                try candidate.validate(asset: fixed.asset)
                if let previous = try fixed.history.current.localWarpRecipe() {
                    guard candidate.referenceWidth == previous.referenceWidth,
                          candidate.referenceHeight == previous.referenceHeight else {
                        throw SuiteValidationError.invalidValue("localWarpReferenceChanged")
                    }
                }
                let next = try fixed.history.current.settingLocalWarp(candidate)
                // No suspension between consuming the candidate and existing Undo/CAS commit.
                closeLocalPeople()
                edit(next)
            } catch is CancellationError {
                // Stale photo/settings never become a saved edit.
            } catch {
                if epoch == localPeopleGeneration {
                    errorMessage = "手動変形を適用できません。編集内容は保持しています: \(error.localizedDescription)"
                }
            }
        }
    }

    /// Explicit removal is a new reversible edit, not deletion of saved history or photos.
    func removeLocalManualWarp() {
        guard showLocalPeople, !isBusy, !saveFailed, !isApplyingLocalPeople,
              let localPeople, !localPeople.isBusy, let fixed = localPeopleCheckpoint,
              checkpoint == fixed, parameters == fixed.history.current,
              selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else { return }
        let epoch = localPeopleGeneration
        isApplyingLocalPeople = true; isBusy = true
        localPeopleApplyTask = Task {
            defer {
                if epoch == localPeopleGeneration {
                    isApplyingLocalPeople = false; isBusy = false; localPeopleApplyTask = nil
                }
            }
            do {
                await saveTask?.value
                try Task.checkCancellation()
                guard !saveFailed, !localPeople.isBusy, epoch == localPeopleGeneration, showLocalPeople,
                      checkpoint == fixed, parameters == fixed.history.current,
                      selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else {
                    throw CancellationError()
                }
                guard let previous = try fixed.history.current.localWarpRecipe() else { return }
                try previous.validate(asset: fixed.asset)
                var next = fixed.history.current
                next.extendedParameters.removeValue(forKey: "localWarp")
                try next.validate()
                // Keep every other extension; no suspension before Undo/CAS commit.
                closeLocalPeople()
                edit(next)
            } catch is CancellationError {
                // A stale or busy session cannot remove the saved warp.
            } catch {
                if epoch == localPeopleGeneration {
                    errorMessage = "保存済み変形を解除できません。編集内容は保持しています: \(error.localizedDescription)"
                }
            }
        }
    }

    func applyLocalPeopleBrightness() {
        guard showLocalPeople, !isBusy, !saveFailed, !isApplyingLocalPeople,
              let localPeople, let fixed = localPeopleCheckpoint,
              checkpoint == fixed, parameters == fixed.history.current,
              selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256 else { return }
        let epoch = localPeopleGeneration
        let base = localPeopleBasePortrait
        isApplyingLocalPeople = true
        isBusy = true
        localPeopleApplyTask = Task {
            defer {
                if epoch == localPeopleGeneration {
                    isApplyingLocalPeople = false; isBusy = false; localPeopleApplyTask = nil
                }
            }
            do {
                await saveTask?.value
                try Task.checkCancellation()
                guard !saveFailed, epoch == localPeopleGeneration, showLocalPeople,
                      checkpoint == fixed, parameters == fixed.history.current else { throw CancellationError() }
                let candidate = try await localPeople.confirmedBrightnessCandidate()
                try Task.checkCancellation()
                guard !saveFailed, epoch == localPeopleGeneration, showLocalPeople,
                      selectedAsset?.id == fixed.asset.id, selectedAsset?.sha256 == fixed.asset.sha256,
                      checkpoint == fixed, parameters == fixed.history.current else { throw CancellationError() }
                try candidate.validate(asset: fixed.asset)
                if let base {
                    try candidate.validate(against: base)
                    guard Set(candidate.targets.map(\.id)) == Set(base.targets.map(\.id)) else {
                        throw SuiteValidationError.invalidValue("localPeoplePortraitTargetsChanged")
                    }
                }
                let next = try fixed.history.current.settingPortrait(candidate)
                try next.validate()
                // No suspension between releasing the operation gate and edit.
                // close clears the one-shot confirmation and prevents repeat applies.
                closeLocalPeople()
                edit(next)
            } catch is CancellationError {
                // Dismissal, photo change, or a stale saved-state snapshot: no edit.
            } catch {
                if epoch == localPeopleGeneration {
                    errorMessage = "人物明度を適用できません。編集内容は保持しています: \(error.localizedDescription)"
                }
            }
        }
    }
    func setFaceBrightness(_ value: Double) {
        guard !isBusy, !saveFailed, portraitReferencePreview != nil,
              let asset = selectedAsset, let id = selectedPortraitTargetID else { return }
        do {
            guard let portrait = try parameters.portraitRecipe() else { throw PhotoPipelineError.unsupportedRecipe }
            try portrait.validate(asset: asset)
            let next = try portrait.settingExposure(value, targetID: id)
            edit(try parameters.settingPortrait(next))
        } catch { errorMessage = error.localizedDescription }
    }
    func rotate() {
        do {
            var p = parameters
            p.rotationDegrees = (p.rotationDegrees % 360 + 90) % 360
            if var crop = try p.cropSettings() {
                let old = crop.cropRect
                crop.rotation = p.rotationDegrees
                // The image turns counter-clockwise in Core Image; preserve the same selected content.
                crop.cropRect = .init(x: old.y, y: max(0, 1 - old.x - old.width), width: old.height, height: old.width)
                if let ratio = crop.cropRatio { crop.cropRatio = .init(width: ratio.height, height: ratio.width) }
                if let width = crop.widthMM, let height = crop.heightMM { crop.widthMM = height; crop.heightMM = width }
                crop.orientation = crop.orientation == .portrait ? .landscape : .portrait
                p = try p.setting(crop: crop, export: p.exportSettings() ?? ExportSettings())
            }
            edit(p)
        } catch { errorMessage = error.localizedDescription }
    }
    func prepareCropEditor() async {
        guard let asset = selectedAsset, let pipeline else { return }
        sourcePixels = nil
        cropPreview = nil
        do {
            var p = parameters
            p.extendedParameters.removeValue(forKey: "crop")
            p.processingOrder.removeAll { $0 == .crop }
            let dimensions = await pipeline.sourceDimensions(asset: asset)
            let data = try await pipeline.preview(asset: asset, parameters: p)
            guard selectedAsset?.id == asset.id else { return }
            guard let image = UIImage(data: data) else { throw PhotoPipelineError.proxyUnavailable }
            sourcePixels = dimensions
            cropPreview = image
        } catch { errorMessage = error.localizedDescription }
    }
    func confirmCrop(_ crop: CropSettings, settings: ExportSettings) {
        guard !isBusy, !saveFailed, cropPreview != nil else { return }
        do {
            let p = try parameters.setting(crop: crop, export: settings)
            if let sourcePixels {
                _ = try CropExportMath.resolutionAssessment(sourceWidth: sourcePixels.width, sourceHeight: sourcePixels.height, crop: crop)
            } else { throw SuiteValidationError.invalidValue("originalDimensionsUnverified") }
            edit(p)
            showCropExport = false
        } catch { errorMessage = error.localizedDescription }
    }
    private func edit(_ value: RecipeParameters) {
        guard !isBusy, !saveFailed, var history = checkpoint?.history else { return }
        do { try value.validate() } catch { errorMessage = error.localizedDescription; return }
        history.apply(value); commit(history)
    }
    func undo() { guard !isBusy, !saveFailed, var h = checkpoint?.history, h.canUndo else { return }; h.undo(); commit(h) }
    func redo() { guard !isBusy, !saveFailed, var h = checkpoint?.history, h.canRedo else { return }; h.redo(); commit(h) }
    func compare(_ enabled: Bool) { isComparing = enabled; refreshPreview() }

    private func commit(_ history: EditHistory) {
        guard let current = checkpoint, let store else { return }
        if showLocalPeople || isPreparingLocalPeople { closeLocalPeople() }
        allowLargePrintResampling = false
        let next = ProjectCheckpoint(asset: current.asset, history: history, revision: current.revision + 1)
        checkpoint = next
        unsavedCheckpoints.append(next)
        parameters = history.current
        if !portraitTargets.contains(where: { $0.id == selectedPortraitTargetID }) { selectedPortraitTargetID = nil }
        isComparing = false
        pendingSaves += 1
        statusMessage = "編集内容を端末に保存中"
        let previous = saveTask
        saveTask = Task {
            await previous?.value
            defer { pendingSaves -= 1 }
            guard !saveFailed else { return }
            do {
                try await store.save(next, expectedRevision: current.revision)
                unsavedCheckpoints.removeAll { $0.asset.id == next.asset.id && $0.revision == next.revision }
                if pendingSaves == 1 { statusMessage = "端末に保存済み・クラウド未同期" }
            } catch {
                saveFailed = true
                errorMessage = "編集内容を保存できません。未保存の変更があります: \(error.localizedDescription)"
                statusMessage = "保存失敗・未保存の変更あり"
            }
        }
        refreshPreview()
    }

    func retrySave() {
        guard canRetrySave, let store else { return }
        isBusy = true
        Task {
            await saveTask?.value
            defer { isBusy = false }
            do {
                for pending in unsavedCheckpoints {
                    let persisted = try await store.load(id: pending.asset.id)
                    if persisted != pending {
                        try await store.save(pending, expectedRevision: pending.revision - 1)
                    }
                    unsavedCheckpoints.removeAll { $0.asset.id == pending.asset.id && $0.revision == pending.revision }
                }
                saveFailed = false
                errorMessage = nil
                statusMessage = "端末への保存を再開しました・クラウド未同期"
            } catch { errorMessage = "保存を再試行できません。未保存の変更は保持中です: \(error.localizedDescription)" }
        }
    }

    func retryLoad() { Task { await load() } }

    func syncSelected() {
        guard canSyncSelected, let saved = checkpoint, let transfer else {return}
        isBusy = true
        Task {
            await saveTask?.value
            defer {isBusy = false}
            guard !saveFailed else {return}
            do {
                try await transfer.uploadSelected(saved)
                statusMessage = "選択写真のOriginal/Recipe確認済み・Proxy同期は未実装"
            } catch {errorMessage = error.localizedDescription; statusMessage = "同期未完了・端末データを保持"}
        }
    }

    private func refreshPreview() {
        guard let asset = selectedAsset, let pipeline else { return }
        previewTask?.cancel()
        let generation = UUID()
        previewGeneration = generation
        let p = isComparing ? RecipeParameters() : parameters
        previewTask = Task {
            do {
                let data = try await pipeline.preview(asset: asset, parameters: p)
                guard !Task.isCancelled, previewGeneration == generation, selectedAsset?.id == asset.id else { return }
                preview = UIImage(data: data)
            } catch is CancellationError {} catch {
                guard previewGeneration == generation else { return }
                preview = nil // Do not display a previous adjustment as if a rejected current Recipe had rendered.
                errorMessage = error.localizedDescription
                if !saveFailed { statusMessage = "プレビュー更新を停止しました。原本・編集内容は保持しています。" }
            }
        }
    }

    func exportJPEG() { export(format: .jpeg) }
    func exportTIFF() { export(format: .tiff) }
    func exportPNG() { export(format: .png) }
    func exportConfigured() {
        do {
            let settings = try parameters.exportSettings() ?? ExportSettings()
            guard let format = ExportFormat(rawValue: settings.format.rawValue) else { throw PhotoPipelineError.unsupportedRecipe }
            export(format: format)
        } catch { errorMessage = error.localizedDescription }
    }
    func cancelExport() {
        exportTask?.cancel()
        statusMessage = "書き出し停止待ち・原本と編集内容は保持"
    }
    /// Freeze the persisted revision only after the pending save completes. Never export a Proxy.
    func exportLargePrint() {
        guard !isBusy, !saveFailed, let assetID = selectedAsset?.id, let store, let pipeline else { return }
        let consent = allowLargePrintResampling
        allowLargePrintResampling = false // One request only; never persist enlargement consent in a preset.
        isBusy = true
        isExporting = true
        errorMessage = nil
        shareURL = nil
        batchShareURLs = []
        statusMessage = "大判: 編集保存の完了待ち"
        exportTask = Task {
            defer { isBusy = false; isExporting = false }
            await saveTask?.value
            guard !saveFailed else { statusMessage = "大判: 編集保存を再試行してください"; return }
            do {
                try Task.checkCancellation()
                guard let saved = try await store.load(id: assetID),
                      selectedAsset?.id == assetID, saved == checkpoint else {
                    throw PhotoPipelineError.unsupportedRecipe
                }
                statusMessage = "大判: 保存済み設定を固定・原寸を分割描画中（進捗率は未計測）"
                let url: URL
                do { url = try await pipeline.exportLargePrint(checkpoint: saved, allowResampling: consent) }
                catch PhotoPipelineError.waitingForOriginal {
                    statusMessage = "大判: Original取得待ち"
                    guard let transfer else { throw PhotoPipelineError.waitingForOriginal }
                    try await transfer.fetchForFinal(asset: saved.asset, format: .tiff, pipeline: pipeline)
                    try Task.checkCancellation()
                    statusMessage = "大判: 原寸を分割描画中（進捗率は未計測）"
                    url = try await pipeline.exportLargePrint(checkpoint: saved, allowResampling: consent)
                }
                // A returned URL is already committed by the writer. A late cancellation must not
                // hide that file or misreport a completed export as interrupted.
                shareURL = url
                statusMessage = Task.isCancelled
                    ? "保存完了後に停止要求を受け取りました。出力済み大判TIFFは共有画面から保存できます。原本は保持。"
                    : "大判TIFF作成完了。共有画面でファイル保存先を選択してください。原本は保持。"
            } catch is CancellationError {
                statusMessage = "大判を中断しました。原本・編集内容は保持。"
            } catch {
                errorMessage = error.localizedDescription
                statusMessage = "大判を完了できませんでした。設定や原本は変更していません。"
            }
        }
    }
    private func export(format: ExportFormat) {
        guard !isBusy, !saveFailed, let saved = checkpoint, let pipeline else { return }
        isBusy = true
        isExporting = true
        statusMessage = "Originalを確認して最終書き出し中"
        exportTask = Task {
            await saveTask?.value
            defer { isBusy = false; isExporting = false }
            guard !saveFailed else { return }
            do {
                let url: URL
                do {url = try await pipeline.export(checkpoint: saved, format: format)}
                catch PhotoPipelineError.waitingForOriginal {
                    statusMessage = "Original取得待ち"
                    guard let transfer else {throw PhotoPipelineError.waitingForOriginal}
                    try await transfer.fetchForFinal(asset: saved.asset, format: format, pipeline: pipeline)
                    url = try await pipeline.export(checkpoint: saved, format: format)
                }
                try Task.checkCancellation()
                batchShareURLs = []
                shareURL = url
                statusMessage = "原本と編集内容から書き出し完了"
            } catch is CancellationError {
                statusMessage = "書き出しを中断しました・原本と編集内容は保持"
            } catch {
                errorMessage = error.localizedDescription
                statusMessage = error.localizedDescription == "Original取得待ち" ? "Original取得待ち" : "書き出しを完了できませんでした"
            }
        }
    }

    /// Serial, foreground batch candidate. Each stored Recipe is snapshotted before the first export.
    /// Successful files and per-asset failures stay separate; no durable background-resume claim.
    func exportAllSaved() {
        guard !isBusy, !saveFailed, !assets.isEmpty, let store, let pipeline else { return }
        isBusy = true
        isExporting = true
        errorMessage = nil
        batchResults = []
        batchShareURLs = []
        shareURL = nil
        exportTask = Task {
            await saveTask?.value
            defer { isBusy = false; isExporting = false }
            guard !saveFailed else { return }
            do {
                let fixed = try await store.list()
                var completed: [URL] = []
                defer { batchShareURLs = completed }
                for (index, saved) in fixed.enumerated() {
                    try Task.checkCancellation()
                    statusMessage = "一括書き出し \(index + 1)/\(fixed.count)・保存済みRecipeを固定"
                    do {
                        let settings = try saved.history.current.exportSettings() ?? ExportSettings()
                        guard let format = ExportFormat(rawValue: settings.format.rawValue) else { throw PhotoPipelineError.unsupportedRecipe }
                        let url: URL
                        do { url = try await pipeline.export(checkpoint: saved, format: format, sequence: index + 1) }
                        catch PhotoPipelineError.waitingForOriginal {
                            statusMessage = "Original取得待ち: \(saved.asset.originalFilename)"
                            guard let transfer else { throw PhotoPipelineError.waitingForOriginal }
                            try await transfer.fetchForFinal(asset: saved.asset, format: format, pipeline: pipeline)
                            url = try await pipeline.export(checkpoint: saved, format: format, sequence: index + 1)
                        }
                        completed.append(url)
                        batchResults.append("成功: \(saved.asset.originalFilename)")
                    } catch is CancellationError { throw CancellationError() }
                    catch { batchResults.append("失敗: \(saved.asset.originalFilename) — \(error.localizedDescription)") }
                }
                let failed = fixed.count - completed.count
                statusMessage = "一括処理: 成功\(completed.count) / 失敗\(failed)。原本は保持しています。"
                if failed > 0 { errorMessage = batchResults.filter { $0.hasPrefix("失敗:") }.joined(separator: "\n") }
            } catch is CancellationError { statusMessage = "一括処理を中断しました。完了済み成果物と原本は保持。未処理は成功に数えません。" }
            catch { errorMessage = error.localizedDescription; statusMessage = "一括処理を開始/継続できませんでした" }
        }
    }

    private func proxyLongEdge() -> Int {
        let process = ProcessInfo.processInfo
        let thermal: ThermalCondition = switch process.thermalState {
        case .nominal: .nominal
        case .fair: .fair
        case .serious: .serious
        case .critical: .critical
        @unknown default: .unknown
        }
        let requested = UserDefaults.standard.integer(forKey: "proxyPreferredLongEdge")
        let deviceDefault = process.physicalMemory >= 6 * 1024 * 1024 * 1024 ? 3072 : 2048
        let preferred = requested > 0 ? min(requested, 4096) : deviceDefault
        let resources = DeviceResources(availableMemoryBytes: Int(process.physicalMemory / 8), memoryPressure: .unknown,
            thermal: thermal, lowPowerMode: process.isLowPowerModeEnabled,
            performanceTier: process.physicalMemory >= 6 * 1024 * 1024 * 1024 ? .high : .standard)
        let settings = ProxySettings(allowedLongEdges: [512, 1024, 1536, 2048, 3072, 4096],
            preferredLongEdge: preferred, tierLimits: [.standard: 2048, .high: 4096, .unknown: 1024],
            workingBytesPerPixel: 32, memoryBudgetFraction: 0.5)
        // The actor further bounds to actual source dimensions. Memory is a conservative estimate;
        // a measured pressure/available-memory adapter remains a release gate.
        return (try? ProxyPolicy.select(originalWidth: preferred, originalHeight: preferred,
            settings: settings, resources: resources).longEdge) ?? 0
    }
}
