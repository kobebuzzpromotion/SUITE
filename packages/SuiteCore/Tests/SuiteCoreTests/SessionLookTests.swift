import Foundation
import XCTest
@testable import SuiteCore

final class SessionLookTests: XCTestCase {
    private let personA = UUID()
    private let personB = UUID()
    private let checksum = String(repeating: "a", count: 64)
    private var enabled: SessionApplyControls {
        .init(autoApply: true, globalColor: true, faceRetouch: true, skinRetouch: true, bodyRetouch: true, personalColor: true)
    }
    private func checkpoint() -> ProjectCheckpoint {
        .init(asset: .init(originalFilename: "photo.dng", originalRelativePath: "Originals/photo.dng", sha256: checksum), history: .init(), revision: 0)
    }
    private func look(id: UUID = UUID(), revision: Int = 0) throws -> SessionLook {
        try .init(id: id, revision: revision, referenceAssetID: UUID(), referenceRecipeRevision: 0, mode: .nightWork,
                  globalColor: [.init(parameter: .toneCurve, value: .array([.number(0), .number(1)]))],
                  people: [.init(personID: personA, settings: [
                    .init(control: .poreReduction, strength: try .init(level: .custom, customValue: 20)),
                    .init(control: .waist, strength: try .init(level: .custom, customValue: -8))])],
                  personalColor: .init(direction: .summer, selectionOrigin: .photographer, targetPersonIDs: [personA], adjustments: []))
    }
    private func evidence(for binding: SessionImageBinding, includesBackground: Bool = true) -> PhotoAnalysisEvidence {
        let analysisID = UUID()
        let region = PhotoBoundRegion(assetID: binding.assetID, originalSHA256: binding.originalSHA256,
                                      analysisID: analysisID, regionReference: "photo-specific-region")
        return .init(id: analysisID, assetID: binding.assetID, originalSHA256: binding.originalSHA256,
                     implementationVersion: "test-adapter-only", completed: Set(PhotoAnalysisRequirement.allCases),
                     people: [.init(personID: personA, identityMatch: .passed, faceRegion: region, skinRegion: region,
                                    bodyRegion: region, protectedBackgroundRegion: includesBackground ? region : nil),
                              .init(personID: personB, identityMatch: .passed, faceRegion: region, skinRegion: region, bodyRegion: region)])
    }

    func testFiveModesAndNonDestructiveMetadataRoundTripWithoutNumericModeDefaults() throws {
        XCTAssertEqual(Set(ShootingMode.allCases), [.wedding, .nightWork, .fashion, .beauty, .custom])
        XCTAssertEqual(RetouchControl.allCases.count, 27)
        let original = try look()
        let value = try original.recipeExtensionValue()
        let restored = try JSONDecoder().decode(SessionLook.self, from: JSONEncoder().encode(value))
        XCTAssertEqual(restored, original)
        XCTAssertEqual(restored.people.first?.settings.last?.strength.customValue, -8)
        XCTAssertThrowsError(try RetouchStrength(level: .custom))
        XCTAssertThrowsError(try RetouchStrength(level: .low, customValue: 10))
        XCTAssertThrowsError(try RetouchStrength(level: .custom, customValue: .nan))
    }

    func testLookUpdateOnlyAffectsFutureCaptureAndDuplicateIngestKeepsOriginalBinding() throws {
        let oldLook = try look()
        var session = try TetherSessionState(look: oldLook, controls: enabled)
        let firstPhoto = checkpoint()
        let oldBinding = try session.bindNewPhoto(firstPhoto)
        let next = try look(id: oldLook.id, revision: 1)
        try session.updateLook(next, expectedRevision: 0)
        let newBinding = try session.bindNewPhoto(checkpoint())
        XCTAssertEqual(oldBinding.lookRevision, 0)
        XCTAssertEqual(newBinding.lookRevision, 1)
        XCTAssertEqual(try session.bindNewPhoto(firstPhoto), oldBinding)
        XCTAssertEqual(try session.applicationPlan(for: oldBinding).lookSnapshot, oldLook)
        XCTAssertEqual(firstPhoto.history.current, RecipeParameters())
        XCTAssertThrowsError(try session.updateLook(next, expectedRevision: 0))
    }

    func testExplicitPastReapplyCreatesNewBindingWithoutOverwritingHistory() throws {
        let oldLook = try look()
        var session = try TetherSessionState(look: oldLook, controls: enabled)
        let photo = checkpoint()
        let old = try session.bindNewPhoto(photo)
        try session.updateLook(look(id: oldLook.id, revision: 1), expectedRevision: 0)
        XCTAssertThrowsError(try session.reapplyPastPhotos([photo], explicitlyRequested: false))
        XCTAssertEqual(session.bindings, [old])
        let request = try session.reapplyPastPhotos([photo], explicitlyRequested: true)
        XCTAssertEqual(request.first?.kind, .explicitPastPhoto)
        XCTAssertEqual(request.first?.lookRevision, 1)
        XCTAssertEqual(session.bindings.first, old)
        XCTAssertThrowsError(try session.reapplyPastPhotos([photo, checkpoint()], explicitlyRequested: true))
        XCTAssertEqual(session.bindings.count, 2)
        XCTAssertEqual(try JSONDecoder().decode(TetherSessionState.self, from: JSONEncoder().encode(session)), session)
    }

    func testUnconnectedAndMissingAnalysisNeverClaimAppliedSuccess() throws {
        var session = try TetherSessionState(look: look(), controls: enabled)
        let binding = try session.bindNewPhoto(checkpoint())
        let unsupported = try session.applicationPlan(for: binding)
        XCTAssertEqual(unsupported.state, .notSupported)
        XCTAssertFalse(unsupported.isRendered)
        let pending = try session.applicationPlan(for: binding, capabilities: Set(LookAdapterCapability.allCases))
        XCTAssertEqual(pending.state, .requiresAnalysis)
        XCTAssertTrue(pending.missingAnalysis.contains(.bodyLandmarks))
        XCTAssertTrue(pending.missingAnalysis.contains(.backgroundProtection))
    }

    func testTargetsArePersonSpecificAndBodyRequiresBackgroundProtection() throws {
        var session = try TetherSessionState(look: look(), controls: enabled)
        let binding = try session.bindNewPhoto(checkpoint())
        let blocked = try session.applicationPlan(for: binding, capabilities: Set(LookAdapterCapability.allCases),
                                                 analysis: evidence(for: binding, includesBackground: false))
        XCTAssertEqual(blocked.state, .requiresAnalysis)
        XCTAssertTrue(blocked.missingAnalysis.contains(.backgroundProtection))
        let planned = try session.applicationPlan(for: binding, capabilities: Set(LookAdapterCapability.allCases), analysis: evidence(for: binding))
        XCTAssertEqual(planned.state, .readyForAdapter)
        XCTAssertEqual(planned.people.map(\.personID), [personA])
        XCTAssertFalse(planned.people.contains { $0.personID == personB })
        XCTAssertEqual(planned.lookSnapshot, try lookForBinding(session, binding))
        XCTAssertFalse(planned.isRendered)
    }

    private func lookForBinding(_ session: TetherSessionState, _ binding: SessionImageBinding) throws -> SessionLook {
        try XCTUnwrap(session.lookRevisions.first { $0.revision == binding.lookRevision })
    }

    func testOtherPhotoAnalysisAndFixedReferenceMasksCannotBeReused() throws {
        var session = try TetherSessionState(look: look(), controls: enabled)
        let first = try session.bindNewPhoto(checkpoint())
        let second = try session.bindNewPhoto(checkpoint())
        XCTAssertThrowsError(try session.applicationPlan(for: second, capabilities: Set(LookAdapterCapability.allCases), analysis: evidence(for: first)))
        let currentID = UUID()
        let oldRegion = PhotoBoundRegion(assetID: first.assetID, originalSHA256: checksum, analysisID: UUID(), regionReference: "old-mask")
        let forged = PhotoAnalysisEvidence(id: currentID, assetID: second.assetID, originalSHA256: checksum,
                                          implementationVersion: "test-only", completed: Set(PhotoAnalysisRequirement.allCases),
                                          people: [.init(personID: personA, identityMatch: .passed, faceRegion: oldRegion,
                                                         skinRegion: oldRegion, bodyRegion: oldRegion, protectedBackgroundRegion: oldRegion)])
        XCTAssertEqual(try session.applicationPlan(for: second, capabilities: Set(LookAdapterCapability.allCases), analysis: forged).state, .requiresAnalysis)
    }

    func testAutoOffPhotoAndPersonExclusionsAndIndependentCategorySwitches() throws {
        var session = try TetherSessionState(look: look(), controls: enabled)
        let first = try session.bindNewPhoto(checkpoint())
        session.excludePhoto(first.assetID)
        XCTAssertEqual(try session.applicationPlan(for: first).state, .skipped(.photoExcluded))
        session.includePhoto(first.assetID)
        session.excludePerson(personA, in: first.assetID)
        let excluded = try session.applicationPlan(for: first)
        XCTAssertTrue(excluded.people.isEmpty)
        XCTAssertTrue(excluded.personalColorTargetIDs.isEmpty)
        XCTAssertTrue(excluded.globalColorEnabled)
        session.setControls(.init(autoApply: false, globalColor: true, faceRetouch: true, skinRetouch: true, bodyRetouch: true, personalColor: true))
        XCTAssertEqual(try session.applicationPlan(for: first).state, .skipped(.autoApplyOff))
        session.setControls(.init(autoApply: true, globalColor: false, faceRetouch: true, skinRetouch: false, bodyRetouch: false, personalColor: false))
        let second = try session.bindNewPhoto(checkpoint())
        let separate = try session.applicationPlan(for: second)
        XCTAssertFalse(separate.globalColorEnabled)
        XCTAssertTrue(separate.personalColorTargetIDs.isEmpty)
        XCTAssertTrue(separate.people.flatMap(\.settings).allSatisfy { $0.control.category == .face })
    }

    func testPersonalColorIsOptionalAndCannotSpecifyShapeOrUnacceptedAutomaticSelection() throws {
        XCTAssertFalse(PersonalColorParameter.allCases.map(\.rawValue).contains("waist"))
        XCTAssertFalse(PersonalColorParameter.allCases.map(\.rawValue).contains("skinSmoothness"))
        XCTAssertThrowsError(try PersonalColorIntent(direction: .summer, selectionOrigin: .user, targetPersonIDs: [], adjustments: []))
        let noPersonal = try SessionLook(revision: 0, referenceAssetID: UUID(), referenceRecipeRevision: 0,
                                        mode: .custom, globalColor: [], people: [])
        XCTAssertNil(noPersonal.personalColor)
        let invalid = Data(#"{"direction":"summer","selectionOrigin":"automatic","targetPersonIDs":[],"adjustments":[]}"#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(PersonalColorIntent.self, from: invalid))
    }
}
