# 骨組みの共有契約

技術選択: Swift/SwiftUI（iOS/iPadOS 17以降を骨組みの暫定ビルドターゲット）、TypeScript backend。製品の最低OS・RAW互換範囲を確定するものではない。Provider実装をUIに入れない。

## Swift Core
- METISMobileCoreは汎用パッケージ。Capability/Workload/ExecutionRoute、端末資源に応じたProxyPolicy、復旧JobCheckpoint、ReleaseGateの証拠判定を公開する。iOS固有APIに依存させずFoundationで試験可能にする。
- SuiteCore: RecipeParameters(exposure: Double = 0, contrast: Double = 1, saturation: Double = 1, rotationDegrees: Int = 0)。Codable/Equatable/Sendable。将来の全RAW項目は拡張可能なRecipeに保持、UIで未実装機能を完成と見せない。
- EditHistory: Codable/Equatable/Sendable、init(parameters: RecipeParameters = .init())、current: RecipeParameters、canUndo/ canRedo: Bool、mutating apply(_ parameters: RecipeParameters)、undo()、redo()。保存全体はCheckpointに含める。
- AssetRecord: Identifiable/Codable/Equatable/Sendable。id: UUID、originalFilename: String、originalRelativePath: String、sha256: String、createdAt: Date。公開initializer。
- ProjectCheckpoint: Codable/Equatable/Sendable。schemaVersion=1、asset: AssetRecord、history: EditHistory、revision: Int、updatedAt: Date。公開init(asset:history:revision:updatedAt:)。
- ProjectStore actor: init(directory: URL) throws、save(_ checkpoint: ProjectCheckpoint, expectedRevision: Int?) throws、load(id: UUID) throws -> ProjectCheckpoint?、list() throws -> [ProjectCheckpoint]。保存先はJSONメタデータ、原本binaryを上書きしない。atomic、CAS、破損時に空成功へ置換しない。
- CloudSafetyEvidence: 全検証が揃うまでSyncedにしない。不足/失敗は明示。
- Provider契約はRAW/Storage/Camera/Generative/Paymentと、Original/Proxy/Recipe/Generated/Exportを分離。

## UI接続（メインが実装）
EditorModel: @MainActor ObservableObject
@Published assets: [AssetRecord], selectedAsset: AssetRecord?, preview: UIImage?, parameters: RecipeParameters, isBusy: Bool, errorMessage: String?, statusMessage: String, isComparing: Bool, showImporter: Bool, shareURL: URL?
computed canUndo/canRedo: Bool
func select(_ asset: AssetRecord), importFile(_ url: URL), setExposure(_ value: Double), setContrast(_ value: Double), setSaturation(_ value: Double), rotate(), undo(), redo(), compare(_ enabled: Bool), exportJPEG(), exportTIFF()
Async処理は各func内Task。未実装のAI/Batch/Cloudを成功表示しない。

共通UI（メイン）: PhotoCanvas(model: EditorModel)、AdjustmentControls(model: EditorModel)、AssetFilmstrip(model: EditorModel)、WorkflowAvailabilityView()。各Viewに@ObservedObjectでmodelを渡す。
iPhone担当: IPhoneEditorView(model: EditorModel)、下部操作主体・読み込み・Undo/Redo・比較・書出。iPad担当: IPadEditorView(model: EditorModel)、独立サイドInspector/縦横配置/filmstrip。両者は@ObservedObjectを使い、AppModelや共通UIを編集しない。

## 未実装機能
RAW全項目、Portrait/Body/Auto Color、テザー、クラウド同期、共有Gallery、生成・Identity Lock、課金は商用仕様として保持する。骨組み時点の未接続機能は利用可能と装わない。
