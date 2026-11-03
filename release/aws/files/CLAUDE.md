# CLAUDE.md — Campaign Contents Planner(CCP / 配信コンテンツプランナー)AWS 版(AI コーディングアシスタント向け)

React 19 + TypeScript + Vite + Fluent UI v9 の画面と、Python(FastAPI)のサーバー。**AWS などの Linux のサーバー**の上で動く。
全体像は [README.md](README.md)、サーバーでの動かし方は [docs/AWS.md](docs/AWS.md)、設計の約束事は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
いまの版は [VERSION.txt](VERSION.txt)。

## このリポジトリについて

- コードは、版ごとに ZIP で届き、利用先の Git に入れて管理している。
- **このリポジトリの中で、コードを直さない。** 次の版で上書きされる。直したい不具合・足したい手順に気づいたら、内容を人に伝える(開発の担当が直して、次の版で届ける)。
- **置き先でコードを直したくなったら、汎用になっていない所の見つけ物。** その環境で直さず、開発の担当に伝える(置き先の違いは、設定とアダプターで吸収する作り。[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) の 0.5 章)。

## サーバーで作業するとき

- **まず [docs/AWS.md](docs/AWS.md)(手順書)を読む。** 立ち上げ・更新・チェックリストが書いてある。くわしい手順とよくあるつまずきは [docs/WORKBENCH.md](docs/WORKBENCH.md)(「Workbench」は、CCP を動かしているサーバーと読み替える)。
- **操作は `scripts/workbench.sh` を使う**(`setup` / `update` / `start` / `stop` / `restart` / `status` / `check` / `log`。名前は Workbench だが、Linux のサーバーならそのまま使える。設定の読み込みも、裏での起動も、スクリプトが行う)。
- **困ったら、最初に `cd server && .venv/bin/python -m ccp.cli check` を実行する**(設定・DB への接続・BigQuery・AI・画面のビルドを確かめる。パスワードは出さず、何も変えない)。`[NG]` の行の → を直す。画面では ⚙ →「設定の状態」。
- **環境:** Linux(Python は `.venv/bin/python`)。DB は PostgreSQL(`DATABASE_URL`)。AI は Vertex AI の Gemini、データの取り込みは BigQuery(Google の認証情報は、その機械の標準の方法 `google.auth.default` で渡す。手順書の 2 章)。
- **してはいけないこと:** サーバーからの `git push`、`server/workbench.env`(パスワードを含む)や写真のフォルダを Git に入れること、HTTPS とログインなしで外から開ける状態にすること。

## コードを読むときの手がかり

- データの名前は、画面・API・PostgreSQL で同じ(表 `delivery_cards`、列 `scheduled_at` など)。列・テーブルの定義は `server/schema.json`。
- 画面の文言は `t('日本語', 'English')`。AI の呼び出しは `askAgent`(`src/aiSelect.ts`)→ サーバーの `/api/ask` → Gemini(または AI の出口の層)。
- ソースの地図は [docs/SOURCE_MAP.md](docs/SOURCE_MAP.md)、これから作る機能は [docs/BACKLOG.md](docs/BACKLOG.md)。
- 利用者の画面に出る文言・データに、個人情報や機密を、サンプルとして埋め込まない。
