# EV3-0027 Contacts — 独立差分監査

## 2026-10-05 typed構造追加後の追補

後続で写真固有の`contactsIrisManual`構造検証とPersonal/Workspace Presetへの無条件コピー拒否を追加した。偽`contacts` JSONは現在`INVALID_CONTACTS_IRIS_MANUAL_ALIAS`で構造段階から拒否される。以下の「汎用JSON受理」は初回読取り監査時点の記録である。typed保存形式だけで本人・虹彩位置・真正原寸・製品Worker/UI/Finalや公式11スタイルは完成せず、厳密 **0/44** のまま。

判定（2026-10-05）: **元候補ContactsはNOT_IMPLEMENTED**。本監査は資料と現コードの読取り照合で、製品のUI・Recipe・保存・画素処理・Final・Presetを変更していない。独立44候補の厳密PASSは **0/44のまま**。

## 公式で確定する範囲と端末差

| 元下位操作／証拠 | 確定できること | 確定できないこと |
| --- | --- | --- |
| EV3-0027 Style selection | [Desktop Makeup](https://support.evoto.ai/makeup/)、[iPad Makeup](https://support.evoto.ai/makeup-ipad/)、[Mobile Makeup](https://support.evoto.ai/portrait-retouching-makeup/) はContactsを独立Makeup部品として挙げ、各記事に11スタイルを記載する。目の色またはスタイルを変える接触レンズ効果である。 | 11素材の正式名・画素・ライセンス・端末間で同一の実装／保存互換、各スタイルの数式。 |
| EV3-0028 Amount / EV3-0029 Color selection | [一般の目元チュートリアル](https://support.evoto.ai/bring-portraits-to-life-with-evotos-eye-retouch-tools/)はPortrait Retouch → Makeup → Contactsで色を選び、Amountで効果の強さを調整する手順を明記する。 | このチュートリアルには端末指定がない。各端末記事に同じAmount／任意色選択があること、正確な範囲・初期値・11スタイルとの関係は未確定。凍結監査の端末別Amount/ColorはNOT_CONFIRMEDのまま。 |
| 保存・精度の追加要求 | Contactsは虹彩への外観効果であり、[Eyes](https://support.evoto.ai/eyes/)の目の明るさ・白目補正・虹彩位置修正、Eyeshadow、全体Color/HSLとは別対象・別結果。 | Contacts固有の左右独立、瞳孔・虹彩質感・キャッチライト保持、明度・彩度・透過度、写真間人物／Batch同期は公式記事から保証できない。元監査EV3-0039〜0048もNOT_CONFIRMED。 |

凍結した[EV3-0027〜0029](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md)でもStyleのみDesktop/iPad/MobileのDOCUMENTED、AmountとColorの各端末欄はNOT_CONFIRMED。本文の「Makeupは顔特徴を自動検出」はContacts専用の虹彩境界精度、側面顔、眼鏡・遮蔽、複数人物での品質保証にはならない。公式の非公開素材・処理式をSUITEへ推測移植しない。

## 現SUITEとの意味差

| 境界 | 確認結果 |
| --- | --- |
| 顔検出と既存画素 | [faces.mjs](../apps/web/src/processing/faces.mjs)が製品へ返す検出形状は顔oval polygonで、左右虹彩・瞳孔・白目の信頼できるring maskではない。[pure.mjs](../apps/web/src/processing/pure.mjs)の人物処理は`face_brightness`の顔oval露光。Color/HSLやLocal Levelsは色調整だが、レンズのスタイル選択や瞳孔保護を実装しない。手動Makeup Highlight・Blushの部品も頬／ハイライトを対象とし、Contactsではない。 |
| UI／人物 | [editor-ui.mjs](../apps/web/src/editor-ui.mjs)の人物欄は顔検出・人物選択・Face Brightness。Contactsスタイル／色／Amount、左右虹彩の選択、手動ring確認はない。[session.mjs](../apps/web/src/session.mjs)のUndo/Redo・人物プライバシーGateは共通土台であり、Contacts処理の接続証拠ではない。 |
| Recipe／保存 | [portrait-recipe.ts](../apps/backend/src/portrait-recipe.ts)の人物`adjustmentType`は`face_brightness`のみ。汎用Recipeに仮の`contacts` JSONを構造上置けても、Web rendererは`UNSUPPORTED_WEB_ADJUSTMENT`で拒否する。Contacts用のAsset UUID/Original SHA/人物ID・左右虹彩mask・スタイル／Amountのtyped保存・CAS再読込・Historyはない。 |
| Final／Preset／端末 | 現Workerと[session.mjs](../apps/web/src/session.mjs)のFinalはContactsを描画しない。Author portableは未知／写真固有拡張を拒否し、Personal/Workspaceの一般Preset Save/Apply/Reloadは虹彩固有処理を成立させない。[Apple PortraitPipeline](../apps/apple/Suite/Services/PortraitPipeline.swift)もFaceBrightness adapterで、Contacts adapterやWeb↔iPadのContact値往復証拠はない。 |

## 最小の安全な実装単位と残Gate

まず元11スタイルの再現と区別した、**SUITE独自の本人明示・単一写真・虹彩ring内の色効果**を独立単位として検討する。対象Asset UUID/Original SHA/元寸法、本人が確かめた人物IDと左右目、虹彩ring／瞳孔除外maskの出典、選択色・Amountをtyped・boundedで定義する。顔ovalや画面上のクリックだけを虹彩／本人の認証証拠にしない。マスクや人物同一性をfresh authenticated hostで証明できない場合は製品保存・Finalを拒否する。色のSUITE独自アルゴリズムは純粋RGBA8の有限値・alpha/hidden RGB/対象外不変・Abort・proxy/full投影で試験し、Evotoの非公開画素式・11素材と同等とは表現しない。

次にAfter上の明示選択UI、Before/After、Undo/Redo、typed非破壊Recipe、編集権限/CAS、保存再読込、同一OriginalからのWorker Preview/Final、Presetの写真固有mask隔離を単写真で確認する。左右独立／自動虹彩検出／11スタイル／Batch・人物同期は別Gateとして残す。本人同意済み実写真で瞳孔・質感・キャッチライト、眼鏡／髪・横顔・複数人物・暗い虹彩の品質、実RAW・iPad/iPhone・Cloudを検証するまでは元候補をPASSにしない。

今回の監査専用試験は**欠落と誤統合防止**のみを固定する。実処理・実RAW・実機・Cloud・元製品との画素同等性はいずれもNOT_RUN/NOT_PROVEN。
