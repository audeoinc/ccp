import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Field,
  Menu,
  MenuDivider,
  MenuGroup,
  MenuGroupHeader,
  MenuItem,
  MenuItemCheckbox,
  MenuItemRadio,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Select,
  Spinner,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import {
  AddRegular,
  AlertRegular,
  ArrowDownloadRegular,
  CalendarLtrRegular,
  ColumnTripleRegular,
  DataBarVerticalRegular,
  SettingsRegular,
  LayoutColumnTwoRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons'
import { Cr854_deliverycardsService } from './generated/services/Cr854_deliverycardsService'
import type { Cr854_deliverycards } from './generated/models/Cr854_deliverycardsModel'
import { Cr854_productsService } from './generated/services/Cr854_productsService'
import type { Cr854_products } from './generated/models/Cr854_productsModel'
import { Cr854_heroimagesService } from './generated/services/Cr854_heroimagesService'
import { Cr854_productpoliciesService } from './generated/services/Cr854_productpoliciesService'
import type { Cr854_heroimages } from './generated/models/Cr854_heroimagesModel'
import { Cr854_deliveryproductsService } from './generated/services/Cr854_deliveryproductsService'
import { Cr854_cardnotesService, type Cr854_cardnotes } from './gcpdata/Cr854_cardnotesService'
import { Cr854_weeksService, type Cr854_weeks, type WeekStatus } from './gcpdata/Cr854_weeksService'
import { WeekReviewBar } from './WeekReviewBar'
import { Calendar } from './Calendar'
import { ListView } from './ListView'
import { ResultsPage } from './ResultsPage'
import { AlertsPage } from './AlertsPage'
import { useChangeAlerts, useStockAlerts } from './alerts'
import { appPath } from './appRoot'
import { isCancelled } from './cancel'
import { ResultPeek } from './ResultPeek'
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
import { sundayOf } from './weekLock'
import { logEvent, myName } from './history'
import { Cr854_eventsService, type Cr854_events } from './gcpdata/Cr854_eventsService'
import { WeekChecklist } from './WeekChecklist'
import { buildChecklist, type CheckKey, type PolicyLite } from './reviewChecks'

const weekLabel = (start: Date) => {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
  return locale() === 'ja-JP' ? `${end.getFullYear()}年 ${f(start)} – ${f(end)}` : `${f(start)} – ${f(end)}, ${end.getFullYear()}`
}

// 表示の切り替え(月のカレンダー / 週 / 表の一覧)。ブラウザごとに覚える
// compare(比べる)は、結果の面だけの見せ方
type View = 'month' | 'week' | 'list' | 'compare'
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
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase400,
    letterSpacing: '0.01em',
  },
  // 表(計画)と裏(結果)の切り替え。題名のすぐ横に固定して、どちらの面でも位置が動かないようにする
  faceSwitch: {
    display: 'inline-flex',
    padding: '2px',
    columnGap: '2px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  faceBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    border: 'none',
    borderRadius: tokens.borderRadiusSmall,
    padding: `4px ${tokens.spacingHorizontalM}`,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground2,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  faceBtnOn: {
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    boxShadow: tokens.shadow2,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1 },
  },
  headerSpacer: { flexGrow: 1 },
  // 結果の面だけの操作(まとめ方・書き出し・取り込み)を、共通のツールバーのこの場所に差し込む
  toolbarSlot: { display: 'contents' },
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
  // 見出しの幅は、月・週・一覧で同じにする(切り替えで、右のボタンがずれないように)。言語ごとに、いちばん長い表記(例: Nov 22 – Nov 28, 2026 / 2026年 11月22日 – 11月28日)が収まる幅
  weekLabel: { width: '180px' },
  weekLabelJa: { width: '236px' },
  // 「週」の隣の、見方の小さな切り替え(週の下位の選択だと分かるよう、枠で囲んで小さく)
  lensSwitch: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '2px',
    padding: '2px',
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
  // 月・一覧では、選べないことが分かるよう、灰色にする(選んでいた見方は、薄く残す)
  lensOff: {
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    '& button': { color: tokens.colorNeutralForegroundDisabled, cursor: 'not-allowed', ':hover': { backgroundColor: 'transparent' } },
    '& button[class]': { boxShadow: 'none' },
  },
  lensBtnOn: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold, boxShadow: tokens.shadow2 },
  // 見せ方の切り替え(ヘッダーの計画 / 結果と同じ形の、枠で囲んだ切り替え)
  viewSwitch: {
    display: 'inline-flex',
    padding: '2px',
    columnGap: '2px',
    marginLeft: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  viewBtn: {
    padding: `3px ${tokens.spacingHorizontalM}`,
    ':disabled': { color: tokens.colorNeutralForegroundDisabled, cursor: 'not-allowed', backgroundColor: 'transparent' },
  },
  lensGroup: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', marginLeft: tokens.spacingHorizontalS },
  lensLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  lensLabelOff: { color: tokens.colorNeutralForegroundDisabled },
  toolbarDivider: { width: '1px', alignSelf: 'stretch', margin: `2px ${tokens.spacingHorizontalS}`, backgroundColor: tokens.colorNeutralStroke2 },
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
  // 配信カードごとの、未対応のレビューのコメントの数(週の表示・確認の一覧)
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map())
  // 週の計画(週のレビューの状態)
  const [weeks, setWeeks] = useState<Cr854_weeks[]>([])
  // 確定した週の配信を変えたときの理由(週の状態の帯に、確定後の変更として出す)
  const [changeNotes, setChangeNotes] = useState<Cr854_cardnotes[]>([])
  // 承認の履歴(週の操作・配信のステータスの変更。週の状態の帯で、週ごとに出す)
  const [events, setEvents] = useState<Cr854_events[]>([])
  // 配信カードごとの、期日を過ぎた未完了のタスクの数(週の表示で、問題として目立たせる)
  const [overdueTasks, setOverdueTasks] = useState<Map<string, number>>(new Map())
  // 週の表示の見方: 商品のバランス / 進み具合。ブラウザごとに覚える
  // 商品の販売方針(商品コードごと。週の確認の一覧で、主力の漏れを見るため)
  const [policies, setPolicies] = useState<Map<string, PolicyLite>>(new Map())
  // 週の確認の一覧で選んだ項目。週を移ったら、選んでいないことにする(週ごとに中身が違うため)
  const [check, setCheck] = useState<{ week: string; key: CheckKey } | null>(null)
  // 開いている画面: カレンダー / 配信結果(振り返り)
  // アラートは、計画・結果とは別の画面(ヘッダーの「アラート」から開く)
  const [page, setPage] = useState<'calendar' | 'results' | 'alerts'>('calendar')
  // 結果の面で、詳しい結果(フロート)を開いている配信
  const [resultDetail, setResultDetail] = useState<string | null>(null)
  // 計画の面で、配信カードの上に重ねて見ている結果(閉じると、配信カードに戻る)
  const [peekResult, setPeekResult] = useState<string | null>(null)
  // 結果の面の操作を差し込む、ツールバーの場所
  const [toolbarSlot, setToolbarSlot] = useState<HTMLSpanElement | null>(null)
  // アラート(在庫の見込み)。配信カードを読み直すたびに、計算し直す
  // 取りやめた配信を除いた配信(アラート・週の確認・件数に使う。カレンダーには、取りやめた配信も薄く出す)
  const activeCards = useMemo(() => cards.filter((c) => !isCancelled(c)), [cards])
  const alertState = useStockAlerts(activeCards, products, cards)
  const alerts = alertState.alerts
  // 変更のアラート(MD 方針の変更・日程の変更)。件数は、在庫のアラートと合わせて、ヘッダーに出す
  const changeState = useChangeAlerts(activeCards, products, alertState.placements, cards)
  const alertCount = alerts.length + changeState.changeAlerts.length
  const showFace = (p: 'calendar' | 'results' | 'alerts') => {
    setResultDetail(null)
    // 「比べる」は結果の面だけ。計画の面に戻るときは、月にする
    if (p === 'calendar' && view === 'compare') setView('month')
    setPage(p)
  }
  const [lens, setLens] = useState<WeekLens>(() => loadPref<WeekLens>(LENS_KEY, 'products'))
  // 最初は計画の面なので、「比べる」を覚えていても、月で始める
  const [view, setView] = useState<View>(() => {
    const v = loadPref<View>(VIEW_KEY, 'month')
    return v === 'compare' ? 'month' : v
  })
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
          const comments = new Map<string, number>()
          const d = new Date()
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          setChangeNotes((res.data ?? []).filter((n) => n.cr854_kind === 'change'))
          for (const n of res.data ?? []) {
            const id = n._cr854_deliverycard_value
            if (!id || n.cr854_resolved) continue
            // 変更の理由は記録、コメントへの返信はスレッドの一部なので、質問・タスクの数には入れない
            if (n.cr854_kind === 'change' || n.cr854_kind === 'reply') continue
            if (n.cr854_kind === 'comment') {
              comments.set(id, (comments.get(id) ?? 0) + 1)
              continue
            }
            if (n.cr854_kind === 'task') {
              tasks.set(id, (tasks.get(id) ?? 0) + 1)
              if (n.cr854_due && n.cr854_due.slice(0, 10) < today) overdue.set(id, (overdue.get(id) ?? 0) + 1)
            }
            else counts.set(id, (counts.get(id) ?? 0) + 1)
          }
          setQuestionCounts(counts)
          setTaskCounts(tasks)
          setOverdueTasks(overdue)
          setCommentCounts(comments)
        })
        .catch(() => undefined)
      Cr854_weeksService.getAll()
        .then((res) => {
          if (res.success) setWeeks(res.data ?? [])
        })
        .catch(() => undefined)
      Cr854_eventsService.getAll({ orderBy: ['createdon desc'] })
        .then((res) => {
          if (res.success) setEvents(res.data ?? [])
        })
        .catch(() => undefined)
      const res = await Cr854_deliverycardsService.getAll({ orderBy: ['cr854_scheduledat asc'] })
      if (!res.success) throw new Error(res.error?.message ?? tr('配信カードの取得に失敗しました', 'Failed to load delivery cards'))
      const data = res.data ?? []
      setCards(data)
      setError(null)
      // 初回のみ、今月以降で最初に配信がある月を表示する(過去の配信が多くても、今の計画から見られるように)。
      // 今月以降に配信がなければ、いちばん古い配信の月、配信がなければ今月
      setMonth((m) => {
        if (m) return m
        const now = new Date()
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
        const dated = data.filter((c) => c.cr854_scheduledat)
        const first = (dated.find((c) => new Date(c.cr854_scheduledat!).getTime() >= thisMonth) ?? dated[0])?.cr854_scheduledat
        const base = first ? new Date(first) : now
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
    Cr854_productpoliciesService.getAll({ select: ['cr854_productcode', 'cr854_stage', 'cr854_promoperiod'] })
      .then((res) => {
        if (!res.success) return // 主力の漏れが出ないだけで、画面は使える
        setPolicies(new Map((res.data ?? []).filter((r) => r.cr854_productcode).map((r) => [r.cr854_productcode!, { stage: r.cr854_stage, promoPeriod: r.cr854_promoperiod }])))
      })
      .catch(() => undefined)
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
  const dueSoon = useMemo(() => new Set(rows.filter((r) => r.dueSoon && !isCancelled(r.card)).map((r) => r.card.cr854_deliverycardid)), [rows])
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
    return activeCards.filter((c) => c.cr854_scheduledat && new Date(c.cr854_scheduledat) >= weekStart && new Date(c.cr854_scheduledat) < end)
  }, [activeCards, weekStart])
  const checklist = useMemo(
    () =>
      buildChecklist({
        weekStart,
        weekCards,
        allCards: activeCards,
        cardProducts,
        products,
        policies,
        questionCounts,
        commentCounts,
        cardLabel: (c) => `${c.cr854_scheduledat ? new Date(c.cr854_scheduledat).toLocaleDateString(locale(), { weekday: 'short' }) : ''} ${c.cr854_name}`.trim(),
      }),
    // 言語を変えたら、説明(曜日・種類)を作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekStart, weekCards, cards, cardProducts, products, policies, questionCounts, commentCounts, lang],
  )
  const checkKey = check?.week === weekKey ? check.key : null
  const focusItem = checklist.find((i) => i.key === checkKey)
  const focus = useMemo(() => (focusItem ? { cards: new Set(focusItem.cardIds), products: new Set(focusItem.productIds) } : undefined), [focusItem])
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
      const moved: string[] = []
      for (const c of weekCards) {
        const v = target(c)
        if (v === undefined) continue
        const r = await Cr854_deliverycardsService.update(c.cr854_deliverycardid, { cr854_status: v as Cr854_deliverycards['cr854_status'] })
        if (!r.success) throw new Error(r.error?.message ?? tr('配信のステータスを変えられませんでした', 'Could not update a delivery status'))
        moved.push(c.cr854_name)
      }
      const now = new Date().toISOString()
      const fields = {
        cr854_status: next,
        ...(next === 'review' && thisWeek?.cr854_status !== 'confirmed' ? { cr854_submittedat: now } : {}),
        ...(next === 'confirmed' ? { cr854_confirmedat: now } : {}),
      }
      const res = thisWeek ? await Cr854_weeksService.update(thisWeek.cr854_weekid, fields) : await Cr854_weeksService.create({ cr854_weekstart: weekKey, ...fields })
      if (!res.success) throw new Error(res.error?.message ?? tr('週の状態を保存できませんでした', 'Could not save the week status'))
      // 承認の履歴(W6)。まとめて状態を変えた配信は、1 本ずつではなく、週の出来事 1 つに名前を並べて残す(履歴が埋もれないように)
      const wasConfirmed = thisWeek?.cr854_status === 'confirmed'
      await logEvent({
        action: next === 'confirmed' ? 'confirm' : next === 'draft' ? 'draft' : wasConfirmed ? 'unconfirm' : 'submit',
        weekStart: weekKey,
        // まとめて変えた配信の、変える前と後のステータス(確定は、元がまちまちなので、後だけ)
        ...(moved.length
          ? next === 'confirmed'
            ? { to: 588230003 }
            : wasConfirmed
              ? { from: 588230003, to: 588230002 }
              : next === 'review'
                ? { from: 588230000, to: 588230001 }
                : {}
          : {}),
        note: moved.join(' / ') || undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    await load()
  }
  // 週の「検討中」の配信を、まとめて承認する(承認の単位は、1 本ずつと週まとめての両方。2026-10-14 決定)
  const approveWeek = async () => {
    setError(null)
    try {
      const moved: string[] = []
      for (const c of weekCards.filter((x) => x.cr854_status === 588230001)) {
        const r = await Cr854_deliverycardsService.update(c.cr854_deliverycardid, { cr854_status: 588230002 as Cr854_deliverycards['cr854_status'] })
        if (!r.success) throw new Error(r.error?.message ?? tr('配信のステータスを変えられませんでした', 'Could not update a delivery status'))
        moved.push(c.cr854_name)
      }
      if (moved.length) await logEvent({ action: 'approve', weekStart: weekKey, from: 588230001, to: 588230002, note: moved.join(' / ') })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    await load()
  }
  // 週の見方(商品 / 進み具合)は、計画の面の、週の表示だけで使う
  const lensOn = page === 'calendar' && view === 'week'
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
        <h1 className={styles.title}>{t('コンテンツプランナー', 'Contents Planner')}</h1>
        {/* 計画(表)と結果(裏)。同じ期間・見せ方・絞り込みのまま、面だけを切り替える */}
        <div className={styles.faceSwitch} role="tablist" aria-label={t('計画と結果', 'Plan and results')}>
          {(
            [
              ['calendar', t('計画', 'Plan'), <CalendarLtrRegular key="i" />],
              ['results', t('結果', 'Results'), <DataBarVerticalRegular key="i" />],
            ] as const
          ).map(([p, label, icon]) => (
            <button key={p} type="button" role="tab" aria-selected={page === p} className={mergeClasses(styles.faceBtn, page === p && styles.faceBtnOn)} onClick={() => showFace(p)}>
              {icon}
              {label}
            </button>
          ))}
        </div>
        <span className={styles.headerSpacer} />
        {/* アラート: 配信に影響する変更(いまは在庫)。件数は、どの画面からも見えるように、ヘッダーに出す */}
        <Tooltip content={t('配信に影響する変更(在庫切れ・在庫僅少・MD 方針の変更・日程の変更)', 'Changes that affect deliveries (stock, MD policy, dates)')} relationship="description">
          <Button
            appearance={page === 'alerts' ? 'primary' : 'subtle'}
            size="small"
            icon={<AlertRegular />}
            onClick={() => showFace(page === 'alerts' ? 'calendar' : 'alerts')}
          >
            {t('アラート', 'Alerts')}
            {alertCount > 0 && (
              <Badge size="small" appearance="filled" color={alerts.some((a) => a.kind === 'outOfStock') ? 'danger' : 'warning'} style={{ marginLeft: 6 }}>
                {alertCount}
              </Badge>
            )}
          </Button>
        </Tooltip>
        <Button appearance="primary" size="small" icon={<AddRegular />} onClick={() => setCreating(newCardDefaults())}>
          {t('新規作成', 'New')}
        </Button>
        {/* 管理系(テンプレート・言語・自動の下書き)は、毎日の作業と分けて、設定のメニューにまとめる */}
        <Menu
          checkedValues={{ lang: [lang], auto: autoDraft ? ['on'] : [] }}
          onCheckedValueChange={(_, d) => {
            if (d.name === 'lang' && (d.checkedItems[0] === 'ja' || d.checkedItems[0] === 'en')) setLang(d.checkedItems[0])
            if (d.name === 'auto') {
              const on = d.checkedItems.includes('on')
              setAutoDraft(on)
              saveAutoDraft(on)
            }
          }}
        >
          <MenuTrigger disableButtonEnhancement>
            <Tooltip content={t('設定(テンプレート・言語・自動の下書き)', 'Settings (templates, language, auto-draft)')} relationship="label">
              <Button appearance="subtle" size="small" icon={<SettingsRegular />} />
            </Tooltip>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<LayoutColumnTwoRegular />} onClick={openTemplateManager}>
                {t('テンプレートの管理', 'Manage templates')}
              </MenuItem>
              {/* 引っ越し用のパック: すべてのデータと画像を 1 つの ZIP に書き出す(外にアクセスできない環境へ持ち込むため。server/ccp/pack.py) */}
              <MenuItem
                icon={<ArrowDownloadRegular />}
                secondaryContent={t('ZIP', 'ZIP')}
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = appPath('/api/export')
                  a.download = ''
                  a.click()
                }}
              >
                {t('データと画像を書き出す(別の環境へ移す)', 'Export data and images (to another environment)')}
              </MenuItem>
              <MenuDivider />
              <MenuGroup>
                <MenuGroupHeader>{t('言語', 'Language')}</MenuGroupHeader>
                <MenuItemRadio name="lang" value="ja">日本語</MenuItemRadio>
                <MenuItemRadio name="lang" value="en">English</MenuItemRadio>
              </MenuGroup>
              <MenuDivider />
              <MenuItemCheckbox name="auto" value="on" secondaryContent={autoDraft ? t('オン', 'On') : t('オフ', 'Off')}>
                {t('開いたとき自動で下書き', 'Auto-draft on open')}
              </MenuItemCheckbox>
            </MenuList>
          </MenuPopover>
        </Menu>
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
            {/* アラートの画面は、期間・見せ方を使わないので、ツールバーを出さない */}
            {page !== 'alerts' && (
            <>
            <div className={styles.filterRow}>
              <FilterSelect label={t('国', 'Country')} value={filters.country} options={countryOptions} onChange={setFilter('country')} />
              <FilterSelect label={t('チャネル', 'Channel')} value={filters.channel} options={channelOptions} onChange={setFilter('channel')} />
              <FilterSelect label={t('種別', 'Type')} value={filters.department} options={departmentOptions} onChange={setFilter('department')} />
              <FilterSelect label={t('ステータス', 'Status')} value={filters.status} options={statusOptions} onChange={setFilter('status')} />
              {filtering && <Button size="small" appearance="subtle" onClick={() => setFilters(noFilter)}>{t('クリア', 'Clear')}</Button>}
              <span className={styles.count}>{t(`${filtered.filter((c) => !isCancelled(c)).length} / ${activeCards.length} 件`, `${filtered.filter((c) => !isCancelled(c)).length} / ${activeCards.length} items`)}</span>
            </div>
            <div className={styles.monthRow}>
              <Button appearance="subtle" size="small" icon={<ChevronLeftRegular />} disabled={view === 'compare'} onClick={() => shift(-1)} aria-label={view === 'week' ? t('前の週', 'Previous week') : t('前の月', 'Previous month')} />
              <span className={mergeClasses(styles.monthLabel, lang === 'ja' ? styles.weekLabelJa : styles.weekLabel)}>
                {view === 'compare'
                  ? t('絞り込んで比べる', 'Filter and compare')
                  : view === 'week'
                  ? weekLabel(weekStart)
                  : lang === 'ja'
                    ? `${month.getFullYear()}年${month.getMonth() + 1}月`
                    : month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })}
              </span>
              <Button appearance="subtle" size="small" icon={<ChevronRightRegular />} disabled={view === 'compare'} onClick={() => shift(1)} aria-label={view === 'week' ? t('次の週', 'Next week') : t('次の月', 'Next month')} />
              {/* 見せ方の切り替え: 枠で囲んだひとかたまりにして、操作のボタンと見分けられるようにする。
                  比べるは結果の面だけ。計画の面では選べないだけにする(消えると、ほかのボタンの位置がずれるため) */}
              <div className={styles.viewSwitch} role="tablist" aria-label={t('見せ方', 'View')}>
                {(
                  [
                    ['month', t('月', 'Month'), false, undefined],
                    ['week', t('週', 'Week'), false, undefined],
                    ['list', t('一覧', 'List'), false, undefined],
                    [
                      'compare',
                      t('比べる', 'Compare'),
                      page !== 'results',
                      page !== 'results' ? t('結果の面で使えます', 'Available on the Results side') : t('配信カードの項目で絞り込み、直近の配信を並べて比べます', 'Filter by delivery card fields and compare recent deliveries side by side'),
                    ],
                  ] as const
                ).map(([v, label, off, title]) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    disabled={off}
                    title={title}
                    className={mergeClasses(styles.faceBtn, styles.viewBtn, view === v && styles.faceBtnOn)}
                    onClick={() => changeView(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {/* 週の見方: 見せ方の切り替えのすぐ外に、ラベルを付けて置く。計画の面の週の表示だけで使い、ほかでは選べないだけにする */}
              <span className={styles.lensGroup}>
                <span className={mergeClasses(styles.lensLabel, !lensOn && styles.lensLabelOff)}>{t('週の見方', 'Week lens')}</span>
                <div className={mergeClasses(styles.lensSwitch, !lensOn && styles.lensOff)} role="group" aria-label={t('週の見方', 'Week lens')} aria-disabled={!lensOn}>
                  {([['products', t('商品', 'Products')], ['progress', t('進み具合', 'Progress')]] as const).map(([v, name]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={lensOn && lens === v}
                      disabled={!lensOn}
                      title={!lensOn ? (page === 'results' ? t('計画の面で使えます', 'Available on the Plan side') : t('週の表示で使えます', 'Available in the week view')) : undefined}
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
              </span>
              {/* ここから右は、操作(書き出しなど)。切り替えと分けて見えるよう、区切りの線を置く */}
              <span className={styles.toolbarDivider} aria-hidden />
              <span ref={setToolbarSlot} className={styles.toolbarSlot} />
              {page === 'calendar' && (
              <Tooltip
                content={view === 'week' ? t('表示中の週の配信を、CSV で書き出します(絞り込みを反映)', "Export this week's deliveries as CSV (filters applied)") : t('表示中の月の配信を、CSV で書き出します(絞り込みを反映)', "Export this month's deliveries as CSV (filters applied)")}
                relationship="description"
              >
                <Button size="small" appearance="subtle" icon={<ArrowDownloadRegular />} onClick={exportCsv} disabled={(view === 'week' ? weekRows : monthRows).length === 0}>
                  {t('CSV で書き出す', 'Export CSV')}
                </Button>
              </Tooltip>
              )}
              {page === 'calendar' && view === 'list' && (
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
              {page === 'calendar' && (
              <div className={styles.legend}>
                {statusOptions.map((o) => (
                  <span key={o.value} className={styles.legendPill}>
                    <span className={styles.legendDot} style={{ backgroundColor: statusColor(o.value) }} />
                    {optionLabel(o.label)}
                  </span>
                ))}
              </div>
              )}
            </div>
            </>
            )}
            {/* 日付から作るときは、その日の 10:00 を配信日時にする(過去の日付でも作れる) */}
            {page === 'alerts' ? (
              <AlertsPage alerts={alerts} changeAlerts={changeState.changeAlerts} onResolve={(a, note) => changeState.resolve(a, myName(), note)} products={products} placements={alertState.placements} model={alertState.model} weeks={weeks} onOpenCard={setSelectedId} onChanged={load} />
            ) : page === 'results' ? (
              <ResultsPage
                cards={filtered}
                products={products}
                heroes={heroes}
                cardProducts={cardProducts}
                view={view}
                month={month}
                weekStart={weekStart}
                toolbarSlot={toolbarSlot}
                detailId={resultDetail}
                onDetail={setResultDetail}
                onOpenCard={setSelectedId}
                onCardsChanged={load}
              />
            ) : view === 'list' ? (
              <ListView rows={monthRows} columns={columns} onSelect={setSelectedId} cardProducts={cardProducts} products={products} heroes={heroes} />
            ) : view === 'week' ? (
              <>
              <WeekReviewBar week={thisWeek} cards={weekCards} changes={changeNotes} events={events.filter((e) => e.cr854_weekstart?.slice(0, 10) === weekKey)} onApproveAll={approveWeek} onChange={changeWeek} />
              <WeekChecklist items={checklist} selected={checkKey} onSelect={(key) => setCheck(key ? { week: weekKey, key } : null)} />
              <WeekView
                start={weekStart}
                cards={weekRows.map((r) => r.card)}
                cardProducts={cardProducts}
                questionCounts={questionCounts}
                taskCounts={taskCounts}
                commentCounts={commentCounts}
                overdueTasks={overdueTasks}
                lens={lens}
                products={products}
                heroes={heroes}
                dueSoon={dueSoon}
                focus={focus}
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
          weeks={weeks}
          owners={[...new Set(cards.flatMap((c) => [c.cr854_owner?.trim(), c.cr854_productionowner?.trim()]).filter((o): o is string => !!o))].sort()}
          onBack={() => {
            setSelectedId(null)
            setCreating(null)
            // 質問・返信は、保存を待たずに書き込むので、閉じたときにも読み直す
            void load()
          }}
          onSaved={load}
          // 結果は、面を切り替えずに、配信カードの上に重ねて見る。結果の面で、その結果から開いた配信カードでは出さない(下に結果があるため)
          onOpenResults={page === 'results' && resultDetail === selected?.cr854_deliverycardid ? undefined : setPeekResult}
        />
      )}
      {peekResult && (
        <ResultPeek cardId={peekResult} cards={cards} cardProducts={cardProducts} products={products} heroes={heroes} onClose={() => setPeekResult(null)} onCardChanged={load} />
      )}
    </>
  )
}

export default App
