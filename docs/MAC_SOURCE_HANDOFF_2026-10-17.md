# Mac向け復旧ソース引継ぎ

2026-10-17。GitHub origin/main ecffbdc230a0eee6c1d5d8e01dfa0d87953d8794 とローカルHEADのツリー一致を確認し、作業ツリーのソース・契約・資料・ライセンス・取得スクリプトを追加したスナップショット。

- 受渡しブランチ: handoff/mac-source-2026-10-17
- mainへ直接上書きせず、GitHub最新mainを親にする。
- ブラウザプロファイル、認証情報、実行キャッシュ、node_modules、ビルド成果物、取得済みモデル本体、個人写真は追加しない。
- モデル本体は scripts/fetch-suite-face-models.ps1 等の既存資料を参照。Mac向けの取得環境・実体の確認は別途必要。
- 本スナップショットはコードの受渡しであり、Appleビルド成功・実機動作・SDK接続完了を意味しない。今回ビルド・試験・配備は未実施。
- AppleとWebの彩度・小数位置cropは、既存Appleの見た目を維持してMac照合で仕上げる。docs/MAC_COLOR_CROP_HANDOFF_2026-10-13.md を参照。
- 体型補正はユーザー承認の2D方式。実寸・撮影距離の推定は不要。
- コスプレ素材作成の新規3ファイルは作業途中のコードも含む。独立画面のビルド組込み・保存名・人物写真への接続は未完了。写実素材ではない。これを公開済み機能と扱わない。
- 古い資料の『追加3モード』は8モードという計画表と元仕様5モードの差を未定義の残作業として数えたもの。追加3件の確定仕様はない。

## Macで新しいフォルダに取得

```sh
git clone --branch handoff/mac-source-2026-10-17 https://github.com/kobebuzzpromotion/SUITE.git SUITE-restored
cd SUITE-restored
git rev-parse HEAD
```

既存Mac作業フォルダの未コミット変更は上書きしない。まずこの別フォルダで受け取り、AGENTS.mdとdocsの正本を読んで続行する。メーカーSDK取得・申請後の接続は別工程。
