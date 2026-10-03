import Foundation
import XCTest
import METISMobileCore
@testable import SuiteCore

final class PhotoLifecycleTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 100)
    private let checksum = String(repeating: "a", count: 64)

    private func asset() -> AssetRecord {
        AssetRecord(originalFilename: "shot.dng", originalRelativePath: "originals/shot.dng", sha256: checksum)
    }

    private func proof(for asset: AssetRecord, permission: VerificationStatus = .passed,
                       metadata: VerificationStatus = .passed, representation: PhotoRepresentation = .original,
                       size: VerificationStatus = .passed, association: VerificationStatus = .passed,
                       expiry: Date = Date(timeIntervalSince1970: 200)) -> CloudSafetyEvidence {
        CloudSafetyEvidence(assetID: asset.id, representation: representation, objectID: "private/object-1", objectVersion: "v1",
                            sha256: asset.sha256, uploadComplete: .passed, checksumVerified: .passed,
                            serverVerified: .passed, objectExists: .passed, metadataExists: metadata,
                            permissionVerified: permission, databaseCommitted: .passed,
                            sizeMatched: size, ownerWorkspaceConfirmed: association,
                            verifiedAt: Date(timeIntervalSince1970: 50), expiresAt: expiry)
    }

    func testOrdinaryWorkflowNeverRequestsOriginalAndFinalAlwaysDoes() {
        for intent in [PhotoAccessIntent.library, .selection, .preview, .editing, .analysis] {
            XCTAssertNotEqual(intent.requiredRepresentation, .original)
            XCTAssertFalse(PhotoSyncPolicy.requiredFor(intent).contains(.original))
        }
        for intent in [PhotoAccessIntent.finalJPEG, .finalTIFF, .highPrecision, .rawRedevelopment] {
            XCTAssertEqual(intent.requiredRepresentation, .original)
        }
        XCTAssertFalse(PhotoSyncPolicy.libraryDownloadRepresentations.contains(.original))
        XCTAssertTrue(PhotoSyncPolicy.libraryDownloadRepresentations.contains(.recipe))
    }

    func testCloudSafetyIsFailClosedAndBindsAssetRepresentationChecksumAndExpiry() {
        let original = asset()
        XCTAssertTrue(proof(for: original).isCloudSafe(for: original, now: now))
        XCTAssertFalse(proof(for: original, permission: .unknown).isCloudSafe(for: original, now: now))
        XCTAssertFalse(proof(for: original, metadata: .failed).isCloudSafe(for: original, now: now))
        XCTAssertFalse(proof(for: original, size: .unknown).isCloudSafe(for: original, now: now))
        XCTAssertFalse(proof(for: original, association: .failed).isCloudSafe(for: original, now: now))
        XCTAssertFalse(proof(for: original, representation: .proxy).isCloudSafe(for: original, now: now))
        XCTAssertFalse(proof(for: original, expiry: now).isCloudSafe(for: original, now: now))
        XCTAssertFalse(proof(for: original).isCloudSafe(for: asset(), now: now))
        let unknown = CloudSafetyEvidence(assetID: original.id, objectID: "o", objectVersion: "v", sha256: checksum,
                                          verifiedAt: Date(timeIntervalSince1970: 50), expiresAt: Date(timeIntervalSince1970: 200))
        XCTAssertFalse(unknown.isCloudSafe(for: original, now: now))
    }

    func testFinalWaitsForOriginalAcrossOfflineDownloadFailureAndChecksumFailure() {
        let original = asset()
        let cloud = proof(for: original)
        XCTAssertEqual(ExportReadiness.evaluate(asset: original, local: .missing, cloud: cloud, network: .offline, now: now), .waitingForOriginal(.offline))
        XCTAssertEqual(ExportReadiness.evaluate(asset: original, local: .missing, cloud: cloud, network: .online, now: now), .waitingForOriginal(.downloadRequired))
        XCTAssertEqual(ExportReadiness.evaluate(asset: original, local: .failed, cloud: cloud, network: .online, now: now), .waitingForOriginal(.downloadFailed))
        XCTAssertEqual(ExportReadiness.evaluate(asset: original, local: .missing, cloud: nil, network: .online, now: now), .waitingForOriginal(.cloudNotVerified))
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("verified-original.dng")
        XCTAssertEqual(ExportReadiness.evaluate(asset: original, local: .verified(assetID: original.id, url: url, sha256: checksum), cloud: nil, network: .offline, now: now), .ready(originalURL: url))
        XCTAssertEqual(ExportReadiness.evaluate(asset: original, local: .verified(assetID: original.id, url: url, sha256: String(repeating: "b", count: 64)), cloud: cloud, network: .online, now: now), .waitingForOriginal(.checksumMismatch))
    }

    func testProxyEvictionCannotAuthorizeOriginalOrRecipeDeletion() {
        let original = asset()
        let proxy = CacheEntry(assetID: original.id, representation: .proxy, sha256: checksum, regenerable: true)
        XCTAssertEqual(CacheEvictionPolicy.evaluate(proxy, cloud: nil, now: now), .allowed)
        let raw = CacheEntry(assetID: original.id, representation: .original, sha256: checksum, regenerable: true,
                             localOnly: false, reacquisitionAvailable: true)
        XCTAssertNotEqual(CacheEvictionPolicy.evaluate(raw, cloud: nil, allowOriginalEviction: true, now: now), .allowed)
        XCTAssertNotEqual(CacheEvictionPolicy.evaluate(raw, cloud: proof(for: original, representation: .proxy), allowOriginalEviction: true, now: now), .allowed)
        XCTAssertNotEqual(CacheEvictionPolicy.evaluate(raw, cloud: proof(for: original), now: now), .allowed)
        XCTAssertEqual(CacheEvictionPolicy.evaluate(raw, cloud: proof(for: original), allowOriginalEviction: true, now: now), .allowed)
        let localOnly = CacheEntry(assetID: original.id, representation: .original, sha256: checksum,
                                   localOnly: true, reacquisitionAvailable: true)
        XCTAssertNotEqual(CacheEvictionPolicy.evaluate(localOnly, cloud: proof(for: original), allowOriginalEviction: true, now: now), .allowed)
        let notReacquirable = CacheEntry(assetID: original.id, representation: .original, sha256: checksum, localOnly: false)
        XCTAssertNotEqual(CacheEvictionPolicy.evaluate(notReacquirable, cloud: proof(for: original), allowOriginalEviction: true, now: now), .allowed)
        let active = CacheEntry(assetID: original.id, representation: .original, sha256: checksum, activeConsumers: 1)
        XCTAssertNotEqual(CacheEvictionPolicy.evaluate(active, cloud: proof(for: original), allowOriginalEviction: true, now: now), .allowed)
        let recipe = CacheEntry(assetID: original.id, representation: .recipe, sha256: checksum, regenerable: true)
        XCTAssertNotEqual(CacheEvictionPolicy.evaluate(recipe, cloud: proof(for: original, representation: .recipe), now: now), .allowed)
        let unsaved = CacheEntry(assetID: original.id, representation: .proxy, sha256: checksum,
                                 regenerable: true, hasUnsavedChanges: true)
        XCTAssertNotEqual(CacheEvictionPolicy.evaluate(unsaved, cloud: nil, now: now), .allowed)
    }

    func testCanonicalGenerationIsProtectedEvenIfCallerMarksItRegenerable() {
        let original = asset()
        let generated = CacheEntry(assetID: original.id, representation: .generated, sha256: checksum, regenerable: true)
        XCTAssertNotEqual(CacheEvictionPolicy.evaluate(generated, cloud: nil, now: now), .allowed)
        XCTAssertEqual(CacheEvictionPolicy.evaluate(generated, cloud: proof(for: original, representation: .generated), now: now), .allowed)
    }

    func testExportFreezesInputRecipeAndRejectsOriginalOverwriteDestination() throws {
        let original = asset()
        var history = EditHistory(parameters: .init(exposure: 0.5))
        let checkpoint = ProjectCheckpoint(asset: original, history: history, revision: 4)
        let plan = try ExportPlan(checkpoint: checkpoint, format: .tiff)
        history.apply(.init(exposure: 3))
        XCTAssertEqual(plan.parameters.exposure, 0.5)
        XCTAssertEqual(plan.recipeRevision, 4)
        XCTAssertEqual(plan.originalSHA256, original.sha256)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("original.dng")
        XCTAssertThrowsError(try RAWRenderRequest(plan: plan, originalURL: url, destinationURL: url))
    }

    func testSupportedCameraRequiresHardwareEvidence() {
        XCTAssertThrowsError(try CameraCompatibility(manufacturer: "Maker", model: "Camera", support: .supported))
        let forged = Data(#"{"manufacturer":"Maker","model":"Camera","support":"supported"}"#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(CameraCompatibility.self, from: forged))
    }

    func testOldCloudEvidenceWithoutNewGatesDecodesUnknownAndCannotEvictOriginal() throws {
        let original = asset()
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(proof(for: original))) as? [String: Any])
        object.removeValue(forKey: "sizeMatched")
        object.removeValue(forKey: "ownerWorkspaceConfirmed")
        let restored = try JSONDecoder().decode(CloudSafetyEvidence.self, from: JSONSerialization.data(withJSONObject: object))
        XCTAssertEqual(restored.sizeMatched, .unknown)
        XCTAssertEqual(restored.ownerWorkspaceConfirmed, .unknown)
        XCTAssertFalse(restored.isCloudSafe(for: original, now: now))
        let raw = CacheEntry(assetID: original.id, representation: .original, sha256: checksum,
                              localOnly: false, reacquisitionAvailable: true)
        XCTAssertNotEqual(CacheEvictionPolicy.evaluate(raw, cloud: restored, allowOriginalEviction: true, now: now), .allowed)
    }
}
