import Foundation

/// Describes an expected asset, not an installed or successfully executed model.
/// No YuNet/SFace manifest is fabricated while the pinned asset data is unavailable.
public struct LocalAIModelManifest: Codable, Equatable, Sendable {
    public enum ManifestError: Error, Equatable, Sendable {
        case invalidField(String)
        case unsupportedSchema(Int)
        case permissionNotConfirmed(String)
    }

    public enum PermissionState: String, Codable, Sendable {
        case unreviewed, confirmed, denied
    }

    /// A recorded review is evidence supplied by the distributor, not legal approval
    /// inferred from a model's name or the availability of a public download.
    public struct PermissionReview: Codable, Equatable, Sendable {
        public let state: PermissionState
        public let evidenceReference: String?
        public let reviewer: String?
        public let reviewedAt: Date?

        public init(state: PermissionState, evidenceReference: String? = nil,
                    reviewer: String? = nil, reviewedAt: Date? = nil) {
            self.state = state; self.evidenceReference = evidenceReference
            self.reviewer = reviewer; self.reviewedAt = reviewedAt
        }

        fileprivate func validate(_ field: String) throws {
            if state != .unreviewed {
                guard let evidenceReference, LocalAIModelManifest.hasText(evidenceReference),
                      let reviewer, LocalAIModelManifest.hasText(reviewer),
                      let reviewedAt, reviewedAt.timeIntervalSince1970.isFinite else {
                    throw ManifestError.invalidField(field + ".reviewEvidence")
                }
            }
        }
    }

    public struct License: Codable, Equatable, Sendable {
        public let identifier: String
        public let sourceURL: URL
        public let licenseTextReference: String
        /// Required even when no upstream NOTICE exists: reference the reviewed
        /// attribution record which explicitly records that finding.
        public let noticeReference: String
        public let commercialUse: PermissionReview
        public let redistribution: PermissionReview

        public init(identifier: String, sourceURL: URL, licenseTextReference: String,
                    noticeReference: String, commercialUse: PermissionReview,
                    redistribution: PermissionReview) {
            self.identifier = identifier; self.sourceURL = sourceURL
            self.licenseTextReference = licenseTextReference; self.noticeReference = noticeReference
            self.commercialUse = commercialUse; self.redistribution = redistribution
        }
    }

    public struct Tensor: Codable, Equatable, Sendable {
        public enum ElementType: String, Codable, Sendable { case float32, float16, uint8, int8, int32, int64 }
        public let name: String
        public let elementType: ElementType
        /// Positive fixed dimensions; -1 is a declared dynamic dimension, never 0.
        public let shape: [Int]
        public let axes: [String]

        public init(name: String, elementType: ElementType, shape: [Int], axes: [String]) {
            self.name = name; self.elementType = elementType; self.shape = shape; self.axes = axes
        }

        fileprivate func validate() throws {
            guard LocalAIModelManifest.hasText(name), !shape.isEmpty, shape.count <= 8,
                  shape.allSatisfy({ $0 > 0 || $0 == -1 }), axes.count == shape.count,
                  axes.allSatisfy(LocalAIModelManifest.hasText), Set(axes).count == axes.count else {
                throw ManifestError.invalidField("tensor")
            }
        }
    }

    public struct ImageInput: Codable, Equatable, Sendable {
        public enum ColorOrder: String, Codable, Sendable { case rgb, bgr, grayscale }
        public enum Resize: String, Codable, Sendable { case stretch, letterbox, alignedFace, none }
        public let colorOrder: ColorOrder
        public let resize: Resize
        /// Explicit preprocessing identifier binds alignment, padding, EXIF and
        /// channel packing to a reviewed adapter implementation.
        public let preprocessingVersion: String
        public let preprocessingReference: String
        public let scale: Double
        public let mean: [Double]
        public let standardDeviation: [Double]

        public init(colorOrder: ColorOrder, resize: Resize, preprocessingVersion: String,
                    preprocessingReference: String, scale: Double, mean: [Double], standardDeviation: [Double]) {
            self.colorOrder = colorOrder; self.resize = resize
            self.preprocessingVersion = preprocessingVersion; self.preprocessingReference = preprocessingReference
            self.scale = scale; self.mean = mean; self.standardDeviation = standardDeviation
        }
    }

    public let schemaVersion: Int
    public let modelID: String
    public let fixedVersion: String
    public let sourceURL: URL
    public let expectedSHA256: String
    public let expectedByteCount: UInt64
    public let format: String
    public let runtimeVersion: String
    public let inputs: [Tensor]
    public let outputs: [Tensor]
    public let imageInput: ImageInput
    public let outputInterpretationReference: String
    public let license: License

    public init(modelID: String, fixedVersion: String, sourceURL: URL,
                expectedSHA256: String, expectedByteCount: UInt64, format: String,
                runtimeVersion: String, inputs: [Tensor], outputs: [Tensor], imageInput: ImageInput,
                outputInterpretationReference: String, license: License) throws {
        self.schemaVersion = 1; self.modelID = modelID; self.fixedVersion = fixedVersion
        self.sourceURL = sourceURL; self.expectedSHA256 = expectedSHA256.lowercased()
        self.expectedByteCount = expectedByteCount; self.format = format; self.runtimeVersion = runtimeVersion
        self.inputs = inputs; self.outputs = outputs; self.imageInput = imageInput
        self.outputInterpretationReference = outputInterpretationReference; self.license = license
        try validate()
    }

    public func validate() throws {
        guard schemaVersion == 1 else { throw ManifestError.unsupportedSchema(schemaVersion) }
        for (name, value) in [("modelID", modelID), ("fixedVersion", fixedVersion), ("format", format),
                              ("runtimeVersion", runtimeVersion), ("outputInterpretationReference", outputInterpretationReference),
                              ("license.identifier", license.identifier), ("license.text", license.licenseTextReference),
                              ("license.notice", license.noticeReference), ("preprocessingVersion", imageInput.preprocessingVersion),
                              ("preprocessingReference", imageInput.preprocessingReference)] {
            guard Self.hasText(value) else { throw ManifestError.invalidField(name) }
        }
        let floatingVersions = ["latest", "main", "master", "head", "unknown", "tbd"]
        guard !floatingVersions.contains(fixedVersion.lowercased()),
              !floatingVersions.contains(runtimeVersion.lowercased()) else { throw ManifestError.invalidField("fixedVersion") }
        guard Self.isSourceURL(sourceURL), Self.isSourceURL(license.sourceURL) else { throw ManifestError.invalidField("sourceURL") }
        guard isSHA256(expectedSHA256), Set(expectedSHA256).count > 1, expectedByteCount > 0 else {
            throw ManifestError.invalidField("expectedAssetDigestOrSize")
        }
        guard !inputs.isEmpty, !outputs.isEmpty, inputs.count <= 64, outputs.count <= 64,
              Set(inputs.map(\.name)).count == inputs.count, Set(outputs.map(\.name)).count == outputs.count else {
            throw ManifestError.invalidField("inputsOrOutputs")
        }
        for tensor in inputs + outputs { try tensor.validate() }
        let channels = imageInput.colorOrder == .grayscale ? 1 : 3
        guard imageInput.scale.isFinite, imageInput.scale != 0,
              imageInput.mean.count == channels, imageInput.mean.allSatisfy(\.isFinite),
              imageInput.standardDeviation.count == channels,
              imageInput.standardDeviation.allSatisfy({ $0.isFinite && $0 > 0 }) else {
            throw ManifestError.invalidField("imageInput.normalization")
        }
        try license.commercialUse.validate("commercialUse")
        try license.redistribution.validate("redistribution")
    }

    /// Separate from syntax validation; an unreviewed manifest may be recorded,
    /// but must never be treated as distributable just because it decodes.
    public func validateForCommercialDistribution() throws {
        try validate()
        guard license.commercialUse.state == .confirmed else { throw ManifestError.permissionNotConfirmed("commercialUse") }
        guard license.redistribution.state == .confirmed else { throw ManifestError.permissionNotConfirmed("redistribution") }
    }

    /// Metadata comparison only. The caller must calculate these from actual file
    /// bytes; matching values do not establish license, inference or IO readiness.
    public func matchesMeasuredAsset(sha256: String, byteCount: UInt64) -> Bool {
        (try? validate()) != nil && isSHA256(sha256) && sha256.lowercased() == expectedSHA256.lowercased()
            && byteCount == expectedByteCount
    }

    private static func hasText(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf8.count <= 4096
    }
    private static func isSourceURL(_ url: URL) -> Bool {
        url.scheme == "https" && url.host?.isEmpty == false && url.user == nil && url.password == nil
    }
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case schemaVersion, modelID, fixedVersion, sourceURL, expectedSHA256, expectedByteCount, format
        case runtimeVersion, inputs, outputs, imageInput, outputInterpretationReference, license
    }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
        modelID = try c.decode(String.self, forKey: .modelID)
        fixedVersion = try c.decode(String.self, forKey: .fixedVersion)
        sourceURL = try c.decode(URL.self, forKey: .sourceURL)
        expectedSHA256 = try c.decode(String.self, forKey: .expectedSHA256).lowercased()
        expectedByteCount = try c.decode(UInt64.self, forKey: .expectedByteCount)
        format = try c.decode(String.self, forKey: .format)
        runtimeVersion = try c.decode(String.self, forKey: .runtimeVersion)
        inputs = try c.decode([Tensor].self, forKey: .inputs)
        outputs = try c.decode([Tensor].self, forKey: .outputs)
        imageInput = try c.decode(ImageInput.self, forKey: .imageInput)
        outputInterpretationReference = try c.decode(String.self, forKey: .outputInterpretationReference)
        license = try c.decode(License.self, forKey: .license)
        try validate()
    }
}

extension LocalAIModelManifest.PermissionReview {
    private enum CodingKeys: String, CodingKey, CaseIterable { case state, evidenceReference, reviewer, reviewedAt }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(state: try c.decode(LocalAIModelManifest.PermissionState.self, forKey: .state),
                  evidenceReference: try c.decodeIfPresent(String.self, forKey: .evidenceReference),
                  reviewer: try c.decodeIfPresent(String.self, forKey: .reviewer),
                  reviewedAt: try c.decodeIfPresent(Date.self, forKey: .reviewedAt))
        try validate("permissionReview")
    }
}

extension LocalAIModelManifest.License {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case identifier, sourceURL, licenseTextReference, noticeReference, commercialUse, redistribution
    }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(identifier: try c.decode(String.self, forKey: .identifier), sourceURL: try c.decode(URL.self, forKey: .sourceURL),
                  licenseTextReference: try c.decode(String.self, forKey: .licenseTextReference),
                  noticeReference: try c.decode(String.self, forKey: .noticeReference),
                  commercialUse: try c.decode(LocalAIModelManifest.PermissionReview.self, forKey: .commercialUse),
                  redistribution: try c.decode(LocalAIModelManifest.PermissionReview.self, forKey: .redistribution))
    }
}

extension LocalAIModelManifest.Tensor {
    private enum CodingKeys: String, CodingKey, CaseIterable { case name, elementType, shape, axes }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(name: try c.decode(String.self, forKey: .name), elementType: try c.decode(ElementType.self, forKey: .elementType),
                  shape: try c.decode([Int].self, forKey: .shape), axes: try c.decode([String].self, forKey: .axes))
        try validate()
    }
}

extension LocalAIModelManifest.ImageInput {
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case colorOrder, resize, preprocessingVersion, preprocessingReference, scale, mean, standardDeviation
    }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(colorOrder: try c.decode(ColorOrder.self, forKey: .colorOrder), resize: try c.decode(Resize.self, forKey: .resize),
                  preprocessingVersion: try c.decode(String.self, forKey: .preprocessingVersion),
                  preprocessingReference: try c.decode(String.self, forKey: .preprocessingReference),
                  scale: try c.decode(Double.self, forKey: .scale), mean: try c.decode([Double].self, forKey: .mean),
                  standardDeviation: try c.decode([Double].self, forKey: .standardDeviation))
    }
}
