import Foundation

public struct AssetRecord: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public let originalFilename: String
    public let originalRelativePath: String
    public let sha256: String
    public let createdAt: Date

    public init(id: UUID = UUID(), originalFilename: String, originalRelativePath: String,
                sha256: String, createdAt: Date = Date()) {
        self.id = id
        self.originalFilename = originalFilename
        self.originalRelativePath = originalRelativePath
        self.sha256 = sha256
        self.createdAt = createdAt
    }

    public func validate() throws {
        let segments = originalRelativePath.split(separator: "/", omittingEmptySubsequences: false)
        guard !originalFilename.isEmpty, !originalFilename.contains("/"), !originalFilename.contains("\\"),
              !originalFilename.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              !originalRelativePath.isEmpty, !originalRelativePath.hasPrefix("/"),
              !originalRelativePath.contains("\\"), !originalRelativePath.contains(":"),
              !originalRelativePath.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              segments.allSatisfy({ !$0.isEmpty && $0 != "." && $0 != ".." }),
              isSHA256(sha256), createdAt.timeIntervalSince1970.isFinite else {
            throw SuiteValidationError.invalidValue("assetRecord")
        }
    }

    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id, originalFilename, originalRelativePath, sha256, createdAt
    }

    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let values = try decoder.container(keyedBy: CodingKeys.self)
        id = try values.decode(UUID.self, forKey: .id)
        originalFilename = try values.decode(String.self, forKey: .originalFilename)
        originalRelativePath = try values.decode(String.self, forKey: .originalRelativePath)
        sha256 = try values.decode(String.self, forKey: .sha256)
        createdAt = try values.decode(Date.self, forKey: .createdAt)
        try validate()
    }
}

func isSHA256(_ value: String) -> Bool {
    value.utf8.count == 64 && value.utf8.allSatisfy { byte in
        (48...57).contains(byte) || (65...70).contains(byte) || (97...102).contains(byte)
    }
}

public struct ProjectCheckpoint: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let asset: AssetRecord
    public let history: EditHistory
    public let revision: Int
    public let updatedAt: Date

    public init(asset: AssetRecord, history: EditHistory, revision: Int, updatedAt: Date = Date()) {
        schemaVersion = 1
        self.asset = asset
        self.history = history
        self.revision = revision
        self.updatedAt = updatedAt
    }

    public func validate() throws {
        guard schemaVersion == 1 else { throw SuiteValidationError.unsupportedSchema(schemaVersion) }
        guard revision >= 0, updatedAt.timeIntervalSince1970.isFinite else {
            throw SuiteValidationError.invalidValue("checkpoint")
        }
        try asset.validate()
        try history.validate()
        // Validate every saved branch, not only the visible cursor. Undo/Redo must never
        // resurrect a portrait adjustment bound to a different photo or Original.
        var portraitReference: PortraitRecipe?
        for entry in history.entries {
            // Include undo/redo branches; a hidden branch must not restore
            // another photograph's local correction at a later cursor change.
            try entry.parameters.localRetouchRecipe()?.validate(asset: asset)
            try entry.parameters.localWarpRecipe()?.validate(asset: asset)
            try entry.parameters.localBackdropRecipe()?.validate(asset: asset)
            if let portrait = try entry.parameters.portraitRecipe() {
                try portrait.validate(asset: asset)
                if let portraitReference { try portrait.validate(against: portraitReference) }
                else { portraitReference = portrait }
            }
        }
    }

    private enum CodingKeys: String, CodingKey, CaseIterable { case schemaVersion, asset, history, revision, updatedAt }

    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try values.decode(Int.self, forKey: .schemaVersion)
        guard schemaVersion == 1 else { throw SuiteValidationError.unsupportedSchema(schemaVersion) }
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        asset = try values.decode(AssetRecord.self, forKey: .asset)
        history = try values.decode(EditHistory.self, forKey: .history)
        revision = try values.decode(Int.self, forKey: .revision)
        updatedAt = try values.decode(Date.self, forKey: .updatedAt)
        try validate()
    }
}
