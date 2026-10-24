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
  /** 画像の説明(見本の写真では、商品ページの見出し) */
  alt?: string
  sha256?: string
  /** 商品ページで画像に添える説明の文(素材の強み・ディテールなど) */
  caption?: string
  /** アングル(front / texture / detail / worn / scene など。ProductImagePicker の angleName) */
  angle?: string
  /** sample = AI で作った見本の写真。本物の画像(空)がある商品では、見本を使わない */
  source?: string
  /** 写っているモデル(人物)の使用期限(YYYY-MM-DD)。配信日より前に切れる画像を載せていれば、アラート(cardAlerts の imageExpiryAlerts) */
  model_usable_until?: string | null
  product_id?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface ProductImage extends ProductImageFields {
  id: string
  created_on?: string
  modified_on?: string
}
