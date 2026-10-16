# EV3-0169 Facial Reshape / Eyebrows — 差分監査

判定（2026-10-05）: **元候補はNOT_IMPLEMENTED**。この監査は資料・現コードの照合のみであり、製品の画素処理、UI、Recipe、保存、Final、Presetを変更していない。独立44候補の厳密な完了数は **0/44のまま**。

## 元操作と端末差

凍結した[元監査のEV3-0169〜0174](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md)はFacial Reshape / EyebrowsのThickness、Distance、Tilt、Arch Height、Position、Linked / separateである。これらは**顔の幾何形状**を変える操作であり、色・明るさを変える眉メイクではない。

| 元下位操作 | 一次資料で確認できる意味 | 現SUITE |
| --- | --- | --- |
| EV3-0169 Thickness | 眉を太く／細く | 眉領域・画素幾何の変形なし |
| EV3-0170 Distance | 左右の眉を近づける／離す | 左右眉の距離変更なし |
| EV3-0171 Tilt | 眉頭の傾き | 眉頭ランドマーク／局所変形なし |
| EV3-0172 Arch Height | アーチを平坦化／持ち上げる | アーチの輪郭制御なし |
| EV3-0173 Position | 眉全体を顔上で上下に移す | 原画と空いた領域を安全に再構成する位置変更なし |
| EV3-0174 Linked / separate | 左右連動と独立調整 | 人物選択はあるが、左右眉の独立パラメータなし |

[Evoto Desktop Facial Reshape公式](https://support.evoto.ai/facial-reshape/)は上記5変形と左右連動／独立を記載する。[iPad公式](https://support.evoto.ai/facial-reshape-ipad/)にはさらに「Height: Moves eyebrows vertically up or down」がPositionと**別行**で掲載される。両者が実処理上で同一か独立かを確定できないため、単に名称が似るという理由で統合しない。[Mobile公式](https://support.evoto.ai/portrait-retouching-facial-reshape/)はDesktopと同じ5名および連動／独立を記載するが、元監査のMobile列はNOT_CONFIRMEDのままである。現行記事の記述は監査作成時の凍結状態や端末間の同一画素／Recipe互換を遡及証明しない。公式の「全スライダー -100〜+100」はHead Pose節直後にあり、眉5値すべての確定範囲としては扱わない。

混同しやすい別機能として、[Desktop Makeup公式](https://support.evoto.ai/makeup/)・[iPad Makeup公式](https://support.evoto.ai/makeup-ipad/)・[Mobile Makeup公式](https://support.evoto.ai/portrait-retouching-makeup/)は既存の眉メイクを強弱調整し、独立部品として眉**9スタイル**を挙げる。Makeup内では眉素材の左右独立調整はあるが位置変更は非対応と明記される。これは幾何変形のEV3-0169〜0174でも、顔全体のEVでもない。元監査のMakeup `EV3-0019` Style selectionは別項目、`EV3-0020` AmountはNOT_CONFIRMEDであり、別項目の能力を眉形状変形の完成証拠にしない。

## 現SUITE経路

| 境界 | 実際のコードと不足 |
| --- | --- |
| 顔検出／実画素 | [faces.mjs](../apps/web/src/processing/faces.mjs)はSHA固定FaceLandmarkerのlandmarksから**顔oval polygon**のみを製品検出として返す。眉輪郭、左右眉ID、眉領域mask、形状適合判定は返さない。[pure.mjs](../apps/web/src/processing/pure.mjs)は`face_brightness`を顔oval内のRGBへ適用するだけで、座標変形・欠損領域補完をしない。Local Levelsや手動Makeup Highlightもトーン／明度であり眉形状ではない。 |
| Editor／人物 | [editor-ui.mjs](../apps/web/src/editor-ui.mjs)は人物選択とFace Brightnessを表示するが、左右眉選択・5変形・連動切替・本人レビューはない。[session.mjs](../apps/web/src/session.mjs)のプライバシーGateとUndo/Redoは既存Face Brightness用の共通機構で、眉操作が接続された証拠ではない。 |
| Recipe／保存 | [portrait-recipe.ts](../apps/backend/src/portrait-recipe.ts)は人物targetの`adjustmentType:'face_brightness'`だけを厳密受理する。汎用Recipeに架空の`eyebrowReshape` JSONが構造上入っても、rendererは`UNSUPPORTED_WEB_ADJUSTMENT`で拒否する。眉専用のAsset/Original SHA/人物・左右mask・版・幾何処理順契約とCAS保存／再読込はない。 |
| Final／Preset | Worker／Session Finalは眉変形を描画しない。Author portable Presetは未対応拡張を拒否し、既存Personal/Workspace Presetの一般Save/Apply/Reloadも眉固有値・人物binding・画素処理の証拠にはならない。眉位置など写真固有座標を別写真へ無条件複製してはならない。 |
| Apple／端末 | [PortraitPipeline.swift](../apps/apple/Suite/Services/PortraitPipeline.swift)のadapterはFaceBrightnessのみ。[EditorComponents.swift](../apps/apple/Suite/Shared/EditorComponents.swift)も人物選択と顔明るさ操作で、眉変形UIではない。WebとAppleの眉Recipe roundtrip、実iPad/iPhone操作は未検証。 |

## 安全な次の最小単位と残Gate

まず**SUITE独自の明示手動・単一眉位置移動**だけを、元5変形の代用品と称さず独立候補として切り出す。本人が指定するAsset UUID/Original SHA/フル寸法・人物ID・左右側と眉輪郭／保護領域を、出典付きかつ有限・容量制限付きのtyped入力として検証し、本人による顔／眉の確認とfresh権限・保存版Gateを別に置く。既存face-ovalやcaller自称のmaskを眉の信頼できる検出と扱わない。局所座標変換の純粋画素核を作る場合も、元RGBA/alpha/隠れRGB、眉以外の領域、境界、空いた元領域の補完、左右独立、proxy/full寸法、abortを別々に試験する。安全な欠損領域の再構成が証明できなければ位置移動自体をFail Closedとする。

次に本人操作UI→Before/After→Undo/Redo→非破壊typed Recipe→CAS保存／再読込→実Worker Preview／Finalを単写真で結ぶ。プライバシー承認、人物同一性、側面顔・遮蔽・複数人・眉が欠ける写真での拒否、代表的な本人同意済み実写真／RAWの品質確認が必要。太さ・距離・傾き・アーチ、左右連動、iPadのHeight／Position差、眉メイク9スタイル、Presetの写真間適用は**この最小単位では未実装**のまま残す。公式の非公開変形式・素材・画素同等性は推測しない。

実RAW、実機、Cloud、元製品と同じ画素、写真別の眉認識品質、眉操作の製品UI／Finalは **NOT_RUN / NOT_PROVEN**。専用監査試験は欠落と安全拒否を固定するだけで、元候補の完成試験ではない。
