import Foundation

public enum ExecutionRoute: String, Codable, CaseIterable, Sendable { case onDevice, cloud, hybrid }
public enum PrivacyPolicy: String, Codable, Sendable { case localOnly, cloudPermitted }

/// Estimates come from measured/provider configuration; this package contains no AI provider or pricing.
public struct ExecutionCandidate: Codable, Equatable, Sendable {
    public let route: ExecutionRoute
    public let available: Bool
    public let estimatedSeconds: Double
    public let estimatedCost: Double
    public let quality: Double
    public let requiredMemoryBytes: Int
    public let requiresGPU: Bool
    public let requiresNPU: Bool

    public init(route: ExecutionRoute, available: Bool, estimatedSeconds: Double,
                estimatedCost: Double, quality: Double, requiredMemoryBytes: Int = 0,
                requiresGPU: Bool = false, requiresNPU: Bool = false) {
        self.route = route
        self.available = available
        self.estimatedSeconds = estimatedSeconds
        self.estimatedCost = estimatedCost
        self.quality = quality
        self.requiredMemoryBytes = requiredMemoryBytes
        self.requiresGPU = requiresGPU
        self.requiresNPU = requiresNPU
    }
}

public struct Workload: Codable, Equatable, Sendable {
    public let inputBytes: Int
    public let batchSize: Int
    public let privacy: PrivacyPolicy
    public let minimumQuality: Double
    public let maximumCost: Double
    public let desiredLatencySeconds: Double
    public let allowsConstrainedNetwork: Bool
    public let maximumConcurrency: Int

    public init(inputBytes: Int, batchSize: Int = 1, privacy: PrivacyPolicy = .localOnly,
                minimumQuality: Double, maximumCost: Double, desiredLatencySeconds: Double,
                allowsConstrainedNetwork: Bool = false, maximumConcurrency: Int = 1) {
        self.inputBytes = inputBytes
        self.batchSize = batchSize
        self.privacy = privacy
        self.minimumQuality = minimumQuality
        self.maximumCost = maximumCost
        self.desiredLatencySeconds = desiredLatencySeconds
        self.allowsConstrainedNetwork = allowsConstrainedNetwork
        self.maximumConcurrency = maximumConcurrency
    }
}

public struct ExecutionDecision: Equatable, Sendable {
    public let route: ExecutionRoute?
    public let maximumConcurrentJobs: Int
    public let reasons: [String]
    public var isDeferred: Bool { route == nil }
}

public enum ExecutionPlanner {
    /// Fail closed when no eligible measured candidate exists; never default all jobs to one route.
    public static func choose(workload: Workload, resources: DeviceResources,
                              candidates: [ExecutionCandidate]) throws -> ExecutionDecision {
        try resources.validate()
        guard workload.inputBytes >= 0, workload.batchSize > 0, workload.maximumConcurrency > 0,
              workload.minimumQuality.isFinite, (0...1).contains(workload.minimumQuality),
              workload.maximumCost.isFinite, workload.maximumCost >= 0,
              workload.desiredLatencySeconds.isFinite, workload.desiredLatencySeconds > 0 else {
            throw CoreValidationError.invalidValue("workload")
        }
        var eligible: [(ExecutionCandidate, Double, Int)] = []
        var rejected: [String] = []
        for candidate in candidates {
            guard candidate.estimatedSeconds.isFinite, candidate.estimatedSeconds >= 0,
                  candidate.estimatedCost.isFinite, candidate.estimatedCost >= 0,
                  candidate.quality.isFinite, (0...1).contains(candidate.quality),
                  candidate.requiredMemoryBytes >= 0 else {
                throw CoreValidationError.invalidValue("executionCandidate")
            }
            let remote = candidate.route != .onDevice
            let local = candidate.route != .cloud
            var reasons: [String] = []
            if !candidate.available { reasons.append("provider_not_connected") }
            if candidate.quality < workload.minimumQuality { reasons.append("quality") }
            let totalCost = candidate.estimatedCost * Double(workload.batchSize)
            if !totalCost.isFinite || totalCost > workload.maximumCost { reasons.append("cost") }
            if remote {
                if workload.privacy != .cloudPermitted { reasons.append("privacy") }
                if resources.network == .offline || resources.network == .unknown { reasons.append("network") }
                if resources.network == .constrained && !workload.allowsConstrainedNetwork { reasons.append("constrained_network") }
                if resources.uploadBytesPerSecond == nil { reasons.append("transfer_estimate_missing") }
            }
            if local {
                if candidate.requiredMemoryBytes > resources.availableMemoryBytes { reasons.append("memory") }
                if resources.memoryPressure == .critical { reasons.append("critical_memory_pressure") }
                if resources.thermal == .critical { reasons.append("critical_thermal") }
                if candidate.requiresGPU && !resources.hasGPU { reasons.append("gpu") }
                if candidate.requiresNPU && !resources.hasNPU { reasons.append("npu") }
            }
            if !reasons.isEmpty {
                rejected.append("\(candidate.route.rawValue):\(reasons.joined(separator: ","))")
                continue
            }
            var concurrency = min(workload.batchSize, workload.maximumConcurrency)
            if local && candidate.requiredMemoryBytes > 0 {
                concurrency = min(concurrency, resources.availableMemoryBytes / candidate.requiredMemoryBytes)
            }
            if resources.lowPowerMode || resources.thermal == .serious || resources.thermal == .critical
                || resources.memoryPressure == .warning || resources.batteryFraction == nil
                || (resources.batteryFraction ?? 0) < 0.2 || resources.thermal == .unknown {
                concurrency = 1
            }
            let transferSeconds = remote
                ? Double(workload.inputBytes) * Double(workload.batchSize) / (resources.uploadBytesPerSecond ?? 1) : 0
            let processingSeconds = candidate.estimatedSeconds * ceil(Double(workload.batchSize) / Double(concurrency))
            let resourcePenalty = local
                ? (resources.thermal == .serious ? 3.0 : resources.thermal == .fair ? 0.5 : 0)
                    + (resources.lowPowerMode ? 1 : 0) + ((resources.batteryFraction ?? 0) < 0.2 ? 1 : 0)
                : 0
            let score = (processingSeconds + transferSeconds) / workload.desiredLatencySeconds
                + totalCost / max(workload.maximumCost, 0.000_001) + resourcePenalty + (1 - candidate.quality)
            guard score.isFinite else { throw CoreValidationError.invalidValue("executionEstimateOverflow") }
            eligible.append((candidate, score, concurrency))
        }
        // Stable tie order is caller order, not an implicit local/cloud preference.
        guard let winner = eligible.enumerated().min(by: {
            $0.element.1 == $1.element.1 ? $0.offset < $1.offset : $0.element.1 < $1.element.1
        })?.element else {
            return ExecutionDecision(route: nil, maximumConcurrentJobs: 0, reasons: rejected.isEmpty ? ["no_candidates"] : rejected)
        }
        return ExecutionDecision(route: winner.0.route, maximumConcurrentJobs: winner.2,
                                 reasons: ["eligible_measured_candidate"] + rejected)
    }
}
