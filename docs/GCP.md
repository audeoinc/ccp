# CCP の GCP 版(Cloud Run + Cloud SQL + Gemini)

Power Apps 版と**同じ画面のコード**を、GCP でも動かす仕組み。方針・進み具合・使い方をまとめる。
このリポジトリは非公開だが、プロジェクト ID・URL・パスワードは、ここにも書かない(`<…>` で示す)。

## 方針(決定済み)

- 営業支援システム(`proposal-app`)と**同じ GCP プロジェクト・リージョン(東京)・実行サービスアカウント**の、**別の Cloud Run サービス**(`contents-planner`)。
- アクセスは **HTTP Basic 認証**(環境変数 `APP_PASSWORD`。ユーザーの識別はしない)。環境は本番(PRD)1 つ。
- サーバーは **Python / FastAPI**。DB は **Cloud SQL(PostgreSQL)**。画像は **GCS**。
- AI は **Vertex AI の Gemini**(`google-genai` SDK で直接呼ぶ。ADK は使わない)。プロンプト・JSON の解釈・リトライは**画面側(TypeScript)に残し**、Power Apps 版と共有する。
- **データは Power Apps 版(Dataverse)と別**。同じ初期データから始める。同期するのは「コードと機能」。
- DB は**普段は停止**。アクセス時に自動で起動(画面に「準備中」。起動は**実測で 10〜13 分**かかる。停止は 1 分未満)、最後のアクセスから 30 分で自動停止(Cloud Scheduler。5 分おきに確認)。

## 2 つのビルドを同期させる仕組み

画面のコード(`src/`)は 1 本。ビルドの設定だけが違う。

| | Power Apps 版 | GCP 版 |
|---|---|---|
| 設定 | `vite.config.ts` | `vite.gcp.config.ts` |
| データの入出力 | 生成された `Cr854_…Service`(Dataverse) | `src/gcp/services.ts`(`/api/data` を呼ぶ互換サービス) |
| AI | `airequest` テーブル + Power Automate + Copilot Studio | `src/gcp/ai.ts` が、同じ呼び出しを `/api/ask`(Vertex AI の Gemini)に置き換える |
| 出力 | `dist/` | `dist-gcp/` |

- GCP 版は、`generated/services/*` の import を、ビルド時に互換サービスへ差し替える(撮影用のモックと同じ手法)。**画面側に、GCP 用の分岐は入れない**。
- `npm run verify` は、両方のビルドと、データ定義の突き合わせ(下)を行う。CI も同じ。

## データ定義(`server/schema.json`)

Dataverse の名前(画面が使う `cr854_scheduledat`、`_cr854_heroimage_value`)と、PostgreSQL の読みやすい名前(`scheduled_at`、`hero_image_id`)の**対応表**。これが唯一の正で、次の 3 つを作る。

1. テーブルを作る SQL(`python -m ccp.cli migrate`)
2. API の名前・値の変換(サーバーが、画面には従来どおりの Dataverse の形で返す)
3. 触ってよいテーブル・列の許可リスト(それ以外は 400)

**Dataverse に列を足したら**: `pa app add data-source …` で生成し直す → `server/schema.json` にも追記 → `npm run verify`(`scripts/check-schema.mjs` が、食い違いを検出する)→ DB には、デプロイ後にサーバーが最初に DB へつないだとき、足りないテーブル・列が自動で足される(`server/ccp/data_api.py` の `_ensure_schema`。手で `migrate` を実行してもよい。何度実行しても同じ)。

選択肢の値は、Dataverse と同じ数値(例: 588230000)のまま `integer` で持つ。

## `/api/data`(サーバー)

`GET/POST /api/data/{テーブル}`、`GET/PATCH/DELETE /api/data/{テーブル}/{id}`。テーブル名は Dataverse の名前(`cr854_deliverycards`)。
戻り値は `{success, data}` / `{success:false, error:{message, code?}}`(Power Apps SDK と同じ形)。

- 絞り込み(`filter`): `項目 eq 値` を `and` でつなぐ範囲(`eq/ne/gt/ge/lt/le`、`null`)。値は必ずパラメータとして渡す。
- 並べ替え(`orderBy`)、`select`、`top`、`skip`。
- 書き込みの参照は、Dataverse と同じ `cr854_xxx@odata.bind: "/cr854_yyys(<id>)"`(`null` で参照を外す)。
- DB に接続できないときは 503 + `code: "db_unavailable"`。

## AI(`/api/ask`)

- 画面側の `askAgent`(プロンプトの作成・JSON の解釈・やり直し・チャット・英語化)は、**Power Apps 版と共通のまま**。差し替えるのは、依頼文を送って返答のテキストを受け取る部分だけ(`src/gcp/ai.ts`)。
- サーバーは、依頼文を Gemini に渡して、返答のテキストをそのまま返す(`server/ccp/ai.py`)。返答は JSON 形式で出力させる。
- 設定(環境変数。営業支援システムと同じ Vertex AI): `GOOGLE_CLOUD_PROJECT`(コードには書かない)、`GOOGLE_CLOUD_LOCATION`(既定 global)、`GEMINI_MODEL`(コードの既定は gemini-3.5-flash。本番は gemini-3.8-flash に設定)、`GEMINI_THINKING`(minimal / low / medium / high。既定 low)。
- 1 回の「すべてAIで下書き」は、手元の確認で約 40 秒(Power Apps 版の、フロー経由のポーリングより速い)。

## 手元での動かし方

必要なもの: Python 3.12 以上、Node、`gcloud`(ログイン済み)。

```bash
# 1. サーバーの環境(初回だけ)
cd server && python -m venv .venv && .venv/Scripts/python.exe -m pip install -r requirements.txt

# 2. 接続の設定(値は、手元の環境変数。リポジトリには置かない)
#    CLOUD_SQL_INSTANCE=<プロジェクトID>:<リージョン>:<インスタンス名>
#    DB_PASSWORD=<Secret Manager のアプリ用パスワード>
#    APP_PASSWORD=<Basic 認証のパスワード。手元では任意>
#    GOOGLE_CLOUD_PROJECT=<プロジェクトID>   ← AI(Vertex AI)用
#    CCP_DEV_GCLOUD=1   ← 手元だけ。gcloud の短期トークンで Cloud SQL / Vertex AI に接続する
# 別の PostgreSQL を使うなら DATABASE_URL=postgresql+asyncpg://user:pass@host/db

# 3. テーブルの作成と初期データ(DB が起動している間に)
.venv/Scripts/python.exe -m ccp.cli migrate
.venv/Scripts/python.exe -m ccp.cli seed --reset      # server/seed.json を入れる
.venv/Scripts/python.exe -m ccp.cli counts

# 4. 画面をビルドして、サーバーを起動(http://localhost:8080 。Basic 認証のユーザー名は何でもよい)
npm run build:gcp
cd server && .venv/Scripts/python.exe -m uvicorn ccp.main:app --port 8080

# 動作確認(画面を開いて、カードを開けるかを見る)
CCP_PASSWORD=<APP_PASSWORD> node scripts/gcp-smoke.mjs
#   CCP_SMOKE_AI=1    … テーマ案を、実際に Gemini に頼む(費用がかかる)
#   CCP_SMOKE_AI=full … 空のカードを開いて、すべて AI で下書きさせる(約 40 秒。保存はしない)
```

画面を直しながら動かすときは、サーバーを 8080 で起動したまま `npm run dev:gcp`(5191。`/api` は 8080 に中継)。

**Vertex AI Workbench(Agent Platform の Workbench)のノートブックで動かすとき**: サーバーを、たとえば 8081 で起動し(`uvicorn ccp.main:app --port 8081`)、Jupyter の中継 `https://<ノートブックの URL>/proxy/8081/` で開く(**末尾の `/` を付ける**。付けないと、画面のファイルの相対パスがずれる)。画面は、読み込んだ JS の場所から置き場所(`/proxy/8081/`)を求め、`/api/…`・`/img/…` をその下に送るので、ビルドの設定を変える必要はない(`src/appRoot.ts`、`vite.gcp.config.ts` の `base: './'`)。Cloud Run(置き場所が `/`)でも、同じビルドのまま動く。

### 外にアクセスできない環境(Workbench)に、本番のデータと画像を持ち込む(引っ越し用のパック)

クライアントの Vertex AI Workbench のように、サーバーから外(本番の DB・GCS)にアクセスできない環境では、初期データ(`seed --reset`)だと、画像がイラストになり、配信のデータも本番と違う。
本番の**すべてのデータと画像**を 1 つの ZIP(引っ越し用のパック。`server/ccp/pack.py`)にして、ブラウザ経由で持ち込む。

1. **書き出す**(その環境のブラウザで、本番の画面を開く): ⚙ →「データと画像を書き出す(別の環境へ移す)」。`ccp-pack-<日時>.zip` がダウンロードされる(2026-10 時点で約 4MB、画像 142 点)。
2. **Workbench に上げる**: Jupyter の画面の「アップロード」で、ZIP を `ccp/server/` に置く。
3. **取り込む**(Workbench のターミナル。Linux なので `.venv/bin/python`):
   ```bash
   cd ccp/server
   .venv/bin/python -m ccp.cli import-pack ccp-pack-<日時>.zip          # 件数を見せるだけ(何も変えない)
   .venv/bin/python -m ccp.cli import-pack ccp-pack-<日時>.zip --yes    # DB の中身を置き換え、画像を server/images に展開
   ```
   DB の中身は、**すべて置き換わる**(Workbench で入力したデータは消える)。作った日時・変えた日時は、元のまま残る。
4. **画像をフォルダから配る設定で、サーバーを起動する**:
   ```bash
   ASSET_DIR=$PWD/images .venv/bin/python -m uvicorn ccp.main:app --port 8081
   ```
   `https://<ノートブックの URL>/proxy/8081/` を開く(末尾の `/` を付ける)。

**開発を続けながら、Workbench を最新にする**: コードは `git pull` → `npm ci` → `npm run build:gcp` → サーバーの起動し直し。本番のデータ・画像にそろえたいときだけ、パックを書き出して取り込む(上の 1〜4)。
画像(`server/images/`)は、権利のある素材なので Git には入れない(`.gitignore` 済み)。

初期データ(`server/seed.json`)は、撮影用のモックと同じ元データ(`docs/*.csv` → `src/mock/seed.ts`)から作る。`seed.ts` を直したら `npm run seed:export` で書き出し、`seed.json` もコミットする。

## テスト

- `python -m unittest discover server/tests`(DB に接続しない。名前・値の変換と、絞り込みの解析)
- `node scripts/check-schema.mjs`(データ定義と生成モデルの突き合わせ)
- `node scripts/gcp-smoke.mjs`(サーバーと DB をつないだ画面の確認)

## Cloud Run へのデプロイ(段階 3)

サービス名 `contents-planner`(営業支援システムと同じプロジェクト・リージョン・実行サービスアカウント)。値は `<…>` で示す。

**前提(作成済みのもの)**: Cloud SQL インスタンス `contents-planner-db`(普段は停止)/ GCS バケット(最後のアクセスの時刻を置く)/ Secret Manager の `contents-planner-db-app-password` と `contents-planner-app-password`(Basic 認証のパスワード。ユーザー名は何でもよい)/ Scheduler 用のサービスアカウント `ccp-scheduler`。実行サービスアカウントに、2 つのシークレットの `secretmanager.secretAccessor` を付けてある。

```bash
gcloud run deploy contents-planner --source . --project <プロジェクトID> --region asia-northeast1   --allow-unauthenticated --concurrency=8 --max-instances=1 --min-instances=0 --memory=512Mi --cpu=1 --timeout=300   --service-account=<実行サービスアカウント>   --set-env-vars "GOOGLE_CLOUD_PROJECT=<プロジェクトID>,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=gemini-3.8-flash,GEMINI_THINKING=low,CLOUD_SQL_INSTANCE=<プロジェクトID>:asia-northeast1:contents-planner-db,DB_USER=ccp_app,DB_NAME=ccp,DB_CONTROL=1,DB_IDLE_MINUTES=30,STATE_BUCKET=<バケット名>,IDLE_CHECK_AUDIENCE=<サービスの URL>,IDLE_CHECK_SA_EMAIL=ccp-scheduler@<プロジェクトID>.iam.gserviceaccount.com"   --set-secrets "DB_PASSWORD=contents-planner-db-app-password:latest,APP_PASSWORD=contents-planner-app-password:latest"
```

チームメンバーが反映する手順(権限と、`npm run deploy:gcp`)は、[ONBOARDING.md](ONBOARDING.md) の「GCP 版への反映」。2 回目以降は、環境変数とシークレットが残るので、`gcloud run deploy contents-planner --source . --project <プロジェクトID> --region asia-northeast1` だけでよい(コードを変えても、Cloud Run は自動では更新されない)。

**自動停止(Cloud Scheduler)**: 数分おきに `/internal/idle-check` を、Scheduler 用のサービスアカウントの署名つきトークン(OIDC。宛先はサービスの URL)で呼ぶ。サーバーが、最後のアクセスから `DB_IDLE_MINUTES`(既定 30)分たっていれば、DB の停止を依頼する。

```bash
gcloud scheduler jobs create http ccp-idle-check --project <プロジェクトID> --location asia-northeast1   --schedule="*/5 * * * *" --http-method=POST --uri="<サービスの URL>/internal/idle-check"   --oidc-service-account-email=ccp-scheduler@<プロジェクトID>.iam.gserviceaccount.com --oidc-token-audience="<サービスの URL>"
```

**パスワードの確認**: Secret Manager の `contents-planner-app-password`(`gcloud secrets versions access latest --secret=contents-planner-app-password`)。

**DB の自動起動**: 画面が `/api/data` を呼んだとき DB が停止中なら、サーバーが起動を依頼して 503(`db_starting`)を返し、画面に「準備中」を出す(**実測で 10〜13 分**。準備ができると自動で読み込み直す)。手動で止める・起動するときは、`gcloud sql instances patch contents-planner-db --activation-policy=NEVER`(停止)/ `ALWAYS`(起動)。

**毎日 21:00(日本時間)に、必ず停止する**: Cloud Scheduler のジョブ `ccp-stop-db-nightly`(`0 21 * * *`、タイムゾーン Asia/Tokyo)が、Cloud SQL の稼働ポリシーを `NEVER` にして、DB を停止する(止め忘れ防止)。**この停止は、下の `keep_until` を見ない**(無条件)。21:00 以降も作業する日は、ジョブを一時停止する(`gcloud scheduler jobs pause ccp-stop-db-nightly --location asia-northeast1 --project <プロジェクトID>`。終わったら `resume`)。止まったあとは、次のアクセスで自動起動する(約 11 分)。

**一時的に、自動停止させない(作業中など)**: バケットに `state/keep_until.json`(`{"ts": <UNIX 秒>}`)を置くと、その時刻までは、アクセスがなくても停止しない。時刻が過ぎれば、自然に効かなくなる(消す必要はない)。

```bash
python -c "import datetime as d;print(int(d.datetime(2026,10,6,12,0,tzinfo=d.timezone.utc).timestamp()))"   # 例: 2026-10-06 21:00(日本時間)
echo '{"ts": 1791288000}' | gcloud storage cp - gs://<バケット名>/state/keep_until.json
```

## 画像の差し替え(商品・ヒーロー画像)

GCP 版だけの機能。用意した画像から、商品・ヒーロー画像のデータを作って、DB を置き換える(`server/ccp/importer.py`)。
画像は **Git には入れない**(権利のある素材のため。`import/` は `.gitignore` 済み)。GCS のバケット(`images/products/…`、`images/heroes/…`)に置き、サーバーの `/img/…` が配信する(バケットは非公開で、サイトと同じ Basic 認証がかかる)。DB の画像 URL は `/img/products/417352.jpg` の形。

**置き場所**(アプリのルートの `import/`。jpg / png / webp。ファイル名の順に、コードを付ける)

| フォルダ | コード | 想定の点数 |
|---|---|---|
| `import/products/jp/` | 6 桁の数字(4 から始まる。例: 417352) | 30 |
| `import/products/us/` | 同上 | 30 |
| `import/heroes/jp/` | H01〜(ファイル名の順) | 20 |
| `import/heroes/us/` | UH01〜(ファイル名の順) | 20 |

商品コードは、画像の内容から決まる(同じ画像なら、同じコード。画像を足しても、既存のコードは変わらない。重なったときは、次の番号)。

**手順**(`server/` で、手元の環境変数を設定してから。`pip install -r requirements-tools.txt` が、初回に必要)

```bash
python -m ccp.importer analyze         # Gemini が画像を見て、名前・カテゴリ・季節・天候・説明(ヒーローは、用途・季節・タグ・説明)を作る
python -m ccp.importer build           # 価格・在庫・売上・評価・週次実績・販売方針を、デモ用に作って、import/out/data.json に組み立てる(ここで内容を確認・修正できる)
python -m ccp.importer upload          # 画像を縮小(商品 1000px・ヒーロー 1920px)して、GCS に置く
python -m ccp.importer apply           # 置き換える内容の確認だけ
python -m ccp.importer apply --yes     # DB の、商品・ヒーロー画像・週次実績・販売方針を置き換える
```

- **画像が US / JP 共通のとき:** `import/products/jp/` と `import/heroes/jp/` を**空のまま**にすると、`us` の画像を、日本向けにも使う。日本向けは、同じ画像から、**日本語の名前・説明**で、**別の商品・ヒーロー画像**(別の商品コード、円の価格)として作る。`jp` のフォルダに画像を入れると、そちらが優先される。
- 日本向けは日本語、US 向けは英語で、名前・説明を作る。カテゴリ・季節・天候・用途は、アプリの選択肢(カテゴリ 7 種、季節は 秋 / 冬 / 秋冬 / 通年、天候は 晴れ / 雨の日 / 寒い日、用途は 新作 / 特集 / セール / 会員 / イベント)から選ぶ。
- 画像から分からない数値(価格・在庫・売上トレンド・評価・週次実績・販売方針)は、**デモ用の値**を、コードごとに決まった乱数で作る(同じ入力なら、同じ結果)。
- 解析した結果は `import/out/analysis.json` に残り、画像を足して再実行しても、解析済みの画像は、再度 Gemini に頼まない。
- `--only us` / `--only jp`(`build` と `apply`): その市場の画像・データだけを置き換える。もう一方の市場のデータは、そのまま残る(`apply` は、`data.json` に別の市場のデータが混ざっていると、止まる)。
- `apply` は、配信カードの**商品の選択**(`delivery_products`)と、**メイン画像の選択**も外す(カードの文章・日時・状態はそのまま)。元の初期データに戻すときは `python -m ccp.cli seed --reset`。

## 進み具合

| 段階 | 内容 | 状態 |
|---|---|---|
| 0 | Cloud SQL・GCS バケットの作成(DB は停止状態で運用) | 完了 |
| 1 | データ層(定義・変換・`/api/data`・互換サービス・初期データ) | 完了(手元のサーバー + Cloud SQL で確認) |
| 2 | AI(`/api/ask` → Gemini、画面側の差し替え) | 完了(手元で、テーマ案・すべて AI で下書きまで確認) |
| 3 | Cloud Run へのデプロイ・Basic 認証・DB の自動起動/停止(画像の GCS 化は、必要になったときに) | 完了(`contents-planner` を公開、Scheduler `ccp-idle-check` を作成。自動停止・自動起動を実機で確認) |
| 4 | 両ビルドの契約テスト・CI の拡充 | 一部(`verify` と CI に、GCP ビルド・データ定義の突き合わせ・サーバーのテストを追加済み) |

## 開いたときの初期設定(GCP 版)

`vite.gcp.config.ts` の `define` で、GCP 版のビルドだけの初期値を決めている(Power Apps 版には、影響しない): 国の絞り込みは **US**(`VITE_DEFAULT_COUNTRY`)、画面の言語は **English**(`VITE_DEFAULT_LANG`)。言語は、ブラウザごとに保存した選択が、あればそちらを優先する。

## 運用メモ

- **Cloud Run の `/healthz` は、Google が予約していて使えない**(404 になる)。死活確認は `/ping`。
- Cloud SQL の API は、停止中でも `state` を `RUNNABLE` と返す。**停止かどうかは、稼働ポリシー(`NEVER`)で見る**(`dbctl.classify`)。
- 起動の途中は、状態が「稼働」でも接続できない時間がある。サーバーは、接続の失敗を 500 ではなく 503(`db_starting`)として返し、`/api/db/status` は、実際に接続できるかを確かめてから「稼働中」と返す。
- パスワード・値の確認や変更は、Secret Manager と Cloud Run の環境変数で行う(リポジトリには置かない)。

## 独自ドメイン(サブドメイン)

営業支援システム(`proposal-sample.<ドメイン>`)と同じ、Cloud Run のドメインマッピング。CCP は `ccp.<ドメイン>`。

1. `gcloud beta run domain-mappings create --service contents-planner --domain ccp.<ドメイン> --region asia-northeast1 --project <プロジェクトID>`
2. DNS(レジストラ)に、CNAME を追加する: 名前 `ccp` → 値 `ghs.googlehosted.com.`
3. 証明書の発行を待つ(数分〜1 時間)。状態は `gcloud beta run domain-mappings describe --domain ccp.<ドメイン> …` の `CertificateProvisioned` / `Ready` で確認する。

Scheduler の宛先(`IDLE_CHECK_AUDIENCE`)は、独自ドメインではなく、`run.app` の URL のままにする。
