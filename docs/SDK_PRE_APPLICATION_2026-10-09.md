# メーカーSDK・事前申請／相談の確認（2026-10-09）

対象：日本から開発するSUITEのiPhone／iPad／macOS向けカメラ連携。公式公開ページを調査した記録。申請送信、利用規約への同意、SDKダウンロード、費用発生は行っていない。

## 結論

アプリ全体の完成を待つことが、各社共通のSDK取得条件になっているわけではない。開発段階で用途・対象機種・対象OSを提示し、入手／提供可否を確認する段階を先行できる。ただし「相談できる」「取得できる」「商用配布できる」「iOSで動く」は別の判定である。

公開資料だけで完成品必須を確認できなかったことは、審査時にデモや追加資料を求められない保証ではない。完成版申請資料は後で確定し、今は未完成であることを明記した事前相談を用意する。

## 7社比較

| メーカー | 今できること／完成品条件 | 入口・法人条件・必要情報 | iPhone／iPad／macOSの判断 |
| --- | --- | --- | --- |
| Canon | 開発支援パッケージの申込・取得相談。公開案内に完成品提出を条件とする記載は確認できず | 国内は原則法人、個人提供は同社判断。顧客情報記入と使用許諾が必要。資料選択フォームでEDSDK／CCAPIを選択。後段の全入力項目は未確認。[公式案内](https://personal.canon.jp/product/camera/software/api-package)、[国内申込](https://forum1.canon.jp/public/application/add/7119) | EDSDKはUSBのWindows／Mac／Linux。CCAPIは無線・HTTPでOS非依存、スマートフォン／タブレット向けも案内。iOS向けにEDSDKのMacバイナリを転用できるとは扱わず、CCAPI対象機種／有効化／機能を別確認 |
| Nikon | 開発者向け無償SDKの取得手順が公開。カテゴリ→SDK→許諾→取得で、完成品提出段階は記載なし | 公開手順上、法人限定や審査用完成品の記載なし。個別ライセンス確認が必要。SDK技術サポート及び技術質問窓口は提供しない旨が明記されている。[SDK入口](https://sdk.nikonimaging.com/apply/)、[取得手順](https://sdk.nikonimaging.com/apply/guide)、[FAQ](https://sdk.nikonimaging.com/information/en/) | Remote Module SDKとNEF／NRW Image SDKは別。macOS対応更新あり。iOS／iPadOS版の提供は今回の公開資料で確認できず。NX MobileAir等の公式アプリの存在を第三者向けSDK提供と混同しない |
| Sony | 国内相談及び商用Toolkit利用許諾申請。申請フォームは想定用途・検討中機種・予定台数を聞くため、計画段階で相談する根拠になる。公開必須項目に完成アプリ提出はない | 国内SDK／Commandは個人へ提供しないと明記。会社・部署・氏名・住所・電話・メール・会社URL（なし可）・輸出有無・用途／具体内容・検討機種・年間購入予定数・有料サポート意向。許諾審査あり。[SDK／相談入口](https://www.sony.jp/camera-biz/sdk/)、[商用申請フォーム](https://www.sony.jp/camera-biz/camera-remote-toolkit/permission.html) | SDKはmacOS／Windows／Linux。Remote Commandは別提供物で、OS非依存・iOSへの搭載を明記。USB／有線LAN／Wi-Fiは機種別。iPadOSの機種／接続実績とApp Store配布条件は別確認。[Command公式](https://www.sony.jp/camera-biz/command/) |
| FUJIFILM | カメラ制御SDKを開発者向けに提供。個人／ビジネスの入口が分離。完成品提出必須の公開記載は今回確認できず | SUITEの商用用途は公式ページのビジネス入口から条件確認。法人限定か、事前審査か、必要入力一式は未確定。個人向け条件を商用契約の代用にしない。[SDK公式](https://www.fujifilm-x.com/ja-jp/camera-control-sdk/)、[国内相談先](https://www.fujifilm-x.com/ja-jp/support/contact/) | macOS、Windows、Linux、Androidが掲載。USB／TCP/IP（機種・FW例外あり）。iOS／iPadOSは掲載一覧で確認できず。RAW現像用SDKではない。カメラ保証に関する注意あり、契約ルート別に確認 |
| Panasonic | 公開LUMIX SDKの取得条件を確認できる。完成アプリではなく対象カメラの機種と製造番号が必要 | 法人限定の記載は確認できず、対象機種使用者向け。取得には機種選択と11桁英数字製造番号、使用許諾が必要。SDK窓口 lumixsdkinfo@gg.jp.panasonic.com。ただしBeta版で操作／技術質問には対応しない旨あり。[公式SDK／窓口](https://av.jpn.support.panasonic.com/support/software/tool/sdk.html) | 公開パッケージはWindows 10 64bit、DLL／ヘッダ、USB、BGH1／BS1HのみEthernet記載。macOS／iOS／iPadOS用提供は未確認。LUMIX TetherがMacで使えることとSDKの対応OSは別 |
| OM Digital Solutions | 法人事業公式にCamera Control SDKを確認。一般的な受託相談の流れに、仕様書がない段階でも相談可能との記載。SDK無条件提供を意味しない | 法人・個人事業主向け問い合わせフォーム。名前・電話・メール・問い合わせ本文が必須、会社／部署欄あり。本文1000字以内。SDK専用審査・料金・NDA・再配布条件は未確認。[SDK掲載](https://biz.om-digitalsolutions.com/solution.html)、[法人相談フォーム](https://biz.om-digitalsolutions.com/contact/) | 設定変更・シャッター・ライブビューの説明あり。対応機種、USB／無線、macOS／iOS／iPadOS対応は公開ページに具体表なし。旧AIR A01、Audio SDK、OM Captureと同一SDK扱いしない |
| RICOH／PENTAX | 現行のカメラSDK取得／申請の国内条件を確定できず。まず提供継続・窓口照会。完成品必須かも不明 | 旧api.ricohカメラSDKページは今回取得エラー。旧RICOH著作権表示のiOS API資料が検索結果にあるが、直接開くと404。現在取得可能という証拠にしない。[国内製品相談](https://www.ricoh-imaging.co.jp/japan/support/product.html)、[旧SDK URL（今回取得失敗）](https://api.ricoh/products/camera-sdk/) | 旧資料のiOS SDK存在と、現行iOS／iPadOS／macOS・新機種への対応は別。現行配布、商用許諾、機種ごとのUSB／無線を要照会。THETA／ScanSnap／複合機SDKをPENTAX／GR用として申請しない |

## 事前相談用にこちらで準備する情報

以下はSUITEからの推奨説明項目であり、全メーカーの必須申請項目と断定しない。

1. 申請主体の正式名称、法人／個人事業主の区分、日本の所在地、担当者、連絡先、Webサイト。
2. SUITEは開発中の写真撮影・編集・管理アプリ。完成済み機能と未実装／実機未確認部分を分ける。
3. 目的：撮影画像の原本転送、ライブビュー、シャッター、ISO／絞り／シャッター速度等の操作。画像取込だけと撮影制御を分離する。
4. 対象：iPhone／iPad／Apple Silicon Mac。それぞれ希望OS、USB／Wi-Fi／Ethernet、直接制御かMac中継かを明記する。
5. 対応希望カメラの具体型番・FW、所有機と借用予定機。全日本メーカー・全世代対応とは申告しない。
6. 商用配布形態（App Store／Mac配布等）、有料アプリ予定、配布地域、予定時期。未確定は未確定と書く。
7. 開発段階のSDK／通信仕様提供可否、NDA、利用料、再配布対象ライブラリ、OSS混在条件、Apple向けサンプル、検証機貸出の可否を質問する。
8. 返答後に必要となる最小デモ・仕様書・評価報告書があるか、正式申請との分離可否を聞く。

写真データ、顧客情報、秘密鍵、実カメラ製造番号を公開資料へ埋め込まない。製造番号は本人が必要なメーカーの公式フォームへ直接入力する。

## 実装に戻す判定ルール

- SDK入手前のadapter／UI／エラー処理のコード準備と、メーカーSDKを組み込んだ接続完了を分けて報告する。
- 無償配布・API公開は、全OS・全機種・全機能・商用再配布の包括許可ではない。
- 機種別の「USB取込」「USB撮影」「無線取込」「無線撮影」「ライブビュー」「露出操作」を別欄で管理する。
- iOSでメーカーコマンドが使えるかは、OSの接続API、カメラの転送モード、許諾・提供物を合わせて確認する。OS非依存という説明だけでApple実機対応済みにしない。
- この調査では機種の動作検証・通信実験を行っていない。申請の送信や規約同意はユーザーの別指示後に行う。

## 未解決事項

Canonフォーム後段の全必須項目、FUJIFILM商用ルートの申請情報一式、OMのSDK対象OS／機種／契約、RICOH現行SDK提供経路が未確定。Nikonは技術回答が来る前提の計画を置かない。これらを「完成したら必ずメーカーから情報が返る」とは扱わない。

