import Foundation

/// Persist before capture/ingest starts. This is not a photo: no asset ID or
/// invented RAW digest exists until the original has been durably ingested.
public struct CaptureContext: Codable, Equatable, Sendable, Identifiable {
    public let schemaVersion: Int
    public let id: UUID
    public let sessionID: UUID
    public let look: SessionLook
    public let controls: SessionApplyControls

    public init(id: UUID = UUID(), sessionID: UUID, look: SessionLook,
                controls: SessionApplyControls) throws {
        schemaVersion = 1; self.id = id; self.sessionID = sessionID
        self.look = look; self.controls = controls
        try validate()
    }

    public func validate() throws {
        guard schemaVersion == 1 else { throw SuiteValidationError.unsupportedSchema(schemaVersion) }
        try look.validate()
    }

    private enum CodingKeys: String, CodingKey, CaseIterable { case schemaVersion, id, sessionID, look, controls }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
        id = try c.decode(UUID.self, forKey: .id)
        sessionID = try c.decode(UUID.self, forKey: .sessionID)
        look = try c.decode(SessionLook.self, forKey: .look)
        controls = try c.decode(SessionApplyControls.self, forKey: .controls)
        try validate()
    }
}
