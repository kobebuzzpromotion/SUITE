import Foundation

public enum ProjectStoreError: Error, Equatable, Sendable {
    case revisionConflict(expected: Int?, actual: Int?)
    case invalidNextRevision
    case immutableOriginalChanged
    case corruptCheckpoint(String)
    case checkpointTooLarge
    case unsafePath
    case tetherCommitConflict, tetherCommitCapacity
    /// Atomic replacement completed, but file synchronization did not. Reload the receipt before retrying.
    case tetherCommitDurabilityUncertain
}

/// Serializes separate store instances within this process as well as each actor's calls.
/// Multi-process/app-extension writes require a coordinated transactional adapter and are NOT supported here.
private enum ProcessStoreLock { static let lock = NSLock() }

public actor ProjectStore {
    private static let maximumTetherCommits = 128
    private struct StoredPartial: Codable {
        let receipt: SessionLookPartialReceiptLedger.Receipt
        let output: ProjectCheckpoint
        private enum CodingKeys: String, CodingKey { case receipt, output }
        init(receipt: SessionLookPartialReceiptLedger.Receipt, output: ProjectCheckpoint) {
            self.receipt = receipt; self.output = output
        }
        init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: ["receipt", "output"])
            let c = try decoder.container(keyedBy: CodingKeys.self)
            receipt = try c.decode(SessionLookPartialReceiptLedger.Receipt.self, forKey: .receipt)
            output = try c.decode(ProjectCheckpoint.self, forKey: .output)
        }
    }
    private struct StoredCommit: Codable {
        let receipt: TetherLookQueue.CommitReceipt
        // Full immutable output snapshot makes retry equality independent of
        // encoder formatting or unstable platform hash algorithms.
        let output: ProjectCheckpoint
        private enum CodingKeys: String, CodingKey, CaseIterable { case receipt, output }
        init(receipt: TetherLookQueue.CommitReceipt, output: ProjectCheckpoint) {
            self.receipt = receipt; self.output = output
        }
        init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            let receiptDecoder = try c.superDecoder(forKey: .receipt)
            try rejectUnknownFields(receiptDecoder, allowed: ["commitID", "jobID", "assetID", "originalSHA256",
                "inputRecipeRevision", "outputRecipeRevision", "lookID", "lookRevision", "artifactSHA256"])
            receipt = try TetherLookQueue.CommitReceipt(from: receiptDecoder)
            output = try c.decode(ProjectCheckpoint.self, forKey: .output)
        }
    }
    /// Private disk schema, not a change to the public ProjectCheckpoint schema.
    private struct StoredDocument: Codable {
        let storageSchemaVersion: Int
        let checkpoint: ProjectCheckpoint
        let tetherCommits: [StoredCommit]
        let partialCommits: [StoredPartial]
        init(checkpoint: ProjectCheckpoint, tetherCommits: [StoredCommit], partialCommits: [StoredPartial] = []) {
            storageSchemaVersion = partialCommits.isEmpty ? 2 : 3
            self.checkpoint = checkpoint; self.tetherCommits = tetherCommits; self.partialCommits = partialCommits
        }
        private enum CodingKeys: String, CodingKey, CaseIterable {
            case storageSchemaVersion, checkpoint, tetherCommits, partialCommits
        }
        init(from decoder: any Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            if !c.contains(.storageSchemaVersion) {
                // Existing raw schema-1 checkpoint remains readable.
                self.init(checkpoint: try ProjectCheckpoint(from: decoder), tetherCommits: [])
                return
            }
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let version = try c.decode(Int.self, forKey: .storageSchemaVersion)
            guard version == 2 || version == 3 else { throw ProjectStoreError.corruptCheckpoint("storageSchemaVersion") }
            if version == 2, c.contains(.partialCommits) { throw ProjectStoreError.corruptCheckpoint("partialCommits") }
            let checkpoint = try c.decode(ProjectCheckpoint.self, forKey: .checkpoint)
            var list = try c.nestedUnkeyedContainer(forKey: .tetherCommits)
            var records: [StoredCommit] = []
            while !list.isAtEnd {
                guard records.count < ProjectStore.maximumTetherCommits else { throw ProjectStoreError.tetherCommitCapacity }
                records.append(try list.decode(StoredCommit.self))
            }
            var partials: [StoredPartial] = []
            if version == 3 {
                var list = try c.nestedUnkeyedContainer(forKey: .partialCommits)
                while !list.isAtEnd {
                    guard partials.count < 256 else { throw ProjectStoreError.tetherCommitCapacity }
                    partials.append(try list.decode(StoredPartial.self))
                }
            }
            self.init(checkpoint: checkpoint, tetherCommits: records, partialCommits: partials)
        }
        func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(storageSchemaVersion, forKey: .storageSchemaVersion)
            try c.encode(checkpoint, forKey: .checkpoint); try c.encode(tetherCommits, forKey: .tetherCommits)
            if storageSchemaVersion == 3 { try c.encode(partialCommits, forKey: .partialCommits) }
        }
    }
    private let directory: URL
    private let maximumCheckpointBytes: Int

    public init(directory: URL, maximumCheckpointBytes: Int = 16 * 1_024 * 1_024) throws {
        guard directory.isFileURL, maximumCheckpointBytes > 0 else { throw ProjectStoreError.unsafePath }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        self.directory = directory.standardizedFileURL.resolvingSymlinksInPath()
        self.maximumCheckpointBytes = maximumCheckpointBytes
    }

    /// nil is create-only at revision 0. Update requires the exact persisted revision and its successor.
    /// Writes metadata only. This API cannot write or remove Original/Proxy binary files.
    public func save(_ checkpoint: ProjectCheckpoint, expectedRevision: Int?) throws {
        try withProcessLock {
            let document = try loadDocumentUnlocked(id: checkpoint.asset.id)
            try validateNext(checkpoint, current: document?.checkpoint, expectedRevision: expectedRevision)
            try persist(StoredDocument(checkpoint: checkpoint, tetherCommits: document?.tetherCommits ?? [],
                                       partialCommits: document?.partialCommits ?? []))
        }
    }

    /// Recipe and idempotency receipt are committed in the SAME atomic document.
    /// Retry must carry exactly the original output snapshot, including timestamps.
    public func saveTetherCommit(_ checkpoint: ProjectCheckpoint, expectedRevision: Int,
                                receipt: TetherLookQueue.CommitReceipt) throws {
        try withProcessLock {
            let document = try loadDocumentUnlocked(id: checkpoint.asset.id)
            try Self.validateReceipt(receipt, output: checkpoint)
            guard expectedRevision == receipt.inputRecipeRevision else { throw ProjectStoreError.tetherCommitConflict }
            if let prior = document?.tetherCommits.first(where: { $0.receipt.jobID == receipt.jobID }) {
                guard prior.receipt == receipt, prior.output == checkpoint else { throw ProjectStoreError.tetherCommitConflict }
                try synchronizeCommittedFile(assetID: checkpoint.asset.id)
                return // Never roll a later normal edit back to the committed output.
            }
            let records = document?.tetherCommits ?? []
            guard records.count < Self.maximumTetherCommits else { throw ProjectStoreError.tetherCommitCapacity }
            guard !records.contains(where: { $0.receipt.commitID == receipt.commitID }) else {
                throw ProjectStoreError.tetherCommitConflict
            }
            try validateNext(checkpoint, current: document?.checkpoint, expectedRevision: expectedRevision)
            try persist(StoredDocument(checkpoint: checkpoint,
                tetherCommits: records + [StoredCommit(receipt: receipt, output: checkpoint)],
                partialCommits: document?.partialCommits ?? []))
        }
    }

    public func tetherCommit(assetID: UUID, jobID: UUID) throws -> TetherLookQueue.CommitReceipt? {
        try withProcessLock {
            try loadDocumentUnlocked(id: assetID)?.tetherCommits.first(where: { $0.receipt.jobID == jobID })?.receipt
        }
    }

    public func partialLookReceipt(assetID: UUID, receiptID: UUID) throws -> SessionLookPartialReceiptLedger.Receipt? {
        try withProcessLock { try loadDocumentUnlocked(id: assetID)?.partialCommits.first(where: { $0.receipt.id == receiptID })?.receipt }
    }

    public struct PartialLookRecovery: Sendable {
        public let checkpoint: ProjectCheckpoint
        public let receipts: [SessionLookPartialReceiptLedger.Receipt]
        public let lastAppliedCheckpoint: ProjectCheckpoint?
    }
    /// One locked read: a caller must not combine a receipt from one disk revision
    /// with a separately loaded checkpoint from another. No state is modified.
    public func partialLookRecovery(binding: SessionImageBinding) throws -> PartialLookRecovery? {
        try withProcessLock {
            guard let document = try loadDocumentUnlocked(id: binding.assetID) else { return nil }
            let records = document.partialCommits.filter { $0.receipt.binding.id == binding.id }
            guard records.allSatisfy({ $0.receipt.binding == binding }) else { throw ProjectStoreError.tetherCommitConflict }
            return PartialLookRecovery(checkpoint: document.checkpoint, receipts: records.map(\.receipt),
                                       lastAppliedCheckpoint: records.last?.output)
        }
    }

    /// Re-synchronize after an uncertain save before returning a positive receipt.
    public func reconcilePartialLookReceipt(_ receipt: SessionLookPartialReceiptLedger.Receipt) throws -> Bool {
        try withProcessLock {
            try receipt.validate()
            guard let saved = try loadDocumentUnlocked(id: receipt.binding.assetID)?.partialCommits.first(where: { $0.receipt.id == receipt.id }) else { return false }
            guard saved.receipt == receipt else { throw ProjectStoreError.tetherCommitConflict }
            try synchronizeCommittedFile(assetID: receipt.binding.assetID)
            return true
        }
    }

    /// Partial effect and full checkpoint share one atomic document. An exact retry
    /// never rolls subsequent edits back. No rendered-pixel claim is made here.
    public func savePartialLookCommit(_ checkpoint: ProjectCheckpoint, expectedRevision: Int,
                                      receipt: SessionLookPartialReceiptLedger.Receipt) throws {
        try withProcessLock {
            try receipt.validate(); try checkpoint.validate()
            let document = try loadDocumentUnlocked(id: checkpoint.asset.id)
            guard receipt.binding.assetID == checkpoint.asset.id,
                  receipt.binding.originalSHA256.lowercased() == checkpoint.asset.sha256.lowercased(),
                  receipt.outputRevision == checkpoint.revision, receipt.output == checkpoint.history.current,
                  receipt.inputRevision == expectedRevision else { throw ProjectStoreError.tetherCommitConflict }
            let records = document?.partialCommits ?? []
            if let prior = records.first(where: { $0.receipt.id == receipt.id }) {
                guard prior.receipt == receipt, prior.output == checkpoint else { throw ProjectStoreError.tetherCommitConflict }
                try synchronizeCommittedFile(assetID: checkpoint.asset.id)
                return
            }
            var ledger = SessionLookPartialReceiptLedger()
            for record in records { _ = try ledger.record(record.receipt) }
            _ = try ledger.record(receipt)
            guard document?.checkpoint.history.current == receipt.input else { throw ProjectStoreError.tetherCommitConflict }
            try validateNext(checkpoint, current: document?.checkpoint, expectedRevision: expectedRevision)
            try Task.checkCancellation()
            try persist(StoredDocument(checkpoint: checkpoint, tetherCommits: document?.tetherCommits ?? [],
                partialCommits: records + [StoredPartial(receipt: receipt, output: checkpoint)]))
        }
    }

    private func validateNext(_ checkpoint: ProjectCheckpoint, current: ProjectCheckpoint?, expectedRevision: Int?) throws {
            try checkpoint.validate()
            guard current?.revision == expectedRevision else {
                throw ProjectStoreError.revisionConflict(expected: expectedRevision, actual: current?.revision)
            }
            if let current {
                guard expectedRevision != nil, current.revision < Int.max,
                      checkpoint.revision == current.revision + 1 else { throw ProjectStoreError.invalidNextRevision }
                guard checkpoint.asset == current.asset else { throw ProjectStoreError.immutableOriginalChanged }
                if let reference = try current.history.entries.compactMap({ try $0.parameters.portraitRecipe() }).first {
                    guard try checkpoint.history.entries.contains(where: { try $0.parameters.portraitRecipe() != nil }) else {
                        throw SuiteValidationError.invalidValue("portraitInventoryLoss")
                    }
                    for entry in checkpoint.history.entries {
                        try entry.parameters.portraitRecipe()?.validate(against: reference)
                    }
                }
                // Revision is the concurrency clock. A wall-clock correction must not block safe saving.
            } else if expectedRevision != nil || checkpoint.revision != 0 {
                throw ProjectStoreError.invalidNextRevision
            }
    }

    private static func validateReceipt(_ receipt: TetherLookQueue.CommitReceipt, output: ProjectCheckpoint) throws {
        try output.validate()
        guard receipt.assetID == output.asset.id,
              isSHA256(receipt.originalSHA256), receipt.originalSHA256.lowercased() == output.asset.sha256.lowercased(),
              isSHA256(receipt.artifactSHA256), receipt.inputRecipeRevision >= 0,
              receipt.inputRecipeRevision < 9_007_199_254_740_991,
              receipt.outputRecipeRevision == receipt.inputRecipeRevision + 1,
              receipt.outputRecipeRevision == output.revision, receipt.lookRevision >= 0,
              receipt.lookRevision <= 9_007_199_254_740_991 else { throw ProjectStoreError.tetherCommitConflict }
    }

    private static func validateDocument(_ document: StoredDocument) throws {
        try document.checkpoint.validate()
        guard (2...3).contains(document.storageSchemaVersion), document.tetherCommits.count <= maximumTetherCommits,
              Set(document.tetherCommits.map { $0.receipt.jobID }).count == document.tetherCommits.count,
              Set(document.tetherCommits.map { $0.receipt.commitID }).count == document.tetherCommits.count else {
            throw ProjectStoreError.tetherCommitConflict
        }
        var ledger = SessionLookPartialReceiptLedger()
        var previousPartialRevision = -1
        for record in document.partialCommits {
            _ = try ledger.record(record.receipt)
            try record.output.validate()
            guard record.receipt.binding.assetID == document.checkpoint.asset.id,
                  record.receipt.binding.originalSHA256.lowercased() == document.checkpoint.asset.sha256.lowercased(),
                  record.output.asset == document.checkpoint.asset,
                  record.receipt.output == record.output.history.current,
                  record.receipt.outputRevision == record.output.revision,
                  record.output.revision > previousPartialRevision,
                  record.output.revision <= document.checkpoint.revision else { throw ProjectStoreError.tetherCommitConflict }
            if record.output.revision == document.checkpoint.revision, record.output != document.checkpoint {
                throw ProjectStoreError.tetherCommitConflict
            }
            previousPartialRevision = record.output.revision
        }
        var previousOutput = -1
        for record in document.tetherCommits {
            try validateReceipt(record.receipt, output: record.output)
            guard record.output.asset == document.checkpoint.asset,
                  record.output.revision <= document.checkpoint.revision,
                  record.output.revision > previousOutput else { throw ProjectStoreError.tetherCommitConflict }
            if record.output.revision == document.checkpoint.revision,
               record.output != document.checkpoint { throw ProjectStoreError.tetherCommitConflict }
            previousOutput = record.output.revision
        }
    }

    private func persist(_ document: StoredDocument) throws {
        try Self.validateDocument(document)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        // Preserve legacy raw checkpoint encoding until this asset has a tether receipt.
        let data = document.tetherCommits.isEmpty && document.partialCommits.isEmpty
            ? try encoder.encode(document.checkpoint) : try encoder.encode(document)
        guard data.count <= maximumCheckpointBytes else { throw ProjectStoreError.checkpointTooLarge }
        let destination = try metadataURL(id: document.checkpoint.asset.id)
        #if os(iOS)
        try data.write(to: destination, options: [.atomic, .completeFileProtection])
        #else
        try data.write(to: destination, options: .atomic)
        #endif
        if !document.tetherCommits.isEmpty || !document.partialCommits.isEmpty { try synchronizeCommittedFile(assetID: document.checkpoint.asset.id) }
    }

    /// This synchronizes the replaced file, not the parent directory. It does not
    /// promise cross-platform power-loss durability of the directory entry.
    private func synchronizeCommittedFile(assetID: UUID) throws {
        do {
            let handle = try FileHandle(forWritingTo: metadataURL(id: assetID))
            defer { try? handle.close() }
            try handle.synchronize()
        } catch {
            throw ProjectStoreError.tetherCommitDurabilityUncertain
        }
    }

    public func load(id: UUID) throws -> ProjectCheckpoint? {
        try withProcessLock { try loadUnlocked(id: id) }
    }

    public func list() throws -> [ProjectCheckpoint] {
        try withProcessLock {
            let files = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)
            var checkpoints: [ProjectCheckpoint] = []
            for file in files where file.pathExtension.lowercased() == "json" {
                guard let id = UUID(uuidString: file.deletingPathExtension().lastPathComponent),
                      file.lastPathComponent == "\(id.uuidString.lowercased()).json" else {
                    throw ProjectStoreError.corruptCheckpoint(file.lastPathComponent)
                }
                guard let checkpoint = try loadUnlocked(id: id) else {
                    throw ProjectStoreError.corruptCheckpoint(file.lastPathComponent)
                }
                checkpoints.append(checkpoint)
            }
            return checkpoints.sorted {
                $0.updatedAt == $1.updatedAt ? $0.asset.id.uuidString < $1.asset.id.uuidString : $0.updatedAt > $1.updatedAt
            }
        }
    }

    private func metadataURL(id: UUID) throws -> URL {
        let candidate = directory.appendingPathComponent("\(id.uuidString.lowercased()).json")
        guard candidate.resolvingSymlinksInPath().deletingLastPathComponent() == directory else {
            throw ProjectStoreError.unsafePath
        }
        // Do not accept a symlink even when it points elsewhere within the metadata directory.
        if let attributes = try? FileManager.default.attributesOfItem(atPath: candidate.path),
           attributes[.type] as? FileAttributeType == .typeSymbolicLink {
            throw ProjectStoreError.unsafePath
        }
        return candidate
    }

    private func loadUnlocked(id: UUID) throws -> ProjectCheckpoint? {
        try loadDocumentUnlocked(id: id)?.checkpoint
    }

    private func loadDocumentUnlocked(id: UUID) throws -> StoredDocument? {
        let url = try metadataURL(id: id)
        let data: Data
        do {
            let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
            guard let size = attributes[.size] as? NSNumber, size.intValue <= maximumCheckpointBytes else {
                throw ProjectStoreError.checkpointTooLarge
            }
            data = try Data(contentsOf: url)
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile || error.code == .fileNoSuchFile {
            return nil
        }
        guard data.count <= maximumCheckpointBytes else { throw ProjectStoreError.checkpointTooLarge }
        do {
            let document = try JSONDecoder().decode(StoredDocument.self, from: data)
            guard document.checkpoint.asset.id == id else { throw ProjectStoreError.corruptCheckpoint(url.lastPathComponent) }
            try Self.validateDocument(document)
            return document
        } catch let error as SuiteValidationError {
            throw error
        } catch {
            // Preserve the original file; never replace parse failures with an empty project.
            throw ProjectStoreError.corruptCheckpoint(url.lastPathComponent)
        }
    }

    private func withProcessLock<T>(_ operation: () throws -> T) rethrows -> T {
        ProcessStoreLock.lock.lock()
        defer { ProcessStoreLock.lock.unlock() }
        return try operation()
    }
}
