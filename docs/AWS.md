# AWS などの Linux のサーバーで CCP を動かす(手順書)

AWS 版の ZIP を受け取って、サーバーで CCP を立ち上げる・更新するための手順です。
仕組みは、どの置き先でも同じです。サーバー(FastAPI)が PostgreSQL につなぎ、BigQuery からデータを取り込み、Vertex AI の Gemini(または AI の出口の層)を呼びます。置き先の違いは、設定だけで吸収します([ARCHITECTURE.md](ARCHITECTURE.md) の 0.5 章)。

- この版の名前は、ZIP の中の `VERSION.txt` にあります。
- くわしい手順(1 つずつのコマンドの意味)と、よくあるつまずきは [WORKBENCH.md](WORKBENCH.md) にあります。そこで「Workbench」と書いてある所は、**CCP を動かしているサーバー**と読み替えてください。Jupyter の中継(`/proxy/…`)と、conda で入れた PostgreSQL の話は、AWS では関係ありません。
- **めったにしない作業なので、覚えていなくても済むようにしてあります。** 足りない物は、`scripts/workbench.sh setup` と `python -m ccp.cli check`(画面では ⚙ →「設定の状態」)が教えます。上から順に進め、`[NG]` の行の → を直してください。

## 1. 全体の流れ

1. CCP の外で、サーバー・PostgreSQL・Google の認証情報・入口(HTTPS とログイン)を用意する(2 章)
2. ZIP を利用先の Git に入れ、サーバーで取得する(3.1)
3. `scripts/workbench.sh setup` → 設定ファイルを書く → `check`(3.2〜3.4)
4. `scripts/workbench.sh start` で起動し、入口の URL で画面を開く(3.5)
5. ⚙ の「設定の状態」で、全部の行が「済み」になったのを見る(3.6)
6. 新しい版が届いたら、`scripts/workbench.sh update`(4 章)

## 2. 用意するもの(CCP の外で、サーバーを立てる人の作業)

| もの | 条件 | 忘れたとき、どこで気づけるか |
|---|---|---|
| Linux のサーバー | Python 3.12 以上・Node.js 20.19 以上(または 22.12 以上)・Git・curl | `scripts/workbench.sh setup` が、足りない物を出して止まる |
| PostgreSQL | 同じ機械か、マネージドの DB(RDS など)。CCP 用の DB とユーザーを 1 つ。PostgreSQL 16 で動かしている | `check` の DB の行が `[NG]`。画面は「データベースにつながりません」 |
| Google の認証情報 | BigQuery を読む(「BigQuery データ閲覧者」「BigQuery ジョブユーザー」)と、Vertex AI を使う(「Vertex AI ユーザー」)権限のあるサービスアカウント。渡し方は下の表 | `check` の BigQuery・AI の行が `[NG]` |
| 秘密の置き場所 | DB のパスワード・画面のパスワード・AI の出口の合言葉など(Secrets Manager など)。サーバーには、`server/workbench.env` か環境変数で渡す | `check` の該当の行 |
| 入口 | ロードバランサーなどで、**HTTPS** と**ログイン**(画面のパスワード `APP_PASSWORD`、または手前の認証)を付ける | 3.5 の「外から開けるか」の確かめ |
| パッケージの取得 | `npm ci` と `pip install` が、npm・PyPI(または社内のミラー)に届く | `setup` の途中で止まる |

**Google の認証情報の渡し方**(AWS の機械には、Google のサービスアカウントが付いていないため)。CCP は、その機械の標準の方法(`google.auth.default`)で Google に入るので、どちらでも動きます。

| 方法 | やり方 | 向いているとき |
|---|---|---|
| ① 鍵なしのつなぎ(Workload Identity 連携) | Google Cloud 側で AWS のロールを信頼する設定を作り、その設定のファイルを `GOOGLE_APPLICATION_CREDENTIALS` に書く | 鍵を置きたくないとき(おすすめ) |
| ② サービスアカウントの鍵のファイル | 鍵のファイルを秘密の置き場所から置き、`GOOGLE_APPLICATION_CREDENTIALS=<鍵ファイルの絶対パス>` | すぐ試したいとき |

- BigQuery から AWS へ読み出すと、Google Cloud の外への通信料がかかります(行数が数千なので、ほとんど気にしなくてよい額)。
- サーバーは、外に出られる前提です。商品ページを読む・URL の画像から選ぶ機能は、そのまま動きます([WORKBENCH.md](WORKBENCH.md) の 6 章の試しは要りません)。

## 3. 初回の立ち上げ

### 3.1 リポジトリを取得する

ZIP を利用先の Git に入れ(`CCP AWS 版 <版>` でコミット)、サーバーで取得します。

```bash
git clone <利用先の Git の URL> ~/ccp
cd ~/ccp
```

### 3.2 準備する

```bash
scripts/workbench.sh setup
```

Python の環境(`server/.venv`)・パッケージ・画面のビルド(`dist-gcp/`)を作り、設定ファイル `server/workbench.env` を見本からコピーします。足りない物があれば、ここで止まって教えます。

### 3.3 設定を書く

`server/workbench.env` を開き、`<…>` をその環境の値にします(見本の説明は `server/workbench.env.example` の中。一覧は [WORKBENCH.md](WORKBENCH.md) の付録 A)。AWS で書くのは、主に次の行です。

| 環境変数 | 中身 |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://<ユーザー>:<パスワード>@<ホスト>:5432/<DB の名前>`(RDS ならそのつなぎ先) |
| `GOOGLE_CLOUD_PROJECT` / `GOOGLE_CLOUD_LOCATION` | Vertex AI のプロジェクトと場所(既定 `global`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | 2 章の ① か ② のファイルの絶対パス |
| `APP_PASSWORD` | 画面のパスワード。**手前に別のログインを置かないなら、必ず書く** |
| `CCP_HOST` | 受け付けるアドレス。ロードバランサーが別の機械なら `0.0.0.0`(既定 `127.0.0.1` は、この機械の中からだけ) |
| `CCP_PORT` | サーバーのポート(既定 8082) |
| `ASSET_DIR` | 写真のフォルダ(絶対パス) |

BigQuery の表の場所・AI のモデルなど、仕事の設定は、起動したあとに画面の ⚙ で入れます(DB に持つ)。

### 3.4 確かめる

```bash
scripts/workbench.sh check
```

設定・DB への接続・BigQuery・AI・画面のビルドを確かめます(パスワードは出さず、何も変えません)。`[NG]` の行の → を直して、もう一度流します。

### 3.5 起動して、画面を開く

```bash
scripts/workbench.sh start
scripts/workbench.sh status
```

- 入口(ロードバランサーなど)の URL で画面を開きます。CCP は置かれた場所に合わせて動くので、パスの設定は要りません。
- **外から開ける入口なら、HTTPS とログインが付いているかを、ログインしていないブラウザで必ず確かめます**(パスワードを聞かれずに画面が出たら、すぐ止めて `APP_PASSWORD` か手前の認証を付ける)。
- 開けないときは、`scripts/workbench.sh log` でサーバーのログを見ます。ロードバランサーから届かないときは、`CCP_HOST` とポート・セキュリティグループを確かめます。

### 3.6 画面の案内に従う

- 設定が足りなければ、画面に「初期設定」が出ます。上から順に入れます(「つながるか確認」が通らないと、次へ進めない。途中でやめても、続きから始まる)。
- ほかのリージョンの設定を使い回すなら、そのサーバーの ⚙ から「設定の型」を書き出し、初期設定の画面で読み込みます(秘密と DB のつなぎ先は入らない。リージョンで変わる所には印が付く)。
- 最後に、⚙ の「設定の状態」(健康診断)で、全部の行が「済み」になったのを見ます。

(初期設定の画面は、作っている途中です。できるまでは、3.3 のファイルと 3.4 の `check` で進めます)

## 4. 更新の手順(新しい版が届いたとき)

1. 新しい版の ZIP を、利用先の Git に入れる(`CCP AWS 版 <版>` でコミット)。
2. サーバーで:

   ```bash
   cd ~/ccp
   scripts/workbench.sh update    # git pull → パッケージ・画面のビルド → サーバーを起動し直す
   scripts/workbench.sh status    # いまの版が出る
   scripts/workbench.sh check     # 新しい版で足りなくなった設定があれば、ここで出る
   ```

- サーバーを 2 台以上で動かすときは、1 台ずつ更新します。
- 新しい版で足す設定があれば、`check` と ⚙ の「設定の状態」が、足りない行として教えます(版ごとの変更を覚えておく必要はありません)。

## 5. 困ったとき

1. `scripts/workbench.sh check`(または ⚙ →「設定の状態」)の `[NG]` の行を見る。
2. `scripts/workbench.sh log` で、サーバーのログの最後を見る。
3. [WORKBENCH.md](WORKBENCH.md) の 5 章「よくあるつまずき」の表を見る。
4. それでも直らなければ、`check` の出力とログの最後を、開発の担当に伝える(**サーバーの上でコードを直さない**。次の版で上書きされる)。
