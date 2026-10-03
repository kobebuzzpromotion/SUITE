# 共通人物整合Gate・Face Brightness 最終統合 — 2026-10-03

Windows実測 **TOTAL 154 / PASS 154 / FAIL 0 / SKIP 0**。旧124件を全件維持。文書検査10/10 PASS。Native112件は全件NOT_RUN。Face Brightnessは **IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED**、共通人物Gate・Feature Parity・Mobile ReleaseはBLOCK。次工程は新しいWindows機能ではなくNative／実画像／実RAW／iPhone／iPad検証を優先する。

## 1. 正本Build・実行・凍結

- 実行開始 `2026-10-03T02:43:36.489Z`、終了 `2026-10-03T02:43:42.702Z`（JST 11:43:36〜11:43:42）。Windows_NT 10.0.26200/x64、Node v24.19.0。個別Testの時刻は実測run windowであり、存在しない精密個別時刻を捏造しない。
- Build ID `uncommitted-source-sha256:6ae183017e27a424ad0d44e2b864c7ebd8e873c0279dc203f6ae405fe807d6d3`。Commit SHA=`NOT_AVAILABLE`、Reason=`repository has no commit`。後日Commitができても、この識別子を置換しない。
- [全Test・結果・source SHA・147要件](evidence/face-brightness-2026-10-03/windows-03/regression.json)、[時刻・環境・Build・各Evidence](evidence/face-brightness-2026-10-03/windows-03/RUN_METADATA.json)、[実行ログ](evidence/face-brightness-2026-10-03/windows-03/execution.log)、[文書検査](evidence/face-brightness-2026-10-03/windows-03/document-integrity.json)。すべて新規Evidenceで、既存runは上書きしない。
- [共通Gate/Evidence整合12チェック](evidence/face-brightness-2026-10-03/windows-03/PERSON_INTEGRATION_CHECK.json)は12 PASS、[拒否診断](evidence/face-brightness-2026-10-03/windows-03/PERSON_INTEGRITY_DENIALS.json)は12例。これらや文書10件をWindows154件へ加算しない。
- [凍結manifest](evidence/face-brightness-2026-10-03/windows-03/FROZEN_RUN_MANIFEST.json)で今回の結果・ログ・Source Hash参照を固定する。凍結後の訂正/再実行は新runへ追加する。
- [最終文書再検査](evidence/face-brightness-2026-10-03/windows-03/POST_INTEGRATION_DOCUMENT_CHECK.json)にも10/10 PASSを保存し、変更ファイル一覧と現在sourceの対応を最終文書更新後に再確認する。[Native112件の個別NOT_RUN台帳](evidence/face-brightness-2026-10-03/windows-03/NATIVE_NOT_RUN_CATALOG.json)には必要環境・理由・次コマンド・合格条件を保持する。これは実行計画でありNative成功ではない。
- 過去の文書FAILは [windows-01](evidence/face-brightness-2026-10-03/windows-01/document-integrity.json) に保持。`apps/apple/Package.swift`の変更一覧漏れを是正し、windows-02と最新windows-03で10/10 PASSを実測した。失敗を削除・成功へ書換えていない。

## 2. 全件の内訳

| 対象 | TOTAL | PASS | FAIL | SKIP | NOT_RUN |
| --- | ---: | ---: | ---: | ---: | ---: |
| 旧Windows回帰（旧34件を含む） | 124 | 124 | 0 | 0 | 0 |
| 元人物整合 WIN-125〜137 | 13 | 13 | 0 | 0 | 0 |
| 安全補強 WIN-138〜140 | 3 | 3 | 0 | 0 | 0 |
| 共通人物Gate WIN-141〜154 | 14 | 14 | 0 | 0 | 0 |
| **Windows実行合計** | **154** | **154** | **0** | **0** | **0** |
| 既存Native | 82 | 0 | 0 | 0 | 82 |
| 今回Native追加（Core14＋Apple16） | 30 | 0 | 0 | 0 | 30 |
| Native合計 | 112 | 0 | 0 | 0 | 112 |

Test catalogの登録数は266（Windows154＋Native112）。ユーザー指定のTOTAL154はWindows実行件数であり、NativeをSKIP0の中へ隠さない。実RAWセット、実画像/実機Gate、文書/診断は別枠。Native112件のID/理由は同catalogに個別記録し、環境待ちをFAILやPASSへ変換しない。

## 3. 人物UUID→顔座標Gateの正式化と適用範囲

[PERSON_INTEGRITY_GATE.md](PERSON_INTEGRITY_GATE.md) / [12経路の機械対応](PERSON_INTEGRITY_PATHS.json)を正式な共通人物整合Gateとする。TS `person-geometry.ts` とSwift `PersonGeometryIntegrity.swift`は制御非依存の完全inventory/binding/continuity検証。asset UUID＋Original SHA-256＋写真内person UUID＋正規化geometryを拘束し、既存Portrait validatorへ接続した。Face Brightness専用のハードコードGateへ戻さない。

Save/Reload/Restart/Conflict/解決/Undo/Redo/hidden history/Asset切替/人物再選択/Recipe複製/Exportに同じ不変条件を要求する。将来Skin、Eyes、Contacts、Face Shape、Makeup、Hair、Body、Person-based Batchも必須。これらのadapter/補正機能は未実装で、共通関数だけを機能完成としない。写真間人物追従もNOT_IMPLEMENTED。人物UUIDは写真内識別であり、顔順番やindex、生体認証、写真間同一人物を意味しない。

### 共通Gate14件の各Test ID

以下は全件Windowsデータ境界PASS。Native UIの実Undo/Redo、実検出/Mask/Export、実アプリ終了は全てNOT_RUN。

| Test ID | 操作ID / 経路 | 実際に実行した範囲 |
| --- | --- | --- |
| WIN-141 | PGI-INVENTORY | 共通inventoryのUUID重複・不正geometry・bbox重複拒否 |
| WIN-142 | PGI-GEOMETRY-ID | 診断geometry hash、順序変更保持、部分inventory/座標入替え拒否 |
| WIN-143 | PGI-SAVE / PGI01 | Workspace保存時UUID付替え拒否、head/version保持 |
| WIN-144 | PGI-RELOAD / PGI02 | 同connection再読込でUUID/geometry/個別値保持 |
| WIN-145 | PGI-RESTART / PGI03 | SQLite新connectionで復元。iOS再起動ではない |
| WIN-146 | PGI-CONFLICT-VERSION / PGI04 | stale CAS合法branch保持、不正人物branch拒否 |
| WIN-147 | PGI-CONFLICT-RESOLUTION / PGI05 | 明示branchのCAS解決、geometry付替え拒否 |
| WIN-148 | PGI-UNDO / PGI06 | 以前の値snapshot保存、同一inventory保持。Swift Undo未実行 |
| WIN-149 | PGI-REDO / PGI07 | 後の値snapshot保存/再open。Swift Redo未実行 |
| WIN-150 | PGI-HIDDEN-HISTORY / PGI08 | 非head破損branchを全read/saveで拒否し元行/全versionを保持 |
| WIN-151 | PGI-ASSET-SWITCH / PGI09 | 別Assetの取得/検証の分離。Native画面切替未実行 |
| WIN-152 | PGI-RECIPE-COPY / PGI11 | 同SHAでも別Assetへの人物Recipe複製拒否 |
| WIN-153 | PGI-PERSON-RESELECT / PGI10 | 順序でなくUUIDを明示lookup。不正UUID拒否。実UI未実行 |
| WIN-154 | PGI-EXPORT-RECIPE / PGI12 | 固定Export候補データのAsset/SHA拒否。Final生成未実行 |

共通Gateは「12必須操作経路＋独立inventory/identifier2件＝14テスト」。14のNative操作経路が完走したとは記載しない。各path→実装symbols→Windows Test→Native候補Test→EvidenceはJSON/整合Evidenceで逆引き可能。

## 4. 保存・再読込・履歴・拒否Evidence

Recipe外形は `schemaVersion:1` / `parameters` を維持。既存 `extendedParameters.portrait` にtyped値を保存する。person_idは各targetのUUID文字列、asset_idはportrait.assetID、原本識別はasset.id/originalRelativePath＋originalSHA256。`adjustmentType=face_brightness`、CUSTOM EV有限値[-4,4]、portrait schema/engine、createdAt/updatedAtのUTC ISO時刻を検証する。外側revision/versionとschemaVersionは分離する。

全保存/全version再読込と全historyにasset/SHA/UUID→geometry継続検証を入れ、currentが正常でもhiddenが壊れていれば拒否する。同一UUIDを別顔座標へ移す、UUID再採番、他AssetやSHA流用、部分inventory、重複bbox、不正値/未知controlを黙って修復しない。拒否時に元Recipe/原本/過去Versionを保持する。Last Write Wins、人物へのfallback、正常履歴の削除で成功に見せる変更はない。

[拒否12例](evidence/face-brightness-2026-10-03/windows-03/PERSON_INTEGRITY_DENIALS.json)にはasset_id、person_id、固定recipe_version、expected/actual geometry identifier、raw_checksum、実際のreason、timestamp、test_idの9欄と前後SHA/保持結果を記録した。UUID置換・座標入替え・別Asset・別SHA・不正ID/type/value/schema・部分inventory、SQLite再open後のUUID/geometry/SHA破損を実拒否。geometry identifierは矩形の診断hashで、本人認証やmask checksumではない。用いた原本bytesは明記したNON_IMAGE `.bin`で、実RAW checksumの実証ではない。

Native全経路の9欄collector、mask診断、実検出人物の拒否Evidenceは未接続/NOT_RUN。Windows診断12例をNative全拒否対応済みとしない。

## 5. Export人物再照合・安全補強・未検証

portrait付きFinal候補のsourceは、保存Recipe→固定ExportPlan→asset/SHA検証→ProjectStoreの保存checkpoint再読込→exact revision/current parameters/解決Original path照合→保存person UUID/geometry inventory照合→Originalをfresh Vision解析し一意対応/新person mask確認→一回補正→一時出力→検査→Original SHA再確認→新Final確定、へ接続した。不一致時は最新Recipe・先頭人物・最も近い人物へ置換せず拒否する。旧Planの保存revisionが更新済みなら現在は拒否し、耐久historical job snapshotのretryは未実装。

| 確認 | 結果 |
| --- | --- |
| Windows固定入力のAsset/SHA境界 | WIN-154 PASS（データのみ） |
| serialized ExportPlan外側Asset/SHAの改ざん | NAT-112 NOT_RUN、試験source追加済み |
| 保存人物UUIDの領域を入替えた自己記述固定Planの拒否 | NAT-111 NOT_RUN、実ProjectStore/非画像bytesでmetadata境界試験sourceあり |
| 旧selection・参照写真の無効化 | source修正、NAT-107〜110 NOT_RUN。未知対象/fresh再検証FAILではNO APPLY |
| 部分対象・bbox重複 | WIN-138/139 PASS、実検出NAT-085/086 NOT_RUN |
| 他人物/背景への実pixel漏れ | NOT_RUN。bbox外maskを明示0・曖昧instance拒否するsourceのみ |
| Export二重適用防止 | portrait→global→rotation/Cropの共通一回source接続。NAT-089と実ExportはNOT_RUN |
| Proxy/Final実画像・実RAW品質 | NOT_RUN。値一致だけを画像一致としない |

ProxyとFinalは同じadapterを使うが、各入力を別々にfresh検出/mask化する。古いmaskを再利用しない。完全inventory・保存/検出bbox非重複・一対一対応が満たせない写真は安全拒否。近接/重なり・遮蔽などの対応可能率/品質は未測定。

## 6. 既存仕様・Recipe v1・DB・API・回帰

- 147節の原文/対応/既存Test IDを保持し、[今回147Evidence](evidence/face-brightness-2026-10-03/windows-03/regression.json)に実装→Test→結果を記録。全featureAcceptanceはNOT_PASSEDであり、関連単体試験から仕様全文合格を捏造しない。
- 固定6文書/6領域保存同期契約は全hash一致。凍結監査18filesと追補9inputsも一致。NON-DESTRUCTIVE、RAW不変、Proxy/Recipe/Cloud Safeの境界を変更していない。
- Recipe v1 golden JSONは現TS validatorで通過し、既存拡張保持をWIN-125/131等で検証。Swift実行互換性はNOT_RUN。
- **DB schema変更なし**。今回新table/column/DDL/migrationは追加せず既存body JSONと保存済history/versionから検証する。現在DDLのsource snapshotをEvidenceへ添付。Git未commitかつ旧DDL単独snapshotがないため、過去DDLとのbyte比較を行ったとは主張しない。既存124回帰とsource変更レビューで確認した範囲。
- **既存network API変更なし**。server.ts/workspace-server.ts/auth.tsは旧78sourceと同hash。既存method内の拒否強化であり、新endpoint/provider/課金接続を導入していない。EditorModel内部temp-root test seam/PhotoPipeline actorのasync整合は外部HTTP API変更ではない。
- 旧78/78の成功Evidenceは不変。現sourceは旧78中65一致＋承認変更13、追加12を含む90source fingerprint。承認変更を隠して「最新78/78不変」としない。
- 旧124件でMultipart破損partだけ新keyへ再取得/旧破損part・正常part保持/final checksum、SQLite kill/reopen、CAS、ENOSPC注入、Workspace隔離/権限、Quota/Downgrade非削除、Cloud Safe破損時失効、Crop/Print/JPEG/TIFF/PNG設定境界を再PASS。実Storage満杯・実端末・実Cloud・実画像は別NOT_RUN。

## 7. Original Recoveryの実装境界

| 工程 | 実装状態 | 実行状態 |
| --- | --- | --- |
| 原本保持設計 | IMPLEMENTED（既存copy後の失敗でもOriginalを消さないsource） | Native NOT_RUN |
| 自動削除禁止 | IMPLEMENTED（規範/既存guard） | Native NOT_RUN |
| orphan/unregistered original検出・durable journal | NOT_IMPLEMENTED | NOT_RUN |
| asset候補照合 | NOT_IMPLEMENTED | NOT_RUN |
| checksum確認付き再登録 | NOT_IMPLEMENTED | NOT_RUN |
| Recovery UI | NOT_IMPLEMENTED | NOT_RUN |
| RecoveryでのRecipe関連付け | NOT_IMPLEMENTED | NOT_RUN |
| Recovery後Cloud Safe再評価 | NOT_IMPLEMENTED | NOT_RUN |

[正式将来フロー](ORIGINAL_RECOVERY_DESIGN.md): Import開始→原本保存→DB登録失敗→アプリ終了/再起動→未登録原本検出→asset候補照合→checksum確認→ユーザーRecovery提示→再登録→Recipe関連付け→Cloud Safe再評価→完了。設計をRecovery実装完了へ読み替えない。未登録Originalをcleanup削除して解決しない。

## 8. Evoto workflow成果の統合とParity

[WORKFLOW_PARITY_SUPPLEMENT.json](evidence/face-brightness-2026-10-03/windows-03/WORKFLOW_PARITY_SUPPLEMENT.json)へ、凍結Registry01のFeature IDと受領workflow458操作をsourceFactKeyで458/458対応させた。複数所属850、記事内前後関係/条件/出典を保持する独立Interpretation層で、元Registry・原文・レビューを上書きしない。新Feature複製数0、実行連鎖合格0。ここでの458はsource操作数で、確定一意Evoto機能数ではない。

- 監査はPARTIAL。Web候補260群/RELATED141群の意味照合、116 UNKNOWN＋宣伝5件、現Platform条件/処理方式などの未確定を保持。
- Credit163は出典内分類36 NO_CREDIT / 18 REQUIRED / 94 CONDITIONAL / 15 UNKNOWNを維持。現アカウント/地域/Plan適用は全163 UNKNOWN。458操作も現在Credit/Plan/地域はUNKNOWN、Platform不明は5軸1,638セル。編集無料/無料Tether/Trialから無料Finalを推論しない。
- RC01/RC02と重大公式矛盾・取得不能12routeを保持。5360 candidate entitiesは確定Feature総数ではない。再調査/Registry02独立検査は未完であり、この補足join成功を網羅監査完了にしない。
- SUITEのFace Brightness CUSTOM EVはStatus B、実画像未検証。Evotoと同等のslider/platform/plan/credit/手数とは未確認で、名前だけでParity PASSにしない。Skin/Eyes/Contacts/Face Shape/Makeup/Hair/Body/追従/人物Batchは個別NOT_IMPLEMENTEDを保持。新P0/P1・正式Requirementは追加していない。
- **Feature Parity Gate BLOCK**: 未対応・重大未検証・UNKNOWN・公式矛盾・操作劣化の未解消を維持。

## 9. 未実施と次の最短検証

詳細コマンド・操作・合格条件は [FACE_BRIGHTNESS_NATIVE_QA.md](FACE_BRIGHTNESS_NATIVE_QA.md)。現WindowsにMac/Swift/Xcode/実機はなく、実RAWはcheckout外指定領域に未配置。ダミーRAW/生成RAW/JPEG改名を作っていない。

1. Macへ現在Buildのsourceを移し、ツール/SDK情報を実測。`swift test --package-path packages/METISMobileCore` → `swift test --package-path packages/SuiteCore` → `swift build --package-path apps/apple -c release`。112件の該当Test ID別に実行/未実行/失敗を残す。CLI packageだけではUIKitをbuildしていない。
2. `cd apps/apple` → `xcodegen generate` → `xcodebuild -showdestinations -scheme SUITE -project SUITE.xcodeproj` → observed destinationでiOS build/test、別runのxcresultを保存。NAT-083〜112も実行確認し、意図しないSKIPやcompile失敗を修正する。旧成功で最新sourceを合格扱いしない。
3. checkout外に権利確認済の複数人物実画像/実RAWを用意。対象顔だけ変化、別人物/背景非変化、Proxy/Final意図一致、原本前後SHA不変、保存/再読込/実終了復元、一回適用、不正/曖昧/古い対象拒否を実測。生成compositor/mask単体結果を実Vision品質へ流用しない。
4. 実RAW100/500/1000はセット別Manifest/pipelineで実測。例 `node scripts/raw-harness.mjs manifest --root /actual/external/RAW --sets 100,500,1000 --report /actual/external/REPORTS/new-manifest.json`。pipelineは実adapter絶対path/別work/reportを使用。現Mac adapterはglobal EV0.25のみでFace Brightness/同期/再起動/Cloud Safeを呼ばず、full lifecycle不足を自動成功にしない。
5. iPhone実機とiPad実機を別run/別Evidenceで評価。RAW Import→Proxy→Edit→Recipe Save→App Restart→Recipe Restore→Cloud Safe→Final Exportを独立完走し、端末model/OS/観測IDを記録。未接続Cloudは省略せずBLOCK。ロック・容量不足・強制終了・通信断・Export中断は別実行。

| 必須Gate | 現状態 | 必要条件 |
| --- | --- | --- |
| Windows | PASS_SCOPED（154/0/0） | このBuild限定、既存回帰維持 |
| Native | NOT_RUN / BLOCK | Mac/Swift/Xcodeで112件実行とiOS build |
| 実RAW | NOT_RUN / BLOCK | 真のRAW・支持カメラ・source前後SHA、セット別負荷 |
| 実画像 | NOT_RUN / BLOCK | 対象のみ変化/背景保持/Proxy-Final/一回適用/実保存復元 |
| iPhone | NOT_RUN / BLOCK | 観測したiPhoneで全導線実測 |
| iPad | NOT_RUN / BLOCK | 観測したiPadで専用layoutと全導線実測 |
| 本番Auth/Cloud/Sync/Billing/Pricing | 未接続 / BLOCK | 既存の追加Gateも未合格のまま。モック成功禁止 |

**Mobile Release BLOCK**。Windows＋Native＋実RAW＋実画像＋iPhone＋iPadの必須実測と既存本番/Parity等の必須Gateを満たすまで解除しない。Web完成はMobile Release Gateに含めず、Web実装へ逃がさない。

残存リスク: Native未compile、人物Mask/本人対応/画質未測定、Undo前へ戻った後のglobal forkはinventory消失拒否により保存不能draftとなり得る（解決UI未実装）、保存失敗draftの耐久化未完成、原本Recovery未実装、historical Export snapshot retry未実装、本番Cloud/認証/同期/課金未接続。価格・provider・Apple課金方式を独断確定せず、標準50GBの事業Baselineを保持する。

## 10. 実行コマンドと変更ファイル

親の今回実コマンド:

```powershell
node docs/EVOTO_AUDIT/tools/run-timed-regression.mjs docs/evidence/face-brightness-2026-10-03/windows-03
node scripts/portrait-integrity-evidence.mjs docs/evidence/face-brightness-2026-10-03/windows-03
node docs/tools/check-person-integration.mjs docs/evidence/face-brightness-2026-10-03/windows-03
node docs/tools/check-person-integration.mjs docs/evidence/face-brightness-2026-10-03/windows-03 --freeze
```

1本目は旧147/追加仕様検査、TypeScript build、全12 test files、RAW manifest/pipelineを実行した。内部完全command/stdout/stderr/exitはregression.json#/commands。build/tests/spec検査exit0、実RAW2probeはexit2外部BLOCK、文書検査exit0。2本目の実拒否12例、3本目の静的/Evidence12検査は別枠。既存Evidenceへの同コマンド再実行はwrite-onceで拒否するので、次は必ず新しいrun directoryを使う。

旧78対象で変更した13source:

```text
apps/apple/Package.swift
apps/apple/QA/RawQAAdapter.swift
apps/apple/Suite/EditorModel.swift
apps/apple/Suite/Services/PhotoPipeline.swift
apps/apple/Suite/Shared/EditorComponents.swift
apps/backend/src/photo-policy.ts
apps/backend/src/repository.ts
apps/backend/src/workspace.ts
packages/SuiteCore/Sources/SuiteCore/PhotoLifecycle.swift
packages/SuiteCore/Sources/SuiteCore/Project.swift
packages/SuiteCore/Sources/SuiteCore/ProjectStore.swift
packages/SuiteCore/Sources/SuiteCore/Recipe.swift
scripts/final-regression.mjs
```

今回人物/検証で追加したsource（旧78からの追加12のうち10）:

```text
apps/apple/Suite/Services/PortraitPipeline.swift
apps/apple/Tests/PortraitPipelineTests.swift
apps/backend/src/person-geometry.ts
apps/backend/src/portrait-recipe.ts
apps/backend/tests/person-integrity-paths.test.ts
apps/backend/tests/portrait-recipe.test.ts
packages/SuiteCore/Sources/SuiteCore/PersonGeometryIntegrity.swift
packages/SuiteCore/Sources/SuiteCore/PortraitRecipe.swift
packages/SuiteCore/Tests/SuiteCoreTests/PortraitRecipeTests.swift
scripts/portrait-integrity-evidence.mjs
```

追加12の残り2は従来監査用 `scripts/evoto-deep-audit.mjs` / `evoto-deep-audit-validate.mjs`。人物機能追加数として数えない。全90source hashと変更前後/追加の機械一覧はRUN_METADATA/PERSON_INTEGRATION_CHECK。

文書/統合toolの変更: CHANGE_NOTICE.md、OWNERSHIP.md、PARALLEL_WORK_BOARD.md、INTEGRATED_CHANGES.json、PERSON_INTEGRITY_GATE.md、PERSON_INTEGRITY_PATHS.json、ORIGINAL_RECOVERY_DESIGN.md、FACE_BRIGHTNESS_NATIVE_QA.md、PORTRAIT_REVIEW.md、本書、INTEGRATED_REPORT.md、HANDOFF.md、docs/tools/check-person-integration.mjs、docs/EVOTO_AUDIT/tools/run-timed-regression.mjs。監査担当のaudit_continuation.json/mdは部分成果として受領保存し、元凍結レビューは不変。Evidenceはwindows-01/02/03の別run、今回Supplement/凍結manifestへ追加した。

**変更禁止**: 既存147節/固定6文書/6領域保存同期契約、Recipe v1 envelope、DB schema、network APIの不用意な再設計、原本上書き/自動削除、未同期Recipe/台帳削除、顔順番/nearest/firstへのfallback、監査元Evidence上書き、未検証PASS化、料金/provider/IAPの独断確定。人物補正全体完成やEvoto人物Parity達成とは表現しない。
