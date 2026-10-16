# SUITE大判出力設計 — 2026-10-08

ユーザー指定：印刷を軸としSNSも維持。B0倍（既存preset 1456×2060mm）、300dpiまで。編集はProxy。印刷サイズ選択→実寸比率Crop→同じ設定でExport。今回は設計記録であり、出力対応を実装済みとはしない。

## サイズ契約

- 寸法正本は既存crop-exportのprint presets。B0とB0倍を分離し、JIS Bを使用。四切・ワイド四切等も既存実寸を使用。ラボ別差はCustom mmとして保持。
- 既存mm→px計算のceilを維持。B0倍300dpiは17197×24331px、418420207画素。向きは交換可能。
- 解析Proxyの作業画素数、原本の寸法metadata、最終出力画素数、同時作業メモリを別契約にする。小さいProxyを原本8MP超という理由だけで拒否しない。
- 原本寸法には正整数/overflow/codec対応検査を残すが、Proxyバッファ上限を流用しない。画像全体をメモリ展開する既存関数の制限は単純解除しない。
- 出力寸法から逆算した解像度不足はCrop後の有効原本領域で判定。補間/AI拡大は明示選択。300dpiタグだけで不足画素をごまかさない。

## パイプライン

1. Recipe版、原本SHA、Crop/回転、preset実寸、dpi、色空間、bit深度、補間方式、canonical生成assetを固定したPrintJobを作る。
2. タイルの出力座標を原本座標へ逆変換。必要な原本領域と処理のhaloを読む。RAW decoderが領域読込に対応しない場合は、一度現像してディスク上の中間画像に保存する。原本全体の展開を隠さない。
3. 顔解析/全体統計はProxy等から一度求め、原本座標へ対応付ける。タイルごとに異なる自動判断や生成をしない。
4. 点処理は独立tile、blur/sharpen等はkernelに必要なhalo、warpは逆写像で入力範囲を拡張。非局所AIは対応するtile推論かcanonical画像を要求。非対応モデルを単に細切れにしない。
5. Crop/resize/出力sharpen/ICC変換を順序固定し、重なりを捨てた中心領域を順次encoderへ送る。グローバル座標seedで粒子や模様の継ぎ目を防ぐ。
6. encoderは全画素配列/巨大Canvas/全量Blobを要求せず、strip/scanlineをsinkへ順次書く。作業queueとbuffer poolをメモリ予算で制御する。
7. 一時ファイルに出力し、完了時のみ完成名で確定。取消/失敗では原本を変更しない。再開は全依存のSHA/版が一致するcheckpointのみ。

## 出力と能力判定

- 大判の優先実装はstreaming TIFF 8/16bit RGB。ICCを実変換して埋め込む。既存の全量TIFF encoder（16MP/120MiB）を上限変更だけで流用しない。
- JPEG/PNGもscanline/streaming対応encoderを選定する。現在のOffscreenCanvas経路は通常サイズ用として保持。大判能力がない場合は対応済み表示にしない。
- TIFF offsetや総bytesは安全な整数で計画。classic TIFFのoffset範囲を超える場合は対応するBigTIFFと入稿先互換を明示し、拡張子だけで逃げない。
- B0倍はRGBA8だけでも約1.67GB、RGB16で約2.51GB。中間Float32やコピーを全量保持しない。空きdisk/出力format/codec能力を開始前に提示。
- Web/Appleは同じPrintJob契約を使い、ファイルsink/decoder/encoderは各環境の実能力に合わせる。Webで無理な経路を黙ってクラウド送信しない。
- SNSは従来の小サイズ・sRGB書き出しを維持。印刷設定をSNSへ強制しない。

## 実装担当と順序

Astra単独責任：寸法契約分離→tile/source reader→処理順序とhalo→streaming encoder/sink→既存Crop/Export接続。同じ項目をSolと分割しない。現在の8/24/40MPの矛盾をこの契約で修正する。

コード追加：`apps/web/src/delta66-tiff-stream.mjs` は、非圧縮または可逆PackBitsのclassic TIFF全幅stripを順次sinkへ出力する。真のUint16/Uint8入力、RGB/RGBA straight、DPI、提供済みICCの埋込に対応。全量出力配列を作らず、各stripの入力・変換byte列・圧縮byte列とmetadataだけ保持する。PackBitsではseek可能な一時sinkにstrip表を書戻してから確定する。4GiB超はBigTIFF未対応として拒否。これはencoderだけであり原本decoderやICC色変換ではない。

追補：Apple独立`Delta66LargePrint.swift`で既存RAWRenderRequest/PhotoPipeline.validateを再利用し、原本disk snapshot・CoreImage領域描画・横tile/縦strip・OS標準ICC実変換・8/16bit TIFF逐次出力を作成。B0倍300dpiの寸法契約を使用。OS RAW decode内部の全量memory上限は保証できず原寸推定予算で制限。Apple既存Recipe subsetのみ、明示通常補間、非圧縮/非透過/必須metadata限定。

未実装：Web原本領域renderer/RAW disk中間化、全機能のnative接続、streaming JPEG/PNG・TIFF LZW/Deflate・BigTIFF、任意ユーザーICCと原本metadata完全保持。実験・テスト・buildは今回未実施。B0倍300dpiの実機書出し成功は未確認。
