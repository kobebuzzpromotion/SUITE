import Foundation

/// Contract inventory from MOBILE_OVERRIDE §4. Registration is NOT native integration.
public enum MobileCapability: String, Codable, CaseIterable, Sendable {
    case adaptiveUI, touchAndGesture, humanFactors, safeArea, orientation
    case deviceCapability, camera, photoLibrary, fileAccess, usbTypeC, tether
    case localStorage, offline, sync, backgroundTask, appLifecycle
    case memoryPressure, battery, thermalState, networkQuality, permissions
    case accessibility, haptic, keyboard, pointerAndTrackpad, iPadMultitasking
    case externalDisplay, devicePerformanceTier
}

public enum IntegrationState: String, Codable, Sendable {
    case notConnected, implementedUnverified, verified, unavailable
}

public struct CapabilityContract: Codable, Equatable, Sendable {
    public let capability: MobileCapability
    public let integration: IntegrationState
    public let evidenceReference: String?

    public init(capability: MobileCapability, integration: IntegrationState = .notConnected,
                evidenceReference: String? = nil) {
        self.capability = capability
        self.integration = integration
        self.evidenceReference = evidenceReference
    }

    public var isVerified: Bool {
        integration == .verified && !(evidenceReference?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ?? true)
    }

    /// Native adapters must explicitly replace these entries after implementation and testing.
    public static var unconnectedInventory: [CapabilityContract] {
        MobileCapability.allCases.map { CapabilityContract(capability: $0) }
    }
}

public enum CoreValidationError: Error, Equatable, Sendable {
    case invalidValue(String)
    case invalidTransition
}

public enum ThermalCondition: String, Codable, Sendable { case unknown, nominal, fair, serious, critical }
public enum MemoryCondition: String, Codable, Sendable { case unknown, normal, warning, critical }
public enum NetworkCondition: String, Codable, Sendable { case unknown, offline, constrained, online }
public enum DevicePerformanceTier: String, Codable, Sendable { case unknown, entry, standard, high }

public struct DeviceResources: Codable, Equatable, Sendable {
    public var availableMemoryBytes: Int
    public var memoryPressure: MemoryCondition
    public var thermal: ThermalCondition
    public var batteryFraction: Double?
    public var lowPowerMode: Bool
    public var network: NetworkCondition
    public var uploadBytesPerSecond: Double?
    public var hasGPU: Bool
    public var hasNPU: Bool
    public var performanceTier: DevicePerformanceTier

    public init(availableMemoryBytes: Int, memoryPressure: MemoryCondition = .unknown,
                thermal: ThermalCondition = .unknown, batteryFraction: Double? = nil,
                lowPowerMode: Bool = false, network: NetworkCondition = .unknown,
                uploadBytesPerSecond: Double? = nil, hasGPU: Bool = false,
                hasNPU: Bool = false, performanceTier: DevicePerformanceTier = .unknown) {
        self.availableMemoryBytes = availableMemoryBytes
        self.memoryPressure = memoryPressure
        self.thermal = thermal
        self.batteryFraction = batteryFraction
        self.lowPowerMode = lowPowerMode
        self.network = network
        self.uploadBytesPerSecond = uploadBytesPerSecond
        self.hasGPU = hasGPU
        self.hasNPU = hasNPU
        self.performanceTier = performanceTier
    }

    public func validate() throws {
        guard availableMemoryBytes >= 0 else { throw CoreValidationError.invalidValue("availableMemoryBytes") }
        if let value = batteryFraction, !value.isFinite || !(0...1).contains(value) {
            throw CoreValidationError.invalidValue("batteryFraction")
        }
        if let value = uploadBytesPerSecond, !value.isFinite || value <= 0 {
            throw CoreValidationError.invalidValue("uploadBytesPerSecond")
        }
    }
}
