import SwiftUI
import UIKit

/// One proposal bitmap at a time; never saves/applies a correction or labels skin.
@MainActor
struct LocalFaceRegionProposalView: View {
    let result: LocalFaceRegionProposal.Result
    let referenceImage: UIImage?
    @State private var selectedID: UUID?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("顔内の幾何候補（未適用）").font(.headline)
            Text("色付き部分は顔の点配置から作った候補です。肌・しわ・傷跡を認識した結果ではありません。保存や補正適用は行っていません。")
                .font(.footnote)
            Text("開いた顎輪郭の端を結んだ下顔域が基準です。額や顔全体の領域ではありません。必ず手動で確認してください。")
                .font(.caption)
            if !result.proposals.isEmpty {
                Picker("表示する候補", selection: $selectedID) {
                    Text("選択してください").tag(nil as UUID?)
                    ForEach(Array(result.proposals.enumerated()), id: \.element.faceTargetID) { index, proposal in
                        Text("顔 \(index + 1)").tag(Optional(proposal.faceTargetID))
                    }
                }
                if let proposal = result.proposals.first(where: { $0.faceTargetID == selectedID }) {
                    MaskPreview(referenceImage: referenceImage, width: proposal.width,
                        height: proposal.height, bottomUpMask: proposal.maskL8BottomUp)
                    Text("候補画素数: \(proposal.coveragePixelCount)").font(.caption)
                }
            } else {
                Text("表示できる候補はありません。")
            }
            ForEach(result.pending, id: \.faceTargetID) { pending in
                Text("顔 \(pending.faceTargetID.uuidString.prefix(8))：保留（\(reason(pending.reason.rawValue))）")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private func reason(_ value: String) -> String {
        switch value {
        case "missingRegions": "必要な顔の点が不足"
        case "invalidPolygon": "候補形状を確定できない"
        case "missingPersonMask": "対応する人物マスクがない"
        case "emptyIntersection": "安全に提示できる範囲がない"
        case "ambiguousFace": "顔の対応が曖昧"
        default: "未対応の保留理由"
        }
    }

    @MainActor
    private struct MaskPreview: View {
        let referenceImage: UIImage?
        let width: Int
        let height: Int
        let bottomUpMask: Data
        @State private var overlay: UIImage?
        @State private var message: String?
        @State private var renderedKey: Key?
        private struct Key: Hashable {
            let width: Int, height: Int
            let mask: Data
            let reference: ObjectIdentifier?
        }
        private var key: Key { Key(width: width, height: height, mask: bottomUpMask,
                                   reference: referenceImage.map(ObjectIdentifier.init)) }

        var body: some View {
            VStack(alignment: .leading) {
                if let referenceImage, renderedKey == key, let overlay {
                    ZStack {
                        Image(uiImage: referenceImage).resizable().scaledToFit()
                        Image(uiImage: overlay).resizable().scaledToFit().opacity(0.45)
                    }
                    .accessibilityLabel("同じ入力写真に重ねた顔内候補。補正は未適用")
                }
                if let message { Text(message).font(.caption).foregroundStyle(.orange) }
            }
            .task(id: key) { makeOverlay() }
        }

        private func makeOverlay() {
            overlay = nil; renderedKey = nil; message = nil
            guard width > 0, height > 0, width <= 1600, height <= 1600,
                  bottomUpMask.count == width * height,
                  let referenceImage, referenceImage.imageOrientation == .up,
                  let original = referenceImage.cgImage,
                  original.width == width, original.height == height else {
                message = "参照写真の寸法・向きと候補が一致しないため、重ね表示を保留しました。"
                return
            }
            // UIKit/CGImage scanlines below are TOP-DOWN. The analysis mask is
            // BOTTOM-UP, so reverse complete rows exactly once (not points twice).
            var rgba = Data(count: width * height * 4)
            for topY in 0..<height {
                if Task.isCancelled { return }
                let bottomY = height - 1 - topY
                for x in 0..<width {
                    let alpha = bottomUpMask[bottomY * width + x]
                    let index = (topY * width + x) * 4
                    // Premultiplied cyan, with coverage in alpha.
                    rgba[index] = 0; rgba[index + 1] = alpha
                    rgba[index + 2] = alpha; rgba[index + 3] = alpha
                }
            }
            guard !Task.isCancelled, let provider = CGDataProvider(data: rgba as CFData),
                  let color = CGColorSpace(name: CGColorSpace.sRGB),
                  let image = CGImage(width: width, height: height, bitsPerComponent: 8,
                    bitsPerPixel: 32, bytesPerRow: width * 4, space: color,
                    bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
                    provider: provider, decode: nil, shouldInterpolate: false, intent: .defaultIntent) else {
                message = "候補の表示画像を作成できませんでした。"
                return
            }
            overlay = UIImage(cgImage: image, scale: 1, orientation: .up)
            renderedKey = key
        }
    }
}
