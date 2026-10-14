import { useEffect, useState } from 'react'
import { Button, Dialog, DialogSurface, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import type { Cr854_weeklyperformances } from './generated/models/Cr854_weeklyperformancesModel'
import { Cr854_weeklyperformancesService } from './generated/services/Cr854_weeklyperformancesService'
import { Cr854_deliveryresultsService, type Cr854_deliveryresults } from './gcpdata/Cr854_deliveryresultsService'
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
  cards: Cr854_deliverycards[]
  cardProducts: Map<string, string[]>
  products: Cr854_products[]
  heroes: Cr854_heroimages[]
  onClose: () => void
  /** 配信カードを書き換えたあと(テーマの種類)、読み直す */
  onCardChanged?: () => Promise<void>
}

/**
 * 計画の面から、配信 1 本の結果を、いまの画面の上に重ねて見る(配信カードの「結果を見る」)。
 * 閉じると、元の配信カード(計画の面)に戻る
 */
export function ResultPeek({ cardId: firstId, cards, cardProducts, products, heroes, onClose, onCardChanged }: Props) {
  const styles = useStyles()
  const t = useT()
  const [results, setResults] = useState<Cr854_deliveryresults[] | null>(null)
  const [weekly, setWeekly] = useState<Cr854_weeklyperformances[]>([])
  // 過去の配信の結果に切り替えられる(閉じると、元の配信カードに戻る)
  const [cardId, setCardId] = useState(firstId)

  const load = async () => {
    const res = await Cr854_deliveryresultsService.getAll()
    setResults(res.success ? (res.data ?? []) : [])
  }
  useEffect(() => {
    Cr854_deliveryresultsService.getAll()
      .then((res) => setResults(res.success ? (res.data ?? []) : []))
      .catch(() => setResults([]))
    Cr854_weeklyperformancesService.getAll()
      .then((res) => res.success && setWeekly(res.data ?? []))
      .catch(() => undefined)
  }, [])

  const history = results ? toResultRows(cards, results) : []
  const row = history.find((r) => r.card.cr854_deliverycardid === cardId)
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
      money={(v) => priceText(v === undefined ? undefined : Math.round(v), row.card.cr854_country === COUNTRY_US ? 'US' : 'JP')}
      onClose={onClose}
      onSaved={load}
      onCardChanged={onCardChanged}
    />
  )
}
