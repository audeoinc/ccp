// アラートへの対応(バックログ A4・A5): 商品の差し替え・延期。
// 変えた理由は、配信のメモ(種類 change)に残す。確定した週の配信は、週をレビューに戻し(配信カードで確定後に変えたときと同じ)、
// 承認済み・確定の配信は「検討中」に戻す(もう一度レビューを受ける)。どちらも、承認の履歴(events)に残す
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import { CardNotesService } from './data/cardNotes'
import type { WeekRow } from './data/weeks'
import { logEvent, myName } from './history'
import { tr } from './i18n'
import { confirmedWeekOf, reopenWeek, scopeOfCard } from './weekLock'
import { statusRank } from './status'
import { LOW_STOCK_WEEKS, type StockModel } from './alerts'

const STATUS_REVIEW = 'reviewing'
const STATUS_APPROVED = 'approved'

const fail = (res: { success: boolean; error?: { message: string } }, ja: string, en: string) => {
  if (!res.success) throw new Error(res.error?.message ?? tr(ja, en))
}

/**
 * 配信を変えたあとの、共通の後始末: 理由を残し、必要ならレビューに戻す。
 * weeksTouched: 変更で計画が変わる週(延期なら、移す前と移した先の両方)
 */
async function afterChange(card: DeliveryCard, reason: string, backToReview: boolean, weeksTouched: (WeekRow | undefined)[]) {
  const locked = [...new Map(weeksTouched.filter((w): w is WeekRow => !!w).map((w) => [w.id, w])).values()]
  // 確定した週は、理由を残して、レビュー中に戻す(確定した計画を、黙って変えないため)
  for (const w of locked) {
    fail(await reopenWeek(w, scopeOfCard(card)), '週の確定を解けませんでした', 'Could not undo the week confirmation')
  }
  fail(
    await CardNotesService.create({
      kind: 'change',
      body: reason.trim(),
      author: myName() || card.owner || '',
      delivery_card_id: card.id,
    }),
    '変更の理由を記録できませんでした',
    'Could not record the reason for the change',
  )
  const from = card.status ?? 'not_started'
  const toReview = (backToReview || locked.length > 0) && statusRank(from) >= statusRank(STATUS_APPROVED)
  if (toReview) {
    fail(await DeliveryCardsService.update(card.id, { status: STATUS_REVIEW as DeliveryCard['status'] }), 'ステータスを戻せませんでした', 'Could not change the status')
  }
  if (locked.length > 0 || toReview) {
    await logEvent({
      action: locked.length > 0 ? 'reopen' : 'revoke',
      card: { id: card.id, name: card.name, scheduledAt: card.scheduled_at },
      from,
      to: toReview ? STATUS_REVIEW : from,
      note: reason.trim(),
    })
  }
}

/** 配信の商品の行を、別の商品に差し替える */
export async function replaceProduct(args: { card: DeliveryCard; rowId: string; to: Product; reason: string; backToReview: boolean; weeks: WeekRow[] }) {
  const { card, rowId, to, reason, backToReview, weeks } = args
  fail(
    await DeliveryProductsService.update(rowId, {
      product_id: to.id,
      name: `${card.name ?? ''} / ${to.name ?? ''}`,
      reason: reason.trim(),
    }),
    '商品を差し替えられませんでした',
    'Could not replace the product',
  )
  await afterChange(card, reason, backToReview, [confirmedWeekOf(weeks, card.scheduled_at, scopeOfCard(card))])
}

/** 配信を延期する(配信日時を移す) */
export async function postponeDelivery(args: { card: DeliveryCard; to: string; reason: string; backToReview: boolean; weeks: WeekRow[] }) {
  const { card, to, reason, backToReview, weeks } = args
  const iso = new Date(to).toISOString()
  fail(await DeliveryCardsService.update(card.id, { scheduled_at: iso }), '配信日時を変えられませんでした', 'Could not change the date')
  await afterChange({ ...card, scheduled_at: iso }, reason, backToReview, [confirmedWeekOf(weeks, card.scheduled_at, scopeOfCard(card)), confirmedWeekOf(weeks, iso, scopeOfCard(card))])
}

// ---- 差し替えの候補(AI が、在庫のある同じカテゴリの商品から選ぶ)

export interface ReplacementCandidate {
  product: Product
  /** 配信日の在庫の見込み(何週分) */
  weeksLeft?: number
  projected: number
  thisWeek: number
  lastWeek: number
}

/**
 * 差し替えの候補: 配信の国の市場の、同じカテゴリの商品で、配信日に在庫が持つもの(この配信に載っている商品は除く)。
 * アラートの画面の差し替えと、配信カードの中での差し替えで、同じ決め方を使う
 */
export function replacementCandidates(args: { card: DeliveryCard; removed: Product; products: Product[]; model: StockModel; inCard: Set<string>; when: string }): ReplacementCandidate[] {
  const { card, removed, products, model, inCard, when } = args
  const market = card.country === 'US' ? 'US' : 'JP'
  return products
    .filter((p) => p.market === market && p.category === removed.category && !inCard.has(p.id))
    .map((p) => {
      const { projected, weeksLeft } = model.projectAt(p, when, card.id)
      return { product: p, projected, weeksLeft, ...model.exposures(p.id, when) }
    })
    .filter((c) => c.projected - model.upliftOf(c.product) > 0 && (c.weeksLeft === undefined || c.weeksLeft >= LOW_STOCK_WEEKS))
}
