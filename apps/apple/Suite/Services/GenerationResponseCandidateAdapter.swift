import Foundation
import CryptoKit
import Darwin
import ImageIO
import UniformTypeIdentifiers
import SuiteCore

/// Explicitly imported response, NOT a signed provider receipt, settlement or
/// network executor. The supplied input/payload are hashed, never transmitted.
actor GenerationResponseCandidateAdapter {
    enum Failure: Error { case busy, invalid, mismatch, unconfirmed, io }
    struct Response: Codable, Equatable, Sendable {
        let schemaVersion: Int
        let authorizationID: UUID
        let providerJobID: String
        let provider: String
        let model: String
        let inputSHA256: String
        let payloadSHA256: String
        let priceListVersion: String
        let candidate: LocalGenerationCandidate
    }
    private let authorizations: GenerationAuthorizationStore
    private let candidates: LocalGenerationCandidateStore
    private let root: URL
    private var busy = false
    init(root: URL) throws {
        guard root.isFileURL, root.standardizedFileURL == root.resolvingSymlinksInPath() else { throw Failure.invalid }
        authorizations = try GenerationAuthorizationStore(root: root)
        candidates = try LocalGenerationCandidateStore(root: root)
        self.root = root.appendingPathComponent("GenerationResponses", isDirectory: true)
        try FileManager.default.createDirectory(at: self.root, withIntermediateDirectories: true)
        guard self.root.resolvingSymlinksInPath() == self.root else { throw Failure.invalid }
    }

    func receive(responseJSON: URL, submittedInput: URL, submittedPayload: URL,
                 output: URL, subjectMask: URL, protectionMask: URL,
                 currentSourcePNG: Data,
                 assetID: UUID, originalSHA256: String, recipeRevision: Int,
                 licenseID: String, licenseDeclaration: String,
                 permissionConfirmed: Bool, acceptanceConfirmed: Bool) async throws -> LocalGenerationCandidateStore.Handoff {
        guard !busy else { throw Failure.busy }; busy = true; defer { busy = false }
        guard permissionConfirmed, acceptanceConfirmed else { throw Failure.unconfirmed }
        guard !currentSourcePNG.isEmpty, currentSourcePNG.count <= 32 * 1024 * 1024 else { throw Failure.invalid }
        let json = try Self.read(responseJSON, maximum: 64 * 1024)
        guard let fields = try JSONSerialization.jsonObject(with: json) as? [String: Any],
              Set(fields.keys) == Set(["schemaVersion", "authorizationID", "providerJobID", "provider", "model", "inputSHA256", "payloadSHA256", "priceListVersion", "candidate"]) else { throw Failure.invalid }
        let response = try JSONDecoder().decode(Response.self, from: json)
        try response.candidate.validateBinding(assetID: assetID, originalSHA256: originalSHA256, recipeRevision: recipeRevision)
        guard response.schemaVersion == 1, !response.providerJobID.isEmpty,
              response.providerJobID.utf8.count <= 256,
              response.providerJobID == response.providerJobID.trimmingCharacters(in: .whitespacesAndNewlines),
              !response.providerJobID.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }),
              let authorization = try await authorizations.lookup(id: response.authorizationID),
              authorization.provider == response.provider, authorization.model == response.model,
              authorization.inputSHA256 == response.inputSHA256,
              authorization.recipeSHA256 == response.payloadSHA256,
              authorization.priceListVersion == response.priceListVersion,
              response.candidate.id == response.authorizationID,
              response.candidate.provider == response.provider, response.candidate.model == response.model else { throw Failure.mismatch }
        // One candidate per authorization. Provider batch/multiple-result jobs
        // need an explicitly versioned expansion; do not silently choose one.
        // This receive path supports the exact current proxy PNG as submitted
        // input. Re-encoded/cropped provider inputs need a separate proven mapping,
        // not a claim that matching original metadata establishes pixel identity.
        guard Self.digest(currentSourcePNG) == authorization.inputSHA256,
              Self.digest(try Self.read(submittedInput, maximum: 32 * 1024 * 1024)) == authorization.inputSHA256,
              Self.digest(try Self.read(submittedPayload, maximum: 4 * 1024 * 1024)) == authorization.recipeSHA256 else { throw Failure.mismatch }
        let subject = try Self.read(subjectMask, maximum: 8_000_000)
        let protection = try Self.read(protectionMask, maximum: 8_000_000)
        let candidate = response.candidate
        guard let image = CGImageSourceCreateWithData(currentSourcePNG as CFData,
                [kCGImageSourceShouldCache: false] as CFDictionary),
              CGImageSourceGetCount(image) == 1,
              let type = CGImageSourceGetType(image), (type as String) == UTType.png.identifier,
              let properties = CGImageSourceCopyPropertiesAtIndex(image, 0, nil) as? [CFString: Any],
              (properties[kCGImagePropertyPixelWidth] as? Int) == candidate.subjectMask.width,
              (properties[kCGImagePropertyPixelHeight] as? Int) == candidate.subjectMask.height,
              (properties[kCGImagePropertyOrientation] as? Int ?? 1) == 1 else { throw Failure.mismatch }
        guard subject.count == candidate.subjectMask.byteCount, protection.count == candidate.protectionMask.byteCount,
              Self.digest(subject) == candidate.subjectMask.sha256,
              Self.digest(protection) == candidate.protectionMask.sha256 else { throw Failure.mismatch }
        // Check protection before publishing any candidate, not only at adoption.
        let s = [UInt8](subject), p = [UInt8](protection)
        guard !p.isEmpty, p.contains(where: { $0 != 0 }) else { throw Failure.unconfirmed }
        for index in s.indices {
            if index % 4096 == 0 { try Task.checkCancellation() }
            guard p[index] == 0 || s[index] == 255 else { throw Failure.mismatch }
        }
        // Reserve immutable request/result linkage first. A failed import retains
        // this linkage for exact retry but is not marked accepted or paid.
        try reserve(response)
        try await candidates.importCandidate(candidate, outputURL: output, subjectMask: subject,
            protectionMask: protection, licenseID: licenseID, licenseDeclaration: licenseDeclaration,
            permission: .callerConfirmed, permissionConfirmed: true)
        try Task.checkCancellation()
        return try await candidates.handoff(id: candidate.id, assetID: assetID,
            originalSHA256: originalSHA256, recipeRevision: recipeRevision, acceptanceConfirmed: true)
    }

    private func reserve(_ value: Response) throws {
        guard root.resolvingSymlinksInPath() == root else { throw Failure.invalid }
        let dir = open(root.path, O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
        guard dir >= 0 else { throw Failure.io }; defer { close(dir) }
        guard flock(dir, LOCK_EX | LOCK_NB) == 0 else { throw Failure.busy }
        defer { flock(dir, LOCK_UN) }
        let name = value.authorizationID.uuidString + ".json"
        // A provider/job pair also cannot silently migrate to another approved
        // request. JSON array encoding is unambiguous even for delimiter text.
        let pair = try JSONEncoder().encode([value.provider, value.providerJobID])
        let jobName = "job-" + Self.digest(pair) + ".json"
        var missing: [String] = []
        for key in [name, jobName] {
            let destination = root.appendingPathComponent(key)
            if FileManager.default.fileExists(atPath: destination.path) {
                guard try JSONDecoder().decode(Response.self, from: Self.read(destination, maximum: 64 * 1024)) == value else { throw Failure.mismatch }
            } else { missing.append(key) }
        }
        if missing.isEmpty { guard fsync(dir) == 0 else { throw Failure.io }; return }
        guard try FileManager.default.contentsOfDirectory(atPath: root.path).count <= 4096 - missing.count else { throw Failure.invalid }
        let bytes = try JSONEncoder().encode(value)
        guard bytes.count <= 64 * 1024 else { throw Failure.invalid }
        let temp = ".response-" + UUID().uuidString
        let fd = openat(dir, temp, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw Failure.io }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close(); unlinkat(dir, temp, 0) }
        try handle.write(contentsOf: bytes); try handle.synchronize()
        guard fchmod(fd, 0o400) == 0, fsync(fd) == 0 else { throw Failure.io }
        try Task.checkCancellation()
        for key in missing { guard linkat(dir, temp, dir, key, 0) == 0 else { throw Failure.io } }
        // An interrupted two-link publication is repaired by exact-body retry;
        // neither immutable index is rolled back or accepted with another body.
        guard fsync(dir) == 0 else { throw Failure.io }
    }
    private static func read(_ url: URL, maximum: Int) throws -> Data {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        guard url.isFileURL, url.standardizedFileURL == url.resolvingSymlinksInPath() else { throw Failure.invalid }
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw Failure.io }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
              info.st_size > 0, info.st_size <= maximum else { throw Failure.invalid }
        var bytes = Data()
        while let block = try handle.read(upToCount: min(1024 * 1024, maximum - bytes.count + 1)), !block.isEmpty {
            try Task.checkCancellation()
            guard block.count <= maximum - bytes.count else { throw Failure.invalid }; bytes.append(block)
        }
        guard bytes.count == Int(info.st_size) else { throw Failure.mismatch }
        return bytes
    }
    private static func digest(_ bytes: Data) -> String {
        SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    }
}
