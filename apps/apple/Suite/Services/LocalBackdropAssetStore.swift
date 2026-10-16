import Foundation
import CryptoKit
import Darwin
import ImageIO
import UniformTypeIdentifiers

/// Dedicated app-private local store; no network or implicit license approval.
/// Immutable versions and content-addressed bytes are never overwritten/evicted.
actor LocalBackdropAssetStore {
    enum Failure: Error { case invalidManifest, unsafePath, io(Int32), mismatch, capacity, versionConflict, permissionRequired }
    enum Permission: String, Codable, Sendable { case unreviewed, callerConfirmed }
    struct Manifest: Codable, Equatable, Sendable {
        let assetID: UUID
        let version: String
        let expectedSHA256: String
        let expectedByteCount: Int
        let width: Int
        let height: Int
        let licenseID: String
        let licenseDeclaration: String
        let permission: Permission
        func validate() throws {
            guard !version.isEmpty, version.utf8.count <= 256,
                  expectedSHA256.count == 64, expectedSHA256.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }),
                  (1...32 * 1024 * 1024).contains(expectedByteCount),
                  (1...32768).contains(width), (1...32768).contains(height), width * height <= 8_000_000,
                  !licenseID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, licenseID.utf8.count <= 1024,
                  !licenseDeclaration.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  licenseDeclaration.utf8.count <= 16_384 else { throw Failure.invalidManifest }
        }
    }
    struct Installed: Sendable {
        let manifest: Manifest
        /// Bytes verified, not a legal approval. Unreviewed assets cannot be opened for use.
        let usable: Bool
    }
    private let root: URL
    struct Catalog: Sendable {
        let manifests: [Manifest]
        let unreadableRecords: Int
    }
    /// Only published metadata, never fabricated catalog placeholders.
    func catalog() throws -> Catalog {
        try Self.checkPath(root); try Task.checkCancellation()
        let files = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        guard files.count <= 4096 else { throw Failure.capacity }
        var manifests: [Manifest] = [], unreadable = 0
        for file in files where file.pathExtension == "json" {
            try Task.checkCancellation()
            do {
                let manifest = try JSONDecoder().decode(Manifest.self, from: Self.read(file, limit: 32 * 1024))
                try manifest.validate()
                guard metadataURL(manifest) == file, try exists(objectURL(manifest)) else { throw Failure.mismatch }
                manifests.append(manifest)
            } catch is CancellationError { throw CancellationError() }
            catch { unreadable += 1 }
        }
        return Catalog(manifests: manifests.sorted {
            ($0.assetID.uuidString + $0.version) < ($1.assetID.uuidString + $1.version)
        }, unreadableRecords: unreadable)
    }

    /// Decode only a bounded thumbnail after permission and exact bytes checks.
    func thumbnail(manifest: Manifest) throws -> Data {
        let bytes = try bytesForUse(manifest: manifest)
        guard let source = CGImageSourceCreateWithData(bytes as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 256,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceShouldCacheImmediately: false
              ] as CFDictionary) else { throw Failure.mismatch }
        try Task.checkCancellation()
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { throw Failure.mismatch }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination), data.length <= 1024 * 1024 else { throw Failure.capacity }
        return data as Data
    }
    private let maximumStoreBytes: Int = 512 * 1024 * 1024

    init(root: URL) throws {
        guard root.isFileURL else { throw Failure.unsafePath }
        self.root = root.standardizedFileURL
        try Self.checkPath(self.root)
        try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true,
                                               attributes: [.posixPermissions: 0o700])
        try Self.checkPath(self.root)
    }

    /// Synchronous actor isolation (no await) plus cross-instance flock: installs
    /// cannot interleave. Confirmed permission is caller evidence, never inferred.
    func readManifest(from source: URL) throws -> Manifest {
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        let bytes = try Self.read(source, limit: 32 * 1024)
        guard let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any],
              Set(object.keys) == Set(["assetID", "version", "expectedSHA256", "expectedByteCount", "width", "height", "licenseID", "licenseDeclaration", "permission"]) else { throw Failure.invalidManifest }
        let manifest = try JSONDecoder().decode(Manifest.self, from: bytes)
        try manifest.validate(); return manifest
    }

    func install(from source: URL, manifest: Manifest, permissionConfirmed: Bool = false) throws -> Installed {
        try manifest.validate(); try Task.checkCancellation(); try Self.checkPath(root)
        guard manifest.permission != .callerConfirmed || permissionConfirmed else { throw Failure.permissionRequired }
        let directory = Darwin.open(root.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard directory >= 0 else { throw Failure.io(errno) }
        defer { Darwin.close(directory) }
        guard flock(directory, LOCK_EX | LOCK_NB) == 0 else { throw Failure.io(errno) }
        defer { flock(directory, LOCK_UN) }
        let metadata = metadataURL(manifest)
        if try exists(metadata) {
            guard try JSONDecoder().decode(Manifest.self, from: Self.read(metadata, limit: 32 * 1024)) == manifest else { throw Failure.versionConflict }
            _ = try verifiedBytes(manifest)
            return Installed(manifest: manifest, usable: manifest.permission == .callerConfirmed)
        }
        let scoped = source.startAccessingSecurityScopedResource()
        defer { if scoped { source.stopAccessingSecurityScopedResource() } }
        let bytes = try Self.read(source, limit: manifest.expectedByteCount)
        try verify(bytes, manifest)
        let object = objectURL(manifest)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let document = try encoder.encode(manifest)
        let entries = try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)
        guard entries.count < 4096 else { throw Failure.capacity }
        var used = 0
        for entry in entries {
            try Task.checkCancellation()
            var info = stat()
            guard lstat(entry.path, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
                  info.st_size >= 0, info.st_size <= maximumStoreBytes else { throw Failure.unsafePath }
            used += Int(info.st_size)
            guard used <= maximumStoreBytes else { throw Failure.capacity }
        }
        // Includes transient copies as well as final metadata; interrupted orphan
        // objects remain recoverable and count against quota, never auto-deleted.
        guard used + bytes.count + document.count * 2 <= maximumStoreBytes else { throw Failure.capacity }
        if try exists(object) { _ = try verifiedBytes(manifest) }
        else { try publish(bytes, to: object) }
        try Task.checkCancellation()
        try publish(document, to: metadata)
        _ = fsync(directory)
        return Installed(manifest: manifest, usable: manifest.permission == .callerConfirmed)
    }

    func status(manifest: Manifest) throws -> Installed? {
        try manifest.validate(); try Self.checkPath(root)
        guard try exists(metadataURL(manifest)) else { return nil }
        guard try JSONDecoder().decode(Manifest.self, from: Self.read(metadataURL(manifest), limit: 32 * 1024)) == manifest else { throw Failure.versionConflict }
        _ = try verifiedBytes(manifest)
        return Installed(manifest: manifest, usable: manifest.permission == .callerConfirmed)
    }

    /// Immutable byte snapshot rather than a URL which can change after verification.
    func bytesForUse(manifest: Manifest) throws -> Data {
        guard let record = try status(manifest: manifest), record.usable else { throw Failure.permissionRequired }
        return try verifiedBytes(manifest)
    }

    private func verifiedBytes(_ manifest: Manifest) throws -> Data {
        let bytes = try Self.read(objectURL(manifest), limit: manifest.expectedByteCount)
        try verify(bytes, manifest); return bytes
    }
    private func verify(_ data: Data, _ manifest: Manifest) throws {
        try Task.checkCancellation()
        guard data.count == manifest.expectedByteCount, Self.digest(data) == manifest.expectedSHA256,
              let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(source) == 1, let type = CGImageSourceGetType(source),
              [UTType.png.identifier, UTType.jpeg.identifier].contains(type as String),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              properties[kCGImagePropertyPixelWidth] as? Int == manifest.width,
              properties[kCGImagePropertyPixelHeight] as? Int == manifest.height,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1 else { throw Failure.mismatch }
        try Task.checkCancellation()
    }
    private func objectURL(_ manifest: Manifest) -> URL { root.appendingPathComponent(manifest.expectedSHA256 + ".image") }
    private func metadataURL(_ manifest: Manifest) -> URL {
        root.appendingPathComponent(Self.digest(Data((manifest.assetID.uuidString + ":" + manifest.version).utf8)) + ".json")
    }
    private static func digest(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined() }
    private func exists(_ url: URL) throws -> Bool {
        var info = stat()
        if lstat(url.path, &info) == 0 {
            guard (info.st_mode & S_IFMT) == S_IFREG else { throw Failure.unsafePath }; return true
        }
        guard errno == ENOENT else { throw Failure.io(errno) }; return false
    }
    private static func checkPath(_ url: URL) throws {
        guard url.isFileURL, url.standardizedFileURL.path == url.resolvingSymlinksInPath().path else { throw Failure.unsafePath }
        var cursor = url.standardizedFileURL
        while cursor.path != "/" {
            var info = stat()
            if lstat(cursor.path, &info) == 0 {
                guard (info.st_mode & S_IFMT) != S_IFLNK else { throw Failure.unsafePath }
            } else if errno != ENOENT { throw Failure.io(errno) }
            cursor.deleteLastPathComponent()
        }
    }
    private static func read(_ url: URL, limit: Int) throws -> Data {
        try checkPath(url); try Task.checkCancellation()
        let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw Failure.io(errno) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
              info.st_size >= 0, info.st_size <= limit else { throw Failure.capacity }
        var bytes = Data()
        while true {
            try Task.checkCancellation()
            let chunk = try handle.read(upToCount: min(1_048_576, limit - bytes.count + 1)) ?? Data()
            if chunk.isEmpty { break }
            guard bytes.count + chunk.count <= limit else { throw Failure.capacity }
            bytes.append(chunk)
        }
        return bytes
    }
    private func publish(_ bytes: Data, to destination: URL) throws {
        try Task.checkCancellation(); try Self.checkPath(root)
        let temporary = root.appendingPathComponent(".import-" + UUID().uuidString)
        let fd = Darwin.open(temporary.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(0o600))
        guard fd >= 0 else { throw Failure.io(errno) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close(); try? FileManager.default.removeItem(at: temporary) }
        try handle.write(contentsOf: bytes); try handle.synchronize()
        guard fchmod(fd, mode_t(0o444)) == 0 else { throw Failure.io(errno) }
        try Task.checkCancellation()
        guard Darwin.link(temporary.path, destination.path) == 0 else { throw Failure.io(errno) }
    }
}
