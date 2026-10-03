# Astra変更レビューとSol修正

2026-10-03。ユーザー指定運用: Sol 6.1が実装、Astraが難所と差分の読取りレビュー。性能比較の実測結論ではない。Astraはソースを編集せず、テスト成功は親担当が現差分で再実行したEvidenceから判断する。

| 指摘 | 影響と最小修正 | 現在 | 実行した追加試験 |
| --- | --- | --- | --- |
| P1 転送中のmember失効・grant期限切れ | `inspect`待機後と各送出chunk前にlive ACL・Asset状態・指定grantを再照合。Uploadもchunkごと再認可 | 修正・再レビュー済み | WH10 / WH11 PASS |
| P2 失敗・中断転送の使用量漏れ | `finally`で試行の部分量を記録。成功Exportと開始監査を区別。同期private recorderだけが既発生量の記録時に失効memberの認可例外を持つ | 修正・再レビュー済み | WH10 / WH12 PASS |
| P2 tombstoneと容量台帳の跨DB障害で再試行不能 | 削除済対象の認可付き冪等再送とledger再照合。Project復元でも個別Asset tombstoneを残す | 修正・再レビュー済み | WH13 / WH14 PASS、全DB/HTTP再open後の再送 |
| P2 過大chunkが未送信でも使用量計上 | next size検証後に加算。破損検出でCloud Safe失効 | 修正・再レビュー済み | WH15 PASS、先頭過大chunkは0／正常prefix後の過大tailはprefixのみ |

対象: `apps/backend/src/workspace-server.ts`、内部読取`workspace.ts::registeredAssetStates`、`apps/backend/tests/workspace-server.test.ts`。追加test全件と既存testは [最新全回帰](evidence/integrated-2026-10-03/regression.json)に保存。HTTP15 PASS、全体124 PASS / 0 FAIL / 0 SKIP。レビューだけでPASSへ更新していない。

`recordingMeasuredUsage`は同期・record-usageだけ・finallyで解除。HTTP bodyから入る経路を追加していない。通常のmember失効後ledger操作は拒否する。

## 残る限界

- 転送値はadapter/gatewayで受理したbytes。TCP端末受領・実Cloud転送料・請求書照合の証明ではない。DBが使えない場合やプロセスkillでfinallyが走らない場合のtraffic完全回収は未実装／未検証。
- 複数DBのatomic transactionへ再設計していない。試験済みなのは再openと同要求retryによるTrash分類収束。自主定期reconcilerはない。
- 同一Workspaceの別Projectへ同じAssetを再登録する制限は既知の未実装課題。正常なメンバー間共有でコピーを作らない試験と区別する。
- Recipe CAS/Preset固定値/Original不変/quota非削除/未同期Recipe eviction禁止について、レビューで追加の具体的欠陥は見つからなかったが、未実行の実Cloud/実機安全性を証明したわけではない。
- Pricing純粋計算も読取り確認。未知コストを0とせずBigIntで計算し、自動Release PASSを返さない。Apple契約・価格・実原価の認証ではない。
- Mac・実RAW・iPhone/iPadはNOT_RUN。本番認証・Cloud・Billing・Workspace編集同期全導線は未接続。Mobile Release BLOCK。
