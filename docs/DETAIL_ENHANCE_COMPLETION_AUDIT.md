# EV3-1058–1067 Detail Enhance completion audit — 2026-10-04

Status: **NOT_IMPLEMENTED as the documented AI Lab feature**. SUITE has independent, local 8-bit sRGB clarity, texture, sharpness and denoise filters. Those may improve the perceived detail of some photos but are not evidence of AI detail recovery, subject-aware hair/face/clothing reconstruction, or the documented No Upscale / 2K / 4K / 6K generation modes. This audit changes no product source, Recipe, Original, database or deployment.

## Source and evidence boundary

The primary source is [Evoto's AI Lab support article](https://support.evoto.ai/ai-lab/), “Detail Enhance” under “Enhance & Restore” and its “Batch Edit” section (read 2026-10-04). It describes generation for sharpness, texture, hair/facial detail and clothing patterns, with No Upscale and 2K/4K/6K output options. Available resolution choices can depend on the current cropped image size. It warns that noisy, very blurred or very small sources limit results, and aggressive upscaling can make facial texture unnatural. It does **not** disclose the model, numerical algorithm, exact meaning of K, dimensions per aspect ratio, identity safeguards or expected pixel values. The Batch Edit subsection explicitly includes Detail Enhance among its three AI effects; that is not equivalent to copying a saved Recipe. `docs/EVOTO_AUDIT/EVOTO_AI_LAB_MATRIX.md` and `EVOTO_FEATURE_TREE.md` preserve IDs EV3-1058–1067.

## Sub-operation findings

| Source operation | Current SUITE evidence | Finding |
| --- | --- | --- |
| No Upscale, detail recovery (1058) | `processing/detail-adjustments.mjs` applies four separable, global sRGB8 luminance filters without changing width/height. `DETAIL-ENHANCE-AUDIT-01` observes distinct pixels for Clarity/Texture/Sharpness/Denoise while retaining Original input. `editor-ui.mjs` and `session.mjs` expose/save these as ordinary adjustments. | **OVERLAP IN APPEARANCE ONLY**. Same-size output is not an AI Lab generation/result workflow or proof of recovered missing detail. |
| 2K / 4K / 6K (1059–1061) | `export-size.mjs` is explicitly reduction-only and rejects a width greater than the source. `DETAIL-ENHANCE-AUDIT-02` confirms original dimensions stay unchanged and an enlargement request fails. The feature catalog marks Upscale `NOT_CONNECTED`. | **NOT_IMPLEMENTED**. Downsize/export dimensions must not be renamed generative upscaling. |
| Sharpness and Texture (1062–1063) | `detail-adjustments.mjs` uses global unsharp/local-frequency filters after color and before rotation/Crop; their parameter and processing path are real, including Sharpen radius/detail/masking. The official AI Lab article gives no control-to-filter equivalence. | **PARTIAL semantic overlap**, distinct architecture. Keep the useful SUITE controls; do not merge or remove them based on the shared words. |
| Hair / facial detail / clothing patterns (1064–1066) | The current detail processor accepts pixels plus scalar controls, not a selected hair/face/clothing region or generated result. `DETAIL-ENHANCE-AUDIT-03` checks that the same input with different untrusted semantic labels produces the same global pixels. Separate face detection or Person correction cannot imply this AI Lab enhancement. | **NOT_IMPLEMENTED** as target-aware detail recovery. |
| Crop-dependent resolution options (1067) | SUITE's crop and export-size stages work on post-render/post-Crop dimensions. The AI Lab-specific mode choice, eligibility calculation and result generation are absent; `DETAIL-ENHANCE-AUDIT-02/04` fix that boundary. | **NOT_IMPLEMENTED**. Crop-dependent downsize is not the documented AI resolution selector. |
| AI Lab Batch Edit of Detail Enhance | Current `batch-edit.mjs` copies an authenticated saved Recipe to explicit target Assets; it does not generate the AI Lab Detail Enhance result. | **NOT_IMPLEMENTED** for this effect. |

## Existing useful SUITE path, not a completion claim

The current detail filters have UI/Recipe/Undo/Redo/Preview/Final tests, including synthetic Worker and Trial paths elsewhere in the suite. They are global post-decode 8-bit sRGB operations and retain the input buffer. Their distinct denoise/clarity/texture/sharpen order is written in `processing/detail-adjustments.mjs`; this is not RAW-stage denoise or proprietary AI equivalence. The new dedicated audit tests are **4/4 PASS** and prove only these differences, not the source feature. No real camera RAW, physical device, model inference, authorized cloud generation, exact 2K/4K/6K dimensions, semantic identity preservation or Evoto pixel parity was run.

## Next safe gap to connect

1. Define a separate, explicit Detail Enhance job/result contract: source Asset/Original SHA, Recipe revision, crop state, No Upscale/2K/4K/6K request, output dimensions, immutable generated Asset and provenance. Preserve ordinary Clarity/Texture/Sharpen/Denoise controls as separate edits.
2. Do not enable the action until there is a real inference provider and authenticated permissions, storage, cost/consent and cancellation handling. Validate target dimensions/limits from a primary specification rather than inventing a “K” conversion. Keep generated results distinct from originals and ordinary Recipe export.
3. Establish tests on synthetic non-RAW first for auth/CAS/abort/result integrity and subject/crop-boundary failures, then real photos, RAW, physical device and Cloud gates. If a model exists later, test difficult noise/blur/small-face and identity/texture artifacts before marking any source sub-operation complete.
