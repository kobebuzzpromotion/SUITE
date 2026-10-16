# EV3-0037 Face Decorations — 独立差分監査

## 後続の限定実装（下記読取り監査より優先）

SUITE独自の本人明示そばかす点描純粋核、および写真固有`faceDecorationsManual` typed Recipe/Preset転用拒否を後続で追加した。偽`faceDecorations` aliasと公式style自称は保存前に拒否する。これらは公式6素材の再現でも製品Editor/Worker/Finalの接続でもない。実登録Asset保存Gate、人物privacy、真正Original、実RAW/実機/Cloudは別Gateで、元候補完了数は0/44のまま。以下の「純粋核/typed文書が無い」は監査時点の履歴として読む。

判定（2026-10-05）: **元候補はNOT_IMPLEMENTED**。本件は一次資料と現SUITEの読取り監査のみ。Recipe・UI・画素・保存・Finalは変更しない。独立候補の厳密完了数は **0/44のまま**。

## 公式で確認できる下位操作・端末差

| 出典 | 確認できること | 限界 |
| --- | --- | --- |
| [Evoto Desktop Makeup](https://support.evoto.ai/makeup/) | Face Decorationsは独立Makeup componentで、現行6種類はすべてそばかすスタイル。Makeup全体の説明は顔と関連領域の自動検出。 | 6素材の実体・正式ID/ライセンス、スタイル別点配置・色・透明度・合成式、Face Decorations固有Amountの数値範囲や左右設定は未公開。顔検出一般論はそばかす配置精度の証明ではない。 |
| [Evoto iPad Makeup](https://support.evoto.ai/makeup-ipad/) | 6つのFace Decorationsを挙げ、すべてそばかすスタイルと説明する。 | Desktopと同一素材・画素・保存互換・Batchがあるとは確認できない。 |
| [Evoto Mobile Makeup](https://support.evoto.ai/portrait-retouching-makeup/) | 同じく6つのそばかすFace Decorationsを挙げる。 | iPhoneとDesktop/iPadの同一処理式・Preset/Final契約までは確認できない。 |
| [Evoto公式Freckles Filter](https://www.evoto.ai/features/freckles-filter) | 公式Web紹介はFace Decorationでstyleとintensityを選びPreview/Exportする手順、Desktopでは設定をPresetに保存してBatchに適用できる旨を述べる。Webアップロード欄はJPEG/JPG/PNG/WebPを列挙。 | この紹介をEV3-0038 Amountの**各端末実装証拠**や6種類の素材提供、任意RAWのWebアップロード保証へ拡張しない。Preset/Batchの実際の版数・人物追従・画素同等性も未記載。 |

[凍結監査表](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md)のEV3-0037はStyle selectionをDesktop/iPad/MobileでDOCUMENTEDとし、隣のEV3-0038 Amountは各端末ともNOT_CONFIRMEDとする。後発の公式Web紹介にintensity記述があることは**Web紹介の追加証拠**だが、凍結した端末別判定や数値仕様を黙って上書きしない。正確な6スタイル画像・パターン・制御範囲は未確定。

## 現SUITEとの意味差

| 境界 | 読取り照合 |
| --- | --- |
| 顔/画素 | [faces.mjs](../apps/web/src/processing/faces.mjs)は顔oval polygon検出を返すが、頬・鼻へのそばかす点配置や既存そばかすの識別、皮膚/目/口の保護maskは持たない。[pure.mjs](../apps/web/src/processing/pure.mjs)の`face_brightness`は顔ovalの明度処理で、点状模様の追加ではない。Blushの面彩色、Eyeshadowの眼周囲彩色、Contactsの虹彩ring彩色も対象・入力・出力が別。Blemishのそばかす**除去**とも逆方向であり統合しない。 |
| Editor/Session | [editor-ui.mjs](../apps/web/src/editor-ui.mjs)は顔選択/Face Brightnessなどを出すが、Face Decorationsの6スタイル選択・そばかす位置/強度確認はない。[session.mjs](../apps/web/src/session.mjs)の汎用Undo/Redo/Before/Afterは、この機能が接続された証拠ではない。独立Blush/Eyeshadow/Contacts UI部品も製品Editorへ未mount。 |
| Recipe/保存/History | [photo-policy.ts](../apps/backend/src/photo-policy.ts)にFace Decorations固有typed文書はなく、[portrait-recipe.ts](../apps/backend/src/portrait-recipe.ts)の人物targetは`face_brightness`のみ。仮の汎用JSONをRecipeに置けたとしても[renderer](../apps/web/src/processing/pure.mjs)は未知拡張を拒否する。Asset UUID/Original SHA/人物・元寸法/素材ID/配置・強度の非破壊保存、CAS再読込、Historyは未接続。 |
| Final/Preset/端末 | [session.mjs](../apps/web/src/session.mjs)のFinalは同機能を描画しない。Author portableおよびPersonal/Workspace Presetの存在は、写真固有のそばかす位置を安全に移す処理ではない。元製品の6素材・Desktop Batchの人物/写真間再配置、Web↔Apple Recipe互換は未証明。[Apple PortraitPipeline](../apps/apple/Suite/Services/PortraitPipeline.swift)もFace Decorations adapterではない。 |

## 権利・privacyを守る最小安全単位と残Gate

第一段階の候補は、元6スタイルの複製ではない**SUITE独自・本人明示・単一写真の手動そばかす点描**。独自の点/ブラシ・色・強度のみを製品側で設計し、Evotoの素材画像・名称・非公開数式を抽出/模倣しない。本人が確認した写真・人物・対象領域について、Asset UUID/Original SHA/原寸/保存版とbounded正規化点/半径/色/不透明度をtypedに保持する。顔ovalやcallerの`personID`/mask自称を本人認証・頬鼻の正確な位置・同意の証拠とせず、fresh編集権限/人物privacy/Original decode原寸のGateが無い場合は保存・Finalを拒否する。未成年写真を含む高リスク品質を別途確認する。

純粋RGBA8部品では対象外・目/口・alpha・透明hidden RGB・Original不変、有限値/容量/Abort、Proxy/原寸への同じ正規化投影を試験する。次に本人After UI→Undo/Redo→typed Recipe→CAS保存/再読込→内部Worker Preview/Final、既存調整・Preset写真固有データ隔離を単写真で結ぶ。スタイル素材を正当に調達して6種の仕様・権利/ライセンス・品質を確認するまで、元EV3-0037の6スタイル完成とは数えない。Web/Apple実機、実RAW、Cloud、自然な肌・既存そばかす・複数人物/横顔・写真間再配置、元製品画素同等性は **NOT_RUN / NOT_PROVEN**。

この監査試験は欠落と誤統合防止だけを固定する。製品処理・安全Gate・実画素のPASS試験ではない。
