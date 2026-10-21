// 配信結果の画面(ResultsPage)で使う計算と、CSV の読み書き。画面の部品とは分けておく
import type { DeliveryCard } from './models/deliveryCards'
import type { DeliveryResult, LinkResults, ProductResult } from './data/deliveryResults'
import { CHANNEL_PUSH } from './status'
import { DEFAULT_PUSH_TEMPLATE, baseTemplateId, getTemplate, templateFromValue } from './templates'
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
  /** AB テストの、案・区分ごとの行(AB テストでなければ空)。result は、これを合計したもの */
  parts: DeliveryResult[]
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

/** 配信のテンプレートの ID(編集の前の形の写しを使っている配信も、もとのテンプレートとしてまとめる) */
export const templateIdOf = (c: DeliveryCard): string => baseTemplateId(c.layout_key || (isPush(c) ? DEFAULT_PUSH_TEMPLATE : templateFromValue(c.email_template)))

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

// ---- AB テストの案ごとの行(X55 の段階 2)
// 結果は「配信 × 案 × 区分」で 1 行(delivery_results の variant・segment)。配信全体の数字は、その合計。
// 月・週・一覧・比べる・過去との比べは、合計した 1 行で動かす(案の行を知らなくてよいように)

const sumOf = (rows: DeliveryResult[], key: 'recipients' | 'opens' | 'clicks' | 'orders' | 'revenue' | 'last_year_revenue') => {
  const vs = rows.map((r) => r[key]).filter((v): v is number => v !== undefined && v !== null)
  return vs.length ? vs.reduce((s, v) => s + Number(v), 0) : undefined
}

/**
 * メモ(notes)を持つ行。配信全体の行(案なし)があればそれ、なければ A 案のテスト分、なければ最初の行。
 * メモの保存は、この行に書く(合計した結果の id は、この行の id)
 */
function primaryOf(rows: DeliveryResult[]): DeliveryResult {
  return rows.find((r) => !r.variant && !r.segment) ?? rows.find((r) => r.variant === 'A' && r.segment !== 'rollout') ?? rows.find((r) => r.variant === 'A') ?? rows[0]
}

/** 配信 1 本の行を合計する。案の行があれば、案のない行(配信全体)は数字に入れない(同じ受信者を 2 回数えないため) */
function mergeRows(rows: DeliveryResult[]): { result: DeliveryResult; parts: DeliveryResult[] } {
  const parts = rows.filter((r) => r.variant)
  if (parts.length === 0) return { result: rows.length === 1 ? rows[0] : { ...primaryOf(rows) }, parts: [] }
  const primary = primaryOf(rows)
  const products = new Map<string, ProductResult>()
  for (const r of parts)
    for (const x of parseProductResults(r.products)) {
      const p = products.get(x.productId) ?? { productId: x.productId, clicks: 0, units: 0, revenue: 0 }
      products.set(x.productId, { ...p, clicks: p.clicks + x.clicks, units: p.units + x.units, revenue: p.revenue + x.revenue })
    }
  const links: LinkResults = {}
  for (const r of parts) {
    const l = parseLinkResults(r.links)
    if (l.hero !== undefined) links.hero = (links.hero ?? 0) + l.hero
    if (l.other !== undefined) links.other = (links.other ?? 0) + l.other
    ;(l.buttons ?? []).forEach((v, i) => {
      links.buttons = links.buttons ?? []
      links.buttons[i] = (links.buttons[i] ?? 0) + v
    })
  }
  const sent = parts.map((r) => r.sent_at).filter((v): v is string => !!v).sort()[0]
  return {
    result: {
      id: primary.id,
      delivery_card_id: primary.delivery_card_id,
      sent_at: sent ?? primary.sent_at,
      recipients: sumOf(parts, 'recipients'),
      opens: sumOf(parts, 'opens'),
      clicks: sumOf(parts, 'clicks'),
      orders: sumOf(parts, 'orders'),
      revenue: sumOf(parts, 'revenue'),
      // 前年の売上は、配信全体の行に入れることが多い(前年には案がないため)。案の行の合計がなければ、全体の行の値
      last_year_revenue: sumOf(parts, 'last_year_revenue') ?? rows.find((r) => !r.variant)?.last_year_revenue,
      products: products.size ? JSON.stringify([...products.values()]) : undefined,
      links: Object.keys(links).length ? JSON.stringify(links) : undefined,
      notes: primary.notes,
    },
    parts,
  }
}

/** 結果の行を、配信ごとに 1 行へ合計する(結果を配信ごとに読む所で使う。AB テストでない配信は、そのまま) */
export function mergeResultsByCard(results: DeliveryResult[]): DeliveryResult[] {
  return groupByCard(results).map((rows) => mergeRows(rows).result)
}

function groupByCard(results: DeliveryResult[]): DeliveryResult[][] {
  const map = new Map<string, DeliveryResult[]>()
  for (const r of results) {
    if (!r.delivery_card_id) continue
    map.set(r.delivery_card_id, [...(map.get(r.delivery_card_id) ?? []), r])
  }
  return [...map.values()]
}

/** 結果のある配信を、行にする(前の週との比較は、同じ国・チャネルの、7 日前までの配信と比べる) */
export function toResultRows(cards: DeliveryCard[], results: DeliveryResult[]): ResultRow[] {
  const byCard = new Map(cards.map((c) => [c.id, c]))
  const rows = groupByCard(results)
    .filter((g) => byCard.has(g[0].delivery_card_id!))
    .map((g): ResultRow => {
      const { result: r, parts } = mergeRows(g)
      const card = byCard.get(r.delivery_card_id!)!
      const push = isPush(card)
      return {
        card,
        result: r,
        parts,
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

/**
 * 取り込む CSV の列(見出し)。配信は、配信名と配信日(YYYY-MM-DD)で探す。
 * variant・segment は AB テストの配信だけ(省略・空なら、配信全体の 1 行)。variant は A / B / C、segment は test(テスト分)/ rollout(勝ち案を残りに送った分)
 */
export const IMPORT_COLUMNS = ['delivery', 'date', 'sent_at', 'recipients', 'opens', 'clicks', 'orders', 'revenue', 'last_year_revenue', 'variant', 'segment'] as const

export interface ImportedResult {
  cardId: string
  /** AB テストの案と区分(なければ空。同じ配信・案・区分の行があれば上書きする) */
  variant?: string
  segment?: string
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
    const variant = (r.variant ?? '').trim().toUpperCase() || undefined
    const segment = (r.segment ?? '').trim().toLowerCase() || undefined
    if ((variant && !['A', 'B', 'C'].includes(variant)) || (segment && !['test', 'rollout'].includes(segment)) || (segment && !variant)) {
      errors.push(`${i + 2}: ${name} ${date} (variant ${variant ?? '—'} / segment ${segment ?? '—'})`)
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
    rows.push({ cardId: card.id, variant, segment, fields: { ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined && !Number.isNaN(v))), variant, segment } })
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
