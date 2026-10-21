// 制作のページの AI チャット(制作物の手直し)。AI の呼び出しは askAgent だけを通す。
// AI の返事は 2 種類に分ける: 見た目の直し(HTML の差分)と、要素の直し(文言・リンク先・メイン画像・商品)。
// 要素の直しは、その場で反映せず、左のペインと同じ部品のフロートで人が確かめてから入れる(左のペインの「企画から変更」の印・元に戻すが、そのまま効くように)。
// AI の案は保存しない(採用した HTML・要素だけを、いつもの「保存」で保存する)
import { askAgent } from './aiSelect'
import type { HeroImage } from './models/heroImages'
import type { Product } from './models/products'
import { heroImage, productImage } from './images'
import { getText, linkRows, productRows, setHero, setLink, setProducts, setText, textRows, type Snapshot, type TextField } from './productionSnapshot'
import { tr } from './i18n'

export interface ChatTurnIn {
  role: 'user' | 'assistant'
  text: string
}

/** 要素の直しの案(1 つ = 左のペインの 1 行) */
export type ElementEdit =
  | { kind: 'text'; id: string; field: TextField; label: string; value: string; reason: string }
  | { kind: 'link'; id: string; slotKey: string; label: string; value: string; reason: string }
  | { kind: 'hero'; id: 'hero'; heroId?: string; reason: string }
  | { kind: 'product'; id: string; index: number; productId?: string; reason: string }

export interface HtmlPatch {
  find: string
  replace: string
}

export interface RevisionAnswer {
  reply: string
  /** 質問への答えだけ(直しの案はない) */
  answered: boolean
  /** 見た目の直し: 当てたあとの HTML(当たらなかった差分の数も返す)。直しがなければ null */
  html: { html: string; failed: number; warnings: string[] } | null
  edits: ElementEdit[]
}

/** 入力欄の近くに出す、よく使う頼み方(押すと、入力欄に足される。いくつか選んでまとめて頼める) */
export function revisionSuggestions(revisionNote?: string): string[] {
  const base = [
    tr('ボタンを目立たせて', 'Make the buttons stand out'),
    tr('見出しを大きく', 'Make the headings bigger'),
    tr('余白を詰めて', 'Tighten the spacing'),
    tr('スマホで読みやすく', 'Make it easier to read on phones'),
    tr('背景を明るく', 'Lighten the background'),
    tr('ヘッドラインを短く', 'Shorten the headline'),
    tr('件名をもっと惹きのある言い方に', 'Make the subject line more compelling'),
    tr('メイン画像をもっと明るい雰囲気のものに', 'Use a brighter main image'),
  ]
  // 仕上がりの確認で「直してほしい」と書かれていれば、それをいちばん前に出す
  const note = (revisionNote ?? '').trim()
  return note ? [note, ...base] : base
}

const MAX_POOL_PRODUCTS = 80
const MAX_POOL_HEROES = 40

/** 画面の HTML と同じ書き方(prettyHtml が、文字の空白をまとめ、& < > を書き換える) */
const escText = (v: string) => v.replace(/\s+/g, ' ').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const absUrl = (u?: string | null) => (u ? new URL(u, location.href).href : '')

const PROMPT = `あなたは、メールマガジンの制作を手伝うアシスタント。制作の人(または企画の人)が、いまの HTML と要素(文言・リンク先・メイン画像・商品)を見ながら、直したいことを頼む。
入力の request が最新の依頼、chat がこれまでの対話(古い順)、html がいまの HTML、elements がいまの要素、candidates が差し替えに使える商品とメイン画像、revision_note は企画からの「直してほしい」(あれば)。

次の JSON だけを返す:
{"mode":"update","reply":"依頼にどう応えたかを 1〜2 文で","html_patches":[{"find":"…","replace":"…"}],"element_edits":[{"id":"…","value":"…","reason":"…"}]}

決まり:
1. 見た目の直し(色・大きさ・太さ・余白・並び・角の丸み・ボタンの形など)は html_patches で返す。find は、いまの html から一字一句そのまま写した、html の中で 1 か所だけに当たる連続した文字列(30〜300 文字くらい)。replace はそこを置き換える文字列。変えない所は含めない。
2. 文言(件名・プリヘッダー・ヘッドライン・コピー・セクションの見出しとコピー・通知のタイトルと本文)と、リンク先の URL を変えたいときは、html_patches で書き換えず、element_edits で返す。id は elements.texts / elements.links の id、value は新しい文言・URL、reason は理由を 1 文で。人が確かめてから、要素と HTML の両方に入れる。
3. メイン画像を替えたいときは element_edits に {"id":"hero","hero_id":"candidates.heroes の id","reason":"…"}。商品を替えたいときは {"id":"product.<elements.products の index>","product_id":"candidates.products の id","reason":"…"}。id は必ず candidates の中から選ぶ。
4. 価格・商品ページの URL・画像の URL・リンクの URL は、html_patches で変えない。
5. 依頼が質問・相談(「どう思う?」など)で、直しを求めていないときは {"mode":"answer","reply":"答え(3 文以内)"} だけを返す。
6. 直しが要らない側は、空の配列にする。
7. html_patches の中の HTML の引用符(")は、JSON の決まりどおり \\" と書く(この依頼に限り、「文字列の中にダブルクォートを入れない」という注意より、こちらを優先する)。

入力:
`

/** AI に、いまの HTML と要素を渡して、手直しの案をもらう */
export async function askRevision(args: {
  request: string
  history: ChatTurnIn[]
  html: string
  snap: Snapshot
  /** 差し替えの候補(配信の国の市場に合うもの) */
  products: Product[]
  heroes: HeroImage[]
  revisionNote?: string
}): Promise<RevisionAnswer> {
  const { snap } = args
  const texts = textRows(snap, true)
  const links = linkRows(snap).filter((r) => r.slotKey)
  const prows = productRows(snap)
  const payload = {
    task: 'revise_production',
    card: { scheduledAt: snap.card.scheduled_at, country: snap.card.country, channel: snap.card.channel },
    request: args.request,
    chat: args.history.slice(-10),
    revision_note: args.revisionNote || undefined,
    elements: {
      texts: texts.map((r) => ({ id: r.id, label: r.label, value: r.value })),
      links: links.map((r) => ({ id: `link.${r.slotKey}`, label: r.label, value: r.base ?? '' })),
      hero: snap.hero ? { id: snap.hero.id, name: snap.hero.name } : null,
      products: prows.map((r, index) => ({ index, section: r.section, id: r.product.id, name: r.product.name, price: r.price })),
    },
    candidates: {
      heroes: args.heroes.slice(0, MAX_POOL_HEROES).map((h) => ({ id: h.id, name: h.name })),
      products: args.products.slice(0, MAX_POOL_PRODUCTS).map((p) => ({ id: p.id, name: p.name, code: p.product_code ?? '', price: p.price })),
    },
    html: args.html,
  }
  const out = await askAgent(PROMPT, payload)
  const reply = typeof out.reply === 'string' ? out.reply.trim() : ''
  if (out.mode === 'answer') return { reply, answered: true, html: null, edits: [] }

  // 要素の直し: 入力にない id・候補にない画像や商品は捨てる(AI が作った id を、そのまま信じない)
  const textById = new Map(texts.map((r) => [r.id, r]))
  const linkById = new Map(links.map((r) => [`link.${r.slotKey}`, r]))
  const heroIds = new Set(args.heroes.map((h) => h.id))
  const productIds = new Set(args.products.map((p) => p.id))
  const edits: ElementEdit[] = []
  for (const e of Array.isArray(out.element_edits) ? (out.element_edits as Record<string, unknown>[]) : []) {
    const id = String(e?.id ?? '')
    const value = typeof e?.value === 'string' ? e.value : ''
    const reason = typeof e?.reason === 'string' ? e.reason : ''
    const tr0 = textById.get(id)
    const lr = linkById.get(id)
    if (tr0 && value !== tr0.value) edits.push({ kind: 'text', id, field: tr0.field, label: tr0.label, value, reason })
    else if (lr && lr.slotKey && value && value !== lr.base) edits.push({ kind: 'link', id, slotKey: lr.slotKey, label: lr.label, value, reason })
    else if (id === 'hero') {
      const heroId = String(e?.hero_id ?? '')
      edits.push({ kind: 'hero', id: 'hero', heroId: heroIds.has(heroId) && heroId !== snap.hero?.id ? heroId : undefined, reason })
    } else if (/^product\.\d+$/.test(id)) {
      const index = Number(id.slice(8))
      if (index >= prows.length) continue
      const productId = String(e?.product_id ?? '')
      edits.push({ kind: 'product', id, index, productId: productIds.has(productId) ? productId : undefined, reason })
    }
  }

  const patches = (Array.isArray(out.html_patches) ? (out.html_patches as Record<string, unknown>[]) : [])
    .map((p) => ({ find: typeof p?.find === 'string' ? p.find : '', replace: typeof p?.replace === 'string' ? p.replace : '' }))
    .filter((p) => p.find && p.find !== p.replace)
  const html = patches.length ? applyPatches(args.html, patches) : null
  const warnings = html ? guardHtml(args.html, html.html, snap) : []
  return { reply, answered: false, html: html && html.html !== args.html ? { ...html, warnings } : html && html.failed ? { ...html, warnings } : null, edits }
}

/** 差分を当てる。find が 1 か所だけに当たるものだけを当てる(当たらない・いくつも当たるものは、数えて知らせる) */
export function applyPatches(html: string, patches: HtmlPatch[]): { html: string; failed: number } {
  let out = html
  let failed = 0
  for (const p of patches) {
    const at = out.indexOf(p.find)
    if (at < 0 || out.indexOf(p.find, at + 1) >= 0) {
      failed++
      continue
    }
    out = out.slice(0, at) + p.replace + out.slice(at + p.find.length)
  }
  return { html: out, failed }
}

/** HTML の中の URL(href・src)の一覧 */
const urlsOf = (html: string) => [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1]).sort()

/** 見た目の直しで、変えてはいけないもの(リンク・画像の URL、価格)が変わっていないか */
export function guardHtml(before: string, after: string, snap: Snapshot): string[] {
  const warnings: string[] = []
  if (urlsOf(before).join('\n') !== urlsOf(after).join('\n')) warnings.push(tr('リンクか画像の URL が変わっています', 'A link or image URL changed'))
  const count = (s: string, k: string) => s.split(k).length - 1
  const prices = [...new Set(productRows(snap).map((r) => escText(r.price)).filter(Boolean))]
  if (prices.some((p) => count(before, p) !== count(after, p))) warnings.push(tr('価格の表示が変わっています', 'A price changed'))
  return warnings
}

/** 要素の直しを、写しに当てる(当てたあとの写し)。画像・商品は、選んだものを渡す */
export function applyEdit(snap: Snapshot, edit: ElementEdit, value: { text?: string; hero?: HeroImage | null; productId?: string }, all: Product[]): Snapshot {
  if (edit.kind === 'text') return setText(snap, edit.field, value.text ?? edit.value)
  if (edit.kind === 'link') return setLink(snap, edit.slotKey, value.text ?? edit.value)
  if (edit.kind === 'hero') return value.hero === undefined ? snap : setHero(snap, value.hero)
  if (!value.productId) return snap
  return setProducts(snap, snap.productIds.map((x, i) => (i === edit.index ? value.productId! : x)), all)
}

/**
 * 要素を直したとき、手で直した HTML(保存した・エディタで直した)の、同じ場所も書き換える。
 * HTML は作り直さない(制作の人が直した見た目を消さないため)。変わった値の、元の書き方を HTML の中で探して置き換える。見つからなかったものは数えて知らせる
 */
export function syncHtml(html: string, before: Snapshot, after: Snapshot): { html: string; replaced: number; missing: number } {
  const pairs: [string, string][] = []
  for (const r of textRows(after, true)) {
    const was = getText(before, r.field)
    if (was !== r.value && was.trim()) pairs.push([escText(was), escText(r.value)])
  }
  const prevLinks = new Map(linkRows(before).map((r) => [r.slotKey ?? r.label, r.value]))
  for (const r of linkRows(after)) {
    const was = prevLinks.get(r.slotKey ?? r.label)
    if (was && was !== r.value) pairs.push([escAttr(was), escAttr(r.value)])
  }
  if ((before.hero?.id ?? '') !== (after.hero?.id ?? '') && before.hero && after.hero) pairs.push([escAttr(absUrl(heroImage(before.hero))), escAttr(absUrl(heroImage(after.hero)))])
  const prevRows = productRows(before)
  productRows(after).forEach((r, i) => {
    const was = prevRows[i]
    if (!was || was.product.id === r.product.id) return
    pairs.push([escText(was.product.name), escText(r.product.name)], [escText(was.price), escText(r.price)], [escAttr(absUrl(productImage(was.product))), escAttr(absUrl(productImage(r.product)))])
    // 商品ページの URL は、計測用のパラメーターまで付いた形で探す(付ける前の形だと、ほかの商品の URL の頭にも当たるため)
    if (was.url && r.url) pairs.push([escAttr(was.url), escAttr(r.url)])
  })
  let out = html
  let replaced = 0
  let missing = 0
  for (const [from, to] of pairs) {
    if (!from || from === to) continue
    if (!out.includes(from)) {
      missing++
      continue
    }
    out = out.split(from).join(to)
    replaced++
  }
  return { html: out, replaced, missing }
}
