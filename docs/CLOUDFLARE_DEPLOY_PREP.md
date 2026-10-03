# Cloudflare専用コピー — 接続・配備前の実測境界

この文書は専用コピーだけの追加記録。元SUITE、指定済みSites、旧Evidenceを変更しない。Sitesの公式Git接続エラーは再試行せず、Cloudflare Workers経路を別に準備する。実Cloudflare配備・実RAW・実機は未実施。

## 現在の実装

- `apps/sites/src/cloudflare-entry.mjs` を専用Worker入口とし、既存 `worker.mjs` のAsset/Recipe/作者提出/D1/R2処理を再利用する。外部からの `oai-authenticated-user-*` は破棄し、署名・issuer・audienceを検証したCloudflare Access assertionから本人Sessionを発行する。
- Session IDはD1 `site_auth_sessions` にSHA-256のみ保存し、毎操作で失効/期限を確認する。管理者はさらに既存の別パスワードCookieを要求する。招待期限・取消、所有者のAsset/Draft境界は既存Workerが毎操作で確認する。
- 一般ページと匿名編集はブラウザ内保存のみ。クラウド保存・再読込・作者提出には本人Sessionと招待memberが必要。匿名IndexedDBは同じブラウザprofileの利用者を分離しないため、共用端末の機密保存には使えない。匿名データをログインAccountへ自動claimしない。
- `build-cloudflare.mjs` はブラウザBuildを再利用し、ソースマップ・QAページを公開Assetから除き、専用入口だけをbundleする。`cloudflare/wrangler.example.jsonc` は全resource値がplaceholderのため配備不可。ASSETS/DB/BUCKETのbinding名は固定、Provider/Recipe v1/原本保持契約は変更しない。

## 外部接続の順序（未実施）

1. 本人がCloudflare dashboardをブラウザで正規ログインして対象Accountを確認する。専用コピーへWrangler 4.147.0は導入済みだが、`wrangler whoami` は `You are not authenticated`。既定の[CLI OAuth](https://developers.cloudflare.com/workers/wrangler/commands/general/)は資格情報ファイルを作るため、ユーザーの「資格情報をファイルへ移さない」制限下ではこちらから `wrangler login` を実行しない。ブラウザDashboard経路を優先し、CLI方式の追加許可を推測しない。
2. 既存R2 subscriptionとZero Trust/Access設定を確認。R2新規subscriptionは[公式手順上checkoutを伴う](https://developers.cloudflare.com/r2/get-started/)ため、既存に無ければここで停止する。新しい有料契約、決済、メール送信を行わない。
3. 専用Worker名、既存または専用D1・R2、Account、AccessのIdP/対象者、最終URLを特定する。他用途Worker/Bucket/DB/Sitesは転用しない。Accessは[Worker全体ではなく対象hostnameの `/auth/*` に限定](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)し、一般ページを匿名に保つ。Access audience/team domainは現地で実測し、推測値を固定しない。管理者本人IDは検証したAccess `sub` を採用する。
4. `npm run web:build` → `node apps/sites/build-cloudflare.mjs` → `node --test apps/sites/tests/*.test.mjs`。最終bundleのhashと20件の公開Asset目録を保存する。Cloudflareの[静的Asset単体25MiB制限](https://developers.cloudflare.com/workers/platform/limits/)と現Build最大約11.8MBはローカル寸法比較のみであり、現地upload成功ではない。
5. placeholderを検証済みの非秘密resource ID/nameだけで置換した配備configを用意。D1 migration `0000`–`0003` を専用DBへ適用する前に対象DBと既存表を照合する。原本・旧part・旧versionを削除しない。
6. Session/管理者/Access/使用量limitの値はCloudflare DashboardのSecret設定に本人が対話入力する。`wrangler secret put` は[即時deployを伴う](https://developers.cloudflare.com/workers/configuration/secrets/)ため不用意に使わず、先にWorkerの公開経路とSecretの投入順を確認する。templateの `secrets.required` が欠落時のupload/deployを拒否する。値をソース/ログ/引数へ置かない。
   過去のチャットで共有された管理者パスワードは再使用せず、公開前に新しい秘密値へ変更する。
7. 非秘密bind/Secret/Access pathが揃って初めて専用Workerを配備し、匿名編集、本人クラウド保存・復元、作者提出、管理者の審査、別作者拒否、期限・取消、Original checksum、Cloud Safe、使用量、R2中断を本番URLで再試験する。許諾済み実RAWが届くまでRAW画質GateはNOT_RUN。

## 配備前BLOCK

- Cloudflare account/OAuth、R2 subscription、Zero Trust/IdP、Access path/AUD、専用D1/R2/Worker ID・URL、Secretの正規投入、実Provider接続が未確認。
- 無料枠の実CPU/メモリ/転送/保存使用量は未計測。8MiB分割は100MB request上限への対策だが、最大128MiBの最終hash・R2 multipartがWorkers Freeの10ms CPU制限内で完走することは未検証。上限超過時に原本を消さず、新規取込を拒否する既存保守的制御を維持。
- 実RAW、Proxy/Final目視、Cloudflare現地ブラウザ、外部作者、Apple Native/iPhone/iPad、Feature Parity、Mobile Releaseは独立NOT_RUN/BLOCK。

## 公式根拠

- [WorkersのStatic Assets binding](https://developers.cloudflare.com/workers/static-assets/binding/)
- [Access JWT検証](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [AccessのWorkers path限定](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [D1 migration](https://developers.cloudflare.com/workers/wrangler/commands/d1/)
- [R2 Workers multipart](https://developers.cloudflare.com/r2/api/workers/workers-multipart-usage/)
- [Workers制限](https://developers.cloudflare.com/workers/platform/limits/)
