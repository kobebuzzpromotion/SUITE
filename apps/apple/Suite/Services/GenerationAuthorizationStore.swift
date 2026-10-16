import Foundation
import CryptoKit
import Darwin
import SuiteCore

/// Immutable local request-registration journal ONLY. This is not a balance,
/// credit reservation, payment ledger, submission queue or provider executor.
/// Reopening reads the same fixed body. Never delete records to permit ID reuse.
actor GenerationAuthorizationStore {
    enum Failure: Error { case busy, unsafe, mismatch, io(Int32) }
    private struct Record: Codable {
        let schemaVersion: Int
        let authorization: GenerationAuthorization
        let bodySHA256: String
    }
    private let root: URL
    private static let byteLimit = 16 * 1024
    private static let entryLimit = 4096

    init(root: URL) throws {
        guard root.isFileURL, root.standardizedFileURL.path == root.resolvingSymlinksInPath().path else { throw Failure.unsafe }
        self.root = root.appendingPathComponent("GenerationAuthorizations", isDirectory: true)
        try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true)
        guard self.root.standardizedFileURL.path == self.root.resolvingSymlinksInPath().path else { throw Failure.unsafe }
    }

    /// Returns the registered body only after file and directory synchronization.
    /// A sync failure after publication is uncertain, not a rollback: retry the
    /// exact same authorization to reconcile. Cancellation is checked precommit.
    @discardableResult
    func register(_ authorization: GenerationAuthorization) throws -> GenerationAuthorization {
        try authorization.validate(); try Task.checkCancellation()
        return try locked { directory in
            if let previous = try read(authorization.idempotencyKey, directory: directory, synchronize: true) {
                try authorization.validateRetry(of: previous)
                guard fsync(directory) == 0 else { throw Failure.io(errno) }
                return previous
            }
            let body = try Self.body(authorization)
            let record = Record(schemaVersion: 1, authorization: authorization, bodySHA256: Self.digest(body))
            let bytes = try JSONEncoder().encode(record)
            guard bytes.count <= Self.byteLimit,
                  try FileManager.default.contentsOfDirectory(atPath: root.path).count < Self.entryLimit else { throw Failure.unsafe }
            let temporary = ".authorization-" + UUID().uuidString
            let fd = openat(directory, temporary, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(0o600))
            guard fd >= 0 else { throw Failure.io(errno) }
            let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
            defer { try? handle.close(); unlinkat(directory, temporary, 0) }
            try handle.write(contentsOf: bytes)
            guard fchmod(fd, mode_t(0o400)) == 0 else { throw Failure.io(errno) }
            try handle.synchronize(); try Task.checkCancellation()
            if linkat(directory, temporary, directory, Self.name(authorization.idempotencyKey), 0) != 0 {
                guard errno == EEXIST,
                      let previous = try read(authorization.idempotencyKey, directory: directory, synchronize: true) else { throw Failure.io(errno) }
                try authorization.validateRetry(of: previous)
            }
            // No cancellation check after this commit point; retain committed data.
            guard fsync(directory) == 0 else { throw Failure.io(errno) }
            return authorization
        }
    }

    func lookup(id: UUID) throws -> GenerationAuthorization? {
        try Task.checkCancellation()
        return try locked { try read(id, directory: $0, synchronize: false) }
    }

    private func locked<T>(_ operation: (Int32) throws -> T) throws -> T {
        guard root.standardizedFileURL.path == root.resolvingSymlinksInPath().path else { throw Failure.unsafe }
        let fd = Darwin.open(root.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard fd >= 0 else { throw Failure.io(errno) }
        defer { Darwin.close(fd) }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { throw Failure.busy }
        defer { flock(fd, LOCK_UN) }
        return try operation(fd)
    }

    private func read(_ id: UUID, directory: Int32, synchronize: Bool) throws -> GenerationAuthorization? {
        let fd = openat(directory, Self.name(id), O_RDONLY | O_NOFOLLOW)
        if fd < 0 { if errno == ENOENT { return nil }; throw Failure.io(errno) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
              info.st_size > 0, info.st_size <= Self.byteLimit else { throw Failure.unsafe }
        let bytes = try handle.read(upToCount: Self.byteLimit + 1) ?? Data()
        guard bytes.count == Int(info.st_size),
              let fields = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(fields.keys) == Set(["schemaVersion", "authorization", "bodySHA256"]) else { throw Failure.mismatch }
        let record = try JSONDecoder().decode(Record.self, from: bytes)
        try record.authorization.validate()
        guard record.schemaVersion == 1, record.authorization.idempotencyKey == id,
              record.bodySHA256 == Self.digest(try Self.body(record.authorization)) else { throw Failure.mismatch }
        if synchronize { guard fsync(fd) == 0 else { throw Failure.io(errno) } }
        return record.authorization
    }
    private static func name(_ id: UUID) -> String { id.uuidString + ".json" }
    private static func body(_ authorization: GenerationAuthorization) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(authorization)
    }
    private static func digest(_ bytes: Data) -> String {
        SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }
}
