# 固定担当と統合

## 2026-10-17 コスプレ背景・演出プリセット

Main: apps/web/src/cosplay-preset-library.mjs と docs/COSPLAY_PRESETS.md、共有記録。cosplay_ui: apps/web/cosplay-presets.html、apps/web/src/cosplay-preset-library-ui.mjs の独立ローカル素材作成画面。既存編集Recipeを変更しない。生成AI・試験・ビルド・配備なし。

## 2026-10-13 2D確定とE04/E05接続

ai_identity: 最新ユーザー承認2D体型補正、既存D04 Model/Panel/serviceと必要な専用Core能力契約。ai_native: E04/E05 TetherLocalRecoveryModel/View、TetherLocalSessionHost、EditorのtetherContextとqueue読取。Main: docs/最終統合。人物Model/PanelとEditorを分離。検査ビルド配備SDK通信なし。

## 2026-10-13 Mac以外の残コードを確定

ai_assets追加承認：新docs/AI_FOLLOWUP_MEASUREMENTS.md（H05の4指標を分離した未測定確認表）。新推論/試験runtimeは追加しない。

ai_native: 旧未着手9件と48項目の現コード照合（読取のみ）。ai_assets: F01/F02/F03/F06/H05の照合、実装対象通知後に独立ファイルを担当。ai_identity: D04既存所有範囲、2D完成範囲のユーザー選択待ち。Main: 共有統合・記録。Mac彩度/crop照合は除外、検査/ビルド/配備なし。

## 2026-10-13 最終2件

ai_identity追加所有：LocalObservedBodyWarpBuilder.swift。既存Webの関節領域/配分規則を再利用しCUSTOM値から接続、未定義のLOW/MEDIUM/HIGH係数は生成しない。

ai_identity: D04既存の強度規則/実解析供給を調査し既存service/Model/Panelへ接続。ai_assets: H02既存見た目を維持するMac照合用受渡しの不足コード。Main: 統合・決定記録。ユーザー承認により彩度と小数cropはMac実結果で仕上げ、推測の共通式へ変更しない。検査/ビルド/配備は実施しない。

## 2026-10-13 残3系統の並列実装

H02追加所有：ai_assets local-backdrop-preview-host.mjs/displayとbundle v2。Main backend/src/photo-policy.tsのv1/v2参照許可。

ai_identity: 新LocalAdaptiveBodyWarpService.swiftと既存人物Model/Panelへの入口（MainへAPI通知）。ai_assets: Web Apple bundle-store/cross-device UI/preview UIの明示素材移送。ai_native: 新生成運営照合CLI/serviceとgeneration-ledger。Main: docs、各担当の共有接続統合。検査・ビルド・配備・実通信なし。

## 2026-10-13 残6件の最終接続継続

ai_native返却追加：ServerGenerationClient/Model/Viewの明示未送信取消。以後Main統合所有。

返却済み：ai_nativeのShared/ServerGenerationLaunchView.swiftとEditor入口、ai_identityのCandidateReview/Adapter、ai_assetsのH02再読込/Undo/CAS資産検証。最終統合はMain。

ai_native: ServerGenerationClient/Model/View、SuiteBackendClient、CloudTransferCoordinator、Editor/LocalPeoplePanelの生成入口。ai_identity: ServerGenerationCandidateReview/Adapter、E06復旧workerの残コード（Editor/Panelは編集しない）。ai_assets: H02既存Web bundle保存/読込/Undo。Main: generation-server/provider、共有契約通知と進捗資料。コードのみ。

## 2026-10-13 残機能続行

ai_identity: 新LocalManualPartProposal.swiftと人物Model/Panel/実geometry提案。ai_assets: H02 Web strict reader/warp/session/UI/editor H02部分。ai_native: backend新generation料金表・credit台帳。Main: backend provider executor/HTTP接続とdocs。実通信・検査・ビルド・配備なし。

## 2026-10-13 承認済み部位自由変形

ai_identity: LocalManualPartWarpAdapter.swift（新規）、LocalPeopleModel.swift、LocalPeoplePanel.swift、LocalPersonBodyWarpService.swift。鼻・左右目・胴・左右胸を既存操作へ接続。ai_native: 同操作契約の読取整理のみ。Main: docsと共有統合。検査・ビルド・配備なし。

## 2026-10-13 残6件の再開

対象はD04/E06/G01/G04/H02/H06のみ。6件完了で停止。検査・ビルド・配備・実推論・外部送信は行わない。
ai_identity: D04 LocalBodyGeometryService / LocalPersonBodyWarpService / LocalPeopleModel / LocalPeoplePanel。
ai_native: E06 TetherLocalAnalysisAdapter / TetherLocalSessionHost / TetherLookLocalWorker / TetherLocalRecoveryModel / TetherLocalRecoveryView と復旧関連。
ai_assets: H02 Apple保存形式のWeb読込・描画・復元関連。editor-uiと共有契約はMainへ事前連絡。
Main: G01/G04/H06、共有Editor接続、担当間統合、進捗資料。共有契約変更は事前通知し担当と調整する。

## 2026-10-13 一部実装12件を先行

最新返却: ai_identity=身体関節点→ブラシ/変形後座標表示。ai_assets=Web Apple全体編集の専用復元adapterとpreview-session/UI。ai_native=Tetherの実ローカル解析入力adapter・host・再開画面。全担当返却済み。Main=共有統合・docs。試験・ビルド・配備は行っていない。

ユーザーが使用量停止条件を解除。一部実装12件の残コードを先行し、試験/ビルド/配備は実施しない。
ai_assets: H02 cross-device-compat-report-ui.mjs と新local-backdrop-preview-ui.mjs（既存preview-session再利用）。editor-uiはMainのみ。
H02 UI返却後: ai_assetsはprocessing/local-backdrop-renderer.mjs、local-backdrop-render-adapter.mjs、local-backdrop-preview-ui.mjsを所有しaddDrop影を既存Apple定義と合わせる。
H02影返却後: ai_assetsはF04 LocalBackdropPreviewModel.swift/LocalBackdropPreviewView.swiftと新人物切抜きadapter。既存Vision/PortraitPipeline読取再利用、変更必要時Mainへ連絡。
ai_native: E06 TetherLookRecoveryCoordinatorと新復旧worker関連サービス。共有ProjectStore/PhotoPipeline/EditorModelは変更前にMainへ連絡。
追加許可: ai_nativeはTetherLocalSessionHostも所有し実worker注入/再開入口を接続。
ai_identity: D05 SessionLookPartialApplyCoordinatorと新全体/質感/出力adapter。共有model/store/pipelineは変更前に連絡。
D05返却後: ai_identityは新GenerationAuthorizationModel.swift/GenerationAuthorizationView.swiftを所有。MainがEditor接続・現在写真確認を担当。
G01 UI返却後: ai_identityはLocalPersonSkinSmoothingService.swift/LocalPeopleModel.swift/LocalPeoplePanel.swiftを所有し、人物紐付け修復を既存clone処理へ接続。Mainは同panel編集を終了。
Main追加: EditorModel.swift / EditorComponents.swift / LocalPeoplePanel.swiftの生成依頼登録入口。
Main追加: local-face-runtime-panel.mjsと新local-face-gallery-host.mjs。明示取込したWeb専用人物galleryとpolicyを照合sessionへ接続。
Main: editor-ui.mjs、新Web背景host、docs、担当間統合。その他の残件は返却後に順次割当。
Mainはlocal-backdrop-preview-session.mjsの全authorize段階へ固定bundle binding/recipeを渡す変更も所有。

## 2026-10-11 使用量48%時点の続行

ai_assets: H02背景bundle/renderer adapter返却済み、PNG実decoderを担当。ai_identity: 比較関数・observationsの一時コピー解放を返却済み。Main: analysis-sessionと返却済renderer adapterのメモリ予算整合。試験・ビルド・配備なし、50%で停止。

## 2026-10-11 背景保存後の続行

継続次: ai_native D03局所補正adapter調査・提案、ai_identity G01見積固定の残コード、ai_assets input/controller取消整合。返却済生成storeはMainがdirectory同期/不変保存を追加、Editor候補採用の背景寸法/bytecount照合も追加。

継続: ai_native=新LocalGenerationCandidate.swift/LocalGenerationCandidateStore.swift（背景合成を再利用しprovenance保存）。ai_assets=新local-face-analysis-input.mjs。ai_identity=新local-face-analysis-session.mjs。Main=local-ai-runtime-status-ui.mjsのpanel接続、返却済local-face-runtime-panel.mjsの入力変更失効。

次工程所有: ai_assetsは新local-face-runtime-controller.mjs、ai_identityは新processing/local-face-identity.mjs、ai_nativeはLocalBackdropPreviewModel.swiftとLocalBackdropPreviewView.swift。Mainは返却済processing/local-face-wasm-bridge.mjsの固定モデルSHA snapshot修正。CMake/worker入口とfinalMask厳密読込は返却済み。

ai_native: LocalBackdropRecipeRenderer.swift / LocalBackdropRecipeStore.swift。原寸マスク導入の不足を調査し、追加所有は事前通知。

ai_assets: H01 Web worker/bridgeの新規コード。既存ファイル所有は事前通知。背景Web読込3ファイルは返却済み。

ai_identity: ProjectStore.swift / SessionLookPartialApplyCoordinator.swift。保存後の部分receipt再開整合。

Main: docsとLocalBackdropPreviewModel.swift / LocalBackdropPreviewView.swift。入力マスクの実寸表示を追加。背景解除のEditor関連3ファイルは返却済み。

## 2026-10-11 背景合成の保存と再描画

ai_identity: 新SuiteCore/LocalBackdropRecipe.swift、Recipe.swift、Project.swift、PhotoLifecycle.swift。明示背景/maskの固定参照と写真binding、厳密schema、保存履歴/Final入力の検証。

ai_native: 新Services/LocalBackdropRecipeStore.swift、新Services/LocalBackdropRecipeRenderer.swift、PhotoPipeline.swift。maskの不変ローカル保存と既存背景store再利用、保存recipe通常再描画。大判は未対応を明示拒否。

ai_assets: LocalBackdropPreviewModel.swift、Shared/LocalBackdropPreviewView.swift。成功previewと同じ設定/素材/maskを保存候補として不変保存し、Mainへcallback。世代失効/取消を保持。

Main: EditorModel.swift、LocalPeopleModel.swift、Shared/LocalPeoplePanel.swift、Shared/EditorComponents.swiftとdocs。既存Undo/CASへ背景候補確定、写真/入力版/保存待機整合。

全担当は試験・ビルド・配備なし。使用量50%で停止。

## 2026-10-11 完成条件までの接続を優先

ai_native次工程F05: LocalBackdropCompositeRenderer.swiftと新Services/LocalBackdropLighting.swift。背景限定の露出/明示shadowを排他適用し人物source-over一回を保持。

ai_assets次工程F04/F05: 新LocalBackdropPreviewModel.swift、新Shared/LocalBackdropPreviewView.swift。実PNG写真・実素材・利用者指定L8マスクでプレビュー、状態失効と未保存明記。renderer APIをai_nativeと合意。

Main追加: LocalPeopleModel.swift/LocalPeoplePanel.swiftで固定referencePNG/assetbindingを新背景preview画面へ渡す。

ai_identity追加: packages/SuiteCore/Sources/SuiteCore/ProjectStore.swiftとSessionLookPartialApplyCoordinator.swift、SessionLookPartialApplication.swift。既存checkpoint envelopeの後方互換を維持しpartialreceiptとcheckpointを同時永続化、CASから部分適用を接続。

Main追加: 返却済みTetherLocalSessionHost.swiftへopenAndRecover起動入口。既存recoveryを呼んでからhostを返す。

ai_native次工程: LocalPeopleModel.swiftとShared/LocalWarpPreviewSection.swiftのみ。D04長strokeを有限操作列へ分割して候補/確定/Undo groupまで接続。既存schema維持。

ai_native追加: F03/F06のLocalBackdropCatalogModel.swift、Shared/LocalBackdropCatalogView.swift、LocalBackdropAssetStore.swiftで明示ファイル/manifest取込を実storeへ接続。ネットワーク取得・許諾自動承認はしない。

ai_identity追加: D05の既存SessionLookPartialApplication.swiftと新Services/SessionLookPartialApplyCoordinator.swift。実adapter結果を受け、準備済み効果のみ順番に適用し人物保留を保持、重複receiptと入力版を照合する入口。Project保存は既存CASへ渡す契約を維持。

ai_identity次工程: 新Services/TetherLocalSessionHost.swift。既存store/coordinatorを同root・同所有で組み立て、相関保存から取込/再開まで直列化するSDK非依存ホスト。

ai_assets追加: cross-device-compat-report-ui.mjs。既存互換確認画面からApple文書を読み込む導線と原文保持。画像描画と誤認させない。

ai_assets次工程: H02のapple-local-edit-import.mjs、cross-device-capabilities.mjsおよび既存読込接続ファイルを調査。新module実装とcapability接続を所有。追加既存ファイルはMainへ先に通知する。

Main追加: EditorModel.swift、Shared/EditorComponents.swift。F06背景storeを実アプリ保存rootで初期化しpanelへ注入。

ai_assets: H03/H04。local-ai-runtime-status.mjs、local-ai-runtime-status-ui.mjs、feature-catalog.mjs、editor-ui.mjs、新local-ai-browser-status.mjsのみ。現行Webの状態取得元と手動導線まで接続する。未取得の証拠を推測しない。

ai_native: F06。LocalBackdropAssetStore.swift、新LocalBackdropCatalogModel.swift、新Shared/LocalBackdropCatalogView.swift、Shared/LocalPeoplePanel.swiftのみ。保存済み実素材一覧・選択・未導入表示を人物panelまで接続。他担当ファイルは変更しない。

ai_identity: E02。CaptureAssetCorrelation.swift、新Services/CaptureAssetCorrelationStore.swift、Services/TetherCaptureCoordinator.swiftのみ。明示撮影ID台帳を永続化し既存取込入口へ接続。SDK待ちとコード残を区別。

Main: docs/HANDOFF.md、docs/AI_IMPLEMENTATION_BREAKDOWN_2026-10-09.md、docs/CHANGE_NOTICE.md、docs/OWNERSHIP.md。契約整合と完成条件の照合。試験・ビルド・配備なし。使用量50%で全担当停止。

## 2026-10-11 一部実装17件の一括継続

実装第1班ai_identity: SessionLookPlanning.swiftと新SessionLookPartialApplication.swiftのみ、D05全体色/人物保留の部分適用契約。既存API互換を維持。

第1班追加所有: 新Services/TetherLookRecoveryCoordinator.swift、E06保存済みingest/queueの再開手配。既存Capture/Commit coordinatorを再利用。

第2班追加所有: 新apps/web/src/apple-local-edit-import.mjs、H02保存native編集の厳密読込・保持と未実行表示。rendererの代用にしない。

実装第2班ai_assets: apps/web/src/local-ai-runtime-status.mjs新規とcross-device-capabilities.mjsのみ、H02/H03/H04未対応差分明示と端末内資産/実行状態の非推論判定。既存読込拒否は維持。

第2班追加所有: feature-catalog.mjsと新local-ai-runtime-status-ui.mjs、未確認を未確認として表示する状態UI。自動モデル取得・推論はしない。

Main: 新packages/SuiteCore/Sources/SuiteCore/CaptureAssetCorrelation.swiftのみ、E02明示撮影IDの関連づけ値契約。SDKの推測相関はしない。

Main追加: Services/TetherCaptureCoordinator.swift、明示相関済みfinal選択から既存receiveOriginalへ渡す入口。

実装第3班ai_native: 新apps/apple/Suite/Services/LocalBackdropAssetStore.swiftのみ、F03ローカル背景のSHA/寸法/許諾参照付き保存・版保持。既存LocalAIModelStoreの安全な保存を参考。

第3班追加所有: 新Services/LocalBackdropCompositeRenderer.swift、F04明示L8mask/placementによる背景合成。自動人物検出は偽装しない。

ai_identity: D03/D04/D05/D06/E02/E06を読取照合し不足コードと具体所有候補を報告。ai_native: F03/F04/F05/F06/G01/G04を同様に照合。ai_assets: H01/H02/H03/H04/H06を同様に照合。Mainがファイル別所有を確定して実装を並列継続。資産待ちを完成と偽装しない、試験・ビルド・配備なし。直前D04分割dragはまだ未着手。

## 2026-10-11 D04分割ドラッグ

ai_identity: LocalPeopleModel.swiftのみ、長drag分割・候補group・group Undo/Redo。ai_native: 読取のみ分割/座標/上限レビュー。Main: LocalWarpPreviewSection.swift説明とdocs。保存契約は既存operation列を使用、試験なし。

## 2026-10-11 D04ドラッグ入力

全担当返却済み。MainがSectionへcanvas接続し範囲説明を統合。試験なし。

ai_identity: LocalPeopleModel.swiftのみ、ドラッグから移動候補を設定する入口。ai_native: 新Shared/LocalWarpDragCanvas.swiftのみ、aspect-fit座標とgesture。Main: Shared/LocalWarpPreviewSection.swift接続とdocs。ドラッグは候補作成のみで自動保存しない、試験なし。

## 2026-10-11 D04保存済み変形削除

全担当返却・Main確認UI/callback統合済み。試験なし。

ai_assets: EditorModel.swift/Shared/EditorComponents.swiftのみ、明示warp削除の既存Undo/CAS接続。ai_identity: LocalPeopleModel.swiftのみ、削除可能base状態の公開。Main: Shared/LocalPeoplePanel.swift/LocalWarpPreviewSection.swift確認UIとdocs。他拡張は保持、試験なし。

## 2026-10-11 D04確定保存

全担当返却済み。Main UI callback・保存ボタン・範囲説明を統合。試験なし。

ai_identity: LocalPeopleModel.swiftのみ、既存warp復元・保存candidate・保存renderer preview統一。ai_native: 新Services/LocalWarpRecipePreview.swiftのみ、検証PNGから保存rendererでpreview。ai_assets: EditorModel.swiftとShared/EditorComponents.swiftのみ、既存Undo/CAS確定入口。Main: Shared/LocalPeoplePanel.swift/LocalWarpPreviewSection.swiftとdocs。APIを担当間共有。試験・ビルドなし。

## 2026-10-11 D04保存再描画

全担当返却済み。Main通常pipeline接続・premultiplied指定・大判拒否統合済み。保存UIは未開放。

ai_native: 新Services/LocalWarpRecipeRenderer.swiftのみ、保存recipeから認証fieldと画像再描画。ai_identity: 読取のみ処理順序・mask座標整合調査。Main: PhotoPipeline.swift通常接続と大判拒否、docs。保存UIは未開放。試験・ビルドなし。

## 2026-10-11 D04永続契約

実装担当返却・Main検証入口統合済み。描画と保存UIは未開放としてHANDOFFへ記録。

ai_identity: 新SuiteCore/LocalWarpRecipe.swiftのみ、厳密な操作列/保護矩形/写真束縛とRecipeParameters extension。ai_native: 読取のみ再描画/履歴検証接続点調査。Main: Recipe.swift/Project.swift/PhotoLifecycle.swiftの検証入口とdocs。保存UI・描画pipelineはまだ変更しない。試験・ビルドなし。

## 2026-10-11 D04累積操作

全担当返却済み。Main統合所有にLocalPeopleModel.swiftを追加。候補込み/列のみの異なるmapが同じ版を共有しないよう要求ごとのgeometry版を付与する。

ai_identity: LocalPeopleModel.swiftのみ、未保存warp操作履歴とcandidate確定/Undo/Redo/Reset。ai_native: Shared/LocalWarpPreviewSection.swiftのみ、合意APIで履歴操作UI。Main: docs統合。Recipe保存は別段階。試験・ビルドなし。

## 2026-10-11 D04操作プレビューUI

全担当返却済み。Main統合所有にLocalPeopleModel.swiftを追加し、geometry版を入力revisionにも束縛する。

ai_identity: LocalPeopleModel.swiftのみ、手動warp入力・世代失効・preview呼出。ai_native: 新Shared/LocalWarpPreviewSection.swiftのみ、model担当とAPI合意した入力/結果表示。Main: Shared/LocalPeoplePanel.swift接続とdocs。保存確定は未開放、試験・ビルドなし。

## 2026-10-11 D04プレビューservice

全担当返却済み。Mainが入力前処理版とengine版の分離・操作数の早期制限を照合し記録統合。試験なし。

ai_native: 新apps/apple/Suite/Services/LocalWarpPreview.swiftのみ。同じ検証済みreferenceからfield/画像/maskをまとめて返すactor。ai_identity: 読取のみservice契約レビュー。Main: docs。画面と保存は変更しない。試験・ビルドなし。

## 2026-10-11 D04ブラシfield生成

全担当返却済み。保護Data sliceのzero-based snapshot修正を反映、Mainが記録統合。試験なし。

ai_identity: 新packages/SuiteCore/Sources/SuiteCore/LocalWarpFieldBuilder.swiftのみ、Web操作を再利用した境界固定field生成。ai_native: 読取のみ保護・map整合レビュー。Main: docs。UI/保存は変更しない。試験・ビルドなし。

## 2026-10-11 D04画像再標本化

担当返却済み。MainがFloat画像補間・maskとの座標規約をソース照合し、未接続範囲をHANDOFFへ記録。試験なし。

ai_native: 新apps/apple/Suite/Services/LocalWarpImageRenderer.swiftのみ、認証mapを用いたFloat画像再標本化。ai_identity: 読取のみブラシ/保存接続の依存調査。Main: docsと結合。UI・保存契約はまだ変更しない。試験・ビルド・配備なし。

## 2026-10-11 D04変形座標の共通基盤

全担当返却済み。Mainがmask解像度保持・source/warped区別と二重変形拒否をソース照合。画像描画・ブラシUI・保存への接続は残作業としてHANDOFFへ記録。試験・ビルド・配備なし。

ai_identity: 新SuiteCore/LocalWarpCoordinateMap.swiftのみ、既存Web certified displacementのSwift版・往復座標。ai_native: 新Services/LocalWarpMaskAdapter.swiftのみ、同じ変形mapでL8 maskを再標本化するadapter。ai_assets: 読取のみWeb変形契約と保護mask。Main: docsと結合。新しい自動体型モデルや保存形式は追加せず、試験・ビルドなし。

## 2026-10-11 D03顔特徴点の領域候補

全担当返却、Main最終統合所有にLocalFaceRegionProposalView.swiftを追加（task ID型整合）。

ai_native追加所有: 新Shared/LocalFaceRegionProposalView.swiftのみ。proposal maskを同じreference画像へ表示（bottom-up→UIKit top-down明示）、適用/保存操作なし。

ai_identity: 新Services/LocalFaceRegionProposal.swiftのみ、既存詳細点/person maskから顔内候補mask生成（肌意味推定ではない）。ai_native: 読取のみ入力点/保護領域API照合。Main: LocalPeopleModel.swiftとShared/LocalPeoplePanel.swift、結果表示と失効、docs。自動適用・傷跡検出済の扱いは禁止、試験・ビルドなし。

## 2026-10-11 D03分割描画

全担当返却済み。Mainが大判writer/PhotoPipelineの接続・取消token・説明を統合。静的API/halo/pointer確認を反映、HANDOFFに資源上限と未試験を記録。

Main追加所有: Shared/LocalRetouchPreviewSection.swift、対応範囲の説明更新。

ai_native: 新Services/LocalRetouchTiledRenderer.swiftのみ、既存Float局所補正と同じ効果の遅延分割CI描画。ai_identity: 読取のみ座標/halo/clone境界調査。ai_assets: 読取のみ大判接続箇所。Main: PhotoPipeline.swiftとDelta66LargePrint.swift接続は新描画API確認後、docs。試験・ビルド・配備なし。単なる上限引上げはしない。

## 2026-10-11 D03確定保存入口

全担当返却・Main統合済み。保存rendererでpreview、既存layer保持、Editor確定から既存Undo/CASへ接続。別解像度proxyは保存referenceを維持しrendererのaspect/scale判定へ委譲。HANDOFFに残範囲記録、試験なし。

model担当返却後のMain統合所有: LocalPeopleModel.swift（倍率/入力範囲照合）。

ai_identity: LocalPeopleModel.swiftのみ、既存localRetouchを保持してcandidate生成/失効/取得。ai_native: 新Services/LocalRetouchRecipePreview.swiftのみ、保存rendererでPNGプレビュー。ai_assets: 読取のみ。Main: EditorModel.swift、Shared/LocalPeoplePanel.swift、Shared/LocalRetouchPreviewSection.swift、呼出元Viewのcallback、docs。確定は既存edit/Undo/CASを再利用。試験・ビルド・配備なし。

## 2026-10-11 D03保存契約・再描画接続準備

全担当返却済み。MainがRecipe検証とPhotoPipeline通常描画を統合。大判未対応の早期拒否追加。保存UIは未開放、preview/保存renderer統一が次。HANDOFF記録済み。

ai_identity追加所有: SuiteCore/Project.swiftとPhotoLifecycle.swift。全履歴とExportPlanのlocalRetouch写真binding照合を既存portrait同様に追加。ai_nativeは同rendererのFloat精度保持修正も所有。

Main追加: PhotoPipeline.swift。通常プレビュー/Finalの共通描画入口へlocalRetouch adapterを接続、対応範囲外は明示拒否。大判tile経路は未対応拒否を維持。

ai_identity: 新packages/SuiteCore/Sources/SuiteCore/LocalRetouchRecipe.swiftのみ、正規化矩形の保存契約とRecipeParameters extension。ai_native: 新apps/apple/Suite/Services/LocalRetouchRecipeRenderer.swiftのみ、保存契約の再描画adapter、identityとAPI合意。ai_assets: 読取のみ保存/再描画境界。Main: Recipe.swift検証呼出とdocs。既存UIの保存ボタンは再描画接続が揃うまで有効化しない。原本不変、試験・ビルド・配備なし。

## 2026-10-11 D03局所補正プレビュー入口

全担当返却済み。MainがPanelへSectionを接続し、model API/座標変換/取消とnative不要の入口を静的照合。保存対応を完了扱いにせずHANDOFFへ記録。

ai_identity: LocalPeopleModel.swiftのみ、明示矩形mask/保護矩形と局所補正rendererの呼出・取消・結果失効。ai_native: 新Shared/LocalRetouchPreviewSection.swiftのみ、入力/未保存PNGプレビューUI、model担当とAPI合意。Main: LocalPeoplePanel.swiftのsection接続、docs。ai_assets: 読取のみ。今回保存Recipeへの追加はせず、プレビュー段階であることを明示。試験・ビルドなし。

## 2026-10-11 D03手動局所補正の基盤

全担当返却済み。平滑化sourceにも選択/保護/不透明domainを適用する正規化局所平均へ修正済み。Mainが契約/呼出を静的照合、HANDOFFへ未接続範囲を記録。D03一部のまま、試験なし。

ai_identity: 新packages/SuiteCore/Sources/SuiteCore/LocalRetouchRequest.swiftのみ。写真/解析版/明示領域に紐付く平滑化と修復の別契約。ai_native: 新apps/apple/Suite/Services/LocalRetouchRenderer.swiftのみ、契約担当とAPI合意して局所平滑化と明示ソース修復の画素処理。ai_assets: 既存コードの読取調査。Main: docsと統合。既存Recipe変更・自動推定・試験・ビルド・配備なし。

## 2026-10-11 土台ありB04・詳細解析

全担当返却済み。Mainがservice APIとPanel呼出を統合し、設定変更/取消/写真切替の失効を追加。B04コード完成をHANDOFFへ記録。試験・ビルドなし。

Main追加所有: LocalPeopleModel.swift/Shared/LocalPeoplePanel.swift。詳細解析serviceを既存人物panelの明示操作へ接続し、写真/解析/設定変更で結果を失効する。自動補正や保存は行わない。

ai_native: PortraitPipeline.swiftのみ、既存Vision解析から実詳細landmarkと人物maskを取り出すactor内結果を追加。ai_identity: 新Services/LocalDetailedPortraitAnalysis.swiftのみ、同一入力検証とYuNet/Visionの一意対応を接続（native担当とAPI合意）。ai_assets: 読取のみAPI/型の確認。Main: docsと統合。旧顔明度経路・Recipe保存形式を保持し、解析実行/試験/ビルドなし。

## 2026-10-11 土台あり21件の優先処理・第一群

3担当とも成果返却済み。MainがAPI・登録呼出・pool既存入口・bundle loaderと表示の結合を静的照合しHANDOFFへ記録。LocalFaceAnalysisServiceは変更不要だったため変更なし。今後の編集は次の割当記録を先に追加する。

A05結合追加: LocalFaceAnalysisService.swiftの推論取得箇所もai_nativeが所有。LocalPeopleModelはC01担当のみとし、共通poolのサービス間接続はここで行う。

ユーザー指示で未着手9件より土台ありを優先する。直前の第九段案は未実装で、今回のA03/A05/C01を先行する。ai_assets: LocalFaceModelStatus.swift、Shared/LocalPeoplePanel.swift、新Services/LocalModelNotices.swift、新Suite/Resources/LocalModelLicenses/内のみ（既存取得license本文と固定出典の表示）。ai_native: LocalFaceInference.swift、新Services/LocalFaceInferencePool.swiftのみ（同store/同設定の共有、上限/解放/取消）。ai_identity: LocalPersonGalleryStore.swift/LocalPeopleModel.swiftのみ（登録元参照の暗号化保存と旧gallery互換）。Main: docsと結合。試験・ビルド・配備なし。license確認済みへ勝手に変更しない。

## 2026-10-11 AI第九段・実描画候補と操作別対応

ai_identity: 新packages/SuiteCore/Sources/SuiteCore/LocalLookSupport.swiftのみ（固定planの操作別未対応理由、明示EV契約の分離）。ai_native: 新apps/apple/Suite/Services/LocalPersonPreviewService.swiftのみ（既存PhotoPipelineと顔明度候補を使った実描画artifact作成、原本/保存checkpointを変更しない）。Main: 両APIの接続・docs。ai_assetsは既存Editor候補経路の読取調査のみ。試験・ビルド・配備なし。未取得解析証拠を完了扱いしない。

## 2026-10-11 AI第八段・保存と完了記録の原子的結合

2担当ともコード返却済み。Mainが保存API・同job異payload拒否・再照合契約を静的に照合し、HANDOFFと48作業表へ反映。試験/buildは実行していない。次回は自動解析/描画workerの効果別対応境界から続ける。

ai_identity: packages/SuiteCore/Sources/SuiteCore/ProjectStore.swiftのみ。旧checkpoint読込みと既存save契約を維持し、jobID付き補正commit記録を同一保存文書へ結合する。ai_native: 新apps/apple/Suite/Services/TetherLookCommitCoordinator.swiftのみ、上記API確定後のqueue commit/reconcile接続。Main: docs・API境界統合。Project.swift/Recipe/UI/実描画には手を出さない。試験・ビルド・配備なし。

## 2026-10-11 AI第七段・撮影設定固定の永続受渡し

上記3サービスは担当から返却済み。次工程のai_identity / ai_nativeは解析・描画・保存adapterの既存API調査のみ、編集なし。Mainが統合・進捗文書を所有する。

Main追加: 返却済LocalPersonCorrectionService.swiftへ安定analysisVersionの同一性ガードを接続（第六段結合）。

ai_assets: TetherLookQueueStore.swift（beginCaptureとcapture付きenqueueの永続transaction入口）。ai_native: TetherIngestStore.swift（既存Receipt/Handoffへ任意CaptureContextの後方互換保存、再送一致検証）。ai_identity: 新Services/TetherCaptureCoordinator.swift（固定context→受信→原本/Proxy/ProjectCheckpoint→queue永続→handoff ackの共通接続）。Main: docsと統合。メーカーSDK、実カメラ、画素補正worker、Web/配備は変更しない。capture相関不明を推測しない。

## 2026-10-11 AI第六段・人物対応の保存復元

3担当の実装は返却済み。MainがLocalPeopleModel/返却済LocalPeoplePanelの保存競合・削除後復元・再読み込み導線を結合する。

ai_assets: LocalPersonGalleryStore.swift（既存暗号化文書の後方互換拡張、写真別対応文書CAS、人物削除時の関連対応消去を同一commit）。ai_native: LocalFaceAnalysisService.swift（同一入力・モデル・解析条件の安定版/顔ID、取消世代とは分離）。ai_identity: Shared/LocalPeoplePanel.swift（永続保存/復元/不一致保留/明示再作成の表示、Main契約待ち）。Main: LocalPeopleModel.swiftとdocs、結合。試験・ビルド・配備なし。

## 2026-10-11 AI第五段

第五段成果は全担当から返却済み。MainがModel/Panel/EditorのAPIを統合。未完はHANDOFFへ記録し、実行済み・Web反映済みとはしない。

第五段サービス接続: ai_nativeは新apps/apple/Suite/Services/LocalPersonCorrectionService.swiftのみ（同じ参照PNGからVision領域を取得し、人物明度計画核へ接続）。MainはLocalPeopleModel/Panelに候補作成と表示のみ接続。Recipeへ無断保存しない。

Main追加: EditorModel.swiftは既存の同一assetと参照PNGをLocalPeopleModelへ渡す引数接続のみ。

第五段の明示適用: ai_identityへEditorModel.swift/Shared/EditorComponents.swiftを移管し、候補の明示適用を既存edit/history/CAS経路へ接続する。MainはLocalPeopleModel.swift/Shared/LocalPeoplePanel.swiftを担当。ai_native/ai_assetsは返却済み。候補作成は変更なし、利用者が適用ボタンを押した時だけ既存保存経路へ渡す。

第五段続行: 上記3担当の初回成果は返却済み。ai_native追加所有: 新packages/SuiteCore/Sources/SuiteCore/PersonFaceBrightnessPlan.swift（明示人物intent→現在写真の既存PortraitRecipe差分計画）。ai_identity追加所有: PhotoPersonAssignments.swiftのみ、validate境界の静的見直しと必要なコード補完。ai_assets追加所有: LocalFaceModelStatus.swiftのみ、表示用状態文字列とpermissionの表示値。Mainはcontroller/UI接続継続。

ai_identity: 新packages/SuiteCore/Sources/SuiteCore/PhotoPersonAssignments.swift（写真内顔と登録人物の明示対応・解除・履歴の値契約）。ai_assets: LocalAIModelStore.swiftと新LocalFaceModelStatus.swift（固定資産の未導入/不整合/準備済みの読取専用状態、推論可否と分離）。ai_native: 新packages/SuiteCore/Sources/SuiteCore/FaceRegionAssociation.swift（YuNet入力矩形と既存Vision領域の座標規約・一意対応核、曖昧は保留）。Main: LocalPeopleModel.swift/LocalPeoplePanel.swiftとdocsの統合。試験・ビルド・配備なし。既存Recipeへの暗黙適用なし。

第四段仕上げ: ai_nativeはLocalPeopleModel.swiftの同意失効・旧世代の保存結果反映防止を担当。Mainは返却済LocalPeoplePanel.swiftの必須表示名と操作状態の整合、引継ぎ記録を担当する。

## 2026-10-11 AI第四段・人物登録と表示

ai_assets: 新apps/apple/Suite/Services/LocalPersonGalleryStore.swift（端末限定暗号化gallery、Keychain、明示登録同意、削除）。ai_native: 新apps/apple/Suite/LocalPeopleModel.swift（解析/登録/照合/取消と画面状態）。ai_identity: 新apps/apple/Suite/Shared/LocalPeoplePanel.swift（明示登録と候補・削除のUI）。Main: PhotoPipeline.swift/EditorModel.swift/EditorComponents.swiftへの入口、docsと統合。既存編集・保存・顔明度経路を保持し、顔照合結果を自動でRecipeへ適用しない。試験/ビルド/配備なし。

第三段コードのLocalFacePixels/LocalAnalysisCache/LocalFaceInference/LocalFaceAnalysisServiceは2026-10-11に担当から返却済み。Mainが固定manifestと呼出契約を統合。license取得資料担当も完了・所有返却済み。

## 2026-10-11 AI第三段・推論接続

続行: ai_nativeは新LocalFaceAnalysisService.swiftを所有しpixels→cache→inference→photo target/identity入口を接続する。Mainは返却済LocalFaceInference.swiftの固定manifest定数参照の統合とdocsを所有する。ai_assets/ai_identityの第三段ファイルは返却済み。

ai_assets追加: scripts/fetch-suite-face-licenses.ps1とdocs/AI_MODEL_LICENSE_RECORD_2026-10-11.mdのみ。固定版の公式license取得を再現可能にし、既存未承認を勝手に承認へ変えない。ai_identity追加: read-onlyで今回のSwift/C ABI接続契約の静的差分確認、実行試験なし。変更はMainへ報告のみ。

Main追加: scripts/inspect-onnx-io.mjs、packages/SuiteCore/Sources/SuiteCore/PinnedFaceModels.swift、docs/AI_MODEL_IO_2026-10-11.md。実ONNXのgraph IOを読み取り、固定資産manifestへ記録する。推論実行ではない。

ai_native: 新apps/apple/Suite/Services/LocalFaceInference.swiftのみ（SuiteFaceCore C ABIと保存済モデル/FaceIdentity接続）。ai_assets: 新apps/apple/Suite/Services/LocalFacePixels.swiftのみ（向き確定済CGImage→縮小BGR、座標逆変換）。ai_identity: 新packages/SuiteCore/Sources/SuiteCore/LocalAnalysisCache.swiftのみ（single-flight・LRU・取消/世代管理）。Main: docs、モデル資産情報、統合。第二段ファイルは返却済み。既存UI/Recipe/課金/SDK変更なし、実写真試験・ビルド・配備なし。

## 2026-10-11 AI第二段

Main追加: scripts/fetch-suite-face-models.ps1 と docs/AI_MODEL_ASSETS_2026-10-11.md。公式固定commitから取得し期待bytes/SHAで検証する。出力はartifacts/local-ai-models、既存の異なるファイルは上書きしない。

ai_assets: 新apps/apple/Suite/Services/LocalAIModelStore.swift（検証済み資産のローカル導入）。ai_native: 新packages/SuiteFaceCore配下のみ（OpenCV顔検出/整列/照合C++核、C ABI）。ai_identity: 新packages/SuiteCore/Sources/SuiteCore/FaceIdentity.swiftのみ（版付き特徴と候補照合/人物対応の純処理）。Main: docs、固定配布情報、担当間契約統合。試験/ビルド/配備/有料呼出なし。元画像の送信なし。既存コードを保持する。

## 2026-10-11 AI実装第一段

追加: ai_captureはTetherLookQueue.swiftも所有し、撮影開始snapshotを受け取るqueue入口を接続する。Mainは新LocalAICapability.swiftの端末可否・資産・権限・料金の分離契約を所有する。

ai_requirements: SessionLookPlanning.swift と新 CorrectionAnalysisRequirements.swift（D01）。ai_capture: 新 CaptureContext.swift および SessionLook.swift（E01、SDK変更なし）。ai_manifest: 新 LocalAIModelManifest.swift（A01の検証契約、モデル値は捏造しない）。Main: docsと各担当の統合。既存ファイルは読み取って再利用、担当外変更は事前調整。実行試験・モデル取得・課金API・配備は今回行わない。

## 2026-10-11 大判再開

Main追加所有: apps/apple/Package.swift。PhotoPipelineが参照する大判writerを既存Mac QA targetの明示source一覧にも登録する。製品追加や試験実行はしない。

large_print_route: PhotoPipeline.swiftとDelta66LargePrint.swift、原寸共通描画/明示大判route。large_print_ui: EditorModel.swiftとShared/CropExportControls.swift、iPhone/iPad viewの大判明示操作・設定。Main:契約調整、docs、静的統合。互いの担当ファイルを編集しない。AI/HDR/SDKは変更しない。既存未対応補正を黙って落とさない。大判全機能・実機動作は未確認のまま表示する。

## 2026-10-09 AI分析・設計のみ

Main: AI_IMPLEMENTATION_BREAKDOWN_2026-10-09.mdの診断表。proxy_sync_auditはApple、workspace_export_auditはWeb、cloud_lut_auditは生成/会計を読み取り調査して報告。ソース実装・モデル取得・試験・配備は行わない。担当区分は作業依存に基づく提案でありモデル能力の保証ではない。

## 2026-10-09 今回はProxy残件のみ

proxy_sync_audit: 新workspace-proxy-editor-host.mjs、workspace-proxy-client.mjs（必要時）、Proxy再送情報の永続化。workspace_export_audit: 新workspace-proxy-ui.mjs、editor-ui.mjsの条件付きmount/disposeのみ。他のLUT/共有Presetは変更しない。Main: docs、統合/build/既存preview反映。実接続先の捏造・新規資源・写真の自動送信は禁止。

## 2026-10-09 クラウド3系統のコード補完

cloud_lut_audit: 新workspace-lut-sync.mjs（認証済hostのmanifestから既存loader/localstore接続）、web-connected-lut-ui.mjs。workspace_export_audit: backend/workspace.tsの出力preset schema、workspace-export-preset-client.mjs/UI/editor-host.mjs、editor-ui.mjsの出力設定adapter接続。proxy_sync_audit: 新backend/workspace-proxy.ts、workspace-server.ts、storage契約の既存呼出（storage.ts変更は要連絡）、新web/workspace-proxy-client.mjs。Main:共通接続条件/docs/統合build。担当間で同ファイルを編集しない。本番資源作成・実認証の捏造・外部送信はしない。

## 2026-10-09 SDK事前窓口調査

shadow_ui: 新docs/SDK_PRE_APPLICATION_2026-10-09.mdのみ。公式資料による事前申請条件調査。申請・規約同意・送信は行わない。UI所有は返却済み。

## 2026-10-09 ローカル影方式追加（ユーザー承認）

再開時の担当名: shadow_runtimeがmixed_canvas_gap、shadow_sessionがmixed_shadow_gap、shadow_uiがmixed_inventoryの上記所有範囲を引継ぐ。旧担当は稼働していない。Mainは統合まで各担当ファイルを変更しない。

追加: shadow_runtimeはprocessing/index.mjs、worker.mjs、pure.mjsも所有。BWの既存描画順を維持するlocal専用optionを接続。Mainはweb-connected-version-comparison.mjsの同意失効epochのみ担当。

追加: shadow_runtimeは新processing/local-saved-bw.mjsのlocal BW契約・算術共通化も所有。

追加: mixed_shadow_gapは新local-saved-shadow-consent.mjsも所有（写真/背景/特殊保存documentに束縛する一時同意）。

mixed_canvas_gap: processing/subject-mask-authoring.mjs、background-composite.mjsの純算術入口抽出、および新browser-local-saved-shadow-runtime.mjs。mixed_shadow_gap: session.mjsのローカル旧影の同意/描画/履歴/復元/出力接続。mixed_inventory: 新local-saved-shadow-consent-ui.mjsとeditor-ui.mjsの単写真・一括同意UI。Main:共有契約調整/docs/build/deploy。既存Trial/Sites認証条件は保持。

## 2026-10-09 ローカル保存済み影

mixed_canvas_gap: 新browser-local-saved-shadow-runtime.mjsのみ、実同DB原本/背景/履歴によるBW/AddShadow/OriginalShadow描画adapter。既存認証helperは変更しない。Main: 後続Session接続（旧メイク担当返却後）とdocs。

## 2026-10-09 旧メイク一括出力

mixed_shadow_gap: session.mjsのみ、写真ごとの保存済み旧メイク対象取得と一括出力への独立同意接続。mixed_inventory: editor-ui.mjsのみ、一括出力対象取得/写真別明示同意UI。Main: docsと統合/build/deploy。単写真同意の使い回し、非中立人物補正、AI、他host認証の迂回は禁止。

## 2026-10-09 個人Look RAWペア

mixed_canvas_gap: processing/astra-look-learning.mjsとlocal-personal-look-training-worker.mjsのformat契約拡張（既定nonraw互換）。mixed_inventory: local-personal-look-ui.mjsのRAWモード・逐次入力。mixed_shadow_gap: 新local-personal-look-raw-input.mjsのみ実原寸デコード検証。Main: backend/personal-look.ts、local-personal-look-contract.mjs、processing/personal-look-render.mjsとdocs/build/deploy。

## 2026-10-09 個人Look逐次学習

mixed_canvas_gap: processing/astra-look-learning.mjsの既存回帰核に逐次accumulator API追加とlocal-personal-look-training-worker.mjsの逐次プロトコル。mixed_inventory: local-personal-look-ui.mjsのみ、1〜200組の手動対応JPEG/PNG逐次転送と取消/進捗。Main: 統合/docs/build/deploy。RAWとAIサービスは追加しない。

## 2026-10-09 旧そばかす保存版の接続

mixed_shadow_gap: 新processing/manual-freckles-render.mjsのみ、既存核/実保存documentからsource描画するfacade。Main: worker/index/runtime/Session/同意UI文言中央接続。mixed_inventoryとmixed_canvas_gapは終了。新規顔推論・そばかす作成は含めない。

## 2026-10-09 手持ち深度データ（明示承認）

次段 mixed_shadow_gap: session.mjs exportBatchFinalメソッド内のみ、BrowserLocal手/衣服/非AI RAW NRの一括書出しを各asset実証runtimeで接続。Mainはそのメソッドを同時編集しない。

Main追加: export-batch-validation.mjsにBrowserLocalの実inventory確認を追加。認証許可値を生成せずクラウドassertPermissionとは別経路にする。Session importのみMain追加。

mixed_canvas_gap: 新backend/web-depth-range.tsとprocessing/web-depth-range.mjs。mixed_inventory: 新web-depth-range-ui.mjs。mixed_shadow_gap: 今回read-only終了。Main: 中央Session/policy/pure/editor/Batch/概要の接続、既存小不備、docs/build/deploy。写真原本SHAとupright source寸法に束縛した手持ち正規化深度JSONのみ、AI推論なし。

## 2026-10-09 承認済みローカル旧4メイク権限

Main追加: web-connected-version-comparison.mjsの同意epoch変更時の比較canvas破棄。取り消した後も過去比較画像を残さない。

ユーザー承認によりTrialとは別のlocal同意契約を新設。mixed_canvas_gap: 新local-saved-makeup-consent.mjsのみ。mixed_inventory: 新local-saved-makeup-consent-ui.mjsのみ。mixed_shadow_gap: 新browser-local-saved-makeup-runtime.mjsのみ。Main: Session/editor統合/docs/build/deploy。実保存済み手動領域のみ、Face推論/本番人物承認の代用にしない。

## 2026-10-09 非AI RAWノイズ除去

mixed_canvas_gap: 新backend/src/web-raw-denoise.ts、新processing/web-raw-denoise.mjsのみ。mixed_inventory: 新web-raw-denoise-ui.mjsのみ。mixed_shadow_gap: 新browser-local-raw-denoise-runtime.mjsのみ、実原本SHAからWorker描画を受けるhost。Main: Worker/index/Session/policy/pure/editor/概要/docs統合。既存linear16decoder/denoise核は変更しない。

## 2026-10-09 旧手・衣服の通常経路復元

mixed_shadow_gap: browser-local-hand-tone-history.mjsと新browser-local-manual-runtime.mjsのみ、実履歴内の同一専用documentを権威としたPreview/Final用準備。Main: Session復元/通常描画/Save/Final統合。mixed_canvas_gap: batch-edit.mjsの写真固有修復枝の一括コピー/上書き拒否のみ。テストなし。

## 2026-10-09 手塗り小領域修復

mixed_canvas_gap: 新backend/src/web-manual-spot.tsとprocessing/web-manual-spot.mjsのみ。mixed_inventory: 新web-manual-spot-ui.mjsのみ。Main: photo-policy/Session/pure/worker/editor/保存概要の中央接続と配備。既存repairRegion核は変更しない。共通契約webManualSpot、修復/参照domainの明示ブラシ、strength/iterations、原Proxy座標保存。

## 2026-10-09 残りレンズ・旧履歴接続

次段 mixed_shadow_gap: browser-local-hand-tone-history.mjs内の証拠検証を再利用しclothingSpot比較exportを追加。手の既存挙動は保持。MainのみSession比較の接続。復元や保存権限は変更しない。

mixed_shadow_gap追加: 新browser-local-hand-tone-history.mjsのみ実装、実BrowserLocalの保存版/原本証拠を検証し既存handTone比較runtimeを準備。Main Session比較だけ統合。復元/通常描画/既存認可契約の変更はまだ禁止。

Main追加: manual-clothing-spot-ui.mjsとoriginal-shadow-manual-trial-host.mjsの明示geometry列挙へlensGeometryを1項目ずつ伝搬。

mixed_canvas_gap: web-connected-lens processor、backend web-connected-lens validator、新lens-coordinate helper、既存lr-lens-correctionの共通座標算出/妥当性のみ。mixed_inventory: local-levels-brush-coordinate、local-brush-projected-overlayのレンズ座標合成のみ。mixed_shadow_gap: 旧専用保存版の比較/復元のread-only診断のみ、コード変更は別途担当割当後。Main: lens UI、Session/pure/Worker/中央統合、docs/build/deploy。互いの共有ファイルを無断編集しない。

## 2026-10-09 手動選別の表示連携

mixed_shadow_gap: web-manual-liquify-ui.mjsのみ追加、既存kernel/contractのscaleX/scaleY/restoreを操作選択肢へ露出。Main以外との同時編集なし。

mixed_inventory: web-connected-culling-ui.mjsのみ、保存済み評価/flagによる表示絞込と並替。選択/提案の自動変更禁止。Main: LUT表示説明/docs/統合。既存controller/storeは変更しない。

## 2026-10-09 局所LUT

mixed_canvas_gap: 新backend/src/local-lut-mask.ts、新processing/local-lut-mask.mjs。mixed_shadow_gap: 新web-local-lut-mask-ui.mjsのみ。mixed_inventory: 既存LUT/Preset変更経路のread-only調査、変更不要の報告のみ。Main: photo-policy/session/pure/worker/editor/保存概要/可搬bundle関連とdocs統合。試験なし、Mainのみbuild/deploy。

## 2026-10-09 手動形状変形・座標一体実装

Main追加: processing/index.mjs のencode入力から画面座標専用liquifyFieldを除外し、不要なWorker複製を防ぐ。

mixed_canvas_gap: 新backend/src/web-manual-liquify.ts、processing/web-manual-liquify.mjs、processing/web-manual-liquify-map.mjs。mixed_inventory: local-levels-brush-coordinate.mjs、editor-ui.mjsのブラシ座標/overlay、既存manual-*-ui.mjs/add-shadow-manual-ui.mjs/bw-edge-manual-ui.mjsとtrial-host/context経路の変位情報伝搬のみ、新overlay helper。mixed_shadow_gap: 新web-manual-liquify-ui.mjsのみ。Main: photo-policy/session/pure/worker/概要/docs/統合。担当間interfaceを先に揃える。折返しは拒否して旧編集保持、ブラシ無効化は不可。

## 2026-10-09 通常Web残り並列

次段: mixed_inventory はlocal-lut-store.mjsの検証済bytes読取追加、web-connected-portable-preset-ui.mjs、新local-lut-preset-transfer.mjs。Main専用Session.applyLocalLUTPresetによる単一Recipe commit。

次段: mixed_canvas_gap は新web-manual-background-ui.mjs、processing/web-manual-background.mjs、backend/src/web-manual-background.tsと既存delta66-scene-background.mjsのrefineSolidSceneだけ担当。既存blur核をtile再利用して全体平均は維持。Main中央webManualBackground。

Main追加: processing/lr-lens-correction.mjsは歪曲/色収差とも0のとき座標を整数x,yのまま使う精度修正のみ。

次段: mixed_shadow_gap はweb-connected-culling.mjs、web-connected-culling-ui.mjs、新web-local-culling-marks.mjsを所有。明示手動評価の端末保存のみ、提案の自動確定・原本削除なし。

次段: mixed_canvas_gap は新backend/src/web-manual-clothing.tsとprocessing/web-manual-clothing.mjs。mixed_inventory は新web-manual-clothing-ui.mjs。Main中央枝webManualClothing。既存clothing kernelは読取再利用のみ。

追加: mixed_inventory は preset-author/preset-author-contract.mjs、preset-policy.mjs、delta66-preset-catalog.mjs のpersonalLook可搬契約追加も所有。mixed_shadow_gap は新backend/src/web-connected-lens.ts、processing/web-connected-lens.mjs、web-connected-lens-ui.mjsを所有（周辺減光のみ）。Mainは中央契約へwebManualTeeth/webLensShadingを統合。

追加: mixed_canvas_gap は processing/manual-teeth-whitening.mjs の演算抽出のみ編集可。新backend/src/web-manual-teeth.ts、processing/web-manual-teeth*.mjs、web-manual-teeth-ui.mjsを担当。旧binding/provenance/8MP検証は保持。

mixed_canvas_gap: 人物残りの調査と新規web-manual-teeth系専用ファイル（既存権限を迂回しない）。mixed_inventory: Preset/Look持ち運びの調査、web-connected-portable-preset-ui.mjsと専用新規personal-look-portable系ファイル。mixed_shadow_gap: lens補正の調査と新規web-connected-lens系専用ファイル。中央session/pure/photo-policy/editor/既存共有contractはMainのみ、担当は必要変更を報告。対象はAI/テザー/Apple/HDR/大判以外、試験なし。追加既存ファイルの編集はMainへ相談して範囲記録後。

## 2026-10-09 手動白髪補正

mixed_canvas_gap: apps/backend/src/manual-hair.ts、apps/web/src/processing/manual-hair.mjsのみ。mixed_inventory: apps/web/src/web-connected-manual-hair-ui.mjsのみ。Main: saved-version-adjustment-summary.mjs、editor-ui.mjsのpanel名、docs、統合/build/配備。grayStrokes/blackenは両方存在か両方省略。

## 2026-10-09 手動髪なめらかさ

mixed_canvas_gap: apps/backend/src/manual-hair.ts、apps/web/src/processing/manual-hair.mjsのみ。mixed_inventory: apps/web/src/web-connected-manual-hair-ui.mjsのみ。Main: saved-version-adjustment-summary.mjs、editor-ui.mjsのパネル名、docs、統合/build/配備。optional smooth省略0、既存kernel再利用。

## 2026-10-09 手動クローン24MP

mixed_canvas_gap: processing/manual-clone.mjs、delta66-portrait-repair.mjs、region-repair-core.mjsのみ。mixed_inventory: web-connected-manual-clone-ui.mjsのみ。Main: docs/統合/build/配備。従来8MP契約を保持した専用24MP入口を共用する。

## 2026-10-09 マスク複製・有効切替

mixed_shadow_gap: backend/color-range-levels.ts、processing/color-range-levels.mjs。mixed_inventory: web-connected-color-range-levels-ui.mjs。Main: saved-version-adjustment-summary.mjs/docs/build/配備。v2layer optional enabled追加、旧省略true。

## 2026-10-09 複数マスクレイヤー

mixed_shadow_gap: backend/color-range-levels.ts、processing/color-range-levels.mjs。mixed_inventory: web-connected-color-range-levels-ui.mjs。Main: saved-version-adjustment-summary.mjs/docs/build/配備。v1互換のv2レイヤー契約を固定して並列作業。

## 2026-10-09 保存版の補正概要

mixed_canvas_gap: 新apps/web/src/saved-version-adjustment-summary.mjs（表示専用概要）。mixed_inventory: web-connected-versions-controller.mjs、web-connected-versions-ui.mjs。Main: web-connected-version-comparison.mjs/docs/build/配備。共通保存/復元/描画経路は既存対応済みのため重複追加しない。

## 2026-10-09 手動目補正

mixed_canvas_gap: 新apps/backend/src/manual-eyes.ts、apps/web/src/processing/manual-eyes.mjs。mixed_inventory: 新apps/web/src/web-connected-manual-eyes-ui.mjs。Main: 中央photo-policy/session/pure/worker/editorとdocs/build/配備。処理とUIを契約固定後に並列。

## 2026-10-09 手動髪補正・Look管理

mixed_canvas_gap: 新backend/manual-hair.ts、processing/manual-hair.mjs、web-connected-manual-hair-ui.mjs。mixed_inventory: local-personal-look-ui.mjs、local-personal-look-store.mjs（係数の複製/明示確認付き削除）。Main: photo-policy/session/pure/worker/editorとdocs/build/配備。既存核は再利用のみ。

## 2026-10-09 並列追加：赤目・局所色補正

mixed_canvas_gap: 新apps/backend/src/manual-red-eye.ts、新apps/web/src/processing/manual-red-eye.mjs、新apps/web/src/web-connected-manual-red-eye-ui.mjs。mixed_shadow_gap: apps/backend/src/color-range-levels.ts、apps/web/src/processing/color-range-levels.mjs、apps/web/src/web-connected-color-range-levels-ui.mjs。Main: 中央photo-policy.ts/session.mjs/processing/pure.mjs/worker.mjs/editor-ui.mjsおよびdocs/build/配備。既存処理核は読取/再利用のみ。

## 2026-10-09 次単位：個人Look複数ペア

mixed_inventory: apps/web/src/local-personal-look-ui.mjs、local-personal-look-training-worker.mjsのみ。Liteを明示対応1..4ペアへ接続。Main: docs/統合/build/配備。ほか2担当は次の人物/マスク候補を読取のみ。中央Recipe/既存学習核の変更なし。

## 2026-10-09 範囲別肌補正・マスク境界の並列所有

mixed_canvas_gap: backend/manual-skin.ts、processing/manual-skin.mjs、web-connected-manual-skin-ui.mjs（v2複数layer）。mixed_shadow_gap: backend/color-range-levels.ts、processing/color-range-levels.mjs、web-connected-color-range-levels-ui.mjs、新processing/mask-refinement-render.mjs（境界調整）。既存local-mask-brushとportrait refine核は読取/再利用のみ。Main: docs/中央接続が必要な場合とbuild/配備。試験なし。

## 2026-10-09 次単位の並列所有

mixed_canvas_gap: manual-skin.ts/processing/manual-skin.mjs/web-connected-manual-skin-ui.mjsのみ（肌仕上げ追加）。mixed_shadow_gap: color-range-levels.ts/processing/color-range-levels.mjs/web-connected-color-range-levels-ui.mjs、processing/delta66-portrait-masks.mjs、新processing/portrait-gradient-mask.mjs（グラデーション核の共通再利用）。mixed_inventory: local-personal-look-ui.mjs、local-personal-look-store.mjs、新local-personal-look-transfer.mjs（Look係数JSON退避/取込）。Main: docs/最終統合/build/配備。中央session/pure/editorは必要時Mainのみ。共有fileを他担当が変更しない。

## 人物補正優先の次段階・並列3担当

確定: mixed_canvas_gap=apps/backend/src/manual-skin.ts、apps/web/src/processing/manual-skin.mjs、apps/web/src/web-connected-manual-skin-ui.mjs。mixed_inventoryはprocessing/local-mask-brush.mjsの任意共有作業予算追加も所有。他担当は同module読取/再利用のみで変更しない。

mixed_shadow_gap: apps/backend/src/color-range-levels.ts、apps/web/src/processing/color-range-levels.mjs、apps/web/src/web-connected-color-range-levels-ui.mjs（brush合成）。mixed_canvas_gap: 新手動肌補正3fileのみ、契約はMainと確定後。mixed_inventory: manual-makeup-brush.ts、processing/manual-makeup-brush.mjs、web-connected-manual-makeup-ui.mjs（複数レイヤー、契約確定後）。Main: photo-policy.ts/session.mjs/processing/pure.mjs/worker.mjs/editor-ui.mjs、docs、build/配備。相互所有file変更不可。検査/実験なし。

## 優先分野の次単位

Main: processing/worker.mjsの描画順序provenance組立も所有。

mixed_canvas_gap: 新backend/manual-clone.ts、新processing/manual-clone.mjs、新web-connected-manual-clone-ui.mjsのみ。mixed_shadow_gap: backend/color-range-levels.ts、processing/color-range-levels.mjs、web-connected-color-range-levels-ui.mjsのみ。Main: 中央photo-policy/session/pure/editor、docs/build/配備。各担当中央ファイルへ書込禁止。読取調査済み。試験は実行しない。

## Web非AIの優先3分野と順次配備

Main: apps/sites/src/worker.mjsの公開静的Workerパス追加を所有。

3担当の完了後、Mainがmanual-makeup-brush.ts/color-range-levels.tsの型宣言修正を引き取る。担当からの追加編集なし。

Mainはapps/web/build.mjsとapps/sites/build-cloudflare.mjsも所有し、個人Look学習用module Workerのbundleと公開allowlistを追加する。週次使用済み50%で停止（開始時実測7%）。

実装排他: mixed_canvas_gap=新manual-makeup-brush.mjs処理/UI helperとweb-connected-manual-makeup-ui.mjs、新backend manual-makeup-brush.ts validator（strokes/color/opacity厳密）、既存blendMakeupChannel流用。mixed_shadow_gap=新processing/color-range-levels.mjs、web-connected-color-range-levels-ui.mjs、新backend color-range-levels.ts validator。mixed_inventory=新local-personal-look UI/store/worker/contract、backend personal-look.ts validator、processing/astra-look-learning.mjsの適用24MP対応。Main=photo-policy.ts import/検証、session.mjs setter、processing/pure.mjs呼出、editor-ui.mjs mount、docs/build/配備。全員中央4fileへ編集しない。

ユーザー優先順: 人物/メイク補正・マスク・個人Lookを先行、その後残りのWeb非AI分野。AI/Apple/テザー除外。最初の分担はmixed_canvas_gap=人物/メイク既存処理と接続箇所の読取、mixed_shadow_gap=範囲mask既存処理と接続箇所の読取、mixed_inventory=個人Look既存処理と接続箇所の読取。各担当の書込ファイルはMainが別途確定するまで読取のみ。Main=docs/最終統合/配備。完了単位で既存ブラウザ内保存プレビューにbuild/配備、機能実験は追加しない。

## 一回配備のビルド阻害修正

Main: processing/raw.mjs・faces.mjs・新sha256.mjsの共通hash import分離。WorkerのPreset検証から不要なLibRaw importへ辿る依存だけ切断。AI動作や設定は変更しない。

Mainにapps/web/build.mjsを追加。既存Workerと同じNode専用module分岐のexternal指定をbrowser ESM bundleへ揃える。

Main: apps/backend/src/delta66-preset-sharing.tsのfail型宣言、photo-policy.tsのpath要素型絞込み、docsと既存生成物build/Cloudflare配備。挙動・認可制約は変更しない。他担当はこの2ファイルへ書かない。

## 再開後の並列：Node/Trial保存履歴

mixed_inventory: apps/backend/src/repository.ts、apps/backend/src/server.ts、apps/web/src/api-client.mjsのみ。既存全revision保存を認可付き履歴GETへ接続し既存UIのcapabilityを有効化。mixed_canvas_gapはsession.mjsとrestore-original-shadow-runtime.mjsを継続、Mainはdocs/versions UI。相互ファイルは編集しない。試験/build/配備なし。

## 次のWeb接続：原寸Canvas表示と保存版復元

mixed_shadow_gapの追加所有: processing/canvas-expand-projection.mjs。正規化余白の共通検証を維持して幾何計画専用projectionを分離、既存actual projectionの容量チェックは残す。

同担当にmanual-canvas-expand-edge-drag.mjsも追加。表示だけでなく原寸metadataを使った余白ドラッグ/キーボード操作も幾何計画へ接続。実Preview側の容量制限は維持。

mixed_shadow_gap: editor-ui.mjs、processing/canvas-expand.mjs、新規Canvas寸法専用helperのみ。寸法計画と実画素確保の制限を分離し大型sourceの表示を接続。mixed_canvas_gap: session.mjsと新規保存版復元専用helperのみ。既存保存履歴/認可を使いOriginalShadowを含む復元の未接続を実装。新API/DB追加・権限迂回・HEADへの歴史版偽装なし。mixed_inventory: 両機能の既存契約読取と必要なUI残差分報告のみ。Main: docs、web-connected-versions-ui.mjsとcontrollerの必要差分（session担当と連絡後）。検査/build/配備なし。

## RAW原寸取得拡張と縮小読込のコード作成

追加排他: mixed_shadow_gapはsaved-version-special-runtime.mjsとadd-shadow-backdrop-gate.mjsのみ、大型RAWのProxy decode/取得原寸照合/metadata保持を編集する。Mainがpure.makeProxyPixelsを原寸比率基準の共通寸法へ整合。MainはOriginalShadow専用original-shadow-editor-bridge.mjs/session.mjsのProxy寸法伝播も担当。Finalの実寸照合は維持。

mixed_inventory: 新規 vendor/libraw-suite/ 配下のC++拡張・再現可能な組込手順/スクリプトのみ。mixed_canvas_gap: processing/raw.mjs、raw-decode-capability.mjs、新規processing/raw-native-bridge.mjsのみ。mixed_shadow_gap: source寸法制限の読取一覧（製品編集なし）。Main: processing/pure.mjs、共有source寸法契約と必要なsource-only呼出側、docs。実画素24MPと特殊mask8MPの上限は保持。96MPまでのsource metadataと縮小RAWの契約を分離。新WASMの実在API検出が通らない限り旧decoderの大型RAWを許可しない。検査・build・配備なし。

## 大型RAWの縮小デコード設計・実装

mixed_shadow_gap: editor-ui.mjsの縮小RAW説明とlocal-levels-brush-coordinate.mjsのsource寸法検証。canvasが確定した原寸上限契約だけを参照し、実buffer上限は変更しない。Final対応と誤表示しない。

mixed_canvas_gap: processing/raw.mjs、pure.mjs、および新規RAW寸法/予算契約helper。mixed_inventory: wrapperと原寸契約の読取調査。Main: docs。既存half-size APIと確認可能な原寸情報を使用し、対応可能な原本だけProxy decodeを許可。Finalは既存制限を維持、推測原寸やthumbnail代用は禁止。試験/build/配備なし。

## 原寸情報と影Proxy処理の上限分離

mixed_shadow_gapの確定5ファイル: apps/web/src/add-shadow-manual-ui.mjs、original-shadow-manual-ui.mjs、original-shadow-manual-trial-host.mjs、bw-edge-manual-session-gate.mjs、add-shadow-backdrop-gate.mjs。bindingの原寸情報のみ変更、verifiedFrame/targetFrameの実buffer8MPは保持。

mixed_canvas_gap: saved-version-special-runtime.mjs、processing/bw-edge-manual-contract.mjs、processing/add-shadow-manual-contract.mjs、processing/add-shadow-runtime.mjs、processing/add-shadow-geometry.mjs、original-shadow-manual-recipe.mjs、processing/index.mjs、processing/worker.mjs。mixed_inventory: backend photo-policy.ts内の対応3契約。mixed_shadow_gap: 関連UI/trial host/session gate/backdrop gateのsource寸法のみ（編集前に正確なパスを共有、上記担当ファイルは除外）。Main: docs。現decode可能範囲24MPまでの原寸情報と8MP実処理bufferを分離、Proxy1600で処理。24MP超decodeや大判Final対応を完了としない。試験/build/配備なし。

## W20 保存版比較の原本・影対応

mixed_canvas_gap: session.mjs比較経路と新規saved-version-special-runtime.mjs/必要な専用helper。mixed_inventory: 既存認可/原本/履歴契約の読取。Main: 比較UI/docs。原本取得を許容して保存版ごとの白黒縁・影処理を接続、現編集不変。試験/build/配備なし。

並列の別作業: mixed_shadow_gapはlocal-preset-library-ui.mjsのみでグループ改名/削除を既存分類核へ接続。Preset本体は削除しない。Session担当とはファイルを分離する。

## W20 保存版比較の既存専用描画連携

mixed_canvas_gap: session.mjsのrenderSavedRecipeComparisonと必要な局所helper。mixed_inventory: 専用runtime契約の読取。Main: docs。現編集を変えず原本の再取得を増やさない範囲で白黒縁等の既存処理を再利用。未対応を省略しない。試験/buildなし。

## W20 可搬SUITE設定の受渡し

mixed_canvas_gap: 新規web-connected-portable-preset-ui.mjsのみ。Main: editor mount/docs。既存encode/decode核とsession.applyPortablePresetを使用。分類担当とは別ファイル。試験/buildなし。

## W20 ローカルPreset分類

mixed_shadow_gap: author-ui.mjsのmountPresetLibraryと新規分類store/UI。mixed_inventory: 読取契約調査。Main: docs。既存delta66分類核を再利用し、ブラウザ限定の明示分類と絞込みを追加。既存適用経路・認証は維持。試験/build/配備なし。

## W03 ローカル書き出し設定の再利用

mixed_shadow_gap: editor-ui.mjsおよび必要な新規ローカル書き出し設定UI/store。既存設定検証とFinal経路を再利用、Workspace認証を迂回しない。mixed_inventory: 既存契約の読取調査。Main: docs。試験/build/配備なし。

## W20 保存版の画像比較

mixed_canvas_gap: session.mjs。mixed_shadow_gap: 新規web-connected-version-comparison.mjs。Main: editor/docs。現在編集不変で保存版2件を認可再取得/Proxy描画、専用canvas表示。特殊runtime非対応は明示拒否、黙って省略しない。試験/buildなし。

## W20 保存版を編集へ復元

mixed_canvas_gap: session.mjs。mixed_inventory: web-connected-versions-controller.mjs。mixed_shadow_gap: web-connected-versions-ui.mjs。Main: editor/docs。過去版を再認可/再取得して現在の未保存編集へ単一Undoで復元。原本/履歴の上書き禁止、最新revision維持。試験/buildなし。

## W20 保存済み履歴の取得

mixed_inventory: sites/src/worker.mjs（実パスを確認）の履歴read routeのみ。mixed_canvas_gap: api-client.mjs/sites-client.mjs/browser-local-api.mjsの履歴read method。mixed_shadow_gap: web-connected-versions-controller.mjs/UIの履歴対応。Main: editor/docs。getRecipeHistory(assetId)→非branchの{revision,body}行列、認証/Asset所有/保存binding維持。過去版を最新と偽らない。試験/buildなし。

## W20 XMP対応色設定の取込

mixed_canvas_gap: session.mjs。mixed_shadow_gap: 新規web-connected-xmp-ui.mjs。mixed_inventory: 既存XMP/Recipe対応の読取確認。Main: editor/docs。既存readLookXMPSubsetから8色設定だけ既存SUITE controlsへ変換、明示確認して単一commit。未対応を黙って無視しない。検査/buildなし。

## W02 独立服・手の座標伝搬

mixed_inventory: manual-clothing-spot-trial-host.mjs / manual-clothing-spot-ui.mjs。mixed_shadow_gap: manual-hand-tone-trial-host.mjs。Main: docs統合。sceneGeometryとtop-level原寸を共通座標関数へ渡す。独立処理をFinal接続済みとは数えない。試験/buildなし。週次残り32％、30％停止。

## W02 自由Crop

mixed_canvas_gap: session.mjs。mixed_shadow_gap: 新規web-connected-free-crop-ui.mjs。mixed_inventory: 既存Crop契約読取のみ。Main: editor/docs。既存free Crop契約再利用、数値矩形UI、試験/buildなし。

## W02 ガイド補正

mixed_canvas_gap: scene-geometry-contract.mjs。mixed_inventory: photo-policy.ts。mixed_shadow_gap: web-connected-geometry-ui.mjs。Main: docs/統合読取。sceneGeometryのguided分岐にsourcePoints/destinationPoints各4点を保存。既存session/pure/brush共通行列経路を使う。試験/buildなし。

## W02 手動幾何の接続

追補: mixed_inventoryはoriginal-shadow-editor-bridge.mjs / original-shadow-manual-trial-host.mjsのsceneGeometryと原寸座標伝搬を担当。

mixed_canvas_gap: session.mjs/processing/pure.mjs/processing/worker.mjs。mixed_shadow_gap: 新規web-connected-geometry-ui.mjs。mixed_inventory: 他UIの座標抜け読取調査のみ。Main: editor-ui.mjs/docs。保存mask後rotation/crop前に同寸法warp、原寸aspect固定。既存Crop内へUIを置き共通brush geometryへ設定と原寸を渡す。試験/buildなし。

## W02 手動幾何の共通基盤

mixed_canvas_gap: delta66-scene-geometry.mjsと新規scene-geometry-contract.mjs。mixed_inventory: photo-policy.ts。mixed_shadow_gap: local-levels-brush-coordinate.mjs。Main: docs（次段でsession/pure/editor統合）。最初はmanualのみ。座標と容量が揃うまでUI有効化しない。試験/buildなし。

## W01 一括参照色合わせ

mixed_inventory: 新規batch-scene-match.mjs。mixed_canvas_gap: session.mjs。mixed_shadow_gap: web-connected-color-match-ui.mjs。Main: editor/docs。既存認証/CAS保存方式に合わせ、準備済みProxyのある2..20写真に個別変換を推定して保存。欠損Original取得なし、部分成功を明示。試験/buildなし。

## W01 色合わせの推定領域指定

mixed_canvas_gap: session.mjsのみ、proposeSceneMatchのsourceRegion/referenceRegion正規化矩形を既存統計maskへ変換。mixed_shadow_gap: web-connected-color-match-ui.mjsのみ矩形数値指定。mixed_inventory: Batch既存経路調査のみ。Main: docs。領域は推定用、適用は全体の固定変換であり局所適用ではない。試験/buildなし。

## W01 参照色合わせ

mixed_canvas_gap: delta66-scene-color.mjs/session.mjs/pure.mjs。mixed_inventory: photo-policy.ts/preset-author-contract.mjs。mixed_shadow_gap: 新規web-connected-color-match-ui.mjs。Main: editor/docs。color.sceneMatch={scale:[3値0.5..2],offset:[3値-2..1],amount:0..1}。参照画像から推定した固定変換を保存、参照画像はアップロードしない。試験/buildなし。

## W01 ローカルLUT

追補: mixed_shadow_gapはweb-connected-profile-ui.mjsのlocal-lut選択中案内も担当。既存標準/白黒UIで不正保存と混同しない。

mixed_inventory: 新規local-lut-store.mjs、photo-policy.ts、preset-author-contract.mjs。mixed_canvas_gap: session.mjs、processing/pure.mjsとprocessing worker/client（必要箇所のみ）。mixed_shadow_gap: 新規web-connected-lut-ui.mjs。Main: editor-ui.mjs/docs。参照契約profile={kind:'local-lut',intensity,lutRef:{sha256,byteLength}}。取得時IndexedDB保存、参照だけRecipeへ保存。試験/buildなし。

## W01 輝度カーブ

mixed_canvas_gap: session.mjs / processing/pure.mjs。mixed_inventory: photo-policy.ts / preset-author-contract.mjs。mixed_shadow_gap: 新規web-connected-luma-curve-ui.mjs。Main: editor-ui.mjs/docs。color.lumaCurveは2..16点のx/y整数0..255、x昇順、端点x=0/255。既存核再利用。試験/buildなし。

## W01 WB自動・灰色点の固定結果保存

mixed_canvas_gap: session.mjs / processing/pure.mjs。mixed_inventory: photo-policy.ts / preset-author-contract.mjs。mixed_shadow_gap: 新規web-connected-white-balance-ui.mjs。Main: editor-ui.mjsとdocs。原本Proxyで推定し固定gainを保存、Finalで再推定しない。既存gain範囲0.25..4維持。試験/buildなし。

## W01を閉じる：ポイントカラー採色・範囲表示

mixed_canvas_gapはsession.mjsのポイントカラー採色/範囲preview APIのみ。mixed_shadow_gapはweb-connected-point-color-ui.mjsの採色/範囲表示追加のみ。Mainはeditor-uiへのafterImage引渡し/docs統合。保存は既存setPointColor。可視化は専用canvasでFinalに混入させない。試験なし。

## 続行：JPEG品質の共通書き出し設定

mixed_canvas_gapはeditor-ui.mjsのみ、単写真手動・toolbar・Batchの共通JPEG品質1..100入力、保存設定矛盾拒否、既存成果破棄とbusy制御を担当。命名担当は返却済み。Mainは担当中editor-ui.mjsを編集しない。検査/buildなし。

## 続行：単写真Exportの件数・連番命名

mixed_inventoryはeditor-ui.mjsの単写真Export命名分岐・入力表示・必須検証のみ所有。custom-count/custom-sequenceをsequence=1,total=1で既存命名核へ接続。Mainはこの担当中editor-ui.mjsを編集しない。既存方式・認可・Preset名契約は維持。検査/buildなし。

## 続行：WB照明プリセット

追補：mixed_canvas_gapはpreset-author-contract.mjsのilluminant可搬化1枝も担当する。

mixed_canvas_gapはphoto-policy.tsのcolor.illuminant検証のみ。mixed_shadow_gapはweb-connected-illuminant-ui.mjsのみ。Mainはsession/pure/editor/docs。既存estimateWhiteBalance/applyWhiteBalance、固定6照明のみ。auto/selector/RAWは別。

## 続行：原本サーバー保存記録

mixed_inventoryは新規web-connected-cloud-status-ui.mjsのみ。既存api.listAssetsを認証済みSites限定で読取り。Mainはeditor/docs。容量契約/CloudSafe新判定/同期を追加しない。

## 続行：色設定のPreset可搬化

mixed_canvas_gapはpreset-author/preset-author-contract.mjsの新color5枝のみ。grading/pointColor/tonalBands/profile/sceneBasicの厳格検証とコピー。Mainは関連呼出し読取り/docs。写真固有ID/mask等は可搬にしない。

## 続行：公開Preset検索

mixed_inventoryはauthor-ui.mjsのmountPresetLibrary検索接続のみ。既存適用/認可維持、metadata未接続分類は偽装しない。Mainはdocsと次接続調査。検査/buildなし。

## 続行：画像上カーブ

mixed_canvas_gapはsession.mjsのsampleCurveAt/applySampledCurveのみ。mixed_shadow_gapはweb-connected-image-curve-ui.mjsのみ。Mainはeditor/docs。HSL担当は返却済み。画像上モード同時有効はMainで排他にする。

## 続行：HSL画像採色

mixed_canvas_gapはsession.mjsのHSL採色/適用メソッドと必要importのみ。mixed_shadow_gapはweb-connected-hsl-picker-ui.mjsのみ。Mainはeditor-ui/docs統合。新Recipe契約なし、既存8色HSL再利用。

## 続行：Brightness/Dehaze

mixed_canvas_gapはphoto-policy.tsのcolor.sceneBasic検証のみ。mixed_shadow_gapはweb-connected-scene-basic-ui.mjsのみ。Mainはsession/pure/editor/docs。既存delta66-scene-color再利用。Profile担当は返却済み。

## 次段：標準・白黒Profile

mixed_canvas_gapはphoto-policy.tsのcolor.profile検証のみ。mixed_shadow_gapはweb-connected-profile-ui.mjsのみ。mixed_inventoryは次の軽い未接続差分の読取り調査のみ。Mainはsession/pure/editor/docs。LUT登録は今回含めない。

## 続行：4帯域UI統合

point-color-renderは返却済み。mixed_shadow_gapはweb-connected-tonal-bands-ui.mjsへ戻り担当。Mainはsession/editorの4帯域適用接続、ポイントカラー上限説明と進捗記録。validatorは返却済み。

## 優先追加：画像上限整合

ユーザーの制限調整指示。mixed_shadow_gapは新規processing/point-color-render.mjsのみ（4帯域UIは未着手で保留）。既存8MP核を行分割して共通24MP rendererと整合。Mainはpure呼出し、point-color UI説明、docs。mixed_canvas_gapは進行中4帯域validatorのみ返却。

## 次段：4帯域カーブ

mixed_canvas_gapはphoto-policy.tsのcolor.tonalBands検証のみ。mixed_shadow_gapは新規web-connected-tonal-bands-ui.mjsのみ。Mainはsession/pure/editorとdocs。既存delta66-color-curvesのtonalBandsを再利用。旧3帯域toneCurveとの同時非ゼロ適用は拒否する。

## 次段：Webポイントカラー

mixed_canvas_gapはbackend/photo-policy.tsのcolor.pointColor検証のみ。mixed_shadow_gapは新規web-connected-point-color-ui.mjsのみ。Mainはsession.mjs/pure.mjs/editor-ui.mjsとdocs。既存lr-point-color処理を再利用。検査/buildなし。

## 2026-10-08 次段：カラーグレーディング

mixed_canvas_gapはbackend/photo-policy.tsのpostDecodeAdjustments.color.grading検証のみ。mixed_shadow_gapは新規web-connected-grading-ui.mjsのみ。Mainはprocessing/pure.mjsの既存lr-color-grading呼出し、session.mjsの設定保存、editor-ui.mjsのmountとdocs。色gradingは既存曲線後/Glow前、旧Recipe影響なし。試験/build/配備なし。

## 2026-10-08 Web接続・並列続行

ユーザーがサイドエージェント並列と続行を指示。簡単な差分を優先。Mainはsession.mjs/editor-ui.mjs/docs統合。
- mixed_canvas_gap：新規web-connected-auto-light.mjsのみ。既存lr-auto-lightからEditor既存調整値への一括提案patchを作成、sessionへの実接続APIをMainに提示。
- mixed_shadow_gap：新規web-connected-versions*.mjsのみ。既存保存履歴を使う名前付き版controller/UI。実APIの不足は明示、原本/履歴削除なし。Mainがmount。
- mixed_inventory：新規web-connected-culling*.mjsのみ。既存astra-culling-analysisを使う非顔・モデル不要の品質/類似選別controller/UI。既存Asset/Proxy入口を調査、Mainへmount契約提示。顔推論を捏造しない。
全担当、検査・build・実験・配備なし。既存共有ファイルは読取りのみ。

## 2026-10-08 Web25項目の実装開始

最新順序変更：ユーザー「簡単な分から順に」。上記段階の大きい契約拡張は開始せず、まずW03出力シャープ接続。Mainはsession.mjsとdocs、mixed_shadow_gapはexport-output-adjustments-ui.mjsのみScreen/Print選択を追補。他担当は読取り・待機。名前付き版/生成hostはまだ開始しない。

ユーザー「25項目処理しよう」。今回Web接続を許可、検査/build/配備なし。Mainはsession.mjs、editor-ui.mjs、docsを所有し各担当の契約を接続する。
- mixed_canvas_gap: C01/C02の決定的調整接続。backend/photo-policy.ts、processing/pure.mjs/index.mjs/worker.mjs、新規web-connection-*処理/契約ファイルのみ。まずLR Point Color/Grading等の既存核を通常Recipe→Preview/Finalへ。session/UIはMainへ契約連絡。
- mixed_shadow_gap: W20名前付き版。新規web-connected-versions*.mjsのみ、既存ローカルAPI/保存済Recipe版を再利用した実UI/controllerを作成。session/editorへの登録はMain。server/schemaは変更しない。
- mixed_inventory: C03/W10-W12等の生成候補接続。新規web-connected-candidates*.mjsのみ。既存生成核とAsset保存APIを調査し、実保存・比較採用可能な範囲のhost/controllerを作成。モデルは捏造せず依存待ち。session/UIはMainへ契約連絡。

## 2026-10-08 Web接続項目の確定（実装前）

ユーザー指示により、まず44件・差分65件・Lightroom14件の重複を整理し、Web接続単位・難度・依存を確定する。Mainはdocs/WEB_CONNECTION_PLAN.md、HANDOFF.md、OWNERSHIP.mdのみ編集。mixed_canvas_gapは44件、mixed_inventoryは65件、mixed_shadow_gapはLR14とWeb経路の読取り診断。製品コード変更、テスト、build、配備なし。

## 2026-10-08 メーカー固有テザーの続行

Mainはdocs/TETHER_CODE_HANDOFF.md、HANDOFF.md、OWNERSHIP.md、CHANGE_NOTICE.mdの状況更新を所有。3担当は公式SDK/APIの読取り調査のみ。正式仕様未取得のopcode、認証、payloadを推測実装しない。SDK契約同意・申請・機器操作・検査・build・UI接続なし。先の共通6作業はコード返却済み。

## 2026-10-08 テザーコード先行

続行追補: mixed_shadow_gapはPhotoPipeline.swiftの既存原本からProxyを生成する独立入口追加のみ排他、TetherIngestStore.swiftコメント境界更新可。mixed_inventoryは新規apps/apple/Suite/Services/TetherLookQueueStore.swiftのみJSON queue原子的永続化担当。Mainはdocsのみ。既存UIへは登録しない。

ユーザー「開始」。検査/実験/build/機器実操作/UI接続なし。STAGED PARALLEL: 実カメラtransport、受信保管、Session Look処理を分離して並列。接続は後段。
- mixed_canvas_gap: 新規apps/apple/Suite/Services/TetherImageCapture.swiftのみ。Apple公開ImageCaptureCoreによるdevice/session/capture/file downloadの実処理。メーカーSDKを捏造せず、機種Supportedを名乗らない。
- mixed_shadow_gap: 新規apps/apple/Suite/Services/TetherIngestStore.swiftのみ。ローカルファイル受信→SHA/不変原本保管/永続queue/重複/復帰処理。既存PhotoPipelineは読取り再利用、変更なし。
- mixed_inventory: 新規packages/SuiteCore/Sources/SuiteCore/TetherLookQueue.swiftのみ。既存SessionLookとbindingを使う到着時Look固定/処理順/再試行/状態永続化code。画像解析を偽装しない。
- Main: 新規packages/SuiteCore/Sources/SuiteCore/TetherCapabilityMatrix.swiftとdocs/TETHER_CODE_HANDOFF.md、既存HANDOFF/OWNERSHIP/CHANGE_NOTICE。対応基準と依存整理。Xcode project/既存UI/Recipeは触らない。

## 2026-10-08 Lightroom比較14件 コード作成

返却：3担当とMainの新規8ファイルを書き終え、排他返却。下表対応範囲14件分が揃った。詳細LIGHTROOM_14_CODE_HANDOFF.md。検査/実験/build/接続なし。RAWは線形RGB16、CFA AIは未実装。モデル/校正/深度入力依存は別記。

返却後追加: mixed_canvas_gapは新規processing/lr-raw-denoise.mjsのみ、実RAWノイズ除去の不足を担当。公開LibRaw APIのgetRawImageはcopyであり書戻し可能と仮定しない。必要なデコーダー境界を報告する。mixed_shadow_gapは新規apps/backend/src/lr-named-versions.tsのみ名前付き版の端末間同期serviceを担当、既存HTTP/DB実行なし。

Main追加排他: 新規processing/lr-lens-correction.mjs。LR11/EV3-0535共通の実profile選択・逆写像・光学周辺減光・倍率色収差と有効Crop。RAW AI除去LR10は既存通常NRだけで完了にしない。

ユーザー採用14件から開始。レンズぼかしLR-12は除外。テザーは必須だが別作業。検査/実験/build/画面接続なし。
- mixed_canvas_gap: 新規processing/lr-auto-light.mjs、lr-color-grading.mjs。自動Light提案と共通Grading不足のみ。
- mixed_inventory: 新規processing/lr-point-color.mjs、lr-range-masks.mjs。Point Colorと色/深度range共通処理。深度推論は既存モデル契約を使い資産を捏造しない。
- mixed_shadow_gap: 新規apps/web/src/lr-named-versions.mjs。既存Recipe版を参照する名前付きversion CRUD/比較/保存。必要なら同prefixの独立Backendコードは提案後に記録。
- Main: docs/LIGHTROOM_14_CODE_HANDOFF.md、HANDOFF/CHANGE_NOTICE/OWNERSHIPと共通側の不足整理。既存UI/Recipe/認証は変更しない。

## 2026-10-08 残7件の明示続行

終了判断：ユーザー承認により.lrcat/Collection移行は今回対象外。65件コード作成完了で区切り、現在の追加実装担当なし。下記の採否確認待ちは解消済み。

返却：3担当とMainの今回独立module作成は終了。大判/SQL共有/XMP/queueのコードを返却。検査/接続は未実施。EV3-0716他社カタログ移行の採否のみユーザー確認待ち。下記は今回の編集履歴。

mixed_shadow_gap追加排他: 新規apps/backend/src/delta66-preset-sharing.tsのみ。既存WorkspaceService認可を使う独立metadata/share永続化サービス。既存schema/routesの編集ではなく新サービス内の明示初期化のみ、呼出し接続/DB実操作はしない。

ユーザー「残りも終わらせよう」。mixed_inventoryは新規apps/apple/Suite/Services/Delta66LargePrint.swiftのみ、大判のImageIO/CoreImage領域描画とdisk strip/TIFF出力を所有。mixed_canvas_gapは新規apps/web/src/delta66-xmp-settings.mjsのみ公開XMP設定subsetの実読込/変換を所有。mixed_shadow_gapは前記共有/プリセットの新規delta66-workflow-*追補を継続。Mainはdocsと独立出力queue実行器delta66-delivery-runner.mjs。既存画面への接続、検査/実験/buildなし。他社private互換を捏造しない。

## 2026-10-08 差分66件・続行の最新排他

残コード追補（製品接続なし）: mixed_inventoryは新規apps/apple/Suite/Services/Delta66ExportDestinations.swiftのみを所有し、現行Appleサービスを読取り再利用してPhotos/Files/明示provider宛保存処理を書く。mixed_canvas_gapはdelta66-preset-cube.mjsとprocessing/delta66-color-profile.mjsのみ1D/複合CUBE追補を所有（workflow担当は両者編集しない）。mixed_shadow_gapは新規delta66-workflow-*.mjsで既存のサーバ共有/metadata契約を読取り再利用できる不足だけを継続、schema/routeは変えない。

TIFF writer日時追補のみmixed_shadow_gapへ排他引継ぎ: apps/web/src/delta66-tiff-stream.mjs。Mainの8/16bit・PackBits実装は提出済みで凍結し、担当返却までMainは編集しない。既存delivery date evidenceを利用してTIFF本体に撮影/出力日時を書く。新規型や共有APIの変更はCHANGE_NOTICEへ先記録済。

Mainは先のユーザー依頼「原本とProxyのサイズ上限分離」に対応し、processing/face-feature-adapter.mjs と makeup-highlight-landmark-mask.mjs のsource metadata制限だけを排他修正する。8MP実buffer上限・認可・人物ID・座標照合は維持。他担当は両ファイル読取りのみ。

ユーザー「一気に書いちゃって」によりコード作成を続行。検査・実験・build・接続・配備なし。コスプレ、資料不足22件、独立5件は対象外。既存共有実装は読取り再利用し、薄いwrapperや未提供モデルを完成扱いしない。
- mixed_inventory: 顔・人体・髪・肌・マスク・修復の差分。新規 processing/delta66-portrait-*.mjs のみ。
- mixed_canvas_gap: 背景・空・除去・relight・幾何・残色調整の差分。新規 processing/delta66-scene-*.mjs のみ。portrait担当との境界は人物変形がportrait、全画像crop/perspectiveがscene。
- mixed_shadow_gap: Export/Import/Cloud Space/Desktop presetsと初回presetの書残し。新規 apps/web/src/delta66-workflow-*.mjs と自身のdelta66-preset-*.mjsのみ。クラウド実操作なし。
- Main: 台帳・排他・共有設計。既存Recipe/UI/モデル契約は変更しない。
- Main追加排他: 新規 apps/web/src/delta66-tiff-stream.mjs。真の8/16bit sample入力を受ける非圧縮TIFF strip writer。workflow担当と合意済み。他担当は読取りのみ。

## 2026-10-05 利用枠停止（現行割当より優先）

週次残量14％で停止条件に到達。heartbeat `suite` はPAUSED。A Eyeshadow Trial host、B Nose限定純粋核、C Face Decorations実Asset保存Gateは安全区切りで排他返却済み。下の最新割当は完了した履歴であり、現在の編集担当はいない。追加指示と利用枠再確認まで新規実装/試験/実Chrome/公開配備をしない。厳密0/44。

## 2026-10-04 現行の排他割当（この節を最優先）

独立機能を一件ずつ製品経路まで接続して検証する。Cloudflare配備と重複統合は対象外。旧割当は完了済みとして、この節で明記したファイルだけを編集する。

現在の最新割当（以下の旧履歴より優先）:
- 2026-10-05 C Face Decorations実登録Asset直接保存Gate: Cはtyped Recipe/Preset写真固有拒否新6/6・メイン独立6/6・buildを返却。次は`apps/backend/src/workspace.ts` Node直接saveRecipe Face Decorations限定節、`repository.ts` Trial直接saveRecipe限定節、新規JWT/Trial HTTP SQLite試験だけを排他。実actor/tenant登録非trash Asset/SHA/edit/版CAS/履歴読戻しを照合。人物/顔位置/真正原寸/Worker/Final別、B Nose純粋/A Eyeshadow host/メインdocs別、0/44。
- 2026-10-05 B Nose本人明示水平変位の限定純粋核: BはEV3-0185差分監査新5/5・メイン独立関連10/10を返却。次は新規`apps/web/src/processing/manual-nose-horizontal.mjs`と新規専用試験のみ排他。小ROIのSUITE独自水平変位、Asset/SHA/person/版/原寸/target/容量/Abort、対象外/alpha/透明hidden RGB/入力不変を確認。caller自称ROI/本人は認証でない。公式6操作/Recipe/UI/Worker/Final別、A Eyeshadow host/C Face Decorations Backend/メインdocs別、0/44。
- 2026-10-05 A Eyeshadow Trial本人保存host: Aは限定Worker/facade新6/6・メイン独立関連19/19・buildを返却。次は新規`apps/web/src/manual-eyeshadow-trial-host.mjs`と新規実Trial HTTP/SQLite専用試験のみ排他。fresh本人/tenant/登録Asset/SHA/edit/版、Original digest/host内Worker LibRaw decode原寸/CAS/readback。通常Trial privacy・非RAWは成功としない。B Nose監査/C Face Decorations Backend/メインdocs別、0/44。
- 2026-10-05 B EV3-0185 Nose差分監査: BはHead Pose差分監査新5/5・メイン独立関連9/9を返却。次は新規`docs/NOSE_RESHAPE_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他。公式一次資料の下位操作/端末差と現顔/Recipe/UI/Final/Presetを意味で照合し最小安全実装単位を提案。製品/Backend/Cloud読取り、A Eyeshadow Worker/C Face Decorations Backend/メインdocs別、0/44。
- 2026-10-05 C Face Decorations写真固有typed Recipe/Preset隔離: CはSUITE限定そばかす純粋核新6/6・メイン独立関連10/10・buildを返却。次は`apps/backend/src/photo-policy.ts` optional `faceDecorationsManual`限定節、`workspace.ts`写真固有Preset拒否限定節と新規Backend/JWT SQLite試験だけを排他。Asset/SHA/person/原寸・1〜64正規化点/半径/色/opacityを厳格保存し偽alias/公式style/権限自称/bitmapを拒否。実Asset保存Gate/Worker/Final別、A Eyeshadow Worker/B Head Pose監査/メインdocs別、0/44。
- 2026-10-05 A Eyeshadow限定Worker/facade: Aは実Asset直接保存Gate新3/3・メイン独立関連10/10・buildを返却。次は`apps/web/src/processing/worker.mjs`/`index.mjs` Eyeshadow新operation限定節と新規専用試験のみ排他。typed三役stroke→mask→実RGBA、Asset/SHA/person/眼/版/寸法/target/Abort、通常render未認証文書明示拒否。人物privacy/真正Original/製品Session/UI/Final/Cloud別、B Head Pose監査/C Face Decorations純粋/メインdocs別、0/44。
- 2026-10-05 B EV3-0145 Head Pose差分監査: BはEyeliner Trial host新6/6・メイン独立6/6・buildを返却。現Trial privacy reviewで正の保存到達不可。次は新規`docs/HEAD_POSE_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他。公式一次資料の下位操作/端末差とSUITE顔/Rotate/Crop/Recipe/UI/Final/Presetを意味で照合し最小安全実装単位を提案。製品/Backend/Cloud読取り、A Eyeshadow Backend/C Face Decorations純粋/メインdocs別、0/44。
- 2026-10-05 C Face Decorations手動そばかす限定純粋核: CはEV3-0037差分監査新4/4・メイン独立4/4を返却。次は新規`apps/web/src/processing/manual-face-decoration-freckles.mjs`と新規専用試験のみ排他。本人明示少数点のSUITE独自RGBA8点描、Asset/SHA/person/版/原寸/target/容量/Abort、対象外/alpha/透明hidden RGB/入力不変。自称顔/本人は認証でない。公式6種/Recipe/UI/Worker/Final別、A Eyeshadow Backend/B Eyeliner host/メインdocs別、0/44。
- 2026-10-05 A Eyeshadow実登録Asset直接保存Gate: Aはtyped Recipe/写真固有Preset拒否新7/7・メイン独立7/7・buildを返却。次は`apps/backend/src/workspace.ts` Node直接saveRecipe Eyeshadow限定節、`repository.ts` Trial直接saveRecipe Eyeshadow限定節と新規JWT/Trial HTTP SQLite試験のみ排他。実actor/tenant登録非trash Asset/SHA/edit/版CAS/履歴読戻しを照合。人物/眼位置/真正原寸・Worker/Final/Cloudは別、B Eyeliner host/C Face Decorations監査/メインdocs別、0/44。
- 2026-10-05 C EV3-0037 Face Decorations差分監査: CはContacts Trial host実HTTP/SQLite新7/7・メイン独立7/7・buildを返却。通常Trialは人物/虹彩位置権威不足でfail-closed。次は新規`docs/FACE_DECORATIONS_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他。公式一次資料の下位操作/端末差と現SUITEを照合、隣接Makeupを誤統合せず素材/式不明は未確定、安全な最小単位を提案。製品/Backend/Cloud読取り、A Eyeshadow Backend/B Eyeliner host/メインdocs別、0/44。
- 2026-10-05 B Eyeliner Trial本人保存host: Bは限定Worker/facade新6/6・メイン独立関連18/18・buildを返却。次は新規`apps/web/src/manual-eyeliner-trial-host.mjs`と新規実Trial HTTP/SQLite専用試験のみ排他。fresh本人/tenant/登録Asset/SHA/edit/保存版、Original bytes digest・内部Worker decode原寸・CAS/readback。通常Trial人物privacyや真正RAW未証明は成功扱いしない。A Eyeshadow Backend/C Contacts別host/メインdocs別、0/44。
- 2026-10-05 A Eyeshadow限定typed Recipe/Preset隔離: Aは三役mask runtime新8/8・メイン独立関連20/20・buildを返却。次は`apps/backend/src/photo-policy.ts` optional `eyeshadowManual`限定節、`workspace.ts`写真固有Preset拒否限定節と新規Backend/JWT SQLite試験のみ排他。UI文書Asset/SHA/person/眼/原寸・三役ADD/ERASE・色/opacity、偽alias/bitmap/自称保存版/権限を厳格拒否。実Asset保存Gate/本人privacy/Worker/Final別、B Eyeliner Worker/C Contacts Trial host/メインdocs別、0/44。
- 2026-10-05 B Eyeliner限定Worker/facade: Bは保存線runtime新6/6・メイン独立関連18/18・buildを返却。次は`apps/web/src/processing/worker.mjs`/`index.mjs` Eyeliner新operation限定節と新規専用試験のみ排他。typed保存線→実RGBA、Asset/SHA/person/版/寸法/target/Abort、通常render未認証文書明示拒否。真正Original/人物privacy/製品Session/UI/Final/Cloud別、A Eyeshadow mask/C Contacts Trial host/メインdocs別、0/44。
- 2026-10-05 C Contacts Trial本人保存host: Cは独立UI新7/7・メイン独立7/7・buildを返却。次は新規`apps/web/src/manual-contacts-trial-host.mjs`と新規実Trial HTTP/SQLite専用試験のみ排他。fresh本人/tenant/登録Asset/SHA/edit/保存版、Original bytes digest・内部Worker decode原寸・CAS/readbackを照合し、合成非RAW・privacy未証明は成功扱いしない。製品mount/Final/Cloud別、A Eyeshadow mask/B Eyeliner runtime/メインdocs別、0/44。
- 2026-10-05 B Eyeliner保存線runtime: Bは実Asset直接保存Gate新3/3・メイン独立新/監査7/7・buildを返却。次は新規`apps/web/src/processing/manual-eyeliner-runtime.mjs`と新規専用試験のみ排他。typed連続edge/wingを原寸・厳密1600px Proxyへ投影し、純粋瞼線核のcontext/Pixel境界、Asset/SHA/person/版/容量/Abort/対象外/alpha/hidden RGB/入力不変を試験。公式styles/本人privacy/Worker/Final別、A Eyeshadow mask/C Contacts UI/メインdocs別、0/44。
- 2026-10-05 A Eyeshadow三役mask runtime: Aは独立UI新7/7・メイン独立7/7・buildを返却。次は新規`apps/web/src/processing/manual-eyeshadow-mask-runtime.mjs`と新規専用試験のみ排他。眼周囲/虹彩/瞳孔保護のUI strokeを原寸/1600px Proxy別に再ラスタ化、純粋核へ三役provenance、Asset/SHA/person/眼/版/寸法/容量/Abort/入力不変を検証。内部自称は認証でない。B Eyeliner Backend/C Contacts UI/メインdocs別、0/44。
- 2026-10-05 B Eyeliner実登録Asset直接保存Gate: Bはtyped Recipe/写真固有Preset拒否新5/5・メイン独立5/5・buildを返却。次は`apps/backend/src/workspace.ts` Node直接saveRecipe Eyeliner限定節、`repository.ts` Trial直接saveRecipe Eyeliner限定節、新規JWT/Trial HTTP SQLite試験だけを排他。実actor/tenant登録非trash Asset ID/SHA/edit権限/版CAS/履歴読戻しを検証。人物/眼矩形/真正原寸・Worker/Final/Cloud別、A Eyeshadow UI/C Contacts UI/メインdocs別、0/44。
- 2026-10-05 C Contacts虹彩ring/pupil独立UI: Cは限定Worker/facade新6/6・メイン独立関連17/17・buildを返却。次は新規`apps/web/src/manual-contacts-ui.mjs`と新規専用試験だけを排他。Backend typed文書に合うAfterの左右眼ring/pupil別stroke・色/Amount、Pointer/Touch/Keyboard、Undo/Redo/Cancel/Asset/版/失効破棄。fresh本人hostなし送信不可、callbackは保存証拠でない。公式11 styles/製品mount/Final/実RAW/Cloud未接続、A Eyeshadow UI/B Eyeliner Backend/メインdocs別、0/44。
- 2026-10-05 A Eyeshadow限定UI下書き: Aは純粋彩色新5/5・メイン独立関連9/9を返却。次は新規`apps/web/src/manual-eyeshadow-ui.mjs`と新規専用試験のみ排他。After眼周囲・虹彩/瞳孔保護ストローク/単色をPointer/Touch/Keyboard、Undo/Redo/Cancel/失効破棄。保存host不在送信不可、公式14/8 styleダミーなし。Editor/Backend/Worker/Final読取り、B Eyeliner typed/C Contacts Worker/メインdocs別、0/44。
- 2026-10-05 B Eyeliner限定typed Recipe/Preset隔離: Bは独立UI新6/6・メイン独立6/6・buildを返却。次は`apps/backend/src/photo-policy.ts` optional `eyelinerManual`限定節、`workspace.ts`写真固有Preset拒否限定節、新規Backend/JWT SQLite試験のみ排他。UI連続edge/wingとAsset/SHA/person/原寸を厳格保存、偽alias/権限自称/bitmap拒否。実Asset保存Gate/本人privacy/Worker/Final/Cloudは別、A Eyeshadow UI/C Contacts Worker/メインdocs別、0/44。
- 2026-10-05 C Contacts限定Worker/facade: Cはring/pupil mask新5/5・メイン独立関連11/11・buildを返却。次は`apps/web/src/processing/worker.mjs`/`index.mjs` Contacts新operation限定節と新規専用試験のみ排他。保存typed stroke→mask→虹彩純粋核の実RGBA、Asset/SHA/person/版/寸法/表現/Abortを検証。通常renderは未認証Contactsを黙示無視せず拒否。真正Original/本人privacy/Session/UI/Final/Cloudは別、A Eyeshadow UI/B Eyeliner typed/メインdocs別、0/44。
- 2026-10-05 A Eyeshadow本人明示mask彩色の限定純粋核: AはEV3-0021差分監査新4/4・メイン独立4/4を返却。次は新規`apps/web/src/processing/manual-eyeshadow-color.mjs`と新規専用試験だけを排他所有。眼周囲mask内のSUITE独自RGBA8単色効果、Asset/SHA/person/対象眼/版/原寸/表現/容量/Abort、mask外/虹彩/瞳孔/alpha/透明hidden RGB/入力不変を検証。mask/本人自称は認証でない。公式14/8 styles/Recipe/UI/Worker/Final/Cloud未接続、B Eyeliner UI/C Contacts mask/メインdocs別、0/44。
- 2026-10-05 C Contacts保存stroke→ring/pupil mask runtime: CはNode/Trial直接save Gate新3/3・メイン独立関連10/10・buildを返却。次は新規`apps/web/src/processing/manual-contacts-mask-runtime.mjs`と新規専用試験のみ排他所有。typed ring/pupil ADD/ERASEを原寸/厳密1600px Proxy別に再ラスタ化し、Asset/SHA/person/左右眼/版/原寸/表現/容量/Abort/入力不変を検証。自称人物/虹彩位置は認証証拠でない。製品Session/Editor/Worker/Final/Cloud読取り、A Eyeshadow監査/B Eyeliner UI/メインdocs別、0/44。
- 2026-10-05 A EV3-0021 Eyeshadow差分監査: AはEyelashes独立UI新6/6・メイン独立6/6・buildを返却。次は新規`docs/EYESHADOW_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他所有。公式一次資料の下位操作/端末差と現顔/Makeup/Recipe/UI/Final/Presetを照合し、Eyeliner/Eyelashes/Contactsと誤統合せず最小安全実装単位を提案。製品/Backend/Cloud読取り、B Eyeliner UI/C Contacts save/メインdocs別、0/44。
- 2026-10-05 B Eyeliner本人明示瞼線UI部品: BはSUITE独自連続瞼線純粋核新6/6・メイン独立6/6・buildを返却。次は新規`apps/web/src/manual-eyeliner-ui.mjs`と新規専用試験のみ排他所有。After左右眼矩形・edge polyline/wing・線幅/色/opacityをPointer/Touch/Keyboard、Undo/Redo/Cancel/切替/失効で安全下書き。公式9/6ダミーなし、自称瞼位置/本人は認証でなくfresh hostなしでは保存成功にしない。Session/Editor/Backend/Worker/Final/Cloud読取り、A Eyelashes UI/C Contacts save/メインdocs別、0/44。
- 2026-10-05 C Contacts手動虹彩文書の実登録Asset保存Gate: Cはtyped/写真固有Preset拒否新7/7・メイン独立監査含11/11・buildを返却。次は`apps/backend/src/workspace.ts` Node直接saveRecipe Contacts限定節、`repository.ts` Trial直接saveRecipe Contacts限定節、新規JWT/Trial HTTP SQLite試験のみ排他所有。実actor/tenant登録非trash Asset ID/SHA/edit権限/版CASを前後照合、別Asset/古いSHA/削除/Viewer/失効/競合拒否。自称person/eyeは認証でなくfresh privacy/虹彩位置/真正原寸、Worker/UI/Final/Cloud未接続、A Eyelashes UI/B Eyeliner純粋/メインdocs別、0/44。
- 2026-10-05 B Eyeliner本人明示瞼線の限定純粋核: BはEV3-0025差分監査4/4・メイン独立4/4で返却。次は新規`processing/manual-eyeliner-line.mjs`と新規専用試験のみ排他所有。明示左右瞼edge polyline＋任意wingをSUITE独自RGBA8連続線で描き、個別まつ毛/虹彩色と画素意味を区別。Asset/SHA/person/原寸/版/表現/容量/Abort、対象外/alpha/透明hidden RGB/入力不変を検証。自称瞼位置/本人は認可でなく公式9/6 styles/Recipe/UI/Worker/Final/Cloud未接続、A Eyelashes UI/C Contacts typed/メインdocs別、0/44。
- 2026-10-05 A Eyelashes本人明示曲線UI部品: AはSUITE独自テーパー純粋核新5/5・メイン独立5/5・buildを返却。次は新規`apps/web/src/manual-eyelash-ui.mjs`と新規専用試験のみ排他所有。Afterの左右眼矩形・root/control/tip曲線・色/opacityをPointer/Touch/Keyboard、Undo/Redo/Cancel/切替/失効で安全下書き。公式17/14ダミーなし、自称眼位置/本人は認証でなくfresh hostなしでは保存成功にしない。Session/Editor/Backend/Worker/Final/Cloud読取り、B Eyeliner監査/C Contacts typed/メインdocs別、0/44。
- 2026-10-05 B EV3-0025 Eyeliner差分監査: BはHand Trial保存host実HTTP/SQLiteの合成非RAW拒否新4/4・メイン独立4/4・buildを返却。次は新規`docs/EYELINER_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他所有。公式一次資料の下位操作/端末差と現顔/Makeup/Recipe/UI/Final/Presetを比較し、Eyelashes/Contacts/Eyeshadowを誤統合しない。未知素材/画素式を推測で完成扱いせず最小安全実装単位を提案。製品/Backend/Cloud読取り、A Eyelashes純粋/C Contacts typed/メインdocs別、0/44。
- 2026-10-05 C Contacts手動虹彩ring typed Recipe/Preset隔離: Cは純粋核新6/6・メイン独立6/6・buildを返却。次は`apps/backend/src/photo-policy.ts` optional `contactsIrisManual`限定節、`workspace.ts`写真固有Preset拒否限定節と新規Backend/JWT SQLite試験のみ排他所有。Asset/SHA/person/左右眼/原寸、ring/pupil別bounded normalized ADD/ERASE stroke、色/Amountを保存。Bitmap/保存revision/偽認可/未知contacts alias拒否、旧Recipe/写真非依存Preset維持。fresh本人虹彩Gate/Worker/UI/Final/Cloudは未接続、A Eyelashes純粋/B Hands host/メインdocs別、0/44。
- 2026-10-05 A Eyelashes本人明示テーパー線限定純粋核: AはEV3-0023差分監査4/4・メイン独立4/4で返却。次は新規`processing/manual-eyelash-render.mjs`と新規専用試験のみ排他所有。本人明示片眼/両眼root→tip曲線からテーパーRGBA8線を決定的描画。Asset/SHA/person/原寸/版/表現/容量/Abort、mask外/alpha/透明hidden RGB/入力不変を検証。自称眼位置/本人は権限証拠でない。公式17/14 styles/Recipe/Session/UI/Worker/Final/Cloud未接続、B Hands host/C Contacts純粋/メインdocs別、0/44。
- 2026-10-05 B Hands手動Tone Trial本人保存host: BはHand独立UI新6/6・メイン独立6/6・buildを返却。次は新規`apps/web/src/manual-hand-tone-trial-host.mjs`と新規実Trial HTTP/SQLite試験のみ排他所有。実EditorSession/TrialClientのfresh本人/tenant・実Asset/SHA・Original bytes digest/内部decode原寸・保存Recipe版/edit権限・CAS/readbackをGate。自称手位置/本人やcaller decoderは権限証拠でなく、合成非RAWは安全拒否、偽Worker成功は実RAW成功でない。Session/Editor/Backend/Worker/Final/Cloud読取り、A Eyelashes監査/C Contacts純粋/メインdocs別、0/44。
- 2026-10-05 C Contacts本人明示虹彩ring色の限定純粋核: CはEV3-0027差分監査4/4・メイン独立4/4を返却。次は新規`processing/manual-contacts-iris-color.mjs`と新規専用試験のみ排他所有。本人明示ring coverage＋瞳孔除外mask内のSUITE独自RGBA8彩色、mask外/瞳孔/alpha/透明hidden RGB/入力不変、Asset/SHA/person/原寸/版/表現/容量/Abortの構造検証。自称ring/本人は権限・検出証拠でない。公式11 styles/Recipe/Session/UI/Worker/Final/Cloud未接続、A Eyelashes監査/B Hands UI/メインdocs別、0/44。
- 2026-10-05 A EV3-0023 Eyelashes差分監査: AはBlush Trial本人保存host新8/8・メイン独立8/8・buildを返却。通常Trial privacy Gateは拒否、Node synthetic成功は製品権威でない。次は新規`docs/EYELASHES_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他所有。公式一次資料の下位操作/端末差と現顔/Makeup/Recipe/UI/Final/Presetを比較し、Contacts/Eyeliner/Detailを誤統合せず最小安全実装単位を提案。製品/Backend/Cloudは読取り、B Hands UI/C Contacts監査/メインdocs別、0/44。
- 2026-10-05 C EV3-0027 Contacts差分監査: CはClothing Trial本人保存host新6/6・メイン独立6/6・buildを返却。次は新規`docs/CONTACTS_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他所有。公式一次資料のContacts操作・端末差と現顔/Makeup/Recipe/UI/Final/Presetを比較し、色調整/EyeshadowをContactsと誤統合せず、最小安全な実装単位を提案。製品/Backend/Cloudは読取り、A Blush Trial host/B Hands UI/メインdocs別、0/44。
- 2026-10-05 B Hands手動限定UI部品: BはHand独立Worker/facade新6/6・メイン独立核/mask/Worker19/19・buildを返却。次は新規`apps/web/src/manual-hand-tone-ui.mjs`と新規専用試験のみ排他所有。本人明示手/前腕stroke・strength/radiusのAfter Pointer/Touch/Keyboard、Undo/Redo/Cancel/切替/失効を安全実装。自称手位置/本人は認証でなく、fresh hostなしでは保存成功にしない。Session/Editor/Backend/Worker/Final/Cloudは読取り、A/C Trial host/メインdocs別、0/44。
- 2026-10-05 B Hands手動限定独立Worker/facade: Bはmask runtime新6/6・メイン独立核/mask13/13・buildを返却。次は`processing/worker.mjs`/`index.mjs` Hand新operation限定節と新規専用試験のみ排他所有。保存typed stroke→原寸/Proxy mask→純粋tone実画素、Asset/SHA/版/寸法/target/容量/Abortを再検証。通常renderは未認証Hand文書を黙示無視せず拒否、既存Blush/Clothing/Shadow/BW維持。真正Original/本人手位置/Session/UI/Final/Cloudは未接続、A/C Trial host/メインdocs別、0/44。
- 2026-10-05 B Hands保存stroke mask runtime: Bは実Asset保存Gate専用3/3・メイン独立3/3・buildを返却。次は新規`processing/manual-hand-mask-runtime.mjs`と新規専用試験のみ排他所有。typed normalized ADD/ERASE stroke→原寸/厳密1600px Proxy別mask、純粋核用Asset/SHA/版/寸法/target/容量/Abort provenanceを検証。自称手位置/権限は証拠でない。Worker/Session/UI/Backend/Final/Cloud読取り、A Blush host/C Clothing host/メインdocs別、0/44。
- 2026-10-05 C Clothing本人手動Spot Trial保存host: Cは独立UI新6/6・メイン独立6/6・buildを返却。次は新規`apps/web/src/manual-clothing-spot-trial-host.mjs`と新規実Trial HTTP/SQLite試験のみ排他所有。実EditorSession/TrialClientのfresh本人・同tenant実Asset/SHA・edit権限・保存Recipe版/CAS/readback、Original bytes SHA/decode原寸をGate。自称衣服領域/host callbackを権限にせず、不証明なら成功保存なし。Session/Editor/Backend/Worker/Final/Cloud読取り、A Blush host/B Hands mask/メインdocs別、0/44。
- 2026-10-05 A Blush手動UIのTrial本人保存host: AはBlush手動UI新7/7・メイン独立7/7・buildを返却。次は新規`apps/web/src/manual-blush-trial-host.mjs`と新規実Trial HTTP/SQLite専用試験のみ排他所有。実EditorSession/TrialClientでfresh本人・同tenant実Asset/SHA・edit権限・保存Recipe版/portrait person continuity・CAS/readbackをGate。自称person/host callbackだけを認証にせず、Original bytes SHA/decode原寸不証明なら成功保存不可。既存Session/Editor/Backend/Worker/Final/Cloudは読取り専用、B Hands Backend/C Clothing UI/メインdocs別、0/44。
- 2026-10-05 B Hands手動文書の実登録Asset保存Gate: Bはtyped/写真固有Preset拒否新7/7・メイン独立7/7・buildを返却。次は`apps/backend/src/workspace.ts` Node直接saveRecipe hand限定節、`apps/backend/src/repository.ts` Trial直接saveRecipe hand限定節、新規JWT/Trial HTTP SQLite試験のみ排他所有。認証済みactor/tenant登録非trash Asset ID/SHA/edit権限/版CASを前後照合。別Asset・古いSHA・削除・Viewer・失効・競合拒否。真正原寸/手位置/Worker/UI/Final/Cloud未接続、A/C/メインdocsと別、0/44。
- 2026-10-05 C Clothing本人手動Spot UI部品: CはClothing独立Worker/facade新6/6・メイン独立18/18・Web buildを返却。次は新規`apps/web/src/manual-clothing-spot-ui.mjs`と新規専用試験のみ排他所有。本人明示小target/reference/target strokeのAfter操作、Pointer/Touch/Keyboard/Undo・Redo/Cancel/失効/Asset切替安全を確認。自称本人/衣服領域を権限証拠とせず、fresh認証hostなしでは保存成功扱いしない。Session/Editor/Backend/Worker/Final/Cloudは読取り専用、A Blush新UI/B Hands typed/メインdocs別、0/44。
- 2026-10-05 B Hands手動限定typed Recipe/Preset隔離: Bは手/前腕の限定純粋核専用7/7・メイン独立7/7・Web buildを返却。次は`apps/backend/src/photo-policy.ts` optional `handToneManual`限定節、`apps/backend/src/workspace.ts`写真固有Preset拒否限定節、新規専用Backend/JWT SQLite試験のみ排他所有。Asset/SHA/原寸・bounded normalized ADD/ERASE stroke・strength/radiusを保存、Bitmap/保存revision/偽認可alias拒否。旧Recipe/写真非依存Preset維持。Session/UI/Worker/Final/Cloudは読取り専用、A Blush新UI/C Clothing Worker/メインdocs別、0/44。
- 2026-10-05 C Clothing手動限定独立Worker/facade: CはNode/Trial直接保存Gateの実JWT HTTP/SQLite新2/2・メイン独立2/2・buildを返却。次は`processing/worker.mjs`/`index.mjs` Clothing新operation限定節と新規専用試験のみ排他所有。保存typed target/reference/strokeから純粋RGB修復を実pixelsへ接続し、Asset/SHA/保存版/原寸/出典/容量/Abortを拒否側で検証。通常renderは未認証Clothingを黙示無視せず拒否。真正Original/本人衣服領域/Session/UI/Final/Cloudは未接続、A新Blush UI/B新Hands純粋/メインdocs別、0/44。
- 2026-10-05 A Blush本人手動UI部品: AはBlush独立Worker/facade専用6/6・メイン独立mask/Worker12/12・buildを返却。次は新規`apps/web/src/manual-blush-ui.mjs`と新規専用試験のみ排他所有。明示左右頬stroke/色/opacityをAfter UIで操作し、Pointer/Touch/Keyboard、Undo/Redo、取消/失効/Asset切替安全を試験。自称person/頬位置を本人証拠とせず、fresh認証hostが無ければ保存成功扱いしない。Session/Editor/Backend/Worker/Cloudは読取り専用、B Hands/C Clothing save/メインdocs別、0/44。
- 2026-10-05 B Hands手動限定純粋核: Bは元3操作監査4/4・メイン独立4/4を返却。次は新規`processing/manual-hand-tone.mjs`と新規専用試験のみ排他所有。本人明示手/前腕mask内のSUITE独自・輝度偏差局所均一化をRGBA8に実装し、単なるLocal Levels別名でない決定的効果、mask外RGB/alpha/hidden RGB/入力不変、Asset/SHA/原寸/版/target/容量/Abortを試験。自称maskは認可/手検出としない。Recipe/Session/UI/Worker/Backend/Cloudは読取り、A Blush Worker/C Clothing save/メインdocs別、0/44。
- 2026-10-05 C Clothing実登録Asset保存Gate: Cはtyped/Preset隔離とBlush getter追補をBackend新8/8・全Backend228/228（メイン独立）・buildで返却。次は`apps/backend/src/workspace.ts` Node直接saveRecipe衣服限定節、`apps/backend/src/repository.ts` Trial直接saveRecipe衣服限定節と新規専用JWT/Trial HTTP SQLite試験のみ排他所有。実actor/登録Asset ID/SHA/edit権限/CASを前後照合し、別Asset/古いSHA/削除済み/Viewer/失効/競合拒否。寸法実証は別Gate。A Blush Worker/B Hands/メインdocs別、0/44。
- 2026-10-05 B EV3-0232 Hands差分監査: BはOriginal Shadow製品Editor限定mount新2/2・関連35/35・メイン独立新/bridge7/7・buildを返却。次は新規`docs/HANDS_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他所有。元3下位操作と現Face/Local/maskの対象/画素/保存/Final/Preset/端末差、安全な次の実装単位を調査。製品/Backend/Cloud、A Blush Worker/C Clothing typed/メインdocsは読取り、0/44。
- 2026-10-05 A Blush独立Worker/facade: AはBlush mask runtime6/6・関連20/20・メイン独立mask/核14/14・buildで返却。次は`processing/worker.mjs`/`processing/index.mjs`のBlush新operation限定節と新規専用試験のみ排他所有。保存typed Recipe→mask runtime→彩色核をAsset/SHA/person/版/寸法/出典・容量/Abortで束縛し、通常renderは未認証文書を黙示無視せず拒否。現Session/UI/Final/Backend/Cloudは読取り。B Hands/C Clothing typed/メインdocs別、0/44。
- 2026-10-05 C Blush settings getter安全追補: Cの現`photo-policy.ts` Clothing契約排他にBlush settings節のdata descriptor先検証と新規getter回帰試験を追加。accessorを`settings.color`読取前に拒否し、Blush/Clothing/旧Recipe意味保持。A Blush mask runtimeは同Backend読取り、B Editor/メインdocs別。旧安全主張は修正試験後に再判定、0/44。
- 2026-10-05 C Clothing手動限定typed Recipe/Preset隔離: Cは純粋核6/6・メイン独立6/6・buildを返却。次は`apps/backend/src/photo-policy.ts`の`clothingSpotManual` optional構造限定節、`apps/backend/src/workspace.ts`の写真固有Preset拒否限定節、新規専用Backend/JWT SQLite試験のみ排他所有。Asset/SHA/原寸、normalized非重複target/reference矩形・bounded target strokesを保存しbitmap/認可自称/保存revisionは拒否、旧Recipe/他拡張/写真非依存Presetを維持。A Blush mask/B Editor/メインdocs別、0/44。
- 2026-10-05 A Blush手動mask独立runtime: Aはtyped Recipe/Node Preset写真固有拒否をBackend新7/7・全220/220・Web関連12/12・buildで返却。次は新規`processing/manual-blush-mask-runtime.mjs`と新規専用試験のみ排他所有。保存normalized ADD/ERASE strokeから原寸/1600px Proxy別maskを作り既存純粋Blush核の出典と寸法へ接続。Asset/SHA/person/版/target/容量/Abortを試験し、本人認可/頬検出は主張しない。Recipe/Session/UI/Worker/Backend/Cloudは読取り、B Editor/C Clothing pure/メインdocs別、0/44。
- 2026-10-05 C Clothing手動限定スポット純粋核: Cは衣服7下位操作監査5/5・関連8/8・メイン独立5/5・buildで返却。次は新規`processing/manual-clothing-spot.mjs`と新規専用試験のみ排他所有。本人明示の小領域・参照領域のSUITE独自非AI RGBA8修復をAsset/SHA/原寸/版/表現/領域出典/容量に束縛し、mask外・alpha/hidden RGB/入力不変とAbort拒否を試験。自称衣服/認可を信頼しない。Recipe/Session/UI/Worker/Backend/Cloudは読取り、A Blush/B Editor/メインdocs別、0/44。
- 2026-10-05 C EV3-0313 Clothing adjustments監査: CはEyebrows差分監査4/4・関連12/12・メイン独立4/4を返却。次は新規`docs/CLOTHING_ADJUSTMENTS_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他所有。元7下位操作と現Detail/Local/mask/Finalの意味差、衣服保護・権限・Preset/端末差を確認し、最小安全実装単位を提案。製品/Backend/Cloud、A Blush/B Shadow/メインVignetteは読取り。0/44。
- 2026-10-05 A Blush写真固有Preset拒否: 現typed契約排他に`apps/backend/src/workspace.ts`のPersonal/Workspace全Recipe Preset写真固有拒否限定節と新規専用JWT/SQLite試験を追加所有。`blushManual`を別写真Presetへ無条件コピーしない。旧写真非依存/旧拒否/Recipe/Branchを維持。B Editor/C Eyebrows/メインVignette別、0/44。
- 2026-10-05 メイン Vignette監査陳腐化期待の修正: メインのみ`apps/web/tests/vignette-completion-audit.test.mjs` AUDIT02と`docs/VIGNETTE_COMPLETION_AUDIT.md`後続追補を排他編集。型付き写真非依存VignetteのAuthor portable現対応と未知/写真固有拒否を確認、製品コード/Preset契約は不変更。A Blush/B Shadow/C Eyebrowsと別、0/44。
- 2026-10-05 A Blush監査期待追随: 現typed契約排他に加えて`apps/web/tests/blush-completion-audit.test.mjs` AUDIT-03限定と`docs/BLUSH_COMPLETION_AUDIT.md`後続追補を追加排他所有。未知`blush`偽キー拒否と手動`blushManual`構造のみを区別し、Worker/Session/UI/Final未接続を明示。B Editor/C Eyebrows/メインdocs別、0/44。
- 2026-10-05 A Blush手動限定typed Recipe: AはSUITE独自純粋核8/8・関連31/31・メイン独立8/8・buildを返却。次は`apps/backend/src/photo-policy.ts`のBlush optional extension限定節と新規専用Backend/Recipe試験のみ排他所有。Asset/SHA/person/原寸・bounded normalized ADD/ERASE頬stroke・色/不透明度を厳格検証、Bitmap/認可自称/保存revision/未知`blush`偽キーは拒否。旧Recipe/処理順/他拡張を保持し、Preset/認証/Worker/Session/UIは別Gate。B Editor/C docs/メインdocs別、0/44。
- 2026-10-05 B Original Shadow製品Editor限定mount: Bは独立bridge新5/5・関連27/27・メイン独立5/5・buildを返却。次は`apps/web/src/editor-ui.mjs` Original Shadow限定節と新規専用Editor UI/Browser bundle試験のみ排他所有し、既存二層UI/bridgeを実Trial本人選択・保存版・両Original出典があるAfter操作へ接続。Before/失効/切替/取消/異寸法/Add Shadow同時拒否、既存機能維持。新実Chrome/RAW/CloudはNOT_RUN、A Blush純粋/C Eyebrows docs/メインdocs別、0/44。
- 2026-10-05 C EV3-0169 Eyebrows差分監査: CはXMP往復専用3/3・関連24/24・メイン独立3/3・buildを返却。次は新規`docs/EYEBROWS_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他所有。元眉下位操作と現Face/Makeup/Local実処理・UI・保存/Final/Presetを照合し、眉メイクと幾何変形を混同しない。製品/Backend/Cloud、A Blush/B Shadow/メインdocsは読取り、0/44。
- 2026-10-05 A Blush手動限定純粋核: AはEV3-0030監査4/4・関連20/20・メイン独立4/4・buildを返却。次は新規`processing/manual-blush-color.mjs`と新規専用試験のみ排他所有し、本人明示頬mask内のSUITE独自単一色彩合成をRGBA8に実装。Asset/SHA/person/原寸/版/出典・色/不透明度/Abort/容量、mask外RGB/alpha/hidden RGB/Original不変を試験。認可自称/公式12スタイル/AIは主張しない。Recipe/Session/UI/Worker/Backend/Cloudは読取り、B Bridge/C XMP/メインdocs別、0/44。
- 2026-10-05 C Smart Culling XMP限定往復: CはVerified Panel取込を新5/5・関連69/69・メイン独立のXMP関連15/15・buildで返却。次は新規`workspace-culling-xmp-roundtrip.test.mjs`のみ排他所有し、既存取得bytes→本人明示別Asset Preview→適用→CAS/readbackを実JWT/SQLiteで照合。形式不整合があればCのみ`workspace-culling-xmp-sidecar.mjs`/`workspace-culling-xmp-import.mjs`の限定箇所を最小修正可。他mark/権限/無効XMLを維持。Panel/verified mountは返却済み、A Blush/B Shadow/メインdocs別、0/44。
- 2026-10-05 A EV3-0030 Blush候補差分監査: AはDesktop↔iPad data-onlyレポート専用4/4・関連13/13・メイン独立11/11・buildを返却。次は新規`docs/BLUSH_COMPLETION_AUDIT.md`と新規専用監査試験のみ排他所有。元Blush下位操作と現Face/Local/Makeupの実処理/UI/保存/Final/Preset差を一次資料で照合し、安全な次の実装単位を特定する。既存製品/Backend/Cloud、B Bridge/C Panel/メインdocsは読取り専用。監査だけで0/44維持。
- 2026-10-05 C Smart Culling XMP取込Panel接続: Cは限定部品新6/6・関連16/16・buildを返却。次は`workspace-culling-panel.mjs`のXMP取込限定節、`workspace-culling-verified-mount.mjs`のverified host限定節、新規専用試験のみ排他所有。単一sidecar Preview→別クリック明示保存、fresh本人/選択/Asset SHA/Project版/CAS/readback、未知/取消/失効/競合拒否。他mark/Original保持。A Editor/B Shadow/メインdocs別、0/44。
- 2026-10-05 B Original Shadow Editor独立bridge: Bは通常Preview/保存後再Gateを新9/9・旧6/6・関連83/83・buildで返却。次は新規`apps/web/src/original-shadow-editor-bridge.mjs`と新規専用試験のみ排他所有。既存二層UI/Trial host/Sessionと選択/版/出典を厳格に束縛する。`editor-ui.mjs`/`session.mjs`/Backend/Cloudは読取り専用、A Editor互換表示/C Panel/メインdocs別。bridgeだけで製品mount完成とせず0/44。
- 2026-10-05 A Desktop↔iPad互換性読取り表示: AはLR-02全体表示を新2/2・関連19/19・メイン独立2/2・buildで返却。次は新規`apps/web/src/cross-device-compat-report-ui.mjs`/新規専用試験と`apps/web/src/editor-ui.mjs`の互換性表示限定節のみ排他所有。現保存RecipeのWeb→Apple data-only差分を表示し、転送/Apply/Final/実機互換の偽ボタン・主張なし。選択/版/失効でstale破棄。B Session Shadow/C XMP/メインdocsと別、0/44。
- 2026-10-05 B Original Shadow保存後Preview追補: B現排他Session openAsset/refreshPreviewに加え、`apps/web/src/session.mjs`のOriginal Shadow限定save後節と新規専用試験を追加所有。保存Shadow文書/版固定のdirty編集Preview、CAS保存後の再読込/両Original/provenance再Gate、旧URL/偽成功防止。旧Final06更新排他も継続。他保存/Editor/Backend/Cloudは読取り、A Histogram/C XMP/メインdocs別、0/44。
- 2026-10-05 A LR-02 Histogram全体表示: Aは指標表示設定を新2/2・関連17/17・メイン独立2/2・buildで返却。次は`apps/web/src/editor-ui.mjs` Histogram限定節と新規専用試験、`docs/HISTOGRAM_COMPLETION_AUDIT.md`追補のみ排他所有。公式Show Histogramの全体表示/非表示と復帰、Keyboard/focus/44px/狭幅を扱い、写真overlay/J/左右状態/Recipe/Finalを不変。B Session Shadow/C XMP/メインdocsと別、0/44。
- 2026-10-05 C Smart Culling XMP限定取込: CはBulk Segmentを新7/7・関連40/40・buildで返却。次は新規`apps/web/src/workspace-culling-xmp-import.mjs`と新規専用実JWT HTTP/SQLite試験のみ排他所有。明示単一Assetのsidecar Rating/Labelだけ厳格読取→本人確認→Node CAS/readback、他mark保持、別写真/未知項目/不確定拒否。Panel/Backend/Cloudは読取り、A Histogram/B Shadow/メインdocsと別、0/44。
- 2026-10-05 B Original Shadow旧Final試験06追随: Bの現Preview排他に加え、現Preview到達が新規専用試験で確認された場合のみ`apps/web/tests/original-shadow-final-trial.test.mjs`末尾06を追加排他所有。旧fail-closed境界01〜05を維持し陳腐化したPreview拒否期待を安全な新到達/失敗境界に更新。Preview未成立なら変更なし。A/C別、0/44。
- 2026-10-05 A LR-02 Histogram残操作: AはOutput Form読書きを新4/4・関連15/15・メイン独立9/9で返却。次は`docs/HISTOGRAM_COMPLETION_AUDIT.md`、新規専用試験、確認済み不足がある場合だけ`apps/web/src/editor-ui.mjs`のHistogram限定節を排他所有。既存左右個別/J/5領域/保存/Finalを再実装せず、公式不明閾値は推測しない。B Session Shadow/C Culling/メインdocsと別、0/44。
- 2026-10-05 A Export Output Form読書き: AはEditorへのNode Export Preset安全境界を専用3/3・メイン独立3/3・関連9/9・buildで返却。次は`apps/web/src/export-output-adjustments-ui.mjs`と新規専用試験のみ排他所有。現手動Output Sharpeningの設定setter/readbackを厳格に追加し既存Final/Cancel/noneを保持。Preset/Editor/Session/Backendは読取り、B Shadow/C Culling/メインdocsと別、0/44。
- 2026-10-05 B Original Shadow通常Preview: Bは1:1限定Finalを専用6/6・メイン独立6/6・関連99/99・buildで返却。次は`apps/web/src/session.mjs`のOriginal Shadow限定openAsset/refreshPreview、必要な同operation `processing/index.mjs`、新規専用試験のみ排他所有。両Original/provenance/Recipe/権限/版/同寸法を証明してProxy描画、失敗は閉じる。Editor/Backend/Cloudは読取り、A/C別、0/44。
- 2026-10-05 C Smart Culling Bulk Segment: CはBulk Rating/Flag/Colorを新8/8・メイン独立8/8＋Tag10/10・buildで返却。次は`workspace-culling-bulk-tags.mjs`逐次CAS核と`workspace-culling-panel.mjs`Bulk限定節、新規専用試験のみ排他所有。2〜20選択へ実在Segment/明示Unassignedを割当、他mark全保持、fresh本人/版/CAS/readbackと部分結果。Backend/Cloud/AIは読取り、A/B/メインdocs別、0/44。
- 2026-10-05 A Export Preset実Editor接続境界: AはNode Workspace本人操作UIを実JWT HTTP/SQLite3/3・メイン独立3/3・関連6/6で返却。次は`apps/web/src/editor-ui.mjs`のExport設定限定節、新規`workspace-export-preset-editor-host.mjs`、新規専用試験のみ排他所有。TrialとNode JWTを混同せず、実認証hostがある場合だけ4設定Apply/readback/Final snapshotへ。無ければ製品ではdisabledのまま、境界証拠を報告。B `session.mjs` Shadow、C Culling、メインdocsは別、0/44。
- 2026-10-05 C Smart Culling複数写真Rating/Flag/Color: CはVerified Node Bulk Tag画面を新4/4・メイン独立4/4＋部品6/6・build PASSで返却。次は`apps/web/src/workspace-culling-bulk-tags.mjs`の逐次CAS安全核と`workspace-culling-panel.mjs`/`workspace-culling-verified-mount.mjs`のBulk限定節、新規専用試験のみ排他所有。明示2〜20件へRating/Flag/Color一種ずつ変更し、他mark/Tag/Segment・既存Tag操作を維持。fresh本人/集合版/選択/失効/部分結果/未検証を同契約で確認。Backend/Client/Final/Cloudは読取り、A Export UI/B Shadow Session/メインdocsと別、0/44。
- 2026-10-05 B Original Shadow Trial Final接続境界: BはTrial host adapterを実HTTP/SQLite専用6/6・関連29/29・メイン独立6/6・build PASSで返却。次は`apps/web/src/session.mjs`のOriginal Shadow限定Final節、必要なら`apps/web/src/processing/index.mjs`同operation限定節、新規専用実Trial/合成非RAW Worker Final試験のみ排他所有する。保存Recipe/対象・背景Original bytes SHA/実decode pixels/権限・版を結び、既存runtime→Worker Finalを安全に接続できる場合だけ実装。背景画素・decoded provenanceが証明不能なら通常Final拒否を保持して差分報告。Editor/UI/Backend/Cloudは読取り、A Export UI/C Culling Panel/メインdocsと別、0/44。
- 2026-10-05 A Export Preset本人操作UI: Aは認証済みWeb clientを実JWT/SQLite専用3/3・メイン独立3/3・build PASSで返却。次は新規`apps/web/src/workspace-export-preset-ui.mjs`と新規専用実JWT HTTP/SQLite試験のみ排他所有する。Personal/Workspace保存・一覧/再読込・本人選択と4設定のreadback、版CAS/role/失効を確認。Final設定Applyはhostが実反映/readbackを保証する場合のみ、未接続時disabled。選択/保存をFinal適用・命名証拠としない。Editor/Session/Backend/Final/Cloudは読取り、B Shadow host/C Culling Panel/メインdocsと別、0/44。
- 2026-10-05 C Smart Culling Bulk Tag画面接続: Cは新規逐次CAS部品を実JWT/SQLite6/6・メイン独立6/6・build PASSで返却。次は`apps/web/src/workspace-culling-panel.mjs`と`apps/web/src/workspace-culling-verified-mount.mjs`のBulk Tag限定箇所、新規専用Panel/実JWT HTTP試験のみ排他所有する。verified mountから期待本人/tenantと現在の明示順selectionProviderを供給し、PanelのSetだけを認証正本としない。本人明示選択2〜20件、単一Tag追加/除去、既存Project版、部分成功・不確定・要再読込表示、失効/切替/取消二重実行安全を照合。Backend/Client/Final/Cloudは読取り。A Export client/B Shadow adapter/メインdocsと別、0/44。
- 2026-10-05 メイン Original Shadow保存結果不確定文言: メインのみ`apps/web/src/original-shadow-manual-ui.mjs`のhost callback reject文言と`apps/web/tests/original-shadow-manual-ui.test.mjs`の当該安全assertを排他編集。CAS成功後のreadback/通信失敗は未適用と断定できないため、再読込確認とし、保存/Final完成とはしない。Bの新規Trial host adapterは既存UI読取りのみ。A/Cは非重複、0/44。
- 2026-10-05 A Export Preset認証済みWeb client: AはNode Workspace保存正本を専用3/3・関連31/31・build PASSで返却。次は新規`apps/web/src/workspace-export-preset-client.mjs`と新規専用試験のみ排他所有する。実APIのlist/get/create/update、短命Bearer/same-origin/redirect拒否/no-store/no-referrer、版CAS・型/応答厳格化、失効/競合を確認。Editor/Session/Final/Backend/Cloudは読取り。B Shadow host/C Bulk Tags/メインdocsと別、0/44。
- 2026-10-05 B Original Shadow Trial host adapter: Bは二層手動UIを専用6/6・関連17/17・build PASSで返却。次は新規`apps/web/src/original-shadow-manual-trial-host.mjs`と新規専用実Trial HTTP/SQLite試験のみ排他所有する。現UI callbackへfresh本人/現Session/対象・背景Asset/SHA/原寸/保存Recipe版を供給し既存Trial CAS保存を通す。別Asset/版変更、失効、cancel、部分失敗は成功扱いしない。Editor/Session/Worker/Backend/Cloudは読取り。A Export client/C Bulk Tags/メインdocsと別、0/44。
- 2026-10-05 C Culling複数写真手動Tag: CはPanel Tag/AND-OR filterを新3/3・関連11/11・build PASSで返却。次は新規`apps/web/src/workspace-culling-bulk-tags.mjs`と新規専用試験のみ排他所有し、本人明示順2〜20 Assetの既存Node markにTag追加/除去を保存。fresh Project版/mark/roleのCASと他Mark保持、途中失効/競合/Abort時の部分結果・再読込必要を正確に返し、偽atomic成功なし。Backend/Client/Panel/Final/Cloudは読取り。A Backend Export Preset/B Original Shadow新UIとは非重複、0/44。
- 2026-10-05 C Smart Culling手動Tag/AND-OR filter: CはXMP verified Node画面を新4/4・メインCulling35/35・build PASSで返却。次は`apps/web/src/workspace-culling-panel.mjs`のfilter限定節と新規専用試験のみ排他所有する。保存済みProject全件/版固定markのTagとAND/OR方式を既存Stars/Flag/Color/Segmentへ追加し、条件変更・選択/版/権限変化で参考preflightを無効化。純粋`filterManualCullingAssets`と意味一致を試験、AI/Final/Cloud未接続。A Backend Export Preset/B Original Shadow UI/メインdocsと別、0/44。
- 2026-10-05 A Node Workspace Export Preset正本: Aは現catalogに保存版がないことを確認して証拠偽造を停止。次はEV3-0764の土台として`apps/backend/src/workspace.ts`/`workspace-server.ts`のExport Preset限定節と新規Backend/JWT HTTP試験を排他所有する。別表のcreate/list/get/update CAS、本人/tenant/role、typed format/size/resolution/output sharpening、旧DB非破壊を確認。写真編集Preset/Recipe/RAW/Asset/Cloud D1は既存不変で、UI/Final適用/命名は後段、0/44。B Original Shadow新UI/C Culling UIは非重複。
- 2026-10-05 B Original Shadow二層手動UI: Bは独立Worker操作を専用5/5・関連21/21・Web build PASSで返却。次は新規`apps/web/src/original-shadow-manual-ui.mjs`と新規専用試験のみ排他所有。subject/shadow別ADD/ERASE・Opacity/Undo/Redo/取消・Pointer/Touch/Keyboard/focusをtyped保存文書へ繋ぐ。fresh認証host callback/対象・背景/版が無い時Save/Applyを停止し、AI抽出や製品Final接続を主張しない。A Export Preset新module/C Culling UI/メインdocsとは別ファイル。0/44維持。
- 2026-10-05 A Export Preset名の適用証拠: AはEV3-0757公式照合で比率不一致時の仕様根拠なし・変更0と返却。次はEV3-0764 `original-export-preset`/`original-effect-export-preset`の実適用名に関し、新規`apps/web/src/export-preset-naming-evidence.mjs`と専用試験だけを排他所有。既存保存正本があればfresh版と現Export設定一致を検証して限定証拠、無ければ一覧/表示名/任意caller文字列を真実とせず未接続報告。Editor/Session/Backend/Cloudは読取り、B Worker/C Culling UI/メインdocsは非重複。0/44。
- 2026-10-05 A Export size exact寸法差分: AはCanvas Expand非同期取消を専用8/8・関連安全85/85・build PASSで返却。次はEV3-0757公式`specific pixel dimensions`と現bounding boxの意味差を公式一次資料で照合。Aのみ`apps/web/src/export-size.mjs`/`export-size-selection.mjs`寸法限定箇所と新規専用試験を排他所有し、既存契約を変更しない加法的方式だけを根拠に基づき実装。歪み/切取/余白が不明なら推測で実装しない。Editor/Session/Workerは読取り、B Worker/C Culling UI/メインdocsは非重複、0/44維持。
- 2026-10-05 C XMP sidecar Node画面取得: Cは同一Bearer再Gateを実JWT/SQLite新6/6・build PASSで返却。メインのCulling client/verified mount redirect安全追補は関連13/13 PASSで排他解除。次はCが`apps/web/src/workspace-culling-panel.mjs`と`workspace-culling-verified-mount.mjs`のXMP限定箇所、新規専用試験を排他所有する。fresh host本人/選択/対象SHAと明示単一写真クリックからRating/Label限定bytesを安全名sidecarで取得、未対応Pick/Tags/Segmentは拒否、失効/切替/取消は0 downloadとURL回収。Node host未設定・実Chrome/RAW/Final/Cloudは未接続で0/44。A Session/B Worker/メイン別ファイル。
- 2026-10-05 B Original Shadow独立Worker: Bは二層runtimeを合成非RAW実Trial HTTP/SQLite4/4・関連画素26/26・build PASSで返却。次は`apps/web/src/processing/worker.mjs`の独立Original Shadow操作、必要最小のWorker facade、新規専用試験のみ排他所有する。手動文書/二層mask/対象・背景/版と実画素をWorker境界で照合。caller decoded pixelsの実Original由来は未証明なので通常render/Finalへ黙示接続しない。A Session取消/C XMP/メインCullingは別ファイル、0/44維持。
- 2026-10-05 C XMP同一Bearer再Gate: CはAdobe公式確認済みRating/Label限定XMP bytesを実JWT/SQLite専用4/4・build PASSで返却。メイン安全レビューで別JWT跨ぎを発見したため、同じ新規module/専用試験のみCが再排他所有。1巡で同一短命BearerをSession/Culling/Asset全readに渡し、次巡でfresh Bearerと期待本人/tenant/edit roleを再照合する。token保持/表示なし、OS/RAW/Cloud/Final未接続、0/44。
- 2026-10-05 A Canvas Expand host非同期取消 Session追加: Aの再現調査でEditor overlay AbortSignal未伝達による遅延commit可能性が明確化。Aは`apps/web/src/editor-ui.mjs` Canvas節・`apps/web/src/session.mjs` Canvas Expand/commitRecipe取消限定節・新規専用試験を排他所有し、Escape/pointercancel/Asset切替時の非原子的補償Undoではなく事前AbortとCAS/operation確認で確定を防ぐ。B Original Shadow新runtime/C XMP/メインCullingはSessionに触れない。0/44維持。
- 2026-10-05 A Canvas Expand pending host取消: Aは四辺overlay既存接続を重複実装せず、関連90/90 PASSで返却。次は同じCanvas限定`apps/web/src/editor-ui.mjs`と新規専用試験を排他所有し、非同期`setCanvasExpansion`開始後のEscape/pointercancel/Asset切替で遅延書込や他写真反映を拒否/ロールバックできるかを確認する。欠陥があれば最小修正、無ければ試験証拠だけ提出。B Original Shadow新runtime/C XMP/メインCullingとは非重複、実Chrome/RAW/Cloudは後段、0/44維持。
- 2026-10-05 B Original Shadow手動二層mask runtime: BはNode typed保存Gateを専用6/6・関連安全22/22・build PASSで返却。次は新規`apps/web/src/processing/original-shadow-manual-runtime.mjs`と新規専用試験だけを排他所有し、保存されたsubject/shadow別strokeを原寸・Proxyへ再現して既存`applyBoundOriginalShadow`へ渡す。fresh本人/Asset/SHA/背景/Recipe版の証拠を要求し、自己申告を信用しない。Original/外側/alpha/入力不変、Abort/容量/別Asset拒否を確認。Worker/Editor/Final/Cloud・A Editor/C XMP/メインCulling clientは読取り専用、0/44維持。
- 2026-10-05 A Manual Canvas Expand四辺drag製品接続: AはNode Workspace Effect Preset命名段を専用5/5・関連安全18/18・build PASSで返却し排他解除。次はEV3-0701既存四辺overlay/drag部品を`apps/web/src/editor-ui.mjs`と必要最小`apps/web/src/editorial-editor.css`のCanvas Expand節、新規専用試験だけへ接続する。既存数値/Recipe/Worker契約は維持し、Pointer/Touch/Keyboard/Undo/Redo/保存再読込/合成Final/写真・Crop変化を照合。B Backend Original Shadow/C 新XMP/メインCulling client・mountは別ファイル。AI Auto Expand/実RAW/実Chrome/Cloudは別Gateで0/44。
- A着手前の重複訂正: 上記overlay→Session接続は既存。Aは二重実装せず、Crop変更/取消/版変化の未検証差分だけ監査し、欠陥がある場合のみ上記Canvas節を修正する。
- 2026-10-05 C Smart Culling XMP sidecar限定生成: CはDesktop↔iPad能力差の版付きread-only reportを新規7/7＋旧互換6/6・build PASSで返却し排他解除。次はEV3-0894下位EV3-0919の新規`apps/web/src/workspace-culling-xmp-sidecar.mjs`と新規専用試験だけを排他所有する。公式XMPの確認済みStars/Flag/色ラベルに限定し、明示一写真・本人認証済みNode Cullingのmark/preflight識別を受けるbyte generatorを作る。未確認マッピングは拒否、Original/RAW/metadata/OS保存/Final/Cloudは不変で元候補0/44。A Export命名/B Original Shadow/メインCulling client・verified mountは別ファイル。
- 2026-10-05 B Original Shadow Node保存Gate: Bは手動文書のsavedRevision永続化問題を修正し、保存JSONから除外・構築時だけfresh draft版を照合する専用6/6・関連17/17で排他返却。次は同候補の`apps/backend/src/photo-policy.ts`、`repository.ts`、`workspace.ts`のoriginalShadowManual限定箇所と新規専用Backend/HTTP試験のみをBが排他所有する。型/容量/unknown/偽出典、Trial/Node Workspace保存時に本人権限・対象/背景の実Asset/SHA・版CAS、写真固有Preset拒否、別Asset/失効/rollbackを検証。保存版は文書へ固定せず、現Cloud Worker/schema/Session/Editor/Finalは変更しない。A Export命名/C cross-deviceとは非重複、0/44維持。
- 2026-10-05 A Export naming適用Preset由来の認証済み文脈: AはAuthor Vignette-onlyを専用3/3・関連16/16・Session安全65/65・build PASSで提出し共有Session/Author排他返却。次は別独立候補EV3-0764の未接続`original-effect-preset`/`original-effect-custom`の前段として、新規`apps/web/src/workspace-effect-preset-naming.mjs`と新規専用JWT HTTP/SQLite試験だけを排他所有する。Node Workspaceのfresh本人/tenant/Asset/SHA/保存RecipeVersion/presetSnapshot/現在Preset版を読み、既存`resolveExportNamingContext`へ真正な情報を渡し、保存・適用済みPreset名称を発行する。catalog名だけ・target汚れ・branch・旧版・異tenant/role/失効・Original registry変更は拒否。UI/Final/OS名/Cloud/Trial Authorとの同一視をしない。B Original Shadow/C cross-device、既存Session/Editor/Backendは読取り専用、0/44維持。
- 2026-10-05 メイン Culling bearer redirect安全追補: CはWeb preflight client/Panel/mountを返却し別候補cross-device新規ファイルへ移動。メインのみ`apps/web/src/workspace-culling-client.mjs`と`workspace-culling-verified-mount.mjs`のHTTP request redirect/cache/referrer境界と新規専用試験を編集する。A/B/Cは当該client/mount読取り専用。Final/Backend/Cloudは変更せず0/44。
- 2026-10-05 C Desktop↔iPad能力差の保守的レポート: CはSmart Culling Web読取り専用preflightを専用4/4・関連Web Culling17/17・build PASSで提出し排他返却。次は別独立候補EV3-0873の第一段階として、新規`apps/web/src/cross-device-capabilities.mjs`と新規専用試験のみを排他所有する。実Web/Apple sourceを読取り照合し、Recipe/Presetのstage・extensionごとに能力証拠/未対応/未検証を版付き・両方向で報告する保守的データ-only preflightを実装。未対応フィールドを消さず、Renderer/認証/転送/実iPad接続をPASSにしない。A Author/B Original Shadow、既存`cross-device-compat.mjs`/Apple source/Backend/Cloudは読取り専用。0/44維持。
- 2026-10-05 B Original Shadow本人手動文書の第一段階: BはGlow Full SHA pinを実JWT HTTP/SQLite新6/6＋bundle1/1で提出し排他返却。次は独立候補EV3-0394の**本人指定限定**を進め、新規`apps/web/src/original-shadow-manual-recipe.mjs`と新規専用試験のみを排他所有する。既存`original-shadow.mjs`とAdd Shadow文書を参照し、subject/shadow別のnormalized stroke、同一Asset/Original SHA/原寸/保存版、明示背景/旧調整保持、容量上限・別Asset/偽出典拒否を持つtyped写真固有Recipe構築を実装する。本人申告だけを認証とせず、Backend保存Gate・Worker/Editor/Final・AI抽出は未接続と明示。A Vignette Author/C Culling、共有Session/Editor/Backend/Cloudは読取り専用。元候補0/44維持。
- 2026-10-05 A Author Vignette-only適用: AはAuthor portable 5値を現Trial Capture→Draft/採用→Library適用→Undo/Redo→CAS再読込・合成Finalまで専用3/3、関連154/154・build PASSで提出し排他返却。次は同候補EV3-0570の**明示Vignetteのみ適用**を既存Full Author適用と別に追加する。`apps/web/src/author-ui.mjs`、`preset-facade.mjs`、`session.mjs`のVignette限定箇所と新規専用試験のみをAが排他所有し、fresh公開Preset/対象保存Recipe/Original SHA・権限/版数を確認して5値だけmergeし、他調整・写真固有mask/RAW原本を保持、Undo/Redo→CAS保存/再読込→合成Final画素を確認する。旧Preset/失効/競合は無変更拒否、既存Full適用は保持。B Original Shadow新規文書/C Culling Web、Backend/Cloudは読取り専用。実Chromeは朝合図までNOT_RUN、0/44維持。
- 2026-10-05 C Culling preflightクライアント/Panel接続: CはNode読取り専用POST `culling/export-preflight`を`workspace.ts`/`workspace-server.ts`/新試験へ提出し、単体4/4・関連Backend/HTTP42/42・build PASSで排他返却。次は`apps/web/src/workspace-culling-client.mjs`、`workspace-culling-panel.mjs`、`workspace-culling-verified-mount.mjs`のpreflight限定箇所と新規専用Web/JWT HTTP試験のみ排他所有し、本人の明示選択に現在の集合版・各Asset SHA・保存Recipe版を添えてサーバの読取り専用preflightへ送る。返却`authoritativeForFinal:false`をUIでも厳守し、失効/選択変更/版不一致/一部失敗でplan破棄・成功表示なし。Final renderer接続やtoken保存をしない。A Author UI/Session/B Glow mount、Backend/Cloud/schemaは読取り専用。元候補0/44維持。
- 2026-10-05 A Author Vignette Session merge追加排他: Aの事前読取りで`apps/web/src/session.mjs`の`applyPortablePreset()`がglobals/postDecodeのみmergeしpostCropを落とす必須Gateと判明。現AのAuthor UI/Facade/Editor限定割当に、同`session.mjs`のportable Vignette限定mergeと新規専用試験だけを追加排他付与する。旧global/postDecode、写真固有mask/Crop/Rotation/RAW WB、Undo/Redo/Recipe/Final、版/権限を維持。B Glow mount/C Culling BackendはSession読取り専用。Cloudは編集しない。元候補0/44維持。
- 2026-10-05 B Glow Workspace Full SHA pin: BはCalibration host mountの明示Full/既定only、Full原本SHA pin、旧sparse/写真固有source拒否を実JWT HTTP/SQLite新6/6＋既存4/4で提出し排他返却。次は別候補EV3-0560 Mobile Glowの`apps/web/src/glow-workspace-preset-mount.mjs`と新規関連専用試験のみ排他所有し、Glow Full Applyから既存optional SHAを必須送信する。Full全置換/Glow-only保持、3モード×6値、旧sparse、Original/版/CAS/権限/写真固有source拒否を対象・安全試験で確認。A Author Vignette/C Culling、Backend/Client/他mount/Cloudは読取り専用。元候補0/44維持。
- 2026-10-05 A Vignette Author製品保存/適用経路: Aはpost-Crop Vignette 5値の任意Author portable契約を旧3値/postDecode・写真固有拒否保持で新5/5、Author/portable関連86/86、build PASS提出し3ファイル排他返却。次は`apps/web/src/author-ui.mjs`、`preset-facade.mjs`のVignette限定箇所、必要なら`apps/web/src/editor-ui.mjs`のAuthor/Vignette限定箇所、新規専用実Trial HTTP/SQLite試験のみ排他所有。本人の保存済みRecipeからVignette5値Capture→Draft保存/再読込→審査済みLibrary適用→Undo/Redo→CAS保存/再読込→Worker Finalへ通し、旧Preset/他調整/写真固有拒否/失効を守る。B Calibration mount/C Culling Backend、Preset型契約/Cloudは読取り専用。実Chromeは朝合図までNOT_RUN、元候補0/44維持。
- 2026-10-05 C Culling選択の読取り専用出力preflight: CはAsset集合版register/trash/restoreと旧Web試験追従をBackend7/7、Workspace安全31/31、Web Culling15/15、build PASSで提出し排他返却。次は`apps/backend/src/workspace.ts`、`workspace-server.ts`と新規専用Backend/HTTP試験のみ排他所有し、Node Workspace本人の明示Asset列を同transaction内でProject cullingVersion、export権限、各AssetのOriginal SHA/登録/非trash、保存Recipe head/版へ照合する読取り専用preflightを追加する。成功は後続Finalの権威・immutable snapshotでなく、その間の失効/変化で再照合要。bounded件数・重複/別tenant/版競合/失効/部分結果拒否と無書込を確認。Client/Panel/Session/Editor/Cloud/schemaは読取り専用。A Author portable/B Calibration mountと非重複。元候補0/44維持。
- 2026-10-05 B Calibration Workspace Full SHA pin: BはGrain host mountの明示Full全置換/既定only保持、Full原本SHA pin、旧sparse/写真固有source拒否を実JWT HTTP/SQLite新6/6＋既存4/4で提出し排他返却。次は別候補EV3-0586の`apps/web/src/calibration-workspace-preset-mount.mjs`と新規関連専用試験のみ排他所有し、Calibration Full Applyから既存optional SHAを必須送信する。Full全置換/Calibration-only保持、RGB原色Hue/Saturation6値、旧sparse、Original/版/CAS/権限/写真固有source拒否を対象・安全試験で確認。A Author portable/C Culling、Backend/Client/他mount/Cloudは読取り専用。元候補0/44維持。
- 2026-10-05 C Asset集合版に伴うCulling旧試験更新: Cの`workspace.ts` register/trash/restore同transaction版進行はBackend専用7/7・build PASS。初回登録で版0→1となり、旧Web Culling試験の固定0期待が陳腐化。Cへ`apps/web/tests/workspace-culling-client.test.mjs`、`workspace-culling-panel-filter-selection.test.mjs`、`workspace-culling-panel-manual-controls.test.mjs`の版期待・fixtureのみ追加排他とする（機能/安全assertは維持）。Web Culling群のメイン暫定実行7 PASS/8 FAILはこの3ファイルに限定、Cが新仕様に合わせ回復する。A Author portable/B Grain mountは当該試験読取り専用。他ソース/Cloudは現割当のまま。元候補0/44維持。
- 2026-10-05 A Vignette Author portable契約: AはCanvas寸法/比率の証明可能な表示を専用5/5・関連Canvas安全30/30・build PASSで提出しEditor/CSS排他返却。次は別候補EV3-0570の`apps/web/preset-policy.mjs`、`apps/web/src/preset-author/preset-author-contract.mjs`と新規専用試験のみ排他所有し、post-Crop Vignette 5値を写真固有でない任意Author portable Presetとして型/順序/旧版互換を検証する。既存postDecodeと旧3値保持、Crop/Rotation/RAW WB/写真固有mask/unknown拡張拒否、保存・適用・再読込/Finalへの次工程未接続を明示。B Vignette Workspace mount、C Culling Backend、Editor/Session/Cloudは読取り専用。元候補0/44維持。
- 2026-10-05 B Grain Workspace Full SHA pin: BはVignette host mountの明示Full/既定only、Full原本SHA pin、旧sparse・写真固有mask拒否を実JWT HTTP/SQLite新5/5＋既存5/5で提出し排他返却。次は別候補EV3-0528の`apps/web/src/grain-workspace-preset-mount.mjs`と新規関連専用試験のみ排他所有し、Grain Full Applyから既存optional SHAを必須送信する。Full全置換/Grain-only保持を混同せず、旧sparse、7値/seed、Original/版/CAS/権限/写真固有source拒否を対象・安全試験で確認。A Canvas/C Culling、Backend/Client/他mount/Cloudは読取り専用。元候補0/44維持。
- 2026-10-05 C Culling Asset集合版境界: CはNode手動絞込/明示選択を実JWT HTTP/SQLite4/4、Culling関連15/15・合成Chrome390pxで提出しPanel/新試験排他返却。二度走査はregister/trash/restore AssetでcullingVersionが進まないため非原子的と判定。次は`apps/backend/src/workspace.ts`のAsset登録/ゴミ箱/復元とCulling版境界のみ、関連Backend/HTTP専用試験だけを排他所有し、同transactionでProjectの集合変化をCulling版へ反映し、旧snapshot/CAS拒否・別tenant/権限/失敗時無変化・旧DB互換を確認。API/schema/Cloud/Client/Panel/Session/Editorは読取り専用。B Vignette mount/A Canvas UIと非重複。サーバ版だけでExport対象権限/SHAの権威証拠は完成しないためFinalにはまだ接続しない。元候補0/44維持。
- 2026-10-05 B Vignette Workspace Full SHA pin: BはLevels host mountのFull SHA必須送信・旧sparse Full互換・Levels-only維持を実JWT HTTP/SQLite専用7/7・Web1270/1270で提出し新2ファイル排他返却。次は別候補EV3-0570の`apps/web/src/vignette-workspace-preset-mount.mjs`と関連新規専用試験のみ排他所有し、Full Applyへ既存optional SHA pinを必須送信する。5値Full/onlyと旧sparse、Original/他調整/写真固有mask、SHA/版/権限/失効を対象・安全試験で確認。B以外は同mount読取り専用。A Canvas Editor/C Culling、Backend/Client/他Preset mount/Cloudは読取り専用。元候補0/44維持。
- 2026-10-05 A Canvas Expand寸法・比率の実表示: Aは四辺overlayを製品Editorへ接続し、合成非RAW実Chromeの四辺操作/Undo・Redo/保存・再読込/Worker Final/2 Asset切替・期限切れ拒否、専用2/2・全Web1263/1263で共有Editor排他を返却。次は同じEV3-0701の`apps/web/src/editor-ui.mjs`とCanvas専用CSS、新規専用試験のみ排他所有し、実保存/Preview/Finalで検証可能なCrop後寸法＋四辺余白から出力幅高さと比率を安全に計算してUI表示する。After/Before/Asset/Crop/Undo・Redo/Resetで更新し、未証明寸法は表示しない。既存Recipe/Undo/Final契約と他調整を維持。B Levels mount/C Culling、Session/Worker/Backend/Cloudは読取り専用。元候補0/44維持。
- 2026-10-05 B Levels Workspace Full SHA pin: Bはoptional Full Apply Asset SHA同transaction照合とSelective mount送信を実JWT HTTP/SQLite4/4・Backend199/199・Web1263/1263で提出しBackend/Client/Selective mount排他返却。次は別候補EV3-0492の`apps/web/src/levels-workspace-preset-mount.mjs`と新規/関連専用試験のみ排他所有し、既存optional SHA fieldをLevels Full Applyから必ず送る。実JWT HTTP/SQLiteで原本変更/版競合/失効時branch 0、Levels-onlyと旧sparse Fullの互換性を確認。他Preset mount一斉変更・Backend/Client/Session/Editor/CSS/Cloudは対象外。A Canvas/C Cullingは別ファイル。元候補0/44維持。
- 2026-10-05 B Workspace Full Preset原本SHA原子的照合: BはSelective host注入mount専用5/5・全Web1257/1257を提出し新2ファイル返却。Full Apply旧routeはRecipe CAS版固定だがOriginal SHAが同transactionでpinされない残GateをBが検出。次は`apps/backend/src/workspace.ts`、`workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`、`apps/web/src/selective-workspace-preset-mount.mjs`、必要な関連専用試験のみ排他所有し、Full Applyへoptional `expectedOriginalSHA256`を追加して新mountから必ず送り、同transactionのAsset SHA照合・CAS・Preset版固定を検証。旧HTTP/client契約は壊さず、SHA未指定旧呼出しを新保証PASSとは呼ばない。他Preset mount波及は別判定。A Canvas Session/Editor、C Culling panel、Cloudは読取り専用。元候補0/44維持。
- 2026-10-04 C Smart Culling手動絞込・明示選択: CはcolorLabel保存・Segment改名/並替とfresh読戻しを`workspace-culling-panel.mjs`に提出し、実JWT HTTP/SQLite3/3・実Chrome合成Desktop/Mobile・全Web1252/1252 PASSで排他返却。次は同一候補EV3-0894の`apps/web/src/workspace-culling-panel.mjs`と必要な新規専用試験のみ排他所有し、保存済みProject pageのStars/Flags/Color/Segmentによる手動絞込と明示Asset選択を実UIへ追加する。全ページ/版数/tenant/本人・失効/競合を再検証し、未確認の選択をFinal対象にしない。AI品質/顔/類似cluster/XMPやTrial/Cloud接続は実装済み扱いしない。A Session/Editor、B Selective mount、Backend/Client/Bootstrap/CSS/Cloudは読取り専用。元候補0/44維持。
- 2026-10-04 B Selective Color Workspace Preset host mount: Bは9色域×CMYK4値・2方式のPersonal/Workspace full Save→Reload→Applyと原子的Selective-onlyを専用実JWT HTTP/SQLite4/4・Backend199/199・Web1249/1249で提出し、Backend/Client4ファイルの排他を返却。次は新規`apps/web/src/selective-workspace-preset-mount.mjs`と新規専用試験のみ排他所有し、host注入型Presetのfresh本人/tenant/membership/role/Asset SHA・Recipe/Preset版GateからSelective-only routeへ接続する。現製品OIDC host/Bootstrap自動mount・実Chrome/RAW/Cloudは別Gate。既存Backend/Client/Bootstrap/Session/Editor/CSS、A Canvas/C Cullingは読取り専用。元候補0/44維持。
- 2026-10-04 A Manual Canvas Expand製品接続: Aは四辺overlay独立UIを専用Node2/2・実Chrome合成Desktop/Mobile・全Web1245/1245で提出し、overlay/CSSの排他を返却。次は別候補EV3-0701の`apps/web/src/session.mjs`、`apps/web/src/editor-ui.mjs`のCanvas限定箇所、必要な新規専用試験のみ排他所有し、既存edge変換＋overlayを実Editorへ接続する。保存済みRecipe/Undo・Redo/Preview・Final/Asset切替・権限失効を確認し、現値契約と他調整を保持。B Selective Preset/C Culling panel、Worker/Backend/Cloudは読取り専用。製品未接続時点で0/44、実RAW/実機/Cloudは別Gate。
- 2026-10-04 B Selective Color Workspace Preset経路: BはLevels host mount専用4/4・関連9/9を提出し新2ファイル返却。次は別候補EV3-0501の`apps/backend/src/workspace.ts`、`workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`と新規専用試験のみ排他所有し、9色域CMYK4値/2modeのPersonal/Workspace full Save→Reload→Applyと必要ならSelective-only版固定原子的適用を実JWT HTTP/SQLiteで確認。旧Preset/他調整/Original/photo-bound拒否/本人/Asset SHA/CAS/権限を維持。A Canvas UI/C Culling panel、Session/Editor/Cloudは読取り専用。現Node OIDC host/実Chrome/RAWは別Gate、元候補0/44維持。
- 2026-10-04 C Smart Culling手動UI: CはDNG撮影日命名の単写真/Batch限定製品経路を専用4/4・関連12/12・Web1241/1241で提出し、共有Session/Editor/命名ファイルの排他を返却。次は別候補EV3-0894の`apps/web/src/workspace-culling-panel.mjs`と新規専用試験のみを排他所有し、既存Node Backend/ClientのcolorLabelとSegment rename/reorderを手動UIへ接続する。実JWT HTTP/SQLiteの本人/tenant/role/CAS/選択Asset、Keyboard/Touch/focus、失効・競合を検証。Backend/Client/Bootstrap/Session/Editor/CSS、A Canvas/B Levels、Cloudは読取り専用。AI機能・元候補全要素は未完了。
- 2026-10-04 B Levels Workspace Preset host mount: Bは4ch×5値full Save/Reload/Applyと原子的Levels-onlyを実JWT HTTP/SQLite専用5/5・Backend199/199で提出しBackend/Client排他を返却。次は新規`apps/web/src/levels-workspace-preset-mount.mjs`と新規専用試験のみ排他所有し、host注入型Presetのfresh本人/tenant/membership/role/Asset SHA・Recipe/Preset版GateからLevels-only routeへ接続する。現製品Node OIDC host/実Chrome/RAW別Gate。既存Bootstrap/Session/Editor/CSS/Backend/Client、A Canvas/C Export namingは読取り専用。メインは全Web再実行と台帳、元候補0/44維持。
- 2026-10-04 C Export naming旧試験更新: Cの新方式で旧`apps/web/tests/export-batch-manifest.test.mjs`の未対応assert、`apps/web/tests/export-naming-ui.test.mjs`の撮影日限定publish/validation期待が陳腐化。Cへ両既存試験の該当assertだけ追加排他を渡し、証拠無し拒否・全Final完了前0リンク・旧4方式維持を確認。安全拒否を緩めずCが全Web再実行する。A Canvas/B Levelsは2試験読取り専用、メインは統合回帰。
- 2026-10-04 A Canvas Expand edge overlay UI: Aは新規edge drag変換部品を専用8/8・Web1230/1230で提出し新2ファイルを返却。次は新規`apps/web/src/canvas-expand-edge-overlay.mjs`と新規専用試験、`apps/web/src/editorial-editor.css`のCanvas専用スタイルのみ排他所有し、After写真の四辺handleから既存変換部品を呼ぶPointer/Touch/Keyboard/focus/44px/reduced-motion/失敗復元を確認する。共有Session/EditorはC Export naming所有、B Levels Backend/Client、Worker/Recipe/Cloudは読取り専用。製品mount/保存/Final前に元候補0/44維持。
- 2026-10-04 C Export naming DNG撮影日製品経路: CはVignette Workspace host mount専用5/5・Web1221/1221を提出し新2ファイルを返却。現Node OIDC host未接続は保留し、別候補EV3-0764の`capture-date-original`を担当する。Cのみ`apps/web/src/export-naming-context.mjs`、`export-batch-manifest.mjs`、`session.mjs`、`editor-ui.mjs`の該当箇所と新規専用試験を排他所有し、既存DNG Exif offset付きDateTimeOriginal fresh Trial Gateで本人/Asset/SHA/版/export権限を証明した場合だけ単写真/Batch Finalに明示接続する。offset無し/非DNG/部分Batch結果は拒否、自動ダウンロードしない。B Levels Backend/Client、A Canvas部品、Cloudは読取り専用。元候補0/44維持。
- 2026-10-04 B Levels Workspace Preset経路: BはHistogram左右別clip製品Session/UI/CSSを全Web1222/1222で提出し共有3ファイルを返却、実Chrome/RAWはNOT_RUN。次は別候補EV3-0492 Levelsの`apps/backend/src/workspace.ts`、`workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`と新規専用試験のみ排他所有し、RGB共同/R/G/B各5値のPersonal/Workspace full Save→Reload→Applyと必要なLevels-only版固定原子的適用を実JWT HTTP/SQLiteで確認する。旧Recipe/Glow/Grain/Calibration/Vignette/photo-bound拒否、他調整/Original/本人/Asset SHA/CAS/権限を保持。C Export naming共有Session/UI、A Canvas新規ファイル、Cloudは読取り専用。現OIDC host/実Chrome/RAWは別Gate、元候補0/44維持。
- 2026-10-04 A Manual canvas Expand edge drag部品: AはMakeup Highlight独立UIを専用3/3・実Chrome Desktop/Mobile・Web1214/1214で提出し新2ファイルを返却。自動要所選択/fresh人物Gate/製品Finalの未実装は維持。BがSession/Editor/CSSをHistogramで所有する間、Aは別候補EV3-0701の新規`apps/web/src/manual-canvas-expand-edge-drag.mjs`と新規専用試験のみを排他所有し、既存四辺数値契約へ直接edge drag/keyboard/touchの安全な値変換を実装する。既存Session/Editor/CSS/Worker/Recipe/Backend/CloudとB/Cは読取り専用。製品接続前は元候補0/44維持。
- 2026-10-04 C Vignette Workspace Preset host mount: Cは5値Personal/Workspace full Save/Reload/Applyと原子的Vignette-only、写真固有Teeth/Makeup maskのPreset拒否を実JWT HTTP/SQLite6/6・Backend199/199・Web1214/1214で提出し、Backend/Client排他を返却。次は新規`apps/web/src/vignette-workspace-preset-mount.mjs`と新規専用試験のみ排他所有し、既存host注入型Presetのfresh本人/tenant/membership/role/Asset SHA・Recipe/Preset版GateへVignette-only routeを接続する。既存Bootstrap/Session/Editor/CSS/Backend/Client、A Makeup/B Histogramは読取り専用。現Trial/Cloud OIDC host・実Chrome/RAWは別Gate、元候補0/44維持。
- 2026-10-04 C Vignette Workspace Preset経路: CはTeeth fresh Trial Gate専用5/5・Web1202/1202を提出し新module/試験を返却。現製品には認証済みperson inventoryがなくTeethはfail-closedのまま。次は別候補EV3-0570を一貫担当し、`apps/backend/src/workspace.ts`、`workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`と新規専用試験のみを排他所有する。Vignette5値のPersonal/Workspace Save→Reload→Apply、必要なVignette-only原子的版固定適用、本人/Asset SHA/CAS/権限と他調整保持を実JWT HTTP/SQLiteで確認。既存Preset/Recipe/Feature Gate不変。共有Session/Editor/CSSはB所有、A Makeup UI、Cloudは読取り専用。メインは排他・台帳・統合回帰、元候補0/44維持。
- 2026-10-04 A Makeup Highlight独立UI部品: Aはtyped Recipeとstroke mask runtime専用6/6・Web1197/1197を提出し新規module/試験を返却。次は新規`apps/web/src/manual-makeup-highlight-ui.mjs`と新規専用試験のみを排他所有し、本人手描きADD/ERASE・Intensity・取消/再実行・Touch/Pointer/Keyboard/focusを既存typed契約へ合わせる。実host callbackが無ければ保存/適用可能に見せず、UI自己申告を認証にしない。共有Session/Editor/CSSはB Histogram所有、Worker/Backend/CloudとC Teethも読取り専用。メインは排他・台帳・統合回帰、元自動Highlightは未完了。
- 2026-10-04 B Histogram左右clip製品接続: BはFacial Expression口元topology inventory専用4/4・Web1191/1191を提出し新2ファイルを返却。姿勢/遮蔽の信頼証拠がなく元表情機能はfail-closedのまま。次は別の独立候補LR-02を一貫して担当し、`apps/web/src/session.mjs`、`apps/web/src/editor-ui.mjs`、`apps/web/src/editorial-editor.css`のHistogram限定箇所と新規専用試験を排他所有する。左右clip個別click/再click、J一括、Before/asset切替、Keyboard/focus/44px、既存5領域調整のUndo/Redo/保存/再読込/Final非混入を確認。A Makeup/C Teethは共有3ファイル読取り専用。実Chrome/RAWは別Gate、メインは排他・台帳・統合回帰。
- 2026-10-04 C Teeth fresh Trial Gate: Cは手動stroke mask runtime専用5/5・Web1187/1187を提出し新module/試験の排他を返却。次は新規`apps/web/src/manual-teeth-trial-gate.mjs`と新規専用実Trial HTTP/SQLite試験のみを排他所有する。fresh本人/対象Asset/SHA/保存Recipe版/編集・書出し権限と、既存APIから証明できる場合のみpersonIDの一意性を照合。証拠不足ならfail-closedで報告し、caller自称を認証にしない。既存Session/UI/Worker/Backend/Cloud、A Makeup/B Facial Expressionは読取り専用。製品未接続、元候補0/44維持。
- 2026-10-04 A Makeup Highlight stroke mask runtime: Aはtyped `makeupHighlightManual`契約と旧監査追補をBackend199/199・Web1182/1182で提出し4ファイルの排他を返却。次は新規`apps/web/src/processing/manual-makeup-highlight-mask-runtime.mjs`と新規専用試験のみを排他所有し、normalized ADD/ERASE strokeから原寸/Proxy別maskを生成する。Asset/SHA/person/保存版/寸法/target・Abort/仕事量を厳格照合し、caller自称認証は信用しない。既存Session/UI/Worker/Backend/CloudとB Facial Expression/C Teethは読取り専用。メインは排他調整・台帳・統合回帰、元候補完了数は増やさない。
- 2026-10-04 B Facial Expression read-only口元inventory: BはEV3-0243監査4/4を提出し文書/試験排他を返却済み。次は新規`apps/web/src/processing/facial-expression-mouth-inventory.mjs`と新規専用試験のみを排他所有し、公式MediaPipeトポロジーで根拠のある口角/上唇landmarksを、明示Asset/person/Original SHA/model SHA/原寸へread-only束縛する。曖昧・欠落/不明姿勢・モデルずれは拒否。既存`faces.mjs`/Session/UI/Recipe/Worker/Backend、A Makeup/C Teethは読取り専用。現製品接続・幾何処理/AI生成は別Gateで完了数は増やさない。メインは回帰・台帳。
- 2026-10-04 A Makeup Highlight監査期待更新: Aのtyped `makeupHighlightManual`で旧`apps/web/tests/makeup-highlight-completion-audit.test.mjs`の偽キー受理期待が陳腐化するため、Aへ同監査試験と`docs/MAKEUP_HIGHLIGHT_COMPLETION_AUDIT.md`の追補を追加排他割当する。`photo-policy.ts`/新規専用試験もA所有のまま、認証/保存/Worker/Final/元自動Highlight未実装は残す。B Facial Expression監査/C Teeth mask runtimeは読取り専用。メインは全回帰・台帳。
- 2026-10-04 A Makeup Highlight typed Recipe契約: Aは手動Highlight純粋部品7/7を提出し新module/試験排他を返却。次は`apps/backend/src/photo-policy.ts`と新規専用試験のみを排他所有し、optional typed `makeupHighlightManual`にAsset UUID/Original SHA/person/原寸、bounded normalized ADD/ERASE strokesとIntensityを厳格検証する。Bitmap/自称認可/保存revisionは入れず、旧Recipe v1/他拡張/処理順を保持し未知Highlight偽キーを拒否。既存Session/UI/Worker/Repository/Cloud、B Facial Expression監査/C Teeth mask runtimeは読取り専用。構造契約だけで元自動Highlight完了に数えない。メインは回帰・台帳。
- 2026-10-04 B Facial Expression監査: BはCalibration Workspace mount専用4/4を提出し、新module/試験の排他を返却。次は独立候補`EV3-0243 Facial Expression`の元下位操作と現SUITE Face/Portrait/Recipe/Finalの意味差を新規`docs/FACIAL_EXPRESSION_COMPLETION_AUDIT.md`と新規専用試験のみで照合する。既存製品source、A Makeup契約、C Teeth mask runtimeは読取り専用。監査だけで元候補完了を増やさない。メインは回帰・判定。
- 2026-10-04 C Teeth stroke mask runtime: Cはtyped `teethManual`構造検証/旧監査更新をBackend194/194・Web1178/1178で提出し、`photo-policy.ts`等4ファイルの排他を返却済み。次は新規`apps/web/src/processing/manual-teeth-mask-runtime.mjs`と新規専用試験のみを排他所有し、正規化ADD/ERASEストロークを原寸/1600px Proxyごとに再ラスタ化して既存手動歯画素部品へ渡せるmaskを生成する。Asset/Original SHA/person/保存版/寸法/targetと仕事量/Abortを検証し、認証自称値をtrustしない。既存Recipe/Session/UI/Worker/Backend/Cloud、A Makeup pure/B Calibration mountは読取り専用。製品Gate前は未完了、メインは回帰・台帳。
- 2026-10-04 C Teeth監査期待更新: Cのtyped `teethManual`構造検証で旧`apps/web/tests/teeth-completion-audit.test.mjs`の「偽`teeth`キーをNodeが受理する」期待が陳腐化。Cへ同監査試験と`docs/TEETH_COMPLETION_AUDIT.md`の後続追補を追加排他割当する。`photo-policy.ts`/新規専用試験もC所有のまま、認証/保存/Worker/Final未接続と元AI Teeth未実装を維持。A Makeup pure/B Calibration mountは読取り専用。メインは全回帰・台帳。
- 2026-10-04 B Calibration Workspace Preset host mount: BはCalibration full/only Presetの実JWT HTTP/SQLite5/5とBackend189/189・Web1167/1167を提出し、Workspace Backend/Clientの排他を返却。次は新規`apps/web/src/calibration-workspace-preset-mount.mjs`と新規専用試験だけを排他所有し、host注入型Workspace Presetのfresh本人/tenant/membership/role/Asset SHA・Recipe/Preset版GateからCalibration-only routeへ接続する。既存Bootstrap/Editor/Session、Backend/Client、A Makeup pure、C Teeth契約は読取り専用。現Trial/Cloud OIDC host・実Chrome/RAWは別Gate、完了数は増やさない。メインは回帰・台帳。
- 2026-10-04 A Makeup Highlight手動限定純粋部品: AはEV3-0001監査4/4を提出し文書/試験排他を返却。次は新規`apps/web/src/processing/manual-makeup-highlight.mjs`と新規専用試験のみを排他所有し、既存Local Levels画素核を再利用して本人明示の顔ハイライトmask領域だけIntensityを適用する。Asset/Original SHA/person/保存版/寸法/role出典、mask外RGB/alpha/hidden RGB/入力不変、曖昧mask/別Asset/中断拒否を検証。既存Recipe/Session/UI/Backend/Worker、B Workspace Preset/C Teeth契約は読取り専用。元AI自動Highlight完了とは数えない。メインは回帰・台帳。
- 2026-10-04 C Teeth手動限定Recipe契約: Cは新規`manual-teeth-whitening.mjs`純粋部品7/7を提出し、同module/試験の排他所有を返却済み。次は`apps/backend/src/photo-policy.ts`と新規専用試験のみを排他所有し、Bitmap/認可自称値を含まないoptional typed `teethManual`にAsset UUID/Original SHA/原寸/person・bounded normalized strokes/明るさ・脱彩度を厳格検証する。旧Recipe v1/他拡張/処理順を維持し、未知`teeth`の偽実装を拒否する。既存Session/UI/Worker/Repository/Cloud、A Makeup監査、B Workspace Presetは読取り専用。契約だけで元候補完了に数えない。メインは回帰・台帳。
- 2026-10-04 B Calibration Workspace Preset境界: BはCalibration-only Session/UIと旧監査更新を専用8/8・全Web1151/1151で提出し、共有2ファイルの排他を返却済み。次は`apps/backend/src/workspace.ts`、`apps/backend/src/workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`と新規専用試験のみを排他所有し、現Personal/Workspace PresetのCalibration6値保存/再読込/適用を実JWT HTTP/SQLiteで確認する。既存全Recipeで満たす部分は重複実装せず、必要なCalibration-only適用だけ同一transaction/本人・Asset SHA・版/CASで最小追加。旧全Recipe/Glow/Grain/写真固有拒否を維持。A Makeup監査/C Teeth pure/共有Editor/Cloudは読取り専用。メインは回帰・台帳。
- 2026-10-04 A Makeup Highlight次候補: AはGrain Workspace mount専用3/3を提出し、新規mount/専用試験の排他所有を返却。次は独立候補`EV3-0001 Makeup / Highlight`の元操作・現Portrait/Face/Local調整との差を新規`docs/MAKEUP_HIGHLIGHT_COMPLETION_AUDIT.md`と新規専用試験だけで監査する。既存製品source、B Calibration Session/UI、C Teeth pureは読取り専用。メインは全回帰・判定、監査だけで元候補完了を増やさない。
- 2026-10-04 B Calibration監査更新: Bの製品Session/UI接続で旧`apps/web/tests/color-calibration-completion-audit.test.mjs`の未接続assertが陳腐化。Bへ同監査試験と`docs/COLOR_CALIBRATION_COMPLETION_AUDIT.md`の後続追補を追加排他割当。共有Session/UIのCalibration接続は引き続きB所有、A Grain mount/C Teeth純粋部品は読取り専用。実Chrome/製品Preset scope/実RAW/Cloud Gateを残す。メインは全回帰・台帳。
- 2026-10-04 C Teeth手動限定純粋部品: CはEV3-0235監査3/3を提出し、監査文書/試験排他を返却済み。次は新規`apps/web/src/processing/manual-teeth-whitening.mjs`と新規専用試験のみを排他所有し、本人が明示した歯maskの出典/Asset UUID/Original SHA/寸法/版を検証して明るさ・脱彩度をmask内の8-bit画素へ適用する。mask外RGB、alpha/hidden RGB/Original不変、別Asset/曖昧mask/中断拒否を検証。既存Recipe/Session/UI/Backend/Worker、A Grain mount/B Calibration UIは読取り専用。純粋部品のみで元AI Teeth全体完了に数えない。メインは回帰・台帳。
- 2026-10-04 B Calibration-only Sync製品接続: BはGrain-only Session/UI・旧監査更新を専用8/8・全Web1139/1139で提出し、共有`apps/web/src/session.mjs`/`apps/web/src/editor-ui.mjs`の排他を返却済み。次はBが同2ファイルのCalibration-only限定箇所と新規専用Session/UI/Browser試験のみを排他所有し、既存`batch-calibration-sync.mjs`を製品操作へ接続する。保存済みsource/明示2〜20対象、未保存draft、本人/Asset/SHA/版/CAS/他Recipe/Original保持、競合/失効/partial、UI→保存/再読込→Finalを確認。A Grain mount/C Teethは共有2ファイル読取り専用。メインは回帰・台帳、実Chrome不可はNOT_RUN。
- 2026-10-04 A Grain Workspace Preset host mount: AはGrain全Preset/Grain-onlyの実JWT HTTP/SQLite5/5、Backend189/189を提出し、`workspace.ts`/`workspace-server.ts`/`workspace-preset-client.mjs`の排他所有を返却済み。次は新規`apps/web/src/grain-workspace-preset-mount.mjs`と新規専用試験のみを排他所有し、既存host注入型Presetの本人・tenant・membership/role・Asset/Preset版GateにGrain-only routeを安全に接続する。既存Bootstrap/Editor/Session/Glow mount/Backend/Client、B共有Grain UI、C Teethは読取り専用。現Trial/Cloud OIDC host・実RAWは別Gate、完了数は増やさない。メインは回帰・台帳。
- 2026-10-04 B Grain監査期待更新: BのGrain-only Session/UI製品接続で旧`apps/web/tests/grain-completion-audit.test.mjs`の未接続assertが陳腐化。Bに同試験と`docs/GRAIN_COMPLETION_AUDIT.md`の追補を追加排他割当し、専用Browser fixture後に更新する。接続済み事実と実Chrome/Personal/Workspace/実RAW/Cloudの未確認Gateを分ける。共有Session/UIのGrain接続は引き続きB所有。A Backend/C Teethは読取り専用。メインは全回帰・台帳。
- 2026-10-04 C Teeth次候補: CはEV3-0993 Clothing Moiré監査3/3を提出し、文書/試験の排他を返却。次は独立候補`EV3-0235 Teeth`の元下位操作・実処理と現Face/Portrait/Editor/Recipe/Finalの差を、新規`docs/TEETH_COMPLETION_AUDIT.md`と新規専用試験のみで照合する。既存製品source、A Backend、B共有Session/UI・Grain監査は読取り専用。監査結果から安全な非AI小経路があれば別割当で実装し、監査だけで元候補完了を増やさない。
- 2026-10-04 B Grain-only Sync製品接続: CのSelective Color-only製品Session/UIと監査試験をメイン全Web1110/1110で検証し、Cの共有ファイル編集を停止して排他を返却する。Bは`apps/web/src/session.mjs`/`apps/web/src/editor-ui.mjs`のGrain限定箇所と新規専用Session/UI/Browser試験のみを排他所有し、既存`batch-grain-sync.mjs`を保存済みsource/明示2〜20 targetの製品操作へ接続する。未保存draft、本人・Asset/SHA/版/CAS、他Recipe/Original保持、失効/競合/partial表示、UI→保存/再読込→Finalを確認。A Backend/C監査は共有2ファイル読取り専用。実Chrome不可ならNOT_RUNを維持し、元候補完了に数えない。メインは独立回帰・台帳。
- 2026-10-04 C Clothing Moiré監査: CはSelective Color-only製品Session/UI・監査更新を提出し、共有2ファイルをBへ返却。次は独立候補`EV3-0993 Clothing Moiré Removal`の元領域検出/Generate/衣服質感保持/保存/Finalと現Detail/AIの差を、新規`docs/CLOTHING_MOIRE_COMPLETION_AUDIT.md`と新規専用試験のみで照合。既存製品source、A Backend、B共有Session/UIは読取り専用。監査だけで元候補完了を増やさない。
- 2026-10-04 A Grain Workspace Preset境界: AはPerfect Shotのfail-closed候補窓8/8を提出し、同新規module/試験の排他を返却済み。次は`apps/backend/src/workspace.ts`、`apps/backend/src/workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`と新規専用試験のみを排他所有し、Grain7値＋seedの現Personal/Workspace Preset保存→再読込→適用を実JWT HTTP/SQLiteで確認する。既存経路で満たすものは重複実装せず、足りないGrain-only適用のみ必要なら既存Glow-only並の同一transaction/版/本人/権限/Asset-SHA拘束で最小追加する。旧全Recipe/Glow/Portrait/写真固有拒否を維持。C Session/UI、B Calibration、Cloudは読取り専用。メインは統合回帰と完了判定。
- 2026-10-04 B Calibration-only Sync独立部品: BはEV3-0595 Personalized AI Look監査4/4を提出し、文書/試験の排他所有を返却済み。Cが共有Session/UIを所有する間、Bは新規`apps/web/src/batch-calibration-sync.mjs`と新規専用純粋/実Trial HTTP・SQLite試験のみを排他所有する。保存済みsourceの`postDecodeAdjustments.color.calibration`6値だけを明示2〜20 targetへmergeし、他調整・写真固有設定・Originalを保持、本人/権限/Asset SHA/版/CAS/失効/partialを確認する。既存Session/UI/Backend/Cloud・A Perfect Shot/C Selectiveは読取り専用。製品接続前は元候補完了に数えない。
- 2026-10-04 A Perfect Shot候補窓: AはEV3-0921監査3/3・関連31/31を提出し、監査文書/試験の排他所有を返却済み。次は新規`apps/web/src/perfect-shot-candidate-window.mjs`と新規専用試験だけを排他所有し、認証済みProjectの明示対象周辺最大7枚についてAsset/Original SHA/保存版・順序証拠を固定する読み取り専用計画を実装する。本人/所属/順序の証拠が既存APIに無ければ拒否し、顔交換/Auto Fixの成功や元候補完了を主張しない。既存Session/UI/Backend/C所有Selective/B所有Personalized AI Lookは読取り専用。メインは統合回帰・台帳。
- 2026-10-04 B Personalized AI Look次候補: BはEV3-0873 Desktop↔iPad compatibility監査4/4を提出し、監査ファイルの排他所有を返却済み。Cが共有Session/UIをSelective-only Syncとして所有する間、独立候補`EV3-0595 Personalized AI Look`の元下位操作、現SUITE Look/Recipe/Preset/AI編集との差を新規`docs/PERSONALIZED_AI_LOOK_COMPLETION_AUDIT.md`と新規専用試験のみで照合する。既存製品source、A Perfect Shot/C Selectiveは読取り専用。メインは独立回帰・完了判定。
- 2026-10-04 A Perfect Shot次候補: Aは汎用Batchの既存target Portrait無警告消去を修正し、実Trial HTTP/SQLite・全Web1099/1099を提出、`batch-edit.mjs`/専用試験の排他所有を返却済み。次は独立候補`EV3-0921 Perfect Shot`の元下位操作と現SUITEのCulling/編集/Finalとの差を新規`docs/PERFECT_SHOT_COMPLETION_AUDIT.md`と新規専用試験のみで照合する。既存製品source、B iPad互換/C Selectiveは読取り専用。メインは独立回帰・完了判定を行う。
- 2026-10-04 B Desktop↔iPad compatibility次候補: BはEV3-1058 Detail Enhance監査4/4を提出し、監査ファイルの排他所有を返却済み。共有Session/UIはC所有中のため、追加独立候補`EV3-0873 Desktop ↔ iPad compatibility`のWeb/Desktop・Apple/iPad・Recipe/Preset/Original/Proxy/Final・Workspace/Storage契約と未接続範囲を新規`docs/DESKTOP_IPAD_COMPAT_COMPLETION_AUDIT.md`と新規専用試験のみで照合する。既存製品source、A Batch/C Selectiveは読取り専用。メインは独立回帰・完了判定を行う。
- 2026-10-04 C Selective Color監査回帰更新: CはSelective Color-only製品Session/UIと専用5試験を提出し、既存`apps/web/tests/selective-color-completion-audit.test.mjs`の未接続assertが旧状態になったため、同試験と`docs/SELECTIVE_COLOR_COMPLETION_AUDIT.md`の後続追補も追加排他所有する。旧危険挙動を新しい正直な製品接続証拠へ更新し、実Chromeが不可ならNOT_RUNを維持。共有Session/Editorはこの修正・全Web回帰が終わるまでC所有、A Batch Edit/B Detail Enhanceは読取り専用。メインは独立回帰・完了判定。
- 2026-10-04 A Batch target写真固有設定保護: AはEV3-0934監査でtarget Portraitの無警告消去を再現し、次は`apps/web/src/batch-edit.mjs`と新規専用安全/Trial HTTP試験のみを排他所有する。targetに既存Portrait/BW Edge Manual/Add Shadow Manualがある場合、全Recipe置換の前に当該targetを拒否して既存保存Recipe/Originalを維持し、別targetの結果分類を正直に報告する。共有`session.mjs`/`editor-ui.mjs`はC所有、B Grain/Backend/Cloudは読取り専用。メインは独立回帰・完了判定。AI People Removalの実装とは区別する。
- 2026-10-04 B Detail Enhance次候補: BはGrain-only Sync独立部品とTrial8/8を提出し、その新規ファイルの排他所有を返却済み。共有Session/UI接続はCのSelective Color排他返却後にメインが割当する。次は追加独立候補`EV3-1058 Detail Enhance`の元下位操作と現SUITE Clarity/Texture/Sharpen/Denoise等の重複・固有差を新規`docs/DETAIL_ENHANCE_COMPLETION_AUDIT.md`と新規専用試験のみで照合する。既存製品source、A Batch Edit/C Selective Colorは読取り専用。メインは独立回帰・完了判定。
- 2026-10-04 A Batch Edit次候補: AはLR-02監査と専用試験を提出し、監査ファイルの排他所有を返却済み。Cが共有Session/EditorをSelective Syncで所有する間、独立候補`EV3-0934 Batch Edit`の元下位操作と認証付き全Recipe Batch、権限/版、写真固有拒否、UI→保存/Finalを新規`docs/BATCH_EDIT_COMPLETION_AUDIT.md`と新規専用試験のみで照合する。既存製品source、B Grain/C Selectiveは読取り専用。メインは独立回帰・完了判定を行う。
- 2026-10-04 C Selective Color限定Sync製品接続: Cは純粋merge＋実Trial HTTP/SQLite 8/8を提出済み。Aは共有Session/Editorを返却したため、Cに`apps/web/src/session.mjs`/`apps/web/src/editor-ui.mjs`のSelective Color専用箇所と新規専用Session/UI/Browser試験を排他割当する。target未保存draft、保存済みsource/明示2〜20対象、本人権限・Asset-SHA/版・CAS、他設定/Original保持、競合/失効/部分結果、UI→保存/再読込→Finalを検証。A Histogram監査/B Grain部品は共有製品source読取り専用。メインは独立回帰・完了判定を担当し、実Chrome環境不可ならNOT_RUN維持。
- 2026-10-04 A Histogram and clipping次候補: AはVignette-only Syncの製品Session/UI・Trial結果を提出し、共有`session.mjs`/`editor-ui.mjs`の排他所有を返却済み。次は独立候補`LR-02 Histogram and clipping`の色チャンネル、写真上白飛び/黒潰れ、直接トーン操作、UI/Recipe/Undo/Redo/保存/Finalを、新規`docs/HISTOGRAM_COMPLETION_AUDIT.md`と新規専用試験のみで照合する。既存製品source、B Grain/C Selective部品は読取り専用。メインは独立回帰・完了判定を行う。
- 2026-10-04 B Grain限定Sync部品: BはOutput adjustments manual JPEG fixture/testを提出し、bundle1/1 PASS・実Chromeは環境Browser一覧空でNOT_RUNとしてfixture所有を返却済み。次は新規`apps/web/src/batch-grain-sync.mjs`と新規専用純粋/Trial HTTP・SQLite試験のみを排他所有する。7調整だけmergeして他Recipe/Original不変、認証済み保存source/2〜20対象のAsset-SHA/版・権限、CAS/保存後照合、競合・失効・部分結果を確認する。共有`session.mjs`/`editor-ui.mjs`はメインがA返却後に再割当するまで読取り専用。C Selective Color部品とは別ファイル。メインは独立回帰・完了判定。
- 2026-10-04 B Output adjustments JPEG実Chrome: BはEV3-0701 Manual canvas Expand監査4/4を提出し、監査ファイルの排他所有を返却済み。次は既存Output adjustments専用の`apps/web/tests/fixtures/export-output-adjustments-editor-browser-fixture.mjs`と`apps/web/tests/export-output-adjustments-editor-browser.test.mjs`のみを排他所有し、現Editor UI→保存済み合成非RAW→実Worker manual JPEG BlobのMIME/画素差、Recipe/Original不変、失敗時リンク非公開を検証する。既存製品source、A Vignetting/C Selective Syncは読取り専用。メインは独立回帰・完了判定を行う。
- 2026-10-04 C Selective Color限定Sync部品: CはEV3-0501監査3/3を提出し、監査ファイルの排他所有を返却済み。Aが共有Session/EditorをVignetting-only Syncで所有中、Cは新規`apps/web/src/batch-selective-color-sync.mjs`と新規専用純粋/Trial HTTP・SQLite試験のみを排他所有する。選択色のみmergeして他設定/Original不変、認証済み保存source/2〜20対象のAsset-SHA/版・権限、CAS/保存後照合、競合・失効・部分結果を確認する。`session.mjs`/`editor-ui.mjs`はA返却後まで読取り専用。B Canvas Expandは監査ファイルのみ。メインは次段階の共有UI排他調整と完了判定。
- 2026-10-04 B Manual Canvas Expand次候補: BはLevels Author実Trial Chrome結果を提出し、そのfixture/testの排他所有を返却済み。次は独立候補`EV3-0701 Manual canvas Expand`の四辺手動余白・背景色/透明・Reset・Batch・Auto Expand During Sync、UI/Recipe/Undo/Redo/保存/Finalについて、新規`docs/CANVAS_EXPAND_COMPLETION_AUDIT.md`と新規専用試験のみを排他所有する。既存製品sourceとA所有Session/Editor、C Selective Colorは読取り専用。メインは独立回帰・完了判定を行う。
- 2026-10-04 C Selective Color次候補: CはColor Calibration監査3/3を提出し、監査ファイルの排他所有を返却済み。Aが共有Session/EditorをVignetting-only Syncとして所有中のため、Cは独立候補`EV3-0501 Selective Color`の9色域×CMYK/Relative・Absolute、UI/Recipe/Undo/Redo/保存/Final、Preset/Syncについて、新規`docs/SELECTIVE_COLOR_COMPLETION_AUDIT.md`と新規専用試験のみを排他所有する。既存製品sourceとA/B担当は読取り専用。メインは独立回帰・完了判定を行う。
- 2026-10-04 B Levels Author Trial実Chrome: BはEV3-0492監査と専用4/4を提出し、監査ファイルの排他所有を返却済み。次は新規Levels専用Trial HTTP/SQLite＋実Chrome fixture/testだけを排他所有し、現製品Author公開PresetのCapture/Draft/別admin採用/Library適用、Undo/Redo、CAS保存/再読込、Worker Finalを検証する。既存製品sourceとA所有`session.mjs`/`editor-ui.mjs`、C Color Calibrationは読取り専用。欠落はメインへ報告。メインは独立回帰・完了判定。
- 2026-10-04 A Vignetting専用Sync実装: AはEV3-0570監査を提出し、次は新規`apps/web/src/batch-vignette-sync.mjs`、既存`apps/web/src/session.mjs`/`apps/web/src/editor-ui.mjs`のVignette専用Sync配線、新規専用試験のみを排他所有する。保存済みsourceと2〜20対象の本人権限/Asset-SHA/版、対象未保存draft拒否、Vignetteだけのmerge、他設定/Original不変、CAS/保存後照合、競合・失効・部分表示、UI→保存/再読込→Finalを確認する。B Levels/C Color Calibrationは共有製品sourceを読取り専用。メインは独立回帰・完了判定を行う。
- 2026-10-04 C Color Calibration次候補: CはOutput adjustments監査2件を提出し、その新規文書/試験の排他所有を返却済み。次は独立候補`EV3-0586 Color Calibration`のRGB原色6調整、UI/Recipe/Undo/Redo/保存/Final、Preset/Syncと元下位操作について、新規`docs/COLOR_CALIBRATION_COMPLETION_AUDIT.md`と新規専用試験のみを排他所有する。既存製品source、A Vignetting/B Levelsは読取りのみ。メインは独立回帰・完了判定を行う。
- 2026-10-04 B Levels次候補: BはGrain実Trial Chromeの7調整・保存/再読込/Finalと競合/失効試験を提出し、Grain fixture/testの排他所有を返却済み。次は独立候補`EV3-0492 Levels`のRGB/Local/Sync/Preset/UI→保存→Finalと元下位操作について、新規`docs/LEVELS_COMPLETION_AUDIT.md`と新規専用試験のみを排他所有する。既存製品source、A Vignetting/C Output adjustmentsは読取りのみ。メインは独立回帰・完了判定を行う。
- 2026-10-04 A Vignetting次候補: AはSmart Culling監査を提出し、新規文書/試験の排他所有を返却済み。次は独立候補`EV3-0570 Mobile Post-Crop Vignetting`の5調整、保存/Final/Preset/Sync、元下位操作について、新規`docs/VIGNETTE_COMPLETION_AUDIT.md`と新規専用試験のみを排他所有する。既存製品source、B Levels/C Output adjustmentsは読取りのみ。メインは独立回帰・完了判定を行う。
- 2026-10-04 C Output adjustments次候補: CはExport sizeの実Chrome 36組合せを提出し、Export size fixture/testの排他所有を返却済み。次は独立候補`EV3-0773 Desktop Output adjustments`のScreen/Print×Low/Standard/High、現SUITE manual export-only調整、単写真/Batch Finalを読取り監査し、新規`docs/OUTPUT_ADJUSTMENTS_COMPLETION_AUDIT.md`と新規専用試験のみを排他所有する。既存製品source・A Smart Culling/B Grain fixtureは読取りのみ。メインは監査統合・全回帰・完了判定を担当し、数値非公開の元製品処理との同等性を推測しない。
- 2026-10-04 A Smart Culling次候補: AはExport naming現UI4方式の実Trial Chromeと試験用`.runtime`移行を提出し、命名の現段階を返却済み。次は独立候補`EV3-0894 Smart Culling`の手動マーク/Segment/保存/製品UIとAI自動選別の境界について、新規`docs/SMART_CULLING_COMPLETION_AUDIT.md`と新規専用試験だけを排他所有する。既存製品source・B Grain/C Export size fixtureは読取りのみ。メインは独立回帰・完了判定を担当し、部分確認を元候補PASSにしない。
- 2026-10-04 B Grain次段階: BはEV3-0528監査と専用境界試験を提出済み。次は新規Grain専用Trial HTTP/SQLite＋実Chrome fixture/testのみ排他所有し、7調整の製品Editor操作→CAS保存/再読込→実Worker Final/Undo/Redo・失効を実測する。既存製品Grain/Session/Editor/Backendは読取りのみで欠落時はメインへ報告。A命名/C Export sizeのファイルは編集しない。メインは独立回帰・完了判定。
- 2026-10-04 C Export size次段階: Cは監査/専用3試験を提出済み。次は既存Export size専用実Editor Chrome fixture/testのみを排他所有し、未確認のPercentage/Width/Height JPEG/PNGと6画素方式TIFFのUI→Worker Blob寸法/密度タグを検証する。製品`session.mjs`/`editor-ui.mjs`/Export処理本体、A命名、B Grainは読取りのみ。Dimensions厳密W×Hの意味差は設計判断なしに変更しない。メインは全回帰・台帳・完了判定。
- 2026-10-04 B次候補: Glowの限定Trial Author経路提出後も実RAW/Cloud/本番OIDC hostを別Gateとして元候補未完了に固定。Bは次の独立候補`EV3-0528 Grain`の7調整とPreset/Sync/保存/Final全経路について、新規`docs/GRAIN_COMPLETION_AUDIT.md`と新規専用試験のみを排他所有して現実装/欠落を照合する。既存製品sourceは読取り専用、修正が必要なファイルはメインが後通知する。Bは`session.mjs`/`author-ui.mjs`の排他所有を返却し、A命名/C Export sizeとファイルを共有編集しない。メインは独立判定・全回帰・台帳を担当する。
- 2026-10-04 C次候補: Add Shadowのローカル実Chrome非RAW安全境界提出後も元候補は実RAW/背景寸法差Gateで未完了と記録。Cは次の独立候補`EV3-0757 Desktop Export size`の下位7設定について、新規`docs/EXPORT_SIZE_COMPLETION_AUDIT.md`と新規専用試験のみを排他所有して現実装/欠落を照合する。既存製品sourceは読取り専用で、修正範囲はメインの後通知まで未割当。Aの命名fixture/source、BのGlow/`session.mjs`/`author-ui.mjs`とファイルを共有編集しない。メインは欠落判定・後続排他指定・全回帰を担当する。
- 2026-10-04 B/C次段階: CはAdd Shadow共有`editor-ui.mjs`/`session.mjs`/Processingの排他所有を返却済み。Bは同じEV3-0560 Glow E2E担当として`apps/web/src/session.mjs`、`apps/web/src/author-ui.mjs`、必要な新規Glow専用module/試験のみを排他所有し、既存Author全体適用を維持したまま明示的Glow-only適用を製品Trialへ追加・検証する。Cは新規Add Shadow専用Trial HTTP/SQLite＋実Chrome fixture/testのみを排他所有し、Browser Worker境界を合成非RAWとして確認する。Aは命名専用fixture/testのまま。A/CはB所有の共有製品ファイルを編集しない。メインは独立レビュー・全回帰・台帳のみ。
- 2026-10-04 Glow B次段階: BはGlow-only原子的Workspace Preset適用を提出済み。同じEV3-0560 E2E担当として、現Trial製品のAuthor portable PresetでGlow 3モード＋6値が実画面Save→Reload→Apply→Recipe CAS保存→Worker Finalに届くか読取り監査し、新規Glow専用Trial HTTP/SQLite＋実Chrome fixture/testのみを排他所有する。既存Author/Editor/Session製品ファイルの欠落は先に排他を相談し、A/C担当範囲を触らない。現TrialにPersonal/Workspace OIDC hostが無いGateは維持する。
- 2026-10-04 Glow B次段階: Bはhost注入型Personal/Workspace Preset mountの実Chrome＋JWT HTTP/SQLite提出済み。同じEV3-0560 E2E担当として`apps/backend/src/workspace.ts`、`apps/backend/src/workspace-server.ts`、`apps/web/src/workspace-preset-client.mjs`、B作成の`apps/web/src/glow-workspace-preset-mount.mjs`と新規専用試験のみを排他所有し、既存全Recipe置換と別の**同一transaction・版固定・Glow-only**適用経路を追加する。対象Asset/SHA・保存版、Preset可視性/版、edit権限をcommit前照合し、他調整を保持する。旧版/失効/競合ではbranchも作らず、既存Preset routeの挙動を変えない。A/Cはこれらを編集しない。現TrialのOIDC host欠如・実RAW/Cloudは別Gateであり、部品成功だけで元候補完了にしない。
- 2026-10-04 Export naming A次段階: Aは一括命名4方式の実Chrome fixtureを提出済み。同じEV3-0764 E2E担当として、新規の命名専用Trial HTTP/SQLite＋実Chrome fixture/testのみを排他所有し、現UIの`original`/`custom-count`/`custom-sequence`/`original-custom`を本人・保存版・Original SHA・明示順・実Worker Blob・安全な手動リンクまで照合する。失効/競合/途中失敗では0リンクとURL失効を検証する。既存Editor/Session/共有fixtureはC/メインへ確認なく編集しない。未接続5方式や実RAW/OS保存名をPASSにしない。
- 2026-10-04 Add Shadow製品処理段階: Aは命名専用fixture/試験のみ、Bは新規Glow Preset mount/試験のみを編集するため、Cの排他所有をAdd Shadow接続に限り`apps/web/src/processing/pure.mjs`、`processing/worker.mjs`、`processing/index.mjs`とC作成の`apps/web/src/add-shadow-manual-trial-runtime.mjs`にも拡張する。Cは既存処理順・他調整・RAW原本を維持し、実Gate付きPreview/FinalとTrial CAS経路まで確認する。共有契約の編集前に`docs/CHANGE_NOTICE.md`へ通知し、部品接続だけで元候補完了にしない。メインは独立レビューと回帰試験のみ。
- 2026-10-04 Glow B次段階: BはGlow固有Syncの実Chrome＋Trial HTTP/SQLiteを提出済み。同じEV3-0560 E2E担当として、新規`apps/web/src/glow-workspace-preset-mount.mjs`と新規専用試験のみを排他所有し、既存Node Workspace Preset client/facadeの本人・版固定・保存/再読込/適用をGlowの3モード＋6値へ接続する。現Trial製品OIDC host欠如を偽装せず、既存Editor/Session/Backend/CloudとA/Cファイルは触らない。Bは同じ機能E2E担当を保持、メインが独立判定。
- 2026-10-04 Export namingのA次段階: AはDNG保存済み単写真Final結合7/7提出済み。同じEV3-0764担当として既存`apps/web/tests/fixtures/batch-final-browser-fixture.mjs`と`apps/web/tests/batch-final-browser-output.test.mjs`のみを排他所有し、既に製品UIにある`custom-count`/`custom-sequence`を実Chromeの明示順2枚→Worker PNG Blob→安全名リンクで検証する。既存`original`/`original-custom`/失敗時0リンク・URL失効の期待を維持。C排他のEditor/Session、BのGlow fixtureを触らない。9方式全体のE2E担当はAが保持し、部品/一部方式だけで完了数を増やさない。
- 2026-10-04 共有Editor/Session排他返却・再割当: BはGlow固有Syncの`apps/web/src/editor-ui.mjs`/`apps/web/src/session.mjs`配線を専用7/7で提出し、両ファイル所有を返却。以後C（Add Shadow E2E）が両ファイルを排他所有し、typed文書のTrial CAS保存・再読込・Undo/Redo・Proxy/Final Gate・独立UI mountを実経路へ接続する。Bは新規Glow専用Chrome/HTTP試験とfixtureのみ、Aは命名専用試験/fixtureのみを編集し、Cの共有ファイルを触らない。メインは独立確認・全回帰・台帳のみ。B/Aの共有UI修正はC返却後に再調整する。未完/実RAW/Cloudを元候補完了に数えない。
- 2026-10-04 Add Shadow C次段階: Cは独立手動UI部品提出済み。同じEV3-0396担当としてBが共有UI/Sessionを返却するまで、新規`apps/web/src/add-shadow-manual-recipe.mjs`と新規専用試験だけを排他所有し、本人UI documentから他調整/処理順を保持したtyped Recipe v1を構築する。認証や保存済みの自称値を含めず、別Asset/SHA/寸法・既存Add Shadow文書の別Asset束縛衝突を拒否する。B/W等の別の有効拡張は維持する。既存Editor/Session/Backend、A/Bファイルは読取り専用。部品後も同じ機能E2E担当を継続する。
- 2026-10-04 Export namingのA次段階: AはDNG撮影日入力部品提出済み。引き続き同じEV3-0764担当として新規`apps/web/src/export-capture-date-final.mjs`と新規専用試験のみを排他所有し、fresh Trial DNG日付Gate→既存保存済みSession単写真Final→再Gate/版/SHA確認→安全な`capture-date-original`名のBlob結果をつなぐ。自動clickなし、失敗時Blob非返却。既存Editor/SessionはB排他なのでAは触れない。9方式の残りはこの1方式後も同じAが保持、メインが独立判定。
- 2026-10-04 ユーザー新方針: 4人のうちA/B/Cをそれぞれ**一機能のE2E実装担当**、メインを**独立確認・完了判定担当**へ固定する。A=`EV3-0764 Desktop Export naming`、B=`EV3-0560 Mobile Glow Effect`、C=`EV3-0396 Add Shadow`。各担当は実処理/UI/Recipe/Undo/Redo/保存/再読込/Final/回帰を自分の機能について揃え、部品提出だけで次へ移らない。メインは欠落を見つけたら同じ担当へ差し戻し、44候補の全要素条件を満たすまで進捗数を増やさない。共有`apps/web/src/editor-ui.mjs`と`apps/web/src/session.mjs`は**当面Bが排他所有**し、A/Cは新規独立ファイル・専用試験を進めてBから返却後に各自の製品統合を行う。メインは統合確認・全回帰・台帳のみで共有ソースを編集しない。実RAW/実機/公開Cloudは別Gate。Cloudflare/公開配備と重複統合は今の作業外。この行は下の個別割当より優先。
- 2026-10-04 Add Shadow本人手動UI部品: CはTrial限定orchestrator提出済み。次は新規`apps/web/src/add-shadow-manual-ui.mjs`と新規専用試験のみを排他所有し、After専用brush/erase・明示背景Asset・影モード/調整値を実処理callbackへ渡せるUI部品を作る。既存Editor/Session/CSS/Bootstrap、A/B/メイン担当ファイルは編集しない。製品mount/保存/Final未接続のため元候補完了数を増やさない。
- 2026-10-04 撮影日Export命名入力: AはWorkspace保存境界提出済み。次は新規`apps/web/src/export-capture-date-naming.mjs`と新規専用試験のみを排他所有し、既存Trial DNG capture-date Gateの結果から同一Asset/SHA/保存版、明示offsetありのExif wall dateを`capture-date-original`向けに正規化する。既存Export命名/Session/UI、Backend、Cloudは編集しない。B/C/メインのAdd Shadow作業とファイルを共有しない。これだけで元候補完了に数えない。
- 2026-10-04 Add Shadow Trial保存のHTTP証明: Bはrepository保存境界提出済み。次は新規`apps/web/tests/add-shadow-trial-save-http.test.mjs`のみを排他所有し、実Trial HTTP/SQLiteで本人・対象/背景Asset-SHA・保存/再読込・拒否・Original不変を検証する。製品コード・A/C担当ファイル、メインのBatchファイルは編集しない。HTTP試験だけで元候補完了に数えない。
- 2026-10-04 メインはAdd Shadow写真固有RecipeのBatch漏洩遮断を`apps/web/src/batch-edit.mjs`、`apps/web/src/session.mjs`と新規専用試験で実装する。AはWorkspace保存境界、BはTrial保存境界、Cは新規Trial runtimeに限定し、この2つのメインファイルには触れない。
- 2026-10-04 Add Shadow Trial保存境界: BはNode構造validator提出済み。次は`apps/backend/src/repository.ts`と新規専用試験のみを排他所有し、Trial Recipeの対象/背景Asset・SHA実登録値照合を既存tenant/revision transaction内の保存/再読込へ追加する。Aの`workspace.ts`、Cの新規Trial runtime、メインの回帰/台帳とファイルを共有編集しない。Cloud/Session/UI/Finalは対象外、完了数を増やさない。
- 2026-10-04 Add Shadow保存/Gate並列: Aはmask部品提出済み。次は`apps/backend/src/workspace.ts`と新規専用試験のみを排他所有し、BのNode構造検証を前提に対象/背景Asset-SHAの登録値照合、履歴再読込、Presetコピー拒否を追加する。Aは`photo-policy.ts`を編集しない。CはGrain旧試験追従を提出済み。次は新規`apps/web/src/add-shadow-manual-trial-runtime.mjs`と新規専用試験のみを排他所有し、対象/背景Trial Gate＋typed文書＋mask＋Workerを限定的に結合する。既存Session/UI/Backend/通常renderは編集しない。Bは`photo-policy.ts`のNode構造検証を継続。メインは回帰・進捗台帳。実RAW・製品保存/Final/UI未接続なので完了数を増やさない。
- 2026-10-04 Workspace Preset旧試験追従: CはAdd Shadow手動contract提出済み。次は既存`apps/web/tests/grain-preset-http.test.mjs`のみを排他所有し、AがHTTP Preset適用へ追加した必須`expectedPresetVersion`に旧成功/拒否ケースの要求bodyを最小限整合させる。旧のGrain保存・権限・期限拒否期待は緩めない。製品コードは編集しない。AはAdd Shadow mask、BはNode Recipe検証、メインは全回帰を担当。
- 2026-10-04 Add Shadow Node Recipe検証更新: BはWorkspace Preset Web client提出済み。次は`apps/backend/src/photo-policy.ts`と新規専用Backend試験のみを排他所有し、Cのtyped Add Shadow手動documentと同じ構造/容量をNode Recipeで厳密受理する。保存時のAsset/背景実参照認可は別Gateとして明示し、Backend repository/Cloud/Web Sessionは触らない。実装前通知は[CHANGE_NOTICE](CHANGE_NOTICE.md)最上節。AはAdd Shadow mask adapter、Cは手動契約提出済み、メインは統合試験/進捗。
- 2026-10-04 Add Shadow mask raster更新: AはWorkspace Preset版固定提出済み。次は新規`apps/web/src/processing/add-shadow-manual-mask.mjs`と新規専用試験のみを排他所有し、C担当typed document shapeと整合する手動subject stroke→Asset/SHA/版数束縛Proxy/Final matteを追加する。Cの契約ファイルは読取り専用とし、shape未確定なら設計準備・既存authoring試験まで進め、勝手な契約は作らない。実装前通知は[CHANGE_NOTICE](CHANGE_NOTICE.md)最上節。BはWorkspace Preset Web client、CはAdd Shadow手動契約、メインは進捗/統合回帰。
- 2026-10-04 Add Shadow手動Recipe部品更新: Cは背景Asset Gate提出済み。次は新規`apps/web/src/processing/add-shadow-manual-contract.mjs`と新規専用試験のみを排他所有し、対象/背景Asset-SHA/原寸・subject stroke・既存調整値のtyped非破壊documentを検証する。B/W契約とRecipe v1外形は不変、Backend/Cloud/Session/UIは読取り専用。実装前通知は[CHANGE_NOTICE](CHANGE_NOTICE.md)最上節。AはWorkspace Preset版固定提出済み、BはWorkspace Preset Web client継続、メインは進捗/統合回帰。
- 2026-10-04 Workspace Preset Web client更新: BはAdd Shadow対象Gate提出済み。次は新規`apps/web/src/workspace-preset-client.mjs`と新規専用実HTTP/SQLite試験のみを排他所有し、host提供Bearer tokenを都度取得し、fresh Node Workspace Session本人・scope・role照合のうえ既存Preset APIへ接続する。ApplyではA担当の`expectedPresetVersion`を送る。AのBackend/試験、Cの背景Asset Gate、メインのBatch fixture/進捗台帳は触らない。実装前通知は[CHANGE_NOTICE](CHANGE_NOTICE.md)最上節。
- 2026-10-04 新規並列: AはAdd Shadow facade提出済み。次は`apps/backend/src/workspace.ts`、`apps/backend/src/workspace-server.ts`、既存`apps/backend/tests/workspace-server.test.ts`のPreset適用期待値部分と新規専用試験だけを排他所有し、Workspace Preset適用の`expectedPresetVersion`を同一transactionで検証する。既存試験の編集は新必須フィールドによる契約変更に必要な最小部分のみ。BはCulling verified mount提出済み。次は新規`apps/web/src/add-shadow-target-gate.mjs`と新規専用実Trial試験のみを排他所有し、対象Assetのfresh本人/Original SHA/保存版/権限をread-onlyで証明する。Cは背景Asset Gate継続、メインはBatchブラウザfixture/全回帰。実装前通知は[CHANGE_NOTICE](CHANGE_NOTICE.md)最上2節。
- 2026-10-04 Add Shadow背景出典更新: CはBatch Original＋Customのmanifest/UIを提出済み。次は新規`apps/web/src/add-shadow-backdrop-gate.mjs`と新規専用試験のみを排他所有し、本人選択の背景Assetについてfresh list/権限/Original bytes SHA/decode/寸法/RGBA digestを照合する。既存Session/UI/Processing/Backend/Cloudは読取り専用。実装前通知は[CHANGE_NOTICE](CHANGE_NOTICE.md)最上節。既存APIに安全な本人境界が無ければ、偽装せず停止条件を報告する。AはAdd Shadow facade、BはCulling verified mount、メインはBatchブラウザfixtureを担当。
- 2026-10-04 Batch命名UI更新: Cはmanifest提出済み。次は`apps/web/src/editor-ui.mjs`と新規専用UI試験のみを排他所有し、Batch Final「元の名前＋指定文字」選択肢と`customName`→`customText`の事前検証を接続する。メインは既存`apps/web/tests/fixtures/batch-final-browser-fixture.mjs`と実Chrome確認のみを担当し、C提出までeditor-uiは編集しない。AはAdd Shadow facade、BはCulling verified mountを継続。実装前通知は[CHANGE_NOTICE](CHANGE_NOTICE.md)のBatch命名節。
- 2026-10-04 Add Shadow facade更新: AはWorker operation提出済み。次は`apps/web/src/processing/index.mjs`と新規専用試験のみを排他所有し、独立`applyBoundAddShadow` facadeを既存Workerへつなぐ。実装前通知は[CHANGE_NOTICE](CHANGE_NOTICE.md)最上節。旧render/Recipe/Session/UIは読取り専用。BはCulling verified mount、CはBatch命名UI、メインはBatchブラウザfixtureを担当。
- 2026-10-04 Culling host注入mount更新: BはNode Workspace Session Web gate提出済み。次は新規 `apps/web/src/workspace-culling-verified-mount.mjs` と新規専用試験だけを排他所有し、fresh本人/tenant/membership/roleを確認したhost注入Culling Panel mountを追加する。既存Panel/Client/Backend/Bootstrap/Editorは読取り専用。実装前通知は [CHANGE_NOTICE](CHANGE_NOTICE.md) 最上節。A/C/メインの最新割当は以下の行を優先。
- 2026-10-04 Batch命名更新: Cは実Trial DNG撮影日証拠Gateを提出済み。次は `apps/web/src/export-batch-manifest.mjs` と新規専用試験だけを排他所有し、既存Original＋Custom TextをBatch Final manifestへ追加する。実装前通知は [CHANGE_NOTICE](CHANGE_NOTICE.md) 最上節。Editor UI/Session/Backendは読取り専用。AのAdd Shadow Worker、BのNode Workspace Web gate、メインのB/W統合と後続UI接続は下の最新行どおり。
- 2026-10-04 Add Shadow Worker更新: Aはbound runtime adapter提出済み。次は `apps/web/src/processing/worker.mjs` と新規専用Worker試験だけを排他所有し、`applyBoundAddShadow` の独立Worker operationを再検証付きで実装する。実装前通知は [CHANGE_NOTICE](CHANGE_NOTICE.md) 最上節。Session/UI/Backend/Cloudと既存render順序は触らない。B/C/メインの担当は以下の最新行どおり。
- 2026-10-04 Workspace Web境界更新: Bは認証済みNode Workspace Session endpointを提出済み。次は新規 `apps/web/src/workspace-session-client.mjs` と新規専用実HTTP/SQLite試験だけを排他所有し、外部host提供Bearer tokenを保存・ログせずにfresh本人/tenant/membership/roleを厳密検証するNode専用Web gateを実装する。Bootstrap/既存Panel/Trial/Cloudは編集しない。CのDNG証拠Gate、AのAdd Shadow runtime、メインのB/W統合は下の最新行どおり。
- 2026-10-04 DNG撮影日境界更新: CはDNG限定Exif構造読取部品を提出済み。次は新規 `apps/web/src/export-capture-date-gate.mjs` と新規専用実Trial HTTP/SQLite＋合成DNG試験だけを排他所有し、認証済みAsset/Original SHA/保存版/export権限へ証拠を束縛する。Session/UI/命名本体/Backendは読取り専用。AのAdd Shadow runtime、BのNode Workspace本人endpoint、メインのB/W統合担当は下の最新行どおり。
- 2026-10-04 Smart Culling境界更新: Bは製品Web adapterを安全に作れないと確認し、同新規moduleは未作成。次に `apps/backend/src/workspace-server.ts` と新規専用Backend試験だけを排他所有し、既存OIDC/JWT根拠による本人subject・tenant・指定Workspaceのmembership/roleを返す読み取り専用Session endpointを実装する。実装前通知は [CHANGE_NOTICE](CHANGE_NOTICE.md) 最上節。認証host/token provider、Trial/Cloud移植、UI mountは対象外。A/Cの直近排他とメインのB/W統合担当は次行の通り。
- 2026-10-04 追加最新: B/W手動限定の実Trial HTTP/SQLite＋Chrome統合はB提出、全Web917件PASS。メインはB/W結合レビュー、進捗台帳と全回帰を保持。Aは `apps/web/src/processing/add-shadow-runtime.mjs` と新規専用試験だけを排他所有し、既存Add Shadowのbound画素部品をWorkerへ安全に渡すruntime契約を実装する。Bは新規 `apps/web/src/workspace-culling-product-route.mjs` と新規専用試験だけを排他所有し、Node Workspaceの実認証Project/Asset/Culling接続を検証する。Cは `apps/web/src/processing/exif-capture-date.mjs` と新規DNG専用試験だけを排他所有し、Classic TIFF限定のExif読取からDNG識別済みsubsetへ安全に広げる。共有Worker、Recipe、Editor、Backend、Bootstrapと相互の排他ファイルは読取り専用。部分部品だけで元候補完了を増やさない。
- 2026-10-04 最新: メインは `apps/web/src/session.mjs`、`apps/web/src/editor-ui.mjs` とB/W Editor統合レビュー、進捗台帳、全Web/Backend回帰を担当。Bは提出した二層UIの製品コードを返却し、新規 `apps/web/tests/bw-edge-trial-editor-integration*.mjs` と専用fixtureのみを排他所有して実Trial HTTP/SQLite＋Chromeの画面・保存・再読込・Finalを検証する。AはOriginal Shadow部品を提出済みで、次に `apps/web/src/processing/add-shadow.mjs` と新規専用試験のみを排他所有する。Cは新規 `apps/web/src/processing/exif-capture-date.mjs` と新規専用試験のみを排他所有し、元Original byteのbounded Exif撮影日読取器を実装する。Cは命名本体やRAW metadataを変更せず、未証明形式・offset方針を推測しない。各担当は互いのファイルを編集しない。合成非RAWや純粋部品だけでは元候補44件の全要素完了数を増やさない。
- 2026-10-04 B/W統合補足: メインは `apps/web/src/session.mjs` と新規Session統合試験を排他所有し、認証Gate・保存・Preview/Finalの実経路をつなぐ。担当BはGate提出後、`apps/web/src/bw-edge-manual-ui.mjs`、`apps/web/src/editor-ui.mjs`、`apps/web/src/editorial-editor.css` と新規UI試験を排他所有し、`session.setBWEdgeManualStrokes(strokes)` へ非同期失敗を誤反映しないAfter二層手動UIを接続する。両者は互いの担当ファイルを編集しない。AはProcessing通常Render、CはBatch/Preset漏洩遮断を維持する。製品経路の全条件がそろうまでは元候補完了数を増やさない。
- CのBatch/Preset漏洩遮断とWorkspace Recipe履歴のAsset/SHA照合は提出済み。次は新規 `apps/web/tests/bw-edge-session-http.test.mjs` のみをCが排他所有し、メインのSession接続を実Trial HTTP/SQLite＋合成非RAWで独立検証する。メインは同試験ファイルを編集せず、CはSession/UI/Processing/Backendを編集しない。
- B/W通常RenderとSession HTTP統合試験はA/Cが提出済み。次の独立候補はAが `EV3-0394 Original Shadow` の既存pure module/関連mask契約を読み、`apps/web/src/processing/original-shadow.mjs` と新規専用試験だけで本人提供maskによる実画素・透明度・別Asset拒否を改善する（自動影抽出を偽装しない）。Cは `EV3-0764 Desktop Export naming` の撮影日方式について `apps/web/src/processing/raw.mjs`、`apps/web/src/export-naming-context.mjs` と新規専用試験だけで実LibRaw metadataから安全な撮影暦日を得られるか照合し、根拠がない場合は拒否を維持する。A/Cは互い・メイン/Bのファイルを編集しない。完成部品だけで元候補全要素完了数は増やさない。
- メイン: Point Curves Refine Saturation、TIFF8単写真/Batch、Levels固有Sync、SUITE手動出力調整UIまで接続済み。現在のB/W分業では `session.mjs`/`editor-ui.mjs`/`photo-policy.ts` をメインが保持し、Cへ `repository.ts`/Cloud `worker.mjs`、AへWeb Processing facade/Worker、Bへ新規Session Gateのみを排他で渡す。メインは進捗台帳と統合回帰、preset-contractを担当し、A/B/C担当ファイルは編集しない。
- 実装担当A: `EV3-0342 B/W Edge Removal` のpure area adapter、二層手動maskラスタ、独立Worker operationと実Chrome画素を提出済み（全Web876件PASS）。次は `apps/web/src/processing/pure.mjs`、`apps/web/src/processing/index.mjs`、`apps/web/src/processing/worker.mjs` と新規専用試験を排他所有し、Recipeに`bwEdgeManual`がある場合だけ、Normal Renderの既存global/postDecode/localLevels後・rotation/crop前に独立B/W手動operationの同じ検証済み処理を挿入する。`bwEdgeRuntime`が無い/別Asset/SHA/版数/寸法・8MP超ならPreview/Finalとも拒否し、旧Recipeの画素・既存順序は不変。Proxyはtarget proxy、Finalはtarget sourceを明示して検証。既存Session/UI/Backend/Recipe validatorは読取り専用。Sessionのfresh実API証拠統合前は元候補完了と数えない。
- 実装担当B: `EV3-0342 B/W Edge Removal` のAfter専用subject/correction二層手動brush/eraser独立部品を実Chrome trustedクリック、Touch模擬、Keyboard、Undo/Redo、390pxで提出済み（全Web870件PASS）。次は新規 `apps/web/src/bw-edge-manual-session-gate.mjs` と新規専用試験のみを排他所有し、認証済みTrial APIからfresh Asset/Original SHA/保存Recipe revision/編集・書出し権限を再読込してCのcontract runtimeの `permissionEvidence` を構築する読み取りGateを実装する。`allowed:true`のUI値を認証の代用にせず、別Asset/別SHA/旧revision/権限失効/abortならWorker呼出し前に拒否。実HTTP/SQLiteの権限/CAS試験まで行い、既存Session/UI/Worker/Backend/Recipeは読取り専用。製品接続前は元候補完了と数えない。
- 実装担当C: `EV3-0342 B/W Edge Removal` の純粋contract、Recipe構造検証、Node/Cloud保存・履歴のAsset UUID/Original SHA bound照合を提出済み（Backend167/Sites19/Web875件PASS）。次は `apps/web/src/batch-edit.mjs` と `apps/backend/src/workspace.ts`、各新規専用試験のみを排他所有する。全Recipe Batch Editではsource/targetどちらかにAsset/SHA束縛`bwEdgeManual`があれば書込前に明示拒否。Author Portable Presetは現時点で同キーを拒否することを専用試験で維持。Node Workspace FULL_REPLACE Presetはcreate/update時に同キーを拒否し、旧/不正保存済みPresetもapply時に拒否して別Assetへのmask持込みを防ぐ。既存Workspace Preset/portrait/認証/権限/CAS・別機能batchSyncLevelsを維持。Session/UI/Recipe/Worker/Cloudは読取り専用。

- メイン: `apps/web/src/{session,editor-ui,feature-catalog}.mjs`、`apps/web/src/editorial-editor.css`、`apps/web/src/processing/pure.mjs`、`apps/web/tests/session-safety.test.mjs`、進捗台帳と最終統合。Post-Crop VignetteのUI/保存/Final接続を担当する。
- 実装担当A: Color Calibrationの純粋画素処理を新規 `apps/web/src/processing/color-calibration.mjs` と新規 `apps/web/tests/color-calibration.test.mjs` のみで実装・試験する。共有renderer/session/UI/Recipeは読取り専用。製品接続前は完了に数えない。
- 実装担当B: Manual canvas ExpandのWorker実描画接続を `apps/web/src/processing/worker.mjs` と新規専用試験のみで行う。既存のprojection/expand moduleを使い、Crop後にProxy/Final各寸法で余白を投影する。共有pure/Recipe/session/UIは読取り専用。`processingOrder` の新stageは作らない。
- 実装担当C: Manual canvas Expandの厳密なRecipe入力検証を `apps/backend/src/photo-policy.ts` と新規専用試験のみで行う。`extendedParameters.canvasExpand` に閉じ、旧RecipeとCrop終端契約を維持する。Worker/pure/session/UIは読取り専用。

担当BのCanvas Expand Worker接続提出後の次割当: BはMobile Post-Crop Vignettingの残るMidpoint/Roundness/Feather/Highlightsを `apps/web/src/processing/vignette.mjs`、既存 `apps/web/tests/vignette.test.mjs` と新規専用試験のみで実画素処理する。未公開のAmount符号は公式記述に合わせ負=暗・正=明へ修正し、既存試験の期待値も更新する。共有pure/Recipe/session/UIは読取り専用。四要素が未接続の間は元候補一件完了としない。

担当AのColor Calibration部品提出後の次割当: AはSelective Colorの9色域×CMYK調整の独立純粋画素moduleを新規 `apps/web/src/processing/selective-color.mjs` と新規専用試験のみで進める。既存HSLやColor Calibrationと同一とみなさず、共有renderer/Recipe/session/UIは読取り専用。部品完成だけでは製品完了に数えない。

担当CのCanvas Expand検証提出後の次割当: CはMobile Post-Crop Vignettingの残る4値を `apps/backend/src/photo-policy.ts` と新規専用試験のみで厳密検証する。既存Amount-only Recipeを保ち、`vignette` に任意の `midpoint` 0..100、`roundness` -100..100、`feather` 0..100、`highlights` 0..100を追加する。未知キー・非有限値を拒否。renderer/pure/session/UIは読取り専用。

担当CのVignette保存検証提出後の次割当: CはColor Calibrationの `postDecodeAdjustments.color.calibration` 厳密検証を `apps/backend/src/photo-policy.ts` と新規専用試験のみで追加する。red/green/blue各 `{hue,saturation}` 整数 -100..100、未知キー・不正型拒否。旧Recipeと全既存色処理を保持。renderer/pure/session/UIは読取り専用。

担当AのSelective Color部品提出後の次割当: Aは現在の完了台帳1〜4（Histogram/Clipping、Export naming、Grain、RGB Levels）を元監査・一次資料の構成要素と照合し、新規 `docs/UNIQUE_COMPLETION_AUDIT_A.md` のみへ「全要素接続済み／一部のみ」を根拠付きで記録する。ソースと進捗台帳は編集しない。

担当BのVignette部品提出後の次割当: Bは現在の完了台帳5〜7（Export size、Glow、Point Curves）を同様に照合し、新規 `docs/UNIQUE_COMPLETION_AUDIT_B.md` のみへ記録する。ソースと進捗台帳は編集しない。

担当CのColor Calibration保存検証提出後の次割当: Cへ `apps/web/src/processing/pure.mjs` と新規専用レンダラ試験のみを排他的に渡し、`postDecodeAdjustments.color.calibration` を既存色調整と明示した順序で実画素へ接続する。メインは提出までpure.mjsを編集しない。session/UI/Recipe validatorはCの今回担当外。

担当CのColor Calibration描画提出後の次割当: CはSelective Colorの `postDecodeAdjustments.color.selectiveColor` 検証を `apps/backend/src/photo-policy.ts` と新規専用試験のみで追加する。`method` は relative/absolute、`ranges` の9色域各CMYKは整数 -100..100、未知キー拒否。Aの純粋moduleの省略既定値と整合。共有pure/session/UIは読取り専用。

担当Aの完了判定監査提出後の次割当: Aは自身の `apps/web/src/processing/selective-color.mjs` と新規専用試験のみでWorker異realm JSONのplain-object受理を修正する。class instance・未知キー・symbol key拒否は維持。共有pure/Recipe/session/UIは読取り専用。修正提出後、次の独立要素へ再割当する。

担当Bの完了判定監査提出後の次割当: BはGrainの欠落6調整（Shadows/Midtones/Highlights/Size/Roughness/Color Variation）を既存 `apps/web/src/processing/grain.mjs`、既存 `apps/web/tests/grain.test.mjs` と新規専用試験のみで実画素処理へ追加する。旧Amount+Seed形を保持し、共有Recipe/pure/session/UIは読取り専用。

担当CのSelective Color保存検証提出後の次割当: Cへ `apps/web/src/processing/pure.mjs` と新規専用レンダラ試験のみを排他的に渡し、`postDecodeAdjustments.color.selectiveColor` をAの純粋moduleへ接続する。Calibration、Levels、Point Curves、Glowなど既存順序を維持。Aの異realm修正と整合。メインは提出までpure.mjsを編集しない。

担当AのSelective Color異realm修正提出後の次割当: AはHistogram/Clippingの写真上表示に必要な mask→透明RGBA overlay の純粋moduleを新規 `apps/web/src/processing/clipping-overlay.mjs` と新規専用試験のみで実装する。既存 `analyzeHistogram(...,{includeMask:true})` のビットを使用し、黒側を青、白側を赤、非該当とalpha0を透明にする。共有session/UI/rendererは読取り専用。

担当CのSelective Color描画提出後の次割当: CはExport namingの既存9方式をUIから安全に呼ぶための入力正規化moduleを新規 `apps/web/src/export-naming-form.mjs` と新規専用試験のみで実装する。既存 `buildExportFilename` を再利用し、撮影日/連番/総数/Custom/効果Preset名/出力Preset名が不足する場合は明示拒否。実際の写真metadataやPreset保存を捏造しない。共有editor-ui/export-naming/sessionは読取り専用。

担当AのClipping overlay提出後の次割当: AはHistogram上の直接トーン調整に使う純粋計算を新規 `apps/web/src/histogram-tone-drag.mjs` と新規専用試験のみで作る。5領域（Blacks/Shadows/Exposure/Highlights/Whites）と横移動量から既存Adjustmentの範囲に収めた値を返す。写真の画素・Recipeを直接変更しない。session/UI接続はメイン。

担当BのGrain拡張部品提出後の次割当: BはGrainの追加6値を `apps/backend/src/photo-policy.ts` と新規専用試験のみで厳密検証する。`postDecodeAdjustments.detail.grain` の旧 `{amount,seed}` を保持し、任意の shadows/midtones/highlights/size/roughness/colorVariation を0..100有限数として許容。未知キーと不正型拒否。共有pure/session/UIは読取り専用。

担当AのHistogram tone drag提出後の次割当: AはDesktop Export sizeの不足するLong Edge/Short Edge/Dimensionsモードを `apps/web/src/export-size.mjs` と既存 `apps/web/tests/export-size.test.mjs`、新規専用試験のみで追加する。既存5モードは保持し、拡大禁止・縦横比・透明画素・寸法/メモリ上限を守る。PPI/PPCは画素サイズでなくメタデータ出力なのでこの部品では偽装しない。共有session/UI/encodeは読取り専用。

担当CのExport naming form提出後の次割当: Cへ `apps/web/src/processing/pure.mjs` と新規専用renderer試験のみを排他的に渡し、Grain objectの追加6値を `applyGrain` に渡す。旧Amount+Seed Recipeは同じ出力を保つ。共有Recipe/session/UIは読取り専用。メインは提出までpure.mjsを編集しない。

担当BのGrain保存検証提出後の次割当: Bは同じ `apps/backend/src/photo-policy.ts` と新規専用試験のみで、既存Point Curves/Glowのplain JSONが異realm Worker経由でも正しく検証されるよう修正する。class instance・未知/symbol key拒否は保持し、既存Recipe/各新機能の範囲を維持する。共有pure/session/UIは読取り専用。

担当AのExport size追加3方式提出後の次割当: AはDesktop Export sizeの印刷解像度指定を調べ、既存JPEG/PNGの実出力に対しPPI/PPCメタデータを安全に設定・検証する純粋moduleを新規 `apps/web/src/export-resolution.mjs` と新規専用試験のみで作る。寸法変更や架空のdpi表示では完了扱いにしない。source/referenceを確認し、既存エンコード結果を壊さない。共有session/UI/encodeは読取り専用。

担当CのGrain renderer追加6値提出後の次割当: Cは独立候補Batch Editの既存API/保存契約を読取り調査し、複数Assetへの既存Recipe適用・保存を1件ずつ権限/版数検証し実行する独立moduleを新規 `apps/web/src/batch-edit.mjs` と新規専用試験のみで実装する。失敗したAssetを成功に見せず、RAW原本不変、旧Recipe/Workspace権限と処理順序を保持。共有session/UI/Recipe validator/backendは読取り専用。部品のみで元候補完成とは数えない。

担当BのPoint Curves/Glow異realm検証提出後の次割当: Bは独立候補Mobile Motion Blurを一次資料の仕様と比較し、実画素に効く純粋moduleを新規 `apps/web/src/processing/motion-blur.mjs` と新規専用試験のみで実装する。境界・alpha・中断・元画素不変を確認。既存Glow/Blurとの処理差を明示し、資料で確認できない操作やAI結果を実装済みと称しない。共有pure/session/UI/Recipeは読取り専用。

上記Mobile Motion BlurはAI生成Ghost Flowで手動ブラーと異なると一次資料で確認し、中止・ソース変更なし。代替割当: Bは既存Mobile Glow Effectの未接続差分を `apps/web/src/processing/glow.mjs` と新規専用試験のみで実画素処理する。White Mist/Black Mist/Halationの3モードとExposure/Diffusion/Tintを公式一次資料で確認し、旧3値の画素結果を維持する。Show Glow Maskは表示経路が必要なので純粋moduleではマスク生成だけ実装し、Final合成と混同しない。共有pure/session/UI/Recipeは読取り専用。部品だけで元候補完了とは数えない。

担当BのGlow拡張部品提出後の次割当: Bは `apps/backend/src/photo-policy.ts` と新規専用試験のみで `postDecodeAdjustments.color.glow` のmode/exposure/diffusion/tint追加値を厳密検証する。旧3値Recipe・旧描画値を保持し、未知/symbol key・異realm class instance・不正範囲を拒否。共有pure/session/UIは読取り専用。

担当CのBatch Edit部品提出後の次割当: Cは `apps/web/src/editor-ui.mjs` と新規専用UI試験のみを排他的に担当し、現在の保存済み写真をコピー元として他の写真を明示選択し、一括適用結果の成功・競合・未検証を区別して表示するUIを接続する。メインが `EditorSession.batchApplyCurrentRecipe(targetIds)` を追加する。dirty/権限失効/Source revision不一致は拒否。ボタンは実装されたsession methodがない場合に必ずdisabled、無関係な元画像/Recipeは変更しない。メインはC提出までeditor-ui.mjsを編集しない。

担当AのExport resolution純粋部品提出後の次割当: Aは `apps/web/src/processing/encode.mjs` と新規専用試験のみを排他的に担当し、既存OffscreenCanvasのJPEG/PNG実エンコードBlobに任意のPPI/PPC指定を安全に挿入する。指定なしは旧Blob動作を維持。JPEGがJFIF densityを書けない形式なら明示拒否し、勝手なAPP追加をしない。Exif等の元個人metadataは復活させず、技術的な密度値のみ加える。Recipeの既存export settings/metadata除去契約を変えず、abortとBlob MIME/画像寸法を検証。共有session/UI/workerは読取り専用。

担当BのGlow拡張Recipe検証提出後の次割当: Bは `apps/web/src/processing/pure.mjs` と新規専用renderer試験のみを排他的に担当し、既存 `postDecodeAdjustments.color.glow` にmode/exposure/diffusion/tintがある場合に新 `applyGlow` object APIへ接続する。旧intensity/radius/thresholdのみのRecipeは旧出力ビット互換。Show Glow MaskはFinal合成せず、表示用moduleと分離。共有session/UI/Recipe validator/workerは読取り専用。

担当Aのencode密度値接続提出後の次割当: Aは `apps/web/src/processing/{index,worker}.mjs` と新規専用試験のみを排他的に担当し、EditorSessionから渡す `resolution` オプションをFinal encodeのWorker境界へ安全に転送する。指定なし/Preview PNGは旧挙動、RAW・Recipe/写真画素は不変。Worker異realm入力検証、abort、MIMEの失敗閉鎖を確認。共有session/UI/encodeは読取り専用。

担当BのGlow Final回帰提出後の次割当: BはExport naming 9方式の不足データを現行Decoder/metadata/Preset/APIから読取り照合し、新規 `apps/web/src/export-naming-context.mjs` と新規専用試験のみで、実在するcapture date/sequence/total/Effect Preset/Export Preset名を取り出し、存在しないものは明示拒否する入力準備を実装する。任意名や偽metadataを作らず、共有session/UI/Recipe/processingは読取り専用。

担当CのBatch Edit UI提出後の次割当: Cは `apps/web/src/editor-ui.mjs`、`apps/web/src/editorial-editor.css` と新規専用UI試験のみで、既存 `state.clippingOverlayURL` をAfter写真上に表示/非表示する黒側・白側指標とJキー切替、5トーン領域のHistogramドラッグを接続する。ドラッグ値は `histogram-tone-drag.mjs` と既存 `session.setAdjustment` を使用。Overlayは表示専用でFinal/Before/Originalへ混入禁止。RAW未読込/忙しい/権限失効時は操作不可、reduced motion/focus/keyboardと写真寸法への重なりを確認。メインは提出までUI/CSSを編集しない。

担当AのExport resolution Worker境界提出後の次割当: Aは新規 `apps/web/tests/batch-edit-http.test.mjs` のみで、既存TrialClient/Trial HTTP/SQLiteの本人認証済み保存先とBatch Editを統合試験する。二つの非RAWテストAssetへRecipe適用、別利用者/期限切れ権限拒否、revision競合、Originalハッシュ不変、成功/失敗/未検証の区別を確認。実RAWやCloudとは称しない。既存src/session/UI/DB実装は読取り専用。実サーバー契約不一致なら事実を報告し、テストを偽装しない。

担当間で同じファイルを同時編集しない。部品だけで完了数を増やさず、メインの統合試験後に次の1件を割り当てる。

## 2026-10-04 独立機能の接続・検証（現在）

独立44件のうち、合成人工データによるUI/保存/Final経路の自動確認は5件。実RAWでの最終画質QAおよび公開配備はこの完了数に含めない。重複統合は44件の完了後まで保留。次の並行作業はファイルを排他的に分ける。

- メイン: `apps/web/src/{session,editor-ui,feature-catalog}.mjs`、`apps/web/src/editorial-editor.css`、統合試験とブラウザ確認。下記担当ファイルは同時編集しない。
- 実装担当A: Point Curves の接続準備。`apps/web/src/processing/pure.mjs` と新規専用試験ファイルだけを編集する。`photo-policy.ts`、session/UI/workerは読取り。
- 実装担当B: 手動キャンバス拡張のWorker接続準備。`apps/web/src/processing/{index,worker}.mjs` と新規専用試験ファイルだけを編集する。Recipe/session/UIは読取り。
- 実装担当C: Glow のRecipe入力検証。`apps/backend/src/photo-policy.ts` と新規専用試験ファイルだけを編集する。renderer/session/UIは読取り。既存のGrain/Levels検証を保持する。

担当CのGlow検証と専用試験が提出済みのため、次の独立1件はPoint CurvesのRecipe入力検証に割り当てる。同じ `apps/backend/src/photo-policy.ts` と新規専用試験ファイルのみ。既存Glow/Grain/Levelsを保持し、Aの点列契約と一致させる。担当Aのpure.mjsとは重複編集しない。

担当Bの手動キャンバス拡張Worker接続は提出済み。次は読取り専用で同機能のProxy/Final寸法・Cropとの順序・Recipe保存・Undo/Redo・Exportに必要な接続条件を独立レビューし、メインへ具体的に返す。ソース編集を増やさず、共有ファイルを同時に触らない。

担当AのPoint Curves renderer接続は提出済み。Aは以後読取り専用の独立44件候補照合へ移り、`apps/web/src/processing/pure.mjs` の排他編集権はメインへ返す。メインはPoint Curves接続を保持してGlow等のrenderer統合を行う。

担当CのPoint Curves validatorは提出済み。次の確認済み独立項目として Mobile Post-Crop Vignetting を割り当てる。Cは `apps/backend/src/photo-policy.ts` と新規専用試験ファイルのみで、既存 `applyVignette` の `amount`（-100..100）を保存する最小typed extensionの厳密検証を追加する。旧Recipe、Glow、Point Curves、Grain、Levelsは維持し、renderer/session/UIへは触れない。実接続と完了判定はメイン。

担当Cの上記保存検証は提出済み。次の排他担当としてCへ `apps/web/src/processing/pure.mjs` と新規専用レンダラ試験のみを渡し、既存の `rotateCropPixels` の後へ `applyVignette` を接続する。新しい `processingOrder` stageは禁止し、既存Schema/順序を維持する。メインはCの提出までpure.mjsを編集せず、session/UIと全体統合を担当する。

担当Aは一次独立37件の元ID・名称を読取り照合済み。次は新規 `docs/UNIQUE_FEATURES_CONFIRMED.md` のみへこの37件と出典、追加7件未回収の限界を書き、44件の確定リストと誤認させない。担当Bは手動キャンバス拡張の正規化余白をProxy/Finalへ投影する新規 `apps/web/src/processing/canvas-expand-projection.mjs` と専用試験のみ。既存canvas-expand実装、共有renderer/session/UI/validatorは読取り。両者とも別担当ファイルは編集しない。

接続準備だけで完了数を増やさない。メインが画面・保存・再読込・Undo/Redo・Finalまで一件ずつ確認して進捗を更新する。

## 2026-10-04 独立未実装42件を優先（最新）

ユーザー指定により重複候補の統合は保留し、確認済みの独立未着手42件を優先する。前工程のPreset facadeは新規2ファイルと試験結果を保持するが、UI/実サービスへの接続はこの工程では進めない。4担当は1件を処理・UI・保存/Export・回帰まで完了してから次を受け取る。担当の完了報告と共有接続はメインが確認する。

- メイン: 共有 `apps/web/src/{session,editor-ui,feature-catalog}.mjs`、`apps/web/src/editorial-editor.css`、既存Recipe/renderer/Exportと全体試験。実装担当の機能を共有経路へ接続し、成果を検証する。サイドの担当ファイルは編集しない。
- 実装担当A: 次の独立1件は Grain。新規 `apps/web/src/processing/grain.mjs` と `apps/web/tests/grain.test.mjs` のみ。既存のRecipe/renderer/UIは読取り。
- 実装担当B: 次の独立1件は Desktop Export size。新規 `apps/web/src/export-size.mjs` と `apps/web/tests/export-size.test.mjs` のみ。既存のExport/UIは読取り。
- 実装担当C: 次の独立1件は RGB Levels。新規 `apps/web/src/processing/levels.mjs` と `apps/web/tests/levels.test.mjs` のみ。既存のRecipe/renderer/UIは読取り。

各担当は実処理と境界試験を作り、共有接続に必要なパラメータをメインへ返す。メイン接続前の部品単体は機能完成と表示しない。同一ファイルの同時編集を禁止し、次の担当ファイルは割当を更新してから渡す。

次項目への排他割当（前項目の単体処理・試験は提出済み。製品接続と完了判定はメインが継続）:

- 実装担当A: RGB/channel Point Curves の新規 `apps/web/src/processing/point-curves.mjs`、`apps/web/tests/point-curves.test.mjs` のみ。
- 実装担当B: Manual canvas Expand の新規 `apps/web/src/processing/canvas-expand.mjs`、`apps/web/tests/canvas-expand.test.mjs` のみ。
- 実装担当C: Mobile Glow Effect の新規 `apps/web/src/processing/glow.mjs`、`apps/web/tests/glow.test.mjs` のみ。

## 2026-10-04 未接続機能の段階実装と重複統合（最新）

ユーザー指定により、明確に別機能と確認した37表示項目から実装を進め、担当は1件を実装・検証してから次を受け取る。名称が違っても同一処理の項目は共通処理へまとめ、固有の操作・出力は失わない。未確定の Mobile Effects は保留し、人物解析のプライバシー停止条件を迂回しない。既存の Recipe/RAW/Export/権限/課金契約は変更しない。

- メイン: 候補キュー、共有 `apps/web/src/{session,editor-ui,feature-catalog}.mjs` と既存 processing 接続、統合・回帰・最終判定。旧担当の編集は停止。重複候補の最終意味判定も担当。
- 実装担当A: 最初の1件はヒストグラムとクリッピング。`apps/web/src/processing/histogram.mjs` と `apps/web/tests/{histogram,histogram-session}.test.mjs` のみ。既存UI/Recipe/rendererは読取り。動作する計算・session接続回帰まで検証し、共有UI接続はメインへ返す。
- 実装担当B: 最初の1件は書き出しファイル名指定。`apps/web/src/export-naming.mjs` と `apps/web/tests/{export-naming,export-naming-ui}.test.mjs` のみ。既存Export/Recipe/UIは読取り。安全な命名計算・衝突/不正名・UI経路の回帰を検証し、共有接続はメインへ返す。
- 重複統合担当: Preset共通操作の新規 `apps/web/src/preset-facade.mjs` と `apps/web/tests/preset-facade.test.mjs` のみ。Personal/Workspace/Authorの差分を内包し、未実装のCommunityはfail-closed。既存backend、Recipe、権限、保存形式、共有UIは読取り。ほかの重複候補は共通処理と固有差分を照合してメインへ返す。

新規moduleと試験の担当を次項目に再割当する際は、メインが先にこの節へ排他的範囲を追記する。同一ファイルへの同時編集や、計算moduleだけを完成機能として表示することは禁止。

## 2026-10-03 Cloudflare専用コピー引継ぎ（最新）

停止中の別PCタスクは再開・連絡しない。元SUITEと既存Sitesは全員読取りのみ。専用コピー内でメインが最終統合する。

- メイン: `apps/sites/db/schema.ts`、`apps/sites/drizzle/0003_suite_sites.sql` とmeta、`apps/sites/build-cloudflare.mjs`、`apps/sites/cloudflare/wrangler.example.jsonc`、`apps/web/src/{sites-client,editor-ui,admin-login-ui}.mjs`、共有契約・配備準備・最終回帰/Evidence。
- `cf_auth`: `apps/sites/src/{cloudflare-identity,cloudflare-entry}.mjs` と `apps/sites/tests/cloudflare-auth.test.mjs` のみ。D1 session台帳の契約変更はメインが決定。完了後編集停止。
- `cf_storage`: 新規 `apps/sites/tests/{cloudflare-storage,cloudflare-artifact}.test.mjs`、`docs/CLOUDFLARE_{STORAGE,ARTIFACT}_CHECK.md` のみ。既存Worker/Schema/configは読取り。完了後編集停止。
- `cf_verify`: 新規 `apps/sites/tests/cloudflare-integration.test.mjs`、`docs/CLOUDFLARE_QA_CHECK.md` のみ。認証・所有者・失効の独立試験。完了後編集停止。

旧割当は専用コピーのこの工程では上書きせず凍結。共通API/Recipe v1/既存DB表/保存6契約の再設計はしない。外部接続結果はローカルPASSと別Gate。

## 2026-10-03 公開Web試用・Sites配備再開

前節Bの写真一覧実装と試験は統合済みで担当作業終了。今回の配備前スコープ表示に限り、メインが `apps/web/src/editor-ui.mjs`、`apps/web/src/styles.css` を排他的に引き継ぐ。共有API/Schema/Sites接続、最終Build・回帰とEvidenceもメイン。現在これらのファイルを編集するサイド担当は置かない。旧担当成果・凍結Evidenceは保持する。

## 2026-10-03 公開Web試用・写真一覧の排他的担当

- Main: `contracts/recipe-v1.schema.json`、`packages/SuiteCore/Sources/SuiteCore/Recipe.swift`、`apps/sites/src/worker.mjs`、必要な新規管理認証module、`apps/web/src/bootstrap.mjs`、共有API/schema/統合/全回帰/Evidence/Sites公式操作。既存コードを再利用し、公開切替は安全確認後のみ。
- A `preset_review`: 新規 `apps/web/src/browser-local-api.mjs` と `apps/web/tests/browser-local-api.test.mjs` のみ。匿名ブラウザ内のRAW/Recipe永続化と復元。共有端末/Cloudの所有者認証と混同しない。
- B `sites_gap_review`: `apps/web/src/editor-ui.mjs`、`apps/web/src/styles.css`、新規 `apps/web/tests/filmstrip-interaction.test.mjs` のみ。iPad横スワイプ/慣性、誤選択防止、マウス/トラックパッド、選択表示と多枚数状態保持。bootstrap/Worker/Schemaへ触れない。
- C `astra_safety_review`: 読取り専用。公開匿名境界/管理者二要素/既存テナント分離/期限・取消の矛盾をレビューし、試験案を返す。製品ソース・凍結Evidenceは編集しない。

前工程の担当成果は保持し、この節の対象ファイルのみ再割当する。同一ファイルの同時編集を禁止する。

親担当のみが割当を変更する。元資産は全員読み取り専用。共有契約変更は親が調整する。

| 担当 | 書込み可能ファイル | 責務 |
| --- | --- | --- |
| editing_storage | packages/METISMobileCore/**, packages/SuiteCore/** | 共通Mobile Core、UI非依存Recipe/履歴/保存境界、単体試験 |
| release_requirements_review | apps/apple/Suite/Features/iPhone/** | iPhone専用UI |
| ipad_ui | apps/apple/Suite/Features/iPad/** | iPad専用UI |
| policy_review | docs/REUSE_AUDIT.md, docs/FINAL_AUDIT.md | 元資産調査、仕様欠落監査（実装ファイルは読み取り） |
| raw_harness（追加） | scripts/raw-harness.mjs, scripts/raw-harness.test.mjs, docs/RAW_QA.md | checkout外の実RAW manifest・負荷測定runner。代用RAW禁止。backend/native/共有契約は変更しない |
| メイン | 上記以外 | 正本/共有契約、AppModel/共通UI/Provider接続、backend、ルート構成、最終統合、ビルド/テスト |

同時上限はメイン＋サイド3名。Phase 0資産監査完了後はその枠をUI担当へ回す。全並列ではなくMobile Core契約確定→独立実装の段階並列とする。仕様欠落監査は実装担当完了後に読み取りで実施する。

統合フェーズ追記: editing_storageは既存package内でRecipeDocument共通JSONとSession Lookの非破壊データ境界のみを担当。policy_reviewは最終監査、raw_harnessは外部RAW試験基盤を担当。メインがbackendとの整合、Apple adapter、実行試験、追加指示正本化を統合する。新しい6領域API/providerは採用しない。

## 提出準備・比較監査フェーズ（2026-10-03）

固定6文書・147節・製品契約は全員変更禁止。メイン以外の担当は下記ファイルのみ編集する。

| 担当 | 書込み範囲 | 責務 |
| --- | --- | --- |
| evoto_audit | docs/EVOTO_AUDIT.md, docs/evoto-audit.json | Evoto公式情報と現ソース/実行証拠に基づく詳細差分A–G・操作連鎖・差分台帳。仕様を追加/削除しない |
| apple_submission | docs/APPLE_SUBMISSION/** | Apple公式要件・提出用草案/未確定/プライバシー/権利/審査手順。実提出/アップロードなし |
| mobile_gate_audit | docs/MOBILE_DEVICE_QA.md | iPhone/iPadそれぞれの一連の操作、実測Gate、必要環境、実装不足とNOT RUNの分離。コードは読取り |
| メイン | 上記以外 | 回帰再実行、Evidence固定、成果検証、正本状態/引継ぎの更新。新provider/API/保存契約/Web追加なし |

## Crop / Print / Export追加指示受領後

ユーザー添付7d15ef1dの16節を別正本に追加する明示承認を受けた。既存147節・固定6文書は維持。先行する提出/比較監査の成果を保持し、担当を次に限定して切り替える。

| 担当 | 書込み範囲 | 責務 |
| --- | --- | --- |
| apple_submission（Core担当へ変更） | packages/SuiteCore/Sources/SuiteCore/CropExport.swift、packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift、apps/backend/src/crop-export.ts、apps/backend/tests/crop-export.test.ts、contracts/fixtures/print-presets.json、docs/PRINT_PRESETS.md | 一次情報の実寸catalog、Swift/TSの非破壊設定モデル・計算・追加単体試験 |
| mobile_gate_audit（UI担当へ変更） | apps/apple/Suite/Shared/CropExportControls.swift | Crop/Export設定UI・Proxy上Crop枠。既存View/EditorModelは変更しない |
| evoto_audit | docs/EVOTO_AUDIT.md、docs/evoto-audit.json | 最新正式追加30比較項目、A–G、workflow。製品ソース変更禁止 |
| メイン | 上記以外 | 添付正本/追加16節trace、既存Recipe拡張枠での接続、renderer/UI接続、統合試験・回帰・Evidence・ハンドオフ |

製品の保存同期契約・API/providerは変更しない。追加Crop/Exportは既存Recipeのnamespaced拡張データに保存し、旧Recipe/golden fixtureは保持する。未検証nativeをPASSとせず、出典不明実寸は無効候補に残す。

Evoto162項目初期監査完了後の追加試験担当: evoto_auditは `apps/backend/tests/crop-integration.test.ts` と `apps/apple/Tests/CropExportPipelineTests.swift` の新規2ファイルだけ追加編集可。現行productionソースは読取り。監査2ファイルの成熟度更新も担当のまま。親が最終統合し、元のWIN/NAT IDを維持して追加IDを採番する。

## Workspace / Team / Cloud / Billing追加45節

3原文を `WORKSPACE_SPEC_PART_1/2/3.md` として独立追加。旧147節・固定6文書・進行中Crop16節の削除/置換は禁止。

| 担当 | 排他的書込み範囲 | 責務 |
| --- | --- | --- |
| mobile_gate_audit | apps/backend/src/workspace.ts、apps/backend/tests/workspace.test.ts、docs/WORKSPACE_BACKEND.md | SQLite上のmembership/role/project/共有version競合/preset/selection/gallery/audit。既存repository/server/providerは読取り |
| evoto_audit | apps/backend/src/workspace-storage.ts、apps/backend/tests/workspace-storage.test.ts、docs/STORAGE_PROVIDER_COMPARISON.md | 容量予約/集計/独立entitlement/config注入・安全なdowngrade、公式provider比較。価格/事業者採用なし |
| apple_submission | 先行Crop担当を完了後に別途限定 | Core/TS実寸catalogとテストを仕上げる。共有ファイルを同時変更しない |
| メイン | 上記以外 | HTTP境界/旧経路迂回防止/統合テスト、署名grant、追加正本trace、Schema・ルート最終統合、全回帰/Evidence固定 |

新SQLiteテーブルは独立モジュールの内部実装。旧assets/recipesや旧Recipe v1を置換しない。ユーザーが明示承認したWorkspace追加HTTPのみを隔離し、旧6領域contract・StorageProvider interfaceは維持する。認証・Cloud/Billing本番未接続を成功として数えない。

## 再開後の有効な割当（以前の担当は編集停止）

Sol 6.1実装／Astra設計レビューはユーザー指定の運用方針であり、性能比較の結論ではない。

| 担当 | 排他的書込み範囲 | 状態・責務 |
| --- | --- | --- |
| sol_integration / Sol 6.1 | backendのworkspace-server/server/auth/repository/workspace-access、対応HTTP/grant試験、SuiteApp.swift | 統合不具合修正。レビュー対応後メインへ返却 |
| workspace_core_resume | workspace.ts、workspace.test.ts、WORKSPACE_BACKEND.md | 完了・編集停止。レビュー修正時は親が再割当 |
| workspace_storage_resume | workspace-storage.ts、workspace-storage.test.ts、STORAGE_PROVIDER_COMPARISON.md | 完了・編集停止。レビュー修正時は親が再割当 |
| astra_safety_review / Astra | 書込みなし | 権限/CAS/原本/容量/中断復旧を読取りレビュー |
| sol_evoto_inventory / Sol 6.1 | docs/EVOTO_AUDIT/**、scripts/evoto-deep-audit*.mjs | v2/v3の公式記事・最小機能・platform・未確認の監査。製品実装を追加しない |
| メイン | その他、scripts/pricing-model*.mjs、価格案/統合Evidence/引継ぎ | 候補価格保存、設定入力の試算、全回帰、最終統合。共有Schema/正本はメインのみ |

価格添付28節は独立した事業設計Baseline。販売設定・契約・本番接続は行わず、試算のPASSをPricing Gateや課金接続の合格にしない。

## Evoto Zero-Miss再監査の有効割当

現行状態と次割当は [PARALLEL_WORK_BOARD.md](PARALLEL_WORK_BOARD.md) で管理。合計4名の実枠内で継続し、空き担当は成果・確認結果回収後に独立仕事へ再割当する。新規監査Evidenceは既存Evidenceを上書きしない。

旧担当は完了・編集停止。124 PASSを回帰Baselineに固定。製品ソースと旧147/固定6文書は編集しない。

| 担当 | 排他的書込み | 責務 |
| --- | --- | --- |
| evoto_photo_review / Sol 6.1 | docs/EVOTO_AUDIT/reviews/photo.json、同photo.md | REVIEW_ASSIGNMENT photo cohortの全本文・最小操作・slider・条件を意味照合 |
| evoto_mobile_tether_review / Sol 6.1 | docs/EVOTO_AUDIT/reviews/mobile_tether.json、同mobile_tether.md | 同mobile_tether cohort、Mobile/iPad/全tetherをplatform別に意味照合 |
| evoto_workflow_review / Astra | docs/EVOTO_AUDIT/reviews/workflow.json、同workflow.md | 同workflow cohort、Library/Team/credit/Video等の差分と分類を意味照合 |
| 親 | 上記以外、共有generator/validator/Feature Master/統合報告 | Release Notes/App Store公式取得、逆引き統合、独立再照合、Baseline/全回帰/Evidence固定 |

主記事IDは3担当に重複なく分割。補助記事は読むだけ。各担当は機能出典と記事/見出しのdispositionを返し、共有Masterは親だけが更新する。未知の本文やimage-only controlを検証済みにしない。P0/P1は監査完了後に親が一括確定し、その前に個別製品実装を行わない。

### 成果回収後の次割当

- photo43本文・386見出し・1484source-bound factsを受領（factsは条件/情報を含み独立機能数ではない）。photo.json/mdは編集停止。evoto_photo_reviewは公式Web機能landing111の全本文→alias/最小操作照合へ再割当。排他的ファイルはreviews/web_features.json、web_features.mdのみ。
- evoto_workflow_reviewはworkflow89の完了後、現行英語/Japan料金およびMobileカラーCreditの公式矛盾を別reviewへ照合。追加排他的ファイルはreviews/credit_current.json、credit_current.md。既存workflowの最終版は変更せず別成果にする。
- メインは既存Evidenceを上書きせず、独立semantic snapshotとEvidenceへ統合。原本/契約/製品Schemaは変更なし。
- mobile_tether108本文・964見出し・1949source-bound records受領。元reviewは編集停止。evoto_mobile_tether_reviewへSupport index261固有href/追加ALIAS82の逆引き照合を再割当。排他的ファイルreviews/index_reverse.json、index_reverse.mdのみ。canonicalへ解決しても他Platform全機能を継承しない。
- workflow89本文・817見出し・1073records、credit_current5一次資料・13policy rowsを受領、元Evidence編集停止。Astra evoto_workflow_reviewをFeature Parity独立レビューへ再割当。排他的ファイルreviews/parity_validation.json、parity_validation.mdのみ。shared Master/元レビューへの訂正は親が独立追補に保存する。
## 2026-10-03 追加監査の排他的再割当（親による最新指定）

- メイン: docs/EVOTO_AUDIT/tools/*、親の追補 reviews/parent_sources.json、reviews/discovered_routes.json、freeze manifest、統合Registry、新規Evidence、INTEGRATED_REPORT/HANDOFF/PARALLEL_WORK_BOARD。製品契約・schema変更なし。
- Sol6.1 evoto_photo_review: reviews/web_features.json/md 完了後凍結。次は reviews/web_alias_mapping.json/md のみ。111page間および既存本文との同一操作・alias照合。
- Sol6.1 evoto_mobile_tether_review: reviews/mobile_tether.json/md と index_reverse.json/md は凍結。次は reviews/cross_source_mobile.json/md のみ。App Store25履歴＋公式Mobileと既存108記事の明示的同一操作・差異を照合。
- Astra evoto_workflow_review: workflow.json/md、credit_current.json/md、parity_validation.json/md は受領後凍結。次の訂正ツール／Registry再レビューは reviews/parity_recheck.json/md のみ。共有ファイルを編集しない。

元Evidenceは本文・判定・引用位置を含め上書き禁止。訂正は別Evidence＋元sourceFactKey＋指摘IDで対応させる。新規Featureは仕様昇格・製品実装を行わない。

### Credit163追補の担当

Astra evoto_workflow_review は reviews/credit_normalization.json/md を排他的に担当。元workflow1073のうち既知creditがNOT_DOCUMENTEDで隠れた163件を、消費イベント・Platform/Plan/地域条件・矛盾・UNKNOWN別に全件確認する。parity_recheckとともに新規Interpretationのみ。メインは458Workflow所属、26URL、canonical registryを担当。

### Workflow458追補の担当（Mobile別source照合完了後の再割当）

Sol6.1 evoto_mobile_tether_review は reviews/workflow_normalization.json/md のみを排他的に担当。元workflow458操作のsourceFactKeyごとの複数所属・stage・source順序を整理し、未検証chainはNOT_VERIFIED。cross_source_mobile.json/mdは凍結。親は解釈結果をRegistryへ統合するだけで同ファイルを書かない。

## 最新：実装中心4名編成（過去割当をこの範囲で更新）

- メイン：packages/SuiteCore/Sources/SuiteCore/PortraitRecipe.swift、apps/backend/src/portrait-recipe.ts、apps/backend/src/photo-policy.ts、共有Recipe検証・docs/CHANGE_NOTICEと統合・回帰ツール／報告。既存6契約／147節不変。
- Sol6.1 evoto_photo_review：apps/apple/Suite/Services/PhotoPipeline.swift、Services/PortraitPipeline.swift（新規）、EditorModel.swift、Shared/EditorComponents.swift のみ製品編集。既存iPhone/iPadは共通controls経由で接続。共有Core/backend/schemaは編集禁止。元監査成果はcheckpoint保存・編集停止。
- Sol6.1 evoto_mobile_tether_review：docs/EVOTO_AUDIT/reviews/audit_continuation.json/md のみ。監査1名。workflow_normalization保存済み・凍結。監査の完了を実装開始条件にしない。
- Astra evoto_workflow_review：apps/backend/tests/portrait-recipe.test.ts、packages/SuiteCore/Tests/SuiteCoreTests/PortraitRecipeTests.swift、apps/apple/Tests/PortraitPipelineTests.swift、docs/PORTRAIT_REVIEW.md。独立検証と重大設計レビュー、製品実装ファイルは編集禁止。Mac未実行をPASSにしない。

中間監査Evidence registry-01、web_alias checkpoint、credit163、workflow458を保全。全員で監査へ戻らない。空き担当に依存解消した非重複仕事を割り当てる。

### メイン統合の追加担当ファイル

メインのみ `apps/backend/src/repository.ts`、`packages/SuiteCore/Sources/SuiteCore/Recipe.swift`、`Project.swift` を編集。Face BrightnessのAsset/checksum拘束を保存・再読込・全Undo/Redo履歴に適用する。DB schema、既存Recipe v1 envelope、HTTP API、固定6文書は変更しない。Astraは対応試験のみを編集する。

`apps/backend/src/workspace.ts` のShared Recipe保存・読込への同じ検証接続もメイン専有。既存CAS/競合branch/権限は維持。Person UUID→anchor対応の履歴検証は新DB列を追加せず保存済みRecipeから照合する。

`packages/SuiteCore/Sources/SuiteCore/ProjectStore.swift` もメイン専有。保存済checkpointを別historyで置き換える際の人物UUID/anchor再拘束のみ追加する。checkpointファイル形式/CAS/原本保持/既存Undo分岐規則は維持。

成果回収後: Sol evoto_photo_reviewは製品4files編集停止、`docs/FACE_BRIGHTNESS_NATIVE_QA.md` だけへ再割当。メインは `apps/apple/Package.swift` と `apps/apple/QA/RawQAAdapter.swift` のMac QA source包含・公式initializerの最小統合修正を担当。Astraはテスト20件保存後の読取りレビューを継続。監査Solはaudit_continuationを完了保存・編集停止。

### 共通人物整合Gateの最新追加割当

- メイン: 新person-geometry.ts / PersonGeometryIntegrity.swift、portrait bridge接続、共有Gate統合、Evidence diagnostics・最終回帰。既存network API/DB schema/Recipe envelope不変。
- メイン追加: PhotoPipelineのFinal信頼checkpoint照合とPhotoLifecycle.swiftのExportPlan Asset/checksum検証のみ。Solの再専有はEditorModelだけのまま。
- Sol evoto_photo_review: EditorModel.swiftだけを再専有。load/select/import/再検証失敗/不正Person選択の旧選択無効化。内部storageRoot test seamは既定動作互換、外部APIではない。Native QA docも担当。
- Astra: 新person-integrity-paths.test.ts排他、Core/Apple人物試験追加とPORTRAIT_REVIEW追記。個別PGI経路をWindows data boundaryとNative実行へ分離。
- Sol evoto_mobile_tether_review: PERSON_INTEGRITY_GATE.md / PERSON_INTEGRITY_PATHS.jsonだけ新規排他。元監査全成果保存・凍結、Source実装は編集しない。

### 最終回収後の所有権 — 前工程（凍結）

全担当の製品/試験/新Gate文書を受領し、全154 Windows回帰/Native112 NOT_RUN/文書10PASSをメインで実測。前工程は編集停止、凍結Evidence不変。

### 最新：ユーザー許可Web先行工程（この範囲を最優先）

担当契約はWEB_IMPLEMENTATION_CONTRACT.md。合計4名、同時編集なし。全員実装開始可。
- メイン: apps/web/src/{session,api-client,bootstrap}.mjs、apps/web/{local-server,build}.mjs、package、shared validator、統合/Evidence。
- A evoto_photo_review Sol6.1: apps/web/src/processing/**、docs/WEB_PROCESSING.md のみ。
- B evoto_mobile_tether_review Sol6.1: apps/web/index.html、src/editor-ui.mjs、src/styles.css、docs/WEB_UI_REVIEW.md のみ。
- C evoto_workflow_review Astra: apps/web/tests/**、docs/WEB_SAFETY_REVIEW.md のみ。製品ソース読取りレビュー。
Apple、旧147/6固定文書、元監査、旧実行Evidenceは編集禁止。今回の明示許可はWeb実装限定でApple Gateを合格へ変えない。

### 最新ユーザー指示：Web招待試用成立（4名）

- メイン: 前記共有範囲＋apps/web/{invite-auth,author-store,trial-server,invite-admin}.mjs、src/trial-client.mjs、統合docs/Evidence。旧SQLite/HTTPは変更せず、trial専用DB/routeの追加判断はメイン。
- A evoto_photo_review: docs/WEB_SDK_PRIVACY_REVIEW.mdとWEB_PROCESSING.md。SDK通信確認1名専任、processing sourceは最小遅延import修正完了後読取りのみ。
- B evoto_mobile_tether_review: 旧UI4files＋apps/web/src/{author-ui,login-ui}.mjs。作者ログイン/下書き/提出/レビュー/共通Preset UI。共有session/API/backend読取り。
- C evoto_workflow_review Astra: apps/web/tests/{trial-auth,author-submissions}.test.mjsのみ新規専有。旧69試験/元Evidence不変。重大境界レビュー・独立試験。

実RAW素材/外部URL未接続は独立BLOCK。顔SDK未解決は人物処理だけ停止し、RAW/global/保存/Export/作者保存を止めない。新しい料金/provider/Apple課金方式や招待先本人のアクセスを勝手に確定/作成しない。

### Sites接続の追加所有（4名、同時編集禁止）

- main: apps/sites/**、apps/web/preset-policy.mjs、src/preset-author/**、src/sites-client.mjs＋前記shared/client/server/docs。Sites tools/checkout/publishはmainのみ。ユーザー本番公開禁止につきdeployしない。
- A: docs/SITES_LIMITS_REVIEW.md、WEB_RAW_INPUT_REQUIREMENTS.md、apps/web/tests/multipart-client.test.mjs＋新results/multipart-client-*。Sites source/toolsは触らない。
- B: 前記UIのみ。外部portablePresetRecipe/authorSubmission再利用、admin承認/commonPreset導線追加。
- C: 新trial2tests＋sites-worker.test.mjs、新results/trial-independent-*、重大設計read-only review。旧Evidence/テスト上書き不可。

処理source→UI→独立試験→main統合、NOT_RUNを実画像成功にしない。終了担当へ次の非重複仕事を渡す。

### 最新: 招待期限統合・非公開専用Site許可

ユーザーは新規SUITE専用Siteの非公開招待配備を許可。既存Siteは転用/上書き/削除禁止。create_siteは429でBLOCK、許可を成功Evidenceに変換しない。
main: 上記所有＋scripts/web-trial-ui-seed.mjs（明示的ローカルQA識別のみ）、期限サーバー/台帳/共有integration/新Evidence。B: UI期限と管理者日時/取消、Sites signoutのみ完了freeze。A: SDK停止維持・quota安全レビュー新規追補完了freeze。C: owned3試験の期限/保持/CloudSafe障害独立検証→最新Evidence→freeze。合計4名上限。

### 最新: 編集機能不足の解消とSites引継ぎ

ユーザーが既存 `eclat-genseki-demo.bals-enter.chatgpt.site` を今回SUITE用と明示し、旧データ破棄を許可。上の「既存Site転用禁止」はこの特定Siteに限り上書きする。他Siteは対象外。旧Site version 33は復元可能な履歴として残す。

- メイン: Sites対象IDの確認・アクセス設定・ソース統合/公開、共有Recipe検証、apps/web/src/{session,editor-ui}.mjs と processing/pure.mjs の接続、必要な共有契約・統合回帰。Siteの書込/公開はメインのみ。
- A evoto_photo_review: apps/web/src/processing/color-adjustments.mjs と apps/web/tests/color-adjustments.test.mjs のみ。色・明るさ・HSLの独立純粋画素処理。
- B evoto_mobile_tether_review: apps/web/src/processing/detail-adjustments.mjs と apps/web/tests/detail-adjustments.test.mjs のみ。明瞭度・テクスチャ・シャープの独立純粋画素処理。
- C evoto_workflow_review: docs/EDITING_GAP_MATRIX.md と apps/web/tests/editing-integration-independent.test.mjs のみ。18項目・一次情報・AI差分、統合後の独立試験。Sites接続経路は読取り調査のみ。

旧154 Windows/既存Web回帰と凍結Evidenceは変更しない。8bit sRGB後段の人工画素試験を実RAW/RAW段階WB・ハイライト復元/Apple実機の合格へ転記しない。最新の明示指示によりWeb実装を先行、配色は白背景方針を後工程とする。
## 2026-10-03 Web招待試用再開の排他的担当

- Main: 共有Preset/Recipe接続（`apps/web/src/preset-author/preset-author-contract.mjs`、`apps/web/preset-policy.mjs`、`apps/web/src/session.mjs`、`apps/web/src/author-ui.mjs`）、統合・回帰・Sites公式操作。既存Site以外に触れない。
- preset_review: 新規 `apps/web/tests/portable-postdecode-preset.test.mjs` の独立試験だけ。製品/共有契約ファイルは編集しない。
- preset_review の次割当: 新規 `apps/web/tests/crop-fixed-ratios.test.mjs` の固定9比率・履歴・保存・Synthetic Final独立試験だけ。
- sites_gap_review: 新規 `scripts/prepare-sites-checkout.mjs` と `scripts/tests/prepare-sites-checkout.test.mjs` の非Deployソース準備だけ。既存Site/共有設定を変更しない。
- raw_wb_review: RAW段階WB/8-bit境界の読取り設計レビューのみ。実装・Apple/Sites操作なしで終了。

共有API、DB schema、Recipe v1外形、正本の最終統合はMainのみ。旧Evidenceは不変、新実行結果を別Evidenceへ保存する。

## 2026-10-08 SOL残り3件・コード先行（今回の指示）

ユーザー指定により、検査・実験・アプリ接続は後段。Astra中心17件と混合16件には触れない。既存の共通契約・Recipe・認証・配備は変更しない。

| 担当 | 排他的書込み範囲 | コード作業 |
| --- | --- | --- |
| sol_export_size | `apps/web/src/export-size.mjs` のみ | Desktop Export size の純粋な寸法処理。既存動作を維持し、未決の製品意味は推測しない。 |
| sol_output_adjustments | `apps/web/src/export-output-adjustments.mjs` のみ | Desktop Output adjustments の純粋な出力処理。元製品の未公開数値との同等性は主張しない。 |
| sol_cross_device | `apps/web/src/cross-device-compat.mjs` のみ | Desktop ↔ iPad compatibility のデータ処理。認証・Apple/Web接続は行わない。 |
| メイン | 上記以外 | 排他調整、差分確認、コード進捗報告。テスト・実験・配備なし。 |

## 2026-10-08 混合16件・Astraコード先行

ユーザーの「スタート」により、直前のAstra/混合作業待機を解除する。Sol担当の上記3ファイルは凍結し、混合候補の既存コードをAstraが引き継ぐ。まず16件の正式名とファイル境界を照合し、重複しない純粋コードを並列に書く。検査・実験・アプリ接続・配備・Astra中心17件は今回の範囲外。親が個別の排他ファイルを指定するまで共有ファイルを編集しない。

初回排他: `mixed_shadow_gap` が Add Shadow 一項目を所有し、`apps/web/src/processing/add-shadow-runtime.mjs` と新規 `apps/web/src/processing/add-shadow-geometry.mjs` のみ編集する。他担当は両ファイルを読取り専用とする。

並列排他: `mixed_inventory` が Facial Reshape / Nose 一項目を所有し、新規 `apps/web/src/processing/nose-reshape.mjs` のみ編集する。既存の手動水平変形や顔モデルは読取り専用。認識結果を捏造せず、明示的landmark入力を要求する純粋処理に限る。`mixed_canvas_gap` は引き続き読取り専用。

Add Shadow続行: 同じAstra担当 `mixed_shadow_gap` が新規 `apps/web/src/processing/add-shadow-backdrop-placement.mjs` と自身の `add-shadow-runtime.mjs` のみ排他編集し、異寸法背景の明示的配置コードを担当する。既存同寸法動作、本人/背景Asset evidence、保存契約は維持する。

別項目の並列排他: `mixed_inventory` が Makeup / Highlight の新規 `apps/web/src/processing/makeup-highlight-landmark-mask.mjs` のみを所有する。既存手動highlight処理/共有顔検出器は読取り専用。明示された顔要所landmarkからの純粋mask生成のみを実装し、自動認識・認証済み製品接続を偽装しない。

別項目の並列排他: `mixed_canvas_gap` が Facial Reshape / Eyebrows の新規 `apps/web/src/processing/eyebrow-reshape.mjs` のみを所有する。左右独立/連動と元5幾何操作の純粋画素コードを担当。顔landmark認識/本人権限/画面接続は未接続のまま明示する。

### 16件すべてのコード作成・継続割当

検査・実験・ビルド・アプリ接続・配備なし。既存処理を引継ぎ、不足処理コードを追加する。未提供のモデルを捏造せず、依存が残れば明示する。
- mixed_inventory: Nose / Eyebrows / Highlight。processing/faces.mjs、nose-reshape.mjs、eyebrow-reshape.mjs、makeup-highlight-landmark-mask.mjs、および新規 processing/face-feature-*.mjs を排他所有。詳細顔landmark抽出を共通提供。
- mixed_canvas_gap: Blush / Contacts / Eyelashes / Eyeliner / Eyeshadow / Face Decorations。既存 manual-{blush,contacts,eyelash,eyeliner,eyeshadow,face-decoration}*.mjs と新規 processing/makeup-*.mjs（makeup-highlight-* は除外）を排他所有。
- mixed_shadow_gap: Clothing adjustments / Hands / Teeth。既存 manual-{clothing,hand,teeth}*.mjs と新規 processing/region-repair-*.mjs、clothing-adjustments.mjs、hands-adjustments.mjs、teeth-adjustments.mjs を排他所有。
- Main: Levels / Add Shadow / Black & White Edge Removal / Batch Edit、上記以外の新規共通コード、進捗文書。共有UI・Recipe・公開設定は変更しない。

上記16件のコード作成分は返却済み。担当はファイルの自動継続編集を行わない。親は `docs/MIXED_16_CODE_HANDOFF.md` と最新進捗欄へ成果・外部モデル資産依存を記録した。今回の検査・実験・ビルド・アプリ接続は未実施。

## 2026-10-08 Astra単独17件・開始

### 最新：残93のうち差分66件、Astraでコード先行

ユーザーがAstra統一・共通処理ごとの並列を承認。資料不足22件と独立候補5件は対象外。`REMAINING_93_OVERLAP_REVIEW.md` の差分追加66行を対象とし、既存で足りる部分は作り直さない。SUITE印刷/SNS仕様優先。他社固有の既定値・課金・形式を無条件移植しない。検査・実験・build・接続・配備なし。

排他初回: mixed_inventory は新規 processing/delta66-makeup-*.mjs（化粧8行）のみ。mixed_canvas_gap は新規 processing/delta66-color-*.mjs（Profile/HSL/Curves/LR-05/Detail）のみ。mixed_shadow_gap は新規 apps/web/src/delta66-preset-*.mjs（Hot Edits/iPad Home/iPad presets/Mobile XMP-CUBE互換）のみ。既存共有コードは全員読取り、足りない契約は親へ報告し変更しない。Mainは残項目と共有方針/進捗を所有。共通化できない難所を薄いwrapperで完成扱いしない。

後続の重複・競合調査: 製品コードは全担当読取りのみ。mixed_shadow_gap は調査成果物 `docs/REMAINING_93_OVERLAP_REVIEW.md` のみ、Mainは `docs/OVERLAP_CONFLICT_RESEARCH.md` と本担当記録のみ編集する。mixed_inventory / mixed_canvas_gap は静的根拠の報告のみ。検査実行・実験・接続・削除なし。

ユーザー「スタート」によりAstra単独17件を開始。コードのみ。試験・実験・build・アプリ接続・配備・モデル取得/課金なし。既存混合16件とSol11件は読取り再利用。共有API/Recipe/保存を変更しない。
- mixed_inventory: Facial Expression / Head Pose / Perfect Shot / AI Facial Recognition。新規 processing/astra-face-*.mjs、astra-perfect-shot.mjsのみ排他編集。既存faces等は読取り。
- mixed_canvas_gap: Generative Expand / Grass Fill / Liquify Background Repair / Mobile Motion Blur / Detail Enhance / Old Photo Restoration。新規 processing/astra-generation-*.mjs、astra-image-model.mjsのみ排他編集。
- mixed_shadow_gap: Personalized AI Look / Smart Culling / Golden Blonde Hair。新規 processing/astra-look-*.mjs、astra-culling-*.mjs、astra-golden-blonde.mjsのみ排他編集。
- Main: HDR Optimization / Original Shadow / Body Hair Removal / Clothing Moiré Removal。新規processing/astra-hdr-*.mjs、astra-original-shadow.mjs、astra-body-hair.mjs、astra-clothing-moire.mjs、および進捗文書を所有。
既存model実adapter（subject-segmentation、masked-inpaint-onnx）と純粋核を再利用。未提供weightsやモデルIO情報を実在すると偽装せず、実装コードと実行依存を分けて報告する。

上記17件の担当コードは返却済み。追加のCulling semantic/people、Golden Blonde専用生成、Look XMP subset/corpusを含む。共有runtimeのgolden-blonde-hair task追加は所有者mixed_canvas_gapの担当。各担当の自動継続編集は終了。成果と残依存は `docs/ASTRA_17_CODE_HANDOFF.md`。検査・実験・ビルド・アプリ接続は行っていない。
