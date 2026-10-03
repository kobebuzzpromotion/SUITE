import Foundation

/// Shared safety gate independent of Skin/Eyes/Face/Body adjustment adapters.
/// A photo-local UUID and face geometry are not biometric/cross-photo identity.
public struct PersonGeometryTarget: Equatable, Sendable {
    public let id: UUID
    public let anchor: PortraitFaceAnchor
    public init(id: UUID, anchor: PortraitFaceAnchor) { self.id = id; self.anchor = anchor }
}
public struct PersonGeometryInventory: Equatable, Sendable {
    public let assetID: UUID
    public let originalSHA256: String
    public let targets: [PersonGeometryTarget]
    public init(assetID: UUID, originalSHA256: String, targets: [PersonGeometryTarget]) {
        self.assetID = assetID; self.originalSHA256 = originalSHA256.lowercased(); self.targets = targets
    }
}
public enum PersonGeometryIntegrity {
    public static func validate(_ inventory: PersonGeometryInventory) throws {
        guard isSHA256(inventory.originalSHA256), !inventory.targets.isEmpty, inventory.targets.count <= 64,
              Set(inventory.targets.map(\.id)).count == inventory.targets.count else {
            throw SuiteValidationError.invalidValue("personInventory")
        }
        for (index, target) in inventory.targets.enumerated() {
            try target.anchor.validate()
            guard !inventory.targets.dropFirst(index + 1).contains(where: { target.anchor.intersectionOverUnion($0.anchor) > 0 }) else {
                throw SuiteValidationError.invalidValue("personOverlappingFaces")
            }
        }
    }
    public static func validate(_ inventory: PersonGeometryInventory, asset: AssetRecord) throws {
        try validate(inventory); try asset.validate()
        guard inventory.assetID == asset.id, inventory.originalSHA256 == asset.sha256.lowercased() else {
            throw SuiteValidationError.invalidValue("personAssetBinding")
        }
    }
    public static func validate(_ incoming: PersonGeometryInventory, against reference: PersonGeometryInventory) throws {
        try validate(incoming); try validate(reference)
        guard incoming.assetID == reference.assetID, incoming.originalSHA256 == reference.originalSHA256 else {
            throw SuiteValidationError.invalidValue("personAssetBinding")
        }
        guard incoming.targets.count == reference.targets.count else { throw SuiteValidationError.invalidValue("personInventory") }
        for target in incoming.targets {
            guard let known = reference.targets.first(where: { $0.id == target.id }), known.anchor == target.anchor else {
                throw SuiteValidationError.invalidValue("personGeometryBinding")
            }
        }
    }
}
