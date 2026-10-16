import { useState } from 'react'
import { Button, Dialog, DialogSurface, Select, Switch, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { DismissRegular, DocumentPdfRegular, OpenRegular } from '@fluentui/react-icons'
import { printReport } from './printReport'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { WeeklyPerformance } from './models/weeklyPerformances'
import { HeatPreview } from './HeatPreview'
import { locale, useT } from './i18n'
import { ResultCompare } from './ResultCompare'
import { DeliveryCardsService } from './data/deliveryCards'
import { DeliveryResultsService } from './data/deliveryResults'
import { THEME_TYPES, themeTypeLabel, themeTypeOf, type ThemeType } from './themeTypes'
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
  // 印刷のときだけ出す、レポートの見出し
  reportHead: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, paddingBottom: '4px', borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
})

interface Props {
  row: ResultRow
  /** すべての配信の結果(過去の配信と比べるため) */
  history: ResultRow[]
  cardProducts: Map<string, string[]>
  /** 過去の配信の結果に切り替える */
  onOpenOther?: (cardId: string) => void
  productIds: string[]
  products: Product[]
  heroes: HeroImage[]
  weekly: WeeklyPerformance[]
  money: (v?: number) => string
  onClose: () => void
  /** 制作の詳細(配信カード)を、上に重ねて開く。配信カードから開いたときは渡さない(下に配信カードがあるため) */
  onOpenCard?: (id: string) => void
  onSaved: () => Promise<void>
  /** 配信カードを書き換えたあと(テーマの種類)、読み直す。渡さないときは、テーマの種類を直せない */
  onCardChanged?: () => Promise<void>
}

/**
 * 配信 1 本の詳しい結果(フロート。計画の面の配信カードと同じ開き方)。
 * 上に主な数字、下に、クリックを重ねたプレビュー・リンクの表・メモと商品と AI の案を並べる
 */
export function ResultDetail({ row, history, cardProducts, onOpenOther, productIds, products, heroes, weekly, money, onClose, onOpenCard, onSaved, onCardChanged }: Props) {
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
  const themeType = themeTypeOf(card)
  // AI の振り返りを、次に生かすメモの末尾に足す
  const adopt = async (text: string) => {
    const now = row.result.notes?.trim()
    const res = await DeliveryResultsService.update(row.result.id, { notes: now ? `${now}\n${text}` : text })
    if (res.success) await onSaved()
  }
  const setThemeType = async (v: ThemeType) => {
    const res = await DeliveryCardsService.update(card.id, { theme_type: v })
    if (res.success) await onCardChanged?.()
  }
  return (
    <Dialog open onOpenChange={(_, d) => !d.open && onClose()}>
      {/* data-print-report: 「PDF で書き出す」で印刷するのは、このフロートだけ(index.css のレポートの印刷) */}
      <DialogSurface className={styles.surface} data-print-report>
        <div className={styles.body}>
          <div className={styles.reportHead} data-print-only>
            {t(`配信結果のレポート · 作成 ${new Date().toLocaleDateString(locale())}`, `Delivery results report · created ${new Date().toLocaleDateString(locale())}`)}
          </div>
          <div className={styles.head}>
            <h2 className={styles.title}>{card.name}</h2>
            <span className={styles.sub}>{`${sentText} · ${push ? t('アプリ', 'App') : t('メール', 'Email')}`}</span>
            <Tooltip
              content={t('テーマの種類。過去の配信と比べるときに、同じ種類の配信を集めるのに使います。「推定」は、言葉から推し量った仮の種類です', 'Theme type. Used to find past deliveries of the same type. "guessed" is a provisional type inferred from the wording.')}
              relationship="description"
            >
              <Select
                size="small"
                aria-label={t('テーマの種類', 'Theme type')}
                value={themeType.guessed ? '' : themeType.type}
                disabled={!onCardChanged}
                onChange={(_, d) => d.value && void setThemeType(d.value as ThemeType)}
              >
                {themeType.guessed && <option value="">{t(`${themeTypeLabel(themeType.type)}(推定)`, `${themeTypeLabel(themeType.type)} (guessed)`)}</option>}
                {THEME_TYPES.map((v) => (
                  <option key={v} value={v}>{themeTypeLabel(v)}</option>
                ))}
              </Select>
            </Tooltip>
            <span className={styles.headActions} data-noprint>
              <Tooltip
                content={t('この結果を、レポートとして印刷します。印刷の画面で、送り先を「PDF に保存」にすると PDF になります', 'Prints these results as a report. Choose "Save as PDF" in the print dialog to get a PDF.')}
                relationship="description"
              >
                <Button
                  appearance="secondary"
                  size="small"
                  icon={<DocumentPdfRegular />}
                  onClick={() => printReport(`${card.name ?? 'results'}_${(sent ?? '').slice(0, 10)}_results`)}
                >
                  {t('PDF で書き出す', 'Export PDF')}
                </Button>
              </Tooltip>
              {onOpenCard && (
                <Tooltip content={t('この配信を作ったときの内容(配信カード)を、上に重ねて開きます。閉じると、この結果に戻ります', 'Opens the delivery card on top. Close it to come back to these results.')} relationship="description">
                  <Button appearance="secondary" size="small" icon={<OpenRegular />} onClick={() => onOpenCard(card.id)}>
                    {t('制作の詳細', 'Production details')}
                  </Button>
                </Tooltip>
              )}
              <Button appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
            </span>
          </div>
          <ResultKpis row={row} money={money} />
          <div className={styles.grid} data-print-grid>
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
                    <span data-noprint>
                      <Switch checked={overlay} onChange={(_, d) => setOverlay(d.checked)} label={t('プレビューに重ねる', 'Show on preview')} />
                    </span>
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
              key={`${row.result.id}:${row.result.notes ?? ''}`}
              row={row}
              weekly={weekly}
              productName={(id) => products.find((p) => p.id === id)?.name ?? id}
              productCode={(id) => products.find((p) => p.id === id)?.product_code}
              money={money}
              onSaved={onSaved}
            />
          </div>
          <ResultCompare row={row} history={history} cardProducts={cardProducts} products={products} heroes={heroes} money={money} onOpenOther={onOpenOther} onAdopt={adopt} />
        </div>
      </DialogSurface>
    </Dialog>
  )
}
