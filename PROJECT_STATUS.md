# プロジェクト進行状況

- 最終更新: 2026-07-19
- 現在の状態: iPhone向けPWA公開・主要UI改善完了
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
- 履歴のキーワード検索
- 履歴の新しい順・古い順ソート
- 履歴の並び順を`localStorage`へ保存し、再読み込み後も復元
- 履歴の1件削除と全削除
- 1件削除・全削除共通の確認モーダル
- 履歴画面では生成ボタンを非表示
- 生成結果カード、タブ、ボタン、確認モーダルのアニメーション
- `prefers-reduced-motion`によるアニメーション抑制
- ダーク基調のティファニーブルー系テーマ
- テーマに合わせたホーム画面アイコン
- 通常時の「準備完了」表示を廃止し、必要なエラー・オフライン案内だけ表示

### データ

- `when.json`
- `where.json`
- `who.json`
- `action.json`
- `manifest.json`
- 初期データは機械結合を使わない明示リスト
- 現在の件数は `when` 515件、`where` 479件、`who` 473件、`action` 476件
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
- iPhone相当の390 × 844、タッチ操作でのブラウザスモークテスト: 成功
- 生成ボタンによる4カテゴリ抽選: 成功
- 履歴1件保存: 成功
- 履歴検索・ソート・1件削除・全削除: 成功
- 削除確認モーダル: 成功
- 並び順の再読み込み後の復元: 成功
- 生成カード・確認モーダルのアニメーション発火確認: 成功
- 機械的な単語結合を排除: 成功
- `where` / `who` / `action` の「の」入り排除: 成功
- GitHub Pages公開版のService Worker `idea-seed-shell-v8`反映確認: 成功

## 未完了・保留

- iPhone実機でオフライン起動確認
- 大量データ投入時の体感速度確認
- 各カテゴリのデータを現在の約500件から継続的に拡充
- 実利用を通じた語彙品質の確認と不自然な項目の修正
- Xcodeによるネイティブ版の最終ビルド検証
- App Store提出は未検討

## 次の手順

1. iPhone実機で日常的に使い、語彙の違和感を記録する。
2. 明示リスト方式を維持したまま各カテゴリのデータを増やす。
3. 機内モードなどでオフライン起動を確認する。
4. データ件数が増えた段階で生成速度と初回更新速度を測定する。
5. 必要になった場合だけSwiftUIネイティブ版を再検討する。

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
