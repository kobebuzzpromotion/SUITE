import SwiftUI
import UniformTypeIdentifiers
import SuiteCore

/// Local receive-only UI. Adoption uses the same protected backdrop preview and
/// editor CAS callback as manual generation candidates; never submits a request.
@MainActor
struct GenerationResponseImportView: View {
    let adapter: GenerationResponseCandidateAdapter
    let sourcePNG: Data
    let assetID: UUID
    let originalSHA256: String
    let recipeRevision: Int
    let backgroundStore: LocalBackdropAssetStore
    let maskStore: LocalBackdropRecipeStore
    let onApply: (UUID, LocalBackdropRecipe) -> Void
    private enum Input: String, CaseIterable {
        case response = "受領応答JSON", input = "実際の送信入力", payload = "実際の送信payload"
        case output = "生成背景画像", subject = "人物mask L8", protection = "保護mask L8"
    }
    @State private var files: [Input: URL] = [:]
    @State private var kind = Input.response
    @State private var importing = false
    @State private var permission = false
    @State private var acceptance = false
    @State private var licenseID = ""
    @State private var declaration = ""
    @State private var handoff: LocalGenerationCandidateStore.Handoff?
    @State private var busy = false
    @State private var status = "未受領"
    @State private var epoch = UUID()
    @State private var task: Task<Void, Never>?

    init(adapter: GenerationResponseCandidateAdapter, sourcePNG: Data, assetID: UUID,
         originalSHA256: String, recipeRevision: Int, backgroundStore: LocalBackdropAssetStore,
         maskStore: LocalBackdropRecipeStore, onApply: @escaping (UUID, LocalBackdropRecipe) -> Void) {
        self.adapter = adapter; self.sourcePNG = sourcePNG; self.assetID = assetID
        self.originalSHA256 = originalSHA256; self.recipeRevision = recipeRevision
        self.backgroundStore = backgroundStore; self.maskStore = maskStore; self.onApply = onApply
    }

    var body: some View {
        Form {
            Section("生成応答の明示受領") {
                Text("外部サービスへの送信・課金は行いません。JSONは自己申告の受領記録であり、正式なprovider成功・支払済みの証明ではありません。登録済みの要求IDと実ファイルを照合します。")
                Text("応答のcandidate.idはauthorizationIDと同じUUID。1要求につき1候補です。別写真・別編集版への流用はできません。")
                Text("この入口は現在のProxy PNGをそのまま送信入力にした要求用です。再圧縮・切抜き済みの別入力は受け付けません。")
                ForEach(Input.allCases, id: \.rawValue) { input in
                    Button("\(input.rawValue)：\(files[input]?.lastPathComponent ?? "未選択")") {
                        kind = input; importing = true
                    }.disabled(busy)
                }
                TextField("利用条件ID", text: $licenseID)
                TextField("利用条件の確認記録", text: $declaration)
                Toggle("商用利用条件を自分で確認しました", isOn: $permission)
                Toggle("現写真・編集版に対応する応答と人物保護マスクです", isOn: $acceptance)
                Button("照合して背景合成確認へ") { receive() }
                    .disabled(busy || files.count != Input.allCases.count || !permission || !acceptance)
                Text(status)
            }.disabled(busy)
            if busy { Button("受領処理を中止") { invalidate(); status = "中止。確定済みのローカル記録は保持されます。" } }
            if let handoff {
                NavigationLink("人物を保護して合成を確認") {
                    LocalBackdropPreviewView(sourcePNG: sourcePNG, assetID: assetID,
                        originalSHA256: originalSHA256, store: backgroundStore, maskStore: maskStore,
                        initialHandoff: handoff, onApply: { onApply(handoff.candidate.id, $0) })
                }
            }
        }
        .navigationTitle("生成応答の受領")
        .fileImporter(isPresented: $importing, allowedContentTypes: kind == .response ? [.json] : [.data]) { result in
            invalidate(); permission = false; acceptance = false
            switch result {
            case .success(let url): files[kind] = url; status = "未検証のファイルを選択しました。"
            case .failure(let error): files.removeValue(forKey: kind); status = String(describing: error)
            }
        }
        .onChange(of: permission) { _ in invalidate() }
        .onChange(of: acceptance) { _ in invalidate() }
        .onChange(of: licenseID) { _ in invalidate() }
        .onChange(of: declaration) { _ in invalidate() }
        .onChange(of: assetID) { _ in clear() }
        .onChange(of: originalSHA256) { _ in clear() }
        .onChange(of: recipeRevision) { _ in clear() }
        .onChange(of: sourcePNG) { _ in clear() }
        // Navigation into the confirmed preview must retain its fixed handoff.
        .onDisappear { task?.cancel(); task = nil; epoch = UUID(); busy = false }
    }
    private func invalidate() {
        task?.cancel(); task = nil; epoch = UUID(); handoff = nil; busy = false
    }
    private func clear() { invalidate(); files = [:]; permission = false; acceptance = false }
    private func receive() {
        guard let response = files[.response], let input = files[.input], let payload = files[.payload],
              let output = files[.output], let subject = files[.subject], let protection = files[.protection],
              permission, acceptance else { return }
        invalidate(); let current = epoch; busy = true; status = "ローカル照合中"
        let license = licenseID, disclosure = declaration
        task = Task {
            do {
                let value = try await adapter.receive(responseJSON: response, submittedInput: input,
                    submittedPayload: payload, output: output, subjectMask: subject, protectionMask: protection,
                    currentSourcePNG: sourcePNG,
                    assetID: assetID, originalSHA256: originalSHA256, recipeRevision: recipeRevision,
                    licenseID: license, licenseDeclaration: disclosure,
                    permissionConfirmed: true, acceptanceConfirmed: true)
                guard !Task.isCancelled, epoch == current else { return }
                handoff = value; busy = false; status = "候補をローカル保存しました。合成確認と明示適用は未実行です。"
            } catch {
                guard epoch == current else { return }
                busy = false; status = "受領未完了：\(error)（既存の確定記録は保持）"
            }
        }
    }
}
