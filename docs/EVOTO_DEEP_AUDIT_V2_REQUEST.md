# SUITE 追加指示書
# EVOTO DEEP FEATURE PARITY AUDIT v2
# Evoto全機能・全サブ機能・全プラットフォーム差分の再監査

==================================================
0. 目的
==================================================

現在実施しているEvotoとの差分監査を、カテゴリ単位ではなく
「実際にユーザーが操作できる最小機能単位」まで再分解してやり直すこと。

今回、カラーコンタクト機能が後から発見された。

これは現在の差分監査が、
「Portrait Retouchingあり」
「Makeupあり」
という大分類で止まり、
内部のサブ機能まで完全に洗えていない可能性を示している。

したがって現在のEvoto差分表を完成扱いにしない。

EVOTO FEATURE PARITY AUDITを再オープンし、
公式情報から全機能をゼロベースで再収集すること。

主要競合はLightroomではなくEvotoとする。


==================================================
1. 最重要原則
==================================================

FEATURE CATEGORY != FEATURE INVENTORY

例：

「Makeup対応」
だけでは監査完了にしない。

Makeup内部の、

- Highlight
- Contour
- Eyebrow Makeup
- Eye Makeup
- Lip Makeup
- Makeup Suite
- Eyebrow style
- Eyeshadow
- Eyelashes
- Eyeliner
- Contacts
- Blush
- Lipstick
- Face Decoration

まで個別項目として分解する。

同様に、

「Body Retouchあり」
「Eyesあり」
「Backgroundあり」

という記録だけで完了扱いにしない。


==================================================
2. 調査ソース
==================================================

以下を一次情報として使用する。

- Evoto公式Web
- Evoto公式Support
- Evoto公式Help Center
- Evoto公式Release Notes
- Evoto公式Mobile情報
- Evoto公式iPad情報
- Evoto公式Desktop情報
- App Store公式説明
- Evoto公式料金ページ

第三者ブログやレビュー記事だけで
機能の存在・不存在を確定しない。

各機能について最低限：

- source
- page title
- platform
- published / updated date
- feature name
- sub-feature
- current availability

をEvidenceへ残す。


==================================================
3. PLATFORMを混同しない
==================================================

必ず以下を分離する。

- Evoto Mobile / iPhone
- Evoto iPad
- Evoto Desktop / Windows
- Evoto Desktop / macOS
- Evoto Instant
- Evoto Video

Evoto Videoだけに存在する機能を、
写真版Evotoの機能として数えてはいけない。

Videoページで機能を発見した場合は、
写真版Mobile / iPad / Desktopにも同機能が存在するか
別の公式Evidenceで確認する。

状態：

PHOTO_CONFIRMED
VIDEO_ONLY
PLATFORM_SPECIFIC
NOT_CONFIRMED

を保持する。


==================================================
4. 差分分類
==================================================

各最小機能を必ず以下で分類する。

A:
SUITE実装済み・検証済み

B:
SUITE実装済み・未検証

C:
SUITE正式仕様済み・未実装

D:
SUITE未仕様化

E:
SUITE独自方式で同等以上を代替

F:
SUITEでは意図的に不要候補

G:
Evoto公式で存在確認できず

H:
Evotoの特定Platformのみ対応

I:
SUITE独自機能

Fは勝手に削除しない。
不要理由とユーザー判断待ちを記録する。


==================================================
5. PORTRAIT RETOUCHING
==================================================

Portrait Retouchingを一括項目にしない。

最低限以下を独立監査する。


--------------------------------------------------
5.1 AI PERSON / FACE RECOGNITION
--------------------------------------------------

- Face Detection
- Person Detection
- Individual Person Selection
- Group Photo handling
- Character / Person tagging
- 年齢区分認識の有無
- 性別分類の有無
- 同一人物へのBatch適用
- Person-specific Sync
- 左右顔パーツ認識
- Multiple Face handling

SUITEではプライバシー設計との差異も記録する。


--------------------------------------------------
5.2 BLEMISH REMOVAL
--------------------------------------------------

最低限：

- Freckle Removal
- Acne Removal
- Freckle / Acne separate control
- Dark Circle Removal
- Wrinkle Retouch
- Forehead Wrinkles
- Eye Wrinkles
- Smile Lines
- Neck Wrinkles
- Body Blemish
- Mole handling
- Manual tuning
- Add / Erase correction
- Before / After
- Mask display

公式ページからさらに項目がある場合は追加。


--------------------------------------------------
5.3 SKIN RETOUCH
--------------------------------------------------

最低限：

- Skin Smoothing
- Dodge & Burn
- Skin Texture preservation
- Complexion unification
- Skin Tone
- Skin Color
- Skin Radiance
- Oil / Shine Removal
- Face / Body skin separation
- Skin Texture
- Skin Brightness
- Skin redness control
- Skin tone selection
- Body skin retouch

SUITE Personal Colorとの違いも比較。


--------------------------------------------------
5.4 EYES
--------------------------------------------------

最低限：

- Overall Eye Brightness
- Iris Brightness
- Eye Whites Brightness
- Eye Reflection
- Iris Flare
- Red Vein Removal
- Eye White Cleanup
- Catchlight
- Catchlight styles
- Remove Glasses Glare
- Eye clarity
- left/right separate control
- linked control

構造変更系のEyesと、
見た目補正系Eyesを混同しない。


--------------------------------------------------
5.5 COLORED CONTACTS
--------------------------------------------------

今回の発見項目として必須監査。

最低限：

- Contacts機能
- Contact preset数
- Color variations
- Amount
- left/right handling
- Iris preservation
- Pupil preservation
- Catchlight preservation
- original iris texture preservation
- batch sync
- person-specific sync

SUITE側では最低でも：

- Contact Color
- Amount
- Brightness
- Saturation
- Transparency
- Iris texture preservation
- Catchlight preservation
- left/right independent
- Person Batch
- Set Batch

を仕様候補として登録。

通常月額内のOn-device処理候補とする。


--------------------------------------------------
5.6 TEETH
--------------------------------------------------

- Teeth Whitening
- Teeth Brightness
- Teeth cleanup
- Smile enhancement
- Strength
- Mouth detection
- batch behavior


--------------------------------------------------
5.7 HAIR
--------------------------------------------------

最低限：

- Flyaway Removal
- Frizz
- Smooth Hair
- Hair Shine
- Hair Color consistency
- Hair Color Change
- Hairline
- stray hair
- background crossing hair handling
- manual tuning
- batch


--------------------------------------------------
5.8 MAKEUP
--------------------------------------------------

EvotoのMakeupを一項目にまとめない。

最低限個別監査：

BASIC
- Highlight
- Contour
- Eyebrow Makeup
- Eye Makeup Amount
- Eye Makeup Saturation
- Eye Makeup Brightness
- Eye Makeup Dimensionality
- Lip Makeup Amount
- Lip Saturation
- Lip Brightness
- Lip Dimensionality

MAKEUP SUITE
- Makeup preset suite
- Preset count
- male presets
- children presets
- Amount

INDIVIDUAL COMPONENTS
- Eyebrows
- Eyeshadow
- Eyelashes
- Eyeliner
- Contacts
- Blush
- Lipstick
- Lip Texture
- Contour styles
- Face Decorations
- Freckle decoration

左右個別調整の可否も別列で保持。


==================================================
6. FACIAL RESHAPE
==================================================

最低限以下を個別化。


HEAD POSE
- Up / Down
- Left / Right
- Tilt


SYMMETRY
- Facial Symmetry
- Upper Body Symmetry


FACE
- Face overall
- Temple
- Cheekbone
- Jaw
- Face Size
- V-Shape
- Jaw Length
- Face Width


EYEBROWS
- Tilt
- Arch Height
- Position
- 左右別


EYES STRUCTURE
- Full Eye Size
- Eyeball Size
- Height
- Width
- Distance
- Inner Corner
- Outer Corner
- Tilt
- Position
- 左右別


NOSE

Evoto公式内の全Nose sliderを列挙。


MOUTH

Evoto公式内の全Mouth sliderを列挙。


その他公式ページに存在する
Chin / Philtrum / Ear等があれば追加。

「顔補正あり」でまとめない。


==================================================
7. FULL BODY RESHAPE
==================================================

最低限：

GENERAL
- AI Reshape
- Slim
- Plump
- Smooth Physique
- Head Size
- Body
- Height

UPPER BODY
- Upper Body Length
- Neck Width
- Neck Length
- Arms
- Chest / Breasts
- Waist Width
- Waist Length
- Hips

LEGS
- Leg Width
- Thigh
- Calf
- Leg Length
- Thigh Length
- Calf Length
- linked / separate

その他公式機能も全列挙。

Group Photoで利用不可になる条件も記録。


==================================================
8. MANUAL RESHAPE
==================================================

AI Bodyとは別に、
手動Liquify / Reshape系を監査。

最低限：

- Reshape
- Smooth
- Size
- local distortion
- face edge
- body edge
- clothing edge

Evoto Mobileの複数Distortion Toolを
全種類調査する。

SUITEにAI自動補正しかない場合は
差分として扱う。


==================================================
9. BACKGROUND
==================================================

一括で「背景処理あり」と記録禁止。

最低限：


SOLID BACKDROP
- Distractions Removal
- Clean Backdrop
- Background cleanup
- Ground cleanup
- Unify Lighting
- Amount
- Luminance
- Color Banding Removal
- Background Enhancement
- Manual Tuning


BACKGROUND BLUR
- Background Blur
- Amount
- edge handling


BACKDROP CHANGER
- Background replacement
- preserved area
- edge refinement
- spill removal
- custom backdrop


SKY
- Sky Replacement
- Recommended Sky
- Custom Sky
- Temperature
- Saturation
- foreground matching
- subject matching


SUITE Wedding / 七五三 / 成人式背景生成とは
「置換」と「生成」を別機能として比較する。


==================================================
10. CLOTHES / ACCESSORIES
==================================================

Evoto公式の
Clothes / Clothing & Accessories
カテゴリを全ページ調査する。

最低限：

- Wrinkle
- Clothing cleanup
- Clothing reshaping
- Color
- accessories
- stain / defect
- garment edge

など、実在する機能だけ列挙。

マーケティング推測で機能を追加しない。


==================================================
11. PET
==================================================

EvotoにPetカテゴリが存在するため、
全機能を監査。

SUITEで対象外ならF候補として残す。

勝手に無視しない。


==================================================
12. COLOR ADJUSTMENT
==================================================

最低限：

- Profile
- Standard Profile
- LUT Profile
- B&W
- Exposure
- Contrast
- Highlights
- Shadows
- Whites
- Blacks
- Temperature
- Tint
- Vibrance
- Saturation
- Curves
- HSL
- Color Grading
- Detail
- Sharpening
- Noise Reduction
- Grain
- Lens Correction
- Transform Correction
- Color Calibration
- RGB Primary Hue
- RGB Primary Saturation


AI COLOR
- Auto Color
- AI Color Looks
- AI Color Match
- Multi-image Color Consistency
- Camera Simulation


CREATIVE
- Glow Effect
- White Mist
- Black Mist
- Halation
- Intensity
- Radius
- Threshold
- Exposure
- Diffusion
- Tint
- Post-Crop Vignette
- Amount
- Midpoint
- Roundness
- Feather
- Highlights

公式に存在する他Effectも追加。


==================================================
13. MASKING
==================================================

最低限：

- Person Mask
- Face area
- Body area
- Pet Mask
- Background Mask
- Custom Mask
- Brush
- Erase
- Invert
- Add Mask
- Subtract Mask
- Linear Gradient
- Radial Gradient
- Luminance Range
- Size
- Softness
- Flow
- Density
- Curves in Mask
- HSL in Mask
- Color Grading in Mask
- Detail in Mask
- Mask visibility
- Mask Sync
- Replace Existing Masks
- Add Existing Masks

SUITEとの差分を独立監査。


==================================================
14. HEALING / REMOVAL
==================================================

最低限：

- Spot Healing
- Patch
- Clone Stamp
- AI Object Removal
- background distraction removal
- large object generative removal

通常ローカル処理と
Generative AI処理を区別。


==================================================
15. CULLING
==================================================

最低限：

- Manual Culling
- AI Culling
- Selection
- Rating
- Flag
- Reject
- Similar Photo grouping
- Blur detection
- Closed Eye detection
- duplicate / burst handling
- Face evaluation

公式で確認できる機能のみ正式化。

SUITEのSelection機能との差異を記録。


==================================================
16. PRESET / SYNC
==================================================

最低限：

- Recommended Presets
- My Presets
- Team Presets
- Preset groups
- Import Preset
- Share Preset
- Save Preset

SYNC対象：

- AI Color
- Color
- Portrait
- Background
- Clothing
- Crop & Rotate
- Masking

さらに：

- Person-specific sync
- Add / Replace mask sync
- Batch sync
- Session Look相当

を比較。


==================================================
17. CROP / ROTATE
==================================================

現在追加したSUITE印刷仕様と詳細比較。

Evoto側：

- Original
- As Shot
- Free
- Fixed Ratio
- Custom Dimensions
- Rotate CW
- Rotate CCW
- Flip Horizontal
- Flip Vertical
- Angle
- AI Horizon Correction
- AI Crop

SUITE側：

- SNS
- A Series
- B Series
- A0倍
- B0倍
- Photo Print
- 四切
- 六切
- 半切
- 全紙
- 大全紙
- 全倍
- Custom mm
- 300dpi
- Physical Print Preview

を別項目として比較。


==================================================
18. IMPORT
==================================================

最低限：

- RAW
- JPEG
- TIFF等
- Lightroom .lrcat
- Lightroom setting import
- Unsupported Lightroom adjustments
- Project import
- Folder import
- Camera tether import
- Auto Import
- Hot Folder
- file naming
- duplicate handling


==================================================
19. EXPORT
==================================================

Exportは一項目で済ませない。

FORMAT
- Original Format behavior
- JPG 8-bit
- TIFF 8-bit
- TIFF 16-bit
- PNG / Alpha behavior
- RAW-related export behavior

SIZE
- Percentage
- Width
- Height
- Dimensions
- Long Edge
- Short Edge
- PPI
- PPC

COLOR
- sRGB conversion
- Original Color Profile
- Adobe RGB behavior
- ICC

QUALITY
- JPEG Quality
- TIFF compression

NAMING
- Original Filename
- Custom Filename
- Sequence
- Capture Date
- Custom Text
- Preset Name
- Export Preset Name
- combination patterns

METADATA
- metadata preservation
- capture time
- export time

QUEUE
- Export Queue
- Multiple Export Presets simultaneously
- one photo → multiple sizes
- Batch Export

SUITE独自：
- B0倍
- A0倍
- actual mm
- Print PPI validation
- resolution shortage warning
- direct print-ready export

を別記録。


==================================================
20. TETHER
==================================================

有線だけ確認して終了しない。

最低限：

- Wired Tether
- Wireless Tether
- iPhone support
- iPad support
- Windows
- macOS
- Camera compatibility
- Memory card requirement
- live preview
- instant import
- auto preset
- real-time retouch
- filename
- batch
- disconnect recovery
- reconnect
- supported camera model list

SUITE Verified Cable構想との比較も記録。


==================================================
21. LIBRARY / PROJECT
==================================================

最低限：

- Project
- Recent Projects
- Library
- Metadata display
- Metadata edit
- Culling
- Preset
- Sync
- project resume
- last view restore
- file organization
- Asset Hub

SUITE Workspace / Cloud Libraryとの差異も比較。


==================================================
22. TEAM
==================================================

最低限：

- Main team account
- Team member
- Team Presets
- shared asset
- role
- permission
- workspace
- shared editing
- billing
- storage
- concurrent editing

Evotoで公式確認できる範囲のみ記録。

SUITE独自の：

- Owner
- Admin
- Editor
- Viewer
- Recipe Version
- Conflict
- Audit Log
- Shared Storage

も比較。


==================================================
23. CLOUD
==================================================

最低限：

- Cloud Space
- supported platform
- RAW support
- preview
- smart preview
- cloud sync
- storage tiers
- retention
- cross-device
- upload
- download
- team cloud

SUITEの：

CLOUD IS THE PRIMARY LIBRARY
DEVICE IS A WORKING CACHE

との差異を明確化。


==================================================
24. AI LAB / GENERATIVE
==================================================

Evoto AI Labの全カテゴリを調査。

最低限：

- Background & Scene
- Remove & Repair
- Subject Adjustments
- Enhance & Restore
- Relight
- Natural Light
- Face Shadow Removal
- Golden Hour

その他現在提供中の機能を
公式ページから全取得。

各処理：

- Credit consumption
- platform
- output behavior
- identity preservation
- resolution
- retry

を比較。

SUITE：

Auto
Fast
Quality
Premium

のAI Engine abstractionと比較する。


==================================================
25. PRICING / CREDIT RULE
==================================================

重要。

Evotoには、
「Export自体が常に全て有料」
という単純整理をしない。

現在の公式Credit Free Exportルールも調査する。

最低限：

CREDIT FREE
- 通常Color Adjustment
- Basic
- Curves
- HSL
- Color Grading
- Detail
- Grain
- Lens Correction
- Transform
- Calibration
- Masking
- Liquify
- Healing
- Crop
- Rotate
等

CREDIT CONSUMING
- Portrait Retouching
- AI Color Looks
- AI Color Match
- その他対象機能

を最新版で正確に表化。

SUITEの
通常Export無制限との比較を
誇張せず正確に行う。


==================================================
26. FEATURE COUNT
==================================================

監査完了時に、

Evoto Major Categories
Evoto Features
Evoto Sub-features
Evoto Slider / Option count

を可能な範囲で集計。

例：

Portrait
→ Makeup
→ Contacts
→ Style 1〜11
→ Amount

まで階層を保持する。

単純な「30機能」等に丸めない。


==================================================
27. MISSING FEATURE SWEEP
==================================================

一度Matrixを完成させた後、
逆方向監査を実施。

Evoto公式Supportの全Category一覧から、

Matrixに存在しないCategory
Matrixに存在しないArticle
Matrixに存在しないSubheading

を機械的または手動で再照合。

ゼロになるまで完了扱いにしない。


==================================================
28. RELEASE NOTE SWEEP
==================================================

過去だけでなく最新機能を拾うため、

直近12か月のEvoto公式Release Notesを監査。

新機能について：

- Matrix追加済み
- platform
- version
- SUITE status

を確認。


==================================================
29. SUITE ADVANTAGE
==================================================

差分表は
「SUITEに無いもの」だけでなく、

SUITEにしかない／SUITEが強いものも
別Matrixにする。

最低候補：

- 50GB標準Cloud構想
- Cloud-first
- iPhone / iPad Release First
- 通常Export枚数課金なし
- A/B判
- A0倍 / B0倍
- 日本写真プリント規格
- 300dpi validation
- actual physical size crop
- Print Preview
- Personal Color
- Wedding Mode
- 七五三
- 成人式
- Anniversary
- face identity lock
- AI Engine choice
- Free Preset Community
- Workspace
- Versioned Recipe
- Audit Log
- 100GB〜10TB+ storage expansion
- Verified Tether Cable

実装済みと構想を混同しない。


==================================================
30. OUTPUT FILES
==================================================

最低限：

docs/EVOTO_AUDIT/
  EVOTO_FEATURE_MASTER.md
  EVOTO_PLATFORM_MATRIX.md
  EVOTO_PORTRAIT_MATRIX.md
  EVOTO_COLOR_MATRIX.md
  EVOTO_BACKGROUND_MATRIX.md
  EVOTO_TETHER_MATRIX.md
  EVOTO_EXPORT_MATRIX.md
  EVOTO_CLOUD_TEAM_MATRIX.md
  EVOTO_AI_LAB_MATRIX.md
  EVOTO_PRICING_CREDIT_MATRIX.md
  SUITE_GAP_MATRIX.md
  SUITE_ADVANTAGE_MATRIX.md
  EVIDENCE_INDEX.md

を作成。

既存正本を上書きせず、
監査結果として分離保存。


==================================================
31. GAP PRIORITY
==================================================

差分は：

P0
Evotoにあり、
SUITEの主要用途に必須。
競合上欠落すると致命的。

P1
商品力に大きく影響。

P2
あると望ましい。

P3
ニッチ。

F
意図的非対応候補。

で評価。

カラーコンタクトのような
後発発見を防止する。


==================================================
32. 実装開始条件
==================================================

今回の最優先は
「完全なFeature Inventory」。

監査途中で見つけた機能を
個別に思いつき実装し続けない。

先にEvoto Feature Masterを完成。

その後、

P0
P1

をまとめてSUITE正式仕様へ追加する。

既存147節を勝手に書き換えず、
追加RequirementとしてTraceabilityへ統合。


==================================================
33. 完了条件
==================================================

以下を満たすまで
「Evoto差分監査完了」と報告しない。

- Evoto公式全カテゴリ確認
- Mobile確認
- iPad確認
- Desktop確認
- Sub-feature確認
- Slider / option確認
- Export確認
- Tether確認
- Cloud確認
- Team確認
- AI Lab確認
- Credit Rules確認
- Release Notes確認
- Category逆照合完了
- Missing Article 0
- 未分類Feature 0
- EvidenceなしFeature 0
- SUITE status未設定 0

完了報告では：

1. Evoto総機能Inventory
2. SUITEとの差分総数
3. P0件数
4. P1件数
5. P2件数
6. P3件数
7. SUITE独自機能数
8. Platform固有機能
9. 未確認事項
10. 推奨追加Requirement

を提出すること。

説明だけで止めず、
現在利用可能な環境で調査・Matrix作成・Evidence固定まで進めること。
