import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Button,
  Field,
  Menu,
  MenuItemCheckbox,
  MenuList,
  MenuPopover,
  MenuTrigger,
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
import {
  AddRegular,
  ArrowDownloadRegular,
  CalendarLtrRegular,
  ColumnTripleRegular,
  LayoutColumnTwoRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons'
import { Cr854_deliverycardsService } from './generated/services/Cr854_deliverycardsService'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import { Cr854_productsService } from './generated/services/Cr854_productsService'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import { Cr854_heroimagesService } from './generated/services/Cr854_heroimagesService'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import { Cr854_deliveryproductsService } from './generated/services/Cr854_deliveryproductsService'
import { Cr854_cardnotesService } from './gcpdata/Cr854_cardnotesService'
import { Cr854_weeksService, type Cr854_weeks, type WeekStatus } from './gcpdata/Cr854_weeksService'
import { WeekReviewBar } from './WeekReviewBar'
import { Calendar } from './Calendar'
import { ListView } from './ListView'
import { WeekView, type WeekLens } from './WeekView'
import { COLUMNS, DEFAULT_COLUMNS, downloadCsv, toRows, type ColumnKey } from './listRows'
import { STATE_CANDIDATE } from './items'
import { withHeroLabels, withProductLabels } from './labels'
import { loadCustomTemplates } from './layoutTemplates'
import { TemplateManager } from './TemplateManager'
import { openTemplateManager, useTemplates } from './templates'
import { CardDetail, type NewCardDefaults } from './CardDetail'
import { loadAutoDraft, loadPref, saveAutoDraft, savePref } from './settings'
import { locale, optionLabel, setLang, tr, useLang, useT } from './i18n'
import { channelOptions, countryOptions, departmentOptions, statusColor, statusOptions } from './status'

// 週の初め(日曜日)
const sundayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay())
const weekLabel = (start: Date) => {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
  return locale() === 'ja-JP' ? `${end.getFullYear()}年 ${f(start)} – ${f(end)}` : `${f(start)} – ${f(end)}, ${end.getFullYear()}`
}

// 表示の切り替え(月のカレンダー / 週 / 表の一覧)。ブラウザごとに覚える
type View = 'month' | 'week' | 'list'
const VIEW_KEY = 'calendar.view'
const LENS_KEY = 'week.lens'
// 列を足したら、版を上げる(以前に選んだ列の設定では、新しい列が出ないため)
const COLUMNS_KEY = 'list.columns.v2'

interface Filters {
  country: string
  channel: string
  department: string
  status: string
}
const noFilter: Filters = { country: '', channel: '', department: '', status: '' }
// 開いたときの絞り込み: ビルドの設定(VITE_DEFAULT_COUNTRY。GCP 版は US)の国。なければ、絞り込まない
const initialFilters: Filters = {
  ...noFilter,
  country: String(countryOptions.find((o) => o.label === import.meta.env.VITE_DEFAULT_COUNTRY)?.value ?? ''),
}

const useStyles = makeStyles({
  header: {
    position: 'sticky',
    top: 0,
    zIndex: 10,
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    boxShadow: tokens.shadow2,
  },
  headerIcon: { color: tokens.colorBrandForeground1, flexShrink: 0 },
  title: {
    flexGrow: 1,
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase400,
    letterSpacing: '0.01em',
  },
  // Fluent の標準スイッチは文字の色などを細かく変えにくいので、ヘッダーの設定だけ、自前のスイッチで描く
  autoDraft: {
    display: 'flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    border: 'none',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground2 },
  },
  track: {
    position: 'relative',
    flexShrink: 0,
    width: '32px',
    height: '18px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusCircular,
    border: `1.5px solid ${tokens.colorNeutralStrokeAccessible}`,
    backgroundColor: 'transparent',
    transitionProperty: 'background-color, border-color',
    transitionDuration: tokens.durationFast,
  },
  trackOn: { backgroundColor: tokens.colorBrandBackground, borderTopColor: tokens.colorBrandBackground, borderRightColor: tokens.colorBrandBackground, borderBottomColor: tokens.colorBrandBackground, borderLeftColor: tokens.colorBrandBackground },
  thumb: {
    position: 'absolute',
    top: '2px',
    left: '2px',
    width: '11px',
    height: '11px',
    borderRadius: tokens.borderRadiusCircular,
    backgroundColor: tokens.colorNeutralStrokeAccessible,
    transitionProperty: 'left, background-color',
    transitionDuration: tokens.durationFast,
  },
  thumbOn: { left: '16px', backgroundColor: tokens.colorNeutralForegroundOnBrand },
  langSwitch: {
    display: 'inline-flex',
    padding: '2px',
    columnGap: '2px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  langBtn: {
    border: 'none',
    borderRadius: tokens.borderRadiusSmall,
    padding: `2px ${tokens.spacingHorizontalS}`,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground2 },
  },
  langBtnOn: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
    fontWeight: tokens.fontWeightSemibold,
    ':hover': { backgroundColor: tokens.colorBrandBackground },
  },
  autoDraftState: { fontWeight: tokens.fontWeightSemibold, minWidth: '2.2em', color: tokens.colorNeutralForeground1 },
  container: {
    width: '100%',
    boxSizing: 'border-box',
    maxWidth: '1200px',
    margin: '0 auto',
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
  },
  // 横に情報が多いので、画面の幅を広く使う(月・週・一覧で、表の幅をそろえる)
  containerWide: { maxWidth: '1600px' },
  center: { textAlign: 'center', padding: `${tokens.spacingVerticalXXXL} 0` },
  alert: { marginBottom: tokens.spacingVerticalL },
  filterRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
    alignItems: 'flex-end',
  },
  filterField: { minWidth: '130px' },
  count: {
    marginLeft: 'auto',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground2,
  },
  monthRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalS,
  },
  // 幅を固定する(日付の長さで幅が変わると、「‹ ›」の位置がずれて、続けて押しにくいため)
  monthLabel: {
    width: '140px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'center',
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
  },
  legend: {
    display: 'flex',
    gap: tokens.spacingHorizontalXS,
    marginLeft: 'auto',
    flexWrap: 'wrap',
  },
  legendPill: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    padding: `2px ${tokens.spacingHorizontalS}`,
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    whiteSpace: 'nowrap',
  },
  legendDot: { width: '8px', height: '8px', borderRadius: tokens.borderRadiusCircular, flexShrink: 0 },
  // 週の見出しの幅は、言語ごとに、いちばん長い表記(例: Nov 22 – Nov 28, 2026 / 2026年 11月22日 – 11月28日)が収まる幅
  weekLabel: { width: '180px' },
  weekLabelJa: { width: '236px' },
  // 「週」の隣の、見方の小さな切り替え(週の下位の選択だと分かるよう、枠で囲んで小さく)
  lensSwitch: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '2px',
    padding: '2px',
    marginLeft: '2px',
    marginRight: '6px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorBrandBackground2,
  },
  lensBtn: {
    border: 'none',
    borderRadius: tokens.borderRadiusSmall,
    padding: `1px ${tokens.spacingHorizontalS}`,
    backgroundColor: 'transparent',
    color: tokens.colorBrandForeground2,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    lineHeight: tokens.lineHeightBase200,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  lensBtnOn: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold, boxShadow: tokens.shadow2 },
  viewSwitch: { display: 'inline-flex', columnGap: '2px', marginLeft: tokens.spacingHorizontalM },
})

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: number; label: string }[]
  onChange: (v: string) => void
}) {
  const styles = useStyles()
  const t = useT()
  return (
    <Field label={label} size="small" className={styles.filterField}>
      <Select size="small" value={value} onChange={(_, d) => onChange(d.value)}>
        <option value="">{t('すべて', 'All')}</option>
        {options.map((o) => (
          <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
        ))}
      </Select>
    </Field>
  )
}

function App() {
  const styles = useStyles()
  const t = useT()
  const lang = useLang()
  const [cards, setCards] = useState<Cr854_deliverycards[]>([])
  const [products, setProducts] = useState<Cr854_products[]>([])
  const [heroes, setHeroes] = useState<Cr854_heroimages[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState<Date | null>(null)
  const [filters, setFilters] = useState<Filters>(initialFilters)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 新規作成中なら、最初に入れておく値(null は新規作成していない)
  const [creating, setCreating] = useState<NewCardDefaults | null>(null)

  // 配信カードごとの掲載商品の数(一覧の「商品数」「工程」と、締め切りの警告に使う。候補の行は数えない)
  // 配信カードごとの掲載商品(メールの並び順の商品 ID。候補の行は入れない)。数は、一覧の「商品数」「工程」と、締め切りの警告に使う
  const [cardProducts, setCardProducts] = useState<Map<string, string[]>>(new Map())
  const productCounts = useMemo(() => new Map([...cardProducts].map(([k, v]) => [k, v.length])), [cardProducts])
  // 週の表示の、週の初め(日曜日)
  const [weekStart, setWeekStart] = useState<Date>(() => sundayOf(new Date()))
  // 配信カードごとの、制作からの質問の未解決の数(一覧の列)
  const [questionCounts, setQuestionCounts] = useState<Map<string, number>>(new Map())
  // 配信カードごとの、未完了のタスクの数(一覧の列・週の表示)
  const [taskCounts, setTaskCounts] = useState<Map<string, number>>(new Map())
  // 週の計画(週のレビューの状態)
  const [weeks, setWeeks] = useState<Cr854_weeks[]>([])
  // 配信カードごとの、期日を過ぎた未完了のタスクの数(週の表示で、問題として目立たせる)
  const [overdueTasks, setOverdueTasks] = useState<Map<string, number>>(new Map())
  // 週の表示の見方: 商品のバランス / 進み具合。ブラウザごとに覚える
  const [lens, setLens] = useState<WeekLens>(() => loadPref<WeekLens>(LENS_KEY, 'products'))
  const [view, setView] = useState<View>(() => loadPref<View>(VIEW_KEY, 'month'))
  const [columns, setColumns] = useState<ColumnKey[]>(() => loadPref<ColumnKey[]>(COLUMNS_KEY, DEFAULT_COLUMNS))

  const load = useCallback(async () => {
    try {
      Cr854_deliveryproductsService.getAll()
        .then((res) => {
          if (!res.success) return // 数が出ないだけで、画面は使える
          const rows = (res.data ?? [])
            .filter((r) => r._cr854_deliverycard_value && r.cr854_state !== STATE_CANDIDATE)
            .sort((a, b) => (a.cr854_sortorder ?? 0) - (b.cr854_sortorder ?? 0))
          const byCard = new Map<string, string[]>()
          for (const r of rows) {
            const id = r._cr854_deliverycard_value!
            if (r._cr854_product_value) byCard.set(id, [...(byCard.get(id) ?? []), r._cr854_product_value])
          }
          setCardProducts(byCard)
        })
        .catch(() => undefined)
      Cr854_cardnotesService.getAll()
        .then((res) => {
          if (!res.success) return
          const counts = new Map<string, number>()
          const tasks = new Map<string, number>()
          const overdue = new Map<string, number>()
          const d = new Date()
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          for (const n of res.data ?? []) {
            const id = n._cr854_deliverycard_value
            if (!id || n.cr854_resolved) continue
            if (n.cr854_kind === 'task') {
              tasks.set(id, (tasks.get(id) ?? 0) + 1)
              if (n.cr854_due && n.cr854_due.slice(0, 10) < today) overdue.set(id, (overdue.get(id) ?? 0) + 1)
            }
            else counts.set(id, (counts.get(id) ?? 0) + 1)
          }
          setQuestionCounts(counts)
          setTaskCounts(tasks)
          setOverdueTasks(overdue)
        })
        .catch(() => undefined)
      Cr854_weeksService.getAll()
        .then((res) => {
          if (res.success) setWeeks(res.data ?? [])
        })
        .catch(() => undefined)
      const res = await Cr854_deliverycardsService.getAll({ orderBy: ['cr854_scheduledat asc'] })
      if (!res.success) throw new Error(res.error?.message ?? tr('配信カードの取得に失敗しました', 'Failed to load delivery cards'))
      const data = res.data ?? []
      setCards(data)
      setError(null)
      // 初回のみ、最初の配信がある月(なければ今月)を表示する
      setMonth((m) => {
        if (m) return m
        const first = data.find((c) => c.cr854_scheduledat)?.cr854_scheduledat
        const base = first ? new Date(first) : new Date()
        return new Date(base.getFullYear(), base.getMonth(), 1)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    Cr854_productsService.getAll({ orderBy: ['cr854_productcode asc'] })
      .then((res) => {
        if (res.success) setProducts((res.data ?? []).map(withProductLabels))
        else setError(res.error?.message ?? tr('商品の取得に失敗しました', 'Failed to load products'))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    Cr854_heroimagesService.getAll({ orderBy: ['cr854_imagecode asc'] })
      .then((res) => {
        if (res.success) setHeroes((res.data ?? []).map(withHeroLabels))
        else setError(res.error?.message ?? tr('メイン画像の取得に失敗しました', 'Failed to load hero images'))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [load])

  const filtered = useMemo(() => {
    const match = (f: string, v?: number) => f === '' || String(v) === f
    return cards.filter(
      (c) =>
        match(filters.country, c.cr854_country) &&
        match(filters.channel, c.cr854_channel) &&
        match(filters.department, c.cr854_department) &&
        match(filters.status, c.cr854_status),
    )
  }, [cards, filters])

  // 表示中の月の配信(一覧と CSV の対象)。締め切りの警告は、月をまたいで求める(カレンダーの前後の月の日付にも出す)
  const rows = useMemo(() => toRows(filtered, productCounts, questionCounts, taskCounts), [filtered, productCounts, questionCounts, taskCounts])
  const monthRows = useMemo(
    () =>
      rows.filter((r) => {
        if (!month || !r.card.cr854_scheduledat) return false
        const d = new Date(r.card.cr854_scheduledat)
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
      }),
    [rows, month],
  )
  const dueSoon = useMemo(() => new Set(rows.filter((r) => r.dueSoon).map((r) => r.card.cr854_deliverycardid)), [rows])
  // 週の表示の対象(週の初めから 7 日間)
  const weekRows = useMemo(() => {
    const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
    return rows.filter((r) => {
      if (!r.card.cr854_scheduledat) return false
      const d = new Date(r.card.cr854_scheduledat)
      return d >= weekStart && d < end
    })
  }, [rows, weekStart])
  // 週の状態: この週の行と、この週のすべての配信(絞り込みに関係なく、週の単位で進める)
  const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`
  const thisWeek = weeks.find((w) => w.cr854_weekstart?.slice(0, 10) === weekKey)
  const weekCards = useMemo(() => {
    const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
    return cards.filter((c) => c.cr854_scheduledat && new Date(c.cr854_scheduledat) >= weekStart && new Date(c.cr854_scheduledat) < end)
  }, [cards, weekStart])
  const changeWeek = async (next: WeekStatus) => {
    setError(null)
    try {
      // 配信のステータスを、週の操作に合わせて進める(戻す)
      const target = (c: Cr854_deliverycards): number | undefined => {
        const s = c.cr854_status ?? 588230000
        if (next === 'review' && thisWeek?.cr854_status !== 'confirmed') return s === 588230000 ? 588230001 : undefined // 未起案 → 検討中
        if (next === 'review' && thisWeek?.cr854_status === 'confirmed') return s === 588230003 ? 588230002 : undefined // 確定の取り消し: 確定 → 承認済み
        if (next === 'confirmed') return s !== 588230003 ? 588230003 : undefined // すべて → 確定
        return undefined
      }
      for (const c of weekCards) {
        const v = target(c)
        if (v === undefined) continue
        const r = await Cr854_deliverycardsService.update(c.cr854_deliverycardid, { cr854_status: v as Cr854_deliverycards['cr854_status'] })
        if (!r.success) throw new Error(r.error?.message ?? tr('配信のステータスを変えられませんでした', 'Could not update a delivery status'))
      }
      const now = new Date().toISOString()
      const fields = {
        cr854_status: next,
        ...(next === 'review' && thisWeek?.cr854_status !== 'confirmed' ? { cr854_submittedat: now } : {}),
        ...(next === 'confirmed' ? { cr854_confirmedat: now } : {}),
      }
      const res = thisWeek ? await Cr854_weeksService.update(thisWeek.cr854_weekid, fields) : await Cr854_weeksService.create({ cr854_weekstart: weekKey, ...fields })
      if (!res.success) throw new Error(res.error?.message ?? tr('週の状態を保存できませんでした', 'Could not save the week status'))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    await load()
  }
  const changeView = (v: View) => {
    // 週の表示に切り替えたら: 表示中の月に今日があれば今週、なければ、その月の最初の週
    if (v === 'week' && view !== 'week' && month) {
      const now = new Date()
      setWeekStart(sundayOf(now.getFullYear() === month.getFullYear() && now.getMonth() === month.getMonth() ? now : month))
    }
    setView(v)
    savePref(VIEW_KEY, v)
  }
  const toggleColumn = (key: ColumnKey, on: boolean) => {
    // 少なくとも 1 列は残す(配信名は、行を見分けるために外せない)
    const next = COLUMNS.map((c) => c.key).filter((k) => k === 'name' || (k === key ? on : columns.includes(k)))
    setColumns(next)
    savePref(COLUMNS_KEY, next)
  }
  const exportCsv = () => {
    if (!month) return
    const pad = (n: number) => String(n).padStart(2, '0')
    // 書き出す列: 一覧では、表示中の列。カレンダーでは、すべての列
    if (view === 'week') {
      downloadCsv(weekRows, DEFAULT_COLUMNS, `deliveries-week-${weekStart.getFullYear()}-${pad(weekStart.getMonth() + 1)}-${pad(weekStart.getDate())}.csv`)
      return
    }
    downloadCsv(monthRows, view === 'list' ? columns : DEFAULT_COLUMNS, `deliveries-${month.getFullYear()}-${pad(month.getMonth() + 1)}.csv`)
  }

  const selected = cards.find((c) => c.cr854_deliverycardid === selectedId)
  const shift = (n: number) => {
    if (view === 'week') {
      // 週を動かし、月も、その週の真ん中(水曜日)の月に合わせる(月の表示に戻ったときに、同じあたりを見せる)
      const next = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7 * n)
      setWeekStart(next)
      const mid = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 3)
      setMonth(new Date(mid.getFullYear(), mid.getMonth(), 1))
      return
    }
    if (month) setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))
  }
  const setFilter = (k: keyof Filters) => (v: string) => setFilters({ ...filters, [k]: v })
  const [autoDraft, setAutoDraft] = useState(loadAutoDraft)
  useTemplates() // テンプレートの登録が変わったら、画面全体を描き直す
  // ユーザーが作ったテンプレートを読み込む(読めなくても、標準のテンプレートで動く)
  useEffect(() => {
    loadCustomTemplates().catch(() => undefined)
  }, [])
  const filtering = Object.values(filters).some((v) => v !== '')
  // 新規作成の初期値: 絞り込み中の国・チャネル・種別を引き継ぐ(その条件の配信を作ることが多いため)
  const newCardDefaults = (scheduledAt?: string): NewCardDefaults => ({
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(filters.country ? { country: filters.country } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.department ? { department: filters.department } : {}),
  })

  return (
    <>
      <TemplateManager />
      <header className={styles.header}>
        <CalendarLtrRegular fontSize={24} className={styles.headerIcon} />
        <h1 className={styles.title}>{t('配信カレンダー', 'Delivery Calendar')}</h1>
        <Button appearance="subtle" size="small" icon={<LayoutColumnTwoRegular />} onClick={openTemplateManager}>
          {t('テンプレート', 'Templates')}
        </Button>
        <div className={styles.langSwitch} role="group" aria-label={t('言語', 'Language')}>
          {([['ja', '日本語'], ['en', 'English']] as const).map(([l, name]) => (
            <button
              key={l}
              type="button"
              lang={l}
              aria-pressed={lang === l}
              className={mergeClasses(styles.langBtn, lang === l && styles.langBtnOn)}
              onClick={() => setLang(l)}
            >
              {name}
            </button>
          ))}
        </div>
        <Tooltip
          content={t('内容が空の配信カードを開いたとき、AIが自動で下書きを作ります(同じカードでは1回だけ)', 'When you open an empty delivery card, AI drafts its content automatically (once per card)')}
          relationship="description"
        >
          <button
            type="button"
            role="switch"
            aria-checked={autoDraft}
            className={styles.autoDraft}
            onClick={() => {
              setAutoDraft(!autoDraft)
              saveAutoDraft(!autoDraft)
            }}
          >
            <span className={mergeClasses(styles.track, autoDraft && styles.trackOn)}>
              <span className={mergeClasses(styles.thumb, autoDraft && styles.thumbOn)} />
            </span>
            {t('開いたとき自動で下書き', 'Auto-draft on open')}
            <span className={styles.autoDraftState}>{autoDraft ? t('オン', 'On') : t('オフ', 'Off')}</span>
          </button>
        </Tooltip>
        <Button appearance="primary" size="small" icon={<AddRegular />} onClick={() => setCreating(newCardDefaults())}>
          {t('新規作成', 'New')}
        </Button>
      </header>
      <div className={mergeClasses(styles.container, styles.containerWide)}>
        {loading && <div className={styles.center}><Spinner /></div>}
        {error && (
          <MessageBar layout="multiline" intent="error" className={styles.alert}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        {!loading && !error && month && (
          <>
            <div className={styles.filterRow}>
              <FilterSelect label={t('国', 'Country')} value={filters.country} options={countryOptions} onChange={setFilter('country')} />
              <FilterSelect label={t('チャネル', 'Channel')} value={filters.channel} options={channelOptions} onChange={setFilter('channel')} />
              <FilterSelect label={t('種別', 'Type')} value={filters.department} options={departmentOptions} onChange={setFilter('department')} />
              <FilterSelect label={t('ステータス', 'Status')} value={filters.status} options={statusOptions} onChange={setFilter('status')} />
              {filtering && <Button size="small" appearance="subtle" onClick={() => setFilters(noFilter)}>{t('クリア', 'Clear')}</Button>}
              <span className={styles.count}>{t(`${filtered.length} / ${cards.length} 件`, `${filtered.length} / ${cards.length} items`)}</span>
            </div>
            <div className={styles.monthRow}>
              <Button appearance="subtle" size="small" icon={<ChevronLeftRegular />} onClick={() => shift(-1)} aria-label={view === 'week' ? t('前の週', 'Previous week') : t('前の月', 'Previous month')} />
              <span className={mergeClasses(styles.monthLabel, view === 'week' && (lang === 'ja' ? styles.weekLabelJa : styles.weekLabel))}>
                {view === 'week'
                  ? weekLabel(weekStart)
                  : lang === 'ja'
                    ? `${month.getFullYear()}年${month.getMonth() + 1}月`
                    : month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}
              </span>
              <Button appearance="subtle" size="small" icon={<ChevronRightRegular />} onClick={() => shift(1)} aria-label={view === 'week' ? t('次の週', 'Next week') : t('次の月', 'Next month')} />
              <div className={styles.viewSwitch} role="group" aria-label={t('表示', 'View')}>
                <ToggleButton size="small" checked={view === 'month'} appearance={view === 'month' ? 'primary' : 'subtle'} onClick={() => changeView('month')}>
                  {t('月', 'Month')}
                </ToggleButton>
                <ToggleButton size="small" checked={view === 'week'} appearance={view === 'week' ? 'primary' : 'subtle'} onClick={() => changeView('week')}>
                  {t('週', 'Week')}
                </ToggleButton>
                {/* 週の見方(週の表示だけのもの)は、「週」のすぐ隣に置く(週を選んだあと、そのまま切り替えられるように) */}
                {view === 'week' && (
                  <div className={styles.lensSwitch} role="group" aria-label={t('見方', 'Lens')}>
                    {([['products', t('商品', 'Products')], ['progress', t('進み具合', 'Progress')]] as const).map(([v, name]) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={lens === v}
                        className={mergeClasses(styles.lensBtn, lens === v && styles.lensBtnOn)}
                        onClick={() => {
                          setLens(v)
                          savePref(LENS_KEY, v)
                        }}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                )}
                <ToggleButton size="small" checked={view === 'list'} appearance={view === 'list' ? 'primary' : 'subtle'} onClick={() => changeView('list')}>
                  {t('一覧', 'List')}
                </ToggleButton>
              </div>
              {view === 'list' && (
                <Menu
                  checkedValues={{ columns }}
                  onCheckedValueChange={(_, d) => {
                    const added = d.checkedItems.find((k) => !columns.includes(k as ColumnKey))
                    const removed = columns.find((k) => !d.checkedItems.includes(k))
                    if (added) toggleColumn(added as ColumnKey, true)
                    else if (removed) toggleColumn(removed, false)
                  }}
                >
                  <MenuTrigger disableButtonEnhancement>
                    <Button size="small" appearance="subtle" icon={<ColumnTripleRegular />}>{t('列', 'Columns')}</Button>
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      {COLUMNS.map((c) => (
                        <MenuItemCheckbox key={c.key} name="columns" value={c.key} disabled={c.key === 'name'}>
                          {c.label()}
                        </MenuItemCheckbox>
                      ))}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              )}
              <Tooltip
                content={view === 'week' ? t('表示中の週の配信を、CSV で書き出します(絞り込みを反映)', "Export this week's deliveries as CSV (filters applied)") : t('表示中の月の配信を、CSV で書き出します(絞り込みを反映)', "Export this month's deliveries as CSV (filters applied)")}
                relationship="description"
              >
                <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} onClick={exportCsv} disabled={(view === 'week' ? weekRows : monthRows).length === 0}>
                  {t('CSV で書き出す', 'Export CSV')}
                </Button>
              </Tooltip>
              <div className={styles.legend}>
                {statusOptions.map((o) => (
                  <span key={o.value} className={styles.legendPill}>
                    <span className={styles.legendDot} style={{ backgroundColor: statusColor(o.value) }} />
                    {optionLabel(o.label)}
                  </span>
                ))}
              </div>
            </div>
            {/* 日付から作るときは、その日の 10:00 を配信日時にする(過去の日付でも作れる) */}
            {view === 'list' ? (
              <ListView rows={monthRows} columns={columns} onSelect={setSelectedId} cardProducts={cardProducts} products={products} heroes={heroes} />
            ) : view === 'week' ? (
              <>
              <WeekReviewBar week={thisWeek} cards={weekCards} onChange={changeWeek} />
              <WeekView
                start={weekStart}
                cards={weekRows.map((r) => r.card)}
                cardProducts={cardProducts}
                questionCounts={questionCounts}
                taskCounts={taskCounts}
                overdueTasks={overdueTasks}
                lens={lens}
                products={products}
                heroes={heroes}
                dueSoon={dueSoon}
                onSelect={setSelectedId}
                onCreate={(day) => setCreating(newCardDefaults(`${day}T10:00`))}
              />
              </>
            ) : (
              <Calendar month={month} cards={filtered} dueSoon={dueSoon} onSelect={setSelectedId} onCreate={(day) => setCreating(newCardDefaults(`${day}T10:00`))} />
            )}
          </>
        )}
      </div>
      {(selected || creating) && (
        <CardDetail
          key={selected?.cr854_deliverycardid ?? 'new'}
          card={selected}
          defaults={creating ?? undefined}
          products={products}
          heroes={heroes}
          otherThemes={cards.filter((c) => c.cr854_deliverycardid !== selected?.cr854_deliverycardid && c.cr854_theme).map((c) => c.cr854_theme!)}
          owners={[...new Set(cards.flatMap((c) => [c.cr854_owner?.trim(), c.cr854_productionowner?.trim()]).filter((o): o is string => !!o))].sort()}
          onBack={() => {
            setSelectedId(null)
            setCreating(null)
            // 質問・返信は、保存を待たずに書き込むので、閉じたときにも読み直す
            void load()
          }}
          onSaved={load}
        />
      )}
    </>
  )
}

export default App
