import type { Product } from './models/products'
import type { Item } from './items'
import { optionLabel, tr } from './i18n'
import { getTemplate, placedButtons, sectionRange, sectionsOf, type EmailTemplateId, type LinkKind } from './templates'

/**
 * 配信ごとのリンク先(配信カードの links に JSON で保存する)。
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
  /** アプリの配信: メイン画像・ボタンの鍵 → 開くアプリの画面(空は既定) */
  screens?: Record<string, AppScreen>
}

/**
 * アプリの配信のリンク先(アプリの中の画面)。通知は Firebase Cloud Messaging(FCM)で送り、
 * 開く画面は、通知の data(文字のキーと値の組)の screen と、画面に渡す値で伝える(アプリが読んで、その画面を開く)。
 * campaign: 配信のページ / category: カテゴリのページ / product: 商品のページ / home: アプリのホーム / message: メッセージボックスのこの配信 / custom: 画面の名前を指定
 */
export type AppScreenKind = 'message' | 'campaign' | 'category' | 'product' | 'home' | 'custom'
export interface AppScreen {
  kind: AppScreenKind
  /** category: カテゴリ名 / product: 商品コード / custom: 画面の名前(screen) */
  value?: string
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
  const screens = Object.fromEntries(
    Object.entries(l.screens ?? {})
      .filter(([, v]) => v?.kind)
      .map(([k, v]) => [k, v.value?.trim() ? { kind: v.kind, value: v.value.trim() } : { kind: v.kind }]),
  )
  if (Object.keys(screens).length) clean.screens = screens
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

/**
 * AB テストの案ごとの campaign(X55)。AB テストの配信だけ、末尾に案を付ける(A も含めて -a / -b / -c)。
 * A を付けないと、付けない値が A なのか AB テストでない配信なのか、GA で区別できないため。AB テストでない配信(variant なし)は、そのまま
 */
export const variantCampaign = (campaign: string, variant?: string | null) => (variant && campaign ? `${campaign}-${variant.toLowerCase()}` : campaign)

/** 計測用のパラメーター(決まった値に、手で入れた値を重ね、AB テストなら campaign に案を付ける) */
export function utmFor(links: Links, campaign: string, variant?: string | null) {
  const base = { ...defaultUtm(campaign), ...Object.fromEntries(Object.entries(links.utm ?? {}).filter(([, v]) => v)) }
  return { ...base, campaign: variantCampaign(base.campaign, variant) }
}

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

export const productUrl = (p?: Product) => (p?.product_code ? `${SHOP_URL}/p/${p.product_code}` : '')

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
  /** アプリの配信のときの、既定の画面(custom は null) */
  defaultScreen: AppScreen | null
}

/** テンプレートと掲載商品から、リンクを付ける場所の一覧を作る(メール上の並び順) */
export function linkSlots(templateId: EmailTemplateId, items: Item[], products: Product[], campaign: string): LinkSlot[] {
  const tpl = getTemplate(templateId)
  const sections = sectionsOf(templateId)
  // セクションのカテゴリ: そのセクションの商品で、いちばん多いカテゴリ(ボタンのリンク先が「カテゴリのページ」のときに使う)
  const categoryOf = (sectionIndex: number): string | undefined => {
    const sec = sections[sectionIndex]
    if (!sec) return undefined
    const [from, to] = sectionRange(sections, sec, items.length)
    const counts = new Map<string, number>()
    for (const it of items.slice(from, to)) {
      const name = optionLabel(products.find((p) => p.id === it.productId)?.category_name)
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  }
  const heroKind = tpl.heroLink ?? 'campaign'
  const slots: LinkSlot[] = [{ key: 'hero', kind: 'hero', label: tr('メイン画像', 'Main image'), linkKind: heroKind, defaultUrl: defaultUrl(heroKind, campaign), defaultScreen: defaultScreen(heroKind) }]
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
        defaultScreen: defaultScreen(kind, block.at > 0 ? categoryOf(block.at - 1) : undefined),
      })
    })
  }
  return slots
}

// ---- アプリの配信(FCM の data)

/** テンプレートのリンク先の種類から、既定のアプリの画面(custom は既定がない) */
export function defaultScreen(kind: LinkKind, category?: string): AppScreen | null {
  switch (kind) {
    case 'top':
      return { kind: 'home' }
    case 'category':
      return category ? { kind: 'category', value: category } : { kind: 'home' }
    case 'custom':
      return null
    default:
      return { kind: 'campaign' }
  }
}

/** 画面の指定がそろっているか(カテゴリ・商品・画面の名前は、値が要る) */
export const screenComplete = (sc: AppScreen | null | undefined): boolean =>
  !!sc && (sc.kind === 'campaign' || sc.kind === 'home' || sc.kind === 'message' || !!sc.value?.trim())

/**
 * FCM の通知の data に入れる値。どの画面にも campaign(配信の名前)を付ける(配信のページ・メッセージは、これで配信を特定する。ほかの画面では計測に使う)。
 * data の値は文字でなければならないので、すべて文字にする
 */
export function fcmData(sc: AppScreen | null | undefined, campaign: string): Record<string, string> | null {
  if (!screenComplete(sc)) return null
  const v = sc!.value?.trim() ?? ''
  switch (sc!.kind) {
    case 'campaign':
      return { screen: 'campaign', campaign }
    case 'category':
      return { screen: 'category', category: slug(v) || v, campaign }
    case 'product':
      return { screen: 'product', product_code: v, campaign }
    case 'home':
      return { screen: 'home', campaign }
    case 'message':
      return { screen: 'message', campaign }
    default:
      return { screen: v, campaign }
  }
}

/** 画面に表示する、FCM の data(JSON の 1 行) */
export const fcmText = (sc: AppScreen | null | undefined, campaign: string) => {
  const d = fcmData(sc, campaign)
  return d ? JSON.stringify(d) : ''
}

/** 配信カードで決めた画面、なければ既定の画面 */
export const screenOf = (links: Links, slot: LinkSlot): AppScreen | null => {
  const set = links.screens?.[slot.key]
  return set?.kind ? set : slot.defaultScreen
}

/**
 * リンク先の工程が完了しているか(「工程 n / 6」の ⑤)。
 * メール: すべてのリンクの場所に、URL として読める行き先がある(既定の URL を含む)。
 * アプリ: 通知を押したときに開く画面と、メッセージのすべてのリンクの場所に、画面の指定がそろっている
 */
export function linksComplete(slots: LinkSlot[], links: Links, push?: { tapDone: boolean }): boolean {
  if (push) return push.tapDone && slots.every((sl) => screenComplete(screenOf(links, sl)))
  return slots.every((sl) => {
    const url = ((sl.kind === 'hero' ? links.hero : links.buttons?.[sl.key]) ?? '').trim() || sl.defaultUrl
    return !!url && isUrl(url)
  })
}
