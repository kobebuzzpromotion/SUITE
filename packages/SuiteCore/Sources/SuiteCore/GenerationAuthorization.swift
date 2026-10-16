import Foundation

/// A frozen, explicitly approved request ceiling, not a quote, reservation or payment.
/// The gateway must independently verify the referenced price list and consent,
/// persist this entire value by idempotencyKey before submission, and compare retries.
/// inputSHA256 hashes the actual submitted input; recipeSHA256 hashes the complete
/// canonical generation payload (including prompt/seed/options), not a UI summary.
public struct GenerationAuthorization: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let idempotencyKey: UUID
    public let provider: String
    public let model: String
    public let inputSHA256: String
    public let recipeSHA256: String
    public let priceListVersion: String
    /// ISO-style uppercase three-letter identifier. Availability is gateway policy.
    public let currency: String
    /// Explicit decimal scale: 2 means one unit is 1/100 currency, 0 means whole units.
    /// No currency-specific scale or exchange rate is inferred by this contract.
    public let costDecimalPlaces: Int
    public let maximumCostUnits: Int64
    public let consent: Consent

    /// Records a user's explicit approval of this entire containing authorization.
    /// Decoding this record is not proof that consent actually occurred; the host
    /// must create it only from the confirmation action and enforce its own audit.
    public struct Consent: Codable, Equatable, Sendable {
        public let explicitlyApproved: Bool
        public let confirmationID: UUID
        public let disclosureVersion: String
        public let confirmedAtUnixMilliseconds: Int64

        public init(explicitlyApproved: Bool, confirmationID: UUID,
                    disclosureVersion: String, confirmedAtUnixMilliseconds: Int64) throws {
            self.explicitlyApproved = explicitlyApproved
            self.confirmationID = confirmationID
            self.disclosureVersion = disclosureVersion
            self.confirmedAtUnixMilliseconds = confirmedAtUnixMilliseconds
            try validate()
        }
        public func validate() throws {
            guard explicitlyApproved, GenerationAuthorization.validToken(disclosureVersion),
                  (0...253_402_300_799_999).contains(confirmedAtUnixMilliseconds) else {
                throw SuiteValidationError.invalidValue("generationConsent")
            }
        }
        private enum CodingKeys: String, CodingKey, CaseIterable {
            case explicitlyApproved, confirmationID, disclosureVersion, confirmedAtUnixMilliseconds
        }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(explicitlyApproved: c.decode(Bool.self, forKey: .explicitlyApproved),
                confirmationID: c.decode(UUID.self, forKey: .confirmationID),
                disclosureVersion: c.decode(String.self, forKey: .disclosureVersion),
                confirmedAtUnixMilliseconds: c.decode(Int64.self, forKey: .confirmedAtUnixMilliseconds))
        }
        public func encode(to encoder: any Encoder) throws {
            try validate()
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(explicitlyApproved, forKey: .explicitlyApproved)
            try c.encode(confirmationID, forKey: .confirmationID)
            try c.encode(disclosureVersion, forKey: .disclosureVersion)
            try c.encode(confirmedAtUnixMilliseconds, forKey: .confirmedAtUnixMilliseconds)
        }
    }

    public init(idempotencyKey: UUID, provider: String, model: String, inputSHA256: String,
                recipeSHA256: String, priceListVersion: String, currency: String,
                costDecimalPlaces: Int, maximumCostUnits: Int64, consent: Consent) throws {
        schemaVersion = 1
        self.idempotencyKey = idempotencyKey
        self.provider = provider; self.model = model
        self.inputSHA256 = inputSHA256; self.recipeSHA256 = recipeSHA256
        self.priceListVersion = priceListVersion; self.currency = currency
        self.costDecimalPlaces = costDecimalPlaces; self.maximumCostUnits = maximumCostUnits
        self.consent = consent
        try validate()
    }

    public func validate() throws {
        guard schemaVersion == 1, Self.validToken(provider), Self.validToken(model),
              Self.validToken(priceListVersion), Self.validSHA(inputSHA256), Self.validSHA(recipeSHA256),
              currency.utf8.count == 3, currency.utf8.allSatisfy({ (65...90).contains($0) }),
              (0...9).contains(costDecimalPlaces), maximumCostUnits >= 0 else {
            throw SuiteValidationError.invalidValue("generationAuthorization")
        }
        try consent.validate()
    }

    /// No normalization or refreshed consent is permitted under an existing key.
    /// Call with the durable original before retrying; this value itself stores nothing.
    public func validateRetry(of original: Self) throws {
        try validate(); try original.validate()
        guard idempotencyKey == original.idempotencyKey, self == original else {
            throw SuiteValidationError.invalidValue("generationAuthorizationRetryMismatch")
        }
    }

    private static func validToken(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 256 &&
        value == value.trimmingCharacters(in: .whitespacesAndNewlines) &&
        !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
    }
    private static func validSHA(_ value: String) -> Bool {
        value.utf8.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case schemaVersion, idempotencyKey, provider, model, inputSHA256, recipeSHA256
        case priceListVersion, currency, costDecimalPlaces, maximumCostUnits, consent
    }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard try c.decode(Int.self, forKey: .schemaVersion) == 1 else {
            throw SuiteValidationError.invalidValue("generationAuthorizationSchema")
        }
        try self.init(idempotencyKey: c.decode(UUID.self, forKey: .idempotencyKey),
            provider: c.decode(String.self, forKey: .provider), model: c.decode(String.self, forKey: .model),
            inputSHA256: c.decode(String.self, forKey: .inputSHA256),
            recipeSHA256: c.decode(String.self, forKey: .recipeSHA256),
            priceListVersion: c.decode(String.self, forKey: .priceListVersion),
            currency: c.decode(String.self, forKey: .currency),
            costDecimalPlaces: c.decode(Int.self, forKey: .costDecimalPlaces),
            maximumCostUnits: c.decode(Int64.self, forKey: .maximumCostUnits),
            consent: c.decode(Consent.self, forKey: .consent))
    }
    public func encode(to encoder: any Encoder) throws {
        try validate()
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(idempotencyKey, forKey: .idempotencyKey)
        try c.encode(provider, forKey: .provider); try c.encode(model, forKey: .model)
        try c.encode(inputSHA256, forKey: .inputSHA256); try c.encode(recipeSHA256, forKey: .recipeSHA256)
        try c.encode(priceListVersion, forKey: .priceListVersion); try c.encode(currency, forKey: .currency)
        try c.encode(costDecimalPlaces, forKey: .costDecimalPlaces)
        try c.encode(maximumCostUnits, forKey: .maximumCostUnits); try c.encode(consent, forKey: .consent)
    }
}
