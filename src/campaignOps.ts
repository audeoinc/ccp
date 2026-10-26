// キャンペーン(X79)の操作: まとめての承認(段 ④ の 5)と、作る・足す(段 ④ の 6)。
// 承認は、週の帯のまとめての承認(weekApprovals.ts)と同じ関数を、キャンペーンの子のカードに絞って呼ぶだけ(窓口と決まりを複製しない)。
// 送る前の確かめは、開いているカードと同じ readinessOf を、保存した中身から組み立てて使う
import type { Campaign } from './models/campaigns'
import type { DeliveryCard, DeliveryCardFields } from './models/deliveryCards'
import { CampaignsService } from './data/campaigns'
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import type { Actor } from './data/approvals'
import type { CardAlert } from './cardAlerts'
import { campaignDateOf, cardDisplayName, cardNameFor, cardsOfCampaign } from './campaigns'
import { isCancelled } from './cancel'
import { duplicateDelivery } from './duplicate'
import { STATE_SELECTED } from './items'
import { tr } from './i18n'
import type { People } from './people'
import { readinessOf, type ReadinessItem } from './simple/readiness'
import { CHANNEL_PUSH } from './status'
import { slotsOf, templateKeyOfCard } from './templates'
import type { InboxItem } from './useApprovalInbox'
import { approveMine, needsRequest, requestAll } from './weekApprovals'
import { weekKeyOf } from './weekLock'

const fail = (res: { success: boolean; error?: { message: string } }, ja: string, en: string) => {
  if (!res.success) throw new Error(res.error?.message ?? tr(ja, en))
}

/** キャンペーンの、取りやめていない子のカード(時刻の順) */
export const liveChildren = (campaignId: string, cards: DeliveryCard[]): DeliveryCard[] =>
  cardsOfCampaign(campaignId, cards)
    .filter((c) => !isCancelled(c))
    .sort((a, b) => String(a.scheduled_at ?? '').localeCompare(String(b.scheduled_at ?? '')))

/** 履歴に残す週(子のカードの配信日の週。日付のある子がなければ、いまの週) */
const weekOf = (cards: Pick<DeliveryCard, 'scheduled_at'>[]) => {
  const day = campaignDateOf(cards)
  return weekKeyOf(day ? new Date(`${day}T00:00:00`) : new Date())
}

/** 保存したカードの、選んだ商品(A 案。並びの順)の id */
async function selectedProductIds(cardId: string): Promise<string[]> {
  const r = await DeliveryProductsService.getAll({ filter: `delivery_card_id eq ${cardId}`, orderBy: ['sort_order asc'] })
  fail(r, '載せた商品を読めませんでした', 'Could not load the products in this delivery')
  return (r.data ?? []).filter((x) => x.state === STATE_SELECTED && !x.variant && x.product_id).map((x) => x.product_id!)
}

/** 保存した中身からの、送る前の確かめ(承認の前。開いているカードの SimpleCardLayout と同じ項目) */
export function cardReadiness(card: DeliveryCard, productIds: string[], alerts: CardAlert[] = []): ReadinessItem[] {
  return readinessOf({
    channel: card.channel === CHANNEL_PUSH ? 'push' : 'email',
    purpose: 'approval',
    subject: card.subject ?? '',
    name: card.name,
    preheader: card.preheader ?? '',
    pushTitle: card.push_title ?? '',
    pushBody: card.push_body ?? '',
    headline: card.headline ?? '',
    copy: card.copy ?? '',
    hasHero: !!card.hero_image_id,
    items: productIds.map((id) => ({ key: id, productId: id })),
    slots: card.channel === CHANNEL_PUSH ? 0 : slotsOf(templateKeyOfCard(card)),
    alerts,
    status: card.status ?? 'not_started',
    productionOwner: card.production_owner ?? '',
    productionDue: card.production_due ?? '',
  })
}

/** 確かめに通らなかったカードと、その項目 */
export interface CampaignIssue {
  card: DeliveryCard
  /** 画面に出す名前(キャンペーン名 + チャネル) */
  name: string
  issues: ReadinessItem[]
}

/** まとめて依頼する前の確かめ。通らない(警告・止めるものが 1 つでもある)カードだけを返す */
export async function checkBeforeRequest(cards: DeliveryCard[], campaign: Pick<Campaign, 'id' | 'name'>, alertsOf?: (cardId: string) => CardAlert[] | undefined): Promise<CampaignIssue[]> {
  const out: CampaignIssue[] = []
  for (const c of cards) {
    const issues = cardReadiness(c, await selectedProductIds(c.id), alertsOf?.(c.id)).filter((i) => i.level !== 'ok')
    if (issues.length) out.push({ card: c, name: cardDisplayName(c, [campaign]), issues })
  }
  return out
}

/** まとめて依頼の対象(承認されておらず、依頼中でもない子のカード) */
export const campaignRequestable = (children: DeliveryCard[], hasOpen: (cardId: string) => boolean) => needsRequest(children, hasOpen)

/**
 * 子のカードを、まとめて承認に出す(週の帯と同じ requestAll。既定の相手と決まりは、カードの国のもの)。
 * 確かめ(checkBeforeRequest)は、呼ぶ側で先に行う(通らないカードの名前を見せて止めるため)。
 * 返すのは、既定の相手がいなくて飛ばしたカードの名前
 */
export async function requestCampaign(cards: DeliveryCard[], campaign: Pick<Campaign, 'id' | 'name'>, people: People, actor: Actor): Promise<string[]> {
  const named = cards.map((c) => ({ ...c, name: cardDisplayName(c, [campaign]) }))
  const { skipped } = await requestAll(named, people, actor, weekOf(cards))
  return skipped
}

/** 自分宛ての、子のカードの依頼を、まとめて承認する(週の帯と同じ approveMine) */
export const approveCampaign = (mine: InboxItem[], children: DeliveryCard[], actor: Actor) => approveMine(mine, actor, weekOf(children))

/** 新しいキャンペーンの入力(最初のカード 1 枚と一緒に作る) */
export interface NewCampaignInput {
  name: string
  country: string
  channel: string
  /** 配信日時(datetime-local の値) */
  scheduledAt: string
  purpose?: string
  themeType?: string
}

/** キャンペーンと、最初のカード 1 枚を作る。カードの name には、控えとして「キャンペーン名 + チャネル」を書く(表示は cardDisplayName) */
export async function createCampaignWithCard(input: NewCampaignInput): Promise<{ campaignId: string; cardId: string }> {
  const name = input.name.trim()
  const camp = await CampaignsService.create({
    name,
    country: input.country,
    ...(input.purpose?.trim() ? { purpose: input.purpose.trim() } : {}),
    ...(input.themeType ? { theme_type: input.themeType } : {}),
    state_code: 0,
  })
  fail(camp, 'キャンペーンを作れませんでした', 'Could not create the campaign')
  const campaignId = camp.data?.id
  if (!campaignId) throw new Error(tr('キャンペーンの ID を取得できませんでした', 'Could not get the campaign ID'))
  const card = await DeliveryCardsService.create({
    name: cardNameFor(name, input.channel),
    scheduled_at: new Date(input.scheduledAt).toISOString(),
    country: input.country as DeliveryCardFields['country'],
    channel: input.channel as DeliveryCardFields['channel'],
    status: 'not_started',
    ...(input.themeType ? { theme_type: input.themeType } : {}),
    campaign_id: campaignId,
    state_code: 0,
  })
  fail(card, '配信カードを作れませんでした', 'Could not create the delivery card')
  const cardId = card.data?.id
  if (!cardId) throw new Error(tr('新しい配信カードの ID を取得できませんでした', 'Could not get the new delivery card ID'))
  return { campaignId, cardId }
}

/** 足すカードの初めのチャネル: きょうだいにないチャネル(メールだけならアプリ、アプリだけならメール)。両方あればメール */
export function nextChannel(children: Pick<DeliveryCard, 'channel'>[]): string {
  const has = new Set(children.map((c) => c.channel))
  return has.has('email') && !has.has(CHANNEL_PUSH) ? CHANNEL_PUSH : 'email'
}

/** 足すカードの入力 */
export interface AddCardInput {
  channel: string
  /** 時刻(HH:MM)。日付はキャンペーンの配信日 */
  time: string
  /** 中身を写すきょうだい(なければ、キャンペーンの情報だけの空のカード) */
  copyFrom?: DeliveryCard
}

/**
 * キャンペーンにカードを足す。国・配信日・テーマはキャンペーンから入れる(入れる条件「同じ国・同じ配信日」に、作ったときから合う)。
 * 中身を写すときは、複製(duplicate.ts)と同じ写し方で、チャネル・キャンペーン・国だけを上書きする
 */
export async function addCardToCampaign(campaign: Campaign, cards: DeliveryCard[], input: AddCardInput): Promise<string> {
  const day = campaignDateOf(liveChildren(campaign.id, cards)) || campaignDateOf(cardsOfCampaign(campaign.id, cards))
  if (!day) throw new Error(tr('キャンペーンの配信日が分かりません', 'The campaign has no send date'))
  const scheduledAt = `${day}T${input.time || '10:00'}`
  const name = cardNameFor(campaign.name, input.channel)
  const common = {
    channel: input.channel as DeliveryCardFields['channel'],
    country: (campaign.country || input.copyFrom?.country) as DeliveryCardFields['country'],
    campaign_id: campaign.id,
  }
  if (input.copyFrom) return duplicateDelivery(input.copyFrom, name, scheduledAt, common)
  const res = await DeliveryCardsService.create({
    ...common,
    name,
    scheduled_at: new Date(scheduledAt).toISOString(),
    status: 'not_started',
    ...(campaign.theme ? { theme: campaign.theme } : {}),
    ...(campaign.theme_reason ? { theme_reason: campaign.theme_reason } : {}),
    ...(campaign.theme_type ? { theme_type: campaign.theme_type } : {}),
    state_code: 0,
  })
  fail(res, '配信カードを作れませんでした', 'Could not create the delivery card')
  const id = res.data?.id
  if (!id) throw new Error(tr('新しい配信カードの ID を取得できませんでした', 'Could not get the new delivery card ID'))
  return id
}
