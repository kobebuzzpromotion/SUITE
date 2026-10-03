# 統合テスト一覧 — 2026-10-03

親担当の最新実行: Windows124 PASS / 0 FAIL / 0 SKIP。Native82 NOT_RUN。Mac/実RAW/iPhone/iPadは未実行。ソース存在や文書検査を機能PASSとして数えない。旧WIN-001〜034 / NAT-001〜045は維持。

完全なコマンド・stdout・stderr・SHA・各要件への対応は [regression.json](evidence/integrated-2026-10-03/regression.json)。スイート単位の集計をテストケース数へ混ぜない。

| ID | 結果 | Scope | テスト名 | ファイル |
| --- | --- | --- | --- | --- |
| NAT-046 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testGeneratedPNGDefaultJPEGQuality100AndExplicitLowerQuality | apps/apple/Tests/CropExportPipelineTests.swift |
| NAT-047 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testGeneratedPNGTIFF8And16BitNoneAndLZW | apps/apple/Tests/CropExportPipelineTests.swift |
| NAT-048 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testGeneratedPNGPreservesTransparentAndPartialAlphaPixels | apps/apple/Tests/CropExportPipelineTests.swift |
| NAT-049 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testGeneratedPNGColorConversionIsNotOnlyAnICCTagChange | apps/apple/Tests/CropExportPipelineTests.swift |
| NAT-050 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testGeneratedPNGPhysicalCropHasExactPixelsAndDensityInAllFormats | apps/apple/Tests/CropExportPipelineTests.swift |
| NAT-051 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testGeneratedPNGPortraitCropAppliesRotationExactlyOnce | apps/apple/Tests/CropExportPipelineTests.swift |
| NAT-052 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testGeneratedPNGInsufficientResolutionPublishesNoFinalOrPartial | apps/apple/Tests/CropExportPipelineTests.swift |
| NAT-053 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCropCheckpointReopenAndFixedExportPlanIgnoreLaterRecipeEdits | apps/apple/Tests/CropExportPipelineTests.swift |
| NAT-054 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCropMissingOriginalWaitsInsteadOfExportingProxy | apps/apple/Tests/CropExportPipelineTests.swift |
| NAT-055 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testGeneratedPNGMetadataRemoveDoesNotLeakDescriptiveExif | apps/apple/Tests/CropExportPipelineTests.swift |
| NAT-001 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testImportPreviewAndFullExportPreserveOriginal | apps/apple/Tests/PhotoPipelineTests.swift |
| WIN-035 | PASS | WINDOWS_BACKEND_NOT_IOS | CE01 twelve ratios preserve required labels and independent IDs | apps/backend/tests/crop-export.test.ts |
| WIN-036 | PASS | WINDOWS_BACKEND_NOT_IOS | CE02 every fixed ratio yields centered in-bounds crop in both source orientations | apps/backend/tests/crop-export.test.ts |
| WIN-037 | PASS | WINDOWS_BACKEND_NOT_IOS | CE03 custom ratio supports nonstandard positive proportions without changing inputs | apps/backend/tests/crop-export.test.ts |
| WIN-038 | PASS | WINDOWS_BACKEND_NOT_IOS | CE04 JSON print catalog equals portable TypeScript and has 37 source-backed entries | apps/backend/tests/crop-export.test.ts |
| WIN-039 | PASS | WINDOWS_BACKEND_NOT_IOS | CE05 A0 double and B0 double are independent exact physical presets | apps/backend/tests/crop-export.test.ts |
| WIN-040 | PASS | WINDOWS_BACKEND_NOT_IOS | CE06 A-series and JIS B-series contain full required dimensions | apps/backend/tests/crop-export.test.ts |
| WIN-041 | PASS | WINDOWS_BACKEND_NOT_IOS | CE07 all 21 photo print labels retained; KG and postcard are not conflated | apps/backend/tests/crop-export.test.ts |
| WIN-042 | PASS | WINDOWS_BACKEND_NOT_IOS | CE08 all 37 presets validate in portrait and landscape and calculate pixels independently | apps/backend/tests/crop-export.test.ts |
| WIN-043 | PASS | WINDOWS_BACKEND_NOT_IOS | CE09 preset ID cannot lie about physical dimensions or bypass with custom_size | apps/backend/tests/crop-export.test.ts |
| WIN-044 | PASS | WINDOWS_BACKEND_NOT_IOS | CE10 mm/dpi uses ceiling not floor and does not merely tag DPI | apps/backend/tests/crop-export.test.ts |
| WIN-045 | PASS | WINDOWS_BACKEND_NOT_IOS | CE11 invalid nonfinite and unsafe dimensions are rejected | apps/backend/tests/crop-export.test.ts |
| WIN-046 | PASS | WINDOWS_BACKEND_NOT_IOS | CE12 explicit custom physical size and custom DPI round-trip as plain JSON | apps/backend/tests/crop-export.test.ts |
| WIN-047 | PASS | WINDOWS_BACKEND_NOT_IOS | CE13 physical size rejects one-sided dimensions, mismatching ratio and wrong orientation | apps/backend/tests/crop-export.test.ts |
| WIN-048 | PASS | WINDOWS_BACKEND_NOT_IOS | CE14 normalized crop rejects zero/outside/nonfinite rect and unknown nested fields | apps/backend/tests/crop-export.test.ts |
| WIN-049 | PASS | WINDOWS_BACKEND_NOT_IOS | CE15 Crop settings reject null optional values, missing fields and unknown fields | apps/backend/tests/crop-export.test.ts |
| WIN-050 | PASS | WINDOWS_BACKEND_NOT_IOS | CE16 cropped-source resolution reports worst-axis shortfall and safe recommended DPI | apps/backend/tests/crop-export.test.ts |
| WIN-051 | PASS | WINDOWS_BACKEND_NOT_IOS | CE17 sufficient cropped source requires no upscale and no physical target has no invented DPI | apps/backend/tests/crop-export.test.ts |
| WIN-052 | PASS | WINDOWS_BACKEND_NOT_IOS | CE18 source rotation swaps dimensions once; mm dimensions are already oriented | apps/backend/tests/crop-export.test.ts |
| WIN-053 | PASS | WINDOWS_BACKEND_NOT_IOS | CE19 crop rectangle cannot silently distort the physical or selected aspect | apps/backend/tests/crop-export.test.ts |
| WIN-054 | PASS | WINDOWS_BACKEND_NOT_IOS | CE20 JPEG defaults to quality 100 and explicit quality changes remain explicit | apps/backend/tests/crop-export.test.ts |
| WIN-055 | PASS | WINDOWS_BACKEND_NOT_IOS | CE21 TIFF 8/16 and lossless modes are data model settings, not encoder certification | apps/backend/tests/crop-export.test.ts |
| WIN-056 | PASS | WINDOWS_BACKEND_NOT_IOS | CE22 PNG alpha and bit depth are stored without silently changing their requested values | apps/backend/tests/crop-export.test.ts |
| WIN-057 | PASS | WINDOWS_BACKEND_NOT_IOS | CE23 incompatible formats and unsupported metadata/profile values are rejected | apps/backend/tests/crop-export.test.ts |
| WIN-058 | PASS | WINDOWS_BACKEND_NOT_IOS | CE24 file naming and metadata retain valid settings and reject unsafe paths/placeholders | apps/backend/tests/crop-export.test.ts |
| WIN-059 | PASS | WINDOWS_BACKEND_NOT_IOS | CE25 uncompressed buffer estimate reflects dimensions/bit depth/alpha, not compressed size | apps/backend/tests/crop-export.test.ts |
| WIN-060 | PASS | WINDOWS_BACKEND_NOT_IOS | CE26 Crop/Export payload bridges existing Recipe schema v1 without mutation | apps/backend/tests/crop-export.test.ts |
| WIN-061 | PASS | WINDOWS_BACKEND_NOT_IOS | CE27 Recipe rejects double rotation risk, wrong stage order and mismatched export DPI | apps/backend/tests/crop-export.test.ts |
| WIN-062 | PASS | WINDOWS_BACKEND_NOT_IOS | CE28 Crop/Export Recipe survives SQLite close/reopen and CAS conflict without changing Original identity | apps/backend/tests/crop-export.test.ts |
| WIN-063 | PASS | WINDOWS_BACKEND_NOT_IOS | CE29 export validation rejects unknown field/null and accepts explicit DPI/metadata policy | apps/backend/tests/crop-export.test.ts |
| WIN-064 | PASS | WINDOWS_BACKEND_NOT_IOS | CE30 changing target DPI explicitly recalculates pixels and does not mutate source crop | apps/backend/tests/crop-export.test.ts |
| WIN-065 | PASS | WINDOWS_BACKEND_NOT_IOS | CE31 four export recommendations retain high-quality settings without renderer certification | apps/backend/tests/crop-export.test.ts |
| WIN-066 | PASS | WINDOWS_BACKEND_NOT_IOS | Crop integration: plain JSON extensions and omitted optional fields survive SQLite reopen | apps/backend/tests/crop-integration.test.ts |
| WIN-067 | PASS | WINDOWS_BACKEND_NOT_IOS | Crop integration: CAS conflict keeps committed crop, original key, bytes and checksum immutable | apps/backend/tests/crop-integration.test.ts |
| WIN-068 | PASS | WINDOWS_BACKEND_NOT_IOS | Crop integration: invalid crop/export, nulls, pipeline order, rotation and DPI fail before revision write | apps/backend/tests/crop-integration.test.ts |
| WIN-069 | PASS | WINDOWS_BACKEND_NOT_IOS | Crop integration: legacy Recipe remains unchanged and physical crop history preserves output settings | apps/backend/tests/crop-integration.test.ts |
| WIN-070 | PASS | WINDOWS_BACKEND_NOT_IOS | Crop integration: killed SQLite transaction restores committed crop and original bytes on reopen | apps/backend/tests/crop-integration.test.ts |
| WIN-001 | PASS | WINDOWS_BACKEND_NOT_IOS | shared Recipe golden JSON preserves extended intent and refuses lossy/invalid input | apps/backend/tests/failures.test.ts |
| WIN-002 | PASS | WINDOWS_BACKEND_NOT_IOS | stream interruption never publishes incomplete Original; retry resumes by reuploading safely | apps/backend/tests/failures.test.ts |
| WIN-003 | PASS | WINDOWS_BACKEND_NOT_IOS | multipart survives closing/reopening, validates identity/tenant, finalizes only all parts and retries lost acknowledgement | apps/backend/tests/failures.test.ts |
| WIN-004 | PASS | WINDOWS_BACKEND_NOT_IOS | multipart repair fetches only the damaged part, retains old bytes and does not alter healthy parts | apps/backend/tests/failures.test.ts |
| WIN-005 | PASS | WINDOWS_BACKEND_NOT_IOS | ENOSPC provider fault leaves durable multipart checkpoint; retry after capacity restored | apps/backend/tests/failures.test.ts |
| WIN-006 | PASS | WINDOWS_BACKEND_NOT_IOS | actual killed child transaction rolls back; committed Recipe is readable after process termination | apps/backend/tests/failures.test.ts |
| WIN-007 | PASS | WINDOWS_BACKEND_NOT_IOS | ordinary browsing and editing never select Original; Final always does | apps/backend/tests/suite.test.ts |
| WIN-008 | PASS | WINDOWS_BACKEND_NOT_IOS | offline or failed Original acquisition waits, never produces Proxy Final | apps/backend/tests/suite.test.ts |
| WIN-009 | PASS | WINDOWS_BACKEND_NOT_IOS | Proxy eviction is separate and an unsafe Original is never eligible | apps/backend/tests/suite.test.ts |
| WIN-010 | PASS | WINDOWS_BACKEND_NOT_IOS | Cloud Safe requires all seven independently verified conditions | apps/backend/tests/suite.test.ts |
| WIN-011 | PASS | WINDOWS_BACKEND_NOT_IOS | actual immutable object writes reject corrupt upload and preserve previous Original | apps/backend/tests/suite.test.ts |
| WIN-012 | PASS | WINDOWS_BACKEND_NOT_IOS | durable metadata, recipe CAS and soft delete survive reopening without overwriting Original | apps/backend/tests/suite.test.ts |
| WIN-013 | PASS | WINDOWS_BACKEND_NOT_IOS | release gate excludes Web while requiring every mobile/legacy gate; unknown/expired blocks | apps/backend/tests/suite.test.ts |
| WIN-014 | PASS | WINDOWS_BACKEND_NOT_IOS | missing auth configuration fails closed instead of accepting a tenant header | apps/backend/tests/suite.test.ts |
| WIN-015 | PASS | WINDOWS_BACKEND_NOT_IOS | authenticated import → upload verification → recipe → on-demand Original; tenant isolation and stale edits | apps/backend/tests/suite.test.ts |
| WIN-016 | PASS | WINDOWS_BACKEND_NOT_IOS | Mac and each real RAW load gate stay independent from iPhone/iPad device evidence | apps/backend/tests/suite.test.ts |
| WIN-071 | PASS | WINDOWS_BACKEND_NOT_IOS | WG01 authenticated gateway grants bind subject workspace asset purpose and expire across reopen | apps/backend/tests/workspace-access.test.ts |
| WIN-072 | PASS | WINDOWS_BACKEND_NOT_IOS | WG02 live membership revoke defeats an unexpired gateway grant and invalid tokens fail closed | apps/backend/tests/workspace-access.test.ts |
| WIN-073 | PASS | WINDOWS_BACKEND_NOT_IOS | WH01 signed JWT identity enforces workspace/project/asset isolation and blocks every legacy managed route | apps/backend/tests/workspace-server.test.ts |
| WIN-074 | PASS | WINDOWS_BACKEND_NOT_IOS | WH02 invitation accepts only signed verified matching email; viewer may select but cannot edit/export/manage | apps/backend/tests/workspace-server.test.ts |
| WIN-075 | PASS | WINDOWS_BACKEND_NOT_IOS | WH03 two and three editors preserve stale branches, head, editor identity, field diff and history | apps/backend/tests/workspace-server.test.ts |
| WIN-076 | PASS | WINDOWS_BACKEND_NOT_IOS | WH04 shared preset CAS, apply snapshot, delete retention and selection concurrency cross HTTP | apps/backend/tests/workspace-server.test.ts |
| WIN-077 | PASS | WINDOWS_BACKEND_NOT_IOS | WH05 server config gates upload; quota/downgrade never erase immutable bytes or self-grant billing | apps/backend/tests/workspace-server.test.ts |
| WIN-078 | PASS | WINDOWS_BACKEND_NOT_IOS | WH06 metadata browsing performs no Original read; requested download records measured usage and audit | apps/backend/tests/workspace-server.test.ts |
| WIN-079 | PASS | WINDOWS_BACKEND_NOT_IOS | WH07 deduplicated Original and asset/project trash recovery retain bytes and accurate usage buckets | apps/backend/tests/workspace-server.test.ts |
| WIN-080 | PASS | WINDOWS_BACKEND_NOT_IOS | WH08 authenticated gateway grant binds subject/object/purpose/workspace/expiry and live member revocation | apps/backend/tests/workspace-server.test.ts |
| WIN-081 | PASS | WINDOWS_BACKEND_NOT_IOS | WH09 corrupt persisted object invalidates Cloud Safe and refuses Original download | apps/backend/tests/workspace-server.test.ts |
| WIN-082 | PASS | WINDOWS_BACKEND_NOT_IOS | WH10 membership revoke during a slow download stops remaining bytes and retains partial user traffic | apps/backend/tests/workspace-server.test.ts |
| WIN-083 | PASS | WINDOWS_BACKEND_NOT_IOS | WH11 grant expiration during provider inspect refuses streaming and expiration during read stops remaining bytes | apps/backend/tests/workspace-server.test.ts |
| WIN-084 | PASS | WINDOWS_BACKEND_NOT_IOS | WH12 checksum failed upload and interrupted provider read record actual attempt bytes without successful export | apps/backend/tests/workspace-server.test.ts |
| WIN-085 | PASS | WINDOWS_BACKEND_NOT_IOS | WH13 asset/project trash and restore retry reconciles ledger failure after tombstone commit across database reopen | apps/backend/tests/workspace-server.test.ts |
| WIN-086 | PASS | WINDOWS_BACKEND_NOT_IOS | WH14 restoring a project retains individually deleted assets in Trash and restores only live references | apps/backend/tests/workspace-server.test.ts |
| WIN-087 | PASS | WINDOWS_BACKEND_NOT_IOS | WH15 oversized read chunks count only accepted prefix bytes and invalidate verification | apps/backend/tests/workspace-server.test.ts |
| WIN-088 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: logical 100GB through 20TB quotas survive SQLite reopen without 32-bit truncation | apps/backend/tests/workspace-storage.test.ts |
| WIN-089 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: unsafe integers, overflow, invalid evidence and operation reuse fail closed | apps/backend/tests/workspace-storage.test.ts |
| WIN-090 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: member dedup, commit retry and isolated workspace accounting never multiply Original usage | apps/backend/tests/workspace-storage.test.ts |
| WIN-091 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: release retains shared reservation, retry rechecks quota and reuses accounting ID | apps/backend/tests/workspace-storage.test.ts |
| WIN-092 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: independent processes serialize quota reservations without overbooking | apps/backend/tests/workspace-storage.test.ts |
| WIN-093 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: 1.6TB used, 2TB to 1TB downgrade blocks new upload and never deletes Original bytes | apps/backend/tests/workspace-storage.test.ts |
| WIN-094 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: Trash and Recovery preserve all bytes and exclusive category accounting | apps/backend/tests/workspace-storage.test.ts |
| WIN-095 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: live authorizer rejects other workspace, Viewer writes and revoked members | apps/backend/tests/workspace-storage.test.ts |
| WIN-096 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: independent entitlements and remote seat pricing retain unknown prices as null | apps/backend/tests/workspace-storage.test.ts |
| WIN-097 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: idempotent measured-vs-logical traffic and user accounting remain distinct | apps/backend/tests/workspace-storage.test.ts |
| WIN-098 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: usage overflow rolls back and cost estimates never imply a paid subscription | apps/backend/tests/workspace-storage.test.ts |
| WIN-099 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace storage: append-only audit records attribution and transaction actions | apps/backend/tests/workspace-storage.test.ts |
| WIN-100 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace membership lists only authorized workspaces and never crosses Asset or Project boundaries | apps/backend/tests/workspace.test.ts |
| WIN-101 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace invitations require matching verified email and workspace, expire, revoke, and accept idempotently | apps/backend/tests/workspace.test.ts |
| WIN-102 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace live role checks deny Viewer edit/export/delete and Editor administration | apps/backend/tests/workspace.test.ts |
| WIN-103 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace member revoke invalidates existing subject access and stale invitation issuers without owner lockout | apps/backend/tests/workspace.test.ts |
| WIN-104 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace Recipe conflict preserves both immutable versions, parent, editor, diff and current head | apps/backend/tests/workspace.test.ts |
| WIN-105 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace two real worker Editors race on SQLite CAS without Last Write Wins | apps/backend/tests/workspace.test.ts |
| WIN-106 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace three real worker Editors retain all concurrent branches and unchanged Original | apps/backend/tests/workspace.test.ts |
| WIN-107 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace shared Preset snapshots survive update and deletion without breaking saved Recipe | apps/backend/tests/workspace.test.ts |
| WIN-108 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace personal Preset isolation and unsupported Community do not bypass shared management permissions | apps/backend/tests/workspace.test.ts |
| WIN-109 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace Selection CAS preserves winner when two or three users submit the same base | apps/backend/tests/workspace.test.ts |
| WIN-110 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace soft delete and recovery retain object bytes, Recipe versions and Cloud Safe evidence | apps/backend/tests/workspace.test.ts |
| WIN-111 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace audit retains authenticated actor and cannot be read across workspace or altered in SQLite | apps/backend/tests/workspace.test.ts |
| WIN-112 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace Recipe rejects invalid base and invalid payload without losing current revision | apps/backend/tests/workspace.test.ts |
| WIN-113 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace members share one registered Original reference rather than creating per-member copies | apps/backend/tests/workspace.test.ts |
| WIN-114 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace shared Recipe keeps Crop Print DPI and JPEG TIFF PNG settings without modifying Original | apps/backend/tests/workspace.test.ts |
| WIN-115 | PASS | WINDOWS_BACKEND_NOT_IOS | Workspace recovery reconciliation reads deleted Asset and Project state with live delete permission only | apps/backend/tests/workspace.test.ts |
| NAT-002 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCapabilityInventoryIsCompleteButUnconnected | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-003 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testOfflineUsesEligibleLocalRouteAndDoesNotInventCloudSuccess | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-004 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testPrivacyPreventsCloudDespiteCriticalHeat | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-005 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testHeatChangesRouteAndThrottlesConcurrency | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-006 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testMemoryAndQualityAreHardGates | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-007 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testInvalidResourceAndEstimateRejected | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-008 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testProxyRespectsConfiguredTierMemoryAndHeat | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-009 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testJobResumePreservesInputAndRejectsRegressingProgress | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-010 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testReleaseGateRejectsMissingExpiredUnknownWrongBuildAndDuplicateProof | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-011 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testRetryRetainsCheckpointAndIdempotencyIdentity | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-012 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testMobileReleaseBlocksEveryUnmeasuredMacRAWAndLifecycleGate | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-013 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testMacAndRAWProofsCannotSatisfyEitherPhysicalDeviceGate | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift |
| NAT-014 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testLibraryNeverRequestsHighPreviewEvenOnFastLargeDevice | packages/SuiteCore/Tests/SuiteCoreTests/CloudTransferPolicyTests.swift |
| NAT-015 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testZoomAndDeviceChooseConfiguredQualityWithoutOriginalFallback | packages/SuiteCore/Tests/SuiteCoreTests/CloudTransferPolicyTests.swift |
| NAT-016 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testOfflineUsesCachedProxyAndPixelInspectionDoesNotPretendLowResolutionIsFinal | packages/SuiteCore/Tests/SuiteCoreTests/CloudTransferPolicyTests.swift |
| NAT-017 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testOnlyExplicitFinalOriginalTargetsArePromoted | packages/SuiteCore/Tests/SuiteCoreTests/CloudTransferPolicyTests.swift |
| NAT-018 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCellularRequiresExplicitOptInAndPauseOrUnknownNeverTransfer | packages/SuiteCore/Tests/SuiteCoreTests/CloudTransferPolicyTests.swift |
| NAT-056 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE01RequiredRatiosAndCenteredGeometry | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-057 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE02CatalogMatchesSharedFixtureExactly | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-058 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE03AllPhysicalPresetsBothOrientations | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-059 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE04CeilingCustomDPIAndOverflowRejection | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-060 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE05ShortfallUsesCroppedSourceAndSafeRecommendedDPI | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-061 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE06NoPhysicalTargetDoesNotInventDPIOrUpscale | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-062 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE07RotationSwapsSourceExactlyOnceNotMM | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-063 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE08InvalidCropAndMismatchedPresetAreRejected | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-064 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE09StrictPlainJSONRejectsUnknownNestedFieldsAndNull | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-065 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE10SharedWireExampleRoundTripsUnchangedIncludingRecipe | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-066 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE11JPEGDefault100AndExplicitFormatValidation | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-067 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE12TIFFPNGColorMetadataAreOnlyModelCapabilities | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-068 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE13UnsafeFilenameAndUnknownExportSettingRejected | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-069 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE14BufferEstimateIsNotCompressedFileSize | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-070 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE15RecipeStageRotationAndDPIConsistency | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-071 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE17FourRecommendedExportPresetsAreDataOnly | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-072 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCE16CropAndExportPreserveHistoryAcrossProjectStoreReopen | packages/SuiteCore/Tests/SuiteCoreTests/CropExportTests.swift |
| NAT-019 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testUndoRedoAndNewEditDiscardOnlyAbandonedBranch | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift |
| NAT-020 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testExtendedRAWAndAIParametersSurviveHistoryRoundTrip | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift |
| NAT-021 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testHistoryRejectsEmptyOrOutOfBoundsCursorAndUnknownFields | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift |
| NAT-022 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testStoreRoundTripPreservesRedoAndOriginalBinary | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift |
| NAT-023 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testStaleCASAndInvalidRevisionNeverReplaceSavedCheckpoint | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift |
| NAT-024 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testTwoStoreInstancesCannotBothWinSameExpectedRevision | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift |
| NAT-025 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCorruptionAndUnknownSchemaAreNotEmptySuccessOrOverwritten | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift |
| NAT-026 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testInvalidPathChecksumAndOriginalMutationAreRejected | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift |
| NAT-027 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testOrdinaryWorkflowNeverRequestsOriginalAndFinalAlwaysDoes | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift |
| NAT-028 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCloudSafetyIsFailClosedAndBindsAssetRepresentationChecksumAndExpiry | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift |
| NAT-029 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testFinalWaitsForOriginalAcrossOfflineDownloadFailureAndChecksumFailure | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift |
| NAT-030 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testProxyEvictionCannotAuthorizeOriginalOrRecipeDeletion | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift |
| NAT-031 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testCanonicalGenerationIsProtectedEvenIfCallerMarksItRegenerable | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift |
| NAT-032 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testExportFreezesInputRecipeAndRejectsOriginalOverwriteDestination | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift |
| NAT-033 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testSupportedCameraRequiresHardwareEvidence | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift |
| NAT-034 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testOldCloudEvidenceWithoutNewGatesDecodesUnknownAndCannotEvictOriginal | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift |
| NAT-035 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testGoldenFixtureRoundTripsAsIdenticalPlainJSON | packages/SuiteCore/Tests/SuiteCoreTests/RecipeDocumentTests.swift |
| NAT-036 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testPortableValueEncodingHasNoEnumEnvelopeAndRejectsNull | packages/SuiteCore/Tests/SuiteCoreTests/RecipeDocumentTests.swift |
| NAT-037 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testDocumentRejectsUnknownVersionUnknownFieldsAndUnsafeInteger | packages/SuiteCore/Tests/SuiteCoreTests/RecipeDocumentTests.swift |
| NAT-038 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testFiveModesAndNonDestructiveMetadataRoundTripWithoutNumericModeDefaults | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift |
| NAT-039 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testLookUpdateOnlyAffectsFutureCaptureAndDuplicateIngestKeepsOriginalBinding | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift |
| NAT-040 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testExplicitPastReapplyCreatesNewBindingWithoutOverwritingHistory | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift |
| NAT-041 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testUnconnectedAndMissingAnalysisNeverClaimAppliedSuccess | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift |
| NAT-042 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testTargetsArePersonSpecificAndBodyRequiresBackgroundProtection | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift |
| NAT-043 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testOtherPhotoAnalysisAndFixedReferenceMasksCannotBeReused | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift |
| NAT-044 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testAutoOffPhotoAndPersonExclusionsAndIndependentCategorySwitches | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift |
| NAT-045 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testPersonalColorIsOptionalAndCannotSpecifyShapeOrUnacceptedAutomaticSelection | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift |
| NAT-073 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testWorkspaceViewerCannotEditExportOrManage | packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift |
| NAT-074 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testWorkspaceEditorCannotChangeMembersOrBilling | packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift |
| NAT-075 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testWorkspaceAdminCannotPerformOwnerOperation | packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift |
| NAT-076 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testWorkspaceUnknownRoleFailsClosed | packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift |
| NAT-077 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testWorkspaceSwitchRejectsDelayedResponseIncludingReturnToSameWorkspace | packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift |
| NAT-078 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testWorkspaceProjectCannotBeSelectedWithoutWorkspace | packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift |
| NAT-079 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testWorkspaceLogoutInvalidatesScope | packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift |
| NAT-080 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testWorkspaceTenAndTwentyTerabyteUsageDecodeWithoutOverflow | packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift |
| NAT-081 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testWorkspaceDowngradeRetainsUsedBytesAndShowsOverQuota | packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift |
| NAT-082 | NOT_RUN | SWIFT_NATIVE_NOT_EXECUTED | testWorkspaceInvalidStorageAccountingRejected | packages/SuiteCore/Tests/SuiteCoreTests/WorkspaceTests.swift |
| WIN-116 | PASS | PRICING_ARITHMETIC_NOT_BILLING | PR01 missing costs block instead of defaulting to zero | scripts/pricing-model.test.mjs |
| WIN-117 | PASS | PRICING_ARITHMETIC_NOT_BILLING | PR02 complete scenario calculates but cannot grant pricing release | scripts/pricing-model.test.mjs |
| WIN-118 | PASS | PRICING_ARITHMETIC_NOT_BILLING | PR03 zero or negative profit is FAIL even before verified release | scripts/pricing-model.test.mjs |
| WIN-119 | PASS | PRICING_ARITHMETIC_NOT_BILLING | PR04 positive profit below specified target fails target independently | scripts/pricing-model.test.mjs |
| WIN-120 | PASS | PRICING_ARITHMETIC_NOT_BILLING | PR05 fee basis and conservative rounding are explicit | scripts/pricing-model.test.mjs |
| WIN-121 | PASS | PRICING_ARITHMETIC_NOT_BILLING | PR06 fixed first-customer overhead cannot be hidden by assumed growth | scripts/pricing-model.test.mjs |
| WIN-122 | PASS | PRICING_ARITHMETIC_NOT_BILLING | PR07 malformed unsafe negative and missing numeric inputs fail closed | scripts/pricing-model.test.mjs |
| WIN-123 | PASS | PRICING_ARITHMETIC_NOT_BILLING | PR08 supplied evidence is review input not automatic release approval | scripts/pricing-model.test.mjs |
| WIN-124 | PASS | PRICING_ARITHMETIC_NOT_BILLING | PR09 user baseline retains unknown costs and cannot be marked profitable | scripts/pricing-model.test.mjs |
| WIN-017 | PASS | HARNESS_MECHANICS_NOT_RAW | path guard rejects checkout, descendants and ancestors; sibling prefix is not a descendant | scripts/raw-harness.test.mjs |
| WIN-018 | PASS | HARNESS_MECHANICS_NOT_RAW | JPEG/PNG payload detection rejects renamed images without trusting a filename | scripts/raw-harness.test.mjs |
| WIN-019 | PASS | HARNESS_MECHANICS_NOT_RAW | RAF signature is 16 bytes including the trailing space; prefix alone is not accepted | scripts/raw-harness.test.mjs |
| WIN-020 | PASS | HARNESS_MECHANICS_NOT_RAW | absent real RAW set has null counts and is explicitly externally blocked | scripts/raw-harness.test.mjs |
| WIN-021 | PASS | HARNESS_MECHANICS_NOT_RAW | empty dataset is zero observed files, not a successful 100 RAW test | scripts/raw-harness.test.mjs |
| WIN-022 | PASS | HARNESS_MECHANICS_NOT_RAW | manifest measures arbitrary test bytes exactly but rejects them as RAW | scripts/raw-harness.test.mjs |
| WIN-023 | PASS | HARNESS_MECHANICS_NOT_RAW | bounded TIFF metadata reader reports only embedded tags, not camera compatibility | scripts/raw-harness.test.mjs |
| WIN-024 | PASS | HARNESS_MECHANICS_NOT_RAW | unsupported set size is rejected instead of turning a mechanics fixture into RAW QA | scripts/raw-harness.test.mjs |
| WIN-025 | PASS | HARNESS_MECHANICS_NOT_RAW | pipeline without data/native adapter returns null measurements, never zero or success | scripts/raw-harness.test.mjs |
| WIN-026 | PASS | HARNESS_MECHANICS_NOT_RAW | source presence does not make an unconnected adapter an external-environment failure or success | scripts/raw-harness.test.mjs |
| WIN-027 | PASS | HARNESS_MECHANICS_NOT_RAW | adapter protocol transports explicit input, but protocol success is not RAW QA | scripts/raw-harness.test.mjs |
| WIN-028 | PASS | HARNESS_MECHANICS_NOT_RAW | adapter process start failure is explicit | scripts/raw-harness.test.mjs |
| WIN-029 | PASS | HARNESS_MECHANICS_NOT_RAW | adapter timeout is recorded; no completed result is fabricated | scripts/raw-harness.test.mjs |
| WIN-030 | PASS | HARNESS_MECHANICS_NOT_RAW | adapter cancellation is recorded distinctly from timeout/failure | scripts/raw-harness.test.mjs |
| WIN-031 | PASS | HARNESS_MECHANICS_NOT_RAW | invalid adapter JSON fails closed | scripts/raw-harness.test.mjs |
| WIN-032 | PASS | HARNESS_MECHANICS_NOT_RAW | partial last event is rejected, not silently accepted | scripts/raw-harness.test.mjs |
| WIN-033 | PASS | HARNESS_MECHANICS_NOT_RAW | missing/invalid measured values remain unverified rather than 0 | scripts/raw-harness.test.mjs |
| WIN-034 | PASS | HARNESS_MECHANICS_NOT_RAW | Mac local compute evidence cannot pass full sync/restart/Cloud Safe lifecycle | scripts/raw-harness.test.mjs |
