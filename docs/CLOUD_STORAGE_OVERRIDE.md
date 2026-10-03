# SUITE 追加修正指示
## CLOUD STORAGE / PROXY / RAW LIFECYCLE 強制仕様

今回の内容は既存の
「NON-DESTRUCTIVE EDITING」
「PROXY ARCHITECTURE」
を置き換えるものではなく、
その仕様をさらに明確化・強制する追加要件とする。

既存の打ち合わせ内容・確定仕様は削除しないこと。


==================================================
1. 基本原則
==================================================

SUITEは「RAW原本を常時直接操作する写真編集アプリ」にしない。

基本構造を以下に固定する。

ORIGINAL RAW
        ↓
LIGHTWEIGHT PROXY
        ↓
VIEW / SELECT / EDIT / AI PREVIEW
        ↓
EDIT RECIPE
        ↓
FINAL EXPORT時のみ
ORIGINAL RAW + EDIT RECIPE
        ↓
JPEG / TIFF / PRINT DATA


通常操作時は原則としてProxyを使用する。

Original RAWは正本として保持し、
非破壊で管理する。


==================================================
2. ORIGINAL RAW IS IMMUTABLE
==================================================

Original RAWを編集・上書き・変換保存してはいけない。

Original RAWは

MASTER ORIGINAL

として扱う。

以下によって内容を変更しない。

- RAW現像
- AIレタッチ
- Body補正
- Color調整
- Crop
- Preset
- Background生成
- Object Removal
- Print調整

編集結果はすべて

Edit Recipe
Mask
Generated Asset
Crop metadata

等として別管理する。


==================================================
3. PROXY FIRST
==================================================

写真を取り込んだ時点で、

1. RAW登録
2. Metadata取得
3. Lightweight Proxy生成
4. AI解析
5. Proxy表示

を優先する。

ユーザーにフルRAW処理完了を待たせない。

iPhone / iPadでの通常表示・セレクト・編集は
基本Proxyを使用する。

目的：

- 高速表示
- スクロール高速化
- 省メモリ
- 省ストレージ
- Battery負荷低減
- Thermal負荷低減
- Network負荷低減


==================================================
4. PROXY QUALITY LEVEL
==================================================

Proxyを単一固定サイズにしない。

最低でも概念上、

THUMBNAIL
PREVIEW
HIGH PREVIEW

の複数レベルを扱える構造にする。

画面サイズ、
Zoom率、
Device性能、
Network状態、

に応じて必要なProxyを選択する。

例えば一覧画面で
高解像Previewをダウンロードしてはいけない。


==================================================
5. 1:1 INSPECTION
==================================================

ユーザーが

100%
1:1
Pixel Check

等を要求した場合のみ、

必要な領域または高解像Previewを取得する。

可能であればFull RAW全体を毎回取得せず、

必要な解像度
必要な領域

だけを使う設計を検討する。


==================================================
6. EDIT RECIPE
==================================================

編集操作は画像へ焼き込まない。

例：

Exposure
White Balance
HSL
Curve
Skin
Face
Body
Crop
Look
Mask
AI parameters

をEdit Recipeとして保存する。

同じRAWに対して、

Original RAW
+
Edit Recipe v1
Edit Recipe v2
Edit Recipe v3

のように履歴を保持可能にする。


==================================================
7. CLOUD-FIRST
==================================================

SUITEは端末ストレージ依存を前提にしない。

Cloud Safe確認後は、

Original RAWの正本
Proxy
Edit Recipe

をクラウドから復元可能にする。

これにより、

iPhoneで撮影・取込
↓
iPadで編集
↓
別のiPhoneで確認
↓
将来Macで書き出し

を成立させる。


==================================================
8. IMPORT FLOW
==================================================

推奨Import Flow：

CAMERA
↓ USB-C
iPhone / iPad
↓
RAW一時保存
↓
Proxy即生成
↓
ユーザー操作開始
↓
Original RAWをBackground Upload
↓
Checksum verification
↓
Cloud persistence verification
↓
CLOUD SAFE

ユーザーはRAW Upload完了まで
編集開始を待つ必要はない。


==================================================
9. CLOUD SAFE GATE
==================================================

以下がすべて成功するまで、

Original RAWを
Cloud Safe扱いにしてはいけない。

- Upload completed
- Checksum matched
- Object exists
- File size matched
- Metadata committed
- Owner / Workspace association confirmed
- Access permission confirmed

成功後：

CLOUD SAFE

を記録。


==================================================
10. LOCAL RAW EVICTION
==================================================

Cloud Safe前：

Original RAWを端末から
自動削除してはいけない。

Cloud Safe後：

ユーザー設定およびCache Policyに基づき、

Keep Local
Auto Optimize
Cloud Only

等を選択可能にできる構造とする。

ただし自動削除時も
確認済みOriginalがクラウドに存在することを
再確認する。


==================================================
11. EXPORT FLOW
==================================================

最終書き出し時：

1. Export対象を決定
2. Original RAW存在確認
3. 必要ならCloudからRAW取得
4. Edit Recipe取得
5. Mask / AI metadata取得
6. RAWをFull Resolution現像
7. AI / Color / Crop等を再適用
8. JPEG / TIFF等へ書き出し
9. Export integrity check
10. Output

とする。

重要：

「書き出し時にRAWをいじる」

ではなく、

Original RAWは変更せず、

RAW + Recipeから
新しい完成画像を生成する。


==================================================
12. EXPORT DEVICE INDEPENDENCE
==================================================

クラウド同期済みProjectは、

Original RAWがクラウドに存在する限り、

iPhone
iPad
将来Mac
将来Windows

どの対応端末からでも
Full Quality Exportできる設計にする。

「RAWを最初に取り込んだ端末でしか
書き出せない」

という仕様は禁止する。


==================================================
13. BACKGROUND RAW DOWNLOAD
==================================================

Export時に必要なRAWだけを取得する。

例：

Cloudに5TBの写真が存在していても、

10枚を書き出すなら
原則その10枚だけを取得する。

5TB全体を
ローカルへ同期する必要はない。

Storage容量と
実際のTransfer量を混同しない。


==================================================
14. SMART CACHE
==================================================

端末には必要なデータだけ保持する。

例：

最近使用したProxy
現在のProject
Export予定RAW
Offline指定Asset

を優先。

LRU等のCache Evictionを用いる。

ただし、

Unsynced RAW
Unsynced Recipe
Unverified Original

は自動Eviction禁止。


==================================================
15. OFFLINE
==================================================

ネット接続なしでも、

既にローカルに存在する

Proxy
Recipe
Preset
RAW

を利用して、

Select
Edit
Tether
Preview

を可能にする。

ネット回復後に
差分Syncする。


==================================================
16. SYNC PRIORITY
==================================================

通信帯域の優先順位：

P0
Edit Recipe / Metadata

P1
Proxy

P2
Original RAW

P3
Optional Generated / Export Asset

とする。

ただしユーザーが
「今すぐこのRAWを書き出す」
を選択した場合は、
該当RAWを最優先に昇格する。


==================================================
17. MOBILE NETWORK CONTROL
==================================================

Original RAWは巨大なため、

Wi-Fi Only
Wi-Fi + Cellular
Pause Upload

等を設定可能にする。

モバイル通信で
勝手に数十GBをアップロードしない。


==================================================
18. STORAGE PROVIDER ABSTRACTION
==================================================

R2 / S3等を
現段階で直接コードへ固定しない。

ObjectStorageProvider interfaceを設ける。

最低限：

put
get
head
delete
signed access
multipart upload
resume
checksum
metadata

を抽象化する。

後から

Cloudflare R2
AWS S3
その他S3-compatible storage

を比較・変更可能にする。


==================================================
19. STORAGE PROVIDER SELECTION
==================================================

正式Providerは、

保存単価だけで決めない。

以下を比較する。

- ¥ / GB / month
- PUT cost
- GET cost
- Egress
- Japan latency
- Multipart upload
- Resume reliability
- Durability
- Availability
- Versioning
- Replication
- Disaster recovery
- Support
- Vendor lock-in
- 1TB / 10TB / 100TB時の総原価

特にSUITEでは、

「保存容量」と
「実際に呼び出すRAW量」

を分けて試算すること。


==================================================
20. COST MODEL
==================================================

例えばユーザーが10TB保存していても、

毎月10TBすべてをDownloadするとは仮定しない。

実使用モデルとして、

Storage:
10TB

Monthly Full RAW Read:
50GB
100GB
500GB
1TB

など複数ケースで
原価を比較する。

Proxy表示についても
Original RAW Downloadとは別計算する。


==================================================
21. USER EXPERIENCE
==================================================

ユーザーへ、

UPLOAD
DOWNLOAD
SYNC

を過度に意識させない。

基本体験：

アプリを開く
↓
写真が見える
↓
編集できる
↓
書き出せる

を維持する。

Amazon Photos等の
「保存はできるが、大量写真の入出庫が面倒」
というUXにはしない。


==================================================
22. CLOUD AS PRODUCT VALUE
==================================================

Cloudは単なるBackupではない。

SUITEの価値として、

- Hardware failure protection
- Cross-device
- Storage expansion
- Device replacement recovery
- Team collaboration
- Anywhere export

を提供する。

「高価な端末ストレージを増設し続けなくても
必要量をクラウドで追加できる」

という商品設計を可能にする。


==================================================
23. TEST
==================================================

必須試験：

100 RAW
500 RAW
1000 RAW

および、

50GB
100GB
500GB
1TB相当Project

を想定する。

確認：

- Scroll performance
- Proxy display
- Edit latency
- Background Upload
- Resume
- Cloud Safe
- Cache eviction
- Device restart
- Offline recovery
- Cross-device sync
- Full export
- Original integrity


==================================================
24. 最終原則
==================================================

ORIGINAL RAW IS IMMUTABLE.

PROXY IS THE NORMAL WORKING IMAGE.

EDITING IS RECIPE-BASED.

CLOUD HOLDS THE MASTER.

THE DEVICE HOLDS WHAT IT NEEDS.

EXPORT TOUCHES THE ORIGINAL ONLY AS INPUT.

EXPORT NEVER OVERWRITES THE ORIGINAL.

DO NOT DOWNLOAD AN ENTIRE LIBRARY
TO EXPORT A FEW PHOTOS.

MOBILE STORAGE MUST NOT BECOME
THE USER'S NEW BOTTLENECK.
