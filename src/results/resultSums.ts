// 結果の行の合計(キャンペーンの合計。保存せず、子の配信の結果から計算する。X89・X79 (c))
import { isPush, type ResultRow } from '../results'
import type { WeeklyPerformance } from '../models/weeklyPerformances'

/** 結果の行の合計(キャンペーンの合計。結果のシンプルな画面の帯・ペインでも使う) */
export interface Sum {
  recipients: number
  /** メールの送った数(開封率の分母。アプリは開封率を出さない) */
  emailRecipients: number
  opens: number
  /** クリック(アプリは通知のタップ) */
  clicks: number
  orders: number
  revenue: number
}

export const sumOf = (rows: ResultRow[]): Sum =>
  rows.reduce<Sum>(
    (a, r) => {
      const push = isPush(r.card)
      const rec = Number(r.result.recipients ?? 0)
      return {
        recipients: a.recipients + rec,
        emailRecipients: a.emailRecipients + (push ? 0 : rec),
        opens: a.opens + (push ? 0 : Number(r.result.opens ?? 0)),
        clicks: a.clicks + Number((push ? r.result.opens : r.result.clicks) ?? 0),
        orders: a.orders + Number(r.result.orders ?? 0),
        revenue: a.revenue + r.revenue,
      }
    },
    { recipients: 0, emailRecipients: 0, opens: 0, clicks: 0, orders: 0, revenue: 0 },
  )

/**
 * 配信の週の、商品の売れ方(週ごとの実績があれば)。前の週と比べた販売の増減と、在庫が何週分あるか。
 * 週ごとの実績は商品コードで持っているので、商品コードで引く
 */
export function productWeekOf(weekly: WeeklyPerformance[], code: string | undefined, sentAt: string | undefined): { change?: number; stockWeeks?: number } | undefined {
  const sent = new Date(sentAt ?? '')
  if (!code || Number.isNaN(sent.getTime())) return undefined
  const rowsOf = weekly.filter((w) => w.product_code === code).sort((a, b) => (a.week_start ?? '').localeCompare(b.week_start ?? ''))
  const i = rowsOf.findIndex((w) => {
    const s = new Date(`${w.week_start}T00:00:00`)
    return s.getTime() <= sent.getTime() && sent.getTime() < s.getTime() + 7 * 24 * 3600_000
  })
  if (i <= 0) return undefined
  const now = rowsOf[i]
  const before = rowsOf[i - 1]
  return {
    change: before.units ? (now.units ?? 0) / before.units - 1 : undefined,
    stockWeeks: now.units ? (now.stock ?? 0) / now.units : undefined,
  }
}
