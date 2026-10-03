# SUITE 追加指示書
# EVOTO DEEP FEATURE PARITY AUDIT v3
# AI Lab / Background / Specialized Retouch / Platform差分追加監査

既存のEVOTO DEEP FEATURE PARITY AUDIT v2を置換しないこと。
本指示は追加監査仕様として統合する。

既存147節、固定6文書、NON-DESTRUCTIVE原則、RAW原本不変、Proxy編集、Recipe分離、Cloud Safe、Mobile Release First、既存Evoto差分Matrixを維持したまま進めること。

今回さらにEvoto公式機能を確認した結果、従来の大分類では拾い切れていない専門機能・AI Lab機能・背景合成機能・Platform差分が存在する。

したがってEvotoとの差分監査はまだ完了扱いにしない。

==================================================
1. 最重要修正
==================================================

Evoto監査を、

「Portraitあり」
「Backgroundあり」
「AI Labあり」

というレベルで終了させない。

各機能について必ず、

機能
↓
サブ機能
↓
操作項目
↓
調整値
↓
対応Platform
↓
Batch対応
↓
人物別対応
↓
処理方式
↓
Credit消費
↓
SUITE実装状態

まで分解する。

今回追加で発見した機能を起点として、
同様の見落としが他カテゴリにも存在しないか再監査する。


==================================================
2. MATRIXに追加する共通列
==================================================

EVOTO_FEATURE_MASTERおよび各カテゴリMatrixに
最低限以下の列を追加する。

- Evoto Category
- Evoto Feature
- Evoto Sub-feature
- Option / Slider
- Desktop Windows
- Desktop macOS
- iPad
- iPhone / Mobile
- Batch対応
- Person-specific対応
- Group Photo対応
- Local処理候補
- Cloud AI / Generative処理
- Credit消費
- Credit Free
- Preset保存可否
- Sync可否
- RAW対応
- JPEG対応
- SUITE Status
- SUITE Implementation Type
- P0 / P1 / P2 / P3
- Evidence
- Notes

SUITE Statusは既存分類：

A 実装済み・検証済み
B 実装済み・未検証
C 仕様済み・未実装
D 未仕様化
E SUITE独自方式で代替
F 不要候補
G Evoto公式で存在未確認
H Platform固有
I SUITE独自

を維持する。


==================================================
3. GENERATIVE EXPAND
==================================================

EvotoのGenerative Expandを独立機能として監査する。

最低限：

- Canvas Expansion
- Free Expand
- Preset Ratio
- 1:1
- 4:5
- 5:7
- 2:3
- 16:9
- Landscape
- Portrait
- Generate candidates
- Candidate count
- Edge continuity
- Background continuation
- Subject preservation
- Resolution
- Credit consumption
- Mobile対応
- Desktop対応

SUITE側では、

通常Crop

と

Generative Expand

を明確に別機能として扱う。

既存のA/B判・B0倍等で足りない領域を
生成で拡張する場合にも利用可能か検討する。

ただしPrint Export時に
ユーザーへ無断で生成拡張してはならない。


==================================================
4. AI BACKGROUND FUSION
==================================================

背景生成・背景交換だけでなく、
EvotoのAI Background Fusion相当を詳細監査する。

最低限：

- Subject Detection
- Subject + Related Object Detection
- Foreground Layer
- Background Layer
- Subject Move
- Subject Scale
- Subject Rotation
- Subject Flip
- Character Lighting
- Background Lighting Match
- Color Match
- Perspective consistency
- Edge refinement
- Subject preservation
- Identity preservation
- Batch
- Credit

SUITE Wedding / 七五三 / 成人式 /
Anniversary Modeに直接関係するためP0/P1候補として評価。


==================================================
5. SMART REMOVAL
==================================================

「不要物除去」一項目にまとめない。

最低限：

- Magic Removal
- Quick Removal
- Object selection
- Brush selection
- Auto object detection
- Subject Protection
- Edge Optimization
- Foreground protection
- Background reconstruction
- Small object
- Large object
- Local repair
- Generative repair
- Batch
- Credit

SUITEでは、

Local Removal

と

Generative Removal

を別処理として設計済み／未設計か確認。


==================================================
6. PEOPLE REMOVAL
==================================================

通行人除去を独立機能として監査。

最低限：

- Automatic Person Detection
- Remove People
- Preserve Main Subject
- Background reconstruction
- Multiple people
- Batch Edit
- Selection
- False positive handling
- Credit
- Mobile / Desktop

Wedding、七五三、観光写真、Event用途で重要。

P1以上の候補として評価。


==================================================
7. CLOTHING MOIRE REMOVAL
==================================================

Clothing Moiré Removalを独立項目として追加。

最低限：

- Moiré Detection
- Clothing-specific detection
- Fine pattern
- Lace
- Check
- Stripe
- Fabric detail preservation
- Color preservation
- Amount
- Batch
- RAW
- JPEG
- Mobile / Desktop

写真館、Wedding、宣材写真で利用頻度が高い可能性がある。

SUITE未仕様ならDとして登録し、
P0/P1評価を行う。


==================================================
8. STRONG GLARE REMOVAL
==================================================

通常のGlasses Glare Removalと
Strong Glare Removalを分離。

最低限：

- Standard Glasses Glare
- Strong Glare
- Lens reflection detection
- Eye preservation
- Iris reconstruction
- Eyelash preservation
- Frame preservation
- Left / Right eye
- Batch
- Credit
- Failure case

眼鏡反射除去を一機能としてまとめない。


==================================================
9. BELLY SLIMMING
==================================================

通常Body Reshapeとは別に、
生成AI型Belly Slimmingの有無・方式を調査。

最低限：

- Belly Detection
- Abdomen slimming
- Clothing preservation
- Background preservation
- Body shape consistency
- Amount
- Batch
- Credit

SUITEのLocal Mesh Body Retouchと比較し、

Localで十分
Generativeが必要

の境界を整理する。


==================================================
10. GRASS FILL
==================================================

Grass Fillを独立監査する。

最低限：

- Grass area detection
- Missing grass fill
- Texture continuity
- Temperature
- Tint
- Saturation
- Brightness
- Foreground protection
- Subject edge
- Batch
- Credit

Wedding
Family
七五三
Outdoor

で利用価値を評価。


==================================================
11. HAIR GENERATIVE FEATURES
==================================================

通常Hair Colorと生成Hair機能を分ける。

最低限：

- Hair Color
- Golden Blonde Hair
- Existing hairstyle preservation
- Hair edge
- Hair texture
- Face preservation
- Skin preservation
- Amount
- Color
- Batch
- Credit

Evotoに他のHair生成機能があれば追加。


==================================================
12. BODY HAIR REMOVAL
==================================================

体毛除去を独立項目とする。

最低限：

- Arm Hair
- Leg Hair
- Body Hair
- Skin texture preservation
- Tattoo preservation
- Clothing boundary
- Amount
- Batch
- Platform availability
- Region availability

地域限定機能の場合：

REGION_SPECIFIC

として記録する。


==================================================
13. LIQUIFY BACKGROUND REPAIR
==================================================

重要。

体型補正による背景歪み修復機能を独立監査する。

最低限：

- Liquify detection
- Bent line detection
- Wall repair
- Door repair
- Window repair
- Floor line repair
- Texture repair
- Background reconstruction
- Subject protection
- Before / After
- Batch
- Credit

SUITEでは既に、

「Body Retouchで背景を曲げない」

ことを品質要件としている。

比較は：

A.
最初から背景を保護する

B.
補正後に背景を修復する

の2方式として整理する。

SUITE側は必要に応じて両方式併用を検討。


==================================================
14. OLD PHOTO RESTORATION
==================================================

古写真修復を独立機能として追加。

最低限：

- Old Photo Restoration
- Scratch Repair
- Damage Repair
- Blur Repair
- Face Restore
- B&W Colorization
- Color restoration
- 2K output
- 4K output
- Resolution enhancement
- Credit
- Platform

SUITE主用途から外れる場合も
勝手に削除せずF候補にする。


==================================================
15. MOTION BLUR / GHOST FLOW
==================================================

Evoto Mobile AI Lab等に存在する
Motion Blur / Ghost Flowを監査。

最低限：

- Motion Blur
- Ghost Flow
- Long Exposure simulation
- Direction
- Strength
- Subject protection
- Background motion
- Credit
- Mobile onlyか

SUITEで不要の場合はF候補。


==================================================
16. RELIGHT
==================================================

Relightを一括項目にしない。

最低限：

- Natural Light
- Face Shadow Removal
- Golden Hour
- Subject Relight
- Face Relight
- Background interaction
- Light direction
- Light strength
- Color temperature
- Skin protection
- Identity preservation
- Batch
- Credit

SUITE Wedding Mode等と関連するため
P1以上を検討。


==================================================
17. EDGE CLEANUP
==================================================

背景交換後処理として独立監査。

最低限：

- Black Edge Removal
- White Edge Removal
- Halo Removal
- Hair Edge
- Clothing Edge
- Fine detail
- Transparency handling
- Batch

Background replacementの一部として埋没させない。


==================================================
18. COLOR SPILL REMOVAL
==================================================

Remove Spillを独立機能化。

最低限：

- Green spill
- Blue spill
- Background color reflection
- Skin spill
- Clothing spill
- Hair spill
- Strength
- Selective correction
- Batch

白ホリ→チャペル等のSUITE構想では重要。


==================================================
19. FLOOR REFLECTION
==================================================

背景合成機能として、

- Floor Reflection
- Reflection intensity
- Reflection blur
- Reflection position
- Perspective
- Fade
- Subject alignment

を監査。

Wedding / Studio背景生成に応用可能。


==================================================
20. SHADOW ENGINE
==================================================

影を一項目にしない。

最低限：

- AI Retain Shadows
- Original Shadow preservation
- Soft Shadow
- Hard Shadow
- Drop Shadow
- Shadow direction
- Shadow strength
- Shadow blur
- Shadow opacity
- Shadow distance
- Floor interaction

背景合成の自然さに直結するためP1候補。


==================================================
21. BACKGROUND COMPOSITING CONTROLS
==================================================

最低限：

- Blend Mode
- Opacity
- Background Size
- Position X
- Position Y
- Rotation
- Flip
- Background Blur
- Foreground placement
- Scale
- Depth perception
- Layer order

背景変更を
「画像を差し替えるだけ」
として実装しない。


==================================================
22. MASK SUB-REGIONS
==================================================

Maskingをさらに細分化する。

人物Mask内で、

- Face
- Facial Skin
- Eyes
- Teeth
- Hair
- Lips
- Clothing
- Upper body
- Lower body
- Full body

等の部分選択が可能か公式確認。

Evotoに存在する実際のMask sub-regionを全列挙。


==================================================
23. IPAD EXPORT DESTINATIONS
==================================================

iPad版のExport先を独立監査。

最低限：

- Photos
- Files
- iCloud Drive
- Google Drive
- External Storage
- Share Sheet
- AirDrop
- Other providers

SUITEでは：

- Local
- Files
- iCloud Drive
- AirDrop
- Share Sheet
- Cloud Library

を比較。


==================================================
24. PRESET CROSS-PLATFORM COMPATIBILITY
==================================================

Presetの存在だけではなく、
Platform間互換性を調査。

最低限：

- Desktop → iPad
- iPad → Desktop
- Mobile → Desktop
- unsupported setting behavior
- partial application
- warning
- preset version
- missing feature handling

SUITEでは全端末Recipe共通を目標とするため重要。


==================================================
25. CLOUD PLATFORM DIFFERENCE
==================================================

Evoto Cloudについて：

- Windows
- macOS
- iPad
- iPhone

ごとの対応状態を記録。

Cloud Spaceが利用できるPlatformと
利用できないPlatformを明確にする。

SUITEは：

iPhone
iPad

をCloud-first主端末とするため、
差別化候補として記録。


==================================================
26. PHOTO RESTORATION / ENHANCEMENT
==================================================

Old Photo以外にも、

- Denoise
- Deblur
- Sharpen
- Super Resolution
- Face Restore
- Compression Repair
- Detail Restore

等のAI Lab系Enhance機能がないか再調査。


==================================================
27. SPECIALIZED REMOVAL SWEEP
==================================================

Evotoが一般Object Removalとは別に提供する
専用Removalを全探索する。

例：

- People
- Body Hair
- Glasses Glare
- Strong Glare
- Moiré
- Flyaway
- Background distractions
- Color spill
- Shadow
- Wrinkle
- Acne
- Freckles
- Veins

専用AIが存在する場合は
Generic Removalと別Featureにする。


==================================================
28. SPECIALIZED GENERATION SWEEP
==================================================

以下のCategoryを横断して
専用生成AIを全探索。

- Background
- Hair
- Clothing
- Body
- Light
- Weather
- Grass
- Sky
- Restore
- Expand
- Shadow
- Reflection

機能名だけでなく、

INPUT
MASK
OUTPUT
OPTIONS
CREDIT

まで記録。


==================================================
29. MOBILE-ONLY FEATURE SWEEP
==================================================

Mobile版専用機能を別途全探索。

Desktop公式Docsだけで
Feature Masterを完成させない。

Evoto Mobile Supportの全Articleを一覧化し、

Feature Masterとの未一致を検出。

Missing Feature = 0

になるまで終了しない。


==================================================
30. IPAD-ONLY FEATURE SWEEP
==================================================

iPad版も独立監査。

特に：

- Tether
- Wireless Tether
- Export
- Files integration
- Preset
- Retouch
- AI Lab
- Cloud
- UI limitations
- unsupported Desktop functions

を記録。


==================================================
31. DESKTOP-ONLY FEATURE SWEEP
==================================================

Desktop限定：

- Cloud Space
- advanced export
- multiple export preset
- advanced tether
- batch
- hot folder
- Lightroom import
- team
- large project management

等を確認。


==================================================
32. CREDIT COST MATRIX
==================================================

生成系機能について、
存在確認だけでは不十分。

各機能について：

- credit required
- credit-free
- credit amount
- one execution
- one image
- one export
- retry
- preview
- final

の課金単位を可能な限り記録。

SUITE生成クレジット設計の比較資料にする。


==================================================
33. SUITE PROCESSING CLASS
==================================================

Evoto各機能について、
SUITEで実装する場合の処理方式候補を分類。

L0:
通常画像処理

L1:
On-device AI

L2:
On-device GPU / Neural Engine

L3:
Cloud low-cost AI

L4:
Cloud generative AI

L5:
Premium generative model

例：

Color Contact
→ L1/L2

Body reshape
→ L1/L2

Background Generate
→ L4/L5

Old Photo Restore
→ L3/L4

とする。

これにより原価設計と直結させる。


==================================================
34. SUITE BILLING CLASS
==================================================

各機能：

BASE_INCLUDED
GENERATIVE_CREDIT
PREMIUM_CREDIT
UNDECIDED

に分類。

BASE_INCLUDED：

通常月額内で無制限利用。

GENERATIVE_CREDIT：

標準AI生成クレジット。

PREMIUM_CREDIT：

高品質AI Engine利用。

UI上のAuto / Fast / Quality / Premium構想と整合させる。


==================================================
35. PERFORMANCE IMPACT
==================================================

各Featureに：

- iPhone負荷
- iPad負荷
- Memory
- GPU
- Neural Engine
- Battery
- Thermal
- Network
- Cloud cost

の評価欄を追加。

「機能が作れるか」だけでなく、
Mobile Release Firstで現実的か判定する。


==================================================
36. IMAGE QUALITY RISK
==================================================

AI補正系には最低限：

- Face Identity Risk
- Skin Artifact
- Hair Artifact
- Hand Artifact
- Background Artifact
- Edge Artifact
- Color Shift
- Geometry Distortion

を評価。

Identity changeの可能性がある生成処理は
Identity Lock Gate対象。


==================================================
37. EVOTO FEATURE TREE
==================================================

最終成果物として
Evoto Feature Treeを作る。

例：

Portrait
 ├ Skin
 │ ├ Acne
 │ ├ Freckles
 │ └ ...
 ├ Eyes
 │ ├ Brightness
 │ ├ Reflection
 │ └ Contacts
 └ Makeup
   ├ Brows
   ├ Eyeshadow
   └ ...

AI Lab
 ├ Background
 ├ Remove
 ├ Body
 ├ Hair
 ├ Relight
 └ Restore

のように階層化。

Flatな一覧だけでは完了不可。


==================================================
38. OFFICIAL SUPPORT ARTICLE INDEX
==================================================

Evoto公式Supportの対象Article一覧を作り、

Article
→ Feature
→ Matrix row

の対応を保持する。

Matrixに紐付かないArticleが残った場合は
監査未完了。


==================================================
39. ZERO-MISS GATE
==================================================

今回の目的は
「カラーコンタクトのような後発発見をなくす」こと。

最終Gate：

UNMAPPED OFFICIAL ARTICLE = 0
UNMAPPED OFFICIAL FEATURE = 0
UNCLASSIFIED SUITE STATUS = 0
NO EVIDENCE FEATURE = 0

を要求。


==================================================
40. P0候補の再評価
==================================================

最低限以下をP0/P1候補として再評価。

- Colored Contacts
- Strong Glasses Glare Removal
- Clothing Moiré
- Liquify Background Repair
- Smart Removal
- People Removal
- Background Fusion
- Relight
- Edge Cleanup
- Color Spill Removal
- Shadow Handling
- Preset Cross-device Compatibility

商品上不要なら理由を明記。


==================================================
41. 実装は監査後
==================================================

今回発見した機能を
その場でバラバラに実装しない。

先にFeature Inventoryを完成。

その後、

P0
↓
P1
↓
SUITE正式Requirement

の順で一括追加する。

既存実装を場当たり的に変更しない。


==================================================
42. 最終報告
==================================================

追加監査完了時に必ず報告。

1. 新たに発見したEvoto機能数
2. 前回監査で漏れていた機能一覧
3. P0候補
4. P1候補
5. Mobile-only
6. iPad-only
7. Desktop-only
8. Generative AI機能数
9. Local処理可能候補
10. Cloud AI必須候補
11. Credit機能
12. Credit Free機能
13. SUITE月額内候補
14. SUITE生成課金候補
15. Identity Lock対象
16. 未確認項目
17. 追加したEvidence
18. Feature Tree
19. Official Article Index
20. Zero-Miss Gate結果

Zero-Miss Gateを満たさない状態で
Evoto差分監査完了と報告しないこと。

説明で止まらず、
現在利用可能な環境で公式情報調査、
Matrix更新、
Feature Tree作成、
Evidence固定まで実行すること。
