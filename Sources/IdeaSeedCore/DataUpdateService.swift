import Foundation

public actor DataUpdateService {
    private let manifestURL: URL
    private let store: IdeaSeedStore
    private let session: URLSession

    public init(manifestURL: URL, store: IdeaSeedStore, session: URLSession = .shared) {
        self.manifestURL = manifestURL
        self.store = store
        self.session = session
    }

    public func checkForUpdates() async throws -> UpdateOutcome {
        let manifestData = try await download(manifestURL)
        let manifest: DataManifest
        do {
            manifest = try JSONDecoder().decode(DataManifest.self, from: manifestData)
            try manifest.validate()
        } catch let error as IdeaSeedError {
            throw error
        } catch {
            throw IdeaSeedError.invalidManifest(error.localizedDescription)
        }

        let localVersions = try await store.categoryVersions()
        let localDataVersion = try await store.installedDataVersion()
        let changed = manifest.categories.filter { localVersions[$0.id] != $0.version }
        let remoteIDs = Set(manifest.categories.map(\.id))
        let hasRemovedCategories = localVersions.keys.contains { !remoteIDs.contains($0) }
        guard !changed.isEmpty || hasRemovedCategories || localDataVersion != manifest.dataVersion else {
            return .upToDate
        }

        var files: [String: Data] = [:]
        let baseURL = manifestURL.deletingLastPathComponent()
        for category in changed {
            for file in category.files {
                guard let url = URL(string: file.path, relativeTo: baseURL)?.absoluteURL else {
                    throw IdeaSeedError.invalidManifest("不正なURLです: \(file.path)")
                }
                files[file.path] = try await download(url)
            }
        }

        try await store.install(manifest: manifest, files: files)
        return .updated(categories: changed.count, dataVersion: manifest.dataVersion)
    }

    private func download(_ url: URL) async throws -> Data {
        do {
            let (data, response) = try await session.data(from: url)
            if let response = response as? HTTPURLResponse,
               !(200...299).contains(response.statusCode) {
                throw IdeaSeedError.network("HTTP \(response.statusCode): \(url.absoluteString)")
            }
            return data
        } catch let error as IdeaSeedError {
            throw error
        } catch {
            throw IdeaSeedError.network(error.localizedDescription)
        }
    }
}
