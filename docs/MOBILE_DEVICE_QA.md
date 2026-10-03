# iPhone / iPad 実機QA・引継ぎ実行表

最新Windows基盤は124 PASS、Native82 NOT_RUN。旧34/45の記載は初期snapshot。今回追加の実機確認は以下。すべてiPhone/iPad別に未実施であり、認証/Cloud/Workspace編集接続の実装残を先に埋める必要がある。

| 追加ID | 操作 | 合格条件 | 現在 |
| --- | --- | --- | --- |
| CROP-DEVICE | RAW→Proxy上Crop→12比率/37寸法・縦横→Undo/Redo→保存→kill/relaunch | Recipe保持、構図一致、元RAW checksum不変 | NOT RUN / Mac・両実機・実RAWなし |
| PRINT-DEVICE | 300dpi/mm→画素確認、足りる/不足するRAWでJPEG100/TIFF8/16/PNG | 実pixel/bit-depth/ICC/Alpha/DPIが一致、解像度不足は警告・拒否、無断Upscaleなし | NOT RUN |
| EXPORT-INTERRUPT | 単一/複数書出し中に回線断・Original不在・lock・終了・容量不足 | 原本非破壊、不完全Finalを公開しない、待機/失敗/再試行を明示 | NOT RUN。耐久background再開は未実装 |
| WS-DEVICE | 実認証でA→B→A切替/遅延/再読込/403→Project→写真 | 旧Workspace情報が残らない、Proxy表示でOriginal取得しない | NOT RUN。nil client入口は未接続表示のみ |
| WS-TEAM-DEVICE | 2人/3人で同一Asset/Selection/Preset変更、競合後再起動 | 両Recipe版保持、明示解決、削除Presetからも再現、Viewer/revoke拒否 | NOT RUN。共同編集UI・画像導線未接続 |
| WS-STORAGE-DEVICE | quota超過/downgrade/Trash復元中断/Original取得中revoke | server拒否、原本checksum保持、失敗時復旧、実Cloud Safe検証 | NOT RUN。実provider未接続 |

Required environment: Mac/Xcode/署名済build/観測した実iPhone・実iPadモデルとOS/checkout外実RAW/承認済HTTPS backendと実認証・Cloud adapter。Next procedure: NEXT_RUN.mdのbuild/test→この表→元IPH/IPD表。Gate更新は実測ログ・build/hash・操作・期待/実際を各端末別に保存した後だけ。Windows ENOSPC注入を実ストレージ不足成功へ代用しない。

更新: 2026-10-03 JST。これは既存仕様の実証手順・現状監査であり、147節、固定6文書、CONTRACTS、6領域保存同期契約の変更ではない。**Mobile Release BLOCK**。Web完成はMobile Release Gateに含めない。

## 1. 対象と現在の判定

初期製品は **iPhone / iPadのみ**。製品の実機Gateは `iphone-device` と `ipad-device` の2つ。MacはSwiftのビルド・Core試験・Apple画像処理QAの検証環境であり、第3の製品実機Gateではない。既存 `mac-build-tests` を削除せず、検証環境として独立して要求する。Macで成功してもiPhone/iPadの証拠には昇格しない。

| 対象 | 実行状態 | 理由・必要環境 | 合格にしない代替 |
| --- | --- | --- | --- |
| Windows既存回帰34件 | 今回再実行34 PASS / 0 FAIL / 0 SKIP。`evidence/submission-readiness-2026-10-03/regression.json`に実行結果を固定。旧基準は`verification-results.json`に保持 | Node、既存backend/local storage/SQLite/harness | 画像decode、iOS復旧、実機UIの証拠にはしない |
| `mac-build-tests` | NOT RUN / BLOCKED_EXTERNAL_ENVIRONMENT | Swift 6対応Mac/Xcode・SDK・XcodeGen未提供 | ソース存在、Windowsテスト成功 |
| `iphone-device` | NOT RUN / BLOCKED_EXTERNAL_ENVIRONMENT | 実iPhone・Mac/Xcode・署名・実RAW未提供 | iPad、Mac、Simulator成功 |
| `ipad-device` | NOT RUN / BLOCKED_EXTERNAL_ENVIRONMENT | 実iPad・Mac/Xcode・署名・実RAW未提供 | iPhone、Mac、Simulator成功 |
| `real-raw-load-100 / 500 / 1000` | 各NOT RUN / BLOCKED_EXTERNAL_ENVIRONMENT | checkout外の各実RAWセット未配置。実測adapterも未接続 | 任意bytes、JPEG、Manifest機構試験 |
| `full-lifecycle-sync-recovery` | NOT RUN、加えてNOT IMPLEMENTED / NOT CONNECTEDの開発残あり | 本番認証、cloud Proxy/復元、耐久sync、実アプリ再起動実証が不足 | Mac local adapterのmetadata再open・限定6stage |

2026-10-03の読取り確認では `Get-Command swift,xcodebuild,xcodegen -ErrorAction SilentlyContinue` に該当ツールなし、指定 `SUITE_TEST_DATA/RAW` の `Test-Path` はFalse。端末モデル・iOS/iPadOSバージョン・カメラモデルは未確定のまま。`project.yml` のiOS 17.0、QA `Package.swift` のmacOS 14は候補ソースのビルド設定であり、製品の最低OSや対応実機を検証した値ではない。

### 状態の使い分け

- **A / 限定検証済み**: 実行した特定のWindows基盤機構のみ。アプリ全体へ拡張しない。
- **B / コードあり未検証**: Swift/Core/UI/adapterに処理はあるが、ビルド・実行結果なし。「実装済み・動作保証」とまとめない。
- **C / 仕様済み未実装**: 必要な処理・UI・接続・耐久性がない。MacやRAWを用意するだけでは解決しない。
- **NOT RUN**: その試験を実行していない。必要環境、未実装/未接続理由を併記する。試験を実行して失敗したFAILとも、テストランナーのSKIPとも区別する。

本書は製品に新規要件を追加しない。Evoto差分のA–G全分類（G: 公式情報で存在未確認）は別のEVOTO_AUDITを参照する。

## 2. 現コードで完走できない箇所（環境不足とは別）

以下のパスはリポジトリroot基準。いずれも読取り監査であり、本書作成時に製品コードを変更していない。

| 部分 | 現在の処理・証拠 | 区分・残作業 |
| --- | --- | --- |
| 起動・端末別UI | `apps/apple/Suite/SuiteApp.swift`: `EditorModel()`を作成し、idiomでiPhone/iPad専用Viewを選択 | B。backendを注入していないため、初期状態でクラウド送信不可 |
| Import | `apps/apple/Suite/Services/PhotoPipeline.swift`: UUID別Originalへコピー、SHA、Proxy生成。`EditorModel.importFile`でその後checkpoint保存 | B。取込途中のorphan Original/Proxyを起動時reconcileする耐久journalはC |
| 通常編集 | `PhotoPipeline.preview`はProxyだけを読む。露出/コントラスト/彩度/回転のみ処理。未対応Recipeを拒否 | B。全RAW調整、AI人物/体型、プリセット等はC。通常編集が原本を直接更新する方式への変更禁止 |
| Proxy複数品質 | `packages/SuiteCore/Sources/SuiteCore/CloudTransferPolicy.swift`に選択ポリシー。現画像adapterは各assetに1枚の`Proxies/<id>.jpg`を生成 | B（判定候補）、C（全品質生成/配信・1:1導線）。filmstripは写真thumbnailでなくアイコン＋ファイル名 |
| Recipe保存・復元 | `ProjectStore.swift`のatomic JSON/CAS、`EditorModel`のsave連鎖/Undo/Redo/retry | B。未保存draftはメモリのみ。強制終了耐久outboxはC。破損checkpoint1件でlist全体が失敗し、正常写真を救済する隔離復旧はC |
| 認証・通信許可 | `SuiteBackendClient.swift`はHTTPSと呼出元tokenを要求し、RAW転送許可は既定false | B（境界候補）、C（ログインUI/Keychain/session/通信設定UI・ネットワーク判定の接続）。審査用/QA用アカウント未提供 |
| 手動同期 | `CloudTransferCoordinator.uploadSelected`: P0 Recipe→P2 Original。`EditorModel.syncSelected`へ接続可能 | B、初期アプリには未接続。P1 Proxy転送、P3、background URLSession、差分queue、iOS Multipart、別端末復元はC。同期中isBusyを通常background syncと呼ばない |
| 同期競合 | backend SQLite CASはWindows限定検証。nativeは409を表示、同じRecipeの失われた応答のみ照合 | A（backend限定）/B（native）。createAsset応答消失・link保存失敗時の冪等性、競合draft選択UIはC |
| Cloud Safe | backendが検証・commit後に安全状態を返し、原本破損検出で失効。Swiftはremote.cloudSafeを照合する候補 | A（開発backend限定）/B（native）。本番provider/ACL/backup、全品質Proxy・履歴復元はC。ローカルCloudLinksのboolだけで原本削除を認めない |
| Final | `PhotoPipeline.export`→`ExportPlan`→`RAWRenderRequest`、原本SHA検証→別一時ファイル→寸法検証→sync→別Final。未対応RAW/Recipe拒否 | B / 接続済み未検証。JPEG/TIFF実RAW品質・色profile・実機メモリ実証なし。未対応RAWをembedded PreviewでFinalにしない |
| Original不在 | `EditorModel.export`が「Original取得待ち」、接続済みの場合だけ`fetchForFinal`を試行 | B。cloud link/認証がない初期状態は取得できない。破損原本は整合性errorで止め、黙って上書き修復しない |
| Export中断・復旧 | cancel導線とstagingの限定処理はある | B。プロセス強制終了後のexport job再開/残骸reconcileはC |
| キャッシュ | `PhotoLifecycle.swift`のpin/Cloud Safeを使った純粋な削除可否 | B。物理LRU、削除直前の原子的pin再確認はC。自動原本削除を追加しない |
| Tether / Session Look / 人物補正 | `SessionLook.swift` / `SessionLookPlanning.swift`のintent/モード/人物別非破壊モデル | B（モデル）。カメラ接続、解析/ピクセル処理、UI、自動適用・耐久保存はC。モデル存在でTether QA25項目をPASSにしない |

従って、現時点で「両端末で同期まで含む全導線完走可能」とは言わない。本番backend・クラウド同期・既存商用V1等の未実装Gateはそのまま残す。新provider/API/契約の採用でこの不足を隠さない。

## 3. 実機実行前の準備とEvidence

1. 変更禁止事項を確認: NON-DESTRUCTIVE、RAW原本不変、通常Proxy、Recipe別保存、Final固定入力、Cloud Safe全条件。既存147節と固定6本文を再照合する。
2. 署名に使う正規Team・Bundle IDを担当者が用意する。現在の`com.example.suite`は暫定値。モデル/OSや秘密tokenを推測・埋込みしない。実RAW/写真権利とテストtenantを確認する。
3. 実RAWはcheckout外の `C:/Users/user/Documents/Codex/2026-10-03/SUITE_TEST_DATA/RAW/{100,500,1000}`。Macへの移送先もcheckout外で利用者が指定する。原本sourceをread-onlyにして、アプリ内コピー/QA複製と区別する。ダミーRAW、JPEG改名、水増し、大容量データのGit登録は禁止。
4. 各端末を別runIdで記録する。iPhoneの合格をiPad欄へコピーしない。証拠は毎回新規pathへ出し、以前の失敗・未実行を消さない。
5. 実行環境と測定項目を埋める。未計測はnull/NOT RUN、0や架空モデルで埋めない。

| Evidence必須フィールド | 現在 |
| --- | --- |
| runId / 対象Gate / 実行者 / JST・UTC開始終了 / source SHA・build | native実行は未実行。今回Windows結果は`evidence/submission-readiness-2026-10-03/regression.json`、旧基準は`verification-results.json` |
| Mac model・macOS・Xcode・Swift・SDK / dependency versions | 未提供・未実測 |
| device model / iOSまたはiPadOS / physical destination ID / 端末空き容量 | iPhone、iPadとも未提供・未実測。ID/token等の公開範囲に注意 |
| dataset manifest checksum / file count・total/平均/最大/最小bytes / camera maker・model / RAW format | 実RAW未配置。metadata不明をsupported扱いしない |
| asset ID / source・app Original SHA/bytes前後 / Recipe revisionと内容hash / ExportPlan | 未実行 |
| sync stage / Cloud Safeの全検証値・時刻・対象object/version/owner/permission | 未実行。安全boolだけでは不可 |
| 操作動画・状態遷移・device log / `.xcresult` / エラー・再試行・中断時刻 | 未実行 |
| Import / Proxy / peak RSS / disk・cache / DB growth / CPU / concurrency / failure・retry / Original fetch / Export準備 / recovery | 未実測。13計測項目・単位は`RAW_QA.md`と一致させる |

## 4. iPhone実機: 操作と合格条件

全行の実行状態は **NOT RUN / BLOCKED_EXTERNAL_ENVIRONMENT**。B/Cはコード成熟度であり合格結果ではない。環境が揃ってもCの部分は未実装/未接続で止まるので、その事実を記録して後続を偽装しない。

| 順 | 実際に行う操作 | 合格条件・残すEvidence | 現コード / 参照試験 |
| --- | --- | --- | --- |
| IPH-01 | 起動し下部「読み込む」から外部実RAWをFiles経由で選択 | asset登録、sourceとアプリOriginalのSHA一致、原本上書きなし。未対応RAWは明示拒否 | B: SuiteApp/EditorModel/PhotoPipeline。NAT-001はJPEG単体試験のみ、実RAWは未検証 |
| IPH-02 | 取込後preview表示・写真選択・比較を行う | 通常表示でOriginal downloadを発生させずProxyを利用。選択変更後に旧previewが混入しない | B: preview/previewGeneration。NAT-027、WIN-007。複数品質/一覧画像はCあり |
| IPH-03 | 認証・通信許可を用意して「選択写真を送信」から既存同期導線を実行 | Recipe/Metadata P0→Proxy P1→Original P2→任意P3の既存方針。各対象のchecksum/metadata/権限一致、未完了をSyncedにしない | B: foreground helper。C: 初期backend接続、P1等。現起動設定ではボタン無効、操作不能を完了にしない |
| IPH-04 | 下部「調整」で露出等を変更、Undo/Redo、比較。非中立Recipeを保存 | Proxy画面と保存Recipe revision対応、Original bytes不変、未対応操作を処理済みとしない | B: AdjustmentControls/EditorModel/ProjectStore。NAT-019〜026/035〜037、WIN-001/012 |
| IPH-05 | 保存完了を確認してアプリを終了→再起動。別runでは保存中にも中断 | 保存済みrevision/Undo/Redoが復元。未保存変更の有無を明示。空初期化や無断上書きなし。実プロセス終了の時刻を記録 | B: load/list。C: 未保存draft耐久/起動reconcile。NAT-022/025は実iOS killの代替でない |
| IPH-06 | 保存後の最新Recipeを再同期し、Cloud Safeの根拠を照合 | upload完了、checksum、object存在、size、metadata commit、owner/workspace、permissionが全て同対象で成功。破損/権限変化で古い証拠を流用しない | A: backend限定WIN-010/015。B: native接続候補。C: production/sync完全系 |
| IPH-07 | 「書き出す」からJPEG、別runでTIFF。開始時のRecipeを記録 | 原本＋固定Recipeから新しい別成果物。途中編集混入なし、検証済み全解像度、partial非公開、前後原本SHA一致 | B: ExportPlan/PhotoPipeline。NAT-001/032。色/実RAWは未検証 |
| IPH-08 | 実験用複製のローカルOriginalだけが不在の条件でFinal。通信断→復帰も実行 | 「Original取得待ち」。Proxy Finalを作らない。必要assetのみ取得しhash確認後Final | B: fetchForFinal。C: 別端末cloud復元。NAT-029、WIN-008/015 |
| IPH-09 | Share Sheetで検証済み出力を保存/共有し、縦横、片手、Dynamic Type/VoiceOverを確認 | 操作不能/画面外必須ボタンなし、下部操作を阻害しない、誤共有なし。画面動画/保存ファイルを残す | B: IPhoneEditorView/ExportShareSheet。UI自動テストは未作成、手動実証が必要 |

## 5. iPad実機: 操作と合格条件

全行の実行状態は **NOT RUN / BLOCKED_EXTERNAL_ENVIRONMENT**。iPhoneの結果とは別々に記録する。

| 順 | 実際に行う操作 | 合格条件・残すEvidence | 現コード / 参照試験 |
| --- | --- | --- | --- |
| IPD-01 | 専用画面「読み込む」から外部実RAWを選択。縦横でimportを実施 | sourceとアプリOriginalのSHA/bytes一致、独立asset、未対応RAW拒否 | B: IPadEditorView→共通pipeline。NAT-001はJPEG単体のみ |
| IPD-02 | 大きな写真領域と編集panelを同時表示し、filmstripで選択/比較 | 実window寸法に合う配置、写真のタッチ/Pencilを遮らず、通常Proxyのみ。回転しても選択/Recipe保持 | B: width/height別inspector、previewGeneration。NAT-027。実thumbnail一覧と複数品質はCあり |
| IPD-03 | 認証/通信許可後「選択写真を送信」。iPhone取り込み済みprojectも復元対象にする | 既存P0–P3方針、同一asset/Recipeを別端末で復元、全RAW一括同期なし | B: helper。C: 認証UI、P1同期、別端末復元。現起動設定の無効ボタンをPASSにしない |
| IPD-04 | 常時panelで露出等を調整。Undo/Redo/比較、利用可能なら実keyboard操作 | Recipe/履歴/版保持、Original不変、専用layoutで主要操作が可能 | B: IPadEditorView/AdjustmentControls/ProjectStore。NAT-019〜026/035〜037、WIN-001/012 |
| IPD-05 | 保存後に実アプリ終了・再起動。別runでは保存中に中断 | 最新durable revision/履歴を復元。未保存draft消失を合格にしない。同process store再openは不可 | B: load/list。C: draft耐久・reconcile。WIN-006はWindows SQLite別機構 |
| IPD-06 | 最新Recipe再同期後、Cloud Safeを対象別に確認 | 7検証条件全ての証拠、破損/権限変化の失効、片側端末の古い安全状態を流用しない | A: backend限定WIN-010/015。B/C: native/full sync |
| IPD-07 | JPEGとTIFFを別々にFinal。iPhone由来assetでも必要Originalだけ取得 | 固定Recipeと同じOriginalから別成果物。寸法/profile/画質/本人性の該当Gate、原本SHA不変 | B: ExportPlan/PhotoPipeline。C: 別端末復元・未対応高度処理。NAT-001/032 |
| IPD-08 | Original不在/通信断/取得失敗/Export中断→再開を実行 | 「Original取得待ち」、Proxy Finalなし、partialを完成品扱いしない。入力版を維持 | B: fetchForFinal/cancel/staging。C: durable export resume。NAT-029、WIN-008 |
| IPD-09 | 保存/共有、縦横、狭いwindow、利用可能なSplit View/Stage Manager/Pointer/Pencil/Keyboardを確認 | iPhone単純拡大でなくpreviewとtoolsが使える。画面外/覆い/重大タッチ阻害なし。OS非対応機能は理由付き適用外であり未実測PASSではない | B: IPadEditorView/Share Sheet。UI自動テストは未作成、手動証拠が必要 |

共有Coreがあっても、操作・lifecycle・memory/thermal・権限は端末別に実行する。両表は既存商用V1/AI/Batch/安全/運用要件を置換しない。

## 6. 失敗系: 既存T01–T30への実機適用

番号・受入条件の正本は `FAILURE_MATRIX.md` と回収資料 `references/STORAGE_SIDE_REVIEW.md` §12。別chat案は監査Evidenceに限定し、新provider/API/保存契約を導入しない。

下表はiPhone・iPadとも **NOT RUN**。Windows限定PASS範囲と必要な実機条件を混同しない。

| 既存ID | 実機で確認する操作 | 合格条件 / 安全な試験条件 | 既存限定Evidence |
| --- | --- | --- | --- |
| T01–T04 | Import/Upload中に回線を切る、ユーザー終了、OSによる終了を別runで行う | 原本/確定Recipeを保持、不完全Finalを公開しない、再起動で必要部分だけ復旧。ユーザー終了とOS終了を同じeventにしない | WIN-002/003/006。iOS journal/outboxはC |
| T05–T06 | 専用端末をロック、再起動後unlock前、unlock後を分けて記録 | protected dataが読めない状態を破損/空成功と扱わない。unlock後安全に再開。元データを消さない | Swift file protection設定のみ、native試験NOT RUN |
| T07–T10 | complete応答消失、commit失敗、同ID別payload、破損partを隔離試験領域で再現 | 旧partを上書きせず、破損partだけ新keyで再取得。正常partのkey/bytes/SHA不変、旧破損part bytes保持、組立Final checksum一致。Cloud Safeは検証後のみ | WIN-003/004/010/011。iOS Multipart/本番providerはC、T08注入は未実装 |
| T11–T13 | 2端末の同revision更新、別tenant、失効member、期限切れアクセス | CAS競合を表示して双方draft保持。無権限アクセス拒否。共有URL/revokeをJWT試験で代用しない | WIN-012/014/015。role/signed accessはC |
| T14–T15 | 実験用派生Proxyの消去、Export中pin競合 | ProxyとOriginalの責務分離、危険Original/未保存Recipe削除拒否。原本sourceを消さない | WIN-009。cloud Proxy再取得/原子的pin/LRUはC |
| T16 | 専用試験ストレージ/端末の空き不足でImport/保存/Upload/Export、その後回復 | エラーを明示、旧原本/確定Recipe保持、誤Cloud Safeなし、再開で重複/破損なし。利用者の写真を削除せず、承認済み試験領域と回復余地を確保 | WIN-005はENOSPC**注入**。実容量不足とは別Evidence |
| T17–T18 | 別端末から指定assetだけExport、Original offline/404/403/hash mismatch | Original取得待ち/権限errorを明示、全RAW転送なし、Proxy Finalなし、安全証拠失効 | WIN-008/015。別端末復元はC |
| T19–T21 | Export開始後のRecipe更新、中断、実memory pressure/熱/低電力 | 固定入力、温度/資源に応じた制御、取消/失敗はpartial非公開、復旧可能。意図的な危険加熱や電池枯渇をしない | NAT-032/005〜009はNOT RUN。耐久Export復旧はC |
| T22–T23 | Batchの1件失敗、寸法/形式/profile不一致 | 全件成功の偽装なし、失敗asset特定、原本不変、品質不一致のFinalを納品しない | WIN-027〜034はharnessのみ。製品Batch/完全profile検証はC |
| T24–T25 | 隔離tenantのTrash/Recovery、時間条件とExport競合を確認 | soft deleteで原本保持、30/90日等による無断原本削除なし。現在存在しないpurgeを作らない | WIN-012。端末Trash UI/競合leaseはC |
| T26–T27 | provider障害/backup除外の復旧証拠を確認 | 本番provider/backup未接続の現状はNOT IMPLEMENTED。ソース確認で復旧成功にしない | 実測なし。production/backup adapterはC |
| T28–T29 | 実未対応カメラRAW、必要Canonical不足/未対応Recipeを要求 | 対応外を明示拒否、embedded preview/ProxyでFinal代替しない。未対応項目を黙って無視しない | native拒否コードB。実RAW/生成adapter試験なし |
| T30 | cloud purge境界の監査 | 現時点は非公開/未実装。hold/backup/参照/権限を確認せず実行しない。未実装を試験PASSにしない | 実測なし。C |

Appleの保護クラスにはデータ利用可能条件の違いがある。現ソースではRecipe/CloudLinksがcomplete、Proxyがcomplete-until-first-authenticationであり、ロック/初回unlock/終了を別条件で確認する。Macのファイル動作をiOSの保護データ利用可能性の代用としない。[Apple FileProtectionType](https://developer.apple.com/documentation/foundation/fileprotectiontype)

「Proxy Parts不変」の監査では既存契約の解釈を広げない。ProxyはOriginalから独立した派生オブジェクトとして扱い、Proxy削除・再生成がOriginalへ影響しないことを確認する。Multipartは別の転送機構であり、正常partと旧破損partを保持し、破損partのみ新keyで取得して整合性を回復する。今回Windows回帰はWIN-004/009を再確認済みだが、実機Proxy生成・iOS Multipartの合格を意味しない。

## 7. 100 / 500 / 1000件: 個別結果を維持

各行は独立dataset。値を相互推計せず、件数からbytesを推測しない。同期・再起動復元・Cloud Safeを一括「その他成功」にまとめない。

| 件数 | Import/Proxy | 同期 | Recipe保存 | 実再起動復元 | Cloud Safe | Final | 現在の理由 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | 実RAW未配置、Mac/実機なし、full lifecycle未接続・未実装あり |
| 500 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | 実RAW未配置、Mac/実機なし、full lifecycle未接続・未実装あり |
| 1000 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | 実RAW未配置、Mac/実機なし、full lifecycle未接続・未実装あり |

必要時はこの表を各iPhone/iPad runIdに紐付ける。50GB/100GB/500GB/1TB相当Projectは別軸で`RAW_QA.md`のmatrixを保持する。現在いずれも未配置/未実測。Mac local adapterの計測が成功しても、同期・実再起動・Cloud Safe欠落を埋めない。

## 8. 次に実行する最短コマンド

### Windowsで維持する回帰（実機を待たずに可能）

repository rootで:

```powershell
npm run check
node scripts/final-regression.mjs
```

今回親担当の再実行は34 PASS / 0 FAIL / 0 SKIP、147節と固定6文書の照合PASS。実コマンド・stdout・終了値は`evidence/submission-readiness-2026-10-03/regression.json`に固定し、旧`verification-results.json`は上書きせず保持した。将来の再実行はその実測結果を確認するまでPASSにしない。`final-regression.mjs`のstdout JSONには実RAW未配置やnative NOT RUNも保持される。実行結果固定は親担当のみが行う。

### Macでビルド・Core・local adapter（まだ未実行）

前提: checkout、Node 24と依存関係、Swift 6対応Xcode/SDK、XcodeGen。Team/Bundle IDは利用者管理。shellの例中`/actual/...`とIDは実在する値へ置換する。自動公開・uploadは行わない。

```sh
npm ci --ignore-scripts
npm run check
swift --version
xcodebuild -version
swift test --package-path packages/METISMobileCore
swift test --package-path packages/SuiteCore
swift build --package-path apps/apple -c release
swift build --package-path apps/apple -c release --show-bin-path
node scripts/raw-harness.mjs manifest --root /actual/external/RAW --sets 100,500,1000
```

`swift test`のCore 44件、iOS application testの1件を分離して件数と終了値を保存する。現ソースのApple1件はJPEG機構単体試験であり、実RAW負荷試験に数えない。UI自動操作スイートは未作成。

実在するbuild出力の`SuiteRawQAAdapter`をcheckout外の`adapter.json`に指定する（形式は`RAW_QA.md`）。入力/work/reportを分離し、reportは新規名にする。

```sh
node scripts/raw-harness.mjs pipeline --root /actual/external/RAW --sets 100,500,1000 --adapter /actual/external/adapter.json --work-dir /actual/external/SUITE_QA_OUTPUT --timeout-ms 900000 --report /actual/external/REPORTS/new-unique-run.json
```

現Mac adapterが報告するのはlocal copy/hash/Proxy/固定JPEG/metadata再open等の限定経路。ProjectStore JSON成長はSQLite DB成長ではなく、Original validation時間はcloud fetch latencyではない。sync/recipeSave/restartRecovery/cloudSafeの必須4stageを報告しないため、現候補のままではfull lifecycleは `FAILED_OR_INCOMPLETE` となる。これを手編集でPASSへ変更しない。

### iPhone / iPadのビルド・インストール・試験（各NOT RUN）

Macで接続した各実機のtrust/Developer Mode/署名を実環境に合わせて設定し、Xcodeに認識された物理destination IDを使用する。Simulator IDを実機欄へ入れない。コマンドによるXcode test actionはschemeとdestinationを指定する。[Apple TN2339](https://developer.apple.com/library/archive/technotes/tn2339/_index.html)

```sh
cd apps/apple
xcodegen generate
xcodebuild -list -project SUITE.xcodeproj
xcodebuild -showdestinations -scheme SUITE -project SUITE.xcodeproj
xcodebuild test -scheme SUITE -project SUITE.xcodeproj -destination 'id=<実際のiPhone物理destination ID>' -resultBundlePath /actual/external/REPORTS/iphone-new-run.xcresult
xcodebuild test -scheme SUITE -project SUITE.xcodeproj -destination 'id=<実際のiPad物理destination ID>' -resultBundlePath /actual/external/REPORTS/ipad-new-run.xcresult
```

1. Core/アプリのbuild/test失敗があればログとsourceを固定し、既存契約内の不具合として扱う。エラーを隠して手動チェックへ飛ばさない。
2. Xcodeから署名済み開発buildを実端末へ起動する。本書の`IPH-01〜09` / `IPD-01〜09`をそれぞれ実行・撮影・記録する。
3. 現初期buildは未認証/未接続なので、送信・cross-deviceが完走できない点をNOT IMPLEMENTED / NOT CONNECTEDと記録する。token直書き/HTTP許可/ダミーbackend成功で回避しない。
4. ローカルで進められるImport/Proxy/編集/保存/実終了復元/Final/共有を実測し、その範囲だけ結果を付ける。全導線やCloud SafeのPASSにしない。
5. 完全同期に必要な既存開発残が正規に接続されたbuildで、同じ2端末表、各負荷set、T01–T30、追加Tether QA25項目を改めて実行する。未実装機能は省略しない。

## 9. Gateへ添付する根拠・変更禁止事項

今回Windows限定の再実行証拠は `evidence/submission-readiness-2026-10-03/regression.json`（34 PASS / 0 FAIL / 0 SKIP）。試験IDは`TEST_CATALOG.md` WIN-001〜034、旧基準は`verification-results.json`に保持し、説明は`VERIFICATION.md`へ統合する。147節対応は`TRACEABILITY.md`/`requirements.json`。Swift候補45件はNAT-001〜045、全て現時点NOT RUN。`apps/backend/src/gates.ts`とMETISMobileCoreの既存Gateは、同じbuildの有効な実測証拠がない間UNKNOWN/BLOCKのまま。

実機合格には各端末の全該当操作・失敗系・復旧・原本SHA・固定Recipe/Export・Cloud Safeが実測で対応し、主要導線操作不能がなく、残る既存商用/安全/提出Gateも合格であることが必要。未対応機能を「不要候補」にしてGateを減らさない。

禁止: 原本上書き、Proxy Final代替、全RAW自動同期、古いCloud Safeでの原本削除、旧Multipart part上書き、失敗Evidence削除、同process metadata再openを実再起動と呼ぶこと、ENOSPC注入を実端末容量不足と呼ぶこと、Windows/Mac/Simulatorを実機合格とすること、新provider/API/保存同期契約/Webへの範囲拡大。

本書の作成結果はQA手順と不足の明示であり、iPhone/iPad実機QA・RAW負荷・Mobile Releaseを合格にするものではない。
