// 見本の SKU の組み立て(X63)。SPU(商品)ごとに、色 × サイズの SKU と、その在庫を決まった規則で作る(同じ商品なら毎回同じ)。
// 本物の SKU は BigQuery から入る(server/ccp/bq_import.py が表ごと入れ替える)。見本は、SKU のデータがない環境で、SKU ごとの在庫・欠品の見え方を試すため。
// 撮影用のデータ(src/mock/db.ts)からも読むので、サービス(src/data)を読み込まない(読み込むと輪になる)
import type { SkuFields } from './models/sku'
import type { SkuStockFields } from './models/skuStock'

interface ProductLike {
  product_code?: string
  category?: string
  market?: string
  gender?: string
  stock?: number
  units_4w?: number
  price?: number
}

/** 文字から、決まった 0〜1 の値(同じ商品なら、同じ色・サイズ・在庫になるように) */
function rand(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // 末尾だけが違う文字(「…:S:out」「…:M:out」)の値が似ないよう、最後にかき混ぜる(murmur3 の fmix32)
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

// 色の名前は、BigQuery の値と同じく、その市場の言葉で持つ(画面で訳さない。データの値のため)
const COLORS: Record<'JP' | 'US', string[]> = {
  JP: ['ブラック', 'ネイビー', 'グレー', 'ベージュ', 'ブラウン', 'オフホワイト', 'カーキ', 'ボルドー'],
  US: ['Black', 'Navy', 'Gray', 'Beige', 'Brown', 'Off White', 'Khaki', 'Burgundy'],
}

/** 種類と市場に合うサイズ。小物・バッグ・雑貨は 1 つ(フリー) */
function sizesOf(p: ProductLike, market: 'JP' | 'US'): string[] {
  const cat = p.category ?? ''
  if (cat === 'shoes') {
    if (market === 'US') return p.gender === 'mens' ? ['8', '9', '10', '11', '12'] : ['6', '7', '8', '9', '10']
    return p.gender === 'mens' ? ['25.0', '26.0', '27.0', '28.0'] : ['22.5', '23.5', '24.5', '25.5']
  }
  if (cat === 'accessories' || cat === 'bags' || cat === 'home') return [market === 'US' ? 'One Size' : 'F']
  return p.gender === 'mens' ? ['S', 'M', 'L', 'XL'] : p.gender === 'womens' ? ['XS', 'S', 'M', 'L'] : ['S', 'M', 'L', 'XL']
}

/** 合計 total を、重み weights の比で整数に分ける(端数は、大きい順に 1 ずつ) */
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  if (total <= 0 || sum <= 0) return weights.map(() => 0)
  const raw = weights.map((w) => (total * w) / sum)
  const out = raw.map(Math.floor)
  let rest = total - out.reduce((a, b) => a + b, 0)
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k][1]]++
  return out
}

export interface SampleSku {
  sku: SkuFields
  stock: SkuStockFields
}

/**
 * 1 つの商品の見本の SKU。色は 2〜4 色、サイズは種類と市場に合わせる。
 * 在庫の合計は、商品の在庫(products.stock)と同じにする(アラート・AI が見ている在庫と食い違わないように)。
 * 2〜3 割の SKU は、わざと在庫 0(欠品)にする
 */
export function buildSampleSkus(p: ProductLike, asOf: string): SampleSku[] {
  const code = p.product_code
  if (!code) return []
  const market = p.market === 'US' ? 'US' : 'JP'
  const palette = COLORS[market]
  const nColors = 2 + Math.floor(rand(`${code}:colors`) * 3)
  const start = Math.floor(rand(`${code}:start`) * palette.length)
  const colors = Array.from({ length: nColors }, (_, i) => palette[(start + i * 3) % palette.length])
  const sizes = sizesOf(p, market)
  const combos = colors.flatMap((color, ci) => sizes.map((size) => ({ color, ci, size })))
  // 欠品にする SKU(在庫が 0 の商品は、すべて 0)。真ん中のサイズは売れやすいので、欠品になりやすくする
  const out = combos.map(({ color, size }, i) => {
    const edge = i % sizes.length === 0 || i % sizes.length === sizes.length - 1
    return rand(`${code}:${color}:${size}:out`) < (edge ? 0.12 : 0.28)
  })
  if (combos.length > 1 && out.every(Boolean)) out[0] = false
  const weights = combos.map(({ color, size }, i) => (out[i] ? 0 : 0.4 + rand(`${code}:${color}:${size}:w`)))
  const stocks = split(Math.max(0, Math.round(p.stock ?? 0)), weights)
  const units = split(Math.max(0, Math.round(p.units_4w ?? 0)), combos.map(({ color, size }) => 0.3 + rand(`${code}:${color}:${size}:u`)))
  return combos.map(({ color, ci, size }, i) => {
    const sku_code = `${code}-${String(ci + 1).padStart(2, '0')}-${size.replace(/\s+/g, '')}`
    return {
      sku: { market, sku_code, product_code: code, color, size, price: p.price, units_4w: units[i], as_of: asOf },
      stock: { market, sku_code, stock: stocks[i], as_of: asOf },
    }
  })
}
