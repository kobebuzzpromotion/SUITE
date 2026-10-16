# AIモデル・OpenCVライセンス取得記録

2026-10-11。公式配布のテキストを実取得し、bytesとSHA-256を照合した記録。法務承認・モデル推論試験・アプリへの全同梱完了ではない。manifestのcommercialUse/redistributionは引き続きunreviewed。表示や自動判定でconfirmedへ昇格しない。

## 固定出典

- モデル/Zoo commit: `47534e27c9851bb1128ccc0102f1145e27f23f98`
- OpenCV 4.13.0 annotated tag object: `2e1f8da65e4f9fa1a98423e6ac223187438a4db8`
- 同tagが参照するcommit: `fe38fc608f6acb8b68953438a62305d8318f4fcd`
- [公式tag根拠](https://api.github.com/repos/opencv/opencv/git/tags/2e1f8da65e4f9fa1a98423e6ac223187438a4db8)

## 実取得結果

本文は改行も変換せず `artifacts/local-ai-models/licenses/` に保存。SHAは取得した本文バイト列の実測。資料へ全文を複製せず同梱ファイルを正本にする。

|保存ファイル|bytes|SHA-256|公式本文|
|---|---:|---|---|
|yunet-LICENSE.txt|1085|c83b8120c50ccbd4c4f96edf53141bdd566ebb8f8e9227e415326aa1b1aba958|[YuNet MIT](https://raw.githubusercontent.com/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_detection_yunet/LICENSE)|
|sface-LICENSE.txt|11358|cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30|[SFace Apache-2.0](https://raw.githubusercontent.com/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/models/face_recognition_sface/LICENSE)|
|opencv-4.13.0-LICENSE.txt|11358|cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30|[OpenCV Apache-2.0](https://raw.githubusercontent.com/opencv/opencv/fe38fc608f6acb8b68953438a62305d8318f4fcd/LICENSE)|
|opencv-zoo-LICENSE.txt|11357|c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4|[Zoo root Apache-2.0](https://raw.githubusercontent.com/opencv/opencv_zoo/47534e27c9851bb1128ccc0102f1145e27f23f98/LICENSE)|
|opencv-4.13.0-LICENSE_CHANGE_NOTICE.txt|2768|b2255f81ae7162e36550daefe432c72a8506cfc1b954897dbc553ed5160ad4b8|[OpenCV license change record](https://raw.githubusercontent.com/opencv/opencv/fe38fc608f6acb8b68953438a62305d8318f4fcd/doc/LICENSE_CHANGE_NOTICE.txt)|

## NOTICEの確認範囲

固定commitのGitHub Git Trees APIを使用。

- [Zooツリー](https://api.github.com/repos/opencv/opencv_zoo/git/trees/47534e27c9851bb1128ccc0102f1145e27f23f98?recursive=1): rootと対象YuNet/SFaceディレクトリに独立したNOTICE名ファイルは列挙されていない。
- [OpenCVツリー](https://api.github.com/repos/opencv/opencv/git/trees/fe38fc608f6acb8b68953438a62305d8318f4fcd?recursive=1): truncated=false。独立NOTICE名ファイルは列挙されていない。`doc/LICENSE_CHANGE_NOTICE.txt`は別途取得済み。
- これは上記ソースツリーの限定的確認。モデルのREADME・ソース内表示や、後で選ぶXCFramework/3rdparty依存物を含めて通知不要だと宣言したものではない。

## 配布前に残る作業

1. 実際に組込むOpenCV XCFrameworkの作成方法・モジュール・依存バイナリを固定する。
2. その配布物に含まれるcopyright/NOTICE/third-party licenseを列挙して保存する。取得したroot LICENSEだけで代用しない。
3. YuNetのcopyrightと許諾表示を保持し、Apache系はライセンス本文・該当帰属通知・変更表示を配布物へ組み込む。
4. iOSアプリの同梱Resourcesと第三者ライセンス表示を接続する。現在はrepoの専用artifact保存でありアプリに含まれる保証はない。
5. 配布責任者の根拠・日時を記録してからmanifestレビュー状態を更新する。顔特徴の同意・保存権限は別管理。

## 再取得

PowerShell 7で `./scripts/fetch-suite-face-licenses.ps1`。固定commitの本文だけを取得する。byte数上限、SHA照合、専用一時ファイル、確定先の上書き拒否、reparse拒否を実装。既存一致は再利用し、不一致は停止する。ネットワーク権限が必要。

今回このscriptを実行し5点の取得成功を確認。写真送信・モデル推論・課金・ビルド・配備は行っていない。
