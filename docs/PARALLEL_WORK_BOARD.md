# SUITE 並列作業の現行管理表

更新: 2026-10-03。ユーザー追加運用をこのチャット「SUITEのモバイル先行リリース方針」で受領・適用。システム上の同時枠は親を含め4名。人数を埋めるための重複割当は禁止。

## 最新：ユーザー許可Web先行検証（4名上限）

所有権/依存/完了条件: WEB_IMPLEMENTATION_CONTRACT.md、OWNERSHIP.md最新節。旧工程とEvidenceを破棄しない。

| 担当 | 状態 | 排他的対象・直近成果・次依存 |
| --- | --- | --- |
| main | 作業中 | Web session/api/build/loopback統合、共通Node-free Gate、Webengine記録。Webbuild成功、UI4screenshots確認、154再回帰予定 |
| A Sol evoto_photo_review | 次工程作業中 | processing6module受領・編集停止、synthetic17試験。processing/qa-page.mjs・qa.htmlで実ブラウザWorker診断 |
| B Sol evoto_mobile_tether_review | レビュー待ち | HTML/UI/CSS受領・編集停止、UI docだけ4screenshots読取り確認。author外部成果待ち、backend重複禁止 |
| C Astra evoto_workflow_review | 作業中 | tests/docのみ。synthetic/session/actual loopback安全試験、cacheUUID付替え欠陥RED→main修正GREEN。ブラウザmain専有 |

次の独立仕事は成果回収後に割当。実RAW不在は実RAWだけNOT_RUN、Web安全機構/画面確認を止めない。Apple112 NOT_RUN、Mobile/Parity BLOCK。

## 前工程：共通人物整合Gate・成果回収と検証引継ぎ（凍結）

| 担当 | 状態 | 今回の対象／直近成果 |
| --- | --- | --- |
| メイン / Sol統合 | 最終統合・Evidence凍結 | 共有data Gate/Export保存checkpoint照合、全154回帰、12拒否診断、文書10/10、報告/引継ぎ。製品source編集停止 |
| Sol6.1 evoto_photo_review | 成果回収済み・読取り確認完了 | EditorModel旧選択無効化、Apple3source＋PortraitPipeline、QA手順。Recovery/Native境界の最終照合。Native NOT_RUN |
| Astra evoto_workflow_review | 成果回収済み・最終報告レビュー | 元13＋安全3＋PGI14のWindows30 PASS、Core14/Apple16試験source NOT_RUN、Export再照合の独立sourceレビュー |
| Sol6.1 evoto_mobile_tether_review | 成果回収済み・監査追補保全 | 共通Gate仕様2文書、workflow458部分成果、凍結18件/9inputs不変。監査PARTIAL/Parity BLOCK |

担当全員の製品/試験編集は停止しメインが統合した。人数を埋めるため新機能を割り当てない。次はMac/Native→実画像/実RAW→iPhone/iPadの独立実測を優先。共通API/schema/固定正本の再設計なし。同じ人物補正機能を増やさず今回Gateを締める。

## 前工程：Face Brightnessのみの実装中心4名（履歴）

| 担当 | 状態 | 排他的対象 | 直近成果／次作業 |
| --- | --- | --- | --- |
| メイン / Sol統合 | 実行中 | PortraitRecipe/portrait-recipe、Recipe/Project/ProjectStore、photo-policy/repository/workspace、Mac Package/QA adapter、統合docs/回帰helper | Asset/SHA・人物UUID/anchor保存/再読込拘束、全履歴/競合branch拒否、時計補正、旧124維持の全回帰・Evidence固定 |
| Sol6.1 evoto_photo_review | 製品実装回収済み→QA手順中 | PhotoPipeline/PortraitPipeline/EditorModel/EditorComponentsは編集停止、FACE_BRIGHTNESS_NATIVE_QA.mdのみ | 実Vision/人物Mask＋明示CUSTOM EV＋共通Proxy/Finalの一回適用を接続。Mac build source不足を発見し親へ返却 |
| Astra evoto_workflow_review | 独立試験回収済み→最終レビュー中 | portrait-recipe.test.ts/Core PortraitRecipeTests/Apple PortraitPipelineTestsは編集停止、PORTRAIT_REVIEW.md追記のみ | Windows13 PASS、Native20追加NOT_RUN。人物付替え/意味破損/時計/保存境界を指摘・修正確認 |
| Sol6.1 evoto_mobile_tether_review | 完了・待機 | audit_continuation.json/mdのみ、保存後編集停止 | 458操作正規化、alias264/RELATED141、Credit163の部分成果保存。凍結9入力不変。監査BLOCKは実装開始条件にしない |

現行仕様は147節・固定6文書を維持し、既存Face Brightness 1項目の限定接続のみ。人物補正全体完成やParity PASSにしない。画像／Native／実RAW／iPhone／iPadはNOT_RUN。標準容量50GBは事業Baselineのままでprovider/課金/正式価格の独断確定なし。旧78/78証跡は不変保存し、今回の承認済製品source差分は新Evidenceに別記する。

## 運用固定

- メインが未着手／実行中／レビュー待ち／完了、排他的ファイル、依存関係、成果・実行結果を管理する。
- 担当終了時に成果・確認結果を回収し、依存が解消した独立仕事を再割当する。同一仕事・同一ファイルの同時編集は禁止。
- 共通API・schema・固定正本・Feature Master・最終統合はメインのみ。現工程は承認済Face Brightness限定実装の回帰締めであり、schema/既存APIの変更なし。下の監査中心表は履歴。
- 未確定Platform／Creditを推測で埋めない。全Zero-Miss条件を満たすまでP0/P1は候補。場当たり実装・旧147節への追加は禁止。
- 最新追加方針はFEATURE_PARITY_GATE.md。Evoto機能包含と操作悪化なしを別の製品Gateとして記録し、F/H/Eで自動免除しない。現段階はBLOCK。
- Windows124 PASS baseline、旧34回帰、固定6文書、78ソースの既存証跡を保持。新規Evidenceは別領域へ追加し旧結果を上書きしない。
- 最新Native112・実RAW・Mac・iPhone・iPadはNOT_RUN。旧Native82証跡は不変。本番Cloud/Auth/Sync/BillingとMobile ReleaseはBLOCK。実装なし／未接続と環境待ちを分離する。

## 過去の監査中心担当（現行割当ではない）

| 担当 | 状態 | 排他的書込み | 主責務 | 回収済み直近報告 |
| --- | --- | --- | --- | --- |
| メイン `/root` | 実行中 | tools/*、parent_sources/discovered_routes、新規Evidence、統合文書 | semantic訂正、一意Registry、別名取得、全回帰 | 124 PASS/0 FAIL/0 SKIP再実行、開始終了/Build/Commit無理由付、78/78不変。26新URL取得済み |
| Sol6.1 `evoto_photo_review` | 実行中 | reviews/web_features.json/md → web_alias_mapping.json/md | 111公式pageとalias対応 | photo43/43全文・386見出し・1484source-bound記録は凍結。Web111全文読了、最終成果作成中 |
| Sol6.1 `evoto_mobile_tether_review` | 実行中 | reviews/cross_source_mobile.json/md | App Store25履歴・Mobile公式→108レビュー対応 | 108全文/964見出し/1949記録、261href/82ALIAS本文逆引き受領・凍結。26新URL候補は親へ引渡し |
| Astra `evoto_workflow_review` | レビュー待ち | reviews/parity_recheck.json/md（次工程のみ） | 意味統合・Platform/Credit・重複・Gate独立確認 | workflow89全文/817見出し/1073記録、Credit13条件、具体的欠陥13件/制約19領域受領。元ファイル凍結 |

記事主担当はREVIEW_ASSIGNMENT.jsonで240IDを重複なく割当済み。補助記事は読取りのみ。過去担当は完了・編集停止としてOWNERSHIP.mdの履歴に保持。

## 次工程・依存

| 仕事 | 状態 | 依存 | 次の割当方針 |
| --- | --- | --- | --- |
| 全240Support本文・見出し意味照合 | 実行中 | 3担当成果 | 完了成果を親が受領しsource/heading/optionを検査 |
| Support別URL82のcanonical/redirect/別記事確認 | 未着手（取得完了） | 別URLsnapshot | 最初に空く担当へ独立ファイルで割当 |
| Web機能landing111と既存Featureの逆引き | 未着手（取得完了） | Websnapshot | Photo担当完了後、別ファイルで再割当 |
| 直近12か月Release/App Store・Credit差分 | 実行中 | 親取得snapshot | 親が統合、Credit独立レビューを空き担当へ |
| 新規Feature Master/Platform/Credit Matrix | 未着手 | 本文＋追加source照合 | 親のみ最終統合。未知は別列・Gateへ反映 |
| Zero-Miss独立レビュー | 未着手 | 新Master | Astraへ読取り再レビュー、共有ファイル編集なし |
| 全Windows124回帰・既存hash/文書10検査 | 未着手（旧Baseline保持） | 統合後 | 親が新規Evidenceへ再実行、FAILなら完了禁止 |
| P0/P1確定→Requirement候補→実装対象判断 | BLOCK | 全監査Gate実際0 | 推測で解除しない。現在は候補のみ |
| Native82/実RAW各セット/Mac/iPhone/iPad | NOT_RUN | 外部実環境 | 実機QAを代替試験でPASSにしない |

新しいタスクを再割当した時点で、担当・ファイル・状態・結果を追記する。

## 成果回収と即時再割当の履歴

1. photo: 43/43全文、386/386見出し、1484source-bound facts、自己構造検査0エラーを受領。元ファイルはレビュー待ち・編集停止。次はWeb feature landing111全本文→alias/controlsをreviews/web_features.json/mdで実行中。
2. mobile_tether: 108/108全文、964/964見出し、1949source-bound records、自己構造検査0エラーを受領。元ファイルはレビュー待ち・編集停止。次はSupport index261固有hrefと追加ALIAS82の逆引きをreviews/index_reverse.json/mdで実行中。
3. workflow: 本文61/89・748factsとの報告。原担当継続、39記事checkpointは最終版ではない。完了後は時点/地域/Plan/Platform別Credit矛盾の追加照合へ。

1484/1949は操作・条件・workflow・情報を含むsource-bound recordsであり、Evoto独立Feature総数として加算していない。自己構造検査は親の独立統合検査/製品Parity合格と別。
