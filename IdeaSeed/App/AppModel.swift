import Combine
import Foundation

@MainActor
final class AppModel: ObservableObject {
    @Published private(set) var currentResult: GenerationRecord?
    @Published private(set) var history: [GenerationRecord] = []
    @Published private(set) var isReady = false
    @Published private(set) var isGenerating = false
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?

    private var store: IdeaSeedStore?

    init() {
        Task { await prepare() }
    }

    func generate() {
        guard let store, !isGenerating else { return }
        isGenerating = true
        errorMessage = nil
        Task {
            defer { isGenerating = false }
            do {
                currentResult = try await store.generate()
                history = try await store.historyOldestFirst()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func reloadHistory() {
        guard let store else { return }
        Task {
            do {
                history = try await store.historyOldestFirst()
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func prepare() async {
        do {
            let databaseURL = try Self.databaseURL()
            let store = try IdeaSeedStore(path: databaseURL.path)
            self.store = store

            if try await store.isEmpty() {
                let seed = try Self.loadSeed()
                try await store.install(manifest: seed.manifest, files: seed.files)
            }

            history = try await store.historyOldestFirst()
            isReady = true
            await updateIfConfigured(store: store)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func updateIfConfigured(store: IdeaSeedStore) async {
        guard let value = Bundle.main.object(forInfoDictionaryKey: "DataManifestURL") as? String,
              !value.isEmpty,
              let url = URL(string: value),
              url.scheme == "https" else {
            return
        }

        do {
            let outcome = try await DataUpdateService(manifestURL: url, store: store).checkForUpdates()
            switch outcome {
            case .upToDate:
                break
            case .updated(let count, _):
                statusMessage = "データを更新しました（\(count)カテゴリ）"
            }
        } catch {
            // 更新に失敗してもローカルキャッシュで利用を続ける。
            statusMessage = "オフラインデータを使用中"
        }
    }

    private static func databaseURL() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = base.appendingPathComponent("IdeaSeed", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return directory.appendingPathComponent("ideaseed.sqlite")
    }

    private static func loadSeed() throws -> (manifest: DataManifest, files: [String: Data]) {
        guard let manifestURL = Bundle.main.url(forResource: "manifest", withExtension: "json") else {
            throw IdeaSeedError.missingData("manifest.json")
        }
        let manifest = try JSONDecoder().decode(DataManifest.self, from: Data(contentsOf: manifestURL))
        var files: [String: Data] = [:]
        for category in manifest.categories {
            for file in category.files {
                let name = (file.path as NSString).deletingPathExtension
                let ext = (file.path as NSString).pathExtension
                guard let url = Bundle.main.url(forResource: name, withExtension: ext) else {
                    throw IdeaSeedError.missingData(file.path)
                }
                files[file.path] = try Data(contentsOf: url)
            }
        }
        return (manifest, files)
    }
}
