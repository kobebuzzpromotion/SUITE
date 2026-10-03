# SUITE Web 招待試用ガイド

2026-10-03 source読取り版。これは操作手順であり、操作済み・画質合格・配備済みの記録ではない。実測はmainの最新Evidenceを参照する。本書作成担当は製品source、生成source、既存Evidenceを変更しない。

## どの環境を開くか

| 環境 | URL / 接続 | この時点の用途・境界 |
| --- | --- | --- |
| ローカル招待試験 | `http://127.0.0.1:8791/`、`/login`、`/?view=author` | INVITED_LOCAL_TRIAL。招待本人のログイン・保存・作者操作の統合試験用。起動状況はmainへ確認する |
| QAプレビュー | `http://127.0.0.1:8790/`、`/?view=author` | LOCAL_QA。空Editorと作者メモリ内preview。作者保存・提出はdisabled NOT_CONNECTED。招待ログインの代用ではない |
| Sites | 配備URLなし | 未配備。ChatGPT sign-in / 招待allowlist / 非招待403の実環境確認はNOT_RUN。Node localhost成功をSites成功へ転記しない |

127.0.0.1 / localhostはこのPC自身を指す。別PCの招待者へ8791のURLを渡しても、このPCへ接続できるとは限らない。遠隔接続・TLS・公開URL・一般公開・本番Cloud / Billingは別工程。招待トークン、Cookie、署名鍵、管理者の秘密情報を本書・URL・スクリーンショット・ログへ記録しない。

現在、利用可能な実RAWは **0枚 / INPUT_REQUIRED**。camera RAWによる一連の実画像試験はNOT_RUN。SDK通信・同意確認が未解決のため、顔解析とFace Brightnessは **PRIVACY_REVIEW_REQUIRED / BLOCK**。global編集、回転、Crop、人物Recipeを含まない保存・Final・作者globalプリセットは顔解析を使用せず進める設計だが、実RAWなしで実画像合格とはしない。

## ローカル招待ログイン

1. mainが用意した8791の試験環境を開く。未認証なら招待ログイン画面になる。
2. 管理者から安全に渡された招待コードをpassword入力欄へ直接貼り付ける。コードをquery/hashへ付けず、文書・コンソール・ブラウザstorageへ保存しない。コード発行・秘密情報の設定手順はこのガイドに含めない。
3. 「招待コードでログイン」を押す。UIは送信開始時に入力を消し、login応答に続いてserver sessionの本人情報を確認する。本人情報が成立した場合だけEditorへ進む。
4. ヘッダーの作者名と招待試用表示を確認する。作者名はサーバー由来で、作者ページの名前欄はreadonly。自分と違う情報・エラー・未接続表示なら操作を止め、mainへ連絡する。

失効・無効コードや通信失敗はログイン成功ではない。8790のLOCAL_QA表示や任意の作者名入力で、8791の招待認証を代用しない。ログアウトは未保存のEditor変更・作者入力を先に解決し、サーバーでprincipalなしを確認してから/loginへ戻る。

## RAW到着後：実画像の編集・保存・Final

前提は許諾済camera RAW原本、camera/model・format/圧縮・向き、原本bytes/SHA256とcheckout外path。JPEGのrename、人工fixture、embedded thumbnailはRAW成功の代用にしない。入力上限・decode条件は[WEB_RAW_INPUT_REQUIREMENTS.md](WEB_RAW_INPUT_REQUIREMENTS.md)、処理方式は[WEB_PROCESSING.md](WEB_PROCESSING.md)を確認する。

1. 原本を別途保持し、試用環境へ送信してよい許諾範囲を確認する。初回は小さいglobal-only RAWから始める。
2. Editorで「RAWを読み込む」を選ぶ。実decode後のBefore / After、filename、provenanceを確認する。import直後はdirty・revision0となるため、Finalや作者取り込みはまだできない。
3. 露光量、コントラスト、彩度を変更する。現在のUI範囲は露光量−4〜＋4 EV、contrast / saturation 0〜2。Beforeは未補正upright、Afterは現在のRecipeによる補正画像。比較表示は実URLだけで、サンプル写真や仮人物ではない。
4. 写真編集として必要なら90°回転、切り抜き比率 Original / 1:1 / 4:5 / 3:2も確認する。Cropは回転後の中心切り抜き。Before / Afterの画像枠が異なることは仕様で、印刷実寸resizeではない。dirtyでもCrop・全体再調整は可能。
5. Undo / Redo / リセットを試す。意図した状態へ戻して「保存」を押し、server revisionが増え、dirtyが解除されたことを確認する。busy / exporting中は他操作を重ねない。未保存時の新import・library切替・再読込はdisabled。
6. 保存済状態で「再読込」を押し、同じAsset・Recipe revision・調整値・回転/Cropが復元されるか確認する。別ページや再起動後もlibraryから同じ保存済写真を選び、復元を別に記録する。
7. 保存済revisionを確認してJPEG / PNGを押す。FinalはOriginalを再取得・SHA照合・full decodeし、固定Recipeを適用して実Blobを返した場合だけdownloadを提供する。エラー、中断、空Blobの代替を成功にしない。
8. 原本不変、出力形式・寸法・向き・色・切り抜き、Proxy / Final差と二重適用がないか、保存/再読込の再現を確認する。実camera / browser / build / revision / SHA / 出力結果と失敗をmainの新Evidenceに記録する。写真を表示できたことだけで画質合格にしない。

出力はJPEG / PNG、8-bit sRGB、metadata除去。ブラウザ既定dpiは印刷dpi保証ではない。TIFF / Adobe RGB / 16-bit / 印刷実寸resizeは未対応。顔解析buttonと顔sliderは停止中なので操作しない。既存人物RecipeもPrivacy拒否を回避しない。保存失敗やdecode失敗時に原本・cacheを削除して進めない。Original Recoveryは別の未実装課題。

## 作者付きプリセット：保存 → 下書き → 提出

写真の編集Recipeと共有プリセットは別物。**共有可能なのは exposure / contrast / saturationの3値だけ**。回転が0以外、Crop・人物補正・未知拡張等があるRecipeは外部作者契約で拒否される。黙って除外・neutral化して保存しない。

1. 共有したいglobal3だけの写真RecipeをEditorで保存する。Cropを使用していた場合はOriginalへ戻し、回転は0°へ戻したうえで、意図したglobal値を確認して保存する。人物Recipeがある場合は無理に削除して通さず、安全なglobal-only写真から開始する。
2. `/?view=author`を開く。ページ移動は新しいEditorSessionになるため、libraryから対象の保存済写真を選び直す。必要なら再読込し、assetあり・revision>0・dirtyなしを確認する。
3. Look名を入力する。作者名はserver本人情報readonly、Versionはserver版readonly。任意の別作者名や自作version番号を入力して提出しない。
4. 「現在の全体調整を取り込む」を押す。表示するglobal3とsourceの保存済状態を確認する。Crop等がある場合は保存不可の理由が表示され、取り込み成功として扱わない。
5. 「下書きを保存」を押す。新規createはDRAFT版を作り、既存DRAFT保存は現在のexpectedRevisionでCAS更新する。応答の作者・name・global値・版をUIが照合してから成功表示する。assetID / recipeRevisionは作者内source照合用で、共通Presetのparametersへ入らない。
6. 下書き名や調整を変えたら保存し直す。Editorで写真Recipeを変更・保存した場合は、作者側で再取り込みしてsource revisionを合わせる。競合・保存失敗なら入力を保持して再取得し、他版を上書きしない。
7. 未保存変更がなく、保存済DRAFTが選択されているとき「レビューへ提出」を押す。draft ID＋expectedRevisionの応答がSUBMITTEDになってから提出成立とする。SUBMITTEDは採用・公開ではない。
8. 提出済み / ACCEPTED / REJECTED版はUI上readonly。再提案は「新しい下書き」を使う。未保存入力のまま別draft・ページ・logoutへ移らない。

UIは外部 `portablePresetRecipe` / `authorSubmission` を再利用する。author/認証/backend/保存契約の二重実装は行わない。作者名・保存済sourceの所有権・CAS・immutable版・提出権限はサーバーでも検証する。

## 管理者審査 → 共通Preset適用

1. 作者の未保存入力を解決してログアウトし、別の招待admin本人でログインする。自己審査は禁止なので、作者本人をadmin扱いにして自己承認しない。
2. `/?view=author`の「管理者レビュー」で「提出を再取得」を押す。作者名、Look名、global3、固定versionとSUBMITTED状態を確認する。自分の提出のactionはdisabled。
3. 「採用して公開」または「却下」を選び、確認ダイアログの版を確認する。review APIへdraft ID / expectedRevision / decisionを送る。版競合・権限拒否・通信失敗は審査未完了として扱う。
4. 採用は外部正式状態 SUBMITTED → APPROVED → PUBLISHEDの2遷移をserverが実行し、UIのACCEPTEDへ写像する。サーバー応答確認前に採用/公開成功と表示しない。却下はREJECTEDで、共通Presetを作らない。
5. Editorの「共通プリセット」で「再取得」を押す。公開Presetの作者名とversionを確認し、実写真を選んだ状態でPresetを選ぶ。`session.applyPortablePreset`がglobal3だけを現在のRecipeへ一括適用する。現在の写真固有回転/Cropを共有Presetから導入しない。
6. 適用後は未保存Recipeとして確認し、必要ならUndo / Redo、保存、再読込、Finalを別々に実行する。Preset一覧取得・適用は写真保存やFinal書出しの成功ではない。

統合確認が必要なsource差: 本書の読取り時点でNode `listSubmitted`は審査済statusも返し、UIはSUBMITTEDだけを許容していた。採用/却下後の再取得がresponse mismatchになり得るためmainへ連絡済み。審査応答と再取得の両方を実ブラウザで確認し、最新source / Evidenceで解決するまで全review UI完了とはしない。本書担当は製品freezeを解除していない。

## Sites配備後だけ行う認証境界試験

現時点は未配備 / NOT_RUN。配備許可・URL・招待allowlistが確定した後にmainが行う手順で、今の一般公開許可を意味しない。

1. 未認証でトップを開き、token paste formでなく「ChatGPTでサインイン」の同origin top-level linkを確認する。iframe・fetchでsign-inを代用しない。
2. 招待対象のChatGPT本人でサインインし、server principal / 招待権限が成立した後だけEditorへ進めることを確認する。
3. サインイン済み非招待の本人は403 / INVITATION_REQUIREDになり、Editor/作者APIへ進めないことを確認する。別作者のAsset / Original / Recipe / draftへアクセスできないことも別に確認する。
4. localhostで有効なコードをSitesへ送信しない。Sites / R2 / D1の実認証・upload・readback・容量・通信はNodeやfake HTTPの合格から推定しない。SitesへRAW送信する許諾を別途確認する。

## PC / iPad相当幅のUI確認は実画像試験と別

同じbuildでPC 1440×1000、iPad相当幅1024×1366をブラウザviewportとして設定する。**これはiPad端末・Safari・touchの実機試験ではない**。実測innerWidth / innerHeightとdocument scrollWidthを記録し、別tabへviewportを設定していないことを確認する。旧ui-02は実測449pxだったためPC/iPad成功の根拠にしない。

- Login：コード / Sites formの分離、403、無効状態、エラー、secret非表示を確認する。入力中の秘密を撮影しない。
- Editor：銀灰背景＋白panel、library / photo / controls、busy / dirty / Final disabled、Crop、Before / After説明、人物停止notice、横overflow / 欠けを確認する。
- Author：作者名/版readonly、Look名の折返し、capture / save / submit disabled条件、拒否表示、下書き一覧、管理者自己審査禁止、Preset一覧を確認する。
- 画面名・build・実viewport・role・空状態/保存済状態・操作結果を区別し、既存画像を上書きせずmainが新Evidenceに保存する。スクリーンショットだけでAPIやRAW品質をPASSにしない。

Safari / iPad実機、実人物画素、Apple112、実RAW全工程、Sites招待先本人アクセスはこのガイド作成で未実行のまま。顔処理のPrivacy BLOCKも解除しない。

## 読取り根拠

[bootstrap.mjs](../apps/web/src/bootstrap.mjs)、[login-ui.mjs](../apps/web/src/login-ui.mjs)、[editor-ui.mjs](../apps/web/src/editor-ui.mjs)、[author-ui.mjs](../apps/web/src/author-ui.mjs)、[session.mjs](../apps/web/src/session.mjs)、[trial-client.mjs](../apps/web/src/trial-client.mjs)、[author-store.mjs](../apps/web/author-store.mjs)、[外部作者契約](../apps/web/src/preset-author/preset-author-contract.mjs)、[外部Web adapter](../apps/web/src/preset-author/preset-author-web-adapter.mjs)。本書はこれらのsourceから手順を記述し、実行件数を新たに測定していない。最新版の状態とEvidenceは[WEB_UI_REVIEW.md](WEB_UI_REVIEW.md)およびmainの統合報告で確認する。

## 最新追加：試用編集期限と取消

Node / Sitesとも、本人principalの **trialEndsAt（ISO）** が編集期限。招待コードの利用期限とは別で、固定の「何日間」をUIが推定しない。Editorヘッダーと期限バーで日時を確認する。日時未設定は操作不可で、勝手な既定期限を補わない。

期限到達またはserverの `TRIAL_EXPIRED` / `TRIAL_REVOKED` / `TRIAL_END_NOT_CONFIGURED` を受けると、追加編集・保存・Final・作者保存提出・Preset適用・admin操作は停止し終了案内を表示する。表示中の写真・元Recipe・履歴・保存済原本・下書き・提出は削除しない。UI生成download URLは解除し、新exportは提供しない。Before / Afterの既存表示を保持する。未保存内容を勝手に成功保存へ変更せず、管理者へ確認する。終了状態のLoginも同じ3理由を表示し、再入力で終了を回避しない。

ブラウザ時刻での表示停止は補助であり、本当の権限判定ではない。mainのsession / APIは各編集・Save・Export等でlive server authorizationを行い、serverの期限/取消と本人Asset権限を検証する。ローカルpreviewや過去のログインCookieを新しい編集許可の代用にしない。管理者が期限を変更した後は本人が再読込/再ログインし、serverの最新期限表示と操作結果を確認する。

### 管理者による期限管理

1. admin本人でAuthor画面を開き、「試用メンバーと編集期限」→「再取得」を押す。serverのauthor / admin role、作者名、期限ISO、取消状態を確認する。NodeはメンバーIDがinvitation IDで**招待単位**、Sitesは1emailのmembership ID単位。Nodeのメール未登録を別人のメールへ推定しない。
2. **Sitesだけ**新規招待メンバー作成formを実接続する。email / authorName / role / 編集期限 / 招待有効期限を明示入力する。2日時はdatetime-local、ブラウザのローカル時間からISOへ変換して送る。既定日数・自動満了日・秘密コードは生成しない。Nodeの招待発行は管理者CLIの別工程で、この画面は作成成功を演出しない。
3. 既存メンバーの新しい編集期限を日時欄へ入力し「期限を更新」を押す。確認ダイアログのISO日時を確認する。`updateMember(id,{trialEndsAt})`の実応答が対象ID/日時と一致してから更新成立とする。
4. 「招待を取り消す」は確認後に `revokeMember(id)`を送る。実応答の同じID / revoked=trueを確認して取消成立とする。原本/Recipe/提出を消すAPIを呼ばない。新規作成・更新・取消の失敗時は成功表示せず、入力・保存データを保持する。
5. 対象本人の別ブラウザで新しい操作が期限切れ/取消として拒否されるか、期限更新後は再ログインで正しい期限になるかを**別途実測**する。管理者画面の成功応答だけで本人側停止やSites稼働を合格にしない。secret値・token・Cookieを撮影しない。

前掲の管理者レビュー一覧status差に対して、mainの許可を受けUIはSUBMITTED / ACCEPTED / REJECTEDの3状態を読取り可能にした。審査buttonはSUBMITTEDだけ有効のままで、審査済み版を再承認しない。これはsource修正であり、審査後再取得の実ブラウザ合格はmainの新Evidence待ち。

期限UIの検証済み範囲: Editor / Author / Loginの構文、明示日時→ISO変換、不正日付・未入力・timezone付き非datetime-local入力の拒否をread-only Nodeで確認。期限到達/取消の実ブラウザ、Node/Sites権限境界、管理者member E2Eは本書担当で **NOT_RUN**。実RAW0 / 顔Privacy BLOCK / Sites未配備 / Safari-iPad実機未実行の状態は変えない。製品source以外の旧Evidenceを変更しない。

追加read-only検証: 実sourceのUI access closureを抽出し、LOCAL_QA対象外、期限未設定拒否、過去期限拒否、未来期限、取消latch、同じ拒否理由で再帰renderを繰り返さないことを確認してexit0。download生成guard / Blob URL解除 / Sites限定create / member4API導線 / Login3終了理由も静的確認。初回のinlineコマンドはPowerShellの引用エスケープで検査script自体がSyntaxErrorになりexit1、stdin入力へ修正した再実行はexit0。製品構文エラー・API/DOM成功ではない。

### Sitesログアウトの最新接続

Sitesのlogout結果はmainのSitesClientが返す `{signOutURL:'/signout-with-chatgpt?return_to=%2F'}` の単一フィールド構造を使用する。Editorは同一origin・正確な `/signout-with-chatgpt` path・rootへの単一return_to・credential/hashなしを検証した場合だけtop-level `location.assign`で移動する。別origin・別path・不正query等は拒否し、logout成功を演出しない。これはChatGPT sign-outへの移動開始であり、実環境でログアウト完了を測定したことではない。

Nodeは従来どおりlogout API→getSessionでprincipalなし確認→/loginを維持する。両モードともdirtyな写真・未保存作者下書きの防止は維持し、未保存内容を破棄して移動しない。期限UIや保存済原本/Recipe/提出の保持は再設計しない。

実行済み: Editor構文exit0。read-only Nodeで許可URL2例・不正URL12例（別origin/別path/javascript/外部return_to/重複query/hash/URLcredential/必要query欠落等）の拒否、未保存保護・Node session確認・top-level遷移のsource存在を確認してexit0。Sites本物ChatGPT sign-out・Nodeブラウザlogoutはこの差分で未実行。UI成功を新しい認証Evidenceへ転記しない。
