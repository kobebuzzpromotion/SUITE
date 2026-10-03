# SUITE Sites 再開ロック — 2026-10-03

本書はユーザーの最新引き継ぎ指示を、既存 `HANDOFF.md`・凍結Evidenceを**変更せず**に追加記録する。これは新しい実行結果ではない。実測の正本は [Sites状態Evidence](evidence/web-2026-10-03/SITES_VERIFICATION_1104.json)、[Web回帰](evidence/web-2026-10-03/editing-sites-01/RUN_METADATA.json)、[Windows回帰](evidence/web-2026-10-03/editing-windows-01/RUN_METADATA.json) とする。

## 再開基準

| 項目 | 固定状態 |
|---|---|
| 対象Site ID | `appgprj_6a9fbab0e50c8191be942b254c0e5af8` |
| URL | `https://eclat-genseki-demo.bals-enter.chatgpt.site/` |
| 表示名 / 公開範囲 | `SUITE` / custom・オーナー限定 |
| Live version / 本文 | 33 / 旧ページ。SUITE UI未配備 |
| Web / Sites Worker | ローカルBuild成功。Sites実配備ではない |
| Web / Windows / 作者adapter | 221/221、154/154、18/18 PASS。いずれも既存Evidenceの実測時点 |
| 実RAW / Sites本番操作 / iPhone / iPad | NOT_RUN |
| 停止原因 | Sites公式ソース接続に必要なcredential JSONの非空interactive stdinが現在環境で拒否される。実装不具合とは判定しない |

旧Site version33、元Evidence、既存保存契約・Schema・Provider abstraction、共有Recipe、原本保護は維持する。新しいSiteの作成、旧Siteの削除、他Site変更、一般公開、メール送信、有料契約、資格情報のファイル・ソース・平文保管・コマンド引数への移動は禁止。

## 再開トリガーと最短順序

再開トリガーは、Sites公式workflowへ資格情報を**対話標準入力**で安全に渡せる環境が利用可能になったこと。単なるネットワーク許可や旧ローカルBuild成功では解除しない。

1. Sitesの既存SiteをIDとURLで照合し、表示名SUITE、オーナー限定、旧version33を確認する。異なれば停止し、別Siteへ切り替えない。
2. 公式Sites source workflowで**同じSite**のcheckoutを開く。credentialはセッション内とstdinのみ。source commit/checkout pathを新Evidenceへ記録する。
3. checkoutへ既存SUITEの必要ソース・lock・ビルドを接続する。`apps/sites`単体では親階層のWeb/backendをimportするため、単体コピーを完成ソースとしない。既存処理を再設計・二重実装しない。
4. checkout根のSite manifestが同じ `project_id` と論理D1/R2 bindingを示すこと、Worker `dist/server/index.js` と画面 `dist/client` が同一ソースから生成されることを検査する。D1 migrationは既存履歴を確認し、適用済みファイルを書き換えない。
5. 選択SiteでD1 binding、R2 binding、必要なruntime設定と招待認可を接続・確認する。ログインだけでは招待者と認めず、サーバー側でRole・期限・取消を各操作時に検査する。設定値・秘密をEvidenceへ記載しない。
6. オーナー限定のままBuildと回帰を再実行し、source SHAとarchiveを一致させて**非公開**で新versionを保存・Deployする。新しいversion番号と結果は観測値を記録し、33を推測で置換しない。
7. 本番URLで旧本文がSUITE UIに置き換わったこと、画面とWorkerが動くことを確認する。画面表示だけで編集・保存のPASSにしない。
8. 本番Sites上で、許可/拒否、原本保護、取込、調整、Recipe保存・再読込、Undo/Redo、固定Final Export、作者名付きPreset下書き・提出・承認、期限・取消、再起動/中断復元を、実際に実行した範囲ごとにPASS/FAIL/NOT_RUNで記録する。実RAWが無い場合、実RAWの取込・実画像画質・Final視覚結果はNOT_RUNのまま。
9. 新しいEvidenceディレクトリへ、Site ID/URL、deploy version、source commit/hash、D1/R2接続結果、招待認可、オーナー限定状態、Web回帰、操作ごとの結果、実行時刻、残るNOT_RUNと理由を追加する。既存Evidence/`HANDOFF.md`を上書きしない。

オーナー限定を維持する間、外部招待者はSitesの外側のアクセス制限で入れない。したがってサーバー側招待認可を接続しても、**外部作者の本番URL試用は未検証**として残す。外部作者のSiteアクセス許可は、この指示だけで追加しない。

## 配備後も独立してBLOCKするGate

実RAW、実画像Proxy/Final、Apple Native 112、iPhone実機、iPad実機、Feature Parity、Mobile Release。Sites上でWebが動いた事実をこれらのPASSへ転記しない。Face Brightnessも視覚実証まで `IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED` を維持する。
