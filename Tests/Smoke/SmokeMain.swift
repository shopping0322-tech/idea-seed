import Foundation

@main
enum SmokeMain {
    static func main() async throws {
        let databaseURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("IdeaSeed-Smoke-\(UUID().uuidString).sqlite")
        defer {
            for suffix in ["", "-wal", "-shm"] {
                try? FileManager.default.removeItem(atPath: databaseURL.path + suffix)
            }
        }

        let when = try JSONEncoder().encode(["朝", "夜"])
        let who = try JSONEncoder().encode(["医師", "泥棒"])
        let store = try IdeaSeedStore(path: databaseURL.path)
        let manifest = DataManifest(
            schemaVersion: 1,
            dataVersion: "smoke-1",
            categories: [
                ManifestCategory(
                    id: "when", label: "いつ", order: 1, version: 1,
                    files: [ManifestFile(path: "when.json", sha256: "", count: 2)]
                ),
                ManifestCategory(
                    id: "who", label: "誰が", order: 2, version: 1,
                    files: [ManifestFile(path: "who.json", sha256: "", count: 2)]
                )
            ]
        )

        try await store.install(manifest: manifest, files: ["when.json": when, "who.json": who])
        let result = try await store.generate()
        precondition(result.items.count == 2)
        precondition(["朝", "夜"].contains(result.items[0].value))
        precondition(["医師", "泥棒"].contains(result.items[1].value))
        let history = try await store.historyOldestFirst()
        precondition(history.count == 1)

        let invalidManifest = DataManifest(
            schemaVersion: 1,
            dataVersion: "smoke-2",
            categories: [
                ManifestCategory(
                    id: "when", label: "いつ", order: 1, version: 2,
                    files: [ManifestFile(path: "when.json", sha256: "", count: 99)]
                )
            ]
        )
        do {
            try await store.install(manifest: invalidManifest, files: ["when.json": when])
            fatalError("不正な更新が成功しました")
        } catch {
            let versions = try await store.categoryVersions()
            precondition(versions["when"] == 1)
            precondition(versions["who"] == 1)
        }

        print("Smoke test passed")
    }
}
