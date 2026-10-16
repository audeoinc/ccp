// 表 layout_templates の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

/** 書き込める列 */
export interface LayoutTemplateFields {
  name: string
  description?: string
  hero_kind?: string
  sections?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface LayoutTemplate extends LayoutTemplateFields {
  id: string
  created_on?: string
  modified_on?: string
}
