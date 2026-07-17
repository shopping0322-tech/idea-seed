// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "IdeaSeed",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "IdeaSeedCore", targets: ["IdeaSeedCore"])
    ],
    targets: [
        .systemLibrary(
            name: "CSQLite",
            pkgConfig: "sqlite3",
            providers: [.brew(["sqlite3"])]
        ),
        .target(
            name: "IdeaSeedCore",
            dependencies: ["CSQLite"],
            path: "Sources/IdeaSeedCore",
            linkerSettings: [.linkedLibrary("sqlite3")]
        ),
        .testTarget(
            name: "IdeaSeedCoreTests",
            dependencies: ["IdeaSeedCore"],
            path: "Tests/IdeaSeedCoreTests"
        )
    ]
)
