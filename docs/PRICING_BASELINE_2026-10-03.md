# SUITE 追加指示書
# PRICING / COST / BILLING BASELINE
# 2026-10-03 打ち合わせ価格設計の固定

本指示は、これまでのSUITE料金・原価・競合比較に関する打ち合わせ内容を、事業設計上の正本候補として保存するためのものである。

現時点では「有力価格案」であり、公開価格を永久固定するものではない。

Apple手数料、消費税、AI原価、Cloud原価、競合価格、為替等はリリース前に最新値で再計算すること。

料金をコードへハードコードしないこと。


==================================================
1. SUITEの収益構造
==================================================

主要収益を以下の3本柱とする。

1.
SUITE基本ソフト利用料

2.
Cloud Storage利用料

3.
Workspace / Team利用料

追加収益：

4.
Generative AI Credit

5.
将来的な純正テザーケーブル等の物販


==================================================
2. SUITE MOBILE 基本料金
==================================================

現時点の最有力案：

月額
1,980円（税込）

初期対象：

- iPhone
- iPad

通常機能については、
原則として写真1枚ごとの課金を行わない。

月額内候補：

- RAW現像
- Color Adjustment
- AI Portrait Retouch
- Skin
- Face
- Body
- Colored Contacts
- Local Mask
- Preset
- Batch Processing
- Tether
- Crop
- Print Size
- JPEG Export
- TIFF Export
- PNG Export
- 通常Export無制限

Evotoのように通常使用で残り枚数を常時意識させるUXを避ける。


==================================================
3. STANDARD CLOUD
==================================================

SUITE MOBILEには、

50GB Cloud Storage

を標準付属させる方向とする。

Cloud 0GBで開始させる設計にはしない。

理由：

- 契約直後からCloud体験を提供
- Cross-device体験
- Device故障対策
- Cloud-first思想を理解してもらう
- Evotoとの差別化

40MP〜60MP級RAWを
1枚約80MB前後として考えた場合、

50GB
≒ 高画素RAW約600枚前後

をユーザー向けの目安として利用可能。

ただし実際のRAW容量はカメラ・圧縮方式等で異なるため、
「約○枚」と明記する。


==================================================
4. 1契約目から黒字
==================================================

FUN CALLと同様、

FIRST CUSTOMER MUST BE PROFITABLE

をSUITEでも原則とする。

ユーザー数が増えないと赤字固定費を回収できない価格設計は禁止。

基本料金については、

消費税
+
Apple手数料
+
標準Cloud原価
+
API
+
DB
+
Backup
+
その他1ユーザー当たり変動原価

をすべて差し引いた後、

1契約当たり
月額約1,000円前後

を残すことを目標とする。


==================================================
5. SAFE COST ASSUMPTION
==================================================

事業計画ではApple手数料を
楽観側ではなく高率側で試算する。

現時点の安全側仮定：

Apple関連手数料
26%

日本消費税
10%

を前提に試算する。

正式リリース前にApple最新契約条件を再確認する。


==================================================
6. 1,980円試算
==================================================

税込1,980円の場合：

税抜売上
約1,800円

Apple 26%控除後
約1,332円

ここから、

50GB Storage原価
API
DB
Backup
その他変動原価

を差し引く。

現時点の試算では、

Cloud 50GB
約100円台/月

その他インフラ変動費を含めても、

約1,000円前後を残す構造

を目標とする。

実測原価がこの条件を満たさない場合は、
価格または付属Cloud容量を再調整する。


==================================================
7. CLOUD STORAGE ADD-ON
==================================================

標準50GBを超えるユーザー向けに、
追加Cloudを販売する。

現時点の容量候補：

- 100GB
- 250GB
- 500GB
- 1TB
- 3TB optional
- 5TB
- 10TB
- 50TB optional / enterprise

容量の型・Quota設計は、
10TB以上でも破綻しないようにする。


==================================================
8. STORAGE PRICE PRINCIPLE
==================================================

Cloud Storage価格はまだ最終確定しない。

必ず以下と比較して決定する。

- Evoto Cloud
- Lightroom Cloud
- 外付けSSD
- 外付けHDD
- NAS
- 市販Cloud Storage

SUITEの訴求：

「大容量SSDを買い続けなくても、
Cloudに正本を置き、
iPhone / iPad等から必要な写真へアクセスできる」

ただし、

「物理Storageより必ず安い」

とは実価格比較なしに表示しない。


==================================================
9. EVOTO CLOUD BENCHMARK
==================================================

2026-10-03の打ち合わせ時に使用した比較値：

Evoto追加Cloud：

500GB
US$119 / 1年間

1TB
US$189 / 1年間

2TB
US$269 / 1年間

Evotoには50GB / 100GB等の標準追加プランが
公開料金表上存在しないという前提で比較していた。

これらは競合価格として保存するが、

RELEASE前に必ず最新公式価格を再確認する。


==================================================
10. MONTHLY STORAGE
==================================================

SUITEのStorageでは、
月契約を重要視する。

Evotoの年単位Storage Packに対して、

SUITE：

必要な容量を
必要な期間だけ
月単位で増減可能

という使いやすさを差別化候補とする。


==================================================
11. ANNUAL CONTRACT
==================================================

SUITEにも年間契約を用意する方向。

基本原則：

月払い
=
自由度

年間払い
=
割引

とする。

年間契約は月契約より明確に安くする。


==================================================
12. ANNUAL DISCOUNT
==================================================

基本ソフト・Workspace等の
低変動原価商品については、

「10か月分程度の料金で12か月」

のような年間割引も候補。

ただしCloud Storageは、
契約期間中もStorage原価が毎月継続発生するため、

基本ソフトと同じ深い割引率を機械的に適用しない。

Storage年間割引は
実原価・粗利率を確認して別設定する。


==================================================
13. WORKSPACE
==================================================

写真館・撮影スタジオ・制作会社等向け。

現時点の有力案：

Workspace
月額1,980円

Included Seats
3名まで

4人目以降：

Additional Seat
約500円 / 月 / 人

をたたき台とする。


==================================================
14. WORKSPACE FREE TRIAL
==================================================

Workspaceには
無料期間を付けない方向。

Workspaceは個人向け体験機能ではなく、
業務向け追加機能として販売する。

正式価格・Seat条件は実装前／公開前に再確認。


==================================================
15. WORKSPACE VALUE
==================================================

Workspace料金には最低限：

- Shared Projects
- Shared RAW
- Shared Proxy
- Shared Recipe
- Shared Preset
- Owner
- Admin
- Editor
- Viewer
- Recipe Version
- Edit Conflict
- Audit Log
- Shared Storage Pool
- Client Gallery
- Team workflow

等を含む構想。


==================================================
16. GENERATIVE AI
==================================================

生成AIは通常月額とは分離する。

月額内：

- RAW Development
- Color
- Standard Portrait AI
- Skin
- Basic Face
- Body local reshape
- Colored Contacts
- Local Mask
- Preset
- Batch
- Normal Export

生成Credit対象候補：

- Background Generation
- Clothing Change
- Weather Change
- Generative Expand
- Large Object Removal
- Premium Relight
- Advanced restoration
- 高原価AI処理


==================================================
17. GENERATIVE CREDIT PURCHASE
==================================================

iPhone / iPadでは、
Generative AI Creditは
App Store Consumable IAPを基本候補とする。

流れ：

User Purchase
↓
Apple Transaction
↓
Server Verification
↓
Credit Add
↓
AI使用
↓
Credit Deduction

運営による手動チャージを通常運用にしない。


==================================================
18. AI ENGINE SELECTION
==================================================

生成AIエンジンを1社へ固定しない。

ユーザーへ品質／速度を選択可能にする方向。

UI例：

AUTO
FAST
QUALITY
PREMIUM

ベンダー名を主UIへ直接出す必要はない。

BackendではAI Provider abstractionを持つ。


==================================================
19. AI CREDIT PRICE
==================================================

AI Credit価格を先に固定しない。

AI Engineごとに：

Provider Cost
Apple Fee
Tax
Retry Cost
Failure Rate
Infrastructure
SUITE Margin

を加味して逆算する。

各生成処理は、

実行前に
「何Credit消費するか」

をユーザーへ表示する。


==================================================
20. AI MARGIN
==================================================

Generative AIは
赤字販売しない。

現時点では、

実コストに対して
十分な安全係数を持たせ、

原価の約2倍以上の売価余地

を検討する。

ただし正式粗利率は
AI Provider確定後に計算する。


==================================================
21. EVOTO MOBILE BENCHMARK
==================================================

2026-10-03打ち合わせ時の比較基準：

Evoto Mobile
約2,000円 / 月

月60 Credit前後

という価格を参照した。

SUITE：

1,980円 / 月
+
Cloud 50GB標準付属
+
通常Export枚数課金なし

という構成を主要な比較案とする。

Evoto価格は公開時に必ず再調査する。


==================================================
22. PRICING MESSAGE
==================================================

SUITEの価格訴求候補：

「通常編集で残り枚数を気にしない」

「50GB Cloud付き」

「必要になったらCloudだけ増やせる」

「重い生成AIを使った時だけCredit」

「チームならWorkspaceを追加」

というシンプルな料金構造を目標とする。


==================================================
23. PRODUCT REVENUE LAYERS
==================================================

最終的な収益構造：

LAYER 1
SUITE Subscription

LAYER 2
Cloud Storage

LAYER 3
Workspace / Seats

LAYER 4
Generative AI Credits

LAYER 5
Hardware / Tether Cable optional

とする。


==================================================
24. DO NOT HARD CODE
==================================================

以下をソースコードへ直接固定しない。

- 1,980円
- Workspace 1,980円
- Seat 500円
- Storage Plan価格
- Cloud付属容量
- Credit価格
- Annual Discount
- Apple Fee
- Tax assumption

Product Catalog / Remote Config /
Billing configuration等から変更可能にする。


==================================================
25. COST DASHBOARD
==================================================

管理側で最低限：

Monthly Revenue
Apple Fee
Payment Fee
Tax
Storage Cost
DB Cost
API Cost
Backup Cost
AI Cost
Workspace Revenue
Seat Revenue
Cloud Revenue
AI Credit Revenue
Gross Profit
Gross Margin

を追跡可能にする。


==================================================
26. ONE CUSTOMER PROFIT GATE
==================================================

正式料金確定時には、

USER = 1

でも、

Revenue
>
All variable costs

を満たすこと。

さらに目標として、

本体1契約当たり
約1,000円/月

を残せるか確認する。

満たさなければPricing Gate FAILとする。


==================================================
27. RELEASE BEFORE PRICE CHECK
==================================================

本番価格確定前に必ず再確認：

- Apple最新手数料
- 日本消費税
- R2 / Storage価格
- Backup価格
- Supabase / DB価格
- Workers / API価格
- AI Provider価格
- 為替
- Evoto最新価格
- Lightroom最新価格
- 外付けSSD / HDD市場価格

2026-10-03時点の数字を
将来そのまま使用しない。


==================================================
28. STATUS
==================================================

現時点の最有力構成：

SUITE MOBILE
1,980円 / 月（税込）

Included:
Cloud 50GB

Normal Export:
Unlimited / no per-image charge

Workspace:
1,980円 / 月案
3 seats included

Additional Seat:
500円 / 月案

Additional Storage:
100GB〜10TB+の月額追加

Generative AI:
Credit課金

Annual:
月契約より割引

以上を価格設計Baselineとして保存する。

これは最終公開価格ではなく、
2026-10-03時点の打ち合わせで確定した
事業設計上の有力案として扱う。
