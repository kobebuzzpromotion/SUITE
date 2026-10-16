# 固定顔モデルの入出力

2026-10-11、取得済み実ONNXのprotobuf graphを `scripts/inspect-onnx-io.mjs` で読取り。推論・写真試験・ビルドではない。hash/bytesと固定commitは `AI_MODEL_ASSETS_2026-10-11.md`。コード定義は `PinnedFaceModels.swift`。

## YuNet

- graph入力: `input`、float32、`[1,3,640,640]`。
- graph出力: cls/obj/bbox/kps各系列、stride 8/16/32。shapeは `[1,N,C]`、N=6400/1600/400、Cは順に1/1/4/10。
- これはファイルが宣言するshape。OpenCV FaceDetectorYNは呼出し寸法をsetInputSizeで受け取り、右/下を32の倍数へ黒paddingして処理する。固定graph寸法をSUITEの原本サイズ制限にしない。可変寸法の実機動作は未確認。
- C ABI入力はupright BGR8。OpenCV側のblobはBGR、scale=1、mean=0。生tensor出力を顔矩形と混同しない。OpenCVの復号/NMS後の15値（矩形4、整列点10、score1）を利用する。
- 詳細mesh・髪/歯/肌maskではない。
- 前処理版: `suite-opencv-4.13.0-yunet-bgr-v1`。

## SFace

- runtime入力: `data`、float32、`[1,3,112,112]`。graph上の他174入力はinitializer重みであり、利用者入力ではない。
- 出力: `fc1`、float32、`[1,128]`。
- C ABIにはBGR8を渡す。OpenCV alignCropが5点で112×112へ整列し、featureがRGBへ入れ替えてtensor化する。manifestのRGBはtensorの色順であり、C ABI入力をRGBへ変える指示ではない。
- 外側のscale=1、mean=0。モデル内の処理を外側で二重適用しない。
- 特徴量はFaceIdentity側でも正規化し、モデルSHAと前処理版が一致したものだけ比較する。人物決定の閾値/marginは利用側から明示する。公式デモの閾値をSUITEの品質保証としない。
- 前処理版: `suite-opencv-4.13.0-sface-align-rgb-v1`。

## 実装根拠

- [OpenCV 4.13.0 detector source](https://github.com/opencv/opencv/blob/4.13.0/modules/objdetect/src/face_detect.cpp)
- [OpenCV 4.13.0 recognizer source](https://github.com/opencv/opencv/blob/4.13.0/modules/objdetect/src/face_recognize.cpp)
- 実ONNXの入出力は上記ローカルスクリプトで再読取り可能。initializerはfeedから除外。

## Distribution review

公開元のYuNet MIT・SFace Apache-2.0という識別と、製品の配布確認完了は別。固定版LICENSE等5点の本文保存・hash確認は完了し、該当NOTICEの調査範囲はAI_MODEL_LICENSE_RECORD_2026-10-11.mdへ記録。組込み依存物と配布形態ごとの確認は残作業。manifestのcommercialUse/redistributionはunreviewedのまま保持する。モデル取得・SHA一致だけで商用配布承認済みと表示しない。

## 接続状態

このmanifestでLocalAIModelStoreへのローカル導入とLocalFaceInferenceの構成を記述できる。Apple向けOpenCV/SuiteFaceCore実ライブラリの組込み・画面・人物登録同意/永続galleryは後続。今回のコードを公開Web上で動作済みと扱わない。
