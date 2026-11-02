// 表 product_page_texts の、1 行の型。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 商品ページの本文(X80 段 ②。商品ごとに 1 行)。「詳しく」にした商品の枠の説明文を、AI がページの内容から書くときの材料。

/** 書き込める列 */
export interface ProductPageTextFields {
  /** ページの題 */
  name: string
  product_code?: string
  market?: string
  /** 読んだ商品ページの URL */
  source_url?: string
  /** ページの本文(ナビ・フッターなどを除いた文。server/ccp/page_text.py) */
  body?: string
  /** sample = 見本の ZIP から。空 = 本物のページ */
  source?: string
  /** ページを読んだ日時 */
  fetched_at?: string
  product_id?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface ProductPageText extends ProductPageTextFields {
  id: string
  created_on?: string
  modified_on?: string
}
