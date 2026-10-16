import SwiftUI
import UIKit
import SuiteCore

/// Manual input-frame preview with an explicit parent-owned edit action.
@MainActor
struct LocalRetouchPreviewSection: View {
    @ObservedObject var model: LocalPeopleModel
    let referenceImage: UIImage?
    var onApply: (() -> Void)? = nil

    var body: some View {
        Section("手動の局所補正・未保存プレビュー") {
            Text("青枠を補正し、赤枠を保護します。自動肌認識ではありません。プレビューでは保存せず、確定ボタンで編集履歴に追加します。原本は変更しません。")
                .font(.footnote)
            Text("未編集プロキシ（\(model.manualInputWidth) × \(model.manualInputHeight) px）に既存の局所補正と今回の候補を描画します。他の色調整・トリミングはこの見本には含みません。")
                .font(.caption)
            if let image = referenceImage, image.imageOrientation == .up, image.cgImage != nil {
                reference(image).frame(height: 260)
            }
            Picker("処理", selection: $model.manualRetouchEffect) {
                Text("局所平滑化").tag(LocalPeopleModel.ManualRetouchEffect.smoothing)
                Text("同じ写真からクローン修復").tag(LocalPeopleModel.ManualRetouchEffect.clone)
            }
            Text("矩形は左上原点、0〜1の割合です。X＋幅、Y＋高さは1以下にしてください。")
                .font(.caption)
            fields(prefix: "選択", x: $model.manualXText, y: $model.manualYText,
                   width: $model.manualWidthText, height: $model.manualHeightText)
            Toggle("保護矩形を指定", isOn: $model.manualProtectionEnabled)
            if model.manualProtectionEnabled {
                fields(prefix: "保護", x: $model.manualProtectionXText, y: $model.manualProtectionYText,
                       width: $model.manualProtectionWidthText, height: $model.manualProtectionHeightText)
            }
            number("強さ（0〜1）", text: $model.manualStrengthText)
            if model.manualRetouchEffect == .smoothing {
                number("半径（入力画像のpx、0より大〜32）", text: $model.manualRadiusText)
                Text("選択・保護範囲を考慮した局所平均です。肌や傷跡の自動判別ではありません。")
                    .font(.caption)
            } else {
                number("参照位置のX差（整数px、右が＋）", text: $model.manualOffsetXText)
                number("参照位置のY差（整数px、上が＋）", text: $model.manualOffsetYText)
                Text("参照元＝選択位置＋指定差。別写真・生成・自動ヒーリングは使いません。")
                    .font(.caption)
            }
            Button("手動補正をプレビュー") { Task { await model.previewManualRetouch() } }
                .disabled(model.isBusy || !model.canPreviewManualRetouch || referenceImage?.imageOrientation != .up || referenceImage?.cgImage == nil)
            Text(model.status).font(.footnote)
            if let result = model.manualRetouchPreview, let image = UIImage(data: result.png) {
                Text("未保存の結果").font(.headline)
                Image(uiImage: image).resizable().scaledToFit()
                    .accessibilityLabel("手動局所補正の未保存プレビュー")
                Text("設定や写真を変えるとこの結果は失効します。")
                    .font(.caption)
                if let onApply {
                    Button("この局所補正を確定して編集に追加") { onApply() }
                        .disabled(model.isBusy)
                    Text("既存の局所補正を残して1レイヤー追加します。大判TIFFは分割描画経路を使用します。通常原寸・大判とも資源や形式の上限を超える場合は停止します。")
                        .font(.caption)
                }
            }
        }
        .disabled(model.isBusy)
    }

    private func number(_ title: String, text: Binding<String>) -> some View {
        TextField(title, text: text).textInputAutocapitalization(.never).autocorrectionDisabled()
            .accessibilityLabel(title)
    }
    private func fields(prefix: String, x: Binding<String>, y: Binding<String>,
                        width: Binding<String>, height: Binding<String>) -> some View {
        Group {
            number("\(prefix) X", text: x)
            number("\(prefix) Y", text: y)
            number("\(prefix) 幅", text: width)
            number("\(prefix) 高さ", text: height)
        }
    }
    private func rectangle(_ x: String, _ y: String, _ width: String, _ height: String) -> CGRect? {
        guard let x = Double(x), let y = Double(y), let width = Double(width), let height = Double(height),
              [x, y, width, height].allSatisfy(\.isFinite), x >= 0, y >= 0,
              width > 0, height > 0, x + width <= 1, y + height <= 1 else { return nil }
        return CGRect(x: x, y: y, width: width, height: height)
    }
    private func reference(_ image: UIImage) -> some View {
        GeometryReader { geometry in
            let pixelWidth = CGFloat(image.cgImage!.width), pixelHeight = CGFloat(image.cgImage!.height)
            let scale = min(geometry.size.width / pixelWidth, geometry.size.height / pixelHeight)
            let size = CGSize(width: pixelWidth * scale, height: pixelHeight * scale)
            ZStack(alignment: .topLeading) {
                Image(uiImage: image).resizable().frame(width: size.width, height: size.height)
                if let rect = rectangle(model.manualXText, model.manualYText,
                                        model.manualWidthText, model.manualHeightText) {
                    overlay(rect, size: size, color: .blue)
                }
                if model.manualProtectionEnabled,
                   let rect = rectangle(model.manualProtectionXText, model.manualProtectionYText,
                                        model.manualProtectionWidthText, model.manualProtectionHeightText) {
                    overlay(rect, size: size, color: .red)
                }
            }
            .frame(width: size.width, height: size.height)
            .position(x: geometry.size.width / 2, y: geometry.size.height / 2)
        }
        .accessibilityLabel("同じ入力写真。青は選択範囲、赤は保護範囲")
    }
    private func overlay(_ rect: CGRect, size: CGSize, color: Color) -> some View {
        Rectangle().stroke(color, lineWidth: 2)
            .frame(width: rect.width * size.width, height: rect.height * size.height)
            .offset(x: rect.minX * size.width, y: rect.minY * size.height)
            .allowsHitTesting(false)
    }
}
