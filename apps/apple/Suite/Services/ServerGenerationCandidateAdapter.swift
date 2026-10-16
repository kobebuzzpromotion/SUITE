import Foundation
import CryptoKit
import ImageIO
import UniformTypeIdentifiers
import SuiteCore

/// Background-only adoption. Provider pixels never replace the protected subject.
enum ServerGenerationCandidateAdapter {
    static func dimensions(_ png: Data) throws -> (Int, Int) {
        guard !png.isEmpty, png.count <= 32*1024*1024,
              let source = CGImageSourceCreateWithData(png as CFData, [kCGImageSourceShouldCache:false] as CFDictionary),
              CGImageSourceGetCount(source) == 1, let type = CGImageSourceGetType(source), type as String == UTType.png.identifier,
              let p = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString:Any],
              let w = p[kCGImagePropertyPixelWidth] as? Int, let h = p[kCGImagePropertyPixelHeight] as? Int,
              w > 0, h > 0, w <= 32768, h <= 32768, w <= 8_000_000/h,
              (p[kCGImagePropertyOrientation] as? Int ?? 1) == 1 else { throw ServerGenerationClient.Failure.invalid }
        return (w,h)
    }
    static func sha(_ bytes: Data) -> String { SHA256.hash(data: bytes).map { String(format:"%02x", $0) }.joined() }
    static func prepare(candidate: ServerGenerationClient.Candidate, remoteBinding: ServerGenerationClient.Binding,
                        sourcePNG: Data, assetID: UUID, originalSHA256: String, recipeRevision: Int,
                        subject: Data, protection: Data, licenseID: String, declaration: String,
                        store: LocalGenerationCandidateStore) async throws -> LocalGenerationCandidateStore.Handoff {
        try Task.checkCancellation()
        let job = candidate.job
        guard candidate.binding == remoteBinding, !remoteBinding.assetID.isEmpty,
              remoteBinding.originalSHA256 == originalSHA256, remoteBinding.recipeRevision == recipeRevision,
              job.state == "succeeded", job.quote.inputSHA256 == sha(sourcePNG),
              job.reservation.quoteID == job.quote.id, job.reservation.accountID == job.quote.accountID,
              job.reservation.requestSHA256 == job.quote.requestSHA256,
              let settlement = job.settlement, settlement.outcome == "succeeded",
              settlement.requestSHA256 == job.quote.requestSHA256,
              settlement.provider == job.quote.provider, settlement.model == job.quote.model,
              settlement.evidenceID == "output-" + candidate.sha256,
              settlement.providerJobID == job.providerJobID,
              let id = UUID(uuidString: job.reservation.id), sha(candidate.png) == candidate.sha256 else {
            throw ServerGenerationClient.Failure.invalid
        }
        let (w,h) = try dimensions(sourcePNG), (ow,oh) = try dimensions(candidate.png)
        guard subject.count == w*h, protection.count == w*h else { throw ServerGenerationClient.Failure.invalid }
        let s = [UInt8](subject), p = [UInt8](protection)
        var hasProtection = false
        for i in s.indices {
            if i.isMultiple(of:4096) { try Task.checkCancellation() }
            if p[i] != 0 { hasProtection = true; guard s[i] == 255 else { throw ServerGenerationClient.Failure.invalid } }
        }
        guard hasProtection else { throw ServerGenerationClient.Failure.invalid }
        let value = try LocalGenerationCandidate(id: id, assetID: assetID, originalSHA256: originalSHA256,
            recipeRevision: recipeRevision, provider: job.quote.provider, model: job.quote.model,
            outputSHA256: candidate.sha256, outputByteCount: candidate.png.count, outputWidth: ow, outputHeight: oh,
            subjectMask: .init(sha256: sha(subject), width:w, height:h, byteCount:subject.count),
            protectionMask: .init(sha256: sha(protection), width:w, height:h, byteCount:protection.count))
        let temporary = FileManager.default.temporaryDirectory.appendingPathComponent("suite-server-candidate-"+UUID().uuidString, isDirectory:true)
        try FileManager.default.createDirectory(at:temporary, withIntermediateDirectories:false, attributes:[.posixPermissions:0o700])
        defer { try? FileManager.default.removeItem(at:temporary) }
        let file = temporary.appendingPathComponent("background.png")
        try candidate.png.write(to:file, options:.withoutOverwriting)
        try await store.importCandidate(value, outputURL:file, subjectMask:subject, protectionMask:protection,
            licenseID:licenseID, licenseDeclaration:declaration, permission:.callerConfirmed, permissionConfirmed:true)
        return try await store.handoff(id:id, assetID:assetID, originalSHA256:originalSHA256,
                                      recipeRevision:recipeRevision, acceptanceConfirmed:true)
    }
}
