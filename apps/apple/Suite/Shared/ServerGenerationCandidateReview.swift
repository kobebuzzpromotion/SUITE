import SwiftUI
import UniformTypeIdentifiers
import Darwin
import SuiteCore

@MainActor
struct ServerGenerationCandidateReview: View {
    let candidate: ServerGenerationClient.Candidate
    let remoteBinding: ServerGenerationClient.Binding
    let sourcePNG: Data
    let assetID: UUID
    let originalSHA256: String
    let recipeRevision: Int
    let store: LocalGenerationCandidateStore
    let backgroundStore: LocalBackdropAssetStore
    let maskStore: LocalBackdropRecipeStore
    let validateCurrent: @MainActor () async -> Bool
    let onApply: (UUID, LocalBackdropRecipe) -> Void
    @State private var subject: Data?
    @State private var protection: Data?
    @State private var importing = false
    @State private var importProtection = false
    @State private var licenseID = ""
    @State private var declaration = ""
    @State private var rights = false
    @State private var accepted = false
    @State private var busy = false
    @State private var status = "原本の人物を保持し、生成結果は背景としてのみ採用します。"
    @State private var handoff: LocalGenerationCandidateStore.Handoff?
    @State private var work: Task<Void, Never>?
    var body: some View {
        Form {
            Text(status)
            Text("provider: \(candidate.job.quote.provider) / model: \(candidate.job.quote.model)")
            Text("人物・保護maskは現在写真と同じ寸法のraw L8、上から行順です。保護画素は人物maskの255領域内である必要があります。生成された人物は採用しません。")
            if let size = try? ServerGenerationCandidateAdapter.dimensions(sourcePNG) { Text("必要寸法: \(size.0) × \(size.1)") }
            Group {
                Button(subject == nil ? "人物maskを選ぶ" : "人物mask選択済み・変更") { importProtection = false; importing = true }
                Button(protection == nil ? "保護maskを選ぶ" : "保護mask選択済み・変更") { importProtection = true; importing = true }
                TextField("利用条件ID", text:$licenseID)
                TextField("確認した利用条件・権利の記録", text:$declaration)
                Toggle("商用利用条件と入力写真の権利を確認しました", isOn:$rights)
                Toggle("現在の写真・編集版・人物maskを確認し背景候補の保存に同意します", isOn:$accepted)
            }.disabled(busy || handoff != nil)
            Button("検証して端末へ保存・合成確認へ") { prepare() }
                .disabled(busy || handoff != nil || !rights || !accepted || subject == nil || protection == nil)
            if let handoff {
                NavigationLink("原本人を保持した合成を確認") {
                    LocalBackdropPreviewView(sourcePNG:sourcePNG, assetID:assetID, originalSHA256:originalSHA256,
                        store:backgroundStore, maskStore:maskStore, initialHandoff:handoff,
                        onApply:{ recipe in
                            Task { if await validateCurrent() { onApply(handoff.candidate.id, recipe) } }
                        })
                }
                Text("保存済み候補。編集への適用は合成確認画面で別途行います。")
            }
        }.navigationTitle("サーバー生成背景の確認")
        .onDisappear { work?.cancel() }
        .fileImporter(isPresented:$importing, allowedContentTypes:[.data]) { result in
            do {
                let bytes = try readMask(result.get())
                if importProtection { protection = bytes } else { subject = bytes }
                rights = false; accepted = false
            } catch { status = "maskを読めません: \(error)" }
        }
    }
    private func prepare() {
        guard !busy, rights, accepted, let subject, let protection else { return }
        busy = true
        let fixedLicense = licenseID, fixedDeclaration = declaration
        work = Task {
            defer { busy = false }
            do {
                guard await validateCurrent() else { throw ServerGenerationClient.Failure.stale }
                try Task.checkCancellation()
                let result = try await ServerGenerationCandidateAdapter.prepare(candidate:candidate, remoteBinding:remoteBinding,
                    sourcePNG:sourcePNG, assetID:assetID, originalSHA256:originalSHA256, recipeRevision:recipeRevision,
                    subject:subject, protection:protection, licenseID:fixedLicense, declaration:fixedDeclaration, store:store)
                try Task.checkCancellation()
                guard await validateCurrent() else { throw ServerGenerationClient.Failure.stale }
                handoff = result; status = "背景候補保存済み。元写真の人物を保持して合成を確認してください。"
            } catch { status = "合成へ進めません（保存が完了済みの可能性はあります。同じ依頼で再確認できます）: \(error)" }
        }
    }
    private func readMask(_ url: URL) throws -> Data {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard url.isFileURL, url.standardizedFileURL.path == url.resolvingSymlinksInPath().path else { throw ServerGenerationClient.Failure.invalid }
        let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw ServerGenerationClient.Failure.invalid }
        let handle = FileHandle(fileDescriptor:fd, closeOnDealloc:true); defer { try? handle.close() }
        var info = stat()
        guard fstat(fd,&info) == 0, (info.st_mode & S_IFMT) == S_IFREG, info.st_size > 0, info.st_size <= 8_000_000 else { throw ServerGenerationClient.Failure.invalid }
        let data = try handle.read(upToCount:8_000_001) ?? Data()
        guard data.count == Int(info.st_size) else { throw ServerGenerationClient.Failure.invalid }
        return data
    }
}
