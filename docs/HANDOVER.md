# 引き継ぎ(HANDOVER)

文脈を持たない状態から作業を再開するための、**いまどこにいるか・次にやること・落とし穴**だけを置く(目安 10KB 以下)。
作業の詳しい記録・経緯は [handover-archive/](handover-archive/README.md)、設計の判断と理由は [handover-archive/DECISIONS.md](handover-archive/DECISIONS.md)。**どちらも、必要なときだけ** ID(X47 など)や節の番号(「HANDOVER 6.13」など)で grep して読む。
作る機能の一覧と順番は [BACKLOG.md](BACKLOG.md)。作業を終える前に、この文書を更新する(最後の章)。

- 最終更新: 2026-11-03

---

## 1. いまどこにいるか

- 開発・運用は、Cloud Run で動く 1 つの版だけ([GCP.md](GCP.md))。Power Apps 版は 2026-10-16 に廃止。利用先には AWS 版の ZIP を渡す(`npm run release:aws`。Workbench 版の ZIP は 2026-11-03 に停止。[RELEASE.md](RELEASE.md))。
- 何人か・何セッションかが、同じ `main` に push している(UI・結果・承認プロセス・BigQuery・文書などのセッション)。
- 済んだ範囲: 一覧(L)・制作指示(P)・週(W。W8 は保留)・アラート(A)・結果(R)・承認(U1〜U6)・制作の依頼(PR)・X の多く(AB テスト・案から選ぶ・素材・画像のライブラリ・テンプレートの版・表示の大きさ・件名など)。状態の正は [BACKLOG.md](BACKLOG.md)。
- 本番: どこまで反映したかは、印のタグ `deployed-gcp/*` で見る。本番の画面での操作・表と列の追加は、多くが未確認。
- リリース ZIP: AWS 版の最新の公開は `20261103-a638168`(Releases のタグ `aws-<版>`。入口の認証の抜け道の直し cfed7df を含む)。Workbench 版の最後の公開は 5 章。

## 2. 最近の作業(1 行ずつ。中身は [handover-archive/2026-10-28_.md](handover-archive/2026-10-28_.md) の末尾。前の行もそこに移した)

- 2026-11-03 UI 1: W2 の抜け道を直した: 入口の認証がないとき、中継の印(X-Forwarded-*・Forwarded・X-Real-IP)がある依頼は「中から」とみなさず 503(同じ機械の nginx から通っていた)。**Workbench は `workbench.env` に `CCP_AUTH=none` が要る**(example に入れた・`workbench.sh` が起動の前に注意・check は「足りない」)
- 2026-11-03 UI 1: W2 Entra の SSO のサーバー側は main(`identity.py`・`oidc.py`・`test_auth_port.py`。手順は WORKBENCH.md 7.2)。**画面(ログアウト・切れたときの案内)は見本の ui1-sso で利用者の確認待ち**
- 2026-11-03 W6 AWS 版の ZIP: `release.mjs`(`npm run release:aws`)・`docs/AWS.md` は main。Releases に公開済み(5 章)
- 2026-11-03 最適化(optimize-survey の 1〜6)が済んだ: 89675b8・c472ad1・83a4795・2b96f67・adcd6f3・f063157。X95 も本番済み(3250961・c8104ee)。
- 2026-11-02 UI 1: X90 の塊 A・E・F、K5(詳しい制作のページを消した)、X93・X94 は main。X87 段 ② の UI 1 の残りは続き(詳しくはアーカイブ 2026-10-28_ の末尾)
- 2026-11-02 UI 3: X86 の追加分は main(b046f54)。**未決**: `prod.htmlcode` の FEATURE_FLAGS の書き方(連絡係が確認中)。次は D(面の枠に載せる・simple-finish.md の制作の穴)
- 2026-11-02 UI 2: X92 は main。X89 の部品(ResultsAiPanel・ResultsTalkPanel)はブランチ ui2-results-panels で UI 3 が差し込む
- 2026-11-03 UI 3: W5 契約テスト(`test_contract_ai.py`・`test_contract_assets.py`)と X56 (c)(d) は main(8f02dc4)
- 2026-11-03 UI 3: X56 (b) AI の案の扱い(`ai_runs.adoption`・`src/aiAdoption.ts`)を本物でも記録
- 2026-11-02 UI 3: X89 結果のシンプルな画面は main。**残り**: AB の案 B の「詳しく」をプレビューに渡す(`vs.details`)
- 2026-11-02 UI 2: AI の出口(AI_OUTLET_PLAN の 7 章 1〜4)は main(`docs/AI_OUTLET.md`)
- 2026-11-02 UI 2: 塊 B・C、X80 段 ②〜④(X80 は済み)は main
- 2026-11-03 UI 2: 書く欄の粒度と向き(やり取りを「＋ やり取りを始める」に・`growUp`)は main(3250961)
- 2026-11-03 UI 2: settings.setup の 1 段目「設定の健康診断」(`ccp/health.py` の `diagnose()`・⚙ の「設定の状態」)は**見本の ui2-setup**。次は初期設定の画面 → 設定の型
- 2026-11-03 UI 2: settings.dataimport ①②(定期の取り込み・`/api/bq/*`・表 `app_settings`)は main。**③ 管理の画面(`DataImportPanel`)と「AI の設定」は見本の ui2-dataimport(利用者の OK 待ち)**。定期の取り込みが切のあいだ本番の `BQ_AUTO_SYNC=0` を消せる(消すかは利用者)
- 2026-10-30 連絡係: 「AI でテンプレートを作る」の窓の高さを固定(e3723ffb。本番済み)。返信はまだ
- 2026-10-30 AI の出口: Copilot Studio を CCP から呼ぶ検証 docs/MS_AI_VERIFY.md(ブランチ claude/ai-outlet-b3c4ae)。測る道具は tools/ms-verify/(ブランチのみ)

## 3. 次にやること

BACKLOG の ☐ / ❓ / ▶ の行が正。
1. **X81** シンプルにない機能を足す: 1・2・4・7・8・9 は main(UI 2)、3・6 は UI 1。残りは 5
2. **X79 段 ⑤** 本番の移し替え(連絡係が反映とまとめて行う)
3. **App.tsx の残り**(CalendarViews・memo)は UI 1 の C1 と重なるので、連絡係と合わせてから
4. **本番で確かめる**: BigQuery の取り込み後の列 `source`・テンプレートの版・素材のライブラリ
5. 保留・判断待ち: T2 は作らない・X59(テンプレートの管理のあと)・D1〜D5・U8・PR9

## 4. 落とし穴

- **修正のたびに影響確認をする**(2026-10-23。テンプレートの表の作り直しで、シンプルな配信カードを壊した: 番号がずれて見出し・コピーがずれた)。変える関数・型・プレビューの目印・データの形を grep して使っている所を一覧にし、番号や並び順で持つ保存済みの中身とのかね合いを確かめ、関係する画面を撮影用の画面で触ってから、確かめた範囲を分けて報告する。直す案は TEMPLATE_OBJECTS.md の 8 章
- **同じ `main` に何人も push する。** push の前に `git fetch` → `git pull --rebase`。`src/App.tsx`・`src/CardDetail.tsx` は衝突しやすい。
- **本番で試すデータは、本番のデータ(パック → PGlite の写し)から作る。** 2026-10-17 に seed.json のダミーで本番の週ごとの実績を消した(記録の 6.13)。`bq_import.py` を変えたら、パック → PGlite で `_write` と `_sum_stock` を呼ぶリハーサルを通す(X63 の記録の「リハーサル」)。
- **SKU の表(`sku`・`sku_stock`)の見本は `source = sample`。** BigQuery の取り込みは見本を消さず在庫に数えない。DELETE は `source IS DISTINCT FROM ...` の形で書く(`<>` だと NULL の本物が消えない)。
- **撮影用のビルド(`vite.mock.config.ts`)は `src/data/*.ts` を丸ごと差し替える。** サービスのファイルにサービス以外の関数を置かない(`src/results.ts` などへ)。`src/mock/agent.ts` は `src/aiSelect.ts` を読み込めない(輪になる)。
- **改行はすべて LF**(CLAUDE.md の 4)。Windows の Python で書くときは `newline=''`。BOM を文字列に直接書かない(`String.fromCharCode(0xfeff)`)。
- **画面で `/img/…`・`/api/…` を使うときは、必ず `appPath`(画像は `heroImage` / `partImage` / `imgSrc`)を通す。** Workbench の中継(`/proxy/<port>/`)の下でだけ壊れる(6.53)。
- **表示の大きさ(CSS の zoom)**: vh / vw は `calc(92vh / var(--ui-zoom, 1))` の形で書く。`window.innerWidth` などは画面の px(6.47)。
- Fluent: `DialogBody` は中を独自の列に並べる(広いフロートは `div` に)。`makeStyles` は `borderWidth` などの短い書き方を受け付けない(`style` に書く)。
- **テンプレートの形は変わり続ける。** 一覧・月の画面の計算(`sectionsOf` など)は、データの形が違っても投げないように書く(ErrorBoundary では App ごと置き換わる)。`(cond && x) ?? y` は false を飛ばさない(2026-10-23 の真っ白)。
- 本番のデータを直すときは、API を Basic 認証で呼ぶ(手順は [GCP.md](GCP.md))。
- **DB(Cloud SQL)は、画面を開いたときの自動起動(10〜13 分)だけ。** 毎晩 21:00 に止まる。`ccp-idle-check`・`ccp-start-db-3days` は一時停止(PAUSED)。
- **本番のビルドは `cloudbuild.yaml`(層のキャッシュ)。** 画面のビルドがほかの場所のファイルを読むようにしたら、Dockerfile の COPY に足す。ほかの人の Cloud Build が動いていれば、終わってから反映する。
- BigQuery の取り込みを手元で試すときの PGlite の手順は、記録の 2026-10-20_21.md の末尾(7 章)。

## 5. 公開した版

- AWS 版: 最新は `20261103-a638168`(2026-11-03。初めての公開)。新しく公開したら、ここを書き換える。

### Workbench 版(2026-11-03 に停止)

最後は `20261030-dfd1abf`(10-30 の締め。Releases のタグ `workbench-<版>`)。それより前の版と経緯は記録の 6.23 と末尾。

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
