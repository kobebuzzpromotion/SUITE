# 差分66件 コード作成引継ぎ

2026-10-08。既存44件と重複する処理を再利用し、不足差分のみを書く。ユーザー指定で検査・実験・build・アプリ接続・配備は実施しない。コスプレ・資料不足22件・独立5件は対象外。

## 現在の状態

確定（2026-10-08）：ユーザーがLightroomカタログ移行の後回しを承認。今回必要な差分65件のコード作成完了として区切る。EV3-0716の.lrcat/Collection移行は今回対象外で、需要確認後に再判断する。通常写真/RAW/folder取込の既存コードは維持。接続・検査・配備は開始しない。以下の「採否確認待ち」は承認前の履歴。

66項目すべてに既存再利用または差分コードがある。SUITEの今回対応範囲で処理コード作成済み65件、他社カタログ移行の採否確認待ち1件（EV3-0716）。65件は59件に出力形式/実行、Cloud、Desktop/iPad presets、XMP/CUBEの6件を追加した数。全競合機能との完全互換や製品全体の完成率ではない。通常Import/RAW/folder/sidecar/外部編集受戻しはコードあり、.lrcat/Collection移行のみ推測実装しない。

Web独立module、Apple保存先/大判renderer、Backend認可metadata/share SQL serviceを追加。3担当返却済み。専用モデル資産・ORT/WASM・正式背景素材等は別途必要。未配備/未接続/未試験をコード率の減点には含めない。逆に未対応codecなど実コードが存在しない部分は未接続だけと表現しない。

進捗は処理コードの書き残しで報告する。未接続・未試験を理由にコード作成を0へ戻さない。一方で、専用モデル、未対応codec、未実装の演算を持つ項目を入口だけで100%としない。

## 対象の正本

| ID | 項目 | 状態 |
| --- | --- | --- |
| EV3-0436 | Basic | 今回の処理コード作成済み（100%） |
| EV3-0551 | AI Color | 今回の処理コード作成済み（100%） |
| EV3-0459 | Profile | 今回の処理コード作成済み（100%） |
| EV3-0450 | White Balance | 今回の処理コード作成済み（100%） |
| EV3-0475 | HSL | 今回の処理コード作成済み（100%） |
| EV3-0463 | Curves | 今回の処理コード作成済み（100%） |
| LR-05 | RGB and channel Point Curves | コード作成済み（既存再利用・追加不要） |
| EV3-0516 | Detail | 今回の処理コード作成済み（100%） |
| EV3-0683 | Desktop Crop | 今回の処理コード作成済み（100%） |
| EV3-0710 | Rotate | 今回の処理コード作成済み（100%） |
| EV3-0540 | Transform Correction | 今回の処理コード作成済み（100%） |
| EV3-0639 | Custom | 今回の処理コード作成済み（100%） |
| EV3-0310 | Desktop Healing | 今回の処理コード作成済み（100%） |
| EV3-0292 | iPad Liquify | 今回の処理コード作成済み（100%） |
| EV3-0675 | iPad Masking | 今回の処理コード作成済み（100%） |
| EV3-0272 | Mobile Reshape | 今回の処理コード作成済み（100%） |
| EV3-0618 | Person | 今回の処理コード作成済み（100%） |
| EV3-0635 | Pet / Background | 今回の処理コード作成済み（100%） |
| EV3-0631 | Skin subregions | 今回の処理コード作成済み（100%） |
| EV3-0664 | Smart Selection | 今回の処理コード作成済み（100%） |
| EV3-0141 | AI Iris Correction | 今回の処理コード作成済み（100%） |
| EV3-0063 | Blemish Removal | 今回の処理コード作成済み（100%） |
| EV3-0092 | Child blemish texture | 今回の処理コード作成済み（100%） |
| EV3-0124 | Eye appearance | 今回の処理コード作成済み（100%） |
| EV3-0325 | Eyes | 今回の処理コード作成済み（100%） |
| EV3-0175 | Facial Reshape / Eyes structure | 今回の処理コード作成済み（100%） |
| EV3-0152 | Facial Reshape / Face | 今回の処理コード作成済み（100%） |
| EV3-0191 | Facial Reshape / Mouth | 今回の処理コード作成済み（100%） |
| EV3-0149 | Facial Reshape / Symmetry | 今回の処理コード作成済み（100%） |
| EV3-0199 | Full Body Reshape | 今回の処理コード作成済み（100%） |
| EV3-0220 | Hair | 今回の処理コード作成済み（100%） |
| EV3-0254 | iPad Full Body Reshape | 今回の処理コード作成済み（100%） |
| EV3-0002 | Makeup / Contour | 今回の処理コード作成済み（100%） |
| EV3-0005 | Makeup / Eye Makeup | 今回の処理コード作成済み（100%） |
| EV3-0003 | Makeup / Eyebrow Makeup | 今回の処理コード作成済み（100%） |
| EV3-0010 | Makeup / Lip Makeup | 今回の処理コード作成済み（100%） |
| EV3-0035 | Makeup components / Contour | 今回の処理コード作成済み（100%） |
| EV3-0019 | Makeup components / Eyebrows | 今回の処理コード作成済み（100%） |
| EV3-0032 | Makeup components / Lipstick | 今回の処理コード作成済み（100%） |
| EV3-0015 | Makeup Suite | 今回の処理コード作成済み（100%） |
| EV3-0247 | Mobile Facial Expression | 今回の処理コード作成済み（100%） |
| EV3-0095 | Skin Retouching | 今回の処理コード作成済み（100%） |
| EV3-0348 | Backdrop Changer | 今回の処理コード作成済み（100%） |
| EV3-0379 | iPad Backdrop Changer | 今回の処理コード作成済み（100%） |
| EV3-0404 | Sky Replacement | 今回の処理コード作成済み（100%） |
| EV3-0336 | Solid Backdrop Refinement | 今回の処理コード作成済み（100%） |
| EV3-0954 | AI Background Fusion | 今回の処理コード作成済み（100%） |
| EV3-1020 | AI Sky Replacement | 今回の処理コード作成済み（100%） |
| EV3-1017 | Belly Slimming | 今回の処理コード作成済み（100%） |
| EV3-1024 | Face Shadow Removal | 今回の処理コード作成済み（100%） |
| EV3-1068 | Mobile Relight | 今回の処理コード作成済み（100%） |
| EV3-1003 | People Removal | 今回の処理コード作成済み（100%） |
| EV3-0981 | Smart Removal / Magic | 今回の処理コード作成済み（100%） |
| EV3-0987 | Smart Removal / Quick | 今回の処理コード作成済み（100%） |
| EV3-1013 | Strong Glare Removal | 今回の処理コード作成済み（100%） |
| EV3-0747 | Desktop Export format | 今回の対応範囲のコード作成済み。通常encoder/標準RGB変換/真16bit TIFFに加え、Apple大判tile renderer・OS色管理を追加。Web大判RAW renderer、任意ユーザーICC、BigTIFFは非対応。 |
| EV3-0731 | Desktop Export modes | 今回の処理コード作成済み。queue/複数版/条件付commit/順次実行・receipt記録あり。UI/Instantイベントからの呼出しは後段。無条件replaceや一括rollbackはしない。 |
| EV3-0716 | Desktop Import | 書残しあり — 取込/decode/sidecar/roundtripコードあり。.lrcat/Collection/private現像codecが未実装。 |
| EV3-0805 | iPad Tether Export destinations | 今回の処理コード作成済み（100%）。native Photos/Files/provider保存を追加。 |
| EV3-0790 | Mobile Export | 今回の処理コード作成済み（100%）。format/日時/share/native保存を作成。 |
| EV3-0876 | Cloud Space | 今回の処理コード作成済み。既存Team ACL・Project/容量/履歴APIを再利用、版CAS復元client追加。競合製品の期限削除は採用しない。 |
| EV3-0858 | Desktop presets | 今回の処理コード作成済み。分類/group/推薦/共有snapshot・認可付きtoken/metadata SQL保存を追加。Community公開は対象外。 |
| EV3-0933 | Hot Edits | 今回の処理コード作成済み（100%） |
| EV3-0926 | iPad Home | 今回の処理コード作成済み（100%） |
| EV3-0865 | iPad presets | 今回の処理コード作成済み。端末filter・分類・snapshotとDesktop共通のmetadata SQL保存。接続は後段。 |
| EV3-0592 | Mobile XMP/CUBE compatibility | 今回の対応subsetのコード作成済み。1D/3D/複合CUBE・同期資産取得・公開8項目XMP設定変換。全Adobe私有現像互換ではない。 |

## 追加された出力共通コード

- `apps/apple/Suite/Services/Delta66LargePrint.swift`: B0倍300dpiの原本→既存Apple Recipe→横tile/縦strip→ICC付きRGB TIFF 8/16bit実処理。CoreImageの領域描画・sRGB/AdobeRGB実変換、原本disk snapshot/SHA、メモリ予算、一時出力から非上書き確定。通常補間は明示許可、AI拡大と混同しない。OS RAW decoder内部memoryは保証せず原寸推定予算で制限。既存Apple Recipe subsetのみ、非圧縮/非透過/必須metadata出力。全44機能native接続やB0倍実機成功とは別。

- `apps/backend/src/delta66-preset-sharing.ts`: 既存WorkspaceRepository権限・Preset読取を再利用するSQL service。分類metadataの版CASと認証済み同Workspaceメンバー向けsnapshot共有token発行/期限/失効。新table初期化は明示関数内、今回DB実行なし。local版とserver版を分離する文書変換を同梱。Author/過去版metadata参照・匿名Community公開は非対応。

- `delta66-delivery-runner.mjs`: 既存queue/encoder/state遷移を順次実行し、Final版/SHA、保存receiptのbytes/SHAを照合。保存後の失敗は未保存と偽装せず要照合として返す。ブラウザの既存20件・resident frame 128MiB枠であり、大判は別経路。実render/保存先のhost接続は後段。
- `delta66-xmp-settings.mjs`: 既存公開8項目XMP読取を再利用し、SUITEのglobal/postDecode patchへ変換。Adobe描画との一致を保証せず、明示的な近似解釈の選択を要求。未知私有設定は成功にしない。
- `delta66-workflow-workspace-client.mjs`: 既存認可sessionとProject/Storage/Recipe履歴routeの実呼出し、保存版CASによる復元。
- `delta66-workflow-preset-sharing.mjs`: 既存認可付きWorkspace snapshot共有とPersonal snapshot取込。
- `delta66-workflow-preset-metadata-store.mjs`: 分類/group metadataのローカル版CAS保存。端末間同期と混同しない。
- `apps/apple/Suite/Services/Delta66ExportDestinations.swift`: 既存PhotoPipelineを再利用したPhotos/Files/provider実保存。原本は移動・上書きせず一時コピーから確定。選択UI/Photos使用理由/App登録は後段。

- `delta66-tiff-stream.mjs`: Uint8/Uint16実sampleからclassic TIFFをstrip出力。非圧縮と可逆PackBits、DPI、提供ICC埋込。全画像buffer不要。PackBitsはseek可能な一時sink必須。RAW decode・描画とOSへの接続は別。
- `delta66-workflow-color.mjs`: sRGB/Adobe RGBのD65標準色空間変換。8/16/Float32入力、8/16bit出力。既存sRGB transfer再利用、明示色域clipまたは拒否。任意ICCのCMM・知覚的色域圧縮ではない。色変換を実行しないタグ変更で代用しない。
- `delta66-workflow-queue-store.mjs`: 既存IndexedDBの版CASでqueue実読書き。
- `delta66-workflow-conditional-sink.mjs`: 原本保護と条件付きcommit能力がある保存先だけでreplace。無条件overwriteにfallbackしない。
- `delta66-workflow-metadata.mjs`: 元Exif読取を再利用したJPEG/PNG最小日時tag。GPS等は複製しない。

色空間の出典: [ICC sRGB](https://registry.color.org/rgb-registry/srgb)、[ICC Adobe RGB](https://registry.color.org/rgb-registry/adobergb)、[Adobe色空間仕様 §4.3](https://www.adobe.com/digitalimag/pdfs/AdobeRGB1998.pdf)。実変換コードの仕様参照であり、製品の出力品質を検証した証拠ではない。

## 先に依頼されたサイズ契約の修正

`face-feature-adapter.mjs` と `makeup-highlight-landmark-mask.mjs` の原本metadata8MP制限をsafe integer確認へ変更。実処理bufferの8MP制限は維持。原本が大きいだけで小さいProxyを拒否しない。原本全体の8MP超処理やFinal tile対応を完了した意味ではない。

## 未実行

Original/RAWは不変。既存Recipe・認証・保存・UI契約は変更しない。生成モデルのdownload、クラウド資源操作、外部有料処理なし。大判出力設計の全実装完了をこの一覧から推測しない。
