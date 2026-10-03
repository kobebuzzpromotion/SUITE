import Foundation
import METISMobileCore

public enum ProxyQuality: String, Codable, CaseIterable, Sendable { case thumbnail, preview, highPreview }
public enum ProxyViewingIntent: String, Codable, Sendable { case library, selection, editing, explicitPixelInspection }
public struct ProxyQualitySelection: Equatable, Sendable {
    public let quality: ProxyQuality?
    public let requiresNetwork: Bool
    public let reason: String
}

public enum ProxyQualityPolicy {
    /// Quality sizes are configuration, not fixed product constants. This selects a derivative, never Original.
    public static func select(intent: ProxyViewingIntent, viewportLongEdgePixels: Int, zoom: Double,
                              deviceMaximumLongEdge: Int, qualityLongEdges: [ProxyQuality: Int],
                              locallyAvailable: Set<ProxyQuality>, network: NetworkCondition) throws -> ProxyQualitySelection {
        guard viewportLongEdgePixels > 0, zoom.isFinite, zoom > 0, deviceMaximumLongEdge > 0,
              qualityLongEdges.values.allSatisfy({ $0 > 0 }),
              (Double(viewportLongEdgePixels) * zoom).isFinite else {
            throw SuiteValidationError.invalidValue("proxyQualityRequest")
        }
        if let thumbnail = qualityLongEdges[.thumbnail], let preview = qualityLongEdges[.preview], thumbnail > preview {
            throw SuiteValidationError.invalidValue("proxyQualityOrder")
        }
        if let preview = qualityLongEdges[.preview], let high = qualityLongEdges[.highPreview], preview > high {
            throw SuiteValidationError.invalidValue("proxyQualityOrder")
        }
        let desired: ProxyQuality
        switch intent {
        case .library: desired = .thumbnail
        case .explicitPixelInspection: desired = .highPreview
        case .selection, .editing:
            let previewLimit = qualityLongEdges[.preview] ?? 0
            desired = Double(viewportLongEdgePixels) * zoom > Double(previewLimit) ? .highPreview : .preview
        }
        let candidates: [ProxyQuality]
        switch intent {
        case .library: candidates = [.thumbnail] // Never request a high-resolution library download.
        case .explicitPixelInspection: candidates = [.highPreview] // Do not mislabel a low preview as 1:1.
        case .selection, .editing: candidates = desired == .highPreview ? [.highPreview, .preview, .thumbnail] : [.preview, .thumbnail]
        }
        for quality in candidates {
            guard let edge = qualityLongEdges[quality], edge <= deviceMaximumLongEdge else { continue }
            if locallyAvailable.contains(quality) {
                return .init(quality: quality, requiresNetwork: false, reason: "available_local_derivative")
            }
            let online = network == .online || network == .constrained
            guard online, !(network == .constrained && quality == .highPreview) else { continue }
            return .init(quality: quality, requiresNetwork: true, reason: "request_selected_derivative_only")
        }
        return .init(quality: nil, requiresNetwork: false, reason: "waiting_for_suitable_proxy")
    }
}

public enum SyncPriority: Int, Codable, Comparable, Sendable {
    case immediateFinalTarget = -1
    case recipeMetadataP0 = 0
    case proxyP1 = 1
    case originalP2 = 2
    case optionalGeneratedExportP3 = 3
    public static func < (lhs: SyncPriority, rhs: SyncPriority) -> Bool { lhs.rawValue < rhs.rawValue }
}
public enum SyncObjectKind: String, Codable, Sendable { case recipe, metadata, proxy, original, optionalGenerated, optionalExport }
public enum SyncPriorityPolicy {
    /// Explicit selected final targets only. Changing storage capacity cannot promote any Original.
    public static func priority(kind: SyncObjectKind, assetID: UUID,
                                immediateFinalAssetIDs: Set<UUID> = []) -> SyncPriority {
        switch kind {
        case .recipe, .metadata: .recipeMetadataP0
        case .proxy: .proxyP1
        case .original: immediateFinalAssetIDs.contains(assetID) ? .immediateFinalTarget : .originalP2
        case .optionalGenerated, .optionalExport: .optionalGeneratedExportP3
        }
    }
}

public enum NetworkPolicy: String, Codable, CaseIterable, Sendable { case wifiOnly, wifiAndCellular, pause }
public enum MobileNetworkPath: String, Codable, Sendable { case unknown, offline, wifi, cellular }
public enum TransferWaitReason: String, Codable, Sendable { case paused, offline, unknownNetwork, cellularNotPermitted }
public enum NetworkTransferDecision: Equatable, Sendable { case allowed, deferred(TransferWaitReason) }
public enum NetworkTransferPolicy {
    /// Scheduling priority never overrides the user's network policy. Local editing does not consult this gate.
    public static func evaluate(_ policy: NetworkPolicy, path: MobileNetworkPath) -> NetworkTransferDecision {
        if policy == .pause { return .deferred(.paused) }
        switch path {
        case .unknown: return .deferred(.unknownNetwork)
        case .offline: return .deferred(.offline)
        case .wifi: return .allowed
        case .cellular: return policy == .wifiAndCellular ? .allowed : .deferred(.cellularNotPermitted)
        }
    }
}
