import Foundation
import SwiftUI
import SuiteCore

/// Explicit, one-shot large-print entry. Does not rewrite the saved export configuration.
@MainActor
struct LargePrintExportSheet: View {
    @ObservedObject var model: EditorModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("保存済み設定から大判TIFF") {
                    Text(model.selectedAsset?.originalFilename ?? "写真未選択")
                    if let crop = try? model.parameters.cropSettings(),
                       let width = crop.widthMM, let height = crop.heightMM {
                        Text("実寸: \(width.formatted()) × \(height.formatted()) mm / \(crop.requestedDPI.formatted()) dpi")
                    } else {
                        Text("先にCrop・印刷設定で実寸とdpiを保存してください。")
                    }
                    if let settings = try? model.parameters.exportSettings() {
                        Text("保存設定: \(settings.format.rawValue) / \(settings.bitDepth)bit / \(settings.colorSpace.rawValue) / \(settings.requestedDPI.formatted()) dpi")
                        Text("圧縮: \(settings.tiffCompression.rawValue) / Alpha: \(settings.preserveAlpha ? "保持" : "なし") / Metadata: \(settings.metadata.rawValue)")
                    }
                    Text("TIFF・8/16bit・非圧縮・Alphaなし・Metadata除去が必要です。sRGB / Adobe RGBは実pixel変換します。実寸と整数dpiを一致させてください。設定を自動で上書きしません。")
                    Text("変更する場合はこの画面を閉じ、Crop・印刷設定で『大判TIFF用設定』を選択するか各設定を個別に指定し、Recipeへ保存してください。")
                    Text("B0倍判を含め、必要な画素数を実寸から計算します。通常補間は新しい細部を復元するAI処理ではありません。")
                }
                Section("今回だけの許可") {
                    Toggle("画素不足の場合の通常補間を許可", isOn: $model.allowLargePrintResampling)
                        .accessibilityIdentifier("largePrint.resamplingConsent")
                    Text("初期値はOFF。写真切替・実行後に解除されます。OFFでは画素不足を拒否し、dpiタグだけ変更した画像は出しません。")
                        .font(.footnote)
                }
                Section {
                    Button("保存完了を待って大判TIFFを書き出す") {
                        model.exportLargePrint()
                        dismiss()
                    }
                    .disabled(model.isBusy || model.selectedAsset == nil)
                    .accessibilityIdentifier("largePrint.export")
                    Text("原本から処理し、終了後は既存の共有画面で「ファイルに保存」等を選べます。取消は処理状況画面から行えます。Macビルド・実機動作は未確認です。")
                        .font(.footnote)
                }
            }
            .navigationTitle("大判出力")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() } } }
            .onDisappear { model.allowLargePrintResampling = false }
        }
    }
}

/// Shared controls only. iPhone/iPad keep their existing, separate outer layouts.
/// Bind to a parent-owned draft; onConfirm commits Crop + Export together into the existing Recipe.
/// sourcePixels is EXIF-oriented Original dimensions BEFORE the Recipe's user rotation, never Proxy dimensions.
@MainActor
struct CropExportControls: View {
    @Binding var crop: CropSettings
    @Binding var export: ExportSettings
    let sourcePixels: PixelDimensions?
    let renderWarnings: [String]
    let onConfirm: () -> Void
    @State private var category = CropCategory.ratio

    init(crop: Binding<CropSettings>, export: Binding<ExportSettings>, sourcePixels: PixelDimensions?,
         renderWarnings: [String] = [], onConfirm: @escaping () -> Void) {
        self._crop = crop
        self._export = export
        self.sourcePixels = sourcePixels
        self.renderWarnings = renderWarnings
        self.onConfirm = onConfirm
    }

    private enum CropCategory: String, CaseIterable, Identifiable {
        case ratio = "Ratio", sns = "SNS", photoPrint = "Photo Print"
        case aSeries = "A Series", bSeries = "B Series", custom = "Custom"
        var id: String { rawValue }
    }

    private var displaySource: (width: Int, height: Int)? {
        guard let sourcePixels, sourcePixels.width > 0, sourcePixels.height > 0 else { return nil }
        return crop.rotation % 180 == 0 ? (sourcePixels.width, sourcePixels.height) : (sourcePixels.height, sourcePixels.width)
    }

    private var resolution: ResolutionAssessment? {
        guard let sourcePixels else { return nil }
        return try? CropExportMath.resolutionAssessment(sourceWidth: sourcePixels.width,
            sourceHeight: sourcePixels.height, crop: crop)
    }

    private var validationMessage: String? {
        do {
            try crop.validate()
            try export.validate()
            guard let sourcePixels else { return "Originalのpixel dimensions未確認です。Proxyの寸法で代用せず、確認後に構図を確定します。" }
            guard crop.requestedDPI == export.requestedDPI else { return "CropとExportのdpiが一致していません。予定dpiを再設定してください。" }
            _ = try CropExportMath.resolutionAssessment(sourceWidth: sourcePixels.width,
                sourceHeight: sourcePixels.height, crop: crop)
            return nil
        } catch { return "設定値を確認してください: \(error.localizedDescription)" }
    }

    private var printPresets: [PrintPreset] {
        PrintPresetCatalog.presets.filter { preset in
            switch category {
            case .aSeries: preset.category == .aSeries
            case .bSeries: preset.category == .bSeries
            case .photoPrint: preset.category == .photoPrint
            default: false
            }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 24) {
            Text("Crop / Print / Export").font(.title3.bold()).accessibilityAddTraits(.isHeader)
            Text("Proxyで構図を確認し、設定をRecipeへ保存します。Originalは変更しません。")
                .font(.footnote).foregroundStyle(.secondary)
            cropPresetSection
            geometrySection
            resolutionSection
            exportSection
            if let message = validationMessage {
                Label(message, systemImage: "exclamationmark.triangle")
                    .font(.footnote).foregroundStyle(.orange)
                    .accessibilityIdentifier("crop.validation")
            }
            ForEach(Array(renderWarnings.enumerated()), id: \.offset) { _, warning in
                Label(warning, systemImage: "info.circle").font(.footnote).foregroundStyle(.orange)
            }
            Text("Nativeのビルド・実RAW・iPhone/iPad実機検証は未完了です。設定を保持できても、未対応処理を成功扱いせずFinalで明示的に拒否します。AI Upscaleは自動実行しません。")
                .font(.footnote).foregroundStyle(.secondary)
            Button(action: onConfirm) {
                Label("構図とExport設定をRecipeへ保存", systemImage: "checkmark.circle")
                    .frame(maxWidth: .infinity, minHeight: 48)
            }
            .buttonStyle(.borderedProminent)
            .disabled(validationMessage != nil)
            .accessibilityIdentifier("crop.confirm")
        }
        .onAppear {
            category = initialCategory
            fillOriginalRatioIfAbsent()
        }
        .onChange(of: sourcePixels) { _, _ in fillOriginalRatioIfAbsent() }
        .onChange(of: crop.presetID) { _, _ in category = initialCategory }
    }

    private var cropPresetSection: some View {
        GroupBox("Crop preset") {
            VStack(alignment: .leading, spacing: 14) {
                Picker("カテゴリ", selection: $category) {
                    ForEach(CropCategory.allCases) { Text($0.rawValue).tag($0) }
                }.pickerStyle(.menu).accessibilityIdentifier("crop.category")
                if category == .ratio || category == .sns {
                    Menu {
                        ForEach(RatioCatalog.presets, id: \.id) { preset in
                            if category != .sns || ["1:1", "4:5", "9:16", "16:9"].contains(preset.name) {
                                Button(preset.name) { selectRatio(preset) }
                            }
                        }
                    } label: {
                        Label("比率を選択: \(crop.presetName)", systemImage: "aspectratio")
                            .frame(minHeight: 44)
                    }.accessibilityIdentifier("crop.ratioPreset")
                    if crop.presetName == "Custom Ratio" { customRatioFields }
                    if category == .sns {
                        Text("SNSの構図候補です。各SNSの最新入稿仕様への適合を保証する表示ではありません。")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                } else if category == .custom {
                    Button("Custom Sizeを設定") {
                        crop.presetID = "custom.physical"
                        crop.presetName = "Custom Size"
                        crop.customSize = true
                    }.frame(minHeight: 44)
                    physicalSizeFields
                } else {
                    Menu {
                        ForEach(printPresets, id: \.id) { preset in
                            Button(printPresetLabel(preset)) { selectPrint(preset) }
                                .disabled(!preset.available)
                        }
                    } label: {
                        Label("印刷サイズを選択: \(crop.presetName)", systemImage: "printer")
                            .frame(minHeight: 44)
                    }.accessibilityIdentifier("crop.printPreset")
                    Text("実寸を優先して確認してください。ラボ・印刷所の寸法差はCustom Sizeで指定できます。寸法未確定の候補は選択できません。")
                        .font(.footnote).foregroundStyle(.secondary)
                    if let preset = PrintPresetCatalog.presets.first(where: { $0.id == crop.presetID }) {
                        if !preset.notes.isEmpty { Text(preset.notes).font(.footnote).foregroundStyle(.secondary) }
                        if let source = preset.sourceURL, let url = URL(string: source), ["https", "http"].contains(url.scheme ?? "") {
                            Link("選択プリセット寸法の出典", destination: url).font(.footnote)
                        }
                    }
                    Button("この実寸をCustom Sizeで調整") {
                        crop.presetID = "custom.physical"
                        crop.presetName = "Custom Size"
                        crop.customSize = true
                        category = .custom
                    }.frame(minHeight: 44).disabled(crop.widthMM == nil || crop.heightMM == nil)
                }
                Picker("縦横", selection: Binding(get: { crop.orientation }, set: orient)) {
                    Text("Portrait").tag(CropOrientation.portrait)
                    Text("Landscape").tag(CropOrientation.landscape)
                }.pickerStyle(.segmented).accessibilityIdentifier("crop.orientation")
                LabeledContent("Preset", value: crop.presetName)
                if let width = crop.widthMM, let height = crop.heightMM {
                    LabeledContent("実寸", value: "\(decimal(width)) × \(decimal(height)) mm")
                }
                LabeledContent("比率", value: ratioLabel)
                LabeledContent("画像回転", value: "\(crop.rotation)°（既存Recipeと同じ回転）")
            }.padding(.vertical, 8)
        }
    }

    private var customRatioFields: some View {
        VStack(spacing: 12) {
            numberField("比率 幅", value: Binding(get: { crop.cropRatio?.width ?? 1 }, set: {
                crop.cropRatio = CropRatio(width: $0, height: crop.cropRatio?.height ?? 1)
                recenter()
            }))
            numberField("比率 高さ", value: Binding(get: { crop.cropRatio?.height ?? 1 }, set: {
                crop.cropRatio = CropRatio(width: crop.cropRatio?.width ?? 1, height: $0)
                recenter()
            }))
        }
    }

    private var physicalSizeFields: some View {
        VStack(spacing: 12) {
            numberField("幅 mm", value: Binding(get: { crop.widthMM ?? 0 }, set: { updatePhysical(width: $0, height: crop.heightMM) }))
            numberField("高さ mm", value: Binding(get: { crop.heightMM ?? 0 }, set: { updatePhysical(width: crop.widthMM, height: $0) }))
        }
    }

    private var geometrySection: some View {
        GroupBox("構図 / Crop枠") {
            VStack(alignment: .leading, spacing: 14) {
                Text("0〜1の正規化座標です。左上が原点。枠は画面の写真と同じ回転後座標に対応します。")
                    .font(.footnote).foregroundStyle(.secondary)
                numberField("左 x", value: Binding(get: { crop.cropRect.x }, set: {
                    crop.cropRect.x = min(max(0, $0), max(0, 1 - crop.cropRect.width))
                }))
                numberField("上 y", value: Binding(get: { crop.cropRect.y }, set: {
                    crop.cropRect.y = min(max(0, $0), max(0, 1 - crop.cropRect.height))
                }))
                numberField("幅", value: Binding(get: { crop.cropRect.width }, set: resizeWidth))
                if crop.cropRatio == nil {
                    numberField("高さ", value: Binding(get: { crop.cropRect.height }, set: {
                        crop.cropRect.height = min(max(0.001, $0), max(0.001, 1 - crop.cropRect.y))
                    }))
                } else {
                    LabeledContent("高さ（比率連動）", value: decimal(crop.cropRect.height))
                }
                Button("比率に合わせて中央配置", action: recenter).frame(minHeight: 44)
                    .disabled(displaySource == nil)
                    .accessibilityIdentifier("crop.recenter")
                Text("中央配置は構図を変更します。比率を変えた後は写真上の枠を確認してから確定してください。")
                    .font(.footnote).foregroundStyle(.secondary)
            }.padding(.vertical, 8)
        }
    }

    private var resolutionSection: some View {
        GroupBox("予定印刷領域 / 解像度") {
            VStack(alignment: .leading, spacing: 14) {
                numberField("予定dpi", value: Binding(get: { crop.requestedDPI }, set: {
                    crop.requestedDPI = $0
                    export.requestedDPI = $0
                }))
                Button("300dpiに設定") { crop.requestedDPI = 300; export.requestedDPI = 300 }
                    .frame(minHeight: 44)
                if let sourcePixels {
                    LabeledContent("元RAW / Original", value: "\(sourcePixels.width) × \(sourcePixels.height) px")
                } else {
                    Text("Original pixel size: 未確認").foregroundStyle(.orange)
                }
                if let resolution {
                    LabeledContent("Crop後利用可能", value: "\(resolution.available.width) × \(resolution.available.height) px")
                    if let required = resolution.required {
                        LabeledContent("予定pixel dimensions", value: "\(required.width) × \(required.height) px")
                        LabeledContent("推定出力サイズ", value: byteEstimate(required))
                        Text("推定は非圧縮pixel data換算です。JPEG等の実ファイル容量やencoderのメモリ使用量とは異なります。")
                            .font(.footnote).foregroundStyle(.secondary)
                    } else {
                        Text("実寸指定なし: Crop後のpixel dimensionsを維持します。")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    if resolution.needsUpscale {
                        Label("解像度不足 \(decimal(resolution.shortfallPercent))%。指定実寸・dpiを満たすにはUpscaleが必要です。", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange).accessibilityIdentifier("crop.resolutionWarning")
                        if let recommended = resolution.recommendedDPI {
                            Text("現在の画素での推奨上限dpi: \(decimal(recommended))。dpi変更は明示操作で行ってください。")
                                .font(.footnote)
                        }
                        Text("AI Upscaleは未接続です。metadataだけ300dpiにして不足pixelのFinalを出すことはありません。")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                }
            }.padding(.vertical, 8)
        }
    }

    private var exportSection: some View {
        GroupBox("Export設定（Cropから引継ぎ）") {
            VStack(alignment: .leading, spacing: 14) {
                LabeledContent("構図", value: crop.presetName)
                if let width = crop.widthMM, let height = crop.heightMM {
                    LabeledContent("引継いだ実寸", value: "\(decimal(width)) × \(decimal(height)) mm")
                }
                LabeledContent("予定dpi", value: decimal(export.requestedDPI))
                Menu("Export Preset") {
                    Button("Web / SNS") {
                        changeFormat(.jpeg); export.jpegQuality = 100
                        export.colorSpace = .sRGB
                        category = .sns
                    }
                    Button("Standard Photo Print") {
                        changeFormat(.jpeg); export.jpegQuality = 100
                        crop.requestedDPI = 300; export.requestedDPI = 300
                    }
                    Button("Fine Art / Large Print") {
                        changeFormat(.tiff); export.bitDepth = 16
                        export.colorSpace = .adobeRGB; export.tiffCompression = .none
                        crop.requestedDPI = 300; export.requestedDPI = 300
                    }
                    Button("Graphic / Text") {
                        changeFormat(.png)
                    }
                }.frame(minHeight: 44).accessibilityIdentifier("export.preset")
                Text("Export Presetを選んでも既存の構図・実寸を保持します。Fine ArtのAdobe RGBは候補であり、印刷所指定を優先してください。")
                    .font(.footnote).foregroundStyle(.secondary)
                Picker("Format", selection: Binding(get: { export.format }, set: changeFormat)) {
                    Text("JPEG").tag(CropExportFormat.jpeg)
                    Text("TIFF").tag(CropExportFormat.tiff)
                    Text("PNG").tag(CropExportFormat.png)
                }.pickerStyle(.segmented).accessibilityIdentifier("export.format")
                Text("形式を変更すると、その形式で無効なbit depth・TIFF圧縮・Alpha設定を調整します。JPEGは8bit・Alphaなし、PNGは8bit・Alpha保持を初期候補とします。")
                    .font(.footnote).foregroundStyle(.secondary)
                if export.format == .jpeg {
                    Stepper("Quality \(export.jpegQuality)%", value: $export.jpegQuality, in: 1...100)
                        .frame(minHeight: 44).accessibilityIdentifier("export.jpegQuality")
                    Text("標準は100%。ユーザーが明示的に変更した場合だけ品質を下げます。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if export.format == .tiff {
                    Button("大判TIFF用設定: 非圧縮・Alphaなし・Metadata除去") {
                        export.tiffCompression = .none
                        export.preserveAlpha = false
                        export.metadata = .remove
                    }
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("export.largePrintSettings")
                    Text("この明示操作は実寸・dpi・bit depth・色空間を変更しません。大判出力には整数dpiを指定してください。")
                        .font(.footnote).foregroundStyle(.secondary)
                    Picker("TIFF bit depth", selection: $export.bitDepth) {
                        Text("8bit").tag(8)
                        Text("16bit").tag(16)
                    }.pickerStyle(.segmented)
                    Picker("TIFF圧縮", selection: $export.tiffCompression) {
                        Text("非圧縮").tag(TIFFCompression.none)
                        Text("可逆 LZW").tag(TIFFCompression.lzw)
                    }.pickerStyle(.menu)
                    Button("印刷候補: 16bit + Adobe RGB") {
                        export.bitDepth = 16
                        export.colorSpace = .adobeRGB
                    }.frame(minHeight: 44)
                    Text("候補は強制しません。印刷所の指定を優先してください。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if export.format == .png {
                    Toggle("Alpha Channelを保持", isOn: $export.preserveAlpha)
                        .frame(minHeight: 44).accessibilityIdentifier("export.pngAlpha")
                    Text("PNGは可逆保存です。既存Alphaの保持であり、背景を新たに除去する機能ではありません。")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Picker("Color Space", selection: $export.colorSpace) {
                    Text("sRGB").tag(ExportColorSpace.sRGB)
                    Text("Adobe RGB").tag(ExportColorSpace.adobeRGB)
                }.pickerStyle(.menu).accessibilityIdentifier("export.colorSpace")
                Text("色空間は実pixelのprofile変換が必要です。単なるICCタグ置換ではありません。")
                    .font(.footnote).foregroundStyle(.secondary)
                Picker("Metadata", selection: $export.metadata) {
                    Text("保持（renderer対応範囲）").tag(ExportMetadataPolicy.preserve)
                    Text("除去").tag(ExportMetadataPolicy.remove)
                }.pickerStyle(.menu)
                TextField("File Naming", text: $export.fileNameTemplate)
                    .textFieldStyle(.roundedBorder).textInputAutocapitalization(.never)
                    .autocorrectionDisabled().accessibilityIdentifier("export.fileNaming")
                Text("{original} / {sequence}。出力名は原本と分離し、既存ファイルを上書きしません。")
                    .font(.footnote).foregroundStyle(.secondary)
                Text("Batch Exportは逐次処理候補・native未検証です。一括書き出しは各写真の保存済みRecipeとExport設定を使用します。このパネルの変更は選択写真だけに保存されます。")
                    .font(.footnote).foregroundStyle(.orange)
            }.padding(.vertical, 8)
        }
    }

    private var initialCategory: CropCategory {
        if crop.customSize { return .custom }
        if let preset = PrintPresetCatalog.presets.first(where: { $0.id == crop.presetID }) {
            switch preset.category {
            case .aSeries: return .aSeries
            case .bSeries: return .bSeries
            case .photoPrint: return .photoPrint
            }
        }
        return category == .sns ? .sns : .ratio
    }

    private var ratioLabel: String {
        if let ratio = crop.cropRatio { return "\(decimal(ratio.width)) : \(decimal(ratio.height))" }
        return crop.presetID == "ratio.original" ? "Original" : "Free"
    }

    private func fillOriginalRatioIfAbsent() {
        // Source dimensions arrive asynchronously; preserve any existing or user-selected crop draft.
        guard crop.presetID == "ratio.original", crop.cropRatio == nil, let size = displaySource else { return }
        crop.cropRatio = CropRatio(width: Double(size.width), height: Double(size.height))
        crop.orientation = size.width < size.height ? .portrait : .landscape
    }

    private func selectRatio(_ preset: CropRatioPreset) {
        crop.presetID = preset.id
        crop.presetName = preset.name
        crop.widthMM = nil
        crop.heightMM = nil
        crop.customSize = false
        crop.cropRatio = preset.ratio
        if preset.name == "Custom Ratio" { crop.cropRatio = CropRatio(width: 1, height: 1) }
        if preset.name == "Original", let size = displaySource {
            crop.cropRatio = CropRatio(width: Double(size.width), height: Double(size.height))
        }
        if let ratio = crop.cropRatio { crop.orientation = ratio.width < ratio.height ? .portrait : .landscape }
        recenter()
    }

    private func selectPrint(_ preset: PrintPreset) {
        guard preset.available, let width = preset.widthMM, let height = preset.heightMM else { return }
        crop.presetID = preset.id
        crop.presetName = preset.name
        crop.customSize = false
        crop.widthMM = crop.orientation == .portrait ? min(width, height) : max(width, height)
        crop.heightMM = crop.orientation == .portrait ? max(width, height) : min(width, height)
        crop.cropRatio = CropRatio(width: crop.widthMM!, height: crop.heightMM!)
        recenter()
    }

    private func orient(_ orientation: CropOrientation) {
        crop.orientation = orientation
        if let width = crop.widthMM, let height = crop.heightMM {
            crop.widthMM = orientation == .portrait ? min(width, height) : max(width, height)
            crop.heightMM = orientation == .portrait ? max(width, height) : min(width, height)
            crop.cropRatio = CropRatio(width: crop.widthMM!, height: crop.heightMM!)
        } else if let ratio = crop.cropRatio {
            crop.cropRatio = orientation == .portrait
                ? CropRatio(width: min(ratio.width, ratio.height), height: max(ratio.width, ratio.height))
                : CropRatio(width: max(ratio.width, ratio.height), height: min(ratio.width, ratio.height))
        }
        recenter()
    }

    private func updatePhysical(width: Double?, height: Double?) {
        crop.presetID = "custom.physical"
        crop.presetName = "Custom Size"
        crop.customSize = true
        crop.widthMM = width
        crop.heightMM = height
        if let width, let height, width > 0, height > 0 {
            crop.cropRatio = CropRatio(width: width, height: height)
            crop.orientation = width < height ? .portrait : .landscape
            recenter()
        }
    }

    private func recenter() {
        guard let size = displaySource else { return }
        guard let ratio = crop.cropRatio else { crop.cropRect = .full; return }
        if let rect = try? CropExportMath.centeredRect(sourceWidth: size.width, sourceHeight: size.height, ratio: ratio) {
            crop.cropRect = rect
        }
    }

    private func resizeWidth(_ requested: Double) {
        var width = min(max(0.001, requested), max(0.001, 1 - crop.cropRect.x))
        if let ratio = crop.cropRatio, let size = displaySource, ratio.width > 0, ratio.height > 0 {
            let factor = Double(size.width) / Double(size.height) * ratio.height / ratio.width
            width = min(width, max(0.001, 1 - crop.cropRect.y) / factor)
            crop.cropRect.width = width
            crop.cropRect.height = width * factor
        } else { crop.cropRect.width = width }
    }

    private func printPresetLabel(_ preset: PrintPreset) -> String {
        guard preset.available, let width = preset.widthMM, let height = preset.heightMM else { return "\(preset.name) — 実寸未確定" }
        return "\(preset.name) — \(decimal(width)) × \(decimal(height)) mm"
    }

    private func changeFormat(_ format: CropExportFormat) {
        export.format = format
        switch format {
        case .jpeg:
            export.bitDepth = 8
            export.tiffCompression = .none
            export.preserveAlpha = false
        case .png:
            export.bitDepth = 8
            export.tiffCompression = .none
            export.preserveAlpha = true
        case .tiff:
            if ![8, 16].contains(export.bitDepth) { export.bitDepth = 8 }
            export.preserveAlpha = false
        }
    }

    private func decimal(_ value: Double) -> String { value.formatted(.number.precision(.fractionLength(0...3))) }

    private func byteEstimate(_ pixels: PixelDimensions) -> String {
        guard let bytes = try? CropExportMath.estimatedUncompressedBytes(pixels: pixels, settings: export) else { return "算出不可" }
        return ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    private func numberField(_ label: String, value: Binding<Double>) -> some View {
        HStack {
            Text(label)
            Spacer(minLength: 12)
            TextField(label, value: value, format: .number.precision(.fractionLength(0...4)))
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 150, minHeight: 44)
                .accessibilityLabel(label)
        }
    }
}

/// Overlay for the FULL, uncropped proxy, already displayed with the Recipe's rotation.
/// sourcePixels here is the displayed (rotation-applied) pixel size so aspectFit matches the image exactly.
/// Parent supplies onMove only during explicit Crop mode; nil leaves Pencil/touch events untouched.
@MainActor
struct CropPreviewOverlay: View {
    let rect: NormalizedCropRect
    let sourcePixels: PixelDimensions
    var onMove: ((NormalizedCropRect) -> Void)? = nil
    @State private var dragOrigin: NormalizedCropRect?

    var body: some View {
        GeometryReader { geometry in
            if sourcePixels.width > 0, sourcePixels.height > 0, (try? rect.validate()) != nil {
                let scale = min(geometry.size.width / CGFloat(sourcePixels.width), geometry.size.height / CGFloat(sourcePixels.height))
                let imageWidth = CGFloat(sourcePixels.width) * scale
                let imageHeight = CGFloat(sourcePixels.height) * scale
                let image = CGRect(x: (geometry.size.width - imageWidth) / 2, y: (geometry.size.height - imageHeight) / 2,
                    width: imageWidth, height: imageHeight)
                let frame = CGRect(x: image.minX + imageWidth * CGFloat(rect.x), y: image.minY + imageHeight * CGFloat(rect.y),
                    width: imageWidth * CGFloat(rect.width), height: imageHeight * CGFloat(rect.height))
                Path { path in path.addRect(image); path.addRect(frame) }
                    .fill(Color.black.opacity(0.5), style: FillStyle(eoFill: true))
                    .allowsHitTesting(false)
                Path { path in
                    for fraction in [1.0 / 3, 2.0 / 3] {
                        let x = frame.minX + frame.width * CGFloat(fraction)
                        let y = frame.minY + frame.height * CGFloat(fraction)
                        path.move(to: CGPoint(x: x, y: frame.minY)); path.addLine(to: CGPoint(x: x, y: frame.maxY))
                        path.move(to: CGPoint(x: frame.minX, y: y)); path.addLine(to: CGPoint(x: frame.maxX, y: y))
                    }
                }.stroke(.white.opacity(0.55), lineWidth: 1).allowsHitTesting(false)
                Rectangle().fill(.clear).overlay(Rectangle().stroke(.white, lineWidth: 2))
                    .frame(width: frame.width, height: frame.height)
                    .contentShape(Rectangle())
                    .position(x: frame.midX, y: frame.midY)
                    .gesture(DragGesture(minimumDistance: 3).onChanged { value in
                        guard let onMove, imageWidth > 0, imageHeight > 0 else { return }
                        if dragOrigin == nil { dragOrigin = rect }
                        guard var moved = dragOrigin else { return }
                        moved.x = min(max(0, moved.x + Double(value.translation.width / imageWidth)), max(0, 1 - moved.width))
                        moved.y = min(max(0, moved.y + Double(value.translation.height / imageHeight)), max(0, 1 - moved.height))
                        onMove(moved)
                    }.onEnded { _ in dragOrigin = nil })
                    .accessibilityLabel("最終印刷領域のCrop枠")
                    .accessibilityHint("移動はCrop設定の座標入力でも行えます")
            }
        }
        .allowsHitTesting(onMove != nil)
        .accessibilityIdentifier("crop.previewOverlay")
    }
}
