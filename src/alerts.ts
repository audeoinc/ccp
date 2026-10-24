// アラート: 配信の前に、載せる商品の在庫が持つかを見込み、持たない配信を知らせる(バックログ A1)。
// 画面を開いたときに計算する(サーバーで定期的に調べる仕組みは、まだ作らない)。
//
// 配信日の在庫の見込み = いまの在庫 − 週の販売のペース × 配信日までの週数 − それより前の配信で上乗せされる販売
//   週の販売のペース: 週ごとの実績(weekly_performances)の、直近 4 週の平均
//   配信で上乗せされる販売: 過去の配信の結果で、その商品が 1 回の配信で売れた数の平均(なければ、全商品の平均)
// 配信日に在庫がない見込み → 在庫切れ。その配信で売り切れる見込みか、残りが「何週分」を切る → 在庫僅少
import { useEffect, useMemo, useState } from 'react'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { WeeklyPerformance } from './models/weeklyPerformances'
import type { DeliveryProduct } from './models/deliveryProducts'
import { WeeklyPerformancesService } from './data/weeklyPerformances'
import { DeliveryResultsService, type DeliveryResult } from './data/deliveryResults'
import { ChangeLogsService, type ChangeLog } from './data/changeLogs'
import { STATE_SELECTED } from './items'
import { mergeResultsByCard, parseProductResults } from './results'

export type AlertKind = 'outOfStock' | 'lowStock'

/** 残りが何週分を切ったら知らせるか(既定。人ごとの設定は src/alertSettings.ts) */
export const LOW_STOCK_WEEKS = 2

/** 配信に、商品が載っている場所 */
export interface Placement {
  /** 配信の商品の行(delivery_products)の ID */
  rowId: string
  productId: string
  /** セクションの番号(0 から) */
  section: number
}

/** アラートの影響を受ける配信 1 本 */
export interface AffectedDelivery {
  card: DeliveryCard
  /** 商品が載っているセクション(0 から。同じ商品が 2 か所なら、いくつも) */
  sections: number[]
  /** 配信日の在庫の見込み(この配信の前) */
  projected: number
  /** この配信のあとの在庫の見込み */
  after: number
  /** 配信日の在庫が、何週分か(販売のペースが分からなければ undefined) */
  weeksLeft?: number
  /** この配信で困ること: 配信日に在庫がない / この配信で売り切れる / 残りが少ない */
  problem: 'none' | 'soldOut' | 'low'
}

export interface StockAlert {
  /** 種類と商品で決まる ID(画面で選ぶのに使う) */
  id: string
  kind: AlertKind
  product: Product
  stock: number
  /** 週の販売のペース(直近 4 週の平均。分からなければ 0) */
  weeklyRate: number
  /** 1 回の配信で上乗せされる販売の見込み */
  uplift: number
  /** 影響を受ける配信(まだ送っていないもの。日付の順) */
  deliveries: AffectedDelivery[]
}

const DAY = 24 * 3600_000

/** 在庫の見込みの計算に使う部品(アラートと、差し替えの候補の両方で使う) */
export interface StockModel {
  /** 週の販売のペース(直近 4 週の平均。分からなければ 0) */
  rateOf: (p: Product) => number
  /** 1 回の配信で上乗せされる販売の見込み */
  upliftOf: (p: Product) => number
  /** その日時の在庫の見込み(それより前の、まだ送っていない配信の上乗せを引く。except の配信は数えない) */
  projectAt: (p: Product, when: string, except?: string) => { projected: number; weeksLeft?: number }
  /** その日を含む週と、その前の週に、商品を載せた配信の数(差し替えで、訴求が多すぎにならないか) */
  exposures: (productId: string, when: string) => { thisWeek: number; lastWeek: number }
}

export function makeStockModel(args: {
  cards: DeliveryCard[]
  placements: Map<string, Placement[]>
  weekly: WeeklyPerformance[]
  results: DeliveryResult[]
  now?: Date
}): StockModel {
  const { cards, placements, weekly, results, now = new Date() } = args
  const byCode = new Map<string, WeeklyPerformance[]>()
  for (const w of weekly) if (w.product_code) byCode.set(w.product_code, [...(byCode.get(w.product_code) ?? []), w])
  const rateOf = (p: Product) => {
    const code = p.product_code
    const rows = (code ? byCode.get(code) : undefined)?.slice().sort((a, b) => (b.week_start ?? '').localeCompare(a.week_start ?? '')).slice(0, 4) ?? []
    return rows.length ? rows.reduce((s, r) => s + (r.units ?? 0), 0) / rows.length : 0
  }
  const sold = new Map<string, number[]>()
  for (const r of results) for (const x of parseProductResults(r.products)) sold.set(x.productId, [...(sold.get(x.productId) ?? []), x.units])
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0)
  const overall = avg([...sold.values()].flat())
  const upliftOf = (p: Product) => {
    const xs = sold.get(p.id)
    return xs && xs.length ? avg(xs) : overall || rateOf(p) * 0.5
  }
  const cardAt = new Map(cards.map((c) => [c.id, c.scheduled_at ?? '']))
  const projectAt = (p: Product, when: string, except?: string) => {
    const t = new Date(when).getTime()
    const rate = rateOf(p)
    let earlier = 0
    for (const [cardId, list] of placements) {
      const at = new Date(cardAt.get(cardId) || 0).getTime()
      if (cardId === except || at < now.getTime() || at >= t) continue
      if (list.some((x) => x.productId === p.id)) earlier++
    }
    const days = Math.max(0, (t - now.getTime()) / DAY)
    const projected = Math.round((p.stock ?? 0) - (rate * days) / 7 - earlier * upliftOf(p))
    return { projected, weeksLeft: rate > 0 ? Math.max(0, projected) / rate : undefined }
  }
  const exposures = (productId: string, when: string) => {
    const d = new Date(when)
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).getTime()
    let thisWeek = 0
    let lastWeek = 0
    for (const [cardId, list] of placements) {
      if (!list.some((x) => x.productId === productId)) continue
      const at = new Date(cardAt.get(cardId) || 0).getTime()
      if (at >= start && at < start + 7 * DAY) thisWeek++
      else if (at >= start - 7 * DAY && at < start) lastWeek++
    }
    return { thisWeek, lastWeek }
  }
  return { rateOf, upliftOf, projectAt, exposures }
}

/** 在庫のアラートを計算する */
export function computeStockAlerts(args: {
  cards: DeliveryCard[]
  products: Product[]
  placements: Map<string, Placement[]>
  weekly: WeeklyPerformance[]
  results: DeliveryResult[]
  now?: Date
  /** 在庫僅少の週数(配信ごと。国の基準 ST2 のため、配信の国で変わる) */
  lowWeeks?: number | ((card: DeliveryCard) => number)
}): StockAlert[] {
  const { cards, products, placements, now = new Date(), lowWeeks = LOW_STOCK_WEEKS } = args
  const model = makeStockModel(args)

  // まだ送っていない配信(日付の順)に載っている商品
  const upcoming = cards
    .filter((c) => c.scheduled_at && new Date(c.scheduled_at).getTime() >= now.getTime())
    .sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))
  const byProduct = new Map<string, { card: DeliveryCard; sections: number[] }[]>()
  for (const c of upcoming) {
    const here = new Map<string, number[]>()
    for (const p of placements.get(c.id) ?? []) here.set(p.productId, [...(here.get(p.productId) ?? []), p.section])
    for (const [pid, sections] of here) byProduct.set(pid, [...(byProduct.get(pid) ?? []), { card: c, sections }])
  }

  const alerts: StockAlert[] = []
  for (const [pid, list] of byProduct) {
    const product = products.find((p) => p.id === pid)
    if (!product) continue
    const stock = product.stock ?? 0
    const rate = model.rateOf(product)
    const uplift = model.upliftOf(product)
    let before = 0 // それより前の配信で上乗せされる販売の合計
    const deliveries: AffectedDelivery[] = list.map(({ card, sections }) => {
      const days = Math.max(0, (new Date(card.scheduled_at!).getTime() - now.getTime()) / DAY)
      const projected = Math.round(stock - (rate * days) / 7 - before)
      const after = Math.round(projected - uplift)
      before += uplift
      const weeksLeft = rate > 0 ? Math.max(0, projected) / rate : undefined
      const problem: AffectedDelivery['problem'] =
        projected <= 0 ? 'soldOut' : after < 0 || (weeksLeft !== undefined && weeksLeft < (typeof lowWeeks === 'function' ? lowWeeks(card) : lowWeeks)) ? 'low' : 'none'
      return { card, sections, projected, after, weeksLeft, problem }
    })
    const hit = deliveries.filter((d) => d.problem !== 'none')
    if (stock > 0 && hit.length === 0) continue
    const kind: AlertKind = stock <= 0 || hit.some((d) => d.problem === 'soldOut') ? 'outOfStock' : 'lowStock'
    alerts.push({ id: `${kind}:${pid}`, kind, product, stock, weeklyRate: rate, uplift, deliveries: stock <= 0 ? deliveries : hit })
  }
  // 在庫切れを先に、そのあとは、影響がいちばん早い配信の順
  return alerts.sort((a, b) => (a.kind === b.kind ? (a.deliveries[0]?.card.scheduled_at ?? '').localeCompare(b.deliveries[0]?.card.scheduled_at ?? '') : a.kind === 'outOfStock' ? -1 : 1))
}

/**
 * アラートを読む(画面を開いたときに計算する)。配信カード・商品・配信の商品の行は App が読んだものを使い
 * (配信の商品を、App とここで 2 回読まないため)、週ごとの実績・配信の結果は、ここで読む。
 * 実績・結果は配信カードの保存では変わらないので、reloadKey(結果を取り込んだあとなど)が変わったときだけ読み直す
 */
export function useStockAlerts(
  cards: DeliveryCard[],
  products: Product[],
  productRows: DeliveryProduct[],
  reloadKey: unknown,
  lowWeeks: number | ((card: DeliveryCard) => number) = LOW_STOCK_WEEKS,
) {
  const [weekly, setWeekly] = useState<WeeklyPerformance[]>([])
  const [results, setResults] = useState<DeliveryResult[]>([])
  // 配信の商品(載っている場所)。選定済みの行だけ
  const placements = useMemo(() => {
    const map = new Map<string, Placement[]>()
    for (const r of productRows) {
      if (!r.delivery_card_id || !r.product_id || r.state !== STATE_SELECTED) continue
      map.set(r.delivery_card_id, [...(map.get(r.delivery_card_id) ?? []), { rowId: r.id, productId: r.product_id, section: r.section ?? 0 }])
    }
    return map
  }, [productRows])
  useEffect(() => {
    WeeklyPerformancesService.getAll()
      .then((res) => res.success && setWeekly(res.data ?? []))
      .catch(() => undefined)
    DeliveryResultsService.getAll()
      // AB テストの配信は、案ごとの行を配信 1 本に合計する(売れた数を、配信ごとの実績として数えるため)
      .then((res) => res.success && setResults(mergeResultsByCard(res.data ?? [])))
      .catch(() => undefined)
  }, [reloadKey])
  return useMemo(
    () => ({
      alerts: computeStockAlerts({ cards, products, placements, weekly, results, lowWeeks }),
      model: makeStockModel({ cards, placements, weekly, results }),
      placements,
    }),
    [cards, products, placements, weekly, results, lowWeeks],
  )
}

// ---- 変更のアラート(MD 方針の変更・日程の変更)。変更の記録(change_logs)から作る。対応済みにしたものは出さない

/** 変わった項目 1 つ */
export interface ChangeItem {
  field: string
  before: string
  after: string
}

export interface ChangeAlert {
  /** policy:<商品コード> / date:<配信 ID> */
  id: string
  kind: 'policyChanged' | 'dateChanged'
  /** まとめた変更の記録(対応済みにするときに、すべてを対応済みにする) */
  logs: ChangeLog[]
  changes: ChangeItem[]
  /** いちばん新しい変更の日時・人 */
  changedAt: string
  actor?: string
  /** 方針の変更: 商品 */
  product?: Product
  /** 日程の変更: 移した配信 */
  card?: DeliveryCard
  /** 影響を受ける配信(まだ送っていないもの。日程の変更は、移した配信と、移した先の日の同じチャネルの配信) */
  deliveries: { card: DeliveryCard; sections: number[]; note?: 'moved' | 'sameDay' }[]
}

/** 主力の段階か(日本語・英語のどちらでも入っている) */
export const isLeadStage = (s?: string) => s === '主力' || s === 'Core'

const localDay = (iso?: string) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function computeChangeAlerts(args: {
  logs: ChangeLog[]
  cards: DeliveryCard[]
  products: Product[]
  placements: Map<string, Placement[]>
  now?: Date
}): ChangeAlert[] {
  const { logs, cards, products, placements, now = new Date() } = args
  const open = logs.filter((l) => !l.resolved_at).sort((a, b) => (a.created_on ?? '').localeCompare(b.created_on ?? ''))
  const upcoming = cards.filter((c) => c.scheduled_at && new Date(c.scheduled_at).getTime() >= now.getTime())
  const out: ChangeAlert[] = []
  const group = (key: (l: ChangeLog) => string | undefined, kind: ChangeLog['kind']) => {
    const m = new Map<string, ChangeLog[]>()
    for (const l of open) {
      const k = l.kind === kind ? key(l) : undefined
      if (k) m.set(k, [...(m.get(k) ?? []), l])
    }
    return m
  }
  // 項目ごとに、最初の変更前と、最後の変更後(何度か変わっても、1 つにまとめる。元に戻ったものは出さない)
  const merge = (ls: ChangeLog[]): ChangeItem[] => {
    const by = new Map<string, ChangeItem>()
    for (const l of ls) {
      const f = l.field ?? ''
      const prev = by.get(f)
      by.set(f, { field: f, before: prev ? prev.before : (l.before_value ?? ''), after: l.after_value ?? '' })
    }
    return [...by.values()].filter((c) => c.before !== c.after)
  }

  // MD 方針の変更: 商品ごと。影響 = その商品を載せている、まだ送っていない配信。載せていなくても、主力になったなら出す(推すはずの商品)
  for (const [code, ls] of group((l) => l.product_code, 'policy')) {
    const product = products.find((p) => p.product_code === code)
    const changes = merge(ls)
    if (!product || changes.length === 0) continue
    const deliveries = upcoming.flatMap((c) => {
      const sections = (placements.get(c.id) ?? []).filter((p) => p.productId === product.id).map((p) => p.section)
      return sections.length > 0 ? [{ card: c, sections }] : []
    })
    const toLead = changes.some((c) => c.field === 'stage' && isLeadStage(c.after))
    if (deliveries.length === 0 && !toLead) continue
    const last = ls[ls.length - 1]
    out.push({ id: `policy:${code}`, kind: 'policyChanged', logs: ls, changes, changedAt: last.created_on ?? '', actor: last.actor, product, deliveries })
  }

  // 日程の変更: 配信ごと。影響 = 移した配信と、移した先の日の、同じ国・チャネルの配信(重なり)
  for (const [cardId, ls] of group((l) => l.delivery_card_id, 'date')) {
    const card = upcoming.find((c) => c.id === cardId)
    const changes = merge(ls)
    if (!card || changes.length === 0) continue
    const sameDay = upcoming.filter(
      (c) => c !== card && localDay(c.scheduled_at) === localDay(card.scheduled_at) && c.channel === card.channel && c.country === card.country,
    )
    const last = ls[ls.length - 1]
    out.push({
      id: `date:${cardId}`,
      kind: 'dateChanged',
      logs: ls,
      changes,
      changedAt: last.created_on ?? '',
      actor: last.actor,
      card,
      deliveries: [{ card, sections: [], note: 'moved' as const }, ...sameDay.map((c) => ({ card: c, sections: [], note: 'sameDay' as const }))],
    })
  }
  // 新しい変更から
  return out.sort((a, b) => b.changedAt.localeCompare(a.changedAt))
}

/** 変更のアラートを読む(変更の記録を読み、計算する)。reloadKey が変わったら読み直す(配信カードを読み直したとき。日程の変更は、配信の保存でサーバーが残すため) */
export function useChangeAlerts(cards: DeliveryCard[], products: Product[], placements: Map<string, Placement[]>, reloadKey: unknown) {
  const [logs, setLogs] = useState<ChangeLog[]>([])
  const [tick, setTick] = useState(0)
  useEffect(() => {
    // 日程・方針の変更だけを読む(中身の変更 edit は配信カードの変更の履歴のためのもので、数が多い。X1)。
    // 対応済みも読む(アラートの「対応済み」のタブに出すため)
    ChangeLogsService.getAll({ filter: "kind ne 'edit'" })
      .then((res) => res.success && setLogs(res.data ?? []))
      .catch(() => undefined)
  }, [reloadKey, tick])
  const changeAlerts = useMemo(() => computeChangeAlerts({ logs, cards, products, placements }), [logs, cards, products, placements])
  /** 対応済みにする(まとめた変更の記録を、すべて) */
  const resolve = async (alert: ChangeAlert, by: string, note: string) => {
    const at = new Date().toISOString()
    for (const l of alert.logs) {
      const res = await ChangeLogsService.update(l.id, { resolved_at: at, resolved_by: by, resolve_note: note })
      if (!res.success) throw new Error(res.error?.message ?? 'Could not mark as handled')
    }
    setTick((n) => n + 1)
  }
  return { changeAlerts, logs, resolve, reload: () => setTick((n) => n + 1) }
}
