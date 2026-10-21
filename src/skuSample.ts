// ⚙ の「見本の SKU を作る / 消す」(X63)。SKU がまだない商品にだけ、見本の SKU と在庫を足す(本物の SKU は上書きしない)。
// 見本の行には source = 'sample' の印を付ける。BigQuery の取り込みは見本の行を消さず、在庫の合計にも数えない。
// BigQuery の SKU が来た商品の見本は、取り込みのときに消える(本物と見本を、同じ商品に混ぜない。server/ccp/bq_import.py)
import type { Product } from './models/products'
import { SkuService } from './data/sku'
import { SkuStockService } from './data/skuStock'
import { SAMPLE_SOURCE, buildSampleSkus } from './skuSampleData'
import { tr } from './i18n'

const fail = (res: { success: boolean; error?: { message: string } }, ja: string, en: string) => {
  if (!res.success) throw new Error(res.error?.message ?? tr(ja, en))
}

/** 同時に送る数(1 行ずつの窓口なので、少しずつ並べて送る) */
const PARALLEL = 6

/** fn を、items に PARALLEL 本ずつ並べて行う */
async function eachParallel<T>(items: T[], fn: (item: T) => Promise<void>, onProgress?: (done: number, total: number) => void) {
  let done = 0
  let next = 0
  const work = async () => {
    while (next < items.length) {
      await fn(items[next++])
      done++
      if (done % 20 === 0 || done === items.length) onProgress?.(done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, work))
}

/** SKU(本物でも見本でも)がまだない商品 */
export async function productsWithoutSku(products: Product[]): Promise<Product[]> {
  const res = await SkuService.getAll({ select: ['product_code', 'market'], top: 5000 })
  fail(res, 'SKU を読めませんでした', 'Could not load SKUs')
  const has = new Set((res.data ?? []).map((r) => `${r.market ?? ''}|${r.product_code ?? ''}`))
  return products.filter((p) => p.product_code && !has.has(`${p.market === 'US' ? 'US' : 'JP'}|${p.product_code}`))
}

/** 見本の SKU を作り、作った SKU の数を返す。onProgress には、作り終えた SKU の数と全体の数 */
export async function createSampleSkus(products: Product[], onProgress?: (done: number, total: number) => void): Promise<number> {
  const targets = await productsWithoutSku(products)
  const asOf = new Date().toISOString()
  const rows = targets.flatMap((p) => buildSampleSkus(p, asOf))
  await eachParallel(
    rows,
    async (r) => {
      fail(await SkuService.create({ ...r.sku, state_code: 0 }), '見本の SKU を作れませんでした', 'Could not create sample SKUs')
      fail(await SkuStockService.create({ ...r.stock, state_code: 0 }), '見本の SKU の在庫を作れませんでした', 'Could not create sample SKU stock')
    },
    onProgress,
  )
  return rows.length
}

/** 見本の SKU と在庫を消し、消した SKU の数を返す(source が 'sample' の行だけ。本物の SKU は消さない) */
export async function removeSampleSkus(onProgress?: (done: number, total: number) => void): Promise<number> {
  const [skus, stocks] = await Promise.all([
    SkuService.getAll({ filter: `source eq '${SAMPLE_SOURCE}'`, select: ['id'], top: 5000 }),
    SkuStockService.getAll({ filter: `source eq '${SAMPLE_SOURCE}'`, select: ['id'], top: 5000 }),
  ])
  fail(skus, '見本の SKU を読めませんでした', 'Could not load sample SKUs')
  fail(stocks, '見本の SKU の在庫を読めませんでした', 'Could not load sample SKU stock')
  const ids = [...(skus.data ?? []).map((r) => ({ table: 'sku' as const, id: r.id })), ...(stocks.data ?? []).map((r) => ({ table: 'stock' as const, id: r.id }))]
  await eachParallel(
    ids,
    async ({ table, id }) => {
      await (table === 'sku' ? SkuService : SkuStockService).delete(id)
    },
    onProgress,
  )
  return (skus.data ?? []).length
}
