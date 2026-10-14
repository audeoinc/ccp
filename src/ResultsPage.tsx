import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Button,
  Field,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  ToggleButton,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ArrowDownloadRegular, ArrowUploadRegular, ChevronLeftRegular, ChevronRightRegular } from '@fluentui/react-icons'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import type { Cr854_weeklyperformances } from './generated/models/Cr854_weeklyperformancesModel'
import { Cr854_weeklyperformancesService } from './generated/services/Cr854_weeklyperformancesService'
import { Cr854_deliveryresultsService, type Cr854_deliveryresults } from './gcpdata/Cr854_deliveryresultsService'
import { locale, optionLabel, priceText, useT, type Market } from './i18n'
import { channelOptions, countryOptions } from './status'
import { COUNTRY_US, IMPORT_COLUMNS, downloadTable, groupRows, isPush, localDate, parseProductResults, parseResultsCsv, pct, productRows, sentAtOf, templateName, toResultRows, type GroupRow } from './results'
import { ResultDetail } from './ResultDetail'
import { ResultSummary } from './ResultSummary'
import { ResultsMonth, ResultsWeek } from './ResultsCalendar'
import { sundayOf } from './weekLock'

const useStyles = makeStyles({
  root: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', columnGap: '16px', padding: '12px 16px', alignItems: 'start' },
  // 月・週の表示は、右の欄を置かずに、横幅をすべて使う
  rootWide: { gridTemplateColumns: 'minmax(0, 1fr)' },
  nav: { display: 'flex', alignItems: 'center', columnGap: '2px' },
  navLabel: { minWidth: '150px', textAlign: 'center', fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' },
  views: { display: 'flex', columnGap: '4px' },
  sideEmpty: { padding: '12px', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, color: tokens.colorNeutralForeground3 },
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
  empty: { padding: '24px', textAlign: 'center', color: tokens.colorNeutralForeground3 },
  hidden: { display: 'none' },
})

type GroupBy = 'delivery' | 'theme' | 'template' | 'product'
/** 見せ方: カレンダーと同じく、月 / 週 / 一覧 */
type ResultsView = 'month' | 'week' | 'list'
const VIEW_KEY = 'results.view'
const loadView = (): ResultsView => {
  try {
    const v = localStorage.getItem(VIEW_KEY)
    return v === 'week' || v === 'list' ? v : 'month'
  } catch {
    return 'month'
  }
}

interface Props {
  /** すべての配信 */
  cards: Cr854_deliverycards[]
  products: Cr854_products[]
  heroes: Cr854_heroimages[]
  /** 配信カードごとの掲載商品(メールの並び順の商品 ID。プレビューに使う) */
  cardProducts: Map<string, string[]>
  /** 開いたときに、詳しい結果を出す配信(配信カードの「結果」から来たとき) */
  initialDetailId?: string | null
  /** 最初に選んでおく国(カレンダーの絞り込みを引き継ぐ。空なら US) */
  defaultCountry?: string
  onBack: () => void
  /** 配信カードを開く */
  onOpenCard: (id: string) => void
}

const monthKey = (iso?: string) => localDate(iso).slice(0, 7)

/**
 * 配信結果(振り返り)の画面。配信のあとに取り込んだ結果を、配信・テーマ・テンプレート・商品ごとに見て、次の計画に生かす。
 * 行を選ぶと、右に、その配信の数字・商品の売れ方・採用した AI の提案・次に生かすメモを出す
 */
export function ResultsPage({ cards, products, heroes, cardProducts, initialDetailId, defaultCountry, onBack, onOpenCard }: Props) {
  const styles = useStyles()
  const t = useT()
  const [results, setResults] = useState<Cr854_deliveryresults[] | null>(null)
  const [weekly, setWeekly] = useState<Cr854_weeklyperformances[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [country, setCountry] = useState(defaultCountry || String(COUNTRY_US))
  const [channel, setChannel] = useState('')
  const [view, setView] = useState<ResultsView>(loadView)
  // 表示する月・週を決める日。配信カードから来たときは、その配信の日
  const initialAt = cards.find((c) => c.cr854_deliverycardid === initialDetailId)?.cr854_scheduledat
  const [anchor, setAnchor] = useState<Date>(() => (initialAt ? new Date(initialAt) : new Date()))
  const [groupBy, setGroupBy] = useState<GroupBy>('delivery')
  const [selectedId, setSelectedId] = useState<string | null>(initialDetailId ?? null)
  // 詳しい結果を開いている配信
  const [detailId, setDetailId] = useState<string | null>(initialDetailId ?? null)
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
  const month = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`
  const weekStart = sundayOf(anchor)
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
  const inPeriod = (iso?: string) => {
    if (view !== 'week') return monthKey(iso) === month
    const d = iso ? new Date(iso) : null
    return !!d && d >= weekStart && d < weekEnd
  }
  const rows = scoped.filter((r) => inPeriod(sentAtOf(r)))
  // 月・週の表示には、結果がまだの配信も出す(その期間の計画の全体の中で、結果を見るため)
  const periodCards = cards.filter(
    (c) => (!country || String(c.cr854_country) === country) && (!channel || String(c.cr854_channel) === channel) && inPeriod(c.cr854_scheduledat),
  )
  const resultByCard = new Map(allRows.map((r) => [r.card.cr854_deliverycardid, r]))
  const shift = (n: number) =>
    setAnchor((a) => (view === 'week' ? new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * n) : new Date(a.getFullYear(), a.getMonth() + n, 1)))
  const changeView = (v: ResultsView) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // 覚えられなくても、表示は切り替える
    }
  }
  // 押した配信: 結果があれば詳しい結果、なければ配信カード
  const openDelivery = (id: string) => (resultByCard.has(id) ? setDetailId(id) : onOpenCard(id))
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

  const periodLabel =
    view === 'week'
      ? `${weekStart.toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' })} – ${new Date(weekEnd.getTime() - 86400_000).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' })}`
      : anchor.toLocaleDateString(locale(), { year: 'numeric', month: 'long' })
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

  const detail = detailId ? resultByCard.get(detailId) : undefined
  if (detail) {
    return (
      <ResultDetail
        key={detailId}
        row={detail}
        productIds={cardProducts.get(detail.card.cr854_deliverycardid) ?? []}
        products={products}
        heroes={heroes}
        weekly={weekly}
        money={(v) => priceText(v === undefined ? undefined : Math.round(v), detail.card.cr854_country === COUNTRY_US ? 'US' : 'JP')}
        onBack={() => setDetailId(null)}
        onOpenCard={onOpenCard}
        onSaved={load}
      />
    )
  }

  return (
    <div className={mergeClasses(styles.root, view !== 'list' && styles.rootWide)}>
      <div className={styles.main}>
        <div className={styles.toolbar}>
          <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={onBack}>
            {t('カレンダー', 'Calendar')}
          </Button>
          <div className={styles.nav}>
            <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={() => shift(-1)} aria-label={view === 'week' ? t('前の週', 'Previous week') : t('前の月', 'Previous month')} />
            <span className={styles.navLabel}>{periodLabel}</span>
            <Button size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={() => shift(1)} aria-label={view === 'week' ? t('次の週', 'Next week') : t('次の月', 'Next month')} />
          </div>
          <div className={styles.views} role="group" aria-label={t('表示', 'View')}>
            {(
              [
                ['month', t('月', 'Month')],
                ['week', t('週', 'Week')],
                ['list', t('一覧', 'List')],
              ] as const
            ).map(([k, label]) => (
              <ToggleButton key={k} size="small" checked={view === k} appearance={view === k ? 'primary' : 'subtle'} onClick={() => changeView(k)}>
                {label}
              </ToggleButton>
            ))}
          </div>
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
          {view === 'list' && (
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
          )}
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
        ) : view === 'month' ? (
          <ResultsMonth month={new Date(anchor.getFullYear(), anchor.getMonth(), 1)} cards={periodCards} results={resultByCard} money={money} onOpen={openDelivery} />
        ) : view === 'week' ? (
          <ResultsWeek weekStart={weekStart} cards={periodCards} results={resultByCard} money={money} onOpen={openDelivery} cardProducts={cardProducts} products={products} heroes={heroes} />
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
      {view !== 'list' ? null : selected ? (
        <ResultSummary
          key={selected.result.cr854_deliveryresultid}
          row={selected}
          weekly={weekly}
          productName={productName}
          productCode={productCode}
          money={money}
          onOpenCard={onOpenCard}
          onOpenDetail={() => setDetailId(selected.card.cr854_deliverycardid)}
          onSaved={load}
        />
      ) : (
        <div className={styles.sideEmpty}>
          {groupBy === 'delivery' ? t('配信を選ぶと、ここに詳しい結果が出ます', 'Select a delivery to see its details') : t('「配信」でまとめると、配信ごとの詳しい結果を見られます', 'Group by Delivery to see details for each delivery')}
        </div>
      )}
    </div>
  )
}
