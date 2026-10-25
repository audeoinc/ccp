import { Badge, Spinner, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import type { Product } from './models/products'
import { sortSizes, stockoutRate, useProductSkus, type SkuRow } from './useProductSkus'
import { locale, num, useT } from './i18n'

/** SKU の在庫が少ないとみなす数(SPU の残少 50 を、SKU に割った目安) */
const LOW_SKU = 3

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '10px' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', columnGap: '8px' },
  kpi: { display: 'grid', rowGap: '1px', padding: '6px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
  kpiLabel: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
  kpiValue: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' },
  kpiSub: { marginLeft: '6px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground3 },
  bad: { color: tokens.colorPaletteRedForeground1 },
  sectionTitle: { display: 'flex', alignItems: 'center', columnGap: '8px', color: tokens.colorNeutralForeground2, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold },
  scroll: { overflowX: 'auto', minWidth: 0 },
  table: { borderCollapse: 'separate', borderSpacing: '3px', fontSize: tokens.fontSizeBase200, fontVariantNumeric: 'tabular-nums' },
  th: { padding: '2px 6px', color: tokens.colorNeutralForeground3, fontWeight: tokens.fontWeightMedium, whiteSpace: 'nowrap', textAlign: 'center' },
  rowHead: { padding: '2px 8px 2px 0', color: tokens.colorNeutralForeground2, fontWeight: tokens.fontWeightRegular, whiteSpace: 'nowrap', textAlign: 'left' },
  cell: { minWidth: '44px', padding: '5px 6px', textAlign: 'center', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground2, color: tokens.colorNeutralForeground1 },
  out: { backgroundColor: tokens.colorPaletteRedBackground1, color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  low: { backgroundColor: tokens.colorPaletteYellowBackground1, color: tokens.colorPaletteMarigoldForeground2 },
  none: { backgroundColor: 'transparent', color: tokens.colorNeutralForeground4 },
  legend: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '12px', rowGap: '4px', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase100 },
  swatch: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', marginRight: '4px', verticalAlign: 'middle', border: `1px solid ${tokens.colorNeutralStroke1}` },
  muted: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  center: { display: 'flex', justifyContent: 'center', padding: '24px 0' },
})

/** 横の見出し: サイズ(丈があれば「サイズ / 丈」) */
const sizeKey = (r: SkuRow) => (r.length ? `${r.size} / ${r.length}` : r.size || '—')

/** 商品のフロートの「SKU」タブ(X63): いまの在庫から計算した欠品率と、色 × サイズの在庫の表 */
export function ProductSkus({ product: p }: { product: Product }) {
  const t = useT()
  const s = useStyles()
  const { data, error, loading } = useProductSkus(p)

  if (loading) return <div className={s.center}><Spinner size="small" /></div>
  if (error) return <span className={s.muted}>{error}</span>
  if (!data || data.length === 0) {
    return <span className={s.muted}>{t('この商品の SKU は、まだありません(本物は BigQuery から入ります。試すときは ⚙ の「見本の SKU を作る」)。', 'No SKUs for this product yet (real ones come from BigQuery; to try it, use ⚙ → Create sample SKUs).')}</span>
  }

  const outCount = data.filter((r) => r.stock <= 0).length
  const rate = stockoutRate(data)
  const total = data.reduce((n, r) => n + r.stock, 0)
  const colors = [...new Set(data.map((r) => r.color || '—'))]
  const sizes = sortSizes([...new Set(data.map(sizeKey))])
  const byKey = new Map(data.map((r) => [`${r.color || '—'}|${sizeKey(r)}`, r]))
  const asOf = data.reduce((a, r) => ((r.as_of ?? '') > a ? (r.as_of ?? '') : a), '')
  const sample = data.some((r) => r.sample)

  return (
    <div className={s.root}>
      <div className={s.kpis}>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>{t('SKU 欠品率', 'SKU stockout rate')}</span>
          <span className={mergeClasses(s.kpiValue, outCount > 0 && s.bad)}>{`${(Math.round(rate * 1000) / 10).toFixed(1)}%`}</span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>{t('欠品の SKU', 'SKUs out of stock')}</span>
          <span className={s.kpiValue}>
            {num(outCount)}
            <span className={s.kpiSub}>{t(`/ ${num(data.length)} SKU`, `of ${num(data.length)}`)}</span>
          </span>
        </div>
        <div className={s.kpi}>
          <span className={s.kpiLabel}>{t('在庫の合計', 'Total stock')}</span>
          <span className={s.kpiValue}>{t(`${num(total)}個`, `${num(total)} units`)}</span>
        </div>
      </div>

      <span className={s.sectionTitle}>
        {t('色 × サイズの在庫', 'Stock by color and size')}
        {/* 見本(⚙ で作った SKU)は、本物と取り違えないように印を出す */}
        {sample && (
          <Tooltip content={t('⚙ の「見本の SKU を作る」で作った SKU です(色・サイズは仮。在庫の合計は商品の在庫に合わせています)。BigQuery の SKU が入ると、置き換わります', 'Created with ⚙ → Create sample SKUs (placeholder colors and sizes; total matches product stock). Replaced when BigQuery SKUs arrive.')} relationship="description">
            <Badge size="small" appearance="tint" color="warning">{t('見本', 'Sample')}</Badge>
          </Tooltip>
        )}
      </span>
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th} />
              {sizes.map((z) => (
                <th key={z} scope="col" className={s.th}>{z}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colors.map((c) => (
              <tr key={c}>
                <th scope="row" className={s.rowHead}>{c}</th>
                {sizes.map((z) => {
                  const r = byKey.get(`${c}|${z}`)
                  if (!r) return <td key={z} className={mergeClasses(s.cell, s.none)}>—</td>
                  const tip = [r.sku_code, r.units_4w !== undefined && r.units_4w !== null ? t(`直近 4 週の販売 ${num(r.units_4w)}個`, `${num(r.units_4w)} sold in 4 weeks`) : ''].filter(Boolean).join(' ・ ')
                  return (
                    <Tooltip key={z} content={tip} relationship="description">
                      <td className={mergeClasses(s.cell, r.stock <= 0 ? s.out : r.stock <= LOW_SKU && s.low)} tabIndex={0}>
                        {num(r.stock)}
                      </td>
                    </Tooltip>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.legend}>
        <span><span className={mergeClasses(s.swatch, s.out)} />{t('欠品(0)', 'Out (0)')}</span>
        <span><span className={mergeClasses(s.swatch, s.low)} />{t(`残少(${LOW_SKU} 以下)`, `Low (${LOW_SKU} or less)`)}</span>
        <span>{t('— はその組み合わせの SKU がない', '— means no SKU for that combination')}</span>
      </div>
      <span className={s.muted}>
        {t(
          `いまの在庫から計算しています${asOf ? `(時点 ${new Date(asOf).toLocaleString(locale())})` : ''}。「指標」のタブの欠品率は、週の最終日の在庫で数えた値なので、ずれることがあります。`,
          `Calculated from current stock${asOf ? ` (as of ${new Date(asOf).toLocaleString(locale())})` : ''}. The rate in the Metrics tab uses stock on the last day of the week, so the two can differ.`,
        )}
      </span>
    </div>
  )
}
