# Web接続計画（2026-10-08）

## 2026-10-09 最新差分（下の過去進捗より優先）

追記: 旧4メイク保存版は明示ローカル同意で比較/復元/通常描画へ接続済み。手持ち深度JSONはユーザー承認を受けwebDepthRangeとして実装、仕様はWEB_DEPTH_INPUT.md。Curve導線とRAW NR概要集合漏れも修正。以下の旧4メイク/深度が丸ごと未接続という過去記述よりこの追記を優先する。旧そばかす専用保存版、専用補正Batch、認証済クラウド、Personal200組/RAWは別残件であり、全体完了とはしない。

今回Web反映済み: W01局所LUT、W14星/flag絞込、W17手動変形とブラシ座標、手動レンズ歪曲/色収差、W19小領域近傍修復、W20旧手/衣服の比較・復元・通常編集、W15非AI RAW NR。コード/配備済みであり、実写真の品質・動作合格を意味しない。

残境界: 旧4メイク履歴は本人/人物認可の専用runtime、Personal200組/RAW学習はLiteとは別、深度マスクは実深度資産の入力方式、クラウドLUTは認証済資産manifest、Workspace書出しPresetはprincipal/tenant、Proxy同期/容量は実provider/ACL接続が必要。AI/テザー/Apple/HDR/大判は指示どおり保留。ローカル同梱LUT/個人Look係数可搬/通常ローカル書出しPresetを上記クラウド依存の未実装と混同しない。

## 実装進捗：簡単な差分から順に

W03 JPEG品質：1〜100％/初期95の共通UIを単写真全入口とBatchへ接続。保存済みexport品質/形式との矛盾を事前拒否、Batchは全選択のRecipeを読取り確認後に開始。入力変更で生成済リンク破棄、取消/dispose対応。PNG/TIFF既存値維持。検査/buildなし。

W03単写真命名：指定文字＋件数/連番を既存命名核へ接続。単写真はsequence=1,total=1。必須入力/生成済リンク破棄/既存命名維持。JPEG品質指定を続行中。検査/buildなし。

WB固定照明：6種類の照明選択→session/Undo/保存→既存WB核→Preview/Final、Preset可搬化のコードを追加。RAW camera WB/自動/灰色点選択は未接続。検査/buildなし。

W21保存記録：認証済みSitesのみ明示button→既存listAssets→cloudSafe返却記録件数/未確認/有効bytes合計/取得時刻表示を接続。失効/失敗で旧成功表示を破棄。契約容量・端末間同期・新CloudSafe判定・削除は含まない。検査/buildなし。

W20色調整Preset：grading/pointColor/tonalBands/profile/sceneBasicの5枝をportablePresetRecipeへ追加。厳格検証後にコピー、写真固有データは拒否。Full Applyの既存postDecode全体置換仕様は維持。新色調整を理由にPreset保存が拒否される未接続を解消するコード。検査/buildなし。

W20公開Preset名前検索：実listPresetsの取得結果へ既存selectPresetCatalogを接続。未取得/取得0件/検索一致0件を区別。全体・Glowのみ・周辺光量のみの既存適用/認可は維持。未接続metadataの分類は追加していない。検査/buildなし。

画像上カーブ：After標本→既存adjustCurveOnImage→setPointCurve/Undoの接続コード作成済み。master/R/G/B、変更量指定。16点超は切捨てずこの操作を拒否。HSLモードと排他。検査/buildなし。

HSL採色：After画像の表示座標→標本RGB/色相→既存8色HSL一括更新/1Undoの接続コード作成済み。写真/版/Recipe/After変更後の標本を拒否。画像上カーブ操作も並列追加中。検査/buildなし。

標準・白黒Profile：既存applyColorProfileを使い、明示選択/強度→Recipe/Undo→保存validator→共通Preview/Finalの接続コードを作成済み。RAWカメラprofile・ICC・LUT取込はこの下位作業に含めない。旧設定を維持しprofileだけリセットする。

Brightness/Dehaze：既存applySceneBasicをprofile後に呼ぶsession/保存/描画接続コードを追加。独立UIを並列作成。Exposureと別操作、RAW復元ではない。検査/buildなし。

4帯域カーブ：画面→setTonalBands→Recipe/Undo→保存validator→Preview/Finalの接続コードを作成。既存delta66-color-curvesを再利用。旧3帯域と新4帯域が両方非ゼロなら明示拒否し二重適用しない。旧値の自動削除・変換なし。検査/build/配備なし。

ポイントカラー上限の続報：point-color-render.mjsで既存核を小さい行stripへ分割し、通常Web共通の24MPまで処理する接続に変更。以前の「8MPでFinal拒否」は解消するコード。全体出力bufferは必要で、B0倍判向けストリーミング出力完成ではない。UI説明も更新。検査/buildなし。

W01 / LR-07：ポイントカラーの手動選択範囲UI、session/Undo、保存validator、Preview/Final共通renderの接続コードを作成済み。最大16選択、色相帯と彩度/明度の4境界、各選択のH/S/L補正、全体Amount。既存lr-point-colorを再利用し、カーブ前に一度適用。採色・範囲可視化は未接続。既存核の8MP上限を維持するため大判出力対応の完了ではない。検査/build/配備なし。

W01 / LR-08：カラーグレーディングの接続コードを追加。全体・暗部・中間・明部のH/S/L、Blending/Balance/Amountを明示適用し、既存Recipe・Undoへ渡す。保存validatorとPreview/Final共通renderへ同じgrading設定を接続。既存カーブ後、Glow前に一度適用する。リセットはgradingだけを削除。他の調整は維持。検査・実験・build・配備は未実施。Preset互換とW01全体の完了を意味しない。

並列続行：W01の自動Light提案を原Proxy解析→8値表示→明示Amount適用→既存commitRecipeの1履歴へ接続。Asset/SHA/版/Recipe変更で古い提案を拒否。W14の非顔・モデル不要セレクトを準備済Proxy→品質/類似提案→明示選択→既存Batch選択へ接続（最大20、原本取得/削除/評価保存なし）。W20は現在の保存済版へローカル命名/改名/名前削除パネルを接続。通常APIが過去履歴を公開しないため過去版取得/比較描画/端末間同期は未接続と表示。全機能群の完了ではなく各群の下位接続。新規web-connected-* 5ファイルとsession/editor接続。検査/build/配備なし。

続行：W03の下位作業「厳密幅×高さ」を既存出力サイズ画面へ追加。余白/中央切抜き/引伸ばしをユーザーが明示選択し、余白色も指定。単写真・Batchの既存size引数→resize処理へ接続。処理中disableと設定変更時のBatch生成済リンク破棄も対象。従来dimensionsの枠内縮小は維持。今回の下位接続コードは累計2件、W03全体は未完了。検査/buildなし。

ユーザー指定で既存経路への小さい接続から着手。W03の下位作業「Screen/Print出力シャープ」の接続コードを作成。export-output-adjustments-ui.mjsにScreen/Print×Low/Standard/High、session.mjsの単写真/Batchでnone以外を既存処理核へ渡す。単写真専用フォームにも既存サイズ・印刷密度設定を渡す。新アルゴリズム/上限緩和/原本変更なし。検査/build/配備は未実施。

これは下位作業1件であり、W03全体や25項目中1項目の完了ではない。W03にはqueue/命名等が残る。25単位の今回接続完了は0、W03着手。次も既存核への軽い接続を優先する。

## 数え方と確定範囲

接続作業を **25単位（共通基盤3＋機能群22）** に固定する。これは本計画の作業分割であり、独立した製品機能数や全項目の所要時間ではない。元の44件＋採用差分65件＋Lightroom14件＝延べ123行を下表へ対応させる。重複する機能を二重実装せず、異なる下位操作は保持する。表のコードがあることと接続完了は別。既存接続もあるため、全件未実装・全件接続済みのどちらとも扱わない。

今回の成果は読取り診断と計画のみ。製品コード、試験、build、実画像操作、配備は変更・実行していない。難度は静的な依存関係に基づく設計評価であり、実測工数ではない。

順序はWeb→Apple→AI資産の導入・実装→最後にメーカーSDK申請資料ZIP。Appleネイティブテザー6部品をWeb対応として数えない。SDK通信は保留。Webにない大判RAW renderer・任意ICC・BigTIFF・TSQ・Adobe私有形式を単なる未接続と扱わない。

## 共通基盤3単位（Astra統合担当が排他所有）

|ID|作業|難度|接続先と完了条件|
|---|---|---|---|
|C01|Recipe・保存・Undoの契約|高|backend/photo-policy.ts、Web session.mjs、各API client。版・許可キー・対象Asset/SHA・履歴を整合し、旧Recipeを維持。未知値を黙って破棄しない。|
|C02|Worker・Preview・Final共通経路|高|processing/index.mjs、worker.mjs、pure.mjs、session.mjs。演算順、Proxy/原寸座標、取消、旧処理との二重適用を統一。RGBA8/線形16/Float32は別扱い。|
|C03|派生画像・ジョブ・依存待ち|高|session/既存Asset保存と生成core。候補比較・採用・取消・部分失敗を接続。採用済結果のSHAを保存してFinalで再生成しない。未提供モデルは実行不可と明示。|

## 機能群22単位

IDは接続作業の主担当。複数の共通基盤に依存しても元候補は一群だけに計上する。S=Sol、M=混合、A=Astra。65件のIDは元台帳名を保持し、同じ操作の端末別表示をWeb専用複製しない。

|ID|機能群|難度|既存入口／不足接続|
|---|---|---|---|
|W01|色・階調・ヒストグラム|中〜高|editor-ui/session→pureの色stage。既存Levels/HSL等を維持、Profile・提案・Point Color・Grading等の追加値をC01/C02へ。統計提案とモデル依存AI Colorは別扱い。|
|W02|切抜き・回転・幾何・手動拡張|高|既存crop/canvas UI・worker、delta66-scene-geometry。表示と原寸座標・有効矩形を統一。|
|W03|書出し・命名・サイズ・共有|高|session.exportFinal/exportBatchFinal、delivery-runner。queueと保存receipt、Screen/Print sharp、印刷/SNSを接続。Apple宛先・大判nativeは後段。|
|W04|端末間互換|高|cross-device-compat、認証済転送。Web側の差分保持・非対応表示を接続。Apple受信は後段。|
|W05|HDR|高|astra-hdr/hdr-export-routing。Float32→SDRとRGBE保持を別経路に。未対応HDR codecは拒否。|
|W06|顔の局所変形|高|face-feature-adapter、眉/鼻核。顔選択・認可・遮蔽確認・写真固有Recipe・原寸再適用。|
|W07|メイク|高|makeup-detected-pipeline/delta66-makeup-render。独自style UIと本人/写真固有保存、既存手動経路を維持。|
|W08|衣服・手・歯|高|region-repair-model-pipeline。領域選択/修復/warpと歯生成を区別。モデル待ちあり。|
|W09|影・白黒縁|高|既存影bridge/Finalと自動抽出。元影→追加影順、mask/幾何/Syncを統一。自動モデル待ちあり。|
|W10|顔認識・表情・姿勢|高|astra-face-*。本人提供galleryと同意、条件生成、照合。モデル待ち。|
|W11|Perfect Shot|高|astra-perfect-shot。複数写真→候補→新コピー採用。モデル待ち、TSQは未対応。|
|W12|生成・特殊修復・一括候補|高|astra-generation-*、batch-people-removal。C03経由、機能別操作を維持。モデル待ち。|
|W13|個人Look学習|高|astra-look-learning/corpus。学習入力/版付きLook管理/適用を接続。Adobe私有現像は対象外。|
|W14|セレクト|高|workspace-culling-panel/client＋astra-culling。自動採点・類似群・検索を追加。意味検索/顔モデル待ち。|
|W15|ディテール・RAWノイズ除去・効果|高|既存detail stage＋lr-raw-denoise。通常NRと線形RGB16を分ける。AI NRモデル待ち。|
|W16|マスク・選択|高|delta66-portrait-masks/lr-range-masks。選択/合成/保存、Asset・SHA・geometry照合。深度/semantic入力待ちあり。|
|W17|肌・目・髪・身体補正|高|delta66-portrait-*。選択人物/保護領域/再解析・変形を接続。モデル依存操作は後段。|
|W18|背景・空・照明|高|delta66-scene-*。背景資産選択、合成/光/影と写真固有保存。モデル・素材待ちあり。|
|W19|除去・修復|高|delta66-portrait-repair/scene workflows。ブラシ/参照領域、手動と生成の区別、C03採用固定。生成モデル待ち。|
|W20|Preset・名前付き版・互換取込|高|workflow/preset群、lr-named-versions、backend専用service。既存履歴/認証route再利用、分類と版CAS、CUBE/XMP subset。|
|W21|Cloud管理|高|delta66-workflow-workspace-client→既存Workspace API。容量/履歴/復元/認可を既存画面へ。公開配備は別。|
|W22|光学・レンズ補正|高|lr-lens-correction。校正資産とuncropped座標、補正→有効Crop。校正データ依存。|

## 44件の対応（44行分、11＋16＋17）

|接続先|元IDと正式名|
|---|---|
|W01|S LR-02 Histogram and clipping; S EV3-0586 Color Calibration; S EV3-0560 Mobile Glow Effect; S EV3-0501 Selective Color; S EV3-0528 Grain; S EV3-0570 Mobile Post-Crop Vignetting; M EV3-0492 Levels|
|W02|S EV3-0701 Manual canvas Expand|
|W03|S EV3-0764 Desktop Export naming; S EV3-0757 Desktop Export size; S EV3-0773 Desktop Output adjustments|
|W04|S EV3-0873 Desktop ↔ iPad compatibility|
|W05|A LR-16 HDR Optimization|
|W06|M EV3-0169 Facial Reshape / Eyebrows; M EV3-0185 Facial Reshape / Nose|
|W07|M EV3-0001 Makeup / Highlight; M EV3-0030 Blush; M EV3-0027 Contacts; M EV3-0023 Eyelashes; M EV3-0025 Eyeliner; M EV3-0021 Eyeshadow; M EV3-0037 Face Decorations|
|W08|M EV3-0313 Clothing adjustments; M EV3-0232 Hands; M EV3-0235 Teeth|
|W09|M EV3-0396 Add Shadow; M EV3-0342 Black & White Edge Removal; A EV3-0394 Original Shadow|
|W10|A EV3-0243 Facial Expression; A EV3-0145 Head Pose; A EV3-0049 AI Facial Recognition|
|W11|A EV3-0921 Perfect Shot|
|W12|M EV3-0934 Batch Edit (People Removal); A EV3-1041 Body Hair Removal; A EV3-0993 Clothing Moiré Removal; A EV3-0938 Generative Expand; A EV3-1029 Grass Fill; A EV3-1046 Liquify Background Repair; A EV3-1073 Mobile Motion Blur; A EV3-1058 Detail Enhance; A EV3-1037 Golden Blonde Hair; A EV3-1051 Old Photo Restoration|
|W13|A EV3-0595 Personalized AI Look|
|W14|A EV3-0894 Smart Culling|

## 採用差分65件の対応

|接続先|元IDと項目|
|---|---|
|W01|EV3-0436 Basic; EV3-0551 AI Color; EV3-0459 Profile; EV3-0450 White Balance; EV3-0475 HSL; EV3-0463 Curves; LR-05 RGB and channel Point Curves|
|W15|EV3-0516 Detail|
|W02|EV3-0683 Desktop Crop; EV3-0710 Rotate; EV3-0540 Transform Correction|
|W16|EV3-0639 Custom; EV3-0675 iPad Masking; EV3-0618 Person; EV3-0635 Pet / Background; EV3-0631 Skin subregions; EV3-0664 Smart Selection|
|W19|EV3-0310 Desktop Healing; EV3-1003 People Removal; EV3-0981 Smart Removal / Magic; EV3-0987 Smart Removal / Quick; EV3-1013 Strong Glare Removal|
|W17|EV3-0292 iPad Liquify; EV3-0272 Mobile Reshape; EV3-0141 AI Iris Correction; EV3-0063 Blemish Removal; EV3-0092 Child blemish texture; EV3-0124 Eye appearance; EV3-0325 Eyes; EV3-0175 Facial Reshape / Eyes structure; EV3-0152 Facial Reshape / Face; EV3-0191 Facial Reshape / Mouth; EV3-0149 Facial Reshape / Symmetry; EV3-0199 Full Body Reshape; EV3-0220 Hair; EV3-0254 iPad Full Body Reshape; EV3-0095 Skin Retouching; EV3-1017 Belly Slimming|
|W07|EV3-0002 Makeup / Contour; EV3-0005 Makeup / Eye Makeup; EV3-0003 Makeup / Eyebrow Makeup; EV3-0010 Makeup / Lip Makeup; EV3-0035 Makeup components / Contour; EV3-0019 Makeup components / Eyebrows; EV3-0032 Makeup components / Lipstick; EV3-0015 Makeup Suite|
|W10|EV3-0247 Mobile Facial Expression|
|W18|EV3-0348 Backdrop Changer; EV3-0379 iPad Backdrop Changer; EV3-0404 Sky Replacement; EV3-0336 Solid Backdrop Refinement; EV3-0954 AI Background Fusion; EV3-1020 AI Sky Replacement; EV3-1024 Face Shadow Removal; EV3-1068 Mobile Relight|
|W03|EV3-0747 Desktop Export format; EV3-0731 Desktop Export modes; EV3-0805 iPad Tether Export destinations; EV3-0790 Mobile Export|
|W21|EV3-0876 Cloud Space|
|W20|EV3-0858 Desktop presets; EV3-0933 Hot Edits; EV3-0926 iPad Home; EV3-0865 iPad presets; EV3-0592 Mobile XMP/CUBE compatibility|

EV3-0716 .lrcat/Collection移行はユーザー指定で除外。W03のPhotos/Files native保存、W20のiPad専用画面はApple工程に分離。Webはその共通データ/納品/分類操作を接続し、native実装を完了としない。

## Lightroom14件の対応

|接続先|元IDと項目|
|---|---|
|W01|LR-01 Profiles; LR-03 Auto Light; LR-04 Parametric Curve; LR-06 Color Mixer; LR-07 Point Color; LR-08 Color Grading|
|W15|LR-09 Effects; LR-10 Detail / NR|
|W22|LR-11 Lens Correction|
|W16|LR-13 Range Masks|
|W02|LR-14 Crop / Rotate / Geometry|
|W19|LR-15 Remove / Healing|
|W20|LR-17 Named Versions|
|W03|LR-18 Export / Share|

LR-12 Lens Blurは不採用。深度生成を範囲maskそのものと混同しない。

## 作業順と報告

1. C01〜C03の契約を先に固定。既存session、editor-ui、worker、pure、photo-policyは一人の統合担当が排他編集する。
2. W01/W02/W03/W15/W20/W21/W22の資産不要部分から接続。既存UI接続済み機能は差分だけ。
3. W06〜W19の人物・背景・生成・選別等とW04/W05の専用経路を接続。モデル/校正不足は理由付き実行不可にし、手動機能は残す。
4. 機能別独立adapter/UI部品は並列可。共有ファイルの同時編集は不可。資産導入は後続AI工程。
5. 進捗は25単位中の接続コード完了数を先に出す。各行に残りの接続箇所・依存待ちを併記。入口ボタンだけで完了にしない。実機/画質/動作確認済み数を混ぜない。

## 読取り根拠

- docs/UNIQUE_FEATURES_CONFIRMED.md、UNIQUE_MISSING_SEVEN_AUDIT.md、UNIQUE_FEATURE_PROGRESS.md
- docs/MIXED_16_CODE_HANDOFF.md、ASTRA_17_CODE_HANDOFF.md、DELTA66_CODE_HANDOFF.md、LIGHTROOM_14_CODE_HANDOFF.md
- apps/web/src/bootstrap.mjs: EditorSession/createProcessing/mountEditorを構成。
- apps/web/src/session.mjs: setAdjustment、save、render、exportFinal、exportBatchFinal。通常Finalのsharpはmanual条件が残り、新Screen/Print分岐は追加対象。
- apps/web/src/processing/pure.mjs:97以降: 許可Recipeキーと固定描画順。新moduleはimportだけで自動接続されない。
- apps/web/src/processing/index.mjs と worker.mjs: RPC入口。apps/backend/src/photo-policy.ts:26以降: 保存値・順序検証。
- workspace-culling-panel.mjs、lr-named-versions.mjsとbackend/lr-named-versions.ts、delta66-delivery-runner.mjs: 各既存host入口。
