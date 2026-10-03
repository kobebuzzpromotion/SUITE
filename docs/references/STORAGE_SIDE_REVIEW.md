# SUITE Cloud / Proxy / RAW / Sync / Cache / Export 設計ノート

Status: **独立提案・非正本・実装未着手**  
作成日: 2026-10-03  
対象: Cloud Storage Architecture / Proxy Strategy / RAW lifecycle / Offline-Sync / Cache eviction / Export pipeline

## 0. 担当境界と調査結果

このノートは、既存SUITE checkoutを変更せず、親担当が正本へ統合する前のレビュー用契約案をまとめたもの。コード、既存docs、Git branch、commit、deployは変更しない。

読み取り対象は `SUITE/AGENTS.md`、`docs/OWNERSHIP.md`、`SUITE_SPEC.md`、`MOBILE_OVERRIDE.md`、`MOBILE_RELEASE_FIRST.md`、`TRACEABILITY.md`、`ARCHITECTURE.md`、`CONTRACTS.md`、`PHOTO_ARCHITECTURE.md`、`FINAL_AUDIT.md`、現行 `METISMobileCore`。現行checkoutは未commitで、すべてuntracked。実装中の固定担当は次の通り。

| 既存担当 | 所有範囲 | このノートから触れないもの |
| --- | --- | --- |
| editing_storage | `packages/METISMobileCore/**`, `packages/SuiteCore/**` | Core実装、既存ProxyPolicy/JobCheckpointの変更 |
| release_requirements_review | `apps/apple/Suite/Features/iPhone/**` | iPhone UI |
| ipad_ui | `apps/apple/Suite/Features/iPad/**` | iPad UI |
| policy_review | `docs/REUSE_AUDIT.md`, `docs/FINAL_AUDIT.md` | 監査結果 |
| メイン | 上記以外 | 正本、共有契約、backend、provider接続、統合、build/test |

したがって、この作業の独立範囲は、既存 `PHOTO_ARCHITECTURE.md` の原則を変更せず、未具体化の状態遷移、API/スキーマ案、iOS中断条件、1枚単位コスト式、測定ゲート、失敗系受入試験を定義することだけとする。共有契約の採用・実装はメインの承認後。

未確認事項:

- checkout内および上位に `.agents/skills` と `memory_summary.md` は見つからなかった。
- ユーザー添付テキストは取得時の権限エラーで全文未確認。会話内の明示指示とcheckoutの正本を優先している。
- Camera SDK、対応機種、推奨ケーブル、テザー実機、RAW decoder範囲、最低OS、Storage/DB vendor、独立backup providerは未決定。
- iOS/iPadOSのnative build、実機background、ロック、容量不足、熱、メモリ試験は未実施。

## 1. 固定する不変条件

1. クラウドでCloud SafeになったOriginal RAWを正本とし、Originalはimmutable。派生物の出力先としてOriginal keyを再利用しない。
2. Original / Thumbnail / Proxy / Preview / Recipe / Generated Asset / Exportを別object、別version、別lifecycleとして扱う。
3. 通常の一覧・選択・編集はThumbnail/Proxy/Preview＋Recipeで行い、Originalは明示目的のある対象Assetだけ取得する。容量プラン変更を全RAW端末同期のtriggerにしない。
4. Cloud Safeは「upload、checksum、server verification、persistence verification、DB commit、complete」の全段階と、checksum/object/metadata/permissionの全証拠が同じobject versionに揃った時だけ成立する。
5. 未同期Original、Recipe、同期outbox、upload/export台帳をiOSのCaches/tmpへ置かない。OS削除可能領域には再取得・再生成可能な派生物だけを置く。
6. iOS background実行は機会であって完走保証ではない。ユーザーがアプリスイッチャーから強制終了した場合、background URLSession転送はcancelされ自動再起動されない前提で、次回ユーザー起動時に永続台帳から安全に再開する。
7. 競合はCASで拒否し、last-write-winsで他端末の編集を消さない。同一idempotency keyはpayload hashまで照合する。
8. Originalが取得・検証できないExportは `waiting_for_original` または明示的な失敗。ProxyをFinalへ暗黙fallbackしない。
9. 30日/90日経過を理由にクラウドOriginalを自動物理削除しない。Trashと物理purge、端末cache解放とcloud deleteを分離する。
10. Workspace権限を各APIと署名URL発行時にserverで再評価する。端末に残るbadge、古いURL、クライアントbooleanを認可根拠にしない。
11. Proxyは端末内だけに閉じずクラウドへ保存する。別の認可端末はOriginalを取得せず、クラウドProxy＋Recipeを先に取得して一覧・通常編集を開始できる。

### 1.1 Original / Proxy / Recipeの固定3層

| 層 | 正本性と配置 | 用途 | 再生成 |
| --- | --- | --- | --- |
| Original RAW | Cloud Safe後のクラウドobjectが唯一の正本。端末上はupload前の保護対象または検証済みcache | Final、高精度処理、再現像 | 不可。immutable |
| Proxy | クラウドにimmutable versionとして保存し、利用端末にもcache | 一覧、選択、通常編集、Preview基材 | Original＋proxy pipeline versionから可能 |
| Recipe | serverのrevision履歴が同期正本。端末にlocal draft/outboxを永続化 | 非破壊編集値、Undo/Redo、端末間継続 | 履歴から復元可能 |

取込端末はOriginalのlocal verification後にProxyを生成し、Original uploadとは別object/sessionでクラウドへ送る。OriginalのCloud SafeとProxy availableは別gateとし、Proxy upload成功だけでOriginalをCloud Safeにしない。別端末はasset metadata、Thumbnail/Proxy、Recipe headを先に取得し、Original GETを行わない。Proxy欠落時のserver-side再生成を採用するかはprovider/compute PoCで決めるが、通常閲覧を理由に各端末へRAWを配布しない。

## 2. 一貫した状態遷移

### 2.1 Original lifecycle

```text
importing
  -> local_verified
  -> upload_queued
  -> uploading
  -> uploaded_unverified
  -> cloud_safe
  -> local_release_eligible

any non-final upload state -> upload_paused | upload_retryable | upload_blocked
active -> trashed -> restored
trashed -> purge_requested -> purge_blocked | purged
```

| 状態 | 必須証拠 | 許される操作 |
| --- | --- | --- |
| `importing` | staging file、source descriptor | append、abort。Asset完成表示は禁止 |
| `local_verified` | byte size、whole SHA-256、durable local URL | Proxy生成、upload enqueue |
| `uploading` | upload session、part manifest、各part digest | file-based part送信、resume/reconcile |
| `uploaded_unverified` | provider object/version | server verificationのみ。local Original解放禁止 |
| `cloud_safe` | CloudSafetyAttestation | 認可端末からon-demand GET可能 |
| `local_release_eligible` | cloud_safe＋local policy＋no pin＋再認可/再検証 | 端末コピーのみ解放可。cloud objectは削除しない |
| `trashed` | tombstone revision、actor、timestamp | UI非表示、restore。即時物理削除禁止 |
| `purged` | owner-authorized purge、参照/hold/retention確認、audit | metadata tombstoneを保持し、object消滅を確認 |

`cloud_safe` は過去の永久badgeではない。新しい取得URL発行、local解放、purge判定ではworkspace権限、object version、attestationの対象一致を再確認する。

### 2.2 Proxy / Preview lifecycle

```text
missing -> queued -> generating -> available
available -> stale_recipe | stale_pipeline | evicted
stale_* | evicted -> queued
generating -> suspended | failed_retryable | failed_terminal
```

Proxy identityは少なくとも `(asset_id, original_sha256, proxy_profile_id, proxy_pipeline_version)`。Preview identityはこれに `(recipe_revision, job_generation)` を加える。遅延結果は現在選択中のidentityと一致する時だけ表示する。

Proxyの長辺、codec、quality、色空間は固定仕様ではなく `proxy_profile_id` でversion化し、§11の測定ゲートを通す。既存 `ProxyPolicy` の候補集合とresource判定を利用し、ここで別policyを実装しない。

### 2.3 Sync operation lifecycle

```text
pending_local -> eligible -> sending -> acknowledged
                     |          |
                     |          -> conflict | auth_blocked | terminal_error
                     -> network_wait | background_suspended | retry_wait
```

永続outbox itemはacknowledgedまで削除しない。server response消失後は同じoperation IDとpayload hashで照会・再送する。`auth_blocked` は無限network retryせず再認証を待つ。

### 2.4 Export lifecycle

```text
draft -> snapshotted -> waiting_for_original -> verifying_original
      -> waiting_for_dependency -> rendering -> encoding -> validating
      -> publishing -> completed

non-final -> suspended_resource | suspended_background | retry_wait
non-final -> failed_retryable | failed_terminal | cancelled
```

`snapshotted` 以後、asset、Original checksum/version、Recipe revision、decoder/version、color pipeline/version、output settings、Canonical Generated Asset、Identity Gate evidenceを差し替えない。新編集は新しいExport jobにする。

## 3. Objectとmetadataの責務

### 3.1 Object key（論理形）

```text
workspaces/{workspace_id}/assets/{asset_id}/original/{object_version}
workspaces/{workspace_id}/assets/{asset_id}/proxy/{proxy_object_id}
workspaces/{workspace_id}/assets/{asset_id}/generated/{generated_object_id}
workspaces/{workspace_id}/exports/{export_job_id}/{export_item_id}/{output_version}
```

keyへ元filename、email、人物名を入れない。Recipeはtransactional metadataを正とし、必要ならimmutable snapshot objectを別途持つ。bucket listingを認可や一覧DBの代用にしない。

### 3.2 最小論理スキーマ案

型は実DB採用前の言語中立契約。すべてのworkspace所属rowは `workspace_id` を持ち、server-side tenant filterを必須とする。

| entity | 主要field / constraint |
| --- | --- |
| `workspaces` | `id`, `status`, `storage_plan_id`, `created_at` |
| `workspace_memberships` | `(workspace_id,user_id)` unique, `role`, `permission_version`, `revoked_at` |
| `assets` | `id`, `workspace_id`, `state`, `original_filename`, `captured_at`, `trash_revision`, `created_by` |
| `object_versions` | `id`, `workspace_id`, `asset_id`, `kind`, `provider_ref`, `immutable_key`, `provider_version`, `bytes`, `sha256`, `content_type`, `state`; `(provider_ref,immutable_key,provider_version)` unique |
| `cloud_safety_attestations` | `original_object_version_id` unique, `checksum_verified_at`, `object_verified_at`, `metadata_committed_at`, `permission_verified_at`, `verifier_version`, `invalidated_at` |
| `upload_sessions` | `id`, `asset_id`, `expected_bytes`, `expected_sha256`, `part_size`, `provider_upload_id`, `state`, `expires_at`, `idempotency_key`, `request_hash` |
| `upload_parts` | `(upload_session_id,part_number)` unique, `offset`, `length`, `sha256`, `provider_etag`, `state` |
| `recipe_revisions` | `(asset_id,revision)` unique, `parent_revision`, `schema_version`, `recipe_json`, `recipe_sha256`, `editor_user_id`, `operation_id`, `created_at` |
| `sync_operations` | `operation_id` unique, `workspace_id`, `device_id`, `entity_id`, `base_revision`, `payload_sha256`, `state`, `result_revision`, `error_code` |
| `export_jobs` | `id`, `workspace_id`, `requested_by`, `state`, `settings_json`, `settings_sha256`, `created_at` |
| `export_items` | `id`, `job_id`, `asset_id`, `original_object_version_id`, `recipe_revision`, `recipe_sha256`, `decoder_id/version`, `color_pipeline_version`, `profile_digest`, `canonical_asset_ids`, `state`, `error_code`, `output_object_version_id` |
| `job_checkpoints` | `(job_id,item_id,stage)` unique, `completed_units`, `input_manifest_sha256`, `checkpoint_ref`, `updated_at` |
| `asset_tombstones` | `asset_id`, `trash_revision`, `trashed_by`, `trashed_at`, `purge_requested_at`, `purged_at`, `hold_reason` |
| `audit_events` | append-only `id`, `workspace_id`, `actor`, `action`, `target`, `request_id`, `occurred_at`, `result` |

端末ローカルにはserver schemaとは別に `local_objects`、`cache_entries`、`outbox`、`upload_journal`、`download_journal`、`export_checkpoints` を持つ。`durability_class` を `critical_local` / `reconstructible_cache` に分ける。

### 3.3 Provider境界

```text
StorageProvider
  beginMultipart(intent) -> ProviderUpload
  putPart(fileURL, range, checksum, upload) -> PartReceipt
  inspectImmutableObject(ref) -> ObjectFacts
  verifyChecksum(ref, expectedAlgorithm, expectedDigest) -> VerificationEvidence
  issueScopedRead(ref, subject, purpose, ttl) -> ScopedRead
  readRange(ref, range, destinationFile) -> DownloadReceipt
  abortMultipart(upload)
  deleteVersion(ref, purgeAuthorization)
```

`purpose` は `proxy_view | final_export | high_precision | redevelop | recovery_verify`。Original readは後4つのみ。ProviderのETagをSHA-256と同一視しない。Providerに必要なchecksum primitiveがなければ、server verifierがobjectをstream readしてSHA-256を検証するまでCloud Safeにしない。

## 4. 再開可能upload / download

### 4.1 Upload protocol

1. 端末の永続領域へOriginalを確定し、whole SHA-256とbyte sizeを計算する。
2. `POST /v1/assets/{asset_id}/original-upload-intents` にsize/hash/idempotency keyを送る。
3. serverは同じkey＋同じrequest hashなら既存sessionを返し、同じkey＋別本文は `IDEMPOTENCY_MISMATCH`。
4. file-based partを番号、offset、length、SHA-256付きで送る。iOS background URLSessionへData/stream bodyを渡さない。
5. app再起動時、serverの受領part manifestとlocal journalを照合し、欠落partだけ再送する。
6. `POST .../{upload_id}:finalize` は全part、size、whole hashを照合し、provider complete後にserver verificationを行う。
7. object保存後DB commitが失敗してもlocal Originalとjournalを残す。finalizeの冪等再実行で同じobject versionへ収束させる。
8. Cloud Safety証拠が揃ってから `cloud_safe` を返す。

iOS 17+のresumable upload APIを使う場合もserver protocol対応を別gateにする。任意の単一PUTを「バイト位置から必ず再開可能」と仮定しない。background sessionは少数にし、partを無制限登録しない。

DownloadはRangeまたはprovider SDKの再開機構をadapterで選ぶ。途中fileはjournalとexpected hashに結び付け、完了後whole SHA-256一致時だけOriginal cacheへatomic renameする。URLSession callbackが渡す一時download fileはcallback完了前に永続先へ移す。resume dataが無い/無効でも、同じinput identityで安全に再取得できること。

### 4.2 iOS lifecycle契約

| event | 契約 |
| --- | --- |
| 通常background / OS termination | OSが許す範囲でbackground session継続。completion handlerで台帳更新 |
| ユーザー強制終了 | 自動再起動・継続を期待しない。次回明示起動でjournal reconcile |
| 再起動後・初回unlock前 | 保護classで読めない台帳/原本は待機。破損扱いしない |
| 再lock | 選定したfile protection policyに従う。Originalとjournalの整合を崩さない |
| BGProcessing | 開始時刻・完走を保証しない。expirationでcheckpointして終了 |
| iOS/iPadOS 26+ continued processing | 前景でユーザーが開始した長時間Export候補。自動同期用に流用せず、supported resourcesとentitlementをruntime確認 |

## 5. Offline-Syncと競合

### 5.1 Recipe mutation API案

```http
PUT /v1/workspaces/{workspace_id}/assets/{asset_id}/recipe-revisions/{next_revision}
If-Match: "recipe-{base_revision}-{base_sha256}"
Idempotency-Key: {operation_id}
Content-Digest: sha-256=...
```

成功は `201 {revision, recipe_sha256, committed_at}`。baseが古い場合は `409 RECIPE_CONFLICT` とcurrent head metadataを返し、local draft/outboxは保持する。自動mergeは共通ancestorがあり、互いに変更したRecipe pathが非重複で、schemaが同一の場合だけ提案可能。適用前にユーザーへ差分を示し、同じparameter、crop、orientation、mask、person binding、生成asset参照の競合は明示解決する。

### 5.2 Workspace権限

Role名だけでlogicを固定せずpermissionで判定する。

- `asset.proxy.read`
- `asset.original.read`
- `recipe.read`, `recipe.write`
- `export.create`, `export.download`
- `asset.trash`, `asset.restore`, `asset.purge`
- `workspace.member.manage`

Owner/Editor/Viewerへの割当は製品決定が必要な**提案**。安全側の初期案はOwner=全権、Editor=Original read/Recipe write/Export可だがpurge/member管理不可、Viewer=Proxy readのみでOriginal/Exportは明示grant時だけ。membership revoke時は未使用署名URLだけでなく、upload/download sessionと次のAPI callも拒否し、端末側は `auth_blocked` にする。

## 6. Cache evictionと容量不足

### 6.1 保存class

| class | 例 | OS削除可能領域 | eviction |
| --- | --- | --- | --- |
| `critical_local` | Cloud Safe前Original、Recipe/outbox、upload/export journal | 不可 | 自動削除不可 |
| `protected_working` | 実行中Original、編集中Proxy、Canonical Generated Asset | 不可またはpin領域 | pin解除後に再評価 |
| `reconstructible_cache` | Thumbnail、Proxy、Preview、検証済み再取得可能Original copy | Caches可 | quota＋LRU |
| `published_output` | ユーザー保存済みExport | ユーザー選択先 | cache cleaner対象外 |

大容量で再取得可能な永続fileはiCloud/device backup除外を検討するが、backup exclusionはCloud Safeや独立backupの代替ではない。

### 6.2 Eviction algorithm契約

1. `available_capacity` と予約領域を再計測する。
2. candidateは `reconstructible_cache && pin_count==0 && active_lease==0` のみ。
3. 優先順はexpired Preview → Thumbnail/Proxy LRU → Cloud Safeかつpolicy許可済みのlocal Original copy。
4. plan作成後、削除直前にversion、pin、lease、Cloud Safety、permissionを再確認する。
5. atomic unlink後にcache indexを更新。失敗を空き容量獲得として数えない。
6. 必要量に達しなければ `INSUFFICIENT_LOCAL_STORAGE` を返し、未同期Originalを犠牲にしない。

Import開始前に `source bytes + staging overhead + minimum proxy/export reserve` を測定する。仮の倍率はRemote Configへ置かず、端末/formatごとのpeak計測から決める。Tether中に不足が見込まれる場合はbackpressure、撮影停止要求または明示警告を出し、受領していない撮影を保存済みと表示しない。

## 7. Export pipeline

### 7.1 Snapshot manifest

Export item開始時に次をimmutable manifestへ固定する。

```json
{
  "asset_id": "...",
  "original_object_version_id": "...",
  "original_sha256": "...",
  "recipe_revision": 12,
  "recipe_sha256": "...",
  "raw_decoder": {"id": "...", "version": "..."},
  "color_pipeline_version": "...",
  "input_profile_digest": "...",
  "working_space_id": "...",
  "output_profile_digest": "...",
  "canonical_generated_assets": [],
  "output": {"format": "jpeg|tiff", "pixel_width": 0, "pixel_height": 0, "ppi": 300, "quality": 0.0, "naming_template_version": "..."}
}
```

上の数値はschema形状の例で、pixel、PPI、qualityの既定値を確定しない。Profileが指定され、encoderが埋込み/変換を保証できない場合は黙ってsRGB等へ置換せず `UNSUPPORTED_COLOR_PROFILE`。RAW decoderはruntimeで対象カメラ/decoder可否を確認し、未対応を成功扱いしない。

### 7.2 実行段階

1. request時のworkspace permissionとquotaを確認。
2. manifestをhashし、job/itemに固定。
3. local Originalがあればhash照合。なければ対象1枚だけscoped GET。
4. Original、Recipe、mask、Canonical asset、Identity evidenceを検証。
5. decoder/color pipelineへimmutable manifestを渡す。
6. memory budget内のtile/strip処理でrender。並列数は端末resourceで制限する。
7. attempt固有temp fileへencode。
8. format、dimensions、ICC/profile、byte length、decode sanityを検証。
9. outputをatomic publishし、object version/checksumを記録。
10. `completed` はpublish/検証後のみ。Share/Photos saveは別結果として記録。

Memory pressure、thermal、low battery、background expirationではcheckpoint可能な境界で停止する。並列数やtile sizeを下げても、固定manifestの色/Recipe/出力寸法を勝手に変えない。資源不足なら `suspended_resource`。Batchはitem単位に結果を持ち、一部失敗をjob全件成功にしない。

書き出し時に途中Recipe変更があっても既存jobは固定版を続行する。最新編集を書き出すには新jobを作る。cancel後のtemp、orphan output、retryはjob IDとattempt IDで区別し、既存完成品を上書きしない。

## 8. API契約案

| endpoint | 目的 | 主要な安全条件 |
| --- | --- | --- |
| `POST /assets` | Asset予約 | workspace create権限、idempotency |
| `POST /assets/{id}/original-upload-intents` | multipart開始/復帰 | expected size/hash、payload照合 |
| `GET /uploads/{id}` | server受領part照会 | subject/workspace一致 |
| `POST /uploads/{id}:finalize` | 検証・Cloud Safe確定 | 全part＋whole checksum＋DB commit |
| `GET /assets/{id}/cloud-safety` | 証拠照会 | object versionとattestation返却 |
| `POST /assets/{id}/read-grants` | 短期read発行 | purpose、permission、object version固定 |
| `PUT /assets/{id}/recipe-revisions/{rev}` | CAS recipe更新 | If-Match、operation/payload hash |
| `POST /exports` | snapshot job作成 | manifest hash、permission、quota |
| `GET /exports/{job}` | item別状態 | tenant isolation |
| `POST /exports/{job}:resume` | 同じmanifestで再開 | input hash一致 |
| `POST /assets/{id}:trash` | 論理削除 | revision CAS、active job考慮 |
| `POST /assets/{id}:restore` | 復元 | tombstone revision CAS |
| `POST /assets/{id}:request-purge` | 物理削除要求 | owner/purge権限、hold/reference gate |

共通error code: `AUTH_REQUIRED`, `PERMISSION_REVOKED`, `REVISION_CONFLICT`, `IDEMPOTENCY_MISMATCH`, `CHECKSUM_MISMATCH`, `OBJECT_NOT_CLOUD_SAFE`, `ORIGINAL_UNAVAILABLE`, `NETWORK_WAIT`, `INSUFFICIENT_LOCAL_STORAGE`, `RESOURCE_SUSPENDED`, `UNSUPPORTED_RAW`, `UNSUPPORTED_COLOR_PROFILE`, `DEPENDENCY_MISSING`, `PURGE_BLOCKED`。

## 9. 削除・復旧・独立backup

- 端末cache解放、Workspace Trash、cloud physical purge、provider lifecycle、独立backup retentionは別policy/別API。
- 30日/90日は採用済みretentionではない。自動Original purge ruleを作らない。Trash表示期間を将来導入しても、明示契約、restore UI、通知、hold、active job、backup整合、監査を別gateにする。
- 5TB追加optionでもlifecycleは同じ。容量超過は新規uploadを止める/追加容量を案内し、既存Originalを無断削除しない。
- 主storageから独立したbackup候補（例: S3 Glacier Deep Archive）は、復旧時間、取り出し費、最小保存期間、request費、地域、暗号化、immutability、restore drillを比較してから採用する。主providerとの同一障害domainを「独立backup」と呼ばない。
- purgeは主object、version、replica、backup、metadata、derived assetsに対する完了/保留を追跡する。法的/契約上の保持がある場合は `PURGE_BLOCKED` と理由を返す。

## 10. 1枚単位のコストモデル

料金は2026-10-02/03時点の公開ページを参照した**比較用仮定**であり、vendor採用・契約・製品価格ではない。region、税、最低課金単位、free tier、Workers/CDN/compute/DB/backup/監視/サポートを別計上する。

### 10.1 変数

- `R`: Original GB
- `P`: Thumbnail/Proxy/Preview合計GB
- `G`: Generated Asset GB
- `E`: 任意保存Export GB
- `m`: 月内平均保存係数（常時1か月なら1）
- `A`: Class A相当request数（multipart create/parts/complete等）
- `B`: Class B相当request数（HEAD/GET等）
- `D`: 月間Original download GB。保存量とは独立に実測する
- `X`: backup GBおよびrestore GB

1枚の月額原価概算:

```text
primary_storage = (R + P + G + E) * m * storage_rate_per_GB_month
write_ops       = A * class_A_rate_per_request
read_ops        = B * class_B_rate_per_request
retrieval       = D * retrieval_rate_per_GB
egress          = D * billable_egress_rate_per_GB
backup          = X_storage * backup_storage_rate + X_restore * restore_rate + requests
total_per_asset = primary_storage + write_ops + read_ops + retrieval + egress
                  + backup + metadata_db + compute + observability + support allocation
```

保存量と月間書き出し量は独立変数。`D = R` や「1TB契約者が毎月1TB全量を書き出す」を基準値にしない。実測distribution（0回、多数の単枚、選択Batch等）をpercentileで持つ。

### 10.2 公開値を使った単枚例

**仮の写真**: `R=0.050 GB`（50MB）、`P=0.002 GB`、他派生物なし、1か月常時保存、月1回このOriginalをGET。これは料金式を示すだけで、平均RAW/Proxyサイズの製品仮定ではない。

| Provider | 公式掲載値 | 単枚概算（free tier前、税等除外） |
| --- | --- | --- |
| R2 Standard | storage `$0.015/GB-month`、Class A `$4.50/100万`、Class B `$0.36/100万`、direct egress `$0` | storage `(0.050+0.002)*0.015=$0.000780/月`; GET 1回 `$0.00000036`; upload requestは `A*0.0000045`。multipartのpart数でAが変わる |
| Backblaze B2 | `$6.95/TB/30日`、月平均保存量の3倍までegress無料、超過は `$0.01/GB`。公開ページではPAYGのClass A/B/C無料、Class Dは別料金 | decimal TB換算ならstorage `0.052*6.95/1000=$0.0003614/月`。この1枚だけを同月1回取得する0.05GBは3倍枠内という仮定ならegress `$0`。枠はaccount/月集計で再計算が必要 |

R2は1 requestではなく課金単位の切上げと月次free tierがあるため、単枚値の合計だけをinvoice予測に使わない。B2のTB/GB定義、region、transaction class、partner egress条件も見積時に固定する。

公式出典:

- Cloudflare R2 Pricing: https://developers.cloudflare.com/r2/pricing/ （storage、Class A/B、retrieval、egress、rounding）
- Backblaze B2 Pricing: https://www.backblaze.com/cloud-storage/pricing （`$6.95/TB/month`、3x free egress、overage、transactions）
- AWS S3 Pricing: https://aws.amazon.com/s3/pricing/ （Deep Archiveを含む候補比較。region/保存期間/retrieval条件を見積時に固定）

Supabase Pro `$25` 等の固定費を採用済みとしない。metadata/API/DBは、無料枠なしでの最小ユーザー数、active user、row/transaction、backup、egressを含む従量候補と比較する。契約・resource作成はこの設計の範囲外。

## 11. 測定ゲート（値を先に固定しない）

| gate | 測定対象 | 合格後に決める値 |
| --- | --- | --- |
| `PROXY_PROFILE` | 対象iPhone/iPad×RAW形式×100枚でscroll、zoom、編集latency、画質、memory、thermal | 長辺候補、codec、quality、色空間 |
| `UPLOAD_PART` | Wi-Fi/5G/回線切替/packet loss/background/強制終了 | part size、同時数、retry backoff、session数 |
| `LOCAL_QUOTA` | 端末容量別import/export peak、OS purge、100枚batch | cache quota、reserve、admission threshold |
| `EXPORT_MEMORY` | RAW decoder＋mask＋tile＋JPEG/TIFF encoder peak | tile size、concurrency、checkpoint粒度 |
| `COLOR_PIPELINE` | camera/profile/decoder/output profile別reference画像 | working space、bit depth、profile policy |
| `CLOUD_LATENCY` | 日本からsingle/multipart PUT、HEAD、Range/GET、100枚選択 | primary provider/region、timeout |
| `COST` | 実asset size、API count、GET GB、orphan、retry、backup restore | plan原価、100GB標準、5TBoption価格 |
| `RETENTION_RECOVERY` | Trash restore、provider version、backup restore drill | retention/restore SLA。30/90日自動削除は初期値にしない |

推奨ケーブル/テザーは、camera model、firmware、iPhone/iPad、OS、cable、hub/power、連続枚数、RAW transfer、disconnect recoveryのmatrixがPASSした組合せだけ表示する。現対応は未確認。

## 12. 失敗系受入試験

以下はunit testだけで合格にせず、adapter integration、sandbox provider、Apple実機を区別して証拠を残す。

| ID | 注入 | 期待結果 |
| --- | --- | --- |
| T01 | import途中で強制終了 | incomplete Assetを完成表示しない。source/stagingを保護し次回reconcile |
| T02 | upload part途中でnetwork断/切替 | 確認済みpartを再利用し欠落だけ再送。whole hash一致までCloud Safeにしない |
| T03 | アプリスイッチャーから強制終了 | background継続を期待せず、次回起動時に同じsession/idempotencyで収束 |
| T04 | OSによる終了 | background callbackまたは次回reconcileで収束。ユーザー強制終了と観測を区別 |
| T05 | 再起動後、初回unlock前 | file protection待ち。Original/台帳をmissing/破損に変更しない |
| T06 | device lock中 | 選択したprotection policyどおり。読めない場合安全にpauseしcheckpoint保持 |
| T07 | provider complete成功後に応答消失 | finalize再送で同じobject version/DB rowを返し二重課金・二重objectを作らない |
| T08 | object保存成功、DB commit失敗 | Cloud Safe false、local Original保持。孤立objectを再確定/回収可能 |
| T09 | 同じoperation IDで別payload | `IDEMPOTENCY_MISMATCH`、監査記録 |
| T10 | SHA-256不一致/同サイズ破損 | Cloud Safe/Export禁止、再送・再取得可能 |
| T11 | A/B端末が同じRecipe baseを編集 | 一方409。両方のdraftを保持し、無断last-write-winsなし |
| T12 | Viewer/失効memberがOriginal URL要求 | server拒否。古いbadgeやclient roleで突破不可 |
| T13 | signed URL発行後にmembership revoke | 次API/sessionは拒否。短TTL後URL失効。端末はauth_blocked |
| T14 | CachesをOSが消去 | Proxy再取得/再生成。Recipe/outbox/未同期Originalは消えない |
| T15 | cache plan後、削除前にExportがpin | 実行時再確認で対象保護 |
| T16 | 容量不足で100枚import | admission/backpressure。未同期原本や既存Recipeを削除しない |
| T17 | 別端末でOriginalなしExport | 対象1枚だけ取得。全library syncを開始しない |
| T18 | Original GETがoffline/404/403/hash不一致 | waiting/auth/errorを区別。Proxy Final成功へfallbackしない |
| T19 | Export中にRecipe更新 | 固定revisionで完了。新revisionは新jobのみ |
| T20 | Memory pressure/thermal/low battery | concurrency低下またはresource suspend。manifest/output仕様は変えない |
| T21 | background expiration/書出し中断 | tempを完成公開せずcheckpoint。再開後同じmanifest |
| T22 | Batch 100枚中1枚失敗 | item別結果。99枚成功＋1枚失敗を100枚成功と表示しない |
| T23 | TIFF/JPEG書込み後にprofile/dimension検証失敗 | publishせずtemp隔離/削除、明示error |
| T24 | Trash中にExport/restore/purge競合 | revision/leaseで即purgeを防止。restoreまたは明示purge block |
| T25 | 30/90日経過 | Originalを自動物理削除しない |
| T26 | provider/region障害 | 状態を保持し再試行。独立backup未検証なら復旧済みと表示しない |
| T27 | iCloud/device backup exclusion設定 | 対象は再取得可能cacheだけ。唯一のOriginal/outboxを除外して保護喪失しない |
| T28 | camera RAWがruntime unsupported | `UNSUPPORTED_RAW`。JPEG代替や別decoderを使ったと偽装しない |
| T29 | Canonical生成Asset欠落 | 新背景を再生成せずdependency待ち/失敗 |
| T30 | cloud purge要求 | active refs、hold、backup policy、権限を検査。部分削除を完了表示しない |

## 13. 確定した後続順序

ユーザー指定により、共通基盤へ影響する作業は次の順でメインが統合判断する。

1. Storage / DB / Backup provider確定
2. Cloud Safeの検証方式確定
3. API / schemaを正本へ統合
4. iOS background upload / resume adapter実装
5. クラウド保存を含むProxy生成・cache eviction実装
6. Original＋固定Recipe入力のExport実装
7. iPhone/iPad実機QA

前段の未確定契約を各担当が別々に実装しない。Provider確定は料金だけでなく日本latency、durability、versioning、独立障害domainのbackup、復旧時間/費用、実測結果を含む。Proxyのクラウド保存方針は確定だが、codec、画素数、生成場所、保持version数は測定ゲート後に決める。

## 14. 親担当へ渡す採否判断

共有契約へ入れる前に親担当が決める必要があるもの:

1. このlogical schema/APIのversioning方式と、backend/`contracts` の正式owner。
2. Role template、とくにViewerのOriginal read/Export可否。
3. Cloud Safe検証をprovider-native checksum＋server stream hashのどちらで成立させるか。
4. iOS file protection class、backup exclusion、background adapterの最低OS別実装。
5. Color managementのworking/output profile方針とRAW decoder選定gate。
6. 主storage/regionと独立backupのPoCを行い、後続順序1として確定する。それまではR2/B2/S3等を未採用のまま比較する。
7. Trash/restore/purgeの事業ルール。30/90日Original自動削除は採用しない。

このノート自体は設計成果であり、Cloud接続、同期、Export、実機background、料金妥当性、リリースgateの合格証拠ではない。
