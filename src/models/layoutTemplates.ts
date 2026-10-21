// 表 layout_templates の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

/** 書き込める列 */
export interface LayoutTemplateFields {
  name: string
  description?: string
  hero_kind?: string
  sections?: string
  /** 標準のテンプレートを編集したとき: どの標準を上書きするか(標準の ID)。空は、作成したテンプレート */
  overrides?: string
  /** 非表示にした日時(空は、表示する)。非表示のテンプレートは、配信カードの選択肢に出さない(使っている配信は、そのまま) */
  hidden_at?: string | null
  /** いまの版の番号(標準は、コードの定義が版 0。作成したテンプレートは版 1 から)。編集して保存するたびに 1 つ増える */
  current_version?: number
  state_code?: number
}

/** 読んだ 1 行 */
export interface LayoutTemplate extends LayoutTemplateFields {
  id: string
  created_on?: string
  modified_on?: string
}
