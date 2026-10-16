# EV3-0528 Grain completion audit — 2026-10-04

Status: **NOT_COMPLETE as a whole**. The seven SUITE Grain controls have real local 8-bit sRGB pixel processing, and the Grain-only selected-photo Sync now has a distinct product Session/Editor entry point. The four requested Preset scopes and actual RAW/Cloud/device behavior are not all connected or verified. This document began as a read-only audit; the dated update below records subsequent implementation without treating it as the original audit result.

## Source and interpretation

- The [Evoto Color Adjustments Module](https://support.evoto.ai/color-adjustment-feature-modules/) describes Grain overall strength, separate Shadows/Midtones/Highlights intensity, Size, Roughness, and Color Variation. The repository's [S601 matrix](EVOTO_AUDIT/EVOTO_COLOR_MATRIX.md) records these as EV3-0528–0534. It does **not** establish matching numeric ranges, Evoto's proprietary pixel formula, or cross-platform parity.
- [Evoto Presets](https://support.evoto.ai/how-to-use-preset-ipad/) describes saving selected effects into a preset. [Evoto Settings Sync](https://support.evoto.ai/how-to-use-sync-the-feature-effect/) describes selecting adjustments for multiple photos. These are general workflow sources, not proof that a specific SUITE Grain preset/sync path is connected. Personal/Workspace/Author/Community are the SUITE contract in [Preset product-route audit](PRESET_PRODUCT_ROUTE_AUDIT.md), not four names asserted by S601.
- A real Chrome run of the existing `grain-editor-browser` fixture returned `GRAIN-EDITOR-BROWSER-PASS`: all seven controls changed actual Worker Preview pixels, Undo/Redo, mock Recipe save/reload, Worker Final PNG pixel difference, and unchanged synthetic Original SHA (`9e75bdd7815056df78e88a0f724bee465789f34de043b2a6f0da00989580662a`). This fixture uses a **mock storage/API and synthetic non-RAW raster**; it is not real Trial HTTP/SQLite, RAW, a physical mobile device, or public Cloud.

## Seven source rows against the current implementation

The following statuses mean SUITE's own effect is wired locally; they do **not** claim Evoto pixel equivalence. All seven are validated as 0–100 SUITE-only controls in `apps/web/src/processing/grain.mjs`, accepted as Recipe keys in `apps/backend/src/photo-policy.ts:404-414`, exposed in `apps/web/src/editor-ui.mjs:36-38,386-388`, committed/undoable in `apps/web/src/session.mjs:72-120,317-350`, and rendered through `apps/web/src/processing/pure.mjs:151-156`. Existing `grain-extended`, `grain-renderer-extended`, and `grain-editor-browser` tests plus the Chrome fixture exercise these paths.

| Original ID | Official sub-operation | SUITE setting / observed effect | Assessment |
| --- | --- | --- | --- |
| EV3-0528 | Overall Strength | `detail.grain` → `grain.amount`; amplitude changes actual output | LOCAL_PASS, product-wide incomplete |
| EV3-0529 | Shadows | `grain.shadows`; dark-zone weighting changes pixels | LOCAL_PASS, product-wide incomplete |
| EV3-0530 | Midtones | `grain.midtones`; middle-zone weighting changes pixels | LOCAL_PASS, product-wide incomplete |
| EV3-0531 | Highlights | `grain.highlights`; bright-zone weighting changes pixels | LOCAL_PASS, product-wide incomplete |
| EV3-0532 | Size | `grain.size`; spatial scale changes texture | LOCAL_PASS, product-wide incomplete |
| EV3-0533 | Roughness | `grain.roughness`; noise shape changes texture | LOCAL_PASS, product-wide incomplete |
| EV3-0534 | Color Variation | `grain.colorVariation`; chroma noise changes output | LOCAL_PASS, product-wide incomplete |

`grain.seed` is a deterministic SUITE implementation field, not an eighth official slider. `amount + seed` only retains its legacy rendering byte-for-byte. Alpha and input raster stay unchanged in the new `GRAIN-AUDIT-01` test. Different Proxy/Final dimensions need not produce identical grain positions, as documented in `processing/grain.mjs`; this is not a mismatch by itself.

## End-to-end and Preset/Sync gates

| Gate | Evidence | Status / missing proof |
| --- | --- | --- |
| UI → Recipe → Undo/Redo → Preview/Final | Real Chrome synthetic non-RAW fixture above; seven settings individually changed Worker Preview; saved Final differs from neutral | **LOCAL_PASS** |
| Saved Recipe persistence | The original `grain-editor-browser` fixture used mock storage. Later `grain-trial-browser` and `batch-grain-sync-http` cover authenticated local Trial/SQLite with synthetic non-RAW. | **LOCAL_TRIAL_PASS for the tested paths**; current Grain-only Sync UI→Trial/Final Chrome fixture is bundled but its live run is **NOT_RUN** in the present empty-browser environment. |
| Author preset | `preset-author-contract.mjs:232-244` preserves seven fields/seed; `portable-levels-grain-preset.test.mjs` proves Author draft→accepted SQLite reopen and synthetic Editor apply/save. `author-ui.mjs` has generic source-backed draft and published library UI. | **PARTIAL**: no Grain-specific real Trial HTTP/SQLite + Chrome source UI → reviewed publication → recipient apply → saved Recipe → Final and expiry/CAS test. Author draft and accepted public release must not be collapsed. |
| Personal preset | `grain-preset-http.test.mjs` saves/reloads/applies seven values through **test-only** `WorkspaceHTTP` mount. `bootstrap.mjs` does not construct or mount the Workspace preset client/facade. | **NOT_CONNECTED in shipped Trial/Cloud Editor**; Node contract PASS is not product PASS. Requires explicit identity, destination, fresh membership/role, versioned save/apply, UI and Final verification. |
| Workspace preset | Same test-only Node HTTP/SQLite proof; `preset-facade.mjs` supports `WORKSPACE` through an injected adapter. | **NOT_CONNECTED in shipped Trial/Cloud Editor**; cannot equate Trial/Sites principal/tenant with Node Workspace. |
| Community preset | `preset-facade.mjs:27-29` throws `COMMUNITY_NOT_IMPLEMENTED`; new `GRAIN-AUDIT-03` asserts it. | **NOT_IMPLEMENTED**; do not rename published Author presets to Community. |
| Grain-only Sync | `batch-grain-sync.mjs` merges seven settings plus deterministic seed without replacing target exposure or photo-bound adjustments. `EditorSession.batchSyncGrain` and the separate Editor action select 2–20 targets, reject dirty drafts, perform per-target SHA/permission/revision/CAS/readback, and show partial/conflict/unverified rows. Full Recipe Batch remains separate and still replaces target exposure. | **PRODUCT_CODE_CONNECTED / dedicated Session/UI/Trial tests PASS**. The new actual Chrome UI→Trial→Worker Final fixture bundles, but live Chrome is **NOT_RUN** in this environment; do not promote it to E2E PASS. |
| Actual camera RAW, iPad/phone hardware, deployed D1/R2/Cloud | No corresponding execution in this audit. | **NOT_RUN**, never inferred from synthetic non-RAW/Node SQLite. |

## Evidence run

- Existing focused suites: **40/40 PASS** for Grain pure/extended/render/Recipe, Grain Browser fixture bundle, Personal/Workspace test-only HTTP/SQLite, portable Author, and preset facade. The browser bundle test alone is not an actual Chrome run; the separate Chrome observation above is.
- New `apps/web/tests/grain-completion-audit.test.mjs`: **3/3 PASS** after the connected Grain-only Session method updated the former absence assertion. `GRAIN-AUDIT-01` tests seven pixel controls/input/alpha, `-02` keeps full-Recipe Batch distinct, and `-03` fixes the explicit Community boundary.
- Combined focused total: **43/43 PASS**. The test result documents the existing partial boundary; it does **not** flip EV3-0528 or the parent 44-candidate completion count to complete.

## Next safe implementation order (subject to main-agent ownership allocation)

1. The Grain-specific merge/Sync path and explicit Editor action are connected. Run the dedicated synthetic non-RAW Grain Sync fixture in actual Chrome when browser automation is available, proving UI→Trial HTTP/SQLite→reload→Worker Final and Original SHA. Do not reuse full Recipe Batch as the proof.
2. Connect Grain Personal/Workspace only to an explicitly selected, authenticated product backend and host identity; keep Node Workspace, Trial and Cloud separate. Then run real route Save→Reload→version-fixed Apply→Recipe save/reload→Final and role/expiry/conflict/Original checks.
3. Exercise Grain through the existing Trial Author UI and real HTTP/SQLite with review/published recipient, including Final and revocation boundaries. Community needs its own governance/storage contract before UI enablement.
4. Keep real RAW/physical device/Cloud tests as separately named gates; no local fixture or old mock can substitute.

## 2026-10-04 subsequent Grain-only Sync connection

- New `batch-grain-sync.mjs` pure/Trial HTTP tests were **8/8 PASS**. New Session/UI/bundle tests were **5/5 PASS**. The product code now has `batchSyncGrain` and a separate "Grainだけ同期" action, with source/target dirty-draft refusal, explicit 2–20 selection, source and target Asset/SHA/revision/permission/CAS checks, post-save re-read, preserved non-Grain Recipe, and per-target partial status. The old full-Recipe Batch is not relabeled as Grain-only.
- The new `batch-grain-sync-browser` fixture is an authenticated Trial HTTP/SQLite and real Worker synthetic non-RAW probe. Its Node bundle test passed. The current UI automation inventory returned no available app or browser, so the **live Chrome verdict is NOT_RUN**; no real UI→Final PASS is inferred from bundling. Earlier Grain control Chrome observations and the dedicated Trial fixture remain separate evidence.
- Personal and Workspace are still not mounted by the shipped Trial/Cloud OIDC host, and Community remains unimplemented. The Node Workspace Preset route and host-injected mounting work are separate from the Trial principal and do not close that Gate. Real camera RAW, physical iPad/phone, and deployed Cloud remain **NOT_RUN**. EV3-0528 and the parent candidate count stay **NOT_COMPLETE**.
