# Web UI — B implementation checkpoint

Status: SOURCE_IMPLEMENTED / SESSION_INTERFACE_CONNECTED / EMPTY_UI_BROWSER_OBSERVED / REAL_RAW_NOT_RUN。Web UI の source、空状態のブラウザ表示、実 RAW/Native の合格を分離する。Apple/Mobile の既存 Gate は変更しない。

## 所有範囲

`apps/web/index.html`、`apps/web/src/editor-ui.mjs`、`apps/web/src/styles.css`、本書のみ。plain ESM / vanilla DOM、React なし。main の bootstrap が `mountEditor(session)` を呼び、返る dispose は subscription、DOM listener、UI 所有 download URL を解放する。

## Session 接続

`session.state` getter と即時 `subscribe(render)` を使用。contract の Promise 操作だけへ委譲: importRaw/openAsset/setAdjustment/selectPerson/detectPeople/undo/redo/reset/save/reload/exportFinal/cancelExport。UI は shared validator、RAW decode、人物解析、保存/API/作者 backend を複製しない。

Recipe は `recipe.parameters`。`faceBrightness` / `rotationDegrees` を正式 key として渡す。people は id/anchor/value/complete、complete な UUID の明示選択に加え人物Privacy Gateを満たす場合だけ Face Brightness を有効化する。現在の実bootstrapはPRIVACY_REVIEW_REQUIREDで人物処理BLOCK。Final は assetあり・dirtyなし・revision>0 の保存済み状態だけ有効（人物Recipeはmain sessionのPrivacy検証で別途拒否）。busy、error、dirty、revision、provenance を表示する。操作未接続は disabled、例外は拒否表示。fake sample / portrait / 成功演出なし。

PC は library / image / controls の3列、950px以下は横 library +2列、700px以下は縦構成。比較は実 beforeURL/afterURL のみ。asset切替後に旧URLが残っても、新URLに替わるまで描画しない。実 upright 未補正写真に target geometry の番号を重ね、回転後 After に upright anchor を流用しない。人物EVは現在のRecipe値を優先表示。変更後の再検証で選択解除されるため、再編集には検出→明示選択が必要と表示する。

dirty中のimport/library切替/reloadはdisabledとし、sessionのUNSAVED_EDITS拒否を回避しない。exporting中は他操作disabled、cancelExportのみ可能。生成済みFinalのダウンロードは実Blobが戻った場合のみ提供し、固定revisionを表示する。8-bit sRGB・metadata除去・JPEG/PNGだけを示し、browser既定dpiは印刷dpi未保証。TIFF/AdobeRGB/16-bit/印刷実寸resizeは未対応。

author route `?view=author` は name/author/version/draft のメモリ内 preview、下書き保存・submit は disabled NOT_CONNECTED。移動/再読込で入力は失われる。認証/提出/レビュー/immutable採用/共通Presetは未接続で、別作者成果の backend を作らない。

## 検証と未成立

実行済み: `node --check apps/web/src/editor-ui.mjs` exit0。最終UI表示guard後の `npm run web:build` exit0、2026-10-03T07:03:53.951ZにBUILT_NOT_REAL_RAW_VERIFIED。inline read-only静的assertionは12session method名、4author input、ESM export、root `/app.js` `/styles.css`、外部CSS import無しを確認してexit0。この静的12method coverageは呼出し導線の存在検査であり、12操作のDOM実行・保存/人物/書出しの成功数ではない。session/api-client全文を読み正式state/key/Blob戻り値を照合した。

メインの実ブラウザ結果を受領: `http://127.0.0.1:8790/` と `/?view=author` の空状態を表示。初回API fetch illegal invocationはメインが修正し、再build/reload後にerrorなしを確認したとの報告。BはCUAを操作・再実行しておらず、下記4枚の保存画像を独立にview_imageで読取り確認した。errorなしの報告を、許諾実RAW・全操作・全browserの合格へ拡張しない。

## Screenshot review — ui-01

メイン記録のviewport: PC 1440×1000、iPad相当幅1024×1366。画像は縦長のfull-page captureであり、端末iPad/Safariの撮影ではない。

| Evidence | Bの画像読取りで確認した範囲 | 未成立/注意点 |
| --- | --- | --- |
| [editor-pc.jpg](evidence/web-2026-10-03/ui-01/editor-pc.jpg) | library / preview / controlsの3列、空RAW説明、実写真・人物なし、保存/Final/人物調整の無効状態表示、LOCAL QA未接続の明示 | assetがない画面のみ。人物番号box・Before/After・実操作は未表示/未検証 |
| [editor-ipad-width.jpg](evidence/web-2026-10-03/ui-01/editor-ipad-width.jpg) | 1024相当幅で3列が収まり、主要パネル衝突/横切れは画像上見当たらない。説明/Final未対応noticeも収まる | Safari/iPad実機・touch・landscape/portrait切替はNOT_RUN。950/700以下のresponsive分岐はこの画像では検証されない |
| [author-pc.jpg](evidence/web-2026-10-03/ui-01/author-pc.jpg) | name、作者、version、draftがLook previewへ反映。NOT_CONNECTED、未認証作者、未保存/未提出の記載。下書き保存/提出の無効ボタンを画像でも判読できる | 入力previewのみ。保存・提出・審査・Preset採用の成功ではない |
| [author-ipad-width.jpg](evidence/web-2026-10-03/ui-01/author-ipad-width.jpg) | 入力欄とLook cardの2列が収まり、長いtitleはcard内で折返し。未接続/未認証/未提出の説明あり | textarea下のdraft/submit action列は画像で判読できない。メインのdisabled操作確認を受領するが、この1枚だけでaction列の見え方合格とはしない |

画像上の共通所見: 明白なblank page、error overlay、主要列の衝突/横切れ、fake写真/人物は見当たらない。ただしDOM寸法、scrollWidth、keyboard、screen reader、contrast値を測定しておらず、完全なresponsive/accessibility合格ではない。無効controlと小さい補足文字は薄いため、実機での読みやすさは別確認が必要。

Author routeは先にEditor領域を表示し、作者入力は初期viewportより下にある。full-page画像では確認できるが、初回訪問時はscrollが必要な導線である。今回の読取りreviewではUIを修正しない。iPad幅のaction列を含む再capture/DOM表示確認はメインの統合検証へ委ねる。

## Gate / 操作 scope

空状態の表示と作者の入力反映は観測済み。RAW import、global/人物補正、明示人物選択、Undo/Redo/reset、save/reload、固定Recipe Final JPEG/PNG、中断の実画像全工程はこの4枚では実行されていない。静的導線12件と画面4枚を12操作PASSや実画像品質PASSにしない。

作者の外部成果は未提供。作者login・他作者との権限分離・draft保存/submit・review・immutable採用・共通Preset接続は **NOT_CONNECTED / BLOCK**。未接続buttonはdisabled、作者inputはメモリ内previewだけで成功演出なし。LOCAL QA actor/cookieは本番作者認証でも招待/一般公開でもない。別author backendやschemaを追加していない。

- Safari / iPad browser 実機: NOT_RUN。
- 許諾実 RAW の import→対象解析→全調整→保存/再起動→Final: NOT_RUN。
- 実人物の誤適用・背景非変化・halo・Proxy/Final一致: NOT_RUN。
- 本番 Auth / Cloud / Billing / 作者保存・提出: NOT_CONNECTED / BLOCK。
- Original orphan Recovery は UI に追加せず、既存 NOT_IMPLEMENTED を維持。

再検証手順: main server/bootstrap 起動→Windows browserで empty editor と author route→PC/iPad幅で内容/overflow/disabled確認→許諾 RAW を使用し connected session 全操作→保存revision/dirty/例外/Final拘束→別途Safari/iPad実機・人物画素 Evidence。数値/fixture/画面だけを実RAW・Apple成功にしない。

## 既存Crop rendererへのUI接続

追加したselectは「切り抜き比率」だけ。Original (`original`) / 1:1 / 4:5 / 3:2 の4値を既存 `session.setAdjustment('cropRatio', value)` へ渡す。新API、Crop schema、正式Preset仕様、印刷resizeは追加しない。未asset・busy・exporting・UI pending時はdisabled。dirtyでもCrop可（編集操作のため）。現在値は `recipe.parameters.extendedParameters.crop.preset_name` から表示し、未設定はOriginal。対象外の保存名は原文を表示し、既知比率へ推定置換しない。

Crop Rectは既存upper-left normalized、回転後の中心Crop。UIは座標を生成せず、main session/shared rendererの結果だけを表示する。Beforeは未補正upright、Afterは回転/Crop後で画像枠が異なることをcaption/footerへ明示。Originalへの戻し、Undo/Redo/reset、save/reload、Proxy/Finalは既存共通処理へ委譲し、UIが別rendererや履歴を持たない。新RAW import直後のdirty状態でもCrop・再調整が可能。dirtyのimport/library切替/reload禁止とFinal前の保存必須は維持する。

ui-01の4画像は変更しない。新Crop controlのbrowser表示・操作とPC/iPad幅の再captureはメインがui-02へ保存する予定。実行済み: `node --check apps/web/src/editor-ui.mjs` exit0、およびread-only inline Node assertionが4option値・cropRatio呼出し・preset_name表示・Before/After座標説明を確認してexit0。最新UX訂正ではdirtyによるCrop無効化を除去し、構文とdirtyでもCrop可・dirtyのimport/library/reload禁止保持の静的assertionを再確認してexit0。構文/静的接続だけで、CropのDOM操作や画素実行ではない。実RAWの切り抜き/人物/Final・Safari/iPad実機・印刷実寸はNOT_RUN/未対応のまま。

## 最新のviewport Evidence訂正 — main受領結果

ui-02はviewport設定が別tabに適用され、実測449px幅だったことをメインが確認した。`editor-pc` / `editor-ipad-width` という保存名をPC1440/iPad1024成功の根拠にしてはいけない。ui-02画像は改変・削除しない。旧「ui-02へ保存予定」は撮影前の履歴説明であり、幅別合格ではない。

メインがui-03を撮り直し、実測1440/1024幅・横overflowなしを確認したとの報告を受領。Bはその計測を再実行していないためmain実測の層に置き、実機iPad/Safariや実RAW結果へ継承しない。ui-01の独立画像読取り記録は残すが、ui-02の誤計測を解消した試験として扱わない。Privacy変更後の現UIはメインが最新ui-04へ再撮影する予定で、旧ui-01/02/03が新Privacy noticeを表示したことにはしない。

## 人物SDK Privacy Gate — PRIVACY_REVIEW_REQUIRED

メインから重大Privacy課題を受領: @mediapipe/tasks-vision 1.0.1 READMEにGoogleへの性能/利用メトリクス送信の記載があり、内容・無効化・同意条件は未確定。実写真/顔データ送信をこのUIレビューで実測したという意味ではない。通信がlocalのみ/無通信/同意済みという表示・成功推定をしない。

sessionが追加する `personProcessingStatus` はdefault `PRIVACY_REVIEW_REQUIRED`。UIも未提供/不明状態をfail-closedとし、現契約で唯一の例外 `SYNTHETIC_TEST_ONLY` は明示的な合成人工fixture用に限定する（実bootstrapには設定しない）。人物解析buttonとFace Brightness sliderを停止し、**「顔解析SDKの通信・同意確認待ちのため、実写真の人物処理は停止中」** を人物欄に表示する。fixture例外でも実写真処理許可とは表示しない。人物機能のsource/controlを削除せず、fake人物や代替補正を作らない。

RAW / global調整 / 回転 / Crop / Save / 人物Recipeを含まないexportの導線は維持。人物を含む保存Recipeの再読込/再描画/Finalに対する実停止はmain shared sessionの責務であり、UIがSDKやvalidatorを重複実装しない。この追加でsession/processing/bootstrapをBは読取変更せず、元Evidenceも変更しない。

実行済み: `node --check apps/web/src/editor-ui.mjs` exit0。read-only inline Nodeの9静的assertionでdefault Privacy状態、fail-closed/synthetic-only、解析button/顔sliderのguard、説明文、Crop/Save/非人物export導線の条件保持を確認してexit0。これはSDK停止の実通信実測やDOM操作試験ではない。

BのPrivacy差分は `editor-ui.mjs` と本書のみで保存・コード編集freeze。再build・最新ui-04撮影とsessionでの人物処理拒否試験はメイン統合へ渡す。現実写真の人物解析・画素品質は **PRIVACY_BLOCK / NOT_RUN**、通信内容・同意・無効化は **UNRESOLVED**。Safari/iPad/Apple112 NOT_RUN、本番作者login/他作者権限/draft-submit BLOCKも維持する。

## 最新追加工程 — 招待試用UI / SOURCE_READY_API_INTEGRATION_PENDING

最新ユーザー許可によりB所有を再開。新規 `author-ui.mjs` / `login-ui.mjs` と既存Editor/CSSを接続する。外部作者成果はメインが照会中で、この担当はbackend/auth/DB/API/CSRFを作らない。前節の作者未接続は旧LOCAL_QAの状態を指す。新INVITED_LOCAL_TRIALの実接続・実行結果は別Evidenceで確定する。旧69試験・Privacy source freeze時点・ui-01〜05を上書きしない。

固定interface: `mountEditor(session,{trialSession,authorAPI}={})`、`mountLogin(api)`、`mountAuthor({container,api,session,principal})`。Editorはbootstrapが得た `trialSession.mode==='INVITED_LOCAL_TRIAL'` とserver principalがある場合だけ実作者UIに切り替える。LOCAL_QAでは旧入力preview＋disabled保存/submitを維持。実作者区画はEditorより上へ移し、入力導線を初期画面で見つけやすくする。

- Login: 貼り付けpassword入力→`api.login(inviteToken)`→`api.getSession()`のmode/principal確認→Editor。localhost/127.0.0.1/loopback以外では送信UI無効。tokenはquery/hashから読まない、browser storage/consoleへ記録しない、送信開始時入力を空にする。login成功応答だけでなくserver session成立後だけ遷移。失敗は汎用案内でtokenをerrorへ反映しない。
- Author: nameは入力、作者名はserver principal readonly、版はserver revision readonly。保存済みasset+revision>0・dirtyなしの写真からglobal3を明示captureする。create/saveは`{name,recipe,assetID,recipeRevision}`、save時のみ`expectedRevision`を付ける。assetID/revisionは検証用source参照metadataでありPreset parametersには入らない。
- Portable selection: exposure/contrast/saturationだけを既存Recipe envelopeへ取り込む。rotationはneutral0、extendedParametersは空。Crop/personID/geometry/mask/asset/SHAを共有parametersへ混入しない。`globalPresetRecipe`は元Recipeを変更せず、main serverが正式range/schema/保存済source/所有権を再検証する。
- Persistence/submit: create/saveのserver responseで作者・name・globals・DRAFT・CAS版を照合してから成功表示。下書き一覧もserver取得値。提出は保存済draft ID+expectedRevision、SUBMITTED応答後だけ成功。提出済/ACCEPTED/REJECTED版はreadonly、新しい下書き導線を残す。未保存入力はbeforeunload/他draft切替で保護。response不一致やAPI例外では入力を保持し成功扱いにしない。
- Logout: 未保存Editor/作者入力は保護。`logout`→`getSession`がprincipalなしになったことを確認して`/login`へ遷移。
- Admin review/共通Preset適用UIはこのcheckpointでは未接続。APIのreview/immutable採用が存在するだけでUIフロー完成としない。SUBMITTEDは提出であり、採用・公開・配布の成功ではない。

配色は最新指示を適用: **落ち着いたニュートラルシルバーグレー背景＋白い操作panel/card**。Editor/Author/Login共通、控えめborder/shadow。旧cream/olive背景・「白背景＋銀panel」には戻さない。写真/実画像が主役で、色の変更を機能合格にしない。

実行済み: Editor/Author/Login各 `node --check` exit0。read-only inline Nodeでglobal3保持、禁止データ除外、rotation neutral、元Recipe不変、nonfinite拒否、APIメソッド/source参照導線、credentialのURL/storage/log非使用を静的確認してexit0。実login/RAW/save-reload/Final/作者保存提出のDOM操作は **NOT_RUN**、main trial API/bootstrapの完成・統合と別ブラウザEvidence待ち。Remote招待先本人接続・公開URL・TLS/Safari/iPad・実RAW人物品質・Cloud/Billingは別Gate。人物PRIVACY_BLOCKは解除しない。

## 最新接続訂正 — 外部作者契約再利用 / Sites / 審査・共通Preset

前節のglobal3抽出・禁止データ除外のhelperとその静的結果は旧checkpointであり、現仕様を満たす根拠にはしない。外部作者成果をmainが `src/preset-author/preset-author-contract.mjs` と `preset-author-web-adapter.mjs` へexact copyした後、Bは全文を読取り接続した。独自のstrip処理を撤回し、`globalPresetRecipe` は外部 `portablePresetRecipe` の直接aliasにした。提出前の保存済Recipe / 版 / 作者の構成確認には外部 `authorSubmission` を再利用する。認証・永続化・外部契約・API・shared validatorをBは変更しない。

保存可能なのは露出 / contrast / saturationだけ。**Crop・回転・人物補正・未知拡張を含むRecipeは保存不可**。無言strip・neutral化による救済はしない。元Recipeは不変で、取り込みの拒否理由を作者欄へ表示する。create/saveは固定APIのsource参照とportable envelope、submitは固定draft ID / expectedRevisionのみ。作者名はreadonly server principal、版はserver revision。backendが所有権・保存済source・CASを再検証する。

`mountEditor(session,{trialSession,authorAPI})` は本人principalがある `INVITED_LOCAL_TRIAL` / `SITES` のみ実作者機能へ接続する。LOCAL_QAでは旧previewとdisabled保存・提出のまま。`mountLogin(api,{sitesMode,signInURL,forbidden})` はSites時にコード入力formを隠し、同origin `/signin-with-chatgpt?return_to=/` へのtop-level anchorを表示する（iframe/fetch loginではない）。signed-in非招待は403 / INVITATION_REQUIREDを表示し、Editor操作へ進めない。loopback token loginとSites sign-inは分離し、tokenをquery/hash/storage/logから扱わない。

追加接続: `mountAdminReview` はadmin principal＋実 `listSubmitted/reviewDraft` APIのみ。提出版と作者名を表示、自己審査disabled、CAS expectedRevisionで採用/却下を送信する。採用は外部正式状態 SUBMITTED → APPROVED → PUBLISHED のserver写像ACCEPTED応答を確認してから表示。SUBMITTEDを公開成功にしない。版競合/API失敗は未完了として再取得を案内する。共通Presetは実 `listPresets` の公開版・作者・versionだけを取得し、`session.applyPortablePreset(parameters)` へ委譲する。適用成功は未保存Recipe変更であり、保存/Final成功とは別。写真なし・busy/exporting・未接続なら適用disabled。Preset/審査サーバーや別rendererは追加しない。

追加所有ファイルはauthor-ui/login-uiを含むBのUI6ファイルのみ。新Preset一覧・reviewカード・loginもニュートラル銀灰背景＋白panel/card、控えめborder/shadowを維持する。古いui-01〜05/69試験/Evidenceを上書きしない。

実行済み: Editor / Author / Login各 `node --check` exit0。read-only inline Nodeでalias identity（独自実装無し）、portable値保持、元Recipe不変、Crop/portrait/personID拡張・rotation90の明示拒否、外部authorSubmissionの保存済revision / dirty拒否を確認してexit0。これはDOM・API・実login・実RAW・review→共通Preset適用のE2E結果ではない。main/Cのbuild・独立tests・ブラウザ測定へ引渡し、最新UI全工程は **SOURCE_CONNECTED / E2E_NOT_RUN**。Sites配信・招待先本人接続・Safari/iPad実機・実RAW品質・Apple112はこのsource結果からPASSへ変更しない。人物PrivacyはBLOCKのまま。
