// 表 help_faq_builds(よく聞かれる質問のまとめ直しの記録。X82 段 ④)の、1 行の型。列を変えたら、server/schema.json と一緒に直す。
// status が running の行は、同時に 2 つ走らないための札(10 分で切れる)。書くのはサーバーの /api/help だけ

/** 書き込める列 */
export interface HelpFaqBuildFields {
  /** running / done / error */
  status?: string
  /** 入れた質問の数 */
  question_count?: number
  /** 足した・直した FAQ の数 */
  faq_count?: number
  error?: string
  finished_at?: string
}

/** 読んだ 1 行 */
export interface HelpFaqBuild extends HelpFaqBuildFields {
  id: string
  created_on?: string
}
