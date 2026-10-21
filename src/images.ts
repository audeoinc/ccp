import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { PartImage } from './models/partImages'
import { appPath } from './appRoot'

// ビルドに同梱するイラスト(商品コード・画像コードと同じファイル名。scripts の生成物)
const productAssets = import.meta.glob('./assets/products/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const heroAssets = import.meta.glob('./assets/heroes/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

// 画像の URL が空、または仮の画像(placehold.co)のときだけ、同梱のイラストを使う。
// 実際の画像URLを入れれば、そちらが優先される。
// US 向けの商品(U01..)・メイン画像(UH01..)は、同じ絵柄(P01.., H01..)を使い回す
const assetCode = (code?: string) => (code ?? '').replace(/^UH/, 'H').replace(/^U/, 'P')

const isPlaceholder = (url?: string) => !url || url.includes('placehold.co')

/** override: この配信で選んだ画像(X64。配信に載せた商品の行の image_url)。あれば、商品のマスタの画像より先に使う */
export function productImage(p?: Product, override?: string): string | undefined {
  if (override) return appPath(override)
  if (!p) return undefined
  if (!isPlaceholder(p.image_url)) return appPath(p.image_url!)
  return (productAssets[`./assets/products/${p.product_code}.svg`] ?? productAssets[`./assets/products/${assetCode(p.product_code)}.svg`]) ?? p.image_url
}

export function heroImage(h?: HeroImage): string | undefined {
  if (!h) return undefined
  if (!isPlaceholder(h.image_url)) return appPath(h.image_url!)
  return heroAssets[`./assets/heroes/${assetCode(h.image_code)}.svg`] ?? h.image_url
}

/** 部品の画像(X59 ③)。同梱のイラストはないので、URL をそのまま使う */
export function partImage(p?: PartImage): string | undefined {
  if (!p?.image_url) return undefined
  return appPath(p.image_url)
}

/** サーバーが返した画像のパス(/img/…)を、表示に使える URL にする(Workbench では Jupyter の中継の下で動くため、置き場所を頭に付ける)。
 *  すでに表示用の URL(heroImage などの結果・blob:・https:)は、そのまま */
export const imgSrc = (url: string): string => (url.startsWith('/img/') ? appPath(url) : url)
