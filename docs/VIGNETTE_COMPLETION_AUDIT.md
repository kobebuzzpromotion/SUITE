# EV3-0570 Mobile Post-Crop Vignetting — completion audit

## 2026-10-05 Author portable Presetの現状追補（旧表より優先）

後続実装で、写真非依存のtyped `postCropAdjustments.vignette` 5値はAuthor portable Presetの保存・適用・再読込へ接続された。`author-vignette-portable.test.mjs`と`author-vignette-trial-product.test.mjs`が保存経路と実Trial HTTP/SQLite上の再適用を検証する。旧表の「Author / Community portable Presetは一律拒否」は監査時点の履歴で、少なくとも**Authorについては現在の実装を表さない**。写真固有Cropや未知post-crop fieldは引き続き拒否し、Community製品公開、iPad/iPhone実機、実RAW、Cloud、元製品12等の同等性は証明していない。監査試験AUDIT02もtyped正例/写真固有・未知負例へ更新した。元候補全要素0/44は維持する。

Status: **PARTIAL / NOT COMPLETE**. This is a read-only comparison of the current SUITE implementation, not an Evoto pixel-parity or mobile-release certification. No existing product source, Recipe contract, Cloud resource, or original image was changed for this audit.

## Source and scope

The repository's candidate inventory lists five suboperations, `EV3-0570`–`EV3-0574`, in `docs/EVOTO_AUDIT/EVOTO_FEATURE_MASTER.md:580-584`: Amount, Midpoint, Roundness, Feather, and Highlights. [Evoto's primary Color documentation](https://support.evoto.ai/color-adjustments-module/) identifies them as a creative **post-crop** effect, separate from original-image Lens Vignetting. It says Creative Effects can be saved in presets and synced to selected photos. It does **not** publish an exact rendering formula or slider-to-pixel mapping; SUITE's 8-bit sRGB algorithm must not be described as equivalent.

## Suboperation evidence

| Candidate | Original described behavior | Current SUITE evidence | Boundary |
| --- | --- | --- | --- |
| EV3-0570 Amount | Negative darkens and positive brightens the edge | `apps/web/src/processing/vignette.mjs` signed range -100…100 and real pixel operation; Editor slider `vignette.amount` | SUITE sRGB formula, not original pixel parity |
| EV3-0571 Midpoint | Controls reach toward center | Same processor/Editor, range 0…100; `vignette-controls.test.mjs` tests changed pixel falloff | Original numeric scale/formula unknown |
| EV3-0572 Roundness | Changes vignette shape | Same processor/Editor, range -100…100; dedicated side/corner test | Original shape formula unknown |
| EV3-0573 Feather | Controls edge softness | Same processor/Editor, range 0…100; dedicated transition test | Original curve unknown |
| EV3-0574 Highlights | Protects/restores bright edge areas | Same processor/Editor, range 0…100; bright/dark edge test | Original highlight weighting unknown |

`apps/web/src/processing/pure.mjs:174-178` applies the effect to the already rotated/cropped RGBA output. `apps/backend/src/photo-policy.ts` validates the typed five-control `postCropAdjustments` Recipe extension. `apps/web/src/session.mjs:341-349` updates that extension through normal adjustment/Undo/Redo machinery. Existing `postcrop-vignette-renderer.test.mjs`, `vignette-controls.test.mjs`, `postcrop-vignette-controls-recipe-policy.test.mjs`, and `session-safety.test.mjs` cover synthetic pixels, schema, history, durable mock reload, and Final. `apps/web/tests/fixtures/vignette-editor-browser-fixture.mjs` describes a Trial HTTP/SQLite + Editor/Worker synthetic non-RAW exercise for five sliders, crop, save/reload, Final, and Original SHA. Its Node bundle test alone is **not** evidence that the Chrome exercise ran; no real RAW, mobile device, or published Cloud behavior is certified here.

## Cross-feature completion gates

| Gate | Current evidence | Status |
| --- | --- | --- |
| Web UI, Preview/Final, Recipe, Undo/Redo, save/reload | Product paths and synthetic tests above | Implemented for the SUITE Web path; actual mobile/RAW parity unverified |
| Author / Community portable Preset | `apps/web/src/preset-author/preset-author-contract.mjs:258-274` rejects `postCropAdjustments`; `apps/web/preset-policy.mjs` accepts only globals and `postDecodeAdjustments` | **Missing** for vignette Save/Apply/Reload; rejects rather than silently dropping |
| Personal / Workspace Preset | Node `apps/backend/src/workspace.ts:79-89,372-445` allows typed full-Recipe presets other than photo-bound B/W/Add Shadow; this does not prove an Editor product mount, selective application, or mobile sync | Product E2E **not verified** |
| Selected-photo Sync | At the initial audit, only whole-Recipe Batch Apply, Levels-only and Glow-only actions existed. Subsequent implementation added `batch-vignette-sync.mjs`, `EditorSession.batchSyncVignette` and the Editor's separate Vignette-only action. It merges only the typed post-crop extension with per-target CAS and independently reported rows. Authenticated local Trial HTTP/SQLite and Session/UI unit paths now pass. | Actual Chrome fixture bundles but its browser run is **NOT_RUN** because Chrome's CDP channel closed in this environment; not mobile or Cloud Sync |
| Cross-device/mobile | `apps/web/src/cross-device-compat.mjs` conservatively rejects `postCropAdjustments` as an unverified extension. No SUITE native/mobile effect UI or renderer was identified in this repository. | **Missing/unverified**; Web != Mobile Release |
| Original-product match | Official formula, range mapping, real-photo comparison and device behavior unavailable | **NOT_VERIFIED** |

## Next small, safe implementation path

The first audited gap, a **vignette-only, version-fixed selective sync**, is now wired to the Web Editor separately from full-Recipe Batch Apply. Authenticated local Trial HTTP/SQLite cases pass; the real-Chrome Editor/Worker fixture is prepared but browser execution is still required. Then decide and document whether photo-independent vignette settings should be portable for Author/Community/Personal/Workspace presets before changing the current deliberate fail-closed policy. Real mobile/RAW/Cloud and product-formula parity remain separate gates.

Dedicated regression: `apps/web/tests/vignette-completion-audit.test.mjs`. It proves the five-control typed post-crop render, the Author portable-preset gap, and the separate Sync method; passing it does not complete EV3-0570.
