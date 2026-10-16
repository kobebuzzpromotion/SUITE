import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct GenerationAuthorizationView: View {
    @StateObject private var model: GenerationAuthorizationModel
    @State private var importing = false
    init(inputData: Data, store: GenerationAuthorizationStore,
         validateCurrent: @escaping GenerationAuthorizationCoordinator.HostValidation) {
        _model = StateObject(wrappedValue: .init(inputData: inputData, store: store, validateCurrent: validateCurrent))
    }
    var body: some View {
        Form {
            Text("固定依頼の端末内登録のみ。生成送信・残高予約・課金はしません。料金JSONの真正性をアプリが認証したという意味ではありません。")
            Text(model.status)
            Button("料金・モデル設定のJSONを読み込む") { importing = true }.disabled(model.busy)
            if let config = model.configuration {
                Text("Provider: \(config.provider) / Model: \(config.model)")
                Text("料金表: \(config.priceListVersion)")
                Text("上限: \(config.maximumCostUnits) × 10^-\(config.costDecimalPlaces) \(config.currency)")
                Text("説明版: \(config.disclosureVersion)")
                Text("入力SHA-256: \(model.inputSHA256)").font(.caption).textSelection(.enabled)
                if let digest = model.payloadSHA256 {
                    Text("依頼全文SHA-256: \(digest)").font(.caption).textSelection(.enabled)
                }
                DisclosureGroup("依頼の全内容") { Text(config.canonicalPayload).textSelection(.enabled) }
                Toggle("料金表の出所・上限額・写真の利用権限・依頼全内容を確認し、この固定依頼の登録に同意します", isOn: $model.reviewed)
                    .disabled(model.busy)
                Button("固定依頼を登録／同一依頼を再確認") { model.register() }.disabled(model.busy || !model.reviewed)
            }
            if model.busy { Button("取消") { model.cancel() } }
        }.navigationTitle("生成依頼の固定登録")
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                if case .success(let url) = result { model.load(url) }
            }
            .onDisappear { model.cancel() }
    }
}
