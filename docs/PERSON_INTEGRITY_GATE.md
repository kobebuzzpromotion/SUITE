# 共通人物整合 Gate

状態: **DEFINED / BLOCK**。全人物補正の共通安全条件として正式化し、Face Brightness専用Gateにはしない。機械可読な12経路は [PERSON_INTEGRITY_PATHS.json](PERSON_INTEGRITY_PATHS.json)。メイン最新実測はWindows154 PASS（旧124＋人物13＋安全3＋共通Gate14）、Native112 NOT_RUN。14は12経路のデータ境界＋inventory/geometry identifierの2検査であり、Nativeの視覚成功・実人物同一性・Mobile Release PASSではない。[実測Evidence](evidence/face-brightness-2026-10-03/windows-03/regression.json)を新規凍結し旧結果を上書きしない。

## 1. 共通の拘束

全ての人物補正は、写真内の人物 UUID と geometry を `asset UUID + original SHA-256` に拘束しなければならない。人物 UUID は写真内の編集対象識別子であり、生体認証・別写真をまたぐ同一人物追跡ではない。顔検出の配列位置、表示順、ファイル名だけを人物識別に使わない。

現行 geometry は upright 画像の正規化顔矩形 `(x, y, width, height)`。Vision の左下原点であり、全体回転・Crop の前に処理する。現在の共有関数は有限値・範囲・正の面積、1〜64の重複しない UUID、重なりのない矩形を検査する。履歴間では全 target inventory の個数と UUID→矩形対応を維持する。明るさ値が変わっても UUID・矩形・asset・checksum を付け替えない。Portrait bridge は adjustment type と対応 engine/schema も検査する。

同一写真の保存済み geometry と新しい検出結果の照合は別検査である。現行 Apple candidate は顔数一致、保存・検出矩形の非重複、IoU による一意な一対一対応、実人物 instance mask を要求し、曖昧・欠落・対象重複は拒否する。これは source にある制約であり、難しい実写で正しい人物へ補正されたことを証明しない。共有 UUID/geometry 検証は detector・mask・補正レンダラーを実装しない。

拒否時は処理を止め、既存 Original、保存 Recipe、競合 branch、未保存 draft を保持する。別人物への fallback、画像全体への fallback、Proxy を Final に使う fallback、黙った UUID 再採番・geometry 上書き・履歴除去で拒否を成功に変えない。既存 CAS、競合保持、権限規則はこの Gate で緩和しない。

## 2. Source と試験の層

| 層 | 本書で確認した範囲 | 現状態 |
| --- | --- | --- |
| 共通 TS / Core source | UUID・geometry・asset・SHA inventory/binding/continuity の関数と Portrait bridge | SOURCE_IMPLEMENTED |
| 保存・再読込 source | repository/workspace の全 version、Core checkpoint の全 history、ProjectStore の inventory 消失拒否 | SOURCE_GUARD_PRESENT |
| Apple UI / render source | 選択無効化・再照合・Face Brightness candidate・Original 固定 export | SOURCE_CANDIDATE_PRESENT |
| Windows data boundary | TS/SQLite/CAS/任意バイトの実行 Evidence | 共通Gate14 PASS、全回帰154 PASS。Windowsデータ境界に限定 |
| Swift/Core/Apple 実行 | Apple toolchain での compile と試験実行 | NOT_RUN |
| Native 視覚・実人物・RAW | 人物選択、再起動、Undo/Redo、Proxy/Final の一致と誤人物非適用 | NOT_RUN |

ビルド成功や Windows のデータ境界成功は Native の操作・画素・RAW 成功ではない。構造試験、source レビュー、端末実行、視覚検証を別々に記録する。12経路の実行未確定を PASS にしない。

## 3. 必須12経路

各経路は正常系の拘束維持と異常系の拒否・保持を必要とする。source 接続があっても、当該 UI 操作が完成したことや実機で通ったことは意味しない。

| ID | 経路 | 必須確認 / 拒否条件 |
| --- | --- | --- |
| PGI01 | Save | 同じ asset/SHA・全 UUID/geometry inventory を保持して保存。付替え・消失を commit 前に拒否 |
| PGI02 | Reload | 読み込む全 version/history を再検証。current だけ正常な破損履歴も拒否し記録を保持 |
| PGI03 | Restart | 新 instance でも永続化した拘束を復元し再検証。メモリ上の参照だけで許可しない |
| PGI04 | Conflict Version | stale base の合法 branch は既存規則で保持。違う人物拘束の branch は保存前に拒否 |
| PGI05 | Conflict Resolution | 解決時も同じ shared commit 検証と CAS を通す。branch 選択を拘束検証の免除にしない |
| PGI06 | Undo | cursor を戻しても inventory を別人物へ再作成しない。hidden redo の記憶も保持 |
| PGI07 | Redo | 復帰 Recipe と全 history の同一 UUID/geometry を検証。別対象に古い値を適用しない |
| PGI08 | Hidden History | 非 current/非表示 version の破損を見逃さない。最後の人物 inventory を失う保存を拒否 |
| PGI09 | Asset Switch | 旧選択・reference を無効化。別 asset に旧 UUID/Recipe を適用せず、失敗後も旧選択を残さない |
| PGI10 | Person Reselect | 明示 UUID 選択と fresh proxy 検証。存在しない UUID・失敗・曖昧な対応では旧選択を無効化 |
| PGI11 | Recipe Copy | 人物拘束付き Recipe の別 asset/SHA への単純コピーを拒否。同写真でも geometry/UUID 差を拒否 |
| PGI12 | Export Fixed Recipe | portrait付き固定Planを保存checkpointのexact revision/current parameters/解決Original pathと照合し、最初の保存inventoryとUUID/geometryを検証。fresh Originalで再照合し、前後SHAとFinalを検証 |

Conflict Resolution の Native UI、汎用 Recipe Copy UI、全将来人物補正の adapter は、この表の記載だけでは実装済みにならない。Undo 後の全体編集で最後の人物 inventory を捨てる fork は ProjectStore の保存拒否になる。安全な解決 UI/永続 inventory 設計は未実装であり、拒否された draft を消して回避しない。

PGI12は自己記述Planだけを信頼しない。保存済checkpointを既存ProjectStoreから再読込し、portrait付きPlanとrevision/current parameters/解決Original URL、Asset/SHA、最初の人物inventoryを照合してから補正する。不一致や古いPlanではNO APPLY/拒否し、最新Recipeへ置換しない。保存revision更新後のhistorical Plan retryは現在拒否、耐久job snapshot再試行はNOT_IMPLEMENTED。Native実行はNOT_RUN。

## 4. 拒否 Evidence の必須欄

全拒否事例の Evidence に次の9欄を残す。これは試験/Evidence の規約であり、既存 Recipe envelope・DB・network API に9欄を追加する要求ではない。

| 欄 | 意味 |
| --- | --- |
| `asset_id` | 操作対象の asset UUID。取得不能なら明示 UNKNOWN |
| `person_id` | 対象人物 UUID。inventory 全体の拒否なら対象 UUID 群または明示 UNKNOWN と理由 |
| `recipe_version` | 固定した revision/version。schemaVersion と混同しない。必要なら schema/engine を追加欄へ記録 |
| `expected_geometry_identifier` | 正当な参照 inventory から得た geometry identifier/矩形。参照がない場合は NOT_AVAILABLE と理由 |
| `actual_geometry_identifier` | 拒否した入力・再検出 geometry の identifier/矩形。不在・曖昧・未検出を明示し推定で埋めない |
| `raw_checksum` | expected Original SHA と実測 actual SHA、実測状態。RAW でない入力も Original バイトを指す。未読取は NOT_MEASURED |
| `reason` | 実際の拒否 code と短い意味。別の成功で拒否を覆わない |
| `timestamp` | 実際の実行時刻を UTC ISO-8601 で記録。source レビュー日時を実行時刻にしない |
| `test_id` | 実行 harness の試験 ID。PGI 経路 ID と紐付けるが、経路定義を実行済み試験に数えない |

TS の現行診断 `geometryIdentifier` は `face-geometry-v1-sha256:` に続けて `JSON.stringify(["face-geometry-v1", x, y, width, height])` の SHA-256 を付ける。診断表示用であり、asset/SHA/UUID 拘束や数値 geometry 比較の代わりではない。Swift の共有 Gate は矩形を直接比較しており、この診断文字列生成は接続されていない。Native Evidence は実際の矩形と表現方式を明記し、未生成の TS identifier が出たことにしない。

保存/SQLite再openの拒否12例を [PERSON_INTEGRITY_DENIALS.json](evidence/face-brightness-2026-10-03/windows-03/PERSON_INTEGRITY_DENIALS.json) に実出力し、9必須欄・拒否理由・元行/非画像原本bytesの保持を確認する。`recipe_version=2`は保存済revisionで、wire/portrait schemaVersionは別欄。Native全経路の拒否Evidence collectorは未接続で、拒否定義だけを出力成功にしない。fixture checksum、任意バイト SHA、メタデータの SHA 一致を実 RAW の画素処理・本人照合の証拠にしない。

## 5. 適用範囲と未実装

Face Brightness は既存 Portrait extension に接続した source candidate のみ。Skin / Eyes / Contacts / FaceShape / Makeup / Hair / Body / PersonBatch は **NOT_IMPLEMENTED**。共通 Gate の存在はこれらの controls、mask、処理・保存連鎖、人物一括コピーの完成を意味しない。将来の adapter も全12経路の asset/SHA/UUID/geometry 拘束と拒否 Evidence を満たさなければ有効化しない。異なる geometry 種別を顔矩形へ偽装しない。新しい geometry/engine 契約は別途明示レビューを要する。

## 6. Original Recovery との境界

[ORIGINAL_RECOVERY_DESIGN.md](ORIGINAL_RECOVERY_DESIGN.md) の将来 Recovery chain は DESIGN_DEFINED / NOT_IMPLEMENTED のまま。今回の「保持設計 IMPLEMENTED」は、既存 copy 後の失敗で Original を保持する source の限定範囲を指す。「禁止 IMPLEMENTED」は Original 上書き・未確認削除・Proxy Final・黙った修復を禁じる保持方針と既存 source guard の限定範囲を指し、全条件の Native 実測済みを意味しない。

| Recovery 要素 | 実装状態 | 実行状態 |
| --- | --- | --- |
| Original 保持設計 / copy 後の失敗でも既存 Original を消さない source | IMPLEMENTED（既存保持範囲のみ） | Native NOT_RUN |
| Original/未同期 Recipe/履歴の削除・上書き、Proxy Final、推定 Cloud Safe の禁止 | IMPLEMENTED（規範/既存 guard、全運用自動化ではない） | Native NOT_RUN |
| startup orphan 検出・durable import journal | NOT_IMPLEMENTED | NOT_RUN |
| asset 候補照合・登録済み/未登録/部分 copy の判別 | NOT_IMPLEMENTED | NOT_RUN |
| Recovery 用 checksum 再検証と再登録 | NOT_IMPLEMENTED | NOT_RUN |
| 明示的 Recovery UI | NOT_IMPLEMENTED | NOT_RUN |
| Recovery時Recipe関連付け（asset/SHA/人物整合を再検証） | NOT_IMPLEMENTED | NOT_RUN |
| Recovery 後 Cloud Safe 再評価 | NOT_IMPLEMENTED | NOT_RUN |

通常 import/export の checksum 検査があることと、孤立 Original の Recovery 再登録処理があることは別である。未同期 Original を安全措置の代わりに自動削除しない。保持されたファイルの存在だけで Cloud Safe としない。

## 7. Source と最終 Evidence の参照

- Shared TS: [person-geometry.ts](../apps/backend/src/person-geometry.ts)、[portrait-recipe.ts](../apps/backend/src/portrait-recipe.ts)、[photo-policy.ts](../apps/backend/src/photo-policy.ts)。
- Backend 全 version/CAS: [repository.ts](../apps/backend/src/repository.ts)、[workspace.ts](../apps/backend/src/workspace.ts)。
- Shared Core: [PersonGeometryIntegrity.swift](../packages/SuiteCore/Sources/SuiteCore/PersonGeometryIntegrity.swift)、[PortraitRecipe.swift](../packages/SuiteCore/Sources/SuiteCore/PortraitRecipe.swift)、[Recipe.swift](../packages/SuiteCore/Sources/SuiteCore/Recipe.swift)、[Project.swift](../packages/SuiteCore/Sources/SuiteCore/Project.swift)、[ProjectStore.swift](../packages/SuiteCore/Sources/SuiteCore/ProjectStore.swift)。
- Apple candidate: [EditorModel.swift](../apps/apple/Suite/EditorModel.swift)、[PortraitPipeline.swift](../apps/apple/Suite/Services/PortraitPipeline.swift)、[PhotoPipeline.swift](../apps/apple/Suite/Services/PhotoPipeline.swift)。
- Independent review/Native QA: [PORTRAIT_REVIEW.md](PORTRAIT_REVIEW.md)、[FACE_BRIGHTNESS_NATIVE_QA.md](FACE_BRIGHTNESS_NATIVE_QA.md)。これらの過去件数を新 PGI 件数へ転記しない。
- FinalEvidence: [全件・時刻・Build](evidence/face-brightness-2026-10-03/windows-03/RUN_METADATA.json)、[12経路・互換性・凍結検査](evidence/face-brightness-2026-10-03/windows-03/PERSON_INTEGRATION_CHECK.json)、[最終報告](FACE_BRIGHTNESS_INTEGRATION.md)。Apple実行・Native視覚・実RAWはNOT_RUNを維持する。

解除は対応する実装・全12経路の正負実行 Evidence・必要な Native 視覚と実人物/Original 検証がそろった範囲だけに限定する。現在の Gate は BLOCK のまま。未実装の8補正や未実行 platform に結果を継承しない。
