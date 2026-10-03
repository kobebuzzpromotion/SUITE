import Foundation

public enum JobState: String, Codable, Sendable { case pending, running, suspended, completed, failed, cancelled }

/// Durable representation only. Platform schedulers and a durable checkpoint repository are separate adapters.
public struct JobCheckpoint: Codable, Equatable, Sendable, Identifiable {
    public let schemaVersion: Int
    public let id: UUID
    public let inputID: String
    public let inputRevision: Int
    public let idempotencyKey: UUID
    public let totalUnits: Int
    public private(set) var completedUnits: Int
    public private(set) var state: JobState
    public private(set) var retryCount: Int
    public private(set) var lastFailureCode: String?
    public private(set) var updatedAt: Date
    public private(set) var outputReferences: [String]

    public init(id: UUID = UUID(), inputID: String, inputRevision: Int,
                idempotencyKey: UUID = UUID(), totalUnits: Int, now: Date = Date()) throws {
        schemaVersion = 1
        self.id = id
        self.inputID = inputID
        self.inputRevision = inputRevision
        self.idempotencyKey = idempotencyKey
        self.totalUnits = totalUnits
        completedUnits = 0
        state = .pending
        retryCount = 0
        lastFailureCode = nil
        updatedAt = now
        outputReferences = []
        try validate()
    }

    public func validate() throws {
        guard schemaVersion == 1, !inputID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              inputRevision >= 0, totalUnits > 0, completedUnits >= 0, completedUnits <= totalUnits,
              retryCount >= 0, updatedAt.timeIntervalSince1970.isFinite,
              state != .completed || completedUnits == totalUnits,
              state != .failed || !(lastFailureCode?.isEmpty ?? true),
              outputReferences.allSatisfy({ !$0.isEmpty }) else {
            throw CoreValidationError.invalidValue("jobCheckpoint")
        }
    }

    public mutating func transition(to next: JobState, completedUnits: Int,
                                    outputReferences: [String] = [], failureCode: String? = nil,
                                    now: Date = Date()) throws {
        let allowed: Bool
        switch (state, next) {
        case (.pending, .running), (.pending, .cancelled),
             (.running, .running), (.running, .suspended), (.running, .completed),
             (.running, .failed), (.running, .cancelled),
             (.suspended, .running), (.suspended, .cancelled), (.failed, .pending): allowed = true
        default: allowed = false
        }
        guard allowed, completedUnits >= self.completedUnits else {
            throw CoreValidationError.invalidTransition
        }
        var candidate = self
        candidate.state = next
        candidate.completedUnits = completedUnits
        candidate.updatedAt = now
        if next == .failed { candidate.lastFailureCode = failureCode }
        if state == .failed && next == .pending {
            guard retryCount < Int.max else { throw CoreValidationError.invalidTransition }
            candidate.retryCount += 1
        }
        candidate.outputReferences = Array(Set(self.outputReferences + outputReferences)).sorted()
        try candidate.validate()
        self = candidate
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, id, inputID, inputRevision, idempotencyKey, totalUnits, completedUnits, state, retryCount, lastFailureCode, updatedAt, outputReferences
    }

    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try values.decode(Int.self, forKey: .schemaVersion)
        id = try values.decode(UUID.self, forKey: .id)
        inputID = try values.decode(String.self, forKey: .inputID)
        inputRevision = try values.decode(Int.self, forKey: .inputRevision)
        idempotencyKey = try values.decode(UUID.self, forKey: .idempotencyKey)
        totalUnits = try values.decode(Int.self, forKey: .totalUnits)
        completedUnits = try values.decode(Int.self, forKey: .completedUnits)
        state = try values.decode(JobState.self, forKey: .state)
        retryCount = try values.decode(Int.self, forKey: .retryCount)
        lastFailureCode = try values.decodeIfPresent(String.self, forKey: .lastFailureCode)
        updatedAt = try values.decode(Date.self, forKey: .updatedAt)
        outputReferences = try values.decode([String].self, forKey: .outputReferences)
        try validate()
    }
}
