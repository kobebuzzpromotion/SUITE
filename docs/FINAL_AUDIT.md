# 写真基盤の独立監査

監査日: 2026-10-03。監査担当の書込み対象は本書のみ。設計・コード・元資産は変更しない。

## 現時点の判定

**設計監査条件を定義し、配置済みコードと主要な統合修正を読取り再照合した。ネイティブ実行、実機試験、本番永続化は未検証。合格・モバイル完成・リリース可能という判定はしていない。**

入力は `SUITE_SPEC.md` v0.2、`MOBILE_OVERRIDE.md` 全16節、Mobile Release First、最新のProxy優先指示、`ADDITIONAL_SPEC.md` 全23節、`CLOUD_STORAGE_OVERRIDE.md` 全24節。後続指示は優先順位・保存処理経路・撮影ワークフローを具体化・追加するものであり、確定済みの機能・安全・QA要件を削除するものではない。

本書では Cloud Storage Architecture / Proxy Strategy / RAW lifecycle / Offline-Sync / Cache eviction / Export pipeline の6領域を最優先で監査する。Web完成はモバイルの合否条件へ含めない。

## 6領域の必須条件

|ID|領域|設計・実装で成立させる条件|
|---|---|---|
|A01|Cloud Storage Architecture|StorageProviderとドメインを分離し、Original / Proxy / Recipe / Generated Asset / Exported Imageを別ID・役割で管理する。原本は公開URLにせず、検証済み主体、tenant境界、短命署名URL、最小権限を保持する。|
|A02|Cloud Storage Architecture|CLOUD SAFEの6段階・4 gateと最新Cloud Overrideの7条件は後述の条件どおり。クライアントの成功申告、HTTP 200、単一HEAD成功、Proxy存在だけで原本を安全と判定しない。|
|A03|Proxy Strategy|通常の閲覧・選択・編集・プレビューはProxy / Thumbnailを使う。編集操作のたびにフルRAWを取得・処理しない。Proxy品質は端末性能・設定・目的に応じて選べる契約を保持する。|
|A04|Proxy Strategy|RecipeはProxyの画素へ破壊的に焼き込む状態と区別し、原本座標・向き・crop・色空間・必要な生成Assetとの対応を保持する。PreviewとFinalは同じ編集意図・確定生成Assetを参照する。|
|A05|RAW lifecycle|原本は不変。取込時の完全性確認と安全なローカル保持を先に行い、通常閲覧には原本を要求しない。必要な写真のFinal等だけオンデマンド取得する。|
|A06|RAW lifecycle|ライブラリ全体のRAWを各端末へ自動取得・常駐させない。クラウドへの原本バックアップと端末への全件RAW複製を区別する。後者の禁止を理由に必要な原本クラウド保存まで省略しない。|
|A07|Offline-Sync|ローカル取込・選択・編集・Presetは通信断でも継続。永続outbox / checkpointに操作ID・対象ID・期待版を保持し、再起動後に再送できる。権限エラーとネットワーク待ちを区別する。|
|A08|Offline-Sync|CASにより古い版の書込みを拒否し、履歴・現在版・再送照合情報を原子的に確定する。同一operation IDの同一内容は二重適用せず、同じIDの異なる内容は拒否する。競合した編集を無断上書き・消去しない。|
|A09|Cache eviction|ProxyのLRU削除はProxyキャッシュだけを対象とし、Original・Recipe・履歴・必要なGenerated Assetを削除しない。使用中・pin中のファイルを消さず、削除計画と実行時の状態変化を照合する。|
|A10|Cache eviction|原本のローカル解放はProxy evictionとは別ポリシーとする。Local Only、upload未完了、CLOUD SAFE証拠不足、復旧対象、実行中Finalは原本を保護する。安全確認前の自動原本削除を禁止する。|
|A11|Export pipeline|別端末でも、認可されたOriginal＋固定したRecipe版＋必要な確定生成AssetからFinalを作れる。書き出し中の編集変更は対象版をすり替えない。原本取得は必要な対象だけに限定する。|
|A12|Export pipeline|原本を取得できなければFinalは `waiting_for_original` 相当で待機・復旧可能とする。Proxyへ暗黙fallbackしてFinal成功・納品画質と表示しない。Proxy共有を許す機能があっても、明示した別目的・別状態として管理する。|
|A13|Export pipeline|単枚 / Batchの各項目に状態・入力版・結果・エラーを保持し、一部失敗を全件成功にしない。出力は一時ファイルから検証・確定し、未完成結果を完成品として公開しない。JPEG / TIFF、画質・寸法・PPI・色profile・名前・保存先の既存要件を保持する。|

「全RAW同期禁止」は最新指示に従い、通常利用のために全原本を各端末へ事前取得・常駐させない条件として扱う。原本の安全なクラウド保存と別端末Finalの成立を同時に満たす。対象範囲を曖昧な `synced: true` だけで表現しない。

## CLOUD SAFEの6段階・4 gate・追加7条件

v0.2第29節の順序を保持する。

1. Upload: 対象original ID / object version / upload IDを固定して送信する。
2. Checksum: アルゴリズムと対象バイト列を固定したchecksumを得る。
3. Server verification: サーバー側の実データ・期待ID・サイズ・checksumを検証する。
4. Object persistence verification: 保存された正しいobject / versionが存在し、必要な永続性条件を満たすことをprovider側で確認する。
5. DB commit: 原本metadata・保存参照・検証結果を確定する。
6. Upload complete: 上記の確定結果に対応する完了状態を公開する。

v0.2第78節の4 gateは Checksum Verified / Object Exists / Metadata Exists / Permission Verified。証拠は同じtenant・photo・original・object versionに結び付け、未知・失効・不一致は未合格とする。`Object Exists` は上の永続性確認、`Metadata Exists` はDB commitを省略する口実にしない。6段階と4 gateは相互の代替ではない。

最新 `CLOUD_STORAGE_OVERRIDE.md` 第9節では、Upload完了 / checksum一致 / object存在 / file size一致 / metadata確定 / owner・workspaceとの関連付け / access permissionの7条件をすべて要求する。既存の6段階・4 gateを置換・緩和せず、サイズ一致と主体・workspace対応を明示的な証拠へ加える。証拠欠落を旧版互換のために成功へ補完しない。

オブジェクトストレージとDBが単一トランザクションにならない場合、upload session・確定状態・回収手順を明示し、再実行可能な確定処理で整合を戻す。DB失敗時に唯一のローカル原本や再送用データを先に削除しない。ゲート合格はバックアップ / versioning / replication / recovery testの代替ではない。

## 優先故障ケースと期待する観測

|ID|故障・競合の注入点|期待する結果|
|---|---|---|
|F01|Upload中の電話、画面ロック、プロセス終了、回線断|原本が残り、永続sessionから再開。同じチャンクの再送は照合され、二重確定しない。|
|F02|チャンク順序逆転、欠落、同じ長さの破損|サイズだけで合格せずchecksum照合。CLOUD SAFEにならず、正しい再送が可能。|
|F03|Object保存成功→DB commit失敗|安全表示・原本自動削除なし。孤立objectを検出し、確定再試行または追跡可能な回収。|
|F04|DB commit成功→応答消失→同一要求再送|既存結果を照合して返す。履歴・費用・ジョブ・出力を二重作成しない。|
|F05|他tenantのID・署名URL・object keyを入力|APIとstorage境界で拒否。ゲートをクライアントbooleanで突破できない。|
|F06|端末A / Bが同じbase版へ同時編集|一方をCAS conflictとして可視化し、未保存側の内容を保持。Last-write-winsで無断上書きしない。|
|F07|履歴追加と現在版更新の間で失敗|両者を同時ロールバック、または同じ整合版へ回復。Undo / Redoが存在しない版を参照しない。|
|F08|Proxy LRU実行中にExport開始、pin変化、容量不足|実行時再確認し、使用中assetと原本を保護。evictionがOriginalへ波及しない。|
|F09|Local Only原本、upload未完了原本にキャッシュ掃除|原本は解放対象外。空き容量不足を通知・処理調整し、データを犠牲にしない。|
|F10|別端末にProxyとRecipeだけ存在しFinal要求|その写真のOriginalだけをオンデマンド取得。取得完了・検証後に固定RecipeでFinal。|
|F11|Original取得中にoffline / 404 / 権限失効 / checksum不一致|Finalは待機・エラー・認証回復など復旧可能な非成功状態。ProxyをFinalにしない。権限回復が必要な状態を無限ネットワークリトライしない。|
|F12|Final実行中にRecipe更新、別写真へ移動、遅延AI応答|original ID / recipe version / job generationを照合。別写真・新しい編集を古い結果で上書きしない。|
|F13|確定背景Assetが取得不能、model version変更|Final時にゼロから別背景を生成して代替しない。同じAssetの取得待ち・必要な回復へ移す。|
|F14|Batch中の1枚失敗、export書込み中断、保存先権限拒否|項目ごとの失敗・checkpoint・再開を保持。一時ファイルを完成扱いせず、既存出力を不用意に破壊しない。|
|F15|Memory pressure / thermal上昇 / low battery|並列数・品質tier・background作業を制御。UIと永続編集状態を維持し、中断・再開が可能。|
|F16|クラウド原本が後から削除・失効、古い安全証拠だけが残る|新規取得・解放判断時に対象と権限を再照合。古いbadgeだけでローカルの唯一の原本を消さない。|
|F17|同じoperation IDで異なるRecipe / checksum / input版を送信|再送成功と扱わず拒否・監査可能にする。|
|F18|Trash / Recoveryと同期・Finalが競合|論理削除と物理回収を分離し、参照中assetを即時物理削除しない。復元と保持期間の既存要件を保持。|

## Execution Optimizerの発見状況

`MOBILE_OVERRIDE.md` 第14節の比較要求を確認した。`C:/Users/user/Documents/Codex` を対象に、名前にExecution / Optimizer等を含むファイルを探索し、既存の `.md` / `.txt` / `.ts` / `.js` / `.py` から `METIS Execution Optimizer` / `EXECUTION OPTIMIZER` / `FULL SERIAL` / `FULL PARALLEL` / `STAGED PARALLEL` を検索した（依存・ビルド出力を除外）。

**今回の調査範囲では、METIS Execution Optimizerの呼出し可能な実装は未発見。** `METIS_CODEX_MASTER_ENGINE_v1.1.txt` に設計・観測・追跡の原則はあるが、その存在をOptimizer実行済みという根拠にしない。別の非公開・未索引・圧縮資産に実装が存在しないとは断定しない。

FULL SERIAL / FULL PARALLEL / STAGED PARALLEL / PIPELINEの具体比較と採用理由は親担当の設計記録へ置く。独立監査ではshared files、photo pipeline、data model、AI execution、native capability、DB migration、external APIs、testsの所有権・依存順が宣言され、単純な並列数最大化になっていないことを確認する。

## 最終読取り監査で残す証拠

- 各A条件・Fケースに対する実装箇所、テスト名、実行結果、未実装境界。
- 純粋な状態判定だけの合格と、DB・ストレージ・iOSライフサイクルを含む実証の区別。
- テストダブルが要求する原子性・CAS・署名検証を、本番アダプターも保証する証拠。
- iPhone / iPad、RAW / JPEG、AI、Batch、Before / After、権限、Offline、復旧、アクセシビリティ、性能、Rendered Realityの未検証事項。Override第15節の21 gateを縮小しない。
- 既存仕様の全継承を維持し、Web未完成だけをモバイルの不合格理由にしないこと。

これらの証拠が揃うまでは、本書の監査条件作成を製品リリース合格へ読み替えない。

## 配置済みコードの先行監査

対象: `apps/backend/src/*.ts`、`apps/backend/tests/suite.test.ts`、`apps/apple/Suite/EditorModel.swift`、`Services/PhotoPipeline.swift`、iPhone / iPad View、`packages/SuiteCore/Sources/SuiteCore` の保存・履歴・写真ライフサイクル、METISのjob / gate境界、`PHOTO_ARCHITECTURE.md`。作業中のスナップショットを読んだ監査であり、統合担当の修正後に再確認する。

### 確認できた境界

|対象|読取りで確認した内容|検証の限界|
|---|---|---|
|原本不変|backendの `putImmutable` は別stagingへhash計算して書き、既存キーへ異なる内容を上書きしない。native取込はUUID別パスへcopyし、Export前に原本checksumを再計算。|本番object provider、耐障害性、実画像・大容量RAWは未確認。|
|認証|`auth.ts` はJWT署名・issuer・audience・期限・必須claimを検証。設定不足は失敗側へ閉じる。repoはtenant条件で検索し、requestのtenantヘッダーから主体を構築しない。|本番IdP設定、チーム内role、失効・鍵更新・権限範囲、短期署名URLは未接続。|
|保存・CAS|SQLite recipeは `BEGIN IMMEDIATE` 内で期待版を照合し履歴とauditを同時確定。SwiftのProjectStoreはprocess内ロック＋期待版＋atomicメタデータ保存、破損を空成功へ置換しない。|request ID再送照合、耐久outbox、複数process/app extension、クラウド復旧は未接続。|
|Proxy-first|`PhotoPipeline.preview` はProxyパスだけを読む。Original GETはlibrary目的を拒否し、Final等の明示目的が必要。|ProxyクラウドAPI・実キャッシュLRU・別端末hydrationは未接続。|
|Final待機|native exportはOriginal欠落で `waitingForOriginal`、checksum不一致で中断。注入された開発用clientがある場合のみ対象Originalを取得し、checksum確認後に固定Recipeで再試行。|本番取得・background再開・別端末復旧は未検証。開発用の通信許可はdefault false。|
|固有UI|iPhoneは下部主要操作、iPadは横のInspector / 縦の下部Inspectorと大きなcanvasを別Viewで構成。処理・保存は共通Modelへ置く。|実機の見た目、タッチ、縦横、Pencil、Dynamic Type、性能は未検証。|
|未検証の明示|health応答は `productionReady: false`。native初期状態と対応状況表示にcloud未接続・商用機能未完成・実機未検証を記載。release gateにWeb完成を含めず、未知のmobile証拠はBLOCK。|これらの表示は既存仕様の免除でも実機合格の代替でもない。|

### 指摘と再確認待ち

|ID|先行監査で見つけた点|修正 / 完了確認条件|状態|
|---|---|---|---|
|R01|Original GETの再検証失敗後も `assets.cloud_safe=1` が残り、一覧で安全状態を返し続ける。`server.ts` / `repository.ts`。|検証失敗後の証拠失効・安全状態解除と、一覧・再取得の回帰テスト。再Upload検証成功だけが安全状態を戻せること。|再読取りで `invalidateVerification` のtransactionとGET検証catchからの呼出し、破損後falseのテストを確認。最終テスト実行結果待ち。|
|R02|`EditorModel` の保存失敗後に `saveFailed` が全操作を恒久ブロックし、保存再試行の入口がない。|最後の永続版と未保存履歴を保持し、明示的再試行でCAS成功後のみ復帰。未保存データを捨てて画面だけ解除しない。|再読取りで `unsavedCheckpoints` / `retrySave` と両端末共通canvasの再試行ボタンを確認。実機での失敗注入は未実施。|
|R03|`PhotoPipeline.export` が検証前に完成ファイル名へ直接書き出し、途中失敗のファイルが同じ場所に残り得る。|Export専用stagingへ生成し、形式・寸法等の確認後に完成先へ確定。失敗成果物を完成品として列挙・共有しない。|再読取りで固定 `ExportPlan` / RAWProvider、`.partial`への書込、寸法確認、sync、取消確認、moveの順序を確認。Apple実行は未検証。|
|R04|`ProjectStore.list` は1件破損で全一覧をthrowし、`EditorModel.load` は失敗してもloaded状態を戻さず再試行できない。|再読込・復旧導線。破損を報告し原本・メタデータを保持すること。正常asset救済の方針を別途検証。|再読取りでloaded解除・retryLoadボタンを確認。破損1件から正常assetを救済する機能は未実装のRecovery課題。|
|R05|Recipeのbackend validatorとSwiftで受理形式が不一致。非ゼロ値の処理stage欠落、extendedParametersのtagged / plain JSON・nullが異なる。|事前変更通知に沿って同じwire形式・validationを定義し、共有golden fixtureを両言語で往復。値を削って整合させない。|plain JSON / null禁止、有限値・安全整数・処理stage・未知field検証と共通fixtureのテストを再読取り確認。backend成功は親報告、Swift側はテスト配置のみで実行未確認。|
|R06|CIRAWFilter失敗後のRAW拒否が拡張子だけに依存し、拡張子なし・変更済みRAWで埋込みpreview fallbackを防ぎ切れない。|ImageIOの内容型判定も使い、非RAW fallbackを許可raster型に限定。Embedded Preview初期表示とFinal源を区別する。|ImageIOの内容UTIでJPEG / PNG / HEICだけをraster fallbackへ許可し、それ以外を拒否する分岐を再読取り確認。未対応RAWの実データ試験は未実施。|

Recipe JSON共通化、未対応RAW時のfallback禁止、METIS ProxyPolicy接続は読取りで再照合した。この監査時点の親担当報告は `npm run check` 31件PASS（backend 14件＋RAW harness mechanics 17件）と147節のtrace check。追加テスト後の最終件数・実行結果は `VERIFICATION.md` と対応する `verification-results.json` を正本とし、過去の件数を最終結果として固定しない。本監査担当自身の再実行結果ではない。backendのテスト本文は読み取ったが、F01〜F18全ケース・実RAW描画・native動作の合格を意味しない。強制終了テストは実際のSQLite子process終了、容量不足テストはproviderへのENOSPC注入であり、いずれもiOS実機故障試験とは区別する。Swift/Core XCTest 42件・Apple画像経路1件は配置済みとの親報告であり、未実行。

## 追加23節と従来契約の監査

最新添付 `699f552b-71ab-41ec-a101-2281bb0cab86/貼り付けたテキスト.txt` を547行全文読取り済み。`ADDITIONAL_SPEC.md` と改行・末尾空白を正規化した本文一致を確認した。ファイルの存在を実装完了とは扱わない。

|追加節|保持する内容・旧要件との接続|現時点の監査条件|
|---|---|---|
|1 / 14|Tether Session Lookは基準写真で決めたMode / Personal Color / 人物補正 / Global Colorの編集意図を保存。|Lookとその版・写真別Adjustmentを固定Export入力に関連付ける。データ型の存在をTether / AI成功としない。|
|2〜6|Wedding / Night Work / Fashion / Beauty / Custom。単なる色presetではなくColor＋Face＋Skin＋Body＋Texture＋Output。各モードの個別品質要件も保持。|単一の色調整スライダーで全モードを実装済みとはしない。白ドレス階調、衣装・背景保護、肌テクスチャなどの個別QAを落とさない。|
|7|主要Face / Skin / Bodyは可能な限り端末内、クラウド送信必須にしない。|Override第7節の資源・品質・privacy・cost判断を継承し、人物処理について追加の端末内優先を適用。生成系を含む全AIへ無条件local固定する読み替えはしない。|
|8〜9|Face / Skin / Bodyの各指定項目を独立制御、OFF / LOW / MEDIUM / HIGH / CUSTOMおよび強度を非破壊保存。|項目一覧・利用者設定を保持。未対応engineは黙って無視せず停止・未対応表示。|
|10〜11 / 15〜16|写真ごとに顔・人物・皮膚・pose等を再解析し意図を再マッピング。直線背景保護、人物ごとのMask / Adjustment / Recipe。|固定座標のコピー、Lookの独断変更、1人の設定の全員適用を禁止。AIモデル・検出・追従・背景保護の実証は別gate。|
|12〜13|Personal Colorは任意のColor Direction。Spring / Summer / Autumn / Winterは強制分類しない。|色の補助設定が顔形状・体型・美肌量を変更しないことを検証。既存のPersonal Color / Skin Tone仕様も削除しない。|
|17〜18|原本保存後、Embedded Preview→Thumbnail / Preview→Edit Proxyのprogressive display。|Upload / RAW完了でUI全体を止めない。初期表示用Embedded PreviewをOriginalの代替やFinal合格に昇格させない。現行単一import完了待ちはこの撮影pipeline未実装として扱う。|
|19〜20|Look変更は以後の写真に適用。過去写真は明示再適用。Auto / Color / Face / Skin / Body / Personal Colorの各ON-OFFと写真・人物除外を保持。|既存写真へ暗黙再適用しない。遅延jobに適用するLook版・対象・除外設定を固定し、世代違いの結果を混入させない。|
|21|RAW / Proxy / Mode / Personal Color / Session Look / Mask / 写真別Adjustment / Recipe / Revisionを非破壊保存。FinalはOriginal＋固定Look＋写真別Adjustment。|6領域の原本不変、別object、CAS、Preview意図一致、Original待機を維持。未対応Lookを落として基本編集だけでFinalを成功にしない。|
|22|25項目のTether QA。両端末、連続撮影、Preview、追従、背景、複数人物、Look変更、offline、resume、RAW Final、整合・非破壊を含む。|単体テストや外部RAW harnessの存在をTether実機25項目合格へ置き換えない。現時点では未実施。|
|23|メインが11の共通設計領域を正本管理し、各担当は独自変更しない。|`CHANGE_NOTICE.md` を確認。監査は指摘と結果記録のみ行い、他担当の契約・実装を変更しない。|

別チャットの `SUITE_CLOUD_STORAGE_6_DOMAIN_DESIGN_NOTE.md` は参考資料として読取った。新API / schema / provider / retention / 料金案は未採用であり、本書から正本へ自動昇格しない。Cloud上の正本という提案表現で、v0.2第53節のLocal Onlyやupload前の唯一の原本保護を削除しない。

ユーザー実RAW、Mac / Xcode、iPhone / iPad実機は現環境で未提供。外部RAWデータとharnessは別担当の準備成果であり、未配置・decoder未接続・Apple環境未接続は未検証として保持する。

## クラウド強制24節の追加監査

`CLOUD_STORAGE_OVERRIDE.md` は全24節を読取り済み。クラウドを正本とする完成形への指示と、Cloud Safe前の唯一のローカル原本を保護する途中状態を両立させる。原本を全端末へ常駐させる実装や、未同期原本を先に消す実装へ読み替えない。

|追加節|保持する要件|読取り確認・残る検証|
|---|---|---|
|1〜3 / 6 / 24|Original不変、Proxy先行編集、Recipe非破壊・版管理、Finalだけ原本。|上記原本・Recipe・Final境界を確認。完全なRAW調整、Mask / Generated Assetを含む描画は未完成。|
|4〜5|Thumbnail / Preview / High Previewの選択、通常一覧で高解像度を一括取得しない。1:1等は明示した要求で必要部分を取得。|`ProxyQualityPolicy` は画面・zoom・端末上限・networkから派生品質を選ぶ。UI・複数proxy生成 / 転送・高解像度領域取得は未接続。|
|7 / 9 / 11〜13|クラウドからOriginal / Proxy / Recipeを復旧でき、別端末で対象Originalだけ取得し同じ編集からFinal。7つの安全条件が必要。|Swift `CloudSafetyEvidence` とTS policyはサイズ・owner/workspaceを含む。native開発取得はchecksum確認するが、別端末一覧 / project hydration / 本番安全証拠は未完成。Mac / Windows / Webの後続化で共通契約は削除しない。|
|8 / 16〜17|Proxy先行、Originalはbackground。P0 Recipe / metadata、P1 Proxy、P2 Original、P3任意成果物。明示FinalはそのRAWを昇格。Wi-Fiのみ / cellular許可 / pauseを選べる。|`SyncPriorityPolicy` と `NetworkTransferPolicy` を確認。未知回線は停止、優先順位は通信許可を上書きしない。実scheduler、NWPath接続、設定UI、iOS background transferは未接続。開発clientのRAW許可はdefault false。|
|10 / 14〜15|keepLocal / autoOptimize / cloudOnly、未同期RAW / Recipe保護、削除時再検証、offline継続。|純粋なeviction判定はpin / 使用中 / 未保存 / Local Onlyを保護する。実LRU・原本解放・復元・永続outbox・設定UIは未完成で、自動物理削除は実装していない。|
|18〜20|Provider共通のput / get / head / delete / signed / multipart / resume / checksum / metadataと選定根拠。容量・読み出し量を分離した費用モデル。|ローカルproviderと内部分割uploadのみ。特定クラウド採用、署名URL、物理削除、実課金・価格・耐久性は未検証。参考資料の案や価格をそのまま採用していない。|
|21〜23|同期を意識させない操作、クラウドを中核とする完成品、実RAW 100 / 500 / 1000枚と50GB / 100GB / 500GB / 1TB相当の検証。|開発接続と未完成表示を確認。合成バイトのstorageテストとharness mechanicsの成功は、この量・画質・体験・復旧の合格ではない。|

### 通信・再開の未完成境界

- `SuiteBackendClient` はHTTPS・bearer認証provider注入の境界を持つが、Appは既定で未注入。Auth UI / Keychain session / 本番IdPは未接続。tenantを任意ヘッダーから認証済みと扱わない。
- `CloudTransferCoordinator` は手動・foregroundの開発接続で、Recipe送信後に選択Originalを送信する。Proxy転送は未実装とUIに表示する。`EditorModel.syncSelected` は転送全体で `isBusy` を保持するため、完成形のbackground同期へこのまま転用すると編集を止める。通常編集と転送状態を分離する必要がある。
- createAsset成功後の応答消失 / CloudLinks保存失敗を同一operation IDで照合する仕組みはない。再試行時に重複remote assetを作り得るため、完成形の再送保証は未成立。Recipe側には内容一致による応答消失の再照合があるが、asset作成の代替にはならない。
- `MultipartUploads` はtenant＋operationの同一本文照合、part checksum、永続session再読込、全part検証後のimmutable finalizeを備える。partをDB確定前に削除しない。ただしHTTP route / iOS client / background uploadへの接続はなく、単一PUTの全量再送を分割再開と表示してはならない。
- 先行監査で、破損partの同キー再送がimmutable保護に阻まれる点を指摘した。最新コードは別のimmutable repair keyへ書き、transactionで参照を切替えて旧partを保持する。破損→missing→同session再送修復→finalizeと旧part保持のテストを読取り確認し、親からPASS報告を受けた。本番provider・iOS転送のF02全体まで合格したとはしない。
- 追加された限定回帰テストは、全part保存後に1番partだけを破損させ、`missing == [1]`、`refetched == [1]`、repair objectが1個だけ増えること、旧破損bytesと正常partの不変、final Originalの全bytes一致を明示assertする。テストの存在と最終実行結果は分離し、後者はVERIFICATIONを参照する。
- ローカルのRemoteAssetにはCloud Safeのbooleanを保存するが、期限・object version付き本番証拠の代替ではない。GET再検証失敗はサーバー側で安全状態を解除し、原本自動削除もないため、そのbooleanだけで唯一の原本を削除する経路は確認していない。

### 最終判定の範囲

読み取り範囲では、R01〜R06への修正と、未対応処理を成功にしない境界・未完成の表示を確認した。新規の重大なコンパイル欠陥を発見していないことは、Swiftコンパイル成功を意味しない。Session Lookのapplication planは明示的に `isRendered == false` であり、解析adapterがない状態を画像処理成功にしない。

追加された `apps/apple/QA/RawQAAdapter.swift` と `apps/apple/Package.swift` を読取り確認した。これはMac製品の追加ではなく既存PhotoPipelineを使うmacOS用QA接続で、実行未検証。直列1 job、JPEG出力、明示2048 Proxy、local Originalの検証、ProjectStore JSON再読込に限る。計測の証拠欄もcloud fetch / backend SQLite / crash recoveryを検証していないと区別している。これをiPhone / iPad実機、TIFF、background同期、別端末クラウド復元の成功に拡張しない。nativeにはExport中断ボタンとtask取消確認も追加されたが、Apple実行による中断・再開の確認は未実施。

最後のQA限定変更として、`raw-harness.mjs` は従来6stageを保持したまま `sync` / `recipeSave` / `restartRecovery` / `cloudSafe` を必須化し、未通過のstage名を失敗理由へ記録する。`RAW_QA.md` はlocal compute / full lifecycle / physical deviceを区別し、同一process内metadata再openを真の再起動復元へ昇格させない。現在のMac local adapterは追加4stageを報告しないため、ローカル処理の `batchComplete:PASS` と13計測だけが揃ってもfull lifecycleは `FAILED_OR_INCOMPLETE`。この読取り確認は、同期・再起動・Cloud Safeの新機能実装を意味しない。

本書はソース監査と未完了条件の記録であり、147件の全要件実装完了、16 Core実行完成、Cloud Ready、iPhone / iPad QA合格、App Store公開可能の証拠ではない。Web UI完成だけを後回しにし、元仕様・追加仕様・安全性・運用品質の未完了項目は引き続きリリース阻害条件として保持する。

## 引継ぎ時の状態区分

|区分|この監査で該当するもの|報告上の制限|
|---|---|---|
|実装・基盤試験済み|TypeScriptの認証・CAS・原本不変・ローカルmultipart・失敗注入、およびharness通信と証拠検証の機構。最終証拠はVERIFICATION。|合成storage bytesやprotocol fixtureを実RAW・本番クラウド・実機合格と呼ばない。|
|コードあり・動作未検証|Swift共通Core、iPhone / iPad UI、PhotoPipeline、Mac local QA adapter、画像経路テスト。|配置・読取り確認と、コンパイル / 実行成功を区別する。Mac local adapterのmetadata再openはprocess再起動・クラッシュ復旧ではない。|
|未実装・未接続|本番provider、Auth UI、Proxyクラウド転送、cross-device hydration、background scheduler、同期設定UI、完全なML / Tether / 全RAW調整等。|環境が届くだけでは完成しない開発残として扱う。Cloud Safe・同期・再起動復元を要求するfull lifecycle QAには未接続のgateを残す。|
|外部環境block|実RAW100 / 500 / 1000、Mac / Xcode、iPhone / iPad、実際の接続先・権限等が未提供で実行できない試験。|未実装機能まで環境不足のせいにしない。数値を0や推測で埋めず未実測を保持する。|

本監査担当は `CONTRACTS.md` / `PHOTO_ARCHITECTURE.md` / `SUITE_SPEC.md` および他担当コードを変更していない。監査・テストの厳密化を共通契約の独自変更にしない。追加された `contracts/frozen.sha256.json` の6ファイルを読み、SHA-256を独立に再計算して全件一致を確認した。このlockは最終統合時点の本文を固定するもので、過去の全変更履歴や実行の正しさまで証明するものではない。

`TRACEABILITY.md` と `requirements.json` の要件→実装→テスト→Evidence列を読取り確認し、147件全件にimplementation / tests / testEvidenceが存在することを確認した。参照列があることはテスト合格ではない。最終catalog・実コマンド結果とscopeを突き合わせ、文書だけのPASS、部分的な基盤PASS、未実装、未実行を混在させない。
