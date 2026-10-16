# EV3-0921 Perfect Shot — completion audit

2026-10-04。元IDは `SUITE_feature_types_2026-10-03.txt` および `docs/EVOTO_AUDIT/evoto-deep-audit.json` と照合した。`EV3-0921` は Perfect Shot 全体の同義語ではなく **Auto Fix**。同じ5操作群に `EV3-0922` Custom Fix、`0923` 同一人物の顔交換、`0924` 現写真の前後7枚（計14候補）探索、`0925` 新しいTSQコピーがある。[Evoto公式 Culling & Organization](https://support.evoto.ai/smart-culling/) の Faces > Perfect Shot 節は、同一撮影の複数写真から各人の良い表情を選んで一枚の集合写真を生成し、Confirmで新しいTSQコピーを同じフォルダーへ保存すると説明する。処理モデル・本人同意の詳細・品質閾値はここからは確定できない。

| 元の下位操作 | 現SUITEの関連機能と境界 | 判定 |
| --- | --- | --- |
| Auto Fixで不適切な表情の顔を自動識別・交換 | `smart-culling-project.mjs` は本人が付ける選択/Stars/Flags/Tags/Segmentsの純粋状態。Node Workspaceには手動マーク用SQLite/HTTPがあるが、現公開Trial/Cloud Editorへ製品mountなし。顔検出は`processing/faces.mjs`の**現在の写真**のFaceLandmarkerで、品質・眼・表情採点や別写真との本人照合をしない。 | **NOT_IMPLEMENTED**。手動選択や顔検出をAuto Fixと同一視しない。 |
| Custom Fixで各顔の候補表情をプレビュー・明示選択 | 現Editorの人物操作は、現在Asset内の検証済み顔輪郭に対するFace Brightness。候補写真の顔の一覧/比較、コピー元の選択、境界と同意、Undo可能な顔交換Recipeはない。 | **NOT_IMPLEMENTED**。 |
| 同一人物だけを交換し前後7枚から探す | Project順序・候補窓、各OriginalのAsset ID/SHA、同一人物照合の精度/根拠、複数顔の入替検証、隣接写真の権限Gateがない。既存`smart-culling-project`のassetIdsは明示Projectリストであり、写真の撮影順や顔IDを含まない。 | **NOT_IMPLEMENTED**。手動マークの並びを14枚探索と見なさない。 |
| Confirmで新TSQコピーを同フォルダーへ保存 | `EditorSession.exportFinal` は保存済みRecipe/Original SHAとexport権限を固定し、JPEG/PNG/TIFF Blobを生成する別経路。`processing/encode.mjs` は`tsq`を拒否。Trial/CloudにもPerfect Shot新コピー/同フォルダーの保存契約なし。 | **NOT_IMPLEMENTED**。元Original保護はあるが、新TSQ生成の証拠ではない。 |

新規 `apps/web/tests/perfect-shot-completion-audit.test.mjs` は元5 IDの帰属、手動Cullingが選択markだけを返すこと、既存Portraitレンダリングが単写真の補正でTSQが拒否されることを合成3件で確認した。これは「Perfect Shot非対応」の**境界試験**であり、元製品画素同等性やAI人物精度の試験ではない。現Cullingの[別監査](SMART_CULLING_COMPLETION_AUDIT.md)にあるNode Workspaceの手動保存も公開製品・AI自動選別の完成ではない。

## 安全な次の小経路

最初に画素生成をしない**候補窓と出典の契約**を作る。認証済みProject順序と明示した対象Assetから前後7枚だけを選び、各候補の同一Project・閲覧権限・Original SHA・版を再照合する純粋プランに限る。撮影順とリスト順を混同せず、本人確認・同一人物照合のない段階では顔の交換ボタンや生成済みTSQを出さない。次段では本人の同意、同一人物照合/誤認拒否、Preview比較とConfirm、元Original不変の新コピー保存・取消、実RAW/集合写真QAを別Gateで設計する。

**EV3-0921=NOT_COMPLETE**。実RAW・実機・公開Cloud・顔ID精度・元製品画素同等性は未確認で、44件の完了数は増やさない。
