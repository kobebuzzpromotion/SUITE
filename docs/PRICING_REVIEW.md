# Pricing Baseline — 有力案と未確定の境界

正本候補原文: [PRICING_BASELINE_2026-10-03.md](PRICING_BASELINE_2026-10-03.md) 全28節。旧147節・固定6文書を置換しない。2026-10-03の事業設計上の有力案であり、公開価格・Apple契約条件・事業者採用の決定ではない。

| 項目 | 保存する案 | 状態 |
| --- | --- | --- |
| Mobile | 月1,980円税込、iPhone/iPad | 有力案・販売未設定 |
| 標準Cloud | 50GB、契約直後のCloud体験 | 有力案・購入検証後の自動付与は未実装 |
| 通常編集・Export | 原則枚数課金なし | 商品方針。全候補機能が実装済みという意味ではない |
| Workspace | 月1,980円、3席、追加約500円/席/月、無料期間なしの方向 | 税扱い・正式条件・実装前/公開前確認待ち |
| Storage追加 | 100/250/500GB、1/3/5/10TB、50TB optional/enterprise | 月額価格未確定。既存2TB候補も撤回しない |
| Annual | Mobile/Workspaceは10か月分程度案、Storageは別粗利評価 | 未確定 |
| Generative AI | 通常月額と分離。Consumable IAPは基本候補 | Apple取引検証・Credit台帳・購入導線は未実装。手動chargeを通常運用にしない |
| AI Engine | Auto/Fast/Quality/Premium、provider非固定 | 方式候補・単価未確定 |
| 料金・容量・料率 | Remote Product Catalog/Configから変更 | 現ledgerはconfig注入可能。本番config配送・課金連携は未接続 |

## 数学的試算と実測を分離

ユーザー指定の仮定で `1980 / 1.10 = 1800`、`1800 × (1 − 0.26) = 1332` 円。月1,000円を残す目標なら、その後の全コストに使える額は332円。これは計算の結果であって、Appleの実適用料率やCloud原価の検証結果ではない。

「50GBは100円台」は打合せ時仮定として原文に保存。Storage/DB/API/Backup/AI/決済/税/再試行/固定費配賦など未取得値を0円と置かない。USER=1の収益性Gateは**NOT_EVALUATED / BLOCK**。全変動原価を控除して利益が正、かつ目標約1,000円を達成できるか別々に判定する。未達ならPricing Gate FAIL。

標準50GBは製品構想。現開発サーバーが未認証・未課金設定時にquotaを付与しないfail-closed動作を、製品の「Cloud 0GB開始」仕様と読み替えない。本番は検証済み購入→Remote ConfigのIncluded Cloud付与を実装・試験してから提供する。

## 競合の打合せ値

Evoto Cloud 500GB US$119/年、1TB US$189/年、2TB US$269/年、Mobile約2,000円/月・約60Creditは**ユーザー提供の2026-10-03比較値**としてのみ保存。最新公式価格・地域・税・通貨・キャンペーンは未検証。50/100GBプラン不存在も現在の断定に使わない。

Evotoの通常Exportがすべて枚数課金とは整理しない。Credit Freeには対象platform/version/有料プラン条件があるため、最新の [公式Credit-Free説明](https://support.evoto.ai/how-can-i-use-credit-free-exports/) と監査v2/v3で照合する。

## 公開前の未合格Gate

- Apple最新手数料と適用契約、税、為替、Cloud/Backup/DB/API/AIの最新見積と実測を再取得。
- Storage/AIのリトライ・失敗・traffic・最低課金・保存期間・復旧コストを含めたUSER=1試算。
- 基本ソフト、Workspace/Seat、Cloud、AI Creditの収益/コスト区分と粗利。実請求と推計を混同しない。
- Evoto/Lightroom、市販Cloud、SSD/HDD/NASの同条件比較。比較前に「物理Storageより必ず安い」と広告しない。
- 検証済みApple Transactionからのidempotent付与/消費/返金/復旧、50GB自動付与、Storage超過/ダウングレード原本非削除。

実際の契約・購入・請求・本番資源作成・provider確定は行っていない。

## 再計算の入口（販売システムではない）

`scripts/pricing-model.mjs`は外部JSONを読むだけのoffline試算ツール。料金・付属容量・料率のdefaultはなく、本番serverもこのJSONを読み込まない。候補値は文書データ`PRICING_SCENARIO.json`に隔離した。未取得原価はnullで保存し、0円へ補完しない。

```powershell
node --test scripts/pricing-model.test.mjs
node scripts/pricing-model.mjs docs/PRICING_SCENARIO.json
```

9件の数値・失敗系テストPASS。候補の実行結果はNOT_EVALUATED / Pricing Gate BLOCK（意図したexit 2）。原価不明、Apple/税の適用根拠未検証、固定費配賦不明。四則演算テストのPASSは収益性のPASSではない。単位は通貨のminor unit、料率はbasis point、手数料の税抜/税込basisを明示する。純売上は切捨て・手数料は切上げの保守計算であり実精算方式を確定しない。

USER=1に限定し、変動原価控除後の利益と固定費配賦後の利益、目標達成を別表示。根拠が入力されても自動PASSにはせずREVIEW_REQUIREDまで。公開前には全根拠の適用・最新性・請求実測を人が確認する。正式料率、50GBの原価、Apple IAP/Subscription/返金連動、Remote Config供給、Cost dashboardは未実装または未確定のまま。
