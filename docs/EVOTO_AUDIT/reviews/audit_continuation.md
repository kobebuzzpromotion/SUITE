# Audit continuation — additive partial checkpoint

Status: PARTIAL_ADDITIVE_INTERPRETATION_CHECKPOINT。新しい解釈・構造検証だけを保存し、既存 Evidence、API/schema、実装、要件、台帳を変更していません。Face Brightness 実装と独立試験の開始を監査全了の条件にしません。

## Exact 458 denominator: before → after

Before は frozen Registry-01、After は frozen workflow_normalization の未適用解釈。機能削除や新規機能数ではありません。

| Metric | Before | After |
| --- | ---: | ---: |
| Source WORKFLOW observations | 458 | 458 |
| Distinct observation IDs / candidate canonical IDs | 458 / 458 | 458 / 458 |
| Assigned observations | 458 | 458 |
| Workflow memberships (overlap allowed) | 1,119 | 850 |
| Team membership rows | 82 | 7 |
| Cloud membership rows | 59 | 34 |

42 same-article source-order chains と256 workflow projections は文書順参照のみ。全実行連鎖は NOT_VERIFIED、Windows/macOS/Mobile/Camera/RAW の物理検証は NOT_RUN。JSON に458キー全件の source ID/locator → observation ID → candidate canonical ID、および前後の所属を保存しました。

Team75除外候補は permission/記事名による過剰帰属など。Cloud31除外・6明示 cloud 文脈追加候補は、単なる sync と Cloud を分離した結果です。458母数外の camera/OS permission → Team 誤帰属11件も別枠に保存し、458集計へ混入させていません。

## Received checkpoints and independent checks

| Checkpoint | Structural result | Semantic/current limitation |
| --- | --- | --- |
| Web SAME_OPERATION | 264 groups;725 memberships=725 distinct keys (Web380+existing345);missing/duplicate/mismatch0 | 4 targeted Desktop name-axis groups primary-text checked;remaining260 full primary identity reviews incomplete |
| Web RELATED | 141 groups;references valid;no merge allowed | All141 are not fully independently primary-text reviewed;reason prose cannot override RELATED |
| Web dispositions | 1,535 keys preserved once;reference errors0 | 116 unresolved +5 advertised identities retained UNKNOWN/unconfirmed |
| Credit overlays | 163/163 exact selection/raw rule/source IDs/locator/raw platforms;duplicate/mismatch0 | Current applicability unresolved for163;not a full independent primary review of163 |
| Parity checkpoint | RC01/RC02 and reported scoped PV results retained | Tool19PASS/0FAIL are received results, not rerun or native execution proof |

264 group/control-label scope screens are completed, but that is not equivalent to rereading every underlying primary article. All incomplete candidates retain explicit review status in JSON. Native/Web availability、本人別・batch・credit・processing・pixel equivalence は同一名称の alias から継承しません。

## Unknown accounting

| Measure | Count / status |
| --- | --- |
| 458 workflow source platform token empty | 0 (does not mean all axes known) |
| Workflow rows with ≥1 undocumented platform axis | 458 |
| Undocumented cells in Registry-01 five axes Windows/macOS/iPhone/iPad/Android | 1,638 |
| Source consumption rules unknown / known within458 | 451 / 7 |
| Current credit / plan / region applicability unknown within458 | 458 / 458 / 458 |
| Processing method unknown within458 | 458 |
| Credit163 source consumption classifications | 36NO_CREDIT /18CREDIT_REQUIRED /94CONDITIONAL /15UNKNOWN |
| Credit163 current applicability unresolved | 163 |
| Credit163 literal source plan / region condition UNKNOWN | 27 / 136 |
| Credit163 purchase / redeemable-device scope UNKNOWN | 163 / 163 |
| Source semantic duplicate confirmed pairs | 1 (Spot Healing Brush Tool) |
| New unique feature count / final unique photo-feature count | UNKNOWN / UNKNOWN |

Source-known NO_CREDIT はその event/条件だけ。Current account/plan/region/platform/effective-date のUNKNOWNとは別層です。最新のゼロUNKNOWN目標は未達で、未記載を無料・local処理・不在・全platform同等に変換しません。

## Material findings

- Registry-01 は6,136 source observations／5,360 candidate canonical entities（Video165含む）。5,360も非Videoの5,195も exhaustive unique photo-feature count ではありません。
- S965 の iPad wired/wireless tether は source-local NO_CREDIT；編集Exportは別。WEBF13の3回Web HD new-user quotaは限定allowanceで、quota後・現在の料金はUNKNOWN。RC02を維持します。
- WEBF49 の App7日/50credit付与は Web Export rate ではなく、WEBF71 free-to-try は final Export無料証明ではありません。RC01を維持します。
- WEBF71は browser生成／server transfer の両方を記述。処理方式の矛盾を残します。WEBF99の明示local-browser無料RAW変換は native AI edited RAW/export料金へ継承しません。
- WEBF7/S615の Desktop Direct Gaze・per-eye horizontal/vertical/size は名称軸の対応を確認。左/右option記録を保持し、hosted Web UIへのDesktop manual controls推定を禁止します。
- WEBF13のWeb quota/native Contacts tutorial、WEBF49のonline/Desktop機能・batch1000/asset storage/shortcut条件を分け、iPhone browser利用をnative iPhone control証明にしません。
- S16030-W016/W017はofficial tableの1つのSpot Healing Brush Toolが2記録に分割されたもの。2 provenance observationsは保持し、2つの独立toolとして数えません。458母数外です。
- 旧Auto Color Corrections無料条件（Looks/Match/Multi-Image除外）と新しい地域/plan offerを統合しません。Toolkit低quality無料をAI Recognition条件から継承しません。
- Severe CC01/CC04/CC05/CC06/CC07、12 unavailable-route unknown、未統合Registry02再確認、実機／pixels／RAW／account未実行を残します。

## Permission corrections outside458

以下の変更は未適用。PermissionはTether/Setup prerequisite・troubleshootingであり、Team roleの根拠ではありません。

| Source fact | Before | Proposed (remove unsupported Team only) | Stage |
| --- | --- | --- | --- |
| S17317:tether-prerequisite:camera-network-permission | Tether Capture; Team | Tether Capture | PREREQUISITE |
| S17153:tether-prerequisite:camera-network-permission | Tether Capture; Team | Tether Capture | PREREQUISITE |
| S17151:tether:camera-network-permissions | Tether Capture; Team; Mobile Editing | Tether Capture; Mobile Editing | PREREQUISITE |
| S15831:macos:15-files-folders-10-15-removable-permissions | Tether Capture; Team | Tether Capture | TROUBLESHOOT |
| S15831:mobile-os:ios18-permission-issue | Tether Capture; Team; Mobile Editing | Tether Capture; Mobile Editing | TROUBLESHOOT |
| S1538:ipad-permissions:camera-access | Tether Capture; Team; Mobile Editing | Tether Capture; Mobile Editing | PREREQUISITE |
| S1534:ipad-permissions:camera-access | Tether Capture; Team; Mobile Editing | Tether Capture; Mobile Editing | PREREQUISITE |
| S1531:ipad-permissions:camera-access | Tether Capture; Team; Mobile Editing | Tether Capture; Mobile Editing | PREREQUISITE |
| S1529:ipad-permissions:camera-access | Tether Capture; Team; Mobile Editing | Tether Capture; Mobile Editing | PREREQUISITE |
| S1527:ipad-permissions:camera-access | Tether Capture; Team; Mobile Editing | Tether Capture; Mobile Editing | PREREQUISITE |
| S1525:ipad-permissions:camera-access | Tether Capture; Team; Mobile Editing | Tether Capture; Mobile Editing | PREREQUISITE |

## Remaining work / no implementation dependency

260 Web SAME_OPERATION candidatesの完全な独立primary identity review、141 RELATEDの意味精査、116+5不確定identity、163 current applicability、Registry02 output再検査、devices/pixels/RAW/account実行は未完了です。

このcheckpointは監査を完了・parity PASSにするものではなく、Face Brightness等の承認済み実装や独立試験を止めません。候補を即仕様昇格せず、親が解釈参照を統合できます。

## Files and validation

`audit_continuation.json` contains all458 mappings,264 group reviews,141 related references,1,535 dispositions,163 credit record checks,11 separate permission candidates and7 targeted interpretation candidates. Inputs are SHA-256 pinned. Structural count/reference validation does not establish native execution.

