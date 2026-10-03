import Foundation
import CoreImage
import CryptoKit
import Darwin
import SuiteCore

private struct Input: Decodable {
    struct Manifest: Decodable {
        struct File: Decodable {let relativePath: String; let sha256: String; let bytes: Int}
        let datasetRoot: String
        let manifestChecksum: String
        let files: [File]
    }
    let schemaVersion: Int
    let kind: String
    let runId: UUID
    let manifest: Manifest
    let workDirectory: String
    let originalPolicy: String
    let exportPolicy: String
}
private enum QAFailure: Error {case invalidRequest, unsafePath, checksumMismatch, unsupportedRAW, recoveryFailed}

@main
struct RawQAAdapter {
    static func main() async {
        do {try await run()}
        catch {
            FileHandle.standardError.write(Data("Native QA incomplete: \(error)\n".utf8))
            exit(1)
        }
    }
    private static func emit(_ value: [String: Any]) throws {
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        FileHandle.standardOutput.write(data + Data([10]))
    }
    private static func checksum(_ url: URL) throws -> String {
        let file = try FileHandle(forReadingFrom: url); defer {try? file.close()}
        var hash = SHA256()
        while let data = try file.read(upToCount: 1024 * 1024), !data.isEmpty {try Task.checkCancellation(); hash.update(data: data)}
        return hash.finalize().map {String(format: "%02x", $0)}.joined()
    }
    private static func bytes(_ root: URL) throws -> Int {
        guard FileManager.default.fileExists(atPath: root.path) else {return 0}
        let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey, .fileSizeKey])!
        var total = 0
        for case let file as URL in enumerator {
            let values = try file.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
            if values.isRegularFile == true {total += values.fileSize ?? 0}
        }
        return total
    }
    private static func contains(_ child: URL, in parent: URL) -> Bool {
        child.pathComponents.starts(with: parent.pathComponents)
    }
    private static func run() async throws {
        let input = try JSONDecoder().decode(Input.self, from: FileHandle.standardInput.readDataToEndOfFile())
        guard input.schemaVersion == 1, input.kind == "SUITE_REAL_RAW_BATCH", !input.manifest.files.isEmpty,
              input.originalPolicy == "READ_ONLY_NO_MUTATION", input.exportPolicy == "ORIGINAL_ONLY_NO_PROXY_FALLBACK" else {throw QAFailure.invalidRequest}
        let sourceRoot = URL(fileURLWithPath: input.manifest.datasetRoot).standardizedFileURL.resolvingSymlinksInPath()
        let work = URL(fileURLWithPath: input.workDirectory).standardizedFileURL.resolvingSymlinksInPath()
        guard !contains(work, in: sourceRoot), !contains(sourceRoot, in: work) else {throw QAFailure.unsafePath}
        let root = work.appendingPathComponent(input.runId.uuidString)
        guard !FileManager.default.fileExists(atPath: root.path) else {throw QAFailure.unsafePath}
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let pipeline = PhotoPipeline(root: root)
        let metadata = root.appendingPathComponent("Recipes")
        let store = try ProjectStore(directory: metadata)
        let beforeDB = try bytes(metadata)
        var beforeUsage = rusage(); guard getrusage(RUSAGE_SELF, &beforeUsage) == 0 else {throw QAFailure.invalidRequest}
        try emit(["type": "environment", "schemaVersion": 1, "kind": "mac-native", "platform": "macOS", "osVersion": ProcessInfo.processInfo.operatingSystemVersionString, "adapterVersion": "suite-local-qa-v1", "rawDecoder": "CIRAWFilter runtime candidate; each input checked"])
        var importMs = 0.0, proxyMs = 0.0, fetchMs = 0.0, prepMs = 0.0, recoveryMs = 0.0
        var failures = 0, retries = 0, completed = 0, active = 0, peakConcurrency = 0
        for file in input.manifest.files {
            active += 1; peakConcurrency = max(peakConcurrency, active)
            var imported: PhotoPipeline.ImportMeasurement?
            var fixedCheckpoint: ProjectCheckpoint?
            var fixedPlan: ExportPlan?
            // QA-only bounded retry: repeat a transient filesystem operation once, keeping fixed export input.
            for attempt in 0...1 {
            do {
                let source = sourceRoot.appendingPathComponent(file.relativePath).standardizedFileURL.resolvingSymlinksInPath()
                guard contains(source, in: sourceRoot), source != sourceRoot else {throw QAFailure.unsafePath}
                guard try checksum(source) == file.sha256,
                      (try FileManager.default.attributesOfItem(atPath: source.path)[.size] as? NSNumber)?.intValue == file.bytes else {throw QAFailure.checksumMismatch}
                // No JPEG/TIFF fixture can be counted as RAW. Runtime decoder must accept this actual input.
                guard let raw = CIRAWFilter(imageURL: source), raw.outputImage != nil else {throw QAFailure.unsupportedRAW}
                if imported == nil {
                    imported = try await pipeline.importMeasured(source, proxyLongEdge: 2048)
                    importMs += imported!.importTimeMs; proxyMs += imported!.proxyGenerationTimeMs
                }
                let measured = imported!
                // 2048 is an explicit QA workload, not a fixed product proxy policy or measured optimum.
                if fixedCheckpoint == nil {fixedCheckpoint = ProjectCheckpoint(asset: measured.asset, history: EditHistory(parameters: .init(exposure: 0.25)), revision: 0)}
                let checkpoint = fixedCheckpoint!
                let metadataStart = ProcessInfo.processInfo.systemUptime
                if try await store.load(id: measured.asset.id) == nil {try await store.save(checkpoint, expectedRevision: nil)}
                importMs += (ProcessInfo.processInfo.systemUptime - metadataStart) * 1000
                let prepStart = ProcessInfo.processInfo.systemUptime
                if fixedPlan == nil {fixedPlan = try ExportPlan(checkpoint: checkpoint, format: .jpeg)}
                let plan = fixedPlan!
                let original = root.appendingPathComponent(measured.asset.originalRelativePath)
                let destination = root.appendingPathComponent("Exports/\(plan.id.uuidString).jpg")
                let request = try RAWRenderRequest(plan: plan, originalURL: original, destinationURL: destination)
                prepMs += (ProcessInfo.processInfo.systemUptime - prepStart) * 1000
                let fetchStart = ProcessInfo.processInfo.systemUptime
                try await pipeline.validate(request)
                fetchMs += (ProcessInfo.processInfo.systemUptime - fetchStart) * 1000
                // Local checksum/read preparation latency only; NOT cloud network latency.
                if !FileManager.default.fileExists(atPath: destination.path) {_ = try await pipeline.render(request)}
                let recoveryStart = ProcessInfo.processInfo.systemUptime
                let reopened = try ProjectStore(directory: metadata)
                guard try await reopened.load(id: measured.asset.id) == checkpoint else {throw QAFailure.recoveryFailed}
                guard try checksum(source) == file.sha256, try checksum(original) == file.sha256 else {throw QAFailure.checksumMismatch}
                recoveryMs += (ProcessInfo.processInfo.systemUptime - recoveryStart) * 1000
                let stages = Dictionary(uniqueKeysWithValues: ["import", "proxyGeneration", "originalFetch", "exportPreparation", "finalExport", "cleanupRecovery"].map {($0, "PASS")})
                try emit(["type": "assetComplete", "relativePath": file.relativePath, "sourceSha256": file.sha256,
                    "rawDecoded": true, "originalUnchanged": true, "recipeReloaded": true, "exportInputFixed": true,
                    "exportInput": ["representation": "original", "sourceSha256": plan.originalSHA256, "recipeRevision": plan.recipeRevision],
                    "stages": stages, "evidence": "\(destination.path); local-original validation; metadata reopen, not crash recovery; JPEG only"])
                completed += 1
                break
            } catch {
                failures += 1
                let native = error as NSError
                let retryable = native.domain == NSCocoaErrorDomain || native.domain == NSPOSIXErrorDomain
                FileHandle.standardError.write(Data("Asset attempt \(attempt) failed (preserved): \(file.relativePath): \(error)\n".utf8))
                if attempt == 0 && retryable {retries += 1; continue}
                break
            }
            }
            active -= 1
        }
        var usage = rusage(); guard getrusage(RUSAGE_SELF, &usage) == 0 else {throw QAFailure.invalidRequest}
        func micros(_ time: timeval) -> Int {Int(time.tv_sec) * 1_000_000 + Int(time.tv_usec)}
        let values: [(String, Double, String, String)] = [
            ("importTimeMs", importMs, "ms", "copy/hash/metadata commit total"),
            ("proxyGenerationTimeMs", proxyMs, "ms", "CIRAWFilter proxy generation total; explicit QA edge 2048"),
            ("peakMemoryBytes", Double(usage.ru_maxrss), "bytes", "macOS getrusage peak process RSS"),
            ("diskCacheBytes", Double(try bytes(root)), "bytes", "entire QA work directory, originals + proxies + outputs + metadata"),
            ("dbGrowthBytes", Double(try bytes(metadata) - beforeDB), "bytes", "ProjectStore JSON metadata growth, NOT backend SQLite"),
            ("cpuUserMicros", Double(micros(usage.ru_utime) - micros(beforeUsage.ru_utime)), "microseconds", "worker getrusage user delta"),
            ("cpuSystemMicros", Double(micros(usage.ru_stime) - micros(beforeUsage.ru_stime)), "microseconds", "worker getrusage system delta"),
            ("concurrency", Double(peakConcurrency), "count", "observed active serial jobs"),
            ("failureCount", Double(failures), "count", "actual catch count"),
            ("retryCount", Double(retries), "count", "actual bounded filesystem retry count; fixed checkpoint/plan retained"),
            ("originalFetchLatencyMs", fetchMs, "ms", "LOCAL checksum validation total; CLOUD FETCH NOT TESTED"),
            ("exportPreparationTimeMs", prepMs, "ms", "frozen ExportPlan creation total"),
            ("cleanupRecoveryTimeMs", recoveryMs, "ms", "metadata reopen + unchanged source verification; CRASH/OS RECOVERY NOT TESTED")
        ]
        for (name, value, unit, evidence) in values {try emit(["type": "measurement", "name": name, "value": value, "unit": unit, "evidence": evidence])}
        try emit(["type": "batchComplete", "status": completed == input.manifest.files.count ? "PASS" : "FAIL", "fileCount": completed, "manifestChecksum": input.manifest.manifestChecksum])
    }
}
