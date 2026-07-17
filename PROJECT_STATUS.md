# プロジェクト進行状況

- 最終更新: 2026-07-18
- 現在の状態: iPhone向けPWA MVP実装・品質優先データへ修正完了
- 現在の主ルート: GitHub Pagesで配信するPWA
- 保留ルート: SwiftUIネイティブ版のXcodeビルド検証

## プロジェクト情報

| 項目 | 内容 |
|---|---|
| 正式名称 | 発想の種 |
| 内部プロジェクト名 | IdeaSeed |
| GitHubアカウント | `shopping0322-tech` |
| GitHubリポジトリ | `shopping0322-tech/idea-seed` |
| 公開方式 | GitHub Pages |
| データ公開方式 | `main`ブランチ `/docs` |
| 現在の利用想定 | iPhone Safariからホーム画面追加 |

## 公開先

- リポジトリ: <https://github.com/shopping0322-tech/idea-seed>
- PWA: <https://shopping0322-tech.github.io/idea-seed/>
- データmanifest: <https://shopping0322-tech.github.io/idea-seed/manifest.json>

## 完了した作業

### 設計

- iPhoneだけで使う場合の最短解としてPWAを主ルートに変更
- GitHub Pagesをアプリ本体とJSONデータの静的配信先として採用
- JSONを原本、IndexedDBをブラウザ内キャッシュとして採用
- `manifest.json`によるカテゴリ・バージョン管理を採用
- カテゴリごとの独立・等確率抽選を採用
- Service Workerによるオフライン起動方針を採用
- 更新失敗時はローカルキャッシュを利用する設計を採用

### PWA実装

- 生成画面
- 履歴画面
- iPhone向けレスポンシブUI
- Web App Manifest
- Apple touch icon / PWA icons
- Service Workerによるアプリシェルキャッシュ
- IndexedDBへのカテゴリデータ保存
- IndexedDBへの履歴保存
- Web Cryptoによる偏りを避けたランダム整数生成
- GitHub Pagesからの更新確認
- カテゴリ単位の差分ダウンロード
- SHA-256、件数、JSON形式、空文字、重複の検証
- 更新失敗時のキャッシュ継続
- manifest駆動の動的カテゴリ表示

### データ

- `when.json`
- `where.json`
- `who.json`
- `action.json`
- `manifest.json`
- 初期データは機械結合を使わない明示リスト
- 現在の件数は `when` 188件、`where` 174件、`who` 158件、`action` 173件
- データ生成用スクリプト `Scripts/generate_seed_data.mjs` を実装
- データ検証・manifest更新用スクリプトを実装

### ネイティブ版

- SwiftUI Multiplatform版のMVP実装は作成済み
- SQLiteによる抽選データと履歴保存の設計・実装は作成済み
- Xcode導入と実機ビルドは容量問題のため保留

## 検証結果

- PWA JavaScript構文チェック: 成功
- PWA静的テスト: 成功
- JSON件数・重複・SHA-256検証: 成功
- Git差分の空白検査: 成功
- ローカルHTTP配信確認: 成功
- ブラウザスモークテスト: 成功
- 生成ボタンによる4カテゴリ抽選: 成功
- 履歴1件保存: 成功
- 機械的な単語結合を排除: 成功
- `where` / `who` / `action` の「の」入り排除: 成功

## 未完了・保留

- GitHubへ最新PWA実装をpush
- GitHub Pages上の本番URLでPWA起動確認
- iPhone Safariでホーム画面追加
- iPhone実機でオフライン起動確認
- 大量データ投入時の体感速度確認
- Xcodeによるネイティブ版の最終ビルド検証
- App Store提出は未検討

## 次の手順

1. 最新変更をコミットする。
2. GitHub Desktopで`Push origin`する。
3. GitHub Pages反映後、iPhoneで <https://shopping0322-tech.github.io/idea-seed/> を開く。
4. Safariの共有メニューから「ホーム画面に追加」する。
5. 生成と履歴を確認する。
6. 機内モードなどでオフライン起動を確認する。

## データ更新手順

カテゴリJSONを編集後、カテゴリの`version`と全体の`dataVersion`を上げる。

同じ方針で4カテゴリを再生成する場合:

```sh
node Scripts/generate_seed_data.mjs
```

```sh
python3 Scripts/data_manifest.py --update
python3 Scripts/data_manifest.py
```

検証成功後にコミットしてGitHubへpushする。GitHub Pagesへ反映されると、PWAは起動時に更新を取得する。
