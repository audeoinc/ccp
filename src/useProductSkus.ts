// 商品のフロートの「SKU」(X63)の読み込み。この商品(SPU)の SKU と、SKU ごとのいまの在庫(src/ProductSkus.tsx が表にする)
import { useEffect, useState } from 'react'
import type { Product } from './models/products'
import { SkuService } from './data/sku'
import { SkuStockService } from './data/skuStock'
import { tr } from './i18n'
import { productMarket } from './market'
import { SAMPLE_SOURCE } from './skuSampleData'

export interface SkuRow {
  sku_code: string
  color: string
  size: string
  length: string
  /** いまの在庫(在庫の行がない SKU は 0。BigQuery の取り込みと同じ扱い) */
  stock: number
  units_4w?: number
  /** 在庫の時点 */
  as_of?: string
  /** ⚙ で作った見本の SKU か(X63) */
  sample: boolean
}

// 同じ商品を開き直したときに、取り直さない(画面を開いている間だけ。見本を作ったら捨てる)
const cache = new Map<string, SkuRow[]>()

/** 見本の SKU を作ったあとに、覚えておいた値を捨てる */
export function clearProductSkusCache(): void {
  cache.clear()
}

const q = (v: string) => `'${v.replace(/'/g, "''")}'`

async function load(p: Product): Promise<SkuRow[]> {
  if (!p.product_code) return []
  const market = productMarket(p)
  // 絞り込みは 1 つの列だけにする(撮影用のビルドの身代わりが、and を読めないため)。市場は、読んだあとに絞る
  const res = await SkuService.getAll({ filter: `product_code eq ${q(p.product_code)}`, top: 500 })
  if (!res.success) throw new Error(res.error?.message ?? tr('SKU を取得できませんでした', 'Failed to load SKUs'))
  const mine = (res.data ?? []).filter((s) => s.sku_code && (!s.market || s.market === market))
  // 本物(BigQuery)の SKU があれば、見本は出さない(取り込みで消えるまでの間に、両方が見えないように)
  const real = mine.filter((s) => s.source !== SAMPLE_SOURCE)
  const skus = real.length ? real : mine
  // 在庫は SKU ごとに読む(表の窓口が「どれかに当てはまる」の絞り込みを持たないため。1 つの SPU の SKU は多くても数十)
  const stocks = await Promise.all(skus.map((s) => SkuStockService.getAll({ filter: `sku_code eq ${q(s.sku_code ?? '')}`, top: 5 })))
  return skus.map((s, i) => {
    const sample = s.source === SAMPLE_SOURCE
    // 在庫も、同じ出どころの行だけ(見本の在庫を、本物の SKU に当てない)
    const st = (stocks[i].success ? (stocks[i].data ?? []) : []).find((r) => (!r.market || r.market === market) && (r.source === SAMPLE_SOURCE) === sample)
    return { sku_code: s.sku_code ?? '', color: s.color ?? '', size: s.size ?? '', length: s.length ?? '', stock: st?.stock ?? 0, units_4w: s.units_4w, as_of: st?.as_of ?? s.as_of, sample }
  })
}

export function useProductSkus(p: Product) {
  const key = `${p.product_code ?? ''}|${productMarket(p)}`
  const [state, setState] = useState<{ key: string; data?: SkuRow[]; error?: string }>(() => ({ key, data: cache.get(key) }))
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

/** サイズの並び順: 服の記号の順 → 数字の小さい順 → 出てきた順 */
const LETTER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL']
export function sortSizes(sizes: string[]): string[] {
  const rank = (s: string) => {
    const i = LETTER.indexOf(s.toUpperCase())
    if (i >= 0) return i
    const n = Number.parseFloat(s)
    return Number.isFinite(n) ? 100 + n : 10000
  }
  return [...sizes].sort((a, b) => rank(a) - rank(b) || sizes.indexOf(a) - sizes.indexOf(b))
}

/** 欠品率: 在庫 0 の SKU の数 ÷ SKU の数(分母は、販売を終えた SKU も含めた、その SPU のすべての SKU。docs/METRICS_FORMAT.md と同じ) */
export const stockoutRate = (rows: SkuRow[]) => (rows.length ? rows.filter((r) => r.stock <= 0).length / rows.length : 0)
