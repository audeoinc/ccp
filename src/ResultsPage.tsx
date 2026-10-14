import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Field,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Textarea,
  ToggleButton,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ArrowDownloadRegular, ArrowUploadRegular, ChevronLeftRegular, OpenRegular } from '@fluentui/react-icons'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_weeklyperformances } from './generated/models/Cr854_weeklyperformancesModel'
import { Cr854_weeklyperformancesService } from './generated/services/Cr854_weeklyperformancesService'
import { Cr854_deliveryresultsService, type Cr854_deliveryresults } from './gcpdata/Cr854_deliveryresultsService'
import { locale, optionLabel, priceText, useT, type Market } from './i18n'
import { channelOptions, countryOptions } from './status'
import { COUNTRY_US, IMPORT_COLUMNS, downloadTable, groupRows, isPush, localDate, parseProductResults, parseResultsCsv, productRows, templateName, toResultRows, type GroupRow, type ResultRow } from './results'

const useStyles = makeStyles({
  root: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', columnGap: '16px', padding: '12px 16px', alignItems: 'start' },
  main: { minWidth: 0 },
  toolbar: { display: 'flex', alignItems: 'flex-end', flexWrap: 'wrap', columnGap: '12px', rowGap: '8px', marginBottom: '12px' },
  field: { minWidth: '140px' },
  group: { display: 'flex', alignItems: 'center', columnGap: '4px' },
  groupLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginRight: '4px' },
  tableWrap: { overflowX: 'auto', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: tokens.fontSizeBase200, fontVariantNumeric: 'tabular-nums' },
  th: {
    textAlign: 'left',
    fontWeight: tokens.fontWeightSemibold,
    padding: '6px 8px',
    borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground2,
    whiteSpace: 'nowrap',
  },
  td: { padding: '6px 8px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'nowrap' },
  num: { textAlign: 'right' },
  // 長いテーマ・テンプレート名は、省略して、全体はマウスを乗せたときに出す
  clip: { maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis' },
  row: { cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  rowOn: { backgroundColor: tokens.colorBrandBackground2, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  name: { fontWeight: tokens.fontWeightSemibold },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 },
  muted: { color: tokens.colorNeutralForeground3 },
  totals: { marginTop: '8px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  side: {
    position: 'sticky',
    top: '12px',
    display: 'grid',
    rowGap: '14px',
    padding: '12px',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sideTitle: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, display: 'flex', alignItems: 'center', columnGap: '6px' },
  kpis: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: '6px', rowGap: '6px' },
  kpi: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '6px 8px' },
  kpiLabel: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  kpiValue: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' },
  h3: { margin: '0 0 4px', fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  list: { display: 'grid', rowGap: '4px', fontSize: tokens.fontSizeBase200 },
  prodRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '8px' },
  prodName: { fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  prodSub: { gridColumn: '1 / -1', color: tokens.colorNeutralForeground3 },
  aiItem: { overflowWrap: 'anywhere' },
  aiReason: { color: tokens.colorNeutralForeground3 },
  noteActions: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', columnGap: '8px', marginTop: '6px' },
  empty: { padding: '24px', textAlign: 'center', color: tokens.colorNeutralForeground3 },
  hidden: { display: 'none' },
})

type GroupBy = 'delivery' | 'theme' | 'template' | 'product'

interface Props {
  /** すべての配信 */
  cards: Cr854_deliverycards[]
  products: Cr854_products[]
  /** 最初に選んでおく国(カレンダーの絞り込みを引き継ぐ。空なら US) */
  defaultCountry?: string
  onBack: () => void
  /** 配信カードを開く */
  onOpenCard: (id: string) => void
}

const monthKey = (iso?: string) => localDate(iso).slice(0, 7)
const pct = (v?: number) => (v === undefined ? '—' : `${(v * 100).toFixed(1)}%`)

/**
 * 配信結果(振り返り)の画面。配信のあとに取り込んだ結果を、配信・テーマ・テンプレート・商品ごとに見て、次の計画に生かす。
 * 行を選ぶと、右に、その配信の数字・商品の売れ方・採用した AI の提案・次に生かすメモを出す
 */
export function ResultsPage({ cards, products, defaultCountry, onBack, onOpenCard }: Props) {
  const styles = useStyles()
  const t = useT()
  const [results, setResults] = useState<Cr854_deliveryresults[] | null>(null)
  const [weekly, setWeekly] = useState<Cr854_weeklyperformances[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [country, setCountry] = useState(defaultCountry || String(COUNTRY_US))
  const [channel, setChannel] = useState('')
  const [period, setPeriod] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('delivery')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const res = await Cr854_deliveryresultsService.getAll()
    if (!res.success) {
      setError(res.error?.message ?? t('配信結果を読み込めませんでした', 'Could not load results'))
      return
    }
    setResults(res.data ?? [])
  }
  useEffect(() => {
    Cr854_deliveryresultsService.getAll()
      .then((res) => (res.success ? setResults(res.data ?? []) : setError(res.error?.message ?? 'Could not load results')))
      .catch((e: unknown) => setError(String(e)))
    Cr854_weeklyperformancesService.getAll()
      .then((res) => res.success && setWeekly(res.data ?? []))
      .catch(() => undefined)
    // 最初の 1 回だけ読む
  }, [])

  const market: Market = country === String(COUNTRY_US) ? 'US' : 'JP'
  const money = (v?: number) => priceText(v === undefined ? undefined : Math.round(v), market)
  const allRows = useMemo(() => toResultRows(cards, results ?? []), [cards, results])
  const scoped = allRows.filter((r) => (!country || String(r.card.cr854_country) === country) && (!channel || String(r.card.cr854_channel) === channel))
  // 期間(月)の選択肢: 結果のある月。最初は、いちばん新しい月
  const months = [...new Set(scoped.map((r) => monthKey(r.result.cr854_sentat ?? r.card.cr854_scheduledat)))].sort().reverse()
  const month = period && months.includes(period) ? period : (months[0] ?? '')
  const rows = scoped.filter((r) => monthKey(r.result.cr854_sentat ?? r.card.cr854_scheduledat) === month)
  const prevMonth = (() => {
    if (!month) return ''
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const prevRevenue = scoped.filter((r) => monthKey(r.result.cr854_sentat ?? r.card.cr854_scheduledat) === prevMonth).reduce((s, r) => s + r.revenue, 0)
  const total = rows.reduce((s, r) => s + r.revenue, 0)
  const productCode = (id: string) => products.find((p) => p.cr854_productid === id)?.cr854_productcode
  const productName = (id: string) => products.find((p) => p.cr854_productid === id)?.cr854_name ?? t('(削除された商品)', '(deleted product)')

  const groups: GroupRow[] =
    groupBy === 'theme'
      ? groupRows(rows, 'theme', (r) => r.card.cr854_theme ?? '')
      : groupBy === 'template'
        ? groupRows(rows, 'template', (r) => templateName(r.card))
        : groupBy === 'product'
          ? productRows(rows, productName, parseProductResults)
          : []

  const selected = rows.find((r) => r.card.cr854_deliverycardid === selectedId) ?? (groupBy === 'delivery' ? rows[0] : undefined)

  const monthLabel = (k: string) => {
    const [y, m] = k.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString(locale(), { year: 'numeric', month: 'short' })
  }
  const dateText = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(locale(), { month: '2-digit', day: '2-digit' }) : '')
  const delta = (v?: number) =>
    v === undefined ? (
      <span className={styles.muted}>—</span>
    ) : (
      <span className={v >= 0 ? styles.up : styles.down}>{`${v >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(v * 100))}%`}</span>
    )

  const exportCsv = () => {
    if (groupBy === 'delivery') {
      downloadTable(
        ['Date', 'Delivery', 'Channel', 'Theme', 'Template', 'Recipients', 'Opens', 'Clicks', 'Orders', 'Open rate', 'Click rate', 'Revenue', 'vs prev week', 'vs last year'],
        rows.map((r) => [
          localDate(r.result.cr854_sentat ?? r.card.cr854_scheduledat),
          r.card.cr854_name ?? '',
          isPush(r.card) ? 'Push' : 'Email',
          r.card.cr854_theme ?? '',
          templateName(r.card),
          r.result.cr854_recipients ?? '',
          r.result.cr854_opens ?? '',
          r.result.cr854_clicks ?? '',
          r.result.cr854_orders ?? '',
          pct(r.openRate),
          pct(r.clickRate),
          r.revenue,
          pct(r.vsPrevWeek),
          pct(r.vsLastYear),
        ]),
        `results-${month}.csv`,
      )
    } else {
      downloadTable(
        [groupBy, 'Deliveries', 'Clicks', ...(groupBy === 'product' ? ['Units'] : ['Open rate', 'Click rate']), 'Revenue', ...(groupBy === 'product' ? [] : ['vs last year'])],
        groups.map((g) => [
          g.label,
          g.deliveries,
          g.clicks,
          ...(groupBy === 'product' ? [g.units ?? 0] : [pct(g.emailRecipients ? g.opens / g.emailRecipients : undefined), pct(g.recipients ? g.clicks / g.recipients : undefined)]),
          g.revenue,
          ...(groupBy === 'product' ? [] : [pct(g.lastYear ? g.revenue / g.lastYear - 1 : undefined)]),
        ]),
        `results-${groupBy}-${month}.csv`,
      )
    }
  }

  // CSV の取り込み: 配信ごとに、結果があれば上書き、なければ作る
  const importCsv = async (file: File) => {
    setMessage(null)
    const { rows: imported, errors } = parseResultsCsv(await file.text(), cards)
    let done = 0
    for (const r of imported) {
      const existing = (results ?? []).find((x) => x._cr854_deliverycard_value === r.cardId)
      const res = existing
        ? await Cr854_deliveryresultsService.update(existing.cr854_deliveryresultid, r.fields)
        : await Cr854_deliveryresultsService.create({ ...r.fields, 'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${r.cardId})` })
      if (res.success) done++
      else errors.push(res.error?.message ?? r.cardId)
    }
    await load()
    setMessage(
      t(`${done} 件の結果を取り込みました`, `Imported ${done} result(s)`) +
        (errors.length > 0 ? t(`。取り込めなかった行: ${errors.join(' / ')}`, `. Not imported: ${errors.join(' / ')}`) : ''),
    )
  }
  const downloadSample = () =>
    downloadTable(
      [...IMPORT_COLUMNS],
      rows.slice(0, 2).map((r) => [r.card.cr854_name ?? '', localDate(r.card.cr854_scheduledat), r.result.cr854_sentat ?? '', 0, 0, 0, 0, 0, 0]),
      'results-import-sample.csv',
    )

  return (
    <div className={styles.root}>
      <div className={styles.main}>
        <div className={styles.toolbar}>
          <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={onBack}>
            {t('カレンダー', 'Calendar')}
          </Button>
          <Field label={t('期間', 'Period')} size="small" className={styles.field}>
            <Select size="small" value={month} onChange={(_, d) => setPeriod(d.value)}>
              {months.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('国', 'Country')} size="small" className={styles.field}>
            <Select size="small" value={country} onChange={(_, d) => setCountry(d.value)}>
              {countryOptions.map((o) => (
                <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('チャネル', 'Channel')} size="small" className={styles.field}>
            <Select size="small" value={channel} onChange={(_, d) => setChannel(d.value)}>
              <option value="">{t('すべて', 'All')}</option>
              {channelOptions.map((o) => (
                <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
              ))}
            </Select>
          </Field>
          <div className={styles.group} role="group" aria-label={t('まとめ方', 'Group by')}>
            <span className={styles.groupLabel}>{t('まとめ方', 'Group by')}</span>
            {(
              [
                ['delivery', t('配信', 'Delivery')],
                ['theme', t('テーマ', 'Theme')],
                ['template', t('テンプレート', 'Template')],
                ['product', t('商品', 'Product')],
              ] as const
            ).map(([k, label]) => (
              <ToggleButton key={k} size="small" checked={groupBy === k} appearance={groupBy === k ? 'primary' : 'subtle'} onClick={() => setGroupBy(k)}>
                {label}
              </ToggleButton>
            ))}
          </div>
          <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} onClick={exportCsv} disabled={rows.length === 0}>
            {t('書き出し', 'Export')}
          </Button>
          <Tooltip
            content={t(
              `配信の仕組みから出した結果の CSV を取り込みます。列: ${IMPORT_COLUMNS.join(', ')}(配信は、配信名と配信日で探します)`,
              `Imports a results CSV from the delivery service. Columns: ${IMPORT_COLUMNS.join(', ')} (deliveries are matched by name and date)`,
            )}
            relationship="description"
          >
            <Button size="small" appearance="subtle" icon={<ArrowUploadRegular />} onClick={() => fileRef.current?.click()}>
              {t('結果を取り込む', 'Import results')}
            </Button>
          </Tooltip>
          <Button size="small" appearance="transparent" onClick={downloadSample}>
            {t('取り込みの見本', 'Sample CSV')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className={styles.hidden}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void importCsv(f)
            }}
          />
        </div>
        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        {message && (
          <MessageBar intent="info" style={{ marginBottom: 8 }}>
            <MessageBarBody>{message}</MessageBarBody>
          </MessageBar>
        )}
        {results === null && !error ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <div className={styles.empty}>{t('この条件の配信結果はまだありません', 'No results for these filters yet')}</div>
        ) : (
          <>
            <div className={styles.tableWrap}>
              {groupBy === 'delivery' ? (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>{t('日付', 'Date')}</th>
                      <th className={styles.th}>{t('配信', 'Delivery')}</th>
                      <th className={styles.th}>{t('チャネル', 'Ch.')}</th>
                      <th className={styles.th}>{t('テーマ', 'Theme')}</th>
                      <th className={styles.th}>{t('テンプレート', 'Template')}</th>
                      <th className={mergeClasses(styles.th, styles.num)}>{t('開封率', 'Open')}</th>
                      <th className={mergeClasses(styles.th, styles.num)}>
                        <Tooltip content={t('メールはリンクのクリック、アプリは通知のタップ(送った数に対する割合)', 'Email: link clicks. App: notification taps (share of recipients)')} relationship="description">
                          <span>{t('クリック率', 'Click')}</span>
                        </Tooltip>
                      </th>
                      <th className={mergeClasses(styles.th, styles.num)}>{t('売上', 'Revenue')}</th>
                      <th className={mergeClasses(styles.th, styles.num)}>
                        <Tooltip content={t('同じ国・チャネルの、7 日前までの配信の売上(平均)と比べた増減', 'Revenue vs the average of same-channel deliveries in the previous 7 days')} relationship="description">
                          <span>{t('前週比', 'vs prev wk')}</span>
                        </Tooltip>
                      </th>
                      <th className={mergeClasses(styles.th, styles.num)}>{t('前年比', 'vs last yr')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const on = selected?.card.cr854_deliverycardid === r.card.cr854_deliverycardid
                      return (
                        <tr key={r.result.cr854_deliveryresultid} className={mergeClasses(styles.row, on && styles.rowOn)} onClick={() => setSelectedId(r.card.cr854_deliverycardid)} aria-selected={on}>
                          <td className={styles.td}>{dateText(r.result.cr854_sentat ?? r.card.cr854_scheduledat)}</td>
                          <td className={mergeClasses(styles.td, on && styles.name)}>{r.card.cr854_name}</td>
                          <td className={styles.td}>{isPush(r.card) ? t('アプリ', 'App') : t('メール', 'Email')}</td>
                          <td className={mergeClasses(styles.td, styles.clip)} title={r.card.cr854_theme}>{r.card.cr854_theme || '—'}</td>
                          <td className={mergeClasses(styles.td, styles.clip)} title={templateName(r.card)}>{templateName(r.card)}</td>
                          <td className={mergeClasses(styles.td, styles.num)}>{pct(r.openRate)}</td>
                          <td className={mergeClasses(styles.td, styles.num)}>{pct(r.clickRate)}</td>
                          <td className={mergeClasses(styles.td, styles.num)}>{money(r.revenue)}</td>
                          <td className={mergeClasses(styles.td, styles.num)}>{delta(r.vsPrevWeek)}</td>
                          <td className={mergeClasses(styles.td, styles.num)}>{delta(r.vsLastYear)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>{groupBy === 'theme' ? t('テーマ', 'Theme') : groupBy === 'template' ? t('テンプレート', 'Template') : t('商品', 'Product')}</th>
                      <th className={mergeClasses(styles.th, styles.num)}>{t('配信数', 'Deliveries')}</th>
                      {groupBy === 'product' ? (
                        <>
                          <th className={mergeClasses(styles.th, styles.num)}>{t('クリック数', 'Clicks')}</th>
                          <th className={mergeClasses(styles.th, styles.num)}>{t('売れた数', 'Units')}</th>
                        </>
                      ) : (
                        <>
                          <th className={mergeClasses(styles.th, styles.num)}>{t('開封率', 'Open')}</th>
                          <th className={mergeClasses(styles.th, styles.num)}>{t('クリック率', 'Click')}</th>
                        </>
                      )}
                      <th className={mergeClasses(styles.th, styles.num)}>{t('売上', 'Revenue')}</th>
                      {groupBy !== 'product' && <th className={mergeClasses(styles.th, styles.num)}>{t('前年比', 'vs last yr')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.key}>
                        <td className={mergeClasses(styles.td, styles.name, styles.clip)} title={g.label}>{g.label}</td>
                        <td className={mergeClasses(styles.td, styles.num)}>{g.deliveries}</td>
                        {groupBy === 'product' ? (
                          <>
                            <td className={mergeClasses(styles.td, styles.num)}>{g.clicks.toLocaleString(locale())}</td>
                            <td className={mergeClasses(styles.td, styles.num)}>{(g.units ?? 0).toLocaleString(locale())}</td>
                          </>
                        ) : (
                          <>
                            <td className={mergeClasses(styles.td, styles.num)}>{pct(g.emailRecipients ? g.opens / g.emailRecipients : undefined)}</td>
                            <td className={mergeClasses(styles.td, styles.num)}>{pct(g.recipients ? g.clicks / g.recipients : undefined)}</td>
                          </>
                        )}
                        <td className={mergeClasses(styles.td, styles.num)}>{money(g.revenue)}</td>
                        {groupBy !== 'product' && <td className={mergeClasses(styles.td, styles.num)}>{delta(g.lastYear ? g.revenue / g.lastYear - 1 : undefined)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className={styles.totals}>
              {t(`合計: ${rows.length} 本の配信・売上 ${money(total)}・前月比 `, `Totals: ${rows.length} deliveries · revenue ${money(total)} · vs previous month `)}
              {delta(prevRevenue ? total / prevRevenue - 1 : undefined)}
            </div>
          </>
        )}
      </div>
      {selected ? (
        <SelectedResult key={selected.result.cr854_deliveryresultid} row={selected} weekly={weekly} productName={productName} productCode={productCode} money={money} onOpenCard={onOpenCard} onSaved={load} />
      ) : (
        <div className={mergeClasses(styles.side, styles.muted)}>
          {groupBy === 'delivery' ? t('配信を選ぶと、ここに詳しい結果が出ます', 'Select a delivery to see its details') : t('「配信」でまとめると、配信ごとの詳しい結果を見られます', 'Group by Delivery to see details for each delivery')}
        </div>
      )}
    </div>
  )
}

/** 選んだ配信の結果(右の欄): 主な数字・商品の売れ方・採用した AI の提案・次に生かすメモ */
function SelectedResult({
  row,
  weekly,
  productName,
  productCode,
  money,
  onOpenCard,
  onSaved,
}: {
  row: ResultRow
  weekly: Cr854_weeklyperformances[]
  productName: (id: string) => string
  /** 商品 ID → 商品コード(週ごとの実績は、商品コードで持っている) */
  productCode: (id: string) => string | undefined
  money: (v?: number) => string
  onOpenCard: (id: string) => void
  onSaved: () => Promise<void>
}) {
  const styles = useStyles()
  const t = useT()
  const { card, result } = row
  const [notes, setNotes] = useState(result.cr854_notes ?? '')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const push = isPush(card)
  const items = parseProductResults(result.cr854_products)

  // 配信の週と、その前の週の、商品の売れた数(週ごとの実績があれば)
  const sent = new Date(result.cr854_sentat ?? card.cr854_scheduledat ?? '')
  const weekOf = (code?: string) => {
    if (!code || Number.isNaN(sent.getTime())) return undefined
    const rowsOf = weekly.filter((w) => w.cr854_productcode === code).sort((a, b) => (a.cr854_weekstart ?? '').localeCompare(b.cr854_weekstart ?? ''))
    const i = rowsOf.findIndex((w) => {
      const s = new Date(`${w.cr854_weekstart}T00:00:00`)
      return s.getTime() <= sent.getTime() && sent.getTime() < s.getTime() + 7 * 24 * 3600_000
    })
    if (i <= 0) return undefined
    const now = rowsOf[i]
    const before = rowsOf[i - 1]
    return {
      change: before.cr854_units ? (now.cr854_units ?? 0) / before.cr854_units - 1 : undefined,
      stockWeeks: now.cr854_units ? (now.cr854_stock ?? 0) / now.cr854_units : undefined,
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await Cr854_deliveryresultsService.update(result.cr854_deliveryresultid, { cr854_notes: notes })
      if (res.success) {
        setSavedAt(new Date().toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }))
        await onSaved()
      }
    } finally {
      setSaving(false)
    }
  }

  const ai: { label: string; value?: string; reason?: string }[] = [
    { label: t('テーマ', 'Theme'), value: card.cr854_theme, reason: card.cr854_themereason },
    ...(push
      ? [{ label: t('通知のタイトル', 'Notification title'), value: card.cr854_pushtitle }]
      : [
          { label: t('見出し', 'Headline'), value: card.cr854_headline, reason: card.cr854_copyangle ? t(`切り口: ${card.cr854_copyangle}`, `Angle: ${card.cr854_copyangle}`) : undefined },
          { label: t('テンプレート', 'Template'), value: templateName(card), reason: card.cr854_instructionsangle ? t(`制作指示: ${card.cr854_instructionsangle}`, `Brief: ${card.cr854_instructionsangle}`) : undefined },
          { label: t('メイン画像', 'Hero'), value: card.cr854_heroreason ? t('AI の提案から選択', 'Picked from AI suggestions') : undefined, reason: card.cr854_heroreason },
        ]),
  ].filter((x) => x.value)

  const sentText = Number.isNaN(sent.getTime()) ? '' : sent.toLocaleDateString(locale(), { month: '2-digit', day: '2-digit' })
  return (
    <aside className={styles.side} aria-label={t('選んだ配信', 'Selected delivery')}>
      <div className={styles.sideTitle}>
        <span>{`${card.cr854_name} · ${sentText} ${push ? t('アプリ', 'App') : t('メール', 'Email')}`}</span>
        <Tooltip content={t('配信カードを開く', 'Open the delivery card')} relationship="label">
          <Button size="small" appearance="subtle" icon={<OpenRegular />} onClick={() => onOpenCard(card.cr854_deliverycardid)} />
        </Tooltip>
      </div>
      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>{push ? t('タップ率', 'Tap') : t('開封率', 'Open')}</div>
          <div className={styles.kpiValue}>{pct(push ? row.clickRate : row.openRate)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>{push ? t('注文', 'Orders') : t('クリック率', 'Click')}</div>
          <div className={styles.kpiValue}>{push ? (result.cr854_orders ?? 0).toLocaleString(locale()) : pct(row.clickRate)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>{t('売上', 'Revenue')}</div>
          <div className={styles.kpiValue}>{money(row.revenue)}</div>
        </div>
      </div>
      <div className={styles.muted} style={{ fontSize: tokens.fontSizeBase200 }}>
        {t(
          `送った数 ${(result.cr854_recipients ?? 0).toLocaleString(locale())}・注文 ${(result.cr854_orders ?? 0).toLocaleString(locale())}・前年 ${money(Number(result.cr854_lastyearrevenue ?? 0))}`,
          `Sent ${(result.cr854_recipients ?? 0).toLocaleString(locale())} · orders ${(result.cr854_orders ?? 0).toLocaleString(locale())} · last year ${money(Number(result.cr854_lastyearrevenue ?? 0))}`,
        )}
      </div>
      <section>
        <h3 className={styles.h3}>{t('商品: 配信のあとの売れ方', 'Products: sales after the delivery')}</h3>
        {items.length === 0 ? (
          <div className={styles.muted}>{t('商品ごとの結果はありません', 'No product results')}</div>
        ) : (
          <div className={styles.list}>
            {items.map((p) => {
              const w = weekOf(productCode(p.productId))
              return (
                <div key={p.productId} className={styles.prodRow}>
                  <span className={styles.prodName}>{productName(p.productId)}</span>
                  <span>{money(p.revenue)}</span>
                  <span className={styles.prodSub}>
                    {t(`クリック ${p.clicks.toLocaleString(locale())}・${p.units} 点`, `${p.clicks.toLocaleString(locale())} clicks · ${p.units} units`)}
                    {w?.change !== undefined && t(`・その週の販売 ${w.change >= 0 ? '+' : ''}${Math.round(w.change * 100)}%`, ` · week sales ${w.change >= 0 ? '+' : ''}${Math.round(w.change * 100)}%`)}
                    {w?.stockWeeks !== undefined && t(`・在庫 ${w.stockWeeks.toFixed(1)} 週分`, ` · stock ${w.stockWeeks.toFixed(1)} wks`)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
      <section>
        <h3 className={styles.h3}>{t('採用した AI の提案', 'Adopted AI suggestions')}</h3>
        {ai.length === 0 ? (
          <div className={styles.muted}>{t('記録がありません', 'Nothing recorded')}</div>
        ) : (
          <div className={styles.list}>
            {ai.map((x) => (
              <div key={x.label} className={styles.aiItem}>
                {`${x.label}: ${x.value}`}
                {x.reason && <div className={styles.aiReason}>{x.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </section>
      <section>
        <h3 className={styles.h3}>{t('次に生かすメモ', 'Notes for next time')}</h3>
        <Textarea value={notes} onChange={(_, d) => setNotes(d.value)} resize="vertical" rows={4} style={{ width: '100%' }} placeholder={t('うまくいったこと・次に試すこと', 'What worked, and what to try next')} />
        <div className={styles.noteActions}>
          {saving && <Spinner size="extra-tiny" />}
          {savedAt && !saving && <span className={styles.muted}>{t(`${savedAt} に保存しました`, `Saved at ${savedAt}`)}</span>}
          <Button size="small" onClick={() => void save()} disabled={saving || notes === (result.cr854_notes ?? '')}>
            {t('保存', 'Save')}
          </Button>
        </div>
      </section>
    </aside>
  )
}
