// 確定した週の、変更の制限(バックログ W3)。
// 週の計画は、確定したら制作に回してよい状態なので、そのあとに配信を変えるときは、理由を残して、週をレビューに戻す。
import { WeeksService, type WeekRow } from './data/weeks'
import { CHANNEL_EMAIL, channelOptions, countryOptions } from './status'
import { optionLabel } from './i18n'

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

/** 週の行を分ける単位(ST3・W8)。国とチャネルで、提出・確定・振り返りを別々に持つ */
export interface WeekScope {
  country?: string
  channel?: string
}

/**
 * その週・国・チャネルの行。なければ、国を分ける前の行(国もチャネルも空)を返す(以前のデータが、すべての国・チャネルに効くように)。
 * 国かチャネルが決まっていない(「すべて」)ときは、どの行とも決められないので、以前の行だけを見る
 */
export function weekRowOf(weeks: WeekRow[], weekKey: string, scope: WeekScope): WeekRow | undefined {
  const inWeek = weeks.filter((w) => w.week_start?.slice(0, 10) === weekKey)
  const own = scope.country && scope.channel ? inWeek.find((w) => w.country === scope.country && w.channel === scope.channel) : undefined
  return own ?? inWeek.find((w) => !w.country && !w.channel)
}

/** 配信が入る週の行の単位。チャネルのない配信はメールとみなす(まとめて作る・枠と同じ扱い) */
export const scopeOfCard = (c: { country?: string; channel?: string }): WeekScope => ({ country: c.country || '', channel: c.channel || CHANNEL_EMAIL })

/** 週の国・チャネルの名前(「US・メール」)。週の帯・履歴のメモに出す */
export function scopeLabel(scope: WeekScope): string {
  const name = (opts: { value: string; label: string }[], v?: string) => (v ? optionLabel(opts.find((o) => String(o.value) === v)?.label) || v : '')
  return [name(countryOptions, scope.country), name(channelOptions, scope.channel)].filter(Boolean).join('・')
}

/**
 * 週の配信が入る、国・チャネルの組。画面で国とチャネルを決めていれば、その組だけ。
 * 決めていなければ、その週の配信(決めている方で絞ったもの)から集める(週の帯で、組ごとの状態を並べるため)
 */
export function segmentsOf(cards: { country?: string; channel?: string }[], scope: WeekScope): WeekScope[] {
  if (scope.country && scope.channel) return [scope]
  const seen = new Map<string, WeekScope>()
  for (const c of cards) {
    const sc = scopeOfCard(c)
    if (scope.country && sc.country !== scope.country) continue
    if (scope.channel && sc.channel !== scope.channel) continue
    seen.set(`${sc.country}|${sc.channel}`, sc)
  }
  return [...seen.values()].sort((a, b) => (a.country ?? '').localeCompare(b.country ?? '') || (a.channel ?? '').localeCompare(b.channel ?? ''))
}

/** 週が、並べた国・チャネルのすべてで確定しているか(組が 1 つもなければ、確定していないとみなす) */
export const weekConfirmedIn = (weeks: WeekRow[], weekKey: string, segments: WeekScope[]) =>
  segments.length > 0 && segments.every((sc) => weekRowOf(weeks, weekKey, sc)?.status === 'confirmed')

/** 行が、その国・チャネルのものか(false なら、国を分ける前の行。直すときは、その国・チャネルの行を新しく作る) */
export const isOwnWeekRow = (row: WeekRow | undefined, scope: WeekScope) => !!row && !!row.country && row.country === scope.country && row.channel === scope.channel

/**
 * 配信日時(ISO、または datetime-local の値)が入っている週が、その国・チャネルで確定済みなら、その週の行を返す。
 * 配信日時を変えるときは、移す前と移したあとの、両方の週を調べる(どちらの計画も変わるため)
 */
export function confirmedWeekOf(weeks: WeekRow[], when: string | undefined, scope: WeekScope): WeekRow | undefined {
  if (!when) return undefined
  const d = new Date(when)
  if (Number.isNaN(d.getTime())) return undefined
  const row = weekRowOf(weeks, weekKeyOf(d), scope)
  return row?.status === 'confirmed' ? row : undefined
}

/** その月・国の振り返りの行。なければ、国を分ける前の行(国が空) */
export function monthRowOf<T extends { month_start?: string; country?: string }>(months: T[], monthKey: string, country: string | undefined): T | undefined {
  const inMonth = months.filter((m) => m.month_start?.slice(0, 7) === monthKey)
  return (country ? inMonth.find((m) => m.country === country) : undefined) ?? inMonth.find((m) => !m.country)
}

/**
 * その週・国・チャネルの行に書く。自分の行があれば直し、なければ(国を分ける前の行を見ていたときも)、その国・チャネルの行を作る。
 * 作るときは、見ていた以前の行の状態・振り返りを引き継ぐ(ほかの国・チャネルは、以前の行のまま変わらない)
 */
export function saveWeekRow(row: WeekRow | undefined, weekKey: string, scope: WeekScope, fields: Partial<Omit<WeekRow, 'id'>>) {
  if (row && isOwnWeekRow(row, scope)) return WeeksService.update(row.id, fields)
  const base = row ? { status: row.status, submitted_at: row.submitted_at, confirmed_at: row.confirmed_at, retro: row.retro } : { status: 'draft' as const }
  return WeeksService.create({ ...base, week_start: weekKey, country: scope.country, channel: scope.channel, ...fields })
}

/** 確定した週の配信を変えたとき、その国・チャネルの週をレビュー中に戻す(ほかの国・チャネルの確定は、そのまま) */
export function reopenWeek(row: WeekRow, scope: WeekScope) {
  return saveWeekRow(row, row.week_start?.slice(0, 10) ?? '', scope, { status: 'review', submitted_at: new Date().toISOString() })
}
