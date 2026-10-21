// ⚙ の「見本の SKU を作る」(X63)。SKU がまだない商品にだけ、見本の SKU と在庫を足す(本物の SKU は上書きしない)。
// 本物の取り込み(BigQuery)があれば、表ごと入れ替わって、見本は消える
import type { Product } from './models/products'
import { SkuService } from './data/sku'
import { SkuStockService } from './data/skuStock'
import { buildSampleSkus } from './skuSampleData'
import { tr } from './i18n'

const fail = (res: { success: boolean; error?: { message: string } }, ja: string, en: string) => {
  if (!res.success) throw new Error(res.error?.message ?? tr(ja, en))
}

/** 同時に送る数(1 行ずつの窓口なので、少しずつ並べて送る) */
const PARALLEL = 6

/** SKU がまだない商品の数(ボタンの横に出す) */
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
  let done = 0
  let next = 0
  const work = async () => {
    while (next < rows.length) {
      const r = rows[next++]
      fail(await SkuService.create({ ...r.sku, state_code: 0 }), '見本の SKU を作れませんでした', 'Could not create sample SKUs')
      fail(await SkuStockService.create({ ...r.stock, state_code: 0 }), '見本の SKU の在庫を作れませんでした', 'Could not create sample SKU stock')
      done++
      if (done % 20 === 0 || done === rows.length) onProgress?.(done, rows.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, rows.length) }, work))
  return rows.length
}
