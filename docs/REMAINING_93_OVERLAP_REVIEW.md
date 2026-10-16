# 残93候補の重複・固有差分レビュー

2026-10-08。元137候補から、既存台帳の一次37 ID＋追加7 IDを除いた**93行**の読取り調査。製品コード・テスト・build・アプリ接続は変更/実行していない。本書だけを新規作成した。

## 集計と結論

元一覧を行抽出して再集計：137行（Evoto 119、Lightroom 18）。一次37、追加7、ユニーク44 ID、差集合93 ID。ID重複・未対応行なし。本表の独自暫定判定は **既存で足りる 0、差分追加 66、独立 5、資料不足 22、合計93**。

**93件を「全部重複・不要」とする根拠はない。** 「独立」は共通核の呼出しだけでは代替できない別処理を残すという技術的判断であり、既存44の再選定や新しい完成件数ではない。「差分追加」は共通化候補があるが元下位操作の追加/対応確認が必要。「資料不足」はコード不存在の断定ではなく、元操作または現行対応の全照合が足りない。既存で足りると判定するには下位操作全体の根拠が必要なため、本調査では0とした。

## 主担当候補の判定基準（SUITE採用判断とは別）

2026-10-08追補。各候補は主担当を1つだけ付け、Sol/Astraへ内部分割しない。**Sol 24、Astra 47、未確定 22、担当不要 0、合計93**。これは実装許可や着手順の確定ではない。元機能名ではなく、表に挙げた残コードが設定/変換/独立した純粋差分中心ならSol、認識/生成/幾何/複数経路の整合が中心ならAstraとした。難度の混在する親候補は難しい責務を含む主担当へ寄せた。学習weights不足は実行資産依存であり、自動的に未実装コードや担当分割へ読み替えない。

**SUITE独自のstyleと仕様を優先する。** 表の他社下位操作は重複誤認を避ける比較材料であり、同等化だけを目的に全採用する依頼ではない。課金方式、独自拡張子、他社default値/段数、他社だけの制約はそのまま移植する必須条件ではない。追加を採用しないと決めた操作は担当不要へ変更できるが、現段階で根拠なく不要とは判定しない。印刷を軸とする寸法/解像度/出力品質と、SNS向け画素寸法/圧縮/shareを両方保持し、Export共通化でどちらかを削らない。RAWと表示色、元画像とProxy、手動正本と自動提案、印刷とSNSの契約を分けて整合させる。

## 元資料と調査の限界

- 元137：[SUITE_feature_types_2026-10-03.txt](../SUITE_feature_types_2026-10-03.txt)、2行に137/119/18と記載。これは旧接続表示の一覧であり、吸収先表ではない。
- 一次37：[UNIQUE_FEATURES_CONFIRMED.md](UNIQUE_FEATURES_CONFIRMED.md):3、表は9+14+10+4。
- 追加7：[UNIQUE_MISSING_SEVEN_AUDIT.md](UNIQUE_MISSING_SEVEN_AUDIT.md):20-34。名前/IDの回収であり、意味的独立性の全証明ではない。同16行は残りに重複・共通処理＋固有差分・保留が混在すると明記。
- Evoto下位操作：[EVOTO_FEATURE_MASTER.md](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md)。表中のM行番号はこのファイルの対象候補先頭行。先頭ID一行だけで親候補を評価せず、同操作群の下位行も読んだ。
- [photo.md](EVOTO_AUDIT/reviews/photo.md):9-16：通常Expand/生成Expand、eyes/gaze、mask sync、Pet Body、肌色とradiance等の区別。
- [workflow.md](EVOTO_AUDIT/reviews/workflow.md):5-19、[workflow_normalization.md](EVOTO_AUDIT/reviews/workflow_normalization.md)：Preset共有snapshot、語義検索、import/roundtrip、export variants。458 source facts/850 membershipsは137候補の分類件数ではない。
- repo直下にresearchディレクトリはなかった。docs/scripts/元一覧の文字検索で**Your dotの最新再調査、全93件の旧吸収先表は見つからなかった**。別チャット・外部保存物の不存在までは主張しない。
- 2026-10-04/05の監査の「未実装」は当時の証拠。2026-10-08追加のAstraコードを反映した共通化候補と区別している。読取りのみで、追加コードの動作や完成は検証していない。

## 共通核の参照表

表の「吸収候補」は以下の記号で参照する。既存核が提供する一部計算の再利用候補であり、全機能を吸収済みという意味ではない。省略ファイル名は同じprocessingディレクトリを指す。

| 記号 | 吸収先候補 | 根拠と境界 |
| --- | --- | --- |
| C | 色調整/Curve共通核 | `apps/web/src/processing/color-adjustments.mjs:32,79,96`、`point-curves.mjs:37,86`、`pure.mjs:97`。8-bit表示色処理。 |
| L | 学習Look・Profile/Preset | `apps/web/src/processing/astra-look-learning.mjs:46,116`、`astra-look-corpus.mjs:17,49,74`。`docs/PERSONALIZED_AI_LOOK_COMPLETION_AUDIT.md:12-18` は元23操作の区別。 |
| D | Detail/Noise/Export sharpness | `apps/web/src/processing/detail-adjustments.mjs:4,77`、`apps/web/src/export-output-adjustments.mjs:46,93`。通常DetailとExport後段は分離。 |
| G | Crop/変形基盤 | `packages/SuiteCore/Sources/SuiteCore/CropExport.swift`、`CropRecipeBridge.swift`、`apps/web/src/processing/region-repair-core.mjs` の `warpRegion`、`astra-face-core.mjs:66`。座標核があっても各操作のgeometry完成を意味しない。 |
| M | Mask/Segmentation基盤 | `apps/web/src/processing/subject-segmentation.mjs`、`region-repair-core.mjs` の `extractSeedRegion/checkedRegion`、`face-feature-geometry.mjs:31`。学習labelと部位意味は別。 |
| F | 顔/髪の共通核 | `apps/web/src/processing/faces.mjs:125`、`astra-face-core.mjs:35,66`、`astra-face-expression.mjs:20`、`astra-golden-blonde.mjs:11,67`。彩色・geometry・生成を区別。 |
| K | Makeup部品/Preset | `docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md:11-48`、`apps/web/src/processing/manual-eyeshadow-color.mjs`、`manual-blush-color.mjs`、`face-feature-adapter.mjs`。上位調整と素材styleを区別。 |
| B | 背景合成/生成基盤 | `apps/web/src/processing/background-composite.mjs`、`add-shadow-backdrop-placement.mjs`、`subject-segmentation.mjs`、`astra-image-model.mjs:49`。配置/マスク/推論adapterだけでは専用scene処理ではない。 |
| R | 修復/除去共通核 | `apps/web/src/processing/region-repair-core.mjs` の `repairRegion`、`masked-inpaint-onnx.mjs`、`batch-people-removal.mjs:19`。対象認識/修復と保存variantを分ける。 |
| X | Export/Import共通核 | `apps/web/src/export-size.mjs:27,155`、`export-naming.mjs:88`、`export-output-adjustments.mjs:93`、`processing/encode.mjs`、`processing/astra-look-corpus.mjs:74`。`docs/EXPORT_NAMING_COMPLETION_AUDIT.md:37` に宛先/競合/複数variant差。 |
| T | Camera/Tether設計 | `docs/SUITE_SPEC.md` 8節、`docs/ADDITIONAL_SPEC.md` 17-22節、`docs/EVOTO_AUDIT/EVOTO_TETHER_MATRIX.md`。この調査で機種別adapterの全照合はしていない。 |
| P | Preset正本と端末入口 | `apps/web/src/preset-facade.mjs:88`、`docs/EVOTO_AUDIT/reviews/workflow_normalization.md` のS596-W001〜W012、`docs/PERSONALIZED_AI_LOOK_COMPLETION_AUDIT.md:12,18`。静的presetと学習Lookは同義でない。 |
| W | Project/Cloud/端末入口 | `packages/SuiteCore/Sources/SuiteCore/CloudTransferPolicy.swift`、`docs/CLOUD_STORAGE_OVERRIDE.md` 9/12/16節、`docs/SMART_CULLING_COMPLETION_AUDIT.md:11-14`、`reviews/workflow_normalization.md` のS813。 |

## 全93行

「元行」は137候補txtの行番号。「M」はEvoto Masterの行番号。Lightroomは追加の下位資料が足りない場合、元137表示名を越えて推定せず資料不足とした。

| ID | 元表示名 | 吸収候補 | 残る固有操作・統合時の条件 | 根拠 | 判定 | 主担当候補 | 残コードに基づく理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| EV3-0436 | Basic | C: Color/Curve | 露光/HSL共通核はある。DehazeとBrightnessの意味・RAW段階WBを通常露光へ吸収しない。 | 元行6 / M446 / 共通核C | 差分追加 | Astra | RAW WB段階とdisplay色処理の整合、dehaze推定境界 |
| LR-03 | Light and Auto | C: Color/Curve | Lightの基本値は共用候補。Autoの入力/出力と元Adobe下位操作の個別対照が不足。 | 元行9 / 共通核C | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0551 | AI Color | L: Look/Profile | Auto Color、複数写真/背景整合、Look、参照Matchは学習Look一個と異なる推定/対象選択が必要。 | 元行11 / M561 / 共通核L | 差分追加 | Astra | Auto/参照Match/複数写真・背景の推定を統合 |
| EV3-0487 | Color Grading | C: Color/Curve | Highlights/Midtones/Shadowsの色とBlending/Balance。HSL色域別処理とは分割軸が異なる。 | 元行13 / M497 / 共通核C | 独立 | Sol | 明暗帯別色合成とBlending/Balanceの独立純粋処理 |
| LR-08 | Color Grading | C: Color/Curve | Evoto Color Gradingと同系統でもAdobeの色域/ブレンド/保存値の対応表が未回収。 | 元行14 / 共通核C | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0556 | Mobile Effects | C: Color/Curve | Retro/Atmosphere/Lo-Fi/Intensityの内容未特定。Glow/Grainだけに吸収する根拠なし。 | 元行15 / M566 / 共通核C | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| LR-07 | Point Color | C: Color/Curve | Point Colorの標本色/範囲/調整とHSL固定8色の対応根拠不足。 | 元行18 / 共通核C | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0459 | Profile | L: Look/Profile | Standard/LUT/B&W/intensity。学習行列ではなくprofile/LUT読取と適用順を追加確認。 | 元行19 / M469 / 共通核L | 差分追加 | Sol | LUT/profile読取・強度・適用順を既存色核に追加 |
| LR-01 | Profiles | L: Look/Profile | ProfilesのRAW camera profileと見た目presetの差を元Adobe資料で未照合。 | 元行20 / 共通核L | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0450 | White Balance | C: Color/Curve | AI/Auto WB、撮影光源別値、点/領域selector。現display-referred温度Tintとは別の推定。 | 元行22 / M460 / 共通核C | 差分追加 | Astra | 光源/選択領域からWBを推定しRAW/表示色へ整合 |
| LR-06 | Color Mixer | C: Color/Curve | HSL8色処理は再利用候補。Adobe Color Mixerの全操作・値域・selector対応未照合。 | 元行24 / 共通核C | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0475 | HSL | C: Color/Curve | 8色H/S/Lは共用可能。元Selectorの画面色選択/保存/適用差が残る。 | 元行25 / M485 / 共通核C | 差分追加 | Sol | 標本色からHSL制御値への変換と選択状態 |
| EV3-0463 | Curves | C: Color/Curve | 既存point/parametricを共用。Luma・4明暗区分・on-image・16点契約を丸ごと既存同等とはしない。 | 元行27 / M473 / 共通核C | 差分追加 | Sol | 既存curve核へのLuma/点数/帯域/画面選択差分 |
| LR-04 | Parametric Curve | C: Color/Curve | 既存3帯parametricとAdobeの区分/境界/曲線式の対照が不足。 | 元行29 / 共通核C | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| LR-05 | RGB and channel Point Curves | C: Color/Curve | PointCurves核再利用。旧監査後にgraph/contrast/refine saturation追加済。Adobe全操作の現行差分・端末を再確認。 | 元行30 / 共通核C、UNIQUE_COMPLETION_AUDIT_B.md:9、UNIQUE_FEATURE_PROGRESS.mdのPoint Curves追補 | 差分追加 | Sol | 既存point曲線核の操作・端末差分照合と変換 |
| EV3-0525 | AI Denoise | D: Detail | RAW-only推論と新.evr copy、原本課金条件。sRGB denoise/Detail Enhanceで代替不可。 | 元行32 / M535 / 共通核D | 独立 | Astra | RAW推論・新copy・既存原本管理の経路統合 |
| EV3-0516 | Detail | D: Detail | Sharpness/radius/detail共通核あり。Noise detail/contrast/色noise detail/smoothnessの独立制御が残る。 | 元行33 / M526 / 共通核D | 差分追加 | Sol | 既存detail核へnoise detail/contrastの独立制御 |
| LR-10 | Detail and Noise Reduction | D: Detail | Detail/Noiseの一部核を共有候補。AdobeのAI/RAW/各detail値を一括対応とする根拠不足。 | 元行34 / 共通核D | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| LR-09 | Effects | D: Detail | Glow/Grain/Vignette候補あり。Adobe Effectsの親項目境界が原137名称だけでは確定しない。 | 元行35 / 共通核D | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| LR-14 | Crop/Rotate/Geometry | G: Crop/Warp | Crop/Rotate/Geometry共通核あり。Adobe geometry固有下位操作の対応表が不足。 | 元行38 / 共通核G | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0683 | Desktop Crop | G: Crop/Warp | 固定/free/印刷寸法cropは共用。AI subject/face locate、頭サイズ/余白、向き別syncが固有。 | 元行39 / M693 / 共通核G | 差分追加 | Astra | 人物/顔認識に基づく頭サイズ・余白crop geometry |
| LR-12 | Lens Blur | M: Mask | Depth Lens Blurはblurフィルタだけで完結しない。Adobe depth/ボケ形状/焦点操作の個別資料不足。 | 元行40 / 共通核M | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0535 | Lens Correction | G: Crop/Warp | レンズprofileの自動/手動選択、distortion、constrain crop、光学vignette。postcrop vignetteとは別。 | 元行41 / M545 / 共通核G | 独立 | Astra | lens profileの歪みgeometryとcrop整合 |
| EV3-0575 | Mobile Lens Blur | M: Mask | AI depth、5ボケ形状、boost、focus range、depth可視化とmanual refinement。Motion Blurと異なる。 | 元行43 / M585 / 共通核M | 独立 | Astra | depth推定・焦点/遮蔽・bokeh合成の統合 |
| LR-11 | Optics and Lens Corrections | G: Crop/Warp | レンズ補正共通基盤候補。Adobe Optics profile/色収差等の下位対応が不足。 | 元行45 / 共通核G | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0710 | Rotate | G: Crop/Warp | 角度回転共用。左右上下flip、AI水平推定をrotate値だけで完成扱いしない。 | 元行46 / M720 / 共通核G | 差分追加 | Astra | AI水平推定と回転/flip座標整合 |
| EV3-0540 | Transform Correction | G: Crop/Warp | 射影/座標核は共用可能。AI level/vertical/smart、guided constraints、aspect/offset/scaleの操作差を追加。 | 元行47 / M550 / 共通核G | 差分追加 | Astra | 水平/垂直推定・guided拘束の射影geometry |
| EV3-0639 | Custom | M: Mask | brush/erase/mask核共用。線形/放射gradient、輝度内外range、mask上のcurve/HSL/grading/detail合成が固有。 | 元行49 / M649 / 共通核M | 差分追加 | Astra | 複数mask種と局所調整stackの合成順・座標統合 |
| EV3-0310 | Desktop Healing | R: Repair | spot copy/inpaint共用。Spot Healing/Patch/Clone Stampの別参照・位置/混合操作を追加。 | 元行50 / M320 / 共通核R | 差分追加 | Astra | clone/patch参照領域geometryと境界混合 |
| EV3-0292 | iPad Liquify | G: Crop/Warp | warp/保護mask共用。Twirl/Pucker/Bloat/Push Left/reconstructとPencil切替、10段履歴が固有。 | 元行51 / M302 / 共通核G | 差分追加 | Astra | twirl/pucker等の変形場・freeze・履歴整合 |
| EV3-0675 | iPad Masking | M: Mask | Person/background mask共用。overlay/visibilityとparametricを除くcurve等、iPad固有適用範囲が残る。 | 元行52 / M685 / 共通核M | 差分追加 | Sol | 既存maskの表示・適用範囲設定と端末操作 |
| LR-13 | Masking and Local Adjustments | M: Mask | 複数mask核はある。Adobeの局所調整集合・加減算/認識領域の全対応未照合。 | 元行53 / 共通核M | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0272 | Mobile Reshape | G: Crop/Warp | Liquify/warp核共用。回転/scale/逆向き、pin/freeze、Done/Cancel/Resetと10段履歴が固有。 | 元行54 / M282 / 共通核G | 差分追加 | Astra | 変形場・pin/freeze・逆変換と確定/取消整合 |
| EV3-0618 | Person | M: Mask | subject segmentation共用。耳/衣類上下/靴/装飾など13対象とall-person syncは顔oval代用不可。 | 元行55 / M628 / 共通核M | 差分追加 | Astra | 13部位の意味認識と複数人物sync対応 |
| EV3-0635 | Pet / Background | M: Mask | segmenter共用。PetとBackgroundのモデル意味labelと適用範囲を別保持。 | 元行56 / M645 / 共通核M | 差分追加 | Astra | Pet/Background意味mask推論と対象分離 |
| EV3-0631 | Skin subregions | M: Mask | skin mask共用候補。Face/Body/Neck/Allの意味分類と合成が追加条件。 | 元行57 / M641 / 共通核M | 差分追加 | Astra | Face/Body/Neck部位認識とmask合成 |
| EV3-0664 | Smart Selection | M: Mask | seed抽出/brush共用。interactive点/box、smooth/expand/contract/featherの値域とlayer操作が残る。 | 元行58 / M674 / 共通核M | 差分追加 | Astra | 対話点/boxの対象推定とmask形態処理統合 |
| EV3-0141 | AI Iris Correction | F: Face/Hair | 眼landmark/warp共用。Direct Gaze、片眼水平垂直/サイズはContacts彩色と別の変形/再構成。 | 元行61 / M151 / 共通核F | 差分追加 | Astra | 虹彩geometry・視線変形と眼の再構成 |
| EV3-0063 | Blemish Removal | R: Repair | 局所修復核共用。そばかす/ニキビ/ほくろ/目袋/各しわ/刺青等別分類とbeard/eyelid保護を追加。 | 元行62 / M73 / 共通核R | 差分追加 | Astra | blemish種類別検出と保護領域付き修復 |
| EV3-0321 | Body | R: Repair | 元BodyはPetのLeash/Stray Fur/Manual Brush。人間Body Reshape/Body Hairとは対象が異なる。 | 元行63 / M331 / 共通核R | 独立 | Astra | Pet leash/fur認識と対象固有の修復 |
| EV3-0092 | Child blemish texture | R: Repair | blemish核共用。Texture Retentionとunder3/older preset条件。年齢を画像から自動推測しない。 | 元行64 / M102 / 共通核R | 差分追加 | Sol | 既存blemish処理へ明示年齢preset/texture設定 |
| EV3-0124 | Eye appearance | F: Face/Hair | 眼mask/色/warp核共用。glare/vein/red-eye、12catchlight/位置、symmetry/reference eyeが別操作。 | 元行66 / M134 / 共通核F | 差分追加 | Astra | 眼異常検出・左右参照geometry・catchlight合成 |
| EV3-0325 | Eyes | F: Face/Hair | 元EyesはPet側。色/光/反射材共用でもpet eyes意味mask・屋内外catchlight素材が残る。 | 元行67 / M335 / 共通核F | 差分追加 | Astra | Pet eye意味mask認識と反射合成 |
| EV3-0175 | Facial Reshape / Eyes structure | F: Face/Hair | 眼landmark/warp共用。全眼/眼球/縦横/距離/目頭目尻/tilt位置と左右契約が必要。 | 元行70 / M185 / 共通核F | 差分追加 | Astra | 左右眼の多パラメータlandmark変形geometry |
| EV3-0152 | Facial Reshape / Face | F: Face/Hair | 顔warp共用。こめかみ/頬骨/顎/顔幅/額左右/人中/顔各部の別geometryが残る。 | 元行71 / M162 / 共通核F | 差分追加 | Astra | 顔各部の独立変形と重複領域geometry |
| EV3-0191 | Facial Reshape / Mouth | F: Face/Hair | 口landmark/warp共用。大きさ/縦横/tilt/M字/上下唇は表情生成の同義語でない。 | 元行73 / M201 / 共通核F | 差分追加 | Astra | 唇各部landmark変形と口内部保護geometry |
| EV3-0149 | Facial Reshape / Symmetry | F: Face/Hair | face warp/pose共用。Facial/Upper Body symmetryの対象/軸/0..100補正は姿勢変更と別。 | 元行75 / M159 / 共通核F | 差分追加 | Astra | 顔/上半身の軸推定と対称geometry |
| EV3-0199 | Full Body Reshape | G: Crop/Warp | 変形核共用。全身pose/人物境界、身長/首/胴/脚/左右の個別連動制御が残る。 | 元行76 / M209 / 共通核G | 差分追加 | Astra | 全身pose認識・境界と部位連動変形 |
| EV3-0220 | Hair | F: Face/Hair | Golden髪segmentation/彩色共用。分け目/ボリューム/生え際/飛び毛/光沢/白髪黒化は別処理。 | 元行77 / M230 / 共通核F | 差分追加 | Astra | 髪境界認識・生え際/volume geometryと修復生成 |
| EV3-0254 | iPad Full Body Reshape | G: Crop/Warp | EV3-0199へ共通body核を集約候補。iPadの首/腰/脚連動と操作差を削除せず保持。 | 元行79 / M264 / 共通核G | 差分追加 | Astra | 全身geometryとiPad部位連動を同じbody核へ整合 |
| EV3-0002 | Makeup / Contour | K: Makeup | EV3-0035 Contourのstyle/amountと共通候補。元上位Intensityとstyle導線を別記して統合。 | 元行80 / M12 / 共通核K | 差分追加 | Sol | Contour共通核の上位強度・style設定 |
| EV3-0005 | Makeup / Eye Makeup | K: Makeup | Eyeshadow/Eyeliner/Eyelashes共用。Eye Makeup上位のsat/明度/立体感と左右連動制御が追加。 | 元行81 / M15 / 共通核K | 差分追加 | Sol | 既存化粧部品の色/明度/立体感・左右制御 |
| EV3-0003 | Makeup / Eyebrow Makeup | K: Makeup | EV3-0019 eyebrow素材/amountと共用。眉形状warpでなく眉化粧、左右linked/separateが固有。 | 元行82 / M13 / 共通核K | 差分追加 | Sol | 眉化粧共通核への左右linked/separate設定 |
| EV3-0010 | Makeup / Lip Makeup | K: Makeup | EV3-0032 Lipstickと共用候補。上位sat/明度/立体感/左右linked制御を保持。 | 元行84 / M20 / 共通核K | 差分追加 | Sol | Lipstick共通核への上位色/明度制御 |
| EV3-0035 | Makeup components / Contour | K: Makeup | EV3-0002とContour核統合候補。style選択の素材/塗布はHighlightや顔reshapeとは別。 | 元行87 / M45 / 共通核K | 差分追加 | Sol | Contour素材の読取・塗布設定を共通化 |
| EV3-0019 | Makeup components / Eyebrows | K: Makeup | EV3-0003と眉彩色核統合候補。style素材/amountはEyebrows形状変形と独立。 | 元行88 / M29 / 共通核K | 差分追加 | Sol | 眉素材/style/amountの設定・変換 |
| EV3-0032 | Makeup components / Lipstick | K: Makeup | EV3-0010と唇彩色核統合候補。style/texture素材・唇外保護が残る。 | 元行93 / M42 / 共通核K | 差分追加 | Sol | 唇mask内の素材合成・texture/amount制御 |
| EV3-0015 | Makeup Suite | K: Makeup | 各makeup部品とPreset共用。suite組合せ/intensityとmale/children向けstyle資産が固有。 | 元行94 / M25 / 共通核K | 差分追加 | Sol | 部品preset組合せとsuite強度・明示style選択 |
| EV3-0247 | Mobile Facial Expression | F: Face/Hair | EV3-0243 expression処理へ共通化候補。Toothy5/Neutral0..3/default3・遮蔽拒否等mobile条件を維持。 | 元行95 / M257 / 共通核F | 差分追加 | Sol | 既存表情核のmobile値域・default・拒否条件 |
| EV3-0095 | Skin Retouching | R: Repair | 多尺度/tone/skin核共用。DodgeBurnと周波数別、skin texture仕上げ/複数肌色統一/tanlineが固有。 | 元行96 / M105 / 共通核R | 差分追加 | Astra | 肌認識・周波数分離・複数肌色整合の統合 |
| EV3-0348 | Backdrop Changer | B: Background | 背景合成/placement/segmentation共用。ライブラリCRUD、関連物体保持、色かぶり/床反射が追加。 | 元行100 / M358 / 共通核B | 差分追加 | Astra | 関連物体保持mask・色かぶり/床反射と背景合成 |
| EV3-0379 | iPad Backdrop Changer | B: Background | EV3-0348と背景核統合候補。手描き/関連物体保持・Shadow Anchor/iPad値域を保持。 | 元行102 / M389 / 共通核B | 差分追加 | Astra | 背景/関連物体maskと影anchorの座標整合 |
| EV3-0404 | Sky Replacement | B: Background | background合成共用。空専用mask、空gradient/角度、人物風景色match、水面reflection/blurが追加。 | 元行104 / M414 / 共通核B | 差分追加 | Astra | 空mask認識・照明match・水面反射geometry |
| EV3-0336 | Solid Backdrop Refinement | B: Background | region repair共用。背景照明統一/banding除去/背景enhanceは影追加や置換と異なる。 | 元行105 / M346 / 共通核B | 差分追加 | Astra | 背景照明推定・banding修復の領域処理 |
| EV3-0954 | AI Background Fusion | B: Background | 背景置換/生成adapter共用。foreground50層/順序・人物移動/回転・scene lighting・batch生成保存が固有。 | 元行107 / M964 / 共通核B | 差分追加 | Astra | 多層scene geometry・照明推論・batch生成統合 |
| EV3-1020 | AI Sky Replacement | B: Background | EV3-0404空選択mask共用。AI Lab専用生成・2候補/屋外条件は通常天空合成と分ける。 | 元行108 / M1030 / 共通核B | 差分追加 | Astra | 空maskと生成候補・条件判定経路の統合 |
| EV3-1017 | Belly Slimming | G: Crop/Warp | body変形/生成adapter共用。腹部専用生成・review/saveはwaist sliderと同一でない。 | 元行110 / M1027 / 共通核G | 差分追加 | Astra | 腹部認識と専用生成・保存variant統合 |
| EV3-1024 | Face Shadow Removal | F: Face/Hair | 顔検出/生成adapter共用。影/強highlight/stray light均衡モデルが必要でFace Brightness代用不可。 | 元行114 / M1034 / 共通核F | 差分追加 | Astra | 顔の影/highlight認識とrelight生成 |
| EV3-1068 | Mobile Relight | F: Face/Hair | EV3-1024とrelight核統合候補。Natural Light/Golden Hourの選択と生成compareが固有。 | 元行120 / M1078 / 共通核F | 差分追加 | Astra | relight生成核と照明条件・compareの統合 |
| EV3-1003 | People Removal | R: Repair | Batch PeopleRemovalのsegmentation/inpaint共用。再検出/brush/Continue/current-vs-copy保存選択が固有。 | 元行122 / M1013 / 共通核R | 差分追加 | Astra | 人物再検出/修復反復とcurrent/copy保存の統合 |
| LR-15 | Remove/Healing/Generative Remove | R: Repair | Healing/inpaint共用候補。Adobe Remove/Healing/Generative Removeのmode別source対応が不足。 | 元行123 / 共通核R | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0981 | Smart Removal / Magic | R: Repair | inpaintとsubject保護mask共用。Magicの領域/edge optimizationをQuickと同一モデルとは断定しない。 | 元行124 / M991 / 共通核R | 差分追加 | Astra | 対象保護認識とedge最適化付きinpaint統合 |
| EV3-0987 | Smart Removal / Quick | R: Repair | EV3-0981とmask UI/処理境界共用候補。QuickとMagicの内部/画素同等は資料不足。 | 元行125 / M997 / 共通核R | 差分追加 | Astra | Quick推論の実契約と共通mask/修復経路の整合 |
| EV3-1013 | Strong Glare Removal | F: Face/Hair | glare専用生成adapter候補。集合写真person選択とregular-glare先行編集注意はeye明度とは別。 | 元行126 / M1023 / 共通核F | 差分追加 | Astra | 人物選択・眼glare認識と専用生成 |
| EV3-0747 | Desktop Export format | X: Export/Import | 既存encode共用。Original format分岐、RAW→JPEG/alpha→PNG、TIFF16bit、JPEG容量指定を個別確認。 | 元行128 / M757 / 共通核X | 差分追加 | Sol | encoder分岐/bit depth/容量指定の出力差分 |
| EV3-0731 | Desktop Export modes | X: Export/Import | Final/ExportPreset/Batch共用。複数preset同時version、queue/previous、出力先/skip/replace/Instant連携が固有。 | 元行129 / M741 / 共通核X | 差分追加 | Astra | 複数preset/version/queue/宛先競合の経路統合 |
| EV3-0716 | Desktop Import | X: Export/Import | 既存import/decode共用。folder/上限・.lrcat/Collection/basic設定・Edit In roundtripは別codec/導線。 | 元行132 / M726 / 共通核X | 差分追加 | Astra | folder/import/外部現像codec/roundtripの複数経路整合 |
| EV3-0805 | iPad Tether Export destinations | X: Export/Import | Final共用。iPad picker/接続providerとOriginal/edited料金条件はDesktop出力先と別。 | 元行134 / M815 / 共通核X | 差分追加 | Sol | 既存Finalへの明示宛先・picker/出力条件adapter |
| EV3-0790 | Mobile Export | X: Export/Import | encode/size/sharpen共用。Photos/Files/share、sRGB/profile、撮影/出力時刻とmobile出力管理が残る。 | 元行135 / M800 / 共通核X | 差分追加 | Sol | 既存encode/size核へのmobile宛先・時刻設定 |
| EV3-0811 | Desktop Wired | T: Tether | USB取込core候補。実camera adapter/Live View/trigger/secondary-display等を全対応判定できる資料不足。 | 元行137 / M821 / 共通核T | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0821 | Desktop Wireless | T: Tether | 共通capture session候補。同一network機種対応、wired同時、preview rotation等の実adapter根拠不足。 | 元行138 / M831 / 共通核T | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0828 | iPad Wired | T: Tether | 共通Tether設計候補。iPad USB detect取消/再開・metadata・filterの個別到達点未照合。 | 元行139 / M838 / 共通核T | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0837 | iPad Wireless | T: Tether | 共通Tether設計候補。iPad Wi-Fi探知/命名日付制限の対応未照合。 | 元行140 / M847 / 共通核T | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0845 | Mobile Wired | T: Tether | 共通camera adapter候補。USB-C/Lightning OTG/SD card/iOS/権限/機種条件をdesktop扱いにしない。 | 元行141 / M855 / 共通核T | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0851 | Mobile Wireless | T: Tether | 共通camera adapter候補。mobile Wi-Fi/network/camera権限・SD/iOS条件の個別資料不足。 | 元行142 / M861 / 共通核T | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0876 | Cloud Space | W: Project/Cloud | 既存Original/Proxy/Cloud Safe共用。Space/Team/履歴/lazyload/優先export/容量管理を個別照合、競合の期限削除は採用しない。 | 元行144 / M886 / 共通核W | 差分追加 | Astra | Original/Proxy/Team/履歴/容量・export優先の整合 |
| EV3-0858 | Desktop presets | P: Preset | preset-facade/Personal/Workspace/Author共用。token snapshot・group/import/profile依存とRecommendedが残る。 | 元行146 / M868 / 共通核P | 差分追加 | Astra | preset snapshot/profile資産/import/推薦の経路統合 |
| LR-18 | Export and Share | X: Export/Import | Final/share核候補。Adobe Export and Shareの全下位操作、公開share契約の対照不足。 | 元行147 / 共通核X | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |
| EV3-0933 | Hot Edits | P: Preset | Preset選択/applyへ吸収候補。iPad-exclusive Home entryであり新しい色処理/Smart Cullingではない。 | 元行148 / M943 / 共通核P | 差分追加 | Sol | 既存Preset適用へのiPad Home入口のみ |
| EV3-0926 | iPad Home | W: Project/Cloud | Project/Import/Smartツールの入口へ吸収候補。Recent/reopen/Files/Photos/Tether/share importのmobile routingが残る。 | 元行149 / M936 / 共通核W | 差分追加 | Sol | 既存機能へのHome routing/Recent状態 |
| EV3-0865 | iPad presets | P: Preset | Desktop preset共通正本候補。iPad Default/Adjusted filter/token import/Hot categoryを別保持。 | 元行150 / M875 / 共通核P | 差分追加 | Sol | preset共通正本の端末filter/category/import設定 |
| EV3-0592 | Mobile XMP/CUBE compatibility | P: Preset | profile/preset同期へ吸収候補。desktop作成presetの必要XMP/CUBE download、Mobile直接upload非対応という方向差。 | 元行151 / M602 / 共通核P | 差分追加 | Sol | 同期済みpreset依存XMP/CUBEの取得・適用境界 |
| LR-17 | Presets and Versions | P: Preset | Preset/Revision共通核候補。Adobe versionsとSUITE Recipe revisionの保存/自動/復元条件の対照不足。 | 元行153 / 共通核P | 資料不足 | 未確定 | 下位操作/現行コードの対照不足。難度・追加要否を確定しない |

## Look・Culling・Exportの重複と競合を先に潰す判断

1. **PresetとPersonalized Lookは別。** PresetのCRUD/共有/版管理へLookの保存UIは寄せられるが、before-after学習、RAW/nonRAWモデル別、推定baseline、固定値/補正は残す。静的presetを学習済みLookと呼ばない。AI ColorのAuto/複数写真整合/背景整合/参照Matchも単一Look適用だけでは満たさない。根拠：Master M561〜565、PERSONALIZED_AI_LOOK_COMPLETION_AUDIT.md:12-18、astra-look-learning.mjs:46,116。
2. **Hot EditsはHomeのPreset入口。** M943はiPad-exclusive entryと明記。新しいretouch engineやSmart Culling分類器は不要だが、既存Presetへ入る端末routeは残す。iPad Home全体にはRecent/reopen/複数import経路があり、Hot Edits一個に縮約しない（M936〜943）。
3. **Culling手動正本と自動提案を二重保存しない。** smart-culling-projectとNode Workspace marksはStars/Flags/Tags/Segmentsの正本。astra-culling-analysis.mjs:113は提案を返す別責務。自動結果を反映する将来の一箇所のadapterを設け、既存manual markを無条件上書きしない。Perfect Shotは顔交換と新コピー生成であり、Cullingのbest pickに吸収不可（PERFECT_SHOT_COMPLETION_AUDIT.md:3-10）。
4. **XMPの実コード重複/形式競合あり。** astra-culling-analysis.mjs:190のcullingMarksXMPは属性型/独自suite:Flagを出す。一方workspace-culling-xmp-sidecar.mjs:37-39はpickを拒否しrejectをRating=-1へ写像。workspace-culling-xmp-import.mjs:32の厳格parserは限定要素型Rating/Labelのみ受理する。新旧XMPを同じ往復契約と見なせない。削除/統合は今回行わず、既存の認可つきsidecar正本へ揃える方針を次段で決める。
5. **XMP ColorとXMP Cullingも別。** astra-look-corpus.mjs:17はCamera Raw namespaceの限定色設定を読み、49で明示SUITE近似時だけ色処理。上記Rating/Label parserとはデータ意味が違う。XML/UTF8防御は共通化できても、色設定をmarkとして吸収しない。
6. **Exportの寸法/命名/出力調整/format/modes/OS先を分離。** export-size.mjs:27,155は画素寸法、export-naming.mjs:88は名前、export-output-adjustments.mjs:93はresize後sharpen。Desktop Export modesのqueue/複数preset/skip/replace/保存先はこれらの結果を束ねる責務。Mobile/iPad OS picker/Photos/shareはさらに別adapter。通常Detail sharpnessをExport sharpeningへ重複適用しない（OUTPUT_ADJUSTMENTS_COMPLETION_AUDIT.md:18,26）。
7. **名前の罠を保持。** EV3-0321 Bodyと0325 EyesはPet操作、Human Body/Eyesではない。Makeup EyebrowsとFacial Reshape Eyebrowsは彩色素材対geometry。HairとGolden Blondeは一部mask/色だけ共有、分け目/白髪黒化/飛び毛等を消さない。Mobile Effectsは原台帳でも保留（UNIQUE_FEATURES_CONFIRMED.md最終行）。

## 次の判定に必要なもの

本表は93行を一度全部見える形にした暫定処理計画。資料不足22行は対応する元下位仕様と現行コードの追加照合が必要。差分追加66行は既存核へ寄せて固有の入出力・モデル・保存/端末条件だけを追加する候補であり、新規大機能を66個作る意味ではない。独立5行も既存44の確定集計に足さない。過去Your dot結果が別途見つかれば、本表のIDをキーに差分照合し、出典のない削除/統合を避ける。
