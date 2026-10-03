# SUITE Web / Sites 継続ハンドオフ（2026-10-03 21:05 JST）

この文書は既存 `HANDOFF.md` と凍結Evidenceを置換しない追加記録。正本仕様147節・固定6文書・NON-DESTRUCTIVE・RAW原本不変・人物UUID→顔座標Gate・Recipe v1外形・DB表・既存APIは変更していない。今回の明示指示に従いWeb招待試用を優先するが、Web Beta／Feature Parity／Mobile ReleaseのGateは未合格。

## Site / 配備

- 対象は既存Site ID `appgprj_6a9fbab0e50c8191be942b254c0e5af8`、URL `https://eclat-genseki-demo.bals-enter.chatgpt.site/`、表示名SUITE。最後に読めた状態はversion 33、オーナー限定、旧本文。SUITE UI配備は未実施。
- Sites公式ソース接続用の対話資格情報を取得したが、公式workflowのGit接続が実行環境のネットワーク制限で失敗した。ネットワーク許可後はこのホストの非空PTY入力が権限ポリシーで拒否された。資格情報をファイル・ソース・引数・ログへ移して回避していない。
- Site、他Site、D1、R2、招待者、課金、メール、一般公開には変更を加えていない。対象Siteのsource接続・D1/R2実binding・dispatch認証・非公開Deploy・Owner操作QAはすべて `NOT_RUN / BLOCKED_ENVIRONMENT`。
- 非Deploy候補は `C:\Users\user\Documents\Codex\2026-10-03\SUITE_SITE_PREP_2026-10-03_2100\PREP_EVIDENCE.json`。source 147 files / SHA256 `b04fe5d9adf652e3fb12326afc93263ac144acc2d5c681cf9d52fd1cd4823fc3`、artifact 35 files / SHA256 `ca8fcf899c348de0e1de4c21158075611255df2961ce05a7b20df88de8ad978e`。`NON_DEPLOYABLE_CANDIDATE` であり、公式checkout/project_id/本番bindingの代用品ではない。`scripts/prepare-sites-checkout.mjs` は新規外部ディレクトリのみを許可し、ローカルplaceholderを確認して停止する。

## 今回ローカルで実装・検証した範囲

- 作者プリセットの旧3値（露出・コントラスト・彩度）は無変更で読込可能。Webの既存実画素処理へ接続済み `postDecodeAdjustments`（局所トーン、自然な彩度、HSL、明瞭度、テクスチャ、シャープ）だけを任意追加フィールドとして、下書き→提出→採用版snapshot→適用へ通した。旧Preset適用では写真の既存postDecode枝を保持し、新Preset適用ではその枝を明示的に置換する。写真固有Crop・回転・人物・Export・未知値はPreset化を拒否。採用版source CAS/checksum/作者分離は旧処理を再利用。テストは人工画素／SQLite-interfaceのみ。
- Web EditorのCrop固定比率を既存カタログの9種類へ接続。中心Crop、90°回転、保存／再読込、Undo/Redo、固定Recipe Finalの人工画素試験を追加。Free/Custom矩形編集・印刷実寸resizeは未実装のまま明示。
- Sites候補のソース／Worker／画面／migration整合とSHAを非Deployで点検するツールを追加。実SiteのD1/R2接続や本番認証の検証ではない。

## 最新実行結果とEvidence

- Build ID: `uncommitted-source-sha256:07e2740cec45cc8d0eed5ef263c249d34b0bcd0687f6c413e71e8803c5c0c8ab`。Commit SHA = `NOT_AVAILABLE`（repository has no commit）。実行環境はWindows_NT / Node v24.19.0。
- Web 235 PASS / 0 FAIL / 0 SKIP（旧221の個別名照合で欠落・非PASS 0、新Portable Preset 4、新Crop 10）。外部隔離作者adapter 18 PASS / 0 FAIL / 0 SKIP。Build: TypeScript / Web / Sites Workerすべて成功。ただしSites Worker build成功はDeployや本番D1/R2の証明ではない。個別Test ID、時刻、Source Hash、ログは `docs/evidence/web-2026-10-03/sites-preset-crop-02/RUN_METADATA.json` と同ディレクトリの `web-tests.json` / `external-author-tests.json`。
- Windows側 159 PASS / 0 FAIL / 0 SKIP = 旧154 PASS + 新Sitesローカル準備5 PASS。Native 112 NOT_RUN。RAW 100/500/1000は `BLOCKED_EXTERNAL_ENVIRONMENT`。個別Test ID、147節trace、Source Hash、命令・結果は `docs/evidence/web-2026-10-03/sites-preset-crop-01/WINDOWS_REGRESSION.json`。Web旧Evidenceは上書きしていない。
- `npm run check:spec` PASS（147節・固定6文書hash不変）。テスト時点の実RAW指定領域 `C:\Users\user\Documents\Codex\2026-10-03\SUITE_TEST_DATA\RAW` は存在したがfile count 0。ダミーRAWを実RAWとして扱っていない。

## 変更ファイルと実行コマンド

- 製品: `apps/web/src/preset-author/preset-author-contract.mjs`、`apps/web/preset-policy.mjs`、`apps/web/src/session.mjs`、`apps/web/src/author-ui.mjs`、`apps/web/src/editor-ui.mjs`。
- 新試験: `apps/web/tests/portable-postdecode-preset.test.mjs`（4件）、`apps/web/tests/crop-fixed-ratios.test.mjs`（10件）、`scripts/tests/prepare-sites-checkout.test.mjs`（5件）。
- 準備・回帰: `scripts/prepare-sites-checkout.mjs`、`scripts/final-regression.mjs`。文書: `docs/CHANGE_NOTICE.md`、`docs/OWNERSHIP.md`、この追加ハンドオフ。新規Evidenceは上記 `sites-preset-crop-01` / `sites-preset-crop-02`。旧Evidenceは不変。
- 実行: `node scripts/run-web-trial-evidence.mjs docs/evidence/web-2026-10-03/sites-preset-crop-02`、`node scripts/final-regression.mjs --report docs/evidence/web-2026-10-03/sites-preset-crop-01/WINDOWS_REGRESSION.json`、`npm run check:spec`、`node --test scripts/tests/prepare-sites-checkout.test.mjs`、`node scripts/prepare-sites-checkout.mjs --output C:\Users\user\Documents\Codex\2026-10-03\SUITE_SITE_PREP_2026-10-03_2100`。最後の準備CLIは意図的に非DeployのBLOCK状態を返す。

## 未実装／実装済み未検証／環境待ち

- 実RAW Import→Proxy→Recipe→Final、実画像のProxy/Final一致、Face Brightnessの対象人物のみ変化・背景非変化は `NOT_RUN`。Face Brightnessは引き続き `IMPLEMENTED_BUT_NOT_VISUALLY_VERIFIED`。実写真顔解析はPrivacy Gateで停止中。
- Webの最終Exportは現状JPEG/PNG・8-bit sRGBのみ。TIFF、Adobe RGB、16-bit、指定印刷dpiに応じた実寸resize／大判、Batch Exportは未実装。RAW段階WB・色温度・Tint・ハイライト復元、カーブ、ノイズ軽減、レンズ補正、肌等の人物処理も未実装。8-bit sRGB後段の調整で失われたRAW階調を復元できるとは表示しない。
- 招待作者の下書き／提出／採用と共通Presetはローカル・Mock D1/R2試験済みだが、本番Site未接続。Personal/Workspace Presetの既存適用は写真固有Recipe全体置換であり、今回の作者portable適用と同等とは言わない。Community公開・ランキング・通報は未実装。
- Cloud ProxyのR2保存／別端末取得、保存済み履歴の前Version復元UI、Workspace表示・Role操作、Feedback registry、本番Storage usage／Recovery、外部作者URL QAは未実装または未接続。Owner Only中の外部作者拒否は意図どおりで、`EXTERNAL_AUTHOR_PRODUCTION_URL_QA=NOT_RUN / OWNER_ONLY_ACCESS`。
- Apple Native 112、Mac/Xcode、iPhone、iPadは独立 `NOT_RUN`。実RAW 100/500/1000および本番Cloud/Auth/Sync/Billing、Feature Parity、Mobile ReleaseはBLOCK維持。

## 重大な設計整合残件

Web/backendが使用する `processingOrder=postDecodeAdjustments` は、現行 `contracts/recipe-v1.schema.json` とSwift `RAWAdjustment` enumに未登録。Appleは未知値を黙って適用せず拒否するが、現時点で「Webの新調整Recipeが全Platformで同じように読める」とは主張できない。固定6文書やRecipe v1外形をこの工程で勝手に変えず、共有契約の明示的な整合判断・Mac側実装・実機検証を後続Gateとする。RAW段階WBはLibRawのmanual倍率とcamera WB・色行列の関係を別途実RAWで検証するまで見せかけのKelvin調整を導入しない。

## 次に行う最短手順

1. 公式Sites workflowで対話資格情報入力が可能なホストを用意し、同じSite IDだけを開く。新規Site作成・別Site変更なし。候補Evidenceは参照用で、公式checkoutでソースを再検証してから接続する。
2. SUITE sourceとWeb/Worker Buildを公式checkoutで接続。実D1 migration／binding、R2 binding、dispatch認証と招待認可、設定上限を正式確認。Owner Onlyのまま非公開Deployし、Site URLで旧本文が置換されたことと主要導線を実操作で確認。未確認時はDeploy成功扱いにしない。
3. 許諾済み実カメラRAWをcheckout外指定領域へ投入。実RAW1枚→複数メーカー→人物1/2/3人の順に、原本SHA不変、Proxy/Final、保存復元、Export画質を確認。顔解析Privacy Gateの許可までは人物処理停止を維持。
4. Webの残機能（TIFF/印刷/Workspace/Cloud Proxy/Recovery/Feedback/Community等）を独立実装・試験。Owner内部QA通過後に初めてControlled Tester Accessを別Gateとして審査する。一般公開・課金・メール送信は許可されていない。
