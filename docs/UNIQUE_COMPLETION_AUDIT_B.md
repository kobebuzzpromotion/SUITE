# 完了台帳 5〜7 の元候補対応監査（担当B）

監査日: 2026-10-04。対象は `docs/UNIQUE_FEATURE_PROGRESS.md` の「接続・自動試験済み」5〜7。製品経路の合成データ試験が通ったことと、元候補に含まれる操作・出力が全て揃ったことは別の判定とする。元製品の非公開アルゴリズムとの画素完全一致は主張しない。SUITE の実RAW・実機・公開環境での結果も本監査では未確認。本書は読取り監査であり、実装・進捗台帳・母数は変更していない。

| 台帳 | 元候補・根拠 | SUITEで接続を確認できる範囲 | 残る操作・出力差分 | 一件完了判定 |
| --- | --- | --- | --- | --- |
| 5 書き出しサイズ指定 | `EV3-0757` は元一覧で「Desktop Export size」。元ツリーでは同グループに Percentage `0757`、Width & Height `0758`、Dimensions `0759`、Long Edge `0760`、Short Edge `0761`、PPI `0762`、PPC `0763`。Evoto公式もこれらを出力サイズ・解像度設定として説明する。 | Final画素に対する original / percentage / width / height / fit の縮小計画とRGBA再サンプリング。UI、Worker、session に接続。縦横比保持、拡大拒否、Original/Recipe不変。 | 独立した Width **and** Height / Dimensions の指定（現 `fit` は指定枠への縦横比保持縮小で別意味）、Long/Short Edge の直接指定、PPI/PPCの出力解像度メタデータは未接続。UIは「拡大と印刷実寸の指定には対応しません」、JPEG/PNGのブラウザ既定dpiで印刷dpi非保証と明記。個々の欠落を他の項目名の類似で埋めたとは言えない。 | **一部のみ。元の Desktop Export size 全体の一件完了は維持不可。** Percentage `0757` 単独の限定実装なら説明可能だが、台帳の親グループ名と混同しない。 |
| 6 Mobile Glow Effect | `EV3-0560` は元一覧で親表示名。元ツリーは White Mist `0560`、Black Mist `0561`、Halation `0562`、Intensity `0563`、Radius `0564`、Threshold `0565`、Exposure `0566`、Diffusion `0567`、Tint `0568`、Show Glow Mask `0569`。Evoto公式も3モードと6調整値、マスク表示を明記。 | SUITE独自の8-bit sRGB明部Glow。intensity / radius / threshold がUI→Recipe→レンダラ→Finalに接続。アルファ保持・原本不変を実装。 | White Mist / Black Mist / Halation の選択と固有画作り、Exposure / Diffusion / Tint、影響領域の Show Glow Mask がない。現方式は明部の単一ブルームで、どのEvotoモードの完全代替とも立証できない。マスクは確認用プレビューであり、Final画素への効果ではない点も区別する。 | **一部のみ。元の Mobile Glow Effect 全体の一件完了は維持不可。** |
| 7 RGB/channel Point Curves | 元137一覧には `LR-05 Lightroom RGB and channel Point Curves`。Adobe公式は RGB/赤/緑/青の選択、グラフ上で点の追加・ドラッグ編集・削除、チャンネル初期化を説明し、任意の Linear / Medium / Strong Contrast と RGBの Refine Saturation も掲載。 | master/赤/緑/青の点列を数値で追加・編集・削除・チャンネル初期化。8-bit sRGB LUTの実画素処理とRecipe/Final経路。グラフは形の表示で、数値入力の代替操作はある。 | 元のグラフ上の点追加・ドラッグ編集は未接続。任意のContrastプリセットとRefine Saturationも未接続。さらに `LR-05` は `docs/UNIQUE_FEATURES_CONFIRMED.md` のID付き37件に存在せず、追加7件の元ID・判定記録も未回収である。よって44件の独立候補へ本項を割り当てた根拠が確認できない。Evotoの別候補「Curves」`EV3-0463` と取り違えない。 | **実画素の核は接続済みだが、一件完了は保留。** 欠けた操作範囲と44件母数への対応根拠を先に確定する。 |

## 照合した一次資料・リポジトリ根拠

- Evoto公式 [Import & Export / Image Size](https://support.evoto.ai/how-to-use-import-export/)：Percentage、Width & Height/Dimensions、Long/Short Edge、PPI/PPCを区別する。リポジトリ内の元ツリーは `docs/EVOTO_AUDIT/EVOTO_FEATURE_TREE.md` の Desktop Export size 節、元一覧は `SUITE_feature_types_2026-10-03.txt` の `EV3-0757`。
- Evoto公式 [Color / Glow Effect](https://support.evoto.ai/color-adjustments-module/)：White Mist、Black Mist、Halation、6値、Show Glow Maskの意味。元ツリーは同ファイルの Mobile Glow Effect 節、元一覧は `EV3-0560`。
- Adobe公式 [Lightroom desktop / Point Curve](https://helpx.adobe.com/jp/lightroom/desktop/edit-photos/edit-photos.html)：4チャンネルと点操作、任意のカーブ選択、彩度の調整。元一覧 `LR-05` と `docs/UNIQUE_FEATURES_CONFIRMED.md` の37 IDを別々に照合した。
- SUITE接続: `apps/web/src/export-size.mjs`、`apps/web/src/editor-ui.mjs`、`apps/web/src/session.mjs`、`apps/web/src/processing/{index,worker,glow,point-curves,pure,encode}.mjs`、`apps/backend/src/photo-policy.ts`。対応するWeb試験は実装経路の自動確認であり、上記元候補の全操作・出力の完全対応を証明しない。

## 件数上の推奨

5〜7の**元の親候補を丸ごと一件完了として維持できるものは現時点で0件**。既存の3実装を撤去する意味ではない。台帳では「一部接続・自動試験済み」と「元候補の全要素完了」を分け、37/44の出典がない `LR-05` の算入は判定記録回収まで保留する。元候補の固有操作を追加する際も、名称だけで重複統合せず、実処理・保存・Finalと操作可能性をそれぞれ確認する。
