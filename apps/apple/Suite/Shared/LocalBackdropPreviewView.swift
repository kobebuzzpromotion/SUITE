import SwiftUI
import UIKit
import UniformTypeIdentifiers
import SuiteCore

@MainActor
struct LocalBackdropPreviewView: View {
    @StateObject private var model: LocalBackdropPreviewModel
    @State private var importing = false
    @State private var importingFinal = false
    @State private var importingOriginalPNG = false
    private let onApply: (LocalBackdropRecipe) -> Void
    init(sourcePNG: Data, assetID: UUID, originalSHA256: String, store: LocalBackdropAssetStore,
         maskStore: LocalBackdropRecipeStore, initialHandoff: LocalGenerationCandidateStore.Handoff? = nil,
         onApply: @escaping (LocalBackdropRecipe) -> Void) {
        self.onApply = onApply
        _model = StateObject(wrappedValue: LocalBackdropPreviewModel(sourcePNG: sourcePNG,
            assetID: assetID, originalSHA256: originalSHA256, store: store, maskStore: maskStore, initialHandoff: initialHandoff))
    }
    var body: some View {
        Form {
            Section("非保存の背景合成見本") {
                Text("未編集Proxyと人物マスクの見本です。既存の他補正は重ねていません。明示操作で端末内Visionの全人物マスクを作成できます。生成AI・原本変更は行いません。確認後の明示操作だけがRecipeへ渡されます。")
                Text("見本用マスクを自動拡大しません。原寸Finalが別寸法なら、対応する原寸マスクを別途読み込んでください。")
                Text("見本は他の編集を含みません。保存後は色・切抜き・変形を合成結果にも適用します。原本は不変です。")
                Button("背景一覧を更新", action: model.loadCatalog).disabled(model.busy || model.initialHandoff != nil)
                Picker("背景", selection: $model.selectedIndex) {
                    Text("選択してください").tag(-1)
                    ForEach(model.manifests.indices, id: \.self) { index in
                        let manifest = model.manifests[index]
                        Text("\(manifest.assetID.uuidString.prefix(8)) / \(manifest.version)\(manifest.permission == .callerConfirmed ? "" : "（許可未確認）")").tag(index)
                    }
                }
                Button("人物マスク（.mask / .bin）を選ぶ") { importing = true }.disabled(model.initialHandoff != nil)
                Button("この写真の全人物マスクを作る", action: model.generatePersonMask)
                    .disabled(model.busy || model.initialHandoff != nil)
                Text("OS内蔵Visionを使用します。人物を選別せず全検出人物を含めます。髪や透過の境界品質は未確認です。原寸用マスクへ自動拡大しません。")
                Text("raw L8・ヘッダなし・上から下、Proxyと同じ幅×高さのバイト数。白が人物、黒が背景です。")
                Text("必要なマスク：\(model.maskDimensionsLabel)")
                Toggle("この写真と同寸法・同じ構図の人物マスクであり、旧背景と旧影を人物領域に含めていません", isOn: $model.confirmed)
                    .disabled(!model.hasMask)
            }
            Section("原寸Final用の別マスク（任意）") {
                Toggle("同じ元写真の未切抜き・正立・原寸PNGで、人物処理の許可を得ています（利用者の申告）", isOn: $model.originalPNGConfirmed)
                Button("原寸PNGから全人物マスクを作る") { importingOriginalPNG = true }
                    .disabled(model.busy || !model.originalPNGConfirmed)
                Text(model.originalPNGDetails)
                Text("PNGのSHAと寸法は実測しますが、RAW原本と同じ写真・原寸であることは自動証明しません。32MiB・8MP以下限定。人物の取捨はせず全検出人物を含めます。")
                if model.initialHandoff != nil { Text("生成候補では人物・保護マスクを固定するため、この画面で差し替えません。") }
                Text("同じ元写真の同じ人物領域を、原寸・raw L8・上から下で用意します。上限8MPです。大判合成はまだ対象外です。")
                TextField("幅 px", text: $model.finalMaskWidth).keyboardType(.numberPad)
                TextField("高さ px", text: $model.finalMaskHeight).keyboardType(.numberPad)
                TextField("ファイルのSHA-256", text: $model.finalMaskSHA256)
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("原寸マスクを読み込む") { importingFinal = true }.disabled(model.busy)
                if let mask = model.finalMask {
                    Text("保存済み：\(mask.width) × \(mask.height) px")
                    Toggle("同じ写真・向き・未トリミングの構図と人物領域で、旧背景と旧影を含まない原寸マスクです", isOn: $model.finalMaskConfirmed)
                    Button("原寸マスクの指定を外す", action: model.clearFinalMask)
                }
            }.disabled(model.initialHandoff != nil)
            Section("背景配置・背景だけの光") {
                value("左位置", $model.x, -4...4)
                value("上位置", $model.y, -4...4)
                value("幅倍率", $model.width, 0.001...8)
                value("高さ倍率", $model.height, 0.001...8)
                value("背景EV", $model.exposure, -5...5)
            }
            Section("追加の影") {
                Toggle("人物マスクから影を追加", isOn: $model.shadowEnabled)
                Toggle("選択した背景に人物の影がなく、影を重ねないことを確認しました", isOn: $model.backgroundShadowFree)
                Text("元の影は保持しません。背景素材に既存の人物影がないことを確認してください。人物の色は変更しません。")
                value("横方向px（右＋）", $model.offsetX, -1024...1024)
                value("縦方向px（上＋）", $model.offsetY, -1024...1024)
                value("ぼかしpx", $model.blur, 0...128)
                value("濃さ", $model.opacity, 0...1)
            }
            Section {
                Button("合成見本を作る", action: model.render)
                    .disabled(model.busy || !model.confirmed || !model.hasMask || model.selectedIndex < 0 || model.shadowEnabled && !model.backgroundShadowFree || model.finalMask != nil && !model.finalMaskConfirmed)
                Button("取消・見本を破棄", action: model.invalidate)
                Button("確認した見本をRecipeへ適用") { model.save(onApply: onApply) }
                    .disabled(!model.canSave)
                Text(model.status)
                if let data = model.previewPNG, let image = UIImage(data: data) {
                    Image(uiImage: image).resizable().scaledToFit().accessibilityLabel("非保存Proxy合成見本")
                }
            }
        }
        .navigationTitle("背景・光・影の見本")
        .task { model.loadCatalog() }
        .onDisappear { model.invalidate() }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first { model.importMask(url) }
        }
        .fileImporter(isPresented: $importingFinal, allowedContentTypes: [.data], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first { model.importFinalMask(url) }
        }
        .fileImporter(isPresented: $importingOriginalPNG, allowedContentTypes: [.png], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first { model.generateOriginalMask(url) }
        }
    }
    private func value(_ title: String, _ binding: Binding<Double>, _ range: ClosedRange<Double>) -> some View {
        VStack(alignment: .leading) {
            Text("\(title)：\(binding.wrappedValue, specifier: "%.3f")")
            Slider(value: binding, in: range)
        }
    }
}
