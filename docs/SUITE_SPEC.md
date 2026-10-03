# SUITE 基本設計書 / Codex実装指示
Version 0.2
Status: BASIC DESIGN
Priority: iPhone / iPad FIRST
Project Name: SUITE（商標確認完了までは仮称）
Product Category:
RAW現像 / AIレタッチ / テザー撮影 / クラウド写真管理 /
生成AI / 写真共有 / プリセットコミュニティ統合アプリ

==================================================
1. PRODUCT VISION
==================================================

SUITEは単なる写真レタッチアプリではない。

撮影
↓
RAW取込
↓
即時プレビュー
↓
AI自動現像
↓
AI人物レタッチ
↓
色調整
↓
セレクト
↓
クライアント共有
↓
印刷/SNS最適化
↓
最終書き出し
↓
クラウド保存

までを1つの環境で完結させる。

主要競合の機能を単純コピーするのではなく、

「一括処理」
「モバイル」
「クラウド」
「テザー」
「生成AI」
「印刷」
「共有」
「コミュニティ」

を一体化する。

最大の思想は、

HIGH QUALITY != HIGH FRICTION

高品質であることと、
操作が複雑であることを同義にしない。

ユーザーはAIに任せたい場合は
基本的に1アクションで仕上げられる。

細かく追い込みたいユーザーには
各項目をスライダーで調整可能にする。

==================================================
2. DEVELOPMENT PRIORITY
==================================================

開発優先順位は以下。

P0:
iPhone

P0:
iPad

P1:
Cloud Backend

P1:
Web
ただしWebは初期段階では
RAW現像の本体ではなく、

- アカウント
- ストレージ管理
- 写真閲覧
- 共有
- チーム管理
- プリセットコミュニティ
- 課金管理

を中心とする。

P2:
Mac Desktop

P2:
Windows Desktop

P3:
Android

iPhone / iPadは可能な限り
同一コードベースを共有する。

==================================================
3. METIS INHERITANCE
==================================================

SUITE専用OSを新規に作らない。

METIS共通基盤を継承する。

必須継承Core:

- MOBILE CORE
- DESIGN CORE
- COLOR / VISUAL DIRECTION
- EXPERIENCE / STAGING
- HUMAN FACTORS / USABILITY
- WORKFLOW / EFFICIENCY
- WORK ORCHESTRATION
- ROUTE OPTIMIZATION
- PARALLEL EXECUTION
- SESSION CONTINUITY
- OBSERVABILITY / SELF INSPECTION
- REQUIREMENT TRACEABILITY
- GATE REGISTRY
- ASSURANCE
- RELEASE GOVERNOR
- TOKEN / COST ECONOMY

MOBILE COREでは特に、

- Adaptive UI
- Touch
- Device Capability
- Camera
- File
- USB
- Tether
- Offline
- Sync
- Background Task
- Battery
- Thermal
- Permission
- Privacy
- Deep Link
- App Lifecycle
- Recovery
- Cross-device Continuity
- Accessibility
- App Store Release Gate

を適用する。

==================================================
4. BASIC ARCHITECTURE
==================================================

アプリ内の主要モジュールを分離する。

01. Project Core
02. RAW Engine
03. Proxy Engine
04. Tether Engine
05. Edit Recipe Engine
06. Color Engine
07. AI Portrait Engine
08. AI Body Engine
09. Generative AI Engine
10. Identity Protection Engine
11. Export Engine
12. Print Engine
13. Sync Engine
14. Cloud Storage Engine
15. Gallery / Share Engine
16. Preset Engine
17. Community Engine
18. Studio / Team Engine
19. Billing / Entitlement Engine
20. Observability / Cost Engine

各モジュールは疎結合にする。

特に、

RAW
Cloud Storage
Generative AI
Payment
Camera Vendor

についてはProvider abstractionを設ける。

特定ベンダーへの密結合を禁止する。

==================================================
5. NATIVE MOBILE IMPLEMENTATION
==================================================

Apple版の推奨構成：

- Swift
- SwiftUI
- Metal
- Core Image
- Vision
- Core ML

を基本候補とする。

ただしRAW対応については
Core Imageだけで決定しない。

対応カメラ数、
RAW互換性、
商用ライセンス、
速度、
色再現、

を検証し、

必要なら別RAWライブラリを組み合わせる。

RAW Engine自体を抽象化し、
後からエンジン交換可能にする。

==================================================
6. NON-DESTRUCTIVE EDITING
==================================================

原本RAWを書き換えてはいけない。

編集はすべて

Edit Recipe

として保持する。

例:

Exposure
+0.32

WB
5200K

Skin
18

Face Width
-7

Waist
-12

Look
SOFT BLUE 03

Crop
A1 Portrait

という形で保持する。

RAW + Edit Recipe

からいつでも再生成可能にする。

==================================================
7. PROXY ARCHITECTURE
==================================================

巨大RAWを常時フル解像度で処理しない。

RAW取込直後、

軽量Proxyを生成する。

基本操作：

RAW
↓
Proxy
↓
AI分析
↓
編集
↓
プレビュー

最終書き出し時のみ、

Original RAW
+
Edit Recipe

を使う。

これにより、

iPhone
iPad

でも高速な操作を実現する。

Proxyサイズは固定値をハードコードせず、
端末性能と設定から選択可能にする。

==================================================
8. TETHER SHOOTING
==================================================

SUITEの重要機能。

対応端末:

iPhone
iPad
将来Mac/Windows

基本フロー:

CAMERA
↓ USB-C
SUITE
↓
RAW IMPORT
↓
即Proxy生成
↓
Preset
↓
AI Retouch
↓
即表示

撮影現場では、
フルRAWの最終処理完了を待たせない。

まずProxyを表示する。

カメラ対応はメーカー・モデル別に
Compatibility Matrixを持つ。

Camera Adapter layerを作り、

Canon
Sony
Nikon
FUJIFILM
Panasonic
etc.

を個別Driver / SDKで吸収できる構造にする。

==================================================
9. OFFICIAL CABLE PROGRAM
==================================================

USB-Cはケーブル品質差が大きいため、

SUITE VERIFIED CABLE

制度を作れる構造にする。

公式動作確認済みケーブル：

- 接続確認
- RAW転送確認
- 長時間撮影確認
- iPhone確認
- iPad確認
- Camera Model確認

を行う。

非認定ケーブルでも使用禁止にはしない。

ただし表示：

「SUITE認定ケーブル以外では
通信速度・接続安定性を保証しません」

公式ケーブルは将来的に
SUITEアクセサリーとして販売可能にする。

==================================================
10. RAW DEVELOPMENT
==================================================

最低限以下を実装対象とする。

- White Balance
- Tint
- Exposure
- Contrast
- Highlight
- Shadow
- White
- Black
- Temperature
- Saturation
- Vibrance
- HSL
- Tone Curve
- Sharpness
- Noise Reduction
- Lens Correction
- Crop
- Rotation

処理順序を固定せず、
RAW pipelineとして明示的に管理する。

==================================================
11. AUTO DEVELOP
==================================================

ユーザーがRAWを読み込むと、

AI AUTO

を実行できる。

AIが以下を分析：

- 人物
- 肌
- 顔
- 背景
- 光
- 色温度
- 露出
- 撮影シーン
- カメラ差
- シリーズ内の色差

結果をEdit Recipeとして保存する。

AI処理結果も
ユーザーが後から全項目を変更可能とする。

==================================================
12. AI PORTRAIT RETOUCH
==================================================

人物レタッチは主要機能。

最低対象:

肌
肌荒れ
シミ
クマ
シワ
テカリ
目
歯
輪郭
顎
顔幅
目の明るさ
目の大きさ
歯の白さ
髪の乱れ
etc.

基本UX:

AUTO
+
Slider

AUTOで自然な標準値を設定。

その後、

0〜100
または
-100〜+100

の範囲で調整。

初期状態で過剰加工しない。

==================================================
13. BODY RETOUCH
==================================================

生成AIではなく、
可能な処理はローカル画像変形を優先する。

候補:

- Waist
- Stomach
- Arm
- Shoulder
- Leg
- Height impression
- Hip
- Posture
- Face width
- Jaw

人物Segmentation
+
Body Landmark
+
Mesh Deformation

を基本構造とする。

最重要：

人物補正によって
背景を曲げてはいけない。

壁
柱
ドア
床
窓
水平線

などが変形しないよう
人物Maskと背景保護を行う。

==================================================
14. PERSON-BASED BATCH RETOUCH
==================================================

SUITEの核。

同一人物をPerson IDとして認識。

例：

PERSON A
Skin +15
Face Width -7
Waist -10

と設定した場合、

その撮影セット内の
PERSON Aが写る写真へ
一括適用可能にする。

適用単位:

- この1枚
- 選択写真
- この人物
- 撮影セット全体
- プロジェクト全体

を選択可能にする。

==================================================
15. COLOR / LOOK ENGINE
==================================================

色味も主要機能。

単なるLUT適用だけにしない。

RAW Adjustment
+
Curve
+
Color Matrix
+
HSL
+
Selective Skin Protection

を組み合わせられる構造にする。

Look名称には
実在する現役写真家の氏名を使用しない。

例：

VIVID BLOOM
SOFT BLUE
MILKY DAY
DEEP CINEMA
CLEAR SKIN
GOLDEN MEMORY

等の独自名称。

==================================================
16. PERSONAL COLOR / SKIN TONE
==================================================

人物の肌色を分析し、

COOL
NEUTRAL
WARM

などの色傾向を算出可能にする。

日本向けUIでは
必要に応じて

ブルベ
ニュートラル
イエベ

という理解しやすい表現を検討できるが、
法務・商標確認後に正式決定する。

重要：

これは人種等を推定する機能ではない。

写真上の肌色と光環境を解析し、
色補正を最適化する機能として設計する。

目的：

Lookを適用しても
肌色が破綻しないこと。

==================================================
17. CATEGORY MODE
==================================================

用途ごとにモードを作れる。

例：

- Wedding
- 七五三
- 成人式
- Family
- Anniversary
- Portrait
- 宣材
- Studio
- School
- Event

モードには、

Color
Skin
Portrait Retouch
Crop
Suggested Background
Export

等の推奨設定を紐付ける。

==================================================
18. GENERATIVE AI
==================================================

通常現像と生成AIを料金体系上分離する。

通常月額内：

- RAW現像
- 色補正
- AI人物補正
- Body補正
- Preset
- Batch処理
- 基本書き出し

従量課金：

- 背景生成
- 背景交換
- 高度な不要物除去
- 衣装変更
- 天候変更
- 大規模修復
- AIデザイン生成

==================================================
19. GENERATIVE MODES
==================================================

Wedding:

白ホリ
↓
Chapel
Resort
Garden
European
etc.

七五三:

和室
神社
紅葉
桜
庭園
etc.

成人式:

Flowers
Modern Japanese
Luxury
Artistic
etc.

Anniversary:

Birthday
Family
Seasonal
Celebration

等を用意可能にする。

==================================================
20. PREVIEW == FINAL PRINCIPLE
==================================================

重要。

生成背景について、

プレビューと納品画像の世界観が
変わってはいけない。

禁止:

Preview生成
↓
Final時に再度ゼロから生成
↓
全く違う背景

これを禁止する。

推奨方式：

最初の生成時点で
Canonical Background Assetを確定。

- Prompt
- Seed
- Model
- Mask
- Composition
- Lighting reference
- Background asset
- Color data

を保存。

Final時は
同じ背景Assetを高解像度化し、
人物原本と再合成する。

つまり、

PREVIEW IS THE MASTER DESIGN.

Finalは
同じデザインの高解像度版とする。

==================================================
21. IDENTITY LOCK
==================================================

人物生成の絶対条件。

FACE MUST NOT CHANGE.

背景
衣装
天候

を変更しても、

人物の本人性を変更しない。

Identity Protection Engineを実装。

変更前
vs
変更後

の顔特徴を比較。

一定以上変化した場合は
生成結果をRejectする。

顔全体を生成し直す方法を
デフォルトにしない。

人物写真では
顔・重要特徴を保護Mask対象にする。

==================================================
22. OBJECT REMOVAL
==================================================

不要物除去を搭載。

対象例：

- 電柱
- 看板
- ゴミ
- 通行人
- ケーブル
- 背景物
- 小物

簡易除去は通常機能としてもよい。

大規模生成Fillは
Generative Credit対象にできる構造にする。

==================================================
23. WEATHER
==================================================

Wedding
七五三
成人式
Event

等で利用。

例：

Cloudy
→
Sunny

ただし単なる空差し替えではなく、

人物
地面
建物
影
色温度

を整合させる。

==================================================
24. SHARE
==================================================

撮影直後から
モデル / クライアントへ共有可能にする。

方法：

- iOS Share Sheet
- AirDrop
- Gallery Link
- QR
- Cloud Gallery

共有時に選択：

Preview
JPEG
Full JPEG

等。

クライアントセレクト用途では
Proxyを利用可能にする。

==================================================
25. CLIENT GALLERY
==================================================

ブラウザで閲覧可能なGallery。

クライアントはアプリ不要。

最低機能：

- 写真閲覧
- お気に入り
- Selection
- Download Permission
- Comment optional
- Gallery expiration optional

撮影者側で権限を設定可能にする。

==================================================
26. CLOUD-FIRST STORAGE
==================================================

クラウドをSUITEの重要な商品価値とする。

ユーザーのPC故障、
iPhone故障、
ストレージ故障

で写真を失わないことを重視する。

ただし
「100%絶対に消えない」
という表現は技術的に使用しない。

高耐久
冗長化
検証
復元性

を追求する。

==================================================
27. ORIGINAL / PROXY / RECIPE
==================================================

クラウドで管理する対象：

A.
Original RAW

B.
Proxy

C.
Edit Recipe

D.
Generated Asset

E.
Exported Image optional

各ファイルを分離管理する。

==================================================
28. CROSS DEVICE
==================================================

重要要件：

iPhoneで取り込み
↓
iPadで編集
↓
Macで書き出し

または

iPhoneで取り込み
↓
iPadで書き出し

を可能にする。

つまり、
クラウド同期済みの写真は
どの対応端末からでも
Full Export可能にする。

そのためOriginal RAWが
クラウドへ安全に同期されている必要がある。

==================================================
29. UPLOAD SAFETY
==================================================

Original RAW upload時：

01 Upload
02 Checksum
03 Server verification
04 Object persistence verification
05 DB commit
06 Upload complete

まで終わって初めて

CLOUD SAFE

扱いにする。

途中でアプリ終了しても
Resume可能にする。

端末側Originalを
勝手に削除してはいけない。

==================================================
30. SOFT DELETE
==================================================

ユーザーが写真を削除しても
即時物理削除しない。

Trash / Recoveryを用意。

誤削除対策を行う。

ストレージ料金と
保存期間のルールは
後から管理画面で変更可能にする。

==================================================
31. STORAGE PROVIDER
==================================================

現時点で
R2 / S3等をコードへ固定しない。

StorageProvider interfaceを作る。

候補：

Cloudflare R2
AWS S3
その他S3-compatible

比較対象：

- 保存料金
- API料金
- Egress
- Japan latency
- durability
- availability
- disaster recovery
- replication
- versioning
- support
- scale

最終Provider決定前に
実コストベンチマークを行う。

==================================================
32. STORAGE PLAN
==================================================

容量ベース課金に対応。

例：

100GB
500GB
1TB
2TB
3TB
5TB
10TB

ただし価格は
コードへハードコード禁止。

Remote Config / Product Tableから変更可能にする。

ユーザーは
いつでも容量追加可能。

==================================================
33. STORAGE COST ACCOUNTING
==================================================

ユーザーごとに、

Stored GB
Upload GB
Download GB
API operations
Proxy GB
Generated GB

を計測可能にする。

管理側では、

Revenue
Storage Cost
AI Cost
Payment Fee
Gross Margin

を確認可能にする。

ストレージ事業が
赤字化しないよう
Cost Observatoryを実装する。

==================================================
34. PRESET
==================================================

Presetには、

RAW Adjustment
Color
Skin
Portrait
Body
Look
optional Crop

を保存できる。

個人Preset
Studio Preset
Community Preset

に分類する。

==================================================
35. COMMUNITY
==================================================

Preset Communityを作る。

ただし、

PRESET MARKETPLACE != PAID MARKETPLACE

とする。

ユーザー同士のPreset共有は
原則無料。

理由：

少額決済
売上分配
決済処理
本人確認
会計

を発生させないため。

最低機能：

- Publish
- Download / Save
- Apply
- Before / After
- Ranking
- Save Count
- Category
- Report

Presetに実行コードを含めない。

設定値のみとする。

==================================================
36. COMMUNITY ACCESS
==================================================

コミュニティはWeb中心でもよい。

アプリ内から

Community

を押す。

Universal Link / Deep Link経由で
Webへ遷移可能。

WebでPreset追加後、
アプリへ反映。

==================================================
37. STUDIO / TEAM WORKSPACE
==================================================

写真館、
撮影会社、
複数スタッフ向け。

Workspaceを作る。

例：

ABC PHOTO STUDIO

Owner
Editor
Viewer

複数スタッフが、

同一Project
同一RAW
同一Preset
同一Gallery

を利用可能。

==================================================
38. STUDIO PRESET
==================================================

店舗専用Presetを作れる。

例：

ABC Studio
七五三_STANDARD

ABC Studio
Wedding_HIGH KEY

等。

スタッフ全員が同じ仕上げを使用できる。

写真館の品質を統一する。

==================================================
39. EDIT CONFLICT
==================================================

複数スタッフが
同時に同一写真を編集した場合の
Conflict管理を実装。

最低限：

Edit version
Editor
Timestamp

を持つ。

勝手に上書きしてはいけない。

==================================================
40. EXPORT
==================================================

一括書き出し
1枚書き出し

両方対応。

最低Format:

JPEG
TIFF

設定：

Quality
Pixel dimension
PPI
Color profile
Naming
Folder / Album

==================================================
41. SOCIAL EXPORT
==================================================

SNS用Preset。

例：

Instagram Feed
Instagram Portrait
Instagram Story
TikTok
X
etc.

仕様はRemote Configで更新できるようにする。

==================================================
42. PRINT EXPORT
==================================================

SUITE独自の重要機能。

ユーザーに
「3:2」だけを考えさせない。

実際の印刷サイズで選ばせる。

日本向け：

A Series
B Series
写真用紙規格

を実装する。

A0
A1
A2
A3
A4
etc.

JIS B:

B0
B1
B2
B3
B4
etc.

加えて、

B0倍判等の大型出力
Custom Size

にも対応。

==================================================
43. JAPANESE PHOTO SIZE
==================================================

写真プリント用として、

六切
四切
半切
全紙

等をPreset化。

正式寸法は
実装時にJIS/印刷規格を確認し、
データとして保持。

寸法をコードへ散在させない。

==================================================
44. PRINT PREVIEW
==================================================

例：

元画像
3:2

↓

A1

を選択すると、

どこがCropされるか
即時Overlay表示。

ユーザーが、

Move
Zoom
Crop

で調整。

印刷所に渡す前に
構図を確定できる。

==================================================
45. 300 PPI CHECK
==================================================

Print Modeでは、

Print Size
Pixel Dimension

から

Effective PPI

を自動算出。

300ppi以上：

GOOD

不足：

WARNING

を表示。

ただし
300ppi未満を絶対禁止にはしない。

大型展示では
Viewing Distance等により
適正値が変わるため。

==================================================
46. UPSCALE
==================================================

必要画素数が不足した場合：

AI UPSCALE

を提示。

これは処理方式と原価に応じて

Standard
または
Generative Credit

に分類可能。

最終判断はCost計測後。

==================================================
47. PRINT WORKFLOW
==================================================

理想：

RAW
↓
SUITE
↓
A0/B0等を選択
↓
Crop確認
↓
PPI確認
↓
必要ならUpscale
↓
JPEG/TIFF
↓
印刷会社

Illustrator等を
途中に挟まなくても済むことを目標とする。

==================================================
48. GENERATIVE DESIGN
==================================================

写真を使った、

Wedding Invitation
Welcome Board
Announcement
SNS Visual

等も将来作成可能。

ただしCore RAW Workflowとは
別モジュールに分離。

安価な生成モデルと
高品質モデルを
自動Route可能にする。

==================================================
49. GENERATIVE MODEL ROUTING
==================================================

全処理を
最高価格の生成AIへ投げない。

例：

背景案Preview
→ Low Cost Model

Final Background
→ High Fidelity Model

Simple Design
→ Low Cost Model

人物高精度合成
→ High Fidelity Model

ルーティングは
Server側Configで変更可能にする。

==================================================
50. GENERATIVE BILLING
==================================================

ユーザーには
生成クレジットで表示。

内部では：

Provider Cost
Retry Cost
Failure Rate
Apple Fee
Payment Fee
Margin

を記録。

PreviewとFinalを区別。

基本案：

Preview
= no user credit

Final Apply
= credit consumed

ただし濫用防止の
Rate Limitは設ける。

==================================================
51. MOBILE BILLING
==================================================

iOS/iPadOSでは
App Store規約に従った課金構造を使う。

コード側では、

Apple IAP
Web Billing
Future Payment Provider

を分離する。

Entitlement Serviceを中央化。

料金をアプリへハードコードしない。

==================================================
52. PLAN STRUCTURE
==================================================

料金構成を技術上以下に分離可能にする。

MOBILE
iPhone + iPad

DESKTOP
Mac + Windows

ALL
Mobile + Desktop

STUDIO
Team Workspace

CLOUD STORAGE
容量追加

GENERATIVE AI
Credit追加

正式金額は
事業側Product Tableで決定。

==================================================
53. LOCAL-FIRST + CLOUD OPTION
==================================================

無料または低価格ユーザー向けに、

Local Only

も技術上可能にする。

ただしLocal Onlyでは、

Cross Device Full Export
Cloud Backup

は利用不可。

Cloud Syncを有効にすると、

Original RAW
Proxy
Recipe

を同期。

==================================================
54. DEVICE STORAGE
==================================================

端末ストレージを
無限に消費しない。

Cache Managerを実装。

Original:

必要時のみ保持可能。

Proxy:

LRU Cache。

ただし
Cloud uploadの安全確認前に
Originalを自動削除してはならない。

==================================================
55. OFFLINE
==================================================

撮影現場で
通信がない場合でも、

Tether
Proxy
Edit
Preset
Select

は利用可能。

通信復旧後、

Background Sync。

撮影そのものを
ネット接続必須にしてはいけない。

==================================================
56. BATTERY / THERMAL
==================================================

iPhone撮影中は
バッテリー・熱問題がある。

常時Full RAW AI処理を禁止。

Proxy中心。

Thermal Stateを監視。

端末温度上昇時：

- AI concurrency低下
- Background upload低下
- Export priority変更

等を行う。

==================================================
57. BACKGROUND TASK
==================================================

可能な範囲で、

RAW Upload
Proxy Upload
Cloud Sync
Export

をBackground Task化。

iOSによるSuspensionを考慮し、
途中状態を必ず保存。

再起動時にResume。

==================================================
58. PERFORMANCE
==================================================

CPUだけに依存しない。

Metal
GPU
Neural Engine
Core ML

を適切に使う。

ただし、

FAST != BATTERY DESTROY

とする。

速度、
熱、
バッテリー、

を同時評価する。

==================================================
59. SECURITY
==================================================

必須：

TLS
Encryption at rest
Tenant isolation
Signed URLs
Short-lived access
Audit log
Least privilege
Secure token storage

RAWは公開URLで保持しない。

==================================================
60. PRIVACY
==================================================

人物写真を扱うため
Privacyを重要要件とする。

Face Embedding等を使う場合、

可能な限りOn-deviceで処理。

不要な生体特徴量を
恒久Cloud保存しない。

必要な場合は
目的と保存期間を明示。

==================================================
61. BACKUP / RECOVERY
==================================================

Storage Provider障害、
DB障害、
誤削除

に備える。

Versioning
Replication
Backup
Recovery Test

を設計。

単に
「クラウドだから安全」
で済ませない。

==================================================
62. DATABASE
==================================================

DBにRAW binaryを直接保存しない。

DB：

Users
Projects
Assets
Recipes
Presets
Workspaces
Permissions
Billing
Jobs
Storage metadata

Object Storage：

RAW
JPEG
TIFF
Proxy
Generated Asset

と分離する。

==================================================
63. PICASSO / DA VINCI REUSE
==================================================

新規実装前に必ず
既存Picasso / da Vinci系実装を監査。

再利用候補：

- Image generation gateway
- Job queue
- Credit
- Provider routing
- Prompt management
- Asset management
- Error handling
- Cost logging
- Generation status
- API integration

動作済みコードが存在する場合、
同機能をゼロから作り直してはいけない。

COMMON FAILURE CONTROLS SHOULD BE REUSED.

==================================================
64. APP UX
==================================================

Mobile First。

撮影中に
細かい文字を大量に読ませない。

Main Flow:

CAMERA
PROJECT
EDIT
SELECT
SHARE
EXPORT

を最短で移動。

高度設定は
Progressive Disclosure。

初心者には
AUTO中心。

プロには
Detailed Controls。

==================================================
65. IPHONE
==================================================

iPhoneは
簡易版扱いにしない。

SUITEの正式な主端末。

以下を可能にする：

Tether
Import
Edit
AI
Select
Share
Export
Cloud
Preset

==================================================
66. IPAD
==================================================

iPadでは
大画面を利用。

Split View的UI:

Image
+
Adjustment

を中心にする。

Apple Pencil等は
将来的なMask Editで利用可能。

==================================================
67. DESKTOP FUTURE
==================================================

Mobile版完成後に

Mac
Windows

へ展開。

Desktopでは：

- 大量Batch
- Advanced Color
- Multi-monitor
- Full Export
- Studio workflow

等を強化可能。

ただしEdit Recipe形式は
Mobileと完全共通にする。

==================================================
68. WEB
==================================================

Web V1：

- Account
- Storage
- Gallery
- Presets
- Community
- Studio
- Billing
- Project overview

本格RAW Editorは
V1必須ではない。

==================================================
69. STUDIO BUSINESS MODEL SUPPORT
==================================================

写真館等では
複数Seatを利用。

料金構造として：

Workspace
+
Seats
+
Storage

を組めるようにする。

2〜3人規模から
大規模スタジオまで
拡張可能にする。

==================================================
70. OBSERVABILITY
==================================================

最低限、

Tether success rate
RAW import failure
Proxy generation time
AI processing failure
Export failure
Cloud upload failure
Sync conflict
Generation failure
Identity rejection
App crash
Thermal warning

を収集。

カメラModel別、
端末Model別にも追跡可能にする。

==================================================
71. COST OBSERVABILITY
==================================================

SUITEは
安価提供が重要なため、

1 user / month
1 RAW
1 GB
1 generation

あたりの原価を追跡。

Cost dashboardを用意。

==================================================
72. CAMERA COMPATIBILITY TEST
==================================================

対応を謳うカメラは
実機検証必須。

「理論上つながる」
ではSupported扱いにしない。

Supported
Beta
Unsupported

に分類。

==================================================
73. HARDWARE TEST MATRIX
==================================================

最低：

iPhone USB-C generations
iPad USB-C generations

について

Camera
Cable
RAW Size
Burst
Long Session
Battery
Heat

を検証。

==================================================
74. QUALITY GATE
==================================================

Release前に最低検証：

100 RAW
500 RAW
1000 RAW

Batch処理。

- Crashしない
- Edit Recipe欠損なし
- Original破損なし
- Sync欠損なし
- Export欠損なし

を確認。

==================================================
75. GENERATIVE QUALITY GATE
==================================================

人物生成処理では、

Identity consistency
Face geometry
Hands
Hair
Edge
Lighting
Skin
Background integration

を検査。

Identity Gate失敗時は
Finalとして提供しない。

==================================================
76. BODY RETOUCH QUALITY GATE
==================================================

人物体型変更後、

背景の直線歪み
Halo
Mask leak
Repeated texture
Edge artifact

をチェック。

==================================================
77. PRINT QUALITY GATE
==================================================

サイズ計算：

mm
inch
pixel
PPI

の計算Unit Testを作る。

A/B/写真規格を
目視だけで実装してはいけない。

==================================================
78. CLOUD SAFETY GATE
==================================================

Original RAWは、

Checksum Verified
Object Exists
Metadata Exists
Permission Verified

を通過して初めて

Synced

表示。

==================================================
79. APP STORE RELEASE GATE
==================================================

iOSリリース前に：

- Billing
- Privacy
- Photo permission
- Camera access
- External accessory
- Cloud
- Account deletion
- Subscription management
- Restore purchases
- Data collection disclosure

を検査。

==================================================
80. DEVELOPMENT PHASES
==================================================

PHASE 0
Existing asset audit

METIS
Picasso
da Vinci
既存Cloud / AI処理

を監査。

再利用Mapを作る。

--------------------------------

PHASE 1
Mobile Core

iPhone / iPad

Project
RAW Import
Proxy
Edit Recipe
Basic Color
Export

--------------------------------

PHASE 2
Tether

USB camera connection
Auto import
Proxy preview
Compatibility matrix

--------------------------------

PHASE 3
Portrait AI

Person
Face
Skin
Body
Batch

--------------------------------

PHASE 4
Cloud

RAW
Proxy
Recipe
Cross-device
Recovery

--------------------------------

PHASE 5
Share

Gallery
AirDrop
Client Select

--------------------------------

PHASE 6
Print

A/B
Photo sizes
300ppi
Upscale

--------------------------------

PHASE 7
Generation

Background
Weather
Object
Clothes
Identity Lock

--------------------------------

PHASE 8
Community

Free Preset sharing
Ranking
Save

--------------------------------

PHASE 9
Studio

Workspace
Seats
Shared project
Shared preset

--------------------------------

PHASE 10
Desktop

Mac
Windows

==================================================
81. FIRST RELEASE SCOPE
==================================================

最初から全機能完成を待たない。

商用V1の最小ライン：

iPhone
iPad
RAW Import
Proxy
Basic RAW Development
Auto Color
AI Portrait
AI Body
Preset
Batch
JPEG/TIFF Export
Cloud Sync
Basic Sharing

Tetherは
対応カメラを限定してでも
早期投入を目標とする。

==================================================
82. DO NOT DO
==================================================

以下は禁止。

- 原本RAWを書き換える
- 生成のたびに顔を変える
- PreviewとFinalを別物にする
- 何でもクラウドAIへ送る
- 全画像をFull Resolutionで常時処理
- App料金をコードに固定
- Storage providerに密結合
- Camera vendorに密結合
- 有料Preset Marketplaceを作る
- 公式未確認カメラをSupported表示
- クラウド同期完了前にRAWを削除
- Desktopを優先してMobileを後回しにする
- 既存Picasso/da Vinci実装を調査せず再実装する

==================================================
83. CODEX FIRST TASK
==================================================

実装を開始する前に必ず以下を報告する。

1.
既存コードベース一覧

2.
METISから継承可能なCore

3.
Picasso / da Vinciから再利用可能な処理

4.
新規実装が必要なモジュール

5.
iPhone/iPadで利用可能なRAW処理方式

6.
iPhone/iPadで利用可能なTether方式

7.
Camera Vendor SDK依存箇所

8.
On-device AI候補

9.
Cloud AIが必要な処理

10.
Storage候補比較

11.
App Store制約

12.
商用ライセンス確認が必要なLibrary

13.
推奨Repository構成

14.
実装Phaseと依存関係

15.
リスク一覧

16.
最短MVPルート

報告前に、
大規模な実装・リファクタ・デプロイを開始しないこと。

==================================================
84. PRODUCT PRINCIPLES
==================================================

SUITEの基本原則：

SHOOT ONCE.
EDIT ANYWHERE.
EXPORT ANYWHERE.

RAW IS IMMUTABLE.

PREVIEW == FINAL INTENT.

AI SHOULD REMOVE WORK,
NOT REMOVE CONTROL.

GENERATIVE COST
SHOULD BE PAID ONLY
WHEN GENERATIVE WORK IS NEEDED.

CLOUD IS PART OF THE PRODUCT,
NOT JUST BACKUP.

MOBILE IS NOT A COMPANION APP.
MOBILE IS THE PRODUCT.

COMMUNITY PRESETS ARE FREE.

THE USER OWNS THE LOOK.

THE FACE MUST REMAIN THE PERSON.

==================================================
END
==================================================

