# CLAUDE.md — Campaign Contents Planner(CCP / 配信コンテンツプランナー)AWS 版(AI コーディングアシスタント向け)

React 19 + TypeScript + Vite + Fluent UI v9 の画面と、Python(FastAPI)のサーバー。**AWS などの Linux のサーバー**の上で動く。
データは PostgreSQL、商品などのデータは BigQuery から取り込み、AI は Vertex AI の Gemini(または AI の出口の層)。
いまの版は [VERSION.txt](VERSION.txt)。

## まず読む文書

| 何をするとき | 読む文書 |
|---|---|
| 立ち上げ・設定・更新・困りごと(**最初にこれ**) | [docs/AWS.md](docs/AWS.md) |
| **スキーマ・画面を変える、新しい版を取り込む** | [docs/AWS_CUSTOMIZE.md](docs/AWS_CUSTOMIZE.md) |
| くわしい手順・よくあるつまずきの補足 | [docs/WORKBENCH.md](docs/WORKBENCH.md)(「Workbench」は、CCP を動かしているサーバーと読み替える) |
| 画面の各機能が何をするか(利用者に聞かれたとき) | [docs/FEATURES.md](docs/FEATURES.md)、使い方の流れは [docs/FLOWS.md](docs/FLOWS.md) |
| データの表と列 | [docs/DATA_TABLES.md](docs/DATA_TABLES.md)(ZIP を作るときに `server/schema.json` から自動で作る) |
| サーバーの API | [docs/API.md](docs/API.md)(ZIP を作るときに `server/ccp/` から自動で作る) |
| BigQuery の取り込み・表の約束 | [docs/BIGQUERY.md](docs/BIGQUERY.md)、[docs/BIGQUERY_EXPORT.md](docs/BIGQUERY_EXPORT.md) |
| ほかの AI につなぐ(AI の出口) | [docs/AI_OUTLET.md](docs/AI_OUTLET.md) |
| 設計の約束事・ソースの地図 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[docs/SOURCE_MAP.md](docs/SOURCE_MAP.md) |
| 承認の流れ・販売方針 | [docs/APPROVAL.md](docs/APPROVAL.md)、[docs/POLICY.md](docs/POLICY.md) |

大きい文書は、まるごと読まずに、見出しや ID で grep して、要る所だけを読む。

## 使う道具

すべて `scripts/workbench.sh`(名前は Workbench だが、Linux のサーバーならそのまま使える。設定 `server/workbench.env` の読み込みも、裏での起動も、スクリプトが行う)。

| コマンド | すること |
|---|---|
| `scripts/workbench.sh setup` | 初回の準備(足りない道具を最初に教える → Python の環境・パッケージ・画面のビルド・設定ファイルの用意) |
| `scripts/workbench.sh start` / `stop` / `restart` | サーバーの起動・停止・起動し直し |
| `scripts/workbench.sh status` | 動いているか・いまの版 |
| `scripts/workbench.sh update` | `main` の最新にして(git pull → ビルド)、起動し直す |
| `scripts/workbench.sh check` | 設定・DB・BigQuery・AI・画面のビルドを確かめる(`python -m ccp.cli check` と同じ。何も変えない) |
| `scripts/workbench.sh log` | サーバーのログの最後 |

## 困ったら、最初に流すもの

```bash
scripts/workbench.sh check      # [NG] の行の → を直す。画面では ⚙ →「設定の状態」
scripts/workbench.sh log        # サーバーのログの最後
```

**足りない設定と直し方は、`check` と画面(⚙ →「設定の状態」)が教える。** 手順書に書いてあることを覚えておく必要はない。`check` の出力の `[NG]` の行から直し、直らなければ [docs/AWS.md](docs/AWS.md) の「よくあるつまずき」を見る。

## このリポジトリについて

- コードは、版ごとに ZIP で届く。ZIP の中身はブランチ `vendor` に入れ、`main` にマージして動かす(総入れ替えはしない)。
- **BigQuery のデータに合わせて、スキーマ・表の構成・画面を変えてよい。** その前と版の取り込みの前に、[docs/AWS_CUSTOMIZE.md](docs/AWS_CUSTOMIZE.md) を読む(調整の順番・置き場所・取り込みの手順・確認)。
- AWS 側のファイルは `src/client/`・`server/ccp/client/`・`docs/client/` に置く。共通のコードを直したら、`docs/client/CHANGES.md` に書く。
- **サーバーの置き方の違い**(認証・AI の出口・ファイルの置き場所など)でコードを直したくなったら、ここで直さず、内容(`check` の出力・ログの最後・やったこと)を人に伝える(置き先の違いは、設定とアダプターで吸収する作り。[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) の 0.5 章)。
- 開発側のリポジトリは公開されている。開発側へ伝える内容からは、相手の名前・表や列の名前・実際の値を除く。

## してはいけないこと

- サーバーの上でのコミットと `git push`(作業は別の作業コピーで行う。サーバーは `main` を取得するだけ)。
- ブランチ `vendor` を手で直す、`vendor` で `ccp/` の外を消す。
- 秘密を Git に入れる: `server/workbench.env`(DB のパスワードなど)、Google の鍵のファイル、写真のフォルダ。
- **HTTPS とログインなしで、外から開ける状態にする**(画面のパスワード `APP_PASSWORD` か、手前のログインを必ず付ける)。
- 人の確認なしに、DB の中身を消す・置き換える操作をする。
- 本番の環境への反映を、人の指示なしに行う(反映は、人が手で行う)。

## コードを読むときの手がかり

- データの名前は、画面・API・PostgreSQL で同じ(表 `delivery_cards`、列 `scheduled_at` など)。列・テーブルの定義は `server/schema.json`([docs/DATA_TABLES.md](docs/DATA_TABLES.md))。
- 設定は 2 か所: 起動に要るもの・秘密は環境変数(`server/workbench.env`)、仕事の設定(BigQuery の表の場所・AI のモデルなど)は ⚙ の画面で DB(表 `app_settings`)に持つ(`server/ccp/appsettings.py`)。
- 画面の文言は `t('日本語', 'English')`。AI の呼び出しは `askAgent`(`src/aiSelect.ts`)→ サーバーの `/api/ask` → Gemini(または AI の出口の層)。
- 健康診断は `server/ccp/health.py`(画面と `check` の両方が使う)。
- 利用者の画面に出る文言・データに、個人情報や機密を、サンプルとして埋め込まない。
