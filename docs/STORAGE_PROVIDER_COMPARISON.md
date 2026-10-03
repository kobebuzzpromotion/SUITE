# Cloud Storage / quota / cost 比較と実証範囲

確認日: 2026-10-03 JST。正式採用provider、SUITE料金、Apple課金方式は **未確定**。以下は公式公開情報の比較であり、実Cloud接続・耐久性・性能の合格証拠ではない。既存StorageProvider / ObjectStorageProvider、固定6文書、RAW／Proxy／Recipe／Cloud Safe契約は変更しない。

## 公式情報による16軸比較

R2はStandard、S3はStandardを比較の出発点とするが、地域・契約・Storage classを決定したわけではない。AWSのGBは2^30 bytesで、SUITE論理容量試験の10進GBとは異なる。通貨・単位・無料枠・丸めを正規化せず単価の大小を結論にしない。[S3料金](https://aws.amazon.com/s3/pricing/)

| 軸 | Cloudflare R2 | AWS S3 | Backblaze B2（第三候補・S3-compatible） | SUITE採用前の確認 |
| --- | --- | --- | --- | --- |
| 1. GB/月 | 公開Standard $0.015/GB-month。請求単位切上げあり。[料金](https://developers.cloudflare.com/r2/pricing/) | 地域・容量・class依存。東京見積り未取得。[料金](https://aws.amazon.com/s3/pricing/) | 公開開始価格 $6.95/TB/月。[料金](https://www.backblaze.com/cloud-storage/pricing) | 月間byte-hours／各社課金方式、税・通貨・割引を分離。アプリ価格へ転記しない |
| 2. PUT | Class A $4.50/100万回、Multipart操作も対象。[料金](https://developers.cloudflare.com/r2/pricing/) | PUT等のrequest課金。地域別見積り待ち。[料金](https://aws.amazon.com/s3/pricing/) | Pay-as-you-go A/B/C API無料の公表、例外classを確認。[料金](https://www.backblaze.com/cloud-storage/pricing) | 1RAW当たりparts・retry・complete回数を実測 |
| 3. GET | Class B $0.36/100万回。[料金](https://developers.cloudflare.com/r2/pricing/) | GET等requestとclass別retrievalを区別。[料金](https://aws.amazon.com/s3/pricing/) | 同上。各APIのclass対応を見積りで固定。[料金](https://www.backblaze.com/cloud-storage/pricing) | Proxy表示とOriginal fetchを別記録 |
| 4. LIST | Class A。[料金](https://developers.cloudflare.com/r2/pricing/) | LIST request課金。[料金](https://aws.amazon.com/s3/pricing/) | API料金規則を適用。[料金](https://www.backblaze.com/cloud-storage/pricing) | ページ数・再試行・大量Projectを計測 |
| 5. Egress | R2からの直接egress無料。別の従量サービスは別料金。[料金](https://developers.cloudflare.com/r2/pricing/) | 転送先・地域・転送機能で変動。[料金](https://aws.amazon.com/s3/pricing/) | 月間平均保存量の3倍まで無料、超過条件あり。[料金](https://www.backblaze.com/cloud-storage/pricing) | 保存10TB＝毎月10TBダウンロードとはしない |
| 6. Japan latency | 配置機能は公式記載あり、日本からのSUITE実測なし。[配置](https://developers.cloudflare.com/r2/reference/data-location/) | リージョン選択と実クライアント経路の計測が必要 | 選択region／日本からの計測が必要 | 全社 NOT_RUN。TTFBと転送完了のp50/p95/p99 |
| 7. Mobile upload | NOT_RUN | NOT_RUN | NOT_RUN | iPhone/iPad、Wi-Fi／携帯、lock／background／再開 |
| 8. Mobile download | NOT_RUN | NOT_RUN | NOT_RUN | Proxy優先、対象Originalのみ、timeout／checksum／取消 |
| 9. Multipart | Create/List/UploadPart等の対応は公式表。checksum種別に差。[互換表](https://developers.cloudflare.com/r2/api/s3/api/) | Multipartの開始・parts・完了・再試行を公式説明。[Multipart](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html) | S3 Create Multipart UploadでuploadIdを返す。[API](https://www.backblaze.com/apidocs/s3-create-multipart-upload) | SUITE破損partのみ再取得、正常部不変、旧part保持を各adapterで実証 |
| 10. Reliability | 可用性SLA 99.9%を公表。[SLA](https://www.cloudflare.com/r2-service-level-agreement/) | classごとに可用性目標が異なる。[class比較](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html) | Vaultの冗長構造を公表。[耐久/可用性](https://help.backblaze.com/hc/en-us/articles/218485257-B2-Resiliency-Durability-and-Availability) | 公称値は実測成功率ではない。障害、5xx、retry、運用SLA要確認 |
| 11. Durability | 設計11 nines。誤削除防止や可用性とは別。[耐久性](https://developers.cloudflare.com/r2/reference/durability/) | class別の設計耐久性を公表。[class比較](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html) | 設計11 nines。[耐久性](https://help.backblaze.com/hc/en-us/articles/218485257-B2-Resiliency-Durability-and-Availability) | 「100%安全」禁止。SUITE checksum／DB参照／権限検証を省略しない |
| 12. Support | 契約別。SUITE対応窓口・復旧支援・応答条件未合意。[SLA](https://www.cloudflare.com/r2-service-level-agreement/) | supportプランを別選定。[比較](https://aws.amazon.com/premiumsupport/plans/) | Premium/実装支援は追加条件あり。[料金](https://www.backblaze.com/cloud-storage/pricing) | 日本時間、重大障害、データ救済、上限引上げを見積り依頼 |
| 13. Versioning | S3 Get/PutBucketVersioningは未対応表にある。独自機能を同等と推定しない。[互換表](https://developers.cloudflare.com/r2/api/s3/api/) | Versioningで複数版を保持。[Versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html) | ファイル版とLifecycle、hidden版も容量計上。[Lifecycle](https://www.backblaze.com/docs/en/cloud-storage-lifecycle-rules) | Provider版管理とSUITE Recipe履歴は別。保持・復旧・費用実証 |
| 14. Replication | 内部冗長性は公表。S3 replication APIは未対応表。[耐久性](https://developers.cloudflare.com/r2/reference/durability/)・[互換表](https://developers.cloudflare.com/r2/api/s3/api/) | CRR/SRR、両bucketのversioningや権限が必要。[条件](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-requirements.html) | region内外のCloud Replication。region間は別account等の条件。[公式](https://www.backblaze.com/docs/cloud-storage-cloud-replication) | 自動採用しない。RPO/RTO、コピー費、削除伝播を明示 |
| 15. Recovery | 耐久性だけでは誤削除を防がない。Bucket lock等の別設計必要。[耐久性](https://developers.cloudflare.com/r2/reference/durability/) | Versioning/Object Lock/Replicationを組み合わせる候補。[保護](https://docs.aws.amazon.com/AmazonS3/latest/userguide/data-protection.html) | Object Lockに保持期間・権限・Replication制約あり。[Object Lock](https://www.backblaze.com/docs/cloud-storage-object-lock) | Restore drillは全社NOT_RUN。RAW＋DB＋Recipe整合復元まで要求 |
| 16. Large customer scaling | 契約上限・同時接続と運用調整未検証 | prefix単位request性能指針がある。[性能](https://docs.aws.amazon.com/en_en/AmazonS3/latest/userguide/replication-time-control.html) | 50TB超のreplicationはSales相談を案内。[Replication](https://www.backblaze.com/docs/cloud-storage-cloud-replication) | 1TB/10TB/100TB見積り、API流量、retry storm、大量一覧を分離 |

S3-compatibleは全AWS機能互換ではない。B2はobject ACL/IAM Roles/tagging等に制約を公表している。[公式API説明](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api) Provider署名URLはBearer capabilityになり得るため、SUITEのlive membership失効と同義ではない。署名URL発行前だけでなく利用時にもWorkspace／subject／用途／期限を検証する既存統合方針を維持し、各実providerで漏洩・再利用を試験する。

採用判断順はData safety→Reliability→Recovery→Predictable cost→Transfer performance→Scalability。現時点で勝者を決めない。

## 実装した容量・原価境界

`apps/backend/src/workspace-storage.ts` は追加SQLite metadata台帳のみ。RAW bytes、課金決済、provider操作を含まない。

- SQLite INTEGERとJS safe integerを併用。100GB／500GB／1TB／2TB／3TB／5TB／10TB／20TBの**論理値**をテストする。実データ20TBを投入したという意味ではない。
- `BEGIN IMMEDIATE`内で利用済み＋予約済みを確認し予約。Workspace内の同一category＋SHA-256＋sizeは1 accounting objectで計上し、メンバー人数で増やさない。別Workspaceでは再利用しない。
- operationIdはHTTP統合側でAsset IDへ固定する。objectKeyは**accounting ID**であってphysical storage key／download権限ではない。実object保存は既存immutable provider、commit証拠はserver取得だけを許す。
- commit/retryは冪等。releaseは物理削除しない。released予約の再試行は同じ内容か確認し、必要ならquotaを再検証して再予約する。別予約が同じobjectを利用中なら容量予約を解放しない。
- 2TB→1TB、使用量1.6TBのdowngradeで新規容量確保を拒否。Original／Trash／既存予約を自動削除しない。Upgradeで新規予約可能になる。既存予約のcommitは新規容量確保とは分ける。
- Trashは使用量へ含む。カテゴリはOriginal/Proxy/Generated/Export/Trashの排他的合計。共有参照が残るobjectをTrash表示にしてよいかは呼出元が確認する。
- Authorizer必須。すべての公開操作でlive membershipを問い合わせるcallbackを呼ぶ。UIの非表示では認可を代用しない。正規利用者の解約後データ取得方針とmember revoke後の拒否は別問題。
- MOBILE/DESKTOP/ALL/STUDIO/CLOUD_STORAGE/GENERATIVE_AIは独立フラグ。Workspace base＋included seats＋additional seats＋storageは注入configに分離。null料金を0円や購入済みにしない。単なるOwner設定を検証済み課金Entitlementへ昇格しない。
- 交通量はworkspace/user/period別、Upload/Download/Export subset/PUT/GET/LIST/Otherを分離しeventIdで重複除外。`logical-test`と`adapter-measured`を別集計する。テストでadapter-measuredラベルを入力する検査は実Cloud測定ではない。
- 収益／provider費／AI費／Apple fee／決済feeの外部観測はnullable。1つでも不明ならgross marginはnull。任意注入tariffによる計算は見積りであり、請求書や実決済ではない。Auditは追加専用で変更・削除triggerを拒否する。

## 原価計測の投入条件

保存量1TB／10TB／100TBに対し、月間Original readを50GB／100GB／500GB／1TBと別軸で計算する。Proxy表示量、Generated、Export、Trash、旧版、Multipart未完parts、冗長コピー、API回数、retryをさらに分離する。10TB全件同期を前提にしない。

現台帳のstorage推計は現在bytesの定常1か月換算に限定し、日毎ピーク／byte-hours／最低保持期間／丸め／無料枠／tier／税の再現は**未実装**。S3のGiB等を10進GB単価へ正規化するconfig作成も未接続。従って本番請求照合・事業収支確定はできない。公開表の料金をproductionコードへ固定していない。

## 実行証拠と限界

担当限定試験: `node --test dist/apps/backend/tests/workspace-storage.test.js` → **12 PASS / 0 FAIL / 0 SKIP**（2026-10-03）。主な実証はSQLite reopen、safe integer、3独立プロセスで同時予約→1成功/2quota拒否、member dedup、revoke callback、release retry、downgrade/解約後の任意バイト不変、Trash/recovery、usage idempotency/overflow、null価格、append-only Audit。

初回は11 PASS / 1 FAIL（試験側が既存LocalObjectStorageの禁止するslash付きキーを使用）。テストキーのみ修正し再実行で12 PASS。製品のobject key規則は緩和していない。初回`npm run build`は担当外`workspace-server.ts`のRepository呼出し不整合3件でFAIL。その後、統合担当修正を含む最新`npm run build`はexit 0、`npm test`は **99 PASS / 0 FAIL / 0 SKIP**（Crop・旧Windows基盤34・Workspaceを含む）。この実行時点の結果であり、以後の変更は親担当の最終回帰Evidenceで再確認する。

| 項目 | 状態 | Reason / Required environment | Next procedure / Acceptance criteria |
| --- | --- | --- | --- |
| Quota/entitlement/usageのローカル台帳 | 限定実装・上記Windows12試験PASS | 本番Cloud/Billingを含まない | `npm run build` → `node --test dist/apps/backend/tests/workspace-storage.test.js`、全体回帰も親で実行 |
| 本番Cloud adapter | **未実装・未接続 / NOT_RUN** | provider未選定、承認済検証account/credentials/adapterなし | 既存interfaceへのadapter実装と承認済隔離bucket後、同一checksum/Tenant/Multipart/故障復旧を実証。勝手な契約置換禁止 |
| 本番料金/Billing/Apple取引検証 | **未実装・未接続 / NOT_RUN** | 商品表、IAP方式、取引検証、sandbox設定未確定 | 方針承認後Purchase/renew/refund/restore/取消を試験。偽通知拒否・権限昇格なし・data retrieval維持 |
| 16軸中のlatency/throughput/recovery/cost実測 | **NOT_RUN** | 実provider、計測adapter、Japan回線、実RAW未配置 | 共通dataset/partsize/concurrencyを記録して各providerで試験し、p50/p95/p99、転送量、失敗、請求照合を保存。CLIはadapter未実装のため未存在であり架空コマンドを提示しない |
| iPhone/iPad Workspace→Proxy→Final | **NOT_RUN** | Mac/Xcode/両実機、実RAW、native接続経路が必要 | `MOBILE_DEVICE_QA.md`。実機ごとにImport→Proxy→Edit→Recipe→再起動→Cloud Safe→Export、対象Originalのみ、境界拒否・原本hash一致 |
| 実RAW100/500/1000負荷 | **NOT_RUN** | checkout外指定RAWとMac/adapterが未準備 | `npm run qa:raw:manifest`、adapter準備後`npm run qa:raw:pipeline`。各セットsync/restartRecovery/cloudSafeを別Evidence。代用RAW禁止 |

## 残存リスク・変更禁止

HTTPと台帳/Asset DBの跨る原子的整合・応答消失時retryは親統合試験が必要。dedup台帳のみのPASSは物理upload重複抑制PASSではない。期限付き予約の運用cleanup、物理purge/保持期間、精密請求積算、監査外部保全、grace期間、解約後の取得期限・利用規約文言は未確定／未実装を残す。

本番Cloud Safe、価格、provider、IAP、復旧保証、性能上限をこの比較だけで確定しない。Quota/downgrade/解約による自動RAW削除は禁止。Web UI実装なし。旧147節／固定6文書／Crop16節は無変更。
