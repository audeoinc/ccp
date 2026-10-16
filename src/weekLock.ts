// 確定した週の、変更の制限(バックログ W3)。
// 週の計画は、確定したら制作に回してよい状態なので、そのあとに配信を変えるときは、理由を残して、週をレビューに戻す。
import type { WeekRow } from './data/weeks'

const pad = (n: number) => String(n).padStart(2, '0')

/** その日を含む週の初め(日曜日) */
export const sundayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())

/** 日の鍵(YYYY-MM-DD。ローカルの日付) */
export const dayKeyOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** 週の行の鍵(週の初めの日曜日。YYYY-MM-DD)。weeks の week_start と同じ形 */
export const weekKeyOf = (d: Date) => {
  const s = sundayOf(d)
  return `${s.getFullYear()}-${pad(s.getMonth() + 1)}-${pad(s.getDate())}`
}

/**
 * 配信日時(ISO、または datetime-local の値)が入っている週が、確定済みなら、その週の行を返す。
 * 配信日時を変えるときは、移す前と移したあとの、両方の週を調べる(どちらの計画も変わるため)
 */
export function confirmedWeekOf(weeks: WeekRow[], when?: string): WeekRow | undefined {
  if (!when) return undefined
  const d = new Date(when)
  if (Number.isNaN(d.getTime())) return undefined
  const key = weekKeyOf(d)
  return weeks.find((w) => w.week_start?.slice(0, 10) === key && w.status === 'confirmed')
}
