# Mac・実機・提出準備の次手順

2026-10-03 JST。Mac製品を作る手順ではなくiPhone/iPadアプリの検証/提出準備。現時点の全native/実機項目は **NOT RUN**。production未接続/機能未実装は環境待ちとは別の開発BLOCKである。

## 1. Windowsで実行できる検査

repoルートで:

```powershell
node docs/APPLE_SUBMISSION/validate.mjs
npm run check
node scripts/final-regression.mjs
```

前者はPack整合だけを確認する。後二者の結果正本は親のverification-results.json。34基盤テストを除外しない。App Storeへの通信や申告を自動実行しない。

## 2. Mac環境の確認とnativeビルド

正式Apple提出要件は、確認日時点でXcode 26以上およびiOS/iPadOS 26 SDK以上。最低Deployment TargetとビルドSDKを混同しない。repoの17.0暫定targetは今回変更しない。再実行時に公式の更新を確認する。[Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/)

```sh
xcodebuild -version
xcodebuild -showsdks
swift --version
swift test --package-path packages/METISMobileCore
swift test --package-path packages/SuiteCore
swift build --package-path apps/apple -c release --product SuiteRawQAAdapter
cd apps/apple
xcodegen generate
xcodebuild -list -project SUITE.xcodeproj
xcodebuild -showdestinations -project SUITE.xcodeproj -scheme SUITE
cd ../..
```

QA executable product名は `apps/apple/Package.swift` のSuiteRawQAAdapterを確認済み。署名Team/Bundle IDは未確定なので勝手にcom.exampleのまま公開archiveを作らない。コマンド失敗はログを保管してFAILとして扱う（環境欠如のみNOT RUN）。

## 3. 実RAW・実機Gate

実RAWはcheckout外の指定領域にのみ配置し、Macでは実データを持つ外部directoryへパスを置き換える。ダミーRAWを生成しない。`docs/NEXT_RUN.md`、`docs/RAW_QA.md` のManifest/pipelineコマンドを実行し、100/500/1000ごとのsync/restartRecovery/cloudSafeを別Evidenceにする。local QA adapterのNOT_RUN stageをfull cloud lifecycle PASSへ変換しない。

接続先は `xcrun devicectl list devices` とXcodeのshowdestinationsで取得した実値だけを使う。親NEXT_RUN.mdに従い、iPhone実機とiPad実機それぞれでXCTest/手動QAを実行する。確認操作はRAW Import→Proxy→編集→Recipe保存→アプリ終了/再起動→同期/Cloud Safe→Original取得→JPEG/TIFF Export。ネット切断/lock/終了/低容量/再開も独立して記録する。

| Gate/作業 | 現在・理由 | 必要環境 | 合格条件 |
| --- | --- | --- | --- |
| Swift/Core・Apple画像pipelineビルド/試験 | NOT RUN / Mac・Swift未接続 | Mac+Xcode、現source | buildと全対象XCTestが実行され結果保存 |
| 実RAW 100/500/1000・容量別Project | NOT RUN / RAW未配置 | 外部RAW setとManifest+Mac | 全stage実測、原本hash不変、負荷/失敗/復旧指標あり |
| iPhone実機 | NOT RUN / 未接続 | モデル/OS実値、署名、RAW、接続済みbackend | full lifecycle/中断復旧/操作性/安全Gate実測 |
| iPad実機 | NOT RUN / 未接続 | 別実機、portrait/landscape、pointer | iPhoneと独立にfull lifecycleと専用layout確認 |
| 本番cloud/auth・account deletion・IAP | 未実装/未接続 | 開発完成後の実サービス/商品/権限 | 権限/削除/購入復元含む実測。環境到着だけで合格にしない |
| icon/screenshot/privacy report/archive | NOT RUN / 素材・Mac未配置 | 権利済素材、最終binary | ASSETS/PRIVACY台帳との一致 |
| URLs/年齢/暗号化/権利・規約 | 未確定 / owner入力なし | 正式運営情報・最終配信地域 | 本番実態に即した承認版、URL到達/記載確認 |
| App Store Connect操作/審査提出 | NOT RUN / 未承認・前提Gate未合格 | 人間の権限/承認 | 他Gate通過後だけ。今は提出不可 |

## 4. Archiveから提出項目を確定（今は未実施）

全必須Gate後にownerが正式Team/Bundle ID/StoreKit商品を確定。Xcode Organizerでarchiveを検証しPrivacy Reportを取得、archive内PrivacyInfo.xcprivacy/署名/SDK/Info.plist/icon/permissionを確認する。通信captureでApp Privacy台帳と実データ/保持の一致を確認し、年齢/暗号化/権利回答を承認する。端末から取得した実screenをASSETSへ対応付け、Review Notesを実際の操作名へ更新する。

初期公開はiPhone/iPadだけなので、ASCの「iPhone/iPad apps on Macs with Apple silicon」availabilityを非公開にする設定を公開前に確認する（今回設定操作は行っていない）。Macで動くiOSアプリの自動配信とMac QAを混同しない。[Apple silicon Mac availability](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-macs-with-apple-silicon/)

Apple Vision ProのiPhone/iPad互換配信も初期対象外。Apple公式ではASCでavailabilityを変更しなければ互換アプリが配信対象になる。公開前にPricing and Availability → Apple Vision Pro Availability → 「Make this app available on Apple Vision Pro」の除外を確認する（設定確認/変更はNOT RUN）。visionOS製品の追加ではない。[Apple Vision Pro availability](https://developer.apple.com/help/app-store-connect/manage-your-apps-availability/manage-availability-of-iphone-and-ipad-apps-on-apple-vision-pro/)

すべて完了後にのみ公開承認を得てASCへ入力・upload・submitする。手順を用意したことやmetadata文字数検査をMobile ReleaseのPASSにしない。
