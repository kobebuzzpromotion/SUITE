import Foundation
import CryptoKit

/// Authenticated configured-server transport only. Never discovers a server,
/// embeds a provider key, retries a submit, or adopts returned pixels itself.
actor ServerGenerationClient {
    struct Binding: Codable, Equatable, Sendable {
        let assetID: String
        let originalSHA256: String
        let recipeRevision: Int
    }
    struct Quote: Codable, Equatable, Sendable {
        let id, accountID, provider, model, inputSHA256, payloadSHA256: String
        let pricingVersion: String
        let userCreditUnits: Int64
        let providerCurrency: String
        let providerDecimalPlaces: Int
        let providerCostCeilingUnits: Int64
        let issuedAt, expiresAt: Int64
        let requestSHA256: String
    }
    struct Offer: Decodable, Sendable { let quote: Quote; let disclosureVersion, kind: String }
    struct Consent: Codable, Equatable, Sendable {
        let confirmationID, disclosureVersion: String
        let explicitlyApproved: Bool
        let maximumCreditUnits, confirmedAt: Int64
    }
    struct Reservation: Codable, Equatable, Sendable {
        let accountID, id, quoteID, requestSHA256: String
        let consent: Consent
    }
    struct Settlement: Codable, Equatable, Sendable {
        let evidenceID, provider, model, providerJobID, requestSHA256, outcome: String
        let providerRequestID: String?
        let providerCostUnits: Int64?
    }
    struct Job: Codable, Equatable, Sendable {
        let reservation: Reservation
        let quote: Quote
        let state: String
        let providerJobID: String?
        let settlement: Settlement?
    }
    struct Candidate: Sendable {
        let job: Job
        let binding: Binding
        let png: Data
        let sha256: String
    }
    enum Failure: Error { case unconfigured, invalid, stale, rejected(Int), resultUnknown, oversized }
    typealias Token = @Sendable () async throws -> String
    private let base: URL
    private let token: Token
    private let session: URLSession
    private let redirects: NoRedirect
    private var submitted = Set<String>()
    private final class NoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
        func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                        newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
    }
    init(baseURL: URL, token: @escaping Token) throws {
        guard baseURL.scheme == "https", baseURL.host != nil, baseURL.user == nil, baseURL.password == nil,
              baseURL.query == nil, baseURL.fragment == nil, baseURL.path.isEmpty || baseURL.path == "/" else { throw Failure.unconfigured }
        base = baseURL; self.token = token
        let config = URLSessionConfiguration.ephemeral
        config.httpShouldSetCookies = false; config.urlCache = nil
        config.timeoutIntervalForRequest = 90; config.timeoutIntervalForResource = 180
        let delegate = NoRedirect(); redirects = delegate
        session = URLSession(configuration: config, delegate: delegate, delegateQueue: nil)
    }
    func quote(binding: Binding, input: Data, payload: Data) async throws -> Offer {
        try validate(binding); try validateBytes(input, payload)
        let data = try await request("quote", body: ["binding": bindingObject(binding), "inputSHA256": Self.sha(input),
            "payloadBase64": payload.base64EncodedString()])
        let offer = try JSONDecoder().decode(Offer.self, from: data)
        guard let object = try JSONSerialization.jsonObject(with: payload) as? [String: Any],
              let model = object["model"] as? String,
              offer.kind == "server-configured-flat-tariff", !offer.disclosureVersion.isEmpty,
              offer.quote.provider == "openai", offer.quote.model == model,
              offer.quote.inputSHA256 == Self.sha(input), offer.quote.payloadSHA256 == Self.sha(payload),
              offer.quote.userCreditUnits >= 0, offer.quote.userCreditUnits <= 1_000_000_000_000,
              offer.quote.expiresAt > offer.quote.issuedAt,
              offer.quote.expiresAt > Self.now(), UUID(uuidString: offer.quote.id) != nil else { throw Failure.invalid }
        return offer
    }
    func reserve(id: String, offer: Offer, consent: Consent) async throws -> Job {
        try validID(id)
        guard consent.explicitlyApproved, consent.disclosureVersion == offer.disclosureVersion,
              consent.maximumCreditUnits == offer.quote.userCreditUnits else { throw Failure.invalid }
        let consentData = try JSONEncoder().encode(consent)
        let data = try await request("reserve", body: ["id":id,"quoteID":offer.quote.id,"requestSHA256":offer.quote.requestSHA256,
            "consent":try JSONSerialization.jsonObject(with: consentData)])
        let job = try JSONDecoder().decode(Job.self, from: data)
        guard job.reservation.id == id, job.quote == offer.quote, job.reservation.consent == consent,
              job.reservation.quoteID == offer.quote.id, job.reservation.accountID == offer.quote.accountID else { throw Failure.invalid }
        return job
    }
    /// The UI persists/exposes id before calling. A failure after this point is
    /// uncertain, not permission to call submit again. Reopen uses status only.
    func submit(job: Job, binding: Binding, input: Data, payload: Data) async throws -> Job {
        try validID(job.reservation.id); try validateBytes(input, payload)
        guard job.state == "reserved", job.quote.inputSHA256 == Self.sha(input), job.quote.payloadSHA256 == Self.sha(payload),
              !submitted.contains(job.reservation.id) else { throw Failure.resultUnknown }
        submitted.insert(job.reservation.id)
        do {
            _ = try await request("jobs/\(job.reservation.id)/submit", body: ["inputBase64":input.base64EncodedString(),"payloadBase64":payload.base64EncodedString()])
            return try await status(id: job.reservation.id, binding: binding, expectedQuote: job.quote)
        } catch { throw Failure.resultUnknown }
    }
    func status(id: String, binding: Binding, expectedQuote: Quote? = nil) async throws -> Job {
        try validID(id); try validate(binding)
        struct Response: Decodable { let job: Job; let binding: Binding }
        let response = try JSONDecoder().decode(Response.self, from: await request("jobs/\(id)"))
        guard response.binding == binding, response.job.reservation.id == id,
              response.job.reservation.quoteID == response.job.quote.id,
              response.job.reservation.accountID == response.job.quote.accountID,
              response.job.reservation.requestSHA256 == response.job.quote.requestSHA256,
              expectedQuote == nil || response.job.quote == expectedQuote else { throw Failure.stale }
        return response.job
    }
    func output(job: Job, binding: Binding) async throws -> Candidate {
        let current = try await status(id: job.reservation.id, binding: binding, expectedQuote: job.quote)
        guard current.state == "succeeded", let settlement = current.settlement,
              settlement.outcome == "succeeded", settlement.requestSHA256 == current.quote.requestSHA256,
              settlement.evidenceID.hasPrefix("output-") else { throw Failure.resultUnknown }
        let png = try await request("jobs/\(job.reservation.id)/output", maximum: 32 * 1024 * 1024, mime: "image/png")
        let digest = Self.sha(png)
        guard settlement.evidenceID == "output-" + digest else { throw Failure.invalid }
        return Candidate(job: current, binding: binding, png: png, sha256: digest)
    }
    /// Only an observed reserved job is eligible. Server transaction arbitrates
    /// a concurrent submit; a lost cancellation reply never proves release.
    func cancelUnsubmitted(job: Job, binding: Binding) async throws -> Job {
        let before = try await status(id:job.reservation.id,binding:binding,expectedQuote:job.quote)
        guard before.state == "reserved" else { throw Failure.resultUnknown }
        _ = try await request("jobs/\(job.reservation.id)/cancel",body:[:])
        let after = try await status(id:job.reservation.id,binding:binding,expectedQuote:job.quote)
        guard after.state == "cancelled" else { throw Failure.resultUnknown }
        return after
    }
    private func request(_ path: String, body: [String: Any]? = nil, maximum: Int = 256 * 1024,
                         mime: String = "application/json") async throws -> Data {
        let bearer = try await token()
        guard !bearer.isEmpty, bearer.utf8.count <= 16_384, !bearer.contains("\r"), !bearer.contains("\n") else { throw Failure.unconfigured }
        try Task.checkCancellation()
        let url = base.appendingPathComponent("v1/generation/" + path)
        var req = URLRequest(url: url); req.httpMethod = body == nil ? "GET" : "POST"
        req.setValue("Bearer " + bearer, forHTTPHeaderField: "Authorization")
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys]); req.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        let (stream, response) = try await session.bytes(for: req)
        guard let http = response as? HTTPURLResponse, http.url?.host == base.host, http.url?.scheme == "https" else { throw Failure.invalid }
        guard (200...299).contains(http.statusCode) else { throw Failure.rejected(http.statusCode) }
        guard http.mimeType == mime, response.expectedContentLength <= Int64(maximum) else { throw Failure.oversized }
        var data = Data()
        for try await byte in stream {
            try Task.checkCancellation(); guard data.count < maximum else { throw Failure.oversized }; data.append(byte)
        }
        return data
    }
    private func validateBytes(_ input: Data, _ payload: Data) throws {
        guard !input.isEmpty, input.count <= 14 * 1024 * 1024, !payload.isEmpty, payload.count <= 4 * 1024 * 1024 else { throw Failure.oversized }
    }
    private func validID(_ id: String) throws { guard id.range(of: "^[A-Za-z0-9_-]{1,128}$", options: .regularExpression) != nil else { throw Failure.invalid } }
    private func validate(_ binding: Binding) throws {
        guard UUID(uuidString: binding.assetID) != nil, binding.originalSHA256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
              binding.recipeRevision >= 0, binding.recipeRevision <= 9_007_199_254_740_991 else { throw Failure.invalid }
    }
    private func bindingObject(_ value: Binding) -> [String: Any] { ["assetID":value.assetID,"originalSHA256":value.originalSHA256,"recipeRevision":value.recipeRevision] }
    static func sha(_ data: Data) -> String { SHA256.hash(data: data).map { String(format:"%02x",$0) }.joined() }
    static func now() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
}
