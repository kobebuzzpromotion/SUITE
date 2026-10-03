# App Store Connect入力台帳

状態は提出前草案。公表不可。確認日: 2026-10-03 JST。正式入力値はmetadata.jsonのvalue、候補はdraftを参照。null/未確定を空白の合格や「不要」に変換しない。

## 基本情報と候補文面

Apple公式上、nameは2–30文字、subtitleは30文字以内。[App information](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/)

| 項目 | 候補/コード観測 | 状態・確定者 |
| --- | --- | --- |
| アプリ名 | SUITE | 仮称。SPEC表紙どおり商標確認未完了。名称の利用可能性/権利はowner確認 |
| サブタイトル | RAWを守る、写真編集ワークフロー | 草案。native実測後のみ掲載候補 |
| 主言語 | ja（日本語） | 候補。販売/審査連絡言語はowner承認待ち |
| 主カテゴリ | Photo & Video / 写真／ビデオ | 写真編集用途に基づく候補。owner確定待ち |
| 副カテゴリ | 未確定（未指定も候補） | 製品内容と配信判断後 |
| SKU / Apple ID / Team ID | 未確定 | ASC未作成、Developer account未確認 |
| Bundle ID | コードはcom.example.suite | 開発placeholder。正式な所有Bundle ID未確定、提出不可 |
| Version / Build | コードは0.1.0 / 1 | 開発値。提出版・archive未確定 |
| 対象 | iPhone / iPad | 方針記入済み。実機モデル/OSは未確定 |
| 最低OS | build骨組みは17.0 | 製品の最低OS確定ではない（CONTRACTS維持） |
| 販売者・著作権表記 | 未確定 | 法人/個人の正式名・住所・連絡先・権利者をowner記入 |
| 配信地域/価格/税区分/リリース方法 | 未確定 | 課金/provider/地域の選定をこのPackで実施しない |
| Mac / Vision Pro配信 | 初期対象外 | ASC実設定未確認。対応する自動配信設定も公開前に確認 |

### 説明文（内部検討用。現buildの能力証明ではない）

SUITEは、iPhoneとiPadのための写真編集ワークフローです。
RAW原本を変更せず、通常の閲覧や編集には軽量なProxyを使用し、編集内容をRecipeとして別に保存する設計です。
最終書き出しでは原本と保存した編集内容から、新しい画像を生成します。
対応するRAW形式、利用可能な編集機能、クラウド機能、料金は、実機検証と正式な提供内容の確定後にご案内します。

この文面は開発中の設計を説明する草案であり、ストア掲載文の確定版ではない。商用V1のAI Portrait/Body・Auto Color・Preset・Batch・Cloud Sync等の未完成を免責文で回避して審査提出しない。対応カメラ/性能/「安全保証」/無制限/価格/無料等を未確認で追記しない。

### キーワード草案

`写真編集,RAW現像,非破壊,レタッチ,一括編集,写真管理`

レタッチ/一括編集/写真管理は商用仕様の候補語であり、実装・実測未完なので現buildへ掲載不可。名称や競合名は入れていない。文字数だけでなくUTF-8 byte数もvalidate.mjsで検査する。

説明文4000文字以内、Keywordsは公式上100bytes以内、販促文は任意170文字以内。Support URLは利用者の問い合わせ先に到達できるものを用意する。Review Notesには別の4000bytes制限がある。[Platform version information](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)

## URL・連絡先

| 項目 | 正式URL | 所有domain確定後の構造候補 | 必要な実体 |
| --- | --- | --- | --- |
| Privacy Policy URL | null | HTTPSの所有domain + /suite/privacy | 運営者、収集、目的、委託/共有、保持/削除、問い合わせ |
| Support URL | null | HTTPSの所有domain + /suite/support | 到達可能なsupport窓口、操作FAQ、障害案内 |
| Marketing URL | null | HTTPSの所有domain + /suite | 任意。検証済み機能だけ掲載 |
| Terms URL | null | HTTPSの所有domain + /suite/terms | 利用条件・権利・責任・支払等の承認版 |
| Privacy choices URL | null | HTTPSの所有domain + /suite/privacy/choices | 任意。削除・export・設定の説明 |
| Review contact | null | 連絡担当者・phone・email | Appleが確実に連絡できる担当 |

上記は存在するdomain/URLではなくパス案。架空の企業サイトやメールを作らず、DNS/TLS/HTTP/accessibility確認も未実施。Privacy Policy URLは必須で、実データ取扱いに即して申告を更新する。[Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)

## 未確定のまま保持する提出項目

App Privacy詳細、データ種別/purpose/linked/tracking、third-party SDK最終一覧、cloud/auth/storage委託先、年齢レーティング、Export Compliance、IAP商品と価格、アカウント削除、審査用account、権利/EULAはPRIVACY_DATA_SDK.mdおよびREVIEW_LEGAL.mdの台帳で扱う。App record作成や申告値の保存は未実施。

