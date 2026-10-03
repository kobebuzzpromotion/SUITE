# 全テスト・実行Evidence

最新全件は [INTEGRATED_TEST_CATALOG.md](INTEGRATED_TEST_CATALOG.md): Windows124 PASS/0 FAIL/0 SKIP、Native82 NOT_RUN。下表は旧IDを保持するbaseline34/45の歴史記録。現実行Evidenceはevidence/integrated-2026-10-03/regression.jsonであり、Nativeの未実施を合格へ変更していない。

Windows実行34件: PASS34 / FAIL0 / SKIP0。Swift 45件は別枠NOT_RUN（Core44 + Apple1）。NOT_RUNをSKIP0へ隠さず、実機/RAW成功にも算入しない。実行全文・コマンドはverification-results.json。各147節からtestIDsで下表を一対一参照する。

| ID | テスト | ソース | 結果・範囲 |
| --- | --- | --- | --- |
| NAT-001 | testImportPreviewAndFullExportPreserveOriginal | apps/apple/Tests/PhotoPipelineTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| WIN-001 | shared Recipe golden JSON preserves extended intent and refuses lossy/invalid input | apps/backend/tests/failures.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-002 | stream interruption never publishes incomplete Original; retry resumes by reuploading safely | apps/backend/tests/failures.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-003 | multipart survives closing/reopening, validates identity/tenant, finalizes only all parts and retries lost acknowledgement | apps/backend/tests/failures.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-004 | multipart repair fetches only the damaged part, retains old bytes and does not alter healthy parts | apps/backend/tests/failures.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-005 | ENOSPC provider fault leaves durable multipart checkpoint; retry after capacity restored | apps/backend/tests/failures.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-006 | actual killed child transaction rolls back; committed Recipe is readable after process termination | apps/backend/tests/failures.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-007 | ordinary browsing and editing never select Original; Final always does | apps/backend/tests/suite.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-008 | offline or failed Original acquisition waits, never produces Proxy Final | apps/backend/tests/suite.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-009 | Proxy eviction is separate and an unsafe Original is never eligible | apps/backend/tests/suite.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-010 | Cloud Safe requires all seven independently verified conditions | apps/backend/tests/suite.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-011 | actual immutable object writes reject corrupt upload and preserve previous Original | apps/backend/tests/suite.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-012 | durable metadata, recipe CAS and soft delete survive reopening without overwriting Original | apps/backend/tests/suite.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-013 | release gate excludes Web while requiring every mobile/legacy gate; unknown/expired blocks | apps/backend/tests/suite.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-014 | missing auth configuration fails closed instead of accepting a tenant header | apps/backend/tests/suite.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-015 | authenticated import → upload verification → recipe → on-demand Original; tenant isolation and stale edits | apps/backend/tests/suite.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| WIN-016 | Mac and each real RAW load gate stay independent from iPhone/iPad device evidence | apps/backend/tests/suite.test.ts | PASS / WINDOWS_BACKEND_NOT_IOS |
| NAT-002 | testCapabilityInventoryIsCompleteButUnconnected | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-003 | testOfflineUsesEligibleLocalRouteAndDoesNotInventCloudSuccess | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-004 | testPrivacyPreventsCloudDespiteCriticalHeat | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-005 | testHeatChangesRouteAndThrottlesConcurrency | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-006 | testMemoryAndQualityAreHardGates | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-007 | testInvalidResourceAndEstimateRejected | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-008 | testProxyRespectsConfiguredTierMemoryAndHeat | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-009 | testJobResumePreservesInputAndRejectsRegressingProgress | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-010 | testReleaseGateRejectsMissingExpiredUnknownWrongBuildAndDuplicateProof | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-011 | testRetryRetainsCheckpointAndIdempotencyIdentity | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-012 | testMobileReleaseBlocksEveryUnmeasuredMacRAWAndLifecycleGate | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-013 | testMacAndRAWProofsCannotSatisfyEitherPhysicalDeviceGate | packages/METISMobileCore/Tests/METISMobileCoreTests/MobileCoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-014 | testLibraryNeverRequestsHighPreviewEvenOnFastLargeDevice | packages/SuiteCore/Tests/SuiteCoreTests/CloudTransferPolicyTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-015 | testZoomAndDeviceChooseConfiguredQualityWithoutOriginalFallback | packages/SuiteCore/Tests/SuiteCoreTests/CloudTransferPolicyTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-016 | testOfflineUsesCachedProxyAndPixelInspectionDoesNotPretendLowResolutionIsFinal | packages/SuiteCore/Tests/SuiteCoreTests/CloudTransferPolicyTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-017 | testOnlyExplicitFinalOriginalTargetsArePromoted | packages/SuiteCore/Tests/SuiteCoreTests/CloudTransferPolicyTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-018 | testCellularRequiresExplicitOptInAndPauseOrUnknownNeverTransfer | packages/SuiteCore/Tests/SuiteCoreTests/CloudTransferPolicyTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-019 | testUndoRedoAndNewEditDiscardOnlyAbandonedBranch | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-020 | testExtendedRAWAndAIParametersSurviveHistoryRoundTrip | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-021 | testHistoryRejectsEmptyOrOutOfBoundsCursorAndUnknownFields | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-022 | testStoreRoundTripPreservesRedoAndOriginalBinary | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-023 | testStaleCASAndInvalidRevisionNeverReplaceSavedCheckpoint | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-024 | testTwoStoreInstancesCannotBothWinSameExpectedRevision | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-025 | testCorruptionAndUnknownSchemaAreNotEmptySuccessOrOverwritten | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-026 | testInvalidPathChecksumAndOriginalMutationAreRejected | packages/SuiteCore/Tests/SuiteCoreTests/EditingAndStoreTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-027 | testOrdinaryWorkflowNeverRequestsOriginalAndFinalAlwaysDoes | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-028 | testCloudSafetyIsFailClosedAndBindsAssetRepresentationChecksumAndExpiry | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-029 | testFinalWaitsForOriginalAcrossOfflineDownloadFailureAndChecksumFailure | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-030 | testProxyEvictionCannotAuthorizeOriginalOrRecipeDeletion | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-031 | testCanonicalGenerationIsProtectedEvenIfCallerMarksItRegenerable | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-032 | testExportFreezesInputRecipeAndRejectsOriginalOverwriteDestination | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-033 | testSupportedCameraRequiresHardwareEvidence | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-034 | testOldCloudEvidenceWithoutNewGatesDecodesUnknownAndCannotEvictOriginal | packages/SuiteCore/Tests/SuiteCoreTests/PhotoLifecycleTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-035 | testGoldenFixtureRoundTripsAsIdenticalPlainJSON | packages/SuiteCore/Tests/SuiteCoreTests/RecipeDocumentTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-036 | testPortableValueEncodingHasNoEnumEnvelopeAndRejectsNull | packages/SuiteCore/Tests/SuiteCoreTests/RecipeDocumentTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-037 | testDocumentRejectsUnknownVersionUnknownFieldsAndUnsafeInteger | packages/SuiteCore/Tests/SuiteCoreTests/RecipeDocumentTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-038 | testFiveModesAndNonDestructiveMetadataRoundTripWithoutNumericModeDefaults | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-039 | testLookUpdateOnlyAffectsFutureCaptureAndDuplicateIngestKeepsOriginalBinding | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-040 | testExplicitPastReapplyCreatesNewBindingWithoutOverwritingHistory | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-041 | testUnconnectedAndMissingAnalysisNeverClaimAppliedSuccess | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-042 | testTargetsArePersonSpecificAndBodyRequiresBackgroundProtection | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-043 | testOtherPhotoAnalysisAndFixedReferenceMasksCannotBeReused | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-044 | testAutoOffPhotoAndPersonExclusionsAndIndependentCategorySwitches | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| NAT-045 | testPersonalColorIsOptionalAndCannotSpecifyShapeOrUnacceptedAutomaticSelection | packages/SuiteCore/Tests/SuiteCoreTests/SessionLookTests.swift | NOT_RUN / SWIFT_NATIVE_NOT_EXECUTED / BLOCKED_EXTERNAL_ENVIRONMENT: Swift/Xcode/Mac unavailable |
| WIN-017 | path guard rejects checkout, descendants and ancestors; sibling prefix is not a descendant | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-018 | JPEG/PNG payload detection rejects renamed images without trusting a filename | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-019 | RAF signature is 16 bytes including the trailing space; prefix alone is not accepted | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-020 | absent real RAW set has null counts and is explicitly externally blocked | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-021 | empty dataset is zero observed files, not a successful 100 RAW test | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-022 | manifest measures arbitrary test bytes exactly but rejects them as RAW | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-023 | bounded TIFF metadata reader reports only embedded tags, not camera compatibility | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-024 | unsupported set size is rejected instead of turning a mechanics fixture into RAW QA | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-025 | pipeline without data/native adapter returns null measurements, never zero or success | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-026 | source presence does not make an unconnected adapter an external-environment failure or success | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-027 | adapter protocol transports explicit input, but protocol success is not RAW QA | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-028 | adapter process start failure is explicit | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-029 | adapter timeout is recorded; no completed result is fabricated | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-030 | adapter cancellation is recorded distinctly from timeout/failure | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-031 | invalid adapter JSON fails closed | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-032 | partial last event is rejected, not silently accepted | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-033 | missing/invalid measured values remain unverified rather than 0 | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |
| WIN-034 | Mac local compute evidence cannot pass full sync/restart/Cloud Safe lifecycle | scripts/raw-harness.test.mjs | PASS / HARNESS_MECHANICS_NOT_RAW |

仕様検査はテスト34件とは別: 全147節・参照先・freeze hash検査PASS。RAW未配置確認はexit2で正常にBLOCKEDを表し、3件の負荷試験PASSには数えない。
