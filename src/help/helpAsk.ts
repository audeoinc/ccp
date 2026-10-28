// 「？ 聞く」(X82)の、材料の選び方・AI への頼み方・答えの確かめ方。画面は HelpAskFloat.tsx
//
// 材料(文書 + 画面の文言の索引)は、ビルドのときに helpMaterial.ts が作り、ここで初めて読み込む(「？ 聞く」を使わない人には読ませない)。
// 材料は、まるごとは渡さず、質問に近い所だけを渡す(未決 a。2026-10-28 測って決めた):
//   まるごとは 文書 約 18 万字 + 画面の文言 約 34 万字 = 50 万字を超え、/api/ask の上限(40 万字)に入らない。
//   入ったとしても、1 回の質問が 20 万トークン近くになり、答えが返るまで長く、お金もかかる。
//   そこで、文書は見出しと本文が質問の言葉に近い節を 約 2.4 万字まで、画面の文言は近いものを 300 件まで渡す。
//   文書の見出しの一覧(目次)はいつも渡す(どんな機能があるかの全体を、AI が知っているように)
import { askAgent } from '../aiSelect'
import { getLang, tr } from '../i18n'
import { linkSearch, parseLink, type LinkState, type LinkView, type Page } from '../deepLink'

type Material = (typeof import('virtual:help-material'))['default']

let loading: Promise<Material> | null = null
/** 材料を読み込む(初めての 1 回だけ。別のファイルに分かれている) */
export const loadMaterial = () => (loading ??= import('virtual:help-material').then((m) => m.default))

const DOC_BUDGET = 24_000
const LABEL_MAX = 300
// 英語の、意味の薄い言葉(当たりの数えに入れない)
const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'are', 'how', 'do', 'i', 'can', 'what', 'where', 'my', 'it', 'this', 'that', 'with', 'want', 'which'])

/**
 * 質問を、当たりを数える言葉に分ける。英語は単語、日本語は続いた文字を 2 文字ずつ(日本語は単語の区切りがないので、
 * 「承認を依頼」→「承認」「認を」「を依」「依頼」のように重ねて切る。関係のない 2 文字も混ざるが、近い節ほど多く当たる)
 */
export function termsOf(text: string): string[] {
  const out = new Set<string>()
  const lower = text.toLowerCase()
  for (const w of lower.match(/[a-z0-9]{2,}/g) ?? []) if (!STOP.has(w)) out.add(w)
  for (const run of lower.match(/[぀-ヿ㐀-鿿ｦ-ﾟ]+/g) ?? []) {
    // ひらがなだけの 2 文字(「を依」の「を」など、助詞をまたぐもの)は弱いので入れない
    if (run.length === 1) {
      if (/[㐀-鿿]/.test(run)) out.add(run)
      continue
    }
    for (let i = 0; i + 2 <= run.length; i++) {
      const bi = run.slice(i, i + 2)
      if (!/^[぀-ゟ]{2}$/.test(bi)) out.add(bi)
    }
  }
  return [...out]
}

const scoreOf = (text: string, terms: string[]) => {
  const t = text.toLowerCase()
  let n = 0
  for (const w of terms) if (t.includes(w)) n += w.length >= 3 ? 2 : 1
  return n
}

export interface HelpScreen {
  page?: Page
  view?: LinkView
  /** いま開いているフロート(配信カード・制作のページなど) */
  open?: string
}

/** いまの画面(URL から読む。どの画面で聞いたかを AI に添える) */
export function currentScreen(): HelpScreen {
  const l = parseLink(window.location.search)
  const open = l.card ? 'delivery card' : l.production ? 'production page' : l.result ? 'result detail' : l.alerts !== undefined ? 'alerts' : undefined
  return { page: l.page ?? 'calendar', view: l.view, open }
}

/** 質問に近い材料を選ぶ */
export function pickMaterial(m: Material, question: string, history: HelpTurn[], part?: HelpPart) {
  // 前のやり取りの言葉も少し効かせる(「それはどこ?」のような続きの質問に、前の話題の材料を渡すため)
  // 右クリックから始めたときは、押した所の名前と近くのボタンの名前も効かせる(「これは何?」だけでは、当たりの言葉がないため)
  const terms = termsOf([question, ...history.slice(-2).map((h) => h.question), part?.label ?? '', ...(part?.near ?? [])].join(' '))
  const ranked = m.sections
    .map((s, i) => ({ s, i, score: scoreOf(s.title, terms) * 3 + scoreOf(s.text, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
  const docs: { doc: string; title: string; text: string }[] = []
  let used = 0
  for (const { s } of ranked) {
    if (used + s.text.length > DOC_BUDGET && docs.length >= 3) break
    docs.push(s)
    used += s.text.length
  }
  const screenName = (n: number) => (n >= 0 ? m.screens[n]?.join(' / ') : '') ?? ''
  const labels = m.labels
    .map((l) => ({ l, score: scoreOf(`${l[0]} ${l[1]} ${l[3]} ${screenName(l[4])}`, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, LABEL_MAX)
    .map(({ l }) => `${l[0]} | ${l[1]} | ${screenName(l[4])} | ${l[3] || '-'}(${l[2]})`)
  // 目次: 文書と見出しの一覧(同じ題の続きは 1 つに)
  const toc = [...new Set(m.sections.map((s) => `${s.doc}: ${s.title}`))]
  return { docs, labels, toc, stats: { docChars: used, labelCount: labels.length } }
}

export interface HelpTurn {
  question: string
  answer: HelpAnswer
  /** 右クリックの「ここについて聞く」から聞いたときの部品 */
  part?: HelpPart
  /** 記録に渡した日時(「開発に伝える」で、同じ記録をもう一度渡すときに同じ値を使う) */
  at?: string
}

export interface HelpAnswer {
  known: boolean
  reply: string
  steps: string[]
  open: { page: Page | 'alerts'; view?: LinkView } | null
  openLabel: string
  basis: { doc: string; title: string }[]
  files: string[]
}

const PAGES: (Page | 'alerts')[] = ['calendar', 'production', 'results', 'alerts']
const VIEWS: LinkView[] = ['month', 'week', 'list', 'compare', 'products', 'impact', 'learnings']

const PROMPT = `あなたは、配信の企画・制作・結果を扱う業務の画面(CCP)の、使い方の案内係です。利用者の質問に、渡した材料だけを使って答えてください。
【材料】
- docs: 機能の説明の文書(FEATURES = 機能の説明と「未実装・制限」、SOURCE_MAP = 機能とファイル、FEATURE_REASONS = 機能の理由)のうち、質問に近い節。
- toc: 文書の見出しの一覧(どんな機能があるかの全体)。
- labels: 画面に実際に出ている文言の一覧。1 行 =「日本語 | English | 画面の場所 | 部品(ファイル)」。
- screen: 利用者がいま見ている画面。history: これまでのやり取り。
- part: あれば、利用者が画面の部品を右クリックして「ここについて聞く」を選んだ。label = 押した所の名前、near = 近くのボタン・見出しの名前。「これは何?」「ここで何ができる?」は、この部品のことを聞いている。
【決まり】
1. 材料に書いてあることだけで答える。推測で機能・手順を作らない。材料で答えられないときは known を false にし、reply に「分からない」ことと、近い機能があればその名前を書く。できないこと(未実装・制限)は、できないと答える。
2. 手順や答えの中で、ボタン・タブ・欄・メニューの名前を書くときは、labels にある文言だけを、そのとおりに使い、[[ ]] で囲む(例: [[承認を依頼する]])。答えを English で書くときは、labels の English の文言を使う。labels にない名前は書かない(説明の言葉で言い換える)。
3. 文書と labels が食い違うときは、labels(いまの画面)を正とする。
4. open: 答えの画面を開くためのリンク。page は calendar(計画)・production(制作)・results(結果)・alerts(アラート)のどれか。view は month・week・list・compare・products・impact・learnings のどれか(要らなければ書かない)。開く画面がなければ null。openLabel はそのボタンに出す短い名前(例: 週の表示を開く)。
5. basis: 答えの根拠にした docs の節(doc と title をそのまま)。files: 関係するファイル(開発する人向け。docs の SOURCE_MAP にあるものだけ)。
6. steps は 1 つの手順を 1 文で、多くても 7 つ。reply は 1〜2 文の短い答え。
【出力】JSON だけ: {"known": true, "reply": "…", "steps": ["…"], "open": {"page": "calendar", "view": "week"}, "openLabel": "…", "basis": [{"doc": "FEATURES.md", "title": "…"}], "files": ["src/…"]}
`

/** AI の返事を、決まった形に直す(足りない所は空に。知らない画面の名前は開くリンクにしない) */
export function normalizeAnswer(raw: Record<string, unknown>): HelpAnswer {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter(Boolean) : [])
  const o = raw.open as { page?: unknown; view?: unknown } | null | undefined
  const page = PAGES.find((p) => p === o?.page)
  const view = VIEWS.find((v) => v === o?.view)
  const basis = Array.isArray(raw.basis)
    ? (raw.basis as { doc?: unknown; title?: unknown }[]).map((b) => ({ doc: str(b?.doc), title: str(b?.title) })).filter((b) => b.doc || b.title)
    : []
  const known = raw.known !== false
  return {
    known,
    reply: str(raw.reply) || (known ? '' : tr('分かりませんでした。', "I don't know.")),
    steps: list(raw.steps).slice(0, 10),
    open: known && page ? { page, view } : null,
    openLabel: str(raw.openLabel),
    basis,
    files: list(raw.files),
  }
}

/** 答えの中の [[名前]] が、画面の文言の一覧にあるか(ない名前は、作り話かもしれないので、画面で印を付ける) */
export function labelChecker(m: Material) {
  const names = new Set<string>()
  for (const l of m.labels) {
    names.add(l[0].toLowerCase())
    names.add(l[1].toLowerCase())
  }
  return (name: string) => names.has(name.trim().toLowerCase())
}

/**
 * 1 回の質問と答えの記録(X82 の段 ④ の「質問をためる」に渡す形。だれが聞いたかは持たない)。
 * 保存は段 ④ の担当が setHelpRecorder で受け取って行う(ここでは保存しない。受け取る所がなければ何もしない)
 */
export interface HelpRecord {
  question: string
  answer: HelpAnswer
  /** 画面の言葉 */
  lang: 'ja' | 'en'
  /** 聞いたときの画面 */
  screen: HelpScreen
  /** 右クリックの「ここについて聞く」から始めたときの部品(段 ③) */
  part?: { el?: string; label?: string }
  /** 聞いた日時(ISO) */
  at: string
  /** 答えから「開発に伝える」に進んだ(同じ質問の記録を、これを付けてもう一度渡す) */
  tellDev?: boolean
}

/** 右クリックの「ここについて聞く」で押した所(段 ③) */
export interface HelpPart {
  /** 押した点(「開発に伝える」のピンを、同じ所に打つため) */
  x: number
  y: number
  /** 部品の目印(data-el。なければピンの目印と同じ書き方の選び方) */
  el?: string
  /** 人が読める名前(例: 商品の枠・ボタンの文字) */
  label: string
  /** 近くのボタン・見出しの名前(多くても 8 つ) */
  near: string[]
}

const nameOf = (el: Element) => (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)

/** 押した所の部品・近くの名前を集める(右クリックの「ここについて聞く」) */
export function captureHelpPart(x: number, y: number, place: { anchor: string; partLabel: string }): HelpPart {
  const el = document.elementFromPoint(x, y)
  const dataEl = el?.closest('[data-el]')?.getAttribute('data-el') ?? undefined
  // 近くの名前: 押した所を囲む、ほどよい大きさのまとまり(ペイン・フロート・帯)の中のボタン・タブ・見出し
  const box = el?.closest('[role="dialog"], [role="tabpanel"], section, header, aside, nav, main') ?? el?.parentElement?.parentElement ?? null
  const near: string[] = []
  for (const b of box?.querySelectorAll('button, [role="tab"], h1, h2, h3, label') ?? []) {
    const n = nameOf(b)
    if (n && !near.includes(n)) near.push(n)
    if (near.length >= 8) break
  }
  return { x, y, el: dataEl || place.anchor || undefined, label: place.partLabel || (el ? nameOf(el) : ''), near }
}

/** 「開発に伝える」に進んだことを、記録を受け取る所に知らせる */
export function recordTellDev(turn: HelpTurn) {
  const { question, answer, part } = turn
  try {
    // 聞いたときと同じ記録(question と at が同じ)に、tellDev を付けて渡す(保存の側が同じ行を見つけられるように)
    recorder?.({ question, answer, lang: getLang(), screen: currentScreen(), part: part && { el: part.el, label: part.label }, at: turn.at ?? new Date().toISOString(), tellDev: true })
  } catch {
    // 保存の失敗で、開発へのリクエストを書くのを止めない
  }
}

/** 「開発に伝える」の本文の書きかけ(質問と答えを添える。続きは利用者が書く) */
export function tellDevDraft(question: string, answer: HelpAnswer): string {
  const plain = (s: string) => s.replace(/\[\[([^\]]+)\]\]/g, '「$1」')
  const lines = [tr(`「？ 聞く」で聞いたこと: ${question}`, `Asked in "? Ask": ${question}`), tr(`答え: ${plain(answer.reply)}`, `Answer: ${plain(answer.reply)}`)]
  if (answer.steps.length) lines.push(...answer.steps.map((st, i) => `${i + 1}. ${plain(st)}`))
  lines.push('', tr('直してほしいこと: ', 'What I want changed: '))
  return lines.join('\n')
}
let recorder: ((r: HelpRecord) => void) | null = null
/** 質問と答えを受け取る所を決める(段 ④ の保存。null で外す) */
export function setHelpRecorder(fn: ((r: HelpRecord) => void) | null) {
  recorder = fn
}

/** 質問する。材料を選んで askAgent に渡し、答えを決まった形にして返す */
export async function askHelp(question: string, history: HelpTurn[], part?: HelpPart): Promise<{ answer: HelpAnswer; at: string; stats: { docChars: number; labelCount: number; ms: number } }> {
  const m = await loadMaterial()
  const picked = pickMaterial(m, question, history, part)
  const started = performance.now()
  const raw = await askAgent(PROMPT, {
    task: 'help_ask',
    question,
    lang: getLang(),
    screen: currentScreen(),
    ...(part ? { part: { el: part.el, label: part.label, near: part.near } } : {}),
    history: history.slice(-3).map((h) => ({ question: h.question, reply: h.answer.reply, steps: h.answer.steps })),
    toc: picked.toc,
    docs: picked.docs,
    labels: picked.labels,
  })
  const answer = normalizeAnswer(raw)
  const at = new Date().toISOString()
  try {
    recorder?.({ question, answer, lang: getLang(), screen: currentScreen(), part: part && { el: part.el, label: part.label }, at })
  } catch {
    // 保存の失敗で、答えを見せるのを止めない
  }
  return { answer, at, stats: { ...picked.stats, ms: Math.round(performance.now() - started) } }
}

/** 「ここを開く」: いまの画面の状態を保ったまま、答えの画面へ移る(App は「戻る」と同じ道で URL を読み直す) */
export function openAnswer(open: NonNullable<HelpAnswer['open']>) {
  const now = parseLink(window.location.search)
  const next: LinkState = { ...now, page: now.page ?? 'calendar' }
  if (open.page === 'alerts') next.alerts = ''
  else {
    next.page = open.page
    next.view = open.view ?? (open.page === now.page ? now.view : undefined)
  }
  const url = `${window.location.pathname}${linkSearch(next)}${window.location.hash}`
  window.history.pushState(null, '', url)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
