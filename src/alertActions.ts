// アラートへの対応(バックログ A4・A5): 商品の差し替え・延期。
// 変えた理由は、配信のメモ(種類 change)に残す。確定した週の配信は、週をレビューに戻し(配信カードで確定後に変えたときと同じ)、
// 承認済み・確定の配信は「検討中」に戻す(もう一度レビューを受ける)。どちらも、承認の履歴(cr854_events)に残す
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import { Cr854_deliverycardsService } from './generated/services/Cr854_deliverycardsService'
import { Cr854_deliveryproductsService } from './generated/services/Cr854_deliveryproductsService'
import { Cr854_cardnotesService } from './gcpdata/Cr854_cardnotesService'
import { Cr854_weeksService, type Cr854_weeks } from './gcpdata/Cr854_weeksService'
import { askAgent } from './aiSelect'
import { logEvent, myName } from './history'
import { tr } from './i18n'
import { confirmedWeekOf } from './weekLock'

const STATUS_REVIEW = 588230001
const STATUS_APPROVED = 588230002

const fail = (res: { success: boolean; error?: { message: string } }, ja: string, en: string) => {
  if (!res.success) throw new Error(res.error?.message ?? tr(ja, en))
}

/**
 * 配信を変えたあとの、共通の後始末: 理由を残し、必要ならレビューに戻す。
 * weeksTouched: 変更で計画が変わる週(延期なら、移す前と移した先の両方)
 */
async function afterChange(card: Cr854_deliverycards, reason: string, backToReview: boolean, weeksTouched: (Cr854_weeks | undefined)[]) {
  const locked = [...new Map(weeksTouched.filter((w): w is Cr854_weeks => !!w).map((w) => [w.cr854_weekid, w])).values()]
  // 確定した週は、理由を残して、レビュー中に戻す(確定した計画を、黙って変えないため)
  for (const w of locked) {
    fail(await Cr854_weeksService.update(w.cr854_weekid, { cr854_status: 'review', cr854_submittedat: new Date().toISOString() }), '週をレビュー中に戻せませんでした', 'Could not put the week back in review')
  }
  fail(
    await Cr854_cardnotesService.create({
      cr854_kind: 'change',
      cr854_body: reason.trim(),
      cr854_author: myName() || card.cr854_owner || '',
      'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${card.cr854_deliverycardid})`,
    }),
    '変更の理由を記録できませんでした',
    'Could not record the reason for the change',
  )
  const from = card.cr854_status ?? 588230000
  const toReview = (backToReview || locked.length > 0) && from >= STATUS_APPROVED
  if (toReview) {
    fail(await Cr854_deliverycardsService.update(card.cr854_deliverycardid, { cr854_status: STATUS_REVIEW as Cr854_deliverycards['cr854_status'] }), 'ステータスを戻せませんでした', 'Could not change the status')
  }
  if (locked.length > 0 || toReview) {
    await logEvent({
      action: locked.length > 0 ? 'reopen' : 'revoke',
      card: { id: card.cr854_deliverycardid, name: card.cr854_name, scheduledAt: card.cr854_scheduledat },
      from,
      to: toReview ? STATUS_REVIEW : from,
      note: reason.trim(),
    })
  }
}

/** 配信の商品の行を、別の商品に差し替える */
export async function replaceProduct(args: { card: Cr854_deliverycards; rowId: string; to: Cr854_products; reason: string; backToReview: boolean; weeks: Cr854_weeks[] }) {
  const { card, rowId, to, reason, backToReview, weeks } = args
  fail(
    await Cr854_deliveryproductsService.update(rowId, {
      'cr854_product@odata.bind': `/cr854_products(${to.cr854_productid})`,
      cr854_name: `${card.cr854_name ?? ''} / ${to.cr854_name ?? ''}`,
      cr854_reason: reason.trim(),
    }),
    '商品を差し替えられませんでした',
    'Could not replace the product',
  )
  await afterChange(card, reason, backToReview, [confirmedWeekOf(weeks, card.cr854_scheduledat)])
}

/** 配信を延期する(配信日時を移す) */
export async function postponeDelivery(args: { card: Cr854_deliverycards; to: string; reason: string; backToReview: boolean; weeks: Cr854_weeks[] }) {
  const { card, to, reason, backToReview, weeks } = args
  const iso = new Date(to).toISOString()
  fail(await Cr854_deliverycardsService.update(card.cr854_deliverycardid, { cr854_scheduledat: iso }), '配信日時を変えられませんでした', 'Could not change the date')
  await afterChange({ ...card, cr854_scheduledat: iso }, reason, backToReview, [confirmedWeekOf(weeks, card.cr854_scheduledat), confirmedWeekOf(weeks, iso)])
}

// ---- 差し替えの候補(AI が、在庫のある同じカテゴリの商品から選ぶ)

export interface ReplacementCandidate {
  product: Cr854_products
  /** 配信日の在庫の見込み(何週分) */
  weeksLeft?: number
  projected: number
  thisWeek: number
  lastWeek: number
}

const REPLACE_PROMPT = `あなたは、ファッション通販の配信(メール・プッシュ)の企画を手伝うアシスタントです。
配信に載せていた商品(removed)が、在庫が持たない見込みになりました。下の「入力」の candidates(在庫のある、同じカテゴリの商品)から、
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
export async function suggestReplacements(args: { card: Cr854_deliverycards; removed: Cr854_products; candidates: ReplacementCandidate[] }): Promise<{ c: ReplacementCandidate; reason: string }[]> {
  const { card, removed, candidates } = args
  const byRule = () =>
    [...candidates]
      .sort((a, b) => a.thisWeek + a.lastWeek - (b.thisWeek + b.lastWeek) || (b.weeksLeft ?? 0) - (a.weeksLeft ?? 0))
      .slice(0, 3)
      .map((c) => ({ c, reason: '' }))
  if (candidates.length === 0) return []
  const parsed = (await askAgent(REPLACE_PROMPT, {
    task: 'suggest_replacements',
    delivery: { name: card.cr854_name, theme: card.cr854_theme, date: (card.cr854_scheduledat ?? '').slice(0, 10) },
    removed: { name: removed.cr854_name, price: removed.cr854_price, category: removed.cr854_category },
    candidates: candidates.map((c) => ({
      id: c.product.cr854_productid,
      name: c.product.cr854_name,
      price: c.product.cr854_price,
      rating: c.product.cr854_rating,
      weeksLeft: c.weeksLeft === undefined ? null : Math.round(c.weeksLeft * 10) / 10,
      thisWeek: c.thisWeek,
      lastWeek: c.lastWeek,
    })),
  })) as { picks?: { id?: string; reason?: string }[] }
  const picks = (parsed.picks ?? [])
    .map((x) => ({ c: candidates.find((c) => c.product.cr854_productid === x.id), reason: String(x.reason ?? '').trim() }))
    .filter((x): x is { c: ReplacementCandidate; reason: string } => !!x.c)
    .slice(0, 3)
  return picks.length > 0 ? picks : byRule()
}
