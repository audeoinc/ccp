# クラウドのセッションに任せる作業の手引き

CCP の作業を、**クラウドのセッション**(claude.ai/code などで動く、手元の PC の外の Claude)と、**ローカルのセッション**(手元の PC で動く Claude)で分けるための決まり。
クラウドのセッションは、作業を始める前にこの文書を最後まで読む(2026-10-17、利用者と決めた)。

- 作業の約束・コードの約束は [CLAUDE.md](../CLAUDE.md)。いまの状況と落とし穴は [HANDOVER.md](HANDOVER.md)。画面の決まりは [PRINCIPLES.md](PRINCIPLES.md)、導線は [FLOWS.md](FLOWS.md)。

---

## 1. 分け方

| | クラウドに任せる | ローカルが担う |
|---|---|---|
| 何を | 手元の PC・本番・秘密の情報が要らない作業 | 手元・本番・GCP が要る作業 |
| 例 | 画面の改善(撮影用のモックで確かめられるもの)、文書(FEATURES・FLOWS・機能の理由の台帳・HANDOVER)、イラスト版のスクリーンショット、サーバーの単体テスト、コードの整理 | 本番への反映、本番のデータの修正、BigQuery・Vertex AI・Cloud SQL を使う作業、写真版のスクリーンショット、Workbench、クラウドの成果を main に入れる前の確認、本番の画面での確認 |
| できないこと | GCP の認証がない(`gcloud` が使えない)。本番の画面・データ・秘密の情報は見られない。**ローカルのセッションにメッセージを返せない** | — |

迷ったら、「本番や秘密の情報に触るか」で分ける。触らないならクラウド、触るならローカル。

## 2. 進め方

1. **ブランチで作業する。** `main` に直接 push しない。ブランチの名前は `cloud/<短い説明>`(例: `cloud/flows-c13`、`cloud/features-sync`)。
2. **確かめてからコミットする。** `npm run verify`(型チェック・lint・ビルド・schema の照合)を通す。画面を変えたら、撮影用のモックで確かめる(3 章)。サーバーを変えたら `server/tests` を通す。
3. **終わったら、HANDOVER に書いて push する。** [HANDOVER.md](HANDOVER.md) の 6 章の末尾に、次の形で 1 節を足す。ローカルのセッションは、これを読んで取り込む(クラウドからはメッセージを送れないため、git が連絡の手段)。

   ```
   ## 6.xx <やったこと>(クラウド、YYYY-MM-DD、ブランチ cloud/xxx)
   - やったこと: …(触ったファイル)
   - 確かめたこと: verify / モックで見た画面 / テスト
   - 確かめていないこと: 本番の画面、…
   - 残っていること・判断がほしいこと: …
   ```
4. **main に入れるのは、ローカルのセッション。** ローカルがブランチを取り込み、モックで確かめ、ほかのセッションの変更とのぶつかりを片付けてから `main` に入れる。本番への反映は、ローカルの連絡係のセッションが行う。
5. **PR は、利用者に頼まれたときだけ作る。** ふだんは、ブランチを push して HANDOVER に書くまで。

## 3. クラウドで画面を確かめる

- 撮影用のモック: `npx vite --config vite.mock.config.ts`(5190)。サーバーも DB も要らない(サンプルのデータで動く)。
- スクリーンショット: `scripts/screenshots.mjs`。クラウドの環境では、Chromium が `/opt/pw-browsers/chromium-*/chrome-linux/chrome` にある。root で動くので `--no-sandbox` が要る。`--no-sandbox` を付けて起動する小さなシェルスクリプトを作り、`BROWSER_PATH` に渡す。
  - `ONLY=week,aiTabs`(場面の関数名)で撮る範囲を絞れる。`SHOTS_OUT` で保存先を変えられる(既定は `docs/screenshots/`)。
  - モックで配信カードを開くと、中身が空の配信では自動の下書きが始まる。確かめるときは、`localStorage` の `cardDetail.autoDraft` を `off` にする。
- 写真版のスクリーンショット(`docs/screenshots-photo/`)は、本番のデータを使うので、ローカルだけで撮る。

## 4. 書いてはいけないもの(リポジトリは公開)

- 本番の URL、GCP のプロジェクトの ID、秘密の情報(パスワード・鍵)、利用先の名前、利用先の商品の写真。
- `docs/FEATURES.md`・`docs/FEATURE_REASONS.md` は、利用先の Confluence に貼る文書。Vertex AI・PostgreSQL は書いてよい。Cloud Run・Cloud SQL・GCS・旧称・Power Apps・社内のシステムの名前・コミットの番号は書かない。

## 5. 頼み方(ローカル・利用者がクラウドに渡すとき)

1 回で終わる大きさにして、次をそろえて渡す。

- **何を**: 例「FLOWS の C-◯ を作る」「FEATURES を、いまの画面に合わせて直す」
- **触ってよいファイル**: 例「`src/WeekView.tsx` と docs だけ」(ローカルの作業とぶつからないように)
- **ブランチの名前**: 例 `cloud/week-view-legend`
- **終わりの形**: 「verify を通し、モックで撮った画面を `docs/screenshots/` に入れ、HANDOVER に 6.xx を書いて、ブランチを push」

## 6. 最初に任せる候補(2026-10-17 時点)

| 候補 | 中身 | 触るファイル |
|---|---|---|
| FEATURES と FLOWS の見直し | 今日の画面の変更(この画面 ▾・⚙・週の帯・アラートのフロート・プロセスのペイン)に合わせ、FEATURES の画面の説明と、FLOWS の 2 章(画面の全体)・4 章(部品と段階)を直す | `docs/FEATURES.md`・`docs/FLOWS.md`・`scripts/feature-reasons.py`(台帳) |
| イラスト版のスクリーンショットの撮り直し | 全 39 場面を撮り直し、FEATURES の撮影の一覧と合わせる。撮れない場面があれば、`scripts/screenshots.mjs` を直す | `docs/screenshots/`・`scripts/screenshots.mjs`・`docs/FEATURES.md`(撮影の一覧) |
| サーバーの単体テストを足す | 承認(`server/ccp/approvals.py`)・方針の取り込み(`server/ccp/policies.py`)の、まだテストのない分 | `server/tests/` |
