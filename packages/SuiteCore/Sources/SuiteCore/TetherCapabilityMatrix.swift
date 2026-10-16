import Foundation

public enum TetherManufacturer: String, Codable, CaseIterable, Sendable {
    case canon, nikon, sony, fujifilm, panasonic, omSystem, pentaxRicoh
}
public enum TetherHost: String, Codable, Sendable { case iPhone, iPad, mac, windows }
public enum TetherLink: String, Codable, Sendable { case usb, wifi, ethernet }
public enum TetherFeature: String, Codable, CaseIterable, Sendable {
    case fileImport, rawTransfer, jpegTransfer, newCaptureTransfer, remoteShutter
    case liveView, exposureControl, reconnectRecovery
}
public enum TetherEvidenceLevel: String, Codable, Sendable {
    case unknown, unsupported, documented, beta, supported
}
public enum TetherMatrixError: Error { case invalidEntry, duplicateEntry }

/// Exact configuration, not a manufacturer-wide promise. Firmware/OS strings are
/// compared exactly: a result for an older configuration never certifies a new one.
public struct TetherConfiguration: Codable, Hashable, Sendable {
    public let manufacturer: TetherManufacturer
    public let model: String
    public let firmware: String
    public let host: TetherHost
    public let hostOS: String
    public let link: TetherLink
    public let adapterID: String
    public let adapterVersion: String
    public init(manufacturer: TetherManufacturer, model: String, firmware: String,
                host: TetherHost, hostOS: String, link: TetherLink,
                adapterID: String, adapterVersion: String) {
        self.manufacturer = manufacturer; self.model = model; self.firmware = firmware
        self.host = host; self.hostOS = hostOS; self.link = link
        self.adapterID = adapterID; self.adapterVersion = adapterVersion
    }
    fileprivate func validate() throws {
        for value in [model, firmware, hostOS, adapterID, adapterVersion] {
            guard !value.isEmpty, value == value.trimmingCharacters(in: .whitespacesAndNewlines),
                  value.count <= 256, !value.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) })
            else { throw TetherMatrixError.invalidEntry }
        }
    }
}

public struct TetherFeatureEvidence: Codable, Sendable {
    public let feature: TetherFeature
    public let level: TetherEvidenceLevel
    public let reference: String?
    public let recordedAt: Date?
    public init(feature: TetherFeature, level: TetherEvidenceLevel,
                reference: String? = nil, recordedAt: Date? = nil) {
        self.feature = feature; self.level = level; self.reference = reference; self.recordedAt = recordedAt
    }
    fileprivate func validate() throws {
        if let recordedAt, !recordedAt.timeIntervalSince1970.isFinite { throw TetherMatrixError.invalidEntry }
        if level != .unknown {
            guard let reference, !reference.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  reference.count <= 2048, recordedAt != nil else { throw TetherMatrixError.invalidEntry }
        }
    }
}

public struct TetherMatrixEntry: Codable, Sendable {
    public let configuration: TetherConfiguration
    public let features: [TetherFeatureEvidence]
    /// Identifies the actual host device/cable used for a hardware result.
    public let hardwareRecord: String?
    public init(configuration: TetherConfiguration, features: [TetherFeatureEvidence], hardwareRecord: String? = nil) {
        self.configuration = configuration; self.features = features; self.hardwareRecord = hardwareRecord
    }
    fileprivate func validate() throws {
        try configuration.validate()
        guard Set(features.map(\.feature)).count == features.count else { throw TetherMatrixError.duplicateEntry }
        for item in features { try item.validate() }
        if features.contains(where: { $0.level == .supported || $0.level == .beta }) {
            guard let hardwareRecord, !hardwareRecord.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  hardwareRecord.count <= 2048 else { throw TetherMatrixError.invalidEntry }
        }
    }
}

public struct TetherFeatureDecision: Sendable {
    public let feature: TetherFeature
    public let evidence: TetherEvidenceLevel
    public let availableInCurrentSession: Bool
    public let mayInvoke: Bool
}

/// Read-only lookup of curated evidence. Constructor/decoder validation prevents
/// malformed records, but does not authenticate whoever supplies the evidence.
/// The app must load its trusted matrix, not camera-supplied metadata or user JSON.
/// Empty by default: no camera has been physically certified by this code change.
public struct TetherCapabilityMatrix: Codable, Sendable {
    public let entries: [TetherMatrixEntry]
    public init(entries: [TetherMatrixEntry] = []) throws {
        guard entries.count <= 10000 else { throw TetherMatrixError.invalidEntry }
        var seen = Set<TetherConfiguration>()
        for entry in entries {
            try entry.validate()
            guard seen.insert(entry.configuration).inserted else { throw TetherMatrixError.duplicateEntry }
        }
        self.entries = entries
    }
    private enum CodingKeys: String, CodingKey { case entries }
    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(entries: container.decode([TetherMatrixEntry].self, forKey: .entries))
    }
    /// Runtime availability is independent of certification. Unknown/documented
    /// functions can be explicitly attempted; absence of Wi-Fi never blocks USB.
    /// A known unsupported configuration is always denied.
    public func decision(for configuration: TetherConfiguration, feature: TetherFeature,
                         runtimeFeatures: Set<TetherFeature>, allowUnverified: Bool = false) throws -> TetherFeatureDecision {
        try configuration.validate()
        let level = entries.first(where: { $0.configuration == configuration })?
            .features.first(where: { $0.feature == feature })?.level ?? .unknown
        let available = runtimeFeatures.contains(feature)
        return TetherFeatureDecision(feature: feature, evidence: level,
            availableInCurrentSession: available,
            mayInvoke: available && level != .unsupported && (level == .supported || allowUnverified))
    }
}
