import Foundation
import Darwin
import SuiteCore

/// One app-private ledger per root. Advisory process lock plus actor serialization
/// covers every transition. A damaged ledger is never replaced with an empty one.
actor CaptureAssetCorrelationStore {
    enum StoreError: Error { case invalidRoot, busy, closed, invalidFile, capacity, durabilityUncertain }
    private static let maximumBytes = 32 * 1024 * 1024
    private let directory: URL
    private let stateURL: URL
    private var lockFD: Int32
    private var state: CaptureAssetCorrelation
    private var poisoned = false

    init(root: URL) throws {
        guard root.isFileURL, !root.path.isEmpty, root.standardizedFileURL.path != "/" else { throw StoreError.invalidRoot }
        let canonical = root.standardizedFileURL.resolvingSymlinksInPath()
        let directory = canonical.appendingPathComponent("CaptureCorrelations", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let values = try directory.resourceValues(forKeys: [.isDirectoryKey, .isSymbolicLinkKey])
        guard values.isDirectory == true, values.isSymbolicLink != true,
              directory.resolvingSymlinksInPath().deletingLastPathComponent() == canonical else { throw StoreError.invalidRoot }
        let fd = Darwin.open(directory.appendingPathComponent("ledger.lock").path,
                             O_CREAT | O_RDWR | O_NOFOLLOW | O_CLOEXEC, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw Self.posixError() }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { Darwin.close(fd); throw StoreError.busy }
        do {
            let url = directory.appendingPathComponent("ledger.json")
            let loaded: CaptureAssetCorrelation
            if let bytes = try Self.read(url) { loaded = try JSONDecoder().decode(CaptureAssetCorrelation.self, from: bytes) }
            else { loaded = CaptureAssetCorrelation() }
            try loaded.validate()
            self.directory = directory; stateURL = url; lockFD = fd; state = loaded
        } catch { flock(fd, LOCK_UN); Darwin.close(fd); throw error }
    }
    deinit { if lockFD >= 0 { flock(lockFD, LOCK_UN); Darwin.close(lockFD) } }
    private func requireOpen() throws {
        guard lockFD >= 0 else { throw StoreError.closed }
        guard !poisoned else { throw StoreError.durabilityUncertain }
    }
    func snapshot() throws -> CaptureAssetCorrelation { try requireOpen(); return state }
    func bind(contextID: UUID, key: CaptureAssetCorrelation.Key) throws {
        try transaction { try $0.bind(contextID: contextID, key: key) }
    }
    func record(contextID: UUID, key: CaptureAssetCorrelation.Key, member: CaptureAssetCorrelation.Member) throws {
        try transaction { try $0.record(contextID: contextID, key: key, member: member) }
    }
    @discardableResult func selectFinal(contextID: UUID, receiptID: UUID) throws -> CaptureAssetCorrelation.Member {
        try transaction { try $0.selectFinal(contextID: contextID, receiptID: receiptID) }
    }
    func close() {
        if lockFD >= 0 { flock(lockFD, LOCK_UN); Darwin.close(lockFD); lockFD = -1 }
    }
    private func transaction<T>(_ body: (inout CaptureAssetCorrelation) throws -> T) throws -> T {
        try requireOpen(); try Task.checkCancellation()
        var candidate = state
        let result = try body(&candidate)
        try candidate.validate()
        if candidate == state { return result }
        do { try Self.persist(candidate, to: stateURL, directory: directory) }
        catch StoreError.durabilityUncertain { poisoned = true; throw StoreError.durabilityUncertain }
        state = candidate // No post-commit cancellation rollback.
        return result
    }
    private static func posixError() -> NSError { NSError(domain: NSPOSIXErrorDomain, code: Int(errno)) }
    private static func read(_ url: URL) throws -> Data? {
        let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        if fd < 0 { if errno == ENOENT { return nil }; throw posixError() }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        var info = stat()
        guard fstat(fd, &info) == 0 else { throw posixError() }
        guard (info.st_mode & S_IFMT) == S_IFREG, info.st_size > 0,
              info.st_size <= Int64(maximumBytes) else { throw StoreError.invalidFile }
        var data = Data()
        while let bytes = try handle.read(upToCount: min(1024 * 1024, maximumBytes - data.count + 1)), !bytes.isEmpty {
            try Task.checkCancellation()
            guard bytes.count <= maximumBytes - data.count else { throw StoreError.capacity }
            data.append(bytes)
        }
        guard data.count == Int(info.st_size) else { throw StoreError.invalidFile }
        return data
    }
    private static func persist(_ state: CaptureAssetCorrelation, to url: URL, directory: URL) throws {
        let data = try JSONEncoder().encode(state)
        guard data.count <= maximumBytes else { throw StoreError.capacity }
        let temporary = directory.appendingPathComponent(".correlation-\(UUID().uuidString).partial")
        let fd = Darwin.open(temporary.path, O_CREAT | O_EXCL | O_WRONLY | O_NOFOLLOW | O_CLOEXEC, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw posixError() }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close(); try? FileManager.default.removeItem(at: temporary) }
        #if os(iOS)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: temporary.path)
        #endif
        for offset in stride(from: 0, to: data.count, by: 1024 * 1024) {
            try Task.checkCancellation()
            try handle.write(contentsOf: data.subdata(in: offset..<min(data.count, offset + 1024 * 1024)))
        }
        try handle.synchronize(); try handle.close(); try Task.checkCancellation()
        guard Darwin.rename(temporary.path, url.path) == 0 else { throw posixError() }
        let dirFD = Darwin.open(directory.path, O_RDONLY | O_NOFOLLOW | O_CLOEXEC)
        guard dirFD >= 0 else { throw StoreError.durabilityUncertain }
        defer { Darwin.close(dirFD) }
        guard fsync(dirFD) == 0 else { throw StoreError.durabilityUncertain }
    }
}
