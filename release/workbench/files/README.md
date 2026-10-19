# Campaign Contents Planner(CCP)— 配信コンテンツプランナー(Workbench 版)

メール・アプリの**配信コンテンツ**(テーマ、メイン画像、ヘッドライン・コピー、セクションごとの商品、制作指示)を、AI の提案を選びながら企画し、配信の結果を振り返るアプリです。
画面は React + TypeScript、サーバーは Python(FastAPI)。**Vertex AI Workbench** の上で動き、データは **PostgreSQL**、AI は **Gemini(Vertex AI)**、商品などのデータは **BigQuery** から取り込みます。
日本語・英語のどちらでも使えます。

この版の名前と、元になった開発側のコミットは [VERSION.txt](VERSION.txt) にあります。

## はじめに読むもの

| やりたいこと | 文書 |
|---|---|
| Workbench で立ち上げる・更新する・困ったとき | [docs/WORKBENCH.md](docs/WORKBENCH.md)(手順書)、[docs/WORKBENCH_ARCHITECTURE.md](docs/WORKBENCH_ARCHITECTURE.md)(構成) |
| 新しい版を受け取って、Git に入れる・Workbench に届ける | [docs/UPDATE.md](docs/UPDATE.md) |
| BigQuery からの取り込み | [docs/BIGQUERY.md](docs/BIGQUERY.md)、[docs/BIGQUERY_EXPORT.md](docs/BIGQUERY_EXPORT.md)、[docs/BIGQUERY_CONVERT.md](docs/BIGQUERY_CONVERT.md) |
| 機能の一覧・使い方の流れ | [docs/FEATURES.md](docs/FEATURES.md)、[docs/FLOWS.md](docs/FLOWS.md)、[docs/USER_STORIES.md](docs/USER_STORIES.md) |
| 各機能の理由と開発の経緯 | [docs/FEATURE_REASONS.md](docs/FEATURE_REASONS.md)、[docs/PRINCIPLES.md](docs/PRINCIPLES.md) |
| 承認の流れ・販売方針 | [docs/APPROVAL.md](docs/APPROVAL.md)、[docs/POLICY.md](docs/POLICY.md)、[docs/POLICY_FORMAT.md](docs/POLICY_FORMAT.md) |
| 設計の約束事・ソースの地図 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[docs/SOURCE_MAP.md](docs/SOURCE_MAP.md) |
| これから作る機能 | [docs/BACKLOG.md](docs/BACKLOG.md) |

## よく使うコマンド(Workbench の上で)

```bash
scripts/workbench.sh update    # 最新の版にして(git pull → ビルド)、サーバーを起動し直す
scripts/workbench.sh status    # 動いているか・いまの版
scripts/workbench.sh check     # 設定・DB への接続・写真・画面のビルドを確かめる(困ったら、まずこれ)
```

画面は Jupyter の中継 `https://<ノートブックの URL>/proxy/8082/` で開きます(末尾の `/` が必要)。

## 主な機能

- 配信カレンダー(月 / 週 / 一覧 / 比べる。国・チャネル・部署・ステータスで絞り込み)
- 配信カードの編集: 4 ペイン(配信情報 / コンテンツ生成 + AI チャット / プレビュー / 商品情報)
- AI による案づくり: テーマ、テンプレート、メイン画像、ヘッドライン・コピー、セクションの見出し・コピー・商品、制作指示
- 週のレビューと承認、配信の結果(ヒートマップ・比較・PDF)、配信前の在庫などのアラート
- 日本語 / English の切り替え。US / JP の商品を、配信カードの国で自動的に使い分け

## 技術スタック

React 19 / TypeScript / Vite 7 / Fluent UI v9 / フォント: Inter + Noto Sans JP(同梱)
サーバー: Python 3.12 / FastAPI / SQLAlchemy(asyncpg)/ google-genai / google-cloud-bigquery

## コードの変更について

このリポジトリのコードは、版ごとに届くものです。**このリポジトリの中で、コードを直接直さないでください**(次の版で上書きされます)。
直したい不具合・足したい機能は、内容を開発の担当に伝えてください。次の版に入れて届けます(手順は [docs/UPDATE.md](docs/UPDATE.md))。

手元で画面だけを確かめたいときは、サンプルデータで動かせます(サーバーも DB も要りません):

```bash
npm ci
npx vite --config vite.mock.config.ts     # http://localhost:5190
```
