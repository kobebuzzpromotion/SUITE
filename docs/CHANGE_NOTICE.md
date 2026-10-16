# 統合時の変更理由・影響範囲（実装前通知）

## 2026-10-17 コスプレ素材プリセット

背景5種・透過演出6種の手続き描画プリセットを独立素材作成画面へ追加する。既存写真やRecipeを変更せず、端末内PNG書き出し。背景は既存Apple LocalBackdropAssetStoreの厳密manifest形式で出力しpermissionはunreviewedのまま。透過演出は別manifestとし背景へ自動登録しない。写真風素材、人物への自動照り返し、既存Editorへの直接適用は今回の作成範囲に含めない。

## 2026-10-13 ユーザー承認：体型補正の2D完成範囲

ユーザーが『2D方式で仕上げる。実寸・距離の推定は不要』を選択。今回D04は本人指定の部位・強度と実人物maskに基づく写真上の2D変形とする。過去の物理距離/実寸を考慮する記述は履歴として保持するが、この専用経路には要求しない。解析済みdistance/scaleを偽装せず、他の3D/物理モデル要件は変更しない。

## 2026-10-13 H02背景なし編集・素材移送

背景変更を伴わない局所補正/変形を背景必須のbundleで拒否していたため、実入力寸法を明示保持するv2経路を追加する。旧v1は維持し、空背景の偽造や原本の改変はしない。素材の移送は利用者が明示選択するJSONファイル方式で、全履歴と画像/マスクが含まれることを表示。クラウド保存済みとは扱わない。担当を分けてWeb reader/rendererとbackend参照validatorを同じ版にそろえる。

## 2026-10-13 生成依頼のサーバー経路・復旧接続

生成用料金表・残高予約・単発送信・候補保存・精算は原本容量台帳とは別の台帳を使用。管理者が設定する固定料金をproviderのリアルタイム見積と呼ばない。未確定応答は再送/予約解放しない。候補保存後に中断した場合、状態GETからも耐久出力を再照合して精算を復旧する。Apple入口は既存backend認証と遠隔写真/版一致を使用し、候補は明示人物maskによる既存非破壊採用へ渡す。設定・モデル・資金・認証を作ったことにはしない。実通信なし。

## 2026-10-13 承認済み鼻・目・胴・胸の自由変形

ユーザー承認に基づき、部位と領域を利用者が指定する自由変形を既存warp操作へ接続する。鼻/目は大きさ・幅・高さ・位置・角度、胴/胸は幅・ボリューム・位置、左右独立。初期値は変形なし。人物を自動理想化したり未定義の人体を推定しない。既存map・原本不変・Undo/CASと実人物mask保護を再利用。画像の左右と本人の左右を混同しない。

## 2026-10-13 残6件の人物保護・復元接続

D04の共有変更は担当間で事前通知し、LocalWarpRecipeの任意bodyMask参照を追加。旧文書nil互換、実L8のSHAと寸法一致をPreview/通常Final/タイルFinalで要求する。原寸と異なるproxy maskを拡大して代用しない。H02は未知契約を無視せず拒否し、Webの対応済み編集だけを明示操作で既存Undoへ追加する。G01/G04は料金やprovider真正性を捏造せず、固定依頼と候補採用の競合制御を補強する。検査・ビルド・配備・外部送信は実行しない。

## 2026-10-13 一部実装12件を閉じる接続作業

H02は既存PNG背景preview-sessionへ実proxy/現写真revision/権利確認hostと互換UIを接続。非保存見本を全編集復元と混同しない。E06は復旧判定だけで止まるworkerRequiredを実処理へ、D05は未接続の実adapterを既存部分receipt保存へ接続する。既存共通コードを使い、原本不変/世代失効/明示同意を維持。未導入資産や未試験をコード完成と混ぜない。

## 2026-10-11 Web背景資産入口と人物照合コピー

H02はApple用背景manifest/画像/raw L8 maskを既存Web RAW入口へ偽装せず、明示提供bundleの照合から分離実装する。復号/永続化/描画呼出は別工程。人物照合の一時コピーは成功・失敗・取消で解放しcallerの原本galleryは維持。Mainはanalysis-session、ai_identityは比較関数、ai_assetsは背景bundleを担当。試験・ビルド・配備なし。

## 2026-10-11 B04詳細解析

既存PortraitPipelineの人物mask取得を再利用し、Visionの実landmarkを写真固有の座標・request版・領域名と共に返す。YuNet5点と詳細点を別topologyとして扱う。曖昧な顔対応や欠落maskは保留/失敗とし、別人物へ割当しない。これは共通解析への接続であり肌/身体の画素補正完成ではない。旧Recipe/既存顔明度描画は変更しない。

## 2026-10-11 土台あり優先 A03/A05/C01

取得済みlicense本文を固定出典付きでアプリから読めるようにする。商用/再配布の確認状態は別で未確認を維持。顔推論instanceの共有は同一model store・全推論設定一致の範囲に限定し、違う保存領域/版の混用を禁止。登録人物に選択元写真/解析/顔IDの参照を暗号化保存し、旧galleryの参照欠落は不明として読込み、新規登録で欠落を作らない。原写真コピーや外部送信は追加しない。

## 2026-10-11 AI第九段

粗いadaptiveFace能力だけで眼/歯/肌等を対応済みにしないよう、固定planの効果別対応理由を別判定する。LOW/MEDIUM/HIGHや単位未定のcustomを勝手にEVへ換算しない。既存の明示EV人物候補は既存PhotoPipelineで実描画し、写真/解析/checkpointに結び付くimmutable artifactを作る。候補作成はRecipe保存と分離し、未対応部分を省略して完成としない。従来Recipe/queue形式は変更しない。

## 2026-10-11 AI第八段

補正保存成功とqueue応答の間に中断すると、revisionだけでは同じjobの成功を再照合できない。ProjectStore内部文書にcheckpointとTetherLookQueue.CommitReceiptを同時保存する経路を追加する。旧checkpoint文書は引き続き読込可能、通常saveは既存commit記録を保持する。公開ProjectCheckpoint/Recipe形式は変更しない。新内部文書は旧アプリで読めないため旧版への巻戻しは非対応。同じjobの異なるreceipt/結果は拒否し、未確認を成功としない。これは永続化の接続であり、解析/描画が実装済みとは扱わない。

## 2026-10-11 AI第七段

既存CaptureContextを受信前に永続化し、Ingest ReceiptとHandoffへ固定値として運ぶ。camera receiptの再送に違うcontextを挿し替えない。queue保存とcheckpoint保存が終わる前に受渡し完了としない。取消/再起動の重複は既存receiptとqueue冪等キーで扱い、SDKの撮影ID相関がない写真を到着順で結び付けない。従来のcontext無しreceiptは読めるまま維持し、新接続からの自動適用は推測しない。

## 2026-10-11 AI第六段

写真内人物対応と訂正履歴を既存の端末限定暗号化gallery文書へ追加する。旧galleryを読込み可能に保ち、人物削除と関連対応削除を同一暗号化commitにする。保存は期待revisionによる競合拒否、破損/鍵不在を空データへ置換しない。再解析のIDを入力・モデル・解析条件・顔形状に固定し、取消世代を永続版から分離。厳密一致しない保存履歴は適用せず保留、破棄/再作成は明示操作のみ。原本/Recipe/クラウドは変更しない。

## 2026-10-11 AI第五段

候補作成と適用を分離。利用者が適用を明示した時だけ、現在asset・編集値・履歴・人物登録の一致を再確認し既存Undo/CASへ渡す。保存済み又はredo内のPortrait対象IDを再利用し、他の顔のEVを初期化しない。未適用候補を保存済み表示にしない。

写真内顔と登録人物の対応を明示操作の値契約として分離する。座標は入力画像・向き・寸法を一致確認して既存Vision領域へ対応し、曖昧な領域を強制割当しない。固定モデルの保存状態を推論実行可否と別に表示する。自動補正・外部送信・原本変更は追加しない。

## 2026-10-11 AI第四段・人物登録と表示

端末限定の同意付き人物galleryを追加する。顔特徴はKeychain管理鍵で暗号化しクラウドへ送らない。登録/削除は明示操作、既存写真/Recipe/原本を変更しない。既存人物パネルから独立した顔照合UIへ接続する。native未組込みや資産未導入は理由を表示し、既存Vision顔明度を妨げない。写真切替時は候補/同意を失効する。実行試験や実機合格判定は別工程。

## 2026-10-11 AI第三段・推論接続

モデルstore・C ABI推論核・人物照合核をつなぐサービスを追加する。画像準備はupright原寸との対応を保持し、解析だけ縮小する。cacheは原本/解析画素/モデル/前処理の識別子で分離し、取消・世代失効後の結果を採用しない。Nativeライブラリ未組込みは明示的unavailableで返し、成功を偽装しない。画面/Recipeへの自動適用と人物gallery永続化は別工程。

## 2026-10-11 AI第二段

再作成指示書で実装継続。ローカルモデル導入、OpenCV共通顔核、写真間候補判定を分離して並列実装する。C ABIで例外とメモリ所有権を限定、人物IDと写真内対象IDは別契約。モデル実行未確認を実用判定にしない。既存保存文書に新人物推定を無断で書き込まない。

## 2026-10-11 AI実装第一段

ユーザーの実装開始指示に基づき48作業案の土台から着手。D01は顔明度に全身解析を要求する過大依存を効果単位へ分解。E01は撮影開始時の設定snapshot契約を追加し転送中の変更混入を防ぐ。A01はモデル固定版・digest・IO・利用条件の不足を拒否する契約を作る。旧保存形式を壊さず、解析/実撮影/資産取得を済んだとは扱わない。AI推論・SDK・有料送信は別工程。

## 2026-10-11 大判再開

統合補完: PhotoPipelineから大判writerへの依存追加に合わせ、既存Mac QA packageの明示source一覧へDelta66LargePrint.swiftを追加する。iOS targetはSuiteディレクトリ収集のため追加登録不要。

ユーザーのAstraで進める指示。既存Apple分割TIFF writerを原本/保存Recipe/画面へ明示的に接続する。B0倍1456×2060mm/300dpi、通常補間は明示同意、原本保持、未対応効果は明示拒否。Web全効果がAppleへ移植済みとしない。既存描画を再利用し二重実装/二重補正を避ける。実写真試験/メーカー申請/AI/HDRには進まない。

## 2026-10-09 Proxy残件のみの仕上げ

ユーザー指定で他のクラウド系は次回へ。保存済み写真/Recipeと実Node認証が一致する場合だけ、利用者の明示操作でProxyを送信するUI/hostを追加。操作IDと整合情報を端末に保持し、写真/Recipe/認証変更時は中断。既存原本・Cloud Safeを書き換えず、匿名previewでは設定不足を表示する。実写真/自動試験はしない。

## 2026-10-09 個人Lookの多枚数入力

続行: RAW Before＋JPEG/PNG Afterを明示選択する学習モードを追加。通常LibRaw原寸sRGB8現像後の色変換学習でありRAW/CFA学習やカメラprofile復元ではない。原寸8MP以内・同upright寸法必須、halfSize/thumbnail代用や縮小なし。1jobはraw/nonraw混在不可。保存formatにrawを追加し既存nonraw互換を維持。未対応大型RAWは保留条件に従い拒否。

残り続行指示で既存非AI回帰核へJPEG/PNGの1〜200組入力を接続。画像全組保持ではなく1組ずつ解放する逐次集計に変更、各側8MP/ファイル16MiBを維持、200組のみpersonal mode、199組以下はlite。全ペアの権利/位置対応は明示確認、推測で組合せない。RAW対応・局所学習・AIサービスとは分ける。ユーザーの使用量50%停止を維持。

## 2026-10-09 手持ち深度データの接続（ユーザー承認）

通常Web残りの続行として、旧保存済みfaceDecorationsManual（そばかす）をローカル同意対象へ明示追加する。実保存body/SHA/person/neutralportraitを照合し既存核で描画、保存データを無視して完了扱いにしない。新規作成/顔検出/クラウド権限の解禁はしない。

次段: 既存単写真の手/衣服/非AI RAW NRをBrowserLocal一括Finalへ接続。現在写真の認可を流用せず、各選択assetごとに同じ実証runtimeを実行し後段と全件完了時に再照合。Trial/Sitesの未対応経路は拒否を維持。全結果が揃うまで部分ダウンロードを返さない。

深度マスクを手持ち入力で進める明示回答を受領。webDepthRange枝を追加、原本SHA/Asset/source寸法で束縛、幾何前の局所basic補正へ適用。深度グリッドは最大65536点、全体upright・near0/far1・validity必須、最大2MiB入力JSON。写真固有なのでBatch全Recipeコピーと可搬Presetから除外。AI/クラウドを装わず、編集保存後も同じ深度を使用。テストは行わない。

## 2026-10-09 ローカル旧4メイク同意方式（ユーザー承認）

実BrowserLocalの同一写真SHAと保存済み人物ID/手動領域だけを対象とするメモリ内同意を追加。写真変更・取消・再読込で再同意、外部送信や顔モデル推論はしない。Trial principal/tenant、Cloud Safe、本番SDK承認は偽装/変更しない。元履歴の4手動枝を実原本上に描画し、非中立portrait補正は本来の承認がないまま実行しない。比較/復元後の現在色編集とHEAD CASは保持。画像試験はユーザー担当。

## 2026-10-09 通常RAWの非AIノイズ除去

既存実linear RGB16 decoderとclassical denoiseを再利用し、原寸で除去後にsRGB8変換する。Previewも原寸処理後縮小、Finalと同じ半径/sigma。24MP以下/既存work上限を維持し、大判/HDR/AIモデルは対象外。BrowserLocalの実原本SHAとrecipeを前後確認、原本変更なし。新webRawDenoise枝は明示consume後のみ通常renderから外す。未対応専用人物/影との混在は黙って無視しない。

## 2026-10-09 BrowserLocal手・衣服旧版の通常描画

過去履歴中の専用document完全一致を実際に再照合し、既存手/衣服補正を通常Preview/Finalへ適用する。履歴全体を現在Recipeへすり替えず現在の色編集を保持。Saveは実HEAD CASのまま。原本証拠・履歴再照合を省かず、新規の偽専用documentや混在を拒否。Batchは写真固有修復のコピー・消去を拒否する。

## 2026-10-09 コピー元不要の小領域修復

既存repairRegionを明示手塗りの欠陥/参照domainで接続。生成AIではなく近傍色の拡散であり質感生成はしない。実frame24MP以下、処理ROI1MP以下、既存16M反復予算を維持。参照境界未到達は拒否し旧編集を保持。新Recipe枝webManualSpotをstrict保存し、source座標処理後に既存変形を適用。写真試験はユーザー、配備用buildのみ実行。

## 2026-10-09 レンズ幾何と旧履歴の残接続

BrowserLocal旧衣服スポット保存版比較を追加。実原本8MP以下を既存専用Workerで補正してからProxy化し、矩形不一致を無断修正しない。実履歴/原本SHA照合は手補正比較と共通化。復元・通常Save権限や人物/影混在の順序は変更しない。

周辺減光のみの既存SUITE校正profileに歪曲/色収差補正を追加する。実描画と同じ座標式をbrushでも使用し、Liquify→レンズ幾何→sceneGeometry→cropの順で合成する。色収差は色別サンプリングで主座標はgreen、透明余白へはブラシ入力しない。逆写像の非一意/発散を拒否し無断clampしない。旧設定省略時は従来どおり。自動Cropは保存Cropを無断変更しない。旧履歴は実際の認証/版証拠を維持し、ダミー権限を作らない。

## 2026-10-09 手動評価を選別表示へ接続

並列: 手動ゆがみの既存契約にある横のみ/縦のみ拡縮と部分復元をUIへ追加。新変形アルゴリズムではなく既存source座標・認証・保存経路を使う。restoreはその領域で先行する変位を原位置へ近づけるもので画像修復ではない。

保存済み手動評価とflagを一覧の表示絞込/並替に使う。未保存draft評価は対象外。隠れた写真の選択は無断解除せず件数を明示し、明示の解除操作を用意する。提案の自動承認や写真削除はしない。解析/保存ロジックを複製しない。

## 2026-10-09 ローカルLUTの局所適用

W01の残りである局所LUTを実装する。既存local-lut profile/資産SHA検証を再利用し、新localLUTMask枝に元画像基準の手塗り範囲/反転を保存。既存LUT強度は一度だけ適用し、範囲外はLUT直前の色を保つ。mask単独でprofileがないRecipeは拒否し、LUT解除/通常Preset適用時にはmaskも同一commitで解除。写真固有maskを可搬Presetへ混ぜない。変形は後段なのでsource canvasで範囲編集し既存Liquifyと競合させない。AI/大判は対象外。

## 2026-10-09 手動形状変形の実装開始

中央接続を実装: webManualLiquifyを厳格Recipe枝・Session明示適用/rollback・保存概要へ追加。全source系補正とBW後、sceneGeometry前に実行し、crop/vignette/canvasExpand後も実変位fieldをPreviewへ維持する。encodeにはfieldを渡さず余計なWorker複製を避ける。fieldはRecipeに保存しない。pixel centerは normalized*size-.5 と (index+.5)/size で双方一致。現段階は実装中で、最終配備結果はHANDOFFに別記する。

既存変位核を再利用し、実適用fieldをPreviewに添付。双方向座標は同fieldから算出し、折返し/不安定逆写像は変形の適用自体を拒否して旧編集を保持。ブラシは元座標保存を維持し、変形された範囲をAfter表示へ投影する。既存8MP変位上限/128操作/128M予算は維持し大判化しない。コードとbuild/反映を区別、実画像試験なし。

## 2026-10-09 形状変形の必須完了条件（ユーザー追加）

手動Liquifyは既存ブラシの座標整合を残して完成としない。描画に実使用した変位とAfter→元座標、保存maskの投影、元座標→After表示を同一契約で扱う。ブラシ中心点だけでなく半径・線の補間・輪郭まで一致させる。Crop/回転/Canvas拡張/sceneGeometryとの合成、保存/Undo/再読込の一致も含む。旧After入力を一律無効化して完了扱いする案は不採用。折返し・多値対応を黙って最近傍で処理しない。現時点では未実装、完了件数に含めない。

## 2026-10-09 通常Web残り並列

追加: 通常可搬token上限を変えず別LUT同梱設定JSONを導入。32MiB CUBEをSHA/長さ/parse検証、権利確認した手持ち資産のみ。Recipeに本文を入れない。IDB保存後単一Recipe commit、失敗時Recipe rollbackし未参照資産は削除しない。クラウド配布や作者認証を主張しない。

追加: 単色背景の照明むら/バンディングを手塗りmaskへ接続。refineSolidSceneの全体平均は保持、blurのみhalo付きtileで浮動小数配列の全画面確保を避ける。AI背景生成や素材差替ではない。24MPと既存予算を維持。

周辺減光だけの経路は不要な座標正規化往復で画像端を範囲外にしないよう、歪曲0/色収差0なら既存レンズ核のsampling座標を整数x,yへ固定する。

追加: 選別の手動評価を端末内IndexedDBへAssetID+SHAで保存。明示した評価だけ保存、提案は未確定のまま。Cloud評価API/共有認証は迂回しない。写真切替/削除/SHA変更時は別物として扱う。原本を削除しない。

追加接続: 衣服しわ手塗りwebManualClothing（strokes/dewrinkle/fineWrinkles/coarseWrinkles/radius）。既存applyClothingAdjustments再利用、blemishes/edgeSmoothing無効。24MPと近傍haloを維持、AI検出ではない。

契約詳細: 可搬Presetにoptional personalLook係数追加、欠落時既存維持/存在時同一commitで適用。local LUT asset配布と公開共有の認証は別。レンズは非線形変形のブラシ座標対応が残るため、まずinline SUITE校正profileによる周辺減光のみwebLensShadingとして接続（歪曲/色収差0、crop false固定）。手動歯はwebManualTeeth一般手塗り枝、旧teethManualの認可wrapperは変更しない。

ユーザー指示でAI/テザー/Xcode/HDR/大判出力を除外し人物・設定可搬化・レンズ補正の残りを分担。既存kernelと保存を再利用、認証/本人許可を捏造しない。外部校正資産/認証等が不足する部分は完了と数えず個別記録。共有契約はMainで統合し完成部分からPreview反映。週次50%で停止、操作試験はユーザー側。

## 2026-10-09 手動白髪補正

manualHairにoptional grayStrokesとblackenを一組で追加（省略は無効）。髪範囲と白髪範囲を個別手塗りし既存recolorPortraitHair grayMask/blackenを利用。白髪の効果は髪範囲との重なりのみ。合計64線4096点96M予算、24MP、旧保存互換を保持。自動検出/同意認定なし。試験なし、ビルド後Preview反映。

## 2026-10-09 手動髪なめらかさ

既存recolorPortraitHairのsmoothをWeb手塗り経路へ接続。manualHairにoptional smooth 0..100（省略0）を追加、旧保存互換を維持。近傍処理のためtile周囲を含めて読み中心だけ戻す。24MP/brush予算/認可/保存を維持。自動検出・黒髪化・形状変更は対象外。機能試験なし、ビルドとPreview配備。

## 2026-10-09 手動クローン24MP

手動クローン専用入口だけ実処理24MPまで拡張。従来region処理の8MP既定は保持。境界色平均とコピー元は画像全体で固定し、タイルごとの色差を作らない。Proxyは原本画素数だけで拒否しない。正規化位置と既存保存形式を維持し、大判Final対応とは区別する。試験なし、ビルド後Previewへ反映。

## 2026-10-09 マスク複製・有効切替

v2layerにoptional enabled:booleanを追加、省略時trueで旧保存互換。無効layerも保存と構造上限に含めるが描画/brush予算消費はスキップする。全無効は入力コピーを返す。UIは選択layer複製（新UUID、深いコピー、既存8layer/32選択/64線4096点上限）と有効checkbox。無効でも範囲編集・表示でき、適用後の効果だけ無効。保存版概要にも有効/無効を表示。原本/履歴を削除しない。試験なし。

## 2026-10-09 名前付き複数マスク

colorRangeLevelsにv2={schemaVersion:2,engineVersion:'suite-color-range-levels-2',layers:[{id,name,settings:v1}]}を追加。最大8レイヤー、色選択合計32、brush合計64線4096点96M。全レイヤーの選択元は同じ未編集source、調整は順次適用。既存v1処理を再利用しv1保存互換、明示適用まで変換しない。UIは追加/名前/順序/削除/選択レイヤー編集とmask表示。全解除は専用操作。中央Recipe枝は同じ、試験なし。

## 2026-10-09 保存版補正概要の表示

新しいmanualMakeup/Skin/Eyes/Hair/RedEye/Clone/colorRangeLevels/personalLookは既存共通比較/復元を通る。追加は表示専用の概要だけとする。認可取得済本文からversionSummaries={revision,bodySHA256,labels}を一時生成し、名前付き版はrevision/SHA双方一致時のみ表示。比較キャプションにも補正概要を示す。設定0は設定ありとして表示し、品質や検出成功を意味しない。履歴や原本を変更しない。取得不可/失敗/選択変更時に古い表示を残さない。試験なし。

## 2026-10-09 目の明るさ・白目・瞳彩度

manualEyes={schemaVersion:1,engineVersion:'suite-manual-eyes-1',brushVersion,regions:{eye:{strokes,amount},sclera:{strokes,amount},iris:{strokes,amount}}}をoptional Recipe枝へ追加。regionsは1..3の既知キーのみ、各amount0..100。手塗り各領域を別保存、全体64線4096点96M、実frame24MP。既存enhancePortraitEyesのoverall/whites/colorEnhancementへ各maskを渡して同時適用、赤目/形状/自動検出は追加しない。512tileの画素独立処理、入力/alpha/metadata保持。UIは領域切替/塗消す/強度/確認/明示適用/解除。既存人物認可は変更しない。試験なし、完成分build/配備。

## 2026-10-09 手動髪補正と個人Look管理

手塗り範囲に既存recolorPortraitHairの色/濃度/つやのみを接続する。smooth/blackenは0固定で自動領域や白髪判定を追加しない。manualHair厳密optional枝、64線4096点96M、24MP実frameを小tileで処理し原本/alphaを保持。個人Lookの係数複製は新UUID、削除は選択名と確認を表示して明示実行。写真/現在Recipe/他Lookは削除しない。既存50件上限維持、試験なし。

## 2026-10-09 手動赤目とマスク局所色補正

赤目はmanualRedEye optional枝で手塗り虹彩範囲と強度を保存し、既存enhancePortraitEyesの赤過剰低減のみ再利用。顔ID/自動検出を偽装せず既存同意gateも変更しない。24MP実frameを小tileで処理し元画像/alpha/metadataを保持。maskは64線4096点96M上限。色範囲枝にはoptional basic={exposure,contrast,saturation}を追加（±4EV/±100/±100）。局所Levels後に同じmaskで既存basic核を適用。全0/省略は従来経路。現像後sRGB補正でRAW復元ではない。保存/Undo/共通Preview/Finalへ接続する。試験なし。

## 2026-10-09 個人Look Liteの複数ペア入力

既存trainPersonalizedLookの複数pair学習をUI/Workerへ接続する。明示対応した1..4組、各組に権利/位置一致同意、組内同寸法。各画像8MP/16MiB、全組before合計8MP（両側16MP）をdecode前に制限。写真を送信/保存せず既存係数形式を維持。200組Personal/RAW学習やAI追加を意味しない。試験なし、公開用build/配備のみ。

## 2026-10-09 次単位：範囲別の肌補正とマスク境界

肌補正を最大8名前付きlayerへ拡張し、旧v1は変更せず受理する。各layerは既存肌処理の保存値/brushを持ち、順に適用する。全体64stroke/4096点/96M brush作業量を共有し、実frame24MPとtile核を維持。UI上で複数人物等の範囲を手動で分けるもので、自動人物識別ではない。既存Recipeは明示適用までv2へ変換しない。

色/輝度maskの全合成後にoptional refinement={expand,contract,smooth,feather}を追加する。各原寸整数0..64px、Proxy時は原寸短辺比で換算。既存refinePortraitMaskを半径合計のhalo付き小tileで再利用し、8MP核制限は変更せず実frame24MPに接続する。透明画素除外、旧省略値の従来挙動を維持。試験/実験なし、build/配備のみ。

## 2026-10-09 次の人物/マスク/Look操作

次単位は肌補正の既存非AI質感/色仕上げ制御、色範囲maskへの線形/円形グラデーション、個人Lookのローカル退避/取込。旧保存値は中立値で互換維持する。グラデーションは全frameの座標系で計算しstripの横長1行座標へ誤投影しない。Look退避は係数のみ明示ダウンロード/明示取込、学習写真は含めず外部送信しない。人物ID/認可gate・原本・AI/Apple/テザーは変更しない。試験・実験なし、配備に必要なbuildのみ。

## 人物補正優先の次段階

メイクv2は最大8名前付きlayer、全体64stroke/4096点/96M brush work。v1は元のまま受理、UI読込で勝手に保存変換しない。applyManualMakeupが旧色合成を順番に使う。既存ブラシ描画へ任意の共有作業予算を追加し、未指定callerの挙動は保持する。

肌補正manualSkinはschemaVersion1/engineVersion suite-manual-skin-1/brushVersion/strokes/smoothness0..100/textureとrosy各-100..100/radius原寸整数1..32。既存retouchPortraitSkinのsoften/texture/rosyだけ使用し他は中立固定。フルframeのmaskを1回作り、近傍半径4倍halo付き小tileで既存8MP核を再利用することで実frame24MPの通常上限に整合させる。核の8MP制限は変更しない。Proxy半径は原寸比率で整数換算、画素一致は保証しない。クローン後・手塗り色前に適用する。

ユーザーは人物/メイク・マスク・個人Lookを最重要と指定し、サイドエージェント並列を再指示。AI/Apple/テザーを除外し、既存処理核へ手動肌補正、色/輝度maskへのブラシ合成、手塗りメイク複数レイヤーを接続する。旧Recipeの挙動を維持、写真を送信せず原本を変更しない。各契約は下記追記してから実装。build/配備と公開応答のみ、機能実験は未実施のまま。

色範囲のoptional brush={brushVersion,operation:add/subtract/intersect,strokes}は全フレーム正規化brushを1回描画し、stripへ切り出して色/輝度maskの後で合成。既存64stroke/4096点/24MP/作業量制限とalpha除外を維持。省略した旧Recipeは変化なし。

## 優先分野の次単位：手動クローン修復・輝度範囲

共通描画のprovenance順序記録にも新4枝を列挙する。実処理順を変えず、個人Lookはpre-global、色範囲/クローン/手塗りはpre-geometryに記録。単独localLevelsの記録漏れも同じ組立で解消する。

既存の非AI手動クローン修復核を匿名ローカルWebの明示操作へ接続する。顔自動検出・人物ID/同意gateを偽装しない。manualClone枝に正規化stroke/コピー元差分/濃度/修復方式を保存し、原本は変更しない。8MP既存核の上限を黙って上げず、明示制限として保持する。色範囲maskはoptional luminance条件を追加し、旧Recipe無変更で交差する。HSL明度と表示RGB加重輝度は区別。機能実験なし、完成単位で配備。

## Web非AI優先3分野・完了順の配備

配備応答で個人Look Workerの404を確認。生成物の追加だけでなく既存publicAssetPathの厳密allowlistへ当該1パスを追加する。認証APIや私有blobの公開範囲は変更しない。

統合build修正: manual-makeup-brush/color-range-levelsの例外helperをnever戻り値の関数宣言に変更し、TypeScriptの型絞込みを成立させる。入力検証条件・実行時挙動は変更しない。

第一段階の共通契約: extendedParametersにmanualMakeup（手動ブラシ着色、検出人物ID/Trial承認を偽造しない）、colorRangeLevels（未編集入力からHSL選択しLevels適用）、personalLook（端末内paired polynomial色学習の係数と強度）を独立optional枝で接続する。各枝は専用厳密validatorを使用し、旧Recipeは無変更。手動メイク/色範囲は幾何前、個人Lookは通常色調整前に適用してProxy/Finalで同じ保存値を使う。外部AIも写真送信もなし。各機能の画面に実際の範囲/制約を明記し、処理できない設定を黙って落とさない。まず既存Preset可搬化には含めず明示拒否を維持し、保存/Undo/再読込を優先する。

ユーザーが人物/メイク補正、マスク、個人Lookの先行と、できた順のデプロイを明示。AI/Apple/テザーは除外。既存手動処理/学習核を調べて差分を接続し、原本/権限/写真固有binding/人物同意のgateを迂回しない。配備は現在と同じ匿名ローカルプレビュー構成、必要buildと反映確認のみ。AIモデル導入やSDK接続、新DB/有料契約は行わない。

## ユーザー操作確認用の一回配備

Cloudflare bundleもfaces→rawのSHA256 import経由でLibRawを解決しようとした。既存SHA256関数を依存なしの共通moduleへ抽出しrawから再export、facesだけimport先を変更。計算内容は同一、AI機能の有効化なし。サーバーへNode module shimを配備しない。

Web bundleでLibRawのNode専用動的module importが解決不能になったため、既存processing-worker buildと同じexternal指定をapp/QAのESM bundleにも適用する。ブラウザをNode targetへ変更せず、RAW libraryの環境分岐を保持する。

現在公開中version d03dbd49-0bf1-4e04-9b94-04abed67b57bはASSETSとorigin変数のみ。したがってwrangler.preview.jsoncを使い、runtime構成のD1/R2を今回追加しない。最初のbuildで既存2ファイルの型エラーを検出。例外helperのnever型を制御フローに認識させる宣言とpath要素stringガードだけ修正し、検証を弱めない。

ユーザーの「1回デプロイして・こっちで触ってみる」により今回のみ既存Cloudflareプレビューへbuild/配備を行う。既存binding/認証/保存先を保持し、DB migration・SDK申請・AI選定/追加実装は行わない。必要な生成物buildのみ実施し、機能試験/実画像実験は後工程のまま。大型RAW拡張WASMは未生成なので対応済みとは表示しない。

## Node/Trialの保存済み履歴読取

既に保存する全revisionを既存tenant認可と削除判定の下で読み出すGETを追加する。Sites同様に非branchの版番号昇順・本文binding検証、1000版/16MiB超は切捨てず明示拒否。既存Cookie/Trial入口の認証を維持し、新たな保存や旧版書換えは行わない。Web API clientの明示capabilityとshape検証を追加し、既存名前付き版UIへ接続する。特殊影のSites専用復元をTrial対応と偽らない。ソースのみ、dist/build/配備は後工程。

## 原寸Canvas表示・保存版復元の接続

復元追加: Sitesの実history認可と通常Trial専用の影runtimeは別契約。Sitesでは実過去版のSHA/主体/原本/背景を再取得照合する専用Preview経路を使い、Trialと偽装しない。復元由来のローカルreceiptは未信頼hintのみで、再表示/再起動/保存直前にfresh再認可する。Saveは現在HEADのCASを維持、成功後は実保存版へ切替。復元の失敗時は直前の編集/cacheを復旧。Final制限を解除しない。履歴APIなしの復元ボタンを無効にし、復元済み後の一覧再取得失敗を復元失敗と混同しない。

Canvasは寸法の整数計算と実画像buffer確保を分離する。原寸計画を実装済みFinal書出し能力とは表示せず、既存24MP実処理上限は保持。保存版復元は選択した過去版の本文SHA・Asset・背景・現行HEAD/CASを再確認し、現編集に1Undoとして取り込む。OriginalShadowが異なる過去版を拒否していた箇所は、過去版の認可済原本と設定でPreview準備可能な場合だけ解除する。履歴や現行保存版の自動上書き・原本変更なし。失敗時は現編集を保持。試験/build/配備は後工程。

## RAW寸法拡張の実装コード

機種別公表画素数は公開資料から整理でき、SDK申請待ちにはしない。ただし写真ごとのcrop/向きはdecoderの寸法計画を使う。LibRawの一時decoderで原寸upright形状をunpackせず取得する拡張、RAW内部割当予算設定、dcraw_process後の出力形状取得をrepo所有ソースとして追加。新APIが揃ったWASMのみ24MP超Proxyをhalf-sizeで処理する。source/sensor予算96MP、実出力24MP、入力128MiB、LibRaw RAW割当予算512MiB（総使用メモリ保証ではない）。Finalは24MPのまま。source metadataと実buffer検証を分離、座標は取得原寸を保持し半解像×2で推測しない。旧WASMで対応済みとはしない。WASM再生成・試験・配備はユーザー指定に従い後工程。

## 24MP超RAWのProxy読込

既存LibRaw wrapperのhalf-size出力をProxy専用に検討・接続する。縮小出力が既存24MP実buffer制限以内でもRAW unpackのメモリは別に必要なため、入力寸法/形式/予算を制限する。原寸と向きは取得情報と出力寸法を照合し、縮小画像を原寸Finalと偽らない。Final24MP上限と非対応カメラ条件を明示して維持する。既存影等のmetadata上限拡張はdecode契約確定後に整合させる。

## 白黒縁・影の原寸とProxy上限の分離

通常AddShadow Previewも、target=proxyの時だけ認証済み原本のdecode frameは既存一般上限24MPを使用し、その後8MP以下のProxyへ縮小したことを検証してmask/合成へ渡す。Final/source targetの実処理8MP制限は維持する。縮小前decodeのメモリは既存RAW一般経路と同範囲であり、任意サイズの許可ではない。

原寸metadataだけで8MP超を拒否している箇所を、現一般decode上限24MPと整合させる。mask/合成の実配列は8MP制限を維持し、1600長辺Proxyに正規化座標から描画する。巨大配列の一括許容は行わない。backend保存契約も同範囲へ整合。24MP超RAW decode・原寸影合成・B0倍書出しは今回完成対象ではなく残作業として記録。試験/build/配備なし。

## ローカル分類グループの編集

既存rename-group/delete-groupをUIから呼び、本人scopeとCASを維持する。削除対象はローカル分類グループと所属だけで、Preset本文や写真は変更しない。比較処理とは別担当で並列実装。

## 保存版比較の原本取得対応

ユーザー指示により比較をProxyのみへ限定する方針を解除。白黒縁・影を含む保存版について、既存保存先から原本を読みSHA/本人権限/保存履歴本文を照合して描画する。HEAD専用gateへ過去版を偽装せず、履歴版を明示照合する。原本/履歴/現在編集は変更しない。背景にも独立して権限とSHAを確認する。UIの「原本取得なし」は対応に合わせ訂正する。試験/build/配備は後工程。

## 保存版比較の専用処理

比較で一律拒否している専用設定のうち、既存Proxy描画と検証済み写真bindingを使えるものを接続する。現在Recipe/Preview/historyを変更せず、原本再取得なし。専用資産が必要なものや認証条件を満たさないものは引き続き明示拒否。

## W20 可搬SUITE設定

既存署名なし可搬設定文字列のencode/decodeをUIへ接続。非可搬設定は除去せず拒否。取込は内容表示・明示同意・対象写真/編集不変確認後に既存applyPortablePresetを使用する。公開/作者認定/Cloud保存を意味しない。原本は変更しない。

## W20 ブラウザ限定Preset分類

公開Presetの既存検索へ利用者が明示した分類・グループを接続する。分類核と参照kind/id/versionを再利用し、公式分類・人気度を推測しない。ローカルmetadataのみ保存しRecipe本文/認証情報は保存しない。認証scopeを分離できない場合は共有領域へ保存せず理由を表示。既存全体/部分適用は変更しない。

## W03 ローカル書き出し設定

利用者のローカル保存優先方針に従い、既存Editorの出力設定を端末内で再利用する導線を追加する。別WorkspaceのクラウドPresetとは区別する。設定全体を検証してから反映、実行中の変更拒否、既存Finalが読む設定を再利用。写真Recipeや原本を自動変更しない。試験/build/配備は後工程。

## 保存版のProxy画像比較

同一Assetの保存版2件をfresh履歴/内容SHAで解決し、未編集Proxyから既存共通描画で左右画像を作る。現在Recipe/Undo/Afterを置き換えない。欠損LUTや専用人物/影runtime不足は拒否する。専用比較canvasは写真変更/権限失効/取消で破棄。実行検査ではなくユーザー操作の実装。試験/buildなし。

## 保存済み版の復元

名前付き版のrevision/bodySHAをfresh取得結果へ照合し、Sessionで現在Asset/最新revision/dirty/権限を再確認して過去Recipeを編集draftへ戻す。最新保存revisionを巻戻さず、保存時は既存CASにより新しい版となる。原本/旧版削除なし。復元は明示確認、画像比較は別。写真固有mask bindingと描画前提は既存bind/commit検証を維持。

## 過去Recipe読取

既存保存履歴から権限のある同一Assetの非branch版を取得するread-only APIを追加する。Sites認証をWorkspace認証として流用しない。本文は既存validator/写真bindingを維持して返す。名前付き版はrevision/bodySHAで照合し、失効/削除を取得可能扱いしない。画像比較/復元は別工程であることを表示する。

## XMP色設定取込

既存readLookXMPSubset対応の8設定を既存SUITE controlsへ数値変換。Adobeの描画再現ではなくSUITE処理への設定取込として明示同意を求める。露出は既存±4までで超過拒否、contrast/saturationは1+value/100、他5設定は同名対応。記載のない設定は維持し、対応外XMPは拒否。原XMP再描画は不要、反映値を既存Recipeへ保存。新保存schemaなし。試験/buildなし。

## ガイド幾何補正

sceneGeometryにmode:'guided'を追加、manualのcontrolsとは排他でsourcePoints/destinationPoints各4点の{x,y}0..1を保存。原画像左上基準の正規化対応点で既存guidedSceneTransformを使用し、退化/地平線を拒否。既存setSceneGeometryと共通描画/ブラシへ接続、手動値との混在を認めない。試験/buildなし。

## 手動幾何の基盤

extendedParameters.sceneGeometry={schemaVersion:1,engineVersion:'suite-scene-geometry-1',mode:'manual',controls:{angle,flipX,flipY,aspect,scale,x,y,vertical,horizontal}}を新規契約とする。controls全キー必須、既存sceneTransformMatrix範囲を使用、frameAspectは原本寸法から導出。人物/保存mask後、90度回転Crop前を予定。ブラシ逆写像を共通化し、Web通常24MPまでを行単位中断可能なwarpで扱う。B0倍300dpiの分割大判出力とは別。Preset配布は既存拒否維持。Apple描画未対応。接続前の基盤追加でありUI完成と数えない。

## 一括参照色合わせ

明示選択した保存済み2..20写真に、同一ローカル参照の色統計から写真別にsceneMatchを推定。既存編集を保持して当該設定のみCAS保存。最新Asset/SHA/revision/権限/dirtyを確認し、欠損Proxyは取得せず失敗とする。取消や競合は保存済み結果を残し、応答不明を成功件数へ入れない。原子的な全件保存ではないことをUI明示。

## 色合わせの推定領域

原Proxyと参照画像に正規化矩形{x,y,width,height}を指定し、既存estimateSceneMatchのsourceMask/referenceMaskへ変換する。推定範囲だけを変更し、保存固定変換は従来sceneMatchのまま全体に適用。局所補正と混同しない表示にする。新保存契約なし。

## 参照色合わせの固定変換

既存色統計からscale/offsetを推定する処理と適用処理を分離して再利用。color.sceneMatch={scale:[3値0.5..2],offset:[3値-2..1],amount:0..1}を保存。原Proxyに対して算出した変換を原Proxy/原本の最初に一度適用し、その後既存調整へ進む。参照画像そのものをRecipeやクラウドへ保存しない。全体色分布の近似であり学習AIではない。領域mask/シリーズ一括は別工程。試験/buildなし。

## ローカルLUT保存

ユーザー指定によりCUBE本体は端末内IndexedDBへ保存。profile={kind:'local-lut',intensity:0..1,lutRef:{sha256:小文字64hex,byteLength:1..33554432}}のみRecipeに保存。取込時と再読込時にSHA/UTF8/CUBEを検証、永続化完了前に適用しない。Preview/Final双方で解決し欠損は再取込要求、無加工成功にしない。公開Preset可搬化は依存配布未実装のため明示拒否。クラウド同期/新APIは作らない。ブラウザ保存はoriginごと、削除/容量不足の可能性をUI明示。

## 輝度カーブ

color.lumaCurveに2..16点の{x,y}を保存。整数0..255、x厳密昇順、端点x=0/255を必須とする。既存applyExtendedCurvesへtonalBandsと一度だけ渡し、RGB/masterと区別する。旧3帯域競合は従来tonalBandsにのみ適用。保存/Preset/Preview/Finalを同契約へ揃える。試験/buildなし。

## WB自動・灰色点

color.whiteBalance={gains:[r,g,b],domain:'linear-rec709',method:'auto'|'selector'}を追加。各gainは既存核の0.25..4。illuminantとは排他。原本Proxyから推定した固定値を保存しPreview/Finalで共有、Finalで再推定しない。灰色点は未編集Before座標。推定結果は写真/版へ束縛して古い提案を拒否。RAW camera WBやAIモデル推定とは区別する。

## WB照明プリセット

color.illuminantにdaylight/cloudy/shade/tungsten/fluorescent/flashの固定照明名を保存。既存WB推定核の固定ゲインをprofile前に適用。temperature/tintは後段の手動微調整として保持。RAW camera WBでない。auto/selector未接続。

## Sites原本保存記録表示

認証済みSitesで既存listAssetsのサーバー返却記録を明示再取得するUI。cloudSafe返却値を表示するだけで新しい保存保証や契約容量を判定しない。ローカル/別Workspace bearer経路を混同せず、権限失効や失敗時は成功表示を残さない。

## 色調整のPreset保存整合

新しい写真非依存color5枝をportablePresetRecipeへ明示追加。未知キーや写真固有情報を許可する緩和はしない。grading/pointColor/tonalBands/profile/sceneBasicの保存範囲と旧3帯域競合条件をRecipe validatorと整合させる。

## 公開Preset検索

既存listPresetsの取得済み一覧へ名前検索を追加しselectPresetCatalogを再利用。保存schema/公開状態/適用範囲/認可は変更しない。未取得と検索0件を区別。

## 画像上カーブ接続

既存adjustCurveOnImageとsetPointCurveを再利用しAfter上の標本値からRGB/チャンネルカーブへ明示適用。既存保存32点は維持し、この操作の16点上限で切捨てない。HSL採色とのモード排他イベントを追加。検査/buildなし。

## HSL画像採色

現在のAfterプレビュー上の採色を既存sampleHSLSelectorに渡す。隣接HSL色帯を既存adjustHSLSelectionで一括更新し1Undoとする。採色時Asset/SHA/Recipe/preview URLを保持し変更後の古い選択を拒否。新保存項目なし。

## Brightness/Dehaze接続

color.sceneBasic={brightness,dehaze}（各-100..100）を保存。既存applySceneBasicをprofile後/他の色調整前へ接続しExposureとは別操作を維持。ゼロ/旧Recipeは不変。追加AIモデル不要。

## 標準・白黒Profile接続

color.profile={kind:'standard'|'black-and-white',intensity:0..1}を保存し既存applyColorProfileをpostDecode色調整前に一度適用する。LUT/RAWカメラprofile/ICCは今回の接続に含めない。旧Recipeは不変、原本不変。

## 制限調整：ポイントカラーFinal

8MPはポイントカラー核一回の作業容量として残し、通常rendererからは小さい行stripで呼ぶ。全体は既存共通24MP/入力byte制限を維持し、ポイントカラー固有8MPによるFinal拒否を解消する。画素ごと独立の計算なのでぼかし等の境界halo不要。B0倍判300dpiの大判は別の分割出力経路であり、Webの単一巨大buffer上限を無制限化しない。

## Web4帯域カーブ接続

color.tonalBands={shadows,darks,lights,highlights}各-100..100を追加。既存applyExtendedCurvesをpointCurves後にtonalBandsだけで呼ぶ（RGBカーブを二重に渡さない）。旧toneCurve非ゼロと新tonalBands非ゼロの共存は保存時拒否し、自動変換や既存値削除はしない。UIで旧カーブのリセットを案内。検査/buildなし。

## Webポイントカラー接続

color.pointColor={selections,amount}を保存し、既存lr-point-colorをカーブ前に適用。色相/彩度/明度の選択範囲を明示入力するUIを追加。原Proxy採色やmask可視化は今回含めない。既存8MP処理上限を維持し、超過は拒否。旧Recipeは不変。

## Web Color Grading接続

postDecodeAdjustments.color.gradingに既存lr-color-gradingのglobal/shadows/midtones/highlightsのH/S/L、blending/balance/amountを保存。strict validatorと通常Preview/Final共通描画へ接続。新stageや旧Recipeの意味変更なし。Preset側の未対応契約は勝手に緩和しない。

## 2026-10-08 Web25項目接続開始

ユーザー承認によりWebのRecipe/Worker/Preview/Final/画面を接続する。新調整は版付き厳格契約で保持し旧Recipeは不変。共通ファイルは排他、モデル待ちは実行成功扱いしない。原本不変・保存済版・認可を維持。名前付き版は既存履歴参照、生成は採用結果固定を原則とし実保存APIが不足なら不足を明記。検査/build/配備なし。

## 2026-10-08 テザーコード作成

続行: 原本を二重取込しないためPhotoPipelineに保存済AssetのSHAを照合し既存decode/downscaleを使うProxy生成入口を追加する。Look queueのJSON保存は独立actorで原子的に永続化しUIに接続しない。検査/buildなし。

既存CameraProviderはinterfaceのみのため、Apple公開ImageCaptureCoreの実transportを独立追加する。日本メーカーを対象軸とするが機種×firmware×OS×有線/無線×機能の実証なしにSupportedを付けない。Import-onlyと撮影中自動転送とremote shutterを分離。無線未搭載を有線非対応と同一視しない。受信はカメラ削除なし、固有保存先とSHA・永続queue、再接続は再列挙/重複照合。SessionLookは既存binding/再解析planを再利用。アプリ・Xcode接続/試験は後段。各vendor SDK/無線protocolが未提供ならその部分は未実装と記録する。

## 2026-10-08 Lightroom比較14件 採用

RAW NRは既存LibRaw実入出力を再利用し通常sRGB NRと分離。AIモデル対応は固定SHA・具体的RAW/線形RGB入出力に限定し、weights未提供を隠さない。名前付き版は既存Workspace権限/保存履歴を参照する独立SQL serviceを追加し明示初期化のみ、現行schema/HTTPを自動変更しない。

共通側Lens Correctionも不足を実装する。SUITE明示profileの中心/半径正規化・出力→入力radial/tangential係数、RGB別倍率、線形光量補正を用い、他社LCP/DCPを無変換で同一視しない。profileは実機校正値をhostが提供し、機種名の曖昧一致で勝手選択しない。透明境界と最大有効矩形を返す独立処理とし既存Cropを変更しない。

3件は既存処理を再利用、7件はEvoto比較と共通化、4件は不足コードを独立追加。Autoは手動設定を勝手に上書きせず提案と適用量/リセットを分離。Point Colorと色range maskは標本HSL範囲核を共用。深度rangeはLens Blur不採用と独立した局所選択機能として残す。名前付きversionは原本/Recipe複製でなく保存済み版の参照とする。Gradingは既存3帯補助からGlobal/Blending/Balanceを共通核へ追加。検査/実験/build/UI接続/公開配備はしない。Adobe完全互換と表示しない。

## 2026-10-08 残7件コード続行

Preset分類の端末間同期と明示共有tokenは既存サーバに契約がないため、独立追加サービスのコードとして定義する。既存WorkspaceServiceのfresh権限・Preset参照を再利用し、scope/owner、版CAS、期限/失効、ハッシュtoken保存を必須にする。新しい保存契約は接続時に明示初期化が必要。既存DBへの実行やHTTP公開は今回しない。公開Community/マーケットは対象外。

既存大判TIFF/出力queue/XMP subsetを再利用し不足の処理を独立moduleへ追加。Apple大判はOSの画像領域描画/色管理を利用し全量巨大Canvasは作らない。Web XMPは仕様が確認できる設定のみ変換し未知のAdobe私有現像は黙示再現しない。queue実行器はhostの認可済みrender/deliveryを順序実行し、receiptのない完了を作らない。既存UI/Recipe/schemaは変更せず接続は後段。

## 2026-10-08 差分66 CUBE・native保存先追補

CUBEは既存3D shapeを維持し、1Dと1D→3D複合を追加。段別INPUT_RANGEを保持し、曖昧なDOMAIN混在は推測しない。OWNERSHIPへの担当記録後に実装されたが、この詳細通知追記は返却後となった。既存呼出し側・UIは変更なし。native保存先は独立Delta66ExportDestinations.swiftで既存PhotoPipelineを再利用し、Photos追加権限とFilesの明示選択先への実保存を実装。App/Info.plist/選択UI接続はしない。共有/プリセットは既存server契約の再利用に限定し、新schema/routeを勝手に増やさない。

TIFF日時追補: delta66-workflow-metadataの既存SHA-bound capture evidence読取を再利用し、独立TIFF stream writerへ最小日時tagのみ追加。GPS等の全Exifコピーはしない。raw元画像は不変、sink確定前に正しい絶対offsetを確定する。既存呼出しは日時指定なしで維持。

## 2026-10-08 原本metadataと顔処理Proxyの上限分離

既存nose-reshapeは原本寸法積をsafe integerで確認し、実bufferのみ8MPに制限している。同じ顔経路のface-feature-adapterとmakeup-highlight-landmark-maskは原本寸法自体を8MP制限していたため、両者も同じ分離へ揃える。adapterには複製/解析前の実buffer8MP制限を明示し、メモリ上限は広げない。source/proxy比率・SHA/人物・認可照合は変更しない。大判Finalのtile処理対応を意味せず、検査/実験は未実施。

## 2026-10-08 差分66・独立TIFF strip writer

既存RGBA8全量encoderを変更せず、新規delta66-tiff-stream.mjsに非圧縮classic TIFF strip出力を追加する。8bitはUint8、16bitはUint16の実sample入力を保持。sinkへの逐次writeと完了/abortを分離し、全量Canvas/Blobを作らない。ICCは既に色変換されたsampleのprofileを埋め込むだけで、ICC変換自体を偽装しない。4GiB境界超はBigTIFF未対応として拒否。原本decoder・画像処理・OS接続は別段階。検査/実験/buildなし。

同writerへ可逆PackBitsを追加。圧縮後のstrip位置/長さは動的なためseek可能な一時sinkだけ許可し、最終headerを書戻してからcloseする。非圧縮のsequential sink能力は維持。既存encoder/呼出し側は変更しない。

## 2026-10-08 Astra単独17件コードの追加契約

ユーザーの「スタート」によりAstra17件をコードのみ実装。既存UI・Recipe・保存・認証・課金・公開契約を変更せず、独立した `processing/astra-*.mjs` に機能処理を置く。Face/region/modelの混合16件共通核を読取り再利用する。生成モデルは用途別task、SHA固定重み、モデルIO名・範囲・条件値を明示して実推論する。重みや学習品質がないのに生成品質達成とはしない。出力は非破壊の候補/派生frameであり勝手に保存しない。

HDRは既存linear Rec709 Float32を維持し、scene-linear最適化とRadiance RGBE入出力を追加する。HEIF/AVIF/カメラRAW codecやHDR表示機器は今回実装済みとしない。顔認識は提供されたgalleryへの照合のみで、実人物の身元を推測・外部検索しない。検査・実験・build・配備はユーザー指定により実施しない。

## 2026-10-08 混合16件・コード先行の独立処理契約

ユーザーは16件のコードのみを要求し、試験・実験・アプリ接続は後段とした。既存Recipe/保存/認証/公開契約は変更しない。詳細顔landmark抽出を`faces.mjs`へ追加し、既存`detectPeople`の返却形式は維持する。既存manual Blush/Contactsから純粋な色算術のみ共用し、manual認可・出典Gateは変更しない。新しい自動処理は独立APIであり、既存manual由来を偽装しない。

モデル依存は呼出しstubではなく、MediaPipeの実推論／ONNXの実session.runを行うadapterを実装する。学習済み重み、ライセンス、モデル入力出力名・範囲、ORT runtimeは別途hostが提供する実行資産。資産がないのに実行済みと報告しない。メイクstyleと補正式はSUITE独自であり他社内部式・素材の複製ではない。人の遮蔽や歯・衣服等の完全な意味認識も保証しない。

Levels追加はportable文書の符号化・復号・版固定mergeのみ。Community公開サービスは新設せず既存拒否Gateを維持する。Batch People Removalは別生成候補を返し、Original上書き・保存・送信・課金は行わない。

## 2026-10-05 Face Decorations実登録Asset直接保存Gate（実装前）

Cは手動そばかす点描のtyped Recipe/Preset写真固有拒否を新6/6・メイン独立6/6・buildで返却。次は`apps/backend/src/workspace.ts` Node直接saveRecipeのFace Decorations限定節、`repository.ts` Trial直接saveRecipeの限定節と新規JWT/Trial HTTP SQLite専用試験だけを排他所有する。実actor/tenant登録非trash Asset ID/SHA/edit/保存版CAS/履歴読戻しを照合し、別Asset/SHA/削除/Viewer/失効/競合拒否。自称person/顔位置/原寸は認可/画像証拠でなく、Worker/UI/Final/Cloud別Gate。B Nose純粋/A Eyeshadow host/メインdocs別、0/44。

## 2026-10-05 Face Decorations監査現状文言の追随（実装前）

監査作成後にSUITE限定の純粋点描とtyped文書/Preset拒否が追加された。製品の安全な契約は変更せず、メインは`docs/FACE_DECORATIONS_COMPLETION_AUDIT.md`冒頭に後続状態を追補し、旧読取り表を履歴として区別する。公式6素材/製品UI/Final未実装は維持。CのBackend、B/Aの別ファイルと排他、0/44。

## 2026-10-05 Nose本人明示水平移動の限定純粋核（実装前）

BはEV3-0185公式6操作の差分監査を新5/5・メイン独立関連10/10で返却。次は新規`apps/web/src/processing/manual-nose-horizontal.mjs`と新規専用試験のみ排他所有し、本人が明示した小さな鼻ROIのSUITE独自・左右水平変位を決定的RGBA8へ適用する。出典Asset/SHA/person/保存版/原寸/source・1600px Proxy、ROI・有限変位/負荷上限/Abort、対象外/alpha/透明hidden RGB/入力不変を検証。callerが書いた鼻ROIや人物IDは解剖位置/本人権限の証明でない。公式6操作/画素式の再現と表示せず、他の5操作、Recipe/UI/Worker/Final/Cloudは未接続。A Eyeshadow host/C Face Decorations Backend/メインdocs別、0/44。

## 2026-10-05 Eyeshadow本人明示Trial保存host限定（実装前）

Aは保存typed三役stroke→Worker実RGBA限定経路を新6/6・メイン独立関連19/19・buildで返却。次は新規`apps/web/src/manual-eyeshadow-trial-host.mjs`と新規実Trial HTTP/SQLite専用試験のみ排他所有する。EditorSession/TrialClientのfresh本人/tenant/登録Asset/SHA/edit/保存版、Original bytes digest・host内Worker LibRaw decode原寸・CAS/readbackをGate。現Trial人物privacy不足なら成功を捏造せず拒否、Node synthetic-onlyは明示的mechanics証拠と分離。自称眼位置/本人や注入decoderは認証でなく、製品Editor/Final/実RAW/Cloudは別。B Nose監査/C Face Decorations Backend/メインdocsと別、0/44。

## 2026-10-05 EV3-0185 Nose差分監査（実装前）

BはHead Poseの一次資料監査を新5/5・メイン独立関連9/9で返却。公式Desktop/iPadの三方向値域とMobile未確定、SUITE全写真Rotateと顔姿勢の非同一性を確認し、幾何/生成式・privacy不明のためHead Pose実装完了としない。次は別独立候補EV3-0185 Facial Reshape / Noseを新規`docs/NOSE_RESHAPE_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他調査する。公式一次資料の下位操作/端末差とSUITE顔/Recipe/UI/Final/Presetを意味で比較し、全写真Transform/Face Brightness等へ誤統合しない。本人privacy/幾何/画素式が不明なら最小安全実装単位を示し未確定を保持。A Eyeshadow Worker/C Face Decorations Backend/メインdocs別、0/44。

## 2026-10-05 Face Decorations写真固有typed Recipe/Preset隔離（実装前）

Cは本人明示少数点のSUITE限定そばかす純粋核を新6/6・メイン独立関連10/10・buildで返却。次は`apps/backend/src/photo-policy.ts` optional `faceDecorationsManual`限定節、`workspace.ts`写真固有Preset拒否限定節と新規Backend/JWT SQLite専用試験のみ排他所有する。点のAsset/SHA/person/原寸、正規化位置/半径/色/opacityと容量を厳格保存し、偽alias/公式style自称/bitmap/保存版・権限自称を拒否、旧Recipe/Presetを維持。実登録Asset保存Gate/人物privacy/Worker/Editor/Final/Cloudは別。A Eyeshadow Worker/B Head Pose監査/メインdocsと別、0/44。

## 2026-10-05 Eyeshadow限定Worker/facade（実装前）

AはEyeshadowのNode/Trial直接保存Gateを新3/3・メイン独立関連10/10・buildで返却。次は`apps/web/src/processing/worker.mjs`/`index.mjs` Eyeshadow新operation限定節と新規専用試験のみ排他所有する。保存typed三役stroke→mask runtime→純粋RGBA彩色をAsset/SHA/person/対象眼/版/原寸/target/Abortで再検証し、通常renderの未認証Eyeshadowは黙示無視せず明示拒否する。caller自称は本人privacy/Original真正性でなく、製品Editor/Session/Final/Cloudは別Gate。B Head Pose監査/C Face Decorations純粋/メインdocsと別、0/44。

## 2026-10-05 EV3-0145 Head Pose差分監査（実装前）

BはEyeliner Trial hostを実HTTP/SQLite拒否境界新6/6・メイン独立6/6・buildで返却。現Trialは人物privacy reviewで正のCAS/readbackへ到達不能、合成非RAW/注入decoderも成功としない。Eyeliner製品mountはこのGateまで保留し、Bは別独立候補EV3-0145 Facial Reshape / Head Poseを新規`docs/HEAD_POSE_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他調査する。公式一次資料の下位操作・端末差・出力と現顔ランドマーク/Recipe/UI/Final/Presetを意味で比較し、Rotate/Crop/Face Brightness等を誤統合しない。幾何/画像生成式・privacyが不明なら完成扱いせず安全な最小単位を示す。A Eyeshadow Backend/C Face Decorations純粋/メインdocs別、0/44。

## 2026-10-05 Face Decorations本人明示そばかす点描の限定純粋核（実装前）

CはEV3-0037公式差分監査を新4/4・メイン独立4/4で返却。次は新規`apps/web/src/processing/manual-face-decoration-freckles.mjs`と新規専用試験のみ排他所有する。本人が明示した少数の写真固有点（位置・半径/色/opacity）にだけSUITE独自RGBA8点描効果を適用し、Asset/SHA/person/保存版/原寸/source・厳密1600px Proxy/容量/Abort、対象外/alpha/透明hidden RGB/入力不変を試験。顔位置/本人は自称で認可証拠ではない。公式6種素材・画素式を模倣せず、Recipe/UI/Worker/Final/Cloudは未接続。A Eyeshadow Backend/B Eyeliner Trial host/メインdocs別、0/44。

## 2026-10-05 Eyeshadow実登録Asset直接保存Gate（実装前）

AはEyeshadow typed Recipe/写真固有Preset拒否を新7/7・メイン独立7/7・buildで返却。次は`apps/backend/src/workspace.ts` Node直接saveRecipeのEyeshadow限定節、`repository.ts` Trial直接saveRecipeのEyeshadow限定節と新規JWT/Trial HTTP SQLite専用試験だけを排他所有する。実actor/tenant登録非trash Asset ID/SHA/edit権限/版CASを保存前後・履歴読戻しで照合し、別Asset/SHA/削除/Viewer/失効/競合を拒否する。自称person/眼位置/原寸は認証・画像証拠でなく、Worker/製品UI/Final/Cloudは別Gate。B Eyeliner host/C Face Decorations監査/メインdocsと別、0/44。

## 2026-10-05 Eyeshadow旧監査のtyped境界への追随（実装前）

Aの`eyeshadowManual` typed/Preset拒否で、旧監査の偽`eyeshadow`汎用JSONを受け入れる期待が陳腐化した。メインは製品の安全な拒否を緩めず、`apps/web/tests/eyeshadow-completion-audit.test.mjs`と`docs/EYESHADOW_COMPLETION_AUDIT.md`の当該記述だけを偽alias拒否/旧中立Recipe維持へ更新する。製品Editor/Worker/Finalの未接続判定を保ち、AのBackend新割当/BのEyeliner host/CのFace Decorations監査とファイル排他。0/44。

## 2026-10-05 EV3-0037 Face Decorations差分監査（実装前）

CはContacts限定Trial hostを実HTTP/SQLite新7/7・メイン独立7/7・buildで返却。通常Trialは人物privacy/虹彩位置の権威証拠不足で保存前拒否、Node synthetic-only成功はCAS/readback mechanicsで実RAW/製品成功ではない。Contacts製品mountはこのGateまで保留し、Cは別独立候補EV3-0037 Face Decorationsを新規`docs/FACE_DECORATIONS_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他調査する。公式一次資料の下位操作/端末差と現SUITE/Makeup/Recipe/UI/Final/Presetを意味で照合し、Blush/Eyeshadow/Contacts等を誤統合しない。素材/画素式不明なら推測完成扱いせず安全な最小実装単位を提案。A Eyeshadow Backend/B Eyeliner Trial host/メインdocsと別、0/44。

## 2026-10-05 Eyeliner本人明示Trial保存host限定（実装前）

Bは保存typed線→Worker実RGBA限定経路を新6/6・メイン独立関連18/18・buildで返却。次は新規`apps/web/src/manual-eyeliner-trial-host.mjs`と新規実Trial HTTP/SQLite専用試験のみ排他所有する。現EditorSession/TrialClientのfresh本人・tenant/登録Asset/SHA/edit/保存版、Original bytes digest・内部Worker decode原寸、CAS/readbackを照合する。自称人物/眼矩形やcallback成功は権威でなく、合成非RAW/通常Trial人物privacy不足を安全拒否。Node synthetic test-only成功はmechanicsだけで製品成功でない。A Eyeshadow Backend/C Contacts hostは別ファイル、製品Editor/Final/Cloud未接続、0/44。

## 2026-10-05 Eyeshadow限定typed Recipe/Preset隔離（実装前）

Aは三役stroke→mask runtimeを新8/8・メイン独立関連20/20・buildで返却。次は`apps/backend/src/photo-policy.ts` optional `eyeshadowManual`限定節、`workspace.ts`写真固有Preset拒否限定節と新規Backend/JWT SQLite試験だけを排他所有する。UI documentのAsset/SHA/person/対象眼/原寸・眼周囲/虹彩/瞳孔別bounded ADD/ERASE・色/opacityを厳格保存し、偽alias/bitmap/保存版自称/権限自称を拒否。既存Recipe v1/Presetを維持する。実登録Asset保存Gate/本人privacy/Worker/製品Editor/Final/Cloudは別。B Eyeliner Worker/C Contacts Trial host/メインdocsと別、元候補0/44。

## 2026-10-05 Eyeliner限定Worker/facade（実装前）

Bは保存typed線→原寸/1600px Proxy runtimeを新6/6・メイン独立関連18/18・buildで返却。次は`apps/web/src/processing/worker.mjs`/`index.mjs`のEyeliner新operation限定節と新規専用試験のみ排他所有する。保存済みtyped文書・runtimeを実RGBAへ接続し、Asset/SHA/person/版/寸法/target/Abort、通常renderの未認証Eyeliner明示拒否を確認。caller自称は人物privacyやOriginal真正性でない。A Eyeshadow mask/C Contacts Trial host/メインdocs別、製品Session/UI/Final/実RAW/Cloud未接続、元候補0/44。

## 2026-10-05 Contacts本人明示Trial保存host限定（実装前）

CはContacts独立UIを新7/7・メイン独立7/7・buildで返却。次は新規`apps/web/src/manual-contacts-trial-host.mjs`と新規実Trial HTTP/SQLite専用試験のみ排他所有し、現EditorSession/TrialClientのfresh本人・tenant/登録Asset/SHA/edit権限・保存Recipe版、Original bytes digest/内部Worker decode原寸・CAS/readbackを照合する。自称眼/本人/画像寸法やcallback成功を権威とせず、合成非RAWは拒否側を実証。通常Trialの人物privacy不足をNode test-only syntheticで通して製品成功とは呼ばない。製品Editor mount/Final/実RAW/Cloud別。A Eyeshadow mask/B Eyeliner runtime/メインdocsと別、0/44。

## 2026-10-05 Eyeliner保存線の限定mask runtime（実装前）

BはEyelinerのNode/Trial実登録Asset直接保存Gateを新3/3・メイン独立新/監査7/7・buildで返却。次は新規`apps/web/src/processing/manual-eyeliner-runtime.mjs`と新規専用試験のみ排他所有し、保存typed `eyelinerManual`の左右矩形/連続edge/wingを原寸と厳密1600px Proxy上で純粋瞼線核へ安全に投影する。Asset/SHA/person/保存版/原寸/source・proxy/容量/Abort、対象外/alpha/透明hidden RGB/入力不変を試験。内部自称は認可でなく、公式9/6 styles・本人privacy/真正Original/Worker/Final/Cloudは未接続。A Eyeshadow mask/C Contacts UI/メインdocsと別、0/44。

## 2026-10-05 Eyeliner旧監査のtyped境界への追随（実装前）

全Web回帰で旧`eyeliner`汎用JSONを受理するとした監査1件が、新typed `eyelinerManual`の偽alias拒否と不一致になった。製品の安全な拒否を緩めず、メインが`apps/web/tests/eyeliner-completion-audit.test.mjs`と`docs/EYELINER_COMPLETION_AUDIT.md`の陳腐化した記述だけを更新する。偽alias拒否と旧中立Recipe維持を試験し、製品Editor/Worker/Final未接続の判定を保つ。B Backend直接保存Gate、A/C独立UIとは別ファイル。0/44。

## 2026-10-05 Eyeshadow三役stroke→mask限定runtime（実装前）

AはAfter独立UI部品を新7/7・メイン独立7/7・buildで返却。次は新規`apps/web/src/processing/manual-eyeshadow-mask-runtime.mjs`と新規専用試験のみ排他所有する。UIの眼周囲/虹彩保護/瞳孔保護をそれぞれ原寸・厳密1600px Proxyへ再ラスタ化し、限定純粋彩色核の三役provenanceへ束縛。Asset/SHA/person/対象眼/保存版/原寸/容量/Abort/透過/入力不変を検証する。`ownerConfirmed`のような内部幾何引数は認証証拠ではない。B Eyeliner Backend/C Contacts UI/メインdocsとは別、製品Editor/真正Original/Final/Cloud未接続、元候補0/44。

## 2026-10-05 Eyeliner実登録Asset直接保存Gate（実装前）

Bはoptional `eyelinerManual` typed Recipe/写真固有Preset拒否を新5/5・メイン独立5/5・buildで返却。次は`apps/backend/src/workspace.ts` Node直接saveRecipeのEyeliner限定節、`repository.ts` Trial直接saveRecipeのEyeliner限定節と新規JWT/Trial HTTP SQLite専用試験を排他所有する。実actor/tenantの登録非trash Asset ID/SHA、edit権限、版CASと履歴読戻しを照合し、別Asset/古いSHA/削除/Viewer/失効/競合を拒否する。自称人物/眼矩形/原寸は認可・画像証拠でなく、Worker/UI製品mount/Final/Cloudは別Gate。A Eyeshadow UI/C Contacts UI/メインdocsと別、元候補0/44。

## 2026-10-05 Contacts虹彩ring本人明示独立UI（実装前）

Cは保存typed stroke→別ring/pupil mask→Worker実RGBAの限定経路を新6/6・メイン独立関連17/17で返却。次は新規`apps/web/src/manual-contacts-ui.mjs`と新規専用試験のみ排他所有する。本人明示左右眼ring/pupil除外stroke・色/AmountをAfterでPointer/Touch/Keyboard、Undo/Redo/Cancel/切替/失効破棄し、Backend typed `contactsIrisManual`へ形を合わせる。fresh本人hostなしは送信不可、callbackを保存確定と扱わない。公式11 stylesダミーなし、本人/虹彩位置・真正Original・製品Editor/Final/Cloudは未接続。A Eyeshadow UI/B Eyeliner Backend/メインdocs別、0/44。

## 2026-10-05 眼機能の非重複3作業（実装前）

Aは新規`apps/web/src/manual-eyeshadow-ui.mjs`と専用試験のみ: Eyeshadowの本人明示眼周囲/虹彩/瞳孔保護下書きをAfterでPointer/Touch/Keyboard、Undo/Redo/Cancel/失効破棄。保存host不在は送信不可、公式14/8 stylesダミーなし。Bは`apps/backend/src/photo-policy.ts`のoptional `eyelinerManual`限定節、`workspace.ts`写真固有Preset拒否限定節と新規Backend試験のみ: UIの連続edge/wing・Asset/SHA/person/原寸をtyped保存し偽alias/権限自称/bitmapを拒否。Cは`apps/web/src/processing/worker.mjs`/`index.mjs`のContacts新operation限定節と専用新規試験のみ: 保存済みtyped ring/pupil stroke→別mask→虹彩純粋核、Asset/SHA/person/版/真正寸法/Abortの検証と通常render fail-closed。三者は互いに別ファイル、製品Editor/Final/実RAW/Cloud未接続で元候補0/44。

## 2026-10-05 Eyeshadow本人明示mask単色彩色の限定純粋核（実装前）

Aは公式差分監査を新4/4・メイン独立4/4で返却。次は新規`apps/web/src/processing/manual-eyeshadow-color.mjs`と新規専用試験だけを排他所有し、本人が明示した眼周囲mask内だけにSUITE独自のRGBA8単色効果を適用する。Asset/SHA/person/対象眼/保存版/原寸/source・厳密1600px Proxy/容量/Abortを構造検証し、mask外・虹彩/瞳孔・alpha・透明hidden RGB・入力不変を試験。maskや自称人物は本人確認/真の眼領域証拠ではない。公式14/8 styles・専用Amountを推定実装せず、Recipe/UI/Worker/Final/Cloudは未接続。B Eyeliner UI/C Contacts mask/メインdocsと別、0/44。

## 2026-10-05 Contacts虹彩stroke→mask限定runtime（実装前）

CはContactsのNode/Trial直接保存Gateを新3/3・メイン独立の関連10/10・buildで返却。次は新規`apps/web/src/processing/manual-contacts-mask-runtime.mjs`と新規専用試験だけを排他所有し、typed `contactsIrisManual`のring/pupil ADD/ERASE strokeを原寸と厳密1600px Proxyで別々に再ラスタ化する。Asset/SHA/person/眼/保存版/原寸/表現・容量/Abort、瞳孔保護と透過、入力不変を検証する。自称虹彩位置/本人は認可証拠でなく、真正Original/実人物privacy・製品Editor/Worker/Final/Cloudは未接続。A Eyeshadow監査/B Eyeliner UI/メインdocsと別、元候補0/44。

## 2026-10-05 EV3-0021 Eyeshadow独立候補の差分監査（実装前）

AはEyelashes本人明示独立UIを専用6/6・メイン独立6/6・buildで返却。Eyelashes typed保存/人物privacy/実Finalは未接続、公式17/14スタイルは未再現。CがBackendをContactsで所有中のため、次はAのみ別候補EV3-0021 Eyeshadowを新規`docs/EYESHADOW_COMPLETION_AUDIT.md`と新規専用監査試験で排他調査する。Evoto公式一次資料の下位操作/端末差と現SUITE顔/Makeup/Recipe/UI/Final/Presetを意味で照合し、Eyeliner/Eyelashes/Contactsと誤統合しない。公式素材/形状/画素式不明なら推測完成扱いせず最小安全実装単位を提案。製品/Backend/Cloud、B Eyeliner UI/C Contacts save/メインdocs読取り、0/44。

## 2026-10-05 Eyeliner本人明示瞼線の独立UI部品（実装前）

Bは左右連続edge＋wingのSUITE独自純粋核を専用6/6・メイン独立6/6・buildで返却。CがBackendをContactsで所有中のため、Bは新規`apps/web/src/manual-eyeliner-ui.mjs`と新規専用試験だけを排他所有。Afterの左右眼矩形・瞼edge polyline/wing・線幅/色/opacityをPointer/Touch/Keyboardで下書きし、Undo/Redo/Cancel/Asset切替/失効時破棄を実装。公式9/6ダミー選択なし、自称瞼位置/本人を認可とせず、fresh host/typed保存Gateが無い間は保存成功にしない。既存Session/Editor/Backend/Worker/Final/Cloud読取り、A Eyelashes UI/C Contacts save/メインdocs別、0/44。

## 2026-10-05 Contacts手動虹彩文書の実登録Asset保存Gate（実装前）

Cはoptional `contactsIrisManual` typed Recipeと写真固有Preset拒否を新7/7・メイン独立新/監査11/11・buildで返却。次はCのみ`apps/backend/src/workspace.ts` Node直接saveRecipeのContacts限定節、`apps/backend/src/repository.ts` Trial直接saveRecipeのContacts限定節と新規JWT/Trial HTTP SQLite専用試験を排他所有。実actor/tenant登録非trash Asset ID/SHA/edit権限/版CASを前後照合し、別Asset/古いSHA/削除/Viewer/失効/競合を拒否。保存JSONのperson/eye自称は認証証拠でなく、fresh人物privacy/虹彩位置・真正原寸は別Gate。旧Recipe/Branchを維持し、Worker/Session/UI/Final/Cloud未接続、A Eyelashes UI/B Eyeliner純粋/メイン監査別、0/44。

## 2026-10-05 Contacts監査のtyped Recipe追随（実装前）

Cの`contactsIrisManual` optional typed構造と偽`contacts` alias拒否後、旧`CONTACTS-AUDIT-03`の未知Contacts汎用JSON受理期待が陳腐化。メインのみ`apps/web/tests/contacts-completion-audit.test.mjs` AUDIT03と`docs/CONTACTS_COMPLETION_AUDIT.md`追補を排他修正し、偽alias拒否・通常render拒否・Author portable拒否を現在の安全境界として確認する。製品/Recipe/Preset契約を緩めず、A Eyelashes UI/B Eyeliner純粋/C後続/メインdocsと非重複。元候補0/44。

## 2026-10-05 Eyeliner本人明示瞼線の限定純粋核（実装前）

BはEV3-0025 Eyeliner公式Desktop/Mobile 9 styles・iPad 6 designsと現SUITE欠落の差分監査を専用4/4・メイン独立4/4で返却。次はBのみ新規`apps/web/src/processing/manual-eyeliner-line.mjs`と新規専用試験を排他所有し、本人明示の左右瞼edge polyline＋任意wingの連続線をSUITE独自RGBA8で描く。個別まつ毛テーパー線/虹彩ring色とは対象・画素処理を区別し、Asset/SHA/person/原寸/保存版/表現/容量/Abort、対象外/alpha/透明hidden RGB/入力不変を検証。自称瞼位置/本人を認可にせず、公式9/6素材・Amount/画素同等性を主張しない。Recipe/Session/UI/Worker/Final/Cloud未接続、A Eyelashes UI/C Contacts typed/メインdocs別、0/44。

## 2026-10-05 Eyelashes本人明示曲線の独立UI部品（実装前）

AはSUITE独自テーパーまつ毛のRGBA8純粋核を専用5/5・メイン独立5/5・buildで返却。CがBackend Recipe/PresetをContactsで排他所有中のため、Aは新規`apps/web/src/manual-eyelash-ui.mjs`と新規専用試験だけを排他所有し、Afterの明示左右眼矩形・root/control/tip曲線・色/opacityをPointer/Touch/Keyboardで下書き、Undo/Redo/Cancel/Asset切替/失効時破棄を実装する。公式17/14スタイルのダミー選択を出さず、本人選択や眼位置を認証とせず、fresh host/typed保存Gateが無い間は保存成功にしない。既存Session/Editor/Backend/Worker/Final/Cloudは読取り、B Eyeliner監査/C Contacts typed/メインdocsと非重複、0/44。

## 2026-10-05 EV3-0025 Eyeliner独立候補の差分監査（実装前）

BはHands Trial本人保存hostの実HTTP/SQLite合成非RAW拒否を専用4/4・メイン独立4/4・buildで返却。実RAWがなく正のCAS/readbackは未検証で製品mountは保留。次は別候補EV3-0025 EyelinerをBのみ新規`docs/EYELINER_COMPLETION_AUDIT.md`と新規専用監査試験で排他調査する。Evoto公式一次資料のEyeliner下位操作/端末差と現顔/Makeup/Recipe/UI/Final/Presetを意味ベースで照合し、Eyelashes/Contacts/Eyeshadowを同一処理扱いしない。スタイル素材/線幅/画素式が不明なら推測で完成扱いせず、最小安全な実装単位と残Gateを提案。製品/Backend/Cloud、A Eyelashes純粋/C Contacts typed/メインdocsは読取り専用、0/44。

## 2026-10-05 Contacts手動虹彩ringのtyped Recipe/Preset隔離（実装前）

Cは本人明示虹彩ring-瞳孔除外のSUITE独自色純粋核を専用6/6・メイン独立6/6・buildで返却。次はCのみ`apps/backend/src/photo-policy.ts`のoptional `contactsIrisManual`限定節、`apps/backend/src/workspace.ts`の写真固有Preset拒否限定節と新規Backend/Recipe/JWT SQLite試験を排他所有する。Asset/SHA/person/左右眼/原寸、ring/pupil別bounded normalized ADD/ERASE strokes、色/Amountをtyped保存し、Bitmap/保存revision/権限自称/未知contacts aliasを拒否。旧Recipe/他拡張/写真非依存Preset維持。本人/虹彩位置のfresh認可、Worker/Session/UI/Final/Cloudは未接続、A Eyelashes純粋/B Hands Trial host/メインdocs別、0/44。

## 2026-10-05 Eyelashes本人明示テーパー線の限定純粋核（実装前）

AはEV3-0023 EyelashesのDesktop/Mobile 17・iPad14スタイルと現SUITE欠落の差分監査を専用4/4・メイン独立4/4で返却。公式素材の権利/形状が未証明なので元スタイルを再現したダミー一覧は作らない。次はAのみ新規`apps/web/src/processing/manual-eyelash-render.mjs`と新規専用試験を排他所有し、本人が明示した片眼/両眼のroot→tip曲線群から幅が先端へ減るSUITE独自RGBA8手動まつ毛線を決定的に描く純粋核を実装する。Asset/SHA/person/原寸/保存版/表現/容量/Abortとeye-target構造を検証し、mask外/alpha/透明hidden RGB/入力不変を保証。自称眼位置/本人を認可証拠とせず、公式17/14素材・Amount・画素同等性を主張しない。Recipe/Session/UI/Worker/Final/Cloudは未接続、B Hands Trial host/C Contacts純粋/メインdocsと非重複、0/44。

## 2026-10-05 Hands手動Tone UIのTrial本人保存host（実装前）

BはHands独立UI部品を専用6/6・メイン独立6/6・buildで返却。次はBのみ新規`apps/web/src/manual-hand-tone-trial-host.mjs`と新規実Trial HTTP/SQLite専用試験を排他所有。実EditorSession/TrialClientでfresh本人/tenant・登録非trash Asset/SHA・Original bytes digest/内部Worker decode原寸・保存Recipe版/edit権限を保存前後確認し、typed手動文書をCAS→readback。自称手位置/本人やcaller提供decoderを認可に使わず、合成非RAW実Workerで証明できなければ保存拒否、偽Worker mechanics成功は実RAWの根拠にしない。既存Session/Editor/Backend/Worker/Final/Cloudは読取り専用、A Eyelashes監査/C Contacts純粋/メインdocsと非重複、0/44。

## 2026-10-05 Contacts本人明示虹彩ring色の限定純粋核（実装前）

CはEV3-0027 Contactsの元11スタイル・現機能との差分監査を専用4/4・メイン独立4/4で返却。次はCのみ新規`apps/web/src/processing/manual-contacts-iris-color.mjs`と新規専用試験を排他所有し、本人明示の虹彩ring coverageかつ瞳孔除外maskの範囲だけをSUITE独自有限RGBA8色効果で変更する。mask外/瞳孔/alpha/透明hidden RGB/入力不変、Asset/SHA/person/原寸/保存版/表現/容量/Abortの構造検証を行うが、caller自称のring/本人を認可・検出の証拠にしない。公式11スタイル再現やEvoto式を主張せず、Recipe/Session/UI/Worker/Final/Cloudは未接続。A Eyelashes監査/B Hands UI/メインdocsとは非重複、0/44。

## 2026-10-05 EV3-0023 Eyelashes独立候補の差分監査（実装前）

AはBlush Trial本人保存hostを専用8/8・メイン独立8/8・buildで返却。通常Trialは人物privacy reviewにより保存を拒否し、成功はNode synthetic test-onlyでbackend privacy権威ではないためBlush製品mountは保留。次は別候補EV3-0023 EyelashesをAのみ新規`docs/EYELASHES_COMPLETION_AUDIT.md`と新規専用監査試験で排他調査する。公式一次資料のEyelashes下位操作/端末差と現顔/Makeup/Recipe/UI/Final/Presetを照合し、Contacts/Eyelinerや単なるDetailを同一としない。公式素材/形状/画素式が不明なら推測で元機能完成扱いせず、最小安全な独立実装単位を提案。製品/Backend/Cloud、B Hands UI/C Contacts監査/メインdocsは読取り専用、0/44。

## 2026-10-05 EV3-0027 Contacts独立候補の差分監査（実装前）

CはClothing Trial本人保存hostを専用6/6・メイン独立6/6・buildで返却。ただし合成非RAWの実Workerは保存を拒否し、偽WorkerによるCAS mechanics試験は実RAW成功証拠ではない。Clothing製品mountは真正RAW/原寸Gateまで保留。次は別候補EV3-0027 ContactsをCのみ新規`docs/CONTACTS_COMPLETION_AUDIT.md`と新規専用監査試験で排他調査する。Evoto一次資料のContacts下位操作と現SUITE顔/Makeup/Recipe/UI/Final/Presetの意味差を照合し、似た色調整やEyeshadowを同一機能扱いしない。公式の色/位置/寸法/処理式が不明なら推測実装せず、最小安全な独立実装単位を提案。製品/Backend/Cloud、A Blush Trial host/B Hands UI/メインdocsは読取り専用。元候補0/44。

## 2026-10-05 Hands手動限定UI部品（実装前）

Bは保存typed Hand文書→独立Worker/facade実画素を専用6/6・メイン独立核/mask/Worker19/19・buildで返却。次はBのみ新規`apps/web/src/manual-hand-tone-ui.mjs`と新規専用試験を排他所有し、本人明示手/前腕stroke、strength/radiusをAfterでPointer/Touch/Keyboard操作、Undo/Redo/Cancel/切替/失効時の安全破棄を実装。自称手位置/本人を認証とせず、fresh認証host不在なら保存成功にしない。既存Session/Editor/Backend/Worker/Finalは読取り専用、A/C Trial host/メインdocsと非重複、元Hand Vein/Reshapingや実RAW/Chrome/Cloudは未接続、0/44。

## 2026-10-05 Hands手動限定独立Worker/facade（実装前）

Bは保存typed stroke→原寸/厳密Proxy別mask runtimeを専用6/6・メイン独立核/mask13/13・buildで返却。次はBのみ`apps/web/src/processing/worker.mjs`と`index.mjs`のHand新operation限定節、新規専用試験を排他所有。保存typed `handToneManual`をWorkerで再検証→mask runtime→純粋tone画素へ接続し、Asset/SHA/保存版/寸法/target/容量/Abortをfail-closed。通常renderは未認証Hand文書を黙示無視せず拒否し、旧Blush/Clothing/Shadow/BW経路を維持。真正Original/本人・手領域/Session/UI/Final/実RAW/Cloudは未接続、A/C新Trial host/メインdocsと非重複、0/44。

## 2026-10-05 Hands保存strokeの原寸/Proxy mask runtime（実装前）

BはNode/Trial実Asset保存Gateを専用3/3・メイン独立3/3・buildで返却。次はBのみ新規`apps/web/src/processing/manual-hand-mask-runtime.mjs`と新規専用試験を排他所有。保存typed `handToneManual`のnormalized ADD/ERASE strokeを原寸と厳密1600px Proxy別に再ラスタ化し、既存純粋Hand Tone核へ渡すmask出典をAsset/SHA/保存版/寸法/target/容量/Abortで束縛。callerの自称手位置や権限を本人証拠としない。既存Worker/Session/UI/Backend/Final/Cloudは読取り専用、A Blush Trial host/C Clothing Trial host/メインdocsと非重複、0/44。

## 2026-10-05 Clothing本人手動Spot UIのTrial保存host（実装前）

Cは独立Clothing UIを専用6/6・メイン独立6/6・buildで返却。次はCのみ新規`apps/web/src/manual-clothing-spot-trial-host.mjs`と新規実Trial HTTP/SQLite試験を排他所有し、現UIのonSubmitへ実EditorSession/TrialClientからfresh本人・同tenant登録Asset/SHA・編集権限・保存Recipe版/CAS/readbackを供給する。本人/衣服領域の自称やhost callbackだけを認証証拠にせず、Original bytes SHA・decode原寸が証明できなければ保存成功にしない。既存Session/Editor/Backend/Worker/Final/Cloudは読取り専用、A Blush host/B Hand mask/メインdocsと非重複、0/44。

## 2026-10-05 Blush手動UIのTrial本人保存host（実装前）

AはBlush独立UI部品を専用7/7・メイン独立7/7・buildで返却。次はAのみ新規`apps/web/src/manual-blush-trial-host.mjs`と新規実Trial HTTP/SQLite専用試験を排他所有し、UIの`onSubmit`へ実`EditorSession`/`TrialClient`のfresh本人・同tenant登録Asset/SHA・edit権限・保存Recipe版/portrait person continuity・CAS再読込を供給する。本人選択IDやhost callbackだけを認証とせず、Original bytes SHAとdecode原寸の真正性を証明できない場合は保存/成功表示を拒否する。既存Session/Editor/Backend/Worker/Finalは読取り専用、B Hands Backend/C Clothing新UI/メインdocsと非重複。製品mount/公式12 styles/実RAW/Cloudは別Gate、0/44。

## 2026-10-05 Hands手動文書の実登録Asset保存Gate（実装前）

Bは`handToneManual` optional typed Recipeと写真固有Preset隔離を専用7/7・メイン独立7/7・buildで返却。次はBのみ`apps/backend/src/workspace.ts` Node直接saveRecipe hand限定節、`apps/backend/src/repository.ts` Trial直接saveRecipe hand限定節と新規JWT/Trial HTTP SQLite専用試験を排他所有する。認証済みactorと同tenant登録非trash Asset ID/SHA/edit権限/保存版CASを保存直前と再読込時に照合し、別Asset・古いSHA・削除・Viewer・失効・競合を拒否。構造文書の自称bindingを認証証拠にしない。真正原寸/手位置・Worker/UI/Finalは別Gate、旧Recipe/Branch維持。A Blush新UI後続/C Clothing新UI/メインdocsと非重複、0/44。

## 2026-10-05 Hands監査のtyped Recipe追随（実装前）

全Web回帰で旧`HANDS-AUDIT-03`の未知handキー汎用JSON受理期待が、Bの安全な偽hand alias拒否追加後に陳腐化して失敗。メインのみ`apps/web/tests/hands-completion-audit.test.mjs`のAUDIT03と`docs/HANDS_COMPLETION_AUDIT.md`追補を編集し、偽hand alias拒否・未認証通常render拒否・Author portable拒否を検証する。製品/Recipe/Preset契約は緩めず、Bのtyped節とは別ファイル、A Blush UI/C Clothing UIとも非重複。元候補0/44。

## 2026-10-05 Clothing本人手動Spot UI部品（実装前）

Cは保存typed衣服文書→独立Worker/facade実画素を専用6/6・メイン独立18/18で返却。次はCのみ新規`apps/web/src/manual-clothing-spot-ui.mjs`と新規専用試験を排他所有し、本人が明示した小target/reference領域とtarget strokeをAfter上で操作、Pointer/Touch/Keyboard、Undo/Redo、Cancel/失効/Asset切替をfail-closedにする。自称衣服領域/本人を認証済み扱いせず、fresh認証hostが無い場合は保存成功にしない。製品Editor/Session/Finalや自動衣服検出は未接続、A Blush新UI/B Hands typed/メインdocsと非重複、0/44。

## 2026-10-05 Hands手動限定typed Recipeと写真固有Preset隔離（実装前）

Bは手/前腕mask内のSUITE独自トーン均一化純粋核を専用7/7・メイン独立7/7・Web buildで返却。次はBのみ`apps/backend/src/photo-policy.ts`のoptional `handToneManual`限定節、`apps/backend/src/workspace.ts`の写真固有Preset拒否限定節と新規専用Backend/Recipe/JWT SQLite試験を排他所有。Asset/SHA/原寸・bounded normalized ADD/ERASE手動stroke・strength/radiusを厳格保存し、Bitmap/本人認証の自称/保存revision/未知hand aliasは拒否。旧Recipe/他拡張・写真非依存Presetは維持。純粋核のmaskは手位置や権限の証明でない。Session/UI/Worker/Final/Cloudは未接続、A Blush新UI/C Clothing Worker/メインdocs別、0/44。

## 2026-10-05 Clothing手動限定独立Worker/facade（実装前）

CはNode/Trial直接保存の実登録Asset/SHA/権限/CAS Gateを実JWT HTTP/SQLite専用2/2・メイン独立2/2で返却。次はCのみ`apps/web/src/processing/worker.mjs`と`index.mjs`のClothing新operation限定節、新規専用試験を排他所有。保存typed `clothingSpotManual`のtarget/reference/targetStrokesを実pixelsに適用し、Asset/SHA/版/原寸/表現/容量/AbortをWorkerで再検証する。通常renderは未認証Clothing文書を黙示無視せず拒否。真正Original decode・本人衣服領域/寸法・Session/UI/Finalは未接続、既存Blush/Shadow/BW等は維持。A Blush新UI/B Hands純粋/メインdocsと非重複、0/44。

## 2026-10-05 Blush監査の独立Worker追随（実装前）

全Web回帰で旧`BLUSH-AUDIT-04`がWorkerにもBlush経路なしと断定して失敗。Aの独立Worker/facade追加後は現実と異なるため、メインのみ`apps/web/tests/blush-completion-audit.test.mjs`のAUDIT04と`docs/BLUSH_COMPLETION_AUDIT.md`の追補を変更する。製品コード/Recipe/Presetを緩めず、Worker限定経路の存在と通常render拒否、製品Editor/Session/Final未接続を分けて検証する。Aの新規UI部品/B Hands/C Clothingとは非重複、元候補0/44。

## 2026-10-05 Blush本人手動UI部品（実装前）

Aは保存済みBlush文書→独立Worker/facade実画素を専用6/6、メイン独立mask/Worker12/12、buildで返却。次はAのみ新規`apps/web/src/manual-blush-ui.mjs`と新規専用試験を排他所有し、明示的な左右頬stroke/色/opacityのAfter操作、Pointer/Touch/Keyboard、Undo/Redo、取消・失効・切替時破棄を実装する。自称personや頬位置を認証済み扱いせず、host callbackが本人/Asset/SHA/person/保存版をfresh証明できない限り保存成功にしない。既存Session/Editor/Backend/Worker/Cloudは読取り専用、B Hands/C Clothing save/メインdocsと非重複。製品mount/Final/公式12 stylesは別Gate、0/44。

## 2026-10-05 Hands本人手動範囲の限定トーン均一化純粋核（実装前）

BはEV3-0232元3操作の監査を専用4/4で返却し、既存Face/Local調整が手専用処理でないと確定。次はBのみ新規`apps/web/src/processing/manual-hand-tone.mjs`と新規専用試験に排他を与え、本人明示手/前腕mask内のSUITE独自・局所トーン均一化をRGBA8で純粋実装する。既存Local Levelsの単なる別名にならないよう、局所輝度偏差の平滑化と元の色相/質感・境界の保持を有限・決定的な画素式で明示し、mask外RGB/alpha/hidden RGB/入力不変、Asset/SHA/personではなく対象手領域・原寸/版/representation/Abort/容量を構造照合する。自称maskを手検出/本人認可と扱わず、公式Hand Vein除去/Reshaping/Evoto同等性を主張しない。既存Recipe/Session/UI/Worker/Backend/Cloud、A Blush Worker/C Clothing save/メインdocsは読取り専用、0/44。

## 2026-10-05 Clothing手動文書の実登録Asset保存Gate（実装前）

Cは`clothingSpotManual` typed構造/写真固有Preset拒否とBlush settings getter安全修正をBackend新8/8・関連10/10・buildで返却。次はCのみ`apps/backend/src/workspace.ts`のNode Workspace直接saveRecipe衣服限定節、`apps/backend/src/repository.ts`のTrial直接saveRecipe衣服限定節と新規専用JWT/Trial HTTP SQLite試験を排他編集する。実認証済みactorと当該登録Asset ID/Original SHA/編集権限、CAS版を保存直前に照合し、別Asset/古いSHA/削除済み/Viewer/期限切れ/版競合を拒否する。構造Recipeの自称bindingを認可にせず、既存写真固有文書・旧Recipe/Branch/他Assetを保持。寸法の真正性は現Asset metadata/Original decodeで証明できなければ別Gateとし成功主張しない。Worker/UI/Final/Cloudは未接続、A Blush Worker/B Hands/メインdocsと非重複、0/44。

## 2026-10-05 EV3-0232 Hands独立候補の差分監査（実装前）

BはOriginal Shadow製品Editor限定mountを新2/2・関連35/35・buildで返却。次はBのみ新規`docs/HANDS_COMPLETION_AUDIT.md`と新規専用監査試験で、元HandsのEven Dodge & Burn/Hand Vein/Hand Reshapingを一次資料と現Face/Local/Bodyの実処理へ照合する。汎用Local Levelsや手動マスクを手専用AI認識/血管修復/幾何変形の完成証拠にしない。対象・保存・Final・Preset・端末差を分け、安全な非AI最小実装単位を提示。既存製品/Backend/Cloud、A Blush Worker/C Clothing typed/メインdocsは読取り専用、監査だけで0/44。

## 2026-10-05 Blush手動限定の独立Worker画素経路（実装前）

Aは保存stroke→原寸/Proxy mask runtimeを専用6/6・関連20/20・buildで返却。次はAのみ`apps/web/src/processing/worker.mjs`と`apps/web/src/processing/index.mjs`の新Blush operation限定節、新規専用Worker/facade試験を排他編集する。保存済みtyped RecipeとAsset/SHA/person/版/寸法・caller出典を照合し、先のmask runtime→純粋彩色核を独立Worker呼出しで実画素適用する。既存一般renderは未認証の`blushManual`を黙示無視せず拒否し、旧Recipe/他調整/Original不変、Abort/容量を確認する。現製品の認証済みSession/UI/Finalへは追加Gateまで接続しない。C Backend Clothing/B Hands/メインdocsと非重複、0/44。

## 2026-10-05 Blush settings getter事前評価の安全修正（実装前）

AのBlush mask runtimeレビューで、既存`photo-policy.ts` Blush typed節が`settings.color`を`exactData(settings)`前に参照し、accessorを走らせ得ると判明。現在同ファイルはCがClothing typed契約で排他所有するため、CへBlush settings節だけの最小修正とgetter回帰を追加割当する。strict plain/exact own data descriptorを先に検証してから値を読む。他Blush/Clothing/旧Recipe/Preset意味は変更しない。A runtime/B Editor/メインdocsは非重複。旧悪性getterが走らない試験PASSまではBlush typed安全境界完成と呼ばず、0/44。

## 2026-10-05 Clothing手動スポットのoptional typed RecipeとPreset隔離（実装前）

CはSUITE独自の本人明示スポット画素核を専用6/6・buildで返却。次はCのみ`apps/backend/src/photo-policy.ts`の`clothingSpotManual` optional extension限定節、`apps/backend/src/workspace.ts`の写真固有Preset拒否限定節、新規専用Backend/実JWT SQLite試験を排他編集する。Asset UUID/Original SHA/原寸、正規化された非重複target/reference矩形とbounded target ADD/ERASE strokesを保存し、実画素bitmap・認可自称・保存revisionを入れない。旧Recipe v1/他拡張/処理順、旧写真非依存Presetを維持し、未知衣服キーや別Asset Preset流用を拒否する。先の純粋核への投影・実本人Gate/Worker/UI/Finalは別工程。A Blush新mask module/B Shadow Editor/メインdocsと非重複、元候補0/44。

## 2026-10-05 Blush保存stroke→原寸/Proxy maskの独立runtime（実装前）

Aはoptional typed `blushManual`と写真固有Personal/Workspace Preset拒否をBackend新7/7・全Backend220/220・Web関連12/12・buildで返却。次はAのみ新規`apps/web/src/processing/manual-blush-mask-runtime.mjs`と新規専用試験に排他を与え、保存済みnormalized ADD/ERASE頬strokeを原寸または厳密1600px Proxyへ再ラスタ化し、先の純粋Blush核が受ける構造provenance付きmaskを生成する。Asset/SHA/person/保存版・両寸法・target/容量/Abort/偽出典を照合し、本人/頬位置の実証は呼出側fresh Gateが必要と明記する。既存Recipe/Session/UI/Worker/Backend/Cloud、B Shadow Editor/C Clothing pure/メインdocsは読取り専用。部品単独で0/44。

## 2026-10-05 Clothing本人手動・単一スポット修復の純粋画素核（実装前）

CはEV3-0313元7下位操作を新監査5/5・関連8/8・buildで返却し、現Detail/Localは衣服修復でないと確定。次はCのみ新規`apps/web/src/processing/manual-clothing-spot.mjs`と新規専用試験に排他を与え、本人が明示した小さなtarget領域と同寸法の参照領域から、SUITE独自の非AIスポット画素修復を純粋RGBA8で実装する。Asset UUID/Original SHA/原寸/保存版・source/proxy、領域出典と仕事量を厳格照合し、同一画素入力のコピーでmask外・alpha/hidden RGB/入力を不変に保ち、中断/別写真/サイズ不一致/曖昧領域を拒否する。本人明示や同一衣服の自称値は認可/衣服検出/自動De-Blemishの証拠にしない。既存Recipe/Session/UI/Worker/Backend/Cloud、A Blush/B Shadow/メインdocsは読取り専用。純粋部品だけで0/44。

## 2026-10-05 EV3-0313 Clothing adjustments差分監査（実装前）

Cは眉形状変形/眉メイクを別とするEV3-0169監査4/4を返却。次は独立候補EV3-0313 Clothing adjustmentsの元7下位操作を、Cのみ新規`docs/CLOTHING_ADJUSTMENTS_COMPLETION_AUDIT.md`と新規専用監査試験で一次資料・現SUITEに照合する。衣服しわ、傷、縁、物体保護の各処理を既存Clarity/Texture/Detailや一般maskと名前だけで同一・完成としない。実画素/UI/Recipe/保存/Final/プリセット/端末差を分け、本人明示範囲で安全に先行実装できる最小単位を提示。既存製品コード/Backend/Cloudは読取り専用。A Blush/B Shadow/メインVignette・台帳と非重複、0/44。

## 2026-10-05 Blush写真固有Preset拒否の保存境界（実装前）

optional `blushManual`をNode Recipeで受けるだけでは、現`apps/backend/src/workspace.ts`のPersonal/Workspace全Recipe Preset拒否列挙に含まれず写真固有頬maskを別写真へコピーできる危険がある。Aのtyped契約排他に同ファイルのPreset写真固有拒否限定節と専用実JWT/SQLite試験を追加する。既存B/W/Add Shadow等の拒否、写真非依存Preset、旧Recipe/Branchの動作は維持。Unknown/人物別Blush文書のPreset Save/Applyは拒否し、Blushそのものの製品Final完成とはしない。B Editor/C Eyebrows/メインVignette監査と非重複、元候補0/44。

## 2026-10-05 Vignette監査試験の現Preset仕様追随（実装前）

メイン全Web1460件中1件のみ`vignette-completion-audit.test.mjs` AUDIT02が旧「Author portable PresetはVignetteを常に拒否」を期待して失敗。現`preset-author-contract.mjs`と既存`author-vignette-portable.test.mjs`/`author-vignette-trial-product.test.mjs`は型付き写真非依存Vignetteを安全にSave/Apply/Reloadできることを示す。メインのみ旧監査試験AUDIT02を現契約の正例と写真固有/未知拡張拒否の負例へ更新し、`docs/VIGNETTE_COMPLETION_AUDIT.md`の後続追補で履歴記述と現Gateを分離する。製品処理やPreset保存契約は変更しない。A typed Blush/B Shadow Editor/C Eyebrowsとファイル非重複、元候補0/44。

## 2026-10-05 Blush監査期待のtyped境界追随（実装前）

Aのtyped `blushManual`検証で旧`apps/web/tests/blush-completion-audit.test.mjs`の「未知`blush`がNode構造validatorを通る」期待は陳腐化するため、Aに同監査試験AUDIT-03限定と`docs/BLUSH_COMPLETION_AUDIT.md`の後続追補も追加排他割当する。偽キー拒否と実Worker/Editor/Final未接続は両方明示し、監査PASSだけで元候補完了にしない。元候補0/44。

## 2026-10-05 Blush手動限定のoptional typed Recipe境界（実装前）

Aは本人明示頬maskのSUITE独自純粋彩色核を専用8/8・関連31/31・buildで返却。次はAのみ`apps/backend/src/photo-policy.ts`のBlush optional extension限定節と新規専用Backend/Recipe試験を排他編集する。写真Asset UUID/Original SHA/person/原寸、bounded正規化ADD/ERASE頬stroke、有限色/不透明度を厳格検証し、Bitmap・任意出典自称・保存revisionをRecipeへ入れない。旧Recipe v1/他拡張/処理順は維持、未知`blush`偽キーを拒否する。写真固有文書をPresetへ無条件コピーせず、Node/Trial認可とWorker/Session/UIは別Gate。B Editor Shadow/C Eyebrows/メインdocsと非重複、元候補0/44。

## 2026-10-05 Original Shadow製品Editorへの限定mount（実装前）

Bは実Trial Session/二層UI/保存後verified Previewへ束縛する独立bridgeを専用5/5・関連27/27・buildで返却。AはBlush新規純粋module、CはEyebrows新docsのみなので、Bのみ`apps/web/src/editor-ui.mjs`のOriginal Shadow限定節と新規専用Editor UI/Browser bundle試験を排他編集し、既存bridgeを実製品EditorのAfter専用操作へmountする。実Trial本人/選択/対象・背景SHA/Recipe版・両Original出典が揃わなければ操作をdisabledまたはfail-closed。Before/切替/保存失敗/取消/失効/異寸法/Add Shadow併用で旧Previewや偽成功を出さず、既存Editor機能を維持。新実Chromeは本人の朝挨拶前に実行せず、Node fixture bundleと実Trial SQLite合成非RAWまで。実RAW/実機/Cloud/元AI自動機能は別Gate、0/44。

## 2026-10-05 EV3-0169 Facial Reshape/Eyebrows差分監査（実装前）

CはXMP取得→別Asset限定取込の実JWT/SQLite往復3/3・関連24/24・buildを返却。次は独立候補`EV3-0169 Facial Reshape / Eyebrows`の下位操作を、Cのみ新規`docs/EYEBROWS_COMPLETION_AUDIT.md`と新規専用監査試験で一次資料/現製品と照合する。眉形状・眉メイク・顔全体の明るさを名前だけで重複/完成とせず、処理内容/対象/保存/Final/Preset/端末差を分ける。安全な最小実装単位が特定できれば報告し、追加割当前に既存製品コードを変えない。A Blush/B Shadow/メインdocsと非重複、Cloud/実機/RAWは別Gate、0/44。

## 2026-10-05 Blush本人手動・単一頬彩色の純粋画素核（実装前）

AのEV3-0030監査4/4・関連20/20で、公式12スタイルの位置/形/合成式は不明、現SUITEにはBlushの実画素/保存/Finalが無いと確定。Aのみ新規`apps/web/src/processing/manual-blush-color.mjs`と新規専用試験に排他を与え、本人明示の頬mask内のSUITE独自・単一色彩合成をRGBA8に限定して実装する。入力Asset UUID/Original SHA/person/原寸/版/マスク出典、色/不透明度、Abort/容量を厳格検証し、mask外RGB・alpha/hidden RGB・入力/RAW Originalを不変にする。mask出典の自称値を認可に昇格させず、公式12スタイル同等性やAI自動頬検出を主張しない。既存Recipe/Session/UI/Worker/Backend/Cloud、B Shadow/C XMP、メインdocsは読取り専用。純粋部品だけで元候補0/44。

## 2026-10-05 Smart Culling XMP取得→限定取込の往復検証（実装前）

Cはverified Node PanelのXMP限定取込を新5/5・関連69/69・buildで返却。次はCのみ新規`apps/web/tests/workspace-culling-xmp-roundtrip.test.mjs`を排他編集し、認証済みNodeの保存済みRating/Labelから既存XMP取得bytesを作り、別の本人明示AssetでPreview→別クリック取込→CAS/readbackまで実JWT HTTP/SQLiteで往復する。現出力形式と厳格parserの不整合があれば、C所有の`workspace-culling-xmp-sidecar.mjs`/`workspace-culling-xmp-import.mjs`のXMP形式限定箇所だけを最小修正し、既存無効XML/Reject/他mark保持/権限試験を再実行する。これは一般的他アプリ互換、写真同一性の推測、Trial/Cloud/RAW/実Chromeの証明ではない。A Blush/B Shadow/メインdocsと非重複、0/44。

## 2026-10-05 EV3-0030 Blush独立候補の差分監査（実装前）

AはDesktop↔iPad互換性の保存Recipe読取り表示を専用4/4・関連13/13・buildで返却。次は独立44候補のうち`EV3-0030 Makeup components / Blush`を、Aのみ新規`docs/BLUSH_COMPLETION_AUDIT.md`と新規専用監査試験に排他割当する。元一次資料・公式一次資料のBlush下位操作と現SUITE Face/Local/Makeupの実画素、UI、Recipe/保存/Final/Preset差を照合する。名称一致や汎用Face BrightnessをBlush実装に転記せず、未接続を明示する。調査だけでは完了を増やさない。既存製品コード・Backend/Cloud・A以外の担当ファイルは読取り専用。実装可能な安全な最小差分を提案し、追加割当まで製品変更なし。元候補0/44。

## 2026-10-05 Smart Culling限定XMP取込の製品Panel接続（実装前）

Cは限定XMP解析・本人明示確認・Node CAS/readback部品を専用6/6・関連16/16・buildで返却。次はCのみ`apps/web/src/workspace-culling-panel.mjs`のXMP取込限定節、`apps/web/src/workspace-culling-verified-mount.mjs`のverified host限定節、新規専用試験を排他編集する。本人選択の単一sidecarを4KiB以内のbytesとして読み、Rating/LabelのPreviewを表示後、別クリックで明示適用する。Node本人/Asset SHA/Project版/選択をfresh Gateし、Flag/Tags/Segment/Originalを維持。未知XML/Reject/取消/切替/失効/競合/不確定は成功表示しない。通常Trial/Cloud OIDC hostやOS XMP互換は作らず、実Chrome/RAW/公開配備は別Gate。A Editor互換表示/B Shadow bridge/メインdocsと非重複、元候補0/44。

## 2026-10-05 Original Shadow製品Editor接続の独立bridge（実装前）

Bは通常openAsset→Preview/dirty変更/Undo/Redo/save後再Gateを新規9/9・旧Final6/6・関連83/83・buildで返却。Aが`editor-ui.mjs`を互換性表示で所有中のため、Bは新規`apps/web/src/original-shadow-editor-bridge.mjs`と新規専用試験のみを排他編集する。既存手動二層UI・実Trial host callback・Sessionへ本人の選択/保存版/両Original出典を束縛し、偽host・古い選択/版・Add Shadow同時・取消/失効で拒否する。共有Editor/Session/Backend/Cloudは読取り専用。bridgeだけでは製品mount/実RAW/Chrome/全元候補を完了としない、0/44。

## 2026-10-05 Desktop↔iPad互換性の現Recipe読取り表示（実装前）

AはLR-02の公式Show Histogram全体表示切替を新2/2・関連19/19・buildで返却。次は独立候補EV3-0873の現在Web Recipe→Apple能力差を、Aのみ新規`apps/web/src/cross-device-compat-report-ui.mjs`と新規専用試験、必要な`apps/web/src/editor-ui.mjs`の互換性表示限定節を排他編集する。既存`cross-device-capabilities.mjs`の保守的data-only reportを使い、本人の現在選択・保存済みRecipe版を表示時に固定し、supported/unverified/unsupportedを個別表示する。これは読取り専用の事前確認であり、iPadへの転送、Apple描画/実機互換、Preset Apply/Final、認証を有効化しない。未知値・選択/版変更・失効で古いレポートを破棄し、動かない「転送」ボタンは追加しない。B Session Shadow/C XMP/メインdocsとファイル非重複、元候補0/44。

## 2026-10-05 Original Shadow保存後Preview再検証（実装前）

Bの通常Previewは新規実Trial/SQLite＋Worker 8/8、旧Final6/6、Session安全64/64、buildで限定到達。保存二層文書付きの通常編集でUndo/Redoや露光調整後dirty Previewを拒否してしまうため、Bは現排他openAsset/refreshPreview限定で保存Shadow文書・元版が不変の場合のdirty Previewを安全接続する。さらに`apps/web/src/session.mjs`のOriginal Shadow限定save後節と新規専用試験を追加排他割当し、CAS保存/再読込後の文書/版/両Original/provenanceを再検証してPreviewを更新、失敗時は旧画像や偽保存成功を見せない。一般保存/他Recipeは変更しない。実RAW/Chrome/CloudとEditor mountは別Gate、元候補0/44。

## 2026-10-05 LR-02 Histogram全体表示切替（実装前）

AはAdobe公式の`Show Clipping in Histogram`を既存指標の可視性だけに追加し、新2/2・関連17/17・build PASSで返却。次は同じ独立候補の別の公式明示操作`Show Histogram`を、Aのみ`apps/web/src/editor-ui.mjs` Histogram限定節と新規専用試験、`docs/HISTOGRAM_COMPLETION_AUDIT.md`追補で扱う。図全体を隠しても再表示操作を到達可能に残し、写真overlay/J/左右指標状態/5領域Recipe・Finalには触れない。Editor全体の3点メニューを新設して他機能を移動しない。現UIに適した小さな実操作とし、Keyboard/focus/44px/狭幅/reduced-motionを試験。Adobe独自閾値・RAW/色管理同等性は主張しない。B Session Shadow/C Culling/メインdocsと別、0/44。

## 2026-10-05 Original Shadow旧Final監査試験の追随（実装前）

Bの通常Previewが新規専用試験で安全に到達した場合、従来「Previewは必ず拒否」を期待した`apps/web/tests/original-shadow-final-trial.test.mjs`末尾06は陳腐化する。Bに同試験06のみを追加排他割当し、fixtureのURL生成を現Preview用に整えたうえで、Final拒否境界01〜05を維持し、実Preview/Finalの限定到達と失敗時fail-closedを正しくassertする。新Preview実装が未成立なら期待を変更しない。元候補0/44、実RAW/Chrome/Cloudは別Gate。

## 2026-10-05 Smart Culling限定XMP sidecar取込境界（実装前）

CはBulk Segmentを実JWT HTTP/SQLite新7/7・関連40/40・buildで返却。次はCのみ新規`apps/web/src/workspace-culling-xmp-import.mjs`と新規専用試験を排他所有し、本人が明示した単一Assetの外部XMP sidecarから既に文書化した`xmp:Rating`/`xmp:Label`だけを厳格読取・プレビュー→明示承認後にfresh Node本人/Project/Asset/Original SHA/版CAS→readbackで保存する。Pick/Tags/Segment/未知XMP/別写真推測/ファイル名自称を権限や原本同一性の証拠にしない。Original/sidecar自体は改変せず、未対応値は拒否し、失効/競合/Abort/応答不確定を成功扱いしない。Panel製品mount、Cloud/実Chrome/RAWは別Gate、元候補0/44。

## 2026-10-05 LR-02 Histogram残操作の差分確認（実装前）

AはExport Output Formの厳格setter/readbackを新4/4・関連15/15・buildで返却。次は独立候補LR-02の旧監査と現コードを照合し、左右個別切替/J/5領域drag/Undo/Redo/保存/Finalの現証拠を再確認する。Aのみ`docs/HISTOGRAM_COMPLETION_AUDIT.md`と新規専用試験、実際に不足が確認できた場合だけ`apps/web/src/editor-ui.mjs`のHistogram限定節を排他編集する。外部製品の数値閾値/右クリック仕様を推測せず、公式一次資料で明示される操作だけ扱う。BのSession Shadow Preview/CのCulling/メインdocsとファイル非重複。実Chrome/RAW/Cloudは別Gateで、現時点0/44。

## 2026-10-05 Export Preset既存Output Formの読書き境界（実装前）

AはNode JWTを現Trial/Sites Editorで証明できないため実Export Preset mountを有効化せず、非操作の案内/拒否試験を提出。次はAのみ`apps/web/src/export-output-adjustments-ui.mjs`と新規専用試験を排他編集し、現製品の手動Output Sharpeningフォームに厳格な設定setter/readback APIを追加する。既存手動Final/Cancel動作と`none`初期値を維持し、Preset選択/保存/Final済みとは表示しない。`editor-ui.mjs`/Backend/Sessionは今回読取りのみ。B Shadow Preview、C Culling、メインdocsと別、0/44。

## 2026-10-05 Original Shadow通常Preview到達性（実装前）

Bは同寸法1:1限定Finalを実Trial HTTP/SQLite＋合成非RAW Worker専用6/6・関連99/99で返却。次はBのみ`apps/web/src/session.mjs`のOriginal Shadow限定`openAsset`/`refreshPreview`節と必要なら`apps/web/src/processing/index.mjs`の同operation節、新規専用試験を排他編集する。保存済み本人Recipe/対象・背景Original bytes/SHA、両decode provenance、同寸法、権限/版を前後確認して既存手動runtime→Worker Proxyを通し、Before/切替/Undo/Redo/失効/Abortで旧画像や偽成功を出さない。異寸法/配置推測/Add Shadow同時は拒否。Editor mount、実RAW/Chrome/Cloudは別Gateで、元候補0/44。

## 2026-10-05 Smart Culling複数写真Segment割当（実装前）

CはBulk Rating/Flag/Colorを実JWT HTTP/SQLite新8/8・メイン独立8/8＋Tag10/10・build PASSで返却。次はCのみ`apps/web/src/workspace-culling-bulk-tags.mjs`の逐次CAS核と`workspace-culling-panel.mjs`のBulk限定節、新規専用試験を排他編集する。明示選択2〜20枚へ保存済みSegment IDまたは明示Unassignedを一操作一種で割り当て、既存Rating/Flag/Color/Tagsを保持。fresh本人/Project版/Segment実在/選択、個別CAS/readback、部分/不確定/失効/取消を正しく示す。Backend/Cloud/AI/製品OIDC hostは読取りのみ、A Output Form/B Shadow Preview/メインdocsと別、0/44。

## 2026-10-05 Export Preset実Editor接続境界（実装前）

Aは保存/一覧/再読込/選択UIを実JWT HTTP/SQLite3/3・関連6/6で返却。次はAのみ`apps/web/src/editor-ui.mjs`のExport設定限定節と新規`apps/web/src/workspace-export-preset-editor-host.mjs`、新規専用試験を排他編集する。現EditorがTrial認証でNode Workspace Export Presetは別JWT正本なので、同一本人/tenantの安全なhost注入経路が存在するか先に監査し、存在する場合だけ実Export controlsの4設定Apply→readback→Final option snapshotへ接続する。認証host不在ならUIを製品上で有効にせず、橋渡し可能な範囲と未接続証拠を試験する。保存・選択だけでFinal適用/命名済みとしない。`session.mjs`のOriginal Shadow限定節はB排他、CのCulling Panelは別、メインはdocs/回帰のみ。実Chrome/RAW/Cloudは別Gate、元候補0/44維持。

## 2026-10-05 Smart Culling複数写真の手動Rating/Flag/Color（実装前）

Cは複数写真Bulk TagのVerified Node画面接続を実JWT/SQLite新4/4・関連15/15・build PASSで返却し、メインも専用4/4＋部品6/6を独立PASS。次は同一Smart Culling候補の固有手動操作として、Cのみ既存`apps/web/src/workspace-culling-bulk-tags.mjs`の逐次CAS安全核と`workspace-culling-panel.mjs`/`workspace-culling-verified-mount.mjs`のBulk限定節、新規専用試験を排他編集する。本人の明示選択2〜20枚へのRating(0–5)、Flag(none/pick/reject)、Color Label(既存許容値)のうち**一種類ずつ**変更し、他mark/Tag/Segmentを保持する。既存Tag追加/除去を破壊せず、fresh本人/Project版/選択、部分結果/不確定/中断を同じfail-closed契約で確認。Node手動操作に限定しAI/Final/Cloudを称さない。A Export Preset UI/B Shadow Session/メインdocsと非重複で0/44維持。

## 2026-10-05 Original Shadow Trial Final接続境界（実装前）

Bは認証済みTrial host adapterを実HTTP/SQLite専用6/6・関連29/29・Web build PASSで返却し、メインも専用6/6を独立PASS。次はBのみ`apps/web/src/session.mjs`のOriginal Shadow限定Final節、必要なら`apps/web/src/processing/index.mjs`の同operation限定節と新規専用実Trial HTTP/SQLite＋合成非RAW Worker Final試験を排他編集する。既存`exportFinal()`は保存Recipe/実Original bytes SHA/RAW decode後のpixelsを持つため、その証拠を対象/背景双方に結び付け、既存手動runtime→独立Worker画素演算をFinalの正しい処理順に接続できるか監査する。実decoded frameとOriginal bytesの真正性・背景Asset/画素/Recipe固定・再読込/失効/Abortを安全に証明できなければFinalは従来どおり拒否し、推測実装しない。既存Editor/UI/Backend/Cloud、A Export UI、C Culling Panelは読取りのみ。実RAW/実Chrome/公開は別Gateで、元候補0/44維持。

## 2026-10-05 Export Preset本人操作UI（実装前）

AはNode Workspace Export Preset認証済みclientを実JWT/SQLite専用3/3・関連9/9・build PASSで返却し、メインも専用3/3を独立PASS。次はAのみ新規`apps/web/src/workspace-export-preset-ui.mjs`と新規専用実JWT HTTP/SQLite試験を排他編集する。本人が明示したPersonal/Workspace保存・一覧/再読込・選択を既存clientへ接続し、設定4項目の編集/readbackと版CAS/role/失効を試験する。実Export操作へのApplyはhostが現Final設定への反映とreadbackを証明できる場合だけ有効にし、host未接続時はdisabled・未適用表示。単なる選択や保存をFinal適用/命名の証拠にしない。既存Editor/Session/Backend/Final/Cloudは読取りのみ、B Shadow host/C Culling Panel/メインdocsと別、0/44。

## 2026-10-05 Smart Culling Bulk Tag画面接続（実装前）

Cは複数写真Tagの逐次CAS部品を実JWT/SQLite新6/6・関連9/9・build PASSで返却し、メインも専用6/6を独立PASS。次はCのみ`apps/web/src/workspace-culling-panel.mjs`と`apps/web/src/workspace-culling-verified-mount.mjs`のBulk Tag限定箇所、新規専用Panel/実JWT HTTP試験を排他編集する。現verified mountから期待本人/tenantと現在の明示順selectionProviderをPanelへ渡す必要があり、Panel単独の選択Setを認証正本としない。現Panelの本人明示選択2〜20件から単一Tag追加/除去をユーザー操作時だけ開始し、既存保存Project版とhost selectionProviderを結ぶ。各写真の結果/部分成功/不確定/再読込必要を正直に表示し、失効/切替/取消後の誤成功や二重実行を防ぐ。既存Backend/Client/Final/Cloudは読取り、AI自動/原子的一括/公開は主張しない。A Export client/B Shadow adapter/メインdocsと別で0/44維持。

## 2026-10-05 Original Shadow保存結果不確定文言（実装前）

既存手動二層UIはhost callbackがCAS保存後のreadback/通信失敗でrejectした場合も「下書きは未適用」と断言してしまう。実際には保存済みか不確定のため、メインのみ`apps/web/src/original-shadow-manual-ui.mjs`の失敗文言と専用試験を最小変更し、拒否/通信失敗を区別できない時は再読込確認を促す。Bの新規Trial host adapterは同UIを読取りのみ、A/Cの排他と非重複。保存/Final成功を偽らず0/44。

## 2026-10-05 Export Preset認証済みWeb client（実装前）

AはNode WorkspaceのExport Preset保存正本をJWT HTTP/SQLite専用3/3、関連31/31、TS build PASSで返却。次はAのみ新規`apps/web/src/workspace-export-preset-client.mjs`と新規専用試験を排他編集する。実Backend契約に合わせて本人の短命Bearerでlist/get/create/updateを行い、同一origin、redirect拒否、no-store/no-referrer、版CAS・typed設定を厳格照合する。tokenを永続化・ログ/返却せず、別tenant/失効/競合は成功扱いしない。既存Editor/Session/Final/命名・Cloudは読取りのみで、実適用/出力は未接続、元候補0/44維持。B Original Shadow host/C Bulk Tags/メインdocsと別ファイル。

## 2026-10-05 Original Shadow Trial host adapter（実装前）

Bは二層手動UIを専用6/6・関連17/17・Web build PASSで返却。次はBのみ新規`apps/web/src/original-shadow-manual-trial-host.mjs`と新規専用実Trial HTTP/SQLite試験を排他編集する。現UIのhost callbackに本人の現Session/対象・背景登録Asset/SHA/原寸/保存Recipe版をfreshに供給し、保存時はNode既存CASを通す。別写真/背景/版変更、失効、cancel、partial失敗では成功表示せず、後続Final/実Original証明を主張しない。既存Editor/Session/Worker/Backend/Cloudは読取りのみ、元候補0/44維持。A Export Preset client/C Bulk Tags/メインdocsと別ファイル。

## 2026-10-05 Smart Culling複数写真の手動Tag適用（実装前）

CはTag/AND-OR絞込を現Panelへ実JWT/SQLite新3/3・関連11/11・build PASSで返却。次はCのみ新規`apps/web/src/workspace-culling-bulk-tags.mjs`と新規専用試験を排他編集し、本人が明示順に選んだ2〜20枚へ1つのTag追加/除去を既存Node Culling CAS APIで試みる。Project集合版・各写真の現在mark/本人roleをfreshに検証し、他Mark値を保持、失効/競合/Abort/途中失敗では全件成功や原子的rollbackを偽らず各件結果と再読込必要状態を返す。既存Backend/Client/Panel/Final/Cloudは読取りのみ。A Node Export Preset Backend/B Original Shadow UIとは非重複、0/44維持。

## 2026-10-05 Smart Culling手動Tag/AND-OR絞込UI（実装前）

CはXMP限定sidecarのverified Node画面取得を実JWT/SQLite新4/4・メインCulling全関連35/35・build PASSで返却。次はCのみ`apps/web/src/workspace-culling-panel.mjs`の手動filter節と新規専用試験を排他編集し、既存Project全件版固定のStars/Flag/Color/Segmentに保存済みTagとAND/OR方式を加える。タグ値は現Projectの保存済みmarkからのみ列挙し、同一版・明示選択を保ち、条件変更/途中CAS変更/失効でpreflight参考結果を無効化する。現純粋`filterManualCullingAssets`契約と意味が一致するよう照合し、AI自動判定/Final/Cloudへ拡大しない。A Node Export Preset Backend/B Original Shadow新UI/メインdocsとは別ファイル、0/44維持。

## 2026-10-05 Node Workspace Export Preset保存正本の追加（実装前）

Aは現repoの静的4件推薦catalogには保存版・実適用記録が無いと確認し、偽のExport Preset名証拠を作らず変更0で返却。EV3-0764欠落2命名方式の土台として、AはNode Workspace SQLiteの**新しいExport Preset専用正本**だけを最小追加する。対象排他は`apps/backend/src/workspace.ts`と`workspace-server.ts`のExport Preset限定節、新規専用Backend/JWT HTTP試験。本人/tenant/Workspace role・name・version・設定（format/size/resolution/output sharpening）の型、create/list/get/updateのCAS、失効/Viewer拒否、旧DBの非破壊再起動を確認する。既存写真編集Preset/Recipe/RAW/Asset/Cloud D1を変更せず、UI/Finalへの実適用snapshot・命名証拠は別Gate。B Original Shadow新UI/C Culling UI/メインdocsとは非重複、0/44維持。

## 2026-10-05 Original Shadow二層手動UI（実装前）

Bは独立Workerの手動Shadow実画素を専用5/5・関連21/21・Web build PASSで返却。次はBのみ新規`apps/web/src/original-shadow-manual-ui.mjs`と新規専用試験を排他所有し、本人がsubject/shadowを別レイヤでADD/ERASEできるPointer/Touch/Keyboard・Opacity/Undo/Redo/取消・focus/tap境界を、既存typed文書/原寸座標へ接続する。認証済みhost callbackと対象/背景/版証拠が無ければSave/Applyを有効にしない。UI表示をAI自動抽出や実Final成功と誤認させず、既存Editor/Session/Worker/Backend/Cloudは読取りのみ。A Export Preset証拠/C Culling UIとは非重複、0/44維持。

## 2026-10-05 Export Preset名の実適用証拠（実装前）

AはExport size公式を一次照合し、比率不一致時の未記載方式を推測せず変更0で返却。次はEV3-0764の`original-export-preset`/`original-effect-export-preset`の欠落を、実際に適用されたExport Preset名が存在するかというデータ契約から調査・実装する。Aのみ新規`apps/web/src/export-preset-naming-evidence.mjs`と専用試験を排他所有。現Export UI設定と保存済み設定Presetをfresh版・値一致で検証できる既存正本がある場合だけ命名証拠を発行し、単なる一覧名/選択表示/任意caller文字列では発行しない。保存正本が無ければ偽Presetを新設せず、必要な契約と未接続点を明示して停止する。Editor/Session/Backend/Cloudは読取りのみ、B Worker/C Culling UIと非重複、0/44。

## 2026-10-05 Export size specific dimensions差分の公式照合（実装前）

AはCanvas Expand非同期取消をSession限定で専用8/8・関連85/85・build PASSで返却。次は別候補EV3-0757の「specific pixel dimensions」と現`dimensions`=縦横比維持bounding boxの差を公式Evoto一次資料で照合する。Aのみ`apps/web/src/export-size.mjs`/`export-size-selection.mjs`の寸法限定箇所、新規専用試験を排他所有し、公式根拠がある場合のみ既存`dimensions`契約を壊さない加法的な正確寸法方式を実画素/Final/表記まで検討・実装する。歪み/切取/余白の方式が公式から断定できなければ仕様を推測して追加しないで差分と停止点を報告。UI/Session/Worker/Cloudは他担当との重複を避け現段階で読取りのみ、元候補0/44維持。

## 2026-10-05 XMP sidecarのNode手動選別画面からの明示取得（実装前）

Cは各巡同一Bearer/再認証のXMP read-time Gateを実JWT/SQLite専用6/6・build PASSで返却。次はCのみ`apps/web/src/workspace-culling-panel.mjs`と`workspace-culling-verified-mount.mjs`のXMP限定箇所、新規専用試験を排他編集する。verified hostが本人/選択/対象SHAをfreshに把握できる時に限り、本人クリックの一写真に対して限定Rating/Label XMP bytesを生成し、安全名のsidecar downloadを提供する。Pick・Tags/Segment等の未対応状態は拒否し、成功誤表示・自動ダウンロード・token/URL漏えい・古いBlob URL残置を避ける。Node host未設定や実Chrome未確認を製品全体の接続と称さず、現Client/Backend/Original/Cloud/Finalは不変。メインはCulling client/mount排他を返却し、A Session/B Workerと非重複、0/44維持。

## 2026-10-05 Original Shadow独立Worker操作（実装前）

Bは二層stroke runtimeを実Trial HTTP/SQLite・合成非RAW4/4＋関連画素26/26・build PASSで返却。次はBのみ`apps/web/src/processing/worker.mjs`の新しい独立Original Shadow操作と必要最小facade/新規専用試験を排他編集し、同一Worker呼出し内のOriginal/合成背景/二層maskと保存文書の型・Asset/SHA/寸法/背景/版を検証して実画素を返す。caller提供decoded pixelsの原本由来はこの段階で証明できないため、その不足を明示して通常`render`/Finalへ黙示接続しない。入力不変/Abort/別写真/不正provenance/旧Recipeを試験し、Session/Editor/Backend/Cloudは編集しない。AのSession取消/C XMP/メインCullingとは非重複、0/44維持。

## 2026-10-05 XMP sidecar読取間の本人token切替拒否（実装前）

C提出XMP限定部品のメイン安全レビューで、Session gate・Culling read・Asset readが各々tokenProviderを呼び、途中で別JWTへ切り替わる可能性を確認。Cのみ新規`workspace-culling-xmp-sidecar.mjs`と専用試験を再排他所有し、1巡中は同一Bearerを短命に固定してSession/Asset/Cullingの全取得へ渡し、2巡目はfresh Bearer+本人/tenant/roleを再確認する。複数identityの継ぎはぎではbytesを生成しない。tokenを記録・返却・ログへ残さず、既存Node API/Cloud/Final/OSは不変、0/44維持。

## 2026-10-05 Canvas Expand host非同期取消のSession範囲追加（実装前）

Aの調査でoverlay側はAbortSignalを持つが`run('setCanvasExpansion')`からSessionへ渡しておらず、storage/permission/renderer中のEscape後に遅延commitし得る具体的欠陥を確認。完全取消にEditor限定の補償Undoは不十分なため、A排他へ`apps/web/src/session.mjs`のCanvas Expand/commitRecipe取消限定箇所と専用試験を追加。既存他調整・保存/Recipe/Original契約を維持し、実拒否/中断と遅延成功・写真切替を照合。B mask/C XMP/メインCullingはSessionに触れず、0/44維持。

## 2026-10-05 Manual Canvas Expand保留中host取消の安全試験（実装前）

Aは既存四辺overlayの重複接続を発見し、新実装をせずCrop/切替/取消関連90/90を再実行。残る具体的未検証差分として、`session.setCanvasExpansion`の非同期host処理が開始された後のEscape/pointercancel/Asset切替で、旧候補が遅れてRecipeへ書き込まれないかを専用合成試験で照合する。Aのみ`apps/web/src/editor-ui.mjs`のCanvas Expand節と新規専用試験を排他編集し、実欠陥があれば狭く修正。数値UI/他調整/Originalを不変にし、ブラウザ実操作は朝合図までNOT_RUN、0/44維持。B mask/C XMP/メインCullingとは非重複。

## 2026-10-05 Original Shadow手動2層mask実画素接続（実装前）

BはOriginal Shadow typed Node保存GateをTrial/Workspace実Asset/SHA・本人/CAS・Preset拒否まで専用6/6、関連安全22/22、build PASSで提出。次はBのみ`apps/web/src/processing/original-shadow-manual-runtime.mjs`（新規）と新規専用試験を排他編集し、保存されたsubject/shadow二層strokeから原寸とProxy別maskを再現、同一Original/背景/寸法・fresh保存版証拠を受けて既存`applyBoundOriginalShadow`へ接続する。本人自己申告を認証とみなさず、Pixel/Original/alpha不変、Abort/容量・別写真/別背景拒否を試験。現Worker/Editor/Final/Cloudは変更せず別Gateとする。A Editor/C XMP/メインCulling clientとは非重複、0/44維持。

## 2026-10-05 Manual Canvas Expand四辺ドラッグ製品Editor接続（実装前）

AはExport effect Preset命名の認証済み文脈を新規module・実JWT HTTP/SQLite専用5/5、関連安全18/18、build PASSで返却。次は別候補EV3-0701の既存四辺overlay/edge-drag部品を現製品Editorの手動Canvas Expand操作へ接続する。Aのみ`apps/web/src/editor-ui.mjs`と必要最小の`apps/web/src/editorial-editor.css`のCanvas Expand節、新規専用試験を排他編集。既存四辺数値とRecipe値を共用し、Pointer/Touch/Keyboard、取消・Undo/Redo、保存/再読込、合成非RAW Final、Crop/写真切替時の寸法を検証。現契約を黙示変更せず、AI Auto Expandや実RAW/実Chrome/Cloudを完成扱いにしない。B Original Shadow/C XMP/メインCulling境界とはファイル非重複、0/44維持。

着手前追補: Aが現Editorに既にedge overlay→`session.setCanvasExpansion`の接続と既存Browser fixtureを発見したため、二重接続は行わない。残るCrop変更/取消/版変化の安全差分を試験し、実欠陥があった箇所だけ上記排他範囲内で修正する。

## 2026-10-05 Smart Culling XMP sidecar限定生成（実装前）

CはDesktop↔iPad能力差レポートを新規module/専用試験7/7、旧互換6/6、build PASSで返却。次は別候補EV3-0894下位操作EV3-0919に移り、Cのみ新規`apps/web/src/workspace-culling-xmp-sidecar.mjs`と新規専用試験を排他編集する。既存の本人認証済みNode Cullingの選択/markから、明示した一写真分について既知のStars/Flag/色ラベルだけをXMP sidecar bytesへ安全に変換する。XMPの現行公式仕様と値対応を一次資料で確認し、未確認対応は失敗扱い。Original/RAWや写真metadataは変更せず、OS保存・一括出力・公開Cloud/Final連携や元候補PASSは別Gate。AのExport命名/BのOriginal Shadow/メインのCulling client/verified mountとはファイル非重複、0/44維持。

## 2026-10-05 Original Shadow Node保存Gate（実装前）

BはOriginal Shadow本人手動文書を保存版を固定しない形で専用6/6・関連17/17提出。次はBのみBackend photo-policy/repository/workspaceのoriginalShadowManual限定箇所と専用Backend/HTTP試験を編集し、実登録の対象/背景Asset・原本SHA、保存CAS/本人権限・写真固有Preset禁止と失効/競合/rollbackを照合する。Cloud Worker/schema/Session/Editor/Finalは触れず、Node限定の成功を製品全体PASSとしない。A Export命名/C cross-deviceと非重複、0/44維持。

## 2026-10-05 Export namingの適用済みEffect Preset文脈（実装前）

AはAuthor Vignette-onlyを限定提出し共有ファイルを返却。次はEV3-0764の既存命名`original-effect-preset`/`original-effect-custom`へ、Node Workspaceの実JWT認証済みAsset/SHA/保存Recipe/presetSnapshot/現在Preset版を渡せる新規`workspace-effect-preset-naming.mjs`と専用試験のみを編集する。catalogだけで適用済みと誤認せず、現選択/版/権限/tenant/原本の変化を拒否。UI/Final/OS保存名やTrial/Cloud連携は別Gateで、旧命名/Recipe/保存契約は不変。B Original Shadow/C cross-deviceと非重複、0/44維持。

## 2026-10-05 Culling bearer request redirect境界（実装前）

C返却済み`workspace-culling-client.mjs`と`workspace-culling-verified-mount.mjs`のNode bearer送信をメインが安全レビューする。現`fetch`はredirectを明示拒否せず、認証済みpreflight取得で予期せぬ転送先へ遷移し得るため、`redirect:'error'`、no-store/no-referrer、返却redirected拒否と専用試験を追加する。verified hostのfetch wrapperもredirect済み応答を隠さず拒否する。Cは別候補cross-device新規ファイルのみ、A/BもCulling client/mountを編集しない。API/選択/Final/Cloud契約や0/44は不変。

## 2026-10-05 Desktop↔iPad能力差の保守的データpreflight（実装前）

CはSmart Culling Web preflightを限定提出。次はEV3-0873の新規`cross-device-capabilities.mjs`と専用試験だけを編集し、実Web/Appleコードに根拠のあるstage/extension能力を両方向の版付きレポートとして返す。未対応フィールドを削除せずfail-closed/明示保留、既存Recipe/Apple/認証/転送/Renderer/Cloudを変えない。A Author/B Original Shadowと非重複で、iPad互換を完成と呼ばず0/44維持。

## 2026-10-05 Original Shadow本人手動文書（実装前）

BはGlow Full SHA pinを限定提出し、次にEV3-0394の既存画素部品を認証済み製品へ安全に接続する前段として、新規`original-shadow-manual-recipe.mjs`と専用試験だけを編集する。subject/shadow別stroke、同一Asset/SHA/原寸/保存版と容量・偽出典拒否を型で固定し、既存Recipe/原本を変更しない。本人申告は認証ではなくBackend保存Gate・Worker/Editor/Final・AI抽出は次工程。A Author/C Cullingと非重複、0/44維持。

## 2026-10-05 Author Vignette-only適用（実装前）

AのFull Author Vignette経路は対象3/3・関連154/154で提出。次はAのみ`author-ui.mjs`/`preset-facade.mjs`/`session.mjs`のVignette限定箇所と新規専用試験を編集し、明示Vignette-onlyを旧Fullから分ける。fresh公開版/対象Recipe/Original SHA/権限を照合し、他調整・写真固有maskを保持、Undo/Redo/CAS/合成Finalまで確認する。失効/競合/旧Presetは無変更拒否し、B Original Shadow新規文書/C Culling Web、Backend/Cloudは読取り専用。実Chromeは朝合図後、0/44維持。

## 2026-10-05 Culling preflightクライアント/Panel接続（実装前）

CはNode読取り専用preflightをBackend/HTTP42/42で提出し、返却を`authoritativeForFinal:false`と明示。次はCのみWeb Culling client/Panel/verified mountのpreflight限定箇所と新規試験を編集し、本人の選択Asset列・現Project集合版・Asset SHA・保存Recipe版をサーバへ送り、fresh本人/tenant/role/selectionを確認する。失効・選択/版変化・一部失敗はplan破棄、成功表示なし。ブラウザ側のpreflight応答をFinal認可と扱わず、Final renderer接続やtoken保存なし。A Author UI/Session、B Glow mount、Backend/Cloudは読取り専用。元候補0/44維持。

## 2026-10-05 Author Vignette Session merge（実装前追加）

Author portable型契約にpostCrop Vignetteが入っても、現`session.mjs`の`applyPortablePreset()`はglobals/postDecodeのみ取り込むため、Library ApplyからUndo/保存/FinalまでVignetteを運べない。Aの現排他へ同関数のVignette限定mergeと新規専用試験を追加する。旧global/postDecode、写真固有mask/Crop/Rotation/RAW WB、Undo/Redo/Recipe/Final、版/権限を維持。B Glow mount/C Culling BackendはSession読取り専用、Cloud変更なし。部分実装を元候補完成としない。

## 2026-10-05 Glow Workspace Full SHA pin（実装前）

BはCalibration Full SHA pinを実JWT HTTP/SQLite新6/6＋既存4/4で提出。次はGlow host注入mountだけにFull Applyの既存optional SHA必須送信を接続し、明示Full全置換とGlow-only部分保持を分離する。3モード×6値、旧sparse、写真固有Preset拒否、SHA/版/権限/Original不変を対象＋安全試験で確認。BのみGlow mount/新規試験を編集し、A Author Vignette/C Culling、Backend/Client/他mount/Cloudは読取り専用。全Web/実Chrome/RAW/Cloudは後段、元候補0/44維持。

## 2026-10-05 Author Vignette製品保存・適用経路（実装前）

Aはpost-Crop Vignette 5値の任意portable契約を新5/5・関連86/86で提出したが、製品UI/保存/適用/Finalは未接続。次はAのみ`author-ui.mjs`、`preset-facade.mjs`、必要なら`editor-ui.mjs`の該当箇所と新規専用試験を編集し、実Trial HTTP/SQLiteで保存済みRecipeからCapture→Draft保存/再読込→採用済みLibrary適用→Undo/Redo→CAS保存/再読込→Worker Finalへ通す。旧3値/postDecode・他調整・写真固有拒否、本人/期限/権限・Original不変を維持。B Calibration mount/C Culling Backend、Preset型契約/Cloudは読取り専用。新たな実Chromeは朝合図まで保留、元候補0/44維持。

## 2026-10-05 Culling選択のNode読取り専用preflight（実装前）

CはAsset集合のregister/trash/restoreで同transaction Culling版を進め、Backend7/7・Web Culling15/15を回復。次はNode Workspaceの明示選択Asset列について、同transactionでProject版、export権限、各Asset/SHA/登録・非trash、保存Recipe head/版を検査する読取り専用preflightを`workspace.ts`、`workspace-server.ts`と専用試験へ追加する。1〜20件等の上限、重複/別tenant/失効/版競合/部分結果は拒否し、データ更新しない。preflight応答は後のFinal時点の認可やimmutable Original snapshotではないため、製品Finalへ接続せず、実出力前後のfresh再照合は別Gate。Client/Panel/Session/Editor/Cloud/schemaは編集しない。元候補0/44維持。

## 2026-10-05 Calibration Workspace Full SHA pin（実装前）

BはGrain Full SHA pinを実JWT HTTP/SQLite新6/6＋既存4/4で提出。次はCalibration host注入mountだけにFull Applyの既存optional SHA必須送信を接続し、明示Full全置換とCalibration-only部分保持を分離する。6値、旧sparse、写真固有Preset拒否、SHA/版/権限/Original不変を対象＋安全試験で確認。BのみCalibration mount/新規試験を編集し、A Author portable/C Culling、Backend/Client/他mount/Cloudは読取り専用。全Web/実Chrome/RAW/Cloudは後段、元候補0/44維持。

## 2026-10-05 Culling Asset集合版に伴う旧Web試験期待更新（実装前）

Asset初回登録でProject cullingVersionを0→1へ進める契約により、旧Web Culling fixtureの`baseVersion:0`は意図的に陳腐化した。Cのみ関連`workspace-culling-*.test.mjs`と`smart-culling-*.test.mjs`の版取得・期待値を現保存済みProject版へ合わせる。本人/tenant/role/CAS/失敗時無変化のassertを弱めず、ソース契約を戻して試験だけ通すことはしない。A/Bはこれら試験読取り専用。Node限定でCloud D1/R2 schema/配備なし、0/44維持。

## 2026-10-05 Author portable PresetへVignette任意パラメータ（実装前）

AはCanvas寸法/比率限定表示を専用5/5・関連30/30で提出し共有Editor/CSS排他返却。次はVignetteの5調整を写真固有でない任意portable Author Presetとして型/順序/旧版互換の契約だけに追加する。Aのみ`apps/web/preset-policy.mjs`と`apps/web/src/preset-author/preset-author-contract.mjs`および新規専用試験を編集し、B Vignette Workspace mount/C Culling Backend、Editor/Session/Cloudは読取り専用。旧3値・postDecode、RAW WB/Crop/Rotation/写真固有mask/unknown拒否を維持。現製品UI保存/適用/再読込/Finalは次工程で接続するまでPASSと呼ばず、元候補0/44を維持する。

## 2026-10-05 Grain Workspace Full SHA pin（実装前）

BはVignette Full SHA pinを実JWT HTTP/SQLite新5/5＋既存5/5で提出。次はGrain host注入mountだけにFull Applyの既存optional SHA必須送信を接続し、明示Full全置換とGrain-only部分保持を分離する。7値/seed、旧sparse、写真固有Preset拒否、SHA/版/権限/Original不変を対象＋安全試験で確認。BのみGrain mount/新規試験を編集し、A Canvas/C Culling、Backend/Client/他mount/Cloudは読取り専用。全Web/実Chrome/RAW/Cloudは後段、元候補0/44維持。

## 2026-10-05 Culling Asset集合版境界（実装前）

CのNode手動絞込/明示選択は実JWT HTTP/SQLite4/4・Culling関連15/15・合成Chrome390pxまで提出されたが、Asset登録/ゴミ箱/復元がProject cullingVersionを進めず、UI二度走査は原子的証明にならない。次はCのみ`workspace.ts`の既存同transaction Asset集合変化とCulling版を結び、旧snapshot/CAS、tenant/role、失敗時無変化と旧DBを専用試験で確認。Schema/API/Cloud、B Vignette mount/A Canvas Editor、Client/Panel/Sessionは変更しない。これでも各Asset SHA/Export権限のFinal直前照合は別Gateであり、Finalへ接続しない。元候補0/44維持。

## 2026-10-05 Vignette Workspace Full SHA pin（実装前）

BはLevels Full SHA pinを旧sparse Full互換・Levels-only維持で専用7/7・Web1270/1270提出。次はVignette host注入mountのFull Applyのみ既存optional SHAを必須送信し、Full/only区別・5値・旧sparse・Original/他調整/写真固有maskとSHA/版/権限失効の拒否を確認する。BのみVignette mountと関連試験を編集、A Canvas/C Culling、Backend/Client/他Preset mount/Cloudは読取り専用。現OIDC host/実RAW/Cloudと元候補全要素は別Gate。

## 2026-10-05 Canvas Expand寸法・比率の実表示（実装前）

Aは四辺overlay製品Editor接続を合成非RAW実Chrome/Worker Final・専用2/2・全Web1263/1263で提出。次はCanvas限定Editor UI/CSSと専用試験だけで、証明済みCrop後寸法と四辺値から現在のPreview/Final出力寸法・比率を明示する。Asset/Crop/Undo・Redo/Reset/Before切替で再計算し、寸法不一致や未認証では偽表示しない。A以外はEditor/CSS読取り専用、B Levels mount/C Culling、Session/Worker/Backend/Cloudを変更しない。元候補のAuto AI Crop Syncや実RAW・実機・Cloud完成とは分ける。

## 2026-10-05 Levels Workspace Full SHA pin（実装前）

Bはoptional Full Preset SHA照合を同transactionへ接続し、Selective mountで必須送信、実JWT HTTP/SQLite4/4・Web1263/1263を提出。次は別候補Levelsのhost注入mountだけに同じpinを適用し、Full/only/旧sparseの動作とSHA変更時branch 0拒否を関連試験で検証する。BのみLevels mountとその試験を編集、Backend/Clientと他Preset mountは読取り専用。A Canvas Session/Editor、C Culling panelにも触れない。実OIDC host/RAW/Cloudは別Gate、元候補0/44を維持。

## 2026-10-05 Workspace Full Preset原本SHA原子的照合（実装前）

Selective host注入mount専用5/5・Web1257/1257提出後、既存Full Apply routeのOriginal SHAがRecipe CASと同transactionでpinされない残Gateを補う。Bのみ`workspace.ts`、`workspace-server.ts`、`workspace-preset-client.mjs`、Selective mountと新規関連試験を編集する。HTTP/client既存呼出しを破壊せずoptional SHAを受け付け、新Selective mountはそのSHAを必須にし、Asset変更・Preset/Recipe旧版・role失効はbranch 0で拒否。旧SHA未指定呼出しまで原子的保証と称さない。A Canvas製品Session/Editor、C Culling panel、Cloudは読取り専用。実OIDC host/RAW/Cloud・元候補全要素完成とは分ける。

## 2026-10-04 Smart Culling手動絞込・明示選択（実装前）

CはNode Workspace限定の色ラベル保存とSegment改名/並替を実JWT HTTP/SQLite3/3、実Chrome合成UI、Web1252/1252で提出。次は同じ`workspace-culling-panel.mjs`と新規試験で、保存済みProject pageのStars/Flags/Color/Segment手動絞込・明示Asset選択を追加する。ただしBackendのProject cullingVersionはAsset登録/ゴミ箱移動で進まないため、全pageを二度読んでも原子的な集合証拠にはならない。選択はUI上の参考状態だけで、サーバ側集合版/CASとAsset SHA/Export権限が揃うまでFinal対象へは渡さない。C以外はこのファイル読取り専用、AのSession/EditorとBのSelective mount・Backend/Client/Bootstrap/CSS/Cloudを変更しない。AI自動選別や現Trial/Cloud製品接続、元候補全要素完成を主張しない。

## 2026-10-04 A Canvas Expand Editor限定接続（実装前）

Aの四辺overlay独立UI（Node2/2、実Chrome合成Desktop/Mobile、全Web1245/1245）提出後、共有`apps/web/src/session.mjs`・`apps/web/src/editor-ui.mjs`のCanvas Expand限定接続をAへ排他で渡す。BはSelective Workspace Presetの新mount、CはCulling panelのみ編集し、両名とも共有Session/Editorを読取り専用とする。Canvas四辺の変更を既存Recipe/Undo・Redo/保存・Finalへ通すが、未接続の実RAW/実機/CloudはPASSにしない。既存契約・権限・他調整を変更せず、試験通過まで元候補0/44を維持する。

## 2026-10-04 Selective Color Workspace Preset host mount（実装前）

BはPersonal/Workspaceの9色域×CMYK4値・2方式のFull Save→Reload→Applyと版固定Selective-only原子的経路を実JWT HTTP/SQLite4/4、Backend199/199、Web1249/1249で提出し、Backend/Client排他を返却。次は新規`apps/web/src/selective-workspace-preset-mount.mjs`と専用試験だけへhost注入mountを追加する。AのCanvas製品Session/EditorとCのCulling panelには触れず、既存Recipe・Preset契約と権限/CASを維持。製品OIDC host/Bootstrapの自動接続、実Chrome/RAW/Cloudは別Gate、元候補0/44を維持。

## 2026-10-04 Selective Color Personal/Workspace Preset経路（実装前）

BはLevels host注入mountを専用4/4・既存HTTP併合9/9で提出したが、現製品Node OIDC host/Bootstrap自動mountはないため元候補完了に数えない。次は独立候補`EV3-0501 Selective Color`の現SUITE限定9色域×CMYK4値/Relative・AbsoluteをNode Workspace Personal/Workspace PresetのFull Save→Reload→Applyで確認し、必要な場合だけSelective-only版固定原子的適用を`apps/backend/src/workspace.ts`、`workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`と新規専用試験へ追加する。既存Recipe/Glow/Grain/Calibration/Vignette/Levels/photo-bound拒否、他調整/Original、本人/Asset SHA/CAS/権限を維持。A Canvas UI/C Culling panel、共有Session/Editor/Cloudは読取り専用。現OIDC host/実Chrome/RAWは別Gate。

## 2026-10-04 Smart Culling手動カラーラベル/Segment管理UI（実装前）

CはDNG Exif offset付き`capture-date-original`を単写真/Batch Finalの明示選択肢へ限定接続し、全Web1241/1241を提出、共有Session/Editorと命名ファイルの排他を返却した。残るExport Preset等の方式、実RAW/実Chrome/OS名が未確認なので元候補完了には数えない。次はCが別候補`EV3-0894 Smart Culling`の既存Node Workspace手動管理で、Backend/Clientに既にあるcolorLabel、Segment rename/reorderを実UIへつなぐ。Cのみ`apps/web/src/workspace-culling-panel.mjs`と新規専用試験を排他所有し、実JWT HTTP/SQLiteの本人/tenant/role/CAS、選択Asset、キーボード/Touch/focus、失効・競合/部分成功誤表示を検証する。既存Backend/Client/Bootstrap/Session/Editor/CSS、A Canvas/B Levels、Cloudは読取り専用。AI品質判定や元27操作の完成は主張しない。

## 2026-10-04 Levels Workspace Preset host mount（実装前）

BはRGB共同/R/G/B各5値のPersonal/Workspace full Save/Reload/ApplyとLevels-only版固定原子的適用を実JWT HTTP/SQLite専用5/5・Backend199/199で提出し、Backend/Client排他を返却した。全Webの一時失敗3件はCがExport naming旧期待を更新中の重複編集であり、BのLevels試験とは別。Bへ新規`apps/web/src/levels-workspace-preset-mount.mjs`と新規専用試験のみを排他割当し、既存host注入型Workspace Presetのfresh本人/tenant/membership/role/Asset SHA・Recipe/Preset版GateからLevels-only routeへ接続する。既存Bootstrap/Session/Editor/CSS/Backend/Client、A Canvas/C Export namingは読取り専用。現製品Node OIDC host・実Chrome/RAWは別Gate、mountだけで元候補全要素完了とは数えない。

## 2026-10-04 Capture-date旧回帰期待更新（実装前）

CのDNG限定撮影日方式を明示証拠必須で追加すると、旧`apps/web/tests/export-batch-manifest.test.mjs`の「方式自体が未対応」期待が陳腐化する。並行Web回帰で`apps/web/tests/export-naming-ui.test.mjs`にも新方式の明示リンク公開/入力検証に関する旧期待2件の失敗が出た。Cにこの既存2試験ファイルの撮影日限定assertだけを追加排他で渡し、「証拠無しは拒否」「証拠ありでも全Final完了前は0リンク」という現実の安全境界へ更新する。既存4方式の期待を緩めず、製品コードの拒否を外してテストだけ通さない。A Canvas/B Levelsは2試験を読取り専用、メインは最終全回帰。

## 2026-10-04 Canvas Expand edge overlay UI部品（実装前）

Aの直接edge drag変換は新規純粋部品専用8/8・Web1230/1230で提出されたが、製品Editorに未mount。Cが共有Session/EditorをExport namingで所有する間、Aは新規`apps/web/src/canvas-expand-edge-overlay.mjs`と新規専用試験、および`apps/web/src/editorial-editor.css`のCanvas専用スタイルだけを排他所有する。既存After写真の四辺handleから純粋drag部品を呼び、Pointer/Touch/Keyboard、focus/44px/reduced-motion、drag/click閾値、実host callback失敗時の表示/復元を確認する。既存Session/Editor/Worker/Recipe/Backend/CloudとC Export naming/B Levelsは読取り専用。host callbackを認証・保存成功と偽らず、製品mount/Final回帰前に元候補完了へ数えない。

## 2026-10-04 RGB Levels Personal/Workspace Preset経路（実装前）

BはHistogram左右別clip UIと既存5領域調整を全Web1222/1222で提出し、共有Session/Editor/CSS排他を返却した。実Chrome/実RAWは環境上NOT_RUNで完了数は未更新。次はBが独立候補`EV3-0492 Levels`の保存可能な全4ch×5値をNode Workspace Personal/Workspace Presetの既存Full Save→Reload→Applyで確認し、必要な場合のみLevels-onlyの版固定原子的適用を`apps/backend/src/workspace.ts`、`workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`と新規専用試験へ追加する。既存Recipe/Glow/Grain/Calibration/Vignette/photo-bound拒否、本人/Asset SHA/CAS/権限、他調整/Originalを維持する。C Export namingが共有Session/Editorを所有し、A Canvas新規部品は別担当。BはそれらとCloudを読取り専用とする。現製品OIDC host/実Chrome/実RAWは別Gate。

## 2026-10-04 Export naming DNG撮影日方式の製品接続（実装前）

CはVignette Workspace Preset host mount専用5/5・全Web1221/1221を提出したが、現製品Node OIDC hostがなくBootstrap自動接続は未安全。Cを別の独立候補`EV3-0764 Export naming`に移し、現存DNG限定Exif撮影日fresh Trial Gateを元Asset/Original SHA/Recipe版・export権限へ結び、offset付き`DateTimeOriginal`が証明された場合のみ`capture-date-original`を単写真/Batch Finalの明示選択肢として追加する。Cのみ`apps/web/src/export-naming-context.mjs`、`export-batch-manifest.mjs`、`session.mjs`、`editor-ui.mjs`の該当箇所と新規専用試験を排他所有する。offset無し/非DNG/偽日時、部分Batch成功、リンク自動クリック、OSファイル名保証、実RAW decode成功を偽装しない。B Levels Backend/Client、A Canvas部品、Cloudは読取り専用。対象方式が動いても残るExport Preset方式等があるため元候補全要素完了には数えない。

## 2026-10-04 Manual canvas Expand四辺edge drag部品（実装前）

AのMakeup Highlight手動UIは提出されたが、元候補の自動要所選択とfresh人物権限・製品Finalが未接続で全要素完成ではない。Bが共有Session/Editor/CSSをHistogramで所有する間、Aを次の独立候補`EV3-0701 Manual canvas Expand`へ移し、新規`apps/web/src/manual-canvas-expand-edge-drag.mjs`と新規専用試験のみを排他所有させる。既存四辺数値/背景/Crop後寸法の契約を読取り、原寸・表示倍率・pointer/touch/keyboard座標から明示四辺値へ変換する純粋操作部品を追加する。端点/拡大/上限、drag/click誤動作、RTLやスクロール、Abort/入力不変、アクセシビリティ用離散操作を検証する。既存Session/Editor/CSS/Worker/Recipe/Backend/CloudとB Histogram/C Vignetteは読取り専用。製品UI接続前はedge drag完了とも元候補完了とも数えない。

## 2026-10-04 Vignette Workspace Preset host mount（実装前）

Cは既存5値のPersonal/Workspace Preset full Save/Reload/ApplyとVignette-onlyの版固定原子的適用を実JWT HTTP/SQLiteで提出し、写真固有Teeth/Makeup maskがPresetへ混入する経路も拒否した。次は新規`apps/web/src/vignette-workspace-preset-mount.mjs`と新規専用試験のみをCへ排他割当し、既存host注入型Workspace Presetのfresh本人/tenant/membership/role/Asset SHA・Recipe/Preset版GateからVignette-only routeへ接続する。既存Bootstrap/Editor/Session/CSSとWorkspace Backend/Client、A Makeupは読取り専用。現Trial/Cloud OIDC host・実Chrome/実RAWは別Gateであり、新mountだけで元候補全要素完了とは数えない。

## 2026-10-04 Vignette Preset接続の写真固有mask安全境界（追加事前通知）

Vignette-only適用ではtargetの既存写真固有maskと他調整を保持する。一方、現Node Workspace FULL_REPLACE Presetの禁止リストはB/W EdgeとAdd Shadowのみで、新たな`teethManual`/`makeupHighlightManual`がcreate/updateまたは旧保存済みPresetのapplyから別Assetへ持ち込まれる余地がある。Cの排他`apps/backend/src/workspace.ts`でこの2キーを同じ写真固有禁止境界へ追加し、既存B/W/Add Shadow/Glow/Grain/CalibrationおよびPreset権限/CASの振る舞いを変えない。共有Recipe Schema・Cloud・Session/UIは編集せず、新規専用実JWT HTTP/SQLite試験で拒否と旧経路を確認する。

## 2026-10-04 Vignette Personal/Workspace Preset実経路（実装前）

CのTeeth fresh Trial Gateは本人/Asset/SHA/版/権限を実HTTPで確認しても、認証済み人物inventoryが現製品にないため人物IDでfail-closedとなった。Teethの偽認証迂回はせず、Cを次の独立候補`EV3-0570 Mobile Post-Crop Vignetting`へ移す。Cは`apps/backend/src/workspace.ts`、`workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`と新規専用試験だけを排他所有し、既存5値のPersonal/Workspace Preset Save→Reload→Apply、および必要な場合のみVignette-onlyの版固定・Asset SHA/CAS・権限確認を追加する。既存全Recipe/Glow/Grain/Calibration/photo-bound拒否、Original・別調整、feature gateを維持する。共有Session/Editor/CSSはB Histogram、A Makeup UI新規ファイルはA所有。CはこれらとCloudを読取り専用とする。製品OIDC host/実Chrome/実RAWは別Gate、元候補完了にはまだ数えない。

## 2026-10-04 Makeup Highlight本人手塗りUI部品（実装前）

Aのtyped Recipeとstroke mask runtimeは提出済みだが、本人認証・製品Session/UI/Worker/Finalは未接続。Bが共有Session/Editor/CSSのHistogram限定箇所を所有する間、Aは新規`apps/web/src/manual-makeup-highlight-ui.mjs`と新規専用試験のみを排他所有する。本人が選択した人物と写真に対するAfter手描きADD/ERASE、Intensity、取消・再実行、Touch/Pointer/Keyboard/focusを、外部hostの実コールバックが無ければ保存/適用不能な独立UIとして実装する。ストローク文書は既存typed契約と一致させ、本人/Asset/SHA/版のUI自己申告を認証として扱わない。共有Session/Editor/CSS、Worker/Backend/CloudとB Histogram/C Teethは読取り専用。fresh host Gateと製品統合後に再検証し、元自動Highlight完了には数えない。

## 2026-10-04 Histogram左右clip独立操作の製品接続（実装前）

BのFacial Expression口元inventoryは公式topologyの読み取り候補として提出されたが、現顔モデルでは姿勢/遮蔽を証明できず製品E2Eへ昇格できない。Bを次の独立候補`LR-02 Histogram and clipping`へ移し、既存4ch/写真上青赤警告/5領域トーン操作を保ちながら、左右clip警告の個別button/状態を製品Session/UI/CSSと専用試験へ接続する。Bのみ既存`apps/web/src/session.mjs`、`editor-ui.mjs`、`editorial-editor.css`のHistogram限定箇所と新規専用試験を排他所有する。`J`一括操作、Before非表示、asset切替reset、OverlayのFinal/Recipe非混入、Keyboard/focus/tap領域を維持し、既存編集経路の保存/Undo/Redo/Finalを実経路で再確認する。A Makeup/C Teethは共有3ファイルを読取り専用。実Chrome/RAW/元Adobe画素同等性は別Gateで、監査判定前に44件完了へ数えない。

## 2026-10-04 Teeth手動経路のfresh Trial Gate（実装前）

Cの保存strokeから原寸/Proxy maskを作る限定部品は専用5/5・Web1187/1187を提出済み。ただしcaller自称の本人/人物/版を製品認証として扱えない。Cへ新規`apps/web/src/manual-teeth-trial-gate.mjs`と新規専用実Trial HTTP/SQLite試験を排他で渡し、fresh Session本人、対象Asset/Original bytes SHA、保存Recipe版、編集/書出し権限、および既存製品が証明可能な場合だけ人物IDの一意性を照合する。人物IDの信頼証拠が不足する場合は明確に拒否して報告し、UI自己申告で迂回しない。既存Session/UI/Worker/Backend/CloudとA Makeup/B Facial Expressionは読取り専用。Gate未確認のままPreview/Finalへ接続せず、元AI Teeth全体の完成に数えない。

## 2026-10-04 Makeup Highlight手動stroke mask runtime（実装前）

Aのtyped `makeupHighlightManual` Recipe構造検証は提出済み（Backend199/199、Web1182/1182）。次はAが新規`apps/web/src/processing/manual-makeup-highlight-mask-runtime.mjs`と新規専用試験だけを排他所有し、保存済みnormalized ADD/ERASE strokeをProxy/原寸ごとに再ラスタ化する。Asset/Original SHA/person/保存版/target寸法、作業量・Abort、mask外・入力不変を検証し、caller自称の本人確認は認証根拠にしない。既存Session/UI/Worker/Backend/CloudとB Facial Expression/C Teethの新規部品は読取り専用。fresh host Gateと製品接続前は元自動Highlight完成に数えない。

## 2026-10-04 Facial Expression口元landmark read-only部品（実装前）

BのEV3-0243監査で現顔oval/Face Brightnessは上唇・口角形状と別機能と確定した。次は公式MediaPipeの口元トポロジー根拠が確認できる範囲だけで、既存SHA固定FaceLandmarkerのraw landmarksから明示person/Asset/Original SHA/model SHA/原寸に束縛したread-only口元inventoryを新規moduleと専用試験で作る。顔ovalを口元と偽装せず、欠落・複数曖昧顔・側顔/遮蔽を証明できない入力・モデルずれは安全に拒否する。既存`faces.mjs`/Session/UI/Recipe/Worker/Backend、A Makeup契約/C Teeth mask runtimeは読取り専用。inventoryだけでSmile/Neutral生成、元候補完了を主張しない。

## 2026-10-04 Makeup Highlight監査期待更新（実装前）

Aのtyped `makeupHighlightManual` Recipe検証では未知`makeupHighlight`偽キーを明示拒否するため、旧`apps/web/tests/makeup-highlight-completion-audit.test.mjs`の「汎用Node validatorで偽キーを受ける」期待が陳腐化する。Aへ同監査試験と`docs/MAKEUP_HIGHLIGHT_COMPLETION_AUDIT.md`の現状追補も排他で渡す。旧状態を履歴、現拒否を現在として区別し、本人認証/保存/Worker/Final・元自動Highlight未接続は維持する。安全拒否を取り除いてテストだけ通すことはしない。

## 2026-10-04 Makeup Highlight本人手塗りRecipe契約とFacial Expression監査（実装前）

Aの手動Highlight純粋部品7/7は、既存Local Levels画素核を本人指定mask内だけへ限定するが、製品保存/Finalは未接続。Aへ`photo-policy.ts`と新規専用試験を渡し、bitmap/自称認証を保存しないAsset UUID/Original SHA/person/原寸・bounded normalized stroke/Intensityのoptional typed契約を追加する。旧Recipe v1/他拡張/処理順を維持し、未知Makeup Highlight偽キーを完成済み扱いにしない。BはCalibration Workspace mount4/4を返却し、独立候補EV3-0243 Facial Expressionの元固有操作と現Face/Portraitの差を新規監査文書/試験だけで照合する。C Teeth mask runtimeは別新規ファイル、A/B/Cは互いの既存製品sourceを共有編集しない。どちらも元候補全要素完了数を増やさない。

## 2026-10-04 Teeth本人ストロークmask再ラスタ化（実装前）

Cはoptional typed `teethManual`の構造検証と旧監査更新を提出し、Backend194/194・Web1178/1178を確認して共有Backendファイルを返却した。次は保存された正規化ADD/ERASEストロークを、原寸と1600px Proxyそれぞれで独立にmask化する新規部品と専用試験だけを追加する。既存`subject-mask-authoring`/B/Wマスクの座標・仕事量/Abort原則を再利用し、Asset/Original SHA/person/保存版/寸法/targetの照合、mask外・透明画素・入力不変を確認する。callerの`ownerConfirmed`やmask provenanceは本人認証に使わず、製品hostのfresh権限Gateがない間はWorker/Session/Finalへ接続しない。A Makeup pure/B Calibration mount/既存Recipe・Cloudは読取り専用、元AI Teeth候補全体の完成とは数えない。

## 2026-10-04 Teeth監査期待更新（実装前）

Cのtyped `teethManual` Recipe構造検証は、従来汎用Node validatorで通っていた未実装`teeth`偽キーを明示拒否する。旧`apps/web/tests/teeth-completion-audit.test.mjs`の「偽キーはNodeで受理される」期待は陳腐化したため、Cへ同試験と`docs/TEETH_COMPLETION_AUDIT.md`の追補も排他で渡す。新構造検証/失敗閉鎖を正直に記し、認証・保存・Worker/Final未接続や元AI歯処理の未実装はそのまま残す。旧安全拒否や履歴を隠さない。

## 2026-10-04 Calibration Workspace Preset host mount（実装前）

BはNode WorkspaceのPersonal/Workspace PresetでCalibration6値のSave/Reload/全体適用と、同一transactionのCalibration-only適用を実JWT HTTP/SQLiteで確認した。次は既存host注入型Workspace Presetの本人/tenant/membership/role/Asset SHA/保存版/Preset版を利用するCalibration専用mountを新規module/専用試験だけで接続する。既存Bootstrap/Editor/Session、Backend/Client、A Makeup pure、C Teeth契約は読取り専用。現Trial/CloudのOIDC host・実Chrome/実RAW/Cloudは未確認Gateを残し、限定mountだけで元候補完了としない。

## 2026-10-04 Makeup Highlight本人手塗り限定純粋部品（実装前）

AのEV3-0001監査で、元Intensityは顔の要所を自動判別する操作で、現global highlights/Face Brightness/Local Levels全体とは異なると確定した。AI要所検出を偽装せず、本人が明示した顔ハイライトmaskに対してのみ既存Local Levelsの画素核を再利用するSUITE限定の純粋部品と専用試験を追加する。Asset/Original SHA/person/保存版/寸法/出典を拘束し、mask外RGB/alpha/hidden RGB/入力不変、別Asset・曖昧mask・中断拒否を検証。既存Recipe/Session/UI/Backend/WorkerやC Teeth契約、B Workspace Presetは読取り専用。新部品だけで元自動Highlight全体の完成とはしない。

## 2026-10-04 Teeth本人手塗り限定Recipe契約（実装前）

Cは新規純粋Teeth画素部品と専用7/7を提出したが、製品保存・本人権限・Worker/Finalには未接続。次はbitmapや自称認証をRecipeへ入れず、既存B/W手動ストロークに整合するAsset UUID/Original SHA/原寸・対象person・bounded正規化stroke/明るさ/脱彩度のtyped optional契約を、`apps/backend/src/photo-policy.ts`と新規専用試験で追加する。旧Recipe v1、他写真固有設定・処理順・権限契約を維持し、未知`teeth`を完成済み扱いで通さない。既存Session/UI/Worker/Repository/Cloud、A Makeup監査/B Workspace Presetは読取り専用。保存契約だけで元AI Teeth候補完了に数えない。

## 2026-10-04 Calibration Workspace Preset保存・適用境界（実装前）

BはCalibration-only Syncの製品Session/UIと旧監査更新を提出し、全Web1151/1151を確認して共有2ファイルを返却した。次はBが既存Node Workspace PresetのPersonal/Workspace Save→Reload→ApplyでCalibration6値が保持されるかを実JWT HTTP/SQLiteで確認する。既存全Recipe経路で足りる部分は重複APIを作らず、Calibration-only適用が固有差分として不足する場合のみ既存Grain/Glow route並みに同一transaction・Preset/Recipe版・本人/権限・Asset SHAを固定して最小追加する。排他はWorkspace Backend/Clientと新規専用試験、A Makeup監査/C Teeth pure/共有Editorは読取り専用。現Trial/Cloud OIDC hostや実RAWを代用せず、部分到達を元候補完了と数えない。

## 2026-10-04 Makeup Highlight次候補監査（実装前）

AはGrainのhost注入Node Workspace Preset mountを新規module/専用実JWT HTTP・SQLite3/3で提出し、A所有ファイルを返却する。BがCalibrationの共有Session/UIを所有しCがTeeth純粋部品を進める間、Aは独立候補EV3-0001 Makeup / Highlightの元下位操作、現SUITE Portrait/Face/Local調整との同一・固有差を新規監査文書/試験だけで照合する。既存製品sourceとB/C担当は読取り専用。元資料の意味を推測で埋めず、監査を元候補完了に数えない。

## 2026-10-04 Calibration監査期待更新（実装前）

BのCalibration-only Session/UI追加によって旧`apps/web/tests/color-calibration-completion-audit.test.mjs`の「専用Session方法がない」期待が陳腐化した。Bは製品接続と専用試験後にこの既存監査試験と`docs/COLOR_CALIBRATION_COMPLETION_AUDIT.md`を更新し、接続済み事実、実Chrome NOT_RUN、Preset製品scope/実RAW/Cloud/元製品画素式の未確認を分ける。監査の安全拒否や過去結果を隠さず、元候補全要素完了数を推測で増やさない。

## 2026-10-04 Teeth本人手塗り限定の純粋画素部品（実装前）

CのEV3-0235監査で、現Face Brightnessは歯の8下位操作の代替にならず、現Recipeの未知`teeth`拡張は構造受理されてもWeb描画では拒否されると確認した。AI自動検出を偽装せず、本人が明示した歯領域maskに限る明るさ/脱彩度の純粋8-bit画素部品を、新規moduleと専用試験だけで実装する。mask出典・Asset/Original SHA/寸法/版を厳格検証し、mask外RGB/alpha/hidden RGBとOriginalを保持、別Asset/曖昧mask/中断は拒否する。既存Recipe/Session/UI/Backend/Workerは編集せず、本人承認・権限/保存/Final/実RAW・実写真品質は後続Gate。手動SUITE限定効果を元AI歯補正全体の完成と数えない。

## 2026-10-04 Calibration-only Sync製品Session/UI接続（実装前）

BはGrain-only Syncの製品Session/UIと旧監査更新を提出し、全Web1139/1139・専用8/8を確認して共有2ファイルを返却した。実ChromeはBrowser環境なしでNOT_RUN。次にBへ同じ共有Session/UIのColor Calibration専用箇所と新規専用試験を排他で渡す。既存の`batch-calibration-sync.mjs`を保存済みsource/明示2〜20 targetへ接続し、他色/Detail/人物/写真固有設定/Originalの保持、未保存draft、本人/Asset/SHA/版/CAS/失効・partial表示、UI→保存/再読込→Finalの境界を検証する。AのGrain mount、CのTeeth監査は共有ファイル読取り専用。新Browser試験が実行不能ならNOT_RUN、部品だけで元候補全要素完了としない。

## 2026-10-04 Grain Workspace Preset製品host接続の限定部品（実装前）

AはNode WorkspaceのPersonal/Workspace PresetでGrain7値＋seedの保存/再読込/全体適用と、同一transactionで他調整を残すGrain-only適用を実JWT HTTP/SQLiteで確認し、Backend/Clientの排他を返却した。次は現行host注入型Workspace Preset mountと同じ本人/tenant/membership/role/Asset/Preset版Gateを、新規Grain専用mountと専用試験だけでつなぐ。既存製品Bootstrap/Editor/Session、Glow mount、Backend/Clientは読取り専用。現Trial/CloudのOIDC hostや実RAW/公開配備を代用せず、mountの合成経路成功を元候補完了に数えない。

## 2026-10-04 Grain監査期待更新とTeeth次候補（実装前）

BのGrain-only製品Session/UI接続により旧`apps/web/tests/grain-completion-audit.test.mjs`の「Session方法が存在しない」期待が陳腐化した。Bは専用Browser fixtureが一区切りした後、同既存監査試験と`docs/GRAIN_COMPLETION_AUDIT.md`を追補し、製品接続済み/実Chrome NOT_RUN/Personal・Workspaceや実RAW・Cloud未確認を分離する。既存の安全拒否を外さない。CはClothing Moiré監査を返却し、独立候補EV3-0235 Teethの元操作と現人物処理の差を新規監査文書/試験のみで照合する。B共有Session/UI、A Workspace BackendはCの読取り専用。両作業とも元候補全要素完了数を推測で増やさない。

## 2026-10-04 Grain限定Syncの製品Session/UI接続とClothing Moiré監査（実装前）

CのSelective Color-only Syncは製品Session/UIと監査期待更新を提出し、メイン独立全Web1110/1110がPASSした。実ChromeはBrowser一覧空/CDP障害でNOT_RUN。共有Session/UIの追加書込は停止し、Bへ`apps/web/src/session.mjs`/`apps/web/src/editor-ui.mjs`のGrain専用箇所と新規専用試験を排他的に渡す。保存済みsource/明示2〜20 target、未保存draft、本人権限・Asset/SHA/版・CAS、他調整/Original保持、部分結果、UI→保存/再読込→Finalを確認する。Cは共有ファイルを編集せず、独立候補EV3-0993 Clothing Moiré Removalの元固有処理と現Detail/AI境界を新規監査文書/試験で照合する。元候補完了数は実処理の全要素Gateまで増やさない。

## 2026-10-04 GrainのWorkspace Preset保存・適用境界（実装前）

AはPerfect Shotの順序証拠が現製品APIにないためfail-closedの候補窓部品を提出した。次は独立候補GrainのPreset下位操作に移り、既存Node Workspace Presetの保存/再読込/適用で7値とrender seedが失われないか、実JWT HTTP/SQLiteで確認する。既存の全Recipe適用で足りる場合は重複APIを増やさない。Grain-only適用が固有差分として必要かを既存Glow-only routeと比較し、必要な場合だけ同一transaction・版/本人/権限/Asset-SHA固定の最小routeを追加する。Aの排他はWorkspace Backend/Clientと新規専用試験に限定し、CのSession/UI、BのCalibration部品は読取り専用。実OIDC host・実RAW/Cloudは別Gate、部分成功を元候補PASSにしない。

## 2026-10-04 Color Calibrationのみ選択Syncの独立部品（実装前）

BはEV3-0595 Personalized AI LookのAI学習等と現Look/Presetの非同一性を監査し、監査文書/試験を返却した。Cが共有Session/UIをSelective-only Syncで所有する間、Bは既存Color Calibrationの6値だけを保存済みsourceから明示targetへ適用する独立moduleと専用試験を追加する。他Recipe/写真固有設定/Originalを保持し、fresh本人・Asset/SHA/版・権限・CAS・失効/部分結果を既存選択Syncと同じ安全境界で照合する。共有Session/UI/Backend/Cloudは編集しない。製品接続や実RAW/Cloud未確認の部品成功を元候補完了と数えない。

## 2026-10-04 Perfect Shot候補窓の安全な下位実装（実装前）

Aの監査でEV3-0921のAuto/Custom Fix・同一人物の顔交換と、既存手動Culling/Face Brightnessは別物と確定した。顔交換を偽装せず、Project内の明示対象を中心に前後最大7枚から認証済み候補とAsset/Original SHA/保存版を束縛する読み取り専用計画だけを、新規`apps/web/src/perfect-shot-candidate-window.mjs`と新規専用試験で実装・検証する。既存Session/UI/Backend/画像処理は読取り専用。認証・順序を実データで証明できない場合は安全に拒否する。実AI顔交換・実RAW/実機/Cloudは未実装Gateのままで元候補完了数を増やさない。

## 2026-10-04 Personalized AI Look次候補（実装前）

BはDesktop↔iPad compatibilityのJSON往復部分と未接続Apple/iPad実経路を監査した。Cが共有Session/UIをSelective-only Syncとして所有中は、Bを独立候補`EV3-0595 Personalized AI Look`の読取り監査へ移し、新規監査文書と新規専用試験だけを排他所有する。既存SUITE Look/Recipe/PresetやAI編集モードとの共通部分と、元製品の画像解析・個人化学習・保存/適用の固有要素を区別し、既存製品source、A Perfect Shot/C Selective担当を共有編集しない。AIモデル・実RAW/実機/Cloudがない結果を元候補PASSへ昇格しない。

## 2026-10-04 Perfect Shot次候補（実装前）

Aは汎用Batchの既存target Portrait無警告消去を事前拒否で修正し、B/W/Add Shadowを含む写真固有設定保護と実Trial HTTP/SQLiteを確認した。次は独立候補`EV3-0921 Perfect Shot`の元下位操作、現SUITEのculling/修正/Finalとの差を新規監査文書と新規専用試験のみで照合する。Cが共有Session/UIを所有中、BはiPad互換監査中なので既存製品sourceは読取り専用。AI/実RAW/実機/Cloudや元製品画素同等性を推測PASSにせず、監査だけで44件完了数を増やさない。

## 2026-10-04 Desktop↔iPad compatibility次候補（実装前）

BはEV3-1058 Detail EnhanceのAI 2K/4K/6K生成とSUITE通常Detailの非同一性を監査した。共有Session/UIはCのSelective-only製品接続中であるため、Bは次の追加独立候補`EV3-0873 Desktop ↔ iPad compatibility`について新規監査文書と新規専用試験のみを排他所有する。現Web/Desktop・Apple/iPad・Recipe・Preset・Original/Proxy/Final・Workspace/Storageの契約が一致するかをソースと既存試験で照合し、未接続Native/実機/Cloudを明確に分ける。既存製品source、A Batch安全/C Selective同期とはファイルを共有編集しない。ローカル互換試験を実iPad動作へ昇格せず、監査だけで44件完了数を増やさない。

## 2026-10-04 汎用Batchの対象写真固有設定の無警告消去を拒否（実装前）

AのEV3-0934監査で、元候補はAI Lab Batch Edit > People Removalで現SUITEの全Recipeコピーと別機能と判明した。また現汎用Batchはsource写真固有設定を拒否する一方、中立sourceから既存Portraitを持つtargetへ全Recipeをコピーするとtarget Portraitを無警告で消せる。既存の保存/権限/CAS契約を維持しつつ、Aが`apps/web/src/batch-edit.mjs`と新規専用安全/Trial HTTP試験のみを排他所有し、targetにPortrait/BW Edge Manual/Add Shadow Manualの写真固有設定があれば無警告置換を事前拒否する。sourceと他targetへの部分成功は既存の正直な結果分類を維持、Original/既存target Recipeは不変と確認する。C所有の共有`session.mjs`/`editor-ui.mjs`、B Grain、Backend/Cloudは編集しない。これはデータ保護の修正でありAI People Removalの実装や元候補完了ではない。

## 2026-10-04 Detail Enhance次候補（実装前）

BはGrain-only Sync独立部品と実Trial HTTP/SQLiteを専用8/8で提出し、共有Session/UI接続はCのSelective Color排他返却後まで保留する。次は追加独立候補`EV3-1058 Detail Enhance`の元下位操作と、現SUITEのClarity/Texture/Sharpen/Denoise等が同一か別かを新規監査文書と専用試験で照合する。既存製品source、A Batch Edit/C Selective Colorは読取り専用。AI/実RAW/実機/Cloudと元製品画素同等性を推測PASSとせず、監査だけで44件完了数を増やさない。

## 2026-10-04 Batch Edit次候補（実装前）

Aは`LR-02 Histogram and clipping`の現4ch表示/写真overlay/J切替/5領域操作と、左右独立clip指標の不足を監査した。Cが共有Session/EditorをSelective Color Syncで排他所有し、BはGrain部品を実装中のため、Aは次の独立候補`EV3-0934 Batch Edit`を新規監査文書と新規専用試験だけで照合する。既存の認証付き全Recipe Batch、対象権限/版、写真固有処理拒否、AI人物/複数写真固有差、UI→保存/Finalを下位操作で区別し、既存製品sourceとA/B/C互いの試験を共有編集しない。実RAW/実機/Cloud、元製品AI同等性は別Gate。監査だけで44件完了数を増やさない。

## 2026-10-04 Selective Color限定Syncの製品Session/UI接続（実装前）

CはSelective-onlyの純粋mergeと実Trial HTTP/SQLiteの8/8試験を提出したが、まだ製品Session/UIから呼ばれない。Aは共有`session.mjs`/`editor-ui.mjs`の排他を返却済み、B Grain部品とA Histogram監査は共有source読取りのみのため、Cにこの2ファイルのSelective Color専用箇所と新規専用Session/UI/Browser試験を排他割当する。target未保存draft拒否、保存済みsourceと明示2〜20対象、本人権限・Asset/SHA/版/CAS、他調整・人物・Original不変、競合/失効/部分結果のUI表示、保存/再読込/Finalを確認する。既存全Recipe Batch、Levels/Glow/Vignette Sync、Recipe v1外形は変更しない。ブラウザ環境が引き続き不可ならfixture bundleのみPASS、実ChromeはNOT_RUNで残し、元候補全要素完了には繰り上げない。

## 2026-10-04 Histogram and clipping次候補（実装前）

AはVignette-only Syncを製品Session/UIとTrial HTTP/SQLiteに接続して全Web1068/1068 PASSを報告し、共有Session/Editor排他を返却した。実ChromeはBrowser/CDP環境障害でNOT_RUN。次は独立候補`LR-02 Histogram and clipping`の色チャンネル表示、白飛び/黒潰れ写真上表示、直接トーン操作、UI/Recipe/Undo/Redo/保存/Finalの範囲を新規監査文書と専用試験で照合する。既存製品sourceとB Grain/C Selective部品は読取り専用。実RAW/実機/Cloud・Lightroom画素同等性は別Gate、監査だけで44件完了数を増やさない。

## 2026-10-04 Grain限定選択Syncの独立部品（実装前）

BのOutput adjustments manual JPEG実Chrome追加試験はBrowser一覧空・CDP接続障害のためbundleのみPASS、実画面はNOT_RUNとして残す。Bは次にEV3-0528で未接続だったGrain-only Syncの新規独立部品`apps/web/src/batch-grain-sync.mjs`と新規専用純粋/Trial HTTP・SQLite試験のみを排他所有する。保存済みsourceの7調整だけを2〜20対象へ認証・Asset/SHA/版・CAS/保存後照合つきで移し、他Detail/露光/色/人物/写真固有設定とOriginalを保持する。target未保存draft拒否は後続Session接続時に確認する。Aが共有Session/Editorを返却するまでそれらは読取り専用。C Selective Color部品とはファイルを共有せず、部品だけで完成扱いしない。実RAW/Cloudは別Gate。

## 2026-10-04 Output adjustments manual JPEG実Chrome不足補完（実装前）

BはManual canvas Expandの現実装と元候補との差（上限・基準座標・初期色・Auto AI Crop Sync等）を監査で確定した。A/Cが選択Sync部品を実装中で、Bは共有製品sourceに触れず、既存Output adjustments専用の実Chrome fixture/testだけを排他所有し、未記録のmanual JPEGを現Editor UI→保存済み合成非RAW→実Worker→JPEG Blobで確認する。`none`対manualの出力画素差、MIME/サイズ、Original/Recipe不変、失敗時リンク非公開と認証Gateを維持する。製品に欠落があれば独断修正せずメインへ報告。元製品Screen/Printの数値/kernelsは未公開で推測しない。実RAW/Cloud/OSは別Gate、これだけでEV3-0773完了とはしない。

## 2026-10-04 Selective Color限定選択Syncの独立部品（実装前）

CのEV3-0501監査では元15下位操作のうち9色域×CMYK/Relative・Absoluteの限定処理を確認したが、公式記載のSelective Colorのみの複数写真Syncが製品未接続。現全Recipe Batchは対象露光等を置き換えるため代用しない。Aが共有`session.mjs`/`editor-ui.mjs`をVignetting-only Syncで排他所有中は、Cは新規`apps/web/src/batch-selective-color-sync.mjs`と新規専用純粋/Trial HTTP・SQLite試験のみを排他所有し、保存済みsourceと2〜20対象の本人権限・Asset/SHA/版、target未保存draftを製品Session側で後続確認する前提、Selective Colorのみmerge、他設定/Original不変、CAS/保存後照合/競合・失効・部分結果を実証する。共有UI/SessionはA返却後に別通知して接続する。この部品だけで完成扱いせず、実RAW/Cloudは別Gate。

## 2026-10-04 Manual Canvas Expand次候補（実装前）

BはLevelsの現Trial Author製品UI→公開Preset→Finalを実Chromeで限定確認し、次の独立候補`EV3-0701 Manual canvas Expand`を下位操作ごとに読取り監査する。新規監査文書と新規専用試験のみBが排他所有し、四辺手動余白・背景色/透明・Reset・Batch・Auto Expand During Syncを現実装と区別する。A所有の共有Session/Editor、C Selective Color、既存製品sourceは読取り専用。実RAW/実機/Cloud・元製品のAI/画素同等性は別Gateで、監査だけで完了数を増やさない。

## 2026-10-04 Selective Color次候補（実装前）

CはColor Calibration 6調整の実処理と専用Sync/製品Personal・Workspace Preset不足を監査で分離した。Aが共有`session.mjs`/`editor-ui.mjs`をVignetting-only Syncとして排他所有しているため、Cは次の独立候補`EV3-0501 Selective Color`について新規監査文書と新規専用試験だけを担当する。9色域×CMYK/Relative・Absolute、UI/Recipe/Undo/Redo/保存/Final、Preset/Syncの差を照合し、既存製品sourceは読取り専用とする。A/B担当ファイル、実RAW/Cloud/実機は触れず、監査だけで元候補完了数を増やさない。

## 2026-10-04 Levels Author製品実Chrome通し（実装前）

BのEV3-0492監査ではRGB/Local Levels等の限定実装を確認したが、現Trial Authorの公開Presetを製品UIで保存/採用/適用し、実Finalまで通すブラウザ証拠は不足。Bは新規Levels専用Trial HTTP/SQLite＋実Chrome fixture/testだけを排他所有し、現製品の元レシピ/保存版・公開Preset・本人/別admin採用・適用・Undo/Redo・CAS保存/再読込・Worker Finalを確認する。欠落や構造不一致は既存製品sourceを独断修正せずメインへ報告する。A所有の`session.mjs`/`editor-ui.mjs`、C Color Calibration、Cloud/実RAW/実機は触れない。限定E2Eが通っても元候補全要素PASSへ繰り上げない。

## 2026-10-04 Vignetting限定選択Syncの製品接続（実装前）

AのEV3-0570監査で、5調整の画素/Recipe/UI/保存/FinalはSUITE限定で動く一方、既存全Recipe Batchでは対象の露光等を上書きし、VignetteのみSyncは未接続と判明した。Aが新規`apps/web/src/batch-vignette-sync.mjs`、既存`apps/web/src/session.mjs`と`apps/web/src/editor-ui.mjs`のVignette専用Sync箇所、および専用新規試験を排他所有する。保存済みコピー元・明示2〜20対象の本人権限、Asset/SHA/版固定、対象の未保存Draft拒否、各対象CAS/保存後照合、競合・失効・部分結果の正直な表示、Original不変を確認し、Vignetteだけmergeして他の露光/色/人物/写真固有設定を保持する。現全Recipe Batch、Levels/Glow Sync、Recipe v1外形は変えない。B Levels/C Color Calibrationは共有製品sourceを読取り専用とし、実RAW/Cloud/元製品画素同等性は別Gate、これだけで元候補完了とはしない。

## 2026-10-04 Color Calibration次候補（実装前）

CはOutput adjustmentsの現manual出力シャープと未実装の元製品Screen/Print×Low/Standard/Highを監査・専用試験で分離した。次は独立候補`EV3-0586 Color Calibration`の現SUITE RGB原色6調整、UI/Recipe/Undo/Redo/保存/Final、Preset/Sync、元製品下位操作との意味差を新規監査文書と新規試験で照合する。製品sourceは読取り専用、A Vignetting/B Levelsとファイルを共有編集しない。実RAW/実機/Cloud・元製品画素同等性は別Gateで、今回の監査だけで44件の完了数を増やさない。

## 2026-10-04 Levels次候補（実装前）

BはGrain実Trial HTTP/SQLite＋実Chromeで7調整のUI→Worker Preview→Undo/Redo→CAS保存/再読込→Finalと失効/競合を合成非RAWで限定確認した。次は追加独立候補`EV3-0492 Levels`の元下位操作と、現SUITEのRGB Levels/Local Levels/Sync/Presetの全経路を新規監査文書と新規専用試験で照合する。既存製品sourceは読取り専用とし、A Vignetting/C Output adjustmentsとはファイルを共有編集しない。実RAW/実機/Cloudや元製品画素同等性は別Gateで、監査だけで完了数を増やさない。

## 2026-10-04 Mobile Post-Crop Vignetting次候補（実装前）

AはSmart Cullingの手動Node Workspace経路と未接続AI/製品bootstrapを専用監査で分離した。次は独立候補`EV3-0570 Mobile Post-Crop Vignetting`を既存SUITE限定5調整、保存/Final、Preset/Sync/実RAWの下位操作ごとに新規監査文書と新規専用試験で照合する。既存製品sourceは読取り専用、B Grain/C Output adjustmentsとはファイルを共有編集しない。元候補同等性や実RAW/実機/Cloudを監査試験からPASSに繰り上げない。

## 2026-10-04 独立候補Smart Culling／Output adjustments次段階（実装前）

Aは命名現UI4方式のTrial実Chrome限定結果を提出し、次の`EV3-0894 Smart Culling`について新規監査文書と新規専用試験のみを担当する。CはExport sizeの6方式×3形式×2密度の実Chrome 36通りを提出し、次の`EV3-0773 Desktop Output adjustments`について新規監査文書と新規専用試験のみを担当する。どちらも既存製品sourceは読取り専用とし、手動CullingとAI自動選別、SUITE手動出力シャープと元製品のScreen/Print×Low/Standard/Highを同等と推測しない。BのGrain Trial fixtureとファイルを共有編集しない。実RAW/Cloud/実機や元候補全下位操作完了は別Gateで、今回の監査だけで44件の完了数を増やさない。

## 2026-10-04 Grain実Trial製品Editor保存経路（実装前）

EV3-0528監査では7調整のローカル画素/Recipe/Mock Chrome経路はあるが、実Trial HTTP/SQLiteの本人Editor UI→Recipe CAS保存/再読込→Worker Final証拠が未確認。Bは新規Grain専用Trial HTTP/SQLite＋実Chrome fixture/testだけを排他所有し、7調整それぞれの画素差、Undo/Redo、保存版・Original SHA、権限失効/旧版/取消、Finalを実測する。製品Grain/Editor/Session/Backendを改変せず、欠落が見つかったらメインが別途排他指定する。Personal/Workspace/Community/Author PresetとGrain-only Sync、実RAW/Cloudはこの試験の範囲外として残し、完了数は増やさない。

## 2026-10-04 Export size未確認製品ブラウザ組合せ（実装前）

EV3-0757監査で6画素方式のUI/Worker部品とTIFF tagsを確認した一方、Percentage/Width/Heightの実Editor Chrome JPEG/PNG、6方式の実Editor Chrome TIFFが未確認だった。Cは既存Export size専用ブラウザfixture/testだけを排他所有してこの未確認組合せを追加実測し、寸法・PPI/PPCタグ・保存済みRecipe/Original不変・拡大拒否を確かめる。AのExport naming/BのGrain、`session.mjs`・共有UI・処理本体は変更しない。Dimensionsの厳密W×Hと拡大可否は公式本文だけで挙動が確定しないため、現bounding-boxを推測で置換しない。実RAW/OS出力は別Gateで、確認数を元候補完了へ繰り上げない。

## 2026-10-04 Grain独立候補の欠落再監査（実装前）

GlowのTrial Author Glow-only適用は実Chromeで限定確認したが、実RAW/Cloud/本番OIDC hostは別Gateであり元候補は未完了。Bを次の独立候補`EV3-0528 Grain`へ移し、既存7調整とPersonal/Workspace/Author/Community Preset、Sync、UI→Recipe/Undo/Redo→保存/再読込→Worker Finalの下位操作を元候補資料と現実装で行ごとに照合する。まず新規専用監査文書と新規試験だけをBが排他所有し、既存Grain/Session/Author/Backend製品sourceは読取り専用。既存の動く7調整を再実装せず、保存先/認証の推測同一視や本番Cloud成功扱いを避ける。共有source修正が必要ならメインが後で排他範囲を通知する。A/Cの担当ファイル・原本・公開配備は変更しない。監査だけで44件完了数は増やさない。

## 2026-10-04 Export size独立候補の欠落再監査（実装前）

Add Shadowのローカル安全境界は実Chromeまで提出済みだが、実RAW成功と背景寸法差は別Gateで元候補完了ではない。Cを次の独立候補`EV3-0757 Desktop Export size`の読取り監査へ移す。元の7下位設定（Percentage、Width & Height、Dimensions、Long/Short Edge、PPI/PPC）と現UI→保存済みRecipe→Worker Final→JPEG/PNG/TIFF metadata・画素寸法を各行で照合し、最新実装で既に満たすものを再実装しない。まず新規専用監査文書と新規試験だけをCが排他所有し、既存製品source変更が必要ならメインが後で排他範囲を通知する。AのExport naming、BのGlow Author/Session、原本・公開Cloudは変更しない。実RAW/OS出力は別Gateであり、監査だけで44件完了数を増やさない。

## 2026-10-04 Author公開PresetのGlow限定適用（実装前）

現Trialの公開Author Preset適用は既存の全体調整置換経路で、既編集写真の非Glow設定保持を保証しない。従来の全体適用ボタンとRecipe契約は変更せず、公開PresetにGlowが含まれる場合だけ明示的な「Glowのみ適用」操作を追加する。保存済み対象Asset/Recipe版とPreset版を再読込して照合し、Glow 3モード＋6値だけを現在のRecipeへmergeし、露光・色・Detail・人物・B/W/Add Shadow/Crop等を保持する。Undo/Redo、CAS保存、Finalおよび失効/旧版拒否を専用試験で確認し、未保存を保存済みと表示しない。影響範囲はBが排他所有する`apps/web/src/session.mjs`、`apps/web/src/author-ui.mjs`、必要なら新規Glow専用純粋module/試験。Cは共有製品ファイルを返却済みで、新規Add Shadow専用ブラウザfixture/testのみを担当する。実RAW/Cloud/実機、本番OIDC hostは別Gateとし、元候補完了数は増やさない。

## 2026-10-04 Add Shadow合成非RAWの実Browser Worker境界（実装前）

Node Session試験の`BROWSER_WORKER_UNAVAILABLE`を非RAWデコード拒否や製品Final成功と誤認しないため、Cは新規Add Shadow専用Trial HTTP/SQLite＋実Chrome fixture/testのみでBrowser Worker経路の境界を確認する。製品Editor/Session/Worker/Backend契約は読取り専用とし、本人/対象・背景Asset/SHA/保存版、失効・取消、Preview/FinalのBlob公開有無を実測する。合成非RAWを実RAW成功の代用にせず、得られない証拠はNOT_VERIFIEDで残す。

## 2026-10-04 GlowのTrial Author Preset製品経路照合（実装前）

現Trial製品の既存Author portable Preset経路で、GlowのWhite Mist/Black Mist/Halationと6調整値を本人画面からSave→Reload→Apply→Recipe CAS保存→Worker Finalまで操作できるかを独立検証する。保存・権限・版数・元写真SHAの失効/競合では成功表示にしない。影響範囲はB専有の新規Glow用Trial HTTP/SQLite＋実Chrome fixture/testのみ。既存Author/Editor/Session/API契約は読取り、欠落時の製品ソース変更は排他相談後に別通知する。Personal/Workspaceの現Trial OIDC host欠如、実RAW/Cloudをこの限定試験でPASSへ変えず、元候補全要素完了数を増やさない。

## 2026-10-04 Glow-only Workspace Preset原子的適用（実装前）

現行Node Workspace Preset適用は全Recipeを置換するため、Glow Presetを既編集写真へ安全に適用できない。既存全置換routeを変えず、新規Glow-only版固定routeと同一transactionの保存処理を追加する。JWT本人のedit権限、対象Asset/Original SHAと保存済みhead版、Presetの可視性と選択版、Glow-only純粋Presetをcommit前に照合する。対象RecipeのGlowだけをmergeし、露光/色/Detail/人物/B/W/Add Shadow/Cropなど他設定を保持する。旧版・権限失効・競合はbranchや部分保存を作らず拒否し、成功時も保存済みRecipe/版/Originalを再読込して確かめる。影響範囲はB排他の`apps/backend/src/workspace.ts`、`apps/backend/src/workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`、B作成`apps/web/src/glow-workspace-preset-mount.mjs`と新規専用試験のみ。Node Workspaceのローカル実JWT/SQLite境界であり、現Trial製品のOIDC host/Cloud/実RAW接続を偽装しない。元候補完了数は全Gate確認まで増やさない。

## 2026-10-04 Export namingの認証済み製品経路照合（実装前）

既に単独Chrome fixtureで通った一括命名方式を、実Trial本人HTTP/SQLite・保存済みRecipe・Original SHA・明示順の複数Assetと結び、実Worker Final Blobから安全な手動リンクへ到達するか独立に照合する。認証失効、版数/Original変化、途中失敗では0リンクとBlob URL失効を要求する。影響範囲はA専有の新規命名用Trial HTTP/SQLite＋実Chrome fixture/testのみ。共有Editor/Session、既存共通fixture、Backend、Cloudは変更しない。現UIにない残り命名方式、実RAW、OS実保存名を検証済みにせず、元候補完了数を増やさない。

## 2026-10-04 GlowのWorkspace/PERSONAL Preset接続（実装前）

Glowの保存済みRecipeを既存Node WorkspaceのPersonal/Workspace Presetへ保存・再読込・版固定適用するため、hostが本人Bearer/Workspace/Assetを明示する場合のみ動く独立mountを追加する。Glowの3モードと6調整値を保持し、写真固有拡張や他tenantへの越境、旧版適用を拒否する。影響範囲は新規`apps/web/src/glow-workspace-preset-mount.mjs`と新規実JWT HTTP/SQLite＋ブラウザ試験のみ。既存Editor/Session/Bootstrap/Backend/Cloudは変更しない。現Trial製品にNode OIDC hostは無いため、host注入試験だけで製品Preset完了とは称さず元候補完了数を増やさない。

## 2026-10-04 Add Shadow Trial製品Editor/Session接続（実装前）

新規手動UI・typed文書・Trial対象/背景Gate・保存境界・独立Workerを、既存EditorSessionとEditorへ安全に接続する。本人のAfter範囲と背景選択からRecipe v1の写真固有文書を構築し、Trialのfresh本人/Asset/SHA/保存版・権限照合とCAS保存を通過したものだけ再読込→Proxy/Finalへ使う。Undo/Redoと別Asset/旧版/権限失効/取消では古いmaskやBlobを再利用しない。既存単写真/他調整、Original、B/W/Portrait、Feature Gateを保持し、背景別寸法/実RAW成功データがない場合は明示拒否・別Gateとする。影響範囲は`apps/web/src/session.mjs`・`apps/web/src/editor-ui.mjs`・`apps/web/src/processing/pure.mjs`・`apps/web/src/processing/worker.mjs`・`apps/web/src/processing/index.mjs`と新規専用実Trial HTTP/SQLite＋実Chrome試験。通常renderは現状Add Shadow文書を描画せず、独立WorkerだけをAfterへ重ねると既存露光・色・Cropとの順序が崩れるため、Cがこの3処理ファイルに実Gate付きAdd Shadow stageを限定接続する。既存の処理順、他調整、Original不変と回帰を確認する。BのGlow共有ファイル返却後にCが排他で実施し、通常renderを黙示無視から実経路へ置換する。動くUI→保存→Finalがそろうまで元候補完了に数えない。

## 2026-10-04 Add Shadow Session用の非破壊Recipe構築（実装前）

本人UIの手動documentを既存Recipe v1の任意`extendedParameters.addShadowManual`へ追加する際、元Recipeの他調整・処理順・Original参照を変えず、新規documentだけを対象/背景Asset-SHAと原寸へ束縛して検証する独立部品を追加する。これは認証/保存/Undo/Finalそのものではなく、後でTrial Sessionのfresh GateとCASへ接続するための純粋変換。影響範囲は新規`apps/web/src/add-shadow-manual-recipe.mjs`と新規専用試験のみ。既存Session/UI/Backend/Cloudは変更しない。元候補完了数を増やさない。

## 2026-10-04 DNG撮影日名の保存済み単写真Final結合（実装前）

認証済みTrialのDNG撮影日入力を既存EditorSessionの保存済み単写真Final Blobと結合し、同一Asset/SHA/Recipe版・clean状態を前後で確認して安全な`capture-date-original`名を返す独立orchestratorを追加する。Exif offsetが明示されない/未対応コンテナ/途中の版・原本・権限変化ならBlobを返さない。自動ダウンロードは行わない。影響範囲は新規`apps/web/src/export-capture-date-final.mjs`と新規専用実Trial HTTP/SQLite＋合成DNG試験のみ。既存Session/Editor/命名アルゴリズム/Originalは変更しない。実RAW画質・OS保存名・Cloudは別Gateで元候補完了数を増やさない。

## 2026-10-04 Mobile Glow EffectのE2E完了照合（実装前）

既にSUITE限定で接続されたGlowのWhite Mist/Black Mist/Halation、Intensity/Radius/Threshold/Exposure/Diffusion/Tint、Show Glow Maskを元候補EV3-0560の下位操作と照合し、欠落があれば同担当が実処理・UI・Recipe/Undo/Redo・保存/再読込・Final・回帰まで修正する。既存Recipe・RAW原本・他の調整処理を壊さず、写真上Mask表示はFinal画像へ混入させない。影響範囲は必要なWeb Glow関連処理・`apps/web/src/editor-ui.mjs`・`apps/web/src/session.mjs`および専用試験。現時点の共有UI/Session排他所有はB、A/Cは触らない。実RAW/実機/Cloudを合成データPASSへ混ぜない。完了判定はメインが独立に行う。

## 2026-10-04 Add Shadow本人手動UI部品（実装前）

Add Shadowの本人指定subject strokeとNone/Soft/Hard/Drop、背景Asset選択、調整値を操作する独立After専用UI部品を、実処理へ接続できるhost callback契約つきで用意する。権限/保存/Finalの成功をUI上で自称しない。Before側・写真外・取消・別Asset・古い版の操作を拒否し、Keyboard/Pointer/Touchと狭幅を専用試験で確認する。影響範囲は新規`apps/web/src/add-shadow-manual-ui.mjs`と新規専用試験のみ。既存Editor/Session/CSS/Bootstrap/Cloudを変更せず、mount前の部品完成を製品完了と数えない。

## 2026-10-04 撮影日Export命名の証拠付き入力（実装前）

既存DNG限定Trial capture-date Gateの実Original SHA・保存版・export権限・Exif日時/offset証拠を、`capture-date-original`命名の入力として安全に正規化する独立Web部品を追加する。offset無し・別Asset/SHA・版不一致・未保存/dirty・非DNG・不明形式は拒否し、カメラ時計の真偽や一般RAW対応を称さない。影響範囲は新規`apps/web/src/export-capture-date-naming.mjs`と新規専用試験のみ。既存Export UI/Final、命名context/form、Cloud、Originalは変更しない。部品のみで元候補完了数を増やさない。

## 2026-10-04 Add Shadow写真固有RecipeのBatch漏洩遮断（実装前）

`addShadowManual`は対象/背景AssetとOriginal SHAに束縛された写真固有documentなので、全Recipe Batch Editで他写真へコピーしない。既存対象Recipeを上書き消去する場合も拒否する。Batch Finalも各写真のfresh背景Gate/手動mask/Worker経路が未接続の間は全件をFinal生成前に拒否する。さらに現在の通常Preview/単写真FinalはAdd Shadow文書を実描画できないため、Session bind時に黙って無視せず明示的に拒否する。影響範囲は`apps/web/src/batch-edit.mjs`、`apps/web/src/session.mjs`と専用試験のみ。既存B/W・portrait・Levels Sync・Add Shadowを含まない単写真Finalの挙動を保つ。機能完成数は増やさない。

## 2026-10-04 Add Shadow Trial保存境界（実装前）

Node Trialの既存Recipe保存・再読込へ本人手動Add Shadow文書の対象Asset/Original SHAと背景Asset/Original SHAの実登録・同一tenant・非削除照合を追加する。保存は既存Revision CASとtransactionでFail Closed、背景出典不一致や削除・別tenantを拒否する。影響範囲は`apps/backend/src/repository.ts`と新規専用試験のみ。Cloud Worker、Node Workspace、Web Session/UI/Final、DB schema/Originalは変更しない。実認証HTTP権限は既存routeに依存するため、この境界単独で元候補完了にはしない。

## 2026-10-04 Add Shadow Workspace保存境界（実装前）

本人手動Add Shadow文書をNode Workspace Recipeに受け入れる前に、保存・履歴再読込で対象Asset/Original SHAを実登録値へ束縛し、背景Assetも同一Workspace内の実登録・非削除Asset/SHAへ照合する。異なる写真へのRecipe流用とPersonal/Workspace Presetへの写真固有文書の取り込みを拒否する。既存B/W・Portrait・Recipe CAS/権限/履歴、OriginalとDB schemaを維持する。影響範囲は`apps/backend/src/workspace.ts`と専用試験のみ。Node構造validatorは別担当、Trial/Cloud/UI/Finalは今回対象外。保存境界だけで元候補完了に数えない。

## 2026-10-04 Add Shadow本人Gate結合（実装前）

対象と背景それぞれの既存Trial read-only Gate、typed手動文書、Proxy/Source別の手動mask、独立Worker operationを、fresh本人・Asset/SHA・保存版の一致を維持する限定orchestratorへ接続する。外から渡す画素や文書を認可証拠とせず、Gate由来の証拠を比較し、失効・取消・別写真をFail Closedにする。影響範囲は新規`apps/web/src/add-shadow-manual-trial-runtime.mjs`と専用試験のみ。既存Session/UI/Recipe保存/Cloud/通常renderには接続せず、元候補完了に数えない。

## 2026-10-04 Node RecipeのAdd Shadow手動document検証（実装前）

既存Recipe v1の任意extendedParametersに本人手動Add Shadow documentを保存する前提で、Node Backendの既存Recipe validatorに新typed documentの構造・容量検証を追加する。対象Asset/Original SHA・背景Asset/Original SHA/原寸・stroke/setting以外を許さない。実Asset参照照合、Preset/別Assetコピー禁止は保存境界に別Gateを要し、この変更だけで保証しない。旧Recipeと旧処理順、Original、DB schemaを維持する。影響範囲は`apps/backend/src/photo-policy.ts`と専用試験のみ。Cloud Worker/D1/R2/配備、Web Session/UI/Finalは対象外。Backend検証だけで元候補完了に数えない。

## 2026-10-04 Add Shadow手動stroke→subject matte（実装前）

本人が対象Asset上で保存したnormalized subject strokesを、既存の手動mask authoringを利用し、同じAsset/Original SHA/保存版のProxy/Final寸法ごとに再ラスタ化する独立部品を追加する。BitmapをRecipeに保持したりProxy maskをFinalへ引き伸ばしたりしない。既存Add Shadow subject roleを正確に出し、別Asset/別SHA/古い版/寸法違い・過大仕事量・中断を拒否する。影響範囲は新規`apps/web/src/processing/add-shadow-manual-mask.mjs`と専用試験のみ。typed document shapeはC担当の契約へ合わせてから確定する。Session/UI/Backend/Cloud/旧renderを変更せず、この部品だけで元候補完了に数えない。

## 2026-10-04 Add Shadow手動Recipe部品（実装前）

既存Add Shadowの本人手動選択を非破壊で再現できるよう、BitmapやOriginal byteをRecipeへ保存せず、対象Asset/Original SHA/原寸、背景Asset/Original SHA、本人のsubject stroke、明示調整値だけを表す限定typed documentと検証部品を追加する。B/W二層stroke契約・Recipe v1外形・旧描画を変更せず、8MP/容量上限と別Asset流用拒否を維持する。影響範囲は新規`apps/web/src/processing/add-shadow-manual-contract.mjs`と専用試験のみ。Backend/Cloud保存、Session Undo/Redo、Worker Proxy/Final、UI/実RAW確認は別工程であり、部品のみで元候補完了に数えない。

## 2026-10-04 Workspace Preset Web client（実装前）

既存Node WorkspaceのPersonal/Workspace Presetを既存`createPresetFacade`へ安全に渡すため、host提供Bearer tokenを都度取得する専用HTTP clientを追加する。選択Workspace UUIDとSession本人/tenant/membership/roleをfreshに照合し、list/get/create/update/deleteおよび版固定applyを既存Node endpointへ限定する。tokenを保存・ログ・URLへ載せず、Trial/Cloudへfallbackしない。server側`expectedPresetVersion`必須化は別担当が同時に実装する。影響範囲は新規`apps/web/src/workspace-preset-client.mjs`と専用実HTTP/SQLite試験のみ。実OIDC host/製品bootstrap UI、Editorからの保存・適用・再読込・Final接続は別工程であり、元候補完了に数えない。

## 2026-10-04 Workspace Preset適用の版固定（実装前）

Personal/Workspace Preset適用時に、画面で選んだ版とサーバーで適用する版が一致するよう、Node Workspaceの適用APIへ`expectedPresetVersion`を追加し、同一DB transaction内でpreset再読込・版照合・Recipe commitを行う。既存のbase Recipe版CAS、membership/role、Preset scopeと本人所有、監査、原本保持を維持する。影響範囲は`apps/backend/src/workspace.ts`・`workspace-server.ts`と専用実HTTP/SQLite試験。既存の直接呼出し互換を保つ場合もHTTPに版省略を許さず、古い版・別member・並行更新を拒否する。Node本人host、Web adapter/UI、Trial/Cloudは別工程であり、このサーバー変更だけで元候補完了に数えない。

## 2026-10-04 Add Shadow対象AssetのTrial read-only Gate（実装前）

本人が編集中の対象Assetについて、Trialのfresh本人Session、Asset UUID/Original SHA、保存Recipe版、edit/export権限とOriginal bytes digestを処理直前に確認する独立read-only Gateを追加する。画面自称の承認フラグや署名なしJSONを認可証拠としない。背景Asset Gateとは別モジュールとし、互いの戻り値を無条件に信頼しない。Recipe/Session/UI/Worker/Backend/Cloudは今回変更しない。影響範囲は新規`apps/web/src/add-shadow-target-gate.mjs`と専用実Trial HTTP/SQLite試験。保存・再読込・Final製品経路が未接続のため元候補完了に数えない。

## 2026-10-04 Add Shadow背景Asset出典照合（実装前）

既存Add Shadowの選択背景を、本人が明示指定した別Assetの認証済みOriginalから得た画素として扱うため、独立Web adapterを追加する。対象・背景の両Asset ID/SHA、freshのlist/permission/Original bytes SHA、保存版、decode/寸法、RGBA digestを束縛し、異Asset・変更・失効・中断時は失敗閉鎖する。UI自称のdigestや任意RGBAだけで本人認証済みと扱わない。背景Original/RAWは変更せず、Recipe・Session・UI・Cloud・Backendは本工程では変更しない。影響範囲は新規`apps/web/src/add-shadow-backdrop-gate.mjs`と新規専用試験。実製品UI選択・保存/再読込・Final・実RAW画像での確認が終わるまで元候補完了に数えない。

## 2026-10-04 Add Shadow Worker facade接続（実装前）

既存の独立`applyBoundAddShadow` Worker operationをWeb Processing facadeから明示呼出しできるようにする。入力画像・subject mask・背景画素・binding/settingsをWorkerへ渡す前に必要な型を確認し、呼出し元の画素/Originalを転送で破壊しない。旧render、Recipe、Session/UI、Cloud/Storage/認証境界は変えない。影響範囲は`apps/web/src/processing/index.mjs`と専用試験。認証済みBackdrop取得、保存・再読込・Final製品経路が未接続のため、この段階では元候補完了に数えない。

## 2026-10-04 Smart Cullingの本人検証済みhost注入mount（実装前）

既存Node Workspace手動Culling Panelを、外部hostが提供するBearer tokenと明示選択Workspace/Project/Assetでのみmountする薄い接続部品を追加する。mount前と各書込前にNode Workspace Session endpointで本人subject/tenant/membership/roleをfreshに照合し、失効/別scopeなら操作を停止する。token/secretを保存・ログ・URLへ出さず、Trial/Cloud fallback、AI自動選別、既存Panel/Backend/Recipe/RAWの変更はしない。影響範囲は新規Web mount部品と専用実HTTP/SQLite＋合成ブラウザ試験。実OIDC host、Bootstrapからの本人選択経路、公開Cloudは別工程であり、この部品だけで製品接続完了に数えない。

## 2026-10-04 Batch FinalのOriginal＋Custom命名（実装前）

既存単写真FinalのOriginal＋Custom Text命名を、明示選択2〜20写真のBatch Final manifestへ同じ安全なfilename plannerを使って追加する。元名と本人入力文字の両方を保持し、重複/予約名/危険文字/255-byte上限は既存検証を維持する。全Blob・全選択/権限/保存版の成功後だけ個別download linkを生成し、部分成功や自動クリックを追加しない。影響範囲はBatch manifest、Editorの方式選択、専用試験。Recipe/RAW/Storage/Cloudは不変。部品と合成非RAW試験だけでOS実保存名や元候補9方式全体をPASSにしない。

## 2026-10-04 Add Shadow手動限定Worker operation（実装前）

既存の手動subject mask・本人選択背景画素をAsset/SHA/保存版/寸法に束縛した独立Worker operationを追加する。既存Recipe/処理順、RAW原本、旧描画、Cloud/Storage/APIは変更しない。入力runtimeの出典自称値は認証証明ではなく、Workerは同値を再検証してfresh pixelsへ処理し、異Asset/SHA/版数/寸法・中断・不正背景を拒否する。影響範囲はWeb Processing Workerと専用試験。認証済みBackdrop取得、Blob→RGBA照合、Recipe/Session/UI、元製品画質は別工程であり、Worker試験だけで製品機能完了に数えない。

## 2026-10-04 Smart Culling用Node Workspace本人境界（実装前）

手動Stars/Flags/Tags/SegmentsをNode Workspace製品画面へ安全に接続する前提として、既存OIDC/JWT認証済みrequestでのみ本人subject・tenantと当該Workspaceのmembership/roleを返す読み取り専用Session endpointを追加する。TokenやSecretは応答しない。未認証/期限切れ/非memberは拒否し、tenant_idとWorkspace UUIDを同一視しない。既存Project/Asset/Culling、Recipe/RAW、Trial/Cloud、DB schema、権限とFeature Gateは変更しない。影響範囲はNode Workspace HTTP routeと専用認可試験。後続Web clientは外部hostのBearer tokenProviderをその場で受け、同endpointのfresh本人・tenant・membership/roleを厳密検証する。tokenの保存/ログ/URL転記やTrial/Cloudへのfallbackはしない。Web側のOIDC host/tokenProviderの製品実装と本人が選ぶProject/AssetのUI接続は別段階であり、endpoint/client追加だけで製品Culling完了には数えない。

## 2026-10-04 B/W Edge 手動二層マスクの製品経路接続

既存のRecipe v1 `extendedParameters.bwEdgeManual` の範囲だけで、本人がAfter上で明示したsubject/correction二層strokeを、同じAsset UUID・Original SHA・原寸に束縛して保存・Preview・単写真Finalへ接続する。共有Recipe外形、RAW原本、旧処理順、Storage/Cloud binding、人物自動選択は変更しない。Trial HTTP/SQLiteではWorker実行前と保存/Final時にfresh Session・Asset・Original SHA・保存版・権限を確認し、WorkerでProxy/Final寸法を照合する。未対応のSites認証、8MP超、写真固有maskのPreset/Batchコピー、B/W含む複数Finalは安全側に拒否する。影響範囲はWeb Session/Processing/Editor UI、BackendとCloudのRecipe保存束縛、Workspace/Preset/Batchの漏洩遮断、および専用試験。実RAW・Cloud配備・元製品の自動境界補正品質は別Gateであり、部品/合成試験だけで元候補全要素完了に数えない。

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
# 2026-10-08 混合項目Astraコード先行: Add Shadow解像度整合

理由: 既存Add Shadowのsource authored影位置・ぼかし値をProxyにも同じ整数で渡すと、異なる解像度で相対的な見た目がずれる。影設定のsource-pixel意味を保ったままProxyへ投影する純粋コードを追加する。対象は `apps/web/src/processing/add-shadow-runtime.mjs` と新規geometry helperのみ。既存source target動作、保存形式、認証、画面、Worker操作名、Recipe外形は変更しない。実画素確認・試験・アプリ接続はユーザー指定により後段。

同じ項目の後続コード: 異寸法の本人選択背景に対して、呼出側が `fit` / `cover` / `stretch` とanchorを明示したときだけ、背景frameを合成寸法に配置する純粋処理を追加する。既存の選択evidence/Asset/SHA/版/digestの照合を維持し、既定の異寸法拒否とTrial背景Gateは変更しない。これは自動背景判断や製品接続の完了ではない。
# 2026-10-09 旧メイク一括出力の写真別同意

BrowserLocalの保存済み5メイクを一括出力へ接続する。写真別の実保存recipe/SHA/人物を一覧提示し、各写真へ明示同意を取得、選択や保存状態の変化で失効させる。既存source runtimeと再照合を再利用。クラウド権限、顔推論、非中立portraitを開放しない。
# 2026-10-09 ローカル旧影方式の明示承認

ユーザーOKにより、旧BW/影もローカル専用同意で対応する。旧認証wrapperは維持し、画素算術だけを共通化する。実同DBの原本/背景/履歴を照合し、保存strokeのローカル再適用に同意を求める。匿名localを認証済みowner/Cloud Safeと表示しない。原寸8MPまで、AIや大判は対象外。テストはユーザー操作、buildと順次Web配備のみ実施。
# 2026-10-09 クラウド3系統の先行コード

LUT取得、Workspace出力設定、Proxy転送の既存未接続を補う。旧データを保持し出力schemaを後方互換追加。Proxyは原本と別の記録・容量予約・SHA・不変保存・冪等operationで管理し原本Cloud Safeを変更しない。認証済サーバー接続が未設定の公開previewは同期成功扱いにしない。実接続先はユーザー確認中。
# 2026-10-11 D03局所補正基盤追加

既存顔明度とは別に、明示した局所maskの平滑化と明示ソースからの修復を区別する。肌/傷跡の自動認識を偽装せず、写真と解析座標に結び付いた入力のみ受理。既存Recipeと原本は変更しない。今回の追加は描画部品であり、保存/Final接続やD03全体完成とは分けて記録する。

# 2026-10-11 D03明示プレビュー入口

既存人物panelに手動矩形選択による局所補正候補を追加する。画像サイズに束縛された明示領域だけを処理し、自動肌判定とはしない。結果は未保存プレビューで既存Recipe/Undo/原本を変更しない。保存対応は別工程。

# 2026-10-11 D03再描画可能な保存契約

手動プレビューのPNGそのものをRecipeへ保存せず、版・写真・upright座標の正規化矩形・保護矩形・効果を保存する契約を追加する。既存Recipeの任意拡張を維持し、新キーは厳密検証する。描画器が対応しない経路では拒否を維持し、保存UIを先に開放しない。

# 2026-10-11 D03確定保存入口

局所補正候補を保存recipe rendererでプレビューし、既存layersを保持して一度だけ追加する。写真/保存revision/設定変更時は候補を失効。Editorの既存Undo/CAS保存へ渡し、原本は変更しない。大判未対応と通常原寸の資源上限は維持。

# 2026-10-11 D03大判用の分割描画

局所補正の全画像Float配列化を避け、画像全体の座標系とlayer順序を維持した分割描画へ進める。平滑化の近傍とclone参照元を別途要求し、選択/保護/alphaを維持。描画器が揃うまで既存unsupported拒否を維持する。

# 2026-10-11 D03顔内領域の候補

既存Vision点と人物maskから保守的な顔内候補を提示する。これは肌/しわ/傷跡を意味的に認識した証拠ではなく、補正の自動実行や保存には使用しない。不足点・曖昧な人物対応は保留、設定/写真変更で失効する。専用検出器の採用は今回変更しない。

# 2026-10-11 D04画像とmaskの変形座標

既存Webの出力→原画像displacementと逆写像の成立条件をSwift側で共有する。異なる写像でブラシ/maskをずらさず、非収束や境界破綻は拒否する。既存Web基盤は変更しない。自動体型検出や画像変形UI完了とは別の部品作業。

# 2026-10-11 D04画像再標本化adapter

既存LocalWarpCoordinateMapと同じoutput-to-source座標で画像を処理する部品を追加する。上下方向・pixel-center・写真bindingを固定し、マスクとのずれを防ぐ。UIや永続形式はこの段階では変更しない。原本不変、試験・ビルド・配備なし。

# 2026-10-11 D04ブラシfield生成

Web既存操作をSwiftのruntime契約へ移植する。出力サイズとgridを一致させ、freezeは現在maskを全操作へ適用。保護された補間donorを使わない実fieldを確定後に認証し、失敗時は全体を拒否する。自動体型認識・UI・保存契約は対象外。

# 2026-10-11 D04プレビューservice

画像・mask・fieldを一つの要求で処理するruntime入口を追加する。既存LocalFacePixels.Preparedで同じreference PNGを再照合し、同じmapによる結果だけを返す。UI/永続保存は別段階、試験なし。

# 2026-10-11 D04手動操作プレビューUI

手動変形の明示入力を既存人物panelへ追加。native顔モデル不要で未編集proxyの候補だけを描画する。写真/設定変更と取消で候補失効。保存・Final対応前のため確定ボタンは設けない。

# 2026-10-11 D04累積操作

単一候補を確認して未保存セッションの操作列へ追加できるようにする。元PNGから全操作を再描画し、変形済み画像への二重適用をしない。Undo/Redoはこの未保存列専用、Project編集履歴とは分離。現在保護矩形が全列に適用される規約を表示する。

# 2026-10-11 D04永続契約

localWarp拡張を追加し、normalized操作列と現在保護矩形、reference寸法、対象asset/SHAを保持する。既存拡張を壊さず厳密schema検証を追加。再描画接続前は保存UIを開放しない。試験なし。

# 2026-10-11 D04保存再描画

保存localWarpの再描画adapterを追加する。元座標のlocalRetouch/portrait処理の後、global/crop前に画像全体を変形し、元maskによる補正も一緒に移動させる。大判専用経路は対応するまで拒否、保存UIは未開放。試験なし。

# 2026-10-11 D04確定保存

既存warpを復元して未保存列を編集し、最新列のpreview確認後のみ既存Editor edit/Undo/CASへ確定する。表示と保存のrendererを統一、原本不変。大判未対応は維持。試験・ビルドなし。

# 2026-10-11 D04保存済み変形の削除

空列保存とは別の明示操作でlocalWarp拡張だけを削除する。確認ダイアログ後に固定checkpointを照合し既存Undo/CASへ反映。他補正・原本は保持する。

# 2026-10-11 D04ドラッグ入力

未編集reference画像上のドラッグを正規化top-left座標へ変換し、既存translate候補の明示previewへ渡す。余白・画像外・写真変更/取消は受け付けない。変形後画像の座標と混同しないよう入力面は元画像に限定。自動追加/保存なし。

# 2026-10-11 D04分割ドラッグ

長dragを既存translate operation列へ分割し、preview成功後に一群として追加する。Undo/Redoはセッション内group単位、保存は既存の平坦operation列。現在座標は元画像基準のまま、実時間描画ではない。上限超過は全体拒否。

# 2026-10-11 D05部分適用

人物解析待ちを全体色の停止条件と混同しない部分適用計画を追加する。既存単一判定APIは維持し、撮影時固定設定/写真/版ごとの適用識別を持つ新契約で重複適用を拒否する。外部推論/SDK実行なし。

# 2026-10-11 E02明示撮影相関

camera/session/capture IDと実受信SHA/receiptを関連付ける値台帳を追加。previewはfinalに選べず、確定後の遅着RAWで原本を暗黙置換しない。hostは台帳を永続化後にcoordinatorへ渡す。SDK相関や台帳の自動永続化は別工程。

# 2026-10-11 一部項目の接続完了を優先

背景保存追加: localBackdrop拡張は写真SHA、背景の固定版/実SHA、明示手動maskの不変参照/実SHA/寸法、配置、背景EV、排他影を保持する。原本不変で既存Undo/CASへ接続。maskを異なる寸法のFinalへ暗黙拡大しない。通常描画で同寸法のみ再利用し、未対応大判は効果を黙って省かず拒否する。未対応原寸は今後の原寸mask供給経路と区別。

F04/F05: 既存人物panelから固定原本参照proxyと利用者指定L8マスク、検証済みローカル背景を使う明示プレビューを接続。背景限定の露出/排他的な影を処理した後で人物を一度だけ合成。旧背景画素を再合成しない。これは未保存proxy見本でありFinal/Recipe保存と区別。自動生成/自動切抜き/モデル取得なし。

D05追加: 部分適用receiptをcheckpointと同時保存する任意envelope記録を追加する。旧保存文書の読込を維持し、通常編集でreceiptを落とさない。同ID本文違い/入力版違いを拒否し、部分適用後の再送が二重補正にならないようにする。既存全job commitと別種として保持、原本不変。

H03/H04は既存Web状態取得と手動導線へ接続する。未確認状態を準備済みにしない。F06は実ローカル背景storeをEditorから人物panelへ注入し、素材一覧/選択だけを提供する。選択を写真への適用と混同しない。E02は明示撮影IDの台帳を永続化し既存原本取込へ接続する。SDKの未提供情報は推測せず、原本/既存Recipeを変更しない。試験・ビルド・配備は今回実施しない。

# 2026-10-11 背景原寸マスクとWeb人物Workerの追加契約

localBackdrop schema1に任意finalMask（sha256/width/height/byteCount）を追加。旧文書は省略のまま読める。Web strict decoderも追随。Preview/Finalを明示指定し、同じマスクを暗黙拡大しない。原寸マスクの明示取込・SHA照合・利用者による写真対応確認を必要とし8MP上限維持。背景合成は人物補正の後、形状変形の前に行う。

Web顔解析は既存SuiteFaceCore C ABIを使う別Workerとして追加。従来MediaPipe詳細点を置換しない。Emscripten成果物未導入は未準備であり、モデル自動取得・自動クラウド移行・推論実施なし。

