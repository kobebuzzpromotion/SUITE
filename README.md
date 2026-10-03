# SUITE — Mobile Release First

MOBILE RELEASE > WEB RELEASE。Web完成はMobile Release Gateに含めない。

写真家・写真館向けのSwift / SwiftUI iPhone・iPadアプリとWeb試用コードの開発コピーです。**未リリース・本番未接続・iOS未ビルド**。

この初回版はローカル検証済みソースであり、**SITES v33との同一性は確認対象外** です。このリポジトリへの公開・コミットは、既存Siteへの接続、配備、本番D1/R2、Cloudflare Access、実ブラウザ試験の完了を意味しません。

この専用コピーの直近ローカル記録は [Cloudflare/Web Evidence](docs/evidence/cloudflare-2026-10-03/local-04.json) のWeb 260/260・Cloudflare準備16/16 PASS、[Windows Evidence](docs/evidence/cloudflare-2026-10-03/windows-05.json) の159/159 PASSです。Native 113件はNOT_RUN。実Cloudflare、実RAW、iPhone/iPad、Mobile Releaseは未合格です。以前の [統合報告](docs/INTEGRATED_REPORT.md) にあるWindows124/Native82は過去時点の記録です。

## 正本と引継ぎ

- `docs/HANDOFF.md`: 現在・実施内容・残作業・変更禁止事項。Solはここから再開。
- `docs/VERIFICATION.md`: 実行した試験と未実行の区別。
- `docs/TRACEABILITY.md` / `requirements.json`: 原文147節と実装状態。
- `docs/SUITE_SPEC.md`, `MOBILE_OVERRIDE.md`, `ADDITIONAL_SPEC.md`, `CLOUD_STORAGE_OVERRIDE.md`: ユーザー原文。順序修正・追加は旧仕様削除を意味しない。
- `docs/PHOTO_ARCHITECTURE.md`, `CONTRACTS.md`, `CHANGE_NOTICE.md`: 6領域契約・境界・変更理由。
- `docs/INTEGRATION.md`, `FINAL_AUDIT.md`, `FAILURE_MATRIX.md`: 別チャット回収・欠落監査・T01–T30。
- `docs/SUBMISSION_READINESS.md`: 初期162行Evoto比較監査・Apple提出準備時点の保存記録。最新監査は `docs/EVOTO_AUDIT/`、最新統合は `docs/INTEGRATED_REPORT.md`。主要競合基準はEvoto。
- `docs/EVOTO_AUDIT.md`, `evoto-audit.json`: 公式情報・操作連鎖・Export詳細・差分登録。Lightroom基準の合格へ置換しない。
- `docs/APPLE_SUBMISSION/README.md`: 提出Pack草案。正式申告・実提出は未実施。
- `docs/MOBILE_DEVICE_QA.md`: iPhoneとiPadの独立した実機操作・合格条件。Macは検証環境。

## 構成

`apps/backend` は署名JWT、tenant分離、SQLite CAS、immutable storageとlocal Multipart。`packages/METISMobileCore` は汎用判断境界、`packages/SuiteCore` は非破壊Recipe/履歴/Session Look/保存・転送契約。`apps/apple` は共通モデルと端末別SwiftUI、Core Image候補adapter。

## Windowsで実行済みの確認

```text
npm ci --ignore-scripts
npm run check
npm run qa:raw:manifest
npm run qa:raw:pipeline
```

Node 24。検証時は承認済みworkspace内npm cacheを利用した。最後の2つはデータ/環境未配置なら非ゼロ終了が正しい。ダミーRAWを生成しない。

Appleビルド/実機手順は `docs/VERIFICATION.md`、RAW runnerは `docs/RAW_QA.md`。本番認証情報を埋め込まない。`.env.example` は設定名だけであり、本番接続を保証しない。
