import { useEffect, useState } from 'react'
import { Button, Dialog, DialogSurface, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { WeeklyPerformance } from './models/weeklyPerformances'
import { WeeklyPerformancesService } from './data/weeklyPerformances'
import { DeliveryResultsService, type DeliveryResult } from './data/deliveryResults'
import { priceText, useT } from './i18n'
import { ResultDetail } from './ResultDetail'
import { COUNTRY_US, toResultRows } from './results'

const useStyles = makeStyles({
  surface: { width: '420px', display: 'grid', rowGap: '12px', justifyItems: 'start' },
  muted: { color: tokens.colorNeutralForeground3 },
})

interface Props {
  /** 結果を見る配信 */
  cardId: string
  /** すべての配信(前週比の計算に使う) */
  cards: DeliveryCard[]
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
  onClose: () => void
}

/**
 * 計画の面から、配信 1 本の結果を、いまの画面の上に重ねて見る(配信カードの「結果を見る」)。
 * 閉じると、元の配信カード(計画の面)に戻る
 */
export function ResultPeek({ cardId: firstId, cards, cardProducts, products, heroes, onClose }: Props) {
  const styles = useStyles()
  const t = useT()
  const [results, setResults] = useState<DeliveryResult[] | null>(null)
  const [weekly, setWeekly] = useState<WeeklyPerformance[]>([])
  // 過去の配信の結果に切り替えられる(閉じると、元の配信カードに戻る)
  const [cardId, setCardId] = useState(firstId)

  const load = async () => {
    const res = await DeliveryResultsService.getAll()
    setResults(res.success ? (res.data ?? []) : [])
  }
  useEffect(() => {
    DeliveryResultsService.getAll()
      .then((res) => setResults(res.success ? (res.data ?? []) : []))
      .catch(() => setResults([]))
    WeeklyPerformancesService.getAll()
      .then((res) => res.success && setWeekly(res.data ?? []))
      .catch(() => undefined)
  }, [])

  const history = results ? toResultRows(cards, results) : []
  const row = history.find((r) => r.card.id === cardId)
  if (!row) {
    return (
      <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
        <DialogSurface className={styles.surface}>
          {results === null ? <Spinner /> : <span className={styles.muted}>{t('この配信の結果は、まだ取り込まれていません', 'No results have been imported for this delivery yet')}</span>}
          <Button onClick={onClose}>{t('閉じる', 'Close')}</Button>
        </DialogSurface>
      </Dialog>
    )
  }
  return (
    <ResultDetail
      key={cardId}
      row={row}
      history={history}
      cardProducts={cardProducts}
      onOpenOther={setCardId}
      productIds={cardProducts.get(cardId) ?? []}
      products={products}
      heroes={heroes}
      weekly={weekly}
      money={(v) => priceText(v === undefined ? undefined : Math.round(v), row.card.country === COUNTRY_US ? 'US' : 'JP')}
      onClose={onClose}
      onSaved={load}
    />
  )
}
