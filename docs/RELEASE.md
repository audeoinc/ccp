# Workbench 版のリリース ZIP の作り方(開発側の手引き)

利用先には、このリポジトリをそのまま渡さず、**Workbench で動くものだけ**を ZIP にして渡す。
利用先は、ZIP を自分の Git に入れ、Vertex AI Workbench で `git pull` して使う(利用先の手順は [UPDATE.md](UPDATE.md)。ZIP に入る)。

- この文書は、ZIP に入らない(開発側だけ)。
- **書き換えの手作業はしない。** ZIP を作るコマンド 1 つで、渡してよい形のものが出てくる。止まったら、開発側のファイルを直して、作り直す。

## 1. 作る

```bash
npm run release:workbench                  # HEAD から作る。検査 → 展開した先で npm ci・npm run verify・サーバーのテスト
npm run release:workbench -- --ref main    # 作る元を指定する(タグやコミットでもよい)
npm run release:workbench -- --no-test     # 検査だけ(ビルドとテストを省く。途中の確認用。渡す ZIP は省かずに作る)
npm run release:workbench -- --publish     # すべて通ったら、GitHub の Releases に公開する(渡すときはこれ)
```

- できるもの: `release-out/ccp-workbench-<版>.zip`(`release-out/` は Git に入れない)。版は `<コミットの日付 YYYYMMDD>-<コミットの短い ID>`。
- **コミット済みの内容から作る**(`git ls-tree` / `git cat-file`)。コミットしていない変更は入らない(ほかのセッションの作業中の変更が混ざらないように)。
- 同じコミットからは、同じ中身の ZIP ができる(ZIP の中の時刻は 0)。
- 終わりに「完了: …(検査・ビルド・サーバーのテストを通りました)」と出れば、渡してよい。展開した先のビルドとテストには、数分かかる(npm と PyPI からパッケージを取る)。

## 2. ZIP に入るもの・入らないもの

スクリプト(`scripts/release-workbench.mjs`)の `RULES` で決める。上から順に見て、最初に当たった規則で決まる。
**どの規則にも当たらないファイルがあると、止まる**(新しく足したファイルが、黙って入ったり落ちたりしないように)。ファイルを足したら、`RULES` にも足す。

| 入る | 入らない |
|---|---|
| `src/`・`public/`・画面のビルドの設定・`package.json`(本番用のスクリプトを消したもの)・`package-lock.json` | `Dockerfile`・`.dockerignore`・`.gcloudignore`・`cloudbuild.yaml`・`.github/` |
| `server/ccp/`(`hosted/` を除く)・`server/tests/`(`test_hosted_*` を除く)・`schema.json`・`seed.json`・`requirements.txt`・`workbench.env.example` | `server/ccp/hosted/`・`server/requirements-hosted.txt` |
| `scripts/workbench.sh`・`check-*.mjs`・`export-seed.mjs`・`feature-reasons.py` | `scripts/deploy-gcp.mjs`・`gcp-smoke.mjs`・`screenshots.mjs`・`release-workbench.mjs` |
| `docs/` の Workbench の手引き・設計・機能・開発の理由(FEATURE_REASONS)・BACKLOG・SOURCE_MAP・BigQuery・承認・方針・スクリーンショット・ワイヤーフレーム | `docs/GCP.md`・`HANDOVER.md`・`CLOUD.md`・`ONBOARDING.md`・`RELEASE.md`(この文書)・`font-compare.html` |
| `release/workbench/files/` の中身(Workbench 版の `README.md`・`CLAUDE.md`)を、ルートに置く | 開発側の `README.md`・`CLAUDE.md` |
| `VERSION.txt`(スクリプトが作る。版・元のコミット・日付) | Git の履歴(`.git`) |

## 3. 本番だけの処理の置き場所(コード)

開発元の本番(Cloud Run + Cloud SQL)だけで使う処理は、**`server/ccp/hosted/` に置く**。ZIP は、このフォルダをまるごと外す。

- `hosted/dbctl.py`(Cloud SQL の自動起動・停止)、`hosted/connect.py`(Cloud SQL Connector)、`hosted/routes.py`(Cloud Scheduler が呼ぶ `/internal/idle-check`)、`hosted/devtoken.py`(手元の gcloud のトークン)。
- **`hosted/` の外のコードは、`hosted/` がなくても動くようにする。** 使うところは `try: from .hosted … except ImportError:` で囲む(`dbready.py`・`db.py`・`creds.py`・`main.py`)。DB の準備中の扱いは `ccp/dbready.py`(`DbNotReady`・`controller()`)を通す。`dbctl` を直接 import しない。
- 本番だけのパッケージは `server/requirements-hosted.txt`(Dockerfile と CI が、`requirements.txt` と一緒に入れる)。
- テストは `server/tests/test_hosted_*.py`。
- 画面(`src/`)には、本番だけの分岐を置かない(いまもない)。

## 4. 残してはいけない言葉

ZIP の中のすべてのテキストのファイル(とファイル名)を、次の言葉で検査する(大文字小文字は区別しない。定義はスクリプトの `BANNED`)。
**ZIP に入るファイルには、コメントも含めて、これらを書かない。** 見つかると、その行を出して止まる。

| 分類 | 言葉 |
|---|---|
| 開発元の名前 | `audeo`(リポジトリ名 `audeoinc/ccp` も) |
| Power Platform 版 | Power Apps・Power Automate・Power Platform・Dataverse・Copilot Studio |
| Cloud Run | Cloud Run・`run.app`・kaniko |
| Cloud SQL | Cloud SQL(`cloud-sql`・`CLOUD_SQL_INSTANCE` も)・`sqladmin` |
| 本番の反映 | `deploy:gcp`・`deploy-gcp`・`gcp-smoke`・`cloudbuild`・Cloud Build・`gcloud`・Dockerfile・`gcloudignore` |
| DB の自動起動・停止 | `dbctl`・Cloud Scheduler・`idle-check`・`CCP_DEV_GCLOUD`・`DB_CONTROL`・`IDLE_CHECK_*` |
| 本番のサービス名 | `contents-planner` |
| 開発用の文書 | `HANDOVER.md`・`CLOUD.md`・`ONBOARDING.md`・`GCP.md`・`RELEASE.md` |

あわせて、文書の中の相対リンク(`[…](パス)`)の先が ZIP にあるかも確かめる(外した文書へのリンクが残らないように)。

「GCP」「Google Cloud」「Vertex AI」「BigQuery」「GCS」、`src/gcp/` のような名前は、残してよい(利用先の Workbench も GCP の上で動くため)。

## 5. 文書の中の、本番だけの説明(印)

開発側の文書に本番の話を残したまま、ZIP からだけ外したいときは、印を付ける(Markdown では表示されない)。

| 書き方 | 消える範囲 | 使う場所 |
|---|---|---|
| 行の中に `<!-- hosted -->` | その行 | 表の行・箇条書きの 1 行(表の中では、行の末尾に付ける。行の間に印だけの行を入れると、表が切れる) |
| `<!-- hosted:begin -->` 〜 `<!-- hosted:end -->` | その範囲。印が行の先頭と末尾なら、行ごと | 段落・節(印だけの行で囲む)、文の一部(行の中で囲む) |
| `%% hosted:begin` 〜 `%% hosted:end` | その範囲の行 | mermaid の図の中 |
| draw.io の図の部品の id を `hosted_` で始める | その部品と、つながる線 | `docs/*.drawio` |

検査で止まったら、次のどちらかで直す。

1. **言い換える**(おすすめ。利用先にも意味が通るなら)。例: 「Cloud Run では」→「本番では」「サーバーの」。
2. 利用先に要らない話なら、印で囲む。

## 6. 渡す

- **`--publish` で、GitHub の Releases に公開する。** 元のコミットにタグ `workbench-<版>` を付け、`CCP Workbench 版 <版>` のリリースに ZIP を添付する(`gh` のサインインが要る)。ZIP はリポジトリの履歴に入れない(版ごとに約 19 MB あるため)。
- 元のコミットが push 済みでないと止まる。`--no-test` とは一緒に使えない(確かめを通った ZIP だけを公開する)。
- 利用先は、Releases の版のページから ZIP をダウンロードする。公開リポジトリなので、だれでもダウンロードできる(中身は、リポジトリで公開しているソースの一部)。
- 公開した版は、HANDOVER に書く(版・元のコミット)。
- 利用先は、ZIP を Git に入れ、`CCP Workbench 版 <版>` でコミットする([UPDATE.md](UPDATE.md))。Workbench の `scripts/workbench.sh status` に、その版が出る。

## 7. 毎日の終わりの手順(文書の更新 + ZIP の公開)

利用者が「今日の作業を終える」「1 日の終わりの手順を」などと言ったら、どのセッションでも、この手順を行う。
言われなかった日は、21:00 に予約したタスク(Claude のアプリの「スケジュール」の `ccp-end-of-day`)が、同じ手順を行う。
**その日にもう公開してあれば、何もしない**(Releases に、今日作られた `workbench-*` があるか: `gh release list --limit 5`)。

1. **作業の場所**: ほかのセッションの作業中の変更に触らないよう、`main` の最新を、専用の作業ツリーで扱う。
   ```bash
   cd C:/Users/hiros/GitHub/ccp
   git fetch origin --tags
   git worktree add --detach ../ccp-eod origin/main   # 2 回目からは: cd ../ccp-eod && git checkout --detach origin/main
   cd ../ccp-eod && npm ci                             # 初回は時間がかかる(Windows で 15 分ほど)
   ```
2. **今日の変更を知る**: 前に公開した版から後のコミット(`git log --oneline <最新の workbench-* タグ>..origin/main`)と、`docs/HANDOVER.md` のその日の節を読む。変更がなければ、ここで終わる。
3. **文書を直す**(変わったところだけ。言い換えの約束は 4 章・5 章):
   - [FEATURES.md](FEATURES.md): 足した・変えた機能、「未実装・制限」。
   - [SOURCE_MAP.md](SOURCE_MAP.md)(と `source-map.drawio`): 足したファイル・役割の変わったファイル、図、「最終更新」の日付。
   - [FEATURE_REASONS.md](FEATURE_REASONS.md): `scripts/feature-reasons.py` の機能(F)・対応づけ(M)を直して、`python scripts/feature-reasons.py` で作り直す(食い違いがあれば止まる)。[USER_STORIES.md](USER_STORIES.md) の実装の状態も合わせる。
   - [BACKLOG.md](BACKLOG.md): 済んだもの・始めたものの状態。
   - 新しいファイルがあれば、`scripts/release-workbench.mjs` の `RULES` に足す。
4. **確かめる**: `npm run verify`、サーバーのテスト(`cd server && python -m unittest discover tests`)、`npm run release:workbench -- --no-test`(言葉の検査)。
5. **コミット・push**: `docs: 1 日の終わりの文書の更新(<日付>)` で、`git pull --rebase` のあと `main` に push する。
6. **公開する**: `npm run release:workbench -- --publish`(確かめをすべて通ったら、Releases に公開する。同じコミットを公開済みなら、何もしない)。
7. **記録と報告**: HANDOVER 6.23 の「公開した版」に版を足して push する(この変更は ZIP に入らないので、版は作り直さない)。利用者には、版・Releases の URL・直した文書・確かめていないことを報告する。
