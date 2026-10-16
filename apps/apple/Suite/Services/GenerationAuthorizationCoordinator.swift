import Foundation
import CryptoKit
import SuiteCore

/// Binds actual immutable bytes to explicit authorization and host validation.
/// No provider submission, price inference, credit reservation or settlement.
actor GenerationAuthorizationCoordinator {
    enum Failure: Error { case busy, bindingMismatch, hostValidationRejected, inputTooLarge }
    struct Registration: Sendable {
        enum Status: String, Sendable { case registeredNotSubmitted }
        let authorization: GenerationAuthorization
        let status: Status
    }
    /// Host must verify the exact price-list/model/currency/scale/ceiling and
    /// current explicit consent, AND that these input/payload hashes are still
    /// the currently selected request. Missing configuration must return false.
    typealias HostValidation = @Sendable (GenerationAuthorization) async throws -> Bool
    private let store: GenerationAuthorizationStore
    private var busy = false

    init(store: GenerationAuthorizationStore) { self.store = store }

    /// payloadData must be the host's final canonical full request payload;
    /// hashing a display summary or regenerating a prompt afterwards is invalid.
    /// The callback is mandatory and run before AND after byte verification.
    /// A successful registration remains registered even if cancellation arrives
    /// after its commit; callers must not interpret it as provider submission.
    func register(inputData: Data, canonicalPayloadData: Data,
                  authorization: GenerationAuthorization,
                  validatePriceAndConsent: HostValidation) async throws -> Registration {
        guard !busy else { throw Failure.busy }
        busy = true; defer { busy = false }
        try authorization.validate(); try Task.checkCancellation()
        guard !inputData.isEmpty, inputData.count <= 256 * 1024 * 1024,
              !canonicalPayloadData.isEmpty, canonicalPayloadData.count <= 4 * 1024 * 1024 else {
            throw Failure.inputTooLarge
        }
        // Data value snapshots stay fixed across suspension; the host checks
        // whether they still describe its active request, not only their hashes.
        let input = inputData, payload = canonicalPayloadData
        guard try await validatePriceAndConsent(authorization) else { throw Failure.hostValidationRejected }
        try Task.checkCancellation()
        guard try Self.digest(input) == authorization.inputSHA256,
              try Self.digest(payload) == authorization.recipeSHA256 else { throw Failure.bindingMismatch }
        guard try await validatePriceAndConsent(authorization) else { throw Failure.hostValidationRejected }
        try Task.checkCancellation()
        // Store is the durable same-ID/full-body authority. No post-commit
        // cancellation check or host callback may disguise a committed record.
        let fixed = try await store.register(authorization)
        return Registration(authorization: fixed, status: .registeredNotSubmitted)
    }

    private static func digest(_ data: Data) throws -> String {
        var hasher = SHA256()
        var offset = data.startIndex
        while offset < data.endIndex {
            try Task.checkCancellation()
            let end = min(data.endIndex, offset + 1024 * 1024)
            hasher.update(data: data[offset..<end])
            offset = end
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }
}
