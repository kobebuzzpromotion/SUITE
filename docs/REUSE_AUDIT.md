# 既存資産の再利用調査

調査日: 2026-10-03。SUITEは新規の専用リポジトリとして開始する。本調査担当はMETIS、Picasso / da Vinciの元資産を読み取りのみとし、コード・データ・認証情報のコピーや元環境への変更は行っていない。本書は再利用候補と設計上の注意点の調査であり、移植完了・本番動作確認の報告ではない。統合担当によるその後の部品適応は末尾で区別する。

## 調査対象と出典

`C:/Users/user/Documents/Codex` 以下を `rg --files` で探索し、依存ディレクトリ・ビルド出力を除いてmanifest、METISモジュール、写真API、スキーマ、関連テストを読んだ。以下のパスは調査時点で見つかったローカルコピーであり、稼働中の最新版であることまでは確認していない。

|略号|ローカルの出典ディレクトリ|確認内容|
|---|---|---|
|M|`C:/Users/user/Documents/Codex/2026-10-01/fun-call-review-release-final`|METISの純粋な判定、版付きイベント、原子的な保存インターフェース、関連DB制約・テスト|
|G|`C:/Users/user/Documents/Codex/2026-08-23/b/METIS_CODEX_MASTER_ENGINE_v1.1.txt`|269行の設計原典を全文確認。DESIGN、ENGINEERING、CRITIC、DNA等の原則。実行可能なSDKではない。|
|P|`C:/Users/user/Documents/Codex/2026-08-31/codex-12-12-csv-1-pulse/work/picasso-live-v123-iso3`|Next.js / React / Cloudflare構成、写真メディアAPI|
|D|`C:/Users/user/Documents/Codex/2026-09-20/da-vinci-color-me-color-me/work/da-vinci`|Pと同系統の構成に加え、チャンクアップロード、写真参照、非同期生成の世代分離、テスト|

8月23日・27日のPicassoコピー、9月26日・28日および10月1日の別METISコピーも探索で確認した。Mの `server/metis/domain-store.ts` は同日 `fun-call-review-release` の同ファイルとSHA-256が一致した。同日 `files-pasted-by-the-user-fun/work/prod335-secure-sync-3` の同ファイルとはバイト列が異なるが、Gitによる本文差分はなかった。全コピー・全アーカイブの一致や更新順は未検証である。

## METISの16 Coreを保持する対応表

基本設計書v0.2第3節の16 Coreをすべて継承対象として残す。「原則を確認」「部品を確認」「未発見」を区別し、Core名の登録だけで実装完了としない。SUITE専用OSを作り直さず、既存METISの原則・検証済み部品に接続する。

|必須Core|既存根拠とSUITE側で保持する境界|
|---|---|
|MOBILE CORE|GのMOBILE INTEGRITYを確認。完全なモバイル実行基盤は未発見。Swift / SwiftUI側のAdaptive UI、Touch、Device Capability、Camera、File、USB、Tether、Offline、Sync、Background Task、Battery、Thermal、Permission、Privacy、Deep Link、App Lifecycle、Recovery、Cross-device Continuity、Accessibility、App Store Release Gateの20項目を保持。|
|DESIGN CORE|Gの専用レイアウト・情報階層・段階的開示。iPhone / iPad別構成へ適用し、Web UIを移植しない。|
|COLOR / VISUAL DIRECTION|GのColor / Light / Visual Perception。UIの視覚原則は確認。RAW色管理・PreviewとFinalの一致を実現する処理エンジンは別途検証。|
|EXPERIENCE / STAGING|Gの連続した体験・注意設計。撮影から書き出しまでの導線として保持。専用実行モジュールは未発見。|
|HUMAN FACTORS / USABILITY|GのHuman Factors、操作負荷・Accessibility。実機の片手操作、タッチ、Pencilの証拠が必要。|
|WORKFLOW / EFFICIENCY|GのREDUCE INTERACTION COST。CAMERA / PROJECT / EDIT / SELECT / SHARE / EXPORTの接続として保持。|
|WORK ORCHESTRATION|Mの状態・ゲートを使う遷移パターン。写真ジョブの依存管理・実行器は未確認。|
|ROUTE OPTIMIZATION|Gのgenre routingは制作判断の原則であり、写真処理のprovider / execution routing実装とは区別する。端末能力・熱・費用に応じた実行経路の境界を保持。|
|PARALLEL EXECUTION|同時書込み拒否のM部品とDの非同期結果隔離を参考にする。写真ジョブの永続queue、並列数・熱制御は未確認。|
|SESSION CONTINUITY|Gの文脈付き記憶とMの版付きイベント。Mのsessionは配信業務用であり、iOSライフサイクル復旧を実装済みとはしない。|
|OBSERVABILITY / SELF INSPECTION|Gの観測・独立レビュー、Mのgate assessment / evidence_ref。写真・秘密情報をログへ混ぜない観測境界を保持。|
|REQUIREMENT TRACEABILITY|Gの明示原則。v0.2各節・Mobile Release First・実装・テスト・未確認の対応を保持。完全な追跡実行モジュールは未発見。|
|GATE REGISTRY|M `GATE_REGISTRY` / `evaluateGate`。FUN CALL条件を登録内容として分離し、SUITEのクラウド安全・実機・App Store条件を登録可能にする。|
|ASSURANCE|MのUNKNOWN / expiredをBLOCKにする判定と `assurance_required`。未知を合格や代替仕様にしない。|
|RELEASE GOVERNOR|M `requireGate` と `releases.ts` の副作用前判定を参考にする。App Storeリリース制御の完成品は未発見。Web完成をモバイル公開条件へ戻さない。|
|TOKEN / COST ECONOMY|Dのusage・費用記録処理を確認。料金表の版、冪等計上、Credit残高確定を分離し、端末へ固定料金を埋め込まない。|

### 確認できたexported API

すべてTypeScriptバックエンド側の抽出・適応候補。Swiftから直接importできる部品ではなく、API契約を介して利用する。関数名だけを移して安全性を継承済みとしない。

|M配下のmodule|export|適応時の必須境界|
|---|---|---|
|`server/metis/gates.ts`|`evaluateGate`, `requireGate`, `GateInput`, `Check`, `GATE_REGISTRY`|固定の業務レジストリを分離。認証済み主体・対象版・有効期限付きの信頼できる証拠を入力。|
|`server/metis/domain-store.ts`|`persistGatedTransition`, `DomainCommand`|`fc_*`テーブル名・FUN CALLゲートへの結合を分離。呼出前の権限検証と、DB側の版・一意制約・原子batchを維持。|
|`server/metis/ledger.ts`|`validateEvent`, `appendLedgerEvent`, `LedgerDatabase`, `Prepared`|金銭 / ポイントの台帳であり写真履歴ではない。Credit台帳へ適応する場合も単位・二重計上防止・再送時本文照合を保持。|
|`server/metis/releases.ts`|`validatePricing`, `createGatedPointCheckout`, `authorizePayout`, `activateCreator`|後3者は決済・配信業務専用。副作用の直前に証拠を検証する構造のみ候補。Stripe Web CheckoutをApple IAPの代替にしない。|

## 再利用できる設計と切り出す境界

|候補|根拠|SUITEへの適用方法と制限|
|---|---|---|
|未知・失効した証拠を合格にしない純粋な判定|M `server/metis/gates.ts` の `evaluateGate` / `requireGate`|リリース証拠と対象版を照合する考え方を使う。既存のFUN CALL用ゲートID、成人確認、決済等の業務条件はSUITEの仕様ではなく、そのまま持ち込まない。|
|版付きの追記イベント、競合検知、原子的な書込み|M `server/metis/domain-store.ts` の `persistGatedTransition`、`ledger.ts` の `LedgerDatabase`、`db/schema.ts:30` / `:44`|編集保存・復元の設計参考。`event_id`、`expected_version`、連続版のDB制約、全体ロールバックを一組で扱う。DBアダプターが原子性を保証する必要があり、インターフェースだけで保証済みとはしない。決済台帳は写真履歴そのものではない。|
|重複・古い版・途中失敗の検証観点|M `tests/metis.test.mjs:74` / `:85` / `:143`|SUITE用の履歴・保存契約を検証するテストの設計参考。元テストは今回実行していない。|
|写真バイナリと編集・管理データの分離|D `db/schema.ts:22` / `:39`、`app/api/picasso/sync/route.ts:27`|写真ストレージ参照と版付き編集データをUI非依存の契約へ分離する。既存のJSON全体更新をSUITEの履歴保存として採用しない。|
|テナント付きのメディア参照|P / D `app/api/picasso/media/route.ts`、D `db/da-vinci-creative.ts:25`|所有範囲付き検索、オブジェクト参照、バイナリ配信の境界を参考にする。SUITEの検証済み主体・所属・写真権限に接続して初めて有効になる。|
|非同期応答の世代分離・開始時入力の固定|D `public/picasso-openai.js:356`、`tests/generation-isolation.test.mjs`|AI一括処理・プレビュー・書き出しの途中で選択写真や編集状態が変わった際、古い結果を新しい写真へ保存しない設計を参考にする。DOMやWeb画面は移植せず、ジョブIDと写真ID・入力版を持つサービス境界にする。|

## Picasso / da Vinciの10候補の監査結果

v0.2第63節に従い、存在する処理を先に調べた。以下は参照実装を残して再利用適合性を検証する対象であり、同機能を独立にゼロから再実装する根拠ではない。

|指定候補|D配下の実装・判断|
|---|---|
|Image generation gateway|`app/api/picasso/openai-art/route.ts` のPOSTに生成 / 編集API呼出し。入力、鍵供給、provider通信、結果解析の分離後に既存処理を再利用する候補。|
|Job queue|画像生成の永続queueは今回の調査では未確認。`colorme/catalogue-job/route.ts:176` にDBのRUNNING claimがあるが、EC商品用であり画像ジョブのlease・再開・二重生成防止を満たす根拠ではない。|
|Credit|同gatewayの `readCreditTracker` / `saveCreditTracker` / `recordGenerationCharge` / export `recordAuxiliaryCharge`。推計残高のJSON read-modify-writeであり、同時実行・冪等性を備えたSUITEの課金台帳として直接採用不可。|
|Provider routing|同gatewayのOpenAI通信と `gpu-relay/route.ts` の転送処理を確認。複数provider共通契約・切替時の二重課金制御は未確認。|
|Prompt management|`db/da-vinci-creative.ts` のexport `normalizeInput` / `finalPrompt`、gatewayの構造化出力解析。入力検証とprompt組立の分離を再利用候補とし、作品DNAや音楽調査をRAW編集へ混入させない。|
|Asset management|`media/route.ts`、`media/chunk/route.ts`、export `loadWork` / `mediaData`。テナント別参照の境界は候補、原本不変と確定手順は追加検証が必要。|
|Error handling|gatewayの `openAiError`、timeout / abort / empty-image検知、品質判定未完了を成功としない表現。共通失敗制御の抽出候補。キャンセル後のprovider実行・課金状態は別照合が必要。|
|Cost logging|gatewayのusage、requestId、費用根拠の応答を確認。ただし `recordGenerationCharge(...).catch(() => null)` があり、課金記録失敗を生成成功と独立に扱う。永続計上と再照合を追加検証。既存の料金定数を現行料金として採用しない。|
|Generation status|`public/picasso-openai.js` のepoch / AbortController、gatewayのHTTP結果。アプリ強制終了を越える耐久ジョブ状態は未確認。|
|API integration|export `resolveApiKey`, `recordAuxiliaryCharge`, HTTP `GET/POST/DELETE`、`api/da-vinci/route.ts` の既存gatewayへの委譲を確認。UI非依存serviceとprovider adapterへ切り出す候補。|

## そのまま移植できない箇所

- **認証**: D `db/picasso.ts:8` は認証メールヘッダーの存在を確認し、固定テナントを返す。元環境の認証プロキシを前提とする境界であり、SUITEの独立したモバイルAPIでヘッダーだけを信頼してはならない。検証済みのユーザー主体、所属、写真ごとの権限確認が必要。元環境の外部認証設定自体は未調査。
- **原本とクラッシュ復旧**: P / Dの写真APIは `tenant/works/work/kind.ext` の同じキーへ書き込む。DのチャンクAPIは全体20 MiB上限、メモリ内結合、オブジェクト保存後・DBメタデータ確定前のチャンク削除がある（`media/chunk/route.ts:6`、`:85`–`:92`）。RAW原本不変、整合性検証、再開可能アップロード、途中失敗の回収を満たすとは確認できない。SUITEでは原本と派生物の別ID、検証済み保存状態、確定・復旧手順を設計する。
- **競合と履歴**: D `sync/route.ts:160` は競合相手の期待版を条件にせず `sync_version` を増やしてJSONを上書きする。これはUndo / Redo、編集履歴、複数端末の競合解決を実装済みという根拠にはならない。
- **Web・別事業の依存**: Dの同期GETはカタログ同期を起動し、DBはCloudflareのbindingへ直接接続する。`db/da-vinci-creative.ts` はAPI routeの課金・APIキー処理を直接importする。Web UI、DOM、`vinext`、Cloudflare、EC同期、作品DNA、決済や配信サービスの業務モデルを共通写真編集層へ混入させない。採用する場合はそれぞれアダプターへ閉じ込める。
- **補助関数**: `safeJson` は解析失敗を既定値に置き換え、`cleanId` は入力を変換・切詰めする。編集データの破損検知や写真IDの衝突防止にそのまま使用しない。
- **スキーマと安全機能**: Mの楽観的競合制御は、イベントIDの一意性、対象＋版の一意性、前版への外部キー、連続版CHECK、全statementの原子確定に依存する。元スキーマを丸ごと採用すると決済・配信の無関係なドメインを持ち込み、逆に関数だけ移すとDB側の防御を失う。SUITEの写真 / Recipe / Asset / Jobに必要な不変条件を抽出し、認証・権限確認と共にアダプターの契約として維持する。

## 難所を先に固めるための設計上の提言

1. 認証済み主体・写真所有権を確認する境界と、未接続なら成功扱いしない認証アダプター。
2. 原本参照、編集レシピ、履歴、派生画像、プリセット、書き出しジョブをUIから独立させた版付き契約。参照する原本と入力版を固定する。
3. 期待版による競合検知、同一コマンドの再送照合、履歴と状態を同時確定する永続化境界。ローカル永続化と本番ストレージでの失敗・復旧検証は別々に残す。
4. iPhone / iPad双方から使える純粋な状態処理と、世代の異なる非同期結果を捨てる境界。Web画面の縮小・拡大によるUI転用は行わない。

これらは今回の骨組みを評価する提言であり、実装済み機能や新たな確定仕様の一覧ではない。実装状況はSUITE自身のコードと検証記録を参照する。

## 仕様の欠落と未確認事項

当初の基本設計書は途中で切れていたが、その後v0.2全文（84節）を受領した。原本は `C:/Users/user/.codex/attachments/72d1ca5b-078d-4fe0-9106-c66a51a3fda0/貼り付けたテキスト.txt`。本担当は再利用監査に関係する第3・53〜56・63・78〜80・83・84節等を確認し、全仕様の実装照合は親担当へ引き継ぐ。第83節の事前16項目報告を行う前に、大規模な実装・リファクタ・デプロイを開始しない。

v0.2を受領済みであることと、過去の全合意事項・本番適合性・公式SDKやライセンス条件を照合済みであることは区別する。未知の仕様を削除・省略・代替したり、最小機能だけで合格と判断したりしない。旧資産の業務要件をSUITEの確定仕様として読み替えない。第78節のCloud Safety GateはChecksum Verified / Object Exists / Metadata Exists / Permission Verifiedの4条件を保持し、クラウド確定前の原本自動削除を許可しない。

過去仕様との完全照合、選定コードの権利・依存関係の全点検、写真編集エンジンの存在・適合性、ネイティブでの性能、原本の完全性、実機QA、本番接続、App Store公開要件は未検証。今回参照したテストの存在は、SUITEでの合格証拠ではない。秘密値・`.env` は調査対象から除外し、外部システムへの操作もしていない。

Mobile Release Firstを適用し、Web版の完成・公開だけを後続化する。モバイル版、共通基盤、将来Web対応の確定済み仕様・安全設計・検証条件は保持する。

## 統合後の確認と追加要件

配置された `apps/backend/src/gates.ts` は元METISの出典を注記し、UNKNOWN / expiredをBLOCKにする判定をSUITE向けに適応している。Swiftの `METISMobileCore` は端末資源・Proxy・job checkpoint・gateの汎用境界を持つ。これらの読取り確認は、16 Coreすべての実行完成や本番移植完了を意味しない。既存Picasso / da Vinciの生成gateway、Credit、provider接続は引き続き再利用検証対象であり、今回接続済みではない。

`MOBILE_OVERRIDE.md` 全16節と `ADDITIONAL_SPEC.md` 全23節を追加で確認した。Session Look / Mode / Personal Color / 人物別の非破壊設定・追従は新たな確定要件として保持する。元資産の作品DNA・画像生成promptを、顔 / 肌 / 体型の写真別再解析やIdentity / 背景保護の実装済み機能へ読み替えない。既存gatewayを再利用する場合も、主要人物レタッチの端末内優先、外部送信必須禁止、Original不変、固定Final入力を維持する。

METIS Execution Optimizerの呼出し可能な実装は今回の探索範囲では未発見。名称のある設計原則や、新規に作った比較表を既存Optimizerの実行証拠とはしない。詳細な探索範囲、読取り監査、指摘と再確認状況は `FINAL_AUDIT.md` を参照。

`CLOUD_STORAGE_OVERRIDE.md` 全24節も追加確認した。原本のクラウド正本化、Proxy先行、必要時だけのRAW取得、7条件のCloud Safe、通信設定、分割再開、大容量QAを保持する。この追加によって、旧Picassoの20 MiBメモリ結合・確定前チャンク削除や、固定tenant前提の認証を移植可能とする判断には変わらない。今回配置されたSUITEのローカル分割upload、Swiftの通信 / 品質 / 同期優先度policyは新たな骨組みであり、旧資産で検証済みの本番クラウド機能を移植し終えた成果ではない。
