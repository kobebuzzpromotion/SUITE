# 今回工程の変更ファイル

2026-10-03 JST。Evoto比較監査・Apple提出準備・実機QA手順・回帰Evidence固定に限定。製品ソース、依存version、provider、API、保存/同期契約、147節、固定6文書は無変更。以前の実装工程全件は `CHANGED_FILES.md` に保持する。

Gitは未コミットの新規リポジトリのため、git statusは全体をuntrackedとして表示する。本一覧は今回工程で新規作成/更新したファイルの台帳であり、commit diffと称さない。自動再生成されたignoredのdistは製品ソースの変更に数えない。

## 更新（状態の正本・案内のみ）

- README.md
- docs/HANDOFF.md
- docs/OWNERSHIP.md
- docs/VERIFICATION.md

## 新規（比較監査・実機手順・統合）

- docs/EVOTO_AUDIT.md
- docs/evoto-audit.json
- docs/MOBILE_DEVICE_QA.md
- docs/SUBMISSION_READINESS.md
- docs/SUBMISSION_CHANGES.md
- scripts/check-readiness-evidence.mjs

## 新規（Apple Submission Pack）

- docs/APPLE_SUBMISSION/README.md
- docs/APPLE_SUBMISSION/APP_INFORMATION.md
- docs/APPLE_SUBMISSION/STORE_METADATA.md
- docs/APPLE_SUBMISSION/SCREENSHOTS.md
- docs/APPLE_SUBMISSION/APP_ICON.md
- docs/APPLE_SUBMISSION/APP_PRIVACY.md
- docs/APPLE_SUBMISSION/PRIVACY_POLICY.md
- docs/APPLE_SUBMISSION/THIRD_PARTY_SERVICES.md
- docs/APPLE_SUBMISSION/EXPORT_COMPLIANCE.md
- docs/APPLE_SUBMISSION/APP_REVIEW.md
- docs/APPLE_SUBMISSION/ACCOUNT_DELETION.md
- docs/APPLE_SUBMISSION/IAP_ASSESSMENT.md
- docs/APPLE_SUBMISSION/METADATA.md
- docs/APPLE_SUBMISSION/ASSETS.md
- docs/APPLE_SUBMISSION/PRIVACY_DATA_SDK.md
- docs/APPLE_SUBMISSION/REVIEW_LEGAL.md
- docs/APPLE_SUBMISSION/NEXT_SUBMISSION.md
- docs/APPLE_SUBMISSION/metadata.json
- docs/APPLE_SUBMISSION/sources.json
- docs/APPLE_SUBMISSION/validate.mjs
- docs/APPLE_SUBMISSION/validation-results.json

## 新規（親担当の実行Evidence）

- docs/evidence/submission-readiness-2026-10-03/regression.json — 初回再回帰の全stdout、34テスト、147対応、45 native NOT RUN、RAWセット別状態
- docs/evidence/submission-readiness-2026-10-03/final-regression.json — 統合時の最終再回帰。初回記録を上書きしない
- docs/evidence/submission-readiness-2026-10-03/integrity.json — 6本文hash、前回52ソース不変、147対応、A–G参照、提出草案/実機区分を確認。成果物SHA一覧付き

Apple Packの検査は7項目の文書静的検査であり、基盤34件とは別。integrity検査も製品機能や申告/審査の合格ではない。元の `docs/verification-results.json` は前回実装工程のEvidenceとして無変更で保持する。

## コマンドと検証境界

親は `node scripts/final-regression.mjs` を初回/統合時に実行する。このrunnerは内部で `node scripts/check-spec.mjs`、TypeScript compiler、Node TAP全34件、manifest/pipeline事前チェックを実行する。各実コマンドと終了値/stdoutは各regression JSONに記録する。RAW事前チェックのexit2を負荷試験合格としない。

文書: `node docs/APPLE_SUBMISSION/validate.mjs`、`node scripts/check-readiness-evidence.mjs`。読取り監査: rg/Get-Content、Get-Commandによる環境確認、source SHA比較、git status、Apple/Evotoの公式Web確認。外部アカウント書込み/公開/課金/アップロードは実施していない。

## 今回追加・変更した契約/仕様

**製品の確定仕様・保存/同期契約・API変更: 0。** 追加したのは最新ユーザー指示に従う監査分類A–G、操作連鎖/差分登録、提出準備台帳、実機別実証手順、正本状態の参照である。差分候補/申告草案/QA手順を新しい製品契約へ昇格させない。
