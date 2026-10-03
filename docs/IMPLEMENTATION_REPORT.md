# 実装前報告（基本設計書83節）
2026-10-03。基本骨組みの着手前報告。製品完成・ライセンス承認・実機対応を宣言するものではない。

| 指定項目 | 調査・設計結果 |
| --- | --- |
| 1. 既存コードベース一覧 | METIS: 2026-10-01/fun-call-review-release-final/server/metis。Picasso: 2026-08-31/codex-12-12-csv-1-pulse/work/picasso-live-v123-iso3。da Vinci: 2026-09-20/da-vinci-color-me-color-me/work/da-vinci。詳細と採否はREUSE_AUDIT.mdへ記録。 |
| 2. METISから継承可能なCore | ゲート判定、要件追跡、状態遷移、expected_version、冪等イベント、証拠不足を成功にしない運用を継承候補とする。16 Coreを欠落させず、SUITE専用OSは新設しない。 |
| 3. Picasso / da Vinci再利用 | 生成Gateway、Job、Provider routing、Cost、Credit、Asset境界を監査。固定tenant認証、同一objectKeyの上書き、CASなし同期はそのまま転用不可。既存の正常動作が確認できる機能は再実装せず、生成系は接続アダプター設計を先行。 |
| 4. 新規実装が必要なモジュール | ネイティブiPhone/iPad UI、RAW Provider、Proxy、非破壊Recipe、原本保護、Camera Adapter、Cloud Safety/CASのSUITE固有境界。20モジュールは仕様として全て維持し、未実装は明示する。 |
| 5. RAW処理候補 | Core Image/CIRAWFilterを最初のアダプター候補にする。LibRaw等はカメラ範囲・色・速度・ライセンス比較後に追加。RAWProvider越しに差し替え可能とし、Core Imageのみで製品対応を確定しない。 |
| 6. Tether方式 | ImageCaptureCoreの外部カメラ検出・取込を検証候補にする。USB-C接続だけでは対応を保証しない。メーカー/モデル/OS/ケーブルごとの実機表が必要。CameraProviderで抽象化し、未検証モデルをSupportedにしない。 |
| 7. Camera Vendor SDK依存 | リモート撮影、転送イベント、カメラ設定、PTP拡張をアダプター内へ隔離。Canon/Sony/Nikon/FUJIFILM/PanasonicのiOS提供可否・再配布条件は未確認。SDK採用・公式対応表の確定は行わない。 |
| 8. On-device AI候補 | Visionの顔/人物解析、Core ML、Metal。利用可能なOS・端末・モデルの精度・速度・熱・ライセンスを検証する。顔特徴量は可能な限り端末内処理。学習モデルは未選定。 |
| 9. Cloud AIが必要な処理 | 背景/衣装/天候、大規模Fill/修復、生成デザイン等はProvider接続候補。既存Gatewayを調査してから接続する。通常RAW/Body処理を一律クラウドへ送らない。Canonical背景とIdentity Gateが必要。 |
| 10. Storage候補比較 | R2は容量/API課金とegress方針、S3は地域/ストレージクラス/要求/転送/復旧構成を比較。S3-compatibleも候補。日本レイテンシ、耐久・可用性、災害復旧、replication、versioning、support、scaleの実測は未実施。Providerは未決定、料金は固定しない。 |
| 11. App Store制約 | IAPとEntitlement分離、写真/カメラ/外部機器の権限、プライバシー開示、アカウント削除、購読管理、購入復元をゲート化。販売地域ごとの最新ルールとApple審査を公開前に再確認する。 |
| 12. 商用ライセンス確認 | LibRawのLGPL/CDDL、各Camera SDK、Core MLモデル/重み、生成Provider、アップスケール/色処理ライブラリの配布条件。未確認のライブラリを製品採用済みにしない。 |
| 13. 推奨Repository構成 | apps/apple（Swift/SwiftUI）、packages/SuiteCore（UI非依存Swift）、apps/backend（TypeScript API）、contracts（共有形式）、docs（正本/追跡/監査）、scripts、.github/workflows。Web UIは作成しない。 |
| 14. Phase・依存関係 | Phase 0再利用監査→安全境界/API/認証/保存→iPhone UI→iPad UI→編集/復旧/書出→実機/リリース。元仕様Phase 1〜10と商用V1要件は保持し、12項目のMobile Release First実装順を優先する。 |
| 15. リスク一覧 | RAW互換/色再現、OSカメラ制約、未検証SDK、巨大RAWのメモリ/熱、同期競合、認証/tenant境界、アップロード途中復旧、Identity/生成一貫性、規格/ライセンス、Apple課金。現在WindowsでXcode/Swift/Apple SDKなし、iOSビルド・実機検証は実行不能。 |
| 16. 最短MVPルート | まず原本不変・Recipe履歴/CAS・Cloud Safe判定をテスト可能な境界として実装。ネイティブ共通Core＋端末別UIで取込/Proxy/編集/保持/書出の縦の骨組みを作る。これは81節の商用V1（Auto Color/AI Portrait/AI Body/Preset/Batch/Cloud Sync/Sharing等）の代替ではない。全要件を追跡し、未完成のまま製品公開しない。 |

## 先に解く設計難所

- 原本とProxy/Recipe/Generated/Exportを別資産として扱う。原本は書込み先として再利用しない。
- 保存は単なるUI上の成功表示で済ませず、書込み完了後だけ状態を進める。編集には単調増加revisionとexpected versionを使用し、競合時は明示的に拒否する。
- CLOUD SAFE/SyncedはサーバーのChecksum・Object存在/永続性・DB commit・権限の検証後だけにする。クライアント申告だけで安全と判定しない。
- ProxyとFinalは同じRecipeを使う。生成FinalはCanonical Asset再利用とIdentity Gate通過が必要。未実装Providerは明示的に利用不能とする。
- 未確定のRAW/Storage/Camera/AI/Payment提供元はProvider境界で隔離する。仮の実装を商用対応と表示しない。

## 一次資料

- [CIRAWFilter](https://developer.apple.com/documentation/coreimage/cirawfilter)
- [ImageCaptureCore](https://developer.apple.com/documentation/imagecapturecore)
- [Core ML](https://developer.apple.com/documentation/coreml)
- [LibRawとライセンス](https://www.libraw.org/about)
- [R2料金](https://developers.cloudflare.com/r2/pricing/) / [S3料金](https://aws.amazon.com/s3/pricing/)
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) / [アカウント削除](https://developer.apple.com/support/offering-account-deletion-in-your-app)
