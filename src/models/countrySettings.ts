// 表 country_settings の、1 行の型。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 国ごとの設定(ST2)。変えるたびに 1 行足す(いちばん新しい行が、いまの値。前の行は履歴)

/** 書き込める列 */
export interface CountrySettingFields {
  /** 設定の種類(criteria = アラートの基準) */
  name: string
  country?: string
  /** 値(JSON) */
  value?: string
  /** 変えた人 */
  changed_by?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface CountrySetting extends CountrySettingFields {
  id: string
  created_on?: string
  modified_on?: string
}
