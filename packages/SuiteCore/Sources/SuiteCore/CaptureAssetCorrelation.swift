import Foundation

/// Explicit camera-provided correlation, never filename/time proximity pairing.
/// The host persists a successful transition before acknowledging a delivery.
/// This ledger does not ingest files, choose RAW automatically, or invoke an SDK.
public struct CaptureAssetCorrelation: Codable, Equatable, Sendable {
    public enum Role: String, Codable, Sendable { case preview, jpeg, raw }
    public enum Failure: Error { case invalid, conflict, capacity, missing, finalAlreadySelected }
    public struct Key: Codable, Equatable, Sendable {
        public let cameraID: String
        /// Must change after a camera session restart if capture IDs can repeat.
        public let sessionID: String
        public let cameraCaptureID: String
        public init(cameraID: String, sessionID: String, cameraCaptureID: String) throws {
            self.cameraID = cameraID; self.sessionID = sessionID; self.cameraCaptureID = cameraCaptureID
            try validate()
        }
        public func validate() throws {
            for text in [cameraID, sessionID, cameraCaptureID] {
                guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      text.utf8.count <= 512, !text.contains("\0") else { throw Failure.invalid }
            }
        }
        private enum CodingKeys: String, CodingKey, CaseIterable { case cameraID, sessionID, cameraCaptureID }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(cameraID: c.decode(String.self, forKey: .cameraID),
                          sessionID: c.decode(String.self, forKey: .sessionID),
                          cameraCaptureID: c.decode(String.self, forKey: .cameraCaptureID))
        }
    }
    public struct Member: Codable, Equatable, Sendable {
        public let receiptID: UUID
        public let role: Role
        /// Hash of received bytes, not a camera identifier or placeholder hash.
        public let sha256: String
        public let byteCount: UInt64
        public init(receiptID: UUID, role: Role, sha256: String, byteCount: UInt64) throws {
            self.receiptID = receiptID; self.role = role
            self.sha256 = sha256.lowercased(); self.byteCount = byteCount
            try validate()
        }
        public func validate() throws {
            guard isSHA256(sha256), byteCount > 0 else { throw Failure.invalid }
        }
        private enum CodingKeys: String, CodingKey, CaseIterable { case receiptID, role, sha256, byteCount }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            try self.init(receiptID: c.decode(UUID.self, forKey: .receiptID), role: c.decode(Role.self, forKey: .role),
                          sha256: c.decode(String.self, forKey: .sha256), byteCount: c.decode(UInt64.self, forKey: .byteCount))
        }
    }
    public struct Capture: Codable, Equatable, Sendable {
        public let contextID: UUID
        public let key: Key
        public fileprivate(set) var members: [Member]
        public fileprivate(set) var finalReceiptID: UUID?
        fileprivate init(contextID: UUID, key: Key, members: [Member], finalReceiptID: UUID?) {
            self.contextID = contextID; self.key = key; self.members = members; self.finalReceiptID = finalReceiptID
        }
        private enum CodingKeys: String, CodingKey, CaseIterable { case contextID, key, members, finalReceiptID }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            contextID = try c.decode(UUID.self, forKey: .contextID)
            key = try c.decode(Key.self, forKey: .key)
            var list = try c.nestedUnkeyedContainer(forKey: .members)
            var values: [Member] = []
            while !list.isAtEnd {
                guard values.count < 32 else { throw Failure.capacity }
                let member = try list.decode(Member.self); try member.validate(); values.append(member)
            }
            members = values; finalReceiptID = try c.decodeIfPresent(UUID.self, forKey: .finalReceiptID)
            try key.validate()
        }
    }
    public let schemaVersion: Int
    public private(set) var captures: [Capture]
    public init() { schemaVersion = 1; captures = [] }

    public func validate() throws {
        guard schemaVersion == 1, captures.count <= 4096 else { throw Failure.capacity }
        var contexts = Set<UUID>(), receipts = Set<UUID>()
        var keys = Set<String>()
        for capture in captures {
            try Task.checkCancellation(); try capture.key.validate()
            // Encoding the tuple avoids delimiter collisions in arbitrary SDK IDs.
            let tuple = try JSONEncoder().encode([capture.key.cameraID, capture.key.sessionID, capture.key.cameraCaptureID])
            guard contexts.insert(capture.contextID).inserted,
                  keys.insert(tuple.base64EncodedString()).inserted,
                  capture.members.count <= 32 else { throw Failure.conflict }
            for member in capture.members {
                try member.validate()
                guard receipts.insert(member.receiptID).inserted else { throw Failure.conflict }
            }
            if let final = capture.finalReceiptID {
                guard let member = capture.members.first(where: { $0.receiptID == final }),
                      member.role != .preview else { throw Failure.invalid }
            }
        }
    }

    /// Existing camera keys cannot be rebound to a newer preset/capture context.
    public mutating func bind(contextID: UUID, key: Key) throws {
        try validate(); try key.validate()
        if let existing = captures.first(where: { $0.contextID == contextID || $0.key == key }) {
            guard existing.contextID == contextID, existing.key == key else { throw Failure.conflict }
            return
        }
        guard captures.count < 4096 else { throw Failure.capacity }
        captures.append(Capture(contextID: contextID, key: key, members: [], finalReceiptID: nil))
    }

    /// Exact redelivery is idempotent; the same receipt with different bytes fails.
    public mutating func record(contextID: UUID, key: Key, member: Member) throws {
        try validate(); try member.validate()
        guard let index = captures.firstIndex(where: { $0.contextID == contextID }),
              captures[index].key == key else { throw Failure.missing }
        for capture in captures {
            if let existing = capture.members.first(where: { $0.receiptID == member.receiptID }) {
                guard capture.contextID == contextID, existing == member else { throw Failure.conflict }
                return
            }
        }
        guard captures[index].members.count < 32 else { throw Failure.capacity }
        // Late RAW/JPEG may be recorded but cannot silently replace a selected original.
        captures[index].members.append(member)
    }

    public mutating func selectFinal(contextID: UUID, receiptID: UUID) throws -> Member {
        try validate()
        guard let index = captures.firstIndex(where: { $0.contextID == contextID }),
              let member = captures[index].members.first(where: { $0.receiptID == receiptID }),
              member.role != .preview else { throw Failure.missing }
        if let selected = captures[index].finalReceiptID, selected != receiptID { throw Failure.finalAlreadySelected }
        captures[index].finalReceiptID = receiptID
        return member
    }

    private enum CodingKeys: String, CodingKey, CaseIterable { case schemaVersion, captures }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let container = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try container.decode(Int.self, forKey: .schemaVersion)
        var list = try container.nestedUnkeyedContainer(forKey: .captures)
        var values: [Capture] = []
        while !list.isAtEnd {
            guard values.count < 4096 else { throw Failure.capacity }
            values.append(try list.decode(Capture.self))
        }
        captures = values
        try validate()
    }
}
