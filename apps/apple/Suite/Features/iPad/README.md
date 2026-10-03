# iPad UI 骨組み

`IPadEditorView(model: EditorModel)` はiPad専用のSwiftUI構成。iPhone Viewは参照・流用しない。画像処理、原本取得、保存判定、履歴、書き出しは共通EditorModelに委譲する。

## 実装範囲

- 実際のウィンドウ幅900pt以上かつ横長では、大きなキャンバスと右側312pt Inspectorを同時表示。
- 縦向き・狭いSplit View・アクセシビリティ文字サイズでは、写真を上、横幅全体のInspectorを下に配置。Inspectorはモーダルで隠さず、独立スクロール可能。
- 読込済み写真の共通Filmstripをキャンバス下に表示。小さいウィンドウは全体を縦スクロールでき、ツール列は横スクロールできる。
- 読込、Undo/Redo、編集前後比較、90°回転、JPEG/TIFF書き出しを共通モデルへ接続。モデルが返す状態・エラーを表示し、全文をシートで確認できる。
- 比較を「編集前のプレビュー」と表記。通常編集のためのOriginal取得やProxyによる低解像度FinalをUIで起動しない。「Original取得待ち」はモデルのstatusMessage/errorMessageを通してそのまま提示する。
- AI／Batch／Cloud等の対応状態は共通WorkflowAvailabilityViewへ委譲し、未接続機能の成功を表示しない。
- Cmd+O読込、Cmd+Z Undo、Cmd+Shift+Z Redo、Cmd+B比較、Cmd+R回転。書き出しメニューにCmd+Shift+E JPEGとCmd+Option+Shift+E TIFFを指定。
- 操作対象は44pt以上を確保。キャンバス上に透明な操作レイヤーや独自gestureを重ねず、Pencil・ポインタ入力を遮らない。Pencilマスク編集そのものは未実装。

## 検証状態

実施: 仕様・共有契約とのソース照合、担当範囲の確認、モデル呼出しとUI非依存境界の静的確認。

未実施: Swiftコンパイル、Xcodeビルド、シミュレータ、iPad実機、Rendered Reality、主要導線の実行検証、VoiceOver／Dynamic Type／キーボード／Pointer／Pencilの動作試験。現在のWindows作業環境にSwift/Xcodeがないため、ソース記述を実行合格・製品完成とは扱わない。

統合後、横向き／縦向き、狭幅、短いStage Managerウィンドウ、最大文字サイズで写真とInspector、すべての操作への到達を確認する。読込→選択→編集→比較→Undo/Redo→再起動時の復元→JPEG/TIFF→共有を両端末の共通モデルで試験し、原本欠落・通信断・書出失敗時に成功表示しないことを確認する。

本骨組みで未実装のSplit比較、Drag & Drop、外部ディスプレイ、マスク編集等の仕様を削除・完了扱いにしない。関連要件: SPEC-006/007/024/040/064/066、MOBILE-04/05/08/10/12/15およびMobile Release FirstのiPad専用5要件。
