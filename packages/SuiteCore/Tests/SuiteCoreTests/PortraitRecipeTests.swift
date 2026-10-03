import Foundation
import XCTest
@testable import SuiteCore

/// Contract/store tests, not portrait rendering. NOT_RUN until Swift/Apple results are recorded.
final class PortraitRecipeTests: XCTestCase, @unchecked Sendable {
    private let sha = String(repeating: "a", count: 64)
    private func asset(_ id: UUID = UUID()) -> AssetRecord {
        .init(id: id, originalFilename: "storage-only.dng", originalRelativePath: "Originals/\(id).dng", sha256: sha)
    }
    private func portrait(_ asset: AssetRecord) throws -> PortraitRecipe {
        try .init(assetID: asset.id, originalSHA256: asset.sha256, targets: [
            .init(anchor: .init(x: 0.1, y: 0.2, width: 0.2, height: 0.3), exposureEV: 0),
            .init(anchor: .init(x: 0.6, y: 0.2, width: 0.2, height: 0.3), exposureEV: 0)
        ])
    }
    private func object(_ p: PortraitRecipe) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(p)) as? [String: Any])
    }
    private func decode(_ value: [String: Any]) throws -> PortraitRecipe {
        try JSONDecoder().decode(PortraitRecipe.self, from: JSONSerialization.data(withJSONObject: value))
    }
    private func temporaryDirectory() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("suite-portrait-test-\(UUID())")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return root
    }

    func testPlainWireUsesTypedControlValueAndUTCStrings() throws {
        let p = try portrait(asset()), wire = try object(p)
        let targets = try XCTUnwrap(wire["targets"] as? [[String: Any]])
        XCTAssertEqual(targets[0]["adjustmentType"] as? String, "face_brightness")
        XCTAssertEqual(targets[0]["value"] as? Double, 0)
        XCTAssertNil(targets[0]["exposureEV"])
        XCTAssertTrue((wire["createdAt"] as? String)?.hasSuffix("Z") == true)
        XCTAssertTrue((wire["updatedAt"] as? String)?.hasSuffix("Z") == true)
        XCTAssertEqual(try decode(wire), p)
    }

    func testUnknownMissingNullAndUnsupportedFieldsFailClosed() throws {
        let wire = try object(portrait(asset()))
        for field in wire.keys {
            var invalid = wire; invalid.removeValue(forKey: field)
            XCTAssertThrowsError(try decode(invalid), "missing \(field)")
        }
        let invalidRoot: [(String, Any)] = [("schemaVersion", 2), ("engineVersion", "unsupported"),
            ("assetID", "person-1"), ("originalSHA256", "unknown"), ("targets", NSNull()), ("unknown", true)]
        for (key, value) in invalidRoot {
            var invalid = wire; invalid[key] = value
            XCTAssertThrowsError(try decode(invalid), key)
        }
        var targets = try XCTUnwrap(wire["targets"] as? [[String: Any]])
        let invalidTarget: [(String, Any)] = [("adjustmentType", "skin_smoothing"), ("id", "bad-id"),
            ("value", NSNull()), ("exposureEV", 1)]
        for (key, value) in invalidTarget {
            var t = targets[0]; t[key] = value
            var invalid = wire; invalid["targets"] = [t]
            XCTAssertThrowsError(try decode(invalid), key)
        }
        targets[1]["id"] = targets[0]["id"]
        var duplicate = wire; duplicate["targets"] = targets
        XCTAssertThrowsError(try decode(duplicate))
    }

    func testInvalidUTCTimestampAndClockOrderAreRejected() throws {
        let wire = try object(portrait(asset()))
        for field in ["createdAt", "updatedAt"] {
            for value in ["2026-02-30T01:00:00.000Z", "2026-10-03T25:00:00.000Z", "2026-10-03", "2026-10-03T10:00:00+09:00", ""] {
                var invalid = wire; invalid[field] = value
                XCTAssertThrowsError(try decode(invalid), "\(field): \(value)")
            }
        }
        var invalid = wire
        invalid["createdAt"] = "2026-10-03T01:00:00.000Z"
        invalid["updatedAt"] = "2026-10-02T01:00:00.000Z"
        XCTAssertThrowsError(try decode(invalid))
    }

    func testFiniteRangeGeometryAndTargetIsolation() throws {
        let p = try portrait(asset()), first = p.targets[0], other = p.targets[1]
        let changed = try p.settingExposure(0.75, targetID: first.id)
        XCTAssertEqual(changed.targets[0].id, first.id)
        XCTAssertEqual(changed.targets[0].anchor, first.anchor)
        XCTAssertEqual(changed.targets[0].exposureEV, 0.75)
        XCTAssertEqual(changed.targets[1], other)
        XCTAssertEqual(p.targets[0].exposureEV, 0)
        XCTAssertThrowsError(try p.settingExposure(1, targetID: UUID()))
        for value in [-Double.infinity, Double.infinity, Double.nan, -4.001, 4.001] {
            XCTAssertThrowsError(try p.settingExposure(value, targetID: first.id))
        }
        for value in [-4.0, 0, 4] { XCTAssertNoThrow(try p.settingExposure(value, targetID: first.id)) }
        XCTAssertThrowsError(try PortraitFaceAnchor(x: -0.01, y: 0, width: 0.1, height: 0.1))
        XCTAssertThrowsError(try PortraitFaceAnchor(x: 0, y: 0, width: 0, height: 1))
        XCTAssertThrowsError(try PortraitFaceAnchor(x: 0.9, y: 0, width: 0.2, height: 1))
        XCTAssertThrowsError(try PortraitFaceAnchor(x: 0, y: .nan, width: 1, height: 1))
        XCTAssertEqual(first.anchor.intersectionOverUnion(first.anchor), 1, accuracy: 1e-12)
        XCTAssertEqual(first.anchor.intersectionOverUnion(other.anchor), 0)
    }

    func testBindingRejectsDifferentPhotoAndChangedOriginal() throws {
        let a = asset(), p = try portrait(a)
        XCTAssertNoThrow(try p.validate(asset: a))
        XCTAssertThrowsError(try p.validate(asset: asset()))
        let changed = AssetRecord(id: a.id, originalFilename: a.originalFilename,
            originalRelativePath: a.originalRelativePath, sha256: String(repeating: "b", count: 64), createdAt: a.createdAt)
        XCTAssertThrowsError(try p.validate(asset: changed))
        let parameters = try RecipeParameters().settingPortrait(p)
        XCTAssertThrowsError(try ProjectCheckpoint(asset: changed, history: .init(parameters: parameters), revision: 0).validate())
    }

    func testPortraitUndoRedoForkAndRecipeRoundTripPreserveUnrelatedExtensions() throws {
        let p = try portrait(asset())
        var base = RecipeParameters(); base.extendedParameters["future.vendor.option"] = .text("keep")
        let initial = try base.settingPortrait(p)
        let adjusted = try base.settingPortrait(p.settingExposure(0.7, targetID: p.targets[0].id))
        var history = EditHistory(parameters: initial); history.apply(adjusted); history.undo()
        XCTAssertEqual(history.current, initial)
        let restored = try JSONDecoder().decode(EditHistory.self, from: JSONEncoder().encode(history))
        XCTAssertTrue(restored.canRedo)
        var resumed = restored; resumed.redo(); XCTAssertEqual(resumed.current, adjusted)
        resumed.undo()
        let alternate = try base.settingPortrait(p.settingExposure(-0.3, targetID: p.targets[1].id))
        resumed.apply(alternate)
        XCTAssertFalse(resumed.canRedo)
        XCTAssertEqual(resumed.current.extendedParameters["future.vendor.option"], .text("keep"))
        XCTAssertEqual(try resumed.current.portraitRecipe()?.targets[0].exposureEV, 0)
        XCTAssertEqual(try resumed.current.portraitRecipe()?.targets[1].exposureEV, -0.3)
        let doc = try RecipeDocument(parameters: resumed.current)
        XCTAssertEqual(try JSONDecoder().decode(RecipeDocument.self, from: JSONEncoder().encode(doc)), doc)
    }

    func testPortraitStoreCASReopenRetainsRedoAndNeverTouchesOriginal() async throws {
        let root = try temporaryDirectory(); defer { try? FileManager.default.removeItem(at: root) }
        let original = root.appendingPathComponent("not-image.dng"), bytes = Data([1, 2, 3, 255])
        try bytes.write(to: original)
        let a = asset(), p = try portrait(a), directory = root.appendingPathComponent("recipes")
        let store = try ProjectStore(directory: directory)
        var history = EditHistory(parameters: try RecipeParameters().settingPortrait(p))
        let initial = ProjectCheckpoint(asset: a, history: history, revision: 0)
        try await store.save(initial, expectedRevision: nil)
        history.apply(try history.current.settingPortrait(p.settingExposure(0.5, targetID: p.targets[0].id)))
        history.undo()
        let next = ProjectCheckpoint(asset: a, history: history, revision: 1)
        try await store.save(next, expectedRevision: 0)
        do { try await store.save(next, expectedRevision: 0); XCTFail("stale CAS") }
        catch ProjectStoreError.revisionConflict { }
        let reopened = try ProjectStore(directory: directory)
        let loaded = try await reopened.load(id: a.id)
        XCTAssertEqual(loaded, next)
        XCTAssertTrue(loaded?.history.canRedo == true)
        XCTAssertEqual(try Data(contentsOf: original), bytes)
    }

    func testPortraitCorruptionCannotBeReplacedByNewSave() async throws {
        let root = try temporaryDirectory(); defer { try? FileManager.default.removeItem(at: root) }
        let a = asset(), store = try ProjectStore(directory: root)
        let saved = ProjectCheckpoint(asset: a, history: .init(parameters: try RecipeParameters().settingPortrait(portrait(a))), revision: 0)
        try await store.save(saved, expectedRevision: nil)
        let file = root.appendingPathComponent("\(a.id.uuidString.lowercased()).json")
        let damaged = Data("{portrait-corrupt".utf8); try damaged.write(to: file)
        do { _ = try await store.load(id: a.id); XCTFail("corrupt load") } catch ProjectStoreError.corruptCheckpoint { }
        do { try await store.save(saved, expectedRevision: nil); XCTFail("corrupt overwrite") } catch ProjectStoreError.corruptCheckpoint { }
        XCTAssertEqual(try Data(contentsOf: file), damaged)
    }

    func testKnownTargetUUIDCannotChangeAnchorOrBeReplacedInsideHistory() throws {
        let a = asset(), p = try portrait(a), original = p.targets[0]
        let moved = try PortraitFaceTarget(id: original.id, anchor: p.targets[1].anchor, exposureEV: 0.5)
        let replaced = try PortraitFaceTarget(anchor: original.anchor, exposureEV: 0.5)
        for invalidTarget in [moved, replaced] {
            let altered = try PortraitRecipe(assetID: a.id, originalSHA256: a.sha256, targets: [invalidTarget])
            var history = EditHistory(parameters: try RecipeParameters().settingPortrait(p))
            history.apply(RecipeParameters()) // Neutral/Undo branch cannot erase original target inventory.
            history.apply(try RecipeParameters().settingPortrait(altered))
            history.undo() // Hidden redo entries must also be validated.
            XCTAssertThrowsError(try ProjectCheckpoint(asset: a, history: history, revision: 0).validate())
        }
        let subset = try PortraitRecipe(assetID: a.id, originalSHA256: a.sha256,
            targets: [PortraitFaceTarget(id: original.id, anchor: original.anchor, exposureEV: -0.5)])
        var history = EditHistory(parameters: try RecipeParameters().settingPortrait(p))
        history.apply(RecipeParameters()); history.apply(try RecipeParameters().settingPortrait(subset))
        XCTAssertThrowsError(try ProjectCheckpoint(asset: a, history: history, revision: 0).validate())
    }

    func testOverlappingFaceAnchorsAreRejectedAtRecipeBoundary() throws {
        let a = asset(), p = try portrait(a), first = p.targets[0]
        for x in [0.1, 0.15, 0.299] {
            let second = try PortraitFaceTarget(anchor: PortraitFaceAnchor(x: x, y: 0.2, width: 0.2, height: 0.3))
            XCTAssertThrowsError(try PortraitRecipe(assetID: a.id, originalSHA256: a.sha256, targets: [first, second]))
        }
        XCTAssertNoThrow(try p.validate())
    }

    func testFutureCreatedRecipeRemainsEditableAfterClockCorrection() throws {
        let a = asset(), targets = try portrait(a).targets
        let future = "2099-01-02T03:04:05.000Z"
        let p = try PortraitRecipe(assetID: a.id, originalSHA256: a.sha256, targets: targets,
            createdAt: future, updatedAt: future)
        let changed = try p.settingExposure(0.75, targetID: targets[0].id)
        XCTAssertEqual(changed.createdAt, future)
        XCTAssertEqual(changed.updatedAt, future)
        XCTAssertEqual(changed.targets[0].id, targets[0].id)
        XCTAssertEqual(changed.targets[0].anchor, targets[0].anchor)
        XCTAssertEqual(changed.targets[0].exposureEV, 0.75)
        XCTAssertNoThrow(try changed.validate())
    }

    func testReplacingHistoryCannotRebindPersistedTargetUUID() async throws {
        let root = try temporaryDirectory(); defer { try? FileManager.default.removeItem(at: root) }
        let a = asset(), p = try portrait(a), store = try ProjectStore(directory: root)
        let saved = ProjectCheckpoint(asset: a, history: .init(parameters: try RecipeParameters().settingPortrait(p)), revision: 0)
        try await store.save(saved, expectedRevision: nil)
        let moved = try PortraitFaceTarget(id: p.targets[0].id, anchor: p.targets[1].anchor, exposureEV: 1)
        let altered = try PortraitRecipe(assetID: a.id, originalSHA256: a.sha256, targets: [moved])
        let replacement = ProjectCheckpoint(asset: a, history: .init(parameters: try RecipeParameters().settingPortrait(altered)), revision: 1)
        do { try await store.save(replacement, expectedRevision: 0); XCTFail("same UUID must not acquire another person's anchor") }
        catch { }
        let loaded = try await store.load(id: a.id)
        XCTAssertEqual(loaded, saved)
    }

    func testInventoryLossRejectsSaveButUndoWithHiddenInventoryPersists() async throws {
        let root = try temporaryDirectory(); defer { try? FileManager.default.removeItem(at: root) }
        let a = asset(), p = try portrait(a), store = try ProjectStore(directory: root)
        var history = EditHistory()
        history.apply(try RecipeParameters().settingPortrait(p))
        let saved = ProjectCheckpoint(asset: a, history: history, revision: 0)
        try await store.save(saved, expectedRevision: nil)
        history.undo()
        XCTAssertNil(try history.current.portraitRecipe())
        XCTAssertTrue(history.canRedo)
        let undone = ProjectCheckpoint(asset: a, history: history, revision: 1)
        try await store.save(undone, expectedRevision: 0)
        let file = root.appendingPathComponent("\(a.id.uuidString.lowercased()).json")
        let before = try Data(contentsOf: file)
        var forked = history
        forked.apply(RecipeParameters(exposure: 0.25)) // Discards the sole portrait-bearing redo branch.
        XCTAssertFalse(forked.canRedo)
        XCTAssertTrue(try forked.entries.allSatisfy { try $0.parameters.portraitRecipe() == nil })
        do {
            try await store.save(.init(asset: a, history: forked, revision: 2), expectedRevision: 1)
            XCTFail("must not erase the persisted person inventory")
        } catch SuiteValidationError.invalidValue(let reason) {
            XCTAssertEqual(reason, "portraitInventoryLoss")
        }
        let reopened = try ProjectStore(directory: root)
        let loaded = try await reopened.load(id: a.id)
        XCTAssertEqual(loaded, undone)
        XCTAssertEqual(try Data(contentsOf: file), before)
        XCTAssertTrue(loaded?.history.canRedo == true)
        XCTAssertEqual(try loaded?.history.entries.last?.parameters.portraitRecipe()?.targets.map(\.id), p.targets.map(\.id))
    }

    func testSerializedExportPlanRejectsPortraitAssetAndChecksumMismatch() throws {
        let a = asset(), p = try portrait(a)
        let checkpoint = ProjectCheckpoint(asset: a, history: .init(parameters: try RecipeParameters().settingPortrait(p)), revision: 0)
        let plan = try ExportPlan(checkpoint: checkpoint, format: .jpeg)
        let encoded = try JSONEncoder().encode(plan)
        XCTAssertEqual(try JSONDecoder().decode(ExportPlan.self, from: encoded), plan)
        let wire = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        for (field, replacement) in [("assetID", UUID().uuidString), ("originalSHA256", String(repeating: "b", count: 64))] {
            var altered = wire
            altered[field] = replacement
            let data = try JSONSerialization.data(withJSONObject: altered)
            XCTAssertThrowsError(try JSONDecoder().decode(ExportPlan.self, from: data)) { error in
                guard case SuiteValidationError.invalidValue(let reason) = error else {
                    XCTFail("unexpected rejection: \(error)"); return
                }
                XCTAssertEqual(reason, "exportPersonAssetBinding")
            }
        }
    }
}
