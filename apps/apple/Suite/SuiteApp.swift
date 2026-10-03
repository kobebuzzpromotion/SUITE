import SwiftUI
import UniformTypeIdentifiers
import UIKit

@main
@MainActor
struct SuiteApp: App {
    @StateObject private var model = EditorModel()
    var body: some Scene {
        WindowGroup {
            TabView {
                Group {
                    if UIDevice.current.userInterfaceIdiom == .pad {
                        IPadEditorView(model: model)
                    } else {
                        IPhoneEditorView(model: model)
                    }
                }
                .tabItem { Label("写真編集", systemImage: "slider.horizontal.3") }
                WorkspaceBrowser(client: nil)
                    .tabItem { Label("Workspace", systemImage: "person.3") }
            }
            .task { await model.load() }
            .fileImporter(isPresented: $model.showImporter, allowedContentTypes: [.image, .rawImage]) { result in
                switch result {
                case .success(let url): model.importFile(url)
                case .failure(let error): model.errorMessage = error.localizedDescription
                }
            }
            .sheet(isPresented: $model.showCropExport) { CropEditorSheet(model: model) }
            .sheet(isPresented: Binding(get: { model.shareURL != nil || !model.batchShareURLs.isEmpty }, set: {
                if !$0 { model.shareURL = nil; model.batchShareURLs = [] }
            })) {
                ExportShareSheet(urls: model.shareURL.map { [$0] } ?? model.batchShareURLs)
            }
        }
    }
}

private struct ExportShareSheet: UIViewControllerRepresentable {
    let urls: [URL]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: urls, applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
