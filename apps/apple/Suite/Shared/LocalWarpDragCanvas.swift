import SwiftUI
import UIKit

/// One explicit stroke on the upright reference only. Reports normalized
/// top-left endpoints; does not preview, mutate an operation list or save.
@MainActor
struct LocalWarpDragCanvas: View {
    let image: UIImage
    let enabled: Bool
    let onDrag: (Double, Double, Double, Double) -> Void

    @State private var strokeImage: ObjectIdentifier?
    @State private var strokeBounds: CGRect?
    @State private var rejected = false
    @GestureState private var dragging = false

    var body: some View {
        GeometryReader { geometry in
            if image.imageOrientation == .up, let cgImage = image.cgImage {
                let bounds = fittedRect(width: cgImage.width, height: cgImage.height, in: geometry.size)
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .contentShape(Rectangle())
                    .gesture(DragGesture(minimumDistance: 3, coordinateSpace: .local)
                        .updating($dragging) { _, state, _ in state = true }
                        .onChanged { value in
                            guard enabled, !rejected else { rejected = true; return }
                            if strokeImage == nil {
                                guard contains(value.startLocation, in: bounds) else {
                                    rejected = true; return
                                }
                                strokeImage = ObjectIdentifier(image)
                                strokeBounds = bounds
                            }
                            if strokeImage != ObjectIdentifier(image) || strokeBounds != bounds {
                                rejected = true
                            }
                        }
                        .onEnded { value in
                            defer { reset() }
                            guard enabled, !rejected,
                                  strokeImage == ObjectIdentifier(image), strokeBounds == bounds,
                                  contains(value.startLocation, in: bounds),
                                  contains(value.location, in: bounds) else { return }
                            onDrag(Double((value.startLocation.x - bounds.minX) / bounds.width),
                                   Double((value.startLocation.y - bounds.minY) / bounds.height),
                                   Double((value.location.x - bounds.minX) / bounds.width),
                                   Double((value.location.y - bounds.minY) / bounds.height))
                        })
            } else {
                Text("向きを正規化した参照画像が必要です。")
                    .foregroundStyle(.secondary)
            }
        }
        .onChange(of: ObjectIdentifier(image)) { _, _ in
            // Preserve rejection until this gesture ends; never let a stroke
            // begun on a different photo become valid on the replacement.
            strokeImage = nil; strokeBounds = nil; rejected = dragging
        }
        .onChange(of: enabled) { _, active in
            if !active { strokeImage = nil; strokeBounds = nil; rejected = dragging }
        }
        .onChange(of: dragging) { _, active in
            if !active { reset() } // Includes system cancellation (no onEnded).
        }
        .onDisappear { reset() }
        .accessibilityLabel("元写真の手動変形ドラッグ入力")
    }

    private func fittedRect(width: Int, height: Int, in size: CGSize) -> CGRect {
        guard width > 0, height > 0, size.width.isFinite, size.height.isFinite,
              size.width > 0, size.height > 0 else { return .zero }
        let scale = min(size.width / CGFloat(width), size.height / CGFloat(height))
        let fitted = CGSize(width: CGFloat(width) * scale, height: CGFloat(height) * scale)
        return CGRect(x: (size.width - fitted.width) / 2, y: (size.height - fitted.height) / 2,
                      width: fitted.width, height: fitted.height)
    }

    private func contains(_ point: CGPoint, in rect: CGRect) -> Bool {
        rect.width > 0 && rect.height > 0 && point.x.isFinite && point.y.isFinite
            && point.x >= rect.minX && point.x <= rect.maxX
            && point.y >= rect.minY && point.y <= rect.maxY
    }

    private func reset() {
        strokeImage = nil; strokeBounds = nil; rejected = false
    }
}
