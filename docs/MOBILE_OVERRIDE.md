# SUITE / CODEX
# MOBILE-FIRST DEVELOPMENT OVERRIDE
# PRIORITY: CRITICAL / IMMUTABLE

SUITEはMOBILE FIRSTで開発する。

これは
「Web版を作ってからスマホ対応する」
という意味ではない。

開発・UX・アーキテクチャ・テスト・Releaseの基準そのものを
iPhone / iPadへ置く。

==================================================
1. RELEASE PRIORITY
==================================================

最初の正式リリース対象：

1. iPhone
2. iPad

Web版は後続。

MOBILE RELEASE > WEB RELEASE

Web版の都合によって、
iPhone / iPadのUI・UX・性能・機能・Workflowを妥協しない。

Web版完成をMobile版Releaseの前提条件にしない。

==================================================
2. MOBILE IS THE PRIMARY PRODUCT
==================================================

以下は禁止：

WEB FIRST
↓
RESPONSIVE
↓
MOBILE

ではなく、

MOBILE PRODUCT
↓
MOBILE WORKFLOW
↓
MOBILE UI / HUMAN FACTORS
↓
MOBILE PERFORMANCE
↓
MOBILE RELEASE
↓
DESKTOP / WEB EXPANSION

の順とする。

MOBILE != RESPONSIVE WEB

MOBILE != SHRUNK DESKTOP

IPAD != LARGE IPHONE

==================================================
3. DEVICE PRIORITY
==================================================

Phase 1:

- iPhone
- iPad

Phase 2以降：

- Android
- Android Tablet
- PC
- Web

Phase 2対象を理由として
Phase 1を遅らせない。

ただし共通化可能なCoreは
将来展開できる構造にする。

==================================================
4. MOBILE COREを先に作る
==================================================

SUITE固有機能を大量実装する前に、
METIS共通 MOBILE CORE を確立する。

MOBILE COREには最低限：

- Adaptive UI
- Touch / Gesture
- Human Factors
- Safe Area
- Orientation
- Device Capability
- Camera
- Photo Library
- File Access
- USB / Type-C
- Tether
- Local Storage
- Offline
- Sync
- Background Task
- App Lifecycle
- Memory Pressure
- Battery
- Thermal State
- Network Quality
- Permissions
- Accessibility
- Haptic
- Keyboard
- Pointer / Trackpad
- iPad Multitasking
- External Display
- Device Performance Tier

を含める。

SUITE専用に閉じない。

今後のMETIS準拠モバイルSaaSが
継承可能な共通基盤とする。

==================================================
5. SUITE MOBILE WORKFLOW
==================================================

最初にMobileで完成させるWorkflow：

IMPORT
↓
SELECT
↓
PREVIEW
↓
EDIT
↓
AI RETOUCH
↓
COMPARE
↓
BATCH APPLY
↓
FINAL RENDER
↓
EXPORT
↓
SHARE / SAVE

このWorkflowを基準に
画面・データ・処理・AIを設計する。

画面単位で設計してから
Workflowをつなげない。

WORKFLOW FIRST
SCREEN SECOND

==================================================
6. PHOTO PROFESSIONAL USE
==================================================

iPhone / iPadを
簡易編集端末として扱わない。

SUITEはモバイル上でも
プロ用途を想定する。

対象：

- RAW / JPEG
- 高解像度写真
- 大量写真
- Batch processing
- Skin retouch
- Face adjustment
- Exposure
- WB
- Tone
- Color
- Noise reduction
- Background replacement
- Object removal
- Sky replacement
- Bridal / Anniversary scene processing
- Personal color optimization
- Final export

==================================================
7. AI EXECUTION
==================================================

AI処理ごとに、

ON DEVICE
CLOUD
HYBRID

のどれが適切か判断する。

判断軸：

- Processing time
- Device capability
- Memory
- GPU / NPU
- Battery
- Thermal
- Network
- Privacy
- Cost
- Quality
- File size
- Batch size

CLOUD BY DEFAULTは禁止。

ON-DEVICE BY DEFAULTも禁止。

最適な実行経路を選択する。

==================================================
8. LIGHT PREVIEW / FINAL RENDER
==================================================

編集操作中に
毎回フル解像度処理を行わない。

基本：

LIGHTWEIGHT PREVIEW
↓
USER DECISION
↓
FINAL HIGH-QUALITY RENDER

とする。

大量写真では、

Thumbnail
Proxy
Preview
Final

を分離する。

UI操作がAI処理待ちで止まらない設計を優先する。

==================================================
9. IPHONE UX
==================================================

iPhoneでは、

- One hand
- Thumb reach
- Gesture
- Bottom controls
- Progressive disclosure
- Minimum cognitive load

を重視。

PC用Inspectorをそのまま縮小しない。

頻繁に使う操作を
親指が届きやすい範囲へ置く。

==================================================
10. IPAD UX
==================================================

iPadは独立した作業環境として設計する。

活用候補：

- Large canvas
- Side inspector
- Filmstrip
- Before / After
- Split comparison
- Drag & Drop
- Keyboard shortcut
- Pointer / Trackpad
- Multitasking
- External storage
- Type-C
- Tether
- External display

iPhone UIの単純拡大は禁止。

==================================================
11. PERFORMANCE IS A PRODUCT REQUIREMENT
==================================================

写真編集アプリではPerformanceを
後工程の最適化にしない。

初期Architectureから、

- Import speed
- Preview latency
- Scroll FPS
- AI processing latency
- Batch throughput
- Memory consumption
- Thermal impact
- Battery impact
- Export time
- Crash recovery

を設計対象にする。

FAST UI != FAST PRODUCT

==================================================
12. OFFLINE / INTERRUPTION
==================================================

モバイルでは中断を通常状態として扱う。

電話
他App
画面ロック
通信切断
低電力
Background
Memory pressure
App termination

等が発生しても、

現在の編集状態
Batch状態
AI処理状態
Export状態

を可能な限り復元できるよう設計する。

INTERRUPTION != SESSION LOSS

==================================================
13. CODEX IMPLEMENTATION PRIORITY
==================================================

Codexは、

1. MOBILE CORE
2. Mobile architecture
3. Photo pipeline
4. Storage / File / RAW
5. Preview pipeline
6. AI execution layer
7. iPhone UX
8. iPad UX
9. Batch workflow
10. Export
11. Performance / recovery
12. Mobile testing
13. Release

の順を基本にする。

Web実装を先行させない。

==================================================
14. CODEX EXECUTION OPTIMIZER
==================================================

実装前にMETIS Execution Optimizerを使用する。

Mobile Releaseを最短にするため、

FULL SERIAL
FULL PARALLEL
STAGED PARALLEL
PIPELINE

を比較する。

単純に並列数を最大化しない。

特に、

- shared files
- photo pipeline
- data model
- AI execution
- native capability
- DB migration
- external APIs
- tests

の競合を先に確認する。

最終目標：

MINIMUM TIME TO MOBILE RELEASE

である。

==================================================
15. RELEASE GATE
==================================================

以下がPASSするまで
「SUITE Mobile完成」としない。

□ iPhone実機
□ iPad実機
□ Import
□ RAW/JPEG
□ Editing
□ AI processing
□ Batch
□ Before/After
□ Save
□ Export
□ Background / Resume
□ Offline behavior
□ Permission handling
□ Memory pressure
□ Thermal behavior
□ Battery behavior
□ Error recovery
□ Mobile Human Factors
□ Accessibility
□ Performance
□ Rendered Reality

WEBの完成状況は
このMobile Release Gateへ含めない。

==================================================
16. ABSOLUTE RULE
==================================================

SUITEの最初のゴールは、

「Webでもスマホでも動くこと」

ではない。

「iPhone / iPadで、
写真家が実際に仕事へ使える製品を
最短で完成させること」

である。

MOBILE FIRST
MOBILE QUALITY FIRST
MOBILE RELEASE FIRST
