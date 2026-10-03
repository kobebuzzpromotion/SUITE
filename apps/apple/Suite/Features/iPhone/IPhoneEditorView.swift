import SwiftUI

/// iPhone-specific presentation. All image, history and persistence work stays in EditorModel.
@MainActor
struct IPhoneEditorView: View {
    @ObservedObject var model: EditorModel
    @Environment(\.verticalSizeClass) private var verticalSizeClass
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var activeSheet: IPhoneEditorSheet?
    @State private var showsExportFormats = false

    private let background = Color(red: 0.045, green: 0.05, blue: 0.055)
    private let panel = Color(red: 0.09, green: 0.095, blue: 0.105)
    private let accent = Color(red: 0.96, green: 0.70, blue: 0.29)

    private var canEdit: Bool {
        model.selectedAsset != nil && model.preview != nil && !model.isBusy
    }

    private var canExport: Bool {
        model.selectedAsset != nil && !model.isBusy
    }

    private var statusText: String {
        if !model.statusMessage.isEmpty { return model.statusMessage }
        if model.isBusy { return "処理中" }
        return model.selectedAsset == nil ? "写真を読み込んで編集を始める" : "選択中の写真を編集"
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            PhotoCanvas(model: model)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityIdentifier("iphone.photoCanvas")
        }
        .background(background.ignoresSafeArea())
        .foregroundStyle(.white)
        .tint(accent)
        .preferredColorScheme(.dark)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomControls
        }
        .sheet(item: $activeSheet) { sheet in
            sheetContent(sheet)
                .tint(accent)
                .preferredColorScheme(.dark)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
        .confirmationDialog("書き出し形式", isPresented: $showsExportFormats, titleVisibility: .visible) {
            Button("Crop・印刷・Export設定") { model.showCropExport = true }
            Button("保存済み設定で書き出す") { model.exportConfigured() }.disabled(!canExport)
            Button("JPEGで書き出す") { model.exportJPEG() }
                .disabled(!canExport)
            Button("TIFFで書き出す") { model.exportTIFF() }
                .disabled(!canExport)
            Button("PNGで書き出す") { model.exportPNG() }.disabled(!canExport)
            Button("保存済み全\(model.assets.count)枚を逐次書き出す") { model.exportAllSaved() }.disabled(!canExport)
            Button("キャンセル", role: .cancel) {}
        } message: {
            Text("Crop・印刷設定を引き継ぎます。一括は各写真の保存済み設定を固定し、原本は変更しません。native未検証です。")
        }
    }

    private var header: some View {
        HStack(spacing: 12) {
            Text("SUITE")
                .font(.headline.weight(.semibold))
                .tracking(3)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: 8)
            if let asset = model.selectedAsset {
                Text(asset.originalFilename)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .accessibilityLabel("選択中の写真、\(asset.originalFilename)")
            }
            Button {
                activeSheet = .availability
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.title3)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("機能の対応状況")
            .accessibilityIdentifier("iphone.availability")
        }
        .padding(.horizontal, 16)
        .padding(.top, 4)
    }

    private var bottomControls: some View {
        VStack(spacing: 8) {
            status

            if !model.assets.isEmpty {
                historyControls
                if verticalSizeClass != .compact && !dynamicTypeSize.isAccessibilitySize {
                    AssetFilmstrip(model: model)
                        .disabled(model.isBusy)
                        .accessibilityIdentifier("iphone.filmstrip")
                }
            }

            if dynamicTypeSize.isAccessibilitySize {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                    primaryActions
                }
            } else {
                HStack(spacing: 8) {
                    primaryActions
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 10)
        .padding(.bottom, 8)
        .background(panel.ignoresSafeArea(edges: .bottom))
    }

    private var status: some View {
        Button {
            activeSheet = .activity
        } label: {
            HStack(spacing: 8) {
                if model.errorMessage != nil {
                    Image(systemName: "exclamationmark.circle.fill")
                        .foregroundStyle(.orange)
                } else if model.isBusy {
                    ProgressView()
                        .controlSize(.small)
                        .accessibilityLabel("処理中")
                } else {
                    Image(systemName: "info.circle")
                        .foregroundStyle(.secondary)
                }
                Text(model.errorMessage ?? statusText)
                    .font(.subheadline)
                    .foregroundStyle(model.errorMessage == nil ? Color.secondary : Color.white)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("処理状況とエラーの全文を表示します")
        .accessibilityIdentifier("iphone.processingStatus")
    }

    private var historyControls: some View {
        HStack(spacing: 8) {
            Button(action: model.undo) {
                Image(systemName: "arrow.uturn.backward")
                    .frame(minWidth: 44, minHeight: 44)
            }
            .disabled(!model.canUndo || model.isBusy)
            .accessibilityLabel("元に戻す")
            .accessibilityIdentifier("iphone.undo")

            Button(action: model.redo) {
                Image(systemName: "arrow.uturn.forward")
                    .frame(minWidth: 44, minHeight: 44)
            }
            .disabled(!model.canRedo || model.isBusy)
            .accessibilityLabel("やり直す")
            .accessibilityIdentifier("iphone.redo")

            Spacer(minLength: 4)

            Button {
                activeSheet = .library
            } label: {
                Label("写真 \(model.assets.count)枚", systemImage: "photo.on.rectangle")
                    .font(.subheadline)
                    .frame(minHeight: 44)
                    .contentShape(Rectangle())
            }
            .disabled(model.isBusy)
            .accessibilityLabel("読み込んだ写真を選択、\(model.assets.count)枚")
            .accessibilityIdentifier("iphone.selectPhoto")
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var primaryActions: some View {
        IPhoneToolButton(title: "読み込む", symbol: "plus", emphasized: model.assets.isEmpty, accent: accent) {
            model.showImporter = true
        }
        .disabled(model.isBusy)
        .accessibilityIdentifier("iphone.import")

        IPhoneToolButton(title: "調整", symbol: "slider.horizontal.3", accent: accent) {
            activeSheet = .adjustments
        }
        .disabled(!canEdit)
        .accessibilityIdentifier("iphone.adjust")

        IPhoneToolButton(
            title: model.isComparing ? "編集後" : "比較",
            symbol: "rectangle.lefthalf.inset.filled",
            emphasized: model.isComparing,
            accent: accent
        ) {
            model.compare(!model.isComparing)
        }
        .disabled(!canEdit)
        .accessibilityLabel(model.isComparing ? "編集後の写真に戻る" : "編集前のプレビューと比較")
        .accessibilityValue(model.isComparing ? "編集前のプレビューを表示中" : "編集後を表示中")
        .accessibilityIdentifier("iphone.compare")

        IPhoneToolButton(title: "書き出す", symbol: "square.and.arrow.up", emphasized: canExport, accent: accent) {
            showsExportFormats = true
        }
        .disabled(!canExport)
        .accessibilityIdentifier("iphone.export")
    }

    @ViewBuilder
    private func sheetContent(_ sheet: IPhoneEditorSheet) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch sheet {
                    case .adjustments:
                        AdjustmentControls(model: model)
                            .disabled(!canEdit)
                        Button(action: model.rotate) {
                            Label("90°回転", systemImage: "rotate.right")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                        .disabled(!canEdit)
                    case .library:
                        AssetFilmstrip(model: model)
                            .disabled(model.isBusy)
                    case .availability:
                        WorkflowAvailabilityView()
                    case .activity:
                        if model.isBusy {
                            ProgressView("処理中")
                        }
                        Text(statusText)
                            .font(.body)
                            .textSelection(.enabled)
                        if let error = model.errorMessage {
                            Label("処理を完了できませんでした", systemImage: "exclamationmark.circle")
                                .font(.headline)
                                .foregroundStyle(.orange)
                            Text(error)
                                .font(.body)
                                .textSelection(.enabled)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(20)
            }
            .background(background)
            .navigationTitle(sheet.title)
            .navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                Button("写真へ戻る") { activeSheet = nil }
                    .font(.body.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .buttonStyle(.borderedProminent)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 8)
                    .background(panel)
            }
        }
    }
}

private enum IPhoneEditorSheet: String, Identifiable {
    case adjustments, library, availability, activity

    var id: String { rawValue }

    var title: String {
        switch self {
        case .adjustments: "写真を調整"
        case .library: "写真を選択"
        case .availability: "機能の対応状況"
        case .activity: "処理状況"
        }
    }
}

private struct IPhoneToolButton: View {
    @Environment(\.isEnabled) private var isEnabled
    let title: String
    let symbol: String
    var emphasized = false
    let accent: Color
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: symbol)
                    .font(.title3)
                Text(title)
                    .font(.caption.weight(.semibold))
            }
            .frame(maxWidth: .infinity, minHeight: 58)
            .padding(.vertical, 4)
            .contentShape(RoundedRectangle(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .foregroundStyle(emphasized ? accent : Color.white)
        .background(emphasized ? accent.opacity(0.12) : Color.white.opacity(0.045), in: RoundedRectangle(cornerRadius: 14))
        .opacity(isEnabled ? 1 : 0.4)
    }
}
