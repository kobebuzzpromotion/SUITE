# Web processing — 工程A

2026-10-03。状態: IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED。実RAW、実人物モデル推論、Proxy/Final視覚比較、ブラウザencode、実メモリ/中断QAは NOT_RUN。Apple112 Native NOT_RUNと凍結Windows154回帰のEvidenceは変更しない。Web成果をMobile合格へ転記しない。

## 接続interface

`apps/web/src/processing/index.mjs` は `createProcessing({workerURL='/processing-worker.js',timeoutMs=120000})` をexportする。返却値の全操作はPromise:

- `decodeRaw(buffer,{signal,mode:'proxy'|'final'})` → `{pixels,metadata,provenance}`。
- `makeProxy(pixels,maxEdge=1600)` → pixels。
- `detectPeople(pixels,{signal})` → detections。anchorはnormalized lower-left、maskは`[{x,y}]` normalized upper-left、completeは検出landmarksの幾何条件だけを表す。
- `render(pixels,recipe,{detections,signal})` → pixels。`recipe`は既存v1外形。実Workerはportrait時に入力pixelsを毎回再検出し、渡されたmaskを採用しない。
- `encode(pixels,{format:'jpeg'|'png',quality:0.01..1,settings?,signal})` → Blob。
- `dispose()` → 活動中Workerを終了し、後続処理を拒否。

pixelsは `{width,height,data:Uint8ClampedArray}` のRGBA8。Facadeは元buffer/pixelsの専用copyをtransferし、呼出側原本とunedited baseをdetachしない。1操作ごとにclassic Workerを作り、終了/失敗/abort/timeoutでterminateする。同期WASM/Visionの途中でもUI側terminateで止める。Worker内のsignalはcloneせず、pure関数では独立abort試験を行える。連続操作の同時数はsession側で制限する。Workerが新しいためモデル/WASMを再取得/初期化するコストがあり、性能合格を主張しない。

`worker.mjs`がbundle entry。既存backend `photo-policy.ts` の `validateRecipe`、`crop-export.ts` の `resolutionAssessment/validateExportSettings` を直接importする。別のRecipe/Crop schema validatorを作らない。pure演算関数のvalidator引数は必須で、prod Workerが共通validatorを渡す。

## decodeとprovenance

`@colorhythm/libraw-wasm` 1.1.1を実APIで使用する。`open → unpack → dcrawProcess → dcrawMakeMemImage` のbitmapだけを受理し、`unpackThumb`や埋込JPEGを呼ばない。PNG/JPEG/GIF/WebPのsignatureをRAWとして拒否し、LibRawが読めないものはエラー。半解像度decodeは使用せず、ProxyとFinalのbaseは同じfull RAW decode条件。

出力は8bit sRGB、明示sRGB gamma(1/2.4,12.92)、camera WB要求、autoBrightなし、bright1。WB未収録時はLibRawの既定fallback policyが残るため、厳密as-shot再現と主張しない。LibRaw既定user_flip=-1の原本向き処理を使用し、処理済bitmapへ再回転しない。flip0/3/5/6以外、非square pixel aspectは安全拒否する。EXIF鏡像、特殊カメラ/DNG、向きの実RAW証明は未実施。

provenanceにはpackage版、実LibRaw version、実WASM SHA、実Original SHA、decode path、mode、8bit/colorspace/gamma/WB policy、向きと座標規約、処理順、licenseを含む。モデル推論結果はモデルSHA/package版/threshold/face capを含む。render返却pixelsにもoptional provenanceを付け、fresh内部推論のmodel情報/detected anchors/input寸法/処理順を記録する。原本SHAの保存済Asset照合と固定revision+RecipeのFinal照合はmain session/server責務で、decodeのself-hashだけで代用しない。

wrapperはMIT、LibRawはLGPL2.1 OR CDDL1.0（含有third-party notices別途）、MediaPipe packageはApache2.0。mainが配布vendor/license noticeを保持する。モデルの個別配布許諾とモデルSHAはmain管理。モデル/WASM routeは `/runtime_assets/face_landmarker.task`、`/vendor/mediapipe/`、`/vendor/libraw/libraw.wasm`。外部CDN fallbackはない。

## 人物geometryとMask

MediaPipe tasks-vision 1.0.1 FaceLandmarker、CPU/IMAGE、numFaces8、detection/presence/tracking threshold0.7。1..7検出だけ受理し、0と8以上は欠落/上限飽和として拒否する。全468以上landmarksのfinite/in-frame、face ovalのframe余白と最小サイズ、polygon非自己交差、非重複bboxを要求する。`complete:true`は全被写体の発見保証・遮蔽なし保証ではない。モデルが検出しなかった人の存在を演算から証明できないため、実1/2/3人以上のfixtureが必須。

公式FACE_LANDMARKS_FACE_OVAL connectionから順序付きpolygonを構成。顔輪郭限定Maskであり、Apple person-instance segmentationと同等ではない。保存target全人数とfresh検出人数の一致、双方のbbox非重複、各anchor IoU>=0.5の候補厳密1つ、候補再利用禁止を要求する。nearest/first、部分inventory、曖昧対応はNOAPPLY。UUID/asset/hash/UTC/全inventory継続は共通Gateとsession保存境界を使用する。

Maskはpolygon外とbbox外で0、polygon内の境界から8%の小さいbbox辺長をinward smoothstep featherにする。元linear RGBとEV-adjusted RGBをMaskでblendし、target間が非重複のため同じ画素へ累積しない。人物再同定や背景segmentation、Skin/Eyes等は未実装。

## 共通pixel処理と制限

immutable unedited base → face EV → global EV → contrast → saturation → rotation → crop → encode。Proxy/Finalとも同一`renderPixels`を使用し、非固定順のprocessingOrderは拒否する。global EVはlinear RGBに2^EV、contrastはlinear0.5中心、saturationはRec709 luma係数。Apple CoreImageとの画素等価は未検証でありengineを区別する。完全neutralの画素はbyte-exact copy。clippingはRGBA8出力時に生じ、RAW16bit高精度出力ではない。

rotationは90度刻み、正90=CCW。portrait処理は元upright座標で一回のみ。crop_rectは既存portable契約のnormalized upper-left、recipe rotation後。共通resolutionAssessmentでratio/available寸法を検証。free/ratio Cropのみ、width_mm/height_mm付き物理print出力は `UNSUPPORTED_WEB_PHYSICAL_OUTPUT` で拒否（印刷寸法resize/DPI出力保証なし）。Proxy縮小はnearest-center sampleで、画質/aliasing合格ではない。

入力<=128MiB、stored sensor/processed pixels<=24MP、RGBA長さ一致。これらは試験中のfail-closed capであり製品対応保証・実peak memory測定ではない。WASM memory、inputcopy、RGB/RGBA、render/rotate、canvas、modelが並存しうる。OOMの安全停止/端末温度/熱/同時処理は実ブラウザQAが必要。

encodeはOffscreenCanvas browser JPEG/PNGのみ、8bit sRGB intent、元metadataはコピーしない。JPEGはalphaを白にflatten。optional既存ExportSettingsを渡した場合、共通validator後にformat整合、8bit/sRGB/no TIFF compression、metadata remove、requested_dpi96だけを受理する。qualityは0.01..1（既存1..100はsessionで除算）、settings指定JPEGは両quality値一致を要求。settings省略はbrowser-native encodeでありprint DPI/ICC埋込/元metadata保持の約束ではない。ブラウザのDPI tag/ICC/encode実装差はNOT_RUN。TIFF/16bit/AdobeRGB/metadata preserve/300dpi印刷は拒否か明示未対応、UIで成功保証しない。

## 独立試験用export

Node-safe `pure.mjs`: assertPixels/assertInputBuffer/checkAbort、validatePolygon/validateDetections、intersectionOverUnion/reconcileTargets、pointInPolygon/polygonWeight、srgbToLinear/linearToSrgb、makeProxyPixels、rotateCropPixels、renderPixels。geometry checksはレンダー安全条件であり共有Recipe schema Gateの置換ではない。テストの生成RGBA/polygonは数値機構の証拠のみ、人物AI・RAW・画質証拠ではない。

A回収時のコマンド結果:

- `node --check` をprocessingの6mjs全部に実行: PASS（syntaxのみ）。
- `node --test apps/web/tests/processing-safety.test.mjs`: 17 PASS / 0 FAIL / 0 SKIP。独立C authored試験をAが最新pure sourceで再実行。すべてsynthetic演算だけ。
- read-only native esbuild browser bundle `write:false` を2回実行: sandboxの上位directory access deniedでentrypoint解決前に失敗。tsconfigRaw/absWorkingDir追加でも同じ。後続main報告ではesbuild-wasm/Worker IIFEへ変更してbuild PASS、実ブラウザEditor UI確認済み。Aが独立再実行したbuild結果ではなく、実RAW/モデル/画質の成功証拠ではない。

Workerはclassic `new Worker(workerURL)`。main esbuild出力をIIFEへ合わせる。LibRaw shipped moduleはNode条件内にdynamic `import('module')` を含むため、browser bundlerで当該Node-only moduleをexternal指定する可能性がある。IIFEのimport.meta.url warningは明示WASM ArrayBuffer初期化で既定payload URLを使わない設計だが、実loader成功を証明しない。MediaPipe loaderがclassic importScriptsを必要とするSDK条件も実Workerで確認する。

## 必須未実行Gate

許諾実RAW1枚のimport→Proxy→人物検出/EV→save→reload→原本再decode/fresh検出→固定Final→SHA不変、1/2/3人以上/部分/重なり/向きfixture、PC/iPad幅画像、背景/別人物/境界/二重適用/ProxyFinal差、unsupported settings/refusal、WASM/model欠落/abort/timeout/OOM/容量不足はNOT_RUN。Recovery自動検出/再登録、本番Auth/Cloud/Sync/Billing、50GB事業Gateは未接続/別工程。素材なし・モデルfetch成功・生成画素PASSは実RAW合格ではない。

一次資料: [LibRaw processed output API](https://www.libraw.org/docs/API-CXX.html)、[LibRaw orientation/color/gamma](https://www.libraw.org/docs/API-datastruct.html)、[MediaPipe Web FaceLandmarker](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)。ローカルinstalled版README/.d.ts/実bindingsと照合。資料はSUITE実画像Evidenceではない。

## 追加: 実ブラウザNONRAW / 人工RGBA診断UI

新規`processing/qa-page.mjs`と`processing/qa.html`だけを追加し、旧6processingは凍結を維持。mainがqa-pageを `/qa.js` へbundle、HTMLを `/processing-qa.html` へcopy/serveする。`#run-processing-qa` →21件の順序付き `#qa-results` → `#qa-download` JSON download anchor。`#qa-before`/`#qa-after` は人工gradientのPNG表示であり写真ではない。`#qa-json`に同じ観測reportを表示し、PC/iPad幅で読める独立診断UIとする。

本物の`createProcessing`を使用し、Workerをmockしない。人工RGBAだけでneutral byte一致、EV±4/contrast0,4/saturation0,4/組合せの独立数値oracle（最大channel差1以内）、base再render決定性、Proxy寸法、PNG signature/実browserdecode/pixel完全一致、JPEG signature/実browserdecode/寸法を調べる。JPEG pixel等価・ICC/DPI/元metadata保持は合格項目ではない。人工baseのSHA不変はRAW原本SHA不変と読み替えない。

16 zero bytesは明示NONRAW。実`decodeRaw`で `LibRawError` / numeric code `-100009` が出た場合だけ期待拒否のPASSにする。このerrorはWASM初期化後の実decoder.openから来ることをソース照合できるが、decoder成功ではなく、RAW入力・camera処理の合格ではない。404、WASM初期化失敗、別error、予想外のdecode成功は当該診断FAIL。

flat人工128×128 RGBAで実MediaPipe model/WASMを初期化してdetectする。`MISSING_OR_SATURATED_FACE_INVENTORY`だけを期待拒否PASSにし、他errorを成功扱いしない。portrait rendererにも人工fixture UUID/ゼロhashとsynthetic polygonを渡すが、旧Workerがmaskを無視してfresh model推論し同じno-face拒否となることを調べる。fixture UUID/hashは登録済Original bindingの証拠ではなく、UI/Evidenceにも人工placeholderと明記する。顔補正の実pixel成功、partial/saturated実顔精度、本人性はこの試験では未確認。

ほか、24MP超pixel宣言の事前guard（大容量allocation/stressなし）、開始済fresh Workerのabort/人工base保持、abort後の別fresh Worker成功、TIFF/range拒否を確認する。cap検証はメモリ圧力測定ではない。worker/canvas不在はNOT_RUN、予想外errorはFAIL。JSONには各実時刻/経過/環境/実resource manifest/人工hash/期待拒否details/観測結果を保存し、real RAW/real face/Apple/Recovery等は常に別NOT_RUNとして残す。JSONのPASSはこのNONRAW_ARTIFICIAL_RGBA_BROWSER_WORKER_ONLY scopeに限定する。

A追加コマンド `node --check apps/web/src/processing/qa-page.mjs`: PASS。診断ボタンの実ブラウザ21件はA作成時NOT_RUN、main統合後の実観測reportを正とする。HTML/JS作成、manifest取得、画像表示だけでは当該21件の実行PASSにしない。DB/API/原本保存/旧Evidenceをこの診断で変更しない。

## 最終幾何修正: Proxy丸めと同一Crop Recipe

`17×11 → maxEdge8 → 8×5`のように整数丸めでProxy aspectが微妙に変わる。Crop比率をその丸め後寸法で厳密検証すると、正式なOriginal基準RecipeでもProxyだけ拒否する。元Recipe/Crop契約は変更せず、未編集Proxy pixelsにoptional `sourceWidth/sourceHeight`（canonical upright decoded-base寸法）を対で保持する。継続縮小でも最初のcanonical寸法を維持する。省略時だけ自分のwidth/heightをfull-base基準とする。

sourceframeはsafe integer、24MP以下、actual Proxyより両辺が小さくないことを要求し、片側欠落/undefined/null/不正値を拒否する。prototype inherited値はreferenceとして使用しない。これはbitmapのreference metadataでありRecipe/DB/networkの新schemaではない。保存済Asset/Originalに対する寸法の信頼性確認はsession/cache境界の責務で、この整数guardだけで原本との一致を証明しない。

`renderPixels`は未編集baseのsourceframeをcolor処理後の同じpixel geometryへ渡す。`rotateCropPixels`は **shared resolutionAssessment(canonical upright dimensions, 同じcrop)** によって正式ratio/rotation/Cropを検証し、その同じnormalized upper-left矩形をactual rotated Proxy/Final surfaceへfloor投影する。Proxy専用Recipeへ座標変換したり、Finalを別Recipeへ置換して差を隠さない。投影幅/高さが1pixel未満なら拒否する。物理print寸法の未対応拒否は維持する。

crop/rotation処理結果は表示/encode専用のprocessed pixelsであり、sourceframeを返さない。これを元の未編集baseとして再renderすると二重処理になるため、sessionは常に保存したunedited Proxyまたは新しくdecodeしたOriginalを入力する。旧cacheにcanonical sourceframeがない場合、推測やRecipe修正ではなく同じOriginalからProxy再生成、または信頼済upright metadataとの照合後にreferenceを付与する必要がある。sourceframeはEXIF/RAW transform済画像の元upright寸法であり、sensor stored dimensionsではない。

actual Proxy/Final crop pixelのaspectはfloor丸めによって端数差が残る。実際の画素ratio完全一致・画質/境界一致を合格と宣言しない。寸法と丸め差をEvidenceに残し、実画像GateはNOT_RUN。

修正後 `node --check pure.mjs`: PASS。独立Cのsourceframe PX21–23 PASS報告、A再実行 `node --test apps/web/tests/processing-safety.test.mjs`: 23 PASS / 0 FAIL / 0 SKIP（すべてsynthetic）。Aの追加read-only inline確認は17×11→8×5、1:1/3:2×rotation0/90/180/270の8組で同一RecipeをProxy/Finalへ適用できた。実RAW/実人物の確認ではない。

main報告の実ブラウザNONRAW診断21 PASSは **この修正前** のbuild。sourceframe修正後はmainが再bundle・実ブラウザ再runするまで診断結果を最新buildへ転記しない。sessionがCrop設定時にcanonicalではなくrounded Proxy寸法からrectを作ってしまう不整合はmain/Cの統合修正対象（Aはpure/docのみ編集）。

## 最終read-only追補: ライセンス / Privacy / 実RAW実行境界

2026-10-03のinstalled package・配布directory・公式一次資料を読取り確認。追補のみでprocessing/build/session/UI/Evidenceを変更しない。以下は配布前の技術点検であり、法務承認や本番配布可能宣言ではない。過去段落のNOT_RUNは実画像Gateを指し、人工入力のブラウザencode/モデルno-face拒否の実行結果とは分離する。

### 確認できた版・noticeの範囲

| 対象 | 確認根拠・状態 | 未確定 / 配布BLOCK |
| --- | --- | --- |
| `@colorhythm/libraw-wasm` 1.1.1 wrapper | installed package.jsonはMIT。`dist/web/licenses/LibRaw-wrapper-MIT.txt`が存在しcopyright/permission本文を提供 | wrapper MITをWASMの全含有物のlicenseと読み替えない |
| 含有LibRaw | installed `LibRaw/COPYRIGHT`はLGPL2.1 OR CDDL1.0。配布 `licenses/LibRaw/COPYRIGHT`, `LICENSE.LGPL`, `LICENSE.CDDL`が存在。dcraw由来/DCB/FBDD/X3F/Adobe DNG SDK由来のattribution記載あり | どちらのlicenseを採用するか、実WASMに対応するfork/source revision/build材料の提供方法、全第三者notice適合は未承認。notice3fileの存在だけでbinary配布適合PASSにしない |
| `@mediapipe/tasks-vision` 1.0.1 | installed package.jsonはApache-2.0、official repo LICENSEもApache2.0 | 読取り時点のinstalled tarball直下にLICENSE/NOTICEファイルなし、distのlicensesはLibRaw4fileだけ。mainのApache本文/必要notice追加は後続再確認対象で、未提供を既済と記さない |
| `face_landmarker.task` float16/version1 | official storage URLと配布SHAを確認。公式guideがリンクするFaceDetector/FaceMesh-V2/Blendshape各model cardにApache2.0表記あり | SDK package licenseだけではweight/bundleの権利を証明しない。実bundle版・全構成物・model card対応と配布notice/本番利用条件の確認が未完了。MODEL_DISTRIBUTION_REVIEW_REQUIRED |

確認した配布WASM SHA256: `c4cb97a7e4372da41a1ff6ec6e1146f38deb125b733b8bbb2e9c52727953aba8`。モデルSHA256: `64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff`。モデルURLは `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`。ZIP一覧の読取りで `face_detector.tflite`, `face_landmarks_detector.tflite`, `geometry_pipeline_metadata_landmarks.binarypb`, `face_blendshapes.tflite`を確認。checksumはartifact同一性の証拠であり配布許諾ではない。blendshape出力をdisabledにしても含有binaryの配布権確認は省略しない。

LibRawの[公式license説明](https://www.libraw.org/about)はdual-license選択を説明する。local LICENSE.CDDL §3.1/3.3、LICENSE.LGPL §4/6にはsource・notice等の条件がある。対応するsource/提供方式/選択条件を確認せず、単なるupstream homepage linkや二つのlicense本文copyを完了としない。最短確認は、固定npm/WASM hashから正確なfork commit/submodule/build optionsを追跡→配布対象のlicense方式を責任者が決定→対応source・必要notice・取得方法の実到達を記録すること。MediaPipeについても固定1.0.1の[公式LICENSE](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE)と必要NOTICE/含有物の対応を確認し、配布コピーの存在を再点検する。ここで法的適合を保証しない。

モデルの一次資料は[公式bundle表](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker)、[FaceDetector card](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf)、[FaceMesh-V2 card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20MediaPipe%20Face%20Mesh%20V2.pdf)、[Blendshape card](https://storage.googleapis.com/mediapipe-assets/Model%20Card%20Blendshape%20V2.pdf)。三つのApache表記の観測は記録するが、current/latestページと固定version1全bundleの法的対応確認・本番公開承認を代行しない。最短確認は固定URL/hashに対応する公式配布条件/全構成物licenseを保存→配布notice/利用制約を責任者がレビュー→本番hostingの配布対象を承認すること。現loopback QAと本番配信は別Gate。

### 独立BLOCK: PRIVACY_REVIEW_REQUIRED

installed `node_modules/@mediapipe/tasks-vision/README.md` §Privacy Noticeは行212、更新日は行214（2026-06-05）。行216–219はinputのon-device処理、行221–224はperformance/utilization metricsのGoogle処理、行226–227は適用法に従うinformed consent責務を説明する。installed README SHA256は `8326ed0beb1983b69cccb190937c2e368388969cb3ade06010fe51e0d5339308`。同じPrivacy Noticeの[公式README source](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/web/vision/README.md)を確認したが、master URLはmutableなのでinstalled hash/固定package版と併記する。

[公式MediaPipe規約](https://developers.google.com/edge/mediapipe/legal/tos)（modified2026-04-07、page updated2026-05-28）は入力自体の端末内処理に加え、更新等のための通信、metrics、利用者への説明/同意を記載する。usage/inference/performance、app/input metadata、system environment等の例示がある。ただし**SUITEのこの固定Web SDK実装が実際に何をいつ送信するか、送信先/payload、抑止・無効化の効果は未確定**。写真pixelのuploadが観測されたという報告でも、無telemetryを実証した報告でもない。

現在local-serverのCSPは `connect-src 'self'`で、WASM/model取得routeもself固定。しかし設定の存在は外部送信attemptがないことの証明でも、本番policyの承認でもない。READMEのon-device処理を「外部通信なし」「完全offline」「Privacy Gate合格」と言い換えない。実写真人物をMediaPipeへ渡す準備完了・一般公開可能とは宣言せず、**PRIVACY_REVIEW_REQUIREDを独立BLOCK**とする。mainがsession/bootstrap/UI境界で抑止する作業はAの読取り/追補範囲外で、実接続と拒否の結果はmain/C Evidenceを正とする。

最短確認: 固定SDK/WASM/model/hashのnetwork trace（成功・失敗・更新attempt/CSP violationを含む）→公式privacy/TOSに対する送信内容・抑止方法の確認→データ処理範囲/説明・必要同意/保持方針を責任者が承認→実写人物APIのBLOCK解除を明示的に検証。人工21診断の成功を同意・privacy承認として使わない。

### 許諾実RAW1枚の最小条件と実行前チェック

1. 撮影・利用許諾のある本物のcamera RAW。filename/実拡張子、camera make/model、圧縮/RAW format、元bytes/SHA、撮影向き、stored raw width×heightを記録する。改名JPEG/人工bytes/embedded previewを代用しない。session候補拡張子はARW/CR2/CR3/NEF/NRW/DNG/RAF/RW2/ORF/PEF/SRW/RAWだが、候補表はdecoder/カメラ対応の保証ではない。
2. 実file bytes `<=134217728`（128MiB）、LibRawが報告するstored sensor `<=24000000` pixels、`raw_count===1`、flip0/3/5/6、pixel aspect1、full processed outputがRGB bitmap/3channels/8bit/長さ整合/24MP以下であること。広告上24MPのcameraでも余白を含むstored sensorがcapを超えれば拒否する。multi-frame RAW、未知向き/非square aspectをこの試験で対応済みにしない。実LibRaw version/camera decode可否は有効RAW decodeのprovenanceで初めて確定する。
3. 単一RAWのglobal-only往復と、Face Brightness人物往復を区別する。人物を実モデルへ渡す前にPRIVACY_REVIEW_REQUIREDを解消する。Face試験には十分な大きさの正面寄り/画面内/非遮蔽/非重複bboxの被写体、最低1人・次に2人・3人以上の別fixture、別人物/背景/輪郭の比較領域が必要。コードは1..7検出だけ受理し、8以上/0/部分/追加欠落/曖昧IoU/overlapを拒否する。全人物を発見したことは人手で照合し、`complete:true`から推定しない。
4. Worker/OffscreenCanvas/WASM/model/cryptoを実browserで使用できる環境で、権利確認済fixtureをcheckout外・秘密保持領域に置く。inputcopy、WASM/RGB/RGBA/renderer/canvas/modelが並存し、24MPのRGBA一枚だけで約96MBになる。128MiB/24MPはcap guardであり、peak memory/端末安定性/熱/50GB事業容量合格ではない。高負荷の実peak/OOM/abort/容量不足は別QA。
5. 最短往復は原本checksum→RAW import/decode→unedited Proxy→global/許可後person調整→save→reload→保存済revision固定→Original SHA再確認/full再decode/fresh人物照合→JPEG/PNG Final→source/複製Original SHA再検査。人物の意図・背景/別人物・境界・二重適用・Proxy/Final差の目視/数値Evidenceが必要。原本の保持・Recovery未実装・本番Auth/Cloud未接続はこの往復で解消しない。

### 人工21再runの合格範囲

mainのactualbrowser21再runがPASSでも、人工RGBAとNONRAW16zeroだけであることは変わらない。実Worker global/proxy/PNG/JPEG機構、WASM初期化後のNONRAW拒否、flat画像の実model推論後no-face拒否、人工入力のabort/guardを示すだけ。実RAWdecode成功・本物顔精度・face mask品質・原本Final視覚一致・本番Privacy/配布権はNOT_RUNまたはBLOCK。再run成否/最新source hashはmainのimmutable Evidenceを正とし、旧21 Evidenceの内容を書き換えない。

### 最終最小差分: 顔SDKの遅延評価

Cのsourceレビューで、Workerの旧static `faces.mjs` importは非人物処理でもMediaPipe moduleを評価しうると確認。人物sessionのBLOCKだけでは非人物WorkerのSDK評価を避けられなかったため、worker.mjsのstatic importを除去した。`detectPeople` caseとportrait付き`render` caseだけでdynamic `import('./faces.mjs')`をawaitし、その他のRAW decode/global/Crop/makeProxy/encode caseでは顔SDKを評価/初期化しないsource構造に変更。Recipe/geometry gate、fresh detect、旧mask不採用、Facade APIは変更しない。

同じIIFE bundle内にSDK codeが含まれることと、そのmoduleが評価されることは別。mainは再build後のdynamic module initializerの呼出境界と最新回帰/人工21再runを確認する。Aの `node --check worker.mjs` はsyntaxのみで、runtime/networkの証明ではない。無通信/telemetry無効化を主張せず、PRIVACY_REVIEW_REQUIREDと本番配布Gateは維持する。旧Evidenceは変更しない。
