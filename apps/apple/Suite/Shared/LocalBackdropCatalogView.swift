import SwiftUI
import UIKit
import SuiteCore
import UniformTypeIdentifiers

@MainActor
struct LocalBackdropCatalogView: View {
    @StateObject private var model: LocalBackdropCatalogModel
    @State private var importingManifest = false
    @State private var importingImage = false
    @State private var importError: String?
    init(store: LocalBackdropAssetStore) { _model = StateObject(wrappedValue: LocalBackdropCatalogModel(store: store)) }
    var body: some View {
        Form {
            Section("実素材をローカル導入") {
                Button("1. 素材宣言 JSON を選択") { importingManifest = true }.disabled(model.busy)
                if let manifest = model.importManifest {
                    Text("\(manifest.assetID.uuidString) / \(manifest.version)")
                    Text("\(manifest.width) × \(manifest.height) / \(manifest.expectedByteCount) bytes")
                    Text(manifest.licenseID)
                    Text(manifest.licenseDeclaration).font(.footnote)
                    if manifest.permission == .callerConfirmed {
                        Toggle("この素材の利用条件を自分で確認しました", isOn: $model.permissionConfirmed)
                            .disabled(model.busy)
                    } else {
                        Text("許諾未確認として保存します。選択・利用はできません。")
                    }
                    Button("2. 対応画像を選択して導入") { importingImage = true }
                        .disabled(model.busy || (manifest.permission == .callerConfirmed && !model.permissionConfirmed))
                }
                if let importError { Text(importError).foregroundStyle(.red) }
            }
            Section("保存済み背景素材・選択のみ") {
                Picker("撮影モード", selection: $model.mode) {
                    ForEach(ShootingMode.allCases, id: \.rawValue) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                Text("既存の撮影モードを使用。初期補正は変更せず、画面を開いている間の背景選択だけをモード別に保持します。")
                    .font(.footnote)
                if let selection = model.selected {
                    Text("このモードの選択: \(selection.assetID.uuidString) / \(selection.version)（未適用）")
                        .font(.caption)
                }
                Text(model.status)
                Text("自動生成・ダウンロード・写真への合成は行いません。未導入素材の完成画像は表示しません。")
                    .font(.footnote)
                Button("一覧を更新") { Task { await model.reload() } }.disabled(model.busy)
                if model.busy { ProgressView() }
                if let bytes = model.thumbnail, let image = UIImage(data: bytes) {
                    Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 256)
                    Text("選択中（未適用）").font(.caption)
                }
            }
            Section("実保存レコード") {
                if model.manifests.isEmpty { Text("導入済み素材はありません。") }
                ForEach(Array(model.manifests.enumerated()), id: \.offset) { _, manifest in
                    Button { Task { await model.select(manifest) } } label: {
                        VStack(alignment: .leading) {
                            Text("\(manifest.assetID.uuidString) / \(manifest.version)")
                            Text("\(manifest.width) × \(manifest.height) ・ \(manifest.licenseID)").font(.caption)
                            Text(manifest.permission == .callerConfirmed ? "許諾申告あり・選択時に実データ検証" : "許諾未確認・利用不可")
                                .font(.caption)
                        }
                    }.disabled(model.busy || manifest.permission != .callerConfirmed)
                }
            }
        }.navigationTitle("ローカル背景素材")
            .fileImporter(isPresented: $importingManifest, allowedContentTypes: [.json]) { result in
                switch result {
                case .success(let url): importError = nil; Task { await model.loadManifest(from: url) }
                case .failure(let error): importError = error.localizedDescription
                }
            }
            .fileImporter(isPresented: $importingImage, allowedContentTypes: [.png, .jpeg]) { result in
                switch result {
                case .success(let url): importError = nil; Task { await model.importImage(from: url) }
                case .failure(let error): importError = error.localizedDescription
                }
            }
            .task { await model.reload() }
            .onDisappear { model.cancel() }
    }
}
