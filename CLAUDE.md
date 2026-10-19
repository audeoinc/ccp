# CLAUDE.md — Campaign Contents Planner(CCP / 配信コンテンツプランナー)(AI コーディングアシスタント向け)

React 19 + TypeScript + Vite + Fluent UI v9 の画面と、Python(FastAPI)のサーバー。Cloud Run で動く。全体像は [README.md](README.md)、設計の約束事は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、サーバー・DB・AI は [docs/GCP.md](docs/GCP.md)。作業の前に、この 3 つと [docs/BACKLOG.md](docs/BACKLOG.md)、[docs/HANDOVER.md](docs/HANDOVER.md)(いまどこにいるか・次にやること・落とし穴)を読むこと。**利用先の Vertex AI Workbench で作業しているなら、下の「Vertex AI Workbench で作業するとき」と [docs/WORKBENCH.md](docs/WORKBENCH.md) を先に読む。**作業を終える前に、HANDOVER.md を更新する。

**Power Apps 版は、2026-10-16 に廃止した(ソースも削除済み)。** Power Apps・Dataverse・Power Automate・Copilot Studio のコードや設定を、足し直さない。データの列・テーブルは `server/schema.json` に足す。作る機能の一覧と順番は、[docs/BACKLOG.md](docs/BACKLOG.md) 冒頭の「機能のバックログ」。

## クラウドのセッションで作業するとき

**作業の前に [docs/CLOUD.md](docs/CLOUD.md) を読む。** ブランチ `cloud/…` で作業し、終わったら HANDOVER に書いて push する(`main` には入れない)。本番・GCP・秘密の情報に触る作業は、ローカルのセッションが担う。

## 作業の約束

1. **確認してから終わる。** 変更のあとは、必ず次を通す。通らないまま、完了と言わない。
   ```bash
   npx tsc -b
   npx eslint .
   npm run build
   ```
2. **コミットと push は、確認が通ったら、指示を待たずに行ってよい**(2026-10-17、利用者の指示で変えた)。上の確認と `npm run verify` を通してからコミットし、`git pull --rebase` で、ほかの人・ほかのセッションの変更の上に載せ直して、`main` に push する(作業ブランチを指定されていれば、そこにも)。1 つのコミットは 1 つのまとまった変更にし、何をコミットしたかを報告する。**本番への反映(`npm run deploy:gcp`)、本番のデータの削除、Workbench の DB を置き換える `import-pack --yes` は、取り返しがつきにくいので、これまでどおり人が指示したときだけ**行う。
3. **画面の見た目は、確認できていないと正直に伝える。** 画面は、撮影・デモ用のビルド(`npx vite --config vite.mock.config.ts`、5190)で確かめられる。「型チェック・lint・ビルドは通った。画面は未確認」のように、確認した範囲を分けて報告する。
4. 小さい変更は、編集ツールで行う。複数ファイルへの一括置換は、スクリプトでもよいが、**改行コード(CRLF / LF の混在)を保つ**こと。
5. **データの名前は、画面・API・PostgreSQL で同じ**(表 `delivery_cards`、列 `scheduled_at`、参照 `hero_image_id`、主キー `id`)。選択肢は文字の値(`email` / `app`、`not_started` / `reviewing` / `approved` / `confirmed` など。使える値は `server/schema.json` の `choices`)。状態の前後を比べるときは、文字のまま比べずに `statusRank`(`src/status.ts`)を使う。表の型は `src/models/`(一部の表は `src/data/` のサービスのファイルの中)、読み書きは `src/data/`。列を変えたら、`server/schema.json` と型を一緒に直す(`npm run verify` が食い違いを見つける)。
6. **このリポジトリは公開されている(`audeoinc/ccp`)。秘密は書かない。**(だれが読んでも困らないように)GCP のプロジェクト ID・本番の URL、パスワード・鍵・トークン、個人のメールアドレス、顧客の実データ、利用先の名前や環境の詳細を、コード・ドキュメント・サンプルデータ・コミットメッセージに、書かない。
7. 設計や約束事を変えたら、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)(必要なら、このファイル)を更新する。やり残しは [docs/BACKLOG.md](docs/BACKLOG.md) に書く。

## コードの約束

- **UI は Fluent UI v9 のみ**(MUI は使わない)。スタイルは `makeStyles` と `tokens`。色の直書きは避ける(メール・プッシュのプレビュー内の、受信側の見た目だけ例外)。
- **画面の文言は、その場に `t('日本語', 'English')`**(`const t = useT()`)。React の外では `tr(...)`。日本語だけの文言を、画面に書かない。最上位の定数に文言を置かない(関数か getter にする)。日付は `locale()`、価格は `yen(price, market)`、選択肢のラベルは `optionLabel(...)`。
- 商品・メイン画像は、配信カードの国に合う市場のものだけを、AI の選定と検索の対象にする(`poolProducts` / `poolHeroes`)。載せた商品の表示には、全件を使う。
- **AI の呼び出しは `askAgent`(`src/aiSelect.ts`)だけ**を通す(サーバーの `/api/ask` が Gemini を呼ぶ)。指示文は日本語で書き、画面が English のときの言い換えは `localizePrompt` が行う。
- 選定した商品の**操作は中ペインだけ**。右端の商品情報(`ProductInfoPane`)は、参照専用で、操作する部品を置かない。
- お知らせの帯は `layout="multiline"`。複数行の入力は `AutoTextarea`。CSS の `zoom` を使うときは、幅を `%` で補正しない。
- コメントは日本語で、**何をしているかより、なぜそうしているか**を書く。既存のコードの密度・書き方に合わせる。
- 文字の階層(ラベル 12px 中太・薄いグレー / 値 12px / 見出し 13px 中太)は、[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) の「見た目の約束事」を守る。

## Vertex AI Workbench(利用先の実行環境)で作業するとき

このリポジトリは、利用先の **Vertex AI Workbench** にも clone して動かしている(チームメンバーが運用。Workbench の上の Claude も、この文書を読む)。
Workbench で作業するときは、上の「作業の約束」に加えて、次を守る。

- **まず [docs/WORKBENCH.md](docs/WORKBENCH.md)(移行の手順書)を読む。** 立ち上げ・更新・よくあるつまずきが、すべて書いてある。
- **操作は `scripts/workbench.sh` を使う**(`setup` / `update` / `start` / `stop` / `restart` / `status` / `pg-start` / `check` / `import <ZIP>` / `log`。設定の読み込みも、裏での起動も、Workbench の中の PostgreSQL の起動も、スクリプトが行う)。
- **困ったら、最初に `cd server && .venv/bin/python -m ccp.cli check` を実行する**(設定・DB への接続・写真・画面のビルドを確かめる。パスワードは出さず、何も変えない)。`[NG]` の行と、手順書の「よくあるつまずき」の表から直す。
- **環境の違い:** Linux(Python は `.venv/bin/python`)。サーバーから外(本番の DB・GCS・Cloud SQL の管理の窓口)には**アクセスできない**。DB は PostgreSQL に直接つなぐ(`DATABASE_URL`。Workbench の中で動かしているなら、ホストは `localhost`)。AI は Vertex AI の Gemini(`GOOGLE_CLOUD_PROJECT`)。画面は Jupyter の中継 `https://<ノートブックの URL>/proxy/8082/` で開く(末尾の `/` が必要)。
- **本番のデータと写真は、「引っ越し用のパック」で持ち込む**(本番の画面の ⚙ →「データと画像を書き出す」で ZIP → Workbench にアップロード → `python -m ccp.cli import-pack <ZIP> --yes` → `ASSET_DIR` を付けてサーバーを起動)。`import-pack --yes` は、Workbench の DB の中身を**すべて置き換える**ので、人に確認してから実行する。
- **サーバーは、DB の設定を読み込んだのと同じターミナルで起動する。** 別のターミナルで起動すると、画面に「データベースにつながりません」と出る(サーバーのターミナルにも理由が出る)。
- **してはいけないこと:** 本番への反映(`npm run deploy:gcp`・`gcloud run deploy`)、Workbench からの `git push`(コードの変更は、開発側のリポジトリで行う)、`server/workbench.env`(パスワードを含む)や `server/images/`(写真)を Git に入れること。
- Workbench で直したい不具合・足したい手順に気づいたら、直接コードを変えずに、内容を人に伝える(開発側で直して、`git pull` で届ける)。

## 触る前に知っておくこと

- **利用先には、Workbench 版の ZIP(`npm run release:workbench`)だけを渡す**(手順・約束事は [docs/RELEASE.md](docs/RELEASE.md))。
  開発元の本番(Cloud Run + Cloud SQL)だけの処理は `server/ccp/hosted/` に置き、外のコードは `hosted/` がなくても動くようにする(DB の準備中は `ccp/dbready.py` を通す)。
  ZIP に入るファイル(`src/`・`server/ccp/`・Workbench 向けの `docs/` など)には、コメントも含めて、Cloud Run・Cloud SQL・gcloud・deploy:gcp・dbctl・Power Apps・開発元の名前などを書かない(検査で止まる)。文書に本番の話を残すときは `<!-- hosted -->` などの印を付ける。新しいファイルを足したら、`scripts/release-workbench.mjs` の `RULES` にも足す。
- **1 日の終わり**(利用者が「今日の作業を終える」などと言ったとき。言われなければ 21:00 の予約が行う): 文書(FEATURES・SOURCE_MAP・FEATURE_REASONS・BACKLOG)を直して push し、Workbench 版を Releases に公開する。手順は [docs/RELEASE.md](docs/RELEASE.md) の 7 章。

- 標準のテンプレート 10 種はコードに持ち、ユーザーが作ったものはテーブル `layout_templates`。`getTemplate(id)` で求める(`EMAIL_TEMPLATES` のような固定の一覧はない)。以前からある標準の 6 種は、**セクションの構成(種類・枠の数・順番)を変えない**(保存済みのカードの、見出し・商品の位置がずれるため。見た目の設定だけ変えてよい)。
- AI の案(テーマ・コピー・制作指示の案、見出し・コピーの候補)は保存しない。保存するのは、採用した内容と、その補足(理由・切り口)。週の枠からまとめて中身を作る(W14)ときは、「中身を作る」を押すことを採用とみなして保存し、「AI 下書き・未確認」の印(`ai_unchecked_at`)を付ける。
- チャットの会話は、まだ保存しない(バックログ)。
- 利用者の画面に出る文言・データに、個人情報や機密を、サンプルとして埋め込まない。
