import Foundation
import Photos
import CryptoKit
import SuiteCore

/// Destination transport only. Encoding, RAW validation and immutable Final
/// creation remain PhotoPipeline's responsibility. No picker/UI or cloud login.
actor Delta66ExportDestinations {
    enum Destination: Sendable {
        case photos
        /// URL must come from a real user selection. Providers are accessed by
        /// their coordinated file URL, never by an assumed Google/iCloud account.
        case selectedDirectory(URL)
        /// Access URL is the selected file or selected containing directory.
        case selectedFile(file: URL, access: URL)
        /// Explicit app-owned Files directory; not a substitute for picker access.
        case appDocumentsDirectory
    }
    enum Collision: Sendable { case fail, uniqueName }
    struct Receipt: Sendable {
        enum Location: Sendable { case photos(localIdentifier: String?), file(URL) }
        let location: Location
        let byteCount: Int64
        let sha256: String
        /// A committed Photos transaction/file move cannot truthfully be undone
        /// by cancelling its awaiting Task. In that case return the saved receipt.
        let cancellationRequestedAfterCommit: Bool
        /// A document provider accepting a write is NOT remote upload evidence.
        let remoteUploadConfirmed = false
    }
    enum Failure: LocalizedError {
        case invalidFile, invalidName, invalidSelection, accessDenied, collision(URL)
        case photosUsageDescriptionMissing, photosDenied, integrityMismatch
        case photosFailed, coordinationFailed
        var errorDescription: String? {
            switch self {
            case .invalidFile: "保存するファイルを読み取れません。原本は変更していません。"
            case .invalidName: "保存名には単一のファイル名を指定してください。"
            case .invalidSelection: "保存先をFilesで選択してください。"
            case .accessDenied: "選択した保存先へのアクセスを許可できません。再選択してください。"
            case .collision(let url): "同名ファイルがあります: \(url.lastPathComponent)。上書きはしていません。"
            case .photosUsageDescriptionMissing: "写真追加権限のアプリ設定が未接続です。"
            case .photosDenied: "写真への追加が許可されていません。Filesへの保存を選べます。"
            case .integrityMismatch: "保存データの整合性を確認できません。"
            case .photosFailed: "写真ライブラリへの保存に失敗しました。"
            case .coordinationFailed: "ドキュメント保存先との書込み調整に失敗しました。"
            }
        }
    }
    private struct Staged {
        let directory: URL
        let file: URL
        let byteCount: Int64
        let sha256: String
    }
    private final class IdentifierBox: @unchecked Sendable {
        private let lock = NSLock()
        private var value: String?
        func set(_ text: String?) { lock.lock(); defer { lock.unlock() }; value = text }
        func get() -> String? { lock.lock(); defer { lock.unlock() }; return value }
    }

    /// Reuses the current verified renderer. Rendering does not imply delivery.
    /// Existing local Final is deliberately retained if delivery is cancelled.
    func export(pipeline: PhotoPipeline, checkpoint: ProjectCheckpoint,
                format: ExportFormat, sequence: Int = 1, destination: Destination,
                collision: Collision = .fail) async throws -> Receipt {
        try Task.checkCancellation()
        let final = try await pipeline.export(checkpoint: checkpoint, format: format, sequence: sequence)
        return try await saveFile(final, destination: destination, collision: collision)
    }

    /// Supports original-file copies as well as rendered files. For an Original,
    /// pass AssetRecord.sha256; this method never moves/deletes/rewrites source.
    /// Provider source URLs require a security scope explicitly supplied by host.
    func saveFile(_ source: URL, sourceAccessURL: URL? = nil,
                  expectedSHA256: String? = nil, fileName: String? = nil,
                  destination: Destination, collision: Collision = .fail) async throws -> Receipt {
        try Task.checkCancellation()
        let name = try checkedName(fileName ?? source.lastPathComponent)
        let scoped = sourceAccessURL?.startAccessingSecurityScopedResource() ?? false
        if sourceAccessURL != nil && !scoped { throw Failure.accessDenied }
        defer { if scoped { sourceAccessURL?.stopAccessingSecurityScopedResource() } }
        let staged = try stage(source, name: name, expectedSHA256: expectedSHA256)
        defer { try? FileManager.default.removeItem(at: staged.directory) }
        switch destination {
        case .photos:
            return try await savePhotos(staged)
        case .selectedDirectory(let directory):
            return try saveCoordinated(staged, directory: directory, exactFile: nil,
                                       accessURL: directory, collision: collision)
        case .selectedFile(let file, let access):
            let resolved = file.standardizedFileURL.resolvingSymlinksInPath()
            let scope = access.standardizedFileURL.resolvingSymlinksInPath()
            guard file.isFileURL, access.isFileURL,
                  resolved == scope || resolved.path.hasPrefix(scope.path + "/") else { throw Failure.invalidSelection }
            _ = try checkedName(file.lastPathComponent)
            return try saveCoordinated(staged, directory: file.deletingLastPathComponent(),
                                       exactFile: file, accessURL: access, collision: collision)
        case .appDocumentsDirectory:
            let directory = try FileManager.default.url(for: .documentDirectory, in: .userDomainMask,
                                                        appropriateFor: nil, create: true)
            return try saveCoordinated(staged, directory: directory, exactFile: nil,
                                       accessURL: nil, collision: collision)
        }
    }

    private func checkedName(_ name: String) throws -> String {
        guard !name.isEmpty, name != ".", name != "..", name.utf8.count <= 240,
              !name.contains("/"), !name.contains("\\"), !name.contains(":"),
              !name.unicodeScalars.contains(where: { CharacterSet.controlCharacters.contains($0) }) else {
            throw Failure.invalidName
        }
        return name
    }

    private func stage(_ source: URL, name: String, expectedSHA256: String?) throws -> Staged {
        guard source.isFileURL else { throw Failure.invalidFile }
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinationError: NSError?, operationError: Error?, staged: Staged?
        coordinator.coordinate(readingItemAt: source, options: [], error: &coordinationError) { coordinatedSource in
            do { staged = try stageCopy(coordinatedSource, name: name, expectedSHA256: expectedSHA256) }
            catch { operationError = error }
        }
        if let operationError { throw operationError }
        if let coordinationError {
            if let staged { try? FileManager.default.removeItem(at: staged.directory) }
            throw coordinationError
        }
        guard let staged else { throw Failure.coordinationFailed }
        return staged
    }

    private func stageCopy(_ source: URL, name: String, expectedSHA256: String?) throws -> Staged {
        let values = try source.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        guard values.isRegularFile == true, values.isSymbolicLink != true else { throw Failure.invalidFile }
        if let expectedSHA256 {
            guard expectedSHA256.count == 64, expectedSHA256.allSatisfy({ $0.isHexDigit }) else { throw Failure.integrityMismatch }
        }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("suite-export-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        let target = folder.appendingPathComponent(name)
        do {
            guard FileManager.default.createFile(atPath: target.path, contents: nil) else { throw Failure.invalidFile }
            let input = try FileHandle(forReadingFrom: source)
            defer { try? input.close() }
            let output = try FileHandle(forWritingTo: target)
            defer { try? output.close() }
            var hash = SHA256(), count: Int64 = 0
            while let chunk = try input.read(upToCount: 1024 * 1024), !chunk.isEmpty {
                try Task.checkCancellation(); try output.write(contentsOf: chunk)
                hash.update(data: chunk); count += Int64(chunk.count)
            }
            guard count > 0 else { throw Failure.invalidFile }
            let digest = hash.finalize().map { String(format: "%02x", $0) }.joined()
            if let expectedSHA256, digest != expectedSHA256.lowercased() { throw Failure.integrityMismatch }
            try output.synchronize(); try Task.checkCancellation()
            return Staged(directory: folder, file: target, byteCount: count, sha256: digest)
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
    }

    private func savePhotos(_ staged: Staged) async throws -> Receipt {
        // Requesting without the privacy key can terminate the app; refuse first.
        guard let description = Bundle.main.object(forInfoDictionaryKey: "NSPhotoLibraryAddUsageDescription") as? String,
              !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw Failure.photosUsageDescriptionMissing }
        var status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        if status == .notDetermined {
            try Task.checkCancellation()
            status = await withCheckedContinuation { continuation in
                PHPhotoLibrary.requestAuthorization(for: .addOnly) { continuation.resume(returning: $0) }
            }
        }
        guard status == .authorized || status == .limited else { throw Failure.photosDenied }
        try Task.checkCancellation()
        let identifier = IdentifierBox(), file = staged.file
        // Cancellation after submission waits for the real transaction outcome.
        // shouldMoveFile=false guarantees Photos cannot consume the source/stage.
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            PHPhotoLibrary.shared().performChanges({
                let request = PHAssetCreationRequest.forAsset()
                let options = PHAssetResourceCreationOptions()
                options.shouldMoveFile = false
                options.originalFilename = file.lastPathComponent
                request.addResource(with: .photo, fileURL: file, options: options)
                identifier.set(request.placeholderForCreatedAsset?.localIdentifier)
            }, completionHandler: { success, error in
                if success { continuation.resume() }
                else { continuation.resume(throwing: error ?? Failure.photosFailed) }
            })
        }
        return Receipt(location: .photos(localIdentifier: identifier.get()), byteCount: staged.byteCount,
                       sha256: staged.sha256, cancellationRequestedAfterCommit: Task.isCancelled)
    }

    private func saveCoordinated(_ staged: Staged, directory: URL, exactFile: URL?,
                                 accessURL: URL?, collision: Collision) throws -> Receipt {
        guard directory.isFileURL else { throw Failure.invalidSelection }
        let scoped = accessURL?.startAccessingSecurityScopedResource() ?? false
        if accessURL != nil && !scoped { throw Failure.accessDenied }
        defer { if scoped { accessURL?.stopAccessingSecurityScopedResource() } }
        try Task.checkCancellation()
        let coordinator = NSFileCoordinator(filePresenter: nil)
        var coordinationError: NSError?, operationError: Error?, published: URL?
        // Coordinate the directory because both temporary and final names change.
        coordinator.coordinate(writingItemAt: directory, options: [], error: &coordinationError) { coordinatedDirectory in
            do {
                try Task.checkCancellation()
                guard try coordinatedDirectory.resourceValues(forKeys: [.isDirectoryKey]).isDirectory == true else { throw Failure.invalidSelection }
                let name = exactFile?.lastPathComponent ?? staged.file.lastPathComponent
                var target = coordinatedDirectory.appendingPathComponent(name)
                if FileManager.default.fileExists(atPath: target.path) {
                    switch collision {
                    case .fail: throw Failure.collision(target)
                    case .uniqueName:
                        let suffix = target.pathExtension, base = target.deletingPathExtension().lastPathComponent
                        target = coordinatedDirectory.appendingPathComponent("\(base)-\(UUID().uuidString)\(suffix.isEmpty ? "" : "." + suffix)")
                    }
                }
                let temporary = coordinatedDirectory.appendingPathComponent(".suite-partial-\(UUID().uuidString)")
                defer { try? FileManager.default.removeItem(at: temporary) }
                try FileManager.default.copyItem(at: staged.file, to: temporary)
                let handle = try FileHandle(forWritingTo: temporary)
                do { try handle.synchronize(); try handle.close() }
                catch { try? handle.close(); throw error }
                try Task.checkCancellation()
                // No replacement option: a racing collision fails, never overwrites.
                try FileManager.default.moveItem(at: temporary, to: target)
                published = target
            } catch { operationError = error }
        }
        // A post-commit coordination warning must not be reported as "not saved".
        if let published {
            return Receipt(location: .file(published), byteCount: staged.byteCount, sha256: staged.sha256,
                           cancellationRequestedAfterCommit: Task.isCancelled)
        }
        if let operationError { throw operationError }
        if let coordinationError { throw coordinationError }
        throw Failure.coordinationFailed
    }
}
