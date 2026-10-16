# EV3-0030 Makeup components / Blush — 差分監査

## 2026-10-05 独立Worker追加後の追補

保存済み`blushManual`を明示的な[独立Worker操作](../apps/web/src/processing/worker.mjs)へ渡し、strokeからmaskを再生成して実RGBA8へSUITE独自の手動彩色を行える。Asset/SHA/person/保存版/寸法/出典を再検証し、通常renderは未認証Blushを黙示無視せず拒否する。これは製品Editor/Session/Finalで本人・人物のfresh認可を得て実写真へ通す経路ではない。公式12スタイルや元製品の画素・頬位置とも異なり、元候補は **0/44 のまま**。以下の旧「Workerなし」は独立Worker追加前の監査時点を記す。

判定（2026-10-05）: **元候補は未完了**。最初の読取り監査後、SUITE独自の手動単色彩色核と写真固有のtyped Recipe構造検証を追加した。製品Editor/Worker/SessionのPreview・保存・Finalには未接続であり、厳密な完了数は **0/44 のまま**。

## 元操作と一次資料の範囲

元監査の [EV3-0030](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md) は `Portrait → Makeup components / Blush → Style selection`。隣の EV3-0031 `Blush → Amount` は元監査で **NOT_CONFIRMED** であり、EV3-0030の確定下位操作に昇格させない。

- [Evoto Desktop Makeup公式](https://support.evoto.ai/makeup/) の「Individual Makeup Components」はBlushを独立した構成要素とし、**12種類のスタイル**を明記する。スタイル10〜12のアイコンには子ども・乳幼児向けの注記がある。Makeupモジュール全般は顔と関連領域を自動検出する、と説明される。
- [Evoto iPad Makeup公式](https://support.evoto.ai/makeup-ipad/) もBlush 12種類、スタイル10〜12の子ども・乳幼児向け注記を記載する。[Evoto Mobile Makeup公式](https://support.evoto.ai/portrait-retouching-makeup/) もBlush 12種類を記載する。ただし各ページの記載差を、SUITEの端末間同一画素や操作同一性の証明にしない。
- 「各componentは個別に適用・調整可能」という一般文はあるが、上記ページから**Blush専用Amountの数値範囲、12スタイルのRGB素材・頬位置・形状・合成式、人物別/左右別適用、参照出力**は確定できない。Makeup Looks全体のAmountスライダーをBlush固有のAmountと読み替えない。

## 現SUITEと固有差

| 経路 | 現在の実装・重なり | EV3-0030との差 |
| --- | --- | --- |
| 実画素 | [faces.mjs](../apps/web/src/processing/faces.mjs) と `face_brightness` は本人選択の顔ovalを明るくする。[local-levels.mjs](../apps/web/src/processing/local-levels.mjs) と [manual-makeup-highlight.mjs](../apps/web/src/processing/manual-makeup-highlight.mjs) はトーン/明るさ処理。後続の [manual-blush-color.mjs](../apps/web/src/processing/manual-blush-color.mjs) は明示mask内にSUITE独自の単色彩色を行う純粋部品。 | 頬の自動選択・12スタイル素材/形状の処理ではない。純粋部品だけでは製品画像へ接続されない。 |
| Editor UI | [editor-ui.mjs](../apps/web/src/editor-ui.mjs) は人物選択・顔の明るさ・Local Levelsを表示する。手描きHighlightの [独立UI部品](../apps/web/src/manual-makeup-highlight-ui.mjs) は存在するが製品Editorにはmountされていない。 | Blushのスタイル一覧・選択結果・人物別頬プレビュー・明示適用操作がない。 |
| Recipe / Undo / 保存 | [portrait-recipe.ts](../apps/backend/src/portrait-recipe.ts) の人物targetは `face_brightness` のみ。`makeupHighlightManual` は別機能。監査時点では未知JSON `blush` が構造上通り得たが、後続の [photo-policy.ts](../apps/backend/src/photo-policy.ts) は偽`blush` aliasを拒否し、Asset/SHA/person/原寸・ADD/ERASE頬stroke・色/不透明度の`blushManual`構造のみ検証する。 | typed構造の受理は本人認可・人物確認・Preview/Undo/Redo→CAS保存→再読込・実画素の証明ではない。現[pure.mjs](../apps/web/src/processing/pure.mjs) は未接続を拒否する。 |
| Final / Preset | Worker/SessionにBlush操作はなく、Finalへ反映されない。Author portable PresetとNode Workspace/Personal full Presetは写真固有`blushManual`を拒否する。 | 12スタイルFinal画素、写真固有の人物結合・権限・版、Blush用Presetの安全な意味付けは未証明。 |

## 安全な最小実装単位（次の排他割当候補）

第一段階の**SUITE独自の手動・単一頬彩色**として純粋RGBA8核とtyped写真固有Recipe構造を実装した。これは既存Local LevelsやHighlight明度処理とは別の**色を加える処理**であり、Evotoの12スタイルのどれかと称しない。mask出典の自称文字列を本人認証と扱わず、後工程でfresh権限・人物/原本・Recipe版確認が必要。

次に人物/privacy gate、Editorの本人選択・手描き/取消、Preview/Undo/Redo/CAS保存・再読込/Finalを一貫接続する。Presetへ写真固有maskを無条件複製しない境界はNodeで追加したが、Trial/Cloudと製品UIのPreset経路は別途確認する。元候補EV3-0030の**12スタイル選択**を完了判定するには、各スタイルの正当な素材/形状・対象領域・合成結果の根拠を別途取得し、全スタイルの実画素・UI・保存・Final・Presetを検証する必要がある。公開記事から不明な数値や子ども向け処理を推測実装しない。

実写真/RAW、顔・頬自動検出、年齢適合の品質・同意、iPad/iPhone実機、Cloud、元製品との画素同等性、製品UIでの操作は **NOT_RUN / NOT_PROVEN**。専用試験は純粋画素・構造・写真固有Preset拒否の境界に限られ、Blush完成試験ではない。
