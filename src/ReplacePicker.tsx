import { useEffect, useState } from 'react'
import { Button, Spinner, makeStyles, tokens } from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { StockModel } from './alerts'
import { replacementCandidates, suggestReplacements, type ReplacementCandidate } from './alertActions'
import { ImageThumb } from './ImageThumb'
import { productImage } from './images'
import { yen } from './items'
import { productMarket } from './market'
import { WEEKLY_PRODUCT_LIMIT } from './reviewChecks'
import { useT } from './i18n'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '8px', width: 'min(420px, 86vw)' },
  title: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  hint: { fontSize: '12px', color: tokens.colorNeutralForeground2 },
  pick: { display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', columnGap: '10px', alignItems: 'center', padding: '6px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  name: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  meta: { fontSize: '12px', color: tokens.colorNeutralForeground2 },
  why: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
})

interface Props {
  /** 差し替える商品が載っている案(保存する前の、仮の配信カード) */
  card: DeliveryCard
  removed: Product
  /** この案に載っている商品(候補から除く) */
  inCard: string[]
  products: Product[]
  model: StockModel
  /** この週に、商品を載せる配信の数(作業画面の案も入れる。上限に届いた商品は、候補から除く) */
  weekUse: Map<string, number>
  onPick: (to: { id: string; reason: string }) => void
}

/**
 * 作業画面の、週の上限を超えた商品の差し替え。
 * 配信カードのアラートへの対応(X30)と同じ決め方(同じカテゴリで、配信日に在庫が持つ商品。AI が 3 つ選ぶ)に、
 * 「この週に、上限まで載せた商品は選ばない」を足す
 */
export function ReplacePicker({ card, removed, inCard, products, model, weekUse, onPick }: Props) {
  const s = useStyles()
  const t = useT()
  const [picks, setPicks] = useState<{ c: ReplacementCandidate; reason: string }[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const candidates = replacementCandidates({ card, removed, products, model, inCard: new Set(inCard), when: card.scheduled_at ?? '' }).filter(
      (c) => (weekUse.get(c.product.id) ?? 0) < WEEKLY_PRODUCT_LIMIT,
    )
    suggestReplacements({ card, removed, candidates, why: t(`この週に ${WEEKLY_PRODUCT_LIMIT} 本を超えて載せている`, `featured in more than ${WEEKLY_PRODUCT_LIMIT} deliveries this week`) })
      .then((r) => !cancelled && setPicks(r))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
    // 開いたときに 1 回だけ選ぶ(選んでいる間に、ほかの案が変わっても選び直さない)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={s.root}>
      <span className={s.title}>{t(`「${removed.name}」の差し替え`, `Replace “${removed.name}”`)}</span>
      <span className={s.hint}>
        {t(
          `同じカテゴリで、配信日に在庫があり、この週にまだ ${WEEKLY_PRODUCT_LIMIT} 本載せていない商品から、AI が選びました。選ぶと、この案の中で置き換わります(確定は「保存」)。`,
          `AI picked items of the same category with stock on the date and fewer than ${WEEKLY_PRODUCT_LIMIT} uses this week. Picking one replaces it in this draft (confirm with Save).`,
        )}
      </span>
      {error && <span className={s.why}>{error}</span>}
      {!picks && !error && <Spinner size="tiny" label={t('候補を選んでいます', 'Finding candidates')} />}
      {picks && picks.length === 0 && <span className={s.hint}>{t('差し替えられる商品がありません。「開いて編集」で、配信カードの中で選んでください。', 'No candidates. Use “Open & edit” to choose in the card.')}</span>}
      {picks?.map(({ c, reason }) => (
        <div key={c.product.id} className={s.pick}>
          <ImageThumb src={productImage(c.product)} alt={c.product.name} width={48} height={60} />
          <div>
            <div className={s.name}>{c.product.name}</div>
            <div className={s.meta}>
              {[
                c.product.price !== undefined ? yen(c.product.price, productMarket(c.product)) : '',
                c.weeksLeft !== undefined ? t(`在庫 ${Math.round(c.weeksLeft * 10) / 10} 週分`, `${Math.round(c.weeksLeft * 10) / 10} wks of stock`) : '',
                t(`今週 ${weekUse.get(c.product.id) ?? 0} 本`, `${weekUse.get(c.product.id) ?? 0} this week`),
              ]
                .filter(Boolean)
                .join(' ・ ')}
            </div>
            {reason && <div className={s.why}>{reason}</div>}
          </div>
          <Button size="small" appearance="primary" onClick={() => onPick({ id: c.product.id, reason })}>
            {t('これにする', 'Use this')}
          </Button>
        </div>
      ))}
    </div>
  )
}
