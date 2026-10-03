# Web実RAW入力の必要条件と試験範囲

更新: 2026-10-03。製品source/Sites checkout/公開/既存Evidenceは編集しない。顔SDK停止を維持。multipart Node試験の人工bytesは転送と再開の契約試験であり、RAW・写真・画質合格ではない。

## 現在の実入力

既存`raw-harness.mjs`のDEFAULT_RAW_ROOTは`C:/Users/user/Documents/Codex/2026-10-03/SUITE_TEST_DATA/RAW`。2026-10-03初回read-only `Test-Path -LiteralPath ... -PathType Container`はFalse。その後mainが空directoryを準備した通知を受け、再読取りで **True、100/500/1000各directoryのfileCount=0** を確認した。checkout外pathである。新しい別のユーザー指定pathは本agentで未確認なので、mainが別指定を受けている場合はそのpathを正とし再確認する。

利用可能な実RAWは現時点0枚。再確認後のdirectory file走査件数は各0、有効camera RAW decode件数は **未測定(null)**。空directory作成は素材提供/RAW QA成功ではない。100/500/1000実RAW・実RAW1枚のWeb lifecycleは **NOT_RUN / INPUT_REQUIRED**。AはfolderやDummy RAWを作らず、公開サンプルや実人物を無断取得/送信しない。

## 最小1枚に必要な情報

- 本物のcamera RAW原本と利用・加工・テスト許諾。第三者撮影/顔/施設等の権利、Sites/R2への保存が許諾範囲内かを確認する。RAW形式へのrename JPEG、人工header、embedded thumbnailを代用品にしない。
- checkout外の絶対path、実filename/拡張子、file bytes、SHA256、camera make/model、format/圧縮、撮影向きを記録する。公開Evidenceにはprivate path/人物情報を必要以上に出さない。originalとupload用copyのbyte同一性を確認する。
- 現Web decoderのguardは **file<=134,217,728bytes(128MiB)**、LibRaw stored sensor<=24,000,000pixels、raw_count=1、flip0/3/5/6、pixel aspect1。広告上24MPでもstored sensorの余白がcapを超えれば拒否。1frame未満/複数frame/不明向き/非square aspectをdummyで通さない。
- processed full imageはRGB bitmap/3channels/8bit・length整合/24MP以下。camera white balance要求、sRGB8bit、halfSize0、thumbnail fallback禁止。候補拡張子ARW/CR2/CR3/NEF/NRW/DNG/RAF/RW2/ORF/PEF/SRW/RAWはcamera/圧縮対応保証ではなく、実LibRaw decode provenanceで確認する。
- browserはWorker/OffscreenCanvas/WASM/cryptoを実利用できること。128MiB/24MP guardはpeak memoryやphone安定性保証ではない。Cloudflare Worker128MBとbrowser memoryは別。初回はsmall RAW/global-onlyから始める。

処理根拠はfrozen `apps/web/src/processing/raw.mjs`、`pure.mjs`と[WEB_PROCESSING.md](WEB_PROCESSING.md)。対応decoder/SDK licenseとR2/Sites本番配布の確認は[SITES_LIMITS_REVIEW.md](SITES_LIMITS_REVIEW.md)、[WEB_SDK_PRIVACY_REVIEW.md](WEB_SDK_PRIVACY_REVIEW.md)の独立条件を維持する。

## global-onlyの最短実RAW往復

1. 許諾済原本のbytes/SHAを記録し、ローカル原本を保持する。
2. 実browserで原本import→full LibRaw decode→未編集Proxyを確認。decodeエラーは失敗として保存し、PNG/JPEG previewでRAW成功を代用しない。
3. global露出/contrast/saturation、対応ratio/free Cropとrotationだけを変更。顔解析ボタン/portrait recipeを使わない。8bit sRGB JPEG/PNG・metadata除去・browser DPI保証なしという現制約を記録。未対応TIFF/16bit/physical print要求は拒否のまま。
4. owner-bound multipart upload開始→8MiB part転送→中断/同Asset再開→正常part不変/壊れたpartだけ再送→complete→server actual bytesのsize/SHA検証を確認。Sites endpoint/memory/actual storageの確認はmainが行う。ETag/client申告SHA/HTTP200だけでCloudSafeにしない。
5. Recipe保存→reload→同Asset/Original/hash/revisionで復元→FinalのOriginal取得/full再decode→同じRecipe一回適用→JPEG/PNG書出し。
6. raw原本・upload object/readback・Final後原本のSHAを比較し、原本不変、Proxy/Final crop/回転/色/二重適用差、対象外pixel、保存/reload intentをEvidenceに残す。browser/実camera/format/元寸法/出力寸法/処理時間/失敗を記録。

失敗・network interruption・容量不足・checksum mismatch時は旧正常part/Recipe/原本を保持する。upload完了だけでOriginal evictionはしない。未登録OriginalRecoveryはdesign-only/NOT_IMPLEMENTEDを維持し、この実RAW試験で回復実装済みとしない。

## 人工multipart Node試験との分離

`apps/web/tests/multipart-client.test.mjs`はSitesClient実装をfake HTTPで呼ぶ。人工ArrayBufferのみで、LibRaw/MediaPipe/本物写真を実行しない。検証対象はpart bodyとSHA header、8MiB上限、resume GET、checksum/size一致partだけskip、bad partのみ再PUT、network失敗後のserver uploadID保持と別client再開、complete response checksum、入力ArrayBuffer不変/未detach。server fixtureはSites/R2/D1/ChatGPTの実稼働ではない。

Node PASSは **NONRAW_SYNTHETIC_FAKE_HTTP_MULTIPART_CLIENT_ONLY**。実RAW decode、actual browser fetch/Cloudflare stream、auth/owner、R2 storage durability、D1 transaction、peak memory、原本CloudSafe、Final画質はNOT_RUN。main報告の作者18tests PASSも既存作者/auth導線のEvidenceであり実RAWの代用ではない。

2026-10-03 A実測: `node --test apps/web/tests/multipart-client.test.mjs` **12 PASS / 0 FAIL / 0 SKIP**。新規`apps/web/tests/results/multipart-client-01.json`に固定client/API hash、Node版、case別結果を保存。最大実転送fixtureは8MiB+37bytesで、128MiB全転送を測定したとは言わない。fake server状態はtest内memoryで保持し、新clientからの再開を検証しただけで、実D1/R2 restart durabilityではない。初実行前にmainのoctet header修正が入ったため、存在しない旧red結果を作らない。

## 100/500/1000の既存runner

実データはcheckout外rootの`100/`、`500/`、`1000/`へ各セットとして提供する。許諾/原本copy/hash確認後に既存runnerでmanifestを作る。manifestはcontainer/header/checksumの資格確認で、camera decode/Final品質合格ではない。

```powershell
node scripts/raw-harness.mjs manifest --root 'C:\Users\user\Documents\Codex\2026-10-03\SUITE_TEST_DATA\RAW' --sets 100,500,1000
node scripts/raw-harness.mjs pipeline --root 'C:\Users\user\Documents\Codex\2026-10-03\SUITE_TEST_DATA\RAW' --sets 100,500,1000
```

上記コマンドは本doc作成時 **未実行**。Native/real pipeline adapterの接続条件は既存[FACE_BRIGHTNESS_NATIVE_QA.md](FACE_BRIGHTNESS_NATIVE_QA.md)を参照する。Mac RAW adapterはFace Brightnessを呼ばずfull lifecycle未接続の限界がある。Mac→実RAW→iPhone/iPadそれぞれのGateをWeb Node試験へ流用しない。userが新rootを指定した場合はdefaultpathを黙って使用せず、元runnerのcheckout外path guardを通す。

現状態: **RAW_INPUT_REQUIRED / REAL_RAW_NOT_RUN / REAL_PERSON_PRIVACY_BLOCK**。実転送に進むための最小入力は「許諾済camera RAW1枚＋checkout外path＋camera/format情報」であり、人工fixtureを追加してこの不足を埋めない。
