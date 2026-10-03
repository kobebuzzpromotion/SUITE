# Editing Gap Matrix — 独立レビュー

Checked: 2026-10-03。前工程 `trial-final-01` / `trial-independent-08` を基準とする追加工程の開始点。既存147要件・凍結Evidenceを変更しない。新しい統合APIは実装待ちであり、この文書は新機能の合格証跡ではない。

## 現在の追補（開始点の表・予定試験を置換しない）

下表および第4節は実装前の差分記録。現在はWebの既存Recipe v1拡張枠 `extendedParameters.postDecodeAdjustments` / `processingOrder` に、8bit sRGBデコード後のHighlight・Shadow・White・Black・Vibrance・HSL 8色×3軸・Sharpnessを接続した。追加仕様のClarityとTextureも、Sharpnessとは異なる後段画素処理として接続した。UI値、厳格な範囲検証、保存・再読込、Undo/Redo、固定Finalは同じsession/renderer経路を使用する。新拡張には `schemaVersion=1` と `engineVersion=suite-srgb8-color-detail-1` が必要で、未知版は拒否する。旧Recipe v1外形は維持するが、Apple Nativeが新拡張を実行できるとの主張ではない。

現在の検証は人工sRGB画素とmock/SQLite状態遷移のみ。Web全221件（独立17を含む）PASS、実RAW・実写真のProxy/Final視覚確認・Apple Native/iPhone/iPadはNOT_RUN。Highlight処理は8bit画像の明部トーン調整であり、RAWで失われた階調の復元ではない。WB・Tint・TemperatureはRAW側の意味ある操作として未実装のまま。Tone Curve、Noise Reduction、Lens Correction、カラーグレーディング、シャープ半径/詳細/マスキング、任意回転・遠近・部分Maskも未実装。実RAWや競合同等性のPASSへ読み替えない。

## 1. 基本調整18項目の正本照合

正本: `SUITE_SPEC.md` §10 RAW DEVELOPMENT。以下の英語名称・順序をそのまま保持する。White BalanceとTemperatureは正本では別項目であり、実装上関連しても18→17へ数え直さない。

開始点のWebは5項目の画素処理を接続、残る13項目はWeb編集として未実装。共有enumやRecipe内の値保持だけでは実装扱いにしない。全18項目の実カメラRAW画質評価はNOT_RUN。

| # | 正本の項目 | 前工程Webの接続 | 具体的な根拠／不足 |
|---|---|---|---|
| 1 | White Balance | 未実装 | decoderのcamera WB要求は固定取込条件。ユーザー編集・中立点選択・保存再適用とは別 |
| 2 | Tint | 未実装 | 色かぶり補正のUI→Recipe→画素経路なし |
| 3 | Exposure | 接続済・人工検証のみ | session ±4EV、pure rendererの線形RGB倍率、保存／履歴／Final |
| 4 | Contrast | 接続済・人工検証のみ | session 0..2、線形RGBの中心基準演算。競合製品同等のトーン特性保証なし |
| 5 | Highlight | 未実装 | 明部領域を独立操作する演算なし |
| 6 | Shadow | 未実装 | 暗部領域を独立操作する演算なし |
| 7 | White | 未実装 | 最明部の独立操作なし |
| 8 | Black | 未実装 | 最暗部の独立操作なし |
| 9 | Temperature | 未実装 | 編集可能な色温度パラメータと再現可能な変換なし |
| 10 | Saturation | 接続済・人工検証のみ | session 0..2、輝度との差の倍率、保存／履歴／Final |
| 11 | Vibrance | 未実装 | 彩度依存の選択的操作なし。Saturationの別ラベルでは充足しない |
| 12 | HSL | 未実装 | 色域別Hue/Saturation/Luminance操作なし |
| 13 | Tone Curve | 未実装 | control points／補間／channel操作なし |
| 14 | Sharpness | 未実装 | detail演算・量／半径の定義なし |
| 15 | Noise Reduction | 未実装 | 空間処理も学習モデルも編集経路なし |
| 16 | Lens Correction | 未実装 | レンズprofile／歪曲・周辺光量・色収差処理なし |
| 17 | Crop | 接続済・限定 | Original/1:1/4:5/3:2、回転後UL正規化座標。印刷実寸resizeは未対応 |
| 18 | Rotation | 接続済・限定 | 90°刻み、正方向CCW。任意角や遠近補正の実装ではない |

未実装13項目: **White Balance, Tint, Highlight, Shadow, White, Black, Temperature, Vibrance, HSL, Tone Curve, Sharpness, Noise Reduction, Lens Correction**。

根拠: `apps/web/src/session.mjs` setAdjustment / commitRecipe / exportFinal、`processing/pure.mjs` renderPixels / rotateCropPixels、`processing/raw.mjs` decodeRaw。`apps/backend/src/photo-policy.ts` と `packages/SuiteCore/Sources/SuiteCore/Recipe.swift` は18 stage名を保持するが、Web rendererは開始点では5 stage以外を拒否する。§10の可変pipeline要件に対し、Webは対応順の部分列以外を拒否する限定実装であり、任意順対応は未実装。

## 2. 競合の一次資料と既存監査の扱い

既存 `EVOTO_COLOR_MATRIX.md` は37 group / 338 option・inquiry行、`EVOTO_PORTRAIT_MATRIX.md` は335行。行数をユニーク機能数へ読み替えない。旧表のNOT_CONFIRMEDは不在ではなく未確認。本文にないplatform、credit、処理場所を推定しない。Desktop記事の記述をiPhone/iPadへ継承しない。

2026-10-03に再読した公式資料:

| 出典 | 照合したheading／既存row | この工程への意味 |
|---|---|---|
| [Adobe Lightroom Desktop: Edit photos](https://helpx.adobe.com/lightroom/desktop/edit-photos/edit-photos.html) | 更新2026-06-18、Light / Color / Detail / Optics / Lens Blur | Autoは明暗・彩度系8項目への調整。曲線、色域、通常noise reductionとAI Denoise、lens profileとdepth blurを別々に比較する |
| [Adobe Lightroom Desktop: Masking](https://helpx.adobe.com/lightroom/desktop/edit-photos/masking.html) | 更新2026-08-07、The Masking tools / Automatically select people / Range Masks | Subject/Sky/Background/Landscape/Objects/People、自動選択とbrush/gradient/rangeを区別。人物内の部位選択はface ovalだけでは充足しない |
| [Evoto Color Adjustments Module](https://support.evoto.ai/color-adjustment-feature-modules/) (S601) | Basic / White Balance / Tone / Presence / Curves / HSL / Detail / Lens Corrections、EV3-0436以降 | WB、明暗別調整、Vibrance、曲線、HSL、detail、lensを個別機能として比較。Auto Color CorrectionsはWB/exposure、Multi-Image Color Consistencyは複数画像の参照合わせであり同一機能にまとめない |
| [Evoto AI Facial Recognition](https://support.evoto.ai/portrait-retouching-feature-module/) (S604) | Individual Editing / Linked Portrait Retouching、EV3-0049〜0062 | 人物単位の調整と同一人物への同期を説明。SUITEの同一写真UUID→geometry拘束は、写真を跨ぐ本人認識の完成証拠ではない |
| [Evoto Skin Retouching](https://support.evoto.ai/skin-retouching/) (S606) | Facial Skin Retouching / Skin Tone、EV3-0095〜0123 | smoothing、frequency separation、complexion調整を区別。SUITE face brightnessを肌補正全体の実装へ拡大解釈しない |
| [Evoto Eyes](https://support.evoto.ai/eyes/) (S615) | Eye appearance / AI Iris Correction、EV3-0124〜0144 | 目・虹彩の操作は顔全体の明度とは別。既存表のContactsやMakeupも未実装のまま保持 |

上記Adobe2URLとEvoto S601がユーザー指定一次資料。AdobeはDesktopの記事であり、Mobile/Webの同機能や無料利用を保証しない。上記は新たな全記事再監査ではなく、この工程の基本調整／AI境界の照合である。料金、無料枠、処理先の合意を追加しない。

追加の比較上の制約: AdobeのDepth Rangeには深度情報が必要、People部位選択には検出後の選択が必要。Evoto Auto Colorは既存WB/露出を上書きし、複数画像一致では一部の既存色調整を置換するため、SUITEでも「値の追加」か「置換」かを明確にする。これらの条件を持つ競合機能と、固定3globalのPreset適用を同一視しない。

## 3. AI関連の差分分類

分類は技術差分であり正式優先度の新設ではない。複数分類を持つ項目は、再利用部分と不足部分を分ける。

| 対象 | 分類 | 再利用できるもの／不足 |
|---|---|---|
| Recipe、CAS、原本SHA、Undo/Redo、固定Final | 既存 | 現行session／共有validatorを継続使用。AI提案も通常Recipeとして明示承認後1回だけcommitする |
| 同一写真のperson UUID→geometry Gate | 既存 | asset/SHA/inventory/version拘束。IoU対応は空間整合であり本人同一性保証ではない |
| Web face brightness | 接続不足＋外部依存 | syntheticテスト可能なrenderとFaceLandmarker adapterは存在。ただしSDK Privacy gateで実使用停止。肌・目・形状補正とは別 |
| AI Auto Develop §11 | 新規 | 開始点に明暗／WB提案生成なし。今後histogram等の決定論的推定を実装しても、学習AI・シーン理解・肌検出完了と呼ばない |
| AI WB／Exposure提案 | 新規＋接続不足 | 基本調整不足を埋めた上で分析→提案→承認→履歴／保存／Finalまで必要。既存手動exposureは再利用 |
| 複数画像Color Consistency／AI Color Match／AI Looks | 新規 | 参照選択、複数画像の色解析、手動変更との優先順位、batch結果・取消が不足。3global固定Presetは同等機能ではない |
| Session Look／Person-based batch | 接続不足＋外部依存 | SuiteCore SessionLook/Planningの型・計画／分析不足拒否は存在。実人物識別・segmentation・実行adapterとWeb接続は不足 |
| Skin／Blemish／Eyes／Teeth／Makeup／Contacts／Hair | 新規＋外部依存 | 型や監査rowのみを画素機能と数えない。対象局所mask・モデル／演算・本人／背景保護・品質素材が必要 |
| Body／Liquify／背景保護 | 新規＋外部依存 | body landmark／mesh／独立背景保護が不足。face polygonをbody maskへ流用しない |
| AI Denoise | 新規＋外部依存 | 学習model/runtime/対応RAW制約の検証が必要。通常ノイズ低減を作ってもAI Denoiseと称さない |
| Adobe型のSubject/Sky/Background/Objects/Landscape mask | 新規＋外部依存 | region解析・複合mask・部分修正の契約が不足。新規model選定やクラウド送信の許可を本比較から推定しない |
| People部位mask／brush／linear・radial gradient／range | 新規 | 手動maskもAI自動maskもWeb共通編集UI／Recipe／renderer接続なし。depth rangeには実深度情報が別途必要 |
| Adaptive profile／Point Color／Lens Blur | 新規＋外部依存 | profile・選択色・depth推定を、基本WB/HSL/Lens Correctionの別名で実装済みにしない |
| 背景生成／除去／衣装／天候／復元 | 接続不足＋外部依存 | GenerativeProvider/CanonicalGenerationの契約候補は存在。実provider／canonical asset永続／Identity Lock／Preview==Final品質は未接続 |

## 4. 独立試験の予定と期待値

排他試験先: `apps/web/tests/editing-integration-independent.test.mjs`。統合API到着後に実装する。現時点はNOT_RUNであり予定IDをPASSへ数えない。

| 予定ID | 境界 | 期待値 |
|---|---|---|
| EII01 | neutral／disabled controls | 入力RGBA・原本bytes不変、neutral出力byte exact。透明度も保持 |
| EII02 | 各調整の端値・不正値 | 許容端値はfiniteで決定論的、NaN/Infinity/範囲外／未知fieldは部分保存せず拒否 |
| EII03 | 複合・順序・二重適用 | 元baseから共通rendererを一度だけ使用。出力を再入力して変更を累積しない |
| EII04 | Undo/Redo／save／reload | 一操作=一history、全typed値・順序が同一、CAS競合はdraft保持 |
| EII05 | Proxyと固定Final | canonical source寸法・同じRecipe、取得Original SHA一致、revisionすり替え拒否。縮小画素の完全一致は要求しない |
| EII06 | Auto提案の確認／取消／stale | 分析でRecipeを変更しない。承認だけが一度commit。asset/SHA/revision変更後の提案を拒否 |
| EII07 | 解析不足／不確実性 | 小画像・透明／単色・clipping等の不適切入力を定義に従って拒否／限定表示。confidenceを架空のAI確率にしない |
| EII08 | 人物／期限／失敗 | Privacy、person Gate、live期限を回避しない。解析／保存／encode失敗で原本・未保存値を保持 |
| EII09 | 互換性／portablePreset | 既存3globalのみの作者contractを黙って拡張せず、新編集が混ざれば拒否。未知Native engine/controlは安全拒否 |

実RAW、実人物、肌色・ハロー・ノイズ品質、実機メモリ、Adobe/Evoto視覚同等性は別GateのNOT_RUN。人工入力の数学／状態遷移PASSで置換しない。Apple112、Parity、Mobile Release、外部招待試用の既存BLOCKを変更しない。
