import Foundation
import Combine
import CoreImage
import ImageIO
import UniformTypeIdentifiers
import SuiteCore
import CryptoKit
import Darwin

@MainActor
final class LocalBackdropPreviewModel: ObservableObject {
    @Published private(set) var manifests: [LocalBackdropAssetStore.Manifest] = []
    @Published private(set) var previewPNG: Data?
    @Published private(set) var busy = false
    @Published private(set) var status = "背景一覧を読み込んでください。"
    @Published var selectedIndex = -1 { didSet { backgroundShadowFree = false; invalidate() } }
    @Published var confirmed = false { didSet { invalidate() } }
    @Published var x = 0.0 { didSet { invalidate() } }
    @Published var y = 0.0 { didSet { invalidate() } }
    @Published var width = 1.0 { didSet { invalidate() } }
    @Published var height = 1.0 { didSet { invalidate() } }
    @Published var exposure = 0.0 { didSet { invalidate() } }
    @Published var shadowEnabled = false { didSet { invalidate() } }
    @Published var backgroundShadowFree = false { didSet { invalidate() } }
    @Published var offsetX = 0.0 { didSet { invalidate() } }
    @Published var offsetY = -10.0 { didSet { invalidate() } }
    @Published var blur = 10.0 { didSet { invalidate() } }
    @Published var opacity = 0.3 { didSet { invalidate() } }
    @Published private(set) var hasMask = false
    @Published private(set) var maskDimensionsLabel = "画像寸法を確認中"
    @Published var finalMaskWidth = "" { didSet { clearFinalMask() } }
    @Published var finalMaskHeight = "" { didSet { clearFinalMask() } }
    @Published var finalMaskSHA256 = "" { didSet { clearFinalMask() } }
    @Published var finalMaskConfirmed = false { didSet { invalidate() } }
    @Published private(set) var finalMask: LocalBackdropRecipe.MaskReference?
    @Published var originalPNGConfirmed = false { didSet { clearFinalMask() } }
    @Published private(set) var originalPNGDetails = "原寸PNGは未読込です。"
    private let originalMaskAdapter = LocalBackdropOriginalMaskAdapter()
    private let sourcePNG: Data, assetID: UUID, originalSHA256: String
    private let store: LocalBackdropAssetStore
    private let maskStore: LocalBackdropRecipeStore
    private struct Candidate {
        let manifest: LocalBackdropAssetStore.Manifest
        let mask: Data
        let width: Int, height: Int
        let placement: LocalBackdropRecipe.Placement
        let exposure: Double
        let shadow: LocalBackdropRecipe.Shadow
        let finalMask: LocalBackdropRecipe.MaskReference?
    }
    private var candidate: Candidate?
    var canSave: Bool { !busy && previewPNG != nil && candidate != nil }
    private let worker = LocalBackdropPreviewWorker()
    private let personMaskAdapter = LocalBackdropPersonMaskAdapter()
    private var mask: Data?
    private var generation = UUID()
    private var task: Task<Void, Never>?
    let initialHandoff: LocalGenerationCandidateStore.Handoff?
    init(sourcePNG: Data, assetID: UUID, originalSHA256: String, store: LocalBackdropAssetStore,
         maskStore: LocalBackdropRecipeStore, initialHandoff: LocalGenerationCandidateStore.Handoff? = nil) {
        self.initialHandoff = initialHandoff
        self.sourcePNG = sourcePNG; self.assetID = assetID
        self.originalSHA256 = originalSHA256; self.store = store
        self.maskStore = maskStore
    }
    deinit { task?.cancel() }
    func invalidate() {
        task?.cancel(); task = nil; generation = UUID(); busy = false; previewPNG = nil; candidate = nil
    }
    func clearFinalMask() {
        finalMask = nil; finalMaskConfirmed = false; invalidate()
    }
    func importFinalMask(_ url: URL) {
        guard initialHandoff == nil else { return }
        clearFinalMask()
        guard let width = Int(finalMaskWidth), let height = Int(finalMaskHeight) else {
            status = "原寸マスクの幅・高さを整数で指定してください。"; return
        }
        let digest = finalMaskSHA256.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let epoch = generation; busy = true
        task = Task {
            defer { if epoch == generation { busy = false } }
            do {
                let imported = try await maskStore.importRawMask(from: url, expectedSHA256: digest, width: width, height: height)
                try Task.checkCancellation(); guard epoch == generation else { return }
                finalMask = try .init(sha256: imported.sha256, width: imported.width,
                                      height: imported.height, byteCount: imported.byteCount)
                status = "原寸マスク保存済み。写真との対応を確認し、合成見本を作り直してください。"
            } catch is CancellationError { }
            catch { if epoch == generation { status = "原寸マスクを導入できません。寸法・SHA-256・raw L8・8MP上限を確認してください。" } }
        }
    }
    private func permitsOriginalMask(_ binding: LocalBackdropOriginalMaskAdapter.Binding) -> Bool {
        originalPNGConfirmed && initialHandoff == nil && generation == binding.generation &&
        assetID == binding.assetID && originalSHA256 == binding.originalSHA256
    }
    func generateOriginalMask(_ url: URL) {
        guard !busy, initialHandoff == nil, originalPNGConfirmed else { return }
        clearFinalMask(); let epoch = generation; busy = true
        task = Task {
            defer { if epoch == generation { busy = false } }
            do {
                let input = try await worker.readOriginalPNG(url)
                try Task.checkCancellation(); guard epoch == generation else { return }
                originalPNGDetails = "入力PNG実測：\(input.width) × \(input.height) px、SHA-256 \(input.sha256)。原本との対応は利用者の申告です。"
                let binding = LocalBackdropOriginalMaskAdapter.Binding(assetID: assetID,
                    originalSHA256: originalSHA256, inputPNGSHA256: input.sha256,
                    width: input.width, height: input.height, generation: epoch)
                let result = try await originalMaskAdapter.generate(sourcePNG: input.bytes,
                    binding: binding, store: maskStore, authorize: { [weak self] candidate in
                        guard let self else { return false }
                        return await self.permitsOriginalMask(candidate)
                    })
                try Task.checkCancellation(); guard epoch == generation else { return }
                finalMask = result.mask
                status = "原寸PNGの全\(result.detectedPeople)人物マスクを保存しました。髪・境界・旧影の品質は未確認です。原寸マスク確認を行い、合成見本を作り直してください。"
            } catch is CancellationError { }
            catch { if epoch == generation { status = "原寸PNGマスクを作成できません。upright PNG・32MiB/8MP上限・人物検出・資源条件を確認してください。" } }
        }
    }
    func loadCatalog() {
        if let fixed = initialHandoff {
            invalidate()
            manifests = [fixed.background]; selectedIndex = 0
            mask = fixed.subjectMask; hasMask = true; confirmed = false
            status = "生成候補の背景・人物マスクを固定。保護済み人物を変更せず見本を確認してください。"
            return
        }
        selectedIndex = -1
        manifests = []
        invalidate(); let epoch = generation; busy = true
        task = Task {
            defer { if epoch == generation { busy = false } }
            do {
                let dimensions = try await worker.dimensions(sourcePNG)
                try Task.checkCancellation()
                guard epoch == generation else { return }
                maskDimensionsLabel = "\(dimensions.0) × \(dimensions.1) px、\(dimensions.0 * dimensions.1) bytes"
                let catalog = try await store.catalog(); try Task.checkCancellation()
                guard epoch == generation else { return }
                manifests = catalog.manifests
                status = "背景 \(manifests.count) 件・読取不能 \(catalog.unreadableRecords) 件。利用条件確認済みの背景を選択してください。"
            } catch { if epoch == generation { status = "背景一覧を取得できません。" } }
        }
    }
    func importMask(_ url: URL) {
        guard initialHandoff == nil else { return }
        invalidate(); mask = nil; hasMask = false; confirmed = false; finalMaskConfirmed = false
        let epoch = generation; busy = true
        task = Task {
            defer { if epoch == generation { busy = false } }
            do {
                let data = try await worker.readMask(url, sourcePNG: sourcePNG)
                try Task.checkCancellation(); guard epoch == generation else { return }
                mask = data; hasMask = true; status = "人物マスク読込済み。白＝人物、黒＝背景、上から下のL8です。写真との対応を確認してください。"
            } catch { if epoch == generation { status = "マスクを読めません。raw L8・同寸法・上限8MBを確認してください。" } }
        }
    }
    func generatePersonMask() {
        guard initialHandoff == nil, !busy else { return }
        invalidate(); mask = nil; hasMask = false; confirmed = false; finalMaskConfirmed = false
        let epoch = generation; busy = true
        task = Task {
            defer { if epoch == generation { busy = false } }
            do {
                let result = try await personMaskAdapter.generate(sourcePNG: sourcePNG)
                try Task.checkCancellation(); guard epoch == generation else { return }
                mask = result.l8; hasMask = true
                maskDimensionsLabel = "\(result.width) × \(result.height) px、\(result.l8.count) bytes"
                status = "Visionが検出した全\(result.people)人物のマスクを作成しました。髪・透過・旧背景/影の境界品質は未確認です。合成見本を確認し、明示確認してください。原寸マスクではありません。"
            } catch is CancellationError { }
            catch { if epoch == generation { status = "人物マスクを生成できません。OS対応・人物検出・資源条件を確認するか、手持ちマスクを読み込んでください。" } }
        }
    }
    func render() {
        guard !busy, confirmed, !shadowEnabled || backgroundShadowFree,
              finalMask == nil || finalMaskConfirmed,
              let mask, manifests.indices.contains(selectedIndex) else { return }
        let manifest = manifests[selectedIndex]
        if let fixed = initialHandoff {
            guard manifest == fixed.background, mask == fixed.subjectMask,
                  assetID == fixed.candidate.assetID, originalSHA256 == fixed.candidate.originalSHA256 else { return }
        }
        invalidate(); let epoch = generation; busy = true
        let placement = LocalBackdropCompositeRenderer.Placement(x: x, y: y, width: width, height: height)
        let ev = exposure, shadow = shadowEnabled, dx = offsetX, dy = offsetY, radius = blur, strength = opacity
        let fixedFinalMask = finalMask
        task = Task {
            defer { if epoch == generation { busy = false } }
            do {
                let background = try await store.bytesForUse(manifest: manifest)
                try Task.checkCancellation()
                let lighting = try LocalBackdropLighting(backgroundEV: ev, shadow: shadow
                    ? .addDrop(offsetX: dx, offsetY: dy, blurRadius: radius, opacity: strength) : .none)
                let png = try await worker.render(sourcePNG: sourcePNG, assetID: assetID,
                    originalSHA256: originalSHA256, mask: mask, background: background,
                    manifest: manifest, placement: placement, lighting: lighting)
                try Task.checkCancellation(); guard epoch == generation else { return }
                let dimensions = try await worker.dimensions(sourcePNG)
                try Task.checkCancellation(); guard epoch == generation else { return }
                try validateFinalMask(fixedFinalMask, width: dimensions.0, height: dimensions.1,
                    shadow: shadow ? .addDrop(offsetX: dx, offsetY: dy, blurRadius: radius, opacity: strength) : .none)
                candidate = Candidate(manifest: manifest, mask: mask, width: dimensions.0, height: dimensions.1,
                    placement: try .init(x: placement.x, y: placement.y, width: placement.width, height: placement.height),
                    exposure: ev, shadow: shadow ? .addDrop(offsetX: dx, offsetY: dy, blurRadius: radius, opacity: strength) : .none,
                    finalMask: fixedFinalMask)
                previewPNG = png; status = "未保存Proxy見本です。確認後にRecipeへ適用できます。原本は変更しません。"
            } catch is CancellationError { }
            catch { if epoch == generation { status = "合成できません。写真・背景の許可/寸法/マスク/資源条件を確認してください。" } }
        }
    }
    func save(onApply: @escaping (LocalBackdropRecipe) -> Void) {
        guard canSave, let fixed = candidate else { return }
        let epoch = generation; busy = true
        task = Task {
            defer { if epoch == generation { busy = false } }
            do {
                // Recheck fixed background permission/integrity at save time too.
                _ = try await store.bytesForUse(manifest: fixed.manifest)
                try Task.checkCancellation(); guard epoch == generation else { return }
                try validateFinalMask(fixed.finalMask, width: fixed.width, height: fixed.height, shadow: fixed.shadow)
                if let final = fixed.finalMask {
                    _ = try await maskStore.bytes(sha256: final.sha256, expectedCount: final.byteCount)
                    try Task.checkCancellation(); guard epoch == generation else { return }
                }
                let digest = try await maskStore.install(mask: fixed.mask)
                try Task.checkCancellation(); guard epoch == generation else { return }
                let b = fixed.manifest
                let recipe = try LocalBackdropRecipe(assetID: assetID, originalSHA256: originalSHA256,
                    background: .init(assetID: b.assetID, version: b.version, sha256: b.expectedSHA256,
                                      byteCount: b.expectedByteCount, width: b.width, height: b.height),
                    maskSHA256: digest, maskWidth: fixed.width, maskHeight: fixed.height, maskByteCount: fixed.mask.count,
                    placement: fixed.placement, backgroundEV: fixed.exposure, shadow: fixed.shadow, finalMask: fixed.finalMask)
                // The editor owns its fixed-checkpoint/CAS save; this callback is
                // not proof that the Recipe has already been durably committed.
                candidate = nil; previewPNG = nil
                status = "マスク保存済み。Recipe適用を編集画面へ渡しました。保存結果は編集画面で確認してください。"
                onApply(recipe)
            } catch is CancellationError { }
            catch { if epoch == generation { status = "Recipeへ渡せません。背景・マスクの保存条件を確認してください。" } }
        }
    }
    /// Match the Final renderer's scale admission before offering a saved candidate.
    /// Actual original decoder dimensions still require verification at export.
    private func validateFinalMask(_ final: LocalBackdropRecipe.MaskReference?, width: Int, height: Int,
                                   shadow: LocalBackdropRecipe.Shadow) throws {
        guard let final else { return }
        try final.validate()
        guard width > 0, height > 0,
              abs(Double(final.width) / Double(final.height) - Double(width) / Double(height))
                <= 1 / Double(height) + 1 / Double(final.height) else {
            throw SuiteValidationError.invalidValue("原寸マスクと見本の構図比率が一致しません")
        }
        if case .addDrop(let x, let y, let blur, let opacity) = shadow {
            let sx = Double(final.width) / Double(width), sy = Double(final.height) / Double(height)
            guard blur == 0 || abs(sx - sy) <= 0.000001,
                  abs(x * sx) <= Double(final.width), abs(y * sy) <= Double(final.height) else {
                throw SuiteValidationError.invalidValue("原寸の影倍率または移動量が対応範囲外です")
            }
            _ = try LocalBackdropLighting(backgroundEV: 0,
                shadow: .addDrop(offsetX: x * sx, offsetY: y * sy, blurRadius: blur * sx, opacity: opacity))
        }
    }
}

private actor LocalBackdropPreviewWorker {
    struct OriginalPNG: Sendable { let bytes: Data; let width: Int; let height: Int; let sha256: String }
    func readOriginalPNG(_ url: URL) throws -> OriginalPNG {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true,
              let size = values.fileSize, size > 0, size <= 32 * 1024 * 1024 else {
            throw LocalBackdropOriginalMaskAdapter.Failure.input
        }
        let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw LocalBackdropOriginalMaskAdapter.Failure.input }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG, info.st_size == size else {
            throw LocalBackdropOriginalMaskAdapter.Failure.input
        }
        var data = Data()
        while true {
            try Task.checkCancellation()
            let part = try handle.read(upToCount: min(1_048_576, 32 * 1024 * 1024 - data.count + 1)) ?? Data()
            if part.isEmpty { break }
            guard data.count + part.count <= 32 * 1024 * 1024 else { throw LocalBackdropOriginalMaskAdapter.Failure.input }
            data.append(part)
        }
        guard data.count == size else { throw LocalBackdropOriginalMaskAdapter.Failure.input }
        let shape = try dimensions(data)
        return OriginalPNG(bytes: data, width: shape.0, height: shape.1,
            sha256: SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined())
    }
    enum Failure: Error { case invalid }
    func dimensions(_ png: Data) throws -> (Int, Int) {
        let image = try decode(png); return (image.width, image.height)
    }
    private func decode(_ png: Data) throws -> CGImage {
        try Task.checkCancellation()
        guard !png.isEmpty, png.count <= 32 * 1024 * 1024,
              let source = CGImageSourceCreateWithData(png as CFData, nil),
              CGImageSourceGetType(source) as String? == UTType.png.identifier,
              CGImageSourceGetCount(source) == 1,
              let p = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let w = p[kCGImagePropertyPixelWidth] as? Int, let h = p[kCGImagePropertyPixelHeight] as? Int,
              w > 0, h > 0, w <= 32768, h <= 32768, w * h <= 8_000_000,
              (p[kCGImagePropertyOrientation] as? Int ?? 1) == 1,
              Double(w * h) * 128 < Double(ProcessInfo.processInfo.physicalMemory) / 3,
              let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { throw Failure.invalid }
        return image
    }
    func readMask(_ url: URL, sourcePNG: Data) throws -> Data {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard url.isFileURL, ["mask", "bin"].contains(url.pathExtension.lowercased()),
              url.standardizedFileURL == url.standardizedFileURL.resolvingSymlinksInPath() else { throw Failure.invalid }
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard values.isRegularFile == true, let size = values.fileSize, size > 0, size <= 8_000_000 else { throw Failure.invalid }
        let image = try decode(sourcePNG)
        guard size == image.width * image.height else { throw Failure.invalid }
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        let data = try handle.read(upToCount: 8_000_001) ?? Data()
        guard data.count == size else { throw Failure.invalid }; try Task.checkCancellation(); return data
    }
    func render(sourcePNG: Data, assetID: UUID, originalSHA256: String, mask: Data, background: Data,
                manifest: LocalBackdropAssetStore.Manifest, placement: LocalBackdropCompositeRenderer.Placement,
                lighting: LocalBackdropLighting) throws -> Data {
        let image = try decode(sourcePNG)
        guard originalSHA256.count == 64, originalSHA256.allSatisfy({ $0.isHexDigit }) else { throw Failure.invalid }
        let context = CIContext(options: [.cacheIntermediates: false, .outputPremultiplied: true,
            .workingColorSpace: CGColorSpace(name: CGColorSpace.extendedLinearSRGB)!, .workingFormat: CIFormat.RGBAf.rawValue])
        defer { context.clearCaches() }
        let output = try LocalBackdropCompositeRenderer(context: context).apply(to: CIImage(cgImage: image),
            assetID: assetID, originalSHA256: originalSHA256,
            matte: .init(assetID: assetID, originalSHA256: originalSHA256, width: image.width, height: image.height, rows: .topLeft, l8: mask),
            backgroundBytes: background, backgroundManifest: manifest, canvasWidth: image.width, canvasHeight: image.height,
            placement: placement, lighting: lighting)
        try Task.checkCancellation()
        guard let color = CGColorSpace(name: CGColorSpace.sRGB),
              let png = context.pngRepresentation(of: output, format: .RGBA8, colorSpace: color), png.count <= 32 * 1024 * 1024 else { throw Failure.invalid }
        try Task.checkCancellation(); return png
    }
}
