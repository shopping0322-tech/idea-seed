# 発想の種（IdeaSeed）

企画・脚本のための「発想の種」を、カテゴリごとに独立してランダム抽選するiPhone向けPWAです。AIや外部APIによる生成・意味付けは行いません。

現在の主ルートは、GitHub Pagesで動くPWA版です。SwiftUI版は将来のネイティブ化候補としてリポジトリ内に残しています。

## 公開URL

```text
https://shopping0322-tech.github.io/idea-seed/
```

iPhoneではSafariで開き、共有メニューから「ホーム画面に追加」すると、アプリのように起動できます。

## 現在の実装

- iPhone向けPWA UI
- GitHub Pagesによる静的配信
- Web Cryptoによる等確率ランダム抽選
- IndexedDBによるカテゴリデータと履歴のローカル保存
- Service Workerによるオフライン起動
- `manifest.json`を使ったカテゴリ単位の更新
- SHA-256、件数、JSON形式、重複の検証
- 更新失敗時のローカルキャッシュ継続
- manifest駆動の動的カテゴリ表示

## データ更新

配信用データの正本は `docs/` です。

現在の初期データは、機械的な単語結合をやめ、現実にある単語・場面だけを明示リストで管理しています。

```text
when: 515
where: 479
who: 473
action: 476
```

同じ方針でデータを再生成する場合:

```sh
node Scripts/generate_seed_data.mjs
```

1. `docs/`にあるカテゴリJSONを編集する。
2. 該当カテゴリの`version`と全体の`dataVersion`を上げる。
3. 件数とSHA-256を更新する。
4. 検証してGitHubへpushする。

```sh
python3 Scripts/data_manifest.py --update
python3 Scripts/data_manifest.py
```

新しいカテゴリはJSONファイルとmanifestのカテゴリ定義を追加すると、生成画面と履歴へ反映されます。

## ローカル確認

```sh
python3 -m http.server 4173 --directory docs
```

ブラウザで次を開きます。

```text
http://127.0.0.1:4173/
```

## テスト

PWAの静的検証:

```sh
node --test Tests/PWA/PWATests.mjs
```

データ検証:

```sh
python3 Scripts/data_manifest.py
```

ブラウザスモークテストは、ローカルサーバー起動後にChrome DevTools Protocolで実行します。

```sh
IDEA_SEED_PAGE_URL=http://127.0.0.1:4173/ \
IDEA_SEED_DEVTOOLS_URL=http://127.0.0.1:9222 \
node Tests/PWA/browser-smoke.mjs
```

## ネイティブ版について

SwiftUI Multiplatform版も作成済みですが、現在はMacの容量不足でXcode導入を保留しています。iPhoneだけで使う方針では、PWA版を先に進めるのが最短です。
