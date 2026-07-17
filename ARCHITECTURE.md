# 発想の種ジェネレーター アーキテクチャ

- ステータス: 採用
- 決定日: 2026-07-17
- 更新日: 2026-07-18
- 対象: iPhone優先
- 実装状況: PWA MVP実装・ローカル検証完了
- 正式アプリ名: 発想の種
- 内部プロジェクト名: IdeaSeed
- Bundle Identifier: `io.github.shopping0322tech.ideaseed`
- 最低対応OS: iOS 17 / macOS 14
- PWA公開先: `https://shopping0322-tech.github.io/idea-seed/`
- データ公開先: `https://shopping0322-tech.github.io/idea-seed/manifest.json`

## 0. 現在の採用方針

当初はSwiftUI MultiplatformでiPhone / Mac両対応を目指したが、Xcode導入に必要なMac容量が不足しているため、現在はiPhoneだけで使えるPWAを主ルートとして進める。

PWA版はGitHub Pagesだけで公開でき、App Store費用もXcode環境も不要。Safariからホーム画面に追加すれば、iPhone上ではアプリに近い形で利用できる。

SwiftUI版の設計と実装は将来のネイティブ化候補として残す。

## 1. 目的

「いつ」「どこで」「誰が」「何をした」などのカテゴリから、それぞれ独立して1件をランダム抽選し、企画・脚本の発想の種を高速に提示する。

文章生成、意味付け、組み合わせ評価、AI補完は行わない。自然さよりも、等確率・独立性・偶然性を優先する。

## 2. 採用構成

### 現在の主構成: PWA

| 領域 | 採用技術・方式 |
|---|---|
| アプリ | PWA |
| 対象OS | iPhone Safari |
| 配信 | GitHub Pages |
| データ原本 | カテゴリ別JSON |
| 更新定義 | `manifest.json` |
| ローカルデータ | IndexedDB |
| オフライン対応 | Service Worker + IndexedDB |
| 履歴 | IndexedDBへ生成時の表示値を保存 |
| 乱数 | Web Crypto API |

### 保留中のネイティブ構成: SwiftUI

| 領域 | 採用技術・方式 |
|---|---|
| アプリ | SwiftUI Multiplatform |
| 対象OS | iOS / macOS |
| データ原本 | カテゴリ別JSON |
| データ配信 | GitHub Pagesによる静的HTTPS配信 |
| 更新定義 | `manifest.json` |
| ローカルデータ | SQLite |
| 初回オフライン対応 | 初期データをアプリへ同梱 |
| 履歴 | SQLiteへ生成時の表示値を保存 |
| 乱数 | Swiftのシステム乱数生成器 |

GitHub PagesはPWA本体とJSONデータの配信場所として使用する。

## 3. 設計原則

1. 各カテゴリは独立かつ等確率で抽選する。
2. 起動時のネットワーク通信を待たず、ローカルデータですぐ利用可能にする。
3. 更新失敗時に既存データを破壊しない。
4. カテゴリをアプリコードへ固定せず、manifestから動的に構成する。
5. JSONは管理・配信用、IndexedDBはPWA実行時用と役割を分ける。
6. データ更新だけではアプリ更新を必要としない。
7. 外部API、AI生成、意味解析、重み付けは使用しない。

## 4. 全体構成

```text
GitHubリポジトリ / GitHub Pages (`docs/`)
  ├─ index.html
  ├─ app.js
  ├─ service-worker.js
  ├─ manifest.webmanifest
  ├─ manifest.json
  ├─ when.json
  ├─ where.json
  ├─ who.json
  └─ action.json
             |
             | Safariで起動・必要時に更新
             v
PWA
  ├─ DataService
  ├─ DataStore
  ├─ RandomSelection
  ├─ IndexedDB
  │   ├─ manifest
  │   ├─ categories
  │   ├─ chunks
  │   └─ history
  ├─ 生成画面
  └─ 履歴画面
```

## 5. manifest仕様

全体バージョンだけを持つ `version.json` ではなく、カテゴリ定義と更新情報を持つ `manifest.json` を使用する。

初期仕様例:

```json
{
  "schemaVersion": 1,
  "dataVersion": "2026.07.17.1",
  "categories": [
    {
      "id": "when",
      "label": "いつ",
      "order": 1,
      "version": 1,
      "files": [
        {
          "path": "when.json",
          "sha256": "...",
          "count": 100000
        }
      ]
    }
  ]
}
```

### 必須ルール

- `schemaVersion`: manifestおよびデータ形式の互換性管理に使う整数。
- `dataVersion`: データセット全体の識別子。表示・診断用途にも使う。
- `categories[].id`: 永続的で重複しない識別子。後から変更しない。
- `categories[].label`: UIに表示する名称。
- `categories[].order`: UI上の表示順。
- `categories[].version`: カテゴリ単位の更新判定に使う。
- `files[].sha256`: ダウンロード内容の完全性検証に使う。
- `files[].count`: 取込後の件数検証に使う。

データが大きくなった場合に備え、1カテゴリが複数ファイルを持てる仕様にする。初期段階では1カテゴリ1ファイルでよい。

## 6. カテゴリJSON仕様

初期仕様は単純な文字列配列とする。

```json
[
  "100年後",
  "昨日の午前3時",
  "文明が滅びる直前"
]
```

現時点では、タグ、意味、重み、関連カテゴリ、出典などのメタデータを持たせない。

### データ運用ルール

- JSONはUTF-8とする。
- 空文字列は許可しない。
- 配列以外のトップレベル値は許可しない。
- 抽選確率を等しく保つため、同一カテゴリ内の完全一致重複はデータ生成時に検査する。
- 改行や前後の不要な空白はデータ生成時に正規化する。

## 7. ローカル保存

PWA版ではIndexedDBを使用する。大量データに備え、カテゴリJSONは一定件数ごとのchunkに分割して保存する。

```text
meta
  key             string
  value           object

categories
  id              string
  label           string
  order           number
  version         number
  count           number
  chunkSize       number
  chunkCount      number

chunks
  categoryId      string
  index           number
  values          string[]

history
  id              string
  createdAt       number
  items           generated values
```

履歴にはentryへの参照だけでなく、生成時点のカテゴリ名と値を保存する。これにより、後のデータ更新や削除後も過去の履歴を保持できる。

### ネイティブ版のSQLite案

想定する論理テーブル:

```text
categories
  id              TEXT PRIMARY KEY
  label           TEXT NOT NULL
  display_order   INTEGER NOT NULL
  data_version    INTEGER NOT NULL
  entry_count     INTEGER NOT NULL

entries
  category_id     TEXT NOT NULL
  entry_index     INTEGER NOT NULL
  text            TEXT NOT NULL
  PRIMARY KEY (category_id, entry_index)

app_metadata
  key             TEXT PRIMARY KEY
  value           TEXT NOT NULL

history
  id              TEXT PRIMARY KEY
  created_at       TEXT NOT NULL

history_items
  history_id       TEXT NOT NULL
  category_id      TEXT NOT NULL
  category_label   TEXT NOT NULL
  value            TEXT NOT NULL
  display_order    INTEGER NOT NULL
```

ネイティブ版へ戻す場合は、上記のSQLite構成を使用する。

## 8. ランダム抽選

抽選時はカテゴリごとに次を実行する。

1. `entry_count` を取得する。
2. システム乱数生成器で `0 ... entry_count - 1` の整数を生成する。
3. `category_id` と `entry_index` を指定して1件取得する。
4. 全カテゴリの結果を1件の履歴として保存する。

更新時に各カテゴリの `entry_index` を0始まりの連番で作り直し、欠番を許可しない。

大量データで遅くなるため、抽選に `ORDER BY RANDOM()` は使用しない。前回結果の除外、組み合わせ補正、意味判定も行わない。

## 9. データ更新フロー

```text
アプリ起動
  ├─ ローカルIndexedDBを読み込み、すぐ利用可能にする
  └─ バックグラウンドでmanifest.jsonを取得
       ├─ 取得失敗: 既存キャッシュを継続使用
       ├─ 更新なし: 終了
       └─ 更新あり
            ├─ 変更対象のJSONを一時領域へ取得
            ├─ SHA-256を検証
            ├─ JSON形式・件数・空文字を検証
            ├─ IndexedDBへchunk単位で取り込む
            ├─ トランザクションで新データへ切り替える
            └─ ローカルのmanifest情報を更新
```

ダウンロード途中、JSON不正、ハッシュ不一致、件数不一致、IndexedDB取込失敗のいずれかが起きた場合は更新を確定せず、既存データを使い続ける。

互換性のない `schemaVersion` を受信した場合も更新せず、アプリ更新が必要であることを診断可能な状態にする。

## 10. 初回起動とオフライン

PWA本体と初期manifest・初期データをGitHub Pagesで配信し、Service WorkerとIndexedDBへ保存する。

- ローカルDBがなければ、配信データからDBを構築する。
- ローカルDBがあれば、ネットワーク取得に失敗してもローカルDBを優先する。
- 一度もネットワークへ接続できなくても生成と履歴保存を利用可能にする。

## 11. UI方針

生成画面はmanifestのカテゴリ一覧を `order` 順に縦表示する。カテゴリ増加時に備えてスクロール可能にする。

```text
いつ
100年後

どこで
冷蔵庫の中

誰が
元警察官

何をした
埋めた

[生成]
```

履歴画面は生成日時と全カテゴリの値を古い順に表示する。検索、お気に入り、AI補完は初期スコープに含めない。

## 12. カテゴリ追加

カテゴリ追加時の基本作業は次のとおりとする。

1. 新しいカテゴリJSONを追加する。
2. manifestへカテゴリ定義を追加する。
3. manifestとJSONをGitHubへpushする。

生成画面、抽選処理、履歴画面はmanifestを参照するため、通常のカテゴリ追加ではコード変更を不要とする。

## 13. 初期スコープ外

- AIによる生成・補完・分類
- 結果の自然さ判定
- カテゴリ間の関連付け
- 重み付き抽選
- 検索
- お気に入り
- ユーザーによるデータ編集
- MacとiPhone間の履歴同期
- バックグラウンドプッシュ更新

## 14. 確定事項

- 現在の主ルートはiPhone Safari向けPWAとする。
- 正式名称は「発想の種」、内部名は `IdeaSeed` とする。
- 現在の初期データは、機械的な単語結合を使わない明示リストとする。
- PWA版は外部依存を増やさず、ブラウザ標準APIだけで構成する。
- 更新成功時は簡潔な状態表示を行い、失敗時はローカルキャッシュへ自動フォールバックする。
