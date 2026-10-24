// 日付の小道具(整理 第2段 ⑧)。日付は、ブラウザの時刻の「年-月-日」(YYYY-MM-DD)の文字で比べ・覚える。
// toISOString は UTC なので、日本の朝 9 時前は前の日になる。日付の文字を作るときは、ここの関数を使う
const pad = (n: number) => String(n).padStart(2, '0')

/** その日の「年-月-日」(YYYY-MM-DD。ブラウザの時刻) */
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
/** その日の「年-月」(YYYY-MM) */
export const ym = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
/** 今日の「年-月-日」 */
export const todayYmd = () => ymd(new Date())
/** ISO の日時を、ブラウザの時刻での日付(YYYY-MM-DD)に。空なら空 */
export const localDate = (iso?: string): string => (iso ? ymd(new Date(iso)) : '')

// 週の始まりは 2 通りある。どちらもデータの決まりなので、そろえない:
// 週の計画(週の状態・承認・振り返り。表 weeks)は日曜から、販売系の方針・週ごとの実績・順位(week_start)は月曜から
/** 週の計画の週の始まり(日曜) */
export const weekStartSunday = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
/** 販売系の方針・週ごとの実績の週の始まり(月曜) */
export const weekStartMonday = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
