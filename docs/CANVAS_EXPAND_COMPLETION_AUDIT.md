# EV3-0701–0709 Manual canvas Expand completion audit — 2026-10-04

Status: **NOT_COMPLETE as the source feature**. SUITE has a useful, non-generative, flat-fill manual margin feature, but the documented automatic AI Crop Sync and several manual semantics differ. This audit changes no product source, Recipe, Original, database, or deployment.

## Source and evidence boundary

The [Evoto Crop Module](https://support.evoto.ai/crop/) is the primary source. Its Expand section specifies direct dragging of four edges, up to 200% per side, a 13000 × 13000 px final-size ceiling, gray default fill with white/black alternatives, Expand→Reset Expand, and displayed ratio or pixel dimensions. Expand is based on the **original image**; opening Expand after crop/rotation resets the crop frame. Its separate **Auto Expand During Sync** switch is under AI Locate (Subject/Face), on by default, and infers the extra space needed for each image's AI-crop composition. Reset after auto expansion removes both expansion and the AI-crop result. This is ordinary flat-fill expansion, not Generative Expand. The source does not disclose the AI detection or composition algorithm or exact pixel sampling; no Evoto pixel-equivalence claim is possible. `docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md` records EV3-0701–0709.

## Sub-operation-by-sub-operation finding

| Source sub-operation | Current SUITE evidence | Finding |
| --- | --- | --- |
| Four edges / 200% per side (0701–0702) | `editor-ui.mjs:24` exposes four numeric controls 0–200%; `session.mjs:321–329,492–502` writes fractional Recipe margins. `processing/canvas-expand-projection.mjs` projects them into real per-frame pixels. New `CANVAS-AUDIT-01` proves all four pixel offsets and immutable input. There is **no direct edge dragging on the image**. The backend and projection accept 0–4 fractions, so a directly supplied Recipe can exceed the UI's 200% limit (`CANVAS-AUDIT-03`). | **PARTIAL**: numeric manual edit works; direct drag and consistent 200% enforcement missing. |
| 13000 × 13000 px ceiling (0703) | `processing/canvas-expand.mjs` uses `MAX_CANVAS_EDGE=16384`, global pixel and 256 MiB working-memory caps. `CANVAS-AUDIT-03` demonstrates an accepted 13001×1 output. Separate memory limits may reject some images smaller than the documented maximum; this is not equivalent enforcement. | **MISMATCH**. |
| Gray / White / Black (0704–0706) | `editor-ui.mjs:370,505–510` exposes all three plus SUITE-only transparent; existing real Chrome `canvas-expand-editor-browser` checks Proxy and Final RGBA for each. SUITE opens with White, `session.mjs:325` supplies White on first margin edit, while the official initial fill is Gray. If no background is in Recipe, projection defaults Transparent. | **PARTIAL**: colors work, default differs. Transparency is a SUITE extension, not source parity. |
| Expand / Reset Expand (0707) | `editor-ui.mjs:370,511` calls `setCanvasExpansion(null)`, which removes the extension; existing Chrome fixture checks Undo/Redo, save/reload and Final after Reset. There is no distinct staged Expand confirmation. It does not reset an existing crop when entering Expand, nor remove an AI-crop result (there is none). | **PARTIAL**. |
| Auto Expand During Sync, default ON (0708) | `session.mjs:573–610` and `batch-edit.mjs` copy a saved **whole Recipe** to explicit targets with permission/CAS checks. `canvas-expand-batch-http.test.mjs` checks two synthetic non-RAW targets and size-specific rendering, but explicitly records no `detectPeople` call and identical copied Recipe. No AI Locate composition, per-target missing-space inference, default-on toggle, Original/As Shot handling, or coupled Reset exists. `CANVAS-AUDIT-04` pins the current static boundary. | **NOT_IMPLEMENTED**. Recipe copying must not be renamed Auto Expand During Sync. |
| Ratio / pixel display (0709) | `editor-ui.mjs:507–513` shows the *sum* of four percentages and the current **preview** image natural pixel dimensions. It does not show the source feature's expanded ratio and independently projected Final pixel dimensions before application. | **PARTIAL**. |
| UI→Recipe→Undo/Redo→save/reload→Final | Existing `canvas-expand-editor-browser` uses the real Editor/Session/Worker with synthetic non-RAW and checks four margins, four fills, Reset, Undo/Redo, Recipe reload, Proxy/Final dimensions/pixels and Original SHA. Worker path `processing/worker.mjs:173–181` appends canvas expansion after normal stages, hence **after Crop**, not original-image-first. `canvas-expand-batch-http` uses real Trial HTTP/SQLite and two target Assets; its decoder/encoder are synthetic. | **SYNTHETIC_NON_RAW_PASS for SUITE manual semantics only**; official original-image/crop behavior is not met. |

## New dedicated tests and limits

`apps/web/tests/canvas-expand-completion-audit.test.mjs` is **4/4 PASS**:

1. Executes four-sided flat-fill pixel expansion with immutable source.
2. Demonstrates projection from a post-Crop 60×100 frame instead of 4000×3000 Original metadata.
3. Demonstrates accepted 2.01 fraction and 13001px edge, documenting the official-limit mismatches.
4. Verifies the shipped numeric/post-Crop/white-first UI and fixed-Recipe Batch path have no Auto Expand During Sync route.

The audit test does not itself run camera RAW, physical pointer/touch, public Cloud/D1/R2, AI face/subject crop, or Evoto's proprietary image algorithm. Prior dedicated Chrome and Trial tests are separate evidence. A PASS of this audit means the comparison is reproducible, **not** that EV3-0701–0709 are complete.

## Next safe implementation sequence

1. Define and enforce one manual contract: Original-relative margins, official 200%/13000px limits and Gray initial fill, preserving old Recipe output through versioned interpretation/migration rather than silently changing historical images. Clarify how an existing Crop/rotation is reset on entering Expand and how this interacts with Undo/Redo.
2. Add direct four-edge pointer/keyboard controls and explicit output ratio/Final pixel preview; keep present numeric controls and accessibility. Validate size before Recipe commit and again at Final for both Proxy/Final.
3. Treat automatic expansion as a separate AI Locate Crop Sync feature: explicit default-on setting, authorized per-target image/face or subject detections, composition constraints, each target's derived margins, 200%/13000px preflight, all-or-fail/conflict reporting, and coupled Reset. Do **not** infer it by copying a saved margin Recipe, and do not call it Generative Expand.
4. Re-run real camera RAW, physical tablet/desktop interaction and authorized Cloud storage/export gates separately. None were verified here; do not increase the independent-feature completion count on this audit alone.
