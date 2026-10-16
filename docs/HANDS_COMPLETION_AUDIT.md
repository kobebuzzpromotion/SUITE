# EV3-0232–0234 Hands — 差分監査

## 2026-10-05 手動限定実装後の追補

SUITE独自の本人明示手/前腕mask内トーン均一化純粋核を追加し、`handToneManual`の型付き写真固有Recipe構造と偽`handEven`/`handVein`/`handReshape` alias拒否を後続で追加中。旧表の「汎用JSON受理」は実装前監査の記録であり現契約ではない。純粋画素と構造の存在は本人認可・手位置証明、Worker/製品Editor/保存済みFinal、Hand Vein/Reshaping、元製品同等性を証明しない。元候補は **0/44**。

判定（2026-10-05）: **3下位操作とも未実装**。汎用の露光・Local Levels、顔ovalの明るさ、手動mask部品はあるが、手・前腕専用の認識、しわ/血管の局所修復、指/手の幾何変形には接続されていない。監査は製品コードを変更せず、厳密完了数は **0/44** のまま。

## 元操作の一次資料と端末差

| 元ID | 公式説明で確定できる操作 | 対象・端末の記載 | 未確定 |
| --- | --- | --- | --- |
| EV3-0232 Even (Dodge & Burn) | 手の見た目を均し、しわの目立ちを抑え、肌の色/質感を滑らかにするスライダー。 | [Desktop Hands](https://support.evoto.ai/hands/)・[Mobile Hands](https://support.evoto.ai/portrait-retouching-hands/)に記載。 | 手領域の判定器、画素式、範囲/初期値、人物別・左右別操作、実出力は記事から確定できない。汎用Dodge/Burnの同名処理とも断定しない。 |
| EV3-0233 Hand Vein | 手と前腕の目立つ血管を弱めるスライダー。記事は「完全に消す」保証ではない。 | [Desktop Hands](https://support.evoto.ai/hands/)、[Mobile Hands](https://support.evoto.ai/portrait-retouching-hands/)、[iPad Hands](https://support.evoto.ai/hands-ipad/)に明記。 | 血管検出/修復式、血管外の保護、強度数値、各端末の画素同等性。 |
| EV3-0234 Hand Reshaping | 手を細く整えるスライダー。Desktop記事は指を細くし掌を小さくすることを明記し、Mobile記事は自然な比率を保つ「intelligent reshaping」と説明する。 | Desktop/Mobile記事に記載。iPadの専用Hands記事にはこの見出しがない。 | 幾何warp、境界/背景保護、左右別、可動域、iPad実装の有無。iPad記事の非記載を「不存在」の証拠にしない。 |

元監査の [Feature Master](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md) と [Platform Matrix](EVOTO_AUDIT/EVOTO_PLATFORM_MATRIX.md) はこれら3行を `AUDIT_CANDIDATE_ONLY` としている。公式の機能説明は対象と意図を示すが、実製品の画素一致・端末間互換・保存形式を証明しない。Evoto製品での手動実機試験は今回 **NOT_RUN**。

## 現SUITEとの差分

| 経路 | 現SUITEで確認できるもの | Hands固有の欠落 |
| --- | --- | --- |
| 対象認識と実画素 | [faces.mjs](../apps/web/src/processing/faces.mjs) はFaceLandmarker、[portrait-recipe.ts](../apps/backend/src/portrait-recipe.ts) のtarget型は `face_brightness` のみ。[pure.mjs](../apps/web/src/processing/pure.mjs) は顔ovalの明るさ、全体の露光/色/Detail、手描きLocal Levels maskを処理する。 | 手/前腕/指/掌の対象認識、手専用しわ/血管検出、指/掌warpは無い。顔ovalを手maskに流用しない。汎用明暗変化は元3処理の完成ではない。 |
| Editor UI | [editor-ui.mjs](../apps/web/src/editor-ui.mjs) は全体調整、Face Brightness、Local Levels手動ブラシを表示する。 | 手専用の3操作、手/前腕の本人選択と対象プレビュー、手動血管領域、幾何変形範囲・取消のUIが無い。 |
| Recipe / Undo / Redo / 保存・再読込 | 現Sessionは汎用調整とLocal LevelsをRecipe履歴/CAS保存へつなぐ。[photo-policy.ts](../apps/backend/src/photo-policy.ts) にHands専用のtyped key/対象bindingはなく、汎用JSON受理だけでは実処理の証拠にならない。 | Hands 3操作の型/範囲/対象Asset・Original SHA・人物/手ID・stroke/warp出典、Undo/Redo、CAS保存/再読込の契約が無い。未知Hand keyを黙って実装済み扱いしない。 |
| Preview / Final / Original | [worker.mjs](../apps/web/src/processing/worker.mjs) は既存Recipeの表示/書き出しを行う。Originalは非破壊。 | 手専用のProxy/Final画素差、手/前腕外不変、alpha/背景保護、Original SHA不変の3操作別の統合試験が無い。 |
| Preset / Workspace / Sync | 既存のPersonal/Workspace/Author/CommunityやBatch適用は汎用/既存調整用。 | 手という写真固有の対象geometry/maskを別写真へ無条件コピーできない。安全なPreset値と写真固有bindingの分離、対象再選択、版固定Syncは未設計・未試験。 |
| 端末 | SUITE Webの操作/UI試験は存在する。 | iPad/iPhone実機・Safari・Desktop間の手対象/座標/Recipe/Preset互換性は **NOT_RUN**。公式記事の記載差からSUITEでの端末合格を推定しない。 |

## 重複判定と安全な次の実装単位

Evenは明暗の均一化という**処理の一部**が既存Local Levelsと重なるが、対象限定・しわ/質感の扱いは別。Hand Veinは血管の局所構造を弱める処理で、明暗だけでは代用できない。Hand Reshapingは座標変形なので、Local LevelsやFace Brightnessとは別。3操作を1つの汎用sliderとして「統合済み」と扱わない。

最初の非AI小経路は、本人がAfter上で**手/前腕の対象を明示的に描く**手動maskと、SUITE独自の限定的なトーン均一化である。まず写真固有のtyped文書（Asset/Original SHA/原寸/保存Recipe版は実行時にfresh照合、normalized ADD/ERASE stroke、強度上限）とProxy/Final用mask再現を設ける。次にmask内だけのRGBA8トーン処理を純粋部品として実装し、mask外/alpha/入力/Original不変・Abortを試験する。認証済みTrial/Workspaceの本人権限・CAS/再読込を通してUI/Undo/Redo/Finalへつなぐまで、この部分も製品完成とは数えない。

この小経路はEvoto Evenの自動手認識・しわ処理との同等性を**主張しない**。Hand Veinには本人が血管/参照領域を指定する別の局所修復核と血管外保護、Hand Reshapingには明示メッシュ/変位と背景保護・変形の安全上限が別途必要。公式記事はそれらのアルゴリズムや学習モデル・画素出力を開示しないため、推測で元製品同等やAI自動処理と表示しない。

実RAW、実人物/肌色品質、本人同意、手/血管AI自動認識、iPad/iPhone実機、Cloud、元製品との画素同等性、3操作の製品UI/保存/Finalは **NOT_RUN / NOT_PROVEN**。次の排他実装はメインの割当後に行う。
