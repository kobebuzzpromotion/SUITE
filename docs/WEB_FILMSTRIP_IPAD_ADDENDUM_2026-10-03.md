# Web編集画面下部・写真一覧のiPad操作要件（追加仕様）

既存のAsset、Recipe v1、保存・履歴、原本不変契約は変更しない。本書はWeb EditorをiPadで操作する際の追加受入条件であり、Apple Native iPad実機Gateとは別である。

## 必須動作

1. 編集画面下部の写真一覧は、iPadの指による横スワイプとOS/ブラウザの慣性スクロールで端まで移動できる。スクロール中と慣性が収まるまでのタップを写真選択として扱わず、画像のドラッグも開始しない。
2. 静止した写真をタップするとそのAssetを選択する。選択中の写真を視覚表示と`aria-pressed`で区別し、プレビュー、調整値、Recipe、revisionは選択Assetに一致させる。別Assetの編集状態を混ぜない。
3. マウスのドラッグ/ホイール、トラックパッドの横スクロールでも一覧を移動できる。前後ボタンとキーボードの左右移動を保持する。
4. 未保存編集、処理中、Export中、権限拒否中は写真切替を拒否する。編集内容を破棄して次の写真を開かない。保存後は切替可能とし、戻ったときに各写真の保存済みRecipeを復元する。
5. 多数写真を入れ、先頭・中間・末尾への移動、端での停止、切替後の調整保持、再起動相当の再読込を確認する。サムネイルの外観だけを完了条件にしない。

## 現在の実装・証拠

- `apps/web/src/editor-ui.mjs` と `apps/web/src/styles.css` に下部一覧、選択表示、ネイティブtouch横スクロール、継続するscrollイベント中の誤タップ抑止、mouse/trackpad操作、画像dragstart拒否を接続済み。
- `apps/web/tests/filmstrip-interaction.test.mjs` の8件がWindows上でPASS。1,000写真の合成NON_RAWメタデータを使い、先頭/中間/末尾、未保存切替拒否、2写真の保存Recipeを切替・Session再生成後に復元した。これはUI/状態ロジック試験であり、実RAW・実iPadの操作証明ではない。
- 最新Web全試験は254 PASS / 0 FAIL / 0 SKIP。既存Windows154件を含む全回帰は159 PASS / 0 FAIL / 0 SKIP（追加Sites準備5件を別計上）。詳細ログ・Test catalog・Source Hashは`docs/evidence/web-2026-10-03/public-trial-filmstrip-02/WINDOWS_REGRESSION.json`。直前の`public-trial-filmstrip-01`はWeb再build後のSites bundle不一致で157 PASS/2 FAILとなった履歴を保持し、Sites Workerを再buildしてから新規runで解消した。旧Evidenceは上書きしていない。

## 未実施の受入Gate

- iPad Safari実機で、実写真を多数読み込んだ指スワイプ/慣性、スクロール中の誤選択・ドラッグ抑止、選択表示、端への到達、写真切替、保存状態保持を操作確認：`NOT_RUN`（iPad実機と許諾済み実RAW未提供）。
- マウス/トラックパッド実デバイスでの操作：`NOT_RUN`（現在はイベントとSessionのローカル試験のみ）。
- 大量の実RAWを読み込んだ際の描画速度、メモリ、サムネイル生成品質：`NOT_RUN`。現行一覧はファイル名/RAWマークであり、実写真サムネイル表示の検証・完成を意味しない。

実機で上記を確認するまで「iPad写真一覧Gate PASS」にはしない。Sites公開、実RAW、Apple Native、Mobile Releaseの各Gateも独立して維持する。
