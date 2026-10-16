import Foundation
import SuiteCore

/// User-selected image regions, not anatomical detection or ideal-body inference.
/// Left/right are independent labels: this adapter never mirrors an operation.
enum LocalManualPartWarpAdapter {
    enum Part: String, CaseIterable, Identifiable {
        case nose = "鼻", leftEye = "左目", rightEye = "右目", torso = "胴", leftChest = "左胸", rightChest = "右胸"
        var id: String { rawValue }
        var isBody: Bool { self == .torso || self == .leftChest || self == .rightChest }
    }
    enum Adjustment: String, CaseIterable, Identifiable {
        case size = "サイズ", width = "幅", height = "高さ", horizontal = "左右位置", vertical = "上下位置", angle = "角度", volume = "ボリューム（2D拡縮）"
        var id: String { rawValue }
    }
    static func adjustments(for part: Part) -> [Adjustment] {
        part.isBody ? [.width, .volume, .horizontal, .vertical] : [.size, .width, .height, .horizontal, .vertical, .angle]
    }
    static func operation(part: Part, adjustment: Adjustment, centerX: Double, centerY: Double,
                          radiusX: Double, radiusY: Double, strength: Double) throws -> LocalWarpFieldBuilder.Operation {
        guard adjustments(for: part).contains(adjustment), strength.isFinite, (-1...1).contains(strength) else {
            throw SuiteValidationError.invalidValue("manualPartWarp")
        }
        let kind: LocalWarpFieldBuilder.Kind
        switch adjustment {
        case .size, .volume: kind = .scale
        case .width: kind = .scaleX
        case .height: kind = .scaleY
        case .horizontal, .vertical: kind = .translate
        case .angle: kind = .rotate
        }
        return try .init(kind: kind, center: .init(x: centerX, y: centerY), rx: radiusX, ry: radiusY,
            amount: [.size, .volume, .width, .height].contains(adjustment) ? strength : 0,
            dx: adjustment == .horizontal ? strength : 0, dy: adjustment == .vertical ? strength : 0,
            angle: adjustment == .angle ? strength : 0)
    }
}
