# Solが次に実行する最短手順

現在の結果はINTEGRATED_REPORT.md。承認済みCrop/Workspace追加は保持し、無断の新規仕様・provider・API・6領域保存/同期契約変更は禁止。未実行Gateを消さず、実行証拠で更新する。

## 今のWindowsで再現

SUITE repository rootで:

```powershell
npm run check
node scripts/check-additional-spec.mjs
node docs/APPLE_SUBMISSION/validate.mjs
node scripts/check-readiness-evidence.mjs
node scripts/final-regression.mjs
```

期待: 124 PASS / 0 FAIL / 0 SKIP、旧34全件含む。147節・6本文hash一致、Crop16/Workspace45/価格28の追跡維持。Native82件と実RAW3セットはNOT_RUN。最終runnerはJSONをstdoutへ出し、正本を上書きしない。保存する場合は `--report docs/evidence/<新しいrun名>/regression.json` を追加する（既存fileは拒否）。価格試算は `node scripts/pricing-model.mjs docs/PRICING_SCENARIO.json` → 現在exit2/NOT_EVALUATED/BLOCK。Evoto v2/v3は専用READMEの構造検査・未照合リストを使い、Zero-Miss未完を残す。

## Macでnative実行

必要: このリポジトリ、Node24依存、Swift6対応Mac/Xcode・SDK、XcodeGen、実RAW（checkout外）。バージョンを記録し、未検証の製品最低OS/端末を推測指定しない。

```sh
npm ci --ignore-scripts
npm run check
swift --version
xcodebuild -version
swift test --package-path packages/METISMobileCore
swift test --package-path packages/SuiteCore
swift build --package-path apps/apple -c release
swift build --package-path apps/apple -c release --show-bin-path
```

Core71試験とadapterビルドを実測する。Apple11試験は後続Xcodeで実行。現在は未実行なのでコンパイル修正が必要となる可能性がある。前半が成功しても実機/クラウドGateは未合格。

## 実RAW 100 / 500 / 1000

Mac上のcheckout外の実データ位置を選び、100/500/1000フォルダへ実RAWを置く。Windows指定元は `C:/Users/user/Documents/Codex/2026-10-03/SUITE_TEST_DATA/RAW/`。データ移送はユーザー管理で行い、repoへ入れない。

```sh
node scripts/raw-harness.mjs manifest --root /actual/external/RAW --sets 100,500,1000
```

上で得たbuild出力ディレクトリの実在する `SuiteRawQAAdapter` 絶対pathを、checkout外の `adapter.json` に設定:

```json
{"command":"/actual/SUITE/apps/apple/.build/release/SuiteRawQAAdapter","args":[]}
```

```sh
node scripts/raw-harness.mjs pipeline --root /actual/external/RAW --sets 100,500,1000 --adapter /actual/external/adapter.json --work-dir /actual/external/SUITE_QA_OUTPUT --timeout-ms 900000 --report /actual/external/REPORTS/new-unique-run.json
```

`/actual/...` はユーザー環境の実在するpathで置換する。source/workは別領域、reportは毎回新規名。既存ファイル上書きなし。Manifestはcount/bytes/camera/format/checksumを記録する。メタデータ不明はunknown、decoder未確認は未確認。

Mac local adapterは原本/Proxy/固定Recipe/Local Exportの限定候補。**本番同期・実プロセス再起動復旧・Cloud Safeは未接続**。そのため計測が取れてもfull lifecycleは追加4stage不足でFAILED_OR_INCOMPLETEとなるのが正しく、PASSへ手書き修正しない。必要なfull sync/device adapterは開発残として分離する。50GB/100GB/500GB/1TB相当ProjectはRAW_QA matrixに別記録。

## iPhone / iPad

```sh
cd apps/apple
xcodegen generate
xcodebuild -list -project SUITE.xcodeproj
xcodebuild -showdestinations -scheme SUITE -project SUITE.xcodeproj
xcodebuild test -scheme SUITE -project SUITE.xcodeproj -destination 'id=<実在するdestination ID>' -resultBundlePath <新規xcresultのpath>
```

開発Team/bundle ID/署名を用意して実iPhoneと実iPadを別々に選択。自動で資格情報や公開権限を推測しない。XCTestはCore71＋Apple11を区分して記録。実機UIはimport→Proxy→編集→保存→kill/relaunch→履歴→Final→共有を手動/UITestで検証し、失敗時にOriginalを消さない。Crop各比率/印刷寸法/実pixel/DPI/ICC/JPEG/TIFF/PNGとWorkspace2・3人競合/切替/権限失効も別追加。縦横・safe area・片手・Pencil・Dynamic Type・タッチ不能も確認。FAILURE_MATRIX T01–T30、追加Tether25項目を落とさない。

ENOSPC障害注入の合格を実端末容量不足へ流用しない。実デバイスの容量不足は専用試験端末と回復手段を用意し、利用者の写真を削除して空きを作らない。ロック、強制終了、OS終了、回線断、再起動前unlockを別のログに記録。

## Gate更新

Mac build / realRAW100 / 500 / 1000 / full lifecycle / iPhone / iPadは別証拠。現在のMobile ReleaseはBLOCK。Web完成を足しても解除しないし、Web完成を待つ必要もない。全既存商用/安全/運用条件の実測が揃うまで未合格を維持する。
