# Solへの正本引継ぎ

## 2026-10-13 今回のMac除外範囲の返却

D04はユーザー承認の正式2D方式でコード完成。全body明示領域/強度、実人物mask保護、preview、Undo/CAS保存を接続。AI_BODY_WARP_2D_OVERRIDE_2026-10-13.mdが最新決定。

現コードから追加発見したE04/E05の不足も実装。既存確定captureへローカル原本を明示投入→既存worker→到着assetIDのEditor表示、queue/correlation正本による原本未確定/解析中/人物入力保留/保存照合の表示。SDKイベントを捏造せず、未導入モデルや未確定人物は保留。

H05確認表作成済み。Mac彩度/cropはXcode工程、追加3モードは名称/初期値未定義、素材制作/許諾とSDKイベント供給は別工程。今回のコード完成を製品全体の動作合格とはしない。検査・ビルド・配備・実通信は未実施。最新照合はAI_REMAINING_CODE_RECONCILIATION_2026-10-13.md。

## 2026-10-13 最終2件のコード追加

D04の既存Web実関節規則を胴/腰/左右上腕/左右大腿・下腿に接続。mask/preview/group/Undo/CAS保持。強度presetは項目別明示設定（未設定拒否）でCUSTOM維持。距離/尺度producerと一部自動controlは未実装、手動版を全自動完成と数えない。

H02のMac照合用固定入力を既存Web UIから書出せるように追加。詳細はMAC_COLOR_CROP_HANDOFF_2026-10-13.md。実機照合は未実施でありユーザー指定の後工程。残2件の全完了ではない。今回検査・ビルド・配備なし。

## 2026-10-13 ユーザー確定：残2件

彩度・小数位置cropのApple→Web互換は『既存の見た目を維持し、Macで照合して仕上げる』を採用。未公開の計算を推測して置換しない。ユーザーは続いて残2件の完了を指示。コード実装とMacでの実結果照合を混同しない。D04は既存強度規則と実解析供給を優先して探し、仮係数を足して自動実装済みとしない。

## 2026-10-13 並列残件の追加実装

運営用generation-reconciliation/service/CLIを追加。未知結果に実証拠を照合し、監査・PNG・精算を原子的保存するコードまで接続（実行なし）。D04に明示規則入力の手動補助を追加。外部JSONを実解析証拠にせず、現在Vision肩/腰領域との一致と実instance mask保護を要求。自動体型推定ではない。

H02 bundle v2は背景なし局所補正/warpを実proxy寸法と原本SHAで復元し、旧v1維持。素材と全履歴を含むJSONの明示移送も接続。backend photo-policyはschemaVersion/engineVersionのv1/v2整合した組のみ許可。CI色control等の全描画互換残件は別記、未対応を無視しない。テスト・ビルド・配備なし。

## 2026-10-13 残作業継続：生成サーバー接続とWeb復旧

生成の管理者料金表・別credit台帳・原子的予約・単発provider送信・出力不変保存・二重精算防止を実装。Editor→人物パネル→ServerGenerationLaunchView→見積/予約/送信→ServerGenerationCandidateReview→既存Undo/CAS採用まで接続。モデル/価格/認証/資金は未設定で、実通信はしていない。原本を自動uploadせず、既存遠隔写真と保存版一致を要求。サーバー状態GETは保存済み出力から精算復旧するが外部再送はしない。設定手順はGENERATION_SERVER_SETUP_2026-10-13.md。

H02は対応済みApple bundleをIndexedDB不変保存→Web編集履歴→再読込まで接続。全履歴の原本束縛、active資産のSHA/存在、Undo/Redo/save直前の再確認と失敗rollback追加。contrast/saturation等の未対応はAI_PARTIAL_12_PROGRESS_2026-10-13.md最新表へ明示。

E06元条件の再起動復旧・二重適用防止はコードあり。新写真の自動本人確定等とは別。D04承認済み2D手動変形はコードあり、自動adaptiveBodyの距離/尺度証拠とcontrol変換規則は未確定。6件全体完了とはまだ報告しない。検査・ビルド・推論・配備なし。

## 2026-10-13 承認部位の手動自由変形を追加

鼻・写真上左右の目（サイズ/幅/高さ/位置/角度）、胴・写真上左右の胸（幅/2Dボリューム/位置）をLocalManualPartWarpAdapterから既存warpへ接続。Model/Panelで部位選択、初期0、本人対応/同意、実人物mask保存・供給、確定時の対応再照合を実装。既存プレビュー→操作追加→Undo/CAS保存を再利用。自動部位検出・3D人体推定は実装していない。コード作成済みであり動作検証済みではない。検査・ビルド・配備は未実施。残6件全体の完了宣言ではない。

## 2026-10-13 残6件の再開追記

6件に実コード追加。詳細はAI_PARTIAL_12_PROGRESS_2026-10-13.md先頭。全6件完成ではなく、以下の旧集計は据置。E06復旧順序、G01固定config照合、G04候補採用lease、H02対応編集のWeb Undo入口、D04永続人物maskとPreview/Final/tileの厳密照合を追加。D04自動体型の移動規則は未定義。G01真正見積/G03正式応答/Web全編集復元/G02-G05課金接続を黙って完成から除外しない。検査・ビルド・配備なし。

## 2026-10-13 最新集計（下の途中集計に優先）

元の48作業のコード条件で **完成33／一部6／未着手9**。今回一部12から完了へ移した6件はD03/D05/D06/F04/F05/H01。残る6件はD04/E06/G01/G04/H02/H06。詳細正本 `AI_PARTIAL_12_PROGRESS_2026-10-13.md`。後追加の大判背景などを消さず別範囲として明記。テスト結果や資産配置をコード完成数に混ぜない。

D06大判warpはLocalWarpWindowEvaluatorの絶対座標/Float/保護/全域stream認証→LocalWarpTiledRendererのdonor ROI/RGBA→PhotoPipeline/Delta66LargePrintへ接続済み。巨大全frame fieldを確保しない。共有取消/thermalを各窓の内部まで伝播。大判背景はまだ拒否する。

H02は専用Float局所補正→背景Gaussian影→専用warp→linear露出/90度回転まで見本UIへ接続。現在写真/版/許可/資産SHAをhostが確認。未対応色調/portrait/crop等は見本全体を拒否し、省略しない。全編集復元やWeb保存済みではない。

D04は実Vision関節点の明示人物対応をwarp候補へ固定し、ブラシ中心への採用と認証済み同一mapの逆解による変形後点表示まで追加。身体surface meshと自動領域の一致は残る。骨格点をmesh完了と数えない。

E06はTetherLocalRecoveryViewから実host再開/retryへ接続。Editor独立書込leaseを取得し、取消後も保存済み結果を再読込。D05も独立leaseで部分receiptを保存し、Editorはedit()で二重保存せず実storeのcheckpointを採用。

E06追加：TetherLocalAnalysisAdapter→host.prepareWorkerInput→job別解析engine/workerまで接続。Recovery画面で設定JSONから明示EVを読み、本人確定済み同写真の実解析と結合。iOS/導入済みモデル/顔明度のみ。新写真の自動本人確定や自動EV、他controlは未完。全担当返却済み、バックグラウンド作業なし。

## 2026-10-13 一部12件のコード接続を続行中

使用量停止条件はユーザーが解除済み。以前の50%停止を再適用しない。今回も試験・ビルド・配備・実推論・外部送信・課金は実行していない。

追加済みのコード経路（項目全体の完成数とは別）:
- D03: 確定人物に紐付いた手動肌平滑化と明示donorによる修復を別効果として既存preview/Undo/CASへ接続。
- D04: body intentの明示手動解決を既存warp UIへ接続。保存直前に人物対応/同意/入力版を再照合。自動身体点推論ではない。
- D05: 全体露出/コントラスト/彩度および既存ExportSettingsの部分適用adapter、明示JSON取込画面、receipt保存とEditor再読込を接続。実解析証拠なしの処理は保留し、完了flagを作らない。
- E06: 実workerと耐久artifactを追加。到着/再開hostから解析→描画→保存へdispatch。未提供の人物入力/適応解析と未対応controlは理由付き保留。
- F04: Vision全人物mask生成と明示原寸PNG→FinalMask取込を画面へ接続。原本SHAとPNG SHAは別。32MiB/8MP以内、巨大原寸は未対応。
- G01: Editorの未編集proxyと現在写真/版を固定し、料金条件・依頼本文・同意のローカル登録UIへ接続。利用者入力価格の真正性や外部料金承認は別。
- G04: 固定依頼と受領job・入力/payload SHA・候補を照合する受領adapter/UIを既存候補採用へ接続。手動JSONはprovider成功/支払済みの証明ではない。
- H01: 明示Web専用galleryとpolicyの一時読込/許可hostを照合sessionへ接続。Apple特徴量は混用せず、無断登録/保存なし。実WASM/モデルの配置は別。
- H02: 現写真のproxyを供給するhostと互換UI、背景Gaussian影、Apple保存warp専用描画を接続。非保存見本であり全編集の復元とは区別。

残コードの作業中: D06の大判warp window評価/stream認証、H02のFloat局所補正→背景→warp順、E06の再開UI入口。既存の27完成/12一部/9未着手集計は、全条件の照合前に自動更新しない。


## 2026-10-11 使用量50%で指示どおり停止

全担当返却済み。H02にlocal-backdrop-bundle / png-decoder / render-adapter / display / preview-sessionを追加し、明示bundle→PNG復号→合成→SDR非保存見本画素まで接続した。preview-sessionは世代失効・取消・権限再確認・所有copy消去を担う。UI hostは未接続。次はeditorのsession.proxyから新規pixelcopyとcurrentBindingを供給し、現在写真/revision/許可を確認するhostと互換UIへ接続する。仕様はWEB_BACKDROP_ADAPTER_HANDOFF_2026-10-11.md。人物照合の一時copy解放も追加済み。

全項目集計は完成27/一部12/未着手9のまま。下位コードの進捗を全項目完成に換算しない。試験・ビルド・配備なし。自動続行ではなく、使用量50%停止条件によりここで停止。

## 2026-10-11 続行後の残コードを固定（検査・資産待ちとは別）

コード集計は完成27・一部12・未着手9。今回増えた経路だけで項目全体を完成へ移さない。

|一部の項目|残るコード|
|---|---|
|D03|肌平滑化以外の人物メイクadapter、任意L8領域の保存接続|
|D04|身体解析からmesh/warpへの自動adapter、既存maskの同時座標変換|
|D05|global/texture/output等の実adapterと編集host|
|D06|上記補正の再開/Final、大判warp|
|E06|workerRequiredから実解析・補正・描画workerへのdispatch|
|F04|自動切抜きadapter、大判背景合成|
|F05|既存影の自動分離（手動確認経路はあり）|
|G01|実Editor入力/料金表/同意から固定登録へのhost接続|
|G04|provider応答と固定依頼/jobから生成候補へのadapter|
|H01|Web gallery同意・照合policyを提供する実host|
|H02|背景資産の実復号/保存/UI、影・warp・retouchを含むWeb復元描画|
|H06|生成job/精算hostとWeb人物galleryの統合|

外部資産・選定・承認: 実WASMとモデル配置、provider/model/価格条件、利用許諾。試験・ビルド・配備・実推論は未実施。

使用量49%時点も続行。Web背景bundleの版/SHA/寸法照合とrendererまでのadapterを追加済み。PNG実decoderを既定として接続。現在写真/Recipe/権利確認callbackは必須、none影のみ、warp拒否。adapter保持copyを描画メモリ予算から差し引く。PNGは非動画・非interlace・RGB/RGBA8・sRGB又は未タグsRGB解釈限定で32MiB/8MP、chunk境界/CRCを復号前確認。JPEG/EXIF/ICC/特殊PNGは明示未対応。人物照合の自前一時コピーは失敗・取消を含め消去。UI接続済や項目全体完成とは扱わない。

## 2026-10-11 固定生成依頼の永続登録まで追加

G01: GenerationAuthorizationはprovider/model・入力SHA・確定依頼SHA・料金表版・通貨/整数上限額・明示同意を不変化する。GenerationAuthorizationStoreは同ID本文完全一致のみ再送可能な原子的ローカル登録。GenerationAuthorizationCoordinatorは実入力/確定payloadのSHAを計算し、hostによる現料金/同意/入力再確認の前後で照合して登録する。返却はregisteredNotSubmitted。残高予約・課金・provider送信は一切行わない。登録済み記録を取消後に未登録と報告しない。

H02: Web専用local-backdrop-rendererを追加。none影・背景EV・配置・softmaskのlinear premult合成、実bytes/SHA/マスク・許可を照合。shadow/warpは明示拒否し、renderer呼出/復号元保証/編集保存への接続はまだない。AppleのCoreImage補間とのbit同一は主張しない。

試験・ビルド・配備・課金・実推論はしていない。コード全体完了ではなく追加経路の記録。残コードはこの後の一覧へまとめる。

## 2026-10-11 人物紐付け肌平滑化・Web権限失効を接続

D03: LocalPersonSkinSmoothingServiceで明示人物対応/同意/手動矩形/保護矩形/強さ/半径を確認し、既存LocalRetouchRecipePreviewを呼ぶ。LocalPeopleModel/Panelから既存手動補正UIを再利用し、見本→候補→保存時gallery対応revision/現人物/baseRecipe再照合→既存Editor Undo/CASへ接続。Editorも新async境界後に写真/入力履歴/世代を再確認する。肌semantic自動認識やLOW/MED/HIGH係数は捏造しない。他メイク補正は残るためD03全体は一部。

Web: hostAccessをモデル初期化/解析の前後に確認し、既存accessListenersでも取消する。状態一覧はruntime状態変更に連動して更新し、取消後に旧準備済み表示を残さない。照合sessionも解放時にraw embeddingを消去する。モデルなしで実推論が動いたとはしていない。

## 2026-10-11 生成背景の採用経路とWeb解析入力を接続

G04背景限定: LocalGenerationCandidate/Storeで入力写真SHA/revision、provider/model申告、背景出力SHA、人物/保護maskを不変保存する。取込UI→同写真同版の再照合→固定背景/人物maskの見本→Editor採用直前再照合→既存Undo/CASへ接続。保護maskの非zero画素は人物mask255でなければ拒否。生成候補経路の背景/人物mask/原寸mask差替えは禁止。background.assetIDからcandidateを辿れる。課金済・provider成功・権利認証済とは主張しない。自由生成/実provider接続は残るためG04全体は一部。

H01: 既存editorのproxyからupright BGRを作るinputProviderをruntime panelへ渡した。本番人物処理許可と既存access条件が必要。session更新で初期化/解析を取消し結果を破棄。AppleとWebの前処理domainは分け、gallery/policyの混用を拒否する。ホストの照合providerは任意で、未提供時は検出のみ・人物照合未接続と表示。自動人物登録や編集適用はしない。

Web実WASM/モデル導入・gallery同意を持つhostprovider・通常編集への照合結果反映は残る。実行試験なし。集計27/12/9は維持するが、上記経路のコードは追加済み。数値に動作合否や未導入資産を混ぜない。

## 2026-10-11 Web人物照合の実接続部品と準備画面

H01: local-face-runtime-controllerが明示許可→固定モデルbytes→実Worker初期化→入力BGR SHA確認→解析→許可再確認の順に接続。失敗/取消/timeoutはWorkerを破棄。人物照合moduleはSwiftの同model/前処理版・max-per-person・margin・複数顔競合を維持し自動人物確定しない。observations変換は写真と解析SHA・座標・実embeddingを検証する。

準備panelを既存状態画面に接続した。モデルを明示選択し、確認者/資料/日付/利用条件/人物許可を利用者が明示確認する。自己申告は法務承認や再配布許可ではない。画面の確認は永続化しない。現在このmountには解析入力providerを渡していないため解析ボタンは出さず、既存編集を変更しない。モデル/WASM未導入を準備済みにしない。

F04/F05原寸mask UIは保存前に影倍率/上限/構図比率/再SHA照合を追加。見本mask変更時は原寸対応確認を解除する。D06再開処理は前節のとおり。残件は引き続き明示し、コード完成集計27/12/9を維持。使用量41%時点継続。試験・ビルド・配備なし。

## 2026-10-11 原寸マスク・部分保存再開・Web Worker続行

F04/F05: optional finalMaskを追加。独立した原寸raw L8を明示取込・SHA照合して保存し、Finalのみその参照を使う。Previewは従来mask、目的を寸法から推測しない。原寸も8MP以内・完全一致、影offsetを寸法倍率換算し非等倍blurは拒否。大判は依然残る。

D06: 部分receipt保存後の再起動で残人物補正を続けられるよう、保存済receipt列と現在checkpointを同一読取で取得。最終保存checkpointとの完全一致時だけ既存effectをskipする。手動編集が進んだ場合は旧入力で上書きしない。不確定保存の再照合は同期再試行を含む。

H01: C ABI WASM橋渡し・Worker host/client・固定loader入口・Emscripten限定CMake targetを追加。モデルbyte/SHAを照合しcontextを再利用、取消/timeoutでWorker破棄。nativeビルド定義とMediaPipe詳細点は維持。実WASM成果物生成/配置・画面接続・照合policy接続は未完。試験/ビルド/推論なし。集計27/12/9維持、使用量38%時点継続。

## 2026-10-11 背景合成の保存・再描画を接続

F04/F05: LocalBackdropRecipe schema1で写真ID/SHA、背景の固定版/SHA/寸法、raw L8マスクSHA/寸法、配置、背景EV、排他的drop影を保存。マスクを不変ローカル保存した後、成功見本の固定候補を既存EditorのUndo/CASへ渡す。取消・写真変更・入力版変更で候補を失効。保存背景の解除も新しい履歴として保存し、素材や原本は削除しない。

通常プレビューは人物編集と同一の1600px thumbnail経路へ統一。処理順は人物局所補正→人物補正→背景合成→形状変形→色/切抜き。背景も後段変形の対象であることを画面に明記。Finalは原寸とマスクの完全一致を要求し、暗黙拡大しない。大判背景合成・原寸用マスク導入は未完であり、項目全体は一部のまま。

H02: 新しい背景拡張をWebでも厳密に読み、全履歴と原文を保持する。Web描画・マスク/背景実体の解決・編集復元ができたとは扱わない。

集計はコード完成27/一部12/未着手9を維持。試験・ビルド・配備・実推論は未実施。使用量36%時点で継続中、50%で停止。

## 2026-10-11 部分補正保存・長drag・背景見本の追加

D05: SessionLookPartialApplyCoordinatorが実顔明るさadapterの準備済み部分だけを順次checkpoint化し、ProjectStore.savePartialLookCommitでreceiptとcheckpointを同一atomic文書へ保存する。storage schema3を追加し旧raw/schema2を読み、通常保存/fulljob保存でもreceiptを保持。同ID本文違い・同binding同effect二重適用・CAS競合を拒否、途中保存済IDと要照合状態を返す。LOW/MED/HIGHの架空係数は置かず明示EVを要求。global/texture/output/personalColorの実adapterは未接続なのでD05全体は一部。

D04: 長いdragを総128上限内のtranslate列へ分割し、成功preview→stroke一括追加→group Undo/Redo→既存flat保存へ接続。再開した旧保存列は各operation単位になる。身体mesh自動解析/大判warpは残る。

F04/F05: 固定referencePNGと写真bindingを人物panelからLocalBackdropPreviewViewへ渡し、実背景選択・同寸法raw L8人物mask取込・手動配置・背景EV・排他的drop影→linear renderer→PNG見本を接続。旧影除外/背景に既存影なしを利用者が明示確認する。背景だけ処理して人物を一度だけ合成。設定変更・取消・画面破棄で結果を失効。保存Recipe/Finalへの接続、自動切抜きはまだ残るため一部維持。

H02: Apple JSON読込で未知版/不正値/重複JSON keyを拒否し全履歴と原文を保持。実Web編集への復元は専用rendererが必要（色空間・mask・処理順が違うので既存Web手動効果へaliasしない）。

現在のコード完成27/一部12/未着手9は据置。今回完成へ移行5件=E02/F03/F06/H03/H04。試験・ビルド・配備はユーザー指示で未実施。各担当は今回ファイルを返却済み。次のコード残はD05の全体色実adapter、F04/F05の保存・Final、H02の専用Web描画/編集復元など。外部待ちは別欄にして混同しない。

## 2026-10-11 F03実素材導入を接続

素材manifest JSON→利用条件明示確認→対応画像選択→SHA/bytes/寸法照合→同版不変保存→catalog更新を画面から接続。未確認許諾は利用不可、manifestのcallerConfirmedだけで許諾を認定しない。途中失敗は旧有効素材を維持する。F03コード条件完成へ移行し、現在完成27/一部12/未着手9（今回5件増）。実背景画像の制作・商用許諾確認・実機試験は別。

E06にはopenAndRecover再開入口も追加したが、自動解析worker/実アプリ撮影開始の接続はまだない。H02はApple JSON全履歴の厳密読込・原文再保存をUIへ接続。既存Webの色空間/マスク/順序が異なるためnative編集を既存手動効果へ無理に変換しない。専用Web rendererと編集保存への接続は残る。D05は顔明るさの実adapterから部分checkpoint候補まで追加、原子保存接続を続行中。試験・ビルド・配備なし。

## 2026-10-11 E02永続相関・F06背景選択の接続

E02: CaptureAssetCorrelationStoreの排他/atomic保存/厳密再読込とTetherLocalSessionHostの組立てを追加。固定CaptureContext→明示camera key保存→実SHA/bytesのmember記録→JPEG/RAW明示選択→既存原本取込/queue/recoveryを一つの直列入口へ接続。再通知は同ID・同本文のみ受け、異なる本文と確定後の差替を拒否。実SDK通信とホスト画面の撮影開始は後工程であり、SDKが動作したとはしない。E02のSDK非依存コード条件を完成へ移行。

F06: Editor実保存root→LocalBackdropAssetStore→人物panel→catalog一覧/選択を接続。実bytes再照合したサムネールのみ表示、未許諾素材は使用不可、選択は未適用と明記。ShootingMode.allCasesを使い画面内でモードごとに選択保持。現在のApple enumは5種であり、旧設計の8モード実装完了を意味しない。F06のUIコード条件を完成へ移行。F04画像合成/保存への接続は別項目。

48作業: コード完成26/一部13/未着手9。今回増加4件=H03/H04/E02/F06。F03取込UI、D05実適用、H02編集復元は継続中。試験・ビルド・配備なし。

## 2026-10-11 17件の接続継続・状態表示と手動導線

H03/H04のコード完成条件を満たすWeb接続を追加。editor-ui→実状態provider→feature catalog→状態UIへ接続し、人物照合runtime未組込/接続待ち、モデル導入・許諾未確認を別々に表示する。RAM/thermal/OS対応は推測せず不明のまま。実在する手動肌/メイク/ゆがみ補正へ移動でき、自動生成・無断クラウドfallbackは行わない。これは状態表示と手動導線の完成であり、H01の人物照合Workerが完成したという意味ではない。Worker導入後はproviderの実receipt接続を更新する。

48作業のコード条件集計は完成24/一部15/未着手9（H03/H04を移動）。試験・ビルド・配備なし。旧節は当時の記録として保持する。

並行追加: D05部分適用plan/重複receipt、E02明示撮影ID永続台帳と既存取込入口、E06再開coordinator、F03素材store、F04透過合成renderer、F06実背景一覧/選択を追加。E02ホスト組立てとF06モード接続は作業中、これらはまだ今回の完成数へ加えない。F06のstoreはEditor実保存rootからpanelへ注入済み。背景選択は写真への合成/保存ではない。D04長stroke分割は未着手のまま。

## 2026-10-11 D04元画像ドラッグ入力

LocalWarpDragCanvasを追加しSectionへ接続。aspect-fitの実画像rectから正規化top-left開始/終了点を取得、余白・画像外・写真変更・disable・取消を拒否。元画像入力に限定し、変形結果上の座標と混同しない。

prepareWarpDragは現写真/半径/reference寸法を検証し、移動差をradius*0.18で正規化してtranslate候補へ設定。長過ぎ/zero移動は拒否し暗黙clampなし。プレビュー→操作追加→保存は既存の明示操作を維持。これは短い1strokeの入力補助で、連続リアルタイムwarpや長stroke分割ではない。大判warp/自動身体認識は残る、22/17/9維持。試験・ビルド・配備なし。

## 2026-10-11 D04保存済み変形の明示解除

保存済みlocalWarpだけを削除する確認UI/Editor入口を追加。LocalPeopleModelは有効な同写真の保存baseがある場合だけ操作可能とする。確認ダイアログで未保存セッションも閉じることを説明、取消は変更なし。

Editorは保存待機後も写真/SHA/checkpoint全体/parameter/世代/保存失敗/人物処理busyを照合。localWarpのみ除去、他拡張を保持しclose→既存edit/Undo/CASへ無awaitで接続。ファイルや原本は削除しない。空列保存とは独立、Undoで解除前に戻せるコード経路。試験・ビルド・配備なし、D04一部/22完成17一部9未着手維持。

## 2026-10-11 D04確定保存と再開

LocalWarpRecipePreviewで保存rendererとpreviewを統一。LocalPeopleModelは既存warpの操作/reference寸法/保護矩形を復元し、追加済列だけの最新成功previewを確定候補にする。候補込みpreview・変更後・別写真・不正base・空列は保存不可。空列による保存済warp削除は未対応でUI明記。

EditorModel.applyLocalManualWarpを既存編集/Undo/Redo/CASへ接続。保存待機後、写真・SHA・checkpoint全体・parameter・世代・保存失敗を照合し、候補asset/reference寸法も検証。closeで候補消費→editの間にawaitなし。Panel/EditorComponentsの確定callback接続。原本不変。previewは他の局所補正/色/切抜を含まないサンプルである旨を表示。

通常再描画は8MP等の資源制限あり、大判分割warp・ドラッグブラシ・自動身体認識は未対応。D04一部維持、完成22/一部17/未着手9。試験・ビルド・配備なし。

## 2026-10-11 D04保存recipe通常再描画

LocalWarpRecipeRendererを追加し、PhotoPipeline通常preview/Finalへ接続。保存normalized操作/保護矩形から実fieldを再構築・認証しFloat RGBA再描画。写真/SHA/engine/aspect照合、出力半径1px未満拒否、8MP/RAM192bytes-per-pixel/取消/熱制限、縮小による代替なし。

処理順はlocalRetouch→portrait→localWarp→global/rotation/crop。元座標maskの補正を先に描画し画素ごと変形、保存mask自体は元座標維持。PortraitPipelineは顔明度のみで形状変形なし。ただし局所補正後のVision再検出が曖昧なら既存処理が拒否する。

localWarpを許可する通常whitelistにはrenderer必須分岐も追加。大判validateLargePrintSnapshotはlocalWarpを早期拒否し、共通関数もadapter未供給なら拒否。大判分割warpは未対応。保存UIはまだ未開放、次はpreviewと保存renderer統一→既存Undo/CAS確定入口。完成22/一部17/未着手9維持、試験・ビルド・配備なし。

## 2026-10-11 D04永続契約と写真束縛

LocalWarpRecipe schema1/固定engineを追加。対象asset/SHA、reference寸法、最大128の順序付き9種操作、全列に適用する保護矩形を保持。未知field/版/不正値/1reference pixel未満半径を拒否、bounded decode。RecipeParameters localWarp extensionは他の拡張を維持する。

Recipe.validate、Project全履歴（redo含む）とExportPlanにlocalWarp検証を追加。PhotoPipelineの既存whitelistはまだlocalWarpを許可せず、描画未対応を無視して出力しない。保存UIは未開放で、次は再描画adapterと通常pipeline接続。その後既存Undo/CASへ保存接続する。D04一部、完成22/一部17/未着手9。試験・ビルド・配備なし。

## 2026-10-11 D04未保存の累積操作

LocalPeopleModel/LocalWarpPreviewSectionに最大128操作の未保存列、成功した最新候補だけの明示追加、戻す/やり直し/リセット、列だけのpreviewを接続。新追加でredoを切断、候補を消費して二重追加を防ぐ。毎回同じ元PNGから全列を再描画し、結果画像への二重warpをしない。現在の保護矩形は全列に適用する。

設定変更は候補のみ失効、取消は追加済み列保持、写真切替/clearで列消去。要求ごとに一意のgeometry版を発行し、候補込み/列のみのmapを混同しない。UIに未保存・Project履歴とは別・ドラッグブラシ未対応を明記。永続Recipe/Final/自動身体認識は残るためD04一部、完成22/一部17/未着手9。試験・ビルド・配備なし。

## 2026-10-11 D04単一操作の画面接続

LocalPeopleModelに9種の手動変形・数値入力・保護矩形・LocalWarpPreview呼出を追加し、LocalWarpPreviewSectionをLocalPeoplePanelへ接続。写真/設定/取消で結果失効、完了時は世代・入力revision・PNG・Preparedを照合。geometryRevisionにも入力revisionを含める。顔nativeモデル不要、未編集proxyへの単一操作、既存編集・他のマスクには未適用。

保護矩形は正の面積で重なる画素をtop-left L8 hardlock化。入力なしを勝手な値で補完しない。smooth/restoreはidentityへの単一操作なので見た目が変わらない旨を画面に明記。累積ブラシ、保存/Undo/Final、自動身体認識は残る。D04一部、完成22/一部17/未着手9。試験・ビルド・配備なし。

## 2026-10-11 D04プレビューservice接続

LocalWarpPreview actorを追加。upright単一PNGの寸法/type/向きとPrepared再生成BGRを照合し、同じfieldで画像と全maskを処理して全成功後だけ返す。Float rendererを明示premultiplied contextで使用、表示PNGはsRGB8。写真/geometry/maskspace束縛、PNG完全SHA・入力前処理版・engine版を別々に返す。Prepared一致は白合成BGRまでであり原本由来の証明はcaller責務。

1600edge/2.56MP/128ops/PNG32MiB/最大16mask・保護含計32MiB/RAM admission/熱/取消/busy再入拒否。CIImage処理を同期scopeで終えてからmask actorをawaitする。UI/世代失効/保存への接続は次、まだ画面から操作できる完成状態ではない。D04一部、完成22/一部17/未着手9。試験・ビルド・配備なし。

## 2026-10-11 D04ブラシfield生成

LocalWarpFieldBuilderを追加。Web純処理のtranslate/scaleX/scaleY/scale/rotate/mShape/smooth/restore/pushLeftの9演算をruntimeへ移植。Web永続schema互換を意味しない。center*widthの既存brush規約、常時境界固定、smoothは前変位の平滑化。現在freezeを全操作に適用、destinationと正weightの4補間donorを保護し、範囲外はidentity。Float確定後の実fieldをLocalWarpCoordinateMapへ渡し、認証不適合時は全体拒否。強度の暗黙変更なし。

保護Dataはzero-based UInt8 snapshot化。8MP/128操作/128M画素操作/RAM40bytes-per-pixel/取消制限。温度判定は画像adapter側、builder自体には未追加。UI・保存・自動身体認識は未接続。次は同mapで画像とmaskを処理するプレビュー接続。D04一部、完成22/一部17/未着手9維持。試験・ビルド・配備なし。

## 2026-10-11 D04画像変形renderer

LocalWarpImageRendererを追加。同じ認証済みLocalWarpCoordinateMapでFloat RGBA全4channelを双線形再標本化し、top-left mapとbottom-up bitmapを明示変換する。source/warped区別、写真/SHA/geometry/input寸法binding、寸法保持、finite/8MP/RAM/熱/取消ガード付き。原本は変更しない。入力CIImageの原本由来の検証はcaller責務で、metadata一致だけで写真内容を証明したとはしない。使用contextはpremultiplied出力を前提とする。

Appleには既存の形状brush/field生成/永続warp Recipeが見つからない。次はWebの保護反映済みfield生成→同mapで画像とmask→世代管理付きpreview→Recipe保存と既存Undo/CASの順。今回UI/保存/Finalは未接続、D04一部を維持。完成22/一部17/未着手9、試験・ビルド・配備なし。

## 2026-10-11 D04変形座標とmask追従の部品

LocalWarpCoordinateMapを追加。既存Webのabsolute output→source fieldをimmutable保持し、写真/SHA/geometry版/input寸法を束縛。境界identity、全bilinear cellの変位Jacobian行和<=0.65、pixel-center規約、96反復とresidual誤差条件による逆写像を実装。証明対象はfreeze等反映後の実applied fieldであり、requested brush fieldを描画済みと扱わない。

LocalWarpMaskAdapterは同じmapでL8 maskを双線形再標本化。topLeft/bottomUpを明示、元mask解像度を保持。source/warpedを区別して同じ結果の二重warpを拒否する。最大8MP/メモリ/熱/取消制限。保護mask投影はfreeze field生成とは別。中心点を変換しただけでブラシ半径や形状の整合まで完成とはしない。

画像renderer・ブラシUI・永続保存と自動身体meshは未接続。D04一部のまま、完成22/一部17/未着手9を維持。試験・ビルド・配備なし。

## 2026-10-11 D03顔内の幾何候補表示

LocalFaceRegionProposalを追加。実Vision faceContourを端点間で閉じた保守的な下顔域から、実眉/目/鼻/内外唇polygonを除外し、対応人物maskと交差する。未知/曖昧対応、欠落点、自己交差/退化polygonは保留。肌・しわ・傷跡の意味認識ではないため自動適用や保存には使用しない。

LocalPeopleModelとPanelの明示操作へ接続。詳細解析/設定/写真変更や取消で失効、非同期完了時に写真/解析版/設定を照合。新LocalFaceRegionProposalViewで1顔ずつ同寸法upright参照へ半透明表示、bottom-up→top-downを明示変換。走査は顔bboxに限定、入力mask/出力mask各32MiBと熱/取消制限。

専用の肌/しわ/傷跡検出モデルは追加していない。これをD03全体完成には数えず、完成22/一部17/未着手9を維持。試験・ビルド・配備なし。

## 2026-10-11 D03局所補正の大判分割接続

LocalRetouchTiledRendererを追加し、Delta66LargePrintからPhotoPipeline共通順序へ渡す。global座標の選択/保護・半径倍率・順序layerを維持したCIImageProcessorKernel遅延RGBAf描画。平滑化はhalo付きdomain正規化BOXmean、cloneは別shifted donor入力で遠距離ROI結合を避ける。非選択端のdonorはclampで供給するが、選択画素の実donor範囲外は拒否する。

大判経路のlocalRetouch一律拒否を解除。処理順は原寸upright→局所補正→portrait→global/crop→出力配置。writer取消を専用tokenでcallbackへ伝え、temp出力と原本保護は既存経路を維持。通常preview/Finalの全画面rendererは変更なし。大判出力の説明も更新。

新graph上限は512MP/辺65536/半径1024。callback出力1MP・入力16MP・scratch32MiBとRAM/4判定、CPU scratchは直列化。これはOS/decoder/上流graph全体のメモリ保証ではない。既存の原本decode admission、TIFF4GiB未満・非圧縮RGB8/16bit/ICC条件は維持。実タイル寸法や境目・通常rendererとの浮動小差は未試験で、完成品質を主張しない。

D03手動経路は大判までコード接続したが、自動肌/しわ/傷跡領域は残るためD03一部。完成22/一部17/未着手9を維持。試験・ビルド・配備なし。

## 2026-10-11 D03手動補正・確定保存接続

LocalRetouchRecipePreviewを追加し、同一PNG/BGRを照合して保存用Float rendererで既存layersと候補を描画、表示時のみsRGB PNGへ変換。LocalPeopleModelは保存済みlocalRetouchを受領し、reference寸法と旧layersを保持して新規1layerを追加。半径倍率とnormalized clone offsetを保存契約に変換。入力/取消/写真変更で候補失効。

LocalPeoplePanel→EditorComponents→EditorModel.applyLocalManualRetouchを接続。保存待ち後に写真/固定checkpoint/設定を再照合し、候補の旧layers prefix・追加1件・reference寸法を検証、同期で候補を消費して既存edit/Undo/Redo/CASへ渡す。原本変更なし、保存失敗表示は既存経路を使用。

UIの見本は局所補正だけ（他の色調整/portrait/cropは含まない）。全編集の表示は確定後の通常preview。大判tile未対応と通常原寸16MP/RAM制限は継続。自動肌/しわ/傷跡領域は未完成なのでD03全体は一部、完成22/一部17/未着手9。試験・ビルド・配備なし、Apple側コードのみで公開Webに変更なし。

## 2026-10-11 D03保存形式と通常再描画

LocalRetouchRecipe schema1を追加。bitmapではなく写真ID/SHA、upright reference寸法、normalized矩形/保護、効果と最大16の順序layerを保存。RecipeParameters検証、全Undo/Redo履歴のasset照合、ExportPlanの写真照合を接続。旧Recipeは変更不要。

LocalRetouchRecipeRendererをPhotoPipelineの通常preview/Final共通入口へ接続。localRetouch→portrait→global/rotate/crop順。RGBAf extendedLinearSRGBで未選択画素も8bit化せず保持、source domain/alpha保護・半径倍率・取消を実装。現在最大16MP/辺32768、192bytes/pixel<物理RAM/3、拡大半径256以内のbounded全画面処理で、上限時は縮小せず拒否。大判tileは早期unsupportedとし黙って補正を落とさない。

既存単発manual previewはsRGB8、一方保存rendererはlinear Floatであり画素一致は未達。次はpreviewを保存rendererに統一し、既存layersを保持した確定→既存edit/Undo/CASへ接続する。まだ保存ボタンは有効化していない。D03は一部、完成22/一部17/未着手9を維持。試験・ビルド・配備なし。

## 2026-10-11 D03明示手動プレビュー接続

LocalPeopleModel.previewManualRetouchからLocalRetouchRendererへ接続。左上原点normalized矩形をpixel center基準のbottom-up L8へ変換し、任意の保護矩形、平滑化またはdonor cloneを明示指定。入力変更・写真切替・取消で失効、await後にも世代/設定revision/入力を照合。native顔推論なしで利用する手動経路。

LocalRetouchPreviewSectionを既存LocalPeoplePanelへ組込み。未編集proxy上の選択/保護overlay、入力寸法、未保存PNG結果を表示する。現在の編集結果への合成ではなく、元のproxyの独立プレビュー。原本・Recipe・Undo・保存を変更しない。保存/Final/自動詳細領域はまだ残るためD03一部、完成22/一部17/未着手9を維持。試験・ビルド・配備なし、公開Web変更なし。

## 2026-10-11 D03手動局所補正・入力と描画部品

LocalRetouchRequestとLocalRetouchRendererを追加。明示L8選択/保護maskと写真・解析版・入力寸法を固定し、局所平滑化と同一写真の明示donor cloneを別効果にする。PNGから解析BGRを再生成して同一性を照合、取消/熱/容量制限を持つ。原本・既存Recipeを変更しない。自動傷跡認識、生成修復、healing完成とは扱わない。

今回の範囲は最大1600辺の入力プロキシ上の描画部品。画面、Undo/保存、原寸Final、詳細な肌/しわ自動領域adapterは残るためD03は一部のまま。48作業の完成22 / 一部17 / 未着手9（残り26）は変わらない。試験・ビルド・配備なし。

## 2026-10-11 B04コード完了・詳細点と人物マスク

コード完成22 / 一部17 / 未着手9、残り26作業。B04を一部から完成へ移行。PortraitPipelineの実Vision詳細点と人物別maskをLocalDetailedPortraitAnalysisへ接続し、同一PNG/BGR/SHA/解析版と座標対応を検証する。一意対応のみ詳細を返し、曖昧な対応は保留。Vision topologyを明示し、YuNet5点を詳細点として代用しない。

LocalPeopleModel/Panelの明示解析操作から利用可能なコードを追加。写真切替・取消・再解析・対応設定変更で結果を失効し、非同期完了時にも世代と設定を再照合。maskは入力プロキシのbottom-up L8であり原寸ではない。補正・保存は行わない。native組込み前は実推論不可。試験・ビルド・配備なし。次はD03以降の局所補正adapterなど、土台あり17作業。

## 2026-10-11 土台あり優先・A03/A05/C01コード完了

48行をコード完成条件で照合した時点は完成18・一部21・未着手9。ユーザー指示で一部から着手し、今回3行を完了へ移した。現在はコード完成21・一部18・未着手9（残り27）。ビルド/検査/実機/外部待ちは別集計。ファイル数やAI全体の品質合格数ではない。

- A03: LocalModelNoticesとLocalPeoplePanelから固定版の公式5本文・出典を読めるコード、Suite/Resources/LocalModelLicensesへの同梱配置を追加。商用/再配布unreviewedは維持。実際に選ぶOpenCVバイナリの依存通知確認はMac工程。bundle組込は未ビルドで未確認。
- A05: LocalFaceInferenceの既存入口をshared poolへ接続。同一store actor・全manifest/設定一致時だけ再利用、上限2、進行中は容量拒否、失敗/取消時破棄、purge/releaseは進行終了後解放。service呼出変更なしで経路に入る。実OSメモリ警告とのhost接続は別、native未組込みはunavailable。
- C01: gallery schema3へ登録元asset/SHA/解析版/顔ID/モデル版参照を暗号化保存。新規登録は実選択顔と最新解析の一致を確認。旧schema1/2の欠落参照は不明のまま保持し表示。原画像の複製はしない。

3担当返却済み。次の土台あり対象はB04（詳細点/人物maskの共通解析接続）とD03以降。第九段のLocalLookSupport/LocalPersonPreviewService案はまだ未作成。試験・ビルド・配備は実施なし、公開Webの変更なし。

## 2026-10-11 AI第八段・補正保存と再開記録

ProjectStoreへsaveTetherCommit / tetherCommitを追加。補正後checkpointとjobID付きCommitReceiptを同一atomic文書に保存する。通常編集でも記録を保持し、同jobの完全一致再送は後の編集を巻き戻さない。違う出力/receiptの再送は拒否。receipt無しは従来raw checkpoint形式、receipt有りだけ内部version2 envelope。履歴最大128件・既存文書容量制限を維持し、上限時に記録を黙って消さない。ファイル同期失敗は結果不確定とする。ディレクトリ電源断耐久性/複数プロセス書込は保証しない。

TetherLookCommitCoordinatorは保存専用。呼出側が用意した実描画artifactの相対path/容量/SHA、写真・Look・解析・leaseを照合し、保存→queue応答と進む。中断復旧はProjectStore内の実記録で照合し、記録無しを未実行の証明にしない。ホストはqueue制御を一つの所有者に集約し、artifactを不変に保つ必要がある。別actor間の原子的leaseロックを実装したとは扱わない。

自動解析/描画worker・画面からの起動はまだ未接続。試験・ビルド・配備なし。公開Webに変更なし。

## 2026-10-11 AI接続で次に残る境界

静的照合の結果、Appleの自動解析/描画workerはまだ存在しない。既存の明示人物対応＋明示EVの顔明度候補は使えるが、SessionLookの適応顔補正をまとめて実行可能とは宣言しない。露出/WB解析、詳細顔領域、肌/身体解析、LOW/MEDIUM/HIGHの効果別換算、人物保留時の全体色だけの部分適用が残る。YuNetの5点を詳細meshや露出証拠に代用しない。

次の結合順: 保存後中断の同一job再照合 → 効果単位の実対応判定 → 実入力からの解析証拠/描画artifact → 画面起動。メーカーSDKやAppleライブラリ実組込みの完了を待ったふりで成功表示しない。人物補正の実行済み・全48件完成とは報告しない。

## 2026-10-11 AI第七段・撮影時設定から保存キューへの受渡し

TetherLookQueueStore / TetherIngestStore / TetherCaptureCoordinatorのコードを追加・結合。撮影前にCaptureContextを永続化し、確定原本の受信記録に固定設定を保持する。既存原本からProxyを作り、未編集ProjectCheckpoint確認→キュー永続化→受信応答の順で進む。再送は同じcontextを要求し、キュー登録後に中断した場合も既存jobを照合して二重登録を避ける。旧context無し記録は読めるが、新経路では設定を推測しない。

3担当から所有返却済み。これは共通受渡しサービスのコード完成であり、メーカーSDK、JPEG/RAW自動相関、実カメラ、補正worker、画面からの自動起動は未接続。確定原本の選択・初回登録と編集workerの直列化は呼出側の責務。試験・ビルド・配備なし、公開Web変更なし。次は既存解析・描画・保存へ接続可能な範囲を限定してworkerを実装する。

## 2026-10-11 AI第六段・対応履歴の暗号化保存復元

LocalPersonGalleryStoreの既存AES-GCM/端末限定Keychain/lockを再利用し、写真別PhotoPersonAssignmentsとrevisionをschema2に保存。schema1の人物登録を読み込めるまま維持する。対応変更・解除はCAS付き保存が成功した後だけ画面に確定反映。別解析へは暗黙置換せず、利用者の確認付き作り直しのみ許可。保存競合や鍵/データ不整合では旧記録を保持し、再読み込み導線を追加。

LocalFaceAnalysisServiceは全入力/モデル/前処理/閾値/runtime条件を安定analysisVersionへまとめ、顔IDを版と検出値bitから生成する。取消世代は永続版と分離。同じ写真・解析結果なら再起動後に履歴を厳密復元できるコードで、形状/モデル/環境が変わったら保留する（近い顔を勝手に同一対象として復元しない）。登録人物削除とその人物を履歴に含む写真対応記録の削除を同一commitにまとめ、削除範囲はUIで明示。原本/編集履歴は削除しない。

読み戻しは写真の解析完了後。端末内対応履歴の保存復元コードは追加済みだが、native未組込みのため実推論・再起動実機確認は未実施。試験・ビルド・配備なし。Web変更なし。写真対応履歴が画面内だけだったという第五段の残件は、この追記で解消。

## 2026-10-11 AI第五段・明示人物対応と顔明度候補

追加コード: PhotoPersonAssignments（写真/原本SHA/解析SHA/版/対象集合に固定した手動対応・解除・有界履歴）、FaceRegionAssociation（同一upright画像のYuNet矩形とVision領域のIoU/margin対応、同点/競合保留）、PersonFaceBrightnessPlan（明示人物EV→現在写真の既存Portrait領域への絶対値候補）、LocalPersonCorrectionService（同じ参照PNGと解析画素の実一致からVision→候補計画）。旧写真の座標をコピーせず、全体色は変更しない。

LocalAIModelStore.status/LocalFaceModelStatusに未導入・不整合・読込不能・保存済みを分離しLocalPeoplePanelへ表示。人物登録galleryは暗号化永続、写真内手動対応履歴は現在の画面内のみで閉じると破棄する（永続化したとは扱わない）。候補作成は保存と別。明示適用のEditor接続も追加済み。固定checkpoint/parameters/写真/SHA/世代/最新galleryを適用前に再照合し、既存portrait/redo内のIDと他人物EVを保持して既存Undo/CASを使用する。開いている間に編集が変わればパネルを失効し、同じ候補の二重適用を防止する。実行結果ではなくソース接続の報告。

まだ残る: NativeライブラリのApple実組込み・実推論、写真内対応履歴の暗号化永続保存、全詳細メイク/身体adapter、撮影自動投入との最終接続。48件全体完了ではない。試験・ビルド・配備は指示どおり未実施、Web更新なし。

## 2026-10-11 AI第四段・人物登録の画面接続

LocalPersonGalleryStore（AES-GCM、端末限定Keychain、明示同意、人物単位削除）、LocalPeopleModel（解析・登録・照合・取消）、LocalPeoplePanel（顔枠選択・登録・一覧・削除・固定モデル導入）を追加。PhotoPipeline.prepareLocalPeopleで保存済proxyから向き確定済の同一画像/解析画素を用意し、EditorModelと既存人物パネルに入口を接続。写真切替で旧結果と同意を失効する。必須表示名のUIと保存契約を統一。

人物登録は補正Recipeとは別で、自動で他写真へ補正を適用しない。原本写真・編集履歴は削除しない。現在はSuiteFaceCore/OpenCVのAppleライブラリ未組込みのため推論実行は不可と画面に明示する。コード接続済みを実機動作済みと扱わない。試験・ビルド・配備・写真推論なし、公開Webの更新なし。

## 2026-10-11 AI第三段・ローカル顔解析のコード接続

固定版の公式license資料5点もartifacts/local-ai-models/licensesへ取得・bytes/SHA照合済み。再取得scriptはfetch-suite-face-licenses.ps1、詳細はAI_MODEL_LICENSE_RECORD_2026-10-11.md。manifestは保存本文を参照するが配布許可確認はunreviewedを維持。全サイドエージェントの担当は返却済み。

ユーザーの「作業しよう」「サイドエージェントで並列」により継続。LocalFacePixels（向き確定済み画像→sRGB/BGR解析画素、XY逆scale）、LocalFaceInference（verifiedAsset→SuiteFaceCore C ABI→128次元Embedding）、LocalAnalysisCache（single-flight/LRU/容量・取消・世代）、LocalFaceAnalysisService（写真別target/座標/Embedding、最新gallery/policyで照合）を追加して接続。PinnedFaceModelsに実ONNX読取り由来のIOと固定hash/bytes/前処理を記録。FaceIdentityが曖昧候補と同写真内人物競合を保留する。

解析→推論→候補判定のサービスコードはつながったが、アプリ画面・人物登録同意・暗号化永続gallery・Recipe自動適用はまだつながっていない。写真内target UUIDは同cache結果中でのみ安定し、再起動をまたぐ永続IDではない。画像の逆変換は供給したupright入力までで、入力proxyから原本への変換は呼出側の責務。原本mask完成を意味しない。

現在のproject.ymlにSuiteFaceCore依存は未登録。Apple向けOpenCV 4.13.0/SuiteFaceCoreバイナリ作成・リンクは後続Mac/Xcode工程。未組込み時はunavailableを返し、検出済みを偽装しない。Mac QAの明示sourcesにも新AIサービスを登録していない。試験・ビルド・写真推論・配備は未実施で公開Web更新なし。有料API・写真外部送信なし。モデル入出力読取りとSHA照合だけ実行した。

次工程は同意/保存範囲を守る人物galleryと、既存PortraitPipelineへの人物対応接続。採用済モデル定義を再調査し直さない。詳細はAI_MODEL_IO_2026-10-11.md、48作業表冒頭の更新欄。資料のユーザー再添付待ちは解消済み。

## 2026-10-11 AI第二段・実モデル確保

公式固定commitからYuNet2023mar/SFace2021decの実本体をartifacts/local-ai-modelsへ取得し、期待容量/SHA双方一致。詳細はAI_MODEL_ASSETS_2026-10-11.md、再取得はscripts/fetch-suite-face-models.ps1。詳細MD不在は再作成済み、モデルhash未受領という旧待ち理由は解消。画像推論・実機品質は未確認で別扱い。

## 2026-10-11 詳細指示書の再作成

ユーザー指示『ないなら同じ作業』により `SUITE_CODEX_実装依頼_効率化設計と現行差分_2026-10-11_再作成.md` を作成。現存添付・現行差分・公式モデル情報をまとめた新資料で、旧MDを発見/完全復元したとはしない。次回はこの保存済みファイルと48作業表を参照し、ユーザーへ再添付を要求しない。

## 2026-10-11 AI第一段とモデル資料検索

ユーザーがAI実装を承認。D01: CorrectionAnalysisRequirements.swiftで効果別要求を定義しSessionLookPlanningへ接続。E01: CaptureContext.swift/SessionLook.swift/TetherLookQueue.swiftで撮影開始固定とcontext付きenqueueを追加。A01: LocalAIModelManifest.swiftでモデル版/hash/bytes/IO/利用条件の検証契約を追加。A04の一部: LocalAICapability.swiftでOS/runtime/メモリ/温度/資産/権限/料金を別理由で返す。いずれもコードのみ、推論・SDK/Editor接続・モデル導入・試験・ビルド・配備未完。48全体完了ではない。

ユーザー回答『詳細MDはない』。Documents/Codexと.codex/attachmentsのファイル名検索で指定MDは見つからず。代替としてOpenCV公式ZooのGit LFS pointerを2026-10-11確認。YuNet 2023mar FP32: size 232589 bytes、SHA256 8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4。SFace 2021dec FP32: size 38696353 bytes、SHA256 0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79。出典: https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx と https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx 。公開メタデータ値であり実ファイルの取得/実測一致はまだない。次に固定commit/入出力/重み別licenseを記録し、取得後このdigestと照合する。main追従で新モデルへ自動変更しない。

## 2026-10-11 大判TIFFのApple接続

仕上げ: 実寸比率の許容を既存CropExportMathと一致させ、整数画素への丸め分は出力辺へ合わせて意図しない白線を避ける。確定済TIFFのURL返却後に取消が届いても共有を隠さず、保存完了後の取消として表示。共有待ち以外の元編集/原本は変更しない。

大判writerをPhotoPipeline.exportLargePrintとiPhone/iPadの大判TIFF画面へ接続。保存完了後のcheckpointを固定し、原本SHA・保存revision・Recipeを開始時と確定前に照合。Preview/通常Final/大判は同じnative描画関数を使用。B0倍1456×2060mm/300dpiを含む保存実寸から画素数を計算し、通常補間は一回限りの明示同意とする。必須TIFF設定への変更もUI上の明示操作で行う。Mac QA packageの明示sourcesにもwriterを登録。

コード接続済みと実動作確認済みは別。今回はテスト・ビルド・配備なし。Apple専用の変更であり公開Webが更新されたわけではない。Native未対応のWebマスク/形状変形等は無視せず拒否を維持し、Apple全編集の移植完了とはしない。対象形式は非圧縮RGB TIFF8/16、sRGB/AdobeRGB、原本metadata除去。LZW/透過/metadata保持/4GiB超BigTIFFは未対応。原本decode推定予算1GiBと端末メモリ条件があり、全大型RAW対応やOS内部メモリ上限を保証しない。実機の向き・色・大判完走・共有は未確認。AI/HDR/SDKは変更なし。

## 2026-10-09 次工程・Apple移行一覧の提出タイミング

ユーザー確定順: 大判出力 → AI → Apple版/Xcode接続・統合 → 各メーカーへの資料提出 → 回答/SDK入手後のテザー最終仕上げ。HDRは初期リリース対象外、コードは削除せず将来の風景版へ保持。

Apple移行作業一覧は今すぐ作成しない。大判・AIの作業中にApple対応済み部分と残差を記録し、AI工程完了時にすぐ提出できるようにする。一覧には既存Apple土台、Webから移す処理、UI接続、Recipe/Undo/保存/再開、モデル資産、ビルド/署名/端末確認、依存・難度・担当を含める。大判/AI工程で作った共通処理をXcode工程に二重計上しない。現project.ymlはiPhone/iPad対象であり、macOS版を実装済みと扱わない。

## 2026-10-09 AI分析・設計案作成（実装未開始）

最新ユーザー指示はAI指示書ベースの深掘り/細分化/Sol-Astra分類。AI_IMPLEMENTATION_BREAKDOWN_2026-10-09.mdに48作業案（Sol15/Astra33）、共通契約、既存根拠、依存順、完了条件、モデル/ライセンス/費用未確定、8件変更提案を記録。元44/137項目とは別の作業分解。専門生成等の未選定資産は別節で保持し、48で全機能完成とは言わない。

Apple/Web/生成会計の3担当がread-only調査。OpenAI Docsで生成API/価格項目、OpenCV公式でライセンス確認。実装・推論・試験・モデル取得・配備なし。参照詳細MD未受領、期待SHA/サイズ不足は残る。YuNet/SFaceの採用自体は維持し、既存詳細ランドマークと別契約にする提案。

## 2026-10-09 Proxyコード/画面反映で今回終了

ユーザー指定: 今回はProxyのみ、終わったら区切り。他の項目は次回。LUTはローカル運用済みでクラウド同期を残件計上しない。書出しPreset共有も次回。

workspace-proxy-editor-host.mjsとworkspace-proxy-ui.mjsを並列実装しEditorへ条件付き接続。明示同意送信、一覧、取消、操作ID+metadata端末保持による同内容再送。保存HEAD本文/version、原本SHA/size/Workspaceを照合し写真/編集版/認証変更で中断。未加工source Proxyのみ送信し、旧影3枝が履歴にある場合は混入防止のため拒否。原本RAW/Cloud Safeを書換えない。

ビルド成功、既存Webへ反映。Version `bf56bce2-0b14-4b46-985c-d1913a509f47`、builtAt `2026-10-09T00:30:47.032Z`、HTTP200/manifest一致。実写真・自動テストは未実施。実Node認証/保存先/容量契約は未設定のため実同期は未完であり公開previewでは送信不可理由を表示する。Node backendは今回のWorker配備対象外。詳細WORKSPACE_PROXY_TRANSPORT.md。

## 2026-10-09 クラウド3系統のコード追加（実接続は未完）

3担当で並列実装。LUTは実認証hostから一覧/manifestを取得し既存SHA/CUBE検証後ローカル保存・適用。全ライブラリのupload同期ではありません。Workspace共有は厳密寸法/白灰黒余白と印刷/画面シャープ設定を後方互換で拡張し、実Node session認証時のみ既存editor設定adapterへ接続します。TrialログインをNode認証に変換しません。

Proxyは専用永続記録と認可済みAPI/client、既存容量予約台帳、不変保存・再読取SHA照合を追加。最大16MiB/8MPのProxy専用で原本のサイズ上限やCloud Safeとは無関係。中断再開は同じ操作IDでの全Blob再送です。失敗予約は物理保存を見落とさないため自動解放せず、旧版予約の回収は別工程。Webの明示送信UI/操作ID保持は未接続。

公開previewにはNode API/OIDC/保存先/容量設定がなく、クラウド同期完了ではありません。接続先についてユーザーへ質問済み。新規クラウド資源作成・契約・費用発生・メーカー申請は行っていません。詳細はWORKSPACE_EXPORT_PRESET_CONNECTION.md、WORKSPACE_PROXY_TRANSPORT.md。

Web/workerビルド成功、既存previewへ配備。Version `f1f934af-a2da-44c1-bf67-f2669a8103ca`、builtAt `2026-10-08T22:51:36.959Z`。Node用Proxy API自体はこのCloudflare Workerには搭載されません。実写真試験・自動テストは未実施。

## 2026-10-09 旧白黒縁・影のローカル再適用をWeb反映

ユーザー承認で匿名BrowserLocal専用の明示同意と実保存履歴/原本/背景照合経路を実装。単写真/Batchごとに同意し、写真切替・取消時は失効。原本/背景は同DB、原寸8MPまで、実LibRaw現像を使用。保存済み文書の再適用のみで、新規authoringやAIを追加しない。

subject stroke rasterと背景合成の純算術入口を分離し、旧認証wrapperは保持。Add/Original合成後に通常処理、BWは既存どおり色・局所補正後/geometry前のlocal専用Worker optionで処理。Add+Original同時、人物/旧手/NR等の混在は未定義なので拒否。原本書換・権限証拠捏造なし。

SessionのPreview/保存版比較/復元/UndoRedo/再読込/保存/単Final/Batchと同意UIを接続。同意撤去は比較Canvasも失効。通常の認証済みTrial/Sites経路を維持。

Version `b45f5962-f95a-4bec-872d-6d252f247711`、builtAt `2026-10-08T22:30:55.050Z`。Web/workerビルド・配備完了。実画像/実機/自動試験は未実施（ユーザー操作で確認）。SDK事前申請条件調査は別担当で継続。AI/テザー/Apple新実装には未着手。

## 2026-10-09 新指示受領と現在作業の優先

貼り付け指示「テザー撮影時のプリセット自動反映と、ローカル人物編集の接続」を受領。YuNet/SFace/OpenCV/Apple先行の新要件あり。ただし直後のユーザー「まずは作業をおわらせよう」により、進行中の旧影/BWのWeb接続・反映を先に終える。新テザー/人物照合の実装にはまだ着手していない。

詳細参照MD `SUITE_CODEX_実装依頼_効率化設計と現行差分_2026-10-09.md` は添付/workspace検索で未発見。再添付依頼済み。モデル期待hash等を推測しない。現HEADは `aba086ce477cd43daeb8d0d47e59c014e0176c56`、指定基準commit `ecffbdc230a0eee6c1d5d8e01dfa0d87953d8794` は現ローカルGitに存在せず差分未取得。dirty changesを保持。

## 2026-10-09 写真別同意付き旧メイクBatchを反映

BrowserLocalで選択した各写真の実保存版・SHA・人物IDを一覧取得し、写真ごとのチェックを求めるUIを追加。単写真の同意は流用しない。Sessionは最新inventory/HEAD/履歴/neutralportrait/bindingを再照合し、一時receiptを写真別に作成して既存5メイクsource runtimeへ渡す。encode後と全件末に再照合し、finallyでreceipt失効。非中立portrait、特殊処理混在、他hostの権限条件は緩和しない。

Version `f4abd4aa-0924-4f24-963c-107f7a6c8c1a`、builtAt `2026-10-08T22:16:31.546Z`。build/配備/HTTP200/manifest一致。実画像・自動試験未実施。

旧BW/影のローカル保存版・Batchは未完。全て外部待ちという以前の説明は不正確。同DBに対象と背景原本がある場合も、既存mask rasterizer/compositeは認証済み所有者/verified provenance前提のため匿名local証拠を代入できない。純算術入口抽出（旧認証wrapper保持）と別のローカル明示同意方式が必要。認証迂回やallowed:trueの偽装はしていない。新adapterは未作成。ユーザーへ方式追加の可否を確認する。別保存先の原本/実認証が必要な経路、クラウド3系統、AI/SDK/Apple/HDR/大判は引き続き依存/保留。

## 2026-10-09 個人Look 200組とRAW入力を反映

1〜200組を一組ずつ読み込み、既存全体色回帰の集計値だけ保持する逐次学習に変更。1〜199組Lite、200組Personal。入力の全組確認・個別同意・取消・転送完了待機・全組成功後の保存を実装。

RAW→JPEG/PNGモードを追加。RAWは128MiB・原寸現像後8MPまで、実LibRaw final/sRGB8/provenance/原本SHAを照合。縮小/Proxy/thumbnail代替なし、upright同寸法のペアのみ。RAWとnonrawの係数形式を保存/適用/JSON移送まで維持する。センサーCFA学習・大型RAW・AIサービスではない。

Version `8f0b7d69-e5ad-4b9a-af67-7c4f02c30469`、builtAt `2026-10-08T22:12:55.495Z`。build/配備/HTTP200/manifest一致。実画像・自動テスト未実施。旧メイク一括出力は独立同意UI/runtime接続を実装中で、この配備には含まない。

## 2026-10-09 使用量停止条件の解除

ユーザー「50％はきにしないでいいよ」により50%停止条件を解除。残コード作成と順次Web反映を継続。AI/テザー/Apple/HDR/大判の保留、実画像操作試験はユーザーが行う条件は変わらない。

## 2026-10-09 旧そばかすを追加反映

faceDecorationsManualを既存ローカル同意の対象名に明示追加。保存済み実doc/人物ID/neutralportrait/原本SHA/履歴revision照合を経て既存そばかす核へsource8MPで接続、4メイクに続く5番目の合成としてPreview/履歴比較/復元/単写真Finalへ反映。新規そばかす作成やFace推論は含めない。旧4メイクのみという過去記述は更新された。

Version `9822a579-b009-434c-a5a2-e18dbdbae9d0`、builtAt `2026-10-08T21:59:23.677Z`。build/配備/HTTP200/manifest一致。画像操作・実機テストはユーザー指定により未実施。

この続行の完了単位は5つ: 手持ち深度範囲、ローカルBatch Final（旧手/衣服/非AI NR含む）、旧そばかす履歴、Curveナビ、RAW NR概要。残りは認証済クラウド連携3系統（LUT資産、Workspace出力Preset、Proxy同期/容量）、Personal200組/RAW入力、旧人物/背景影の複数写真認可と一部保存先の復元。AI/テザー/Apple/HDR/大判は保留。通常Webすべて完成という意味ではない。

## 2026-10-09 ローカルBatch Final接続

BrowserLocalの通常一括書出しをクラウドassertPermissionとは分離し、実ローカルinventory/storage/原本/保存版確認で接続。batchFinalAvailableだけを追加し、認証前提の全Recipe一括編集・限定同期は解禁しない。旧手/衣服/非AI RAW NRは各assetの専用source runtimeを使用し、encode後と全件末に再照合。API/database/factory/cryptoを処理中固定、取消/全結果完成までBlobを返さない既存境界を維持。人物承認が必要な旧メイク・背景影のBatchは依然拒否。

Version `6030cacd-1aa3-47ba-bb8e-448ef36b3419`、builtAt `2026-10-08T21:57:08.827Z`。build/配備/HTTP200/manifest一致。実画像試験なし。使用量47%。

残件を完成扱いにしない: 旧faceDecorationsManual（そばかす）専用履歴は描画核のみで現pureが拒否。ローカル同意対象追加と専用Worker facadeが必要。クラウドLUT/Workspace Preset/Proxy同期/容量は実認証・接続先が未決、Personal200組/RAWはLiteと別入力契約。AI/テザー/Apple/HDR/大判は保留継続。

## 2026-10-09 手持ち深度範囲を反映

ユーザー明示承認でwebDepthRange追加。手持ちJSON最大2MiB/65,536点、near0-far1/full upright、validity必須。原本SHA/asset/原寸寸法へ束縛し、範囲4境界と反転、局所露出/contrast/saturationを幾何前に適用。invalid donorは反転でも除外。24MP実frameを512tile処理。保存/Undo/比較/復元/Finalへ同じRecipeを使用、写真固有Batchコピーと可搬Presetは禁止。詳細WEB_DEPTH_INPUT.md。Curveナビの誤った未対応表示とRAW NR概要の集合漏れも修正。

Version `e25c3634-15c4-471a-a590-ba43227737ec`、builtAt `2026-10-08T21:53:17.172Z`。build/配備/HTTP200/manifest一致、ユーザー指定により画像操作試験なし。使用量46%。BrowserLocal専用手/衣服/RAW NRのBatchは次段実装中であり、このVersionに含めない。

## 2026-10-09 承認済みローカル旧4メイクをWeb反映

ユーザー承認に基づき、BrowserLocal専用の写真・人物IDに束縛した一時同意と操作パネルを追加。既存保存済みのBlush/Contacts/Eyeshadow/Eyelinerを、実履歴・原本SHA/size・人物参照を照合して通常Preview/保存版比較/復元/Finalに接続。写真切替・取消で失効し、比較canvasも破棄。Trial認証・本番権限・Cloud Safeを偽装しない。

対象は原寸8MP以内の保存済み手動メイクと中立portraitのみ。顔の自動認識、新規旧メイク作成、非中立portrait、旧手/衣服/影/RAW NR等との混在は対象外で明示拒否。原寸で4処理後にProxy化し、後段完了時も同意と履歴を再照合。

Version `d8393897-e2a4-49ba-a1c9-1c86816feab6`、builtAt `2026-10-08T21:44:24.962Z`。Web/worker build・配備成功、HTTP200/manifest一致。ユーザー指定により実画像操作・自動試験は未実施。使用量44%、50%停止条件継続。深度入力方式、認証済クラウド連携、200組/RAW個人Lookは未確定条件を残す。AI/テザー/Apple/HDR/大判は引き続き保留。

## 2026-10-09 非AI RAW NRを通常Webに追加

webRawDenoiseを実linear RGB16 LibRaw→classical bilateral→sRGB8へ接続。Previewは原寸NR後1600縮小、通常Finalも同設定。radius1で24MP/216M近傍予算、他半径は同予算内のみ。実原本SHA/size/DBscopeと後段完了時再照合、現在Recipeの通常補正を保持。保存/比較/復元/Undo/再読込へ接続。旧専用人物/影との混在、認証済Batch NRは別runtimeがないため拒否。未検証を成功扱いしない。

Version `fbb64f3f-0ad2-4ca9-be16-7424ba358725`、builtAt `2026-10-08T21:37:18.446Z`、workerSHA256 `f8fcf22efdb1f200a1d3ecb3fbdd0f7092126363f166b2f52b00037174b22b5a`。build/配備成功、HTTP200/manifest一致。写真操作確認・自動試験は未実施。使用量42%、50%停止条件継続。

## 2026-10-09 小領域修復・旧手/衣服復元まで反映

W19 webManualSpot: 原Proxyの修復範囲/参照domain手塗り、既存repairRegionによる近傍拡散を接続。24MP実frame/1MP ROI/16M反復予算、境界未到達はrollback。生成ではない。保存・Undo・比較・通常render・Finalへ同一枝を接続。全Recipe Batchは手塗り写真固有枝の誤コピー/消去を拒否、限定同期は維持。

BrowserLocalの旧handToneManual/clothingSpotManualは実保存履歴doc一致+原本SHA+専用Workerを経由し、比較だけでなく復元/通常Preview/保存/Finalへ接続。現在draftの色編集を保持し、現HEAD CASは巻き戻さない。原寸8MP以下・単独専用枝のみ。人物/影との混在・別写真Batchは依然拒否。新規AIや認証偽装なし。

最新Version `3b38e1f3-2070-4571-9d94-d169dda651ab`、builtAt `2026-10-08T21:31:41.024Z`、workerSHA256 `6aaaafec2639799888574277541e5a6b535efc8ae85cb903e27270c850234199`。Web/build/preview配備成功、HTTP200/manifest一致。画像操作試験は未実施。使用量41%。前段Version `5dc94f77-2648-4294-8fe3-d717e9d0ca26`の小領域UI/衣服比較も含む。

## 2026-10-09 レンズ補正・手の保存版比較を反映

手動profileの歪曲/色収差を描画・既存ブラシ座標へ接続。逆変換条件外は拒否、勝手なcropなし。BrowserLocal手補正の旧保存版比較を実履歴/原本SHA/専用Worker描画で接続。復元は未対応のままで、比較完成と混同しない。

Version `3f21ef33-027a-41c4-a896-9d6dffa77fad`、builtAt `2026-10-08T21:25:41.069Z`、workerSHA256 `86eb16ad2b7898d65ec7501194c4827145520c615fc02176c8c8e4f2315f9eee`。build/preview配備成功、HTTP200/manifest一致。画像操作試験なし。使用量38%、50%で停止。引き続き衣服保存版比較と手塗り小領域修復を実装中。

## 2026-10-09 選別表示・変形操作を追加反映

保存済み星評価/採用・除外flagによる一覧絞込、元順/名前/評価順を追加。未保存入力で絞らず、非表示チェック件数を明示、明示操作のみで隠れたチェック解除。写真削除や提案自動承認なし。既存行DOMを再利用し順序変更時だけ移動する。

手動ゆがみUIに横のみ/縦のみ拡縮、0..1の部分復元を追加。既存strict operation/source座標/実変位認証経路の再利用。LUT説明も局所範囲と可搬設定の違いへ更新。

最新Version `f2ede701-eca7-4c75-b21c-ea819615cdf4`、builtAt `2026-10-08T21:09:05.639Z`、workerSHA256 `07eefa1b4ff170544f9f675709ab22baa293416bbd0ee5db009a4ffa600732cc`。Web build/Cloudflare build/指定preview配備成功。HTTP200/manifest一致。写真による機能試験なし。週次使用量36%、50%停止条件維持。局所LUTを含む前回実装もこの配備に含む。

## 2026-10-09 局所LUTをWeb反映

W01 localLUTMask追加。手持ちCUBEの既存SHA/parse/IDB経路を再利用し、元Proxy手塗り/消去/反転の範囲内だけLUT直前/直後のRGBを補間する。強度は既存profileで一度だけ適用。64線4096点/24MP/96M予算、alpha/metadata保持。Session保存/Undo/履歴概要、共通renderへ接続。同LUT強度変更はmask維持、別LUT/standard/白黒への切替は同commitでmask解除。通常Presetの色block置換時も解除。保存版復元はLUTとmaskを対で復元し、写真固有maskを可搬Preset/bundleに混入させない。

Version `4d911fab-0c8b-4141-a3de-47ff5098464f`、builtAt `2026-10-08T21:05:43.980Z`、workerSHA256 `07eefa1b4ff170544f9f675709ab22baa293416bbd0ee5db009a4ffa600732cc`。build/preview deploy成功、HTTP200/manifest一致。画像操作試験は未実施。

## 2026-10-09 手動形状変形・既存ブラシ座標をWeb反映

webManualLiquifyの厳格Recipe枝、元Proxy操作パネル（移動/拡縮/回転/固定ブラシ）、Session適用/解除/rollback、共通描画、保存版概要を追加。source補正/BW後・sceneGeometry前で既存変位核を実行。実適用fieldのみをcrop/vignette/canvasExpand後もPreviewに保持し、Workerから転送。書出しencodeへはfieldを複製しない。

既存ブラシはAfterから実fieldへ逆投影し、半径/硬さ/消去/曲線/矩形をsource coverageからAfterへ投影。editor、BW/AddShadow/OriginalShadow、旧blush/contacts/eyeshadow/eyeliner/eyelash/hand/highlight/clothingとhostに座標契約を伝搬。旧独立Highlight/Eyelashはmounted hostが元々ないため入力契約対応のみで、新UI公開とは数えない。原点はpixel centerで統一。実変位の境界identityとLipschitz<=.65を認証し、多値/不安定な変形は拒否、最近傍fallbackやブラシ一律無効化はしない。

実frame8MP/128操作/128M変位予算を維持。原寸metadataだけでは拒否せずProxy編集可、8MP超原寸Finalへの適用は未対応とUI明示。AI/テザー/Apple/HDR/大判は後回しのまま。

web:build、Cloudflare bundle、preview配備成功。Version `6c369e7f-2252-4d0e-acf6-f6a9d8809842`、builtAt `2026-10-08T20:59:23.198Z`、workerSHA256 `f77fd3f1d7f24ecb899dc6d6d5eff09faf288cd3a870d347f92303ba12598ffd`。既存 https://suite-preview.bals-enter.workers.dev/ HTTP200とcache-bust manifest日時一致。画像操作試験・実機試験はユーザー指示で未実施。週次使用量35%（50%で停止）。レンズ歪曲/色収差、旧特殊版のBrowserLocal履歴統合等は残りであり全体完了ではない。

## 2026-10-09 通常Web並列 第3回反映と次の必須条件

単色背景照明むら/banding（globalmean保持・halo付きblur）、BrowserLocal専用評価0..5/pick/rejectのIDB保存（AssetID+SHA）、権利確認付きLUT同梱設定JSON（32MiBraw/46MiBfile、SHA/UTF8/parse検証、単一Recipecommit）を反映。Version d04ddb43-240a-4879-a5ad-f5849e353705、builtAt 2026-10-08T20:46:47.549Z、workerSHA256 7cd034cc23fb5f5cfb68c66476c6bd1b1294d9886b6cd5a82760f806b5807f2d。ビルド配備成功、機能試験なし。

ユーザー追加: 手動形状変形は既存ブラシ座標整合まで必須。専用canvasだけで旧Afterブラシをずらしたまま／一律無効化して完成とはしない。原点/半径/線/overlay/保存mask/Crop回転等の合成を含む（CHANGE_NOTICE参照）。まだ実装していない。8MP変位核の単純24MP化不可、requestedではなく実適用fieldが必要。従前の8作業群全完了ではない。使用量直近30%、50%停止。

## 2026-10-09 通常Web並列 第2回反映

webManualClothing衣服しわ軽減を共通保存/Undo/描画/概要へ接続しPreview反映。既存kernel512core+4radius halo、原寸半径換算、24MP。レンズ周辺減光専用zero geometryのsampling座標を整数保持へ修正。Version 99a91935-1b3d-4200-9bf8-660eaba58e08、builtAt 2026-10-08T20:42:20.169Z、workerSHA256 dd5c05dd4f4249aaf124297e42d700078c680166564a4a6b2f213d43612c5498。機能試験なし。

## 2026-10-09 通常Web並列 第1回反映

白髪grayStrokes/blacken、webManualTeeth手塗り明るさ/脱色、personalLook可搬Preset、webLensShading手動SUITE profile周辺減光を追加。旧認可wrapper維持、lens歪曲/色収差/crop無効、旧Presetで既存Look維持。中央保存/Undo/描画/概要へ接続。実写真試験なし。Version 42494c2a-fe98-4667-82b1-8b76264c0d77、builtAt 2026-10-08T20:39:39.905Z、workerSHA256 7cc101e1366c1824020fdf5f165c79e4c7918470704fdabeb4d077fc8f748ac8。Preview既存ASSETS/originのみ。後続衣服しわ接続と端末内手動評価を進行中。AI/tether/Apple/HDR/大判は保留、50%停止。

## 2026-10-09 手動髪なめらかさ（Web反映済み）

2担当でmanualHair optional smooth 0..100（省略0）とUIを接続。512core+12px haloで既存recolorPortraitHair/smoothRegionBandsを再利用しcore内の有効mask RGBだけ戻す。旧設定互換、24MP/96M予算/alpha/metadata/入力保持。既存核の実raster半径3を利用、Proxy/Final物理半径同一は主張しない。保存版概要とpanel名にも追加。共有核・AI検出・黒髪化は変更なし。

Web/Cloudflare build・配備成功。Version 01bde73e-4499-4602-8025-14d3d87e57d5、builtAt 2026-10-08T20:31:21.829Z、Worker SHA256 1fd1f72579e8970738e0a288f4b6308013b53746cd85127fee5d1ec140cfb56f。HTTP200/manifest日時一致。機能試験/実写真実験なし。週次使用済み26%、50%停止継続。担当返却済み。

## 2026-10-09 手動クローン24MP（Web反映済み）

2担当で処理/UI並列。manualCloneの実処理上限を24MPへ変更、原本metadataのみの8MP拒否を除去。checkedRegion/healPortraitClone既定8MPは保持し専用24MP入口で同一private算法を共有。全画像の境界平均と不変donorを維持、正規化offset/brush/schemaは不変。UI1600px Proxy制限/古い下書き排除/保存を保持。24MP超Final、巨大RAW対応の完了ではない。

Web/Cloudflare build・配備成功。Version 12b843e1-1eb2-48b5-b8db-d964f969c74f、builtAt 2026-10-08T20:27:39.843Z、Worker SHA256 b9d02e9128357c193d846ac63a8716b308fad8971e7574d09eb90b9de3a05476。HTTP200/manifest日時一致のみ確認、機能試験・実写真実験なし。週次使用済み25%、50%停止継続。担当所有返却済み。

## 2026-10-09 マスク複製・個別ON/OFF（Web反映済み）

2担当でv2 layer optional enabled（省略true）とUI複製/切替を追加。無効も保存/合計数制限へ算入し処理とbrush予算消費のみskip、全無効は入力コピー。複製は新UUID/deep copy/40文字以内名、構造上限超過はdraft rollback。無効でもmask表示/編集可。保存版概要は有効数/各layer状態を表示。原本/履歴変更なし。

Web/Cloudflare build・配備成功。Version 70e2f107-b90e-4a30-8946-e92f9456b9d1、builtAt 2026-10-08T20:21:15.215Z、Worker SHA256 b9d02e9128357c193d846ac63a8716b308fad8971e7574d09eb90b9de3a05476。既存ASSETS/originのみ、機能試験なし。開始時週次24%、50%停止継続。

## 2026-10-09 名前付き複数マスク（Web反映済み）

処理/validatorとUIを2担当で並列。colorRangeLevels v2最大8レイヤーを追加しv1互換維持。全体32色選択/64線4096点96M brush予算、同じ未編集sourceから選択し補正を順次適用。UI追加/名前/順序/削除/選択レイヤー編集とmask表示、明示Applyだけv2へ保存。範囲/brush/gradient変更は選択settingsへ同期、全解除はnull。保存版概要もv2対応。中央枝変更なし。

Web/Cloudflare build・配備成功。Version 2129d77f-8eba-4a8a-b6f3-a613baec7eae、builtAt 2026-10-08T20:18:39.917Z、Worker SHA256 39f47be7ce538a1b0770e3eaa1b90b44dfcacd42e20cde91909380510b1a07a5。既存ASSETS/originのみ維持。機能試験・実写真実験なし。週次使用済み23%、50%停止継続。

## 2026-10-09 保存版の補正概要（Web反映済み）

調査で新manual各枝/色範囲mask/個人Lookは共通比較・復元接続済みと確認。重複実装せず、表示helperとcontroller/UIを2担当で追加。認可取得済本文の表示用概要をrevision/bodySHA256で対応し、保存版/名前付き版/比較左右へ表示。取得中/失敗/無効化で旧概要破棄、Workspace未取得情報は表示しない。Mainが比較キャプションへ同概要追加。履歴/原本/復元経路は変更なし。旧Trial専用人物枝の制限は継続。

Web/Cloudflare build・配備成功。Version 207a993a-0ec1-4380-b248-1c44827948ce、builtAt 2026-10-08T19:28:46.181Z。Worker SHA256 fd1b7085c6d9cf864a1cdf9b93bc6e1c74db385b18cbd77a0a4d156b470c649b（サーバー不変）。既存ASSETS/originのみ。機能試験・実写真実験なし。開始時週次21%、50%停止継続。

## 2026-10-09 手動目補正（Web反映済み）

処理/validatorとUIを2担当で並列実装。manualEyesはeye/sclera/irisの独立strokesとamountを厳密保存し、目全体の明るさ/白目の明るさ/瞳の彩度に既存enhancePortraitEyesを再利用。全mask同時の512tile処理、24MP・全体64線4096点96M。入力/alpha/metadata保持、空有効mask拒否。UIは領域切替、塗消す、強度、選択mask/全補正表示、明示適用/解除。photo-policy/session rollback/共通描画/provenance/editor接続。顔自動検出や認可変更なし。

Web/Cloudflare build・配備成功。Version c9e794a9-6fb7-4b37-8b7e-0179b34626d9、builtAt 2026-10-08T19:21:57.325Z、Worker SHA256 fd1b7085c6d9cf864a1cdf9b93bc6e1c74db385b18cbd77a0a4d156b470c649b。既存ASSETS/originのみ。機能試験・実写真実験なし、週次使用済み20%、50%停止指示継続。

## 2026-10-09 手動髪色・つやとLook管理（Web反映済み）

2担当並列でmanualHair新規3fileと個人Look管理2fileを実装。髪色/amount/shineは既存recolorPortraitHairの手塗り範囲処理を24MP・512tileへ接続。smooth/blacken0固定、64線4096点96M、alpha/metadata保持。photo-policy/session/共通描画/Worker provenance/画面へ統合。Look複製は新UUID/add/50件上限、削除は対象名表示と同意後に別ボタンで実行。transaction内で選択snapshotを再照合し、写真・現在Recipeには触れない。削除復元には事前JSONバックアップが必要。

Web/Cloudflare buildと配備成功。Version 9c4d99f0-6055-4fbe-abf0-a739d48f34bc、builtAt 2026-10-08T15:57:09.048Z、Worker SHA256 45ef1dbf86ca25a94b73c9550c1100f743e4cd9d9231058a9d68686e21cba97d。公開HTTP200とcache-busted manifest一致確認。既存ASSETS/originのみ。機能試験・画像実験なし、週次使用済み19%、50%停止継続。AI/Apple/テザーは対象外。

## 2026-10-09 赤目・局所色・Look複数ペア（Web反映済み）

3担当並列。manualRedEyeは手塗り虹彩範囲/amountを厳密保存、既存enhancePortraitEyes赤過剰抑制だけを512角tileで再利用。24MP/64線4096点96M、alpha/metadata保持。UIとphoto-policy/session rollback/共通描画/provenanceへ接続、顔認可gateは変更なし。色範囲maskにoptional basic露出±4EV/contrast・saturation±100を追加し、Levels後同maskで既存stack核適用。未設定/全0は旧経路。個人Look Liteは明示対応1..4組、各組同意/同寸法、decode前全file header検証でBefore/After各合計8MP。Worker既存複数pair学習を利用し係数保存形式は不変、学習写真送信/保存なし。200組Personal/RAW学習は別工程。

Web/Cloudflare build成功、Version cfabe898-aa8c-47b7-a338-e3dea455833d、builtAt 2026-10-08T15:53:11.295Z、Worker SHA256 b3c8bd4f0eac421480fd19d93cbb5384d8b4a5f6a12dd585e13511bee3b6d7b8。ASSETS/originだけの既存previewへ配備。機能試験・画像実験なし。週次使用済み19%、50%停止継続。AI/Apple/テザー対象外。

## 2026-10-09 範囲別肌補正・マスク境界（Web反映済み）

2担当で並列実装。肌補正v2は最大8名前付きlayerの追加/選択/改名/順序変更/削除と個別調整、選択範囲/全範囲の表示。全体64線/4096点/96M brush作業量を共有し既存24MP分割adapterを使用。v1は互換維持、明示Applyまで保存変換なし。マスクは色→輝度→gradient→brushの後にoptional refinementを適用し、拡張/縮小/平滑化/ぼかしを原寸0..64pxで保存。512coreと半径合計haloの分割処理により既存8MP核の制限を変更せず24MP実frameへ接続。中央Recipe枝/APIは再利用。

Web/Cloudflare build成功。Version 98c767e2-ef0c-4bc7-83e7-4a9f808b435e、builtAt 2026-10-08T15:43:31.104Z、Worker SHA256 cf3587713926a1f9034b005b42e55635c1b02f4cde42a9cf1b89008b3e83ea67。公開ページHTTP200とcache-busted manifestの新時刻確認。ASSETS/originのみ維持。機能操作試験・画像実験は未実施。週次使用済み17%、50%停止ルール継続。AI/Apple/テザーは対象外。

## 2026-10-09 肌仕上げ・グラデーション・Look退避（Web反映済み）

並列3担当で続行。肌にtemperature/tint/radiance/finishをoptional追加し、旧Recipeは0/naturalで表示、明示適用まで保存変更なし。非中立仕上げを早期returnで落とさず既存核へ渡す。全体平均に依存するtoneAmount/complexionAmountは0固定のまま。個人Lookは係数JSON1件を明示downloadし、64KiB以下の厳密形式で取込→概要確認→別ボタンで新UUIDの新規保存。元写真は含めず、既存Look上書き不可。色/輝度範囲へ線形/円形gradientを追加。既存式を共通helperへ抽出し、通常portrait8MP制限は変更せず新範囲maskは24MP全frame座標で計算。色→輝度→gradient→brush順。始点終点の2クリック/数値、反転/合成/解除を接続。

Web/Cloudflare build成功。Version 824083e1-a928-4fad-84d0-0bc1ba498c3c、builtAt 2026-10-08T15:35:38.279Z、Worker SHA256 40b86983d6018633bf10270b9dfb9d1d7abfa1685b15929290ca5bd30fd2ddb2。公開ページHTTP200とquery付きmanifest新時刻確認。ASSETS/originのみの既存構成維持。機能試験・画像実験なし。週次使用済み16%、50%停止ルール継続。

## 2026-10-09 人物/マスク優先の追加（Web反映済み）

ユーザー『一番大事なポイント』『サイドエージェントで並列』に従い3担当。メイクはv2最大8名前付きlayer、既存v1互換維持・明示Apply時のみ更新。全layer64線/4096点/brush96M作業量共有。色/輝度maskに全frame正規化brushで追加/減算/交差、既存Before採色とは排他。肌補正はsoften/texture/rosyの既存核を512core+最大128haloで分割、24MPの実frame上限に対応するadapterとUIを作成、中央保存/Undo/共通render接続済み。source96MPのmetadata計画と実frame24MPは別。旧原寸8MP制限の手動Cloneは今回変更していない。

3担当のコードを統合しWeb/Cloudflare build成功、Version a42972ac-4b17-4ec1-9368-ff31d3cb1e4aへ配備。builtAt 2026-10-08T15:01:50.483Z（JST10月9日）、Worker SHA256 a4ffdbc838e9cd09bdaf3c71b25d9fd3ee0fa2c3609a3ac17a58c4eaa0250f45。公開ページ200、通常app.jsに新skin/v2layerコードあり。manifestは初回旧時刻を返したがdeployment query付き再取得で新時刻確認。機能試験・実写真実験は未実施。週次使用済み14%、50%停止ルール継続。AI/Apple/テザーは対象外。

## 2026-10-08 手動クローン修復・輝度範囲を追加配備

既存healPortraitCloneを厳密manualClone Recipe枝で接続。専用未変形画面でコピー元/対象stroke指定、濃度/修復ONOFF/消去/解除。コピー元範囲外は全操作拒否、入力とalphaを保持。既存8MP核制限を原寸でも明示し、8MP超を対応済みとはしない。容量制限で画面編集不可でも保存済み設定の解除は可能。色範囲maskにoptional luminance 4境界/反転を追加し、未編集表示RGBの加重輝度と交差。旧Recipeは省略時従来挙動。保存/Undo/共通Preview/Finalへ統合、Workerのprovenanceにも新4枝の実順序を記録。

Web/Cloudflare build成功、Version 6dd64d29-6c56-44d0-9d65-76a28fee5f1a、builtAt 2026-10-08T14:50:26.197Z、Worker SHA256 e7e7d51bfae2ca9f53dbc640cc08bfbe8197f0224540ef778f486e2c32e2620d。公開ページ/manifest/Look Worker HTTP200確認。機能操作試験・画像実験なし。先行3機能を含め計5つの操作単位を反映したが、人物全機能/全Web完成の意味ではない。週次使用済み11%、50%停止ルール継続。AI/Apple/テザー未着手。

## 2026-10-08 優先3機能のWeb反映

手塗りメイク（追加/消去、色/濃度/半径/硬さ）、色範囲mask（採色/HSL範囲/反転/局所Levels）、個人Look Lite（補正前後1組の多項式学習/ローカル保存/改名/適用/解除）を新optional Recipe枝で保存/Undo/共通Preview/Finalへ接続。外部AI・自動顔検出・SDKなし。個人LookはLite1組であり200組Personal/RAW学習ではない。可搬Presetはまだ対象外。

Web/Cloudflare build成功。配備Version d019cd9d-e7de-474d-a268-a88bd13ee69d、builtAt 2026-10-08T14:43:08.111Z、Worker SHA256 4535f118458c827bae5d48262c83db732247522cf524b4921873bec68b154bf2。ページとLook module WorkerのHTTP200/JS Content-Type確認。途中version865dfa6fはWorker公開allowlist不足のため直後に修正済み。既存ASSETS/originのみ。機能操作試験・画像実験なし。週次使用済み10%、50%で停止指示継続。

次単位は手動クローン修復（8MP既存核制限維持）とoptional輝度範囲maskを並列で実装中。AI/Apple/テザーは除外、HDR/大型RAW/大判Finalは後工程。

## 2026-10-08 Webプレビュー一回配備

ユーザーの明示依頼によりWeb/Cloudflare bundleをbuildし既存suite-previewへ配備。URL: https://suite-preview.bals-enter.workers.dev 。Version ID: 073d95cb-10bc-4806-a8a3-bec5f3309d65、旧version: d03dbd49-0bf1-4e04-9b94-04abed67b57b。builtAt: 2026-10-08T14:24:56.681Z、Worker SHA256: 49a87e4f13f74f629dd1e012ef3d584add1fe899b09290c5d6ef99b3858ad9a2。wrangler deploy成功を確認。既存ASSETS/originのみを維持しD1/R2/Secret/migrationは追加変更していない。ブラウザ内保存のプレビューであり、認証クラウド専用機能やNode backendを今回配備した意味ではない。

build阻害の型2箇所とLibRawへの不要import依存を修正。AI機能の選定/有効化は保留。大型RAW拡張WASMは未生成、原寸Final/大判出力は未完。機能試験・実写真検査は未実施。ユーザーがWebを操作確認後Xcode移行、その後AI/SDK追加という最新順序。

## W20 Sites OriginalShadow保存版復元コード（再開後完了）

sessionと新restore-original-shadow-runtimeを接続。Sitesの実保存履歴から選択版の本文SHA・影documentを確認し、実HEADは現在保存revision/CAS基準として別に保持。本人/tenant/対象と背景の権限・原本SHA・取得原寸をfresh照合してProxyを準備し、通常描画可能なことを実行時に確認してから単一Undoの編集へ反映するコードを追加。保存は明示操作のまま、旧履歴を書き換えない。

ローカル復元hintは権限証拠ではなく参照情報のみ。Preview・再読込・保存直前に再認可し、CAS保存後は新HEAD基準に更新する。Undo/Redoと復元中の失敗ではcache/history/cursor/recipe/proxy/reference/hintを補償し、復旧不能ならrecovery requiredで止める。UIは権限/原本/履歴/寸法/復旧失敗を区別。今回コード作成完了であり実行確認済みではない。

制約: 差分OriginalShadow復元はSitesのみ。Trialの同document既存挙動は維持、異documentは拒否。独立手動人物補正6種、AddShadowとOriginalShadow同居、原寸Finalの拡張は別工程。検査・試験・build・配備未実施。

## W20 Node/Trialの保存履歴接続コード

repository.listRecipeHistoryが既存SQLiteの全revisionを単一読取snapshotで取得し、tenant/削除状態/写真binding/人物継続性と版の連番を確認。1000版・本文合計16MiB超は切捨てず拒否。serverに認証済みGET /v1/assets/:id/recipe/history、APIClientに対応取得・本文検証・supportsRecipeHistoryを追加（TrialClientは継承）。既存名前付き版UIが履歴モードで使用するコードまで作成。原本・旧版の書換えなし。Sites専用の特殊影復元はNode/Trial対応を意味しない。後工程でbackend distのbuildと配備が必要。検査・試験・build・配備未実施。

## 再開時点：保存版復元の表示と残作業（上記完了記録より前）

web-connected-versions-uiは復元ボタンを実履歴API対応のsaved-historyに限定。復元失敗時は権限/原本不一致/履歴変更/寸法不一致を区別し、復元成功後に一覧再取得だけ失敗した場合は「編集反映済み・未保存」と表示する。OriginalShadow復元helperとsession連携は継続中であり、この表示追加だけで影復元完成とはしない。試験・build・配備なし。

## W02 大型原寸のCanvas表示・辺操作

canvas-expandに画素確保なしのplanCanvasExpansionGeometry、projectionに同じ正規化Recipe検証を使うprojectCanvasExpansionGeometryを追加。source metadata96MPまでの整数寸法計画と実buffer24MP・16384辺・256MiB作業予算を分離。従来planCanvasExpansion/projectCanvasExpansion/expandCanvasPixelsは実容量拒否を維持。editorの原寸計画値は表示しつつFinalデコード/容量が未対応なら理由を表示（crop後が小さくても原寸decode上限を無視しない）。辺ドラッグ/キーボードのfull計画もmetadata用経路へ、実Previewの自然寸法照合と容量検証は維持。検査/build/配備なし。

## 大型RAWの原寸計画・縮小読込コード（後続更新）

SDK申請待ちを寸法取得の前提としない。公開仕様の記録画素数と、写真ごとの向き/cropを含むLibRaw処理寸法は区別する。repo所有のnative ABI 1拡張とWeb adapterを追加し、24MP超のProxyにだけhalf-size decodeを選択するコードへ接続。別の一時decoderでunpackせず原寸upright計画を取得、RAW割当512MiB設定、dcraw_process後の形状を画像コピー前に検証する。sensor/source96MP・入力128MiB・実decode24MP、Final24MPは維持。512MiBは総WASM/JSメモリ保証ではない。96MP超/対応外RAWを全メーカー対応とは表現しない。

pureはsource metadata96MPと実画素24MPを分離。Proxyは原寸比率で1600長辺へ揃え、既存Proxyを再利用する場合の丸めによる縮小累積を避ける。BW/AddShadow/OriginalShadowのbinding・backend保存source上限を96MPへ整合（実mask/影8MPは維持）。保存版特殊比較・AddShadow背景読込はProxy decodeの原寸metadataと実frameを区別。OriginalShadow Editor/Sessionも原寸metadataを保持して照合し、Finalでは縮小frameを拒否。認可/本人/原本SHA/履歴版の確認は維持。

**実行状態**: 旧WASMには新APIがないため大型RAWはまだ実動しない。拡張ソースから対応するWASMと生成JS/wrapperを揃えて再生成し、backend distも更新する工程が後に必要。今回ユーザー指定に従い検査・試験・実写真実験・build・配備は未実施。先頭の旧「原寸APIを未実装」は今回のソース追加で更新するが、稼働済みとはしない。原寸Final/分割大判出力、手動人物補正群の個別source8MP制約、Canvas原寸Final寸法表示の24MP制約は残作業。

## 24MP超Proxy RAW読込の未解決依存

raw.mjsとraw-decode-capability.mjsに現能力の明示とunpack前の拒否理由を追加済み。大型Proxy非対応、sensor/output24MP、input128MiB、halfSize=0を公開。推定メモリを保証値として扱わない。RGB→RGBA変換には行単位の取消確認を追加。pure/source上限は未変更。

同梱@colorhythm/libraw-wasm 1.1.1にはsetHalfSize(1)があるが、縮小前の最終upright原寸を確定する公開APIが不足。raw sensor寸法や半解像出力×2を原寸として採用しない。特殊幾何を全て識別できないためメーカー名/Bayer判定だけで許可しない。LibRaw公式の寸法説明もhalf_size/Fuji回転で寸法が変わることを明記（https://github.com/LibRaw/LibRaw/blob/master/doc/API-datastruct.html）。現時点では24MP制限を維持し、必要なのは正確なfull-output geometry取得を公開するdecoder対応とunpackメモリ制御。editorにhalfSize=1の場合の説明だけ追加したが、現在decoderはhalfSize=0のままで大型RAW対応完成ではない。試験/build/配備なし。

## 原寸情報と影処理サイズの分離

白黒縁/AddShadow/OriginalShadowの保存契約・frontend契約・UI/source bindingを24MPまでに整合。保存版比較は原本decode後に1600長辺Proxyを作り、正規化maskをその寸法で描画。実mask/影bufferは8MP維持。通常AddShadow Previewもtarget=proxyだけ縮小前decode24MPを許容し、両frameを必ずmakeProxy(1600)→実buffer8MP検証後に渡す。source target8MPと認証/原本SHA/履歴検証は維持。RAW decode24MP上限、原寸Final影8MP、24MP超読込/B0倍分割出力は残る。distは未生成なので配備済み動作の変更ではない。試験/build/配備なし。

## W20 白黒縁・影の保存版比較

sessionとsaved-version-special-runtimeを接続。指定履歴本文SHAを再取得照合し、本人/tenant/対象と背景権限/原本サイズとSHAを確認して実デコードと既存mask/合成Workerを使用。HEADへ過去版を偽装せず現編集不変。SitesClientでは実getSessionのSITES応答を明示検証する新比較専用契約、既存Trial gateを迂回して共有する設計ではない。比較UIも必要時原本取得へ訂正。現行8MP・同寸法背景等の処理制約、BrowserLocal未対応は残る。試験/build/配備なし。

## ローカル分類グループ改名・削除

local-preset-library-uiに既存分類核を使う改名/削除を追加。削除は確認チェック付きでローカルgroupと所属だけを変更、Preset/Recipeを削除しない。認証再確認・version CAS維持。改名時はIDを保持、削除された絞込みは全体へ戻す。試験/build/配備なし。

## W20 保存版比較の人物明るさ経路

renderSavedRecipeComparisonで既存portrait明るさ描画へ接続。既存人物処理承認を読み取り専用で確認し、各版でProxyから再検出して通常renderの対象照合へ渡す。承認の新規付与・Privacy停止解除は行わない。現在の人物選択/cache/Recipe/Previewは変更せず原本取得なし。白黒縁/AddShadowは既存gateが原本取得・HEAD照合を必要とするため拒否維持、OriginalShadowと独立manual6種も未対応。試験/build/配備なし。

## W20 可搬SUITE設定文字列の接続

web-connected-portable-preset-uiをeditorのXMP後へmount。既存encode/decodeとportableParametersによる設定文字列の書出し/取込、全設定表示と明示同意後のapplyPortablePresetを接続。Asset/SHA/版/Recipe/Afterの変更や権限停止で確認を破棄。非可搬部分を勝手に除去しない。署名無し設定コピーであり作者認定/公開/Cloud保存ではない。既存の未記載ブロック維持を表示。試験/build/配備なし。

## W20 自分用Preset分類

author-uiの公開Preset一覧へlocal-preset-library-uiを接続。既存分類核でdefault/adjusted・グループを明示指定し名前検索と併用。分類解除はPreset削除ではない。kind/id/version単位、更新版へ自動継承なし。fresh getSessionの本人/tenant/mode/backend単位に分類metadataだけIndexedDB CAS保存。失効/利用者変更時は表示を消去、未認証共有保存なし。人気度や公式分類は推測しない。試験/build/配備なし。

## W03 ローカル書き出し設定の接続

local-export-settings-ui.mjsをeditorへ接続。形式・サイズ・密度・出力シャープの4設定をBrowserDraftStoreへ保存し、実フォームへ適用して既存Final経路から読む。Workspace認証を迂回せずCloud Presetと区別。JPEG品質・命名は含まない。単写真専用の形式/シャープは一括へ変更せず、共通サイズ/密度のみ共用。厳密寸法のpad/crop/stretchと白/灰/黒背景も保持。既存サイズparserをexport-size-selection.mjsへ抽出して共用、無効な現在入力からも適用できるようraw入力rollbackを保持。保存初期化は遅延し失敗を操作内で表示。試験/build/配備なし。

## W20 保存版のProxy画像比較接続

session.renderSavedRecipeComparisonと専用web-connected-version-comparison UIをeditorへ接続。左右の保存版をfresh履歴/権限/bodySHAで照合し、準備済み原Proxyから既存描画で生成、専用canvasに比率保持で表示。現在Recipe/Undo/After/保存履歴は変更しない。ローカルLUTも解決。人物・白黒縁・影・独立manual等の専用runtimeを必要とする版は明示拒否し、省略して成功表示しない。取消/写真変更/権限失効で破棄。以下の旧記録の「画像比較未実装」は通常描画対応分について本記録で更新。試験・build・配備は未実施。

## W20 保存版の編集復元

controller.resolveのfresh認可取得、UI専用同意、session.restoreSavedRecipeVersionをeditorへ接続。最新head/Asset/SHA/版/dirtyと対象bodySHA照合後に単一commitで未保存編集へ復元。保存は既存操作で新版、原本/旧履歴変更なし。独立manual6種や異なるOriginalShadow文書の復元は現runtime未対応で明示拒否。画像比較は未実装。試験/build/配備なし。

## W20 保存履歴取得・設定比較の接続コード

Sites GET /v1/assets/:id/recipe/history、Sites/BrowserLocal getRecipeHistoryを追加。通常Node/TrialはsupportsRecipeHistory=false維持。名前付き版controllerはsupported時だけfresh履歴を取得してrevision/bodySHA照合、過去版命名と比較データ返却。editorは左右のRecipe設定をtextContentで表示し、無効化/失敗/権限停止時消去。画像比較・復元は未実装。1000件/本文合計16MiB超は明示拒否、truncateなし。試験/build/配備なし。新APIは未配備。

## W20 XMP色設定の取込接続コード

既存converter/parserを再利用し、1MiB以下のローカルXMPから対応8色設定を提案→一覧/明示同意→単一commitするSession/UI/editor接続を追加。未記載設定保持、露出±4超・未対応CRS・stale/改変拒否。Adobe描画再現でも既存XMP rendererとの画素一致でもない。Preset名/UUIDの登録を意味しない。試験/build/配備なし。

## 使用量の停止条件解除

ユーザーの明示指示で「週次残り30％で停止」を解除。古い記録の停止条件は今後適用しない。

## W02 服・手の独立UI座標伝搬

manual-clothing-spot-trial-host/UIとmanual-hand-tone-trial-hostへsceneGeometryを伝搬。既存原寸sourceWidth/Heightを共通座標関数へ渡す。幾何なしの既存動作維持。独立処理核のFinal統合はこの変更に含まない。試験/buildなし。

## W02 自由トリミング接続コード

既存ratio.free/Free契約を使うsetFreeCropと数値矩形UIを追加。原寸/Proxyで最低1pxと投影範囲を確認し、単一commit。rotation追従は既存の比率なし矩形経路を使用。editor既存Crop欄にmount、固定比率は維持。ドラッグ操作ではなく数値指定。試験/build/配備なし。

## W02 ガイド補正接続コード

sceneGeometry guided分岐（変形前/後各4点）をvalidator/共通contract/UIへ追加。既存Session/pure/brush行列経路で保存・描画。手動/ガイド切替と数値点編集、退化/地平線拒否。ドラッグガイドではない。試験/build/配備なし。週次残り35％、停止30％。

## W02 手動幾何のEditor接続コード追加済み

既存Crop欄へ9controls UIをmount。session.setSceneGeometryの単一保存/Undo、pureのmask後・rotation/crop前warp、worker provenance追加。localBrushGeometryへ原寸とsceneGeometryを渡しLocalLevels/BW/AddShadowで共有。OriginalShadow bridge/独立hostの伝搬漏れも補完。Preview/単Final/Batchは共通描画。試験/build/配備なし。Guided/自動モデルは未接続。独立clothing/hand host/UIの幾何対応は後工程で、今回Editor接続完了に混ぜない。

## W02 手動幾何の基盤追加（画面接続は未完）

scene-geometry-contract.mjsとphoto-policyにmanual全9controls契約、warpSceneへshared24MP/入力出力256MiB上限・行中断・恒等copy・射影地平線拒否を追加。local-levels-brush-coordinateへoptional sceneGeometryと原寸sourceWidth/sourceHeightによる往復写像を追加。既存呼出しは未指定のため挙動維持。次はSession保存/Undo、pureのmask後rotation前挿入、editor既存Crop領域拡張と全mask UIへ原寸/幾何引渡し、worker provenance。まだ幾何が画面から使えるとは報告しない。試験/build/配備なし。

## 一括参照色合わせ接続コード

batch-scene-match.mjs/session.batchMatchScene/参照UI/既存Batch選択callbackを追加。全体参照を使い、準備済み原Proxyのある保存済み2..20件へ個別推定しsceneMatchのみCAS保存。現在写真は除外。領域指定中は一括不可。権限/SHA/revision/dirty照合、原本取得なし。取消/部分保存/競合/保存未確認を別表示。試験/build/配備なし。dist生成未実施。

## 色合わせ推定領域の指定

sourceRegion/referenceRegionを原Proxy/参照画像にそれぞれ指定する数値矩形UIとsession mask変換を追加。既定全体、空選択拒否。推定領域であり補正は写真全体へ適用。保存契約は変更なし。シリーズ一括は既存batchSyncCalibrationの権限/CAS保存経路を再利用可能と調査済み、まだ未実装。試験/buildなし。週次残り42％（停止30％）。

## W01 参照写真の全体色合わせ

JPEG/PNGを端末内で読み、参照Proxyから全体色分布の固定scale/offsetを提案、明示適用/リセットするUIをeditorへ接続。原Proxy推定の変換だけRecipe/Presetに保存し、Preview/Finalの最初に一度適用。参照画像はアップロードせず、後の描画でも不要。古い提案を拒否。既存mask付き核を維持するが領域選択UI/シリーズ一括は未接続。試験/build/配備なし。

## ローカルLUT（接続コード追加済み）

ユーザー指定: LUT等の再利用資産は取得時ローカル保存を優先。専用local-lut-store.mjsのIndexedDB保存/読込、Recipe小容量参照契約、CUBE取込UIとeditor mountまで追加。共有Presetは依存配布がないため明示拒否。SessionのPreview/補助描画/単写真Final/Batch Finalへ保存LUTを解決して渡し、pureで参照一致を確認して既存核へ適用。欠損・破損は再取込が必要で無加工成功にしない。試験/build/配備なし。dist validatorは未更新。

## W01：輝度カーブ接続コード

color.lumaCurveの2..16点保存・Preset可搬化、数値点編集UI、session単一commit、Preview/Final既存applyExtendedCurvesへ接続。RGB/master処理を重複適用しない。editorのmount/refresh/disposeも追加。試験/build/配備なし。CUBE保存経路は別途調査中。

## W01：Point Color採色と自動/灰色点WB接続コード

Point ColorはAfter採色・最大16選択・専用canvas範囲表示・古いbinding拒否を接続。WBはBefore原Proxyから提案し固定gainを保存、Preview/Finalで共有。照明presetとは排他、既存gain0.25..4維持。editor mount/refresh/disposeまで追加。試験/build/配備なし。W01全体は未完（LUT/輝度カーブ/参照色合わせ等）。直近週次残り48％、停止30％。

## 続行：JPEG品質接続完了

共通1..100/default95 UIを単写真/Batchへ接続コード作成。保存出力設定との不一致拒否、Batchは全写真の保存Recipeを開始前に読取り、変更時リンク破棄、取消対応。検査/build/配備なし。直近残り51％、停止30％。Export Preset認証bridgeなどは未完でありW03全体完成ではない。

## 続行：Export接続・次の境界

単写真custom-count/custom-sequence命名を既存kernelへ接続済み。JPEG品質UI続行中。Exportシャープformは既にsetSettings/getSettingsあり（重複実装なし）。Workspace Export Presetの取得/保存はSites/Trialとは別Node bearer/tenant認証が未接続。4設定の一括反映・Final snapshot対応も残る。API tokenを渡すだけで同一本人と見なさない。

## 続行：WB固定照明

日光/曇天/日陰/電球/蛍光灯/フラッシュを既存表示用WB核へ接続。UI/session/Undo/Recipe validator/共通render/portable Preset対応。RAW camera WB、auto/selectorは別。temperature/tint既存微調整維持。検査/build/配備なし。最新使用48％・残り52％、停止残り30％。

## 続行：Sites保存記録

web-connected-cloud-status-uiをEditorへ接続。Sites本人確認ありの場合のみlistAssets読取り、サーバー返却記録の件数/size/取得時刻表示。失効・失敗で旧成功を消去。W21契約容量/別Workspace認証、W04 proxyTransport NOT_CONNECTEDは残依存。検査/buildなし。

## 続行：Preset検索・新色調整の可搬保存

公開Presetの名前検索をauthor-uiへ接続。新しい5色調整枝をpreset-author-contractでstrict検証/安全copyし保存/適用経路に通す。Full Applyは従来どおりpostDecode置換、旧3値Presetは既存postDecodeを保持。試験/build/配備なし。最新枠は残り54％。W21/W04次候補を読取り調査中。

## 続行：画像上HSL・カーブ

HSL採色とRGB/master/red/green/blue画像上カーブの2操作を既存After表示からsessionへ接続。標本はasset/SHA/版/Recipe/After URL固定、変更後は拒否。HSLは既存8色を1commit、カーブは既存setPointCurveへ1回。16点超の既存カーブを切り捨てない。画像モードの排他イベントを導入。検査/build/配備なし。最新残り55％、残り30％で停止。ユーザーは報告ごとの確認待ち不要、既存範囲の次作業へ続行を指定。

## 続行：ProfileとBrightness/Dehaze

標準/白黒ProfileとBrightness/Dehazeの2つの下位接続コードを追加。独立UI、session適用/Undo、strict保存validator、Preview/Final共通描画へ接続。ProfileはRAW camera/ICC/LUTを含めず、sceneBasicはExposureと別の表示用補正。サイドエージェントはUI/保存を排他分担、Mainが共有経路統合。検査/実験/build/配備なし。最新利用枠は使用44％・残り56％、停止条件は残り30％。

## 続行：上限整合・4帯域カーブ

ユーザー停止条件は週次残り30％。直近取得は使用43％/残り57％。Web接続のみ続行、検査・実験・配備なし。AI登録調査はユーザーが普通のチャットへ渡すためこちらでは進めない。

ポイントカラーは小さい行stripで処理するpoint-color-renderへ接続し共通24MPまでに整合。8MPでFinal拒否という旧記録を更新。全体bufferは保持するためB0倍判ストリーミングの完成ではない。4帯域カーブUI/session/保存validator/共通描画接続コードを追加。旧3帯域との非ゼロ同時適用を拒否、旧値は保持。細目はWEB_CONNECTION_PLAN.md。

## 2026-10-08 続行：Webポイントカラー

W01/LR-07の手動範囲編集UI→session.setPointColor→保存validator→Preview/Final共通renderの接続コードを追加。最大16選択、明示適用/リセット/Undo。色相nullは全色相として保存path限定許可。他の調整は保持。既存核の8MP上限あり、採色と範囲可視化・大判対応は未完。試験/実験/build/配備なし。UI・validatorを並列担当、共有描画/session/editorはMain統合。

## 2026-10-08 続行：Webカラーグレーディング接続

W01 / LR-08のUI・session適用/Undo・保存validator・Preview/Final共通renderのコードを追加。担当をUIと保存validatorに分けて並列作成し、共有session/render/editorは統合担当が編集。4領域H/S/LとBlending/Balance/Amountに対応。元の調整を維持しgradingのみリセット可能。検査・実験・build・配備なし。詳細・全25作業単位の残りはWEB_CONNECTION_PLAN.md。下記「製品コード変更なし」は一覧確定時の履歴で、現在は接続コード実装中。

## 2026-10-08 最新順序：Web接続の作業単位を先に確定

接続一覧はdocs/WEB_CONNECTION_PLAN.mdへ確定。作業計画の分割として共通基盤3＋機能群22＝25単位。44/65/LR14の延べ123行は各群へ主担当を一対一割当し、AI資産・Apple専用枝・未対応codecは別記。これは製品機能25個/25単位接続完了という意味ではない。製品コード変更なし。

ユーザーの最新指定はWeb繋ぎ込み→Apple対応→AI→最後にメーカー別SDK申請資料ZIP。下記「テザー完成時にZIP」は旧指示として上書きする。現在は44件＋採用差分65件＋LR14件の接続先・共通化・難度・依存を読取り整理する段階。延べ123件を独立接続123作業と扱わない。製品コード変更はこの一覧確定の後。

## 2026-10-08 固定指示：完成後のメーカー別SDK申請資料ZIP

ユーザー明示指示。SDK未取得でも実装できるコードを先に完成させ、完成報告・引渡し時にメーカー別問い合わせ資料をZIPにまとめ、ユーザーへファイルリンクを渡すこと。SDK依存の実機能は「SDK待ち」のまま区別し、SDK入手後まで資料納品を延期しない。現在はZIP未作成・未納品。

- 対象：Canon、Sony、Nikon、FUJIFILM、Panasonic、OM SYSTEM、PENTAX/RICOH。メーカー別の文書に分ける。
- 各文書：公式問い合わせ先/申請URL、必要な申請情報、希望SDK/API仕様書/サンプル、商用利用・再配布・対象OS・機種・接続方式の確認事項、SDK待ち機能と入手後の残作業、問い合わせ文面。
- 確認済み条件と未確認事項を区別し、公式参照URLと確認日を添える。メーカー共通条件として一括扱いしない。
- ZIPには全体一覧とメーカー別文書を同梱。秘密情報・認証情報・許諾未確認のSDK本体は入れない。
- この指示は資料作成・引渡し。メーカーへの申請送信や契約同意の代理実行は含まない。

## 2026-10-08 最新：テザー共通6作業とメーカー固有依存

共通通信、原本保管、Look queue、対応判定、保存済原本からProxy、queue永続化の6作業はコード返却済み。検査/build/実機/UI接続なし。詳細TETHER_CODE_HANDOFF.md。ユーザー指定の次順はメーカー固有の無線/liveview/露出→既存アプリ接続→無料公開資産・端末内AI。Canon/Sony/Fujifilm固有仕様は正式SDK/API資料未取得のため実装完了ではない。申請/契約同意を代理実行していない。

## 2026-10-08 最新：Lightroom採用14件のコード先行

ユーザー「ライトルームの分から作業開始」で対応範囲14件分のコードが揃った。既存再利用3件・共通化7件・追加4件の範囲は `docs/LIGHTROOM_14_CODE_HANDOFF.md` に記録。新規8ファイル。RAW NRと名前付き版Backend永続化も返却済み。RAWは復号後の線形RGB16処理でCFA AIは未実装。検査/実験/build/画面接続/配備なし。モデルweights・校正profile・実深度入力は外部依存として明示。Adobe完全互換を意味しない。

後続順序はLightroom14 → 必須テザー → 書き上げたコードを既存アプリへ接続 → Mac/Xcode。Mac側同時編集は行わず、引継ぎ版を固定して渡す。コスプレは保留。

## 2026-10-08 最新：差分66件のコード先行

最終判断：ユーザー「OK」でLightroom .lrcat/Collection移行は今回対象外・需要確認後の再判断と確定。今回必要な差分65件はコード作成完了として区切る。通常取込コードは維持。以下の採否確認待ち/作業継続中は過去の経過。接続・検査・配備の開始指示ではない。

続報：ユーザー「残りも終わらせよう」で追加6件の対応範囲コードを作成し、現在65件作成済み・1件採否確認待ち。残るEV3-0716は通常取込コードではなく.lrcat/Collection移行が必要かの判断。質問を提示済み。3担当返却済み。新規Apple大判TIFF領域renderer、Backend metadata/share SQL service、XMP設定変換、queue実行器を追加。検査/実験/build/接続/DB初期化なし。下記59件の数字はこの続行前の履歴。

ユーザー「一気に書いちゃって」により既存44件と重なる66候補の不足差分を並列作成。詳細は`docs/DELTA66_CODE_HANDOFF.md`。現時点のコード作成済み59件、実コードの書残し7件。試験・実験・build・アプリ接続・配備は指示により未実施。コスプレは後日ユーザーが指示するまで対象外、資料不足22件と独立追加5件も今回対象外。現行の共有基盤を再利用しSUITE印刷/SNS仕様を優先。未接続を理由にコード成果を0へ戻さず、未対応codecを未接続と取り違えない。

追加内容は人物/メイク/色/背景/幾何/RAW、保存/プリセットの独立処理、真16bit可逆TIFF strip出力、標準RGB変換、日時埋込、1D/複合CUBE、Apple Photos/Files保存。顔原本metadataと実Proxy上限の混同を2箇所修正。大判原本tile rendererと任意ICC CMMなど残る実装は詳細表に明記。保存担当のserver契約追補とImport読取確認を継続中。

## 2026-10-08 最新：Astra単独17件のコード追加

ユーザー「スタート」でAstra単独17件を明示再開。旧「自動開始しない」は今回の明示開始以前の記録。Astra3担当と親で17件すべてに処理コードを追加した。`docs/ASTRA_17_CODE_HANDOFF.md` に処理/API/モデル契約/未実装互換を記録。17件の機能全体が100%完成したとは報告しない。

コードのみ：検査・実験・テスト・ビルド・アプリ接続・配備なし。モデルweights/ORT/具体IO資産は未同梱。Perfect Shotは独自suiteps、TSQは未実装。LookはSUITE独自学習、私有Lightroom現像互換は未実装。旧全体試験PASSや0/44を今回の処理コードの進捗に混ぜない。15分継続指示は削除済みのまま。

## 2026-10-08 最新：混合16件コード作成（下記旧状態より優先）

ユーザーが再開と混合16件すべてのコード作成を明示。Astraサイドエージェント3担当と親で不足処理を追記し、`docs/MIXED_16_CODE_HANDOFF.md`に16件の処理コード・API・モデル依存・限界を記録。コード段階は16件分作成済み。下位の「利用枠停止」「0/44」「試験PASS」は旧日時の別基準であり今回のコード成果と混同しない。

コードのみの指示を守り、検査・実験・ビルド・製品UI/保存/Final接続・公開配備は未実施。モデル重み/ORT/runtime資産は別途必要。自動遮蔽や曖昧な歯列を認識済みと偽装しない。15分heartbeat `suite` は撤去済み。Astra中心17件を自動開始しない。

## 2026-10-05 利用枠ガードによる停止（下記旧状態より優先）

Codex週次使用86％・残14％を公式利用枠ツールで確認。15％以下の停止条件に達し、heartbeat `suite` のPAUSEDを設定ファイルで確認。A/B/Cへ安全区切り停止を伝達し、排他はすべて返却された。厳密 **0/44**。新規実装・試験・実Chrome・Cloud/公開配備は行わない。後続再開時は利用枠を再確認し、`docs/UNIQUE_FEATURE_PROGRESS.md`と`docs/OWNERSHIP.md`から引き継ぐ。

- A: 新規Eyeshadow Trial hostと専用試験。実Trial HTTP/SQLiteのNode synthetic-test-only 7/7・build PASS。通常Trialは人物privacy/眼位置の権威不足で保存拒否。実RAW/Editor/Final未接続。
- B: 新規SUITE限定Nose水平ROI純粋核と専用試験5/5・Web build PASS。Recipe/UI/Worker/Final/本人・鼻位置の検証なし。公式6操作の再現でない。
- C: Face DecorationsのNode/Trial実Asset保存GateをBackend限定で追加。専用HTTP/SQLite 3/3・build PASS。全Backend/全Web回帰は未実行。人物/顔位置/原寸の真正性・Worker/Final未接続。
- 直近の全Web **1638/1638**、Backend＋scripts **268/268** は上記後続変更より前のローカル回帰。現差分の全体回帰はNOT_RUN。実RAW/実機/CloudもNOT_RUN。

## 2026-10-05 最新ローカル作業（旧段落より優先）

2026-10-05追補: 厳密 **0/44**。C Face Decorations typed Recipe/Preset隔離新6/6・メイン独立6/6・build PASS、次は実登録Asset直接save Gate。A Eyeshadow Trial host/B Nose純粋とは別。公式6素材/製品Final/実RAW/Cloud未接続、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Nose公式6操作差分監査新5/5・メイン関連10/10 PASS、次は本人明示小ROIのSUITE限定水平変位純粋核。公式6操作と画素同等性は未主張。A Eyeshadow host/C Face Decorations Backendとは別、実RAW/Cloudなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。A Eyeshadow限定Worker/facade新6/6・メイン独立関連19/19・build PASS、次はTrial本人保存host。B Nose監査/C Face Decorations Backendと別ファイル。通常Trial privacy/真正Original/製品Editor/Final/実RAW/Cloud別Gate、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Head Pose公式差分監査新5/5・メイン関連9/9 PASS。全写真Rotate/Cropと顔姿勢の非同一性を確認、幾何/生成式・privacyは未確定。次はEV3-0185 Nose監査、A Eyeshadow Worker/C Face Decorations Backendとは別。実RAW/Cloudなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。C Face Decorations手動点描純粋核新6/6・メイン独立監査含10/10・build PASS、次は写真固有typed Recipe/Preset隔離。A Eyeshadow Worker/B Head Pose監査と別。公式6 stylesや製品Final/実RAW/Cloud未接続、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。A Eyeshadow Node/Trial直接保存Gate新3/3・メイン独立関連10/10・build PASS。次は限定Worker/facade。B Head Pose監査/C Face Decorations純粋と別、本人privacy/真正Original/製品Final/実RAW/Cloud別Gate、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Eyeliner Trial host実HTTP/SQLite拒否境界新6/6・メイン独立6/6・build PASS。通常Trial人物privacy reviewで正の保存は未到達、実RAW/Finalも未証明。Eyeliner製品mountは保留、BはEV3-0145 Head Pose公式差分監査へ。A Eyeshadow Backend/C Face Decorations純粋と別、Cloudなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。C Face Decorations公式差分監査新4/4・メイン独立4/4 PASS、6種そばかす素材/画素式は未確定。次は公式互換を名乗らない本人明示点描純粋核、A Eyeshadow Backend/B Eyeliner hostと別。製品Final/実RAW/Cloudなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。A Eyeshadow typed/Preset隔離新7/7・メイン独立7/7・build、旧Eyeshadow監査追随4/4 PASS。次は実登録Asset直接save Gate。B Eyeliner host/C Face Decorations監査と別、製品Final/人物privacy/実RAW/Cloud未接続、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。C Contacts Trial host実HTTP/SQLite新7/7・メイン独立7/7・build PASS。通常Trialは人物privacy/虹彩位置の権威証拠不足でfail-closed、Node synthetic-only成功はCAS mechanicsだけ。Contacts製品mountは保留し、CはFace Decorations公式差分監査へ。A Eyeshadow Backend/B Eyeliner Trial hostと別、実RAW/Cloudなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Eyeliner限定Worker/facade新6/6・メイン独立関連18/18・build PASS、次はTrial本人保存host。A Eyeshadow typed/C Contacts Trial hostとは別ファイル。製品Editor/Final/本人privacy/真正Original/実RAW/Cloud別Gate、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。A Eyeshadow三役mask runtime新8/8・メイン独立関連20/20・build PASS、次は写真固有typed Recipe/Preset隔離。B Eyeliner Worker/C Contacts Trial hostとは別。文書の本人・保存版自称は権威でなく、製品Final/実RAW/Cloud未接続、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Eyeliner保存線runtime新6/6・メイン独立関連18/18・build PASS、次は限定Worker/facade。A Eyeshadow mask/C Contacts Trial hostと別。保存線provenanceはcaller自称で本人・真正Original証拠ではない。製品Final/実RAW/Cloud未接続、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。Eyeliner旧監査修正後のメイン全Web **1638/1638 PASS**、Backend＋scripts **258/258 PASS**。A Eyeshadow mask/B Eyeliner runtime/C Contacts Trial hostの後続差分は別途再回帰。Contacts通常Trialは人物・虹彩位置の権威証拠がなくfail-closed、Node synthetic privacyはCAS mechanics-only。実RAW/実機/Cloudなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。C Contacts独立UI新7/7・メイン独立7/7・build PASS、次はTrial本人保存host。A Eyeshadow mask/B Eyeliner runtimeとは別ファイル。真正Original/人物privacy/虹彩位置/製品Editor/Final/Cloud未接続、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Eyeliner実Asset直接保存Gate新3/3・メイン独立新/監査7/7・build PASS、次は保存線の原寸/Proxy runtime。旧Eyeliner監査の偽alias受理期待は現typed拒否に修正し4/4 PASS。全Web1631中旧監査1失敗は修正前で、後続全回帰要。A Eyeshadow mask/C Contacts UIと別、実RAW/Cloudなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。A Eyeshadow独立UI新7/7・メイン独立7/7・build PASS、次は三役mask runtime。B Eyeliner直接save Gate/C Contacts UIと別ファイル。公式style/真正Original/製品Final/実RAW/Cloud未接続、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Eyeliner typed Recipe/Preset隔離新5/5・メイン独立5/5・build PASS。次は実登録Asset直接save Gate、A Eyeshadow UI/C Contacts UIとは別。本人privacy/真正原寸/製品Final/実RAW/Cloud未接続、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。C Contacts限定Worker/facade新6/6・メイン独立関連17/17・build PASS。次は新規独立UI、A Eyeshadow UI/B Eyeliner typedと別。本人privacy/虹彩位置/真正Original/製品Final/実RAW/Cloudは未接続、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。A Eyeshadow純粋核新5/5・メイン関連9/9、B Eyeliner UI新6/6・メイン6/6、C Contacts mask runtime新5/5・メイン関連11/11、すべてbuild PASS。次はA別UI/B別Backend typed/C別Worker。直前の全Web1602/1602・Backend250/250・spec147 PASSは上記Agent新規差分の一部より前で、後続全回帰が必要。製品Final/実RAW/Cloudなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。A Eyeshadow公式差分監査新4/4・メイン独立4/4 PASS。Desktop/Mobile 14 stylesとiPad 8 styles、専用Amount/素材/画素式未確定を分離。次は本人明示mask内のSUITE限定純粋彩色核で、公式同等性は主張しない。B Eyeliner UI/C Contacts maskとは別ファイル。製品Final/実RAW/実機/Cloudなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。C ContactsのNode/Trial直接保存Gate新3/3・メイン独立関連10/10・Backend全250/250・build PASS、次はring/pupil stroke→mask runtime。A Eyelashes独立UI新6/6・メイン独立6/6・build PASS、次はEyeshadow監査。B Eyeliner UI継続中。真正Original/人物privacy/製品Final/実RAW/実機/Cloudは別Gate。許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Eyeliner本人明示瞼線SUITE限定純粋核は新6/6・メイン独立6/6・build PASS、次は独立UI部品。A Eyelashes UI/C Contacts実Asset保存Gateとは別ファイル。公式9/6スタイルではなく、製品/RAW/Cloud Gateは未接続。全Web1527/1527・Backend247/247は後続変更前、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。C Contacts optional typed Recipe/写真固有Preset拒否は新7/7・メイン独立監査含11/11、Backend全247/247・build PASS。旧Contacts監査の汎用JSON受理期待は偽alias拒否に更新し専用4/4 PASS。次はContacts実登録Asset保存Gate、A Eyelashes UI/B Eyeliner純粋と別ファイル。全Web1527/1527は後続変更前、Cloud/配備/新実Chrome/実RAWなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Eyeliner公式差分監査4/4・メイン独立4/4 PASS、次は新規SUITE本人明示瞼線の限定純粋核（公式9/6ダミーなし）。A Eyelashes UI/C Contacts typedと別ファイル。全Web1527/1527・Backend240/240は後続変更前、Cloud/配備/新実Chrome/実RAWなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。A Eyelashes本人明示テーパー線のSUITE限定純粋核は新5/5・メイン独立5/5・build PASS、次は新規独立UI部品（公式17/14ダミーなし）。B Eyeliner監査/C Contacts typedとは別ファイル。全Web1527/1527・Backend240/240は後続変更前、Cloud/配備/新実Chrome/実RAWなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Hands Trial保存hostは実HTTP/SQLite合成非RAW拒否新4/4・メイン独立4/4・build PASS。真正LibRaw final provenanceが無ければ保存0、実RAW正のCAS/readbackはNOT_RUN、製品mount保留。Bは別候補Eyeliner監査、A Eyelashes純粋、C Contacts typedと別。全Web1527/1527・Backend240/240は後続変更前、Cloud/公開配備/新実Chromeなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。C Contacts本人明示虹彩ring色のSUITE限定純粋核は新6/6・メイン独立6/6・build PASSし、次は写真固有typed Recipe/Preset隔離。A Eyelashes純粋/B Hands Trial hostとは別ファイル。元11スタイル・虹彩自動認識は未実装。全Web1527/1527・Backend240/240は後続変更前、Cloud/配備/新実Chrome/実RAWなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。A Eyelashes公式差分監査4/4・メイン独立4/4 PASS。公式17/14スタイル素材を推測複製せず、新規SUITE本人明示テーパー線の限定純粋核に進む。B Hands Trial保存host/C Contacts虹彩ring純粋核と別。全Web1527/1527・Backend240/240は後続変更前。Cloud/配備/新実Chrome/実RAWなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。B Hands独立UI新6/6・メイン独立6/6・build PASS、次はTrial本人保存host。A Eyelashes監査/C Contacts虹彩ring純粋核と別。Hands保存は実Original/手位置をまだ証明せず、製品mountしない。全Web1527/1527・Backend240/240は後続変更前。Cloud/配備/新実Chrome/実RAWなし、許可再質問なし。

2026-10-05追補: 厳密 **0/44**。C EV3-0027 Contacts監査4/4・メイン独立4/4 PASS、元11スタイルとSUITE汎用色の非同一性を確認。次は新規虹彩ring色のSUITE限定純粋核、公式スタイル完成ではない。A Eyelashes監査/B Hands UIとは別。全Web1527/1527・Backend240/240は後続変更前。Cloud/配備/新実Chrome/実RAWなし、許可再質問なし。

18:43 UTC追補: 厳密 **0/44**。A Blush Trial保存hostは専用8/8・メイン独立8/8・build PASS。通常Trial `PRIVACY_REVIEW_REQUIRED`は保存拒否し、成功はNode synthetic test-onlyでserver-side privacy権威ではない。Blush製品mountは保留しAは別候補Eyelashes監査へ。B Hands UI、C Contacts監査と非重複。Cloud/配備/新実Chrome/実RAWなし、許可再質問なし。全Web1527/1527・Backend240/240は後続変更前、次回全回帰要。

18:43 UTC追補: 厳密 **0/44**。C Clothing Trial本人保存hostは実HTTP/SQLite新6/6・メイン独立6/6・build PASS。合成非RAW実Workerは保存0で拒否し、偽Worker成功はCAS mechanics-onlyで実RAW証拠ではない。Clothing製品mountは真正RAW/原寸Gateまで保留、Cは別候補Contactsの一次資料差分監査へ。B Hands独立Worker新6/6・メイン核/mask/Worker19/19、次はHand UI。A Blush Trial hostは通常Trial privacyを拒否側で検証中。全Web1527/1527・Backend240/240は後続変更前。Cloud/配備/新実Chrome/実RAWなし、許可反復なし。

18:41 UTC追補: 厳密 **0/44**。B Hand独立Worker/facadeは新6/6・メイン独立核/mask/Worker19/19・build PASSし、次は新規Hand UI部品。A Blush Trial host/C Clothing Trial hostはauth/Original/privacy Gateを進行。全Web1527/1527・Backend240/240はHand Worker追加前の全体回帰であり、現変更後は対象19/19 PASS。Cloud/配備/新実Chrome/実RAWなし、許可再質問なし。

18:37 UTC追補: 厳密 **0/44**。B Hands保存stroke→原寸/Proxy mask runtimeは専用6/6・メイン独立核/mask13/13・build PASS、次は独立Worker/facade。A Blush Trial host/C Clothing Trial hostは本人・原寸Gateを検討中で、通常Trialのprivacy不足や合成非RAW decodeを通して成功としない。全Web1527/1527・Backend240/240は当該後続Agent変更前のローカル回帰。Cloud/配備/新実Chrome/実RAWなし、許可再質問なし。

18:32 UTC追補: 厳密 **0/44**。Blush/Hands監査旧期待を現実の限定実装に追随させた後、メインで全Web **1527/1527 PASS**、Backend＋scripts **240/240 PASS**を独立実行。これは合成非RAWローカル回帰で、実Chrome/実RAW/実機/Cloud配備PASSではない。A Blush Trial host/B Hands mask/C Clothing Trial hostを排他で続行、許可再質問なし。

18:34 UTC追補: 厳密 **0/44**。C Clothing独立UI新6/6・メイン独立6/6、B Hands実Asset保存Gate新3/3・メイン独立3/3、ともにbuild PASS・排他返却。次はC Clothing Trial本人保存host、B Hands原寸/Proxy mask runtime、A Blush Trial host（通常Trial人物privacyはfail-closed）を別ファイルで並行。旧Hands監査期待は偽hand alias拒否へ修正し専用4/4 PASS、全Web再実行は後続Agent編集の後。Cloud/公開配備/新実Chrome/実RAWなし、許可再質問なし。

18:27 UTC追補: 厳密 **0/44**。A Blush独立手動UI新7/7・メイン独立7/7・build PASS、次は実Trial本人保存host新module。B Hands typed Recipe/写真固有Preset隔離新7/7・メイン独立7/7・build PASS、次はNode/Trial実Asset保存Gate。C Clothing手動Spot新UIを継続。全Web1521件中1520 PASS/旧Hands監査1失敗は偽hand alias拒否の新契約へ監査テストを追随し専用4/4 PASS、全Web再実行は現Agent編集後。Cloud/公開配備/新実Chrome/実RAWなし、許可反復依頼なし。

18:21 UTC追補: 厳密 **0/44**。C Clothing独立Worker/facade新6/6・メイン独立Clothing/Blush関連18/18・build PASS、次は新規手動Spot UI部品。A Blush新UI、B Hands typedと別ファイル。全Web回帰は旧Blush監査1失敗を専用4/4で修正した後、現Agent編集が落ち着いてから再実行。Cloud/公開配備/新実Chrome/実RAWなし、承認を繰り返さない。

18:18 UTC追補: 厳密 **0/44**。B Hands手動トーン純粋核は専用7/7・メイン独立7/7・Web build PASS、次はoptional typed Recipeと写真固有Preset隔離。A Blush新UI、C Clothing独立Workerは別ファイルで進行。全Web回帰の旧Blush監査失敗は監査追補と専用4/4 PASSで修正、全Web再実行は現編集の後。Cloud/公開配備/新実Chrome/実RAWなし、許可の反復質問なし。

18:14 UTC追補: 厳密 **0/44**。CのClothing Node/Trial直接保存Gateは実JWT HTTP/SQLite専用2/2・メイン独立2/2、build PASSし排他返却。次はClothing独立Worker/facade（Blush UI・Hands pureと別ファイル）。A Blush Worker専用12/12独立、メイン修正した旧Blush監査4/4 PASS。全Web回帰は修正前に旧Blush監査1失敗で、その後専用4/4を通した。全Web再実行はC/B/A編集が落ち着いてから。Cloud/公開配備/Chrome/実RAWなし、許可再質問なし。

18:11 UTC追補: 元候補全要素 **0/44**。AのBlush保存文書→独立Worker/facadeは専用6/6・メイン独立mask/Worker12/12・build PASSし排他返却、次は新規手動Blush UI部品（既存Session/Editor非編集）。BはHands本人手動限定純粋核、CはClothing実登録Asset保存Gateを継続。Vignette旧監査期待は関連11/11で修正済み、全Web回帰は担当編集中のため後続。Cloud/公開配備/新実Chromeなし、実RAW/実機は別Gate。許可の反復依頼なし。

元候補全要素 **0/44**。A=Blush保存文書→maskを独立Worker/facade画素へ接続中、B=EV3-0232 Hands差分監査、C=Clothing手動スポットoptional typed Recipe＋写真固有Preset隔離、および現所有`photo-policy.ts`のBlush settings getter事前評価安全修正。メインはdocs・独立回帰。限定段階としてOriginal Shadow製品Editor mount（新2/2・メインbridge含7/7）、Blush mask runtime（新6/6・メイン核含14/14）、Clothing spot純粋核（新6/6・メイン6/6）PASS。全Web1460件中旧Vignette期待1失敗はテスト修正後の関連11/11で解消、A/C/B後続編集完了後に全Web再実行。Cloud/公開配備/新実Chromeは行わず、実RAW/実機は別Gate。15分ごとの承認再質問なし。排他は[OWNERSHIP](OWNERSHIP.md)最上節、判定は[UNIQUE_FEATURE_PROGRESS](UNIQUE_FEATURE_PROGRESS.md)冒頭。

## 2026-10-05 現行継続（以下の旧段落より優先）

厳密な元候補全要素 **0/44**。A=Blush手動限定optional typed Recipe＋写真固有Preset拒否（`photo-policy.ts`/`workspace.ts`限定）、B=Original Shadow独立bridge提出済みで製品Editor限定mount、C=EV3-0313 Clothing adjustments差分監査、メイン=Vignette陳腐化監査試験修正/台帳/回帰。A純粋Blush8/8、B Shadow bridge5/5、C XMP往復3/3とEyebrows監査4/4をメイン独立PASS。全Webは直前1459/1460で旧Vignette監査期待1件が失敗し、製品契約を変えず試験を修正して関連11/11 PASS。全Web再実行はA編集中の型チェック安定後。新実Chromeは朝の本人『おはよー』前に起動しない。実RAW/実機/Cloud/公開配備は別Gate、承認を繰り返し求めない。最新排他は[OWNERSHIP](OWNERSHIP.md)冒頭、進捗は[UNIQUE_FEATURE_PROGRESS](UNIQUE_FEATURE_PROGRESS.md)冒頭。

## 2026-10-05 継続追加（以下の旧段落より優先）

元候補全要素は**0/44**。CのVerified Node XMP取込Panelは新5/5・関連69/69・メインXMP関連15/15 PASS、次は取得→取込の実JWT/SQLite往復。AはEV3-0030 Blush監査4/4をメイン独立PASSし、次は本人明示mask内のSUITE独自単一彩色純粋核（新module/試験のみ）。BはOriginal Shadow Editor接続の独立bridge（新module/試験のみ）。Cloud/公開配備や新Chromeは行わず、実RAW/実機・製品mountの残Gateを明示。最新排他は[OWNERSHIP](OWNERSHIP.md)冒頭、判定は[UNIQUE_FEATURE_PROGRESS](UNIQUE_FEATURE_PROGRESS.md)冒頭を優先。

## 2026-10-05 現在の非重複担当（以下の旧段落より優先）

元候補全要素は**0/44**、SUITE限定接続済み別枠12。AのDesktop↔iPad保存Recipe互換性data-only表示はメイン独立11/11 PASSで返却。BのOriginal Shadow Preview/保存後再Gateは新旧15/15、CのXMP限定取込部品は6/6をメイン独立PASS。現排他はA=EV3-0030 Blush一次資料差分監査（新docs/試験のみ）、B=Original Shadow製品Editor用独立bridge（新module/試験のみ）、C=Smart Culling XMP取込Verified Panel接続（Panel限定）、メイン=台帳・独立回帰。仕様147節、Backend213/213、Web build、差分形式はPASS。製品接続後の全Web/新実Chrome/RAW/Apple実機/Cloud/公開配備はNOT_RUN。朝の本人『おはよー』前の新実Chromeなし、15分ごとの許可再質問なし。[OWNERSHIP](OWNERSHIP.md)冒頭と[進捗台帳](UNIQUE_FEATURE_PROGRESS.md)冒頭を優先。

## 2026-10-05 最新ローカル継続（以下の旧段落より優先）

元候補全要素は**0/44**、限定接続済み別枠12。AのLR-02 Histogram全体表示/指標設定はメイン独立4/4、Cの限定XMP取込部品は実JWT/SQLiteメイン独立6/6、BのOriginal Shadow通常Preview/save後再Gateは実Trial/合成非RAWメイン独立15/15をPASS。仕様147節、Web build、差分形式もPASS。現排他はA=Desktop↔iPad読取り互換レポートUI、B=Original Shadow製品Editor接続用の独立bridge（共有Editorは読取り）、C=Smart Culling XMP取込のVerified Panel接続、メイン=台帳・独立回帰。各機能の製品mount/実Chrome/実RAW/実機/公開配備を済ませたことにはしない。朝の本人『おはよー』までは新実Chromeなし。15分ごとの承認再質問なし。詳細は[OWNERSHIP](OWNERSHIP.md)最上節と[進捗台帳](UNIQUE_FEATURE_PROGRESS.md)冒頭。

## 2026-10-05 作業中の最新差分（以下の旧段落より優先）

元候補全要素 **0/44**。CのSmart Culling Bulk Segmentは実JWT HTTP/SQLite新7/7・関連40/40・メイン独立7/7 PASSで返却。Cの次は別のXMP Rating/Label限定sidecar取込（新規module/試験のみ）。BはOriginal Shadow通常Previewを進め、Preview到達時に旧Final試験06の陳腐化期待を安全更新する排他を追加。AはLR-02 Histogram旧監査を訂正し、Adobe公式で明示された指標表示切替だけをHistogram限定で実装中。メインは台帳・非重複回帰。全Web/新実Chrome/実RAW/実機/Cloud/公開配備はNOT_RUN。認証と外部承認は繰り返し尋ねず、朝の本人『おはよー』までは新実Chromeなし。

## 2026-10-05 現在の排他補足（以下の旧段落より優先）

AはExport Output Formの厳格setter/readbackを新4/4・旧5/5・関連15/15・Web buildで返却し、メインも新旧9/9を独立PASS。現Node本人JWT hostが無いためExport Preset製品Apply/Finalは引き続き未接続。Aの次はLR-02 Histogram残操作の差分確認、BはOriginal Shadow通常Preview、CはSmart Culling Bulk Segmentを相互非重複で並行。元候補全要素は**0/44**、実Chrome/実RAW/実機/Cloud/公開配備はNOT_RUN。詳細は[OWNERSHIP](OWNERSHIP.md)最上節と[進捗台帳](UNIQUE_FEATURE_PROGRESS.md)冒頭。

## 2026-10-05 最新追補（以下の旧段落より優先）

厳密な元候補全要素完了 **0/44**、SUITE限定接続済み別枠12。B Original Shadow同寸法1:1の実Trial HTTP/SQLite＋合成非RAW Worker Final6/6、C Smart Culling Bulk Rating/Flag/Color実JWT/SQLite8/8、A Export Preset実Editor境界3/3をメイン独立再実行PASS。通常Shadow PreviewとEditor mount、Node Preset実本人host/Final、Culling製品OIDC hostは未接続。次の非重複排他はA=既存Output Sharpeningフォームの厳格setter/readback、B=Original Shadow通常Preview、C=Smart Culling Bulk Segment、メイン=docs/独立回帰。全Web/新実Chrome/実RAW/実機/Cloud/公開配備はNOT_RUN。本人の朝『おはよー』までは新実Chrome起動なし、15分ごとの許可再質問なし。現行排他・進捗は[OWNERSHIP](OWNERSHIP.md)最上節と[UNIQUE_FEATURE_PROGRESS](UNIQUE_FEATURE_PROGRESS.md)冒頭。

## 2026-10-05 現行引継ぎ（以下の旧段落より優先）

元候補全要素完了 **0/44**、SUITE限定接続済み別枠12。直近はA Export Preset本人操作UIが実JWT HTTP/SQLite3/3・メイン独立3/3、B Original Shadow Trial hostが6/6・メイン独立6/6、C Smart Culling Bulk Tag画面が新4/4・メイン独立Panel4/4＋部品6/6 PASS。メインのBackend+scripts全213/213、仕様147節、Web build、差分形式チェックPASS（各後続編集前）。現排他はA=Export Preset実Editor接続境界、B=Original Shadow限定Final境界、C=Bulk Rating/Flag/Color逐次CAS、メイン=docs/独立回帰。Trial認証とNode Workspace JWTを混同せず、認証host無しの製品機能を有効としない。全Web/新実Chrome/実RAW/実機/Cloud/公開配備はNOT_RUN。朝の本人『おはよー』までは新実Chromeを起動せず、15分ごとに許可を求めない。進捗/排他正本は[OWNERSHIP](OWNERSHIP.md)最上節と[UNIQUE_FEATURE_PROGRESS](UNIQUE_FEATURE_PROGRESS.md)冒頭。

## 2026-10-05 継続の最新状態（旧段落より優先）

元候補全要素完了は **0/44**、SUITE限定接続済み別枠12のまま。AのNode Workspace Export Preset別表/不変版/JWT HTTPを専用3/3・関連31/31・build PASS、BのOriginal Shadow二層手動UIを専用6/6・関連17/17・Web build PASSで限定提出。メイン独立で両専用9/9とTS build PASS。CのNode Culling Tag/AND-OR filterは新3/3・関連11/11・build PASS。現在A=Export Preset認証済みWeb client（新ファイルのみ）、B=Original Shadow Trial host adapter（新ファイルのみ）、C=Smart Culling複数写真Bulk Tag（新ファイルのみ）を排他で並行、メインは独立回帰・台帳。詳細は[OWNERSHIP](OWNERSHIP.md)冒頭と[進捗台帳](UNIQUE_FEATURE_PROGRESS.md)冒頭を優先。全Web/新実Chrome/実RAW/実機/Cloud/公開配備はNOT_RUN。朝の本人『おはよー』までは新実Chromeを起動せず、15分ごとに許可を尋ねない。

## 2026-10-05 夜間継続の最新追補（旧段落より優先）

厳密な元候補全要素 **0/44**、SUITE限定接続済み別枠12のまま。AのCanvas Expand Escape/pointercancel後の非同期commit漏れはAbort伝達と失敗時fail-closed rollbackで専用8/8、メイン独立8/8、関連安全85/85 PASS。AはExport size exact寸法の公式未記載部分を推測実装せず変更0、Export Presetの保存正本不在を確認して偽命名証拠を作らず変更0。次はA=Node Workspace Export Preset別表/本人版CASの実保存。BはOriginal ShadowのTrial/Workspace保存Gate6/6、二層runtime4/4、独立Worker5/5を限定提出。メイン独立で各専用11/11、4/4、5/5 PASS。次はB=手動subject/shadow二層UI（新ファイルのみ）。CはDesktop↔iPad能力差data-only 7/7＋旧6/6、XMP公式Rating/Label限定bytes6/6とverified Node画面取得4/4を限定提出。メインCulling全関連35/35 PASS。次はC=Tag/AND-OR手動絞込UI。詳細排他は[OWNERSHIP](OWNERSHIP.md)冒頭、証拠/未完は[UNIQUE_FEATURE_PROGRESS](UNIQUE_FEATURE_PROGRESS.md)冒頭。全Web/新実Chrome/実RAW/実機/Cloud/公開配備は後段NOT_RUN。朝の『おはよー』までは新実Chromeを実行しない。許可を15分ごとに尋ねない。

## 2026-10-05 現行追補（以下の履歴より優先）

元候補全要素 **0/44**、SUITE限定接続済み別枠12。AのNode Workspace Effect Preset命名は新5/5・関連18/18、BのOriginal Shadow typed Node保存Gateは新6/6・関連22/22、CのDesktop↔iPad能力差data-only reportは新7/7＋旧6/6を限定提出。メイン独立でA+B専用11/11、C cross-device関連13/13、Culling client/preflight/Panel/verified mount関連13/13 PASS。仕様147節もPASS。全Web/実RAW/実機/新実Chrome/Cloudは後段でNOT_RUN。現排他はA=既存Canvas Expand edge overlayのCrop/取消/版差分監査（重複実装禁止）、B=Original Shadow二層mask runtime、C=Smart Culling XMP sidecar確認済み値限定。メイン=Culling redirect安全追補と独立試験・台帳。最新排他は[OWNERSHIP](OWNERSHIP.md)冒頭、進捗は[UNIQUE_FEATURE_PROGRESS](UNIQUE_FEATURE_PROGRESS.md)冒頭。朝の本人『おはよー』までは新実Chromeは起動しない。Cloudflare/公開配備/資格情報/課金は作業外。許可再質問はしない。

## 2026-10-04 最新ローカル追補（旧段落より優先）

2026-10-05 追加提出: AのAuthor Vignette-onlyは専用3/3・関連16/16・Session安全65/65、メイン独立でFull＋only6/6 PASS。CのCulling Web preflightは専用4/4・関連17/17、メイン独立4/4 PASS。メインはCulling bearer requestにredirect/no-store/no-referrer拒否境界を追加して新1/1＋preflight4/4 PASS。BのOriginal Shadow手動文書は永続savedRevision境界を修正中。最新排他はA=Node Workspace Effect Preset由来Export命名文脈、B=Original Shadow文書版境界、C=Desktop↔iPad能力差data-only。元候補完了 **0/44**、新実Chrome/RAW/実機/Cloud/全Web最終回帰は後段。

2026-10-05 後続割当: CのSmart Culling Web preflightは専用4/4・関連Web17/17・build PASSで限定提出し排他返却。次はC=Desktop↔iPad能力差の保守的データpreflight。A=Author Vignette-only、B=Original Shadow手動文書は並行継続。排他の正本は [OWNERSHIP](OWNERSHIP.md) 最上行、元候補全要素 **0/44** は不変。

2026-10-05 夜間続行の現行差分（以下の旧文より優先）: 元候補全要素は **0/44**、SUITE限定接続済みは別枠12件。AのAuthor Vignette Fullは現Trial Capture→Draft/採用→Apply→Undo/Redo→CAS再読込・合成非RAW Final画素を対象3/3・関連154/154で限定提出。BのGlow Workspace Full原本SHA pinは実JWT HTTP/SQLite新6/6＋browser bundle1/1で限定提出。CのNode Culling読取り専用preflightは4/4・関連42/42で提出。新排他はA=Author Vignette-only、B=Original Shadow本人手動文書、C=Culling preflight Web接続。現行詳細は [OWNERSHIP](OWNERSHIP.md) 最上段を優先。実Worker/実Chrome/RAW/実機/Cloud・全Web最終回帰は後段NOT_RUN。朝の本人『おはよー』合図までは新たな実Chrome確認を行わない。Cloudflare/配備/資格情報操作は作業外。

現行の引継ぎ（後続の旧履歴より優先）: 元候補全要素完了は **0/44**、SUITE限定接続・自動試験は別枠 **12件**。現在はA=Vignette Author製品Capture/Draft/Apply/Final（Session限定merge含む）、B=Glow Workspace Full Applyの原本SHA pin、C=Smart Culling選択のNode読取り専用preflightを相互に異なる機能・排他ファイルで実装中、メインは排他割当・統合回帰・台帳を担当する。AはManual Canvas Expand四辺overlay製品Editor接続の合成非RAW Chrome/Worker Finalと寸法/比率実表示専用5/5・関連30/30、さらにVignette Author portable型契約新5/5・関連86/86を限定提出。BはLevels/Selective Workspace Preset full/only・host注入mount、Full Apply optional原本SHA同transaction照合、Levels Full SHA7/7、Vignette Full SHA10/10、Grain Full SHA10/10、Calibration Full SHA10/10を限定提出。CはDNG撮影日Export naming単写真/Batch、Node Culling色ラベル・Segment UI/手動絞込・明示選択、Asset集合版と旧Web試験回復（Backend7/7・Web Culling15/15）を限定提出。Culling Finalはpreflight後のfresh権限/原本再照合と実出力接続が未了。Teethには認証済みperson inventory APIがなく、Facial Expressionには姿勢/遮蔽証拠がないため製品昇格しない。部分成功を44件の完了にしない。メイン独立Backend **199/199 PASS**（C後続変更前）、メイン全Web **1249/1249 PASS**（後続編集前）、担当後続全Web **1270/1270 PASS**（後続編集前）、Full SHA専用メイン独立4/4、Grain関連メイン独立10/10、仕様147節保持・`git diff --check` PASS。朝の本人『おはよー』合図までは新たな実Chrome確認をNOT_RUNで保留し、対象＋安全試験を進める。現行排他は [OWNERSHIP](OWNERSHIP.md) 最上節、各候補の未完Gateは [進捗台帳](UNIQUE_FEATURE_PROGRESS.md) を優先。実RAW・実機・公開Cloudは別Gate、配備や資格情報操作は対象外。

元候補全要素の完了は **0/44**、SUITE限定接続・自動試験は別枠12件のまま。Selective Color-only Syncは独立moduleから製品Session/UIまで接続され、専用Trial/Session/UI試験が通過。メイン独立の全Webは **1126/1126 PASS**、Perfect Shot監査3/3・候補窓8/8、Personalized AI Look監査4/4、Calibration-only Sync部品8/8も独立PASS。新Selective実Chrome操作はBrowser環境障害でNOT_RUNとし、過去の一部色域の実Chrome確認と混同しない。Perfect Shot候補窓は認証済み撮影順APIが現製品にないためfail-closed。AはGrain Workspace Preset境界、BはGrain-only Sync製品Session/UI、CはClothing Moiré監査を担当。排他担当は [OWNERSHIP](OWNERSHIP.md) 最上行、全判定は [進捗台帳](UNIQUE_FEATURE_PROGRESS.md) の現在節を優先する。実RAW・iPhone/iPad実機・公開Cloudは別Gate、配備や資格情報操作は対象外。以下の「1042件」「A=Histogram」等は執筆時点の履歴であり現行値ではない。

## 2026-10-04 ローカル継続追補

独立候補の全要素完了は引き続き **0/44**。AのExport namingは実Trial HTTP/SQLite＋実Chromeの現UI4方式と競合・原本改変・招待失効時0リンクまで限定確認し、試験用SQLiteの今後の保存先をGit無視のrepo内`.runtime`へ移した。CのExport sizeは保存済み合成非RAWの実Chromeで6画素方式×JPEG/PNG/TIFF×PPI/PPCの36出力と寸法・密度タグを確認した。BのGrainは実Trial HTTP/SQLite＋実Chromeで7調整のUI→Preview→Undo/Redo→CAS保存/再読込→Finalと失効・競合を確認。LevelsのAuthor公開Presetも実Trial Chromeで限定確認。Smart Culling/Output adjustments/Color Calibration/Selective Color/Manual canvas Expandの下位操作監査を追加し、元候補との具体的な未接続差を進捗台帳へ記録。AのVignette-only Syncは実Trial HTTP/SQLiteと製品Session/UIへ接続し、他調整を保持した2対象CAS保存、競合・失効・未保存draft拒否を専用試験で確認。Aは共有Session/UIを返却し次のHistogram監査、BはGrain-only Sync独立部品、CはSelective Color-only Sync独立部品へ移動。実ChromeはBrowser一覧空/CDP障害でVignette Syncとmanual JPEGの新fixtureともNOT_RUN。メインが排他調整・独立試験・完了判定を行う。今回のメイン独立ローカル全Webは **1042/1042 PASS**、担当後続は**1068/1068 PASS**（メイン全件再実行前）、メイン独立のVignette専用10/10 PASS、Backend **189/189 PASS**、仕様147節と差分形式チェックはPASS。これは実RAW・iPhone/iPad実機・公開Cloudの合格ではない。

限定到達点: Export namingの現UI4方式は合成非RAWの実Chrome・実Worker Blobで確認したが、残り5方式と実RAW/OS名は未確認。Glowは実Trialの編集/保存/Final、Author portable Presetの3モード採用/適用/Final、既編集写真の非Glow調整を保つ明示Glow-only Apply、およびhost注入Node Workspace PresetのGlow-only原子的保存/適用を限定確認したが、現TrialのPersonal/Workspace OIDC hostは未接続。Add Shadowは通常Worker/Session/本人手動UIへ接続し、実Trial HTTP/SQLite保存とfresh Asset/SHA/版Gate、他調整との同時Worker合成を確認。Node SessionはWorker不在で停止したが、別の実Chrome Browser Workerでは合成非RAWを`NOT_CAMERA_RAW`で拒否しPreview/Final Blob無し。実RAW成功画素や異寸法背景は未確認。実装残と外部Gateを混同せず、完了数は増やさない。Cloudflare/D1/R2/公開配備はこの継続作業の対象外。

Add Shadowの旧Chrome試験1回分の`C:\Users\user\AppData\Local\Temp\suite-shadow-trial-chrome-Dgrz37`と、Export naming旧Chrome試験3回分の`C:\Users\user\AppData\Local\Temp\suite-naming-trial-browser-QJOp6C`・`C:\Users\user\AppData\Local\Temp\suite-naming-trial-browser-t9Dorq`・`C:\Users\user\AppData\Local\Temp\suite-naming-trial-browser-oTvFsM`に合成試験用SQLite/Originalが残った。実ユーザーデータや実OAuth資格情報は含まれない。sandbox外のため権限なしの削除はせず、後続fixtureはGit無視のrepo内`.runtime`へ変更済み。追加許可を繰り返し求めない。

Vignette実Chrome再試行のtest-only `.runtime/vignette-sync-browser-MOmXTr` と `.runtime/vignette-chrome-profile` もrepo内に残った。どちらも合成非RAW試験データ/プロファイルで実OAuth・実ユーザーデータは含まれない。sandboxの削除承認は拒否されたため再要求や迂回削除をしない。Git無視のまま保持し、実Chrome GateをPASSにしない。

## 現行実装引継ぎ — 2026-10-04 独立候補44件

最新の正確な件数は [独立候補進捗台帳](UNIQUE_FEATURE_PROGRESS.md) を参照。元候補全下位操作の完了は **0/44**、SUITE限定の動作を接続・自動試験したものは別枠で12件。先行報告の「5/44」等は元製品候補の全要素完了を意味しない。重複統合は後工程として保留し、実装・検証をメイン＋3担当で重ならないファイルへ割当中。進捗が動いたときのみ短く報告し、15分ごとの許可要求はしない。Cloudflare再配備・資格情報・課金操作は現在の実装作業範囲外。

現在の主な統合対象は `EV3-0342 B/W Edge Removal` の**本人手動指定限定**経路。Node/CloudのAsset/SHA束縛保存契約、Trial fresh権限Gate、Worker Proxy/Final、EditorSession、After二層ブラシUIまで接続し、実Trial HTTP/SQLite＋実Chromeの合成非RAW 2 AssetでUI二層適用→保存→再読込→Final画素差を確認。元製品の自動対象判定/Update/Sync、実RAW/公開Cloud画質、8M超写真は未完了。`EV3-0396 Add Shadow` は独立Worker/facade、対象・背景Assetのfresh Trial Gate、typed非破壊document、Proxy/Source別mask、Node構造検証とTrial/Workspace保存境界、Trial限定orchestratorまで進んだ。合成非RAWでは実decode前にFail Closedするが、実RAW成功画素と製品Session/UI/Preview/Final接続は未完。Batchコピー/Batch Final/通常renderの無処理通過は拒否。`EV3-0764 Export naming` はBatch「元名＋指定文字」をmanifest/UIへ接続し、実ブラウザで明示順のPNG2件・安全名・失敗/取消0リンク・Blob URL失効・自動クリックなしを確認。DNG限定Exif撮影日も実Trialの読取Gateまでで、暦日採用・命名・実DNG corpusは未検証。Node Workspace手動Cullingは本人Session endpoint/client/host注入mountまで進んだが、実OIDC host/製品bootstrap未接続。Workspace Preset適用は版固定をサーバーtransactionで追加。直近の全Web990/990、Backend189/189 PASS。現在はA=Export naming、B=Mobile Glow、C=Add ShadowのE2E担当、メイン=独立確認/完了判定へ切替済み。詳細と排他担当は [OWNERSHIP](OWNERSHIP.md) 最上節。実RAW/実機/CloudはPASSへ転記しない。

## 最新追補 — Cloudflare専用コピーの引継ぎ（2026-10-03）

停止中の別タスクは再開・連絡せず、専用コピー `task/suite-cloudflare-full-2026-10-03` の草案2ファイルを引き継いだ。元SUITEと既存Sitesは読取りのみ。共有WorkerのAsset/Recipe/Original/作者提出、D1の既存0000–0002、Web Editorを再利用し、専用Cloudflare認証入口、失効可能なD1 Session台帳追加migration 0003、専用bundle/config template、Webサインイン/サインアウト経路を接続した。Recipe v1外形、旧D1表、既存Node QA backendは変更していない。責務と排他ファイルは [OWNERSHIP](OWNERSHIP.md) 最新節、接続の順序/未実施は [CLOUDFLARE_DEPLOY_PREP](CLOUDFLARE_DEPLOY_PREP.md)。

最新の新規Evidenceは [Cloudflare/Webローカル](evidence/cloudflare-2026-10-03/local-02.json) と [Windows回帰](evidence/cloudflare-2026-10-03/windows-03.json)。Web 260/260 PASS（旧258件維持＋経路2件）、Cloudflare独立15/15 PASS、Windows159/159 PASS（旧154件維持＋Sites準備5件）、FAIL/SKIP 0。Build ID=`source-sha256:ffc166788100d0fe9d3133c108dc85744eead504f22b68208b2ae5827c5744dd`、Git commitは無し。新規migrationはローカルSQLiteのみ実行、実D1/R2/AccessはNOT_RUN。`wrangler 4.147.0 whoami` は未認証であり、Cloudflare配備は行っていない。R2 subscription/Zero Trust/IdP/専用resource/管理Secret/実URLも未確認。実RAW・実画像、外部作者、Apple/iPhone/iPad、Feature Parity、Mobile Releaseは独立BLOCK。管理者Secret未設定でも一般ブラウザ内編集は可能だが、管理APIとクラウド保存/提出を実接続成功とは呼ばない。

修正途中の失敗Evidence [Windows-01](evidence/cloudflare-2026-10-03/windows-01.json) は専用コピーに凍結runtime素材が欠けたため157/159だった。元SUITEから該当2ファイルと旧154 Test ID Evidenceをハッシュ一致で読み取り複製し、Sites build再生成後にWindows-02/03で159/159を実測。失敗を削除・上書きしていない。

次の最短手順: 本人のCloudflare Dashboardログインで既存R2 subscriptionとZero Trustを確認する。新規subscriptionのcheckout、有料契約、メール送信は行わない。対象Accountと専用Worker/D1/R2・Access pathを確定後、Secretを本人が公式画面へ入力し、migration 0003の適用・bind/配備・現地データ分離/保存/提出/取消/使用量を実測。資格情報をチャット/ファイル/コマンド引数へ渡さない。過去チャットに出た管理者パスワードは再利用しない。現地接続前にローカルPASSを本番PASSへ昇格させない。

変更禁止: 元SUITE、既存Sites/別用途Cloudflare resource、凍結Evidence、原本RAW/旧part/旧Recipe/過去version、固定6保存同期契約、Recipe v1外形、無断の有料契約/決済/メール。Cloudflare専用コピー内も新Provider/料金/Apple課金方式を推測確定しない。

## 最新追補 — Web編集下部写真一覧・iPad操作（2026-10-03）

追加要件と受入境界は [Web写真一覧iPad追補](WEB_FILMSTRIP_IPAD_ADDENDUM_2026-10-03.md)。Web下部一覧へネイティブtouch横/慣性スクロール、スクロール中誤選択防止、mouse/trackpad操作、選択表示を接続。合成NON_RAWの1,000写真で端移動・未保存切替拒否・写真別Recipe保持と再起動相当の復元をローカル実行。filmstrip独立8/8、Web254/254、Windows既存154/154＋Sites準備5/5を最新差分で確認した。全Windows159件のログ/Source Hashは [新規回帰Evidence](evidence/web-2026-10-03/public-trial-filmstrip-02/WINDOWS_REGRESSION.json)。直前のSite bundle build不一致による失敗Runも別Evidenceとして保存し、結果を上書きしていない。iPad Safari実機、実RAW大量読込、実mouse/trackpadは `NOT_RUN`。Nativeは旧112件に追加1件を加え113 `NOT_RUN`。Siteはまだ旧画面・owner-onlyであり、このローカル結果をSites本番動作やiPad実機PASSへ転記しない。

現行の公開Web試用方針は後続の明示指示で旧「招待限定/owner-only継続」から変更された。ただし公式ソース接続・管理者Secret設定・所有者隔離と実操作の確認前に現Siteを一般公開しない。旧Site接続Evidenceとこの写真一覧追補はそれぞれ独立。既存RAW/Recipe/Cloud Safe/人物整合契約、凍結Evidenceは変更しない。

## 最新実測とSites引継ぎ — 2026-10-03 11:05 UTC

指定Siteはタイトル `SUITE`、閲覧 `custom`／オーナー限定、live version 33。旧本文は未置換。**Sites上の招待試用は使えない**。他Siteは変更していない。公式source checkout/publishが、credentialを非空stdinへ渡す段階で環境ポリシーに拒否される。資格情報をshell引数・ファイル・ログへ移す迂回は禁止。選択SiteのD1/R2/ChatGPT招待と実RAWは未実測。独立の状態証拠は [SITES_VERIFICATION_1104.json](evidence/web-2026-10-03/SITES_VERIFICATION_1104.json)。

現在のソースは Web build PASS、Sites Worker build PASS（**未配備**）、Web 221 PASS/0 FAIL/0 SKIP、外部作者adapter 18 PASS、Windows 154 PASS/0 FAIL/0 SKIP、文書整合10/10 PASS、147節と固定6文書保持。WebとWindowsの新規Run/時刻/Build/ログは [Web Evidence](evidence/web-2026-10-03/editing-sites-01/RUN_METADATA.json) と [Windows Evidence](evidence/web-2026-10-03/editing-windows-01/RUN_METADATA.json)。Web Build ID=`uncommitted-source-sha256:40213eff04156525f93c8f0cbb20b2ed058a0b5eeb45b41533e538db55dd193f`、Windows Build ID=`uncommitted-source-sha256:81eff3aac448f975b779aa89900e15ed4d795ed6396cd9230bb2108fcc33588d`。Commit SHA=NOT_AVAILABLE（repo has no commit）。旧Evidenceは上書きしていない。

この工程でWeb編集へ新たに接続したのは8bit sRGB**後段**のHighlight/Shadow/White/Black/Vibrance、8色HSL各3軸、Clarity/Texture/Sharpness。32操作の値検証、Recipe拡張、UI、既存保存/再読込/Undo/Redo/固定Finalを接続し、人工画像/状態試験を実行した。RAW段階White Balance/Temperature/Tint、失われた明部階調の復元、Tone Curve/Noise Reduction/Lens Correction等は未実装。Nativeはこの新拡張未対応・112件NOT_RUN。実RAW/実人物/Proxy-Final視覚/実機はNOT_RUNであり、Face Brightnessは `IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED`、Feature Parity/Mobile ReleaseともBLOCK。[機能境界](EDITING_GAP_MATRIX.md)。

次の最短手順: 公式Sites workflowがinteractive stdinを許す環境で**同じSite**のsourceを開く。旧version33を保持してSUITEの全必要source/lock/ビルドを移し、Site checkout根に正しい `project_id` 付きmanifest・`dist/server/index.js`・`dist/client`・Drizzle migrationをそろえる。選択SiteのD1/R2 binding、`SUITE_ALLOWED_ORIGIN`、dispatch認証、招待期限・取消を実測してから、新しいsource SHAと一致するarchiveをprivate保存/配備する。一般公開/メール/有料契約はしない。実RAW1枚の許諾素材が届いた後に取込→現像→保存/再読込→Final→作者Preset提出を独立実測する。実素材・環境待ちをPASSへ転記しない。

## 現在の引継ぎ — 指定Sites上のSUITE（2026-10-03 10:47 UTC）

ユーザーは既存 `https://eclat-genseki-demo.bals-enter.chatgpt.site/` をSUITEへ転用し、旧内容破棄を明示許可。別チャットは停止。対象Site名は `SUITE` に変更し、`custom`／オーナーのみの閲覧へ制限した。未ログインURLでChatGPTログイン必須表示を確認。旧コンテンツは**未置換**、保存済みversion33は履歴に残る。新しいSUITE EditorのSites公開・外部招待はNOT_RUN/BLOCK。詳細は [Site引継ぎEvidence](evidence/web-2026-10-03/SITES_HANDOFF_CURRENT.json)。

Sites公式のsource checkoutは credential JSON の非空標準入力をこの環境が拒否するためBLOCK。無害なNode stdinでも同じ拒否を再現。資格情報をshell引数・ファイル・出力へ漏らして迂回しない。`apps/sites`単体は外部相対import/依存/lock不足でfresh checkout build不能。別環境で公式stdinが使用可能になれば、旧版33を保持して同じSiteのSourceを開き、SUITE全体の必要source/buildを接続、同一source SHA/archiveで新versionを保存・配備する。D1/R2実接続/招待認可/終了取消はその後に独立実測。別Siteは変更していない。

ユーザー最新の編集機能指示ではSUITE_SPECの基本18項目中、Web実接続5／不足13。新規独立画素module（色4tone+Vibrance+8色HSL、明瞭度/テクスチャ/シャープ）は人工sRGB試験を進行中だが、共有renderer/Recipe/UI/保存へ統合するまでは「使える」とは扱わない。8bit sRGB後段とRAW段階WB/階調復元は別物。配色は白背景へ変更する方針だが後工程。最新差分で154/Web回帰を再実行するまで旧PASSを転記しない。詳しくは [不足Matrix](EDITING_GAP_MATRIX.md)。

## 最新状態 — Web招待試用・招待別期限/取消

現在の正本は [WEB_TRIAL_INTEGRATION.md](WEB_TRIAL_INTEGRATION.md)。ローカル招待ログイン/期限UI/サーバー期限拒否、保存履歴/作者提出/採用版保持を接続。Windows154、Web152、外部作者18、ブラウザ人工診断21は各0FAIL/0SKIP、文書10PASS。Evidenceは新規 `docs/evidence/web-2026-10-03/windows-02/` と `trial-final-01/`、Astra `apps/web/tests/results/trial-independent-08.json`。古いEvidenceは編集しない。

外部招待試用=BLOCK（専用Site creation429/実RAW0）、actualChatGPT/D1/R2未接続。Native112/RAW/実画像/iPhone/iPad NOT_RUN。顔SDK停止、Apple Face Brightness未視覚検証、Mobile Release/Feature Parity BLOCK。共有Recipe v1外形/旧DB/API/147/fixed6維持。trial専用DB/schema追加と既存共通validatorのbrowser-safe extractionを区別する。

ローカル8791は招待Login、8790は旧QA/PREVIEW ONLY。実ブラウザで使用したLOCAL UI QA招待は取消済み、再開するならCLIで別の明示日時付き招待を発行する。期間固定なし。原本/Recipe/提出を消さない。最短commands・全変更・全結果・未実装Recovery・必要環境・非公開配備条件は統合文書末尾を参照。既存Siteを削除/転用しない、有料/一般公開/メール禁止。

## 過去状態 — 共通人物整合Gate / Windows154 / Native112 NOT_RUN

この節と [旧最終報告](FACE_BRIGHTNESS_INTEGRATION.md) は人物Gate凍結時点の履歴。最新Web工程は上記を優先し、元154/Native112の証拠を保持する。

- 実測Windows TOTAL154 / PASS154 / FAIL0 / SKIP0。旧124・人物13・安全3・共通Gate14。文書10/10 PASS、前回記載漏れFAILは解消済み。Native112 NOT_RUN（旧82＋Core14/Apple16追加）。[全catalog/ログ](evidence/face-brightness-2026-10-03/windows-03/regression.json)、[環境・Build・時刻](evidence/face-brightness-2026-10-03/windows-03/RUN_METADATA.json)。
- [Native個別112件台帳](evidence/face-brightness-2026-10-03/windows-03/NATIVE_NOT_RUN_CATALOG.json)に必要環境・理由・次コマンド・合格条件を固定。Mac実行後は名前とNAT-IDを照合して新EvidenceへPASS/FAIL/NOT_RUNを保存し、このNOT_RUN凍結台帳を書換えない。
- Build ID=`uncommitted-source-sha256:6ae183017e27a424ad0d44e2b864c7ebd8e873c0279dc203f6ae405fe807d6d3`。Commit SHA=NOT_AVAILABLE / repository has no commit。今回Evidenceは [凍結manifest](evidence/face-brightness-2026-10-03/windows-03/FROZEN_RUN_MANIFEST.json) を維持し、後続結果を上書きしない。
- 共通人物Gate正式定義・TS実測data boundaryあり。全12操作経路とinventory/geometry検査の14 Test IDは [対応JSON](PERSON_INTEGRITY_PATHS.json)。実UI Undo/Redo/relaunch/mask/ExportはNOT_RUNで、Windows snapshot試験を実機PASSへ読み替えない。
- Face Brightness=`IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED`。人物UUID/全geometry inventory/Asset/SHAの不変検証、stale選択無効化、部分対象/重複bbox安全拒否、portrait付きExportの保存checkpoint再照合をsource接続。実画像・Native compile/実行は未確認。人物補正全体やEvoto Parity完了ではない。
- 原本Recovery: 保持設計/自動削除禁止のみIMPLEMENTED。orphan検出・asset照合・checksum再登録・UI・Recovery Recipe関連付け・Cloud Safe再評価はNOT_IMPLEMENTED。[将来フロー](ORIGINAL_RECOVERY_DESIGN.md)は設計であり完成機能ではない。
- 禁止事項: 147節/固定6文書/6領域契約/Recipe v1/既存DB・APIの不用意な再設計、原本上書き/自動削除、未同期Recipe/台帳削除、nearest/first/fallback、凍結Evidence書換え、未検証PASS化。標準50GB事業Baseline維持、料金/provider/IAP独断確定なし。
- Gate: Feature Parity BLOCK、Mobile Release BLOCK。実RAW、Proxy/Final画像一致、複数人物/背景保持、iPhone、iPad、Native112はNOT_RUN。本番Auth/Cloud/Sync/Billing未接続、Pricing未知原価BLOCKを省略しない。
- 残開発: Native拒否9欄collector/診断、Undo前global fork保存不能draftの解決UI、耐久draft/outbox、historical Export snapshot retry、原本Recovery、本番接続等。これらは環境が来るだけで自動完了しない。
- Evoto workflow458操作は [Registry追補](evidence/face-brightness-2026-10-03/windows-03/WORKFLOW_PARITY_SUPPLEMENT.json) にFeature ID/前後関係/850所属を保存。部分監査・Credit163全現適用UNKNOWNを維持。元レビュー18件＋追補入力9件不変。監査未完を今回データ安全実装の開始条件へ戻さない。

最短次手順（全部現在NOT_RUN、Mac準備後に実行）:

1. `swift test --package-path packages/METISMobileCore`、`swift test --package-path packages/SuiteCore`、`swift build --package-path apps/apple -c release`。実行Test名を最新NAT-IDへ対応させ、stdout/xcresult/Build/開始終了/理由を新Evidenceへ保存する。
2. `apps/apple`で`xcodegen generate`→`xcodebuild -showdestinations -scheme SUITE -project SUITE.xcodeproj`→実測destinationでiOS build/test。112件の成功/失敗/未実行を個別記録。Simulatorは実機の代わりではない。
3. [Native QA](FACE_BRIGHTNESS_NATIVE_QA.md) §3/4の本物の複数人物/実RAWで、顔だけ反映・別人物/背景保持・Proxy/Final一致・前後RAW SHA・保存/再読込/実再起動・一回適用・不正人物拒否を実測。
4. checkout外の実RAW100/500/1000を各別Evidence。既存Mac adapterはglobal EVのみでFace Brightness/同期/復元/Cloud Safe範囲外、full lifecycleは不足をBLOCKとして残す。ダミーRAW禁止。
5. iPhoneとiPadを別runでRAW Import→Proxy→Edit→Recipe Save→App Restart→Restore→Cloud Safe→Final Exportまで実測。model/OS/端末IDは観測値を使用し推測しない。未接続Cloudを省略してPASSにしない。

再Windows回帰が必要なら `node docs/EVOTO_AUDIT/tools/run-timed-regression.mjs docs/evidence/face-brightness-2026-10-03/windows-04`（未存在の新directoryのみ）。windows-03へ再出力しない。ソースを変えない限り今回154結果を維持し、変更時には最新差分で再実行する。

## 過去状態 — Crop / Workspace / Evoto v2/v3 / Pricing統合（履歴）

この旧節は124件統合時点の履歴。現状態は上のWindows154/Native112節を参照する。古い成功結果を最新差分の合格へ流用しない。

- 親担当最新回帰 **124 PASS / 0 FAIL / 0 SKIP**、旧34全件今回PASS。Native **82 NOT_RUN**（Core71＋Apple11）。[全件一覧](INTEGRATED_TEST_CATALOG.md)と[実コマンド・stdout・SHA](evidence/integrated-2026-10-03/regression.json)。Windows成功をMac/iPhone/iPadへ昇格しない。
- 147節・固定6文書は無変更。[147一対一対応](INTEGRATED_TRACEABILITY.md)。追加Crop16・Workspace45・価格28と監査v2/v3は別正本として統合。新しい商品・provider・課金方式を確定していない。
- 実装/Windows限定検証: Crop値とRecipe永続化、Workspace server権限/2・3人CAS/履歴/Preset固定値、quota/downgrade非削除、HTTP15件、失敗traffic、Trash跨DB再試行。詳しい限界は統合報告。
- コードあり未検証: Swift/SwiftUI、固定Recipe画像Export、Workspace client/layout。初期Workspace入口はnilで明示未接続。完成扱いしない。
- 未実装/未接続: production認証/Cloud/Billing、Proxy同期/cross-device、耐久offline/background queue、Workspace写真編集全導線、AI描画/tether、Gallery、同RAW別Project共有等。環境が来るだけでは完成しない。
- 実RAW100/500/1000は未配置。同期・再起動復元・Cloud Safe等をセット別NOT_RUNで保存。Mac未接続、iPhone/iPad実機未接続、device model/OS未確定。代用RAWなし。
- Sol 6.1が実装、Astraが読取りレビュー。転送失効・失敗計測・Trash再試行・過大chunkの4指摘を修正し、親の実行とAstra再レビューを完了。[レビュー証拠](ASTRA_REVIEW.md)。これはモデル性能比較ではない。
- [Evoto詳細台帳](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md)はZero-Miss BLOCK。公式記事240の収集と意味照合の完了を混同しない。未照合は次担当へ残す。旧162行を網羅監査完了扱いしない。
- [Apple提出Pack](APPLE_SUBMISSION/README.md)は草案・43項目未確定、提出未実行。[価格案](PRICING_BASELINE_2026-10-03.md)は1,980円/50GB等の事業候補。Pricing Gateも実原価不明でBLOCK。再添付は同一hash確認済み。
- [変更一覧](INTEGRATED_CHANGES.json)、[最短実行手順](NEXT_RUN.md)、[実機操作](MOBILE_DEVICE_QA.md)。全必須Gate実測通過までは **Mobile Release BLOCK**。Web完成はGateに含めない。

変更禁止: 固定6文書の無断変更、既存要件削除、原本書換え/自動削除、未同期データ削除、全RAW全端末同期、Proxy Final、quotaによる原本削除、LWWだけの競合処理、ダミー成功、provider/価格/Apple課金の独断確定。今のfail-closed quota未付与を商品「0GB開始」と解釈しない。

次作業: Windows回帰再確認→担当固定で未接続導線/監査残を進める。Macを得たらCore/Apple build→実RAW各負荷→iPhone/iPadを別Gateで実測する。新契約変更が必要なら理由と影響を先に提示する。

## 以下は旧工程の保存履歴

更新: 2026-10-03 JST。状態: **開発骨組み／Mobile Release BLOCK**。このファイルは状態の正本、仕様全文は隣接する4原文。旧outputs直下の方針ファイルは案内へ変更した。

## 履歴工程: 初期Evoto監査・Apple提出準備・実機化監査

統合結果は **SUBMISSION_READINESS.md**。Evoto詳細差分は **EVOTO_AUDIT.md / evoto-audit.json**、提出Packは **APPLE_SUBMISSION/README.md**、iPhone/iPad別の次実行は **MOBILE_DEVICE_QA.md**。今回変更一覧は **SUBMISSION_CHANGES.md**。旧実装工程の記録は下に維持する。

- 主要競合基準はLightroomでなくEvoto。撮影→取込→即時確認→自動適用→人物別編集→Batch→Exportの操作連鎖で比較する。
- A–G分類を使用。Gは公式情報で存在未確認であり、不存在と断定しない。Dの差分は勝手に147節へ仕様追加しない。Fは理由付き判断待ちであり削除承認ではない。Eも成熟度を別記する。
- 差分発見は即実装せず、既存仕様有無・UX・実機要否・実装/AI/クラウドコスト・非破壊整合・提案優先順位を台帳化する。監査提案を確定要件や新しいAPI/providerに置換しない。
- Export詳細は最重要比較対象。形式・品質・pixelサイズ・dpi/ppi・resize・metadata・命名・一括・出力先、既存300dpi/印刷A0/A1等/SNS比率/RAW＋Recipeを個別に照合する。
- 最新再実行は **evidence/submission-readiness-2026-10-03/regression.json**。34 PASS / 0 FAIL / 0 SKIP、native45 NOT RUN。旧verification-results.jsonは保存し、失敗や未実施を消さない。
- Apple提出資料は草案。正式URL、Privacy回答、年齢、暗号化、IAP、運営者/権利、署名、審査アカウントは未確定。提出・公開は行っていない。
- 初期製品はiPhone/iPadのみ。実機Gateは2つ。mac-build-testsは検証環境のGateとして維持。Apple silicon Mac / Vision ProへのiOS互換配信設定は提出前に対象外を確認し、今回は外部設定変更なし。
- 実機到着だけでは同期を含む全導線は通らない。backend初期注入なし、cloud Proxy/別端末復元/認証UI/iOS耐久queue等の未実装・未接続を、環境待ちとは分離する。

新規製品仕様・契約・保存構成・Webの変更は0。今回の文書整合検査は `node docs/APPLE_SUBMISSION/validate.mjs` と `node scripts/check-readiness-evidence.mjs`。これらのPASSは文書の整合のみで、製品機能・Apple申告・実機Gateは未合格のまま。

## 現在の状態

- 新規Gitリポジトリ（main、remoteなし、未コミット）。既存資産の実コードを調査し、安全な判断ロジック/設計だけ再利用。METIS/Picasso/da Vinciは無変更。
- WindowsのTypeScriptビルド、16 backend + 18 harness = **34/34 PASS、FAIL0、SKIP0**。原文147節の実装/テスト/Evidence対応と固定本文hash検査PASS。
- Swift Core 44 XCTest + Apple画像経路1 XCTestはコードあり・**45件NOT_RUN**。Swift/Xcodeがないため未実行・未ビルドであり、実装済み/合格とはしない。
- 実RAW 100/500/1000は外部フォルダ未配置。Mac/iPhone/iPadは未接続。代用成功なし。
- iPhone UIとiPad専用UIは共通EditorModel→SuiteCore/PhotoPipelineへ接続。SuiteBackendClientを注入接続できるが、認証UI・本番・cloud Proxy/cross-device復元は未完成。デフォルトはbackendなし、RAW通信許可false。

## 今回行ったこと

変更ファイル全件はCHANGED_FILES.md、全試験名はTEST_CATALOG.md、全コマンド・stdout・source SHA・147個別Evidenceはverification-results.json。最終回帰の再実行は `node scripts/final-regression.mjs`（JSONをstdout出力、正本を書き換えない）。
次の環境でコピーして実行する最短手順はNEXT_RUN.md。添付原文4本文一致の記録はSOURCE_PRESERVATION.json。

1. 元仕様84節、Mobile修正16節、Session Look追加23節、Cloud強制24節を原文のまま保存・追跡。別チャット回収と全T01–T30監査表を作成。
2. RecipeDocument v1をSwift/TypeScriptで共通化。plain JSON、null禁止、safe integer回転、深度制限、順序と非中立値の整合、共有golden fixture。実行確認済みはTS側だけ。
3. 原本限定FinalをRAWProvider/固定ExportPlanへ接続。未対応RAW/未対応Recipeは拒否。ImageIO fallbackは内容UTIでJPEG/PNG/HEICだけ許可（汎用TIFF読込みは未対応）。出力は別ファイル、一時保存→寸法検証→同期→確定。中断導線を追加。
4. Original取得失敗は「Original取得待ち」。backend破損検出で安全フラグ失効。画面には保存retry/復元retryを追加。
5. local immutable stream、SQLite CAS/再open、署名JWT/tenant境界、Multipart耐久再開・同session破損part再取得を実装/実行。容量不足はENOSPC注入。実child kill後のSQLite rollbackを確認。
6. Session Lookのモード/人物別intent/強度/Personal Color/固定版/個別除外/明示過去再適用をデータ化。適用計画はrequiresAnalysis/notSupported/readyForAdapterまで。**人物描画・Tether実動を実装済み扱いしない**。
7. Cloud Safe追加条件、Proxy品質・同期P0–P3・通信制御の純粋判定を追加。物理削除は実装していない。
8. checkout外RAW Manifest・計測runner。Mac用local QA adapter候補追加（既存PhotoPipeline共用、local hash読込み・JSON metadata成長・JPEG・serial/2048px QA workload）。Mac未ビルド。cloud/device adapterの代用ではない。

## 既知の未完成・問題

### 環境ではなく開発残

- production OIDC/session/Keychain、workspace member/role revocation、Storage/DB/Backup provider採用・接続・監査。開発JWT tenant claimは本番の完全ACLではない。
- createAssetの応答消失/Link保存失敗時のidempotency未実装。再送重複assetの可能性あり。CAS409時に他端末版/手元draftを選ぶUIは未実装。
- cloud Proxy/Preview/Recipe履歴の完全同期、別端末復元、background URLSession/差分outbox、iOS Multipart、LRU実行、pinの原子的再確認、通信設定UI。手動foreground送信中はisBusyなので通常Background同期完成ではない。
- 取込後のorphan Original/部分出力の起動時reconcile、破損checkpointを隔離し正常写真を救済する一覧復旧、メモリ圧実測。保存失敗の未保存draftはメモリ保持のみで、強制終了耐久は未完成。
- camera対応/Tether、顔/人体の再解析・mask/pose/background保護、AI適用、Progressive Display、Session Look UI/耐久保存/自動queue。モデルを処理済みピクセルとしない。
- 全RAW調整、color profile/線形処理/print、生成/Identity Lock、Preset/Community/Gallery/Team、課金/プラン。商用V1範囲を落とさない。
- Mac QA adapterのlocal経路は候補。cloud fetch latency、backend SQLite成長、実際のcrash recoveryは別adapter/測定。raw runner全機構完成と製品性能検証完成を区別する。

### BLOCKED_EXTERNAL_ENVIRONMENT

- Swift/Core/Apple/Mac QA adapterのビルドと試験（Swift/Mac/Xcodeなし）。
- 外部実RAW100/500/1000、50GB/100GB/500GB/1TB相当Project試験（未配置）。
- iPhone/iPad実機、端末ロック、OS終了・再起動、thermal/battery、タッチ、Pencil、実カメラ/cable matrix（モデル/OS未確定）。

## 次の手順

1. 本ファイル、4原文、6領域契約、CHANGE_NOTICE、trace、監査を読み、現ソース/最新実行記録を確認。
2. Windowsでnpm run checkを再実行。createAsset idempotency・cloud Proxy/差分queue・保存失敗draft永続化など、独立した開発残を固定担当で続行。仕様変更は理由/影響を先に提示。
3. Mac到着後Swift Core→Apple app→local QA adapterをビルドし、未検証コンパイル/実行不具合を修正。端末モデル/OSは実測して記録。
4. 実RAWをcheckout外へ配置してmanifestを検証し、計測ログ/Source SHA/Recipe版を紐付ける。iPhoneとiPadの実機QAは別々に実行。FAILURE_MATRIXを一項目ずつ実証。
5. backendの本番接続、商用V1＋全安全/QA＋追加Tether QAが未達の間はMobile Release BLOCK。Webを待つ必要はないが、Web以外の仕様を削ってPASSにしない。

## 引継ぎ時の区分（固定）

| 区分 | 内容 |
| --- | --- |
| 実装済み・Windowsで限定検証済み | TS/local storage/SQLite/JWT/MultiPart修復/判定/Manifest runner機構。製品全体の完成ではない |
| 未実装・未接続 | production/cloud Proxy/耐久差分sync/復元/AI/tether/各商用機能。詳細は上記開発残 |
| コードあり・未検証 | Swift/SwiftUI/固定Recipe Export/通信adapter/Mac QA adapter。『実装済み』にまとめない |
| 実RAW待ち | 100/500/1000、容量別Project。各セットのsync/restartRecovery/cloudSafeを個別NOT_RUN記録 |
| Mac実行待ち | Core44＋Apple1、native build、QA adapter、RAW decode/負荷。実コマンドはVERIFICATION/RAW_QA |
| iPhone/iPad実機QA待ち | 別々のモデル/OS/操作/熱/ロック/Background/復旧/Tether。Mac成功でも昇格不可 |
| 変更禁止 | 直近フェーズでは仕様・provider・API・保存/同期契約の追加変更なし。原本不変/既存147節を維持 |
| Mobile Release未合格Gate | verification-results.mobileRelease.unknownsの全34必須Gateが現buildの実測証拠なしでBLOCK。Mac、実RAW3セット、full lifecycle、iPhone/iPadを独立に要求。Webはなし |

同一プロセスのmetadata再openを『再起動復元』としてPASSにしない。Mac local adapterの10必須stage中sync/recipeSave/restartRecovery/cloudSafeはfull lifecycle証拠を返さず、クラウド未接続のまま総合PASSになることをrunnerが拒否する。

## 変更禁止事項

勝手な再設計/全面refactor/原本変更/Proxy Final/全RAW同期/未確認Cloud Safe・自動原本削除/固定座標の全員適用/Personal Colorで形状変更/既存仕様省略/ダミー成功/Web着手を禁止。
共有ファイルをサイドへ重複担当させない。モデル数・OS・性能・料金を推測で確定しない。実RAWをGitへ入れない。公開・課金・provider資源作成は別途権限と検証が必要。
