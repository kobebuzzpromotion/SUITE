# Evoto詳細差分監査 — SUITE（公式根拠・実装成熟度を分離）

**旧162行の初期監査スナップショット。v2/v3の全機能・最小操作・platform監査完了とはしない。** 追加指示全文はEVOTO_DEEP_AUDIT_V2_REQUEST.md / EVOTO_DEEP_AUDIT_V3_REQUEST.md。最新の監査台帳と未分類/未確認件数は[EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md](EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md)。下表の成熟度と試験参照は当時の範囲であり、最新Crop/Workspace実行結果はINTEGRATED_REPORT.mdで照合する。

確認日: 2026-10-03 JST。主要競合はEvoto。公式資料による比較であり、Evotoの実機・速度・画質・操作試験は実施していない。

[機械可読版](evoto-audit.json) / [既存147節](TRACEABILITY.md) / [実行Evidence](verification-results.json) / [テスト名](TEST_CATALOG.md) / [引継ぎ](HANDOFF.md) / [追加Crop・印刷・Export正本](CROP_PRINT_EXPORT_SPEC.md)

## 結論・分類の読み方

SUITEのWindows保存基盤の部分PASSと、Swift実装候補・未実装の画像処理を分離した。露出・コントラスト・彩度・回転や単一JPEG/TIFF出力のコードがあっても、iPhone/iPadで完成・合格したことを意味しない。Session Lookや人物補正の意図データ型は、顔・肌・体型の描画エンジン実装ではない。

| 分類 | 主分類件数 | SUITE成熟度副軸件数 | 意味 |
| --- | ---: | ---: | --- |
| A | 1 | 4 | 実装済みかつ検証済み（行ごとの限定範囲） |
| B | 15 | 16 | 実装済み未検証区分：コードあり・機能完成/合格ではない |
| C | 76 | 84 | 仕様済み未実装（意図/enum/骨組みだけのものを含む） |
| D | 28 | 28 | 未仕様化（詳細要件の確定なし、今回追加しない） |
| E | 8 | 28 | 既存SUITE独自方式で代替する設計。成熟度別記、代替完了ではない |
| F | 2 | 2 | 不要候補（提案のみ、承認なしで既存仕様を削除しない） |
| G | 32 | — | 公式情報で対象機能/保証条件の存在未確認（SUITE成熟度はsuiteCategory別記） |

監査は162行・38公式出典・19領域・10操作段階。追加Crop仕様§13の30項目はEVO-133〜162として独立登録した。件数は監査粒度であり、テスト件数・完成率ではない。

GはEvotoの同じ機能または厳密な保証を公式情報で確認できなかったという意味。不存在・非対応とは断定しない。GのSUITE状態は副軸のsuiteCategoryで保持する。Aの主分類1行とG内の副軸A3行はいずれもWindows/backend限定で、native描画のAは0件。EはSUITE既存の代替方式・独自設計候補であり、市場唯一・実装済み・代替完了という意味ではない。

Dは詳細要件の未確定であり、包括的な既存要件を撤回しない。Fは不要候補の提案2件だけで、承認なしに既存仕様を削除しない。今回ユーザーが明示追加したCrop16節以外は、新仕様・provider・API・保存同期契約・クラウド構成を増やさない。旧147節・固定6文書・NON-DESTRUCTIVE・RAW不変・Mobile Release Firstは維持。Web実装は対象外。

## プラットフォーム差と確認限界

- Desktop 8.0、App 3.3、Video 1.6、Asset Hubは別製品・範囲。宣伝ページの機能を全platformへ広げない。[S25](https://blog.evoto.ai/evoto-product-launch-2026/)
- US公式listingはiPhone/iPad対応。取得時の表示は3.3.2。日本ストアの同一buildや全端末動作は実機未確認。[S24](https://apps.apple.com/us/app/evoto-photo-editor-retouch/id6596737043)
- iPhone有線、iPad有線/無線は個別公式記事を採用。カメラ固有条件を全機種対応としない。[S20](https://support.evoto.ai/wired-tethered-shooting-in-evoto-mobile/) [S21](https://support.evoto.ai/wired-tethered-shooting-ipad/) [S22](https://support.evoto.ai/wireless-tethered-shooting-ipad/)
- iPad Portrait記事の一部リンクはDesktop限定。Even (Dodge & Burn)は地域注記があり、日本で同条件とは断定しない。[S04](https://support.evoto.ai/portrait-retouching-ipad/) [S08](https://support.evoto.ai/skin-retouching-ipad/)
- MobileのCUBE/XMPはDesktopから同期されたpresetを使う説明。Mobile直接importの証明ではない。AI Creative ToolsのWeb導線もnative画像処理の証明ではない。[S03](https://support.evoto.ai/color-adjustments-module/) [S23](https://support.evoto.ai/quick-tour-of-evoto-mobile/)
- Cloud SpaceはWindows/macOS対象でiPad未提供と明記。Smart Preview先行・Export時のOriginal取得があるため、Proxy優先だけをSUITE固有とはしない。同ページの既存Original同期記述と新Smart Preview説明の適用条件には確認余地がある。SUITEのCloud Safe保証と同等とも断定しない。[S30](https://support.evoto.ai/cloud-space/)
- Desktop Exportは寸法/PPI/PPC/命名/PNG/8–16bit TIFF等を確認。Mobile ExportはJPG/TIFF、品質、sRGB、日時、Files/Photos、複数出力を確認したが、寸法/PPI/命名/PNG詳細は確認できない。[S01](https://support.evoto.ai/how-to-use-import-export/) [S18](https://support.evoto.ai/export/)
- DesktopのOriginal FormatはRAWをJPEG出力と説明する。MobileのOriginal表記だけからRAW無損失コピーや原本保証を推定しない。[S01](https://support.evoto.ai/how-to-use-import-export/) [S18](https://support.evoto.ai/export/)
- iPad Cropは寸法＋解像度の入力をインチで説明する。A0倍/B0倍/JIS B/日本写真規格/mm計算/同一印刷presetのExport引継ぎは未確認であり、SUITE独自候補としてGに残す。SUITEのmm計算と表示上のdpiはpixel densityで、プリンタのdot性能とは区別する。[S28](https://support.evoto.ai/crop-ipad/)
- iPadはRAWのsRGB既定と非RAWのAdobe RGB出力条件を説明する。任意RAWから任意ICCへ実変換できる保証や色票実測結果を推定しない。[S38](https://support.evoto.ai/welcome-to-evoto-ai-ipad/)

## 対象領域

| 領域 | 監査行 |
| --- | --- |
| RAW／基本現像 | EVO-001, EVO-002, EVO-003, EVO-004, EVO-005, EVO-006, EVO-007, EVO-008, EVO-009, EVO-010, EVO-011, EVO-012, EVO-013, EVO-014, EVO-015, EVO-016, EVO-017, EVO-018, EVO-019, EVO-020, EVO-021, EVO-022, EVO-023, EVO-024, EVO-025, EVO-026, EVO-027, EVO-028, EVO-029, EVO-030, EVO-031, EVO-032, EVO-033 |
| AI人物認識と人物別補正 | EVO-034, EVO-035, EVO-036, EVO-037 |
| 肌補正 | EVO-038, EVO-039, EVO-040, EVO-041, EVO-042, EVO-043, EVO-044, EVO-045, EVO-046, EVO-047, EVO-048, EVO-055, EVO-056, EVO-057 |
| 顔補正 | EVO-049, EVO-050, EVO-052, EVO-053, EVO-054, EVO-058, EVO-059 |
| 髪・メイク | EVO-051, EVO-060, EVO-112 |
| 体型 | EVO-061, EVO-062, EVO-063, EVO-064, EVO-065, EVO-066, EVO-067, EVO-068 |
| 衣服 | EVO-074 |
| 背景 | EVO-069, EVO-070, EVO-071 |
| 不要物除去 | EVO-072 |
| Creative／生成系 | EVO-073, EVO-104, EVO-110 |
| ブライダル | EVO-113, EVO-114 |
| パーソナルカラー相当 | EVO-103, EVO-115 |
| プリセット／Look／セッション単位適用／自動適用 | EVO-075, EVO-076, EVO-077, EVO-082, EVO-107, EVO-115 |
| バッチ／Culling | EVO-078, EVO-108, EVO-116 |
| テザー撮影（有線／無線／自動適用等） | EVO-079, EVO-080, EVO-081, EVO-082 |
| Project／Library／履歴 | EVO-092, EVO-093, EVO-097, EVO-109, EVO-117, EVO-118 |
| クラウド／同期 | EVO-091, EVO-096, EVO-098, EVO-099, EVO-100, EVO-101, EVO-102, EVO-106 |
| モバイル／iPad UX | EVO-090, EVO-094, EVO-095, EVO-111 |
| Export詳細 | EVO-083, EVO-084, EVO-085, EVO-086, EVO-087, EVO-088, EVO-089, EVO-105, EVO-119, EVO-120, EVO-121, EVO-122, EVO-123, EVO-124, EVO-125, EVO-126, EVO-127, EVO-128, EVO-129, EVO-130, EVO-131, EVO-132, EVO-133, EVO-134, EVO-135, EVO-136, EVO-137, EVO-138, EVO-139, EVO-140, EVO-141, EVO-142, EVO-143, EVO-144, EVO-145, EVO-146, EVO-147, EVO-148, EVO-149, EVO-150, EVO-151, EVO-152, EVO-153, EVO-154, EVO-155, EVO-156, EVO-157, EVO-158, EVO-159, EVO-160, EVO-161, EVO-162 |

## 操作連鎖 — 全体として未合格

SUITE状態: **BLOCK_NOT_END_TO_END_CONNECTED_NOT_VERIFIED**。Evoto側も公式記述の連鎖整理であり、実測完走のEvidenceではない。カメラ→写真→人物補正→Batch→Exportのいずれかの未接続を、backend PASSで埋めない。

| 段 | 操作 | 関連行・公式資料 | SUITE欠落 | 次の確認と合格条件 |
| --- | --- | --- | --- | --- |
| WF-01 | Camera有線接続 | EVO-079, EVO-080 / S20, S21 | C: CameraProvider境界だけ。実接続adapter・機種/ケーブルEvidenceなし; NOT_RUN | iPhone/iPad別に実カメラUSB接続、再接続・権限拒否を確認。該当段を前後段へ接続し、実RAW・iPhone/iPadそれぞれで欠落なし、非破壊/履歴/再開整合を実測。未仕様項目は採用判断が先 |
| WF-02 | Camera無線接続 | EVO-081 / S22, S23 | D: 未仕様化。Evoto差分として登録するのみ; NOT_RUN | 採用承認前に実装しない。Evotoとの比較対象機種/無線条件の観察が必要。該当段を前後段へ接続し、実RAW・iPhone/iPadそれぞれで欠落なし、非破壊/履歴/再開整合を実測。未仕様項目は採用判断が先 |
| WF-03 | 撮影 | EVO-079, EVO-080, EVO-082 / S20, S21 | C: シャッター/新規画像イベント受信なし; NOT_RUN | camera event→一意asset受付、連写・中断時の欠落検査。該当段を前後段へ接続し、実RAW・iPhone/iPadそれぞれで欠落なし、非破壊/履歴/再開整合を実測。未仕様項目は採用判断が先 |
| WF-04 | 自動Import・Original保存 | EVO-001, EVO-096, EVO-079, EVO-080 / S20, S21 | B/A限定: 手動file import候補とbackend保存だけ。tether自動inbox未接続; NOT_RUN | 元RAW SHA保存、重複/中断/容量不足で元ファイル不変。該当段を前後段へ接続し、実RAW・iPhone/iPadそれぞれで欠落なし、非破壊/履歴/再開整合を実測。未仕様項目は採用判断が先 |
| WF-05 | Preview/Proxy即表示 | EVO-100, EVO-102 / S21, S22, S30 | Swift候補NOT_RUN。progressive embedded→proxy完全導線未接続; NOT_RUN | 画面を止めずProxy表示、低メモリ/熱/端末ロックの実測。該当段を前後段へ接続し、実RAW・iPhone/iPadそれぞれで欠落なし、非破壊/履歴/再開整合を実測。未仕様項目は採用判断が先 |
| WF-06 | 前画像効果/プリセット自動適用 | EVO-075, EVO-077, EVO-082 / S21, S22 | C/E: SessionLook版bindingだけ。人物分析・render・autoqueue未実装; NOT_RUN | 将来写真に適用、過去写真無断変更なし、明示再適用/除外を確認。該当段を前後段へ接続し、実RAW・iPhone/iPadそれぞれで欠落なし、非破壊/履歴/再開整合を実測。未仕様項目は採用判断が先 |
| WF-07 | 即時確認・Before/After | EVO-093, EVO-094, EVO-095 / S16, S21 | B: UI/Proxy候補、iPhone/iPadともNOT_RUN; NOT_RUN | thumb操作・横縦・Pencil・応答/表示版整合を実測。該当段を前後段へ接続し、実RAW・iPhone/iPadそれぞれで欠落なし、非破壊/履歴/再開整合を実測。未仕様項目は採用判断が先 |
| WF-08 | 人物別編集 | EVO-034, EVO-035, EVO-036, EVO-067 / S04, S05 | C/E: 実解析/人物UI/顔肌bodyレンダラ未実装; NOT_RUN | 複数人物を個別選択し姿勢再解析、背景直線と本人性を検査。該当段を前後段へ接続し、実RAW・iPhone/iPadそれぞれで欠落なし、非破壊/履歴/再開整合を実測。未仕様項目は採用判断が先 |
| WF-09 | Batch適用 | EVO-036, EVO-078 / S16, S04 | C: 選択一括queue/画像処理未実装; NOT_RUN | 100/500/1000実RAWでrecipe欠落/原本不変/中断復帰。該当段を前後段へ接続し、実RAW・iPhone/iPadそれぞれで欠落なし、非破壊/履歴/再開整合を実測。未仕様項目は採用判断が先 |
| WF-10 | Export・納品 | EVO-083, EVO-084, EVO-085, EVO-119, EVO-120, EVO-132 / S01, S18 | B/C/G: 単枚固定入力候補、batch未実装、設定未完成; NOT_RUN | Original＋固定Recipe→別成果物、形式寸法/中断/原本不在拒否、iPhone/iPad別に実測。該当段を前後段へ接続し、実RAW・iPhone/iPadそれぞれで欠落なし、非破壊/履歴/再開整合を実測。未仕様項目は採用判断が先 |

各段NOT_RUNの共通理由: 製品未接続/未実装とMac・iPhone/iPad環境待ちを併記する。環境が来ても未実装の人物描画/テザー/Batchは自動的に解消しない。必要環境は実RAW、対象カメラ/対応ケーブル、Mac/Xcode、iPhone実機、iPad実機、本番backend。iPhoneとiPadを独立Gateとし、Mac試験は代替にしない。

## 全162項目 — 要件→実装→テスト→Evidence

コード略号は末尾のパス表へ対応する。空欄（—）は機能コード/Evidenceなしであり、型や仕様だけの完成を示さない。テスト名・実行範囲は[TEST_CATALOG](TEST_CATALOG.md)と[verification-results](verification-results.json)で確認する。NAT-001は生成JPEGによる基本経路のみで、実RAWや追加Crop要件の検証ではない。

| ID・機能 | A–G／SUITE副軸 | Evoto公式確認範囲・出典 | SUITE要件 | 実装先・成熟度 | テスト/Evidence | 差分・注意 |
| --- | --- | --- | --- | --- | --- | --- |
| EVO-001 RAW読込み・現像エンジン | B / B | DOCUMENTED / Desktop; iPad / RAW対応の記載 [S01](https://support.evoto.ai/how-to-use-import-export/) [S21](https://support.evoto.ai/wired-tethered-shooting-ipad/) | SPEC-005, SPEC-010, MOBILE-06 | pipe — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | — / NOT_RUN | CIRAWFilter候補。対応カメラ実RAW確認0件。全RAW対応を宣言しない。 |
| EVO-002 JPEG読込み・編集 | B / B | DOCUMENTED / Desktop / JPEG対応の記載 [S01](https://support.evoto.ai/how-to-use-import-export/) | MOBILE-06, SPEC-081 | pipe — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | NAT-001 / NOT_RUN | ImageIO JPEG経路＋4調整。Windows任意bytes試験はJPEG描画の検証ではない。 |
| EVO-003 未対応RAWのFinal拒否 | G / B | UNKNOWN / Desktop / 未確認: Evotoの未対応RAW Final拒否内部条件 [S01](https://support.evoto.ai/how-to-use-import-export/) | SPEC-082, CLOUD-11 | pipe — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | — / NOT_RUN | SUITEはCIRAWFilter不成立時にRAWのembedded JPEGでFinalを作らない。camera matrix未検証。 |
| EVO-004 露出 | B / B | DOCUMENTED / iPad; Evoto Mobile / Exposure [S02](https://support.evoto.ai/color-adjustment-ipad/) [S03](https://support.evoto.ai/color-adjustments-module/) | SPEC-010 | pipe — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | NAT-001 / NOT_RUN | CIExposureAdjust接続のみ。RAW作例/端末描画NOT_RUN。 |
| EVO-005 コントラスト | B / B | DOCUMENTED / iPad; Evoto Mobile / Contrast [S02](https://support.evoto.ai/color-adjustment-ipad/) [S03](https://support.evoto.ai/color-adjustments-module/) | SPEC-010 | pipe — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | — / NOT_RUN | CIColorControls接続のみ。 |
| EVO-006 彩度 | B / B | DOCUMENTED / iPad; Evoto Mobile / Saturation [S02](https://support.evoto.ai/color-adjustment-ipad/) [S03](https://support.evoto.ai/color-adjustments-module/) | SPEC-010 | pipe — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | — / NOT_RUN | CIColorControls接続のみ。 |
| EVO-007 画像回転 | B / B | DOCUMENTED / iPad / Rotate [S29](https://support.evoto.ai/rotate-ipad/) | SPEC-010 | pipe — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | — / NOT_RUN | Recipe rotationの変換コード。native実測なし。 |
| EVO-008 WB/色温度 | C / C | DOCUMENTED / iPad / WB / Temp [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-009 Tint | C / C | DOCUMENTED / iPad / Tint [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-010 ハイライト | C / C | DOCUMENTED / iPad / Highlight [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-011 シャドウ | C / C | DOCUMENTED / iPad / Shadow [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-012 白レベル | C / C | DOCUMENTED / iPad / White [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-013 黒レベル | C / C | DOCUMENTED / iPad / Black [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-014 自然な彩度 | C / C | DOCUMENTED / iPad / Vibrance [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-015 トーンカーブ | C / C | DOCUMENTED / iPad / Curves [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-016 HSL | C / C | DOCUMENTED / iPad / HSL [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-017 シャープ | C / C | DOCUMENTED / iPad / Sharpen [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-018 ノイズ除去 | C / C | DOCUMENTED / iPad / Noise Reduction [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-019 色ノイズ除去の独立制御 | D / D | DOCUMENTED / iPad / Color Noise Reduction [S02](https://support.evoto.ai/color-adjustment-ipad/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 包括的Color要件のみでは独立toolの確定仕様としない。採用判断は別途。 |
| EVO-020 レンズ歪み補正 | C / C | DOCUMENTED / iPad / Distortion [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-021 周辺減光補正 | C / C | DOCUMENTED / iPad / Lens Vignetting [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-010 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | enumに項目名があってもPhotoPipeline未対応。未対応Recipeを黙って落とさない。 |
| EVO-022 輝度ヒストグラム | D / D | DOCUMENTED / iPad / Histogram [S02](https://support.evoto.ai/color-adjustment-ipad/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 包括的Color要件のみでは独立toolの確定仕様としない。採用判断は別途。 |
| EVO-023 独立Brightness制御 | D / D | DOCUMENTED / iPad / Brightness [S02](https://support.evoto.ai/color-adjustment-ipad/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 包括的Color要件のみでは独立toolの確定仕様としない。採用判断は別途。 |
| EVO-024 Clarity | D / D | DOCUMENTED / iPad / Clarity [S02](https://support.evoto.ai/color-adjustment-ipad/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 包括的Color要件のみでは独立toolの確定仕様としない。採用判断は別途。 |
| EVO-025 Dehaze | D / D | DOCUMENTED / iPad / Dehaze [S02](https://support.evoto.ai/color-adjustment-ipad/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 包括的Color要件のみでは独立toolの確定仕様としない。採用判断は別途。 |
| EVO-026 フィルム粒子 | D / D | DOCUMENTED / iPad / Grain [S02](https://support.evoto.ai/color-adjustment-ipad/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 包括的Color要件のみでは独立toolの確定仕様としない。採用判断は別途。 |
| EVO-027 RAWレンズプロファイル自動照合 | D / D | DOCUMENTED / iPad; Evoto Mobile / RAW profile照合 [S02](https://support.evoto.ai/color-adjustment-ipad/) [S03](https://support.evoto.ai/color-adjustments-module/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | レンズ補正一般はSPEC-010。プロファイル供給/対応/自動優先順位は未仕様。 |
| EVO-028 クロップ | C / C | DOCUMENTED / iPad / Crop [S28](https://support.evoto.ai/crop-ipad/) | SPEC-010, SPEC-044 | recipe — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | crop enumのみ。画面/描画/印刷overlay未実装。 |
| EVO-029 LUTによるLook適用 | C / C | DOCUMENTED / Evoto Mobile / CUBE色情報の適用 [S03](https://support.evoto.ai/color-adjustments-module/) | SPEC-015 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 既存Look方向を維持。LUTレンダラなし。desktop同期済みpresetの互換とmobile直接取込を区別。 |
| EVO-030 外部.XMP/.CUBEの直接import互換 | D / D | DOCUMENTED / Evoto Mobile / Desktop同期経由。Mobile直接uploadではない [S03](https://support.evoto.ai/color-adjustments-module/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | SUITE外部形式互換は未仕様。Evoto Mobile直接取込対応とはしない。 |
| EVO-031 自動露出/自動WB/Auto Develop | C / C | DOCUMENTED / iPad; Evoto Mobile / AI露出 / RAW Auto WB [S02](https://support.evoto.ai/color-adjustment-ipad/) [S03](https://support.evoto.ai/color-adjustments-module/) | SPEC-011, SPEC-081 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITE AI分析・推定・適用未実装。 |
| EVO-032 参照写真からAI Color Match | D / D | DOCUMENTED / iPad; Evoto Mobile / reference color match [S02](https://support.evoto.ai/color-adjustment-ipad/) [S03](https://support.evoto.ai/color-adjustments-module/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | Session Lookはユーザー調整意図保存。任意参照写真からLook推定する別機能は未仕様。 |
| EVO-033 肌を保護するLook・局所カラー | C / C | DOCUMENTED / iPad / Person/Background masking [S02](https://support.evoto.ai/color-adjustment-ipad/) | SPEC-015, ADD-13 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITE色行列/HSL/保護maskレンダラ未実装。 |
| EVO-034 顔検出・landmark解析 | C / C | DOCUMENTED / iPad; Evoto Mobile / 顔認識 [S04](https://support.evoto.ai/portrait-retouching-ipad/) [S05](https://support.evoto.ai/ai-facial-recognition/) | ADD-10, ADD-17, SPEC-011 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SessionLookは解析結果を受ける型。Vision/CoreML実解析はない。 |
| EVO-035 写真内の顔別・人物別補正 | C / C | DOCUMENTED / iPad / 個別face編集 [S04](https://support.evoto.ai/portrait-retouching-ipad/) | SPEC-014, ADD-16 | session — C: 意図データ型あり（その型のテストもNOT_RUN）。顔別補正機能は未実装 | NAT-042 / NOT_IMPLEMENTED | personIDデータ境界のみ。実検出・顔UI・ピクセル補正なし。 |
| EVO-036 プロジェクト内同一人物へのバッチ追従 | C / C | DOCUMENTED / iPad / subjectに対するproject sync [S04](https://support.evoto.ai/portrait-retouching-ipad/) | SPEC-014, ADD-10, ADD-15 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | NAT-043 / NOT_IMPLEMENTED | Evoto同一人物Sync記載とage/gender groupSyncを区別。SUITE PersonID照合器・写真別再解析未実装。 |
| EVO-037 年齢/性別推定タグ | D / D | DOCUMENTED / iPad; Evoto Mobile / age/gender tags [S04](https://support.evoto.ai/portrait-retouching-ipad/) [S05](https://support.evoto.ai/ai-facial-recognition/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | SUITE PersonIDやPersonal Colorから属性推定を追加しない。必要性・プライバシーは採用前判断。 |
| EVO-038 肌荒れ/ニキビ | C / C | DOCUMENTED / Evoto Mobile / blemish [S06](https://support.evoto.ai/portrait-retouching-module-blemish-removal/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-039 シミ/そばかす | C / C | DOCUMENTED / Evoto Mobile / freckles [S06](https://support.evoto.ai/portrait-retouching-module-blemish-removal/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-040 テカリ | C / C | DOCUMENTED / Evoto Mobile / face shine [S06](https://support.evoto.ai/portrait-retouching-module-blemish-removal/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-041 目の下/クマ | C / C | DOCUMENTED / Evoto Mobile / dark circles [S06](https://support.evoto.ai/portrait-retouching-module-blemish-removal/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-042 ほうれい線/顔のシワ | C / C | DOCUMENTED / iPad / facial wrinkles [S27](https://support.evoto.ai/blemish-removal-ipad/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-043 妊娠線 | C / C | DOCUMENTED / iPad / stretch marks [S27](https://support.evoto.ai/blemish-removal-ipad/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-044 肌スムージング | C / C | DOCUMENTED / Evoto Mobile / smoothing [S07](https://support.evoto.ai/portrait-retouching-module-skin-retouching/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-045 肌テクスチャ保持 | C / C | DOCUMENTED / Evoto Mobile / texture [S07](https://support.evoto.ai/portrait-retouching-module-skin-retouching/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-046 顔色ムラ | C / C | DOCUMENTED / iPad / face complexion [S08](https://support.evoto.ai/skin-retouching-ipad/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-047 体の肌色ムラ | C / C | DOCUMENTED / iPad / body complexion [S08](https://support.evoto.ai/skin-retouching-ipad/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-048 肌色・赤み | C / C | DOCUMENTED / iPad / skin tone / redness [S08](https://support.evoto.ai/skin-retouching-ipad/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-049 目の明度 | C / C | DOCUMENTED / Evoto Mobile / brightness [S11](https://support.evoto.ai/portrait-retouching-eyes/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-050 歯の白さ | C / C | DOCUMENTED / Evoto Mobile / whitening [S12](https://support.evoto.ai/portrait-retouching-teeth/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-051 髪の乱れ除去 | C / C | DOCUMENTED / Evoto Mobile / stray hair [S13](https://support.evoto.ai/portrait-retouching-hair/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-052 顔幅 | C / C | DOCUMENTED / iPad / face width [S10](https://support.evoto.ai/facial-reshape-ipad/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-053 顎/輪郭 | C / C | DOCUMENTED / iPad / jaw [S10](https://support.evoto.ai/facial-reshape-ipad/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-054 目の大きさ | C / C | DOCUMENTED / iPad / eye size [S10](https://support.evoto.ai/facial-reshape-ipad/) | SPEC-012, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 人物intent境界のみ。実補正・強度UI・品質試験は未実装。 |
| EVO-055 傷/傷跡/局所赤みの写真補正 | G / C | UNKNOWN / Evoto Mobile; iPad / 未確認: 同じ詳細機能。関連記載: blemish / redness（傷跡専用の同等性は未確認） [S06](https://support.evoto.ai/portrait-retouching-module-blemish-removal/) [S08](https://support.evoto.ai/skin-retouching-ipad/) | ADD-04, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITEは明示仕様。Evoto汎用blemishと傷跡専用UIを同一と断定しない。 |
| EVO-056 Dodge & Burn専用操作 | D / D | DOCUMENTED / Evoto Mobile; iPad / Dodge & Burn [S07](https://support.evoto.ai/portrait-retouching-module-skin-retouching/) [S08](https://support.evoto.ai/skin-retouching-ipad/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 肌補正一般は既存。特定方式/専用UIは未仕様。iPad Evenはnon-Asian限定注記、日本対応不明。 |
| EVO-057 周波数分離専用操作 | D / D | DOCUMENTED / Evoto Mobile; iPad / Frequency Separation [S07](https://support.evoto.ai/portrait-retouching-module-skin-retouching/) [S08](https://support.evoto.ai/skin-retouching-ipad/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | Skin Texture intentは専用周波数分離toolの仕様ではない。 |
| EVO-058 眼鏡反射除去 | D / D | DOCUMENTED / Evoto Mobile / glare除去（色付眼鏡は非対応） [S11](https://support.evoto.ai/portrait-retouching-eyes/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 既存Eye Adjustment一般から詳細実装を創作しない。 |
| EVO-059 歯列整列/歯の生成 | D / D | DOCUMENTED / Evoto Mobile / alignment / generated teeth [S12](https://support.evoto.ai/portrait-retouching-teeth/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 歯の白さと分離。本人性保護を無断で緩和しない。 |
| EVO-060 髪色変更/白髪処理 | D / D | DOCUMENTED / Evoto Mobile / hair color / white hair [S13](https://support.evoto.ai/portrait-retouching-hair/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 髪の乱れ補正とは別の未確定詳細。 |
| EVO-061 ウエスト | C / C | DOCUMENTED / Evoto Mobile / waist [S09](https://support.evoto.ai/portrait-retouching-full-body-reshape/) | SPEC-013, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | Pose/Segmentation/Mesh描画は未実装。集合写真の重なり処理を保証しない。 |
| EVO-062 腹部/全身ライン | C / C | DOCUMENTED / Evoto Mobile / body / silhouette [S09](https://support.evoto.ai/portrait-retouching-full-body-reshape/) | SPEC-013, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | Pose/Segmentation/Mesh描画は未実装。集合写真の重なり処理を保証しない。 |
| EVO-063 バスト | C / C | DOCUMENTED / Evoto Mobile / breasts [S09](https://support.evoto.ai/portrait-retouching-full-body-reshape/) | SPEC-013, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | Pose/Segmentation/Mesh描画は未実装。集合写真の重なり処理を保証しない。 |
| EVO-064 腕 | C / C | DOCUMENTED / Evoto Mobile / arms [S09](https://support.evoto.ai/portrait-retouching-full-body-reshape/) | SPEC-013, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | Pose/Segmentation/Mesh描画は未実装。集合写真の重なり処理を保証しない。 |
| EVO-065 脚の太さ/長さ | C / C | DOCUMENTED / Evoto Mobile / leg [S09](https://support.evoto.ai/portrait-retouching-full-body-reshape/) | SPEC-013, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | Pose/Segmentation/Mesh描画は未実装。集合写真の重なり処理を保証しない。 |
| EVO-066 身長印象 | C / C | DOCUMENTED / Evoto Mobile / height [S09](https://support.evoto.ai/portrait-retouching-full-body-reshape/) | SPEC-013, ADD-08 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | Pose/Segmentation/Mesh描画は未実装。集合写真の重なり処理を保証しない。 |
| EVO-067 体型補正時の背景保護 | E / E | DOCUMENTED / Desktop8.0 / App3.3 / Video1.6 / AssetHub; iPad / Desktop: Liquify背景修復 / iPad: Freeze Mask [S25](https://blog.evoto.ai/evoto-product-launch-2026/) [S26](https://support.evoto.ai/tool-bar-ipad/) | SPEC-013, SPEC-076, ADD-11 | session — 意図/解析前提チェックのコードのみNOT_RUN。変形と背景保護の実処理は未実装 | NAT-042 / NOT_RUN | SUITEはperson segmentation＋背景保護必須。同等の目的だが工程/保証条件が異なる。仕上がり同等は未実証。 |
| EVO-068 手動Liquify brush | D / D | DOCUMENTED / iPad / warp / freeze等 [S26](https://support.evoto.ai/tool-bar-ipad/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | Body自動補正仕様と手動ブラシツールの採用を混同しない。 |
| EVO-069 背景置換 | C / C | DOCUMENTED / iPad; Desktop8.0 / App3.3 / Video1.6 / AssetHub / iPad背景置換 / App custom backdrop [S14](https://support.evoto.ai/backdrop-changer-ipad/) [S25](https://blog.evoto.ai/evoto-product-launch-2026/) | SPEC-018, SPEC-019, MOBILE-06 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITE背景renderer/合成/生成provider未接続。 |
| EVO-070 空交換・天候整合 | C / C | DOCUMENTED / iPad; Evoto Mobile iOS/Android / sky replacement [S15](https://support.evoto.ai/sky-replacement-ipad/) [S23](https://support.evoto.ai/quick-tour-of-evoto-mobile/) | SPEC-023, MOBILE-06 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 空交換対応は確認。SUITEの人物/地面/影/色温度までの天候整合全体と同一保証とはしない。 |
| EVO-071 背景ぼかし/深度bokeh | D / D | DOCUMENTED / Evoto Mobile; Evoto Mobile iOS/Android / lens/background blur [S03](https://support.evoto.ai/color-adjustments-module/) [S23](https://support.evoto.ai/quick-tour-of-evoto-mobile/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 背景処理一般からこの独立機能を確定追加しない。 |
| EVO-072 手動不要物除去/Healing | C / C | DOCUMENTED / Evoto Mobile iOS/Android; iPad / Remove Brush / Healing [S23](https://support.evoto.ai/quick-tour-of-evoto-mobile/) [S26](https://support.evoto.ai/tool-bar-ipad/) | SPEC-022 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITE除去描画は未実装。 |
| EVO-073 生成拡張/Outpainting | D / D | DOCUMENTED / Desktop8.0 / App3.3 / Video1.6 / AssetHub / Desktop Generative Expand [S25](https://blog.evoto.ai/evoto-product-launch-2026/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 生成モジュール一般から拡張canvas仕様を増やさない。App/iPad個別提供は本監査では未確認。 |
| EVO-074 衣服シワ・糸くず・汗染み除去 | D / D | DOCUMENTED / Evoto Mobile; Desktop / Mobile / Desktop: 衣服cleanup [S34](https://support.evoto.ai/clothing-accessories-adjustments-module/) [S25](https://blog.evoto.ai/evoto-product-launch-2026/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | Fashion素材感保持はこれら独立自動toolの確定仕様ではない。未採用詳細としてgap記録。 |
| EVO-075 プリセット保存・適用 | C / C | DOCUMENTED / Evoto Mobile / save / apply [S17](https://support.evoto.ai/presets/) | SPEC-034, SPEC-081 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | Recipe型はPresetライブラリ/適用器を意味しない。 |
| EVO-076 プリセット共有 | C / C | DOCUMENTED / Evoto Mobile / token共有 [S17](https://support.evoto.ai/presets/) | SPEC-035, SPEC-038 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITEは無料Community仕様、共有サービス未実装。 |
| EVO-077 プリセット全体の効果強度 | C / C | DOCUMENTED / Evoto Mobile / color / portrait amount [S17](https://support.evoto.ai/presets/) | ADD-09, ADD-20, SPEC-034 | session — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | RetouchStrength型のみ。描画への強度反映は未実装。 |
| EVO-078 選択写真への一般バッチ適用 | C / C | DOCUMENTED / Evoto Mobile / 複数画像Sync [S16](https://support.evoto.ai/preview-page/) | SPEC-014, SPEC-081, MOBILE-05 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | UI/queue/適用器がない。共有基盤テストをバッチ画像完了に数えない。 |
| EVO-079 iPhone有線テザー | C / C | DOCUMENTED / iPhone / Evoto Mobile / iPhone有線接続 [S20](https://support.evoto.ai/wired-tethered-shooting-in-evoto-mobile/) | SPEC-008, SPEC-065, ADD-22 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITE CameraProvider境界のみ、実接続なし。iPhoneを簡易版としない。 |
| EVO-080 iPad有線テザー | C / C | DOCUMENTED / iPad / iPad USB tether [S21](https://support.evoto.ai/wired-tethered-shooting-ipad/) | SPEC-008, SPEC-066, ADD-22 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITE実接続/機種・cable matrixなし。 |
| EVO-081 無線テザー | D / D | DOCUMENTED / iPad; Evoto Mobile iOS/Android / wireless tether [S22](https://support.evoto.ai/wireless-tethered-shooting-ipad/) [S23](https://support.evoto.ai/quick-tour-of-evoto-mobile/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | SUITE確定フローはUSB-C。無線protocol/対応機種は未仕様、今回追加しない。 |
| EVO-082 撮影時の自動Look適用 | E / E | DOCUMENTED / iPad / previous設定 / preset自動適用 [S21](https://support.evoto.ai/wired-tethered-shooting-ipad/) | ADD-01, ADD-14, ADD-17, ADD-19, ADD-20 | session — データ境界/適用計画コードNOT_RUN。撮影パイプライン未接続 | NAT-039, NAT-040, NAT-044 / NOT_RUN | Session Lookは固定版＋未来画像binding＋過去再適用は明示。実キャプチャ連携・顔再解析・自動描画は未実装。 |
| EVO-083 JPEG Final Export | B / B | DOCUMENTED / Desktop; Evoto Mobile; iPad / JPEG出力 [S01](https://support.evoto.ai/how-to-use-import-export/) [S18](https://support.evoto.ai/export/) [S19](https://support.evoto.ai/how-to-use-settings-ipad/) | SPEC-040, CLOUD-11 | pipe, life — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | NAT-001, NAT-032 / NOT_RUN | 固定Recipe＋Original→別staging→検証→move。native未実行。 |
| EVO-084 TIFF Final Export | B / B | DOCUMENTED / Desktop; Evoto Mobile; iPad / TIFF出力 [S01](https://support.evoto.ai/how-to-use-import-export/) [S18](https://support.evoto.ai/export/) [S19](https://support.evoto.ai/how-to-use-settings-ipad/) | SPEC-040, CLOUD-11 | pipe, life — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | NAT-001 / NOT_RUN | RGBA16書込みコード。色管理/画素品質含めNOT_RUN。 |
| EVO-085 複数枚Export queue | C / C | DOCUMENTED / Desktop; Evoto Mobile / batch export [S01](https://support.evoto.ai/how-to-use-import-export/) [S18](https://support.evoto.ai/export/) | SPEC-040, SPEC-074 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 現UIは1枚Export。QA runner serialを製品batch機能と数えない。 |
| EVO-086 JPEG Export品質設定 | C / C | DOCUMENTED / Desktop; Evoto Mobile / Desktop / Mobile: JPEG品質 [S01](https://support.evoto.ai/how-to-use-import-export/) [S18](https://support.evoto.ai/export/) | SPEC-040 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | 現SUITEは固定出力候補。品質slider/検証未実装。サイズ/PPIは別行でplatform分離。 |
| EVO-087 Export色profile選択 | C / C | DOCUMENTED / Desktop; Evoto Mobile; iPad / sRGB / profile選択 [S01](https://support.evoto.ai/how-to-use-import-export/) [S18](https://support.evoto.ai/export/) [S19](https://support.evoto.ai/how-to-use-settings-ipad/) | SPEC-040 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITE現在sRGB固定候補。色profile選択機能未実装。 |
| EVO-088 Export命名規則（Desktop比較） | C / C | DOCUMENTED / Desktop / Desktop: filename rules [S01](https://support.evoto.ai/how-to-use-import-export/) | SPEC-040 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITEはUUID出力。利用者の命名規則UI未実装。Mobileでの命名規則は別G行。 |
| EVO-089 透かしExport | D / D | DOCUMENTED / Desktop / Watermark [S01](https://support.evoto.ai/how-to-use-import-export/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | SUITE独立要件なし、未採用。 |
| EVO-090 iOS Share Sheet / AirDrop経路 | B / B | DOCUMENTED / Evoto Mobile / system share sheet [S18](https://support.evoto.ai/export/) | SPEC-024 | app — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | — / NOT_RUN | UIActivityViewController接続。送付/受領の実機確認なし。 |
| EVO-091 Online Gallery/QR/クライアント選別 | C / C | DOCUMENTED / Desktop8.0 / App3.3 / Video1.6 / AssetHub; iPhone / iPad / App Online Gallery [S25](https://blog.evoto.ai/evoto-product-launch-2026/) [S24](https://apps.apple.com/us/app/evoto-photo-editor-retouch/id6596737043) | SPEC-024, SPEC-025 | — — 仕様済み未実装（型・意図データの存在は機能完成ではない） | — / NOT_IMPLEMENTED | SUITE要件維持、Web/UIも今回は着手しない。 |
| EVO-092 Undo/Redo・ローカル履歴UI | B / B | DOCUMENTED / Evoto Mobile; iPad / Undo/Redo/history [S16](https://support.evoto.ai/preview-page/) [S26](https://support.evoto.ai/tool-bar-ipad/) | SPEC-006, MOBILE-12 | recipe, model — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | NAT-019, NAT-022 / NOT_RUN | EditHistoryとUIはコードあり、native永続化/画面復元NOT_RUN。 |
| EVO-093 Before/After比較 | B / B | DOCUMENTED / Evoto Mobile / 比較toggle [S16](https://support.evoto.ai/preview-page/) | MOBILE-10, MOBILE-15 | model — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | — / NOT_RUN | SUITEはProxy編集前/編集後。高解像原本比較成功とはしない。 |
| EVO-094 iPhone専用編集UI | B / B | DOCUMENTED / iPhone / Evoto Mobile; iPhone / iPad / iPhone提供 [S20](https://support.evoto.ai/wired-tethered-shooting-in-evoto-mobile/) [S24](https://apps.apple.com/us/app/evoto-photo-editor-retouch/id6596737043) | SPEC-065, MOBILE-09 | iphone, model — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | — / NOT_RUN | bottom controlsは接続、touch/rotation/accessibility/端末ロック未実証。 |
| EVO-095 iPad専用編集UI | B / B | DOCUMENTED / iPad / iPad編集・Pencil対応 [S02](https://support.evoto.ai/color-adjustment-ipad/) [S26](https://support.evoto.ai/tool-bar-ipad/) | SPEC-066, MOBILE-10 | ipad, model — コードあり・Mac/iPhone/iPad未検証。完成/合格ではない | — / NOT_RUN | 専用inspector候補。Pencil阻害/portrait/landscape実測未実施。 |
| EVO-096 RAW原本immutable保存境界（backend限定） | G / A | UNKNOWN / Desktop / 未確認: Evoto backend immutable保存契約 [S01](https://support.evoto.ai/how-to-use-import-export/) | SPEC-006, CLOUD-02 | store — 実装済み・記載したWindows基盤範囲のみ検証済み | WIN-011 / PASS_SCOPED_WINDOWS | local objectの上書き拒否/checksumを実ファイルで検証。実RAWデコードやnative安全性はこのAの対象外。 |
| EVO-097 Recipe保存/再読込/CAS（backend限定） | A / A | DOCUMENTED / Evoto Mobile / 編集履歴・Sync記載。内部CASは未確認 [S16](https://support.evoto.ai/preview-page/) | SPEC-006, SPEC-039, CLOUD-06 | repo, policy — 実装済み・記載したWindows基盤範囲のみ検証済み | WIN-001, WIN-012, WIN-015 / PASS_SCOPED_WINDOWS | JSON検証＋SQLite CAS。Swift roundtrip/他端末同期はこのAの対象外。 |
| EVO-098 Multipart破損partのみ新key再取得（backend限定） | G / A | UNKNOWN / Desktop / 未確認: Evoto Multipart復旧契約 [S01](https://support.evoto.ai/how-to-use-import-export/) | SPEC-029, CLOUD-18 | multi — 実装済み・記載したWindows基盤範囲のみ検証済み | WIN-003, WIN-004 / PASS_SCOPED_WINDOWS | 旧part保持・正常part不変・checksum一致。Evotoより優れているとの性能比較ではない。 |
| EVO-099 Cloud Safe判定/破損失効（backend限定） | G / A | UNKNOWN / iPad / 未確認: Evotoの同名7条件検証契約 [S19](https://support.evoto.ai/how-to-use-settings-ipad/) | SPEC-078, CLOUD-09 | repo, policy — 実装済み・記載したWindows基盤範囲のみ検証済み | WIN-010, WIN-015 / PASS_SCOPED_WINDOWS | 7条件＋取得時破損で失効。local開発adapterだけ、本番cloudの安全保証ではない。 |
| EVO-100 通常Proxy・FinalだけOriginal取得 | E / E | DOCUMENTED / Windows / macOS（Cloud Space） / Desktop: Smart Preview / Export時Original [S30](https://support.evoto.ai/cloud-space/) [S36](https://support.evoto.ai/evoto-ai-version-6-2-updates/) | SPEC-007, CLOUD-01, CLOUD-13 | policy, pipe — Windowsの選択/待機判定PASS。native decode未検証、本番sync未接続 | WIN-007, WIN-008, NAT-027, NAT-029 / PARTIAL_WINDOWS_PASS_NATIVE_NOT_RUN | SUITEと共通目的。EvotoにProxyがないとはしない。Evoto fixed4K説明に対しSUITE端末/zoom/通信の適応品質。cloud同期のiPad未提供が公式記載。 |
| EVO-101 Recipe/未同期RAWをCacheから保護 | E / E | DOCUMENTED / iPad / iPad cache消去に手動記録喪失の注意 [S19](https://support.evoto.ai/how-to-use-settings-ipad/) | SPEC-054, CLOUD-14 | policy, life — Windows保護判定PASS。native/物理eviction未検証・未実装 | WIN-009, NAT-030 / PARTIAL_WINDOWS_PASS_NATIVE_NOT_RUN | SUITEはderived cacheとRecipe/原本を分離して保護。物理LRU/削除は未実装、判定だけPASS。 |
| EVO-102 Proxy複数品質/通信P0–P3 | G / E | UNKNOWN / Windows / macOS / 未確認: 同じ複数品質/P0–P3。Smart Preview一般は記載 [S30](https://support.evoto.ai/cloud-space/) | CLOUD-04, CLOUD-16, CLOUD-17 | cloud — Swift純粋判定コードNOT_RUN。自動転送は未接続 | NAT-014, NAT-015, NAT-017, NAT-018 / NOT_RUN | SUITEはthumbnail/preview/high preview＋明示RAW優先。通信設定UI/本番queue未実装。 |
| EVO-103 5撮影モード＋任意Personal Color | G / E | UNKNOWN / Evoto Mobile; iPad / 未確認: 同じ5mode＋肌の四季方向契約 [S32](https://support.evoto.ai/personalized-ai-look/) [S08](https://support.evoto.ai/skin-retouching-ipad/) | ADD-02, ADD-12, ADD-13, ADD-14 | session — intent型/validationのみNOT_RUN。解析・色適用・UI未実装 | NAT-038, NAT-045 / NOT_RUN | Evoto Personalized AI Lookは撮影者色スタイルの学習であり、春夏秋冬の肌方向と同一視しない。SUITEの任意四季Color Direction/形状非変更は維持。 |
| EVO-104 Canonical生成背景＋Identity Gate | G / E | UNKNOWN / iPad; Desktop8.0 / App3.3 / Video1.6 / AssetHub / 未確認: 同じCanonical保存＋Identity不合格Final拒否契約 [S14](https://support.evoto.ai/backdrop-changer-ipad/) [S25](https://blog.evoto.ai/evoto-product-launch-2026/) | SPEC-020, SPEC-021, SPEC-075 | life — 保護境界コードNOT_RUN。生成・本人性検証は未実装 | NAT-031 / NOT_RUN | Preview意図をCanonicalで固定し本人性不合格Finalを禁止する既存仕様。renderer/Identity比較は未実装。 |
| EVO-105 日本印刷サイズ・300ppi確認 | G / E | UNKNOWN / Desktop / 未確認: 同じ詳細機能。関連記載: 一般pixel/PPI出力 [S01](https://support.evoto.ai/how-to-use-import-export/) | SPEC-042, SPEC-043, SPEC-045, SPEC-047, CROP-02, CROP-07 | — — 仕様のみ。単位計算/overlay/出力すべて未実装 | — / NOT_IMPLEMENTED | 従来300ppi要件と今回300dpi表記はpixel densityとして整合させる。プリンタdot解像度とは分離。追加CROP仕様の実寸・不足警告・native画素処理は未検証。 |
| EVO-106 Cloud上原本＋RecipeからiPhone/iPad相互Final | E / E | DOCUMENTED / Windows / macOS; iPad not yet available（文書）; iPhone未確認 / Desktop cloud同期。iPad未提供を明記 [S30](https://support.evoto.ai/cloud-space/) | SPEC-028, CLOUD-07, CLOUD-12 | cloud — API注入境界コードありNOT_RUN。本番cloud Proxy/復元未接続 | — / NOT_IMPLEMENTED | SUITEはiPhone/iPad相互編集・Finalを既存仕様として要求。Evoto Mobile Galleryはこの原本Project同期とは別。SUITE側も本番未接続。 |
| EVO-107 無料コミュニティPreset共有 | E / E | DOCUMENTED / Evoto Mobile; Desktop8.0 / App3.3 / Video1.6 / AssetHub / token共有 / 有料AssetHub [S17](https://support.evoto.ai/presets/) [S25](https://blog.evoto.ai/evoto-product-launch-2026/) | SPEC-035, SPEC-084 | — — 仕様のみ。community未実装 | — / NOT_IMPLEMENTED | SUITE無料Community方針を維持。Evoto共有にもtokenがあり、すべて有料としない。 |
| EVO-108 テキスト検索/Storyline culling | D / D | DOCUMENTED / Desktop8.0 / App3.3 / Video1.6 / AssetHub / Desktop8.0: text search / story culling [S25](https://blog.evoto.ai/evoto-product-launch-2026/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | 一般SELECTからAI選別や検索機能を追加しない。mobile同等提供は本資料で未確認。 |
| EVO-109 Lightroom Catalog往復 | D / D | DOCUMENTED / Desktop; Desktop8.0 / App3.3 / Video1.6 / AssetHub / Desktop .lrcat/workflow [S01](https://support.evoto.ai/how-to-use-import-export/) [S25](https://blog.evoto.ai/evoto-product-launch-2026/) | 未仕様化・未承認 | — — 個別仕様未確定・未実装。今回追加しない | — / NOT_SPECIFIED | SUITE互換形式・連携は未仕様。iPhone/iPad対象へ転用しない。 |
| EVO-110 動画retouch/NLEプラグイン | F / F | DOCUMENTED / Desktop8.0 / App3.3 / Video1.6 / AssetHub / 別製品Video1.6/NLE [S25](https://blog.evoto.ai/evoto-product-launch-2026/) | 未仕様化・未承認 | — — 不要候補のみ・未承認。既存仕様を削除しない | — / NOT_APPROVED | 写真モバイル初期範囲の対象外候補。不要の正式決定ではなく、既存写真要件は維持。 |
| EVO-111 課金促進のpreviewスクショ保護 | F / F | DOCUMENTED / Evoto Mobile / 一部previewに保護 [S16](https://support.evoto.ai/preview-page/) | 未仕様化・未承認 | — — 不要候補のみ・未承認。既存仕様を削除しない | — / NOT_APPROVED | 操作/QA制約を新設しない候補。不要承認は未取得。既存security要件の削除ではない。 |
| EVO-112 メイク（眉/目元/リップ等） | D / D | DOCUMENTED / Evoto Mobile / Makeup [S33](https://support.evoto.ai/portrait-retouching-makeup/) | 未仕様化・未承認 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_SPECIFIED | SUITEの顔/肌一般と化粧適用の個別要件を区別。今回は採用しない。 |
| EVO-113 Bridal / Wedding撮影workflow | E / E | DOCUMENTED / iPad; Desktop8.0 / App3.3 / Video1.6 / AssetHub; Desktop / Wedding向けlook/workflow / 新郎新婦選別例 [S02](https://support.evoto.ai/color-adjustment-ipad/) [S25](https://blog.evoto.ai/evoto-product-launch-2026/) [S36](https://support.evoto.ai/evoto-ai-version-6-2-updates/) | ADD-03, SPEC-019 | session — モードintentのみNOT_RUN。階調保護・自動処理未実装 | NAT-038 / NOT_IMPLEMENTED | SUITE Wedding Modeは自然さ/白ドレス階調保護/照明対応。Evoto同名の固定modeとは断定しない。 |
| EVO-114 人物群を新郎/新婦/ゲスト別に検索 | D / D | DOCUMENTED / Desktop / Desktop Face Galleryのwedding例 [S36](https://support.evoto.ai/evoto-ai-version-6-2-updates/) | 未仕様化・未承認 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_SPECIFIED | SUITE人物単位補正は既存だが、検索/自動role分類は未仕様。 |
| EVO-115 学習型Personalized AI Look | D / D | DOCUMENTED / Desktop / DesktopのLook training [S32](https://support.evoto.ai/personalized-ai-look/) | 未仕様化・未承認 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_SPECIFIED | SUITE Session Lookは明示意図保存。学習dataset・training jobの追加はしない。 |
| EVO-116 AI Cullingのblur/blink/duplicate判定 | D / D | DOCUMENTED / Evoto Instant（別製品） / Instant: 技術品質による自動選別 [S37](https://support.evoto.ai/ai-culling-in-evoto-instant/) | 未仕様化・未承認 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_SPECIFIED | 別製品Instantの確認。Mobile同機能存在は未確認。SUITE一般Selectに自動culling仕様を足さない。 |
| EVO-117 Project/Library整理とフィルタ | C / C | DOCUMENTED / Desktop; Evoto Mobile / Project/Library管理 [S31](https://support.evoto.ai/library/) [S16](https://support.evoto.ai/preview-page/) | SPEC-004, SPEC-064, MOBILE-05 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_IMPLEMENTED | SUITEasset一覧骨組みだけでproject管理・star/filter完成としない。 |
| EVO-118 Virtual Copy（別編集版の並列比較） | D / D | DOCUMENTED / Desktop / Desktop Virtual Copy [S31](https://support.evoto.ai/library/) | 未仕様化・未承認 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_SPECIFIED | 履歴/Redoとは別の並列版管理。SUITEに無断追加しない。 |
| EVO-119 Exportピクセル寸法（Desktop） | C / C | DOCUMENTED / Desktop / width / height [S01](https://support.evoto.ai/how-to-use-import-export/) | SPEC-040 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_IMPLEMENTED | Mobile提供をこの資料から推定しない。SUITE寸法設定は未実装。 |
| EVO-120 Exportピクセル寸法（Mobile） | G / C | UNKNOWN / Evoto Mobile / 未確認: Mobileの寸法指定UI [S18](https://support.evoto.ai/export/) | SPEC-040 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_IMPLEMENTED | Mobile Export公式記事で寸法指定の確認できず。非対応とは断定しない。 |
| EVO-121 Exportリサイズ（Desktop） | C / C | DOCUMENTED / Desktop / percentage / long-short edge [S01](https://support.evoto.ai/how-to-use-import-export/) | SPEC-040 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_IMPLEMENTED | SUITE元画像→指定pixelへのFinal resize未実装。 |
| EVO-122 Exportリサイズ（Mobile） | G / C | UNKNOWN / Evoto Mobile / 未確認: Mobileのresize設定 [S18](https://support.evoto.ai/export/) | SPEC-040 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_IMPLEMENTED | Desktop記述をMobileに転用しない。SUITE仕様は保持。 |
| EVO-123 Export PPI/PPC（Desktop、通称dpi指定） | C / C | DOCUMENTED / Desktop / PPI / PPC [S01](https://support.evoto.ai/how-to-use-import-export/) | SPEC-040, SPEC-045 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_IMPLEMENTED | ppiは画像pixel密度、printer dpiとは区別。SUITE計算・メタデータ設定未実装。 |
| EVO-124 Export PPI/dpi指定（Mobile） | G / C | UNKNOWN / Evoto Mobile; iPad / 未確認: MobileのPPI/dpi入力 [S18](https://support.evoto.ai/export/) [S19](https://support.evoto.ai/how-to-use-settings-ipad/) | SPEC-040, SPEC-045 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_IMPLEMENTED | DesktopのPPI設定と分離。未確認は非対応判定ではない。 |
| EVO-125 Export命名規則（Mobile） | G / C | UNKNOWN / Evoto Mobile / 未確認: Mobileのcustom naming [S18](https://support.evoto.ai/export/) | SPEC-040 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_IMPLEMENTED | Files/Photosへの出力先記載と命名規則を分離。 |
| EVO-126 Export出力先Files/Photos・Album | C / C | DOCUMENTED / Evoto Mobile; iPad / Mobile/iPad: Files / Photos [S18](https://support.evoto.ai/export/) [S19](https://support.evoto.ai/how-to-use-settings-ipad/) | SPEC-040 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_IMPLEMENTED | SUITEShare Sheet候補と直接Album保存設定の完成を区別。Album選択のEvoto詳細も未確認。 |
| EVO-127 Export撮影日時/出力日時metadata | C / C | DOCUMENTED / Evoto Mobile / Mobile: timestamp選択 [S18](https://support.evoto.ai/export/) | CROP-09 | — — 追加正式仕様CROP-09あり。実画素処理/設定UIは統合中・未検証 | — / NOT_IMPLEMENTED | SUITE metadata保存一般はあるがExportの保持/削除ポリシーは未確定。 |
| EVO-128 Export EXIF/IPTC/XMPポリシー | C / C | DOCUMENTED / Desktop / Desktop metadata / caption元情報 [S31](https://support.evoto.ai/library/) [S35](https://support.evoto.ai/how-to-use-setting/) | CROP-09 | — — 追加正式仕様CROP-09あり。実画素処理/設定UIは統合中・未検証 | — / NOT_IMPLEMENTED | 部分metadata説明を全tag無損失としない。Mobile対応範囲は未確認。SUITEPrivacyと整合する採用判断が必要。 |
| EVO-129 Export PNG/透明背景 | C / C | DOCUMENTED / Desktop / Desktop: PNG [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-09 | — — 追加正式仕様CROP-09あり。実画素処理/設定UIは統合中・未検証 | — / NOT_IMPLEMENTED | ユーザー追加指示でPNGが正式仕様化。Mobile PNGは未確認。 |
| EVO-130 A0/A1実寸クロップと300ppi検査 | G / E | UNKNOWN / Desktop / 未確認: 同じ詳細機能。関連記載: 一般pixel/PPI指定（A0/A1専用workflow未確認） [S01](https://support.evoto.ai/how-to-use-import-export/) | SPEC-042, SPEC-044, SPEC-045, CROP-02, CROP-07 | — — 仕様のみ・計算/overlay/出力NOT_IMPLEMENTED | — / NOT_IMPLEMENTED | 従来300ppi要件と今回300dpi表記はpixel densityとして整合させる。プリンタdot解像度とは分離。追加CROP仕様の実寸・不足警告・native画素処理は未検証。 |
| EVO-131 SNS用比率・出力preset | G / C | UNKNOWN / iPad / 未確認: 同じ詳細機能。関連記載: Crop ratio選択（同じSNS preset契約は未確認） [S28](https://support.evoto.ai/crop-ipad/) | SPEC-041 | — — 未実装。仕様を追加せず差分のみ記録 | — / NOT_IMPLEMENTED | SUITE SNS設定はRemote Config方針。現行SNS寸法を固定する追加変更はしない。 |
| EVO-132 RAW＋固定RecipeによるFinal再生成 | G / E | UNKNOWN / Desktop; Windows / macOS / 未確認: Evoto内部の同じrecipe snapshot固定条件 [S01](https://support.evoto.ai/how-to-use-import-export/) [S30](https://support.evoto.ai/cloud-space/) | SPEC-006, CLOUD-11 | pipe, life — 固定入力コードありNOT_RUN。実RAW/native画質/中断未実証 | NAT-032 / NOT_IMPLEMENTED | EvotoにRAW/編集/exportはあるが内部Recipeの版固定保証は資料で未確認。SUITEは不変ExportPlan＋staging。 |
| EVO-133 Standard Crop Ratio | C / C | DOCUMENTED / iPad / Fixed/Free/Originalを確認 [S28](https://support.evoto.ai/crop-ipad/) | CROP-01 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | SUITE必須12項目すべての同一メニュー一致は未確認。 |
| EVO-134 Custom Ratio | C / C | DOCUMENTED / iPad / 寸法入力と比率lockを確認 [S28](https://support.evoto.ai/crop-ipad/) | CROP-01 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 自由な幅/高さ入力の目的は同等。Exact SUITE Custom Ratio UIは未検証。 |
| EVO-135 Photo Print Size | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-03 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 一般印刷サイズ記載だけではL/2L以下21日本規格セットの証明にならない。 |
| EVO-136 A Series | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-02 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | A0〜A4の名前/実寸プリセットは確認できない。 |
| EVO-137 B Series（JIS） | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-02 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | JIS B判プリセットの確認なし。ISO Bと混同しない。 |
| EVO-138 A0倍 | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-02 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | A0と別ID/実寸を持つpresetは確認できない。 |
| EVO-139 B0倍 | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-02 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | B0と別ID/実寸を持つpresetは確認できない。 |
| EVO-140 四切 | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-03 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 日本写真規格の実寸presetは公式で未確認。 |
| EVO-141 ワイド四切 | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-03 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 名称だけでなく寸法・ラボ差確認が必要。 |
| EVO-142 半切 | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-03 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 実寸presetは公式で未確認。 |
| EVO-143 全紙 | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-03 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 実寸presetは公式で未確認。 |
| EVO-144 大全紙 | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-03 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 実寸presetは公式で未確認。 |
| EVO-145 全倍 | G / E | UNKNOWN / iPad / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) | CROP-03 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 実寸presetは公式で未確認。 |
| EVO-146 Custom Physical Size | E / E | DOCUMENTED / iPad / インチで幅/高さ/解像度入力 [S28](https://support.evoto.ai/crop-ipad/) | CROP-03, CROP-04 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | SUITE mm入力/表示とは単位とプリセット情報保持が異なる。 |
| EVO-147 Crop Preview | C / C | DOCUMENTED / iPad / Crop枠・編集previewを確認 [S28](https://support.evoto.ai/crop-ipad/) [S38](https://support.evoto.ai/welcome-to-evoto-ai-ipad/) | CROP-04 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | SUITE要求のmm/予定dpi/必要pixel同時表示は別途未実証。 |
| EVO-148 Crop → Export linkage | G / E | UNKNOWN / iPad; Desktop / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) [S01](https://support.evoto.ai/how-to-use-import-export/) [S38](https://support.evoto.ai/welcome-to-evoto-ai-ipad/) | CROP-06 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 一般的な編集結果の反映はあるが、印刷preset/mm/dpiを同じ契約で引継ぐ保証は未確認。 |
| EVO-149 DPI（pixel density） | C / C | DOCUMENTED / iPad Crop; Desktop Export / Crop解像度、Desktop PPI/PPC指定 [S28](https://support.evoto.ai/crop-ipad/) [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-07 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | iPhone/iPad ExportパネルのPPI入力はS18では未確認。プリンタのdot能力と分離。 |
| EVO-150 mm → pixel calculation | G / E | UNKNOWN / iPad Crop; Desktop Export / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-07 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | mm÷25.4×dpiのUI自動計算/不足検査は文書で未確認。 |
| EVO-151 JPEG | B / B | DOCUMENTED / Mobile; Desktop / JPG対応 [S18](https://support.evoto.ai/export/) [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-09 | pipe — 既存単一画像出力候補あり・NOT_RUN | NAT-001 / NOT_RUN | 現SUITE native encode候補はあるがMac/iPhone/iPad NOT_RUN。 |
| EVO-152 TIFF | B / B | DOCUMENTED / Mobile; Desktop / TIFF対応 [S18](https://support.evoto.ai/export/) [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-09 | pipe — 既存単一画像出力候補あり・NOT_RUN | NAT-001 / NOT_RUN | SUITEの従来TIFF経路存在を16bit/圧縮完成としない。 |
| EVO-153 PNG | C / C | DOCUMENTED / Desktop / PNG/alpha対応 [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-09 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | Mobile PNG対応は確認できない。SUITE新正式対応だが実画素未実証。 |
| EVO-154 JPEG default quality | G / C | UNKNOWN / Mobile; Desktop / 未確認: 同じ詳細機能・保証 [S18](https://support.evoto.ai/export/) [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-09 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | quality調整とBest推奨はあるが初期値100%固定の保証は未確認。 |
| EVO-155 TIFF 8bit / 16bit | C / C | DOCUMENTED / Desktop / 8/16bit選択 [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-09 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | Mobile TIFF bit depth/非圧縮/可逆圧縮の詳細は未確認。 |
| EVO-156 sRGB | C / C | DOCUMENTED / Mobile; iPad / sRGB変換を確認 [S18](https://support.evoto.ai/export/) [S38](https://support.evoto.ai/welcome-to-evoto-ai-ipad/) | CROP-10 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | SUITE実profile変換/metadata整合/色票QA未検証。 |
| EVO-157 Adobe RGB | C / C | DOCUMENTED / iPad; Mobile / 対応する非RAWのAdobe RGB出力/維持 [S38](https://support.evoto.ai/welcome-to-evoto-ai-ipad/) [S18](https://support.evoto.ai/export/) | CROP-10 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 任意のRAWからAdobe RGBを明示選択する全経路の保証は別途未確認。 |
| EVO-158 ICC profile | G / C | UNKNOWN / Mobile; iPad / 未確認: 同じ詳細機能・保証 [S18](https://support.evoto.ai/export/) [S38](https://support.evoto.ai/welcome-to-evoto-ai-ipad/) | CROP-10 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 色変換/元profile維持の説明はあるがICCデータと画素変換の検証保証は未確認。 |
| EVO-159 Metadata | C / C | DOCUMENTED / Mobile; Desktop / 日時選択/一部metadata [S18](https://support.evoto.ai/export/) [S31](https://support.evoto.ai/library/) [S35](https://support.evoto.ai/how-to-use-setting/) | CROP-09 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | 全EXIF/IPTC/XMPを無条件保持すると解釈しない。 |
| EVO-160 File naming | C / C | DOCUMENTED / Desktop / 命名パターン [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-09 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | Mobile詳細は未確認。 |
| EVO-161 Batch Export | C / C | DOCUMENTED / Mobile; Desktop / 複数画像出力 [S18](https://support.evoto.ai/export/) [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-09 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | SUITE一枚exportコードをbatch完了に数えない。 |
| EVO-162 Large Format workflow | G / E | UNKNOWN / iPad Crop; Desktop Export / 未確認: 同じ詳細機能・保証 [S28](https://support.evoto.ai/crop-ipad/) [S01](https://support.evoto.ai/how-to-use-import-export/) | CROP-02, CROP-04, CROP-06, CROP-07, CROP-08, CROP-11 | — — 正式仕様追加済み・統合中。機能QA未実施 | — / NOT_IMPLEMENTED | A0倍/B0倍実寸→Crop→不足警告→300dpi→固定Recipe Finalの一貫導線は未確認。一般大判出力機能の不存在は意味しない。 |

## 別一覧1 — Evoto公式にあり、SUITE機能実装がない項目

C/D/Fに分類された機能。D/Fは採用確定ではない。Eの代替未完成は別一覧2、Bのnative未検証は機械可読版のsuiteNativeNotVerifiedで別管理する。
- EVO-008 WB/色温度 (C)
- EVO-009 Tint (C)
- EVO-010 ハイライト (C)
- EVO-011 シャドウ (C)
- EVO-012 白レベル (C)
- EVO-013 黒レベル (C)
- EVO-014 自然な彩度 (C)
- EVO-015 トーンカーブ (C)
- EVO-016 HSL (C)
- EVO-017 シャープ (C)
- EVO-018 ノイズ除去 (C)
- EVO-019 色ノイズ除去の独立制御 (D)
- EVO-020 レンズ歪み補正 (C)
- EVO-021 周辺減光補正 (C)
- EVO-022 輝度ヒストグラム (D)
- EVO-023 独立Brightness制御 (D)
- EVO-024 Clarity (D)
- EVO-025 Dehaze (D)
- EVO-026 フィルム粒子 (D)
- EVO-027 RAWレンズプロファイル自動照合 (D)
- EVO-028 クロップ (C)
- EVO-029 LUTによるLook適用 (C)
- EVO-030 外部.XMP/.CUBEの直接import互換 (D)
- EVO-031 自動露出/自動WB/Auto Develop (C)
- EVO-032 参照写真からAI Color Match (D)
- EVO-033 肌を保護するLook・局所カラー (C)
- EVO-034 顔検出・landmark解析 (C)
- EVO-035 写真内の顔別・人物別補正 (C)
- EVO-036 プロジェクト内同一人物へのバッチ追従 (C)
- EVO-037 年齢/性別推定タグ (D)
- EVO-038 肌荒れ/ニキビ (C)
- EVO-039 シミ/そばかす (C)
- EVO-040 テカリ (C)
- EVO-041 目の下/クマ (C)
- EVO-042 ほうれい線/顔のシワ (C)
- EVO-043 妊娠線 (C)
- EVO-044 肌スムージング (C)
- EVO-045 肌テクスチャ保持 (C)
- EVO-046 顔色ムラ (C)
- EVO-047 体の肌色ムラ (C)
- EVO-048 肌色・赤み (C)
- EVO-049 目の明度 (C)
- EVO-050 歯の白さ (C)
- EVO-051 髪の乱れ除去 (C)
- EVO-052 顔幅 (C)
- EVO-053 顎/輪郭 (C)
- EVO-054 目の大きさ (C)
- EVO-056 Dodge & Burn専用操作 (D)
- EVO-057 周波数分離専用操作 (D)
- EVO-058 眼鏡反射除去 (D)
- EVO-059 歯列整列/歯の生成 (D)
- EVO-060 髪色変更/白髪処理 (D)
- EVO-061 ウエスト (C)
- EVO-062 腹部/全身ライン (C)
- EVO-063 バスト (C)
- EVO-064 腕 (C)
- EVO-065 脚の太さ/長さ (C)
- EVO-066 身長印象 (C)
- EVO-068 手動Liquify brush (D)
- EVO-069 背景置換 (C)
- EVO-070 空交換・天候整合 (C)
- EVO-071 背景ぼかし/深度bokeh (D)
- EVO-072 手動不要物除去/Healing (C)
- EVO-073 生成拡張/Outpainting (D)
- EVO-074 衣服シワ・糸くず・汗染み除去 (D)
- EVO-075 プリセット保存・適用 (C)
- EVO-076 プリセット共有 (C)
- EVO-077 プリセット全体の効果強度 (C)
- EVO-078 選択写真への一般バッチ適用 (C)
- EVO-079 iPhone有線テザー (C)
- EVO-080 iPad有線テザー (C)
- EVO-081 無線テザー (D)
- EVO-085 複数枚Export queue (C)
- EVO-086 JPEG Export品質設定 (C)
- EVO-087 Export色profile選択 (C)
- EVO-088 Export命名規則（Desktop比較） (C)
- EVO-089 透かしExport (D)
- EVO-091 Online Gallery/QR/クライアント選別 (C)
- EVO-108 テキスト検索/Storyline culling (D)
- EVO-109 Lightroom Catalog往復 (D)
- EVO-110 動画retouch/NLEプラグイン (F)
- EVO-111 課金促進のpreviewスクショ保護 (F)
- EVO-112 メイク（眉/目元/リップ等） (D)
- EVO-114 人物群を新郎/新婦/ゲスト別に検索 (D)
- EVO-115 学習型Personalized AI Look (D)
- EVO-116 AI Cullingのblur/blink/duplicate判定 (D)
- EVO-117 Project/Library整理とフィルタ (C)
- EVO-118 Virtual Copy（別編集版の並列比較） (D)
- EVO-119 Exportピクセル寸法（Desktop） (C)
- EVO-121 Exportリサイズ（Desktop） (C)
- EVO-123 Export PPI/PPC（Desktop、通称dpi指定） (C)
- EVO-126 Export出力先Files/Photos・Album (C)
- EVO-127 Export撮影日時/出力日時metadata (C)
- EVO-128 Export EXIF/IPTC/XMPポリシー (C)
- EVO-129 Export PNG/透明背景 (C)
- EVO-133 Standard Crop Ratio (C)
- EVO-134 Custom Ratio (C)
- EVO-147 Crop Preview (C)
- EVO-149 DPI（pixel density） (C)
- EVO-153 PNG (C)
- EVO-155 TIFF 8bit / 16bit (C)
- EVO-156 sRGB (C)
- EVO-157 Adobe RGB (C)
- EVO-159 Metadata (C)
- EVO-160 File naming (C)
- EVO-161 Batch Export (C)

## 別一覧2 — SUITE独自設計・方式候補

市場唯一とは主張しない。Evotoに同目的機能があってもSUITEの安全境界/単位/データモデルが異なる場合を含む。GはEvotoの厳密な同等保証が未確認なだけで、非対応の証明ではない。

| ID | SUITE方式候補 | 成熟度／公式比較確度 |
| --- | --- | --- |
| EVO-067 | 体型補正時の背景保護 | E / 意図/解析前提チェックのコードのみNOT_RUN。変形と背景保護の実処理は未実装 |
| EVO-082 | 撮影時の自動Look適用 | E / データ境界/適用計画コードNOT_RUN。撮影パイプライン未接続 |
| EVO-100 | 通常Proxy・FinalだけOriginal取得 | E / Windowsの選択/待機判定PASS。native decode未検証、本番sync未接続 |
| EVO-101 | Recipe/未同期RAWをCacheから保護 | E / Windows保護判定PASS。native/物理eviction未検証・未実装 |
| EVO-102 | Proxy複数品質/通信P0–P3 | G / Swift純粋判定コードNOT_RUN。自動転送は未接続 |
| EVO-103 | 5撮影モード＋任意Personal Color | G / intent型/validationのみNOT_RUN。解析・色適用・UI未実装 |
| EVO-104 | Canonical生成背景＋Identity Gate | G / 保護境界コードNOT_RUN。生成・本人性検証は未実装 |
| EVO-105 | 日本印刷サイズ・300ppi確認 | G / 仕様のみ。単位計算/overlay/出力すべて未実装 |
| EVO-106 | Cloud上原本＋RecipeからiPhone/iPad相互Final | E / API注入境界コードありNOT_RUN。本番cloud Proxy/復元未接続 |
| EVO-107 | 無料コミュニティPreset共有 | E / 仕様のみ。community未実装 |
| EVO-113 | Bridal / Wedding撮影workflow | E / モードintentのみNOT_RUN。階調保護・自動処理未実装 |
| EVO-130 | A0/A1実寸クロップと300ppi検査 | G / 仕様のみ・計算/overlay/出力NOT_IMPLEMENTED |
| EVO-132 | RAW＋固定RecipeによるFinal再生成 | G / 固定入力コードありNOT_RUN。実RAW/native画質/中断未実証 |
| EVO-135 | Photo Print Size | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-136 | A Series | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-137 | B Series（JIS） | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-138 | A0倍 | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-139 | B0倍 | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-140 | 四切 | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-141 | ワイド四切 | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-142 | 半切 | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-143 | 全紙 | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-144 | 大全紙 | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-145 | 全倍 | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-146 | Custom Physical Size | E / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-148 | Crop → Export linkage | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-150 | mm → pixel calculation | G / 正式仕様追加済み・統合中。機能QA未実施 |
| EVO-162 | Large Format workflow | G / 正式仕様追加済み・統合中。機能QA未実施 |

## 別一覧3 — 同等の目的があるが方式・保証が異なる項目

表の同等は目的の共通性だけであり、画質・性能・全機能同等や保証同等の意味ではない。

| ID | 共通目的 | 方式差・未確認境界 |
| --- | --- | --- |
| EVO-067 | 体型補正時の背景保護 | SUITEはperson segmentation＋背景保護必須。同等の目的だが工程/保証条件が異なる。仕上がり同等は未実証。 |
| EVO-082 | 撮影時の自動Look適用 | Session Lookは固定版＋未来画像binding＋過去再適用は明示。実キャプチャ連携・顔再解析・自動描画は未実装。 |
| EVO-096 | RAW原本immutable保存境界（backend限定） | local objectの上書き拒否/checksumを実ファイルで検証。実RAWデコードやnative安全性はこのAの対象外。 |
| EVO-097 | Recipe保存/再読込/CAS（backend限定） | JSON検証＋SQLite CAS。Swift roundtrip/他端末同期はこのAの対象外。 |
| EVO-101 | Recipe/未同期RAWをCacheから保護 | SUITEはderived cacheとRecipe/原本を分離して保護。物理LRU/削除は未実装、判定だけPASS。 |
| EVO-105 | 日本印刷サイズ・300ppi確認 | 従来300ppi要件と今回300dpi表記はpixel densityとして整合させる。プリンタdot解像度とは分離。追加CROP仕様の実寸・不足警告・native画素処理は未検証。 |
| EVO-107 | 無料コミュニティPreset共有 | SUITE無料Community方針を維持。Evoto共有にもtokenがあり、すべて有料としない。 |
| EVO-100 | 通常Proxy・FinalだけOriginal取得 | SUITEと共通目的。EvotoにProxyがないとはしない。Evoto fixed4K説明に対しSUITE端末/zoom/通信の適応品質。cloud同期のiPad未提供が公式記載。 |
| EVO-106 | Cloud上原本＋RecipeからiPhone/iPad相互Final | SUITEはiPhone/iPad相互編集・Finalを既存仕様として要求。Evoto Mobile Galleryはこの原本Project同期とは別。SUITE側も本番未接続。 |
| EVO-113 | Bridal / Wedding撮影workflow | SUITE Wedding Modeは自然さ/白ドレス階調保護/照明対応。Evoto同名の固定modeとは断定しない。 |
| EVO-130 | A0/A1実寸クロップと300ppi検査 | 従来300ppi要件と今回300dpi表記はpixel densityとして整合させる。プリンタdot解像度とは分離。追加CROP仕様の実寸・不足警告・native画素処理は未検証。 |
| EVO-146 | Custom Physical Size | SUITE mm入力/表示とは単位とプリセット情報保持が異なる。 |
| EVO-149 | DPI（pixel density） | iPhone/iPad ExportパネルのPPI入力はS18では未確認。プリンタのdot能力と分離。 |
| EVO-157 | Adobe RGB | 任意のRAWからAdobe RGBを明示選択する全経路の保証は別途未確認。 |

## G一覧 — 公式未確認を不存在扱いしない

未確認対象（32件）: EVO-003, EVO-055, EVO-096, EVO-098, EVO-099, EVO-102, EVO-103, EVO-104, EVO-105, EVO-120, EVO-122, EVO-124, EVO-125, EVO-130, EVO-131, EVO-132, EVO-135, EVO-136, EVO-137, EVO-138, EVO-139, EVO-140, EVO-141, EVO-142, EVO-143, EVO-144, EVO-145, EVO-148, EVO-150, EVO-154, EVO-158, EVO-162。対象公式ページは各行に紐づく。検索結果がないことだけでEvotoに機能がないとは判断しない。

## Gap台帳 — 仕様採否と実装優先度を分離

全行はJSONのgap.id＝GAP-<行ID>で追跡し、registration=AUDIT_ONLY_NOT_SPEC_CHANGEとする。既存仕様はそのまま保持。追加CROP要件の承認元はユーザー添付正本であり、この監査の推奨ではない。以下は判断用定性評価で、工数・金額の確約はしない。

| Gap | 既存仕様/採否 | UX影響 | 実機要否 | 実装コスト | AI/cloud cost | 優先度 |
| --- | --- | --- | --- | --- | --- | --- |
| GAP-EVO-001 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | P0安全・既存Gate維持 |
| GAP-EVO-002 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-003 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | P0安全・既存Gate維持 |
| GAP-EVO-004 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-005 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-006 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-007 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-008 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-009 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-010 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-011 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-012 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-013 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-014 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-015 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-016 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-017 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-018 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-019 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-020 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-021 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-022 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-023 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-024 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-025 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-026 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-027 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-028 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-029 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P2既存順序内で対応 |
| GAP-EVO-030 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-031 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-032 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-033 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1既存Mobile要件の未達解消 |
| GAP-EVO-034 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P2既存順序内で対応 |
| GAP-EVO-035 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1既存Mobile要件の未達解消 |
| GAP-EVO-036 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1既存Mobile要件の未達解消 |
| GAP-EVO-037 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-038 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1既存Mobile要件の未達解消 |
| GAP-EVO-039 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-040 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-041 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-042 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P2既存順序内で対応 |
| GAP-EVO-043 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-044 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1既存Mobile要件の未達解消 |
| GAP-EVO-045 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1既存Mobile要件の未達解消 |
| GAP-EVO-046 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P2既存順序内で対応 |
| GAP-EVO-047 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1既存Mobile要件の未達解消 |
| GAP-EVO-048 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1既存Mobile要件の未達解消 |
| GAP-EVO-049 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-050 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-051 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P2既存順序内で対応 |
| GAP-EVO-052 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P2既存順序内で対応 |
| GAP-EVO-053 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-054 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-055 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-056 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-057 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-058 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-059 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-060 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-061 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-062 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-063 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-064 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-065 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-066 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-067 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1既存Mobile要件の未達解消 |
| GAP-EVO-068 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-069 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P2既存順序内で対応 |
| GAP-EVO-070 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-071 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-072 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-073 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-074 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-075 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-076 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-077 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-078 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-079 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-080 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-081 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-082 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 中〜高、詳細未確定。未採用事項は見積未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P2既存順序内で対応 |
| GAP-EVO-083 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-084 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-085 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-086 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-087 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-088 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-089 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-090 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-091 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-092 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-093 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-094 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-095 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 操作経路コードあり。実機失敗/画質差の可能性が未検証 | iPhone/iPad双方必須。Mac成功で代替不可 | 接続/QA修正規模未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-096 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 安全基盤の継続回帰。製品UI/実RAWの合格とは別 | このbackend単体Evidenceは不要、Mobile統合にはiPhone/iPad双方必須 | 回帰維持・既存境界。追加見積未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | P0安全・既存Gate維持 |
| GAP-EVO-097 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 安全基盤の継続回帰。製品UI/実RAWの合格とは別 | このbackend単体Evidenceは不要、Mobile統合にはiPhone/iPad双方必須 | 回帰維持・既存境界。追加見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P0安全・既存Gate維持 |
| GAP-EVO-098 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 安全基盤の継続回帰。製品UI/実RAWの合格とは別 | このbackend単体Evidenceは不要、Mobile統合にはiPhone/iPad双方必須 | 回帰維持・既存境界。追加見積未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | P0安全・既存Gate維持 |
| GAP-EVO-099 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 安全基盤の継続回帰。製品UI/実RAWの合格とは別 | このbackend単体Evidenceは不要、Mobile統合にはiPhone/iPad双方必須 | 回帰維持・既存境界。追加見積未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | P0安全・既存Gate維持 |
| GAP-EVO-100 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | P0安全・既存Gate維持 |
| GAP-EVO-101 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | P0安全・既存Gate維持 |
| GAP-EVO-102 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | P0安全・既存Gate維持 |
| GAP-EVO-103 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-104 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P2既存順序内で対応 |
| GAP-EVO-105 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-106 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | P0安全・既存Gate維持 |
| GAP-EVO-107 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-108 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-109 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-110 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。不要決定・削除承認なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-111 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。不要決定・削除承認なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-112 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 中〜高、詳細未確定。未採用事項は見積未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-113 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1既存Mobile要件の未達解消 |
| GAP-EVO-114 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-115 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-116 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-117 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-118 | NOT_SPECIFIED_OR_APPROVED; 判断待ち。新仕様採用なし | 採用前。現行操作導線を変更しない | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | DEFER_DECISION（今回実装しない） |
| GAP-EVO-119 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-120 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-121 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-122 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-123 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-124 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-125 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-126 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1既存Mobile要件の未達解消 |
| GAP-EVO-127 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加CROP-09を維持。Metadata範囲詳細はプライバシー整合を確認 | 追加正式仕様の出力条件が現製品で完走未確認 | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1承認済みCrop/Export統合 |
| GAP-EVO-128 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加CROP-09を維持。Metadata範囲詳細はプライバシー整合を確認 | 追加正式仕様の出力条件が現製品で完走未確認 | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P1承認済みCrop/Export統合 |
| GAP-EVO-129 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加CROP-09を維持。Metadata範囲詳細はプライバシー整合を確認 | 追加正式仕様の出力条件が現製品で完走未確認 | 採用する場合はiPhone/iPad双方が必要。現時点は判断待ち | 高（画像処理/ML/品質評価が必要）。工数未確定 | 実行経路・モデル・測定なし、金額未確定。on-device/cloud/hybrid条件は既存方針保持 | P1承認済みCrop/Export統合 |
| GAP-EVO-130 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-131 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 該当操作を現SUITE製品で完走できない | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 追加AI/cloud呼出しの根拠なし。性能/保存コスト未計測 | P2既存順序内で対応 |
| GAP-EVO-132 | EXISTING_REQUIREMENT_RETAINED; 既存仕様を保持、優先度は監査推奨で既存順序を上書きしない | 代替方式は既存契約だが未接続/未実証部分を利用可能と表示不可 | iPhone/iPad双方必須。Mac成功で代替不可 | 高（画像処理/ML/品質評価が必要）。工数未確定 | 転送/保存/再試行量の実測待ち、provider未選定、金額未確定 | P0安全・既存Gate維持 |
| GAP-EVO-133 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-134 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-135 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-136 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-137 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-138 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-139 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-140 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-141 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-142 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-143 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-144 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-145 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-146 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-147 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-148 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-149 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-150 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-151 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-152 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-153 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-154 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-155 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-156 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-157 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-158 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-159 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-160 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-161 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |
| GAP-EVO-162 | APPROVED_ADDITIVE_CROP_REQUIREMENT; 追加正式仕様CROP文書に従う。Evoto比較から仕様を勝手に拡張しない | 実寸構図と出力条件を一致させる必須導線。未接続/未検証を対応済み表示しない | iPhone/iPad双方必須。Mac画像QA・実印刷検証も別Gate | 計算/データ型とnative画像処理/UX/画質QAを分離。工数未確定 | 通常Crop/Exportは追加AI課金を仮定しない。Upscale採用時は明示同意/実測が先。転送/保存実測待ち | P1承認済みCrop/Export統合（P0データ安全を維持） |

全Gapの非破壊整合条件: RAW上書き禁止、通常Proxy、Recipeを別保存、固定Recipeと原本から新しいExportを生成、Cloud Safe失効・未同期データ保護を維持。適合が未実装/未検証の行は互換性を合格にしない。各行のnonDestructiveCompatibilityに保持している。

### Fの判断待ち理由

- EVO-110: 動画retouch/NLEは写真iPhone/iPad初期対象と異なる製品領域。今回の採用候補から外す提案であり、既存動画要件を削除する行為ではない。
- EVO-111: 課金促進のpreviewスクショ保護は現SUITEの安全保存/編集価値とは別目的。採否未承認、導入・削除どちらも行わない。

## 実行Evidenceと未実行Gate

- Windows既存基盤: 34 PASS / 0 FAIL / 0 SKIPの実行範囲のみ引用。今回の最新全件結果はメインのverification-results.jsonに統合する。競合監査文書の静的整合検査は製品機能テストとは分ける。
- Swift/Core/native、実RAW100/500/1000、Mac画像処理、iPhone実機、iPad実機: 実行結果がないものはNOT_RUN。nativeの候補コードやWindows型/計算テストをPASSへ転用しない。
- 実RAWが未配置ならダミーRAW・JPEG代用品を負荷合格にしない。実RAWはcheckout外。100/500/1000はそれぞれ同期・再起動復元・Cloud Safe・Exportまで別Evidenceが必要。
- 実機QAはiPhone/iPadの2Gate。Macは検証環境であり、初期製品対象をMacへ広げない。必要環境・次コマンド・判定はHANDOFFと検証手順の正本を参照する。
- 現段階の全体Mobile ReleaseはBLOCK。未実装の画像処理・テザー・本番接続と、実RAW/Mac/実機のNOT_RUNは異なる未合格理由である。
- 既存RAW不変、Multipart破損partのみ新key再取得/旧part保持/正常part不変/checksum、Recipe/CAS、SQLite復元、ENOSPC注入、強制終了、Cloud Safe失効は回帰対象のまま。実機容量不足と障害注入を同一Evidenceとしない。

## コード参照略号

| 略号 | リポジトリ相対パス |
| --- | --- |
| pipe | [apps/apple/Suite/Services/PhotoPipeline.swift](../apps/apple/Suite/Services/PhotoPipeline.swift) |
| model | [apps/apple/Suite/EditorModel.swift](../apps/apple/Suite/EditorModel.swift) |
| recipe | [packages/SuiteCore/Sources/SuiteCore/Recipe.swift](../packages/SuiteCore/Sources/SuiteCore/Recipe.swift) |
| session | [packages/SuiteCore/Sources/SuiteCore/SessionLook.swift](../packages/SuiteCore/Sources/SuiteCore/SessionLook.swift) |
| life | [packages/SuiteCore/Sources/SuiteCore/PhotoLifecycle.swift](../packages/SuiteCore/Sources/SuiteCore/PhotoLifecycle.swift) |
| cloud | [packages/SuiteCore/Sources/SuiteCore/CloudTransferPolicy.swift](../packages/SuiteCore/Sources/SuiteCore/CloudTransferPolicy.swift) |
| repo | [apps/backend/src/repository.ts](../apps/backend/src/repository.ts) |
| store | [apps/backend/src/storage.ts](../apps/backend/src/storage.ts) |
| multi | [apps/backend/src/multipart.ts](../apps/backend/src/multipart.ts) |
| policy | [apps/backend/src/photo-policy.ts](../apps/backend/src/photo-policy.ts) |
| iphone | [apps/apple/Suite/Features/iPhone/IPhoneEditorView.swift](../apps/apple/Suite/Features/iPhone/IPhoneEditorView.swift) |
| ipad | [apps/apple/Suite/Features/iPad/IPadEditorView.swift](../apps/apple/Suite/Features/iPad/IPadEditorView.swift) |
| app | [apps/apple/Suite/SuiteApp.swift](../apps/apple/Suite/SuiteApp.swift) |

## 公式出典一覧

すべて2026-10-03 JST確認。Evotoのサイト/サポート/公式blogと公式App Store listingのみ。個人レビュー・第三者記事を機能の根拠にしていない。公式文書の閲覧であり、端末実測や画質検証ではない。

| ID | 公式資料 | platform/範囲 | 留意点 |
| --- | --- | --- | --- |
| S01 | [Import & Export](https://support.evoto.ai/how-to-use-import-export/) | Desktop | Most camera RAW・JPEG import、export設定。FAQ内の全RAW表現を全カメラ保証とは読まない。 |
| S02 | [iPad Color Adjustments](https://support.evoto.ai/color-adjustment-ipad/) | iPad | iPad名義の個別マニュアル。 |
| S03 | [Color](https://support.evoto.ai/color-adjustments-module/) | Evoto Mobile | Mobile guideから参照。iPad版とは別記事。 |
| S04 | [iPad Portrait Retouching](https://support.evoto.ai/portrait-retouching-ipad/) | iPad | 個別顔とプロジェクト内同期。リンク先の一部はDesktop限定との注意あり。 |
| S05 | [AI Facial Recognition](https://support.evoto.ai/ai-facial-recognition/) | Evoto Mobile | Mobile guideから参照。 |
| S06 | [Blemish Removal](https://support.evoto.ai/portrait-retouching-module-blemish-removal/) | Evoto Mobile | Mobile guideから参照。 |
| S07 | [Skin Retouching](https://support.evoto.ai/portrait-retouching-module-skin-retouching/) | Evoto Mobile | Mobile guideから参照。 |
| S08 | [iPad Skin Retouching](https://support.evoto.ai/skin-retouching-ipad/) | iPad | Even(Dodge&Burn)はnon-Asian regions限定注記。日本提供を断定しない。 |
| S09 | [Full Body Reshape](https://support.evoto.ai/portrait-retouching-full-body-reshape/) | Evoto Mobile | 重なりのある集合写真等では一部無効化との注記。 |
| S10 | [iPad Facial Reshape](https://support.evoto.ai/facial-reshape-ipad/) | iPad | 顔幅・顎・眼形状など個別記載。 |
| S11 | [Eyes](https://support.evoto.ai/portrait-retouching-eyes/) | Evoto Mobile | Mobile guideから参照。 |
| S12 | [Teeth](https://support.evoto.ai/portrait-retouching-teeth/) | Evoto Mobile | Mobile guideから参照。 |
| S13 | [Hair](https://support.evoto.ai/portrait-retouching-hair/) | Evoto Mobile | Mobile guideから参照。 |
| S14 | [iPad Backdrop Changer](https://support.evoto.ai/backdrop-changer-ipad/) | iPad | 背景置換、保持範囲、境界調整。 |
| S15 | [iPad Sky Replacement](https://support.evoto.ai/sky-replacement-ipad/) | iPad | 空交換専用guide。 |
| S16 | [Preview Page](https://support.evoto.ai/preview-page/) | Evoto Mobile | 履歴・比較・複数画像Sync・一部previewスクリーンショット制限。 |
| S17 | [Presets](https://support.evoto.ai/presets/) | Evoto Mobile | 保存/適用/token共有/強度。 |
| S18 | [Export](https://support.evoto.ai/export/) | Evoto Mobile | JPEG/TIFF/Files/Photos/share等。 |
| S19 | [iPad System Settings](https://support.evoto.ai/how-to-use-settings-ipad/) | iPad | cache消去で一部手動編集記録を失う注意を記載。 |
| S20 | [Mobile Wired Tether](https://support.evoto.ai/wired-tethered-shooting-in-evoto-mobile/) | iPhone / Evoto Mobile | iPhoneの有線接続を明記。カメラ固有の対応確認が必要。 |
| S21 | [iPad Wired Tether](https://support.evoto.ai/wired-tethered-shooting-ipad/) | iPad | RAW/JPEG選択・撮影時効果適用。 |
| S22 | [iPad Wireless Tether](https://support.evoto.ai/wireless-tethered-shooting-ipad/) | iPad | 有線とは別guide。 |
| S23 | [Quick Tour of Evoto Mobile](https://support.evoto.ai/quick-tour-of-evoto-mobile/) | Evoto Mobile iOS/Android | version差あり。AI Creative ToolsにはWebへの宣伝入口を含む。 |
| S24 | [Evoto US App Store listing](https://apps.apple.com/us/app/evoto-photo-editor-retouch/id6596737043) | iPhone / iPad | 開発者説明・対応端末・version履歴のみ採用。ユーザーレビューを根拠にしない。取得時3.3.2表示。 |
| S25 | [Evoto Product Launch 2026](https://blog.evoto.ai/evoto-product-launch-2026/) | Desktop8.0 / App3.3 / Video1.6 / AssetHub | 2026-09-23公開。別製品の機能を混ぜない。 |
| S26 | [iPad Tool Bar](https://support.evoto.ai/tool-bar-ipad/) | iPad | Liquify/Healing/Pencil/Historyの具体的制限あり。 |
| S27 | [iPad Blemish Removal](https://support.evoto.ai/blemish-removal-ipad/) | iPad | 局所brush・シワ・妊娠線等。 |
| S28 | [iPad Crop](https://support.evoto.ai/crop-ipad/) | iPad | Crop個別guide。 |
| S29 | [iPad Rotate](https://support.evoto.ai/rotate-ipad/) | iPad | Rotate個別guide。 |
| S30 | [Cloud Space](https://support.evoto.ai/cloud-space/) | Windows / macOS | iPad未提供を明記。原本自動取得の旧説明とSmart Preview節が併存し内部詳細を断定しない。 |
| S31 | [Library Workspace](https://support.evoto.ai/library/) | Desktop | Project/Library/Metadata/Virtual Copy。 |
| S32 | [Personalized AI Look](https://support.evoto.ai/personalized-ai-look/) | Desktop | 作家の色スタイル学習。肌の四季Personal Colorとは別概念。 |
| S33 | [Makeup](https://support.evoto.ai/portrait-retouching-makeup/) | Evoto Mobile | メイク専用guide。 |
| S34 | [Clothes](https://support.evoto.ai/clothing-accessories-adjustments-module/) | Evoto Mobile | 上下衣服のシワ・糸くず・汗染み・境界。 |
| S35 | [System Settings](https://support.evoto.ai/how-to-use-setting/) | Desktop | Export同時数/画像caption・descriptionの元情報選択。 |
| S36 | [Evoto 6.2 Updates](https://support.evoto.ai/evoto-ai-version-6-2-updates/) | Desktop | Face Galleryで新郎/新婦/ゲストの絞り込み例、Smart Preview。 |
| S37 | [AI Culling in Evoto Instant](https://support.evoto.ai/ai-culling-in-evoto-instant/) | Evoto Instant（別製品） | blur/blink/duplicate。Evoto Mobileへの横展開は未確認。 |
| S38 | [Evoto for iPad – Introduction](https://support.evoto.ai/welcome-to-evoto-ai-ipad/) | iPad | RAW/non-RAW display/export color-space defaults. Not proof of arbitrary profile conversion or iPhone behavior. |

## 正本との整合

この監査は仕様採用表ではない。147節/固定6文書/既存6領域保存同期契約は変更していない。ユーザーが別途承認したCrop16節の参照追加のみを反映した。新provider・API・クラウド構成・Web UIは変更しない。変更対象はこの文書とevoto-audit.jsonの2ファイルのみ。最終統合・回帰・Gate判定はメイン担当が行う。
