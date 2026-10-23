// 表 product_images の、1 行の型。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 商品の画像(メインを含め、商品ページに載っている画像)。手元の PC で集めて取り込む(docs/PRODUCT_IMAGES.md)。

/** 書き込める列 */
export interface ProductImageFields {
  name: string
  product_code?: string
  market?: string
  /** /img/products/<ファイル>(サーバーが配る) */
  image_url?: string
  sort_order?: number
  /** 1 = メイン画像(商品のマスタにある画像) */
  is_main?: number
  /** 集めた元の URL */
  source_url?: string
  alt?: string
  sha256?: string
  product_id?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface ProductImage extends ProductImageFields {
  id: string
  created_on?: string
  modified_on?: string
}
