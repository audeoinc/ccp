import { useLayoutEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import { HeatPreview } from './HeatPreview'
import { locale, useLang, useT } from './i18n'
import { isPush, localDate, pct, type ResultRow } from './results'

const useStyles = makeStyles({
  grid: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, overflow: 'hidden' },
  dow: { padding: '4px 6px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  day: { minHeight: '96px', padding: '4px', borderRight: `1px solid ${tokens.colorNeutralStroke2}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'grid', alignContent: 'start', rowGap: '4px', minWidth: 0 },
  dayOut: { backgroundColor: tokens.colorNeutralBackground3 },
  dayNum: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, fontVariantNumeric: 'tabular-nums' },
  today: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  // 配信 1 本(押すと、詳しい結果)
  chip: {
    display: 'grid',
    rowGap: '1px',
    padding: '3px 6px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeftWidth: '3px',
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    minWidth: 0,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  chipNone: { color: tokens.colorNeutralForeground3, backgroundColor: tokens.colorNeutralBackground2 },
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
  cards: Cr854_deliverycards[]
  /** 配信カード ID → 結果の行 */
  results: Map<string, ResultRow>
  /** 金額の表記(配信の国の通貨) */
  money: (v: number | undefined, card: Cr854_deliverycards) => string
  /** 押したとき(結果があれば詳しい結果、なければ配信カード) */
  onOpen: (cardId: string) => void
}

const DOW_JA = ['日', '月', '火', '水', '木', '金', '土']
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// 前年比の色(左や上の線)。よければ緑、悪ければ赤、比べられなければ灰色
const trendColor = (r?: ResultRow) =>
  r?.vsLastYear === undefined ? tokens.colorNeutralStroke1 : r.vsLastYear >= 0 ? tokens.colorPaletteGreenBorderActive : tokens.colorPaletteRedBorderActive

function useDelta() {
  const styles = useStyles()
  return (v?: number) => (v === undefined ? null : <span className={v >= 0 ? styles.up : styles.down}>{`${v >= 0 ? '▲' : '▼'}${Math.abs(Math.round(v * 100))}%`}</span>)
}

const byDay = (cards: Cr854_deliverycards[]) => {
  const m = new Map<string, Cr854_deliverycards[]>()
  for (const c of [...cards].sort((a, b) => (a.cr854_scheduledat ?? '').localeCompare(b.cr854_scheduledat ?? ''))) {
    const k = localDate(c.cr854_scheduledat)
    m.set(k, [...(m.get(k) ?? []), c])
  }
  return m
}

/** 月の表示: カレンダーに、配信ごとの売上・開封率・前年比を出す */
export function ResultsMonth({ month, cards, results, money, onOpen }: Props & { month: Date }) {
  const styles = useStyles()
  const t = useT()
  const lang = useLang()
  const delta = useDelta()
  const days = byDay(cards)
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay())
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const count = Math.ceil((first.getDay() + last.getDate()) / 7) * 7
  const today = localDate(new Date().toISOString())
  return (
    <div className={styles.grid}>
      {(lang === 'ja' ? DOW_JA : DOW_EN).map((d) => (
        <div key={d} className={styles.dow}>{d}</div>
      ))}
      {Array.from({ length: count }, (_, i) => {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
        const key = localDate(d.toISOString())
        const inMonth = d.getMonth() === month.getMonth()
        return (
          <div key={key} className={mergeClasses(styles.day, !inMonth && styles.dayOut)}>
            <span className={mergeClasses(styles.dayNum, key === today && styles.today)}>{d.getDate()}</span>
            {(days.get(key) ?? []).map((c) => {
              const r = results.get(c.cr854_deliverycardid)
              return (
                <button key={c.cr854_deliverycardid} type="button" className={mergeClasses(styles.chip, !r && styles.chipNone)} style={{ borderLeftColor: trendColor(r) }} onClick={() => onOpen(c.cr854_deliverycardid)}>
                  <span className={styles.chipName} title={c.cr854_name}>{`${isPush(c) ? t('アプリ', 'App') : t('メール', 'Email')} · ${c.cr854_name}`}</span>
                  {r ? (
                    <span className={styles.chipNums}>
                      <span>{money(r.revenue, c)}</span>
                      <span>{isPush(c) ? t(`タップ ${pct(r.clickRate)}`, `Tap ${pct(r.clickRate)}`) : t(`開封 ${pct(r.openRate)}`, `Open ${pct(r.openRate)}`)}</span>
                      {delta(r.vsLastYear)}
                    </span>
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
}: Props & { weekStart: Date; cardProducts: Map<string, string[]>; products: Cr854_products[]; heroes: Cr854_heroimages[] }) {
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
              const r = results.get(c.cr854_deliverycardid)
              const ids = cardProducts.get(c.cr854_deliverycardid) ?? []
              return (
                <button key={c.cr854_deliverycardid} type="button" className={mergeClasses(styles.tile, !r && styles.chipNone)} style={{ borderTopColor: trendColor(r) }} onClick={() => onOpen(c.cr854_deliverycardid)}>
                  <span className={styles.chipName} title={c.cr854_name}>{`${isPush(c) ? t('アプリ', 'App') : t('メール', 'Email')} · ${c.cr854_name}`}</span>
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
