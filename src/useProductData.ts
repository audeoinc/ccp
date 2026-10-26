import { useEffect, useState } from 'react'
import { WeeklyPerformancesService } from './data/weeklyPerformances'
import { ProductPoliciesService } from './data/productPolicies'
import { StockCoverService, type StockCoverInputs } from './data/stockCover'
import { tr } from './i18n'

export interface WeeklyPoint {
  /** 週の開始日(YYYY-MM-DD) */
  week: string
  units: number
  revenue: number
  stock: number
}

export interface ProductPolicy {
  policy: string
  promoPlan: string
  promoPeriod: string
  stage: string
}

export interface ProductData {
  weekly: WeeklyPoint[]
  policy?: ProductPolicy
}

// 同じ商品を開き直したときに、取り直さない(画面を開いている間だけ有効)
const cache = new Map<string, ProductData>()
// 読んでいる途中のもの(詳しい情報と、入れ替えの行の在庫の持ちが、同じ商品を同時に読んでも 1 回にする)
const loading = new Map<string, Promise<ProductData>>()

/** BigQuery から取り込んだあとに、覚えておいた週次実績を捨てる(開き直したときに、新しい値を読むように) */
export function clearProductDataCache(): void {
  cache.clear()
  loading.clear()
  covers.clear()
}

/** 在庫の持ち(いまの在庫で何週分売れるか。直近 4 週の販売数の合計 last4 を 4 で割った平均で割る)。売れていない・在庫が分からないときは undefined */
export function coverOf(last4: number, latestStock: number | undefined): number | undefined {
  return last4 > 0 && latestStock !== undefined ? Math.round((latestStock / (last4 / 4)) * 10) / 10 : undefined
}

/** 週次実績(古い順)からの在庫の持ち(詳しい情報の「在庫の持ち」) */
export function stockCover(weekly: WeeklyPoint[], fallbackStock?: number): number | undefined {
  const last4 = weekly.slice(-4).reduce((n, w) => n + w.units, 0)
  return coverOf(last4, weekly.length > 0 ? weekly[weekly.length - 1].stock : fallbackStock)
}

// ---- 在庫の持ちだけを、並べた行の分まとめて読む(商品のフロートの入れ替えの行。行ごとに週次実績を読むと、並べた数だけ問い合わせが増えたため)
// 同じ間に頼まれた商品を集めて、1 回(多ければ 500 件ずつ)で読む。読んだ値は覚えておく(実績がない商品は null)
const covers = new Map<string, StockCoverInputs[string] | null>()
const asked = new Set<string>()
const coverListeners = new Set<() => void>()
let flushTimer: ReturnType<typeof setTimeout> | undefined

function askCover(code: string) {
  if (covers.has(code) || asked.has(code)) return
  asked.add(code)
  if (flushTimer === undefined) flushTimer = setTimeout(flushCovers, 30)
}

async function flushCovers() {
  flushTimer = undefined
  const codes = [...asked].filter((c) => !covers.has(c))
  asked.clear()
  for (let i = 0; i < codes.length; i += 500) {
    const part = codes.slice(i, i + 500)
    try {
      const got = await StockCoverService.get(part)
      for (const c of part) covers.set(c, got[c] ?? null)
    } catch {
      // 読めなかったときは出さない(次に開いたときに、読み直す)
    }
  }
  for (const l of coverListeners) l()
}

/**
 * 在庫の持ち(行に出す分)。詳しい情報の「在庫の持ち」と同じ数になるよう、計算は coverOf を通し、
 * 週の並び(新しい順に 4 週)と、在庫・販売数が空のときの扱い(0)も、詳しい情報の読み方と同じにする
 */
export function useStockCover(code?: string): number | undefined {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!code) return
    const l = () => setTick((n) => n + 1)
    coverListeners.add(l)
    askCover(code)
    return () => {
      coverListeners.delete(l)
    }
  }, [code])
  const v = code ? covers.get(code) : undefined
  return v ? coverOf(v.last4, v.stock ?? 0) : undefined
}

function loadShared(code: string): Promise<ProductData> {
  const going = loading.get(code)
  if (going) return going
  const p = load(code).finally(() => loading.delete(code))
  loading.set(code, p)
  return p
}

async function load(code: string): Promise<ProductData> {
  const safe = code.replace(/'/g, "''")
  const [weekly, policy] = await Promise.all([
    WeeklyPerformancesService.getAll({
      filter: `product_code eq '${safe}'`,
      // 直近の 60 週(新しい順に読んで、古い順に並べ直す。在庫の持ちの窓口と同じ並び)
      orderBy: ['week_start desc'],
      select: ['week_start', 'units', 'revenue', 'stock'],
      top: 60,
    }),
    ProductPoliciesService.getAll({
      filter: `product_code eq '${safe}'`,
      select: ['policy', 'promo_plan', 'promo_period', 'stage'],
      top: 1,
    }),
  ])
  if (!weekly.success) throw new Error(weekly.error?.message ?? tr('売上・在庫の実績を取得できませんでした', 'Failed to load sales and stock data'))
  const pol = policy.success ? policy.data?.[0] : undefined
  return {
    weekly: [...(weekly.data ?? [])].reverse().map((w) => ({
      week: (w.week_start ?? '').slice(0, 10),
      units: w.units ?? 0,
      revenue: w.revenue ?? 0,
      stock: w.stock ?? 0,
    })),
    policy: pol
      ? { policy: pol.policy ?? '', promoPlan: pol.promo_plan ?? '', promoPeriod: pol.promo_period ?? '', stage: pol.stage ?? '' }
      : undefined,
  }
}

/** 商品コードの、週次実績と販売方針を読み込む(開いたときに 1 回。結果は覚えておく) */
export function useProductData(code?: string) {
  const [state, setState] = useState<{ data?: ProductData; loading: boolean; error?: string }>(() => ({
    data: code ? cache.get(code) : undefined,
    loading: !!code && !cache.has(code),
  }))

  useEffect(() => {
    if (!code || cache.has(code)) return
    let cancelled = false
    loadShared(code)
      .then((data) => {
        cache.set(code, data)
        if (!cancelled) setState({ data, loading: false })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ loading: false, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
  }, [code])

  return state
}
