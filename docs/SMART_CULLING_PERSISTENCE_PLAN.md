# Smart Culling の永続化・UI 接続境界（2026-10-04 読取り調査）

これは実装計画であり、保存機能や AI 自動選別の完了報告ではない。今回、ソース・Schema・既存試験は変更していない。

## 現状の証拠

| 経路 | 確認できた契約 | 現在の不足 |
| --- | --- | --- |
| 手動の純粋状態 | `apps/web/src/smart-culling-project.mjs` は Project/Workspace ID、Asset ID、選択、0–5 Stars、pick/reject Flag、色ラベル、最大32 Tags、最大1000 Segments、並び順・所属・フィルタを不変データとして計算する。最大100,000 Asset。入力の `tenantId` は検査するが、**Project所属・権限は証明しない**と明記している。 | 保存、サーバー権限、UI、AI解析なし。`apps/web/tests/smart-culling-project.test.mjs` はメモリ内の5試験のみ。 |
| Node/SQLite Workspace | `apps/backend/src/workspace.ts` の `ws_projects` と `ws_assets` は所属を保持し、`listAssets(actor,wid,pid)` は権限付きProject一覧を返す。`ws_selections` と `saveSelection` は `select` 権限、Asset所属、`baseVersion` CAS、監査を備える。選択権限は VIEWER を含む全ロール。Recipeは別の不変版履歴 `ws_recipe_versions` にある。 | Stars/Flags/Tags/Segmentsの表・APIはない。現行選択以外をRecipeに入れる設計ではない。 |
| Node HTTP | `apps/backend/src/workspace-server.ts` は `/v1/workspaces/{wid}/projects/{pid}/assets/{aid}/selection` の GET/PUT と、Project/Asset/Recipe経路を提供する。 | Culling統合の読取/更新経路なし。Node QA用であり、そのままCloudflare Workerではない。 |
| Web Editor | `apps/web/src/bootstrap.mjs` は `TrialClient`/`SitesClient`/匿名BrowserLocalのいずれかで `EditorSession` を起動する。`apps/web/src/editor-ui.mjs` の「Workspace」は画面名で、Project culling画面ではない。`BrowserDraftStore` はProxy・Recipe履歴のローカル下書きであり権限付き正本ではない。 | CullingのProject選択、タグ・Flag・Segment操作、サーバー読込/競合表示なし。Export順の明示選択やRecipe履歴をCulling選択と混同しない。 |
| 公開Trial / Cloudflare | `apps/sites/db/schema.ts` と `apps/sites/src/worker.mjs` は `assets` と `recipes` をD1に保持し、各会員に `trial-{memberId}` tenantを割り当てる。`/v1/assets` はtenant単位。`TrialClient`/`SitesClient` にCulling APIなし。 | D1にProject・Workspace・selection・culling表がなく、Project所属と共有Workspace権限もない。NodeのWorkspace状態をCloud上に存在するものとして扱えない。 |

## 最小の安全な実装順

1. **対象契約を固定する。** `selected` はNode側の既存 `ws_selections` を唯一の正本とし、Stars/Flags/色ラベル/Tags/SegmentsはRecipe・RAW・XMP・Presetから独立したProjectメタデータにする。既存の `select`（VIEWER可）をStars等へ暗黙に拡張しない。暫定提案はAssetの星/Flag/Tag/Segment所属変更に既存 `edit`、Segment作成・改名・順序変更に `manage-projects` を要求すること。最終的なロール運用はOwner決定事項。
2. **まずNode Workspaceに永続化する。** `apps/backend/src/workspace.ts` の既存SQLiteへ追加表を作る。候補はProject単位CAS用 `ws_culling_heads(workspace_id,project_id,version)`、Asset単位 `ws_culling_marks(workspace_id,project_id,asset_id,rating,flag,color_label,tags_json,updated_by,updated_at)`、Segment定義 `ws_culling_segments(workspace_id,project_id,segment_id,name,sort_order)`、一Asset一Segmentを制約する `ws_culling_assignments(workspace_id,project_id,asset_id,segment_id,sort_order)`。外部キーを既存 `ws_projects`/`ws_assets` と結び、同一トランザクション内で所属、現在ロール、削除状態、厳密入力、期待versionを再検証してから更新・監査する。既存 `ws_selections` は複製しない。選択と他の印を単一操作にするなら、両方の期待versionを同じDBトランザクションで検証・更新し、部分成功を返さない。
3. **HTTPで本人のProject状態のみ扱う。** `apps/backend/src/workspace-server.ts` にProject配下の読取（一覧はページ分割）と小さな単一更新（mark/tag/segment操作）を追加し、actorは認証principalからのみ取得。`smart-culling-project.mjs` の上限・値域をサーバーでも検証する。Node HTTPのbody上限512KiB、Cloud Workerのpayload上限256KiBなので、100,000 Assetの状態を一括PUTしない。競合は明示409/CAS、権限失効は403、未知または他Project Assetは404、保存未確認は成功表示しない。
4. **Webへ薄く接続する。** 新規 `apps/web/src/workspace-culling-client.mjs` 等でProject一覧→権限付きAsset一覧→Culling状態を取得する。`apps/web/src/bootstrap.mjs` と `apps/web/src/editor-ui.mjs`（必要なら新規 `culling-ui.mjs`）へ、手動Stars/Flags/Tags/Segmentsとフィルタを接続する。`smart-culling-project.mjs` は計算・表示用に利用し、サーバーの所属証拠なしで `createManualCullingProject` を呼ばない。保存中・失敗・競合・権限失効を区別し、再読込後の一致を確認。匿名BrowserLocalの変更をCloud保存と表示しない。
5. **公開Trialへは別Gateを設ける。** 現行Cloudflare D1にProject概念がないため、Node経路だけでは公開Webで永続化しない。Trial専用Projectを許すなら、`apps/sites/db/schema.ts` と次の追加 migration（既存 `0000`–`0003` を書換えない）に tenantスコープのProject/Project-Asset所属とculling表を追加し、`apps/sites/src/worker.mjs` に現在の認証・期限・失効を毎回確認するAPIを追加、`TrialClient`/`SitesClient` を結ぶ。既存全Assetを無断で一Projectへ帰属させない。複数会員が共有する真のWorkspaceは現在の `trial-{memberId}` モデルでは表現できず、別のmembership/permission設計が先に必要。D1 migrationとCloud配備はこの文書では実行しない。

## 完了を判定する試験

- Node SQLite/HTTP: 別Workspace・別Project・別人・VIEWERのStars更新・期限/権限失効を拒否。正当な読取とCAS更新、並行version競合、Segmentの一Asset一所属、タグ重複/上限、削除・復元後の見え方、DB再起動後の一致を検証。選択は既存APIとの二重正本を作らない。
- Asset/Recipe安全: Original key/SHA/bytes、Recipe head/immutable history、Preset、R2をCulling操作で変更しない。Asset追加時は初期値、trashed Project/Assetは通常一覧から消す。削除前の印を復元時に戻すか破棄するかは明示ポリシーとして固定する。
- Browser: 実の認証経路でProjectを選び、Stars/Flags/Tags/Segmentsを保存→再読込→他端末相当の再取得で確認。サーバー409/403時に古い値を「保存済み」と表示しない。キーボード・フォーカス・タッチと大きい一覧のページ分割も確認。
- Cloud Trial: 追加D1 migrationの適用後に実認証でtenant分離、期限・失効、D1再読込、競合、Soft delete、Cloudflare Worker起動を別途実測する。Node/合成試験だけではCloud PASSにしない。

## AI 自動選別との差

現行の手動フィルタは写真の良否・重複・表情・ピントを推論しない。元候補 `EV3-0894 Smart Culling` のAI部分には、許諾と人物/顔処理のFeature Gate、画像解析モデルと版固定、類似/連写クラスタリング、品質・表情/ピント等の判定根拠と信頼度、手動Overrideの非破壊保存、実写真での精度/誤判定評価、権限付き非同期Jobと失敗時再開が別途必要。これらが未接続の間、Stars/Flags/Tags/Segmentsの永続化を「Smart Culling完成」とは呼ばない。
