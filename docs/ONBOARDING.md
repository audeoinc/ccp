# 新しいメンバーの手順(オンボーディング)

途中から参加する人が、同じように開発を進められるようにするための手順。

## 0. 書いてはいけないもの(このリポジトリは公開されている)

GitHub の**公開**リポジトリ(`audeoinc/ccp`)。だれでも読めるので、次のものを、コード・ドキュメント・サンプルデータ・コミットメッセージ・プルリクエストに、**書かない・コミットしない**。
- パスワード、鍵、トークン、接続文字列などの**秘密情報**(`.env` などは、コミットしない)
- **GCP のプロジェクト ID**、本番の URL、サービスアカウントの名前
- **個人のメールアドレス**、顧客の実データ(サンプルデータは、架空のものだけ)
- **利用先の名前**や、その環境の詳細(「利用先の、外につながらない環境」のように書く)
- アシスタントの手元の設定(`.claude/`。`.gitignore` で除外済み)

万一、秘密情報を push したら、**すぐ管理者に知らせて**、その秘密情報を無効にする(履歴から消しても、見られた可能性があるため)。

## 1. 先に必要な権限(管理者に依頼)

| 対象 | 内容 |
|---|---|
| GitHub | リポジトリ `audeoinc/ccp` への書き込み権限(コラボレーターに招待) |
| GCP | 本番に反映する人だけ。プロジェクトの権限(下の「本番への反映」) |

## 2. 環境を整える

1. **Node.js** をインストールする(動作確認済み: Node 24、npm 11)。
2. リポジトリを取得する。
   ```bash
   git clone https://github.com/audeoinc/ccp.git
   cd ccp
   npm ci
   ```
3. 動かして確認する(サンプルデータで動く、撮影・デモ用のビルド。DB も AI の設定も要らない)。
   ```bash
   npx vite --config vite.mock.config.ts    # http://localhost:5190 を、ブラウザで開く
   ```
   カレンダーに、配信カードが表示されれば成功。本物のサーバー(DB・AI)につないで動かす方法は、[GCP.md](GCP.md) の「手元での動かし方」。
4. コミット前の確認5. コミット前の確認が通ることを確かめる。
   ```bash
   npx tsc -b && npx eslint . && npm run build
   ```

## 3. 最初に読むもの

1. [README.md](../README.md) — 全体像とディレクトリ
2. [ARCHITECTURE.md](ARCHITECTURE.md) — 設計の約束事(日英の書き方、AI の仕組み、落とし穴)
3. [GCP.md](GCP.md) — サーバー・データベース・AI の仕組みと、動かし方
4. [BACKLOG.md](BACKLOG.md) — いま何が終わっていて、何が残っているか

## 4. チームの進め方

**ブランチと取り込み(PR なしで、`main` に直接 push してよい)**
- コントリビューター(GitHub で、書き込み権限を持つ人)は、**プルリクエストなしで、`main` に直接 push してよい**。小さな変更を、すぐに共有するための運用。
- push の手順(毎回):
  ```bash
  git pull --rebase origin main      # 先に、最新の main を取り込む(他の人の変更と、ぶつからないようにする)
  npm run verify                     # 型チェック・lint・ビルド。通らないものは push しない
  git push origin main
  ```
- **`npm ci`(依存の入れ直し)が必要なとき**: 初めて clone した直後と、`git pull` で `package.json` / `package-lock.json` が変わったとき(`git diff --stat HEAD@{1} -- package-lock.json` などで分かる)。**普段の push やデプロイでは不要**。`Cannot find module` のようなエラーが出たら、まず `npm ci` を実行する(lock の通りに入れ直すだけなので、実行しても害はない)。
- **PR なしの代わりに、`main` を壊さない約束**: ① push の前に、必ず `npm run verify` を通す。② 1 つのコミットは、1 つのまとまった変更にする。③ 大きな変更や、他の人の意見がほしい変更は、ブランチ(`feature/○○`)で作業して、プルリクエストにしてよい(任意)。
- push のあとは、GitHub Actions(`.github/workflows/ci.yml`)が、同じ検証を自動で行う。**失敗したら、気づいた人がすぐ直す**(または、直前のコミットを取り消す `git revert`)。
- コミットメッセージは、変更の目的が分かる文にする(英語でも日本語でもよい)。

**本番への反映(`npm run deploy:gcp`)**
- 対象は、Cloud Run のサービス `contents-planner`。
- 安全装置つき: `main` にいて、リモートと同じで、未コミットの変更がないときだけ動く。型チェックと lint を通してから、クラウドでビルドし(`gcloud builds submit`。層をキャッシュする。うまくいかなければ、これまでの `gcloud run deploy --source`)、`gcloud run deploy` で反映し、**タグ `deployed-gcp/日時`** を GitHub に送る。
- 環境変数・シークレット(DB のパスワードなど)は、サービスに設定済みで、再反映でも引き継がれる(変えるときは、[GCP.md](GCP.md))。
- **事前に必要なこと**:
  1. **gcloud CLI** をインストールする(https://cloud.google.com/sdk/docs/install)。
  2. `gcloud auth login` で、Google アカウントにサインインする。
  3. `gcloud config set project <プロジェクトID>`(プロジェクト ID は、管理者に聞く。リポジトリには書かない)。
- **反映する人に必要な権限**(プロジェクトの管理者が、**その人の Google アカウント**に付ける)。`<…>` は、管理者に聞く値。**この構成で、実際に反映できることを確認済み**(`--condition=None` は、プロジェクトに、条件つきの権限があるときに、聞き返されないようにするため)。
  ```bash
  # (1) ソースからのデプロイ(gcloud run deploy --source)に必要な権限をまとめた、Google の役割
  #     (ソース用バケットの一覧・作成・読み書き、Cloud Build、Artifact Registry)
  gcloud projects add-iam-policy-binding <プロジェクトID> --member="user:<メールアドレス>" --role="roles/run.sourceDeveloper" --condition=None
  # (2) API の利用
  gcloud projects add-iam-policy-binding <プロジェクトID> --member="user:<メールアドレス>" --role="roles/serviceusage.serviceUsageConsumer" --condition=None
  # (3) サービスの更新(このサービスだけに限定。営業支援など、ほかのサービスには、触れない)
  gcloud run services add-iam-policy-binding contents-planner --region asia-northeast1 --project <プロジェクトID> --member="user:<メールアドレス>" --role="roles/run.admin"
  # (4) サービスが動くときのサービスアカウントとして、反映する権限
  gcloud iam service-accounts add-iam-policy-binding <実行サービスアカウント> --project <プロジェクトID> --member="user:<メールアドレス>" --role="roles/iam.serviceAccountUser"
  ```
  - 1 つずつ足す方式(バケットの権限だけ、など)は、`storage.buckets.get`、次に `storage.buckets.list` と、別の権限で順に止まった。(1) の役割なら、まとめて足りる。`roles/storage.admin` は、プロジェクトの全バケットが対象になるので、付けない。
  - 初回の確認では、(1)〜(4) のほかに、`cloudbuild.builds.editor`、`artifactregistry.writer`、ソース用バケットへの `legacyBucketReader`・`objectAdmin` も付いていた。(1) と重なる可能性が高い(外して反映できるかは、未検証)。
  - 足りない権限があると、エラーに、権限の名前が出る。同じ要領で足す。
- 反映の履歴は、`git tag --list "deployed-gcp/*"` で見られる。
- DB は、普段は停止している(毎日 21:00 に停止。アクセスで自動起動、約 11 分)。反映のときは、DB が停止していても、問題ない。
- 利用者に見せるデモの直前は、反映しない期間(凍結)を決めておく。

**テーブル・列を変えるとき**
- 定義は `server/schema.json`(唯一の正)。画面の型(`src/models/`。一部の表は `src/data/`)も、一緒に直す。食い違いは `npm run verify` が見つける。
- DB には、反映後にサーバーが最初に DB へつないだとき、足りないテーブル・列が自動で足される。詳しくは [GCP.md](GCP.md) の「データ定義」。

**ドキュメントの更新**
- 設計の約束事が変わったら、[ARCHITECTURE.md](ARCHITECTURE.md)(と、必要なら [CLAUDE.md](../CLAUDE.md))も更新する。
- 検討事項や、やり残しは、[BACKLOG.md](BACKLOG.md) に書く。

## 5. AI コーディングアシスタント(Claude Code など)を使う場合

- リポジトリの [CLAUDE.md](../CLAUDE.md) に、コードの約束事と、確認の手順が書いてある。アシスタントは、これを読んで作業する。
- アシスタントは、確認(型チェック・lint・ビルド・`npm run verify`)が通ったら、**指示を待たずにコミットし、`main` に push してよい**(2026-10-17 に変えた)。**本番への反映(`npm run deploy:gcp`)・本番のデータの削除・Workbench の `import-pack --yes` は、人が指示したときだけ**にする(CLAUDE.md にも書いてある)。

## 6. よくある困りごと

| 症状 | 対処 |
|---|---|
| 画面に「データベースを起動しています」と出る | DB は普段は停止している。起動まで 10〜13 分待つ(自動で進む) |
| AI が返らない・エラーになる | サーバーのログ(Cloud Run のログ)を見る。Vertex AI の設定は [GCP.md](GCP.md) の「AI」 |
| 商品情報のグラフが「実績はまだありません」 | 週次実績・販売方針のテーブルにデータが入っているか確認する(`python -m ccp.cli counts`) |
