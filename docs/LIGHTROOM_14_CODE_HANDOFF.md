# Lightroom比較14件：コード引継ぎ

2026-10-08。ユーザー採用範囲は15候補からレンズぼかしを除く14件。既存再利用3、共通化7、不足追加4。これは機能分類であり、新規ファイル数ではない。

検査・実験・build・アプリへの接続・配備は今回行わない。Adobeの私有アルゴリズムとの一致を意味しない。SUITE既存処理を優先し、原本を書き換えない。以下は実装範囲と依存を記したコード段階の表。

今回の下表の対応範囲コードは14件分揃った。既存再利用3件、共通化・追補7件、追加4件。新規8ファイル。これはAdobe全機能互換・実行検証済み・モデル同梱済みという意味ではない。

|ID|機能|分類|処理コード／実装範囲|
|---|---|---|---|
|LR-01|プロファイル|共通化|既存delta66-color-profile、CUBE読込。SUITEプロファイル適用。Adobe Camera Matching/Adaptiveの私有互換は含めない。|
|LR-03|自動調整の一括提案|追加|lr-auto-light.mjs。実画像の輝度統計から8調整値を提案、Amount・リセット・適用。AI推論ではない。|
|LR-04|パラメトリックカーブ|既存再利用|delta66-color-curves.mjsの4帯域・輝度カーブ。|
|LR-06|カラーミキサー|既存再利用|color-adjustments／delta66-color-selectionの8色域HSL。|
|LR-07|ポイントカラー選択範囲|追加|lr-point-color.mjs。最大16標本、Hue循環範囲・S/L範囲・境界softness・調整・選択可視化。|
|LR-08|カラーグレーディング|共通化＋追補|lr-color-grading.mjs。Globalと暗部・中間・明部のH/S/L、Blending、Balance。|
|LR-09|エフェクト|既存再利用|既存Texture/Clarity/Dehaze/Grain/Vignette処理。|
|LR-10|ディテール・ノイズ除去|共通化＋追補|通常NRは既存処理。lr-raw-denoise.mjsは実LibRaw復号→線形RGB16除去。古典bilateralとSHA固定ONNXモデルのhalo付きタイル実行。|
|LR-11|光学・レンズ補正|共通化＋追補|lr-lens-correction.mjs。SUITE形式の校正プロファイル選択、歪曲逆写像、倍率色収差、光学周辺減光、有効矩形。|
|LR-13|色・深度の範囲マスク|追加|lr-range-masks.mjs。色選択核を共有。実Float32深度入力、値域・近遠方向・confidence・geometry照合、合成。|
|LR-14|切抜き・回転・ジオメトリ|共通化|既存delta66-scene-geometry。|
|LR-15|削除・修復・生成除去|共通化|既存delta66修復／scene workflowsと実モデル実行契約。モデル資産は別途必要。|
|LR-17|名前付き編集バージョン|追加|lr-named-versions.mjsとBackend lr-named-versions.ts。保存済Recipe版への名前参照CRUD・比較・ローカルCAS、本人専用SQLカタログの永続化・認可・サーバCAS。|
|LR-18|書き出し・共有|共通化|既存SUITE印刷／SNS／TIFF／queue／出力先処理を再利用。他社の公開アルバム運営サービスは範囲外。|

## 接続時に渡す入力と依存

- プロファイル：利用権限のあるSUITE校正データ。新レンズ処理はAdobe LCP/Lensfun読込器ではなく、upright-uncropped画像用の明示係数形式。既存RGBA8処理上限を無条件に外さない。大判出力は既存の別出力経路を使う。
- 深度：実深度マップとAsset/SHA/geometryの由来情報を供給する。今回の範囲選択は深度を推論したふりをせず、inferenceExecuted:falseを返す。深度推論・撮影深度抽出はこのmoduleの外。
- 生成除去：モデル重みと対応runtimeの供給が必要。コードが存在することと、モデル資産が揃って実行可能であることを分ける。
- RAW除去：復号後の線形RGB16が対応領域。CFA段階のAI除去は未実装。LibRawのgetRawImageはcopyなので書戻し可能と扱わない。AI経路は専用モデルweights/ORTの供給が必要。16bit派生結果を返し、原本の書換えや8bit中間化はしない。
- 名前付き版：既存保存履歴のRecipe ID/版を参照。原本・Recipe内容を複製せず、名前の削除で編集履歴を消さない。ブラウザ版単体は端末間同期をしない。
- 名前付き版のサーバserviceは既存WorkspaceRepositoryと同一DB接続を渡し、明示初期化する。認証付きHTTP/client接続は後段。ローカルrevisionとサーバrevisionは別で、暗黙のアップロード・自動mergeはしない。

## 後続順序

Lightroom14のコード → テザーのコード → 既存アプリへ接続 → Mac/Xcode。コスプレとレンズぼかしは今回対象外。
