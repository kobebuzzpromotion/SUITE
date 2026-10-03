# SUITE Workspace / Team Collaboration / Cloud Storage 追加実装指示書
# 1/3：Workspace・Team Collaboration

既存147節、固定6文書、NON-DESTRUCTIVE原則、RAW原本不変、Proxy編集、Recipe分離保存、Cloud Safe、既存保存・同期契約、Mobile Release First方針を変更せず、以下を正式追加仕様として統合すること。

今回の追加は既存仕様の置換ではない。既存要件を削除・要約・簡略化せず、追加仕様としてトレーサビリティへ登録すること。

初期製品の最優先対象はiPhone / iPadとする。Web版完成をMobile Releaseの条件にしない。ただしWorkspace、権限、Cloud Storage等の共通データモデルは将来のWeb / Mac / Windows追加を妨げない構造にする。


==================================================
1. WORKSPACE
==================================================

個人利用とは別に「Workspace」を正式実装対象とする。

主対象：

- 写真館
- 撮影スタジオ
- 制作会社
- ブライダル撮影会社
- 学校写真事業者
- 複数カメラマンのチーム
- 法人撮影部門

1ユーザーが複数Workspaceへ所属できる構造にする。

例：

田中個人
KOBE BUZZ STUDIO
Wedding Team A

を同一アカウントから切替可能にする。

Workspaceごとに以下を完全分離する。

- Projects
- RAW Assets
- Proxy
- Edit Recipes
- Presets
- Generated Assets
- Client Galleries
- Storage usage
- Members
- Permissions
- Audit logs
- Billing / Entitlements
- Export history

他WorkspaceのRAW、Proxy、Recipe、Preset、Storage metadataを参照できてはならない。


==================================================
2. MEMBER / ROLE
==================================================

最低限以下のRoleを設ける。

OWNER
ADMIN
EDITOR
VIEWER

OWNER：

- Workspace所有
- Billing管理
- Storage Plan変更
- Member追加・削除
- Role変更
- Project削除
- Workspace削除
- Preset管理
- Export
- Cloud Storage管理

ADMIN：

- Member管理
- Project管理
- Preset管理
- Gallery管理
- Export
- 編集

ただしWorkspace削除、所有権移転、最上位Billing変更等はOwnerのみ。

EDITOR：

- RAW閲覧
- Proxy閲覧
- Edit
- Recipe保存
- Crop
- Retouch
- Select
- Export
- Preset利用

Member管理・Billing変更は禁止。

VIEWER：

- 閲覧
- セレクト
- 必要に応じてコメント

編集、削除、Export等はPermissionで制御。

Roleだけで足りない場合に備え、将来Fine-Grained Permissionへ拡張できる構造にする。


==================================================
3. WORKSPACE INVITATION
==================================================

Owner / Adminがメンバーを招待可能にする。

最低限：

- Email invitation
- Invitation expiry
- Pending
- Accepted
- Revoked

を管理。

同一ユーザーを重複登録しない。

招待URLから別Workspaceの権限を取得できないようTenant境界を厳格にする。


==================================================
4. SHARED PROJECT
==================================================

Workspace内では複数スタッフが同じ撮影案件を扱える。

例：

カメラマンA
→ 撮影・RAW upload

スタッフB
→ Selection

レタッチ担当C
→ AI補正・色調整

Owner
→ Final確認・Export

すべて同一Project上で行えるようにする。


==================================================
5. NON-DESTRUCTIVE TEAM EDITING
==================================================

チーム編集でもRAW原本を変更してはならない。

全編集はRecipeとして保存する。

Recipeには最低限：

- recipe_id
- project_id
- asset_id
- workspace_id
- editor_user_id
- created_at
- updated_at
- version
- parent_version
- edit parameters
- crop
- color
- person retouch
- body retouch
- Session Look
- Export-related settings

を保持可能にする。


==================================================
6. EDIT CONFLICT
==================================================

同じ写真を複数人が同時編集した際に、後から保存した人が無条件に上書きする実装は禁止。

最低限：

- Base version
- Current version
- Editor
- Timestamp

を比較する。

競合時：

A. 相手の変更を保持
B. 自分の変更を別Versionとして保持
C. 差分を確認

できる構造にする。

RAW原本は競合対象ではない。


==================================================
7. EDIT HISTORY
==================================================

誰が何を変更したか追跡可能にする。

例：

09:31 Tanaka
Exposure +0.30

09:34 Staff A
Skin 12 → 17

09:38 Staff B
Crop 3:2 → B0倍

最低限：

- User
- Date/time
- Asset
- Changed field
- Previous value
- New value

を追跡できる構造を用意する。

すべての細かいUI履歴を永久保存する必要はないが、業務上必要なVersionと監査情報は失わないこと。


==================================================
8. SHARED PRESET
==================================================

Presetは以下に分類する。

PERSONAL
WORKSPACE
COMMUNITY

WORKSPACE Presetは所属スタッフ全員が利用可能。

例：

KOBE PHOTO STUDIO
七五三 STANDARD

Wedding HIGH KEY

成人式 FLOWER

証明写真 STANDARD

等。

店舗内の仕上がりを統一できることを目的とする。


==================================================
9. PRESET PERMISSION
==================================================

Workspace Presetについて：

Owner / Admin
→ 作成・更新・削除可能

Editor
→ 使用可能
→ 権限がある場合のみ作成可能

Viewer
→ 原則閲覧のみ

削除したPresetを使用している過去Recipeが壊れないよう、Recipe側には適用値を固定保存すること。


==================================================
10. SHARED CLIENT GALLERY
==================================================

Workspace ProjectからClient Galleryを発行可能にする。

担当スタッフが異なっても同じGalleryを扱える。

Galleryには最低限：

- Workspace
- Project
- Owner
- Published by
- Published date
- Selected images
- Download permission
- Client selection
- Expiry optional

を保持。


==================================================
11. WORKSPACE AUDIT LOG
==================================================

最低限以下を記録する。

- Login
- Member invitation
- Role change
- Project create
- Project delete
- Asset delete
- Recipe save
- Export
- Gallery publish
- Storage plan change
- Billing-related changes

写真館等の業務利用を想定し、「誰が操作したか」を追跡できるようにする。


==================================================
12. TEAM MOBILE UX
==================================================

iPhone / iPadからWorkspaceを扱えること。

Workspace機能をWeb専用にしてはいけない。

iPhone：

- Workspace切替
- Project一覧
- Upload
- Select
- Edit
- Export

を優先。

iPad：

- Project一覧
- 大画面編集
- Member状態
- Shared presets
- Batch processing

を使いやすくする。

PC/Web版を完成させるまでWorkspaceを利用不能にしてはいけない。


==================================================
13. WORKSPACE RELEASE GATE
==================================================

最低限以下を試験する。

- Workspace作成
- Owner
- Admin
- Editor
- Viewer
- Invitation
- Role変更
- Workspace切替
- Shared Project
- Shared Preset
- Recipe共同編集
- Edit conflict
- Version保持
- Project isolation
- Workspace isolation
- Unauthorized access拒否
- Member削除後アクセス拒否

未実施はPASSにしない。

NOT_RUN理由、必要環境、次の試験手順を記録する。
