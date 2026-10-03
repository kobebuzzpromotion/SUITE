# 写真処理の6領域 — 骨組みの設計契約
2026-10-03。v0.2 §6–8/20/26–31/39–40/53–62/78、Mobile Override §7–8/11–12、および最新ユーザー指示に基づく。以下の契約を先に固定し、実装とテストの状態はHANDOFF/TRACEABILITYで区別する。

## 追加された原則（ユーザー指示）
> 写真ライブラリ表示・一覧・セレクト・通常編集ではOriginal RAWを毎回取得しない。
> Cloud上のProxy / PreviewとEdit Recipeを優先し、ユーザー操作中のレスポンスを最優先する。
> Original RAWは、最終JPEG/TIFF書き出し、高解像度処理、再現像など、原本が必要な処理時のみ取得する。
> 大容量クラウドを契約していても、全RAWを端末へ同期する設計は禁止する。必要なAssetのみオンデマンド取得する。
> Original / Proxy / Edit Recipe / Generated Assetは別オブジェクトとして管理し、Proxy削除・再生成がOriginal RAWへ影響しないこと。
> Cloud同期済みAssetについては、iPhone・iPadのどちらからでもOriginalを取得して最終書き出し可能にする。
> 通信断やOriginal取得失敗時にはProxyから低解像度Finalを勝手に生成せず、「Original取得待ち」と明示する。

## 1. Cloud Storage Architecture
Assetはtenant/asset IDで所属を固定。Original、Proxy、Recipe、Generated Asset、任意Exportを別のkindとobject IDで管理する。Object Storageにバイナリ、DBにchecksum/size/key/revision/履歴/権限を保持する。Original keyを派生物の出力先に使わない。
StorageProviderはinspect/get/putImmutable等を抽象化し、R2/S3等の最終選定は実測後。RAWの公開URLは禁止。短期署名・認証済み主体・所有権の確認をダウンロード境界に置く。ローカル開発アダプターは本番の暗号化・冗長化・復旧性の証明ではない。
Cloud Safeの順序はUpload→Checksum→Server verification→Object persistence verification→DB commit→Upload complete。Checksum/Object/Metadata/Permissionの四ゲートが揃うまでSyncedを返さない。クライアントの安全申告は受け付けず、サーバーがObjectを再検証してcommitする。
権限・version・object checksumが変わったら古い安全証拠を再利用しない。端末キャッシュ内の安全フラグだけでOriginal削除を決めない。

## 2. Proxy Strategy
一覧はThumbnail、選択/通常編集はProxyまたはPreviewとRecipe。Original取得はアクセス目的がFinal Export/High Precision/Re-developの時だけ許可する。
取込直後にOriginalからProxyを一度作成する。Proxyのサイズは端末性能、memory/thermal、ユーザー設定から選択し、固定値を一か所に埋め込んで全端末へ強制しない。
Proxyには元のasset ID、original checksum、生成パイプライン版、recipe版を関連付ける。Preview応答はasset ID/recipe revision/job generationが現在と一致する場合だけ画面へ反映する。
通常編集の欠落Proxyを補うために無断で全RAWを取得しない。利用可能なProxyを取得するか、Proxy待ち/再生成が必要と表示する。再現像を明示的に選んだ場合だけ原本必要処理へ進める。

## 3. RAW lifecycle
取込は新規asset IDと保存先へコピーし、原本のchecksumを計算。元ファイルを書換えない。取込中断時にメタデータだけを完成として残さない。
Local Onlyは原本を端末に保持。Cloud有効時も安全検証前の原本削除は禁止。Trashは論理削除であり、今回の骨組みに物理削除/自動清掃機能を設けない。
原本と派生物を別ディレクトリ/キーに分離し、Proxyの削除・再生成ルートからOriginalへ到達させない。破損したRecipeや原本を空の初期状態へ黙って置換しない。

## 4. Offline-Sync
編集中のRecipeとUndo/Redo履歴、batch/AI/exportジョブの入力版・stage・retry情報を永続化する。永続化失敗は表示し、保存済みにしない。
更新はexpected revisionの比較後に次版を原子的に確定。競合は明示し、last-write-winsで他端末の編集を潰さない。再送idempotency IDは本文照合を伴う設計とし、未実装なら二重実行成功を返さない。
ネットワーク回復で再開するのは保留ジョブと選択Assetの必要オブジェクト。容量プラン変更で全RAW同期を起動しない。
OfflineでもローカルにあるProxy/Recipeの編集は続行する。OriginalがないFinalは「Original取得待ち」。端末間継続には同一Recipe形式と原本のクラウド検証済み保存が必要。
今回の骨組みでは耐久クラウドqueue/本番バックグラウンド転送は未接続として明示し、ローカル保存試験でクラウド復旧を合格にしない。

## 5. Cache eviction
Proxy/Previewは端末quotaとLRUで再取得可能な派生物だけを削除候補にする。編集中・表示中・処理中・未保存状態はpinする。
Originalは別ポリシー。Local Only、Cloud Safe未確定、進行中upload/export、未保存変更参照、未確認権限は削除不可。同期済みであっても設定/ユーザー意図、pin、再取得可能性を確認する。
クラウドの削除と端末キャッシュ削除を別API/責務にする。Proxy evictionが原本削除へ連鎖しない不変条件をテストする。
今回実装するのは削除可否の純粋な判定境界。自動的にユーザー原本を削除するサービスは実装しない。

## 6. Export pipeline
Export開始時にasset ID、original checksum、recipe revision、設定、Canonical生成Asset IDを固定する。途中の選択変更や新編集で異なる内容へ差し替えない。
Originalが端末にある場合はchecksum照合後に使用する。ない場合は認証・Cloud Safe・ネットワークを確認して必要Assetだけ取得し、保存後checksum照合。取得失敗はwaiting_for_original、成功扱い・Proxy Final代替は禁止。
Original＋同じRecipeをRAWProvider/Color処理へ渡し、最終JPEG/TIFFを別Export先へ生成。生成合成を含む場合はCanonical AssetとIdentity Gateも必須。未対応処理を黙って無視してExportしない。
出力完了はファイル書込み成功・形式/寸法の確認後。共有のPreviewと最終納品Exportを区別する。再試行は同じ入力版・原本・Canonicalを使用する。
iPhone/iPadで同じ取得・Recipe・Export契約を使う。デバイス別UIに原本取得や保存判定を実装しない。

## Execution Optimizer（METIS原則に沿った今回の評価）
利用可能な専用実行器は再利用調査で確認し、未発見の場合に使用済みとはしない。以下は競合と依存関係に基づく実行方式比較であり、計測済み時間の予測ではない。

| 方式 | shared files/model/pipeline/API/testの競合 | 判断 |
| --- | --- | --- |
| FULL SERIAL | 競合は少ないが独立したUI/監査まで待たせる | 採用しない |
| FULL PARALLEL | 未確定のRecipe/保存/Core契約を各担当が別々に作る危険 | 採用しない |
| STAGED PARALLEL | Core/写真6領域/共有契約を先に固定し、別ファイルの端末UI・実装・監査を並列化 | 主方式 |
| PIPELINE | 各担当の成果を順次レビューできるが未統合結果だけでは合格不可 | 段階並列のレビューで併用 |

メインのみ最終統合。実装者と最終監査者を分ける。依存しないタスクは一つのブロックで停止させない。ネイティブビルドはXcode環境が必要で、Windowsの共通基盤テスト合格で代替しない。
