import { Spinner, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import type { Product } from './models/products'
import { useProductMetrics, type MetricRow } from './useProductMetrics'
import { categoryMetricDefs, changeText, productMetricDefs, weekRange, type MetricDef } from './metrics'
import { locale, optionLabel, useT } from './i18n'
import { productMarket } from './market'
import { yen } from './items'

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '6px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200, fontVariantNumeric: 'tabular-nums' },
  th: { textAlign: 'right', padding: '4px 6px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightMedium, whiteSpace: 'nowrap' },
  // 段の見出し(この商品 / カテゴリ)。見出しの階層(13px 中太)
  group: { textAlign: 'left', padding: '8px 6px 3px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  groupSub: { marginLeft: '8px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3 },
  thLeft: { textAlign: 'left' },
  label: { textAlign: 'left', padding: '4px 6px', fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground2, whiteSpace: 'nowrap', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  td: { textAlign: 'right', padding: '4px 6px', whiteSpace: 'nowrap', borderBottom: `1px solid ${tokens.colorNeutralStroke3}` },
  of: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  center: { display: 'flex', justifyContent: 'center', padding: '24px 0' },
})

/** 商品のフロートの「指標」タブ: この商品と、その商品のカテゴリの、いちばん新しい週の指標(値・順位・WoW・MoM・YoY) */
export function ProductMetrics({ product: p }: { product: Product }) {
  const t = useT()
  const s = useStyles()
  const { data, error, loading } = useProductMetrics(p)
  const market = productMarket(p)

  if (loading) return <div className={s.center}><Spinner size="small" /></div>
  if (error) return <span className={s.muted}>{error}</span>
  if (!data || (data.product.length === 0 && data.category.length === 0)) {
    return <span className={s.muted}>{t('この商品の指標は、まだ取り込まれていません(⚙ の「商品・カテゴリの指標を取り込む(CSV)」)。', 'No metrics imported for this product yet (⚙ → Import product & category metrics (CSV)).')}</span>
  }

  const value = (d: MetricDef, v?: number) => {
    if (v === undefined || v === null) return '-'
    if (d.kind === 'money') return yen(Math.round(v), market)
    if (d.kind === 'rate') return `${(Math.round(v * 1000) / 10).toFixed(1)}%`
    return Math.round(v).toLocaleString(locale())
  }
  const change = (d: MetricDef, v?: number) => (
    <td className={mergeClasses(s.td, v !== undefined && v !== null && v > 0 && s.up, v !== undefined && v !== null && v < 0 && s.down)}>{changeText(v, d.kind)}</td>
  )
  const rows = (defs: MetricDef[], list: MetricRow[]) =>
    defs.map((d) => {
      const r = list.find((x) => x.metric === d.key)
      return (
        <tr key={d.key}>
          <th scope="row" className={s.label}>{d.label()}</th>
          <td className={s.td}>{value(d, r?.value)}</td>
          <td className={s.td}>
            {d.ranked && r?.rank ? (
              <>
                {t(`${r.rank}位`, `#${r.rank}`)}
                {r.rank_of ? <span className={s.of}> / {r.rank_of.toLocaleString(locale())}</span> : null}
              </>
            ) : '-'}
          </td>
          {change(d, r?.wow)}
          {change(d, r?.mom)}
          {change(d, r?.yoy)}
        </tr>
      )
    })
  const pWeek = data.product[0]?.week_start
  const cWeek = data.category[0]?.week_start
  const group = (title: string, week?: string) => (
    <tr>
      <th colSpan={6} scope="colgroup" className={s.group}>
        {title}
        {week && <span className={s.groupSub}>{t(`${weekRange(week)} の週`, `Week of ${weekRange(week)}`)}</span>}
      </th>
    </tr>
  )

  return (
    <div className={s.root}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={mergeClasses(s.th, s.thLeft)}>{t('項目', 'Metric')}</th>
            <th className={s.th}>{t('値', 'Value')}</th>
            <Tooltip relationship="description" content={t('商品は市場の全商品の中、カテゴリはカテゴリ同士での順位', 'Products rank within the whole market; categories rank among categories')}>
              <th className={s.th}>{t('順位', 'Rank')}</th>
            </Tooltip>
            <Tooltip relationship="description" content={t('前の週と比べた増減', 'Change vs the previous week')}>
              <th className={s.th}>WoW</th>
            </Tooltip>
            <Tooltip relationship="description" content={t('暦の月: 月の 1 日から週の最終日まで と、前の月の同じ日まで', 'Calendar month: month-to-date vs the same days of the previous month')}>
              <th className={s.th}>MoM</th>
            </Tooltip>
            <Tooltip relationship="description" content={t('前年の同じ週と比べた増減', 'Change vs the same week last year')}>
              <th className={s.th}>YoY</th>
            </Tooltip>
          </tr>
        </thead>
        <tbody>
          {group(t('この商品', 'This product'), pWeek)}
          {data.product.length > 0 ? rows(productMetricDefs(), data.product) : (
            <tr><td colSpan={6} className={mergeClasses(s.label, s.muted)}>{t('まだ取り込まれていません', 'Not imported yet')}</td></tr>
          )}
          {group(t(`カテゴリ: ${optionLabel(p.category_name) || p.category || '-'}`, `Category: ${optionLabel(p.category_name) || p.category || '-'}`), cWeek !== pWeek ? cWeek : undefined)}
          {data.category.length > 0 ? rows(categoryMetricDefs(), data.category) : (
            <tr><td colSpan={6} className={mergeClasses(s.label, s.muted)}>{t('まだ取り込まれていません', 'Not imported yet')}</td></tr>
          )}
        </tbody>
      </table>
      <span className={s.muted}>
        {t('数・金額の増減は %、欠品率は差(pt)。SKU 欠品率は、週の最終日の在庫が 0 の SKU の割合。', 'Changes are % for counts and amounts, and points (pt) for the stockout rate (share of SKUs with zero stock at week end).')}
      </span>
    </div>
  )
}
