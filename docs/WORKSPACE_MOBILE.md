# Workspace Mobile 接続候補・未検証

2026-10-03 JST。45節の独立追加仕様に対する最小接続候補。旧147節・固定6文書・Recipe v1・Crop/Export・保存同期契約は変更していない。

## コードあり・未検証

- `packages/SuiteCore/Sources/SuiteCore/Workspace.swift`: ServerのcamelCase DTO、4Role/11PermissionのUIヒント、64bit容量応答、切替generation。UI判定はServer認可の代替ではない。
- `apps/apple/Suite/Services/WorkspaceClient.swift`: HTTPS限定・外部Bearer注入、認証リダイレクト拒否、ephemeral/no-cache、Workspace/Project/Member/Preset/Storage/Assetメタデータ取得。レスポンスを現在のWorkspaceへ照合。Originalの全同期や一覧からの取得は行わない。
- Recipe GET/PUTの候補は既存Recipe v1をversion内に保持。409時も別Versionの競合応答を返し、無条件overwriteへ再試行しない。共同編集UIにはまだ接続していない。
- `apps/apple/Suite/Shared/WorkspaceBrowser.swift`: iPhoneはWorkspace切替・再読込みを下部操作、iPadはNavigationSplitViewのWorkspace/Project/詳細3領域。nil clientなら未接続と表示し、架空データは作らない。
- Workspace切替・再読込み・バックグラウンド時は旧データを消去しgeneration更新。A→B→Aでも旧応答を破棄する。Project取得が拒否された場合もWorkspace詳細を消去する。継続表示中のサーバー側revoke通知購読は未実装。

## 未実装・未接続（環境待ちと混同しない）

本番認証UI/Keychain/ログアウト連携、実Cloud provider、招待・Role管理画面、Project作成画面、Proxy画像転送/一覧画像、Workspace AssetのローカルEditorModelへの引渡し、Shared Recipeの編集・差分・別版採用UI、Preset適用UI、Workspace専用のUpload/Sync/On-demand RAW/Final Export全導線、耐久Offline queue、Billing購入/復元/検証は未接続または未実装。メタデータ閲覧を写真編集・実Cloud Safe・共同作業完走として扱わない。

## NOT_RUN

| 対象 | 状態・理由 | 必要環境 | 次手順・合格条件 |
| --- | --- | --- | --- |
| WorkspaceTests 10件 | NOT_RUN: WindowsにSwiftなし | Mac/Swift 6 | `swift test --package-path packages/SuiteCore --filter WorkspaceTests`。Role、10/20TB、超過保持、遅延応答拒否の全テスト成功 |
| WorkspaceClient / SwiftUI build | NOT_RUN: Xcodeなし | Mac/Xcode・iOS SDK | `cd apps/apple; xcodegen generate` 後、`xcodebuild -project SUITE.xcodeproj -scheme SUITE -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`。0 compile error |
| iPhone UI | NOT_RUN: 実機なし・認証接続未実装 | 署名済build/iPhone/HTTPS検証backend/実認証adapter | mainの入口へ認証済clientを注入。2Workspace切替/再読込み中切替/権限剥奪/401/403/遅延応答を確認し別Workspace情報が一瞬も再表示されない。下部44pt操作とVoiceOver確認 |
| iPad UI | NOT_RUN: 実機なし | 同上+iPad | 縦横/Stage Manager/分割画面で3領域とcompact遷移を確認。切替で旧Project/Asset/Preset/使用量が残らない |
| Shared RAW→Proxy→Edit→Recipe→復元→Cloud Safe→Export | NOT_RUNに加え導線未実装 | 未接続開発完了後、Mac・iPhone・iPad・checkout外実RAW・実Cloud | 共同編集/CAS衝突/別Version保持/原本checksum不変を全工程で実測。メタデータ試験やWindows PASSで代替不可 |

`WorkspaceBrowser(client: nil)`が安全な初期入口。clientには認証済セッション由来トークンだけを注入する。任意文字列の擬似トークン、平文HTTP、本番Cloud/Billingのモック成功を代用しない。Mobile Releaseは未合格。

## 変更ファイル（担当分）

上記3コードファイル、`packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift`、本書のみ。親担当がApp入口と最終Evidenceへ統合する。テスト実行済み件数は0、NOT_RUNはCore 10件＋native build/実機導線。
