// 学びのカード(X78)を読む。手札(結果の面の「学び」)・国のデッキ・配信カードの装備で、同じ形のカードを使う
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryResultsService, type DeliveryResult } from './data/deliveryResults'
import { AiRunsService, type AiRun } from './data/aiRuns'
import { DeliveryLiftsService, type DeliveryLift } from './data/deliveryLifts'
import { LearningReviewsService, type LearningReview } from './data/learningReviews'
import { buildImpacts } from './impact'
import { mergeResultsByCard } from './results'
import { learningUsableIn, useCountryApply } from './countryApply'
import { buildLearningCards, type LearningCardData } from './learningCards'

export interface LearningCardsState {
  cards: LearningCardData[]
  loading: boolean
  error: string | null
  /** 状態・名前を変えたあとに読み直す */
  reload: () => void
}

export function useLearningCards(allCards: DeliveryCard[], country: string): LearningCardsState {
  const [results, setResults] = useState<DeliveryResult[] | null>(null)
  const [runs, setRuns] = useState<AiRun[]>([])
  const [lifts, setLifts] = useState<DeliveryLift[]>([])
  const [reviews, setReviews] = useState<LearningReview[]>([])
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    // 名前(配信結果)と状態(判定)は、変えたら読み直す。AI の記録・増分は、開いたときだけ
    DeliveryResultsService.getAll()
      .then((r) => (r.success ? setResults(r.data ?? []) : setError(r.error?.message ?? 'results')))
      .catch((e: unknown) => setError(String(e)))
    LearningReviewsService.getAll()
      .then((r) => r.success && setReviews(r.data ?? []))
      .catch(() => undefined)
  }, [version])
  useEffect(() => {
    AiRunsService.getAll()
      .then((r) => r.success && setRuns(r.data ?? []))
      .catch(() => undefined)
    DeliveryLiftsService.getAll()
      .then((r) => r.success && setLifts(r.data ?? []))
      .catch(() => undefined)
  }, [])

  const merged = useMemo(() => (results ? mergeResultsByCard(results) : null), [results])
  const impacts = useMemo(() => (merged ? buildImpacts(allCards, merged, runs, lifts) : []), [allCards, merged, runs, lifts])
  // 国の適用を変えたら(⚙ や配信カードで)、デッキを並べ直す
  const applyVersion = useCountryApply()
  const cards = useMemo(
    () => (merged ? buildLearningCards(allCards, merged, runs, impacts, reviews, country, learningUsableIn) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCards, merged, runs, impacts, reviews, country, applyVersion],
  )
  return { cards, loading: results == null && !error, error, reload }
}
