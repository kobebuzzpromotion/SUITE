import SwiftUI
import UniformTypeIdentifiers

@MainActor
struct TetherLocalRecoveryView: View {
    @StateObject private var model: TetherLocalRecoveryModel
    @State private var importing = false
    @State private var importingAnalysis = false
    @State private var operation: Task<Void, Never>?
    @State private var discardAnalysis = false
    @State private var launching = false
    @State private var arrivalContextID: UUID?
    @State private var importingOriginal = false
    init(context: TetherLocalRecoveryModel.Context) {
        _model = StateObject(wrappedValue: TetherLocalRecoveryModel(context: context))
    }
    var body: some View {
        Form {
            Section("ローカル撮影キューの再開") {
                Text("カメラSDKは未接続です。保存済み撮影IDと原本選択に対応するローカル受信ファイルだけを投入できます。撮影・外部ダウンロードは実行せず、JSONから撮影結果を作りません。")
                Text("人物画面で同じ写真の本人対応を明示確定した後、解析設定と人物ごとの明示EVを読み込めます。実モデル未導入・本人未確定・未対応の補正は保留。顔枠の輝度測定は肌認識や自動露出決定ではありません。")
                Button("固定セッションJSON（最大4MiB）を選択") { importingAnalysis = false; importing = true }.disabled(model.busy)
                Button("人物解析設定JSON（最大64KiB）を選択") { importingAnalysis = true; importing = true }
                    .disabled(model.busy || model.sessionID == nil)
                Text("設定項目: jobID, scoreThreshold, nmsThreshold, minimumIoU, minimumMargin, policyRevision, resolutions:[{personID, exposureEV}]。既存の本人確定時と同じ解析設定が必要です。入力は再起動後に再準備します。") .font(.caption)
                if let id = model.sessionID { Text("Session: \(id.uuidString)").font(.caption).textSelection(.enabled) }
                Text(model.status)
                Text(model.workerSummary)
                Button("再開して保存待ちを処理") { start { await model.process() } }
                    .disabled(model.busy || model.sessionID == nil)
                Button("停止して台帳を再照合") { start { await model.recover() } }
                    .disabled(model.busy || model.sessionID == nil)
                if model.canLoadNextPage {
                    Button("復旧一覧の次ページ") { start { await model.recover(nextPage: true) } }.disabled(model.busy)
                }
                if model.busy { Button("現在の処理を中止") { operation?.cancel() } }
            }
            Section("撮影・原本の状態（台帳再読込時点）") {
                ForEach(model.arrivals) { arrival in
                    VStack(alignment: .leading) {
                        Text(arrival.id.uuidString).font(.caption).textSelection(.enabled)
                        Text(arrival.label)
                        if arrival.finalSelected {
                            Button("この撮影の確定原本ファイルを投入") {
                                arrivalContextID = arrival.id; importingOriginal = true
                            }.disabled(model.busy || launching)
                        }
                    }
                }
                Text("原本未確定の撮影には投入できません。同じ撮影の再送は既存台帳で照合し、補正を重ねません。新しく投入した写真は処理後にEditorへ表示します。") .font(.caption)
            }
            Section("復旧一覧（直近の台帳照合時点）") {
                Toggle("明示再試行時に旧解析も破棄", isOn: $discardAnalysis).disabled(model.busy)
                ForEach(model.rows) { row in
                    VStack(alignment: .leading) {
                        Text("\(row.stage) / \(row.status)")
                        Text(row.recordID.uuidString).font(.caption).textSelection(.enabled)
                        if let detail = row.detail { Text(detail).font(.caption) }
                        if row.retryAllowed {
                            Button("この失敗項目を再試行待ちにする") {
                                start { await model.retry(row.recordID, discardAnalysis: discardAnalysis) }
                            }.disabled(model.busy)
                        }
                    }
                }
            }
        }
        .navigationTitle("撮影キュー・ローカル再開")
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            if case .success(let url) = result {
                let analysis = importingAnalysis
                start { if analysis { await model.loadAnalysisConfiguration(url) } else { await model.load(url) } }
            }
        }
        .onDisappear { operation?.cancel() }
        .fileImporter(isPresented: $importingOriginal, allowedContentTypes: [.image, .data]) { result in
            let contextID = arrivalContextID; arrivalContextID = nil
            if case .success(let url) = result, let contextID {
                start { await model.receive(url, contextID: contextID) }
            }
        }
    }
    private func start(_ action: @escaping @MainActor () async -> Void) {
        guard !model.busy, !launching else { return }
        launching = true
        operation = Task { await action(); launching = false }
    }
}
