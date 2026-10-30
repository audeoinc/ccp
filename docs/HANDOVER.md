# 引き継ぎ(HANDOVER)

文脈を持たない状態から作業を再開するための、**いまどこにいるか・次にやること・落とし穴**だけを置く(目安 10KB 以下)。
作業の詳しい記録・経緯は [handover-archive/](handover-archive/README.md)、設計の判断と理由は [handover-archive/DECISIONS.md](handover-archive/DECISIONS.md)。**どちらも、必要なときだけ** ID(X47 など)や節の番号(「HANDOVER 6.13」など)で grep して読む。
作る機能の一覧と順番は [BACKLOG.md](BACKLOG.md)。作業を終える前に、この文書を更新する(最後の章)。

- 最終更新: 2026-10-29

---

## 1. いまどこにいるか

- 開発・運用は、Cloud Run で動く 1 つの版だけ([GCP.md](GCP.md))。Power Apps 版は 2026-10-16 に廃止。利用先には Workbench 版の ZIP だけを渡す([RELEASE.md](RELEASE.md))。
- 何人か・何セッションかが、同じ `main` に push している(UI・結果・承認プロセス・BigQuery・文書などのセッション)。
- 済んだ範囲: 一覧(L)・制作指示(P)・週(W。W8 は保留)・アラート(A)・結果(R)・承認(U1〜U6)・制作の依頼(PR)・X の多く(AB テスト・案から選ぶ・素材・画像のライブラリ・テンプレートの版・表示の大きさ・件名など)。状態の正は [BACKLOG.md](BACKLOG.md)。
- 本番: どこまで反映したかは、印のタグ `deployed-gcp/*` で見る。本番の画面での操作・表と列の追加は、多くが未確認。
- Workbench 版: 最新の公開は 5 章。

## 2. 最近の作業(1 行ずつ。中身は [handover-archive/2026-10-28_.md](handover-archive/2026-10-28_.md) の末尾。前の行もそこに移した)

- 2026-10-30 UI 1: X87 の 3.1 は本番済み(e062962)。X79 の (e) キャンペーンのまとめての取りやめ・(f) まとめて作るの配信をキャンペーンに入れる は見本 OK で main に(e285b94。反映は連絡係。(f) は本番で利用者が確認)。続きは X87 段 ② の UI 1 の残り。詳しくは archive の末尾
- 2026-10-30 UI 3: X80 段 ①(商品の枠を「詳しく」。スイッチ「素材・機能を詳しく見せる」+ ⓘ、7878e85)・X88(商品の画像を替える)・X86 段 ①(制作の画面の上の部分を計画と共通・Fit・ちらつきの直し、5606505)は main・本番済み。次は ① シンプルな制作の画面の MVP の追加分(共有メモ req-production-simple.md の 2b 章と追記 1・2: AI の手直し・制作した HTML・要素を直す・工程 ②〜④・ピン。ProductionChat / productionRevise を使い回す。区切りごとに見本)→ ② X80 段 ②(商品ページの本文を残す)
- 2026-10-29 UI 2: シンプルな配信カードの AI の入口をそろえた(渡す文章は「AI で書く → 案を押すと入る」`NotesAiDraft`・空いた枠は「入れる」の引き出し・テーマは「AI で変える」・引き出しは確定で閉じる `drawerClose.ts`)。開いたときはアラートがあればアラート、商品情報は閉じる
- 2026-10-30 UI 2: X87 段 ② の UI 2 の分は、残りの 5 つ(ai.autoredraft・ai.learnings・ai.describe・ai.pageimage・content.products.pagefetch)も入れて main に(10-30 利用者: 例外を作らず版に従って止める)。approval.history は UI 1。次は「？ 聞く」の材料を公開している機能だけに絞る。詳しくはアーカイブ 2026-10-28_ の末尾
- 2026-10-30 連絡係: 「AI でテンプレートを作る」の窓の高さを開いたときのまま固定し、中身は窓の中でスクロール(開発へのリクエスト e3723ffb、案 A。見本で OK、本番に反映: deployed-gcp/20261030-132756、main 657ee9a)。e3723ffb への返信はまだ
- 2026-10-30 AI の出口: Copilot Studio を CCP から呼ぶ検証の手順と結果 docs/MS_AI_VERIFY.md を main に(ブランチ claude/ai-outlet-b3c4ae。Azure OpenAI は想定しない)。Direct Line なら人のサインインなしで呼べ、T1〜T6 は JSON ○。Agents SDK は利用者ごとのサインインが要る(標準のハーネスのエージェントでだけ呼べる)。AI Builder の検証はこれから。Workbench の ZIP には入る(共同作業者が 96237dc で Power Platform・Copilot の言葉を許した)

## 3. 次にやること

BACKLOG の ☐ / ❓ / ▶ の行が正。
1. **X81** シンプルにない機能を足す: 1・2・4・7・8・9 は main(UI 2)、3・6 は UI 1。残りは 5
2. **X79 段 ⑤** 本番の移し替え(連絡係が反映とまとめて行う)
3. **App.tsx の残り**(CalendarViews・memo)は UI 1 の C1 と重なるので、連絡係と合わせてから
4. **本番で確かめる**: BigQuery の取り込み後の列 `source`・テンプレートの版・素材のライブラリ
5. 保留・判断待ち: T2 は作らない・X59(テンプレートの管理のあと)・D1〜D5・U8・PR9

## 4. 落とし穴

- **修正のたびに影響確認をする**(2026-10-23。テンプレートの表の作り直しで、シンプルな配信カードを壊した: セクションの番号がずれて見出し・コピーがずれた、画像の部品がボタンとして選ばれた。影響確認をしていなかった)。変える関数・型・プレビューの目印・データの形を grep して使っている所を一覧にし(src/simple/・制作・結果・AI・リンク先も)、番号や並び順で持つ保存済みの中身とのかね合いを確かめ、関係する画面を撮影用の画面で触ってから、確かめた範囲を分けて報告する。直す案は TEMPLATE_OBJECTS.md の 8 章
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

## 5. 公開した Workbench 版

最新は `20261029-6d1baab`(10-29 の締め。X83・X86 の MVP・X87 の土台など。Releases のタグ `workbench-<版>`)。その前は `20261028-777505c`・`20261028-9a4d600`・`20261021-8f3dbca`。それより前の版と経緯は記録の 6.23 と末尾。新しく公開したら、ここを書き換える。

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
