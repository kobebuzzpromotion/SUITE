import SwiftUI

/// iPad-only composition. Image processing and persistence belong to EditorModel.
@MainActor
struct IPadEditorView: View {
    @ObservedObject var model: EditorModel
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var activeSheet: IPadEditorSheet?
    @State private var showsLargePrint = false

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
        GeometryReader { geometry in
            // Use the actual window size, including Split View and Stage Manager.
            let hasSideInspector = geometry.size.width >= 900
                && geometry.size.width > geometry.size.height
                && !dynamicTypeSize.isAccessibilitySize
            let workspaceHeight = max(hasSideInspector ? 360 : 600, geometry.size.height - 196)

            ScrollView(.vertical) {
                VStack(spacing: 0) {
                    header
                    commandBar(width: geometry.size.width)
                    activityStatus
                    workspace(sideInspector: hasSideInspector, height: workspaceHeight)
                        .frame(height: workspaceHeight)
                }
                .frame(minHeight: geometry.size.height, alignment: .top)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
        .background(background.ignoresSafeArea())
        .foregroundStyle(.white)
        .tint(accent)
        .preferredColorScheme(.dark)
        .sheet(item: $activeSheet) { sheet in
            sheetContent(sheet)
        }
        .sheet(isPresented: $showsLargePrint) { LargePrintExportSheet(model: model) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 12) {
                Text("SUITE")
                    .font(.headline.weight(.semibold))
                    .tracking(3)
                    .accessibilityAddTraits(.isHeader)
                Spacer(minLength: 0)
                Button {
                    model.showImporter = true
                } label: {
                    Label("読み込む", systemImage: "plus")
                        .font(.subheadline.weight(.semibold))
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .disabled(model.isBusy)
                .keyboardShortcut("o", modifiers: .command)
                .accessibilityIdentifier("ipad.import")

                Button {
                    activeSheet = .availability
                } label: {
                    Image(systemName: "ellipsis.circle")
                        .font(.title3)
                        .frame(minWidth: 44, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .accessibilityLabel("機能の対応状況")
                .accessibilityIdentifier("ipad.availability")
            }
            .buttonStyle(.plain)

            Text(model.selectedAsset?.originalFilename ?? "写真を選択")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
                .accessibilityLabel("選択中の写真、\(model.selectedAsset?.originalFilename ?? "なし")")
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 12)
    }

    private func commandBar(width: CGFloat) -> some View {
        ScrollView(.horizontal) {
            HStack(spacing: 12) {
                Button(action: model.undo) {
                    Image(systemName: "arrow.uturn.backward")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .disabled(!model.canUndo || model.isBusy)
                .keyboardShortcut("z", modifiers: .command)
                .accessibilityLabel("元に戻す")
                .accessibilityIdentifier("ipad.undo")

                Button(action: model.redo) {
                    Image(systemName: "arrow.uturn.forward")
                        .frame(minWidth: 44, minHeight: 44)
                }
                .disabled(!model.canRedo || model.isBusy)
                .keyboardShortcut("z", modifiers: [.command, .shift])
                .accessibilityLabel("やり直す")
                .accessibilityIdentifier("ipad.redo")

                Rectangle()
                    .fill(.white.opacity(0.12))
                    .frame(width: 1, height: 24)
                    .accessibilityHidden(true)

                Button {
                    model.compare(!model.isComparing)
                } label: {
                    Label(model.isComparing ? "編集後に戻る" : "編集前と比較", systemImage: "rectangle.lefthalf.inset.filled")
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(model.isComparing ? accent : Color.white)
                .disabled(!canEdit)
                .keyboardShortcut("b", modifiers: .command)
                .accessibilityValue(model.isComparing ? "編集前のプレビューを表示中" : "編集後のプレビューを表示中")
                .accessibilityIdentifier("ipad.compare")

                Spacer(minLength: 16)

                Button("Crop・印刷設定") { model.showCropExport = true }
                    .frame(minHeight: 44).disabled(!canEdit)

                Menu {
                    Button("大判TIFF（明示設定）") { showsLargePrint = true }
                    Button("保存済み設定で書き出す", action: model.exportConfigured)
                    Button("JPEGで書き出す", action: model.exportJPEG)
                        .keyboardShortcut("e", modifiers: [.command, .shift])
                    Button("TIFFで書き出す", action: model.exportTIFF)
                        .keyboardShortcut("e", modifiers: [.command, .shift, .option])
                    Button("PNGで書き出す", action: model.exportPNG)
                    Button("保存済み全\(model.assets.count)枚を逐次書き出す", action: model.exportAllSaved)
                } label: {
                    Label("書き出す", systemImage: "square.and.arrow.up")
                        .fontWeight(.semibold)
                        .frame(minHeight: 44)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(accent)
                .disabled(!canExport)
                .accessibilityHint("保存したCropと設定を引継ぎ、原本と編集内容から別成果物を書き出します。native未検証")
                .accessibilityIdentifier("ipad.export")
            }
            .font(.subheadline)
            .buttonStyle(.plain)
            .frame(minWidth: max(0, width - 40))
            .padding(.horizontal, 20)
        }
        .scrollIndicators(.visible)
        .background(panel)
    }

    private var activityStatus: some View {
        Button {
            activeSheet = .activity
        } label: {
            HStack(spacing: 10) {
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
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .multilineTextAlignment(.leading)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .frame(minHeight: 44)
            .padding(.horizontal, 20)
            .padding(.vertical, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityHint("処理状況とエラーの全文を表示します")
        .accessibilityIdentifier("ipad.processingStatus")
    }

    @ViewBuilder
    private func workspace(sideInspector: Bool, height: CGFloat) -> some View {
        if sideInspector {
            HStack(spacing: 0) {
                VStack(spacing: 0) {
                    canvas
                    filmstrip
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                inspector
                    .frame(width: 312)
                    .accessibilityIdentifier("ipad.sideInspector")
            }
        } else {
            VStack(spacing: 0) {
                canvas
                filmstrip
                inspector
                    .frame(height: max(260, min(360, height * 0.42)))
                    .accessibilityIdentifier("ipad.bottomInspector")
            }
        }
    }

    private var canvas: some View {
        // No gesture recognizer or transparent tool overlay intercepts the photo.
        PhotoCanvas(model: model)
            .frame(maxWidth: .infinity, minHeight: 180, maxHeight: .infinity)
            .accessibilityIdentifier("ipad.photoCanvas")
    }

    @ViewBuilder
    private var filmstrip: some View {
        if !model.assets.isEmpty {
            AssetFilmstrip(model: model)
                .disabled(model.isBusy)
                .padding(.vertical, 6)
                .background(panel.opacity(0.55))
                .accessibilityIdentifier("ipad.filmstrip")
        }
    }

    private var inspector: some View {
        ScrollView(.vertical) {
            VStack(alignment: .leading, spacing: 20) {
                HStack {
                    Label("写真を調整", systemImage: "slider.horizontal.3")
                        .font(.headline)
                        .accessibilityAddTraits(.isHeader)
                    Spacer(minLength: 0)
                }
                AdjustmentControls(model: model)
                    .disabled(!canEdit)
                Button(action: model.rotate) {
                    Label("90°回転", systemImage: "rotate.right")
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.bordered)
                .disabled(!canEdit)
                .keyboardShortcut("r", modifiers: .command)
                .accessibilityIdentifier("ipad.rotate")
            }
            .padding(20)
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(panel)
    }

    private func sheetContent(_ sheet: IPadEditorSheet) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    switch sheet {
                    case .availability:
                        WorkflowAvailabilityView()
                    case .activity:
                        if model.isBusy { ProgressView("処理中") }
                        Text(statusText)
                            .textSelection(.enabled)
                        if let error = model.errorMessage {
                            Label("処理を完了できませんでした", systemImage: "exclamationmark.circle")
                                .font(.headline)
                                .foregroundStyle(.orange)
                            Text(error)
                                .textSelection(.enabled)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(24)
            }
            .background(background)
            .navigationTitle(sheet == .availability ? "機能の対応状況" : "処理状況")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("閉じる") { activeSheet = nil }
                        .frame(minHeight: 44)
                }
            }
        }
        .tint(accent)
        .preferredColorScheme(.dark)
    }
}

private enum IPadEditorSheet: String, Identifiable {
    case availability, activity
    var id: String { rawValue }
}
