import SwiftUI
import UniformTypeIdentifiers
import SuiteCore

@MainActor
struct SessionLookPartialApplyView: View {
    @StateObject private var model: SessionLookPartialApplyModel
    @State private var importing = false
    @State private var work: Task<Void, Never>?
    init(checkpoint: ProjectCheckpoint, projects: ProjectStore, evidence: PhotoAnalysisEvidence? = nil,
         validateCurrent: @escaping @MainActor (ProjectCheckpoint) async -> Bool,
         beginApply: @escaping @MainActor () -> Bool, endApply: @escaping @MainActor () -> Void,
         onApplied: @escaping @MainActor (ProjectCheckpoint) -> Void) {
        _model = StateObject(wrappedValue: .init(checkpoint: checkpoint, projects: projects, evidence: evidence,
            validateCurrent: validateCurrent, beginApply: beginApply, endApply: endApply, onApplied: onApplied))
    }
    var body: some View {
        Form {
            Text("人物が保留でも、準備できた全体色・出力設定だけを保存します。解析完了フラグは作りません。肌・身体・未対応色処理はこの入口では適用しません。")
            Text(model.status)
            Button("固定SessionLook / binding JSONを選択") { importing = true }.disabled(model.busy)
            Button("適用候補と保留理由を確認") {
                work?.cancel(); work = Task { await model.prepare() }
            }.disabled(model.busy)
            ForEach(Array(model.rows.enumerated()), id: \.offset) { _, row in Text(row) }
            if !model.previewJSON.isEmpty {
                DisclosureGroup("保存されるRecipe全文") { Text(model.previewJSON).textSelection(.enabled) }
            }
            Button("内容を確認して準備済み分を保存") {
                work?.cancel(); work = Task { await model.apply() }
            }
                .disabled(model.busy || !model.canApply)
        }.navigationTitle("SessionLook・部分適用")
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                if case .success(let url) = result { model.load(url) }
            }.onDisappear { work?.cancel(); model.cancel() }
    }
}
