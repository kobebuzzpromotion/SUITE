import Foundation

/// Runtime planning only. Capability admission is not evidence of rendered or saved pixels.
public struct SessionLookPartialApplication: Equatable, Sendable {
    public enum Effect: Hashable, Sendable, Codable {
        case globalColor, texture, outputIntent
        case person(UUID, RetouchControl)
        case personalColor(UUID)
        private enum Keys: String, CodingKey { case kind, personID, control }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: ["kind", "personID", "control"])
            let c = try decoder.container(keyedBy: Keys.self)
            switch try c.decode(String.self, forKey: .kind) {
            case "globalColor": self = .globalColor
            case "texture": self = .texture
            case "outputIntent": self = .outputIntent
            case "person": self = .person(try c.decode(UUID.self, forKey: .personID), try c.decode(RetouchControl.self, forKey: .control))
            case "personalColor": self = .personalColor(try c.decode(UUID.self, forKey: .personID))
            default: throw SuiteValidationError.invalidValue("partialEffect")
            }
            switch self {
            case .person: break
            case .personalColor:
                guard !c.contains(.control) else { throw SuiteValidationError.invalidValue("partialEffect") }
            default:
                guard !c.contains(.personID), !c.contains(.control) else { throw SuiteValidationError.invalidValue("partialEffect") }
            }
        }
        public func encode(to encoder: any Encoder) throws {
            var c = encoder.container(keyedBy: Keys.self)
            switch self {
            case .globalColor: try c.encode("globalColor", forKey: .kind)
            case .texture: try c.encode("texture", forKey: .kind)
            case .outputIntent: try c.encode("outputIntent", forKey: .kind)
            case let .person(id, control):
                try c.encode("person", forKey: .kind); try c.encode(id, forKey: .personID); try c.encode(control, forKey: .control)
            case let .personalColor(id): try c.encode("personalColor", forKey: .kind); try c.encode(id, forKey: .personID)
            }
        }
    }
    public struct Part: Equatable, Sendable {
        public let effect: Effect
        /// Scoped adapter input; original immutable look is retained by the enclosing plan.
        public let plan: SessionLookApplicationPlan
        public let state: LookPlanState
    }
    public let binding: SessionImageBinding
    public let lookSnapshot: SessionLook
    public let parts: [Part]
    public var ready: [Part] { parts.filter { $0.state == .readyForAdapter } }
    public var pending: [Part] { parts.filter { $0.state == .requiresAnalysis } }
    public var unsupported: [Part] { parts.filter { $0.state == .notSupported } }
    public var isRendered: Bool { false }
}

extension TetherSessionState {
    /// Each adapter must explicitly admit its implemented controls. A broad adaptiveFace
    /// capability alone does not imply support for every face correction.
    public func partialApplicationPlan(for binding: SessionImageBinding,
                                       capabilities: Set<LookAdapterCapability> = [],
                                       supportedControls: Set<RetouchControl> = [],
                                       analysis: PhotoAnalysisEvidence? = nil,
                                       correctionEvidence: [PersonCorrectionAnalysisEvidence] = []) throws -> SessionLookPartialApplication {
        let full = try applicationPlan(for: binding, capabilities: capabilities, analysis: analysis,
                                       correctionEvidence: correctionEvidence)
        let look = full.lookSnapshot
        if case .skipped = full.state {
            return SessionLookPartialApplication(binding: binding, lookSnapshot: look, parts: [])
        }
        var parts: [SessionLookPartialApplication.Part] = []
        func append(_ effect: SessionLookPartialApplication.Effect,
                    global: [GlobalColorIntent] = [], people: [PersonLookIntent] = [],
                    personal: PersonalColorIntent? = nil, texture: [String: RecipeValue] = [:],
                    output: [String: RecipeValue] = [:], admitted: Bool = true) throws {
            let scoped = try SessionLook(id: look.id, revision: look.revision,
                referenceAssetID: look.referenceAssetID, referenceRecipeRevision: look.referenceRecipeRevision,
                mode: look.mode, globalColor: global, people: people, personalColor: personal,
                textureIntent: texture, outputIntent: output)
            let plan = try scopedApplicationPlan(for: binding, capabilities: capabilities, analysis: analysis,
                                                  correctionEvidence: correctionEvidence, scope: scoped)
            parts.append(.init(effect: effect, plan: plan, state: admitted ? plan.state : .notSupported))
        }
        if full.globalColorEnabled { try append(.globalColor, global: look.globalColor) }
        if !look.textureIntent.isEmpty { try append(.texture, texture: look.textureIntent) }
        if !look.outputIntent.isEmpty { try append(.outputIntent, output: look.outputIntent) }
        for person in full.people {
            for setting in person.settings {
                try append(.person(person.personID, setting.control),
                    people: [.init(personID: person.personID, settings: [setting])],
                    admitted: supportedControls.contains(setting.control))
            }
        }
        if let personal = look.personalColor {
            for id in full.personalColorTargetIDs.sorted(by: { $0.uuidString < $1.uuidString }) {
                try append(.personalColor(id), personal: PersonalColorIntent(direction: personal.direction,
                    selectionOrigin: personal.selectionOrigin, targetPersonIDs: [id], adjustments: personal.adjustments))
            }
        }
        return SessionLookPartialApplication(binding: binding, lookSnapshot: look, parts: parts)
    }
}

/// In-memory receipt contract, not a durable commit store or a rendering adapter.
/// Caller must atomically persist the real checkpoint with its receipt before reporting success.
/// Never evict receipts while a binding can be retried: reaching capacity rejects new records.
public struct SessionLookPartialReceiptLedger: Sendable {
    public struct Receipt: Equatable, Sendable, Codable {
        public let id: UUID
        public let binding: SessionImageBinding
        public let lookSnapshot: SessionLook
        public let effect: SessionLookPartialApplication.Effect
        public let inputRevision: Int
        public let outputRevision: Int
        public let input: RecipeParameters
        public let output: RecipeParameters
        public let adapterVersion: String
        public init(id: UUID, part: SessionLookPartialApplication.Part,
                    application: SessionLookPartialApplication, inputRevision: Int, outputRevision: Int,
                    input: RecipeParameters, output: RecipeParameters, adapterVersion: String) throws {
            guard application.parts.contains(part), part.state == .readyForAdapter,
                  part.plan.state == .readyForAdapter, part.plan.binding == application.binding,
                  inputRevision >= application.binding.inputRecipeRevision,
                  inputRevision < 9_007_199_254_740_991, outputRevision == inputRevision + 1,
                  !adapterVersion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  adapterVersion.utf8.count <= 256 else {
                throw SuiteValidationError.invalidValue("partialLookReceipt")
            }
            try application.lookSnapshot.validate()
            try input.validate(); try output.validate()
            self.id = id; binding = application.binding; lookSnapshot = application.lookSnapshot
            effect = part.effect; self.inputRevision = inputRevision; self.outputRevision = outputRevision
            self.input = input; self.output = output; self.adapterVersion = adapterVersion
            try validate()
        }
        public func validate() throws {
            try lookSnapshot.validate(); try input.validate(); try output.validate()
            guard binding.lookID == lookSnapshot.id, binding.lookRevision == lookSnapshot.revision,
                  isSHA256(binding.originalSHA256), binding.inputRecipeRevision >= 0,
                  inputRevision >= binding.inputRecipeRevision, inputRevision < 9_007_199_254_740_991,
                  outputRevision == inputRevision + 1,
                  !adapterVersion.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                  adapterVersion.utf8.count <= 256 else { throw SuiteValidationError.invalidValue("partialReceipt") }
            switch effect {
            case .globalColor: guard binding.controls.globalColor, !lookSnapshot.globalColor.isEmpty else { throw SuiteValidationError.invalidValue("partialEffect") }
            case .texture: guard !lookSnapshot.textureIntent.isEmpty else { throw SuiteValidationError.invalidValue("partialEffect") }
            case .outputIntent: guard !lookSnapshot.outputIntent.isEmpty else { throw SuiteValidationError.invalidValue("partialEffect") }
            case let .person(id, control):
                guard binding.controls.permits(control.category), lookSnapshot.people.contains(where: {
                    $0.personID == id && $0.settings.contains(where: { $0.control == control && $0.strength.level != .off })
                }) else { throw SuiteValidationError.invalidValue("partialEffect") }
            case let .personalColor(id): guard binding.controls.personalColor, lookSnapshot.personalColor?.targetPersonIDs.contains(id) == true else { throw SuiteValidationError.invalidValue("partialEffect") }
            }
        }
        private enum CodingKeys: String, CodingKey, CaseIterable {
            case id, binding, lookSnapshot, effect, inputRevision, outputRevision, input, output, adapterVersion
        }
        public init(from decoder: any Decoder) throws {
            try rejectUnknownFields(decoder, allowed: Set(CodingKeys.allCases.map(\.rawValue)))
            let c = try decoder.container(keyedBy: CodingKeys.self)
            id = try c.decode(UUID.self, forKey: .id); binding = try c.decode(SessionImageBinding.self, forKey: .binding)
            lookSnapshot = try c.decode(SessionLook.self, forKey: .lookSnapshot)
            effect = try c.decode(SessionLookPartialApplication.Effect.self, forKey: .effect)
            inputRevision = try c.decode(Int.self, forKey: .inputRevision); outputRevision = try c.decode(Int.self, forKey: .outputRevision)
            input = try c.decode(RecipeParameters.self, forKey: .input); output = try c.decode(RecipeParameters.self, forKey: .output)
            adapterVersion = try c.decode(String.self, forKey: .adapterVersion)
            try validate()
        }
        public func encode(to encoder: any Encoder) throws {
            try validate()
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(id, forKey: .id); try c.encode(binding, forKey: .binding); try c.encode(lookSnapshot, forKey: .lookSnapshot)
            try c.encode(effect, forKey: .effect); try c.encode(inputRevision, forKey: .inputRevision); try c.encode(outputRevision, forKey: .outputRevision)
            try c.encode(input, forKey: .input); try c.encode(output, forKey: .output); try c.encode(adapterVersion, forKey: .adapterVersion)
        }
    }
    public private(set) var receipts: [Receipt] = []
    public init() {}
    /// Returns false for an exact replay. Any conflicting body or duplicate effect rejects.
    @discardableResult public mutating func record(_ receipt: Receipt) throws -> Bool {
        try receipt.validate()
        if let existing = receipts.first(where: { $0.id == receipt.id }) {
            guard existing == receipt else { throw SuiteValidationError.invalidValue("partialReceiptIDConflict") }
            return false
        }
        guard receipts.count < 256 else { throw SuiteValidationError.invalidValue("partialReceiptCapacity") }
        let sameBinding = receipts.filter { $0.binding.id == receipt.binding.id }
        guard sameBinding.allSatisfy({ $0.binding == receipt.binding && $0.lookSnapshot == receipt.lookSnapshot
            && $0.effect != receipt.effect }) else { throw SuiteValidationError.invalidValue("partialReceiptBindingConflict") }
        if let last = sameBinding.last {
            guard receipt.inputRevision == last.outputRevision, receipt.input == last.output else {
                throw SuiteValidationError.invalidValue("partialReceiptChainConflict")
            }
        }
        receipts.append(receipt)
        return true
    }
}
