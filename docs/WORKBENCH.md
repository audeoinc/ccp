# 移行の手順書: Vertex AI Workbench で CCP を動かす

CCP(配信コンテンツプランナー)を、利用先の **Vertex AI Workbench**(Agent Platform の Workbench)で動かし、
本番と同じ**配信のデータ**と**商品・メイン画像の写真**を持ち込むための手順書です。

- 最終更新: 2026-10-20(既定のポートを 8082 に。BigQuery・販売順位・指標のコマンドと設定を足した)
- 対象: Workbench で CCP を立ち上げる・更新する人
- 関係する文書: [WORKBENCH_ARCHITECTURE.md](WORKBENCH_ARCHITECTURE.md)(Workbench での構成の解説・構成図)<!-- hosted:begin -->、[UPDATE.md](UPDATE.md)(新しい版の受け取り方)、[GCP.md](GCP.md)(サーバー・DB・AI の全体)、[HANDOVER.md](HANDOVER.md)(開発の現在地)<!-- hosted:end -->

---

## 1. 全体の流れ

Workbench のサーバーからは外(本番の DB・画像の置き場所)にアクセスできません。
そこで、**コードは Git で**、**データと写真は「引っ越し用のパック」(1 つの ZIP)で、ブラウザ経由で**持ち込みます。

```
 本番の CCP                               利用先の環境
 ┌──────────────────┐   ブラウザで ZIP を     ┌────────────────────────────┐
 │ 画面 ⚙ →          │   ダウンロード          │ Workbench(Jupyter)          │
 │「データと画像を    │ ──────────────────▶ │  ① アップロード               │
 │  書き出す」        │   ccp-pack-…zip       │  ② import-pack で取り込む     │
 └──────────────────┘                       │  ③ サーバーを起動(8082)      │
                                             │  ④ /proxy/8082/ で開く        │
 利用先の Git(版ごとの ZIP)─ clone / pull ▶│                              │
                                             └────────────────────────────┘
```

| 持ち込むもの | 方法 | いつ |
|---|---|---|
| コード(画面・サーバー) | 版ごとの ZIP を利用先の Git に入れ、`git clone` / `git pull`<!-- hosted:begin -->([UPDATE.md](UPDATE.md))<!-- hosted:end --> | 最初と、新しい版が届いたとき |
| データ(配信・商品・結果 など、すべてのテーブル)と写真 | 引っ越し用のパック(ZIP) | 最初と、本番のデータにそろえたいとき |

> **注意:** パックの取り込みは、Workbench 側の DB の中身を**すべて置き換えます**。Workbench で入力したデータは消えます。

---

## 1.5 スクリプトで行う(おすすめ)

よく使う操作は、`scripts/workbench.sh` にまとめてあります。設定(`server/workbench.env`)を毎回自分で読み込み、サーバーを裏で動かし続けるので、
「設定を読み込んだターミナルで起動する」などを気にしなくて済みます。以下の 3〜4 章の手作業は、スクリプトの中で行っていることです。

**すでに CCP を動かしている Workbench で、はじめてスクリプトを使うとき**(スクリプトは 2026-10-15 に足したので、まずそれを取り込む):

```bash
cd ~/ccp
git pull                       # スクリプトを取り込む(この 1 回だけ、手で)
scripts/workbench.sh stop      # 手で起動したサーバーが残っていれば止める(なければ「動いていません」と出る)
scripts/workbench.sh update    # 以後は、これだけで「最新にして起動し直す」
```

手で起動したサーバーが、ほかのターミナルで動いたままなら、そのターミナルで Ctrl+C で止めてから `update` します(同じポートで、2 つは動かせないため)。

**新しい Workbench で、はじめから立ち上げるとき**(3.1 の `git clone` のあと):

```bash
cd ~/ccp
scripts/workbench.sh setup     # Python の環境・パッケージ・画面のビルド・設定ファイル(workbench.env)の用意
#   → server/workbench.env の <…> を書き換える(DB・AI を設定済みなら、その行は # でコメントアウト)
scripts/workbench.sh check     # 設定・DB への接続・写真・画面のビルドを確かめる
scripts/workbench.sh start     # サーバーを起動(ターミナルを閉じても止まらない)
```

| やりたいこと | コマンド |
|---|---|
| **コードを最新にして、起動し直す**(新しい版が入ったとき。いちばんよく使う) | `scripts/workbench.sh update` |
| 本番のデータと写真を取り込む(中身を見せて、確認してから。DB は置き換わる) | `scripts/workbench.sh import server/ccp-pack-<日時>.zip` |
| 本番で作ったものを**足すだけ**(Workbench の中身は変えない・消さない。まだない行・ファイルだけを足す) | `scripts/workbench.sh import --add server/ccp-pack-<日時>.zip` |
| 起動 / 停止 / 起動し直し | `scripts/workbench.sh start` / `stop` / `restart` |
| 動いているか(サーバー・PostgreSQL・コードの版) | `scripts/workbench.sh status` |
| PostgreSQL だけを起動する(Workbench の中の PostgreSQL。`start`・`update`・`restart` でも、止まっていれば自動で起動する) | `scripts/workbench.sh pg-start` |
| サーバーのログの最後を見る | `scripts/workbench.sh log` |
| 設定の確認 | `scripts/workbench.sh check` |

BigQuery・指標のコマンド(`cd ~/ccp/server` で、`.venv/bin/python -m ccp.cli …`):

| やりたいこと | コマンド |
|---|---|
| BigQuery の出力を、値まで確かめる(何も変えない) | `bq-check` |
| 手元の PC で集めた商品ページの画像を取り込む([PRODUCT_IMAGES.md](PRODUCT_IMAGES.md)) | `import-images <ZIP> [--yes]` | <!-- hosted -->
| 商品・カテゴリの週の指標を取り込む(CSV) | `import-metrics <CSV> [--yes]` |
| BigQuery の販売順位がないとき、結果の画面の「販売チャネルごとの順位」のダミーを作る | `ranking-dummy [--yes]` |

画面からは、⚙ の「BigQuery から取り込む」「商品・カテゴリの指標を取り込む(CSV)」でも行えます。

- `update` は、`git pull --ff-only`(Workbench でコードを直していると止まる<!-- hosted:begin -->。直さない約束は [UPDATE.md](UPDATE.md)<!-- hosted:end -->)→ (`requirements.txt` が変わったときだけ)`pip install` → (`package-lock.json` が変わったときだけ)`npm ci` → `npm run build` → 停止 → 起動、の順に行います。
- ポートは `CCP_PORT`(既定 8082。**2026-10-19 に 8081 から変えた**。前の版で動かしていた Workbench は、`update` のあと画面の URL が `/proxy/8082/` になる。**8081 のまま使い続けるなら、`server/workbench.env` に `CCP_PORT=8081` と書く**(コマンドの前に `CCP_PORT=8081` を付けてもよい))、Python の場所は `CCP_PYTHON`(既定 `server/.venv/bin/python`)で変えられます。
- `ASSET_DIR` を設定していなくても、`server/images` があれば、そこから写真を配ります。
- `Permission denied` と出たら、`bash scripts/workbench.sh …` のように `bash` を付けて実行します。

## 2. 用意するもの

| もの | 条件 | 確かめ方 |
|---|---|---|
| Workbench のインスタンス | ターミナルが使える | Jupyter の「ターミナル」を開ける |
| Node.js | **20.19 以上**(または 22.12 以上)。画面のビルドに使う | `node -v` |
| Python | **3.12 以上**を推奨(本番は 3.12) | `python3 --version` |
| Git | 利用先の Git のリポジトリ(CCP の版を入れたもの<!-- hosted:begin -->。[UPDATE.md](UPDATE.md)<!-- hosted:end -->)を取得できる | `git --version` |
| PostgreSQL | **利用先の環境は PostgreSQL に直接つなぐ**(Workbench の上や、同じネットワークのサーバー)。CCP 用の DB を 1 つ(本番は PostgreSQL 16) | `psql --version`、または DB の管理者に確認 |
| 権限(Workbench のサービスアカウント) | AI を使うなら「**Vertex AI ユーザー**」。BigQuery から取り込むなら「**BigQuery データ閲覧者**」「**BigQuery ジョブユーザー**」も | IAM の画面 |
| ブラウザ | 利用先の環境から、本番の CCP の画面を開ける | 本番の URL を開く |

> **パッケージの取得について:** 手順の `npm ci` と `pip install` は、パッケージをインターネット(npm・PyPI、または社内のミラー)から取ります。
> 取れない環境では、取れる環境で用意したもの(ビルド済みの `dist-gcp/` や、Python のパッケージ)を持ち込む必要があります。そのときは開発担当に相談してください。

---

## 3. 初回の立ち上げ

以下のコマンドは、Workbench の**ターミナル**で実行します(Linux なので、Python は `.venv/bin/python`)。

### 3.1 リポジトリを取得する(または最新にする)

**まだ取得していない**とき:

```bash
cd ~
git clone <利用先のリポジトリの URL> ccp
cd ccp
```

**前に clone したことがある**とき(以前に動かしていた環境など)は、必ず最新にしてから進めます。<!-- hosted:begin -->取得元が利用先のリポジトリでないときは、先に [UPDATE.md](UPDATE.md) の「取得元を切り替える」を行います。<!-- hosted:end -->
この手順書と、設定の見本(`server/workbench.env.example`)、引っ越し用のパックの取り込み(`import-pack`)は、2026-10-15 に足したものなので、
古いままだと、ファイルやコマンドが見つからずに止まります。

```bash
cd ~/ccp
git pull
ls server/workbench.env.example docs/WORKBENCH.md    # 2 つのファイル名が出れば OK
```

最新にしたら、3.2 の画面のビルドも、やり直します(新しい機能が画面に入るように)。

### 3.2 画面をビルドする

```bash
npm ci
npm run build      # dist-gcp/ ができる(1〜2 分)
```

### 3.3 サーバーの Python 環境を作る

```bash
cd ~/ccp/server
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

### 3.4 接続の設定を書く

設定の見本 `server/workbench.env.example` をコピーして、`<…>` をその環境の値に書き換えます。

```bash
cd ~/ccp/server
cp workbench.env.example workbench.env
nano workbench.env     # または Jupyter のエディタで開く
```

> `workbench.env.example` が見つからない(`No such file or directory`)ときは、リポジトリが古いままです。3.1 の `git pull` をしてください。

主な設定(全部は [付録 A](#付録-a-環境変数の一覧)):

| 設定 | 中身 |
|---|---|
| `DATABASE_URL` | **PostgreSQL の接続先**(利用先の環境はこちら)。`postgresql+asyncpg://<ユーザー>:<パスワード>@<ホスト>:5432/<DB の名前>` |
| `GOOGLE_CLOUD_PROJECT` | AI(Vertex AI)を使うプロジェクト |
| `ASSET_DIR` | 写真を置くフォルダ。`/home/jupyter/ccp/server/images` のような**絶対パス** |

> `workbench.env` にはパスワードが入るので、Git には入れません(`.gitignore` 済み)。

#### すでに DB・AI の環境変数を設定してある Workbench のとき

DB(PostgreSQL)と AI(Gemini)の環境変数を、Workbench にすでに設定してあるなら、`workbench.env` の **DB と AI の行は、コメントアウト(先頭に `#`)するか消します**。
`<…>` が残った行を読み込むと、設定済みの正しい値が、書きかけの値で**上書き**されてしまうためです。その場合、`workbench.env` に残すのは、写真のフォルダ(`ASSET_DIR`)だけで足ります。

```bash
ASSET_DIR=/home/jupyter/ccp/server/images    # 実際のパスに合わせる
```

ただし、設定済みの変数の**名前**が、CCP の読む名前と同じであることが条件です。

| 用途 | CCP が読む名前 |
|---|---|
| DB | `DATABASE_URL` |
| AI | `GOOGLE_CLOUD_PROJECT`(必須)、`GOOGLE_CLOUD_LOCATION`(省略時 `global`)、`GEMINI_MODEL`(省略時 `gemini-3.5-flash`) |

CCP は、Gemini を **Vertex AI の形**(Workbench のサービスアカウントの権限)で呼びます。Gemini の **API キー**(`GEMINI_API_KEY` など)では動かないので、その形で接続しているときは、`GOOGLE_CLOUD_PROJECT` の設定と、Vertex AI の権限が別に要ります。

名前を確かめるコマンド(パスワードの一部が画面に出るので、人に見せない):

```bash
env | grep -E "^(DATABASE_URL|GOOGLE_CLOUD_|GEMINI_)" | cut -c1-40
```
>
> **`DATABASE_URL` の書き方の注意:** 先頭は `postgresql+asyncpg://`(`postgresql://` だけでは動きません)。パスワードに `@` `:` `/` `#` などの記号があるときは、URL の形に置き換えます(例: `@` → `%40`、`#` → `%23`)。値は `'…'` で囲みます(`$` や `&` を、シェルが別の意味に読まないように)。

設定を書いたら、DB につながるかを確かめます(`[NG]` がなければ OK。写真・画面の `[NG]` は、このあとの手順で直るので、この時点では気にしない)。

```bash
set -a; source workbench.env; set +a
.venv/bin/python -m ccp.cli check
```

#### PostgreSQL を Workbench の中に入れたとき(conda など)

PostgreSQL は Workbench 自身の上で動くので、`DATABASE_URL` のホストは **`localhost`** です。

```bash
DATABASE_URL='postgresql+asyncpg://<ユーザー>:<パスワード>@localhost:5432/<DB の名前>'
```

PostgreSQL が動いているかは、conda の環境を有効にしたターミナルで確かめます(`accepting connections` なら動いている)。
Workbench を止めて起動し直したあとは、PostgreSQL は自動では起動しないことがあります。`scripts/workbench.sh start`(`update`・`restart` も)は、`DATABASE_URL` のホストが `localhost` なら、サーバーの前に PostgreSQL を確かめ、止まっていれば `pg_ctl` で起動します(PostgreSQL だけなら `scripts/workbench.sh pg-start`。ログは `server/postgres.log`)。データのフォルダと `pg_ctl` の場所は、`workbench.env` の `CCP_PGDATA`・`CCP_PG_BIN` に書いておくと確実です(書かなければ、ホームの下と conda の環境から探します)。

```bash
pg_isready -h localhost -p 5432
```

#### (DB がまだないとき)CCP 用の DB を作る

PostgreSQL の管理者のユーザーで、CCP 用のユーザーと DB を作ります(DB の管理者が別にいるときは、依頼してください)。

```bash
psql -h <ホスト> -U postgres -c "CREATE USER ccp_app WITH PASSWORD '<パスワード>';"
psql -h <ホスト> -U postgres -c "CREATE DATABASE ccp OWNER ccp_app;"
```

テーブルは、3.7 の取り込みのときに自動で作られます。

### 3.5 本番のデータと写真を書き出す(ブラウザ)

1. 利用先の環境のブラウザで、本番の CCP の画面を開きます。
2. 右上の **⚙** →「**データと画像を書き出す(別の環境へ移す)**」を押します。
3. `ccp-pack-<日時>.zip` がダウンロードされます(2026-10 時点で約 4MB。10 秒ほど)。

### 3.6 パックを Workbench に上げる

Jupyter の画面(左のファイルの一覧)で、`ccp/server/` を開き、「**アップロード**」(上向きの矢印)で ZIP を置きます。

### 3.7 パックを取り込む

```bash
cd ~/ccp/server
set -a; source workbench.env; set +a

# まず、中身の確認だけ(何も変えない)
.venv/bin/python -m ccp.cli import-pack ccp-pack-<日時>.zip

# 置き換える(テーブルがなければ作り、DB の中身を置き換え、写真を server/images に展開する)
.venv/bin/python -m ccp.cli import-pack ccp-pack-<日時>.zip --yes
```

うまくいくと、テーブルごとの件数と「取り込みました」が出ます。

> **`images` のフォルダは、作らなくてよい:** `--yes` を付けた取り込みのときに、`server/images/products/` と `server/images/heroes/` が自動で作られ、写真が入ります(すでにあれば、上書きします)。`--yes` なしの「確認だけ」のときは、何も作りません。
> 別の場所に展開したいときは、`--images <フォルダ>` を付けます(そのときは `ASSET_DIR` も同じフォルダにする)。

**Workbench の中身を残したまま、本番で作ったものだけを足すとき(足すだけの取り込み)**: `--add` を付けます。

```bash
# 確認だけ(何も変えない)
.venv/bin/python -m ccp.cli import-pack ccp-pack-<日時>.zip --add
# 足す
.venv/bin/python -m ccp.cli import-pack ccp-pack-<日時>.zip --add --yes
```

- Workbench に**まだない行**(配信・素材・やり取りなど。行の ID で見ます)だけを足します。すでにある行は、中身が違っても**変えません**。消すこともしません。
- 写真・素材のファイルも、まだないものだけを置きます(すでにあるファイルは上書きしません)。
- 参照先がない行(例: Workbench にない商品へのやり取り)は、その行だけ足さずに進め、数を出します。
- 本番で作った見本(素材など)を、Workbench で作業した内容を消さずに持ち込むときに使います。

### 3.8 サーバーを起動する

```bash
cd ~/ccp/server
set -a; source workbench.env; set +a
.venv/bin/python -m uvicorn ccp.main:app --port 8082
```

`Uvicorn running on http://127.0.0.1:8082` と出たら起動しています。**このターミナルは閉じない**でください(閉じるとサーバーが止まります)。
ターミナルを閉じても動かし続けたいときは:

```bash
nohup .venv/bin/python -m uvicorn ccp.main:app --port 8082 > ~/ccp-server.log 2>&1 &
# 止めるとき: pkill -f "uvicorn ccp.main:app"
```

### 3.9 画面を開いて確かめる

ブラウザで次を開きます(**末尾の `/` を必ず付ける**)。

```
https://<ノートブックの URL>/proxy/8082/
```

確認すること:

- [ ] カレンダーに配信が出る(本番と同じ件数。ツールバーの右の「◯ / ◯ 件」)
- [ ] 週の表示・配信カードで、**写真**が出る(イラストではない)
- [ ] 「結果」の面で、配信の結果とヒートマップが出る
- [ ] 配信カードの「すべて AI で下書き」が動く(AI を使うとき)

---

## 4. 更新の手順(新しい版が届いたとき)

### 4.1 コードを最新にする

スクリプトなら `scripts/workbench.sh update` の 1 行です(下は、その中身)。

```bash
cd ~/ccp
git pull
npm ci                       # パッケージが変わったときに必要。毎回でもよい
npm run build
cd server
.venv/bin/python -m pip install -r requirements.txt    # requirements.txt が変わったときだけ
# サーバーを止めて(Ctrl+C か pkill)、3.8 と同じ手順で起動し直す
```

新しい列・テーブルは、サーバーの起動後、最初に DB につないだときに自動で足されます(手で `migrate` しなくてよい)。

設定の見本(`server/workbench.env.example`)に新しい行が増えても、`server/workbench.env` には自動では入りません(`workbench.env` は Git の外)。版のあとに `diff server/workbench.env.example server/workbench.env` で見比べ、要る行を写してから `scripts/workbench.sh restart` します。

### 4.2 データと写真を、本番にそろえる

3.5〜3.8 を繰り返します(書き出す → 上げる → `import-pack --yes` → 起動し直す)。スクリプトなら、ZIP を上げたあと `scripts/workbench.sh import server/ccp-pack-<日時>.zip`(確認してから取り込み、起動し直す)。
**Workbench 側で入力したデータは消える**ので、残したいものがないか確かめてから行います。

> コードとデータは、なるべく**同じ時期のもの**にそろえます。本番より古いコードで新しいパックを取り込むと、知らない列があって取り込みが止まることがあります(先に 4.1 でコードを最新にする)。

---

## 5. よくあるつまずき

| 症状 | 原因 | 直し方 |
|---|---|---|
| 写真の代わりに**イラスト**が出る | パックを取り込んでいない(初期データの `seed` のまま)/ `ASSET_DIR` を付けずに起動した | 3.7 の取り込み、3.8 で `workbench.env` を読み込んでから起動 |
| 写真の場所が**灰色の枠**のまま | `ASSET_DIR` のパスが違う(相対パス・フォルダ違い) | `ls $ASSET_DIR/products | head` で写真があるか確かめる。絶対パスにする |
| 画面が**真っ白**、または API が 404 | URL の末尾の `/` がない | `…/proxy/8082/` のように `/` を付ける |
| 画面に「**データベースにつながりません**」(以前の版では「データベースを起動しています」のまま進まない) | **サーバーを起動したターミナル**に、DB の設定が読み込まれていない(`check` を実行したターミナルとは別のターミナルで起動した、`conda activate` していない など)。画面の赤い文字が、つながらない理由 | サーバーを止め、**同じターミナルで** `set -a; source workbench.env; set +a`(必要なら `conda activate`)→ `check` → 起動 の順に実行する。サーバーのターミナルにも「DB につながりません: …」と理由が出る |
| `socket.gaierror: Name or service not known` | 接続先のホスト名が引けない。① `workbench.env` の見本の行(`<ホスト>`)が、設定済みの `DATABASE_URL` を上書きした ② パスワードの `@` を `%40` にしていない(`@` の後ろがホスト名と読まれる) | 設定済みなら、`workbench.env` の DB の行をコメントアウトし、**新しいターミナル**でやり直す。Workbench の中の PostgreSQL なら、ホストは `localhost`。CCP が読んでいるホストは、`.venv/bin/python -m ccp.cli check` で表示する(下の「動かす前の確認」) |
| `workbench.env: No such file or directory` | ① リポジトリが古く、見本(`workbench.env.example`)がない ② 見本から `workbench.env` をコピーしていない ③ `~/ccp/server` 以外の場所で実行した ④ ファイル名の綴りの違い(work**bench**)、Jupyter で作って `workbench.env.txt` になった | `cd ~/ccp && git pull` → `cd server && cp workbench.env.example workbench.env`。`ls -la ~/ccp/server \| grep -i workbench` で、ファイルの名前と場所を確かめる |
| 画面やサーバーのログに「設定がありません: 'DATABASE_URL'」 | 設定を読み込んでいない | 同じターミナルで `set -a; source workbench.env; set +a` を実行してから起動 |
| 画面が「準備中」のまま・DB につながらない | `DATABASE_URL` の間違い(先頭が `postgresql+asyncpg://` でない、パスワードの記号を置き換えていない、ホスト・ポート・DB 名の違い)、PostgreSQL が外からの接続を受け付けていない | `.venv/bin/python -m ccp.cli check` で確かめる。ほかのサーバーの PostgreSQL なら、`pg_hba.conf` などで Workbench からの接続が許されているかを、DB の管理者に確認 |
| AI のボタンでエラーになる | `GOOGLE_CLOUD_PROJECT` の間違い、Vertex AI の権限不足、モデル名がその環境で使えない | 設定と権限を確かめる。`GEMINI_MODEL` をその環境で使えるモデルに変える |
| `import-pack` で「形式に対応していません」 | パックが新しく、コードが古い | 4.1 でコードを最新にしてから取り込む |
| `npm ci` / `pip install` が止まる | パッケージの取得先(インターネット)にアクセスできない | 2 の「パッケージの取得について」 |
| 8082 が使えない(`address already in use`) | 前に起動したサーバーが残っている | `pkill -f "uvicorn ccp.main:app"` で止めてから起動 |
| 商品の「この配信で使う画像」で「ページを読めませんでした」 | 本物の商品ページは、CCP のサーバーが読みに行く。Workbench は外に出られない | 画像をコピーして貼る・ファイルを上げる、で選ぶ。読めるようにできるかは 6 章で試す |

---

### 動かす前の確認(`check`)

設定・DB への接続・写真・画面のビルドを、まとめて確かめるコマンドです。パスワードは表示せず、何も変えません。困ったときは、まずこれを実行し、`[NG]` の行を直します。

```bash
cd ~/ccp/server
set -a; source workbench.env; set +a
.venv/bin/python -m ccp.cli check
```

出力の例(問題がないとき):

```
■ DB
  [OK  ] 接続先: DATABASE_URL(scheme=postgresql+asyncpg host=localhost port=5432 db=ccp user=ccp_app)
  [OK  ] ホスト localhost → 127.0.0.1
  [OK  ] つながりました(PostgreSQL 16.x …)。テーブル 32 個、配信カード 83 件
■ AI(Vertex AI の Gemini)
  [OK  ] GOOGLE_CLOUD_PROJECT=… / GOOGLE_CLOUD_LOCATION=global / GEMINI_MODEL=…
■ 写真
  [OK  ] ASSET_DIR=/home/jupyter/ccp/server/images(商品 100 点・メイン画像 42 点)
■ 画面
  [OK  ] ビルドがあります(/home/jupyter/ccp/dist-gcp)
■ BigQuery(利用先の本番のデータ)
  [注意] BQ_SPU などの設定がありません(BigQuery から取り込まない)
■ その他
  [注意] APP_PASSWORD なし(画面にパスワードをかけない)
```

BigQuery を使わないなら、「■ BigQuery」の [注意] はそのままでかまいません。

主な `[NG]` と直し方:

| 表示 | 直し方 |
|---|---|
| `DATABASE_URL に @ が 2 つ以上あります` / `ホスト ss@localhost が見つかりません` | パスワードの中の `@` を `%40` に置き換える |
| `接続先の設定がありません` | `DATABASE_URL` を設定する(設定済みのはずなら、変数の名前を確かめる) |
| `ConnectionRefusedError` | PostgreSQL が止まっている、ポートが違う。`pg_isready -h localhost -p 5432` |
| `password authentication failed` | ユーザー名・パスワードの違い |
| `database "…" does not exist` | DB の名前の違い、まだ作っていない(3.4 の「CCP 用の DB を作る」) |
| `ASSET_DIR=… に写真がありません` | 3.7 の `import-pack … --yes` をする。`ASSET_DIR` を展開先と同じにする |
| `ビルドがありません` | リポジトリのルートで `npm ci` → `npm run build` |

## 6. 商品ページを読めるかを試す(商品ページから画像を選ぶ)

配信カードの商品の「この配信で使う画像」では、商品ページの URL を読み、そのページの画像を候補に並べて、AI が配信に合う画像を勧めます(バックログ X64)。
この節は、**利用先の本物の商品ページを、Workbench から読めるか**を試す手順です。結果を開発の担当に伝えると、Workbench で使える読み方に作り足すかを決められます。

### 6.1 いまの作り(どこで読んでいるか)

商品ページと画像を読むのは、**CCP のサーバー自身**です(Gemini の「URL を読む機能」は、いまは使っていません)。

| 画面の操作 | サーバーの窓口 | 何を読むか | Workbench では |
|---|---|---|---|
| 「ページを読む」(画像の候補を並べる) | `POST /api/product-pages/images` | 商品ページの HTML(サーバーが HTTP で取りに行き、`<img>` などから画像を拾う) | **外に出られないので失敗する**(「ページを読めませんでした」) |
| 「AI に選んでもらう」 | `POST /api/product-pages/suggest` | 候補の画像そのもの(サーバーが取りに行き、Gemini に画像として渡す。Gemini は `/api/ask` と同じく Vertex AI の Gemini) | 外の画像は**失敗する**。CCP の中にある画像(`/img/products/…`)は読める |
| 「この画像を使う」 | `POST /api/product-pages/adopt` | 選んだ画像(サーバーが取りに行き、CCP の素材の置き場所に写す) | 外の画像は**失敗する** |

- サーバーが外を読むときは、安全のため、URL のホスト名を**Workbench の中で名前解決**し、公開のアドレスだけを読みます。名前解決ができない環境では、ここで止まります(プロキシがあっても、この確かめで止まる)。
- 見本の EC サイト(`https://shop.example.com/p/<商品コード>` と `/sample-shop/`)は、通信せずに CCP の中で作るので、Workbench でも最後まで動きます。止まるのは本物の URL だけです。

そこで、次の 2 つを試します。**A** は「いまの作りのまま、外に出られるか」、**B** は「Gemini の URL を読む機能(URL context)なら読めるか」です。B は、ページを読むのが Google の側なので、Workbench から外に出られなくても、Vertex AI に届けば動く見込みがあります。

### 6.2 用意

- 試す商品ページの URL を 1 つ決める(利用先の EC サイトの、ふつうの商品ページ。ログインの要らないもの)。以下では `<商品ページの URL>` と書きます。
- Workbench の**ターミナル**で、CCP のフォルダに入り、設定を読み込む(AI の設定 `GOOGLE_CLOUD_PROJECT` などを使うため):

```bash
cd ~/ccp/server
set -a; source workbench.env; set +a
```

### 6.3 試し A: Workbench から外に出られるか

```bash
# プロキシの設定があるか(あれば、名前と値の先頭だけ出る)
env | grep -i -E '^(https?|no)_proxy=' | cut -c1-40
# 名前解決ができるか
getent hosts <商品ページのホスト名>
# ページを取れるか(最後に HTTP の番号が出る)
curl -sS -m 10 -o /dev/null -w '%{http_code}\n' '<商品ページの URL>'
```

| 結果 | 意味 |
|---|---|
| `getent` が何も出さない、`curl` が `Could not resolve host` | 名前解決ができない。**いまの作りでは読めない**(B を試す) |
| `curl` が `Connection timed out` / `Failed to connect` | 外に出られない。**いまの作りでは読めない**(B を試す) |
| プロキシがあり、`curl` が `200` | プロキシ経由なら外に出られる。ただし、いまの作りは名前解決で止まるので、**開発の担当に「プロキシあり・名前解決なし/あり」を伝える**(作りを直せば読める見込み) |
| プロキシなしで `200` | 外に出られる。CCP の画面の「ページを読む」も動くはず(動かなければ、画面の赤い文字をそのまま伝える) |

CCP のサーバーが動いているなら、サーバーの窓口でも同じことを確かめられます(画面のパスワード `APP_PASSWORD` を設定していれば `-u :<パスワード>` を付ける):

```bash
curl -sS -X POST "http://localhost:${CCP_PORT:-8082}/api/product-pages/images" \
  -H 'Content-Type: application/json' -d '{"url": "<商品ページの URL>"}' | head -c 600; echo
```

`"success": true` と画像の一覧が出れば読めています。`"code": "blocked"` や `"fetch_failed"` なら読めていません(続く文が理由)。

### 6.4 試し B: Gemini の URL を読む機能(URL context)が使えるか

CCP のコードは変えずに、サーバーの Python から Vertex AI の Gemini を直接呼んで試します。料金は、ふつうの AI の呼び出し 1〜2 回分です。

```bash
cd ~/ccp/server
set -a; source workbench.env; set +a
TEST_URL='<商品ページの URL>' .venv/bin/python - <<'PY'
import os
from google import genai
from google.genai import types

client = genai.Client(vertexai=True, project=os.environ["GOOGLE_CLOUD_PROJECT"],
                      location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"))
model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
url = os.environ["TEST_URL"]
prompt = (f"次の商品ページを読んで、商品名と、ページに載っている商品の画像の URL(あれば最大 10 個)を、"
          f"JSON で返してください。読めなかったら、その理由を書いてください。\n{url}")
try:
    r = client.models.generate_content(
        model=model, contents=prompt,
        config=types.GenerateContentConfig(tools=[types.Tool(url_context=types.UrlContext())]))
except Exception as e:  # 機能がない・権限がない など
    print("呼び出しに失敗:", type(e).__name__, str(e)[:500])
    raise SystemExit(1)
print("モデル:", model)
meta = r.candidates[0].url_context_metadata if r.candidates else None
for m in (meta.url_metadata if meta and meta.url_metadata else []):
    print("読んだ URL:", m.retrieved_url, "→", m.url_retrieval_status)
if not meta:
    print("url_context_metadata がありません(URL を読まずに答えた)")
print("---- 返答 ----")
print((r.text or "")[:2000])
PY
```

返答の中の画像の URL が本物かは、手元のブラウザで 1 つ開いて確かめます。

| 結果 | 意味 | 次にすること |
|---|---|---|
| `URL_RETRIEVAL_STATUS_SUCCESS`、返答に商品名と画像の URL が並ぶ | **URL context が使える**。Workbench から外に出られなくても、Google の側でページを読める | 開発の担当に「B は成功」と、出た画像の URL の数・正しさを伝える。CCP の「ページを読む」を、この機能でも読めるように作り足す判断になる |
| `URL_RETRIEVAL_STATUS_SUCCESS` だが、画像の URL が出ない・でたらめ | ページの文は読めるが、画像の URL は拾えていない(ページの作りによる) | 結果をそのまま伝える。画像の一覧は別の方法で集める道を検討する |
| `URL_RETRIEVAL_STATUS_ERROR` | Google の側からも、そのページを読めなかった(サイトが外からの読み込みを断っている、など) | 別の商品ページでも試す。同じなら、その結果を伝える |
| `URL_RETRIEVAL_STATUS_PAYWALL` / `UNSAFE` | ログインが要るページ / 安全でないと判定されたページ | ログインの要らないページで試す |
| 「呼び出しに失敗」で `INVALID_ARGUMENT` や `not supported` | そのモデル・場所では URL context が使えない | `GEMINI_MODEL` や `GOOGLE_CLOUD_LOCATION` を、URL context に対応したモデル・場所に変えて試す(変えたモデル名を伝える) |
| 「呼び出しに失敗」で `PERMISSION_DENIED` や、組織の制限(VPC Service Controls など)の文 | 組織の設定で、この機能が止められている | 利用先の GCP の管理者に確かめる。結果を伝える |
| `url_context_metadata がありません` | モデルが URL を読まずに答えた | もう一度試す。毎回なら、そのモデルで機能が効いていない |

### 6.5 Workbench で足りないもの(試しの結果と合わせて伝える)

- **ページを読む**: いまの作りは、Workbench の中から外に出る必要があります。B が成功なら、外に出なくても読めるように作り足せます(開発側の作業)。
- **AI に画像を見せる・画像を写す**: どちらも、いまはサーバーが画像を取りに行きます。B が成功しても、**画像そのものは別の取り方が要る**(外の画像の URL を、Gemini に URL のまま渡せるか、を開発側で確かめる)。
- 手で回避する方法: 画像をコピーして貼る・ファイルを上げる、でも候補にできます(画面の「ページを読めませんでした」の文にも出ます)。

伝えてほしいこと(まとめ): 試した日・モデル名(`GEMINI_MODEL`)・場所(`GOOGLE_CLOUD_LOCATION`)・A の 3 つの結果・B の `url_retrieval_status` と返答の要約(画像の URL の数・正しかったか)。**ページの URL・利用先のサイトの名前は、開発のリポジトリには書かずに**、担当に直接伝えてください。

---

## 付録 A. 環境変数の一覧

| 環境変数 | 必須 | 中身 | Workbench での値 |
|---|---|---|---|
| `DATABASE_URL` | ○ | `postgresql+asyncpg://<ユーザー>:<パスワード>@<ホスト>:5432/<DB の名前>` | **利用先の環境の PostgreSQL** |
| `GOOGLE_CLOUD_PROJECT` | AI を使うとき | Vertex AI のプロジェクト | その環境のプロジェクト |
| `GOOGLE_CLOUD_LOCATION` | — | Vertex AI の場所(既定 `global`) | `global` |
| `GEMINI_MODEL` / `GEMINI_THINKING` | — | AI のモデル・考える量 | 本番と同じなら `gemini-3.8-flash` / `low` |
| `ASSET_DIR` | 写真を出すとき | 写真のフォルダ(パックの展開先) | `<server の絶対パス>/images` |
| `APP_PASSWORD` | — | 画面のパスワード(Basic 認証)。空なら、かけない | 空でよい(中継が Google のログインで守られている) |
| `STATIC_DIR` | — | 画面のビルドの場所(既定 `<リポジトリ>/dist-gcp`) | 設定しない |
| `CCP_PORT` | — | サーバーのポート(`scripts/workbench.sh`) | 既定 8082 |
| `CCP_PYTHON` / `CCP_PGDATA` / `CCP_PG_BIN` | — | スクリプトが使う Python・Workbench の中の PostgreSQL のデータの場所・`pg_ctl` のあるフォルダ | `server/workbench.env.example` の説明のとおり |
| `BQ_PROJECT` / `BQ_SPU` / `BQ_SKU` / `BQ_SKU_STOCK` / `BQ_WEEKLY` / `BQ_FORECAST` / `BQ_RANKING` | BigQuery を使うとき | 出力の場所 `<プロジェクト>.<データセット>.<表>`(ジョブのプロジェクトは `BQ_PROJECT`)。ビューなら、更新を見る元の表を `BQ_<名前>_WATCH` に | [BIGQUERY_EXPORT.md](BIGQUERY_EXPORT.md) |
| `GOOGLE_APPLICATION_CREDENTIALS` | — | 鍵のファイルで Google に入るとき(Workbench のサービスアカウントで足りれば要らない) | 設定しない |
| `CCP_DEV_USER_EMAIL` | — | その人がログインしたことにする([APPROVAL.md](APPROVAL.md)) | 使わないなら設定しない |
| `GEMINI_CONCURRENCY` | — | Gemini への同時の呼び出しの上限(既定 4) | 設定しない |
| `CCP_DEVTOOLS` / `DEVTOOLS_MAX_GB` / `DEVTOOLS_GEMINI_MODEL` / `DEVTOOLS_THINKING` / `DEVTOOLS_PRICE_PER_TIB` | 開発用の画面を使うとき | `1` で開発用の画面(`/proxy/<ポート>/dev/`。ポートは CCP の画面と同じ `CCP_PORT`)を出す。BigQuery の 1 回の問い合わせで読む量の上限(既定 10 GB)。AI のモデル(既定は一覧でいちばん賢い Gemini)・考える量(既定 high)・料金の概算の単価(既定 $6.25/TiB)。作業ファイルは `server/devwork/`(Git に入れない) | 使うときだけ `1`([DEVTOOLS.md](DEVTOOLS.md)) |

## 付録 B. 引っ越し用のパックの中身

| ZIP の中 | 中身 |
|---|---|
| `data.json` | すべてのテーブルの行(`server/schema.json` の全部。配信カード・結果・週・ユーザーと承認・制作の依頼・方針と決まり・商品・SKU と在庫・週ごとの実績・販売順位・外部広告・指標 など)。作った日時・変えた日時も含む |
| `images/products/…` ・ `images/heroes/…` | 商品・メイン画像の写真(本番の GCS にあるもの) |

書き出しは `server/ccp/pack.py`(`GET /api/export`)、取り込みは `python -m ccp.cli import-pack`。
2026-10-16 から、パックの形は版 2(名前と選択肢の値を変えた)。それより前に書き出したパック(版 1)は取り込めない(2026-10-30 に、以前の名前の対応表を消した)。いまの本番から書き出し直す。
写真は、利用先の環境に置いてよいことを、利用者に確認済み(2026-10-15)。
