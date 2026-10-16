# EV3-0757 Desktop Export size — 7下位設定の完了再監査

## 2026-10-04 後続の実Chrome追試（下記の未確認記述より優先）

後続の[実Editor browser fixture](../apps/web/tests/fixtures/export-size-editor-browser-fixture.mjs)で、保存済み合成非RAW Editor→Session→実Worker→Blobの**6画素方式×JPEG/PNG/TIFF×PPI/PPC＝36通り**を実Chromeで全件確認した。各Blobの寸法とJFIF/pHYs/TIFF密度タグ、保存済みRecipeとOriginal SHAの不変、無効UI値・Percentage>100・長辺/幅/高さの拡大拒否を確認。Console error 0、専用bundle試験1/1、後続Web全体1037/1037 PASS。したがって以下の「Percentage/Width/Height JPEG/PNGと全方式TIFFの実Chrome証拠がない」は**追試前の履歴**であり、現時点のUI→合成非RAW Blob組合せの不足ではない。厳密W×H対bounding boxの意味差、実RAW、OS保存、元製品画素同等性、設定の永続化Gateは残り、元候補全要素完了は0扱い。

2026-10-04。対象は SUITE Web の現行ソースと既存試験。製品コード、Recipe 契約、Cloud 設定は変更しない。元候補の全要素完了判定はこの文書では行わない。

## 元資料と判定の境界

Evoto 公式の [Import & Export / Image Size](https://support.evoto.ai/how-to-use-import-export/) は Percentage、Width & Height、Dimensions、Long/Short Edge、PPI/PPC を挙げ、Width & Height / Dimensions を「指定ピクセル寸法」と説明する。ただし、その本文だけでは縦横比保持・拡大・切り抜き・丸め方や具体的な許容範囲は確定しない。SUITE 独自の処理を同一画素・同一仕様とは判定しない。監査の7行は [EVOTO_EXPORT_MATRIX.md](EVOTO_AUDIT/EVOTO_EXPORT_MATRIX.md) の EV3-0757〜0763 に対応する。

共通経路: [editor-ui.mjs](../apps/web/src/editor-ui.mjs) の単写真書き出し設定 → [session.mjs](../apps/web/src/session.mjs) `exportFinal` → 保存済み Recipe/revision・Original SHA/権限を再確認 → Final render 後に [export-size.mjs](../apps/web/src/export-size.mjs) で寸法計画 → [processing/worker.mjs](../apps/web/src/processing/worker.mjs) の `resizeForExport` → `encode`。サイズと密度は**今回の書き出し引数**であり、保存済み写真の Recipe 本体へ記録する値ではない。したがって「保存済み Recipe を固定して Final に到達」は実装されているが、「サイズ/密度設定を Recipe から再読込」は行われない。これを暗黙に同義と扱わない。

## 行別突合

| ID / 元の下位設定 | 現UIと入力契約 | 保存済みRecipe→Worker Final | 実Blobの証拠と不足 |
| --- | --- | --- | --- |
| EV3-0757 Percentage | 「縮小率」1〜100の整数。倍率指定や拡大は不可。 | Final render 後、元Final寸法の比率を丸めて縮小。Recipeは固定、率自体はexport-only。 | 新規 AUDIT-01/02 で typed UI parser→サイズ計画→bundle済みWorker TIFF 50%・PPI/PPCの寸法/タグを確認。JPEG/PNGの**この方式の実Chrome Editorクリック→Blob**は既存証拠にない。 |
| EV3-0758 Width & Height | 現UIは「幅を指定」と「高さを指定」の**別モード**。それぞれ片方の整数だけを受け、他方は縦横比から計算。二値同時の厳密W×H操作ではない。 | 両モードとも縮小のみ、拡大拒否。Recipeへ寸法は保存しない。 | AUDIT-01/02 で各モード→Worker TIFFの寸法/密度を確認。JPEG/PNGの両モードの実Chrome Editor Blob証拠はない。公式の「指定ピクセル寸法」との完全一致は未証明。 |
| EV3-0759 Dimensions | 「幅×高さの枠」。2入力は最大値で、縦横比保持・縮小のみ。 | `fit` と同じ bounding-box 計算。120×80に58×33を指定すると**50×33**。指定58×33の厳密出力ではない。 | AUDIT-03 が意味差を固定し、AUDIT-02 がWorker TIFFを確認。既存の合成非RAW実Chrome Editor JPEG/PNG 4通り（PPI/PPC）では50×33と密度を確認済みの記録あり。厳密W×Hとしては未実装。 |
| EV3-0760 Long Edge | 「長辺を指定」、正の整数。 | 縦横比保持・縮小のみ。Final render 後に適用。 | AUDIT-02 でWorker TIFF、既存実Chrome Editor JPEG/PNG 4通りで実寸法・密度を確認済みの記録あり。実RAW Final未確認。 |
| EV3-0761 Short Edge | 「短辺を指定」、正の整数。 | 縦横比保持・縮小のみ。Final render 後に適用。 | AUDIT-02 でWorker TIFF、既存実Chrome Editor JPEG/PNG 4通りで実寸法・密度を確認済みの記録あり。実RAW Final未確認。 |
| EV3-0762 PPI | 独立した印刷密度選択、1〜65535整数。画素変更とは別。 | `resolution:{unit:'ppi',value}` をWorker encodeへ渡す。Recipe値ではない。 | JPEGはJFIF APP0の inch 単位、PNGはpHYsの整数pixels/metreへ丸め、TIFFはResolutionUnit=inchとX/Y RATIONAL。既存Chrome JPEG/PNG各3サイズ方式とTIFF元サイズ、AUDIT-02の全6サイズ方式TIFFで読戻し確認。JFIFが無いJPEGはfail-closed。 |
| EV3-0763 PPC | PPIと排他の密度選択、同じ入力範囲。 | `resolution:{unit:'ppc',value}` をWorker encodeへ渡す。Recipe値ではない。 | JPEGはJFIF APP0の cm 単位、PNGはpHYsへ×100、TIFFはResolutionUnit=centimeterとX/Y RATIONAL。証拠範囲はPPIと同じ。PPI/PPCはいずれも印刷実寸のresizeを行わない。 |

## 実ファイル・テスト証拠の強さ

- 新規 [export-size-completion-audit.test.mjs](../apps/web/tests/export-size-completion-audit.test.mjs): `AUDIT-01` は6画素サイズ方式のUI parserと計画、`AUDIT-02` は**実際にbundleしたWeb Worker**で6方式×PPI/PPCの12 TIFF Blobの256/257/282/283/296タグ、`AUDIT-03` はDimensionsの枠内縮小と拡大拒否。Node VM内のWorker試験であり、実ChromeのEditor操作・実RAW decodeではない。
- 既存 [export-size-editor-browser-fixture.mjs](../apps/web/tests/fixtures/export-size-editor-browser-fixture.mjs) と [UNIQUE_FEATURE_PROGRESS.md](UNIQUE_FEATURE_PROGRESS.md) には、保存済み合成非RAW Editor→実Chrome Worker→JPEG/PNGについて Long/Short/Dimensions × PPI/PPC の12 Blobを読戻した記録がある。この監査ではChromeを再実行していない。
- 既存 [export-tiff-editor-browser-fixture.mjs](../apps/web/tests/fixtures/export-tiff-editor-browser-fixture.mjs) と進捗記録には、合成非RAW Editor→実Chrome Worker→TIFFの**元サイズ**×PPI/PPC 2 Blobの確認がある。TIFFの6サイズ方式は新規Node Worker試験で補ったが、実Editor UIの6方式×TIFF操作までは確認していない。
- JPEG/PNGの密度書込は [export-resolution.mjs](../apps/web/src/export-resolution.mjs)、TIFFは [export-tiff.mjs](../apps/web/src/export-tiff.mjs) のタグで実装。PNGではPPIを整数pixels/metreへ換算するため量子化がある。Source RGBA/Originalの不変は専用試験の範囲で確認する。

## 残る具体的なGate（既存実装を重ねて作らない）

1. **意味差の決定**: 公式の「specific pixel dimensions」が厳密W×Hを要求するか、縦横比保持のfit指定を許すか、本人の期待と一次資料/実機画面で確定する。現SUITEは片側幅・片側高さ・枠内Dimensionsであり、厳密W×H出力・拡大は実装していない。推測でStretchやCropを追加しない。
2. **UI→全形式の証拠行列**: Percentage / Width / Heightの保存済みEditor UI→実Chrome Worker→JPEG/PNG Blob、全6方式→TIFF Blobの実操作・寸法・密度をまだこの監査では測定していない。新規試験のTIFF Node Worker成功をこの上位経路のPASSに昇格しない。
3. **設定の持続性を区別**: 現在サイズ/密度はexport-onlyでありRecipeには残らない。前回設定やExport Presetの保存/再適用が必要なら別契約と承認が必要。既存Recipe v1に無断追加しない。
4. **実画像Gate**: LibRawでの実RAW Original→保存済みRecipe→Final、実写真の画質、OSへの保存名/保存先、Cloud/実機は未確認。合成非RAW、Node VM、過去のChrome記録だけで全要素完了とはしない。

実装を変える場合は上記の意味決定と排他割当を先に行う。PPI/PPCを画素拡大の代わりに扱わず、TIFF16/圧縮やRAW精度をこの候補の達成と混同しない。
