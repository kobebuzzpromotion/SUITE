# Portrait candidate — independent review

Checkpoint: 2026-10-03. One photo-local `face_brightness` operation only. No full retouch, cross-photo identity, commercial release or visual-quality PASS.

## Executed Windows checks

`npm run build` succeeded. `node --test dist/apps/backend/tests/portrait-recipe.test.js` ran 13 tests: 13 PASS, 0 FAIL. This is TypeScript validation, SQLite/CAS and storage-byte verification, not Apple execution or photo processing.

- Strict plain JSON: root schema/engine/asset UUID/checksum and canonical UTC timestamps; target UUID, `adjustmentType: face_brightness`, numeric EV `value`, bounded anchor. `exposureEV` is a Swift computed convenience, not a second wire value.
- Missing/unknown/null fields, unsupported engine/control, invalid/duplicate UUIDs, nonfinite/out-of-range EV, invalid anchors, 65 targets and invalid calendar dates rejected.
- Different asset or SHA rejected at validator and persistence boundaries, including Workspace current/conflict writes.
- Typed target IDs/anchors and unrelated extension fields survive SQLite reopen. Two targets may be reordered without values following array positions.
- Explicit older/newer document snapshots test persistence of Undo/Redo intent; this is not execution of the Apple UI/history engine.
- Initial target inventory cannot acquire another face anchor or replacement UUID after a neutral revision. Same UUID/anchor may reappear with a changed value.
- Stale CAS retains the committed revision and arbitrary original storage bytes. These bytes are explicitly not photographs or RAW.
- Broken JSON and parse-valid unsupported-engine corruption fail closed after reopen; damaged rows remain unchanged.

First run exposed real failures in calendar rollover acceptance and backend asset binding. Main corrected both, then the original 9 tests passed. One initial IoU exact-equality failure was test precision (`1.0000000000000004`), corrected to tolerance, not credited as a product fix. Four later tests increased the executed set to 13 PASS.

## Native tests authored, not executed

`packages/SuiteCore/Tests/SuiteCoreTests/PortraitRecipeTests.swift`: 11 tests. Wire shape/date validation, typed target isolation, illegal identity, asset/checksum binding, actual EditHistory Undo/Redo/fork, non-destructive store CAS/reopen, corruption protection, known UUID continuity within hidden history, persisted-history replacement rejection, and future-created/clock-correction editing. Swift compiler is absent here; compilation and execution are NOT_RUN.

`apps/apple/Tests/PortraitPipelineTests.swift`: 9 tests. Unique/reordered detector matching; missing/ambiguous/reused detections; actual Core Image masked compositor isolation; zero-value no-op; two disjoint masks without double application; scaled compositor consistency; blank-image refusal; missing-Original refusal; hidden-redo inventory reuse with neutral values. These are Apple tests, NOT_RUN. Synthetic compositor tests do not establish Vision face accuracy, real segmentation, full pipeline Proxy/Final parity or camera support.

## Design review and remaining acceptance

1. Saved UUID is a photo-local identifier, not biometric or cross-photo identity. Matching re-detects anchors with unique IoU candidates, then checks unique person-instance masks. UI selection explicitly uses UUID, not face array index. Initial detector quality remains unverified.
2. Backend all-revision validation closes changed-anchor/new-ID rebinding and semantic-corruption reads. Swift checkpoint validates all history entries, including hidden redo; ProjectStore now compares replacement history to the prior inventory. Sol's neutralPortrait helper reuses UUIDs from retained hidden redo. These Swift guards still need Native execution. OPEN limitation: if all portrait inventory is erased from a local checkpoint history and a later save re-enrolls targets, there is no durable tombstone/identity ledger across that gap. This must not be described as lifetime UUID continuity.
3. Preview and Final share a single portrait stage before rotation/crop. Source inspection shows Proxy-only ordinary viewing and Original-required Final. This is not evidence of visual equality, no leakage, or absence of double application in the complete Apple pipeline.
4. Masks are source-local fresh Vision outputs; no whole-image fallback is acceptable. Required real fixtures: two distinct people, close/overlapping people, profile/occlusion, no face, upright/EXIF rotations, small Proxy versus full Original, difficult background and insufficient mask. Verify untouched person/background pixels against suitable tolerance and before/after/Undo/reload behavior.
5. Zero-valued saved targets still require matching/mask verification. This conservative behavior may block neutral recipes if detection becomes unavailable; it is not silent success.
6. Main corrected clock rollback editing: `settingExposure` validates the old recipe and uses max(previous updatedAt, local now), preserving createdAt. An independent Swift future-created regression is authored but NOT_RUN. Revision remains the concurrency clock.
7. Unsupported RAW stays fail-closed: no embedded-thumbnail Final. Original import-orphan recovery is separate main design work; do not delete unsynced copied Originals as cleanup.

Required Native completion evidence: successful Apple build/tests, real two-person PhotoPipeline roundtrip with fresh masks at Proxy and Final, selection/save/relaunch/Undo/Redo, crop/rotation interaction, no-face/error behavior, checksum/original-byte preservation, and actual supported/unsupported RAW fixtures. No Windows source scan replaces these.

## Scope and handoff

Only independent tests and this report were edited by this reviewer. Production edits belong to main/Sol. Original 124-test Windows baseline and native82 evidence were not rewritten. Main owns full-regression integration. New Native cases remain NOT_RUN; Mobile release remains BLOCK.

## Final read-only diff review — additional findings

Review checkpoint after tests were frozen. No product/test edits in this pass; the following are source-level findings or explicit conditional counterexamples, not measured Native defects.

### PRF01 — stale target reference remains editable after failed revalidation (MEDIUM)

Location: `EditorModel.preparePortraitTargets`, approximately lines 132–179, and `setFaceBrightness` guard. A prior successful target reference/selection is not cleared before a subsequent analysis attempt or in its failure handler. On failure, isBusy returns false while portraitReferencePreview and selectedPortraitTargetID still refer to the earlier success; slider edits can therefore be committed after fresh verification failed. Main preview clearing in refreshPreview is separate and does not clear this target-reference state.

Minimal correction: invalidate reference and selected target before revalidation, and retain only newly successful target state. Regression: successful analysis → select target → inject proxy/mask/thermal failure → assert reference/selection cleared and a slider invocation adds no history. Native EditorModel execution remains NOT_RUN.

### PRF02 — overlapping soft masks can reprocess already-adjusted pixels (MEDIUM, conditional pixel path)

Location: `PortraitPipeline.apply`, approximately lines 98–110. Every adapter receives accumulated output. Different person-instance IDs and per-face average coverage do not establish that the final feathered masks are pointwise disjoint. Where two allowed masks overlap, the second face exposure is applied to pixels already changed by the first. For two +1EV exposures and mask values 0.5/0.5, sequential linear blending yields 2.25× the source at that pixel; the current disjoint-mask test cannot detect this case.

Minimal correction: reject meaningful overlap between final target masks before rendering, or specify and implement one source-based composition with explicit pixel ownership. Regression: overlapping soft masks plus nearby real people; verify order independence/no unintended compounded exposure and untouched background. This mathematical conditional is not an assertion that a particular Vision fixture produced overlap. Native test not authored in this frozen pass and NOT_RUN. No separate export-stage duplicate portrait call was found: the shared apply stage is invoked once per render source; validation discards its result rather than baking it into Proxy.

### PRF03 — unique IoU candidate is not sufficient proof of same person for subsets (HIGH safety limitation)

Location: `PortraitPipeline.resolveTargets`, approximately lines 55–65, combined with subset-permitting continuity. Current-target subset A at x=0.10,width=0.20 may uniquely match a different detected face B at x=0.15,width=0.20 with the same y/height (IoU=0.60) if A is missed and B is the only current detection. The current candidate-count/reused-index checks accept this geometry. Mask matching then confirms B is a person, not that B is the originally selected A. This is a deterministic geometry counterexample; occurrence in real Vision output is unmeasured.

Minimal correction: carry/rematch the complete original inventory and reject unresolved competing/original anchors, or refuse subset rendering/near-neighbor matches until the complete inventory uniquely matches. A stricter threshold alone reduces but does not prove identity. Regression: initial nearby A+B inventory, current subset A, fresh detection B-only must fail closed; reorder-only genuine matches must remain valid. Cross-photo/biometric identity remains unsupported and must not be claimed.

API name check only: Apple's [person-instance request revision](https://developer.apple.com/documentation/vision/vngeneratepersoninstancemaskrequestrevision1) and [scaled mask API](https://developer.apple.com/documentation/vision/vninstancemaskobservation/generatescaledmaskforimage%28forinstances%3Afrom%3A%29) document the used symbols/signatures. This does not confirm Package target composition, availability compilation or runtime mask quality; main separately owns the Package source-list and RAW initializer corrections.

## Post-fix independent regression checkpoint — latest result

The original 13 Windows tests were rerun **before adding tests**: 13 PASS / 0 FAIL. Then three independent regression tests were added and the complete portrait set rerun: **16 PASS / 0 FAIL**, with `npm run build` successful. New cases are:

1. Partial initial inventory fails continuity, while complete reordered UUID/anchor inventory with changed values succeeds.
2. Overlapping saved face anchors fail both portrait and enclosing Recipe validation before persistence/rendering.
3. Shape-valid, parse-valid UUID replacement or anchor rebinding in a hidden SQLite revision is detected even when the newest revision is healthy. Read and subsequent save fail; the exact damaged row, three-revision count, original asset metadata, arbitrary original storage bytes and SHA are preserved. No actual photograph or RAW was used.

Native test readiness is now **12 SuiteCore + 11 Apple = 23 authored tests, all NOT_RUN**. The earlier subset-positive Core expectation was intentionally changed to rejection because the supported continuity policy now requires the complete initial inventory. Added Native tests cover overlapping wire anchors, missing/extra detector faces, nearby overlapping saved/detected faces, and successful reordered complete matching. These are not a replacement for Apple compilation, real masks, actual faces, image quality, RAW or device testing.

Fix review states, limited to the specific source guard:

- PRF01: `RESOLVED_SOURCE_GUARD_ONLY`. Both analysis start and catch clear the target reference and selected UUID. Injected-failure EditorModel execution is still NOT_RUN.
- PRF02: `RESOLVED_SOURCE_GUARD_ONLY`. Saved and detected bounding boxes must be nonoverlapping; final face masks are explicitly zero outside their matched boxes before composition. This removes the identified overlap path under the declared validated geometry. Actual mask-edge/render behavior remains NOT_RUN.
- PRF03: `RESOLVED_TARGETED_CONSTRAINT_ONLY`. Continuity requires the entire initial UUID inventory; detection count must match it, with unique UUIDs, nonoverlapping boxes and unique assignments. The earlier subset/missing-face counterexample now fails. This is not biometric identity proof, does not establish correctness for all detector errors, and makes crowded/overlapping faces explicitly unsupported rather than silently corrected.

Unchanged open limitation: deleting every portrait-bearing local history entry can erase the durable reference inventory; no lifetime tombstone exists. No cross-photo identity, visual quality or release PASS is granted. Production files were not edited by this reviewer.

## Final inventory-loss guard checkpoint — supersedes the gap above

Main added a fail-closed ProjectStore save guard: if the persisted checkpoint has a portrait inventory, an incoming complete history with no portrait-bearing entry is rejected with `portraitInventoryLoss` before encoding or atomic replacement. The prior checkpoint remains intact. Cursor Undo with the portrait retained in hidden redo remains allowed. Source review confirms the guard closes the identified normal-save inventory-erasure path without a schema or sidecar change; it does not claim recovery from external filesystem tampering.

Added one independent asynchronous Core test: save portrait → save cursor Undo while retaining hidden inventory → fork a global edit that discards the only portrait-bearing redo → require the exact inventory-loss rejection → reopen and assert unchanged checkpoint, metadata bytes, redo availability and target UUIDs. This test is authored but **NOT_RUN**.

Final readiness counts: **16 Windows tests unchanged (last executed 16 PASS / 0 FAIL); 13 SuiteCore + 11 Apple = 24 Native tests authored, all NOT_RUN**. No further Windows execution is claimed for this Swift-only addition. Main owns the final full regression.

Unresolved UX: a global edit fork after Undo to before the first portrait can now produce an in-memory draft that cannot be saved under this guard. Existing save-failure handling retains the draft and blocks unsafe continuation, but there is no user-facing resolution flow yet. Do not silently discard the draft, rewrite identity, remove original files, or label the failed save successful. The safety guard is not completion of that UX.

## Common person-geometry gate — independent path checkpoint

New exclusive `person-integrity-paths.test.ts`: **14 Windows DATA_ONLY tests PASS / 0 FAIL**. `npm run build` passed. A subsequent combined run of the unchanged prior 16 portrait tests plus the new 14 tests returned **30 PASS / 0 FAIL**. This is separate from the historical 124-test baseline and from main's full regression. An initial new-test run failed because its fixture incorrectly requested zero-byte asset metadata and expected an unprefixed geometry fingerprint; both test assumptions were corrected to the existing API without production changes.

| Individual ID | Executed Windows boundary (not Native UI/rendering) |
| --- | --- |
| PGI-INVENTORY | Control-independent UUID uniqueness, normalized geometry and overlap rejection |
| PGI-GEOMETRY-ID | Deterministic diagnostic geometry hash; complete UUID/geometry continuity and reordered inventories |
| PGI-SAVE | Workspace save rejects replacement UUID; head and version count unchanged |
| PGI-RELOAD | Same-process SQLite recipe reload preserves per-person values and anchors |
| PGI-RESTART | New repository/Workspace connections reopen the same SQLite state; not application relaunch |
| PGI-CONFLICT-VERSION | Stale valid branch preserves head; illegal person inventory cannot enter branch |
| PGI-CONFLICT-RESOLUTION | Explicit chosen-branch data saves against current version; changed anchor rejected |
| PGI-UNDO | Explicit earlier-value snapshot save; no Swift Undo command executed |
| PGI-REDO | Explicit later-value snapshot save/reopen; no Swift Redo command executed |
| PGI-HIDDEN-HISTORY | Parse-valid UUID tamper in non-head conflict branch rejects latest/history/getVersion/save; damaged exact row, row count and asset metadata preserved |
| PGI-ASSET-SWITCH | Separate asset retrieval and bindings remain distinct despite same SHA; no UI switch executed |
| PGI-RECIPE-COPY | A recipe cannot be saved to B even when Original SHA is identical |
| PGI-PERSON-RESELECT | UUID-keyed data lookup after reordering and unknown UUID continuity rejection; not EditorModel selection |
| PGI-EXPORT-RECIPE | Retrieved export-candidate data rejects wrong asset/SHA; no export operation or pixels executed |

The hidden-history test deliberately bypasses the immutable SQL UPDATE trigger only inside its isolated temporary database to simulate external corruption; production read/write APIs are then required to fail without auto-repair. New PGI fixtures contain metadata and recipe data, not photographs or original image bytes. Original-byte preservation is tested by the prior 16-test set using explicitly non-image storage bytes; neither suite proves RAW decode or photo quality.

Source review: the shared identity gate is independent of adjustment controls and compares the complete initial UUID-to-geometry inventory, bound to asset ID and original SHA. Current portrait adapters additionally validate their strict control/version/date wire contract. The diagnostic geometry hash is not a segmentation mask checksum, not proof of a person's identity, and not original-byte verification. Future Skin/Eyes/Body implementations still need to call this gate and provide their own tested rendering controls; their presence or safety is not implied by these tests.

Four additional Apple tests invoke actual EditorModel methods with an isolated `storageRoot`: valid second-person selection then unknown UUID/no-reference clears selection; actual missing-Proxy revalidation clears selection/reference at start and failure; missing-checkpoint asset switch clears selection without relabeling the prior recipe; missing-input import clears selection and preserves prior recipe. A UIImage instance is only a seeded stale-state marker, never a fake successful detector/proxy fixture. Actual PhotoPipeline/ProjectStore instances provide the failure boundaries; no mock-success adapter is used.

Latest Native readiness: **13 Core + 15 Apple = 28 authored tests, all NOT_RUN**. This includes the four new EditorModel tests; Windows does not compile or execute them. Actual application relaunch, Swift UI Undo/Redo, selection/revalidation, real multi-person masks, preview-to-Final consistency, untouched-person/background pixels, double-application prevention, device memory/thermal behavior and supported/unsupported RAW remain Native execution gaps. Native82 evidence, frozen specifications and product release status are unchanged. Mobile release remains BLOCK.

## Frozen export-plan binding checkpoint

Added one Core serialized ExportPlan test: a valid plan roundtrips, while changing only its outer asset ID or SHA rejects decoding with `exportPersonAssetBinding`. Added one Apple asynchronous metadata-boundary test (`PGI-EXPORT-PERSISTED-BINDING`): a real temporary ProjectStore checkpoint and checksum-correct **non-image `.bin`** file establish the positive validation control; a detached, shape-valid same-revision plan that swaps two known UUIDs' anchors must fail `PhotoPipeline.validate` with `unsupportedRecipe`. The test requires unchanged non-image Original bytes, unchanged saved checkpoint and no destination file. It never calls render/decode and is not RAW or pixel QA.

Source inspection confirms Final validation now requires the persisted checkpoint's exact revision/parameters and Original URL before accepting its portrait inventory; it does not replace a rejected plan with latest values. No new concrete source defect was identified in this targeted change. A stale plan after a newer saved revision is intentionally rejected; durable historical-snapshot retry is still NOT_IMPLEMENTED, not a tested capability. Apple async API compilation and execution remain unverified on Windows.

Final frozen readiness: **14 Core + 16 Apple = 30 Native tests authored, ALL NOT_RUN**. Windows tests were not edited or rerun for these Swift-only additions: the last independent execution remains **16 existing + 14 PGI = 30 PASS / 0 FAIL**. Main owns the final whole-repository regression. These counts are different suites and must not be added into a fabricated Native or visual PASS total.
