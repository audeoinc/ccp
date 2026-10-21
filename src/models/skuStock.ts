// 表 sku_stock(BigQuery から取り込む SKU の在庫。1 時間に数回変わる)の、1 行の型。列を変えたら、server/schema.json と一緒に直す。
// 画面から書くのは、⚙ の「見本の SKU を作る」(X63)だけ。SPU の在庫(products.stock)は、取り込みのたびに、サーバーがこの表から合計して書く。

/** 列 */
export interface SkuStockFields {
  market?: string
  sku_code?: string
  stock?: number
  /** 在庫の時点(BigQuery 側) */
  as_of?: string
  /** 出どころ: 'sample' = ⚙ で作った見本(X63)。空 = BigQuery から取り込んだ本物 */
  source?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface SkuStock extends SkuStockFields {
  id: string
  created_on?: string
  modified_on?: string
}
