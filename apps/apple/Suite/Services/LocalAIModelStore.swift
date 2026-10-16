import Foundation
import CryptoKit
import Darwin
import SuiteCore

/// App-private immutable model storage. Installation proves bytes only, never
/// inference readiness or commercial permission. No network or automatic eviction.
actor LocalAIModelStore {
    struct InstalledAsset: Sendable {
        let url: URL
        let sha256: String
        let byteCount: UInt64
        let modelID: String
        let fixedVersion: String
    }

    enum StoreError: Error {
        case unsafePath, invalidLimits, capacityExceeded, invalidFile
        case sizeMismatch, digestMismatch, io(Int32)
    }

    enum AssetStatus: Equatable, Sendable {
        enum Reason: String, Sendable {
            case byteCountMismatch, digestMismatch, invalidFile, unsafePath
            case storeUnavailable, capacityPolicy, manifestInvalid, readUnavailable
        }
        case notInstalled
        /// Exact bytes exist; says nothing about inference or permission.
        case bytesVerified
        case inconsistent(Reason)
        case unavailable(Reason)
    }

    /// Read-only status. Cancellation propagates instead of painting the model
    /// as corrupt. An inaccessible directory/file is not "not installed".
    func status(manifest: LocalAIModelManifest) throws -> AssetStatus {
        try Task.checkCancellation()
        do { try manifest.validate() }
        catch { return .unavailable(.manifestInvalid) }
        do {
            try Self.checkAncestors(root)
            var directory = stat()
            guard lstat(root.path, &directory) == 0,
                  (directory.st_mode & S_IFMT) == S_IFDIR else { return .unavailable(.storeUnavailable) }
            _ = try verifiedAsset(manifest: manifest)
            try Task.checkCancellation()
            return .bytesVerified
        } catch is CancellationError {
            throw CancellationError()
        } catch let error as StoreError {
            try Task.checkCancellation()
            switch error {
            case .sizeMismatch: return .inconsistent(.byteCountMismatch)
            case .digestMismatch: return .inconsistent(.digestMismatch)
            case .invalidFile: return .inconsistent(.invalidFile)
            case .unsafePath: return .unavailable(.unsafePath)
            case .capacityExceeded, .invalidLimits: return .unavailable(.capacityPolicy)
            case .io(let code):
                // ENOENT is missing only if the dedicated store still exists
                // and the final path itself is absent (not a dangling symlink).
                var directory = stat(); var asset = stat()
                let rootExists = lstat(root.path, &directory) == 0 && (directory.st_mode & S_IFMT) == S_IFDIR
                let result = lstat(assetURL(manifest).path, &asset)
                let absent = result != 0 && errno == ENOENT
                return code == ENOENT && rootExists && absent ? .notInstalled : .unavailable(.readUnavailable)
            }
        } catch {
            try Task.checkCancellation()
            return .unavailable(.readUnavailable)
        }
    }

    private let root: URL
    private let maximumModelBytes: UInt64
    private let maximumStoreBytes: UInt64
    private let chunkBytes = 1_048_576

    /// Root must be a dedicated, app-controlled directory (not a user image folder).
    init(root: URL, maximumModelBytes: UInt64 = 256 * 1024 * 1024,
         maximumStoreBytes: UInt64 = 1024 * 1024 * 1024) throws {
        guard root.isFileURL, maximumModelBytes > 0,
              maximumStoreBytes >= maximumModelBytes else { throw StoreError.invalidLimits }
        self.root = root.standardizedFileURL
        self.maximumModelBytes = maximumModelBytes
        self.maximumStoreBytes = maximumStoreBytes
        try Self.checkAncestors(self.root)
        try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true,
                                               attributes: [.posixPermissions: 0o700])
        try Self.checkAncestors(self.root)
    }

    /// Each version has its own digest name. A failed new installation cannot
    /// replace a previously returned asset. Selection is the caller's manifest.
    func install(from source: URL, manifest: LocalAIModelManifest) throws -> InstalledAsset {
        try manifest.validate()
        try Task.checkCancellation()
        guard manifest.expectedByteCount <= maximumModelBytes else { throw StoreError.capacityExceeded }
        try Self.checkAncestors(root)
        let directoryFD = Darwin.open(root.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard directoryFD >= 0 else { throw StoreError.io(errno) }
        defer { Darwin.close(directoryFD) }
        // Multiple store instances must not independently reserve the same quota.
        guard flock(directoryFD, LOCK_EX | LOCK_NB) == 0 else { throw StoreError.io(errno) }
        defer { flock(directoryFD, LOCK_UN) }
        let destination = assetURL(manifest)
        if FileManager.default.fileExists(atPath: destination.path) {
            return try verifiedAsset(manifest: manifest)
        }
        let used = try storedBytes()
        guard used <= maximumStoreBytes,
              manifest.expectedByteCount <= maximumStoreBytes - used else { throw StoreError.capacityExceeded }
        guard source.isFileURL else { throw StoreError.unsafePath }
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        let input = try Self.openRegular(source, flags: O_RDONLY)
        defer { try? input.close() }
        let temporary = root.appendingPathComponent(".install-" + UUID().uuidString)
        let fd = Darwin.open(temporary.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(0o600))
        guard fd >= 0 else { throw StoreError.io(errno) }
        let output = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        var committed = false
        defer {
            try? output.close()
            if !committed { try? FileManager.default.removeItem(at: temporary) }
        }
        let measured = try measure(input, maximum: manifest.expectedByteCount, copyingTo: output)
        guard measured.0 == manifest.expectedByteCount else { throw StoreError.sizeMismatch }
        guard measured.1 == manifest.expectedSHA256.lowercased() else { throw StoreError.digestMismatch }
        guard fchmod(fd, mode_t(0o444)) == 0 else { throw StoreError.io(errno) }
        try output.synchronize()
        try output.close()
        try Task.checkCancellation()
        try Self.checkAncestors(root)
        // link is atomic and refuses an existing destination, unlike rename.
        // Both paths are in the same app-private directory/filesystem.
        if Darwin.link(temporary.path, destination.path) != 0 {
            if errno == EEXIST { return try verifiedAsset(manifest: manifest) }
            throw StoreError.io(errno)
        }
        // Commit has happened: do not report cancellation as an absent install.
        try? FileManager.default.removeItem(at: temporary)
        // Directory synchronization is best effort on Apple filesystems. Every
        // subsequent lookup rehashes; an interrupted commit is never trusted.
        _ = fsync(directoryFD)
        committed = true
        return receipt(destination, manifest)
    }

    /// Rehash before handing bytes to an inference loader, including after restart.
    func verifiedAsset(manifest: LocalAIModelManifest) throws -> InstalledAsset {
        try manifest.validate()
        guard manifest.expectedByteCount <= maximumModelBytes else { throw StoreError.capacityExceeded }
        let url = assetURL(manifest)
        let file = try Self.openRegular(url, flags: O_RDONLY)
        defer { try? file.close() }
        let measured = try measure(file, maximum: manifest.expectedByteCount, copyingTo: nil)
        guard measured.0 == manifest.expectedByteCount else { throw StoreError.sizeMismatch }
        guard measured.1 == manifest.expectedSHA256.lowercased() else { throw StoreError.digestMismatch }
        return receipt(url, manifest)
    }

    private func assetURL(_ manifest: LocalAIModelManifest) -> URL {
        // Only validated hex goes into a path, never arbitrary modelID/version.
        root.appendingPathComponent(manifest.expectedSHA256.lowercased() + ".onnx")
    }

    private func receipt(_ url: URL, _ manifest: LocalAIModelManifest) -> InstalledAsset {
        InstalledAsset(url: url, sha256: manifest.expectedSHA256.lowercased(),
                       byteCount: manifest.expectedByteCount, modelID: manifest.modelID,
                       fixedVersion: manifest.fixedVersion)
    }

    private func measure(_ input: FileHandle, maximum: UInt64,
                         copyingTo output: FileHandle?) throws -> (UInt64, String) {
        var count: UInt64 = 0
        var hash = SHA256()
        while true {
            try Task.checkCancellation()
            let data = try input.read(upToCount: chunkBytes) ?? Data()
            if data.isEmpty { break }
            guard count <= maximum, UInt64(data.count) <= maximum - count else { throw StoreError.sizeMismatch }
            count += UInt64(data.count)
            hash.update(data: data)
            try output?.write(contentsOf: data)
        }
        return (count, hash.finalize().map { String(format: "%02x", $0) }.joined())
    }

    private func storedBytes() throws -> UInt64 {
        var total: UInt64 = 0
        for url in try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) {
            try Task.checkCancellation()
            let file = try Self.openRegular(url, flags: O_RDONLY)
            defer { try? file.close() }
            var info = stat()
            guard fstat(file.fileDescriptor, &info) == 0, info.st_size >= 0 else { throw StoreError.invalidFile }
            let size = UInt64(info.st_size)
            guard total <= maximumStoreBytes, size <= maximumStoreBytes - total else { throw StoreError.capacityExceeded }
            total += size
        }
        // Interrupted staging files count against quota; never delete unknown files.
        return total
    }

    private static func openRegular(_ url: URL, flags: Int32) throws -> FileHandle {
        try checkAncestors(url)
        let fd = Darwin.open(url.path, flags | O_NOFOLLOW | O_NONBLOCK)
        guard fd >= 0 else { throw StoreError.io(errno) }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG else {
            Darwin.close(fd)
            throw StoreError.invalidFile
        }
        return FileHandle(fileDescriptor: fd, closeOnDealloc: true)
    }

    private static func checkAncestors(_ url: URL) throws {
        guard url.isFileURL else { throw StoreError.unsafePath }
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
