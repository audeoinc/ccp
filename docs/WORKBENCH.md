# 移行の手順書: Vertex AI Workbench で CCP を動かす

CCP(配信コンテンツプランナー)の GCP 版を、クライアントの **Vertex AI Workbench**(Agent Platform の Workbench)で動かし、
本番(Cloud Run)と同じ**配信のデータ**と**商品・メイン画像の写真**を持ち込むための手順書です。

- 最終更新: 2026-10-15(クライアントの環境は PostgreSQL に直接つなぐ形に合わせた)
- 対象: Workbench で CCP を立ち上げる・更新する人
- 関係する文書: [GCP.md](GCP.md)(GCP 版の全体)、[HANDOVER.md](HANDOVER.md)(開発の現在地)

---

## 1. 全体の流れ

Workbench のサーバーからは外(本番の DB・画像の置き場所)にアクセスできません。
そこで、**コードは Git で**、**データと写真は「引っ越し用のパック」(1 つの ZIP)で、ブラウザ経由で**持ち込みます。

```
 本番(Cloud Run)                         クライアントの環境
 ┌──────────────────┐   ブラウザで ZIP を     ┌────────────────────────────┐
 │ 画面 ⚙ →          │   ダウンロード          │ Workbench(Jupyter)          │
 │「データと画像を    │ ──────────────────▶ │  ① アップロード               │
 │  書き出す」        │   ccp-pack-…zip       │  ② import-pack で取り込む     │
 └──────────────────┘                       │  ③ サーバーを起動(8081)      │
                                             │  ④ /proxy/8081/ で開く        │
 GitHub(audeoinc/ccp)── git clone / pull ──▶│                              │
                                             └────────────────────────────┘
```

| 持ち込むもの | 方法 | いつ |
|---|---|---|
| コード(画面・サーバー) | `git clone` / `git pull` | 最初と、開発が進んだとき |
| データ(配信・商品・結果 など、すべてのテーブル)と写真 | 引っ越し用のパック(ZIP) | 最初と、本番のデータにそろえたいとき |

> **注意:** パックの取り込みは、Workbench 側の DB の中身を**すべて置き換えます**。Workbench で入力したデータは消えます。

---

## 2. 用意するもの

| もの | 条件 | 確かめ方 |
|---|---|---|
| Workbench のインスタンス | ターミナルが使える | Jupyter の「ターミナル」を開ける |
| Node.js | **20.19 以上**(または 22.12 以上)。画面のビルドに使う | `node -v` |
| Python | **3.12 以上**を推奨(本番は 3.12) | `python3 --version` |
| Git | リポジトリ `audeoinc/ccp` を取得できる | `git --version` |
| PostgreSQL | **クライアントの環境は PostgreSQL に直接つなぐ**(Workbench の上や、同じネットワークのサーバー)。CCP 用の DB を 1 つ(本番は PostgreSQL 16) | `psql --version`、または DB の管理者に確認 |
| 権限(Workbench のサービスアカウント) | AI を使うなら「**Vertex AI ユーザー**」(Cloud SQL につなぐときだけ「Cloud SQL クライアント」も) | IAM の画面 |
| ブラウザ | クライアントの環境から、本番の CCP の画面を開ける | 本番の URL を開く |

> **パッケージの取得について:** 手順の `npm ci` と `pip install` は、パッケージをインターネット(npm・PyPI、または社内のミラー)から取ります。
> 取れない環境では、取れる環境で用意したもの(ビルド済みの `dist-gcp/` や、Python のパッケージ)を持ち込む必要があります。そのときは開発担当に相談してください。

---

## 3. 初回の立ち上げ

以下のコマンドは、Workbench の**ターミナル**で実行します(Linux なので、Python は `.venv/bin/python`)。

### 3.1 リポジトリを取得する(または最新にする)

**まだ取得していない**とき:

```bash
cd ~
git clone https://github.com/audeoinc/ccp.git
cd ccp
```

**前に clone したことがある**とき(以前に動かしていた環境など)は、必ず最新にしてから進めます。
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
npm run build:gcp      # dist-gcp/ ができる(1〜2 分)
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
| `DATABASE_URL` | **PostgreSQL の接続先**(クライアントの環境はこちら)。`postgresql+asyncpg://<ユーザー>:<パスワード>@<ホスト>:5432/<DB の名前>` |
| `CLOUD_SQL_INSTANCE` ・ `DB_USER` ・ `DB_PASSWORD` ・ `DB_NAME` | Cloud SQL につなぐときだけ(`DATABASE_URL` の代わり) |
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
| DB | `DATABASE_URL`(Cloud SQL なら `CLOUD_SQL_INSTANCE`・`DB_USER`・`DB_PASSWORD`・`DB_NAME`) |
| AI | `GOOGLE_CLOUD_PROJECT`(必須)、`GOOGLE_CLOUD_LOCATION`(省略時 `global`)、`GEMINI_MODEL`(省略時 `gemini-3.5-flash`) |

CCP は、Gemini を **Vertex AI の形**(Workbench のサービスアカウントの権限)で呼びます。Gemini の **API キー**(`GEMINI_API_KEY` など)では動かないので、その形で接続しているときは、`GOOGLE_CLOUD_PROJECT` の設定と、Vertex AI の権限が別に要ります。

名前を確かめるコマンド(パスワードの一部が画面に出るので、人に見せない):

```bash
env | grep -E "^(DATABASE_URL|CLOUD_SQL_INSTANCE|DB_|GOOGLE_CLOUD_|GEMINI_)" | cut -c1-40
```
>
> **`DATABASE_URL` の書き方の注意:** 先頭は `postgresql+asyncpg://`(`postgresql://` だけでは動きません)。パスワードに `@` `:` `/` `#` などの記号があるときは、URL の形に置き換えます(例: `@` → `%40`、`#` → `%23`)。値は `'…'` で囲みます(`$` や `&` を、シェルが別の意味に読まないように)。

設定を書いたら、DB につながるかを確かめます(テーブルの件数が出れば OK。初回は、テーブルがないというエラーでも、つながってはいます)。

```bash
set -a; source workbench.env; set +a
.venv/bin/python -m ccp.cli counts
```

#### PostgreSQL を Workbench の中に入れたとき(conda など)

PostgreSQL は Workbench 自身の上で動くので、`DATABASE_URL` のホストは **`localhost`** です。

```bash
DATABASE_URL='postgresql+asyncpg://<ユーザー>:<パスワード>@localhost:5432/<DB の名前>'
```

PostgreSQL が動いているかは、conda の環境を有効にしたターミナルで確かめます(`accepting connections` なら動いている)。
Workbench を止めて起動し直したあとは、PostgreSQL は自動では起動しないことがあるので、入れたときの手順で起動します(例: `pg_ctl -D <データのフォルダ> start`)。

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

1. クライアントの環境のブラウザで、本番の CCP の画面を開きます。
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

### 3.8 サーバーを起動する

```bash
cd ~/ccp/server
set -a; source workbench.env; set +a
.venv/bin/python -m uvicorn ccp.main:app --port 8081
```

`Uvicorn running on http://127.0.0.1:8081` と出たら起動しています。**このターミナルは閉じない**でください(閉じるとサーバーが止まります)。
ターミナルを閉じても動かし続けたいときは:

```bash
nohup .venv/bin/python -m uvicorn ccp.main:app --port 8081 > ~/ccp-server.log 2>&1 &
# 止めるとき: pkill -f "uvicorn ccp.main:app"
```

### 3.9 画面を開いて確かめる

ブラウザで次を開きます(**末尾の `/` を必ず付ける**)。

```
https://<ノートブックの URL>/proxy/8081/
```

確認すること:

- [ ] カレンダーに配信が出る(本番と同じ件数。ツールバーの右の「◯ / ◯ 件」)
- [ ] 週の表示・配信カードで、**写真**が出る(イラストではない)
- [ ] 「結果」の面で、配信の結果とヒートマップが出る
- [ ] 配信カードの「すべて AI で下書き」が動く(AI を使うとき)

---

## 4. 更新の手順(開発を続けながら)

### 4.1 コードを最新にする

```bash
cd ~/ccp
git pull
npm ci                       # パッケージが変わったときに必要。毎回でもよい
npm run build:gcp
cd server
.venv/bin/python -m pip install -r requirements.txt    # requirements.txt が変わったときだけ
# サーバーを止めて(Ctrl+C か pkill)、3.8 と同じ手順で起動し直す
```

新しい列・テーブルは、サーバーの起動後、最初に DB につないだときに自動で足されます(手で `migrate` しなくてよい)。

### 4.2 データと写真を、本番にそろえる

3.5〜3.8 を繰り返します(書き出す → 上げる → `import-pack --yes` → 起動し直す)。
**Workbench 側で入力したデータは消える**ので、残したいものがないか確かめてから行います。

> コードとデータは、なるべく**同じ時期のもの**にそろえます。本番より古いコードで新しいパックを取り込むと、知らない列があって取り込みが止まることがあります(先に 4.1 でコードを最新にする)。

---

## 5. よくあるつまずき

| 症状 | 原因 | 直し方 |
|---|---|---|
| 写真の代わりに**イラスト**が出る | パックを取り込んでいない(初期データの `seed` のまま)/ `ASSET_DIR` を付けずに起動した | 3.7 の取り込み、3.8 で `workbench.env` を読み込んでから起動 |
| 写真の場所が**灰色の枠**のまま | `ASSET_DIR` のパスが違う(相対パス・フォルダ違い) | `ls $ASSET_DIR/products | head` で写真があるか確かめる。絶対パスにする |
| 画面が**真っ白**、または API が 404 | URL の末尾の `/` がない | `…/proxy/8081/` のように `/` を付ける |
| `socket.gaierror: Name or service not known` | 接続先のホスト名が引けない。① `workbench.env` の見本の行(`<ホスト>`)が、設定済みの `DATABASE_URL` を上書きした ② パスワードの `@` を `%40` にしていない(`@` の後ろがホスト名と読まれる)③ `DATABASE_URL` がなく、Cloud SQL の経路(外への接続)になった | 設定済みなら、`workbench.env` の DB の行をコメントアウトし、**新しいターミナル**でやり直す。Workbench の中の PostgreSQL なら、ホストは `localhost`。CCP が読んでいるホストは、下の「接続先の確かめ方」で表示する |
| `workbench.env: No such file or directory` | ① リポジトリが古く、見本(`workbench.env.example`)がない ② 見本から `workbench.env` をコピーしていない ③ `~/ccp/server` 以外の場所で実行した ④ ファイル名の綴りの違い(work**bench**)、Jupyter で作って `workbench.env.txt` になった | `cd ~/ccp && git pull` → `cd server && cp workbench.env.example workbench.env`。`ls -la ~/ccp/server \| grep -i workbench` で、ファイルの名前と場所を確かめる |
| 起動時に `KeyError: 'CLOUD_SQL_INSTANCE'` | 設定を読み込んでいない | 同じターミナルで `set -a; source workbench.env; set +a` を実行してから起動 |
| 画面が「準備中」のまま・DB につながらない | `DATABASE_URL` の間違い(先頭が `postgresql+asyncpg://` でない、パスワードの記号を置き換えていない、ホスト・ポート・DB 名の違い)、PostgreSQL が外からの接続を受け付けていない | `.venv/bin/python -m ccp.cli counts` で確かめる。ほかのサーバーの PostgreSQL なら、`pg_hba.conf` などで Workbench からの接続が許されているかを、DB の管理者に確認 |
| AI のボタンでエラーになる | `GOOGLE_CLOUD_PROJECT` の間違い、Vertex AI の権限不足、モデル名がその環境で使えない | 設定と権限を確かめる。`GEMINI_MODEL` をその環境で使えるモデルに変える |
| `import-pack` で「形式に対応していません」 | パックが新しく、コードが古い | 4.1 でコードを最新にしてから取り込む |
| `npm ci` / `pip install` が止まる | パッケージの取得先(インターネット)にアクセスできない | 2 の「パッケージの取得について」 |
| 8081 が使えない(`address already in use`) | 前に起動したサーバーが残っている | `pkill -f "uvicorn ccp.main:app"` で止めてから起動 |

---

### 接続先の確かめ方(パスワードは出さない)

```bash
cd ~/ccp/server
set -a; source workbench.env; set +a
.venv/bin/python -c "
import os; from urllib.parse import urlsplit
u = os.getenv('DATABASE_URL')
if u:
    p = urlsplit(u); print('DATABASE_URL: scheme=', p.scheme, ' host=', p.hostname, ' port=', p.port, ' db=', p.path)
else:
    print('DATABASE_URL なし / CLOUD_SQL_INSTANCE =', os.getenv('CLOUD_SQL_INSTANCE'))
"
```

`host=` に正しいホスト(Workbench の中の PostgreSQL なら `localhost`)が出ていれば、DB の設定は読めています。

## 付録 A. 環境変数の一覧

| 環境変数 | 必須 | 中身 | Workbench での値 |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL に直接つなぐとき | `postgresql+asyncpg://<ユーザー>:<パスワード>@<ホスト>:5432/<DB の名前>` | **クライアントの環境の PostgreSQL** |
| `CLOUD_SQL_INSTANCE` | Cloud SQL のとき | `<プロジェクトID>:<リージョン>:<インスタンス名>` | 設定しない(`DATABASE_URL` を使う) |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | Cloud SQL のとき | DB のユーザー・パスワード・DB の名前(既定 `ccp_app` / なし / `ccp`) | 設定しない |
| `GOOGLE_CLOUD_PROJECT` | AI を使うとき | Vertex AI のプロジェクト | その環境のプロジェクト |
| `GOOGLE_CLOUD_LOCATION` | — | Vertex AI の場所(既定 `global`) | `global` |
| `GEMINI_MODEL` / `GEMINI_THINKING` | — | AI のモデル・考える量 | 本番と同じなら `gemini-3.8-flash` / `low` |
| `ASSET_DIR` | 写真を出すとき | 写真のフォルダ(パックの展開先) | `<server の絶対パス>/images` |
| `APP_PASSWORD` | — | 画面のパスワード(Basic 認証)。空なら、かけない | 空でよい(中継が Google のログインで守られている) |
| `STATIC_DIR` | — | 画面のビルドの場所(既定 `<リポジトリ>/dist-gcp`) | 設定しない |
| `DB_CONTROL` / `STATE_BUCKET` / `CCP_DEV_GCLOUD` / `IDLE_CHECK_*` | — | 本番(Cloud Run)の DB の自動起動・停止、手元の開発用 | **設定しない** |

## 付録 B. 引っ越し用のパックの中身

| ZIP の中 | 中身 |
|---|---|
| `data.json` | すべてのテーブルの行(配信カード・載せた商品・結果・メモ・週・承認の履歴・商品・メイン画像・週ごとの実績・販売方針・テンプレート)。作った日時・変えた日時も含む |
| `images/products/…` ・ `images/heroes/…` | 商品・メイン画像の写真(本番の GCS にあるもの) |

書き出しは `server/ccp/pack.py`(`GET /api/export`)、取り込みは `python -m ccp.cli import-pack`。
写真は、クライアントのサービスで使っている画像で、クライアントの環境に置いてよいことを確認済み(2026-10-15)。
