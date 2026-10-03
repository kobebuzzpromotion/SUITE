import SwiftUI
import SuiteCore

/// Explicit draft editing; Cancel never writes a Recipe. Both devices use their own space allocation.
@MainActor
struct CropEditorSheet: View {
    @ObservedObject var model: EditorModel
    @State private var crop: CropSettings
    @State private var export: ExportSettings

    init(model: EditorModel) {
        self.model = model
        // The loaded Recipe already passed strict validation. Absence means the old, uncropped Recipe.
        var initial = (try? model.parameters.cropSettings()) ?? CropSettings()
        initial.rotation = model.parameters.rotationDegrees
        self._crop = State(initialValue: initial)
        self._export = State(initialValue: (try? model.parameters.exportSettings()) ?? ExportSettings())
    }

    private var displayPixels: PixelDimensions? {
        guard let source = model.sourcePixels else { return nil }
        return crop.rotation % 180 == 0 ? source : .init(width: source.height, height: source.width)
    }

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                if geometry.size.width >= 800 && geometry.size.width > geometry.size.height {
                    HStack(spacing: 0) {
                        preview.frame(maxWidth: .infinity, maxHeight: .infinity)
                        controls.frame(width: 380)
                    }
                } else {
                    VStack(spacing: 0) {
                        preview.frame(height: max(150, geometry.size.height * 0.34))
                        controls
                    }
                }
            }
            .navigationTitle("Crop / 印刷 / Export")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("変更せず閉じる") { model.showCropExport = false }.frame(minHeight: 44)
                }
            }
            .task { await model.prepareCropEditor() }
        }
    }

    private var preview: some View {
        ZStack {
            Color.black
            if let image = model.cropPreview {
                Image(uiImage: image).resizable().scaledToFit()
                if let pixels = displayPixels {
                    CropPreviewOverlay(rect: crop.cropRect, sourcePixels: pixels) { crop.cropRect = $0 }
                }
            } else { ProgressView("Proxyを準備中") }
        }
        .clipped()
        .accessibilityIdentifier("crop.fullProxyCanvas")
    }

    private var controls: some View {
        ScrollView {
            CropExportControls(crop: $crop, export: $export, sourcePixels: model.sourcePixels,
                renderWarnings: ["画像出力・色変換・圧縮・dpi・AlphaはApple実行未検証です。不一致はstagingで拒否します。",
                                 "解像度不足のFinalは拒否します。AI Upscaleは未接続です。"]
            ) { model.confirmCrop(crop, settings: export) }
            .padding()
            if let error = model.errorMessage { Text(error).foregroundStyle(.orange).padding() }
        }
        .background(Color(uiColor: .secondarySystemBackground))
    }
}
