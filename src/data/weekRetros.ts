// 表「週の振り返り」(server/schema.json の week_retros。X89・2026-11-02 利用者がおすすめの案 1 で決定)。
// 週の振り返りは、承認・確定の週の行(weeks。週 × 国 × チャネル)から分けて持つ。国だけ選べば書け(チャネルは空)、チャネルも選べばその組で書ける。
// 読むときは、その組 → 国だけの行 → 以前の weeks.retro の順(以前の行は移し替えずに、そのまま読む。weekLock.ts の weekRetroOf)
import { tableService } from '../gcp/services'

export interface WeekRetroFields {
  /** 週の初め(日曜日。YYYY-MM-DD) */
  week_start?: string
  /** 国のコード */
  country?: string
  /** チャネル(email / app)。空は国の全体 */
  channel?: string
  /** この週の振り返り(うまくいったこと・次に試すこと) */
  retro?: string
}

export interface WeekRetroRow extends WeekRetroFields {
  id: string
}

export const WeekRetrosService = tableService<WeekRetroRow, WeekRetroFields>('week_retros')
