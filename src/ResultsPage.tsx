import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
  ToggleButton,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { ArrowDownloadRegular, ArrowUploadRegular } from '@fluentui/react-icons'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import type { Cr854_weeklyperformances } from './generated/models/Cr854_weeklyperformancesModel'
import { Cr854_weeklyperformancesService } from './generated/services/Cr854_weeklyperformancesService'
import { Cr854_deliveryresultsService, type Cr854_deliveryresults } from './gcpdata/Cr854_deliveryresultsService'
import { locale, priceText, useT, type Market } from './i18n'
import { COUNTRY_US, IMPORT_COLUMNS, downloadTable, groupRows, isPush, localDate, parseProductResults, parseResultsCsv, pct, productRows, sentAtOf, templateName, toResultRows, type GroupRow } from './results'
import { ResultDetail } from './ResultDetail'
import { AiIcon } from './AiMark'
import { Cr854_deliverycardsService } from './generated/services/Cr854_deliverycardsService'
import { classifyThemeTypes, themeTypeLabel, themeTypeOf } from './themeTypes'
import { ResultsMonth, ResultsWeek } from './ResultsCalendar'
import { ResultsCompareView } from './ResultsCompareView'

const useStyles = makeStyles({
  root: { minWidth: 0 },
  // 月・週の表示の凡例(左・上の線の色)。カレンダーの凡例と同じく、右の端に置く
  legend: { display: 'flex', columnGap: '10px', marginLeft: 'auto', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  legendItem: { display: 'inline-flex', alignItems: 'center', columnGap: '4px' },
  legendBar: { width: '3px', height: '12px', borderRadius: '1px' },
  main: { minWidth: 0 },
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

type GroupBy = 'delivery' | 'theme' | 'themeType' | 'template' | 'product'

interface Props {
  /** 配信(計画の面と同じ絞り込みをかけたもの。期間は、この中で絞る) */
  cards: Cr854_deliverycards[]
  products: Cr854_products[]
  heroes: Cr854_heroimages[]
  /** 配信カードごとの掲載商品(メールの並び順の商品 ID。プレビューに使う) */
  cardProducts: Map<string, string[]>
  /** 見せ方・月・週は、計画の面と共通(切り替えても、同じ期間・見せ方のまま) */
  view: 'month' | 'week' | 'list' | 'compare'
  month: Date
  weekStart: Date
  /** 結果の面の操作を差し込む、共通のツールバーの場所 */
  toolbarSlot: HTMLElement | null
  /** 詳しい結果を開いている配信(App が持つ。配信カードの「配信結果」からも開く) */
  detailId: string | null
  onDetail: (id: string | null) => void
  /** 配信カードを開く */
  onOpenCard: (id: string) => void
  /** 配信カードを書き換えたあと(テーマの種類など)、読み直す */
  onCardsChanged: () => Promise<void>
}

const monthKey = (iso?: string) => localDate(iso).slice(0, 7)

/**
 * 配信結果(振り返り)の画面。配信のあとに取り込んだ結果を、配信・テーマ・テンプレート・商品ごとに見て、次の計画に生かす。
 * 行を選ぶと、右に、その配信の数字・商品の売れ方・採用した AI の提案・次に生かすメモを出す
 */
export function ResultsPage({ cards, products, heroes, cardProducts, view, month: monthStart, weekStart, toolbarSlot, detailId, onDetail, onOpenCard, onCardsChanged }: Props) {
  const styles = useStyles()
  const t = useT()
  const [results, setResults] = useState<Cr854_deliveryresults[] | null>(null)
  const [weekly, setWeekly] = useState<Cr854_weeklyperformances[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('delivery')
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

  const allRows = useMemo(() => toResultRows(cards, results ?? []), [cards, results])
  const scoped = allRows
  const month = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
  const inPeriod = (iso?: string) => {
    if (view !== 'week') return monthKey(iso) === month
    const d = iso ? new Date(iso) : null
    return !!d && d >= weekStart && d < weekEnd
  }
  const rows = scoped.filter((r) => inPeriod(sentAtOf(r)))
  // 月・週の表示には、結果がまだの配信も出す(その期間の計画の全体の中で、結果を見るため)
  const periodCards = cards.filter((c) => inPeriod(c.cr854_scheduledat))
  const resultByCard = new Map(allRows.map((r) => [r.card.cr854_deliverycardid, r]))
  // 押した配信: 結果があれば詳しい結果、なければ配信カード
  const openDelivery = (id: string) => (resultByCard.has(id) ? onDetail(id) : onOpenCard(id))
  // 金額は、配信の国の通貨で。まとめた数字は、期間の配信がすべて同じ国のときだけ通貨を付ける(国が混ざると足せないため)
  const marketOf = (c: Cr854_deliverycards): Market => (c.cr854_country === COUNTRY_US ? 'US' : 'JP')
  const markets = new Set(rows.map((r) => marketOf(r.card)))
  const single: Market | undefined = markets.size <= 1 ? ([...markets][0] ?? 'US') : undefined
  const money = (v?: number, c?: Cr854_deliverycards) =>
    c || single
      ? priceText(v === undefined ? undefined : Math.round(v), c ? marketOf(c) : single)
      : t(`${Math.round(v ?? 0).toLocaleString(locale())}(国が混在)`, `${Math.round(v ?? 0).toLocaleString(locale())} (mixed countries)`)
  const prevMonth = (() => {
    if (!month) return ''
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 2, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })()
  const prevRevenue = scoped.filter((r) => monthKey(r.result.cr854_sentat ?? r.card.cr854_scheduledat) === prevMonth).reduce((s, r) => s + r.revenue, 0)
  const total = rows.reduce((s, r) => s + r.revenue, 0)
  const productName = (id: string) => products.find((p) => p.cr854_productid === id)?.cr854_name ?? t('(削除された商品)', '(deleted product)')

  const groups: GroupRow[] =
    groupBy === 'theme'
      ? groupRows(rows, 'theme', (r) => r.card.cr854_theme ?? '')
      : groupBy === 'themeType'
        ? groupRows(rows, 'theme', (r) => {
            const tt = themeTypeOf(r.card)
            return `${themeTypeLabel(tt.type)}${tt.guessed ? t('(推定)', ' (guessed)') : ''}`
          })
      : groupBy === 'template'
        ? groupRows(rows, 'template', (r) => templateName(r.card))
        : groupBy === 'product'
          ? productRows(rows, productName, parseProductResults)
          : []


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

  // テーマの種類を、AI で分ける(まだ決まっていない、送った配信だけ。決まっているものは、人が直した結果かもしれないので触らない)
  const untyped = cards.filter((c) => !c.cr854_themetype && resultByCard.has(c.cr854_deliverycardid))
  const [classifying, setClassifying] = useState(false)
  const classify = async () => {
    setClassifying(true)
    setMessage(null)
    try {
      let done = 0
      // 一度に多く渡すと、返答が途中で切れることがあるので、20 件ずつ
      for (let i = 0; i < untyped.length; i += 20) {
        const types = await classifyThemeTypes(untyped.slice(i, i + 20))
        for (const [id, type] of types) {
          const res = await Cr854_deliverycardsService.update(id, { cr854_themetype: type })
          if (res.success) done++
        }
      }
      await onCardsChanged()
      setMessage(t(`${done} 件の配信のテーマの種類を、AI が分けました`, `AI sorted theme types for ${done} deliveries`))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setClassifying(false)
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

  // 詳しい結果(フロート)を開いている配信
  const detail = detailId ? resultByCard.get(detailId) : undefined

  // 共通のツールバーに差し込む、結果の面の操作(まとめ方は、一覧のときだけ)
  const tools = (
    <>
      {view === 'list' && (
        <div className={styles.group} role="group" aria-label={t('まとめ方', 'Group by')}>
          <span className={styles.groupLabel}>{t('まとめ方', 'Group by')}</span>
          {(
            [
              ['delivery', t('配信', 'Delivery')],
              ['theme', t('テーマ', 'Theme')],
              ['themeType', t('テーマの種類', 'Theme type')],
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
        {t('CSV で書き出す', 'Export CSV')}
      </Button>
      <Tooltip
        content={t(
          `テーマの種類(値下げ・セール・新作 など)がまだ決まっていない配信 ${untyped.length} 件を、AI が分けます。過去の配信と比べるときに、同じ種類の配信を集めるのに使います(詳しい結果で直せます)`,
          `AI sorts the ${untyped.length} deliveries without a theme type (price drop, sale, new arrivals, ...). Used to find past deliveries of the same type (you can fix it in the details).`,
        )}
        relationship="description"
      >
        <Button size="small" appearance="subtle" icon={classifying ? <Spinner size="extra-tiny" /> : <AiIcon size={16} />} onClick={() => void classify()} disabled={classifying || untyped.length === 0}>
          {t('AI でテーマの種類を分ける', 'Sort theme types with AI')}
        </Button>
      </Tooltip>
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
      {view !== 'list' && (
        <span className={styles.legend}>
          <span className={styles.legendItem}><span className={styles.legendBar} style={{ backgroundColor: tokens.colorPaletteGreenBorderActive }} />{t('前年より上', 'Above last year')}</span>
          <span className={styles.legendItem}><span className={styles.legendBar} style={{ backgroundColor: tokens.colorPaletteRedBorderActive }} />{t('前年より下', 'Below last year')}</span>
          <span className={styles.legendItem}><span className={styles.legendBar} style={{ backgroundColor: tokens.colorNeutralStroke1 }} />{t('結果なし', 'No results')}</span>
        </span>
      )}
    </>
  )

  return (
    <div className={styles.root}>
      {toolbarSlot && createPortal(tools, toolbarSlot)}
      <div className={styles.main}>
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
          <ResultsMonth month={monthStart} cards={periodCards} results={resultByCard} money={money} onOpen={openDelivery} />
        ) : view === 'compare' ? (
          <ResultsCompareView
            rows={allRows}
            cardProducts={cardProducts}
            products={products}
            heroes={heroes}
            money={money}
            onOpen={onDetail}
            onAdopt={async (r, text) => {
              const now = r.result.cr854_notes?.trim()
              const res = await Cr854_deliveryresultsService.update(r.result.cr854_deliveryresultid, { cr854_notes: now ? `${now}\n${text}` : text })
              if (res.success) await load()
            }}
          />
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
                      const on = detailId === r.card.cr854_deliverycardid
                      return (
                        // 行を押すと、詳しい結果をフロートで開く(計画の面の一覧で、配信カードが開くのと同じ)
                        <tr key={r.result.cr854_deliveryresultid} className={mergeClasses(styles.row, on && styles.rowOn)} onClick={() => onDetail(r.card.cr854_deliverycardid)} aria-selected={on}>
                          <td className={styles.td}>{dateText(r.result.cr854_sentat ?? r.card.cr854_scheduledat)}</td>
                          <td className={mergeClasses(styles.td, on && styles.name)}>{r.card.cr854_name}</td>
                          <td className={styles.td}>{isPush(r.card) ? t('アプリ', 'App') : t('メール', 'Email')}</td>
                          <td className={mergeClasses(styles.td, styles.clip)} title={r.card.cr854_theme}>{r.card.cr854_theme || '—'}</td>
                          <td className={mergeClasses(styles.td, styles.clip)} title={templateName(r.card)}>{templateName(r.card)}</td>
                          <td className={mergeClasses(styles.td, styles.num)}>{pct(r.openRate)}</td>
                          <td className={mergeClasses(styles.td, styles.num)}>{pct(r.clickRate)}</td>
                          <td className={mergeClasses(styles.td, styles.num)}>{money(r.revenue, r.card)}</td>
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
                      <th className={styles.th}>{groupBy === 'theme' ? t('テーマ', 'Theme') : groupBy === 'themeType' ? t('テーマの種類', 'Theme type') : groupBy === 'template' ? t('テンプレート', 'Template') : t('商品', 'Product')}</th>
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
      {detail && (
        <ResultDetail
          key={detailId}
          row={detail}
          history={allRows}
          cardProducts={cardProducts}
          onOpenOther={onDetail}
          productIds={cardProducts.get(detail.card.cr854_deliverycardid) ?? []}
          products={products}
          heroes={heroes}
          weekly={weekly}
          money={(v) => money(v, detail.card)}
          onClose={() => onDetail(null)}
          onOpenCard={onOpenCard}
          onSaved={load}
          onCardChanged={onCardsChanged}
        />
      )}
    </div>
  )
}
