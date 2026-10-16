# Capture-date export naming evidence — 2026-10-04

## Decision

`EV3-0766 Capture Date – Original Filename` is **NOT_CONNECTED / DATE_UNVERIFIED** in SUITE. The installed RAW path supplies a bounded LibRaw `time_t`-shaped number, but neither the original `DateTimeOriginal` calendar fields nor `OffsetTimeOriginal` nor the decoder's conversion convention reaches the naming path. Calling `new Date(seconds * 1000)` and formatting UTC or the browser's local zone would invent a shooting calendar date. An Asset's `createdAt` is registration/import time, not capture time.

## Primary-source interpretation

- [LibRaw's `libraw_imgother_t` documentation](https://github.com/LibRaw/LibRaw/blob/master/doc/API-datastruct.html) defines `time_t timestamp` as “Date of shooting” but does not specify a source offset, UTC conversion, or which camera tag prevailed. Its [structure definition](https://github.com/LibRaw/LibRaw/blob/master/libraw/libraw_types.h) has that numeric timestamp but no paired original-date/offset fields. This identifies a possible shooting-time signal, **not** a trustworthy calendar date at the camera.
- [CIPA's Exif date/time mapping, Table 12](https://www.cipa.jp/std/documents/e/DC-X010-2017.pdf) distinguishes `DateTimeOriginal` (`0x9003`, original-data generation, no timezone in that field) from `DateTimeDigitized` (`0x9004`, digital-data storage) and defines `OffsetTimeOriginal` (`0x9011`) separately as its offset from UTC. A wall-calendar `DateTimeOriginal` can carry a capture day even if no offset exists, but that does **not** establish an absolute instant or a named geographic timezone. The offset, when present, is an offset, not a time-zone ID or DST history.
- The [Evoto export guide](https://support.evoto.ai/how-to-use-import-export/) lists “Capture Date – Original Filename” and an example but does not publish metadata-tag priority or timezone/fallback rules. SUITE must not claim an undocumented Evoto-equivalent choice.
- LibRaw's [usage example](https://www.libraw.org/node/35) explicitly sets `TZ=UTC` for a TIFF date-stamp formatting example. This is output formatting in an example, **not proof** that this package's input `timestamp` represents UTC or preserves the camera's date. A [LibRaw forum thread](https://www.libraw.org/node/1866) notes timestamp's one-second precision and reports that older parsing used both EXIF `DateTimeOriginal` and `DateTimeDigitized`; this is historical supporting context, not a verified parsing guarantee for the bundled WASM binary.

## Trace of the installed path

| Boundary | Observed contract | Date implication |
| --- | --- | --- |
| `node_modules/@colorhythm/libraw-wasm/dist/index.d.ts:177-196`, `dist/index.js:367-372`, `dist/libraw-types.js:292-306` | `getImgOther()` reads the native `libraw_imgother_t`; exposed `timestamp` is `bigint`. The wrapper does not expose original EXIF date characters or `OffsetTimeOriginal` through this object. | The JS caller cannot reverse a possibly normalized numeric value into the original camera wall date. |
| `apps/web/src/processing/raw.mjs:3-10,25-41` | After `decoder.open`, `decodeRaw` accepts only positive `bigint` values through 2100 and adds `libRawTimestampSeconds: string` plus `libRawTimestampTimezone: 'UNVERIFIED'` to optional metadata. Zero/out-of-range/non-bigint/throw yields no timestamp fields. | It deliberately does **not** create `captureDate`; pixel decode and Original SHA are independent. |
| `apps/web/src/processing/worker.mjs:26`, `processing/index.mjs:39` | The Worker returns `decodeRaw` result through the processing facade without date interpretation. | No timezone evidence is added at the Worker boundary. |
| `apps/web/src/session.mjs:160-194` | Import and cache/reopen retain `decoded.metadata` associated with an Asset; cache binding checks Asset ID/SHA. Final decode obtains fresh Original bytes, but its metadata is not fed to batch naming. | Cached metadata contains only the unverified numeric evidence, not a proven capture day; Final freshness alone does not fix semantics. |
| `apps/web/src/browser-local-api.mjs:116-124` | `createdAt` is supplied by `this.clock()` at Asset registration. | Explicitly import/registration time; never substitute it for shooting time. |
| `apps/web/src/export-naming-context.mjs:70-71` | `capture-date-original` throws `EXPORT_CAPTURE_DATE_UNAVAILABLE`. `export-naming.mjs:54-63,103` can validate and format an **already trusted** `YYYYMMDD`/`YYYY-MM-DD` input. | The pure planner is ready; no trustworthy product input is connected. |

`apps/web/tests/raw-timestamp.test.mjs` checks the bounds and a **mocked LibRaw** path, including no `captureDate` field. It does not validate any real RAW brand, original EXIF tags, timezone, or output name. No actual RAW file was used for this audit.

## Proposed input contract, conditional on new evidence

Do **not** unlock naming from `libRawTimestampSeconds` alone. If a future bounded metadata reader can verify the **immutable Original bytes** (Asset ID and SHA-256) and read the original EXIF `DateTimeOriginal` characters directly, it may return a distinct record such as:

```text
{ sourceAssetId, sourceSHA256,
  captureCalendarDate: 'YYYYMMDD',
  captureDateSource: 'EXIF_DateTimeOriginal_0x9003',
  offsetTimeOriginal: '+HH:MM' | '-HH:MM' | null,
  offsetEvidence: 'EXIF_OffsetTimeOriginal_0x9011' | 'NOT_PRESENT' }
```

Validate the exact EXIF field type/length and real Gregorian date; reject blanks, zero placeholders, malformed dates, duplicate/conflicting tags, truncated/oversize metadata and SHA mismatch. `DateTimeDigitized`, file modification, Asset creation, browser locale and user/system timezone are not silent fallbacks. For this filename method, the raw `DateTimeOriginal` **wall-calendar date** can be used without converting through a timezone if the product explicitly adopts that semantics; when an offset is absent, keep it `NOT_PRESENT` and never claim a UTC instant. If product policy requires a verified offset as well, fail closed when `OffsetTimeOriginal` is absent or invalid. The parent must choose and document that policy before wiring the UI/Session; neither choice is proved to match Evoto's unpublished rule. In either case, an actual camera RAW corpus and timezone-boundary cases are needed before a product PASS.

Current status remains `EXPORT_CAPTURE_DATE_UNAVAILABLE`; no source, Recipe, RAW Original, Worker, UI, or storage contract was changed by this audit.
