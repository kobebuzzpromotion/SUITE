# EV3-0185 Facial Reshape / Nose — completion audit

Status (2026-10-05): **NOT_IMPLEMENTED** as a SUITE nose-geometry editing feature. This read-only audit changes no product source, Recipe, UI, permissions or completion count. The frozen EV3-0185–0190 rows represent six controls with different regions or directions, not six names for one generic resize.

## Official operation boundary

Evoto's primary [Desktop guide](https://support.evoto.ai/facial-reshape/), [iPad guide](https://support.evoto.ai/facial-reshape-ipad/) and [Mobile guide](https://support.evoto.ai/portrait-retouching-facial-reshape/) each list these Nose controls within Facial Reshape. The guides describe AI analysis of facial structure, but do not publish nose pixel-warp equations, model weights, region masks, occlusion repair, exact slider range/default for these Nose controls, an interoperable Recipe format or a platform pixel-equivalence guarantee. The Head Pose −100…+100 range applies to its own three sliders; it must **not** be copied onto Nose by inference. A common control name across platforms establishes a documented operation, not the same rendering implementation.

| Frozen row | Documented operation | SUITE comparison and missing boundary |
| --- | --- | --- |
| EV3-0185 Size | Enlarge or reduce the **overall nose**. | Face Brightness changes luminance; photo resize/rotation changes the whole frame. No nose-only geometric scaling. **NOT_IMPLEMENTED**. |
| EV3-0186 Length | Lengthen or shorten the nose, affecting perceived philtrum length. | Neither global Crop nor tone adjustment changes nose-to-upper-lip anatomy. **NOT_IMPLEMENTED**. |
| EV3-0187 Horizontal | Shift the nose left or right relative to the camera. | A whole-photo translation/Crop would also move every other feature and the background. No nose-specific displacement. **NOT_IMPLEMENTED**. |
| EV3-0188 Nose Bridge | Adjust **bridge width**. | Distinct from overall nose width; no bridge contour/region output. **NOT_IMPLEMENTED**. |
| EV3-0189 Width | Change **overall nose width**. | Distinct from bridge-only width and overall Size. No nose-width warp. **NOT_IMPLEMENTED**. |
| EV3-0190 Nose Tip | Resize the **tip only**. | No tip-localized mask, geometry or pixel processing. **NOT_IMPLEMENTED**. |

These operations also differ from Head Pose (whole face orientation), mouth/philtrum controls and cosmetic nose contouring. Nearby terminology does not establish identical pixels or a safe shared adjustment.

## Actual SUITE boundary

`apps/web/src/processing/faces.mjs` loads a SHA-pinned MediaPipe FaceLandmarker, but exports a face-**oval** polygon and anchor for the current person flow. It does not retain a separately validated nose bridge/tip inventory or a nose segmentation/warp map. `apps/backend/src/portrait-recipe.ts` restricts person targets to `face_brightness`; `apps/web/src/processing/pure.mjs` uses that oval for a luminance operation and rotates/crops **all** photo pixels when requested. `apps/web/src/session.mjs` and `editor-ui.mjs` provide whole-photo Rotate/Crop and Face Brightness; their general Undo/Redo, CAS save/reload, Preset and Worker Final pipelines do not implement the six absent nose controls. In the current local Trial, person privacy remains review-blocked.

Generic Recipe v1 may store an unfamiliar `noseReshape` JSON key, but the Web renderer rejects unsupported extension keys rather than rendering a fake success. The [dedicated audit regression](../apps/web/tests/nose-reshape-completion-audit.test.mjs) verifies all six frozen labels, rejects nose target aliases under the typed person contract, demonstrates unknown Recipe render rejection and checks the present detector/UI boundary. These are **absence/safety assertions**, not a realistic-nose, identity-preservation, actual RAW or device-parity PASS.

## Smallest safe next connection

First define an opt-in, consented **nose landmark/region inventory** for one freshly authenticated selected person, bound to Asset ID, Original SHA, saved Recipe revision, model SHA and source dimensions. It needs explicit bridge, outline, tip and adjacent lip/cheek boundaries; pose/occlusion/profile/multiple-face ambiguity must fail closed. A face oval, a caller-drawn label or MediaPipe indices alone are not proof of anatomical correctness or consent. The current head/face inventory cannot be repurposed silently.

Then evaluate one clearly named **SUITE-specific manual local geometry** operation (for example a bounded nose-horizontal displacement with deterministic falloff) as a separate, non-destructive typed Recipe operation. It must preserve pixels outside the authorized region, original/alpha, facial identity and nearby eyes/mouth as tested; carry Undo/Redo, Preview/Final parity, CAS save/reload and photo-bound Preset rules. Representative consented real images and RAW across skin tones, glasses, oblique faces and occlusions are needed before offering it in product. This would still **not** satisfy Evoto's six controls, unpublished pixel formula or cross-device quality claims; Size, Length, Bridge, Width and Tip each require their own operation and validation.

Real Desktop/iPad/Mobile device operation, authentic RAW, Cloud, official pixel equivalence and production person approval were not tested. Strict independent-candidate completion remains unchanged at 0/44.
