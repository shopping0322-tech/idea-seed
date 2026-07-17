import Foundation
import XCTest
@testable import IdeaSeedCore

final class IdeaSeedCoreTests: XCTestCase {
    func testInstallGenerateAndHistory() async throws {
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("IdeaSeedTests-\(UUID().uuidString).sqlite")
        defer { try? FileManager.default.removeItem(at: databaseURL) }

        let store = try IdeaSeedStore(path: databaseURL.path)
        let when = try JSONEncoder().encode(["朝", "夜"])
        let who = try JSONEncoder().encode(["医師", "泥棒"])
        let manifest = DataManifest(
            schemaVersion: 1,
            dataVersion: "test-1",
            categories: [
                ManifestCategory(
                    id: "when", label: "いつ", order: 1, version: 1,
                    files: [ManifestFile(path: "when.json", sha256: SHA256Digest.hex(for: when), count: 2)]
                ),
                ManifestCategory(
                    id: "who", label: "誰が", order: 2, version: 1,
                    files: [ManifestFile(path: "who.json", sha256: SHA256Digest.hex(for: who), count: 2)]
                )
            ]
        )

        try await store.install(manifest: manifest, files: ["when.json": when, "who.json": who])
        let generatedAt = Date(timeIntervalSince1970: 1_700_000_000)
        let result = try await store.generate(now: generatedAt)

        XCTAssertEqual(result.items.count, 2)
        XCTAssertTrue(["朝", "夜"].contains(result.items[0].value))
        XCTAssertTrue(["医師", "泥棒"].contains(result.items[1].value))

        let history = try await store.historyOldestFirst()
        XCTAssertEqual(history.count, 1)
        XCTAssertEqual(history[0], result)
    }

    func testRejectedUpdateKeepsExistingData() async throws {
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("IdeaSeedTests-\(UUID().uuidString).sqlite")
        defer { try? FileManager.default.removeItem(at: databaseURL) }
        let store = try IdeaSeedStore(path: databaseURL.path)

        let original = try JSONEncoder().encode(["最初"])
        let originalManifest = manifest(version: 1, data: original, count: 1)
        try await store.install(manifest: originalManifest, files: ["when.json": original])

        let invalid = try JSONEncoder().encode(["変更後"])
        let invalidManifest = manifest(version: 2, data: invalid, count: 2)
        do {
            try await store.install(manifest: invalidManifest, files: ["when.json": invalid])
            XCTFail("不正な更新が成功しました")
        } catch {
            // Expected.
        }

        let result = try await store.generate()
        XCTAssertEqual(result.items.first?.value, "最初")
        let versions = try await store.categoryVersions()
        XCTAssertEqual(versions["when"], 1)
    }

    private func manifest(version: Int, data: Data, count: Int) -> DataManifest {
        DataManifest(
            schemaVersion: 1,
            dataVersion: "test-\(version)",
            categories: [
                ManifestCategory(
                    id: "when", label: "いつ", order: 1, version: version,
                    files: [ManifestFile(
                        path: "when.json",
                        sha256: SHA256Digest.hex(for: data),
                        count: count
                    )]
                )
            ]
        )
    }
}
