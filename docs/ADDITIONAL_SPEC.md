SUITE 追加実装指示

既存のSUITE設計・確定済み仕様をすべて維持した上で、以下を正式仕様として追加する。

今回の追加仕様は、既存機能の削除・簡略化・置換を意味しない。

⸻

1. Tether Session Look

Tether撮影では、最初の基準写真でユーザーが作った仕上がりを Tether Session Look として保存する。

以後、その撮影セッション内で取り込まれる写真へ、同じ仕上がりの意図を自動適用する。

基本フロー：

Tether接続
↓
最初の基準写真を撮影
↓
色・顔・肌・体型等を調整
↓
「この仕上がりをこの撮影に適用」
↓
Tether Session Lookとして保存
↓
以後の撮影写真へ自動適用

1枚ごとに同じ編集操作を繰り返させない。

⸻

2. 撮影モード

撮影目的ごとに、色・人物補正・質感・出力方向を分けたモードを実装可能な構造とする。

初期モード：

* Wedding
* Night Work
* Fashion
* Beauty
* Custom

モードは単なるカラープリセットではなく、

Color + Face + Skin + Body + Texture + Output

をまとめた撮影ワークフローとして扱う。

⸻

3. Wedding Mode

自然さ・清潔感・階調維持を優先する。

主な方向：

* 自然な肌
* 明るさ
* 白ドレスの階調保護
* ハイライト保護
* 柔らかいトーン
* 過度な美肌処理を避ける
* 会場照明への対応
* 自然な顔・体型補正

⸻

4. Night Work Mode

人物レタッチ項目を最も細かく調整可能にする。

対象例：

* 肌色
* 毛穴
* ほうれい線
* 目の下
* 傷
* 傷跡
* 妊娠線
* 赤み
* 肌ムラ
* 顔明度
* 目元
* 歯
* お腹
* ウエスト
* バスト
* 腕
* 脚
* 全体シルエット

夜間照明、店舗照明、LED、ネオン等による肌色変化にも対応しやすくする。

色補正と人物レタッチは別々に調整可能とする。

⸻

5. Fashion Mode

衣装・素材・色再現・立体感を優先する。

対象例：

* 衣装色
* 生地質感
* コントラスト
* シャープネス
* 背景との色関係
* 肌と衣装の色分離
* カラーグレーディング
* シルエット調整

人物補正によって衣装や背景が不自然に歪まないこと。

⸻

6. Beauty Mode

顔・肌・質感を細かく調整できる構造とする。

対象例：

* 毛穴
* 肌テクスチャ
* 小さな肌荒れ
* シミ
* 肌ムラ
* 顔明度
* 目元
* ほうれい線
* 歯
* リップ周辺
* 局所カラー
* シャープネス
* 肌色

単純に肌を均一化するのではなく、必要な質感を残せること。

⸻

7. ローカル処理優先

顔・肌・体型等の主要人物レタッチは、可能な限りiPhone／iPad端末内で処理する。

目的：

* 外部AIサービスへの依存低減
* 外部サービス側の画像受付制限回避
* プライバシー向上
* 撮影現場での高速処理
* 通信待ち削減
* クラウドAIコスト削減
* オフライン対応

利用候補：

* Core ML
* Metal
* GPU
* On-device ML
* ローカル画像処理

外部クラウドAI送信を必須条件にしない。

⸻

8. Face / Skin / Body Retouch

人物補正は項目ごとに独立して制御可能にする。

Face

* Face Brightness
* Pore Reduction
* Skin Texture
* Under-Eye Adjustment
* Nasolabial Fold Adjustment
* Eye Adjustment
* Teeth Adjustment
* Local Face Contrast
* Hair Adjustment

Skin

* Skin Tone
* Skin Smoothness
* Blemish Reduction
* Stretch Mark Reduction
* Scar Reduction
* Scratch / Mark Reduction
* Uneven Skin Tone
* Local Redness
* Texture Correction

Body

* Waist
* Abdomen
* Bust
* Arm
* Leg
* Shoulder
* Body Line
* Silhouette
* Local Shape Adjustment

⸻

9. レタッチ強度

各補正はON/OFFだけでなく、強度を調整可能にする。

例：

* OFF
* LOW
* MEDIUM
* HIGH
* CUSTOM

モードごとに初期値を持ってよいが、ユーザーが変更可能であること。

設定値は非破壊編集データとして保存する。

⸻

10. 人物補正の自動追従

基準写真で作成した顔・肌・体型補正の固定座標を、そのまま後続写真へコピーしてはならない。

写真ごとに再解析する。

最低限考慮するもの：

* Face Detection
* Face Landmark
* Person Segmentation
* Body Landmark
* Skin Region
* Pose
* Orientation
* Scale

ユーザーが最初に決めた補正意図を、新しい人物位置・姿勢へ再マッピングする。

⸻

11. Body Retouchの背景保護

体型補正によって背景を不自然に歪ませない。

特に以下を保護する。

* 壁
* 柱
* ドア
* 家具
* タイル
* 建物
* その他直線構造

Person Segmentationと背景保護を組み合わせる。

⸻

12. Personal Color

パーソナルカラーを任意の補助機能として追加する。

候補：

* イエベ春 / Spring
* ブルベ夏 / Summer
* イエベ秋 / Autumn
* ブルベ冬 / Winter

これは人物を絶対的に分類する機能として扱わない。

ユーザーまたは撮影者が選択するColor Directionとして扱う。

自動推定を追加する場合も、結果を強制適用しない。

⸻

13. Personal Color適用範囲

主に以下へ影響させる。

* Skin Tone Direction
* White Balance Bias
* Tint
* Highlight Color
* Shadow Color
* Saturation Balance
* HSL
* Lip / Skin周辺Color
* Color Grading

顔形状・体型・美肌補正量をPersonal Colorによって勝手に変更しない。

⸻

14. Session Lookとの統合

撮影モード、Personal Color、人物補正、Global Colorを一つのSession Lookとして保存できること。

例：

**Night Work

* Summer
* Pore Reduction 20
* Skin Smoothness 25
* Waist -8
* Custom Tone Curve**

同じ組み合わせを後続写真へ自動適用可能にする。

⸻

15. Adaptive Apply

設定値を後続写真へ盲目的にコピーしない。

写真ごとに以下を考慮する。

* 露出
* White Balance
* 顔角度
* ポーズ
* 被写体サイズ
* 被写体距離
* 背景
* 複数人物
* 肌領域
* Body Pose

ただしAdaptive ApplyによってユーザーのLook自体を勝手に変更しない。

目的は、

同じ編集意図を異なる写真へ自然に再現すること。

⸻

16. 複数人物

複数人物が写る場合、一人の顔・肌・体型設定を無条件に全員へ適用しない。

人物単位で、

* Face
* Person
* Mask
* Adjustment
* Recipe

を保持可能にする。

⸻

17. Auto Apply

撮影セッション中は新規画像到着を検知し、自動処理する。

基本処理：

Capture
↓
Ingest
↓
RAW Original保存
↓
Embedded Preview表示
↓
Thumbnail / Preview生成
↓
Edit Proxy生成
↓
Face Detection
↓
Person Segmentation
↓
Body / Face Landmark解析
↓
Mode取得
↓
Personal Color取得
↓
Session Look適用
↓
画面表示更新

⸻

18. Progressive Display

RAW処理やアップロード完了まで画面を止めない。

利用可能な画像から先に表示する。

例：

Embedded Preview
↓
Thumbnail / Preview
↓
Edit Proxy

ユーザーが撮影後できるだけ早く、完成イメージに近い状態を確認できること。

⸻

19. 撮影途中のLook変更

撮影途中でSession Lookを変更可能にする。

変更後の写真から新しいLookを適用する。

過去写真を勝手に変更しない。

必要な場合のみ、

「これまでの写真にも適用」

を明示操作として用意する。

⸻

20. Auto Apply Control

最低限以下を制御可能にする。

* Auto Apply ON / OFF
* Global Color ON / OFF
* Face Retouch ON / OFF
* Skin Retouch ON / OFF
* Body Retouch ON / OFF
* Personal Color ON / OFF
* 個別写真除外
* 個別人物除外
* Session Look更新
* 過去写真への再適用

⸻

21. 完全非破壊

撮影モード、顔補正、肌補正、体型補正、Personal Color、Tether Auto Applyを含め、すべて非破壊編集とする。

RAW原本を書き換えない。

保存対象：

* RAW Original
* Proxy
* Mode
* Personal Color
* Session Look
* Face / Body Mask
* Photo-specific Adjustment
* Edit Recipe
* Revision

最終出力時のみ、

RAW Original + Session Look + 写真別Adjustment

からフル解像度生成する。

⸻

22. Tether QA

最低限以下をテストする。

1. Tether接続
2. 連続撮影
3. RAW受信
4. RAW保存
5. 即時Preview
6. Proxy生成
7. Mode適用
8. Session Look適用
9. Personal Color適用
10. Face Detection
11. Face Retouch追従
12. Skin Retouch追従
13. Body Retouch追従
14. 背景保護
15. 複数人物
16. Look変更
17. Auto Apply OFF / ON
18. ネットワーク切断
19. 再接続
20. アプリBackground / Resume
21. iPhone
22. iPad
23. RAW最終書き出し
24. ProxyとRAW Exportの整合
25. RAW原本非破壊

⸻

23. メインエージェント統括

メインエージェントは以下を設計正本として保持する。

* Tether
* Session Look
* Mode System
* Personal Color
* Local Retouch
* Face / Skin / Body
* RAW / Proxy
* Non-Destructive Editing
* Color Pipeline
* Sync
* Export

サイドエージェントへ機能単位で並列配布してよい。

ただし共通仕様を各エージェントが独自解釈して変更しない。

⸻

最終ゴール

SUITEでは、

最初の1枚で撮影者が理想の仕上がりを決める。
Wedding / Night Work / Fashion / Beauty等の目的を選択する。
必要に応じてPersonal Colorを設定する。
色・顔・肌・体型を調整する。
その状態をTether Session Lookとして固定する。
その後撮影される写真は、人物・顔・体型を毎回解析し直し、同じ編集意図を自動適用する。
主要人物レタッチは可能な限りiPhone・iPad端末内で処理する。
RAW原本は一切破壊しない。

SUITEの撮影体験を、

「撮る → 読み込む → 自動で仕上がる → 必要な部分だけ微調整 → RAW原本から最終出力」

として成立させること。
