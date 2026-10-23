// 表 country_applications の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 共通のマスタの、国ごとの適用(ST7)。変えるたびに 1 行足す(種類・マスタの id・国の組で、いちばん新しい行が、いまの値)

export const CountryApplicationKind = {
  template: 'テンプレート',
  learning: '学び',
  policy: 'ポリシー',
} as const
export type CountryApplicationKind = keyof typeof CountryApplicationKind

export const CountryApplicationMode = {
  use: '使う',
  skip: '使わない',
} as const
export type CountryApplicationMode = keyof typeof CountryApplicationMode

/** 書き込める列 */
export interface CountryApplicationFields {
  kind: CountryApplicationKind
  /** マスタの id(テンプレートは、テンプレートの ID。標準の 10 種は、コードの ID) */
  item_id: string
  country?: string
  mode?: CountryApplicationMode
  /** 変えた人 */
  changed_by?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface CountryApplication extends CountryApplicationFields {
  id: string
  created_on?: string
  modified_on?: string
}
