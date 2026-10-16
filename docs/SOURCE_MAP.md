# ソースの地図: ファイルの構造と役割

CCP のソースファイルが、どこに・何のためにあるかの一覧。はじめてコードを読む人と、「この変更はどこを触ればよいか」を探す人向け。

- 最終更新: 2026-10-15(`main` の時点のファイル。行数は目安)
- 設計の約束事・AI の仕組みの詳しい話は [ARCHITECTURE.md](ARCHITECTURE.md)、サーバー・DB・AI は [GCP.md](GCP.md)、いまどこにいるかは [HANDOVER.md](HANDOVER.md)
- ファイルを足したり、役割を変えたりしたら、この表も直す

---

## 1. 全体の形

画面のコード(`src/`)は 1 つで、**データと AI の出入り口だけを差し替えて、2 種類のアプリを作る**。

```
                    画面のコード(src/*.tsx, src/*.ts) ── どちらのビルドでも共通
                                   │
            src/data/<表>.ts の …Service を呼ぶ(型は src/models)
                                   │
              ┌────────────────────┴────────────────────┐
              ▼                                         ▼
 本番(Cloud Run・Workbench)                      撮影・デモ用
 vite.config.ts                                  vite.mock.config.ts
 src/gcp/services.ts → server/ の API            src/mock/db.ts に差し替え(メモリ上のデータ)
 AI は /api/ask(Gemini)                         AI は src/mock/agent.ts
              │
              ▼
     server/(FastAPI)
     PostgreSQL・画像・Gemini
```

- **Power Apps 版は 2026-10-16 に廃止し、ソースも削除した。** 同じ日に、名前(`cr854_…`)と選択肢の数も、読みやすい名前・文字の値に変えた(GCP.md の「データ定義」)。
- 撮影・デモ用の差し替えは、`vite.mock.config.ts` のプラグインが、サービスの読み込みを置き換えて行う。そのため、画面のコードはビルドの違いを知らない。

## 2. 一番上の階層

| パス | 役割 |
|---|---|
| `src/` | 画面のコード(React 19 + TypeScript + Fluent UI v9) |
| `server/` | サーバー(Python / FastAPI)。画面・データ API・AI・画像を配る |
| `scripts/` | 反映・検証・撮影・Workbench の運用などの補助スクリプト |
| `docs/` | 文書、ワイヤーフレーム、スクリーンショット、サンプルデータ(CSV) |
| `.github/workflows/ci.yml` | GitHub の CI(スキーマの照合・型チェック・lint・ビルド・サーバーのテスト) |
| `index.html` | 画面の入口の HTML |
| `vite.config.ts` / `vite.mock.config.ts` | ビルドの設定(本番 / 撮影用。1 章) |
| `package.json` | npm のスクリプト(`dev`・`build`・`verify`・`deploy:gcp`・`dev:gcp` と `build:gcp`(`dev`・`build` と同じ。Workbench の手順のため)・`screenshots`・`seed:export`) |
| `Dockerfile` / `.dockerignore` / `.gcloudignore` | Cloud Run のコンテナ |
| `tsconfig*.json` / `eslint.config.js` | 型チェック・lint の設定 |
| `CLAUDE.md` / `README.md` | AI アシスタント向けの約束事 / 全体の紹介 |

## 3. 画面(`src/`)

### 3.1 入口と土台

| ファイル | 行数 | 役割 |
|---|---|---|
| `main.tsx` | 14 | 起動。フォント・CSS を読み、`Root` を描く |
| `Root.tsx` | 12 | Fluent UI のテーマで `App` を包む |
| `App.tsx` | 1,030 | **画面の入口**。ヘッダー・ツールバー・絞り込み、計画 / 結果 / アラートの面の切り替え、月 / 週 / 一覧の切り替え、配信カードを開く |
| `theme.ts` | 70 | Fluent UI のテーマ(色・書体) |
| `fonts.ts` | 23 | 同梱のフォント(外部の CDN に頼らない) |
| `index.css` | — | 全体の CSS と、印刷(週の資料・レポート)のときの見せ方 |
| `i18n.ts` | 118 | 日本語 / English の切り替え(`t` / `tr` / `useT` / `optionLabel`) |
| `appRoot.ts` | 22 | アプリの置き場所。API・画像のパスの基準(Workbench の `/proxy/8081/` の下でも動くように) |
| `settings.ts` | 36 | アプリ全体の設定(自動下書きのオン・オフなど。ブラウザごと) |

### 3.2 計画の面(カレンダー・週・一覧)

| ファイル | 行数 | 役割 |
|---|---|---|
| `Calendar.tsx` | 242 | 月のカレンダー(配信・締め切りの近い配信・アラートの印) |
| `WeekView.tsx` | 414 | 週の表示(縮小プレビューつき。商品のバランス / 進み具合の 2 つの見方) |
| `WeekReviewBar.tsx` | 253 | 週の状態の帯(レビューに出す・確定・承認、確定後の変更、承認の履歴、PDF) |
| `WeekChecklist.tsx` | 93 | 週の確認の一覧(項目ごとの件数と中身) |
| `reviewChecks.ts` | 196 | 週の確認の判定(上限超えの商品・主力の漏れ・連続 など) |
| `weekLabels.ts` | 45 | 週のレビューの項目名・説明・履歴の文言(画面と PDF で共通) |
| `weekLock.ts` | 29 | 確定した週の、変更の制限 |
| `WeekReport.tsx` / `printWeek.ts` | 203 / 48 | 週の資料(A4 の PDF)と、その印刷 |
| `ListView.tsx` / `listRows.ts` | 160 / 110 | 表の形の一覧と、その列の定義(CSV の書き出しも同じ定義) |
| `MiniCalendar.tsx` | 166 | ツールバーのミニカレンダー(月・週・日へ移る) |
| `DeliveryPeek.tsx` / `CardPreview.tsx` | 34 / 68 | 配信にマウスを重ねたときのプレビュー / 保存済みの配信カードのプレビュー |
| `status.ts` / `progress.ts` | 25 / 147 | 配信のステータスの色・チャネル / 工程(進み具合) |

### 3.3 配信カード(全画面のフロート)

配信カードは 4 ペイン: **左** 配信情報 / **中** コンテンツ生成(タブ) / **プレビュー** / **右** 商品情報(参照専用)。

| ファイル | 行数 | 役割 |
|---|---|---|
| `CardDetail.tsx` | 1,417 | **配信カードの本体**。4 ペインの配置、読み込み・保存、AI の下書きの起動、承認・差し戻し |
| `CardMenu.tsx` | 160 | 「…」メニュー(取りやめ・削除 など) |
| `cancel.ts` | 61 | 配信の取りやめ(消さずに残す) |
| `CardAlertsBar.tsx` | 70 | 配信カードの上の、アラートの帯 |
| `LearningsBar.tsx` | 162 | 「これまでの学び」(過去の結果から) |
| `Splitter.tsx` / `ResizeHandles.tsx` | 49 / 67 | ペインの幅の変更 / フロートの大きさの変更 |

**中ペイン(コンテンツ生成)** — 選んだ商品の操作は、ここだけで行う

| ファイル | 行数 | 役割 |
|---|---|---|
| `ContentPane.tsx` | 1,397 | **中ペインの本体**。テーマ・テンプレート・メイン画像・セクション・制作指示のタブと、リンク先・引き継ぎ |
| `useSelection.ts` | 156 | 選定した商品・候補の操作(昇格・降格・並べ替え・ドラッグ&ドロップ) |
| `ProductRow.tsx` / `Candidates.tsx` | 139 / 145 | 選定した商品の行 / 候補の一覧(大量でも重くならないように) |
| `HeroCandidates.tsx` | 124 | メイン画像の候補(すべての画像から探して設定) |
| `ChatPanel.tsx` | 280 | AI チャット |
| `NotesEditor.tsx` / `MarkdownLite.tsx` | 124 / 51 | 制作指示の入力(Markdown)/ その表示 |
| `LinksEditor.tsx` / `links.ts` | 146 / 139 | リンク先の入力 / 配信ごとのリンク先(JSON で保存) |
| `HandoffPanel.tsx` | 89 | 制作への引き継ぎ |
| `PushTimingPanel.tsx` / `pushLink.ts` | 70 / 24 | アプリの配信の時刻・相手 / 通知を押したときに開く画面 |
| `QuestionsPanel.tsx` / `TasksPanel.tsx` | 284 / 186 | 制作からの質問と返信 / タスク |
| `CommentsPanel.tsx` | 407 | レビューのコメント(スレッド) |
| `AiButton.tsx` / `AiMark.tsx` | 14 / 17 | AI に頼むボタン / AI の印 |
| `AutoTextarea.tsx` | 23 | 内容に合わせて高さが伸びる、複数行の入力 |

**プレビュー**

| ファイル | 行数 | 役割 |
|---|---|---|
| `Preview.tsx` | 951 | **メール・プッシュのプレビュー**(受信側の見た目。色の直書きは、ここだけ例外) |
| `FitPreview.tsx` | 30 | プレビューを、スクロールせずに全体が見える大きさに縮める |
| `LinkOverlay.tsx` | 188 | プレビューの上に、リンク先の番号・枠・URL の吹き出しを重ねる |

**右ペイン(商品情報。参照専用で、操作する部品を置かない)**

| ファイル | 行数 | 役割 |
|---|---|---|
| `ProductInfoPane.tsx` | 154 | 載せた商品の情報の一覧 |
| `ProductDetail.tsx` / `MiniChart.tsx` | 170 / 86 | 商品の詳細のフロート / 推移のグラフ |
| `useProductData.ts` | 83 | 商品の週ごとの実績などを読む(開いている間だけ覚える) |
| `ImageThumb.tsx` | 44 | 画像のサムネイル |

### 3.4 AI

AI の呼び出しは **`askAgent`(`aiSelect.ts`)だけ**を通す。指示文は日本語で書き、English の画面では `localizePrompt` が言い換える。

| ファイル | 行数 | 役割 |
|---|---|---|
| `aiSelect.ts` | 559 | **AI の呼び出しの入口**(`askAgent`)と、商品・メイン画像・見出し・コピーの選定 |
| `aiDraft.ts` | 222 | テーマ・コピー・制作指示の「案」 |
| `autoDraft.ts` | 197 | 「すべてAIで下書き」(1 回で 6〜9 回呼ぶ) |
| `useAiDrafts.ts` | 248 | 下書きの状態を、画面に渡すフック |
| `aiReview.ts` / `aiCompare.ts` | 43 / 53 | 結果の振り返り / 配信どうしの比較 |
| `aiTasks.ts` | 42 | 制作とのやり取りから、タスクの案を出す |
| `themeTypes.ts` / `themeGuess.ts` | 70 / 20 | テーマの種類 / 言葉から種類を推し量る |

### 3.5 アラート

| ファイル | 行数 | 役割 |
|---|---|---|
| `AlertsPage.tsx` | 392 | アラートの面(左に一覧、右に選んだアラート) |
| `alerts.ts` | 342 | **在庫のアラートの計算**(配信日の在庫の見込み)と、変更のアラート |
| `cardAlerts.ts` | 76 | アラートを、配信ごとに分ける(カード・カレンダーの印) |
| `alertSettings.ts` / `AlertSettingsDialog.tsx` | 94 / 113 | アラートの条件(ブラウザごと)と、その設定の画面 |
| `alertActions.ts` / `AlertActionPanel.tsx` | 137 / 221 | アラートへの対応(商品の差し替え・延期) |
| `ChangeAlertDetail.tsx` | 221 | 変更のアラート(方針・日程の変更)の詳しい中身 |
| `AlertMark.tsx` | 19 | カレンダーの配信に付ける、アラートの印 |
| `history.ts` | 37 | 操作の履歴の記録の入り口(承認・ステータスの変更) |

### 3.6 結果の面

| ファイル | 行数 | 役割 |
|---|---|---|
| `ResultsPage.tsx` | 500 | 結果の面(月 / 週 / 一覧、まとめ方、取り込み・書き出し) |
| `ResultsCalendar.tsx` | 208 | 結果の月・週の表示 |
| `ResultsCompareView.tsx` | 371 | 条件で絞り込んだ配信を並べて比べる |
| `ResultDetail.tsx` | 206 | 詳しい結果のフロート |
| `ResultSummary.tsx` | 184 | 主な数字と、メモ・商品の売れ方・AI の案 |
| `ResultCompare.tsx` | 324 | 過去の配信と比べる・AI の振り返り |
| `ResultPeek.tsx` | 85 | 計画の面で、配信カードの上に結果を重ねる |
| `HeatPreview.tsx` | 193 | プレビューの上に、リンクごとのクリックを重ねる |
| `results.ts` | 256 | 結果の計算(前週比・前年比・まとめ)と、CSV の読み書き |
| `printReport.ts` | 35 | 配信 1 本のレポートの印刷 |
| `csv.ts` | 34 | CSV の読み方(サンプルデータと結果の取り込みで共通) |

### 3.7 テンプレート

| ファイル | 行数 | 役割 |
|---|---|---|
| `templates.ts` | 554 | **テンプレートの定義**(標準 10 種はコードに持つ)と `getTemplate(id)`。以前からの標準 6 種は、セクションの構成を変えない |
| `layoutTemplates.ts` | 225 | ユーザーが作ったテンプレート(DB)の読み書き、上限 |
| `TemplateManager.tsx` | 704 | テンプレートの管理画面 |
| `TemplateThumb.tsx` / `PushThumb.tsx` | 241 / 55 | テンプレートの見取り図(メール / アプリの通知) |

### 3.8 共通の小さな部品・値

| ファイル | 行数 | 役割 |
|---|---|---|
| `items.ts` | 38 | 配信に載せる商品 1 件の型 |
| `market.ts` | 14 | 商品・メイン画像の市場(JP / US)と、配信カードの国の対応 |
| `labels.ts` | 29 | 選択肢の表示名を、値から補う |
| `images.ts` | 26 | 同梱のイラスト(画像の URL が空のとき) |
| `assets/products/` ・ `assets/heroes/` | — | 同梱のイラスト(商品・メイン画像) |

### 3.9 データの出入り口

| パス | 役割 |
|---|---|
| `models/` | 表の行の型と、選択肢の値(`export const DeliveryCardStatus = { not_started: '未起案', … }`) |
| `data/` | 表ごとの読み書きのサービス(`DeliveryCardsService` など)。一部の表は、型もここに持つ |
| `gcp/services.ts` | サーバーの `/api/data/…` を呼ぶ、データの入出力(`tableService`) |
| `gcp/ai.ts` | AI の依頼のサービス(サーバーの `/api/ask` を呼ぶ) |
| `gcp/dbWake.ts` | 「データベースを準備中」の表示 |
| `mock/db.ts` ・ `mock/agent.ts` ・ `mock/seed.ts` | 撮影・デモ用の、DB と AI の身代わりと、サンプルデータ(本番のビルドには入らない) |

## 4. サーバー(`server/`)

| パス | 行数 | 役割 |
|---|---|---|
| `ccp/main.py` | 121 | **サーバーの入口**。画面(`dist-gcp/`)・API を 1 つのプロセスで配る。Basic 認証 |
| `ccp/data_api.py` | — | `/api/data/{テーブル}` の読み書き。初めて DB につないだとき、足りない列・テーブルを足す |
| `ccp/schema.py` | 290 | `schema.json` の読み込み、値の変換、選択肢の確かめ、以前の名前・値からの移行 |
| `schema.json` | — | **データ定義**(テーブル・列・選択肢の値)。列を足すときはここ |
| `ccp/db.py` | — | PostgreSQL への接続(`DATABASE_URL`、または Cloud SQL) |
| `ccp/dbctl.py` | 173 | Cloud SQL の自動起動・自動停止(本番の Cloud Run だけ) |
| `ccp/ai.py` | 89 | `/api/ask`。依頼文を Gemini(Vertex AI)に渡し、返答をそのまま返す |
| `ccp/assets.py` | — | `/img/…`。商品・メイン画像を、GCS か `ASSET_DIR` のフォルダから配る |
| `ccp/creds.py` | — | Google の認証(サービスアカウント) |
| `ccp/pack.py` | 113 | 引っ越し用のパック(すべてのデータと画像の ZIP)の書き出し・取り込み |
| `ccp/cli.py` | — | 運用のコマンド(`migrate` / `seed` / `counts` / `check` / `import-pack`) |
| `ccp/check.py` | 135 | 動かす前の確認(設定・DB・写真・画面のビルド) |
| `ccp/importer.py` | — | 画像から、デモ用の商品・メイン画像のデータを作って取り込む運用ツール |
| `seed.json` | — | 初期データ(`scripts/export-seed.mjs` が `src/mock/seed.ts` から作る) |
| `tests/` | — | サーバーのテスト(`python -m unittest discover server/tests`。CI でも実行) |
| `requirements.txt` / `requirements-tools.txt` | — | Python のパッケージ(サーバー / 運用ツール) |
| `workbench.env.example` | — | Workbench の設定の見本(本物の `workbench.env` は Git に入れない) |

## 5. スクリプト(`scripts/`)

| ファイル | 役割 |
|---|---|
| `workbench.sh` | Workbench の操作(`setup` / `update` / `start` / `stop` / `status` / `check` / `import` / `log`) |
| `deploy-gcp.mjs` | 本番(Cloud Run)への反映(`npm run deploy:gcp`。main・最新・変更なしのときだけ) |
| `check-schema.mjs` | `server/schema.json` と画面の型(`src/models`・`src/data`)の食い違いの検出(`npm run verify`) |
| `export-seed.mjs` | 初期データを `server/seed.json` に書き出す(`npm run seed:export`) |
| `gcp-smoke.mjs` | 本番・手元のサーバーの動作確認(画面を開いて、カードが出るか) |
| `screenshots.mjs` | スクリーンショットの撮影(撮影用のビルド + 模擬の AI) |
| `feature-reasons.py` | 機能の理由の台帳(`docs/FEATURE_REASONS.md`)を作る |

## 6. この変更は、どこを触るか

| やりたいこと | 主に触るところ |
|---|---|
| データの列・テーブルを足す | `server/schema.json`(サーバーが起動後に自動で足す)。型は `src/models/`、新しいテーブルは `src/data/` にサービスを足す |
| AI の指示文・選定のしかたを変える | `src/aiSelect.ts`(選定)・`src/aiDraft.ts`(案)・`src/autoDraft.ts`(すべて下書き)。呼び出しは `askAgent` だけを通す |
| AI のモデル・考える量を変える | 環境変数 `GEMINI_MODEL` / `GEMINI_THINKING`(`server/ccp/ai.py`) |
| 配信カードの中ペインにタブ・機能を足す | `src/ContentPane.tsx`(保存は `src/CardDetail.tsx`) |
| プレビューの見た目を変える | `src/Preview.tsx`(テンプレートの定義は `src/templates.ts`) |
| 在庫のアラートの計算を変える | `src/alerts.ts`(条件は `src/alertSettings.ts`) |
| 週の確認の項目を足す | `src/reviewChecks.ts` と `src/weekLabels.ts` |
| ヘッダー・ツールバー・面の切り替え | `src/App.tsx` |
| 画面の文言を日英で足す | その場で `t('日本語', 'English')`(`src/i18n.ts`) |
| Workbench の運用を変える | `scripts/workbench.sh`・`server/ccp/check.py`・[WORKBENCH.md](WORKBENCH.md) |
