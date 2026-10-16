// 配信の取りやめ(バックログ A4)。取りやめた配信は、消さずに残す(経緯をあとで見返せるように)。
// カレンダー(月・週・一覧)には、取り消し線と「取りやめ」の印で薄く出し、アラート・週の確認・件数からは外す(2026-10-15 利用者の判断)
import type { CSSProperties } from 'react'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryCardsService } from './data/deliveryCards'
import { CardNotesService } from './data/cardNotes'
import { WeeksService, type WeekRow } from './data/weeks'
import { logEvent, myName } from './history'
import { tr } from './i18n'
import { confirmedWeekOf } from './weekLock'

/** 取りやめた配信か */
export const isCancelled = (c?: Pick<DeliveryCard, 'cancelled_at'>) => !!c?.cancelled_at

/** 取りやめた配信の見た目(薄く、取り消し線) */
export const CANCELLED_STYLE: CSSProperties = { opacity: 0.55, textDecoration: 'line-through' }

const fail = (res: { success: boolean; error?: { message: string } }, ja: string, en: string) => {
  if (!res.success) throw new Error(res.error?.message ?? tr(ja, en))
}

/**
 * 配信を取りやめる。理由は、配信の列(cancel_reason)と、配信のメモ(種類 change)の両方に残す。
 * 確定した週の配信なら、週をレビュー中に戻し、承認の履歴に残す(確定した計画が変わるため)
 */
export async function cancelDelivery(card: DeliveryCard, reason: string, weeks: WeekRow[]) {
  const now = new Date().toISOString()
  fail(await DeliveryCardsService.update(card.id, { cancelled_at: now, cancel_reason: reason.trim() }), '取りやめにできませんでした', 'Could not cancel the delivery')
  fail(
    await CardNotesService.create({
      kind: 'change',
      body: tr(`取りやめ: ${reason.trim()}`, `Cancelled: ${reason.trim()}`),
      author: myName() || card.owner || '',
      delivery_card_id: card.id,
    }),
    '取りやめの理由を記録できませんでした',
    'Could not record the reason',
  )
  const week = confirmedWeekOf(weeks, card.scheduled_at)
  if (week) {
    fail(await WeeksService.update(week.id, { status: 'review', submitted_at: now }), '週をレビュー中に戻せませんでした', 'Could not put the week back in review')
    await logEvent({
      action: 'reopen',
      card: { id: card.id, name: card.name, scheduledAt: card.scheduled_at },
      from: card.status,
      to: card.status,
      note: tr(`取りやめ: ${reason.trim()}`, `Cancelled: ${reason.trim()}`),
    })
  }
}

/** 取りやめを取り消す(配信を元に戻す) */
export async function undoCancel(card: DeliveryCard) {
  fail(await DeliveryCardsService.update(card.id, { cancelled_at: null as unknown as string, cancel_reason: '' }), '取りやめを取り消せませんでした', 'Could not undo the cancellation')
  await CardNotesService.create({
    kind: 'change',
    body: tr('取りやめを取り消した', 'Undid the cancellation'),
    author: myName() || card.owner || '',
    delivery_card_id: card.id,
  })
}
