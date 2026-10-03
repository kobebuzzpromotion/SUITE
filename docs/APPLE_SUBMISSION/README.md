# Apple Submission Pack — 提出準備正本

確認日: 2026-10-03 JST。状態: **DRAFT / SUBMISSION BLOCKED / Mobile Release BLOCK**。

このPackは既存147節・固定6文書・CONTRACTS・6領域保存同期契約を変更しない、提出準備の補助文書である。App Store Connectへの登録・入力・アップロード・申告・公開は一切実施していない。製品機能の追加や削除、provider選定も行っていない。

初期対象は **iPhone / iPadだけ**。MacはSwift・Apple画像処理・負荷試験の検証環境であり、Mac製品のリリースGateではない。Mac上のテストとiPhone実機Gate、iPad実機Gateは別々で、どれも未実行をPASSにしない。Web完成はMobile Release Gateに含めない。

## 収録物

| 文書 | 内容 |
| --- | --- |
| METADATA.md / metadata.json | 全提出項目の候補・未確定事項。JSONのnullは未確定を意味する |
| ASSETS.md | iPhone/iPadスクショ・icon・実機由来Evidence |
| PRIVACY_DATA_SDK.md | データ・通信・SDK・Privacy Manifest・権限の現コード監査 |
| REVIEW_LEGAL.md | Review Notes・操作手順・デモ・課金・削除・年齢・暗号化・権利・利用規約 |
| NEXT_SUBMISSION.md | Mac/実機から提出準備を再開する手順・必要環境・未実施理由・合格条件 |
| sources.json | Apple公式URL・確認日・用途（第三者ブログや非公式解説は根拠に不使用） |
| validate.mjs | Packの必須欄・文字/byte長・未確定値・BLOCK維持・参照先を検査するローカル検査 |
| validation-results.json | 実行したPack静的検査7 PASS / 0 FAIL / 0 SKIP。製品34回帰とは別集計 |

分類別入口: APP_INFORMATION.md、STORE_METADATA.md、SCREENSHOTS.md、APP_ICON.md、APP_PRIVACY.md、PRIVACY_POLICY.md、THIRD_PARTY_SERVICES.md、EXPORT_COMPLIANCE.md、APP_REVIEW.md、ACCOUNT_DELETION.md、IAP_ASSESSMENT.md。各入口から上記内容正本へ参照し、申告値や文面を重複管理しない。

製品とテストの状態正本は親の HANDOFF.md、VERIFICATION.md、verification-results.json、147節の requirements.json / TRACEABILITY.md。Packの静的検査成功は、製品・プライバシー・法務・Apple審査の合格ではない。

## 区分と提出不可理由

| 区分 | 現状 |
| --- | --- |
| 記入済み（既存方針の転記） | iPhone/iPad限定、RAW原本不変、Proxy通常操作、Recipe別保存、Web後続 |
| 草案 | 日本語ストア文面、カテゴリ、URL構造、審査説明、権利/規約チェック項目 |
| 未確定 | 商標、権利者・販売者、正式Bundle ID、Developer Team、URL、価格/IAP商品、公開国、年齢、暗号化申告、App Privacy |
| コードあり・未検証 | SwiftUI、固定Recipe入力のApple Export、HTTPS client、画像保存、端末権限。native未ビルド |
| 未実装・未接続 | 本番認証/ストレージ/完全同期、account deletion、StoreKit/IAP、商用V1残機能、PrivacyInfo.xcprivacy、icon |
| NOT RUN（環境待ち） | Macビルド、実RAW 100/500/1000、iPhone実機、iPad実機、archive/privacy report/審査用スクショ |
| 実施していない外部操作 | App Store Connect app record作成・申告・TestFlight配信・審査提出 |

Appleは提出buildの完成度・メタデータ/URL・端末での安定性・login時のreview accessを求める。本Packを作っただけでは提出可能にならない。[App Review Guidelines 2.1](https://developer.apple.com/app-store/review/guidelines/#app-completeness)

## 既存要件との対応

SPEC-005/065/066・MOBILE-01/03/15: iPhone/iPad対象とQA。SPEC-006/007/027/059/060/078・CLOUD-01/02/06/09/11/24: 非破壊・プライバシー・Cloud Safe。SPEC-051/052/079: 課金/削除/ストア提出。SPEC-081: 商用V1を草案の短い機能説明で削減しない。ADD-01–23: Session Look/5モード/人物補正/Personal Colorは維持し、未検証機能を広告しない。

## 短い再開手順

1. `node docs/APPLE_SUBMISSION/validate.mjs` と `npm run check` をrepoルートで実行。
2. NEXT_SUBMISSION.mdのMac→実RAW→iPhone→iPadを実測し、現buildと結果を固定。
3. 未実装/未接続の解消とowner承認を別々に確認し、最終archiveからSDK/データ/権限/暗号化申告を再監査。
4. 全必須Gate後に人間の公開承認を得る。今は提出せずBLOCKを維持する。
