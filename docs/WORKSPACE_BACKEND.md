# Workspace server metadata / Team editing — implementation evidence

最終統合追記: 親の全回帰124 PASS、repository16/HTTP15/grant2/storage12の現差分結果はINTEGRATED_REPORT.md。本文中の「HTTP統合待ち」「UI未実装」は当該担当の途中snapshot。現在はHTTP接続を検証、Workspace UI/clientはコードあり未検証・認証未注入。旧FAIL記録は削除せず残す。実Cloud/実RAW/iPhone/iPad成功を意味しない。

2026-10-03 JST。担当範囲は `apps/backend/src/workspace.ts`、`apps/backend/tests/workspace.test.ts`、本書。旧147節・固定6文書・既存AssetRepository/StorageProvider/RecipeDocument v1は無変更。追加仕様全文は WORKSPACE_SPEC_PART_1/2/3.md。HTTP統合・署名grant・quota・billing台帳・最終回帰は主担当の別ファイル。本書のPASSはWindows上のSQLite/既存local object storage境界であり本番Cloud・RAW描画・実機の合格ではない。

## 実装済み・限定検証済み

- 全操作はserver認証subjectに対してlive memberをDBから再照合。自己申告roleは使わない。subjectはopaque値として保持し、trimによる別人化をしない。
- OWNER / ADMIN / EDITOR / VIEWERの既定Permissionをserver側で強制。複数Workspace所属、workspace/project/asset/preset/recipe/auditの境界拒否、role降格・member revokeの即時反映。
- 招待は32byte乱数tokenのSHA256のみDB保存。期限、pending/accepted/revoked、verified email一致、Workspace一致、重複防止、同一人の再受諾idempotency。招待者が削除・降格されていれば未受諾招待も利用不可。verified emailはHTTP bodyではなく認証結果由来でなければならない。
- 最後のOwnerの降格・削除を拒否。AdminからOwnerへの昇格・Owner変更を拒否。Owner権限移転は既存Ownerが別memberをOwnerへ昇格してから行える。
- ProjectとAsset参照を共有。同じWorkspaceの同一登録Assetを複数memberが参照する際にOriginalを複製しない。新しい別Asset IDのdedupはHTTP登録層の責務。本層だけで全重複uploadを防ぐと主張しない。
- Recipeは既存plain JSONをversion bodyへ内包。workspace/project/asset/editor/timestamps/version/parentは外側メタデータ。BEGIN IMMEDIATE内のCASでheadを比較し、競合は別version・branch・差分として保持。headを勝手に進めない。解決はユーザーが現headをbaseとして明示再保存する。全versionにSQL update/delete拒否trigger。
- 履歴差分はJSON Pointer escape付きfield path / before / after。比較はbase→自身、競合表示はcurrent→自身。person/Session Look/その他Recipe拡張値を落とさない。
- Shared PresetはOwner/Adminが作成・更新・削除、Editorは適用、Viewerは閲覧。Preset更新はCAS。削除はtombstone。適用はDB transaction内でbody＋preset version値snapshotをRecipeへ固定し、Preset変更・削除後も履歴が再現可能。Personal Presetは作成者のみ。他workspaceへ公開しない。
- SelectionはViewerを含めCAS保存、古いbaseを拒否。Recipeと異なり未受理Selectionをbranch保存する機能はない。
- Asset/Project削除はWorkspaceメタデータのtombstoneのみ。復元で参照を再開し、Original/Recipe/既存Cloud Safe証拠を削除しない。quota超過やdowngradeから物理削除を呼ぶ経路は本層にない。
- 操作監査はactor/action/target/time/detailsを追記保存。member invitation/role/revoke/project create/delete/asset delete/recipe save/conflict/preset/selection/recoveryを記録。server側で検証したlogin/export/storage-plan/billing eventを記録する限定関数を用意。SQL監査update/delete禁止。未接続の認証・課金処理を記録だけで完成扱いしない。

## Role / Permission

| Permission | Owner | Admin | Editor | Viewer |
| --- | --- | --- | --- | --- |
| read / select | 許可 | 許可 | 許可 | 許可 |
| edit / export | 許可 | 許可 | 許可 | 拒否 |
| manage-members / manage-projects / manage-presets / publish-gallery | 許可 | 許可 | 拒否 | 拒否 |
| delete / audit | 許可 | 許可 | 拒否 | 拒否 |
| owner（最上位Billing等） | 許可 | 拒否 | 拒否 | 拒否 |

Fine-grained個別permission付与UI/設定は未実装。`publish-gallery`の権限名・メタデータschemaはあるがGallery公開配信サービスは未実装。`COMMUNITY` scopeは分類として保持し作成APIは明示 `COMMUNITY_NOT_IMPLEMENTED` で拒否する。

## Database / Object分離

追加DB tableは既存途中実装の `ws_workspaces`, `ws_members`, `ws_invitations`, `ws_projects`, `ws_assets`, `ws_recipe_heads`, `ws_recipe_versions`, `ws_presets`, `ws_preset_versions`, `ws_selections`, `ws_galleries`, `ws_audit` を使用。WAL/FULL synchronous/foreign keys/busy timeout。RAW BLOBは保存しない。`ws_assets`は既存AssetRepositoryで解決したOriginal key/hash/IDの参照で、参照後のkey/hash不正変化も拒否する。クラウドprovider、価格、Apple課金方式は選定していない。

## 実行結果

1. `npm run build`：統合作業中の全体ビルドはFAIL。最新確認時は別担当 `workspace-server.ts:162` → `WorkspaceStorageLedger.reservationForOperation` 未接続1件。以前のcurrentRecipe/listRecipeVersions/signature不一致は解消済み。これを全体PASSと報告しない。最終結果は主担当が再実行して固定する。
2. `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --skipLibCheck --types node apps/backend/src/workspace.ts apps/backend/tests/workspace.test.ts`：PASS（exit 0）。
3. `node --test dist/apps/backend/tests/workspace.test.js`：15 PASS / 0 FAIL / 0 SKIP（exit 0）。tscは他ファイルエラー時も今回対象をemitしており、実行前に対象の限定typecheckを別途実施した。最終統合で全buildを再実行必須。

| Test | 結果・検証範囲 |
| --- | --- |
| membership/workspace/Asset/Project隔離 | PASS、直接ID指定・別workspace・空白subject偽装拒否 |
| invitations | PASS、verified email/境界/期限/取消/二重登録/同一人再受諾 |
| roles | PASS、Viewer edit/export/delete拒否、Editor管理拒否、live降格 |
| revoke / Owner protection | PASS、旧subjectアクセス拒否、古い招待者失効、最後のOwner保護 |
| Recipe conflict/history | PASS、branch/current/base/editor/diff保持、SQL immutable trigger |
| two worker Editors | PASS、実Worker 2接続から同一base競合、1head/1branch |
| three worker Editors | PASS、実Worker 3接続から同一base競合、1head/2branch、checksum |
| Shared Preset | PASS、更新CAS・固定snapshot・削除後の既存Recipe保持 |
| Personal / Community | PASS、個人Preset境界とCommunity未実装の明示拒否 |
| Selection CAS | PASS、2人/3人の古いbase拒否（この試験は順序立てた呼出し、実Worker競合ではない） |
| Soft delete / recovery / Cloud Safe | PASS、local object維持・Recipe復元・既存検証失効反映。本番Cloud証明でない |
| audit actor / immutability | PASS、認証actor記録・他workspace拒否・SQL改竄拒否 |
| Recipe invalid/reopen | PASS、不正base/payload拒否・現revision保持・SQLite再open（プロセス強制終了試験ではない） |
| shared Original reference | PASS、member毎copyなし・RAW BLOBなし・checksum不変 |
| Crop/Print/JPEG/TIFF/PNG Recipe保持 | PASS、設定とDPIの保存のみ。画像encoder出力の成功ではない |

## 未実装・未検証・NOT_RUNを分離

- 未実装：iPhone/iPad Workspace UI・認証注入、招待メール配送、実Cloud Library連携、Gallery公開/Client導線、Community公開、個別permission UI、課金provider接続、期限付きRecovery/解約時data retrieval運用。これらを「環境さえあればPASS」としない。
- 別担当統合待ち：HTTP API実行、署名grant再照合、quota/usage/Billing、安全なupload登録とdedup、全体ビルド/既存34件回帰。主担当の最終Evidenceを正とする。
- NOT_RUN / Required environment：Mac+Xcode、実iPhone/iPad、checkout外実RAW、本番候補Cloud・本番認証がない。Windows storage bytesをRAWやCloud試験の代用にしない。
- Next procedure：全体 `npm run build` → `node --test dist/apps/backend/tests/*.test.js scripts/raw-harness.test.mjs` → Mac native build → iPhone/iPad各2–3認証済memberでWorkspace切替→Project→RAW Import→Proxy→編集→Recipe保存競合→再起動→Cloud Safe→Original要求→Export。
- Acceptance criteria：他Workspace/削除member/Viewerの権限外APIがserver拒否、双方のRecipe履歴保持、Preset削除後再現、原本checksum不変、quota/downgrade/Trashで原本非削除、全必須Gateに実測Evidence。本番未接続・実機未実行の間はMobile Release BLOCK。

残存リスク：SQLite単一serverのtransaction試験で分散クラウドDBの実測ではない。HTTPの長い非同期upload/download途中のrevokeに対しても完了/取得直前再認可が必要。member identityとverified emailは本番認証品質に依存。招待token配送・ログ秘匿・レート制限、DBアクセス権/バックアップ、公開Gallery、商用Retention/利用規約は別途実装/検証が必要。

## 再開後の限定修正（2026-10-03）

`registeredAssetStates(actor, workspaceId, projectId): {assetId: string; trashed: boolean}[]` をread-only内部reconciliation accessorとして追加。live delete権限を要求し、削除済projectも照合する。個別AssetまたはProjectのいずれかがtombstoneならtrashed=true。跨DBのtrash/ledger障害後再試行に利用するための状態取得であり、RAW/既存保存契約/Schemaは変更しない。監査追記も行わない。

追加試験は一般member/Editor/Viewer/他Workspace/revoke拒否、削除Project内全Asset、Project復元後も個別Asset削除保持、read-only確認、Original checksum不変。

- `npm run build`：PASS / exit 0（上記の途中統合FAILを解消した再実行。過去FAIL記録は保持）。
- `node --test dist/apps/backend/tests/workspace.test.js`：**16 PASS / 0 FAIL / 0 SKIP**。
- HTTP跨DB障害の注入/再試行収束はHTTP担当の別試験。全回帰・実機Gate合格へ自動昇格しない。
