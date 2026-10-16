import Foundation

/// Runtime-only, explicitly selected local retouch. Not a persisted Recipe,
/// automatic skin/scar detector, original-space mask or generative repair.
public struct LocalRetouchRequest: Equatable, Sendable {
    public enum Effect: Equatable, Sendable {
        case skinSmoothing(strength: Double, radiusPixels: Double)
        /// Samples the SAME input image at destination + offset. Offsets use
        /// upright input pixels, x rightward/y upward; no wrapping or edge clamp.
        case localRepair(strength: Double, sourceOffsetX: Int, sourceOffsetY: Int)
    }
    public let assetID: UUID
    public let originalSHA256: String
    public let analysisSHA256: String
    public let analysisVersion: String
    public let inputWidth: Int
    public let inputHeight: Int
    /// Tightly packed one byte per pixel, rows bottom-to-top. 0 excludes and
    /// 255 fully selects the destination. Fractional coverage is retained.
    public let maskL8BottomUp: Data
    /// Same dimensions/layout. 255 fully protects a pixel; renderer preserves
    /// destination alpha and excludes protected donor pixels from local repair.
    public let protectionMaskL8BottomUp: Data?
    public let effect: Effect
    public var maskRowBytes: Int { inputWidth }
    public static let maximumDimension = 1600
    public static let maximumMaskBytes = 2_560_000

    public init(assetID: UUID, originalSHA256: String, analysisSHA256: String,
                analysisVersion: String, inputWidth: Int, inputHeight: Int,
                maskL8BottomUp: Data, protectionMaskL8BottomUp: Data? = nil, effect: Effect) throws {
        self.assetID = assetID
        self.originalSHA256 = originalSHA256.lowercased()
        self.analysisSHA256 = analysisSHA256.lowercased()
        self.analysisVersion = analysisVersion
        self.inputWidth = inputWidth; self.inputHeight = inputHeight
        self.maskL8BottomUp = maskL8BottomUp
        self.protectionMaskL8BottomUp = protectionMaskL8BottomUp; self.effect = effect
        try validate()
    }

    public func validate() throws {
        guard isSHA256(originalSHA256), isSHA256(analysisSHA256),
              !analysisVersion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              analysisVersion.utf8.count <= 512,
              (1...Self.maximumDimension).contains(inputWidth),
              (1...Self.maximumDimension).contains(inputHeight),
              maskL8BottomUp.count <= Self.maximumMaskBytes,
              maskL8BottomUp.count == inputWidth * inputHeight else {
            throw SuiteValidationError.invalidValue("localRetouchBindingOrMask")
        }
        if let protectionMaskL8BottomUp {
            guard protectionMaskL8BottomUp.count == maskL8BottomUp.count else {
                throw SuiteValidationError.invalidValue("localRetouchProtectionMask")
            }
        }
        let dx: Int, dy: Int
        switch effect {
        case let .skinSmoothing(strength, radius):
            guard strength.isFinite, (0...1).contains(strength),
                  radius.isFinite, radius > 0, radius <= 32 else {
                throw SuiteValidationError.invalidValue("localRetouchSmoothing")
            }
            dx = 0; dy = 0
        case let .localRepair(strength, x, y):
            guard strength.isFinite, (0...1).contains(strength),
                  x > -inputWidth, x < inputWidth, y > -inputHeight, y < inputHeight,
                  x != 0 || y != 0 else {
                throw SuiteValidationError.invalidValue("localRetouchDonorOffset")
            }
            dx = x; dy = y
        }
        var hasSelection = false
        for (index, coverage) in maskL8BottomUp.enumerated() {
            if index.isMultiple(of: 4096) { try Task.checkCancellation() }
            guard coverage != 0 else { continue }
            hasSelection = true
            let sourceX = index % inputWidth + dx
            let sourceY = index / inputWidth + dy
            guard (0..<inputWidth).contains(sourceX), (0..<inputHeight).contains(sourceY) else {
                throw SuiteValidationError.invalidValue("localRetouchDonorOutsideImage")
            }
        }
        guard hasSelection else { throw SuiteValidationError.invalidValue("localRetouchEmptyMask") }
    }

    /// The renderer must also recreate analysis pixels from its reference image;
    /// this binding check alone is not proof of pixel identity.
    public func validate(asset: AssetRecord, analysisSHA256: String, analysisVersion: String,
                         inputWidth: Int, inputHeight: Int) throws {
        try validate(); try asset.validate()
        guard assetID == asset.id, originalSHA256 == asset.sha256.lowercased(),
              self.analysisSHA256 == analysisSHA256.lowercased(),
              self.analysisVersion == analysisVersion,
              self.inputWidth == inputWidth, self.inputHeight == inputHeight else {
            throw SuiteValidationError.invalidValue("localRetouchStaleInput")
        }
    }
}
