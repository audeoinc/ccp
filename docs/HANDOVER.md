# 引き継ぎ(HANDOVER)

文脈を持たない状態から作業を再開するための、**いまどこにいるか・次にやること・落とし穴**だけを置く(目安 10KB 以下)。
作業の詳しい記録・経緯は [handover-archive/](handover-archive/README.md)、設計の判断と理由は [handover-archive/DECISIONS.md](handover-archive/DECISIONS.md)。**どちらも、必要なときだけ** ID(X47 など)や節の番号(「HANDOVER 6.13」など)で grep して読む。
作る機能の一覧と順番は [BACKLOG.md](BACKLOG.md)。作業を終える前に、この文書を更新する(最後の章)。

- 最終更新: 2026-10-28

---

## 1. いまどこにいるか

- 開発・運用は、Cloud Run で動く 1 つの版だけ([GCP.md](GCP.md))。Power Apps 版は 2026-10-16 に廃止。利用先には Workbench 版の ZIP だけを渡す([RELEASE.md](RELEASE.md))。
- 何人か・何セッションかが、同じ `main` に push している(UI・結果・承認プロセス・BigQuery・文書などのセッション)。
- 済んだ範囲: 一覧(L)・制作指示(P)・週(W。W8 は保留)・アラート(A)・結果(R)・承認(U1〜U6)・制作の依頼(PR)・X の多く(AB テスト・案から選ぶ・素材・画像のライブラリ・テンプレートの版・表示の大きさ・件名など)。状態の正は [BACKLOG.md](BACKLOG.md)。
- 本番: どこまで反映したかは、印のタグ `deployed-gcp/*` で見る。本番の画面での操作・表と列の追加は、多くが未確認。
- Workbench 版: 最新の公開は 5 章。

## 2. 最近の作業(1 行ずつ。中身は [handover-archive/2026-10-28_.md](handover-archive/2026-10-28_.md) の末尾。前の行もそこに移した)

- 2026-10-28: **テンプレートの編集の「似ているテンプレート」**(見本で利用者の OK。main に入れて本番に反映: deployed-gcp/20261028-152333、main 3b0a46f): 左の帯をやめ、右のタブに似ている順・同じ構成の知らせ・見比べる(`TemplateCompareFloat`)・セクションを取り込む・開く・複製して直す。TEMPLATE_OBJECTS.md の 10 章
- 2026-10-28: **T13 テンプレートを AI で直す(入口「AI で直す」。2026-10-29 に名前と見た目をほかの AI のボタンにそろえた: ブランチ claude/t13-ai-edit-button)**(見本で利用者の OK。main に入れて本番に反映: deployed-gcp/20261028-152333、main 3b0a46f。本物の Gemini はまだ確かめていない): task `edit_template`、返答の検査 `templateEdit.ts`(ID を残す・付け直しの救い)、試す → 確定の帯と点線の印。TEMPLATE_OBJECTS.md の 11 章
- 2026-10-28: **機能の公開・非公開の管理の要件** [FEATURE_FLAGS.md](FEATURE_FLAGS.md)(MVP〜FULL の版・大中小の分類・開発規模。決定: 版は定義だけで公開は機能ごと・開発者だけ全部見える・完全に隠す・画面だけ・MVP にアプリと AI で全体を下書き・詳しい配信カードは消す)。まだ作っていない
- 2026-10-29 UI 1: X87 段 ①(機能の公開・非公開の土台: features.ts・isOn・表 feature_settings と '*'・users.is_developer・⚙「使える機能」・「一般の人として見る」)をブランチ claude/ui1-x87-flags に。入口への判定(段 ②)はまだ。詳しくは FEATURE_FLAGS.md の 3 章の囲み
- 2026-10-28 UI 2: セクションの枠(`src/slots.ts`・`Item.gap`)・X81 の 7〜9・セクションの全体を選ぶ(名札 `SectionTagLayer`・パンくず・部品 `section`。呼び名の番号をやめた `sectionsOf`。ピン・アラート・リンク先には残る)は main。X82「？ 聞く」の段 ①②(材料はビルドで作る `helpMaterial.ts`・`src/help/`。質問に近い所だけを渡す。保存の口 `setHelpRecorder`)・段 ③(右クリックの「ここについて聞く」・答えの「開発に伝える」 `startDevRequestAt`・右クリックの共通の項目は鍵ごと)も main・X83 スポットライト(`help/spotlight.ts`・`SpotlightLayer`。見えている名前で探す)も main。④ は UI 3
- 2026-10-28 UI 3: 配信カードの上を 1 行に詰めた(キャンペーンの帯・承認の札 `ApprovalChip`・面のタブ・配信の情報)。きょうだいの切り替えは窓の動きなし(`instant`)。切り口の欄・utm は ⚙ の店の見せ方へ(依頼の写しに固定)。X82 ④ = 質問の保存と FAQ(`server/ccp/help.py`・`src/help/faq.ts`。20 件で聞いた人の画面がまとめ直す。生の記録は 90 日。管理は ⚙ の開発・管理)。④ の SQL は本番で初めて走る

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

最新は `20261028-777505c`(10-28 の締め。詳しい配信カードを消した・「？ 聞く」など。Releases のタグ `workbench-<版>`)。その前は `20261028-9a4d600`・`20261021-8f3dbca`。それより前の版と経緯は記録の 6.23 と末尾。新しく公開したら、ここを書き換える。

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
