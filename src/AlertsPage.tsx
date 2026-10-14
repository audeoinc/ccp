import { useState } from 'react'
import { Badge, Button, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { OpenRegular } from '@fluentui/react-icons'
import { LOW_STOCK_WEEKS, type AffectedDelivery, type StockAlert } from './alerts'
import { locale, optionLabel, useT } from './i18n'
import { CHANNEL_PUSH, statusColor, statusOptions } from './status'

const useStyles = makeStyles({
  root: { display: 'grid', gridTemplateColumns: '300px minmax(0, 1fr)', columnGap: '20px', alignItems: 'start' },
  // 左: アラートの一覧
  list: { display: 'grid', rowGap: '8px', position: 'sticky', top: '72px' },
  listHead: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, marginBottom: '2px' },
  item: {
    display: 'grid',
    rowGap: '2px',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderLeftWidth: '4px',
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    textAlign: 'left',
    font: 'inherit',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '-1px' },
  itemKind: { display: 'flex', alignItems: 'center', columnGap: '6px', fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase300 },
  itemName: { fontSize: tokens.fontSizeBase200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  itemSub: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  // 右: 選んだアラート
  detail: { display: 'grid', rowGap: '12px', minWidth: 0 },
  title: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  facts: { display: 'flex', flexWrap: 'wrap', columnGap: '8px', rowGap: '8px' },
  fact: { padding: '6px 12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  factLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  factValue: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' },
  tableWrap: { overflowX: 'auto', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase300, fontVariantNumeric: 'tabular-nums' },
  th: { textAlign: 'left', padding: '6px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2, fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  td: { padding: '6px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'nowrap' },
  num: { textAlign: 'right' },
  name: { fontWeight: tokens.fontWeightSemibold },
  dot: { display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', marginRight: '6px' },
  bad: { color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  warn: { color: tokens.colorPaletteDarkOrangeForeground1, fontWeight: tokens.fontWeightSemibold },
  empty: { padding: '40px', textAlign: 'center', color: tokens.colorNeutralForeground3 },
  how: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, lineHeight: tokens.lineHeightBase300 },
})

interface Props {
  alerts: StockAlert[]
  /** 配信カードを開く */
  onOpenCard: (id: string) => void
}

const KIND_COLOR = { outOfStock: tokens.colorPaletteRedBorderActive, lowStock: tokens.colorPaletteDarkOrangeBorderActive }

/**
 * アラートの画面(ワイヤーフレーム 12)。左に、配信に影響する変更(いまは在庫切れ・在庫僅少)の一覧。
 * 選ぶと、右に、影響を受ける、まだ送っていない配信と、商品が載っている場所、配信日の在庫の見込みを出す
 */
export function AlertsPage({ alerts, onOpenCard }: Props) {
  const styles = useStyles()
  const t = useT()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = alerts.find((a) => a.id === selectedId) ?? alerts[0]

  const kindLabel = (a: StockAlert) => (a.kind === 'outOfStock' ? t('在庫切れの見込み', 'Out of stock (expected)') : t('在庫僅少', 'Low stock'))
  const dateText = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' }) : '')
  const n = (v: number) => Math.round(v).toLocaleString(locale())
  // 一覧の説明: 在庫切れは、在庫がなくなる配信。在庫僅少は、売り切れる配信か、残りの週数
  const summary = (a: StockAlert) => {
    if (a.stock <= 0) return t('いま在庫がありません', 'Out of stock now')
    const out = a.deliveries.find((d) => d.problem === 'soldOut')
    if (a.kind === 'outOfStock' && out) return t(`${dateText(out.card.cr854_scheduledat)} の配信の時点で在庫がない見込み`, `None left by ${dateText(out.card.cr854_scheduledat)}`)
    const d = a.deliveries.find((x) => x.problem !== 'none')
    if (!d) return ''
    return d.after < 0 || d.weeksLeft === undefined
      ? t(`${dateText(d.card.cr854_scheduledat)} の配信で売り切れる見込み`, `May sell out with ${dateText(d.card.cr854_scheduledat)}`)
      : t(`${dateText(d.card.cr854_scheduledat)} に ${d.weeksLeft.toFixed(1)} 週分`, `${d.weeksLeft.toFixed(1)} wks left on ${dateText(d.card.cr854_scheduledat)}`)
  }
  const problemText = (d: AffectedDelivery) =>
    d.problem === 'soldOut' ? (
      <span className={styles.bad}>{t('配信日に在庫なし', 'None left by then')}</span>
    ) : d.after < 0 ? (
      <span className={styles.warn}>{t('この配信で売り切れる', 'Sells out with this one')}</span>
    ) : d.problem === 'low' ? (
      <span className={styles.warn}>{t(`残り ${LOW_STOCK_WEEKS} 週分を切る`, `Under ${LOW_STOCK_WEEKS} wks left`)}</span>
    ) : (
      '—'
    )
  const statusLabel = (v?: number) => optionLabel(statusOptions.find((o) => o.value === v)?.label ?? '')

  if (alerts.length === 0) {
    return <div className={styles.empty}>{t('いま、配信に影響するアラートはありません', 'No alerts affect upcoming deliveries')}</div>
  }

  return (
    <div className={styles.root}>
      <div className={styles.list}>
        <div className={styles.listHead}>{t(`配信に影響する変更(${alerts.length})`, `Changes that affect deliveries (${alerts.length})`)}</div>
        {alerts.map((a) => (
          <button key={a.id} type="button" className={mergeClasses(styles.item, a.id === selected?.id && styles.itemOn)} style={{ borderLeftColor: KIND_COLOR[a.kind] }} onClick={() => setSelectedId(a.id)}>
            <span className={styles.itemKind}>
              {kindLabel(a)}
              <Badge size="small" appearance="tint" color={a.kind === 'outOfStock' ? 'danger' : 'warning'}>
                {t(`${a.deliveries.length} 本`, `${a.deliveries.length}`)}
              </Badge>
            </span>
            <span className={styles.itemName} title={a.product.cr854_name}>{a.product.cr854_name}</span>
            <span className={styles.itemSub}>{summary(a)}</span>
          </button>
        ))}
      </div>

      {selected && (
        <div className={styles.detail}>
          <div>
            <h2 className={styles.title}>{`${kindLabel(selected)}: ${selected.product.cr854_name}`}</h2>
            <div className={styles.sub}>{t('この商品を載せている、まだ送っていない配信', 'Deliveries not yet sent that include this product')}</div>
          </div>
          <div className={styles.facts}>
            <div className={styles.fact}>
              <div className={styles.factLabel}>{t('いまの在庫', 'Stock now')}</div>
              <div className={styles.factValue}>{n(selected.stock)}</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factLabel}>{t('週の販売(直近 4 週の平均)', 'Weekly sales (last 4 wks)')}</div>
              <div className={styles.factValue}>{selected.weeklyRate > 0 ? n(selected.weeklyRate) : '—'}</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factLabel}>{t('配信 1 本で上乗せされる販売の見込み', 'Extra sales per delivery (est.)')}</div>
              <div className={styles.factValue}>{n(selected.uplift)}</div>
            </div>
            <div className={styles.fact}>
              <div className={styles.factLabel}>{t('いまの在庫は何週分', 'Weeks of stock now')}</div>
              <div className={styles.factValue}>{selected.weeklyRate > 0 ? (selected.stock / selected.weeklyRate).toFixed(1) : '—'}</div>
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>{t('日付', 'Date')}</th>
                  <th className={styles.th}>{t('配信', 'Delivery')}</th>
                  <th className={styles.th}>{t('チャネル', 'Ch.')}</th>
                  <th className={styles.th}>{t('状態', 'Status')}</th>
                  <th className={styles.th}>{t('載っている場所', 'Where')}</th>
                  <th className={mergeClasses(styles.th, styles.num)}>{t('配信日の在庫の見込み', 'Stock on the day (est.)')}</th>
                  <th className={styles.th}>{t('見込み', 'Outlook')}</th>
                  <th className={styles.th}>{t('対応', 'Action')}</th>
                </tr>
              </thead>
              <tbody>
                {selected.deliveries.map((d) => (
                  <tr key={d.card.cr854_deliverycardid}>
                    <td className={styles.td}>{dateText(d.card.cr854_scheduledat)}</td>
                    <td className={mergeClasses(styles.td, styles.name)}>{d.card.cr854_name}</td>
                    <td className={styles.td}>{d.card.cr854_channel === CHANNEL_PUSH ? t('アプリ', 'App') : t('メール', 'Email')}</td>
                    <td className={styles.td}>
                      <span className={styles.dot} style={{ backgroundColor: statusColor(d.card.cr854_status ?? 588230000) }} />
                      {statusLabel(d.card.cr854_status ?? 588230000)}
                    </td>
                    <td className={styles.td}>{d.sections.map((s) => t(`セクション ${s + 1}`, `Section ${s + 1}`)).join('・')}</td>
                    <td className={mergeClasses(styles.td, styles.num)}>
                      {`${n(Math.max(0, d.projected))}${d.weeksLeft !== undefined ? t(`(${d.weeksLeft.toFixed(1)} 週分)`, ` (${d.weeksLeft.toFixed(1)} wks)`) : ''}`}
                    </td>
                    <td className={styles.td}>{problemText(d)}</td>
                    <td className={styles.td}>
                      <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpenCard(d.card.cr854_deliverycardid)}>
                        {t('開く', 'Open')}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.how}>
            {t(
              `配信日の在庫の見込み = いまの在庫 − 週の販売 × 配信日までの週数 − それより前の配信で上乗せされる販売。配信日に在庫がなければ「在庫切れの見込み」、その配信で売り切れるか、残りが ${LOW_STOCK_WEEKS} 週分を切れば「在庫僅少」。商品の差し替え・延期・取りやめは、次に作ります`,
              `Stock on the day = stock now − weekly sales × weeks until then − extra sales from earlier deliveries. None left → "out of stock"; sells out with the delivery or under ${LOW_STOCK_WEEKS} weeks left → "low stock". Replace / postpone / cancel come next.`,
            )}
          </div>
        </div>
      )}
    </div>
  )
}
