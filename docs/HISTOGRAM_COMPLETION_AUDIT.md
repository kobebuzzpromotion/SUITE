# LR-02 Histogram and clipping — completion audit

2026-10-04。対象は `SUITE_feature_types_2026-10-03.txt` の `LR-02`。元の操作は [Adobe公式 Lightroom 編集ガイド](https://helpx.adobe.com/ie/lightroom/desktop/edit-photos/edit-photos.html) の Histogram／shadow・highlight clipping 節で確認した。以前の `docs/UNIQUE_COMPLETION_AUDIT_A.md` はUI接続前の時点記録であり、以下は現コードの再監査である。

| 元の下位操作・境界 | 現SUITEの証拠 | 判定 |
| --- | --- | --- |
| ヒストグラム表示 | `processing/histogram.mjs` は描画後RGBA8を1画素1票でRGB＋Rec.709 encoded Y′の256 binへ集計。`session.mjs` の `refreshPreview` が実rendered bufferから再計算し、`editor-ui.mjs` の4本のSVG曲線へ表示。asset切替・失敗時はinvalidate。 | **SUITE限定の4ch表示あり**。RAWセンサー値やscene-linear露光量ではない。 |
| Histogram全体の表示切替 | Adobe公式はEditの三点メニューから`Show Histogram`を選択すると説明する。現SUITEは既存Light節の図の外に「ヒストグラムを隠す／表示」buttonを常設し、`aria-controls`／`aria-expanded`と既存44px・focus可視スタイルで図だけを隠し、同じbuttonで復帰する。非表示中もSession側の計測、写真上overlay、`J`、左右選択、RecipeとFinalは不変。`histogram-visibility-setting.test.mjs`はローカルの配線・安全境界を確認する。 | **SUITE限定の表示/非表示あり**。Adobe三点メニューの再現や設定永続化は主張しない。 |
| 黒側／白側クリッピングの写真上警告 | `histogram.mjs` の端値mask（初期0/255、any/all channel）から `clipping-overlay.mjs` が青／赤／両方の透明RGBA overlayを作成。`session.mjs` はAfterとは別Blob URLに保持し、`editor-ui.mjs` はAfter/Splitの写真上に配置、Beforeでは非表示。透明元画素は警告なし。 | **両側まとめた警告あり**。写真上の警告はPreview専用でRecipe値ではない。 |
| 左右のクリッピング指標の個別クリック／再クリック、`J`で両側切替 | Adobe公式は左シャドウ・右ハイライトの点灯指標を各々クリックして表示／非表示、`J`で両側切替と説明。**旧監査時点の「単一toggleだけ」は現在のコードには当てはまらない**。現`editor-ui.mjs`は`#clipping-shadow-toggle`／`#clipping-highlight-toggle`を個別に作り、それぞれ`aria-pressed`と44pxの操作領域を持つ。`nextClippingSides`と側別overlay URLで黒のみ／白のみ／両方／なしを切り替え、`J`は両側の一括切替。Before・権限失効時は無効化し、Asset変更で両側reset。`histogram-clipping-sides.test.mjs`が合成RGBA8と状態遷移、Preview専用・Final非混入を確認。 | **SUITE限定の左右個別切替あり**。画面実操作と実RAW上の表示同等性は別Gate。 |
| 指標表示設定 | Adobe公式はWindows右クリック／macOS Cmd-clickでHistogramの`Show Clipping in Histogram`を解除すると、Histogram内の指標を隠すと説明。現SUITEはHistogram上のcontextmenuから同名の設定buttonを開き、同設定へ常時表示のキーボード操作可能なbuttonからも到達する。切替は指標containerの表示だけで、写真overlay選択・`J`・左右状態・Recipe・Finalを変更しない。新規`histogram-indicator-setting.test.mjs`はUI配線と従来の状態遷移をローカルで確認。 | **SUITE限定の指標表示/非表示あり**。公式UI配置・設定永続化の同等性は未証明。 |
| ヒストグラムからの直接トーン操作 | `editor-ui.mjs` がBlacks/Shadows/Exposure/Highlights/Whitesの5領域を写真分布上のbuttonとして作成、pointer dragと左右矢印キーを受ける。`histogram-tone-drag.mjs` が既存`color.*`または`exposure`値へclampして`setAdjustment`する。 | **SUITE限定の直接操作あり**。Adobeのドラッグ感度・階調式・画素同等性は未証明。 |
| Undo／Redo、保存／再読込、Final | 5領域は既存Recipe keyを書き換えるため `EditorSession.commitRecipe` の履歴・権限・dirty、`undo`/`redo`、CAS `save`、`reload`、保存済みRecipeを固定する`exportFinal`に乗る。警告overlay URLはこのRecipeにもFinal render/encode引数にも入らない。新規 `histogram-completion-audit.test.mjs` は合成非RAWで4ch/警告、5値、Undo/Redo→CAS保存→再読込→Final画素差、overlay非混入、Original SHA不変を2件実測。既存`histogram-clipping-editor-browser` fixtureはUI→Worker用だが、Nodeのbundle試験だけを実Chrome実操作PASSと数えない。 | **合成RGBA8経路でPASS**。実RAW・公開Cloud・実機色管理は別Gate。 |

## 次に安全に埋める差分

1. 既存の `histogram-clipping-sides-editor-browser` 等は合成非RAW用fixtureを持つが、今回のローカルNode試験を実Chromeのnative pointer／実機画面操作PASSに読み替えない。全体hide/show、黒側のみ・白側のみ・両側・なし、`J`、Before、Undo/Redo、Final非混入を現製品画面で再確認するのは後段Gate。
2. 表示設定の永続化、Adobeの三点メニュー配置、RAWセンサー段階の閾値、色管理後の実画面同等性は根拠・実測が不足するため推測実装しない。

Adobeの点灯閾値、設定永続化、RAWデータ段階でのクリッピング判定、色管理済み実ディスプレイ上の見え方は、今の資料・試験から同等とは断言しない。したがって`LR-02`の**元候補全要素完了は未判定／未達**であり、上記の合成試験だけで44件の完了数を増やさない。
