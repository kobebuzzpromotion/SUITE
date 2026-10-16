# SUITE AI実装指示書：効率化設計と現行差分（再作成）

作成日: 2026-10-11。過去の詳細MDの復元物ではなく、現存するユーザー添付指示・現行コード・公式資料から再作成した実装基準。元MDを見つけたとは扱わない。正本は本ファイル。作業IDの詳細は `AI_IMPLEMENTATION_BREAKDOWN_2026-10-09.md` と対応付ける。

## 1. 変えない方針

- 人物向け写真編集。原本・旧履歴・保存設定を保持する。
- 通常の人物補正、顔照合、既存背景の合成は端末内。毎回の生成課金を発生させない。
- 新規生成だけ別の有料処理。モデル名・価格を通常補正に埋め込まない。
- 採用済み顔照合はYuNet 2023mar FP32＋SFace 2021dec FP32、OpenCV 4.13.0 C++。選定をやり直さない。
- 共通コードを先に実装し、AI工程後にMacでApple/Xcode統合。メーカー資料提出と回答後のSDK最終接続は後工程。
- HDRは初期リリース外。大判コードは保持。コスプレ専用の追加要望は改めて指示されるまで広げない。
- 今回はコード作成を先行。推論品質・実写真・実カメラ・実機の合否は未実施として分離する。

## 2. モデル資産の確定値

以下は公式Git LFS pointerを2026-10-11に読み取った配布側の値。バイナリ取得後の実測確認とは区別する。

|用途|ファイル名|期待bytes|期待SHA-256|
|---|---|---:|---|
|顔検出|face_detection_yunet_2023mar.onnx|232589|8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4|
|写真間照合|face_recognition_sface_2021dec.onnx|38696353|0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79|

配布側の根拠:
- https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx
- https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx

取得時はモデル本文を一時保存し、サイズとSHA双方の一致後に確定する。上記raw URLはモデル本体ではなくLFS pointerを返すため、それをONNXとして保存しない。失敗時に旧有効版を置換しない。使用する配布commitと本体取得URLを追加記録する。mainに別版が追加されても2023mar/2021decを勝手に更新しない。

### 利用条件

YuNetの配布ディレクトリはMIT。著作権・許諾表示を保持する。SFaceはApache-2.0で、ライセンス、該当NOTICE、変更表示等の条件を実際の同梱物ごとに確認する。モデルの利用条件と、利用者の人物情報を保存する同意は別。

- https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/LICENSE
- https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/LICENSE

OpenCV本体と組込み依存物の同梱通知も別に揃える。公開モデルだから全依存物の商用配布確認済み、とは表示しない。

## 3. 推論境界

|処理|入口|出口・制約|
|---|---|---|
|画像準備|原本に結び付いた解析用画像|向き固定、寸法、色順、stride、原画像への逆変換を保持|
|YuNet|OpenCV FaceDetectorYN|顔矩形・照合用5点・検出score。モデルpoolから取得し写真ごとに再読込しない|
|SFace|FaceRecognizerSF.alignCrop → feature → match|モデル版付き特徴量と照合score。無検出・曖昧・複数候補を保留|
|詳細領域|既存Vision/MediaPipeまたは専用adapter|5点から468/478点を捏造しない。髪・歯・肌・体型領域は別能力|
|人物補正|写真固有の領域＋人物別の補正意図|以前の写真の座標をコピーせず、その写真の画素へ適用|

公式wrapperの処理根拠:
- https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_detection_yunet/yunet.py
- https://raw.githubusercontent.com/opencv/opencv_zoo/main/models/face_recognition_sface/sface.py

入出力tensor名・shape・dtypeの全詳細は実ONNXと固定版OpenCV実装で照合してmanifestへ記録する。公式デモの閾値をSUITEの人物判定の実測合格値として固定しない。採用閾値・候補間marginは設定と評価結果を版管理する。

## 4. 共通データと効率化

1. AnalysisKeyは原本SHA、解析画像digest、向き/寸法、縮小変換、モデルdigest、前処理版、必要解析種別から作る。色スライダー変更だけでは再推論しない。ただし解析に使う実画素が変われば失効。
2. 写真内faceTargetIDと写真をまたぐPersonIDは別。モデル版の違う特徴を混在比較しない。手動訂正も履歴を残す。
3. 解析cacheはsingle-flight、容量上限、LRU、取消、世代を持つ。写真切替後の古い結果を表示・保存しない。
4. モデルpoolは同版を共有し、モデルごとの並列可否を守る。失敗したloadを永続的な成功cacheへ入れない。
5. 必要解析は効果ごと。顔明度のために全身・姿勢解析を必須にしない。実際の領域証拠がない処理はreadyにしない。
6. 端末の能力、資産の状態、利用許可、費用は独立判定。低メモリだからと無断でクラウドへ送信しない。

## 5. 撮影から保存まで

撮影/取得開始 → CaptureContextを保存 → 受信 → 撮影IDで対応付け → 原本保存/SHA確定 → 固定設定でqueueへ投入 → 人物解析 → 全体色と人物補正を分離適用 → 表示 → Recipe/Undo保存 → 再開。

- CaptureContextはsession/撮影ID、LookのID・版・本文、controls、人物補正意図・除外、背景参照を固定する。RAW確定前に仮SHAを作らない。
- Preview/JPEG/RAWは同じ撮影に関連付けるが、同じAssetと決めつけない。相関証拠が足りないものを時刻だけで自動結合しない。
- 人物不明でも全体色は継続可能。人物補正は保留として表示し、他人へ適用しない。
- 受付、表示、原本保存は独立queue。受信原本を黙って捨てない。再接続・再起動・通知重複は同撮影を二重適用しない。
- 実カメラSDKの不足は別残件。ファイル入力やイベント再生を実カメラ対応完了と呼ばない。

## 6. 現行差分と作業順

|段階|現時点のコード|残り|
|---|---|---|
|A01 資産定義|LocalAIModelManifest.swiftに検証契約追加|具体manifest、実本体取得・照合、配布commit、同梱通知|
|A04 可否|LocalAICapability.swiftに判定核追加|実端末probe・作業量見積・画面の接続|
|D01 必要解析|CorrectionAnalysisRequirements.swift、SessionLookPlanningへ接続|詳細領域adapterとqueueでの証拠受渡し|
|E01 撮影固定|CaptureContext、SessionLook、TetherLookQueueへ入口追加|撮影開始時の呼出・永続化・受信との対応付け|
|B 推論|既存Vision/MediaPipeを再利用可能|YuNet/SFace C++、ObjC++、モデルpool、cache、後続WASM|
|C 人物登録|写真内対象と既存照合核を再利用|同意付き永続gallery、写真間対応、訂正・削除・再開|
|D 補正|既存顔明度とWeb手動処理|人物対応を画素へ接続、部分適用、保存/Final|
|F 背景|合成・影の既存核|版付き素材catalog、実素材/権利、ローカル取得|
|G 生成|候補処理の既存核|provider、見積、予約、結果不明、保存、精算|

最初は資産→推論→人物登録→顔明度の一貫経路を作り、撮影固定を並行で接続する。その後に肌/身体・背景・有料生成を足す。48行の作業表は進捗管理に使うが、部品を追加しただけで行全体を100%にしない。

## 7. 保存・権利・生成

既存保存形式を保持し、追加フィールドは版と既定値を定義する。未知版は明示拒否。人物登録の同意と写真内メイク同意を混同しない。人物特徴は保存範囲・暗号化・削除・同期有無を定義してから永続化する。

有料生成は見積/写真送信同意→残高予約→実行→成果物保存→採否→消費確定。タイムアウトは実行なしとは限らない。外部費用と利用者creditを分離し、結果不明で盲目的に再送しない。API鍵は端末に配布しない。通常補正へ生成APIを混ぜない。購入・契約・送信は必要なユーザー承認を別途守る。

## 8. 記録と再開

成果報告は「コード完成範囲／接続残り／資産待ち／実機未確認」を分ける。今回の再作成ではモデル推論、課金、写真送信、ビルド、配備を実行していない。資料不在だけを理由に共通コードを止めない。

このファイルとHANDOFFに次回の入口を残す。ユーザーによるMarkdownの手動保存・再添付を前提にしない。元詳細MDが後で見つかった場合は上書きせず差分比較する。
