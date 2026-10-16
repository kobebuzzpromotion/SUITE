# 生成サーバー接続のコードと未設定事項

コード追加のみ。サーバー起動、生成、課金、検査、ビルド、配備は実行していない。

## 接続

既存OIDC認証の個人アカウントに `/v1/generation/` を追加した。accountIDは認証済みtenant/subjectからサーバー側で導出。workspaceは権限・費用負担主体の接続まで拒否。任意の残高付与・精算を利用者HTTPへ公開しない。

`SUITE_GENERATION_CONFIG` に管理者が配置する設定JSONのパスを指定した場合だけ有効になる。`OPENAI_API_KEY` はサーバー環境変数でありクライアントへ返さない。既定モデル・金額・秘密鍵は含まない。

設定は `GenerationServerConfiguration` 型に従い、`prices`（provider/model/version/userCreditUnits/providerCurrency/providerDecimalPlaces/providerCostCeilingUnits）、`policies`（model/sizes/qualities）、`disclosureVersion`、`quoteLifetimeMilliseconds` を指定する。各モデルの許可size/quality全組合せに対する固定利用者credit料金として管理者が審査する。外部APIの現在料金を自動取得したという意味ではない。providerCostCeilingUnitsは設定上の見積上限であり、外部APIの請求を強制停止する仕組みではない。

## 順序

1. `POST quote`：写真ID/原本SHA/保存版と依頼本文SHAを固定し、管理料金表版から見積。
2. `POST reserve`：明示同意とcredit上限を照合して原子的に予約。
3. `POST jobs/:id/submit`：入力PNG/依頼本文SHAを照合、送信前に耐久状態を保存して初回だけ送信。
4. 成功PNGを原本・Recipeとは別の候補として耐久保存してから固定credit精算。
5. 結果不明は予約を保持。自動再送・未実行とみなす自動返金は禁止。保存済み候補がある再開では再送せず精算を再照合。
6. `GET jobs/:id` と `GET jobs/:id/output` で状態・候補を取得。採用は端末側の写真版/人物mask照合と明示確認を別途必要とする。

provider実費は返答から勝手に換算せず未観測ならnull。別の証拠付き管理メソッドで記録し、利用者creditを二度引かない。

## 公式APIの根拠

OpenAI Docsスキルで確認した [Images edit公式仕様](https://developers.openai.com/api/reference/resources/images/methods/edit) に基づく固定HTTPS宛先、画像data URL、単一PNG出力。モデルは利用者の指定がないため選定していない。実際の権限・対応モデル・価格設定は導入時に必要。

## 残りと制限

### 結果不明の運営照合コード

`generation-reconcile-cli.ts` と `generation-reconciliation.ts` を追加。ビルド後の管理CLI引数は `DB OPERATOR REVIEW.json PROOF [OUTPUT.png]`。今回は実行していない。DBファイルへの正規管理アクセスを持つ運営専用で、OPERATOR文字列だけで権限が付くものではない。利用者HTTPには公開しない。

REVIEWはGenerationReview型の全フィールドを指定し、実際に取得したprovider記録をPROOFで渡す。同job・入力SHA・本文SHA・モデル・料金版・証拠SHAを照合し、監査証拠と出力と精算を同一transactionで保存する。成功確定には実PNGも必須。確定失敗のみ予約を解放し、時間経過や証拠不在では解放しない。これは運営が実証拠を確認して使う経路であり、任意JSONをprovider署名として認証する仕組みではない。実費はこの操作で推測せず未観測のまま保持する。

- 現在はサーバーに登録済み写真と保存版が必要。ローカルUUIDとremoteUUIDを同一と決めつけない。
- 認証UI/資格情報供給、実料金設定、管理者の正規credit付与は未設定。設定のない状態で送信は開始しない。
- 画像APIの通信切断後に出力が保存されなかった場合は結果不明として管理照合が必要。自動で同じ依頼を再実行しない。
- PNG候補の自動人物保持をprovider品質で保証しない。既存の原本人合成・保護mask経路で採用する。
