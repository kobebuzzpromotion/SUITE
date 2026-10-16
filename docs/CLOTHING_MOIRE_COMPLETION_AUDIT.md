# EV3-0993 Clothing Moiré Removal — completion audit

Status: **NOT_IMPLEMENTED in SUITE; audit only** (2026-10-04). No product source, Recipe, feature gate, AI model or billing route was changed. This does not increase the unique-candidate completion count.

## Primary-source boundary

The [official Evoto AI Lab guide](https://support.evoto.ai/ai-lab/) places Clothing Moiré Removal under **Remove & Repair**. It says the tool detects clothing/fabric areas, reduces both luminance and color moiré, and preserves fabric weave and folds *as much as possible*. The documented action is **Generate**, after which detected clothing areas are processed automatically. The named examples are clothing, mesh, lace and checked fabric. A second entry is Edit → Clothing Enhancement → AI Lab. The text does **not** document a separate strength/Amount slider, stripe-specific control, manually painted clothing mask, batch application of this tool, RAW/JPEG parity, Mobile/Desktop parity, credit cost, model location, or exact save/Final semantics. The nearby AI Lab Batch Edit support list names People Removal, Old Photo Restoration and Detail Enhance, **not** Clothing Moiré Removal. These omissions are unknowns, not proof that another product cannot do them.

The repository's [candidate requirement proposal](EVOTO_AUDIT/CANDIDATE_REQUIREMENTS.md) and [v3 request](EVOTO_DEEP_AUDIT_V3_REQUEST.md) ask about additional Amount, Batch, formats and platforms. Those are **SUITE scope questions**, not confirmed competitor controls. The frozen [gap matrix](EVOTO_AUDIT/SUITE_GAP_MATRIX.md) lists EV3-0993–1002 as audit candidates and disclaims pixel implementation.

## Original subitems versus present SUITE

| Audit subitem | Officially evidenced meaning | Present SUITE / gap |
| --- | --- | --- |
| EV3-0993 Clothing Moiré Removal / clothing detection | Automatic detection of clothing/fabric before Generate | No clothing segmentation/model, reviewed clothing mask, or dedicated command. Generic person/subject masks are not garment detection. |
| EV3-0994 luminance moiré | Reduce luminance interference patterns in detected fabric | `detail.denoise`, `clarity`, `texture`, and sharpening act on display-referred luminance across the representation; none detects moiré or isolates fabric. |
| EV3-0995 color moiré | Reduce chromatic interference patterns in detected fabric | Generic HSL/Selective Color affect selected *colors* across the image, not frequency-specific fabric color moiré. Detail denoise explicitly is not chroma denoising. |
| EV3-0996 weave and EV3-0997 folds | Preserve these fabric features **as much as possible** | No garment-aware edge/texture preservation evaluation. Do not promote the qualified source wording into a quality PASS guarantee. |
| EV3-0998 mesh, EV3-0999 lace, EV3-1000 checks | Named challenging fabric scenarios | No dedicated corpus, gold masks, visual quality/false-positive measurements or real-RAW results for these materials. The source also mentions clothing generally; it does not specify separate controls for each fabric. |
| EV3-1001 Generate | User explicitly invokes a new AI Lab result | No Clothing Moiré Generate op, candidate/result lifecycle, consent/billing decision or saved generated output bound to an Asset. A Detail slider or generic AI UI must not masquerade as this. |
| EV3-1002 Clothing Enhancement entry | Alternate route into AI Lab | No equivalent linked Editor entry. Adding a button without a real operation would be dummy UI. |

## Current code boundary

The strict [Recipe validator](../apps/backend/src/photo-policy.ts) accepts `postDecodeAdjustments.detail` only for clarity, texture, sharpness, denoise, grain and sharpness refinements. It has no Clothing Moiré key. The [Detail processor](../apps/web/src/processing/detail-adjustments.mjs) explicitly calls its denoise a luminance operation and disclaims chroma denoising or AI restoration; it has no garment mask input. The [renderer](../apps/web/src/processing/pure.mjs) runs Detail as a generic post-decode stage. The [Editor](../apps/web/src/editor-ui.mjs) exposes these real Detail controls but no Clothing Moiré route. The [Session](../apps/web/src/session.mjs) therefore cannot save, reload, Undo/Redo or export a dedicated Clothing Moiré result. Existing Original/Recipe/Final behavior for unrelated edits is not evidence for this missing feature.

The dedicated [audit regression](../apps/web/tests/clothing-moire-completion-audit.test.mjs) confirms the current strict validator rejects a fabricated `detail.clothingMoire` key and that the Detail API rejects an invented moiré parameter. It also checks the official-audit subitem inventory and no product route; these are **absence tests**, not image-quality tests. They cannot prove a future moiré algorithm.

## Safe next implementation gate

1. Owner decides whether this is a local deterministic fabric-only correction or an explicitly approved generative/AI model, including privacy, compute, billing, retention and failure semantics. The Evoto page does not decide SUITE architecture.
2. Establish licensed test photos and confirmed garment masks across mesh/lace/checks, skin/hair/background distractors, varied scales, luminance versus chromatic aliasing, and paired RAW/JPEG. Measure false detection, weave/fold/color retention, halos and Proxy/Final consistency. No such corpus is presently verified here.
3. Only after a real processor/model and identity-bound result exist, add typed Recipe or generated-asset contract, explicit Generate/review/save/Undo/Redo/Final flow and a working UI entry. Preserve Original, existing Detail settings, Workspace permissions and CAS. If automatic garment detection remains unproven, the command must fail closed; a manual mask is not the officially documented automatic operation.
4. Run real-browser, real-RAW, memory/performance, device and Cloud/permission tests separately. A synthetic test or a generic Detail pixel change is never a Clothing Moiré PASS.

No full-candidate completion claim is justified today.
