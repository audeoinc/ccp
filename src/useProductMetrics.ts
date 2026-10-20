// 商品のフロートの「指標」(X48)の読み込み。この商品と、そのカテゴリの、いちばん新しい週の行(src/ProductMetrics.tsx が表にする)
import { useEffect, useState } from 'react'
import type { Product } from './models/products'
import { ProductMetricsService, type ProductMetric } from './data/productMetrics'
import { CategoryMetricsService, type CategoryMetric } from './data/categoryMetrics'
import { tr } from './i18n'
import { productMarket } from './market'

export type MetricRow = Pick<ProductMetric, 'metric' | 'value' | 'rank' | 'rank_of' | 'wow' | 'mom' | 'yoy' | 'week_start' | 'imported_at'>

interface MetricsData {
  product: MetricRow[]
  category: MetricRow[]
}

// 同じ商品を開き直したときに、取り直さない(画面を開いている間だけ。取り込んだら捨てる)
const cache = new Map<string, MetricsData>()

/** 指標を取り込んだあとに、覚えておいた値を捨てる(開き直したときに、新しい値を読むように) */
export function clearProductMetricsCache(): void {
  cache.clear()
}

/** いちばん新しい週の、その市場の行だけ(取り込みは週 × 市場ごとに置き換えるので、週の中はそろっている) */
function latest<T extends MetricRow & { market?: string }>(rows: T[], market: string): T[] {
  const mine = rows.filter((r) => r.market === market)
  const week = mine.reduce((w, r) => ((r.week_start ?? '') > w ? (r.week_start ?? '') : w), '')
  return mine.filter((r) => r.week_start === week)
}

async function load(p: Product): Promise<MetricsData> {
  const market = productMarket(p)
  const q = (v: string) => `'${v.replace(/'/g, "''")}'`
  // 絞り込みは 1 つの列だけにする(撮影用のビルドの身代わりが、and を読めないため)。市場と週は、読んだあとに絞る
  const [prod, cat] = await Promise.all([
    p.product_code ? ProductMetricsService.getAll({ filter: `product_code eq ${q(p.product_code)}`, orderBy: ['week_start desc'], top: 60 }) : Promise.resolve({ success: true, data: [] as ProductMetric[], error: undefined }),
    p.category ? CategoryMetricsService.getAll({ filter: `category eq ${q(p.category)}`, orderBy: ['week_start desc'], top: 60 }) : Promise.resolve({ success: true, data: [] as CategoryMetric[], error: undefined }),
  ])
  if (!prod.success) throw new Error(prod.error?.message ?? tr('指標を取得できませんでした', 'Failed to load metrics'))
  return { product: latest(prod.data ?? [], market), category: cat.success ? latest(cat.data ?? [], market) : [] }
}

export function useProductMetrics(p: Product) {
  const key = `${p.product_code ?? ''}|${p.category ?? ''}|${productMarket(p)}`
  const [state, setState] = useState<{ key: string; data?: MetricsData; error?: string }>(() => ({ key, data: cache.get(key) }))
  useEffect(() => {
    if (cache.has(key)) return
    let cancelled = false
    load(p)
      .then((data) => {
        cache.set(key, data)
        if (!cancelled) setState({ key, data })
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ key, error: e instanceof Error ? e.message : String(e) })
      })
    return () => {
      cancelled = true
    }
    // 商品が変わったときだけ読み直す(p は開くたびに作り直されることがある)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  const data = state.key === key ? state.data : cache.get(key)
  return { data, error: state.key === key ? state.error : undefined, loading: !data && !(state.key === key && state.error) }
}

