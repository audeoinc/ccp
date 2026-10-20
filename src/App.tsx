import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  Badge,
  Button,
  Menu,
  MenuButton,
  type MenuButtonProps,
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
  MessageBarActions,
  MessageBarBody,
  Portal,
  SplitButton,
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
  ArrowSyncRegular,
  ArrowUploadRegular,
  DismissRegular,
  CalendarLtrRegular,
  PaintBrushRegular,
  TableRegular,
  DocumentPdfRegular,
  HistoryRegular,
  DataBarVerticalRegular,
  SettingsRegular,
  LayoutColumnTwoRegular,
  DocumentBulletListRegular,
  PeopleTeamRegular,
  ChevronDownRegular,
  GlobeRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
} from '@fluentui/react-icons'
import { DeliveryCardsService } from './data/deliveryCards'
import type { DeliveryCard } from './models/deliveryCards'
import { ProductsService } from './data/products'
import type { Product } from './models/products'
import { HeroImagesService } from './data/heroImages'
import { ProductPoliciesService } from './data/productPolicies'
import type { HeroImage } from './models/heroImages'
import { DeliveryProductsService } from './data/deliveryProducts'
import { CardNotesService, type CardNote } from './data/cardNotes'
import { WeeksService, type WeekRow, type WeekStatus } from './data/weeks'
import { WeekReviewBar } from './WeekReviewBar'
import { MePicker, SignInDialog } from './MePicker'
import { WeekRetro } from './WeekRetro'
import { WeekHistory } from './WeekHistory'
import { MonthSummaryBar } from './MonthSummaryBar'
import { Calendar } from './Calendar'
import { ListView } from './ListView'
import { ResultsPage, type ResultsDataActions } from './ResultsPage'
import { AiIcon } from './AiMark'
import { AlertsPage } from './AlertsPage'
import { AlertsFloat } from './AlertsFloat'
import { FACE_COLOR, FACE_LOGO, FACE_TINT, type Face } from './faces'
import { dateOf, dateText, hasFloat, linkSearch, parseLink, type LinkState } from './deepLink'
import { useChangeAlerts, useStockAlerts } from './alerts'
import { buildCardAlerts, mergeCardAlerts, overLimitAlerts, topKind, weeklyUse, type CardAlert, type CardAlertKind } from './cardAlerts'
import { filterChangeAlerts, filterStockAlerts, useAlertSettings } from './alertSettings'
import { appPath } from './appRoot'
import { bqOutputLabel, syncBigQuery, type BqSyncResult } from './gcp/bq'
import { clearProductDataCache } from './useProductData'
import { isCancelled } from './cancel'
import { setActivePolicies, setActiveRules, setActiveSales, onPolicyWarning } from './aiSelect'
import { ResultPeek } from './ResultPeek'
import { WeekView, type WeekLens } from './WeekView'
import { COLUMNS, DEFAULT_COLUMNS, downloadCsv, toRows, type ColumnKey } from './listRows'
import { STATE_CANDIDATE } from './items'
import { withHeroLabels, withProductLabels } from './labels'
import { loadCustomTemplates } from './layoutTemplates'
import { TemplateManager } from './TemplateManager'
import { PolicyManager } from './PolicyManager'
import { PolicyRulesService } from './data/policyRules'
import { SalesPoliciesService } from './data/salesPolicies'
import { PeopleManager } from './PeopleManager'
import { openPeopleManager, usePeople } from './people'
import { InboxButton } from './InboxButton'
import { useApprovalInbox } from './useApprovalInbox'
import { productionColor, productionLabel, productionView, useProductionRequests } from './useProductionRequests'
import { ProductionPage } from './ProductionPage'
import { StageNav } from './StageNav'
import { approveMine, needsRequest, requestAll } from './weekApprovals'
import { openTemplateManager, useTemplates } from './templates'
import { CardDetail, type NewCardDefaults } from './CardDetail'
import { FrameBar } from './FrameBar'
import { FrameCard } from './FrameCard'
import { CheckDrawer } from './CheckDrawer'
import { useWeekFrames } from './useWeekFrames'
import { useBulkWorkspace, type BulkDraft } from './useBulkWorkspace'
import { BulkWorkspace } from './BulkWorkspace'
import { loadAutoDraft, loadPref, saveAutoDraft, savePref } from './settings'
import { locale, optionLabel, setLang, tr, useLang, useT } from './i18n'
import { channelOptions, countryOptions, statusColor, statusOptions, statusView } from './status'
import { THEME_TYPES, classifyThemeTypes, themeTypeLabel, themeTypeOf } from './themeTypes'
import { dayKeyOf, sundayOf, weekKeyOf } from './weekLock'
import { logEvent, myName, myUserId, onMeChange } from './history'
import { EventsService, type CardEvent } from './data/events'
import { WeekCheckChip, WeekChecklist } from './WeekChecklist'
import { WeekReport } from './WeekReport'
import { MiniCalendar } from './MiniCalendar'
import { printWeek } from './printWeek'
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
  /** 担当(企画・制作のどちらかが、この名前の配信)。制作担当が、自分の配信だけを見る入り口にする(FLOWS.md の C-2) */
  person: string
}
// 担当の絞り込みの「自分」(ログインしている人の名前に読み替える。名前が変わっても、選び直さなくてよい)
const ME_PERSON = '__me__'
const noFilter: Filters = { country: '', channel: '', department: '', status: '', person: '' }
// 国(X33): 表示の絞り込みではなく、ヘッダーで選ぶ「どの国の仕事をしているか」。人ごと(ブラウザごと)に覚える。
// 初めて開いたときは、ビルドの設定(VITE_DEFAULT_COUNTRY。US)の国。'' = すべての国
const COUNTRY_KEY = 'ccp.country'
const defaultCountry = String(countryOptions.find((o) => o.label === import.meta.env.VITE_DEFAULT_COUNTRY)?.value ?? '')
const initialFilters = (): Filters => ({ ...noFilter, country: loadPref<string>(COUNTRY_KEY, defaultCountry) })

const useStyles = makeStyles({
  // ヘッダーと面の帯を、ひとまとめで上に留める
  headerWrap: { position: 'sticky', top: 0, zIndex: 10, boxShadow: tokens.shadow2 },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    rowGap: tokens.spacingVerticalS,
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalXL}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  // 面の帯(X38): ヘッダーのすぐ下の細い帯。面の色の線と、ロゴ風の面の名前
  faceBand: { display: 'flex', alignItems: 'center', columnGap: '10px', height: '22px', padding: `0 ${tokens.spacingHorizontalXL}`, borderBottomWidth: '3px', borderBottomStyle: 'solid' },
  faceLogo: { fontSize: '12px', fontWeight: 800, letterSpacing: '0.18em', lineHeight: 1 },
  faceHint: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  headerIcon: { color: tokens.colorBrandForeground1, flexShrink: 0 },
  title: {
    margin: 0,
    fontSize: tokens.fontSizeBase400,
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: tokens.lineHeightBase400,
    letterSpacing: '0.01em',
    whiteSpace: 'nowrap',
    // 画面が狭いときは、アプリ名の文字を隠してアイコンだけにする(絞り込みの札をヘッダーの 1 段に収めるため。X39)
  },
  // ヘッダーの絞り込みの札(X39)。収まらないときだけ、2 段目に回る
  // 絞り込みの段(X42): ヘッダーのすぐ下。ヘッダーより一段控えめな地
  filterBar: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px', padding: `6px ${tokens.spacingHorizontalXL}`, backgroundColor: tokens.colorNeutralBackground1, borderTop: `1px solid ${tokens.colorNeutralStroke3}` },
  filterBarDivider: { width: '1px', alignSelf: 'stretch', margin: '2px 6px', backgroundColor: tokens.colorNeutralStroke2 },
  filterBarLabel: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, marginRight: '4px' },
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
  // 国の切り替え(X33): 計画 | 結果 の切り替えと同じ枠・同じ高さ
  countryBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    padding: `5px ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  countryIcon: { fontSize: '16px', color: tokens.colorNeutralForeground2 },
  countryChevron: { fontSize: '12px', color: tokens.colorNeutralForeground3 },
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
  // 絞り込みの札(名前: 値 ▾)。札の全体が押せる
  filterChip: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '4px',
    height: '28px',
    padding: '0 10px 0 12px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    fontFamily: 'inherit',
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':focus-visible': { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px' },
  },
  // 「すべて」以外を選んでいる(絞り込み中)
  filterChipOn: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  filterChipLabel: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  filterChipValue: { fontWeight: tokens.fontWeightSemibold, whiteSpace: 'nowrap' },
  // 絞り込みの選ぶ一覧(項目の幅をそろえ、少し広めに)
  filterMenu: { minWidth: '180px' },
  filterChipChevron: { fontSize: '12px', marginLeft: '2px', color: tokens.colorNeutralForeground3 },
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
  // ヘッダーの「あなた」
  headerMe: { maxWidth: '200px' },
  toolbarDivider: { width: '1px', alignSelf: 'stretch', margin: `2px ${tokens.spacingHorizontalS}`, backgroundColor: tokens.colorNeutralStroke2 },
})

function FilterSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const styles = useStyles()
  const t = useT()
  // 名前を札の中に入れた、1 行の細い絞り込み(名前を上に置くと、2 行分の高さを取るため)。「すべて」以外を選んでいる札は、色を付けて目立たせる。
  // 選ぶ一覧は、ブラウザ標準のものではなく、ほかのメニューと同じ見た目(余白があり、選んでいる値にチェック)
  const current = value === '' ? t('すべて', 'All') : optionLabel(options.find((o) => String(o.value) === value)?.label ?? value)
  return (
    <Menu
      positioning="below-start"
      checkedValues={{ [label]: [value] }}
      onCheckedValueChange={(_, d) => onChange(d.checkedItems[0] ?? '')}
    >
      <MenuTrigger disableButtonEnhancement>
        <button type="button" className={mergeClasses(styles.filterChip, value !== '' && styles.filterChipOn)} aria-label={`${label}: ${current}`}>
          {/* 選んでいないときは名前だけ(「すべて」は情報が少ないので出さない。ヘッダーに収めるため短くする)。選んだら「名前: 値」 */}
          {value === '' ? (
            <span>{label}</span>
          ) : (
            <>
              <span className={styles.filterChipLabel}>{label}:</span>
              <span className={styles.filterChipValue}>{current}</span>
            </>
          )}
          <ChevronDownRegular className={styles.filterChipChevron} aria-hidden />
        </button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList className={styles.filterMenu}>
          <MenuItemRadio name={label} value="">{t('すべて', 'All')}</MenuItemRadio>
          {options.map((o) => (
            <MenuItemRadio key={o.value} name={label} value={String(o.value)}>{optionLabel(o.label)}</MenuItemRadio>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  )
}

/** ⚙ に出す、在庫のデータの時点(BigQuery 側。取り込んだ時刻ではない) */
function bqStockTime(r: BqSyncResult): string | undefined {
  const at = r.outputs.find((o) => o.name === 'sku_stock')?.dataAsOf
  return at ? tr('在庫 ', 'Stock ') + new Date(at).toLocaleString(locale(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : undefined
}

function App() {
  // 開いたときの URL(リンクから開いたら、その画面で始める。X36)
  const [link] = useState(() => parseLink(window.location.search))
  const styles = useStyles()
  const t = useT()
  const lang = useLang()
  const [cards, setCards] = useState<DeliveryCard[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [heroes, setHeroes] = useState<HeroImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // BigQuery からの取り込み(B2・B4)。設定がない環境では configured: false のまま、何も出さない
  const [bq, setBq] = useState<BqSyncResult | null>(null)
  const [bqBusy, setBqBusy] = useState(false)
  const [bqNotice, setBqNotice] = useState<{ intent: 'success' | 'warning' | 'error'; text: string } | null>(null)
  // マーケティングポリシー(M3・M4)。⚙ から取り込み・一覧。AI の依頼に足すため、読んだら aiSelect に渡す
  const [policyOpen, setPolicyOpen] = useState(false)
  // AI の案が、作り直しても must の決まりを破っていたとき(M5)。案は使えるが、人が確かめる
  const [policyWarning, setPolicyWarning] = useState<string | null>(null)
  useEffect(
    () =>
      onPolicyWarning((w) =>
        setPolicyWarning(
          tr('AI の案が、必ず守る決まりを破っています(作り直しても直りませんでした)。案を確かめて、直してから保存してください: ', 'An AI suggestion breaks a must rule (still broken after one retry). Check and fix it before saving: ') +
            w.violations.map((v) => `${v.ruleId}「${v.title}」(${v.detail})`).join(' / '),
        ),
      ),
    [],
  )
  const loadMarketingPolicies = useCallback(async () => {
    const [r, s] = await Promise.all([PolicyRulesService.getAll({ top: 5000 }), SalesPoliciesService.getAll({ top: 5000 })])
    if (r.success)
      setActiveRules(
        (r.data ?? []).map((x) => ({
          ruleId: x.rule_id ?? '',
          title: x.title ?? '',
          appliesTo: (x.applies_to ?? '').split(',').filter(Boolean),
          strength: x.strength ?? 'info',
          market: (x.market ?? '').split(',').filter(Boolean),
          channel: (x.channel ?? '').split(',').filter(Boolean),
          periodStart: x.period_start || undefined,
          periodEnd: x.period_end || undefined,
          checkSpec: x.check_spec || undefined,
          body: x.body ?? '',
        })),
      )
    if (s.success)
      setActiveSales(
        (s.data ?? []).map((x) => ({
          weekStart: (x.week_start ?? '').slice(0, 10),
          market: x.market ?? '',
          scope: x.scope ?? 'all',
          target: x.target ?? '',
          stage: x.stage || undefined,
          priority: x.priority ?? undefined,
          promoPeriod: x.promo_period || undefined,
          focus: x.focus || undefined,
          note: x.note || undefined,
        })),
      )
  }, [])
  // リンクの日付があれば、その月(週なら、その週の真ん中の日の月)で始める。なければ、読み込んだあとに決める
  const [month, setMonth] = useState<Date | null>(() => {
    const d = dateOf(link.date)
    if (!d) return null
    const mid = link.view === 'week' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3) : d
    return new Date(mid.getFullYear(), mid.getMonth(), 1)
  })
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
  const [selectedId, setSelectedId] = useState<string | null>(link.card ?? null)
  // 配信カードで開いている工程のタブ(URL に持たせる)
  const [cardTab, setCardTab] = useState<string | undefined>(link.tab)
  // 新規作成中なら、最初に入れておく値(null は新規作成していない)
  const [creating, setCreating] = useState<NewCardDefaults | null>(null)
  // まとめて作る作業画面の、まだ保存していない案を、配信カードで開いているとき(保存すると新規作成になる)
  const [draftOpen, setDraftOpen] = useState<{ day: string; draft: BulkDraft; alerts?: CardAlert[]; focus?: string } | null>(null)

  // 配信カードごとの掲載商品の数(一覧の「商品数」「工程」と、締め切りの警告に使う。候補の行は数えない)
  // 配信カードごとの掲載商品(メールの並び順の商品 ID。候補の行は入れない)。数は、一覧の「商品数」「工程」と、締め切りの警告に使う
  const [cardProducts, setCardProducts] = useState<Map<string, string[]>>(new Map())
  const productCounts = useMemo(() => new Map([...cardProducts].map(([k, v]) => [k, v.length])), [cardProducts])
  // 週の表示の、週の初め(日曜日)
  const [weekStart, setWeekStart] = useState<Date>(() => sundayOf(dateOf(link.date) ?? new Date()))
  // 配信カードごとの、質問の未解決の数(一覧の列)
  const [questionCounts, setQuestionCounts] = useState<Map<string, number>>(new Map())
  // 配信カードごとの、未解決の質問の宛先・質問した人と、未完了のタスクの担当(絞り込みの「担当」で、その人がかかわる配信も出すため)
  const [noteParties, setNoteParties] = useState<Map<string, Set<string>>>(new Map())
  // 配信カードごとの、未完了のタスクの数(一覧の列・週の表示)
  const [taskCounts, setTaskCounts] = useState<Map<string, number>>(new Map())
  // 配信カードごとの、未対応のレビューのコメントの数(週の表示・確認の一覧)
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map())
  // 配信カードごとの、未対応のレビューのコメント(週の資料に、本文を載せる)
  const [openComments, setOpenComments] = useState<Map<string, CardNote[]>>(new Map())
  // 週の資料(PDF)を印刷している間だけ true(資料を描いて、印刷の画面を開き、閉じたら片付ける)
  const [printingWeek, setPrintingWeek] = useState(false)
  // 週の計画(週のレビューの状態)
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  // 結果の面のデータの操作(ResultsPage から受け取り、⚙ のメニューに並べる)
  const [resultsData, setResultsData] = useState<ResultsDataActions | null>(null)
  // 確定した週の配信を変えたときの理由(週の状態の帯に、確定後の変更として出す)
  const [changeNotes, setChangeNotes] = useState<CardNote[]>([])
  // 承認の履歴(週の操作・配信のステータスの変更。週の状態の帯で、週ごとに出す)
  const [events, setEvents] = useState<CardEvent[]>([])
  // 配信カードごとの、期日を過ぎた未完了のタスクの数(週の表示で、問題として目立たせる)
  const [overdueTasks, setOverdueTasks] = useState<Map<string, number>>(new Map())
  // 週の表示の見方: 商品のバランス / 進み具合。ブラウザごとに覚える
  // 商品の販売方針(商品コードごと。週の確認の一覧で、主力の漏れを見るため)
  const [policies, setPolicies] = useState<Map<string, PolicyLite>>(new Map())
  // 週の確認の一覧で選んだ項目。週を移ったら、選んでいないことにする(週ごとに中身が違うため)
  const [check, setCheck] = useState<{ week: string; key: CheckKey } | null>(null)
  // 開いている画面: カレンダー / 配信結果(振り返り)
  // アラートは、計画・結果とは別の画面(ヘッダーの「アラート」から開く)
  // 計画(表)・制作(中。PR4)・結果(裏)。同じカレンダー(配信日)を起点に行き来する
  const [page, setPage] = useState<'calendar' | 'production' | 'results' | 'alerts'>(link.page ?? 'calendar')
  // 面の色・帯に使う面(アラートは面ではないので、計画の色)
  const face: Face = page === 'production' || page === 'results' ? page : 'calendar'
  // 開いている制作のページ(配信の id)
  const [productionOpen, setProductionOpen] = useState<string | null>(link.production ?? null)
  // 結果の面で、詳しい結果(フロート)を開いている配信
  const [resultDetail, setResultDetail] = useState<string | null>(link.result ?? null)
  // 計画の面で、配信カードの上に重ねて見ている結果(閉じると、配信カードに戻る)
  const [peekResult, setPeekResult] = useState<string | null>(null)
  // 結果の面の操作を差し込む、ツールバーの場所
  const [toolbarSlot, setToolbarSlot] = useState<HTMLSpanElement | null>(null)
  // アラート(在庫の見込み)。配信カードを読み直すたびに、計算し直す
  // 取りやめた配信を除いた配信(アラート・週の確認・件数に使う。カレンダーには、取りやめた配信も薄く出す)
  // 国(ヘッダー)で絞った配信。計画・結果・週の帯・アラート・依頼の件数など、画面のすべてがこの国の配信を見る(X33)
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
  const goStage = (id: string, f: Face) => {
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
  const stageNav = (c: DeliveryCard, f: Face) => <StageNav face={f} card={c} production={production.latest.get(c.id)} onGo={(to) => goStage(c.id, to)} />
  // 制作の面では、配信を押すと制作のページを開く(計画の面は配信カード)
  const openCard = (id: string) => (onProduction ? setProductionOpen(id) : setSelectedId(id))
  const productionTone = (c: DeliveryCard) => {
    const color = productionColor(productionView(c, production.latest.get(c.id)))
    return { line: color, background: `color-mix(in srgb, ${color} 14%, var(--colorNeutralBackground1))` }
  }
  // 制作の面の箱の 2 行目: 状態と締め切り(締め切りを過ぎた・近いものに印)
  const productionMeta = (c: DeliveryCard) => {
    const req = production.latest.get(c.id)
    const v = productionView(c, req)
    const due = (req?.production_due ?? c.production_due ?? '').slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    // 締め切りを過ぎた印は、まだ配信していない(配信日が今日以降の)ものだけ(過去の配信に全部付くと、見分けがつかないため)
    const upcoming = (c.scheduled_at ?? '').slice(0, 10) >= today
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
  const alertState = useStockAlerts(activeCards, products, cards, alertSettings.lowWeeks)
  const alerts = filterStockAlerts(alertSettings, alertState.alerts)
  // 変更のアラート(MD 方針の変更・日程の変更)。件数は、在庫のアラートと合わせて、ヘッダーに出す
  const changeState = useChangeAlerts(activeCards, products, alertState.placements, cards)
  // 配信のない変更の知らせ(主力になった など)は、商品の市場で国に合わせる
  const changeAlerts = filterChangeAlerts(alertSettings, changeState.changeAlerts).filter(
    (a) => !filters.country || a.card || a.deliveries.length > 0 || !a.product?.market || a.product.market === filters.country,
  )
  const alertCount = alerts.length + changeAlerts.length
  // 配信ごとのアラート(配信カードの帯・カレンダーの印)
  // 配信ごとのアラート: 在庫・方針・日程に、週の上限を超えた商品を足す(直す場所を配信カードにそろえるため)
  const cardAlerts = useMemo(
    () => mergeCardAlerts(buildCardAlerts(alerts, changeAlerts), overLimitAlerts(activeCards, cardProducts, (id) => products.find((p) => p.id === id)?.name ?? '')),
    [alerts, changeAlerts, activeCards, cardProducts, products],
  )
  const weekUseAll = useMemo(() => weeklyUse(activeCards, cardProducts), [activeCards, cardProducts])
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
  const showFace = (p: 'calendar' | 'production' | 'results' | 'alerts') => {
    setResultDetail(null)
    // 「比べる」は結果の面だけ。計画の面に戻るときは、月にする
    if (p === 'calendar' && view === 'compare') setView('month')
    setPage(p)
  }
  const [lens, setLens] = useState<WeekLens>(() => loadPref<WeekLens>(LENS_KEY, 'products'))
  // 最初は計画の面なので、「比べる」を覚えていても、月で始める
  const [view, setView] = useState<View>(() => {
    // リンクの見せ方を優先する(「比べる」は結果の面だけ)
    if (link.view && (link.view !== 'compare' || link.page === 'results')) return link.view
    const v = loadPref<View>(VIEW_KEY, 'month')
    return v === 'compare' ? 'month' : v
  })
  const [columns, setColumns] = useState<ColumnKey[]>(() => loadPref<ColumnKey[]>(COLUMNS_KEY, DEFAULT_COLUMNS))

  const load = useCallback(async () => {
    try {
      DeliveryProductsService.getAll()
        .then((res) => {
          if (!res.success) return // 数が出ないだけで、画面は使える
          const rows = (res.data ?? [])
            .filter((r) => r.delivery_card_id && r.state !== STATE_CANDIDATE)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          const byCard = new Map<string, string[]>()
          for (const r of rows) {
            const id = r.delivery_card_id!
            if (r.product_id) byCard.set(id, [...(byCard.get(id) ?? []), r.product_id])
          }
          setCardProducts(byCard)
        })
        .catch(() => undefined)
      CardNotesService.getAll()
        .then((res) => {
          if (!res.success) return
          const counts = new Map<string, number>()
          const tasks = new Map<string, number>()
          const overdue = new Map<string, number>()
          const comments = new Map<string, number>()
          const commentNotes = new Map<string, CardNote[]>()
          const parties = new Map<string, Set<string>>()
          const addParty = (id: string, name?: string) => {
            if (name?.trim()) parties.set(id, (parties.get(id) ?? new Set()).add(name.trim()))
          }
          const d = new Date()
          const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
          setChangeNotes((res.data ?? []).filter((n) => n.kind === 'change'))
          for (const n of res.data ?? []) {
            const id = n.delivery_card_id
            if (!id || n.resolved) continue
            // 変更の理由は記録、コメントへの返信はスレッドの一部なので、質問・タスクの数には入れない
            if (n.kind === 'change' || n.kind === 'reply') continue
            if (n.kind === 'comment') {
              // やり取り(2026-10-17 に質問と 1 つにした)は宛先を持てるので、「担当」の絞り込みの候補に足す
              addParty(id, n.assignee)
              comments.set(id, (comments.get(id) ?? 0) + 1)
              commentNotes.set(id, [...(commentNotes.get(id) ?? []), n])
              continue
            }
            if (n.kind === 'task') {
              addParty(id, n.assignee)
              tasks.set(id, (tasks.get(id) ?? 0) + 1)
              if (n.due && n.due.slice(0, 10) < today) overdue.set(id, (overdue.get(id) ?? 0) + 1)
            }
            else {
              // 質問: 誰からでも、誰にでも(宛先は assignee の列)。週の資料では、コメントと同じ「未解決のやり取り」に並べる
              addParty(id, n.author)
              addParty(id, n.assignee)
              counts.set(id, (counts.get(id) ?? 0) + 1)
              commentNotes.set(id, [...(commentNotes.get(id) ?? []), n])
            }
          }
          setNoteParties(parties)
          setQuestionCounts(counts)
          setTaskCounts(tasks)
          setOverdueTasks(overdue)
          setCommentCounts(comments)
          setOpenComments(commentNotes)
        })
        .catch(() => undefined)
      WeeksService.getAll()
        .then((res) => {
          if (res.success) setWeeks(res.data ?? [])
        })
        .catch(() => undefined)
      EventsService.getAll({ orderBy: ['created_on desc'] })
        .then((res) => {
          if (res.success) setEvents(res.data ?? [])
        })
        .catch(() => undefined)
      const res = await DeliveryCardsService.getAll({ orderBy: ['scheduled_at asc'] })
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
        const dated = data.filter((c) => c.scheduled_at)
        const first = (dated.find((c) => new Date(c.scheduled_at!).getTime() >= thisMonth) ?? dated[0])?.scheduled_at
        const base = first ? new Date(first) : now
        return new Date(base.getFullYear(), base.getMonth(), 1)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadProducts = useCallback(
    () =>
      ProductsService.getAll({ orderBy: ['product_code asc'] })
        .then((res) => {
          if (res.success) setProducts((res.data ?? []).map(withProductLabels))
          else setError(res.error?.message ?? tr('商品の取得に失敗しました', 'Failed to load products'))
          return res.success
        })
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : String(e))
          return false
        }),
    [],
  )

  // BigQuery の変わった出力を取り込み、取り込めたら商品(在庫・売上の集計)を読み直す。
  // force は ⚙ のボタン(変わっていなくても、すべて読み直す)。開いたときは、変わった出力だけ(サーバーが判定する)
  const runBqSync = useCallback(
    async (force: boolean) => {
      setBqBusy(true)
      const { result, error: err } = await syncBigQuery(force)
      setBqBusy(false)
      setBq(result)
      if (result.imported.length) {
        clearProductDataCache()
        await loadProducts()
      }
      const names = (list: { name: string }[]) => list.map((x) => bqOutputLabel(x.name)).join(tr('・', ', '))
      if (err) setBqNotice({ intent: 'error', text: err })
      else if (result.failed.length)
        setBqNotice({
          intent: 'warning',
          text:
            tr(`BigQuery から取り込めなかったデータがあります(前のデータのまま使います): `, `Some BigQuery data was not imported (the previous data is kept): `) +
            result.failed.map((f) => `${bqOutputLabel(f.name)} — ${f.message}`).join(' / '),
        })
      // 開いたときの取り込みは、うまくいったら知らせない(在庫が変わるたびに出て、うるさいため)。ボタンのときだけ結果を出す
      else if (force && result.imported.length) setBqNotice({ intent: 'success', text: tr(`BigQuery から取り込みました: ${names(result.imported)}`, `Imported from BigQuery: ${names(result.imported)}`) })
      else if (force && result.configured) setBqNotice({ intent: 'success', text: tr('BigQuery から読み直しました(取り込むデータはありませんでした)', 'Checked BigQuery (nothing to import)') })
    },
    [loadProducts],
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
    // 商品を読めたら(DB が使えるとわかってから)、BigQuery の更新を確かめる
    void loadProducts().then((ok) => {
      if (ok) void runBqSync(false)
    })
    void loadMarketingPolicies().catch(() => undefined) // 読めなくても、決まりなしで画面は使える
    ProductPoliciesService.getAll({ select: ['product_code', 'stage', 'promo_period', 'policy', 'promo_plan'] })
      .then((res) => {
        if (!res.success) return // 主力の漏れが出ない・AI が方針を使わないだけで、画面は使える
        const rows = (res.data ?? []).filter((r) => r.product_code)
        setPolicies(new Map(rows.map((r) => [r.product_code!, { stage: r.stage, promoPeriod: r.promo_period }])))
        // AI の商品の選定にも、MD 方針を渡す(バックログ M2)
        setActivePolicies(new Map(rows.map((r) => [r.product_code!, { stage: r.stage, policy: r.policy, promoPlan: r.promo_plan, promoPeriod: r.promo_period }])))
      })
      .catch(() => undefined)
    HeroImagesService.getAll({ orderBy: ['image_code asc'] })
      .then((res) => {
        if (res.success) setHeroes((res.data ?? []).map(withHeroLabels))
        else setError(res.error?.message ?? tr('メイン画像の取得に失敗しました', 'Failed to load hero images'))
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [load, loadProducts, runBqSync, loadMarketingPolicies])

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
  // 週の表示に出ている配信(絞り込みのあと)。週の枠の帯は、見えている枠だけを数える
  const weekVisibleIds = useMemo(() => new Set(weekRows.map((r) => r.card.id)), [weekRows])
  // 週の状態: この週の行と、この週のすべての配信(絞り込みに関係なく、週の単位で進める)
  const weekKey = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`
  const weekEvents = useMemo(() => events.filter((e) => e.week_start?.slice(0, 10) === weekKey), [events, weekKey])
  const thisWeek = weeks.find((w) => w.week_start?.slice(0, 10) === weekKey)
  const weekCards = useMemo(() => {
    const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7)
    return activeCards.filter((c) => c.scheduled_at && new Date(c.scheduled_at) >= weekStart && new Date(c.scheduled_at) < end)
  }, [activeCards, weekStart])
  // まとめて作る作業画面(W14 の作り直し)。中身のない枠は保存せず、中身ができた配信から下書きとして保存する
  const bulk = useBulkWorkspace({
    cards: activeCards,
    cardProducts,
    products,
    heroes,
    weeks,
    defaults: { country: filters.country, channel: filters.channel },
    onChanged: load,
  })
  // 週の枠と、まとめて AI で中身を作る(W14)。枠は、中身のない配信カードとして保存する。作業画面と比べるために残す
  const frames = useWeekFrames({
    cards: activeCards,
    cardProducts,
    products,
    heroes,
    weeks,
    weekStart,
    defaults: { country: filters.country, channel: filters.channel },
    onChanged: load,
  })
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
    [weekStart, weekCards, cards, cardProducts, products, policies, questionCounts, commentCounts, lang],
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
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() - 7)
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return weeks.find((w) => w.week_start?.slice(0, 10) === k)
  }, [weeks, weekStart])
  // 週の振り返りのメモを保存する(週の行がなければ、下書きの行を作る)
  const saveRetro = async (key: string, row: WeekRow | undefined, text: string): Promise<boolean> => {
    setError(null)
    const res = row ? await WeeksService.update(row.id, { retro: text }) : await WeeksService.create({ week_start: key, status: 'draft', retro: text })
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
      const res = thisWeek ? await WeeksService.update(thisWeek.id, fields) : await WeeksService.create({ week_start: weekKey, ...fields })
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
        note: moved.join(' / ') || undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    await load()
  }
  // 週の承認(U6): 未依頼の配信をまとめて依頼する / 自分宛ての依頼をまとめて承認する(配信カードと同じ窓口 /api/approvals を、順に呼ぶ)
  const actor = () => ({ id: myUserId(), name: myName() })
  // まとめて依頼の対象。中身のない週の枠(W14)は、承認するものがないので外す(中身を作ってから依頼する)
  const requestable = needsRequest(weekCards.filter((c) => !frames.frameIds.has(c.id)), inbox.hasOpen)
  const requestWeek = async () => {
    // まだ誰も確かめていない AI の下書き(W14)が入っていれば、依頼の前に知らせる(確かめずに承認者へ回さないように)
    const unchecked = requestable.filter((c) => !!c.ai_unchecked_at).length
    if (
      unchecked > 0 &&
      !window.confirm(
        tr(
          `依頼する配信のうち ${unchecked} 本は、AI でまとめて作り、まだ誰も確かめていない下書きです(「AI 下書き・未確認」)。このまま依頼しますか?`,
          `${unchecked} of the deliveries to request are AI drafts nobody has checked yet (“AI draft, unchecked”). Request anyway?`,
        ),
      )
    )
      return
    setError(null)
    try {
      const { skipped } = await requestAll(requestable, people, actor(), weekKey)
      if (skipped.length) setError(tr(`既定の承認者がない種別の配信は飛ばしました(配信カードから依頼してください): ${skipped.join(' / ')}`, `Skipped deliveries whose type has no default approvers (request from the card): ${skipped.join(' / ')}`))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    await load()
  }
  const approveMineWeek = async () => {
    setError(null)
    try {
      await approveMine(inbox.mineFor(weekCards.map((c) => c.id)), actor(), weekKey)
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
    card: selectedId ?? undefined,
    tab: selectedId ? cardTab : undefined,
    result: page === 'results' ? (resultDetail ?? undefined) : undefined,
    production: productionOpen ?? undefined,
    alerts: alertsOpen ? (alertsFocus ?? '') : undefined,
  }
  const search = linkSearch(linkState)
  const floatKey = (l: Partial<LinkState>) => [l.card, l.result, l.production, l.alerts].join('|')
  const currentFloat = floatKey(linkState)
  useEffect(() => {
    if (search === window.location.search) return
    const url = `${window.location.pathname}${search}${window.location.hash}`
    // フロートを新しく開いた(別のものに替えた)ときは履歴に積み、「戻る」で閉じられるようにする。ほかは書き換えるだけ
    const before = parseLink(window.location.search)
    if (hasFloat(linkState) && floatKey(before) !== currentFloat) window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  useEffect(() => {
    const onPop = () => {
      const l = parseLink(window.location.search)
      setPage(l.page ?? 'calendar')
      if (l.view) setView(l.view)
      const d = dateOf(l.date)
      if (d) {
        const mid = l.view === 'week' ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3) : d
        setWeekStart(sundayOf(d))
        setMonth(new Date(mid.getFullYear(), mid.getMonth(), 1))
      }
      if (l.country !== undefined) setFilters((f) => ({ ...f, country: l.country! }))
      setSelectedId(l.card ?? null)
      setCreating(null)
      setDraftOpen(null)
      setResultDetail(l.result ?? null)
      setProductionOpen(l.production ?? null)
      setAlertsOpen(l.alerts !== undefined)
      setAlertsFocus(l.alerts || undefined)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
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
      const key = dayKeyOf(sun)
      if (weeks.find((w) => w.week_start?.slice(0, 10) === key)?.status === 'confirmed') continue
      const end = new Date(sat.getFullYear(), sat.getMonth(), sat.getDate() + 1)
      const n = activeCards.filter((c) => c.scheduled_at && new Date(c.scheduled_at) >= sun && new Date(c.scheduled_at) < end).length
      if (!best || n < best.n) best = { sun, n }
    }
    return best?.sun
  }, [month, weeks, activeCards])
  // 月の要約の帯(X25): 表示中の月の配信(絞り込みを反映しない。週の帯と同じ)の状態ごとの件数と、月にかかる週のうち確定した週の数
  const monthSummary = useMemo(() => {
    if (!month) return undefined
    const first = new Date(month.getFullYear(), month.getMonth(), 1)
    const next = new Date(month.getFullYear(), month.getMonth() + 1, 1)
    const inMonth = activeCards.filter((c) => c.scheduled_at && new Date(c.scheduled_at) >= first && new Date(c.scheduled_at) < next)
    const sundays: Date[] = []
    for (let sun = sundayOf(first); sun < next; sun = new Date(sun.getFullYear(), sun.getMonth(), sun.getDate() + 7)) sundays.push(sun)
    const isConfirmed = (sun: Date) => weeks.find((w) => w.week_start?.slice(0, 10) === dayKeyOf(sun))?.status === 'confirmed'
    return { cards: inMonth, sundays, confirmed: sundays.filter(isConfirmed).length, firstOpen: sundays.find((d) => !isConfirmed(d)) }
  }, [month, activeCards, weeks])
  const monthBar = monthSummary && (
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
  const setFilter = (k: keyof Filters) => (v: string) => setFilters({ ...filters, [k]: v })
  // 種類(テーマの種類)が決まっていない配信を、AI で分ける(X41)。国の設定にかかわらず、すべての配信が対象
  const untypedCards = useMemo(() => cards.filter((c) => !c.theme_type), [cards])
  const [classifying, setClassifying] = useState(false)
  const classifyAll = async () => {
    setClassifying(true)
    try {
      let done = 0
      // 一度に多く渡すと、返答が途中で切れることがあるので、20 本ずつ
      for (let i = 0; i < untypedCards.length; i += 20) {
        const types = await classifyThemeTypes(untypedCards.slice(i, i + 20))
        for (const [id, type] of types) if ((await DeliveryCardsService.update(id, { theme_type: type })).success) done++
      }
      await load()
      setBqNotice({ intent: 'success', text: tr(`${done} 本の配信の種類を、AI が分けました`, `AI sorted the type of ${done} deliveries`) })
    } catch (e) {
      setBqNotice({ intent: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setClassifying(false)
    }
  }
  const [autoDraft, setAutoDraft] = useState(loadAutoDraft)
  useTemplates() // テンプレートの登録が変わったら、画面全体を描き直す
  // ユーザーが作ったテンプレートを読み込む(読めなくても、標準のテンプレートで動く)
  useEffect(() => {
    loadCustomTemplates().catch(() => undefined)
  }, [])
  // 国はヘッダーの設定なので、絞り込みの「クリア」の対象にしない
  const filtering = filters.channel !== '' || filters.department !== '' || (page !== 'results' && filters.status !== '') || filters.person !== ''
  // 担当の候補: いちばん上に「自分」(ログインしている人。Jira の Me と同じ)
  const personOptions = [{ value: ME_PERSON, label: me ? t(`自分(${me})`, `Me (${me})`) : t('自分', 'Me') }, ...owners.map((o) => ({ value: o, label: o }))]
  // 新規作成の初期値: 絞り込み中の国・チャネル・種別を引き継ぐ(その条件の配信を作ることが多いため)
  const newCardDefaults = (scheduledAt?: string): NewCardDefaults => ({
    ...(scheduledAt ? { scheduledAt } : {}),
    ...(filters.country ? { country: filters.country } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.department ? { themeType: filters.department } : {}),
  })

  return (
    <>
      <TemplateManager />
      <PolicyManager open={policyOpen} onClose={() => setPolicyOpen(false)} onImported={() => void loadMarketingPolicies()} />
      <PeopleManager />
      {/* 初めて開いたとき、だれでログインするかを選んでもらう(U9) */}
      <SignInDialog />
      <div className={styles.headerWrap}>
      <header className={styles.header}>
        <CalendarLtrRegular fontSize={24} className={styles.headerIcon} />
        <h1 className={styles.title}>{t('コンテンツプランナー', 'Contents Planner')}</h1>
        {/* 国(X33): どの国の仕事をしているか。担当の国は、決めたらあまり変えない。全体を見る人は「すべての国」 */}
        <Menu positioning="below-start" checkedValues={{ country: [filters.country] }} onCheckedValueChange={(_, d) => setCountry(d.checkedItems[0] ?? '')}>
          <MenuTrigger disableButtonEnhancement>
            <button type="button" className={styles.countryBtn} aria-label={t(`国: ${filters.country || 'すべての国'}`, `Country: ${filters.country || 'All countries'}`)} title={t('どの国の配信を扱うか(画面のすべてに効きます。次に開いたときも同じ国)', 'Which country you work on (applies to the whole app and is remembered)')}>
              <GlobeRegular className={styles.countryIcon} />
              {filters.country ? optionLabel(countryOptions.find((o) => String(o.value) === filters.country)?.label ?? filters.country) : t('すべての国', 'All countries')}
              <ChevronDownRegular className={styles.countryChevron} />
            </button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItemRadio name="country" value="">{t('すべての国', 'All countries')}</MenuItemRadio>
              {countryOptions.map((o) => (
                <MenuItemRadio key={o.value} name="country" value={String(o.value)}>{optionLabel(o.label)}</MenuItemRadio>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
        <span className={styles.headerSpacer} />
        {/* アラート: 配信に影響する変更(いまは在庫)。件数は、どの画面からも見えるように、ヘッダーに出す */}
        <Tooltip content={t('配信に影響する変更(在庫切れ・在庫僅少・MD 方針の変更・日程の変更)', 'Changes that affect deliveries (stock, MD policy, dates)')} relationship="description">
          <Button
            appearance={alertsOpen ? 'primary' : 'subtle'}
            size="small"
            icon={<AlertRegular />}
            onClick={() => setAlertsOpen(true)}
          >
            {t('アラート', 'Alerts')}
            {alertCount > 0 && (
              <Badge size="small" appearance="filled" color={alerts.some((a) => a.kind === 'outOfStock') ? 'danger' : 'warning'} style={{ marginLeft: 6 }}>
                {alertCount}
              </Badge>
            )}
          </Button>
        </Tooltip>
        {/* 自分宛ての承認の依頼(U5)。メールが届かない段階でも、依頼に気づけるように、ヘッダーに出す */}
        <InboxButton inbox={inbox} onOpenCard={setSelectedId} />
        {/* 作る操作は、ここにまとめる。ボタンの本体で 1 本を新規作成、▾ で、この週の枠を作る(W14。週の表示のときだけ選べる) */}
        <Menu positioning="below-end">
          <MenuTrigger disableButtonEnhancement>
            {(triggerProps: MenuButtonProps) => (
              <SplitButton
                appearance="primary"
                size="small"
                icon={<AddRegular />}
                menuButton={{ ...triggerProps, 'aria-label': t('新規作成のほかの方法', 'More ways to create') }}
                primaryActionButton={{ onClick: () => setCreating(newCardDefaults()) }}
              >
                {t('新規作成', 'New')}
              </SplitButton>
            )}
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<AddRegular />} onClick={() => setCreating(newCardDefaults())}>
                {t('配信を 1 本、新規作成', 'New delivery')}
              </MenuItem>
              <MenuItem icon={<AiIcon size={16} />} secondaryContent={t('作業画面', 'Workspace')} onClick={() => bulk.openFor(weekStart)}>
                {t('まとめて作る(週・国・チャネルを選び、AI で中身まで)', 'Create in bulk (week, country & channel, then AI content)')}
              </MenuItem>
              <MenuItem
                icon={<AiIcon size={16} />}
                disabled={!canBulk}
                secondaryContent={canBulkReason}
                onClick={frames.openSetup}
              >
                {t('この週の枠を作る(週の表示の上で作る、これまでの形)', 'Create slots for this week (in the week view, previous way)')}
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
        {/* ログインしている人(U9)。履歴・依頼・承認・やり取りは、すべてこの人で残す(ほかの画面では人を選ばせない) */}
        <MePicker className={styles.headerMe} ariaLabel={t('ログインしている人', 'Signed-in user')} />
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
              <MenuItem icon={<PeopleTeamRegular />} onClick={openPeopleManager}>
                {t('ユーザーと承認グループ', 'Users and approval groups')}
              </MenuItem>
              <MenuDivider />
              {/* システム全体のデータの出入り。いま見ている画面への操作(CSV の書き出し・結果の取り込み)は、ツールバー右端の「この画面 ▾」 */}
              <MenuGroup>
                <MenuGroupHeader>{t('データ', 'Data')}</MenuGroupHeader>
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
              {/* 種類(テーマの種類)が決まっていない配信を、AI で分ける(X41。これまでの配信の書き換え。決まっている配信は触らない) */}
              <MenuItem icon={<AiIcon size={16} />} disabled={classifying || untypedCards.length === 0} secondaryContent={t(`${untypedCards.length} 本`, `${untypedCards.length}`)} onClick={() => void classifyAll()}>
                {classifying ? t('種類を分けています…', 'Sorting types…') : t('種類が未設定の配信を、AI で分ける', 'Sort untyped deliveries with AI')}
              </MenuItem>
              {/* BigQuery からの取り込み(設定がある環境だけ)。開いたときにも自動で確かめるが、すぐに読み直したいとき用。時刻は在庫のデータの時点 */}
              {bq?.configured && (
                <MenuItem icon={<ArrowSyncRegular />} disabled={bqBusy} secondaryContent={bqStockTime(bq) ?? ''} onClick={() => void runBqSync(true)}>
                  {bqBusy ? t('BigQuery から取り込み中…', 'Importing from BigQuery…') : t('BigQuery から取り込む', 'Import from BigQuery')}
                </MenuItem>
              )}
              </MenuGroup>
              <MenuDivider />
              {/* マーケティングポリシー(方針・決まり)の取り込みと一覧(M3・M4) */}
              <MenuItem icon={<DocumentBulletListRegular />} onClick={() => setPolicyOpen(true)}>
                {t('方針・決まり(取り込み・一覧)', 'Marketing policies (import, list)')}
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
      {/* 作業の段(X42・X43): ヘッダー(システム全体)とは分け、その下に置く。左端に面の切り替え、続いて見ている画面の配信の絞り込み */}
        <div className={styles.filterBar}>
        {/* 計画・制作・結果の切り替え(X43): ヘッダー(システム全体)ではなく、作業の段の左端。同じ期間・見せ方・絞り込みのまま、面だけを切り替える */}
        <div className={styles.faceSwitch} role="tablist" aria-label={t('計画と結果', 'Plan and results')}>
          {(
            [
              ['calendar', t('計画', 'Plan'), <CalendarLtrRegular key="i" />],
              ['production', t('制作', 'Production'), <PaintBrushRegular key="i" />],
              ['results', t('結果', 'Results'), <DataBarVerticalRegular key="i" />],
            ] as const
          ).map(([p, label, icon]) => (
            <button key={p} type="button" role="tab" aria-selected={page === p} className={mergeClasses(styles.faceBtn, page === p && styles.faceBtnOn)} style={page === p ? { color: FACE_COLOR[p] } : undefined} onClick={() => showFace(p)}>
              {icon}
              {label}
            </button>
          ))}
        </div>
        <span className={styles.filterBarDivider} aria-hidden />
        <span className={styles.filterBarLabel}>{t('絞り込み', 'Filters')}</span>
          <FilterSelect label={t('チャネル', 'Channel')} value={filters.channel} options={channelOptions} onChange={setFilter('channel')} />
          <FilterSelect label={t('種類', 'Type')} value={filters.department} options={THEME_TYPES.map((v) => ({ value: v, label: themeTypeLabel(v) }))} onChange={setFilter('department')} />
          {/* ステータス(未起案・承認待ち・承認済み)は計画の面だけ。結果の面は送ったあとの配信なので、絞り込みも効かせない */}
          {page !== 'results' && <FilterSelect label={t('ステータス', 'Status')} value={filters.status} options={statusOptions} onChange={setFilter('status')} />}
          <FilterSelect label={t('担当', 'Person')} value={filters.person} options={personOptions} onChange={setFilter('person')} />
          {filtering && <Button size="small" appearance="subtle" onClick={() => setFilters({ ...noFilter, country: filters.country })}>{t('クリア', 'Clear')}</Button>}
        </div>
      {/* 面の帯(X38): いまどの面にいるかを、面の色の線とロゴ風の名前で示す */}
      <div className={styles.faceBand} style={{ backgroundColor: FACE_TINT[face], borderBottomColor: FACE_COLOR[face] }}>
        <span className={styles.faceLogo} style={{ color: FACE_COLOR[face] }}>{FACE_LOGO[face]}</span>
        <span className={styles.faceHint}>
          {{ calendar: t('配信の企画と承認', 'Plan and approve deliveries'), production: t('制作の依頼と進み具合', 'Production requests and progress'), results: t('送ったあとの数字と振り返り', 'Numbers and lessons after sending') }[face]}
        </span>
      </div>
      </div>
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
        {bqNotice && (
          <MessageBar layout="multiline" intent={bqNotice.intent} className={styles.alert}>
            <MessageBarBody>{bqNotice.text}</MessageBarBody>
            <MessageBarActions
              containerAction={<Button appearance="transparent" size="small" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={() => setBqNotice(null)} />}
            />
          </MessageBar>
        )}
        {!loading && !error && month && (
          <>
            {/* アラートの画面は、期間・見せ方を使わないので、ツールバーを出さない */}
            {page !== 'alerts' && (
            <>
            <div className={styles.monthRow}>
              <Button appearance="subtle" size="small" icon={<ChevronLeftRegular />} disabled={view === 'compare'} onClick={() => shift(-1)} aria-label={view === 'week' ? t('前の週', 'Previous week') : t('前の月', 'Previous month')} />
              <span className={mergeClasses(styles.monthLabel, lang === 'ja' ? styles.weekLabelJa : styles.weekLabel)}>
                {view === 'compare' ? (
                  t('絞り込んで比べる', 'Filter and compare')
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
              <Button appearance="subtle" size="small" icon={<ChevronRightRegular />} disabled={view === 'compare'} onClick={() => shift(1)} aria-label={view === 'week' ? t('次の週', 'Next week') : t('次の月', 'Next month')} />
              {/* 結果の面の「先週を振り返る」: 振り返りは先週から始まるので、1 回で先週の週表示へ(FLOWS の C-7)。
                  「前週」だけでは、比べる相手の切り替えにも見えるので、何が起きるかを名前にする */}
              {page === 'results' && (
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
              {/* 週の見方: 見せ方の切り替えのすぐ外に、ラベルを付けて置く。計画の面の週の表示だけで使い、計画の面のほかの表示では選べないだけにする。
                  結果の面では出さない(結果の面では使わないため。ここから右は、結果の面だけの凡例・まとめ方なので、ずれても困らない) */}
              {page !== 'results' && (
              <span className={styles.lensGroup}>
                <span className={mergeClasses(styles.lensLabel, !lensOn && styles.lensLabelOff)}>{t('週の見方', 'Week lens')}</span>
                <div className={mergeClasses(styles.lensSwitch, !lensOn && styles.lensOff)} role="group" aria-label={t('週の見方', 'Week lens')} aria-disabled={!lensOn}>
                  {([['products', t('商品', 'Products')], ['progress', t('進み具合', 'Progress')]] as const).map(([v, name]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={lensOn && lens === v}
                      disabled={!lensOn}
                      title={!lensOn ? t('週の表示で使えます', 'Available in the week view') : undefined}
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
              )}
              {/* ここから右は、操作(書き出しなど)。切り替えと分けて見えるよう、区切りの線を置く */}
              <span className={styles.toolbarDivider} aria-hidden />
              <span ref={setToolbarSlot} className={styles.toolbarSlot} />
              {/* この画面 ▾: いま見ているものへの操作(書き出し・取り込み・列・週の資料と履歴)。どの面・見せ方でも、右端の同じ位置。システム全体の設定は ⚙ */}
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
                      {/* 週の枠を作る(X24 を W14 の枠の形に読み替え。2026-10-19)。週は表示中の週、月・一覧は「この月の空いている週から」(その週に移ってから、枠を作るステップを開く)。「新規作成 ▾」にも同じ入口がある */}
                      {page === 'calendar' && view === 'week' && (
                        <MenuItem icon={<AiIcon size={16} />} disabled={!canBulk} onClick={frames.openSetup} secondaryContent={canBulkReason || t('表示中の週', 'This week')}>
                          {t('この週の枠を作る', 'Create frames for this week')}
                        </MenuItem>
                      )}
                      {page === 'calendar' && view !== 'week' && (
                        <MenuItem
                          icon={<AiIcon size={16} />}
                          disabled={!monthBulkWeek}
                          onClick={() => {
                            if (!monthBulkWeek) return
                            goTo('week', monthBulkWeek)
                            frames.openSetup()
                          }}
                          secondaryContent={
                            monthBulkWeek
                              ? t(`${monthBulkWeek.getMonth() + 1}/${monthBulkWeek.getDate()} の週へ`, `Week of ${monthBulkWeek.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })}`)
                              : t('作れる週がありません', 'No week to plan')
                          }
                        >
                          {t('この月の空いている週から、枠を作る', 'Create frames from an open week in this month')}
                        </MenuItem>
                      )}
                      {page === 'calendar' && <MenuDivider />}
                      {page === 'calendar' && (
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
                          <MenuItem icon={<DocumentPdfRegular />} disabled={weekCards.length === 0} onClick={() => setPrintingWeek(true)} secondaryContent={t('表示中の週', 'This week')}>
                            {t('週の資料を PDF で書き出す', 'Export the week handout (PDF)')}
                          </MenuItem>
                          <MenuItem icon={<HistoryRegular />} onClick={() => setHistoryOpen(true)} secondaryContent={t(`${weekEvents.length} 件`, `${weekEvents.length}`)}>
                            {t('この週の承認の履歴', 'Approval history for this week')}
                          </MenuItem>
                        </>
                      )}
                      {page === 'results' && resultsData && (
                        <>
                          <MenuItem icon={<ArrowDownloadRegular />} disabled={!resultsData.canExport} onClick={resultsData.exportCsv} secondaryContent={t('表示中の結果', 'Results shown')}>
                            {t('結果を CSV で書き出す', 'Export results as CSV')}
                          </MenuItem>
                          <MenuItem icon={<ArrowUploadRegular />} onClick={resultsData.importCsv}>
                            {t('結果を取り込む(CSV)', 'Import results (CSV)')}
                          </MenuItem>
                          <MenuItem onClick={resultsData.downloadSample} secondaryContent={resultsData.sampleColumns + t(' 列', ' columns')}>
                            {t('取り込みの見本を書き出す', 'Download a sample CSV')}
                          </MenuItem>
                          <MenuItem icon={<AiIcon size={16} />} disabled={resultsData.classifying || resultsData.untyped === 0} onClick={resultsData.classify} secondaryContent={resultsData.classifying ? t('分けています…', 'Sorting…') : t(`${resultsData.untyped} 件`, `${resultsData.untyped}`)}>
                            {t('AI でテーマの種類を分ける', 'Sort theme types with AI')}
                          </MenuItem>
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
            </div>
            </>
            )}
            {/* 日付から作るときは、その日の 10:00 を配信日時にする(過去の日付でも作れる) */}
            {page === 'results' ? (
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
                onOpenWeek={(d) => goTo('week', d)}
                onDataActions={setResultsData}
                retro={<WeekRetro mode="results" text={thisWeek?.retro ?? ''} onSave={(text) => saveRetro(weekKey, thisWeek, text)} />}
              />
            ) : view === 'list' ? (
              <>
              {monthBar}
              <ListView rows={monthRows} columns={columns} onSelect={openCard} cardProducts={cardProducts} products={products} heroes={heroes} stateOf={onProduction ? productionState : undefined} />
              </>
            ) : view === 'week' ? (
              <>
              {/* 承認のバーと週の振り返りは、計画の面だけ(制作の面では、制作の状態を箱の色で見る) */}
              {!onProduction && (
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
              {!onProduction && <FrameBar frames={frames} weekStart={weekStart} weeks={weeks} visibleIds={weekVisibleIds} />}
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
                onSelect={openCard}
                stateOf={onProduction ? productionState : undefined}
                renderMeta={onProduction ? productionMeta : undefined}
                // 下書きモードでは、日の「＋」で、その日に下書きを足す
                onCreate={(day) => setCreating(newCardDefaults(`${day}T10:00`))}
                // 中身のない配信(週の枠)は、その場で配信名・種類を入れられる形で出す(W14)
                renderCard={(c) => (frames.frameIds.has(c.id) ? <FrameCard key={`${c.id}:${c.name}`} card={c} frames={frames} onOpen={setSelectedId} /> : null)}
                onCheck={frames.openCheck}
              />
              </>
            ) : (
              <>
              {monthBar}
              <Calendar
                month={month}
                cards={filtered}
                dueSoon={dueSoon}
                alertKinds={alertKinds}
                onSelect={openCard}
                onCreate={(day) => setCreating(newCardDefaults(`${day}T10:00`))}
                onOpenWeek={(d) => goTo('week', d)}
                // 制作の面: 箱の色は制作の状態、2 行目は状態と締め切り(PR4)
                chipTone={onProduction ? productionTone : undefined}
                renderMeta={onProduction ? productionMeta : undefined}
              />
              </>
            )}
          </>
        )}
      </div>
      {/* アラート(フロート)。配信カードより先に置く(ここから開いた配信カードが、上に重なるように) */}
      <WeekHistory open={historyOpen} onClose={() => setHistoryOpen(false)} events={weekEvents} />
      <AlertsFloat open={alertsOpen} onClose={() => { setAlertsOpen(false); setAlertsFocus(undefined) }}>
        <AlertsPage initialProductId={alertsFocus} onSelectProduct={setAlertsFocus} onOpenAlertCard={openFromAlert} alerts={alerts} changeAlerts={changeAlerts} onResolve={(a, note) => changeState.resolve(a, myName(), note)} settings={alertSettings} owners={owners} logs={changeState.logs} cards={cards} products={products} heroes={heroes} cardProducts={cardProducts} placements={alertState.placements} model={alertState.model} weeks={weeks} onOpenCard={setSelectedId} onChanged={load} />
      </AlertsFloat>
      {/* まとめて作る作業画面。配信カードより先に置く(ここから開いた配信カードが、上に重なるように) */}
      <BulkWorkspace
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
      />
      {(selected || creating || draftOpen) && (
        <CardDetail
          key={selected?.id ?? (draftOpen ? `draft:${draftOpen.day}` : 'new')}
          card={selected}
          defaults={creating ?? undefined}
          draft={selected ? undefined : draftOpen?.draft}
          onCreated={(id) => {
            if (draftOpen) bulk.markSaved(draftOpen.day, id)
          }}
          products={products}
          heroes={heroes}
          otherThemes={cards.filter((c) => c.id !== selected?.id && c.theme).map((c) => c.theme!)}
          weeks={weeks}
          owners={owners}
          onBack={() => {
            setFocusProduct(undefined)
            setSelectedId(null)
            setCreating(null)
            setDraftOpen(null)
            // 質問・返信は、保存を待たずに書き込むので、閉じたときにも読み直す
            void load()
          }}
          onSaved={load}
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
          onOpenProduction={(id) => goStage(id, 'production')}
          stageNav={selected ? stageNav(selected, 'calendar') : undefined}
          initialTab={selected && selected.id === link.card ? link.tab : undefined}
          onTabChange={setCardTab}
          next={nextOf === undefined ? undefined : nextOf && { name: nextOf.name, position: nextOf.position }}
          onNext={() => {
            if (!nextOf) return
            setFocusProduct(undefined)
            setSelectedId(nextOf.id)
          }}
        />
      )}
      {/* AI でまとめて作った配信を、確かめる引き出し(W14) */}
      <CheckDrawer frames={frames} cards={activeCards} cardProducts={cardProducts} products={products} heroes={heroes} onOpen={setSelectedId} />
      {peekResult && (
        <ResultPeek cardId={peekResult} cards={cards} cardProducts={cardProducts} products={products} heroes={heroes} onClose={() => setPeekResult(null)} stageNav={(c) => stageNav(c, 'results')} />
      )}
      {/* 制作のページ(PR3)。制作の面の箱、または配信カードの「制作の依頼」の札から開く。配信カードの上に重なる */}
      {productionOpen && cards.find((c) => c.id === productionOpen) && (
        <ProductionPage
          key={`${productionOpen}:${productionKey}`}
          card={cards.find((c) => c.id === productionOpen)!}
          productIds={cardProducts.get(productionOpen) ?? []}
          products={products}
          heroes={heroes}
          people={owners}
          onClose={() => setProductionOpen(null)}
          onOpenCard={(id) => goStage(id, 'calendar')}
          onChanged={() => void production.reload()}
          stageNav={stageNav(cards.find((c) => c.id === productionOpen)!, 'production')}
        />
      )}
    </>
  )
}

export default App
