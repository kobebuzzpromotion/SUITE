import SwiftUI
import SuiteCore

/// Separate authenticated-server path. Manual response imports remain separate.
@MainActor struct ServerGenerationLaunchView: View {
    struct Session {
        let client: ServerGenerationClient
        let binding: ServerGenerationClient.Binding
        let journalRoot: URL
        let validateCurrent: @MainActor () async throws -> Bool
    }
    let sourcePNG: Data
    let assetID: UUID
    let originalSHA256: String
    let recipeRevision: Int
    let store: LocalGenerationCandidateStore
    let backgroundStore: LocalBackdropAssetStore
    let maskStore: LocalBackdropRecipeStore
    let prepare: @MainActor () async throws -> Session
    let onApply: (UUID, LocalBackdropRecipe) -> Void
    @State private var session: Session?
    @State private var candidate: ServerGenerationClient.Candidate?
    @State private var busy = false
    @State private var error: String?
    @State private var work: Task<Void,Never>?
    var body: some View {
        VStack {
            if let session {
                ServerGenerationView(context: .init(client:session.client,binding:session.binding,inputPNG:sourcePNG,
                    journalRoot:session.journalRoot,validateCurrent:session.validateCurrent,
                    onCandidate:{ value in
                        guard try await session.validateCurrent(), value.binding == session.binding else { throw ServerGenerationClient.Failure.stale }
                        candidate = value
                    }))
                if let candidate {
                    NavigationLink("取得候補の人物保護・利用条件を確認") {
                        ServerGenerationCandidateReview(candidate:candidate,remoteBinding:session.binding,
                            sourcePNG:sourcePNG,assetID:assetID,originalSHA256:originalSHA256,recipeRevision:recipeRevision,
                            store:store,backgroundStore:backgroundStore,maskStore:maskStore,
                            validateCurrent:{ (try? await session.validateCurrent()) == true },onApply:onApply)
                    }.padding()
                }
            } else {
                Text("登録済みの遠隔写真と現在の保存版を照合します。この操作では原本をアップロードしません。")
                Button("接続と保存版を確認") {
                    guard !busy else { return }; busy = true
                    work = Task {
                        defer { busy = false }
                        do {
                            let value = try await prepare(); try Task.checkCancellation()
                            guard try await value.validateCurrent() else { throw ServerGenerationClient.Failure.stale }
                            session = value
                        } catch { self.error = "開始できません: \(error)" }
                    }
                }.disabled(busy)
                if let error { Text(error) }
            }
        }.navigationTitle("認証サーバー生成")
            .onDisappear { work?.cancel() }
    }
}
