// 箱の要素「カラーチップ」と「レビュー」(T8 の 8.5。設計は docs/TEMPLATE_OBJECTS.md の 8.5)。
// カラーチップは、その商品の SKU の色を、SKU の並び順に重ならないように並べる。色の番号(SKU の color_hex)があればそれを、
// なければ色の名前から引く(BigQuery に色の番号がない環境・見本の SKU でも、チップが出るように)。引けない色は、名前の札にする
import { useEffect, useState } from 'react'
import type { Product } from './models/products'
import { SkuService } from './data/sku'
import { productMarket } from './market'
import { SAMPLE_SOURCE } from './skuSampleData'

export interface Swatch {
  name: string
  /** #rrggbb(わからない色は undefined。名前の札で出す) */
  hex?: string
}

// よくある色の名前 → 色(メールの中の色なので、受信側の見た目として固定の値)
const NAMED: Record<string, string> = {
  ブラック: '#222222', black: '#222222',
  ホワイト: '#ffffff', white: '#ffffff',
  オフホワイト: '#f3efe6', 'off white': '#f3efe6',
  グレー: '#8a8d91', gray: '#8a8d91', grey: '#8a8d91',
  ダークグレー: '#4a4d52', 'dark gray': '#4a4d52',
  ネイビー: '#1f2a44', navy: '#1f2a44',
  ブルー: '#3a6fb5', blue: '#3a6fb5',
  ベージュ: '#d8c7a8', beige: '#d8c7a8',
  ブラウン: '#6b4a32', brown: '#6b4a32',
  カーキ: '#7a7650', khaki: '#7a7650',
  オリーブ: '#6b6b3a', olive: '#6b6b3a',
  グリーン: '#3f7a4f', green: '#3f7a4f',
  ボルドー: '#6d1f2c', burgundy: '#6d1f2c', wine: '#6d1f2c',
  レッド: '#c62828', red: '#c62828',
  ピンク: '#e8a0b4', pink: '#e8a0b4',
  オレンジ: '#e07b2e', orange: '#e07b2e',
  イエロー: '#e8c547', yellow: '#e8c547',
  パープル: '#6f4a8e', purple: '#6f4a8e',
}

const HEX = /^#?([0-9a-f]{6})$/i

/** SKU の色を、チップの色にする(色の番号が正しければそれ、なければ名前から) */
export function swatchOf(name: string, hex?: string): Swatch {
  const m = hex?.trim().match(HEX)
  return { name, hex: m ? `#${m[1].toLowerCase()}` : NAMED[name.trim()] ?? NAMED[name.trim().toLowerCase()] }
}

// 同じ商品を、プレビューを描き直すたびに読み直さない(画面を開いている間だけ)
const cache = new Map<string, Swatch[]>()
const keyOf = (p: Product) => `${p.product_code ?? ''}|${productMarket(p)}`
const q = (v: string) => `'${v.replace(/'/g, "''")}'`

async function load(p: Product): Promise<Swatch[]> {
  if (!p.product_code) return []
  const market = productMarket(p)
  const res = await SkuService.getAll({ filter: `product_code eq ${q(p.product_code)}`, top: 500 })
  if (!res.success) return []
  const mine = (res.data ?? []).filter((s) => !s.market || s.market === market)
  // 本物(BigQuery)の SKU があれば、見本は使わない(商品の SKU の表 useProductSkus と同じ)
  const real = mine.filter((s) => s.source !== SAMPLE_SOURCE)
  const seen = new Set<string>()
  const out: Swatch[] = []
  for (const s of real.length ? real : mine) {
    const name = s.color?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push(swatchOf(name, s.color_hex))
  }
  return out
}

/**
 * 商品ごとの色の展開(キーは商品の ID)。on が false のときは読まない(カラーチップを出す箱がないテンプレートで、SKU を読みに行かないように)
 */
export function useProductSwatches(products: Product[], on: boolean): Map<string, Swatch[]> {
  const [, setTick] = useState(0)
  const want = on ? products.filter((p) => p.product_code && !cache.has(keyOf(p))) : []
  const wantKey = want.map(keyOf).join(',')
  useEffect(() => {
    if (!wantKey) return
    let cancelled = false
    void Promise.all(
      want.map(async (p) => {
        cache.set(keyOf(p), await load(p).catch(() => []))
      }),
    ).then(() => !cancelled && setTick((n) => n + 1))
    return () => {
      cancelled = true
    }
    // want は wantKey から決まる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantKey])
  return new Map(on ? products.map((p) => [p.id, cache.get(keyOf(p)) ?? []]) : [])
}

/** 星(★)の文字列。満ちた星と空の星だけ(半分の星はメールで崩れやすいので、四捨五入) */
export const stars = (rating: number): string => {
  const n = Math.max(0, Math.min(5, Math.round(rating)))
  return '★'.repeat(n) + '☆'.repeat(5 - n)
}
/** 星の色(受信側の見た目として固定) */
export const STAR_COLOR = '#e8a317'
