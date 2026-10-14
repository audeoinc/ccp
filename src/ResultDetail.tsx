import { useState } from 'react'
import { Button, Dialog, DialogSurface, Switch, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { DismissRegular, OpenRegular } from '@fluentui/react-icons'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import type { Cr854_weeklyperformances } from './generated/models/Cr854_weeklyperformancesModel'
import { HeatPreview } from './HeatPreview'
import { locale, useT } from './i18n'
import { ResultInsights, ResultKpis } from './ResultSummary'
import { isPush, sentAtOf, type ResultRow } from './results'

const useStyles = makeStyles({
  // 配信カードと同じく、画面いっぱいのフロートで開く
  surface: { width: 'min(1640px, 96vw)', maxWidth: 'none', maxHeight: '94vh', padding: '16px 20px', overflowY: 'auto' },
  body: { display: 'grid', rowGap: '14px' },
  head: { display: 'flex', alignItems: 'center', columnGap: '10px' },
  title: { margin: 0, fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold },
  sub: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase300 },
  headActions: { marginLeft: 'auto', display: 'flex', columnGap: '4px' },
  // プレビュー(クリックを重ねる) | リンクの表 | メモ・商品・AI の案
  grid: { display: 'grid', gridTemplateColumns: 'auto minmax(320px, 1fr) minmax(320px, 1fr)', columnGap: '24px', alignItems: 'start' },
  linkCol: { display: 'grid', rowGap: '8px', minWidth: 0 },
  linkHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: '8px' },
  h3: { margin: 0, fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  note: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase300, fontVariantNumeric: 'tabular-nums' },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}`, fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  td: { padding: '6px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  num: { textAlign: 'right', whiteSpace: 'nowrap' },
  rowOn: { backgroundColor: tokens.colorBrandBackground2 },
  bar: { height: '6px', borderRadius: '3px', backgroundColor: 'rgba(230, 81, 0, 0.8)' },
  missing: { color: tokens.colorNeutralForeground3 },
})

interface Props {
  row: ResultRow
  productIds: string[]
  products: Cr854_products[]
  heroes: Cr854_heroimages[]
  weekly: Cr854_weeklyperformances[]
  money: (v?: number) => string
  onClose: () => void
  /** 制作の詳細(配信カード)を、上に重ねて開く。配信カードから開いたときは渡さない(下に配信カードがあるため) */
  onOpenCard?: (id: string) => void
  onSaved: () => Promise<void>
}

/**
 * 配信 1 本の詳しい結果(フロート。計画の面の配信カードと同じ開き方)。
 * 上に主な数字、下に、クリックを重ねたプレビュー・リンクの表・メモと商品と AI の案を並べる
 */
export function ResultDetail({ row, productIds, products, heroes, weekly, money, onClose, onOpenCard, onSaved }: Props) {
  const styles = useStyles()
  const t = useT()
  const { card } = row
  const push = isPush(card)
  // プレビューにクリックを重ねる(外すと、元の見た目で確かめられる)
  const [overlay, setOverlay] = useState(true)
  const n = (v: number) => v.toLocaleString(locale())
  const sent = sentAtOf(row)
  const sentText = sent ? new Date(sent).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''
  const previewH = Math.max(480, window.innerHeight * 0.94 - 220)
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface className={styles.surface}>
        <div className={styles.body}>
          <div className={styles.head}>
            <h2 className={styles.title}>{card.cr854_name}</h2>
            <span className={styles.sub}>{`${sentText} · ${push ? t('アプリ', 'App') : t('メール', 'Email')}`}</span>
            <span className={styles.headActions}>
              {onOpenCard && (
                <Tooltip content={t('この配信を作ったときの内容(配信カード)を、上に重ねて開きます。閉じると、この結果に戻ります', 'Opens the delivery card on top. Close it to come back to these results.')} relationship="description">
                  <Button appearance="secondary" size="small" icon={<OpenRegular />} onClick={() => onOpenCard(card.cr854_deliverycardid)}>
                    {t('制作の詳細', 'Production details')}
                  </Button>
                </Tooltip>
              )}
              <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
            </span>
          </div>
          <ResultKpis row={row} money={money} />
          <div className={styles.grid}>
            <HeatPreview
              row={row}
              productIds={productIds}
              products={products}
              heroes={heroes}
              width={push ? 520 : 440}
              maxHeight={previewH}
              overlay={overlay}
              side={({ rows, share, hover, setHover }) => (
                <div className={styles.linkCol}>
                  <div className={styles.linkHead}>
                    <h3 className={styles.h3}>{t('リンクごとのクリック', 'Clicks by link')}</h3>
                    <Switch checked={overlay} onChange={(_, d) => setOverlay(d.checked)} label={t('プレビューに重ねる', 'Show on preview')} />
                  </div>
                  <div className={styles.note}>
                    {t(
                      'クリックは延べ回数(1 人が何度も押すと、その分数えます)。割合は、メッセージの中のクリックの合計に対して。通知のタップは、送った数に対する割合です',
                      'Clicks are total clicks (repeat clicks count). Shares are of all clicks in the message; notification taps are a share of recipients.',
                    )}
                  </div>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th className={styles.th}>{t('リンク', 'Link')}</th>
                        <th className={mergeClasses(styles.th, styles.num)}>{t('クリック', 'Clicks')}</th>
                        <th className={mergeClasses(styles.th, styles.num)}>{t('割合', 'Share')}</th>
                        <th className={styles.th} style={{ width: '30%' }} />
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} className={mergeClasses(hover === r.key && styles.rowOn)} onMouseEnter={() => setHover(r.key)} onMouseLeave={() => setHover(null)}>
                          <td className={mergeClasses(styles.td, !r.placed && styles.missing)} title={r.placed ? undefined : t('プレビューに位置がありません', 'Not shown in the preview')}>
                            {r.label}
                          </td>
                          <td className={mergeClasses(styles.td, styles.num)}>{n(r.clicks)}</td>
                          <td className={mergeClasses(styles.td, styles.num)}>{`${(share(r) * 100).toFixed(1)}%`}</td>
                          <td className={styles.td}>
                            <div className={styles.bar} style={{ width: `${Math.min(100, share(r) * (r.key === 'push' ? 400 : 200))}%` }} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            />
            <ResultInsights
              key={row.result.cr854_deliveryresultid}
              row={row}
              weekly={weekly}
              productName={(id) => products.find((p) => p.cr854_productid === id)?.cr854_name ?? id}
              productCode={(id) => products.find((p) => p.cr854_productid === id)?.cr854_productcode}
              money={money}
              onSaved={onSaved}
            />
          </div>
        </div>
      </DialogSurface>
    </Dialog>
  )
}
