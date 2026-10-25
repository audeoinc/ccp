import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Badge, Button, MessageBar, MessageBarBody, Spinner, Tab, TabList, ToggleButton, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryResultsService, type DeliveryResult } from './data/deliveryResults'
import { AiRunsService, type AiRun, type AiRunAdoption } from './data/aiRuns'
import { DeliveryLiftsService, type DeliveryLift } from './data/deliveryLifts'
import { LearningReviewsService, type LearningReview, type LearningReviewStatus } from './data/learningReviews'
import { DataTable, type DataColumn } from './DataTable'
import { ChannelBadge } from './ChannelBadge'
import { locale, priceText, useT, type Market } from './i18n'
import { mergeResultsByCard } from './results'
import { learningUsableIn, useCountryApply } from './countryApply'
import { myName } from './history'
import { IMPACT_TAB_EVENT, takePendingImpactTab, buildImpacts, compare, evaluateLearnings, learningIdsOf, type DeliveryImpact, type Diff, type LearningEval, type Verdict } from './impact'
import { PREF } from './prefKeys'
import { loadPref, savePref } from './settings'
import { ymd } from './dates'

// 結果の面の見せ方「効果」。配信が売上をどれだけ増やしたか(ホールドアウトとの差)と、AI に渡した学びが効いているかを見る。
// 4 つの見方(記録する → 指標を見る → 売上を比べる → 学びを評価して淘汰する)を、増分の要約と並べてタブにした。
// 金額は国(通貨)ごとに分ける。率(クリック率・リフト率)は通貨によらないので、国をまたいで比べる

const useStyles = makeStyles({
  root: { display: 'grid', rowGap: '12px' },
  intro: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, maxWidth: '920px' },
  tiles: { display: 'flex', flexWrap: 'wrap', gap: '10px' },
  tile: {
    display: 'grid',
    rowGap: '2px',
    minWidth: '170px',
    padding: '10px 14px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  tileLabel: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightMedium, color: tokens.colorNeutralForeground3 },
  tileValue: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' },
  tileSub: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  section: { display: 'grid', rowGap: '8px' },
  heading: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  muted: { color: tokens.colorNeutralForeground3 },
  sub: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3 },
  name: { display: 'grid', rowGap: '1px', minWidth: 0 },
  nameMain: { fontWeight: tokens.fontWeightSemibold },
  notes: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: tokens.fontSizeBase200 },
  clamp: { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  actions: { display: 'flex', gap: '4px', flexWrap: 'nowrap' },
  bar: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: tokens.fontSizeBase200 },
  // 比べの文(差と、偶然の範囲かどうか)
  finding: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
    fontSize: tokens.fontSizeBase200,
  },
  detail: {
    display: 'grid',
    rowGap: '8px',
    padding: '12px 14px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow2,
  },
  detailGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '16px', rowGap: '8px' },
  // 表と、選んだ行の詳しい欄を横に並べる(表の下に出すと、開いたことに気づきにくいため)。狭い画面では縦に積む
  split: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, 400px)',
    columnGap: '12px',
    rowGap: '12px',
    alignItems: 'start',
    '@media (max-width: 1100px)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
  pane: {
    position: 'sticky',
    top: '8px',
    maxHeight: 'calc((100vh / var(--ui-zoom, 1)) - 180px)',
    overflowY: 'auto',
    display: 'grid',
    alignContent: 'start',
    rowGap: '10px',
    padding: '12px 14px',
    borderRadius: tokens.borderRadiusLarge,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
  },
  paneLabel: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightMedium, color: tokens.colorNeutralForeground3 },
  learnCard: {
    display: 'grid',
    rowGap: '2px',
    padding: '6px 8px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  deliveryRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    columnGap: '8px',
    alignItems: 'center',
    width: '100%',
    padding: '4px 6px',
    border: 'none',
    borderRadius: tokens.borderRadiusMedium,
    background: 'none',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  num: { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  snippet: { display: 'grid', justifyItems: 'start', rowGap: '2px', minWidth: 0, fontSize: tokens.fontSizeBase200 },
  oneLine: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px', color: tokens.colorNeutralForeground2 },
  list: { display: 'grid', rowGap: '6px', margin: 0, paddingLeft: '18px', fontSize: tokens.fontSizeBase200 },
  up: { color: tokens.colorPaletteGreenForeground1 },
  down: { color: tokens.colorPaletteRedForeground1 },
  // 対象の期間(どの配信を集計に入れるか)と、測定の条件の要約
  period: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '8px',
    padding: '8px 12px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: tokens.fontSizeBase200,
  },
  periodLabel: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightMedium, color: tokens.colorNeutralForeground3 },
  dateInput: { fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, padding: '2px 6px', border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium },
  periodSummary: { color: tokens.colorNeutralForeground2, fontVariantNumeric: 'tabular-nums' },
})

type TabKey = 'lift' | 'log' | 'metrics' | 'sales' | 'learnings'

interface Props {
  /** 絞り込み済みの配信(国・チャネル・種類 など) */
  cards: DeliveryCard[]
  /** すべての配信(ほかの国の学びの出元を引くため。ST5) */
  allCards: DeliveryCard[]
  /** 画面で選んでいる国(空 = すべての国)。学びの判定は、学びと国の組ごと */
  country: string
  onOpenResult: (id: string) => void
}

const pct = (v: number | null | undefined, digits = 1) => (v == null ? '-' : `${(v * 100).toFixed(digits)}%`)
/** 率の差(ポイント) */
const pt = (v: number | null | undefined, digits = 1) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${(v * 100).toFixed(digits)}pt`)
/** 金額。1 人あたりは、円でも小数 1 桁まで出す(数円の差を見るため) */
function money(v: number | null | undefined, market: Market, perUser = false): string {
  if (v == null) return '-'
  // 合計は整数で(ドルのセントまでは要らない)。1 人あたりは、ドルはセント・円は小数 1 桁まで
  const r = !perUser ? Math.round(v) : market === 'US' ? Math.round(v * 100) / 100 : Math.round(v * 10) / 10
  return priceText(r, market)
}
/** 1 通あたりの金額は小さすぎて差が読めないので、1,000 通あたりで出す */
const PER = 1000
const signedMoney = (v: number | null, market: Market, perUser = false) => (v == null ? '-' : `${v >= 0 ? '+' : '−'}${money(Math.abs(v), market, perUser)}`)
const MARKETS: Market[] = ['US', 'JP']

/** 対象の期間(配信日。YYYY-MM-DD。'' = 端を決めない) */
interface Period {
  from: string
  to: string
}
const dayOf = (iso: string) => (iso ? ymd(new Date(iso)) : '')
/** 期間はブラウザごとに覚える(開き直しても同じ期間で見られるように)。読めなければ「すべて」 */
function loadPeriod(): Period {
  // 読めないときは「すべて」
  const v = loadPref<Period | null>(PREF.impactPeriod, null)
  return v && typeof v.from === 'string' && typeof v.to === 'string' ? v : { from: '', to: '' }
}
function savePeriod(p: Period) {
  // 覚えられなくても、画面はそのまま使える
  savePref(PREF.impactPeriod, p)
}

export function ImpactView({ cards, allCards, country, onOpenResult }: Props) {
  const s = useStyles()
  const t = useT()
  // 詳しい結果の「効果で見る」から来たときは、そのタブで開く
  const [tab, setTab] = useState<TabKey>(() => (takePendingImpactTab() as TabKey | null) ?? 'lift')
  useEffect(() => {
    const on = (e: Event) => {
      takePendingImpactTab()
      setTab((e as CustomEvent<TabKey>).detail)
    }
    window.addEventListener(IMPACT_TAB_EVENT, on)
    return () => window.removeEventListener(IMPACT_TAB_EVENT, on)
  }, [])
  const [period, setPeriodState] = useState<Period>(loadPeriod)
  const setPeriod = (p: Period) => {
    setPeriodState(p)
    savePeriod(p)
  }
  const [results, setResults] = useState<DeliveryResult[] | null>(null)
  const [runs, setRuns] = useState<AiRun[]>([])
  const [lifts, setLifts] = useState<DeliveryLift[]>([])
  const [reviews, setReviews] = useState<LearningReview[]>([])
  const [error, setError] = useState<string | null>(null)

  const loadReviews = useCallback(() => {
    LearningReviewsService.getAll()
      .then((r) => r.success && setReviews(r.data ?? []))
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    DeliveryResultsService.getAll()
      .then((r) => (r.success ? setResults(r.data ?? []) : setError(r.error?.message ?? 'results')))
      .catch((e: unknown) => setError(String(e)))
    AiRunsService.getAll()
      .then((r) => r.success && setRuns(r.data ?? []))
      .catch(() => undefined)
    DeliveryLiftsService.getAll()
      .then((r) => r.success && setLifts(r.data ?? []))
      .catch(() => undefined)
    loadReviews()
  }, [loadReviews])

  // AB テストの配信は、案ごとに結果の行が分かれるので、配信ごとに 1 行にまとめてから使う(まとめた行の id は、メモのある行 = 学びの id)
  const merged = useMemo(() => (results ? mergeResultsByCard(results) : null), [results])
  const allImpacts = useMemo(() => (merged ? buildImpacts(cards, merged, runs, lifts) : []), [cards, merged, runs, lifts])
  // 対象の期間(配信日)で絞る。すべてのタブの集計・比べが、この期間の配信だけになる
  const impacts = useMemo(
    () =>
      allImpacts.filter((d) => {
        const day = dayOf(d.sentAt)
        return (!period.from || day >= period.from) && (!period.to || day <= period.to)
      }),
    [allImpacts, period],
  )
  // 学びは、絞り込み済みの配信(国・チャネル)の分だけを並べる(その国・チャネルの学びだけが並ぶほうが分かりやすい)。
  // 学びの出どころは期間の前でもよい(期間の中の配信に渡していれば、比べられる)
  // 国を選んでいれば、その国で使うと決めたほかの国の学びも並べ、その国での判定を決める(ST5)
  const applyVersion = useCountryApply()
  const evals = useMemo(
    () => (merged ? evaluateLearnings(allCards, merged, impacts, reviews, country, learningUsableIn) : []),
    // 国の適用を変えたら(⚙ や配信カードで)、並べ直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allCards, merged, impacts, reviews, country, applyVersion],
  )

  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>{t(`結果を読めませんでした: ${error}`, `Could not load results: ${error}`)}</MessageBarBody>
      </MessageBar>
    )
  }
  if (!results) return <Spinner size="small" label={t('読み込み中…', 'Loading…')} />

  const noData = runs.length === 0 && lifts.length === 0
  return (
    <div className={s.root}>
      <PeriodBar period={period} onChange={setPeriod} impacts={impacts} />
      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TabKey)} size="small">
        <Tab value="lift">{t('売上の増分', 'Incremental sales')}</Tab>
        <Tab value="log">{t('① 学びの記録', '① Learnings log')}</Tab>
        <Tab value="metrics">{t('② 指標を見る', '② Metrics')}</Tab>
        <Tab value="sales">{t('③ 売上を比べる', '③ Sales')}</Tab>
        <Tab value="learnings">{t('④ 学びの評価', '④ Evaluate learnings')}</Tab>
      </TabList>
      {noData && (
        <MessageBar intent="info">
          <MessageBarBody>
            {t(
              'まだ記録がありません。配信カードで AI の案を頼むと、渡した学びが記録されます。ホールドアウトとの比べは、配信の仕組みとデータ基盤から取り込む予定です。いまは ⚙ の「効果の見本を作る」で見本を作れます。',
              'No records yet. Learnings passed to AI are recorded when you ask for AI suggestions on a delivery card. Holdout comparisons will be imported later. For now, use ⚙ → "Create sample impact data".',
            )}
          </MessageBarBody>
        </MessageBar>
      )}
      {tab === 'lift' && <LiftTab impacts={impacts} onOpenResult={onOpenResult} />}
      {tab === 'log' && <LogTab impacts={impacts} evals={evals} onOpenResult={onOpenResult} />}
      {tab === 'metrics' && <MetricsTab impacts={impacts} />}
      {tab === 'sales' && <SalesTab impacts={impacts} />}
      {tab === 'learnings' && <LearningsTab evals={evals} onChanged={loadReviews} onOpenResult={onOpenResult} />}
    </div>
  )
}

// ---- 対象の期間

function PeriodBar({ period, onChange, impacts }: { period: Period; onChange: (p: Period) => void; impacts: DeliveryImpact[] }) {
  const s = useStyles()
  const t = useT()
  const today = new Date()
  const ago = (days: number) => ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - days))
  const presets: [string, Period][] = [
    [t('すべて', 'All'), { from: '', to: '' }],
    [t('直近 4 週', 'Last 4 weeks'), { from: ago(27), to: ymd(today) }],
    [t('直近 12 週', 'Last 12 weeks'), { from: ago(83), to: ymd(today) }],
    [t('直近 26 週', 'Last 26 weeks'), { from: ago(181), to: ymd(today) }],
    [t('今年', 'This year'), { from: `${today.getFullYear()}-01-01`, to: ymd(today) }],
  ]
  const date = (iso: string) => (iso ? new Date(iso).toLocaleDateString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }) : '')
  // 期間の中の、実際の最初と最後の配信日(「すべて」のときも、どこからどこまでかが分かるように)
  const days = impacts.map((d) => d.sentAt).filter(Boolean).sort()
  // 測定の条件(購買を数えた日数・送らなかった割合)。配信ごとに違えば、幅で出す
  const span = (vals: number[], fmt: (v: number) => string) => {
    const u = [...new Set(vals)].sort((a, b) => a - b)
    return u.length === 0 ? null : u.length === 1 ? fmt(u[0]) : `${fmt(u[0])}〜${fmt(u[u.length - 1])}`
  }
  const lifted = impacts.filter((d) => d.lift)
  const windowText = span(lifted.map((d) => d.lift?.window_days ?? 0).filter((v) => v > 0), (v) => `${v}`)
  const holdoutText = span(lifted.map((d) => Math.round((d.lift?.holdout_rate ?? 0) * 100)).filter((v) => v > 0), (v) => `${v}`)
  return (
    <div className={s.period}>
      <span className={s.periodLabel}>{t('対象の期間(配信日)', 'Period (send date)')}</span>
      <input type="date" className={s.dateInput} value={period.from} max={period.to || undefined} onChange={(e) => onChange({ ...period, from: e.target.value })} aria-label={t('期間の始まり', 'From')} />
      <span>〜</span>
      <input type="date" className={s.dateInput} value={period.to} min={period.from || undefined} onChange={(e) => onChange({ ...period, to: e.target.value })} aria-label={t('期間の終わり', 'To')} />
      {presets.map(([name, p]) => {
        const on = p.from === period.from && p.to === period.to
        return (
          <Button key={name} size="small" appearance={on ? 'primary' : 'subtle'} onClick={() => onChange(p)}>
            {name}
          </Button>
        )
      })}
      <span className={s.periodSummary}>
        {days.length
          ? t(`${date(days[0])}〜${date(days[days.length - 1])} の配信 ${impacts.length} 本`, `${impacts.length} deliveries, ${date(days[0])} to ${date(days[days.length - 1])}`)
          : t('この期間の配信はありません', 'No deliveries in this period')}
        {windowText && t(` · 購買は配信から ${windowText} 日`, ` · purchases counted for ${windowText} days after sending`)}
        {holdoutText && t(` · 送らなかった人 ${holdoutText}%`, ` · holdout ${holdoutText}%`)}
      </span>
      {impacts.length > 0 && impacts.length < 12 && (
        <span className={s.muted}>{t('配信が少ないと、比べは「材料不足」になりやすくなります', 'With few deliveries, comparisons are often "too few"')}</span>
      )}
    </div>
  )
}

// ---- 共通の部品

function Tile({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  const s = useStyles()
  return (
    <div className={s.tile}>
      <span className={s.tileLabel}>{label}</span>
      <span className={s.tileValue}>{value}</span>
      {sub && <span className={s.tileSub}>{sub}</span>}
    </div>
  )
}

/** 差の見立ての札 */
function VerdictBadge({ verdict, good = 'up' }: { verdict: Verdict; good?: 'up' | 'down' }) {
  const t = useT()
  if (verdict === 'few') return <Badge appearance="tint" color="informative" size="small">{t('材料不足', 'Too few')}</Badge>
  if (verdict === 'flat') return <Badge appearance="tint" color="subtle" size="small">{t('偶然の範囲', 'Within noise')}</Badge>
  const positive = verdict === good
  return (
    <Badge appearance="tint" color={positive ? 'success' : 'danger'} size="small">
      {verdict === 'up' ? t('差がある(上)', 'Higher') : t('差がある(下)', 'Lower')}
    </Badge>
  )
}

/** 「a は b より ◯ 高い」の 1 行。fmt は差の書き方 */
function Finding({ label, d, fmt, aName, bName }: { label: ReactNode; d: Diff; fmt: (v: number | null) => string; aName: string; bName: string }) {
  const s = useStyles()
  const t = useT()
  return (
    <div className={s.finding}>
      <span className={s.nameMain}>{label}</span>
      <span>
        {aName} − {bName} = <b className={d.diff == null ? undefined : d.diff >= 0 ? s.up : s.down}>{fmt(d.diff)}</b>
      </span>
      {d.low != null && d.high != null && (
        <span className={s.muted}>
          {t(`目安の幅 ${fmt(d.low)} 〜 ${fmt(d.high)}`, `Range ${fmt(d.low)} to ${fmt(d.high)}`)}
        </span>
      )}
      <span className={s.muted}>{t(`(${d.a.n} 本 / ${d.b.n} 本)`, `(${d.a.n} / ${d.b.n} deliveries)`)}</span>
      <VerdictBadge verdict={d.verdict} />
    </div>
  )
}

function DeliveryName({ d }: { d: DeliveryImpact }) {
  const s = useStyles()
  return (
    <span className={s.name}>
      <span className={s.nameMain}>{d.card.name}</span>
      <span className={s.sub}>{d.sentAt ? new Date(d.sentAt).toLocaleDateString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }) : ''}</span>
    </span>
  )
}

function LearningsMark({ d }: { d: DeliveryImpact }) {
  const t = useT()
  if (d.withLearnings == null) return <span>-</span>
  return d.withLearnings ? (
    <Badge appearance="tint" color="brand" size="small">{t(`学びあり ${d.learningIds.length}`, `${d.learningIds.length} learnings`)}</Badge>
  ) : (
    <Badge appearance="outline" color="subtle" size="small">{t('学びなし', 'None')}</Badge>
  )
}

function adoptionLabel(a: AiRunAdoption | null | undefined, t: ReturnType<typeof useT>): string {
  return a === 'as_is' ? t('そのまま採用', 'Used as is') : a === 'edited' ? t('人が直した', 'Edited') : a === 'rejected' ? t('使わなかった', 'Not used') : t('未判定', 'Unknown')
}

// ---- 売上の増分

function LiftTab({ impacts, onOpenResult }: { impacts: DeliveryImpact[]; onOpenResult: (id: string) => void }) {
  const s = useStyles()
  const t = useT()
  const withLift = impacts.filter((d) => d.liftRate != null)
  const columns: DataColumn<DeliveryImpact>[] = [
    { key: 'name', label: t('配信', 'Delivery'), cell: (d) => <DeliveryName d={d} />, sort: (d) => d.sentAt, wide: true },
    { key: 'channel', label: t('チャネル', 'Channel'), cell: (d) => <ChannelBadge size="small" channel={String(d.card.channel ?? '')} /> },
    { key: 'country', label: t('国', 'Country'), cell: (d) => d.market, sort: (d) => d.market },
    { key: 'users', label: t('送った人 / 送らなかった人', 'Sent / holdout'), numeric: true, cell: (d) => (d.lift ? `${(d.lift.treated_users ?? 0).toLocaleString()} / ${(d.lift.holdout_users ?? 0).toLocaleString()}` : '-'), sort: (d) => d.lift?.treated_users },
    { key: 'attr', label: t('配信を通った売上', 'Attributed sales'), numeric: true, cell: (d) => money(d.result.revenue, d.market), sort: (d) => d.result.revenue },
    { key: 'inc', label: t('増えた売上', 'Incremental sales'), numeric: true, cell: (d) => money(d.incRevenue, d.market), sort: (d) => d.incRevenue ?? undefined },
    { key: 'lift', label: t('リフト率', 'Lift'), numeric: true, cell: (d) => pct(d.liftRate), sort: (d) => d.liftRate ?? undefined },
    {
      key: 'window',
      label: t('測定', 'Measured'),
      cell: (d) =>
        d.lift
          ? t(`${d.lift.window_days ?? '-'} 日 · 送らず ${Math.round((d.lift.holdout_rate ?? 0) * 100)}%`, `${d.lift.window_days ?? '-'} days · holdout ${Math.round((d.lift.holdout_rate ?? 0) * 100)}%`)
          : '-',
    },
    { key: 'learn', label: t('学び', 'Learnings'), cell: (d) => <LearningsMark d={d} />, sort: (d) => d.learningIds.length },
  ]
  return (
    <div className={s.section}>
      <span className={s.intro}>
        {t(
          '「配信を通った売上」は、配信のリンクから買った分で、配信がなくても買った人の分を含みます。「増えた売上」は、わざと送らなかった人(ホールドアウト)と、1 人あたりの売上(店舗・EC・配信を通らない分も含む)を比べた差 × 送った人数です。リフト率は、送った人の 1 人あたりの売上が、送らなかった人より何 % 多いかです。',
          'Attributed sales are purchases via the delivery links, including people who would have bought anyway. Incremental sales compare revenue per person (all channels) between recipients and a holdout that was not sent, times recipients. Lift is how much more recipients spent per person than the holdout.',
        )}
      </span>
      <div className={s.tiles}>
        {MARKETS.map((m) => {
          const rows = withLift.filter((d) => d.market === m)
          if (!rows.length) return null
          const attr = rows.reduce((a, d) => a + (d.result.revenue ?? 0), 0)
          const inc = rows.reduce((a, d) => a + (d.incRevenue ?? 0), 0)
          const avg = rows.reduce((a, d) => a + (d.liftRate ?? 0), 0) / rows.length
          return (
            <div key={m} className={s.tiles}>
              <Tile label={t(`${m}: 増えた売上`, `${m}: incremental sales`)} value={money(inc, m)} sub={t(`${rows.length} 本の配信`, `${rows.length} deliveries`)} />
              <Tile label={t(`${m}: 配信を通った売上`, `${m}: attributed sales`)} value={money(attr, m)} sub={t(`増分はその ${pct(attr ? inc / attr : null, 0)}`, `Incremental is ${pct(attr ? inc / attr : null, 0)} of it`)} />
              <Tile label={t(`${m}: 平均のリフト率`, `${m}: average lift`)} value={pct(avg)} sub={t('送らなかった人に比べて', 'vs. holdout')} />
            </div>
          )
        })}
      </div>
      <DataTable
        rows={withLift}
        columns={columns}
        rowKey={(d) => d.card.id}
        ariaLabel={t('配信ごとの増分', 'Incremental sales by delivery')}
        empty={t('ホールドアウトとの比べがある配信は、まだありません', 'No deliveries with a holdout comparison yet')}
        onRowClick={(d) => onOpenResult(d.card.id)}
      />
    </div>
  )
}

// ---- ① 学びの記録

function LogTab({ impacts, evals, onOpenResult }: { impacts: DeliveryImpact[]; evals: LearningEval[]; onOpenResult: (id: string) => void }) {
  const s = useStyles()
  const t = useT()
  const rows = impacts.filter((d) => d.runs.length > 0)
  // 最初から、学びを渡したいちばん新しい配信を選んでおく(右の欄が空だと、何が見られるのか分からないため)
  const [picked, setPicked] = useState<string | null>(null)
  const selected = picked ?? (rows.find((d) => d.learningIds.length > 0) ?? rows[0])?.card.id ?? null
  const learningBy = useMemo(() => new Map(evals.map((e) => [e.id, e])), [evals])
  const firstLine = (id: string) => learningBy.get(id)?.notes.split('\n')[0] ?? ''
  const columns: DataColumn<DeliveryImpact>[] = [
    { key: 'name', label: t('配信', 'Delivery'), cell: (d) => <DeliveryName d={d} />, sort: (d) => d.sentAt },
    { key: 'channel', label: t('チャネル', 'Channel'), cell: (d) => <ChannelBadge size="small" channel={String(d.card.channel ?? '')} /> },
    { key: 'runs', label: t('AI の依頼', 'AI requests'), numeric: true, cell: (d) => d.runs.length, sort: (d) => d.runs.length },
    {
      key: 'learn',
      label: t('渡した学び', 'Learnings passed'),
      wide: true,
      // 表の中でも、どの学びかが分かるように、最初の学びの 1 行目を出す(全部は右の欄)
      cell: (d) => (
        <span className={s.snippet}>
          <LearningsMark d={d} />
          {d.learningIds.length > 0 && (
            <span className={s.oneLine}>
              {firstLine(d.learningIds[0])}
              {d.learningIds.length > 1 ? t(` ほか ${d.learningIds.length - 1} 件`, ` +${d.learningIds.length - 1} more`) : ''}
            </span>
          )}
        </span>
      ),
      sort: (d) => d.learningIds.length,
    },
    {
      key: 'adoption',
      label: t('案の扱い', 'How AI ideas were used'),
      cell: (d) => {
        const count = (a: AiRunAdoption) => d.runs.filter((r) => r.adoption === a).length
        return t(`そのまま ${count('as_is')} / 直した ${count('edited')} / 使わず ${count('rejected')}`, `As is ${count('as_is')} / edited ${count('edited')} / not used ${count('rejected')}`)
      },
    },
  ]
  const on = rows.find((d) => d.card.id === selected)
  return (
    <div className={s.section}>
      <span className={s.intro}>
        {t(
          '配信カードで AI の案(テーマ・コピー・商品・メイン画像など)を頼むたびに、そのとき「これまでの学び」から渡した学びを記録します。学びを渡さなかった依頼も記録します(比べる相手になるため)。AI の案そのものは保存しません。行を選ぶと、右に、渡した学びの中身が出ます。',
          'Each AI request on a delivery card records which learnings were passed. Requests without learnings are recorded too, as the comparison group. The AI ideas themselves are not saved. Select a row to see its learnings on the right.',
        )}
      </span>
      <div className={s.split}>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(d) => d.card.id}
          ariaLabel={t('AI に渡した学びの記録', 'Log of learnings passed to AI')}
          empty={t('AI の依頼の記録は、まだありません', 'No AI request records yet')}
          selectedKey={selected ?? undefined}
          onRowClick={(d) => setPicked(d.card.id)}
        />
        {on ? (
          <div className={s.pane}>
            <span className={s.name}>
              <span className={s.heading}>{on.card.name}</span>
              <span className={s.sub}>
                {on.sentAt ? new Date(on.sentAt).toLocaleDateString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }) : ''} · {on.market} ·{' '}
                {t(`リフト率 ${pct(on.liftRate)}`, `Lift ${pct(on.liftRate)}`)}
              </span>
            </span>
            <span className={s.paneLabel}>{t(`渡した学び(${on.learningIds.length})`, `Learnings passed (${on.learningIds.length})`)}</span>
            {on.learningIds.length ? (
              on.learningIds.map((id) => {
                const e = learningBy.get(id)
                return (
                  <div key={id} className={s.learnCard}>
                    <span className={s.notes}>{e?.notes ?? t('(絞り込みの外の学び)', '(outside current filters)')}</span>
                    {e && (
                      <span className={s.sub}>
                        {t('出どころ: ', 'From: ')}
                        {e.source.name} · {e.sourceAt ? new Date(e.sourceAt).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' }) : ''}
                      </span>
                    )}
                  </div>
                )
              })
            ) : (
              <span className={s.muted}>{t('学びは渡していません(比べる相手になる配信です)', 'No learnings passed (part of the comparison group)')}</span>
            )}
            <span className={s.paneLabel}>{t('AI の依頼と、案の扱い', 'AI requests and how ideas were used')}</span>
            <ul className={s.list}>
              {on.runs.map((r) => (
                <li key={r.id}>
                  {r.task} — {adoptionLabel(r.adoption, t)}
                  {learningIdsOf(r).length === 0 && on.learningIds.length > 0 && <span className={s.muted}>{t('(学びなし)', ' (no learnings)')}</span>}
                </li>
              ))}
            </ul>
            <Button size="small" appearance="secondary" onClick={() => onOpenResult(on.card.id)}>
              {t('この配信の結果を開く', 'Open this delivery’s results')}
            </Button>
          </div>
        ) : (
          <div className={s.pane}>
            <span className={s.muted}>{t('行を選ぶと、渡した学びがここに出ます', 'Select a row to see its learnings here')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ---- ② 指標を見る

interface GroupRow {
  key: string
  label: string
  rows: DeliveryImpact[]
}

function MetricsTab({ impacts }: { impacts: DeliveryImpact[] }) {
  const s = useStyles()
  const t = useT()
  const withL = impacts.filter((d) => d.withLearnings === true)
  const without = impacts.filter((d) => d.withLearnings === false)
  const asIs = impacts.filter((d) => d.adoption === 'as_is')
  const edited = impacts.filter((d) => d.adoption === 'edited')
  const rejected = impacts.filter((d) => d.adoption === 'rejected')
  const groups: GroupRow[] = [
    { key: 'with', label: t('学びを渡した', 'With learnings'), rows: withL },
    { key: 'without', label: t('学びを渡さなかった', 'Without learnings'), rows: without },
    { key: 'as_is', label: t('AI の案をそのまま採用', 'AI ideas used as is'), rows: asIs },
    { key: 'edited', label: t('人が直した', 'Edited by people'), rows: edited },
    { key: 'rejected', label: t('AI の案を使わなかった', 'AI ideas not used'), rows: rejected },
  ]
  const avg = (rows: DeliveryImpact[], f: (d: DeliveryImpact) => number | null) => {
    const v = rows.map(f).filter((x): x is number => x != null)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const columns: DataColumn<GroupRow>[] = [
    { key: 'label', label: t('配信のまとまり', 'Group'), cell: (g) => <span className={s.nameMain}>{g.label}</span> },
    { key: 'n', label: t('配信の数', 'Deliveries'), numeric: true, cell: (g) => g.rows.length },
    { key: 'ctr', label: t('クリック率', 'Click rate'), numeric: true, cell: (g) => pct(avg(g.rows, (d) => d.ctr), 2) },
    { key: 'cvr', label: t('購入率(クリックから)', 'Conversion (from clicks)'), numeric: true, cell: (g) => pct(avg(g.rows, (d) => d.cvr), 2) },
    { key: 'lift', label: t('リフト率', 'Lift'), numeric: true, cell: (g) => pct(avg(g.rows, (d) => d.liftRate)) },
  ]
  return (
    <div className={s.section}>
      <span className={s.intro}>
        {t(
          '配信を、学びを渡したか・AI の案をどう扱ったかで分け、配信ごとの率の平均を比べます(通貨によらない率だけを使います)。「偶然の範囲」は、差が配信ごとのばらつきの中に収まっていて、まだ差があるとは言えないという意味です。どちらかが 3 本未満のときは「材料不足」です。',
          'Deliveries are grouped by whether learnings were passed and how AI ideas were used, and rates are averaged per delivery. "Within noise" means the gap is inside normal variation. "Too few" means fewer than 3 deliveries on a side.',
        )}
      </span>
      <DataTable rows={groups} columns={columns} rowKey={(g) => g.key} ariaLabel={t('まとまりごとの指標', 'Metrics by group')} empty="-" />
      <span className={s.heading}>{t('学びを渡した − 渡さなかった', 'With − without learnings')}</span>
      <Finding label={t('クリック率', 'Click rate')} d={compare(withL.map((d) => d.ctr), without.map((d) => d.ctr))} fmt={(v) => pt(v, 2)} aName={t('あり', 'with')} bName={t('なし', 'without')} />
      <Finding label={t('購入率', 'Conversion')} d={compare(withL.map((d) => d.cvr), without.map((d) => d.cvr))} fmt={(v) => pt(v, 2)} aName={t('あり', 'with')} bName={t('なし', 'without')} />
      <Finding label={t('リフト率', 'Lift')} d={compare(withL.map((d) => d.liftRate), without.map((d) => d.liftRate))} fmt={(v) => pt(v)} aName={t('あり', 'with')} bName={t('なし', 'without')} />
      <span className={s.heading}>{t('人が直した − そのまま採用', 'Edited − used as is')}</span>
      <Finding label={t('クリック率', 'Click rate')} d={compare(edited.map((d) => d.ctr), asIs.map((d) => d.ctr))} fmt={(v) => pt(v, 2)} aName={t('直した', 'edited')} bName={t('そのまま', 'as is')} />
      <Finding label={t('リフト率', 'Lift')} d={compare(edited.map((d) => d.liftRate), asIs.map((d) => d.liftRate))} fmt={(v) => pt(v)} aName={t('直した', 'edited')} bName={t('そのまま', 'as is')} />
    </div>
  )
}

// ---- ③ 売上を比べる

function SalesTab({ impacts }: { impacts: DeliveryImpact[] }) {
  const s = useStyles()
  const t = useT()
  return (
    <div className={s.section}>
      <span className={s.intro}>
        {t(
          '学びを渡した配信と渡さなかった配信で、1,000 通あたりの売上を比べます。金額なので、国(通貨)ごとに分けます。「増分」は、ホールドアウトとの差なので、配信がなくても生まれた売上を除いた、配信が生んだ分です。',
          'Compare revenue per 1,000 recipients between deliveries with and without learnings, by country (currency). Incremental is the gap to the holdout, i.e. what the delivery itself created.',
        )}
      </span>
      {MARKETS.map((m) => {
        const rows = impacts.filter((d) => d.market === m)
        const withL = rows.filter((d) => d.withLearnings === true)
        const without = rows.filter((d) => d.withLearnings === false)
        if (!withL.length && !without.length) return null
        const sum = (list: DeliveryImpact[]) => list.reduce((a, d) => a + (d.incRevenue ?? 0), 0)
        const k = (v: number | null) => (v == null ? null : v * PER)
        const inc = compare(withL.map((d) => k(d.incPerUser)), without.map((d) => k(d.incPerUser)))
        const rpr = compare(withL.map((d) => k(d.rpr)), without.map((d) => k(d.rpr)))
        // 学びなしの配信と同じ増分だったとしたら、学びありの配信で、増えた売上はいくら少なかったか(学びの分の売上の目安)
        const users = withL.reduce((a, d) => a + (d.lift?.treated_users ?? 0), 0)
        const byLearnings = inc.diff != null ? (inc.diff / PER) * users : null
        return (
          <div key={m} className={s.section}>
            <span className={s.heading}>{m}</span>
            <div className={s.tiles}>
              <Tile label={t('学びあり: 1,000 通あたりの増分', 'With: incremental / 1,000 recipients')} value={money(inc.a.mean, m)} sub={t(`${withL.length} 本 / 増えた売上 ${money(sum(withL), m)}`, `${withL.length} deliveries / ${money(sum(withL), m)} incremental`)} />
              <Tile label={t('学びなし: 1,000 通あたりの増分', 'Without: incremental / 1,000 recipients')} value={money(inc.b.mean, m)} sub={t(`${without.length} 本 / 増えた売上 ${money(sum(without), m)}`, `${without.length} deliveries / ${money(sum(without), m)} incremental`)} />
              <Tile
                label={t('学びの分の売上(目安)', 'Sales from learnings (est.)')}
                value={signedMoney(byLearnings, m)}
                sub={t('1 通あたりの増分の差 × 学びありで送った人数', 'Gap per recipient × recipients with learnings')}
              />
            </div>
            <Finding label={t('1,000 通あたりの増分', 'Incremental / 1,000 recipients')} d={inc} fmt={(v) => signedMoney(v, m)} aName={t('あり', 'with')} bName={t('なし', 'without')} />
            <Finding label={t('1,000 通あたりの売上(配信を通った分)', 'Attributed revenue / 1,000 recipients')} d={rpr} fmt={(v) => signedMoney(v, m)} aName={t('あり', 'with')} bName={t('なし', 'without')} />
          </div>
        )
      })}
    </div>
  )
}

// ---- ④ 学びの評価

function LearningsTab({ evals, onChanged, onOpenResult }: { evals: LearningEval[]; onChanged: () => void; onOpenResult: (id: string) => void }) {
  const s = useStyles()
  const t = useT()
  const [showRetired, setShowRetired] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const statusLabel = (v: LearningReviewStatus) =>
    v === 'keep' ? t('残す', 'Keep') : v === 'watch' ? t('様子を見る', 'Watch') : v === 'resting' ? t('休ませる', 'Rest') : t('外す', 'Retire')
  const decide = async (e: LearningEval, status: LearningReviewStatus) => {
    setBusy(e.id)
    const reason = t(
      `リフト率の差 ${pt(e.lift.diff)}(${e.lift.a.n} 本 / ${e.lift.b.n} 本)`,
      `Lift gap ${pt(e.lift.diff)} (${e.lift.a.n} / ${e.lift.b.n} deliveries)`,
    )
    const fields = { learning_id: e.id, status, reason, decided_at: new Date().toISOString(), country: e.country, decided_by: myName() || undefined }
    try {
      // 判定は学びと国の組ごと。国を分ける前の行(国が空)は直さず、その国の行を作る(前の判定は記録として残す)
      if (e.review && e.review.country === e.country) await LearningReviewsService.update(e.review.id, fields)
      else await LearningReviewsService.create(fields)
    } finally {
      setBusy(null)
      onChanged()
    }
  }
  const rows = evals.filter((e) => showRetired || e.review?.status !== 'retired')
  const retiredCount = evals.filter((e) => e.review?.status === 'retired').length
  // 選んだ学び(最初は、いちばん多く渡した学び)。右の欄に、その学びを渡した配信と、比べた相手を並べる
  const [picked, setPicked] = useState<string | null>(null)
  const on = rows.find((e) => e.id === picked) ?? rows[0]
  const columns: DataColumn<LearningEval>[] = [
    {
      key: 'notes',
      label: t('学び', 'Learning'),
      wide: true,
      cell: (e) => (
        <span className={s.name}>
          <span className={mergeClasses(s.notes, s.clamp)}>{e.notes}</span>
          <span className={s.sub}>
            {e.source.name} · {e.sourceAt ? new Date(e.sourceAt).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' }) : ''}
            {e.foreign && ` · ${t(`${e.source.country ?? ''} の学び`, `From ${e.source.country ?? ''}`)}`}
          </span>
        </span>
      ),
    },
    { key: 'used', label: t('渡した配信', 'Used in'), numeric: true, cell: (e) => e.used.length, sort: (e) => e.used.length },
    {
      key: 'lift',
      label: t('リフト率(渡した / 渡さなかった)', 'Lift (with / without)'),
      numeric: true,
      cell: (e) => `${pct(e.lift.a.mean)} / ${pct(e.lift.b.mean)}`,
      sort: (e) => e.lift.a.mean ?? undefined,
    },
    {
      key: 'diff',
      label: t('差', 'Gap'),
      numeric: true,
      cell: (e) => (
        <Tooltip relationship="description" content={e.lift.low != null ? t(`目安の幅 ${pt(e.lift.low)} 〜 ${pt(e.lift.high)}`, `Range ${pt(e.lift.low)} to ${pt(e.lift.high)}`) : t('材料不足', 'Too few')}>
          <span className={e.lift.diff == null ? undefined : e.lift.diff >= 0 ? s.up : s.down}>{pt(e.lift.diff)}</span>
        </Tooltip>
      ),
      sort: (e) => e.lift.diff ?? undefined,
    },
    { key: 'verdict', label: t('見立て', 'Read'), cell: (e) => <VerdictBadge verdict={e.lift.verdict} />, sort: (e) => e.lift.verdict },
    // クリック率の差・おすすめは、右の欄に出す(表の列を減らし、扱いのボタンが隠れないようにするため)
    {
      key: 'status',
      label: t('扱い', 'Decision'),
      cell: (e) => (
        <span className={s.actions} onClick={(ev) => ev.stopPropagation()}>
          {(['keep', 'watch', 'retired'] as const).map((v) => (
            <ToggleButton key={v} size="small" checked={e.review?.status === v} disabled={busy === e.id} appearance={e.review?.status === v ? 'primary' : 'subtle'} onClick={() => void decide(e, v)}>
              {statusLabel(v)}
            </ToggleButton>
          ))}
        </span>
      ),
      sort: (e) => e.review?.status ?? '',
    },
  ]
  return (
    <div className={s.section}>
      <span className={s.intro}>
        {t(
          '学び(過去の配信の「次に生かすメモ」)ごとに、その学びを渡した配信と、同じ国・チャネルで、その学びができたあとに送り、その学びを渡さなかった配信の、リフト率を比べます。効いていない学び・逆効果の学びは「外す」と、配信カードの「これまでの学び」にも、AI への依頼にも渡さなくなります。おすすめは数字だけから出した目安で、決めるのは人です。行を選ぶと、右に、その学びを渡した配信と比べた相手が出ます。いつも一緒に渡している学びどうしは、どちらが効いたのか切り分けられません。判定は国ごとです(上で国を選ぶと、その国の学びと、その国で使うと決めたほかの国の学びを、その国の配信で比べ、その国での扱いを決めます)。',
          'For each learning, compare lift between deliveries that received it and later deliveries in the same country and channel that did not. Retired learnings are no longer shown on delivery cards or passed to AI. Suggestions are hints from the numbers; people decide. Select a row to see where it was used on the right. Learnings that are always passed together cannot be told apart. Decisions are per country (choose a country above to compare its own learnings, and those from other countries it uses, on its deliveries).',
        )}
      </span>
      <div className={s.bar}>
        <Switchable on={showRetired} onToggle={() => setShowRetired(!showRetired)} label={t(`外した学びも出す(${retiredCount})`, `Show retired (${retiredCount})`)} />
      </div>
      <div className={s.split}>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(e) => e.id}
          ariaLabel={t('学びの評価', 'Learning evaluation')}
          empty={t('学び(次に生かすメモ)は、まだありません', 'No learnings yet')}
          selectedKey={on?.id}
          onRowClick={(e) => setPicked(e.id)}
        />
        {on ? (
          <div className={s.pane}>
            <div className={s.learnCard}>
              <span className={s.notes}>{on.notes}</span>
              <span className={s.sub}>
                {t('出どころ: ', 'From: ')}
                {on.source.name} · {on.sourceAt ? new Date(on.sourceAt).toLocaleDateString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }) : ''}
              </span>
            </div>
            <div className={s.bar}>
              <VerdictBadge verdict={on.lift.verdict} />
              <span>
                {t('リフト率の差', 'Lift gap')} <b className={on.lift.diff == null ? undefined : on.lift.diff >= 0 ? s.up : s.down}>{pt(on.lift.diff)}</b>
              </span>
              <span className={s.muted}>{t(`クリック率の差 ${pt(on.ctr.diff, 2)}`, `Click rate gap ${pt(on.ctr.diff, 2)}`)}</span>
              <Badge appearance="outline" color="brand" size="small">
                {t(`おすすめ: ${statusLabel(on.suggestion)}`, `Suggested: ${statusLabel(on.suggestion)}`)}
              </Badge>
            </div>
            <PaneDeliveries
              label={t(`この学びを渡した配信(${on.used.length})`, `Deliveries that received it (${on.used.length})`)}
              avg={on.lift.a.mean}
              rows={on.used}
              empty={t('まだ、どの配信にも渡していません', 'Not passed to any delivery yet')}
              onOpen={onOpenResult}
            />
            <PaneDeliveries
              label={t(`比べた相手: 渡さなかった配信(${on.baseline.length})`, `Compared with: deliveries without it (${on.baseline.length})`)}
              avg={on.lift.b.mean}
              rows={on.baseline}
              empty={t('比べる相手の配信が、まだありません', 'No comparison deliveries yet')}
              onOpen={onOpenResult}
            />
            <Button size="small" appearance="secondary" onClick={() => onOpenResult(on.source.id)}>
              {t('学びの出どころの配信を開く', 'Open the delivery this came from')}
            </Button>
          </div>
        ) : (
          <div className={s.pane}>
            <span className={s.muted}>{t('行を選ぶと、その学びを渡した配信がここに出ます', 'Select a row to see where the learning was used')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** 右の欄の、配信の並び(日付・名前・リフト率。押すと、その配信の結果を開く) */
function PaneDeliveries({ label, avg, rows, empty, onOpen }: { label: string; avg: number | null; rows: DeliveryImpact[]; empty: string; onOpen: (id: string) => void }) {
  const s = useStyles()
  const t = useT()
  return (
    <div className={s.section}>
      <span className={s.paneLabel}>
        {label}
        {rows.length > 0 && t(` · 平均のリフト率 ${pct(avg)}`, ` · average lift ${pct(avg)}`)}
      </span>
      {rows.length === 0 ? (
        <span className={s.muted}>{empty}</span>
      ) : (
        <div>
          {rows.map((d) => (
            <button key={d.card.id} type="button" className={s.deliveryRow} onClick={() => onOpen(d.card.id)} title={t('この配信の結果を開く', 'Open this delivery’s results')}>
              <span className={s.name}>
                <span>{d.card.name}</span>
                <span className={s.sub}>{d.sentAt ? new Date(d.sentAt).toLocaleDateString(locale(), { month: 'numeric', day: 'numeric' }) : ''}</span>
              </span>
              <span className={s.num}>{pct(d.liftRate)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Switchable({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <ToggleButton size="small" checked={on} appearance={on ? 'primary' : 'outline'} onClick={onToggle}>
      {label}
    </ToggleButton>
  )
}
