# SUITE — 作業規則
最初に docs/SUITE_SPEC.md、docs/MOBILE_OVERRIDE.md、docs/MOBILE_RELEASE_FIRST.md、docs/HANDOFF.md（存在時）、docs/TRACEABILITY.md を読む。
追加正本 docs/ADDITIONAL_SPEC.md（Session Look等23節）、docs/CLOUD_STORAGE_OVERRIDE.md（強制仕様24節）も省略せず読む。古い仕様は削除しない。docs/CHANGE_NOTICE.mdに共有契約変更理由と影響を先に残す。
MOBILE RELEASE > WEB RELEASE。Web完成はMobile Release Gateに含めない。最新Override 13節に従いMOBILE COREから着手する。
SUITE_SPEC.mdはユーザー提供v0.2全文。Mobile Release First修正はリリース順序だけを上書きし、商用V1や他の仕様を削除しない。

- 難しい設計を最優先。既存METIS/Picasso/da Vinciを調査せず重複実装しない。
- 勝手な再設計・全面リファクタ・既存資産の改変禁止。
- docs/OWNERSHIP.mdの担当ファイル以外は編集しない。範囲変更はメインが先に記録する。
- 同じファイルや責務を重複担当しない。最終統合・欠落監査・ビルド/テストはメイン。
- 独立タスクは最大限並列。阻害要因が一つあっても独立タスクを続ける。
- 原本RAWを書き換えない。Cloud Safe未確認の原本を自動削除しない。
- テスト・主要導線の実行結果を残す。未実行・ダミー・未接続を成功扱いしない。
- 実装済み・未実装・壊れた箇所・未確認を区別し docs/HANDOFF.mdに残す。
- 正本はdocs/。仕様全文と指示の欠落監査を通さず実装完了としない。Web UIは後続。
