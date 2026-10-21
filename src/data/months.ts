// 表「月の振り返り」(server/schema.json の months)。1 か月に 1 行。
// 結果の面の月の表示で書き(AI の下書きを入れて人が直す)、翌月の計画の面の月の表示に「前月の振り返り」として出す。
import { tableService } from '../gcp/services'

export interface MonthFields {
  /** 月の初め(YYYY-MM-01) */
  month_start?: string
  /** この月の振り返り(月全体で気づいたこと・次の月に生かすこと) */
  retro?: string
}

export interface MonthRow extends MonthFields {
  id: string
}

export const MonthsService = tableService<MonthRow, MonthFields>('months')
