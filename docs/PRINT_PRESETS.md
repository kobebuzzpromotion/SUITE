# Crop / Print Presets / Export 共通モデル

確認日: 2026-10-03。追加16節のユーザー指示を実装する追補資料。既存147節・固定6文書・Original / Proxy / Recipe / Cloud Safe・6領域保存同期契約は変更しない。MOBILE RELEASE > WEB RELEASE。Web / SNSは成果物プリセット名であり、Webアプリ開発ではない。

## 状態と責務

| 領域 | 状態 | 証拠 / 制限 |
|---|---|---|
| TypeScriptモデル・入力検証・計算 | 実装済み・Windows検証済み | CE01–CE31: 31 PASS / 0 FAIL / 0 SKIP |
| 37件実寸catalogと12比率 | 実装済み・値照合検証済み | CE01–CE09。catalog全37件×縦横を検査。メーカー/印刷所寸法確認であり実印刷品質保証ではない |
| 既存Recipe v1との接続・SQLite close/reopen・CAS | 実装済み・Windows検証済み | CE26–CE28。SQLite永続化。アプリ実機再起動試験ではない |
| Swift Codable / 計算 / Recipe / ProjectStoreテスト17本 | コード接続済み・NOT RUN | WindowsにSwift/Xcodeなし。コンパイル成功を主張しない |
| Core Image / ImageIO実処理、ICC変換、JPEG/TIFF/PNG画質・metadata | NOT RUN | 親担当のrenderer接続先をMacで検証。モデルが受理する設定とrendererの対応は別 |
| iPhone / iPad操作・出力、Pencil、RAM、色再現 | NOT RUN | Mac/Xcodeと両実機が必要 |
| 実RAW 100 / 500 / 1000一括処理 | NOT RUN | checkout外実RAWセットとMac/実機が必要。ダミーRAW不使用 |
| 明示アップスケール / AI高解像度化 | 未実装 | 計算は不足を通知するだけ。黙示拡大・dpiタグのみ変更で合格にしない |

実データの形式・端末で未対応の設定はrendererで明示拒否する。無言の8bit化、色profile差替のみ、Proxy Final化は禁止。

## 正本データと担当ファイル

- contracts/fixtures/print-presets.json: 実寸・出典・確認日、共有Crop/Export/Recipe plain JSON例。
- packages/SuiteCore/Sources/SuiteCore/CropExport.swift: Swift共通モデル、catalog、計算。
- packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift: 17 XCTest（未実行）。
- apps/backend/src/crop-export.ts: 同じwire modelと検証・計算。新HTTP APIは追加しない。
- apps/backend/tests/crop-export.test.ts: CE01–CE31。
- 本書: 出典・計算・未検証境界。

親担当の既存Recipe bridge、UI、renderer統合は別ファイル。最終Evidenceと全体回帰の正本は親担当が固定する。本書の31件は既存Windows基盤34件を置き換えない。

## 比率と実寸の扱い

比率12種類: Original / Free / 1:1 / 3:2 / 2:3 / 4:3 / 3:4 / 5:4 / 4:5 / 16:9 / 9:16 / Custom Ratio。

写真サイズは全21名称を維持する。同名でも印刷所による寸法差があるため、下表は各提供元の実寸候補。注文先指定が異なる場合は別IDのCustom Sizeで明示変更する。B系は日本向けJIS B寸法。A0倍/B0倍はそれぞれA0/B0と別ID。

catalogは縦向きの短辺×長辺。UIが向きを決めた後、Recipeのwidth_mm/height_mmに実際の横幅/縦幅を保存する。計算時にこれを再swapしない。既知プリセットIDの寸法偽装・custom_size=trueによる回避を拒否する。新しい未確認候補は寸法を推測せずwidth_mm/height_mm=null・available=falseとして使用不可にする（catalog内のみnull可。Recipe内はnull禁止）。

| preset_id | 表示名 | 縦向き実寸 mm | 一次情報 | 注意 |
|---|---|---|---|---|
| a.a0-double | A0倍 | 1189 × 1682 | [提供元](https://www.graphic.jp/lineup/poster_xl) | A0とは別ID。印刷所のA0倍仕上がり寸法。 |
| a.a0 | A0 | 841 × 1189 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 上記出典の寸法 |
| a.a1 | A1 | 594 × 841 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 上記出典の寸法 |
| a.a2 | A2 | 420 × 594 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 上記出典の寸法 |
| a.a3 | A3 | 297 × 420 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 上記出典の寸法 |
| a.a4 | A4 | 210 × 297 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 上記出典の寸法 |
| a.a5 | A5 | 148 × 210 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 上記出典の寸法 |
| a.a6 | A6 | 105 × 148 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 上記出典の寸法 |
| b.b0-double | B0倍 | 1456 × 2060 | [提供元](https://www.graphic.jp/lineup/poster_xl) | B0とは別ID。JIS B系の印刷所B0倍。ISO Bと混同しない。 |
| b.b0 | B0 | 1030 × 1456 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 日本向けJIS B寸法。 |
| b.b1 | B1 | 728 × 1030 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 日本向けJIS B寸法。 |
| b.b2 | B2 | 515 × 728 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 日本向けJIS B寸法。 |
| b.b3 | B3 | 364 × 515 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 日本向けJIS B寸法。 |
| b.b4 | B4 | 257 × 364 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 日本向けJIS B寸法。 |
| b.b5 | B5 | 182 × 257 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 日本向けJIS B寸法。 |
| b.b6 | B6 | 128 × 182 | [提供元](https://www.yutakaprint.co.jp/papersize/) | 日本向けJIS B寸法。 |
| photo.l | L | 89 × 127 | [提供元](https://netprint-smile.com/netprint.html) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.2l | 2L | 127 × 178 | [提供元](https://netprint-smile.com/netprint.html) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.dsc | DSC | 89 × 119 | [提供元](https://netprint-smile.com/netprint.html) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.dscw | DSCW | 127 × 169 | [提供元](https://ikb135.onlinelab.jp/help/faq/print.php) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.kg | KG | 102 × 152 | [提供元](https://netprint-smile.com/netprint.html) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.postcard | はがき | 100 × 148 | [提供元](https://www2.epson.jp/support/manual/data/ink/scpx7v2/CMP0038_00.PDF) | 郵便はがき100×148mm。KG 102×152mmとは別ID。 |
| photo.hv | HV | 89 × 158 | [提供元](https://netprint-smile.com/netprint.html) | 89×158mmを提供する写真のスマイルの候補。他のHV用紙とは寸法が異なる。 |
| photo.square | スクエア | 89 × 89 | [提供元](https://netprint-smile.com/netprint.html) | 89mm正方形の候補。スクエアは寸法を一意に決める名称ではない。 |
| photo.panorama | パノラマ | 89 × 254 | [提供元](https://netprint-smile.com/netprint.html) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.cabinet | キャビネ | 127 × 178 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。 |
| photo.8cut | 八切 | 165 × 216 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.6cut | 六切 | 203 × 254 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.wide6 | ワイド六切 | 203 × 305 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.4cut | 四切 | 254 × 305 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.wide4 | ワイド四切 | 254 × 381 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。 |
| photo.large4 | 大四切 | 279 × 356 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |
| photo.half | 半切 | 356 × 432 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。 |
| photo.full | 全紙 | 457 × 560 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。 |
| photo.largefull | 大全紙 | 508 × 600 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。 |
| photo.doublefull | 全倍 | 540 × 840 | [提供元](https://www.tomicolor.co.jp/services/print/largeprint/) | トミカラーの提供実寸を採用した候補。名称が同じでもラボ差あり。注文先の実寸を確認しCustom Sizeで変更。 |
| photo.a3plus | A3ノビ | 329 × 483 | [提供元](https://www.epson.jp/products/colorio/supply/paper/use/pro.htm) | 提供元の実寸候補。実際のラボ指定を優先しCustom Sizeを併設。 |

印刷所違いの確認例: [写真屋さんエイト](https://www.shashin8.com/support/info/index.html) はキャビネ130×180・半切340×410・全紙435×540・全倍540×870を掲載している。SUITE候補表の[トミカラー](https://www.tomicolor.co.jp/services/print/largeprint/)値と同一規格として扱わない。KGと郵便はがきも別寸法・別IDで保存する。

## 座標と計算（Swift / TS共通）

crop_rect = { x, y, width, height } は左上原点・0〜1正規化矩形。EXIF正立化後、Recipe rotationDegreesを適用した写真領域が基準。Originalを切り詰めない。

- CropSettings.rotationは既存Recipe rotationDegreesの写し。二重回転しない。
- resolutionAssessmentのsourceWidth/HeightはEXIF適用後・Recipe回転前。90/270度で一度だけ交換する。
- centeredRectには既に向きを合わせた寸法を渡す。
- 新Cropモデルは90度単位以外を明示拒否する。既存Crop無しRecipeの回転仕様は変更しない。
- 実寸サイズにはcrop_ratioが必要。実寸比と一致しない矩形は歪ませず拒否する。
- 最終target pixel = ceil(mm / 25.4 × requested_dpi)。既定300dpi、正の有限custom dpiを許可。
- Crop後の有効source pixel = floor(rotatedSourcePixel × crop_rect.dimension)。境界浮動小数の1px誤差に小さな許容値を使用。
- 不足率 = 100 × (1 − min(1, availableWidth/requiredWidth, availableHeight/requiredHeight))。幅・高さの厳しい側を採用。面積不足率とは異なる。
- 推奨dpi = floor(min(availableWidth × 25.4 / width_mm, availableHeight × 25.4 / height_mm))。利用者が明示選択しない限りtarget dpiを変更しない。
- 実寸未指定時はrequired pixel / recommended dpiを省略し、架空の印刷サイズを補わない。
- estimatedUncompressedBytesはpixel bufferの概算のみ。圧縮後ファイル容量・RAWサイズ・プロセスpeak memory・同時処理数を保証しない。

例: A4 210×297mm、300dpiは2481×3508px。254mm正方形は3000×3000px。6000×4000元画像から2000×2000の領域を切り出す場合、後者は約33.33%不足・推奨200dpi。300dpiタグを付けただけでは解決しない。

## Recipe / Export wire boundary

既存Recipe schemaVersion:1・parameters・保存境界を維持し、extendedParameters["crop"] / ["export"]にplain JSONとして格納する。Crop stageはRecipe末尾。ExportPlanで固定されたRecipeからのみFinal生成する。

Crop保存項目: preset_id / preset_name / width_mm / height_mm / orientation / crop_rect / crop_ratio / rotation / custom_size / requested_dpi。実寸・比率未指定のoptional keyは省略し、nullにしない。crop_rect/ratioの未知キーも黙って落とさず拒否する。

| Exportキー | モデル |
|---|---|
| format | jpeg / tiff / png |
| jpeg_quality | 1〜100整数、既定100 |
| bit_depth | 8 / 16。JPEGは8のみ |
| color_space | sRGB / adobeRGB |
| tiff_compression | none / lzw。TIFF以外はnone |
| preserve_alpha | 明示bool。JPEGはfalse |
| metadata | preserve / remove |
| file_name_template | 128 UTF-16単位以内。{original}/{sequence}のみ。path separator、制御文字、相対path、未知placeholder禁止 |
| requested_dpi | 正の有限数。Cropと一致 |

ファイル名の衝突回避とOriginal上書き禁止は既存の成果物保存境界で実行し、テンプレート検証だけを安全な書込完了と扱わない。TIFF16・PNG16などのモデル設定を保存できても、実rendererが未対応なら明示拒否し、8bitへ黙って変更しない。

| 推奨プリセットID | 推奨設定 | 備考 |
|---|---|---|
| export.web-sns | JPEG100 / sRGB | 1:1, 4:5, 16:9, 9:16を候補表示。Cropを自動変更しない |
| export.standard-print | JPEG100 / 300dpi | 選択済み印刷実寸に必要なpixelを再計算 |
| export.fine-art | TIFF16 / AdobeRGB / 300dpi | 対応renderer・変換検証が必要な候補 |
| export.graphic-text | PNG / Alpha保持 | 入力にない透過を自動生成しない |

## 実行Evidence

2026-10-03、repo rootから以下を実行した。

~~~powershell
npm run build
node --test dist/apps/backend/tests/crop-export.test.js
~~~

TypeScript build: exit 0。追加テスト: **31 PASS / 0 FAIL / 0 SKIP**。CE01–09比率/catalog/縦横、CE10–19pixel/不足/座標、CE20–25設定/推定、CE26–28既存Recipe/SQLite/CAS、CE29–31厳格検証/再計算/推奨設定。前段の30件結果にCE31を加え再実行済み。

CE28はmetadata-only-assetのDBメタデータ試験。画像・RAW fixtureは生成していない。Original identity/hash保存値を変更しないことを確認するが、実RAW画像のハッシュ比較・デコード・ネイティブExport合格を意味しない。既存Original byte不変・Multipart・Cloud Safe試験は親担当の全回帰で維持する。

## 次にMac / 実機で行う手順

1. checkout外の承認済み実RAWを配置。100/500/1000セットを混ぜずManifestを作成。
2. repo rootで次を実行しstdout/終了コードをEvidenceに保存。

~~~sh
swift test --package-path packages/SuiteCore --filter CropExportTests
swift test --package-path packages/SuiteCore
swift build --package-path apps/apple -c release
cd apps/apple
xcodegen generate
xcodebuild -showdestinations -scheme SUITE -project SUITE.xcodeproj
# 以下は表示された実機IDと新規出力pathで置換して実行
xcodebuild test -scheme SUITE -project SUITE.xcodeproj -destination 'id=<実在するID>' -resultBundlePath <新規xcresult>
~~~

3. Swift17件の未実行を実測で置換。共有JSON値/strict decode、Recipe bridge、ProjectStore復元が一致すること。
4. renderer試験でJPEG100・TIFF8/16・PNG、Alpha、実pixel寸法、embedded ICCと実色変換、EXIF/DPI/metadata、命名衝突、一括保存、未対応拒否を確認。拡張子確認だけでは合格にしない。
5. iPhone実機とiPad実機を独立Gateで実行。端末/OS/ビルド番号、portrait/landscape、片手操作/Pencil、Crop枠→適用→Undo/Redo→保存→再起動復元→Exportを記録。
6. RAW Import→Proxy→同期→Recipe→復元→Cloud Safe→Final、Original hash前後一致、Original取得失敗・不足pixel・容量不足・Export中断を確認。未対応や失敗は成功画像に偽装せず説明状態で停止。
7. 100/500/1000実RAWは各々同期・再起動復元・Cloud Safe・出力計測を保存。Windowsの数値テストを実RAW負荷PASSとしない。

必要環境: Mac/Xcode/対応SDK・実RAW・iPhone・iPad・利用者指定の本番/QA接続先。実行されるまでNOT RUN、Mobile Release未合格を維持する。CLIに存在しない実機自動化コマンドを捏造しない。両端末の操作結果は実機Evidenceへ記入する。
