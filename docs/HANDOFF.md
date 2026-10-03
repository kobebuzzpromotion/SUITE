# Solへの正本引継ぎ

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
