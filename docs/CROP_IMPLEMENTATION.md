# Crop / Print Size / Export — 追加実装と検証

2026-10-03 JST。ユーザー添付16節を新しい正本 `CROP_PRINT_EXPORT_SPEC.md` として追加。旧147節・固定6文書・6領域保存同期契約は変更しない。Mobile Release BLOCK。

## 統合前に固定した方針・影響範囲

今回の追加仕様はユーザーが明示承認したものであり、Evoto差分の自動採用ではない。旧仕様を削らず、追加16節は別ID `CROP-01`〜`CROP-16`で追跡する。

- 既存RecipeDocument v1の外形を変更せず、既存`extendedParameters`の`crop` / `export`にplain JSONで保持する。optional不明値は省略し、既存のnull禁止を維持する。
- normalized Cropは、既存90度回転後の表示方向を基準にする。rotationはRecipeの値と一致させ、二重回転しない。Proxy上の構図とOriginalからのFinalは同じ枠を適用する。
- Crop→Exportは同じ設定を引継ぎ、固定ExportPlanが開始時のRecipeと設定を凍結する。PNGを追加してもOriginal取得目的は既存APIのhigh-precisionを使用し、新エンドポイント/保存契約は作らない。
- mm / dpiは実pixelへ変換する。解像度不足時は明示警告し、AI Upscale未接続の間はFinalを拒否する。タグだけ300dpiにして不足pixelを隠さない。
- sRGB / Adobe RGBは実変換の画像encoder候補へ渡す。単なるICCタグ変更で代用しない。JPEGは明示Quality 100、TIFF8/16bit・圧縮・PNG Alphaはnative実測前に対応合格と表示しない。
- 新規出力はstaging→検証→別成果物。旧RAW/Proxy/Recipe履歴、既存Multipart正常/旧partを上書きしない。実寸出典不明の候補は使用不可としてCustom Sizeを案内する。
- 追加モデル・計算・永続化はWindowsで実行可能な範囲を試験する。Apple画像品質・色・alpha・dpi・実機操作はMac/iPhone/iPadで別途NOT RUN。実RAWを生成/偽装しない。

影響予定: 追加Core/TSの設定・計算、既存Recipe validator、Apple PhotoPipeline / EditorModel / 端末別操作入口、追加試験、正本/trace/Evidence。既存API/provider、DB schema、RAW保存、同期方式は変更しない。

以下の最終件数・対応表・未実装/未検証は統合後の実行結果で追記する。説明段階を実装完了やRelease PASSとしない。

## 統合後の確定記録

Windows: crop-export31＋crop-integration5＝36 PASS / 0 FAIL / 0 SKIP。既存34およびWorkspace等を含む親回帰124 PASS。設定・計算・SQLite・CAS・実child終了後復元の証拠であってRAW画像品質のPASSではない。

Swift Crop17件＋Apple Crop pipeline10件はNOT_RUN。iPhone下部導線とiPad専用preview/panelからEditorModel→Recipe拡張→固定ExportPlanへ接続したコード候補。元画像の向きに従うCrop、37印刷preset、12比率、画素不足時拒否、JPEG100/TIFF8・16/PNG、sRGB/AdobeRGB、metadata/Alpha検査はMac実行で確認が必要。

書出しは単一＋foreground serial複数。耐久background batchや中断ジョブの自動再開が完成したという意味ではない。RAW active-areaとEXIF寸法差、極端に大きい印刷pixelのRAM拒否、ICC/bit-depth/Alphaの実画像、性能/熱/端末ロックは未検証。

追加16節の[manifest](CROP_REQUIREMENTS.json)と[最新Evidence](evidence/integrated-2026-10-03/regression.json)のadditionalRequirementsが対応。変更ファイル・未実装・実機手順はINTEGRATED_REPORT.md / NEXT_RUN.md。全既存契約とOriginal/Proxy/Recipeの非破壊境界は維持し、Mobile Release BLOCK。
