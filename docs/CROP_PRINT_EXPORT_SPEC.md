# SUITE CROP / PRINT SIZE / EXPORT 追加実装指示

既存147節、NON-DESTRUCTIVE原則、RAW原本不変、Proxy編集、Recipe保存、Cloud Safe、既存保存・同期契約を維持したまま、以下を正式仕様として追加すること。

説明だけで終了せず、現在の環境で可能な実装・テスト・Evidence固定まで進めること。

## 1. Crop標準比率

最低限以下を実装する。

- Original
- Free
- 1:1
- 3:2
- 2:3
- 4:3
- 3:4
- 5:4
- 4:5
- 16:9
- 9:16
- Custom Ratio

縦位置／横位置の切替に対応する。

## 2. 印刷実寸Crop

通常の比率指定とは別に、実際の印刷サイズを選択してCropできるカテゴリを実装する。

### A判
- A0倍
- A0
- A1
- A2
- A3
- A4
- A5以下も必要に応じて対応

### B判
日本向けはJIS B判を基準とする。

- B0倍
- B0
- B1
- B2
- B3
- B4
- B5
- B6以下も必要に応じて対応

A0倍／B0倍はA0／B0とは別プリセット・別IDとして扱い、実寸mmを保持する。

## 3. 写真プリント規格

「Photo Print」カテゴリを設け、最低限以下を候補として実装する。

- L
- 2L
- DSC
- DSCW
- KG
- はがき
- HV
- スクエア
- パノラマ
- キャビネ
- 八切
- 六切
- ワイド六切
- 四切
- ワイド四切
- 大四切
- 半切
- 全紙
- 大全紙
- 全倍
- A3ノビ

名称だけでなく実寸mmを内部データとして持つこと。

ラボ・印刷所によって寸法差が存在する規格については、

- Preset
- 実寸mm表示
- Custom Size入力

を併設する。

確定寸法には出典を残し、推測値を正式仕様化しない。

## 4. Crop画面で完成イメージを表示

印刷サイズはExport時だけ選択させない。

Crop画面上で以下を確認できること。

- Preset名
- 実寸mm
- アスペクト比
- Portrait / Landscape
- Crop枠
- 最終印刷領域
- 予定dpi
- 予定pixel dimensions

例：

B0倍
→ Landscape
→ B0倍の実寸比率でCrop枠表示
→ 構図確認
→ Recipe保存
→ Exportへそのまま引継ぎ

書き出し後に初めて構図違いが判明するUXは禁止する。

## 5. Cropは非破壊

RAW原本を変更しない。

Crop情報はRecipeとして保存する。

最低限以下を保持する。

- preset_id
- preset_name
- width_mm
- height_mm
- orientation
- crop_rect
- crop_ratio
- rotation
- custom_size
- requested_dpi

編集はProxy上で行う。

最終成果物は、

RAW原本  
+ Recipe  
+ Crop設定  
+ Export設定

から新規生成する。

RAWへの上書きは禁止。

## 6. CropとExportを連動

Cropで選択した、

- B0倍
- A0倍
- 全紙
- 四切
- はがき
- SNS比率
- Custom

等の設定をExport画面へ自動引継ぎする。

同じ内容を再入力させない。

Export側で変更は可能とする。

## 7. DPI

印刷用途では300dpiを標準プリセットとして持つ。

実寸mmとdpiから必要pixel dimensionsを自動計算する。

表示項目：

- width mm
- height mm
- dpi
- pixel width
- pixel height
- 元RAW pixel size
- 不足解像度
- 推定出力サイズ

Custom DPIも許可する。

単にmetadataへ300dpiと記録するだけで、実ピクセル数が不足している出力は禁止。

## 8. 解像度不足

B0倍等の大判出力時、元RAWが指定サイズ・dpiを満たせない場合は警告する。

表示する。

- 必要pixel数
- RAW実pixel数
- 不足率
- 推奨dpi
- Upscale必要性

AI Upscaleを行う場合は、自動で黙って実行せず、ユーザーへ明示する。

## 9. Export Format

正式対応形式：

- JPEG
- TIFF
- PNG

### JPEG

標準設定：

- Quality = 100%
- 初期値を80%等にしない
- sRGB / Adobe RGB
- 300dpi
- 実寸プリセット連動
- Metadata設定
- File Naming
- Batch Export

ユーザーが明示的に変更した場合のみQualityを下げる。

### TIFF

以下に対応する。

- 8bit
- 16bit
- sRGB
- Adobe RGB
- 非圧縮
- 可逆圧縮
- 300dpi
- 実寸プリセット連動
- Metadata
- File Naming
- Batch Export

高品質印刷候補として、

16bit + Adobe RGB

を提示可能とする。

ただし印刷所指定を優先し、強制しない。

### PNG

正式対応する。

用途：

- 文字入り画像
- ロゴ
- グラフィック
- 透過背景
- SNS素材
- 可逆保存

必要な処理ではAlpha Channelを保持する。

## 10. Color Space

最低限以下を正式対応する。

- sRGB
- Adobe RGB

Web／SNSではsRGBを標準候補とする。

印刷用途ではAdobe RGBを選択可能とする。

色空間変換は単なるICCタグ変更ではなく、正しいプロファイル変換として処理する。

未実装の場合は対応済みと表示しない。

## 11. Export Preset

### Web / SNS
- JPEG
- Quality 100
- sRGB
- 1:1
- 4:5
- 9:16
- 16:9

### Standard Photo Print
- JPEG
- Quality 100
- 300dpi
- sRGB / Adobe RGB
- 写真プリント規格

### Fine Art / Large Print
- TIFF
- 16bit
- Adobe RGB候補
- 300dpi
- A判
- B判
- A0倍
- B0倍
- 写真規格
- Custom Size

### Graphic / Text
- PNG
- Lossless
- Transparent Background対応

## 12. UIカテゴリ

Crop画面では最低限以下に分類する。

- Ratio
- SNS
- Photo Print
- A Series
- B Series
- Custom

例：

B Series  
→ B0倍  
→ Portrait / Landscape  
→ Crop Preview  
→ Confirm  
→ Export設定へ自動引継ぎ

## 13. Evoto競合監査への追加

Evotoとの差分監査に以下を独立項目として追加する。

- Standard Crop Ratio
- Custom Ratio
- Photo Print Size
- A Series
- B Series
- A0倍
- B0倍
- 四切
- ワイド四切
- 半切
- 全紙
- 大全紙
- 全倍
- Custom Physical Size
- Crop Preview
- Crop → Export linkage
- DPI
- mm → pixel calculation
- JPEG
- TIFF
- PNG
- JPEG default quality
- TIFF 8bit / 16bit
- sRGB
- Adobe RGB
- ICC profile
- Metadata
- File naming
- Batch Export
- Large Format workflow

Evotoに存在しない、または公式情報で確認できない機能については、SUITE独自機能候補として別記録する。

## 14. Lightroomは参考比較のみ

Lightroom／Lightroom Classicも参考比較対象にしてよい。

ただしSUITEの主要競合判定基準はEvotoとする。

特に、

「既存ソフトではB0倍等の実寸プリセットからCrop・300dpi・Exportまで一貫して行いにくい」

という実務上の課題をSUITE側で解消する。

## 15. テスト追加

最低限以下をテストする。

- Original
- Free
- 標準比率全種
- Custom Ratio
- A判
- B判
- A0倍
- B0倍
- 写真プリント各種
- Portrait / Landscape
- Custom mm
- 300dpi
- Custom dpi
- mm → pixel calculation
- Crop保存
- Recipe保存
- 再起動後Crop復元
- Crop → Export引継ぎ
- JPEG Quality 100
- TIFF 8bit
- TIFF 16bit
- PNG
- PNG Alpha
- sRGB
- Adobe RGB
- JPEG pixel dimensions
- TIFF pixel dimensions
- dpi metadata
- Batch Export
- RAW checksum不変
- Recipeのみ変更
- 解像度不足警告

実行不能なものはNOT_RUNとして、

- 理由
- 必要環境
- 次の実行手順
- 合格条件

を残す。

## 16. 完了報告

今回の作業後、以下を正本へ統合する。

- 追加Crop仕様
- 対応Ratio一覧
- 対応印刷サイズ一覧
- 各プリセット実寸一覧
- Export対応一覧
- JPEG仕様
- TIFF仕様
- PNG仕様
- Color Space仕様
- DPI仕様
- 大判出力仕様
- 実装済み
- 未実装
- 未検証
- NOT_RUN
- テスト結果
- Evotoとの差分
- SUITE独自機能
- 変更ファイル
- Evidence保存場所
- 次にiPhone／iPad実機で確認する項目

現在実行可能な範囲は説明だけで止めず、実装・回帰・Evidence固定まで進めること。
