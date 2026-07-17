# 発想の種（IdeaSeed）

企画・脚本のための「発想の種」を、カテゴリごとに独立してランダム抽選するiPhone / Macアプリです。AIや外部APIによる生成・意味付けは行いません。

設計の詳細は [ARCHITECTURE.md](ARCHITECTURE.md) を参照してください。

## 現在の実装

- SwiftUI Multiplatformの生成画面・履歴画面
- SQLiteによる抽選データと履歴の保存
- システム乱数と連続インデックスによる等確率抽選
- 初期JSONからのオフライン起動
- `manifest.json`を使ったカテゴリ単位の更新
- SHA-256、件数、JSON形式、重複の検証
- 更新失敗時のローカルキャッシュ継続
- manifest駆動の動的カテゴリ表示

## 開発環境

- 正式名称: 発想の種
- 内部プロジェクト名: IdeaSeed
- Bundle Identifier: `io.github.shopping0322tech.ideaseed`
- Xcode 16以降
- iOS 17以降
- macOS 14以降

`IdeaSeed.xcodeproj`をXcodeで開き、`IdeaSeed`スキームを実行します。初回はSigning & Capabilitiesで開発チームを選択してください。

## GitHub Pages設定

配信用データの正本は `docs/` です。GitHubリポジトリのPages設定で、デプロイ元を対象ブランチの `/docs` にします。

GitHubアカウントは `shopping0322-tech`、リポジトリ名は `idea-seed` を正式な公開先として採用します。アプリには次のURLを設定済みです。

```text
https://shopping0322-tech.github.io/idea-seed/manifest.json
```

リポジトリとPagesが公開されるまでは取得に失敗しますが、アプリは同梱データを利用して通常動作します。

## データ更新

1. `docs/`にあるカテゴリJSONを編集する。
2. 該当カテゴリの`version`と全体の`dataVersion`を上げる。
3. 件数とSHA-256を更新する。
4. 検証してGitHubへpushする。

```sh
python3 Scripts/data_manifest.py --update
python3 Scripts/data_manifest.py
```

新しいカテゴリはJSONファイルとmanifestのカテゴリ定義を追加するだけで、アプリの生成画面と履歴へ反映されます。

## テスト

コアロジックはSwift Packageとしても定義しています。

```sh
swift test
```

XCTestを利用できない最小環境では、`Tests/Smoke/SmokeMain.swift`をコアソースと一緒にコンパイルして、DB登録・抽選・履歴・ロールバックを検証できます。

現在の作成環境にはXcode本体がなく、Command Line ToolsのコンパイラとSDKにもバージョン不整合があるため、この環境では完全なビルドとテスト実行ができません。Xcodeを導入した環境で実行してください。
