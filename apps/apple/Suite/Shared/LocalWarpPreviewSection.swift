import SwiftUI
import UIKit
import SuiteCore

@MainActor
struct LocalWarpPreviewSection: View {
    @ObservedObject var model: LocalPeopleModel
    let referenceImage: UIImage?
    var onApply: (() -> Void)? = nil
    var onRemove: (() -> Void)? = nil
    @State private var confirmRemove = false
    @State private var appendError: String?
    private let kinds: [LocalWarpFieldBuilder.Kind] = [
        .translate, .scaleX, .scaleY, .scale, .rotate, .mShape, .smooth, .restore, .pushLeft
    ]

    var body: some View {
        Section("手動形状変形・未保存の累積プレビュー") {
            Text("未編集プロキシ（\(model.manualInputWidth) × \(model.manualInputHeight) px）に保存済みの変形と今回の操作を描画します。このサンプルは他の局所補正・色調整・トリミングを含みません。自動体型補正ではありません。")
                .font(.footnote)
            Text("追加済み \(model.warpOperationCount) 操作 ／ やり直し \(model.warpRedoCount) 操作")
                .font(.headline)
            HStack {
                Button("戻す") { appendError = nil; model.undoWarpOperation() }
                    .disabled(!model.canUndoWarp)
                Button("やり直し") { appendError = nil; model.redoWarpOperation() }
                    .disabled(!model.canRedoWarp)
                Button("操作列をリセット", role: .destructive) {
                    appendError = nil; model.resetWarpOperations()
                }.disabled(model.warpOperationCount == 0 && model.warpRedoCount == 0)
            }
            Text("長いドラッグは移動操作に分割し、この画面ではストローク単位で戻す・やり直します。保存後に開き直すと各操作単位になります。写真変更で操作列は消去されます。変更後は再プレビューしてください。")
                .font(.caption)
            Text("リセットはこの画面の操作列を空にするだけです。保存済みの変形を取り消す場合は、下の削除ボタンを使ってください。")
                .font(.caption)
            if let onRemove {
                Button("保存済みの形状変形を削除", role: .destructive) { confirmRemove = true }
                    .disabled(!model.canRemoveSavedWarp)
                    .confirmationDialog("保存済みの形状変形を削除しますか？", isPresented: $confirmRemove,
                                        titleVisibility: .visible) {
                        Button("形状変形だけを削除", role: .destructive) {
                            guard model.canRemoveSavedWarp else { return }
                            onRemove()
                        }
                        Button("キャンセル", role: .cancel) {}
                    } message: {
                        Text("この画面の未保存操作も閉じます。ほかの補正と原本は残ります。削除は編集履歴のUndoで戻せます。")
                    }
            }
            if let image = referenceImage, image.imageOrientation == .up, image.cgImage != nil {
                LocalWarpDragCanvas(image: image, enabled: model.canPreviewManualWarp) { sx, sy, ex, ey in
                    do {
                        try model.prepareWarpDrag(startX: sx, startY: sy, endX: ex, endY: ey)
                        appendError = nil
                    } catch {
                        appendError = "半径X/Yと画像内の移動を確認してください。分割後の総操作数は128以内です。"
                    }
                }
                .frame(height: 300)
                Text("元画像をドラッグすると分割した移動候補を入力します。半径を先に指定し、プレビュー→操作列に追加で一括確定してください。数値を変更するとドラッグ候補は破棄され単一操作に戻ります。自動保存は行いません。")
                    .font(.caption)
            }
            Picker("操作", selection: $model.warpKind) {
                ForEach(kinds, id: \.rawValue) { kind in
                    Text(label(kind)).tag(kind)
                }
            }
            Text("中心は左上原点の0〜1、半径X/Yも画像幅/高さに対する割合です。操作範囲は楕円になります。")
                .font(.caption)
            field("中心X", text: $model.warpCenterXText)
            field("中心Y", text: $model.warpCenterYText)
            field("半径X（幅比）", text: $model.warpRadiusXText)
            field("半径Y（高さ比）", text: $model.warpRadiusYText)
            field("量（−1〜1）", text: $model.warpAmountText)
            field("X移動（−1〜1、右が＋）", text: $model.warpDXText)
            field("Y移動（−1〜1、下が＋）", text: $model.warpDYText)
            field("回転量（−1〜1、1＝30度）", text: $model.warpAngleText)
            Text("使用しない値は0を指定してください。移動量は半径に対する係数です。")
                .font(.caption)
            if model.warpOperationCount == 0 && (model.warpKind == .smooth || model.warpKind == .restore) {
                Text("平滑化・復元は既存の変位を整える操作です。まだ追加済み操作がないため、この候補だけでは見た目は変わりません。")
                    .font(.caption)
            }
            Toggle("保護矩形を指定", isOn: $model.warpProtectionEnabled)
            Text("現在の保護矩形は、過去に追加した操作を含む列全体に適用します。各操作を追加した時点の保護設定を保持する方式ではありません。")
                .font(.caption)
            if model.warpProtectionEnabled {
                Text("保護矩形も左上原点の0〜1です。保護により安全な座標対応を作れない場合は、結果を出さず停止します。")
                    .font(.caption)
                field("保護X", text: $model.warpProtectionXText)
                field("保護Y", text: $model.warpProtectionYText)
                field("保護幅", text: $model.warpProtectionWidthText)
                field("保護高さ", text: $model.warpProtectionHeightText)
            }
            Button("操作列＋入力候補をプレビュー") {
                appendError = nil
                Task { await model.previewManualWarp() }
            }
                .disabled(model.isBusy || !model.canPreviewManualWarp ||
                          referenceImage?.imageOrientation != .up || referenceImage?.cgImage == nil)
            Button("確認した候補を操作列に追加") {
                do { try model.appendWarpCandidate(); appendError = nil }
                catch { appendError = "候補を追加できません。最新の入力でプレビューを作り直してください。" }
            }.disabled(model.isBusy || !model.canAppendWarpCandidate)
            Button("追加済みの操作列だけをプレビュー") {
                appendError = nil
                Task { await model.previewCurrentWarpOperations() }
            }.disabled(model.isBusy || model.warpOperationCount == 0 ||
                       referenceImage?.imageOrientation != .up || referenceImage?.cgImage == nil)
            Text("候補プレビューだけでは操作列に追加されません。最新の候補が正常に描画された後、追加ボタンで確定します。")
                .font(.caption)
            if let onApply {
                Button("操作列を確定して編集に保存") { onApply() }
                    .disabled(model.isBusy || !model.canCommitManualWarp)
                Text("追加済みの操作列だけをプレビューした後に保存できます。既存の編集履歴へ反映します。通常描画は最大8MPなどの資源制限があり、大判の変形出力は未対応です。")
                    .font(.caption)
            }
            if let appendError { Text(appendError).foregroundStyle(.orange).font(.caption) }
            Text(model.status).font(.footnote)
            if let result = model.warpPreview, let image = UIImage(data: result.png) {
                Text("未保存の変形結果").font(.headline)
                Image(uiImage: image).resizable().scaledToFit()
                    .accessibilityLabel("手動変形の未保存プレビュー")
                Text("入力を変えると結果は失効します。原本や編集履歴は変更していません。")
                    .font(.caption)
            }
        }
        .disabled(model.isBusy)
    }

    private func field(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text).textInputAutocapitalization(.never)
            .autocorrectionDisabled().accessibilityLabel(title)
    }
    private func label(_ kind: LocalWarpFieldBuilder.Kind) -> String {
        switch kind {
        case .translate: "移動"
        case .scaleX: "横幅"
        case .scaleY: "高さ"
        case .scale: "拡大・縮小"
        case .rotate: "回転"
        case .mShape: "M字変形"
        case .smooth: "変位を平滑化"
        case .restore: "変位を復元"
        case .pushLeft: "上下で逆方向に押す"
        }
    }
}
