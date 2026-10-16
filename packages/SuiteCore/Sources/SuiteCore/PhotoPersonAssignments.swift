import Foundation

/// Explicit photo-local correspondence, separate from PortraitRecipe and gallery
/// consent. Never turns recognition candidates into assignments automatically.
/// Changing analysis/target inventory creates a NEW document; old revisions and
/// previously stored Recipes are not migrated or rewritten by this value type.
public struct PhotoPersonAssignments: Codable, Equatable, Sendable {
    public static let maximumHistory = 1024
    public static let maximumTargets = 512

    public enum AssignmentError: Error, Equatable, Sendable {
        case invalidDocument, unsupportedSchema, targetMismatch, duplicatePerson
        case confirmationRequired, unchanged, historyFull
    }

    public struct Change: Codable, Equatable, Sendable {
        public let id: UUID
        public let sequence: Int
        public let faceTargetID: UUID
        public let previousPersonID: UUID?
        /// nil is an explicit unassignment, not an unknown recognition result.
        public let personID: UUID?
        public let reason: String
        public let recordedAt: Date

        fileprivate init(sequence: Int, faceTargetID: UUID, previousPersonID: UUID?,
                         personID: UUID?, reason: String, recordedAt: Date) {
            id = UUID(); self.sequence = sequence; self.faceTargetID = faceTargetID
            self.previousPersonID = previousPersonID; self.personID = personID
            self.reason = reason; self.recordedAt = recordedAt
        }

        private enum CodingKeys: String, CodingKey, CaseIterable {
            case id, sequence, faceTargetID, previousPersonID, personID, reason, recordedAt
        }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(UUID.self, forKey: .id)
            sequence = try c.decode(Int.self, forKey: .sequence)
            faceTargetID = try c.decode(UUID.self, forKey: .faceTargetID)
            previousPersonID = try c.decodeIfPresent(UUID.self, forKey: .previousPersonID)
            personID = try c.decodeIfPresent(UUID.self, forKey: .personID)
            reason = try c.decode(String.self, forKey: .reason)
            recordedAt = try c.decode(Date.self, forKey: .recordedAt)
            try validate()
        }

        fileprivate func validate() throws {
            guard sequence > 0, sequence <= PhotoPersonAssignments.maximumHistory,
                  previousPersonID != personID, PhotoPersonAssignments.validText(reason),
                  PhotoPersonAssignments.validDate(recordedAt) else { throw AssignmentError.invalidDocument }
        }

        public func encode(to encoder: any Encoder) throws {
            try validate()
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(id, forKey: .id)
            try c.encode(sequence, forKey: .sequence)
            try c.encode(faceTargetID, forKey: .faceTargetID)
            try c.encodeIfPresent(previousPersonID, forKey: .previousPersonID)
            try c.encodeIfPresent(personID, forKey: .personID)
            try c.encode(reason, forKey: .reason)
            try c.encode(recordedAt, forKey: .recordedAt)
        }
    }

    public let schemaVersion: Int
    public let assetID: UUID
    public let originalSHA256: String
    /// Identifies the complete analysis contract, including models/preprocessing.
    public let analysisVersion: String
    /// Digest of the exact analysis pixels; not substituted for the original SHA.
    public let analysisSHA256: String
    public let faceTargetIDs: [UUID]
    public private(set) var history: [Change]

    public init(assetID: UUID, originalSHA256: String, analysisVersion: String,
                analysisSHA256: String, targets: [FaceIdentity.PhotoFaceID]) throws {
        let originalDigest = originalSHA256.lowercased()
        schemaVersion = 1; self.assetID = assetID
        self.originalSHA256 = originalDigest
        self.analysisVersion = analysisVersion; self.analysisSHA256 = analysisSHA256.lowercased()
        guard targets.count <= Self.maximumTargets,
              targets.allSatisfy({ $0.assetID == assetID && $0.originalSHA256 == originalDigest }) else {
            throw AssignmentError.targetMismatch
        }
        faceTargetIDs = targets.map(\.faceTargetID).sorted { $0.uuidString < $1.uuidString }
        history = []
        try validate()
    }

    /// Derived exclusively by replay; persisted maps cannot contradict history.
    public var assignments: [UUID: FaceIdentity.PersonID] {
        var result: [UUID: FaceIdentity.PersonID] = [:]
        for change in history {
            result[change.faceTargetID] = change.personID.map(FaceIdentity.PersonID.init)
        }
        return result
    }

    /// Caller confirms the visible photo/face and checks the person still exists
    /// in the consented gallery. Neither matched nor ambiguous results call this
    /// implicitly. nil explicitly removes the current assignment.
    public func assigning(_ person: FaceIdentity.PersonID?, to target: FaceIdentity.PhotoFaceID,
                          explicitlyConfirmed: Bool, reason: String,
                          recordedAt: Date = Date()) throws -> PhotoPersonAssignments {
        try validate()
        guard explicitlyConfirmed else { throw AssignmentError.confirmationRequired }
        guard target.assetID == assetID, target.originalSHA256 == originalSHA256,
              faceTargetIDs.contains(target.faceTargetID) else { throw AssignmentError.targetMismatch }
        guard history.count < Self.maximumHistory else { throw AssignmentError.historyFull }
        let current = assignments
        let previous = current[target.faceTargetID]
        guard previous != person else { throw AssignmentError.unchanged }
        if let person, current.contains(where: { $0.key != target.faceTargetID && $0.value == person }) {
            throw AssignmentError.duplicatePerson
        }
        var next = self
        next.history.append(Change(sequence: history.count + 1, faceTargetID: target.faceTargetID,
                                   previousPersonID: previous?.value, personID: person?.value,
                                   reason: reason, recordedAt: recordedAt))
        try next.validate()
        return next
    }

    public func validate() throws {
        guard schemaVersion == 1 else { throw AssignmentError.unsupportedSchema }
        guard isSHA256(originalSHA256), originalSHA256 == originalSHA256.lowercased(),
              isSHA256(analysisSHA256), analysisSHA256 == analysisSHA256.lowercased(),
              Self.validText(analysisVersion), faceTargetIDs.count <= Self.maximumTargets,
              Set(faceTargetIDs).count == faceTargetIDs.count,
              faceTargetIDs == faceTargetIDs.sorted(by: { $0.uuidString < $1.uuidString }),
              history.count <= Self.maximumHistory,
              Set(history.map(\.id)).count == history.count else { throw AssignmentError.invalidDocument }
        var state: [UUID: UUID] = [:]
        var lastDate: Date?
        let targets = Set(faceTargetIDs)
        for (index, change) in history.enumerated() {
            try change.validate()
            guard change.sequence == index + 1, targets.contains(change.faceTargetID),
                  change.previousPersonID == state[change.faceTargetID],
                  change.previousPersonID != change.personID, Self.validText(change.reason),
                  lastDate.map({ change.recordedAt >= $0 }) ?? true else { throw AssignmentError.invalidDocument }
            if let person = change.personID,
               state.contains(where: { $0.key != change.faceTargetID && $0.value == person }) {
                throw AssignmentError.duplicatePerson
            }
            state[change.faceTargetID] = change.personID
            lastDate = change.recordedAt
        }
    }

    /// Revalidate whenever opening against a current analysis; an asset SHA
    /// alone is insufficient because re-analysis may issue different face IDs.
    public func validate(assetID: UUID, originalSHA256: String, analysisVersion: String,
                         analysisSHA256: String, targets: [FaceIdentity.PhotoFaceID]) throws {
        try validate()
        guard self.assetID == assetID, self.originalSHA256 == originalSHA256.lowercased(),
              self.analysisVersion == analysisVersion, self.analysisSHA256 == analysisSHA256.lowercased(),
              targets.count == faceTargetIDs.count,
              Set(targets.map(\.faceTargetID)) == Set(faceTargetIDs),
              targets.allSatisfy({ $0.assetID == assetID && $0.originalSHA256 == self.originalSHA256 }) else {
            throw AssignmentError.targetMismatch
        }
    }

    private static func validText(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf8.count <= 512
    }
    private static func validDate(_ value: Date) -> Bool {
        // Stable Gregorian representable range, not a check against wall clock:
        // later replay must not depend on the current device clock or timezone.
        let seconds = value.timeIntervalSince1970
        return seconds.isFinite && seconds >= -62_135_596_800 && seconds < 253_402_300_800
    }
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case schemaVersion, assetID, originalSHA256, analysisVersion, analysisSHA256, faceTargetIDs, history
    }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
        guard schemaVersion == 1 else { throw AssignmentError.unsupportedSchema }
        assetID = try c.decode(UUID.self, forKey: .assetID)
        originalSHA256 = try c.decode(String.self, forKey: .originalSHA256)
        analysisVersion = try c.decode(String.self, forKey: .analysisVersion)
        analysisSHA256 = try c.decode(String.self, forKey: .analysisSHA256)
        var faces = try c.nestedUnkeyedContainer(forKey: .faceTargetIDs)
        var ids: [UUID] = []
        while !faces.isAtEnd {
            guard ids.count < Self.maximumTargets else { throw AssignmentError.invalidDocument }
            ids.append(try faces.decode(UUID.self))
        }
        faceTargetIDs = ids
        var events = try c.nestedUnkeyedContainer(forKey: .history)
        var changes: [Change] = []
        while !events.isAtEnd {
            guard changes.count < Self.maximumHistory else { throw AssignmentError.historyFull }
            changes.append(try events.decode(Change.self))
        }
        history = changes
        try validate()
    }

    public func encode(to encoder: any Encoder) throws {
        try validate()
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encode(assetID, forKey: .assetID)
        try c.encode(originalSHA256, forKey: .originalSHA256)
        try c.encode(analysisVersion, forKey: .analysisVersion)
        try c.encode(analysisSHA256, forKey: .analysisSHA256)
        try c.encode(faceTargetIDs, forKey: .faceTargetIDs)
        try c.encode(history, forKey: .history)
    }
}
