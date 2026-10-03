# 統合時の変更理由・影響範囲（実装前通知）

## 2026-10-03 公開Web試用の配備前・管理者初回認可（実装前）

現行Sites Workerは管理者操作へ本人ID＋サーバー側パスワードを要求するが、新規D1には管理者Member行が存在せず、初回Loginが本人確認に到達できない。既存`/trial/admin/login`の内部でのみ、Sites dispatchの本人IDが設定済みの単一Owner IDに一致し、管理者パスワード検証を通った後に管理者Member行を作成する。別アカウント・既存Author行・異なるID/Emailの昇格は禁止し、管理者通常操作は引き続き短期Cookieのサーバー側検証を要する。Ownerは招待試用期間の対象外とし、Authorの個別期限・取消はそのまま。Recipe v1、DB schema、既存APIの外形、新Provider、料金、原本保持契約は変更しない。実D1/dispatchでの本人ID保証は配備後の独立Gate。

## 2026-10-03 公開Web試用・匿名ローカル編集の変更通知（実装前）

最新の明示指示により、指定Siteの「招待限定・オーナー限定」をWeb試用版についてのみ解除する。ただし旧version 33はSUITEでなく、公式source接続・認可実証前に公開へ切り替えない。別用途Site、一般販売、決済、メール送信は対象外。公開ページとブラウザ内の基本編集は無登録で利用可能にする。一方、RAW/Recipe/提出のクラウド保存・再読込・提出は既存のサーバー所有者識別を通らない匿名利用へ開放しない。匿名ローカル保管は同一ブラウザプロファイル内の利便性であり、共有端末の利用者識別やクラウド隔離の代替ではない。

管理者APIは既存のSites本人識別・role=adminに加え、サーバー側のパスワード検証済みセッションを要求する。管理者は一人とし、公開セルフ登録や管理者招待を追加しない。パスワード・署名鍵はプラットフォームのSecret bindingからのみ取得し、ソース/フロント/コマンド引数/Evidenceへ記録しない。ユーザーがチャットに記した既存パスワードはソースへ取り込まず、配備前に安全な経路で変更・設定する。既存の作者期限/取消/原本と提出保持は維持する。匿名ローカル編集の個人別期限・取消は本人識別がない限り強制できず、別Gateとして明示する。

共通Recipe v1はWebが使用中の `postDecodeAdjustments` stageを共有JSON SchemaとSwift enumに追加して受理形式だけ整合する。Apple描画は未対応のままfail-closedを維持し、Native実行をPASSにしない。画面下部の写真一覧はiPadタッチ慣性スクロール、スクロール中の誤選択防止、マウス/トラックパッド、選択表示と多枚数での状態保持を独立試験する。旧147節/固定6文書/旧Evidenceは不変。

## Sites追加接続（実装前通知、2026-10-03）

最新明示指示に基づき、既存dist/web・画面・ブラウザ画像処理・Recipe v1/共有検証を再利用したWorker adapterを追加する。旧Node backend/SQLite/HTTP APIはQA用に保持し置換しない。新Site専用D1は同じAsset/Recipe/audit列と、招待membership/作者版/アップロード台帳のみ追加。R2には原本・不変partと生成object、D1にはmetadataのみ。標準50GB事業Baseline/価格/Apple課金は変更なし。

ChatGPT認証はdispatch提供header、認可は毎requestの招待membershipとauthor/admin。未招待・revoke・他作者Asset/Recipe/下書きをサーバーで拒否。dispatch以外から同headerを偽装できない配備境界は未実測Gateとして残す。自動first-user管理者化なし。本人のemail/権限は根拠なく設定しない。

RAW128MiBは単発100MB上限を超えるため8MiB転送＋R2不変part履歴＋再開台帳を追加。破損partのみ再取得、正常part/旧partは保持。complete後の実bytes SHA256/sizeとDB commit前はCloud Safeへ昇格しない。画像処理はブラウザ側で既存engineを再利用、WorkerでRAW全体をbufferしない。Sites固有上限/実provider/ChatGPT login/実RAWはNOT_RUN。全Sites deployment URLはproduction扱いなので、ユーザーの本番公開禁止によりsave/deployは行わない。

外部preset-author-lab-isolatedのpure contract/adapterを内容保持して取込み、元5fileは変更しない。mainの厳密Recipe検証を前段に残す。UI採用ACCEPTEDは外部正式SUBMITTED→APPROVED→PUBLISHEDの2遷移を明示して固定版へ取り込む。自己承認禁止、旧snapshot不変、写真固有値を黙ってstripしない。

## 最新ユーザー指示：Web招待試用の処理接続（実装前通知）

明示された招待ログイン→RAW/global編集→保存/再読込→Export→作者名付きプリセット提出を優先。旧Asset/Recipe DB/schema/APIは変更せず再利用。localhost専用trial serverの隔離`/trial/*` routesと別SQLite `trial.sqlite` に招待hash/sessionhash/作者/下書きCAS/提出snapshot/採用固定versionを追加する。これは新Cloud/Auth/Billing provider採用ではなく、本番接続済みとも扱わない。外部公開先・HTTPS・本物RAW・外部作者成果を照会中、未接続をPASSへ変換しない。
招待Tokenは32byte乱数・hashだけ保存・一回使用・期限/revoke。Author個別tenantをServer側で強制し、旧localQA cookieへfallbackしない。作者名はserver principalから確定、UI自称を本人認証へ使わない。preset可搬値は現Webglobal3項目を明示選択し、写真固有asset/person/geometry/mask/crop/rotationをコピーしない。提出後のsnapshot/採用版は不変、改良は新version。管理者自身の提出への自己承認は禁止。
原本は既存Object Storage、管理metadataはDB、trial追加DBへRAWを入れない。ストレージ事業者/標準50GB事業案/料金/決済/Apple側は変更しない。独立試験の実SQLite/HTTP成功も実RAW・外部招待試用やMobile成功とは別。

## Web顔解析Privacy安全停止（最終レビュー発見・実装前通知）

採用SDK @mediapipe/tasks-vision 1.0.1 の配布README Privacy Notice（2026-06-05）は入力画像をGoogleへ送らないと説明する一方、性能・利用メトリクスのGoogle送信とユーザー同意責任を明記。送信payload/停止手段/配布モデル権利は未確認。端末内計算を無通信保証へ読み替えない。
実写真の人物解析・人物Recipeの再描画/Finalを EditorSession default=`PRIVACY_REVIEW_REQUIRED` で拒否し、UIも無効化する。人物選択・Maskは無効化するがOriginal/Recipe/履歴は保持。明示した人工mock試験だけ別test-only許可を注入し、実写真の許可には使わない。通常のRAW decode/global/Crop/非人物Exportは影響なし。共有Recipe v1/DB/既存HTTPは変更しない。写真家の同意取得/本番privacyを架空実装しない。
SDK README/package license declarationをローカル配布noticeへ添付するが、これをモデル再配布権や法務合格の証明にしない。修正前Windows154/Web63/人工ブラウザ21のEvidenceは不変、修正後は別runへ再実行する。

## 最新ユーザー指示：Mac待ちWeb先行検証（実装前通知）

過去のWeb禁止は今回の明示指示の範囲で更新。独立追加契約はWEB_IMPLEMENTATION_CONTRACT.md。旧147節/固定6文書/Windows154凍結Evidence不変。
ブラウザで同じ人物検証を再利用するためperson-geometryの純粋関数をNode-freeファイルへ抽出し、元moduleはre-export＋既存diagnostic hashを保持。portrait validatorだけimport先を変更する。新Webengine識別をportrait既存engineVersion許容値へ追加し、AppleVisionへ偽装しない。Recipe v1外形/DBschema/HTTPAPI不変。Swiftは未対応engineを拒否する現行動作のまま、Native互換を合格にしない。
依存追加はlocal LibRaw WASM/MediaPipe/esbuild/browser検証のみ。クラウドprovider/価格/課金決定ではない。Web testsは旧154と別集計、最新差分で旧154を再実行する。

2026-10-03。6領域設計は凍結。Web実装は行わない。

1. Recipe形式共通化: backendの独自operations形式とSwiftのparameters形式の不一致を解消するため、既存Swiftの値構造を基準にschemaVersion=1/parametersの共通文書を定義する。既存のexposure/contrast/saturation/rotationDegrees/extendedParameters/processingOrderを維持する。影響はbackend検証、Swift Codable、golden fixture、API adapter。未公開・データ未移行の新規骨組み内の統合であり、既存商用データを変換/削除しない。
2. 追加指示23節を正式要件として保存。Session Look/Mode/Personal Color/人物別設定は非破壊データと検証境界を追加する。解析/ML/テザー実接続は未実装のまま明示し、設定保存を処理成功としない。Recipeの拡張領域と固定Export snapshotを使い、RAW/Proxy/Cloud Safe/CAS/Cacheの既存契約は変更しない。
3. Exportを一時ファイル検証後に確定し、未対応RAWと未対応編集を拒否する。原本/固定RecipeからのみFinalを生成する既存安全要件の実装であり出力仕様の拡張ではない。
4. 外部RAW harnessはcheckout外の100/500/1000を読むだけ。未配置、decoder未接続、Mac/実機未接続はBLOCKED_EXTERNAL_ENVIRONMENT。Windowsの基盤試験を実RAW/実機合格へ置換しない。

別チャットの新規API/schema/provider/料金/retention案は参考資料として回収するが、この通知で採用しない。

## 2026-10-03 実装中心切替：既存人物補正の最小接続（実装前）

最新ユーザー指示により監査完了を独立実装の開始条件から外す。既存ADDITIONAL_SPEC§8 Face Brightness / §18非破壊保存、SUITE_SPEC§12人物レタッチのうち、この写真で明示選択した顔の明るさだけをまず接続する。

- Recipe v1の既存extendedParameters内にtyped portraitデータを追加する。外形/schemaVersion/保存API/CAS/Original/Proxy/Cloud Safe/固定6契約は変更しない。
- portraitはassetID＋originalSHA256、写真内だけのtargetUUID、Vision lower-left normalized face anchor、明示exposureEV、engineVersionを保持。別写真・別原本への座標流用禁止。撮影セットPerson IDやSession Look自動追従を実装済みとはしない。
- Proxyで実Vision顔検出、人物Maskと顔領域の積で対象を分離しCore Imageで明るさを変更。Finalは原本を再解析し、同じ写真の一意な顔対応・人物Maskが得られない場合拒否。全画面Exposureへの置換、他人物/背景への無条件適用は禁止。
- Preview/Finalで同じ固定portrait値を使い、人物処理→既存global色調整→既存回転/Cropの順とする。未知engine/control/Recipe、曖昧対応、未対応RAW、Original不足は拒否して内容を保持する。
- LOW/MEDIUM/HIGHの数値presetやAUTOの品質を勝手に確定しない。初期は0（変更なし）、明示CUSTOM EVのみ。Face Brightness以外の主要人物仕様は削除せず未実装として残す。
- Swift/画像/実RAW/実機は現在実行不能。Windowsのwire値・CAS保存・独立安全試験とNative画像/実機NOT_RUNを分離。新provider・課金・正式価格・50GB基準は変更しない。

影響範囲：SuiteCore新PortraitRecipe bridge、backend既存Recipe検証へのtyped extension guard、Apple PhotoPipeline/EditorModel/共通controls、新しい独立テスト。取込orphan復旧は別の既知不足として保持し、原本自動削除を導入しない。

今回承認された追跡field差分：target.id、anchor、adjustmentType="face_brightness"、value（CUSTOM EV）、portrait.schemaVersion=1、assetID、originalSHA256、engineVersion、createdAt/updatedAt（ISO8601 UTC）。人物処理adapterはadjustmentTypeでdispatchし、未対応typeを捨てず拒否する。これはRecipe v1の既存拡張領域内であり旧Recipeの外形・既存stage order・147節を置換しない。新しい数値LOW/MEDIUM/HIGH・他補正UIは追加しない。

独立レビューで保存境界の不足を確認。実装前差分：backendの保存・SQLite再読込でportraitのassetID/originalSHA256を登録Assetへ拘束し、Swiftの全履歴にも同じ拘束を検証する。UTC日付の存在しない日をパースの繰上がりで受理しない。破損Recipeは拒否するが原本／保存行は削除せず保持する。DB schema・Recipe v1外形・既存API・固定6文書の変更はない。

追記（実装前）：人物UUIDを維持したまま別の顔座標へ付替える経路を拒否する。最初のportraitを写真内の対象inventoryとし、同じ履歴内の以降のportraitは同じUUID/anchor/adjustmentTypeの対応を使用する。値・updatedAt変更、portraitなしへのUndo、同一対象の再出現は許可する。新たな人物UUIDの登録・写真間追従は未対応。Shared Workspace Recipe保存・全Version読込にもAsset/checksumと人物対応検証を接続する。既存CAS/branchの保持は変更しない。この検証は保存データ整合であり実人物の生体識別・顔Mask品質の実証ではない。

保存済checkpointからのhistory置換でも前回の人物対応を検証する。端末時計が戻っても明示編集を阻害しないよう、updatedAtは保存済updatedAtと現在時刻の遅い方とし、CASの順序は従来どおりrevisionで判定する。人物対応が履歴から完全に失われた状態の耐久inventoryは今回未実装として残す（別人物追従や新しい永続化契約を推測追加しない）。

最終レビュー後の安全拒否差分（実装前）：PRF01の再検証開始／失敗時は人物参照と選択を無効化する。PRF02/03は保存済対象を部分集合へ減らさず、全顔の一対一再照合を必須とする。保存anchor／再検出した顔のboxが重なる場合、または顔数が異なる場合は曖昧として拒否。顔Maskを自分のbox外で明示0にし、別人物のMaskとの重なりによる二重補正を防ぐ。これは未検証candidate engineのfail-closed規則であり、全写真の顔検出品質や生体ID一致の保証ではない。旧147節・外形schema・APIを変更せず、重なった人物写真は実画像QAで別途確認・BLOCKする。

人物整合正式Gateの追加差分（実装前）：既存ProjectStore保存で人物inventoryを全履歴から失わせる置換を拒否し、元checkpointを保持する。Undoでcursorを補正前へ戻すことは可能だが、人物解析の全履歴を捨てるforkは安全拒否する。自動修復や新しいsidecar/schemaを追加しない。この拒否時の通常編集継続UXは未解決事項として記録する。Nativeでの実行はNOT_RUNのまま。

ユーザー共通Gate正式化指示：制御非依存のPersonGeometryIntegrity/person-geometryを既存typed portrait validatorから分離し、asset/Original checksum/person UUID/normalized face geometry/full inventoryの不変検証を再利用可能にする。将来Skin等の実装やschema追加ではなく安全関数の分離。12経路を個別PGI IDで追跡し、必要NativeはNOT_RUNのまま。EditorModel内部だけに隔離temp保存領域を注入できる後方互換test seamを加える（既存HTTP/API・DB・Recipe v1の変更なし）。

Export固定Recipe経路の追加拒否差分（実装前）：人物補正のあるFinalは既存ProjectStoreから信頼するcheckpointを再読込し、固定PlanのAsset/SHA/person対応・revision・parametersを照合する。単独の自己記述PlanだけではUUID/顔座標を信頼しない。別Recipeへ置換・最新値で書出すことはせず、不一致時は停止する。既存API/protocolはasync契約のまま、Planの保存field/Recipe v1/DB schemaは変更しない。Export後に端末で別revisionへ編集した旧Planの再試行は拒否し、将来の耐久job snapshotとの統合は未実装として残す。

## ユーザー追加強制仕様24節の影響通知

添付310114d7の明示指示に基づきCloud Safe七条件、複数Proxy品質、P0–P3と明示Export昇格、通信設定、Provider能力境界、50GB/100GB/500GB/1TB相当project試験条件を正本に追記する。既存6領域を別方式へ再設計しない。Cloud Safeの端末／backend表現を整合し、provider実装不在は未接続と表示する。既存Local Onlyは保持し、Cloud master化はCloud Safe確認後に限る。機能実行機構（background transfer/実LRU/クロスデバイス）は未完成として追跡し、契約のみで完成にしない。

## 最終統合凍結

最新ユーザー指示に従い、以後は新provider/API/保存契約/クラウド構成を追加・変更しない。既存CONTRACTS/PHOTO_ARCHITECTURE/非破壊仕様をhash固定して検査する。
Mac build、実RAW 100/500/1000、同期→Recipe保存→再起動復旧→Cloud Safeを含むfull lifecycleの証拠を、iPhone/iPad実機とは別の必須QA Gateとして明記する。これは既存製品契約の置換ではなく、ユーザー指定済み試験の漏れを防ぐ判定強化。未計測はUNKNOWNでBLOCK。

## 2026-10-03 Web招待試用の追加境界（最新指示）

既存Recipe v1・Asset API・基盤DB・固定6文書・147節は変更しない。招待試用専用auth/author DBとSites adapterにのみ招待認可、作者と管理者の権限、明示終了日時、取消を追加する。招待のredeem期限と編集可能な試用終了日時は別値。終了・取消を操作ごとに検証し、固定日数や無期限への暗黙移行をしない。RAW・Recipe・提出・過去版を終了時に削除しない。

Sitesは新規専用Siteのみ、ユーザー許可済み非公開招待配備。既存Siteの転用・上書き・削除は禁止。新規作成429のため外部配備はBLOCK。新料金・有料契約・一般公開・メール送信は行わない。Node QAの処理契約を再利用し、ブラウザ描画とD1管理情報/R2原本を接続するadapterのみ追加する。

独立レビュー後の最小修正差分（実装前）：R2読取上限・一時通信障害・streaming engine不足を、原本欠損またはchecksum破損と混同しない。明示的なORIGINAL_MISSING/CHECKSUM_MISMATCHのみCloud Safeを失効させ、その他は処理を拒否して検証状態を保持する。READY completeの再検証が実checksum/size一致で通った場合のみCloud Safe再確認可能とする。part検証の通信失敗を「破損」と誤分類して不要な再アップロードへ進めない。R2の原本/旧partに上書きや削除を行う変更ではない。本番環境はNOT_RUN。

## 2026-10-03 編集機能不足の統合前通知

SUITE_SPEC.mdの既定18項目に対する未実装13項目を実装対象一覧へ含める。processing/raw.mjsの8bit・sRGB変換前後の処理を確認し、RAW段階のWB・ハイライト復元と、変換後の色調整を区別する。失われた階調を復元できるような表示はしない。既存保存・履歴基盤は再利用し、Web先行の方針を維持して実装を進める。

今回の共有変更候補はRecipe v1の既存extendedParameters内の型付きWeb色/細部値と、既存processingOrderに明示する対応stageの検証・renderer接続のみ。schemaVersion、外形、Asset/OriginalのAPI、DB表、旧Recipe、既存人物Gate、Cloud Safe契約は変更しない。Mac未実行のApple rendererが新値を黙って無視しないよう、未対応処理は明示拒否を維持する。8bit sRGB後段の局所トーンはRAWハイライト復元/WBではなく、実RAW視覚品質とは別Gate。影響範囲：backend Recipe検証、Web session・renderer・UI・独立試験、将来Nativeの処理対応と再検証。既存154 Windowsと現行Web回帰は変更後に再実行し、旧Evidenceを上書きしない。

Sitesについては、ユーザーが `eclat-genseki-demo.bals-enter.chatgpt.site` をSUITE用と明示し旧内容の破棄を許可したため、上記の「既存Site転用禁止」をこの1件だけ更新する。他Siteは転用しない。Site v33の履歴は保持し、まずアクセスをオーナー限定へ変更した。Sites公式source checkoutが環境の非空stdin拒否でBLOCK中であり、旧本文は未置換。資格情報を引数・ファイル・出力に露出して回避しない。
## 2026-10-03 Web招待試用向けPortable Preset拡張（実装前通知）

今回の対象は、既にWebで実画素処理へ接続された `postDecodeAdjustments`（明るさの局所トーン、自然な彩度、HSL、明瞭度、テクスチャ、シャープ）のみ。作者プリセットの旧3値 `exposure` / `contrast` / `saturation` はそのまま読み書き可能とし、追加調整がある場合だけ同名の任意フィールドを保存する。Recipe v1外形、既存DB表、Asset/Original API、人物UUID→顔座標Gate、固定6契約は変更しない。写真固有のCrop・回転・人物・Export設定・未知extensionは引き続きPreset化を拒否し、黙って除外しない。

影響ファイルは `apps/web/src/preset-author/preset-author-contract.mjs`、`apps/web/preset-policy.mjs`、`apps/web/src/session.mjs`、`apps/web/src/author-ui.mjs`、追加の独立試験。既存JSON snapshot／source CAS／採用版checksumを再利用する。旧3値Presetを適用した場合は対象写真の既存postDecode調整を保持し、明示的にpostDecode値を持つPresetの場合だけその枝を置換する。人物補正やRAW段階WB・ハイライト復元を実装済みと表示しない。Sites本番の接続・実RAW視覚試験は別Gateのまま。

Web Crop の固定比率は、既存 `CROP_RATIOS` に定義済みの9種類をEditorへ接続する。新しいCrop契約・Recipe外形・DB/APIは作らず、既存の中心Cropと回転後寸法検証を再利用する。Free/Custom矩形編集および印刷実寸resizeはこの変更では未実装としてUIで明示する。影響ファイルは `apps/web/src/session.mjs` と `apps/web/src/editor-ui.mjs`、独立試験のみ。

追加のSitesローカル準備試験5件は既存Windows154件を置換せず、最終回帰ランナーの実行対象へ追加する。報告上は旧154件と新5件を分離し、実Sites接続/D1/R2/招待認可成功へ読み替えない。影響ファイルは `scripts/final-regression.mjs` と新規Evidenceのみ。
