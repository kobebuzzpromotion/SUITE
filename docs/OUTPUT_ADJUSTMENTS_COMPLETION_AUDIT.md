# EV3-0773 Desktop Output adjustments — completion audit

Status: **PARTIAL / original seven-option feature NOT COMPLETE** (2026-10-04). This is a read-only product audit plus a dedicated regression test, not a new preset implementation or a change to the 44-candidate completion count.

## Scope and source

The [official Import & Export guide](https://support.evoto.ai/how-to-use-import-export/) describes output sharpening choices for Screen or Print at Low, Standard, and High strengths, plus No Sharpening. The repository's [EV3-0773–0779 audit rows](EVOTO_AUDIT/EVOTO_EXPORT_MATRIX.md) track these as seven subitems. The guide does not publish a kernel, numeric gain/radius/threshold mapping, color-space formula, or byte-exact output contract. None can be inferred from the labels.

| Audit ID | Original option | SUITE product UI and API | Evidence-based status |
| --- | --- | --- | --- |
| EV3-0773 | Screen Low | No named choice; `{kind:'screen',strength:'low'}` rejected | **NOT_IMPLEMENTED** as original option |
| EV3-0774 | Screen Standard | No named choice; `{kind:'screen',strength:'standard'}` rejected | **NOT_IMPLEMENTED** |
| EV3-0775 | Screen High | No named choice; `{kind:'screen',strength:'high'}` rejected | **NOT_IMPLEMENTED** |
| EV3-0776 | Print Low | No named choice; `{kind:'print',strength:'low'}` rejected | **NOT_IMPLEMENTED** |
| EV3-0777 | Print Standard | No named choice; `{kind:'print',strength:'standard'}` rejected | **NOT_IMPLEMENTED** |
| EV3-0778 | Print High | No named choice; `{kind:'print',strength:'high'}` rejected | **NOT_IMPLEMENTED** |
| EV3-0779 | No Sharpening | SUITE `{kind:'none'}` is the default; no **additional export-stage** sharpening | **SUITE absence-of-stage only**; cross-product image equivalence unverified |

SUITE additionally has a distinct, explicitly manual `{kind:'manual',gain,radiusPx,thresholdLuma}` mode. Its bounds are `gain 0..2`, `radiusPx 0.5..3`, and `thresholdLuma 0..64`. This is SUITE's deterministic 8-bit sRGB unsharp-mask implementation, **not** a translation of any of the six named original options. The exact validator rejects unsupported named presets before export work begins ([source](../apps/web/src/export-output-adjustments.mjs)); the product form exposes only “追加しない” and “手動で調整” ([source](../apps/web/src/export-output-adjustments-ui.mjs)). The separate Editor Sharpness adjustment must not be conflated with this export-only stage.

## End-to-end contract observed in SUITE

| Boundary | Observed implementation/evidence | Limit |
| --- | --- | --- |
| Single-photo UI | The Editor has a separate output-sharpening form for JPEG/PNG/TIFF and passes its validated choice to `exportFinal` ([UI](../apps/web/src/editor-ui.mjs)). Ordinary direct export buttons use the default `none` when they do not pass this option. | No Screen/Print choices; manual draft is not a persistent preset. |
| Batch Final UI | A second form passes the same option to `startBatchFinal`/`exportBatchFinal` for explicitly selected saved assets ([UI](../apps/web/src/editor-ui.mjs)). | The option is one export invocation's input, not a per-photo saved edit. |
| Final processing | Session validates first, resolves saved Recipe/asset authority, renders Final, resizes, applies export sharpening, then encodes ([session](../apps/web/src/session.mjs), [worker entry](../apps/web/src/processing/index.mjs)). The dedicated synthetic non-RAW test fixes the `resize → sharpen → encode` order in both single and Batch and sees changed manual pixels. | Dedicated test uses a mock Blob encoder and does not prove a real JPEG/PNG/TIFF file. |
| Existing browser proof | [Progress ledger](UNIQUE_FEATURE_PROGRESS.md) reports actual Chrome/Worker, synthetic non-RAW, two-asset PNG/TIFF single and Batch checks: manual differs from none, invalid/cancel/second failure produce no partial Batch links, keyboard/Escape and 390px layout checked, Original SHA/Recipe unchanged. | A comparable manual JPEG browser/encoded-file result is not recorded in that evidence; real RAW/Cloud/OS output are separate gates. |
| Recipe, save/reload, Undo/Redo | `outputSharpening` is passed as an export argument, not written into photo Recipe or history. The form's Cancel restores its draft. The dedicated test confirms saved Recipes and Original SHA stay unchanged. | Reopening a photo or Undo/Redo does not recover or step through an output-sharpening choice; this is current export-only design, not evidence that the six original presets work. |
| Failure safety | Validator rejects unsupported named options before decode/render/encode/save; invalid numeric values reject. Batch Final has a whole-batch completion contract, with no partial download result on failure. | Does not establish external-product output parity. |

The dedicated regression is [output-adjustments-completion-audit.test.mjs](../apps/web/tests/output-adjustments-completion-audit.test.mjs): `OUTPUT-AUDIT-01` rejects all six named combinations before processing; `OUTPUT-AUDIT-02` checks actual SUITE manual pixel processing, single/Batch stage order, Original SHA, saved Recipe, and absence of writes with synthetic non-RAW frames. It does not claim Chrome, LibRaw, Cloud, real printer/screen calibration, or encoded-file conformance.

## Completion gate

Do **not** count EV3-0773 as complete on the strength of manual sharpening. The six named original options are absent and deliberately fail closed; their numerical behavior is undisclosed. A future implementation would need an explicitly approved SUITE-owned Screen/Print behavior/specification (without claiming original-product pixel parity), UI and API selection, single and Batch saved-asset authorization and whole-batch failure checks, real Worker JPEG/PNG/TIFF output evidence including the currently unrecorded manual JPEG browser path, and real RAW/Cloud gates where applicable. If persistence of export preferences is desired, that is a separate product/contract decision; do not silently extend Recipe v1 or turn the export-only setting into photo Undo history.
