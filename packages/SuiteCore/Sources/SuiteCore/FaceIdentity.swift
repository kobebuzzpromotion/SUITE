import Foundation

/// Pure, local comparison of an explicitly supplied gallery. This is not a model
/// runtime, enrollment consent, encrypted store, or permission to apply a retouch.
public enum FaceIdentity {
    public enum IdentityError: Error, Equatable, Sendable {
        case unsupportedSchema(Int)
        case invalidField(String)
        case incompatibleEmbedding
        case duplicatePhotoFace
        case mixedPhotos
    }

    /// Cross-photo identity, assigned by the enrollment owner; never an inferred name.
    public struct PersonID: Hashable, Sendable {
        public let value: UUID
        public init(_ value: UUID) { self.value = value }
    }

    /// A detected target belongs to one immutable original, not to a person.
    public struct PhotoFaceID: Hashable, Sendable {
        public let assetID: UUID
        public let originalSHA256: String
        public let faceTargetID: UUID

        public init(assetID: UUID, originalSHA256: String, faceTargetID: UUID) throws {
            guard validDigest(originalSHA256) else { throw IdentityError.invalidField("originalSHA256") }
            self.assetID = assetID; self.originalSHA256 = originalSHA256.lowercased()
            self.faceTargetID = faceTargetID
        }
    }

    /// Serialized vectors remain sensitive biometric data. Codable does not
    /// authorize persistence or sync; those require a separate consent/store layer.
    public struct Embedding: Codable, Equatable, Sendable {
        public let schemaVersion: Int
        public let modelSHA256: String
        public let preprocessingVersion: String
        public let dimension: Int
        public let values: [Float]

        public init(modelSHA256: String, preprocessingVersion: String, rawValues: [Float]) throws {
            guard validDigest(modelSHA256), validText(preprocessingVersion),
                  (16...4096).contains(rawValues.count), rawValues.allSatisfy({ $0.isFinite }) else {
                throw IdentityError.invalidField("embedding")
            }
            let normSquared = rawValues.reduce(0.0) { $0 + Double($1) * Double($1) }
            guard normSquared.isFinite, normSquared >= 1e-12 else {
                throw IdentityError.invalidField("embedding.zeroNorm")
            }
            let norm = normSquared.squareRoot()
            self.schemaVersion = 1
            self.modelSHA256 = modelSHA256.lowercased()
            self.preprocessingVersion = preprocessingVersion
            self.dimension = rawValues.count
            self.values = rawValues.map { Float(Double($0) / norm) }
            try validate()
        }

        public func validate() throws {
            guard schemaVersion == 1 else { throw IdentityError.unsupportedSchema(schemaVersion) }
            guard validDigest(modelSHA256), modelSHA256 == modelSHA256.lowercased(),
                  validText(preprocessingVersion), (16...4096).contains(dimension),
                  values.count == dimension, values.allSatisfy({ $0.isFinite }) else {
                throw IdentityError.invalidField("embedding")
            }
            let normSquared = values.reduce(0.0) { $0 + Double($1) * Double($1) }
            guard abs(normSquared - 1) <= 1e-5 else {
                throw IdentityError.invalidField("embedding.notNormalized")
            }
        }

        private enum CodingKeys: String, CodingKey {
            case schemaVersion, modelSHA256, preprocessingVersion, dimension, values
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
            guard schemaVersion == 1 else { throw IdentityError.unsupportedSchema(schemaVersion) }
            modelSHA256 = try c.decode(String.self, forKey: .modelSHA256)
            preprocessingVersion = try c.decode(String.self, forKey: .preprocessingVersion)
            dimension = try c.decode(Int.self, forKey: .dimension)
            guard (16...4096).contains(dimension) else { throw IdentityError.invalidField("dimension") }
            // Decode with a bound rather than allocating an unbounded input array.
            var list = try c.nestedUnkeyedContainer(forKey: .values)
            var vector: [Float] = []
            while !list.isAtEnd {
                guard vector.count < dimension else { throw IdentityError.invalidField("dimension") }
                vector.append(try list.decode(Float.self))
            }
            values = vector
            try validate()
        }
    }

    /// No default threshold is presented as calibrated for SUITE. The caller
    /// must bind explicit values to the same model and preprocessing contract.
    public struct Policy: Codable, Equatable, Sendable {
        public let schemaVersion: Int
        public let revision: String
        public let modelSHA256: String
        public let preprocessingVersion: String
        public let dimension: Int
        public let threshold: Double
        public let margin: Double

        public init(revision: String, modelSHA256: String, preprocessingVersion: String,
                    dimension: Int, threshold: Double, margin: Double) throws {
            self.schemaVersion = 1; self.revision = revision
            self.modelSHA256 = modelSHA256.lowercased()
            self.preprocessingVersion = preprocessingVersion; self.dimension = dimension
            self.threshold = threshold; self.margin = margin
            try validate()
        }

        public func validate() throws {
            guard schemaVersion == 1 else { throw IdentityError.unsupportedSchema(schemaVersion) }
            guard validText(revision), validDigest(modelSHA256), modelSHA256 == modelSHA256.lowercased(),
                  validText(preprocessingVersion), (16...4096).contains(dimension),
                  threshold.isFinite, (0...1).contains(threshold),
                  margin.isFinite, (0...1).contains(margin) else {
                throw IdentityError.invalidField("policy")
            }
        }

        private enum CodingKeys: String, CodingKey {
            case schemaVersion, revision, modelSHA256, preprocessingVersion, dimension, threshold, margin
        }

        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            schemaVersion = try c.decode(Int.self, forKey: .schemaVersion)
            guard schemaVersion == 1 else { throw IdentityError.unsupportedSchema(schemaVersion) }
            revision = try c.decode(String.self, forKey: .revision)
            modelSHA256 = try c.decode(String.self, forKey: .modelSHA256)
            preprocessingVersion = try c.decode(String.self, forKey: .preprocessingVersion)
            dimension = try c.decode(Int.self, forKey: .dimension)
            threshold = try c.decode(Double.self, forKey: .threshold)
            margin = try c.decode(Double.self, forKey: .margin)
            try validate()
        }
    }

    public struct GalleryEntry: Sendable {
        public let personID: PersonID
        public let embedding: Embedding
        public init(personID: PersonID, embedding: Embedding) {
            self.personID = personID; self.embedding = embedding
        }
    }

    public struct Observation: Sendable {
        public let target: PhotoFaceID
        public let embedding: Embedding
        public init(target: PhotoFaceID, embedding: Embedding) {
            self.target = target; self.embedding = embedding
        }
    }

    public struct Candidate: Equatable, Sendable {
        public let personID: PersonID
        public let cosine: Double
    }

    public enum Ambiguity: Equatable, Sendable {
        case insufficientMargin
        case competingFaces
    }

    public enum Decision: Equatable, Sendable {
        case matched(PersonID)
        case ambiguous(Ambiguity)
        case unknown
    }

    /// Candidate scores are diagnostics, never an automatic person assignment.
    /// Only .matched may supply a PersonID, after the photo-wide conflict pass.
    public struct Match: Equatable, Sendable {
        public let target: PhotoFaceID
        public let policyRevision: String
        public let decision: Decision
        public let best: Candidate?
        public let runnerUp: Candidate?
        public let gap: Double?
    }

    /// Port of astra-face-recognition's max-per-person cosine and margin rule.
    /// An empty gallery means unknown. Incompatible contracts fail the whole
    /// operation instead of quietly excluding a competing person's template.
    public static func matchPhoto(_ observations: [Observation], gallery: [GalleryEntry],
                                  policy: Policy) throws -> [Match] {
        try policy.validate()
        guard observations.count <= 512, gallery.count <= 10_000 else {
            throw IdentityError.invalidField("comparison.capacity")
        }
        var seen = Set<PhotoFaceID>()
        for observation in observations {
            guard seen.insert(observation.target).inserted else { throw IdentityError.duplicatePhotoFace }
            if let first = observations.first {
                guard observation.target.assetID == first.target.assetID,
                      observation.target.originalSHA256 == first.target.originalSHA256 else {
                    throw IdentityError.mixedPhotos
                }
            }
            try compatible(observation.embedding, policy)
        }
        for entry in gallery { try compatible(entry.embedding, policy) }

        var results: [Match] = []
        var contenders: [PersonID: Set<PhotoFaceID>] = [:]
        for observation in observations {
            try Task.checkCancellation()
            var scores: [PersonID: Double] = [:]
            for entry in gallery {
                try Task.checkCancellation()
                var dot = 0.0, aa = 0.0, bb = 0.0
                for (a, b) in zip(observation.embedding.values, entry.embedding.values) {
                    let av = Double(a), bv = Double(b)
                    dot += av * bv; aa += av * av; bb += bv * bv
                }
                let score = max(-1, min(1, dot / (aa * bb).squareRoot()))
                scores[entry.personID] = max(scores[entry.personID] ?? -1, score)
            }
            let ranked = scores.map { Candidate(personID: $0.key, cosine: $0.value) }
                .sorted { a, b in
                    a.cosine == b.cosine ? a.personID.value.uuidString < b.personID.value.uuidString : a.cosine > b.cosine
                }
            for candidate in ranked where candidate.cosine >= policy.threshold {
                contenders[candidate.personID, default: []].insert(observation.target)
            }
            let best = ranked.first
            let runnerUp = ranked.count > 1 ? ranked[1] : nil
            let gap = best.map { $0.cosine - (runnerUp?.cosine ?? -1) }
            let decision: Decision
            if let best, let gap, best.cosine >= policy.threshold {
                // Even an explicit zero margin must not resolve an exact tie by UUID.
                decision = (gap >= policy.margin && (runnerUp == nil || gap > 0))
                    ? .matched(best.personID) : .ambiguous(.insufficientMargin)
            } else { decision = .unknown }
            results.append(Match(target: observation.target, policyRevision: policy.revision,
                                 decision: decision, best: best, runnerUp: runnerUp, gap: gap))
        }

        // Include ambiguous contenders: a narrow-gap face must not allow another
        // face to claim the same person automatically. Never choose a winner by order.
        return results.map { result in
            guard case let .matched(personID) = result.decision,
                  (contenders[personID]?.count ?? 0) > 1 else { return result }
            return Match(target: result.target, policyRevision: result.policyRevision,
                         decision: .ambiguous(.competingFaces), best: result.best,
                         runnerUp: result.runnerUp, gap: result.gap)
        }
    }

    private static func compatible(_ embedding: Embedding, _ policy: Policy) throws {
        try embedding.validate()
        guard embedding.modelSHA256 == policy.modelSHA256,
              embedding.preprocessingVersion == policy.preprocessingVersion,
              embedding.dimension == policy.dimension else { throw IdentityError.incompatibleEmbedding }
    }

    private static func validDigest(_ value: String) -> Bool {
        value.utf8.count == 64 && value.utf8.allSatisfy {
            (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0)
        }
    }

    private static func validText(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && value.utf8.count <= 256
    }
}
