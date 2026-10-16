import Foundation
import SuiteCore
#if canImport(SuiteFaceCore)
import SuiteFaceCore
#endif

/// Local synchronous native calls run on this non-main actor's serial executor.
/// No enrollment, image upload, automatic identity assignment or fallback runtime.
actor LocalFaceInference {
    static let pixelPreparationVersion = LocalFacePixels.preprocessingVersion
    static let detectorPreprocessingVersion = PinnedFaceModels.detectorPreprocessingVersion
    static let recognizerPreprocessingVersion = PinnedFaceModels.recognizerPreprocessingVersion
    enum InferenceError: Error {
        case unavailable, incompatibleManifest, invalidPixels, invalidResult, native(Int64)
    }
    struct DetectedFace: Sendable {
        /// x,y,w,h; right eye; left eye; nose; right/left mouth corners; score.
        /// Analysis pixels, top-left origin; not an original-space mask/mesh.
        let detectorRow: [Float]
        let embedding: FaceIdentity.Embedding
    }
    struct Configuration: Sendable, Equatable {
        let detector: LocalAIModelManifest
        let recognizer: LocalAIModelManifest
        let scoreThreshold: Float
        let nmsThreshold: Float
        let topK: Int32
        let maximumAnalysisPixels: UInt64
    }
    private let store: LocalAIModelStore
    private let configuration: Configuration
    private let isPoolWorker: Bool
    #if canImport(SuiteFaceCore)
    // No pointer escapes this actor. Wrapper releases when last reference ends;
    // synchronous calls retain it, so destruction never overlaps a native call.
    private final class NativeContext: @unchecked Sendable {
        let pointer: OpaquePointer
        init(_ pointer: OpaquePointer) { self.pointer = pointer }
        deinit { sf_destroy(pointer) }
    }
    private var context: NativeContext?
    #endif

    init(store: LocalAIModelStore, configuration: Configuration) throws {
        try Self.validate(configuration)
        self.store = store
        self.configuration = configuration
        self.isPoolWorker = false
    }

    /// Only the pool creates workers; public instances never retain native contexts.
    init(poolWorkerStore store: LocalAIModelStore, configuration: Configuration) throws {
        try Self.validate(configuration)
        self.store = store
        self.configuration = configuration
        self.isPoolWorker = true
    }

    /// Caller retains image provenance/inverse transform and rejects stale results.
    /// Cancellation is checked before/after C inference; C cannot interrupt DNN.
    func analyze(bgr: Data, width: Int, height: Int, stride: Int,
                 pixelPreparationVersion: String) async throws -> [DetectedFace] {
        try Task.checkCancellation()
        if !isPoolWorker {
            return try await LocalFaceInferencePool.shared.analyze(store: store, configuration: configuration,
                bgr: bgr, width: width, height: height, stride: stride,
                pixelPreparationVersion: pixelPreparationVersion)
        }
        guard pixelPreparationVersion == Self.pixelPreparationVersion,
              width > 0, height > 0, width <= Int(Int32.max), height <= Int(Int32.max),
              width <= Int.max / 3, stride >= width * 3,
              stride <= Int.max / height, bgr.count == stride * height,
              UInt64(width) * UInt64(height) <= configuration.maximumAnalysisPixels else {
            throw InferenceError.invalidPixels
        }
        #if canImport(SuiteFaceCore)
        let native = try await loadedContext()
        try Task.checkCancellation()
        var result: OpaquePointer?
        let status = bgr.withUnsafeBytes { bytes in
            sf_analyze(native.pointer, bytes.bindMemory(to: UInt8.self).baseAddress,
                       bgr.count, Int32(width), Int32(height), stride, &result)
        }
        defer { if let result { sf_result_destroy(result) } }
        try check(status)
        try Task.checkCancellation()
        guard let result else { throw InferenceError.invalidResult }
        let count = sf_result_count(result)
        guard count <= Int(configuration.topK), count <= 512 else {
            throw InferenceError.invalidResult
        }
        var output: [DetectedFace] = []
        output.reserveCapacity(count)
        for index in 0..<count {
            try Task.checkCancellation()
            var face = sf_face()
            try check(sf_result_face(result, index, &face))
            let row = withUnsafeBytes(of: &face.values) { Array($0.bindMemory(to: Float.self)) }
            guard row.count == 15, row.allSatisfy(\.isFinite) else { throw InferenceError.invalidResult }
            var dimension = 0
            try check(sf_result_feature(result, index, nil, 0, &dimension))
            guard dimension == 128 else { throw InferenceError.invalidResult }
            var values = [Float](repeating: 0, count: dimension)
            let featureStatus = values.withUnsafeMutableBufferPointer { buffer in
                sf_result_feature(result, index, buffer.baseAddress, buffer.count, &dimension)
            }
            try check(featureStatus)
            guard dimension == 128 else { throw InferenceError.invalidResult }
            let embedding = try FaceIdentity.Embedding(
                modelSHA256: configuration.recognizer.expectedSHA256,
                preprocessingVersion: Self.recognizerPreprocessingVersion,
                rawValues: values)
            output.append(DetectedFace(detectorRow: row, embedding: embedding))
        }
        try Task.checkCancellation()
        return output
        #else
        throw InferenceError.unavailable
        #endif
    }

    #if canImport(SuiteFaceCore)
    private func loadedContext() async throws -> NativeContext {
        if let context { return context }
        let detector = try await store.verifiedAsset(manifest: configuration.detector)
        let recognizer = try await store.verifiedAsset(manifest: configuration.recognizer)
        try Task.checkCancellation()
        // Reentrancy at store awaits can let another request complete the load.
        if let context { return context }
        guard configuration.detector.matchesMeasuredAsset(sha256: detector.sha256, byteCount: detector.byteCount),
              configuration.recognizer.matchesMeasuredAsset(sha256: recognizer.sha256, byteCount: recognizer.byteCount),
              detector.url.isFileURL, recognizer.url.isFileURL,
              !detector.url.path.utf8.contains(0), !recognizer.url.path.utf8.contains(0) else {
            throw InferenceError.incompatibleManifest
        }
        var pointer: OpaquePointer?
        let status = detector.url.path.withCString { d in
            recognizer.url.path.withCString { r in
                sf_create(d, r, configuration.scoreThreshold, configuration.nmsThreshold,
                          configuration.topK, configuration.maximumAnalysisPixels, &pointer)
            }
        }
        guard status == SF_OK, let pointer else {
            if let pointer { sf_destroy(pointer) }
            throw InferenceError.native(Int64(status.rawValue))
        }
        let loaded = NativeContext(pointer)
        try Task.checkCancellation()
        context = loaded
        return loaded
    }
    private func check(_ status: sf_status) throws {
        guard status == SF_OK else { throw InferenceError.native(Int64(status.rawValue)) }
    }
    #endif

    private static func validate(_ config: Configuration) throws {
        try config.detector.validate()
        try config.recognizer.validate()
        let d = config.detector, r = config.recognizer
        let expectedDetector = try PinnedFaceModels.yuNet()
        let expectedRecognizer = try PinnedFaceModels.sFace()
        guard d.expectedSHA256.lowercased() == PinnedFaceModels.yuNetSHA256,
              d.expectedByteCount == 232589,
              r.expectedSHA256.lowercased() == PinnedFaceModels.sFaceSHA256,
              r.expectedByteCount == 38696353,
              d.format.lowercased() == "onnx", r.format.lowercased() == "onnx",
              d.runtimeVersion == PinnedFaceModels.runtimeVersion, r.runtimeVersion == PinnedFaceModels.runtimeVersion,
              d.inputs == expectedDetector.inputs, d.outputs == expectedDetector.outputs,
              r.inputs == expectedRecognizer.inputs, r.outputs == expectedRecognizer.outputs,
              d.imageInput.preprocessingVersion == detectorPreprocessingVersion,
              r.imageInput.preprocessingVersion == recognizerPreprocessingVersion,
              d.imageInput.colorOrder == .bgr, d.imageInput.resize == .none,
              r.imageInput.colorOrder == .rgb, r.imageInput.resize == .alignedFace,
              [d, r].allSatisfy({ $0.imageInput.scale == 1 && $0.imageInput.mean == [0, 0, 0]
                  && $0.imageInput.standardDeviation == [1, 1, 1] }),
              config.scoreThreshold.isFinite, config.scoreThreshold > 0, config.scoreThreshold <= 1,
              config.nmsThreshold.isFinite, config.nmsThreshold > 0, config.nmsThreshold <= 1,
              config.topK > 0, config.topK <= 512,
              config.maximumAnalysisPixels > 0, config.maximumAnalysisPixels <= 67108864 else {
            throw InferenceError.incompatibleManifest
        }
        // License reviews may be supplied independently; inference compatibility
        // does not turn an unreviewed distribution permission into confirmed.
    }
}
