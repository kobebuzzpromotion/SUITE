# Workspace Proxy transfer — 2026-10-09

コード追加。実サービス接続・実写真・テストは未実施。本番provider、実認証、容量プラン/CLOUD_STORAGE entitlement設定が必要。匿名Cloudflare previewのDB/R2/authを作成しない。

## 契約

認証済Node Workspace APIの `/v1/workspaces/:workspaceId/projects/:projectId/assets/:assetId/proxies`。

- POST: operationId(UUID)、level(thumbnail/preview/high-preview)、originalSHA256、recipeVersion(実保存HEADの正整数)、sha256、size、width、height、mimeType(image/png|image/jpeg)。
- GET: 現在のRecipe版に合うProxy記録一覧。pendingとcommittedを区別。
- `/:operationId` GET: 状態とメタデータ。
- `/:operationId/content` PUT: 全Blob送信。同一operationIdと同一入力で再送可能。
- 同content GET: 検証済みProxyのみ。現在原本SHA・Recipe HEAD・Workspace権限が変われば拒否。

最大16MiB、8MP。長辺上限thumbnail512/preview2048/high-preview4096。実バイトのSHAとJPEG/PNGヘッダ寸法を照合する。通常のJPEG/PNGの限定転送で、SVGやHTMLのプレビュー、RAW転送、画素デコード確認ではない。

`resumeMode: WHOLE_BLOB_RETRY`。中断再開は小Blob全体の再送であり、multipartや転送済みbyte位置からの継続は未実装。

## 永続性と容量

新規 `workspace-proxy.sqlite` に専用tableのみ追加。既存Workspace/Recipe/原本DBの書換・移行・削除なし。実認可→pending記録→既存WorkspaceStorageLedgerでProxy容量予約→StorageProvider.putImmutable→inspectと全バイト再読取SHA→再認可→会計commit→Proxy記録commit。

失敗時に予約を自動releaseしない。物理保存直後に中断しても容量が未計上にならないよう予約を保持し、同operationId再送で整合を回復する。pendingは状態照会可能。中断予約の解放/期限回収/古いProxy削除は今回自動化しない。容量は旧版も含め使用・予約として残る。

同Workspaceの同Proxy SHA/sizeは不変objectを再利用。物理keyはWorkspaceを含むhashで別Workspaceと分離。台帳もcategory=Proxyの既存重複排除を再利用。

原本asset.cloudSafe・原本データ・Recipeには変更しない。返却verificationScopeはPROXY_ONLY_NOT_ORIGINAL_CLOUD_SAFE。本番クラウド耐久性を証明した扱いにしない。

## 残る設定・接続

既存StorageProviderの実運用adapter、OIDC/Workspace加入、容量契約設定が必要。新clientはtokenを保存せず、各呼出しごとに現ユーザー/tenant/Workspace membershipを再取得する。無断送信なし。

## Editor接続追加

`mountEditor`の`workspaceProxyContext`にworkspaceId/projectId/expectedSubject/expectedTenantId/tokenProviderを渡す契約。NODE_WORKSPACEの実principalと同origin APIへの認証確認後のみ送信可。公開previewのbootstrapはこの認証を提供していないため、設定不足の説明を表示する。

明示同意、送信/同一内容全体再送、保存一覧、取消を追加。保存HEADの本文/versionと実assetのSHA/sizeを照合し、dirty/写真/Recipe/認証/API変更で中断。operationIdとmetadataだけをlocalStorageのscope/payloadハッシュkeyに保持し、画像やtokenは保存しない。保存できなければ送信しない。

送信物はSessionの編集前source Proxy（PNG）であり、編集後の完成画像ではない。元Proxyの置換があり得る旧影3枝は履歴を含め拒否する。ダウンロードをEditorの原本/描画へ自動適用する処理は追加しない。原本Cloud Safeに影響しない。実環境接続と写真による確認は未実施。
