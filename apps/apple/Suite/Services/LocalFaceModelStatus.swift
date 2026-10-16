import Foundation
import SuiteCore

/// UI-safe read-only summary; contains no local paths, embeddings or photos.
/// Native bridge presence, asset bytes and commercial review are independent.
enum LocalFaceModelStatus {
    struct Model: Sendable {
        let modelID: String
        let fixedVersion: String
        let storage: LocalAIModelStore.AssetStatus
        let commercialUse: LocalAIModelManifest.PermissionState
        let redistribution: LocalAIModelManifest.PermissionState

        var storageDescription: String {
            switch storage {
            case .notInstalled:
                return "未導入：この端末に固定版モデルがありません。"
            case .bytesVerified:
                return "保存準備済み：固定版の容量・SHA-256が一致しています。推論動作は未確認です。"
            case .inconsistent(let reason):
                switch reason {
                case .byteCountMismatch: return "不整合：モデルの容量が固定版と一致しません。"
                case .digestMismatch: return "不整合：モデルのSHA-256が固定版と一致しません。"
                case .invalidFile: return "不整合：モデルの保存対象が通常のファイルではありません。"
                default: return "不整合：モデルの保存状態を確認できません。"
                }
            case .unavailable(let reason):
                switch reason {
                case .unsafePath: return "確認不能：安全な保存先として確認できないため読み込みを停止しました。"
                case .storeUnavailable: return "確認不能：端末内のモデル保存領域を利用できません。"
                case .capacityPolicy: return "確認不能：現在の容量制限ではこのモデルを扱えません。"
                case .manifestInvalid: return "確認不能：固定版モデルの定義に問題があります。"
                case .readUnavailable: return "確認不能：アクセス権または読み込みの問題があります。破損とは判定していません。"
                default: return "確認不能：モデルの状態を取得できません。"
                }
            }
        }

        var commercialUseDescription: String { Self.permissionDescription(commercialUse) }
        var redistributionDescription: String { Self.permissionDescription(redistribution) }
        var permissionDescription: String {
            "商用利用：\(commercialUseDescription)／再配布：\(redistributionDescription)"
        }

        private static func permissionDescription(_ state: LocalAIModelManifest.PermissionState) -> String {
            switch state {
            case .unreviewed: return "未確認"
            case .confirmed: return "確認記録あり"
            case .denied: return "許可なし"
            }
        }
    }
    struct Snapshot: Sendable {
        let detector: Model
        let recognizer: Model
        /// Compile-time linkage only, not a successful load or inference run.
        let nativeBridgeIncluded: Bool
        let checkedAt: Date

        var nativeDescription: String {
            nativeBridgeIncluded
                ? "ネイティブ処理の組込あり。モデル読込・推論成功を示すものではありません。"
                : "ネイティブ処理は未組込。この状態では顔推論を実行できません。"
        }
    }

    static func snapshot(store: LocalAIModelStore) async throws -> Snapshot {
        try Task.checkCancellation()
        let detector = try PinnedFaceModels.yuNet()
        let recognizer = try PinnedFaceModels.sFace()
        let detectorStatus = try await store.status(manifest: detector)
        let recognizerStatus = try await store.status(manifest: recognizer)
        try Task.checkCancellation()
        #if canImport(SuiteFaceCore)
        let nativeBridgeIncluded = true
        #else
        let nativeBridgeIncluded = false
        #endif
        return Snapshot(detector: model(detector, status: detectorStatus),
                        recognizer: model(recognizer, status: recognizerStatus),
                        nativeBridgeIncluded: nativeBridgeIncluded, checkedAt: Date())
    }

    private static func model(_ manifest: LocalAIModelManifest,
                              status: LocalAIModelStore.AssetStatus) -> Model {
        Model(modelID: manifest.modelID, fixedVersion: manifest.fixedVersion,
              storage: status, commercialUse: manifest.license.commercialUse.state,
              redistribution: manifest.license.redistribution.state)
    }
}
