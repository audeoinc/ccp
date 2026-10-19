# CLAUDE.md — Campaign Contents Planner(CCP / 配信コンテンツプランナー)Workbench 版(AI コーディングアシスタント向け)

React 19 + TypeScript + Vite + Fluent UI v9 の画面と、Python(FastAPI)のサーバー。利用先の **Vertex AI Workbench** の上で動く。
全体像は [README.md](README.md)、Workbench での動かし方は [docs/WORKBENCH.md](docs/WORKBENCH.md)、設計の約束事は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
いまの版は [VERSION.txt](VERSION.txt)。

## このリポジトリについて

- コードは、版ごとに ZIP で届き、利用先の Git に入れて管理している(手順は [docs/UPDATE.md](docs/UPDATE.md))。
- **このリポジトリの中で、コードを直さない。** 次の版で上書きされる。直したい不具合・足したい手順に気づいたら、内容を人に伝える(開発の担当が直して、次の版で届ける)。

## Workbench で作業するとき

- **まず [docs/WORKBENCH.md](docs/WORKBENCH.md)(手順書)を読む。** 立ち上げ・更新・よくあるつまずきが、すべて書いてある。
- **操作は `scripts/workbench.sh` を使う**(`setup` / `update` / `start` / `stop` / `restart` / `status` / `pg-start` / `check` / `import <ZIP>` / `log`。設定の読み込みも、裏での起動も、Workbench の中の PostgreSQL の起動も、スクリプトが行う)。
- **困ったら、最初に `cd server && .venv/bin/python -m ccp.cli check` を実行する**(設定・DB への接続・写真・画面のビルドを確かめる。パスワードは出さず、何も変えない)。`[NG]` の行と、手順書の「よくあるつまずき」の表から直す。
- **環境:** Linux(Python は `.venv/bin/python`)。DB は PostgreSQL に直接つなぐ(`DATABASE_URL`。Workbench の中で動かしているなら、ホストは `localhost`)。AI は Vertex AI の Gemini(`GOOGLE_CLOUD_PROJECT`)。画面は Jupyter の中継 `https://<ノートブックの URL>/proxy/8082/` で開く(末尾の `/` が必要)。
- **データと写真は「引っ越し用のパック」で持ち込む**(`python -m ccp.cli import-pack <ZIP> --yes` → `ASSET_DIR` を付けてサーバーを起動)。`import-pack --yes` は、Workbench の DB の中身を**すべて置き換える**ので、人に確認してから実行する。
- **サーバーは、DB の設定を読み込んだのと同じターミナルで起動する**(`scripts/workbench.sh` を使えば、気にしなくてよい)。別のターミナルで起動すると、画面に「データベースにつながりません」と出る。
- **してはいけないこと:** Workbench からの `git push`、`server/workbench.env`(パスワードを含む)や `server/images/`(写真)を Git に入れること、人の確認なしの `import-pack --yes`。

## コードを読むときの手がかり

- データの名前は、画面・API・PostgreSQL で同じ(表 `delivery_cards`、列 `scheduled_at` など)。列・テーブルの定義は `server/schema.json`。
- 画面の文言は `t('日本語', 'English')`。AI の呼び出しは `askAgent`(`src/aiSelect.ts`)→ サーバーの `/api/ask` → Gemini。
- ソースの地図は [docs/SOURCE_MAP.md](docs/SOURCE_MAP.md)、これから作る機能は [docs/BACKLOG.md](docs/BACKLOG.md)。
- 利用者の画面に出る文言・データに、個人情報や機密を、サンプルとして埋め込まない。
