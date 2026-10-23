# 引き継ぎ(HANDOVER)

文脈を持たない状態から作業を再開するための、**いまどこにいるか・次にやること・落とし穴**だけを置く(目安 10KB 以下)。
作業の詳しい記録・経緯は [handover-archive/](handover-archive/README.md)、設計の判断と理由は [handover-archive/DECISIONS.md](handover-archive/DECISIONS.md)。**どちらも、必要なときだけ** ID(X47 など)や節の番号(「HANDOVER 6.13」など)で grep して読む。
作る機能の一覧と順番は [BACKLOG.md](BACKLOG.md)。作業を終える前に、この文書を更新する(最後の章)。

- 最終更新: 2026-10-22(T8 段階 4: セクションを表に・テンプレートの編集画面の作り直し)

---

## 1. いまどこにいるか

- 開発・運用は、Cloud Run で動く 1 つの版だけ([GCP.md](GCP.md))。Power Apps 版は 2026-10-16 に廃止。利用先には Workbench 版の ZIP だけを渡す([RELEASE.md](RELEASE.md))。
- 何人か・何セッションかが、同じ `main` に push している(UI・結果・承認プロセス・BigQuery・文書などのセッション)。
- 済んだ範囲: 一覧(L)・制作指示(P)・週(W。W8 は保留)・アラート(A)・結果(R)・承認(U1〜U6)・制作の依頼(PR)・X の多く(AB テスト・案から選ぶ・素材・画像のライブラリ・テンプレートの版・表示の大きさ・件名など)。状態の正は [BACKLOG.md](BACKLOG.md)。
- 本番: 2026-10-21 の時点で `main` がほぼ反映済み(最新の印のタグは `deployed-gcp/*` で見る)。本番の画面での操作・表と列の追加は、多くが未確認。
- Workbench 版: 最新の公開は 5 章。

## 2. 最近の作業(新しい順。詳しくは [handover-archive/2026-10-20_21.md](handover-archive/2026-10-20_21.md))

- 2026-10-22〜23: **B10 Workbench の開発用の画面**([DEVTOOLS.md](DEVTOOLS.md)。`/dev/`、`CCP_DEVTOOLS=1`)。BigQuery を見る・SELECT・Gemini と SQL を作る会話(セッション)・出力ごとの版と答え合わせ・作業ファイル・実行の履歴・列を調べる・ポリシーの文書。Workbench で試すのは利用者。全文は 2026-10-20_21.md の末尾
- 2026-10-22〜23: **SU1・SU2 シンプルな配信カード**([SIMPLE_CARD.md](SIMPLE_CARD.md) の 12〜18 章)。(a)〜(d)・AB テスト・上の帯(StageHeader)・右端の帯(やり取り / 素材 / 渡すもの)・制作へのメモ・メイン画像のペインまで作り、本番に反映。2026-10-23 に本番が真っ白になった不具合(getTemplate)を直し、ErrorBoundary を足した。clear のあとの引き継ぎは 2026-10-20_21.md の末尾「SU1 の引き継ぎ(2026-10-23 午後)」
- 2026-10-22〜23: **T8 テンプレートの作り直し**(セクション = 表、部品ごとに ID。編集画面は 一覧の帯 | パーツ | キャンバス | 右のタブ「テンプレート / セクションと部品」。箱の見せ方(出すもの・価格の見せ方・バッジ・見本・写真の形)とまとめて直す・ほかの箱にも当てる、画像・動画の部品、ボタンの文字のリンクと色、揃え、均等に並べる行、スマホで縦に積む、背景・余白・区切り線、行の複製・コピー。すべて本番に反映(最後は deployed-gcp/20261023-131257)。設計は [TEMPLATE_OBJECTS.md](TEMPLATE_OBJECTS.md)、記録は 2026-10-20_21.md の末尾。**10-22 の反映に「まとめて作る」の作るチャネルの移動が一緒に入った**(main にも入れてある)
- 2026-10-20〜21: X47・X54 商品のフロート、X49 商品別、R17、X48、X55、X56、X64 商品ページの画像、X65 プレビューのピン、X66 制作の AI チャット、X67 utm_content、振り返りの AI の下書き、設定の段階(BACKLOG 13 章)、T3。**当面、承認の前でも制作に進める・依頼できる**(実践で使い始めるときに戻すかを決める。X68)。行ごとの中身は 2026-10-20_21.md の末尾「HANDOVER から移した行」

## 3. 次にやること

BACKLOG の ☐ / ❓ / ▶ の行が正。いま目に付くもの:

1. **SU1・SU2 シンプルな配信カード(UI 1)**: 次は、利用者が本番で見た感想を聞いて直す(メイン画像のペインは「実物を見て判断」の途中)。**最初に、記録 2026-10-20_21.md の末尾「SU1 の引き継ぎ(2026-10-23 午後)」を読む**(ファイルの役割・決めたこと・残り・落とし穴)。残り: テンプレートが見つからない配信を開いたら AI ドラフトをやり直す(利用者が OK 済み・未着手)、案ごとのテンプレート(SU2 ⑤⑧)、本物の Gemini での案の質。1 日の終わりのまとめ(2026-10-23): FEATURES・SOURCE_MAP は反映済み。**FEATURE_REASONS の作り直しと Workbench 版の公開は、まだ**(`python scripts/feature-reasons.py` → `npm run release:workbench -- --publish`。前の公開は workbench-20261021)。
1. **本番で確かめる**: X63 の SKU のタブは本番で本物の SKU が見えるのを利用者が確かめた(2026-10-21)。**次の BigQuery の取り込みのあと、列 `source`(見本の印)を足しても取り込みが通っているか**(bq_imports の記録・products.stock)を見る。ほかに、テンプレートの版(表 `layout_template_versions`・列 `layout_version`)、素材・画像のライブラリ(バケットへの保存・Gemini での画像の読み取り)、X58 の素材の見本(利用者が本番の ⚙ で押す)。
1. **X64 は本番で動くことを利用者が確かめた**(2026-10-21。deployed-gcp/20261021-173437。見本の EC サイトのページで、本物の Gemini がアングルとおすすめを返す)。本物の写真での効き目は、本物の商品ページの URL が決まってから(BACKLOG の X64 の残り)。
2. **T8 の次**(テンプレートの編集画面は 2026-10-23 で区切り): 段階 6(配信カードの中身を部品 ID で。テキストの書き換え・画像の差し替えを配信カードで効かせる)→ 段階 2(ピン・コメント)。シンプルな配信カードの作業(別のセッション)と同じ所を触るので、区切りを確かめてから。元の価格 `regular_price` は、BigQuery のどの列かが決まったら `bq_import.py` に足す
2. **T2 は作らない**(2026-10-21 利用者の判断): 配信カードから構成は変えない。変えるならテンプレートの編集(新しい版)か、新しいテンプレート(6.57)。テンプレートの次の候補は BACKLOG の T4〜T7(おすすめは T4 結果から学ぶ → T5 → T6)。
3. **X59 の次(保留。2026-10-21 利用者: テンプレートの管理の開発が終わってから)**: 部品の画像を、配信カード・テンプレートのボタンに直接入れる(いまは制作が HTML に貼る)、部品の画像の使われ方の記録(制作のページの HeroPicker の「持っている画像を上げる」は 6.51 で済み)。
4. **BigQuery・方針**: B7(カテゴリ・季節)→ B3・B5 の残り・B6。M5 の残り・M6〜M8。本物の Gemini での効き目は未確認。
5. **X56 の (a)〜(e)**、X1 の残り(変更の履歴)、X35(⚙ から Workbench 版の ZIP)、C1(週の比較)。
6. **B10 開発用の画面の続き(UI 2)**: 2026-10-23 にポリシーの文書のタブまで作った。利用者が Workbench で、本物の GCS の Excel・PDF で試した結果を聞いて直す。記録は [handover-archive/2026-10-20_21.md](handover-archive/2026-10-20_21.md) の「B10」
7. 判断待ち: W8(週の状態をチャネルごとに)、D1〜D5(外部の資料)、U8・PR9(本物の送信・配信の API)。

## 4. 落とし穴

- **同じ `main` に何人も push する。** push の前に `git fetch` → `git pull --rebase`。`src/App.tsx`・`src/CardDetail.tsx` は衝突しやすい。
- **本番で試すデータは、本番のデータ(パック → PGlite の写し)から作る。** 2026-10-17 に seed.json のダミーで本番の週ごとの実績を消した(記録の 6.13)。`bq_import.py` を変えたら、パック → PGlite で `_write` と `_sum_stock` を呼ぶリハーサルを通す(X63 の記録の「リハーサル」)。
- **SKU の表(`sku`・`sku_stock`)の見本は `source = sample`。** BigQuery の取り込みは見本を消さず在庫に数えない。DELETE は `source IS DISTINCT FROM ...` の形で書く(`<>` だと NULL の本物が消えない)。
- **撮影用のビルド(`vite.mock.config.ts`)は `src/data/*.ts` を丸ごと差し替える。** サービスのファイルにサービス以外の関数を置かない(`src/results.ts` などへ)。`src/mock/agent.ts` は `src/aiSelect.ts` を読み込めない(輪になる)。
- **改行コードは、ファイルごとに違う**(`progress.ts` は CRLF、多くは LF)。スクリプトで書き換えるときは、読んだファイルの改行を保つ。BOM(`U+FEFF`)を文字列に直接書かない(`String.fromCharCode(0xfeff)`)。
- **画面で `/img/…`・`/api/…` を使うときは、必ず `appPath`(画像は `heroImage` / `partImage` / `imgSrc`)を通す。** Workbench の中継(`/proxy/<port>/`)の下でだけ壊れる(6.53)。
- **表示の大きさ(CSS の zoom)**: vh / vw は `calc(92vh / var(--ui-zoom, 1))` の形で書く。`window.innerWidth` などは画面の px(6.47)。
- Fluent: `DialogBody` は中を独自の列に並べる(広いフロートは `div` に)。`makeStyles` は `borderWidth` などの短い書き方を受け付けない(`style` に書く)。
- **テンプレートの形は変わり続ける。** 一覧・月の画面の計算(`sectionsOf` など)は、データの形が違っても投げないように書く(ErrorBoundary では App ごと置き換わる)。`(cond && x) ?? y` は false を飛ばさない(2026-10-23 の真っ白)。
- 本番のデータを直すときは、API を Basic 認証で呼ぶ(手順は [GCP.md](GCP.md))。
- **DB(Cloud SQL)は、画面を開いたときの自動起動(10〜13 分)だけ。** 毎晩 21:00 に止まる。`ccp-idle-check`・`ccp-start-db-3days` は一時停止(PAUSED)。
- **本番のビルドは `cloudbuild.yaml`(層のキャッシュ)。** 画面のビルドがほかの場所のファイルを読むようにしたら、Dockerfile の COPY に足す。ほかの人の Cloud Build が動いていれば、終わってから反映する。
- BigQuery の取り込みを手元で試すときの PGlite の手順は、記録の 2026-10-20_21.md の末尾(7 章)。

## 5. 公開した Workbench 版

`20261019-1d1ed27`(ポート 8081)、`20261019-e31e13a`(8082)、`20261019-56fb7fe`、`20261020-c48549b`、`20261020-bbc7f60`(`docs/UPDATE.md` を外した版)、`20261021-8f3dbca`(10-21 の 1 日の終わり。X63〜X68・振り返りの AI・T3 など)。Releases のタグ `workbench-<版>`。経緯は記録の 6.23。新しく公開したら、ここに足す。

## 6. 動かし方・確かめ方

```bash
# データ定義の照合・型・lint・ビルド
npm run verify
# サーバーのテスト
cd server && .venv/Scripts/python -m unittest discover -s tests
# 撮影用(サンプルデータ)で画面を見る。http://localhost:5190
npx vite --config vite.mock.config.ts --port 5190 --strictPort
# サンプルデータを直したら、初期データ(server/seed.json)も書き出してコミットする
npm run seed:export
# 本番に反映(人が指示したときだけ。main・最新・変更なしのときだけ動く)
npm run deploy:gcp
```

## 7. この文書の更新のしかた

- 作業を終える前に、1〜4 章を事実に合わせて直し、最終更新の日付を直してコミットする。
- **短く保つ(目安 10KB 以下)。** 詳しい記録(やったこと・確かめた範囲・残り)は [handover-archive/](handover-archive/README.md) のいちばん新しいファイルの末尾に節を足し、ここの 2 章には 1 行(日付・ID・題名・節)だけ書く。2 章は直近 2 日ほどにし、古い行は消す(記録はアーカイブにある)。
- 済んだ「次にやること」・効かなくなった落とし穴は消す。設計の判断を変えたら [DECISIONS.md](handover-archive/DECISIONS.md) に行を足す。
