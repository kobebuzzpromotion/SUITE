import Foundation
import CryptoKit
import SuiteCore

/// Fresh local measurements plus EXISTING explicitly confirmed photo identities.
/// Never enrolls/matches/assigns an unknown person automatically. Exposure below
/// is observed proxy luminance, not a predicted lighting correction or RAW EV.
actor TetherLocalAnalysisAdapter {
    struct Configuration: Decodable, Sendable {
        struct Resolution: Decodable, Sendable { let personID: UUID; let exposureEV: Double }
        let jobID: UUID
        let scoreThreshold: Float
        let nmsThreshold: Float
        let minimumIoU: Double
        let minimumMargin: Double
        let policyRevision: String
        let resolutions: [Resolution]
    }
    struct Measurement: Sendable {
        let personID: UUID
        let samples: Int
        let meanLinearLuminance: Double
    }
    struct Result: Sendable {
        let input: TetherLookLocalWorker.Input
        let measurements: [Measurement]
        let analysis: LocalFaceAnalysisService
    }
    enum Failure: Error { case busy, unavailable, invalid, missingAssignment, unsupported }
    private let pipeline: PhotoPipeline
    private let projects: ProjectStore
    private let gallery: LocalPersonGalleryStore
    private let models: LocalAIModelStore
    private let detail = LocalDetailedPortraitAnalysis()
    private var busy = false

    init(root: URL, projects: ProjectStore, pipeline: PhotoPipeline) throws {
        self.projects = projects; self.pipeline = pipeline
        gallery = try LocalPersonGalleryStore(root: root)
        models = try LocalAIModelStore(root: root.appendingPathComponent("LocalFaceModels", isDirectory: true))
    }
    func prepare(job: TetherLookQueue.Job, configuration c: Configuration) async throws -> Result {
        guard !busy else { throw Failure.busy }; busy = true; defer { busy = false }
        #if os(iOS)
        guard c.jobID == job.id, c.resolutions.count <= 256,
              c.scoreThreshold.isFinite, c.scoreThreshold > 0, c.scoreThreshold <= 1,
              c.nmsThreshold.isFinite, c.nmsThreshold > 0, c.nmsThreshold <= 1,
              c.minimumIoU.isFinite, c.minimumIoU > 0, c.minimumIoU <= 1,
              c.minimumMargin.isFinite, (0...1).contains(c.minimumMargin),
              Set(c.resolutions.map(\.personID)).count == c.resolutions.count,
              c.resolutions.allSatisfy({ $0.exposureEV.isFinite && (-4...4).contains($0.exposureEV) }),
              !c.policyRevision.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              c.policyRevision.utf8.count <= 256 else { throw Failure.invalid }
        guard let checkpoint = try await projects.load(id: job.binding.assetID),
              checkpoint.revision == job.binding.inputRecipeRevision,
              checkpoint.asset.sha256.lowercased() == job.binding.originalSHA256.lowercased() else { throw Failure.invalid }
        let reference = try await pipeline.prepareLocalPeople(asset: checkpoint.asset)
        let engine = try LocalFaceAnalysisService(store: models, scoreThreshold: c.scoreThreshold, nmsThreshold: c.nmsThreshold)
        let analysis = try await engine.analyze(reference.pixels)
        guard let saved = try await gallery.assignmentRecord(assetID: checkpoint.asset.id) else { throw Failure.missingAssignment }
        try saved.document.validate(assetID: checkpoint.asset.id, originalSHA256: checkpoint.asset.sha256,
            analysisVersion: analysis.analysisVersion, analysisSHA256: analysis.analysisSHA256, targets: analysis.faces.map(\.target))
        let entries = try await gallery.snapshot()
        let consented = Set(entries.map { FaceIdentity.PersonID($0.id) })
        let policy = FaceRegionAssociation.Policy(revision: c.policyRevision, minimumIoU: c.minimumIoU, minimumMargin: c.minimumMargin)
        let details = try await detail.analyze(referencePNG: reference.referencePNG, prepared: reference.pixels,
            analysis: analysis, asset: checkpoint.asset, analysisVersion: analysis.analysisVersion, policy: policy)
        let plan = try job.frozenSession.applicationPlan(for: job.binding, capabilities: [.adaptiveFace])
        guard !plan.people.isEmpty, plan.people.count == c.resolutions.count,
              !plan.globalColorEnabled, plan.personalColorTargetIDs.isEmpty,
              plan.lookSnapshot.textureIntent.isEmpty else { throw Failure.unsupported }
        var observations: [PhotoPersonObservation] = []
        var resolutions: [SessionLookPartialApplyCoordinator.ExposureResolution] = []
        var measurements: [Measurement] = []
        for person in plan.people {
            try Task.checkCancellation()
            let personID = FaceIdentity.PersonID(person.personID)
            let assignedTargets = saved.document.assignments.filter { $0.value == personID }
            guard consented.contains(personID), person.settings.count == 1,
                  let setting = person.settings.first, setting.control == .faceBrightness,
                  let resolution = c.resolutions.first(where: { $0.personID == person.personID }),
                  assignedTargets.count == 1, let target = assignedTargets.first?.key,
                  let face = analysis.faces.first(where: { $0.target.faceTargetID == target }),
                  let actualDetail = details.faces.first(where: { $0.target.faceTargetID == target }),
                  !actualDetail.regions.isEmpty else { throw Failure.missingAssignment }
            let measurement = try measure(personID: person.personID, face: face, pixels: reference.pixels)
            measurements.append(measurement)
            observations.append(.init(personID: person.personID, identityMatch: .passed,
                faceRegion: .init(assetID: checkpoint.asset.id, originalSHA256: checkpoint.asset.sha256,
                    analysisID: job.id, regionReference: "vision:" + details.topologyID + ":" + target.uuidString)))
            resolutions.append(.init(personID: person.personID, setting: setting, exposureEV: resolution.exposureEV))
        }
        // Version fingerprints the actual measurements; a changed analysis does
        // not become an exact retry of persisted evidence just because jobID matches.
        let contract = analysis.analysisVersion + "|" + analysis.analysisSHA256 + "|" + details.topologyID + "|" +
            measurements.sorted { $0.personID.uuidString < $1.personID.uuidString }
                .map { "\($0.personID):\($0.samples):\($0.meanLinearLuminance.bitPattern)" }.joined(separator: "|")
        let digest = SHA256.hash(data: Data(contract.utf8)).map { String(format: "%02x", $0) }.joined()
        let evidence = PhotoAnalysisEvidence(id: job.id, assetID: checkpoint.asset.id, originalSHA256: checkpoint.asset.sha256,
            implementationVersion: "local-face-proxy-measurement-v1:" + digest,
            completed: [.faceDetection, .faceLandmarks, .orientation, .multiplePeople, .identityMatch, .exposure], people: observations)
        guard let latest = try await gallery.assignmentRecord(assetID: checkpoint.asset.id), latest.revision == saved.revision,
              latest.document == saved.document else { throw Failure.missingAssignment }
        try Task.checkCancellation()
        return Result(input: .init(binding: job.binding, evidence: evidence,
            face: .init(gallery: gallery, assignmentsRevision: saved.revision, assignments: saved.document,
                analysisSHA256: analysis.analysisSHA256, analysisVersion: analysis.analysisVersion, policy: policy,
                consentedPersonIDs: consented, resolutions: resolutions)), measurements: measurements, analysis: engine)
        #else
        throw Failure.unavailable
        #endif
    }
    private func measure(personID: UUID, face: LocalFaceAnalysisService.Face,
                         pixels: LocalFacePixels.Prepared) throws -> Measurement {
        let g = face.analysisGeometry
        guard g.count == 15, g.prefix(4).allSatisfy(\.isFinite), g[2] > 0, g[3] > 0 else { throw Failure.invalid }
        func bounded(_ value: Double, _ limit: Int) -> Int { Int(min(Double(limit), max(0, value))) }
        let x0 = bounded(floor(Double(g[0])), pixels.width), y0 = bounded(floor(Double(g[1])), pixels.height)
        let x1 = bounded(ceil(Double(g[0]) + Double(g[2])), pixels.width)
        let y1 = bounded(ceil(Double(g[1]) + Double(g[3])), pixels.height)
        guard x0 < x1, y0 < y1 else { throw Failure.invalid }
        let bytes = [UInt8](pixels.bgr)
        func linear(_ value: UInt8) -> Double {
            let s = Double(value) / 255
            return s <= 0.04045 ? s / 12.92 : pow((s + 0.055) / 1.055, 2.4)
        }
        var sum = 0.0, count = 0
        for y in y0..<y1 {
            try Task.checkCancellation()
            for x in x0..<x1 {
                let i = y * pixels.stride + x * 3
                guard i + 2 < bytes.count else { throw Failure.invalid }
                sum += 0.2126 * linear(bytes[i + 2]) + 0.7152 * linear(bytes[i + 1]) + 0.0722 * linear(bytes[i])
                count += 1
            }
        }
        guard count > 0, sum.isFinite else { throw Failure.invalid }
        return Measurement(personID: personID, samples: count, meanLinearLuminance: sum / Double(count))
    }
}
