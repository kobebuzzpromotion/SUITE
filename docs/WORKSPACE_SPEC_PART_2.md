# 2/3：Cloud Storage・クラウド正本設計

==================================================
14. CLOUD-FIRST PRINCIPLE
==================================================

SUITEはLightroom Classic型の「特定PCのローカルディスクが正本」という思想を採用しない。

基本思想：

CLOUD IS THE PRIMARY LIBRARY.
DEVICE IS A WORKING CACHE.

クラウドを単なるBackupではなく、写真Libraryそのものとして扱う。

目的：

- PC故障による写真喪失防止
- iPhone故障
- iPad故障
- PC買替え
- SSD故障
- 容量不足
- 複数端末利用
- Studio共有

を解決する。


==================================================
15. RAW ORIGINAL
==================================================

RAW原本をクラウド保存可能にする。

RAW原本はImmutableとして扱う。

禁止：

- RAWへの編集上書き
- RecipeのRAW埋込みによる原本変更
- Cropによる原本変更
- AI Retouchによる原本変更
- Export結果による原本置換

原本は原本のまま保存する。


==================================================
16. PROXY
==================================================

通常のLibrary表示、Selection、EditはProxyを優先する。

クラウドに5TB存在するからといって5TB全体を端末へDownloadしてはいけない。

Library：

Proxy / Thumbnail

Edit：

Proxy

Final Export：

必要なOriginal RAWのみ取得

という構造にする。


==================================================
17. ON-DEMAND RAW FETCH
==================================================

最終Export時に、対象写真のOriginal RAWだけ取得する。

例：

Cloud Library 5TB
↓
ユーザーが10枚をExport
↓
必要な10 RAWのみFetch
↓
RAW + Fixed Recipe
↓
Final Export

5TB全体を移動しない。

これをStorage cost / Network cost設計の基本とする。


==================================================
18. STORAGE PLAN
==================================================

容量課金へ対応する。

最低候補：

100GB
500GB
1TB
2TB
3TB
5TB
10TB

価格はコードへハードコード禁止。

Remote Product Table / Billing Configurationで変更可能にする。

将来的に20TB以上へ拡張可能な型を使用する。


==================================================
19. STORAGE IS SEPARATE PRODUCT
==================================================

SUITEアプリ利用料とCloud Storage料金を論理的に分離する。

例：

SUITE Mobile Subscription

+

Cloud Storage

+

Generative AI Credits

とする。

ユーザーが大容量を必要としない場合、
不要なStorage料金を強制しない。


==================================================
20. WORKSPACE STORAGE
==================================================

Workspaceは共有Storage Poolを持てるようにする。

例：

Studio Workspace
2TB

Owner
Staff A
Staff B
Staff C

の全員で2TBを共有。

メンバーごとに同じRAWを重複保存して課金してはいけない。


==================================================
21. STORAGE USAGE
==================================================

管理画面で最低限表示：

Used
Available
Original RAW
Proxy
Generated Assets
Exports optional
Trash

例：

1.42 TB / 2 TB

を表示する。


==================================================
22. CACHE
==================================================

iPhone / iPad内には必要データだけCacheする。

Cacheが削除されてもCloud Safe Assetは失われない。

Cache Managerは：

- Proxy
- Original temporary download
- Export temp
- Generated preview

を区別する。


==================================================
23. OFFLINE
==================================================

インターネットなしでも、

- 撮影
- RAW Import
- Proxy生成
- Edit
- Selection
- Recipe保存

は可能。

通信復旧後にCloud Syncする。


==================================================
24. CLOUD SAFE
==================================================

UploadしただけでCloud Safe扱いにしない。

最低条件：

Upload completed
Checksum verified
Object exists
Metadata exists
DB reference exists
Permission verified

を通過して初めてCloud Safeとする。


==================================================
25. MULTIPART
==================================================

大きなRAWはMultipart Uploadへ対応。

既存契約：

破損partのみ再取得
正常part不変
旧part保持
最終checksum一致

を維持する。

既存回帰を壊さない。


==================================================
26. PROVIDER ABSTRACTION
==================================================

Cloudflare R2やAWS S3をアプリコードへ直結させない。

StorageProvider interface経由とする。

最終Provider決定前に以下を実測比較する。

- GB/月
- PUT
- GET
- LIST
- Egress
- Japan latency
- Mobile upload
- Mobile download
- Multipart
- Reliability
- Durability
- Support
- Versioning
- Replication
- Recovery
- Large customer scaling


==================================================
27. STORAGE PROVIDER RESEARCH
==================================================

現時点では特定Providerを強制採用しない。

少なくとも：

Cloudflare R2
AWS S3
その他有力S3-compatible provider

を比較する。

写真Storageであるため、単純な「最安」だけで決めない。

優先：

1. Data safety
2. Reliability
3. Recovery
4. Predictable cost
5. Transfer performance
6. Scalability


==================================================
28. DATABASE
==================================================

RAWをDatabaseへ格納しない。

DB：

- Users
- Workspaces
- Members
- Permissions
- Projects
- Assets metadata
- Recipe
- Presets
- Storage metadata
- Jobs
- Audit
- Billing

Object Storage：

- RAW
- Proxy
- JPEG
- TIFF
- PNG
- Generated Assets

とする。


==================================================
29. CLOUD COST OBSERVABILITY
==================================================

ユーザー / Workspace単位で：

Stored GB
Original RAW GB
Proxy GB
Upload GB
Download GB
API operations
Generated storage
Export traffic

を計測可能にする。

内部管理では：

Storage revenue
Storage provider cost
AI cost
Apple fee
Payment fee
Gross margin

を追跡可能にする。


==================================================
30. HARDWARE-INDEPENDENT VALUE
==================================================

SUITEの商品価値として、

「写真を保存するためにユーザーが大容量SSDを買い続ける必要を減らす」

思想を持たせる。

ただし、

「クラウドなら絶対に消えない」
「100%安全」

等の絶対表現は禁止。

高耐久性、冗長化、復旧性を正確に表現する。
