import { useEffect, useState } from 'react'
import { WeeklyPerformancesService } from './data/weeklyPerformances'
import { ProductPoliciesService } from './data/productPolicies'
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

/** BigQuery から取り込んだあとに、覚えておいた週次実績を捨てる(開き直したときに、新しい値を読むように) */
export function clearProductDataCache(): void {
  cache.clear()
}

async function load(code: string): Promise<ProductData> {
  const safe = code.replace(/'/g, "''")
  const [weekly, policy] = await Promise.all([
    WeeklyPerformancesService.getAll({
      filter: `product_code eq '${safe}'`,
      orderBy: ['week_start asc'],
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
    weekly: (weekly.data ?? []).map((w) => ({
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
    load(code)
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
