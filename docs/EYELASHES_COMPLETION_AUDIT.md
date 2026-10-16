# EV3-0023 Makeup components / Eyelashes — 差分監査

判定（2026-10-05）: **NOT_IMPLEMENTED / 0/44**。これは一次資料と現SUITEの読取り監査であり、画素処理や製品導線の実装ではない。

## 確認できた元操作と端末差

| 一次資料 | Eyelashesについて明記されたこと | この資料からは確定しないこと |
| --- | --- | --- |
| [Evoto Desktop Makeup](https://support.evoto.ai/makeup/) | 個別Makeup componentとして17スタイル。左右を連動または個別に調整でき、まつ毛素材の左右独立も記述。 | スタイルの画像素材、幾何配置、画素合成式、各スタイルIDの端末間対応。 |
| [Evoto iPad Makeup](https://support.evoto.ai/makeup-ipad/) | 14スタイル。左右連動／個別調整が可能。 | Desktopの17種類との包含・互換関係。 |
| [Evoto Mobile Makeup](https://support.evoto.ai/portrait-retouching-makeup/) | 17スタイル。左右連動／個別調整が可能。 | Desktopとの同一素材・同一画素結果。 |

上記ページはMakeup全般で顔・関連領域の自動検出を説明する。ただし、**Eyelashes専用**の眼瞼・まつ毛輪郭の検出精度や配置規則を記載したものではない。`Makeup Looks` 全体や `Eye Makeup` のAmountはEyelashes単体のAmountの証拠ではない。凍結監査の [EV3-0023](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md) はStyle selectionが `DOCUMENTED`、隣接する EV3-0024 Eyelashes Amount は `NOT_CONFIRMED`。公式記事からEyelashes固有の値域を推測しない。

Eyelinerは瞼の線、Contactsは虹彩・レンズ、Detailは一般的な画像ディテール、Eyelashesはまつ毛スタイル素材の適用であり、名称の近さで統合しない。上記公式ページでもEyelinerとContactsはEyelashesから独立したcomponentとして列挙されている。

## 現SUITEとの意味差

| 経路 | 現在確認できるもの | Eyelashesとして不足するもの |
| --- | --- | --- |
| 人物・実画素 | [portrait-recipe.ts](../apps/backend/src/portrait-recipe.ts) は人物targetの`face_brightness`のみを型付けし、[pure.mjs](../apps/web/src/processing/pure.mjs)はその顔明度を処理する。手動Makeup Highlight/Blushは別の明度・頬彩色である。 | 左右眼・まつ毛の境界、選択スタイルの素材・形状、まつ毛の実画素合成、人物別連続性。顔の明るさやDetail処理では代替不可。 |
| Recipe / Undo・Redo / 保存・再読込 | Recipe v1に一般の拡張JSONが構造上通る余地はある。しかしEyelashes用のtyped値・左右状態・素材版・写真/人物bindingはない。偽`eyelashes`拡張は現Rendererで`UNSUPPORTED_WEB_ADJUSTMENT`となる。 | 実装済み操作として保持・再生する安全なEyelashes契約、本人/人物・Original SHA・版の照合、Undo/RedoとCAS保存の検証。構造上の受理は実装証拠ではない。 |
| Editor UI / Preview / Final | [editor-ui.mjs](../apps/web/src/editor-ui.mjs) は人物選択とFace Brightness等を持つ。[session.mjs](../apps/web/src/session.mjs) と[worker.mjs](../apps/web/src/processing/worker.mjs) にEyelashes操作はない。 | 端末別のスタイル選択、左右連動/個別UI、実写真プレビュー、保存済み選択を反映したFinal Blob。 |
| Preset | [Author portable preset契約](../apps/web/src/preset-author/preset-author-contract.mjs) は未知の写真固有拡張を拒否する。Node/Trialの一般的なRecipeまたはPreset保存が可能でも、Eyelashes専用の意味・素材互換・人物bindingを証明しない。 | Personal/Workspace/Community/Authorでの適用可能範囲、写真固有選択を無条件コピーしない境界、再読込/Finalと端末間の素材版対応。 |

## 安全な最小実装単位と残Gate

最初に実装可能なのは、**Evoto互換を名乗らないSUITE独自の本人手動・片眼単位のまつ毛適用契約**である。権利を確認した明示素材を用意したうえで、Asset UUID/Original SHA/人物ID/左右眼/原寸/保存版/素材IDと版を厳格に束縛し、左右連動と個別変更を明示する。写真・人物のfresh権限/プライバシーGate、原寸とProxy双方の位置・遮蔽の試験、alpha/非対象画素不変、Abort/容量、Recipe CAS・Undo/Redo・再読込/Finalまで一経路で検証する。素材や眼周辺の幾何が未確定のまま、見た目だけの17/14スタイル一覧やダミーSliderは置かない。

元候補EV3-0023を完了とするには、各端末で明示されたスタイル数と左右操作を実画素・UI・保存/再読込・Final・Presetまで検証する必要がある。Style素材の権利・定義、眼/まつ毛検出と遮蔽、眼鏡・閉眼・複数人物・多様な顔/肌の品質、実RAW、iPhone/iPad実機、Cloud/同期、元製品との画素同等性は **NOT_PROVEN / NOT_RUN**。EV3-0024 Amountは下位操作自体が **NOT_CONFIRMED** であり、今回の実装対象としない。
