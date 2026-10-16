# 混合16件 — コード作成の引継ぎ（2026-10-08）

## 今回の成果と範囲

**16件すべてに、SUITE独自の処理コードと処理用APIを実装。** 空の関数、診断結果、試験数を完成コードの代わりに数えない。既存Solコードを再利用し、Astraの3サイドエージェントと親で排他分担した。

今回の100%は、下表に書いた入出力・操作の**コード作成段階**。モデル学習／モデル配布、アプリ接続、UI、保存host接続、試験、画質・他社同等性の合格とは区別する。コードを実行していないためバグがないという意味ではない。テスト・実験・ビルド・ブラウザ操作・配備は実施していない。

## コード一覧

以下のパスは `apps/web/src/processing/` からの相対パス。

| 項目 | 処理コード段階 | 実装内容 | 主なファイル |
| --- | ---: | --- | --- |
| Levels | 100% | 既存4ch/Local/Histogram/Sampler/Syncを維持。4scope共通のglobal Levels文書、encode/decode、版固定mergeを追加。 | `levels.mjs`, `local-levels.mjs`, `levels-preset-document.mjs` |
| Clothing adjustments | 100% | 細/粗しわ、微小異物候補と修復、指定境界warp、保護領域、領域モデルからの適用経路。 | `clothing-adjustments.mjs`, `region-repair-model-pipeline.mjs` |
| Facial Reshape / Eyebrows | 100% | 厚さ/距離/傾き/アーチ高/位置、独立Height、左右連動/独立、実顔抽出からの変形。 | `eyebrow-reshape.mjs`, `face-feature-adapter.mjs` |
| Facial Reshape / Nose | 100% | Size/Length/Horizontal/Bridge/Width/Tip、実顔抽出から保護mask付き局所変形。 | `nose-reshape.mjs`, `face-feature-adapter.mjs` |
| Hands | 100% | 既存Even、血管候補修復、指/掌の変形、実HandLandmarker21点と領域モデルの経路。 | `hands-adjustments.mjs`, `region-repair-hand-detector.mjs`, `region-repair-model-pipeline.mjs` |
| Makeup / Highlight | 100% | 実顔landmarkから額/鼻筋/頬/顎のmaskと強度処理。 | `makeup-highlight-landmark-mask.mjs`, `face-feature-adapter.mjs` |
| Makeup components / Blush | 100% | 頬配置、独自12style、強度/色/左右指定。 | `makeup-procedural-styles.mjs`, `makeup-feature-render.mjs` |
| Makeup components / Contacts | 100% | 虹彩配置、独自11style、中央/暗部/高輝度の保護、色/強度。 | 同上 |
| Makeup components / Eyelashes | 100% | 瞼曲線への配置、独自17style、iPad14、左右指定。 | 同上 |
| Makeup components / Eyeliner | 100% | 瞼線/wing描画、独自9style、iPad6、左右指定。 | 同上 |
| Makeup components / Eyeshadow | 100% | 眼周囲への彩色、独自14style、iPad8、眼/口保護。 | 同上 |
| Makeup components / Face Decorations | 100% | 再現可能なそばかす点配置、独自6style、強度/色。 | 同上 |
| Teeth | 100% | Whitening、欠陥候補修復、明示歯縁warp、5段階整列、歯成分/列推定、歯用ONNXモデルによる生成経路。 | `teeth-adjustments.mjs`, `region-repair-teeth-geometry.mjs`, `region-repair-model-pipeline.mjs` |
| Add Shadow | 100% | 既存soft/hard/drop、原寸/Proxy幾何、背景fit/cover/stretch、領域推論→影→被写体合成。 | `add-shadow-automatic.mjs`, `add-shadow-geometry.mjs`, `add-shadow-backdrop-placement.mjs` |
| Black & White Edge Removal | 100% | 領域推論、縁補正、影響mask、写真固有include/exclude、Update、写真ごとに再推論するSync。 | `bw-edge-automatic.mjs`, `bw-edge-removal.mjs` |
| Batch Edit | 100% | **People Removal**：写真別の対象推論、実ONNX inpaint、生成候補/失敗/取消、比較用preview、版固定accept/discard、原本非破壊。 | `batch-people-removal.mjs`, `masked-inpaint-onnx.mjs` |

### 共通コード

- `faces.mjs` の新規 `detectFaceFeatures`：既存SHA固定FaceLandmarkerの実推論から詳細landmark/眼/眉/唇/虹彩/頬/姿勢を抽出。既存`detectPeople`の形式は変えない。
- `face-feature-geometry.mjs`：領域polygonとmask。
- `makeup-detected-pipeline.mjs`：実顔抽出→明示選択顔→6種類の描画。
- `region-repair-core.mjs`：seed領域、多尺度平滑化、領域内修復、保護付き逆warp。
- `subject-segmentation.mjs`：digest固定のMediaPipe ImageSegmenter実推論。semantic label名をモデルから照合し、maskを原画像寸法へ変換。
- `masked-inpaint-onnx.mjs`：image/mask NCHW float入力、letterbox、mask投影、実`session.run`、生成RGBの選択領域への合成。ONNX Runtime [公式API](https://onnxruntime.ai/docs/api/js/interfaces/InferenceSession.html)に従う。

## 後段へ残す依存・限界（隠さない）

1. **モデル資産**：衣服/手/歯/人物のsemantic segmentation重みとlabel、HandLandmarker重み、人物除去用inpaint重み、歯生成専用重みは今回同梱していない。正しいSHA/商用利用条件を持つ資産が必要。汎用inpaintを歯専用と称さない。
2. **実行runtime**：既存MediaPipe環境に加えて、ONNX機能はhostがORTとモデルの実IO名/shape/rangeを提供する。追加packageのインストールやモデル取得は行っていない。任意の生成モデルがこの2入力NCHW契約に合うという保証はない。
3. **認可/対象選択**：既存privacy Gateを維持。顔/Asset/版の認可host、選択対象、遮蔽・保護maskは後段のアプリが提供する。モデルの顔indexは永続的な本人IDではない。
4. **画像解析の限界**：顔モデルは髪/眼鏡などの遮蔽判定を返さない。眉/鼻/Highlightは確認済み遮蔽mask必須。メイクは任意保護maskと`occlusionVerified:false`。血管/衣服異物/歯欠陥は画像上の候補抽出で、完全な意味認識ではない。接触歯など歯列推定が曖昧なら手動指定を要求する。
5. **独自実装**：style素材・補正式・Eyebrows Height/Positionの座標差はSUITE独自仕様。他社の非公開式や素材と同じとは報告しない。仕上がり・強弱は後段のユーザー評価対象。
6. **未接続**：Editor/Worker/Recipe/保存/Finalへの新機能の製品接続はしない。Levels文書にCOMMUNITYがあってもCommunity公開機能を有効化した意味ではない。生成結果は後段でcanonical derived assetとして保存し、PreviewとFinalで再生成しない。

アプリまで完成した件数、モデル込みで動作確認済みの件数へ、この16件を転記しない。Astra中心17件には今回手を付けていない。
