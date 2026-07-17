# プロジェクト進行状況

- 最終更新: 2026-07-17
- 現在の状態: MVP実装・GitHub公開・GitHub Pages公開まで完了
- 現在の保留事項: Macの空き容量不足によりXcode導入を保留

## プロジェクト情報

| 項目 | 内容 |
|---|---|
| 正式名称 | 発想の種 |
| 内部プロジェクト名 | IdeaSeed |
| Bundle Identifier | `io.github.shopping0322tech.ideaseed` |
| 対応OS | iOS 17以降 / macOS 14以降 |
| GitHubアカウント | `shopping0322-tech` |
| GitHubリポジトリ | `shopping0322-tech/idea-seed` |
| データ公開方式 | GitHub Pagesの`main`ブランチ `/docs` |

## 公開先

- リポジトリ: <https://github.com/shopping0322-tech/idea-seed>
- manifest: <https://shopping0322-tech.github.io/idea-seed/manifest.json>

manifestはHTTP 200で取得できることを確認済み。

## 完了した作業

### 設計

- SwiftUI Multiplatformを採用
- GitHub PagesをJSONの静的配信先として採用
- JSONを原本、SQLiteをアプリ実行時データとして採用
- `manifest.json`によるカテゴリ・バージョン管理を採用
- カテゴリごとの独立・等確率抽選を採用
- 更新失敗時はローカルキャッシュを利用する設計を採用
- 初期データをアプリへ同梱し、初回からオフライン利用可能にする設計を採用

### アプリ実装

- SwiftUIの生成画面
- SwiftUIの履歴画面
- manifest駆動の動的カテゴリ表示
- SQLiteへのカテゴリデータ保存
- SQLiteへの履歴保存
- 連続インデックスを使った高速ランダム抽選
- GitHub Pagesからの更新確認
- カテゴリ単位の差分ダウンロード
- SHA-256、件数、JSON形式、空文字、重複の検証
- SQLiteトランザクションによる安全な更新
- 更新失敗時のロールバック
- 同梱JSONによる初回オフライン起動

### データ

- `when.json`
- `where.json`
- `who.json`
- `action.json`
- `manifest.json`
- 初期データは各カテゴリ10件
- データ検証・manifest更新用スクリプトを実装

### GitHub

- ローカルGitリポジトリを作成
- `main`ブランチを作成
- 初回コミットを作成
- GitHub Desktopを導入してGitHub認証
- `shopping0322-tech/idea-seed`へpush
- GitHub Pagesを`main /docs`から公開
- 公開manifestの取得を確認

## 検証結果

- Swiftコア層の型検査: 成功
- SwiftUIを含む型検査: 成功
- macOS向けリンク確認: 成功
- SQLiteスモークテスト: 成功
- データ登録・抽選・履歴保存: 成功
- 不正更新時のロールバック: 成功
- JSON件数・重複・SHA-256検証: 成功
- Xcodeプロジェクト形式検査: 成功
- GitHub Pages manifest取得: HTTP 200

## 未完了・保留

### Xcodeでの最終ビルド

現在のMacにはXcode本体が入っていない。Command Line Toolsのみ導入されている。

Macの空き容量が約2GBしかないため、Xcodeのインストールは一旦保留とした。安全に作業するため、再開前に十分な空き容量を確保する。

空き容量の調査・ファイル削除は未実施。ユーザーの明示的な確認なしにファイルを削除しない。

### 未実施の検証

- XcodeによるmacOSアプリのビルド・起動
- iOS Simulatorでのビルド・起動
- 実機iPhoneでの署名・起動
- GitHub Pages更新を利用したアプリ内データ更新の実機確認
- App Store提出

App Store公開前の開発と自分の端末での基本テストは無料で行える。一般公開時のみApple Developer Programへの加入を検討する。

## 再開時の手順

1. Macの空き容量を確認する。
2. 必要に応じて、ユーザー確認の上で不要データを整理する。
3. Mac App StoreからXcodeを無料でインストールする。
4. Xcodeで `IdeaSeed.xcodeproj` を開く。
5. macOSターゲットをビルドして起動する。
6. iOS Simulatorでビルドして起動する。
7. Apple AccountをXcodeへ登録し、実機iPhoneで動作確認する。
8. GitHub上のJSONを更新し、アプリの更新・キャッシュ動作を確認する。

## データ更新手順

カテゴリJSONを編集後、カテゴリの`version`と全体の`dataVersion`を上げる。

```sh
python3 Scripts/data_manifest.py --update
python3 Scripts/data_manifest.py
```

検証成功後にコミットしてGitHubへpushする。GitHub Pagesへ反映されると、アプリは起動後に更新を取得する。

