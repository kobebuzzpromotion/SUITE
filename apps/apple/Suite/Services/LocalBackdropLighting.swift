import Foundation

/// Trial-only explicit backdrop lighting. No automatic original-shadow extraction.
struct LocalBackdropLighting: Sendable {
    enum Shadow: Sendable {
        case none
        /// Input canvas pixels, x right/y up. Generated only from supplied matte.
        case addDrop(offsetX: Double, offsetY: Double, blurRadius: Double, opacity: Double)
        case explicitMask(mask: LocalBackdropCompositeRenderer.Matte, opacity: Double)
    }
    let backgroundEV: Double
    let shadow: Shadow
    static let none = LocalBackdropLighting()
    private init() { backgroundEV = 0; shadow = .none }
    init(backgroundEV: Double, shadow: Shadow) throws {
        self.backgroundEV = backgroundEV; self.shadow = shadow
        try validate()
    }
    func validate() throws {
        guard backgroundEV.isFinite, (-5...5).contains(backgroundEV) else { throw LocalBackdropCompositeRenderer.Failure.invalidInput }
        switch shadow {
        case .none: break
        case .addDrop(let x, let y, let blur, let opacity):
            guard [x,y,blur,opacity].allSatisfy(\.isFinite), abs(x) <= 32768, abs(y) <= 32768,
                  (0...128).contains(blur), (0...1).contains(opacity) else { throw LocalBackdropCompositeRenderer.Failure.invalidInput }
        case .explicitMask(_, let opacity):
            guard opacity.isFinite, (0...1).contains(opacity) else { throw LocalBackdropCompositeRenderer.Failure.invalidInput }
        }
    }
}
