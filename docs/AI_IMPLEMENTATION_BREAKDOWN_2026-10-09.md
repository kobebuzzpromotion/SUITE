# AI分析・処理単位別設計案 — 2026-10-09

## 2026-10-13 最新のコード集計

一部12件を先行し、D03/D05/D06/F04/F05/H01の6件を元表のコード条件実装済みへ移行。**33件実装済み・6件一部・9件未着手**。詳細・条件・別拡張は `AI_PARTIAL_12_PROGRESS_2026-10-13.md` を正本とする。使用量停止条件は解除。以下の10月11日集計/未接続記述は当時の履歴として残す。試験・ビルド・配備・実推論は未実施。

## 2026-10-11 実装開始後の更新

最新H02: 検証済背景bundle→実PNG decoder→専用linear描画→SDR見本変換を追加。none影のみ、warp不可、PNG限定。現在写真/版/権利host確認必須。UI/保存/全編集復元は残るのでH02は一部を維持。比較特徴とBGR一時コピーの失敗/取消解放も追加。資産待ちと残コードの12件一覧はHANDOFF先頭。使用量49%時点、50%停止指示を維持。試験・ビルド・配備なし。

継続実装: D03本人紐付け手動肌平滑化を既存Undo/CASまで、G04外部生成背景候補を固定保護maskで明示採用/保存まで接続。H01は実C ABI worker/controller/モデル選択/既存proxy解析入力を接続し、別domainの人物照合sessionも追加。実WASM配置、gallery同意host、その他メイク/provider生成は残る。コード完成27/一部12/未着手9を維持。下位経路の追加と項目全体完成を区別する。

最新追加: F04/F05の背景Recipe・マスク不変保存・Editor Undo/CAS・通常再描画・明示解除を接続。previewと人物編集の1600px入力を統一し、Finalのマスク暗黙拡大は拒否。原寸用マスクと大判は残るので完成27/一部12/未着手9を維持。H02は背景拡張も厳密読込/原文保持、Web描画未接続。試験なし。

追加コード: D05実顔補正→部分receipt/checkpoint原子CAS保存、D04長drag分割/group Undo保存、F04/F05実背景と手動mask/光/影の人物panel previewまで接続。H02厳密JSON読込と原文保持。これら4系統は項目全体の完成とせず、完成27/一部12/未着手9を維持。保存/Final/専用Web描画等の残りはHANDOFF最新節に明記。試験なし。

最新集計: F03のmanifest/画像取込UI→不変ローカル保存→一覧更新まで接続し完成へ。完成27/一部12/未着手9。今回完成へ移行した5件はE02/F03/F06/H03/H04。未制作素材・SDK実通信・モデル実推論を完成数に含めない。H02は読込/全履歴保持まで、専用描画と編集保存接続が残る。D05は部分適用保存を継続中。試験なし。

最新追記: E02の永続相関とSDK非依存host組立て、F06の実rootからcatalog/モード選択UI接続を完成へ移行。現在は完成26/一部13/未着手9。実SDK動作、背景合成、旧設計8モードの全実装を意味しない。F06は既存ShootingMode全ケースを再利用（現5種）。詳細はHANDOFF先頭。試験なし。

最新: H03/H04をWeb実状態provider・状態一覧・既存手動補正導線まで接続し、コード条件完成へ移行。完成24/一部15/未着手9。人物照合Worker未組込を明示し、モデル未確認、RAM/thermal不明を準備済みにしない。H01実runtime導入後のprovider更新は残る。試験・ビルド・配備なし。E02永続相関、F06背景選択等も追加中だが未確定のため完成数に含めない。

D04ドラッグ追記: 元画像上の短いdragをtranslate候補へ入力するcanvasを追加。余白と写真変更を拒否。連続描画/長stroke分割は含まず、22/17/9維持。試験なし。

D04解除追記: 保存済みwarpのみの明示解除→既存Undo/CASを接続。他補正と原本保持、試験なし。大判warp/ドラッグブラシ/自動身体解析は残り、22/17/9維持。

D04確定追記: 保存renderer preview統一、既存warp復元、追加済列確認→既存Editor Undo/CASへ確定保存を接続。空列削除・大判warp・自動身体認識は未対応、22/17/9維持。試験なし。

D04通常描画追記: 保存recipe rendererを通常preview/Finalへ接続。局所補正・顔明度の後にwarp、8MP超過拒否、大判adapter未対応拒否。保存UI未開放、22/17/9維持。試験なし。

D04保存契約追記: localWarp schemaとRecipe/全Project履歴/ExportPlan写真束縛検証を追加。描画whitelistは未開放、保存UI未接続のため22/17/9維持。試験なし。

D04累積追記: 未保存128操作列、成功候補追加、Undo/Redo/reset、元PNGからの全列previewを追加。永続保存/Final未接続のため22/17/9維持。試験なし。

D04 UI追記: 人物panelへ単一操作の未保存warpプレビューを接続。入力/写真/取消失効、geometry入力版を束縛。累積操作・保存/Final未接続のため22/17/9維持、試験なし。

D04 preview追記: 検証済みPNGから同一fieldで画像とmaskを一括生成するactorを接続。画面/保存未接続のため22/17/9据置。試験なし。

D04 field追記: 手動ブラシ9演算・freeze反映・4点donor保護・最終map認証を追加。UI/保存/自動身体認識は残るため22/17/9据置。試験・ビルドなし。

D04画像追記: 認証mapを共用するFloat RGBA画像rendererを追加。maskと同じpixel-center規約、上下方向変換、alpha補間、二重適用拒否。field生成・brush UI・保存/Finalは未接続のため完成22/一部17/未着手9のまま。試験・ビルドなし。

D04追記: Webと同規約のcertified往復座標mapとL8 mask追従adapterを追加。画像renderer/ブラシ/保存/自動身体解析は残るためD04一部、完成22/一部17/未着手9。試験・ビルドなし。

D03領域候補追記: 実詳細点と人物maskから保守的な下顔幾何候補を作成・表示するコードを追加。肌/しわ/傷跡のsemantic検出や補正適用ではなく、欠落・曖昧は保留。専用検出器は未追加のためD03一部、完成22/一部17/未着手9のまま。

D03大判追記: 局所補正の遅延tile rendererを大判TIFFへ接続。global座標/halo/保護/alpha/取消を保持、予算超過は拒否。自動領域は残るためD03一部、完成22/一部17/未着手9。実境界画素/性能は未試験、ビルド・配備なし。

D03確定追記: 保存Float rendererとプレビューを統一し、旧layersを保持した新規1layer確定を既存Editor edit/Undo/Redo/CASへ接続。自動領域と大判tileは残るためD03一部、完成22/一部17/未着手9のまま。試験・ビルドなし。

D03保存基盤追記: LocalRetouchRecipeとRGBAf再描画adapterを追加、Recipe/全履歴/ExportPlan検証と通常PhotoPipelineへ接続。確定UIとpreview renderer統一、大判tileは残るためD03一部。完成22/一部17/未着手9据置。試験・ビルドなし。

D03プレビュー追記: 手動矩形と保護範囲を指定し、未編集proxyの局所平滑化/clone候補PNGを表示するmodel/UIを接続。設定変更・写真切替・取消の失効付き。保存/Finalは未接続でD03一部のまま。完成22/一部17/未着手9、試験・ビルドなし。

D03追記: LocalRetouchRequest/LocalRetouchRendererで明示maskの局所平滑化とdonor cloneのコードを追加。選択/保護/不透明domainを平滑化の参照元にも適用。UI/保存/Final/自動詳細領域は未接続なのでD03は一部のまま、完成22/一部17/未着手9を維持。試験・ビルドなし。

B04追記: Vision実詳細点/人物maskとYuNet顔の一意対応を共通serviceへ接続し、明示解析UIと結果失効を実装。B04を完成へ移行し、現在はコード完成22/一部17/未着手9、残り26。原寸mask・メイク全体・実推論動作の完成とは別。試験・ビルドなし。

土台あり優先の照合・更新: 完成18/一部21/未着手9から、A03（同梱本文表示）・A05（同版共有pool）・C01（登録元参照保持）のコードを追加して完成へ移行。現在は完成21/一部18/未着手9、残り27。右端のコード条件だけの集計であり、実機動作やMacバイナリ組込み完了を意味しない。詳しくはHANDOFF最新節。A03の配布責任者による許諾確認は未確認のまま維持。

第八段追記: D06/E06の保存後中断対策として、ProjectStoreにcheckpointとjobID完了記録の同一atomic保存、厳密再送一致、通常編集後の記録保持を追加。保存専用TetherLookCommitCoordinatorで実artifact照合→CAS保存→queue応答/再照合を接続。自動解析・描画workerや画面起動は未接続。コード作成と実機合否は別で、試験・ビルドなし。

第七段追記: E01の撮影前固定を永続queueへ接続し、Ingest Receipt→既存原本/Proxy/Checkpoint→queue→ackの共通サービスを追加。保存contextによる再開・再送照合を実装。SDK相関・画面起動・補正workerは別の残件で、自動撮影補正が動作済みとはしない。試験・ビルドなし。

第六段追記: C03/C06の写真対応と訂正履歴をgallery内で暗号化永続保存し、再解析の安定版・顔IDが厳密一致した場合に復元するコードを追加。CAS競合拒否・旧schema1読込・人物削除時の関連記録一括削除・不一致時の保留/確認付き作り直しをUIに接続。実推論と再起動の実動作は未確認。

第四段追記: C01/C04の明示同意付き暗号化人物gallery、C05の登録/削除/照合画面、A06の固定モデル導入入口を追加。B01/B05の写真切替・同一参照画像・取消をEditorへ接続済み。人物照合結果のRecipeへの自動適用はしていない。nativeライブラリ未組込みのため実推論不可。下表の「まだ含まないもの」は第三段時点であり、この追記が優先する。

第五段追加済み: C03/C06の手動人物対応・解除・画面内履歴、B04の既存Vision顔領域との一意対応、A06の資産状態表示、D02の人物EVから既存顔明度への候補計画とD06の明示適用→既存Undo/CAS接続。顔領域は同じupright PNGから取得し、明示対応した人物のみ扱う。履歴の永続化/撮影自動投入/詳細メイク全体は含まない。コードのみ、試験・ビルド・配備なし。

以下の旧本文は10月9日の設計時点の記録として保持する。ユーザー承認後、AIコード実装へ移行済み。詳細基準は `SUITE_CODEX_実装依頼_効率化設計と現行差分_2026-10-11_再作成.md`。元MDの再添付待ちではない。

|作業ID|追加済みコード・資産|まだ含まないもの|
|---|---|---|
|A01/A02|厳密manifest、実ONNXのhash/bytes確認、PinnedFaceModels、LocalAIModelStore|配布許諾確認一式・端末導入UI|
|A04|能力/資産/権限/料金を分けた判定核|実端末probe・画面表示|
|A05/B02/B03/B06|SuiteFaceCore C++、LocalFaceInferenceの直呼出し・同instance再利用|OpenCVのApple向け実バイナリ組込み・実推論確認|
|B01|LocalFacePixelsのsRGB/BGR解析画像・入力座標への逆変換|撮影導線・原本とのproxy変換の最終統合|
|B05|LocalAnalysisCacheのsingle-flight/LRU/容量・世代・取消|画面での写真切替との接続|
|C02/C03|FaceIdentityの版付き特徴量・候補判定・人物競合保留|同意付き登録・暗号化永続gallery・手動訂正UI|
|B/Cサービス接続|LocalFaceAnalysisServiceが画像準備結果→cache→推論→写真別target/特徴量→最新gallery照合を接続|画面・永続ID・Recipeへの適用、Appleライブラリ実組込み|
|D01|項目別の必要解析とSessionLookPlanningの証拠要求|全詳細領域adapter・人物補正の全画素接続|
|E01|CaptureContextとTetherLookQueueの固定設定入口|カメライベント対応付け・起動復旧への最終接続|

部品コードを作った範囲の記録であり48作業の完成数ではない。試験・ビルド・配備・実写真推論は実施していない。

設計のみ。ソース実装、モデル取得、推論、試験、配備、API課金は行っていない。Sol/Astraはコード作業の推奨担当であり、採用する画像モデル名でも能力保証でもない。完成率は推測しない。

## 1. 基準と確定できていない資料

基準は添付「貼り付けたテキスト.txt」（SUITE実装依頼：テザー撮影時のプリセット自動反映と、ローカル人物編集の接続）。YuNet 2023mar FP32、SFace 2021dec FP32、OpenCV 4.13.0 C++、Objective-C++/XCFramework、通常補正端末内、新規生成OpenAI有料という案を維持する。最新指示は分析・設計までなので、添付末尾の実装開始指示は今回は実行しない。

現HEADは `aba086ce477cd43daeb8d0d47e59c014e0176c56`、未コミット変更も含む現行ファイルを調査。添付指定基準commitはローカルで参照できないため、そのcommitとの差分網羅を主張しない。

参照指定された `SUITE_CODEX_実装依頼_効率化設計と現行差分_2026-10-09.md` 本体は未受領。期待SHA-256/サイズは貼付本文にない。モデル資産の確定はこの資料との照合待ち。推測hashで埋めない。下表は現在読める指示書とコードからの作業分解案で、資料受領後に差分を追記する。

## 2. 現状の重要な差分

1. AppleはVision顔矩形・人物マスクと顔明度の実画素処理がある。YuNet/SFace/OpenCV bridgeと写真間本人照合はまだない。
2. WebはMediaPipe詳細特徴点、手動補正、保存、Look学習がある。YuNet5点を既存詳細特徴点へそのまま代入できない。
3. Webの汎用ONNX image-to-image入口は単一pass契約。OpenAI APIやdiffusionの実行器ではなく、モデルを置くだけでは完成しない。実OpenAI呼出、生成用永続job/credit台帳は実装検索で見つからない。SwiftのGenerativeProviderはprotocol、CanonicalGenerationは値構造であり接続完了ではない。
4. Appleの撮影設定固定はcheckpoint到着時点であり、撮影/取得開始時点の固定が不足。
5. 顔明度にも全身・姿勢等の解析をまとめて要求する現計画は過大。必要解析を補正ごとに分ける。
6. 個人Lookの色写像学習、色調整、手動マスクは再利用対象。新たな有料AI処理へ変更しない。

## 3. 変更提案（未実装）

|現行案/状態|提案|理由・影響|
|---|---|---|
|YuNet/SFace採用|維持。顔照合コアと詳細特徴点/領域検出を分離|既存メイクの点配置を壊さない。常時2モデルを動かさず必要解析だけ実行|
|顔明度で全身解析も必須|補正ごとのrequiredCapabilitiesを宣言|最初の顔明度は顔領域と本人照合で成立させる。身体用モデル待ちで止めない|
|analyze/applyで検出を繰返す|入力とモデル版に紐付いた解析cacheを共通化|スライダーだけなら再推論不要。メモリ上限と取消を設計する|
|checkpoint受領時にLook固定|撮影/取得開始時CaptureContext固定|転送中のプリセット変更混入を防ぐ。SDK追加前に共通契約を作れる|
|人物判定待ちで全体停止|全体色と人物補正の状態を分離|不明人物では人物だけ保留。全体色の適用は継続|
|生成系汎用ONNX入口|OpenAI providerを別境界にする|生成APIをONNX形状へ無理に合わせない。既存候補採用・保護領域合成は再利用|
|背景80件の制作案|画像資産と処理コードを別納品管理|コード完成と80枚制作済みを混同しない。月次追加もmanifestで可能|
|タイムアウト後の再試行|結果不明状態と照会/照合を分離|ローカル冪等IDだけで外部生成の二重課金を防げると断言しない|

モデル変更の提案は現段階では不要。上記は主に共通契約と処理順の修正。速度・精度・利用枠消費率は未実測のため数値保証しない。

## 4. 共通契約（先にAstraが確定）

- AnalysisKey: 原本SHA、解析用画像digest、向き/寸法、縮小変換、モデルdigest、前処理版、要求解析種別。Recipeの色スライダー値だけでは失効させない。ただし解析入力画素が変わる編集では失効。
- FaceObservation: 写真内faceTargetID、矩形、5点、必要なら詳細点とtopologyID、座標変換、検出品質。PersonIDとは別。
- PersonMatch: 登録PersonID、モデル版、候補score/差、matched/ambiguous/unknown、手動訂正履歴。外部人物名推測は禁止。
- AnalysisBundle: 顔照合・顔領域・人物mask・髪/衣服等を任意能力別に保持。未取得を空mask成功にしない。
- CorrectionIntent: 効果種類・強さ・対象PersonID・除外設定。前写真のmask/座標は含めず、新写真で解決する。
- CaptureContext: 撮影ID/sessionID、確定済みpreset版/値、人物intent、背景ID/版、autoApply、Preview/JPEG/RAW対応。RAW確定前はoriginalSHAをnull状態として扱う。
- ApplyResult: globalApplied/personApplied/personPendingを分離。写真ID・Recipe版・世代を一致確認して保存/表示。
- GeneratedAsset: jobID/入力版/model・料金表版/素材digest/採否/保存状態。原本とは別物。再書出しに再生成しない。
- Capability: 端末で動くか、利用権限があるか、課金が要るかを別判定にする。

Preview解析をFinalマスクとして単純拡大しない。座標変換と必要な原寸再解析を区別し、同じ人物/補正意図を維持する。過去保存形式はadapterで読み、破壊的な置換をしない。

## 5. 処理単位の診断表

48は今回の設計上の作業単位数で、44機能や既存137候補とは別。担当はその行の完了責任者。同一共通コードをSol/Astraで同時編集しない。S=Sol、A=Astra。依存IDの完了後に着手する。右端はコード完成条件で、実機の品質合格とは別。

### A. 資産と実行準備

|ID|作業・入力→出力|既存/不足・再利用|依存|難度/担当|コード完成条件|
|---|---|---|---|---|---|
|A01|モデル資料→版付きmanifest|SHA検証部品あり。指定MDのhash/size不足|資料|中/S|モデル名・固定版・IO・hash・licenseの欠落拒否|
|A02|配布資産→端末保存|既存hash/asset保存を再利用。破損/途中取得処理追加|A01|中/S|一時保存→検証→確定、旧有効版を維持|
|A03|license→同梱通知|第三者通知の枠を再利用、重み別条件追加|A01|低/S|商用/再配布条件と出典を版ごとに表示|
|A04|端末状態→機能可否|既存能力判定あり、料金判定との分離不足|共通契約|高/A|RAM/thermal/OS/資産不足を別理由で返す|
|A05|manifest→共通モデルpool|写真ごとの再読込防止と排他追加|A01,A04|高/A|同版共有、上限・取消・解放・失敗復旧|
|A06|資産状態→設定画面|既存UIを再利用|A01,A02|低/S|未取得/破損/準備済みを区別、推論済み扱いしない|

### B. 推論と解析共有

|ID|作業・入力→出力|既存/不足・再利用|依存|難度/担当|コード完成条件|
|---|---|---|---|---|---|
|B01|画像→向き固定/色配列/逆変換|既存decode/geometry再利用、C++入力規約追加|A01|高/A|EXIF・RGB/BGR・stride・縮小倍率を固定|
|B02|画像→顔矩形/5点|Apple Vision/Web MediaPipeあり、YuNet追加|A05,B01|高/A|スコア/NMS/5点/原画像座標を明示|
|B03|顔→整列/embedding|Web汎用embedding核あり、SFace専用契約不足|B02|高/A|OpenCV整列/特徴出力とモデル版を固定|
|B04|画像→詳細点/人物mask|Vision/MediaPipeを再利用、YuNetとの対応追加|B02|高/A|topologyIDと顔/人物対応を別管理|
|B05|解析要求→cache/single-flight|現Appleは再検出あり|B01–B04|高/A|同入力重複排除、LRU上限、入力変更失効|
|B06|C++出力→Swift bridge|ObjC++/XCFramework未接続|B01–B05|高/A|メモリ所有権/例外/取消/バックグラウンド境界|

### C. 人物登録と写真間対応

|ID|作業・入力→出力|既存/不足・再利用|依存|難度/担当|コード完成条件|
|---|---|---|---|---|---|
|C01|選択顔→登録人物gallery|Webメモリgallery核を参考、Apple永続store不足|B03|高/A|本人提供画像とPersonID、モデル版を保持|
|C02|特徴→候補順位/曖昧保留|Webthreshold/margin核再利用|C01|高/A|似た複数顔/未検出/未知を無理に確定しない|
|C03|写真内顔ID↔PersonID|現UUID/anchor保護を維持、対応文書追加|C02|高/A|一意対応、手動訂正、旧IDの意味を変えない|
|C04|登録/削除要求→同意・保持管理|既存privacyを再利用、写真間gallery保存追加|C01|高/A|暗号化/消去範囲/失効/同期有無を固定|
|C05|候補状態→人物確認画面|UI追加。判定アルゴリズムは触らない|C02,C03|中/S|登録/訂正/解除/保留を表示|
|C06|人物状態→履歴表示|既存保存履歴UI再利用|C03,C04|中/S|写真内対象と登録人物を混同せず表示|

### D. ローカル補正と保存

|ID|作業・入力→出力|既存/不足・再利用|依存|難度/担当|コード完成条件|
|---|---|---|---|---|---|
|D01|効果→必要解析能力|SessionLookPlanningの一括必須を分解|共通契約|高/A|顔明度で身体/姿勢解析を要求しない|
|D02|人物intent→顔明度画素|Apple FaceBrightnessAdapterを再利用|C03,D01|中/S|新写真maskへ適用、旧写真座標をコピーしない|
|D03|肌/しわ/傷跡→局所補正|Web手動核あり、Apple adapter不足|B04,D01|高/A|手動領域先行、肌平滑化と修復を別効果にする|
|D04|体型intent→変形/保護mask|Webgeometry再利用、Appleと自動領域不足|B04,D01|高/A|ブラシ座標、身体mesh、背景保護を一致|
|D05|色+人物intent→部分適用Recipe|現全体requiresAnalysisから分離|D01,D02|高/A|人物保留でも全体色は継続、重複適用禁止|
|D06|補正結果→Undo/保存/Final|ProjectStore CAS・履歴を再利用|D03–D05|高/A|旧版読込、再開、Final対象一致、原本不変|

### E. 撮影設定固定と自動投入（AIとの接続設計。SDK実装は後工程）

|ID|作業・入力→出力|既存/不足・再利用|依存|難度/担当|コード完成条件|
|---|---|---|---|---|---|
|E01|撮影/取得開始→CaptureContext|現checkpoint後の固定を変更|共通契約|高/A|変更後presetが転送中写真へ混入しない|
|E02|Preview/JPEG/RAW→撮影ID対応|TetherIngestStore再利用、相関契約不足|E01|高/A|重複通知/再接続を冪等に対応、仮SHAなし|
|E03|受付/表示/保存→独立queue|既存永続queue/lease再利用|E02|高/A|上限/backpressure、原本を黙って破棄しない|
|E04|新規写真→補正/自動表示|Editor投入経路不足|D05,E03|高/A|世代取消、人物保留、固定設定で一回適用|
|E05|撮影状態→確認画面|既存Editor UIを利用|E04|中/S|RAW未確定/解析中/人物保留を区別|
|E06|再起動→処理再開|ProjectStore/checkpoint/queue再利用|D06,E04|高/A|同撮影の二重登録/二重適用なし|

### F. モードと登録済み背景（毎回生成しない）

|ID|作業・入力→出力|既存/不足・再利用|依存|難度/担当|コード完成条件|
|---|---|---|---|---|---|
|F01|8モード→初期値/操作順|共通補正を設定で切替|D01|低/S|モードごとに画像処理を複製しない|
|F02|背景画像→版付きcatalog|80件は制作案。実画像/権利情報不足|資料/素材|中/S|hash/寸法/thumbnail/権利/版を登録|
|F03|catalog→取得/ローカル保存|既存asset/hash方式を再利用|F02,A02|中/S|途中更新で旧素材参照を壊さない|
|F04|写真→人物切抜き/配置|既存合成/手動maskあり、自動adapter不足|B04,F03|高/A|境界/髪/透過/位置とFinalを整合|
|F05|人物+背景→光/影合成|既存shadow核再利用、混在順を確定|F04,D06|高/A|二重影・旧影混入を防ぎ元人物を保持|
|F06|mode/catalog→選択UI|既存preset UI再利用|F01,F03|中/S|未制作素材を完成画像として表示しない|

### G. 有料生成と消費管理

|ID|作業・入力→出力|既存/不足・再利用|依存|難度/担当|コード完成条件|
|---|---|---|---|---|---|
|G01|生成依頼→入力固定/見積|既存生成核/ゲートは参考、実provider別接続|共通契約|高/A|モデル/入力SHA/料金表版/上限/同意を固定|
|G02|見積→残高予約|原本容量台帳を課金台帳に流用しない|G01|高/A|原子的予約、同ID本文違い拒否、残高競合|
|G03|予約→OpenAI実行|汎用ONNXとは別provider、API鍵はサーバー|G02|高/A|入力最小化/取消/応答ID/結果不明状態|
|G04|生成出力→候補/Canonical保存|保護領域合成/候補採用核再利用|G03|高/A|入力版一致、元人物保護、非破壊保存|
|G05|保存/失敗→消費確定/解放|外部費用と利用者creditを分離|G02–G04|高/A|二重精算なし、timeoutは未実行と決めつけない|
|G06|見積/状態→利用者画面|共通job表示再利用|G01,G05|中/S|生成時だけ同意、保存素材再利用は再消費なし|

### H. Web展開と引継ぎ

|ID|作業・入力→出力|既存/不足・再利用|依存|難度/担当|コード完成条件|
|---|---|---|---|---|---|
|H01|共通C++→WASM/Worker|現Web MediaPipe/ONNX核あり、新共通照合core不足|B06,C03|高/A|Worker寿命/メモリ/取消、旧詳細点を維持|
|H02|Apple保存文書→Web読込|既存Recipeを維持、人物対応schema追加|D06,H01|高/A|未知版は明示拒否、旧履歴読込を保持|
|H03|端末制約→縮退/手動導線|既存手動補正を再利用|A04,H01|高/A|低メモリ時に無断クラウド生成しない|
|H04|機能/資産状態→状態一覧|既存feature catalog再利用|A06,H02|低/S|コードあり/資産待ち/接続待ちを区別|
|H05|操作/測定点→後工程確認表|実行は今回しない|E06,G05,H02|中/S|認識精度/遅延/モデル読込回数/費用を別記録|
|H06|各担当成果→共通接続統合|ファイル所有を確定して統合|E06,F05,G05,H03|高/A|共有schema競合解消、後方互換、残件を明示|

## 6. 担当集計と進め方

この48作業案はSol 15、Astra 33。『Astraしかできない』という判定ではなく、既存部品の局所接続と、解析/座標/保存/取消を横断する責任を分けたもの。手動補正等の既存コードはゼロから作り直さない。

1. 最初はAstraが共通契約、D01必要解析、E01撮影固定を確定。Solは独立した資産台帳/通知/UI準備を並行。
2. Astraを顔推論・人物対応保存・撮影queueの別ファイルへ分担。B05 cacheは一担当のみ。
3. SolがD02顔明度とC05/E05画面を接続。AstraがE06保存再開まで統合。
4. ここが最初の縦一貫経路。実カメラSDK待ちは別表示し、ファイル入力によるコード接続を実機テザー完成とは呼ばない。
5. 肌/身体、背景、OpenAI有料生成を独立した順で追加。Web照合展開は指示書どおりApple共通核の後。

コード報告書式: 対象ID、コード完了数、各IDの達成率（仕様差分の列挙に根拠がある場合のみ）、書き残し、資産/環境待ち。実機品質/テスト結果は別欄。今回の調査だけから実装率は付けない。

## 7. 資産・利用条件・費用

公式資料確認日2026-10-09。下記は公開licenseの確認であり、未取得の実ファイルや未知依存物まで商用承認済みという意味ではない。

|資産|入手先/確認|商用・再配布上の条件|費用/未確定|
|---|---|---|---|
|YuNet 2023mar FP32|[OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_detection_yunet)|[MIT](https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/LICENSE)。著作権・許諾文を保持|重み利用の従量API料金なし。配布通信/端末負荷は別。指定hash/size未受領|
|SFace 2021dec FP32|[OpenCV Zoo](https://github.com/opencv/opencv_zoo/tree/main/models/face_recognition_sface)|[Apache-2.0](https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/LICENSE)。license/該当NOTICE、変更表示等|同上。人物情報の取扱いはモデルlicenseとは別|
|OpenCV 4.13.0|[固定版license](https://github.com/opencv/opencv/blob/4.13.0/LICENSE)|Apache-2.0。組込むthird-party依存も別確認|ライセンス料とビルド/保守/配布費を分ける|
|詳細特徴点/人物mask|現Web MediaPipe・Apple Vision|現在の同梱通知/SDK条件と採用モデル単位で再確認|今回追加モデルの断定なし。髪/衣服/傷跡等は専用資産が未確定|
|背景80件|指示書は制作案のみ|素材ごとの加工・アプリ同梱/再配布許可が必要|制作費/配布費未確定。適用ごとの生成API費なし|
|OpenAI生成|[公式生成ガイド](https://developers.openai.com/api/docs/guides/image-generation)、[料金](https://developers.openai.com/api/docs/pricing)|自社サーバー経由、利用契約/写真送信同意は実装開始前に確定|採用model/quality/size未確定のため1枚単価は未確定。実usageと失敗/再試行費も記録|

OpenAI公式資料はAPI選択・費用項目の確認に使用。汎用ONNXモデルと生成APIの互換は主張しない。通常補正/照合/保存済み素材再利用を外部APIへ毎回送らない。

## 8. 既存Astra17機能との対応（勝手に削除しない）

|既存項目|今回の設計との関係/不足|
|---|---|
|AI Facial Recognition|A/B/Cの共通核へ集約|
|Personalized AI Look|既存色学習を維持。有料生成へ置換しない|
|Smart Culling|非顔採点再利用、人物groupはC共通。意味検索はtext/imageモデル・tokenizer未選定の別資産|
|Original Shadow / Golden Blonde Hair|B04/F05/手動色補正再利用。影/髪semantic資産は未確定|
|Facial Expression / Head Pose / Perfect Shot|照合はC共通。表情/姿勢生成・整列品質・遮蔽処理は専用設計が必要。OpenAIで同等と断定しない。TSQ互換は未実装のまま|
|Body Hair Removal / Clothing Moiré|皮膚/衣服領域と専用修復重みが不足。通常NRへ置き換えて完成扱いしない|
|Expand / Grass / Liquify Repair|Gの生成共通経路候補。ただしtask別入力/保護mask/出力検証adapterが必要|
|Motion Blur / Detail Enhance / Old Photo Restoration|単一ONNX想定核あり。採用資産のIO・倍率・専用能力が未確定。Gへまとめれば同等品質になるとは扱わない|
|HDR|AI必須ではなく既存保留工程。今回48のAI設計には追加しない|

この節の未選定専門機能は48作業へ無理に埋め込まず、モデル/方式が決まった後に下位作業を増補する。48だけで全137候補が完成するという計画ではない。

## 9. ローカル根拠

- `apps/apple/Suite/Services/PortraitPipeline.swift`: FaceBrightnessAdapter、analyze/apply/detect、Vision mask。
- `apps/apple/Suite/Services/PhotoPipeline.swift`: preview、Final対応extension。
- `apps/apple/Suite/EditorModel.swift`: スライダー更新/保存/再開導線。
- `packages/SuiteCore/Sources/SuiteCore/SessionLook.swift`: bindNewPhoto時のLook固定。
- `packages/SuiteCore/Sources/SuiteCore/SessionLookPlanning.swift`: 必要解析/人物intent。
- `packages/SuiteCore/Sources/SuiteCore/TetherLookQueue.swift`: 既存queue/lease。
- `apps/web/src/processing/astra-face-recognition.mjs`: gallery/threshold/margin/ONNX入口。
- `apps/web/src/processing/astra-image-model.mjs`: 単一pass ONNX契約。
- `docs/ASTRA_17_CODE_HANDOFF.md`: 処理核と資産待ちの範囲。
- `docs/PHOTO_ARCHITECTURE.md`、`docs/REUSE_AUDIT.md`、`docs/HANDOFF.md`: 原本保持/版/再利用/現在の反映状況。

### 詳細根拠と設計上の追加注意

- `apps/web/src/processing/faces.mjs`、`face-feature-adapter.mjs`、`astra-face-core.mjs`: MediaPipe 468/478点、モデルSHA固定、5点を直接渡せない既存契約。`apps/web/src/person-privacy.mjs`の承認対象もモデル別に版追加する必要がある。
- `apps/web/src/processing/subject-segmentation.mjs`、`delta66-portrait-masks.mjs`: semantic領域の実推論入口はある。全員の集合maskと一人のinstance maskを区別し、選択人物への自動適用は後者の対応を要求する。
- `apps/web/src/processing/astra-generation-core.mjs`、`astra-generation-batch.mjs`: 候補hash/選択はあるが、永続保存・課金・クラッシュ再開はない。
- `packages/SuiteCore/Sources/SuiteCore/Providers.swift`: CanonicalGenerationとGenerativeProviderの契約。実gatewayの代用ではない。
- `packages/METISMobileCore/Sources/METISMobileCore/JobCheckpoint.swift`: idempotencyKey付き状態値を再利用し、永続schedulerは別に必要。
- `apps/backend/src/workspace-storage.ts`: byte容量予約。生成creditの金銭台帳として転用しない。

G03は送信前失敗/送信後結果不明/結果受領/保存失敗を別状態にし、同jobの外部再実行可否を明示する。取消後にもprovider費用が発生し得るため利用者creditの返還方針と分離する。価格確定前でもこの状態契約は設計できる。

B05の共通cacheはAstra単独所有とする。Solに任せるのはcache状態表示などの契約外側のみ。旧メイクの人物同意を新gallery同意と同じものとして扱わない。
