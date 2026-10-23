// 表「月の振り返り」(server/schema.json の months)。月と国で 1 行(ST3。国で客層が違うので、振り返りも国ごと)。
// 結果の面の月の表示で書き(AI の下書きを入れて人が直す)、翌月の計画の面の月の表示に「前月の振り返り」として出す。
import { tableService } from '../gcp/services'

export interface MonthFields {
  /** 月の初め(YYYY-MM-01) */
  month_start?: string
  /** 国のコード。空の行は国を分ける前の行で、国の行がなければ、すべての国に出す */
  country?: string
  /** この月の振り返り(月全体で気づいたこと・次の月に生かすこと) */
  retro?: string
}

export interface MonthRow extends MonthFields {
  id: string
}

export const MonthsService = tableService<MonthRow, MonthFields>('months')
