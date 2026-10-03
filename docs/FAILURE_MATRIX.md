# 失敗系 T01–T30

回収原文 `references/STORAGE_SIDE_REVIEW.md` §12を維持。下表は実行状態の対応表。Windowsの部分PASSを各受入試験全体/iPhone/iPadへ拡大解釈しない。

PASS範囲の証拠はbackend `suite.test.ts` / `failures.test.ts`。nativeはソース点検と未実行XCTestのみ。BLOCKED_EXTERNAL_ENVIRONMENTは実機・実RAW・Apple環境不足を表し、未実装コードは別列で残す。

| ID | 注入/要求 | 現在の証拠 | 未達 |
| --- | --- | --- | --- |
| T01 | import途中終了 | stream中断でfinalなし・retry PASS | native ingest journal/reconcile未実装、実機BLOCKED |
| T02 | multipart network断 | 途中part/未完final拒否・DB再open・不足のみ再送 PASS | 実回線切替/URLSession background未実装・実機BLOCKED |
| T03 | ユーザー強制終了 | Windows child kill時SQLite rollback PASS（別機構） | iOS outbox再開未実装・実機BLOCKED |
| T04 | OS終了 | 代替成功なし | OS lifecycle試験BLOCKED、adapter未実装 |
| T05 | 再起動unlock前 | File Protection境界ソースのみ | 実機BLOCKED |
| T06 | ロック | unreadableデータを消す実装なし | pause分類/復旧未完成・実機BLOCKED |
| T07 | complete応答消失 | local multipart finalize再送同object PASS | provider/iOS未接続、createAsset冪等性未実装 |
| T08 | object保存/DB commit失敗 | Cloud Safeをcommit後だけ返す構造 | DB commit故障注入・orphan reconcile未実装 |
| T09 | 同operation別payload | multipart ID/payload照合拒否 PASS | createAsset全体への適用未実装 |
| T10 | 同サイズ破損/SHA不一致 | immutable拒否・Cloud Safe失効・part別key修復 PASS | nativeカメラ全形式/本番provider未検証 |
| T11 | 2端末Recipe競合 | SQLite CAS stale版409・再open PASS | 実2端末・競合draft UI未完成 |
| T12 | Viewer/失効member | 異tenant404/署名JWT/期限切れ拒否 PASS | member/role revocation未実装 |
| T13 | signed URL後revoke | 未実装 | signed access/TTL/失効の本番adapter未実装 |
| T14 | OS cache消去 | cache純粋判定PASS、native ProxyのみでpreviewのXCTest作成 | cloud Proxy再取得未実装、XCTest/実機BLOCKED |
| T15 | 削除直前export pin | pinned Original/Recipe拒否の純粋判定PASS | 原子的pin再確認/物理LRU未実装 |
| T16 | 容量不足import | ENOSPC注入→multipart状態保持→再試行 PASS | 実ディスク満杯/iOS admission/100RAW未実施 |
| T17 | 別端末Originalなし | 指定asset目的別APIのみ・全RAW取得なし | cloud Proxy/別端末復元未実装、実機BLOCKED |
| T18 | Original offline/404/403/hash | backend待機・破損503・失効/tenant拒否 PASS | native取得/状態表示ソースのみ・実機BLOCKED |
| T19 | export中Recipe更新 | immutable ExportPlan接続、Coreテスト作成 | Swift実行BLOCKED |
| T20 | memory/thermal/battery | Core純粋判定・XCTest作成 | 実圧力adapter/最適同時数未完成、実機BLOCKED |
| T21 | export中断 | staging→検証→確定・取消導線ソース | durable export resume未完成、実機BLOCKED |
| T22 | batch1件失敗 | harness不足asset/metrics拒否 PASS | 製品batch未実装、実100RAW BLOCKED |
| T23 | output寸法/profile失敗 | 寸法照合・partial不公開ソース | profile/RAW互換性実証未完成、実機BLOCKED |
| T24 | Trash/Export/Purge競合 | backend論理削除/復元で原本維持 PASS | purgeなし、lease/revision競合処理未完成 |
| T25 | 30/90日経過 | 自動原本削除機構を作っていない | 時間経過実行未実施、retention勝手に導入しない |
| T26 | region/provider障害 | 復旧成功主張なし | 本番provider/独立backup未実装 |
| T27 | backup除外 | 未確認 | exclusion adapter未実装、実機BLOCKED |
| T28 | unsupported RAW | CIRAWFilter失敗→内容型制限でFinal拒否ソース | 実RAW/camera matrix BLOCKED |
| T29 | Canonical欠落 | 非対応extended/canonicalをFinal拒否 | 生成adapter未実装・実証なし |
| T30 | cloud purge | 破壊APIを公開していない | hold/backup/ref/権限つきpurge未実装 |

追加Tether QA25項目はADDITIONAL_SPEC §22の全項目を保持。接続/連続撮影/解析追従/背景保護/複数人物/モード/Personal Color/Look更新/端末別/RAW整合を省略しない。データモデルだけでいずれもPASSにしない。
