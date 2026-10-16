# 独立44候補：次の非AI実装キュー（2026-10-04）

**最新注記（2026-10-04）:** 下記の順位表・詳細案は着手前の履歴であり、現在の実装順ではない。現行はA=Manual Canvas Expand四辺overlayの製品Editor接続、B=Selective Color Workspace Preset host注入mount、C=Smart Culling手動カラーラベル/Segment UI。B/W手動限定・Export namingの撮影日限定・Levels/Vignette/Selective Workspace Preset等は進捗台帳に到達点と残Gateを記録済みで、再実装しない。元候補全要素完了は0/44、限定接続12件は別枠。排他はOWNERSHIP最上節を優先する。

**状態更新:** この文書の順位表と「未実装」欄は着手前の計画スナップショットであり、現状態は [進捗台帳](UNIQUE_FEATURE_PROGRESS.md) と [OWNERSHIP](OWNERSHIP.md) 最上節を優先する。B/W Edge Removalの本人手動・8M以下限定経路は実Trial HTTP/SQLite＋Chrome合成非RAWでUI→保存/再読込→Finalまで接続済み（元製品の自動判定/Update/Syncや実RAW/Cloudは未完）。Add Shadowは独立Worker/facade・対象/背景Trial Gate・typed文書・Trial/Workspace保存境界・Trial限定orchestratorまで進み、写真固有文書のBatch流用と未接続通常renderは拒否するが、実RAW成功画素と製品UI/Session/Finalは未接続。DNG限定Exif撮影日は実Trial read-only Gateと明示offset付き命名入力まで、製品UI/Final・実DNG/RAW corpusは未検証。Export namingはBatch「元名＋指定文字」を実ブラウザの合成非RAWまで確認した。現在は3機能を別々のE2E担当が進め、メインが独立判定する。これらを再実装・二重計上しない。

## 判定範囲

[一次37件](UNIQUE_FEATURES_CONFIRMED.md)と[追加7件](UNIQUE_MISSING_SEVEN_AUDIT.md)の**元候補ID**から、追加モデル・AI Generateを要さず、既存SUITEのUI→保存→Finalへ進める余地を比較した。順位は「元製品の全機能完成順」ではなく、**正直にSUITE限定の動作を一つ通せる見込み順**。現状の[進捗台帳](UNIQUE_FEATURE_PROGRESS.md)にある限定接続11件を新規完成として数えない。ここでは製品コードも外部リソースも変更していない。

| 順位 | 元候補・次に狙う範囲 | 着手判定 | 主な既存証拠 | UI→保存→Finalまでの不足 |
| --- | --- | --- | --- | --- |
| 1 | **EV3-0342 Black & White Edge Removal**：本人が指定した被写体境界の**手動補正に限定** | **次の設計・実装候補**。下記マスク保存契約を先に満たす | `processing/bw-edge-removal.mjs` の極端な黒白ハロー補正、`subject-mask-authoring.mjs` の本人手動ストローク、`background-composite.mjs` の出典照合 | 別々のsubject/correction strokeのtyped Recipe、Asset/Original SHA/寸法/版数検証、After brush/eraser、Worker Proxy/Final、保存再読込。元製品相当の自動対象判定、Update、他写真Syncは別未実装 |
| 2 | **EV3-0396 Add Shadow**：本人指定subject mask・背景・影の**手動SUITE処理** | **条件付き**。#1のマスク保存/表示基盤を再利用できる場合 | `processing/add-shadow.mjs` のNone/Soft/Hard/Drop、Opacity/Blur/Gradient/Blend限定処理、`background-composite.mjs` と手動subject mask部品 | 背景/被写体マスクの正当性を実製品経路で確定、設定をtyped Recipeへ保存、合成順のWorker Preview/Final、UIと元画像不変試験。自動被写体抽出・影位置推論・元製品画素同等は対象外 |
| 3 | **EV3-0764 Desktop Export naming**：既存連番2方式**以外**の未接続方式 | **Aの実Chrome証拠監査待ち** | `editor-ui.mjs`のBatch Final selectはすでに`custom-count`/`custom-sequence`を含み、`export-batch-manifest.mjs`の実名計算へ渡す。既存9方式の純粋部品もある | 撮影日時のtimezone、実際に適用済みEffect Preset、選択済みExport Presetの証明可能な入力とUI。これらは`export-naming-context.mjs`で現在拒否される。連番2方式を再実装しない |
| 4 | **EV3-0894 Smart Culling**：手動Stars/Flags/Custom Tags/Segmentsで選んだAssetの明示Final | **保留**。Node Workspace認証を製品へ正しく接続した後 | `workspace-culling-client.mjs` / `workspace-culling-panel.mjs` とNode Workspace HTTP/SQLiteのProject CAS・tenant/Asset境界。既存Batch Finalは明示選択の出力を持つ | 現Trial/Cloud製品にはCulling panelがmountされていない。本人/Workspace/Projectの同一性を保つ製品route、保存マーク→選択→既存Finalの橋渡し、権限失効・競合・取消試験が先。**AI自動選別は含まない** |
| 5 | **EV3-0528 Grain**：7調整そのものではなく、Personal/Workspace Presetの製品Save/Apply/Reload経路 | **保留**。製品のWorkspace認証・保存先を明示選択した後 | Grain 7調整はすでにUI→Recipe→FinalとAuthor Portable Presetまで接続。Node WorkspaceのPreset HTTP/SQLiteにはテスト専用Save/Apply/Reload実績 | 現Trial/Cloud EditorはPersonal/Workspace Preset経路を持たず、Node `ws_presets` は別tenant。製品認証・権限・保存版CASのあるclient/mount、適用後Recipe保存・再読込・Finalを実経路で試験する。7つのGrain controlを作り直さない |

次の所有割当を決めるときの**変更候補**（現時点では編集禁止）:

| 順位 | 最小の変更候補 | 必須試験の境界 |
| --- | --- | --- |
| 1 | `apps/backend/src/photo-policy.ts`、`apps/web/src/processing/{pure,worker,index}.mjs`、`session.mjs`、`editor-ui.mjs`。既存mask authoring/edge moduleを再利用 | 保存/再読込した手動strokeと元SHA/寸法が一致、After brush/eraser→Preview/Finalの対象境界だけ変化、Undo/Redo、失効/取消/余白拒否 |
| 2 | #1と同じRecipe・Worker・UIの接続面、既存`processing/{add-shadow,background-composite}.mjs`。背景Asset参照契約は事前確認 | 明示subject mask/背景を使う4モード、各調整の画素差、保存/再読込、Proxy/Final一致、alpha/原本不変、出典不一致拒否 |
| 3 | 監査後に`apps/web/src/export-naming-{context,form}.mjs`と、必要な選択状態/Editorのみ。既存queue/manifestを再利用 | 実際の撮影暦日・適用Preset名が証明できる場合だけFinal名へ。未証明の値はFinal前拒否。Aが既存連番2方式の実Chrome証拠を別監査 |
| 4 | `apps/web/src/bootstrap.mjs`と製品認証routeを選定後に既存`workspace-culling-{client,panel}.mjs`をmount。Finalは既存Batch exportを再利用 | 実認証HTTP/SQLiteで異tenant/別Project拒否、CAS 409、失効/取消、保存マークから選んだAssetだけが明示Final対象 |
| 5 | 製品保存先決定後の`bootstrap.mjs`、`preset-facade.mjs`、Preset UI/認証client。Node WorkspaceをCloudと同一視しない | 実製品routeでPersonal/Workspace各Save→Reload→Apply→Recipe再保存→Final、2人/2tenant、role変更・版競合・再起動永続性 |

## 一次資料と重複回避の根拠

- [Evoto公式 Export](https://support.evoto.ai/how-to-use-import-export/)は9方式を区別する。現SUITEの`editor-ui.mjs`は元名/Custom名に加え、Batch Finalの`custom-count`/`custom-sequence`を`export-batch-manifest.mjs`へ渡す。Aがこの2方式の実Chrome結果を別監査中。#3は**残方式の実在入力**だけを対象とし、撮影時刻のtimezone、選択済みExport Preset、実際に適用済みEffect Presetを捏造しない。`export-naming-context.mjs` は未証明入力を既に拒否する。OS保存後の実ファイル名・実RAW・Cloudは未検証。
- [Evoto公式 Background Adjustments](https://support.evoto.ai/backdrop-changer/)はB/W Edge Removalに自動検出、manual brush/eraser、Update、Sync条件を記載する。#1の手動限定処理を自動検出の代替と表示しない。同資料のAdd Shadowは背景交換後のSoft/Hard/Dropと調整を記載する。#2は明示マスク限定で、背景交換・自動マッティングの製品導線が未接続ならボタンを有効にしない。同資料のOriginal Shadowは**AI Retain Shadows**であり、今回の非AI候補へ混ぜない。
- [Evoto公式 Culling](https://support.evoto.ai/smart-culling/)は手動Story/Segment/marksとAI品質/顔/クラスタ選別を区別する。#4は手動マークで選ばれた写真を出力する経路だけ。マーク変更は画像Recipeの画素処理ではなく、Final対象の選定である。現Node Workspace実装をTrial/Cloudの同一ユーザーとして扱わない。
- [Evoto公式 Color/Grain](https://support.evoto.ai/color-adjustment-feature-modules/)の7つのGrain調整は現SUITE限定実装に到達済み。#5は既存調整の二重実装ではなく、[製品Preset route監査](PRESET_PRODUCT_ROUTE_AUDIT.md)で未接続と確認したPersonal/Workspace保存経路だけ。Communityは依然NOT_IMPLEMENTED、Authorの承認済み公開版をCommunityに改名しない。

## 着手順・停止線

1. **#1のマスク保存契約を先に実装レビュー**する。BがEditorを排他所有中で、AがExport naming連番証拠を監査中なので、同じUI/Sessionを同時編集しない。下記の順番で契約/処理の独立部品から始め、UIは所有返却後。
2. #1→#2は同じ本人手動subject mask基盤を共有しても、異なる画素結果と固有コントロールを保持する。まずマスクの出典・Recipe容量・描画座標・背景資産保存契約を設計レビューし、合意できなければ実装を止める。純粋画素部品の試験だけでUI/Final PASSにしない。
3. #4/#5は独立候補の**条件付き予備列**。Node WorkspaceをTrial/Cloudへ無認可で移植しない。製品本人ID・tenant・Project・Asset・Preset権限・CASを実経路で満たす設計が先。Cloud D1/R2やschemaをこの計画だけで変更しない。
4. Aの`EV3-0773 Output adjustments`、Bの`EV3-0492 Levels Sync`は進行中なので除外。AI Generate前提のBatch Edit/Motion Blur/Generative Expand/Clothing Moiré Removal/Original Shadow等も非AI手動効果へ名前だけ変換して計上しない。`LR-16 HDR Optimization`は[Adobe公式HDR](https://helpx.adobe.com/lightroom/desktop/edit-photos/hdr-output.html)のHDR入力・表示・HDR保持出力が現8-bit SDR経路を超え、実HDR表示/ファイルが必要なため、今回の近道候補から外す。

## #1 B/W Edge Removal：本人手動マスクの最小データ契約案（未実装）

**保存するのは8-bitマスク画像ではなく、正規化された手動ストローク。** `subject-mask-authoring.mjs` は被写体全体の`ADD/ERASE`ストロークからマスクを生成するが、`bw-edge-removal.mjs` はそれとは別に「どの境界を補正するか」という手動範囲を現在受け取らない。したがって**被写体シルエットと補正範囲は別データ**にし、後者が未確認なら全周を自動的に補正しない。例えばRecipe v1の既存`extendedParameters`内に任意のtyped key `bwEdgeManual`を置き、`{schemaVersion:1, engineVersion, binding:{assetID,originalSHA256,sourceWidth,sourceHeight}, subjectStrokes, correctionStrokes}`だけを受け付ける案。キー/形は実装前に親と確定する。既存`processingOrder` enumやRecipe v1外形に新stageを加えない。

| 境界 | 最小不変条件と現コード根拠 |
| --- | --- |
| 本人・Asset | Trial/Cloud/Workspaceの**実認証済み**編集者とtenant/Asset権限を保存時に再確認。`ownerConfirmed`は`subject-mask-authoring.mjs`自身も「認証ではない」と明記するので、UIのチェック値だけを認可証拠にしない。保存JSONの`binding.assetID`（UUID）と、サーバーの当該Asset IDが一致しなければ拒否。現`repository.ts`とCloud `worker.mjs`の`validateBoundRecipe`/`bound`はportrait以外にこの照合をまだ持たない。 |
| Original SHA・寸法 | `binding.originalSHA256`はAssetに登録された**RAW原本バイト**の64桁SHAに一致。`sourceWidth/Height`は回転・Crop前のupright decoded full frameで各正整数、積は現マスク上限8,000,000画素以下。保存時はAsset SHAをサーバーで照合し、寸法はProxyの`sourceWidth/Height`とFinal再decodeのfull寸法で照合。寸法/向きが一致しない写真では使用を拒否し、別Assetや別RAWへ流用しない。`makeProxyPixels`は元寸法を`sourceWidth/Height`で持つ。 |
| 版数 | 保存は現`saveRecipe(assetId, expectedRevision, body)`のCAS、編集権限、保存応答`revision=expectedRevision+1`を維持。**保存JSONに`subject-mask-authoring.mjs`の`provenance.savedRevision`を固定しない**。編集前の保存済み版（最低1）を取得したdraft Previewと、保存後/再読込/Finalの確定版それぞれから実行時contextを組み、毎回ストロークを再ラスタ化する。0版の新規Assetはまず中立Recipeを保存してからマスクを許可。版数/権限変更後は古いPreviewマスクを破棄する。 |
| ストローク・容量 | `subjectStrokes`は既存の`{operation:'ADD'|'ERASE',path:[{u,v}],radiusFraction,hardness}`に合わせ、有限`u/v` 0..1、半径 .001.. .25、硬さ0..1、少なくともADDを要する。`correctionStrokes`も別のADD/ERASE範囲として厳密検証し、少なくともADDを要する。両配列**合計**で64ストローク/4096点、対象ラスタ最大8M画素、仕事量最大96Mを上限候補とする（既存subject authoringの個別上限を全体へ拡張する必要あり）。Trial/CloudのJSON request上限は256KiBなので、拡張単体は例として96KiB以下、Recipe request全体も256KiB以下をUTF-8 bytesで事前・サーバー両方検査する。巨大なbitmap/base64をRecipeに入れない。 |
| 座標・表示 | 保存点は**upright原画、回転/Crop前**の正規化座標。Afterの`object-fit:contain`、splitのBefore、回転/Crop/Canvas Expand余白は現`local-levels-brush-coordinate.mjs`相当の厳密な逆/順投影を再利用・適応し、Before/余白/寸法不一致/Crop外を拒否する。ProxyとFinalは同じ保存点を各実寸でラスタ化し、Proxy bitmapをFinalへ伸ばさない。Crop外の保存stroke表示だけは非表示としてEditor全体を落とさない。 |
| Worker・画素 | `processing/index.mjs`の`render`は現在recipe以外にAsset contextを渡さず、`processing/worker.mjs`も本人マスクを検証しない。Sessionから実Asset/Original SHA/現在版数を渡し、Workerでtyped Recipeとsource寸法を再検証してから、fresh pixelsに対し`authorSubjectMask`と別の補正範囲maskを生成する。`authorSubjectMask`の返り値は`{width,height,data,provenance}`だが`applyBlackWhiteEdgeRemoval`は**厳密に`{width,height,data}`のみ**受け付ける。`validateSubjectMatte`で出典を照合した後に必要な3項目だけを渡し、未検証の脱落コピーを通さない。補正範囲で画素効果を制限し、既存Color/Local Levelsの後・Rotation/Crop前に適用。新`processingOrder` stageは不要。RAW原本・alpha・対象外RGBを維持。 |

安全な実装順は、(1) **保存JSONの型/容量/Asset-SHA束縛だけ**を独立部品とBackendの実HTTP/SQLite＋Cloud Worker契約試験で確定、(2) subjectとcorrectionの2種類の手動strokeを8M/96M上限内で各表現にラスタ化する純粋部品と誤用・中断試験、(3) Workerのfresh-context→mask provenance照合→B/W画素→Proxy/Finalの合成試験、(4) EditorのAfter専用brush/eraser・明示確認・Undo/Redo・保存/再読込をUI排他返却後に接続、(5) 実Chromeの認証済み合成非RAW写真で保存→再読込→Final画素差、Before/余白/別Asset/古いSHA/版数競合/権限失効/中断の失敗閉鎖を確認、の順。どこかでbindingや補正範囲が証明できなければ**操作disabled・Final拒否**とする。実RAW境界/細毛エッジ画質/元製品自動検出/Cloud配備は別Gateであり、この限定経路のPASSへ混ぜない。

現`subject-mask-authoring.mjs`と`bw-edge-removal.mjs`はいずれも**8M画素上限**なので、これを緩める安全性・メモリ試験をしない限りFinal解像度が8M超の写真は拒否される。多くの実RAWに一般提供できると表示せず、まず小さな合成非RAWで製品経路を証明する。

どの順位も、まず合成非RAWの実UI→保存/再読込→Worker Finalと失敗閉鎖を通す。元候補の全要素完了にはさらに実RAW画質、必要な実機、公開Cloud、元製品との操作/出力差を別Gateで評価する。上表は未接続/停止条件を明示した実装候補であり、新規PASS件数ではない。
