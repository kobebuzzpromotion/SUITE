import XCTest
import UIKit
import ImageIO
import SuiteCore
@testable import SUITE

final class PhotoPipelineTests: XCTestCase {
    func testImportPreviewAndFullExportPreserveOriginal() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = root.appendingPathComponent("input.jpg")
        let data = await MainActor.run {
            UIGraphicsImageRenderer(size: CGSize(width: 2400, height: 1600)).jpegData(withCompressionQuality: 0.95) { context in
                UIColor.orange.setFill()
                context.fill(CGRect(x: 0, y: 0, width: 2400, height: 1600))
            }
        }
        try data.write(to: fixture)
        let pipeline = PhotoPipeline(root: root.appendingPathComponent("library"))
        let asset = try await pipeline.importFile(fixture, proxyLongEdge: 800)
        let original = root.appendingPathComponent("library").appendingPathComponent(asset.originalRelativePath)
        XCTAssertEqual(try Data(contentsOf: original), data)
        let preview = try await pipeline.preview(asset: asset, parameters: .init(exposure: 0.2))
        let source = try XCTUnwrap(CGImageSourceCreateWithData(preview as CFData, nil))
        let props = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        XCTAssertLessThanOrEqual(props[kCGImagePropertyPixelWidth] as? Int ?? Int.max, 800)
        for tiff in [false, true] {
            let url = try await pipeline.export(checkpoint: .init(asset: asset, history: .init(), revision: 0), format: tiff ? .tiff : .jpeg)
            let output = try XCTUnwrap(CGImageSourceCreateWithURL(url as CFURL, nil))
            let info = try XCTUnwrap(CGImageSourceCopyPropertiesAtIndex(output, 0, nil) as? [CFString: Any])
            XCTAssertEqual(info[kCGImagePropertyPixelWidth] as? Int, 2400)
        }
        XCTAssertEqual(try Data(contentsOf: original), data)
        // Removing only the test's original models an absent local original. Proxy must not become Final.
        try FileManager.default.removeItem(at: original)
        _ = try await pipeline.preview(asset: asset, parameters: .init())
        do {
            _ = try await pipeline.export(checkpoint: .init(asset: asset, history: .init(), revision: 0), format: .jpeg)
            XCTFail("Proxy must never substitute for a missing Original")
        } catch { XCTAssertEqual(error.localizedDescription, "Original取得待ち") }
    }
}
