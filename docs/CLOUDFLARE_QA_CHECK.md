# Cloudflare 専用コピー：接続・現地 QA チェック

対象は `2026-10-03/task/suite-cloudflare-full-2026-10-03` の専用コピーのみ。元 SUITE、既存 Sites、他の停止中タスクは対象外。公開・接続済みを示す記録ではない。

## ローカル試験の実測（2026-10-03）

| 実行 | 結果 | 証明する範囲 |
| --- | --- | --- |
| `node --test apps/sites/tests/cloudflare-integration.test.mjs` | 5 PASS | 実入口＋署名セッション＋既存 Worker＋SQLite 代替 D1。偽装内部ヘッダー拒否、匿名 Editor、管理者 secret 欠落時の fail closed、owner 分離、期限・取消、logout 後のセッション再利用拒否。 |
| `node --test apps/web/tests/sites-worker.test.mjs apps/web/tests/browser-local-api.test.mjs` | 42 PASS | 合成非 RAW と D1/R2/IndexedDB の代替実装。原本・Recipe・下書きなどの既存境界。 |

上記は Cloudflare Access、実 D1/R2、実ブラウザ、実 RAW の動作を証明しない。`0003_suite_sites.sql` はローカル試験へ適用したが、実 D1 へは未適用。`CF_ACCESS_TEAM_DOMAIN` からの公開鍵取得や Access JWT の正規署名検証も現地未実施。

## 接続前に固定する値と権限

1. この専用コピー用の Cloudflare Worker、D1、R2、公開 origin を一意に決め、他環境のリソース ID を再利用しない。D1 は `apps/sites/drizzle/0000_suite_sites.sql` から `0003_suite_sites.sql` まで順番に適用し、schema と `site_auth_sessions` の存在を読み取りで確認する。既存データを含む DB への試験的な再適用を避ける。
2. Worker の `DB`、`BUCKET`、`ASSETS` binding と `SUITE_ALLOWED_ORIGIN` を実際の専用 HTTPS origin に一致させる。build 成果の `local-not-production` は本番 D1 ID ではない。保存・通信予算 `SUITE_TRIAL_STORAGE_LIMIT_BYTES`、`SUITE_TRIAL_R2_WRITE_LIMIT_MONTH`、`SUITE_TRIAL_R2_READ_LIMIT_MONTH`、`SUITE_TRIAL_REQUEST_LIMIT_DAY` を設定し、未設定時の停止を確認する。
3. Cloudflare Access application で少なくとも `/auth/complete` と `/auth/whoami` を保護する。許可対象は今回の招待本人だけに絞る。Worker には Access team の HTTPS origin `CF_ACCESS_TEAM_DOMAIN` と application audience `CF_ACCESS_AUD` を設定し、実 JWT の issuer・audience・RS256 を照合する。`/auth/logout` は本アプリの署名セッションを失効させる経路であり、必要な Access 側ログアウト導線も別途確認する。
4. `SUITE_SESSION_SECRET` と `SUITE_ADMIN_SESSION_SECRET` は別々の強いランダム値（最低32 byte）、`SUITE_ADMIN_PASSWORD` は管理者だけが保持する値として secret 管理に置く。`SUITE_ADMIN_USER_ID` は実 Access JWT の `sub` に一致させる。secret を URL、公開 JS、ログ、QA 文書へ記入しない。管理画面では Access 本人性に加えて password cookie を要求する。
5. Workers の別公開 origin、特に `workers.dev` から同じ API に到達できないことを確認する。CORS、origin、`X-Suite-Trial` だけを本人確認の代わりにしない。D1/R2 管理権限をブラウザへ渡さない。

## 現地操作の受入れ手順

各操作で日時、origin、ブラウザ/OS、試験用 ID、HTTP status、D1/R2 の増減、画面結果を保存する。個人情報・secret・RAW 原本は証拠へ複製しない。失敗時は原本・Recipe・提出版が残ることを再読込で確かめる。

1. 未ログインで `/` を開き、ローカル Editor が表示される。合成画像をインポートし、調整→保存→再読込→書き出しを行う。`/trial/session` は `principal:null` と `anonymousLocal:true`、Cloud API は 401。別ブラウザへローカル画像が同期しないことを確認する。
2. 未招待の Access ログインで `/auth/complete` を通過しても Cloud 操作を 403 にし、ログイン画面または匿名 Editor へ安全に戻す。偽 `oai-authenticated-user-*`、改変 cookie、別 origin、無効な `Cf-Access-Jwt-Assertion` で権限が増えないことを確認する。
3. 管理者本人は Access と管理者 password の二段階を通す。password 未設定・session secret 未設定・誤 password・cookie 欠落・cookie 期限切れでは `/trial/members`、`/trial/submissions`、`/trial/usage` が拒否される。正しい場合だけ招待作成、期限変更、取消ができる。管理者の初期 binding を別人が奪えないことも確認する。
4. 作者 A と B を別招待・別ブラウザで登録。A の asset、upload、Recipe、draft、submission は B の一覧へ出ず、ID 直接指定も 403/404。B の操作で A の D1 行・R2 object が変わらない。管理者だけが提出一覧と審査に到達し、自己承認は拒否する。
5. A で小さい実 RAW を取り込み、Original checksum・サイズ・R2 object 存在・D1 commit を検証してからだけ `cloudSafe:true` にする。通信遮断、途中再開、part checksum 不一致、R2 読出し失敗を再試験し、失敗時の Original/Recipe と既存 part が残ることを確かめる。RAW decode と Final export は同一原本 hash で確認する。
6. A で編集 Recipe を保存し、原本を変更せず再読込する。同じ Recipe に基づく portable preset draft を作成→更新→提出。管理者が採択した版だけ共通 preset に現れ、差戻し/改ざん/古い revision は採択不可。B の source asset を使った提出は拒否する。
7. 招待期限の直前・直後、管理者による取消直後を確認する。直後は既存の署名 cookie を再利用しても Cloud API が 403、`/trial/session` は `TRIAL_EXPIRED` または `TRIAL_REVOKED`。匿名ローカル Editor は使え、Cloud 内の Original/Recipe/提出版を自動削除しない。logout 後は同じ cookie の再利用も 401。
8. iPhone Safari と iPad Safari で写真一覧、スワイプ、調整、保存復元、export と logout を実機確認する。大きな RAW、100/500/1000 枚、50GB/100GB/500GB/1TB 相当の負荷は実データ・実通信量で別記録し、合成試験から合格へ転記しない。

## 現時点のゲート

ローカルの合成データ試験は PASS。Cloudflare 配備、Access policy、実 D1 migration、実 R2、実 JWT、実ブラウザ、実 RAW、iPhone/iPad 実機は NOT RUN。従って公開・Cloud Safe・RAW Final・Mobile Release の合格判定は保留。
