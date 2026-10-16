import Foundation
import CryptoKit
import Security
import Darwin
import SuiteCore

/// Device-only biometric gallery. Never sync, log vectors, or infer enrollment
/// permission from detection. Photos and Recipes are outside this store's root.
actor LocalPersonGalleryStore {
    struct Consent: Codable, Sendable {
        let purpose: String
        let explanationVersion: String
        let confirmedAt: Date
    }
    struct Entry: Codable, Sendable {
        let id: UUID
        let displayName: String
        let embeddings: [FaceIdentity.Embedding]
        let consent: Consent
        /// nil means legacy enrollment provenance is unknown, never reconstructed.
        let sources: [EnrollmentSource]?
    }
    struct EnrollmentSource: Codable, Sendable {
        let assetID: UUID
        let originalSHA256: String
        let analysisSHA256: String
        let analysisVersion: String
        let faceTargetID: UUID
        let modelSHA256: String
        let preprocessingVersion: String
        let dimension: Int
    }
    enum StoreError: Error {
        case unsafePath, invalidData, missingKey, keychain(OSStatus), busy, io(Int32)
        case consentRequired, duplicatePerson, capacityExceeded
        case revisionConflict, analysisReplacementRequired, unknownPerson
    }
    struct SavedAssignments: Codable, Sendable {
        let revision: UUID
        let document: PhotoPersonAssignments
    }
    private struct Document: Codable {
        let schemaVersion: Int
        var entries: [Entry]
        var assignments: [SavedAssignments]

        init(entries: [Entry], assignments: [SavedAssignments] = []) {
            schemaVersion = 3; self.entries = entries; self.assignments = assignments
        }

        private enum CodingKeys: String, CodingKey { case schemaVersion, entries, assignments }
        init(from decoder: any Decoder) throws {
            let values = try decoder.container(keyedBy: CodingKeys.self)
            let version = try values.decode(Int.self, forKey: .schemaVersion)
            guard (1...3).contains(version) else { throw StoreError.invalidData }
            schemaVersion = 3
            entries = try values.decode([Entry].self, forKey: .entries)
            if version == 1 {
                assignments = []
            } else {
                assignments = try values.decode([SavedAssignments].self, forKey: .assignments)
            }
        }
    }
    private let root: URL
    private let account: String
    private let maximumBytes = 32 * 1024 * 1024
    private static let service = "SUITE.LocalPersonGallery.v1"
    private static let aad = Data("SUITE.LocalPersonGallery.v1".utf8)

    init(root: URL) throws {
        guard root.isFileURL else { throw StoreError.unsafePath }
        self.root = root.standardizedFileURL
        // Container paths can change across app updates. A stable app-scoped
        // account is required to reopen the same device's encrypted gallery.
        account = "primary-local-person-gallery-v1"
        try Self.safePath(self.root)
        try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true,
                                               attributes: [.posixPermissions: 0o700])
        try Self.safePath(self.root)
        var directory = self.root
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try directory.setResourceValues(values)
    }

    func snapshot() throws -> [Entry] {
        try locked { try load().entries }
    }

    func assignmentRecord(assetID: UUID) throws -> SavedAssignments? {
        try locked { try load().assignments.first { $0.document.assetID == assetID } }
    }

    @discardableResult
    func saveAssignments(_ document: PhotoPersonAssignments, expectedRevision: UUID?,
                         replacingAnalysis: Bool = false) throws -> SavedAssignments {
        try document.validate()
        return try locked {
            var stored = try load()
            let index = stored.assignments.firstIndex { $0.document.assetID == document.assetID }
            if let index {
                let previous = stored.assignments[index]
                guard expectedRevision == previous.revision else { throw StoreError.revisionConflict }
                guard previous.document.originalSHA256 == document.originalSHA256 else { throw StoreError.invalidData }
                let sameAnalysis = previous.document.analysisVersion == document.analysisVersion &&
                    previous.document.analysisSHA256 == document.analysisSHA256 &&
                    previous.document.faceTargetIDs == document.faceTargetIDs
                guard sameAnalysis || replacingAnalysis else { throw StoreError.analysisReplacementRequired }
                // Same-analysis updates append history rather than silently
                // rewriting a previously confirmed correspondence/audit trail.
                if sameAnalysis {
                    guard document.history.count >= previous.document.history.count,
                          Array(document.history.prefix(previous.document.history.count)) == previous.document.history else {
                        throw StoreError.invalidData
                    }
                }
            } else {
                guard expectedRevision == nil else { throw StoreError.revisionConflict }
                guard stored.assignments.count < 512 else { throw StoreError.capacityExceeded }
            }
            let saved = SavedAssignments(revision: UUID(), document: document)
            if let index { stored.assignments[index] = saved } else { stored.assignments.append(saved) }
            try commit(stored)
            return saved
        }
    }

    @discardableResult
    func enroll(id: UUID = UUID(), displayName: String, embeddings: [FaceIdentity.Embedding],
                sources: [EnrollmentSource], consent: Consent, permissionConfirmed: Bool) throws -> Entry {
        guard permissionConfirmed else { throw StoreError.consentRequired }
        let entry = Entry(id: id, displayName: displayName.trimmingCharacters(in: .whitespacesAndNewlines),
                          embeddings: embeddings, consent: consent, sources: sources)
        try validate(entry)
        return try locked {
            var document = try load()
            guard document.entries.count < 256 else { throw StoreError.capacityExceeded }
            guard !document.entries.contains(where: { $0.id == id }) else { throw StoreError.duplicatePerson }
            document.entries.append(entry)
            try commit(document)
            return entry
        }
    }

    func remove(id: UUID) throws {
        try locked {
            var document = try load()
            guard document.entries.contains(where: { $0.id == id }) else { return }
            document.entries.removeAll { $0.id == id }
            document.assignments.removeAll { Self.references($0.document).contains(id) }
            try commit(document)
            // Remove the person's gallery entry and dependent correspondence
            // records together. Never delete photos or rewrite existing Recipes.
        }
    }

    private var fileURL: URL { root.appendingPathComponent("gallery.aesgcm") }

    private func locked<T>(_ operation: () throws -> T) throws -> T {
        try Task.checkCancellation()
        try Self.safePath(root)
        let path = root.appendingPathComponent(".gallery.lock")
        try Self.safePath(path)
        let fd = Darwin.open(path.path, O_RDWR | O_CREAT | O_NOFOLLOW | O_NONBLOCK, mode_t(0o600))
        guard fd >= 0 else { throw StoreError.io(errno) }
        defer { Darwin.close(fd) }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG else { throw StoreError.unsafePath }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { throw StoreError.busy }
        defer { flock(fd, LOCK_UN) }
        return try operation()
    }

    private func load() throws -> Document {
        try Self.safePath(fileURL)
        guard FileManager.default.fileExists(atPath: fileURL.path) else {
            return Document(entries: [])
        }
        let secret = try key(create: false)
        let fd = Darwin.open(fileURL.path, O_RDONLY | O_NOFOLLOW | O_NONBLOCK)
        guard fd >= 0 else { throw StoreError.io(errno) }
        let file = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? file.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
              info.st_size >= 28, info.st_size <= maximumBytes else { throw StoreError.invalidData }
        let ciphertext = try file.read(upToCount: maximumBytes + 1) ?? Data()
        guard ciphertext.count == Int(info.st_size), ciphertext.count <= maximumBytes else { throw StoreError.invalidData }
        let plaintext = try AES.GCM.open(AES.GCM.SealedBox(combined: ciphertext), using: secret, authenticating: Self.aad)
        try strictSchema(plaintext)
        let document = try JSONDecoder().decode(Document.self, from: plaintext)
        try validate(document)
        try Task.checkCancellation()
        return document
    }

    private func commit(_ document: Document) throws {
        try validate(document)
        let data = try JSONEncoder().encode(document)
        guard data.count <= maximumBytes - 28 else { throw StoreError.capacityExceeded }
        let secret = try key(create: !FileManager.default.fileExists(atPath: fileURL.path))
        guard let ciphertext = try AES.GCM.seal(data, using: secret, authenticating: Self.aad).combined else {
            throw StoreError.invalidData
        }
        let temporary = root.appendingPathComponent(".gallery-" + UUID().uuidString)
        let fd = Darwin.open(temporary.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(0o600))
        guard fd >= 0 else { throw StoreError.io(errno) }
        let file = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? file.close(); try? FileManager.default.removeItem(at: temporary) }
        var protectedURL = temporary
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try protectedURL.setResourceValues(values)
        try file.write(contentsOf: ciphertext)
        try file.synchronize()
        try file.close()
        try Task.checkCancellation()
        try Self.safePath(fileURL)
        // The complete old document remains intact until this same-volume swap.
        guard Darwin.rename(temporary.path, fileURL.path) == 0 else { throw StoreError.io(errno) }
        let directory = Darwin.open(root.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        if directory >= 0 { _ = fsync(directory); Darwin.close(directory) }
    }

    private func key(create: Bool) throws -> SymmetricKey {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                  kSecAttrService as String: Self.service, kSecAttrAccount as String: account,
                                  kSecAttrSynchronizable as String: false, kSecReturnData as String: true,
                                  kSecMatchLimit as String: kSecMatchLimitOne]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecSuccess {
            guard let bytes = result as? Data, bytes.count == 32 else { throw StoreError.invalidData }
            return SymmetricKey(data: bytes)
        }
        guard status == errSecItemNotFound else { throw StoreError.keychain(status) }
        guard create else { throw StoreError.missingKey }
        // Never regenerate a missing key while an encrypted document exists.
        guard !FileManager.default.fileExists(atPath: fileURL.path) else { throw StoreError.missingKey }
        let secret = SymmetricKey(size: .bits256)
        let bytes = secret.withUnsafeBytes { Data($0) }
        let addition: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                     kSecAttrService as String: Self.service, kSecAttrAccount as String: account,
                                     kSecAttrSynchronizable as String: false,
                                     kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                                     kSecValueData as String: bytes]
        let added = SecItemAdd(addition as CFDictionary, nil)
        if added == errSecDuplicateItem { return try key(create: false) }
        guard added == errSecSuccess else { throw StoreError.keychain(added) }
        return secret
    }

    private func validate(_ entry: Entry) throws {
        guard !entry.displayName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              entry.displayName.utf8.count <= 256, (1...8).contains(entry.embeddings.count),
              entry.consent.purpose == "local-cross-photo-face-matching",
              !entry.consent.explanationVersion.isEmpty, entry.consent.explanationVersion.utf8.count <= 128,
              entry.consent.confirmedAt.timeIntervalSince1970.isFinite,
              entry.consent.confirmedAt.timeIntervalSince1970 > 0 else { throw StoreError.invalidData }
        for embedding in entry.embeddings { try embedding.validate() }
        if let sources = entry.sources {
            guard sources.count == entry.embeddings.count else { throw StoreError.invalidData }
            func digest(_ value: String) -> Bool {
                value.utf8.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
            }
            for (source, embedding) in zip(sources, entry.embeddings) {
                guard digest(source.originalSHA256), digest(source.analysisSHA256), digest(source.modelSHA256),
                      !source.analysisVersion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                      source.analysisVersion.utf8.count <= 512,
                      source.modelSHA256 == embedding.modelSHA256,
                      source.preprocessingVersion == embedding.preprocessingVersion,
                      source.dimension == embedding.dimension else { throw StoreError.invalidData }
            }
        }
    }

    private static func references(_ document: PhotoPersonAssignments) -> Set<UUID> {
        Set(document.history.flatMap { [$0.previousPersonID, $0.personID].compactMap { $0 } })
    }

    private func validate(_ document: Document) throws {
        guard document.schemaVersion == 3, document.entries.count <= 256,
              document.assignments.count <= 512,
              Set(document.entries.map(\.id)).count == document.entries.count,
              Set(document.assignments.map { $0.document.assetID }).count == document.assignments.count,
              Set(document.assignments.map(\.revision)).count == document.assignments.count else { throw StoreError.invalidData }
        for entry in document.entries { try validate(entry) }
        let people = Set(document.entries.map(\.id))
        for saved in document.assignments {
            try Task.checkCancellation()
            try saved.document.validate()
            guard Self.references(saved.document).isSubset(of: people) else { throw StoreError.unknownPerson }
        }
    }

    private func strictSchema(_ data: Data) throws {
        func object(_ value: Any, keys: Set<String>) throws -> [String: Any] {
            guard let object = value as? [String: Any], Set(object.keys) == keys else { throw StoreError.invalidData }
            return object
        }
        let raw = try JSONSerialization.jsonObject(with: data)
        guard let header = raw as? [String: Any], let version = header["schemaVersion"] as? Int,
              (1...3).contains(version) else { throw StoreError.invalidData }
        let keys: Set<String> = version == 1 ? ["schemaVersion", "entries"] : ["schemaVersion", "entries", "assignments"]
        let document = try object(raw, keys: keys)
        if version >= 2 {
            guard let records = document["assignments"] as? [Any], records.count <= 512 else { throw StoreError.invalidData }
            for record in records {
                _ = try object(record, keys: ["revision", "document"])
                // PhotoPersonAssignments rejects unknown nested keys and bounds
                // target/history arrays in its own decoder before construction.
            }
        }
        guard let entries = document["entries"] as? [Any], entries.count <= 256 else { throw StoreError.invalidData }
        for value in entries {
            guard let rawEntry = value as? [String: Any] else { throw StoreError.invalidData }
            var entryKeys: Set<String> = ["id", "displayName", "embeddings", "consent"]
            if version == 3 && rawEntry["sources"] != nil { entryKeys.insert("sources") }
            let entry = try object(value, keys: entryKeys)
            if let rawSources = entry["sources"] {
                guard let sources = rawSources as? [Any], (1...8).contains(sources.count) else { throw StoreError.invalidData }
                for source in sources {
                    _ = try object(source, keys: ["assetID", "originalSHA256", "analysisSHA256", "analysisVersion",
                        "faceTargetID", "modelSHA256", "preprocessingVersion", "dimension"])
                }
            }
            guard let consent = entry["consent"] else { throw StoreError.invalidData }
            _ = try object(consent, keys: ["purpose", "explanationVersion", "confirmedAt"])
            guard let embeddings = entry["embeddings"] as? [Any], (1...8).contains(embeddings.count) else { throw StoreError.invalidData }
            for embedding in embeddings {
                let vector = try object(embedding, keys: ["schemaVersion", "modelSHA256", "preprocessingVersion", "dimension", "values"])
                guard let values = vector["values"] as? [Any], (16...4096).contains(values.count) else { throw StoreError.invalidData }
            }
        }
    }

    private static func safePath(_ url: URL) throws {
        var cursor = url.standardizedFileURL
        while cursor.path != "/" {
            var info = stat()
            if lstat(cursor.path, &info) == 0 {
                guard (info.st_mode & S_IFMT) != S_IFLNK else { throw StoreError.unsafePath }
            } else if errno != ENOENT { throw StoreError.io(errno) }
            cursor.deleteLastPathComponent()
        }
    }
}
