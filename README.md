# Campaign Contents Planner(CCP)— 配信コンテンツプランナー

メール・アプリの**配信コンテンツ**(テーマ、メイン画像、ヘッドライン・コピー、セクションごとの商品、制作指示)を、AI の提案を選びながら企画し、配信の結果を振り返るアプリ。
画面は React + TypeScript、サーバーは Python(FastAPI)。Google Cloud の **Cloud Run** で動き、データは **PostgreSQL(Cloud SQL)**、AI は **Gemini(Vertex AI)**。
US チームと JP チームが、日本語・英語のどちらでも使える。

- 新しく参加する人は、まず **[docs/ONBOARDING.md](docs/ONBOARDING.md)** を読む。
- サーバー・DB・AI の仕組みと動かし方は **[docs/GCP.md](docs/GCP.md)**。
- Power Apps 版は 2026-10-16 に廃止し、ソースも削除した。

## 主な機能

- 配信カレンダー(月 / 週(商品 / 進み具合 / 時刻)/ 一覧 / 商品別 / 比べる。国はヘッダーで選び、チャネル・種類・ステータス・担当で絞り込み)
- 配信カードの編集: 5 ペイン(配信情報 / コンテンツ生成 + AI チャット / プレビュー / 商品情報 / プロセス(承認・引き継ぎ・やり取り・タスク))
- AI による案づくり: テーマ、テンプレート、メイン画像、ヘッドライン・コピー、セクションの見出し・コピー・商品、制作指示
- 週のレビューと承認、配信前の在庫などのアラート
- 制作の依頼と制作のページ(依頼 → 受け取る → 制作 → 仕上がりの確認 → 送る。HTML のエディタとプレビュー)
- 配信の結果(ヒートマップ・比較・PDF・販売チャネルごとの順位)、商品・カテゴリの週の指標
- 日本語 / English の切り替え。US / JP の商品を、配信カードの国で自動的に使い分け

## 技術スタック

React 19 / TypeScript / Vite 7 / **Fluent UI v9**(Fluent 2。MUI は使わない)/ フォント: Inter + Noto Sans JP(同梱)
サーバー: Python 3.12 / FastAPI / SQLAlchemy(asyncpg)/ google-genai

## 開発の始め方

```bash
npm ci                                    # 依存関係のインストール
npx vite --config vite.mock.config.ts     # サンプルデータで動かす(http://localhost:5190。サーバーも DB も要らない)
```

本物のサーバー(DB・AI)につないで動かす方法は、[docs/GCP.md](docs/GCP.md) の「手元での動かし方」。

確認(push の前に、必ず通す):

```bash
npm run verify     # データ定義の照合・型チェック・lint・ビルド
```

## 本番への反映

```bash
npm run deploy:gcp
```

`main` に取り込まれた変更を、Cloud Run のサービスに反映する。**反映してよい状態のときだけ**動く安全装置つき(`scripts/deploy-gcp.mjs`): `main` にいる / リモートと同じ / 未コミットの変更がない → 型チェック・lint・ビルド → `gcloud run deploy`。必要な権限は [docs/ONBOARDING.md](docs/ONBOARDING.md) の「本番への反映」。

GitHub Actions(`.github/workflows/ci.yml`)が、`main` への push とプルリクエストで、同じ検証とサーバーのテストを自動で行う。

## ディレクトリ

| パス | 内容 |
|---|---|
| `src/` | 画面のコード。入口は `src/App.tsx` |
| `src/models/` | 表の行の型と、選択肢の値 |
| `src/data/` | 表ごとの読み書き(サーバーの `/api/data` を呼ぶ) |
| `src/gcp/` | サーバーの API(`/api/data`・`/api/ask`)を呼ぶ部分 |
| `src/mock/` | 撮影・デモ用のサンプルデータ(`vite.mock.config.ts` のときだけ使う) |
| `server/` | サーバー(Python / FastAPI)。データ定義は `server/schema.json` |
| `scripts/` | 反映・検証・撮影・Workbench の運用などの補助スクリプト |
| `docs/` | ドキュメントと、サンプルデータ(CSV) |

ファイルごとの役割は [docs/SOURCE_MAP.md](docs/SOURCE_MAP.md)。

## ドキュメント

- [docs/ONBOARDING.md](docs/ONBOARDING.md) — 新しいメンバーの最初の手順、チームの進め方
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 構成、AI の仕組み、設計の約束事、落とし穴
- [docs/GCP.md](docs/GCP.md) — サーバー・DB・AI の仕組みと、動かし方・運用
- [docs/SOURCE_MAP.md](docs/SOURCE_MAP.md) — ソースの地図(ファイルの構造と役割、変更するときに触るところ)
- [docs/WORKBENCH.md](docs/WORKBENCH.md) — Vertex AI Workbench で動かす手順
- [docs/PRINCIPLES.md](docs/PRINCIPLES.md) — デザインの方針(UI/UX ポリシー)
- [docs/FLOWS.md](docs/FLOWS.md) — 業務の流れと前提運用(段階ごとの画面の入り口・移り方・前提の決まりと、今の運用との照らし合わせ)。記入用のシートは [docs/FLOWS_SHEET.md](docs/FLOWS_SHEET.md)
- [docs/BACKLOG.md](docs/BACKLOG.md) — 機能のバックログと、状況メモ
- [docs/HANDOVER.md](docs/HANDOVER.md) — 開発の現在地と、次にやること
- [CLAUDE.md](CLAUDE.md) — AI コーディングアシスタント(Claude Code など)向けの指示書
