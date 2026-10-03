# iPhone UI 骨組み

`IPhoneEditorView(model: EditorModel)` は、共有契約に定義されたModelと共通Viewを利用するiPhone専用表示層です。iOS 17以降を暫定ターゲットとし、iPad画面は実装しません。

- 写真中心のキャンバスと、下部の読み込み・調整・比較・書き出しを配置。
- Undo／Redoと写真選択を下部に配置。通常縦画面はFilmstripを表示し、横画面やアクセシビリティ文字サイズでは下部の写真選択から同じ機能に到達。
- 調整項目はシートで段階表示。JPEG／TIFFの書き出しは選択ダイアログからModelへ接続。
- Modelの処理状態とエラーを表示し、全文を処理状況シートで確認可能。書き出しや原本取得の成功をUI単独で宣言しない。
- 未接続機能は`WorkflowAvailabilityView`で説明し、AI・Batch・Cloudの成功ダミーを作らない。
- 主操作に44pt以上のタッチ領域とアクセシビリティラベルを設定。大きな文字では主要操作を2列に配置。
- 黒・graphite基調と控えめなamberは骨組みの暫定表示。ブランド確定や既存仕様変更を意味しない。

ファイル読み込みUIの実体は親ルートが`model.showImporter`を監視して提供し、ModelへURLを渡します。書き出し結果のShare Sheetも親ルートが`model.shareURL`に接続します。ストレージ・画像処理・永続化・Provider通信を本Viewへ持ち込みません。

## 確認範囲

Windows環境で共有契約とのソース照合のみを実施。SwiftUIビルド、シミュレータ、iPhone実機、VoiceOver、画面回転、タッチ操作、主要導線の実行は未実施です。これらは親による統合後にApple環境で確認が必要です。表示層の実装を製品完成・リリースゲート通過とは扱いません。
