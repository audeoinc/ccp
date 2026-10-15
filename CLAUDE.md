# CLAUDE.md — Campaign Contents Planner(CCP / 配信コンテンツプランナー)(AI コーディングアシスタント向け)

Power Apps Code App(React 19 + TypeScript + Vite + Fluent UI v9)。全体像は [README.md](README.md)、設計の約束事は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、Dataverse の定義は [docs/DATAVERSE.md](docs/DATAVERSE.md)。作業の前に、この 3 つと [docs/BACKLOG.md](docs/BACKLOG.md)、[docs/HANDOVER.md](docs/HANDOVER.md)(いまどこにいるか・次にやること・落とし穴)を読むこと。**クライアントの Vertex AI Workbench で作業しているなら、下の「Vertex AI Workbench で作業するとき」と [docs/WORKBENCH.md](docs/WORKBENCH.md) を先に読む。**作業を終える前に、HANDOVER.md を更新する。

**2026-10-10 から、開発は GCP 版(Cloud Run。[docs/GCP.md](docs/GCP.md))だけで行う。** 新しい機能は Power Apps 版に入れない(Dataverse は変えない)。データの列・テーブルは、GCP 版のデータベース(`server/ccp/schema.json`)に足す。作る機能の一覧と順番は、[docs/BACKLOG.md](docs/BACKLOG.md) 冒頭の「機能のバックログ」。確かめるときは、`npm run build:gcp` も通す。

## 作業の約束

1. **確認してから終わる。** 変更のあとは、必ず次を通す。通らないまま、完了と言わない。
   ```bash
   npx tsc -b
   npx eslint . --ignore-pattern "src/generated/**"
   npm run build
   ```
2. **勝手に反映・公開しない。** `npm run deploy` / `npx pa app push`(共有のアプリの上書き)、`git push`、共有の変更(`pa app share`)、Dataverse のデータの削除は、**人が指示したときだけ**行う。コミットも、指示があったときに行う。
3. **画面の見た目は、確認できていないと正直に伝える。** Power Apps のホスト上では、アプリは別ドメインの iframe の中で動くため、自動操作では確認できないことが多い。「型チェック・lint・ビルドは通った。画面は未確認」のように、確認した範囲を分けて報告する。
4. 小さい変更は、編集ツールで行う。複数ファイルへの一括置換は、スクリプトでもよいが、**改行コード(CRLF / LF の混在)を保つ**こと。
5. `src/generated/` は自動生成。編集しない。テーブルの列を変えたら、`npx pa app add data-source --connector dataverse --table <論理名> --org-url <組織の URL>` で作り直す。
6. **このリポジトリは非公開(`audeoinc/ccp`)だが、秘密は書かない。**(参加者が増えても、設定を間違えても、困らないように)組織の URL、パスワード・鍵・トークン、個人のメールアドレス、顧客の実データを、コード・ドキュメント・サンプルデータ・コミットメッセージに、書かない。環境の ID は、ツールが必要とする `power.config.json` だけに置く。
7. 設計や約束事を変えたら、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)(必要なら、このファイル)を更新する。やり残しは [docs/BACKLOG.md](docs/BACKLOG.md) に書く。

## コードの約束

- **UI は Fluent UI v9 のみ**(MUI は使わない)。スタイルは `makeStyles` と `tokens`。色の直書きは避ける(メール・プッシュのプレビュー内の、受信側の見た目だけ例外)。
- **画面の文言は、その場に `t('日本語', 'English')`**(`const t = useT()`)。React の外では `tr(...)`。日本語だけの文言を、画面に書かない。最上位の定数に文言を置かない(関数か getter にする)。日付は `locale()`、価格は `yen(price, market)`、選択肢のラベルは `optionLabel(...)`。
- 商品・メイン画像は、配信カードの国に合う市場のものだけを、AI の選定と検索の対象にする(`poolProducts` / `poolHeroes`)。載せた商品の表示には、全件を使う。
- **AI の呼び出しは `askAgent`(`src/aiSelect.ts`)だけ**を通す。Copilot Studio を直接呼ばない。指示文は日本語で書き、画面が English のときの言い換えは `localizePrompt` が行う。
- 選定した商品の**操作は中ペインだけ**。右端の商品情報(`ProductInfoPane`)は、参照専用で、操作する部品を置かない。
- お知らせの帯は `layout="multiline"`。複数行の入力は `AutoTextarea`。CSS の `zoom` を使うときは、幅を `%` で補正しない。
- コメントは日本語で、**何をしているかより、なぜそうしているか**を書く。既存のコードの密度・書き方に合わせる。
- 文字の階層(ラベル 12px 中太・薄いグレー / 値 12px / 見出し 13px 中太)は、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) の「見た目の約束事」を守る。

## Vertex AI Workbench(クライアントの実行環境)で作業するとき

このリポジトリは、クライアントの **Vertex AI Workbench** にも clone して動かしている(チームメンバーが運用。Workbench の上の Claude も、この文書を読む)。
Workbench で作業するときは、上の「作業の約束」に加えて、次を守る。

- **まず [docs/WORKBENCH.md](docs/WORKBENCH.md)(移行の手順書)を読む。** 立ち上げ・更新・よくあるつまずきが、すべて書いてある。
- **困ったら、最初に `cd server && .venv/bin/python -m ccp.cli check` を実行する**(設定・DB への接続・写真・画面のビルドを確かめる。パスワードは出さず、何も変えない)。`[NG]` の行と、手順書の「よくあるつまずき」の表から直す。
- **環境の違い:** Linux(Python は `.venv/bin/python`)。サーバーから外(本番の DB・GCS・Cloud SQL の管理の窓口)には**アクセスできない**。DB は Workbench の中の PostgreSQL(conda で入れたもの。`DATABASE_URL` のホストは `localhost`)。AI は Vertex AI の Gemini(`GOOGLE_CLOUD_PROJECT`)。画面は Jupyter の中継 `https://<ノートブックの URL>/proxy/8081/` で開く(末尾の `/` が必要)。
- **本番のデータと写真は、「引っ越し用のパック」で持ち込む**(本番の画面の ⚙ →「データと画像を書き出す」で ZIP → Workbench にアップロード → `python -m ccp.cli import-pack <ZIP> --yes` → `ASSET_DIR` を付けてサーバーを起動)。`import-pack --yes` は、Workbench の DB の中身を**すべて置き換える**ので、人に確認してから実行する。
- **サーバーは、DB の設定を読み込んだのと同じターミナルで起動する。** 別のターミナルで起動すると、画面に「データベースにつながりません」と出る(サーバーのターミナルにも理由が出る)。
- **してはいけないこと:** 本番への反映(`npm run deploy:gcp`・`gcloud run deploy`)、Workbench からの `git push`(コードの変更は、開発側のリポジトリで行う)、`server/workbench.env`(パスワードを含む)や `server/images/`(写真)を Git に入れること。
- Workbench で直したい不具合・足したい手順に気づいたら、直接コードを変えずに、内容を人に伝える(開発側で直して、`git pull` で届ける)。

## 触る前に知っておくこと

- 標準のテンプレート 10 種はコードに持ち、ユーザーが作ったものは Dataverse(`cr854_layouttemplate`)。`getTemplate(id)` で求める(`EMAIL_TEMPLATES` のような固定の一覧はない)。以前からある標準の 6 種は、**セクションの構成(種類・枠の数・順番)を変えない**(保存済みのカードの、見出し・商品の位置がずれるため。見た目の設定だけ変えてよい)。
- AI の案(テーマ・コピー・制作指示の案、見出し・コピーの候補)は保存しない。保存するのは、採用した内容と、その補足(理由・切り口)。
- チャットの会話は、まだ保存しない(バックログ)。
- 利用者の画面に出る文言・データに、個人情報や機密を、サンプルとして埋め込まない。
