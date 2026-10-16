import Foundation
import CryptoKit
import Darwin
import SuiteCore

/// One immutable checkpoint+actual JPEG envelope per render lease. The queue
/// points at its SHA only after file and directory durability have succeeded.
/// No original or existing checkpoint is written here; ProjectStore owns CAS.
actor TetherLookWorkerArtifacts {
    enum Failure: Error { case invalid, capacity, io }
    private struct Envelope: Codable {
        let version: Int
        let jobID: UUID
        let binding: SessionImageBinding
        let look: SessionLook
        let analysis: PhotoAnalysisEvidence
        let input: ProjectCheckpoint
        let output: ProjectCheckpoint
        let jpeg: Data
        let authorization: TetherLookLocalWorker.Authorization?
    }
    private let directory: URL
    private let limit = 64 * 1024 * 1024

    init(root: URL) throws {
        guard root.isFileURL else { throw Failure.invalid }
        let root = root.standardizedFileURL
        guard root.resolvingSymlinksInPath() == root else { throw Failure.invalid }
        directory = root.appendingPathComponent("TetherArtifacts", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        guard directory.resolvingSymlinksInPath() == directory else { throw Failure.invalid }
    }

    func save(work: TetherLookQueue.Work, input: ProjectCheckpoint,
              output: ProjectCheckpoint, jpeg: Data,
              authorization: TetherLookLocalWorker.Authorization?) throws -> TetherLookQueue.Artifact {
        try Task.checkCancellation()
        guard case .render = work.kind, let analysis = work.analysis,
              !jpeg.isEmpty, jpeg.count <= 32 * 1024 * 1024,
              input.asset == output.asset, input.revision == work.binding.inputRecipeRevision,
              output.revision == input.revision + 1 else { throw Failure.invalid }
        try input.validate(); try output.validate()
        guard ProcessInfo.processInfo.physicalMemory >= UInt64(limit) * 8 else { throw Failure.capacity }
        let value = Envelope(version: 1, jobID: work.jobID, binding: work.binding,
            look: work.plan.lookSnapshot, analysis: analysis, input: input, output: output,
            jpeg: jpeg, authorization: authorization)
        let data = try JSONEncoder().encode(value)
        guard data.count <= limit else { throw Failure.capacity }
        try validateDirectory()
        let lock = open(directory.appendingPathComponent(".worker.lock").path, O_RDWR | O_CREAT | O_NOFOLLOW, 0o600)
        guard lock >= 0 else { throw Failure.io }
        defer { flock(lock, LOCK_UN); close(lock) }
        guard flock(lock, LOCK_EX | LOCK_NB) == 0 else { throw Failure.io }
        let files = try FileManager.default.contentsOfDirectory(at: directory,
            includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey, .isSymbolicLinkKey])
        guard files.count < 4096 else { throw Failure.capacity }
        var total = 0
        for file in files {
            let info = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey, .isSymbolicLinkKey])
            guard info.isRegularFile == true, info.isSymbolicLink != true, let size = info.fileSize,
                  size >= 0, size <= 512 * 1024 * 1024 - total else { throw Failure.capacity }
            total += size
        }
        guard data.count <= 512 * 1024 * 1024 - total else { throw Failure.capacity }
        let name = work.jobID.uuidString.lowercased() + "-" + work.leaseID.uuidString.lowercased() + ".json"
        let url = directory.appendingPathComponent(name)
        let fd = open(url.path, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw Failure.io }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        // Failed/incomplete files are deliberately orphaned, never acknowledged
        // and never used on retry. Cleanup requires a separate explicit policy.
        try handle.write(contentsOf: data); try handle.synchronize()
        guard fchmod(fd, 0o400) == 0, fsync(fd) == 0 else { throw Failure.io }
        let dir = open(directory.path, O_RDONLY | O_NOFOLLOW)
        guard dir >= 0 else { throw Failure.io }
        defer { close(dir) }
        guard fsync(dir) == 0 else { throw Failure.io }
        return .init(reference: "TetherArtifacts/" + name, sha256: Self.digest(data), analysisID: analysis.id)
    }

    func output(work: TetherLookQueue.Work,
                authorization: TetherLookLocalWorker.Authorization?) throws -> ProjectCheckpoint {
        try Task.checkCancellation(); try validateDirectory()
        guard case .commit = work.kind, let artifact = work.artifact, let analysis = work.analysis else { throw Failure.invalid }
        let prefix = "TetherArtifacts/" + work.jobID.uuidString.lowercased() + "-"
        guard artifact.reference.hasPrefix(prefix), artifact.reference.hasSuffix(".json"),
              !artifact.reference.contains("\\"), artifact.reference.split(separator: "/").count == 2 else { throw Failure.invalid }
        let name = String(artifact.reference.dropFirst("TetherArtifacts/".count))
        let leaseText = String(name.dropFirst(37).dropLast(5))
        guard UUID(uuidString: leaseText) != nil else { throw Failure.invalid }
        let url = directory.appendingPathComponent(name)
        let fd = open(url.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw Failure.io }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0, (info.st_mode & S_IFMT) == S_IFREG,
              info.st_size > 0, info.st_size <= Int64(limit),
              ProcessInfo.processInfo.physicalMemory >= UInt64(limit) * 8 else { throw Failure.invalid }
        var data = Data()
        while let block = try handle.read(upToCount: min(1024 * 1024, limit - data.count + 1)), !block.isEmpty {
            try Task.checkCancellation()
            guard block.count <= limit - data.count else { throw Failure.capacity }
            data.append(block)
        }
        guard Int64(data.count) == info.st_size, Self.digest(data) == artifact.sha256 else { throw Failure.invalid }
        let value = try JSONDecoder().decode(Envelope.self, from: data)
        try value.input.validate(); try value.output.validate()
        guard value.version == 1, value.jobID == work.jobID, value.binding == work.binding,
              value.look == work.plan.lookSnapshot, value.analysis == analysis,
              value.authorization == authorization,
              analysis.id == artifact.analysisID, !value.jpeg.isEmpty,
              value.jpeg.count <= 32 * 1024 * 1024,
              value.input.asset == value.output.asset,
              value.input.asset.id == work.binding.assetID,
              value.input.asset.sha256.lowercased() == work.binding.originalSHA256.lowercased(),
              value.input.revision == work.binding.inputRecipeRevision,
              value.output.revision == value.input.revision + 1 else { throw Failure.invalid }
        return value.output
    }
    private func validateDirectory() throws {
        guard directory.resolvingSymlinksInPath() == directory else { throw Failure.invalid }
        let info = try directory.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard info.isDirectory == true, info.isSymbolicLink != true else { throw Failure.invalid }
    }
    private static func digest(_ data: Data) -> String {
        SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }
}
