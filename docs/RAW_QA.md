# 実 RAW / 100・500・1000 負荷試験

MOBILE RELEASE > WEB RELEASE。Web完成はMobile Release Gateに含めない。

この文書は既存6領域契約の変更ではなく、外部実データの受入・計測・未実施表示を固定する。iPhone / iPad のモデル・OS・Mac環境を推測で決定しない。

## 現在の区別

- Harness / manifest / adapter protocol: `scripts/raw-harness.mjs` に実装。統合実行結果は親担当の検証記録を参照。
- 機構試験: `scripts/raw-harness.test.mjs`。任意 bytes / metadata 構造 / child process 通信の単体試験であり、実 RAW 処理成功でも iPhone/iPad 実機 QA でもない。
- 実 RAW 100 / 500 / 1000、Swift 実行、Mac/Xcode、iPhone / iPad 実機 QA: **BLOCKED_EXTERNAL_ENVIRONMENT**。実データ・環境の実在と実行結果を確認するまで解除しない。
- 画像生成・JPEG偽装・ダミー RAW で負荷試験を成立させない。Manifestだけ作れても RAW decoder / batch / device QA を PASS にしない。
- Mac local native adapter候補のソースをメインが `apps/apple/QA/RawQAAdapter.swift` / `apps/apple/Package.swift` に追加済み。**未ビルド・未実行・未接続**。macOS 14以上で既存PhotoPipelineを検証するQA専用CLIであり、製品Mac版の先行開発ではない。ソース存在を実装動作の証明にしない。
- 全計測項目を受信・検証・記録するrunner機構は実装済み。Mac local adapterとの接続は `NOT_CONNECTED_ADAPTER`、実RAW・Mac/Xcode・実機の不在は `BLOCKED_EXTERNAL_ENVIRONMENT` と区別する。実データ投入だけで直ちにフルpipelineを実行できる状態ではない。
- Cloud fetch QA adapter / iPhone・iPad physical-device QA adapter は **未実装の開発残タスク**。これらをMac local計測や環境不足へ隠さない。Mac候補はローカルOriginal検証・JPEG・ProjectStore再openまでであり、cloud/network latency、SQLite DB growth、TIFF、OS crash recovery、実機QAの代替ではない。

## 外部データ領域

Windows 既定値（checkout外）:

```text
C:\Users\user\Documents\Codex\2026-10-03\SUITE_TEST_DATA\RAW\
  100\
  500\
  1000\
```

各フォルダにはその件数の実 RAW のみを配置する。撮影者が提供した現実の撮影データを利用する。サブフォルダも再帰走査する。sidecar / JPEG 等は同じ dataset に混在させない。実 RAW と大容量試験成果物を Git に保存しない。Macでは利用者が提供した checkout 外の実データ path を `--root` で明示する。移送や同期は本 runner は行わない。

入力は read-only open / streaming SHA-256 のみ。RAW root が checkout の内部、checkout 自体、checkoutを包含する親フォルダの場合は拒否する。実 path で判定し、dataset 配下の symlink / junction と特殊ファイルは拒否する。source を書換え・削除する API は使わない。

## Project 容量別の追加測定 matrix

`CLOUD_STORAGE_OVERRIDE.md` §23に従い、件数別 100 / 500 / 1000 RAW と別軸で下記を保持する。件数から容量を推測せず、容量から件数を推測しない。表の予定サイズは計画値であり、実測 `manifest.totalBytes` ではない。GB/TB と GiB/TiB の換算規則は実データ受入時に測定記録へ明示する。大容量ダミー・sparse file・同一画像の水増しを生成しない。

| plannedProjectSize（要求上の想定） | actualTotalBytes | 実行状態 | 追加で確認する対象 |
| --- | --- | --- | --- |
| 50GB 相当 | null（実データ未配置） | BLOCKED_EXTERNAL_ENVIRONMENT | 下記12項目 |
| 100GB 相当 | null（実データ未配置） | BLOCKED_EXTERNAL_ENVIRONMENT | 下記12項目 |
| 500GB 相当 | null（実データ未配置） | BLOCKED_EXTERNAL_ENVIRONMENT | 下記12項目 |
| 1TB 相当 | null（実データ未配置） | BLOCKED_EXTERNAL_ENVIRONMENT | 下記12項目 |

確認対象は Scroll performance / Proxy display / Edit latency / Background Upload / Resume / Cloud Safe / Cache eviction / Device restart / Offline recovery / Cross-device sync / Full export / Original integrity。既存の測定対象にこれらの実機・クラウド証拠を突き合わせる。runner の `--sets` は引き続き件数 100 / 500 / 1000 に限定し、大容量 Project の構成・provider・ネットワーク条件を勝手に追加しない。実 Project の manifest と該当 count batch の report を実データ提供後に親担当が紐付ける。

## Manifest-only

リポジトリ root から:

```powershell
node scripts/raw-harness.mjs manifest --sets 100,500,1000
node scripts/raw-harness.mjs manifest --root C:\Users\user\Documents\Codex\2026-10-03\SUITE_TEST_DATA\RAW --sets 100 --report C:\Users\user\Documents\Codex\2026-10-03\SUITE_TEST_DATA\REPORTS\manifest-100-unique-run.json
```

JSON は stdout、任意の `--report` は新規ファイルのみ（既存 evidence を上書きしない）。report を RAW データ領域へ書くことは禁止。実データがなければ exit 2、`BLOCKED_EXTERNAL_ENVIRONMENT`、`fileCount / totalBytes / averageFileSize / minFileSize / maxFileSize = null`。存在する空フォルダの count / total は実測 0、平均 / 最小 / 最大は null。

Manifest 必須項目:

| 項目 | 証拠 |
| --- | --- |
| file count / total bytes / average / max / min | 実ファイルの stat と stream 検証 |
| checksum | ファイルごとの SHA-256、整列した file records の manifestChecksum |
| camera maker / model | bounded TIFF ASCII Make / Model tag が読めた場合のみ値を保持。その他 null + UNVERIFIED |
| RAW format | header / DNG tag から得た container evidence。拡張子は extensionHint として分離 |
| camera supported | 常に UNVERIFIED。metadata抽出は camera互換性の実証ではない |

JPEG・PNG・GIF signature は拡張子にかかわらず拒否。TIFF family は `TIFF-family (RAW unverified)` と記録し、NEF/ARW等を拡張子から断定しない。既知 RAW container signature を持っていても `REQUIRES_RAW_DECODER`。壊れた header や不明形式を「対応 RAW」と認定しない。全件 RAW decoder 成功の判定は native adapter の実行証拠が必要。

RAF magic は末尾ASCII spaceを含む16 byteの `FUJIFILMCCD-RAW `。15 byte prefixだけでは一致としない。header比較の根拠は [libopenrawのRAF_MAGIC / RAF_MAGIC_LEN](https://libopenraw.freedesktop.org/api/libopenraw/stable/group__fujifilm.html)。signature単体の機構試験は実RAF decoder成功ではない。

## Full pipeline / native adapter 契約

Mac local候補は、Mac/Xcodeと実RAWが提供された後にリポジトリrootからビルドして検証する。Windowsでは未実行。

```text
swift build --package-path apps/apple -c release
```

生成予定 executable は `apps/apple/.build/release/SuiteRawQAAdapter`。ビルドの実際の出力先・実ファイルを確認して、その絶対pathをcheckout外の `adapter.json` の `command` へ指定する。ビルド成功はまだ確認されていない。配布・署名済みの製品CLIではない。

adapter は実在する実行ファイルを指定し、shell や動的コマンド文字列を利用しない。設定ファイルは利用者が checkout 外に用意する。例の path は実環境で置き換えるもので、存在・実行済みの主張ではない。

```json
{ "command": "/absolute/path/to/SuiteRawQAAdapter", "args": [] }
```

```text
node scripts/raw-harness.mjs pipeline --root /absolute/external/RAW --sets 100,500,1000 --adapter /absolute/external/adapter.json --work-dir /absolute/external/SUITE_QA_OUTPUT --timeout-ms 900000 --report /absolute/external/REPORTS/unique-run.json
```

Mac local候補は各入力を実際の `CIRAWFilter` に渡し、runtime decodeが受け付けない入力を拒否する処理を持つ。既存PhotoPipelineによるコピー・SHA検査・Proxy生成、固定checkpoint/ExportPlanのJPEG、metadata再open、前後SHA、filesystem失敗時の上限1回retryを接続した候補であり、いずれも実RAWでの動作確認は未実施。Proxy edge 2048・serial concurrency はQA負荷の明示条件であり、製品設定・最適値・全カメラ対応の断定ではない。

13計測項目は候補に接続済みだが未実測。peak RSS / CPUはMac workerのgetrusage、diskはQA仕事領域全体、`dbGrowthBytes` はProjectStore JSONであってbackend SQLiteではない。`originalFetchLatencyMs` はローカルOriginal checksum validation、`cleanupRecoveryTimeMs` はmetadata再openと原本検証であってクラッシュ・端末ロック復旧ではない。この計測scopeを各evidenceに残す。cloud fetch・TIFF負荷・実機復旧を測ったことにはしない。

### QA gate の分離と v1 必須stageの欠落修正

100 / 500 / 1000 の各セットで、Import → Proxy → 同期 → Recipe保存 → 再起動復元 → Cloud Safe → Exportまでの既存の導線を省略しない。外部コマンドJSONL契約はschemaVersion 1のまま、必須stageへ `sync`, `recipeSave`, `restartRecovery`, `cloudSafe` を追加した。従来の6stageは保持する。これはQA判定の欠落修正であり、新しい製品API・production保存契約・6領域設計の追加変更ではない。旧adapterのローカル結果だけを後方互換で合格扱いしない。

| Gate | 必要な証拠 | 現在の判定境界 |
| --- | --- | --- |
| Mac local compute | 実RAW decode / copy・SHA / Proxy / 固定入力JPEG / metadata再open / native process測定 | Mac候補は未ビルド・未実行。実行できてもこの範囲だけの証拠 |
| Full lifecycle | 既存6stageに加えsync / recipeSave / restartRecovery / cloudSafeが全件PASS、必須計測も存在 | 現Mac候補は追加4stageを報告しないため、全ローカル処理が成功してもrunnerは `FAILED_OR_INCOMPLETE`。フル導線を合格にしない |
| Physical device | iPhoneとiPad各実機の実RAW・タッチ・主要導線・network loss・終了・lock・容量不足・再開・Export中断・復旧 | `BLOCKED_EXTERNAL_ENVIRONMENT`。Mac local / full lifecycle結果から実機PASSへ昇格させない |

`recipeSave` は実際の編集内容・revisionのdurable保存、`sync` は既存同期契約の完了検証、`cloudSafe` は既存のchecksum / persistence / metadata / permission等全必須gateの証拠、`restartRecovery` はプロセスまたはアプリを終了・再起動した後の状態復旧検証を必要とする。単なる同一プロセス内のProjectStore再openを `restartRecovery:PASS` としてはいけない。ローカルadapterが未接続stageを偽のPASSで埋めることは禁止。

work-dir は checkout 外かつ RAW root と親子関係を持たない専用領域。runner はこの領域の作成のみ行い、成果物を勝手に削除しない。adapter はここに複製 Original / Proxy / DB / Export / evidence を作り、source path は読み取り専用として扱う。独立した runId 別フォルダを使い、前回成果物と混ぜない。秘密情報は引数・JSONL・stderrへ出さない。adapter は利用者が信頼する実装のみ使う。別プロセスの OS 権限を本 runner が sandbox 化するわけではないため、read-only volume / ACL を設定した外部データで実行するのが安全。

stdin に JSON 一行を渡す:

```text
schemaVersion: 1
kind: SUITE_REAL_RAW_BATCH
runId: unique UUID
manifest: 上記実測 manifest（datasetRootと相対 file path、SHA-256）
workDirectory: 明示専用領域
requiredMeasurements: 下記項目と単位
requiredStages: import / proxyGeneration / sync / recipeSave / restartRecovery / cloudSafe / originalFetch / exportPreparation / finalExport / cleanupRecovery
originalPolicy: READ_ONLY_NO_MUTATION
exportPolicy: ORIGINAL_ONLY_NO_PROXY_FALLBACK
```

adapter stdout は改行終端 UTF-8 JSONL のみ。進捗の自由文や診断は stderr。計測は batch 全体の実測値とし、memory / CPU は harness 親プロセスではなく native worker / device の計測。複数 worker を使用する場合は合計/最大の算出規則と実計測ログを `evidence` に明記する。未実装値を 0 として出さない。

1. `environment` 一件: `schemaVersion:1`, `kind:"mac-native" | "physical-iphone" | "physical-ipad"`, `platform`, `osVersion`, `adapterVersion`, `rawDecoder`（非空文字列）。physical device なら実測 `deviceModel` が必須。モデル・OSの推測は禁止。
2. `measurement` 各項目一件: `name`, `value`（有限・非負の実測値）, `unit`, `evidence`（実測元・log path等）。count / bytes / microseconds は整数、concurrency は正整数。
3. `assetComplete` 各 source 一件: `relativePath`, `sourceSha256`, `rawDecoded:true`, `originalUnchanged:true`, `recipeReloaded:true`, `exportInputFixed:true`, `exportInput:{representation:"original",sourceSha256,recipeRevision}`, `stages:{import:"PASS",proxyGeneration:"PASS",sync:"PASS",recipeSave:"PASS",restartRecovery:"PASS",cloudSafe:"PASS",originalFetch:"PASS",exportPreparation:"PASS",finalExport:"PASS",cleanupRecovery:"PASS"}`, `evidence`。booleanとstageのPASSは実処理と検証後にのみ出す。Final の元画像は Original、Recipe revision は export 開始時に固定する。Proxy fallback や Recipe 変更混入は禁止。
4. `batchComplete` 一件: `status:"PASS"`, `fileCount`, `manifestChecksum`。全件終わっていなければ PASS を出さない。

全項目が揃わない場合 `FAILED_OR_INCOMPLETE`、未提供計測は `null + UNVERIFIED`。未通過stageは `REQUIRED_STAGE_NOT_PASSED:<stage>` として列挙する。13計測値やadapter自身の `batchComplete:PASS` があっても、必須stageの不足を打ち消せない。これを QA 合格に読み替えない。通信断・容量不足等で止まった adapter がエラーを終了コードや evidence に残すことは正しい動作。

未実行理由は `prerequisites` で分離する。`externalEnvironment` は実RAW未配置等、`connection` は `NOT_CONNECTED_ADAPTER` / `WORK_DIRECTORY_NOT_CONNECTED`、`input` は不正データ。実RAW不足とadapter未接続が同時に存在する場合は両方を残す。環境不足のない状態でadapter未接続なら総合statusは `NOT_CONNECTED_ADAPTER` であり、`BLOCKED_EXTERNAL_ENVIRONMENT` ではない。仕事領域の設定だけが不足する場合は `NOT_CONNECTED`。`implementation` は現時点のMac実行前提では空配列とし、cloud / physical-device adapter の開発残は `developmentRemainders` と `adapterScopeNote` に別記する。Mac/Xcode・実機の未提供は別の実機QA記録で `BLOCKED_EXTERNAL_ENVIRONMENT` のまま保持する。

| 測定対象 | field / unit | 実測境界 |
| --- | --- | --- |
| Import time | importTimeMs / ms | ingest開始→immutable Original + metadata commit |
| Proxy generation time | proxyGenerationTimeMs / ms | 実 decode/downsample開始→durable Proxy |
| Peak memory | peakMemoryBytes / bytes | 実 worker/device の batch peak RSS。単なる heapUsed ではない |
| Disk/cache usage | diskCacheBytes / bytes | batch 終了時点の実仕事領域。cache範囲をevidenceに記録 |
| DB growth | dbGrowthBytes / bytes | 開始前後の増分（本体 + WAL等の対象範囲明記）。増分なし0は実測時のみ |
| CPU usage | cpuUserMicros, cpuSystemMicros / microseconds | 実 worker/device の user/system CPU time delta |
| concurrency | concurrency / count | 同時 active job 数の実測 peak |
| failure/retry | failureCount, retryCount / count | 実処理の失敗数・再試行回数。未実装 retry は0の成功扱い禁止 |
| Original fetch latency | originalFetchLatencyMs / ms | Original要求→検証済み Original 利用可能。cloud/local取得元明記 |
| Export preparation | exportPreparationTimeMs / ms | 固定入力 checkpoint作成→Original/Recipe/必要asset準備完了 |
| cleanup/recovery | cleanupRecoveryTimeMs / ms | 失敗残骸の安全処理/再開→復元検証完了 |

runner は完了後・中断後に全 source SHA-256 と bytes を再確認し、変更/欠落を FAIL にする。ただしこれは中間時点の全 mutation を検出できる保証ではない。native adapter の原本 read-only 境界と併用する。

timeout / SIGINT / SIGTERM / adapter 異常終了 / 不正JSON / 未終端行 / 過大出力 / 不足evidenceを区別する。timeout後は子プロセス終了を要求し、終了しなければ強制終了する。adapterは独立した orphan worker を残さず、終了時に保留状態を復旧可能にする契約。アプリ終了・端末ロック実験をこの child process timeout 試験で代用しない。

## 失敗系・実機QAの取り扱い

T01–T30 は既存の回収資料とメインの失敗系検証表を正本とする。本 runner に別番号や別の完成条件は作らない。Original不変性、Proxy lifecycle、Recipe再読込み、SQLite、Tenant、Offline/CAS、Multipart resume、Original取得失敗、Export固定入力、Cache eviction、容量不足、Trash/Recovery、権限境界は Windows 基盤側の実試験を継続できる。ただし native API / iOS lifecycle の代替合格とはしない。

ネット切断・アプリ終了・端末ロック・容量不足・再開・Original不在・Export中断は Mac/Xcode と実機用の実験条件・時刻・ログ・復旧結果を保存する。iPhone と iPad を別々に記録する。全6段階の Cloud Safe 証拠、原本 SHA-256、Recipe revision、Export input、再開 checkpoint の整合を突き合わせる。

`PIPELINE_EVIDENCE_COLLECTED` は指定 dataset の実 adapter 証拠回収までを意味する。iPhone/iPad のタッチ、主要導線、ロック、Background、権限、熱、バッテリー、RAW対応カメラ互換、モバイルRelease Gate全体を一括PASSにしない。`deviceQA` は本 runner 単独では常に `BLOCKED_EXTERNAL_ENVIRONMENT` とし、実機QAの合格は別の実行記録で管理する。

## 親担当の実行対象

```text
node --test scripts/raw-harness.test.mjs
node scripts/raw-harness.mjs manifest --sets 100,500,1000
node scripts/raw-harness.mjs pipeline --sets 100,500,1000
```

最後の2コマンドは未配置と未接続を明示する確認であり、実 RAW 100/500/1000 試験成功ではない。計測runner機構、Mac local adapter候補の未ビルド・未接続、cloud / device adapterの開発残、実RAW/実機QAの未実施を分離して残す。
