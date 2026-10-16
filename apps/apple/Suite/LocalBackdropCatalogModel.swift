import Foundation
import Combine
import SuiteCore

@MainActor
final class LocalBackdropCatalogModel: ObservableObject {
    @Published private(set) var manifests: [LocalBackdropAssetStore.Manifest] = []
    @Published private(set) var selected: LocalBackdropAssetStore.Manifest?
    @Published private(set) var thumbnail: Data?
    @Published private(set) var status = "導入済み素材を読み込んでください。"
    @Published private(set) var busy = false
    @Published private(set) var importManifest: LocalBackdropAssetStore.Manifest?
    @Published var permissionConfirmed = false
    @Published var mode: ShootingMode = .custom {
        didSet {
            guard mode != oldValue else { return }
            cancel()
            selected = selections[mode.rawValue]
            status = "モード別の選択（未適用）。サムネールは再選択時に検証します。"
        }
    }
    // Presentation-session selections only, not a saved Recipe or fabricated
    // catalog taxonomy. All installed backgrounds remain available in each mode.
    private var selections: [String: LocalBackdropAssetStore.Manifest] = [:]
    private let store: LocalBackdropAssetStore
    private var generation = UUID()
    init(store: LocalBackdropAssetStore) { self.store = store }
    func cancel() { generation = UUID(); busy = false; selected = nil; thumbnail = nil; permissionConfirmed = false; importManifest = nil }
    func loadManifest(from url: URL) async {
        cancel(); let epoch = generation; busy = true
        defer { if generation == epoch { busy = false } }
        do {
            let manifest = try await store.readManifest(from: url)
            try Task.checkCancellation(); guard generation == epoch else { return }
            importManifest = manifest
            status = "宣言を確認し、対応する画像を選択してください。"
        } catch { guard generation == epoch else { return }; status = "宣言を読めません: \(error)" }
    }
    func importImage(from url: URL) async {
        guard !busy, let manifest = importManifest,
              manifest.permission != .callerConfirmed || permissionConfirmed else { return }
        let epoch = generation, confirmed = permissionConfirmed
        busy = true
        defer { if generation == epoch { busy = false } }
        do {
            _ = try await store.install(from: url, manifest: manifest, permissionConfirmed: confirmed)
            try Task.checkCancellation(); guard generation == epoch else { return }
            await reload()
        } catch { guard generation == epoch else { return }; status = "導入できません（旧版は保持）: \(error)" }
    }
    func reload() async {
        cancel(); let epoch = generation; busy = true
        defer { if generation == epoch { busy = false } }
        do {
            let catalog = try await store.catalog()
            try Task.checkCancellation(); guard generation == epoch else { return }
            manifests = catalog.manifests
            selections = selections.filter { manifests.contains($0.value) }
            selected = selections[mode.rawValue]
            status = "保存済み \(manifests.count)件。不正・読取不能 \(catalog.unreadableRecords)件。選択しても写真には未適用です。"
        } catch { guard generation == epoch else { return }; manifests = []; selections = [:]; selected = nil; thumbnail = nil; status = "一覧取得不可: \(error)" }
    }
    func select(_ manifest: LocalBackdropAssetStore.Manifest) async {
        cancel(); let epoch = generation; busy = true
        defer { if generation == epoch { busy = false } }
        do {
            guard manifests.contains(manifest) else { return }
            let preview = try await store.thumbnail(manifest: manifest)
            try Task.checkCancellation(); guard generation == epoch else { return }
            selected = manifest; thumbnail = preview
            selections[mode.rawValue] = manifest
            status = "実素材を選択済み・写真には未適用。許諾は利用者の申告であり自動認定ではありません。"
        } catch { guard generation == epoch else { return }; status = "素材を利用できません: \(error)" }
    }
}
