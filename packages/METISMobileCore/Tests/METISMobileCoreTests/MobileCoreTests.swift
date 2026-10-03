import XCTest
@testable import METISMobileCore

final class MobileCoreTests: XCTestCase {
    private func resources(network: NetworkCondition = .online, thermal: ThermalCondition = .nominal,
                           memory: Int = 512_000_000) -> DeviceResources {
        DeviceResources(availableMemoryBytes: memory, memoryPressure: .normal, thermal: thermal,
                        batteryFraction: 0.8, network: network, uploadBytesPerSecond: 10_000_000,
                        hasGPU: true, hasNPU: true, performanceTier: .high)
    }

    private var workload: Workload {
        Workload(inputBytes: 20_000_000, batchSize: 3, privacy: .cloudPermitted,
                 minimumQuality: 0.9, maximumCost: 3, desiredLatencySeconds: 5, maximumConcurrency: 3)
    }

    private var candidates: [ExecutionCandidate] {
        [ExecutionCandidate(route: .onDevice, available: true, estimatedSeconds: 1, estimatedCost: 0,
                            quality: 0.95, requiredMemoryBytes: 100_000_000, requiresGPU: true),
         ExecutionCandidate(route: .cloud, available: true, estimatedSeconds: 1, estimatedCost: 0.1, quality: 0.95)]
    }

    func testCapabilityInventoryIsCompleteButUnconnected() {
        XCTAssertEqual(MobileCapability.allCases.count, 28)
        XCTAssertEqual(CapabilityContract.unconnectedInventory.count, 28)
        XCTAssertTrue(CapabilityContract.unconnectedInventory.allSatisfy { $0.integration == .notConnected && !$0.isVerified })
        XCTAssertFalse(CapabilityContract(capability: .camera, integration: .verified).isVerified)
    }

    func testOfflineUsesEligibleLocalRouteAndDoesNotInventCloudSuccess() throws {
        let result = try ExecutionPlanner.choose(workload: workload, resources: resources(network: .offline), candidates: candidates)
        XCTAssertEqual(result.route, .onDevice)
        XCTAssertEqual(result.maximumConcurrentJobs, 3)
        let cloudOnly = try ExecutionPlanner.choose(workload: workload, resources: resources(network: .offline), candidates: [candidates[1]])
        XCTAssertTrue(cloudOnly.isDeferred)
        XCTAssertEqual(cloudOnly.maximumConcurrentJobs, 0)
    }

    func testPrivacyPreventsCloudDespiteCriticalHeat() throws {
        let localOnly = Workload(inputBytes: 100, privacy: .localOnly,
                                 minimumQuality: 0.9, maximumCost: 3, desiredLatencySeconds: 5)
        let result = try ExecutionPlanner.choose(workload: localOnly, resources: resources(thermal: .critical), candidates: candidates)
        XCTAssertTrue(result.isDeferred)
    }

    func testHeatChangesRouteAndThrottlesConcurrency() throws {
        let cool = try ExecutionPlanner.choose(workload: workload, resources: resources(), candidates: candidates)
        let hot = try ExecutionPlanner.choose(workload: workload, resources: resources(thermal: .critical), candidates: candidates)
        XCTAssertEqual(cool.route, .onDevice)
        XCTAssertEqual(hot.route, .cloud)
        XCTAssertEqual(hot.maximumConcurrentJobs, 1)
        let serious = try ExecutionPlanner.choose(workload: workload, resources: resources(thermal: .serious), candidates: [candidates[0]])
        XCTAssertEqual(serious.maximumConcurrentJobs, 1)
    }

    func testMemoryAndQualityAreHardGates() throws {
        let lowMemory = try ExecutionPlanner.choose(workload: workload, resources: resources(network: .offline, memory: 1), candidates: candidates)
        XCTAssertTrue(lowMemory.isDeferred)
        let lowQuality = ExecutionCandidate(route: .onDevice, available: true, estimatedSeconds: 0.01,
                                            estimatedCost: 0, quality: 0.2)
        XCTAssertTrue(try ExecutionPlanner.choose(workload: workload, resources: resources(), candidates: [lowQuality]).isDeferred)
    }

    func testInvalidResourceAndEstimateRejected() {
        var invalid = resources()
        invalid.batteryFraction = .nan
        XCTAssertThrowsError(try ExecutionPlanner.choose(workload: workload, resources: invalid, candidates: candidates))
        let invalidCandidate = ExecutionCandidate(route: .onDevice, available: true, estimatedSeconds: -.infinity,
                                                 estimatedCost: 0, quality: 1)
        XCTAssertThrowsError(try ExecutionPlanner.choose(workload: workload, resources: resources(), candidates: [invalidCandidate]))
    }

    func testProxyRespectsConfiguredTierMemoryAndHeat() throws {
        let settings = ProxySettings(allowedLongEdges: [512, 1_024, 2_048], preferredLongEdge: 2_048,
                                     tierLimits: [.high: 2_048, .entry: 1_024], workingBytesPerPixel: 16, memoryBudgetFraction: 0.25)
        let standard = try ProxyPolicy.select(originalWidth: 6_000, originalHeight: 4_000, settings: settings, resources: resources())
        XCTAssertEqual(standard.longEdge, 2_048)
        let hot = try ProxyPolicy.select(originalWidth: 6_000, originalHeight: 4_000, settings: settings, resources: resources(thermal: .serious))
        XCTAssertEqual(hot.longEdge, 1_024)
        XCTAssertEqual(hot.maximumConcurrentJobs, 1)
        let low = try ProxyPolicy.select(originalWidth: 6_000, originalHeight: 4_000, settings: settings, resources: resources(memory: 16_000_000))
        XCTAssertEqual(low.longEdge, 512)
        let critical = try ProxyPolicy.select(originalWidth: 6_000, originalHeight: 4_000, settings: settings, resources: resources(thermal: .critical))
        XCTAssertNil(critical.longEdge)
        let tiny = try ProxyPolicy.select(originalWidth: 200, originalHeight: 100, settings: settings, resources: resources())
        XCTAssertEqual(tiny.longEdge, 200)
    }

    func testJobResumePreservesInputAndRejectsRegressingProgress() throws {
        let now = Date(timeIntervalSince1970: 100)
        var job = try JobCheckpoint(inputID: "asset-A", inputRevision: 7, totalUnits: 10, now: now)
        let key = job.idempotencyKey
        try job.transition(to: .running, completedUnits: 0, now: now)
        try job.transition(to: .suspended, completedUnits: 4, outputReferences: ["part-1"], now: now)
        var restored = try JSONDecoder().decode(JobCheckpoint.self, from: JSONEncoder().encode(job))
        XCTAssertEqual(restored, job)
        try restored.transition(to: .running, completedUnits: 4, now: now)
        XCTAssertEqual(restored.idempotencyKey, key)
        XCTAssertEqual(restored.inputRevision, 7)
        XCTAssertThrowsError(try restored.transition(to: .running, completedUnits: 3, now: now))
        XCTAssertThrowsError(try restored.transition(to: .completed, completedUnits: 9, now: now))
        XCTAssertEqual(restored.completedUnits, 4)
        try restored.transition(to: .completed, completedUnits: 10, now: now)
        XCTAssertThrowsError(try restored.transition(to: .running, completedUnits: 10, now: now))
    }

    func testReleaseGateRejectsMissingExpiredUnknownWrongBuildAndDuplicateProof() {
        let now = Date(timeIntervalSince1970: 100)
        func proof(build: String = "build-1", outcome: EvidenceOutcome = .pass, expiry: Date = Date(timeIntervalSince1970: 200)) -> GateEvidence {
            GateEvidence(requirementID: "save", buildID: build, outcome: outcome, artifactReference: "test-report/save",
                         observedAt: Date(timeIntervalSince1970: 50), expiresAt: expiry)
        }
        XCTAssertFalse(ReleaseGate.evaluate(buildID: "build-1", requirements: ["save"], evidence: [], now: now).canRelease)
        XCTAssertFalse(ReleaseGate.evaluate(buildID: "build-1", requirements: ["save"], evidence: [proof(outcome: .unknown)], now: now).canRelease)
        XCTAssertFalse(ReleaseGate.evaluate(buildID: "build-1", requirements: ["save"], evidence: [proof(expiry: now)], now: now).canRelease)
        XCTAssertFalse(ReleaseGate.evaluate(buildID: "build-1", requirements: ["save"], evidence: [proof(build: "old-build")], now: now).canRelease)
        XCTAssertFalse(ReleaseGate.evaluate(buildID: "build-1", requirements: ["save"], evidence: [proof(), proof()], now: now).canRelease)
        XCTAssertTrue(ReleaseGate.evaluate(buildID: "build-1", requirements: ["save"], evidence: [proof()], now: now).canRelease)
        XCTAssertFalse(MobileReleaseRequirement.allCases.map(\.rawValue).contains("web"))
        XCTAssertFalse(ReleaseGate.evaluateMobile(buildID: "build-1", additionalRequirements: ["commercial-v1"], evidence: [proof()], now: now).canRelease)
    }

    func testRetryRetainsCheckpointAndIdempotencyIdentity() throws {
        let now = Date(timeIntervalSince1970: 100)
        var job = try JobCheckpoint(inputID: "upload-A", inputRevision: 2, totalUnits: 8, now: now)
        let key = job.idempotencyKey
        try job.transition(to: .running, completedUnits: 0, now: now)
        try job.transition(to: .failed, completedUnits: 3, failureCode: "network_lost", now: now)
        try job.transition(to: .pending, completedUnits: 3, now: now)
        XCTAssertEqual(job.retryCount, 1)
        XCTAssertEqual(job.lastFailureCode, "network_lost")
        XCTAssertEqual(job.idempotencyKey, key)
        XCTAssertEqual(job.completedUnits, 3)
        let restored = try JSONDecoder().decode(JobCheckpoint.self, from: JSONEncoder().encode(job))
        XCTAssertEqual(restored, job)
    }

    func testMobileReleaseBlocksEveryUnmeasuredMacRAWAndLifecycleGate() {
        let now = Date(timeIntervalSince1970: 100)
        let measuredGates: Set<MobileReleaseRequirement> = [
            .macBuildAndTests, .realRAWLoad100, .realRAWLoad500, .realRAWLoad1000, .fullLifecycleSyncRecovery
        ]
        let previousMobileProofs = MobileReleaseRequirement.allCases.filter { !measuredGates.contains($0) }.map {
            GateEvidence(requirementID: $0.rawValue, buildID: "candidate", outcome: .pass,
                         artifactReference: "test-only/\($0.rawValue)", observedAt: Date(timeIntervalSince1970: 50),
                         expiresAt: Date(timeIntervalSince1970: 200))
        }
        let missing = ReleaseGate.evaluateMobile(buildID: "candidate", additionalRequirements: [], evidence: previousMobileProofs, now: now)
        XCTAssertFalse(missing.canRelease)
        XCTAssertEqual(Set(missing.blockedRequirements), Set(measuredGates.map(\.rawValue)))

        for unknownGate in measuredGates {
            let added = measuredGates.map {
                GateEvidence(requirementID: $0.rawValue, buildID: "candidate",
                             outcome: $0 == unknownGate ? .unknown : .pass,
                             artifactReference: "test-only/\($0.rawValue)", observedAt: Date(timeIntervalSince1970: 50),
                             expiresAt: Date(timeIntervalSince1970: 200))
            }
            let unknown = ReleaseGate.evaluateMobile(buildID: "candidate", additionalRequirements: [],
                                                      evidence: previousMobileProofs + added, now: now)
            XCTAssertFalse(unknown.canRelease)
            XCTAssertEqual(unknown.blockedRequirements, [unknownGate.rawValue])
        }
    }

    func testMacAndRAWProofsCannotSatisfyEitherPhysicalDeviceGate() {
        let now = Date(timeIntervalSince1970: 100)
        let nonDeviceProofs = MobileReleaseRequirement.allCases.filter { $0 != .iPhoneDevice && $0 != .iPadDevice }.map {
            GateEvidence(requirementID: $0.rawValue, buildID: "candidate", outcome: .pass,
                         artifactReference: "test-only/\($0.rawValue)", observedAt: Date(timeIntervalSince1970: 50),
                         expiresAt: Date(timeIntervalSince1970: 200))
        }
        let devicesMissing = ReleaseGate.evaluateMobile(buildID: "candidate", additionalRequirements: [], evidence: nonDeviceProofs, now: now)
        XCTAssertFalse(devicesMissing.canRelease)
        XCTAssertEqual(Set(devicesMissing.blockedRequirements), [MobileReleaseRequirement.iPhoneDevice.rawValue, MobileReleaseRequirement.iPadDevice.rawValue])

        let phoneProof = GateEvidence(requirementID: MobileReleaseRequirement.iPhoneDevice.rawValue, buildID: "candidate",
                                      outcome: .pass, artifactReference: "test-only/iphone-physical-device",
                                      observedAt: Date(timeIntervalSince1970: 50), expiresAt: Date(timeIntervalSince1970: 200))
        let tabletMissing = ReleaseGate.evaluateMobile(buildID: "candidate", additionalRequirements: [], evidence: nonDeviceProofs + [phoneProof], now: now)
        XCTAssertFalse(tabletMissing.canRelease)
        XCTAssertEqual(tabletMissing.blockedRequirements, [MobileReleaseRequirement.iPadDevice.rawValue])
    }
}
