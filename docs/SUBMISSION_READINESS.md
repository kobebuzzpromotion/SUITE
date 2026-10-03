# 比較監査・Apple提出準備・最終統合

更新日: 2026-10-03 JST。**Mobile Release BLOCK / App Store提出不可**。

この文書は今回の作業結果であり、新しい製品仕様ではない。固定6文書、147節、NON-DESTRUCTIVE、RAW原本不変、Proxy / Recipe / Cloud Safe、6領域保存同期契約を変更していない。新provider・API・保存構成・Web実装は追加していない。

## 成果と正本の関係

- `EVOTO_AUDIT.md` / `evoto-audit.json`: 公式情報と現コードの詳細差分。**主要競合基準はEvotoであり、Lightroom基準で合格とはしない**。A–Gは行単位の分類であり、製品全体の完成度を意味しない。Gは公式情報で存在未確認。E/GにもSUITE側成熟度を付ける。Dは仕様を追加する承認ではなく、Fは機能を削除する承認ではない。
- `APPLE_SUBMISSION/README.md`: App Store Connect提出用の準備資料。未確定URL、事業者情報、審査アカウント、Privacy、課金、権利判断は未確定のまま。草案を公開文面や申告済み情報として扱わない。
- `MOBILE_DEVICE_QA.md`: iPhone / iPadそれぞれの実機操作・必要環境・合格条件。Macはビルド/QA環境であり、第3の実機製品Gateではない。
- `HANDOFF.md`: 現在の状態の正本。`TRACEABILITY.md` / `requirements.json` と4原文が147節の対応を保持する。
- `evidence/submission-readiness-2026-10-03/`: 今回再実行したEvidence。旧 `verification-results.json` は前回の記録として保持する。

比較は機能名だけでなく、カメラ接続→撮影→自動Import→Preview→前画像効果/プリセット自動適用→即時確認→人物別編集→Batch→Exportの操作連鎖を扱う。各差分に既存仕様有無、UX影響、実機要否、実装コスト、AI/クラウドコスト、非破壊整合、提案優先順位を記録する。費用/日数は未見積のまま残す。優先順位は監査上の提案であり、ユーザーの既存実装優先順を無断変更しない。Exportは形式/品質/サイズ/解像度/resize/metadata/命名/一括/出力先と、既存SUITEの300dpi・A0/A1等・SNS比率・RAW＋Recipe最終生成を別項目で照合する。

## 実行結果

Windows基盤 **34 PASS / 0 FAIL / 0 SKIP**（backend 16 + harness機構 18）。TypeScript buildと147節・固定6本文hash照合も成功。Swift/Core/Appleの45 XCTestは **NOT RUN**。製品全体の合格、画像処理の実測成功、実機合格には換算しない。

全34試験名、コマンド、stdout、147節の要件→実装→test ID→Evidenceは `evidence/submission-readiness-2026-10-03/regression.json` のrequirements / testCatalog / commands。requirements内の既存Evidenceリンクは旧 `verification-results.json` への参照を保持しており、今回結果への書換えではない。安定したtest IDの説明は `TEST_CATALOG.md`。今回の仕様本文の追加・変更は **0**。

| 独立した回帰対象 | 結果 | Evidence / 限界 |
| --- | --- | --- |
| 原本不変・不完全upload非公開・checksum | PASS | WIN-002 / 011 / 012 / 015。実ファイルの任意storage bytes。実RAW画質試験ではない |
| Multipart再開・応答消失再送 | PASS | WIN-003。local実ファイル/SQLite、iOS通信ではない |
| 破損partだけ再取得・旧part/正常part保持 | PASS | WIN-004。破損partを別keyへ保存、旧bytes保持、正常partを変更せず最終checksum一致 |
| Recipe形式・CAS保存競合・再読込 | PASS | WIN-001 / 012 / 015。Swiftとの両側実行完了ではない |
| 容量不足 | PASS（障害注入のみ） | WIN-005。ENOSPC注入と回復後再試行。実ストレージ/実機満杯はNOT RUN |
| 強制終了・SQLite復元 | PASS（Windows） | WIN-006。実child process終了と未commit rollback。iOS終了耐久は未検証・未完成部分あり |
| Proxy優先・Original取得待ち・eviction保護 | PASS（判定） | WIN-007 / 008 / 009。cloud Proxy同期/物理LRU実行は未実装 |
| Cloud Safe条件・原本破損時の失効 | PASS（backend限定） | WIN-010 / 015。Swift追加条件・本番権限/backup/複数端末は未検証/未接続 |
| 固定Recipe→新規Final Export | NOT RUN（native） | NAT-001 / 032ほか。コードあり、Mac未ビルド。実RAW/実機成功証拠なし |
| Mac/実RAW/実機のGate分離・未接続昇格拒否 | PASS（判定/runner機構） | WIN-013 / 016 / 026 / 034。対象Gate自体を合格させた結果ではない |

## 実RAW 100 / 500 / 1000

指定checkout外 `C:/Users/user/Documents/Codex/2026-10-03/SUITE_TEST_DATA/RAW/` に対象セットが存在しない。manifest / pipelineを各1回、3セット指定で実行し、各CLIが終了値2を返した。各JSONの100 / 500 / 1000件はそれぞれRAW_SET_NOT_PLACED / BLOCKED_EXTERNAL_ENVIRONMENT。これはRAW負荷試験のPASSでもFAILでもない。

| 件数 | Import | Proxy生成 | 同期 | Recipe保存 | 実再起動復元 | Cloud Safe | Export |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 100 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 500 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |
| 1000 | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN | NOT RUN |

必要環境: 実RAW、Mac/Xcode、接続された対象adapter、別々のiPhone/iPad実機。本番同期/full lifecycle adapterの未実装・未接続は環境不足とは別の開発残。同一プロセスのmetadata再openを再起動復元と認定しない。計測値は未測定nullであり、0や成功値で埋めない。ダミーRAWやJPEG代用品は生成していない。

## 状態と未合格理由

| 区分 | 現在 |
| --- | --- |
| 実装済み・範囲限定の実行検証済み | Windows backend / local immutable storage / SQLite / JWT tenant境界 / CAS / Multipart修復 / 判定 / harness機構 |
| コードあり・未検証（B） | Swift Core、iPhone/iPad UI、PhotoPipeline、固定Recipe Export、通信client、Mac QA adapter。Swift45試験NOT RUN |
| 仕様済み・未実装/未接続（C等） | 認証UI・production接続、cloud Proxy同期、別端末復元、durable outbox、iOS Multipart、人物補正描画・AI・Tetherほか。詳細はHANDOFFと差分監査 |
| 実RAW待ち | 100 / 500 / 1000および容量別Project・カメラ互換性・画像品質測定 |
| Mac実行待ち | Swift build / XCTest / Apple画像処理 / QA adapter。WindowsにSwift / Xcode / XcodeGenなし |
| iPhone実機QA待ち | 全一連操作、タッチ/片手/回転、ロック、回線断、終了復旧、実容量不足。モデル/OS未確定 |
| iPad実機QA待ち | 同一連操作を独立実施。専用レイアウト・縦横・Pencil等を追加。モデル/OS未確定 |
| App Store提出待ち | metadata草案、申告・署名・権利・実ビルド・実スクショ・実URL・レビュー用環境の未確定/未達。資料作成で提出可にはならない |

現在のMobile Release判定は34必須Gateに実測受入証拠がなく **BLOCK**。一覧は今回 `regression.json#/mobileRelease/unknowns`。Web完成は含めない。Mac実行成功だけでiPhone/iPadを合格にせず、基盤試験を全商用機能の合格に昇格させない。

## 残存リスク

- 実機とMacが揃っても、cloud Proxy / 別端末復元 / 認証UI / production接続 / iOS耐久queueの開発残があるため、full lifecycleは現状のまま完走できない。
- 原本保護とCASのWindows証拠はあるが、未保存draftの強制終了耐久、createAsset冪等性、orphan reconcile、実機の容量/熱/メモリ、カメラ別RAW品質は未達。
- Evoto公式説明を仕様・方式の比較に用いた。実機で両製品の速度/画質同等性を計測していない。未確認のEvoto内部保存方式を「ない」と断言しない。
- Apple提出資料はドラフト。実バイナリ、データフロー、SDK、対象国/配信先、運営者情報、課金判断が確定してから申告を再照合する。
- Gitは新規・未コミット・remoteなし。今回固定したものはファイルとSHA付きEvidenceであり、push済み/commit済みとは扱わない。

## 次に実行する最短手順

1. `HANDOFF.md` → 本書 → `MOBILE_DEVICE_QA.md` → `APPLE_SUBMISSION/README.md` を読み、正本/禁止事項/開発残を引き継ぐ。
2. Windowsで `npm run check`、`node scripts/final-regression.mjs` を再現。未実装の接続部分は既存契約内で担当を固定し、仕様変更が必要なら先に理由/影響を報告する。新provider選定で代用しない。
3. Macで `NEXT_RUN.md` のSwift Core→Apple QA adapter→XcodeGen→実機destination確認を順に実行。提出SDKと最低対応OSを混同しない。実モデル/OS/署名/Bundle IDは観測・所有情報で埋める。
4. checkout外に実RAWを配置し、manifest→local計測。full sync/再起動/Cloud Safe不足は未達のまま残す。その後 `MOBILE_DEVICE_QA.md` の各行をiPhoneとiPadで別々に完走する。
5. Apple資料の未確定を事実で埋め、実Privacy/権利/提出要件を照合。全必須Gateの実測通過前に提出・公開しない。

実コマンドと操作別合格条件は `NEXT_RUN.md` / `RAW_QA.md` / `MOBILE_DEVICE_QA.md` に記録する。準備資料の網羅性チェックは製品テストやRelease Gateとは別Evidenceにする。
