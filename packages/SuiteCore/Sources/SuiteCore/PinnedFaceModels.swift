import Foundation

/// Expected metadata read from the pinned ONNX files, not proof of installation,
/// successful inference, enrollment consent or completed distribution review.
public enum PinnedFaceModels {
    public static let revision = "47534e27c9851bb1128ccc0102f1145e27f23f98"
    public static let runtimeVersion = "4.13.0"
    public static let yuNetSHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
    public static let sFaceSHA256 = "0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"
    public static let detectorPreprocessingVersion = "suite-opencv-4.13.0-yunet-bgr-v1"
    public static let recognizerPreprocessingVersion = "suite-opencv-4.13.0-sface-align-rgb-v1"

    public static func yuNet() throws -> LocalAIModelManifest {
        var outputs: [LocalAIModelManifest.Tensor] = []
        for (prefix, components) in [("cls", 1), ("obj", 1), ("bbox", 4), ("kps", 10)] {
            for (stride, count) in [(8, 6400), (16, 1600), (32, 400)] {
                outputs.append(.init(name: "\(prefix)_\(stride)", elementType: .float32,
                                     shape: [1, count, components], axes: ["batch", "cell", "component"]))
            }
        }
        return try LocalAIModelManifest(
            modelID: "opencv-zoo-yunet", fixedVersion: "2023mar-fp32@" + revision,
            sourceURL: source(folder: "face_detection_yunet", file: "face_detection_yunet_2023mar.onnx"),
            expectedSHA256: yuNetSHA256, expectedByteCount: 232589,
            format: "onnx", runtimeVersion: runtimeVersion,
            inputs: [.init(name: "input", elementType: .float32, shape: [1, 3, 640, 640],
                           axes: ["batch", "channel", "height", "width"])], outputs: outputs,
            imageInput: .init(colorOrder: .bgr, resize: .none,
                              preprocessingVersion: detectorPreprocessingVersion,
                              preprocessingReference: "docs/AI_MODEL_IO_2026-10-11.md#yunet",
                              scale: 1, mean: [0, 0, 0], standardDeviation: [1, 1, 1]),
            outputInterpretationReference: "docs/AI_MODEL_IO_2026-10-11.md#yunet",
            license: license(folder: "face_detection_yunet", identifier: "MIT"))
    }

    public static func sFace() throws -> LocalAIModelManifest {
        try LocalAIModelManifest(
            modelID: "opencv-zoo-sface", fixedVersion: "2021dec-fp32@" + revision,
            sourceURL: source(folder: "face_recognition_sface", file: "face_recognition_sface_2021dec.onnx"),
            expectedSHA256: sFaceSHA256, expectedByteCount: 38696353,
            format: "onnx", runtimeVersion: runtimeVersion,
            inputs: [.init(name: "data", elementType: .float32, shape: [1, 3, 112, 112],
                           axes: ["batch", "channel", "height", "width"])],
            outputs: [.init(name: "fc1", elementType: .float32, shape: [1, 128], axes: ["batch", "feature"])],
            imageInput: .init(colorOrder: .rgb, resize: .alignedFace,
                              preprocessingVersion: recognizerPreprocessingVersion,
                              preprocessingReference: "docs/AI_MODEL_IO_2026-10-11.md#sface",
                              scale: 1, mean: [0, 0, 0], standardDeviation: [1, 1, 1]),
            outputInterpretationReference: "docs/AI_MODEL_IO_2026-10-11.md#sface",
            license: license(folder: "face_recognition_sface", identifier: "Apache-2.0"))
    }

    private static func source(folder: String, file: String) -> URL {
        // Only static constants reach this helper; not user-supplied URL text.
        URL(string: "https://media.githubusercontent.com/media/opencv/opencv_zoo/\(revision)/models/\(folder)/\(file)")!
    }

    private static func license(folder: String, identifier: String) -> LocalAIModelManifest.License {
        let url = URL(string: "https://raw.githubusercontent.com/opencv/opencv_zoo/\(revision)/models/\(folder)/LICENSE")!
        let file = folder == "face_detection_yunet" ? "yunet-LICENSE.txt" : "sface-LICENSE.txt"
        return .init(identifier: identifier, sourceURL: url,
                     licenseTextReference: "artifacts/local-ai-models/licenses/" + file,
                     noticeReference: "docs/AI_MODEL_LICENSE_RECORD_2026-10-11.md",
                     commercialUse: .init(state: .unreviewed), redistribution: .init(state: .unreviewed))
    }
}
