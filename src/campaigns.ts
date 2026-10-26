// キャンペーン(配信カードの親。X79)の決まりを、関数で持つ。
// キャンペーン(親) › 配信カード(子) › AB の案(孫)。キャンペーンは名前・国・テーマ・目的だけを持ち、
// 配信日・状態は子のカードから出す(二重に持つと、食い違ったときにどちらが正か分からなくなるため)。
// 入れる条件(同じ国・同じ配信日)も、データの形ではなく、ここの確かめとして持つ(条件はあとで変えるかもしれない、と利用者。
// 将来、日をまたげるようにするときは、canJoinCampaign の日付の確かめを外すだけで済む)
import type { Campaign } from './models/campaigns'
import { DeliveryCardChannel, type DeliveryCard, type DeliveryCardFields } from './models/deliveryCards'
import { statusRank } from './status'
import { isCancelled } from './cancel'
import { localDate, ymd } from './dates'
import { optionLabel, tr } from './i18n'

type CardLike = Pick<DeliveryCard, 'id' | 'campaign_id' | 'status' | 'cancelled_at' | 'country' | 'scheduled_at'>

/** そのキャンペーンの子の配信カード(取りやめたものも含む) */
export const cardsOfCampaign = <C extends Pick<DeliveryCard, 'campaign_id'>>(campaignId: string, cards: C[]): C[] =>
  cards.filter((c) => c.campaign_id === campaignId)

/**
 * キャンペーンの状態 = 子のカードのうち、いちばん遅れている状態(statusRank で比べる)。
 * 取りやめたカードは、待つ相手ではないので数えない。すべて取りやめなら、それらの中でいちばん遅れているもの。
 * 子がないときは undefined
 */
export function campaignStatusOf(children: Pick<DeliveryCard, 'status' | 'cancelled_at'>[]): DeliveryCard['status'] | undefined {
  const live = children.filter((c) => !isCancelled(c))
  const pool = live.length ? live : children
  if (!pool.length) return undefined
  return pool.reduce((a, b) => (statusRank(b.status) < statusRank(a.status) ? b : a)).status ?? 'not_started'
}

/** キャンペーンの配信日(子のカードの、ブラウザの時刻での日付 YYYY-MM-DD)。日付のある子がなければ空 */
export const campaignDateOf = (children: Pick<DeliveryCard, 'scheduled_at'>[]): string =>
  children.map((c) => localDate(c.scheduled_at)).find(Boolean) ?? ''

/**
 * そのカードを、キャンペーンに入れてよいか。入れられないときは、理由の文(画面にそのまま出せる)。入れてよければ null。
 * 条件: キャンペーンと同じ国、きょうだい(取りやめていない、ほかの子)と同じ配信日。時刻はカードごとに違ってよい。
 * 同じチャネルのカードが 2 枚あってもよい
 */
export function canJoinCampaign(
  card: Pick<DeliveryCard, 'id' | 'country' | 'scheduled_at'>,
  campaign: Pick<Campaign, 'id' | 'country'>,
  cards: CardLike[],
): string | null {
  if (campaign.country && card.country && campaign.country !== card.country)
    return tr(`キャンペーンの国(${campaign.country})と、配信の国(${card.country})が違います`, `The campaign's country (${campaign.country}) differs from the delivery's (${card.country})`)
  const day = localDate(card.scheduled_at)
  const siblings = cardsOfCampaign(campaign.id, cards).filter((c) => c.id !== card.id && !isCancelled(c))
  const other = siblings.map((c) => localDate(c.scheduled_at)).find((d) => d && d !== day)
  if (other) return tr(`キャンペーンの配信日(${other})と、配信日(${day || '未定'})が違います`, `The campaign's date (${other}) differs from the delivery's (${day || 'not set'})`)
  return null
}

/** チャネルの名前(画面の言葉。メール / プッシュ) */
const channelName = (channel?: string | null) => (channel ? optionLabel(DeliveryCardChannel[channel as keyof typeof DeliveryCardChannel] ?? channel) : '')

/** 配信カードの名前(「キャンペーン名 + チャネル」。人が別に付けない) */
export const cardNameFor = (campaignName: string, channel?: string | null): string =>
  [campaignName.trim(), channelName(channel)].filter(Boolean).join(' ')

/**
 * キャンペーンの配信日を動かしたときの、子のカードの新しい日時(ISO)。日付だけを変え、時刻(ブラウザの時刻)はそのまま。
 * 日時のないカードは、そのまま空
 */
export function movedScheduledAt(scheduledAt: string | undefined, newDay: string): string | undefined {
  if (!scheduledAt) return scheduledAt
  const at = new Date(scheduledAt)
  const [y, m, d] = newDay.split('-').map(Number)
  const moved = new Date(y, m - 1, d, at.getHours(), at.getMinutes(), at.getSeconds(), at.getMilliseconds())
  return ymd(moved) === newDay ? moved.toISOString() : scheduledAt
}

/**
 * テーマを変えて、AI に中身を作り直してもらったカードに書く値(X79 の段 ⑤。2026-10-26 利用者が決めた)。
 * 中身が変わるので、状態は未起案に戻し、制作に渡した印も消す。承認の依頼(approval_requests)と
 * 制作の受け渡し(production_requests)の記録は、REMAKE_CLEARED_TABLES の表から、そのカードの行を消す
 */
export const remakeResetFields = (): Partial<DeliveryCardFields> => ({
  status: 'not_started',
  handed_off_at: null as unknown as string,
})

/** 作り直したカードについて、行を消す表(どれも delivery_card_id でカードにつながる) */
export const REMAKE_CLEARED_TABLES = ['approval_requests', 'production_requests'] as const
