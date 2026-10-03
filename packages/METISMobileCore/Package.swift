// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "METISMobileCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "METISMobileCore", targets: ["METISMobileCore"])],
    targets: [
        .target(name: "METISMobileCore"),
        .testTarget(name: "METISMobileCoreTests", dependencies: ["METISMobileCore"])
    ]
)
