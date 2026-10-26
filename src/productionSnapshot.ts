// 制作の依頼の写し(バックログ PR2・PR3。docs/PRODUCTION.md)。
// 「この内容で制作に依頼する」を押した時点の配信の中身を固めて保存し、制作のページはそれを見る(あとで配信カードを変えても、黙って変わらない)。
// 依頼する前(下書き)は、いまの配信カードの中身から同じ形を作って見せる。
// コピーしやすい行(テキスト・商品・リンク先)と、プレビューの HTML の書き出しも、ここにまとめる(React を使わない)
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { SOURCE_MANUAL, type Item } from './items'
import { UTM_SCHEME, campaignId, campaignSlug, encodeLinks, productLinks, utmFor, variantCampaign, fcmText, linkSlots, parseLinks, productUrl, screenOf, withUtm } from './links'
import { parsePushLink } from './pushLink'
import { CHANNEL_PUSH } from './status'
import { getTemplate, sectionRange, sectionsOf, splitTemplateKey, type EmailTemplateId, templateKeyOfCard } from './templates'
import { elementDescriptions } from './elements'
import { encodePartContent } from './partContent'
import { priceText, tr } from './i18n'
import { abSummary, isChoose, ownsAnyText, ownsHero, ownsProducts, ownsTemplate, parseAbTest, type VariantKey, type VariantText } from './abTest'

/** 写しに入れる配信カードの列(制作に要るものだけ。AI の案・理由は入れない) */
const CARD_KEYS = [
  'id',
  'name',
  'scheduled_at',
  'country',
  'channel',
  // 種類(テーマの種類)。配信カードの「種別」(department)は、2026-10-19 にやめた
  'theme_type',
  'status',
  'email_template',
  'layout_key',
  'theme',
  'headline',
  'copy',
  'section_titles',
  'section_copies',
  // テンプレートの部品の、配信ごとの中身(T8 段階 6)
  'part_content',
  'links',
  'push_link',
  'push_title',
  'push_body',
  'audience',
  'hero_image_id',
  // AB テストの設定(X55)
  'ab_test',
  // メールの件名・プリヘッダー(X2)
  'subject',
  'preheader',
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
  /** 計測用のパラメーターの作り方の版(links.ts の UTM_SCHEME)。ない写しは版 1(campaign = 配信名 + 日付、utm_content なし)で出す */
  utm?: number
  /** AB テスト(X55)。B・C 案の商品とメイン画像(比べる要素でないものは A と同じ)。制作のページでは見るだけ(直すのは配信カードで) */
  ab?: { summary: string; variants: SnapshotVariant[]; /** 案から選ぶ(まだ決まっていない。X57) */ choose?: boolean }
}

export interface SnapshotVariant {
  key: VariantKey
  productIds: string[]
  hero: HeroImage | null
  /** 案ごとの文言(X57。比べる要素が all のとき) */
  texts?: VariantText
  /** 案のテンプレート(「ID@v版」。A と違うときだけ。SU2 ⑤) */
  template?: string
}

/** variantIds: B・C 案の商品 ID(メールの並び順。AB テストで商品を比べるとき) */
export function buildSnapshot(card: DeliveryCard, productIds: string[], products: Product[], heroes: HeroImage[], variantIds?: Partial<Record<VariantKey, string[]>>): Snapshot {
  const picked = Object.fromEntries(CARD_KEYS.map((k) => [k, card[k]])) as Snapshot['card']
  const hero = heroes.find((h) => h.id === card.hero_image_id) ?? null
  const ab = parseAbTest(card.ab_test)
  const variants: SnapshotVariant[] | undefined = ab?.variants.map((k) => ({
    key: k,
    productIds: ownsProducts(ab) ? (variantIds?.[k] ?? []) : productIds,
    hero: ownsHero(ab) ? (heroes.find((h) => h.id === ab.heroes[k]?.heroId) ?? null) : hero,
    ...(ownsAnyText(ab) && ab.texts?.[k] ? { texts: ab.texts[k] } : {}),
    ...(ownsTemplate(ab) && ab.templates?.[k] ? { template: ab.templates[k] } : {}),
  }))
  const used = new Set([...productIds, ...(variants ?? []).flatMap((v) => v.productIds)])
  return {
    v: 1,
    takenAt: new Date().toISOString(),
    card: picked,
    productIds,
    products: products.filter((p) => used.has(p.id)),
    hero,
    utm: UTM_SCHEME,
    ...(ab && variants ? { ab: { summary: abSummary(ab), variants, ...(isChoose(ab) ? { choose: true } : {}) } } : {}),
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
export const templateOf = (s: Snapshot): EmailTemplateId => templateKeyOfCard(s.card)
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
export type TextField = { key: 'name' | 'subject' | 'preheader' | 'push_title' | 'push_body' | 'headline' | 'copy' } | { key: 'section_titles' | 'section_copies'; index: number }
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
  // 件名は、空なら配信名(X2 より前の写しにも合う)
  if (f.key === 'subject') return c.subject || c.name || ''
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
    fields.push({ label: tr('件名', 'Subject'), field: { key: 'subject' } }, { label: tr('プリヘッダー', 'Preheader'), field: { key: 'preheader' } })
  }
  fields.push({ label: tr('ヘッドライン', 'Headline'), field: { key: 'headline' } }, { label: tr('コピー', 'Copy'), field: { key: 'copy' } })
  sectionsOf(templateOf(s)).forEach((sec, i) => {
    fields.push({ label: tr(`${sec.label} の見出し`, `${sec.label} heading`), field: { key: 'section_titles', index: i } })
    fields.push({ label: tr(`${sec.label} のコピー`, `${sec.label} copy`), field: { key: 'section_copies', index: i } })
  })
  const rows = fields.map((x) => ({ ...x, id: fieldId(x.field), value: getText(s, x.field) }))
  return all ? rows : rows.filter((r) => r.value.trim())
}

// AB テストの配信は、案ごとに campaign の末尾に案を付ける(X55)。案を渡さなければ、AB テストの配信では A
const variantOf = (s: Snapshot, variant?: VariantKey) => variant ?? (s.ab ? 'A' : undefined)
const campaignOf = (s: Snapshot, variant?: VariantKey) => variantCampaign(campaignSlug(s.card.name ?? '', s.card.scheduled_at ?? ''), variantOf(s, variant))
// utm_campaign の既定値と utm_content は、写しの UTM の版で決める(古い写しは、依頼したときの URL のまま出す)
const schemeOf = (s: Snapshot) => s.utm ?? 1
const scheme2 = (s: Snapshot) => schemeOf(s) >= 2
const utmCampaignOf = (s: Snapshot) => (scheme2(s) ? campaignId(s.card.id, s.card.scheduled_at ?? '') : campaignSlug(s.card.name ?? '', s.card.scheduled_at ?? ''))
const utmOf = (s: Snapshot, variant?: VariantKey) => utmFor(parseLinks(s.card.links), utmCampaignOf(s), variantOf(s, variant))
/** 案の utm_campaign(制作のページの「AB テスト」の段に出す) */
/** AB テスト(全案を送る)の B・C 案の HTML(制作の依頼の列 variant_html)。A 案は列 html */
export type VariantHtml = Partial<Record<VariantKey, { html: string; saved_at?: string | null; saved_by_name?: string | null }>>
export function parseVariantHtml(json?: string | null): VariantHtml {
  if (!json) return {}
  try {
    const v = JSON.parse(json) as Record<string, { html?: unknown }>
    if (!v || typeof v !== 'object') return {}
    return Object.fromEntries(Object.entries(v).filter(([k, x]) => (k === 'B' || k === 'C') && typeof x?.html === 'string')) as VariantHtml
  } catch {
    return {}
  }
}
/** 制作のページで案ごとに切り替えるか(全案を送る AB テストだけ。案から選ぶは、決めた 1 案だけを作る) */
export const productionVariants = (s: Snapshot): VariantKey[] => (s.ab && !s.ab.choose ? ['A', ...s.ab.variants.map((v) => v.key)] : ['A'])
/** その案の写し(A はそのまま) */
export const snapshotOf = (s: Snapshot, k: VariantKey): Snapshot => {
  const v = k === 'A' ? undefined : s.ab?.variants.find((x) => x.key === k)
  return v ? variantSnapshot(s, v) : s
}

export const variantUtmCampaign = (s: Snapshot, variant: VariantKey) => (isPushCard(s) ? campaignOf(s, variant) : utmOf(s, variant).campaign)
/** 案の中身で作った写し(商品・メイン画像を、その案のものに。リンクの行を案ごとに作るため) */
export const variantSnapshot = (s: Snapshot, v: SnapshotVariant): Snapshot => {
  // 案のテンプレート(A と違うとき)。templateOf が、その案の形でセクション・リンクの枠を作る
  const layout = v.template ? { layout_key: splitTemplateKey(v.template).id, layout_version: splitTemplateKey(v.template).version ?? null } : {}
  const texts = v.texts
    ? {
        headline: v.texts.headline,
        copy: v.texts.copy,
        push_title: v.texts.pushTitle,
        push_body: v.texts.pushBody,
        subject: v.texts.subject ?? s.card.subject,
        preheader: v.texts.preheader ?? s.card.preheader,
        section_titles: v.texts.sectionTitles.join('\n'),
        section_copies: v.texts.sectionCopies.some(Boolean) ? JSON.stringify(v.texts.sectionCopies) : '',
        // 部品の中身のない古い案は、A と同じ
        part_content: v.texts.parts ? encodePartContent(v.texts.parts) : s.card.part_content,
      }
    : {}
  return { ...s, productIds: v.productIds, hero: v.hero, card: { ...s.card, ...layout, ...texts } }
}

export interface ProductRow {
  section: string
  product: Product
  price: string
  /** 商品ページの URL(計測用のパラメーター付き)。アプリは開く画面 */
  url: string
}

/** 選定された商品(セクションごと、メールの並び順) */
export function productRows(s: Snapshot, variant?: VariantKey): ProductRow[] {
  const sections = sectionsOf(templateOf(s))
  const utm = utmOf(s, variant)
  return s.productIds.flatMap((pid, i) => {
    const product = s.products.find((p) => p.id === pid)
    if (!product) return []
    const sec = sections.find((x) => {
      const [a, b] = sectionRange(sections, x, s.productIds.length)
      return i >= a && i < b
    })
    const url = isPushCard(s)
      ? product.product_code
        ? `data: ${fcmText({ kind: 'product', value: product.product_code }, campaignOf(s, variant))}`
        : ''
      : // 表の箱は、押せる要素ごとにリンクが分かれる(版 3)。ここには、いちばん上の要素(ふつうは写真)のリンクを出す。全部は計測の対応表(trackingRows)に
        withUtm(productUrl(product), utm, productLinks(templateOf(s), i, `${pid}-${i}`, product.product_code, schemeOf(s))[0]?.content)
    return [{ section: sec?.label ?? '', product, price: priceText(product.price, product.market === 'US' ? 'US' : 'JP'), url }]
  })
}

export interface LinkRow extends CopyRow {
  /** 直せる場所(メールのメイン画像・ボタン)の鍵。アプリの画面・通知を押したときの画面は、ここでは直さない */
  slotKey?: string
  /** 計測用のパラメーターを付ける前の URL(直すのは、こちら) */
  base?: string
  /** utm_content(計測の対応表に使う) */
  content?: string
}

/** リンク先(場所ごとの URL。アプリは開く画面) */
export function linkRows(s: Snapshot, variant?: VariantKey): LinkRow[] {
  const links = parseLinks(s.card.links)
  const utm = utmOf(s, variant)
  // リンク先のページ(配信のページ)の URL は、案で変えない(案を付けるのは計測用のパラメーターだけ)
  const rows: LinkRow[] = linkSlots(templateOf(s), items(s), s.products, campaignSlug(s.card.name ?? '', s.card.scheduled_at ?? ''), s.card.country, schemeOf(s)).map((slot) => {
    if (isPushCard(s)) {
      const d = fcmText(screenOf(links, slot), campaignOf(s, variant))
      return { label: slot.label, value: d ? `data: ${d}` : '' }
    }
    const url = ((slot.kind === 'hero' ? links.hero : links.buttons?.[slot.key]) ?? '').trim() || slot.defaultUrl
    return { label: slot.label, value: url ? withUtm(url, utm, slot.content) : '', slotKey: slot.key, base: url, content: slot.content }
  })
  if (isPushCard(s)) {
    const tap = parsePushLink(s.card.push_link)
    if (tap) rows.unshift({ label: tr('通知を押したときに開く画面', 'Screen opened by the notification'), value: tap.kind === 'custom' ? (tap.url ?? '') : tap.kind })
  }
  return rows.filter((r) => r.value || r.slotKey)
}

/**
 * 書き出す HTML に付けるリンク(プレビューの印 → 計測用のパラメーターつきの URL)。
 * 鍵は、メイン画像・ボタンは data-link の場所の鍵(hero・ボタンの id)、商品の枠は data-item-key(`商品ID-並び順`。CardPreview と同じ)。
 * 版 3 の表の箱は、押せる要素ごとに data-el(要素の ID)を鍵にする(写真・名前・ボタンが、それぞれ別のリンクになる)。
 * アプリの配信は、リンクが URL でない(開く画面)ので空
 */
export function htmlLinks(s: Snapshot, variant?: VariantKey): Record<string, string> {
  if (isPushCard(s)) return {}
  const out: Record<string, string> = {}
  for (const r of linkRows(s, variant)) if (r.slotKey && r.value) out[r.slotKey] = r.value
  for (const r of productLinkRows(s, variant)) if (r.url) out[r.key] = r.url
  return out
}

/** 商品の枠のリンク(utm_content ごと。メールの並び順) */
function productLinkRows(s: Snapshot, variant?: VariantKey): { key: string; content: string; url: string; index: number; productCode?: string }[] {
  const utm = utmOf(s, variant)
  return s.productIds.flatMap((pid, i) => {
    const p = s.products.find((x) => x.id === pid)
    return productLinks(templateOf(s), i, `${pid}-${i}`, p?.product_code, schemeOf(s)).map((l) => ({ ...l, url: withUtm(productUrl(p), utm, l.content), index: i, productCode: p?.product_code ?? undefined }))
  })
}

export interface TrackingRow {
  /** utm_content */
  content: string
  /** 人が読む説明(テンプレートで書いた説明。なければ場所から。UTM には入れない) */
  desc: string
  /** 商品の枠なら、商品コード */
  productCode?: string
  /** 計測用のパラメーターつきの URL */
  url: string
}

/**
 * 計測の対応表(utm_content → 説明・商品・URL。T8 の 8.10)。制作と分析が、送った content を人の読む名前に引くため。
 * メールだけ(アプリは content を付けていない)。版 1 の写しは content がないので空
 */
export function trackingRows(s: Snapshot, variant?: VariantKey): TrackingRow[] {
  if (isPushCard(s) || !scheme2(s)) return []
  const descs = elementDescriptions(getTemplate(templateOf(s)))
  const links = linkRows(s, variant)
    .filter((r) => r.content && r.value)
    .map((r) => ({ content: r.content!, desc: descs.get(r.content!) ?? r.label, url: r.value }))
  const products = productLinkRows(s, variant)
    .filter((r) => r.content && r.url)
    .map((r) => ({ content: r.content, desc: descs.get(r.content) ?? tr(`商品の枠 ${r.index + 1}`, `Product slot ${r.index + 1}`), productCode: r.productCode, url: r.url }))
  return [...links, ...products]
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
  // メイン画像の切り出し(焦点と拡大。X59)
  'object-position', 'transform', 'transform-origin',
] as const

/**
 * 画面に描いたプレビューの要素を、書式を直接書いた HTML の文字にする(下書き。メールの配信のしくみにそのまま入れる完成品ではない)。
 * 画像の URL は、いまのサイトの URL を頭に付けた形にする(サイトの外で開くと、パスワードの関係で見えないことがある)
 */
export function previewHtml(root: HTMLElement, title: string, links: Record<string, string> = {}): string {
  const clone = root.cloneNode(true) as HTMLElement
  const src = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
  const dst = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]
  // リンクの場所(メイン画像・ボタン・商品の枠)を、あとで <a> で包む(印は下で外すので、先に拾う)
  const wraps: { out: HTMLElement; href: string }[] = []
  src.forEach((el, i) => {
    const out = dst[i]
    if (!out) return
    // 表の箱(UTM の版 3)は、枠まるごとではなく、押せる要素(data-el)ごとにリンクが来る。リンクの来ている目印を使う
    const at = el.dataset.link === 'hero' ? 'hero' : el.dataset.link === 'button' ? el.dataset.linkId : [el.dataset.itemKey, el.dataset.el].find((k) => k && links[k])
    const href = at ? links[at] : undefined
    if (href) wraps.push({ out, href })
    const cs = getComputedStyle(el)
    // 切り出しの書式(焦点・拡大)は、画像だけに、拡大しているときだけ書く(ほかの要素に書くと、HTML が長くなるだけ)。縦の文字の書き方も、縦のときだけ書く
    const isImg = el.tagName === 'IMG'
    const zoomed = isImg && cs.getPropertyValue('transform') !== 'none'
    const vertical = cs.getPropertyValue('writing-mode').startsWith('vertical')
    const keys = [...STYLE_KEYS, ...(vertical ? (['writing-mode', 'text-orientation'] as const) : [])].filter((k) => (k === 'object-position' ? isImg : k === 'transform' || k === 'transform-origin' ? zoomed : true))
    out.setAttribute('style', keys.map((k) => `${k}:${cs.getPropertyValue(k)}`).filter((d) => !d.endsWith(':')).join(';'))
    out.removeAttribute('class')
    // 画面の操作のための印(編集・ドラッグ・リンクの場所の番号)は外す
    for (const a of Array.from(out.attributes)) if (a.name.startsWith('data-') || a.name.startsWith('aria-') || a.name === 'draggable' || a.name === 'tabindex' || a.name === 'contenteditable') out.removeAttribute(a.name)
    if (out instanceof HTMLImageElement && el instanceof HTMLImageElement) out.setAttribute('src', el.currentSrc || el.src)
    // 縦の文字(テンプレートの 8.8): メールの多くは縦の書き方に対応しないので、制作が画像にする。その印をコメントで残す
    if (el.dataset.asImage) out.before(document.createComment(tr(' 制作へ: この文字は画像にしてください(縦の文字は、メールで崩れやすいため) ', ' To production: render this text as an image (vertical text breaks in many email clients) ')))
  })
  clone.querySelectorAll('button, input, textarea, select, svg').forEach((n) => n.remove())
  // <a> の中に <a> は置けないので、ほかのリンクの場所を含む場所(ボタンを中に持つメイン画像など)は包まない(中のリンクを生かす)
  const hasInner = (w: { out: HTMLElement }) => wraps.some((x) => x !== w && w.out.contains(x.out))
  for (const w of wraps.filter((x) => !hasInner(x))) {
    const a = document.createElement('a')
    a.setAttribute('href', w.href)
    a.setAttribute('target', '_blank')
    a.setAttribute('style', 'display:block;color:inherit;text-decoration:none')
    w.out.replaceWith(a)
    a.appendChild(w.out)
  }
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
    // 制作へのコメント(縦の文字を画像にする など)は残す
    if (node.nodeType === Node.COMMENT_NODE) {
      lines.push(`${pad}<!--${node.textContent ?? ''}-->`)
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
