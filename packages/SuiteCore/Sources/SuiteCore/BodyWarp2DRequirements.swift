import Foundation

/// Approved 2D body editing: current-photo explicit region + signed operations
/// and real person-mask protection. This is NOT physical scale or distance evidence.
public enum BodyWarp2DRequirements {
    public static let version = "suite-explicit-person-body-2d-v1"
    public static func validate(control: RetouchControl, region: LocalRetouchRecipe.Rectangle,
                                operations: [LocalWarpRecipe.Operation]) throws {
        guard control.category == .body, (1...128).contains(operations.count) else {
            throw SuiteValidationError.invalidValue("bodyWarp2DControl")
        }
        try region.validate()
        for operation in operations {
            try Task.checkCancellation(); _ = try operation.runtimeOperation()
            guard operation.center.x-operation.rx >= 0, operation.center.y-operation.ry >= 0,
                  operation.center.x+operation.rx <= 1, operation.center.y+operation.ry <= 1 else {
                throw SuiteValidationError.invalidValue("bodyWarp2DRelativeSupport")
            }
        }
    }
}
