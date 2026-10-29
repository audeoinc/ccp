import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  Button,
  Menu,
  MenuButton,
  MenuDivider,
  MenuGroup,
  MenuGroupHeader,
  MenuItem,
  MenuItemCheckbox,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  Portal,
  Spinner,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import {
  ArrowDownloadRegular,
  ArrowUploadRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DismissRegular,
  DocumentPdfRegular,
  HistoryRegular,
  TableRegular,
} from '@fluentui/react-icons'
import { CopyRegular as CtxCopyRegular, DataBarVerticalRegular as CtxResultsRegular, OpenRegular as CtxOpenRegular, PaintBrushRegular as CtxProductionRegular } from '@fluentui/react-icons'
import { keepBrowserMenu, useContextMenu } from './ContextMenu'
import { DuplicateDialog } from './CardMenu'
import { DevRequestLayer } from './DevRequestLayer'
import { onOpenDevRequestList } from './devRequestPlace'
import { DeliveryCardsService } from './data/deliveryCards'
import type { DeliveryCard } from './models/deliveryCards'
import type { WeekRow, WeekStatus } from './data/weeks'
import { WeekReviewBar, WeekScopeBar } from './WeekReviewBar'
import { SignInDialog } from './MePicker'
import { PrevMonthRetro, WeekRetro } from './WeekRetro'
import { WeekHistory } from './WeekHistory'
import { MonthSummaryBar } from './MonthSummaryBar'
import { Calendar } from './Calendar'
import { ListView } from './ListView'
import type { ResultsDataActions } from './ResultsPage'
import { AiIcon } from './AiMark'
import { AlertsFloat } from './AlertsFloat'
import type { Face } from './faces'
import { dateOf, dateText, parseLink, type LinkState } from './deepLink'
import { useChangeAlerts, useStockAlerts } from './alerts'
import { buildCardAlerts, imageExpiryAlerts, mergeCardAlerts, overLimitAlerts, topKind, weeklyUse, type CardAlert, type CardAlertKind } from './cardAlerts'
import { filterChangeAlerts, filterStockAlerts, useAlertSettings } from './alertSettings'
import { isCancelled } from './cancel'
import { onPolicyWarning } from './aiSelect'
import { WeekView, type WeekLens } from './WeekView'
import { WeekLensTabs } from './WeekLensTabs'
import { WeekTimeGrid } from './WeekTimeGrid'
import { WeekCompare } from './WeekCompare'
import { COLUMNS, DEFAULT_COLUMNS, downloadCsv, toRows, type ColumnKey } from './listRows'
import { loadCustomTemplates } from './layoutTemplates'
import { ErrorBoundary } from './ErrorBoundary'
import { useCountryApply } from './countryApply'
import { criteriaFor, useCountrySettings } from './countrySettings'
import { usePeople, usePeopleManagerOpen } from './people'
import { useApprovalInbox } from './useApprovalInbox'
import { productionColor, productionLabel, productionView, useProductionRequests } from './useProductionRequests'
import { StageNav } from './StageNav'
import { SwipePager } from './SwipePager'
import { approveMine, needsRequest, requestAll } from './weekApprovals'
import { markTemplatesLoadFailed, useTemplateManagerOpen, useTemplates } from './templates'
import { useOpenedOnce } from './useOpenedOnce'
import { CardDetail, type NewCardDefaults } from './CardDetail'
import { NewCampaignDialog } from './CampaignDialogs'
import { isFrame } from './bulkDraft'
import { useBulkWorkspace, type BulkDraft } from './useBulkWorkspace'
import { loadAutoDraft, loadLastNewCountry, loadPref, saveAutoDraft, savePref } from './settings'
import { locale, optionLabel, setLang, tr, useLang, useT } from './i18n'
import { countryOptions, statusColor, statusOptions, statusRank, statusView } from './status'
import { themeTypeOf } from './themeTypes'
import { confirmedWeekOf, dayKeyOf, saveWeekRow, scopeLabel, scopeOfCard, segmentsOf, sundayOf, weekConfirmedIn, weekKeyOf, weekRowOf } from './weekLock'
import { logEvent, myName, myUserId, onMeChange } from './history'
import { WeekCheckChip, WeekChecklist } from './WeekChecklist'
import { MiniCalendar } from './MiniCalendar'
import { printWeek } from './printWeek'
// 週の資料は、印刷を始める直前に描くので、分けずに読み込んでおく(あとから読むと、白い紙が出る)
import { WeekReport } from './WeekReport'
import { buildChecklist, type CheckKey } from './reviewChecks'
import { limitRulesVersion, onLimitRulesChange } from './weeklyLimit'
import { localDate } from './results'
import { PREF } from './prefKeys'
import { ConfirmHost } from './ConfirmHost'
import { useAppData } from './useAppData'
import { useCampaigns } from './useCampaigns'
import { useCardNoteStats } from './useCardNoteStats'
import { useUrlSync } from './useUrlSync'
import { useSettingsActions } from './settingsActions'
import { AppToolbar } from './AppToolbar'
import { noFilter, useFaceButtonStyles, type Filters } from './appToolbarParts'
import { Later, SettingsDialog, ResultsPage, ImpactView, LearningHand, ProductsView, ResultPeek, ProductionPage, SimpleProductionPage, AlertsPage, BulkWorkspace, TemplateManager, PeopleManager, DevRequestsDialog } from './lazyViews'
import { ym, ymd } from './dates'
import { isOn, useFeature, useFeatureVersion } from './featureFlags'
import { FeatureBadge } from './FeatureBadge'

const weekLabel = (start: Date) => {
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)
  const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
  return locale() === 'ja-JP' ? `${end.getFullYear()}年 ${f(start)} – ${f(end)}` : `${f(start)} – ${f(end)}, ${end.getFullYear()}`
}

// 表示の切り替え(月のカレンダー / 週 / 表の一覧)。ブラウザごとに覚える
// compare(比べる)は、結果の面だけの見せ方
type View = 'month' | 'week' | 'list' | 'compare' | 'products' | 'impact' | 'learnings'
// 結果の面だけの見せ方(計画の面に戻るときは、月にする)
const RESULTS_ONLY: View[] = ['compare', 'impact', 'learnings']
const VIEW_KEY = PREF.calendarView
const LENS_KEY = PREF.weekLens
const COLUMNS_KEY = PREF.listColumns

// 担当の絞り込みの「自分」(ログインしている人の名前に読み替える。名前が変わっても、選び直さなくてよい)
const ME_PERSON = '__me__'
// 国(X33): 表示の絞り込みではなく、ヘッダーで選ぶ「どの国の仕事をしているか」。人ごと(ブラウザごと)に覚える。
// 初めて開いたときは、ビルドの設定(VITE_DEFAULT_COUNTRY。US)の国。'' = すべての国
const COUNTRY_KEY = PREF.country
const defaultCountry = String(countryOptions.find((o) => o.label === import.meta.env.VITE_DEFAULT_COUNTRY)?.value ?? '')
const initialFilters = (): Filters => ({ ...noFilter, country: loadPref<string>(COUNTRY_KEY, defaultCountry) })

const useStyles = makeStyles({
  // 見せ方「商品」の期間(X49)
  rangeRow: { display: 'inline-flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase300 },
  rangeInput: { fontFamily: 'inherit', fontSize: tokens.fontSizeBase300, padding: '2px 6px', border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium },
  rangePresets: { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' },
  // 絞り込み(X37): 国と同じ形のボタン。絞っているときは色を付け、中身を文字で出す
  filterBtnOn: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  filterBtnText: { maxWidth: '320px', overflow: 'hidden', textOverflow: 'ellipsis' },
  filterPanel: { display: 'grid', rowGap: '8px', justifyItems: 'start', minWidth: '240px' },
  filterPanelHead: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2 },
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
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
    alignItems: 'center',
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
  // 「この画面 ▾」(ツールバーの右端)
  viewMenu: { marginLeft: 'auto' },
  // 見出しの幅は、月・週・一覧で同じにする(切り替えで、右のボタンがずれないように)。言語ごとに、いちばん長い表記(例: Nov 22 – Nov 28, 2026 / 2026年 11月22日 – 11月28日)と、
  // 押せると分かる印(カレンダーのアイコン・▾・枠。W13)が収まる幅
  weekLabel: { width: '272px' },
  weekLabelJa: { width: '288px' },
  // 見せ方「商品」の期間(日付の欄が 2 つ並ぶので、幅を中身に合わせる)
  rangeLabel: { width: 'auto' },
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
  toolbarDivider: { width: '1px', alignSelf: 'stretch', margin: `2px ${tokens.spacingHorizontalS}`, backgroundColor: tokens.colorNeutralStroke2 },
})

function App() {
  // 開いたときの URL(リンクから開いたら、その画面で始める。X36)
  const [link] = useState(() => parseLink(window.location.search))
  const styles = useStyles()
  const faceBtn = useFaceButtonStyles()
  const t = useT()
  const lang = useLang()
  const [bqNotice, setBqNotice] = useState<{ intent: 'success' | 'warning' | 'error'; text: string } | null>(null)
  // 設定の画面(ST10。⚙ から開く)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // AI の案が、作り直しても must の決まりを破っていたとき(M5)。案は使えるが、人が確かめる
  const [policyWarning, setPolicyWarning] = useState<string | null>(null)
  useEffect(
    () =>
      onPolicyWarning((w) =>
        setPolicyWarning(
          tr('AI の案が、必ず守る決まりを破っています(作り直しても直りませんでした)。案を確認して、直してから保存してください: ', 'An AI suggestion breaks a must rule (still broken after one retry). Check and fix it before saving: ') +
            w.violations.map((v) => `${v.ruleId}「${v.title}」(${v.detail})`).join(' / '),
        ),
      ),
    [],
  )
  // リンクの日付があれば、その月(週なら、その週の真ん中の日の月)で始める。なければ、読み込んだあとに決める
  const [month, setMonth] = useState<Date | null>(() => {
    const d = dateOf(link.date)
    if (!d) return null
    const mid = link.view === 'week' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3) : d
    return new Date(mid.getFullYear(), mid.getMonth(), 1)
  })
  // 画面全体が使う表の読み込みと読み直し(useAppData)
  const {
    cards, products, heroes, loading, error, setError, bq, bqBusy, patterns, policies,
    cardProducts, variantProducts, cardImages, expiringImages, productRows, resultsKey, changeKey,
    notes, weeks, setWeeks, events,
    reloadHeroes, loadPatterns, loadMarketingPolicies, loadParts, reloadCards, load, loadProducts, runBqSync,
  } = useAppData({
    notify: setBqNotice,
    // 初回のみ、今月以降で最初に配信がある月を表示する(過去の配信が多くても、今の計画から見られるように)。
    // 今月以降に配信がなければ、いちばん古い配信の月、配信がなければ今月
    onCardsLoaded: (data) =>
      setMonth((m) => {
        if (m) return m
        const now = new Date()
        const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
        const dated = data.filter((c) => c.scheduled_at)
        const first = (dated.find((c) => new Date(c.scheduled_at!).getTime() >= thisMonth) ?? dated[0])?.scheduled_at
        const base = first ? new Date(first) : now
        return new Date(base.getFullYear(), base.getMonth(), 1)
      }),
  })
  // やり取りから数えたもの(質問・タスク・コメントの件数、担当の候補、確定後の変更)
  const { questionCounts, noteParties, taskCounts, commentCounts, openComments, overdueTasks, changeNotes } = useCardNoteStats(notes)
  // リンクの国は、そのときだけ合わせる(ふだんの国の設定は書き換えない)
  const [filters, setFilters] = useState<Filters>(() => ({ ...initialFilters(), ...(link.country !== undefined ? { country: link.country } : {}) }))
  // 国を変える(ヘッダー)。覚えておき、次に開いたときも同じ国で始める
  const setCountry = (v: string) => {
    setFilters((f) => ({ ...f, country: v }))
    savePref(COUNTRY_KEY, v)
  }
  // 右上でログインしている人の名前(担当の絞り込みの「自分」に使う。切り替えたら、絞り込みも追いかける)
  const me = useSyncExternalStore(onMeChange, myName)
  const personName = filters.person === ME_PERSON ? me : filters.person
  // 見せ方「商品」の期間(X49)。既定は、4 週間前から 2 週間あと(過去の結果と、これからの予定の両方を見るため)
  const [range, setRange] = useState<{ from: string; to: string }>(() => {
    if (link.from && link.to) return { from: link.from, to: link.to }
    const now = new Date()
    return { from: dateText(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27)), to: dateText(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 14)) }
  })
  const [selectedId, setSelectedId] = useState<string | null>(link.card ?? null)
  // 開いていた配信カードから続けて開いたカード(きょうだいの切り替えなど)。窓を付け直すときに、出てくる動きを付けない(CardDetail の instant)
  const [instantId, setInstantId] = useState<string | null>(null)
  const openNext = (id: string) => {
    setInstantId(id)
    setSelectedId(id)
  }
  // 新規作成中なら、最初に入れておく値(null は新規作成していない)
  const [creating, setCreating] = useState<NewCardDefaults | null>(null)
  // まとめて作る作業画面の、まだ保存していない案を、配信カードで開いているとき(保存すると新規作成になる)
  const [draftOpen, setDraftOpen] = useState<{ day: string; draft: BulkDraft; alerts?: CardAlert[]; focus?: string } | null>(null)

  // 週の上限(同じ商品を週に何回載せたか)に使う、AB テストの B・C 案の商品も足した中身(X55 段階 3)。
  // B・C 案も実際に一部の受信者に送るので、安全側に数える。同じ配信の中で A と同じ商品は 1 回だけ
  const cardProductsAll = useMemo(() => {
    if (variantProducts.size === 0) return cardProducts
    const out = new Map(cardProducts)
    for (const [id, byKey] of variantProducts) out.set(id, [...new Set([...(cardProducts.get(id) ?? []), ...Object.values(byKey).flat()])])
    return out
  }, [cardProducts, variantProducts])
  const productCounts = useMemo(() => new Map([...cardProducts].map(([k, v]) => [k, v.length])), [cardProducts])
  // 週の表示の、週の初め(日曜日)
  const [weekStart, setWeekStart] = useState<Date>(() => sundayOf(dateOf(link.date) ?? new Date()))
  // 週の資料(PDF)を印刷している間だけ true(資料を描いて、印刷の画面を開き、閉じたら片付ける)
  const [printingWeek, setPrintingWeek] = useState(false)
  // 結果の面のデータの操作(ResultsPage から受け取り、⚙ のメニューに並べる)
  const [resultsData, setResultsData] = useState<ResultsDataActions | null>(null)
  // 週の表示の見方: 商品のバランス / 進み具合。ブラウザごとに覚える
  // 週の確認の一覧で選んだ項目。週を移ったら、選んでいないことにする(週ごとに中身が違うため)
  const [check, setCheck] = useState<{ week: string; key: CheckKey } | null>(null)
  // 開いている画面: カレンダー / 配信結果(振り返り)
  // アラートは、計画・結果とは別の画面(ヘッダーの「アラート」から開く)
  // 計画(表)・制作(中。PR4)・結果(裏)。同じカレンダー(配信日)を起点に行き来する
  const [page, setPage] = useState<'calendar' | 'production' | 'results' | 'alerts'>(link.page ?? 'calendar')
  // 開いている制作のページ(配信の id)
  const [productionOpen, setProductionOpen] = useState<string | null>(link.production ?? null)
  // 結果の面で、詳しい結果(フロート)を開いている配信
  const [resultDetail, setResultDetail] = useState<string | null>(link.result ?? null)
  // 計画の面で、配信カードの上に重ねて見ている結果(閉じると、配信カードに戻る)
  const [peekResult, setPeekResult] = useState<string | null>(null)
  // 結果の面の操作を差し込む、ツールバーの場所
  const [toolbarSlot, setToolbarSlot] = useState<HTMLSpanElement | null>(null)
  // 週の見方を、このボタンから下に生える形に置く(WeekLensTabs)
  const [weekBtn, setWeekBtn] = useState<HTMLButtonElement | null>(null)
  // アラート(在庫の見込み)。配信カードを読み直すたびに、計算し直す
  // 取りやめた配信を除いた配信(アラート・週の確認・件数に使う。カレンダーには、取りやめた配信も薄く出す)
  // 国(ヘッダー)で絞った配信。計画・結果・週の帯・アラート・依頼の件数など、画面のすべてがこの国の配信を見る(X33)
  // キャンペーン(X79)。月のカレンダーはキャンペーン単位、時間帯別は札にキャンペーン名
  const campaigns = useCampaigns(cards)
  const scopedCards = useMemo(() => (filters.country ? cards.filter((c) => c.country === filters.country) : cards), [cards, filters.country])
  const activeCards = useMemo(() => scopedCards.filter((c) => !isCancelled(c)), [scopedCards])
  // ユーザー・承認グループと、依頼中の承認(ヘッダーの「自分宛ての依頼」と、週の帯のまとめての操作に使う。U5・U6)
  const people = usePeople()
  const inbox = useApprovalInbox(scopedCards)
  // 制作の依頼(配信ごとの最新の版)。制作の面の箱の色・締め切りの印に使う(PR4)
  const production = useProductionRequests(cards)
  const onProduction = page === 'production'
  // 配信の段階の帯(StageNav)と「企画を見る」で、同じ配信の隣の段のフロートに切り替える。
  // 配信カードと制作のページは、閉じずに重ねる(閉じると直しかけを捨てるため。2026-10-20、利用者の要望で「企画を見る」も重ねる)。
  // 重なりの順は、あとから開いたものが上。下にあるものを見たいときは、上を閉じて見せる(配信カード)か、開き直して上に出す(制作のページ)
  const [productionKey, setProductionKey] = useState(0)
  // 制作のページを開いたら、そのまま制作に依頼するか(シンプルな配信カードの「制作に渡す」)
  const [productionAuto, setProductionAuto] = useState(false)
  // 制作のページを、シンプル(X86)と詳しいのどちらで開くか(人ごとに覚える。詳しいほうは消すまで並べて残す)。
  // 「制作に渡す」から開くときは、渡す処理が詳しいほうにあるので、詳しいほうで開く(渡すのを配信カードへ移すのは、詳しいほうを消す段)
  const [productionSimple, setProductionSimple] = useState(() => loadPref<boolean>(PREF.productionSimple, true))
  const switchProductionView = (simple: boolean) => {
    savePref(PREF.productionSimple, simple)
    setProductionSimple(simple)
  }
  // 配信カードの、同じ窓で制作の画面に移る前の確かめ(CardDetail が入れる)
  const cardLeaveRef = useRef<(() => Promise<boolean>) | null>(null)
  const goStage = async (id: string, f: Face) => {
    // ほかの道から開いたときは、そのまま依頼しない(「制作に渡す」だけが、下でもう一度立てる)
    setProductionAuto(false)
    // シンプルな制作の画面とは、同じ窓のまま中身だけを入れ替える(2026-10-29 利用者: 上にもう 1 つ開かず、× で全部閉じる)。
    // 窓の出てくる動きは付けない(きょうだいの切り替えと同じ instant。チカつかないように)
    if (f === 'calendar' && productionSimple && productionOpen === id && selectedId !== id) {
      setPeekResult(null)
      setProductionOpen(null)
      openNext(id)
      return
    }
    if (f === 'production' && productionSimple && selectedId === id) {
      if (!(await (cardLeaveRef.current?.() ?? Promise.resolve(true)))) return
      setPeekResult(null)
      setSelectedId(null)
      setInstantId(id)
      setProductionOpen(id)
      return
    }
    if (f === 'calendar') {
      setPeekResult(null)
      // 配信カードが制作のページの下にあれば、制作のページを閉じて見せる。なければ、上に重ねて開く(閉じると制作のページに戻る)
      if (selectedId === id) setProductionOpen(null)
      else setSelectedId(id)
    } else if (f === 'production') {
      setPeekResult(null)
      // 制作のページが配信カードの下にあれば、開き直して上に出す
      if (productionOpen === id) setProductionKey((k) => k + 1)
      else setProductionOpen(id)
    } else {
      setProductionOpen(null)
      setPeekResult(id)
    }
  }
  const stageNav = (c: DeliveryCard, f: Face, variant?: 'chips' | 'tabs') => <StageNav face={f} card={c} production={production.latest.get(c.id)} onGo={(to) => void goStage(c.id, to)} variant={variant} />
  // 制作の面では、配信を押すと制作のページを開く(計画の面は配信カード)
  const openCard = (id: string) => (onProduction ? setProductionOpen(id) : setSelectedId(id))
  // 週・月・一覧の配信の右クリック: 開く・複製…・制作のページ・結果。押したときと、配信カードの「…」・段階の帯と同じ処理を呼ぶ
  const cardMenu = useContextMenu()
  // 開発へのリクエストの一覧(⚙ と、ヘッダーのリンクから)
  const [devRequestsOpen, setDevRequestsOpen] = useState(false)
  // ヘッダーを隠すフロート(配信カード・制作のページ・結果・アラート)の「⋯」から開く(X69)
  useEffect(() => onOpenDevRequestList(() => setDevRequestsOpen(true)), [])
  const [dupCard, setDupCard] = useState<DeliveryCard | null>(null)
  const cardMenuRef = useRef<(e: MouseEvent) => void>(() => undefined)
  useEffect(() => {
    cardMenuRef.current = (e: MouseEvent) => {
      // ほかの右クリック(プレビューのピンなど)が受けたもの・ブラウザのメニューの逃げ道は、そのまま
      if (e.defaultPrevented || keepBrowserMenu(e)) return
      const id = (e.target as Element | null)?.closest?.('[data-card-id]')?.getAttribute('data-card-id')
      const c = id ? cards.find((x) => x.id === id) : undefined
      if (!c) return
      e.preventDefault()
      cardMenu.openAt(e.clientX, e.clientY, [
        { key: 'open', label: tr('開く', 'Open'), icon: <CtxOpenRegular />, onSelect: () => openCard(c.id) },
        { key: 'duplicate', label: tr('複製…', 'Duplicate…'), icon: <CtxCopyRegular />, onSelect: () => setDupCard(c) },
        { key: 'production', label: tr('制作のページを開く', 'Open the production page'), icon: <CtxProductionRegular />, divider: true, onSelect: () => void goStage(c.id, 'production') },
        { key: 'results', label: tr('結果を見る', 'See results'), icon: <CtxResultsRegular />, onSelect: () => void goStage(c.id, 'results') },
      ])
    }
  })
  useEffect(() => {
    const on = (e: MouseEvent) => cardMenuRef.current(e)
    document.addEventListener('contextmenu', on)
    return () => document.removeEventListener('contextmenu', on)
  }, [])
  const productionTone = (c: DeliveryCard) => {
    const color = productionColor(productionView(c, production.latest.get(c.id)))
    return { line: color, background: `color-mix(in srgb, ${color} 14%, var(--colorNeutralBackground1))` }
  }
  // 制作の面の箱の 2 行目: 状態と締め切り(締め切りを過ぎた・近いものに印)
  const productionMeta = (c: DeliveryCard) => {
    const req = production.latest.get(c.id)
    const v = productionView(c, req)
    const due = (req?.production_due ?? c.production_due ?? '').slice(0, 10)
    // 今日と配信日は、この画面の時刻で(toISOString は UTC なので、日本の朝 9 時前は前の日になっていた)
    const today = localDate(new Date().toISOString())
    // 締め切りを過ぎた印は、まだ配信していない(配信日が今日以降の)ものだけ(過去の配信に全部付くと、見分けがつかないため)
    const upcoming = localDate(c.scheduled_at) >= today
    const late = upcoming && !!due && due < today && (v === 'draft' || v === 'requested' || v === 'in_progress')
    return `${productionLabel(v)}${due ? ` ・ ${t('締切', 'Due')} ${due.slice(5).replace('-', '/')}${late ? t('(過ぎた)', ' (late)') : ''}` : ''}`
  }
  // 週・一覧の、制作の面での状態の色と名前(名前は、状態と締め切り)
  const productionState = (c: DeliveryCard) => ({ color: productionColor(productionView(c, production.latest.get(c.id))), label: productionMeta(c) })
  // 配信に入っている担当(企画・制作)の名前。担当の絞り込みと、配信カードの担当の候補に使う
  const owners = useMemo(
    () => [...new Set([...cards.flatMap((c) => [c.owner?.trim(), c.production_owner?.trim()]), ...[...noteParties.values()].flatMap((x) => [...x])].filter((o): o is string => !!o))].sort(),
    [cards, noteParties],
  )
  // アラートの条件(人ごと。A6)
  const alertSettings = useAlertSettings()
  // 週の上限の決まり(読み込み直したら、上限を使う計算を作り直すため)
  const limitRules = useSyncExternalStore(onLimitRulesChange, limitRulesVersion)
  // 国の基準(ST2)。読み直したら、アラート・週の上限を作り直す
  const countryVersion = useCountrySettings()
  // 国で使う決まり(ST8)を変えたら、週の上限を使う計算を作り直す
  const applyVersion = useCountryApply()
  const lowWeeksOf = useCallback((c: DeliveryCard) => criteriaFor(c.country).lowWeeks, [countryVersion]) // eslint-disable-line react-hooks/exhaustive-deps
  const alertState = useStockAlerts(activeCards, products, productRows, resultsKey, lowWeeksOf)
  const alerts = filterStockAlerts(alertSettings, alertState.alerts)
  // 変更のアラート(MD 方針の変更・日程の変更)。件数は、在庫のアラートと合わせて、ヘッダーに出す
  const changeState = useChangeAlerts(activeCards, products, alertState.placements, changeKey)
  // 配信のない変更の知らせ(主力になった など)は、商品の市場で国に合わせる
  const changeAlerts = filterChangeAlerts(alertSettings, changeState.changeAlerts).filter(
    (a) => !filters.country || a.card || a.deliveries.length > 0 || !a.product?.market || a.product.market === filters.country,
  )
  const alertCount = alerts.length + changeAlerts.length
  // 配信ごとのアラート(配信カードの帯・カレンダーの印)
  // 配信ごとのアラート: 在庫・方針・日程に、週の上限を超えた商品を足す(直す場所を配信カードにそろえるため)
  const cardAlerts = useMemo(
    () =>
      mergeCardAlerts(
        mergeCardAlerts(buildCardAlerts(alerts, changeAlerts), overLimitAlerts(activeCards, cardProductsAll, (id) => products.find((p) => p.id === id)?.name ?? '')),
        imageExpiryAlerts(activeCards, cardProductsAll, cardImages, products, expiringImages),
      ),
    // 週の上限(アラートの条件・決まり)が変わったら、作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [alerts, changeAlerts, activeCards, cardProductsAll, cardImages, expiringImages, products, countryVersion, limitRules, applyVersion],
  )
  const weekUseAll = useMemo(() => weeklyUse(activeCards, cardProductsAll), [activeCards, cardProductsAll])
  const alertKinds = useMemo(() => new Map([...cardAlerts].map(([id, list]) => [id, topKind(list)]).filter((e): e is [string, CardAlertKind] => !!e[1])), [cardAlerts])
  // アラートの画面から開いたときに、配信カードで選んでおく商品
  const [focusProduct, setFocusProduct] = useState<string | undefined>(undefined)
  const openFromAlert = (cardId: string, productId?: string) => {
    setFocusProduct(productId)
    setSelectedId(cardId)
  }
  // アラートは、面ではなく、上に重ねて開くフロート(閉じれば、見ていた画面に戻る)
  const [alertsOpen, setAlertsOpen] = useState(link.alerts !== undefined)
  // アラートのフロートを開いたときに選んでおく商品(配信カードの「アラートの画面で詳しく」から)
  const [alertsFocus, setAlertsFocus] = useState<string | undefined>(link.alerts || undefined)
  // この週の承認の履歴(「この画面 ▾」から開く)
  const [historyOpen, setHistoryOpen] = useState(false)
  // 見せ方「効果」を読み直すための印(⚙ で見本を作り直したとき)
  const [impactKey, setImpactKey] = useState(0)
  const showFace = (p: 'calendar' | 'production' | 'results' | 'alerts') => {
    setResultDetail(null)
    // 「比べる」「効果」「学び」は結果の面だけ。ほかの面に移るときは、月にする
    if (p !== 'results' && RESULTS_ONLY.includes(view)) setView('month')
    setPage(p)
  }
  // 機能の公開・非公開(X87): 非公開の面(制作・結果)を開こうとしたら(リンク・「戻る」・開いたあとに非公開にした)、計画の面で開く
  const productionFaceOn = useFeature('face.production')
  const resultsFaceOn = useFeature('face.results')
  useEffect(() => {
    // 公開の設定は、描いたあとに読み込まれて分かるので、描いてから移す
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if ((page === 'production' && !productionFaceOn) || (page === 'results' && !resultsFaceOn)) showFace('calendar')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 面と公開の設定が変わったときだけ
  }, [page, productionFaceOn, resultsFaceOn])
  const [lens, setLens] = useState<WeekLens>(() => loadPref<WeekLens>(LENS_KEY, 'products'))
  // 最初は計画の面なので、「比べる」を覚えていても、月で始める
  const [view, setView] = useState<View>(() => {
    // リンクの見せ方を優先する(「比べる」「効果」は結果の面だけ)
    if (link.view && (!RESULTS_ONLY.includes(link.view) || link.page === 'results')) return link.view
    const v = loadPref<View>(VIEW_KEY, 'month')
    return RESULTS_ONLY.includes(v) ? 'month' : v
  })
  const [columns, setColumns] = useState<ColumnKey[]>(() => loadPref<ColumnKey[]>(COLUMNS_KEY, DEFAULT_COLUMNS))


  const filtered = useMemo(() => {
    const match = (f: string, v?: string) => f === '' || String(v) === f
    return scopedCards.filter(
      (c) =>
        match(filters.channel, c.channel) &&
        // 種類(テーマの種類。決まっていない配信は、言葉から推し量った種類で見る。X41)
        (filters.department === '' || themeTypeOf(c).type === filters.department) &&
        (page === 'results' || match(filters.status, statusView(c.status))) &&
        (filters.person === '' || (!!personName && (c.owner?.trim() === personName || c.production_owner?.trim() === personName || !!noteParties.get(c.id)?.has(personName)))),
    )
  }, [scopedCards, filters, noteParties, page, personName])

  // 表示中の月の配信(一覧と CSV の対象)。締め切りの警告は、月をまたいで求める(カレンダーの前後の月の日付にも出す)
  const rows = useMemo(() => toRows(filtered, productCounts, questionCounts, taskCounts), [filtered, productCounts, questionCounts, taskCounts])
  const monthRows = useMemo(
    () =>
      rows.filter((r) => {
        if (!month || !r.card.scheduled_at) return false
        const d = new Date(r.card.scheduled_at)
        return d.getFullYear() === month.getFullYear() && d.getMonth() === month.getMonth()
      }),
    [rows, month],
  )
  const dueSoon = useMemo(() => new Set(rows.filter((r) => r.dueSoon && !isCancelled(r.card)).map((r) => r.card.id)), [rows])
  // 週の表示の対象(週の初めから 7 日間)
  const weekRows = useMemo(() => {
    const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
    return rows.filter((r) => {
      if (!r.card.scheduled_at) return false
      const d = new Date(r.card.scheduled_at)
      return d >= weekStart && d < end
    })
  }, [rows, weekStart])
  // 週の状態は、週・国・チャネルごと(ST3・W8。メールとアプリを、別の人・別のときに確定できるように)。
  // 画面の国とチャネルが決まっているときだけ、その組の行を進める。決まっていなければ、組ごとの状態を並べて選んでもらう
  const weekKey = ymd(weekStart)
  const weekEvents = useMemo(() => events.filter((e) => e.week_start?.slice(0, 10) === weekKey), [events, weekKey])
  const weekScope = useMemo(() => ({ country: filters.country, channel: filters.channel }), [filters.country, filters.channel])
  const weekScoped = !!(filters.country && filters.channel)
  const thisWeek = weekScoped ? weekRowOf(weeks, weekKey, weekScope) : undefined
  // この週の、その国・チャネルのすべての配信(ほかの絞り込み(担当・ステータスなど)に関係なく、週の単位で進める)
  const inScope = useCallback(
    (c: DeliveryCard) => {
      const sc = scopeOfCard(c)
      return (!filters.country || sc.country === filters.country) && (!filters.channel || sc.channel === filters.channel)
    },
    [filters.country, filters.channel],
  )
  const weekCards = useMemo(() => {
    const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
    return activeCards.filter((c) => c.scheduled_at && new Date(c.scheduled_at) >= weekStart && new Date(c.scheduled_at) < end && inScope(c))
  }, [activeCards, weekStart, inScope])
  const weekSegments = useMemo(() => segmentsOf(weekCards, weekScope), [weekCards, weekScope])
  // まとめて作る作業画面(W14 の作り直し)。中身のない枠は保存せず、中身ができた配信から下書きとして保存する
  const bulk = useBulkWorkspace({
    cards: activeCards,
    cardProducts,
    products,
    heroes,
    weeks,
    patterns,
    defaults: { country: filters.country, channel: filters.channel },
    campaigns,
    onChanged: reloadCards,
  })
  // 以前の「週の枠」(W14 の最初の作り。中身のない配信カードを保存していた)が残っていれば、その配信。
  // 作り方は作業画面(useBulkWorkspace)だけにした(2026-10-24 の整理。比べるために残していた方を消した)が、
  // 保存済みの枠は、承認のまとめて依頼から外し、時刻の表示で枠として見分けるために、見分け方だけ残す
  const frameIds = useMemo(() => new Set(weekCards.filter((c) => isFrame(c, (cardProducts.get(c.id) ?? []).length)).map((c) => c.id)), [weekCards, cardProducts])
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
        cardLabel: (c) => `${c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString(locale(), { weekday: 'short' }) : ''} ${c.name}`.trim(),
      }),
    // 言語を変えたら、説明(曜日・種類)を作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekStart, weekCards, cards, cardProducts, products, policies, questionCounts, commentCounts, lang, countryVersion, limitRules, applyVersion],
  )
  const checkKey = check?.week === weekKey ? check.key : null
  const focusItem = checklist.find((i) => i.key === checkKey)
  const focus = useMemo(() => (focusItem ? { cards: new Set(focusItem.cardIds), products: new Set(focusItem.productIds) } : undefined), [focusItem])
  // 週の資料を描いたら、印刷の画面を開く(閉じたら、資料を片付ける)
  useEffect(() => {
    if (!printingWeek) return
    printWeek(`week-plan_${weekKey}`, () => setPrintingWeek(false))
  }, [printingWeek, weekKey])
  // 前週の行(計画の面に、前週の振り返りを出す)
  const prevWeek = useMemo(() => {
    const k = ymd(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7))
    return weekRowOf(weeks, k, weekScope)
  }, [weeks, weekStart, weekScope])
  // 週の振り返りのメモを保存する(その国・チャネルの行がなければ作る)
  const saveRetro = async (key: string, row: WeekRow | undefined, text: string): Promise<boolean> => {
    setError(null)
    const res = await saveWeekRow(row, key, weekScope, { retro: text })
    if (!res.success || !res.data) {
      setError(res.error?.message ?? t('振り返りを保存できませんでした', 'Could not save the retrospective'))
      return false
    }
    const saved = res.data
    setWeeks((prev) => (prev.some((w) => w.id === saved.id) ? prev.map((w) => (w.id === saved.id ? { ...w, ...saved } : w)) : [...prev, saved]))
    return true
  }
  const changeWeek = async (next: WeekStatus) => {
    setError(null)
    try {
      // 配信のステータスを、週の操作に合わせて進める(戻す)
      const target = (c: DeliveryCard): DeliveryCard['status'] => {
        const s = c.status ?? 'not_started'
        if (next === 'review' && thisWeek?.status !== 'confirmed') return s === 'not_started' ? 'reviewing' : undefined // 未起案 → 検討中
        if (next === 'review' && thisWeek?.status === 'confirmed') return s === 'confirmed' ? 'approved' : undefined // 確定の取り消し: 確定 → 承認済み
        if (next === 'confirmed') return s !== 'confirmed' ? 'confirmed' : undefined // すべて → 確定
        return undefined
      }
      const moved: string[] = []
      for (const c of weekCards) {
        const v = target(c)
        if (v === undefined) continue
        const r = await DeliveryCardsService.update(c.id, { status: v })
        if (!r.success) throw new Error(r.error?.message ?? tr('配信のステータスを変えられませんでした', 'Could not update a delivery status'))
        moved.push(c.name)
      }
      const now = new Date().toISOString()
      const fields = {
        status: next,
        ...(next === 'review' && thisWeek?.status !== 'confirmed' ? { submitted_at: now } : {}),
        ...(next === 'confirmed' ? { confirmed_at: now } : {}),
      }
      const res = await saveWeekRow(thisWeek, weekKey, weekScope, fields)
      if (!res.success) throw new Error(res.error?.message ?? tr('週の状態を保存できませんでした', 'Could not save the week status'))
      // 承認の履歴(W6)。まとめて状態を変えた配信は、1 本ずつではなく、週の出来事 1 つに名前を並べて残す(履歴が埋もれないように)
      const wasConfirmed = thisWeek?.status === 'confirmed'
      await logEvent({
        action: next === 'confirmed' ? 'confirm' : next === 'draft' ? 'draft' : wasConfirmed ? 'unconfirm' : 'submit',
        weekStart: weekKey,
        // まとめて変えた配信の、変える前と後のステータス(確定は、元がまちまちなので、後だけ)
        ...(moved.length
          ? next === 'confirmed'
            ? { to: 'confirmed' as const }
            : wasConfirmed
              ? { from: 'confirmed' as const, to: 'approved' as const }
              : next === 'review'
                ? { from: 'not_started' as const, to: 'reviewing' as const }
                : {}
          : {}),
        // どの国・チャネルの週か(週の履歴は週ごとに並ぶので、組の名前を頭に付ける)
        note: [`[${scopeLabel(weekScope)}]`, moved.join(' / ')].filter(Boolean).join(' '),
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    await loadParts(['cards', 'weeks', 'events'])
  }
  // 週の承認(U6): 未依頼の配信をまとめて依頼する / 自分宛ての依頼をまとめて承認する(配信カードと同じ窓口 /api/approvals を、順に呼ぶ)
  const actor = () => ({ id: myUserId(), name: myName() })
  // まとめて依頼の対象。中身のない週の枠(W14)は、承認するものがないので外す(中身を作ってから依頼する)
  const requestable = needsRequest(weekCards.filter((c) => !frameIds.has(c.id)), inbox.hasOpen)
  const requestWeek = async () => {
    setError(null)
    try {
      const { skipped } = await requestAll(requestable, people, actor(), weekKey)
      if (skipped.length) setError(tr(`既定の承認者がない種別の配信は飛ばしました(配信カードから依頼してください): ${skipped.join(' / ')}`, `Skipped deliveries whose type has no default approvers (request from the card): ${skipped.join(' / ')}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    await loadParts(['cards', 'events'])
  }
  const approveMineWeek = async () => {
    setError(null)
    try {
      await approveMine(inbox.mineFor(weekCards.map((c) => c.id)), actor(), weekKey)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    await loadParts(['cards', 'events'])
  }
  // 週の見方(商品 / 進み具合)は、計画の面の、週の表示だけで使う
  const lensOn = page === 'calendar' && view === 'week'
  // 機能の公開・非公開(X87)。見せ方・週の見方・計画の面の操作
  const viewFeature: Record<View, string> = { month: 'plan.month', week: 'plan.week', list: 'plan.list', products: 'plan.byproduct', compare: 'results.compare', impact: 'results.effect', learnings: 'results.learnings' }
  useFeatureVersion()
  const viewOn = (v: View) => isOn(viewFeature[v])
  const lensFeature: Record<WeekLens, string> = { products: 'plan.week.products', progress: 'plan.week.progress', time: 'plan.week.time', compare: 'plan.week.compare' }
  const quickNew = isOn('plan.quicknew') ? (day: string) => setCreating(newCardDefaults(`${day}T10:00`)) : undefined
  const swipeOn = isOn('plan.swipe')
  // 非公開の見せ方・見方を選んでいたら(覚えていた・リンク・あとから非公開にした)、出ている最初のものにする
  const fallbackView = viewOn(view) ? null : ((['month', 'week', 'list'] as View[]).find(viewOn) ?? null)
  const fallbackLens = isOn(lensFeature[lens]) ? null : ((['progress', 'products', 'time', 'compare'] as WeekLens[]).find((l) => isOn(lensFeature[l])) ?? null)
  useEffect(() => {
    // 公開の設定は、描いたあとに読み込まれて分かるので、描いてから移す
    if (fallbackView) setView(fallbackView)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (fallbackLens) setLens(fallbackLens)
  }, [fallbackView, fallbackLens])
  const screenMenuHasItems =
    (page === 'calendar' && (isOn('ai.weekslots') || isOn('plan.export.csv') || (view === 'week' && (isOn('plan.export.pdf') || isOn('approval.history'))) || view === 'list')) ||
    (page === 'results' && !!resultsData)
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
    // 書き出す列: 一覧では、表示中の列。カレンダーでは、すべての列
    if (view === 'week') {
      downloadCsv(weekRows, DEFAULT_COLUMNS, `deliveries-week-${ymd(weekStart)}.csv`)
      return
    }
    downloadCsv(monthRows, view === 'list' ? columns : DEFAULT_COLUMNS, `deliveries-${ym(month)}.csv`)
  }

  const selected = cards.find((c) => c.id === selectedId)
  // 「保存して次へ」で開く配信(FLOWS.md の C-1)。週の表示で確認の項目を選んでいて、開いた配信がその項目に入っていれば、その項目の配信の中で次へ。
  // それ以外は、同じ週(日曜から)の配信の中で次へ。どちらも、絞り込みを反映し、取りやめは除き、配信日時の順
  const nextOf = (() => {
    if (!selected?.scheduled_at) return undefined
    const inCheck = page === 'calendar' && view === 'week' && !!focus?.cards.has(selected.id)
    const week = sundayOf(new Date(selected.scheduled_at)).getTime()
    const pool = filtered
      .filter((c) => !isCancelled(c) && c.scheduled_at && (inCheck ? focus!.cards.has(c.id) : sundayOf(new Date(c.scheduled_at)).getTime() === week))
      .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!) || a.name.localeCompare(b.name))
    const i = pool.findIndex((c) => c.id === selected.id)
    // 開いた配信が、いまの絞り込みに入っていない(アラートの画面から開いた など)ときは、次を決められないので、ボタンを出さない
    if (i < 0) return undefined
    const n = pool[i + 1]
    const where = inCheck ? tr(`確認の項目の ${i + 2} / ${pool.length}`, `${i + 2} of ${pool.length} in the check item`) : tr(`この週の ${i + 2} / ${pool.length}`, `${i + 2} of ${pool.length} this week`)
    return n ? { id: n.id, name: n.name, position: where } : null
  })()
  const shift = (n: number) => {
    // 見せ方「商品」: 期間を、その長さぶん前後に動かす
    if (view === 'products') {
      const f = new Date(`${range.from}T00:00:00`)
      const tt = new Date(`${range.to}T00:00:00`)
      const days = Math.round((tt.getTime() - f.getTime()) / 86400000) + 1
      setRange({ from: dateText(new Date(f.getFullYear(), f.getMonth(), f.getDate() + days * n)), to: dateText(new Date(tt.getFullYear(), tt.getMonth(), tt.getDate() + days * n)) })
      return
    }
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
  /** ミニカレンダーで選んだ所へ移る(W11)。週は、その日を含む週。月の表示も、その週の真ん中の月に合わせる(shift と同じ) */
  // ---- 画面の状態を URL に持たせる(X36)。状態が変わったら URL を書き換え、ブラウザの「戻る」「進む」で状態を戻す
  const linkState: LinkState = {
    page,
    view,
    date: view === 'week' ? dateText(weekStart) : month ? dateText(month) : undefined,
    country: filters.country,
    from: range.from,
    to: range.to,
    card: selectedId ?? undefined,
    result: page === 'results' ? (resultDetail ?? undefined) : undefined,
    production: productionOpen ?? undefined,
    alerts: alertsOpen ? (alertsFocus ?? '') : undefined,
  }
  // 「戻る」「進む」で、URL の状態に戻す
  useUrlSync(linkState, (l) => {
    setPage(l.page ?? 'calendar')
    if (l.view) setView(l.view)
    const d = dateOf(l.date)
    if (d) {
      const mid = l.view === 'week' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3) : d
      setWeekStart(sundayOf(d))
      setMonth(new Date(mid.getFullYear(), mid.getMonth(), 1))
    }
    if (l.country !== undefined) setFilters((f) => ({ ...f, country: l.country! }))
    if (l.from && l.to) setRange({ from: l.from, to: l.to })
    setSelectedId(l.card ?? null)
    setCreating(null)
    setDraftOpen(null)
    setResultDetail(l.result ?? null)
    setProductionOpen(l.production ?? null)
    setAlertsOpen(l.alerts !== undefined)
    setAlertsFocus(l.alerts || undefined)
  })
  // リンクの配信が見つからない(消した・国が違うなど、ほかの環境のリンク)ときは、知らせて、ふつうの画面で始める
  const [linkChecked, setLinkChecked] = useState(false)
  if (!linkChecked && !loading && cards.length > 0) {
    setLinkChecked(true)
    const missing = [link.card, link.result, link.production].filter((id): id is string => !!id && !cards.some((c) => c.id === id))
    if (missing.length > 0) {
      if (link.card && missing.includes(link.card)) setSelectedId(null)
      if (link.result && missing.includes(link.result)) setResultDetail(null)
      if (link.production && missing.includes(link.production)) setProductionOpen(null)
      setBqNotice({ intent: 'warning', text: tr('リンクの配信が見つかりません(消された、または別の環境のリンクです)。いつもの画面で開きました', 'The delivery in the link was not found (deleted, or a link from another environment). Opened the usual view.') })
    }
  }
  // ---- 週の「時刻」の見方で、配信をつかんで動かす(X46)
  // 承認済み・確定した週の配信は、理由の記録と承認のやり直しが要るので、ここでは動かさず、配信カードで変えてもらう
  const moveBlockedReason = (c: DeliveryCard, to?: string): string | null => {
    if (statusRank(c.status) >= statusRank('approved')) return tr('承認済みの配信は、配信カードを開いて時刻を変えてください(承認のやり直しが要るため)', 'Approved deliveries: change the time in the delivery card (re-approval is needed)')
    if (confirmedWeekOf(weeks, c.scheduled_at, scopeOfCard(c)) || (to && confirmedWeekOf(weeks, to, scopeOfCard(c)))) return tr('確定した週の配信は、配信カードを開いて時刻を変えてください(理由の記録が要るため)', 'Deliveries in a confirmed week: change the time in the delivery card (a reason is needed)')
    return null
  }
  const [moveNotice, setMoveNotice] = useState<{ text: string; undo?: () => void } | null>(null)
  const moveCard = async (c: DeliveryCard, iso: string) => {
    const blocked = moveBlockedReason(c, iso)
    if (blocked) {
      setMoveNotice({ text: blocked })
      return
    }
    const before = c.scheduled_at
    const res = await DeliveryCardsService.update(c.id, { scheduled_at: iso })
    if (!res.success) {
      setMoveNotice({ text: res.error?.message ?? tr('配信日時を変えられませんでした', 'Could not change the send time') })
      return
    }
    await loadParts(['cards'])
    const fmt = (v?: string) => (v ? new Date(v).toLocaleString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '')
    setMoveNotice({
      text: tr(`「${c.name}」を ${fmt(before)} → ${fmt(iso)} に動かしました`, `Moved "${c.name}" from ${fmt(before)} to ${fmt(iso)}`),
      undo: async () => {
        setMoveNotice(null)
        await DeliveryCardsService.update(c.id, { scheduled_at: before })
        await loadParts(['cards'])
      },
    })
  }
  const goTo = (v: 'month' | 'week' | 'list', d: Date) => {
    const sun = sundayOf(d)
    const mid = v === 'week' ? new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 3) : d
    setWeekStart(sun)
    setMonth(new Date(mid.getFullYear(), mid.getMonth(), 1))
    if (v !== view) {
      setView(v)
      savePref(VIEW_KEY, v)
    }
  }
  // 週の枠を作る(W14)のは、計画の面の週の表示で、確定していない週だけ
  const canBulk = page === 'calendar' && view === 'week' && thisWeek?.status !== 'confirmed'
  const canBulkReason =
    page !== 'calendar' || view !== 'week'
      ? t('週の表示で使えます', 'In the week view')
      : thisWeek?.status === 'confirmed'
        ? t('確定した週には作れません', 'Week is confirmed')
        : ''
  // 月・一覧の表示から、週の枠を作り始める週(X24。W14 の枠の形に読み替え): 表示中の月にかかる週のうち、まだ終わっていない・確定していない週で、配信がいちばん少ない週(同じなら早い週)
  const monthBulkWeek = useMemo(() => {
    if (!month) return undefined
    const today = new Date()
    const todayKey = dayKeyOf(today)
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
    let best: { sun: Date; n: number } | undefined
    for (let sun = sundayOf(month); sun <= last; sun = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 7)) {
      const sat = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 6)
      if (dayKeyOf(sat) < todayKey) continue
      const end = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 1)
      const inWeek = activeCards.filter((c) => c.scheduled_at && new Date(c.scheduled_at) >= sun && new Date(c.scheduled_at) < end && inScope(c))
      if (weekConfirmedIn(weeks, dayKeyOf(sun), segmentsOf(inWeek, weekScope))) continue
      const n = inWeek.length
      if (!best || n < best.n) best = { sun, n }
    }
    return best?.sun
  }, [month, weeks, activeCards, inScope, weekScope])
  // 月の要約の帯(X25): 表示中の月の配信(国・チャネル以外の絞り込みを反映しない。週の帯と同じ)の状態ごとの件数と、月にかかる週のうち確定した週の数
  // (週は、見ている国・チャネルの組すべてで確定していれば、確定と数える)
  const monthSummary = useMemo(() => {
    if (!month) return undefined
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    const scoped = activeCards.filter((c) => c.scheduled_at && inScope(c))
    const inMonth = scoped.filter((c) => new Date(c.scheduled_at!) >= first && new Date(c.scheduled_at!) < next)
    const sundays: Date[] = []
    for (let sun = sundayOf(first); sun < next; sun = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 7)) sundays.push(sun)
    const isConfirmed = (sun: Date) => {
      const end = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 7)
      return weekConfirmedIn(weeks, dayKeyOf(sun), segmentsOf(scoped.filter((c) => new Date(c.scheduled_at!) >= sun && new Date(c.scheduled_at!) < end), weekScope))
    }
    return { cards: inMonth, sundays, confirmed: sundays.filter(isConfirmed).length, firstOpen: sundays.find((d) => !isConfirmed(d)) }
  }, [month, activeCards, weeks, inScope, weekScope])
  const monthBar = monthSummary && isOn('plan.month.summary') && (
    <MonthSummaryBar
      counts={statusOptions.map((o) => ({ label: optionLabel(o.label), color: statusColor(o.value), n: monthSummary.cards.filter((c) => statusView(c.status) === o.value).length }))}
      total={monthSummary.cards.length}
      weeks={monthSummary.sundays.length}
      confirmedWeeks={monthSummary.confirmed}
      onOpenUnconfirmed={monthSummary.firstOpen ? () => goTo('week', monthSummary.firstOpen!) : undefined}
    />
  )
  // 日ごとの配信の数(ミニカレンダーの印。絞り込みを反映し、取りやめは数えない)
  const dayCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of filtered) {
      if (!c.scheduled_at || isCancelled(c)) continue
      const k = dayKeyOf(new Date(c.scheduled_at))
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [filtered])
  const [autoDraft, setAutoDraft] = useState(loadAutoDraft)
  useTemplates() // テンプレートの登録が変わったら、画面全体を描き直す
  // ユーザーが作ったテンプレートを読み込む(読めなくても、標準のテンプレートで動く)
  useEffect(() => {
    loadCustomTemplates().catch(() => markTemplatesLoadFailed())
  }, [])
  // 担当の候補: いちばん上に「自分」(ログインしている人。Jira の Me と同じ)
  const personOptions = [{ value: ME_PERSON, label: me ? t(`自分(${me})`, `Me (${me})`) : t('自分', 'Me') }, ...owners.map((o) => ({ value: o, label: o }))]
  // ⚙(設定の画面)に並べる操作
  const settings = useSettingsActions({
    cards, activeCards, products, heroes, country: filters.country, bq, bqBusy, runBqSync, loadProducts, loadPatterns, loadMarketingPolicies, load, loadParts, reloadHeroes,
    notify: setBqNotice,
    onImpactChanged: () => setImpactKey((k) => k + 1),
    onOpenCard: setSelectedId,
  })
  // 窓(テンプレートの管理・人と承認・まとめて作る)は、開くまで描かない(閉じていても、App を描くたびに中身を計算していたため)
  const templatesOpened = useOpenedOnce(useTemplateManagerOpen())
  const peopleOpened = useOpenedOnce(usePeopleManagerOpen())
  const bulkOpened = useOpenedOnce(bulk.open)
  const settingsOpened = useOpenedOnce(settingsOpen)
  // 新規作成の初期値: 絞り込み中の国・チャネル・種別を引き継ぐ(その条件の配信を作ることが多いため)
  // 国は、ヘッダーの国。「すべての国」のときは、その人が新規作成・一括作成で最後に選んだ国(2026-10-27 利用者)
  const newCardDefaults = (scheduledAt?: string): NewCardDefaults => ({
    ...(scheduledAt ? { scheduledAt } : {}),
    ...((filters.country || loadLastNewCountry()) ? { country: filters.country || loadLastNewCountry() } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.department ? { themeType: filters.department } : {}),
  })

  return (
    <>
      {settings.fileInput}
      {templatesOpened && <Later><TemplateManager cards={cards} products={products} country={filters.country || undefined} onChanged={load} onOpenCard={setSelectedId} /></Later>}
      {peopleOpened && <Later><PeopleManager /></Later>}
      {/* 初めて開いたとき、だれでログインするかを選んでもらう(U9) */}
      <SignInDialog />
      {/* 確かめの窓(confirmDialog。window.confirm の代わり) */}
      <ConfirmHost />
      <AppToolbar
        filters={filters}
        onFilters={setFilters}
        onCountry={setCountry}
        page={page}
        onFace={showFace}
        personOptions={personOptions}
        alertsOpen={alertsOpen}
        alertCount={alertCount}
        alertDanger={alerts.some((a) => a.kind === 'outOfStock')}
        onOpenAlerts={() => setAlertsOpen(true)}
        onOpenDevRequests={() => setDevRequestsOpen(true)}
        inbox={inbox}
        onOpenCard={setSelectedId}
        onNew={() => setCreating(newCardDefaults())}
        onBulk={() => bulk.openFor(weekStart)}
        onOpenSettings={() => setSettingsOpen(true)}
        settingsDialog={
          settingsOpened && <Later><SettingsDialog
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            country={filters.country}
            lang={lang}
            onLang={setLang}
            autoDraft={autoDraft}
            onAutoDraft={(on) => {
              setAutoDraft(on)
              saveAutoDraft(on)
            }}
            actions={settings.actions}
          /></Later>
        }
      />
      <div className={mergeClasses(styles.container, styles.containerWide)}>
        {loading && <div className={styles.center}><Spinner /></div>}
        {error && (
          <MessageBar layout="multiline" intent="error" className={styles.alert}>
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        {policyWarning && (
          <MessageBar layout="multiline" intent="warning" className={styles.alert}>
            <MessageBarBody>{policyWarning}</MessageBarBody>
            <MessageBarActions
              containerAction={<Button appearance="transparent" size="small" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => setPolicyWarning(null)} />}
            />
          </MessageBar>
        )}
        {moveNotice && (
          <MessageBar layout="multiline" intent="info" className={styles.alert}>
            <MessageBarBody>{moveNotice.text}</MessageBarBody>
            <MessageBarActions
              containerAction={<Button appearance="transparent" size="small" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => setMoveNotice(null)} />}
            >
              {moveNotice.undo && (
                <Button size="small" onClick={() => void moveNotice.undo?.()}>
                  {t('元に戻す', 'Undo')}
                </Button>
              )}
            </MessageBarActions>
          </MessageBar>
        )}
        {bqNotice && (
          <MessageBar layout="multiline" intent={bqNotice.intent} className={styles.alert}>
            <MessageBarBody>{bqNotice.text}</MessageBarBody>
            <MessageBarActions
              containerAction={<Button appearance="transparent" size="small" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => setBqNotice(null)} />}
            />
          </MessageBar>
        )}
        {/* 画面の一部で失敗しても、ヘッダーと、ほかの画面は使えるように(画面・見せ方を移ると描き直す) */}
        <ErrorBoundary resetKey={`${page}:${view}:${month?.getTime() ?? ''}`}>
        {!loading && !error && month && (
          <>
            {/* アラートの画面は、期間・見せ方を使わないので、ツールバーを出さない */}
            {page !== 'alerts' && (
            <>
            <div className={styles.monthRow}>
              <Button appearance="subtle" size="small" icon={<ChevronLeftRegular />} disabled={RESULTS_ONLY.includes(view)} onClick={() => shift(-1)} aria-label={view === 'week' ? t('前の週', 'Previous week') : t('前の月', 'Previous month')} />
              <span className={mergeClasses(styles.monthLabel, lang === 'ja' ? styles.weekLabelJa : styles.weekLabel, view === 'products' && styles.rangeLabel)}>
                {view === 'compare' ? (
                  t('絞り込んで比べる', 'Filter and compare')
                ) : view === 'impact' ? (
                  t('配信の効果と、学びの効き目', 'Delivery impact and learnings')
                ) : view === 'learnings' ? (
                  t('学びのカード', 'Learning cards')
                ) : view === 'products' ? (
                  // 見せ方「商品」: 期間を自由に(開始〜終了)。近道は「この画面」の右の札
                  <span className={styles.rangeRow}>
                    <input type="date" className={styles.rangeInput} value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} aria-label={t('期間の始まり', 'From')} />
                    <span>〜</span>
                    <input type="date" className={styles.rangeInput} value={range.to} min={range.from} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} aria-label={t('期間の終わり', 'To')} />
                  </span>
                ) : (
                  // 期間の文字を押すと、ミニカレンダーで月・週・日を選んで移れる(W11)
                  <MiniCalendar
                    label={
                      view === 'week'
                        ? weekLabel(weekStart)
                        : lang === 'ja'
                          ? `${month.getFullYear()}年${month.getMonth() + 1}月`
                          : month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })
                    }
                    view={view}
                    month={month}
                    weekStart={weekStart}
                    dayCounts={dayCounts}
                    onPickMonth={(d) => goTo('month', d)}
                    onPickWeek={(d) => goTo('week', d)}
                    onPickDay={(d) => goTo(view === 'week' ? 'week' : view, d)}
                  />
                )}
              </span>
              <Button appearance="subtle" size="small" icon={<ChevronRightRegular />} disabled={RESULTS_ONLY.includes(view)} onClick={() => shift(1)} aria-label={view === 'week' ? t('次の週', 'Next week') : t('次の月', 'Next month')} />
              {/* 結果の面の「先週を振り返る」: 振り返りは先週から始まるので、1 回で先週の週表示へ(FLOWS の C-7)。
                  「前週」だけでは、比べる相手の切り替えにも見えるので、何が起きるかを名前にする */}
              {page === 'results' && isOn('results.review') && (
                <Button
                  size="small"
                  appearance="subtle"
                  icon={<HistoryRegular />}
                  disabled={view === 'compare'}
                  title={t('先週の結果を、週の表示で開きます(この週の振り返りも書けます)', 'Open last week’s results in the week view (you can write the retrospective there)')}
                  onClick={() => {
                    const d = new Date()
                    goTo('week', new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7))
                  }}
                >
                  {t('先週を振り返る', 'Review last week')}
                </Button>
              )}
              {/* 見せ方の切り替え: 枠で囲んだひとかたまりにして、操作のボタンと見分けられるようにする。
                  比べる・効果・学びは結果の面だけ。ほかの面では出さない(押せない灰色で置くと「条件が合えば見られるのか」と迷うため。
                  2026-10-26 利用者の決め。並びの右の端なので、出し入れしても、ほかのボタンの位置は変わらない) */}
              <div className={styles.viewSwitch} role="tablist" aria-label={t('見せ方', 'View')}>
                {(
                  [
                    ['month', t('月', 'Month'), false, undefined],
                    ['week', t('週', 'Week'), false, undefined],
                    ['list', t('一覧', 'List'), false, undefined],
                    ['products', t('商品別', 'By product'), false, t('商品を軸に、期間の中の掲載回数・配信の結果・売上・外部広告を見ます', 'See featuring, results, sales and paid ads by product for a period')],
                    [
                      'compare',
                      t('比べる', 'Compare'),
                      page !== 'results',
                      t('配信カードの項目で絞り込み、直近の配信を並べて比べます', 'Filter by delivery card fields and compare recent deliveries side by side'),
                    ],
                    [
                      'impact',
                      t('効果', 'Impact'),
                      page !== 'results',
                      t('配信で増えた売上(送らなかった人との差)と、AI に渡した学びが効いているかを見ます', 'See incremental sales vs. a holdout, and whether learnings passed to AI work'),
                    ],
                    [
                      'learnings',
                      t('学び', 'Learnings'),
                      page !== 'results',
                      t('結果の「次に生かすメモ」を、学びのカードで並べます。強さ・使われた回数を見て、使う・休ませる・外すを決めます', 'See notes for next time as learning cards. Check strength and use, and decide to use, rest or retire each.'),
                    ],
                  ] as const
                )
                  .filter(([v, , off]) => !off && viewOn(v))
                  .map(([v, label, off, title]) => (
                  <button
                    key={v}
                    ref={v === 'week' ? setWeekBtn : undefined}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    disabled={off}
                    title={title}
                    className={mergeClasses(faceBtn.faceBtn, styles.viewBtn, view === v && faceBtn.faceBtnOn)}
                    onClick={() => changeView(v)}
                  >
                    {label}
                    <FeatureBadge id={viewFeature[v]} />
                  </button>
                ))}
              </div>
              {/* ここから右は、操作(書き出しなど)。切り替えと分けて見えるよう、区切りの線を置く */}
              <span className={styles.toolbarDivider} aria-hidden />
              <span ref={setToolbarSlot} className={styles.toolbarSlot} />
              {/* この画面 ▾: いま見ているものへの操作(書き出し・取り込み・列・週の資料と履歴)。どの面・見せ方でも、右端の同じ位置。システム全体の設定は ⚙ */}
              {screenMenuHasItems && (
              <span className={styles.viewMenu}>
                <Menu
                  checkedValues={{ columns }}
                  onCheckedValueChange={(_, d) => {
                    if (d.name !== 'columns') return
                    const added = d.checkedItems.find((k) => !columns.includes(k as ColumnKey))
                    const removed = columns.find((k) => !d.checkedItems.includes(k))
                    if (added) toggleColumn(added as ColumnKey, true)
                    else if (removed) toggleColumn(removed, false)
                  }}
                >
                  <MenuTrigger disableButtonEnhancement>
                    <MenuButton size="small" appearance="subtle" icon={<TableRegular />}>
                      {t('この画面', 'This view')}
                    </MenuButton>
                  </MenuTrigger>
                  <MenuPopover>
                    <MenuList>
                      {/* 週の配信をまとめて作る(W14)。週は表示中の週、月・一覧は「この月の空いている週から」。開くのは作業画面(「新規作成 ▾」の「まとめて作る」と同じ) */}
                      {page === 'calendar' && view === 'week' && isOn('ai.weekslots') && (
                        <MenuItem icon={<AiIcon size={16} />} disabled={!canBulk} onClick={() => bulk.openFor(weekStart)} secondaryContent={canBulkReason || t('表示中の週', 'This week')}>
                          {t('この週の配信をまとめて作る', 'Create this week\'s deliveries in bulk')}
                        </MenuItem>
                      )}
                      {page === 'calendar' && view !== 'week' && isOn('ai.weekslots') && (
                        <MenuItem
                          icon={<AiIcon size={16} />}
                          disabled={!monthBulkWeek}
                          onClick={() => {
                            if (!monthBulkWeek) return
                            goTo('week', monthBulkWeek)
                            bulk.openFor(monthBulkWeek)
                          }}
                          secondaryContent={
                            monthBulkWeek
                              ? t(`${monthBulkWeek.getMonth() + 1}/${monthBulkWeek.getDate()} の週へ`, `Week of ${monthBulkWeek.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })}`)
                              : t('作れる週がありません', 'No week to plan')
                          }
                        >
                          {t('この月の空いている週から、まとめて作る', 'Create in bulk from an open week in this month')}
                        </MenuItem>
                      )}
                      {page === 'calendar' && isOn('ai.weekslots') && isOn('plan.export.csv') && <MenuDivider />}
                      {page === 'calendar' && isOn('plan.export.csv') && (
                        <MenuItem
                          icon={<ArrowDownloadRegular />}
                          disabled={(view === 'week' ? weekRows : monthRows).length === 0}
                          onClick={exportCsv}
                          secondaryContent={view === 'week' ? t('表示中の週', 'This week') : t('表示中の月', 'This month')}
                        >
                          {t('配信を CSV で書き出す', 'Export deliveries as CSV')}
                        </MenuItem>
                      )}
                      {/* 週の表示のときだけ: いま見ている週の資料(PDF)と、承認の履歴 */}
                      {page === 'calendar' && view === 'week' && (
                        <>
                          {isOn('plan.export.pdf') && (
                            <MenuItem icon={<DocumentPdfRegular />} disabled={weekCards.length === 0} onClick={() => setPrintingWeek(true)} secondaryContent={t('表示中の週', 'This week')}>
                              {t('週の資料を PDF で書き出す', 'Export the week handout (PDF)')}
                            </MenuItem>
                          )}
                          {isOn('approval.history') && (
                            <MenuItem icon={<HistoryRegular />} onClick={() => setHistoryOpen(true)} secondaryContent={t(`${weekEvents.length} 件`, `${weekEvents.length}`)}>
                              {t('この週の承認の履歴', 'Approval history for this week')}
                            </MenuItem>
                          )}
                        </>
                      )}
                      {page === 'results' && resultsData && (
                        <>
                          <MenuItem icon={<ArrowDownloadRegular />} disabled={!resultsData.canExport} onClick={resultsData.exportCsv} secondaryContent={t('表示中の結果', 'Results shown')}>
                            {t('結果を CSV で書き出す', 'Export results as CSV')}
                          </MenuItem>
                          {isOn('results.import') && (
                            <>
                              <MenuItem icon={<ArrowUploadRegular />} onClick={resultsData.importCsv}>
                                {t('結果を取り込む(CSV)', 'Import results (CSV)')}
                              </MenuItem>
                              <MenuItem onClick={resultsData.downloadSample} secondaryContent={resultsData.sampleColumns + t(' 列', ' columns')}>
                                {t('取り込みの見本を書き出す', 'Download a sample CSV')}
                              </MenuItem>
                            </>
                          )}
                          {isOn('results.classify') && <MenuItem icon={<AiIcon size={16} />} disabled={resultsData.classifying || resultsData.untyped === 0} onClick={resultsData.classify} secondaryContent={resultsData.classifying ? t('分けています…', 'Sorting…') : t(`${resultsData.untyped} 件`, `${resultsData.untyped}`)}>
                            {t('AI でテーマの種類を分ける', 'Sort theme types with AI')}
                          </MenuItem>}
                        </>
                      )}
                      {page === 'calendar' && view === 'list' && (
                        <>
                          <MenuDivider />
                          <MenuGroup>
                            <MenuGroupHeader>{t('表示する列', 'Columns')}</MenuGroupHeader>
                            {COLUMNS.map((c) => (
                              <MenuItemCheckbox key={c.key} name="columns" value={c.key} disabled={c.key === 'name'}>
                                {c.label()}
                              </MenuItemCheckbox>
                            ))}
                          </MenuGroup>
                        </>
                      )}
                    </MenuList>
                  </MenuPopover>
                </Menu>
              </span>
              )}
            </div>
            </>
            )}
            {/* 日付から作るときは、その日の 10:00 を配信日時にする(過去の日付でも作れる) */}
            {view === 'learnings' ? (
              // 見せ方「学び」(X78 の手札): すべての学びをカードで。期間・チャネルの絞り込みによらず、学びの側の絞り込みで見る
              <Later spin><LearningHand allCards={cards} country={filters.country} onOpenResult={setPeekResult} /></Later>
            ) : view === 'impact' ? (
              // 見せ方「効果」: 配信の増分と、学びの記録・指標・売上・評価。期間によらず、絞り込みの国・チャネルのすべての配信で見る(件数が少ないと比べられないため)
              <Later spin><ImpactView key={impactKey} cards={filtered} allCards={cards} country={filters.country} onOpenResult={setPeekResult} /></Later>
            ) : view === 'products' ? (
              <>
              {/* 期間の近道(見せ方「商品」) */}
              <div className={styles.rangePresets}>
                {(
                  [
                    [t('直近 4 週', 'Last 4 weeks'), -27, 0],
                    [t('直近 12 週', 'Last 12 weeks'), -83, 0],
                    [t('前後 4 週', '±4 weeks'), -27, 28],
                    [t('これから 4 週', 'Next 4 weeks'), 0, 27],
                  ] as const
                ).map(([name, a, b]) => {
                  const now = new Date()
                  const next = { from: dateText(new Date(now.getFullYear(), now.getMonth(), now.getDate() + a)), to: dateText(new Date(now.getFullYear(), now.getMonth(), now.getDate() + b)) }
                  const on = next.from === range.from && next.to === range.to
                  return (
                    <Button key={name} size="small" appearance={on ? 'primary' : 'subtle'} onClick={() => setRange(next)}>
                      {name}
                    </Button>
                  )
                })}
              </div>
              <Later spin><ProductsView
                cards={filtered.filter((c) => !isCancelled(c))}
                cardProducts={cardProducts}
                products={products}
                from={range.from}
                to={range.to}
                onOpenCard={setSelectedId}
                onOpenResult={(id) => (page === 'results' ? setResultDetail(id) : setPeekResult(id))}
              /></Later>
              </>
            ) : page === 'results' ? (
              // 結果の面も、週・月なら、つかんで前後へ(一覧・比べるは動かさない)
              <SwipePager onPrev={() => shift(-1)} onNext={() => shift(1)} enabled={swipeOn && (view === 'week' || view === 'month')}>
              <Later spin><ResultsPage
                stageNav={(c) => stageNav(c, 'results')}
                country={filters.country}
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
                onOpenWeek={(d) => goTo('week', d)}
                onDataActions={setResultsData}
                retro={(draft) =>
                  // 週の振り返りは、週・国・チャネルの行に書く(ST3)。組が決まっていなければ、書く所を決められない
                  weekScoped ? (
                    <WeekRetro mode="results" text={thisWeek?.retro ?? ''} onSave={(text) => saveRetro(weekKey, thisWeek, text)} onDraft={draft} />
                  ) : (
                    <MessageBar intent="info" layout="multiline">
                      <MessageBarBody>{t('週の振り返りは、国とチャネルごとに書きます。上で国とチャネルを選んでください', 'Weekly retrospectives are per country and channel. Choose both above.')}</MessageBarBody>
                    </MessageBar>
                  )
                }
              /></Later>
              </SwipePager>
            ) : view === 'list' ? (
              <>
              {monthBar}
              <ListView rows={monthRows} columns={columns} onSelect={openCard} cardProducts={cardProducts} products={products} heroes={heroes} stateOf={onProduction ? productionState : undefined} />
              </>
            ) : view === 'week' ? (
              <>
              {/* 週の見方は、週の表示のときだけ、「週」のボタンから生える形で、中身のいちばん上に出す(f9ea1416) */}
              {lensOn && (
                <WeekLensTabs
                  anchor={weekBtn}
                  lens={lens}
                  onChange={(v) => {
                    setLens(v)
                    savePref(LENS_KEY, v)
                  }}
                />
              )}
              {/* 承認のバーと週の振り返りは、計画の面だけ(制作の面では、制作の状態を箱の色で見る) */}
              {!onProduction && !weekScoped && (
                <WeekScopeBar
                  segments={weekSegments.map((sc) => ({ scope: sc, week: weekRowOf(weeks, weekKey, sc), n: weekCards.filter((c) => scopeOfCard(c).country === sc.country && scopeOfCard(c).channel === sc.channel).length }))}
                  onPick={(sc) => {
                    // 国は画面のすべてに効き、次に開いたときも覚える(ヘッダーの国と同じ)
                    setCountry(sc.country ?? '')
                    setFilters((f) => ({ ...f, channel: sc.channel ?? '' }))
                  }}
                />
              )}
              {!onProduction && weekScoped && (
              <WeekReviewBar week={thisWeek} cards={weekCards} changes={changeNotes} onRequestAll={requestWeek} toRequest={requestable.length} onApproveMine={approveMineWeek} mine={inbox.mineFor(weekCards.map((c) => c.id)).length} hasMe={!!inbox.meId} onChange={changeWeek}
                statusCounts={statusOptions.map((o) => ({ label: optionLabel(o.label), color: statusColor(o.value), n: weekCards.filter((c) => statusView(c.status) === o.value).length }))}
                toFix={checklist.filter((i) => !i.ok).length}
                fixChip={<WeekCheckChip items={checklist} selected={checkKey} onSelect={(key) => setCheck(key ? { week: weekKey, key } : null)} />}
                fix={
                  <WeekChecklist
                    items={checklist}
                    selected={checkKey}
                    onSelect={(key) => setCheck(key ? { week: weekKey, key } : null)}
                    // 項目にかかわる配信のうち、配信日時がいちばん早いものを開く(続きは「保存して次へ」で)
                    onOpen={(ids) => {
                      const first = [...weekCards].filter((c) => ids.includes(c.id)).sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))[0]
                      if (first) setSelectedId(first.id)
                    }}
                  />
                }
              />
              )}
              {!onProduction && (
              <WeekRetro
                mode="plan"
                text={prevWeek?.retro ?? ''}
                onOpenResults={() => {
                  setPage('results')
                  goTo('week', new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7))
                }}
              />
              )}
              {printingWeek && (
                // 週の資料(W7)。印刷のあいだだけ見える(index.css の「週の資料の印刷」)。Portal なので、画面の並びには影響しない
                <Portal>
                  <div data-print-week>
                    <WeekReport
                      weekStart={weekStart}
                      week={thisWeek}
                      cards={[...weekCards].sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''))}
                      cardProducts={cardProducts}
                      products={products}
                      heroes={heroes}
                      checklist={checklist}
                      events={weekEvents}
                      openComments={openComments}
                      author={myName()}
                    />
                  </div>
                </Portal>
              )}
              {/* 週の見方「時刻」(X46): 横 = 曜日・縦 = 時刻の格子。計画の面だけ */}
              {/* 地の部分をつかんで横に引くと、前後の週へ(SwipePager) */}
              <SwipePager onPrev={() => shift(-1)} onNext={() => shift(1)} enabled={swipeOn}>
              {/* 週の見方「前週と比べる」(C1): 当週と前週を上下に、縮小のプレビューで並べる。絞り込み済みの配信を渡し、週で分けるのは中で */}
              {lens === 'compare' && !onProduction ? (
                <WeekCompare start={weekStart} cards={filtered} cardProducts={cardProducts} products={products} heroes={heroes} onSelect={openCard} />
              ) : lens === 'time' && !onProduction ? (
                <WeekTimeGrid
                  start={weekStart}
                  cards={weekRows.map((r) => r.card)}
                  alertKinds={alertKinds}
                  fixedReason={moveBlockedReason}
                  onSelect={openCard}
                  onMove={(c, iso) => void moveCard(c, iso)}
                  cardProducts={cardProducts}
                  products={products}
                  heroes={heroes}
                  isFrame={(c) => frameIds.has(c.id)}
                  campaigns={campaigns}
                />
              ) : (
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
                alertKinds={alertKinds}
                // 商品の見方の、この週の掲載回数のバッジ(絞り込みに関係なく、その週のすべての配信で数える)
                weekUse={weekUseAll.get(weekKeyOf(weekStart))}
                onSelect={openCard}
                stateOf={onProduction ? productionState : undefined}
                renderMeta={onProduction ? productionMeta : undefined}
                // 下書きモードでは、日の「＋」で、その日に下書きを足す
                onCreate={quickNew}
              />
              )}
              </SwipePager>
              </>
            ) : (
              <>
              {monthBar}
              {/* 計画の面の月の表示に、前月の振り返り(結果の面の月の表示で書いたもの)を出す */}
              {!onProduction && month && isOn('plan.prevreview') && isOn('results.review') && (
                <PrevMonthRetro
                  month={month}
                  country={filters.country}
                  onOpenResults={() => {
                    setPage('results')
                    goTo('month', new Date(month.getFullYear(), month.getMonth() - 1, 1))
                  }}
                />
              )}
              <SwipePager onPrev={() => shift(-1)} onNext={() => shift(1)} enabled={swipeOn}>
              <Calendar
                month={month}
                cards={filtered}
                dueSoon={dueSoon}
                alertKinds={alertKinds}
                onSelect={openCard}
                onCreate={quickNew}
                onOpenWeek={(d) => goTo('week', d)}
                // 制作の面: 箱の色は制作の状態、2 行目は状態と締め切り(PR4)
                chipTone={onProduction ? productionTone : undefined}
                renderMeta={onProduction ? productionMeta : undefined}
                // キャンペーン単位で出すのは計画の面だけ(制作の面は、カードごとに制作の状態を見るため 1 枚ずつ)
                campaigns={onProduction ? undefined : campaigns}
              />
              </SwipePager>
              </>
            )}
          </>
        )}
        </ErrorBoundary>
      </div>
      {/* アラート(フロート)。配信カードより先に置く(ここから開いた配信カードが、上に重なるように) */}
      <WeekHistory open={historyOpen} onClose={() => setHistoryOpen(false)} events={weekEvents} />
      <AlertsFloat open={alertsOpen} onClose={() => { setAlertsOpen(false); setAlertsFocus(undefined) }}>
        <Later spin><AlertsPage initialProductId={alertsFocus} onSelectProduct={setAlertsFocus} onOpenAlertCard={openFromAlert} alerts={alerts} changeAlerts={changeAlerts} onResolve={(a, note) => changeState.resolve(a, myName(), note)} settings={alertSettings} owners={owners} logs={changeState.logs} cards={cards} products={products} heroes={heroes} cardProducts={cardProducts} placements={alertState.placements} model={alertState.model} weeks={weeks} onOpenCard={setSelectedId} onChanged={load} /></Later>
      </AlertsFloat>
      {/* まとめて作る作業画面。配信カードより先に置く(ここから開いた配信カードが、上に重なるように) */}
      {bulkOpened && <Later><BulkWorkspace
        ws={bulk}
        cards={activeCards}
        products={products}
        heroes={heroes}
        onOpen={(id, focus) => {
          setFocusProduct(focus)
          setSelectedId(id)
        }}
        onOpenDraft={(day, focus) => {
          const draft = bulk.draftFor(day)
          // 週の上限超えは、配信カードのアラートとして出し、その商品を選んだ状態で開く(直す場所を配信カードにそろえる)
          if (draft) setDraftOpen({ day, draft, alerts: bulk.draftAlerts(day), focus })
        }}
        onFinish={(d) => goTo('week', d)}
      /></Later>}
      {/* 新規作成は、キャンペーンと最初の配信カード 1 枚を作る窓から(X79)。作ったカードを開く */}
      {creating && (
        <NewCampaignDialog
          defaults={creating}
          weeks={weeks}
          onClose={() => setCreating(null)}
          onCreated={(id) => {
            void reloadCards().then(() => setSelectedId(id))
          }}
        />
      )}
      {(selected || draftOpen) && (
        // 配信カードで失敗しても、閉じて、ほかの配信を開けるように
        <ErrorBoundary
          resetKey={selected?.id ?? 'new'}
          overlay
          onClose={() => {
            setSelectedId(null)
            setCreating(null)
            setDraftOpen(null)
          }}
        >
        <CardDetail
          key={selected?.id ?? (draftOpen ? `draft:${draftOpen.day}` : 'new')}
          card={selected}
          draft={selected ? undefined : draftOpen?.draft}
          // 新しい配信を「保存」(閉じない)したら、保存した配信として開き直す(X52)
          onReopen={(id) => {
            setCreating(null)
            setDraftOpen(null)
            openNext(id)
          }}
          onCreated={(id) => {
            if (draftOpen) bulk.markSaved(draftOpen.day, id)
          }}
          products={products}
          heroes={heroes}
          onHeroesChanged={reloadHeroes}
          otherThemes={cards.filter((c) => c.id !== selected?.id && c.theme).map((c) => c.theme!)}
          allCards={cards}
          weeks={weeks}
          owners={owners}
          onBack={() => {
            setFocusProduct(undefined)
            setInstantId(null)
            setSelectedId(null)
            setCreating(null)
            setDraftOpen(null)
            // 質問・返信は、保存を待たずに書き込むので、閉じたときにも読み直す
            void reloadCards()
          }}
          onSaved={reloadCards}
          // 結果は、面を切り替えずに、配信カードの上に重ねて見る。結果の面で、その結果から開いた配信カードでは出さない(下に結果があるため)
          onOpenResults={page === 'results' && resultDetail === selected?.id ? undefined : setPeekResult}
          alerts={selected ? cardAlerts.get(selected.id) : draftOpen?.alerts}
          // 週の上限超えの差し替えで、上限に届いた商品を候補から除く(作業画面の案は、保存していない案も数える)
          weekUse={selected?.scheduled_at ? weekUseAll.get(weekKeyOf(new Date(selected.scheduled_at))) : draftOpen ? bulk.weekUse : undefined}
          focusProductId={focusProduct ?? draftOpen?.focus}
          stockModel={alertState.model}
          // 配信カードの中の「アラートの画面で詳しく」: 配信カードを閉じて、その商品のアラートを選んだアラートのフロートを開く
          onOpenAlerts={(productId) => {
            setFocusProduct(undefined)
            setSelectedId(null)
            setCreating(null)
            setDraftOpen(null)
            setAlertsFocus(productId)
            setAlertsOpen(true)
          }}
          // 制作のページは、配信カードの上に重ねて開く(PR4)
          onOpenProduction={(id, opts) => {
            // シンプルな配信カードの「制作に渡す」は、開いた(詳しい)制作のページで、そのまま依頼まで進める。
            // 渡す処理は詳しいほうにあるので、配信カードの上に重ねて開く(同じ窓の切り替えにしない。渡すのを配信カードへ移す段で変える)
            if (opts?.request) {
              setPeekResult(null)
              setProductionAuto(true)
              setProductionOpen(id)
              return
            }
            void goStage(id, 'production')
          }}
          stageNav={selected ? stageNav(selected, 'calendar') : undefined}
          stageTabs={selected ? stageNav(selected, 'calendar', 'tabs') : undefined}
          next={nextOf === undefined ? undefined : nextOf && { name: nextOf.name, position: nextOf.position }}
          onNext={() => {
            if (!nextOf) return
            setFocusProduct(undefined)
            openNext(nextOf.id)
          }}
          // キャンペーンの帯のタブで、きょうだいの配信に切り替える(X79)
          onSwitchCard={(id) => {
            setFocusProduct(undefined)
            openNext(id)
          }}
          instant={!!selected && selected.id === instantId}
          leaveRef={cardLeaveRef}
          alertsOf={(id) => cardAlerts.get(id)}
        />
        </ErrorBoundary>
      )}
      {/* AI でまとめて作った配信を、確かめる引き出し(W14) */}
      {cardMenu.menu}
      {/* 開発へのリクエストのピン(どの画面にも重ねる)と、その一覧 */}
      <DevRequestLayer link={linkState} cardName={(id) => cards.find((c) => c.id === id)?.name ?? ''} />
      {devRequestsOpen && <Later><DevRequestsDialog onClose={() => setDevRequestsOpen(false)} /></Later>}
      {dupCard && (
        <DuplicateDialog
          card={dupCard}
          weeks={weeks}
          onClose={() => setDupCard(null)}
          // 配信カードの「…」の複製と同じく、読み直してから、複製した配信を開く
          onDuplicated={async (id) => {
            await reloadCards()
            setSelectedId(id)
          }}
        />
      )}
      {peekResult && (
        <Later><ResultPeek cardId={peekResult} cards={cards} cardProducts={cardProducts} products={products} heroes={heroes} onClose={() => setPeekResult(null)} stageNav={(c) => stageNav(c, 'results')} /></Later>
      )}
      {/* 制作のページ(PR3)。制作の面の箱、または配信カードの「制作の依頼」の札から開く。配信カードの上に重なる */}
      {productionOpen && cards.find((c) => c.id === productionOpen) && productionSimple && !productionAuto && (
        <Later><SimpleProductionPage
          key={`${productionOpen}:${productionKey}`}
          card={cards.find((c) => c.id === productionOpen)!}
          productIds={cardProducts.get(productionOpen) ?? []}
          variantIds={variantProducts.get(productionOpen)}
          products={products}
          productImages={cardImages.get(productionOpen)}
          heroes={heroes}
          people={owners}
          onClose={() => setProductionOpen(null)}
          onFullView={() => switchProductionView(false)}
          instant={productionOpen === instantId}
          onChanged={() => void production.reload()}
          stageTabs={stageNav(cards.find((c) => c.id === productionOpen)!, 'production', 'tabs')}
        /></Later>
      )}
      {productionOpen && cards.find((c) => c.id === productionOpen) && (!productionSimple || productionAuto) && (
        <Later><ProductionPage
          key={`${productionOpen}:${productionKey}`}
          card={cards.find((c) => c.id === productionOpen)!}
          productIds={cardProducts.get(productionOpen) ?? []}
          variantIds={variantProducts.get(productionOpen)}
          products={products}
          productImages={cardImages.get(productionOpen)}
          heroes={heroes}
          people={owners}
          onClose={() => {
            setProductionOpen(null)
            setProductionAuto(false)
          }}
          onOpenCard={(id) => void goStage(id, 'calendar')}
          onChanged={() => void production.reload()}
          autoRequest={productionAuto}
          stageNav={stageNav(cards.find((c) => c.id === productionOpen)!, 'production')}
          onSimpleView={() => {
            setProductionAuto(false)
            switchProductionView(true)
          }}
        /></Later>
      )}
    </>
  )
}

export default App
