# Web招待試用・期限管理 最終統合 — 2026-10-03

## 結論と現在使える範囲

ローカルの招待ログイン、本人のRAW/Recipe保存経路、作者下書き→提出→管理者採用→固定共通Preset、招待別の終了日時/取消を接続した。期限・取消はサーバーで操作ごとに再照合し、ログイン済みでも編集・保存・書出し・提出を拒否する。終了時に原本・Recipe・提出・過去版を削除しない。

**外部招待試用の成立はBLOCK。実RAW件数0。Sites専用新規作成は実429利用上限、ChatGPT実ログイン/D1/R2/公開URLは未接続。人工画像・モックを試用準備完了の根拠にしない。** 顔解析SDKはPrivacy確認待ちで停止し、RAW/global/保存/書出し/作者処理は独立して進めた。

確認URL（このPCのみ、外部招待URLではない）:

- `http://127.0.0.1:8791/` 招待試用ログイン。実行中ローカル試験招待は取消済みなので、このブラウザでは終了案内が出る。
- `http://127.0.0.1:8791/?view=author` 招待作者/管理者。管理者CLIで新しい明示期限付き招待を発行して確認する。
- `http://127.0.0.1:8790/` 既存QA Editor、`?view=author` はPREVIEW ONLYで保存/提出は未接続と表示。8791と混同しない。

## 最新実測（独立した件数）

| Suite | TOTAL | PASS | FAIL | SKIP | Scope / Evidence |
|---|---:|---:|---:|---:|---|
| Windows旧基盤 | 154 | 154 | 0 | 0 | `evidence/web-2026-10-03/windows-02/` |
| Web/招待/作者/Sites adapter | 152 | 152 | 0 | 0 | `evidence/web-2026-10-03/trial-final-01/`、独立Astra `../apps/web/tests/results/trial-independent-08.json` |
| 外部作者contract/adapter | 18 | 18 | 0 | 0 | 同finalフォルダ `external-author-tests.json`、原本taskは未変更 |
| 実ブラウザWorker診断 | 21 | 21 | 0 | 0 | `evidence/web-2026-10-03/browser-worker-02.json`、人工RGBA/NONRAWのみ |
| 文書整合 | 10 | 10 | 0 | 0 | Windows02 document-integrity、機能合格ではない |

Windows154は旧124＋人物13＋安全3＋共通Gate14のIDを維持。新152はWEB旧69＋AUTH17＋AUTHOR26＋multipart client12＋Sites Worker28。これを旧Windows154へ置換しない。Astraは実SQLite/HTTP、D1 interface SQLite、R2/dispatch/digestテストダブルの限定範囲。ブラウザ21のPNG/JPEG実生成は人工画素であり、実カメラRAW/視覚一致の実証ではない。

Windows Build ID `uncommitted-source-sha256:2d4701704ae35e2c5811e111d55f60d8fd00985107f62129cd6567aad199c7dd`。
Web統合 Build ID `uncommitted-source-sha256:44c57d08571eb2120942b1a8ac7c0d71291fac2349946f65de6c372510820992`、144 source hashes実行前後一致。Commit SHA = NOT_AVAILABLE、Reason = repository has no commit。両manifestの範囲が異なるのでBuild IDも異なる。凍結Windows03を上書きしていない。

## 処理と保存の再利用

既存Asset/Recipe v1/CAS/portrait binding/continuity/Original intent/Crop/Export検証を再利用。ブラウザSession/Workerは同じvalidatorをbundleし、Finalは保存済み固定revision/Recipe＋取得Original checksumから一度だけ描画する。編集途中の最新Recipeへのすり替えを拒否する。Proxyは未編集baseから再描画し、ブラウザ耐久cacheはProxy/Recipe/historyのみ。RAWはDBへ入れない。未知形式・編集・人物対応を黙って修復/代用しない。

本人ごとのtrial tenantとブラウザdraft namespaceで隔離、他作者のAsset/下書き404、authorによる審査403、作者名は本人情報から確定、自己採用は禁止。ブラウザ同一OS利用者に対する暗号学的隔離や、既にダウンロードされたファイルの遠隔失効を保証するものではない。

外部 `task/preset-author-lab-isolated` のcontract/adapterを再利用。可搬Presetはexposure/contrast/saturationのみ。rotation/Crop/person/mask等が含まれるRecipeを拒否し、写真固有IDや顔座標を別写真へ移植しない。SUBMITTEDは公開ではなく、ACCEPTED処理で外部contractのAPPROVED→PUBLISHEDを実行し、採用版を固定。改良は新revision、既存採用版/元RAWは保持する。

## 調整項目の接続一覧

| 項目 | UI | Worker/Proxy/Final接続 | Recipe/Undo/Redo/再読込 | 実画像 |
|---|---|---|---|---|
| Exposure -4〜4 EV | あり | 接続、人工数値/実Worker検証 | データ/人工描画検証 | NOT_RUN |
| Contrast 0〜2 | あり | 同上 | 同上 | NOT_RUN |
| Saturation 0〜2 | あり | 同上 | 同上 | NOT_RUN |
| 90°回転・中心Crop Original/1:1/4:5/3:2 | あり | 接続、人工画素試験 | 保存/履歴接続 | NOT_RUN |
| Face Brightness | 停止明示 | SDK Privacy BLOCK、使用不可 | 共通人物安全Gateは維持 | NOT_RUN |
| WB/カーブ/HSL/肌/目/Contacts/髪/Makeup/Body等 | 今回のUIへダミー追加なし | NOT_IMPLEMENTED / 既存Registryの個別状態保持 | 仕様保持 | NOT_RUN |

8-bit sRGB/camera WB要求/autoBrightなし、LibRaw-WASM 1.1.1、Engine `web-libraw-mediapipe-face-exposure-1`、24MP/128MiB上限。JPEG/PNGはbrowser encode、metadata除去。TIFF/16bit/Adobe RGB/印刷実寸300dpiはWeb未対応で拒否。向き/座標/処理順/decoder実version/WASM SHAはprovenanceに残す。Safari/iPadブラウザ互換・実メモリ・視覚ハローは未実測。

## 招待終了日時・取消（今回の正式追加）

招待コードを利用開始できる期限と試用編集終了日時は別。固定試用日数なし、管理者がISO日時を設定する。Nodeは招待UUID単位、Sitesはallowlist membership単位で期限/取消を検証する。Node同一authorへの別招待を個別に短縮/取消しても他招待を変更しない。旧期限未設定データは無期限扱いせずTRIAL_END_NOT_CONFIGUREDで拒否する。

`/trial/authorize` を編集開始/保存/Export開始/Export描画完了後に呼ぶ。各保存/原本取得/作者API自体もlive actor検証する。ブラウザ表示だけの制限ではない。サーバーのTRIAL_EXPIRED/TRIAL_REVOKEDを受けて操作面を停止し、表示写真/未保存Recipe/履歴/過去版を保持する。日時更新後の表示は本人の再読込で最新値を取得する。

ローカル実ブラウザでログイン→ISO表示→管理者日時更新→再読込で更新保持→取消→操作停止→新規画面で終了案内を確認。実際のRAW/提出版保持は独立SQLite/HTTP試験AUTH/ AUTHORでNONRAW fixtureとして確認。CDPクリック2件がtimeoutしたが、サーバー成功状態を読み取って重複操作しなかった。既存タブの意図しない8790遷移を記録し、取消最終Evidenceは独立tabで取り直した。`ui-04/UI_METADATA.json` に不採用画像と理由を保持。

## Sites接続と配備境界

Sites building/hosting skillに従い新規専用Siteを試みたが `RATE_LIMITED / site_hosting_usage_limit_reached / HTTP429`。Site ID/URLなし、数値上限とreset日時はレスポンスにないのでUNKNOWN。既存11 Siteは変更/削除0件。根拠は `evidence/web-2026-10-03/SITES_CREATION_BLOCK.json`。有料契約・一般公開・メール送信0。

Worker adapterとDrizzle schema/0000〜0002 migration、D1/R2論理binding、既存dist/webをコピーするbundleビルドまで接続。実dispatchのChatGPTヘッダーのみ信頼し、ログイン済み非招待者も拒否する。独自メールログインは実装しない。NodeはQA用に残すがSites保存先はBUCKET一つ、別Cloud provider/二重保存先は作らない。

実128MiB一括転送をSitesへ持ち込まず、8MiB逐次part/SHA照合/途中再開を実装。破損partのみ新keyで再取得、正常partと古い破損partは上書き/削除しない。Final assemblyは固有key、実Workerではstreaming SHA-256が必須で128MiB buffer fallbackなし。本物のWorkers/R2/CPU10ms/128MB条件での完走はNOT_RUN。READY Final破損はCloud Safe失効・拒否まで、Final修復のRecovery UI/再assembly経路はNOT_IMPLEMENTED。

容量予約はstage+Finalの2倍をImport前に条件付きSQLで確保し、保持するrepair/assembly分は追加予約、上限超過で新規取込/追加writeを拒否。原本を消して容量を合わせない。試用専用上限4変数は管理者が必ず明示設定し、未設定は処理開始前503。事業Baseline50GBは維持、無料枠残高や試用容量へ自動固定しない。

R2月次read/write・request日次・予約bytes・D1 meta・wall timeを記録。D1値は計測クエリ自身を除くlower-bound、metadata未提供はUNKNOWN、wall≠CPU、requested object bytes≠network転送。Site内ledgerはアカウント全体無料残高ではない。実測計測/課金Gateへ昇格しない。`SITES_LIMITS_REVIEW.md` 参照。

## NOT_RUN / BLOCKと合格条件

| 対象 | 理由・必要環境 | 次の確認・合格条件 |
|---|---|---|
| 実RAW一枚/100/500/1000 | 許諾済みカメラRAW未配置 | checkout外RAWを選び取込→global調整→保存→再読込→Final。前後SHA一致、Proxy/Final実画像一致 |
| 実画像全調整/人物漏れ | RAW/人物画像なし、顔SDK停止 | 端値/複合/Undo/Redo/再起動/別人物と背景非変化。人工試験を転記しない |
| 実Sites Auth/D1/R2 | 新Site429、実membership未設定 | 上限解消後専用Siteのみ登録、実招待者と非招待者、直接API/期限/取消/復旧/量計測を確認 |
| 大RAW/メモリ/実容量不足/切断 | 実素材・runtime未実測 | 実Worker/ブラウザで128MiB/24MP境界、中断→再開、保存失敗でRAW/未保存編集保持 |
| Native112/Mac/Xcode | WindowsにSwift/Xcodeなし | `swift test --package-path packages/METISMobileCore`、SuiteCore、Apple build、個別NAT Evidence |
| iPhone / iPad | 各実機なし | 各独立RAW→Proxy→Edit→Recipe Save→Restart→Restore→Cloud Safe→Final完走 |
| Billing / Pricing / 一般販売 | 未接続・正式方式未確定 | 本番原価/手数料/競合条件を確認後、ユーザー決定。今回有料接続しない |

Apple Face Brightness = IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED。Web人物補正 = PRIVACY_BLOCKED / NOT_VISUALLY_VERIFIED。Evoto Feature Parity / Mobile Release = BLOCK。実RAWやWeb成功をApple112/実機成功へ転記しない。

未登録原本Recovery: 原本保持/自動削除禁止 IMPLEMENTED。orphan検出/asset照合/checksum付き再登録/Recovery UI/Cloud Safe再評価 NOT_IMPLEMENTED。保持設計を復旧完成とは表現しない。

## 変更ファイルと互換性

コード全一覧/現SHA/実行前後一致は `trial-final-01/RUN_METADATA.json#/sourceHashes`。変更一覧は `INTEGRATED_CHANGES.json`。主な変更:

- `apps/web/src/{session,api-client,bootstrap,trial-client,sites-client,editor-ui,author-ui,login-ui}.mjs`、styles.css/index.html、processing/*
- `apps/web/{local-server,trial-server,invite-auth,invite-admin,author-store,preset-policy,build}.mjs`、src/preset-author/*
- `apps/sites/{src,db,drizzle,.openai}/`、build.mjs/package.json/drizzle.config.ts
- `apps/web/tests/*`（152別Suite）、新results、scripts/web-trial-ui-seed.mjs/run-web-trial-evidence.mjs、package.json/lock
- integration/handoff/ownership/change notice、WEB_TRIAL_GUIDE/RAW requirements/SDK review/Sites limits、新Evidence

凍結154時点の90 source対象と比べ5差分を明示: person-geometry.tsのNode hashからpure validator再export分離、portrait-recipe.tsの同pure依存＋Web engine enum、package/lockのブラウザ/Drizzle依存、final-regression.mjsのWeb試験別Suite化/ID保持。Recipe v1外形、旧API、旧Asset/Recipe DB schemaに変更なし。trial専用DB/D1新schemaは追加であり「すべてのschema無変更」とは言わない。Apple製品コードは今回変更なし。もっと古い78対象は63一致＋既に承認済み人物/Web差分15、unexpected0であり、現在codeを78/78同一と偽称しない。元Evidence自体は不変。

147要件のRequirement→Implementation→Test→Evidence対応はWindows02 regression.json `/requirements`で全件維持。固定6文書hash検査PASS。未知/未実装の既存仕様は削除しない。

## Solの最短次手順

1. `npm run web:build`、`node apps/web/trial-server.mjs`（8791）。管理者作成は `node apps/web/invite-admin.mjs create "作者名" admin "明示ISO終了日時"`。出力tokenは管理者のローカルprivate操作用、Evidence/URLへ書かない。`invite/end/revoke/list`はCLI help参照。
2. ローカルlogin→作者ページでmember日時更新/取消/別作者拒否を確認。原本や提出版は削除しない。本文ガイド `WEB_TRIAL_GUIDE.md`。
3. 許諾済みRAWを `C:\Users\user\Documents\Codex\2026-10-03\SUITE_TEST_DATA\RAW\`へ置く（100/500/1000空dir作成済み）。まず人物なし一枚をUIで選択、3global/回転Crop/保存再読込/Finalを実測。各Source/RAW SHA/Recipe/revision/Proxy/Final/Reject/日時を新Evidenceに残す。
4. 上限解消時のみ専用Site登録再開。既存Site転用禁止。actual Sites plan・dispatch trust・SUITE管理者本人・4試用limitsを設定し、Drizzle migration3本を適用して実環境検証。現在apps/sites sourceは親SUITEのshared/distを参照するので、source archiveはSUITE root依存を含める。native Sites checkout/packaging実確認・config正規化は未実施、apps/sitesだけをpushして完成としない。
5. 外部URL/実RAW/actualAuth・復旧・隔離・容量測定が通ったら招待試用合格を再判定。一般公開/有料販売/Apple Gatesは別。
6. 新変更後は `node scripts/run-web-trial-evidence.mjs <未存在のdocs/evidence/配下dir>` と `node docs/EVOTO_AUDIT/tools/run-timed-regression.mjs <新dir>`。凍結結果へ上書きしない。

既に取得された画素/RAWを取消で消去できない。未保存を守るため画面に保持するが次の編集/exportは拒否。ローカル運用者のCLI権限、自己admin取消後の復旧、厳格な既存Preset3global制限、残容量予約の手動点検/未登録R2 assembly inventory、実Cloud CPU/課金・長時間性能が残存リスク。
