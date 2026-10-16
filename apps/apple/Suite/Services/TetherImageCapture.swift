#if canImport(ImageCaptureCore) && (os(iOS) || os(macOS))
import Foundation
import CoreGraphics
@preconcurrency import ImageCaptureCore

/// ImageCaptureCore transport only. No model is certified Supported by this code.
/// The deployment floor below is conservative, not a claim about API introduction.
/// Host must configure NSCameraUsageDescription on iOS, and required Photos/USB
/// entitlements on macOS. No UI, Xcode project, RAW decoding or asset registration.
/// Sources: developer.apple.com/documentation/imagecapturecore and its public
/// ICDeviceBrowser, ICCameraDeviceDelegate and ICCameraDeviceDownloadDelegate APIs.
@available(iOS 18.0, macOS 15.0, *)
@MainActor
final class TetherImageCapture: NSObject,
    @preconcurrency ICDeviceBrowserDelegate, @preconcurrency ICCameraDeviceDelegate {

    struct Device: Sendable, Equatable {
        let id: UUID                 // This discovery lifetime, NOT a durable identity.
        let reportedUUID: String?
        let name: String?
        let canCaptureOnCamera: Bool // Advertised; not tested shooting/transfer support.
        let canRequestRemoteCapture: Bool
        let sessionOpen: Bool
        let catalogReady: Bool
        let tetheringEnabled: Bool
    }

    struct CameraObject: Sendable, Equatable {
        let deviceID: UUID
        let sessionID: UUID
        let objectID: UUID           // Session-local; never used for reconnect dedupe.
        let reportedDeviceUUID: String?
        let ptpObjectHandle: UInt32? // Camera/session scope, not a global identity.
        let originalName: String?
        let reportedBytes: Int64
        let isRAW: Bool
        let addedAfterCatalog: Bool
    }

    struct Download: Sendable {
        let transferID: UUID
        let object: CameraObject
        let downloadedURL: URL
        let byteCount: Int64
        // Camera reports are descriptive evidence; ingest must hash/register bytes.
        let cameraOriginalDeleted = false
        let originalIntegrityVerified = false
    }

    struct CaptureRequest: Sendable {
        let id: UUID
        let deviceID: UUID
        let sessionID: UUID
        let requestedAt: Date
        let status = "submitted-not-confirmed"
    }

    enum Event: Sendable {
        case deviceDiscovered(Device)
        case deviceChanged(Device)
        case deviceRemoved(UUID)
        case catalogReady(UUID, UUID)
        case fileAdded(CameraObject)
        case fileRemoved(CameraObject)
        case fileRenamed(CameraObject)
        case sessionOpened(UUID, UUID)
        case sessionClosed(UUID)
        case transferStarted(UUID, CameraObject, URL)
        case transferProgress(UUID, Int64, Int64)
        case transferCompleted(Download)
        case transferFailed(UUID, String, URL) // Retained staging directory; never deleted here.
        case lateTransferCompletion(UUID, URL, String?)
        case captureRequested(CaptureRequest)
        case capabilityRequestSubmitted(UUID)
        case transportError(UUID?, String)
    }

    enum Failure: Error, Sendable {
        case missingCameraUsageDescription, permissionDenied, unknownDevice, busy
        case invalidState, disconnected, sessionClosed, timedOut, accessRestricted
        case remoteCaptureNotAdvertised, cameraShutterNotAdvertised, tetheringNotEnabled
        case unknownObject, unsafeDestination, invalidDownloadedFile, sizeMismatch
        case retainedTransferLimit, framework(String)
    }

    private enum State: Equatable { case idle, opening, ready, closing, faulted }
    private struct SessionWait {
        let id: UUID
        let continuation: CheckedContinuation<Void, any Error>
        let timeout: Task<Void, Never>
    }
    private struct AccessWait {
        let continuation: CheckedContinuation<Bool, any Error>
        let timeout: Task<Void, Never>
    }
    private struct ObjectEntry {
        let file: ICCameraFile
        let reference: CameraObject
    }

    private let browser = ICDeviceBrowser()
    private let onEvent: @MainActor (Event) -> Void
    private var cameras: [UUID: ICCameraDevice] = [:]
    private var deviceIDs: [ObjectIdentifier: UUID] = [:]
    private var selectedID: UUID?
    private var sessionID: UUID?
    private var state: State = .idle
    private var catalogComplete = false
    private var objects: [UUID: ObjectEntry] = [:]
    private var objectIDs: [ObjectIdentifier: UUID] = [:]
    private var sessionWait: SessionWait?
    private var accessWaits: [UUID: AccessWait] = [:]
    private var downloads: [UUID: DownloadRelay] = [:]
    private var activeTransferID: UUID?
    private var stopped = false

    /// Keep this instance alive until shutdown and outstanding delegate callbacks
    /// have drained. The event sink must hand off work quickly and must not call
    /// transport methods reentrantly; schedule new work in a MainActor Task.
    init(onEvent: @escaping @MainActor (Event) -> Void) {
        self.onEvent = onEvent
        super.init()
        browser.delegate = self
        browser.browsedDeviceTypeMask = .camera
    }

    func devices() -> [Device] {
        cameras.map { describe($0.value, id: $0.key) }.sorted { $0.id.uuidString < $1.id.uuidString }
    }
    func files() -> [CameraObject] {
        objects.values.map(\.reference).sorted { $0.objectID.uuidString < $1.objectID.uuidString }
    }

    /// Starts device discovery only after explicit host invocation and OS content
    /// authorization. This does not enable tethering or trigger a shutter.
    func startDiscovery() async throws {
        guard !stopped else { throw Failure.invalidState }
        #if os(iOS)
        guard let usage = Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") as? String,
              !usage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw Failure.missingCameraUsageDescription
        }
        #endif
        guard try await requestAccess(control: false) else { throw Failure.permissionDenied }
        try Task.checkCancellation()
        guard !stopped else { throw Failure.invalidState }
        if !browser.isBrowsing { browser.start() }
    }

    private func requestAccess(control: Bool) async throws -> Bool {
        let id = UUID()
        return try await withTaskCancellationHandler {
            try Task.checkCancellation()
            return try await withCheckedThrowingContinuation { continuation in
                accessWaits[id] = AccessWait(continuation: continuation,
                    timeout: later(seconds: 120) { [weak self] in self?.finishAccess(id, result: .failure(Failure.timedOut)) })
                let completion: @Sendable (ICAuthorizationStatus) -> Void = { [weak self] status in
                    let authorized = status == .authorized
                    Task { @MainActor [weak self] in self?.finishAccess(id, result: .success(authorized)) }
                }
                if control { browser.requestControlAuthorization(completion: completion) }
                else { browser.requestContentsAuthorization(completion: completion) }
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.finishAccess(id, result: .failure(CancellationError())) }
        }
    }
    private func finishAccess(_ id: UUID, result: Result<Bool, any Error>) {
        guard let wait = accessWaits.removeValue(forKey: id) else { return }
        wait.timeout.cancel(); wait.continuation.resume(with: result)
    }

    /// Open is complete only after Apple's session callback. File enumeration
    /// finishes separately at catalogReady; old catalog items are not new captures.
    func openSession(deviceID: UUID) async throws {
        guard !stopped, state == .idle, sessionWait == nil else { throw Failure.busy }
        guard let camera = cameras[deviceID] else { throw Failure.unknownDevice }
        guard !camera.accessRestrictedAppleDevice else { throw Failure.accessRestricted }
        let operationID = UUID()
        try await withTaskCancellationHandler {
            try Task.checkCancellation()
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                selectedID = deviceID; sessionID = UUID(); state = .opening
                catalogComplete = false; objects.removeAll(); objectIDs.removeAll()
                camera.delegate = self
                sessionWait = SessionWait(id: operationID, continuation: continuation,
                    timeout: later(seconds: 45) { [weak self] in self?.abortSessionWait(operationID, error: Failure.timedOut) })
                camera.requestOpenSession()
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.abortSessionWait(operationID, error: CancellationError()) }
        }
    }

    func closeSession() async throws {
        guard let id = selectedID, let camera = cameras[id] else { return }
        guard sessionWait == nil, state == .ready || state == .faulted else { throw Failure.busy }
        cancelActiveDownload(reason: Failure.sessionClosed)
        let operationID = UUID()
        try await withTaskCancellationHandler {
            try Task.checkCancellation()
            try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, any Error>) in
                state = .closing
                sessionWait = SessionWait(id: operationID, continuation: continuation,
                    timeout: later(seconds: 30) { [weak self] in self?.abortSessionWait(operationID, error: Failure.timedOut) })
                camera.requestCloseSession()
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.abortSessionWait(operationID, error: CancellationError()) }
        }
    }

    /// Requests the public legacy tethering switch, without interpreting the
    /// request itself as success. Caller observes refreshed capabilities/state.
    /// Physical shutter + transfer and host remote shutter are distinct modes.
    func requestCaptureMode(remote: Bool) async throws {
        let camera = try readyCamera()
        let id = selectedID
        let capability: ICDeviceCapability = remote ? .cameraDeviceCanTakePicture : .cameraDeviceCanTakePictureUsingShutterReleaseOnCamera
        guard camera.capabilities.contains(capability.rawValue) else {
            throw remote ? Failure.remoteCaptureNotAdvertised : Failure.cameraShutterNotAdvertised
        }
        guard try await requestAccess(control: true) else { throw Failure.permissionDenied }
        try Task.checkCancellation()
        guard selectedID == id, try readyCamera() === camera else { throw Failure.disconnected }
        guard camera.capabilities.contains(capability.rawValue) else {
            throw remote ? Failure.remoteCaptureNotAdvertised : Failure.cameraShutterNotAdvertised
        }
        camera.requestEnableTethering()
        if let id { onEvent(.capabilityRequestSubmitted(id)) }
    }

    /// No protocol completion correlates this command to a particular file.
    /// Returned receipt means submitted, NOT shutter success or RAW+JPEG grouping.
    func requestRemoteCapture() throws -> CaptureRequest {
        let camera = try readyCamera()
        guard browser.controlAuthorizationStatus == .authorized else { throw Failure.permissionDenied }
        guard camera.capabilities.contains(ICDeviceCapability.cameraDeviceCanTakePicture.rawValue) else { throw Failure.remoteCaptureNotAdvertised }
        guard camera.tetheredCaptureEnabled else { throw Failure.tetheringNotEnabled }
        guard let deviceID = selectedID, let sessionID else { throw Failure.invalidState }
        let receipt = CaptureRequest(id: UUID(), deviceID: deviceID, sessionID: sessionID, requestedAt: Date())
        camera.requestTakePicture(); onEvent(.captureRequested(receipt)); return receipt
    }

    /// Single transfer at a time: cancelDownload is camera-wide, not per-file.
    /// Input root must be an existing, writable app-owned staging directory.
    /// Each transfer gets a new UUID directory; partial/cancelled bytes are kept
    /// for explicit recovery, never mistaken for a verified original or deleted.
    func download(objectID: UUID, stagingRoot: URL) async throws -> Download {
        let camera = try readyCamera()
        guard activeTransferID == nil else { throw Failure.busy }
        guard downloads.count < 64 else { throw Failure.retainedTransferLimit }
        guard let item = objects[objectID], item.reference.sessionID == sessionID else { throw Failure.unknownObject }
        guard stagingRoot.isFileURL else { throw Failure.unsafeDestination }
        let root = stagingRoot.standardizedFileURL.resolvingSymlinksInPath()
        let rootInfo = try root.resourceValues(forKeys: [.isDirectoryKey, .isWritableKey])
        guard rootInfo.isDirectory == true, rootInfo.isWritable == true else { throw Failure.unsafeDestination }
        let transferID = UUID(), folder = root.appendingPathComponent(transferID.uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: false)
        guard folder.resolvingSymlinksInPath().deletingLastPathComponent() == root else { throw Failure.unsafeDestination }
        let filename = safeFilename(item.reference.originalName)
        return try await withTaskCancellationHandler {
            try Task.checkCancellation()
            return try await withCheckedThrowingContinuation { continuation in
                let relay = DownloadRelay(owner: self, id: transferID, item: item, folder: folder, continuation: continuation)
                downloads[transferID] = relay; activeTransferID = transferID
                relay.timeout = later(seconds: 300) { [weak self] in self?.cancelTransfer(transferID, reason: Failure.timedOut) }
                let options: [ICDownloadOption: Any] = [.downloadsDirectoryURL: folder as NSURL,
                    .saveAsFilename: filename, .overwrite: NSNumber(value: false),
                    .deleteAfterSuccessfulDownload: NSNumber(value: false), .sidecarFiles: NSNumber(value: false)]
                onEvent(.transferStarted(transferID, item.reference, folder))
                camera.requestDownloadFile(item.file, options: options, downloadDelegate: relay,
                    didDownloadSelector: #selector(DownloadRelay.didDownloadFile(_:error:options:contextInfo:)), contextInfo: nil)
            }
        } onCancel: {
            Task { @MainActor [weak self] in self?.cancelTransfer(transferID, reason: CancellationError()) }
        }
    }

    func cancelDownload() { cancelActiveDownload(reason: CancellationError()) }

    /// Lifecycle shutdown is explicit. It completes every pending await before
    /// stopping discovery; no caller is abandoned waiting for a removed device.
    func shutdown() {
        guard !stopped else { return }; stopped = true
        for id in Array(accessWaits.keys) { finishAccess(id, result: .failure(CancellationError())) }
        cancelActiveDownload(reason: CancellationError())
        finishSessionWait(.failure(CancellationError()))
        if let id = selectedID, let camera = cameras[id] { state = .closing; camera.requestCloseSession() }
        browser.stop()
    }

    private func readyCamera() throws -> ICCameraDevice {
        guard !stopped, state == .ready, catalogComplete,
              let id = selectedID, let camera = cameras[id], camera.hasOpenSession else { throw Failure.invalidState }
        guard !camera.accessRestrictedAppleDevice else { throw Failure.accessRestricted }
        return camera
    }
    private func describe(_ camera: ICCameraDevice, id: UUID) -> Device {
        Device(id: id, reportedUUID: camera.uuidString, name: camera.name,
            canCaptureOnCamera: camera.capabilities.contains(ICDeviceCapability.cameraDeviceCanTakePictureUsingShutterReleaseOnCamera.rawValue),
            canRequestRemoteCapture: camera.capabilities.contains(ICDeviceCapability.cameraDeviceCanTakePicture.rawValue),
            sessionOpen: camera.hasOpenSession, catalogReady: selectedID == id && catalogComplete,
            tetheringEnabled: camera.tetheredCaptureEnabled)
    }
    private func later(seconds: UInt64, action: @escaping @MainActor () -> Void) -> Task<Void, Never> {
        Task { @MainActor in
            do { try await Task.sleep(nanoseconds: seconds * 1_000_000_000) } catch { return }
            guard !Task.isCancelled else { return }; action()
        }
    }
    private func finishSessionWait(_ result: Result<Void, any Error>) {
        guard let wait = sessionWait else { return }; sessionWait = nil
        wait.timeout.cancel(); wait.continuation.resume(with: result)
    }
    private func abortSessionWait(_ id: UUID, error: any Error) {
        guard sessionWait?.id == id else { return }
        state = .faulted; finishSessionWait(.failure(error))
        if let id = selectedID, let camera = cameras[id] { camera.requestCloseSession() }
    }
    private func cancelActiveDownload(reason: any Error) {
        if let id = activeTransferID { cancelTransfer(id, reason: reason) }
    }
    private func cancelTransfer(_ id: UUID, reason: any Error) {
        guard let relay = downloads[id], let continuation = relay.continuation else { return }
        relay.continuation = nil; relay.timeout?.cancel(); relay.cancelled = true
        continuation.resume(throwing: reason)
        // Keep the relay + active slot until callback or session removal. A late
        // callback cannot accidentally finish a newer request for the same file.
        if activeTransferID == id, let camera = cameras[relay.item.reference.deviceID] { camera.cancelDownload() }
        onEvent(.transferFailed(id, String(describing: reason), relay.folder))
    }
    private func safeFilename(_ name: String?) -> String {
        let candidate = name ?? "camera-file"
        guard !candidate.isEmpty, candidate.utf8.count <= 180,
              candidate != ".", candidate != "..", !candidate.contains("/"), !candidate.contains("\\"),
              candidate.unicodeScalars.allSatisfy({ !CharacterSet.controlCharacters.contains($0) }) else { return "camera-file" }
        return candidate
    }

    fileprivate func downloadFinished(_ id: UUID, file: ICCameraFile, error: (any Error)?, options: [String: Any]) {
        guard let relay = downloads.removeValue(forKey: id) else { return }
        relay.timeout?.cancel(); if activeTransferID == id { activeTransferID = nil }
        guard let continuation = relay.continuation else {
            onEvent(.lateTransferCompletion(id, relay.folder, error.map { String(describing: $0) })); return
        }
        relay.continuation = nil
        do {
            if let error { throw error }
            guard file === relay.item.file, !relay.cancelled,
                  let filename = options[ICDownloadOption.savedFilename.rawValue] as? String,
                  safeFilename(filename) == filename else { throw Failure.invalidDownloadedFile }
            let candidate = relay.folder.appendingPathComponent(filename).standardizedFileURL
            guard try candidate.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink != true else { throw Failure.unsafeDestination }
            let url = candidate.resolvingSymlinksInPath()
            guard url.deletingLastPathComponent() == relay.folder.resolvingSymlinksInPath() else { throw Failure.unsafeDestination }
            let values = try url.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey, .fileSizeKey])
            guard values.isRegularFile == true, values.isSymbolicLink != true, let size = values.fileSize, size > 0 else { throw Failure.invalidDownloadedFile }
            let bytes = Int64(size), expected = relay.item.reference.reportedBytes
            guard expected <= 0 || bytes == expected else { throw Failure.sizeMismatch }
            let result = Download(transferID: id, object: relay.item.reference, downloadedURL: url, byteCount: bytes)
            continuation.resume(returning: result); onEvent(.transferCompleted(result))
        } catch {
            continuation.resume(throwing: error); onEvent(.transferFailed(id, String(describing: error), relay.folder))
        }
    }
    fileprivate func downloadProgress(_ id: UUID, downloaded: Int64, maximum: Int64) {
        guard let relay = downloads[id], relay.continuation != nil else { return }
        onEvent(.transferProgress(id, max(0, downloaded), max(0, maximum)))
    }

    // ImageCaptureCore's Objective-C delegates predate Swift isolation. Calls are
    // initiated on MainActor. @preconcurrency conformances retain dynamic actor
    // checks rather than making camera objects @unchecked Sendable or hopping
    // non-Sendable device/file objects to unstructured background tasks.
    func deviceBrowser(_ browser: ICDeviceBrowser, didAdd device: ICDevice, moreComing: Bool) {
        guard !stopped, let camera = device as? ICCameraDevice else { return }
        let key = ObjectIdentifier(camera); guard deviceIDs[key] == nil else { return }
        let id = UUID(); deviceIDs[key] = id; cameras[id] = camera
        onEvent(.deviceDiscovered(describe(camera, id: id)))
    }
    func deviceBrowser(_ browser: ICDeviceBrowser, didRemove device: ICDevice, moreGoing: Bool) { removeDevice(device) }
    func didRemove(_ device: ICDevice) { removeDevice(device) }
    private func removeDevice(_ device: ICDevice) {
        guard let id = deviceIDs.removeValue(forKey: ObjectIdentifier(device)) else { return }
        if selectedID == id {
            cancelActiveDownload(reason: Failure.disconnected); activeTransferID = nil
            finishSessionWait(.failure(Failure.disconnected)); clearSession()
        }
        cameras.removeValue(forKey: id); device.delegate = nil; onEvent(.deviceRemoved(id))
    }
    private func clearSession() {
        state = .idle; selectedID = nil; sessionID = nil; catalogComplete = false
        objects.removeAll(); objectIDs.removeAll()
    }
    func device(_ device: ICDevice, didOpenSessionWithError error: (any Error)?) {
        guard deviceIDs[ObjectIdentifier(device)] == selectedID, selectedID != nil else { return }
        guard state == .opening, !stopped else { device.requestCloseSession(); return }
        if let error { state = .faulted; finishSessionWait(.failure(error)); device.requestCloseSession(); return }
        state = .ready; finishSessionWait(.success(()))
        if let id = selectedID, let sessionID {
            onEvent(.sessionOpened(id, sessionID))
            if catalogComplete { onEvent(.catalogReady(id, sessionID)) }
        }
    }
    func device(_ device: ICDevice, didCloseSessionWithError error: (any Error)?) {
        guard let id = selectedID, deviceIDs[ObjectIdentifier(device)] == id else { return }
        cancelActiveDownload(reason: Failure.sessionClosed)
        if let error { state = .faulted; finishSessionWait(.failure(error)); onEvent(.transportError(id, String(describing: error))); return }
        activeTransferID = nil
        let expected = state == .closing
        finishSessionWait(expected ? .success(()) : .failure(Failure.sessionClosed)); clearSession()
        onEvent(.sessionClosed(id))
    }
    func device(_ device: ICDevice, didEncounterError error: (any Error)?) {
        guard let error else { return }; let id = deviceIDs[ObjectIdentifier(device)]
        if id != nil, id == selectedID { cancelActiveDownload(reason: error); finishSessionWait(.failure(error)); state = .faulted }
        onEvent(.transportError(id, String(describing: error)))
    }
    func deviceDidBecomeReady(withCompleteContentCatalog device: ICCameraDevice) {
        guard let id = selectedID, deviceIDs[ObjectIdentifier(device)] == id, let sessionID,
              state == .opening || state == .ready else { return }
        catalogComplete = true
        for case let file as ICCameraFile in device.mediaFiles ?? [] { register(file, camera: device) }
        if state == .ready { onEvent(.catalogReady(id, sessionID)) }
        onEvent(.deviceChanged(describe(device, id: id)))
    }
    func cameraDevice(_ camera: ICCameraDevice, didAdd items: [ICCameraItem]) {
        guard deviceIDs[ObjectIdentifier(camera)] == selectedID, state == .opening || state == .ready else { return }
        for case let file as ICCameraFile in items { register(file, camera: camera) }
    }
    private func register(_ file: ICCameraFile, camera: ICCameraDevice) {
        guard let id = selectedID, let sessionID else { return }
        let key = ObjectIdentifier(file); guard objectIDs[key] == nil else { return }
        let objectID = UUID()
        let reference = CameraObject(deviceID: id, sessionID: sessionID, objectID: objectID,
            reportedDeviceUUID: camera.uuidString, ptpObjectHandle: file.ptpObjectHandle == 0 ? nil : file.ptpObjectHandle,
            originalName: file.name, reportedBytes: Int64(file.fileSize), isRAW: file.isRaw,
            addedAfterCatalog: file.wasAddedAfterContentCatalogCompleted)
        objectIDs[key] = objectID; objects[objectID] = ObjectEntry(file: file, reference: reference)
        onEvent(.fileAdded(reference))
    }
    func cameraDevice(_ camera: ICCameraDevice, didRemove items: [ICCameraItem]) {
        for item in items {
            guard let id = objectIDs.removeValue(forKey: ObjectIdentifier(item)), let entry = objects.removeValue(forKey: id) else { continue }
            if let transferID = activeTransferID, downloads[transferID]?.item.reference.objectID == id { cancelTransfer(transferID, reason: Failure.unknownObject) }
            onEvent(.fileRemoved(entry.reference))
        }
    }
    func cameraDevice(_ camera: ICCameraDevice, didRenameItems items: [ICCameraItem]) {
        for case let file as ICCameraFile in items {
            guard let id = objectIDs[ObjectIdentifier(file)], let entry = objects[id] else { continue }
            let old = entry.reference
            let updated = CameraObject(deviceID: old.deviceID, sessionID: old.sessionID, objectID: id,
                reportedDeviceUUID: old.reportedDeviceUUID, ptpObjectHandle: old.ptpObjectHandle,
                originalName: file.name, reportedBytes: Int64(file.fileSize), isRAW: file.isRaw, addedAfterCatalog: old.addedAfterCatalog)
            objects[id] = ObjectEntry(file: file, reference: updated); onEvent(.fileRenamed(updated))
        }
    }
    func cameraDeviceDidChangeCapability(_ camera: ICCameraDevice) {
        if let id = deviceIDs[ObjectIdentifier(camera)] { onEvent(.deviceChanged(describe(camera, id: id))) }
    }
    func cameraDeviceDidEnableAccessRestriction(_ device: ICDevice) {
        if deviceIDs[ObjectIdentifier(device)] == selectedID, selectedID != nil {
            cancelActiveDownload(reason: Failure.accessRestricted); finishSessionWait(.failure(Failure.accessRestricted)); state = .faulted
        }
        onEvent(.transportError(deviceIDs[ObjectIdentifier(device)], "Camera access restricted"))
    }
    func cameraDeviceDidRemoveAccessRestriction(_ device: ICDevice) {
        if let camera = device as? ICCameraDevice, let id = deviceIDs[ObjectIdentifier(device)] { onEvent(.deviceChanged(describe(camera, id: id))) }
    }
    func cameraDevice(_ camera: ICCameraDevice, didReceivePTPEvent eventData: Data) {
        // No invented vendor packet decoding, capture acknowledgement or pairing.
    }
    func cameraDevice(_ camera: ICCameraDevice, didReceiveThumbnail thumbnail: CGImage?, for item: ICCameraItem, error: (any Error)?) {
        // No thumbnail requested: original-file notification/download transport only.
    }
    func cameraDevice(_ camera: ICCameraDevice, didReceiveMetadata metadata: [AnyHashable: Any]?, for item: ICCameraItem, error: (any Error)?) {
        // Metadata remains descriptive; no identity or original-integrity claim.
    }

    @MainActor
    private final class DownloadRelay: NSObject, @preconcurrency ICCameraDeviceDownloadDelegate {
        weak var owner: TetherImageCapture?
        let id: UUID
        let item: ObjectEntry
        let folder: URL
        var continuation: CheckedContinuation<Download, any Error>?
        var timeout: Task<Void, Never>?
        var cancelled = false
        init(owner: TetherImageCapture, id: UUID, item: ObjectEntry, folder: URL,
             continuation: CheckedContinuation<Download, any Error>) {
            self.owner = owner; self.id = id; self.item = item; self.folder = folder; self.continuation = continuation
            super.init()
        }
        @objc func didDownloadFile(_ file: ICCameraFile, error: (any Error)?, options: [String: Any], contextInfo: UnsafeMutableRawPointer?) {
            owner?.downloadFinished(id, file: file, error: error, options: options)
        }
        func didReceiveDownloadProgress(for file: ICCameraFile, downloadedBytes: off_t, maxBytes: off_t) {
            guard file === item.file else { return }; owner?.downloadProgress(id, downloaded: Int64(downloadedBytes), maximum: Int64(maxBytes))
        }
    }
}
#endif
