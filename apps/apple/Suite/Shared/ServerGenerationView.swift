import SwiftUI
import UniformTypeIdentifiers

@MainActor struct ServerGenerationView: View {
    @StateObject private var model: ServerGenerationModel
    @State private var importing = false
    @State private var task: Task<Void,Never>?
    @State private var launching = false
    @State private var confirmCancellation = false
    init(context: ServerGenerationModel.Context) { _model = StateObject(wrappedValue:ServerGenerationModel(context:context)) }
    var body: some View {
        Form {
            Text("有料生成：見積時は依頼本文と画像SHA、送信時は入力PNGをサーバーへ送ります。provider秘密鍵は端末に持ちません。素材再利用とは別操作です。")
            Text(model.status)
            if let payload = model.payloadText { DisclosureGroup("送信する依頼の全内容") { Text(payload).textSelection(.enabled) } }
            Button("生成パラメータJSONを選択") { importing = true }.disabled(model.busy || model.job != nil)
            Button("サーバー見積を取得") { run { await model.quote() } }.disabled(model.busy)
            if let offer = model.offer {
                Text("\(offer.quote.provider) / \(offer.quote.model)")
                Text("料金版 \(offer.quote.pricingVersion) / 固定消費 \(offer.quote.userCreditUnits) credits")
                Text("説明版 \(offer.disclosureVersion) / 有効期限 \(Date(timeIntervalSince1970:Double(offer.quote.expiresAt)/1000).formatted())")
                Toggle("この写真・依頼本文の送信と表示されたcredit消費に同意",isOn:$model.consent).disabled(model.busy)
                Button("明示同意してcreditを予約") { run { await model.reserve() } }.disabled(model.busy || !model.consent || model.job != nil)
            }
            TextField("保存済みjob ID（状態照合用）",text:$model.recoveryID).disabled(model.busy).textInputAutocapitalization(.never)
            Button("状態を照合（再送しない）") { run { await model.refresh() } }.disabled(model.busy)
            Button("未送信予約を取消",role:.destructive) { confirmCancellation = true }
                .disabled(!model.canCancelReservation)
            Button("予約済み依頼を一度だけ送信") { run { await model.submit() } }.disabled(model.busy || model.cancellationUncertain || !model.consent || model.job?.state != "reserved")
            Button("成功PNGを候補として取得") { run { await model.candidate() } }.disabled(model.busy || model.job?.state != "succeeded")
            Text("通信中断・結果不明は予約解放や再送を行いません。既存jobを照合してください。取得後も人物保護マスクの確認と明示採用が必要です。")
        }.navigationTitle("サーバー見積と生成")
            .fileImporter(isPresented:$importing,allowedContentTypes:[.json]) { if case .success(let url) = $0 { model.loadPayload(url) } }
            .onDisappear { task?.cancel() }
            .confirmationDialog("この未送信予約を取消しますか？",isPresented:$confirmCancellation,titleVisibility:.visible) {
                Button("同じ予約を取消してcreditを解放",role:.destructive) { run { await model.cancelReservation() } }
                Button("戻る",role:.cancel) {}
            } message: { Text("送信済み・結果不明の生成は取消しません。通信結果が不明なら、同じjobの状態照合だけを行います。") }
    }
    private func run(_ action:@escaping @MainActor () async -> Void) {
        guard !model.busy, !launching else {return}; launching = true
        task = Task { await action(); launching = false }
    }
}
