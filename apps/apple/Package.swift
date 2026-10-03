// swift-tools-version: 6.0
import PackageDescription

// macOS executable is a QA adapter only, NOT a new Mac product or Web release work.
let package = Package(
    name: "SuiteRawQA",
    platforms: [.macOS(.v14)],
    products: [.executable(name: "SuiteRawQAAdapter", targets: ["SuiteRawQAAdapter"])],
    dependencies: [.package(path: "../../packages/SuiteCore")],
    targets: [.executableTarget(name: "SuiteRawQAAdapter", dependencies: ["SuiteCore"], path: ".",
        exclude: ["Tests", "project.yml", "Suite/Features", "Suite/Shared", "Suite/Info.plist", "Suite/SuiteApp.swift", "Suite/EditorModel.swift", "Suite/Services/SuiteBackendClient.swift", "Suite/Services/CloudTransferCoordinator.swift"],
        sources: ["Suite/Services/PhotoPipeline.swift", "Suite/Services/PortraitPipeline.swift", "QA/RawQAAdapter.swift"])]
)
