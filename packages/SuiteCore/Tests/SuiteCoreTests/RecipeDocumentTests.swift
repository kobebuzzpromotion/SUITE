import Foundation
import XCTest
@testable import SuiteCore

final class RecipeDocumentTests: XCTestCase {
    func testGoldenFixtureRoundTripsAsIdenticalPlainJSON() throws {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        let fixture = root.appendingPathComponent("contracts/recipe-v1.example.json")
        let input = try Data(contentsOf: fixture)
        let document = try JSONDecoder().decode(RecipeDocument.self, from: input)
        XCTAssertEqual(document.schemaVersion, 1)
        let output = try JSONEncoder().encode(document)
        let inputObject = try XCTUnwrap(JSONSerialization.jsonObject(with: input) as? NSDictionary)
        let outputObject = try XCTUnwrap(JSONSerialization.jsonObject(with: output) as? NSDictionary)
        XCTAssertEqual(outputObject, inputObject)
        XCTAssertEqual(try JSONDecoder().decode(RecipeDocument.self, from: output), document)
    }

    func testPortableValueEncodingHasNoEnumEnvelopeAndRejectsNull() throws {
        let value = RecipeValue.object(["amount": .number(-8), "enabled": .flag(true), "label": .text("Summer"),
                                        "curve": .array([.number(0), .number(1)])])
        let encoded = try JSONEncoder().encode(value)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual(object["amount"] as? Double, -8)
        XCTAssertEqual(object["enabled"] as? Bool, true)
        XCTAssertEqual(object["label"] as? String, "Summer")
        XCTAssertEqual(object["curve"] as? [Double], [0, 1])
        XCTAssertEqual(try JSONDecoder().decode(RecipeValue.self, from: encoded), value)
        for invalid in ["null", "[null]", #"{"value":null}"#] {
            XCTAssertThrowsError(try JSONDecoder().decode(RecipeValue.self, from: Data(invalid.utf8)))
        }
    }

    func testDocumentRejectsUnknownVersionUnknownFieldsAndUnsafeInteger() throws {
        let good = try RecipeDocument(parameters: .init())
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(good)) as? [String: Any])
        object["schemaVersion"] = 2
        XCTAssertThrowsError(try JSONDecoder().decode(RecipeDocument.self, from: JSONSerialization.data(withJSONObject: object)))
        object["schemaVersion"] = 1
        object["operations"] = []
        XCTAssertThrowsError(try JSONDecoder().decode(RecipeDocument.self, from: JSONSerialization.data(withJSONObject: object)))
        XCTAssertThrowsError(try RecipeDocument(parameters: .init(rotationDegrees: 9_007_199_254_740_992)))
        XCTAssertThrowsError(try RecipeDocument(parameters: .init(rotationDegrees: -9_007_199_254_740_992)))
        XCTAssertNoThrow(try RecipeDocument(parameters: .init(rotationDegrees: 9_007_199_254_740_991)))
        XCTAssertThrowsError(try RecipeDocument(parameters: .init(exposure: 1, processingOrder: [])))
    }

    func testPostDecodeStageRoundTripsButDoesNotClaimNativeRendering() throws {
        let parameters = RecipeParameters(
            extendedParameters: ["postDecodeAdjustments": .object([
                "schemaVersion": .number(1), "engineVersion": .text("suite-srgb8-color-detail-1"),
                "color": .object(["vibrance": .number(12)])
            ])],
            processingOrder: [.exposure, .contrast, .saturation, .postDecodeAdjustments, .rotation]
        )
        let document = try RecipeDocument(parameters: parameters)
        let encoded = try JSONEncoder().encode(document)
        XCTAssertEqual(try JSONDecoder().decode(RecipeDocument.self, from: encoded), document)
        XCTAssertEqual(RAWAdjustment.postDecodeAdjustments.rawValue, "postDecodeAdjustments")
        XCTAssertThrowsError(try RecipeDocument(parameters: .init(extendedParameters: parameters.extendedParameters)))
        // PhotoPipeline.supportedAdjustments deliberately excludes this stage until native pixels are implemented.
    }
}
