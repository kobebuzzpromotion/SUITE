import Foundation
import METISMobileCore

public enum PhotoRepresentation: String, Codable, CaseIterable, Sendable {
    case original, thumbnail, proxy, preview, recipe, generated, exported
}

public enum PhotoAccessIntent: String, Codable, CaseIterable, Sendable {
    case library, selection, preview, editing, analysis
    case finalJPEG, finalTIFF, highPrecision, rawRedevelopment

    public var requiredRepresentation: PhotoRepresentation {
        switch self {
        case .library: .thumbnail
        case .selection, .editing, .analysis: .proxy
        case .preview: .preview
        case .finalJPEG, .finalTIFF, .highPrecision, .rawRedevelopment: .original
        }
    }
}

public enum PhotoSyncPolicy {
    /// Normal cross-device hydration never requests every RAW. Originals are uploaded for safety,
    /// but downloaded only for an explicit final/high-precision/redevelopment intent.
    public static var libraryDownloadRepresentations: Set<PhotoRepresentation> { [.thumbnail, .proxy, .recipe] }
    public static func requiredFor(_ intent: PhotoAccessIntent) -> Set<PhotoRepresentation> {
        [intent.requiredRepresentation, .recipe]
    }
}

public enum VerificationStatus: String, Codable, Sendable { case unknown, passed, failed }

/// Evidence must be returned by authenticated storage/server verification for this exact immutable object.
/// A client constructing these values is not sufficient authority for physical deletion.
public struct CloudSafetyEvidence: Codable, Equatable, Sendable {
    public let assetID: UUID
    public let representation: PhotoRepresentation
    public let objectID: String
    public let objectVersion: String
    public let sha256: String
    public let uploadComplete: VerificationStatus
    public let checksumVerified: VerificationStatus
    public let serverVerified: VerificationStatus
    public let objectExists: VerificationStatus
    public let metadataExists: VerificationStatus
    public let permissionVerified: VerificationStatus
    public let databaseCommitted: VerificationStatus
    public let sizeMatched: VerificationStatus
    public let ownerWorkspaceConfirmed: VerificationStatus
    public let verifiedAt: Date
    public let expiresAt: Date

    public init(assetID: UUID, representation: PhotoRepresentation = .original,
                objectID: String, objectVersion: String, sha256: String,
                uploadComplete: VerificationStatus = .unknown, checksumVerified: VerificationStatus = .unknown,
                serverVerified: VerificationStatus = .unknown, objectExists: VerificationStatus = .unknown,
                metadataExists: VerificationStatus = .unknown, permissionVerified: VerificationStatus = .unknown,
                databaseCommitted: VerificationStatus = .unknown, sizeMatched: VerificationStatus = .unknown,
                ownerWorkspaceConfirmed: VerificationStatus = .unknown, verifiedAt: Date, expiresAt: Date) {
        self.assetID = assetID
        self.representation = representation
        self.objectID = objectID
        self.objectVersion = objectVersion
        self.sha256 = sha256
        self.uploadComplete = uploadComplete
        self.checksumVerified = checksumVerified
        self.serverVerified = serverVerified
        self.objectExists = objectExists
        self.metadataExists = metadataExists
        self.permissionVerified = permissionVerified
        self.databaseCommitted = databaseCommitted
        self.sizeMatched = sizeMatched
        self.ownerWorkspaceConfirmed = ownerWorkspaceConfirmed
        self.verifiedAt = verifiedAt
        self.expiresAt = expiresAt
    }

    public func blockers(assetID expectedID: UUID, representation expectedRepresentation: PhotoRepresentation,
                         sha256 expectedChecksum: String, now: Date = Date()) -> [String] {
        var result: [String] = []
        if assetID != expectedID { result.append("asset_mismatch") }
        if representation != expectedRepresentation { result.append("representation_mismatch") }
        if !isSHA256(sha256) || !isSHA256(expectedChecksum) || sha256.lowercased() != expectedChecksum.lowercased() {
            result.append("checksum_mismatch")
        }
        if objectID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || objectVersion.isEmpty { result.append("object_reference_missing") }
        if !verifiedAt.timeIntervalSince1970.isFinite || !expiresAt.timeIntervalSince1970.isFinite
            || !now.timeIntervalSince1970.isFinite || verifiedAt > now || expiresAt <= now || verifiedAt >= expiresAt {
            result.append("verification_expired_or_invalid")
        }
        let checks: [(String, VerificationStatus)] = [
            ("upload_complete", uploadComplete), ("checksum_verified", checksumVerified),
            ("server_verified", serverVerified), ("object_exists", objectExists),
            ("metadata_exists", metadataExists), ("permission_verified", permissionVerified),
            ("database_committed", databaseCommitted), ("size_matched", sizeMatched),
            ("owner_workspace_confirmed", ownerWorkspaceConfirmed)
        ]
        result.append(contentsOf: checks.filter { $0.1 != .passed }.map { "\($0.0):\($0.1.rawValue)" })
        return result
    }

    public func isCloudSafe(for asset: AssetRecord, now: Date = Date()) -> Bool {
        blockers(assetID: asset.id, representation: .original, sha256: asset.sha256, now: now).isEmpty
    }

    private enum CodingKeys: String, CodingKey {
        case assetID, representation, objectID, objectVersion, sha256, uploadComplete, checksumVerified
        case serverVerified, objectExists, metadataExists, permissionVerified, databaseCommitted
        case sizeMatched, ownerWorkspaceConfirmed, verifiedAt, expiresAt
    }

    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(assetID: c.decode(UUID.self, forKey: .assetID),
                      representation: c.decode(PhotoRepresentation.self, forKey: .representation),
                      objectID: c.decode(String.self, forKey: .objectID), objectVersion: c.decode(String.self, forKey: .objectVersion),
                      sha256: c.decode(String.self, forKey: .sha256),
                      uploadComplete: c.decodeIfPresent(VerificationStatus.self, forKey: .uploadComplete) ?? .unknown,
                      checksumVerified: c.decodeIfPresent(VerificationStatus.self, forKey: .checksumVerified) ?? .unknown,
                      serverVerified: c.decodeIfPresent(VerificationStatus.self, forKey: .serverVerified) ?? .unknown,
                      objectExists: c.decodeIfPresent(VerificationStatus.self, forKey: .objectExists) ?? .unknown,
                      metadataExists: c.decodeIfPresent(VerificationStatus.self, forKey: .metadataExists) ?? .unknown,
                      permissionVerified: c.decodeIfPresent(VerificationStatus.self, forKey: .permissionVerified) ?? .unknown,
                      databaseCommitted: c.decodeIfPresent(VerificationStatus.self, forKey: .databaseCommitted) ?? .unknown,
                      sizeMatched: c.decodeIfPresent(VerificationStatus.self, forKey: .sizeMatched) ?? .unknown,
                      ownerWorkspaceConfirmed: c.decodeIfPresent(VerificationStatus.self, forKey: .ownerWorkspaceConfirmed) ?? .unknown,
                      verifiedAt: c.decode(Date.self, forKey: .verifiedAt), expiresAt: c.decode(Date.self, forKey: .expiresAt))
    }
}

/// Lifecycle storage is independent from Proxy/Recipe. No case means "all RAWs downloaded".
public enum OriginalLifecycle: String, Codable, Sendable {
    case localOnly, queuedForUpload, uploading, awaitingCloudVerification
    case cloudSafeAndLocal, remoteOnly, queuedForDownload, downloading
    case locallyVerified, unavailable, checksumMismatch

    public static func resolved(asset: AssetRecord, local: LocalOriginalAvailability,
                                cloud: CloudSafetyEvidence?, now: Date = Date()) -> OriginalLifecycle {
        let safe = cloud?.isCloudSafe(for: asset, now: now) == true
        switch local {
        case .missing: return safe ? .remoteOnly : .unavailable
        case .downloading: return .downloading
        case .failed: return .unavailable
        case .verified(let id, let url, let checksum):
            guard id == asset.id, url.isFileURL, isSHA256(checksum), isSHA256(asset.sha256),
                  checksum.lowercased() == asset.sha256.lowercased() else { return .checksumMismatch }
            return safe ? .cloudSafeAndLocal : .localOnly
        }
    }
}

public enum LocalOriginalAvailability: Equatable, Sendable {
    case missing, downloading, failed
    /// Caller verifies file existence, bytes/checksum and security-scoped access immediately before use.
    case verified(assetID: UUID, url: URL, sha256: String)
}

public enum OriginalWaitReason: String, Codable, Sendable {
    case offline, cloudNotVerified, downloadRequired, downloading, downloadFailed, checksumMismatch, invalidLocalReference
}

public enum ExportReadiness: Equatable, Sendable {
    case ready(originalURL: URL)
    case waitingForOriginal(OriginalWaitReason)

    /// Final render has no Proxy fallback; output must use the checksum-verified Original and frozen Recipe.
    public static func evaluate(asset: AssetRecord, local: LocalOriginalAvailability,
                                cloud: CloudSafetyEvidence?, network: NetworkCondition,
                                now: Date = Date()) -> ExportReadiness {
        switch local {
        case .verified(let assetID, let url, let checksum):
            guard assetID == asset.id, isSHA256(checksum), isSHA256(asset.sha256),
                  checksum.lowercased() == asset.sha256.lowercased() else {
                return .waitingForOriginal(.checksumMismatch)
            }
            guard url.isFileURL else { return .waitingForOriginal(.invalidLocalReference) }
            return .ready(originalURL: url)
        case .downloading: return .waitingForOriginal(.downloading)
        case .failed: return .waitingForOriginal(.downloadFailed)
        case .missing:
            guard network != .offline && network != .unknown else { return .waitingForOriginal(.offline) }
            guard cloud?.isCloudSafe(for: asset, now: now) == true else { return .waitingForOriginal(.cloudNotVerified) }
            return .waitingForOriginal(.downloadRequired)
        }
    }
}

public struct CacheEntry: Equatable, Sendable {
    public let assetID: UUID
    public let representation: PhotoRepresentation
    public let sha256: String
    public let pinned: Bool
    public let activeConsumers: Int
    public let regenerable: Bool
    public let localOnly: Bool
    public let reacquisitionAvailable: Bool
    public let hasUnsavedChanges: Bool

    public init(assetID: UUID, representation: PhotoRepresentation, sha256: String,
                pinned: Bool = false, activeConsumers: Int = 0, regenerable: Bool = false,
                localOnly: Bool = true, reacquisitionAvailable: Bool = false, hasUnsavedChanges: Bool = false) {
        self.assetID = assetID
        self.representation = representation
        self.sha256 = sha256
        self.pinned = pinned
        self.activeConsumers = activeConsumers
        self.regenerable = regenerable
        self.localOnly = localOnly
        self.reacquisitionAvailable = reacquisitionAvailable
        self.hasUnsavedChanges = hasUnsavedChanges
    }
}

public enum CacheEvictionDecision: Equatable, Sendable { case allowed, protected(reason: String) }

public enum CacheEvictionPolicy {
    /// Decision only: does not delete files. The adapter must recheck active use and trusted cloud evidence at deletion.
    public static func evaluate(_ entry: CacheEntry, cloud: CloudSafetyEvidence?,
                                allowOriginalEviction: Bool = false, now: Date = Date()) -> CacheEvictionDecision {
        guard isSHA256(entry.sha256), entry.activeConsumers >= 0 else { return .protected(reason: "invalid_cache_entry") }
        guard !entry.pinned, entry.activeConsumers == 0, !entry.hasUnsavedChanges else {
            return .protected(reason: "in_use_pinned_or_unsaved")
        }
        if entry.representation == .recipe { return .protected(reason: "recipe_is_not_disposable_cache") }
        let cloudSafe = cloud?.blockers(assetID: entry.assetID, representation: entry.representation,
                                      sha256: entry.sha256, now: now).isEmpty == true
        switch entry.representation {
        case .original:
            return allowOriginalEviction && cloudSafe && !entry.localOnly && entry.reacquisitionAvailable
                ? .allowed : .protected(reason: "original_requires_policy_reacquisition_and_cloud_safe")
        case .generated:
            // Canonical generated assets cannot be regenerated from scratch: Preview must equal Final intent.
            return cloudSafe ? .allowed : .protected(reason: "canonical_generated_asset_requires_durable_copy")
        case .thumbnail, .proxy, .preview, .exported:
            return entry.regenerable || cloudSafe ? .allowed : .protected(reason: "no_recovery_source")
        case .recipe: return .protected(reason: "recipe_is_not_disposable_cache")
        }
    }
}

public struct ExportPlan: Codable, Equatable, Sendable {
    public let id: UUID
    public let assetID: UUID
    public let originalSHA256: String
    public let recipeRevision: Int
    public let parameters: RecipeParameters
    public let format: ExportFormat
    public let canonicalGeneratedAssetIDs: [UUID]

    public init(id: UUID = UUID(), checkpoint: ProjectCheckpoint, format: ExportFormat,
                canonicalGeneratedAssetIDs: [UUID] = []) throws {
        try checkpoint.validate()
        self.id = id
        assetID = checkpoint.asset.id
        originalSHA256 = checkpoint.asset.sha256
        recipeRevision = checkpoint.revision
        parameters = checkpoint.history.current
        self.format = format
        self.canonicalGeneratedAssetIDs = canonicalGeneratedAssetIDs
        try validate()
    }

    public func validate() throws {
        guard recipeRevision >= 0, isSHA256(originalSHA256),
              Set(canonicalGeneratedAssetIDs).count == canonicalGeneratedAssetIDs.count else {
            throw SuiteValidationError.invalidValue("exportPlan")
        }
        try parameters.validate()
        if let backdrop = try parameters.localBackdropRecipe() {
            try backdrop.validate()
            guard backdrop.assetID == assetID, backdrop.originalSHA256 == originalSHA256.lowercased() else {
                throw SuiteValidationError.invalidValue("exportLocalBackdropAssetBinding")
            }
        }
        if let localWarp = try parameters.localWarpRecipe() {
            try localWarp.validate()
            guard localWarp.assetID == assetID,
                  localWarp.originalSHA256 == originalSHA256.lowercased() else {
                throw SuiteValidationError.invalidValue("exportLocalWarpAssetBinding")
            }
        }
        if let localRetouch = try parameters.localRetouchRecipe() {
            try localRetouch.validate()
            guard localRetouch.assetID == assetID,
                  localRetouch.originalSHA256 == originalSHA256.lowercased() else {
                throw SuiteValidationError.invalidValue("exportLocalRetouchAssetBinding")
            }
        }
        if let portrait = try parameters.portraitRecipe() {
            try PersonGeometryIntegrity.validate(portrait.personGeometryInventory)
            guard portrait.assetID == assetID, portrait.originalSHA256 == originalSHA256.lowercased() else {
                throw SuiteValidationError.invalidValue("exportPersonAssetBinding")
            }
        }
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, assetID, originalSHA256, recipeRevision, parameters, format, canonicalGeneratedAssetIDs
    }

    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(UUID.self, forKey: .id)
        assetID = try values.decode(UUID.self, forKey: .assetID)
        originalSHA256 = try values.decode(String.self, forKey: .originalSHA256)
        recipeRevision = try values.decode(Int.self, forKey: .recipeRevision)
        parameters = try values.decode(RecipeParameters.self, forKey: .parameters)
        format = try values.decode(ExportFormat.self, forKey: .format)
        canonicalGeneratedAssetIDs = try values.decode([UUID].self, forKey: .canonicalGeneratedAssetIDs)
        try validate()
    }
}
