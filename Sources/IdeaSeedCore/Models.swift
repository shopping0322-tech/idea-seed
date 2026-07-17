import Foundation

public struct DataManifest: Codable, Equatable, Sendable {
    public let schemaVersion: Int
    public let dataVersion: String
    public let categories: [ManifestCategory]

    public init(schemaVersion: Int, dataVersion: String, categories: [ManifestCategory]) {
        self.schemaVersion = schemaVersion
        self.dataVersion = dataVersion
        self.categories = categories
    }

    public func validate() throws {
        guard schemaVersion == 1 else {
            throw IdeaSeedError.unsupportedSchemaVersion(schemaVersion)
        }
        guard !dataVersion.isEmpty, !categories.isEmpty else {
            throw IdeaSeedError.invalidManifest("dataVersionとcategoriesは必須です")
        }

        let ids = categories.map(\.id)
        guard Set(ids).count == ids.count else {
            throw IdeaSeedError.invalidManifest("カテゴリIDが重複しています")
        }

        let paths = categories.flatMap(\.files).map(\.path)
        guard Set(paths).count == paths.count else {
            throw IdeaSeedError.invalidManifest("ファイルパスが重複しています")
        }

        for category in categories {
            guard !category.id.isEmpty,
                  !category.label.isEmpty,
                  category.version >= 0,
                  !category.files.isEmpty else {
                throw IdeaSeedError.invalidManifest("カテゴリ定義が不正です: \(category.id)")
            }
            guard category.files.allSatisfy({ !$0.path.isEmpty && $0.count > 0 }) else {
                throw IdeaSeedError.invalidManifest("ファイル定義が不正です: \(category.id)")
            }
        }
    }
}

public struct ManifestCategory: Codable, Equatable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let order: Int
    public let version: Int
    public let files: [ManifestFile]

    public init(id: String, label: String, order: Int, version: Int, files: [ManifestFile]) {
        self.id = id
        self.label = label
        self.order = order
        self.version = version
        self.files = files
    }
}

public struct ManifestFile: Codable, Equatable, Sendable {
    public let path: String
    public let sha256: String
    public let count: Int

    public init(path: String, sha256: String, count: Int) {
        self.path = path
        self.sha256 = sha256
        self.count = count
    }
}

public struct CategorySummary: Equatable, Sendable, Identifiable {
    public let id: String
    public let label: String
    public let order: Int
    public let version: Int
    public let entryCount: Int
}

public struct GeneratedItem: Codable, Equatable, Sendable, Identifiable {
    public var id: String { categoryID }
    public let categoryID: String
    public let categoryLabel: String
    public let value: String
    public let displayOrder: Int

    public init(categoryID: String, categoryLabel: String, value: String, displayOrder: Int) {
        self.categoryID = categoryID
        self.categoryLabel = categoryLabel
        self.value = value
        self.displayOrder = displayOrder
    }
}

public struct GenerationRecord: Codable, Equatable, Sendable, Identifiable {
    public let id: UUID
    public let createdAt: Date
    public let items: [GeneratedItem]

    public init(id: UUID, createdAt: Date, items: [GeneratedItem]) {
        self.id = id
        self.createdAt = createdAt
        self.items = items
    }
}

public enum UpdateOutcome: Equatable, Sendable {
    case upToDate
    case updated(categories: Int, dataVersion: String)
}

public enum IdeaSeedError: Error, Equatable, LocalizedError {
    case database(String)
    case invalidManifest(String)
    case unsupportedSchemaVersion(Int)
    case missingData(String)
    case invalidData(String)
    case checksumMismatch(String)
    case network(String)

    public var errorDescription: String? {
        switch self {
        case .database(let message): "データベースエラー: \(message)"
        case .invalidManifest(let message): "manifestが不正です: \(message)"
        case .unsupportedSchemaVersion(let version): "未対応のschemaVersionです: \(version)"
        case .missingData(let path): "データが見つかりません: \(path)"
        case .invalidData(let message): "カテゴリデータが不正です: \(message)"
        case .checksumMismatch(let path): "チェックサムが一致しません: \(path)"
        case .network(let message): "更新データを取得できません: \(message)"
        }
    }
}
