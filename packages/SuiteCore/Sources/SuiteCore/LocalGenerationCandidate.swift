import Foundation

/// Unattested external background output. This document proves neither payment,
/// provider execution nor rights. Subject/protection masks are fixed provenance,
/// never permission to replace the original person with generated pixels.
public struct LocalGenerationCandidate: Codable, Equatable, Sendable {
    public let id: UUID
    public let assetID: UUID
    public let originalSHA256: String
    public let recipeRevision: Int
    public let provider: String
    public let model: String
    public let outputSHA256: String
    public let outputByteCount: Int
    public let outputWidth: Int
    public let outputHeight: Int
    public let subjectMask: LocalBackdropRecipe.MaskReference
    public let protectionMask: LocalBackdropRecipe.MaskReference
    public init(id: UUID, assetID: UUID, originalSHA256: String, recipeRevision: Int,
                provider: String, model: String, outputSHA256: String, outputByteCount: Int,
                outputWidth: Int, outputHeight: Int, subjectMask: LocalBackdropRecipe.MaskReference,
                protectionMask: LocalBackdropRecipe.MaskReference) throws {
        self.id = id; self.assetID = assetID; self.originalSHA256 = originalSHA256
        self.recipeRevision = recipeRevision; self.provider = provider; self.model = model
        self.outputSHA256 = outputSHA256; self.outputByteCount = outputByteCount
        self.outputWidth = outputWidth; self.outputHeight = outputHeight
        self.subjectMask = subjectMask; self.protectionMask = protectionMask
        try validate()
    }
    public func validate() throws {
        guard isSHA256(originalSHA256), originalSHA256 == originalSHA256.lowercased(),
              isSHA256(outputSHA256), outputSHA256 == outputSHA256.lowercased(), recipeRevision >= 1,
              !provider.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, provider.utf8.count <= 256,
              !model.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, model.utf8.count <= 256,
              (1...32 * 1024 * 1024).contains(outputByteCount),
              (1...32768).contains(outputWidth), (1...32768).contains(outputHeight),
              outputWidth * outputHeight <= 8_000_000 else { throw SuiteValidationError.invalidValue("generationCandidate") }
        try subjectMask.validate(); try protectionMask.validate()
        guard subjectMask.width == protectionMask.width, subjectMask.height == protectionMask.height else {
            throw SuiteValidationError.invalidValue("generationCandidateMaskFrame")
        }
    }
    public func validateBinding(assetID: UUID, originalSHA256: String, recipeRevision: Int) throws {
        try validate()
        guard self.assetID == assetID, self.originalSHA256 == originalSHA256.lowercased(),
              self.recipeRevision == recipeRevision else { throw SuiteValidationError.invalidValue("generationCandidateStaleInput") }
    }
    private enum CodingKeys: String, CodingKey, CaseIterable {
        case id,assetID,originalSHA256,recipeRevision,provider,model,outputSHA256,outputByteCount,outputWidth,outputHeight,subjectMask,protectionMask
    }
    public init(from decoder: any Decoder) throws {
        try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
        let c = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(id: c.decode(UUID.self, forKey: .id), assetID: c.decode(UUID.self, forKey: .assetID),
            originalSHA256: c.decode(String.self, forKey: .originalSHA256), recipeRevision: c.decode(Int.self, forKey: .recipeRevision),
            provider: c.decode(String.self, forKey: .provider), model: c.decode(String.self, forKey: .model),
            outputSHA256: c.decode(String.self, forKey: .outputSHA256), outputByteCount: c.decode(Int.self, forKey: .outputByteCount),
            outputWidth: c.decode(Int.self, forKey: .outputWidth), outputHeight: c.decode(Int.self, forKey: .outputHeight),
            subjectMask: c.decode(LocalBackdropRecipe.MaskReference.self, forKey: .subjectMask),
            protectionMask: c.decode(LocalBackdropRecipe.MaskReference.self, forKey: .protectionMask))
    }
}
