# EV3-0021 Makeup components / Eyeshadow — 差分監査

判定（2026-10-05）: **NOT_IMPLEMENTED / 0/44**。本書は一次資料と現ソースの読取り結果であり、製品のEyeshadow画素処理・UI・保存を追加していない。

## 元操作の確定範囲

| Evoto一次資料 | Eyeshadowについて確認できたこと | 確定できないこと |
| --- | --- | --- |
| [Desktop Makeup](https://support.evoto.ai/makeup/) | 個別Makeup componentのEyeshadowに14スタイル。 | 各素材の色・形状・位置・画素合成式、Eyeshadow専用Amount値域、左右独立の可否。 |
| [iPad Makeup](https://support.evoto.ai/makeup-ipad/) | Eyeshadowに8スタイル。 | Desktop/Mobile 14種類との対応・包含関係、同一画素結果。 |
| [Mobile Makeup](https://support.evoto.ai/portrait-retouching-makeup/) | Eyeshadowに14スタイル。 | Desktopとの同一素材・同一処理。 |

これらのページはMakeupモジュール全般の顔・関連領域の自動検出を説明するが、Eyeshadow専用の眼瞼領域・遮蔽・ブレンド規則を開示しない。一般的な `Eye Makeup` のAmount/Saturation/Brightness・Luminance/Dimensionality、および `Makeup Looks` 全体のAmountをEyeshadow単体の操作へ読み替えない。[凍結監査](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md)のEV3-0021 Style selectionは `DOCUMENTED`、EV3-0022 Eyeshadow Amountは `NOT_CONFIRMED`。左右個別は「many components」であり、公式が個別に左右を明記するEyebrow/Eyelashesの記述をEyeshadowへ継承させない。

Eyeshadowは眼周囲の色・スタイル、Eyelinerは瞼の線、Eyelashesはまつ毛素材、Contactsは虹彩・レンズであり、公式記事も別componentとして列挙する。既存の一般HSL/Color/DetailやFace Brightnessが眼周囲画素を変え得ても、Eyeshadowスタイル適用と同一ではない。

## SUITEの現状と固有差

| 経路 | 確認した実装 | EV3-0021に不足するもの |
| --- | --- | --- |
| 顔と実画素 | [portrait-recipe.ts](../apps/backend/src/portrait-recipe.ts)は人物targetを`face_brightness`のみ型付け。[pure.mjs](../apps/web/src/processing/pure.mjs)の顔処理、Local Levels、手動Makeup Highlight/Blushは明度・局所調整・頬彩色であり、独立の[まつ毛線](../apps/web/src/processing/manual-eyelash-render.mjs)・Eyeliner線も別意味。 | 眼瞼/眼周囲の真正位置、Eyeshadowのスタイル素材・範囲・遮蔽・実画素合成。一般の色調整や他の眼機能を流用できない。 |
| Recipe / Undo・Redo / 保存・再読込 | 後続の限定実装で写真固有`eyeshadowManual`のtyped文書とPresetへの誤コピー拒否を追加済み。偽`eyeshadow` aliasは保存前に拒否する。 | 公式素材版、実Asset・人物・Original SHA照合を伴うCAS保存/再読込、Undo/Redoから製品画素への経路とprivacy Gate。typed JSONだけでは完成ではない。 |
| Editor / Preview / Final | [editor-ui.mjs](../apps/web/src/editor-ui.mjs)は人物選択・顔明度などを持つ。Eyeshadow専用操作は[session.mjs](../apps/web/src/session.mjs)と[worker.mjs](../apps/web/src/processing/worker.mjs)にもない。 | 公式と区別されたスタイル選択、対象人物・眼領域表示、実Previewと保存済みRecipeからのFinal画素。 |
| Preset | [Author portable契約](../apps/web/src/preset-author/preset-author-contract.mjs)は未知の写真固有拡張を拒否する。一般的なPersonal/Workspace Preset保存も、Eyeshadow素材と人物bindingの安全な適用証拠ではない。 | 写真固有マスクを他Assetへコピーしない境界、Personal/Workspace/Community/Authorの適用・再読込・FinalにおけるEyeshadowの意味付け。 |

## 安全な最小実装単位と残Gate

最初は**SUITE独自の本人明示・眼周囲マスク内の単色彩色**として、権利確認済みの色だけを入力し、元14/8スタイルと表示しない。Asset UUID/Original SHA/人物ID/原寸/保存版/対象眼とマスク出典を厳密に固定し、mask外・瞳孔/虹彩・まつ毛/線・alpha・透明hidden RGBを不変にする純粋RGBA8核と境界試験から始められる。ただし本人が描いた位置は認証や医学的な眼領域検出の証拠ではない。次段階でfresh本人・privacy・権限、Preview/Undo/Redo、CAS保存/再読込、原寸Final、Preset写真固有拒否を一経路で接続する。

元EV3-0021を完了とするには、公式スタイル素材の権利・定義、Desktop/Mobile 14・iPad 8の差、形状/色/遮蔽/画素参照、適用UIからFinal・Presetまでの実証が別途必要。Eyeshadow固有Amount（EV3-0022）は下位操作自体が**NOT_CONFIRMED**。実写真/RAW、閉眼・眼鏡・複数人物・異なる肌色、iPad/iPhone実機、Cloud、元製品との画素同等性は **NOT_RUN / NOT_PROVEN**。見た目だけの14/8スタイル一覧や動かないSliderは追加しない。
