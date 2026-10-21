// 表 sku(BigQuery から取り込む SKU。docs/BIGQUERY.md の 4.2)の、1 行の型。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 正しい出どころは BigQuery(取り込みは server/ccp/bq_import.py)。画面から書くのは、⚙ の「見本の SKU を作る」(src/skuSample.ts。X63)だけ。

/** 列 */
export interface SkuFields {
  market?: string
  sku_code?: string
  /** 属する SPU(products.product_code) */
  product_code?: string
  color?: string
  size?: string
  /** レングス(丈) */
  length?: string
  price?: number
  units_4w?: number
  /** BigQuery 側のデータの時点 */
  as_of?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface Sku extends SkuFields {
  id: string
  created_on?: string
  modified_on?: string
}
