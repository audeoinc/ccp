# CLAUDE.md — Campaign Contents Planner(CCP / 配信コンテンツプランナー)(AI コーディングアシスタント向け)

React 19 + TypeScript + Vite + Fluent UI v9 の画面と、Python(FastAPI)のサーバー。Cloud Run で動く。全体像は [README.md](README.md)、設計の約束事は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、サーバー・DB・AI は [docs/GCP.md](docs/GCP.md)。

この文書は、いま守る約束だけを置く。約束がいつ・なぜ決まったかは [docs/handover-archive/DECISIONS.md](docs/handover-archive/DECISIONS.md) にある。利用先の Vertex AI Workbench で作業しているなら、いちばん下の付録と [docs/WORKBENCH.md](docs/WORKBENCH.md) を先に読む。

## 必ず守る 5 つ

1. **作業の前に読むのは 2 つだけ。** [docs/HANDOVER.md](docs/HANDOVER.md)(いまどこにいるか・次にやること・落とし穴)と、[docs/BACKLOG.md](docs/BACKLOG.md) 冒頭の「機能のバックログ」。ほかの文書や記録のアーカイブ(`docs/handover-archive/`・`docs/backlog-archive/`)は、その作業に関係する所だけを ID や見出しで grep して読む。作業を終える前に HANDOVER を更新する。
2. **`npm run verify` が通るまで、完了と言わない。** 通ったら、指示を待たずにコミットして push してよい(クラウドのセッションは下の「作業の進め方」)。
3. **取り返しのつかない操作は、人が指示したときだけ。** 本番への反映(`npm run deploy:gcp`)、稼働の環境(AWS)への反映、本番のデータの削除、Workbench の DB を置き換える `import-pack --yes`。
4. **このリポジトリは公開されている(`audeoinc/ccp`)。秘密を書かない。** GCP のプロジェクト ID・本番の URL、パスワード・鍵・トークン、個人のメールアドレス、顧客の実データ、利用先の名前や環境の詳細を、コード・文書・サンプルデータ・コミットメッセージに書かない。
5. **開発側の新機能は、AWS 側の追加がなくても動くように作る。** 空の値・知らない値で落ちない。データと設定項目は AWS 側が独自に持つ([docs/AWS_CUSTOMIZE.md](docs/AWS_CUSTOMIZE.md))。

## 作業の進め方

- 確認は `npm run verify` 1 つでよい(表・承認・決まりの確かめのあと、`tsc -b` と `eslint` を同時に流し、`vite build` を通す)。文書(`.md`)だけの変更なら、型チェック・lint・ビルドは自動で飛ばす。全部を通すときは `npm run verify -- --full`。`server/` の Python を変えたら、`cd server && .venv/Scripts/python.exe -m unittest discover tests`(Linux は `.venv/bin/python`)も通す。
- コミットは 1 つのまとまった変更ごと。`git pull --rebase` でほかのセッションの変更の上に載せ直してから `main` に push し(作業ブランチを指定されていれば、そこにも)、何をコミットしたかを報告する。
- クラウドのセッション(手元の PC の外の Claude)は、作業の前に [docs/CLOUD.md](docs/CLOUD.md) を読む。ブランチ `cloud/…` で作業し、HANDOVER に書いて push する。`main` には入れない。本番・GCP・秘密の情報に触る作業は、ローカルのセッションが担う。
- 画面の見た目は、確かめられた範囲を分けて報告する(例「型チェック・lint・ビルドは通った。画面は未確認」)。画面は撮影用のビルド(`npx vite --config vite.mock.config.ts`、5190)で確かめられる。
- 小さい変更は編集ツールで行う。複数ファイルへの一括置換はスクリプトでもよい。改行はすべて LF(`.gitattributes` の `* text=auto eol=lf`)。push の前に、`git diff --stat` と `git diff --stat --ignore-cr-at-eol` の大きさが同じか(改行だけでファイル全体が変わっていないか)を確かめる。
- 設計や約束事を変えたら [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)(必要ならこのファイル)を、判断を変えたら DECISIONS.md を更新する。やり残しは BACKLOG に書く。
- HANDOVER は短く保つ(目安 10KB 以下)。詳しい記録は `docs/handover-archive/` のいちばん新しいファイルの末尾に足し、HANDOVER には 1 行だけ書く。古い行は消す。BACKLOG で済んだ・外した行は `docs/backlog-archive/DONE.md` へ移す。
- 困ったら、まず `cd server && .venv/bin/python -m ccp.cli check`(設定・DB への接続・写真・画面のビルドを確かめる。何も変えない)。

## 資料を作るとき

- 人が読む資料(Confluence のページ・社内向けの説明・報告・提案、パワポ・スライド・プレゼン)を作るときは、頼まれなくても `.claude/skills/` のスキルを使う。日本語は `confluence-page-writing`・`slide-deck-writing`、英語は `confluence-page-writing-en`・`slide-deck-writing-en`。
- リポジトリの中の文書(`docs/`・HANDOVER・この文書など)は AI が読む元データなので、このスキルは使わず、網羅を優先して書く。

## 設計の方針

- 忘れないようにするのではなく、忘れていても問題ないようにする。めったにしない設定・手順は、人が覚えている前提で作らず、サーバーと画面が足りない物と次にやることを教える形にする(起動のときの初期設定の画面、`check` と ⚙ の「設定の状態」など)。新しい設定・外とのつなぎ・定期の処理を足すときは、「忘れていたらどうなるか、どこで気づけるか」を作る前に決める。ARCHITECTURE の 0 章。
- 製品は 1 つ。置き先は設定とアダプターだけで変わる。環境で変わる所は 5 つの差し込み口(設定・データの入口・AI の出口・ファイルの置き場所・入口の認証)だけにし、環境の名前でコードを分けない。サーバーは外に出られる・2 台以上でも動く前提。アダプターを足したら、その差し込み口の契約テストを通す。ARCHITECTURE の 0.5 章。
- 利用先のデータに合わせる調整は AWS 側で行い、開発側からは UI・UX・機能をマージで取り込む。データの読み方は AWS 側の Claude が版ごとに合わせるので、読み口を先回りして作らない。`products` などの列の名前を変えるときは、AWS 側のマージへの影響を考える。`src/client/`・`server/ccp/client/`・`docs/client/` は AWS 側の置き場所なので、開発側で作らない。
- Power Apps 版は廃止し、ソースも削除した。Power Apps・Dataverse・Power Automate・Copilot Studio のコードや設定を足し直さない。検証の文書と、検証の道具 `tools/ms-verify/` は置いてよいが、CCP の画面・サーバーには入れない。

## 画面の約束

くわしくは ARCHITECTURE の「3. 画面の構成」と「7. 見た目の約束事」。

- UI は Fluent UI v9 のみ(MUI は使わない)。スタイルは `makeStyles` と `tokens`。色の直書きは避ける(例外は、メール・プッシュのプレビュー内の受信側の見た目だけ)。
- Fluent に部品があるものは、自前で作らずその部品を使う(検索の欄は `SearchBox`、項目の説明は `InfoLabel`)。作る前に Fluent UI v9 の部品の一覧を見る。ないときだけ自前で作り、共通の部品にする。
- 画面の文言は、その場に `t('日本語', 'English')`(`const t = useT()`。React の外では `tr(...)`)。日本語だけの文言を画面に書かない(開発用の画面 `src/dev/` だけは日本語のみでよい。[docs/DEVTOOLS.md](docs/DEVTOOLS.md))。最上位の定数に文言を置かない(関数か getter にする)。日付は `locale()`、価格は `yen(price, market)`、選択肢のラベルは `optionLabel(...)`。
- 部品は場所ごとに作らず、共通の部品を使う:
  - 足すボタンは一覧の見出しの右に「＋ ○○を足す」(`ListHeader`。「追加」と書かない)。足したものは一覧のいちばん上に出し、少しのあいだ印を付ける(`useJustAdded`)。並びが名前の順などの一覧も、足した行だけを上に出す。書く欄が下のままでよいのは、AI との会話(制作物の手直し・「？ 聞く」・部品の AI)だけ。高さの決まった枠のいちばん下に置く欄は、`AutoTextarea` の `growUp` でつまみを上の端に置く(やり取りは「＋ やり取りを始める」)。
  - フロートは、すべて端・角をつかんで大きさを変えられ、大きさは種類ごとに覚える(`ResizableSurface`)。題の行をつかんで動かせる(位置は覚えず、開くたびにいつもの場所。題の行を 2 回押すと戻る)。ピンのフロート(コメント・開発へのリクエスト)も同じ。小さい確かめの窓(複製・削除など)と小さいポップアップ(人を選ぶ所・右クリックのメニュー・のぞき見)は固定でよい。
  - ペインは境目をつかんで幅を変えられ、幅を覚える(`usePaneWidths` と `Splitter`)。
  - 複数行の入力欄は `AutoTextarea`。下の端をつかんで高さを変えられ、広げた高さを最低の高さとして欄の種類ごと(`heightKey`)に覚える。
  - 固定にしたいときは、作る前に利用者に「この理由で固定にしたい」と確かめる。
- 値に付くラベルは目印として小さく薄く: ラベル 10px・ごく薄い色、値 14px・semibold、空の値(未設定・—)は薄く。ラベルと値の組は `LabeledValue` で出す。見出しは 13px 中太。
- お知らせの帯は `layout="multiline"`。CSS の `zoom` を使うときは、幅を `%` で補正しない。
- 配信カードは、シンプルな配信カード(SU1。`src/simple/`。設計は [docs/SIMPLE_CARD.md](docs/SIMPLE_CARD.md))だけ。
  - 商品の操作は、プレビューで選んだ部品のペインと商品のフロートで行う。右の一覧に置いてよいのは「入れ替える」だけ。入れ替えの入口(プレビューの ⇄・右クリック・部品のペイン・右の一覧の行・商品のフロート)は、どれも同じ引き出し(`simple/ProductSwap.tsx`)を開く。
  - 入れ替えと AI の候補(商品・メイン画像・見出しやコピー・商品ページの画像)は、どの入口でも「試す → 確定」。候補を押すとプレビューにだけ仮に当てはまり(本物の値は変えず、自動保存も走らない)、「確定」で初めて入れ替わり、引き出しを閉じる(「やめる」では閉じない)。理由は聞かない(アラートの画面だけは変更の理由を書く)。
  - 例外: 制作指示の AI は「AI で書く」→ 案を押すとそのまま入る(確定のボタンなし。元に戻すで戻せる。`simple/NotesAiDraft.tsx`)。
  - 部品を何も選んでいないときのペインは「配信の全体」で、配信の情報(読むだけ・「変える」)と「AI で全体を下書きする」(中身があれば、書き換える前に確かめる)を出し、商品の一覧は置かない。
  - 状態と保存は `CardDetail` の 1 つだけを使い、複製しない。アラートへの対応のパネルでも、商品を入れ替えられる。
- コメントは日本語で、何をしているかより、なぜそうしているかを書く。既存のコードの密度・書き方に合わせる。

## データと AI の約束

- データの名前は、画面・API・PostgreSQL で同じ(表 `delivery_cards`、列 `scheduled_at`、参照 `hero_image_id`、主キー `id`)。選択肢は文字の値(`email` / `app`、`not_started` / `reviewing` / `approved` / `confirmed` など。使える値は `server/schema.json` の `choices`)。状態の前後は、文字のまま比べずに `statusRank`(`src/status.ts`)で比べる。
- 表の型は `src/models/`(一部は `src/data/` のサービスのファイルの中)、読み書きは `src/data/`。データの列・テーブルは `server/schema.json` に足し、列を変えたら schema と型を一緒に直す(`npm run verify` が食い違いを見つける)。
- AI の呼び出しは `askAgent`(`src/aiSelect.ts`)だけを通す(サーバーの `/api/ask` が Gemini を呼ぶ)。指示文は日本語で書き、画面が English のときの言い換えは `localizePrompt` が行う。
- 商品・メイン画像は、配信カードの国に合う市場のものだけを AI の選定と検索の対象にする(`poolProducts` / `poolHeroes`)。載せた商品の表示には全件を使う。
- AI の案(テーマ・コピー・制作指示の案、見出し・コピーの候補)は保存しない。保存するのは、採用した内容とその補足(理由・切り口)。週の枠から中身を作る(W14)ときは「中身を作る」を、配信カードの「AI で下書きする」は押したことを、採用とみなして保存する(元に戻せる)。人の確認は承認で担う(承認された = 人が確かめた。「AI 下書き・未確認」の印 `ai_unchecked_at` はやめた)。
  - 例外: よく聞かれる質問(FAQ)。AI が「？ 聞く」の質問を束ねて作った文を保存して、「？ 聞く」の最初の画面に出す(表 `help_faqs`。人は選ばず、まちがったものを開発・管理の画面で隠せるだけ)。
- チャットの会話は、まだ保存しない(バックログ)。例外は「？ 聞く」の質問と答えで、FAQ を作るために内部で保存する(表 `help_questions`。だれが聞いたかは残さず、利用者には見せず、開発・管理の画面だけで見る。まとめに入れてから 90 日で消す)。
- 標準のテンプレート 10 種はコードに持ち、ユーザーが作ったものはテーブル `layout_templates`。`getTemplate(id)` で求める(`EMAIL_TEMPLATES` のような固定の一覧はない)。以前からある標準の 6 種は、コードの定義のセクションの構成(種類・枠の数・順番)を変えない(保存済みのカードの見出し・商品の位置がずれるため。見た目の設定は変えてよい)。
- テンプレートは版で持つ(表 `layout_template_versions`。保存するたびに新しい版)。配信カードは `layout_key` と使った版の番号 `layout_version` を持ち、描画は `templateKeyOfCard` の鍵「ID@v版」でその版の中身を引くので、画面から構成を変えても既存の配信は崩れない。くわしくは ARCHITECTURE の 5 章。
- 利用者の画面に出る文言・データに、個人情報や機密をサンプルとして埋め込まない。

## 公開と受け渡し

くわしくは [docs/RELEASE.md](docs/RELEASE.md)。

- 稼働の対象は AWS。利用先には ZIP だけを渡す(`npm run release:aws`)。Workbench 版の ZIP(`release:workbench`)は停止した。AWS 版は、開発元の本番(Cloud Run・Cloud SQL)で動かしていることが分かるものだけを消した形で作る(BigQuery・Gemini・GCS・IAP のアダプターは残す)。GCP 版(開発元の本番の形)も残す(ARCHITECTURE の 0.5 章)。
- 開発元の本番だけの処理は `server/ccp/hosted/` に置き、外のコードは `hosted/` がなくても動くようにする(DB の準備中は `ccp/dbready.py` を通す)。
- ZIP に入るファイル(`src/`・`server/ccp/`・`docs/` の多く)には、コメントも含めて、Cloud Run・Cloud SQL・開発元の名前を書かない(検査で止まる。BigQuery・Vertex AI・GCS・IAP などは書いてよい)。文書に本番の話を残すときは `<!-- hosted -->` などの印を付ける。新しいファイルを足したら、`scripts/release.mjs` の `RULES` にも足す。
- 1 日の終わり(利用者が「今日の作業を終える」などと言ったとき。言われなければ 21:00 の予約が行う)には、FEATURES・SOURCE_MAP・FEATURE_REASONS・BACKLOG を直して push する。Workbench 版の Releases への公開は停止した。AWS 版ができたら、それを公開する(RELEASE の 7 章)。

## 付録: Vertex AI Workbench で作業するとき

稼働の対象は AWS に移り、Workbench 版の ZIP は停止したが、念のため残している章。Workbench で作業しているときだけ読む。

このリポジトリは、利用先の Vertex AI Workbench にも clone して動かしている(チームメンバーが運用。Workbench の上の Claude も、この文書を読む)。Workbench で作業するときは、上の約束に加えて、次を守る。

- まず [docs/WORKBENCH.md](docs/WORKBENCH.md)(移行の手順書)を読む。立ち上げ・更新・よくあるつまずきが、すべて書いてある。
- 操作は `scripts/workbench.sh` を使う(`setup` / `update` / `start` / `stop` / `restart` / `status` / `pg-start` / `check` / `import <ZIP>` / `log`。設定の読み込みも、裏での起動も、Workbench の中の PostgreSQL の起動も、スクリプトが行う)。
- 困ったら、最初に `cd server && .venv/bin/python -m ccp.cli check` を実行する(パスワードは出さず、何も変えない)。`[NG]` の行と、手順書の「よくあるつまずき」の表から直す。
- 環境の違い: Linux(Python は `.venv/bin/python`)。サーバーから外(本番の DB・GCS・Cloud SQL の管理の窓口)にはアクセスできない。DB は PostgreSQL に直接つなぐ(`DATABASE_URL`。Workbench の中で動かしているなら、ホストは `localhost`)。AI は Vertex AI の Gemini(`GOOGLE_CLOUD_PROJECT`)。画面は Jupyter の中継 `https://<ノートブックの URL>/proxy/8082/` で開く(末尾の `/` が必要)。
- 本番のデータと写真は、「引っ越し用のパック」で持ち込む(本番の画面の ⚙ →「データと画像を書き出す」で ZIP → Workbench にアップロード → `python -m ccp.cli import-pack <ZIP> --yes` → `ASSET_DIR` を付けてサーバーを起動)。`import-pack --yes` は Workbench の DB の中身をすべて置き換えるので、人に確認してから実行する。
- サーバーは、DB の設定を読み込んだのと同じターミナルで起動する。別のターミナルで起動すると、画面に「データベースにつながりません」と出る(サーバーのターミナルにも理由が出る)。
- してはいけないこと: 本番への反映(`npm run deploy:gcp`・`gcloud run deploy`)、Workbench からの `git push`(コードの変更は開発側のリポジトリで行う)、`server/workbench.env`(パスワードを含む)や `server/images/`(写真)を Git に入れること。
- Workbench で直したい不具合・足したい手順に気づいたら、直接コードを変えずに、内容を人に伝える(開発側で直して、`git pull` で届ける)。
