# EV3-0595–0617 Personalized AI Look completion audit — 2026-10-04

Status: **NOT_IMPLEMENTED as a trainable AI Look**. SUITE has useful data-only Session Look intent, manual color Recipe controls and several versioned Preset routes. None is an image-trained, reusable color model. This audit changes no product code, Recipe, Original, database or deployment.

## Primary source and boundary

The [Evoto Personalized AI Look support article](https://support.evoto.ai/personalized-ai-look/) describes two Create AI Look paths: Lite from one XMP or eligible personal color preset, and Personal from a larger edited-image set. Its current instructions specify ≥200 RAW, ≥200 JPEG/TIFF, or ≥200 of **each** when Both is selected; image-type-specific source choices; optional AI Smart Selection from 50 available images; up to five preview images; AI Correction versus Fixed Value; training states, duplication and restricted cancellation. It says Looks apply only to matching RAW/non-RAW format and that sharing a preset masks the Look effect because direct Look sharing is unsupported. This is a source-product description, **not** a SUITE requirement to silently acquire user images, train a model or use Evoto's proprietary algorithm. `docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md` records EV3-0595–0617. The official page was checked through its search-indexed official text because direct opening returned an over-size response; exact model/training algorithm and output parity remain unknown.

## Sub-operation comparison

| Original sub-operation | Current SUITE evidence | Finding |
| --- | --- | --- |
| Lite XMP / Evoto personal color preset (0595–0596) | `apps/web/src/preset-facade.mjs` exposes Personal/Workspace and Author operations with distinct storage, but no XMP ingest or train-from-preset job. | **NOT_IMPLEMENTED** as AI Look creation. A static Preset is a source candidate, not the trained Look. |
| Personal edited image set and input formats (0597–0603) | `packages/SuiteCore/Sources/SuiteCore/SessionLook.swift` stores a reference Asset, Recipe revision and color/retouch intents; it accepts no 200-image training corpus, RAW/JPEG/TIFF/Both training mode, `.lrcat`, Evoto project import, or Local Folder RAW+XMP training. Web/Apple import paths process photos for editing, not learning. | **NOT_IMPLEMENTED**. Recipe/history metadata is not personal model training. |
| Smart Selection / profile import / preview (0604–0606) | No AI Look corpus selection, 50-image eligibility, XMP profile ingest or five-photo model preview route. Existing Smart Culling and filmstrip are unrelated products. | **NOT_IMPLEMENTED**. |
| AI Correction / Fixed Value and color tools (0607–0612) | SUITE has manual exposure/Curve/HSL/Calibration controls and data-only Session Look color intents. `SessionLookPlanning.swift` explicitly says `isRendered == false` and at most `readyForAdapter`; it generates no per-photo learned value to offset or replace. Color Grading is catalogued `NOT_CONNECTED`. | **MANUAL CONTROL OVERLAP ONLY**. It does not implement AI-generated baseline, adaptive correction or trained Look adjustment. |
| Ready/Locked, Duplicate, progress, cancellation (0613–0617) | No trained Look entity, training job, quota lock, duplicate variant or Waiting/Uploading/Training transitions. Existing Preset save/reload and ordinary request cancellation are different state machines. | **NOT_IMPLEMENTED**. Do not label a saved Preset “Ready Look”. |
| Format match and preset sharing rule (official note) | No RAW-vs-Non-RAW trained Look binding or Look-effect masking when a preset is shared. `preset-facade.mjs` explicitly has `COMMUNITY_NOT_IMPLEMENTED`, and Workspace full-Recipe replace differs from Author portable merge. | **NOT_IMPLEMENTED** as Look safety behavior. |
| AI editing marketing vs product | `apps/web/src/landing-ui.mjs` contains the approved “AI編集モード” copy but explicitly states current Web trial has no AI editing. | **COPY ONLY / NOT_CONNECTED**. Do not treat a public promise or UI label as a model. |

## Dedicated audit evidence

`apps/web/tests/personalized-ai-look-completion-audit.test.mjs` is **4/4 PASS** for source-ID coverage and fail-closed boundaries: 23 audited IDs, Session Look planning as metadata-only, Preset modes/Community refusal, and Web AI availability disclosure. No trainable model, image corpus ingestion, real RAW/JPEG/TIFF training, real device, XMP/Lightroom parsing, Cloud training or Evoto pixel equivalence was run. A PASS of these audit tests proves the **gap classification**, not feature completion.

## Next safe connection

1. Define an opt-in, authenticated training job with owner/workspace, immutable source Asset IDs/Original SHA/Recipe versions, format type, consent, corpus-count gate, source/provenance, cancellation stages and cost/quota policy. Respect RAW vs non-RAW segregation and preserve Originals; do not use existing Presets as a substitute for model training.
2. Implement XMP/preset and edited-image source validation separately. A Lite preset source requires enough color data and explicit warnings for masks/profile dependencies; Personal sets require authorized originals, ≥200 per selected format, 50-image Smart Selection only when eligible, unusable-file reasons and no silent cloud transfer.
3. Add a real inference/training provider and versioned Look artifact, then integrate five-photo preview and the learned-baseline AI Correction/Fixed Value difference through Recipe/Undo/Redo/Final. Keep current manual color edits and Preset Save/Apply intact. Sharing must exclude unsupported Look effect rather than leaking a model or falsely applying it.
4. Test job failure/retry, ownership/role expiry, Waiting/Uploading-only cancellation, model readiness/lock, format mismatch, Preview/Final equivalence gates and physical RAW/device/Cloud workflows. Until those pass, keep EV3-0595–0617 and the independent-feature count incomplete.
