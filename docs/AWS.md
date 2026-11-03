# AWS などの Linux のサーバーで CCP を動かす(手順書)

AWS 版の ZIP を受け取って、サーバーで CCP を立ち上げる・設定する・更新する・困ったときに直すための手順です。**AWS で要ることは、この文書だけで足りるように書いてあります。**
仕組みは、どの置き先でも同じです。サーバー(FastAPI)が PostgreSQL につなぎ、BigQuery からデータを取り込み、Vertex AI の Gemini(または AI の出口の層)を呼びます。置き先の違いは、設定だけで吸収します([ARCHITECTURE.md](ARCHITECTURE.md) の 0.5 章)。

- この版の名前は、ZIP の中の `VERSION.txt` にあります。
- 1 つずつのコマンドの意味などの、くわしい補足は [WORKBENCH.md](WORKBENCH.md) にあります。そこで「Workbench」と書いてある所は、**CCP を動かしているサーバー**と読み替えてください。Jupyter の中継(`/proxy/…`)と、conda で入れた PostgreSQL の話は、AWS では関係ありません。
- **めったにしない作業なので、覚えていなくても済むようにしてあります。** 足りない物と直し方は、`scripts/workbench.sh setup`(道具)と `scripts/workbench.sh check`(設定。画面では ⚙ →「設定の状態」)が教えます。この文書の手順を覚える必要はありません。上から順に進め、`[NG]` の行の → を直してください(6 章)。

## 1. 全体の流れ

1. CCP の外で、サーバー・PostgreSQL・Google の認証情報・入口(HTTPS とログイン)を用意する(2 章)
2. ZIP を利用先の Git に入れ、サーバーで取得する(3.1)
3. `scripts/workbench.sh setup` → 設定ファイルを書く → `check`(3.2〜3.4)
4. `scripts/workbench.sh start` で起動し、入口の URL で画面を開く(3.5)。外から開けてしまっていないかを確かめる(7 章)
5. 最初の管理者を作る(3.6)
6. ⚙ →「データの取り込み」で BigQuery の表の場所を入れて取り込む(4 章)。⚙ →「AI の設定」でモデルを確かめる(5 章)
7. ⚙ →「設定の状態」で、全部の行が「済み」になったのを見る(6 章)
8. 新しい版が届いたら、`scripts/workbench.sh update`(8 章)

## 2. 用意するもの(CCP の外で、サーバーを立てる人の作業)

| もの | 条件 | 忘れたとき、どこで気づけるか |
|---|---|---|
| Linux のサーバー | Python 3.12 以上(`python3`)・Node.js 20.19 以上か 22.12 以上(`node`)・npm・Git・curl | `scripts/workbench.sh setup` が、足りない物を出して止まる |
| PostgreSQL | 同じ機械か、マネージドの DB(RDS など)。CCP 用の DB とユーザーを 1 つ(表を作る権限が要る)。PostgreSQL 16 で動かしている | `check` の DB の行が `[NG]`。画面は「データベースにつながりません」 |
| Google の認証情報 | BigQuery を読み、Vertex AI を使う権限のあるサービスアカウントと、その入り方(2.1) | `check` の「Google の認証」「AI」「BigQuery」の行が `[NG]` |
| 秘密の置き場所 | DB のパスワード・画面のパスワード・OIDC のクライアントシークレット・AI の出口の合言葉など(Secrets Manager など)。サーバーには、`server/workbench.env` か環境変数で渡す | `check` の該当の行 |
| 入口 | ロードバランサーなどで、**HTTPS** と**ログイン**(OIDC のログイン、画面のパスワード `APP_PASSWORD`、または手前の認証)を付ける(7 章) | `check` の「画面の守り」の行と、7 章の確かめ |
| パッケージの取得 | `npm ci` と `pip install` が、npm・PyPI(または社内のミラー)に届く | `setup` の途中で止まる |

- サーバーは、外に出られる前提です。商品ページを読む・URL の画像から選ぶ機能は、そのまま動きます([WORKBENCH.md](WORKBENCH.md) の 6 章の試しは要りません)。
- BigQuery から AWS へ読み出すと、Google Cloud の外への通信料がかかります(行数が数千なので、ほとんど気にしなくてよい額)。

### 2.1 Google Cloud への入り方

CCP は、Google への入り方を自分では選ばず、その機械の標準の方法(`google.auth.default`。アプリケーションのデフォルト認証情報)で入ります(`server/ccp/creds.py`)。BigQuery(`bq.py`)も Vertex AI の Gemini(`ai.py`)も、同じ認証情報を使います。AWS の機械には Google のサービスアカウントが付いていないので、次のどちらかのファイルを置き、`GOOGLE_APPLICATION_CREDENTIALS` にその絶対パスを書きます。

| 方法 | やり方 | 向いているとき |
|---|---|---|
| ① 鍵なしのつなぎ(Workload Identity 連携) | Google Cloud 側で AWS のロールを信頼する設定を作り、その「認証情報の構成ファイル」を置く(下の手順) | 鍵を置きたくないとき(おすすめ) |
| ② サービスアカウントの鍵のファイル | サービスアカウントの JSON の鍵を作り、秘密の置き場所から置く | すぐ試したいとき(鍵の期限・持ち出しの管理が要る) |

**① の作り方の要点**(Google Cloud の管理者が `gcloud` で。`<…>` はその環境の値)

```bash
# 1. ワークロード ID プールと、AWS のプロバイダを作る
gcloud iam workload-identity-pools create <プール> --location=global --project=<プロジェクト>
gcloud iam workload-identity-pools providers create-aws <プロバイダ> \
  --workload-identity-pool=<プール> --account-id=<AWS のアカウント ID> --location=global --project=<プロジェクト>

# 2. CCP の機械に付けた AWS のロールに、サービスアカウントを借りることを許す
gcloud iam service-accounts add-iam-policy-binding <サービスアカウントのメール> \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/<プロジェクト番号>/locations/global/workloadIdentityPools/<プール>/attribute.aws_role/arn:aws:sts::<AWS のアカウント ID>:assumed-role/<ロール名>"

# 3. 認証情報の構成ファイルを作り、CCP の機械に置く(中身に秘密はない。鍵ではなく「どこから借りるか」の設定)
gcloud iam workload-identity-pools create-cred-config \
  projects/<プロジェクト番号>/locations/global/workloadIdentityPools/<プール>/providers/<プロバイダ> \
  --service-account=<サービスアカウントのメール> --aws --enable-imdsv2 --output-file=<構成ファイル>.json
```

- 置いたら `server/workbench.env` に `GOOGLE_APPLICATION_CREDENTIALS=<構成ファイルの絶対パス>` と書きます。CCP は、機械の AWS のロールで AWS に入り、それを Google のサービスアカウントの一時的な認証に替えて使います。
- 上の構成は、EC2 の機械に付けたロール(インスタンスのメタデータ)から借りる形です。コンテナ(ECS など)で動かすときの借り方は(要確認)。
- 入れたかどうかは `check` の「Google の認証」の行に、使っているアカウントが出ます。

**要る IAM の役割**(サービスアカウントに付ける)

| 役割 | 付ける所 | 何のため |
|---|---|---|
| BigQuery データ閲覧者(`roles/bigquery.dataViewer`) | 出力の表・ビューがあるデータセット(ビューなら、ビューが読む元の表のデータセットと、更新の合図に見る表のデータセットも。承認済みのビューにしていれば、ビューのデータセットだけ) | 表の情報(最終更新・列)と行を読む |
| BigQuery ジョブユーザー(`roles/bigquery.jobUser`) | 問い合わせを走らせるプロジェクト(下の「ジョブのプロジェクト」) | 問い合わせ(ジョブ)を走らせる。料金はこのプロジェクトに付く |
| Vertex AI ユーザー(`roles/aiplatform.user`) | `GOOGLE_CLOUD_PROJECT` のプロジェクト | Gemini を呼ぶ・使えるモデルの一覧を読む |
| ワークロード ID ユーザー(`roles/iam.workloadIdentityUser`) | サービスアカウント自身(① のときだけ。上の手順 2) | AWS のロールに、サービスアカウントを借りることを許す |

- **ジョブのプロジェクト**(前の版の環境変数 `BQ_PROJECT`。いまは ⚙ →「データの取り込み」の「BigQuery の共通の設定」で入れる)は、問い合わせを走らせて料金が付くプロジェクトです。表があるプロジェクトと違ってよい。空なら `GOOGLE_CLOUD_PROJECT`(AI と同じプロジェクト)を使います。
- CCP が BigQuery に対して行うのは、表の情報を読む・問い合わせの試し(dry run。料金なし)・読む(SELECT)だけです。書き込みの権限は要りません。PostgreSQL のアカウントに BigQuery の権限は要りません。
- Vertex AI の API(`aiplatform.googleapis.com`)と BigQuery の API が、それぞれのプロジェクトで有効になっている必要があります。① なら IAM の認証情報の API(`iamcredentials.googleapis.com`)と STS(`sts.googleapis.com`)も(要確認)。

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

- 最初に、道具がそろっているかを確かめます(Python 3.12 以上・Node.js 20.19 以上か 22.12 以上 など)。足りなければ、足りない物と、いまの版を出して止まります。入れてから、もう一度流します。
- そのあと、Python の環境(`server/.venv`)・パッケージ(`pip install -r server/requirements.txt`)・画面のビルド(`npm ci` → `dist-gcp/`)を作り、設定ファイル `server/workbench.env` を見本(`server/workbench.env.example`)からコピーします。
- 2 回目以降は、変わった物だけを入れ直します(何度流してもよい)。

### 3.3 設定を書く

設定は 2 つに分かれます。**起動に要る値と秘密は環境変数**(`server/workbench.env`。起動し直すと効く)、**仕事の設定は ⚙ で決めて DB に持つ**(表 `app_settings`。保存すると、次の呼び出しから効く。だれが・いつ変えたかが残る)。

**環境変数に置くもの**(`server/workbench.env` の `<…>` を、その環境の値にする。説明は見本の中、全部の一覧は [WORKBENCH.md](WORKBENCH.md) の付録 A)

| 環境変数 | 要るとき | 中身 |
|---|---|---|
| `DATABASE_URL` | いつも | `postgresql+asyncpg://<ユーザー>:<パスワード>@<ホスト>:5432/<DB の名前>`(RDS ならそのつなぎ先)。値は `'…'` で囲む。パスワードの `@` は `%40` に。RDS で SSL を必須にしているときの書き方は(要確認) |
| `GOOGLE_CLOUD_PROJECT` | AI・BigQuery を使うとき | Vertex AI を使うプロジェクト |
| `GOOGLE_CLOUD_LOCATION` | — | Vertex AI の場所(既定 `global`) |
| `GOOGLE_APPLICATION_CREDENTIALS` | AWS ではいつも | 2.1 の ① の構成ファイルか、② の鍵のファイルの絶対パス |
| `OIDC_ISSUER` / `OIDC_CLIENT_ID` / `OIDC_CLIENT_SECRET` | ログイン(SSO)を使うとき | 7.1。`OIDC_ISSUER` があれば、ログインを使う |
| `CCP_PUBLIC_URL` | ログインを使い、手前の機械が `X-Forwarded-Proto`・`Host` を付けないとき | 画面のアドレス(`https://<画面のアドレス>`) |
| `CCP_SESSION_HOURS` / `CCP_SESSION_SECRET` | — | ログインが続く長さ(既定 12 時間)/ ログインのクッキーの署名の鍵(なければクライアントシークレットから作る。サーバーを 2 台以上にするなら、そろえる) |
| `APP_PASSWORD` | ログインを使わないとき | 画面のパスワード(Basic 認証)。**外から開くなら、ログインかこれの、どちらかが必ず要る** |
| `CCP_AUTH` | — | 入口の認証を名指しする(`oidc` / `basic` / `iap` / `none`)。ふつうは書かない(ある設定から選ぶ) |
| `AI_OUTLET_TOKEN` | AI の出口を使うとき | 層に送る合言葉(秘密なので環境変数のまま。URL は ⚙ で入れる。[AI_OUTLET.md](AI_OUTLET.md)) |
| `CCP_HOST` | ロードバランサーが別の機械のとき | 受け付けるアドレス。`0.0.0.0` にする(既定 `127.0.0.1` は、この機械の中からだけ) |
| `CCP_PORT` | — | サーバーのポート(既定 8082) |
| `ASSET_DIR` | 写真を出すとき | 写真のフォルダ(絶対パス。サーバーを動かすユーザーが書けること) |
| `BQ_AUTO_SYNC` | 試験などで止めるときだけ | `0` で、BigQuery の定期の取り込みを、画面の入・切にかかわらず止める |

- `server/workbench.env` の行は、そのときの環境変数を**上書き**します。秘密の置き場所から環境変数で渡す値は、`workbench.env` の同じ行を `#` で消しておきます(見本の `<…>` のまま残すと、それで上書きされる)。
- `workbench.env` はパスワードを含むので、Git に入れません(`.gitignore` 済み)。

**⚙ で決めて DB に持つもの**(起動したあとに画面で入れる。管理する人だけ。`server/ccp/appsettings.py`)

| まとめ | 項目(前の版の環境変数) | 画面 |
|---|---|---|
| `bq` | ジョブのプロジェクト(`BQ_PROJECT`)、出力ごとの読む場所(`BQ_SPU` / `BQ_SKU` / `BQ_SKU_STOCK` / `BQ_WEEKLY` / `BQ_FORECAST` / `BQ_RANKING`)、更新の合図に見る表(`BQ_<名前>_WATCH`) | ⚙ →「データの取り込み」(4 章) |
| `ai` | モデル(`GEMINI_MODEL`。既定 `gemini-3.5-flash`)、考える深さ(`GEMINI_THINKING`。既定 `low`)、同時に呼ぶ数(`GEMINI_CONCURRENCY`。既定 4)、AI の出口の URL(`AI_OUTLET_URL`)・待ち時間(`AI_OUTLET_TIMEOUT`。既定 120 秒) | ⚙ →「AI の設定」(5 章) |
| `bq.sync` | 定期の取り込みの入・切(既定は切)と、出力ごとの確かめる間隔 | ⚙ →「データの取り込み」 |

- **環境変数から一度だけ写す仕組み**: DB にまだそのまとめ(`bq` / `ai`)の行がなく、上の前の版の環境変数に値があれば、サーバーが最初に設定を読むときに、一度だけ DB に写します(画面の変えた記録に「環境変数から」と出る。サーバーのログにも出る)。写したあとは、環境変数が残っていても DB の値だけが効くので、`workbench.env` から消してかまいません。新しく立てるサーバーでは、環境変数には書かず、⚙ で入れれば済みます。
- `check` のコマンドは、DB から読むだけで、写しません(何も変えない)。

### 3.4 確かめる

```bash
scripts/workbench.sh check
```

設定・DB への接続・Google の認証・AI・BigQuery・写真・画面の守り・画面のビルドを確かめます(パスワードは出さず、何も変えません)。`[NG]` の行の → を直して、もう一度流します。読み方は 6 章。

- この時点では、BigQuery の表の場所がまだないので「BigQuery の表の場所が 1 つもありません」が `[注意]` で出ます(4 章で入れる)。
- CCP の表は、サーバーが最初に DB を使うときに作ります。足りなければ `check` が `python -m ccp.cli migrate` を教えます。

### 3.5 起動して、画面を開く

```bash
scripts/workbench.sh start
scripts/workbench.sh status
```

- 入口(ロードバランサーなど)の URL で画面を開きます。CCP は置かれた場所に合わせて動くので、パスの設定は要りません。
- ロードバランサーの死活確認(ヘルスチェック)は `GET /ping`(認証なしで `{"ok": true}` を返す)に向けます。
- **外から開ける入口なら、7 章の確かめを必ず行います。**
- 開けないときは、`scripts/workbench.sh log` でサーバーのログを見ます(9 章)。
- `start` はサーバーを裏で動かすだけで、機械を起動し直したときに自動では起動しません。機械の起動で動かすなら、systemd などで `scripts/workbench.sh start` を呼ぶようにします(作り方は、その環境の決まりに合わせる)。

### 3.6 最初の管理者を作る

⚙ の「設定の状態」「AI の設定」「データの取り込み」は、**管理する人**(ユーザーの役割が管理者、または開発者の印がある人)にだけ出ます。

- ⚙ →「ユーザーと承認グループ」で、自分をユーザーに足し、役割を管理者にします。ログイン(OIDC)を使っているときは、ログインしたメールアドレスで結びます。管理する人がまだ 1 人もいない DB では、ログインした人がユーザーを足せます(最初の管理者を作るため)。
- 管理者になっても項目が出ないときは、その機能が公開されていない場合があります(⚙ →「使える機能」。要確認)。

### 3.7 画面の案内に従う

- ⚙ の歯車に赤い点が出ていれば、足りない設定があります。⚙ →「設定の状態」の行と直し方に従います(6 章)。画面で直せる行は「直す」で、その設定の画面に移ります。
- (作っている途中)設定が足りないときの「初期設定」の画面と、ほかのリージョンの設定を使い回す「設定の型」の書き出し・読み込みは、まだできていません。できるまでは、3.3 のファイルと ⚙ の各画面、`check` で進めます。

## 4. BigQuery とつなぐ

取り込む出力と列の決まりは [BIGQUERY_EXPORT.md](BIGQUERY_EXPORT.md)(利用先のデータの担当に渡す仕様書)、仕組みは [BIGQUERY.md](BIGQUERY.md) にあります。

**表の場所の形**: `<プロジェクト>.<データセット>.<テーブルかビュー>`(バッククォートは付けても外しても同じ)。出力は 6 つで、CCP の DB のどの表に写すかは決まっていて変えられません。

| 出力 | 前の版の環境変数 | 写す先(CCP の DB の表) | 仕様 |
|---|---|---|---|
| SPU | `BQ_SPU` | `products` | BIGQUERY_EXPORT.md の 2 章 |
| SKU | `BQ_SKU` | `sku` | 3 章 |
| SKU の在庫 | `BQ_SKU_STOCK` | `sku_stock` | 4 章 |
| 週ごとの実績 | `BQ_WEEKLY` | `weekly_performances` | 5 章 |
| 天気予報 | `BQ_FORECAST` | `weather_forecast` | 6 章 |
| 販売チャネルごとの順位 | `BQ_RANKING` | `product_rankings` | 9 章(結果の画面で使う) |

- 出力がビューのときは、ビューの最終更新の日時が元のデータの変化で変わらないので、「更新の合図に見る表」に元のテーブルを入れます(表なら要らない)。
- 使わない出力は、空のままでかまいません(`check` に「場所のない出力」として `[注意]` が出るだけ)。

**流れ**(⚙ →「データの取り込み」。全社の項目。管理する人だけ)

1. 表の下の「BigQuery の共通の設定(ジョブのプロジェクト・場所を変えた記録)」を開き、「ジョブのプロジェクト」を入れて「保存」(空なら AI と同じプロジェクト。2.1)。
2. 出力の行を押して開き、「表の場所」の「読む場所(BigQuery の表かビュー)」に場所を入れる。ビューなら「更新の合図に見る表(BigQuery)」も。
3. 「接続を確認」を押す。保存の前の値で、表を読めるか・必須の列がそろっているかを確かめます(読んで確かめるだけで、何も書き込みません)。NG なら、その理由に従って場所か BigQuery 側の出力を直します。
4. 「保存」を押す(「保存しました。次の取り込みから、この場所を読みます。」と出る)。出力の数だけ 2〜4 を繰り返す。
5. 行の右の ⋯ →「確認だけ(書き込まない)」(全部なら、上の「全部を確認だけ」)で、取り込める・取り込めない・データの時点・注意を見る。
6. ⋯ →「今すぐ取り込む」(全部なら「全部を今すぐ取り込む」)。取り込めれば、行の状態が「取り込めている」になり、データの新しさと行数が出ます。
7. 上の「定期の取り込み」を「入」にする。入のあいだは、サーバーが出力ごとの「間隔」(表の列で選ぶ。2 分〜1 日)で BigQuery の最終更新を確かめ、変わっていれば取り込みます(画面を開いていなくても)。切のあいだは、だれかが画面を開いたときに確かめます。

- 取り込めなかった出力は、前のデータのまま使い、理由がその行のすぐ下に出ます。⋯ →「詳しく・表の場所・記録」で、取り込みの記録を見られます。
- 環境変数 `BQ_AUTO_SYNC=0` があると、「定期の取り込み」のスイッチは効きません(画面に帯が出る)。画面で決めるには、その行を消して起動し直します。
- サーバー側の窓口は `/api/settings/bq`(表の場所の読み書き)・`/api/settings/bq/try`(接続を確認)・`/api/bq/status`・`/api/bq/check`(確認だけ)・`/api/bq/sync`(取り込む)・`/api/bq/history`・`/api/bq/settings`(定期の取り込み)です。コマンドで同じ確かめをするなら `cd server && .venv/bin/python -m ccp.cli bq-check`。

## 5. AI の設定

⚙ →「AI の設定」(全社の項目。管理する人だけ)で、次を決めます。保存すると、次の AI の呼び出しから効きます(起動し直さなくてよい)。

| 項目 | 中身 |
|---|---|
| 使うモデル | Vertex AI の Gemini のモデル。一覧は、いまこの環境(`GOOGLE_CLOUD_PROJECT`・`GOOGLE_CLOUD_LOCATION`)で使えるもの(1 日覚える。「一覧を読み直す」で読み直す)。一覧にないものは「そのほか(名前を書く)」 |
| 考える深さ | 最小 / 少し / ふつう / 深く(`minimal` / `low` / `medium` / `high`)。1 回の下書きで 6〜9 回呼ぶので、ふだんは「少し」 |
| 同時に呼ぶ数 | AI を同時に呼ぶ数の上限(1〜32)。混み合い(429)が出るときは減らす。AI の出口を使うときも効く |
| AI の出口(空なら Gemini) | URL を入れると、AI をすべて、その層(ほかの AI)に頼む。合言葉は環境変数 `AI_OUTLET_TOKEN`。待ち時間(秒)は 5〜600。層が失敗しても、自動で Gemini には戻さない([AI_OUTLET.md](AI_OUTLET.md)) |

- 「試す」で、保存の前の値で AI を短く 1 回呼びます(何も保存しない)。
- モデル・考える深さ・出口を変えて「保存」すると、保存の前に 1 回試し、通らなければ保存しません(いまの設定のまま動き続ける)。理由を見たうえで、それでも保存するときは「それでも保存する」。
- 呼べない理由は、人に分かる言葉で出ます(モデルが見つからない → 名前か `GOOGLE_CLOUD_LOCATION`、権限がない → Vertex AI ユーザーの役割、など。9 章)。

## 6. 設定の状態(健康診断)と `check`

**足りない設定と直し方は、`check` と ⚙ →「設定の状態」が教えます。** どちらも中身は同じ確かめ(`server/ccp/health.py`)で、言うことは同じです。手順書で覚えておく必要はありません。

| どこで | どう使う |
|---|---|
| `scripts/workbench.sh check`(= `cd server && .venv/bin/python -m ccp.cli check`) | ターミナル。行を組ごと(■)に出し、`[OK  ]` / `[NG  ]` / `[注意]` と、NG・注意の行の下に `→ 直し方`。最後に NG の数 |
| ⚙ →「設定の状態」 | 画面(管理する人だけ)。状態は「済み」/「足りない」/「確認に失敗」/「注意」。画面で直せる行には「直す」(「AI の設定」か「データの取り込み」に移る)。「もう一度確かめる」 |
| サーバーの起動のとき | 軽く確かめ(AI は呼ばず、BigQuery は場所があるかだけ)、足りない行をサーバーのログに出し、管理する人の ⚙ に赤い点を出す |

- `check` と「設定の状態」は、AI を 1 回呼び、BigQuery の表を読んで列まで確かめます(十数秒かかることがある)。何も変えません(DB は読むだけ、BigQuery は表の情報と dry run だけ)。パスワードは出しません。
- 組は、DB → Google の認証 → AI → BigQuery → 定期の取り込み → 写真 → 画面の守り → 画面 の順です。**上の組の NG を先に直します**(DB と Google が通らないと、下の組は確かめられない)。

**`[NG]` の行と直し方**(行の文は、出る文の要点。→ の直し方は、実際の行にも出ます)

| 組 | 行 | 直し方 |
|---|---|---|
| DB | DB のつなぎ先(`DATABASE_URL`)がありません | `server/workbench.env` に `DATABASE_URL` を書いて、起動し直す |
| DB | `DATABASE_URL` の先頭が `postgresql+asyncpg://` ではありません | 先頭を `postgresql+asyncpg://` にする |
| DB | `DATABASE_URL` に `@` が 2 つ以上あります | パスワードの中の `@` を `%40` に置き換える |
| DB | DB のホスト `<ホスト>` が見つかりません | ホスト名の書き間違い、パスワードの `@` を `%40` にしていない、などを確かめる |
| DB | DB につながりません(理由) | DB が動いているか、ユーザー・パスワード・DB の名前、RDS のセキュリティグループで CCP の機械から 5432 に届くかを確かめる |
| DB | CCP の表が N 個足りません | `cd server && .venv/bin/python -m ccp.cli migrate` |
| Google の認証 | `GOOGLE_CLOUD_PROJECT` がありません | Vertex AI を使うプロジェクトを書いて、起動し直す |
| Google の認証 | Google の認証が取れません | `GOOGLE_APPLICATION_CREDENTIALS` のパス・ファイルの中身、① なら機械に AWS のロールが付いているか(2.1) |
| AI | AI を呼べません(Google の設定が足りません) | 上の Google の行を直す |
| AI | Gemini(モデル)を呼べません: 理由 | ⚙ →「AI の設定」でモデル・出口を直し、「試す」で確かめる(理由ごとの直し方は 9 章) |
| AI | AI の出口の URL が `http://` か `https://` で始まる URL ではありません / 出口に届きません | ⚙ →「AI の設定」で直す。Gemini に戻すなら、出口の URL を空にする |
| BigQuery | パッケージ `google-cloud-bigquery` がありません | `server/.venv/bin/python -m pip install -r server/requirements.txt`(または `scripts/workbench.sh update`) |
| BigQuery | BigQuery のクライアントを作れません | Google の行と、ジョブのプロジェクト(⚙ →「データの取り込み」の共通の設定)を確かめる |
| BigQuery | (出力): BigQuery の(場所)を読めません | ⚙ →「データの取り込み」で行を開き、表の場所を直して「接続を確認」。権限なら 2.1 の役割 |
| BigQuery | (出力): 必須の列がありません | BigQuery の出力で、[BIGQUERY_EXPORT.md](BIGQUERY_EXPORT.md) の列名に `AS` で合わせる |
| BigQuery | (出力): 仕様どおりではありません | `cd server && .venv/bin/python -m ccp.cli bq-check` で、くわしく見る |
| 定期の取り込み | (出力): 止めています(理由) | ⚙ →「データの取り込み」で、その行の理由を見る |
| 写真 | 写真の場所(`ASSET_DIR`)のフォルダがありません / 写真がありません / 書けません | フォルダを作る・写真を入れる(引っ越し用のパック。[WORKBENCH.md](WORKBENCH.md) の 3.5〜3.7)・サーバーを動かすユーザーに書く権限を付ける |
| 画面の守り | ログイン(OIDC)の設定が足りません / 発行元に届きません | 7.1 |
| 画面の守り | `CCP_AUTH=basic` なのに `APP_PASSWORD` がありません / `CCP_AUTH` の値が分かりません | `APP_PASSWORD` を設定する / `oidc`・`basic`・`iap`・`none` のどれかにする(ふつうは `CCP_AUTH` を消す) |
| 画面 | 画面のビルドがありません | `scripts/workbench.sh update`(またはリポジトリのルートで `npm ci` → `npm run build:gcp`) |

`[注意]` の行(動くが気にしてほしい): BigQuery の表の場所がない・場所のない出力がある・あると使う列がない・まだ取り込んでいない・定期の取り込みが切か `BQ_AUTO_SYNC=0`・`ASSET_DIR` がない(写真の代わりにイラスト)か相対パス・入口の認証がない(このサーバーの中からだけ開ける)・`CCP_AUTH=none`・ログインを使っているのに `APP_PASSWORD` がある・`CCP_PUBLIC_URL` がない・Gemini の API キーの変数がある(CCP は使わない)。どれも行に → が出ます。

## 7. 外から開くとき(入口の守り)

CCP の入口の認証は、ある設定から自動で選びます(`server/ccp/identity.py`。`OIDC_ISSUER` → ログイン / `APP_PASSWORD` → 画面のパスワード / どれもない → 守りなし)。

| 形 | 設定 | 人が分かるか |
|---|---|---|
| ログイン(OIDC。Entra ID などの SSO) | `OIDC_ISSUER`・`OIDC_CLIENT_ID`・`OIDC_CLIENT_SECRET`(7.1) | 分かる(ログインしたメールアドレスで、CCP のユーザーに結ぶ) |
| 画面のパスワード | `APP_PASSWORD` | 分からない(画面で「あなた」を選ぶ) |
| 手前の認証(IAP など、ロードバランサー側のログイン) | CCP 側は何も要らない(Google の IAP の JWT で人を知るなら `CCP_IAP_AUDIENCE`) | 手前の仕組みによる |
| なし | どれも設定しない | — |

- **守りなしのとき、CCP は、このサーバーの中(localhost)からの依頼だけを通し、外から届いた依頼には設定の案内を返します**(外から開ける状態で黙って動き出さないように)。外から開ける所で、わざと守りなしにするときだけ `CCP_AUTH=none` を書きます。
- **落とし穴**: 同じ機械の nginx などの中継から `CCP_HOST=127.0.0.1` の CCP に届けると、CCP からは「この機械の中からの依頼」に見えるので、守りなしでも通ります。この形なら、必ずログインか `APP_PASSWORD`(または中継側の認証)を付けます。
- HTTPS は、入口(ロードバランサーなど)で付けます。CCP の機械の中は HTTP でかまいません。ログインを使うときは、手前の機械が `X-Forwarded-Proto`・`Host` を付けるか、`CCP_PUBLIC_URL` を書きます(ログインのあとの戻り先の URL を作るため)。

**開けてしまっていないかの確かめ方**(外から開ける入口では必ず)

1. ログインしていないブラウザ(シークレットウィンドウ)で、入口の URL を開く。ログインの画面か、パスワードを聞かれれば正しい。**何も聞かれずに画面が出たら、すぐ `scripts/workbench.sh stop` で止め**、ログインか `APP_PASSWORD` を付けてから起動し直す。
2. 外の機械から `curl -s -o /dev/null -w '%{http_code}\n' https://<画面のアドレス>/api/me` を流す。`401`(ログイン・パスワードを求めている)か `503`(守りがなく、設定の案内を返している)か、手前の認証へ送る `302` なら守られています。**`200` なら開いています。**(`/ping` は死活確認のため、いつも認証なしで開くので、確かめには使わない)
3. `check` の「画面の守り」の行に、いまの守りの形が出ます。

### 7.1 ログインを Entra ID(SSO)にする

CCP の中に、標準の OIDC のログインがあります(`server/ccp/oidc.py`)。Google・Okta なども、発行元を替えるだけで同じです。

1. Entra の管理画面(テナントの管理者)で「アプリの登録」→ 新しいアプリ(対象は「この組織のディレクトリのみ」)。
2. 「リダイレクト URI」に、種類「Web」で `https://<画面のアドレス>/auth/callback` を足す(`check` の「画面の守り」の行に、そのまま出る)。
3. 「証明書とシークレット」でクライアントシークレットを作る(期限を控える。切れるとログインできなくなる)。
4. 「概要」から、アプリ(クライアント)ID とディレクトリ(テナント)ID を控える。
5. 環境変数に `OIDC_ISSUER=https://login.microsoftonline.com/<テナント ID>/v2.0`(`common`・`organizations` は使えない)・`OIDC_CLIENT_ID`・`OIDC_CLIENT_SECRET`(秘密の置き場所から)を入れ、起動し直す。

ID トークンに `email` を足す・ログインできる人を絞る、などの補足は [WORKBENCH.md](WORKBENCH.md) の 7.2 にあります。だれが何をできるかは、これまでどおり ⚙ →「ユーザーと承認グループ」で決めます。

## 8. 更新の手順(新しい版が届いたとき)

1. 新しい版の ZIP を、利用先の Git に入れる(`CCP AWS 版 <版>` でコミット)。
2. サーバーで:

   ```bash
   cd ~/ccp
   scripts/workbench.sh update    # git pull → パッケージ・画面のビルド → サーバーを起動し直す
   scripts/workbench.sh status    # いまの版が出る
   scripts/workbench.sh check     # 新しい版で足りなくなった設定があれば、ここで出る
   ```

- サーバーを 2 台以上で動かすときは、1 台ずつ更新します。
- 新しい版で足す設定があれば、`check` と ⚙ の「設定の状態」が、足りない行として教えます(版ごとの変更を覚えておく必要はありません)。前の版で環境変数に書いていた仕事の設定は、最初の起動で一度だけ DB に写ります(3.3)。

## 9. よくあるつまずき

まず `scripts/workbench.sh check` の `[NG]` の行を見ます(6 章)。そこで分からないときに、この表を見ます。

| 症状 | 原因 | 直し方 |
|---|---|---|
| `setup` が「Python 3.12 以上」「Node.js 20.19 以上か 22.12 以上」で止まる | 機械の道具が古い・ない | 出た物を入れて、もう一度 `setup`(Node は 20.19 以上か 22.12 以上。21 は通らない) |
| `npm ci` / `pip install` が止まる | npm・PyPI(社内のミラー)に届かない | 外への通信か、ミラーの設定を確かめる |
| 画面に「データベースにつながりません」/ `check` の DB の行が NG | `DATABASE_URL` の間違い・RDS に届かない(セキュリティグループ・サブネット)・`workbench.env` の見本の行(`<ホスト>`)が、環境変数で渡した値を上書きした | `check` の DB の行の理由を見る。環境変数で渡すなら `workbench.env` の同じ行を `#` で消す。サーバーのログ(`scripts/workbench.sh log`)にも理由が出る |
| `socket.gaierror: Name or service not known` | ホスト名が引けない。パスワードの `@` を `%40` にしていない(`@` の後ろがホスト名と読まれる) | `check` が、CCP が読んでいるホストを出す。それを直す |
| `check` の「Google の認証が取れません」(`DefaultCredentialsError`) | `GOOGLE_APPLICATION_CREDENTIALS` がない・パスが違う・ファイルを読めない。① なら、機械に AWS のロールが付いていない・IMDSv2 で届かない | パスとファイルの権限を確かめる。① の構成ファイルなら、機械のロールと、2.1 の手順 2 の `principalSet` のロール名・アカウント ID が合っているか |
| AI・BigQuery で `403` / `PERMISSION_DENIED` | サービスアカウントの役割が足りない | 2.1 の役割の表。BigQuery は、表のデータセットに「データ閲覧者」、ジョブのプロジェクトに「ジョブユーザー」。ビューなら元の表のデータセットにも |
| BigQuery で「Access Denied: … bigquery.jobs.create」 | ジョブのプロジェクトに「ジョブユーザー」がない、またはジョブのプロジェクトが違う | ⚙ →「データの取り込み」の「BigQuery の共通の設定」のジョブのプロジェクトと、その役割を確かめる |
| BigQuery で `Not found` | 表の場所の綴り・データセットの場所が違う | `<プロジェクト>.<データセット>.<テーブルかビュー>` の形で直し、「接続を確認」 |
| AI で「このモデルは、この環境(プロジェクト・地域)で見つかりません」(`404`) | モデルの名前がその場所で使えない・`GOOGLE_CLOUD_LOCATION` が違う | ⚙ →「AI の設定」で一覧から選び直す(一覧はその環境で使えるもの)。場所は、ふつう `global` |
| AI で「このモデルでは使えない設定です」(`400`) | 考える深さが、そのモデルで使えない | ⚙ →「AI の設定」で考える深さを変えて「試す」 |
| AI で「混み合っているか、使える量の上限に達しています」(`429`) | Vertex AI の割り当て | しばらく待つ。⚙ →「AI の設定」で同時に呼ぶ数を減らす |
| AI で「Vertex AI に届きませんでした」 | 外への通信(プロキシ・ファイアウォール) | 機械から Google の API に出られるかを確かめる |
| ロードバランサーから届かない(502・タイムアウト) | `CCP_HOST` が既定の `127.0.0.1` のまま・ポートの違い・セキュリティグループ | `workbench.env` に `CCP_HOST=0.0.0.0` を書いて `scripts/workbench.sh restart`。ロードバランサーの宛先のポートを `CCP_PORT`(既定 8082)に、ヘルスチェックを `/ping` に |
| 外から開くと「入口の認証が設定されていないため、外からは開けません」 | 守りがない(7 章) | ログインか `APP_PASSWORD` を設定して起動し直す |
| ログインのあと、戻り先が `http://` や違うアドレスになる | 手前の機械が `X-Forwarded-Proto`・`Host` を付けていない | `CCP_PUBLIC_URL=https://<画面のアドレス>` を書く |
| 画面が真っ白・「画面のビルドがありません」 | 画面のビルド(`dist-gcp/`)がない・古い | `scripts/workbench.sh update`(ビルドし直して起動し直す)。`check` の「画面」の行で場所を確かめる |
| ⚙ に「設定の状態」「AI の設定」「データの取り込み」が出ない | 管理する人でない・機能が公開されていない | 3.6 |
| 写真の代わりにイラストが出る | `ASSET_DIR` がない・写真がない | `check` の「写真」の行 |
| 8082 が使えない(`address already in use`) | 前に起動したサーバーが残っている | `scripts/workbench.sh stop` してから `start` |
| 設定を変えたのに効かない | 環境変数は起動し直すまで効かない。DB に写したあとは、前の版の環境変数(`BQ_*`・`GEMINI_*` など)は読まない | 環境変数なら `scripts/workbench.sh restart`。仕事の設定は ⚙ で変える(3.3) |

### それでも直らないとき

1. `scripts/workbench.sh check`(または ⚙ →「設定の状態」)の `[NG]` の行を見る。
2. `scripts/workbench.sh log` で、サーバーのログの最後を見る。
3. [WORKBENCH.md](WORKBENCH.md) の 5 章「よくあるつまずき」の表も見る。
4. それでも直らなければ、`check` の出力とログの最後を、開発の担当に伝える(**サーバーの上でコードを直さない**。次の版で上書きされる)。

## 10. 関係する文書

| 文書 | 中身 |
|---|---|
| [WORKBENCH.md](WORKBENCH.md) | コマンドの意味・引っ越し用のパック・環境変数の全部の一覧(付録 A)など、この文書の補足 |
| [BIGQUERY_EXPORT.md](BIGQUERY_EXPORT.md) | BigQuery から出してもらう出力と列の仕様(利用先のデータの担当に渡す) |
| [BIGQUERY.md](BIGQUERY.md) | BigQuery からの取り込みの仕組み |
| [AI_OUTLET.md](AI_OUTLET.md) | AI の出口(ほかの AI を使う層)の約束と見本 |
| [FEATURES.md](FEATURES.md) | 機能の一覧 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 設計の約束事(0.5 章: 置き先の違いを設定で吸収する) |
| [DATA_TABLES.md](DATA_TABLES.md) | CCP の DB の表と列の一覧 |
| [API.md](API.md) | サーバーの API の一覧 |
