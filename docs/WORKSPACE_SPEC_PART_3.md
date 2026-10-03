# 3/3：料金・Billing・回帰・完了条件

==================================================
31. PLAN STRUCTURE
==================================================

最低限以下を独立Entitlementとして扱えるようにする。

MOBILE
iPhone + iPad

DESKTOP
将来

ALL
将来Mobile + Desktop

STUDIO / WORKSPACE
複数Member

CLOUD STORAGE
100GB〜10TB

GENERATIVE AI
従量Credits

プラン価格は実装コードへ固定しない。


==================================================
32. TEAM BILLING
==================================================

Studioプランでは、

Base Workspace
+
Seats
+
Cloud Storage

の組合せを可能にする。

ただし初期Releaseで複雑化しすぎる場合、

Workspace基本料金
+ Included Seats
+ Additional Seats
+ Storage

として段階導入可能にする。


==================================================
33. STORAGE BILLING SAFETY
==================================================

容量超過時にRAWを突然削除してはならない。

例：

2TB契約
↓
2TB超過

の場合、

- Upgrade案内
- Upload制限
- Grace状態

等を設ける。

既存RAWを即削除して容量を合わせる方式は禁止。


==================================================
34. DOWNGRADE
==================================================

Storage downgrade時、

現在使用量 > 新容量

の場合、即時データ削除禁止。

例：

使用量 1.6TB
2TB → 1TBへDowngrade

この場合は新規Upload停止等で制御し、ユーザーへ整理を要求する。

原本を運営判断で勝手に削除しない。


==================================================
35. TRASH / RECOVERY
==================================================

Asset削除はSoft Deleteを基本とする。

Workspace Owner等の権限とRecovery policyを設ける。

削除操作によりスタッフ1名がStudio全写真を即時消去できる設計は禁止。


==================================================
36. OWNERSHIP
==================================================

Workspace解約時の写真データの所有・Export導線を設ける。

ユーザー自身の写真をアプリ解約により取得不能にする設計を避ける。

Export / Data retrieval方針を利用規約・Privacy Policyと整合させる。


==================================================
37. MOBILE RELEASE PRIORITY
==================================================

Workspace / Cloud機能追加を理由にWeb版完成を先行させない。

Mobile Release Firstを維持。

iPhone / iPadから：

- Workspace
- Project
- Cloud Library
- Shared RAW
- Proxy
- Edit
- Preset
- Export

の主要業務が成立することを優先する。


==================================================
38. SECURITY
==================================================

Workspace境界はServer側で強制。

UIで非表示にするだけでは不可。

テストする：

User AがWorkspace BのAsset IDを推測
→ Server reject

ViewerがEdit APIを直接呼ぶ
→ Server reject

削除済MemberのTokenでアクセス
→ reject

Signed URL流用
→ reject / expiration


==================================================
39. CONCURRENCY TEST
==================================================

最低：

2 Editors
3 Editors

による同一Project操作を試験。

同一Asset同時編集
Preset同時変更
Selection同時変更

を確認。


==================================================
40. STORAGE SCALE TEST
==================================================

論理容量として：

100GB
500GB
1TB
2TB
5TB
10TB

で破綻しないSchema / integer size / quota設計とする。

実際に10TBを試験投入する必要はないが、10TBでoverflowする型は禁止。


==================================================
41. EXISTING REGRESSION
==================================================

既存の以下を継続回帰する。

Windows基盤34件
RAW immutable
Proxy
Recipe
Cloud Safe
Multipart
破損partのみ再取得
正常part不変
checksum
SQLite recovery
ENOSPC
process crash
storage conflict

新規Workspace実装で既存回帰を壊さない。


==================================================
42. NEW TESTS
==================================================

最低限：

Workspace create
Member invite
Accept invite
Role enforcement
Remove member
Workspace isolation
Project sharing
Shared Recipe
Conflict
Shared Preset
Storage quota
Upgrade
Downgrade
Quota exceeded
Soft delete
Recovery
Storage usage accounting
Cloud Safe
On-demand RAW fetch
Proxy-only browsing
Final RAW export
Audit log

を追加。


==================================================
43. NOT RUN
==================================================

iPhone / iPad実機、クラウド実Provider等が必要な試験を無理にPASS扱いしない。

必ず：

NOT_RUN
Reason
Required environment
Next procedure
Acceptance criteria

を残す。


==================================================
44. TRACEABILITY
==================================================

今回の全追加仕様を既存147節と同様に、

Requirement
→ Design
→ Implementation
→ Test
→ Evidence

で追跡可能にする。

要約して既存要件を落とさない。


==================================================
45. COMPLETION REPORT
==================================================

完了報告には必ず以下を含める。

1. 追加したWorkspace仕様
2. Role / Permission一覧
3. Team editing仕様
4. Conflict仕様
5. Shared Preset仕様
6. Cloud-first architecture
7. Original / Proxy / Recipeの配置
8. Storage plans 100GB〜10TB対応状態
9. Provider abstraction
10. Database設計
11. Object Storage設計
12. Storage cost measurement
13. Team billing構造
14. 実装済み
15. 未実装
16. 実装済み未検証
17. NOT_RUN
18. 全テスト結果
19. 既存回帰結果
20. 変更ファイル
21. Evidence保存場所
22. iPhone / iPad実機で次に確認する内容
23. 残存リスク

現在の環境で実行できるものは説明だけで止めず、実装・テスト・Evidence固定まで進める。

既存契約、新しいStorage Provider、料金、Apple課金方法等について、根拠なく勝手に確定しないこと。
