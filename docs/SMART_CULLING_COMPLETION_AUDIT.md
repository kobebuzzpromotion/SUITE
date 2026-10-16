# EV3-0894 Smart Culling — 完了判定監査（2026-10-04）

**結論: NOT_COMPLETE。** 現在のSUITEは、手動の選択状態計算とNode WorkspaceにおけるStars/Flags/Tags/Segmentsの認証付き保存を持つ。しかし、公開Trial/Cloudの製品Editorからその保存先へ到達する経路、元候補のAI解析・自動選別、実RAWでの品質検証はない。手動マーク保存を「Smart Culling完成」と数えない。

照合元はリポジトリの [`EVOTO_FEATURE_MASTER.md`](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md) のEV3-0894〜EV3-0920、および[Evoto公式 Culling & Organization](https://support.evoto.ai/smart-culling/)（2026-10-04確認）。比較製品の挙動はSUITEの実装済み証拠ではない。既存の [`SMART_CULLING_PERSISTENCE_PLAN.md`](SMART_CULLING_PERSISTENCE_PLAN.md) は実装前調査であり、「Nodeに表/APIなし」という記述は現在は古い。

## 実在するSUITE経路

| 層 | 現在の実装と確認済み試験 | 境界 |
| --- | --- | --- |
| 手動状態 | `apps/web/src/smart-culling-project.mjs` はProjectの明示Asset集合に対する選択、Stars 0–5、Flags、色ラベル、写真ごとのTags、Segments/Unassigned、AND/ORフィルタを不変データで計算する。`apps/web/tests/smart-culling-project.test.mjs` が純粋処理を試験。 | 入力Assetの実Project所属、本人権限、永続化、AI解析はこの部品だけでは証明しない。 |
| Node Workspace正本 | `apps/backend/src/workspace.ts` の `ws_culling_heads/marks/segments/assignments` はWorkspace/Project/Assetを結び、Project版CAS、ロール、soft-trash、監査を扱う。既存 `ws_selections` は別の正本。`apps/backend/tests/workspace-culling.test.ts` がSQLite再起動、403/409、所属と改変拒否を試験。 | NodeのWorkspace SQLiteであり、公開Cloudflare D1ではない。選択とマークは単一UI/transactionに統合されていない。 |
| Node HTTP/Web部品 | `apps/backend/src/workspace-server.ts` の認証済みCulling API、`apps/web/src/workspace-culling-client.mjs`、`workspace-culling-panel.mjs`、`workspace-culling-verified-mount.mjs` がある。既存Web試験は実JWT HTTP/SQLiteとhost注入境界を扱う。mountは信頼済みhostによるbearerと選択Scopeを要求し、現PanelのSegment作成に合わせOWNER/ADMINに限定する。 | 現製品 `bootstrap.mjs`/`editor-ui.mjs`/`author-ui.mjs` にmount呼出しがない。外部hostの本人・Project/Asset選択UIを製品が提供していない。PanelはStars/Flags/Tags/Segment追加・所属のみで、色ラベル/手動選択/Segment改名・並替・一覧フィルタは画面操作未接続。 |
| 公開Trial/Cloud | `TrialClient`、`SitesClient`、`apps/sites/src/worker.mjs`、`apps/sites/db/schema.ts` にCulling API/表/Project選択経路がない。 | Node Workspaceの成功を公開Trial、D1、共有Workspaceの成功に転用できない。Cloud資源やmigrationは今回変更していない。 |

## 元候補の下位操作との対応

| 元ID・操作 | SUITEの到達点 | 未接続・未実装 |
| --- | --- | --- |
| EV3-0894 Project-only | NodeはProject/Asset所属で手動マーク保存。 | 製品Project Culling画面、Start Smart Culling、Project全体の解析Jobなし。 |
| EV3-0895〜0901 Stories/Storyline/General/Manual/Segments/Unassigned/Segment filter | 手動SegmentのDB定義・所属、純粋AND/OR Segment filter。Panelは追加と所属のみ。 | Storyline/Generalの自動構成、Story画面、改名/並替・各表示面のSegment filter、Segment別Export/Cloud/Slide deliveryなし。 |
| EV3-0902〜0904 Stars/Flags/Color labels | Node保存と純粋処理。PanelはStars/Flagsのみ。 | 色ラベルの画面設定、製品Trial/Cloud保存、Culling実行中の手動操作停止なし。 |
| EV3-0905〜0910 Quality/Faces/Face Focus/Eye/Expression/Face focus score | なし。 | 顔/眼/表情/ぼけ/露出の許諾付き解析、顔中心表示、根拠と信頼度、品質フィルタが必要。既存の顔補正や手動マークをAI判定と同一視しない。 |
| EV3-0911〜0913 Photo Cluster time/Duplicates/Faces | なし。 | 撮影時刻の出所検証、類似度・人物のクラスタリング、best候補のスコアと表示が必要。 |
| EV3-0914 Search by Text | なし。 | 画像意味解析、索引、関連度検索、バックグラウンド増分解析なし。 |
| EV3-0915 Custom Tags | 写真ごとの手動TagsをNodeで保存・Panelで編集。 | 公式のaccount跨ぎ再利用・同期、複数写真への一括付与、製品UI/Cloud接続なし。写真metadataへ書かない現契約は維持。 |
| EV3-0916〜0918 Quick/Custom・Best Picks limits・AND/OR filters | 手動データに対する純粋AND/ORだけ。 | Quick/Custom解析設定、総数/cluster別の自動Best Picks、品質・顔・意味条件との複合フィルタUIなし。 |
| EV3-0919 XMP marks | なし。 | 明示権限・元ファイル非破壊方針を保ったsidecar契約、書出し/再読込と実互換試験なし。 |
| EV3-0920 Background analysis | なし。 | 解析Job・進捗・取消/再開・増分import・停止中の編集ロック・結果の版/出典固定なし。 |

## 小さく通せる次の製品経路とGate

Node Workspaceの**手動**Cullingなら、新規hostが本人のJWT/tenant/roleと明示Workspace→Project→Asset選択を提供し、既存`mountVerifiedWorkspaceCulling`をそこへmountする経路が最小。新規実ブラウザ試験では、host UIの選択→Stars/Flags/Tags/Segmentを保存→再起動後読込、別Project/Viewer/失効/409/選択切替/通信取消を実HTTP/SQLiteで確認する。Panelに無い色ラベル・選択・Segment改名/並替/フィルタは別UI差分として残す。公開Trialへの転用は、D1のProject所属・Culling表/route、期限/本人/tenant境界と実Cloud試験を別に要する。

AI Smart Cullingはさらに、人物/画像解析の同意とFeature Gate、実RAW/大量Projectでのモデル品質評価、クラスタ・スコア・説明可能な結果、手動Override、版固定・Job再開/取消・プライバシー・誤判定QAを必要とする。現時点では**AI自動選別 = NOT_IMPLEMENTED**、**公開製品導線 = NOT_CONNECTED**。44独立候補の完了数は増やさない。
