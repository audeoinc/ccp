// 前提運用の照らし合わせ(⚙ の画面)の行の定義。中身は docs/PROCESS.md の 3 章(業務)・5.3(要検討)・6 章(物差し)・7 章(前提の決まり)・8.1(聞くこと)の写し。
// PROCESS.md を変えたら、ここも直す。行の ID(A1・R1・M1 など)は保存のかぎ(process_checks.row_id)なので、変えない・使い回さない。
// 文言は画面の言語に合わせるので、定数ではなく関数で返す(呼ぶたびに tr が今の言語を読む)
import { tr } from '../i18n'

/** 段階の色の種類(画面のスタイルの名前) */
export type StageTone = 'plan' | 'prod' | 'res' | 'other'

export interface ProcessStage {
  key: string
  name: string
  tone: StageTone
  /** 聞くこと(8.1) */
  ask: string
}

/** 業務の行(3 章)と、前提の決まりの行(7 章。P) */
export interface ProcessRow {
  id: string
  stage: string
  name: string
  /** CCP の前提運用 */
  ccp: string
  /** 差があったときに良くなること(時間・質…)。7 章の行にはない */
  gains: string[]
  /** 機能の番号(FEATURE_REASONS.md) */
  fids: string
}

/** 要検討の機能(5.3) */
export interface ReviewRow {
  id: string
  name: string
  why: string
  ask: string
  ifno: string
}

/** 物差し(6 章) */
export interface MetricRow {
  id: string
  name: string
  rows: string
}

export const processStages = (): ProcessStage[] => [
  { key: 'A', tone: 'plan', name: tr('起案(何を配信するか)', 'Planning (what to send)'), ask: tr('配信の予定・進み具合をどこで持っているか。1 本の企画にどのくらいかかり、どこに時間がかかるか。商品・画像を選ぶとき何を見ているか。', 'Where the schedule and progress live. How long one delivery takes to plan, and where the time goes. What people look at when picking products and images.') },
  { key: 'B', tone: 'plan', name: tr('レビューと承認', 'Review and approval'), ask: tr('週のレビューは会議か、資料を回すか。資料づくりにかかる時間。承認はだれが・何で行い、週で締めるか配信ごとか。決まったあとの変更をどう伝えるか。', 'Is the weekly review a meeting or a circulated document? Time spent preparing it. Who approves, by what means, and per week or per delivery. How changes after approval are communicated.') },
  { key: 'C', tone: 'prod', name: tr('制作(どう見せるか)', 'Production (how it looks)'), ask: tr('制作への依頼は何で送るか。制作はどこで仕上げるか。仕上がりは何で確かめるか。配信のしくみに入れるのはだれか。', 'How requests reach production. Where production finishes the work. How the result is checked. Who loads it into the delivery system.') },
  { key: 'D', tone: 'prod', name: tr('変更・例外', 'Changes and exceptions'), ask: tr('在庫切れ・方針や日程の変更で、差し替え・取りやめたことがどのくらいあるか。いつ・どうやって気づいたか。', 'How often items were swapped or deliveries cancelled because of stock-outs or policy/schedule changes. When and how it was noticed.') },
  { key: 'E', tone: 'res', name: tr('結果と振り返り', 'Results and retrospective'), ask: tr('結果の数字をだれが・どこに集めるか。振り返りの会はあるか。学びを次の企画でどう使っているか。', 'Who collects the results, and where. Is there a retrospective? How learnings feed the next plan.') },
  { key: 'G', tone: 'res', name: tr('チーム・国', 'Teams and countries'), ask: tr('US と JP で、進め方・資料は違うか。', 'Do US and JP work differently or use different documents?') },
  { key: 'P', tone: 'other', name: tr('前提の決まり(承認・制作)', 'Assumed rules (approval, production)'), ask: tr('決まりを読み上げて、今の進め方と同じか、違えばどう違うかを聞く。', 'Read each rule aloud and ask whether it matches how things work today, and if not, how it differs.') },
]

const T = () => tr('時間', 'Time')
const Q = () => tr('質', 'Quality')
const X = () => tr('事故', 'Errors')
const L = () => tr('記録', 'Records')
const N = () => tr('新規', 'New')

export const processRows = (): ProcessRow[] => {
  const row = (id: string, name: string, ccp: string, gains: string[], fids: string): ProcessRow => ({ id, stage: id[0], name, ccp, gains, fids })
  return [
    row('A1', tr('月・週の配信の予定を立てる', 'Plan the monthly and weekly schedule'), tr('計画の面のカレンダー 1 つに、国・チャネル・種類・担当で絞って見る。状態の色で進み具合が分かる', 'One Plan calendar, filtered by country, channel, type and owner. Status colours show progress'), [T(), L()], 'F01〜F04, F68, F97, F101, F105'),
    row('A2', tr('配信の素案を作る', 'Draft a delivery'), tr('「すべてAIで下書き」で、テーマから制作指示まで一度に下書き。週の枠(配信名・種類)を人が決め、まとめて AI で中身を作る', '"Draft all with AI" drafts everything from theme to production notes at once. People set the weekly slots (name, type) and AI fills them in bulk'), [T()], 'F14〜F16, F76'),
    row('A3', tr('テーマを決める', 'Choose the theme'), tr('AI のテーマの 3 案と理由から選ぶ。ほかの配信と重ならない案にする', 'Pick from three AI theme ideas with reasons, avoiding overlap with other deliveries'), [T(), Q()], 'F18〜F20'),
    row('A4', tr('メールの構成を決める', 'Decide the email layout'), tr('テンプレート(標準 10 種と、チームで作ったもの)から選ぶ', 'Pick a template (10 standard ones plus team-made ones)'), [T(), Q()], 'F21〜F28'),
    row('A5', tr('メイン画像を選ぶ', 'Choose the main image'), tr('AI の選定と理由・次点の候補。全景を見て選び直せる', 'AI pick with reasons and runners-up. View the whole image and re-pick'), [T(), Q()], 'F30, F31, F57'),
    row('A6', tr('ヘッドライン・コピーを書く', 'Write headline and copy'), tr('切り口つきの 3 案から選んで直す。文言は配信の国の言語で出る', 'Pick and edit from three angled ideas, written in the delivery country’s language'), [T()], 'F33〜F36'),
    row('A7', tr('商品を選ぶ', 'Choose products'), tr('AI の選定(在庫・売上・評価・季節・天候・方針)と理由。商品情報のペインで、売上・在庫の推移と方針をその場で見る', 'AI pick (stock, sales, ratings, season, weather, policy) with reasons. The product pane shows sales, stock trends and policy in place'), [T(), Q(), X()], 'F39〜F47'),
    row('A8', tr('見た目を確かめる', 'Check how it looks'), tr('作りながら、メール・アプリのプレビューで見る。プレビューの上で直せる', 'See email and app previews while building, and edit on the preview'), [Q(), N()], 'F38, F52〜F58'),
    row('A9', tr('AI の案を言葉で直す', 'Refine AI ideas in words'), tr('工程ごとの AI チャットで「この商品を必ず入れて」などと頼む', 'Ask per-step AI chat things like "always include this product"'), [N()], 'F48〜F50'),
    row('B1', tr('週の計画をレビューする', 'Review the weekly plan'), tr('週の表示で 1 週間を縮小プレビューつきで見る。資料が要るときは PDF で書き出す', 'The week view shows the week with thumbnails. Export a PDF when a document is needed'), [T()], 'F68, F74'),
    row('B2', tr('商品の偏り・漏れを確かめる', 'Check product bias and gaps'), tr('「確定の前に直すこと」が、同じ商品の回数・主力の漏れ・テーマや画像の連続・未対応のコメントを数え、何をするかを出す', '"Fix before locking" counts repeated products, missing key items, repeated themes or images and open comments, and says what to do'), [T(), X()], 'F71, F100'),
    row('B3', tr('意見を出し、直してもらう', 'Give feedback and get fixes'), tr('配信ごと・商品ごとのコメントをスレッドで残し、「対応済み」にする', 'Threaded comments per delivery and product, marked "resolved"'), [L()], 'F72'),
    row('B4', tr('承認する', 'Approve'), tr('配信カードごとに承認を依頼し、承認グループのだれかが承認・差し戻し(理由つき)。履歴が残る', 'Request approval per delivery card; someone in the approval group approves or sends back (with a reason). History is kept'), [L(), T()], 'F73'),
    row('B5', tr('確定した後の変更', 'Changes after locking'), tr('確定した週の配信を変えるには理由が要り、承認待ちに戻る', 'Changing a delivery in a locked week needs a reason and returns it to awaiting approval'), [L(), X()], 'F70'),
    row('C1', tr('制作に頼む', 'Request production'), tr('承認された配信の写しを、制作のページで依頼する(制作指示・担当・締め切り)', 'Request a copy of the approved delivery on the production page (notes, owner, deadline)'), [T(), L()], 'F64, F111'),
    row('C2', tr('制作に必要な情報を集める', 'Gather what production needs'), tr('制作のページで、文言・画像・商品・リンク先を項目ごとにコピーする。商品情報も見られる', 'Copy text, images, products and links item by item on the production page. Product info is visible too'), [T()], 'F45, F65, F111'),
    row('C3', tr('制作中の質問・調整', 'Questions and adjustments during production'), tr('配信ごとのやり取り(リアクションつき)と、やり取りから作るタスク。直した内容は「企画から変更」の印と元の値で残る', 'Per-delivery threads (with reactions) and tasks made from them. Edits keep a "changed from plan" mark and the original value'), [L(), T()], 'F67, F98, F111'),
    row('C4', tr('仕上がりを確かめる', 'Check the finished work'), tr('制作のページで、できたもののリンクを見て「これで OK / 直してほしい」', 'Open the result link on the production page and choose "OK" or "Please fix"'), [L()], 'F111'),
    row('C5', tr('配信のしくみに入れる', 'Load into the delivery system'), tr('当面は変わらない(「配信のしくみに送る」は窓口だけで、まだ送らない)', 'Unchanged for now ("Send to delivery system" is only an endpoint and does not send yet)'), [], 'F111'),
    row('D1', tr('在庫切れに気づく', 'Notice stock-outs'), tr('配信日の在庫を見込んで、在庫切れ・僅少のアラートを出す。差し替えの案もある', 'Projects stock on the delivery date and alerts on stock-outs or low stock, with replacement ideas'), [X()], 'F88, F90, F91, F94, F104'),
    row('D2', tr('方針・日程の変更に気づく', 'Notice policy or schedule changes'), tr('変更の前と後をアラートで出し、影響する配信を挙げる', 'Alerts show before and after, listing affected deliveries'), [X()], 'F89, F90'),
    row('D3', tr('差し替え・延期・取りやめ', 'Swap, postpone or cancel'), tr('配信ごとに対応し、理由を残してレビューに戻す。取りやめた配信は消さずに薄く残す', 'Handle per delivery, keep the reason, and return it to review. Cancelled deliveries stay, greyed out'), [L()], 'F91, F92, F95'),
    row('E1', tr('結果を集める', 'Collect results'), tr('結果を CSV で取り込み、計画と同じカレンダーの裏(結果の面)で見る', 'Import results by CSV and view them on the back of the same calendar (Results)'), [T()], 'F77〜F79, F87'),
    row('E2', tr('結果を比べる', 'Compare results'), tr('テーマの種類・テンプレート・商品ごとにまとめる。過去の配信と比べる。リンクごとのクリックをプレビューに重ねる', 'Group by theme type, template and product. Compare with past deliveries. Overlay link clicks on the preview'), [T(), N()], 'F80〜F83'),
    row('E3', tr('学びを次に生かす', 'Carry learnings forward'), tr('「次に生かすメモ」と週の振り返りのメモを、次の配信カードと AI の案に渡す', 'Pass "notes for next time" and weekly retro notes to the next delivery card and AI ideas'), [Q(), N()], 'F84, F85, F103'),
    row('G1', tr('US と JP で分けて動く', 'Work separately for US and JP'), tr('同じ画面で、国を選んで見る。画面の言語(日本語 / English)は人ごと', 'Same screens, filtered by country. UI language (Japanese / English) is per person'), [T(), L()], 'F05, F32, F105'),
    row('G2', tr('画面を人に見せる', 'Show a screen to someone'), tr('「リンクをコピー」で、相手も同じ画面(同じ配信カード・同じタブ)で開く', '"Copy link" opens the same screen (same card, same tab) for the other person'), [T()], 'F106'),
    // 7 章の「機能ごとに前提にしていること」。業務の流れの中の決まりなので、照らし合わせる行に入れる
    row('P1', tr('ログインしている人', 'Signed-in person'), tr('右上の「あなた」で選んだ人を、ログインしている人とみなす(本物のログインが入るまでの形)', 'The person chosen under "You" (top right) is treated as signed in (until real sign-in arrives)'), [], ''),
    row('P2', tr('承認の依頼の単位と相手', 'Approval request unit and recipients'), tr('配信カードごとに依頼する。相手は承認グループ(だれか 1 人が承認すれば済み)か、人', 'Request per delivery card, to an approval group (any one member suffices) or a person'), [], 'F73'),
    row('P3', tr('承認の決まり', 'Approval rule'), tr('全員(指名したそれぞれから 1 人ずつ)/ 1 人(だれか 1 人)。すべての配信に同じ 1 つ', 'Everyone (one from each named) / Any one. One rule for all deliveries'), [], 'F73'),
    row('P4', tr('自分の依頼を自分で承認', 'Approving your own request'), tr('先に進めたいときは、自分で依頼した配信を自分で承認してよい', 'To move on, you may approve a delivery you requested yourself'), [], 'F73'),
    row('P5', tr('差し戻し', 'Sending back'), tr('1 人でも差し戻したら、その依頼は止まる。理由を書く(やり取りにも残る)', 'One send-back stops the request. A reason is required (also kept in the thread)'), [], 'F73'),
    row('P6', tr('承認のあとの内容の変更', 'Changes after approval'), tr('承認済みの配信の中身を変えて保存すると、承認待ちに戻り、依頼し直す', 'Saving changes to an approved delivery returns it to awaiting approval; request again'), [], 'F70'),
    row('P7', tr('週の確定', 'Locking the week'), tr('週の配信がそろったら、週ごとに確定する。確定した週の配信を変えるには、理由が要る', 'Lock each week once its deliveries are ready. Changing a locked week needs a reason'), [], 'F69, F70'),
    row('P8', tr('制作に依頼する時期', 'When to request production'), tr('承認されたあとにだけ依頼する。承認の前に制作に相談したいときは、配信カードのやり取りで宛先に制作の人を入れる', 'Only after approval. To consult production earlier, add them to the delivery card thread'), [], 'F111'),
    row('P9', tr('制作の写し', 'Production copy'), tr('制作のページの中身は、依頼した時点の配信カードの写し。そのあと配信カードを変えても、黙って変わらない(知らせて、新しい版を作る)', 'The production page is a copy of the card at request time. Later card edits do not silently change it (you are told, and a new version is made)'), [], 'F111'),
    row('P10', tr('依頼のあとの調整', 'Adjustments after the request'), tr('承認のあとの文言・画像・商品・リンク先の調整は、企画と制作のあいだで決めてよい(承認のやり直しは要らない)。配信カードには戻さない', 'Planning and production may agree text, image, product and link tweaks after approval (no re-approval). They are not written back to the card'), [], 'F111'),
    row('P11', tr('制作の工程', 'Production steps'), tr('① 制作に依頼する(企画)→ ② 受け取る(制作)→ ③ 制作する(制作)→ ④ 仕上がりの確認(企画)→ ⑤ 配信のしくみに送る(企画)', '1 Request (planning) → 2 Receive (production) → 3 Produce (production) → 4 Check (planning) → 5 Send to delivery system (planning)'), [], 'F111'),
    row('P12', tr('制作の人ができること', 'What production can do'), tr('読む・コピー・要素を直す・やり取り・タスク・「受け取った」・「制作が終わった」(できたもののリンクとひとことを添えられる)', 'Read, copy, edit elements, threads, tasks, "Received", "Done" (with a result link and a note)'), [], 'F111'),
    row('P13', tr('制作を通さない配信', 'Deliveries without production'), tr('制作のページから、HTML・テキスト・リンク先を、配信のしくみに直接送る(いまは窓口だけ)', 'Send HTML, text and links straight to the delivery system from the production page (endpoint only for now)'), [], 'F111'),
  ]
}

export const reviewRows = (): ReviewRow[] => {
  const r = (id: string, name: string, why: string, ask: string, ifno: string): ReviewRow => ({ id, name, why, ask, ifno })
  return [
    r('R1', tr('週の確定と、配信ごとの承認と、配信の状態', 'Week lock, per-delivery approval and delivery status'), tr('「承認済み」と「確定」の 2 段がある。配信ごとに承認するなら、週の確定は重いかもしれない', 'There are two steps, "approved" and "locked". With per-delivery approval, locking the week may be too heavy'), tr('週で区切って締める場面が、今の運用にあるか', 'Is there a moment today when the week is closed off?'), tr('週の確定をやめ、配信ごとの承認だけにする', 'Drop week locking; keep only per-delivery approval')),
    r('R2', tr('制作への「引き継ぎ」のタブ(F66)', 'The "handoff" tab (F66)'), tr('制作のページの「制作に依頼する」(F111)と役目が重なる。担当・締め切りを 2 か所で持つ', 'Overlaps with "Request production" (F111). Owner and deadline live in two places'), tr('制作の依頼を使い始めたあと、引き継ぎのタブを使う人がいるか', 'Once production requests are in use, does anyone still use the handoff tab?'), tr('引き継ぎのタブを外し、制作の依頼にまとめる', 'Remove the handoff tab and fold it into production requests')),
    r('R3', tr('下書きの入口が 3 つ(F14・F15・F76)', 'Three ways to draft (F14, F15, F76)'), tr('入口が多いと、どれを使うか迷う', 'Too many entry points cause hesitation'), tr('どの入口が使われているか', 'Which entry points are used?'), tr('使われない入口を外す', 'Remove unused ones')),
    r('R4', tr('週の資料の PDF(F74)', 'Weekly PDF (F74)'), tr('画面の中でレビューするなら、資料は要らない', 'Not needed if review happens on screen'), tr('画面を開けない人(役員・他部署)に見せる場面があるか', 'Is it shown to people who cannot open the app (executives, other departments)?'), tr('外す', 'Remove')),
    r('R5', tr('詳しい結果の PDF(F86)', 'Detailed results PDF (F86)'), tr('結果の共有を、リンクで済ませられるかもしれない', 'Sharing a link may be enough'), tr('結果を社外・画面を開けない人に渡すか', 'Are results given to outsiders or people without access?'), tr('外す', 'Remove')),
    r('R6', tr('制作の工程の「受け取った」', 'The "Received" production step'), tr('依頼 → 制作 → 確認の間に 1 段増える', 'Adds a step between request, production and check'), tr('制作が受け取ったかどうかを、企画が気にするか', 'Does planning care whether production has received it?'), tr('依頼したら「制作している」にする', 'Go straight to "In production" on request')),
    r('R7', tr('制作のページの HTML のエディタ', 'HTML editor on the production page'), tr('制作が別の道具で作るなら、使われない', 'Unused if production builds elsewhere'), tr('制作が、どこで仕上げているか', 'Where does production finish the work?'), tr('HTML の書き出しだけにする', 'Keep only HTML export')),
    r('R8', tr('制作を通さずに、配信のしくみに送る', 'Sending to the delivery system without production'), tr('制作を通さない配信がないなら、要らない', 'Not needed if every delivery goes through production'), tr('制作を通さない配信(アプリの通知だけ、など)があるか', 'Are there deliveries without production (e.g. app push only)?'), tr('外す', 'Remove')),
    r('R9', tr('利用者が作るテンプレート(F25, F26)', 'User-made templates (F25, F26)'), tr('標準の 10 種で足りるなら、管理の手間だけが残る', 'If the 10 standard ones suffice, only the upkeep remains'), tr('自分で作ったテンプレートが使われているか', 'Are self-made templates used?'), tr('作る機能を管理者だけにする', 'Limit creation to admins')),
    r('R10', tr('テーマの種類の AI での分け(F83, F110)', 'AI sorting of theme types (F83, F110)'), tr('企画のときに種類を選ぶなら、後から分けなくてよい', 'Not needed if the type is chosen while planning'), tr('種類を、企画のときに選んでいるか', 'Is the type chosen while planning?'), tr('AI での分けを外す', 'Remove AI sorting')),
    r('R11', tr('結果の「まとめて見る」と「比べる」(F80, F82)', 'Results "summary" and "compare" (F80, F82)'), tr('どちらも過去の配信と比べるもので、重なる', 'Both compare with past deliveries and overlap'), tr('どちらを使っているか', 'Which one is used?'), tr('1 つにまとめる', 'Merge into one')),
    r('R12', tr('配信の対象(性別・年代。F109)', 'Delivery audience (gender, age; F109)'), tr('対象を配信のしくみ側で決めているなら、CCP では要らない', 'Not needed in CCP if the delivery system decides the audience'), tr('対象を、企画のときに決めているか', 'Is the audience decided while planning?'), tr('外す(AI の前提からも外す)', 'Remove (also from AI context)')),
    r('R13', tr('自分で依頼した配信を、自分で承認する', 'Approving your own request'), tr('承認の意味が薄れる', 'Weakens the meaning of approval'), tr('承認を、別の人が行う決まりがあるか', 'Is there a rule that someone else must approve?'), tr('自分では承認できないようにする', 'Block self-approval')),
  ]
}

export const metricRows = (): MetricRow[] => [
  { id: 'M1', name: tr('1 本の配信の企画にかかる時間', 'Time to plan one delivery'), rows: 'A2〜A7' },
  { id: 'M2', name: tr('週のレビューにかかる時間・会議の回数', 'Time and meetings for the weekly review'), rows: 'B1〜B3' },
  { id: 'M3', name: tr('差し戻し・直しの回数', 'Number of send-backs and fixes'), rows: 'B4, B5' },
  { id: 'M4', name: tr('制作とのやり取りのうち、CCP の外で行ったもの', 'Production exchanges that happened outside CCP'), rows: 'C1〜C4' },
  { id: 'M5', name: tr('締め切りに遅れた制作の数', 'Production jobs that missed the deadline'), rows: 'C1〜C4' },
  { id: 'M6', name: tr('配信のあとで気づいた在庫切れ・方針違反の数', 'Stock-outs or policy breaches found after delivery'), rows: 'D1, D2' },
  { id: 'M7', name: tr('次に生かすメモが、次の配信で使われた数', 'Notes for next time used in the next delivery'), rows: 'E3' },
]
