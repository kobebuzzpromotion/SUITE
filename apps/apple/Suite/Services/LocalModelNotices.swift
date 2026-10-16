import Foundation
import SuiteCore

/// Bundled upstream text is an attribution resource, not distribution approval.
enum LocalModelNotices {
    struct Notice: Identifiable, Sendable {
        let id: String
        let title: String
        let version: String
        let license: String
        let fileName: String
        let source: URL
    }
    static let scopeExplanation = "固定版の公式ライセンス本文です。商用利用・再配布は未確認のままです。後で組み込むOpenCV依存バイナリの通知は別途確認します。本文の表示は法務承認や全依存物の配布確認を意味しません。"
    static let notices: [Notice] = [
        Notice(id: "yunet", title: "YuNet", version: "2023mar FP32", license: "MIT",
               fileName: "yunet-LICENSE", source: zoo("models/face_detection_yunet/LICENSE")),
        Notice(id: "sface", title: "SFace", version: "2021dec FP32", license: "Apache-2.0",
               fileName: "sface-LICENSE", source: zoo("models/face_recognition_sface/LICENSE")),
        Notice(id: "opencv", title: "OpenCV", version: "4.13.0", license: "Apache-2.0",
               fileName: "opencv-4.13.0-LICENSE", source: opencv("LICENSE")),
        Notice(id: "zoo", title: "OpenCV Zoo", version: PinnedFaceModels.revision, license: "Apache-2.0",
               fileName: "opencv-zoo-LICENSE", source: zoo("LICENSE")),
        Notice(id: "change", title: "OpenCV ライセンス変更記録", version: "4.13.0", license: "上流の変更通知",
               fileName: "opencv-4.13.0-LICENSE_CHANGE_NOTICE", source: opencv("doc/LICENSE_CHANGE_NOTICE.txt"))
    ]

    static func text(for notice: Notice, bundle: Bundle = .main) -> String? {
        // XcodeGen recursively includes Suite; resource groups may be flattened
        // by the bundle copy phase. Support both names without arbitrary paths.
        guard notices.contains(where: { $0.id == notice.id && $0.fileName == notice.fileName }) else { return nil }
        let url = bundle.url(forResource: notice.fileName, withExtension: "txt")
            ?? bundle.url(forResource: notice.fileName, withExtension: "txt", subdirectory: "LocalModelLicenses")
            ?? bundle.url(forResource: notice.fileName, withExtension: "txt", subdirectory: "Resources/LocalModelLicenses")
        guard let url, let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
              size > 0, size <= 32 * 1024, let data = try? Data(contentsOf: url),
              data.count <= 32 * 1024 else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func zoo(_ path: String) -> URL {
        URL(string: "https://raw.githubusercontent.com/opencv/opencv_zoo/\(PinnedFaceModels.revision)/\(path)")!
    }
    private static func opencv(_ path: String) -> URL {
        URL(string: "https://raw.githubusercontent.com/opencv/opencv/fe38fc608f6acb8b68953438a62305d8318f4fcd/\(path)")!
    }
}
