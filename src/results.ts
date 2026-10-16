// 配信結果の画面(ResultsPage)で使う計算と、CSV の読み書き。画面の部品とは分けておく
import type { DeliveryCard } from './models/deliveryCards'
import type { DeliveryResult, LinkResults, ProductResult } from './data/deliveryResults'
import { CHANNEL_PUSH } from './status'
import { DEFAULT_PUSH_TEMPLATE, getTemplate, templateFromValue } from './templates'
import { parseCsv } from './csv'
import { themeTypeOf } from './themeTypes'

export const COUNTRY_US = 'US'

/** 配信 1 本と、その結果を並べた行 */
export interface ResultRow {
  card: DeliveryCard
  result: DeliveryResult
  /** 開封率(アプリは出さない) */
  openRate?: number
  /** クリック率(アプリは、通知をタップした率) */
  clickRate?: number
  revenue: number
  /** 前の週の、同じ国・チャネルの配信の売上の平均と比べた増減(割合) */
  vsPrevWeek?: number
  /** 前年と比べた増減(割合) */
  vsLastYear?: number
}

const ratio = (a?: number, b?: number) => (a !== undefined && b ? a / b : undefined)
const change = (now: number, before?: number) => (before ? now / before - 1 : undefined)
const ms = (iso?: string) => (iso ? new Date(iso).getTime() : 0)
const WEEK = 7 * 24 * 3600_000

/** 商品ごとの結果(JSON)を読む。サービスのファイルは、撮影用のビルドで差し替わるので、ここに置く */
export function parseProductResults(v?: string): ProductResult[] {
  if (!v) return []
  try {
    const a = JSON.parse(v) as ProductResult[]
    return Array.isArray(a) ? a.filter((x) => x && typeof x.productId === 'string') : []
  } catch {
    return []
  }
}

/** リンクごとのクリック(JSON)を読む */
export function parseLinkResults(v?: string): LinkResults {
  if (!v) return {}
  try {
    const o = JSON.parse(v) as LinkResults
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

/** 割合の表記(1 桁の小数) */
export const pct = (v?: number) => (v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)

/** 送った日時(結果になければ、配信の予定日時) */
export const sentAtOf = (r: ResultRow) => r.result.sent_at ?? r.card.scheduled_at

export const isPush = (c: DeliveryCard) => c.channel === CHANNEL_PUSH

/** 配信のテンプレートの ID */
export const templateIdOf = (c: DeliveryCard): string => c.layout_key || (isPush(c) ? DEFAULT_PUSH_TEMPLATE : templateFromValue(c.email_template))

/** 配信のテンプレートの名前 */
export function templateName(c: DeliveryCard): string {
  return getTemplate(templateIdOf(c)).label
}

// ---- 過去の配信と比べる

/**
 * 位置ごとのクリックの割合(メッセージの中のクリックの合計に対して)。
 * 商品は、載せた商品ではなく「何番目の枠か」で数える(同じテンプレートなら、枠の位置が同じなので、回をまたいで比べられる)。
 * キー: hero / button:番号 / slot:番号(0 から)/ other
 */
export function positionShares(row: ResultRow, productIds: string[]): Map<string, number> {
  const links = parseLinkResults(row.result.links)
  const prod = new Map(parseProductResults(row.result.products).map((p) => [p.productId, p.clicks]))
  const raw = new Map<string, number>()
  if (links.hero !== undefined) raw.set('hero', links.hero)
  ;(links.buttons ?? []).forEach((v, i) => raw.set(`button:${i}`, v))
  productIds.forEach((id, i) => raw.set(`slot:${i}`, prod.get(id) ?? 0))
  if (links.other) raw.set('other', links.other)
  const total = [...raw.values()].reduce((s, v) => s + v, 0)
  return new Map([...raw].map(([k, v]) => [k, total ? v / total : 0]))
}

/** 位置のキーの、画面の名前 */
export function positionLabel(key: string, t: (ja: string, en: string) => string): string {
  if (key === 'hero') return t('メイン画像', 'Hero image')
  if (key === 'other') return t('その他(フッターなど)', 'Other (footer, etc.)')
  const [kind, n] = key.split(':')
  const i = Number(n) + 1
  return kind === 'button' ? t(`ボタン ${i}`, `Button ${i}`) : t(`商品の枠 ${i}`, `Product slot ${i}`)
}

/** 比べる相手の選び方: 同じテンプレート / 同じテーマの種類 */
export type CompareBy = 'template' | 'themeType'

/** 同じ条件(同じ国・チャネルと、同じテンプレートか、同じテーマの種類)で、この配信より前に送った配信を、新しい順に n 本 */
export function pastSame(all: ResultRow[], row: ResultRow, n: number, by: CompareBy = 'template'): ResultRow[] {
  const at = new Date(sentAtOf(row) ?? 0).getTime()
  const key = (c: DeliveryCard) => (by === 'template' ? templateIdOf(c) : themeTypeOf(c).type)
  const mine = key(row.card)
  return all
    .filter(
      (o) =>
        o !== row &&
        o.card.country === row.card.country &&
        o.card.channel === row.card.channel &&
        key(o.card) === mine &&
        new Date(sentAtOf(o) ?? 0).getTime() < at,
    )
    .sort((a, b) => new Date(sentAtOf(b) ?? 0).getTime() - new Date(sentAtOf(a) ?? 0).getTime())
    .slice(0, n)
}

/** 結果のある配信を、行にする(前の週との比較は、同じ国・チャネルの、7 日前までの配信と比べる) */
export function toResultRows(cards: DeliveryCard[], results: DeliveryResult[]): ResultRow[] {
  const byCard = new Map(cards.map((c) => [c.id, c]))
  const rows = results
    .filter((r) => r.delivery_card_id && byCard.has(r.delivery_card_id))
    .map((r): ResultRow => {
      const card = byCard.get(r.delivery_card_id!)!
      const push = isPush(card)
      return {
        card,
        result: r,
        openRate: push ? undefined : ratio(r.opens, r.recipients),
        clickRate: ratio(push ? r.opens : r.clicks, r.recipients),
        revenue: Number(r.revenue ?? 0),
        vsLastYear: change(Number(r.revenue ?? 0), Number(r.last_year_revenue ?? 0) || undefined),
      }
    })
  for (const row of rows) {
    const at = ms(row.result.sent_at ?? row.card.scheduled_at)
    const before = rows.filter((o) => {
      const t = ms(o.result.sent_at ?? o.card.scheduled_at)
      return o !== row && o.card.channel === row.card.channel && o.card.country === row.card.country && t < at && t >= at - WEEK
    })
    if (before.length > 0) row.vsPrevWeek = change(row.revenue, before.reduce((s, o) => s + o.revenue, 0) / before.length)
  }
  return rows.sort((a, b) => ms(a.result.sent_at ?? a.card.scheduled_at) - ms(b.result.sent_at ?? b.card.scheduled_at))
}

/** まとめた行(テーマ・テンプレート・商品ごと) */
export interface GroupRow {
  key: string
  label: string
  deliveries: number
  recipients: number
  /** 開封率の分母(メールの送った数だけ。アプリには開封がないため) */
  emailRecipients: number
  /** メールの開封の数 */
  opens: number
  clicks: number
  revenue: number
  lastYear: number
  /** 商品ごとのときだけ: 売れた数 */
  units?: number
}

export function groupRows(rows: ResultRow[], by: 'theme' | 'template', label: (r: ResultRow) => string): GroupRow[] {
  const map = new Map<string, GroupRow>()
  for (const r of rows) {
    const key = label(r) || '—'
    const g = map.get(key) ?? { key, label: key, deliveries: 0, recipients: 0, emailRecipients: 0, opens: 0, clicks: 0, revenue: 0, lastYear: 0 }
    g.deliveries++
    g.recipients += r.result.recipients ?? 0
    if (!isPush(r.card)) {
      g.emailRecipients += r.result.recipients ?? 0
      g.opens += r.result.opens ?? 0
    }
    g.clicks += (isPush(r.card) ? r.result.opens : r.result.clicks) ?? 0
    g.revenue += r.revenue
    g.lastYear += Number(r.result.last_year_revenue ?? 0)
    map.set(key, g)
  }
  void by
  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

/** 商品ごとにまとめる(結果の、商品ごとの数字を足す) */
export function productRows(rows: ResultRow[], productName: (id: string) => string, parse: (v?: string) => { productId: string; clicks: number; units: number; revenue: number }[]): GroupRow[] {
  const map = new Map<string, GroupRow>()
  for (const r of rows) {
    for (const p of parse(r.result.products)) {
      const g = map.get(p.productId) ?? { key: p.productId, label: productName(p.productId), deliveries: 0, recipients: 0, emailRecipients: 0, opens: 0, clicks: 0, revenue: 0, lastYear: 0, units: 0 }
      g.deliveries++
      g.clicks += p.clicks
      g.units = (g.units ?? 0) + p.units
      g.revenue += p.revenue
      map.set(p.productId, g)
    }
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

// ---- CSV の取り込み

/** 取り込む CSV の列(見出し)。配信は、配信名と配信日(YYYY-MM-DD)で探す */
export const IMPORT_COLUMNS = ['delivery', 'date', 'sent_at', 'recipients', 'opens', 'clicks', 'orders', 'revenue', 'last_year_revenue'] as const

export interface ImportedResult {
  cardId: string
  fields: Partial<DeliveryResult>
}

/** CSV を読んで、配信ごとの結果にする。配信が見つからない行は、errors に入れる */
export function parseResultsCsv(text: string, cards: DeliveryCard[]): { rows: ImportedResult[]; errors: string[] } {
  const rows: ImportedResult[] = []
  const errors: string[] = []
  const num = (v?: string) => (v === undefined || v.trim() === '' ? undefined : Number(v.replace(/[,$¥]/g, '')))
  parseCsv(text).forEach((r, i) => {
    const name = (r.delivery ?? '').trim()
    const date = (r.date ?? '').trim().slice(0, 10)
    const card = cards.find((c) => c.name === name && (!date || (c.scheduled_at ?? '').slice(0, 10) === date || localDate(c.scheduled_at) === date))
    if (!card) {
      errors.push(`${i + 2}: ${name} ${date}`)
      return
    }
    const fields: Partial<DeliveryResult> = {
      sent_at: r.sent_at ? new Date(r.sent_at).toISOString() : card.scheduled_at,
      recipients: num(r.recipients),
      opens: num(r.opens),
      clicks: num(r.clicks),
      orders: num(r.orders),
      revenue: num(r.revenue),
      last_year_revenue: num(r.last_year_revenue),
    }
    rows.push({ cardId: card.id, fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && !Number.isNaN(v))) })
  })
  return { rows, errors }
}

/** ブラウザの時刻での日付(YYYY-MM-DD) */
export function localDate(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 表の CSV を書き出す */
export function downloadTable(head: string[], body: (string | number)[][], filename: string) {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const text = String.fromCharCode(0xfeff) + [head, ...body].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
