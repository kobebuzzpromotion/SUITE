import XCTest
import METISMobileCore
@testable import SuiteCore

final class CloudTransferPolicyTests: XCTestCase {
    private let sizes: [ProxyQuality: Int] = [.thumbnail: 256, .preview: 1_536, .highPreview: 4_096]

    func testLibraryNeverRequestsHighPreviewEvenOnFastLargeDevice() throws {
        let result = try ProxyQualityPolicy.select(intent: .library, viewportLongEdgePixels: 4_000, zoom: 3,
                                                   deviceMaximumLongEdge: 8_192, qualityLongEdges: sizes,
                                                   locallyAvailable: [], network: .online)
        XCTAssertEqual(result.quality, .thumbnail)
        XCTAssertTrue(result.requiresNetwork)
    }

    func testZoomAndDeviceChooseConfiguredQualityWithoutOriginalFallback() throws {
        let normal = try ProxyQualityPolicy.select(intent: .editing, viewportLongEdgePixels: 1_000, zoom: 1,
                                                   deviceMaximumLongEdge: 4_096, qualityLongEdges: sizes,
                                                   locallyAvailable: [], network: .online)
        XCTAssertEqual(normal.quality, .preview)
        let zoomed = try ProxyQualityPolicy.select(intent: .editing, viewportLongEdgePixels: 1_000, zoom: 2,
                                                   deviceMaximumLongEdge: 4_096, qualityLongEdges: sizes,
                                                   locallyAvailable: [], network: .online)
        XCTAssertEqual(zoomed.quality, .highPreview)
        let limited = try ProxyQualityPolicy.select(intent: .editing, viewportLongEdgePixels: 1_000, zoom: 2,
                                                    deviceMaximumLongEdge: 2_048, qualityLongEdges: sizes,
                                                    locallyAvailable: [], network: .online)
        XCTAssertEqual(limited.quality, .preview)
    }

    func testOfflineUsesCachedProxyAndPixelInspectionDoesNotPretendLowResolutionIsFinal() throws {
        let offline = try ProxyQualityPolicy.select(intent: .editing, viewportLongEdgePixels: 1_000, zoom: 2,
                                                    deviceMaximumLongEdge: 4_096, qualityLongEdges: sizes,
                                                    locallyAvailable: [.preview], network: .offline)
        XCTAssertEqual(offline.quality, .preview)
        XCTAssertFalse(offline.requiresNetwork)
        let inspection = try ProxyQualityPolicy.select(intent: .explicitPixelInspection, viewportLongEdgePixels: 1_000, zoom: 1,
                                                       deviceMaximumLongEdge: 4_096, qualityLongEdges: sizes,
                                                       locallyAvailable: [.preview], network: .offline)
        XCTAssertNil(inspection.quality)
        let constrained = try ProxyQualityPolicy.select(intent: .editing, viewportLongEdgePixels: 2_000, zoom: 2,
                                                        deviceMaximumLongEdge: 4_096, qualityLongEdges: sizes,
                                                        locallyAvailable: [], network: .constrained)
        XCTAssertEqual(constrained.quality, .preview)
    }

    func testOnlyExplicitFinalOriginalTargetsArePromoted() {
        let selected = UUID(), other = UUID()
        XCTAssertEqual(SyncPriorityPolicy.priority(kind: .recipe, assetID: other), .recipeMetadataP0)
        XCTAssertEqual(SyncPriorityPolicy.priority(kind: .metadata, assetID: other), .recipeMetadataP0)
        XCTAssertEqual(SyncPriorityPolicy.priority(kind: .proxy, assetID: other), .proxyP1)
        XCTAssertEqual(SyncPriorityPolicy.priority(kind: .original, assetID: other), .originalP2)
        XCTAssertEqual(SyncPriorityPolicy.priority(kind: .optionalGenerated, assetID: other), .optionalGeneratedExportP3)
        XCTAssertEqual(SyncPriorityPolicy.priority(kind: .original, assetID: selected, immediateFinalAssetIDs: [selected]), .immediateFinalTarget)
        XCTAssertEqual(SyncPriorityPolicy.priority(kind: .original, assetID: other, immediateFinalAssetIDs: [selected]), .originalP2)
        XCTAssertEqual(SyncPriorityPolicy.priority(kind: .proxy, assetID: selected, immediateFinalAssetIDs: [selected]), .proxyP1)
        XCTAssertLessThan(SyncPriority.immediateFinalTarget, .recipeMetadataP0)
    }

    func testCellularRequiresExplicitOptInAndPauseOrUnknownNeverTransfer() {
        XCTAssertEqual(NetworkTransferPolicy.evaluate(.wifiOnly, path: .cellular), .deferred(.cellularNotPermitted))
        XCTAssertEqual(NetworkTransferPolicy.evaluate(.wifiAndCellular, path: .cellular), .allowed)
        XCTAssertEqual(NetworkTransferPolicy.evaluate(.wifiOnly, path: .wifi), .allowed)
        XCTAssertEqual(NetworkTransferPolicy.evaluate(.pause, path: .wifi), .deferred(.paused))
        XCTAssertEqual(NetworkTransferPolicy.evaluate(.wifiAndCellular, path: .unknown), .deferred(.unknownNetwork))
        XCTAssertEqual(NetworkTransferPolicy.evaluate(.wifiAndCellular, path: .offline), .deferred(.offline))
    }
}
