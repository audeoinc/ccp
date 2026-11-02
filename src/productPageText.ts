// 商品ページの本文を求める(X80 段 ②)。「詳しく」にした商品の枠の説明文を、AI がページの内容から書くとき(段 ③)の材料。
// 残した本文(表 product_page_texts。手元の PC で集めた ZIP から取り込む)があれば、それを使う。Workbench は外のページを読めないため。
// なければ、商品ページを読んで取り出す(見本の EC サイトのページは、サーバーがその場で作る。本物のページは、外に出られる環境でだけ読める)
import type { Product } from './models/products'
import { ProductPageTextsService } from './data/productPageTexts'
import { ProductPages } from './data/productPages'
import { productUrl } from './links'

export interface ProductPageText {
  title: string
  text: string
  /** stored = 取り込んで残した本文、page = いまページを読んで取り出した本文 */
  from: 'stored' | 'page'
  /** 読んだ商品ページの URL */
  url: string
}

/** 本文が見つからない・読めないときは null(人が手で書く) */
export async function productPageText(product: Product): Promise<ProductPageText | null> {
  const r = await ProductPageTextsService.getAll({ filter: `product_id eq '${product.id}'`, orderBy: ['modified_on desc'], top: 1 })
  const row = r.success ? r.data?.[0] : undefined
  if (row?.body?.trim()) return { title: row.name, text: row.body, from: 'stored', url: row.source_url ?? '' }
  const url = productUrl(product)
  if (!url) return null
  try {
    const page = await ProductPages.images(url)
    return page.text?.trim() ? { title: page.title ?? '', text: page.text, from: 'page', url: page.page } : null
  } catch {
    return null
  }
}
