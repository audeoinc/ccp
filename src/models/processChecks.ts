// 表 process_checks(前提運用の照らし合わせの、聞き取り先ごと・行ごとの答え)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す(scripts/check-schema.mjs が食い違いを見つける)。
// 行(row_id)は docs/FLOWS.md の業務(A1・P1 など)・要検討(R1 など)・物差し(M1 など)。どの列を使うかは行の種類で違う

/** 差(業務の行) */
export const ProcessCheckGap = {
  none: '差なし',
  gap: '差あり',
  nowork: 'その業務はない',
} as const
export type ProcessCheckGap = keyof typeof ProcessCheckGap

/** 差の扱い(差ありのときだけ) */
export const ProcessCheckHandle = {
  adopt: 'CCP に合わせる(良くなる)',
  fix: 'CCP を直す',
  hold: '保留',
} as const
export type ProcessCheckHandle = keyof typeof ProcessCheckHandle

/** 要否(要検討の行) */
export const ProcessCheckDecision = {
  keep: '要る',
  remove: '要らない',
  hold: '保留',
} as const
export type ProcessCheckDecision = keyof typeof ProcessCheckDecision

/** 書き込める列 */
export interface ProcessCheckFields {
  interview_id: string
  row_id: string
  /** 聞いた今の運用(業務の行) */
  asis?: string
  gap?: ProcessCheckGap | ''
  handle?: ProcessCheckHandle | ''
  decision?: ProcessCheckDecision | ''
  /** 今の値(物差しの行) */
  value?: string
  /** メモ・聞いたこと・測り方 */
  note?: string
}

/** 読んだ 1 行 */
export interface ProcessCheck extends ProcessCheckFields {
  id: string
  created_on?: string
  modified_on?: string
}
