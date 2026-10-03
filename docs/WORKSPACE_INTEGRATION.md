# Workspace / Team / Cloud / Billing — 統合台帳

2026-10-03 JST。追加正本はWORKSPACE_SPEC_PART_1/2/3.md、全45節。旧147節・固定6文書・Crop16節は置換しない。Mobile ReleaseはBLOCK。

## 変更前の理由と影響範囲

ユーザーが正式追加したWorkspace権限・共同編集・容量課金の安全境界を、既存保存層の前段へ追加する。旧個人tenant APIを共用してrole確認を飛ばす設計にはしない。

- 追加SQLiteメタデータはworkspace/member/invite/project/asset参照/version/preset/selection/gallery/audit/quota/entitlement。RAWバイトは格納しない。旧asset/recipe schemaとRecipeDocument v1は維持。
- `/v1/workspaces/...`に追加業務を隔離。サーバーが検証したsubjectとlive membershipを毎回使用し、bodyのworkspace・user・role・email自己申告を権限根拠にしない。
- 旧`/v1/assets`をmanaged Workspaceの迂回入口にしない。旧個人tenant動作は維持。WorkspaceのIDからAsset IDを推測しても他workspaceは拒否。
- Email招待は期限・取消・本人の検証済email一致を要件とする。メール配送サービスは選定せず、送信済みと表示しない。
- 共同Recipeは既存plain JSONをversionに内包。CAS競合時はcurrentを上書きせず、別versionと差分を保存。Preset適用時の値はRecipeへ固定。
- 同一Workspaceの同一Originalをserver登録時に再利用し、メンバー別物理コピーを作らない。別Workspace間の存在推測を許すglobal dedupはしない。
- 容量予約・使用量とimmutable object保存は役割を分離。quota/解約/downgradeから物理削除を呼ばない。Trashは容量から勝手に除外しない。課金価格/Apple課金方式/Cloud providerは未確定。
- Provider契約は既存StorageProvider / ObjectStorageProviderを保持。local filesystem検証は実Cloud耐久性・本番Cloud Safe・料金接続のPASSではない。
- Workspace短期アクセスgrantを実装する場合も、取得時のBearer認証・subject/workspace/object/用途/期限の再照合を必須とする。実provider署名URLの品質検証とは区別する。

優先順はserver境界→直接Asset拒否→member revoke→role拒否→共同Project/Recipe→競合保持→Preset→quota→超過/downgrade非削除→soft delete/recovery→集計→audit→既存全回帰。Webは追加しない。

以下の実行結果と成熟度は最終回帰後に固定する。未接続を環境待ちのみで隠さない。

## 最終統合

親実行: Workspace repository16＋HTTP15＋Storage12＋gateway grant2＝45 PASS / 0 FAIL / 0 SKIP。全体124 PASS、旧34・Crop36を今回も含む。実RAW/iOS/本番Cloudは含めない。追加要件WS-01〜45への対応はWORKSPACE_REQUIREMENTS.jsonと最新regression.jsonのworkspaceRequirements。1試験=1要件完了という集計ではない。

Role表・Recipe競合/Version/Preset固定値はWORKSPACE_BACKEND.md、DB/Object分離・容量/Team billing構造・実測と論理容量の区別はSTORAGE_PROVIDER_COMPARISON.md。使用量は100GB〜20TBの論理値で検証し、50TB候補の実投入は行っていない。Cloud-firstは設計、実providerは未接続。

HTTPはbodyの自己申告権限ではなく署名JWT subject/verifiedEmail→live membership。Original転送は各chunkでも失効を確認。認証必須gateway opaque grantは実providerの署名URLではない。Trashの跨DB更新はatomic化せず、削除済対象の再試行とDB再open後のledger分類収束を確認。[Astra指摘4件と修正](ASTRA_REVIEW.md)。

WorkspaceBrowser入口とHTTPS clientはコードあり未検証。Shared Project metadata閲覧をRAW→Proxy→編集→Recipe→復元→Cloud Safe→Finalの実機完走としない。認証注入、画像同期、Editor引渡し、競合解決UI、購入/50GB付与、同RAWの別Project参照は開発残。詳しくはWORKSPACE_MOBILE.md。現defaultの未接続/未付与は偽データを使わないfail-closedであり、商品としてCloud0GBを採用したわけではない。

追加したAPIは今回明示承認されたWorkspace業務の隔離経路のみ。既存6領域contract、StorageProvider interface、固定Recipe v1を置換していない。契約・料金・本番接続は未確定、Web実装なし、Mobile Release BLOCK。
