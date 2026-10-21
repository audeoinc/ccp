// 表 part_images(部品の画像。X59 ③)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

export const PartImageKind = {
  button: 'ボタン',
  banner: 'バナー',
  logo: 'ロゴ',
  icon: 'アイコン',
  other: 'その他',
} as const
export type PartImageKind = keyof typeof PartImageKind

export const PartImageMarket = {
  JP: 'JP',
  US: 'US',
} as const
export type PartImageMarket = keyof typeof PartImageMarket

/** 書き込める列 */
export interface PartImageFields {
  name: string
  kind?: PartImageKind
  market?: PartImageMarket
  tags?: string
  description?: string
  /** メールの代替テキスト(画像が出ないときに代わりに出る文。<img alt>) */
  alt_text?: string
  image_url?: string
  /** 画像の大きさ(px。上げたときに測る。<img width> の目安) */
  width?: number | null
  height?: number | null
  /** 出どころ(自社で作成 / 取引先から / 素材サイト / その他 と、ひとこと) */
  source?: string
  /** 使える期限(YYYY-MM-DD。過ぎたら、制作のページの候補から外す。空は期限なし) */
  usable_until?: string | null
  uploaded_by?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface PartImage extends PartImageFields {
  id: string
  kind_name?: string
  market_name?: string
  created_on?: string
  modified_on?: string
}
