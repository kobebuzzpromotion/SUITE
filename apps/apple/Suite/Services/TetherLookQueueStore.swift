import Foundation
import Darwin
import SuiteCore

/// Single-writer, app-local durable queue. No camera/ML/render work is performed.
/// Callers may acknowledge ingest or execute returned Work ONLY after this actor
/// returns successfully. Root must be app-owned local storage, not a File Provider.
actor TetherLookQueueStore {
    enum StoreError: Error {
        case invalidRoot, busy, closed, invalidFile, oversized, wrongSession
        case durabilityUncertain // rename succeeded, directory fsync did not
    }
    private static let maximumBytes = 64 * 1024 * 1024
    private let directory: URL
    private let stateURL: URL
    private var lockFD: Int32
    private var state: TetherLookQueue
    private var poisoned = false

    init(root: URL, initialSession: TetherSessionState) throws {
        try initialSession.validate()
        guard root.isFileURL, !root.path.isEmpty, root.standardizedFileURL.path != "/" else { throw StoreError.invalidRoot }
        let canonical = root.standardizedFileURL.resolvingSymlinksInPath()
        let directory = canonical.appendingPathComponent("TetherLookQueues", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let values = try directory.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard values.isDirectory == true, values.isSymbolicLink != true,
              directory.standardizedFileURL.resolvingSymlinksInPath().deletingLastPathComponent() == canonical else { throw StoreError.invalidRoot }
        let stem = initialSession.id.uuidString.lowercased()
        let stateURL = directory.appendingPathComponent(stem + ".json")
        let lockURL = directory.appendingPathComponent(stem + ".lock")
        let fd = Darwin.open(lockURL.path, O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw Self.posixError() }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { Darwin.close(fd); throw StoreError.busy }
        do {
            let queue: TetherLookQueue
            if let data = try Self.readState(stateURL) {
                queue = try TetherLookQueue.restore(data)
                guard queue.session.id == initialSession.id else { throw StoreError.wrongSession }
                // Existing saved Look/controls win. Never replace a saved queue
                // with initialSession or silently ignore damaged JSON.
            } else { queue = try TetherLookQueue(session: initialSession) }
            // Recovery (lease invalidation + paused state) is durable before open.
            try Self.persist(queue, to: stateURL, directory: directory)
            self.directory = directory; self.stateURL = stateURL
            self.lockFD = fd; self.state = queue
        } catch { flock(fd, LOCK_UN); Darwin.close(fd); throw error }
    }
    deinit { if lockFD >= 0 { flock(lockFD, LOCK_UN); Darwin.close(lockFD) } }

    private func requireOpen() throws {
        guard lockFD >= 0 else { throw StoreError.closed }
        guard !poisoned else { throw StoreError.durabilityUncertain }
    }
    private func transaction<T>(_ operation: (inout TetherLookQueue) throws -> T) throws -> T {
        try requireOpen(); try Task.checkCancellation()
        var candidate = state
        let result = try operation(&candidate)
        try Task.checkCancellation()
        do { try Self.persist(candidate, to: stateURL, directory: directory) }
        catch StoreError.durabilityUncertain { poisoned = true; throw StoreError.durabilityUncertain }
        // No suspension between copy/update/persist/publish. No post-commit
        // cancellation check: persistence must not be falsely reported undone.
        state = candidate
        return result
    }
    func snapshot() throws -> TetherLookQueue { try requireOpen(); return state }
    /// Freeze and persist Look/controls before dispatching the camera request.
    /// Only a successful return authorizes the caller to use this capture ID.
    func beginCapture(id: UUID = UUID()) throws -> CaptureContext {
        try transaction { try $0.beginCapture(id: id) }
    }
    /// Exact durable correlation only; never guess by time, image name or order.
    func capture(id: UUID) throws -> CaptureContext? {
        try requireOpen()
        try Task.checkCancellation()
        return state.session.captureContexts.first { $0.id == id }
    }
    /// The core validates this exact context belongs to the saved session.
    /// Persist the receipt/job before acknowledging an arrival to its producer.
    func enqueueArrival(checkpoint: ProjectCheckpoint, receiptID: UUID,
                        capture: CaptureContext) throws -> UUID {
        try transaction { try $0.enqueueArrival(checkpoint: checkpoint, receiptID: receiptID, capture: capture) }
    }
    /// Legacy non-capture-aware callers retain their existing arrival semantics.
    func enqueueArrival(checkpoint: ProjectCheckpoint, receiptID: UUID) throws -> UUID {
        try transaction { try $0.enqueueArrival(checkpoint: checkpoint, receiptID: receiptID) }
    }
    func updateLook(_ look: SessionLook, expectedRevision: Int) throws {
        try transaction { try $0.updateLook(look, expectedRevision: expectedRevision) }
    }
    func setControls(_ controls: SessionApplyControls) throws { try transaction { $0.setControls(controls) } }
    func beginNext(capabilities: Set<LookAdapterCapability>) throws -> TetherLookQueue.Work? {
        try transaction { try $0.beginNext(capabilities: capabilities) }
    }
    func acknowledgeAnalysis(jobID: UUID, leaseID: UUID, evidence: PhotoAnalysisEvidence,
                             capabilities: Set<LookAdapterCapability>) throws {
        try transaction { try $0.acknowledgeAnalysis(jobID: jobID, leaseID: leaseID, evidence: evidence, capabilities: capabilities) }
    }
    func acknowledgeRender(jobID: UUID, leaseID: UUID, artifact: TetherLookQueue.Artifact) throws {
        try transaction { try $0.acknowledgeRender(jobID: jobID, leaseID: leaseID, artifact: artifact) }
    }
    func acknowledgeCommit(jobID: UUID, leaseID: UUID, receipt: TetherLookQueue.CommitReceipt) throws {
        try transaction { try $0.acknowledgeCommit(jobID: jobID, leaseID: leaseID, receipt: receipt) }
    }
    func fail(jobID: UUID, leaseID: UUID, reason: String) throws {
        try transaction { try $0.fail(jobID: jobID, leaseID: leaseID, reason: reason) }
    }
    func retry(jobID: UUID, discardAnalysis: Bool = false) throws {
        try transaction { try $0.retry(jobID: jobID, discardAnalysis: discardAnalysis) }
    }
    func pause() throws { try transaction { $0.pause() } }
    func resume() throws { try transaction { $0.resume() } }
    func reconcile(jobID: UUID, committed: TetherLookQueue.CommitReceipt) throws {
        try transaction { try $0.reconcile(jobID: jobID, committed: committed) }
    }
    func confirmNotCommitted(jobID: UUID, evidenceReference: String) throws {
        try transaction { try $0.confirmNotCommitted(jobID: jobID, evidenceReference: evidenceReference) }
    }
    func skip(jobID: UUID, explicitlyRequested: Bool) throws {
        try transaction { try $0.skip(jobID: jobID, explicitlyRequested: explicitlyRequested) }
    }
    /// Stop/fence external workers before closing; this cannot cancel their IO.
    /// A poisoned store closes without publishing a guessed state; reopen reads
    /// the actual on-disk version and applies queue recovery.
    func close() throws {
        guard lockFD >= 0 else { return }
        if !poisoned { try transaction { $0.pause() } }
        flock(lockFD, LOCK_UN); Darwin.close(lockFD); lockFD = -1
    }

    private static func posixError() -> NSError { NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
    private static func readState(_ url: URL) throws -> Data? {
        let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        if fd < 0 { if errno == ENOENT { return nil }; throw posixError() }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0 else { throw posixError() }
        guard (info.st_mode & S_IFMT) == S_IFREG, info.st_size > 0 else { throw StoreError.invalidFile }
        guard info.st_size <= Int64(maximumBytes) else { throw StoreError.oversized }
        var data = Data(); data.reserveCapacity(Int(info.st_size))
        while let chunk = try handle.read(upToCount: min(1024*1024, maximumBytes-data.count+1)), !chunk.isEmpty {
            try Task.checkCancellation()
            guard data.count+chunk.count <= maximumBytes else { throw StoreError.oversized }
            data.append(chunk)
        }
        guard data.count == Int(info.st_size) else { throw StoreError.invalidFile }
        return data
    }
    private static func persist(_ queue: TetherLookQueue, to destination: URL, directory: URL) throws {
        let data = try queue.encoded()
        guard data.count <= maximumBytes else { throw StoreError.oversized }
        let temporary = directory.appendingPathComponent(".queue-\(UUID().uuidString).partial")
        let fd = Darwin.open(temporary.path, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW | O_CLOEXEC, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw posixError() }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close(); try? FileManager.default.removeItem(at: temporary) }
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: temporary.path)
        #endif
        for offset in stride(from: 0, to: data.count, by: 1024*1024) {
            try Task.checkCancellation()
            try handle.write(contentsOf: data.subdata(in: offset..<min(data.count,offset+1024*1024)))
        }
        try handle.synchronize(); try handle.close()
        try Task.checkCancellation()
        // Same-volume rename atomically replaces ONLY this session's JSON.
        // No delete-then-write gap and no partial JSON published on failure.
        guard Darwin.rename(temporary.path, destination.path) == 0 else { throw posixError() }
        let directoryFD = Darwin.open(directory.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard directoryFD >= 0 else { throw StoreError.durabilityUncertain }
        defer { Darwin.close(directoryFD) }
        guard fsync(directoryFD) == 0 else { throw StoreError.durabilityUncertain }
    }
}
