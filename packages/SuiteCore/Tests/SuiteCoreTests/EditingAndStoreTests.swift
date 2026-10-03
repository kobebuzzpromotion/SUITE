import Foundation
import XCTest
@testable import SuiteCore

final class EditingAndStoreTests: XCTestCase, @unchecked Sendable {
    private func asset() -> AssetRecord {
        AssetRecord(originalFilename: "original.dng", originalRelativePath: "originals/original.dng",
                    sha256: String(repeating: "a", count: 64), createdAt: Date(timeIntervalSince1970: 1))
    }

    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("suite-core-test-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    func testUndoRedoAndNewEditDiscardOnlyAbandonedBranch() throws {
        var history = EditHistory()
        let first = RecipeParameters(exposure: 1)
        let abandoned = RecipeParameters(exposure: 2)
        let replacement = RecipeParameters(exposure: 3)
        history.apply(first)
        history.apply(abandoned)
        history.undo()
        XCTAssertEqual(history.current, first)
        XCTAssertTrue(history.canRedo)
        history.apply(replacement)
        XCTAssertFalse(history.canRedo)
        XCTAssertEqual(history.entries.count, 3)
        history.undo()
        XCTAssertEqual(history.current, first)
        history.redo()
        XCTAssertEqual(history.current, replacement)
        history.apply(replacement)
        XCTAssertEqual(history.entries.count, 3)
        try history.validate()
    }

    func testExtendedRAWAndAIParametersSurviveHistoryRoundTrip() throws {
        var recipe = RecipeParameters()
        recipe.extendedParameters = [
            "raw.whiteBalance": .number(5_200),
            "portrait.skin": .number(18),
            "body.waist": .number(-12),
            "color.toneCurve": .array([.array([.number(0), .number(0)]), .array([.number(1), .number(1)])]),
            "future.vendor.option": .object(["mode": .text("preserve"), "enabled": .flag(true)])
        ]
        recipe.processingOrder = [.whiteBalance, .exposure, .toneCurve, .crop]
        var history = EditHistory()
        history.apply(recipe, editorID: "editor-reference", timestamp: Date(timeIntervalSince1970: 10))
        history.undo()
        let restored = try JSONDecoder().decode(EditHistory.self, from: JSONEncoder().encode(history))
        XCTAssertEqual(restored, history)
        XCTAssertTrue(restored.canRedo)
        XCTAssertEqual(RAWAdjustment.allCases.count, 18)
    }

    func testHistoryRejectsEmptyOrOutOfBoundsCursorAndUnknownFields() throws {
        let history = EditHistory()
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(history)) as? [String: Any])
        object["cursor"] = 10
        XCTAssertThrowsError(try JSONDecoder().decode(EditHistory.self, from: JSONSerialization.data(withJSONObject: object)))
        object["cursor"] = 0
        object["entries"] = []
        XCTAssertThrowsError(try JSONDecoder().decode(EditHistory.self, from: JSONSerialization.data(withJSONObject: object)))
        var recipeObject = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(RecipeParameters())) as? [String: Any])
        recipeObject["futureUnknownTopLevel"] = 1
        XCTAssertThrowsError(try JSONDecoder().decode(RecipeParameters.self, from: JSONSerialization.data(withJSONObject: recipeObject)))
        XCTAssertThrowsError(try RecipeParameters(exposure: .nan).validate())
        XCTAssertThrowsError(try RecipeParameters(exposure: 1, processingOrder: [.contrast]).validate())
    }

    func testStoreRoundTripPreservesRedoAndOriginalBinary() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let original = directory.appendingPathComponent("source.dng")
        let originalBytes = Data([0, 1, 2, 255, 17])
        try originalBytes.write(to: original)
        let store = try ProjectStore(directory: directory.appendingPathComponent("metadata"))
        var history = EditHistory()
        history.apply(.init(exposure: 0.32))
        history.undo()
        let checkpoint = ProjectCheckpoint(asset: asset(), history: history, revision: 0, updatedAt: Date(timeIntervalSince1970: 20))
        try await store.save(checkpoint, expectedRevision: nil)
        let reopened = try ProjectStore(directory: directory.appendingPathComponent("metadata"))
        let restored = try await reopened.load(id: checkpoint.asset.id)
        XCTAssertEqual(restored, checkpoint)
        XCTAssertTrue(restored?.history.canRedo == true)
        let listed = try await reopened.list()
        XCTAssertEqual(listed, [checkpoint])
        XCTAssertEqual(try Data(contentsOf: original), originalBytes)
    }

    func testStaleCASAndInvalidRevisionNeverReplaceSavedCheckpoint() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try ProjectStore(directory: directory)
        let original = ProjectCheckpoint(asset: asset(), history: EditHistory(), revision: 0)
        try await store.save(original, expectedRevision: nil)
        var edited = original.history
        edited.apply(.init(exposure: 1))
        // CAS uses revision, not device wall-clock ordering (clock correction/cross-device timestamps).
        let next = ProjectCheckpoint(asset: original.asset, history: edited, revision: 1, updatedAt: Date(timeIntervalSince1970: 1))
        try await store.save(next, expectedRevision: 0)
        do { try await store.save(next, expectedRevision: 0); XCTFail("Stale update must fail") }
        catch ProjectStoreError.revisionConflict(let expected, let actual) { XCTAssertEqual(expected, 0); XCTAssertEqual(actual, 1) }
        do { try await store.save(next, expectedRevision: nil); XCTFail("Create-only must not overwrite") }
        catch ProjectStoreError.revisionConflict { }
        let skip = ProjectCheckpoint(asset: original.asset, history: edited, revision: 3)
        do { try await store.save(skip, expectedRevision: 1); XCTFail("Revision skip must fail") }
        catch ProjectStoreError.invalidNextRevision { }
        let loaded = try await store.load(id: original.asset.id)
        XCTAssertEqual(loaded, next)
    }

    func testTwoStoreInstancesCannotBothWinSameExpectedRevision() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let a = try ProjectStore(directory: directory)
        let b = try ProjectStore(directory: directory)
        let initial = ProjectCheckpoint(asset: asset(), history: EditHistory(), revision: 0)
        try await a.save(initial, expectedRevision: nil)
        let left = ProjectCheckpoint(asset: initial.asset, history: EditHistory(parameters: .init(exposure: 1)), revision: 1)
        let right = ProjectCheckpoint(asset: initial.asset, history: EditHistory(parameters: .init(exposure: 2)), revision: 1)
        let wins = await withTaskGroup(of: Bool.self, returning: Int.self) { group in
            group.addTask { do { try await a.save(left, expectedRevision: 0); return true } catch { return false } }
            group.addTask { do { try await b.save(right, expectedRevision: 0); return true } catch { return false } }
            var count = 0
            for await won in group { if won { count += 1 } }
            return count
        }
        XCTAssertEqual(wins, 1)
        let final = try await a.load(id: initial.asset.id)
        XCTAssertEqual(final?.revision, 1)
    }

    func testCorruptionAndUnknownSchemaAreNotEmptySuccessOrOverwritten() async throws {
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try ProjectStore(directory: directory)
        let original = ProjectCheckpoint(asset: asset(), history: EditHistory(), revision: 0)
        let file = directory.appendingPathComponent("\(original.asset.id.uuidString.lowercased()).json")
        let damaged = Data("{broken".utf8)
        try damaged.write(to: file)
        do { _ = try await store.load(id: original.asset.id); XCTFail("Corruption must throw") }
        catch ProjectStoreError.corruptCheckpoint { }
        do { _ = try await store.list(); XCTFail("Corrupted member must not disappear") }
        catch ProjectStoreError.corruptCheckpoint { }
        do { try await store.save(original, expectedRevision: nil); XCTFail("Must preserve corrupt evidence") }
        catch ProjectStoreError.corruptCheckpoint { }
        XCTAssertEqual(try Data(contentsOf: file), damaged)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        object["schemaVersion"] = 999
        try JSONSerialization.data(withJSONObject: object).write(to: file)
        do { _ = try await store.load(id: original.asset.id); XCTFail("Unknown schema must throw") }
        catch SuiteValidationError.unsupportedSchema(let version) { XCTAssertEqual(version, 999) }
    }

    func testInvalidPathChecksumAndOriginalMutationAreRejected() async throws {
        let badPath = AssetRecord(originalFilename: "raw.dng", originalRelativePath: "../raw.dng", sha256: String(repeating: "a", count: 64))
        XCTAssertThrowsError(try badPath.validate())
        let badChecksum = AssetRecord(originalFilename: "raw.dng", originalRelativePath: "originals/raw.dng", sha256: "not-verified")
        XCTAssertThrowsError(try badChecksum.validate())
        let directory = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: directory) }
        let store = try ProjectStore(directory: directory)
        let initial = ProjectCheckpoint(asset: asset(), history: EditHistory(), revision: 0)
        try await store.save(initial, expectedRevision: nil)
        let replacementAsset = AssetRecord(id: initial.asset.id, originalFilename: initial.asset.originalFilename,
                                           originalRelativePath: initial.asset.originalRelativePath,
                                           sha256: String(repeating: "b", count: 64), createdAt: initial.asset.createdAt)
        do {
            try await store.save(.init(asset: replacementAsset, history: initial.history, revision: 1), expectedRevision: 0)
            XCTFail("Original identity must stay immutable")
        } catch ProjectStoreError.immutableOriginalChanged { }
        let loaded = try await store.load(id: initial.asset.id)
        XCTAssertEqual(loaded, initial)
    }
}
