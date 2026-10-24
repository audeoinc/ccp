import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  MessageBar,
  MessageBarBody,
  Spinner,
  ToggleButton,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { WeeklyPerformance } from './models/weeklyPerformances'
import { WeeklyPerformancesService } from './data/weeklyPerformances'
import { DeliveryResultsService, type DeliveryResult } from './data/deliveryResults'
import { locale, priceText, useT, type Market } from './i18n'
import { COUNTRY_US, IMPORT_COLUMNS, downloadTable, groupRows, isPush, localDate, parseProductResults, parseResultsCsv, pct, productRows, sentAtOf, templateName, toResultRows, type GroupRow } from './results'
import { ResultDetail } from './ResultDetail'
import { DeliveryCardsService } from './data/deliveryCards'
import { classifyThemeTypes, themeTypeLabel, themeTypeOf } from './themeTypes'
import { ResultsMonth, ResultsWeek } from './ResultsCalendar'
import { ResultsCompareView } from './ResultsCompareView'
import { DataTable, DeliveryThumb, type DataColumn } from './DataTable'
import { ChannelBadge } from './ChannelBadge'
import { ResultsSummaryBar } from './ResultsSummaryBar'
import { WeekRetro } from './WeekRetro'
import { MonthsService, type MonthRow } from './data/months'
import { WeeksService } from './data/weeks'
import { monthRowOf, scopeLabel } from './weekLock'
import { draftRetro } from './aiRetro'
import { ym, ymd } from './dates'

const useStyles = makeStyles({
  root: { minWidth: 0 },
  // 月・週の表示の凡例(左・上の線の色)。カレンダーの凡例と同じく、右の端に置く
  legend: { display: 'flex', columnGap: '10px', marginLeft: 'auto', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  legendItem: { display: 'inline-flex', alignItems: 'center', columnGap: '4px' },
  legendBar: { width: '3px', height: '12px', borderRadius: '1px' },
  main: { minWidth: 0 },
  group: { display: 'flex', alignItems: 'center', columnGap: '4px' },
  groupLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginRight: '4px' },
  name: { fontWeight: tokens.fontWeightSemibold },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 },
  muted: { color: tokens.colorNeutralForeground3 },
  empty: { padding: '24px', textAlign: 'center', color: tokens.colorNeutralForeground3 },
  hidden: { display: 'none' },
})

type GroupBy = 'delivery' | 'theme' | 'themeType' | 'template' | 'product'

interface Props {
  /** 配信(計画の面と同じ絞り込みをかけたもの。期間は、この中で絞る) */
  cards: DeliveryCard[]
  products: Product[]
  heroes: HeroImage[]
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
  /** 月の表示で、週の行から、その週の週表示へ移る */
  onOpenWeek?: (sunday: Date) => void
  /** 週の表示の上に置く、この週の振り返りのメモ(App が WeekRetro を渡す。週の行は App が持つため)。draft は、この週の AI の下書きを作る */
  retro?: (draft: () => Promise<string>) => ReactNode
  /** 画面で選んでいる国(空 = すべての国)。月の振り返りは月と国で 1 行(ST3) */
  country?: string
  /** 結果のデータの操作(書き出し・取り込み・AI で分ける)。App が ⚙ のメニューの「データ」に並べる */
  onDataActions?: (a: ResultsDataActions | null) => void
  /** 詳しい結果の題名の左に出す段階の帯(PLAN → PRODUCTION → RESULTS。配信カード・制作のページとそろえる) */
  stageNav?: (card: DeliveryCard) => ReactNode
}

/** 結果の面のデータの操作(⚙ のメニューに並べる) */
export interface ResultsDataActions {
  exportCsv: () => void
  canExport: boolean
  importCsv: () => void
  downloadSample: () => void
  sampleColumns: number
  classify: () => void
  untyped: number
  classifying: boolean
}

const monthKey = (iso?: string) => localDate(iso).slice(0, 7)

/**
 * 配信結果(振り返り)の画面。配信のあとに取り込んだ結果を、配信・テーマ・テンプレート・商品ごとに見て、次の計画に生かす。
 * 行を選ぶと、右に、その配信の数字・商品の売れ方・採用した AI の提案・次に生かすメモを出す
 */
export function ResultsPage({ cards, products, heroes, cardProducts, view, month: monthStart, weekStart, toolbarSlot, detailId, onDetail, onOpenCard, onCardsChanged, onOpenWeek, retro, country = '', onDataActions, stageNav }: Props) {
  const styles = useStyles()
  const t = useT()
  const [results, setResults] = useState<DeliveryResult[] | null>(null)
  const [weekly, setWeekly] = useState<WeeklyPerformance[]>([])
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [groupBy, setGroupBy] = useState<GroupBy>('delivery')
  // 月の振り返り(表 months)。月の表示でだけ使うので、App ではなく、ここで持つ
  const [months, setMonths] = useState<MonthRow[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const load = async () => {
    const res = await DeliveryResultsService.getAll()
    if (!res.success) {
      setError(res.error?.message ?? t('配信結果を読み込めませんでした', 'Could not load results'))
      return
    }
    setResults(res.data ?? [])
  }
  useEffect(() => {
    DeliveryResultsService.getAll()
      .then((res) => (res.success ? setResults(res.data ?? []) : setError(res.error?.message ?? 'Could not load results')))
      .catch((e: unknown) => setError(String(e)))
    WeeklyPerformancesService.getAll()
      .then((res) => res.success && setWeekly(res.data ?? []))
      .catch(() => undefined)
    MonthsService.getAll()
      .then((res) => res.success && setMonths(res.data ?? []))
      .catch(() => undefined)
    // 最初の 1 回だけ読む
  }, [])

  const allRows = useMemo(() => toResultRows(cards, results ?? []), [cards, results])
  const scoped = allRows
  const month = ym(monthStart)
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
  const inPeriod = (iso?: string) => {
    if (view !== 'week') return monthKey(iso) === month
    const d = iso ? new Date(iso) : null
    return !!d && d >= weekStart && d < weekEnd
  }
  const rows = scoped.filter((r) => inPeriod(sentAtOf(r)))
  // 月・週の表示には、結果がまだの配信も出す(その期間の計画の全体の中で、結果を見るため)
  const periodCards = cards.filter((c) => inPeriod(c.scheduled_at))
  const resultByCard = new Map(allRows.map((r) => [r.card.id, r]))
  // 押した配信: 結果があれば詳しい結果、なければ配信カード
  const openDelivery = (id: string) => (resultByCard.has(id) ? onDetail(id) : onOpenCard(id))
  // 金額は、配信の国の通貨で。まとめた数字は、期間の配信がすべて同じ国のときだけ通貨を付ける(国が混ざると足せないため)
  const marketOf = (c: DeliveryCard): Market => (c.country === COUNTRY_US ? 'US' : 'JP')
  const markets = new Set(rows.map((r) => marketOf(r.card)))
  const single: Market | undefined = markets.size <= 1 ? ([...markets][0] ?? 'US') : undefined
  const money = (v?: number, c?: DeliveryCard) =>
    c || single
      ? priceText(v === undefined ? undefined : Math.round(v), c ? marketOf(c) : single)
      : t(`${Math.round(v ?? 0).toLocaleString(locale())}(国が混在)`, `${Math.round(v ?? 0).toLocaleString(locale())} (mixed countries)`)
  const prevMonth = (() => {
    if (!month) return ''
    const [y, m] = month.split('-').map(Number)
    return ym(new Date(y, m - 2, 1))
  })()

  // ---- 週・月の振り返りの AI の下書き。前の期間は、週なら 4 週、月なら 3 か月(1 回分だと、ぶれが大きいため)
  const PAST_WEEKS = 4
  const PAST_MONTHS = 3
  const sentMs = (r: (typeof allRows)[number]) => new Date(sentAtOf(r) ?? 0).getTime()
  const draftWeek = () => {
    const from = weekStart.getTime()
    const to = weekEnd.getTime()
    const pastFrom = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7 * PAST_WEEKS).getTime()
    const day = ymd(weekStart)
    return draftRetro({
      period: 'week',
      label: t(`${day} の週`, `Week of ${day}`),
      now: allRows.filter((r) => sentMs(r) >= from && sentMs(r) < to),
      past: allRows.filter((r) => sentMs(r) >= pastFrom && sentMs(r) < from),
      pastPeriods: PAST_WEEKS,
    })
  }
  const draftMonth = async () => {
    const pastKeys = Array.from({ length: PAST_MONTHS }, (_, i) => {
      return ym(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1 - i, 1))
    })
    // その月の各週の振り返り(週の初めがこの月にある週)も渡す。担当者の気づきを、月のまとめに生かすため
    const weeks = await WeeksService.getAll().catch(() => null)
    const weekRetros = (weeks?.success ? (weeks.data ?? []) : [])
      // その国の週(国を分ける前の行も)の振り返りだけ。ほかの国の気づきを混ぜない
      .filter((w) => w.week_start?.slice(0, 7) === month && w.retro?.trim() && (!w.country || w.country === country))
      .sort((a, b) => (a.week_start ?? '').localeCompare(b.week_start ?? ''))
      .map((w) => ({ week: w.week_start!.slice(0, 10), text: (w.channel ? `[${scopeLabel(w)}] ` : '') + w.retro!.trim() }))
    return draftRetro({
      period: 'month',
      label: month,
      now: allRows.filter((r) => monthKey(sentAtOf(r)) === month),
      past: allRows.filter((r) => pastKeys.includes(monthKey(sentAtOf(r)))),
      pastPeriods: PAST_MONTHS,
      weekRetros,
    })
  }
  const thisMonth = monthRowOf(months, month, country)
  // 月の振り返りを保存する(その月・国の行がなければ作る。国を分ける前の行を見ていたときも、その国の行を新しく作る)
  const saveMonthRetro = async (text: string): Promise<boolean> => {
    setError(null)
    const res = thisMonth && thisMonth.country === country ? await MonthsService.update(thisMonth.id, { retro: text }) : await MonthsService.create({ month_start: `${month}-01`, country, retro: text })
    if (!res.success || !res.data) {
      setError(res.error?.message ?? t('振り返りを保存できませんでした', 'Could not save the retrospective'))
      return false
    }
    const saved = res.data
    setMonths((prev) => (prev.some((m) => m.id === saved.id) ? prev.map((m) => (m.id === saved.id ? { ...m, ...saved } : m)) : [...prev, saved]))
    return true
  }
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? t('(削除された商品)', '(deleted product)')

  const groups: GroupRow[] =
    groupBy === 'theme'
      ? groupRows(rows, 'theme', (r) => r.card.theme ?? '')
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

  // 月の要約の帯(月の表示・一覧の上。計画の面の月の要約の帯と同じ位置)。数字は、その月の結果のある配信の合計
  // 金額と増減は、通貨(国)ごとに出す(国が混ざると足せないため。1 つの国なら 1 つだけ)
  const sum = groupRows(rows, 'theme', () => 'all')[0]
  const byMarket = (['US', 'JP'] as const)
    .map((m) => {
      const mine = rows.filter((r) => marketOf(r.card) === m)
      const g = groupRows(mine, 'theme', () => 'all')[0]
      const prev = scoped.filter((r) => marketOf(r.card) === m && monthKey(r.result.sent_at ?? r.card.scheduled_at) === prevMonth).reduce((a, r) => a + r.revenue, 0)
      return { m, n: mine.length, revenue: g?.revenue ?? 0, prev, lastYear: g?.lastYear ?? 0 }
    })
    .filter((x) => x.n > 0)
  const perMarket = (f: (x: (typeof byMarket)[number]) => ReactNode) =>
    byMarket.length === 0 ? <span className={styles.muted}>—</span> : byMarket.map((x, i) => (
      <span key={x.m}>
        {i > 0 && ' ・ '}
        {byMarket.length > 1 && `${x.m} `}
        {f(x)}
      </span>
    ))
  const monthBar = view === 'month' || view === 'list' ? (
    <ResultsSummaryBar
      deliveries={periodCards.length}
      withResults={rows.length}
      revenue={perMarket((x) => priceText(Math.round(x.revenue), x.m))}
      vsPrevMonth={perMarket((x) => delta(x.prev ? x.revenue / x.prev - 1 : undefined))}
      vsLastYear={perMarket((x) => delta(x.lastYear ? x.revenue / x.lastYear - 1 : undefined))}
      openRate={pct(sum?.emailRecipients ? sum.opens / sum.emailRecipients : undefined)}
      clickRate={pct(sum?.recipients ? sum.clicks / sum.recipients : undefined)}
    />
  ) : null

  // 一覧の列(配信ごと)。計画の面の一覧と同じく、左にサムネイル
  const deliveryColumns: DataColumn<(typeof rows)[number]>[] = [
    { key: 'image', label: t('画像', 'Image'), cell: (r) => <DeliveryThumb card={r.card} productIds={cardProducts.get(r.card.id) ?? []} products={products} heroes={heroes} /> },
    { key: 'date', label: t('日付', 'Date'), cell: (r) => dateText(r.result.sent_at ?? r.card.scheduled_at), sort: (r) => sentAtOf(r) },
    { key: 'name', label: t('配信', 'Delivery'), cell: (r) => <span className={styles.name}>{r.card.name}</span>, sort: (r) => r.card.name },
    { key: 'channel', label: t('チャネル', 'Ch.'), cell: (r) => <ChannelBadge channel={r.card.channel} size="small" />, sort: (r) => (isPush(r.card) ? 1 : 0) },
    { key: 'theme', label: t('テーマ', 'Theme'), cell: (r) => r.card.theme || '—', sort: (r) => r.card.theme ?? '', wide: true },
    { key: 'template', label: t('テンプレート', 'Template'), cell: (r) => templateName(r.card), sort: (r) => templateName(r.card) },
    { key: 'open', label: t('開封率', 'Open'), cell: (r) => pct(r.openRate), sort: (r) => r.openRate, numeric: true },
    {
      key: 'click',
      label: (
        <Tooltip content={t('メールはリンクのクリック、アプリは通知のタップ(送った数に対する割合)', 'Email: link clicks. App: notification taps (share of recipients)')} relationship="description">
          <span>{t('クリック率', 'Click')}</span>
        </Tooltip>
      ),
      cell: (r) => pct(r.clickRate),
      sort: (r) => r.clickRate,
      numeric: true,
    },
    { key: 'revenue', label: t('売上', 'Revenue'), cell: (r) => money(r.revenue, r.card), sort: (r) => r.revenue, numeric: true },
    {
      key: 'prev',
      label: (
        <Tooltip content={t('同じ国・チャネルの、7 日前までの配信の売上(平均)と比べた増減', 'Revenue vs the average of same-channel deliveries in the previous 7 days')} relationship="description">
          <span>{t('前週比', 'vs prev wk')}</span>
        </Tooltip>
      ),
      cell: (r) => delta(r.vsPrevWeek),
      sort: (r) => r.vsPrevWeek,
      numeric: true,
    },
    { key: 'lastYear', label: t('前年比', 'vs last yr'), cell: (r) => delta(r.vsLastYear), sort: (r) => r.vsLastYear, numeric: true },
  ]

  // 一覧の列(テーマ・テンプレート・商品などでまとめたとき)
  const groupColumns: DataColumn<GroupRow>[] = [
    {
      key: 'label',
      label: groupBy === 'theme' ? t('テーマ', 'Theme') : groupBy === 'themeType' ? t('テーマの種類', 'Theme type') : groupBy === 'template' ? t('テンプレート', 'Template') : t('商品', 'Product'),
      cell: (g) => <span className={styles.name}>{g.label}</span>,
      sort: (g) => g.label,
      wide: true,
    },
    { key: 'deliveries', label: t('配信数', 'Deliveries'), cell: (g) => g.deliveries, sort: (g) => g.deliveries, numeric: true },
    ...(groupBy === 'product'
      ? [
          { key: 'clicks', label: t('クリック数', 'Clicks'), cell: (g: GroupRow) => g.clicks.toLocaleString(locale()), sort: (g: GroupRow) => g.clicks, numeric: true },
          { key: 'units', label: t('売れた数', 'Units'), cell: (g: GroupRow) => (g.units ?? 0).toLocaleString(locale()), sort: (g: GroupRow) => g.units ?? 0, numeric: true },
        ]
      : [
          { key: 'open', label: t('開封率', 'Open'), cell: (g: GroupRow) => pct(g.emailRecipients ? g.opens / g.emailRecipients : undefined), sort: (g: GroupRow) => (g.emailRecipients ? g.opens / g.emailRecipients : undefined), numeric: true },
          { key: 'click', label: t('クリック率', 'Click'), cell: (g: GroupRow) => pct(g.recipients ? g.clicks / g.recipients : undefined), sort: (g: GroupRow) => (g.recipients ? g.clicks / g.recipients : undefined), numeric: true },
        ]),
    { key: 'revenue', label: t('売上', 'Revenue'), cell: (g) => money(g.revenue), sort: (g) => g.revenue, numeric: true },
    ...(groupBy !== 'product'
      ? [{ key: 'lastYear', label: t('前年比', 'vs last yr'), cell: (g: GroupRow) => delta(g.lastYear ? g.revenue / g.lastYear - 1 : undefined), sort: (g: GroupRow) => (g.lastYear ? g.revenue / g.lastYear - 1 : undefined), numeric: true }]
      : []),
  ]

  const exportCsv = () => {
    if (groupBy === 'delivery') {
      downloadTable(
        ['Date', 'Delivery', 'Channel', 'Theme', 'Template', 'Recipients', 'Opens', 'Clicks', 'Orders', 'Open rate', 'Click rate', 'Revenue', 'vs prev week', 'vs last year'],
        rows.map((r) => [
          localDate(r.result.sent_at ?? r.card.scheduled_at),
          r.card.name ?? '',
          isPush(r.card) ? 'Push' : 'Email',
          r.card.theme ?? '',
          templateName(r.card),
          r.result.recipients ?? '',
          r.result.opens ?? '',
          r.result.clicks ?? '',
          r.result.orders ?? '',
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
  const untyped = cards.filter((c) => !c.theme_type && resultByCard.has(c.id))
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
          const res = await DeliveryCardsService.update(id, { theme_type: type })
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

  // CSV の取り込み: 配信(AB テストは、配信・案・区分)ごとに、結果があれば上書き、なければ作る
  const importCsv = async (file: File) => {
    setMessage(null)
    const { rows: imported, errors } = parseResultsCsv(await file.text(), cards)
    let done = 0
    for (const r of imported) {
      const existing = (results ?? []).find((x) => x.delivery_card_id === r.cardId && (x.variant || undefined) === r.variant && (x.segment || undefined) === r.segment)
      const res = existing
        ? await DeliveryResultsService.update(existing.id, r.fields)
        : await DeliveryResultsService.create({ ...r.fields, delivery_card_id: r.cardId })
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
      rows.slice(0, 2).map((r) => [r.card.name ?? '', localDate(r.card.scheduled_at), r.result.sent_at ?? '', 0, 0, 0, 0, 0, 0, '', '']),
      'results-import-sample.csv',
    )

  // 詳しい結果(フロート)を開いている配信
  const detail = detailId ? resultByCard.get(detailId) : undefined

  // 共通のツールバーに差し込む、結果の面の操作(まとめ方は、一覧のときだけ)
  // データの操作を App に渡す(⚙ のメニューの「データ」に並べる)。関数は、毎回作り直されるので、最新のものを ref で呼ぶ
  const handlers = useRef({ exportCsv, downloadSample, classify })
  useEffect(() => {
    handlers.current = { exportCsv, downloadSample, classify }
  })
  useEffect(() => {
    onDataActions?.({
      exportCsv: () => handlers.current.exportCsv(),
      canExport: rows.length > 0,
      importCsv: () => fileRef.current?.click(),
      downloadSample: () => handlers.current.downloadSample(),
      sampleColumns: IMPORT_COLUMNS.length,
      classify: () => void handlers.current.classify(),
      untyped: untyped.length,
      classifying,
    })
  }, [onDataActions, rows.length, untyped.length, classifying])
  useEffect(() => () => onDataActions?.(null), [onDataActions])

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
          <>
          {monthBar}
          {country ? (
            <WeekRetro period="month" mode="results" text={thisMonth?.retro ?? ''} onSave={saveMonthRetro} onDraft={draftMonth} />
          ) : (
            <MessageBar intent="info" layout="multiline">
              <MessageBarBody>{t('月の振り返りは、国ごとに書きます。上で国を選んでください', 'Monthly retrospectives are per country. Choose a country above.')}</MessageBarBody>
            </MessageBar>
          )}
          <ResultsMonth month={monthStart} cards={periodCards} results={resultByCard} money={money} onOpen={openDelivery} onOpenWeek={onOpenWeek} />
          </>
        ) : view === 'compare' ? (
          <ResultsCompareView
            rows={allRows}
            cardProducts={cardProducts}
            products={products}
            heroes={heroes}
            money={money}
            onOpen={onDetail}
            onAdopt={async (r, text) => {
              const now = r.result.notes?.trim()
              const res = await DeliveryResultsService.update(r.result.id, { notes: now ? `${now}\n${text}` : text })
              if (res.success) await load()
            }}
          />
        ) : view === 'week' ? (
          <>
          {retro?.(draftWeek)}
          <ResultsWeek weekStart={weekStart} cards={periodCards} results={resultByCard} money={money} onOpen={openDelivery} cardProducts={cardProducts} products={products} heroes={heroes} />
          </>
        ) : rows.length === 0 ? (
          <>
          {monthBar}
          <div className={styles.empty}>{t('この条件の配信結果はまだありません', 'No results for these filters yet')}</div>
          </>
        ) : (
          <>
            {monthBar}
            {groupBy === 'delivery' ? (
              // 配信ごと: 計画の面の一覧と同じ表(DataTable)。左にサムネイル(マウスを重ねるとプレビュー)。行を押すと、詳しい結果をフロートで開く
              <DataTable
                rows={rows}
                columns={deliveryColumns}
                rowKey={(r) => r.card.id}
                ariaLabel={t('配信の結果の一覧', 'Delivery results')}
                empty={t('この条件の配信結果はまだありません', 'No results for these filters yet')}
                onRowClick={(r) => onDetail(r.card.id)}
                selectedKey={detailId ?? undefined}
                defaultSort={{ key: 'date', dir: 'ascending' }}
                tieBreak={(a, b) => (sentAtOf(a) ?? '').localeCompare(sentAtOf(b) ?? '')}
              />
            ) : (
              <DataTable
                rows={groups}
                columns={groupColumns}
                rowKey={(g) => g.key}
                ariaLabel={t('まとめた結果', 'Grouped results')}
                empty={t('この条件の配信結果はまだありません', 'No results for these filters yet')}
                defaultSort={{ key: 'revenue', dir: 'descending' }}
              />
            )}
          </>
        )}
      </div>
      {detail && (
        <ResultDetail
          key={detailId}
          row={detail}
          stageNav={stageNav?.(detail.card)}
          history={allRows}
          cardProducts={cardProducts}
          onOpenOther={onDetail}
          productIds={cardProducts.get(detail.card.id) ?? []}
          products={products}
          heroes={heroes}
          weekly={weekly}
          money={(v) => money(v, detail.card)}
          onClose={() => onDetail(null)}
          onOpenCard={onOpenCard}
          onSaved={load}
        />
      )}
    </div>
  )
}
