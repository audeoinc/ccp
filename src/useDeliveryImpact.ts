// 詳しい結果に出す、配信 1 本の効果(ホールドアウトとの比べ・AI に渡した学び。X56)。
// 詳しい結果(ResultDetail)で 1 回だけ読み、主な数字(ResultKpis)と右の列(ResultInsights)に渡す(部品ごとに読むと、読み込みが増えるため)
import { useEffect, useState } from 'react'
import { AiRunsService } from './data/aiRuns'
import { DeliveryLiftsService } from './data/deliveryLifts'
import { DeliveryResultsService } from './data/deliveryResults'
import { DeliveryCardsService } from './data/deliveryCards'
import { LearningReviewsService } from './data/learningReviews'
import { learningIdsOf, liftOf, retiredLearningIds } from './impact'

export interface UsedLearning {
  /** 学びの id(配信結果の id) */
  id: string
  notes: string
  /** 学びの出どころの配信 */
  sourceName: string
  sourceAt: string
  /** 結果の面の「効果」で外した学び */
  retired: boolean
}

export interface DeliveryImpactInfo {
  /** ホールドアウトとの比べ(なければ null) */
  lift: { incremental: number; liftRate: number | null; windowDays?: number; holdoutRate?: number } | null
  /** AI の依頼の記録があるか(ない配信は、学びを渡したかが分からない) */
  recorded: boolean
  learnings: UsedLearning[]
}

export function useDeliveryImpact(cardId: string): DeliveryImpactInfo | null {
  const [info, setInfo] = useState<DeliveryImpactInfo | null>(null)
  useEffect(() => {
    let alive = true
    const filter = `delivery_card_id eq ${cardId}`
    void (async () => {
      try {
        const [lifts, runs, reviews] = await Promise.all([DeliveryLiftsService.getAll({ filter }), AiRunsService.getAll({ filter }), LearningReviewsService.getAll()])
        const liftRow = lifts.success ? lifts.data?.[0] : undefined
        const l = liftOf(liftRow)
        const runRows = runs.success ? (runs.data ?? []) : []
        const ids = [...new Set(runRows.flatMap(learningIdsOf))]
        const retired = retiredLearningIds(reviews.success ? (reviews.data ?? []) : [])
        // 学びの中身(配信結果のメモ)は、学びを渡したときだけ読む。出どころの配信の名前は、学びの数件だけ 1 件ずつ読む
        const all = ids.length ? await DeliveryResultsService.getAll() : null
        const byId = new Map((all?.success ? (all.data ?? []) : []).map((r) => [r.id, r]))
        const learnings = (
          await Promise.all(
            ids.map(async (id): Promise<UsedLearning | null> => {
              const r = byId.get(id)
              if (!r?.notes?.trim()) return null
              const c = r.delivery_card_id ? await DeliveryCardsService.get(r.delivery_card_id) : null
              return {
                id,
                notes: r.notes.trim(),
                sourceName: c?.success ? (c.data?.name ?? '') : '',
                sourceAt: r.sent_at ?? (c?.success ? (c.data?.scheduled_at ?? '') : ''),
                retired: retired.has(id),
              }
            }),
          )
        ).filter((x): x is UsedLearning => !!x)
        if (alive) setInfo({ lift: l ? { incremental: l.incRevenue, liftRate: l.liftRate, windowDays: liftRow?.window_days, holdoutRate: liftRow?.holdout_rate } : null, recorded: runRows.length > 0, learnings })
      } catch {
        if (alive) setInfo(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [cardId])
  return info
}
