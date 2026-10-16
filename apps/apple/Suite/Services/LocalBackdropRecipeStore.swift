import Foundation
import CryptoKit
import Darwin

/// App-private immutable top-left raw L8 mask objects. No pruning or overwrite.
actor LocalBackdropRecipeStore {
    enum Failure: Error { case invalid, unsafe, io(Int32), capacity }
    private let root: URL
    struct ImportedMask: Sendable {
        let sha256: String
        let width: Int
        let height: Int
        let byteCount: Int
    }
    /// Explicit original-resolution raw L8 TOP-LEFT input, not PNG/JPEG and not
    /// resized from the preview. Dimensions/SHA are caller declarations; matching
    /// this mask to a photo must still be confirmed by the caller and Recipe.
    func importRawMask(from source: URL, expectedSHA256: String,
                       width: Int, height: Int) throws -> ImportedMask {
        guard (1...32768).contains(width), (1...32768).contains(height),
              width * height <= 8_000_000, expectedSHA256.count == 64,
              expectedSHA256.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else { throw Failure.invalid }
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        try Self.safe(source); try Task.checkCancellation()
        let fd = Darwin.open(source.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw Failure.io(errno) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        let expectedCount = width * height
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
              info.st_size == expectedCount else { throw Failure.invalid }
        var data = Data()
        while true {
            try Task.checkCancellation()
            let chunk = try handle.read(upToCount: min(1_048_576, expectedCount - data.count + 1)) ?? Data()
            if chunk.isEmpty { break }
            guard data.count + chunk.count <= expectedCount else { throw Failure.invalid }
            data.append(chunk)
        }
        guard data.count == expectedCount, Self.digest(data) == expectedSHA256 else { throw Failure.invalid }
        let digest = try install(mask: data)
        return ImportedMask(sha256: digest, width: width, height: height, byteCount: expectedCount)
    }
    init(root: URL) throws {
        self.root = root.standardizedFileURL.appendingPathComponent("LocalBackdropMasks")
        try Self.safe(root)
        try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
        try Self.safe(self.root)
    }
    func install(mask: Data) throws -> String {
        try Task.checkCancellation(); try Self.safe(root)
        guard !mask.isEmpty, mask.count <= 8_000_000 else { throw Failure.invalid }
        let hash = Self.digest(mask), destination = root.appendingPathComponent(Self.digest(mask) + ".l8")
        let directory = Darwin.open(root.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard directory >= 0 else { throw Failure.io(errno) }; defer { Darwin.close(directory) }
        guard flock(directory, LOCK_EX | LOCK_NB) == 0 else { throw Failure.io(errno) }
        defer { flock(directory, LOCK_UN) }
        var statValue = stat()
        if lstat(destination.path, &statValue) == 0 { _ = try bytes(sha256: hash, expectedCount: mask.count); return hash }
        guard errno == ENOENT else { throw Failure.io(errno) }
        let entries = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        guard entries.count < 4096 else { throw Failure.capacity }
        var total = mask.count
        for entry in entries {
            try Task.checkCancellation()
            guard lstat(entry.path, &statValue) == 0, (statValue.st_mode & S_IFMT) == S_IFREG,
                  statValue.st_size >= 0, statValue.st_size <= 512 * 1024 * 1024 else { throw Failure.unsafe }
            total += Int(statValue.st_size)
            guard total <= 512 * 1024 * 1024 else { throw Failure.capacity }
        }
        let temp = root.appendingPathComponent(".mask-" + UUID().uuidString)
        let fd = Darwin.open(temp.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(0o600))
        guard fd >= 0 else { throw Failure.io(errno) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close(); try? FileManager.default.removeItem(at: temp) }
        try handle.write(contentsOf: mask)
        guard fchmod(fd, mode_t(0o444)) == 0 else { throw Failure.io(errno) }
        try handle.synchronize(); try Task.checkCancellation()
        guard Darwin.link(temp.path, destination.path) == 0 else { throw Failure.io(errno) }
        _ = fsync(directory)
        return hash
    }
    func bytes(sha256: String, expectedCount: Int) throws -> Data {
        try Task.checkCancellation(); try Self.safe(root)
        guard sha256.count == 64, sha256.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
              (1...8_000_000).contains(expectedCount) else { throw Failure.invalid }
        let fd = Darwin.open(root.appendingPathComponent(sha256 + ".l8").path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw Failure.io(errno) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG, info.st_size == expectedCount else { throw Failure.invalid }
        var data = Data()
        while true {
            try Task.checkCancellation()
            let chunk = try handle.read(upToCount: min(1_048_576, expectedCount - data.count + 1)) ?? Data()
            if chunk.isEmpty { break }
            guard data.count + chunk.count <= expectedCount else { throw Failure.invalid }
            data.append(chunk)
        }
        try Task.checkCancellation()
        guard data.count == expectedCount, Self.digest(data) == sha256 else { throw Failure.invalid }
        return data
    }
    private static func digest(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
    private static func safe(_ url: URL) throws {
        guard url.isFileURL, url.standardizedFileURL.path == url.resolvingSymlinksInPath().path else { throw Failure.unsafe }
        var cursor = url.standardizedFileURL
        while cursor.path != "/" {
            var info = stat()
            if lstat(cursor.path, &info) == 0 {
                guard (info.st_mode & S_IFMT) != S_IFLNK else { throw Failure.unsafe }
            } else if errno != ENOENT { throw Failure.io(errno) }
            cursor.deleteLastPathComponent()
        }
    }
}
