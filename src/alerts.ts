// アラート: 配信の前に、載せる商品の在庫が持つかを見込み、持たない配信を知らせる(バックログ A1)。
// 画面を開いたときに計算する(サーバーで定期的に調べる仕組みは、まだ作らない)。
//
// 配信日の在庫の見込み = いまの在庫 − 週の販売のペース × 配信日までの週数 − それより前の配信で上乗せされる販売
//   週の販売のペース: 週ごとの実績(cr854_weeklyperformances)の、直近 4 週の平均
//   配信で上乗せされる販売: 過去の配信の結果で、その商品が 1 回の配信で売れた数の平均(なければ、全商品の平均)
// 配信日に在庫がない見込み → 在庫切れ。その配信で売り切れる見込みか、残りが「何週分」を切る → 在庫僅少
import { useEffect, useMemo, useState } from 'react'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_weeklyperformances } from './generated/models/Cr854_weeklyperformancesModel'
import { Cr854_deliveryproductsService } from './generated/services/Cr854_deliveryproductsService'
import { Cr854_weeklyperformancesService } from './generated/services/Cr854_weeklyperformancesService'
import { Cr854_deliveryresultsService, type Cr854_deliveryresults } from './gcpdata/Cr854_deliveryresultsService'
import { STATE_SELECTED } from './items'
import { parseProductResults } from './results'

export type AlertKind = 'outOfStock' | 'lowStock'

/** 残りが何週分を切ったら知らせるか(設定は A6 で作る。それまでは固定) */
export const LOW_STOCK_WEEKS = 2

/** 配信に、商品が載っている場所 */
export interface Placement {
  /** 配信の商品の行(cr854_deliveryproducts)の ID */
  rowId: string
  productId: string
  /** セクションの番号(0 から) */
  section: number
}

/** アラートの影響を受ける配信 1 本 */
export interface AffectedDelivery {
  card: Cr854_deliverycards
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
  product: Cr854_products
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
  rateOf: (p: Cr854_products) => number
  /** 1 回の配信で上乗せされる販売の見込み */
  upliftOf: (p: Cr854_products) => number
  /** その日時の在庫の見込み(それより前の、まだ送っていない配信の上乗せを引く。except の配信は数えない) */
  projectAt: (p: Cr854_products, when: string, except?: string) => { projected: number; weeksLeft?: number }
  /** その日を含む週と、その前の週に、商品を載せた配信の数(差し替えで、訴求が多すぎにならないか) */
  exposures: (productId: string, when: string) => { thisWeek: number; lastWeek: number }
}

export function makeStockModel(args: {
  cards: Cr854_deliverycards[]
  placements: Map<string, Placement[]>
  weekly: Cr854_weeklyperformances[]
  results: Cr854_deliveryresults[]
  now?: Date
}): StockModel {
  const { cards, placements, weekly, results, now = new Date() } = args
  const byCode = new Map<string, Cr854_weeklyperformances[]>()
  for (const w of weekly) if (w.cr854_productcode) byCode.set(w.cr854_productcode, [...(byCode.get(w.cr854_productcode) ?? []), w])
  const rateOf = (p: Cr854_products) => {
    const code = p.cr854_productcode
    const rows = (code ? byCode.get(code) : undefined)?.slice().sort((a, b) => (b.cr854_weekstart ?? '').localeCompare(a.cr854_weekstart ?? '')).slice(0, 4) ?? []
    return rows.length ? rows.reduce((s, r) => s + (r.cr854_units ?? 0), 0) / rows.length : 0
  }
  const sold = new Map<string, number[]>()
  for (const r of results) for (const x of parseProductResults(r.cr854_products)) sold.set(x.productId, [...(sold.get(x.productId) ?? []), x.units])
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0)
  const overall = avg([...sold.values()].flat())
  const upliftOf = (p: Cr854_products) => {
    const xs = sold.get(p.cr854_productid)
    return xs && xs.length ? avg(xs) : overall || rateOf(p) * 0.5
  }
  const cardAt = new Map(cards.map((c) => [c.cr854_deliverycardid, c.cr854_scheduledat ?? '']))
  const projectAt = (p: Cr854_products, when: string, except?: string) => {
    const t = new Date(when).getTime()
    const rate = rateOf(p)
    let earlier = 0
    for (const [cardId, list] of placements) {
      const at = new Date(cardAt.get(cardId) || 0).getTime()
      if (cardId === except || at < now.getTime() || at >= t) continue
      if (list.some((x) => x.productId === p.cr854_productid)) earlier++
    }
    const days = Math.max(0, (t - now.getTime()) / DAY)
    const projected = Math.round((p.cr854_stock ?? 0) - (rate * days) / 7 - earlier * upliftOf(p))
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
  cards: Cr854_deliverycards[]
  products: Cr854_products[]
  placements: Map<string, Placement[]>
  weekly: Cr854_weeklyperformances[]
  results: Cr854_deliveryresults[]
  now?: Date
  lowWeeks?: number
}): StockAlert[] {
  const { cards, products, placements, now = new Date(), lowWeeks = LOW_STOCK_WEEKS } = args
  const model = makeStockModel(args)

  // まだ送っていない配信(日付の順)に載っている商品
  const upcoming = cards
    .filter((c) => c.cr854_scheduledat && new Date(c.cr854_scheduledat).getTime() >= now.getTime())
    .sort((a, b) => (a.cr854_scheduledat ?? '').localeCompare(b.cr854_scheduledat ?? ''))
  const byProduct = new Map<string, { card: Cr854_deliverycards; sections: number[] }[]>()
  for (const c of upcoming) {
    const here = new Map<string, number[]>()
    for (const p of placements.get(c.cr854_deliverycardid) ?? []) here.set(p.productId, [...(here.get(p.productId) ?? []), p.section])
    for (const [pid, sections] of here) byProduct.set(pid, [...(byProduct.get(pid) ?? []), { card: c, sections }])
  }

  const alerts: StockAlert[] = []
  for (const [pid, list] of byProduct) {
    const product = products.find((p) => p.cr854_productid === pid)
    if (!product) continue
    const stock = product.cr854_stock ?? 0
    const rate = model.rateOf(product)
    const uplift = model.upliftOf(product)
    let before = 0 // それより前の配信で上乗せされる販売の合計
    const deliveries: AffectedDelivery[] = list.map(({ card, sections }) => {
      const days = Math.max(0, (new Date(card.cr854_scheduledat!).getTime() - now.getTime()) / DAY)
      const projected = Math.round(stock - (rate * days) / 7 - before)
      const after = Math.round(projected - uplift)
      before += uplift
      const weeksLeft = rate > 0 ? Math.max(0, projected) / rate : undefined
      const problem: AffectedDelivery['problem'] =
        projected <= 0 ? 'soldOut' : after < 0 || (weeksLeft !== undefined && weeksLeft < lowWeeks) ? 'low' : 'none'
      return { card, sections, projected, after, weeksLeft, problem }
    })
    const hit = deliveries.filter((d) => d.problem !== 'none')
    if (stock > 0 && hit.length === 0) continue
    const kind: AlertKind = stock <= 0 || hit.some((d) => d.problem === 'soldOut') ? 'outOfStock' : 'lowStock'
    alerts.push({ id: `${kind}:${pid}`, kind, product, stock, weeklyRate: rate, uplift, deliveries: stock <= 0 ? deliveries : hit })
  }
  // 在庫切れを先に、そのあとは、影響がいちばん早い配信の順
  return alerts.sort((a, b) => (a.kind === b.kind ? (a.deliveries[0]?.card.cr854_scheduledat ?? '').localeCompare(b.deliveries[0]?.card.cr854_scheduledat ?? '') : a.kind === 'outOfStock' ? -1 : 1))
}

/**
 * アラートを読む(画面を開いたときに計算する)。配信カード・商品は App が持っているものを使い、
 * 週ごとの実績・配信の結果・配信の商品(載っている場所)は、ここで読む。reloadKey が変わったら読み直す
 */
export function useStockAlerts(cards: Cr854_deliverycards[], products: Cr854_products[], reloadKey: unknown) {
  const [weekly, setWeekly] = useState<Cr854_weeklyperformances[]>([])
  const [results, setResults] = useState<Cr854_deliveryresults[]>([])
  const [placements, setPlacements] = useState<Map<string, Placement[]>>(new Map())
  useEffect(() => {
    Cr854_weeklyperformancesService.getAll()
      .then((res) => res.success && setWeekly(res.data ?? []))
      .catch(() => undefined)
    Cr854_deliveryresultsService.getAll()
      .then((res) => res.success && setResults(res.data ?? []))
      .catch(() => undefined)
    Cr854_deliveryproductsService.getAll()
      .then((res) => {
        if (!res.success) return
        const map = new Map<string, Placement[]>()
        for (const r of res.data ?? []) {
          if (!r._cr854_deliverycard_value || !r._cr854_product_value || r.cr854_state !== STATE_SELECTED) continue
          map.set(r._cr854_deliverycard_value, [...(map.get(r._cr854_deliverycard_value) ?? []), { rowId: r.cr854_deliveryproductid, productId: r._cr854_product_value, section: r.cr854_section ?? 0 }])
        }
        setPlacements(map)
      })
      .catch(() => undefined)
  }, [reloadKey])
  return useMemo(
    () => ({
      alerts: computeStockAlerts({ cards, products, placements, weekly, results }),
      model: makeStockModel({ cards, placements, weekly, results }),
      placements,
    }),
    [cards, products, placements, weekly, results],
  )
}
