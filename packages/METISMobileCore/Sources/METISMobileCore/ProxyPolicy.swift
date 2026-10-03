import Foundation

public struct ProxySettings: Equatable, Sendable {
    public let allowedLongEdges: [Int]
    public let preferredLongEdge: Int
    public let tierLimits: [DevicePerformanceTier: Int]
    public let workingBytesPerPixel: Int
    public let memoryBudgetFraction: Double

    public init(allowedLongEdges: [Int], preferredLongEdge: Int,
                tierLimits: [DevicePerformanceTier: Int], workingBytesPerPixel: Int,
                memoryBudgetFraction: Double) {
        self.allowedLongEdges = allowedLongEdges
        self.preferredLongEdge = preferredLongEdge
        self.tierLimits = tierLimits
        self.workingBytesPerPixel = workingBytesPerPixel
        self.memoryBudgetFraction = memoryBudgetFraction
    }
}

public struct ProxyDecision: Equatable, Sendable {
    /// Nil means defer; never substitute a full-resolution render when resources are insufficient.
    public let longEdge: Int?
    public let maximumConcurrentJobs: Int
    public let reason: String
}

public enum ProxyPolicy {
    public static func select(originalWidth: Int, originalHeight: Int,
                              settings: ProxySettings, resources: DeviceResources) throws -> ProxyDecision {
        try resources.validate()
        guard originalWidth > 0, originalHeight > 0, settings.preferredLongEdge > 0,
              !settings.allowedLongEdges.isEmpty, settings.allowedLongEdges.allSatisfy({ $0 > 0 }),
              settings.workingBytesPerPixel > 0, settings.memoryBudgetFraction.isFinite,
              settings.memoryBudgetFraction > 0, settings.memoryBudgetFraction <= 1,
              settings.tierLimits.values.allSatisfy({ $0 > 0 }) else {
            throw CoreValidationError.invalidValue("proxySettingsOrDimensions")
        }
        if resources.memoryPressure == .critical || resources.thermal == .critical {
            return ProxyDecision(longEdge: nil, maximumConcurrentJobs: 0, reason: "critical_resources")
        }
        let tierLimit = settings.tierLimits[resources.performanceTier]
            ?? settings.allowedLongEdges.min()!
        var limit = min(max(originalWidth, originalHeight), settings.preferredLongEdge, tierLimit)
        if resources.lowPowerMode || resources.thermal == .serious || resources.memoryPressure == .warning {
            limit = max(1, limit / 2)
        }
        let availableBudget = Double(resources.availableMemoryBytes) * settings.memoryBudgetFraction
        let aspect = Double(min(originalWidth, originalHeight)) / Double(max(originalWidth, originalHeight))
        let candidates = Set(settings.allowedLongEdges.map { min($0, max(originalWidth, originalHeight)) })
            .filter { $0 <= limit }
            .sorted(by: >)
        for edge in candidates {
            let requiredBytes = Double(edge) * Double(edge) * aspect * Double(settings.workingBytesPerPixel)
            if requiredBytes <= availableBudget {
                let concurrent = resources.lowPowerMode || resources.thermal != .nominal || resources.memoryPressure != .normal
                    ? 1 : max(1, min(4, Int(min(4, floor(availableBudget / max(requiredBytes, 1))))))
                return ProxyDecision(longEdge: edge, maximumConcurrentJobs: concurrent, reason: "within_configured_resource_budget")
            }
        }
        return ProxyDecision(longEdge: nil, maximumConcurrentJobs: 0, reason: "no_configured_proxy_fits")
    }
}
