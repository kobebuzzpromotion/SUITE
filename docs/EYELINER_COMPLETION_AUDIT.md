# EV3-0025 Makeup components / Eyeliner — 差分監査

判定（2026-10-05）: **NOT_IMPLEMENTED / 0/44**。一次資料と現SUITEの読取り照合であり、Eyelinerの画素処理・製品導線を実装した報告ではない。

## 公式一次資料で確定する範囲

| 端末・一次資料 | Eyelinerについて確定する操作 | 確定しない詳細 |
| --- | --- | --- |
| [Evoto Desktop Makeup](https://support.evoto.ai/makeup/) | Individual Makeup Components中の独立したEyeliner style選択、9スタイル。 | 9素材そのもの、線幅・色・配置・合成式、Eyeliner固有の左右連動/個別設定。 |
| [Evoto Mobile Makeup](https://support.evoto.ai/portrait-retouching-makeup/) | 独立したEyeliner style選択、9スタイル。 | Desktopの9素材との同一性、端末間のstyle ID対応、実画素の一致。 |
| [Evoto iPad Makeup](https://support.evoto.ai/makeup-ipad/) | 6デザインで、眼形状に合う様々なstyleと強さがある。 | Desktop/Mobileの9種類との包含関係、個別デザインの素材・パラメータ範囲・配置式。 |

公式記事はMakeup全般の顔・適切な領域の自動検出を説明するが、Eyeliner専用の眼瞼線検出、閉眼・遮蔽・眼鏡への規則は記載していない。Desktop/Mobile記事の「多くのcomponentが左右連動/個別をサポート」はEyeliner固有の保証ではなく、Eyebrows/Eyelashesについてだけ左右独立を具体的に記述している。iPadの「強さ」の表現や全Makeup LooksのAmountを、Eyeliner固有の名前付きAmount Slider・値域へ読み替えない。凍結監査 [EV3-0025](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md) はStyle selectionを `DOCUMENTED`、隣のEV3-0026 Eyeliner Amountを `NOT_CONFIRMED` とする。元資料の未公開style素材・線幅・画素式を推測して9/6個の完成済みUIにしない。

意味境界: **Eyelinerは瞼に沿う線のstyle**、Eyelashesはまつ毛素材・根元から先端の形、Contactsは虹彩・レンズ効果、Eyeshadowは瞼面の陰影・色面、既存のEye Makeup Amount/Saturation/Brightness/Dimensionalityは元の目元Makeup全体の調整である。公式記事はこれらを別componentとして列挙しており、名称や領域が近いだけで同一処理とみなさない。[公式Makeup guide](https://support.evoto.ai/enhance-your-portraits-with-evotos-advanced-makeup-feature/)も、既存Makeupの強化と新しいEyeliner componentの追加を異なるワークフローとして説明する。

## 現SUITEとの意味差

| 経路 | 現在確認できるもの | Eyeliner固有の不足 |
| --- | --- | --- |
| 顔・実画素 | [faces.mjs](../apps/web/src/processing/faces.mjs) の同梱FaceLandmarkerは顔ovalを検出し、[portrait-recipe.ts](../apps/backend/src/portrait-recipe.ts) の人物targetは `face_brightness` に限定される。Blush/Makeup Highlight/隣接するEyelashes手動核は別目的。 | 対象人物と左右の眼瞼線の確認、線styleの素材と配置、Eyelinerの独立した画素合成。顔oval・頬彩色・まつ毛線をEyelinerと称することはできない。 |
| Recipe / Undo・Redo / 保存・再読込 | 後続の限定実装で、写真固有`eyelinerManual`のtyped文書とPresetへの誤コピー拒否を追加済み。偽`eyeliner` aliasは保存前に拒否する。 | 公式style/素材版、実Asset・本人privacy付き保存と再読込、Undo/Redoから製品画素への経路。typed JSONだけでは完成ではない。 |
| Editor / Proxy / Final | [editor-ui.mjs](../apps/web/src/editor-ui.mjs) は人物選択・顔の明るさを持つが、[session.mjs](../apps/web/src/session.mjs) と[worker.mjs](../apps/web/src/processing/worker.mjs) にEyeliner操作はない。 | style選択または明示的な手動線のUI、実写真Preview、保存済みRecipeを反映したWorker Final、失効・切替・Beforeでの安全な停止。 |
| Preset / Sync / 端末 | [Author portable契約](../apps/web/src/preset-author/preset-author-contract.mjs) は未知の写真固有拡張を拒否する。一般的なPreset全体保存・適用はEyeliner専用の素材・人物/Asset scopeを保証しない。 | Personal/Workspace/Community/Authorでの独立成分と写真固有bindingの分離、スタイル素材版固定、保存/適用/再読込/Final、端末ごとの9対6差分と互換性。 |

## 次の安全な最小単位と残Gate

まず実装できるのは、**Evotoの9/6スタイル互換を名乗らないSUITE独自の本人明示・眼瞼線手動補正**である。対象人物と片眼/両眼を本人が選び、瞼に沿う正規化曲線とSUITE固有の有限な色/不透明度/線幅を明示して、非対象RGB・alpha・Originalを維持する純粋処理から始める。まつ毛の根元→先端の線群やEyeshadowの面塗りと区別する。手動指定は眼瞼位置・本人権限の証明ではないため、Asset UUID/Original SHA/人物ID/原寸/保存版と、fresh認証・人物privacy/同一写真連続性を別Gateで照合する。Abort、負荷上限、眼鏡/閉眼/遮蔽・多人数でのfail-closedを試験し、typed Recipe→Worker Proxy/Final→Editor Undo/Redo→CAS保存/再読込まで接続して初めてSUITE独自の限定経路として扱う。

元候補EV3-0025の全要素には、公式9/6スタイル素材の使用権・定義、端末間対応、顔/眼瞼自動配置、元製品との画素式・品質、Preset/Sync、実RAW、iPhone/iPad/Desktop実機、Cloudが必要で、いずれも **NOT_PROVEN / NOT_RUN**。EV3-0026固有Amountは **NOT_CONFIRMED** であり、今回の監査を根拠にDummy Sliderを追加しない。
