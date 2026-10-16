import SwiftUI
import UniformTypeIdentifiers
import SuiteCore

@MainActor
struct LocalGenerationCandidateView: View {
    @StateObject private var model: LocalGenerationCandidateModel
    let sourcePNG: Data
    let backgroundStore: LocalBackdropAssetStore
    let maskStore: LocalBackdropRecipeStore
    let onApply: (UUID, LocalBackdropRecipe) -> Void
    @State private var importing = false
    @State private var kind = LocalGenerationCandidateModel.Input.manifest
    init(store: LocalGenerationCandidateStore, sourcePNG: Data, assetID: UUID, originalSHA256: String,
         recipeRevision: Int, backgroundStore: LocalBackdropAssetStore, maskStore: LocalBackdropRecipeStore,
         onApply: @escaping (UUID, LocalBackdropRecipe) -> Void) {
        _model = StateObject(wrappedValue: LocalGenerationCandidateModel(store: store, assetID: assetID,
            originalSHA256: originalSHA256, recipeRevision: recipeRevision))
        self.sourcePNG = sourcePNG; self.backgroundStore = backgroundStore; self.maskStore = maskStore; self.onApply = onApply
    }
    var body: some View {
        Form {
            Text("外部生成の背景候補を手動取込。実provider未選定・生成実行未認証・課金成功未確認です。人物の生成置換は行いません。")
            Text(model.status)
            ForEach(LocalGenerationCandidateModel.Input.allCases, id: \.rawValue) { input in
                Button("\(input.rawValue) ファイルを選択") { kind = input; importing = true }.disabled(model.busy)
            }
            TextField("利用条件ID", text: $model.licenseID)
            TextField("利用条件の確認記録", text: $model.licenseDeclaration)
            Toggle("商用利用条件を自分で確認しました", isOn: $model.permissionConfirmed)
            Toggle("この写真・編集版の生成背景と人物／保護マスクです", isOn: $model.acceptanceConfirmed)
            Button("検証して合成確認へ渡す") { Task { await model.prepare() } }.disabled(model.busy)
            if let handoff = model.handoff {
                NavigationLink("固定した人物マスクで合成を確認") {
                    LocalBackdropPreviewView(sourcePNG: sourcePNG, assetID: model.assetID,
                        originalSHA256: model.originalSHA256, store: backgroundStore, maskStore: maskStore,
                        initialHandoff: handoff, onApply: { onApply(handoff.candidate.id, $0) })
                }
            }
        }.navigationTitle("生成背景候補・手動導入")
            .fileImporter(isPresented: $importing, allowedContentTypes: kind == .manifest ? [.json] : [.data]) { result in
                if case .success(let url) = result { model.load(kind, url: url) }
            }
    }
}
