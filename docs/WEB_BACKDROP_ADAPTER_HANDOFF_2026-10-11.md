# Web背景描画の接続点

コードのみ。試験・ビルド・配備は未実施。

## 追加済み経路

`local-backdrop-bundle.mjs` → `local-backdrop-png-decoder.mjs` → `local-backdrop-render-adapter.mjs` → `processing/local-backdrop-renderer.mjs`。

公開入口は `renderLocalBackdropBundle({bundle,source,authorize,workingByteLimit},{signal})`。

- bundle: Appleの厳密なlocalBackdrop Recipe、binding `{id,sha256}`、固定背景manifest、encoded背景bytes、raw L8 mask、maskKind。
- source: 同写真の未crop・upright・top-left・straight sRGB8 RGBA。元写真のSHAと画素SHAは別物。既存localRetouch/portrait等があるなら同順序の処理済みsourceが必要。
- authorize: 現写真、現在Recipe版、利用許可、sourceの由来をhostが毎回照合してtrueを返す。単なるSHA一致だけで許可しない。
- 既定decoderはPNG限定。RGB/RGBA8、非interlace、非動画、sRGB又は未タグをsRGB解釈。EXIF/ICC/JPEG/特殊PNGは未対応を返す。
- encoded SHA、mask SHA、寸法、版、bytecountを確認し、現在権限を非同期境界と返却前に再確認する。
- rendererはnone影のみ。warp有りは拒否。出力はlinear-sRGB premultiplied Float32であり、8bit画面に直書きしない。

## 未接続（完了に混ぜない）

現UIへのbundle選択、原本由来のsource取得、現在版/許可host、結果表示の色変換、Undo/CAS保存。
表示変換部品 `local-backdrop-display.mjs` は追加済み。linear premult Float32→straight sRGB8、SDR白を超える値は見本限定でclipしclippedPixelsを返す。HDR tone mapping/書き出しではない。UI呼出は残る。
影・warp・その他Apple局所補正のWeb再現と大判出力も別作業。

旧Web RAW素材gateはApple背景manifest/maskを供給しないため代用禁止。
モデル導入・provider申請待ちとは別のコード残である。

## メモリと取消

adapter保持copy分をrenderer予算から控除。ブラウザdecoder/canvas内部メモリはこの予算だけで保証できない。
PNGはencoded32MiB/8MP/chunk4096上限、CRC確認を64KiB単位にyieldする。
一時copyは終了時消去。返却された描画結果は利用側が表示・保存終了後に解放する。

## 次回の実host接続点

`editor-ui.mjs` の `createCrossDeviceCompatReportUI` にsourceProvider/authorize/subscribeContextを渡す。未編集画素はsession.proxy、写真bindingはsession.state.asset.id/sha256とrevision。人物処理許可・pending/busy/exporting/accessを開始/公開前に再確認。maskとproxy寸法完全一致だけ見本可能。暗黙resize禁止。JSON history.cursor のlocalBackdropを読むが、他補正込みの完全復元とは呼ばない。
