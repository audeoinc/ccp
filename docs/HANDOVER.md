# 引き継ぎ(HANDOVER)

文脈を持たない状態から作業を再開するための、**いまどこにいるか・次にやること・落とし穴**だけを置く(目安 10KB 以下)。
作業の詳しい記録・経緯は [handover-archive/](handover-archive/README.md)、設計の判断と理由は [handover-archive/DECISIONS.md](handover-archive/DECISIONS.md)。**どちらも、必要なときだけ** ID(X47 など)や節の番号(「HANDOVER 6.13」など)で grep して読む。
作る機能の一覧と順番は [BACKLOG.md](BACKLOG.md)。作業を終える前に、この文書を更新する(最後の章)。

- 最終更新: 2026-11-04

---

## 1. いまどこにいるか

- 開発・運用は、Cloud Run で動く 1 つの版だけ([GCP.md](GCP.md))。Power Apps 版は 2026-10-16 に廃止。利用先には AWS 版の ZIP を渡す(`npm run release:aws`。Workbench 版の ZIP は 2026-11-03 に停止。[RELEASE.md](RELEASE.md))。
- 何人か・何セッションかが、同じ `main` に push している(UI・結果・承認プロセス・BigQuery・文書などのセッション)。
- 済んだ範囲: 一覧(L)・制作指示(P)・週(W。W8 は保留)・アラート(A)・結果(R)・承認(U1〜U6)・制作の依頼(PR)・X の多く(AB テスト・案から選ぶ・素材・画像のライブラリ・テンプレートの版・表示の大きさ・件名など)。状態の正は [BACKLOG.md](BACKLOG.md)。
- 本番: どこまで反映したかは、印のタグ `deployed-gcp/*` で見る。本番の画面での操作・表と列の追加は、多くが未確認。
- リリース ZIP: AWS 版の最新の公開は `20261103-661ce14`(Releases のタグ `aws-<版>`。見本のデータの直し 17165a3・remove-seed を含む)。Workbench 版の最後の公開は 5 章。

## 2. 最近の作業(1 行ずつ。中身は [handover-archive/2026-10-28_.md](handover-archive/2026-10-28_.md) の末尾。前の行もそこに移した)

- 2026-11-04 UI 2: X106 スキーマの重ね読みを main に(`server/ccp/client/schema.json`。足すだけ。ぶつかれば verify・起動・check が理由を出して止める。ファイルがなければ今までと同じ)。次は X107 → X108 → X109。
- 2026-11-04 要件の相談役: AWS 版の取り込みを、総入れ替えからマージ(`vendor` → `main`。CCP はリポジトリの中の `ccp/`)に変えると決めた。AWS 側はデータに合わせてスキーマ・表・画面を変える。文書は [AWS_CUSTOMIZE.md](AWS_CUSTOMIZE.md)。**開発側の新機能は、AWS 側の追加がなくても動くように作る。** スキーマの重ね読みなどの仕組みは未着手(その文書の 7 章)
- 2026-11-04 連絡係: Copilot Studio の検証(docs/MS_AI_VERIFY.md・道具 tools/ms-verify/)。方式 1 Direct Line は文・画像とも使える(1 回 4MB まで)。方式 3 AI Builder は Power Automate の流れを窓口にすると文・画像とも通った(画像は 1 回 1 枚まで。流れの Image の欄を base64ToBinary にする)。方式 2 Agents SDK は利用者ごとのサインインが要る。残り: AI Builder で何枚も送る(T9)・道具をサーバーでも使える手直し
- 2026-11-03 1 日の終わりの文書の更新(10-30〜11-03 の分): FEATURES・SOURCE_MAP・FEATURE_REASONS(F189〜F196・S15〜S18)・USER_STORIES・BACKLOG(X101 を DONE、X98 を ▶)・FLOWS 1.1・2.9。`source-map.drawio` は直していない
- 2026-11-03 UI 1: W2 の SSO のサーバー側・入口の認証がないときの扱い(中継の印は 503。**Workbench・AWS は `CCP_AUTH=none` などが要る**)・X103・X104 は main。SSO の画面(右上のメニューのログアウト・切れたときの案内 `src/gcp/loginExpired.ts`)も main に入れた(2026-11-04。**見た目は利用者が未確認**。Entra のある別の環境で利用者が確認する。ログインなしの置き先の見た目は変わらない)。残りは X104 を本物の DB で確認
- 2026-11-04 UI 2: W1 データの入口の切れ目を main に(`ccp/datasource.py` の約束 3 つ・`bq.BigQuerySource`・契約テスト `test_contract_datasource.py`。取り込みの動きは変わらない)。W3 も main に(定期の取り込みは読む前に番を取る `TICK_LOCK_KEY`・健康診断の行「外へのつなぎ」)。詳しくはアーカイブ 2026-10-28_ の末尾
- 2026-11-03 UI 2: settings.dataimport ①〜③・settings.ai・settings.setup の健康診断(サーバーと画面)・仕事の設定を DB に(`app_settings`)は main。次は初期設定の画面 → 設定の型。本番の `BQ_AUTO_SYNC=0` を消すかは利用者
- 2026-11-03 UI 3: X56 (b)〜(d)・W5 契約テスト・見本のデータは人が明示したときだけ(`cli remove-seed`)は main。割り当てなし。残り物は AB の案 B の「詳しく」をプレビューに(`vs.details`)と、パックの商品の消し方の相談
- 2026-11-03 W6 AWS 版の ZIP(`npm run release:aws`・`docs/AWS.md`)は main・公開済み(5 章)。最適化(optimize-survey の 1〜6)・X95 も済み
- 2026-11-02 X86・X89・X90(K5 で詳しい制作のページを消した)・X80・X92〜X94 は main。**未決**: `prod.htmlcode` の FEATURE_FLAGS の書き方(連絡係が確認中)

## 3. 次にやること

BACKLOG の ☐ / ❓ / ▶ の行が正。
1. **X98** SSO の画面は main(利用者が別の環境で見た目を確認する)。そのあと X97・X99・X100(置き先の差し込み口)と X96(引っ越し用のパックを消す)
2. **X102** AWS 版: 利用者が試した結果を待つ。公開は人の指示で
3. **X79** の残りは Workbench での移し替え(B13 と一緒)だけ
4. **App.tsx の残り**(CalendarViews・memo)は UI 1 の C1 と重なるので、連絡係と合わせてから
5. **本番で確かめる**: BigQuery の取り込み後の列 `source`・テンプレートの版・素材のライブラリ・定期の取り込み
6. 保留・判断待ち: T2 は作らない・X59(テンプレートの管理のあと)・D1〜D5・U8・PR9

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

- AWS 版: 最新は `20261103-661ce14`(2026-11-03。その前は 20261103-a638168)。新しく公開したら、ここを書き換える。

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
