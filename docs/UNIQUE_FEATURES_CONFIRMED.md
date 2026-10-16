# 一次独立37表示項目の元ID照合

この表は、先行する一次仕分けで「内容が明確に別」とされた37表示項目について、`SUITE_feature_types_2026-10-03.txt` に記載された元IDと表示名を照合したもの。追加の二次7件は [追補監査](UNIQUE_MISSING_SEVEN_AUDIT.md) で名称・IDを回収した。元ファイルは137候補（Evoto 119、Lightroom 18）の一覧であり、**ID・名称・当時の接続表示の出典**である。元ファイル単独では機能の意味的な独立性や実装完了を証明しない。37件の一次分類の個別判定Evidenceはこの文書に再構成・追加していない。

## 色・光学（9件）

| 元ID | 出典 | 元の表示名 |
| --- | --- | --- |
| LR-16 | Lightroom | HDR Optimization |
| LR-02 | Lightroom | Histogram and clipping |
| EV3-0586 | Evoto | Color Calibration |
| EV3-0560 | Evoto | Mobile Glow Effect |
| EV3-0595 | Evoto | Personalized AI Look |
| EV3-0501 | Evoto | Selective Color |
| EV3-0528 | Evoto | Grain |
| EV3-0701 | Evoto | Manual canvas Expand |
| EV3-0570 | Evoto | Mobile Post-Crop Vignetting |

## 人物・マスク（14件）

| 元ID | 出典 | 元の表示名 |
| --- | --- | --- |
| EV3-0313 | Evoto | Clothing adjustments |
| EV3-0243 | Evoto | Facial Expression |
| EV3-0169 | Evoto | Facial Reshape / Eyebrows |
| EV3-0145 | Evoto | Facial Reshape / Head Pose |
| EV3-0185 | Evoto | Facial Reshape / Nose |
| EV3-0232 | Evoto | Hands |
| EV3-0001 | Evoto | Makeup / Highlight |
| EV3-0030 | Evoto | Makeup components / Blush |
| EV3-0027 | Evoto | Makeup components / Contacts |
| EV3-0023 | Evoto | Makeup components / Eyelashes |
| EV3-0025 | Evoto | Makeup components / Eyeliner |
| EV3-0021 | Evoto | Makeup components / Eyeshadow |
| EV3-0037 | Evoto | Makeup components / Face Decorations |
| EV3-0235 | Evoto | Teeth |

## 背景・AI（10件）

| 元ID | 出典 | 元の表示名 |
| --- | --- | --- |
| EV3-0396 | Evoto | Add Shadow |
| EV3-0342 | Evoto | Black & White Edge Removal |
| EV3-0394 | Evoto | Original Shadow |
| EV3-0934 | Evoto | Batch Edit |
| EV3-1041 | Evoto | Body Hair Removal |
| EV3-0993 | Evoto | Clothing Moiré Removal |
| EV3-0938 | Evoto | Generative Expand |
| EV3-1029 | Evoto | Grass Fill |
| EV3-1046 | Evoto | Liquify Background Repair |
| EV3-1073 | Evoto | Mobile Motion Blur |

## ワークフロー・出力（4件）

| 元ID | 出典 | 元の表示名 |
| --- | --- | --- |
| EV3-0764 | Evoto | Desktop Export naming |
| EV3-0757 | Evoto | Desktop Export size |
| EV3-0921 | Evoto | Perfect Shot |
| EV3-0894 | Evoto | Smart Culling |

## 照合の限界

- 表は **9 + 14 + 10 + 4 = 37件**。名前や元IDを参照一覧に照合したもので、現在のUI・保存・Final経路のPASS数ではない。元一覧の「未接続」は作成時点の表示であり、現時点の実装状態には転用しない。
- 後続の深掘りで「別」とされた追加7件の名称・元IDは会話原記録から回収して追補監査へ記載した。この表自体は一次37件の一覧であり、追加7件の下位操作・意味的独立性を証明するものではない。
- `Mobile Effects` は判定保留のままで、この37件にも追加7件にも推測で含めない。類似名称・共通処理と固有操作の最終的な統合可否は別判定とする。
