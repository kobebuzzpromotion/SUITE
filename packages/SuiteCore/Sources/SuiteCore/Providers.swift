import Foundation

/// Interfaces only. No implementation is registered merely because a protocol exists.
public enum ProviderFailure: Error, Equatable, Sendable {
    case notConnected(String)
    case unsupported(String)
    case originalRequired
    case verificationRequired
}

public enum ExportFormat: String, Codable, CaseIterable, Sendable { case jpeg, tiff, png }

public struct PhotoObjectReference: Codable, Equatable, Sendable {
    public let assetID: UUID
    public let representation: PhotoRepresentation
    public let objectID: String
    public let version: String
    public let sha256: String

    public init(assetID: UUID, representation: PhotoRepresentation, objectID: String,
                version: String, sha256: String) {
        self.assetID = assetID
        self.representation = representation
        self.objectID = objectID
        self.version = version
        self.sha256 = sha256
    }
}

public struct RAWRenderRequest: Sendable {
    public let plan: ExportPlan
    public let originalURL: URL
    public let destinationURL: URL

    public init(plan: ExportPlan, originalURL: URL, destinationURL: URL) throws {
        guard originalURL.isFileURL, destinationURL.isFileURL,
              originalURL.standardizedFileURL.resolvingSymlinksInPath() != destinationURL.standardizedFileURL.resolvingSymlinksInPath() else {
            throw SuiteValidationError.invalidValue("renderPaths")
        }
        try plan.validate()
        self.plan = plan
        self.originalURL = originalURL
        self.destinationURL = destinationURL
    }
}

public protocol RAWProvider: Sendable {
    var identifier: String { get }
    var supportedAdjustments: Set<RAWAdjustment> { get }
    /// Validate camera/RAW compatibility and all Recipe stages; unsupported stages must throw.
    func validate(_ request: RAWRenderRequest) async throws
    func render(_ request: RAWRenderRequest) async throws -> URL
}

public protocol StorageProvider: Sendable {
    var identifier: String { get }
    func upload(fileURL: URL, reference: PhotoObjectReference, idempotencyKey: UUID) async throws
    func verify(_ reference: PhotoObjectReference) async throws -> CloudSafetyEvidence
    /// Explicit object download only; never implicitly hydrate all originals in a project.
    func download(_ reference: PhotoObjectReference, destinationURL: URL) async throws
}

public enum CameraSupport: String, Codable, Sendable { case unsupported, beta, supported }

public struct CameraCompatibility: Codable, Equatable, Sendable {
    public let manufacturer: String
    public let model: String
    public let support: CameraSupport
    public let hardwareEvidenceReference: String?

    public init(manufacturer: String, model: String, support: CameraSupport,
                hardwareEvidenceReference: String? = nil) throws {
        guard !manufacturer.isEmpty, !model.isEmpty,
              support != .supported || !(hardwareEvidenceReference?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true) else {
            throw ProviderFailure.verificationRequired
        }
        self.manufacturer = manufacturer
        self.model = model
        self.support = support
        self.hardwareEvidenceReference = hardwareEvidenceReference
    }

    private enum CodingKeys: String, CodingKey { case manufacturer, model, support, hardwareEvidenceReference }

    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(manufacturer: values.decode(String.self, forKey: .manufacturer),
                      model: values.decode(String.self, forKey: .model),
                      support: values.decode(CameraSupport.self, forKey: .support),
                      hardwareEvidenceReference: values.decodeIfPresent(String.self, forKey: .hardwareEvidenceReference))
    }
}

public protocol CameraProvider: Sendable {
    var identifier: String { get }
    var compatibility: [CameraCompatibility] { get }
    func connect(manufacturer: String, model: String) async throws
    func receiveOriginal(destinationDirectory: URL) async throws -> URL
    func disconnect() async throws
}

public struct CanonicalGeneration: Codable, Equatable, Sendable {
    public let id: UUID
    public let originalAssetID: UUID
    public let recipeRevision: Int
    public let prompt: String
    public let seed: String
    public let model: String
    public let background: PhotoObjectReference
    public let mask: PhotoObjectReference
    public let composition: [String: RecipeValue]
    public let lightingReference: PhotoObjectReference?
    public let colorData: [String: RecipeValue]

    public init(id: UUID = UUID(), originalAssetID: UUID, recipeRevision: Int, prompt: String,
                seed: String, model: String, background: PhotoObjectReference, mask: PhotoObjectReference,
                composition: [String: RecipeValue], lightingReference: PhotoObjectReference?,
                colorData: [String: RecipeValue]) {
        self.id = id
        self.originalAssetID = originalAssetID
        self.recipeRevision = recipeRevision
        self.prompt = prompt
        self.seed = seed
        self.model = model
        self.background = background
        self.mask = mask
        self.composition = composition
        self.lightingReference = lightingReference
        self.colorData = colorData
    }
}

public protocol GenerativeProvider: Sendable {
    var identifier: String { get }
    /// Existing Picasso/da Vinci gateway adapter remains pending; do not reimplement its provider calls here.
    func createCanonicalPreview(asset: AssetRecord, recipe: RecipeParameters, idempotencyKey: UUID) async throws -> CanonicalGeneration
    /// Must reuse canonical assets and reject failed identity/quality checks; never generate a different scene.
    func renderFinal(canonical: CanonicalGeneration, originalURL: URL, destinationURL: URL) async throws -> URL
}

public struct Entitlement: Codable, Equatable, Sendable {
    public let productID: String
    public let active: Bool
    public let expiresAt: Date?

    public init(productID: String, active: Bool, expiresAt: Date?) {
        self.productID = productID
        self.active = active
        self.expiresAt = expiresAt
    }
}

public protocol PaymentProvider: Sendable {
    var identifier: String { get }
    func entitlements() async throws -> [Entitlement]
    func purchase(productID: String) async throws
    func restorePurchases() async throws
}
