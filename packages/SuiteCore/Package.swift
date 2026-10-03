// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "SuiteCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "SuiteCore", targets: ["SuiteCore"])],
    dependencies: [.package(path: "../METISMobileCore")],
    targets: [
        .target(name: "SuiteCore", dependencies: ["METISMobileCore"]),
        .testTarget(name: "SuiteCoreTests", dependencies: ["SuiteCore", "METISMobileCore"])
    ]
)
