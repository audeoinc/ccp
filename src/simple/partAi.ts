import { askAgent, heroPayload, productPayload, type AiCard } from '../aiSelect'
import { tr } from '../i18n'
import type { HeroImage } from '../models/heroImages'
import type { Product } from '../models/products'
import type { ReplacementCandidate } from '../alertActions'

/** AI の案の 1 つ。value は、文言なら新しい文言、メイン画像・商品なら id */
export interface PartIdea {
  value: string
  why: string
}

/** 部品の AI のやり取りの 1 回分(開いている間だけ持つ。チャットの保存はバックログ) */
export interface PartTurn {
  role: 'user' | 'ai'
  text: string
  ideas?: PartIdea[]
}

export interface PartAnswer {
  reply: string
  ideas: PartIdea[]
  answered: boolean
}

// メイン画像・商品の候補として渡す数の上限(依頼を大きくしすぎない)
const MAX_HEROES = 60
const MAX_PRODUCTS = 80

const COMMON = `入力の request が最新の依頼、chat がこれまでのやり取り(古い順)、card が配信(テーマ theme・切り口 angle・名前・国・チャネル)。
依頼が質問・相談(「どう思う?」など)で、直しを求めていないときは {"mode":"answer","reply":"答え(3 文以内)"} だけを返す。
`

const TEXT_PROMPT = `あなたは、メールマガジン・アプリの通知の文言を直す手伝いをする。担当者は、配信の 1 つの部品(件名・見出し・コピーなど)を選び、「もっと短く」のように頼む。
入力の part が直す部品(kind・label・current = いまの文言)、context がほかの部品のいまの文言。assets があれば、配信の参考の素材(name・kind = file / url・note = 説明・url)。
${COMMON}
次の JSON だけを返す:
{"mode":"update","reply":"依頼にどう応えたかを 1 文で","ideas":[{"text":"新しい文言","why":"そう直した理由を 1 文で"}]}

決まり:
1. ideas は count の数(count がなければ 3 つ)。2 つ以上のときは、それぞれ違う方向にする(同じ言い回しを並べない)。count が 1 なら、依頼にいちばん合う 1 つだけ。
2. 文言は、配信の国に合わせる(US は英語、JP は日本語)。テーマと切り口から外れない。価格・割引率・期限など、入力にない事実を作らない。
3. 長さの目安: 件名は 40 文字(英語は 50 字)まで、見出し・通知のタイトルは短く、コピー・プリヘッダー・通知の本文は 2 文まで。制作指示(kind が instructions)は、制作の人に向けた箇条書きで 10 行まで(画像・見せ方・強調する所)。依頼が長さを決めていれば、それに従う。
4. 制作指示で assets があれば、合う素材を名前で挙げてよい(例「メイン画像は素材『秋の参考写真』の雰囲気で」。名前は assets の name をそのまま「素材『…』」の形で)。素材の中身は見ていないので、name と note から言える以上のことを書かない。

入力:
`

const HERO_PROMPT = `あなたは、メールマガジンのメイン画像を選ぶ手伝いをする。担当者は、いまのメイン画像(current)を見て「もっと明るい写真に」のように頼む。
入力の heroes が選べる画像(code・name・purpose・season・tags・description)、products が配信に載せている商品の名前。
${COMMON}
次の JSON だけを返す:
{"mode":"update","reply":"依頼にどう応えたかを 1 文で","ideas":[{"code":"heroes の code","why":"この画像を選んだ理由を 1 文で"}]}

決まり:
1. ideas は 3 つまで。code は必ず heroes の中から選ぶ。current と同じ画像は選ばない。
2. 依頼に合うものを、テーマと季節に合うものから優先する。合うものがなければ、近いものを選び、why にそう書く。

入力:
`

const PRODUCT_PROMPT = `あなたは、メールマガジンに載せる商品を選ぶ手伝いをする。担当者は、1 つの枠(current = いまの商品。空の枠なら null)を見て「在庫の多いものに」のように頼む。
入力の products が選べる商品(code・name・category・price・stock・season・salesTrend・rating・description・md)、in_card がこの配信に載せている商品の名前。
why があれば、いまの商品を差し替える理由(例: 在庫が持たない見込み・週の上限を超えた)。products に weeksLeft(配信日に在庫が何週分残るか)・thisWeek・lastWeek(今週・前週に配信に載せた回数)があれば、在庫の見込みを確かめた候補。
${COMMON}
次の JSON だけを返す:
{"mode":"update","reply":"依頼にどう応えたかを 1 文で","ideas":[{"code":"products の code","why":"この商品を選んだ理由を 1 文で(在庫・価格など、数字の根拠があれば添える)"}]}

決まり:
1. ideas は 3 つまで。code は必ず products の中から選ぶ。in_card の商品は選ばない。ふさわしい順に並べる。
2. 依頼に合うものを、テーマと季節に合い、在庫のある商品から優先する。current があれば、その役割(価格帯・見せ方)に近いものを選ぶ。
3. weeksLeft があれば、余裕のあるものを選び、thisWeek・lastWeek の多い商品は、なるべく避ける。why の理由を、選んだ商品で繰り返さない(在庫が理由なら、在庫に余裕のあるものを)。

入力:
`

const historyOf = (h: PartTurn[], label: (v: string) => string) =>
  h.slice(-10).map((x) => ({ role: x.role, text: x.ideas?.length ? `${x.text}\n${x.ideas.map((i) => `- ${label(i.value)}`).join('\n')}` : x.text }))

const readIdeas = (out: Record<string, unknown>, key: 'text' | 'code') =>
  (Array.isArray(out.ideas) ? (out.ideas as Record<string, unknown>[]) : []).map((x) => ({
    value: typeof x?.[key] === 'string' ? (x[key] as string).trim() : '',
    why: typeof x?.why === 'string' ? x.why.trim() : '',
  }))

function finish(out: Record<string, unknown>, ideas: PartIdea[], max = 3): PartAnswer {
  const reply = typeof out.reply === 'string' ? out.reply.trim() : ''
  if (out.mode === 'answer') return { reply, ideas: [], answered: true }
  if (ideas.length === 0 && !reply) throw new Error(tr('AI の案を読み取れませんでした。もう一度試してください', 'Could not read the AI suggestions. Please try again'))
  return { reply, ideas: ideas.slice(0, max), answered: false }
}

/** 選んだ部品の文言を、頼んだとおりに直した案をもらう */
export async function askPartRewrite(args: {
  card: AiCard
  angle: string
  part: { kind: string; label: string; current: string }
  context: Record<string, string>
  /** 配信の参考の素材(制作指示で名前を挙げられるように。画像の中身は渡さない: 費用と時間が増えるため。X74) */
  assets?: { name: string; kind?: string; note?: string; url?: string }[]
  request: string
  history: PartTurn[]
  /** ほしい案の数(省くと 3) */
  count?: number
}): Promise<PartAnswer> {
  const out = await askAgent(TEXT_PROMPT, {
    task: 'suggest_part_rewrite',
    card: { ...args.card, angle: args.angle },
    part: args.part,
    context: args.context,
    ...(args.assets?.length ? { assets: args.assets } : {}),
    request: args.request,
    ...(args.count ? { count: args.count } : {}),
    chat: historyOf(args.history, (v) => v),
  })
  return finish(out, readIdeas(out, 'text').filter((x) => x.value && x.value !== args.part.current), args.count ?? 3)
}

/** メイン画像を、頼んだとおりに選び直した案をもらう(案の value は画像の id) */
export async function askHeroPick(args: { card: AiCard; angle: string; current?: HeroImage; heroes: HeroImage[]; productNames: string[]; request: string; history: PartTurn[] }): Promise<PartAnswer> {
  const pool = args.heroes.filter((h) => h.id !== args.current?.id).slice(0, MAX_HEROES)
  const byCode = new Map(pool.map((h) => [h.image_code, h.id]))
  const nameOf = (id: string) => args.heroes.find((h) => h.id === id)?.name ?? id
  const out = await askAgent(HERO_PROMPT, {
    task: 'suggest_part_hero',
    card: { ...args.card, angle: args.angle },
    current: heroPayload(args.current),
    heroes: pool.map((h) => heroPayload(h)),
    products: args.productNames,
    request: args.request,
    chat: historyOf(args.history, nameOf),
  })
  // AI が作った code は信じず、候補にあるものだけを使う
  const ideas = readIdeas(out, 'code').flatMap((x) => {
    const id = byCode.get(x.value)
    return id ? [{ value: id, why: x.why }] : []
  })
  return finish(out, ideas)
}

/** AI が使えないときの候補: 在庫の見込みを確かめた候補のうち、訴求(今週・前週に載せた回数)が少なく、在庫に余裕のある順に 3 つ */
const byRule = (candidates: ReplacementCandidate[]): PartIdea[] =>
  [...candidates]
    .sort((a, b) => a.thisWeek + a.lastWeek - (b.thisWeek + b.lastWeek) || (b.weeksLeft ?? 0) - (a.weeksLeft ?? 0))
    .slice(0, 3)
    .map((c) => ({ value: c.product.id, why: '' }))

/**
 * 枠の商品を選び直す案をもらう(案の value は商品の id)。商品の差し替えで AI に聞くのは、すべてここ 1 つ
 * (2026-10-24 の整理。以前はアラートからの差し替えに別の聞き方 suggestReplacements があった)。
 * why = 差し替える理由(アラートなど)、request = 担当者の頼みごと(「AI に頼む」)。どちらか、または両方。
 * candidates を渡すと、その中(在庫の見込みを確かめた、同じカテゴリの商品。alertActions の replacementCandidates)からだけ選び、
 * AI が使えないときも、決まった並べ方で 3 つ返す
 */
export async function askProductPick(args: {
  card: AiCard
  angle: string
  current?: Product
  products: Product[]
  inCard: Product[]
  request: string
  history: PartTurn[]
  why?: string
  candidates?: ReplacementCandidate[]
}): Promise<PartAnswer> {
  const inCard = new Set(args.inCard.map((p) => p.id))
  const facts = new Map((args.candidates ?? []).map((c) => [c.product.id, c]))
  const pool = (args.candidates ? args.candidates.map((c) => c.product) : args.products).filter((p) => !inCard.has(p.id) && (p.stock ?? 1) > 0).slice(0, MAX_PRODUCTS)
  if (args.candidates && pool.length === 0) return { reply: tr('条件に合う商品がありません', 'No products match'), ideas: [], answered: false }
  const byCode = new Map(pool.map((p) => [p.product_code, p.id]))
  const nameOf = (id: string) => args.products.find((p) => p.id === id)?.name ?? id
  const payload = (p: Product) => {
    const c = facts.get(p.id)
    return c ? { ...productPayload(p), weeksLeft: c.weeksLeft === undefined ? null : Math.round(c.weeksLeft * 10) / 10, thisWeek: c.thisWeek, lastWeek: c.lastWeek } : productPayload(p)
  }
  try {
    const out = await askAgent(PRODUCT_PROMPT, {
      task: 'suggest_part_product',
      card: { ...args.card, angle: args.angle },
      current: args.current ? productPayload(args.current) : null,
      ...(args.why ? { why: args.why } : {}),
      products: pool.map(payload),
      in_card: args.inCard.map((p) => p.name),
      request: args.request,
      chat: historyOf(args.history, nameOf),
    })
    const ideas = readIdeas(out, 'code').flatMap((x) => {
      const id = byCode.get(x.value)
      return id ? [{ value: id, why: x.why }] : []
    })
    if (args.candidates && ideas.length === 0 && out.mode !== 'answer') return { reply: '', ideas: byRule(args.candidates), answered: false }
    return finish(out, ideas)
  } catch (e) {
    if (args.candidates) return { reply: '', ideas: byRule(args.candidates), answered: false }
    throw e
  }
}

/** 配信の全体への依頼で、まとめて変える文言(変えないものは入れない) */
export interface WholeTexts {
  subject?: string
  preheader?: string
  headline?: string
  copy?: string
  pushTitle?: string
  pushBody?: string
  sectionTitles?: string[]
  sectionCopies?: string[]
}
/** 全体への依頼の案 1 つ分(案の value は、これを JSON にしたもの) */
export interface WholeChange {
  title: string
  texts: WholeTexts
  heroId?: string
}

const WHOLE_PROMPT = `あなたは、メールマガジン・アプリの通知の配信を、まとめて直す手伝いをする。担当者は、配信の全体を見て「もっとカジュアルに」のように頼む。
入力の current がいまの文言(subject・preheader・headline・copy・push_title・push_body・section_titles・section_copies。チャネルに使わないものは空)、hero がいまのメイン画像、heroes が選べるメイン画像。
${COMMON}
次の JSON だけを返す:
{"mode":"update","reply":"依頼にどう応えたかを 1 文で","ideas":[{"title":"案の名前(10 文字くらい)","why":"この案の考え方を 1 文で","changes":{"subject":"…","headline":"…","copy":"…","section_titles":["…"],"section_copies":["…"],"hero_code":"heroes の code"}}]}

決まり:
1. ideas は 2〜3 つ。それぞれ違う方向にする。
2. changes には、変えるものだけを入れる(変えないものは書かない)。section_titles・section_copies は、変えるときはセクションの数だけ全部書く。いまが空の文言(チャネルで使わないもの)は作らない。
3. 文言は、配信の国に合わせる(US は英語、JP は日本語)。テーマから外れない。価格・割引率・期限など、入力にない事実を作らない。
4. メイン画像は、依頼が画像の雰囲気にかかわるときだけ変える。hero_code は必ず heroes の中から選ぶ。商品は変えない(商品は枠ごとに頼む)。

入力:
`

/** 配信の全体を、頼んだとおりに直した案をもらう(文言と、必要ならメイン画像) */
export async function askWholeRewrite(args: { card: AiCard; angle: string; channel: 'email' | 'push'; current: WholeTexts; hero?: HeroImage; heroes: HeroImage[]; request: string; history: PartTurn[] }): Promise<PartAnswer> {
  const pool = args.heroes.filter((h) => h.id !== args.hero?.id).slice(0, MAX_HEROES)
  const byCode = new Map(pool.map((h) => [h.image_code, h.id]))
  const c = args.current
  const out = await askAgent(WHOLE_PROMPT, {
    task: 'suggest_whole_rewrite',
    channel: args.channel,
    card: { ...args.card, angle: args.angle },
    current: { subject: c.subject ?? '', preheader: c.preheader ?? '', headline: c.headline ?? '', copy: c.copy ?? '', push_title: c.pushTitle ?? '', push_body: c.pushBody ?? '', section_titles: c.sectionTitles ?? [], section_copies: c.sectionCopies ?? [] },
    hero: heroPayload(args.hero),
    heroes: pool.map((h) => heroPayload(h)),
    request: args.request,
    chat: historyOf(args.history, (v) => {
      try {
        return (JSON.parse(v) as WholeChange).title
      } catch {
        return v
      }
    }),
  })
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const arr = (v: unknown, n: number) => (Array.isArray(v) && v.length > 0 ? Array.from({ length: Math.max(n, v.length) }, (_, i) => String(v[i] ?? '')) : undefined)
  const ideas: PartIdea[] = []
  for (const x of Array.isArray(out.ideas) ? (out.ideas as Record<string, unknown>[]) : []) {
    const ch = (x?.changes ?? {}) as Record<string, unknown>
    const texts: WholeTexts = {}
    // 件名・プリヘッダーはメールだけ、通知の文はアプリだけ
    if (args.channel === 'email') {
      if (str(ch.subject)) texts.subject = str(ch.subject)
      if (str(ch.preheader)) texts.preheader = str(ch.preheader)
    }
    if (str(ch.headline)) texts.headline = str(ch.headline)
    if (str(ch.copy)) texts.copy = str(ch.copy)
    if (args.channel === 'push' && str(ch.push_title)) texts.pushTitle = str(ch.push_title)
    if (args.channel === 'push' && str(ch.push_body)) texts.pushBody = str(ch.push_body)
    const st = arr(ch.section_titles, c.sectionTitles?.length ?? 0)
    const sc = arr(ch.section_copies, c.sectionCopies?.length ?? 0)
    if (st) texts.sectionTitles = st
    if (sc) texts.sectionCopies = sc
    const heroId = typeof ch.hero_code === 'string' ? byCode.get(ch.hero_code) : undefined
    if (Object.keys(texts).length === 0 && !heroId) continue
    const change: WholeChange = { title: str(x?.title) ?? tr(`案 ${ideas.length + 1}`, `Idea ${ideas.length + 1}`), texts, ...(heroId ? { heroId } : {}) }
    ideas.push({ value: JSON.stringify(change), why: str(x?.why) ?? '' })
  }
  return finish(out, ideas)
}

/** 全体への依頼の案を読む(壊れていれば null) */
export function readWhole(v: string): WholeChange | null {
  try {
    return JSON.parse(v) as WholeChange
  } catch {
    return null
  }
}

/** 部品の種類ごとの、指示の例(札で出す。押すとそのまま頼む) */
export function requestSamples(kind: string): string[] {
  switch (kind) {
    case 'subject':
      return [tr('開封したくなるように', 'Make it more clickable'), tr('もっと短く', 'Shorter'), tr('季節感を強く', 'More seasonal'), tr('問いかけの形に', 'As a question')]
    case 'headline':
    case 'pushTitle':
    case 'sectionTitle':
      return [tr('もっと短く', 'Shorter'), tr('言い切る形に', 'More assertive'), tr('季節感を強く', 'More seasonal'), tr('別の切り口で', 'A different angle')]
    case 'hero':
      return [tr('もっと明るい写真に', 'A brighter photo'), tr('人物が入ったもの', 'With a person'), tr('商品が大きく写るもの', 'Product front and center'), tr('季節感の強いもの', 'More seasonal')]
    case 'product':
      return [tr('在庫の多いものに', 'More in stock'), tr('価格帯を下げて', 'Lower price'), tr('売れ行きが上がっているもの', 'Trending up'), tr('同じカテゴリで別のもの', 'Same category, different item')]
    case 'instructions':
      return [tr('箇条書きに', 'As bullet points'), tr('画像の指示を足して', 'Add image directions'), tr('もっと具体的に', 'More specific'), tr('短くまとめて', 'Shorter')]
    case 'whole':
      return [tr('もっとカジュアルに', 'More casual'), tr('季節感を強く', 'More seasonal'), tr('高級感を出して', 'More premium'), tr('全体を短く', 'Shorter overall')]
    case 'slot':
      return [tr('この配信に合うもの', 'Fits this delivery'), tr('在庫の多いもの', 'Well stocked'), tr('売れ行きが上がっているもの', 'Trending up'), tr('手ごろな価格のもの', 'Affordable')]
    default:
      return [tr('もっと短く', 'Shorter'), tr('ベネフィットを先に', 'Lead with the benefit'), tr('親しみやすく', 'Friendlier'), tr('行動を促す一文を足して', 'Add a call to action')]
  }
}

/**
 * 文の部品の「指示して直す」の例(札で出す。押すとそのまま頼む)。どの文の部品にも効く、よく使うものを先に並べ、部品ごとのものを 1 つ足す(2026-10-27 利用者)
 */
export function textRequestSamples(kind: string): string[] {
  const common = [tr('短く', 'Shorter'), tr('カジュアルに', 'More casual'), tr('数字を入れる', 'Add a number'), tr('急ぎ感を出す', 'Add urgency')]
  switch (kind) {
    case 'subject':
      return [...common, tr('開封したくなるように', 'More clickable')]
    case 'headline':
    case 'pushTitle':
    case 'sectionTitle':
      return [...common, tr('言い切る形に', 'More assertive')]
    default:
      return [...common, tr('行動を促す一文を足す', 'Add a call to action')]
  }
}
