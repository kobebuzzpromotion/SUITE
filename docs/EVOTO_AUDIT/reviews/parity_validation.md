# Independent parity validation — BLOCK

Reviewed 2026-10-03. Audit only; frozen source reviews were not modified. This is a targeted independent semantic review plus structural traversal of all three primary JSONs, not a second complete 240-article certification.

240 articles / 2,167 headings / 4,506 source-bound records. **This is not 4,506 unique features.** No A/B/E pixel parity, formal P0/P1, product changes or release approval.

## Concrete findings

- **PV01 HIGH** — Article-level iPad/Windows/macOS platform set is inherited by iPad-specific operations. Desktop is mentioned for shared credits/preset portability, not as evidence for each tether/capture/storage fact. Impact: False Desktop availability and loss of per-platform operational differences. Records: S965:tether-modes:wired7-brands, S965:tether-modes:wireless4-brands, S965:tether-originals:inside-app-not-auto-saved-photos, S965:wireless-data:local-network-transfer-no-mobile-data, S965:batch-editing:sync-to-selected-project-photos. Correction/check in JSON.

- **PV02 HIGH** — Mobile subscription offer records inherit iPhone/Android/iPad/Windows/macOS from the credit portability statement. Shared credit use does not prove that all storefronts sell the same offer or grant identical terms. Impact: Conflates purchase eligibility, entitlement use and feature pricing; may conflict with current plan cards. Records: S21313:subscription:monthly-30-days, S21313:subscription:60-credits, S21313:subscription:yearly-365-days, S21313:subscription:800-credits, S21313:add-on:60-credits. Correction/check in JSON.

- **PV03 MEDIUM** — Dedicated flags remain NOT_DOCUMENTED despite prose documenting the precise condition. Floor reflection explicitly supports preset/sync; mask person preset/sync is global, not individual; export format behavior explicitly maps RAW to JPEG. Impact: Machine counts overstate unknowns and can drop known conditions even when evidenceSummary is accurate. Records: S25871-W013, S25871-W014, S25871-W015, S25871-W016, PHOTO-S603-107, S600-W031. Correction/check in JSON.

- **PV04 MEDIUM** — confirmationStatus contains PHOTO_CONFIRMED, VIDEO_CONFIRMED or INFORMATION_CONFIRMED, which are availability/type labels, not the seven required confirmation enums. Impact: Schema consumers can treat type as evidence certainty or reject the dataset. Records: workflow.json:all 1073 confirmationStatus fields. Correction/check in JSON.

- **PV05 HIGH** — NOT_DOCUMENTED is a truthy string and masks documented f.credit. Measured 163 workflow records are affected. Impact: Known credit amounts/conditions disappear into UNKNOWN; no accurate credit reconciliation or counts. Records: integrate-semantic.mjs:credit selection, S26868-W002, S25811-W012, S26029-W025. Correction/check in JSON.

- **PV06 HIGH** — Fallback ignores workflow f.category. Its 458 WORKFLOW records use availability INFORMATION_CONFIRMED and therefore become INFORMATION, then are excluded from controlRows. Impact: Export, project/cloud and preset workflows vanish from candidate totals and platform/credit gate denominators. Records: integrate-semantic.mjs:type fallback/controlRows, S600-W012, S13365-W004, S596-W002. Correction/check in JSON.

- **PV07 MEDIUM** — Leica article texts are exactly equal, but contentSHA256 differs. SHA-only duplicate detection misses 11 identical operation pairs. The S1531 URL says Fujifilm while body/title describe Leica. Impact: False corroboration and possible duplicate operation inflation; must not infer Fujifilm USB PTP from the URL. Records: S1531:*, S1538:*, integrate-semantic.mjs:duplicateSourceBodies. Correction/check in JSON.

- **PV08 HIGH** — Gate majorUnknownRows only examines control-row confirmationStatus. It omits severe policy termsStatus UNKNOWN; especially CC06/CC07 have confirmed rule existence with unknown detailed terms and no CONFLICTING status. Impact: Severe unknown count can understate blockers even while overall status remains hard-coded BLOCK. Records: CC01, CC04, CC05, CC06, CC07, integrate-semantic.mjs:gate. Correction/check in JSON.

- **PV09 MEDIUM** — iPad source explicitly says these subsliders activate only after Amount is adjusted. Review records list independent adjustment but omit the activation dependency from facts/notes. Impact: Operation-flow parity can be misread as six always-active sliders; a heading disposition does not prove every constraint was retained. Records: S1897:eye-makeup:saturation, S1897:eye-makeup:luminance, S1897:eye-makeup:dimensionality, S1897:lip-makeup:saturation, S1897:lip-makeup:luminance, S1897:lip-makeup:dimensionality. Correction/check in JSON.

- **PV10 MEDIUM** — Article-level PHOTO_FEATURE class labels Favorites organization and global Undo workflow facts as photo-feature records. Impact: Mixes editing controls, workflow operations and feature inventory totals. Records: S25871-W019, S25871-W020, S25871-W021, S25871-W022. Correction/check in JSON.

- **PV11 HIGH** — Current policy conflict source set does not include S21313 or S965, so the source-ID/keyword integrator cannot attach CC04 to the old Mobile/iPad export-only claims. The old facts remain source-confirmed without their current-applicability conflict. Impact: A consumer may reuse historical 'all editing free/each export1credit' or Desktop-only benefit claims as current Mobile policy. Records: S21313:export-credit:1-edited-photo-1-credit, S965:credit:free-editing-1-credit-edited-export, CC04, integrate-semantic.mjs:policySourceIds. Correction/check in JSON.

- **PV12 MEDIUM** — Article uncertainty retains an unquantified angle range, but per-option records omit the explicit strong-side-profile failure caveat. Generic notes only say guarantees unknown. Impact: Feature extraction preserves controls but loses a known operational limitation needed for identity/quality comparison. Records: PHOTO-S615-030, PHOTO-S615-031, PHOTO-S615-032, PHOTO-S615-033, PHOTO-S615-034, PHOTO-S615-035, PHOTO-S615-036, PHOTO-S615-037. Correction/check in JSON.

## Key measured failures in the initial integration tool

- 163 known workflow credit conditions are hidden by a truthy `NOT_DOCUMENTED` default.
- 458 workflow operations become INFORMATION and leave the operational gate denominator.
- 458 photo records have empty platform scope; these are unresolved, not zero or absence.
- S1531/S1538 have identical text but different acquisition hashes: 22 source records represent 11 duplicated Leica operation pairs.
- Five severe credit records have UNKNOWN terms. Counting only CONFLICTING status misses CC06/CC07's unknown terms.
- The tool stays BLOCK, so these are incorrect evidence semantics/counts, not an observed false product PASS.

## Targeted constraint checks

- Contacts: 11-style catalog independently documented on Desktop/Mobile/iPad. Color/Amount tutorial platform remains unspecified. No inherited per-eye, pupil, iris, catchlight preservation or Contacts-specific batch claim.

- All Makeup: 22 vs18 suites;14 vs8 eyeshadow;17 vs14 lashes;9 vs6 liner retained. Male/tween/child/infant catalog labels are not blanket age eligibility. Independent sides documented for brows/lashes; not all Contacts. iPad activation dependency defect PV09.

- Eye / Iris / Catchlight: Human12catchlight styles distinct from Pet General/Indoor/Outdoor categories and Pet batch. Regular glasses glare excludes tinted lenses. Human iris constraints require PV12.

- Strong Glare: Group-person selection and already-applied ordinary-glare detection caveat retained; does not prove person-ID batch.

- Clothing Moire: Clothing/fabric luminance/color moire Generate and alternate entry confirmed; no invented amount slider, texture guarantee or local/cloud architecture.

- Body Hair: Visible arm hair/mask/review/Generate; Asia availability. No leg/body-wide or tattoo protection claim.

- Liquify Repair: After-the-fact line/texture repair and other-app distortion range control kept separate from ordinary manual liquify and SUITE background-protection prevention.

- People / Smart Removal: Magic0.5/Quick0.1/People0.3 per application separate from final export. Manual masks/subject protection scoped to their tools. Source original remains unchanged for Apply Current; no undocumented local-execution assertion.

- Expand / Fusion: AI Generative Expand3candidates and iterative new images distinct from ordinary Crop Expand. AI Lab Batch supports People/OldPhoto/Detail; Fusion has separate saved-scene batch. Unsaved Fusion results lost on exit; background required and subject must remain in canvas.

- Relight: Mobile lighting styles confirmed; not proof Mobile-only or Desktop/iPad availability. Generate/compare/export workflow, charge/network/output limits unknown.

- Shadow / Reflection / Spill / Halo: Retain original shadow, added Soft/Hard/Drop, shadow opacity/blur/gradient/blend, background spill, floor reflection distinct. Black/white edge automatic sync excludes manual brush corrections. Water reflection conditional on water detection. Floor reflection flags need PV03.

- Hair generation: Golden Blonde selected-person Generate distinct from ordinary volume/stray/smooth/color tools. Hairstyle consistency is a claim, not verified identity/edge guarantee. Smooth Hair auto-frizz coupling must stay tool-scoped.

- Old Photo Restoration: Default colorization ON;2K/4K; tiny/blurry faces may be redrawn and accessories affected. No identity guarantee or new SUITE omission approval.

- Mask regions / batch: Person/Ears/Apparel and background Reef are explicit text. Unlabeled image-only regions remain unconfirmed. Person preset/sync global-not-individual, Pet entire-pet, custom luminance, hidden-mask export exclusion retained; normalize flags via PV03.

- Print / Multi Export: Selected photos × selected export presets; per-effect variants; RAW→JPEG/alpha→PNG;JPEG8bit/TIFF8/16bit/PNG and output sharpening retained. Preset variants not same as unique photo features; availability does not prove SUITE print rendering.

- Tether: Vendor/model/method distinctions preserved, except FAQ platform inheritance PV01. Fujifilm URL duplicate cannot prove Fuji setup. iPad wireless format/filter behavior must not be forced onto Desktop. No actual camera/device tests performed.

- Cross-platform preset: Desktop-origin XMP/CUBE preset requires file availability/download; no direct Mobile upload. Desktop↔iPad most-compatible with unsupported adjustments partial; Mobile→Desktop not established by this source.

- Cloud limitations: Cloud Space Windows/macOS, iPad not yet, iPhone unknown.4000px<2MB previews/original download on export,30day expiry and deletion described only as competitor behavior. Do not import RAW deletion into SUITE.

- Processing labels: Generate/Fast/AI and named algorithms do not establish local/cloud execution. LOCAL_NETWORK_TRANSFER describes tether transport only. Broad privacy FAQ cloud claims cannot be distributed across all photo options. No new benchmark or device proof.

## Mobile color policy cannot be closed from the present public documents

US App Store3.3.3 is the current listing;3.2.5/Aug28 is a historical release entry. Japan's color-plan effective date is2026-08-31 11:00JST; its Mobile rollout is explicitly subject to store approval. Neither establishes the user's active iPhone/iPad tier quota.

Required: official region/storefront/SKU-specific eligible feature and quota matrix; live build/activation confirmation; verified account entitlement conditions; mixed-export/re-export/generation/retry rules. An authorized account observation can supplement this, but guessing Desktop terms or using an unrelated account cannot resolve it. Do not purchase plans or spend credits without separate authorization.

## Scope and pending follow-up

Input hashes, record IDs, source locators, corrections and validation expectations are in [parity_validation.json](parity_validation.json). Initial integration script hash: `3385858EE2A9A3D48EC69F14C04B5D894EB2813913AEB39F3C51E4B0D487939A`.

Index reverse review subsequently published and checked: all261 original hrefs are resolved, but26 new routes remain OPEN (22 possible English articles;4 malformed routes). **PV13 HIGH:** the initial integrator ignores this enlarged discovered universe when reporting unresolved index links. Add a separate discovered-route gate; acquired-universe0 is not global0. ALIAS72/78 point from iPad labels to Desktop S600/S616 and cannot transfer Desktop options to iPad. Localized navigation and camera-model rows are not new editor features.

web_features remains unpublished. Re-review parent tool corrections and that later supplement before integrated evidence acceptance. All13 findings are open until a new semantic overlay is checked.

124 Windows PASS baseline unchanged. Native82, Mac, real RAW, iPhone and iPad remain NOT_RUN. Audit/Feature Parity/Mobile Release remain BLOCK.
