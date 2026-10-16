import Foundation

/// Host-supplied readiness, not hardware probing, licensing approval or an inference result.
/// Unknown information fails closed. A local feature never falls back to paid cloud work.
public enum LocalAICapability {
    public enum ThermalState: String, Sendable { case nominal, fair, serious, critical, unknown }
    public enum AssetState: String, Sendable {
        case missing, downloading, corrupt, versionMismatch, verified
    }
    public enum Permission: String, Sendable { case unknown, denied, allowed }
    public enum Cost: String, Sendable { case noPerUseCharge, paidGeneration, unknown }
    public enum Blocker: Equatable, Sendable {
        case operatingSystemUnknown, operatingSystemUnsupported
        case runtimeUnavailable, memoryBudgetUnknown, insufficientMemory
        case thermalUnknown, thermalPressure
        case asset(String, AssetState), permission(Permission), costUnknown
        case paidGenerationRequiresSeparateFlow
    }
    public struct Input: Sendable {
        public let operatingSystemSupported: Bool?
        public let runtimeAvailable: Bool
        /// Conservative measured/declared working-set requirement, not model file size.
        public let requiredWorkingBytes: UInt64?
        /// Budget made available by the host; physical RAM alone is not this budget.
        public let availableWorkingBytes: UInt64?
        public let thermal: ThermalState
        /// Exact required asset IDs must be listed, including any missing assets.
        public let requiredAssetIDs: Set<String>
        public let assets: [String: AssetState]
        public let permission: Permission
        public let cost: Cost

        public init(operatingSystemSupported: Bool?, runtimeAvailable: Bool,
                    requiredWorkingBytes: UInt64?, availableWorkingBytes: UInt64?,
                    thermal: ThermalState, requiredAssetIDs: Set<String>,
                    assets: [String: AssetState], permission: Permission, cost: Cost) {
            self.operatingSystemSupported = operatingSystemSupported
            self.runtimeAvailable = runtimeAvailable
            self.requiredWorkingBytes = requiredWorkingBytes
            self.availableWorkingBytes = availableWorkingBytes
            self.thermal = thermal; self.requiredAssetIDs = requiredAssetIDs
            self.assets = assets; self.permission = permission; self.cost = cost
        }
    }
    public struct Decision: Equatable, Sendable {
        public let blockers: [Blocker]
        public var canRunLocally: Bool { blockers.isEmpty }
        public let cost: Cost
        /// A readiness check is never proof that a photo has been analysed.
        public var inferenceCompleted: Bool { false }
    }

    public static func evaluate(_ input: Input) -> Decision {
        var blockers: [Blocker] = []
        switch input.operatingSystemSupported {
        case nil: blockers.append(.operatingSystemUnknown)
        case false?: blockers.append(.operatingSystemUnsupported)
        case true?: break
        }
        if !input.runtimeAvailable { blockers.append(.runtimeUnavailable) }
        if let required = input.requiredWorkingBytes, required > 0,
           let available = input.availableWorkingBytes {
            if available < required { blockers.append(.insufficientMemory) }
        } else { blockers.append(.memoryBudgetUnknown) }
        switch input.thermal {
        case .unknown: blockers.append(.thermalUnknown)
        case .serious, .critical: blockers.append(.thermalPressure)
        case .nominal, .fair: break
        }
        for id in input.requiredAssetIDs.sorted() {
            let state = input.assets[id] ?? .missing
            if state != .verified { blockers.append(.asset(id, state)) }
        }
        if input.permission != .allowed { blockers.append(.permission(input.permission)) }
        switch input.cost {
        case .unknown: blockers.append(.costUnknown)
        case .paidGeneration: blockers.append(.paidGenerationRequiresSeparateFlow)
        case .noPerUseCharge: break
        }
        return Decision(blockers: blockers, cost: input.cost)
    }
}
