# テザー：コード先行引継ぎ

2026-10-08。Lightroom14の次にユーザーが開始指示。検査・実験・build・機器実操作・UI接続・Xcode project変更は行わない。対応機種を実機確認済みとしない。

## 今回の排他作成範囲

|処理|担当ファイル|状態|
|---|---|---|
|Apple公開カメラ通信・受信|apps/apple/Suite/Services/TetherImageCapture.swift|コード作成済み|
|原本保管・重複・中断復帰|apps/apple/Suite/Services/TetherIngestStore.swift|コード作成済み|
|撮影ごとのLook固定・処理queue|packages/SuiteCore/Sources/SuiteCore/TetherLookQueue.swift|コード作成済み|
|接続方式・機能別の対応判定|packages/SuiteCore/Sources/SuiteCore/TetherCapabilityMatrix.swift|コード作成済み|
|保存済原本からProxy生成|apps/apple/Suite/Services/PhotoPipeline.swiftの追加入口|コード作成済み|
|Look queue原子的永続化|apps/apple/Suite/Services/TetherLookQueueStore.swift|コード作成済み|

## メーカー固有コード：2026-10-08 続行調査

ユーザーはメーカー固有の無線・ライブビュー・露出操作を先に仕上げ、次にアプリ接続、その次にAIを指示。共通6作業とメーカー固有実装を混同しない。今回の読取り調査ではCanon/Sony/Fujifilmの正式API Reference・headersはrepo内になく、公開概要だけからwire仕様を確定できない。SDK存在は確認できたが、固有コード完成ではない。

- Canon: CCAPIのliveview、av/tv/iso/exposureの機能一覧は公開されているが、method/body/認証/stream framingの正式参照資料が必要。DigestやSSDPを推測実装しない。
- Sony: https://support.d-imaging.sony.co.jp/app/cameraremotecommand/en/index.html に法人向けCamera Remote Command申請経路あり。PTP-IPの正式command資料が必要。Desktop SDKをiOS対応と見なさない。
- Fujifilm: https://www.fujifilm-x.com/global/camera-control-sdk/ と企業窓口 https://www.fujifilm-x.com/global/camera-control-sdk/contact/ 。商用条件とiOS対応手段の確認、SDK headers/manualが必要。公開OS一覧のDesktop/Android対応からiOS対応を推定しない。

申請・契約同意・SDKダウンロードは未実施。資料入手が必要な箇所を、空adapterや成功を返す仮コードで完成扱いにしない。

通信moduleは現在iOS18/macOS15以上の保守的指定。既存SuiteCoreの最低OSと同一ではない。Xcode SDKコンパイル/availabilityとdelegate配送は未確認で、iOS17対応を暗黙に主張しない。撮影要求送信と撮影成功は別。cancel/切断/timeoutで待機を終了し、遅延転送結果は別イベントとして返す。

既存CameraProviderはinterfaceのみ。新しい通信実装を既存UIへ登録する工程は後段。既存SessionLook/SessionLookPlanningの非破壊意図・写真別bindingを再利用する。デバイス発見だけをテザー成功としない。

## 対応基準

- Canon、Nikon、Sony、FUJIFILM、Panasonic、OM SYSTEM、PENTAX/RICOHを対象軸とする。古い機種や無線がない機種もUSBで別判定する。
- 正確な機種・firmware・host OS・adapter版・USB/Wi-Fi/Ethernetをキーにする。メーカー名だけのSupportedは作らない。
- ファイル取込、RAW/JPEG転送、新規撮影転送、remote shutter、live view、露出操作、再接続復帰は別々の機能。
- unknown／unsupported／documented／beta／supportedを分ける。beta/supportedには実機記録を要求。機種証拠表は空で開始し、実装追加だけで証拠を作らない。
- runtime capabilityと対応実証は別。未確認機能を試すには後段hostが明示的に許可する。unsupportedは実行不可。

## 公開APIとメーカー依存

Appleの[ImageCaptureCore](https://developer.apple.com/documentation/imagecapturecore)には外部カメラの発見・ファイル転送がある。[requestDownloadFile](https://developer.apple.com/documentation/imagecapturecore/iccameradevice/requestdownloadfile(_:options:downloaddelegate:diddownloadselector:contextinfo:))と[ICCameraDevice](https://developer.apple.com/documentation/imagecapturecore/iccameradevice)のcapabilityに基づく実処理を今回の入口にする。全機種が撮影中転送やremote shutterを公開する保証ではない。

メーカー固有の通信は以下を区別する。各メーカー専用アプリがあることは、SUITEが同じAPIを利用できる証拠ではない。

|メーカー|今回確認できた公開情報|残る実装依存|
|---|---|---|
|Canon|[公式CCAPIとEDSDKの区別](https://developercommunity.usa.canon.com/s/article/What-is-the-difference-between-CCAPI-and-EDSDK)：USBとIP経由が異なる|CCAPI対応機種・有効化・API仕様/認証に沿う専用adapterは未実装|
|Sony|[Camera Remote SDK](https://support.d-imaging.sony.co.jp/app/sdk/en/index.html)はUSB/LANと機種別対応を掲載。掲載OSはmacOS/Windows/Linux|このSDKをiOS対応とみなさない。機種別SDK/公開protocolの取得と専用adapterが必要|
|FUJIFILM|[公式SDK](https://www.fujifilm-x.com/ja-jp/camera-control-sdk/)はUSB/TCP-IP、OS別条件を掲載|iOSが掲載されていると扱わない。モデルと接続方式ごとの公開手段を確認して追加|
|Nikon|[SDK Information](https://sdk.nikonimaging.com/information/en/)は機種別Module SDK更新を掲載|各Moduleの対応OSと仕様取得。SnapBridgeの存在をSUITE実装済みとしない|
|Panasonic|[LUMIX SDK](https://av.jpn.support.panasonic.com/support/software/tool/sdk.html)提供窓口あり|SDK対応OS/機種/配布条件と実adapterは別途|
|OM SYSTEM|今回汎用OS通信以外の専用API未確定|専用protocol/SDK仕様を取得して判断|
|PENTAX/RICOH|[Image Sync](https://www.ricoh-imaging.co.jp/japan/products/app/image-sync2/)に対応機種別無線機能がある|専用アプリと公開APIを混同しない。旧SDK参照URLは取得できず専用adapter未実装|

この依存を「アプリ未接続」だけに丸めない。メーカー専用adapter、wireless、live view、露出操作の不足があればテザー全件完成と報告しない。

## 原本と処理順

カメラ側原本は削除しない。受信完了ファイルを固有領域へ保管し、byte size/SHAで照合。Cloud Safe確認前に自動削除しない。カメラobject IDだけで恒久重複を判定しない。受信→原本保管→Proxy→写真別解析→Look適用を区別し、保存済みLook変更は後続写真にだけ反映する。撮影済み写真へ新Lookを勝手に再適用しない。

残りの接続は全コード段階の後。テザーからPhotoPipeline/Asset登録/Proxy/解析/Recipe保存の実経路を接続する際、各段階を成功したふりにしない。外部カメラpermission、OS lifecycle、Xcode組込みは後段に明示する。
