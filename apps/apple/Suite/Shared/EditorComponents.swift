import SwiftUI
import UIKit
import SuiteCore

@MainActor
struct PhotoCanvas: View {
    @ObservedObject var model: EditorModel
    var body: some View {
        ZStack {
            Color.black
            if let image = model.preview {
                Image(uiImage: image).resizable().scaledToFit()
                    .accessibilityLabel(model.isComparing ? "編集前のプレビュー" : "編集中のプレビュー")
            } else {
                ContentUnavailableView("写真を読み込む", systemImage: "photo", description: Text("FilesからRAWまたはJPEGを選択"))
            }
            if model.isBusy { ProgressView().padding().background(.ultraThinMaterial, in: Capsule()) }
            VStack {
                Spacer()
                if model.isExporting {
                    Button("書き出しを中断", action: model.cancelExport).buttonStyle(.borderedProminent).frame(minHeight: 44)
                }
                if model.canRetrySave {
                    Button("保存を再試行", action: model.retrySave).buttonStyle(.borderedProminent).frame(minHeight: 44)
                }
                if model.canRetryLoad {
                    Button("保存データを再読み込み", action: model.retryLoad).buttonStyle(.borderedProminent).frame(minHeight: 44)
                }
            }.padding()
        }
        .clipped()
    }
}
@MainActor
struct AdjustmentControls: View {
    @ObservedObject var model: EditorModel
    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            control("露出", value: model.parameters.exposure, range: -4...4, set: model.setExposure)
            control("コントラスト", value: model.parameters.contrast, range: 0.5...1.5, set: model.setContrast)
            control("彩度", value: model.parameters.saturation, range: 0...2, set: model.setSaturation)
            VStack(alignment: .leading, spacing: 12) {
                Text("顔の明るさ（CUSTOM EV）").font(.headline)
                Button(model.isPreparingLocalPeople ? "人物登録の写真を準備中" : "端末内の人物登録・照合", action: model.openLocalPeople)
                    .frame(minHeight: 44).disabled(model.isPreparingLocalPeople)
                Button(model.portraitTargets.isEmpty ? "この写真の顔を検出" : "対象の顔を表示", action: model.preparePortraitTargets)
                    .frame(minHeight: 44)
                if !model.portraitTargets.isEmpty {
                    if let reference = model.portraitReferencePreview {
                        PortraitTargetReference(image: reference, targets: model.portraitTargets,
                                                selectedID: model.selectedPortraitTargetID)
                        ScrollView(.horizontal) {
                            HStack {
                                ForEach(Array(model.portraitTargets.enumerated()), id: \.element.id) { index, target in
                                    Button("顔\(index + 1)") { model.selectPortraitTarget(target.id) }
                                        .buttonStyle(.bordered)
                                        .tint(target.id == model.selectedPortraitTargetID ? .orange : .gray)
                                        .frame(minHeight: 44)
                                        .accessibilityLabel("この写真の顔\(index + 1)を選択")
                                }
                            }
                        }
                        if let target = model.selectedPortraitTarget {
                            control("顔の明るさ EV", value: target.exposureEV, range: -4...4, set: model.setFaceBrightness)
                        } else {
                            Text("番号を確認して対象の顔を選んでください。")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                }
                Text("この写真内だけの対象です。別写真への人物追従は未実装。原本の再解析や人物マスクを確認できない場合は書き出しを停止します。人物補正・マスク品質は実機未検証です。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Text("表示はProxyを使用。編集内容は非破壊で保存します。")
                .font(.footnote).foregroundStyle(.secondary)
            Button("選択写真を送信", action: model.syncSelected)
                .frame(minHeight: 44).disabled(!model.canSyncSelected)
            Text("認証・本番接続は未設定。自動クラウド同期は未完成です。")
                .font(.footnote).foregroundStyle(.secondary)
        }.disabled(model.selectedAsset == nil || model.isBusy)
            .sheet(isPresented: $model.showLocalPeople, onDismiss: model.closeLocalPeople) {
                if let people = model.localPeople {
                    LocalPeoplePanel(model: people, referenceImage: model.localPeopleReference,
                                     onApplyBrightness: model.applyLocalPeopleBrightness,
                                     onApplyManualRetouch: model.applyLocalManualRetouch,
                                     onApplyManualWarp: model.applyLocalManualWarp,
                                     onRemoveManualWarp: model.removeLocalManualWarp,
                                     backdropStore: model.localBackdropStore,
                                     backdropRecipeStore: model.localBackdropRecipeStore,
                                     onApplyBackdrop: model.applyLocalBackdrop,
                                     onRemoveBackdrop: model.canRemoveLocalBackdrop ? model.removeLocalBackdrop : nil,
                                     generationStore: model.localGenerationCandidateStore,
                                     generationRecipeRevision: model.localGenerationRecipeRevision,
                                     onApplyGeneration: model.applyGenerationBackdrop,
                                     authorizationStore: model.generationAuthorizationStore,
                                       responseAdapter: model.generationResponseAdapter,
                                       partialLookContext: model.partialLookContext,
                                       tetherRecoveryContext: model.tetherRecoveryContext,
                                     authorizationValidation: model.generationAuthorizationValidation,
                                     serverGenerationPreparation: model.canConnectServerGeneration ? model.prepareServerGeneration : nil)
                }
            }
    }
    private func control(_ name: String, value: Double, range: ClosedRange<Double>, set: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack { Text(name); Spacer(); Text(value, format: .number.precision(.fractionLength(2))).monospacedDigit() }
            Slider(value: Binding(get: { value }, set: set), in: range)
                .frame(minHeight: 44).accessibilityLabel(name)
        }
    }
}

/// Selection reference is upright and uncropped, matching the stored lower-left Vision anchors.
/// Number labels are presentation only; Recipe target IDs are UUIDs, never face-array indices.
@MainActor
private struct PortraitTargetReference: View {
    let image: UIImage
    let targets: [PortraitFaceTarget]
    let selectedID: UUID?
    var body: some View {
        GeometryReader { geometry in
            let scale = min(geometry.size.width / max(image.size.width, 1), geometry.size.height / max(image.size.height, 1))
            let width = image.size.width * scale
            let height = image.size.height * scale
            let left = (geometry.size.width - width) / 2
            let top = (geometry.size.height - height) / 2
            ZStack(alignment: .topLeading) {
                Image(uiImage: image).resizable().scaledToFit().frame(width: geometry.size.width, height: geometry.size.height)
                ForEach(Array(targets.enumerated()), id: \.element.id) { index, target in
                    let boxWidth = CGFloat(target.anchor.width) * width
                    let boxHeight = CGFloat(target.anchor.height) * height
                    let x = left + CGFloat(target.anchor.x) * width
                    let y = top + CGFloat(1 - target.anchor.y - target.anchor.height) * height
                    Rectangle().stroke(target.id == selectedID ? Color.orange : Color.white, lineWidth: 2)
                        .frame(width: boxWidth, height: boxHeight).position(x: x + boxWidth / 2, y: y + boxHeight / 2)
                    Text("\(index + 1)").font(.caption.bold()).foregroundStyle(.black)
                        .padding(3).background(target.id == selectedID ? Color.orange : Color.white)
                        .position(x: x + boxWidth / 2, y: max(10, y))
                }
            }
        }.frame(height: 180).background(.black).clipped()
            .accessibilityLabel("回転・Crop前の対象確認用写真。番号はこの写真内の顔を表します。")
    }
}
@MainActor
struct AssetFilmstrip: View {
    @ObservedObject var model: EditorModel
    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(model.assets) { asset in
                    Button { model.select(asset) } label: {
                        VStack {
                            Image(systemName: "photo").font(.title2)
                            Text(asset.originalFilename).font(.caption).lineLimit(1)
                        }.frame(width: 100, height: 64)
                            .background(asset.id == model.selectedAsset?.id ? Color.orange.opacity(0.22) : Color.gray.opacity(0.16), in: RoundedRectangle(cornerRadius: 8))
                    }.buttonStyle(.plain).accessibilityLabel(asset.originalFilename)
                }
            }.padding(.vertical, 4)
        }
    }
}
struct WorkflowAvailabilityView: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("開発版の対応状況").font(.headline)
            Text("ローカル取込・Proxy・基本調整・履歴にCrop/実寸/Export設定を接続した開発版です。JPEG/TIFF/PNG・色・Alpha・一括出力は実機未検証です。")
            Text("顔の明るさ1項目を実Vision・人物マスク・非破壊Recipeへ接続した候補です。画像品質・原本再照合・実機は未検証です。他のAIレタッチ、写真間人物追従、耐久Batch、クラウド同期、テザー、全RAW調整、プリセット、印刷品質検証、コミュニティ、課金は未完成です。")
            Text("通常閲覧はProxy。最終書き出しに必要なOriginalがない場合は待機します。")
        }.font(.body)
    }
}
