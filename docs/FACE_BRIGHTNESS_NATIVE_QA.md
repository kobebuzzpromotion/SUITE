# Face Brightness — Native / 実画像 / 実RAW / 実機QA

作成日: 2026-10-03。対象は既存仕様の `face_brightness` 1項目だけ。現在の状態は **IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED**。本書作成中にApple実行・画像処理・実機操作は行っていない。以下の実行結果はすべて **NOT_RUN**、Mobile ReleaseはBLOCK。手順書やソース照合を画像PASSへ昇格させない。

他のRetouch、写真間人物追従、全RAWカメラ対応を追加・合格扱いしない。元147節・固定6契約・既存Evidenceは変更しない。Native試験の最終件数・IDは親の統合catalogを使い、本書に固定しない。

## 1. 最短順序と別々の判定

| Gate | 最短の実行 | 合格が示す範囲 | 現在 |
| --- | --- | --- | --- |
| Core unit | MacでMETISMobileCore / SuiteCoreのSwift tests | JSON、UUID/anchor、履歴、CAS、保存・再open等の機構 | NOT_RUN |
| Apple unit/build | XcodeGen→iOS build→SUITETests | Swift6/API compile、生成画素によるCoreImage合成、geometry等 | NOT_RUN |
| Face実画像 | 本物の複数人物でProxyと原本Finalを比較 | 実Vision・実mask・対象選択・画像品質・一回適用 | NOT_RUN |
| 実RAW100 | 既存runnerの100セット | 実カメラRAWのdecode/負荷。full lifecycleは別不足を残す | NOT_RUN |
| 実RAW500 | 同500セット | 100の成功を流用しない | NOT_RUN |
| 実RAW1000 | 同1000セット | 100/500の成功を流用しない | NOT_RUN |
| iPhone実機 | §5の独立run | iPhoneのUI・保存・実終了復旧・Final | NOT_RUN |
| iPad実機 | §6の独立run | iPad専用layoutと同じ一連の操作 | NOT_RUN |

Mac CLI・Simulator・一方の端末の結果は他Gateの代替ではない。Swift6対応Mac/Xcode/SDK、XcodeGen、Node、署名用の正規Team/Bundle ID、実在する端末モデル/OS/destination IDを先に記録する。`project.yml`はiOS17.0、両CoreとMac QA packageはmacOS14候補だが、製品最低OS・対応実機の検証済み宣言ではない。

## 2. Macで実データ不要のNative unitとbuild

SUITE rootから各コマンドを個別に実行し、非0終了では後続を成功として扱わない。stdout/stderr/終了値、Swift/Xcode/SDK、ソースSHA、実runIdを新規証拠領域へ保存する。`/actual/...`と`<...>`は利用者が確認した絶対path/IDへ置換する。既存report/xcresultは上書きしない。

```sh
cd /actual/SUITE
swift --version
xcodebuild -version
node --version
xcodegen --version
swift test --package-path packages/METISMobileCore
swift test --package-path packages/SuiteCore
swift build --package-path apps/apple -c release
swift build --package-path apps/apple -c release --show-bin-path
cd apps/apple
xcodegen generate
xcodebuild -list -project SUITE.xcodeproj
xcodebuild -showdestinations -scheme SUITE -project SUITE.xcodeproj
xcodebuild build -scheme SUITE -project SUITE.xcodeproj -destination 'generic/platform=iOS Simulator' -resultBundlePath /actual/external/REPORTS/new-build.xcresult
xcodebuild test -scheme SUITE -project SUITE.xcodeproj -destination 'id=<observed Simulator destination ID>' -resultBundlePath /actual/external/REPORTS/new-native-unit.xcresult
```

Mac QA executableは製品Mac版ではない。Swift package buildだけではUIKitを含むiOS EditorModel/共通controlsをcompileしていないため、iOS buildも必須。SimulatorでVision requestが利用不能なら、そのエラーを記録して実画像Gateを保留する。blank画像が「どの理由でもthrowした」というunit結果は、顔検出精度やmissing-mask分類の実証ではない。

読取り確認した試験境界:

- `PortraitRecipeTests.swift`: typed plain JSON/UTC、値範囲、写真/hash binding、UUID/anchor継続、EditHistory Undo/Redo/分岐、ProjectStore CAS/再open/破損拒否。任意保存bytesは写真・RAWではない。
- `PortraitPipelineTests.swift`: 一意/欠落/曖昧/重複anchor対応、実CoreImage compositorのmask内変更/外保持、0EV no-op、互いに離れた二つのmaskで二重適用なし、scale比較、blank拒否、Original不足拒否、隠れたredo inventoryのUUID再利用。生成maskはVision segmentationではない。
- 既存`PhotoPipelineTests.swift`/`CropExportPipelineTests.swift`: 生成JPEG/PNGで取込、Proxy、原本限定Final、Crop/回転、画素/dpi/bit depth/profile/alpha/metadata。実RAW/顔品質/実機合格ではない。

合格条件: 全対象を実compileし、対象testsが実行されFAIL/意図しないSKIPなし。これを`NATIVE_UNIT_VERIFIED`の範囲だけで保存し、実画像検証状態は据え置く。最新testsは独立担当編集中のため、実行したsource SHAとcatalogを必ず紐付ける。

## 3. 実画像の最小セットと比較方法

撮影者/被写体の権利を確認した本物の写真をcheckout外で管理する。少なくとも、離れた二人、近接/重なりのある複数人物、横顔/遮蔽、小さい顔、難しい背景、顔なし、背景がほぼ写らない人物、EXIF回転/鏡像を含める。重なる顔bbox、保存inventoryの一部欠落/追加検出は安全拒否を期待し、無理に適用成功を要求しない。実RAWとJPEGを分離し、カメラ/decoder/画像向き/解像度/Proxy長辺を実測記録する。生成顔・JPEG改名RAW・同一画像の水増しは不可。

1. sourceとアプリ複製OriginalのSHA-256/bytesを記録。通常表示/人物解析はProxyから行い、ネットワークOriginal取得がないことをログで確認する。
2. 「この写真の顔を検出」→回転/Crop前の参照写真の番号を確認→対象Aを明示選択。UUID/anchor/assetID/hashを保存Recipeから照合。番号は表示順であり人物IDではない。
3. global露出/contrast/saturationを同じ中立条件に固定し、0EV基準、Aのみ非0、A/B別値、Aを0に戻したrunを採る。値は試験者が明示指定し、LOW/MEDIUM/HIGH/AUTOへの架空mappingを使わない。
4. 同じ固定Recipe revisionでProxy previewと原本Finalを取得。Finalは原本を再解析して一意対応・新しいperson-instance maskを得ること。Proxy画像や以前のmaskをFinalへ渡さない。
5. 同じ表示サイズへ揃えて100%表示、顔境界/別人物/背景を比較。FinalのPNGまたは適切なlossless出力を主比較に用い、JPEGによるmask外の圧縮差を漏れと混同しない。比較色空間・resampling・量子化・測定領域・誤差許容は実験前に記録し、失敗後に許容値を緩めない。
6. 回転0/90/180/270とCropを別runで追加。参照写真は常に元の向き、実描画はportrait→global→rotation/Cropで一回。回転/Crop後の座標を保存anchorへ二重変換しない。
7. 同じRecipeでFinalを再出力して、累積的に明るくならず新規成果物になることを確認。A/B順の入替えでUUIDに紐づく値が交換されないことを確認する。
8. 成功/失敗/中断後にsourceとアプリOriginalのSHA/bytesを再検査。Recipe・前の成功成果物を保持し、partialを完成品として公開しない。

合格条件: 選択顔の明るさだけが意図どおり変わり、本人性/形状を変更しない。別人物と背景に人物補正由来の変化がなく、輪郭のhalo/硬い境界/色ムラ/二重EVがない。背景を動かすglobal操作を試す場合は同一global条件の基準と比較する。Proxy/Finalの人物対応・明るさ意図が一致し、画質差の実測根拠を記録する。「設定値が同じ」「出力fileが存在」だけでは合格しない。

実fixtureの許容誤差や評価者合意が未確定なら`UNKNOWN/BLOCK`。既存synthetic compositorの数値toleranceを実RAW/人物品質の基準へ流用しない。mask診断画像/instance対応/原本由来の解析ログを現buildから取得できない項目は、実証不足としてNOT_RUN/BLOCKを残す。本書は診断APIや一時的product編集を許可しない。

## 4. 拒否条件を本物の画像・保存データで確認

| 条件 | 期待結果 | 必須証拠 |
| --- | --- | --- |
| 顔なし/検出欠落 | 補正・Finalを拒否。全画面EVへfallbackしない | エラー、非公開Final、保存内容/SHA保持 |
| 保存anchorのIoU>=0.5候補が0または複数 | 一意照合失敗で停止 | 保存targetとfresh検出の対応、誤人物に適用なし |
| inventoryの部分削除/UUID置換/検出顔の追加・欠落 | 保存・復元は全inventory保持、renderは顔数一致を要求し拒否 | 全UUID→geometry対応、部分一致で成功しない |
| 保存anchorまたはfresh顔bboxが重なる | 初回解析・再解析とも拒否 | overlap geometry、別人物や同じ画素への二重補正なし |
| 二つのtargetが同じ顔/instanceを要求 | 重複対応を拒否 | 対応ログ、停止、原本不変 |
| person mask不足/背景分離不足/競合 | 停止。人工的な全白maskで成功させない | 実maskまたは取得失敗理由、非公開Final |
| 別写真UUID/hash/anchor再割当 | typed検証/保存/renderで拒否 | 既存Recipeが無断置換されない |
| 未知engine/control/不正値 | 拒否して内容保持 | unsupportedエラー、黙って項目を落とさない |
| portrait付き固定Exportのrevision/parameters/Original pathが保存checkpointと不一致 | 最新Recipeへ置換せず、人物補正・Finalを拒否 | 固定Planと保存checkpoint、拒否理由、旧Recipe/Version/原本保持 |
| 固定Plan内の既知person UUIDのanchor入替え | shape-validでも保存inventoryとの不一致で拒否 | `NAT-111`・`NAT-112`と実画像拒否runを別記。現在いずれもNOT_RUN |
| Original不在/不一致/未対応RAW | 待機または拒否。embedded preview/Proxy Finalなし | 原本限定入力、hash検査、出力なし |
| 温度/メモリ不足・途中中断 | 待機/停止、成功と数えない | 実resource/時刻/処理結果、前後SHA |

Engine-v1ソースの拒否policyは、face mask coverage>=0.5のinstanceが一つ、競合coverage>0.05は拒否、背景minimum<=0.05/maximum>=0.8/averageが(.001,.995)、UUID対象の顔対応はIoU>=0.5厳密一候補・再利用禁止。保存/検出の全顔数一致と、双方のbbox間に正の重なりがないことを要求し、maskはbbox外を明示0にする。解析開始/失敗時には旧参照写真と選択IDを無効化する。これらは内部安全guardであり、mask品質の実証でもbeauty presetでもない。0EVの保存targetも実照合/maskを要求するので、対応不能なら中立値でも停止する。

最新Export sourceはportraitを含むPlanについてのみ、保存済ProjectStoreのexact revision/current parameters/解決Original pathを再照合してから適用する。人物ID/geometryを自己記述Planだけで信頼しない。実行・描画はNOT_RUN。旧revisionのPlanを新編集後にretryする耐久job snapshot機構は未実装なので、現在は安全拒否が合格条件。これを全Exportの履歴再試行対応済みと解釈しない。

## 5. iPhone実機の独立フロー

観測したiPhoneのdestinationを使い、別runId/xcresult/動画/出力を保存する。

```sh
cd /actual/SUITE/apps/apple
xcodebuild test -scheme SUITE -project SUITE.xcodeproj -destination 'id=<observed physical iPhone ID>' -resultBundlePath /actual/external/REPORTS/new-iphone.xcresult
```

署名した実buildで、下部「読み込む」→Filesの実写真/実RAW→Proxy表示→「調整」sheet内Face Brightness→対象確認/明示選択→EV→sheetを閉じ比較→Undo/Redo→保存完了を確認→実アプリ終了/relaunch→保存値/UUID/anchor/履歴を確認→JPEG/PNG/TIFFを別runでFinal→Share Sheetで新しい成果物保存、の順に行う。初回検出直後までUndoした別runでは、hidden redoのUUID/anchor/createdAtを維持した中立再解析を確認する。

同じ実機で縦横、small screen、Dynamic Type、VoiceOver、sheetのmedium/large、44pt操作領域、対象番号と実顔の判別、画面外slider/閉じるbuttonを確認。写真切替後に旧写真の参照画像/対象/previewを混入させない。保存中の強制終了、ロック/unlock、Export中断は別runとして未保存draftの消失・復旧不足も記録する。実同期/Cloud Safeが未接続ならそこはBLOCKであり、local Face QAだけを合格範囲にする。

## 6. iPad実機の独立フロー

iPhoneとは異なる実iPad runId/destination/evidenceを用意する。

```sh
cd /actual/SUITE/apps/apple
xcodebuild test -scheme SUITE -project SUITE.xcodeproj -destination 'id=<observed physical iPad ID>' -resultBundlePath /actual/external/REPORTS/new-ipad.xcresult
```

専用画面「読み込む」→Proxy→編集inspectorのFace Brightness→対象確認/選択→EV→上部比較/Undo/Redo→保存→実終了/relaunch→同じUUID/anchor/値→原本Final→共有を一巡する。iPhoneで取り込んだassetの復元はcross-device実接続が必要な別Gateであり、未接続を省略成功にしない。

横向きのside inspector、縦向き/狭いwindowのstack layout、Split View/Stage Managerが実OSで使える場合のresize、Dynamic Type、Pencil/Pointer/Keyboardで対象選択とEV操作を確認する。未実装のPencil画像描画やkeyboard shortcutを対応済みとして試験しない。各画面で参照写真と番号が見え、重要buttonが隠れないこと。実終了/ロック/容量不足/Export中断はiPadで再実施し、iPhone結果を転記しない。

## 7. 既存実RAW100/500/1000 runner

入力はcheckout外の実RAW専用`RAW/100`、`RAW/500`、`RAW/1000`。sourceをread-onlyにし、work/reportを別の専用外部領域へ分離する。sidecar/JPEG混在、symlink、偽装、水増しを拒否する。件数から50GB等の容量Gateを推定しない。

```sh
cd /actual/SUITE
node scripts/raw-harness.mjs manifest --root /actual/external/RAW --sets 100,500,1000 --report /actual/external/REPORTS/new-manifest.json
swift build --package-path apps/apple -c release --show-bin-path
node scripts/raw-harness.mjs pipeline --root /actual/external/RAW --sets 100,500,1000 --adapter /actual/external/adapter.json --work-dir /actual/external/SUITE_QA_OUTPUT --timeout-ms 900000 --report /actual/external/REPORTS/new-raw-pipeline.json
```

確認したbuild出力内の実在する`SuiteRawQAAdapter`の絶対pathを、利用者が外部`adapter.json`へ設定する:

```json
{"command":"/actual/build-output/SuiteRawQAAdapter","args":[]}
```

Manifestはcount/bytes/camera/format/source SHA/manifestChecksumを記録するがdecoder成功ではない。runnerは実workerの13計測と全source前後SHAを収集し、入力を削除しない。新規reportだけ許可し、exit2やFAILED_OR_INCOMPLETEを手でPASSへ変更しない。

重要な限定: 現`RawQAAdapter.swift`はglobal露出0.25のlocal RAW→Proxy→JPEG→ProjectStore再open候補で、**portrait解析/Face Brightness recipeを呼ばない**。その成功はFace Brightness 100/500/1000負荷の証拠ではない。Macで同adapterが実測できても追加必須stage `sync/recipeSave/restartRecovery/cloudSafe`を報告しないため、runnerのfull lifecycleは不足stageを含むFAILED_OR_INCOMPLETEが正しい。ローカルmetadata再openを実process restartに読み替えない。Face専用の実RAW全件計測adapter/診断接続を本書で追加しない。

| セット | local実RAW decode/Proxy/Final | Face実RAW負荷 | full lifecycle | iPhone | iPad |
| --- | --- | --- | --- | --- | --- |
| 100 | NOT_RUN | NOT_RUN / 既存adapter範囲外 | NOT_RUN / 必須4stage未接続 | NOT_RUN | NOT_RUN |
| 500 | NOT_RUN | NOT_RUN / 既存adapter範囲外 | NOT_RUN / 必須4stage未接続 | NOT_RUN | NOT_RUN |
| 1000 | NOT_RUN | NOT_RUN / 既存adapter範囲外 | NOT_RUN / 必須4stage未接続 | NOT_RUN | NOT_RUN |

詳しい13計測、容量matrix、入力/出力guardは`RAW_QA.md`、失敗系は`MOBILE_DEVICE_QA.md`/`FAILURE_MATRIX.md`を併用する。`node --test scripts/raw-harness.test.mjs`は任意bytes/JSONLの機構試験だけで実RAW・実機ではない。

## 8. 読取りで確認したソースリスク・未実装

| 指摘 | 現在のソース境界 | 次の検証・判定 |
| --- | --- | --- |
| Mac QA targetの新file漏れ | 初読時`apps/apple/Package.swift`はPortraitPipeline.swiftを含まず未定義型となる構成だった。親への報告後、sources追加を再読確認した | ソース是正済み、buildはNOT_RUN。Swift packageで実compile必須 |
| RAW initializer | PhotoPipelineとQA adapterは公式typed`CIRAWFilter(imageURL:)`へ是正されたことを再読確認 | 実SDK compile/実RAW decodeはNOT_RUN。全カメラ対応を推論しない |
| Swift6 strict concurrency | UI/UIImageはMainActor、Vision/CIオブジェクトはPhotoPipeline actor内部、返却はData/typed Sendable値。iOSとMacは別target | SDKのSendable診断、XCTest async isolation、SwiftUI型推論を実compile。注釈の存在は合格ではない |
| Vision/API availability | 構成上iOS17/macOS14に合わせ、顔Revision3・person-instance Revision1・scaled-mask APIを使用 | 使用SDKでavailabilityとrequest revision対応を確認。APIを旧OSへ弱めて成功扱いしない |
| mask方向/scaleとRAW orientation | upright zero-origin画像→Vision lower-left anchor、生成maskをimage extentへscale、portraitの後に回転/Crop | EXIF回転/鏡像、CVPixelBuffer方向、補間、Proxy対Finalの検出変動を実画像で検証。未実証はBLOCK |
| メモリ/温度guard | physicalMemory比率でsource/mask総量を保守推定。実空きmemory/RSSや圧力の測定adapterではない | 実高画素RAW/複数人物/熱状態でpeakと拒否を測定。無制限成功や性能値を宣言しない |
| 中立portraitの再照合拒否とUI | 0EVも実maskを要求。preview拒否で旧画像を消す。両専用ViewのcanEditはpreview存在を要求 | 中立recipeでも検出不能なら編集panelが使えないケースを記録。前portraitへUndoできる場合のみ復旧を確認、未提供の回避UIを成功手順にしない |
| UUID→geometryの凍結Gate | 同写真の現portrait/残るhistory inventoryは全員分維持し、部分削除も拒否。顔数変動/overlap bboxで停止。履歴からinventory全体が消えた後の寿命全体identity ledgerはない | UUID永久継続や写真間追従を宣言しない。全UUID/anchor/valueの保存、Undo/再解析/reload、部分inventory拒否を試験する |
| 未登録OriginalRecovery | 取込はOriginalコピー→Proxy→checkpoint保存。取込中断で未登録Original/Proxyが残る起動reconcile/journalは未実装 | QA複製の仕事領域で途中終了を再現し一覧とfilesystemを照合。残存bytes/hashを保全、UNIMPLEMENTED/BLOCKと記録。勝手に登録/原本削除/cleanupしない |
| 未保存draft・full lifecycle | 保存失敗変更はメモリ保持で強制終了耐久未完成。production認証/sync/Cloud Safe/耐久Batchは本項目で完成しない | local保存済み復元と未保存draft喪失を分離。全V1/Releaseは別Gate |

一回適用のソース境界: previewとFinalは共通`PhotoPipeline.apply`内のportrait stage一箇所を通る。対象再表示用`validatePortraitTargets`は生成graphを破棄し、ProxyもOriginalも上書きしない。これでも実pixelの二重適用なしを証明したことにはならず、§3とNative compositor試験を実行する。

Apple一次API資料: [人物インスタンスマスク](https://developer.apple.com/documentation/vision/vngeneratepersoninstancemaskrequest)、[scaled mask](https://developer.apple.com/documentation/vision/vninstancemaskobservation/generatescaledmaskforimage%28forinstances%3Afrom%3A%29)、[Vision正規化座標](https://developer.apple.com/documentation/vision/vndetectedobjectobservation/boundingbox)、[露出EV](https://developer.apple.com/documentation/coreimage/ciexposureadjust/ev)、[maskの0/1合成](https://developer.apple.com/documentation/coreimage/ciblendwithmask/maskimage)、[RAW initializer](https://developer.apple.com/documentation/coreimage/cirawfilter/init%28imageurl%3A%29)。API資料はSUITEの動作証拠ではない。

## 9. 実行後に必要な最小Evidence

各runにUTC開始/終了、実機種/OS/SDK、build/source SHA、fixtureの許諾・source hash/bytes、assetID、target UUID/anchor/value、Recipe revision/createdAt/updatedAt、Proxy寸法、原本/Final寸法・形式/profile、解析対象のrepresentation、mask/対応の証拠、比較領域/事前tolerance、画面動画、出力、エラー、前後Original hash、実終了/relaunch時刻、操作ごとの期待/実際/結果を保存する。秘密tokenや被写体データを公開repoへ入れない。

合格はGate/端末/セットごとに限定して親が新規Evidenceへ記録する。未実装はUNIMPLEMENTED、未接続はNOT_CONNECTED、未提供環境/実画像はNOT_RUN/BLOCKED_EXTERNAL_ENVIRONMENTとして区別する。実Proxy/Final視覚QAが終わるまでFace BrightnessはIMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED、全商用V1/Mobile Releaseは未合格を維持する。

## 10. Person Geometry Gate — 選択状態の遷移追補

今回のEditorModel最小修正は一時的UI状態の無効化だけで、Recipe/history/原本保持・maskの毎回fresh解析は維持する。新cache、network API、DB/schema、nearest/先頭人物fallbackは追加しない。以下のNative state testsはNOT_RUN。

| 受け付けた操作 | 開始直後 | 成功後 | 失敗後 |
| --- | --- | --- | --- |
| `load()` / 実際の再読込開始 | 参照画像=nil、選択ID=nil。list await中はisBusy | 写真loadへ引き渡しても人物未選択 | 参照/選択nil。旧RecipeやOriginalを削除しない |
| `select(asset)` | 参照/選択nil。旧解析画面を持ち越さない | 新写真は人物未選択。保存UUID/anchorはその写真のRecipeに保持 | 参照/選択nil。以前の写真/Recipeを別写真で上書きしない |
| `importFile(url)` | 参照/選択nil | 新写真は人物未選択 | 参照/選択nil。既存Original削除/取込orphan自動cleanupなし |
| `preparePortraitTargets()` | 参照/選択nil | fresh gate成功後だけ参照画像を表示、選択IDはnil | 両方nil。以前の選択を復活させない |
| `selectPortraitTarget(unknown)` またはbusy/参照なし/保存失敗時の選択要求 | 選択ID=nil | 正規の既知IDを明示要求したときだけ選択 | 以前のIDを保持/nearestへ置換しない |

busy/loaded等の既存guardで写真操作自体が受け付けられない場合は新しい写真処理が始まったとは数えない。無効な人物選択要求だけはその場合も古い選択IDを解除する。正規の人物選択要求はrequested UUIDをそのまま使い、現在の参照画像を保持する。

実AppのApplicationSupportを試験で触らないため、後方互換の内部Swift initializer `EditorModel(backend: ..., storageRoot: temporaryFileURL)` を追加した。nil既定値は従来のApplicationSupport/SUITE、non-fileURLは初期化エラーで拒否する。これは既存network/保存契約変更ではない。Native testsは固有temp folderで実ProjectStore/PhotoPipelineを用い、欠落checkpoint、欠落Proxy、不正checkpoint一覧、欠落取込fileを実際に失敗させて開始時/失敗後のnilを確認する。fake成功adapterを入れず、test fixture以外を削除しない。状態機構の合格でも実mask/画質は未検証のまま残す。
