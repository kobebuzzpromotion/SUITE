# SUITE 独立未実装機能の進捗

## コード進捗の報告ルール（2026-10-05 ユーザー指定）

### 2026-10-08 最新：Astra単独17件のコード追加

**17件中、処理コード追加17件・未着手0件。** ユーザー「スタート」で再開し、Astra3担当と親で排他並列実装。各件の処理・ファイル・残依存は `docs/ASTRA_17_CODE_HANDOFF.md`。以下のAstra「完成0・部分3・未着手14」は追加前の履歴であり、現況に使わない。

これは元候補全体の「17件100%完成」という報告ではない。Perfect ShotのTSQ encoder、私有Lightroom現像互換等は未実装。AI項目は明示モデル契約に従う実推論呼出しを書いたが、対応weights・ORT・モデルIO資産は未同梱。モデル資産を捏造してコード完成数へ含めない。新たな百分率は分母を確定できないため付けず、具体的に書いた処理と残りを17行で示す。

今回も検査・実験・テスト・ビルド・画面接続・配備は未実施。認証/Recipe/既存保存契約は変更していない。

### 2026-10-08 最新：混合16件の処理コード作成

**混合16件中、処理コード作成16件・書き残し0件（下記引継ぎの入出力契約・SUITE独自処理の範囲）。** 各件100%の内容と対象ファイルは `docs/MIXED_16_CODE_HANDOFF.md` の16行に記録。モデル推論の呼出しも実adapterを書いたが、学習済み重み・ORT・商用利用条件・host認可・対象選択等は別途必要。未同梱資産を供給済み／実行済みとしない。これまでの「部分着手15・未着手1」はこの追記前のスナップショット。

今回、検査・実験・ビルド・ブラウザ操作・アプリ接続・配備は行っていない。全要素の製品完成や他社同等性を示す数字ではない。semantic遮蔽判定等の限界、曖昧な歯列の手動指定は引継ぎに明記。15分の継続指示はユーザーの撤去指示で削除済み、再作成しない。

### 2026-10-08 SOLコード先行の追記（検査・実験なし）

SOL中心11件のうち従来残り3件について、純粋な処理／データコードをそれぞれ追加した。**SOL担当コード作成段階は11件中11件**（従来8件＋今回3件）。これはソース作成の数で、アプリ接続、実転送、テスト、画質判定、元製品との同等性、44件の製品完成数ではない。今回テスト・実験・ビルドはユーザー指定により未実施。

| 元の項目名 | SOLコード段階 | 今回書いた差分 | 後段に残すもの |
| --- | ---: | --- | --- |
| Desktop Export size | 100% | 明示指定時だけの厳密W×H処理（余白・中央切抜き・引伸ばし）。既存Dimensionsは不変。 | 縦横比不一致時の製品既定方針、画面／書き出し接続・検査。 |
| Desktop ↔ iPad compatibility | 100%（SOL担当のデータ処理） | 双方向の版付き能力差、未対応フィールド、元・相手データの非破壊引継ぎ計画。 | 認証済み転送、Apple/Webアプリ接続、実機検査はAstra後段。互換製品としては未完成。 |
| Desktop Output adjustments | 100%（SOL担当の画素処理） | Screen/Print × Low/Standard/Highの6選択にSUITE独自の暫定unsharp値を実装。 | 暫定値のユーザー評価、UI／書き出し接続・検査。元製品の未公開数値との一致は主張しない。 |

以下の「8件、残り3件」は2026-10-08追記前の会話時点スナップショットであり、現況のSOLコード段階には用いない。

機能コードを作る段階の進捗は、担当区分ごとに **「N件中、コード完成A件・着手B件・未着手C件」** を最初に示し、各項目を元の正式名で一行ずつ列挙する。各行には **コード達成率、書き残した処理コード、算定根拠** を記す。着手（対応コードが一部ある）とコード完成（その項目に必要な処理コードを書き終えた）を混同しない。割合が見積もりなら「約」を付け、検査件数や経過時間から推定しない。状況が変わったら同じ表を更新する。

コード達成率には、試験・審査・ブラウザ操作・実RAW・実機・配備・元製品との画素同等性を混ぜない。これらとアプリへの接続は別段階・別欄で報告する。**コード100%は製品完成・動作合格を意味しない**。一方、後段の検査が未実施という理由だけで、書き終えた処理コードを0件と報告しない。安全制約とリリース判定は従来どおり別途守る。

会話時点のコード段階の暫定報告: **Sol中心11件中、着手11件、処理コード完成8件、残り3件**。残りの達成率は Desktop Export size 約70%、Desktop Output adjustments 約15%、Desktop ↔ iPad compatibility 約20%。この割合は下位操作の実装状況からの概算であり、残工数や試験合格率ではない。Astra中心17件とSol/Astra混合16件は別枠で同じ形式を使い、重複計上しない。混合とは一機能内の処理難度が異なる意味で、共通基盤を複数担当が同時編集する指示ではない。

### Astra中心17件のコード段階・暫定スナップショット

**コード完成0/17、機能処理コードに部分着手3/17、機能処理コード未着手14/17。** 下表の割合は、元候補の主要処理ブロックと実コードの対応から付けた粗い概算であり、時間・品質・試験合格率ではない。診断用コードや候補計画だけでは機能処理の達成率を増やさない。担当者がSolで書いた部分コードも、その機能の進捗として数える。

| 元の項目名 | コード達成率 | 現在ある機能処理コード・書き残し |
| --- | ---: | --- |
| HDR Optimization | 約20% | HDR Float32フレームとSDRプレビュー変換あり。HDR最適化、実HDR入力・HDR出力の処理が残る。 |
| Personalized AI Look | 0% | 学習・推定・適用するLook処理がない。 |
| Facial Expression | 0% | 口の位置の調査コードのみ。表情を変える処理がない。 |
| Facial Reshape / Head Pose | 0% | 顔姿勢を変える処理がない。 |
| Original Shadow | 約40% | 手動の人物・影マスクと合成処理あり。元影の自動抽出とAdd Shadowとの共存処理が残る。 |
| Body Hair Removal | 0% | 体毛検出・除去処理がない。 |
| Clothing Moiré Removal | 0% | 衣服の自動検出・モアレ修復処理がない。 |
| Generative Expand | 0% | 写真外の生成処理がない。 |
| Grass Fill | 0% | 芝の判定・生成処理がない。 |
| Liquify Background Repair | 0% | 変形後の背景を生成修復する処理がない。 |
| Mobile Motion Blur | 0% | 被写体・動きを考慮した生成処理がない。 |
| Perfect Shot | 0% | 候補範囲の計画コードのみ。自動判定・補正処理がない。 |
| Smart Culling | 約20% | 手動マーク、Project単位の状態・保存・フィルタ処理あり。AI解析、クラスタリング、自動選別が残る。 |
| AI Facial Recognition | 0% | この候補固有の顔識別処理がない。 |
| Detail Enhance | 0% | 既存の通常シャープとは別のAI Lab細部復元処理がない。 |
| Golden Blonde Hair | 0% | 髪領域の特定と該当変換処理がない。 |
| Old Photo Restoration | 0% | 古写真の欠損・傷の生成修復処理がない。 |

Sol/Astra混合16件のAstra側コードはこの17件に足していない。上表は未実施の試験や公開配備を0%理由にしていないが、部分コードを機能コード完成100%にもしていない。

### 2026-10-08 混合16件のコード段階（Astra一項目単独引継ぎ）

**16件中、コード完成0件・部分着手15件・未着手1件。** Solが以前書いた分も当該項目の進捗へ含める。割合は主要処理ブロック数からの粗い概算であり、算定できないものには数値を付けない。検査・実験・アプリ接続・画質評価は分母に含めない。今回のAstra担当は重複しない項目を並列にコード編集し、Sol/Astraで同一項目を同時編集しない。

| 元の項目名 | コード達成率 | 書き残した処理コード・根拠 |
| --- | ---: | --- |
| Levels | 未算定・完成間近 | 4ch階調、Local、Histogram、Sampler、Sync、複数Preset処理は既存。Community適用範囲などの処理契約が未確定。 |
| Clothing adjustments | 未算定 | 手動patch修復あり。衣服領域検出、シワ等の元操作全体は未対応。 |
| Facial Reshape / Eyebrows | 約75% | 今回5幾何操作と左右連動／独立を追加。眉landmark抽出、姿勢・遮蔽対応、iPad Height差分が残る。 |
| Facial Reshape / Nose | 約75% | 今回6局所変形を追加。鼻landmark抽出、姿勢・遮蔽対応が残る。 |
| Hands | 約25% | 手動mask内トーン処理あり。対象検出・血管修復・指／掌変形が残る。 |
| Makeup / Highlight | 約65% | 明るさ処理と今回の要所landmark→maskを追加。要所landmark抽出が残る。 |
| Makeup components / Blush | 未算定 | 手動頬mask・単色彩色あり。頬自動抽出、12スタイル処理が残る。 |
| Makeup components / Contacts | 未算定 | 手動虹彩mask・彩色あり。虹彩／瞳孔抽出、11スタイル処理が残る。 |
| Makeup components / Eyelashes | 未算定 | 手動曲線描画あり。眼・まつ毛領域抽出、端末別スタイル・遮蔽処理が残る。 |
| Makeup components / Eyeliner | 未算定 | 手動線描画あり。瞼抽出、スタイル適合・遮蔽処理が残る。 |
| Makeup components / Eyeshadow | 未算定 | 手動三役mask・彩色あり。眼周囲抽出、端末別スタイル処理が残る。 |
| Makeup components / Face Decorations | 未算定 | 手動そばかす点描あり。顔領域抽出、6スタイル配置が残る。 |
| Teeth | 約30% | 明度・脱彩度処理あり。歯検出、欠損・歯縁修復、整列、生成が残る。 |
| Add Shadow | 約80% | 既存描画・手動maskに加え、今回source/proxy幾何換算と異寸法背景の明示配置を追加。自動subject抽出が残る。 |
| Black & White Edge Removal | 約40% | 手動mask・白黒縁補正あり。自動対象／影響領域判定、写真別Syncが残る。 |
| Batch Edit | 0% | 元項目はAI Lab People Removal一括処理。一般Recipeコピーは別機能で、人物除去生成は未実装。 |

今回の変更は純粋コードに限る。`Add Shadow` の背景配置は明示指定がある場合のみ、`Nose` と `Eyebrows` は明示landmark、`Makeup / Highlight` は明示landmark/skin maskが必要。自動認識や真正本人認可を既存の手動入力で代用したことにはしない。新規テスト・ビルド・実験はユーザー指示により未実施。

この台帳は、会話内の「重複していない44件」を母数とした作業進捗です。一次37件に加え、二次判定原記録に列挙された7件の名称を元137件一覧のIDへ照合し、44件すべての候補名・IDを回収しました。ただし各候補の全下位操作・元製品との意味的独立性の個別監査は継続中で、44件の実装完了を示すものではありません。2026-10-04の下位操作監査で、従来「接続・自動試験済み」と数えた7件はいずれも元候補の全要素までは未接続と判明しました。既存の動く限定機能は保持し、元候補の全要素完了とは別に数えます。実RAW目視・実機・公開配備も別Gateです。

## 現在

- 2026-10-05 利用枠停止: 週次残量14％（使用86％）を確認し、15％以下の停止条件に従い新規実装・試験を停止。heartbeat `suite` はPAUSED。A/B/Cは安全な区切りで排他返却。元候補全要素完了は **0/44** のまま。直近の全Web **1638/1638**・Backend **268/268** は後続差分の前であり、現全体回帰は未実行。実RAW/実機/CloudもNOT_RUN。

- 進め方は二段階: 各機能の実処理・UI・必要なRecipe/Undo/Redo/保存/再読込/Finalを接続し、対象試験と認証/権限/原本不変/破壊防止の安全試験を直後に実行。実機・実RAW・Cloud・全体回帰など重い最終確認は後段にまとめられるが、中間は「実装済み・最終未検証」と分け、元候補全要素PASS数を早めない。既存の排他とCloud停止条件は継続。

- 元候補の一覧: 44（一次37件＋二次7件のID・名称を照合。個別下位操作の照合は継続）
- 元候補の全要素完了: **0件**（一次資料の下位操作との照合が必要）
- SUITE限定機能の接続・自動試験済み: **12件**（元候補全要素PASSではない）
- 残る元候補: 44件。Point Curvesは回収した二次7件に含まれず、別途UI/Recipeの実装範囲として管理。
- 重複統合: 保留。元候補の全要素照合と未実装接続を進めた後に固有差分を維持して開始。

## 2026-10-04 継続作業の独立確認

- Face Decorations手動そばかすtyped Recipe/Preset隔離: `faceDecorationsManual`へ写真/人物/原寸と1〜64点の正規化位置/半径/RGB/opacityを厳格保存、偽alias/公式style/bitmap/権限・保存版自称を拒否。Personal/Workspace写真固有Preset create/update/旧汚染apply拒否、中立Preset維持。担当新6/6・Backend全247/247・build、メイン独立6/6 PASS。実Asset保存Gate/人物privacy/Worker/Editor/Final/実RAW/Cloud未接続、0/44維持。

- EV3-0185 Nose差分監査: 公式Desktop/iPad/MobileのSize/Length/Horizontal/Nose Bridge/Width/Nose Tip 6操作を区別。Bridgeだけ/全体Width/Tipだけは固有差分で統合しない。数値範囲/画素式/端末同等は未公表、現SUITE顔oval明度/全写真Rotate/Cropに鼻幾何は無い。担当新5/5・関連10/10、メイン独立関連10/10 PASS。人物privacy/Recipe/UI/Final/実RAW/Cloud未接続、0/44維持。

- Eyeshadow限定Worker/facade: 保存typed三役stroke→原寸/Proxy三役mask→純粋RGBA彩色をAsset/SHA/person/眼/版/寸法/target/Abortで再検証。通常renderは未認証Eyeshadowを明示拒否し旧中立render維持。担当新6/6・関連31/31・build、メイン独立核/mask/Worker関連19/19 PASS。runtime自称は人物privacy/真正Originalの証拠でなく、認証済みSession/製品Editor/Final/実RAW/Cloud未接続、0/44維持。

- EV3-0145 Head Pose差分監査: 公式Desktop/iPadはUp/Down・Left/Right・Tiltの各−100…+100/既定0、Mobileは掲載のみで同一範囲/画素未確定。現顔oval Face Brightnessや全写真90° Rotate/Cropは顔の3方向姿勢変更でなく、MediaPipe変換行列も無効。担当新5/5・関連9/9、メイン独立関連9/9 PASS。幾何/生成式・本人privacy/Recipe/UI/Final/実RAW/Cloud未接続、0/44維持。

- Face Decorations本人明示そばかすのSUITE限定純粋核: 1〜64正規化点/半径/RGB/opacityを決定的soft radial dotとしてRGBA8へ適用し、Asset/SHA/person/版/原寸/source・1600px Proxy/8MP/Abortを構造検証。対象外/alpha/透明hidden RGB/入力不変。担当新6/6・build、メイン独立監査含関連10/10 PASS。caller自称の顔/本人は権威でなく、公式6素材・式/Recipe/UI/Worker/Final/実RAW/Cloud未接続、0/44維持。

- Eyeshadow手動文書のNode/Trial直接保存Gate: JWT/actor・tenantの実登録非trash Asset ID/SHA/edit権限と版CASをtransactionの保存前後・履歴読戻しで照合。別Asset/SHA・Viewer・失効・削除・競合Eyeshadowを拒否し旧中立Branch維持。担当新3/3・関連16/16・build、メイン独立Recipe/Preset/save関連10/10 PASS。JSON person/眼位置/原寸は認証・decode証拠でなく、Worker/製品Editor/Final/実RAW/Cloud未接続、0/44維持。

- Eyeliner限定Trial保存host: 実Trial HTTP/SQLiteでfresh本人/tenant/登録Asset/SHA/edit/Recipe版、Original digest・host内Worker LibRaw final decode provenance/原寸、Abort/失効を拒否側で検証。通常Trialはprivacy reviewで正のCAS/readbackに到達不能。Node synthetic person mode・非RAW・別tenant・注入decoderも製品成功としない。担当新6/6・build、メイン独立6/6 PASS。実RAW/Editor mount/Final/Cloud未証明、0/44維持。

- EV3-0037 Face Decorations差分監査: 公式Desktop/iPad/Mobileはそばかす6種、公式Web紹介はstyle/intensity/Preview/ExportとDesktop Preset/Batchを記載。個別端末Amount契約・素材使用権・画素式/互換は未確定。現顔oval明度/Blush/Eyeshadow/Contacts/除去処理は別意味で専用Recipe/UI/Final/Preset未接続。担当新4/4・メイン独立4/4 PASS。最小SUITE本人明示点描は公式6種でなく、実RAW/実機/Cloud別、0/44維持。

- Eyeshadow限定typed Recipe/Preset隔離: 三役ADD/ERASEとAsset/SHA/person/眼/原寸・色/opacityをUI文書shapeで厳格保存、bitmap/偽alias/保存版・権限自称/未知キー/過大JSONを拒否。Personal/Workspace Presetへの写真固有create/update/旧汚染applyを拒否し中立Preset維持。担当新7/7・関連26/26・build、メイン独立7/7 PASS。旧監査の偽alias受理期待は更新し4/4 PASS。実Asset保存Gate/人物privacy/Worker/製品Editor/Final/実RAW/Cloud未接続、0/44維持。

- Contacts限定Trial保存host: 実Trial HTTP/SQLiteでfresh本人/tenant/登録Asset/SHA/edit/Recipe版、Original digest・decode寸法、CAS/readback/失効/競合/中断/保存後不確定を検証。通常Trialは人物privacyと虹彩位置の信頼できる証拠が無く保存前拒否。成功はNode synthetic-test-onlyのCAS mechanicsに限定。担当新7/7・関連35/35・build、メイン独立7/7 PASS。実RAW/内部Browser Worker/製品Editor/Final/Cloud未証明、0/44維持。

- Eyeliner限定Worker/facade: 保存typed線→原寸/Proxy runtime→実RGBAをAsset/SHA/person/版/寸法/targetとAbortで再検証。通常renderは未認証Eyeliner文書を明示拒否し旧中立Recipeを維持。担当新6/6・関連30/30・build、メイン独立純粋/Runtime/Worker関連18/18 PASS。callerの本人/Original出典は認証証拠でなく、製品Editor/Session/Final/実RAW/Cloud未接続、0/44維持。

- Eyeshadow三役stroke→mask限定runtime: UI下書きの眼周囲/虹彩保護/瞳孔保護を原寸・正確1600px Proxyで別再ラスタ化し、純粋彩色核のrole provenanceへ束縛。Asset/SHA/person/眼/保存版/寸法、alpha0/容量/Abort/入力不変を確認。担当新8/8・関連24/24・build、メイン独立核/mask/UI関連20/20 PASS。文書に保存revision/認証証拠はなくruntime版もcaller assertion、fresh本人/Original/privacy/Recipe CAS/Worker/Final未接続、0/44維持。

- Eyeliner保存線の限定runtime: typed連続edge/wingを原寸と厳密1600px Proxyへ投影し、純粋瞼線核へAsset/SHA/person/版/寸法/target/Abortを束縛。入力・対象外/alpha/透明hidden RGB不変、容量・偽権限・不正wing拒否。担当新6/6・関連18/18・build、メイン独立関連18/18 PASS。provenanceはcaller-assertedで本人privacy/Original真正性でなく、Worker/製品Editor/Final/実RAW/Cloud未接続、0/44維持。

- 現段階の全体回帰: Eyeliner旧監査をtyped alias拒否へ追随した後、メイン独立で全Web **1638/1638 PASS**、Backend＋scripts **258/258 PASS**。これは後続Agentのruntime/host差分より前のローカル試験で、実RAW/Chrome/実機/Cloud配備ではない。元候補0/44維持。

- Contacts独立After UI部品: 左右眼ring/pupil除外stroke・RGB/AmountをPointer/Touch/Keyboardで下書き、Undo/Redo/Cancel/Asset/person/SHA/版/権限変更で破棄。hostなし送信disabled、fresh照合応答不一致は拒否、callback後も保存済みと表示しない。担当新7/7・関連24/24・build、メイン独立7/7 PASS。公式11 styles/製品Editor mount/本人虹彩位置/Final/実RAW/Cloud未接続、0/44維持。

- Eyeliner手動文書のNode/Trial直接保存Gate: JWT/actor・tenantの実登録非trash Asset/SHA/edit権限・保存版CASを同transactionの前後と履歴読戻しで照合。別Asset/SHA・Viewer・失効・削除・競合のEyelinerは拒否し、旧中立Branchを維持。担当新3/3・関連14/14・build、メイン独立新/監査7/7 PASS。真正decode原寸/人物privacy/Worker/UI製品mount/Final/実RAW/Cloud未接続、0/44維持。

- Eyeliner監査の陳腐化期待をtyped境界へ追随: 全Web1631中1630 PASS・旧「偽eyeliner JSON受理」1 FAIL。製品の拒否を緩めず監査を偽alias拒否/旧中立Recipe維持へ更新し、メイン独立監査4/4 PASS。全Web再実行は後続Agent差分が落ち着いてから、0/44維持。

- Eyeshadow独立After UI部品: 眼周囲/虹彩保護/瞳孔保護の三役ADD/ERASEと単色/opacityをPointer/Touch/Keyboardで下書き、Undo/Redo/Cancel/眼・Asset/SHA/person/版/権限切替と遅延hostで破棄。hostなし送信disabled、hostの`saved:true`応答も保存済みと表示しない。担当新7/7・関連16/16・build、メイン独立7/7 PASS。公式14/8 styles/製品Editor/typed Recipe/Worker/Final/実RAW/Cloud未接続、0/44維持。

- Eyeliner本人明示連続瞼線のtyped Recipe/Preset隔離: optional `eyelinerManual`がUI/pureと同じ左右矩形・連続edge/wing・色/opacity/線幅・Asset/SHA/person/原寸を厳格保存し、偽alias/権限自称/bitmapを拒否。写真固有Preset create/update/旧汚染applyを拒否し旧安全Presetを維持。担当新5/5・関連Recipe15/15・JWT/SQLite Preset9/9・build、メイン独立5/5 PASS。実Asset保存Gate/本人privacy/Worker/Final/実RAW/Cloud未接続、0/44維持。

- Contacts限定Worker/facade: 保存typed文書→別ring/pupil mask runtime→純粋RGBA核へ接続し、facadeがAsset/SHA/person/眼/版/寸法/targetとAbortをsnapshot検証。通常renderの未認証Contactsは明示拒否。担当新6/6・関連35/35・build、メイン独立核/mask/Worker関連17/17 PASS。真正Original bytes・人物privacy/虹彩位置・Session/UI/Final/実RAW/Cloud未接続、元候補0/44維持。

- Eyeshadow本人明示mask単色彩色の限定純粋核: Asset/SHA/person/対象眼/保存版/原寸/source・1600px Proxyおよび眼周囲/虹彩/瞳孔別provenanceを検証し、明示眼周囲だけRGBA8彩色。虹彩/瞳孔・対象外/alpha/透明hidden RGB/入力不変。担当新5/5・メイン独立関連9/9・build PASS。自称maskは認可・眼検出の証拠でなく、公式14/8 styles/typed Recipe/UI/Worker/Final/実RAW/Cloud未接続。0/44維持。

- Eyeliner本人明示連続瞼線の独立UI部品: 左右眼矩形/edge/wing/色・opacity/線半径をPointer/Touch/Keyboardで下書き、Undo/Redo/Cancel/Asset/person/SHA/版/権限変化で失効。host不在は送信不可、応答だけで保存成功を自称しない。担当新6/6・関連16/16・build、メイン独立6/6 PASS。公式9/6 styles、typed Recipe/製品mount/Worker/Final/実RAW/Cloud未接続、0/44維持。

- Contacts ring/pupil stroke→原寸/Proxy mask限定runtime: typed文書を厳密再検証し、別ADD/ERASE maskを各解像度で再生成。Asset/SHA/person/眼/版/容量/Abort/透過/入力不変。担当新5/5・関連11/11・build、メイン独立関連11/11 PASS。内部ownerConfirmedはラスタ化API用で認証ではなく、fresh本人/真正Original/Worker/Editor/Final/Cloud未接続、0/44維持。

- EV3-0021 Eyeshadow差分監査: 公式Desktop/Mobile 14 styles・iPad 8 stylesを区別し、固有Amount EV3-0022・左右独立・素材/画素式は未確定。現Face Brightness/Localや他眼MakeupはEyeshadowでなく、偽JSON構造受理もRenderer/Preset実装ではない。担当新4/4・メイン独立4/4 PASS。専用Recipe/UI/Worker/Final/実RAW/実機/Cloud未接続、元候補0/44維持。

- Contacts手動虹彩ringのNode/Trial直接保存Gate: 現actor/tenantの登録・非trash Asset/SHAに写真固有文書を保存前と履歴読戻しで照合。旧baseはBranch化せず専用revision conflict、別Asset/SHA・Viewer・失効・削除は拒否し、旧中立RecipeのBranchは維持。担当新3/3・Backend全250/250・build、メイン独立関連10/10 PASS。真正Original原寸/人物privacy/虹彩位置、Worker/UI/Final/実RAW/Cloud未証明。元候補0/44維持。

- Eyelashes本人明示曲線の独立UI部品: After左右眼矩形・root/control/tip・色/opacityのPointer/Touch/Keyboard下書き、Undo/Redo/Cancel/Asset切替/失効での破棄を実装。担当新6/6・関連15/15・build、メイン独立6/6 PASS。これは公式17/14 stylesではなく、fresh本人host/typed保存/Worker/Final未接続。元候補0/44維持。

- Eyeliner本人明示瞼線SUITE限定純粋核: 左右眼矩形内の連続edge polyline＋端点wingを一定幅RGBA8で描き、個別まつ毛テーパー/虹彩ring色と対象・画素意味を分離。Asset/SHA/person/保存版/原寸/source・厳密1600px Proxy/容量/Abort、矩形外RGB/alpha/透明hidden RGB/入力・文書不変。担当新6/6・関連15/15・build、メイン独立6/6 PASS。自称瞼位置/本人は認可でなく、公式9/6 styles・Amount/画素式の再現でない。typed Recipe/Session/UI/Worker/Final/実RAW/Cloud未接続、元候補0/44維持。

- Contacts手動虹彩ring typed Recipeと写真固有Preset拒否: optional `contactsIrisManual`へAsset/SHA/person/左右眼/原寸・ring/pupil別bounded ADD/ERASE stroke・色/Amountを厳格保存。偽contacts alias/Bitmap/保存revision/自称認可を拒否し、Personal/Workspace Preset create/updateと旧汚染Preset applyを拒否。担当新7/7・Backend全247/247・build、メイン独立新＋監査11/11 PASS。fresh本人/虹彩位置・真正原寸/実登録Asset/SHA保存Gate、Worker/Session/UI/Final/実RAW/Cloud未接続、元候補0/44維持。

- EV3-0025 Eyeliner差分監査: 公式Desktop/Mobile 9 styles、iPad 6 designsを確認し、専用Amount EV3-0026は凍結監査NOT_CONFIRMEDのまま。現Face Brightness/隣接Blush/Eyelashesは瞼線のUI/実画素/保存/Final/Presetでなく、偽eyeliner JSON汎用受理はRenderer対応でない。担当新4/4・メイン独立4/4 PASS。公式素材/線幅/画素式・本人/瞼位置・実RAW/実機/Cloud未証明、元候補0/44維持。

- Eyelashes本人手動テーパー曲線SUITE限定純粋核: 片眼/両眼の明示root-control-tip二次Bezierを64分割の連続テーパーで決定的RGBA8へ合成し、Asset/SHA/person/保存版/原寸/source・Proxy/眼矩形/容量/Abortを構造検証。対象外/alpha/透明hidden RGB/入力不変。担当新5/5＋監査4/4・build、メイン独立5/5 PASS。自称眼矩形は検出・本人認可証拠ではなく、公式17/14素材/Amount/画素式の再現でない。typed Recipe/Session/UI/Worker/Final/実RAW/Cloud未接続、元候補0/44維持。

- Hands手動Tone Trial保存host限定: 実Trial HTTP/SQLiteで本人Session/tenant/登録Asset/SHA/edit権限/保存Recipe版/Original bytes digestをfresh確認し、caller decoderではなく内部同梱Worker LibRaw final provenance＋原寸を必須化。合成非RAWは`NOT_CAMERA_RAW`でRecipe書込前拒否。担当新4/4・Hand関連29/29・Web build、メイン独立4/4 PASS。正のCAS/readback経路は実RAWがなく未検証（偽Worker成功で代替しない）、製品Editor/Final/実Chrome/Cloudも未接続、元候補0/44維持。

- Contacts手動虹彩ring SUITE限定純粋核: 別出典の虹彩ring coverageから瞳孔除外maskを引き、opaque対象RGBだけを輝度基準の決定的sRGB8色効果へ。瞳孔/対象外/alpha/透明hidden RGB/入力不変、Asset/SHA/person/左右眼/保存版/原寸/source・1600px Proxy/容量/Abortを構造検証。担当新6/6・関連10/10・build、メイン独立6/6 PASS。callerのmask/人物IDは本人・虹彩検出の証拠でなく、元11スタイルの素材/式ではない。Recipe/Worker/Session/UI/Final/実RAW/Cloud未接続、元候補0/44維持。

- EV3-0023 Eyelashes差分監査: 公式Desktop/Mobile 17、iPad 14スタイルと左右連動/個別調整を区別し、専用Amount EV3-0024、素材/形状/画素式・端末互換は未確定とした。現Face Brightness/隣接Makeupはまつ毛効果でなく、偽eyelashes JSONの汎用構造受理はRenderer/Preset対応でない。担当新4/4・メイン独立4/4 PASS。権利確認済み素材、Recipe/UI/Worker/Final/実RAW/実機/Cloud未接続、元候補0/44維持。

- Hands手動Tone独立UI部品: Afterで本人明示手/前腕ラベル付きstroke、ADD/ERASE、Strength/RadiusをPointer/Touch/Keyboard操作し、Undo/Redo/Cancel、Asset/版/権限変化でpending draftを破棄・中断。host不在で送信disabled、callback結果を保存済みと自称しない。担当新6/6・Hand関連25/25・Web build、メイン独立6/6 PASS。fresh本人host・製品Editor/Session/Final・真正Original/手位置・実Chrome/RAW/Cloud未接続、元候補0/44維持。

- EV3-0027 Contacts差分監査: 公式Desktop/iPad/Mobileの11スタイル選択と、端末未指定チュートリアルの色選択/Amountを分離。SUITE顔oval/全体Color/HSL/Eyeshadow/Blush/Highlightは虹彩Contact effectではない。未知Contacts JSONの構造受理はrender/Preset実装証拠でない。担当新4/4・build、メイン独立4/4 PASS。虹彩ring/瞳孔保護、元11素材/式、本人/権限/Recipe/UI/Final/実RAW/実機/Cloud未接続、元候補0/44維持。

- Blush手動Trial本人保存host限定: 実Trial HTTP/SQLite＋EditorSessionでfresh本人/tenant実Asset/SHA/edit、保存portrait target continuity、Original digest＋decode原寸、CAS/readbackを検証。通常Sessionは`PRIVACY_REVIEW_REQUIRED`でreadyも保存も拒否し、成功はNode test runnerの`SYNTHETIC_TEST_ONLY`合成非RAWに限定、backend人物privacy権威ではない。別person/Asset/旧版/原本改変/失効/取消/再選択/保存後不確定を拒否。担当新8/8・関連35/35・build、メイン独立8/8 PASS。保存後Session同期・製品mount/通常Trial保存・Preview/Final・実RAW/Cloudは未接続、元候補0/44維持。

- Clothing手動Spot Trial保存host限定: 実TrialClient/EditorSessionでfresh本人/tenant・登録非trash Asset/SHA・Original bytes長+digest・内部Worker decode原寸・保存Recipe版/編集権限を前後照合し、typed文書をCAS→readback。Asset/版/失効/中断/読戻し不確定は成功表示しない。担当実HTTP/SQLite新6/6・Clothing関連24/24・build、メイン独立6/6 PASS。合成非RAWの実Workerは保存0で拒否、成功CAS試験は明示的な偽Worker mechanics-onlyで実RAW成功根拠ではない。製品mount/実RAW/Chrome/Final未接続、元候補0/44維持。

- Hands手動Tone独立Worker/facade限定接続: 保存typed文書/版/Asset/SHA/原寸/targetをWorkerで再検証→保存strokeから原寸/Proxy mask→純粋toneを実RGBAへ適用。facadeはRecipe/frame snapshotとAbort/disposeの結果非露出、通常renderは未認証Hand文書を黙示無視せず拒否。担当新6/6・旧Blush/Clothing/Shadow/BW関連48/48・build、メイン独立核/mask/Worker19/19 PASS。真正Original bytes・本人/手位置/Session/UI/Final/実RAW/Chrome/Cloudは未接続、元候補0/44維持。

- Hands保存stroke mask runtime: typed `handToneManual.handStrokes`から原寸/厳密1600px Proxy別にADD/ERASEを再ラスタ化し、Hand純粋核専用のAsset/SHA/保存版/原寸/target/寸法provenanceを生成。8MP/96M work/96KiB/64 stroke/4096点/Abort/透明/入力不変を検証。担当新6/6・関連19/19・Web build、メイン独立核/mask13/13 PASS。内部構造の`ownerConfirmed`はgenericラスタizer呼出し用で本人認可証拠ではない。fresh本人・手位置/Original bytes、Worker/Session/UI/Final/実RAW/Cloudは未接続、元候補0/44維持。

- 統合回帰（現段階）: Blush/Handsの陳腐化した監査期待を実契約へ追随させた後、`npm.cmd run web:test` **1527/1527 PASS**、`npm.cmd test`（Backend＋scripts）**240/240 PASS**。合成非RAW/ローカル自動試験であり、実Chrome/実RAW/実機/Cloud配備のGateは別。元候補0/44維持。

- Clothing本人手動Spot UI独立部品: After上で小target drag・同寸法reference tap・target内ADD/ERASE strokeをPointer/Touch/Keyboard操作し、Undo/Redo/Cancel、Asset/版/権限変更時のpending draft破棄、Before/余白/dirty拒否を確認。typed文書はhost callbackへ渡すのみで保存成功を自称しない。担当新6/6・関連18/18・Web build、メイン独立6/6 PASS。fresh本人host/真正原寸・製品Editor/Session/Final/実RAW/Chrome/Cloudは未接続、元候補0/44維持。

- Hands手動文書の実登録Asset直接保存Gate: Node WorkspaceとTrialの直接save/readbackで、同tenant登録非trash Asset/SHA、actor/roleまたはTrial JWT本人境界、版CASを照合。hand文書の旧baseはBranch化せず競合拒否、旧非hand RecipeのBranch維持。Node保存後SHA変化readback、別Asset/削除/Viewer/失効を拒否。担当新3/3・関連19/19・build、メイン独立3/3 PASS。Trialに独立Viewer/edit役割はなく同じ粒度を主張しない。真正原寸/手位置、Worker/UI/Final/実RAW/Cloud未接続、元候補0/44維持。

- Blush本人手動UI独立部品: 明示左右の頬stroke・色/opacityをAfter上でPointer/Touch/Keyboard操作し、Undo/Redo/取消、Asset切替・権限失効/保存中readback変化で下書きを破棄。型付き保存strokeは平坦群で左右ラベルを永続化しないため、再読込を左/右と推測表示しない。担当新7/7・Blush関連31/31・build、メイン独立新7/7 PASS。fresh本人host・製品Editor mount/Session保存/Final、頬自動判定・公式12 styles・実RAW/Chrome/Cloudは未接続、元候補0/44維持。

- Hands手動限定typed Recipeと写真固有Preset拒否: optional `handToneManual`にAsset/SHA/原寸、最大64本/4096点のnormalized ADD/ERASE stroke、strength/radiusを厳格保存。偽hand alias/Bitmap/保存revision/自称認可を拒否し、Node Personal/Workspaceへの写真固有コピー（旧汚染Presetの適用含む）を拒否。担当新7/7・関連15/15・build、メイン独立7/7 PASS。実登録Asset/SHA/current権限・真正原寸/手位置/Worker/Session/UI/Final/実RAW/Cloudは別Gate、元候補0/44維持。

- Clothing手動Spot独立Worker/facade限定接続: 保存typed文書のtarget/reference矩形をsource/1600px Proxyへ投影し、保存ADD/ERASE strokeをtarget patchへ再ラスタ化して純粋RGB修復。Asset/SHA/保存版/原寸/表現/出典/容量/Abortを再検証し、通常renderは未認証Clothingを黙示無視せず拒否。担当新6/6・Clothing/Blush/BW/Shadow関連35/35・build、メイン独立のClothing核/Worker＋Blush Worker18/18 PASS。真正Original寸法・本人衣服範囲・Session/UI/Final/実RAW/Cloudは未接続、元候補0/44維持。

- Hands手動限定トーン均一化純粋核: 本人明示手/前腕mask内の局所輝度平均から偏差をbounded補正し、RGB共通gainで色比率を非clipping時維持。mask外/alpha/透明hidden RGB/入力不変、Asset/SHA/保存版/原寸/source・1600px Proxy/出典/容量/Abortを構造検証。担当新7/7・Web build、メイン独立7/7 PASS。自称maskは本人認可・手位置証明でなく、Hand Vein/Reshaping/元製品同等性でもない。Recipe/Session/UI/Worker/Final/実RAW/Cloud未接続、元候補0/44維持。

- Clothing手動スポットの実登録Asset直接保存Gate: Node WorkspaceとTrialの直接save/readbackで、同tenantの登録済み非trash Asset/SHA、actor編集権限、版CASを確認。別写真/古いSHA/Viewer/失効/削除/競合は無変更拒否し、衣服文書の旧baseはBranch化しない（他Recipeの旧Branchは保持）。担当実JWT HTTP/SQLite新2/2・関連10/10・Backend203/203・build、メイン独立新2/2 PASS。真正原寸/本人明示stroke出典、Worker/UI/Final/実RAW/Cloudは未証明、元候補0/44維持。

- Blush独立Worker/facade限定接続: 保存済みtyped文書のstrokeをsource/1600px Proxy別maskへ再生成し、別operationでRGBA8彩色。Asset/SHA/person/版/寸法/出典/容量/Abortとgetter偽装を拒否し、通常renderは未認証Blushを黙示無視せず拒否。担当専用6/6・関連32/32・build、メイン独立mask/Worker12/12 PASS。fresh本人認証host、Session/UI/Final、実RAW/Cloud、元12 stylesは未接続。元候補0/44維持。

- Clothing本人手動限定スポット純粋核: 同寸法・非重複の明示小target/referenceとlocal coverageから元写真の参照RGBだけを決定的に転写。Asset/SHA/版/原寸/source・1600px Proxy・構造出典/容量/Abortを検証し、mask外RGB、alpha/透明hidden RGB、入力不変、別Asset/曖昧範囲拒否。専用6/6・build、メイン独立6/6 PASS。本人認可/衣服判定/Recipe/Session/UI/Worker/Final/RAWは未接続、0/44維持。

- Blush手動mask独立runtime: typed `cheekStrokes`から原寸/厳密1600px Proxy別にmaskを再ラスタ化し、既存SUITE独自彩色核が受ける出典へ束縛。Asset/SHA/person/保存版/寸法・target、8MP/96M work/96KiB/Abort、透明画素/偽出典/getterを検証。専用6/6・関連20/20・build、メイン独立のmask/核14/14 PASS。本人/頬位置は呼出側Gate、Worker/Session/UI/Finalは未接続。typed Backendのsettings getter事前評価問題を発見しCへ現排他内の修正を割当済み、修正試験まで当該安全境界PASSとしない。0/44維持。

- Original Shadow製品Editor限定mount: After・明示背景選択から実Trial/Session bridgeへ二層UIを接続し、両Original bytes SHA/decode出典/同寸法/保存Recipe版・権限をfresh確認。Before/切替/失効/取消/異寸法/Add Shadow同時と他ブラシ競合は拒否。新Editor2/2・関連35/35・build、メイン独立のEditor/bridge7/7 PASS。Browser fixtureはbundleのみで実Chromeは朝の本人合図待ち、実RAW/Cloud/AI自動影抽出もNOT_RUN、0/44維持。

- Blush手動限定typed RecipeとNode写真固有Preset拒否: optional `blushManual`にAsset/SHA/person/原寸、bounded normalized ADD/ERASE頬stroke、色/opacityを厳格保存検証し、偽`blush` aliasを拒否。Personal/Workspace full Presetで写真固有文書のcreate/update/別Asset Applyを拒否し、旧正常Presetを維持。新Backend7/7・全Backend220/220・Web監査/純粋核12/12・build PASS（担当報告、メインWeb12/12独立PASS）。Worker/Session/UI/Final、Trial/Cloud認可、公式12 stylesは未接続、0/44維持。

- EV3-0313 Clothing adjustments差分監査: 主De-wrinkle、細/粗しわ、De-Blemish、縁Smooth/Refine、近接物体保護の元7操作と補助手動ペン、Mobileの上下衣服/汗染み/Sync差を区別。現Detail/Local/subject maskは衣服検出・修復・保護でない。新5/5・関連8/8・build、メイン独立5/5 PASS。本人明示小領域のSUITE独自スポット修復を次の限定段階とし、実衣服/RAW/実機/Cloud/元製品同等性は未証明、0/44維持。

- Vignette監査陳腐化期待の修正: 全Web1460件中1459 PASS、1件の旧AUDIT02「Author portable一律拒否」が後続のtyped Vignette Preset実装と不一致。製品/Preset契約を変更せず、監査試験をtyped正例と写真固有Crop/未知field拒否の負例へ更新し、専用＋現Author portable/Trial関連11/11 PASS。全Web再実行は後続Agent編集終了後、元候補0/44維持。

- EV3-0169 Eyebrows差分監査: 元5種の眉幾何操作＋左右連動/独立、iPad記事の別Height表記を、眉メイク9スタイル・Face Brightnessとは区別。現Web/Appleに眉輪郭/幾何変形/保存/Final/portable Preset経路なし。新監査4/4・関連12/12、メイン独立4/4 PASS。全体buildは他担当のBlush typed契約編集中に停止しC成果のbuild PASSとはしない。実RAW/実機/Cloudも未検証、0/44維持。

- EV3-0030 Blush手動限定純粋核: 本人明示頬mask内のSUITE独自RGBA8色/opacity×coverage合成をAsset/SHA/person/原寸/保存版/source・proxy出典で構造検証。mask外RGB、alpha/透明hidden RGB、入力不変、neutral/異realm/容量/途中Abortを確認。新8/8・関連31/31・build、メイン独立8/8 PASS。構造出典は本人認可や頬位置証明ではなく、Recipe/Session/UI/Worker/Finalと公式12スタイルは未接続、0/44維持。

- Original Shadow製品Editor独立bridge: 実TrialClient/EditorSession以外や偽hostを拒否し、二層UI/Trial CAS hostを選択target/background/After/保存版/両Original bytes SHA・decode出典/同寸法/権限へ束縛。CAS後もSession reloadとverified Previewまで確認してacceptedを返す。Before/古い選択/版/Add Shadow同時/取消/失効/異寸法は拒否。新5/5・関連27/27・build、メイン独立5/5 PASS。製品Editor mount/実Chrome/RAW/Cloud/元AI自動Shadowは未接続、0/44維持。

- Smart Culling XMP限定往復: 保存済みRating 4/Label文字列からVerified Node Panelで既存XMP bytesを取得し、本人明示の別AssetへPreview（保存前不変）→別クリック適用→CAS/readbackを実JWT/SQLiteで確認。元/対象mark、対象Flag/Tags/Segment、Original SHA/bytesを保持し、版競合・Reject/未知XMLを拒否。新3/3・XMP関連24/24・build、メイン独立3/3 PASS。出力/parserは整合し製品source修正なし。実Chrome/RAW/Trial/Cloud/Final/他アプリ一般互換はNOT_RUN、0/44維持。

- EV3-0030 Blush差分監査: 公式Desktop/iPad/Mobileは12スタイルを記すが、専用Amount・頬形状/画素式は不明。現Face Brightness/Local Levels/手動Highlightは別効果でBlush描画/UI/保存/Final/Presetは無い。未知`blush` JSONがBackend構造検証を通り得てもWeb rendererは拒否。新規監査4/4・関連20/20・build、メイン独立4/4 PASS。本人手動・単一頬彩色のSUITE独自核を次の限定段階とし、公式12スタイル完成/実RAW/実機/Cloudは未証明、0/44維持。

- Smart Culling XMP限定取込のVerified Node Panel: 単一sidecarを4KiB/厳格Rating 0〜5・非空Labelに限定してPreviewし、別クリックで明示適用。認証済みAsset registry SHAと現選択/Project版を再Gateし、保存後Panelでも再読込。他mark保持、未知/Reject/巨大XML/切替/失効/409/応答喪失は成功表示しない。新5/5・関連69/69・build、メイン独立の取込/取得関連15/15 PASS。現製品Trial/Cloud OIDC host、実Chrome/RAW/他アプリXMP一般互換は未検証、0/44維持。

- Desktop↔iPad保存Recipe互換性のdata-only表示: 現選択Asset ID/SHAとlibrary一致、保存revision、clean/busy/期限/SessionをGateして、stage/extension/order別にsupported/unverified/unsupportedを読取り表示。切替や版変更時は古い結果を破棄し、転送/Apply/Finalボタンや実機互換の主張なし。新規4/4・関連13/13・build、メイン独立の能力差＋表示11/11 PASS。実Chrome/Apple実機/RAW/Cloud/転送はNOT_RUN、元候補0/44維持。

- Smart Culling XMP限定取込部品: Adobe XMP Basicの単一RDF Description、4KiB以下の厳格UTF-8からRating 0〜5/非空LabelのみPreview化し、別段階明示承認後に実Node JWT/SQLiteの本人・選択・Asset SHA・Project版を再確認してCAS/readback。Flag/Tags/Segment/Original保持、Reject -1・未知/曖昧XML・競合/失効/不確定は拒否。新規6/6・関連16/16・build、メイン独立6/6 PASS。製品Panel接続/実Chrome/RAW/Cloud/他アプリXMP一般互換は未検証、0/44維持。

- Original Shadow通常Previewと保存後再Gateの限定接続: 保存二層文書と両Original bytes SHA/両decode出典/版/権限/同寸法を前後照合し、1:1手動合成→独立Worker ProxyをAfter、検証済み対象をBeforeへ。dirty露光/Undo/Redo/CAS save/reloadと失効・削除・競合・取消・切替時の旧URL破棄を確認。新規9/9・旧Final6/6・関連83/83・build、メイン独立の新旧15/15 PASS。実Chrome/RAW/製品Editor UI mount/Cloudは別Gateで元候補0/44維持。

- LR-02 Histogram公式全体表示: 図外に常設の実ボタンを設け、Histogram図のみhide/showしても再表示入口を維持。aria-controls/expanded、44px/focus/狭幅を既存様式で試験し、写真overlay/J/左右指標状態/トーン値・Recipe/Finalは不変。新2/2・関連19/19・build PASS。実Chrome/RAW/Adobe表示設定永続化/画素同等性は未証明、0/44維持。

- LR-02 Histogram公式指標表示設定: 旧監査の左右指標未実装記述を現コードへ訂正し、Adobe公式で明示された`Show Clipping in Histogram`だけをHistogram図のcontextmenu/常時見えるKeyboard対応buttonから切替。指標containerの可視性のみ変更、写真overlay/J/左右状態/Recipe/Final不変。新2/2・関連17/17・build、メイン独立2/2 PASS。Show Histogram全体表示・実Chrome/RAW/色管理/Adobe閾値は未確認または未接続、0/44維持。

- Smart Culling Bulk Segmentの限定段階: 明示2〜20枚へ実在Segment IDまたは明示Unassignedを逐次CAS/readbackで割当。他Rating/Flag/Color/Tags保持、各件fresh Project版/Segment実在/本人・Asset Gate、部分/競合/失効/取消を写真別に表示。実JWT HTTP/SQLite新7/7・関連40/40・build PASS。製品OIDC host/AI/実Chrome/RAW/Cloudは未接続、0/44維持。

- Export Output Sharpeningフォームの読書き境界: 既存手動フォームに厳格`setSettings`を加え、既存`getSettings`でreadback。none/manualだけ受理し無効値は表示不変、Cancel/Escapeは直近setter基準へ戻る。setter単独でFinalを呼ばず、disabled/pending/destroyed中は拒否。新規4/4・旧5/5＋Preset境界/UI関連15/15・build、メイン独立の新旧9/9 PASS。現Node JWT本人hostが無いためExport Preset製品Apply/Finalは未接続、0/44維持。

- Original Shadow同寸法1:1の限定Trial Final: 両登録Asset/保存二層Recipe/両Original bytes digest、両decode provenance、本人/export権限・版を前後確認して手動subject背景合成→独立Shadow Worker→残り調整→Encodeへ接続。異寸法/偽出典/背景trash/Add Shadow同時/取消はBlobなし拒否。実Trial HTTP/SQLite＋合成非RAW Worker新6/6・関連99/99・build、メイン独立6/6 PASS。ただし通常openAsset→Previewは別runtime要求で現状拒否、Editor mount/実RAW/Chrome/Cloudは未接続、0/44維持。

- Smart Culling Bulk Rating/Flag/Colorの限定段階: 明示2〜20枚へ3種類のうち1種類だけ逐次CAS、他mark/Tags/Segment保持、fresh本人/Project版/各Asset readbackと部分/不確定/失効/中断表示をVerified Node Panelへ追加。実JWT HTTP/SQLite新8/8・関連33/33・build、メイン独立の新8/8＋既存Tag10/10 PASS。AI/製品OIDC host/実Chrome/RAW/Cloudは未接続、0/44維持。

- Export Preset実Editor境界監査: 現bootstrapはTrial/Sites/Localを渡すだけで、Node Workspace JWTの本人/tenant/tokenProviderと同一性を証明できない。現Output Sharpeningフォームにも外部setterが無い。偽host/擬似tokenからNode Presetを有効化しない境界試験新3/3・関連9/9・Editor/Export回帰14/14・build、メイン独立3/3 PASS。製品には非操作の未接続案内のみ、Save/Select/Apply/Final/命名を偽装せず0/44維持。

- Export Preset本人操作UIの限定段階: Node Workspace実JWT HTTP/SQLiteでPersonal/Workspaceの保存・一覧・再読込・選択・更新と4設定readback、版CAS/失効を新規3/3・関連6/6 PASS。hostがないApplyはdisabledで、選択/保存をFinal適用・命名の証拠にしない。製品Editor/実Final snapshot/OS名/実Chrome/RAW/Cloudは未接続、メイン独立3/3 PASS。0/44維持。

- Smart Culling Bulk Tag画面の限定段階: Verified Node mountの本人/tenantと明示順2〜20選択をPanelへ結び、単一Tag追加/除去、逐次CASの個別部分結果・不確定/要再読込を表示。新規4/4・関連15/15・build、メイン独立のPanel4/4＋部品6/6 PASS。Rating/Flag/Colorの一括操作、製品OIDC host/実Chrome/RAW/Cloudは未接続、0/44維持。

- Original Shadow Trial host adapterの限定段階: fresh Trial本人Session、対象/背景の同tenant登録Asset/SHA/Original bytes digest、原寸callback、保存Recipe版、edit/export権限を照合し、既存Node CAS保存→readback一致時のみ`accepted:true`。別tenant/Before/背景trash/SHA drift/旧版/失効/取消/CAS競合は拒否、commit後応答喪失は未確認扱い。実Trial HTTP/SQLite専用6/6・関連29/29・Web build PASS、メイン独立6/6 PASS。decoded frameの実Original由来、製品Editor mount/通常Final/実RAW/Chrome/Cloudは未接続、0/44維持。

- Export Preset認証済みWeb clientの限定段階: Node Workspace実APIへ各操作fresh Bearer→同一Bearerの本人/tenant/edit role→list/get/create/update、same-origin/redirect拒否/no-store/no-referrer、厳格設定/応答・版CASを接続。実JWT HTTP/SQLite専用3/3・関連9/9・build PASS、メイン独立3/3 PASS。実Editor選択/Final適用snapshot/命名/OS名は未接続、0/44維持。

- Smart Culling複数写真Bulk Tagの独立段階: 明示順2〜20件へ単一Tag追加/除去、開始前の全mark/Project版/本人認証と各Assetの逐次fresh Bearer→CAS→再読込を実装。saved/unchanged/conflict/denied/unverified/not_attemptedを個別区分し、途中停止時の偽原子的rollbackなし。実JWT/SQLite専用6/6・関連9/9・build PASS、メイン独立6/6 PASS。Panel操作・現製品OIDC host/Final/実Chrome/RAW/Cloudは未接続、0/44維持。

- Original Shadow callback失敗時の表示安全追補: CAS保存後にreadback/通信が失敗すると保存結果は不確定のため、旧「下書きは未適用」断言を廃止し、Recipe再読込確認を促す。メイン専用7/7 PASS。成功/Finalを偽らず0/44維持。

- Export Preset Node保存正本の限定段階: 既存写真編集Presetと別のSQLite表/不変版を追加し、Personal/Workspace create/list/get/update CAS、本人/tenant/role/失効、format/size/resolution/outputSharpeningの厳格値を検証。JWT HTTP/SQLite専用3/3・関連31/31・TS build PASS、メイン独立のBackend+Shadow UI専用9/9 PASS。Web client/UI選択・現Final全option snapshot/命名/OSファイル名は未接続。0/44維持。

- Original Shadow本人手動二層UIの限定段階: 新規After描画部品でsubject/shadow別ADD/ERASE、Opacity・Undo/Redo・取消、Pointer/Touch/Keyboard/focusとtyped文書を接続。fresh host callback/対象・背景/SHA/保存版が無ければ依頼不可。専用6/6・関連17/17・Web build PASS、メイン独立のBackend+UI専用9/9 PASS。製品Editor/Session・真正Original画素/Final・実Chrome/RAW/Cloudは未接続。0/44維持。

- Smart Culling手動Tag/AND-OR絞込: Node Panelの保存済みProject全件markからTag候補を作り、Tag includesとactive述語のAND/ORを追加。Starsだけ既存「指定星数のみ」を維持しpure helperのminRatingとの差を明示。条件/集合版/tenant失効で明示選択とpreflight参考結果を破棄。実JWT/SQLite新3/3・関連11/11を担当・メイン独立でPASS、build PASS。AI/Final/Cloud/製品OIDC hostは未接続、0/44維持。

- Export Preset名の正本監査: 現repoの4件は静的Recommendation catalogのみで保存ID/version/実Final適用snapshotが無い。現Editorは毎回Export optionを選び、`resolveExportNamingContext`はExport Preset名2方式を明示拒否する。表示名からの偽証拠を作らず変更0。Node Workspaceに別の保存正本をAが安全に追加する段階へ移るが、現製品UI/Final/命名・Cloudは未接続のまま0/44維持。

- Smart Culling XMP Node画面の限定取得: verified hostが本人/選択/現在Asset SHAをfreshに確認し、既存2巡XMP Gateを呼ぶ。Panelは本人クリック時のみRating/Label限定XMPを安全名Blobとして取得、未対応Pick/Tags/Segment・失効/切替/取消は0 download、URLは取消/更新/切替/dispose/30秒で回収。実JWT/SQLite新4/4、メイン独立のCulling全関連35/35 PASS、build PASS。現製品OIDC host・実Chrome・OS/XMP他アプリ互換/RAW/Final/CloudはNOT_RUN、0/44維持。

- Original Shadow独立Worker段階: 保存Recipe/対象・背景ID/SHA/版/原寸・二層mask provenanceをWorker境界で照合して実画素を返し、通常renderで手動Shadow文書を黙示無視せず拒否。専用5/5を担当・メイン独立でPASS、関連21/21・Web build PASS。caller supplied decoded RGBAと実Original bytes、および背景合成画素の真正性はWorker単独では証明不能で、製品Final/実RAW/Cloudは未接続、0/44維持。

- Export size exact寸法の公式照合: Evoto公式はWidth & Height/Dimensionsを「specific pixel dimensions」と記すが、比率不一致時の切取/余白/引伸ばし/拡大・丸め規則を記さない。現SUITEは縦横比保持の縮小bounding boxと明記。比率一致だけのexact modeは既存と同結果で重複するため新設せず、変更0。厳密W×H・元製品同等性は未検証で0/44維持。

- Smart Culling XMP同一Bearer安全追補: 1巡のSession/Culling/Asset readに同じ短命Bearerを使い、2巡目に取り直して本人/tenant/edit roleを再認証。別account切替を拒否し、tokenは結果/XMLに含めない。実JWT/SQLite専用6/6を担当・メイン独立でPASS、build PASS。OS取得/Final/実Chrome/XMP他アプリ互換/RAW/Cloudは未接続・NOT_RUNで0/44維持。

- Original Shadow手動二層runtime限定: 保存済みsubject/shadow strokeを原寸・Proxy別maskへ再生成し、実Trial APIの本人/対象・背景Asset/SHA/サイズ、両Original bytes digest、保存Recipe版と権限を前後照合して既存画素核へ渡す。合成非RAW実Trial HTTP/SQLite専用4/4＋関連画素26/26・build PASS。decoded Original pixelsと実bytesの対応は未証明でWorker/Final接続、Node Workspace/実RAW/Chrome/CloudはNOT_RUN。0/44維持。

- Smart Culling XMP sidecar限定bytes第一段階: Adobe公式XMP Basicの`xmp:Rating`(-1 reject/0–5)と`xmp:Label`自由文字列だけを単一写真のfresh Node markから生成。Pick、星付きreject、Tags/Segmentは未確認mappingとして拒否。実JWT/SQLite専用4/4を担当・メイン独立でPASS、build PASS。ただしメインがSession/Culling/Asset間の別JWT切替可能性を見つけ、同一Bearer再GateをCが修正中。現成果を認証済み完成とは呼ばず、OS/XMP互換/Final/RAW/CloudもNOT_RUN、0/44維持。

- Canvas Expand非同期取消の欠陥調査: 既存overlayからSessionへAbortSignalが渡らず、Escape/pointercancel後の遅延host処理でcommitの可能性。AがSession Canvas限定へ排他を拡張し、補償Undoではなく確定前拒否の専用試験を追加中。修正前に取消PASSとは報告しない。0/44維持。
- Canvas Expand非同期取消の限定修正結果: Editor edge callbackからSession Canvas限定へAbortSignalを渡し、permission/cache put/Previewの各await後を照合。取消済み書込は旧cache/history/Recipe/dirtyとPreviewへ復元し、復元失敗時は`recovery required`で編集/切替/Exportを停止。新専用8/8を担当・メイン独立でPASS、関連安全85/85・build PASS。実Chrome/物理Touch/RAW/Cloud/全WebはNOT_RUNで元候補0/44。

- Manual Canvas Expand四辺overlayの重複確認: 現Editorには既に四辺dragと数値UIが同じ`setCanvasExpansion`/Recipeへ接続されていたため二重実装なし。Crop・選択/版変更・pointercancel/Escape・Worker abort・保存/Finalの関連Node/browser bundle試験90/90を担当がPASS。ただし新たな実Chrome操作ではなく、host非同期処理開始後の完全ロールバック・実RAW/Cloudは未検証。0/44維持。

- Original Shadow Node保存Gate第一段階: typed手動subject/shadow文書と容量/偽出典検証、Trial SQLite/HTTP・Workspace JWT/SQLiteの本人/対象・背景実登録Asset/SHA/Recipe版CAS、写真固有Preset禁止・branch 0・Viewer/失効/競合拒否を追加。専用6/6＋Add Shadow/BW Edge関連22/22・build PASS。原寸は現Asset metadataだけでは証明できず、Original bytes digest/Worker/Editor/Final/実RAW/Cloudは未接続・NOT_RUN。0/44維持。
- メイン独立の限定再実行: Original Shadow Node/Trial/Workspace専用6/6とExport Effect Preset命名専用5/5を合わせて11/11 PASS。Culling redirect/client/preflight/Panel/verified mount関連13/13もPASS。現Chrome/全Web/実RAW/Cloudの代替ではなく、全要素完了0/44は不変。

- Export Effect Preset命名のNode認証文脈第一段階: 本人JWT/tenant/edit権限、Asset/Original SHA・cloudSafe、保存Recipe head/presetSnapshot、現Preset版を前後照合し`original-effect-preset`/`original-effect-custom`用の真正名を返す新adapter。catalogのみ・汚れ/branch/旧版・Viewer/異tenant/失効/registry SHA変化/途中選択変更を拒否。専用5/5＋関連安全18/18・build PASS。Final UI/OS保存名/実Chrome/RAW/Cloudは未接続・NOT_RUN、0/44維持。

- Desktop↔iPad能力差read-onlyレポート第一段階: 実Web/Apple renderer allowlistに基づくRecipe v1/Personal・Workspace Presetの両方向・各field報告を新規moduleへ追加。未知・未対応値を消さず、Crop/Exportは未検証、Portraitはengine差で非互換、`operationAllowed:false`を固定。新規7/7＋旧互換6/6を担当・メイン独立でPASS、build PASS。認証/転送/Apple実ビルド/実機/実RAWはNOT_RUNで0/44維持。

- Culling bearer redirect追加追補: verified host wrapperでもredirect済み応答を隠さず拒否し、client redirect専用1/1＋cross-device関連13/13をメイン独立でPASS。Culling全関連試験は次に再実行する。0/44維持。

- Original Shadow本人手動文書の第一段階: 既存画素部品へ渡す写真固有候補文書を新規作成。subject/shadow別normalized ADD/ERASE、対象/背景Asset ID/SHA/原寸を束縛し、保存版は文書に固定せず構築時だけdraftBaseRevision対fresh target版を照合。既存調整保持、別Asset/偽出典/容量/背景競合/abort拒否。専用6/6＋関連Original Shadow計17/17を担当・メイン独立でPASS。これは認証済みBackend保存/Worker/Editor/Final/AI抽出ではなく、実Chrome/RAW/CloudもNOT_RUN。0/44維持。

- Culling bearer redirect安全追補: 返却済みNode Workspace clientのBearer requestへredirect拒否/no-store/no-referrerとredirect済み応答拒否を追加。専用1/1＋preflight4/4をメイン独立再実行PASS。選択/Final認可契約は不変、0/44維持。
- Author Vignette-only製品経路追補: Full Author適用とは独立の明示「周辺光量のみ」を現Trialに接続。fresh公開Preset版/ID/SHA、対象保存Recipe/Asset SHA/Original bytes/権限を前後照合し、postCrop5値だけmerge、他調整と写真固有mask保持、Undo/Redo→CAS保存/再読込→合成非RAW Final画素差/Original不変を専用3/3・関連16/16・Session安全65/65・build PASS。メイン独立でFull＋only計6/6 PASS。実Worker/実Chrome/RAW/Cloud/全Webは後段NOT_RUN、0/44維持。

- Smart Culling Web読取り専用preflight追補: Verified Node host上の明示1〜20選択に対しClientがAsset SHA/保存Recipe headを集め、Backend読取り専用POSTへ送り、応答順・版・`authoritativeForFinal:false`を厳格照合。Panelは選択/失効/競合/取消で参考状態を全破棄しFinalへ接続しない。専用4/4・関連Web Culling17/17・build PASS。新Chrome/実RAW/Node OIDC製品host/Final出力は後段NOT_RUN、0/44維持。

- Author Vignette製品経路追補: post-Crop 5値の任意portable契約を、現Trialの保存済みRecipe Capture→Author Draft保存/再読込→別admin審査採用→Library/facade適用→Undo/Redo→CAS保存/再読込へ接続。旧Presetは対象写真のVignetteを保持し、旧global/postDecode・写真固有拒否を維持。合成非RAW Final画素差とOriginal不変を含む専用3/3・関連154/154・build PASS。実Worker/実Chrome/RAW/Cloudは後段NOT_RUN、0/44維持。
- Glow Workspace Preset host Full SHA追補: 明示Full/既定Glow-onlyを分離し、Fullに原本SHA pinを必須送信。3モード各6値のPersonal/Workspace Full Save→Reload→Apply、旧3調整/sparse値維持、onlyで他調整と写真固有B/W保持。実JWT HTTP/SQLite新6/6＋browser bundle1/1 PASS、旧版/権限/原本競合を拒否しbranch 0/Original実Object SHA不変。現OIDC host・実Chrome/RAW/Cloud/全Webは後段NOT_RUN、0/44維持。

- Smart Culling Node読取り専用出力preflight追補: `POST /v1/workspaces/:wid/projects/:pid/culling/export-preflight`でexpectedCullingVersionと明示順1〜20件のAsset ID/Original SHA/保存Recipe版を厳密受理し、同Workspace transactionでexport権限、Project/集合版、各live Asset/SHA、保存Recipe headを全件照合。応答は`PREFLIGHT_ONLY_RECHECK_BEFORE_FINAL`/`authoritativeForFinal:false`、部分結果・DB書込なし。専用4/4、関連Backend/HTTP42/42・build PASS、401/403/409・競合/重複/異tenantを拒否。Web client/Panel/Final実出力は未接続で、後続Final時のfresh再照合/immutable snapshotが別Gate。実Chrome/RAW/CloudはNOT_RUN、0/44維持。

- Calibration Workspace Preset host Full SHA追補: 明示Full/既定Calibration-onlyを分離、Fullで同transaction原本SHA pin、旧sparse互換とRGB原色Hue/Saturation6値保持、onlyで他調整/写真固有B/W保持。実JWT HTTP/SQLite新6/6＋既存4/4 PASS。誤SHA/registry改変・Preset/Recipe競合/Viewer失効・写真固有source Presetを拒否しbranch 0/Original実Object SHA不変。全Web/実Chrome/RAW/Cloud/現OIDC hostは後段NOT_RUN、0/44維持。

- Vignette Author portable契約追補: post-Crop 5値を任意Author portable Presetパラメータとして追加し、旧3値/postDecode/processingOrder互換を保持。Crop/Rotation/RAW WB/写真固有mask/unknownを拒否し、旧空`postCrop={}`も旧拒否を維持。新規5/5・Author/portable関連86/86・build PASS。現Trial製品作者UIのCapture/Draft/Library適用/保存/Finalは次工程で未接続、実Chrome/RAW/CloudもNOT_RUN、0/44維持。

- Smart Culling Asset集合版の旧試験回復: `registerAsset`初回0→1、trash/restoreの同transaction版進行を受け、固定0の旧Web fixture3ファイルを現保存版からのCAS期待へ更新。C担当Backend Culling7/7、Workspace/HTTP安全31/31、Web Culling15/15、build PASS。旧『without CAS increment』試験名/期待を新仕様へ訂正し、安全assertは維持。メイン独立Backend専用7/7は確認済みだが、メイン全Webは後段。Project trash/restoreはページ不可視・復旧でAsset集合版不変。各Asset SHA/Export権限のFinal直前Gateは未接続、0/44維持。

- Grain Workspace Preset host Full SHA追補: 明示Full/既定Grain-onlyを分離、Fullで同transaction原本SHA pin、旧`amount/seed` sparse互換と7値＋seed保持、onlyで他調整/写真固有B/W保持。実JWT HTTP/SQLite新6/6＋既存4/4 PASS。誤SHA/registry改変・Preset/Recipe競合/Viewer失効・写真固有source Presetを拒否しbranch 0/Original実Object SHA不変。全Web/実Chrome/RAW/Cloud/現OIDC hostは後段NOT_RUN、0/44維持。

- Smart Culling Asset集合版の進行中追補: Node Workspaceのregister/trash/restore Assetを同transactionのProject cullingVersion増分へ結び、初回登録0→1、重複登録/再復元無変化、旧DB移行後の登録、旧CAS拒否、異tenant/role、head書込失敗時Asset/版rollbackをBackend専用7/7（メイン独立も7/7）・build PASS。旧Web Culling fixtureの固定0期待が陳腐化し、メイン暫定関連15件は7 PASS/8 FAIL。Cが該当3試験だけを安全assert維持で修正中。Project trash/restoreは一時不可視でAsset集合版不変。集合版だけでは各Asset SHA/Export権限のFinal直前証拠が足りず、Final未接続、0/44維持。

- Manual Canvas Expand寸法/比率表示追補: renderer同順の回転→Crop整数丸め→四辺投影/上限で、Crop後・Preview実寸・既約比率と、原寸出典が証明可能な場合のみFinal元サイズ予定（縮小前）をEditorへ表示。After自然寸法/Asset/URL/権限/非busy Gateで不一致時は数値を隠し、Before/SplitにはAfter Recipe寸法と明示。専用5/5・関連Canvas安全30/30・build PASS、合成RGBA Preview/Final処理実寸一致。新UIの実Chrome/物理Touch/RAW/Cloudは朝の合図待ちでNOT_RUN。元Auto AI Crop Sync等も未実装、0/44維持。
- Vignette Workspace Preset host Full SHA追補: 明示Full/既定Vignette-onlyを分離し、Fullで同transaction SHA pin、旧sparse 5値保持と全Recipe置換、onlyで他調整/写真固有B/W保持。実JWT HTTP/SQLite新5/5＋既存5/5 PASS。SHA誤値/旧Preset/Recipe CAS/Viewer失効/写真固有source拒否ではbranch 0、Original実Object SHA不変。全Web/実Chrome/RAW/Cloud/現OIDC hostは新方針でNOT_RUN、0/44維持。

- Smart Culling手動絞込・明示選択追補: Node Workspace Panelで保存済みProject全page（200件×最大50page）の二度走査、Stars/Flag/Color/Segment絞込、本人チェック選択・変更時破棄・明示再確認を追加。実JWT HTTP/SQLite専用4/4、関連15/15、合成ChromeのKeyboard/390px/44px PASS。未確認IDをgetStateやFinal callbackへ出さず、Final未接続を明示。`registerAsset`/`trashAsset`/`restoreAsset`がcullingVersionを進めないため、同版でも集合が変わり得る。二度走査は参考スナップショットで非原子的、サーバ集合版/CASと各Asset SHA/Export権限のfresh照合なしにFinal対象へ渡さない。実Touch/RAW/CloudはNOT_RUN、0/44維持。

- Levels Workspace Preset host Full SHA追補: Full modeをLevels-onlyと明示分離し、旧sparse PresetのFull Save→Reload→Applyを維持したまま、Full時にoptional原本SHAを必ず送信。実JWT HTTP/SQLite専用7/7、担当全Web1270/1270 PASS。SHA変更409、registry metadata不整合503、Preset/Recipe版競合・Viewer/失効はいずれもbranch 0/Original不変。現OIDC host自動mount・実Chrome/RAW/Cloudは別Gate、0/44維持。

- Manual Canvas Expand四辺overlay製品接続追補: Aが既存`setCanvasExpansion`へAfter四辺handleを接続。合成非RAWの実ChromeでKeyboard/Touch型Pointer操作、Undo/Redo、他調整保持、Trial保存/再読込、実Worker PNG Final 266×164、2 Asset切替時の旧handle無効・新Asset 0%、期限切れ拒否を確認。専用2/2、担当全Web1263/1263 PASS。`session.mjs`は既存契約で足りたため未編集。物理Touch/実RAW/Cloud、本番認証および元Auto AI Crop Sync・比率/寸法表示等は未確認または未実装。0/44維持。

- Workspace Full Preset SHA原子的照合追補: optional `expectedOriginalSHA256`提示時だけ、既存Full ApplyのAsset registry SHA・Preset版・Recipe CAS/権限を同一transactionで照合し、競合時branchなしで拒否。Selective host mountはSHAを必須送信する。実JWT HTTP/SQLite専用4/4、担当Backend199/199・Web1263/1263、メイン独立専用4/4 PASS。旧SHA未指定HTTP/clientは後方互換のまま新保証対象外。他Preset mountや現製品OIDC host/Bootstrap・実RAW/Cloudは別Gate。0/44維持。

- Selective Color Workspace Preset host注入追補: 新規mountと専用実JWT HTTP/SQLite5/5、担当全Web1257/1257 PASS。Personal/Workspace full/Selective-only UI、pure Preset限定、版・権限・Original・他調整/写真固有B/W保持を確認。Selective-onlyはAsset SHAを同transaction照合する一方、既存Full routeはRecipe CASのみでSHAはmount前後検査に留まるため原子的SHA保証は未達。現製品OIDC host/Bootstrap自動接続・実Chrome/RAW/Cloudも未実施。0/44維持。

- 現時点の元候補全要素完了数は **44件中0件** のまま。部品や限定経路の成功を全要素完了に繰り上げない。
- 別チャットの読取り専任による接続済み12機能の横断再検査でも、元候補全要素完了0件・SUITE限定範囲のみPASSと判定。複製環境で監査60/60、browser fixture bundle12/12、保存/Recipe/Final補足58/58、Backend＋script199/199（計329 PASS）。同複製環境の全Web一括はrunner未終了で中断したためPASSとは数えない。原本ではメイン全Web1197/1197を別途確認済み。実Chrome操作/実RAWはこの読取り再検査でNOT_RUN。
- 別チャットの人物・マスク14候補読取り監査は、14/14すべて元候補全要素未完了と判定（限定部品/不在境界の再試験44/44 PASS）。特にMakeup Highlightは自動顔要所mask、Teethは元8操作の大半、Facial Expressionは姿勢・遮蔽証明と生成/変形が未実装。その他12種類の未対応名称は汎用Backend Recipe構造で受理され得てもWeb Finalが拒否する非対称を再現したため、保存できそうに見えることを機能PASSにしない。同監査は原本ソース・台帳を編集していない。監査後に提出されたTeeth Trial Gate等は別途上の個別行で扱う。
- 同じ読取り専任による背景・AI系8候補監査は、Original Shadow/Batch Edit People Removal/Body Hair Removal/Clothing Moiré Removal/Generative Expand/Grass Fill/Liquify Background Repair/Mobile Motion Blurの8/8で元候補全要素未完了と判定。汎用Backendで架空の拡張名が受理され得てもWeb Finalは拒否し、実装証拠ではない。合成非RAWの限定手動部品・Batch RecipeコピーをAI推論/生成成功に転記しない。B/W Edge RemovalとAdd Shadowはこの再監査の対象外。
- Perfect Shot (`EV3-0921`) 再監査と限定部品: 元5操作はAuto Fix/Custom Fix/同一人物の顔交換/前後最大7枚の比較/新TSQコピー。現手動Cullingや単写真Face Brightnessは別物で、顔交換/合成は未実装。専用監査3/3、候補窓read-only部品8/8（メイン独立も8/8）PASS。認証済み撮影順とProject/本人/Asset/SHA/版を要求し、現製品APIには撮影順証拠がないためfail-closed。synthetic adapter成功を製品E2Eや顔交換成功に転記せず、元候補完了には含めない。
- Personalized AI Look (`EV3-0595`) 再監査: 元23操作の学習用画像数・AI Smart Selection・Preview/Correction/進捗等を照合。現Session Lookは未描画のデータ、Presetは静的Recipe適用で学習済み個人Lookではない。専用4/4・メイン独立4/4 PASS。公式ページ直開きがサイズ上限で失敗したため公式ドメイン検索結果とリポジトリ監査表に基づく範囲に限定。元候補完了には含めない。
- Clothing Moiré Removal (`EV3-0993`) 再監査: 元AI Labの衣服自動検出/Generate・明度/色モアレ抑制と現Detailの汎用輝度処理を区別。元固有処理は未実装。新規専用3/3 PASS（メイン独立再実行前）。この監査を画素処理PASSや元候補完了に数えない。
- Teeth (`EV3-0235`) 再監査と限定部品: 元8下位操作は自動欠損修復/歯縁修復/歯限定明度・脱彩度/5段階整列/生成等。現Face Brightnessは顔全体で代替にならず、自動歯領域maskもない。監査3/3、本人明示maskだけのsRGB8局所明度/脱彩度純粋部品7/7（メイン独立も7/7）PASS。後続でoptional typed `teethManual` Recipe構造検証5/5を追加し、未知`teeth`偽キーを拒否、旧Recipeを保持。保存normalized strokeから原寸/1600px Proxy別maskを再生成する限定部品5/5 PASS。fresh Trial Gate専用実HTTP/SQLite5/5・担当全Web1202/1202 PASSだが、現製品に認証済み人物inventory APIがないため本人/Asset/SHA/版/権限を確認した後も`TEETH_PERSON_ID_AUTHORITY_UNAVAILABLE`で常に拒否する。caller provenance/ownerConfirmedは認証証拠ではない。Session/UI/Worker/Final/実RAW/Cloudは未接続、元AI歯補正全体の完成には含めない。
- Makeup Highlight (`EV3-0001`) 再監査と限定部品: 元Intensityは顔の要所を自動判別して明るくする操作で、現global highlights/顔全体Face Brightness/本人手塗りLocal Levelsとは対象領域・意味が異なる。専用監査4/4、本人指定maskのSUITE限定純粋部品7/7（メイン独立も7/7）PASS。既存Local Levels核を再利用してmask内だけIntensityを適用し、Asset/SHA/person/版/寸法/role、mask外/alpha/hidden RGB/入力不変と中断を確認。後続のoptional typed `makeupHighlightManual` Recipe構造検証5/5・旧監査4/4を追加し、未知偽キーを拒否、旧Recipeを保持。保存strokeの原寸/1600px Proxy別mask再生成6/6 PASS。独立After手描きUI部品も専用3/3・Desktop1920/Mobile390の実Chrome操作PASSだが現製品Editorにはmountしていない。caller provenance/ownerConfirmedは認証ではなく、fresh人物Gate/製品UI/保存/Final/自動要所検出/実RAW・Cloudは未接続・未確認。元候補完了に数えない。
- Facial Expression (`EV3-0243`) 再監査: 口角・上唇の形状/5段階表情生成/手動調整等は現Face Brightness/Portraitと別。専用監査4/4 PASS。公式MediaPipe lips topologyに根拠のある口元read-only inventoryを専用4/4で追加し、Asset/person/Original・model SHA/原寸、単顔・顔ovalを束縛。現`faces.mjs`は遮蔽visibilityと姿勢証拠を出さないため`TOPOLOGY_ONLY_POSE_OCCLUSION_UNVERIFIED`候補に限定し、製品使用への昇格を必ず拒否する。担当全Web1191/1191 PASS、実Chrome/RAW/表情生成はNOT_RUN/未実装。元候補完了には含めない。
- Export naming: `custom-count` / `custom-sequence` / `original` / `original-custom` の合成非RAW一括Finalを実Chromeで確認。さらに実Trial HTTP/SQLiteの本人・保存済みRecipe・2 Asset明示順を現製品UIから実Worker PNG Blob/安全な手動リンクへ結び、Recipe版変更・Original改変・招待失効の各ケースは1件目Blob生成後も0リンク、URL失効を実Chromeで確認。後続でDNG限定`capture-date-original`をoffset付きExif DateTimeOriginalのfresh Trial本人/Asset/Original SHA/保存版/export権限へ前後束縛し、単写真/Batchの明示選択へ接続。合成DNG＋実Trial HTTP/SQLite専用4/4・関連12/12、メイン独立の関連19/19、担当全Web1241/1241 PASS。任意日付/offset無し/偽DNG/部分Batch/失効は拒否し、新方式は自動ダウンロードしない。新方式の実Chrome操作と実RAW decode/OS保存名はNOT_RUN、残るEffect/Export Preset等4方式も製品未接続で元候補完了に数えない。
- Mobile Glow: 実Trial HTTP/SQLite＋実Chromeの3モード/6値/Mask/Undo・Redo/保存・再読込/Final、およびGlowだけの2対象Syncの保存・再読込を限定確認。host注入型Node Workspace Personal/Workspace Presetも実Chrome＋JWT HTTP/SQLiteでSave→Reload→版固定Glow-only Apply→Finalを確認。同一transactionの対象Asset/SHA・Recipe/Preset版・権限照合で既存露光/B/W/Add Shadow束縛を保持し、失効/競合時branch 0を専用HTTPで確認した。現TrialのAuthor portable Presetは実Chromeで3モード×6値の本人Capture/Draft/別admin採用/公開Library Apply/Undo・Redo/Recipe CAS/Final PNGを限定確認。さらに明示「Glowのみ適用」を既存全体適用と別に追加し、fresh Preset/対象Recipe/Original照合、既存露光・色・Detail・回転保持、Undo/Redo、CAS保存/再読込、旧版/失効拒否、Final画素差を実Chromeで確認した。現Trial製品のPersonal/Workspace OIDC host/mountと実RAW/Cloudは未接続/未検証で、元候補全要素完了には含めない。
- Add Shadow: 本人手動UI部品と写真固有typed Recipe構築を通常Worker/Editor/Sessionへ接続し、既存Exposureとの合成順、非Trial拒否、明示背景Replace、Undo/Redo状態、CAS成功後のfresh Gate失敗を未検証として保持する専用試験はPASS。実Trial HTTP/SQLiteで本人・対象/背景Asset SHA・保存版2のfresh Gate、旧版/失効拒否を確認し、実WorkerでExposure/Color/Local Levels/B/W/Crop/Canvas Expand同時Recipeと旧Recipe互換を確認した。合成非RAWのNode Session Preview/Finalは`BROWSER_WORKER_UNAVAILABLE`で止まり、画像decode拒否の証拠ではない。別の実Chrome＋Trial HTTP/SQLiteでは本物のBrowser Workerが合成非RAWを`NOT_CAMERA_RAW`で拒否し、Preview/Final Blob未公開、取消・本人失効も拒否を確認。成功Preview/Final画素と実RAW成功、異寸法背景は未確認で、元候補完了には含めない。
- Export size (`EV3-0757`) 再監査: 6画素方式のUI parser/Worker TIFF寸法とPPI/PPCタグを新規3/3試験で確認。後続の実Chromeで保存済み合成非RAW Editor→Session→実Worker→Blobの6画素方式×JPEG/PNG/TIFF×PPI/PPC＝36通りを全確認し、寸法・密度タグ、保存済みRecipe/Original SHA不変、拡大拒否も確認。ただしDimensionsは縦横比保持の縮小bounding boxで、公式の「specific pixel dimensions」と同等か未証明。実RAW/OS出力、元製品画素同等性、Export設定の永続化は未確認で、元候補完了には含めない。
- Grain (`EV3-0528`) 再監査と限定製品接続: 7調整のローカル画素・Recipe・Undo/Redo・Worker Finalを確認。後続の実Chrome＋実Trial HTTP/SQLiteでは、7調整それぞれのEditor操作→実Worker Preview画素差、Undo/Redo、CAS保存r2/再読込→Final PNG画素差、Original SHA不変、取消・旧版・招待失効拒否を合成非RAWで確認。Grain-only選択Syncの独立moduleは7調整＋render seedだけmergeし、他調整/Original保持、2対象認証CAS・旧版/別author/途中失効/曖昧書込/部分結果を専用8/8・メイン独立8/8で確認。製品Session/UIにも明示Grain-onlyコマンドと専用Session/UI試験を接続。新Browser fixtureはbundle PASSだが環境`browsers=[]`のため実操作NOT_RUN。Node WorkspaceのPersonal/Workspace Presetでは7値＋seedの保存/再読込/全体適用と、他調整を残すGrain-only版固定適用を実JWT HTTP/SQLite専用5/5・メイン独立5/5で確認。host注入型Grain Workspace mountも実JWT HTTP/SQLiteとbrowser bundle専用4/4 PASSだが、現製品Bootstrap/Editorへの自動接続と実Chromeは未実施。現Trial/Cloud OIDC host、Community、Author実Trial通し、実RAW/Cloudは未完/未確認で元候補完了には含めない。
- Smart Culling (`EV3-0894`) 再監査とNode手動UI拡張: 元候補27下位項目を照合し、新規専用3/3試験とメイン独立3/3を確認。Node Workspaceの手動Stars/Flags/Tags/SegmentsはSQLite+CAS+JWT HTTP+host注入mountまで存在するが、現製品bootstrap/Trial/Cloud Editorへ未接続。後続で色ラベル保存・Segment改名/並替UI、書込後fresh読戻し、競合/失効/取消時の不確定表示を実JWT HTTP/SQLite専用3/3、合成実ChromeのKeyboard/390px、担当全Web1252/1252で確認。実TouchジェスチャーはNOT_RUN。手動絞込/明示選択からFinalへの連携、AI品質/顔/類似cluster/Best Picks/意味検索/背景Job/XMP/Storyline Generalは未接続・未実装。手動部分を元候補全要素PASSにしない。
- Output adjustments (`EV3-0773`) 再監査: 現SUITEの`none`と明示manual出力シャープは単写真/BatchのFinal resize後→sharpen→encodeへ接続済み。一方、元製品のScreen/Print×Low/Standard/Highの6名付き選択肢はUI未接続・API拒否。元の数値/kernelは公開資料だけでは不明で同等処理とみなさない。Recipe/Undoへの永続保存もしていない。新規専用2/2試験PASS、既存の実Chromeは合成非RAW PNG/TIFFに限る。manual JPEGの製品fixtureは追加しbundle1/1 PASSだが、Browser一覧空の環境障害により実Chrome操作NOT_RUN。実RAW/Cloud/OSも未確認で元候補完了には含めない。
- Mobile Post-Crop Vignetting (`EV3-0570`) 再監査と追加実装: 元5操作と現SUITE 5調整のpost-Crop sRGB画素/Recipe/UI/Undo/保存/Finalを照合し、専用3/3・関連18/18 PASS。後続でVignette-only選択Syncを独立module/製品Session/UIへ接続し、実Trial HTTP/SQLiteで本人2対象・中立解除・古い版/別本人/期限切れ、未保存draft、他調整/Original不変を検証。メイン独立のHTTP/Session/UI/監査10/10、担当全Web1068/1068 PASS。さらにNode WorkspaceのPersonal/Workspace Preset 5値 full Save→Reload→Applyと、他調整・写真固有maskを残すVignette-only版固定適用を実JWT HTTP/SQLite6/6（メイン独立も6/6）、担当Backend199/199・Web1214/1214で確認。新写真固有Teeth/Makeup maskがPreset create/update/旧不正保存版applyで越境しない拒否も追加した。host注入型Vignette Workspace Preset mountも実JWT HTTP/SQLite合成非RAW専用5/5・担当全Web1221/1221 PASSだが、現製品Bootstrap/Editor/Node OIDC hostへ自動接続されていない。ただし直接Workspace saveRecipeの新Teeth/Makeup写真Asset/SHA/person束縛は別未完Gate。実Chrome fixtureはbundle済みだがBrowser一覧空/CDP接続障害で実操作NOT_RUN。Author/Community portable PresetはpostCropAdjustmentsを明示拒否、現製品OIDC host・実Chrome/実RAW/実機/Cloud・元製品画素同等性は未確認。元候補完了には含めない。
- Levels (`EV3-0492`) 再監査と限定Workspace Preset: RGB共同/R/G/Bの各5値、表示channel別Histogram、After黒白点スポイト、右へ動かすと暗くなる中間調handle、手動Local brush、保存済みglobal Levelsのみ選択Syncを行別照合。専用4/4とメイン独立4/4 PASS。後続の実Chrome＋実Trial HTTP/SQLiteでは現製品Authorの4ch Levels→保存/再読込→Capture/Draft→別admin採用→Library適用→Undo/Redo→CAS保存/再読込→実Worker Final画素差とOriginal SHA不変、旧版/再審査/権限失効拒否を合成非RAWで確認。Node WorkspaceのPersonal/Workspace Preset full Save→Reload→Applyと4ch×5値だけの版固定原子的Levels-only適用を実JWT HTTP/SQLite専用5/5・Backend199/199で追加し、他調整・Original/写真固有mask保持、本人/Asset SHA/Preset版/Recipe CAS・失効/Viewer拒否、旧sparse Full互換を確認。host注入型Levels Workspace mountも専用4/4、Preset HTTPとの関連9/9を担当・メイン独立で確認した。現製品Personal/Workspace OIDC host/Bootstrapの自動mount、Community、実RAW/実機/Cloudは未確認・未接続で元候補完了には含めない。
- Color Calibration (`EV3-0586`) 再監査と限定製品Sync: RGB原色のHue/Saturation各2値の現SUITE 6調整は、SUITE独自sRGB8画素、typed Recipe、UI、Undo/Redo、Trial保存/再読込、Worker FinalとAuthor portableデータを限定確認。監査3/3、6値だけの独立選択Sync純粋/実Trial HTTP・SQLite8/8、製品Session/UI/Browser bundle5/5、メイン独立の関連16/16 PASS。保存済みsource/明示2〜20 targetへ他調整/写真固有設定/Originalを保持して適用し、本人・版・SHA・CAS・失効/部分結果を検証。Node WorkspaceのPersonal/Workspace Presetでは6値の全体Save→Reload→Applyと同一transactionのCalibration-only適用を実JWT HTTP/SQLite専用5/5・メイン独立5/5で確認。host注入型Calibration mountも実JWT HTTP/SQLiteとbrowser bundle専用4/4・メイン独立4/4 PASSだが、現製品Bootstrap/Editorへの自動接続と実Chromeは未実施。新Browser fixtureの実Chrome操作は環境`browsers=[]`でNOT_RUN。元製品の数値/画素式は非公開で同等性不明。現Trial/Cloud OIDC host、Community Preset、実RAW/実機/Cloudは未接続・未確認で、元候補完了には含めない。
- Selective Color (`EV3-0501`) 再監査と限定Sync製品接続: 元15下位操作（9色域、共通CMYK4、Relative/Absolute2）と現SUITE限定sRGB8処理/Recipe/UI/Undo/Redo/Trial保存/Final/Author portableを照合。専用監査3/3 PASS。元資料記載のSelective Color-only複数写真Syncについて、保存済みsourceの当該branchだけを対象へmergeする独立moduleと純粋6件＋実Trial HTTP/SQLite2件を追加し8/8 PASS。後続で製品Session/UIの明示的Selective-onlyコマンドと専用試験も接続し、他調整/Original不変、権限/版/SHA/CAS/結果分類を確認した。Node WorkspaceのPersonal/Workspace full Save→Reload→Applyで9色域×CMYK4値・2方式を実JWT HTTP/SQLite、純粋Presetの版固定Selective-only原子的適用を専用4/4で追加確認し、他調整・写真固有B/W・Original保持とViewer/失効/版競合/impure・sparse拒否を確認。担当およびメイン全Web1249/1249、Backend199/199 PASS。新ブラウザfixtureの実Chrome操作は環境障害のためNOT_RUN。既存実Chrome証拠は9色域CyanとRedsの4値等一部操作に限り、現製品OIDC host/Bootstrap自動mount・Community Preset、実RAW/実機/Cloud・元製品画素同等性は未確認で元候補完了には含めない。
- Manual canvas Expand (`EV3-0701`) 再監査と限定edge drag部品: 現SUITEの四辺数値UI・4背景・Reset・合成非RAW Worker/Trial Batchを元9下位項目と照合し、専用4/4 PASS。直接edge dragの既存0..200%/1%刻み四辺値への安全な変換部品を新規専用8/8・担当全Web1230/1230で追加し、Crop後Preview寸法/Full容量、Pointer/Touch ID、4px click閾値、RTL/scroll/layout/selection stale、Keyboard/Abortを確認。独立四辺overlayも専用Node2/2、合成fixtureの実Chrome Desktop952/Mobile390 PASS、担当全Web1245/1245 PASSで提出。44px handle・Keyboard/Touch型Pointer/focus/reduced-motion・host拒否時復元を確認したが、製品Editor mount/実保存/Finalは未接続。元資料との差は、200%指定に対しRecipe validatorは400%許容、13000px上限とSUITEの16384/別メモリ制限、初期Gray対White、Original基準対Crop後基準、Crop入場Reset、Auto AI Crop Sync既定ON/個別推論・連動Reset、比率/Final寸法表示。現BatchのRecipeコピーはAuto Expand代用ではない。実RAW/実機/Cloud・元製品同等性は未確認で元候補完了には含めない。
- Histogram and clipping (`LR-02`) 再監査と左右独立UI: 現SUITEのRGBA8 RGB＋luma 4ch、写真上の青/赤clip警告、J一括切替、5領域drag/keyboard直接トーン操作、Recipe/Undo/Redo/保存/Finalを照合。後続で左右個別クリック/再クリック、J、Before非表示/Asset切替reset、44px/focusを製品Session/UI/CSSへ接続し、左右maskがOriginal/Recipe/Finalへ混入しないことを確認。新専用Node5/5＋browser fixture bundle1/1、メイン独立の専用/旧監査8/8、担当全Web1222/1222 PASS。実ChromeはURL安全判定停止/CDP response channel closedでNOT_RUN、実RAW/実機/Cloud・元製品画素同等性も未検証。読取り専任の再判定前に元候補完了へ繰り上げない。
- Batch Edit (`EV3-0934`) 再監査と安全修正: 元IDはAI LabのPeople Removal一括適用で、現SUITEの認証付き全Recipeコピーとは別機能。監査で中立sourceから既存Portrait targetへの全Recipe適用が人物設定を無警告消去する危険を再現したため、`batch-edit.mjs`で既存target Portrait/BW Edge Manual/Add Shadow Manualを保存前に拒否するよう修正。実Trial HTTP/SQLiteで保護targetのRecipe/Original不変、安全targetの保存継続とpartial結果を確認。関連18/18、担当全Web1099/1099 PASS。元AI People Removal、実RAW/実機/Cloudは未実装・未確認で元候補完了には含めない。
- Detail Enhance (`EV3-1058`) 再監査: 現SUITEのClarity/Texture/Sharpness/Denoiseは同寸法sRGB8実画素の通常調整であり、元AI Labの2K/4K/6K生成、毛髪/顔/衣服固有の細部回復、Crop依存AI解像度、AI Lab Batch結果生成とは別。新規監査4/4 PASS。認証済みAI job/result契約、実RAW/実機/Cloud・元製品画素同等性は未接続/未確認で元候補完了には含めない。
- Desktop↔iPad compatibility (`EV3-0873`) 再監査: 元FAQのPC↔iPad「多くのPreset」互換と非対応設定による効果差を区別。現SUITEは安全なRecipe/Preset/Asset/version JSON往復を部分確認するが、Web詳細Recipeは保守的preflightで拒否。Apple実アプリのEditor backend/Workspace client/Proxy P1とiPad↔Web認証・Preset適用・Original/Proxy/Final復元は未接続。新規監査4/4 PASS、Swift/Xcode/実iPad/CloudはNOT_RUNで元候補完了には含めない。
- この時点の担当全Web **1202/1202 PASS**、メイン独立全Web **1197/1197 PASS**（後続Teeth Gate5件は別担当結果）、メイン独立Backend **199/199 PASS**、仕様147節保持・`git diff --check` PASS。既存のPerfect Shot監査3/3・候補窓8/8、Personalized AI Look監査4/4、Calibration-only Sync部品8/8、Batch target保護4/4、Grain限定部品8/8もメイン独立PASS。Browser一覧空/CDP障害によりVignette Sync、Selective Color Sync、manual JPEG等の新実ChromeはNOT_RUN。

## SUITE限定機能として接続・自動試験済み（元候補全要素は未完了）

各行の未接続差分は [前半監査](UNIQUE_COMPLETION_AUDIT_A.md) と [後半監査](UNIQUE_COMPLETION_AUDIT_B.md) を参照。

| 番号 | 機能 | 確認範囲 |
| --- | --- | --- |
| 1 | プレビューのヒストグラム・白黒クリッピング | 表示中プレビューから計算しEditorに表示。合成データ試験と画面表示を確認。 |
| 2 | 書き出しファイル名指定 | Finalダウンロード名、無効名・衝突防止、UIソース契約試験。 |
| 3 | 粒子追加 | 強さ・暗部・中間調・明部・大きさ・粗さ・色の揺らぎを実画素、UI、Recipe、Undo/Redo、保存・再読込、Final合成試験。実Chrome合成非RAW Editorでも7項目それぞれWorker Preview画素差、Undo/Redo、保存/再読込、Final PNG画素差、Original SHA不変を確認（全Web721件PASS）。元候補のPreset保存/Sync・実RAW画質は未確認。 |
| 4 | RGBレベル補正 | 実画素、UI、Recipe、Undo/Redo、保存・再読込、Final合成試験。 |
| 5 | 書き出しサイズ指定 | UI、Final縮小画素、Original/Recipe不変、無効値拒否、ブラウザ表示、Web全体341件PASS。 |
| 6 | Mobile Glow Effect | 明部Glowの実画素、UI、Recipe、Undo/Redo、保存・再読込、Final合成試験。ブラウザ表示・実行エラー0、Web全体361件PASS。 |
| 7 | RGB/channel Point Curves | 色チャンネル点列の実画素、UI、Recipe、Undo/Redo、保存・再読込、Final合成試験。ブラウザ表示・実行エラー0。 |
| 8 | Mobile Post-Crop Vignetting（SUITE限定） | Amount、Midpoint、Roundness、Feather、Highlightsの8-bit sRGB画素・UI・Recipe・Undo/Redo・保存/再読込・Final合成試験。実Chrome合成非RAW EditorでもCrop後の5項目ごとのWorker Preview画素差、Undo/Redo、Trial HTTP/SQLite保存/再読込、Worker Final画素差、Original SHA不変を確認（全Web719件PASS）。元製品の画素式や同期、実RAW/Cloudとの一致は未確認。 |
| 9 | Manual canvas Expand（ローカル単色） | 四辺0〜200%、白/灰/黒/透明、Reset、Proxy/Final寸法別投影、Recipe・Undo/Redo・保存/再読込・Final合成試験。実Chrome合成非RAW Editorでも四辺・4背景、保存/再読込、Undo/Redo、Reset、Proxy 120×80→162×108・Final 240×160→324×216とOriginal SHA不変を確認。元候補のAuto Expand During Syncは未接続。 |
| 10 | Color Calibration（SUITE限定） | RGB原色それぞれのHue/Saturation実画素、UI、Recipe、Undo/Redo、保存・再読込、Final合成試験。8-bit sRGB後段の独自処理で、元候補のカメラプロファイル/画素式との同一性は未確認。 |
| 11 | Selective Color（SUITE限定） | 9色域のCMYK方向、Relative/Absoluteを画面から操作し、Recipe、Undo/Redo、保存・再読込、Final合成試験とブラウザ表示を確認。元候補の画素式との同一性や実RAWの色は未確認。 |
| 12 | B/W Edge Removal（本人手動・8M画素以下限定） | 実Trial認証HTTP/SQLite＋実Chromeの合成非RAW 2 Assetで、After二層手動指定→本人確認→Recipe適用→保存/再読込→Worker Proxy/Final PNG画素差、Original SHA不変、Before/別Asset/失効時拒否を確認。SessionのUndo/Redoでも中立画素への復帰と再適用を確認。自動判定・Update・Sync、実RAW/Cloudは未実装または未検証。 |

## 処理部品あり・製品接続中（未完了）

- Export sizeのLong/Short Edge・Dimensions: 純粋サイズ計画/縮小部品、Final経路とUI選択まで自動試験済み。PPI/PPCはJPEG/PNGエンコーダーとWorker境界、UIからの引数、合成PNG Blobの密度metadata読み戻しまで自動試験済み。Chrome実Worker→JPEG/PNG Blobの12通りで画像寸法とJFIF/pHYs密度metadata読み戻し、元RGBA不変、Console error 0を確認。さらに実Editor UIから3サイズ方式×PPI/PPC×JPEG/PNGを選び、合成非RAWの保存済みEditorSession→実Worker→Blobで12ケースの実寸法・JFIF/pHYs密度、Original/Recipe不変、無効値・拡大拒否を確認（全Web711件PASS）。合成非RAWであり、実Original/RAW・Cloud・実写真画質は未確認。
- Histogram写真上overlayと直接トーン操作: mask→RGBA表示部品とEditorSessionのPreview専用URL、黒白指標クリック/J切替/5領域ドラッグUIまで接続し自動試験済み。実Chromeの合成非RAW Editorでも4ch Histogram、黒/白の写真上overlay、J表示切替・Before非表示、5領域の実Pointerドラッグ、Undo/Redo、保存/再読込、実Worker Finalのoverlay非混入・画素変化、Original SHA不変を確認（全Web718件PASS）。実RAW画質・Cloud・元製品同等性は未確認。
- Export naming追加方式: 安全な入力正規化部品と実データ抽出部品あり。LibRaw撮影時刻の秒数証拠は得たがtimezone未確認なので撮影暦日名はなお拒否。Asset一覧は出力順ではなく、選択済みExport Preset名も記録されないため未証明入力は拒否。明示選択から安定した連番/総数を作り、現行Assetの同一性と保存済み状態を照合して `custom-count` / `custom-sequence` へ渡す部品まで自動試験済み。複数Finalを出す前に全件のAsset・保存版・export権限を読取り照合するpreflightと、全Blob生成後に順序/衝突/容量を検証して安全な名前を付けるmanifestも自動試験済み。`exportBatchFinal` は2〜20件を順次JPEG/PNG Blobへ処理し、失敗時部分返却なし・256MiB上限・人物Recipe全体拒否を合成非RAW試験で確認。ローカルHTTP/SQLiteの非RAW試験で原本の途中変更と前アイテムの後発変更を再現し、各アイテム直後と全件返却前のfresh Original再取得・SHA照合で拒否するよう修正、専用HTTP9件を通過。Editor UIは明示順序選択、全件成功後のみ安全名の個別リンクを出し、部分返却・自動連続ダウンロードを禁止する自動試験と狭幅画面検査を通過。さらにBatch「元の名前＋指定文字」をmanifestとUIへ接続し、明示順序2 Assetの実Worker PNG Blob名 `second_Studio.png` / `first_Studio.png`、旧命名、失敗/取消0リンク、選択/設定変更とdisposeのBlob URL失効、自動clickなしを実ブラウザで確認。直近全Web959件PASS時点。最終照合後の厳密原子性はサーバー/ストレージのimmutable snapshot保証が別途必要。実RAW/Cloud/製品認証での書出し、OS実保存名、元候補の残る命名方法は未検証/未接続なので、元候補は未完了。
- Batch Edit: 複数Assetへの権限・版数検証付き適用部品、EditorSession method、明示選択UIを追加済み。権限確認のないローカルモードでは無効。TrialClient＋実HTTP/SQLiteの非RAW統合試験で2対象保存、権限・期限・競合・Original不変を確認。実Chrome/HTTP/SQLiteでも合成非RAWの2対象明示選択→保存、選択解除で非適用、版数競合を未検証表示、招待取消後の書込なし・操作停止を4ケースで確認し、全ケースでOriginal SHA不変（全Web711件PASS）。本人体験/実RAW/Cloudは未検証、元候補の全要素完了には算入しない。
- Mobile Glow拡張: 3モードと追加調整の純粋画素・Recipe検証、session経由保存/Undo/Redo/Final合成試験とEditor UI自動試験まで接続済み。Show Glow MaskはPreview専用URL生成と表示切替を合成試験済み。実Chromeの合成非RAW Editor UIでもWhite Mist/Black Mist/Halation、Exposure/Diffusion/Tint、保存・再読込、Undo/Redo、実Worker Finalの画素差、Glow MaskのPreview表示/Before非表示/Final非混入、Original SHA不変を確認（全Web714件PASS）。実RAW画質・Cloud・元製品との画素同等性は未確認。
- Export naming実ブラウザ経路: Trial認証HTTP/SQLiteと実Editor/Worker/Final Blobで元名PNG、同名再出力の衝突suffix、危険文字を安全化したCustom JPEG、空欄/危険入力のFinal前拒否、Original SHA/Recipe不変を確認。リンクの `download` 属性、Blob URL、anchor clickまでPASS。ブラウザポリシーが `chrome://downloads` を明示拒否したため、OSに保存された実ファイル名はNOT_VERIFIED。既存9方式のうち未接続方式は未完了。
- RGB Levels追加要素: 黒点/白点スポイトのRGBA8サンプリングをsession経由のRecipe保存・Final合成試験まで接続。4chヒストグラムはPreview解析を再利用し、Editor上にMaster/R/G/B表示済み。写真上の黒点・白点スポイトUIはAfter実画素だけを対象とし、Before側と余白を拒否する自動試験済み。280px〜900pxの狭幅でCurve端点・スポイト44px以上・横はみ出しの修正/自動試験済み。Local Levelsはnormalized brush→coverage画素処理、typed Recipe・Proxy/Final・保存/再読込・Undo/Redoまで合成試験済み。After contain→回転/Crop/Canvas Expandの逆座標、保存線の順投影、Keyboard座標APIと、Editorのadd/erase/半径/硬さ/RGB各5値/ResetのUI接続も専用試験済み。実Chromeの合成非RAW写真ではPointer/Keyboard stroke、保存/再読込、Preview/Final PNG画素差、回転/Crop/Canvas Expand位置、余白/Before/取消/Reset/権限失効の拒否、狭幅390/768pxを確認（全Web712件PASS）。Touchは合成PointerEventのみでiPad/実機タッチではない。実写真目視・実RAW/Cloudは未確認。Grain/Levelsの既存portable Preset経路は作者保存/適用/再読込の自動試験を通過。
- Selective Color Portable Preset: 9色域×CMYKとRelative/Absoluteを既存portable postDecode経路に任意追加。作者下書き・採用・SQLite再読込、Editor適用・保存・Final合成画素まで自動試験済み。実Chromeの合成非RAW Editorでも9色域、CMYK調整、Relative/Absolute、保存/再読込、Undo/Redo、Worker Preview/Final画素差、Original SHA不変を専用試験で確認。全Web回帰は他担当の試験fixture作成中に一時停止したため、統合後の再実行待ち。旧形式・写真固有設定の拒否を維持。実RAW/Cloud・元製品との画素完全互換は未確認。
- Color Calibration Portable Preset: RGB各原色のHue/Saturationを同じ経路へ任意追加。作者下書き・採用・SQLite再読込、Editor適用・保存・Final合成画素まで自動試験済み。実Chromeの合成非RAW Editorでも6スライダー各々のWorker Preview画素差、Undo/Redo、Trial HTTP/SQLite Recipe保存/再読込、Worker Final PNG画素差、Original SHA不変を確認（全Web717件PASS）。実RAW/Cloud・元製品との画素同等性は未確認。
- Point Curves: Master/R/G/Bのグラフに点追加・移動・削除、キーボード操作を接続し、旧数値編集を維持。既存portable Presetへ4チャンネル点列を任意追加し、作者下書き・採用・SQLite再読込、Editor適用・保存・Final合成画素まで自動試験済み。実Chromeの合成非RAW Editorでも4chの点操作、Keyboard、Reset、Undo/Redo、保存/再読込、Worker Preview/Final画素差、Original SHA不変を確認。ネイティブダブルクリックがSVGへretargetされ点削除できなかった不具合を座標hit-testで修正し、trusted実Chromeで内部点3→2の削除PASS。SUITE独自Linear/Medium/Strong Master Contrast Presetも実画素・保存/再読込まで接続。Refine Saturationはカーブによる彩度変化を0〜100で混合するSUITE独自処理として画素・UI・Recipe・Undo/Redo・保存/再読込・Final・Author Presetの合成試験を通過。実ChromeのSlider操作でPreview/Final各705画素差、保存/再読込、Undo/Redo、Original SHA不変、390px幅でSliderと親パネルの右端一致x=351を確認（全Web781件PASS）。実RAW/Cloud・Adobe画素同等性は未確認。
- Portable Preset追加範囲: パラメトリック曲線の3調整、Denoise、8-bit sRGB後段Temperature/Tintも作者下書き・採用・SQLite再読込、Editor適用・保存・Final合成画素まで自動試験済み。写真固有/RAW段階WB/未知値は対象外。GrainのPersonal/Workspace保存は、既存WorkspaceHTTPをテスト専用マウントした実HTTP/SQLite試験では追加6値の保存・再読込・適用等4件PASS。ただし現Trial製品routeにはWorkspaceHTTP/Clientが未接続で別tenantなので、この結果を現製品のPersonal/Workspace Preset PASSには転用しない。
- Smart Culling: 公式記述を区別し、本人確認済みProjectのAsset一覧を入力とする手動Stars/Flags/Custom Tags/Segments/複合Filterの不変・メモリ内状態遷移を新規部品と専用試験で確認。さらにNode Workspace SQLiteへ手動マーク/Segment/所属の追加表とProject単位CAS、認証済みHTTP・権限/tenant/Asset境界、旧DB互換を実装し、専用5件・バックエンド159件PASS。既存Selection CASは不変。現Trial Editor UIと公開Cloud D1のProject/Culling経路、AI分析/選別はなお未接続であり、手動タグをAI自動選別の完成と称さず元候補の全要素完了には算入しない。[保存境界計画](SMART_CULLING_PERSISTENCE_PLAN.md)参照。
- Detail実ブラウザ経路: 実Chrome合成非RAW EditorでClarity/Texture/Sharpness/Denoiseの各別Recipeキー、Worker Preview/Final画素差、保存/再読込、Undo/Redo、Original SHA不変を確認。さらにSharpen Radius/Detail/Maskingの3値を任意RecipeとEditor Sliderへ接続し、それぞれの実Preview/Final画素差、保存/再読込、Undo/Redo、Original SHA不変を実Chromeで確認。旧Sharpnessのみの画素結果は維持し、専用6件と全Web732件PASS。実RAW画質・他製品画素同等性は未確認。
- Manual canvas ExpandのBatch適用: Trial HTTP/SQLiteと合成非RAW処理で、保存済み手動余白を2 Assetへ版数・権限確認つきでコピーし、各Proxy/Final寸法への投影とOriginal SHA不変を専用3件/全Web709件で確認。これは同じRecipeの適用であり、元候補のAuto Expand During Syncが要求する写真ごとのAI Crop判定・不足余白の自動推論・default ONは未実装。元候補全要素完了には算入しない。
- HDR基盤: `Float32`線形RGB/SDR白/headroomを明示した高精度フレーム、入力不変のSDRプレビューtone mapを独立部品として追加。専用7件、全Web742件PASS。実HDRデコード・対応画面・HDR出力/gain mapは未接続。8-bit画像をHDR入力と称せず、`LR-16`全要素完了には算入しない。
- TIFF8書き出し: 8-bit sRGBの非圧縮TIFFをFinal Workerの実Blob、Sessionの保存版・Original SHA再確認経路、EditorのTIFFボタン、安全な `.tif` 名に接続。PPI/PPC・alpha・abort・不正設定拒否は専用試験と実Chrome Workerで確認。実Chrome Editorでも保存済み合成非RAWの単写真UI→Session→実Worker→`image/tiff` Blob→`.tif`安全名リンク2件、PPI/PPC、無効値/取消0リンク、Original SHA/Recipe不変を確認。さらに2〜20件のBatch TIFFを既存全件事前検証・各写真の権限/保存版/Original SHA再照合・人物拒否・容量上限・全件成功後のみ手動個別リンクへ接続。実Chromeの合成非RAW 2 Assetで明示順TIFF2 Blob、PPI/PPC、無効値/途中Original改変/取消時0リンク、元SHA/Recipe不変を確認（全Web801件PASS）。RAW16精度・Adobe RGB・TIFF圧縮・実RAW画質/Cloudは未対応/未検証で、元候補全要素完了には算入しない。
- 背景補正の明示マスク限定部品: Add Shadow、Original Shadow、Black & White Edge Removalの純粋画素部品に加え、同一Asset/Original SHA/保存版/寸法/出典を照合する非破壊背景合成と本人手動Add/Erase subject mask authoringを新規部品として実装・専用試験済み（全Web801件PASS）。実Chrome 390pxのPoint Curve幅はSlider/親パネル右端ともx=351で超過0px。背景置換の信頼できる認証・マスク発行元・製品UI/Recipe/Workerは未接続。自動被写体/ハロー/元影抽出・Brush/Syncを実装済みとはしない。現Local Levels brushや顔ovalは被写体maskの代用にしない。
- Smart Culling手動Panel: Node Workspace専用の認証済みClientを使う手動Stars/Flags/Tags/Segments画面部品を新規追加。実Chrome＋実HTTP/SQLiteで保存/再取得、CAS競合、401/403、取消時未確認ロック、Keyboard、390px幅を確認（専用2件・全Web801件PASS）。Node Workspaceアプリへの実mount、Trial/Cloud、AI自動選別は未接続で元候補全要素完了には算入しない。
- Smart Culling製品接続の停止境界: Node Workspaceに本人subject/tenant/membership/roleを返す読み取り専用Session endpoint、そのWeb client、host注入型の本人検証済みPanel mountを追加。実Chrome＋実JWT HTTP/SQLiteで手動保存→再読込、権限失効/降格、別Asset切替、取消時の停止を確認。現Web bootstrapはTrial/Sites/Localのみで実OIDC host/token providerと本人・Project/Asset選択経路が無い。JWT `tenant_id` とWorkspace UUIDを同じと仮定して本番mountしない。AI自動選別も未接続のため製品PASSへ昇格しない。
- 人物検出の局所タイル: 同梱FaceLandmarker SHA照合、実Chrome/Workerで既存hero写真全体の0検出を確認後、固定重複タイルで2顔を検出。視覚上3人の写真で右横顔は未検出なので「全人物検出」ではない。本人承認前のSession推論/人物調整は拒否、保存/API 0、写真SHA不変。Person機能のPASSや元候補完了には算入しない。
- `EV3-0492 Levels` UI/Sync補完: 4ch×5値の数値直接入力とgamma中間Sliderの右→暗変換を、既存Recipe gamma値の意味を変えずに接続。Output Black/Whiteを含む20値について、実Chromeの合成非RAW EditorでWorker Preview→Trial HTTP/SQLite保存/再読込→Final PNG画素、Undo/Redo、Original SHA不変、390pxのはみ出し0、Arrowキー/focusを確認。さらに保存済みsourceのLevels branchだけを明示選択2〜20件のtargetへ権限/版数CAS/元SHA照合付きで同期し、targetの他調整・人物・原本を保持。実HTTP/SQLiteと実Chromeで2/2保存→再読込→Preview/Final画素、競合時1/2部分結果表示を確認（専用Sync10件・全Web850件PASS）。実RAW/Cloud/元製品同等性は未確認なので元候補全要素完了とは数えない。
- `EV3-0773 Desktop Output adjustments` のSUITE限定部品: 公式のScreen/Print×Low/Standard/Highは数値非公開なので同等実装を主張しない。明示manual値による非破壊8-bit sRGB出力シャープを純粋部品・実Worker・Session単写真/Batchのexport-only optionと製品Editorの両Final画面へ接続。実Chromeの合成非RAW 2 AssetでFinal resize後→manual処理→TIFF/PNG Blob画素、既定noneとの差、無効値・取消/二番目失敗時リンク0、Keyboard/Escape、390px超過0、Original SHA/保存Recipe不変を確認（全Web851件PASS）。公式preset数値同等性、実RAW/Cloudは未確認なので元候補全要素完了には算入しない。
- `EV3-0873 Desktop ↔ iPad compatibility` の限定部品: RecipeDocument v1とWorkspace Project/Asset/Preset/RecipeVersionの共通JSONについて、未知フィールド、ID・SHA・版数・スコープ不一致を拒否する厳密往復を新規module/専用6件で確認（当時の全Web818件PASS）。SwiftローカルHistory/Export、既知の描画拡張、実iPad/Cloud同期・Appleビルドは対象外または未検証。可搬データ部品の試験であり、実デバイス互換の完了とは数えない。
- `EV3-0049 AI Facial Recognition` の既知欠落診断: SHA照合済み同梱FaceLandmarkerと既存3人hero写真を実Chromeで用い、通常・左右反転・±90度・重複tileの候補を逆座標投影/重複拒否で比較。baselineの2顔に加え右横顔を検出する候補は確認できなかった（専用5件・全Web834件PASS）。写真/画素SHA不変、保存/API送信なし。診断部品は製品Sessionへ接続せず、右横顔改善や元候補の全要素完了を主張しない。
- `EV3-1073 Mobile Motion Blur` の境界: [公式Mobile AI Lab](https://support.evoto.ai/ai-lab-mobile/) はGhost Flow選択→AI Generate→比較/編集/Exportを説明し、方向・距離・被写体保護mask等の手動パラメータを示さない。SUITE独自の方向ブラーを同じ機能として数えるのは不正確なので未実装のまま保持。今回この候補のソースは変更していない。
- `EV3-0342 B/W Edge Removal` の手動限定経路: 既存の明示subject mask境界補正に対し、本人指定correction範囲以外を完全不変にするpure adapter、subject/correction別roleのnormalized stroke契約、Asset/Original SHA/full寸法・版数/権限証拠の照合、8M画素/64stroke/4096点/96KiB上限、別roleのmaskラスタ化を追加。Recipe v1の任意typed `bwEdgeManual`、Node/Cloud保存時bound照合、Normal Worker Proxy/Final、Trial APIのfresh権限Gate、EditorSessionの保存・再読込・Preview/Final、After二層ブラシの画面接続まで実装。実Trial認証HTTP/SQLite＋実Chromeの合成非RAW 2 AssetでUI二層適用→保存・再読込→Worker Proxy/Final画素差とOriginal SHA不変、Before/別Asset/失効拒否を確認し、全Web917/917 PASS。Batch Finalや写真をまたぐPresetへの束縛mask流用は拒否する。本人確認boolean単独は認証ではない。元製品の自動対象判定/Update/Sync、実RAW・公開Cloud画質、8M超の高解像度は未実装または未検証で、元候補完了には数えない。
- `EV3-0394 Original Shadow` の手動mask限定部品: 元の低水準画素APIを保持し、Asset UUID/Original SHA/保存revision/寸法をsubject・shadow両maskへ照合する高水準APIと対象外画素・alpha・Original不変試験を追加（専用11件、Web905件PASS時点）。mask発行元の本人認証、背景交換、Worker/Session/UI、公式のAI Retain Shadowsは未接続。元候補完了には数えない。
- `EV3-0396 Add Shadow` の手動mask限定部品: 既存None/Soft/Hard/DropとOpacity/Blur/Gradient/Blendの低水準実画素処理を維持し、subject maskと本人選択背景のAsset/SHA/保存revision/寸法、合成RGBAのdigestを照合する高水準API、さらに明示背景画素のsnapshot→背景合成→Worker向けbound runtimeを追加。独立Worker operationとWeb Processing facadeも実画素・入力不変・中断・旧render不変の専用試験で接続済み。対象/背景Assetそれぞれのfresh Trial read-only Gate、非破壊typed手動document、Proxy/Source別stroke raster、Node Recipe構造検証とTrial/Workspaceの実登録Asset/SHA保存境界も専用SQLite/HTTPで確認。保存済みdocument→両Gate→mask→独立Worker→最終fresh照合のTrial限定orchestratorは、合成非RAWでは実LibRaw decode前に拒否することを確認したが成功画素は未確認。全Recipe Batch Editの写真固有文書コピーとBatch Final、通常Session renderの黙示無視は拒否する（直近全Web990/990、Backend189/189 PASS）。実RAW成功、製品Session/UI・Preview/Final経路、Cloudは未接続/未検証で、元候補完了には数えない。
- `EV3-0764 Export naming` の撮影日方式: installed LibRawの公開値は秒単位timestampのみでExifの暦日文字列・offset・変換規則を確認できなかった。秒数、偽metadata、import日時から撮影暦日名を推測する経路を拒否する回帰2件を追加。immutable Original byteのClassic TIFFおよびDNG限定subsetからDateTimeOriginal/任意OffsetTimeOriginalを上限・SHA付きで構造読取する純粋部品を追加。さらに実Trial HTTP/SQLiteのfresh本人/Asset SHA/保存版/export権限と合成DNGの構造証拠を結ぶread-only Gateを自動試験済み。ただし証拠は命名許可そのものではなく、カメラ時計の真実性、実RAWデコード、offset無し暦日採用、実DNG corpusは未検証。日付方針/製品命名接続も未完了で元候補完了には数えない。

## 件数運用

新しい機能のUI・保存・Finalまで通っても「SUITE限定接続済み」と、元候補の全下位操作・出力まで確認した「元候補全要素完了」を別々に更新する。チャットにはこの区別を短く通知する。44件の候補名・元IDは [一次37件](UNIQUE_FEATURES_CONFIRMED.md) と [二次7件](UNIQUE_MISSING_SEVEN_AUDIT.md) を参照。下位操作の実装状態を引き続き行単位で照合する。判定不明のMobile Effectsを44件へ加算しない。

## 元候補の技術的差分（未完了のまま保持）

- `EV3-0492 Levels`: [Evoto公式Color Adjustment](https://support.evoto.ai/color-adjustment-feature-modules/) の4ch、黒白スポイト、入力3点・出力2点、gamma、数値直接入力、右移動で暗くなる中間Slider、Local/Sync/Presetを照合。SUITEの4ch×5値画素核、4ch Histogram、黒白スポイト、Local brush、Portable Preset/SQLiteに加え、数値入力・公式方向のSlider変換・Output Black/Whiteの実Chrome UI→保存→Finalを確認した。現Recipe gammaの意味と旧結果は維持。Levels固有の複数写真Sync、実RAW/Cloud、元製品画素同等性は未確認なので元候補完了と数えない。
- `LR-16 HDR Optimization`: [Adobe公式HDR Optimization](https://helpx.adobe.com/lightroom/desktop/edit-photos/hdr-output.html) はHDRデータを持つ入力、対応表示でのHDR編集、SDR表示プレビュー、HDR情報を維持する出力（JPEG gain map等）を説明する。現行SUITEの8-bit RGBA8/sRGB Preview/Final経路だけを調整しても、これらのHDR情報・表示・出力を満たしたことにはならない。単純な輝度スライダーを代用品として完成扱いしない。高精度画素表現、HDR対応入力/表示、出力形式・gain mapの実装と試験が別途必要。
- `EV3-0934 Batch Edit`: [Evoto公式AI Lab](https://support.evoto.ai/ai-lab/) のBatch Editは複数写真へPeople Removal・Old Photo Restoration・Detail EnhanceのAI効果をまとめて生成する経路。SUITEで確認したのは保存済みRecipeの権限/版数つき一括コピーであり、これらのAI効果生成ではない。名称が同じでも処理内容を取り違えず、元候補は未完了のまま保持する。
- `EV3-0993 Clothing Moiré Removal`: [Evoto公式AI Lab](https://support.evoto.ai/ai-lab/) は衣服/布領域を自動検出し、織りやしわを保ちながら輝度・色モアレを抑えるGenerate処理と説明する。単なる全画面ぼかしやUI Sliderだけでは代替できない。領域検出/補正モデル、保存/Final、実写真画質の検証が必要。
