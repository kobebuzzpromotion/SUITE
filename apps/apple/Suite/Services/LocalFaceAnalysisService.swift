import Foundation
import CryptoKit
import SuiteCore

/// Local analysis orchestration only. No enrollment, persistence or automatic
/// retouch. An input proxy's transform to the original is NOT known here.
actor LocalFaceAnalysisService {
    enum ServiceError: Error { case invalidPreparedImage, staleGeneration, requestLimit, duplicateDetection }
    struct Face: Sendable {
        let target: FaceIdentity.PhotoFaceID
        /// Full YuNet row (15 floats), top-left analysis pixels.
        let analysisGeometry: [Float]
        /// Same row mapped to supplied upright input pixels, NOT original RAW.
        /// Values may extend outside image at edges; no silent clamping.
        let inputGeometry: [Double]
        let embedding: FaceIdentity.Embedding
    }
    struct Analysis: Sendable {
        let generation: UUID
        let assetID: UUID
        let originalSHA256: String
        let analysisSHA256: String
        let analysisVersion: String
        let analysisWidth: Int
        let analysisHeight: Int
        let inputWidth: Int
        let inputHeight: Int
        let faces: [Face]
    }
    struct MatchedAnalysis: Sendable {
        let analysis: Analysis
        let matches: [FaceIdentity.Match]
    }
    private struct Key: Hashable, Sendable {
        let generation: UUID
        let assetID: UUID
        let originalSHA256: String
        let analysisSHA256: String
        let width: Int
        let height: Int
        let stride: Int
        let inputWidth: Int
        let inputHeight: Int
        let pixelPreparation: String
        let detectorSHA256: String
        let recognizerSHA256: String
        let detectorPreparation: String
        let recognizerPreparation: String
        let scoreThreshold: Float
        let nmsThreshold: Float
        let topK: Int32
        let maximumPixels: UInt64
        // This service always requests YuNet geometry AND SFace embeddings.
        let analysisKind = "yunet-5point-and-sface128-v1"
    }
    private let inference: LocalFaceInference
    private let config: LocalFaceInference.Configuration
    private let cache: LocalAnalysisCache<Key, Analysis>
    private var generation = UUID()
    private var outstandingRequests = 0

    /// Thresholds are explicit caller choices, not a calibrated identity policy.
    /// One model pair and config per service lifetime; changing them creates a
    /// new service. Cache holds at most 32 results / 8MiB, never image buffers.
    /// One loader at a time; competing different images fail with inFlightLimit
    /// so a bounded caller queue can retry, never unbounded parallel native work.
    init(store: LocalAIModelStore, scoreThreshold: Float, nmsThreshold: Float,
         topK: Int32 = 128, maximumAnalysisPixels: UInt64 = 2_560_000) throws {
        let configuration = LocalFaceInference.Configuration(
            detector: try PinnedFaceModels.yuNet(), recognizer: try PinnedFaceModels.sFace(),
            scoreThreshold: scoreThreshold, nmsThreshold: nmsThreshold, topK: topK,
            maximumAnalysisPixels: maximumAnalysisPixels)
        self.config = configuration
        self.inference = try LocalFaceInference(store: store, configuration: configuration)
        self.cache = try LocalAnalysisCache(maximumEntries: 32, maximumBytes: 8 * 1024 * 1024,
                                           maximumInFlight: 1, maximumWaitersPerFlight: 8)
    }

    /// Use on project/photo-scope replacement and revoked permission. Caller must
    /// also discard already-delivered UI values. No disk deletion is performed.
    @discardableResult
    func beginNewGeneration() async -> UUID {
        let next = UUID()
        generation = next
        await cache.beginNewGeneration()
        return next
    }

    func analyze(_ prepared: LocalFacePixels.Prepared) async throws -> Analysis {
        try Task.checkCancellation()
        guard outstandingRequests < 8 else { throw ServiceError.requestLimit }
        outstandingRequests += 1
        defer { outstandingRequests -= 1 }
        try validate(prepared)
        let epoch = generation
        let key = Key(generation: epoch, assetID: prepared.assetID,
                      originalSHA256: prepared.originalSHA256, analysisSHA256: prepared.analysisSHA256,
                      width: prepared.width, height: prepared.height, stride: prepared.stride,
                      inputWidth: prepared.inputWidth, inputHeight: prepared.inputHeight,
                      pixelPreparation: prepared.preprocessingVersion,
                      detectorSHA256: config.detector.expectedSHA256,
                      recognizerSHA256: config.recognizer.expectedSHA256,
                      detectorPreparation: config.detector.imageInput.preprocessingVersion,
                      recognizerPreparation: config.recognizer.imageInput.preprocessingVersion,
                      scoreThreshold: config.scoreThreshold, nmsThreshold: config.nmsThreshold,
                      topK: config.topK, maximumPixels: config.maximumAnalysisPixels)
        let engine = inference
        let version = Self.analysisVersion(key)
        let analysis = try await cache.value(for: key) {
            let detected = try await engine.analyze(bgr: prepared.bgr, width: prepared.width,
                height: prepared.height, stride: prepared.stride,
                pixelPreparationVersion: prepared.preprocessingVersion)
            try Task.checkCancellation()
            let sx = prepared.inputPixelsPerAnalysisPixelX
            let sy = prepared.inputPixelsPerAnalysisPixelY
            var seenIDs = Set<UUID>()
            let faces = try detected.map { detection -> Face in
                try Task.checkCancellation()
                let row = detection.detectorRow
                var input = row.map(Double.init)
                // bbox dimensions and all five point pairs use separate rounded scales.
                for index in 0..<14 { input[index] *= index.isMultiple(of: 2) ? sx : sy }
                let targetID = Self.targetID(version: version, prepared: prepared, detectorRow: row)
                guard seenIDs.insert(targetID).inserted else { throw ServiceError.duplicateDetection }
                let target = try FaceIdentity.PhotoFaceID(assetID: prepared.assetID,
                    originalSHA256: prepared.originalSHA256, faceTargetID: targetID)
                return Face(target: target, analysisGeometry: row, inputGeometry: input,
                            embedding: detection.embedding)
            }
            let value = Analysis(generation: epoch, assetID: prepared.assetID,
                originalSHA256: prepared.originalSHA256, analysisSHA256: prepared.analysisSHA256,
                analysisVersion: version,
                analysisWidth: prepared.width, analysisHeight: prepared.height,
                inputWidth: prepared.inputWidth, inputHeight: prepared.inputHeight, faces: faces)
            // Conservative retained size incl arrays, UUIDs, strings and metadata.
            // Prepared BGR stays only in the flight closure, not the cached value.
            return .init(value: value, byteCost: 4096 + faces.count * 4096)
        }
        try Task.checkCancellation()
        guard generation == epoch, analysis.generation == epoch else { throw ServiceError.staleGeneration }
        return analysis
    }

    /// Gallery/consent owner supplies a current explicit snapshot each call.
    /// Matching is deliberately NOT cached, even if analysis pixels are unchanged.
    func match(_ prepared: LocalFacePixels.Prepared, gallery: [FaceIdentity.GalleryEntry],
               policy: FaceIdentity.Policy) async throws -> MatchedAnalysis {
        let epoch = generation
        let analysis = try await analyze(prepared)
        try Task.checkCancellation()
        guard generation == epoch else { throw ServiceError.staleGeneration }
        let matches = try FaceIdentity.matchPhoto(analysis.faces.map {
            FaceIdentity.Observation(target: $0.target, embedding: $0.embedding)
        }, gallery: gallery, policy: policy)
        try Task.checkCancellation()
        guard generation == epoch else { throw ServiceError.staleGeneration }
        return MatchedAnalysis(analysis: analysis, matches: matches)
    }

    private func validate(_ p: LocalFacePixels.Prepared) throws {
        guard p.preprocessingVersion == LocalFacePixels.preprocessingVersion,
              p.width > 0, p.height > 0, p.inputWidth >= p.width, p.inputHeight >= p.height,
              p.width <= Int(Int32.max), p.height <= Int(Int32.max),
              p.width <= Int.max / 3, p.stride == p.width * 3,
              p.stride <= Int.max / p.height, p.bgr.count == p.stride * p.height,
              UInt64(p.width) * UInt64(p.height) <= config.maximumAnalysisPixels,
              p.originalSHA256.utf8.count == 64,
              p.originalSHA256.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else {
            throw ServiceError.invalidPreparedImage
        }
        // Prepared is internal, but do not accept a forged/stale digest as a
        // cache key when the actual bytes differ. Original digest remains caller evidence.
        let actual = SHA256.hash(data: p.bgr).map { String(format: "%02x", $0) }.joined()
        guard actual == p.analysisSHA256 else { throw ServiceError.invalidPreparedImage }
    }

    /// Length-prefixed UTF-8 fields avoid locale-dependent formatting, dictionary
    /// ordering, separator ambiguity and Swift's randomized Hasher. Float fields
    /// use their UInt32 bitPattern, not decimal approximation. Generation is NOT
    /// part of the contract: a cancelled run may be reproduced after restart.
    private static func digest(_ fields: [String]) -> SHA256.Digest {
        var hash = SHA256()
        for field in fields {
            let data = Data(field.utf8)
            var length = UInt64(data.count).bigEndian
            withUnsafeBytes(of: &length) { hash.update(data: Data($0)) }
            hash.update(data: data)
        }
        return hash.finalize()
    }

    private static func analysisVersion(_ key: Key) -> String {
        let fields = [
            "suite-local-face-analysis-contract-v2", key.analysisKind,
            key.assetID.uuidString.lowercased(), key.originalSHA256, key.analysisSHA256,
            String(key.width), String(key.height), String(key.stride),
            String(key.inputWidth), String(key.inputHeight), "upright-unmirrored-top-left",
            key.pixelPreparation, key.detectorSHA256, key.recognizerSHA256,
            key.detectorPreparation, key.recognizerPreparation,
            PinnedFaceModels.runtimeVersion, "SuiteFaceCore-C-ABI-1-cpu-opencv",
            ProcessInfo.processInfo.operatingSystemVersionString,
            String(key.scoreThreshold.bitPattern), String(key.nmsThreshold.bitPattern),
            String(key.topK), String(key.maximumPixels)
        ]
        return "local-face-v2:" + digest(fields).map { String(format: "%02x", $0) }.joined()
    }

    /// Photo-local content identity, NOT a cross-photo person identifier. Any
    /// changed geometry/score bit changes this ID; unstable runtime results thus
    /// require explicit reassignment instead of inheriting somebody's correction.
    /// UUID v8 custom namespace uses SHA-256, never the observation array index.
    private static func targetID(version: String, prepared: LocalFacePixels.Prepared,
                                 detectorRow: [Float]) -> UUID {
        let fields = ["suite-photo-face-target-v2", version,
                      prepared.assetID.uuidString.lowercased(), prepared.originalSHA256,
                      prepared.analysisSHA256] + detectorRow.map { String($0.bitPattern) }
        var bytes = Array(digest(fields).prefix(16))
        bytes[6] = (bytes[6] & 0x0f) | 0x80
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        return UUID(uuid: (bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
                           bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]))
    }
}
