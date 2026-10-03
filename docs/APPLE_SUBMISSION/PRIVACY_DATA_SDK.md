# App Privacy・データ・SDK・権限監査

## Workspace/Crop追加後の提出前再監査

追加backendのlocal SQLiteはmembership user ID/role、招待先verified emailとtoken hash/期限、Project/Asset参照、Recipe version/editor/diff、Preset snapshot、Selection、操作Audit、ユーザー別traffic、容量/Entitlement候補を扱う。Original bytesはDBへ入れない。Crop/Export設定はRecipe拡張へ保持。これらの本番送信・保存地域・保持期間・本人紐付け・利用目的・削除/復旧/解約後取得・第三者提供は本番構成未決定で、App Privacy回答をnullから推測で埋めない。

WorkspaceClientはHTTPS/Bearer注入型でdefault未接続。認証・招待配送・Cloud/Billing providerは採用していない。価格試算はofflineのみ、Apple取引や支払情報を取得しない。既存jose、Node/SQLite、Apple system frameworksに加えて新しい第三者課金/Cloud SDKを導入した事実はない。native binary/実通信/各SDK privacy manifestの確認はMac/実機NOT_RUN。

アカウント削除とWorkspace RAW所有/チームmember revoke/データ取得権は別の処理として提出前に実装・法務確認する。staff一名の削除で全原本を即消去したり、削除申告をUIの非表示で代用したりしない。現在はアカウント削除未実装、申告未確定、提出BLOCK。

確認日: 2026-10-03 JST。**App Privacy申告は未確定、公開していない。No Data Collected / tracking=falseを既定回答にしない。** 静的なソース読取りは、実通信captureやproduction運用監査ではない。

## 観測したデータ経路

`SuiteApp.swift` → fileImporter → `EditorModel` → `PhotoPipeline.swift` → private Original/Proxy/Exportと`ProjectStore.swift`のJSON checkpoint。非破壊境界は変更していない。
`SuiteBackendClient.swift`はHTTPS/Token注入型。asset(name/hash/size)、Original、Recipe送信とOriginal取得のコードがあるが、`EditorModel()`既定はbackend未接続。RAW通信許可の既定はfalse。本番の収集が「ない」とは結論しない。
`apps/backend/src/{auth,repository,storage,server}.ts`はローカル開発backend。JWT subject/tenantとasset/recipe/auditを永続化する。正式provider/region/retention/processor/access loggingは未定。

Appleの「収集」は端末外へ送信され、要求処理の即時期間を超えて開発者/委託先がアクセスできる取扱いを含む。端末内だけの処理とクラウド保管は別に評価する。人物画像やEXIFの内容に応じて写真以外のデータ分類も確認する。[App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/)

## 収集データ台帳（申告候補。最終回答ではない）

| データ | 現コード/仕様根拠 | 端末外・目的 | linked / tracking | 未確定・必要Evidence |
| --- | --- | --- | --- | --- |
| RAW/JPEG/Proxy/Preview/Generated/Export | PhotoPipeline, SuiteBackendClient; SPEC-027, CLOUD-07 | ローカルあり。Original転送コードあり。production写真保管は未接続。App Functionality候補 | account/workspace保存ならlinked候補。tracking未確定 | 実際に送る表現、暗号化、対象国、保持/削除、第三者access、retention |
| Recipe/履歴/Session Look/Mask | ProjectStore, Recipe, SessionLook; SPEC-006, ADD-21 | 編集/復元目的。Recipe転送コード、Session Look描画/同期は未完 | ユーザーコンテンツ等の候補。linked候補/追跡未確定 | 包含fieldとApple分類、顔解析結果の伝送有無 |
| EXIF/GPS・撮影日時・camera model | RAWそのものをcopy/uploadする経路 | EXIFを除去したとの証拠なし。GPSが含まれれば位置情報申告候補を要評価 | linked候補、追跡未確定 | 実RAWのmetadata検査、非写真dataの保持・利用有無。削除仕様を勝手に追加しない |
| account ID / workspace / editor ID | auth.ts, repository.ts, RemoteRecipe | 認証/権限・共同編集・監査。serverにtenant/subject等 | User ID linked候補。tracking未確定 | 本番session/Keychain未接続、role/退会/委託先一覧 |
| 氏名/email/連絡先 | production認証/問い合わせが仕様上必要 | 未実装/未確定。App Functionality/Customer Support候補 | 未確定 | 実入力画面と委託先収集。自動で全連絡先を取得しない |
| IP/token/request logs | HTTPS client + backend auth | Tokenを送るコードあり。IP保持/アクセスログは本番未確認 | 不保存の証明なし。linked/tracking未確定 | LB/CDN/auth/server retentionとtoken非記録を実測 |
| 購入/領収/entitlement/利用料金 | SPEC-050/051/052; PaymentProviderは契約のみ | 未実装。Purchase History / App Functionality候補 | 未確定 | StoreKit/server通知/Product tableの実装後監査 |
| crash/performance/thermal/battery/操作log | SPEC-070; PhotoPipeline計時, QA adapter | 本番telemetry未実装。QA logと製品telemetryは分離 | Analytics/App Functionality候補、linked/tracking未確定 | 本番送信項目/匿名化/保持/consent確認 |
| 顔特徴/Person ID/landmark/body mask | ADD-10/16, SPEC-014/060; planning dataのみ | 本番解析/送信未実装。on-device優先は方針で実行証拠ではない | 生体識別に使うdataならSensitive Info候補。未確定 | 顔検出と本人識別を区別、目的・地域法務・retention・同意・cloud必要性確認 |
| Personal Color | ADD-12/13; SessionLook intent | 任意Color Direction。人種/健康診断でない既存仕様維持 | 情報分類/伝送は未確定 | 人物形状を変更しない、推定を強制しない。健康dataとの誤分類回避 |
| 広告ID/広告track/外部SNS/analytics SDK | 現native依存に見つからない | 実装無しという静的観測のみ | 「trackingなし」の申告は未確定 | 最終archiveと全server/vendor実挙動で確認 |

App Privacyは第三者取扱いも含め、iPhone/iPadの提供版全体と整合する回答が必要。policy URL/実画面説明/manifest/実通信が矛盾しないことを確認する。[Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)

## SDK/Framework依存棚卸し

| 分類 | 現状 | 提出前作業 |
| --- | --- | --- |
| Apple first-party | Foundation, SwiftUI, UIKit, Combine, UniformTypeIdentifiers, CoreImage, ImageIO, CryptoKit | Apple frameworkを第三者SDKとして数えない。RAW/metadata/TLS/file protectionの実挙動を検査 |
| 自作local Swift Package | SuiteCore、METISMobileCore（Package.swiftはlocal依存のみ） | 自作コードにもPrivacy Manifest対象APIがある。ライセンス帰属とresource収録を確認 |
| iOS appにbundleされる第三者SDK | 現project.yml/Package.swiftに外部SDK依存を確認できない | archive未生成なので最終「0」確定ではない。binary/transitive dependencyを再検査 |
| server runtime npm | jose 6.2.12（JWT） | iOS SDKではない。serverの保持/log/暗号化処理とlicense通知を別途監査 |
| 開発依存 | typescript 5.9.3、@types/node 24.19.1、XcodeGen構成 | 配信bundleと混同しない。ビルド・QA用Mac Package/Darwinは製品SDKでない |
| 将来のauth/cloud/AI/camera/payment SDK | provider最終選定無し、未実装 | 今回採用しない。追加時はbinary/データ/manifest/licenseを再監査 |

Apple指定のSDK一覧に該当する依存と再包装SDKはprivacy manifestやbinary署名要件の対象。最終archiveから依存を確認し、一覧を再照合する。[Third-party SDK requirements](https://developer.apple.com/support/third-party-SDK-requirements/)

## Privacy Manifest / Required Reason APIs

現repoに`PrivacyInfo.xcprivacy`は見つからない。追加作業は未実装。偽の「収集なし」manifestや理由codeをこのPackで作らない。

| 使用箇所 | API観測 | 必要な監査 |
| --- | --- | --- |
| EditorModel.swift: proxyLongEdge | UserDefaults.standard.integer(forKey:) | User Defaults API categoryの実用途/approved reason照合 |
| PhotoPipeline.swift: import計時 | ProcessInfo.systemUptime | System Boot Time系categoryの実用途/approved reason照合 |
| ProjectStore.swift / CloudTransferCoordinator.swift | FileManager.attributesOfItem | 実際に取得する属性とcovered APIの一覧を照合。sizeだけだから不要とは自動判定しない |
| apps/apple/QA/RawQAAdapter.swift | systemUptime/getrusage/Darwin/fileSize | Mac QA tool側。app targetには含まれない（project.yml sources=[Suite]）。製品privacyへそのまま転記しない |

Appleの現在のapproved reasonと正しいbundleへの収録を確認後、開発者が実用途に即して記載する。理由申告が必要なAPIの未申告や不正なmanifestは提出障害になり得る。[Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api) / [Adding a privacy manifest](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)

## 権限とprivacy policy作成の入力

現在のimportはuser選択のfileImporter、shareはUIActivityViewController。Photo Library/Camera/External Accessoryの使用許可文言はInfo.plistに無い。これは追加アクセスが不要と確定した意味ではなく、PhotoKit書込/カメラ/USB-Tether接続は未実装。実際のAPIに必要なpurpose string/entitlementを実装時に監査する。不要なpermissionを一括追加しない。

Privacy policyには運営者、データ種類/目的、処理場所/委託先、cloud任意性、顔処理、共有権限、保持/Trashと退会削除、backup保持、利用者の選択/同意撤回/問い合わせ、未成年、国際移転、security連絡先、変更通知を実運用に合わせて記入する。保存期間や削除猶予をこのPackで新規確定しない。法律上の適合判定ではなく、owner/法務確認待ち台帳である。
