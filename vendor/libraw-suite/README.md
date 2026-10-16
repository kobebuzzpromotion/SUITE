# SUITE LibRaw native source extension — ABI 1

Source only: **not compiled, tested, installed, or deployed**. Existing published
1.1.1 WASM does not have these exports. The application must detect all four
exports and ABI 1 before relying on them. Never treat this directory as proof
that a browser can decode a larger RAW.

## Provenance and preparation

Installed wrapper: `@colorhythm/libraw-wasm` 1.1.1 (MIT). The extension targets
LibRaw **0.21.4**, whose actual C++ interfaces were consulted. The installed npm
archive contains no full native source or verified submodule commit. An exact
upstream wrapper release tag/submodule pairing has **not** been established.
This is an explicit 1.1.1-wrapper / 0.21.4-native source compatibility target,
not a claim of byte identity with the published WASM.

Use a separate, already acquired source checkout containing the wrapper package
and its initialized `LibRaw` checkout. Select/review full commits first. Then,
when source preparation is authorized, run:

```text
node vendor/libraw-suite/prepare.mjs /absolute/path/to/packages/libraw.wasm WRAPPER_40_HEX_COMMIT LIBRAW_40_HEX_COMMIT
```

The script requires clean checkouts, checks the supplied exact commits,
package version, native version macros, licenses and upstream source anchors.
It performs **no network, installation, build or test**. It adds C++ definitions
to the upstream `customFunctions` integration point, causing the existing
Emscripten EXPORTED_FUNCTIONS list to include all four names. It also adds native
wrapper TypeScript methods and tracks the open input length. Existing licenses
are left intact. Original files are preserved with `.suite-original` suffixes.
The deterministic preparation record contains commit IDs and before/after SHA256.

Any interrupted preparation without its final record is incomplete; inspect
and restore the two original files from those backups before retrying. Do not
run a build on a partially prepared checkout. Preparation is intentionally not
a repeatable in-place patch on an already patched checkout: use a fresh checkout
of the same pinned commits for reproduction.

Later, under separate build authorization, the upstream `build:wasm`,
`build:bindings`, and `build:ts` steps produce a matching JS/WASM/types artifact.
Keep those outputs together; preserve the preparation record and license/source
materials. No generated artifact is included here. Compiler/Emscripten versions
must also be pinned by that later build process for binary reproducibility.
In particular, replacing only the `.wasm` is insufficient: deploy its matched
generated `libraw.mjs` glue (which attaches the four `_suite_*` exports), wrapper
JavaScript, generated typed-structure bindings and WASM together. The preparation
uses the upstream `-fexceptions` build already present in wrapper 1.1.1; do not
silently disable exception support in the later build.

## Native contract

All symbols have C linkage; Emscripten module names add a leading underscore.
Pointers are wasm32 addresses; output pointers address writable, distinct int32
slots. Callers own input bytes and output slots and retain them until return.
Only valid in-heap pointers may be passed. Calls are synchronous; no cancellation
callback or cross-thread sharing is provided. A terminated isolated Worker can
cancel work without reusing that decoder.

| C symbol | Arguments / result |
| --- | --- |
| `suite_libraw_abi_version` | `() -> int`, exactly 1 |
| `suite_libraw_plan_full_geometry` | `(const void* input, size_t length, unsigned mb, int* width, int* height) -> int status` |
| `suite_libraw_set_max_raw_memory_mb` | `(libraw_data_t* decoder, unsigned mb) -> int status` |
| `suite_libraw_get_processed_format` | `(libraw_data_t* decoder, int* width, int* height, int* colors, int* bits) -> int status` |

Zero status means success; errors use existing LibRaw error constants. Memory
budget accepts 1..512 MiB. Set it **before unpack**, preferably before open.
The planner sets it on a separate RAII decoder before `open_buffer`, sets
half-size 0 / default orientation / Fuji rotation on, and calls
`adjust_sizes_info_only`. It returns already-upright `sizes.iwidth/iheight`.
It never unpacks, alters the active decoder, multiplies a half-size result, or
uses raw-sensor dimensions as a substitute. This contract is for default full
geometry (no custom crop, user orientation, aberration or geometry parameters).

After successful `dcraw_process`, query processed format **before**
`dcraw_make_mem_image` to reject oversized bitmap allocations. The format call
also requires a native image and CONVERT_RGB progress; caller must still honor
the success result of dcraw_process (a progress bit alone is not its substitute).
Output bits are 8/16 and colors 1..4; the app may impose stricter RGB8 constraints.
Public wrapper additions: `LibRaw.suiteABIVersion()`,
`decoder.setMaxRawMemoryMB(mb)`, `decoder.planFullGeometry(mb)`, and
`decoder.getProcessedFormat()`. ABI absence throws, never reports availability.

`max_raw_memory_mb` limits LibRaw's selected RAW allocations, **not aggregate
browser memory**. Half-size processing does not avoid full sensor unpack. Keep
separate compressed-input, source metadata, processed-pixel, JS-copy and WASM
heap budgets. Querying format happens after processing allocations; it prevents
the later bitmap copy, not all preceding allocations. Unsupported or over-budget
inputs must fail rather than claim universal 96MP support.

## Primary sources and licensing

- [Wrapper source/build integration](https://github.com/colorhythm/libraw-wasm/tree/main/packages/libraw.wasm)
- [LibRaw 0.21.4 geometry planner](https://github.com/LibRaw/LibRaw/blob/0.21.4/src/utils/utils_libraw.cpp)
- [LibRaw 0.21.4 processed format](https://github.com/LibRaw/LibRaw/blob/0.21.4/src/postprocessing/mem_image.cpp)
- [LibRaw 0.21.4 allocation guards](https://github.com/LibRaw/LibRaw/blob/0.21.4/src/decoders/unpack.cpp)
- [LibRaw 0.21.4 types](https://github.com/LibRaw/LibRaw/blob/0.21.4/libraw/libraw_types.h)

LibRaw is dual LGPL-2.1 / CDDL-1.0; choose and satisfy the applicable distribution
terms, preserving COPYRIGHT, licenses and required corresponding source/notices.
Wrapper MIT licensing does not make a linked LibRaw WASM wholly MIT. This folder
does not replace upstream licenses or certify distribution compliance.
