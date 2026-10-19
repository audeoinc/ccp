import { useLayoutEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { HeatPreview } from './HeatPreview'
import { ChannelBadge } from './ChannelBadge'
import { Calendar } from './Calendar'
import { locale, useT } from './i18n'
import { isPush, localDate, pct, type ResultRow } from './results'

const useStyles = makeStyles({
  chipNone: { color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground2 },
  noResult: { color: tokens.colorNeutralForeground3 },
  chipName: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chipNums: { display: 'flex', flexWrap: 'wrap', columnGap: '6px', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground2, fontVariantNumeric: 'tabular-nums' },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 },
  // 週: 日ごとの列に、プレビューの縮小と数字
  week: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', columnGap: '8px' },
  weekCol: { display: 'grid', alignContent: 'start', rowGap: '8px', minWidth: 0 },
  weekHead: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, paddingBottom: '4px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, fontVariantNumeric: 'tabular-nums' },
  tile: {
    display: 'grid',
    rowGap: '6px',
    padding: '6px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderTopWidth: '3px',
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    minWidth: 0,
    ':hover': { boxShadow: tokens.shadow4 },
  },
  nums: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', columnGap: '6px', flexWrap: 'wrap', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, fontVariantNumeric: 'tabular-nums' },
  big: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  heat: { display: 'flex', justifyContent: 'center', paddingTop: '2px' },
  empty: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground4, padding: '8px 0' },
})

interface Props {
  /** 表示する期間の配信(絞り込み済み。結果がまだのものも含む) */
  cards: DeliveryCard[]
  /** 配信カード ID → 結果の行 */
  results: Map<string, ResultRow>
  /** 金額の表記(配信の国の通貨) */
  money: (v: number | undefined, card: DeliveryCard) => string
  /** 押したとき(結果があれば詳しい結果、なければ配信カード) */
  onOpen: (cardId: string) => void
  /** 月の表示で、週の行から、その週の週表示へ移る */
  onOpenWeek?: (sunday: Date) => void
}

// 前年比の色(左や上の線)。よければ緑、悪ければ赤、比べられなければ灰色
const trendColor = (r?: ResultRow) =>
  r?.vsLastYear === undefined ? tokens.colorNeutralStroke1 : r.vsLastYear >= 0 ? tokens.colorPaletteGreenBorderActive : tokens.colorPaletteRedBorderActive

function useDelta() {
  const styles = useStyles()
  return (v?: number) => (v === undefined ? null : <span className={v >= 0 ? styles.up : styles.down}>{`${v >= 0 ? '▲' : '▼'}${Math.abs(Math.round(v * 100))}%`}</span>)
}

const byDay = (cards: DeliveryCard[]) => {
  const m = new Map<string, DeliveryCard[]>()
  for (const c of [...cards].sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))) {
    const k = localDate(c.scheduled_at)
    m.set(k, [...(m.get(k) ?? []), c])
  }
  return m
}

/**
 * 月の表示: 計画の面と同じカレンダー(Calendar)に、配信ごとの売上・開封率・前年比を出す。
 * 計画と結果は同じ配信の表と裏なので、カレンダーの形・箱の 1 行目(アイコン + 名前)はそろえ、2 行目と色だけを変える
 * (左の線 = 前年比。地の色 = 結果があれば白、なければ灰色)
 */
export function ResultsMonth({ month, cards, results, money, onOpen, onOpenWeek }: Props & { month: Date }) {
  const styles = useStyles()
  const t = useT()
  const delta = useDelta()
  return (
    <Calendar
      month={month}
      cards={cards}
      onSelect={onOpen}
      onOpenWeek={onOpenWeek}
      chipTone={(c) => {
        const r = results.get(c.id)
        return { line: trendColor(r), background: r ? tokens.colorNeutralBackground1 : tokens.colorNeutralBackground3 }
      }}
      renderMeta={(c) => {
        const r = results.get(c.id)
        if (!r) return <span className={styles.noResult}>{t('結果なし', 'No results')}</span>
        return (
          <>
            <span>{money(r.revenue, c)}</span>
            <span>{isPush(c) ? t(`タップ ${pct(r.clickRate)}`, `Tap ${pct(r.clickRate)}`) : t(`開封 ${pct(r.openRate)}`, `Open ${pct(r.openRate)}`)}</span>
            {delta(r.vsLastYear)}
          </>
        )
      }}
    />
  )
}

/** 週の表示: 日ごとに、クリックを重ねたプレビューと、主な数字を並べる。1 週間の配信で、どこに載せた何が押されたかを、比べて見るため。押すと、詳しい結果 */
export function ResultsWeek({
  weekStart,
  cards,
  results,
  money,
  onOpen,
  cardProducts,
  products,
  heroes,
}: Props & { weekStart: Date; cardProducts: Map<string, string[]>; products: Product[]; heroes: HeroImage[] }) {
  const styles = useStyles()
  const t = useT()
  const delta = useDelta()
  const days = byDay(cards)
  // プレビューは、日の列の幅に合わせて縮める(列の幅は、画面の幅で変わる)
  const gridRef = useRef<HTMLDivElement>(null)
  const [colW, setColW] = useState(160)
  useLayoutEffect(() => {
    const el = gridRef.current
    if (!el) return
    const measure = () => setColW(Math.max(100, Math.floor((el.clientWidth - 8 * 6) / 7) - 14))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={gridRef} className={styles.week}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)
        const key = localDate(d.toISOString())
        const list = days.get(key) ?? []
        return (
          <div key={key} className={styles.weekCol}>
            <div className={styles.weekHead}>{d.toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })}</div>
            {list.length === 0 && <div className={styles.empty}>—</div>}
            {list.map((c) => {
              const r = results.get(c.id)
              const ids = cardProducts.get(c.id) ?? []
              return (
                <button
                  key={c.id}
                  type="button"
                  className={mergeClasses(styles.tile, !r && styles.chipNone)}
                  // 上の線の色 = 前年比。メールとアプリは、形ではなく名前の前の札で見分ける(計画の面と同じ)
                  style={{ borderTopColor: trendColor(r) }}
                  onClick={() => onOpen(c.id)}
                >
                  <span className={styles.chipName} title={c.name}>
                    {/* 計画の面・月の表示と同じ、塗りつぶしのチャネルの札 */}
                    <ChannelBadge channel={c.channel} size="icon" />
                    {c.name}
                  </span>
                  {r ? (
                    <>
                      <span className={styles.nums}>
                        <span className={styles.big}>{money(r.revenue, c)}</span>
                        {delta(r.vsLastYear)}
                      </span>
                      <span className={styles.nums}>
                        <span>{isPush(c) ? t(`タップ ${pct(r.clickRate)}`, `Tap ${pct(r.clickRate)}`) : t(`開封 ${pct(r.openRate)}`, `Open ${pct(r.openRate)}`)}</span>
                        {!isPush(c) && <span>{t(`クリック ${pct(r.clickRate)}`, `Click ${pct(r.clickRate)}`)}</span>}
                      </span>
                      <span className={styles.heat}>
                        <HeatPreview row={r} productIds={ids} products={products} heroes={heroes} width={colW} compact />
                      </span>
                    </>
                  ) : (
                    <span className={styles.chipNums}>{t('結果なし', 'No results')}</span>
                  )}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
