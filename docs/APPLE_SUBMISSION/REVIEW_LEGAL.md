# Review Notes・課金・削除・年齢・暗号化・権利

確認日: 2026-10-03 JST。すべて提出前確認用。法務判断・事業決定・外部申告を代行して確定していない。

## Review Notes草案と審査導線

metadata.jsonのreviewNotesは内部用草案。placeholderが残る現在の状態で送信してはいけない。認証を要する機能には有効なreview account等と稼働backendを用意し、特殊なhardwareが必要なら説明資料を添える。[App Review Guidelines 2.1](https://developer.apple.com/app-store/review/guidelines/#app-completeness)

審査担当者向けの最終手順（現時点のNOT RUNを残した検証台本）:

| 手順 | 操作・期待 | 現在 |
| --- | --- | --- |
| 1 | iPhoneまたはiPadで起動。端末専用UIが表示 | SwiftUI接続コードあり・NOT RUN |
| 2 | 「読み込む」から審査用の権利確認済みRAWをFilesで選択。Proxy表示まで進む | 実RAW未配置、NOT RUN。権利済みtest asset提供経路未確定 |
| 3 | 露出/コントラスト/彩度を変更、Undo/Redo、編集前比較。原本を変更しない | コードあり未検証。画像全調整/AI等は未実装あり |
| 4 | 保存後アプリを終了→再起動。選択写真とRecipe/履歴復元を確認 | 検証未実施。未保存draft耐久など開発残を先に解消 |
| 5 | 認証し通信設定を許可、対象写真を同期。Cloud Safeの全条件を確認 | 本番auth/cloud完全同期未接続。Mac待ちだけでない開発BLOCK |
| 6 | もう一方の実機で同assetを復元し編集/Exportへ | cross-device復元未接続・NOT RUN |
| 7 | JPEG/TIFFを選択。Original+固定Recipeから新成果物を生成し共有/保存。hashと寸法確認 | 固定Recipe/一時file Export接続済み未検証 |
| 8 | Original取得不可/通信断では「Original取得待ち」、Proxy Finalを生成しない | native NOT RUN（Windows判定試験と区別） |
| 9 | 提供するAI/Batch/Preset/商用V1機能、IAP/復元/削除を実際の導線で実行 | 未実装/未接続。提出前の必須解消対象 |

現在見えるbutton名はUI sourceに基づく候補で、将来画面を作ったと見せない。ログイン/Cloud/課金/削除の正確なscreen名称・順序は実装後の動画/スクショへ対応付ける。実機QA詳細は親のMOBILE_DEVICE_QA.md、実行コマンドはNEXT_RUN.mdに従う。

審査用demo accountの要否: cloud/account機能を審査するため**必要見込み、最終仕様未確定**。現在のlocal skeletonにloginがないことを理由に「不要」と確定しない。専用review tenant、架空顧客の権利済み素材、最低権限、期限中の稼働、OTP/2FAで審査を止めない方法、障害連絡先を用意する。アカウントを作成していない。資格情報はGitに書かずASCのreview欄へ人間が登録。localhostや開発JWTを本番accountの代わりに渡さない。

Review Notesは最大4000bytes、review accountは有効性を維持する。[Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)

## IAP / subscription

SPEC-018/050/051/052/079の課金分離・Remote Config・Entitlementは維持。アプリ内のdigital機能/クラウド容量/生成creditを有料提供する場合、IAP適用を軸に審査する。地域別例外を勝手に採用せず、最終販売国/商品/導線と最新契約を確認する。外部決済誘導や有料preset marketplaceは新設しない。[App Review Guidelines 3.1](https://developer.apple.com/app-store/review/guidelines/#payments)

| 項目 | 状態 |
| --- | --- |
| IAPの最終要否/商品type/価格/期間 | 未確定。StoreKit未実装、販売owner確認 |
| subscription group/product IDs/容量商品 | 未作成 |
| restore purchases/状態同期/失効/refund/Family Sharing | 未実装・検証なし |
| subscription管理、価格・期間・自動更新説明、Terms/Privacyへの導線 | 未実装 |
| 生成creditの失敗時課金/重複課金防止/消費記録 | 未実装。非破壊保存とは別Gate |
| TestFlight/Sandbox購入試験 | NOT RUN。Developer account、実機、商品、server通知環境が必要 |

「無料にすればIAP不要」と勝手に事業仕様を変更しない。回復可能な購入の復元、課金商品内容、解約案内は公開前に実測する。

## アカウント削除

account作成を提供するアプリではアプリ内から削除を開始できる導線を用意する。単なるdeactivateで置き換えない。Sign in with Apple採用時のtoken revokeやsubscription継続の説明も要確認。[Offering account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)

現状未実装。SPEC-030の写真Trash/Recoveryとaccount deletionは別で、Trash routeを退会削除済みの証拠にしない。本人確認、共有workspace ownerの扱い、asset export、保持義務・backup猶予・委託先削除・完了通知をowner/法務と確定する必要がある。このPackは新しい削除契約や保持期間を作らない。Apple等の第三者login採用時は4.8への適合も実装前に再確認する。[Login Services](https://developer.apple.com/app-store/review/guidelines/#login-services)

## 年齢レーティング

**未確定**。写真編集だから4+等と推測しない。ASCの現在の質問票に、公開buildのコンテンツ・UGC/共有・messaging・Webアクセス・生成AI・mature/nudity・広告・parental controls等を実態どおり回答する。Night Workというmode名称から性的内容や年齢を決めない。ユーザーの私的写真とコミュニティ公開コンテンツを区別する。Kids指定、地域制限、UGCモデレーションは未確定/未実装。質問票の結果をownerが承認し、必要地域の追加回答を確認する。[Set an app age rating](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)

## Encryption / Export Compliance

| 観測 | 根拠 | 申告上の扱い |
| --- | --- | --- |
| HTTPS URLSession endpoint | SuiteBackendClient.swift | OS TLS使用コードあり。本番証明書/通信未検証 |
| SHA-256 | PhotoPipeline.swift / CryptoKit、server storage | integrity hash。独自暗号化方式と誤記しない |
| iOS file protection | PhotoPipeline/ProjectStoreのiOS条件付き書込み | OS data protection利用コードあり。端末lock時挙動は未検証 |
| server JWT署名検証 | jose + auth.ts | server側でありappにbundleされた第三者暗号libraryではない |
| 独自暗号/第三者暗号SDK | native依存では未発見 | archive未生成、最終確認未完 |
| ITSAppUsesNonExemptEncryption | Info.plistに未設定 | 未確定。NOを自動設定していない |

OS暗号のみの場合とそれ以外で必要文書が異なり、配信国も関係する。最終binary/SDK inventoryと配信国をowner/必要に応じ法務が確認し、ASC質問票に回答する。暗号を使わないと断定せず、例外適用も自己確定しない。[Overview of export compliance](https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance/) / [Encryption documentation](https://developer.apple.com/help/app-store-connect/reference/export-compliance-documentation-for-encryption/) / [ITSAppUsesNonExemptEncryption](https://developer.apple.com/documentation/BundleResources/Information-Property-List/ITSAppUsesNonExemptEncryption)

## 権利・利用規約・提出前owner決定

- SUITE名称の商標/名称availability、seller/著作権名: 未確認。
- 審査/スクショ/プリセット用写真・被写体・RAW/camera sampleのライセンスと肖像同意: 未確認。実顧客写真を無断で配布しない。
- Core/既存資産、npm依存、将来RAW library/camera SDK/ML weights/fonts/icons/presetsの商用権利・notice: 最終audit未完。METIS/Picasso再利用を権利免除としない。
- 生成AIの入出力権利/第三者素材/identity保護、UGCの通報/削除/利用条件: 未実装/法務確認待ち。既存仕様を削除しない。
- 利用規約: 運営者、対象者、写真所有権、処理/委託の許諾範囲、禁止事項、料金/解約、退会/保存期間、障害/責任、support/準拠法等の入力が未確定。最終契約文を生成したと扱わない。
- EULAはApple標準かcustomか未決定。標準が適用される仕組みとcustomの登録方法をowner確認する。[Provide a custom license agreement](https://developer.apple.com/help/app-store-connect/manage-app-information/provide-a-custom-license-agreement/)
- 配信国によるtrader/税務/その他表示: 国/法主体が未確定のため未判定。法務承認をGateとして残す。
