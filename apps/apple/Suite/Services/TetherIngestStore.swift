import Foundation
import CryptoKit
import Darwin
import SuiteCore

enum TetherIngestError: Error {
    case invalidInput, unsafePath, sizeMismatch, integrityMismatch, storeBusy, corruptLedger
    case receiptConflict, unavailable, staleLease
}

/// Receives an already completed camera download, not a camera transport.
/// Uses the same root/Originals convention as PhotoPipeline. Do NOT pass the
/// returned original to PhotoPipeline.importFile (that would duplicate it).
/// The host must register the returned AssetRecord and call PhotoPipeline's
/// generateProxyForStoredAsset(asset:proxyLongEdge:) for this existing original.
/// Camera deletion, original eviction and Cloud Safe assertions are absent.
actor TetherIngestStore {
    enum State: String, Codable, Sendable { case copying, prepared, stored, interrupted, handingOff, handedOff }
    struct Receipt: Codable, Sendable {
        let id: UUID
        let cameraReceiptKey: String
        let assetID: UUID
        let originalFilename: String
        let relativePath: String
        let expectedBytes: UInt64
        let expectedSHA256: String?
        /// Frozen before the first byte copy. nil preserves legacy receipts; it
        /// cannot later be replaced by the session's current Look on retry.
        let capture: CaptureContext?
        var sha256: String?
        var state: State
        var attempt: Int
        var lease: UUID?
        var downstreamQueueID: String?
        var failure: String?
    }
    struct Handoff: Sendable {
        let receiptID: UUID
        let lease: UUID
        let asset: AssetRecord
        let originalURL: URL
        let capture: CaptureContext?
    }
    private struct Ledger: Codable { var version = 1; var receipts: [Receipt] = [] }
    private let root: URL
    private let lockFD: Int32
    private var ledger: Ledger
    private static let chunk = 1024 * 1024

    /// One process-wide owner per root is enforced with a nonblocking filesystem
    /// lock. Initializing requeues interrupted handoffs (at-least-once delivery).
    init(root: URL) throws {
        guard root.isFileURL else { throw TetherIngestError.unsafePath }
        let root = root.standardizedFileURL
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        guard root.resolvingSymlinksInPath().path == root.path else { throw TetherIngestError.unsafePath }
        self.root = root
        for directory in ["Originals", "TetherIngest"] {
            let url = root.appendingPathComponent(directory)
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            try Self.safe(url, root: root)
        }
        let lock = root.appendingPathComponent("TetherIngest/owner.lock")
        try Self.safe(lock, root: root)
        let fd = Darwin.open(lock.path, O_CREAT | O_RDWR | O_NOFOLLOW, S_IRUSR | S_IWUSR)
        guard fd >= 0 else { throw TetherIngestError.storeBusy }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else { Darwin.close(fd); throw TetherIngestError.storeBusy }
        do {
            let url = root.appendingPathComponent("TetherIngest/ledger.json")
            try Self.safe(url, root: root)
            var loaded = Ledger()
            if FileManager.default.fileExists(atPath: url.path) {
                guard try Self.fileSize(url) <= 32 * 1024 * 1024 else { throw TetherIngestError.corruptLedger }
                loaded = try JSONDecoder().decode(Ledger.self, from: Data(contentsOf: url))
            }
            guard loaded.version == 1, loaded.receipts.count <= 100_000,
                  Set(loaded.receipts.map(\.id)).count == loaded.receipts.count,
                  Set(loaded.receipts.map(\.cameraReceiptKey)).count == loaded.receipts.count else { throw TetherIngestError.corruptLedger }
            for index in loaded.receipts.indices {
                let row = loaded.receipts[index]
                guard row.expectedBytes > 0, row.attempt >= 0,
                      row.relativePath == "Originals/\(row.assetID.uuidString).\(Self.fileExtension(row.originalFilename))" else { throw TetherIngestError.corruptLedger }
                try row.capture?.validate()
                if row.state == .copying { loaded.receipts[index].state = .interrupted }
                if row.state == .handingOff {
                    loaded.receipts[index].state = .stored
                    loaded.receipts[index].lease = nil
                }
            }
            try Self.persist(loaded, root: root)
            self.ledger = loaded
            self.lockFD = fd
        } catch { flock(fd, LOCK_UN); Darwin.close(fd); throw error }
    }
    deinit { flock(lockFD, LOCK_UN); Darwin.close(lockFD) }

    private static func safe(_ url: URL, root: URL) throws {
        let path = url.standardizedFileURL.path
        guard url.isFileURL, path.hasPrefix(root.path + "/"),
              url.resolvingSymlinksInPath().path == path else { throw TetherIngestError.unsafePath }
    }
    private static func fileSize(_ url: URL) throws -> UInt64 {
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true, let size = values.fileSize, size >= 0 else { throw TetherIngestError.unsafePath }
        return UInt64(size)
    }
    private static func fileExtension(_ name: String) -> String {
        let ext = (name as NSString).pathExtension.lowercased()
        return !ext.isEmpty && ext.count <= 12 && ext.unicodeScalars.allSatisfy({ CharacterSet.alphanumerics.contains($0) && $0.isASCII }) ? ext : "image"
    }
    private static func persist(_ value: Ledger, root: URL) throws {
        let url = root.appendingPathComponent("TetherIngest/ledger.json")
        try safe(url, root: root)
        let data = try JSONEncoder().encode(value)
        guard data.count <= 32 * 1024 * 1024 else { throw TetherIngestError.corruptLedger }
        #if os(iOS)
        try data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        #else
        try data.write(to: url, options: .atomic)
        #endif
        let file = try FileHandle(forWritingTo: url)
        defer { try? file.close() }
        try file.synchronize()
    }
    private func save(_ row: Receipt) throws {
        var next = ledger
        if let index = next.receipts.firstIndex(where: { $0.id == row.id }) { next.receipts[index] = row }
        else { guard next.receipts.count < 100_000 else { throw TetherIngestError.corruptLedger }; next.receipts.append(row) }
        try Self.persist(next, root: root)
        ledger = next
    }
    private func original(_ row: Receipt) throws -> URL {
        let url = root.appendingPathComponent(row.relativePath)
        try Self.safe(url, root: root)
        return url
    }
    private func partial(_ row: Receipt) throws -> URL {
        let url = root.appendingPathComponent("TetherIngest/\(row.id.uuidString).part")
        try Self.safe(url, root: root)
        return url
    }
    private static func digest(_ url: URL, expectedBytes: UInt64) throws -> String {
        guard try fileSize(url) == expectedBytes else { throw TetherIngestError.sizeMismatch }
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hash = SHA256(), count: UInt64 = 0
        while let bytes = try handle.read(upToCount: chunk), !bytes.isEmpty {
            try Task.checkCancellation(); count += UInt64(bytes.count)
            guard count <= expectedBytes else { throw TetherIngestError.sizeMismatch }
            hash.update(data: bytes)
        }
        guard count == expectedBytes else { throw TetherIngestError.sizeMismatch }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }
    private func verify(_ row: Receipt) throws {
        guard let sha = row.sha256, try Self.digest(original(row), expectedBytes: row.expectedBytes) == sha else { throw TetherIngestError.integrityMismatch }
    }
    func receipts() -> [Receipt] { ledger.receipts }

    /// Camera key must identify session/device/object, not merely the filename.
    /// expectedBytes is mandatory completed-download evidence from the transport.
    /// A transport SHA is optional; without it this validates local copy integrity,
    /// not equality with inaccessible bytes still inside the camera.
    func receive(downloadedFile: URL, cameraReceiptKey: String, expectedBytes: UInt64,
                 expectedSHA256: String? = nil, capture: CaptureContext? = nil) throws -> Receipt {
        try capture?.validate()
        guard downloadedFile.isFileURL, !cameraReceiptKey.isEmpty, cameraReceiptKey.count <= 512,
              expectedBytes > 0, expectedBytes <= UInt64(Int64.max),
              !downloadedFile.standardizedFileURL.path.hasPrefix(root.appendingPathComponent("TetherIngest").path + "/"),
              downloadedFile.standardizedFileURL.resolvingSymlinksInPath().path == downloadedFile.standardizedFileURL.path else { throw TetherIngestError.invalidInput }
        let expected = expectedSHA256?.lowercased()
        if let expected { guard expected.count == 64, expected.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "0123456789abcdef").contains($0) }) else { throw TetherIngestError.invalidInput } }
        var row: Receipt
        if let existing = ledger.receipts.first(where: { $0.cameraReceiptKey == cameraReceiptKey }) {
            guard existing.expectedBytes == expectedBytes, existing.expectedSHA256 == expected,
                  existing.capture == capture else { throw TetherIngestError.receiptConflict }
            if [.stored, .handingOff, .handedOff].contains(existing.state) { try verify(existing); return existing }
            if existing.state == .prepared { return try finishPrepared(existing) }
            row = existing
        } else {
            let filename = downloadedFile.lastPathComponent, assetID = UUID()
            guard !filename.isEmpty, filename.count <= 255 else { throw TetherIngestError.invalidInput }
            row = Receipt(id: UUID(), cameraReceiptKey: cameraReceiptKey, assetID: assetID,
                originalFilename: filename, relativePath: "Originals/\(assetID.uuidString).\(Self.fileExtension(filename))",
                expectedBytes: expectedBytes, expectedSHA256: expected, capture: capture, state: .copying, attempt: 0)
        }
        guard try Self.fileSize(downloadedFile) == expectedBytes else { throw TetherIngestError.sizeMismatch }
        row.state = .copying; row.attempt += 1; row.failure = nil
        try save(row)
        let staging = try partial(row)
        do {
            // Only this receipt's owned staging file may be removed on retry.
            if FileManager.default.fileExists(atPath: staging.path) { try FileManager.default.removeItem(at: staging) }
            guard FileManager.default.createFile(atPath: staging.path, contents: nil) else { throw TetherIngestError.unavailable }
            let input = try FileHandle(forReadingFrom: downloadedFile)
            defer { try? input.close() }
            let output = try FileHandle(forWritingTo: staging)
            defer { try? output.close() }
            var hash = SHA256(), count: UInt64 = 0
            while let bytes = try input.read(upToCount: Self.chunk), !bytes.isEmpty {
                try Task.checkCancellation(); count += UInt64(bytes.count)
                guard count <= expectedBytes else { throw TetherIngestError.sizeMismatch }
                try output.write(contentsOf: bytes); hash.update(data: bytes)
            }
            guard count == expectedBytes else { throw TetherIngestError.sizeMismatch }
            try output.synchronize(); try output.close()
            let sha = hash.finalize().map { String(format: "%02x", $0) }.joined()
            guard expected == nil || expected == sha,
                  try Self.digest(downloadedFile, expectedBytes: expectedBytes) == sha,
                  try Self.digest(staging, expectedBytes: expectedBytes) == sha else { throw TetherIngestError.integrityMismatch }
            row.sha256 = sha; row.state = .prepared; try save(row)
            return try finishPrepared(row)
        } catch {
            // A prepared receipt may already have its final file after an interrupted
            // ledger write. Preserve prepared state so recovery can reconcile it.
            if row.state != .prepared { row.state = .interrupted }
            row.failure = error is CancellationError ? "cancelled" : "copy-or-commit-failed"
            try? save(row)
            throw error
        }
    }

    private func finishPrepared(_ input: Receipt) throws -> Receipt {
        var row = input
        guard row.state == .prepared, let sha = row.sha256 else { throw TetherIngestError.unavailable }
        // Whole-content deduplication only; same names or similar images do not match.
        if let duplicate = ledger.receipts.first(where: { $0.id != row.id && $0.sha256 == sha && $0.expectedBytes == row.expectedBytes && [.stored, .handingOff, .handedOff].contains($0.state) }) {
            try verify(duplicate)
            // Keep this receipt's identity but reference the already committed asset.
            row = Receipt(id: row.id, cameraReceiptKey: row.cameraReceiptKey, assetID: duplicate.assetID,
                originalFilename: duplicate.originalFilename, relativePath: duplicate.relativePath,
                expectedBytes: row.expectedBytes, expectedSHA256: row.expectedSHA256,
                capture: row.capture, sha256: sha,
                state: .stored, attempt: row.attempt)
            try save(row)
            // Staging deliberately retained; never garbage-collect an Original here.
            return row
        }
        let destination = try original(row)
        if FileManager.default.fileExists(atPath: destination.path) { try verify(row) }
        else {
            let staged = try partial(row)
            guard try Self.digest(staged, expectedBytes: row.expectedBytes) == sha else { throw TetherIngestError.integrityMismatch }
            try Task.checkCancellation()
            try FileManager.default.moveItem(at: staged, to: destination) // no replacement
            try verify(row)
        }
        row.state = .stored; row.failure = nil; try save(row); return row
    }

    /// Explicit per-receipt recovery avoids one corrupt receipt blocking every photo.
    /// Interrupted copies require receive() again with the downloaded source URL;
    /// prepared copies recover without any camera interaction.
    func recoverPrepared(receiptID: UUID) throws -> Receipt {
        guard let row = ledger.receipts.first(where: { $0.id == receiptID }) else { throw TetherIngestError.unavailable }
        return try finishPrepared(row)
    }
    func beginHandoff(receiptID: UUID) throws -> Handoff {
        guard var row = ledger.receipts.first(where: { $0.id == receiptID }), row.state == .stored else { throw TetherIngestError.unavailable }
        try verify(row)
        let asset = AssetRecord(id: row.assetID, originalFilename: row.originalFilename,
            originalRelativePath: row.relativePath, sha256: row.sha256!)
        try asset.validate()
        let lease = UUID(); row.lease = lease; row.state = .handingOff; try save(row)
        return Handoff(receiptID: row.id, lease: lease, asset: asset, originalURL: try original(row),
                       capture: row.capture)
    }
    /// Host acknowledges only AFTER its ProjectCheckpoint and TetherLookQueue
    /// enqueueArrival(checkpoint:receiptID:) result have been durably saved.
    /// queueID is a receipt, NOT proof of proxy/render/Recipe upload/Cloud Safe.
    func acknowledgeHandoff(receiptID: UUID, lease: UUID, persistedQueueID: String) throws {
        guard var row = ledger.receipts.first(where: { $0.id == receiptID }), row.state == .handingOff,
              row.lease == lease, !persistedQueueID.isEmpty, persistedQueueID.count <= 512 else { throw TetherIngestError.staleLease }
        row.downstreamQueueID = persistedQueueID; row.state = .handedOff; row.lease = nil; try save(row)
    }
    func retryHandoff(receiptID: UUID, lease: UUID) throws {
        guard var row = ledger.receipts.first(where: { $0.id == receiptID }), row.state == .handingOff,
              row.lease == lease else { throw TetherIngestError.staleLease }
        row.state = .stored; row.lease = nil; row.failure = "downstream-not-acknowledged"; try save(row)
    }
}
