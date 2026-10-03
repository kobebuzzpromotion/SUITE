# SUITE 最終統合スナップショット — 2026-10-03

## 最新統合結果 — Web編集接続とSites状態（UTC 11:05）

選択されたSites URL `https://eclat-genseki-demo.bals-enter.chatgpt.site/` は表示名SUITE・オーナー限定へ変更済み。ただしlive version33の旧本文は未置換で、SUITE招待試用を配備済みとは判定しない。Sites公式source checkoutの非空stdinがホスト側で拒否され、source/一致archiveを保存・配備できない。古いversionと他Siteは保持。[独立状態Evidence](evidence/web-2026-10-03/SITES_VERIFICATION_1104.json)。

最新ソースの実測: Web build PASS、Sites Worker build PASS（未配備）、Web 221 PASS/0 FAIL/0 SKIP、外部作者adapter18 PASS、Windows154 PASS/0 FAIL/0 SKIP、147節/固定6文書の検査PASS、文書整合10/10 PASS。[Web全Test/log/Source Hash](evidence/web-2026-10-03/editing-sites-01/RUN_METADATA.json)、[Windows全Test/log/Source Hash](evidence/web-2026-10-03/editing-windows-01/RUN_METADATA.json)。Commit SHAは未作成のためNOT_AVAILABLE。両Runは旧152/154凍結Evidenceとは別ディレクトリで保持した。

今回Webで実接続した32操作は後段Highlight/Shadow/White/Black/Vibrance、HSL 8色×3軸、Clarity/Texture/Sharpness。UI→Recipe v1 namespaced拡張→保存/再読込/Undo/Redo→単一renderer→固定Finalの人工画素/状態テストまで。色温度Kelvin/RAW段階WB/本来のHighlight復元ではない。White Balance/Tint/Temperature、Tone Curve、Noise Reduction、Lens Correction、カラーグレーディング、部分Mask等は未実装。新拡張をApple Nativeが処理できることは未検証ではなく**未対応**。実RAW0件、実画像Proxy/Final、iPhone/iPad、Native112、Sites D1/R2/ChatGPT実接続はNOT_RUN。Web招待試用、Face Brightness視覚検証、Feature Parity、Mobile ReleaseはBLOCK。詳しくは [編集差分](EDITING_GAP_MATRIX.md) と [最新引継ぎ](HANDOFF.md)。

## 最新追補 — 指定Siteへの引継ぎと編集不足（UTC 10:47、未完了）

ユーザー指定の既存Site `https://eclat-genseki-demo.bals-enter.chatgpt.site/` は、明示的な旧内容破棄許可に基づき表示名をSUITEへ変更し、公開範囲をオーナー限定へ縮小した。version33/旧本文はまだ維持、SUITE試用アプリへの置換は未実行。公式Source checkoutへの非空stdinが環境ポリシーで拒否されるため、matching source/archiveの新version公開はBLOCK。旧Siteを新アプリとして誤報告しない。[新規独立Evidence](evidence/web-2026-10-03/SITES_HANDOFF_CURRENT.json)。

SUITE_SPEC既定18調整のうち旧Webで実画素接続は5、未接続13。色4tone/Vibrance/8色HSLと明瞭度/テクスチャ/シャープの純粋処理は独立追加中だが、この追補時点ではUI・Recipe・Worker・Finalの共通接続前。人工画素の部分試験を実RAW合格へ昇格しない。8bit sRGB変換後の調整はRAW段階WB/失われたハイライト復元ではない。[Gap一覧](EDITING_GAP_MATRIX.md)と[事前変更通知](CHANGE_NOTICE.md)を参照。前節の154/Web152はその凍結ソースでの履歴であり、最新差分の全回帰結果ではない。

## 最新正本 — Web招待試用統合・期限管理（JST 17:47再回帰）

詳細正本 [WEB_TRIAL_INTEGRATION.md](WEB_TRIAL_INTEGRATION.md)。Windows154維持、Web152/作者adapter18/ブラウザ人工Worker21各0FAIL、文書10PASS。期限/取消をserverのlive認可へ接続、原本/Recipe/提出版保持、UI期限更新/取消/終了案内を確認。PC/iPad相当幅画像は `evidence/web-2026-10-03/ui-04/`（実機ではない）。最新SourceHash/build/全Test ID/logは `trial-final-01/`、旧Windowsは `windows-02/` に新規保存。

外部招待試用はまだBLOCK。専用新Site creation429、既存11件変更なし、実RAW未提供0件、actualChatGPT/D1/R2/外部URL未接続。顔解析は停止、Native112/実RAW/実画像/iPhone/iPad NOT_RUN、Apple Face Brightness=IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED、Feature Parity/Mobile Release BLOCK。一般公開/有料契約/メールなし。既存147/固定6/Recipe v1外形/旧DB/既存API維持、trial専用schema追加を区別する。

## 過去正本 — 共通人物整合Gate・最終回帰（JST 11:43実測）

**Windows TOTAL154 / PASS154 / FAIL0 / SKIP0。旧124維持＋人物13＋安全3＋共通Gate14。文書10/10 PASS、前回変更一覧漏れFAILは再検査で解消。Native112 NOT_RUN（旧82＋追加30）。** 完全な内訳/12経路＋2検査の各Test ID/変更ファイル/拒否Evidence/互換性/Recovery境界/最短手順は [FACE_BRIGHTNESS_INTEGRATION.md](FACE_BRIGHTNESS_INTEGRATION.md) に固定した。以下の124/82等の本文は過去統合の履歴であり、最新差分の状態とみなさない。

- [最新全件Evidence](evidence/face-brightness-2026-10-03/windows-03/regression.json)、[時刻・OS・Commit無理由・Build・source hash](evidence/face-brightness-2026-10-03/windows-03/RUN_METADATA.json)、[文書10/10](evidence/face-brightness-2026-10-03/windows-03/document-integrity.json)、[拒否12例](evidence/face-brightness-2026-10-03/windows-03/PERSON_INTEGRITY_DENIALS.json)。新規凍結で旧結果を上書きしない。
- Build `uncommitted-source-sha256:6ae183017e27a424ad0d44e2b864c7ebd8e873c0279dc203f6ae405fe807d6d3`、Commit SHA=`NOT_AVAILABLE`、Reason=`repository has no commit`。旧78/78証拠は不変、現sourceは65/78一致＋承認変更13＋追加12＝90対象。差分を隠して現78/78一致としない。
- 人物UUID→geometryをFace Brightness専用ではなく全人物補正の共通Gateとして [正式化](PERSON_INTEGRITY_GATE.md)。TS共通data guardは実測済み、Swift/Apple source接続は未実行。Recipe v1外形、新API追加なし、既存router/auth source不変、147節/固定6文書/6領域契約保持は [別整合Evidence](evidence/face-brightness-2026-10-03/windows-03/PERSON_INTEGRATION_CHECK.json)。DB schema変更なしはnoDDL追加のsourceレビュー/current snapshotの範囲で、旧DDL byte比較はNOT_AVAILABLE。Native互換性はNOT_RUN。
- portrait付きExportは保存checkpointのexact revision/parameters/Original path・Asset/SHA/person geometryを再照合し、不一致/古い/曖昧な人物へ適用しない。Native試験NAT-111/112はNOT_RUN。実Finalや視覚一致をWindows PASSへ含めない。
- Face Brightness=`IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED`。Skin/Eyes/Contacts/Face Shape/Makeup/Hair/Body/写真間追従/人物Batchは個別NOT_IMPLEMENTED。共通関数や1 controlを人物補正全体完成にしない。
- 実RAW100/500/1000、Proxy/Final実画像、複数人物/背景非変化、iPhone/iPad実機はNOT_RUN。原本Recoveryは保持設計/自動削除禁止だけIMPLEMENTED、検出/照合/再登録/UI/Recipe関連付け/再評価はNOT_IMPLEMENTED。
- Evoto workflow458/458を元RegistryのFeature IDへ [独立Supplement](evidence/face-brightness-2026-10-03/windows-03/WORKFLOW_PARITY_SUPPLEMENT.json)で接続。元資料不変、Feature複製0、実Workflow検証0。Credit163の現Plan/地域/account適用UNKNOWN、重大公式矛盾/Platform未確定を保持し、監査・実装・Parityの完了を混同しない。
- **Feature Parity BLOCK / Mobile Release BLOCK**。Windows＋Native＋実RAW＋実画像＋iPhone＋iPadの必須実測と既存本番Gateを満たすまで解除しない。本番Auth/Cloud/Sync/Billing・Pricing未接続/BLOCK、標準50GB事業Baseline維持。Web完成はMobile Release Gateに含めない。
- 次工程は [Native/実画像QA手順](FACE_BRIGHTNESS_NATIVE_QA.md) のMac Core→iOS build/unit→実人物Proxy/Final→実RAWセット→iPhone→iPad。新Windows機能・新provider・課金方式・契約再設計へ広げない。

## 過去正本スナップショット（124件統合時の履歴）

**Windows回帰124 PASS / 0 FAIL / 0 SKIP。Native82件NOT_RUN。Mobile Release BLOCK。**
これは今回の追加基盤・回帰・文書統合の結果であり、SUITE全機能やiPhone/iPadの完成報告ではない。Evoto v2/v3のZero-Miss監査も未完。旧成功結果から最新差分を合格扱いせず、親担当が現ソースで再実行した。

## 正本・追加範囲

- 旧147節はID/原文/manifestを維持。[最新147対応表](INTEGRATED_TRACEABILITY.md)、[全試験名](INTEGRATED_TEST_CATALOG.md)、[機械Evidence](evidence/integrated-2026-10-03/regression.json)で要件→実装先→テストID→結果を追跡する。関連テスト成功は要件全文の完成を意味しない。
- 固定6文書のSHA-256一致を再確認。CONTRACTS、PHOTO_ARCHITECTURE、SUITE_SPEC、MOBILE_OVERRIDE、ADDITIONAL_SPEC、CLOUD_STORAGE_OVERRIDEは変更なし。旧6領域保存同期契約を置換していない。
- 明示承認された追加はCrop16節、Workspace45節。既存Recipe v1の拡張枠、追加Workspace metadata/HTTPで実装し旧保存APIを撤去しない。変更理由/影響は各統合台帳に先行記載。
- Evoto v2/v3は監査指示、価格28節は事業上の有力案として別保存。差分からAI機能を勝手に正式仕様へ昇格しない。再添付価格原文は前回SHAと同一で重複正本を作らなかった。
- [追加原文保存証拠](ADDITIONAL_SOURCE_PRESERVATION.json)、[Crop16](CROP_REQUIREMENTS.json)、[Workspace45](WORKSPACE_REQUIREMENTS.json)、[価格28](PRICING_REQUIREMENTS.json)。原文を要約で置き換えていない。
- **MOBILE RELEASE > WEB RELEASE。Web完成はMobile Release Gateに含めない。** 新provider採用・本番契約・課金・外部公開・Web UI実装は行っていない。

## 変更・統合結果

[変更ファイル一覧](INTEGRATED_CHANGES.json)。34件baselineとのsource比較は変更15／追加26（この回帰snapshotの範囲）。監査スクリプトと文書を含む最終一覧は同manifestへ追記する。Gitは未コミット・remoteなしなので、Git commit間diffという意味ではない。既存METIS/Picasso/da Vinci資産は改変していない。

### 実装済み・Windows限定で検証済み

1. Workspace live membership、Owner/Admin/Editor/Viewer権限、他Workspaceの直接Assetアクセス拒否、削除member・Viewerの権限外操作拒否、verified email招待、最後のOwner保護。
2. Shared Project/Recipe、CAS、2人/3人の実Worker同時編集、競合branch/Version/editor/diff保持。Last Write Winsで旧内容を捨てない。Shared PresetのCAS/固定値適用/削除後の過去Recipe再現。
3. 同Workspace内・同ProjectのOriginal再利用、quota予約・集計、2TB→1TBで新規容量制限し原本非削除、独立Entitlement、Soft Delete/Recovery、監査追記。RAWはObject Storage、DBはmetadataの分離。
4. 署名JWTを使うloopback HTTP統合15件。旧managed-tenant経路の迂回拒否、期限付きgateway grant、転送中revoke/期限失効、破損Original検知とCloud Safe失効、失敗時の部分traffic記録。
5. Crop12比率・印刷37寸法のcatalog、mm/dpi→pixel、回転/Crop/不足解像度拒否、JPEG/TIFF/PNG設定、既存Recipe保存/SQLite再open/CAS。ここでのPASSは値・保存・数学でありApple実画像出力ではない。
6. 入力設定型の価格試算。価格・容量・料率を製品コードへ固定しない。未知原価はnullのままBLOCK、USER=1、利益正/目標を別判定。これはBilling実装ではない。

詳細: [Workspace backendとRole表](WORKSPACE_BACKEND.md)、[Workspace統合](WORKSPACE_INTEGRATION.md)、[Storage16軸と台帳](STORAGE_PROVIDER_COMPARISON.md)、[Crop実装](CROP_IMPLEMENTATION.md)、[価格レビュー](PRICING_REVIEW.md)。

### コードあり・未検証（機能合格ではない）

Swift Core/SwiftUI、iPhone/iPadのCrop/Export UI、固定Recipe ExportPlan→一時ファイル→検査→新規Final、JPEG/TIFF8/16/PNG・ICC/Alpha/DPI/metadata・複数書出し、Mac QA adapter、Workspace DTO/HTTPS client/端末別layout。Native82テストはすべてNOT_RUN。コンパイルも未確認なので「完成済み」としない。

Workspace入口は `WorkspaceBrowser(client: nil)`。未接続表示を出し、架空Workspaceや擬似認証成功を表示しない。iPhoneは下部操作、iPadは3領域の専用layout候補だが、実機操作の合格証拠はない。

### 未実装・未接続（環境不足だけではない）

- 本番OIDC/セッション/Keychain/認証UI、実Cloud/DB/Backup provider、招待メール配送、Cloud Proxy/Preview転送とcross-device復元、Workspace Asset→Editor→Shared Recipe競合解決→Original要求→Finalの全導線。
- 耐久offline outbox/差分queue、iOS background URLSession/Multipart、LRU実行とpinの原子的再確認、保存失敗draftの耐久化、orphan Original/途中成果物の起動reconcile、破損checkpoint隔離。
- 人物描画エンジン、顔/体/pose/mask、Contacts/Personal Color等の処理、Session Look完全UI/queue、camera/tether、各商用V1機能。intent/enumは処理済みpixelではない。
- Gallery/Community公開、細粒度permission設定、同一Originalを別Projectへ安全に共有する導線、完全な組織解約/data retrieval運用。
- 商品Catalog配信、購入検証、50GB自動付与、StoreKit/IAP Credit/更新/返金/復元、Cost dashboard。契約/価格/Apple課金方式未確定。
- 原本取得失敗時にProxyからFinalを作る代替は導入していない。未対応処理は拒否する。

## Astraレビュー・修正

[4指摘と対応](ASTRA_REVIEW.md)。転送途中の権限/期限失効、失敗traffic漏れ、Trash跨DB障害後retry、過大chunk計上を修正。WH10〜15を追加し親の全回帰でPASS、Astra再レビューで追加の具体的阻害指摘なし。

複数DBがatomicになったという主張ではない。tombstone→ledger障害後、全DB/HTTP再openと同要求retryで分類が収束することを確認。定期自動reconcilerやkill時のtraffic完全回収は未実装。gatewayで受理したbytesは端末TCP受領や実Cloud請求量ではない。

## 全テストとEvidence

親コマンド: `node scripts/final-regression.mjs --report docs/evidence/integrated-2026-10-03/regression.json`。
内部の実コマンド/exit/stdout/stderrは同JSONのcommands。TAP実件数とsource catalog件数が一致することも検査する。

監査成果統合後に親がさらに `npm run check` を再実行し、124/0/0を再確認。[最終コマンド記録](evidence/integrated-2026-10-03/final-commands.json)に追加原文/Apple/Evoto静的検査と併記。最後の文書hash/対応検査は[integrity.json](evidence/integrated-2026-10-03/integrity.json)。旧原文/コードの成功記録を最新差分の代わりにはしていない。

| 実行スイート | PASS | FAIL | SKIP |
| --- | ---: | ---: | ---: |
| 旧backend基盤 | 16 | 0 | 0 |
| 旧RAW harness機構（実RAWではない） | 18 | 0 | 0 |
| Crop数値/catalog/Recipe | 31 | 0 | 0 |
| Crop永続化/中断/CAS統合 | 5 | 0 | 0 |
| Workspace gateway grant | 2 | 0 | 0 |
| Workspace実HTTP | 15 | 0 | 0 |
| Workspace SQLite/共同編集 | 16 | 0 | 0 |
| Storage quota/使用量 | 12 | 0 | 0 |
| 価格計算の安全性 | 9 | 0 | 0 |
| **Windows合計** | **124** | **0** | **0** |

旧34は同一IDで全件今回PASS。NativeはCore71＋Apple11＝82件NOT_RUN（SKIP0に隠さない）。Apple提出文書7チェック、文書/Evidence整合10チェック、Evoto構造検査は別枠であり124へ加算しない。

追加原文/trace検査: `node scripts/check-additional-spec.mjs`。旧147/固定本文: `node scripts/check-spec.mjs`。提出草案: `node docs/APPLE_SUBMISSION/validate.mjs`。文書整合: `node scripts/check-readiness-evidence.mjs`。Evoto監査用コマンドはそのREADME。候補価格: `node scripts/pricing-model.mjs docs/PRICING_SCENARIO.json` → exit2、NOT_EVALUATED/BLOCK（原価不明という期待結果）。

### 独立した安全回帰

| 対象 | 今回結果と実証範囲 |
| --- | --- |
| RAW原本不変 | PASS: 実storage任意bytesの前後checksum・上書き拒否。実RAW現像の合格ではない |
| Multipart | PASS WIN-003/004: 再open・応答消失再送・破損partだけ新key再取得。旧破損partを上書き/削除せず保持、正常part不変、最終checksum一致 |
| Proxy / Recipe / Export / Cloud Safe | PASS: Proxy優先/Original必要目的/Original失敗待機、Recipe再読込・固定入力の境界、unsafe eviction拒否、7条件・破損時失効。Apple描画は別NOT_RUN |
| 保存競合 | PASS: 旧CAS、Crop CAS、2/3worker共同Recipe branch保持、Preset/Selection stale拒否 |
| 容量不足 | PASS WIN-005: ENOSPC障害注入＋checkpoint維持。実デバイス/実Storage満杯はNOT_RUN |
| 強制終了・SQLite復元 | PASS WIN-006とCrop integration: 実child killで未commit rollback/committed Recipe保持。iOSのkill/lock/OS回収はNOT_RUN |
| quota / downgrade | PASS: 1.6TB論理使用→2TBから1TB、原本bytes不変、Upload制限、Upgrade再開。実1.6TB投入ではない |
| Trash跨DB復旧 | PASS WH13/14: ledger故障注入後再open→retry、総容量/checksum不変、個別Trash保持 |
| 転送中失効・破損 | PASS WH10〜15: 残bytes拒否、部分量、expiry、過大chunk、Cloud Safe失効 |

途中経過の失敗は抹消しない。各担当記録には、未接続method/signatureによるTS build FAIL、storage試験の不正slash keyによる11PASS/1FAIL（fixture修正）、新HTTP試験のBuffer型/closure `this`コンパイルエラー（修正済み）がある。これらは最終124/0/0と区別する。親の初回巨大stdout取得は表示上限で解析できなかったため、新規Evidenceファイル直接出力で再実行した。古いEvidenceを上書きして成功へ置換していない。

## 実RAW・Mac・実機 NOT_RUN

実RAWの場所はcheckout外 `C:/Users/user/Documents/Codex/2026-10-03/SUITE_TEST_DATA/RAW/{100,500,1000}`。今回も未配置。ダミーRAW・JPEG代用・水増しは作成していない。

| 件数 | Manifest | Import→Proxy | 同期 | Recipe保存 | 再起動復元 | Cloud Safe | Final Export |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 500 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |
| 1000 | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN | NOT_RUN |

manifest/pipeline各3記録はJSONのrawResults。各stageに理由を保存。CLIの未配置検出exit2は負荷試験成功ではない。

| Gate | 必要環境・阻害理由 | 次の確認 / 合格条件 |
| --- | --- | --- |
| mac-build-tests | Mac/Swift6/Xcode/SDK未接続 | NEXT_RUN手順でCore71＋Apple11をbuild/test、0error、実画像format/color/alpha/pixelを検証 |
| real-raw-load-100/500/1000 | 実RAW未配置、Apple adapter未実行 | 外部各セットManifest→各計測。原本checksum保持、各stage測定値、failure/retryを記録 |
| full-lifecycle-sync-recovery | 実Cloud同期adapter未接続という実装残 | 同期・Recipe保存・実プロセス再起動・Cloud Safeの追加4stageを実測。local adapterのmetadata再openで代替しない |
| iphone-device | iPhone/署名build/実認証・Cloud・RAWなし | RAW→Proxy→編集→Recipe→kill/relaunch→Cloud Safe→Final、片手/回線断/lock/低容量/失効を完走 |
| ipad-device | iPad/署名build等なし | 同上、縦横/分割表示/常時panel/Pencil/タッチ不能なしを別記録 |
| production-backend / commercial-v1 / app-store | 本番未接続・機能/運用・提出情報未達 | 各既存Gateの有効な実測と責任者承認。Web完成は条件にしない |

Macは検証環境であって初期製品対象ではない。モデル/OSを推測固定しない。全34必須Gateは現buildの十分な実測がなくBLOCK。Windowsの部分PASSをそれらへ転用しない。

## 競合監査・Apple・価格の状態

- [Evoto v2/v3詳細監査](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md): 公式240記事/62カテゴリ/2,167見出しを索引化。120機能グループ、操作・option計1,086行（文書確認1,052／未確認34）、SUITE価値候補14を分離。記事件数＝機能件数ではない。**Zero-Miss BLOCK**: 未mapped記事187、OPEN見出し1,873、OPEN要求チェック724、全機能数未確定。12か月release/App Store/現行価格の照合も未完。全体監査済み記事数は0（部分照合53）であり全240監査完了としない。[次分担リスト](EVOTO_AUDIT/NEXT_REVIEW_QUEUE.md)。Desktopのcredit-freeをMobile/iPadへ拡張しない。Contacts Amount/色は公式一般記事で確認できたが、その記事にplatform明記がなく全platform未確認のまま。競合機能をSUITEへ自動採用しない。
- [Apple Submission Pack](APPLE_SUBMISSION/README.md): 11必須分野、43入力項目、公式21出典、草案7静的チェックPASS。正式URL/Privacy回答/年齢/暗号化/IAP/権利/署名/実スクショ/アイコン/審査アカウント等未確定。登録/アップロード/提出は未実行。
- [価格Baseline](PRICING_BASELINE_2026-10-03.md): 全28節保存。有力案Mobile1,980円税込＋標準50GB＋通常Export原則枚数課金なし、Workspace1,980円/3席/追加約500円、生成Credit別。価格・料率・容量の実販売設定は未決定。26%/税10%は打合せ試算仮定。未取得コストは0にせずPricing Gate BLOCK。

## 最短の引継ぎ

1. [HANDOFF](HANDOFF.md)の最新節とこの報告、[変更一覧](INTEGRATED_CHANGES.json)、[全テスト](INTEGRATED_TEST_CATALOG.md)、[Astraレビュー](ASTRA_REVIEW.md)を読む。古い34件の説明は歴史記録。
2. Windowsで `npm run check`、`node scripts/check-additional-spec.mjs`、`node scripts/check-readiness-evidence.mjs`。再Evidenceは新規名を渡し、既存JSONを上書きしない。
3. 環境と独立に残る認証注入・Cloud Proxy/同期・耐久queue・Workspace編集接続・同RAW別Project・Evoto未照合を固定担当で進める。契約変更は理由/影響を先に報告。
4. Macでは `swift test --package-path packages/METISMobileCore` → `swift test --package-path packages/SuiteCore` → `swift build --package-path apps/apple -c release` → XcodeGen/test。実機IDは観測値を使う。[NEXT_RUN](NEXT_RUN.md)にコピー可能なコマンド、[MOBILE_DEVICE_QA](MOBILE_DEVICE_QA.md)に操作と合格条件。
5. 外部実RAWを投入し100/500/1000を別々に計測。iPhone/iPadの実機Gateを別々に実行。合格Evidenceが揃うまでRelease BLOCK。

変更禁止: 原本上書き/自動30・90日削除、未同期RAW・Recipe・同期台帳の削除、全RAW全端末同期、Proxy低解像度Final、未確認Cloud Safe、quota/downgrade原本削除、LWWのみの競合処理、Preset削除による履歴喪失、固定6文書の無断変更、ダミー成功、本番provider/料金/Apple課金方式の独断確定、Web先行。
