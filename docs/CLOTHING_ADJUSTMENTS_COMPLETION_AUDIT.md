# EV3-0313 Clothing adjustments — 差分監査

判定（2026-10-05）: **元7下位操作はSUITE製品経路ではNOT_IMPLEMENTED**。監査のみで、画素処理・UI・Recipe・保存・Final・Preset・権限を変更しない。厳密な完了数は **0/44のまま**。

## 元7操作と一次資料

凍結した[EV3-0313〜0319](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md)は衣服の主効果・依存下位効果・縁補正と保護を含む。隣のEV3-0320 Manual Tuning brush/eraseも公式に存在するが、今回の**元7操作とは別の補助操作**として境界を記録する。

| ID | 元操作と公式の意味 | 現SUITEとの差 |
| --- | --- | --- |
| 0313 | De-wrinkle Clothing: しわを減らし布の元の質感・立体感をなるべく保つ主スライダー。性別・年齢オプションも記事に記載。 | 衣服の認識、しわの識別、布の形状／質感保持処理なし。 |
| 0314 | Remove Fine Wrinkles: 主効果を有効にした後、薄いしわを強度調整。 | 細い布しわと質感の分離なし。 |
| 0315 | Remove Coarse Wrinkles: 主効果を有効にした後、大きい折り目と不均一な光／影を調整。 | 大きい布折り目・陰影を衣服内で補正する処理なし。 |
| 0316 | De-Blemish Clothing: 糸くず・ほこり・薄片など小さい妨害物を強度調整。 | 欠陥の検出・除去・周囲布の修復なし。 |
| 0317 | Clothing Edge Smoothing: 衣服の端のしわ・折り目をAIで滑らかにする。 | 衣服境界／隣接物体の識別と専用エッジ再構成なし。 |
| 0318 | Clothing Edge Refinement: Edge Smoothing時に自動で有効になり、特定の端を手動ペンで微調整。 | 対象効果の編集mask／ペンと再描画経路なし。 |
| 0319 | Objects Protection: Edge Smoothing時に自動で有効になり、近接物体の歪みを防ぐ。 | 近接物体の識別・保護mask・局所変形の抑止なし。単独の物体除去効果ではない。 |

[Desktop公式](https://support.evoto.ai/clothing-adjustment/)は0314/0315が主De-wrinkleを有効にした後に現れること、0318/0319がEdge Smoothingと連動することを記載する。[iPad公式](https://support.evoto.ai/clothing-adjustment-ipad/)もこの構成を記載する。[Mobile公式](https://support.evoto.ai/clothing-accessories-adjustments-module/)には上／下衣服を別強度でしわ除去する操作、Lint Removalと別のSweat Stain Removal、写真へのPreset保存／Syncが追加記述される。後者は凍結Desktop 7項目の別名として吸収しないし、同じ画素結果やRecipe相互運用の証明にもならない。元監査のMobile列はNOT_CONFIRMEDであり、現行記事の記述と凍結時点の証拠状態を区別する。

公式の[Manual Tuning Pen](https://support.evoto.ai/clothing-adjustment/)は、適用効果をbrush/eraseで直し、誤適用域を戻す補助操作である。画像全体のLocal Levels brushを衣服補正ペンと読み替えない。記事は各AIモデル・画素式、しわ判定の閾値、Presetのマスク可搬性、RAW/Proxy/Finalの同一性、実際の端末間出力を公開していない。

## 現SUITEの実動作と欠落

| 境界 | 実装済みの近接機能 | Clothingとの差／未接続 |
| --- | --- | --- |
| 画素 | [detail-adjustments.mjs](../apps/web/src/processing/detail-adjustments.mjs)のClarity/Texture/Sharpness/Denoiseは表示用sRGB8の輝度周波数処理。 | 衣服検出、細／粗しわの意味分類、糸くず除去、折り目や布目の保護はない。画素が変わるだけでは衣服補正ではない。 |
| mask／保護 | [local-levels.mjs](../apps/web/src/processing/local-levels.mjs)は**呼出側が与える**coverage maskの内側にRGB Levelsを適用する。[subject-mask-authoring.mjs](../apps/web/src/processing/subject-mask-authoring.mjs)は本人手描きのsubject領域であって衣服／物体の自動識別ではない。 | Local Levelsは幾何変形・修復をしない。手動subject maskをObjects Protectionや衣服輪郭の認識済みmaskへ昇格させない。 |
| UI／Recipe | [editor-ui.mjs](../apps/web/src/editor-ui.mjs)はDetail sliderとLocal Levels brushを表示する。[photo-policy.ts](../apps/backend/src/photo-policy.ts)はDetail項目を厳密列挙し、衣服効果は受けない。[pure.mjs](../apps/web/src/processing/pure.mjs)に衣服stageはない。 | Clothing専用UI、主効果に依存する子操作、型付き保存値、対象mask・保護mask出典、編集Undo/Redo・CAS保存／再読込なし。 |
| Final／Preset | 既存Detail/Local Levelsは既存条件でWorker Finalへ進むが、その処理に衣服意味はない。Author portable Presetは未知の衣服拡張を拒否し、Personal/Workspaceの一般保存契約も衣服処理の実装証拠ではない。 | 衣服専用Final画素、写真固有maskの安全なPreset扱い、Mobileの上／下衣服別Syncはない。 |
| 端末／権限 | Webの本人・Workspace・Recipe CASとAppleの既存編集機構は、対応した調整に限る。 | Web/iPad/iPhoneのClothing相互運用、衣服検出と人物・性別／年齢推定の同意・本人権限は未証明。本人の見た目から年齢／性別を推測して適用しない。 |

## 安全な最小実装単位と完了条件

最初に試せるのは、**本人が明示した単一の衣服内小領域を修復するSUITE独自の手動スポット補正**である。これは0316の自動De-Blemishや0313のしわ除去を完成させるものではない。Asset UUID・Original SHA・原寸・保存版、本人が手動で選んだ修復領域と参照する同一衣服の健全部を別々に束縛し、非有限／過大mask・不明な出典・別写真・取消・失効を拒否する。元RGBA/alpha・mask外画素・布目の境界・近接する肌／髪／装飾品を保護し、Pixel処理・Proxy/Final投影・決定性・容量を合成fixtureで検証する。callerの`ownerConfirmed`だけを認証とせず、fresh本人／Asset/SHA／Recipe版／編集・書出し権限Gateが必要。修復結果の自然さは実写真／RAWと本人レビューで別に確認する。

続けて明示選択UI→Before/After→Undo/Redo→型付き非破壊Recipe→CAS保存／再読込→同一修復の実Worker Preview／Finalを接続する。写真固有のmaskや参照領域を別写真Presetへ無条件複製しない。将来0313〜0315を実装するには衣服識別・細／粗しわと自然な布目／陰影の評価、0317〜0319には衣服境界・隣接物体保護と手動訂正maskが別途要る。Mobileの上下分割、汗染み、Preset/Sync、性別・年齢に基づく選択はそれぞれ独立Gateとし、公式非公開の数値式やモデルの同等性を推測しない。

この監査試験は**欠落と拒否の試験**であり、実衣服写真、実RAW、実iPad/iPhone、Cloud、モデル品質、元製品画素同等性は **NOT_RUN / NOT_PROVEN**。0/44を維持する。
