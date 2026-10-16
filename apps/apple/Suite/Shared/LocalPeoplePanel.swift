import SwiftUI
import UIKit
import UniformTypeIdentifiers
import SuiteCore

/// Standalone local identity sheet. Parent fixes the upright reference image and
/// Prepared to the same photo for this presentation; changing photos dismisses it.
/// A match is informational only and never writes a Recipe or applies a retouch.
@MainActor
struct LocalPeoplePanel: View {
    @State private var bodyMappingError: String?
    @ObservedObject var model: LocalPeopleModel
    let referenceImage: UIImage?
    var onApplyBrightness: (() -> Void)? = nil
    var onApplyManualRetouch: (() -> Void)? = nil
    var onApplyManualWarp: (() -> Void)? = nil
    var onRemoveManualWarp: (() -> Void)? = nil
    var backdropStore: LocalBackdropAssetStore? = nil
    var backdropRecipeStore: LocalBackdropRecipeStore? = nil
    var onApplyBackdrop: ((LocalBackdropRecipe) -> Void)? = nil
    var onRemoveBackdrop: (() -> Void)? = nil
    var generationStore: LocalGenerationCandidateStore? = nil
    var generationRecipeRevision: Int? = nil
    var onApplyGeneration: ((UUID, LocalBackdropRecipe) -> Void)? = nil
    var authorizationStore: GenerationAuthorizationStore? = nil
    var responseAdapter: GenerationResponseCandidateAdapter? = nil
    var partialLookContext: EditorModel.PartialLookContext? = nil
    var tetherRecoveryContext: TetherLocalRecoveryModel.Context? = nil
    var authorizationValidation: ((Data) -> GenerationAuthorizationCoordinator.HostValidation)? = nil
    var serverGenerationPreparation: ((Data) async throws -> ServerGenerationLaunchView.Session)? = nil
    @Environment(\.dismiss) private var dismiss
    @State private var importing = false
    @State private var importingKind: LocalPeopleModel.ModelKind = .yunet
    @State private var importError: String?
    @State private var deletingPersonID: UUID?
    @State private var confirmAssignmentReset = false
    @State private var confirmBackdropRemoval = false

    private var usableReference: Bool {
        referenceImage?.imageOrientation == .up && referenceImage?.cgImage != nil
    }

    var body: some View {
        NavigationStack {
            Form {
                if let context = tetherRecoveryContext {
                    Section("保存済み撮影キュー") {
                        NavigationLink("ローカル処理を再開・再照合") {
                            TetherLocalRecoveryView(context: context)
                        }
                    }
                }
                if let context = partialLookContext {
                    Section("SessionLookの部分適用") {
                        NavigationLink("準備済みの全体色・出力設定を確認して保存") {
                            SessionLookPartialApplyView(checkpoint: context.checkpoint, projects: context.projects,
                                validateCurrent: context.validateCurrent, beginApply: context.beginApply,
                                endApply: context.endApply, onApplied: context.onApplied)
                        }
                        Text("解析証拠が必要な処理は保留します。保存できる部分だけを履歴と一緒に記録します。")
                            .font(.footnote)
                    }
                }
                if let store = authorizationStore, let makeValidation = authorizationValidation,
                   let source = model.backdropPreviewSource {
                    Section("生成依頼の固定・同意") {
                        NavigationLink("料金条件と依頼内容を確認して端末に登録") {
                            GenerationAuthorizationView(inputData: source.png, store: store,
                                validateCurrent: makeValidation(source.png))
                        }
                        Text("入力はこの写真の未編集プロキシです。登録だけでは外部送信・残高予約・課金を行いません。")
                            .font(.footnote)
                    }
                }
                if let store = generationStore, let revision = generationRecipeRevision,
                   let background = backdropStore, let masks = backdropRecipeStore,
                   let source = model.backdropPreviewSource, let onApplyGeneration {
                    Section("生成背景候補") {
                        if let prepare = serverGenerationPreparation {
                            NavigationLink("認証サーバーで見積・予約・生成") {
                                ServerGenerationLaunchView(sourcePNG:source.png,assetID:source.assetID,
                                    originalSHA256:source.sha256,recipeRevision:revision,store:store,
                                    backgroundStore:background,maskStore:masks,prepare:{try await prepare(source.png)},
                                    onApply:onApplyGeneration)
                            }
                        } else {
                            Text("認証サーバー生成は利用できません。Backend接続が未設定です。手動候補取込とは別機能です。")
                                .font(.footnote)
                        }
                        if let adapter = responseAdapter {
                            NavigationLink("固定生成依頼に対応する応答を受領") {
                                GenerationResponseImportView(adapter: adapter, sourcePNG: source.png,
                                    assetID: source.assetID, originalSHA256: source.sha256,
                                    recipeRevision: revision, backgroundStore: background,
                                    maskStore: masks, onApply: onApplyGeneration)
                            }
                        }
                        NavigationLink("外部成果物を手動取込・確認") {
                            LocalGenerationCandidateView(store: store, sourcePNG: source.png,
                                assetID: source.assetID, originalSHA256: source.sha256,
                                recipeRevision: revision, backgroundStore: background, maskStore: masks,
                                onApply: onApplyGeneration)
                        }
                    }
                }
                Section("ローカル背景素材") {
                    if let store = backdropStore {
                        NavigationLink("導入済み素材を一覧・選択") {
                            LocalBackdropCatalogView(store: store)
                        }
                        if let source = model.backdropPreviewSource, let maskStore = backdropRecipeStore,
                           let onApplyBackdrop {
                            NavigationLink("背景と光・影を確認して保存") {
                                LocalBackdropPreviewView(sourcePNG: source.png, assetID: source.assetID,
                                    originalSHA256: source.sha256, store: store, maskStore: maskStore,
                                    onApply: onApplyBackdrop)
                            }
                        }
                    } else {
                        Text("背景素材ストアが未接続です。")
                    }
                    Text("素材一覧での選択だけでは未適用です。合成画面で見本を確認し、明示的に保存します。")
                        .font(.footnote)
                    if let onRemoveBackdrop {
                        Button("保存済み背景合成を解除", role: .destructive) { confirmBackdropRemoval = true }
                            .disabled(model.isBusy)
                            .confirmationDialog("保存済み背景合成を解除しますか？", isPresented: $confirmBackdropRemoval) {
                                Button("背景合成を解除", role: .destructive) { onRemoveBackdrop() }
                                Button("取消", role: .cancel) {}
                            } message: {
                                Text("解除は新しい編集履歴として保存され、Undoで戻せます。元写真・背景素材・マスク・過去の履歴は削除しません。")
                            }
                    }
                }
                Section("端末内の人物解析") {
                    Text(model.status).accessibilityIdentifier("localPeople.status")
                    if !model.nativeAvailable {
                        Text("顔解析ライブラリが未組込みです。モデルを導入しても、ライブラリを組み込むまでは解析できません。")
                            .foregroundStyle(.secondary)
                    }
                    Text("元写真は送信しません。人物登録・照合は編集設定とは別です。この画面の結果でメイクや補正を自動適用しません。")
                        .font(.footnote)
                    Button("この写真の顔を解析") { Task { await model.analyze() } }
                        .disabled(model.isBusy || !model.nativeAvailable || !usableReference)
                    if model.isBusy {
                        ProgressView()
                        Button("取消") { model.cancel() }
                    }
                }

                Section("登録する顔を選ぶ") {
                    if let image = referenceImage, usableReference {
                        facePreview(image)
                            .frame(height: 300)
                            .accessibilityIdentifier("localPeople.facePreview")
                        Text("画像の顔枠をタップして対象を確認してください。枠は解析用写真の位置です。写真内の顔番号は登録人物IDではありません。")
                            .font(.footnote)
                        if model.faces.isEmpty { Text("まだ解析結果はありません。顔が見つからない場合もあります。") }
                        ForEach(Array(model.faces.enumerated()), id: \.element.target.faceTargetID) { index, face in
                            Button {
                                model.selectedFaceID = face.target.faceTargetID
                                model.registrationConsent = false
                            } label: {
                                HStack {
                                    Text("顔 \(index + 1)")
                                    Spacer()
                                    if model.selectedFaceID == face.target.faceTargetID {
                                        Image(systemName: "checkmark.circle.fill")
                                    }
                                }
                            }
                            .disabled(model.isBusy)
                        }
                    } else {
                        Text("対応する向き補正済み写真がありません。顔を確認できるまで登録できません。")
                    }
                    TextField("表示名（必須・自分で入力）", text: $model.displayName)
                        .textInputAutocapitalization(.never)
                        .disabled(model.isBusy)
                    Toggle("本人の許可を得て端末内に登録する", isOn: $model.registrationConsent)
                        .disabled(model.isBusy)
                    Text("対象本人の許可を取得したことを確認してください。顔特徴と入力した表示名をこの端末に保存します。クラウドへ送信せず、下の登録一覧から削除できます。写真内メイクの許可とは別の同意です。")
                        .font(.footnote)
                    Button("選んだ顔を人物として登録") { Task { await model.enrollSelected() } }
                        .disabled(model.isBusy || model.selectedFaceID == nil || !model.registrationConsent || !usableReference || model.displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }

                Section("人物照合の設定") {
                    Text("閾値と候補差は自動で決めません。設定を入力しても品質確認済みにはなりません。写真・条件に応じた評価が別途必要です。")
                        .font(.footnote)
                    TextField("cosine閾値（0〜1）", text: $model.thresholdText)
                        .keyboardType(.decimalPad)
                        .disabled(model.isBusy)
                    TextField("候補間margin（0〜1）", text: $model.marginText)
                        .keyboardType(.decimalPad)
                        .disabled(model.isBusy)
                    TextField("判定設定の版", text: $model.policyRevision)
                        .textInputAutocapitalization(.never)
                        .disabled(model.isBusy)
                    Button("登録人物と照合") { Task { await model.matchPeople() } }
                        .disabled(model.isBusy || model.faces.isEmpty || model.people.isEmpty)
                    ForEach(model.matches, id: \.target.faceTargetID) { match in
                        VStack(alignment: .leading, spacing: 4) {
                            Text("\(faceLabel(match.target.faceTargetID)): \(decisionLabel(match.decision))")
                            if let best = match.best {
                                Text("最大cosine: \(best.cosine.formatted(.number.precision(.fractionLength(4))))")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Text("設定版: \(match.policyRevision)").font(.caption)
                        }
                    }
                }

                registeredPeople

                Section("この写真の人物対応") {
                    Text("顔と登録人物を選んで明示的に対応付けます。照合候補を自動採用しません。対応履歴は端末内だけに暗号化して自動保存し、クラウドには送信しません。対応付けだけでは補正設定を変更しません。")
                        .font(.footnote)
                    Text(model.assignmentStorageStatus)
                        .accessibilityIdentifier("localPeople.assignmentStorageStatus")
                    Button("保存履歴を再読み込み") { Task { await model.reloadAssignmentHistory() } }
                        .disabled(!model.canReloadAssignmentHistory)
                    Text("保存に失敗した場合は状態欄に表示します。未保存の対応を保存済みとは扱いません。")
                        .font(.caption)
                    if model.assignmentRestoreBlocked {
                        Text("保存履歴の読み込み・現在の解析との照合を完了できないため、対応付けと顔明度候補は停止しています。保存済みの履歴は保持しています。")
                            .foregroundStyle(.orange)
                        if let saved = model.savedAssignments {
                            Text("保存済み: 対応 \(saved.assignments.count) 件・変更履歴 \(saved.history.count) 件")
                        }
                        Button("現在の解析で対応履歴を作り直す") { confirmAssignmentReset = true }
                            .disabled(!model.canResetAssignmentHistory)
                    }
                    Picker("登録人物", selection: $model.selectedPersonID) {
                        Text("未選択").tag(nil as UUID?)
                        ForEach(model.people, id: \.id) { person in
                            Text(person.displayName).tag(Optional(person.id))
                        }
                    }.disabled(model.isBusy)
                    Button("選択中の顔をこの人物に対応付ける") { Task { await model.assignSelectedPerson() } }
                        .disabled(model.isBusy || model.assignmentRestoreBlocked || model.selectedFaceID == nil || model.selectedPersonID == nil || model.assignments == nil)
                    Button("選択中の顔の対応を解除") { Task { await model.assignSelectedPerson(removing: true) } }
                        .disabled(model.isBusy || model.assignmentRestoreBlocked || model.selectedFaceID.flatMap { model.assignments?.assignments[$0] } == nil)
                    if let document = model.assignments {
                        Text("対応済み \(document.assignments.count) 件・変更履歴 \(document.history.count) 件")
                        ForEach(document.history.suffix(20), id: \.id) { change in
                            Text("#\(change.sequence) \(faceLabel(change.faceTargetID)): \(change.personID == nil ? "解除" : "手動対応")")
                                .font(.caption)
                        }
                    }
                }

                Section("ローカルモデルの導入") {
                    Text("公式の固定モデルファイルを選択します。容量とSHA-256が指定値と一致したファイルだけ導入します。ファイル選択だけで解析対応済みにはなりません。")
                        .font(.footnote)
                    if let snapshot = model.modelStatus {
                        modelState(snapshot.detector)
                        modelState(snapshot.recognizer)
                        Text(snapshot.nativeDescription)
                            .font(.caption)
                    } else { Text("モデルの保存状態は未確認です。") }
                    Button("保存状態を更新") { Task { await model.refreshModelStatus() } }
                        .disabled(model.isBusy)
                    Button("YuNet 2023marを選ぶ") { importingKind = .yunet; importing = true }
                        .disabled(model.isBusy)
                    Button("SFace 2021decを選ぶ") { importingKind = .sface; importing = true }
                        .disabled(model.isBusy)
                    if let importError { Text(importError).foregroundStyle(.red) }
                    NavigationLink("モデルのライセンス・出典") {
                        LocalModelNoticesView()
                    }
                }

                Section("人物に紐付けた手動身体補正") {
                    Button("端末内で実身体jointを解析") { Task { await model.analyzeBodyGeometry() } }
                    Text("取得座標はブラシと同じ未編集写真の左上原点0〜1です。骨格点のみで、身体mesh・肌mask・自動変形ではありません。解析なしの手動操作も引き続き利用できます。")
                    if let geometry = model.bodyGeometry {
                        Text("\(geometry.analysisVersion) / \(geometry.bodies.count)身体")
                        if let image = referenceImage {
                            GeometryReader { proxy in
                                Image(uiImage: image).resizable()
                                ForEach(Array(geometry.bodies.enumerated()), id: \.element.id) { index, body in
                                    ForEach(Array(body.joints.enumerated()), id: \.offset) { _, joint in
                                        if joint.confidence > 0 {
                                            Text("\(index + 1)").font(.caption2).foregroundColor(.yellow)
                                                .position(x: proxy.size.width * joint.x, y: proxy.size.height * joint.y)
                                        }
                                    }
                                }
                            }.aspectRatio(CGFloat(geometry.width) / CGFloat(geometry.height), contentMode: .fit)
                        }
                        ForEach(Array(geometry.bodies.enumerated()), id: \.element.id) { index, body in
                            Button("身体\(index + 1)を選択（\(body.joints.count)点）") { model.selectedBodyID = body.id }
                        }
                        Text("選択身体: \(model.selectedBodyID?.uuidString ?? "未選択")")
                        Button("選択身体を選択顔の確定人物に明示対応") {
                            do { try model.confirmBodyPersonMapping(); bodyMappingError = nil }
                            catch { bodyMappingError = "身体・顔・確定人物の選択と現在の写真対応を確認してください: \(error)" }
                        }
                        if let bodyMappingError { Text(bodyMappingError).foregroundColor(.red) }
                        if let mapping = model.bodyPersonMapping { Text(mapping) }
                        Text("対応確定後の人物身体補正は解析ID・身体ID・写真SHA・顔と人物の対応を固定し、保存前にも確認します。上の点は変形前です。mesh・自動操作生成ではありません。")
                        if let body = geometry.bodies.first(where: { $0.id == model.selectedBodyID }) {
                            DisclosureGroup("実jointをブラシ中心へ採用（明示操作）") {
                                ForEach(Array(body.joints.enumerated()), id: \.offset) { _, joint in
                                    Button("\(joint.name) / 信頼度 \(joint.confidence)") {
                                        do { try model.useBodyJointAsBrushCenter(joint.name); bodyMappingError = nil }
                                        catch { bodyMappingError = "人物対応を確定してから選択してください: \(error)" }
                                    }.disabled(joint.confidence <= 0 || model.bodyPersonMapping == nil)
                                }
                                Text("半径・強度・移動量は変更しません。点を選んだ後に領域と操作を再確認してください。")
                            }
                        }
                        if !model.warpedBodyJoints.isEmpty, let bytes = model.warpPreview?.png,
                           let warpedImage = UIImage(data: bytes) {
                            Text("変形後joint：認証済みactual fieldの逆解で同じ画像上へ移動。身体surface meshではありません。")
                            GeometryReader { proxy in
                                Image(uiImage: warpedImage).resizable()
                                ForEach(Array(model.warpedBodyJoints.enumerated()), id: \.offset) { _, joint in
                                    if joint.confidence > 0 {
                                        Circle().fill(Color.cyan).frame(width: 5, height: 5)
                                            .position(x: proxy.size.width * joint.x, y: proxy.size.height * joint.y)
                                    }
                                }
                            }.aspectRatio(CGFloat(geometry.width) / CGFloat(geometry.height), contentMode: .fit)
                        }
                    }
                    Toggle("選択した顔の確定人物に身体操作を紐付ける", isOn: $model.personBodyEnabled)
                    if model.personBodyEnabled {
                        Toggle("実人物instance mask内だけに操作を制限", isOn: $model.bodyInstanceProtectionEnabled)
                        Text("制限を使う場合は詳細解析を先に実行してください。実maskの不確かな境界・背景に触れる操作や参照元は拒否します。maskは写真Recipeに固定して端末内保存します。Finalの寸法と一致しない場合は出力を拒否し、プレビューmaskを勝手に拡大しません。surface meshではありません。")
                        Text("自動身体認識ではありません。未編集写真上の手動領域と操作を指定します。既存保存操作は保持し、追加操作だけを確認領域内に制限します。")
                        Picker("目的", selection: $model.personBodyControl) {
                            ForEach(RetouchControl.allCases.filter { $0.category == .body }, id: \.self) { control in
                                Text(control.rawValue).tag(control)
                            }
                        }
                        TextField("明示するcustom intent値（操作量への自動換算なし）", text: $model.bodyIntentValueText)
                        Picker("実関節規則の強度", selection:$model.bodyStrengthLevel) {
                            ForEach(["CUSTOM","LOW","MEDIUM","HIGH"], id:\.self) { Text($0).tag($0) }
                        }
                        DisclosureGroup("この項目の強度対応を自分で設定（初期値なし）") {
                            TextField("LOW −1〜1", text:$model.bodyLowText)
                            TextField("MEDIUM −1〜1", text:$model.bodyMediumText)
                            TextField("HIGH −1〜1", text:$model.bodyHighText)
                            Button("現在の項目の保存値を読む") { model.loadBodyStrengthMapping() }
                            Button("現在の項目の対応値を端末に保存") {
                                do { try model.saveBodyStrengthMapping(); bodyMappingError = nil }
                                catch { bodyMappingError = "対応値を確認してください: \(error)" }
                            }
                            Text("waist/bodyLine/arm/legそれぞれ別保存。これは利用者が決める係数で、自動学習や推奨体型ではありません。設定変更は保存済み写真を変えません。")
                        }
                        Button("実関節から既存Web規則の胴／腰／腕／脚操作を準備") {
                            do { try model.prepareObservedBodyWarp(); bodyMappingError = nil }
                            catch { bodyMappingError = "準備できません: \(error)" }
                        }
                        Text("bodyLine／waist／arm／leg。現在写真の実関節から領域を計算し、CUSTOMまたは明示保存した強度値を使用します。腕は左右上腕、脚は左右大腿と下腿を1グループにします。準備後に領域確認→プレビュー→保存。未設定の強度は拒否します。実mask保護を必須とし、距離・尺度の解析完了とは扱いません。")
                        TextField("領域X（0〜1）", text: $model.bodyXText)
                        TextField("領域Y（上から0〜1）", text: $model.bodyYText)
                        TextField("領域幅（0〜1）", text: $model.bodyWidthText)
                        TextField("領域高さ（0〜1）", text: $model.bodyHeightText)
                        Toggle("この人物の領域・操作・保護範囲を確認しました", isOn: $model.personBodyConfirmed)
                    }
                }.disabled(model.isBusy)
                Section("本人指定2D領域への規則入力") {
                    Text("正式2D方式：全body項目に現在写真の本人指定領域・強さを使用します。実寸・被写体距離の推定は不要。実人物maskと確定人物対応による保護は必須です。JSONの解析完了フラグを観測の証明にはしません。")
                    Text("schemaVersion:1、rule:{revision,setting,relativeOperations}、region:{reference,analysisSHA256,rectangle}。evidenceは任意の旧来メタデータ。操作中心・半径は指定矩形内の0〜1、係数は既存ブラシ値です。最大64KiB。")
                    TextEditor(text:$model.adaptiveBodyRequestText).frame(minHeight:120)
                    Toggle("選択人物・実解析の出典・規則の強さと対象領域を確認しました", isOn:$model.adaptiveBodyConfirmed)
                    Button("実測領域へ規則を対応してプレビュー") { Task { await model.previewAdaptiveBodyRule() } }
                        .disabled(!model.adaptiveBodyConfirmed)
                    Text("候補は下の既存適用ボタンで保存します。原本変更・自動保存なし。実人物maskの境界を越える操作は拒否します。")
                }.disabled(model.isBusy)
                Section("部位を指定する自由変形（手動）") {
                    Picker("対象", selection: $model.manualWarpPart) {
                        ForEach(LocalManualPartWarpAdapter.Part.allCases) { part in Text(part.rawValue).tag(part) }
                    }
                    Picker("調整", selection: $model.manualPartAdjustment) {
                        ForEach(LocalManualPartWarpAdapter.adjustments(for: model.manualWarpPart)) { adjustment in
                            Text(adjustment.rawValue).tag(adjustment)
                        }
                    }
                    Text("左右は写真上の左右です（本人の解剖学的左右ではありません）。別々に領域を指定し、自動検出・左右連動・理想体型への変更は行いません。ボリュームは写真上の2D拡縮です。対象人物を選び詳細解析を先に実行してください。実人物maskがない場合は拒否し、背景・他人物へ変位が及ぶ候補も拒否します。")
                    TextField("中心X（0〜1）", text: $model.warpCenterXText)
                    Button("実観測から部位領域の候補を出す") {
                        do { try model.proposeManualPartRegion(); bodyMappingError = nil }
                        catch { bodyMappingError = "候補なし。手動指定を使用できます: \(error)" }
                    }
                    if let proposal = model.manualPartRegionProposal {
                        Text(proposal.explanation)
                        Text("X \(proposal.x) / Y \(proposal.y) / 幅 \(proposal.width) / 高さ \(proposal.height)")
                        Button("候補を領域欄へ採用（強さ0・未適用）") {
                            do { try model.adoptManualPartRegion(); bodyMappingError = nil }
                            catch { bodyMappingError = "候補を取り直してください: \(error)" }
                        }
                    }
                    TextField("中心Y（上から0〜1）", text: $model.warpCenterYText)
                    TextField("横半径（0〜1）", text: $model.warpRadiusXText)
                    TextField("縦半径（0〜1）", text: $model.warpRadiusYText)
                    Slider(value: $model.manualPartStrength, in: -1...1)
                    Text("強さ: \(model.manualPartStrength, specifier: "%.3f")（初期0）")
                    Toggle("選択人物・手動領域・強さを確認してこの補正に同意します", isOn: $model.manualPartConfirmed)
                    Button("この部位の操作をブラシへ準備") {
                        do { try model.prepareManualPartWarp(); bodyMappingError = nil }
                        catch { bodyMappingError = "部位の中心・半径・強さを確認してください: \(error)" }
                    }.disabled(!model.canPreviewManualWarp)
                    if let bodyMappingError { Text(bodyMappingError).foregroundColor(.red) }
                    Text("準備後、下でプレビュー→操作追加→保存します。原本は変更せずUndo可能です。鼻・目は身体intentを使わない手動経路です。胴・胸の人物紐付け・背景保護を使う場合は上で設定し、準備後に領域同意を再確認してください。")
                }.disabled(model.isBusy)
                LocalWarpPreviewSection(model: model, referenceImage: referenceImage,
                                        onApply: onApplyManualWarp, onRemove: onRemoveManualWarp)

                Section("人物に紐付けた手動肌補正・修復") {
                    Toggle("選択した顔の確定人物に紐付ける", isOn: $model.personSmoothingEnabled)
                    if model.personSmoothingEnabled {
                        Text("顔の人物対応を先に確定してください。下の手動補正で『平滑化』は肌の質感調整、『修復』は傷跡・しわ等の手動領域を同じ写真の指定元位置から複製する別効果です。矩形・保護範囲・強さと、平滑化の半径または修復の元位置を指定します。肌・傷跡・しわの自動検出ではありません。")
                        Toggle("この人物に対する手動領域と補正を確認しました", isOn: $model.personSmoothingRegionConfirmed)
                    }
                }.disabled(model.isBusy)
                LocalRetouchPreviewSection(model: model, referenceImage: referenceImage,
                                          onApply: onApplyManualRetouch)

                Section("人物ごとの顔明度候補") {
                    Text("上で手動対応した人物について、同じ写真から取得した顔領域へCUSTOM EVを対応付けます。候補作成だけでは編集を変更しません。適用ボタンを押した場合だけ編集履歴へ反映します。")
                        .font(.footnote)
                    TextField("CUSTOM EV（−4〜4）", text: $model.exposureText)
                        .disabled(model.isBusy)
                    TextField("領域対応の最小IoU（0より大きく1以下）", text: $model.regionIoUText)
                        .keyboardType(.decimalPad).disabled(model.isBusy)
                    TextField("領域候補の差（0〜1）", text: $model.regionMarginText)
                        .keyboardType(.decimalPad).disabled(model.isBusy)
                    TextField("領域対応設定の版", text: $model.regionPolicyRevision)
                        .disabled(model.isBusy)
                    Button("詳細な顔の点・人物マスクを解析") { Task { await model.analyzeDetailedRegions() } }
                        .disabled(!model.nativeAvailable || !model.canReloadAssignmentHistory)
                    if let details = model.detailedAnalysis {
                        Text("詳細顔 \(details.faces.count) 件 / 人物マスク \(details.masks.count) 件 / 保留 \(details.associations.count - details.faces.count) 件")
                        Text(details.topologyID).font(.caption)
                        Button("顔内の領域候補を表示") { Task { await model.proposeFaceRegions() } }
                            .disabled(model.isBusy)
                        Text("解析用写真の結果です。原寸マスクではなく、補正・保存はしていません。")
                            .font(.caption)
                    }
                    if let proposal = model.faceRegionProposal {
                        LocalFaceRegionProposalView(result: proposal, referenceImage: referenceImage)
                    }
                    Button("顔明度の候補を作る") { Task { await model.prepareBrightnessCandidate() } }
                        .disabled(model.isBusy || model.assignmentRestoreBlocked || model.selectedPersonID == nil || model.assignments == nil)
                    if let candidate = model.correctionCandidate {
                        Text("対応 \(candidate.resolved.count) 件 / 保留 \(candidate.pending.count) 件")
                        Text("未適用・画素処理未実行").font(.caption)
                        if let onApplyBrightness {
                            Button("この顔明度候補を編集に適用") { onApplyBrightness() }
                                .disabled(model.isBusy || model.assignmentRestoreBlocked || candidate.resolved.isEmpty || !candidate.pending.isEmpty)
                        }
                        ForEach(candidate.pending, id: \.personID.value) { pending in
                            Text("保留: \(pendingLabel(pending.reason))").font(.caption)
                        }
                    }
                }
            }
            .navigationTitle("ローカル人物登録")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("閉じる") { model.cancel(); dismiss() }
                }
            }
            .fileImporter(isPresented: $importing, allowedContentTypes: [.data], allowsMultipleSelection: false) { result in
                switch result {
                case let .success(urls):
                    guard let url = urls.first else { return }
                    let kind = importingKind
                    importError = nil
                    Task { await model.importModel(kind, from: url) }
                case let .failure(error): importError = "モデル選択: \(error.localizedDescription)"
                }
            }
            .task {
                await model.refreshPeople()
                guard !Task.isCancelled else { return }
                await model.refreshModelStatus()
            }
            .confirmationDialog("この端末の登録人物データを削除しますか？", isPresented: Binding(
                get: { deletingPersonID != nil },
                set: { if !$0 { deletingPersonID = nil } }
            ), titleVisibility: .visible) {
                Button("顔特徴と登録名を削除", role: .destructive) {
                    guard let id = deletingPersonID else { return }
                    deletingPersonID = nil
                    Task { await model.deletePerson(id: id) }
                }
                Button("取消", role: .cancel) { deletingPersonID = nil }
            } message: {
                Text("この人物を含む写真対応履歴も、記録ごと削除します。同じ記録内の他の人物の対応も削除されます。登録人物一覧の他の人物、元写真、編集履歴は残ります。この登録を使った以後の照合はできなくなります。")
            }
            .confirmationDialog("現在の解析で対応履歴を作り直しますか？", isPresented: $confirmAssignmentReset,
                                titleVisibility: .visible) {
                Button("この写真の対応履歴を置き換える", role: .destructive) {
                    Task { await model.resetAssignmentsToCurrentAnalysis() }
                }
                Button("取消", role: .cancel) { }
            } message: {
                Text("この写真の古い人物対応履歴だけを、現在の解析に対応した空の履歴へ置き換えます。元に戻す機能はありません。登録人物・原本・編集履歴は変更しません。")
            }
            .onDisappear { model.registrationConsent = false; model.cancel() }
        }
    }

    @ViewBuilder
    private func facePreview(_ image: UIImage) -> some View {
        GeometryReader { geometry in
            if let cg = image.cgImage {
                let scale = min(geometry.size.width / CGFloat(cg.width), geometry.size.height / CGFloat(cg.height))
                let width = CGFloat(cg.width) * scale
                let height = CGFloat(cg.height) * scale
                ZStack(alignment: .topLeading) {
                    Image(uiImage: image).resizable().frame(width: width, height: height)
                    ForEach(Array(model.faces.enumerated()), id: \.element.target.faceTargetID) { index, face in
                        let row = face.inputGeometry
                        if row.count >= 4, row.prefix(4).allSatisfy(\.isFinite), row[2] > 0, row[3] > 0 {
                            Button {
                                model.selectedFaceID = face.target.faceTargetID
                                model.registrationConsent = false
                            } label: {
                                ZStack(alignment: .topLeading) {
                                    Rectangle().stroke(model.selectedFaceID == face.target.faceTargetID ? Color.yellow : Color.cyan, lineWidth: 3)
                                    Text("\(index + 1)").font(.caption.bold()).padding(3)
                                        .foregroundStyle(.black).background(.yellow)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .frame(width: CGFloat(row[2]) * scale, height: CGFloat(row[3]) * scale)
                            .offset(x: CGFloat(row[0]) * scale, y: CGFloat(row[1]) * scale)
                            .disabled(model.isBusy)
                            .accessibilityLabel("顔 \(index + 1)を選ぶ")
                        }
                    }
                }
                .frame(width: width, height: height, alignment: .topLeading).clipped()
                .frame(width: geometry.size.width, height: geometry.size.height)
            }
        }
    }

    private var registeredPeople: some View {
        Section("端末内の登録人物（\(model.people.count)件）") {
            Text("登録データの削除は元写真や編集履歴を削除しません。")
                .font(.footnote)
            if model.people.isEmpty { Text("登録人物はありません。") }
            ForEach(model.people, id: \.id) { person in
                HStack {
                    VStack(alignment: .leading) {
                        Text(person.displayName.isEmpty ? "名前未設定" : person.displayName)
                        Text(person.id.uuidString).font(.caption2).foregroundStyle(.secondary)
                        if let sources = person.sources, !sources.isEmpty {
                            Text("登録元写真 \(Set(sources.map(\.assetID)).count) 件の参照を保持（写真のコピーではありません）")
                                .font(.caption2).foregroundStyle(.secondary)
                        } else {
                            Text("登録元不明（旧形式）。新しい登録元は推測しません。")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    Button("削除", role: .destructive) { deletingPersonID = person.id }
                        .disabled(model.isBusy)
                }
            }
        }
    }

    private func faceLabel(_ id: UUID) -> String {
        guard let index = model.faces.firstIndex(where: { $0.target.faceTargetID == id }) else { return "別の顔対象" }
        return "顔 \(index + 1)"
    }

    private func modelState(_ value: LocalFaceModelStatus.Model) -> some View {
        VStack(alignment: .leading) {
            Text("\(value.modelID) / \(value.fixedVersion)")
            Text(value.storageDescription).font(.caption)
            Text(value.permissionDescription)
                .font(.caption).foregroundStyle(.secondary)
        }
    }

    private func pendingLabel(_ reason: PersonFaceBrightnessPlan.PendingReason) -> String {
        switch reason {
        case .personNotInConsentedGallery: return "現在の登録一覧に人物がありません"
        case .noExplicitPhotoAssignment: return "この写真の顔への手動対応がありません"
        case .unknownRegion: return "対応する補正領域が見つかりません"
        case .ambiguousRegion: return "補正領域の対応が曖昧です"
        }
    }


    private func decisionLabel(_ decision: FaceIdentity.Decision) -> String {
        switch decision {
        case let .matched(personID):
            let name = model.people.first(where: { $0.id == personID.value })?.displayName
            return "一致候補: \(name.flatMap { $0.isEmpty ? nil : $0 } ?? personID.value.uuidString)"
        case .ambiguous(.insufficientMargin): return "保留（候補差が不足）"
        case .ambiguous(.competingFaces): return "保留（複数の顔が同じ人物候補）"
        case .unknown: return "該当人物なし／閾値未達"
        }
    }
}

@MainActor
private struct LocalModelNoticesView: View {
    var body: some View {
        List {
            Section {
                Text(LocalModelNotices.scopeExplanation).font(.footnote)
                Text("YuNet / SFace 配布版: \(PinnedFaceModels.revision)")
                    .font(.caption).textSelection(.enabled)
            }
            ForEach(LocalModelNotices.notices) { notice in
                NavigationLink {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("\(notice.title) — \(notice.version)").font(.headline)
                            Text("ライセンス: \(notice.license)")
                            Text("商用利用：未確認／再配布：未確認").font(.footnote)
                            Link("公式の固定版出典を開く", destination: notice.source)
                            Text(notice.source.absoluteString).font(.caption).textSelection(.enabled)
                            if let body = LocalModelNotices.text(for: notice) {
                                Text(body).font(.system(.footnote, design: .monospaced))
                                    .textSelection(.enabled)
                            } else {
                                Text("ライセンス本文がアプリに収録されていないか、読み込めません。本文確認済みとして扱いません。")
                                    .foregroundStyle(.red)
                            }
                        }.padding()
                    }.navigationTitle(notice.title)
                } label: {
                    VStack(alignment: .leading) {
                        Text(notice.title)
                        Text("\(notice.version) · \(notice.license)").font(.caption)
                    }
                }
            }
        }.navigationTitle("モデルのライセンス")
    }
}
