# 重複・競合の静的調査 — 2026-10-08

## 結論と対象

元一覧137候補から、一次37＋追加7の44 IDを除いた残りは93候補。93個の新規機能が必要とも、93個が不要とも意味しない。元候補は2026-10-03時点の資料であり、現在の競合製品の最新仕様を再取得した調査ではない。

製品コードは変更せず、テスト・実験・ビルド・接続・配備もしていない。後から不要なものを作らないため、名前の類似ではなく、操作・入出力・対象領域・端末差・処理順序・保存方式を比較する。

93行の機能別判断は `REMAINING_93_OVERLAP_REVIEW.md`。下記はそれとは別の**コード契約10論点**であり、追加機能10件という意味ではない。既存通常Editorと新Astra入口の二重実行は今回の読取りでは確認していない。大半は未接続のため、接続時に顕在化する危険である。

## 接続前に解消すべき契約の食い違い

パスはリポジトリ相対、行はこの調査時点。

| # | 分類 | 根拠 | 問題 | 統合方針案（未実施） |
| --- | --- | --- | --- | --- |
| C1 | 現在の内部矛盾 | `apps/web/src/processing/pure.mjs:18`、`astra-image-model.mjs:13,132`、`astra-generation-core.mjs:40` | 生成側40MP許容に対し共通validatorは24MP。8MP入力の2倍推論は32MPとなり、後段の合成/候補確定で拒否されるコード経路がある。 | 入力/解析/生成出力の容量契約を分け、全経路で一貫した上限を事前判断。共通上限だけを無条件に上げない。 |
| C2 | APIの意味が違う | `masked-inpaint-onnx.mjs:108,112`、`astra-image-model.mjs:113,115,148` | 前者は原寸・mask合成済み・alpha保持、後者は生のモデル出力・alpha255。似たAPIでも同じ関数ではない。 | tensor実行部分の再利用は可能。raw inferenceと完成合成は別契約で保持する。 |
| C3 | 色空間の違い | `astra-image-model.mjs:36`、`apps/web/src/export-size.mjs:184` | 生成側はsRGB値補間、Export側はlinear-light補間。同名resizeの無条件統合で画像が変わる。 | モデル前処理と納品resizeを分離し、色空間/alphaを明示した共通入口を使う。 |
| C4 | 出力形式の違い | `hdr-frame.mjs:9,55`、`encode.mjs:5,13`、`worker.mjs:621` | 新HDRはFloat32線形RGB、既存通常encoderはRGBA8/sRGB。そのまま直結不可。 | HDR出力とSDR previewを別登録。RGBEはHDR出力の一経路でありJPEGへ無言変換しない。 |
| C5 | 生成結果の由来情報不足 | `pure.mjs:19`、`astra-generation-core.mjs:45` | 元SHA/Recipe版だけではProxy/Fullやcrop状態を区別できない。manifestには結果寸法があるが、入力表現/入力寸法の記録が不足。 | 入力representation/寸法/crop/座標版とcanonical assetを保存。Finalで再生成しない。 |
| C6 | 保存と実行の未対応 | `pure.mjs:102`、`apps/backend/src/portrait-recipe.ts:18`、`worker.mjs:548` | Recipe/通常renderは拡張キーと段階を列挙制限、人物操作もface_brightness限定。新関数をimportするだけでは保存・Finalに載らない。 | 版付き操作schemaとWorker dispatchを一緒に追加。旧Recipeは維持する。 |
| C7 | 人物識別/座標の違い | `apps/web/src/session.mjs:592`、`face-feature-adapter.mjs:156`、`astra-face-runtime.mjs:19`、`faces.mjs:30` | 永続personIDとfaceIndexは別物。旧anchorは下原点、新landmarkは上原点。 | 写真/版/座標変換込みのpersonID→当回検出の一意照合を一か所に置く。ProxyのindexをFinalへ使い回さない。 |
| C8 | Highlight処理の重複 | `manual-makeup-highlight.mjs:58,112`、`face-feature-adapter.mjs:180`、`makeup-highlight-landmark-mask.mjs:143` | 強度→gammaは共通だが手動mask/landmark maskの出典は違う。現在の二重適用は確認していない。 | manual/landmarkを排他的modeにして画素核を一回だけ呼ぶ。出典文字列を書き換えて流用しない。 |
| C9 | 変形とmask順序 | `pure.mjs:116,164,173`、`nose-reshape.mjs`、`eyebrow-reshape.mjs`、`astra-face-head-pose.mjs` | 変形後に変形前のmaskやlandmarkを使うと領域がずれる。既存順序へ単純挿入できない。 | 変形前で完結する処理と、変形後へのmask投影が必要な処理を確定し、順序をRecipeに保持する。 |
| C10 | 原寸/解析寸法の混同 | `pure.mjs:12`、`raw.mjs:35`、`face-feature-adapter.mjs:23` | RAW側24MPに対し新顔adapterは元寸法8MP超を拒否。小さなProxyでも元画像が大きいと拒否し得る。 | 解析画像の上限と原寸描画の容量を分離。原寸処理のtile等を選び、上限だけの変更をしない。 |

上表でファイル名だけのパスは `apps/web/src/processing/` 以下。静的に読める矛盾/相違であり、実機障害の再現結果ではない。

## 重複判定の基準

1. **既存で足りる**：全下位操作を既存処理へ対応づけられる場合のみ。名前や似た結果だけでは不可。
2. **差分追加**：既存の処理核を再利用できるが、操作・モデル・対象・保存・端末差が残る。差分だけを書く。
3. **独立**：共通基盤は利用しても、目的や入出力が別。無理に吸収しない。
4. **資料不足**：採否を決めない。未知部分を消さず、確認事項として残す。

共通基盤を使うことと、機能を削ることは別。例えば顔検出は共有できても、鼻変形・表情変更・本人識別は異なる処理。手動canvas拡張と生成拡張、通常シャープと学習型Detail、手動選別とAI採点も別として扱う。

## 実装順序への提案

「残93件を全部書いてから接続」とはしない。まず93件の差分表と上記契約を確定し、接続先を一つに決める。追加が必要と判定した差分だけを実装し、44件側の既存処理を再利用して接続する。独立した追加機能や資料不足項目を、全体接続の一律な待ち条件にしない。

削除/全面リファクタ/共有契約変更は今回行わない。候補数だけを根拠に不要コードを生成したり、資料不足を「不要」に変えたりしない。
