// 配信の取りやめ(バックログ A4)。取りやめた配信は、消さずに残す(経緯をあとで見返せるように)。
// カレンダー(月・週・一覧)には、取り消し線と「取りやめ」の印で薄く出し、アラート・週の確認・件数からは外す(2026-10-15 利用者の判断)
import type { CSSProperties } from 'react'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import { Cr854_deliverycardsService } from './generated/services/Cr854_deliverycardsService'
import { Cr854_cardnotesService } from './gcpdata/Cr854_cardnotesService'
import { Cr854_weeksService, type Cr854_weeks } from './gcpdata/Cr854_weeksService'
import { logEvent, myName } from './history'
import { tr } from './i18n'
import { confirmedWeekOf } from './weekLock'

/** 取りやめた配信か */
export const isCancelled = (c?: Pick<Cr854_deliverycards, 'cr854_cancelledat'>) => !!c?.cr854_cancelledat

/** 取りやめた配信の見た目(薄く、取り消し線) */
export const CANCELLED_STYLE: CSSProperties = { opacity: 0.55, textDecoration: 'line-through' }

const fail = (res: { success: boolean; error?: { message: string } }, ja: string, en: string) => {
  if (!res.success) throw new Error(res.error?.message ?? tr(ja, en))
}

/**
 * 配信を取りやめる。理由は、配信の列(cr854_cancelreason)と、配信のメモ(種類 change)の両方に残す。
 * 確定した週の配信なら、週をレビュー中に戻し、承認の履歴に残す(確定した計画が変わるため)
 */
export async function cancelDelivery(card: Cr854_deliverycards, reason: string, weeks: Cr854_weeks[]) {
  const now = new Date().toISOString()
  fail(await Cr854_deliverycardsService.update(card.cr854_deliverycardid, { cr854_cancelledat: now, cr854_cancelreason: reason.trim() }), '取りやめにできませんでした', 'Could not cancel the delivery')
  fail(
    await Cr854_cardnotesService.create({
      cr854_kind: 'change',
      cr854_body: tr(`取りやめ: ${reason.trim()}`, `Cancelled: ${reason.trim()}`),
      cr854_author: myName() || card.cr854_owner || '',
      'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${card.cr854_deliverycardid})`,
    }),
    '取りやめの理由を記録できませんでした',
    'Could not record the reason',
  )
  const week = confirmedWeekOf(weeks, card.cr854_scheduledat)
  if (week) {
    fail(await Cr854_weeksService.update(week.cr854_weekid, { cr854_status: 'review', cr854_submittedat: now }), '週をレビュー中に戻せませんでした', 'Could not put the week back in review')
    await logEvent({
      action: 'reopen',
      card: { id: card.cr854_deliverycardid, name: card.cr854_name, scheduledAt: card.cr854_scheduledat },
      from: card.cr854_status,
      to: card.cr854_status,
      note: tr(`取りやめ: ${reason.trim()}`, `Cancelled: ${reason.trim()}`),
    })
  }
}

/** 取りやめを取り消す(配信を元に戻す) */
export async function undoCancel(card: Cr854_deliverycards) {
  fail(await Cr854_deliverycardsService.update(card.cr854_deliverycardid, { cr854_cancelledat: null as unknown as string, cr854_cancelreason: '' }), '取りやめを取り消せませんでした', 'Could not undo the cancellation')
  await Cr854_cardnotesService.create({
    cr854_kind: 'change',
    cr854_body: tr('取りやめを取り消した', 'Undid the cancellation'),
    cr854_author: myName() || card.cr854_owner || '',
    'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${card.cr854_deliverycardid})`,
  })
}
