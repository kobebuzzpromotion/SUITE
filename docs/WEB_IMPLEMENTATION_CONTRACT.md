# Web先行検証・担当契約 — 2026-10-03

最新ユーザー指示§1–21を独立追加工程として適用。旧147節、固定6文書、凍結windows-03は書き換えない。Mac待ち期間のWeb開発を許可するがWeb合格をApple/Mobileへ転記しない。154件は回帰基準、Native112件はNOT_RUN。

## 固定所有権（合計4名）

| 担当 | 排他的ファイル | 状態・成果・依存 |
| --- | --- | --- |
| main | apps/web/src/session.mjs, api-client.mjs, bootstrap.mjs; apps/web/local-server.mjs, build.mjs; package管理; shared validators; docs/統合/Evidence | 作業中。A/Bとの接続・CAS・固定Export・154回帰・最終統合 |
| A: evoto_photo_review / Sol6.1 | apps/web/src/processing/**; docs/WEB_PROCESSING.md | 作業中。RAW worker・人物解析・共通Proxy/Final renderer。shared APIは読取りのみ |
| B: evoto_mobile_tether_review / Sol6.1 | apps/web/index.html; apps/web/src/editor-ui.mjs; apps/web/src/styles.css; docs/WEB_UI_REVIEW.md | 作業中。Editor/作者プレビュー、PC/iPad幅。session API依存 |
| C: evoto_workflow_review / Astra | apps/web/tests/**; docs/WEB_SAFETY_REVIEW.md | 作業中。独立試験・レビュー。製品ソース編集不可 |

完了条件は実コマンド/ログ/不成立項目付き成果提出→mainレビュー→統合。空き担当は非重複次仕事へ再割当。全員を監査へ戻さない。

## 実行境界

- RAW decode: ブラウザWorker、@colorhythm/libraw-wasm 1.1.1。PNG/JPEGやthumbnailをRAW Finalへ代用しない。
- 人物解析: ブラウザ内MediaPipe FaceLandmarker。face oval限定Mask、部分/重なり/不整合を拒否。Apple instance segmentationと同等と主張しない。
- pixel処理: unedited base→人物face_brightness→global exposure/contrast/saturation→rotation/crop→encode。同じrendererをProxy/Finalで使用。
- 保存: 既存AssetRepository SQLite + LocalObjectStorage immutable 原本 + 既存/v1/assets API。Cloud接続済みとはしない。
- 検証: 共通TS純粋validatorをブラウザbundleへ直接組込み。別Gateを複製しない。
- Web portrait engine=`web-libraw-mediapipe-face-exposure-1`を既存portrait.engineVersionの許容値へ追加。外形/DB/API変更なし。Swift未知engine安全拒否は維持、跨platform人物render互換は未検証/未対応。
- session API: `new EditorSession({api,processing,storage?})`, `subscribe(fn)`→state; `initialize`, `importRaw(file)`, `openAsset(id)`, `setAdjustment(key,value)`, `selectPerson(id)`, `detectPeople`, `undo`, `redo`, `reset`, `save`, `reload`, `exportFinal({format,quality})`, `cancelExport`; 全操作Promise。UIは失敗を成功表示しない。
- state: assets, asset, recipe, revision, dirty, busy, error, selectedPersonID, people, beforeURL, afterURL, canUndo, canRedo, evidence, status。asset null時操作無効。
- processing facade: `decodeRaw(buffer,{signal,mode})`→{pixels:{width,height,data:Uint8ClampedArray RGBA},metadata,provenance}; `makeProxy(pixels,maxEdge=1600)`→pixels; `detectPeople(pixels,{signal})`→[{anchor (lower-left normalized),mask (polygon normalized upper-left),complete:true}]; `render(pixels,recipe,{detections,signal})`→pixels; `encode(pixels,{format,quality})`→Blob。厳格安全純粋関数はprocessingへexportしCが試験。
- 可変engineはexplicit provenanceに版/モデルSHA/向き/色空間/処理順を記録。Finalは保存済revision+Recipeを固定し原本SHA再確認、再検出に成功した場合だけ補正。最新版へのすり替え禁止。
- 調整UIは実装済exposure/contrast/saturation/rotation/FaceBrightnessと実接続Crop。未実装Skin/Eyes等をダミー表示しない。
- author routeは独立成果照合待ち。name/author/version/draft/submit操作導線をプレビュー表示できるが、認証/提出接続がなければ明示disabled。招待可能/一般公開可能とは別。
- localhost限定QA actorは本番loginではない。本番Auth/Cloud/Sync/Billing、50GB事業基準、料金未確定は変更しない。
- original/unsaved recipeをcache cleanupで削除しない。import DB失敗後原本RecoveryはNOT_IMPLEMENTEDのまま別管理。

## §15–21要件トレース

| ID | 要件 | 実装/検証対象 | Evidence/現在Gate |
| --- | --- | --- | --- |
| WEB-15 | 4名・固定所有権・依存・継続割当 | 本文＋PARALLEL_WORK_BOARD | 最終回収で更新 |
| WEB-16 | 許諾実RAW1枚全工程、版/license/memory | processing/session/build | 実RAW未配置NOT_RUN、必要素材はRAW1人/2人/3人以上、カメラ情報/許諾 |
| WEB-17 | 実装済全調整UI/render/save/export、端値/組合せ/履歴 | processing/UI/session、独立tests | 数値試験と実画像合格を分離 |
| WEB-18 | 向き/coords/colorspace/order/version、Web失敗 | processing/session/server | メモリ/容量/中断/固定Recipe独立試験、実ストレージは別 |
| WEB-19 | 招待作者draft→submit→review→immutable採用→共通Preset | UI導線＋別成果照合 | author login/permissions/backend未接続BLOCK、別実装しない |
| WEB-20 | 実装/試験/NOT_RUN/BLOCK別、Apple転記禁止 | WEB_REPORT/HANDOFF | Web実RAW/Apple/Mobile独立Gate |
| WEB-21 | 早期UI、PC/iPad screenshot、未接続明示 | index/editor-ui/styles | ブラウザQA、実RAW結果と別Evidence |

実画像Gate条件: Targetだけ変化、他人物/背景非変化、Proxy/Final一致、halo無し、再起動再現、二重適用無し、RAW SHA不変。素材なしはNOT_RUN。Windows数値/非画像fixture成功は代替しない。
