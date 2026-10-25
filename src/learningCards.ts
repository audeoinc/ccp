// 学びのカード(X78)の中身。学び 1 つ(配信結果の「次に生かすメモ」1 つ)を、カード 1 枚の形にまとめる。
// 強さ・使われた回数・最後に使った日は、列に持たずに、AI の依頼の記録(ai_runs)と効果の評価(impact.ts の evaluateLearnings)から求める
// (結果が増えるたびに、自然に強くなる・弱くなるように。持つと、直し忘れで食い違うため)
import type { DeliveryCard } from './models/deliveryCards'
import type { DeliveryResult } from './data/deliveryResults'
import type { AiRun } from './data/aiRuns'
import type { LearningReview } from './data/learningReviews'
import { evaluateLearnings, learningIdsOf, reviewIn, type DeliveryImpact, type Diff } from './impact'
import { learningTitle } from './learningEquip'
import { themeTypeOf, type ThemeType } from './themeTypes'
import { templateIdOf } from './results'
import { tr } from './i18n'

/** 学びの状態(国ごと)。使う = 残す・様子を見る・まだ決めていない / 休ませる / 外す */
export type LearningState = 'use' | 'resting' | 'retired'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export interface LearningCardData {
  /** 学びの id(配信結果の id) */
  id: string
  title: string
  /** 人が付けた名前(空なら、title はメモの 1 行目から) */
  customTitle: string
  notes: string
  /** 学びの元の配信 */
  source: DeliveryCard
  sentAt: string
  /** 効く条件(元の配信から) */
  origin: string
  channel: string
  themeType: ThemeType
  templateId: string
  season: Season | null
  /** 選んでいる国での状態(国を選んでいなければ、出元の国での状態) */
  state: LearningState
  review?: LearningReview
  /** 選んでいる国で使う学びか(国のデッキに入っているか)。国を選んでいなければ true */
  inDeck: boolean
  /** AI に渡した配信の数(この学びを渡した配信の数) */
  uses: number
  /** 最後に AI に渡した日 */
  lastUsed: string
  /** 効き目(渡した配信と渡さなかった配信の、リフト率の差。X56 の ④) */
  lift: Diff
  /** 強さ(1〜5)。比べる材料が足りなければ null */
  strength: number | null
}

/** 送った月の季節(北半球。南の国の配信が増えたら、国ごとにずらす) */
export function seasonOf(iso: string): Season | null {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return null
  const m = d.getMonth() + 1
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'
}

export function seasonLabel(s: Season): string {
  return s === 'spring' ? tr('春', 'Spring') : s === 'summer' ? tr('夏', 'Summer') : s === 'autumn' ? tr('秋', 'Autumn') : tr('冬', 'Winter')
}

export function stateLabel(s: LearningState): string {
  return s === 'use' ? tr('使う', 'In use') : s === 'resting' ? tr('休ませる', 'Resting') : tr('外す', 'Retired')
}

/**
 * 強さ(1〜5)。効き目の判定から: 上がった 5 / 差はあるが幅の中で上向き 4 / 下向き 2 / 下がった 1。
 * 比べる配信が 3 本に満たなければ null(「材料不足」と出す。点を付けると、確かな数字に見えるため)
 */
export function strengthOf(lift: Diff): number | null {
  if (lift.verdict === 'few' || lift.diff == null) return null
  if (lift.verdict === 'up') return 5
  if (lift.verdict === 'down') return 1
  return lift.diff > 0 ? 4 : lift.diff < 0 ? 2 : 3
}

const stateOf = (review?: LearningReview): LearningState => (review?.status === 'retired' ? 'retired' : review?.status === 'resting' ? 'resting' : 'use')

/**
 * すべての学びをカードにする(results は mergeResultsByCard を通したもの)。
 * country を選んでいれば、その国で使う学びはその国の配信で評価し、状態もその国のもの。ほかは出元の国のもの(inDeck = false)
 */
export function buildLearningCards(
  allCards: DeliveryCard[],
  results: DeliveryResult[],
  runs: AiRun[],
  impacts: DeliveryImpact[],
  reviews: LearningReview[],
  country: string,
  usableIn: (id: string, origin: string, country: string) => boolean,
): LearningCardData[] {
  const atOrigin = new Map(evaluateLearnings(allCards, results, impacts, reviews, '', usableIn).map((e) => [e.id, e]))
  const inCountry = country ? new Map(evaluateLearnings(allCards, results, impacts, reviews, country, usableIn).map((e) => [e.id, e])) : null
  // 学びごとの、渡した配信と最後の日(同じ配信に何度頼んでも 1 本と数える)
  const usedBy = new Map<string, { cards: Set<string>; last: string }>()
  for (const r of runs) {
    for (const id of learningIdsOf(r)) {
      const u = usedBy.get(id) ?? { cards: new Set<string>(), last: '' }
      if (r.delivery_card_id) u.cards.add(r.delivery_card_id)
      if ((r.created_on ?? '') > u.last) u.last = r.created_on ?? ''
      usedBy.set(id, u)
    }
  }
  const byId = new Map(results.map((r) => [r.id, r]))
  const out: LearningCardData[] = []
  for (const e of atOrigin.values()) {
    const here = inCountry?.get(e.id)
    const ev = here ?? e
    const origin = String(e.source.country ?? '')
    const review = country && !here ? reviewIn(reviews, e.id, origin, origin) : ev.review
    const u = usedBy.get(e.id)
    out.push({
      id: e.id,
      title: learningTitle(byId.get(e.id) ?? { notes: e.notes }),
      customTitle: byId.get(e.id)?.learning_title?.trim() ?? '',
      notes: e.notes,
      source: e.source,
      sentAt: e.sourceAt,
      origin,
      channel: String(e.source.channel ?? ''),
      themeType: themeTypeOf(e.source).type,
      templateId: templateIdOf(e.source),
      season: seasonOf(e.sourceAt),
      state: stateOf(review),
      review,
      inDeck: !country || !!here,
      uses: u?.cards.size ?? 0,
      lastUsed: u?.last ?? '',
      lift: ev.lift,
      strength: strengthOf(ev.lift),
    })
  }
  return out
}

export type LearningSort = 'strength' | 'newest' | 'uses'

export function sortLearningCards(list: LearningCardData[], by: LearningSort): LearningCardData[] {
  const s = [...list]
  if (by === 'newest') return s.sort((a, b) => b.sentAt.localeCompare(a.sentAt))
  if (by === 'uses') return s.sort((a, b) => b.uses - a.uses || b.sentAt.localeCompare(a.sentAt))
  // 強い順: 材料不足は、点のあるものの後ろ(同じ強さなら、使われた回数の多い順)
  return s.sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0) || b.uses - a.uses || b.sentAt.localeCompare(a.sentAt))
}
