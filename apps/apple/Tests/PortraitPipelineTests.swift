import XCTest
import Foundation
import CoreImage
import UIKit
import CryptoKit
import SuiteCore
@testable import SUITE

/// Apple-only tests: generated pixels exercise the real Core Image compositor, not face detection accuracy.
/// All cases remain NOT_RUN on Windows; source checks are never substitutes for these executions.
final class PortraitPipelineTests: XCTestCase {
    private func anchor(_ x: Double = 0.1) throws -> PortraitFaceAnchor {
        try .init(x: x, y: 0.2, width: 0.2, height: 0.3)
    }
    private func target(_ x: Double = 0.1, ev: Double = 1) throws -> PortraitFaceTarget {
        try .init(anchor: anchor(x), exposureEV: ev)
    }
    private func context() throws -> CIContext {
        let linear = try XCTUnwrap(CGColorSpace(name: CGColorSpace.linearSRGB))
        return CIContext(options: [.workingColorSpace: linear, .outputColorSpace: linear, .cacheIntermediates: false])
    }
    private func sample(_ image: CIImage, x: Int, y: Int, context: CIContext) throws -> [Float] {
        var result = [Float](repeating: 0, count: 4)
        let linear = try XCTUnwrap(CGColorSpace(name: CGColorSpace.linearSRGB))
        result.withUnsafeMutableBytes { bytes in
            context.render(image, toBitmap: bytes.baseAddress!, rowBytes: 4 * MemoryLayout<Float>.size,
                bounds: CGRect(x: CGFloat(x), y: CGFloat(y), width: 1, height: 1), format: .RGBAf, colorSpace: linear)
        }
        XCTAssertTrue(result.allSatisfy(\.isFinite))
        return result
    }
    private func constant(_ white: CGFloat, extent: CGRect) -> CIImage {
        CIImage(color: CIColor(red: white, green: white, blue: white, alpha: 1)).cropped(to: extent)
    }
    private func halfMask(extent: CGRect, left: Bool) -> CIImage {
        let rect = CGRect(x: left ? 0 : extent.width / 2, y: 0, width: extent.width / 2, height: extent.height)
        return constant(1, extent: rect).composited(over: constant(0, extent: extent)).cropped(to: extent)
    }

    func testMatchingUsesAnchorsNotDetectorArrayOrder() throws {
        let left = try target(), right = try target(0.6)
        XCTAssertEqual(try PortraitPipeline.resolveTargets([left, right], detected: [right.anchor, left.anchor]), [1, 0])
    }

    func testMissingAmbiguousAndReusedDetectionsFailClosed() throws {
        let left = try target()
        XCTAssertThrowsError(try PortraitPipeline.resolveTargets([left], detected: []))
        XCTAssertThrowsError(try PortraitPipeline.resolveTargets([left], detected: [anchor(0.6)]))
        XCTAssertThrowsError(try PortraitPipeline.resolveTargets([left], detected: [left.anchor, left.anchor]))
        let competing = try PortraitFaceTarget(anchor: left.anchor, exposureEV: 0.5)
        XCTAssertThrowsError(try PortraitPipeline.resolveTargets([left, competing], detected: [left.anchor]))
    }

    func testMissingMemberAndNewExtraFaceRejectCompleteInventoryMatch() throws {
        let left = try target(), right = try target(0.6)
        XCTAssertThrowsError(try PortraitPipeline.resolveTargets([left, right], detected: [right.anchor]))
        XCTAssertThrowsError(try PortraitPipeline.resolveTargets([left], detected: [left.anchor, right.anchor]))
        XCTAssertEqual(try PortraitPipeline.resolveTargets([left, right], detected: [right.anchor, left.anchor]), [1, 0])
    }

    func testNearbyOverlappingSavedOrDetectedFacesRejectInsteadOfChoosingOne() throws {
        let left = try target(), overlapping = try target(0.15), right = try target(0.6)
        XCTAssertThrowsError(try PortraitPipeline.resolveTargets([left, overlapping], detected: [left.anchor, overlapping.anchor]))
        XCTAssertThrowsError(try PortraitPipeline.resolveTargets([left, right], detected: [left.anchor, overlapping.anchor]))
        XCTAssertThrowsError(try PortraitPipeline.validateSeparatedFaces([left.anchor, overlapping.anchor]))
        XCTAssertNoThrow(try PortraitPipeline.validateSeparatedFaces([left.anchor, right.anchor]))
    }

    func testRealCompositorChangesOnlyWhiteMaskRegion() throws {
        let extent = CGRect(x: 0, y: 0, width: 80, height: 40), ctx = try context()
        let image = constant(0.2, extent: extent), mask = halfMask(extent: extent, left: true)
        let output = try FaceBrightnessAdapter().render(target: target(), image: image, mask: mask)
        let before = try sample(image, x: 20, y: 20, context: ctx)
        let changed = try sample(output, x: 20, y: 20, context: ctx)
        let background = try sample(output, x: 60, y: 20, context: ctx)
        XCTAssertGreaterThan(changed[0], before[0])
        for channel in 0..<4 { XCTAssertEqual(background[channel], before[channel], accuracy: 0.0001) }
        XCTAssertEqual(output.extent, extent)
    }

    func testZeroAdjustmentIsPixelNoOpAtCompositorBoundary() throws {
        let extent = CGRect(x: 0, y: 0, width: 80, height: 40), ctx = try context()
        let image = constant(0.2, extent: extent)
        let output = try FaceBrightnessAdapter().render(target: target(ev: 0), image: image, mask: halfMask(extent: extent, left: true))
        for x in [10, 60] {
            let before = try sample(image, x: x, y: 20, context: ctx)
            let after = try sample(output, x: x, y: 20, context: ctx)
            for channel in 0..<4 { XCTAssertEqual(after[channel], before[channel], accuracy: 0.0001) }
        }
    }

    func testTwoDisjointPeopleDoNotDoubleApplyFirstPersonsExposure() throws {
        let extent = CGRect(x: 0, y: 0, width: 80, height: 40), ctx = try context()
        let image = constant(0.2, extent: extent), adapter = FaceBrightnessAdapter()
        let first = try adapter.render(target: target(ev: 0.5), image: image, mask: halfMask(extent: extent, left: true))
        let second = try adapter.render(target: target(0.6, ev: -0.5), image: first, mask: halfMask(extent: extent, left: false))
        let afterFirst = try sample(first, x: 20, y: 20, context: ctx)
        let afterSecond = try sample(second, x: 20, y: 20, context: ctx)
        for channel in 0..<4 { XCTAssertEqual(afterSecond[channel], afterFirst[channel], accuracy: 0.0001) }
        let untouchedRight = try sample(first, x: 60, y: 20, context: ctx)
        let adjustedRight = try sample(second, x: 60, y: 20, context: ctx)
        XCTAssertLessThan(adjustedRight[0], untouchedRight[0])
    }

    func testNormalizedMaskScalesConsistentlyBetweenProxyAndFinalCompositors() throws {
        let ctx = try context(), adapter = FaceBrightnessAdapter(), t = try target(ev: 0.5)
        let proxy = CGRect(x: 0, y: 0, width: 80, height: 40), final = CGRect(x: 0, y: 0, width: 800, height: 400)
        let small = try adapter.render(target: t, image: constant(0.2, extent: proxy), mask: halfMask(extent: proxy, left: true))
        let large = try adapter.render(target: t, image: constant(0.2, extent: final), mask: halfMask(extent: final, left: true))
        for (x, y) in [(20, 20), (60, 20)] {
            let a = try sample(small, x: x, y: y, context: ctx), b = try sample(large, x: x * 10, y: y * 10, context: ctx)
            for channel in 0..<4 { XCTAssertEqual(a[channel], b[channel], accuracy: 0.0001) }
        }
        // This is compositor scale parity only, not fresh Vision detector/mask parity.
    }

    func testBlankImageDoesNotInventFaceOrFallBackToGlobalAdjustment() throws {
        let pipeline = PortraitPipeline(context: try context())
        let asset = AssetRecord(originalFilename: "generated.png", originalRelativePath: "Originals/generated.png",
            sha256: String(repeating: "a", count: 64))
        XCTAssertThrowsError(try pipeline.analyze(image: constant(0.2, extent: CGRect(x: 0, y: 0, width: 320, height: 240)), asset: asset))
    }

    func testUndoReanalysisReusesHiddenRedoInventoryWithNeutralValues() throws {
        let a = AssetRecord(originalFilename: "photo.jpg", originalRelativePath: "Originals/photo.jpg", sha256: String(repeating: "a", count: 64))
        let p = try PortraitRecipe(assetID: a.id, originalSHA256: a.sha256, targets: [target(ev: 1), target(0.6, ev: -0.5)])
        var history = EditHistory()
        history.apply(try RecipeParameters().settingPortrait(p))
        history.undo()
        XCTAssertNil(try history.current.portraitRecipe())
        XCTAssertTrue(history.canRedo)
        let neutral = try XCTUnwrap(PortraitPipeline.neutralPortrait(from: history, asset: a))
        XCTAssertEqual(neutral.targets.map(\.id), p.targets.map(\.id))
        XCTAssertEqual(neutral.targets.map(\.anchor), p.targets.map(\.anchor))
        XCTAssertEqual(neutral.createdAt, p.createdAt)
        XCTAssertTrue(neutral.targets.allSatisfy { $0.exposureEV == 0 })
        XCTAssertNoThrow(try neutral.validate(against: p))
        XCTAssertEqual(try history.entries.last?.parameters.portraitRecipe(), p)
    }

    func testMissingOriginalCannotBecomePortraitFinal() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("suite-portrait-missing-\(UUID())")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let a = AssetRecord(originalFilename: "absent.dng", originalRelativePath: "Originals/absent.dng", sha256: String(repeating: "a", count: 64))
        let p = try PortraitRecipe(assetID: a.id, originalSHA256: a.sha256, targets: [target()])
        let saved = ProjectCheckpoint(asset: a, history: .init(parameters: try RecipeParameters().settingPortrait(p)), revision: 0)
        do { _ = try await PhotoPipeline(root: root).export(checkpoint: saved, format: .jpeg); XCTFail("missing Original") }
        catch PhotoPipelineError.waitingForOriginal { }
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("Exports").path))
    }

    @MainActor
    private func waitForEditorIdle(_ model: EditorModel) async throws {
        let deadline = Date().addingTimeInterval(5)
        while model.isBusy && Date() < deadline { try await Task.sleep(nanoseconds: 10_000_000) }
        guard !model.isBusy else { throw NSError(domain: "PortraitPipelineTests.timeout", code: 1) }
    }

    @MainActor
    private func seedPreviousSelection(_ model: EditorModel) throws -> PortraitRecipe {
        let asset = AssetRecord(originalFilename: "absent.jpg", originalRelativePath: "Originals/absent.jpg",
            sha256: String(repeating: "a", count: 64))
        let p = try PortraitRecipe(assetID: asset.id, originalSHA256: asset.sha256, targets: [target(), target(0.6)])
        model.selectedAsset = asset
        model.parameters = try RecipeParameters().settingPortrait(p)
        // A state marker only: never submitted as a successful detector/proxy fixture.
        model.portraitReferencePreview = UIImage()
        model.selectedPortraitTargetID = p.targets[0].id
        return p
    }

    /// PGI-PERSON-RESELECT / NATIVE_NOT_RUN: invokes the real EditorModel command, not data lookup.
    @MainActor
    func testPGIPersonReselectUnknownRequestClearsPriorUUIDWithoutFallback() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("suite-pgi-reselect-\(UUID())")
        defer { try? FileManager.default.removeItem(at: root) }
        let model = EditorModel(storageRoot: root), p = try seedPreviousSelection(model)
        XCTAssertNil(model.errorMessage)
        model.selectPortraitTarget(p.targets[1].id)
        XCTAssertEqual(model.selectedPortraitTargetID, p.targets[1].id)
        model.selectPortraitTarget(UUID())
        XCTAssertNil(model.selectedPortraitTargetID)
        XCTAssertEqual(try model.parameters.portraitRecipe(), p)
        model.selectPortraitTarget(p.targets[0].id)
        model.portraitReferencePreview = nil
        model.selectPortraitTarget(p.targets[1].id)
        XCTAssertNil(model.selectedPortraitTargetID)
    }

    /// PGI-PREPARE-FAILURE / NATIVE_NOT_RUN: actual PhotoPipeline fails on absent Proxy, no mock adapter.
    @MainActor
    func testPGIMissingProxyRevalidationClearsPriorSelectionAtStartAndFailure() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("suite-pgi-proxy-\(UUID())")
        defer { try? FileManager.default.removeItem(at: root) }
        let model = EditorModel(storageRoot: root), p = try seedPreviousSelection(model)
        XCTAssertNil(model.errorMessage)
        model.preparePortraitTargets()
        XCTAssertTrue(model.isBusy)
        XCTAssertNil(model.selectedPortraitTargetID)
        XCTAssertNil(model.portraitReferencePreview)
        try await waitForEditorIdle(model)
        XCTAssertNotNil(model.errorMessage)
        XCTAssertNil(model.selectedPortraitTargetID)
        XCTAssertNil(model.portraitReferencePreview)
        XCTAssertEqual(try model.parameters.portraitRecipe(), p)
        XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("Originals/absent.jpg").path))
    }

    /// PGI-ASSET-SWITCH / NATIVE_NOT_RUN: actual ProjectStore cannot load the absent destination checkpoint.
    @MainActor
    func testPGIFailedAssetSwitchClearsOldTargetWithoutRelabelingRecipe() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("suite-pgi-switch-\(UUID())")
        defer { try? FileManager.default.removeItem(at: root) }
        let model = EditorModel(storageRoot: root), p = try seedPreviousSelection(model)
        let missing = AssetRecord(originalFilename: "other.jpg", originalRelativePath: "Originals/other.jpg",
            sha256: String(repeating: "b", count: 64))
        XCTAssertNil(model.errorMessage)
        model.select(missing)
        XCTAssertTrue(model.isBusy)
        XCTAssertNil(model.selectedPortraitTargetID)
        XCTAssertNil(model.portraitReferencePreview)
        try await waitForEditorIdle(model)
        XCTAssertNotNil(model.errorMessage)
        XCTAssertNil(model.selectedPortraitTargetID)
        XCTAssertNil(model.portraitReferencePreview)
        XCTAssertEqual(model.selectedAsset?.id, p.assetID)
        XCTAssertEqual(try model.parameters.portraitRecipe(), p)
    }

    /// PGI-IMPORT-FAILURE / NATIVE_NOT_RUN: nonexistent input must not retain an actionable old target.
    @MainActor
    func testPGIFailedImportClearsPriorTargetAndPreservesPriorRecipe() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("suite-pgi-import-\(UUID())")
        defer { try? FileManager.default.removeItem(at: root) }
        let model = EditorModel(storageRoot: root), p = try seedPreviousSelection(model)
        XCTAssertNil(model.errorMessage)
        model.importFile(root.appendingPathComponent("nonexistent-input.jpg"))
        XCTAssertTrue(model.isBusy)
        XCTAssertNil(model.selectedPortraitTargetID)
        XCTAssertNil(model.portraitReferencePreview)
        try await waitForEditorIdle(model)
        XCTAssertNotNil(model.errorMessage)
        XCTAssertNil(model.selectedPortraitTargetID)
        XCTAssertNil(model.portraitReferencePreview)
        XCTAssertEqual(try model.parameters.portraitRecipe(), p)
    }

    /// PGI-EXPORT-PERSISTED-BINDING / NATIVE_NOT_RUN: metadata validation only, never RAW/image decode.
    func testDetachedExportPlanCannotSwapSavedPersonAnchorsAndPreservesNonImageBytes() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("suite-pgi-export-binding-\(UUID())")
        try FileManager.default.createDirectory(at: root.appendingPathComponent("Originals"), withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let bytes = Data("Non-image metadata-boundary fixture; never a RAW or portrait fixture".utf8)
        let checksum = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
        let original = root.appendingPathComponent("Originals/metadata-only.bin")
        try bytes.write(to: original)
        let asset = AssetRecord(originalFilename: "metadata-only.bin", originalRelativePath: "Originals/metadata-only.bin", sha256: checksum)
        let p = try PortraitRecipe(assetID: asset.id, originalSHA256: checksum, targets: [target(), target(0.6)])
        let saved = ProjectCheckpoint(asset: asset, history: .init(parameters: try RecipeParameters().settingPortrait(p)), revision: 0)
        let store = try ProjectStore(directory: root.appendingPathComponent("Recipes"))
        try await store.save(saved, expectedRevision: nil)
        let pipeline = PhotoPipeline(root: root)
        let destination = root.appendingPathComponent("Exports/never-rendered.jpg")
        let validPlan = try ExportPlan(checkpoint: saved, format: .jpeg)
        // Positive metadata control ensures the altered request is not rejected just because .bin cannot decode.
        try await pipeline.validate(RAWRenderRequest(plan: validPlan, originalURL: original, destinationURL: destination))
        let swapped = try PortraitRecipe(assetID: asset.id, originalSHA256: checksum, targets: [
            PortraitFaceTarget(id: p.targets[0].id, anchor: p.targets[1].anchor, exposureEV: p.targets[0].exposureEV),
            PortraitFaceTarget(id: p.targets[1].id, anchor: p.targets[0].anchor, exposureEV: p.targets[1].exposureEV)
        ], createdAt: p.createdAt, updatedAt: p.updatedAt)
        let detached = ProjectCheckpoint(asset: asset, history: .init(parameters: try RecipeParameters().settingPortrait(swapped)), revision: 0)
        let plan = try ExportPlan(checkpoint: detached, format: .jpeg)
        // Shape/binding alone is valid. The actual saved inventory must prevent this UUID reassignment.
        XCTAssertNoThrow(try plan.validate())
        do {
            try await pipeline.validate(RAWRenderRequest(plan: plan, originalURL: original, destinationURL: destination))
            XCTFail("detached person-anchor reassignment must not be trusted")
        } catch PhotoPipelineError.unsupportedRecipe { }
        XCTAssertEqual(try Data(contentsOf: original), bytes)
        let restored = try await store.load(id: asset.id)
        XCTAssertEqual(restored, saved)
        XCTAssertFalse(FileManager.default.fileExists(atPath: destination.path))
    }
}
