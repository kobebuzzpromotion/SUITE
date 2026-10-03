# 固定担当と統合

## 2026-10-03 Cloudflare専用コピー引継ぎ（最新）

停止中の別PCタスクは再開・連絡しない。元SUITEと既存Sitesは全員読取りのみ。専用コピー内でメインが最終統合する。

- メイン: `apps/sites/db/schema.ts`、`apps/sites/drizzle/0003_suite_sites.sql` とmeta、`apps/sites/build-cloudflare.mjs`、`apps/sites/cloudflare/wrangler.example.jsonc`、`apps/web/src/{sites-client,editor-ui,admin-login-ui}.mjs`、共有契約・配備準備・最終回帰/Evidence。
- `cf_auth`: `apps/sites/src/{cloudflare-identity,cloudflare-entry}.mjs` と `apps/sites/tests/cloudflare-auth.test.mjs` のみ。D1 session台帳の契約変更はメインが決定。完了後編集停止。
- `cf_storage`: 新規 `apps/sites/tests/{cloudflare-storage,cloudflare-artifact}.test.mjs`、`docs/CLOUDFLARE_{STORAGE,ARTIFACT}_CHECK.md` のみ。既存Worker/Schema/configは読取り。完了後編集停止。
- `cf_verify`: 新規 `apps/sites/tests/cloudflare-integration.test.mjs`、`docs/CLOUDFLARE_QA_CHECK.md` のみ。認証・所有者・失効の独立試験。完了後編集停止。

旧割当は専用コピーのこの工程では上書きせず凍結。共通API/Recipe v1/既存DB表/保存6契約の再設計はしない。外部接続結果はローカルPASSと別Gate。

## 2026-10-03 公開Web試用・Sites配備再開

前節Bの写真一覧実装と試験は統合済みで担当作業終了。今回の配備前スコープ表示に限り、メインが `apps/web/src/editor-ui.mjs`、`apps/web/src/styles.css` を排他的に引き継ぐ。共有API/Schema/Sites接続、最終Build・回帰とEvidenceもメイン。現在これらのファイルを編集するサイド担当は置かない。旧担当成果・凍結Evidenceは保持する。

## 2026-10-03 公開Web試用・写真一覧の排他的担当

- Main: `contracts/recipe-v1.schema.json`、`packages/SuiteCore/Sources/SuiteCore/Recipe.swift`、`apps/sites/src/worker.mjs`、必要な新規管理認証module、`apps/web/src/bootstrap.mjs`、共有API/schema/統合/全回帰/Evidence/Sites公式操作。既存コードを再利用し、公開切替は安全確認後のみ。
- A `preset_review`: 新規 `apps/web/src/browser-local-api.mjs` と `apps/web/tests/browser-local-api.test.mjs` のみ。匿名ブラウザ内のRAW/Recipe永続化と復元。共有端末/Cloudの所有者認証と混同しない。
- B `sites_gap_review`: `apps/web/src/editor-ui.mjs`、`apps/web/src/styles.css`、新規 `apps/web/tests/filmstrip-interaction.test.mjs` のみ。iPad横スワイプ/慣性、誤選択防止、マウス/トラックパッド、選択表示と多枚数状態保持。bootstrap/Worker/Schemaへ触れない。
- C `astra_safety_review`: 読取り専用。公開匿名境界/管理者二要素/既存テナント分離/期限・取消の矛盾をレビューし、試験案を返す。製品ソース・凍結Evidenceは編集しない。

前工程の担当成果は保持し、この節の対象ファイルのみ再割当する。同一ファイルの同時編集を禁止する。

親担当のみが割当を変更する。元資産は全員読み取り専用。共有契約変更は親が調整する。

| 担当 | 書込み可能ファイル | 責務 |
| --- | --- | --- |
| editing_storage | packages/METISMobileCore/**, packages/SuiteCore/** | 共通Mobile Core、UI非依存Recipe/履歴/保存境界、単体試験 |
| release_requirements_review | apps/apple/Suite/Features/iPhone/** | iPhone専用UI |
| ipad_ui | apps/apple/Suite/Features/iPad/** | iPad専用UI |
| policy_review | docs/REUSE_AUDIT.md, docs/FINAL_AUDIT.md | 元資産調査、仕様欠落監査（実装ファイルは読み取り） |
| raw_harness（追加） | scripts/raw-harness.mjs, scripts/raw-harness.test.mjs, docs/RAW_QA.md | checkout外の実RAW manifest・負荷測定runner。代用RAW禁止。backend/native/共有契約は変更しない |
| メイン | 上記以外 | 正本/共有契約、AppModel/共通UI/Provider接続、backend、ルート構成、最終統合、ビルド/テスト |

同時上限はメイン＋サイド3名。Phase 0資産監査完了後はその枠をUI担当へ回す。全並列ではなくMobile Core契約確定→独立実装の段階並列とする。仕様欠落監査は実装担当完了後に読み取りで実施する。

統合フェーズ追記: editing_storageは既存package内でRecipeDocument共通JSONとSession Lookの非破壊データ境界のみを担当。policy_reviewは最終監査、raw_harnessは外部RAW試験基盤を担当。メインがbackendとの整合、Apple adapter、実行試験、追加指示正本化を統合する。新しい6領域API/providerは採用しない。

## 提出準備・比較監査フェーズ（2026-10-03）

固定6文書・147節・製品契約は全員変更禁止。メイン以外の担当は下記ファイルのみ編集する。

| 担当 | 書込み範囲 | 責務 |
| --- | --- | --- |
| evoto_audit | docs/EVOTO_AUDIT.md, docs/evoto-audit.json | Evoto公式情報と現ソース/実行証拠に基づく詳細差分A–G・操作連鎖・差分台帳。仕様を追加/削除しない |
| apple_submission | docs/APPLE_SUBMISSION/** | Apple公式要件・提出用草案/未確定/プライバシー/権利/審査手順。実提出/アップロードなし |
| mobile_gate_audit | docs/MOBILE_DEVICE_QA.md | iPhone/iPadそれぞれの一連の操作、実測Gate、必要環境、実装不足とNOT RUNの分離。コードは読取り |
| メイン | 上記以外 | 回帰再実行、Evidence固定、成果検証、正本状態/引継ぎの更新。新provider/API/保存契約/Web追加なし |

## Crop / Print / Export追加指示受領後

ユーザー添付7d15ef1dの16節を別正本に追加する明示承認を受けた。既存147節・固定6文書は維持。先行する提出/比較監査の成果を保持し、担当を次に限定して切り替える。

| 担当 | 書込み範囲 | 責務 |
| --- | --- | --- |
| apple_submission（Core担当へ変更） | packages/SuiteCore/Sources/SuiteCore/CropExport.swift、packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift、apps/backend/src/crop-export.ts、apps/backend/tests/crop-export.test.ts、contracts/fixtures/print-presets.json、docs/PRINT_PRESETS.md | 一次情報の実寸catalog、Swift/TSの非破壊設定モデル・計算・追加単体試験 |
| mobile_gate_audit（UI担当へ変更） | apps/apple/Suite/Shared/CropExportControls.swift | Crop/Export設定UI・Proxy上Crop枠。既存View/EditorModelは変更しない |
| evoto_audit | docs/EVOTO_AUDIT.md、docs/evoto-audit.json | 最新正式追加30比較項目、A–G、workflow。製品ソース変更禁止 |
| メイン | 上記以外 | 添付正本/追加16節trace、既存Recipe拡張枠での接続、renderer/UI接続、統合試験・回帰・Evidence・ハンドオフ |

製品の保存同期契約・API/providerは変更しない。追加Crop/Exportは既存Recipeのnamespaced拡張データに保存し、旧Recipe/golden fixtureは保持する。未検証nativeをPASSとせず、出典不明実寸は無効候補に残す。

Evoto162項目初期監査完了後の追加試験担当: evoto_auditは `apps/backend/tests/crop-integration.test.ts` と `apps/apple/Tests/CropExportPipelineTests.swift` の新規2ファイルだけ追加編集可。現行productionソースは読取り。監査2ファイルの成熟度更新も担当のまま。親が最終統合し、元のWIN/NAT IDを維持して追加IDを採番する。

## Workspace / Team / Cloud / Billing追加45節

3原文を `WORKSPACE_SPEC_PART_1/2/3.md` として独立追加。旧147節・固定6文書・進行中Crop16節の削除/置換は禁止。

| 担当 | 排他的書込み範囲 | 責務 |
| --- | --- | --- |
| mobile_gate_audit | apps/backend/src/workspace.ts、apps/backend/tests/workspace.test.ts、docs/WORKSPACE_BACKEND.md | SQLite上のmembership/role/project/共有version競合/preset/selection/gallery/audit。既存repository/server/providerは読取り |
| evoto_audit | apps/backend/src/workspace-storage.ts、apps/backend/tests/workspace-storage.test.ts、docs/STORAGE_PROVIDER_COMPARISON.md | 容量予約/集計/独立entitlement/config注入・安全なdowngrade、公式provider比較。価格/事業者採用なし |
| apple_submission | 先行Crop担当を完了後に別途限定 | Core/TS実寸catalogとテストを仕上げる。共有ファイルを同時変更しない |
| メイン | 上記以外 | HTTP境界/旧経路迂回防止/統合テスト、署名grant、追加正本trace、Schema・ルート最終統合、全回帰/Evidence固定 |

新SQLiteテーブルは独立モジュールの内部実装。旧assets/recipesや旧Recipe v1を置換しない。ユーザーが明示承認したWorkspace追加HTTPのみを隔離し、旧6領域contract・StorageProvider interfaceは維持する。認証・Cloud/Billing本番未接続を成功として数えない。

## 再開後の有効な割当（以前の担当は編集停止）

Sol 6.1実装／Astra設計レビューはユーザー指定の運用方針であり、性能比較の結論ではない。

| 担当 | 排他的書込み範囲 | 状態・責務 |
| --- | --- | --- |
| sol_integration / Sol 6.1 | backendのworkspace-server/server/auth/repository/workspace-access、対応HTTP/grant試験、SuiteApp.swift | 統合不具合修正。レビュー対応後メインへ返却 |
| workspace_core_resume | workspace.ts、workspace.test.ts、WORKSPACE_BACKEND.md | 完了・編集停止。レビュー修正時は親が再割当 |
| workspace_storage_resume | workspace-storage.ts、workspace-storage.test.ts、STORAGE_PROVIDER_COMPARISON.md | 完了・編集停止。レビュー修正時は親が再割当 |
| astra_safety_review / Astra | 書込みなし | 権限/CAS/原本/容量/中断復旧を読取りレビュー |
| sol_evoto_inventory / Sol 6.1 | docs/EVOTO_AUDIT/**、scripts/evoto-deep-audit*.mjs | v2/v3の公式記事・最小機能・platform・未確認の監査。製品実装を追加しない |
| メイン | その他、scripts/pricing-model*.mjs、価格案/統合Evidence/引継ぎ | 候補価格保存、設定入力の試算、全回帰、最終統合。共有Schema/正本はメインのみ |

価格添付28節は独立した事業設計Baseline。販売設定・契約・本番接続は行わず、試算のPASSをPricing Gateや課金接続の合格にしない。

## Evoto Zero-Miss再監査の有効割当

現行状態と次割当は [PARALLEL_WORK_BOARD.md](PARALLEL_WORK_BOARD.md) で管理。合計4名の実枠内で継続し、空き担当は成果・確認結果回収後に独立仕事へ再割当する。新規監査Evidenceは既存Evidenceを上書きしない。

旧担当は完了・編集停止。124 PASSを回帰Baselineに固定。製品ソースと旧147/固定6文書は編集しない。

| 担当 | 排他的書込み | 責務 |
| --- | --- | --- |
| evoto_photo_review / Sol 6.1 | docs/EVOTO_AUDIT/reviews/photo.json、同photo.md | REVIEW_ASSIGNMENT photo cohortの全本文・最小操作・slider・条件を意味照合 |
| evoto_mobile_tether_review / Sol 6.1 | docs/EVOTO_AUDIT/reviews/mobile_tether.json、同mobile_tether.md | 同mobile_tether cohort、Mobile/iPad/全tetherをplatform別に意味照合 |
| evoto_workflow_review / Astra | docs/EVOTO_AUDIT/reviews/workflow.json、同workflow.md | 同workflow cohort、Library/Team/credit/Video等の差分と分類を意味照合 |
| 親 | 上記以外、共有generator/validator/Feature Master/統合報告 | Release Notes/App Store公式取得、逆引き統合、独立再照合、Baseline/全回帰/Evidence固定 |

主記事IDは3担当に重複なく分割。補助記事は読むだけ。各担当は機能出典と記事/見出しのdispositionを返し、共有Masterは親だけが更新する。未知の本文やimage-only controlを検証済みにしない。P0/P1は監査完了後に親が一括確定し、その前に個別製品実装を行わない。

### 成果回収後の次割当

- photo43本文・386見出し・1484source-bound factsを受領（factsは条件/情報を含み独立機能数ではない）。photo.json/mdは編集停止。evoto_photo_reviewは公式Web機能landing111の全本文→alias/最小操作照合へ再割当。排他的ファイルはreviews/web_features.json、web_features.mdのみ。
- evoto_workflow_reviewはworkflow89の完了後、現行英語/Japan料金およびMobileカラーCreditの公式矛盾を別reviewへ照合。追加排他的ファイルはreviews/credit_current.json、credit_current.md。既存workflowの最終版は変更せず別成果にする。
- メインは既存Evidenceを上書きせず、独立semantic snapshotとEvidenceへ統合。原本/契約/製品Schemaは変更なし。
- mobile_tether108本文・964見出し・1949source-bound records受領。元reviewは編集停止。evoto_mobile_tether_reviewへSupport index261固有href/追加ALIAS82の逆引き照合を再割当。排他的ファイルreviews/index_reverse.json、index_reverse.mdのみ。canonicalへ解決しても他Platform全機能を継承しない。
- workflow89本文・817見出し・1073records、credit_current5一次資料・13policy rowsを受領、元Evidence編集停止。Astra evoto_workflow_reviewをFeature Parity独立レビューへ再割当。排他的ファイルreviews/parity_validation.json、parity_validation.mdのみ。shared Master/元レビューへの訂正は親が独立追補に保存する。
## 2026-10-03 追加監査の排他的再割当（親による最新指定）

- メイン: docs/EVOTO_AUDIT/tools/*、親の追補 reviews/parent_sources.json、reviews/discovered_routes.json、freeze manifest、統合Registry、新規Evidence、INTEGRATED_REPORT/HANDOFF/PARALLEL_WORK_BOARD。製品契約・schema変更なし。
- Sol6.1 evoto_photo_review: reviews/web_features.json/md 完了後凍結。次は reviews/web_alias_mapping.json/md のみ。111page間および既存本文との同一操作・alias照合。
- Sol6.1 evoto_mobile_tether_review: reviews/mobile_tether.json/md と index_reverse.json/md は凍結。次は reviews/cross_source_mobile.json/md のみ。App Store25履歴＋公式Mobileと既存108記事の明示的同一操作・差異を照合。
- Astra evoto_workflow_review: workflow.json/md、credit_current.json/md、parity_validation.json/md は受領後凍結。次の訂正ツール／Registry再レビューは reviews/parity_recheck.json/md のみ。共有ファイルを編集しない。

元Evidenceは本文・判定・引用位置を含め上書き禁止。訂正は別Evidence＋元sourceFactKey＋指摘IDで対応させる。新規Featureは仕様昇格・製品実装を行わない。

### Credit163追補の担当

Astra evoto_workflow_review は reviews/credit_normalization.json/md を排他的に担当。元workflow1073のうち既知creditがNOT_DOCUMENTEDで隠れた163件を、消費イベント・Platform/Plan/地域条件・矛盾・UNKNOWN別に全件確認する。parity_recheckとともに新規Interpretationのみ。メインは458Workflow所属、26URL、canonical registryを担当。

### Workflow458追補の担当（Mobile別source照合完了後の再割当）

Sol6.1 evoto_mobile_tether_review は reviews/workflow_normalization.json/md のみを排他的に担当。元workflow458操作のsourceFactKeyごとの複数所属・stage・source順序を整理し、未検証chainはNOT_VERIFIED。cross_source_mobile.json/mdは凍結。親は解釈結果をRegistryへ統合するだけで同ファイルを書かない。

## 最新：実装中心4名編成（過去割当をこの範囲で更新）

- メイン：packages/SuiteCore/Sources/SuiteCore/PortraitRecipe.swift、apps/backend/src/portrait-recipe.ts、apps/backend/src/photo-policy.ts、共有Recipe検証・docs/CHANGE_NOTICEと統合・回帰ツール／報告。既存6契約／147節不変。
- Sol6.1 evoto_photo_review：apps/apple/Suite/Services/PhotoPipeline.swift、Services/PortraitPipeline.swift（新規）、EditorModel.swift、Shared/EditorComponents.swift のみ製品編集。既存iPhone/iPadは共通controls経由で接続。共有Core/backend/schemaは編集禁止。元監査成果はcheckpoint保存・編集停止。
- Sol6.1 evoto_mobile_tether_review：docs/EVOTO_AUDIT/reviews/audit_continuation.json/md のみ。監査1名。workflow_normalization保存済み・凍結。監査の完了を実装開始条件にしない。
- Astra evoto_workflow_review：apps/backend/tests/portrait-recipe.test.ts、packages/SuiteCore/Tests/SuiteCoreTests/PortraitRecipeTests.swift、apps/apple/Tests/PortraitPipelineTests.swift、docs/PORTRAIT_REVIEW.md。独立検証と重大設計レビュー、製品実装ファイルは編集禁止。Mac未実行をPASSにしない。

中間監査Evidence registry-01、web_alias checkpoint、credit163、workflow458を保全。全員で監査へ戻らない。空き担当に依存解消した非重複仕事を割り当てる。

### メイン統合の追加担当ファイル

メインのみ `apps/backend/src/repository.ts`、`packages/SuiteCore/Sources/SuiteCore/Recipe.swift`、`Project.swift` を編集。Face BrightnessのAsset/checksum拘束を保存・再読込・全Undo/Redo履歴に適用する。DB schema、既存Recipe v1 envelope、HTTP API、固定6文書は変更しない。Astraは対応試験のみを編集する。

`apps/backend/src/workspace.ts` のShared Recipe保存・読込への同じ検証接続もメイン専有。既存CAS/競合branch/権限は維持。Person UUID→anchor対応の履歴検証は新DB列を追加せず保存済みRecipeから照合する。

`packages/SuiteCore/Sources/SuiteCore/ProjectStore.swift` もメイン専有。保存済checkpointを別historyで置き換える際の人物UUID/anchor再拘束のみ追加する。checkpointファイル形式/CAS/原本保持/既存Undo分岐規則は維持。

成果回収後: Sol evoto_photo_reviewは製品4files編集停止、`docs/FACE_BRIGHTNESS_NATIVE_QA.md` だけへ再割当。メインは `apps/apple/Package.swift` と `apps/apple/QA/RawQAAdapter.swift` のMac QA source包含・公式initializerの最小統合修正を担当。Astraはテスト20件保存後の読取りレビューを継続。監査Solはaudit_continuationを完了保存・編集停止。

### 共通人物整合Gateの最新追加割当

- メイン: 新person-geometry.ts / PersonGeometryIntegrity.swift、portrait bridge接続、共有Gate統合、Evidence diagnostics・最終回帰。既存network API/DB schema/Recipe envelope不変。
- メイン追加: PhotoPipelineのFinal信頼checkpoint照合とPhotoLifecycle.swiftのExportPlan Asset/checksum検証のみ。Solの再専有はEditorModelだけのまま。
- Sol evoto_photo_review: EditorModel.swiftだけを再専有。load/select/import/再検証失敗/不正Person選択の旧選択無効化。内部storageRoot test seamは既定動作互換、外部APIではない。Native QA docも担当。
- Astra: 新person-integrity-paths.test.ts排他、Core/Apple人物試験追加とPORTRAIT_REVIEW追記。個別PGI経路をWindows data boundaryとNative実行へ分離。
- Sol evoto_mobile_tether_review: PERSON_INTEGRITY_GATE.md / PERSON_INTEGRITY_PATHS.jsonだけ新規排他。元監査全成果保存・凍結、Source実装は編集しない。

### 最終回収後の所有権 — 前工程（凍結）

全担当の製品/試験/新Gate文書を受領し、全154 Windows回帰/Native112 NOT_RUN/文書10PASSをメインで実測。前工程は編集停止、凍結Evidence不変。

### 最新：ユーザー許可Web先行工程（この範囲を最優先）

担当契約はWEB_IMPLEMENTATION_CONTRACT.md。合計4名、同時編集なし。全員実装開始可。
- メイン: apps/web/src/{session,api-client,bootstrap}.mjs、apps/web/{local-server,build}.mjs、package、shared validator、統合/Evidence。
- A evoto_photo_review Sol6.1: apps/web/src/processing/**、docs/WEB_PROCESSING.md のみ。
- B evoto_mobile_tether_review Sol6.1: apps/web/index.html、src/editor-ui.mjs、src/styles.css、docs/WEB_UI_REVIEW.md のみ。
- C evoto_workflow_review Astra: apps/web/tests/**、docs/WEB_SAFETY_REVIEW.md のみ。製品ソース読取りレビュー。
Apple、旧147/6固定文書、元監査、旧実行Evidenceは編集禁止。今回の明示許可はWeb実装限定でApple Gateを合格へ変えない。

### 最新ユーザー指示：Web招待試用成立（4名）

- メイン: 前記共有範囲＋apps/web/{invite-auth,author-store,trial-server,invite-admin}.mjs、src/trial-client.mjs、統合docs/Evidence。旧SQLite/HTTPは変更せず、trial専用DB/routeの追加判断はメイン。
- A evoto_photo_review: docs/WEB_SDK_PRIVACY_REVIEW.mdとWEB_PROCESSING.md。SDK通信確認1名専任、processing sourceは最小遅延import修正完了後読取りのみ。
- B evoto_mobile_tether_review: 旧UI4files＋apps/web/src/{author-ui,login-ui}.mjs。作者ログイン/下書き/提出/レビュー/共通Preset UI。共有session/API/backend読取り。
- C evoto_workflow_review Astra: apps/web/tests/{trial-auth,author-submissions}.test.mjsのみ新規専有。旧69試験/元Evidence不変。重大境界レビュー・独立試験。

実RAW素材/外部URL未接続は独立BLOCK。顔SDK未解決は人物処理だけ停止し、RAW/global/保存/Export/作者保存を止めない。新しい料金/provider/Apple課金方式や招待先本人のアクセスを勝手に確定/作成しない。

### Sites接続の追加所有（4名、同時編集禁止）

- main: apps/sites/**、apps/web/preset-policy.mjs、src/preset-author/**、src/sites-client.mjs＋前記shared/client/server/docs。Sites tools/checkout/publishはmainのみ。ユーザー本番公開禁止につきdeployしない。
- A: docs/SITES_LIMITS_REVIEW.md、WEB_RAW_INPUT_REQUIREMENTS.md、apps/web/tests/multipart-client.test.mjs＋新results/multipart-client-*。Sites source/toolsは触らない。
- B: 前記UIのみ。外部portablePresetRecipe/authorSubmission再利用、admin承認/commonPreset導線追加。
- C: 新trial2tests＋sites-worker.test.mjs、新results/trial-independent-*、重大設計read-only review。旧Evidence/テスト上書き不可。

処理source→UI→独立試験→main統合、NOT_RUNを実画像成功にしない。終了担当へ次の非重複仕事を渡す。

### 最新: 招待期限統合・非公開専用Site許可

ユーザーは新規SUITE専用Siteの非公開招待配備を許可。既存Siteは転用/上書き/削除禁止。create_siteは429でBLOCK、許可を成功Evidenceに変換しない。
main: 上記所有＋scripts/web-trial-ui-seed.mjs（明示的ローカルQA識別のみ）、期限サーバー/台帳/共有integration/新Evidence。B: UI期限と管理者日時/取消、Sites signoutのみ完了freeze。A: SDK停止維持・quota安全レビュー新規追補完了freeze。C: owned3試験の期限/保持/CloudSafe障害独立検証→最新Evidence→freeze。合計4名上限。

### 最新: 編集機能不足の解消とSites引継ぎ

ユーザーが既存 `eclat-genseki-demo.bals-enter.chatgpt.site` を今回SUITE用と明示し、旧データ破棄を許可。上の「既存Site転用禁止」はこの特定Siteに限り上書きする。他Siteは対象外。旧Site version 33は復元可能な履歴として残す。

- メイン: Sites対象IDの確認・アクセス設定・ソース統合/公開、共有Recipe検証、apps/web/src/{session,editor-ui}.mjs と processing/pure.mjs の接続、必要な共有契約・統合回帰。Siteの書込/公開はメインのみ。
- A evoto_photo_review: apps/web/src/processing/color-adjustments.mjs と apps/web/tests/color-adjustments.test.mjs のみ。色・明るさ・HSLの独立純粋画素処理。
- B evoto_mobile_tether_review: apps/web/src/processing/detail-adjustments.mjs と apps/web/tests/detail-adjustments.test.mjs のみ。明瞭度・テクスチャ・シャープの独立純粋画素処理。
- C evoto_workflow_review: docs/EDITING_GAP_MATRIX.md と apps/web/tests/editing-integration-independent.test.mjs のみ。18項目・一次情報・AI差分、統合後の独立試験。Sites接続経路は読取り調査のみ。

旧154 Windows/既存Web回帰と凍結Evidenceは変更しない。8bit sRGB後段の人工画素試験を実RAW/RAW段階WB・ハイライト復元/Apple実機の合格へ転記しない。最新の明示指示によりWeb実装を先行、配色は白背景方針を後工程とする。
## 2026-10-03 Web招待試用再開の排他的担当

- Main: 共有Preset/Recipe接続（`apps/web/src/preset-author/preset-author-contract.mjs`、`apps/web/preset-policy.mjs`、`apps/web/src/session.mjs`、`apps/web/src/author-ui.mjs`）、統合・回帰・Sites公式操作。既存Site以外に触れない。
- preset_review: 新規 `apps/web/tests/portable-postdecode-preset.test.mjs` の独立試験だけ。製品/共有契約ファイルは編集しない。
- preset_review の次割当: 新規 `apps/web/tests/crop-fixed-ratios.test.mjs` の固定9比率・履歴・保存・Synthetic Final独立試験だけ。
- sites_gap_review: 新規 `scripts/prepare-sites-checkout.mjs` と `scripts/tests/prepare-sites-checkout.test.mjs` の非Deployソース準備だけ。既存Site/共有設定を変更しない。
- raw_wb_review: RAW段階WB/8-bit境界の読取り設計レビューのみ。実装・Apple/Sites操作なしで終了。

共有API、DB schema、Recipe v1外形、正本の最終統合はMainのみ。旧Evidenceは不変、新実行結果を別Evidenceへ保存する。
