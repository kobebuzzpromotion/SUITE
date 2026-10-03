# Web SDK Privacy Review — 固定版・通信・解放条件

更新: 2026-10-03。状態: **部分調査完了 / PRIVACY_REVIEW_REQUIRED**。A専任のread-only source/公式資料確認。製品source、既存Evidence、人工21診断結果は変更しない。実RAW・実写真・真人物をSDKへ渡していない。法務承認・無通信保証・人物処理の本番解放ではない。

## 適用境界

顔SDK確認は、非人物RAW decode、global/Crop、非人物保存・再読込・書出し、作者フローの開始条件にしない。それぞれのAuth/原本保持/配布/実RAW等の独立Gateは残る。人物解析とportrait Recipeの再描画/Finalだけが現在の人物Privacy BLOCK対象。既存portrait保存データを消したり、非人物Recipeに黙って変換しない。

`session.mjs`のdefaultは`PRIVACY_REVIEW_REQUIRED`。`SYNTHETIC_TEST_ONLY`は明示した人工test adapter専用で、通常processingを実人物許可へ切り替える選択肢ではない。`worker.mjs`は`detectPeople`とportrait付き`render`だけで`faces.mjs`をdynamic importする。RAW/global/Crop/makeProxy/encodeには顔SDKの評価/初期化を起動するsource経路がない。IIFE内にSDK bytesが含まれることとmodule initializer実行は別。実bundle評価境界/回帰はmainのEvidenceを正とする。

## 三種類の根拠を混同しない

| 層 | 今回確認 | 確定しないこと |
| --- | --- | --- |
| OFFICIAL_POLICY | 公式規約と固定installed READMEに、端末内入力処理・Googleへのmetrics・適用法上必要な説明/同意責務がある | このWeb版が規約例示の全項目を送ること、各packetの内容/保持期間/リージョン |
| STATIC_CONFIRMED | 固定1.0.1 bundleにODML POST、logger自動生成、時間/回数キューとflush処理がある | 現SUITEで実際に何bytesが送信されたか、成功したか |
| RUNTIME_NOT_RUN | 本レビューではnetwork trace/payload captureを実施していない | 人工21 PASSを無通信・同意・配布承認として扱うこと |

## 固定artifact

`package-lock.json`は`@mediapipe/tasks-vision` **1.0.1**、`@colorhythm/libraw-wasm` **1.1.1**を固定。npm取得はbuild-timeであり、写真処理中の通信とは区別する。MediaPipeのresolvedは`https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-1.0.1.tgz`、integrityは`sha512-rvRE2FmAZ6ZxKSw7wq+e+jQDpN3t1B/tD2mJz9SmAzb1msoDkd4dMoE4wAh8Z30Um0PQwLiHr9QtomhmXk3aUQ==`。

| artifact | SHA256 |
| --- | --- |
| installed `vision_bundle.mjs` | `d885630c297c0b20b1fe86096cb06291c4c8080876f27852e724f24ac603713f` |
| installed `vision.d.ts` | `dc272aff0a1b53c375815c6ef475c02c0a4892032683770d571e530ffded3d48` |
| installed `package.json` | `f685301c07427e1d19a53b08afa586e5699aa1dfc2dd8c641887cc2c821b245e` |
| installed `README.md` | `8326ed0beb1983b69cccb190937c2e368388969cb3ade06010fe51e0d5339308` |
| SIMD `vision_wasm_internal.js` | `e170ee67dd4e16c1a6fcd8840a206687e5a59b22c20e4a902bc445b095454d73` |
| SIMD `vision_wasm_internal.wasm` | `8da277a733926eacd0474b8704b36742d6ec3231c57a860c5b889dff8f1df886` |
| model `face_landmarker.task` | `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff` |
| `worker.mjs` delayed-import checkpoint | `33a160d5ab0886870185f65ba8bbe7500a8907b98f1d933d75f7e0a4e1201205` |
| `faces.mjs` | `799d7f6cbf67d665819912a4fa84c5e69855c189ac7bef6314cefe54c220b775` |
| `index.mjs` facade | `f4c6af764c951a8128bf219ead822662ce463049fee6d5b2d4099e96c43d5b74` |

Hashはartifact識別で、挙動/許諾/最新本番buildの保証ではない。WASMの非SIMD/module variantsや全importの完全監査は未完了。

## 公式説明・同意条件

[MediaPipe APIs Terms of Service](https://developers.google.com/edge/mediapipe/legal/tos)はmodified 2026-04-07、page updated 2026-05-28。入力自体の端末内処理と、更新等の通信、performance/utilization metricsを区別している。利用者への説明・必要同意はアプリ提供者側の責務。例示にはusage/session/inference、app/media characteristics、system/version等があるが、固定Web版の送信schemaとは同一視しない。

installed READMEのPrivacy Noticeは行212、更新日2026-06-05は行214。行216–219は入力の端末内処理、行221–224はmetricsのGoogle処理、行226–227は適用法上必要なinformed consent責務。[公式同README](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md)にも同じ説明がある。masterはmutableなので固定installed hashを併記する。

「人物調整を選ぶ」「招待された」「画像利用許諾がある」「人工QAがPASS」は、Googleのmetrics処理への適法な説明/同意の代用ではない。対象地域、データ管理者/処理者、処理目的/項目、保存・移転・撤回/拒否時挙動、同意が必要となる条件の判断は責任者レビュー未了。SDK package licenseとプライバシー義務は別。ここで法的要否を確定しない。

## 固定SDKコード上の具体的通信

一行minified `vision_bundle.mjs`は下記symbol/textをlocatorとする。同梱source mapの`vision_js.js`にも同じ経路があるが、元の完全なTypeScript/protobuf定義ではない。

| locator / 段階 | STATIC_CONFIRMED | UNKNOWN / 注意 |
| --- | --- | --- |
| `qh`内`new Dh(t.C(),e,r)` | task初期化でloggerを自動生成。`Sa()`はWASMの`_mediapipeLoggerGetEncodedApiKey`を参照 | key値・WASM内部の全通信は未収集。keyをdoc/HAR公開しない |
| `Dh` constructor | FaceLandmarker task enum16、IMAGE mode enum11、version文字列1.0.1、platform分類、空文字field、performance clockを設定 | 空文字fieldの正式意味はUNKNOWN。Workerでは`typeof window==='undefined'`のplatform値0経路。正式packet schemaと実値は未復号 |
| `setGraph`→`m?.ya()` | 初期化時間相当をmetrics queueへ追加 | inferenceがno-face拒否でも初期化metricsはqueue化され得る |
| `Qu` / `Dh.za` / `Mh` | CPU/GPU別inferenceカウンタ、開始/終了performance clock、平均/最大相当時間、未終了相当回数、期間差分を集計。30秒経過条件でqueue更新 | 写真pixels/人物UUID/landmarksのmetrics payload含有は本経路で確認していない。無含有の完全証明でもない |
| `Fh` constructor / `flush` | `setInterval(flush,60000)`、queueが非空ならPOST。empty queueなら送らない | SUITE操作が60秒以上続く場合等の実timer/flush結果はNOT_RUN |
| `Fh.flush`→`Eh.send` | `https://odml.pa.googleapis.com/v1/log`、POST、`Content-Type: application/x-protobuf`、`x-goog-api-key` header、10秒timeout、`withCredentials:false` | payload byte/schema、実header、IP/transport由来metadata、CORS preflight、受信/保持/リージョンはUNKNOWN。falseは無metadata保証ではない |
| `TaskRunner.close` | `xa()`で終了解析queue追加、logger `close()`でinterval停止とflush | **closeはtelemetry opt-outではない**。SUITE現在facadeはこのcloseを呼ばずWorkerをterminateする |
| sender失敗branch | logging error化、queue破棄、interval停止 | 試行済データを取り消す処理ではない。CSP拒否後の実挙動は未観測 |

同moduleの文字列検索では`fetch(`が3経路（上記sender、graph URL、modelAssetPath）、`XMLHttpRequest`/`sendBeacon`/`WebSocket`は未検出。単一module文字列のabsenceをSDK全体/WASM/本番のabsenceに拡大しない。WASM loaderのURL文字列には説明・issue link等があり、URLの存在だけで送信先と判定しない。

installed `vision.d.ts`行2826には`enableLogging(options: TaskRunnerOptions)`宣言がある。しかし行2835–2838のoptionsは`baseOptions`だけで、停止/consent optionは示されていない。runtime `vision_bundle.mjs`に`enableLogging`同名文字列がなく、確認済みpublic opt-out APIは **UNKNOWN**。未検証propertyを渡す、内部minified loggerを書き換える、console log抑止で解決済みにする、SDKを置換することは本調査では行わない。

## SUITEでの取得先と停止境界

| 対象 | sourceで確認した経路 | 実行/通信境界 |
| --- | --- | --- |
| LibRaw | `raw.mjs`がsame-origin `/vendor/libraw/libraw.wasm`をfetchしbytesを`LibRaw.initialize`へ渡す | 固定wrapper 1.1.1。Emscripten loaderに一般fetch/XHR取得経路があるが、調べた`dist/libraw.mjs`に外部HTTP URL literalはなし。SDK全体の無通信保証ではない |
| face model | `faces.mjs`がsame-origin `/runtime_assets/face_landmarker.task`をfetch→hash→`modelAssetBuffer` | 公式storage URLへruntime fallbackはsource上なし |
| face WASM/loader | `FilesetResolver.forVisionTasks('/vendor/mediapipe/')` | self配信。SDKのmetrics endpointはこのasset取得先と別 |
| real-person UI/session | default Privacy gateが解析・portrait再描画/Finalを拒否し選択を無効化 | 保存済Original/Recipe/historyは保持。facade自体は低レベル診断APIで、同意実装ではない |
| facade生命周期 | 各callにfresh Worker。結果/失敗/abort/dispose/timeoutで`Worker.terminate()`、default timeout120秒 | 将来のWorker timerは止まるが、開始済のnetwork request/受信を取り消した証明ではない。120秒は60秒flushより長い |
| local-server policy | HTML/worker静的responseのCSPは`connect-src 'self'`、`worker-src 'self' blob:`、referrer-policy no-referrer | 外部fetchを構造的に禁止する設定。**blocked attemptとattempt無しを区別**。本番invite originのheader・worker継承/response・proxy経路は別確認 |

現在の短い人工診断でrequestが見えないことから「SDKは送らない」を導かない。逆にlogger実装があることだけで「SUITEが写真pixelsを送信した」とも言わない。CSPを外したりGoogle endpointをallowlistに加えて、本物画像で送信を調べない。

## ライセンス・モデル配布の独立境界

MediaPipe installed packageはApache-2.0と宣言。2026-10-03再確認では`dist/web/licenses/MediaPipe/Apache-2.0.txt`、`package.json`、privacy入り`README.md`が存在。Apache本文SHA256は`8707eef0533987efc5b155d64761eeb6e20793f50b9bd1a68dad1cf4719d0ed8`。旧`WEB_PROCESSING.md`の「distのMediaPipe license未提供」は**以前の読取りcheckpoint**で、現在の三file追加を否定しない。installed tarball直下にはLICENSE/NOTICEがなく、必要NOTICE/全含有物の対応・本番配布承認は未了。[公式source license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)参照。

モデル固定URLは`https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`。bundle一覧はFaceDetector、FaceMesh detector、geometry metadata、blendshape weights。公式[Face Landmarker model表](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)がリンクする三model cardにApache表記を確認したことと、固定version/hash全構成物の対応・必要notice・本番hosting承認を完了したことは別。geometry metadataも含め **MODEL_DISTRIBUTION_REVIEW_REQUIRED**。blendshape出力disabledでも配布binaryの確認は省略しない。

LibRaw wrapper MITとWASMのLibRaw LGPL2.1 OR CDDL1.0は別。配布にはwrapper MIT、LibRaw COPYRIGHT/LGPL/CDDLのfileがある。license選択、対応fork/source revision/build材料、third-party notice、対応source提供方式は責任者承認未了。これは顔SDKの調査待ちを非人物実装/ローカル試験の前提にする理由ではないが、一般公開binary配布の独立確認項目である。詳細は`WEB_PROCESSING.md`既存境界を維持する。

## 最小inspectionと解放条件（未実施を成功扱いしない）

1. main管理の**人工RGBA/NONRAW限定**buildでsource/bundle/model/WASM hash、browser/version、origin、CSP/worker response header、実行時刻、実行scopeを固定する。人工21結果を変更せず、新しいnetwork観測を別Evidenceにする。
2. browser Network/worker対象を含むtraceとCSP違反を記録し、(a)非人物decode/global/Crop/encode、(b)人工flat no-faceの順に確認する。成功request、blocked attempt、asset取得、SDK評価の有無を区別。非人物では顔module initializer/model取得が起動しないことを確かめる。RAW成功は別の実RAW QAで、16zero拒否を代用しない。
3. 60秒timerとSDK.close flushは短いfresh-Worker診断だけでは観測できない。必要ならmainが承認した**独立・人工入力専用のSDKライフサイクル診断**でqueue/送信呼出前breakpointを用い、外部送信を遮断したままbodyのサイズ/fieldを観測する。source凍結/CSPを勝手に変更しない。診断経路と通常facadeを区別する。実network bytesが出ていなければ「attempt/payload構築のみ」と記録する。
4. SDK公式protobuf/schema・version対応sourceを確認し、observed payloadと照合。SDK key、auth cookie、token、識別子入りHARは公開せずredactする。OS/app/version/画像特性/回数/時間と、pixels/landmarks/人物UUIDの各項目を個別にCONFIRMED/NOT_OBSERVED/UNKNOWNへ分類する。未観測は非送信の証明ではない。
5. 停止方法は、公式に確認されたopt-outまたは承認された通信遮断・SDK非起動境界について、deny/abort/timeout/終了時も含め実効確認する。Worker終了のみ、console silenceのみ、型宣言のみでは解放しない。Googleへの確認が必要なら責任者が照会し、本エージェントは無断で外部問い合わせを送らない。
6. 固定SDK/model配布条件、実際の処理項目/送信先/保持/移転、説明文と必要同意・拒否/撤回時の機能境界を責任者が承認し、人物Privacy BLOCK解除を明示的に指示した後に真人物QAへ進む。同意UIを架空実装しない。人物以外のWeb招待試用作業は並行継続する。

## 現時点の判定

STATIC_TRANSPORT_FOUND。MEDIA_PIPE_PUBLIC_OPT_OUT_UNKNOWN。NETWORK_TRACE_NOT_RUN。EXACT_PAYLOAD_UNKNOWN。MODEL_DISTRIBUTION_REVIEW_REQUIRED。REAL_PERSON_PRIVACY_BLOCK。REAL_RAW/REAL_PERSON_VISUAL_QA_NOT_RUN。

main管理の人工browser21は機構/拒否試験であり、privacy合格ではない。本docは調査checkpointで、全Web試用を止める判断・新SDK/provider選定・製品code修正を含まない。
