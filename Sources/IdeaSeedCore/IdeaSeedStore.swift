import Foundation

#if SWIFT_PACKAGE
import CSQLite
#else
import SQLite3
#endif

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

public actor IdeaSeedStore {
    private var connection: OpaquePointer?

    public init(path: String) throws {
        var database: OpaquePointer?
        let result = sqlite3_open_v2(
            path,
            &database,
            SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX,
            nil
        )
        guard result == SQLITE_OK, let database else {
            let message = database.map { String(cString: sqlite3_errmsg($0)) } ?? "SQLiteを開けません"
            if let database { sqlite3_close(database) }
            throw IdeaSeedError.database(message)
        }
        connection = database

        do {
            try Self.execute(database, sql: "PRAGMA foreign_keys = ON")
            try Self.execute(database, sql: "PRAGMA journal_mode = WAL")
            try Self.execute(database, sql: "PRAGMA synchronous = NORMAL")
            try Self.createSchema(database)
        } catch {
            sqlite3_close(database)
            connection = nil
            throw error
        }
    }

    deinit {
        if let connection { sqlite3_close(connection) }
    }

    public func isEmpty() throws -> Bool {
        try scalarInt("SELECT COUNT(*) FROM categories") == 0
    }

    public func categoryVersions() throws -> [String: Int] {
        let statement = try prepare("SELECT id, data_version FROM categories")
        defer { sqlite3_finalize(statement) }
        var result: [String: Int] = [:]
        while sqlite3_step(statement) == SQLITE_ROW {
            result[text(statement, column: 0)] = Int(sqlite3_column_int64(statement, 1))
        }
        return result
    }

    public func installedDataVersion() throws -> String? {
        let statement = try prepare("SELECT value FROM app_metadata WHERE key = 'dataVersion'")
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else { return nil }
        return text(statement, column: 0)
    }

    public func categories() throws -> [CategorySummary] {
        let statement = try prepare("""
            SELECT id, label, display_order, data_version, entry_count
            FROM categories
            ORDER BY display_order, id
            """)
        defer { sqlite3_finalize(statement) }

        var result: [CategorySummary] = []
        while sqlite3_step(statement) == SQLITE_ROW {
            result.append(CategorySummary(
                id: text(statement, column: 0),
                label: text(statement, column: 1),
                order: Int(sqlite3_column_int64(statement, 2)),
                version: Int(sqlite3_column_int64(statement, 3)),
                entryCount: Int(sqlite3_column_int64(statement, 4))
            ))
        }
        return result
    }

    public func install(manifest: DataManifest, files: [String: Data]) throws {
        try manifest.validate()
        guard let connection else { throw IdeaSeedError.database("接続がありません") }

        let existingVersions = try categoryVersions()
        try Self.execute(connection, sql: "BEGIN IMMEDIATE TRANSACTION")
        do {
            let incomingIDs = Set(manifest.categories.map(\.id))
            for existingID in existingVersions.keys where !incomingIDs.contains(existingID) {
                try execute("DELETE FROM categories WHERE id = ?", bindings: [.text(existingID)])
            }

            for category in manifest.categories {
                let suppliedFiles = category.files.compactMap { files[$0.path] }
                let shouldReplace = suppliedFiles.count == category.files.count

                if shouldReplace {
                    var entries: [String] = []
                    for file in category.files {
                        guard let data = files[file.path] else {
                            throw IdeaSeedError.missingData(file.path)
                        }
                        if !file.sha256.isEmpty,
                           SHA256Digest.hex(for: data).lowercased() != file.sha256.lowercased() {
                            throw IdeaSeedError.checksumMismatch(file.path)
                        }
                        let decoded = try JSONDecoder().decode([String].self, from: data)
                        guard decoded.count == file.count else {
                            throw IdeaSeedError.invalidData("\(file.path) の件数がmanifestと一致しません")
                        }
                        entries.append(contentsOf: decoded)
                    }

                    guard entries.allSatisfy({ !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
                        throw IdeaSeedError.invalidData("\(category.id) に空文字列があります")
                    }
                    guard Set(entries).count == entries.count else {
                        throw IdeaSeedError.invalidData("\(category.id) に重複があります")
                    }

                    try upsert(category: category, entryCount: entries.count)
                    try execute("DELETE FROM entries WHERE category_id = ?", bindings: [.text(category.id)])
                    for (index, value) in entries.enumerated() {
                        try execute(
                            "INSERT INTO entries(category_id, entry_index, text) VALUES (?, ?, ?)",
                            bindings: [.text(category.id), .integer(index), .text(value)]
                        )
                    }
                } else {
                    guard existingVersions[category.id] != nil else {
                        throw IdeaSeedError.missingData(category.id)
                    }
                    let count = try entryCount(for: category.id)
                    try upsert(category: category, entryCount: count)
                }
            }

            try setMetadata(key: "dataVersion", value: manifest.dataVersion)
            try setMetadata(key: "schemaVersion", value: String(manifest.schemaVersion))
            try Self.execute(connection, sql: "COMMIT")
        } catch {
            try? Self.execute(connection, sql: "ROLLBACK")
            throw error
        }
    }

    public func generate(now: Date = Date()) throws -> GenerationRecord {
        guard let connection else { throw IdeaSeedError.database("接続がありません") }
        let categoryList = try categories()
        guard !categoryList.isEmpty else { throw IdeaSeedError.missingData("カテゴリ") }

        try Self.execute(connection, sql: "BEGIN IMMEDIATE TRANSACTION")
        do {
            var items: [GeneratedItem] = []
            for category in categoryList {
                guard category.entryCount > 0 else { throw IdeaSeedError.missingData(category.id) }
                let randomIndex = Int.random(in: 0..<category.entryCount)
                let value = try entry(categoryID: category.id, index: randomIndex)
                items.append(GeneratedItem(
                    categoryID: category.id,
                    categoryLabel: category.label,
                    value: value,
                    displayOrder: category.order
                ))
            }

            let record = GenerationRecord(id: UUID(), createdAt: now, items: items)
            try execute(
                "INSERT INTO history(id, created_at) VALUES (?, ?)",
                bindings: [.text(record.id.uuidString), .real(now.timeIntervalSince1970)]
            )
            for item in items {
                try execute(
                    """
                    INSERT INTO history_items(
                        history_id, category_id, category_label, value, display_order
                    ) VALUES (?, ?, ?, ?, ?)
                    """,
                    bindings: [
                        .text(record.id.uuidString), .text(item.categoryID),
                        .text(item.categoryLabel), .text(item.value), .integer(item.displayOrder)
                    ]
                )
            }
            try Self.execute(connection, sql: "COMMIT")
            return record
        } catch {
            try? Self.execute(connection, sql: "ROLLBACK")
            throw error
        }
    }

    public func historyOldestFirst() throws -> [GenerationRecord] {
        let statement = try prepare("""
            SELECT h.id, h.created_at, i.category_id, i.category_label, i.value, i.display_order
            FROM history h
            JOIN history_items i ON i.history_id = h.id
            ORDER BY h.created_at ASC, h.rowid ASC, i.display_order ASC, i.category_id ASC
            """)
        defer { sqlite3_finalize(statement) }

        var records: [GenerationRecord] = []
        var activeID: UUID?
        var activeDate = Date()
        var activeItems: [GeneratedItem] = []

        func appendActive() {
            if let activeID {
                records.append(GenerationRecord(id: activeID, createdAt: activeDate, items: activeItems))
            }
        }

        while sqlite3_step(statement) == SQLITE_ROW {
            guard let rowID = UUID(uuidString: text(statement, column: 0)) else { continue }
            if rowID != activeID {
                appendActive()
                activeID = rowID
                activeDate = Date(timeIntervalSince1970: sqlite3_column_double(statement, 1))
                activeItems = []
            }
            activeItems.append(GeneratedItem(
                categoryID: text(statement, column: 2),
                categoryLabel: text(statement, column: 3),
                value: text(statement, column: 4),
                displayOrder: Int(sqlite3_column_int64(statement, 5))
            ))
        }
        appendActive()
        return records
    }

    private func entryCount(for categoryID: String) throws -> Int {
        let statement = try prepare("SELECT entry_count FROM categories WHERE id = ?")
        defer { sqlite3_finalize(statement) }
        try bind(.text(categoryID), to: statement, index: 1)
        guard sqlite3_step(statement) == SQLITE_ROW else { throw IdeaSeedError.missingData(categoryID) }
        return Int(sqlite3_column_int64(statement, 0))
    }

    private func entry(categoryID: String, index: Int) throws -> String {
        let statement = try prepare("SELECT text FROM entries WHERE category_id = ? AND entry_index = ?")
        defer { sqlite3_finalize(statement) }
        try bind(.text(categoryID), to: statement, index: 1)
        try bind(.integer(index), to: statement, index: 2)
        guard sqlite3_step(statement) == SQLITE_ROW else {
            throw IdeaSeedError.missingData("\(categoryID):\(index)")
        }
        return text(statement, column: 0)
    }

    private func upsert(category: ManifestCategory, entryCount: Int) throws {
        try execute("""
            INSERT INTO categories(id, label, display_order, data_version, entry_count)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                label = excluded.label,
                display_order = excluded.display_order,
                data_version = excluded.data_version,
                entry_count = excluded.entry_count
            """, bindings: [
                .text(category.id), .text(category.label), .integer(category.order),
                .integer(category.version), .integer(entryCount)
            ])
    }

    private func setMetadata(key: String, value: String) throws {
        try execute("""
            INSERT INTO app_metadata(key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """, bindings: [.text(key), .text(value)])
    }

    private static func createSchema(_ database: OpaquePointer) throws {
        try execute(database, sql: """
            CREATE TABLE IF NOT EXISTS categories(
                id TEXT PRIMARY KEY,
                label TEXT NOT NULL,
                display_order INTEGER NOT NULL,
                data_version INTEGER NOT NULL,
                entry_count INTEGER NOT NULL CHECK(entry_count >= 0)
            );
            CREATE TABLE IF NOT EXISTS entries(
                category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
                entry_index INTEGER NOT NULL,
                text TEXT NOT NULL,
                PRIMARY KEY(category_id, entry_index)
            );
            CREATE TABLE IF NOT EXISTS app_metadata(
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history(
                id TEXT PRIMARY KEY,
                created_at REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS history_items(
                history_id TEXT NOT NULL REFERENCES history(id) ON DELETE CASCADE,
                category_id TEXT NOT NULL,
                category_label TEXT NOT NULL,
                value TEXT NOT NULL,
                display_order INTEGER NOT NULL,
                PRIMARY KEY(history_id, category_id)
            );
            CREATE INDEX IF NOT EXISTS history_created_at ON history(created_at);
            """)
    }

    private enum Binding {
        case text(String)
        case integer(Int)
        case real(Double)
    }

    private func scalarInt(_ sql: String) throws -> Int {
        let statement = try prepare(sql)
        defer { sqlite3_finalize(statement) }
        guard sqlite3_step(statement) == SQLITE_ROW else { throw databaseError() }
        return Int(sqlite3_column_int64(statement, 0))
    }

    private func execute(_ sql: String, bindings: [Binding] = []) throws {
        let statement = try prepare(sql)
        defer { sqlite3_finalize(statement) }
        for (offset, binding) in bindings.enumerated() {
            try bind(binding, to: statement, index: Int32(offset + 1))
        }
        guard sqlite3_step(statement) == SQLITE_DONE else { throw databaseError() }
    }

    private func prepare(_ sql: String) throws -> OpaquePointer {
        guard let connection else { throw IdeaSeedError.database("接続がありません") }
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(connection, sql, -1, &statement, nil) == SQLITE_OK,
              let statement else { throw databaseError() }
        return statement
    }

    private func bind(_ binding: Binding, to statement: OpaquePointer, index: Int32) throws {
        let result: Int32
        switch binding {
        case .text(let value): result = sqlite3_bind_text(statement, index, value, -1, sqliteTransient)
        case .integer(let value): result = sqlite3_bind_int64(statement, index, sqlite3_int64(value))
        case .real(let value): result = sqlite3_bind_double(statement, index, value)
        }
        guard result == SQLITE_OK else { throw databaseError() }
    }

    private func text(_ statement: OpaquePointer, column: Int32) -> String {
        guard let value = sqlite3_column_text(statement, column) else { return "" }
        return String(cString: value)
    }

    private func databaseError() -> IdeaSeedError {
        guard let connection else { return .database("接続がありません") }
        return .database(String(cString: sqlite3_errmsg(connection)))
    }

    private static func execute(_ database: OpaquePointer, sql: String) throws {
        var errorMessage: UnsafeMutablePointer<CChar>?
        guard sqlite3_exec(database, sql, nil, nil, &errorMessage) == SQLITE_OK else {
            let message: String
            if let errorMessage {
                message = String(cString: errorMessage)
            } else {
                message = String(cString: sqlite3_errmsg(database))
            }
            sqlite3_free(errorMessage)
            throw IdeaSeedError.database(message)
        }
    }
}
