# Evoto deep audit — reviewable inventory, OPEN

Checked2026-10-03. Zero-Miss Gate: **BLOCK**. No product features implemented; original147/frozen6, legacy162audit and pricing business baseline remain unchanged.

## Counting and source boundary

{
  "officialArticles": 240,
  "officialCategories": 62,
  "officialHeadings": 2167,
  "majorCuratedCategories": 15,
  "confirmedNamedFeatureGroups": 120,
  "inquiryRows": 34,
  "suiteAdvantageCandidates": 14,
  "localProcessingCandidateRows": 904,
  "cloudProcessingCandidateRows": 143,
  "identityLockCandidateRows": 90,
  "explicitCreditRows": 22,
  "conditionalCreditFreeRows": 156,
  "priority": {
    "P0": 50,
    "P1": 190,
    "P2": 786,
    "P3": 26
  },
  "documentedAIGenerationWorkflowGroups": 19,
  "inventoriedControlOptionRows": 1086,
  "documentationConfirmedControlOptionRows": 1052,
  "unconfirmedControlOptionRows": 34,
  "technicalGenerativeFeatureCount": "UNKNOWN_NOT_FINAL",
  "priorityFeatureGroups": {
    "P0": 7,
    "P1": 28,
    "P2": 81,
    "P3": 4
  }
}

These are curated named-feature groups/control-option rows, not a complete Evoto feature count. 2167 headings are observations, never 2167 features. Every 240 article and 62 category has an index entry. Complete semantic article count is0 because screenshots/options, unsupported condition guarantees and release reconciliation remain unfinished.

## Gate

{
  "status": "BLOCK",
  "checkedOn": "2026-10-03",
  "unmappedOfficialArticle": 187,
  "unmappedOfficialFeature": "UNKNOWN_NOT_ZERO",
  "unmappedOfficialHeading": 1873,
  "unclassifiedSuiteStatus": 0,
  "noEvidenceConfirmedFeature": 0,
  "unsupportedInquiryRows": 34,
  "requestChecksOpen": 724,
  "releaseNotes12MonthSweep": "OPEN",
  "appStoreSweep": "OPEN",
  "pricingCurrentOfficialPage": "OPEN",
  "categoryReverseReconciliation": "OPEN",
  "completeSemanticArticleCount": 0,
  "notes": "Named-feature lower bound only. All articles are indexed; most are not fully semantically audited. Do not report audit complete or MissingFeature0. H/I describe platform/uniqueness scope, not implementation success."
}

Unmapped articles and all OPEN heading/check IDs are enumerated in their ledgers. Unknown official feature count prevents a false0claim even if index links or exact labels happen to match. Release sweep must cover2025-10-03 through2026-10-03, including official release notes, Mobile/iPad updates and App Store/currentofficialpricing. Those sources are not fully acquired/accepted by this offline run.

## Evidence and classifications

A implemented+verified; B code+unverified; C formal spec+not implemented; D unspecified detail; E alternative (maturity separate); F optional omission candidate pending user; G official existence/guarantee not confirmed; H explicit platform scope (maturity separate); I SUITE value candidate (maturity separate). No H/I impliesPASS. Granular options conservatively useD unless exact requirement evidence is reviewed; broadportrait/color/backgroundspecdoesnotprovegranularrequirements. Fsuggestionsareonlynotes,noexclusionsapproved. A/B/Epixelparityclaims0.

Desktop Windows/macOS share Desktop manuals; Mobile and iPad use separate article evidence. Platform index membership is routing evidence only. Explicit no-support overrides are retained. Video articles are indexed asVideoandnotcountedasphotofeatures; Instantalsoseparate. NOT_CONFIRMED isunknown,notabsence.

## Findings that repair the category-level audit

- Contacts11styles independently documented onDesktop/iPad/Mobile. Namedcolors, iris/pupil/catchlight guarantees, contact-specificleft/right/sync and all SUITE ContactColor/Amount/Brightness/Saturation/Transparency preservation/person/setbatch candidates still need review. ProcessingcandidateL1/L2, BASE_INCLUDED; not a formal requirement.
- Makeup has22suitesonDesktop/Mobilevs18oniPad; eyeshadow14vs8, lashes17vs14, eyeliner9vs6. Preserve platformcounts and activation-dependent controls.
- DesktopAILab:GenerativeExpand, BackgroundFusion, Magic/QuickRemoval, ClothingMoiré, PeopleRemoval, StrongGlare, BellySlimming, AISky, FaceShadow, GrassFill, GoldenBlonde, AsiaarmBodyHair, LiquifyBackgroundRepair, OldPhotoRestoration and DetailEnhance. BatchEdit explicitly onlyPeopleRemoval/OldPhoto/DetailEnhance; Fusion has separate sceneBatchworkflow. CandidateCloudL4/L5isSUITEplanning,notevidencedEvotoarchitecture.
- Mobile ownAILab hasRelight NaturalLight/FaceShadow/GoldenHour and MotionBlur GhostFlow. MobileconfirmeddoesnotproveMobile-only. ManualReshapehas8toolsandcannotpreset/sync/batch.
- Replacement has extraction/preserved-area/fillregion/fillmode/blend/opacity/size/position/blur/spill/reflection controls. AIretainedshadow and Soft/Hard/Dropaddedshadowseparate; opacity/blur/gradient/blendconfirmed; direction/distanceunknown. Reflectioncontrolsunenumerated.
- DesktopexporthasRAW→JPEGandalpha→PNGoriginal-formatbehavior, 8/16-bitTIFF, scale/PPI/PPC,9namingpatterns,multipresetoutputs,watermark andoutputsharpening. MobileexportexplicitlyPhotos/Files/sRGB/profile/time/share; donotinheritDesktoprules. iPadtetherexportusesfilepicker/local/connected iCloudDrive/GoogleDrive.
- CloudSpaceexplicitWindows/macOSandnotyetiPad. iPhoneunknown. EvotoalreadyhasSmartPreview/lazyload/original-on-export/versioning; avoidclaimingthosealoneareSUITEunique.
- Creditfreeonlyactivepaidplan Desktop>=6.1 / Instant>=1.8 usinglistedfreefeatures; notphotoMobile/iPad. Anyoutsidefeatureegportrait/AIlooks/match/multiimageexport1credit. Sameunmodifiedoriginalre-exportruleandfirstpaidcreditnonrefundretained. Magic0.5/Quick0.1/People0.3 perapplicationseparatefromexportcredits; allotherAILabamount/retry/previewunknown.

## Priorities and remaining work

P0candidates:ContactsgranularityandMobilewired/wirelesstetherworkflow. P1candidates:StrongGlare, ClothingMoiré, LiquifyBackgroundRepair, Smart/PeopleRemoval, BackgroundFusion, Relight, EdgeCleanup, Spill, Shadow andpresetcrossdevicecompatibility. Prioritiesareplanningcandidates,nocommittedAIrequirements. OldPhoto/MotionBlur/PetfitP3/Fdiscussion,butremainininventory. IdentityLockcandidatescovergaze/facecomposition/restoration/generativeportraitinteractions; measuredartifactriskunknown.

The162-rowlegacyinventorycannotestablishanewfeaturecountbystringcomparison. Detailednewgranularityislistedhere; exactpreviouslymissedsemanticfeaturesandnetnewcountremainOPENpendingrow-to-rowreview. Recommendedadditionalrequirementsarecandidatesonly; noformalspecadditionuntilcompleteinventoryandbatchedP0/P1decision.

## Reproduction

Run`node scripts/evoto-deep-audit.mjs`withtheprovidedexternalcacheor`EVOTO_SUPPORT_SNAPSHOT`path. Run`node scripts/evoto-deep-audit-validate.mjs`forstructural/evidenceintegrity. StructuralvalidationcannotturntheZero-MissGatePASS. Cachehash:d9a854e1d24aee60626f3da3451cfaeeaadf4c9e406010aa1f89013cdd0ca302. GeneratedfilesretainonlyshortUIlabels/facts/sourcehashes,notfullarticles.
