// 表 process_interviews(前提運用の照らし合わせの、聞き取り先)の、1 行の型。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 中身の行は process_checks。聞き取りの進め方は docs/PROCESS.md の 8.1

/** 書き込める列 */
export interface ProcessInterviewFields {
  /** 聞き取り先(例: US の企画チーム) */
  name: string
}

/** 読んだ 1 行 */
export interface ProcessInterview extends ProcessInterviewFields {
  id: string
  created_on?: string
  modified_on?: string
}
