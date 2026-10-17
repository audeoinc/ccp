// 表 weekly_performances の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。

/** 書き込める列 */
export interface WeeklyPerformanceFields {
  name: string
  product_code?: string
  week_start?: string
  units?: number
  revenue?: number
  stock?: number
  /** 市場(BigQuery から取り込んだ行だけ) */
  market?: string
  state_code?: number
}

/** 読んだ 1 行 */
export interface WeeklyPerformance extends WeeklyPerformanceFields {
  id: string
  created_on?: string
  modified_on?: string
}
