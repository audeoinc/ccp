// アラートへの対応(バックログ A4・A5): 商品の差し替え・延期。
// 変えた理由は、配信のメモ(種類 change)に残す。確定した週の配信は、週をレビューに戻し(配信カードで確定後に変えたときと同じ)、
// 承認済み・確定の配信は「検討中」に戻す(もう一度レビューを受ける)。どちらも、承認の履歴(events)に残す
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import { CardNotesService } from './data/cardNotes'
import { WeeksService, type WeekRow } from './data/weeks'
import { askAgent } from './aiSelect'
import { logEvent, myName } from './history'
import { tr } from './i18n'
import { confirmedWeekOf } from './weekLock'
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
    fail(await WeeksService.update(w.id, { status: 'review', submitted_at: new Date().toISOString() }), '週をレビュー中に戻せませんでした', 'Could not put the week back in review')
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
  await afterChange(card, reason, backToReview, [confirmedWeekOf(weeks, card.scheduled_at)])
}

/** 配信を延期する(配信日時を移す) */
export async function postponeDelivery(args: { card: DeliveryCard; to: string; reason: string; backToReview: boolean; weeks: WeekRow[] }) {
  const { card, to, reason, backToReview, weeks } = args
  const iso = new Date(to).toISOString()
  fail(await DeliveryCardsService.update(card.id, { scheduled_at: iso }), '配信日時を変えられませんでした', 'Could not change the date')
  await afterChange({ ...card, scheduled_at: iso }, reason, backToReview, [confirmedWeekOf(weeks, card.scheduled_at), confirmedWeekOf(weeks, iso)])
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

const REPLACE_PROMPT = `あなたは、ファッション通販の配信(メール・プッシュ)の企画を手伝うアシスタントです。
配信に載せていた商品(removed)を、ほかの商品に差し替えます(差し替える理由は、入力の why)。下の「入力」の candidates(在庫のある、同じカテゴリの商品)から、
差し替えにふさわしいものを 3 つまで選び、JSON だけで返してください。

# 出力の形式(厳守)
次の JSON オブジェクト 1 つだけを返す。JSON の外には、説明文、コードフェンス、前置き、あとがきを一切付けない。
{"picks":[{"id":"...","reason":"..."}]}

# ルール
1. id は candidates の id をそのまま。ふさわしい順に並べる。
2. 配信のテーマ(delivery.theme)と、外す商品(removed)の役割(価格帯・見せ方)に近いものを選ぶ。
3. 配信日の在庫(weeksLeft)に余裕があるものを選ぶ。今週・前週に多く載せている商品(thisWeek・lastWeek)は、なるべく避ける。
4. reason は、選んだ理由を、数字(在庫の週数・価格など)を入れて 50 文字以内で。

# 入力
`

/** AI に差し替えの候補を選んでもらう。AI が使えないときは、在庫に余裕があり、訴求の少ない順に 3 つ */
/** why は差し替える理由(在庫のアラートでは、在庫が持たない見込み。作業画面では、週の上限を超えた) */
export async function suggestReplacements(args: { card: DeliveryCard; removed: Product; candidates: ReplacementCandidate[]; why?: string }): Promise<{ c: ReplacementCandidate; reason: string }[]> {
  const { card, removed, candidates } = args
  const byRule = () =>
    [...candidates]
      .sort((a, b) => a.thisWeek + a.lastWeek - (b.thisWeek + b.lastWeek) || (b.weeksLeft ?? 0) - (a.weeksLeft ?? 0))
      .slice(0, 3)
      .map((c) => ({ c, reason: '' }))
  if (candidates.length === 0) return []
  const parsed = (await askAgent(REPLACE_PROMPT, {
    task: 'suggest_replacements',
    why: args.why ?? '在庫が持たない見込み',
    delivery: { name: card.name, theme: card.theme, date: (card.scheduled_at ?? '').slice(0, 10) },
    removed: { name: removed.name, price: removed.price, category: removed.category },
    candidates: candidates.map((c) => ({
      id: c.product.id,
      name: c.product.name,
      price: c.product.price,
      rating: c.product.rating,
      weeksLeft: c.weeksLeft === undefined ? null : Math.round(c.weeksLeft * 10) / 10,
      thisWeek: c.thisWeek,
      lastWeek: c.lastWeek,
    })),
  })) as { picks?: { id?: string; reason?: string }[] }
  const picks = (parsed.picks ?? [])
    .map((x) => ({ c: candidates.find((c) => c.product.id === x.id), reason: String(x.reason ?? '').trim() }))
    .filter((x): x is { c: ReplacementCandidate; reason: string } => !!x.c)
    .slice(0, 3)
  return picks.length > 0 ? picks : byRule()
}
