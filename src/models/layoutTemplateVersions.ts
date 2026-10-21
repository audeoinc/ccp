// 表 layout_template_versions の、1 行の型。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// テンプレートの版: 編集して保存するたびに 1 行増える。配信カードは、テンプレートの ID と版の番号(layout_version)で、使った版を指す

/** 書き込める列 */
export interface LayoutTemplateVersionFields {
  /** テンプレートの名前(その版のとき) */
  name: string
  /** どのテンプレートの版か(作成したテンプレートは layout_templates の行の ID、標準は標準の ID) */
  template_id?: string
  /** 版の番号(標準のコードの定義は版 0 で、この表には入れない) */
  version?: number
  description?: string
  hero_kind?: string
  /** 構成(layout_templates の sections と同じ JSON) */
  sections?: string
  /** 変更のメモ */
  note?: string
  /** 保存した人 */
  author?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface LayoutTemplateVersion extends LayoutTemplateVersionFields {
  id: string
  created_on?: string
  modified_on?: string
}
