import Foundation
import CryptoKit
import Darwin
import SuiteCore

/// Manual, background-only handoff. No provider requests, credit settlement,
/// automatic acceptance or claim that imported output has commercial permission.
actor LocalGenerationCandidateStore {
    enum Failure: Error { case busy, unsafe, mismatch, unconfirmed, io(Int32) }
    struct Handoff: Sendable {
        let candidate: LocalGenerationCandidate
        let background: LocalBackdropAssetStore.Manifest
        let subjectMask: Data
        let protectionMask: Data
    }
    private struct Record: Codable, Equatable {
        let candidate: LocalGenerationCandidate
        let background: LocalBackdropAssetStore.Manifest
    }
    private let root: URL
    private let backgrounds: LocalBackdropAssetStore
    private let masks: LocalBackdropRecipeStore
    private var busy = false
    init(root: URL) throws {
        self.root = root.appendingPathComponent("LocalGenerationCandidates")
        guard root.isFileURL, root.standardizedFileURL.path == root.resolvingSymlinksInPath().path else { throw Failure.unsafe }
        backgrounds = try LocalBackdropAssetStore(root: root.appendingPathComponent("LocalBackdrops"))
        masks = try LocalBackdropRecipeStore(root: root)
        try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true)
        guard self.root.standardizedFileURL.path == self.root.resolvingSymlinksInPath().path else { throw Failure.unsafe }
    }
    /// Caller supplies reviewed declarations separately. Unreviewed can be stored
    /// but cannot be handed off for use. Same candidate UUID cannot change content.
    func importCandidate(_ candidate: LocalGenerationCandidate, outputURL: URL,
                         subjectMask: Data, protectionMask: Data,
                         licenseID: String, licenseDeclaration: String,
                         permission: LocalBackdropAssetStore.Permission, permissionConfirmed: Bool) async throws {
        guard !busy else { throw Failure.busy }; busy = true; defer { busy = false }
        try candidate.validate(); try Task.checkCancellation()
        try verify(subjectMask, candidate.subjectMask); try verify(protectionMask, candidate.protectionMask)
        try verifyProtection(subject: subjectMask, protection: protectionMask)
        let manifest = LocalBackdropAssetStore.Manifest(assetID: candidate.id, version: "external-candidate-v1",
            expectedSHA256: candidate.outputSHA256, expectedByteCount: candidate.outputByteCount,
            width: candidate.outputWidth, height: candidate.outputHeight, licenseID: licenseID,
            licenseDeclaration: licenseDeclaration, permission: permission)
        try manifest.validate()
        let record = Record(candidate: candidate, background: manifest)
        if let prior = try read(candidate.id), prior != record { throw Failure.mismatch }
        _ = try await masks.install(mask: subjectMask)
        _ = try await masks.install(mask: protectionMask)
        _ = try await backgrounds.install(from: outputURL, manifest: manifest, permissionConfirmed: permissionConfirmed)
        try Task.checkCancellation()
        try publish(record)
    }
    /// Returns fixed assets only after current editor input agrees. Host must
    /// still perform its ProjectStore CAS and explicit preview/Undo adoption.
    func handoff(id: UUID, assetID: UUID, originalSHA256: String, recipeRevision: Int,
                 acceptanceConfirmed: Bool) async throws -> Handoff {
        guard !busy else { throw Failure.busy }; busy = true; defer { busy = false }
        guard acceptanceConfirmed, let record = try read(id) else { throw Failure.unconfirmed }
        let candidate = record.candidate
        try candidate.validateBinding(assetID: assetID, originalSHA256: originalSHA256, recipeRevision: recipeRevision)
        _ = try await backgrounds.bytesForUse(manifest: record.background)
        let subject = try await masks.bytes(sha256: candidate.subjectMask.sha256, expectedCount: candidate.subjectMask.byteCount)
        let protection = try await masks.bytes(sha256: candidate.protectionMask.sha256, expectedCount: candidate.protectionMask.byteCount)
        // The existing backdrop compositor preserves the subject through its
        // matte. Every additionally protected pixel must already be fully inside
        // that subject, otherwise the legacy compositor would silently lose it.
        try verifyProtection(subject: subject, protection: protection)
        try Task.checkCancellation()
        return Handoff(candidate: candidate, background: record.background, subjectMask: subject, protectionMask: protection)
    }
    private func verify(_ data: Data, _ reference: LocalBackdropRecipe.MaskReference) throws {
        guard data.count == reference.byteCount,
              SHA256.hash(data: data).map({ String(format: "%02x", $0) }).joined() == reference.sha256 else { throw Failure.mismatch }
    }
    private func verifyProtection(subject: Data, protection: Data) throws {
        guard subject.count == protection.count, !subject.isEmpty else { throw Failure.mismatch }
        let s = [UInt8](subject), p = [UInt8](protection)
        var protected = false
        for index in s.indices {
            if index % 4096 == 0 { try Task.checkCancellation() }
            if p[index] != 0 {
                protected = true
                guard s[index] == 255 else { throw Failure.mismatch }
            }
        }
        // Background-only generation adoption promises an explicitly protected
        // original subject. An empty protection map cannot establish that claim.
        guard protected else { throw Failure.unconfirmed }
    }
    private func path(_ id: UUID) throws -> URL {
        guard root.standardizedFileURL.path == root.resolvingSymlinksInPath().path else { throw Failure.unsafe }
        return root.appendingPathComponent(id.uuidString + ".json")
    }
    private func read(_ id: UUID) throws -> Record? {
        try Task.checkCancellation()
        let url = try path(id)
        let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW)
        if fd < 0 { if errno == ENOENT { return nil }; throw Failure.io(errno) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG, info.st_size > 0, info.st_size <= 64 * 1024 else { throw Failure.unsafe }
        let data = try handle.read(upToCount: 64 * 1024 + 1) ?? Data()
        guard data.count == Int(info.st_size) else { throw Failure.mismatch }
        let record = try JSONDecoder().decode(Record.self, from: data)
        try record.candidate.validate(); try record.background.validate()
        guard record.candidate.id == id, record.background.assetID == id,
              record.background.version == "external-candidate-v1",
              record.background.expectedSHA256 == record.candidate.outputSHA256,
              record.background.expectedByteCount == record.candidate.outputByteCount,
              record.background.width == record.candidate.outputWidth,
              record.background.height == record.candidate.outputHeight else { throw Failure.mismatch }
        return record
    }
    private func publish(_ record: Record) throws {
        let url = try path(record.candidate.id)
        let directory = Darwin.open(root.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard directory >= 0 else { throw Failure.io(errno) }
        defer { Darwin.close(directory) }
        guard flock(directory, LOCK_EX | LOCK_NB) == 0 else { throw Failure.busy }
        defer { flock(directory, LOCK_UN) }
        if let previous = try read(record.candidate.id) {
            guard previous == record else { throw Failure.mismatch }
            guard fsync(directory) == 0 else { throw Failure.io(errno) }
            return
        }
        let bytes = try JSONEncoder().encode(record)
        guard bytes.count <= 64 * 1024,
              try FileManager.default.contentsOfDirectory(atPath: root.path).count < 4096 else { throw Failure.unsafe }
        let temporary = root.appendingPathComponent(".candidate-" + UUID().uuidString)
        let fd = Darwin.open(temporary.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, mode_t(0o600))
        guard fd >= 0 else { throw Failure.io(errno) }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close(); try? FileManager.default.removeItem(at: temporary) }
        try handle.write(contentsOf: bytes)
        guard fchmod(fd, mode_t(0o444)) == 0 else { throw Failure.io(errno) }
        try handle.synchronize(); try Task.checkCancellation()
        if Darwin.link(temporary.path, url.path) != 0 {
            guard errno == EEXIST, try read(record.candidate.id) == record else { throw Failure.mismatch }
        }
        // If this fails, leave the immutable record in place. A same-body retry
        // re-synchronizes it instead of replacing it or claiming no write.
        guard fsync(directory) == 0 else { throw Failure.io(errno) }
    }
}
