# SUITE Feature Parity Gate — 追加リリース判定方針

受領日: 2026-10-03。最新のユーザー直接指示を記録する。旧147節・固定6文書・6領域保存同期契約を置換／編集しない。価格・Provider・Apple課金方式の確定ではない。製品コード／API／Schema変更なし。

## 目標と完了条件

**Evoto Feature Set ⊆ SUITE Feature Set** を機能とユーザー操作連鎖で確認する。「EvotoにあるのにSUITEには無い」を残したままリリース合格にしない。画面名・UI・名称をコピーする指示ではない。

対象: RAW現像、色、肌、顔、目、Colored Contacts、髪、Makeup、体型、服、背景、Removal、Batch、Preset、Tether、Culling、Export、Cloud、Team、iPhone/Mobile、iPad、Desktop Windows/macOS、AI Lab、Pricing/Credit、直近12か月Release。各Platformの差と条件を保持する。

未分類0が必須。公式Article→最小機能/Slider/Option→Platform/Credit→SUITE Status→実装→検証→Evidenceを逆引きする。公式記事やスクリーンショットに依存する未知を推測でゼロにしない。

### 監査Gateと製品Parity Gateを分離する

監査Gateは次がすべて実際0になって初めて合格:

- UNMAPPED OFFICIAL ARTICLE
- UNMAPPED OFFICIAL FEATURE
- UNCLASSIFIED SUITE STATUS
- NO EVIDENCE FEATURE
- PLATFORM UNKNOWN
- CREDIT RULE UNKNOWN

監査完了後にP0/P1/P2/P3、P0/P1追加Requirement候補、実装対象/順序を一括確定する。監査中の個別機能実装、既存147節への散発追加は禁止。

製品Parity Gateは上記監査合格に加え、必要な機能・サブ機能がSUITEで実装・検証され、実際の操作が悪化していないことを確認する。比較対象はRAW→Import/Preview→Edit→Person→Batch/Preset→Save/Sync→Final Export/Tetherの連鎖。実機、実画像、失敗時復旧、操作数・操作不能箇所・レスポンス・タッチ/Pencil/縦横layoutを評価する。公式説明を読むだけではUX同等性の実測にならない。

必須比較軸は、同等機能、Platform同等以上、Plan制限が不利でない、Credit条件が不利でない、操作連鎖同等以上、Batch適用範囲同等以上、Mobile重大欠落なし、Export条件同等以上、必要実環境で検証済み、Evidence存在の10軸。どれかが不明／未検証ならその行をPASSにしない。

独自代替Eは、同じユーザー目的を同等以下の手数で達成する実測が必要。名称や推定実装方式では同等性を認定しない。初期製品対象iPhone/iPadとEvotoのWindows/macOS/Android等のPlatform範囲比較は別軸で記録する。監査を理由にAndroid/Desktop/Webの製品開発を無断追加しない。未解決の対象範囲はUNKNOWNとして残す。

最終Parity条件: **未対応0、重大未検証0、重大UNKNOWN0、重大公式情報矛盾0、操作上の明確な劣化0**。未分類0だけでは不十分。重大判定の理由と対象操作を示し、Gateを通すために重大度を落とさない。

### 時点・地域・Plan・Creditの確認分類

各行へCONFIRMED、CONFIRMED_WITH_PLATFORM_LIMIT、CONFIRMED_WITH_PLAN_LIMIT、CONFIRMED_WITH_CREDIT_CONDITION、CONFLICTING_OFFICIAL_SOURCES、UNKNOWN、NOT_FOUNDの確認分類を付ける。これはSUITE A/B/C/D/E/F/H/I分類とは別軸。NOT_FOUNDは調べた公式範囲で見つからないことで、機能不存在の断定ではない。

Windows/macOS/iPhone/iPad/Android、Free/Monthly/Annual/PAYG/Team/Enterprise、操作時／高品質Export時／AI生成時の消費、Mobile固有条件、Cloud容量/期限、Tether/Batch/Sync制限、RAW/JPEG/Color書出しを時点・地域・Plan別に分ける。Local/Cloud/Generativeの技術方式は公式未記載ならUNKNOWN。SUITEの推定処理案をEvotoの事実へ混入させない。

公式矛盾のEvidenceは、情報公開日、対象地域、対象Platform、対象Plan、現行App Store、現行公式Web、旧Support、矛盾内容、確定できる事実、未確定事項の10項目を必ず保持する。新しい資料だから一律に旧資料を破棄する処理は禁止。Mobileカラー書出し/Credit未確定は重大BLOCK。

## 分類の保持と免除禁止

| Status | 意味 | Parity合格への扱い |
| --- | --- | --- |
| A | 実装済み・検証済み | その機能/Platform/UXの実測Evidenceが必要。Windows数学成功からNative画像/操作合格を推定しない |
| B | 実装済み・未検証 | 未合格。コード存在は動作/品質/UX同等の証明ではない |
| C | 仕様済み・未実装 | 未合格 |
| D | 未仕様化 | 未合格。監査完了後のRequirement候補へ |
| E | SUITE独自方式で代替 | 同じ目的・入力/出力/操作連鎖・品質/非破壊・実機UXの同等性が検証されるまで未合格 |
| F | 意図的非対応/不要候補 | 理由付き判断待ち。機能を台帳から消さず、ユーザー承認なしにParityから除外しない |
| H | Platform固有 | 他Platformでのabsenceを勝手に推定しない。機能的代替・必要性・ユーザー判断を別記、免除ではない |
| I | SUITE独自 | Evoto差分不足の代わりに数えない。固有価値候補と成熟度を別記 |

Gは過去台帳での公式存在未確認の履歴として保持。現行の確認済み機能は上記分類へ。公式未確認事項は別台帳に残し、未確認を不要へ置換しない。

Fの各候補には不要理由／対象ユーザー／Evoto側用途／SUITE側代替／操作差／リスク／承認状態を残す。未承認は免除ではなく判断待ちのBLOCK。

## SUITE独自価値の別枠

Cloud-first、iPhone/iPad優先、通常Export無制限、A/B判・B0倍等の印刷対応、無料Preset共有、Workspace、生成AIを独自価値・方式として別枠へ記録する。EvotoにもCloud/Team/Preview/Preset等があるため、名称だけで独占的機能と主張しない。通常Export無制限と生成AIの従量候補を混同しない。料金/原価/Apple課金方式のBaselineとPricing BLOCKは維持する。

## 現在のGate

監査: **BLOCK**。Feature Parity: **BLOCK**。Mobile Release: **BLOCK**。

Windows124 PASS、Native82 NOT_RUN、実RAW100/500/1000・Mac・iPhone・iPad NOT_RUN。本番Auth/Cloud/Cloud Proxy/Cross-device Sync/Billing未接続、耐久Background/Offline Queue未検証、実画像Final Export品質未検証。未実装と外部環境待ちは分離する。

Mobile Release Firstを維持。Web完成はMobile Release Gateに含めない。Desktop固有機能の機能的相当性はモバイルの実測で評価し、Web完成待ちへすり替えない。新しいParity Gateは実機/RAW/本番/Pricing等の既存必須Gateを免除しない。
