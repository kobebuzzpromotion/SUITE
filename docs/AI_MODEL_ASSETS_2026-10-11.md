# ローカル顔モデル取得記録

2026-10-11、`scripts/fetch-suite-face-models.ps1` を実行し、公式配布から以下の実ファイルを取得した。単なるLFS pointer保存ではない。bytesとSHA-256は取得後に実測一致。

固定OpenCV Zoo commit: `47534e27c9851bb1128ccc0102f1145e27f23f98`

|ファイル（artifacts/local-ai-models/）|bytes|実測SHA-256|
|---|---:|---|
|face_detection_yunet_2023mar.onnx|232589|8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4|
|face_recognition_sface_2021dec.onnx|38696353|0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79|

取得URLは `https://media.githubusercontent.com/media/opencv/opencv_zoo/<commit>/models/<folder>/<file>`。folderはそれぞれface_detection_yunet、face_recognition_sface。スクリプトは既存一致ファイルを再利用し、不一致なら旧ファイルを保持して拒否する。一時ファイルだけ失敗時に除去。

YuNet MIT、SFace Apache-2.0の公式表示は確認済み。実ONNXから具体IOを読み取ってPinnedFaceModelsへ定義済み（AI_MODEL_IO_2026-10-11.md）。同梱ライセンス/NOTICEの確定、OpenCV/XCFramework、実モデルロードと写真推論は別作業。取得・hash照合は写真品質や実機対応の合格判定ではない。
