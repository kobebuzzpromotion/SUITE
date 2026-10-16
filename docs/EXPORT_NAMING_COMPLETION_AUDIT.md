# Export naming completion audit — 2026-10-04

## 後続のDNG撮影日方式限定接続（以下の旧状態より優先）

`capture-date-original`は、DNG限定のoffset付きExif DateTimeOriginalをfresh Trial本人/Asset/Original SHA/保存Recipe版/export権限へFinal前後で照合した場合だけ、単写真と2〜20件Batch Finalの明示選択肢へ接続した。任意caller日付/offset無し/非DNG/偽証拠/部分Batch・招待失効は拒否し、全件Final成功前にリンクを公開しない。新方式は自動ダウンロードclickを行わず手動リンクのみ。合成DNG＋実Trial HTTP/SQLite専用4/4・関連12/12、メイン独立関連19/19、担当全Web1241/1241 PASS。ただし実RAW decode、実Chrome新方式操作、OS上の保存名は未確認。下表の「Capture Date–Originalは製品未接続」「現UIは4方式」は接続前の履歴であり、現在の明示方式は5つ。Effect/Export Preset由来など残る4方式と実環境Gateが未完のため元候補全要素完了ではない。

## Verdict and scope

The Batch Final UI **does connect** `original`, `original-custom`, `custom-count`, and `custom-sequence` from an explicit two-to-twenty-Asset selection through completed synthetic non-RAW Final Blobs to safe, individually clickable download links. The earlier statement in `UNIQUE_COMPLETION_AUDIT_A.md` that only two naming methods reach the UI predates Batch Final and is no longer accurate. This is **not** a completion finding for the whole `EV3-0764 Desktop Export naming` candidate: the reference describes nine naming methods and an export destination workflow, whereas the current Batch Final product UI offers four methods and browser Blob links only.

Reference: [Evoto's Import & Export guide, “File Naming Methods”](https://support.evoto.ai/how-to-use-import-export/) (S600, accessed 2026-10-04), and `docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md:774-782`. The reference's examples describe behaviour, not a mandate to imitate its undocumented collision or filesystem policy.

## Evidence by operation

| Source candidate | SUITE product path observed | Gate |
| --- | --- | --- |
| `EV3-0764` Original Filename | Batch Final select offers `original`; single Final also offers original. | Product UI wired; actual-filesystem destination/collision policy not verified. |
| `EV3-0765` Custom Filename (# of #) | Batch Final select offers `custom-count`. Actual Chrome: explicitly ordered `second.NONRAW → first.NONRAW`, PNG, input `../Selection` yielded two separate manual links named `_Selection (1 of 2).png` and `_Selection (2 of 2).png`. | Synthetic non-RAW Chrome UI→Session→real Worker Blob→link **PASS for this suboperation**. |
| `EV3-0767` Custom Filename–Sequence | Batch Final select offers `custom-sequence`. Checked-in actual Chrome fixture verifies `_Selection_001.png`, `_Selection_002.png` for the same explicit order, real `image/png` Blobs, 12×8 decoded dimensions and no automatic click. | Synthetic non-RAW Chrome UI→Session→real Worker Blob→link **PASS for this suboperation**. |
| `EV3-0766` Capture Date–Original | `export-naming.mjs` can calculate a name from a supplied date, but `export-naming-context.mjs` rejects unavailable capture date; neither Batch nor single Final offers it. | **Not product-connected.** No timezone-free capture date may be invented from import time or uncertain RAW timestamp. |
| `EV3-0768` Original–Custom Text | Single and Batch Final UI both offer `original-custom`. The Batch Chrome fixture verifies ordered Blob links. | Synthetic non-RAW browser path only; OS save and authenticated product UI remain separate gates. |
| `EV3-0769` Original–Effect Preset | Pure planner exists; context accepts only a provably matching saved Personal/Workspace preset snapshot. No corresponding product export naming choice. | **Not product-connected.** A catalog entry alone does not prove the preset was applied. |
| `EV3-0770` Original–Export Preset | Pure planner exists; context explicitly rejects unavailable selected Export Preset. | **Not product-connected.** |
| `EV3-0771` Original–Effect Preset–Export Preset | Pure planner exists; Export Preset context unavailable. | **Not product-connected.** |
| `EV3-0772` Original–Effect Preset–Custom Text | Pure planner exists; product export UI does not offer this composition or its trusted preset provenance. | **Not product-connected.** |

`apps/web/src/export-naming.mjs` contains the nine pure filename calculations, separator/control-character sanitation, reserved-name handling, a 255-byte filename-component bound and case-insensitive collision suffixing against **names supplied to that calculation**. This does not inspect a user's disk or guarantee no existing destination file is overwritten by the browser. `apps/web/src/export-batch-manifest.mjs` deliberately limits Batch Final to `original`, `original-custom`, `custom-count`, `custom-sequence`; it validates explicit queue order, all Blob MIME/size values and a 256 MiB aggregate limit before returning a `download-manifest-only` result. `apps/web/src/editor-ui.mjs` supplies the selection/order/method controls, calls `session.exportBatchFinal`, verifies the complete result against the unchanged selection, creates URLs only after complete success, and renders `<a download=...>` links without programmatic clicking. It revokes URLs on selection change, access loss, clear and disposal. The single-photo methods remain a different UI path.

## Browser and test gates

- On 2026-10-04, an actual Chrome tab running `apps/web/tests/fixtures/batch-final-browser-fixture.mjs` produced the `custom-count` names above. Both were actual `image/png` Blobs (134 and 133 bytes, each decoded as 12×8); report showed two Final encodes, no automatic download click, selected Asset/clean state unchanged. Deselecting one Asset removed both links and reported two revoked Blob URLs. This began as an interactive check; a later checked-in fixture added the `custom-count` assertion.
- The current Chrome fixture reports `BATCH-FINAL-BROWSER-PASS` for `original`, `original-custom`, `custom-count`, and `custom-sequence`: ordered safe links, link revocation after selection/naming change, zero partial links on second-item failure/cancellation, and disposal cleanup. `apps/web/tests/batch-final-browser-output.test.mjs` verifies that the fixture bundles under Node; the browser verdict was separately observed in Chrome, with 8 browser checks. The later full Web regression passed 1011/1011.
- `apps/web/tests/batch-final-ui.test.mjs` and `apps/web/tests/export-batch-manifest.test.mjs` cover gate/manifest contracts, including incomplete result rejection and collision handling. `apps/web/tests/batch-final-http.test.mjs` separately exercises saved non-RAW Batch Final against Trial HTTP/SQLite, including identity, revision and Original-hash failures; it **does not** verify UI naming. Conversely, the Chrome fixture uses a synthetic authenticated principal and mocked API rather than the deployed Trial/Cloud service.

## Remaining boundary

Do not mark `EV3-0764` or all nine source methods complete from this audit. Missing product choices and trustworthy context for capture date/Effect Preset/Export Preset remain; Batch Final has no actual destination picker, filesystem-existing-name query, replacement/skip policy, multi-preset export variants, or Cloud/RAW end-to-end naming check. The narrow verified result is safe **browser-proposed** names and manual links for four current UI methods using synthetic saved non-RAW Assets. An authenticated UI→HTTP integration gate is in progress and does not erase the remaining method gaps.
