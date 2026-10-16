# EV3-0934 Batch Edit — completion audit

2026-10-04。`SUITE_feature_types_2026-10-03.txt` の `EV3-0934` を、`docs/EVOTO_AUDIT/evoto-deep-audit.json` の元IDと照合した。**このIDは一般の編集同期ではなく、AI Lab > Batch Edit > People Removal**である。隣接する `EV3-0935` は Old Photo Restoration、`EV3-0936` は Detail Enhance。Evotoの[AI Lab公式手順](https://support.evoto.ai/ai-lab/)は、写真を選び、これらのAI効果を選択し、Startで複数の生成結果を得る操作を記載する。他のAI Lab機能へBatch対応を外挿しない。一方、Evotoの[一般的なSync説明](https://support.evoto.ai/save-time-with-batch-style-matching-sync-presets-in-evoto/)は、元写真から色・人物・背景等の設定を選択して他写真にコピーする**別の**操作を説明している。

| 操作・安全境界 | 現SUITEの証拠 | 判定 |
| --- | --- | --- |
| AI Labで対象写真と People Removal 等の効果を選んで一括Generate | 現 `batch-edit.mjs` は保存済みRecipe JSONを1件ずつCASコピーする。`getOriginal`、AI効果選択、推論、生成結果の保存は呼ばない。`editor-ui.mjs` にAI Lab Batch効果選択／Startはない。 | **EV3-0934は未実装**。汎用Recipeコピーを元AI生成機能と同一視しない。 |
| 保存済みコピー元と明示選択した他写真へRecipe全体を適用 | `EditorSession.batchApplyCurrentRecipe` はコピー元dirty/未保存を拒否し、UIに対象checkboxと結果を表示。`applyBatchRecipe` はコピー元版を固定して、対象ごとにAsset SHA・edit権限・Recipe版を照合、CAS保存後に再読込確認する。実Trial HTTP/SQLiteの`batch-edit-http.test.mjs`は本人/他者/期限切れ/版競合/Original SHA不変を合成非RAWで検証。 | **別機能として部分接続済み**。試験は生成/RAW画質を証明しない。 |
| 対象件数と実行制御 | 汎用 `batchEditGate` は1件の対象でも許可し、20件上限は持たない。2〜20件制限は別の限定SyncやBatch Finalであり、汎用Batchには継承されない。既存ブラウザfixtureの「キャンセル」は適用前のcheckbox解除であり、実行中の取消ではない。 | 現在のUI契約をそのまま記録。元AI Labの上限や取消仕様は一次資料で確定していないので、架空の同等性は主張しない。 |
| 写真固有設定と部分失敗 | `batch-edit.mjs` はsource/targetのB/W Edge・Add Shadow手動documentを拒否。sourceのPortraitは他Assetへのbinding検証で拒否。**監査時点**では対象の保存済みPortraitを中立sourceの全Recipeが消せたが、同日修正で対象Portraitも保存前に拒否。新規 `BATCH-AUDIT-03` は保護対象が`failed`、別の安全対象が`saved`となり、対象Recipe不変を確認。対象ごとの`failed`/`conflict`/`unverified`/`saved`を分け、先行成功をロールバックしない。 | **汎用Batchの写真固有データ保護を補強済み**。元AI一括効果の各写真固有認識・結果レビューとは別物。 |
| UI→保存→Final | 既存Browser fixtureは合成非RAW＋実Trial/SQLiteで選択→保存結果を検証する設計だが、Node試験はbundle可否のみ。`exportBatchFinal`は独立の明示2〜20枚Final経路であり、汎用Batch UIの直後に同じ対象を開いてFinalまで検証する単一E2Eは現監査では確認できない。 | 実Chrome/実RAW/公開Cloud/AI生成結果のPASSは**NOT_RUN／未証明**。 |

新規 `apps/web/tests/batch-edit-completion-audit.test.mjs` は、元IDのAI Lab帰属、汎用UIの現件数Gate、全Recipe CASがAI生成を呼ばず対象Portraitを拒否することを**合成3件で特性化**した。発見時の危険挙動は上表に履歴として残し、修正後の安全回帰に期待を切り替えた。

## 次の安全な小経路

汎用BatchのPortrait事前拒否と、対象の他の成功結果・Originalを守る新規Trial HTTP/SQLite回帰（`batch-edit-target-protection.test.mjs`）は追加済み。次は実Editorの選択→認証付き保存→対象再読込→Finalを合成非RAWで1本につなぎ、実Chromeが使えない場合はNOT_RUNを維持する。

これは**既存汎用Batchの安全補完**で、`EV3-0934`のAI Lab People Removal完成ではない。元候補には写真別の本人選択/自動検出、非破壊生成、結果比較/採用、複数対象の失敗・費用/権限・取消の製品契約が別途必要。現資料からモデル/価格/Cloudアーキテクチャを推測して実装しない。44件の完了数は増やさない。
