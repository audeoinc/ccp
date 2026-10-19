// 制作の依頼の写し(バックログ PR2・PR3。docs/PRODUCTION.md)。
// 「この内容で制作に依頼する」を押した時点の配信の中身を固めて保存し、制作のページはそれを見る(あとで配信カードを変えても、黙って変わらない)。
// 依頼する前(下書き)は、いまの配信カードの中身から同じ形を作って見せる。
// コピーしやすい行(テキスト・商品・リンク先)と、プレビューの HTML の書き出しも、ここにまとめる(React を使わない)
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { SOURCE_MANUAL, type Item } from './items'
import { campaignSlug, defaultUtm, encodeLinks, fcmText, linkSlots, parseLinks, productUrl, screenOf, withUtm } from './links'
import { parsePushLink } from './pushLink'
import { CHANNEL_PUSH } from './status'
import { DEFAULT_PUSH_TEMPLATE, sectionRange, sectionsOf, templateFromValue, type EmailTemplateId } from './templates'
import { priceText, tr } from './i18n'

/** 写しに入れる配信カードの列(制作に要るものだけ。AI の案・理由は入れない) */
const CARD_KEYS = [
  'id',
  'name',
  'scheduled_at',
  'country',
  'channel',
  'department',
  'status',
  'email_template',
  'layout_key',
  'theme',
  'headline',
  'copy',
  'section_titles',
  'section_copies',
  'links',
  'push_link',
  'push_title',
  'push_body',
  'audience',
  'hero_image_id',
] as const satisfies readonly (keyof DeliveryCard)[]

export interface Snapshot {
  v: 1
  /** 写しを作った日時 */
  takenAt: string
  card: Pick<DeliveryCard, (typeof CARD_KEYS)[number]>
  /** 掲載商品(メールの並び順) */
  productIds: string[]
  /** 掲載商品の、その時の中身(あとで商品マスタが変わっても、依頼した時の名前・価格で見られるように) */
  products: Product[]
  hero: HeroImage | null
}

export function buildSnapshot(card: DeliveryCard, productIds: string[], products: Product[], heroes: HeroImage[]): Snapshot {
  const picked = Object.fromEntries(CARD_KEYS.map((k) => [k, card[k]])) as Snapshot['card']
  const used = new Set(productIds)
  return {
    v: 1,
    takenAt: new Date().toISOString(),
    card: picked,
    productIds,
    products: products.filter((p) => used.has(p.id)),
    hero: heroes.find((h) => h.id === card.hero_image_id) ?? null,
  }
}

export function parseSnapshot(json?: string | null): Snapshot | null {
  if (!json) return null
  try {
    const v = JSON.parse(json) as Snapshot
    return v && v.v === 1 && v.card ? v : null
  } catch {
    return null
  }
}

const isPushCard = (s: Snapshot) => s.card.channel === CHANNEL_PUSH
export const templateOf = (s: Snapshot): EmailTemplateId => (s.card.layout_key || (isPushCard(s) ? DEFAULT_PUSH_TEMPLATE : templateFromValue(s.card.email_template))) as EmailTemplateId
const items = (s: Snapshot): Item[] => s.productIds.map((pid, i) => ({ key: `${pid}-${i}`, productId: pid, reason: '', source: SOURCE_MANUAL }))
const parseCopies = (v?: string): string[] => {
  if (!v) return []
  try {
    const a = JSON.parse(v)
    if (Array.isArray(a)) return a.map(String)
  } catch {
    // JSON でなければ、改行区切りとして読む
  }
  return v.split('\n')
}

export interface CopyRow {
  label: string
  value: string
}

/** 直せるテキストの場所(配信カードの列。セクションは何番目か) */
export type TextField = { key: 'name' | 'push_title' | 'push_body' | 'headline' | 'copy' } | { key: 'section_titles' | 'section_copies'; index: number }
export interface TextRow extends CopyRow {
  field: TextField
  /** 行を見分ける鍵(直した印・元の値を、同じ行どうしで比べる) */
  id: string
}

const fieldId = (f: TextField) => ('index' in f ? `${f.key}.${f.index}` : f.key)

export function getText(s: Snapshot, f: TextField): string {
  const c = s.card
  if (f.key === 'section_titles') return (c.section_titles ?? '').split('\n')[f.index] ?? ''
  if (f.key === 'section_copies') return parseCopies(c.section_copies)[f.index] ?? ''
  return c[f.key] ?? ''
}

/** テキストを 1 つ直した、新しい写し(元の写しは変えない) */
export function setText(s: Snapshot, f: TextField, value: string): Snapshot {
  const card = { ...s.card }
  if (f.key === 'section_titles' || f.key === 'section_copies') {
    const n = sectionsOf(templateOf(s)).length
    const list = f.key === 'section_titles' ? (card.section_titles ?? '').split('\n') : parseCopies(card.section_copies)
    const next = Array.from({ length: Math.max(n, list.length, f.index + 1) }, (_, i) => list[i] ?? '')
    next[f.index] = value
    // 見出しは改行区切り、コピーは JSON の配列(配信カードと同じ持ち方)
    if (f.key === 'section_titles') card.section_titles = next.join('\n').replace(/\n+$/, '')
    else card.section_copies = JSON.stringify(next)
  } else {
    card[f.key] = value
  }
  return { ...s, card }
}

/**
 * テキスト(件名・ヘッドライン・コピー・セクションの見出しとコピー。アプリは通知のタイトル・本文)。
 * all のときは、空の行も出す(制作のページで直すとき、空のセクションにも書けるように)
 */
export function textRows(s: Snapshot, all = false): TextRow[] {
  const fields: { label: string; field: TextField }[] = []
  if (isPushCard(s)) {
    fields.push({ label: tr('通知のタイトル', 'Notification title'), field: { key: 'push_title' } }, { label: tr('通知の本文', 'Notification body'), field: { key: 'push_body' } })
  } else {
    fields.push({ label: tr('件名', 'Subject'), field: { key: 'name' } })
  }
  fields.push({ label: tr('ヘッドライン', 'Headline'), field: { key: 'headline' } }, { label: tr('コピー', 'Copy'), field: { key: 'copy' } })
  sectionsOf(templateOf(s)).forEach((sec, i) => {
    fields.push({ label: tr(`${sec.label} の見出し`, `${sec.label} heading`), field: { key: 'section_titles', index: i } })
    fields.push({ label: tr(`${sec.label} のコピー`, `${sec.label} copy`), field: { key: 'section_copies', index: i } })
  })
  const rows = fields.map((x) => ({ ...x, id: fieldId(x.field), value: getText(s, x.field) }))
  return all ? rows : rows.filter((r) => r.value.trim())
}

const campaignOf = (s: Snapshot) => campaignSlug(s.card.name ?? '', s.card.scheduled_at ?? '')
const utmOf = (s: Snapshot) => {
  const links = parseLinks(s.card.links)
  return { ...defaultUtm(campaignOf(s)), ...Object.fromEntries(Object.entries(links.utm ?? {}).filter(([, v]) => v)) }
}

export interface ProductRow {
  section: string
  product: Product
  price: string
  /** 商品ページの URL(計測用のパラメーター付き)。アプリは開く画面 */
  url: string
}

/** 選定された商品(セクションごと、メールの並び順) */
export function productRows(s: Snapshot): ProductRow[] {
  const sections = sectionsOf(templateOf(s))
  const utm = utmOf(s)
  return s.productIds.flatMap((pid, i) => {
    const product = s.products.find((p) => p.id === pid)
    if (!product) return []
    const sec = sections.find((x) => {
      const [a, b] = sectionRange(sections, x, s.productIds.length)
      return i >= a && i < b
    })
    const url = isPushCard(s) ? (product.product_code ? `data: ${fcmText({ kind: 'product', value: product.product_code }, campaignOf(s))}` : '') : withUtm(productUrl(product), utm)
    return [{ section: sec?.label ?? '', product, price: priceText(product.price, product.market === 'US' ? 'US' : 'JP'), url }]
  })
}

export interface LinkRow extends CopyRow {
  /** 直せる場所(メールのメイン画像・ボタン)の鍵。アプリの画面・通知を押したときの画面は、ここでは直さない */
  slotKey?: string
  /** 計測用のパラメーターを付ける前の URL(直すのは、こちら) */
  base?: string
}

/** リンク先(場所ごとの URL。アプリは開く画面) */
export function linkRows(s: Snapshot): LinkRow[] {
  const links = parseLinks(s.card.links)
  const utm = utmOf(s)
  const rows: LinkRow[] = linkSlots(templateOf(s), items(s), s.products, campaignOf(s)).map((slot) => {
    if (isPushCard(s)) {
      const d = fcmText(screenOf(links, slot), campaignOf(s))
      return { label: slot.label, value: d ? `data: ${d}` : '' }
    }
    const url = ((slot.kind === 'hero' ? links.hero : links.buttons?.[slot.key]) ?? '').trim() || slot.defaultUrl
    return { label: slot.label, value: url ? withUtm(url, utm) : '', slotKey: slot.key, base: url }
  })
  if (isPushCard(s)) {
    const tap = parsePushLink(s.card.push_link)
    if (tap) rows.unshift({ label: tr('通知を押したときに開く画面', 'Screen opened by the notification'), value: tap.kind === 'custom' ? (tap.url ?? '') : tap.kind })
  }
  return rows.filter((r) => r.value || r.slotKey)
}

/** リンク先を 1 つ直した、新しい写し(計測用のパラメーターは、これまでどおり後から付く) */
export function setLink(s: Snapshot, slotKey: string, url: string): Snapshot {
  const links = parseLinks(s.card.links)
  if (slotKey === 'hero') links.hero = url
  else links.buttons = { ...(links.buttons ?? {}), [slotKey]: url }
  return { ...s, card: { ...s.card, links: encodeLinks(links) } }
}

/** メイン画像を替えた、新しい写し */
export function setHero(s: Snapshot, hero: HeroImage | null): Snapshot {
  return { ...s, card: { ...s.card, hero_image_id: hero?.id }, hero }
}

/** 掲載商品の並びを替えた、新しい写し(新しく載せた商品は、その時の中身を写しに足す) */
export function setProducts(s: Snapshot, productIds: string[], all: Product[]): Snapshot {
  const known = new Map(s.products.map((p) => [p.id, p]))
  for (const id of productIds) if (!known.has(id)) {
    const p = all.find((x) => x.id === id)
    if (p) known.set(id, p)
  }
  return { ...s, productIds, products: productIds.map((id) => known.get(id)).filter((p): p is Product => !!p).filter((p, i, a) => a.indexOf(p) === i) }
}

/** 項目をまとめてコピーするときの文字(見出し: 値 を 1 行ずつ) */
export const rowsText = (rows: CopyRow[]) => rows.map((r) => `${r.label}: ${r.value}`).join('\n')

// ---- プレビューの HTML の書き出し(下書き。プレビューと同じ見た目を、書式を直接書いた HTML にする)

// 書き写す書式(見た目に効くものだけ。全部を書くと、重く読みにくくなる)
const STYLE_KEYS = [
  'display', 'position', 'box-sizing', 'width', 'max-width', 'min-width', 'height', 'max-height', 'margin', 'padding',
  'border', 'border-radius', 'background-color', 'background-image', 'background-size', 'background-position',
  'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align',
  'text-decoration', 'text-transform', 'white-space', 'vertical-align', 'object-fit', 'flex-direction', 'flex-wrap',
  'justify-content', 'align-items', 'gap', 'grid-template-columns', 'grid-template-rows', 'opacity', 'overflow',
] as const

/**
 * 画面に描いたプレビューの要素を、書式を直接書いた HTML の文字にする(下書き。メールの配信のしくみにそのまま入れる完成品ではない)。
 * 画像の URL は、いまのサイトの URL を頭に付けた形にする(サイトの外で開くと、パスワードの関係で見えないことがある)
 */
export function previewHtml(root: HTMLElement, title: string): string {
  const clone = root.cloneNode(true) as HTMLElement
  const src = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
  const dst = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]
  src.forEach((el, i) => {
    const out = dst[i]
    if (!out) return
    const cs = getComputedStyle(el)
    out.setAttribute('style', STYLE_KEYS.map((k) => `${k}:${cs.getPropertyValue(k)}`).filter((d) => !d.endsWith(':')).join(';'))
    out.removeAttribute('class')
    // 画面の操作のための印(編集・ドラッグ・リンクの場所の番号)は外す
    for (const a of Array.from(out.attributes)) if (a.name.startsWith('data-') || a.name.startsWith('aria-') || a.name === 'draggable' || a.name === 'tabindex' || a.name === 'contenteditable') out.removeAttribute(a.name)
    if (out instanceof HTMLImageElement && el instanceof HTMLImageElement) out.setAttribute('src', el.currentSrc || el.src)
  })
  clone.querySelectorAll('button, input, textarea, select, svg').forEach((n) => n.remove())
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return prettyHtml(
    `<!doctype html>\n<html lang="${navigator.language.startsWith('ja') ? 'ja' : 'en'}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${esc(title)}</title>\n</head>\n<body style="margin:0;background:#ffffff">\n${clone.outerHTML}\n</body>\n</html>\n`,
  )
}

// 中身のない要素(閉じタグを書かない)と、中の空白をそのまま残す要素
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
const RAW = new Set(['pre', 'textarea', 'script', 'style'])

/**
 * HTML を、要素ごとに改行して字下げした形に整える(利用者の指摘: 1 行に並ぶと構成が見づらい)。
 * 文字だけを持つ要素は 1 行にまとめる。中の空白に意味がある要素(pre など)は、そのまま
 */
export function prettyHtml(src: string): string {
  const doc = new DOMParser().parseFromString(src, 'text/html')
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const attr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  const squash = (v: string) => v.replace(/\s+/g, ' ').trim()
  const open = (el: Element) => `<${el.tagName.toLowerCase()}${Array.from(el.attributes).map((a) => ` ${a.name}="${attr(a.value)}"`).join('')}>`
  const lines: string[] = ['<!doctype html>']
  const walk = (node: Node, depth: number) => {
    const pad = '  '.repeat(depth)
    if (node.nodeType === Node.TEXT_NODE) {
      const text = squash(node.textContent ?? '')
      if (text) lines.push(pad + esc(text))
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as Element
    const tag = el.tagName.toLowerCase()
    if (VOID.has(tag)) {
      lines.push(pad + open(el))
      return
    }
    const kids = Array.from(el.childNodes).filter((n) => n.nodeType === Node.ELEMENT_NODE || squash(n.textContent ?? ''))
    if (RAW.has(tag) || kids.every((n) => n.nodeType === Node.TEXT_NODE)) {
      const inner = RAW.has(tag) ? el.innerHTML : esc(squash(el.textContent ?? ''))
      lines.push(`${pad}${open(el)}${inner}</${tag}>`)
      return
    }
    lines.push(pad + open(el))
    kids.forEach((k) => walk(k, depth + 1))
    lines.push(`${pad}</${tag}>`)
  }
  walk(doc.documentElement, 0)
  return lines.join('\n') + '\n'
}

/** 文字をファイルとして保存させる(ブラウザのダウンロード) */
export function downloadText(name: string, text: string, type = 'text/html') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
