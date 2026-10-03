import Foundation
import Combine
import UIKit
import SuiteCore
import METISMobileCore

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
    @Published var showCropExport = false
    @Published var cropPreview: UIImage?
    @Published var sourcePixels: PixelDimensions?
    @Published var batchShareURLs: [URL] = []
    @Published var batchResults: [String] = []
    @Published var portraitReferencePreview: UIImage?
    @Published var selectedPortraitTargetID: UUID?
    private var checkpoint: ProjectCheckpoint?
    private var store: ProjectStore?
    private var pipeline: PhotoPipeline?
    private var transfer: CloudTransferCoordinator?
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
            store = try ProjectStore(directory: root.appendingPathComponent("Recipes"))
            pipeline = PhotoPipeline(root: root)
            if let backend {transfer = CloudTransferCoordinator(client: backend, root: root)}
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
        portraitReferencePreview = nil
        selectedPortraitTargetID = nil
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
