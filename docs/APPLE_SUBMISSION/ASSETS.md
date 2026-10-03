# スクリーンショット・アイコン要件

2026-10-03 JST確認。提出用画像は**未作成 / NOT RUN**。現状のUIはnative未ビルドであり、想像の画面・生成モック・PC縮小画面を完成アプリのスクショにしない。

## Screenshots

1表示サイズにつき1–10枚、JPEG/JPG/PNG、alpha/透過なし。以下はAppleの受理サイズから初期2端末向けだけを転記した候補で、購入すべき端末モデルの指定ではない。[Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)

| 対象表示群 | 縦向きpx（横向きは幅高さを入替） | 要件 |
| --- | --- | --- |
| iPhone 6.9型 | 1260×2736、1290×2796、1320×2868 | 提出候補 |
| iPhone 6.5型 | 1284×2778、1242×2688 | iPhone対応で6.9型を用意しない場合に必要 |
| iPad 13型 | 2064×2752、2048×2732 | iPad対応で必要 |

その他の表示群は公式表とASC Media Managerの最新表示で確認。自動スケール可能なことを、iPad専用UIや小型iPhoneの実機QA省略の根拠にしない。初期のMac screenshotsは不要。

候補シーンは①ライブラリ/Import→Proxy ②基本編集+Undo/Redo ③固定RecipeからJPEG/TIFF Export。各機能が検証済みになった時点で実画面を撮る。iPhone下部操作とiPad canvas+inspectorの専用構成をそれぞれ示す。Cloud Safe/AI/Session Look等は接続/実測後のみ掲載する。写真は権利/肖像同意確認済みのものを用い、顧客ID・token・GPS等を写さない。

各画像にbuild SHA、version/build、端末orSimulator名/OS、画面操作、採用RAWの権利記録と匿名asset ID、撮影日時をEvidenceで紐付ける。Simulatorで取得したストア用画像はSimulatorと記し、iPhone/iPad実機Gateへ流用しない。

## App icon

Icon ComposerまたはXcode asset catalogに追加し、build経由でASCへ届ける方式。現repoにはAppIcon/xcassetsを確認できない。[Add an app icon](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon/)

iPhone/iPadのIcon Composer canvasは1024×1024。layered iconではsystem maskを焼き込まず、素材/見え方を確認する。従来のasset catalog方式を採る場合はXcodeのApp Store用1024×1024を含む設定を確認し、flattened assetのalpha/透過エラーをarchive検証で確認する。layer透過と最終提出画像の扱いを混同しない。icon方式・完成design・全appearanceは未確定で、このPackは画像生成や方式採用を行わない。[Creating your app icon using Icon Composer](https://developer.apple.com/documentation/Xcode/creating-your-app-icon-using-icon-composer) / [App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons)

## 合格条件

- 対象buildの実画面から取得、所定format/px/count/透過検査、未実装機能の表現なし。
- iPhone/iPadそれぞれで文字欠け/トリミング/portrait-landscape/実UI差異を目視確認。
- 原本写真・人物・font/icon/ブランドの使用権利を確認。
- Xcode archive icon検査とASCのassets validationを通過。ただし外部uploadは別途承認後。
- 現在は全項目NOT RUN。必要環境: 動作するMac/Xcode、対象build、権利済み素材、実機。画像用Simulatorを使用する場合も実機Gateは別。

