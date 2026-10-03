# 実行・未実行の確定記録

**最新（Crop/Workspace/価格統合）: 124 PASS / 0 FAIL / 0 SKIP、Native82 NOT_RUN。** 旧34件は現差分でも全件PASS。機械記録は[evidence/integrated-2026-10-03/regression.json](evidence/integrated-2026-10-03/regression.json)、全件は[INTEGRATED_TEST_CATALOG](INTEGRATED_TEST_CATALOG.md)。本文以下の34/45は過去工程の保存記録であり最新件数ではない。原本/MultiPart/CAS/ENOSPC/kill/Cloud Safeと追加Crop/Workspaceの範囲・未接続・未実行理由は[INTEGRATED_REPORT](INTEGRATED_REPORT.md)。Mobile Release BLOCK、Webを条件に含めない。

## 以下は初期34件時点の記録

2026-10-03 JST / Windows / Node24。既存実装統合時の機械記録は `verification-results.json`。Evoto監査・Apple提出準備工程で再実行した最新記録は `evidence/submission-readiness-2026-10-03/regression.json`（同じ34 PASS / 0 FAIL / 0 SKIP、native45 NOT RUN）。旧Evidenceは保持。新工程の状態・変更一覧・文書検査は `SUBMISSION_READINESS.md` / `SUBMISSION_CHANGES.md`。

## 実行済み

`npm run check`: exit 0。TypeScript build成功。**34/34 PASS、FAIL0、SKIP0**（backend16 + harness18）。仕様147節の番号・題名・実装/テスト/Evidence対応・固定本文SHA・Mobile優先・最小11チェック確認PASS。`node scripts/final-regression.mjs`でも同じ回帰と各未配置チェックを再実行し、verification-results.jsonに実コマンド全文と全結果を保存した。

backend実試験は署名JWT+loopback HTTP、tenant隔離、Recipe CAS、実ファイルimmutable書込み・stream中断・破損検出、SQLite再open、実child process kill中の未commit rollback、Trash/Restore、Multipart再開/応答消失再送/破損part新key修復、ENOSPC fault injection、待機状態、原本保護判定。**画像decodeではなく任意storage bytesを使う基盤試験**。

harness18試験は外部path guard、metadata parser、JPEG等のRAW偽装拒否、未配置、adapter子プロセス通信/timeout/cancel/不正JSON/未計測null拒否、Mac local結果のfull lifecycle昇格拒否。**実RAWではない試験データを本物のRAWとして認定しない機構試験**。

## 未配置確認

`node scripts/raw-harness.mjs manifest --sets 100,500,1000` および `pipeline ...` を実行。3セットともRAW_SET_NOT_PLACED / BLOCKED_EXTERNAL_ENVIRONMENT。count/bytes/metricsはnull、RAWdecoder NOT_RUN。CLI終了値2が期待結果であり、負荷試験成功ではない。pipelineは加えてadapter/work directory未接続を別理由で保持。

実RAWは `C:/Users/user/Documents/Codex/2026-10-03/SUITE_TEST_DATA/RAW/{100,500,1000}`、checkout外。Git保存・同画像水増し・ダミーRAW・JPEG置換は行っていない。

## 未実行

Swift/Core 44 XCTest、Apple画像経路1 XCTest（計45 NOT_RUN）、SwiftUI build、Mac QA adapter build、iPhone/iPad実機全導線、実RAW負荷、容量別Project試験は**BLOCKED_EXTERNAL_ENVIRONMENT**。Windowsにswift/xcodebuildが存在しないことを確認。端末モデル/OSを推測指定しない。SKIP0はWindows実行スイート内の値であり、45未実施を隠さない。

未実装のcloud provider、Auth UI、cross-device、background queue、ML/tether等は環境blockと混同しない。HANDOFFの開発残に記録する。

## Mac/Xcode到着時の実行手順（未実行）

```text
swift test --package-path packages/METISMobileCore
swift test --package-path packages/SuiteCore
swift build --package-path apps/apple -c release
cd apps/apple
xcodegen generate
xcodebuild -list -project SUITE.xcodeproj
xcodebuild -showdestinations -scheme SUITE -project SUITE.xcodeproj
```

XcodeGenが必要（このWindowsでは未インストール）。表示された実際のdestination ID、開発Team、bundle IDを用意した上で以下を実行し、値を推測で埋めない。

```text
xcodebuild test -scheme SUITE -project SUITE.xcodeproj -destination 'id=<observed destination ID>' -resultBundlePath <new xcresult path>
```

Simulator build/testは実機QAとは別記録。iPhone・iPad実機をそれぞれ選択し、import→proxy edit→save→kill/relaunch→undo/redo→export/share、Original不在/未対応RAW/失敗再開、touch/rotation/Pencil、T01–T30を実行する。実RAW100/500/1000と容量別はRAW_QAの手順。ログ・測定期間・model/OS・SHA・Recipe revision・環境/実装versionを保存。

Mac local QA adapterは同じPhotoPipelineを呼ぶが、local Original hash latency、ProjectStore JSON growth、JPEG、serial・2048px QA workloadの限定計測。本番cloud fetch、backend SQLite growth、device操作、クラッシュ復旧の成功証拠にはならない。生成されるJSONLの説明を保ち、範囲を水増ししない。

## 判定

**Mobile Release BLOCK**。Web未完成は理由に含めない。Swift/実機/本番接続/商用V1/追加要件の未達が理由。画面や型があるだけで合格にしない。最終監査はFINAL_AUDIT、残作業はHANDOFF。
