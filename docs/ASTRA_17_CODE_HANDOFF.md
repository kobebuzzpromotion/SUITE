# Astra単独17件：処理コード引継ぎ（2026-10-08）

ユーザー指定：コード先行。Astra担当3名と親で排他並列作業。検査・実験・テスト・ビルド・アプリ接続・配備は実施しない。旧Sol/混合の処理核を再利用し、既存UI・Recipe・保存契約は変更しない。

## 今回の処理コード

**17件中、処理コード追加17件・未着手0件。** 全担当のコード返却済み。元候補全要素の100%という意味ではなく、下表の処理範囲を書いたという記録。以下の互換形式・学習済み資産の不足を残すため、根拠のない全件100%は付けない。

以下は書いた処理と公開入口の一覧。モデルを用いる行は、実ONNX/MediaPipe推論を呼ぶコードまでを含む。ただし対応する学習済みモデルの選定・重み・モデル固有入出力情報は供給されていない。任意のモデルを渡せばその機能になる、という意味ではない。未提供モデルや非公開形式の不足を隠して、元候補全体の100%完成とはしない。

ファイルはすべて `apps/web/src/processing/` 以下。

| # | 正式名 | 書いた処理コード | ファイル／入口 | コードの範囲・残依存 |
| --- | --- | --- | --- | --- |
| 1 | HDR Optimization | Float32露出・自動露出・highlight圧縮・彩度・RGBE入出力 | `astra-hdr-optimization.mjs`: `optimizeHDR`、`astra-hdr-rgbe.mjs`: `decodeRadianceHDR` / `encodeRadianceHDR` | 線形Rec709/Radiance形式。HEIF/AVIF/RAW codecやHDR画面表示は含まない。 |
| 2 | Personalized AI Look | before/after画素対からLookを学習して適用、RAW/nonraw別、Personal/Lite、補正とpreview | `astra-look-learning.mjs`: `trainPersonalizedLook` / `applyPersonalizedLook` | SUITE独自の色写像学習。私有Lightroom現像器の再現ではない。 |
| 3 | Facial Expression | 左右Gummy/Gentle変形、Smile5段階・Neutral3段階条件推論、None、本人照合 | `astra-face-expression.mjs`: `createFacialExpressionProcessor` | 表情条件モデル・顔embedding・host認可・遮蔽情報が必要。 |
| 4 | Facial Reshape / Head Pose | Tilt変形、Pitch/Yaw条件推論、本人照合 | `astra-face-head-pose.mjs`: `createHeadPoseProcessor` | 姿勢条件モデルと本人照合モデルが必要。 |
| 5 | Original Shadow | 人物・影のsemantic抽出、背景配置、元影とAdd Shadowの順序付き合成 | `astra-original-shadow.mjs`: `createOriginalShadowProcessor` | 人物モデル・影モデルと各labelが必要。 |
| 6 | Body Hair Removal | 体毛と皮膚の領域抽出、選択/保護範囲、inpaint、強度合成 | `astra-body-hair.mjs`: `createBodyHairRemoval` | 対象部位対応の体毛/皮膚/inpaintモデルが必要。 |
| 7 | Clothing Moiré Removal | 衣服抽出、専用修復モデル推論、衣服内のみ合成 | `astra-clothing-moire.mjs`: `createClothingMoireRemoval` | garmentと専用moireモデルが必要。通常denoiseへの置換ではない。 |
| 8 | Generative Expand | 四辺・連動・比率、外側生成3候補、原画領域復元 | `astra-generation-expand.mjs`: `generateExpansion` | noise/mask対応outpaintモデルが必要。 |
| 9 | Grass Fill | 芝抽出、Add/Erase brush、2候補、4色調整 | `astra-generation-grass.mjs`: `generateGrassFill` | semantic芝モデルと専用生成モデルが必要。 |
| 10 | Liquify Background Repair | 変位field/修復範囲、被写体保護、背景修復 | `astra-generation-liquify-repair.mjs`: `repairLiquifiedBackground` | 専用修復モデルと変位/領域入力が必要。 |
| 11 | Mobile Motion Blur | Ghost Flow用モデル、露光/方向条件、被写体入力と比較 | `astra-generation-motion-blur.mjs`: `generateMotionBlur` | 専用条件モデルが必要。一般blurではない。 |
| 12 | Perfect Shot | 前後各7枚、本人照合、候補採点、Auto/Custom、整列合成、新コピーpayload | `astra-perfect-shot.mjs`: `createPerfectShot` | **TSQ encoder未実装**。独自 `.suiteps` 出力。TSQ互換は完成扱い不可。 |
| 13 | Smart Culling | 品質採点、重複/類似群、Best Picks、時系列、差分解析、XMP出力 | `astra-culling-analysis.mjs`: `analyzeCullingSet` / `suggestCulling` | 顔利用はprivacy/本人提供情報が前提。意味検索追加コードは下記追記を参照。 |
| 14 | AI Facial Recognition | 顔整列、実embedding推論、本人提供gallery登録/照合/削除 | `astra-face-recognition.mjs`: `createFaceEmbeddingONNX` / `createFaceRecognition` | embeddingモデルとhost認可が必要。外部の人物名を推測しない。 |
| 15 | Detail Enhance | context付きtile推論、No Upscale/2K/4K/6K | `astra-generation-detail.mjs`: `generateDetailEnhance` | 専用モデル、native倍率、各Kの明示寸法が必要。 |
| 16 | Golden Blonde Hair | 髪抽出、人物範囲との交差、明度/細部保持の金髪変換 | `astra-golden-blonde.mjs`: `createGoldenBlondeProcessor` | 髪モデルが必要。専用生成の追加コードは下記追記を参照。 |
| 17 | Old Photo Restoration | Colorization既定ON→Restoration、2K/4K、保護範囲 | `astra-generation-restoration.mjs`: `restoreOldPhoto` | 専用colorize/restoreモデル、出力寸法が必要。 |

## 共通コードと後段への引継ぎ

- `astra-image-model.mjs`: モデルbytes/SHA、明示IO、NCHW tensor、実 `session.run`、tile推論、出力構成、解放。単一pass image-to-image ONNX限定。一般的なdiffusionのtokenizer/VAE/schedulerを代行するものではない。
- `astra-generation-core.mjs`: 保護領域合成、生成結果SHA、再推論しない候補選択。
- `astra-generation-batch.mjs`: Detail/Old Photoの写真別推論、取消・部分失敗。
- `astra-face-core.mjs` / `astra-face-runtime.mjs` / `astra-face-conditioned-onnx.mjs`: 顔整列・合成・条件推論・host認可・出力本人照合。
- ONNX Runtimeやモデル重みを今回インストール/ダウンロードしていない。アプリが資産を用意し各契約を満たす必要がある。
- 私有モデルと同じ画質・学習結果や他社の全操作互換は主張しない。テスト未実施を処理コード0%の理由にもしない。
- 製品接続、モデル資産の選定と実装契約への適合、ユーザーの実操作評価は次段階。今回のコードだけで「実機で全17機能が動いた」と報告しない。

## 最終担当返却：Look / Culling / Golden Blondeの追加分

- `astra-culling-semantic.mjs`: `createCullingBPETokenizer` は語彙/merges/特殊IDを使うbyte BPE。`createCullingSemanticEncoder` はimage/text別ONNXの実推論、`rankCullingEmbeddings` / `searchCullingByText` はembedding正規化と順位付け。CLIP系の明示された契約に限り、未知のtokenizerやモデルIOを推測しない。
- `astra-culling-people.mjs`: `groupCullingPeople` は顔embedding実推論と本人提供gallery照合、personID別groupsとunknownを返す。前後host認可とprivacy条件を要求する。
- `astra-golden-blonde.mjs`: `createGoldenBlondeGenerator` は `golden-blonde-hair` 専用モデルの実推論→選択人物の髪mask内合成。alpha保持、seed/モデルdigestを返す。先の色変換とは別入口。
- `astra-look-corpus.mjs`: `readLookXMPSubset` / `renderLookXMPSubset` / `trainLiteLookFromXMP` / `importDecodedLookCorpus`。DOMParserでCRSの8色control subsetを取得し、明示 `suite-color-approximation` 時だけSUITE色核で描画してLite学習する。manifestはデコード済みbefore/after RGBAのSHAと寸法を照合する。
- **Lookの書いていないコード**：`.lrcat`直接読取、Adobe現像、CameraRaw profile/local mask/curve等の完全再現。XMPの未知効果は黙って無視せず拒否する。対応範囲を超えた形式を「読める」と扱わない。

この追加分も検査・実験・ビルド未実施。ユーザー指示どおり処理コード段階で返却する。
