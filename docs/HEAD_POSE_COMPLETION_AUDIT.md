# EV3-0145 Facial Reshape / Head Pose — completion audit

Status (2026-10-05): **NOT_IMPLEMENTED** as a SUITE face-orientation editing feature. This is a read-only audit. No product Recipe, UI, renderer, permission or completion count was changed. The frozen inventory records four distinct rows, EV3-0145–0148; the range/default row is a constraint on the three controls, not a fourth pixel effect.

## Official operation boundary

Evoto's primary [Desktop Facial Reshape guide](https://support.evoto.ai/facial-reshape/) and [iPad Facial Reshape guide](https://support.evoto.ai/facial-reshape-ipad/) both describe three Head Pose controls: **Up/Down** changes the face's upward/downward orientation; **Left/Right** turns it toward camera left/right; **Tilt** rotates its apparent orientation counterclockwise/clockwise. Each is −100…+100 with default 0. Their guides say that Facial Reshape analyzes facial structure using AI. The [Mobile support index](https://support.evoto.ai/home/evoto-mobile/) lists Head Pose, but that index alone does not establish identical Mobile control ranges, rendering, or quality. The [iPad Portrait module overview](https://support.evoto.ai/portrait-retouching-ipad/) also cautions that some linked features are Desktop-only. The published pages do **not** specify a transform field, occlusion reconstruction, inpainting/model weights, pixel formula, export format, interoperable Recipe representation, or the degree to which hair/background move. Do not infer those details from the slider labels.

| Frozen row | Documented user operation | Current SUITE and missing boundary |
| --- | --- | --- |
| EV3-0145 Up/Down | Change face orientation upward or downward. | Face Brightness changes face-oval luminance; whole-photo Rotate/Crop cannot turn a face in depth. **NOT_IMPLEMENTED**. |
| EV3-0146 Left/Right | Turn the face toward camera left or right. | No yaw/side-view-aware geometric warp, new-surface reconstruction or per-person direction control. **NOT_IMPLEMENTED**. |
| EV3-0147 Tilt | Change face orientation counterclockwise or clockwise. | `rotationDegrees` rotates every pixel of the photograph in multiples of 90°, potentially changing frame dimensions. It is not a selected-face Tilt control. **NOT_IMPLEMENTED**. |
| EV3-0148 Range/default | Each of the three sliders uses −100…+100, neutral 0. | No Head Pose field, three sliders, neutral reset, or interpretation of those values in SUITE. **NOT_IMPLEMENTED**. |

Other Facial Reshape feature groups (Face Shape, eyebrows, eyes, nose, mouth, Symmetrize) are separate candidate families, not implied by Head Pose or by a detected face oval. Likewise, the iPad Full Body Reshape **Head** size control is not a synonym for a head-orientation control.

## Actual SUITE boundary

`apps/web/src/processing/faces.mjs` uses a SHA-pinned MediaPipe FaceLandmarker, but its current public detection reduces landmarks to an **oval** polygon, anchor and provenance. `outputFacialTransformationMatrixes:false` and `outputFaceBlendshapes:false`; neither a 3D pose estimate nor a surface/occlusion map is emitted. `apps/backend/src/portrait-recipe.ts` allows only `face_brightness` for a person target. `apps/web/src/processing/pure.mjs` applies that brightness within a face oval, then uses `rotateCropPixels` for **whole-frame**, quarter-turn photo rotation and Crop. `apps/web/src/session.mjs` exposes the photo `rotationDegrees` and face-brightness adjustment, and `apps/web/src/editor-ui.mjs` offers a 90° Rotate button and Face Brightness, not Head Pose. Shared Undo/Redo, save/reload, Preset and Final mechanisms do not make an absent transform real. An invented `headPose` extension may be storable by generic Recipe validation but is rejected by the supported Web pixel renderer; it is not an implemented adjustment.

The [dedicated audit regression](../apps/web/tests/head-pose-completion-audit.test.mjs) verifies the frozen rows, rejects a Head Pose alias as a `face_brightness` portrait target, demonstrates global photo rotation on pixels, and confirms an invented Head Pose Recipe does not silently become an effect. These are absence/safety tests, **not** pose-estimation, identity preservation, realistic pixel output or device-parity PASS.

## Smallest safe next connection

First obtain an expressly consented, selected-person **pose inventory** tied to a fresh authenticated Asset, Original SHA, model SHA, saved Recipe revision and source dimensions. It would need dependable pitch/yaw/roll estimates, face/neck/hair/background separation, confidence and hard refusal for cropped, profile, obstructed, multiple ambiguous or model-drift cases. The present face oval is insufficient; merely enabling the model's transformation matrix would be a pose estimate, not a pixel-changing feature.

Then evaluate one opt-in **SUITE-specific limited manual transform** (for example a bounded, explicitly named selected-face in-plane roll), not an Evoto-equivalent `Tilt`, with typed non-destructive Recipe, deterministic source/Proxy projection, unaffected-region/alpha tests, Before/After, Undo/Redo, CAS save/reload, Preset scope and Final consistency. Only after consented representative real-photo/RAW tests across poses, hair/neck/background, identities and devices should any broader up/down or left/right view synthesis be considered. Evoto-equivalent three-direction results and exact −100…+100 visual semantics remain a separate model/quality/privacy Gate.

No live Desktop/iPad/Mobile device, real RAW, Cloud, or official pixel-equivalence test was performed. The independent-candidate completion count remains unchanged (0/44 under the current strict Gate).
