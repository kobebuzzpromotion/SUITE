# 未登録OriginalのRecovery経路（Face Brightness統合時の安全設計）

状態: 保持設計 IMPLEMENTED / 自動削除禁止 IMPLEMENTED（現行コードに原本失敗cleanup削除を導入しない）。Recovery本体 NOT_IMPLEMENTED。PhotoPipelineがコピーしたOriginalをProxy生成またはProjectStore登録の失敗後にも保持する現行挙動は変更しない。起動時検出、耐久Import journal、Recovery候補UI、再登録はまだ接続していない。設計記録を実行成功にしない。

## 固定する処理連鎖

1. 取込開始。コピー開始前に、対象Asset UUID、元filename、Originalの専用相対path、開始時刻を耐久Import journalへ記録する。記録不能ならOriginalのコピーを開始しない。
2. Originalを書込み。既存ファイルは上書きしない。コピー完了・checksum・byte countを確認後にjournalへ追記する。終了／容量不足で残った部分ファイルも削除せず、INCOMPLETE_COPYのRecovery候補とする。
3. Proxy生成、checkpoint登録。成功時だけ登録済revisionとjournalを対応させる。DB/checkpoint登録失敗でもOriginalを削除しない。Proxyは原本とは別オブジェクト。
4. アプリ再起動。登録済AssetのOriginal path、Import journal、Originalsディレクトリを照合する。台帳が壊れていても未登録ファイルを消さない。列挙・照合だけでCloud Safeを付与しない。
5. orphan / unregistered original検出。候補にpath、サイズ、journal有無、コピー完了Evidence、checksum状態、登録有無、理由を表示する。filenameだけから「完全なRAW」や登録済IDを推測しない。
6. 明示Recovery。完了Evidenceがありchecksum一致なら、保持された同じOriginalからProxyを再生成し、create-only CASで同じAssetを再登録する。既存登録と競合したらRecovery保留とし上書きしない。元filenameが不明、部分コピー、checksum不一致の場合はユーザー確認対象に残しFinal Exportを拒否する。
7. Recipe関連付け。元asset/checksumに一致する保持Recipeだけを検証・関連付けする。破損／他Asset／人物不整合Recipeは拒否または別Recovery候補とし、推測の空Recipeや他人物Recipeで置換しない。
8. Cloud Safe再評価。再登録成功をCloud Safeと同義にしない。既存七条件（checksum、Object永続化、metadata commit、permission、upload完了、size、owner/workspace）を独立再確認し、未接続provider・未同期はLocal Only／Cloud Safe未合格のまま。既存Cloud Safe契約は変更しない。

正式将来フロー: Import開始 → 原本保存 → DB登録失敗 → アプリ終了／再起動 → 未登録原本検出 → asset候補照合 → checksum確認 → ユーザーRecovery提示 → 再登録 → Recipe関連付け → Cloud Safe再評価 → 完了。検出、候補照合、checksum付き再登録、Recovery UI、Recipe関連付け、Recovery後Cloud Safe再評価はNOT_IMPLEMENTED。既存一般Cloud Safe validatorの存在はRecovery接続の完成ではない。

## 禁止・境界

- Original、未同期Recipe、Import/sync台帳をcleanupで自動削除しない。30/90日retention、Quota/Downgradeによる原本削除も禁止。
- 自動再登録・推測Cloud Safe・ProxyからのFinal・原本の補修上書きをしない。原本取得／復旧の操作は通常Proxy閲覧と分離する。
- Root外path、symlink逃避、別Workspace、別Asset、他の既存Originalと衝突する再登録を拒否する。
- 先にjournal導入と起動reconcileの影響を通知し、共有保存契約が変わる場合はメインが調整する。今回は新schema/provider/APIを作らない。

## 次の実行試験と合格条件

| 試験 | 現状態 | 必要環境・次操作 | 合格条件 |
| --- | --- | --- | --- |
| Original完了→DB登録失敗→再起動 | NOT_RUN / adapter未実装 | journal/reconcile接続後、登録直前の障害注入→アプリ再起動 | 同じファイルとchecksumを保持し候補表示、明示再登録のみ成功 |
| Original途中→ENOSPC／強制終了 | NOT_RUN / adapter未実装 | コピー中断注入、MacとiPhone/iPadの実ストレージ試験を別々に実施 | 部分ファイル保持、完全原本と誤認せずExport拒否 |
| 登録済とRecovery同時実行 | NOT_RUN / adapter未実装 | create-only CAS競合を発生 | 原本・checkpointを上書きせず競合を表示 |
| 壊れたjournal／checkpoint | NOT_RUN / adapter未実装 | 正常ファイルを保持したままmetadataだけ破損注入 | 破損metadataも保持、候補隔離、空projectへ黙って置換しない |

既存Windows SQLite強制終了・復元試験のPASSは、このApple取込orphan RecoveryのPASSではない。具体的な自動検出・再登録コマンドはadapter未実装のためまだ存在しない。
