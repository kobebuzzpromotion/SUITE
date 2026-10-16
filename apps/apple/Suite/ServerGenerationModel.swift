import Foundation
import Combine
import Darwin

@MainActor final class ServerGenerationModel: ObservableObject {
    struct Context {
        let client: ServerGenerationClient
        let binding: ServerGenerationClient.Binding
        let inputPNG: Data
        let journalRoot: URL
        let validateCurrent: @MainActor () async throws -> Bool
        /// Receives an unadopted candidate. Host supplies fixed subject/protection
        /// masks and existing candidate-store/preview/CAS path; no auto-application.
        let onCandidate: @MainActor (ServerGenerationClient.Candidate) async throws -> Void
    }
    @Published private(set) var offer: ServerGenerationClient.Offer?
    @Published private(set) var job: ServerGenerationClient.Job?
    @Published private(set) var busy = false
    @Published private(set) var status = "送信先は認証済みSUITEサーバーです。設定なしでは見積できません。"
    @Published var consent = false
    @Published var recoveryID = ""
    private let context: Context
    private var payload: Data?
    private var attempt: String?
    private var submissionAttempted = false
    @Published private(set) var cancellationUncertain = false
    var canCancelReservation: Bool { !busy && !cancellationUncertain && job?.state == "reserved" }
    var payloadText: String? { payload.flatMap { String(data:$0,encoding:.utf8) } }
    init(context: Context) { self.context = context }
    func loadPayload(_ url: URL) {
        guard !busy, attempt == nil else { return }
        offer = nil; consent = false; payload = nil
        do {
            let scope = url.startAccessingSecurityScopedResource(); defer { if scope { url.stopAccessingSecurityScopedResource() } }
            guard url.isFileURL, url.standardizedFileURL == url.resolvingSymlinksInPath() else { throw ServerGenerationClient.Failure.invalid }
            let values = try url.resourceValues(forKeys:[.fileSizeKey,.isRegularFileKey])
            guard values.isRegularFile == true, let size = values.fileSize, size > 0, size <= 4*1024*1024 else { throw ServerGenerationClient.Failure.oversized }
            let bytes = try Data(contentsOf: url)
            guard bytes.count == size, try JSONSerialization.jsonObject(with: bytes) is [String: Any] else { throw ServerGenerationClient.Failure.invalid }
            payload = bytes; status = "生成パラメータを読み込みました。価格はこのファイルではなくサーバー見積で確認します。"
        } catch { status = "依頼を読み込めません: \(error)" }
    }
    func quote() async {
        guard !busy, attempt == nil, let payload else { return }
        busy = true; defer { busy = false }; consent = false; offer = nil
        do {
            try await current()
            let value = try await context.client.quote(binding: context.binding,input: context.inputPNG,payload: payload)
            try await current(); offer = value; status = "サーバー設定料金表による固定見積です。予約・生成はまだ行っていません。"
        } catch { status = "見積できません: \(error)" }
    }
    func reserve() async {
        guard !busy, consent, attempt == nil, let offer else { return }
        busy = true; defer { busy = false }
        do {
            try await current()
            let id = UUID().uuidString.lowercased()
            let approval = ServerGenerationClient.Consent(confirmationID:UUID().uuidString, disclosureVersion:offer.disclosureVersion,
                explicitlyApproved:true, maximumCreditUnits:offer.quote.userCreditUnits, confirmedAt:ServerGenerationClient.now())
            // Publish recovery ID before a potentially successful network write.
            try journal(id: id, offer: offer, consent: approval)
            attempt = id; recoveryID = id
            job = try await context.client.reserve(id:id,offer:offer,consent:approval)
            status = "予約済み。生成は別の明示操作です。"
        } catch { status = "予約結果を確認できません。記録IDの状態照合を行ってください: \(error)" }
    }
    func submit() async {
        guard !busy, consent, !submissionAttempted, !cancellationUncertain, let job, job.state == "reserved", let payload else { return }
        busy = true; defer { busy = false }
        do {
            try await current(); submissionAttempted = true; cancellationUncertain = true
            self.job = try await context.client.submit(job:job,binding:context.binding,input:context.inputPNG,payload:payload)
            cancellationUncertain = false
            status = "送信結果: \(self.job?.state ?? "unknown")。自動採用はしていません。"
        } catch { status = "送信結果未確定。再送しません。状態照合のみ行ってください: \(error)" }
    }
    func refresh() async {
        guard !busy else { return }; busy = true; defer { busy = false }
        do {
            let value = try await context.client.status(id:recoveryID,binding:context.binding)
            guard value.quote.inputSHA256 == ServerGenerationClient.sha(context.inputPNG),
                  payload == nil || value.quote.payloadSHA256 == ServerGenerationClient.sha(payload!) else { throw ServerGenerationClient.Failure.stale }
            job = value; attempt = recoveryID; cancellationUncertain = false
            // Recovery is query-only. Never infer that 'reserved' means a lost
            // submit was not issued from a different process/session.
            submissionAttempted = true
            status = "状態: \(value.state)。再開画面からの再送は行いません。"
        } catch { status = "照合未完了: \(error)" }
    }
    func cancelReservation() async {
        guard canCancelReservation, let job else { return }
        busy = true; defer { busy = false }
        // Freeze sending even if a cancellation response is lost. Release is
        // judged only from the same server job, never by creating another ID.
        submissionAttempted = true
        cancellationUncertain = true
        do {
            self.job = try await context.client.cancelUnsubmitted(job:job,binding:context.binding)
            cancellationUncertain = false; consent = false
            status = "未送信予約の取消とcredit解放をサーバー状態で確認しました。"
        } catch {
            status = "取消結果は未確定です。解放済みとは扱いません。同じjob IDの状態照合を行ってください: \(error)"
        }
    }
    func candidate() async {
        guard !busy, let job else { return }; busy = true; defer { busy = false }
        do {
            try await current()
            let value = try await context.client.output(job:job,binding:context.binding)
            try await current(); try await context.onCandidate(value)
            status = "候補を既存の確認導線へ渡しました。原本や編集へ自動適用していません。"
        } catch { status = "候補取得／受渡し不可: \(error)" }
    }
    private func current() async throws {
        try Task.checkCancellation()
        guard try await context.validateCurrent() else { throw ServerGenerationClient.Failure.stale }
        try Task.checkCancellation()
    }
    private func journal(id:String,offer:ServerGenerationClient.Offer,consent:ServerGenerationClient.Consent) throws {
        struct Entry:Encodable {let id:String;let binding:ServerGenerationClient.Binding;let quote:ServerGenerationClient.Quote;let consent:ServerGenerationClient.Consent}
        let root = context.journalRoot.appendingPathComponent("ServerGenerationRequests")
        guard root.standardizedFileURL == root.resolvingSymlinksInPath() else { throw ServerGenerationClient.Failure.invalid }
        try FileManager.default.createDirectory(at:root,withIntermediateDirectories:true)
        let dir = open(root.path,O_RDONLY|O_DIRECTORY|O_NOFOLLOW); guard dir >= 0 else { throw ServerGenerationClient.Failure.invalid }; defer {close(dir)}
        let fd = openat(dir,id+".json",O_CREAT|O_EXCL|O_WRONLY|O_NOFOLLOW,0o600)
        guard fd >= 0 else { throw ServerGenerationClient.Failure.invalid }
        let handle = FileHandle(fileDescriptor:fd,closeOnDealloc:true); defer {try? handle.close()}
        try handle.write(contentsOf:JSONEncoder().encode(Entry(id:id,binding:context.binding,quote:offer.quote,consent:consent)))
        try handle.synchronize(); guard fsync(dir)==0 else {throw ServerGenerationClient.Failure.invalid}
    }
}
