import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Item } from './items'
import { optionLabel, tr } from './i18n'
import { getTemplate, placedButtons, sectionRange, sectionsOf, type EmailTemplateId, type LinkKind } from './templates'

/**
 * 配信ごとのリンク先(配信カードの cr854_links に JSON で保存する。GCP 版だけの列)。
 * テンプレートには、リンク先の「種類」だけがある。実際の URL は、種類から既定の URL を作り、配信カードで上書きできる。
 * ボタンの鍵は、テンプレートのボタンの id(文言や位置を変えても、設定が外れないように)。
 */
export interface Links {
  /** メイン画像のリンク先(空は既定) */
  hero?: string
  /** ボタンの id → リンク先(空は既定) */
  buttons?: Record<string, string>
  /** 計測用のパラメーター(すべてのリンクに付ける) */
  utm?: { source?: string; medium?: string; campaign?: string }
}

/** ショップの URL(実際の URL が決まるまでの、仮の値) */
export const SHOP_URL = 'https://shop.example.com'

export function parseLinks(json?: string): Links {
  if (!json) return {}
  try {
    const v = JSON.parse(json) as Links
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

export const encodeLinks = (l: Links): string => {
  const clean: Links = {}
  if (l.hero?.trim()) clean.hero = l.hero.trim()
  const buttons = Object.fromEntries(Object.entries(l.buttons ?? {}).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))
  if (Object.keys(buttons).length) clean.buttons = buttons
  const utm = Object.fromEntries(Object.entries(l.utm ?? {}).filter(([, v]) => v?.trim()).map(([k, v]) => [k, v!.trim()]))
  if (Object.keys(utm).length) clean.utm = utm
  return Object.keys(clean).length ? JSON.stringify(clean) : ''
}

/** URL に使う短い名前(英数字とハイフン) */
export const slug = (s: string) =>
  s
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** 配信のページの名前(配信名 + 配信日。配信名が英数字でなければ、日付だけ) */
export const campaignSlug = (name: string, scheduledAt: string) => [slug(name), scheduledAt.slice(0, 10).replace(/-/g, '')].filter(Boolean).join('-')

/** 計測用のパラメーターの既定値 */
export const defaultUtm = (campaign: string) => ({ source: 'newsletter', medium: 'email', campaign })

/** 種類から作る、既定のリンク先。custom は既定がない(配信カードで必ず決める) */
export function defaultUrl(kind: LinkKind, campaign: string, category?: string): string {
  switch (kind) {
    case 'top':
      return SHOP_URL
    case 'category':
      return category ? `${SHOP_URL}/c/${slug(category) || encodeURIComponent(category)}` : SHOP_URL
    case 'custom':
      return ''
    default:
      return `${SHOP_URL}/campaign/${campaign}`
  }
}

export const productUrl = (p?: Cr854_products) => (p?.cr854_productcode ? `${SHOP_URL}/p/${p.cr854_productcode}` : '')

/** 計測用のパラメーターを付けた URL(URL として読めないときは、そのまま返す) */
export function withUtm(url: string, utm: Links['utm']): string {
  if (!url) return ''
  try {
    const u = new URL(url)
    if (utm?.source) u.searchParams.set('utm_source', utm.source)
    if (utm?.medium) u.searchParams.set('utm_medium', utm.medium)
    if (utm?.campaign) u.searchParams.set('utm_campaign', utm.campaign)
    return u.toString()
  } catch {
    return url
  }
}

export const isUrl = (s: string) => {
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:'
  } catch {
    return false
  }
}

/** リンクを付ける場所(メイン画像・ボタン)。種類と、既定の URL を持つ */
export interface LinkSlot {
  key: string
  /** 'hero' か、ボタンの id */
  kind: 'hero' | 'button'
  label: string
  linkKind: LinkKind
  defaultUrl: string
}

/** テンプレートと掲載商品から、リンクを付ける場所の一覧を作る(メール上の並び順) */
export function linkSlots(templateId: EmailTemplateId, items: Item[], products: Cr854_products[], campaign: string): LinkSlot[] {
  const tpl = getTemplate(templateId)
  const sections = sectionsOf(templateId)
  // セクションのカテゴリ: そのセクションの商品で、いちばん多いカテゴリ(ボタンのリンク先が「カテゴリのページ」のときに使う)
  const categoryOf = (sectionIndex: number): string | undefined => {
    const sec = sections[sectionIndex]
    if (!sec) return undefined
    const [from, to] = sectionRange(sections, sec, items.length)
    const counts = new Map<string, number>()
    for (const it of items.slice(from, to)) {
      const name = optionLabel(products.find((p) => p.cr854_productid === it.productId)?.cr854_categoryname)
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  }
  const heroKind = tpl.heroLink ?? 'campaign'
  const slots: LinkSlot[] = [{ key: 'hero', kind: 'hero', label: tr('メイン画像', 'Main image'), linkKind: heroKind, defaultUrl: defaultUrl(heroKind, campaign) }]
  for (const block of placedButtons(tpl)) {
    const where = block.at === 0 ? tr('メイン画像の下', 'Below the main image') : tr(`セクション ${block.at} の後`, `After section ${block.at}`)
    block.buttons.forEach((b, i) => {
      const kind = b.link ?? 'campaign'
      const text = b.label?.trim() || (i === 0 ? tr('商品を見る', 'Shop now') : tr('もっと見る', 'See more'))
      slots.push({
        key: b.id,
        kind: 'button',
        label: tr(`${text}(${where})`, `${text} (${where})`),
        linkKind: kind,
        defaultUrl: defaultUrl(kind, campaign, block.at > 0 ? categoryOf(block.at - 1) : undefined),
      })
    })
  }
  return slots
}
