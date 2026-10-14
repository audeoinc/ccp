// 配信結果の画面(ResultsPage)で使う計算と、CSV の読み書き。画面の部品とは分けておく
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_deliveryresults, ProductResult } from './gcpdata/Cr854_deliveryresultsService'
import { CHANNEL_PUSH } from './status'
import { DEFAULT_PUSH_TEMPLATE, getTemplate, templateFromValue } from './templates'
import { parseCsv } from './csv'

export const COUNTRY_US = 588230000

/** 配信 1 本と、その結果を並べた行 */
export interface ResultRow {
  card: Cr854_deliverycards
  result: Cr854_deliveryresults
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

export const isPush = (c: Cr854_deliverycards) => c.cr854_channel === CHANNEL_PUSH

/** 配信のテンプレートの名前 */
export function templateName(c: Cr854_deliverycards): string {
  const id = c.cr854_layoutkey || (isPush(c) ? DEFAULT_PUSH_TEMPLATE : templateFromValue(c.cr854_emailtemplate))
  return getTemplate(id).label
}

/** 結果のある配信を、行にする(前の週との比較は、同じ国・チャネルの、7 日前までの配信と比べる) */
export function toResultRows(cards: Cr854_deliverycards[], results: Cr854_deliveryresults[]): ResultRow[] {
  const byCard = new Map(cards.map((c) => [c.cr854_deliverycardid, c]))
  const rows = results
    .filter((r) => r._cr854_deliverycard_value && byCard.has(r._cr854_deliverycard_value))
    .map((r): ResultRow => {
      const card = byCard.get(r._cr854_deliverycard_value!)!
      const push = isPush(card)
      return {
        card,
        result: r,
        openRate: push ? undefined : ratio(r.cr854_opens, r.cr854_recipients),
        clickRate: ratio(push ? r.cr854_opens : r.cr854_clicks, r.cr854_recipients),
        revenue: Number(r.cr854_revenue ?? 0),
        vsLastYear: change(Number(r.cr854_revenue ?? 0), Number(r.cr854_lastyearrevenue ?? 0) || undefined),
      }
    })
  for (const row of rows) {
    const at = ms(row.result.cr854_sentat ?? row.card.cr854_scheduledat)
    const before = rows.filter((o) => {
      const t = ms(o.result.cr854_sentat ?? o.card.cr854_scheduledat)
      return o !== row && o.card.cr854_channel === row.card.cr854_channel && o.card.cr854_country === row.card.cr854_country && t < at && t >= at - WEEK
    })
    if (before.length > 0) row.vsPrevWeek = change(row.revenue, before.reduce((s, o) => s + o.revenue, 0) / before.length)
  }
  return rows.sort((a, b) => ms(a.result.cr854_sentat ?? a.card.cr854_scheduledat) - ms(b.result.cr854_sentat ?? b.card.cr854_scheduledat))
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
    g.recipients += r.result.cr854_recipients ?? 0
    if (!isPush(r.card)) {
      g.emailRecipients += r.result.cr854_recipients ?? 0
      g.opens += r.result.cr854_opens ?? 0
    }
    g.clicks += (isPush(r.card) ? r.result.cr854_opens : r.result.cr854_clicks) ?? 0
    g.revenue += r.revenue
    g.lastYear += Number(r.result.cr854_lastyearrevenue ?? 0)
    map.set(key, g)
  }
  void by
  return [...map.values()].sort((a, b) => b.revenue - a.revenue)
}

/** 商品ごとにまとめる(結果の、商品ごとの数字を足す) */
export function productRows(rows: ResultRow[], productName: (id: string) => string, parse: (v?: string) => { productId: string; clicks: number; units: number; revenue: number }[]): GroupRow[] {
  const map = new Map<string, GroupRow>()
  for (const r of rows) {
    for (const p of parse(r.result.cr854_products)) {
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
  fields: Partial<Cr854_deliveryresults>
}

/** CSV を読んで、配信ごとの結果にする。配信が見つからない行は、errors に入れる */
export function parseResultsCsv(text: string, cards: Cr854_deliverycards[]): { rows: ImportedResult[]; errors: string[] } {
  const rows: ImportedResult[] = []
  const errors: string[] = []
  const num = (v?: string) => (v === undefined || v.trim() === '' ? undefined : Number(v.replace(/[,$¥]/g, '')))
  parseCsv(text).forEach((r, i) => {
    const name = (r.delivery ?? '').trim()
    const date = (r.date ?? '').trim().slice(0, 10)
    const card = cards.find((c) => c.cr854_name === name && (!date || (c.cr854_scheduledat ?? '').slice(0, 10) === date || localDate(c.cr854_scheduledat) === date))
    if (!card) {
      errors.push(`${i + 2}: ${name} ${date}`)
      return
    }
    const fields: Partial<Cr854_deliveryresults> = {
      cr854_sentat: r.sent_at ? new Date(r.sent_at).toISOString() : card.cr854_scheduledat,
      cr854_recipients: num(r.recipients),
      cr854_opens: num(r.opens),
      cr854_clicks: num(r.clicks),
      cr854_orders: num(r.orders),
      cr854_revenue: num(r.revenue),
      cr854_lastyearrevenue: num(r.last_year_revenue),
    }
    rows.push({ cardId: card.cr854_deliverycardid, fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && !Number.isNaN(v))) })
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
