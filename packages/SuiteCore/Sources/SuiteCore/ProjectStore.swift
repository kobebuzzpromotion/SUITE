import Foundation

public enum ProjectStoreError: Error, Equatable, Sendable {
    case revisionConflict(expected: Int?, actual: Int?)
    case invalidNextRevision
    case immutableOriginalChanged
    case corruptCheckpoint(String)
    case checkpointTooLarge
    case unsafePath
}

/// Serializes separate store instances within this process as well as each actor's calls.
/// Multi-process/app-extension writes require a coordinated transactional adapter and are NOT supported here.
private enum ProcessStoreLock { static let lock = NSLock() }

public actor ProjectStore {
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
            try checkpoint.validate()
            let current = try loadUnlocked(id: checkpoint.asset.id)
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
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(checkpoint)
            guard data.count <= maximumCheckpointBytes else { throw ProjectStoreError.checkpointTooLarge }
            let destination = try metadataURL(id: checkpoint.asset.id)
            #if os(iOS)
            try data.write(to: destination, options: [.atomic, .completeFileProtection])
            #else
            try data.write(to: destination, options: .atomic)
            #endif
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
            let checkpoint = try JSONDecoder().decode(ProjectCheckpoint.self, from: data)
            guard checkpoint.asset.id == id else { throw ProjectStoreError.corruptCheckpoint(url.lastPathComponent) }
            try checkpoint.validate()
            return checkpoint
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
