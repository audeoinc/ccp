import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Select,
  Spinner,
  Tab,
  TabList,
  ToggleButton,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowClockwiseRegular,
  CheckmarkCircleFilled,
  ChevronDownRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
  LockClosedRegular,
  MailRegular,
  PhoneRegular,
  SaveRegular,
  WarningFilled,
} from '@fluentui/react-icons'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import type { WeekRow } from './data/weeks'
import { locale, optionLabel, useLang, useT } from './i18n'
import { AiIcon } from './AiMark'
import { CardPreview } from './CardPreview'
import { FitPreview } from './FitPreview'
import { DeliveryPeek } from './DeliveryPeek'
import { MiniCalendar } from './MiniCalendar'
import { MarkdownLite } from './MarkdownLite'
import { WeekChecklist } from './WeekChecklist'
import { CardDetail, type NewCardDefaults } from './CardDetail'
import { buildChecklist, type CheckKey, type PolicyLite } from './reviewChecks'
import { CHANNEL_EMAIL, CHANNEL_PUSH, channelOptions, countryOptions, departmentOptions } from './status'
import { getTemplate } from './templates'
import { dayKeyOf, sundayOf } from './weekLock'
import { logEvent } from './history'
import {
  BULK_MAX,
  BULK_PARALLEL,
  BULK_TIME,
  draftCard,
  draftId,
  draftName,
  draftProductIds,
  emptyDays,
  generateDraft,
  loadBackup,
  lockedWeekOf,
  newDraft,
  overusedInWeek,
  saveBackup,
  saveDraft,
  type Draft,
} from './bulkDraft'

const useStyles = makeStyles({
  surface: {
    position: 'fixed',
    inset: 0,
    margin: 'auto',
    padding: 0,
    overflow: 'hidden',
    maxWidth: 'none',
    width: 'min(1700px, 98vw)',
    height: '92vh',
    maxHeight: '92vh',
    '@media (max-width: 899px)': { width: '100vw', height: '100vh', maxHeight: '100vh', borderRadius: 0 },
  },
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  titleRow: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '12px 12px 12px 20px' },
  title: { flexGrow: 1, fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightSemibold, display: 'flex', alignItems: 'center', columnGap: '6px' },
  body: {
    flexGrow: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: '400px minmax(0, 1fr)',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    '@media (max-width: 899px)': { gridTemplateColumns: '1fr', overflow: 'auto' },
  },
  left: { display: 'flex', flexDirection: 'column', minHeight: 0, borderRight: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2 },
  leftHead: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '10px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  rows: { flexGrow: 1, overflow: 'auto', display: 'grid', alignContent: 'start', rowGap: '8px', padding: '10px 12px' },
  // 行(作る配信 1 本)。選んでいる行は、枠の色を変える
  row: {
    display: 'grid',
    rowGap: '6px',
    padding: '8px 10px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px dashed ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
  },
  rowOn: { border: `2px dashed ${tokens.colorBrandStroke1}`, padding: '7px 9px' },
  rowSaved: { border: `1px solid ${tokens.colorNeutralStroke2}`, opacity: 0.7 },
  rowLine: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  date: { flexGrow: 1, minWidth: 0 },
  sel: { minWidth: 0, width: '96px' },
  selWide: { minWidth: 0, flexGrow: 1 },
  status: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2, minWidth: 0 },
  statusText: { flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  themeText: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1 },
  errorText: { color: tokens.colorPaletteRedForeground1 },
  lockText: { color: tokens.colorPaletteDarkOrangeForeground1 },
  savedText: { color: tokens.colorPaletteGreenForeground1 },
  right: { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 },
  toolbar: { display: 'flex', alignItems: 'center', columnGap: '6px', rowGap: '4px', flexWrap: 'wrap', padding: '8px 12px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  range: { width: '230px' },
  spacer: { flexGrow: 1 },
  pane: { flexGrow: 1, minHeight: 0, overflow: 'auto', padding: '12px' },
  // 並び(週): 7 日の列
  week: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground1 },
  col: { display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: `1px solid ${tokens.colorNeutralStroke2}`, ':last-child': { borderRight: 'none' } },
  colHead: { padding: '6px 8px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground2, backgroundColor: tokens.colorNeutralBackground2, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', alignItems: 'center', columnGap: '4px' },
  colBody: { display: 'grid', alignContent: 'start', rowGap: '6px', padding: '6px', minHeight: '260px' },
  // 配信の札。保存済みは実線、下書きは破線(色でなく形で見分ける)。アプリは角を大きく丸める(週の表示と同じ)
  chip: {
    display: 'grid',
    rowGap: '2px',
    padding: '5px 7px',
    textAlign: 'left',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground2,
    minWidth: 0,
    cursor: 'default',
  },
  chipDraft: { border: `1.5px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, cursor: 'pointer' },
  chipOn: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px' },
  chipPush: { borderRadius: '12px' },
  chipFocus: { outline: `2px solid ${tokens.colorPaletteDarkOrangeBorder2}`, outlineOffset: '1px' },
  chipLine: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0 },
  chipName: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  chipSub: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  draftTag: { flexShrink: 0, padding: '0 4px', borderRadius: tokens.borderRadiusSmall, border: `1px dashed ${tokens.colorBrandStroke1}`, color: tokens.colorBrandForeground1, fontSize: '10px', lineHeight: '14px' },
  // 並び(月)
  month: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusLarge, overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground1 },
  mCell: { display: 'grid', alignContent: 'start', rowGap: '3px', minHeight: '86px', padding: '4px', borderRight: `1px solid ${tokens.colorNeutralStroke2}`, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  mDay: { fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground3, border: 'none', background: 'none', padding: 0, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit' },
  mOut: { backgroundColor: tokens.colorNeutralBackground2 },
  checklist: { marginTop: '12px' },
  // 中身
  content: { display: 'grid', gridTemplateColumns: '380px minmax(0, 1fr)', columnGap: '16px', alignItems: 'start', '@media (max-width: 1199px)': { gridTemplateColumns: '1fr', rowGap: '12px' } },
  previewBox: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, padding: '8px', backgroundColor: tokens.colorNeutralBackground2, display: 'grid', justifyItems: 'center' },
  facts: { display: 'grid', rowGap: '10px', minWidth: 0 },
  factHead: { display: 'flex', alignItems: 'center', columnGap: '8px', flexWrap: 'wrap' },
  label: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  value: { fontSize: '12px', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
  md: { fontSize: '12px', overflowWrap: 'anywhere' },
  reason: { fontSize: '12px', color: tokens.colorNeutralForeground3, whiteSpace: 'pre-wrap' },
  h3: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  secBox: { display: 'grid', rowGap: '4px', padding: '8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}` },
  list: { margin: 0, paddingLeft: '18px', fontSize: '12px' },
  muted: { color: tokens.colorNeutralForeground3, fontSize: '12px' },
  // 比べる
  compare: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', columnGap: '12px', rowGap: '12px', alignItems: 'start' },
  cmpCol: { display: 'grid', rowGap: '6px', padding: '8px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  cmpColDraft: { border: `1.5px dashed ${tokens.colorBrandStroke1}` },
  cmpRole: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  same: { display: 'inline-flex', alignItems: 'center', columnGap: '3px', color: tokens.colorPaletteDarkOrangeForeground1, fontSize: '12px', fontWeight: tokens.fontWeightSemibold },
  prod: { fontSize: '12px', padding: '1px 4px', borderRadius: tokens.borderRadiusSmall, border: '1px solid transparent' },
  // 重なる商品は、枠で囲む(色だけに頼らない)
  prodHit: { border: `1.5px solid ${tokens.colorPaletteDarkOrangeBorder2}`, fontWeight: tokens.fontWeightSemibold },
  // 下の操作(いつも見える位置に固定する)
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '10px 20px', backgroundColor: tokens.colorNeutralBackground1 },
  count: { marginRight: 'auto', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground2 },
  note: { margin: '8px 12px 0' },
  askActions: { '& button': { whiteSpace: 'nowrap', flexShrink: 0 } },
})

interface Props {
  /** すべての配信(取りやめを除く) */
  cards: DeliveryCard[]
  cardProducts: Map<string, string[]>
  products: Product[]
  heroes: HeroImage[]
  weeks: WeekRow[]
  policies: Map<string, PolicyLite>
  questionCounts: Map<string, number>
  commentCounts: Map<string, number>
  /** 開いたときに見る週(カレンダーで見ていた週) */
  initialWeek: Date
  /** 国・チャネル・種別の初期値(絞り込み中の条件) */
  defaults: NewCardDefaults
  owners: string[]
  onClose: () => void
  /** 保存したら、配信を読み直す */
  onSaved: () => Promise<void>
}

type Tab = 'layout' | 'content' | 'compare'
const timeOf = (iso?: string) => (iso ? new Date(iso).getTime() : 0)
const norm = (s?: string) => (s ?? '').trim().replace(/\s+/g, ' ')
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const mostCommon = (vs: string[]) => {
  const n = new Map<string, number>()
  for (const v of vs.filter(Boolean)) n.set(v, (n.get(v) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]
}

/**
 * 複数の配信カードを、まとめて AI で作るパネル(バックログ W14)。
 * 左で作る行(日付・国・チャネル)を決めて作り、右で、既存の配信と並べて・中身を見て・前後と比べてから、パネルの中で保存か破棄まで済ませる。
 * 保存していない下書きは、カレンダーには出さない(下書きは、このパネルの中だけのもの)
 */
export function BulkCreatePanel({ cards, cardProducts, products, heroes, weeks, policies, questionCounts, commentCounts, initialWeek, defaults, owners, onClose, onSaved }: Props) {
  const s = useStyles()
  const t = useT()
  const lang = useLang()
  // 国は、絞り込み中ならその国。なければ、いちばん多く配信している国(国が空だと、日本とアメリカの商品が混ざるため)
  const country = defaults.country || mostCommon(cards.map((c) => c.country ?? '')) || ''
  const department = defaults.department ?? ''

  // 最初の行: 前回、保存せずに落ちたときの下書きがあれば戻す。なければ、見ている週の、メールのない日に 1 本ずつ(仮の行。消したり足したりできる)
  const [restored] = useState(() => loadBackup())
  const [drafts, setDraftsState] = useState<Draft[]>(() => {
    if (restored.length > 0) return restored
    // 見ている週に空きがなければ、空きのある週まで先を見る(4 週まで)
    let days: string[] = []
    for (let w = 0; w < 4 && days.length === 0; w++) days = emptyDays(addDays(sundayOf(initialWeek), 7 * w), cards, weeks)
    const first = days.length > 0 ? days.slice(0, BULK_MAX) : [dayKeyOf(addDays(new Date(), 1))]
    return first.map((day) => newDraft({ scheduledAt: `${day}T${BULK_TIME}`, country, channel: defaults.channel ?? CHANNEL_EMAIL, department }))
  })
  // 作っている途中でも、最新の行を読めるように、状態と同じものを ref にも持つ(並行して作るとき、先にできた下書きのテーマ・商品を避けるため)
  const draftsRef = useRef(drafts)
  const update = (fn: (ds: Draft[]) => Draft[]) => {
    draftsRef.current = fn(draftsRef.current)
    setDraftsState(draftsRef.current)
  }
  const patch = (key: string, p: Partial<Draft>) => update((ds) => ds.map((d) => (d.key === key ? { ...d, ...p } : d)))

  const [selectedKey, setSelectedKey] = useState<string | null>(drafts[0]?.key ?? null)
  const selected = drafts.find((d) => d.key === selectedKey)
  const [view, setView] = useState<'week' | 'month'>('week')
  const [weekStart, setWeekStart] = useState(() => sundayOf(drafts[0]?.scheduledAt ? new Date(drafts[0].scheduledAt) : initialWeek))
  const [month, setMonth] = useState(() => new Date(weekStart.getFullYear(), weekStart.getMonth(), 1))
  const [tab, setTab] = useState<Tab>('layout')
  const [check, setCheck] = useState<CheckKey | null>(null)
  const [running, setRunning] = useState(false)
  const cancelRef = useRef(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [askClose, setAskClose] = useState(false)
  const [editing, setEditing] = useState<Draft | null>(null)

  // 作った下書きは、ブラウザに控える(画面が落ちたときに戻すため)
  useEffect(() => saveBackup(drafts), [drafts])
  // パネルを閉じたら、作っている途中の AI は止める
  useEffect(
    () => () => {
      cancelRef.current = true
    },
    [],
  )

  const goToDay = (d: Date) => {
    setWeekStart(sundayOf(d))
    setMonth(new Date(d.getFullYear(), d.getMonth(), 1))
  }
  const select = (d: Draft) => {
    setSelectedKey(d.key)
    if (d.scheduledAt) goToDay(new Date(d.scheduledAt))
  }

  // 下書きのうち、画面に並べるもの(保存したものは、保存済みの配信として読み直されるので除く)
  const live = drafts.filter((d) => d.state !== 'saved')
  const liveCards = useMemo(() => live.filter((d) => d.scheduledAt).map((d) => ({ draft: d, card: draftCard(d, products) })), [live, products])
  const allProducts = useMemo(() => {
    const m = new Map(cardProducts)
    for (const { draft, card } of liveCards) m.set(card.id, draftProductIds(draft))
    return m
  }, [cardProducts, liveCards])

  // ---- 作る
  async function generate(keys: string[]) {
    if (keys.length === 0) return
    cancelRef.current = false
    setRunning(true)
    setError(null)
    update((ds) => ds.map((d) => (keys.includes(d.key) ? { ...d, state: 'running', step: t('順番を待っています', 'Waiting'), done: 0, total: 7, error: undefined, result: undefined, checked: false } : d)))
    const queue = [...keys]
    // 並行して作ると、同時に作っている下書きのテーマが見えず、同じテーマになりやすい。
    // そこで、次の下書きは、前の下書きのテーマが決まってから始める(テーマのあとの工程は、並行して進む)
    const pending: string[] = []
    let themeGate: Promise<void> = Promise.resolve()
    const worker = async () => {
      for (;;) {
        // 待っている間に、他の下書きが先に始めたら、その下書きのテーマを待ち直す
        let gate: Promise<void>
        do {
          gate = themeGate
          await gate
        } while (gate !== themeGate)
        const key = queue.shift()
        if (!key || cancelRef.current) break
        const d = draftsRef.current.find((x) => x.key === key)
        if (!d) continue
        let release = () => undefined as void
        themeGate = new Promise<void>((r) => (release = r))
        // 保存済みの配信と、先にできた下書きのテーマを避け、同じ週で上限まで載せた商品は選ばない
        const others = draftsRef.current.filter((x) => x.key !== key && x.state === 'done' && x.result)
        const pseudo = others.map((x) => ({ id: draftId(x), scheduled_at: x.scheduledAt ? new Date(x.scheduledAt).toISOString() : undefined }))
        const cp = new Map(cardProducts)
        for (const x of others) cp.set(draftId(x), draftProductIds(x))
        try {
          const res = await generateDraft(
            d,
            {
              products,
              heroes,
              otherThemes: [...cards.map((c) => c.theme ?? ''), ...others.map((x) => x.result?.theme ?? ''), ...pending].filter(Boolean),
              avoidProductIds: overusedInWeek(d.scheduledAt, [...cards, ...pseudo], cp),
              onTheme: (theme) => {
                if (theme) pending.push(theme)
                release()
              },
            },
            (step, done, total) => patch(key, { step, done, total }),
            () => cancelRef.current,
          )
          if (res.cancelled) patch(key, { state: 'idle', step: undefined })
          else if (!res.theme) patch(key, { state: 'failed', step: undefined, error: res.errors.join(' / ') || t('テーマを作れませんでした', 'Could not come up with a theme') })
          // 一部の工程が失敗しても、できたところまでを下書きにする(足りないところは、開いて直す)
          else patch(key, { state: 'done', step: undefined, result: res, checked: true, error: res.errors.length > 0 ? res.errors.join(' / ') : undefined })
        } catch (e) {
          patch(key, { state: 'failed', step: undefined, error: e instanceof Error ? e.message : String(e) })
        } finally {
          // テーマの前に止めた・失敗したときも、次の下書きを待たせない
          release()
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(BULK_PARALLEL, keys.length) }, worker))
    update((ds) => ds.map((d) => (d.state === 'running' ? { ...d, state: 'idle', step: undefined } : d)))
    setRunning(false)
  }
  const locked = (d: Draft) => lockedWeekOf(weeks, d)
  const ready = drafts.filter((d) => (d.state === 'idle' || d.state === 'failed') && d.scheduledAt && !locked(d))

  // ---- 行
  const full = drafts.filter((d) => d.state !== 'saved').length >= BULK_MAX
  const addRow = () => {
    const last = [...drafts].reverse().find((d) => d.scheduledAt)
    const base = last ? addDays(new Date(last.scheduledAt), 1) : addDays(new Date(), 1)
    const d = newDraft({ scheduledAt: `${dayKeyOf(base)}T${BULK_TIME}`, country: last?.country ?? country, channel: last?.channel ?? CHANNEL_EMAIL, department: last?.department ?? department })
    update((ds) => [...ds, d])
    select(d)
  }
  const fillEmpty = () => {
    const taken = new Set(drafts.filter((d) => d.channel !== CHANNEL_PUSH && d.state !== 'saved').map((d) => d.scheduledAt.slice(0, 10)))
    const room = BULK_MAX - drafts.filter((d) => d.state !== 'saved').length
    const days = emptyDays(weekStart, cards, weeks).filter((day) => !taken.has(day)).slice(0, room)
    update((ds) => [...ds, ...days.map((day) => newDraft({ scheduledAt: `${day}T${BULK_TIME}`, country, channel: CHANNEL_EMAIL, department }))])
  }
  // 国・チャネルを変えると、使える商品・テンプレートが変わるので、作った下書きは作り直す
  const setRowField = (d: Draft, k: 'scheduledAt' | 'country' | 'channel' | 'department', v: string) => {
    const reset = (k === 'country' || k === 'channel') && d.state !== 'idle'
    patch(d.key, { [k]: v, ...(reset ? { state: 'idle', result: undefined, checked: false, error: undefined } : {}) })
    if (k === 'scheduledAt' && v) goToDay(new Date(v))
  }
  const removeRow = (d: Draft) => {
    if (d.state === 'done' && !window.confirm(t('この下書きを破棄します。よろしいですか?', 'Discard this draft?'))) return
    update((ds) => ds.filter((x) => x.key !== d.key))
    if (selectedKey === d.key) setSelectedKey(null)
  }

  // ---- 保存・破棄
  const unsaved = drafts.filter((d) => d.state === 'done')
  // 確定した週に移した下書きは、保存の対象にしない(日を変えるまで保存できない)
  const checked = unsaved.filter((d) => d.checked && !locked(d))
  async function saveDrafts(list: Draft[]): Promise<boolean> {
    if (list.length === 0) return true
    setSaving(true)
    setError(null)
    let ok = true
    for (const d of list) {
      if (locked(d)) {
        ok = false
        setError(t('確定した週に入っている下書きは、保存できません。日を変えてください。', 'Drafts in a confirmed week cannot be saved. Change the day first.'))
        continue
      }
      try {
        const id = await saveDraft(d, products)
        patch(d.key, { state: 'saved', savedId: id, checked: false })
      } catch (e) {
        ok = false
        setError(e instanceof Error ? e.message : String(e))
        break
      }
    }
    await onSaved()
    setSaving(false)
    // 次の、保存していない下書きを選ぶ(続けて見比べられるように)
    const next = draftsRef.current.find((d) => d.state === 'done')
    if (next) select(next)
    return ok
  }
  const discard = (list: Draft[]) => {
    if (list.length === 0) return
    if (!window.confirm(t(`選んだ ${list.length} 本の下書きを破棄します。よろしいですか?`, `Discard ${list.length} selected draft(s)?`))) return
    const keys = new Set(list.map((d) => d.key))
    update((ds) => ds.filter((d) => !keys.has(d.key)))
  }
  const close = () => {
    if (saving) return
    if (unsaved.length > 0 || running) {
      setAskClose(true)
      return
    }
    saveBackup([])
    onClose()
  }

  // ---- 右側: 見ている期間
  const dayCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of [...cards, ...liveCards.map((x) => x.card)]) {
      if (!c.scheduled_at) continue
      const k = dayKeyOf(new Date(c.scheduled_at))
      m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }, [cards, liveCards])
  const weekEnd = addDays(weekStart, 7)
  const inRange = (iso: string | undefined, a: Date, b: Date) => !!iso && new Date(iso) >= a && new Date(iso) < b
  const weekCards = cards.filter((c) => inRange(c.scheduled_at, weekStart, weekEnd))
  const weekDrafts = liveCards.filter((x) => inRange(x.card.scheduled_at, weekStart, weekEnd))
  // 確認の一覧(W4)は、保存済みと作った下書きを合わせて数える(保存する前に、週の偏りに気づけるように)
  const checklist = useMemo(
    () =>
      buildChecklist({
        weekStart,
        weekCards: [...weekCards, ...weekDrafts.filter((x) => x.draft.state === 'done').map((x) => x.card)],
        allCards: [...cards, ...liveCards.filter((x) => x.draft.state === 'done').map((x) => x.card)],
        cardProducts: allProducts,
        products,
        policies,
        questionCounts,
        commentCounts,
        cardLabel: (c) => `${c.scheduled_at ? new Date(c.scheduled_at).toLocaleDateString(locale(), { weekday: 'short' }) : ''} ${c.name}`.trim(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekStart, cards, liveCards, allProducts, products, policies, questionCounts, commentCounts, lang],
  )
  const focus = checklist.find((i) => i.key === check)
  const rangeLabel =
    view === 'week'
      ? (() => {
          const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
          return `${f(weekStart)} – ${f(addDays(weekStart, 6))}`
        })()
      : lang === 'ja'
        ? `${month.getFullYear()}年${month.getMonth() + 1}月`
        : month.toLocaleDateString(locale(), { month: 'long', year: 'numeric' })
  const step = (n: number) => {
    if (view === 'week') goToDay(addDays(weekStart, 7 * n))
    else {
      const m = new Date(month.getFullYear(), month.getMonth() + n, 1)
      setMonth(m)
      setWeekStart(sundayOf(m))
    }
  }

  const channelIcon = (c: { channel?: string }) => (c.channel === CHANNEL_PUSH ? <PhoneRegular fontSize={12} /> : <MailRegular fontSize={12} />)
  const timeText = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) : '')

  /** 配信の札(保存済み = 実線、下書き = 破線と「下書き」の印) */
  const chip = (c: DeliveryCard, d?: Draft, compact = false) => {
    const focusOn = !!focus && !focus.ok && focus.cardIds.includes(c.id)
    const sub = d && d.state !== 'done' ? (d.state === 'running' ? t('作成中…', 'Creating…') : d.state === 'failed' ? t('失敗', 'Failed') : t('未作成', 'Not created')) : c.theme
    const el = (
      <button
        type="button"
        key={c.id}
        className={mergeClasses(s.chip, c.channel === CHANNEL_PUSH && s.chipPush, d && s.chipDraft, d && d.key === selectedKey && s.chipOn, focusOn && s.chipFocus)}
        onClick={d ? () => select(d) : undefined}
      >
        <span className={s.chipLine}>
          {channelIcon(c)}
          <span>{timeText(c.scheduled_at)}</span>
          {d && <span className={s.draftTag}>{t('下書き', 'Draft')}</span>}
        </span>
        <span className={s.chipName}>{d && d.state !== 'done' ? draftName(d) : c.name}</span>
        {!compact && sub && <span className={s.chipSub}>{sub}</span>}
      </button>
    )
    const ids = allProducts.get(c.id) ?? []
    // 中身ができているものだけ、マウスを重ねるとプレビューを出す
    return !d || d.state === 'done' ? (
      <DeliveryPeek key={c.id} card={c} productIds={ids} products={products} heroes={heroes}>
        {el}
      </DeliveryPeek>
    ) : (
      el
    )
  }
  const dayItems = (day: Date) => {
    const a = day
    const b = addDays(day, 1)
    const rank = (c: DeliveryCard) => (c.channel === CHANNEL_PUSH ? 1 : 0)
    const list: { c: DeliveryCard; d?: Draft }[] = [
      ...cards.filter((c) => inRange(c.scheduled_at, a, b)).map((c) => ({ c })),
      ...liveCards.filter((x) => inRange(x.card.scheduled_at, a, b)).map((x) => ({ c: x.card, d: x.draft })),
    ]
    return list.sort((x, y) => rank(x.c) - rank(y.c) || timeOf(x.c.scheduled_at) - timeOf(y.c.scheduled_at))
  }

  const layoutPane = () => {
    if (view === 'month') {
      const start = sundayOf(month)
      const weeksN = Math.ceil((new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() + month.getDay()) / 7)
      return (
        <div className={s.month}>
          {Array.from({ length: weeksN * 7 }, (_, i) => {
            const day = addDays(start, i)
            const out = day.getMonth() !== month.getMonth()
            return (
              <div key={i} className={mergeClasses(s.mCell, out && s.mOut)}>
                <button type="button" className={s.mDay} onClick={() => { goToDay(day); setView('week') }}>
                  {day.toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })}
                </button>
                {dayItems(day).map(({ c, d }) => chip(c, d, true))}
              </div>
            )
          })}
        </div>
      )
    }
    return (
      <>
        <div className={s.week}>
          {Array.from({ length: 7 }, (_, i) => {
            const day = addDays(weekStart, i)
            const today = dayKeyOf(day) === dayKeyOf(new Date())
            return (
              <div key={i} className={s.col}>
                <div className={s.colHead} style={today ? { color: tokens.colorBrandForeground1 } : undefined}>
                  {day.toLocaleDateString(locale(), { month: 'numeric', day: 'numeric', weekday: 'short' })}
                  {lockedWeekOf(weeks, { scheduledAt: day.toISOString() }) && i === 0 && (
                    <Tooltip content={t('確定した週です', 'This week is confirmed')} relationship="label">
                      <LockClosedRegular />
                    </Tooltip>
                  )}
                </div>
                <div className={s.colBody}>{dayItems(day).map(({ c, d }) => chip(c, d))}</div>
              </div>
            )
          })}
        </div>
        <div className={s.checklist}>
          <WeekChecklist items={checklist} selected={check} onSelect={setCheck} />
        </div>
      </>
    )
  }

  const fact = (labelText: string, value?: string, reason?: string, reasonLabel?: string): ReactNode =>
    value ? (
      <div>
        <div className={s.label}>{labelText}</div>
        <div className={s.value}>{value}</div>
        {reason && <div className={s.reason}>{`${reasonLabel ?? t('理由', 'Why')}: ${reason}`}</div>}
      </div>
    ) : null

  const contentPane = () => {
    if (!selected) return <div className={s.muted}>{t('左の行を選ぶと、その下書きの中身を見られます', 'Select a row on the left to see its draft')}</div>
    if (selected.state !== 'done' || !selected.result) return <div className={s.muted}>{t('この行は、まだ下書きができていません', 'This row has no draft yet')}</div>
    const r = selected.result
    const card = draftCard(selected, products)
    const pname = (id: string) => products.find((p) => p.id === id)?.name ?? id
    return (
      <div className={s.content}>
        <div className={s.previewBox}>
          <FitPreview maxWidth={360}>
            <CardPreview card={card} productIds={draftProductIds(selected)} products={products} heroes={heroes} />
          </FitPreview>
        </div>
        <div className={s.facts}>
          <div className={s.factHead}>
            <span className={s.h3}>{card.name}</span>
            <span className={s.muted}>{new Date(selected.scheduledAt).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          {selected.error && (
            <MessageBar intent="warning" layout="multiline">
              <MessageBarBody>{t(`一部の工程で失敗しました: ${selected.error}`, `Some steps failed: ${selected.error}`)}</MessageBarBody>
            </MessageBar>
          )}
          {fact(t('テーマ', 'Theme'), r.theme, r.themeIdeas[0]?.reason)}
          {fact(t('テンプレート', 'Template'), r.template ? getTemplate(r.template).label : undefined, r.templateReason)}
          {fact(t('メイン画像', 'Hero image'), r.hero?.hero ? heroes.find((h) => h.id === r.hero!.hero!.heroId)?.name : undefined, r.hero?.hero?.reason)}
          {fact(t('ヘッドライン', 'Headline'), r.headline)}
          {fact(t('コピー', 'Copy'), r.copy, r.copyIdeas[0]?.angle, t('切り口', 'Angle'))}
          {r.sections.map((sec, i) => (
            <div key={i} className={s.secBox}>
              <div className={s.label}>{t(`セクション ${i + 1}`, `Section ${i + 1}`)}</div>
              {sec.title && <div className={s.value}>{sec.title}</div>}
              {sec.copy && <div className={s.reason}>{sec.copy}</div>}
              {sec.selected.length > 0 && (
                <ul className={s.list}>
                  {sec.selected.map((p) => (
                    <li key={p.productId}>
                      {pname(p.productId)}
                      {p.reason && <span className={s.muted}>{` — ${p.reason}`}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
          {fact(t('通知のタイトル', 'Notification title'), r.pushTitle)}
          {fact(t('通知の本文', 'Notification body'), r.pushBody)}
          {r.instructions && (
            <div>
              <div className={s.label}>{t('制作指示', 'Production notes')}</div>
              <div className={s.md}>
                <MarkdownLite text={r.instructions} />
              </div>
              {r.instructionIdeas[0]?.angle && <div className={s.reason}>{`${t('切り口', 'Angle')}: ${r.instructionIdeas[0].angle}`}</div>}
            </div>
          )}
        </div>
      </div>
    )
  }

  const comparePane = () => {
    if (!selected || selected.state !== 'done') return <div className={s.muted}>{t('下書きができた行を選ぶと、前後の配信と比べられます', 'Select a row with a draft to compare it with the deliveries around it')}</div>
    const me = draftCard(selected, products)
    const myIds = new Set(draftProductIds(selected))
    const pool: { c: DeliveryCard; d?: Draft }[] = [...cards.map((c) => ({ c })), ...liveCards.filter((x) => x.draft.key !== selected.key && x.draft.state === 'done').map((x) => ({ c: x.card, d: x.draft }))]
    const at = timeOf(me.scheduled_at)
    const same = pool.filter((x) => x.c.channel === me.channel && x.c.scheduled_at).sort((a, b) => timeOf(a.c.scheduled_at) - timeOf(b.c.scheduled_at))
    const prev = [...same].reverse().find((x) => timeOf(x.c.scheduled_at) < at)
    const next = same.find((x) => timeOf(x.c.scheduled_at) > at)
    const sameDay = pool.filter((x) => x.c.channel !== me.channel && x.c.scheduled_at && dayKeyOf(new Date(x.c.scheduled_at)) === dayKeyOf(new Date(selected.scheduledAt)))
    const col = (role: string, x: { c: DeliveryCard; d?: Draft } | undefined, mine = false) => {
      if (!x) {
        return (
          <div key={role} className={s.cmpCol}>
            <div className={s.cmpRole}>{role}</div>
            <div className={s.muted}>{t('ありません', 'None')}</div>
          </div>
        )
      }
      const ids = allProducts.get(x.c.id) ?? []
      const sameTheme = !mine && !!norm(x.c.theme) && norm(x.c.theme) === norm(me.theme)
      return (
        <div key={role + x.c.id} className={mergeClasses(s.cmpCol, (mine || x.d) && s.cmpColDraft)}>
          <div className={s.cmpRole}>
            {role}
            {x.d && !mine ? ` ・ ${t('下書き', 'Draft')}` : ''}
          </div>
          <div className={s.chipLine}>
            {channelIcon(x.c)}
            <span className={s.chipName}>{x.c.name}</span>
          </div>
          <div className={s.muted}>{x.c.scheduled_at ? new Date(x.c.scheduled_at).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</div>
          <div className={s.value}>
            {x.c.theme}
            {sameTheme && (
              <span className={s.same}>
                {' '}
                <WarningFilled /> {t('テーマが同じ', 'Same theme')}
              </span>
            )}
          </div>
          <FitPreview maxWidth={240} maxHeight={320}>
            <CardPreview card={x.c} productIds={ids} products={products} heroes={heroes} />
          </FitPreview>
          <div>
            {ids.map((pid, i) => {
              const hit = !mine && myIds.has(pid)
              return (
                <div key={`${pid}-${i}`} className={mergeClasses(s.prod, hit && s.prodHit)}>
                  {products.find((p) => p.id === pid)?.name ?? pid}
                  {hit ? ` ・ ${t('重なり', 'Overlap')}` : ''}
                </div>
              )
            })}
          </div>
        </div>
      )
    }
    return (
      <div className={s.compare}>
        {col(t('前の配信(同じチャネル)', 'Previous (same channel)'), prev)}
        {col(t('この下書き', 'This draft'), { c: me, d: selected }, true)}
        {col(t('次の配信(同じチャネル)', 'Next (same channel)'), next)}
        {sameDay.length === 0 ? col(t('同じ日の、他のチャネル', 'Same day, other channel'), undefined) : sameDay.map((x) => col(t('同じ日の、他のチャネル', 'Same day, other channel'), x))}
      </div>
    )
  }

  const rowStatus = (d: Draft) => {
    const lock = locked(d)
    if (lock && d.state !== 'saved') {
      return (
        <div className={mergeClasses(s.status, s.lockText)}>
          <LockClosedRegular />
          <span>{t('確定した週には作れません(週を確定前に戻すか、日を変えてください)', 'Cannot create in a confirmed week (reopen the week or pick another day)')}</span>
        </div>
      )
    }
    switch (d.state) {
      case 'running':
        return (
          <div>
            <div className={s.status}>
              <Spinner size="extra-tiny" />
              <span className={s.statusText}>{d.step}</span>
            </div>
            <ProgressBar value={d.total ? (d.done ?? 0) / d.total : 0} thickness="medium" />
          </div>
        )
      case 'done':
        return (
          <div className={s.status}>
            <Checkbox checked={!!d.checked} onChange={(_, v) => patch(d.key, { checked: !!v.checked })} onClick={(e) => e.stopPropagation()} aria-label={t('保存の対象にする', 'Include in save')} />
            <span className={mergeClasses(s.statusText, s.themeText)}>{draftName(d)}</span>
            {d.error && (
              <Tooltip content={t(`一部の工程で失敗しました: ${d.error}`, `Some steps failed: ${d.error}`)} relationship="label">
                <WarningFilled color={tokens.colorPaletteDarkOrangeForeground1} />
              </Tooltip>
            )}
            <Tooltip content={t('この下書きを作り直す', 'Recreate this draft')} relationship="label">
              <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} disabled={running} onClick={(e) => { e.stopPropagation(); void generate([d.key]) }} />
            </Tooltip>
          </div>
        )
      case 'failed':
        return (
          <div className={mergeClasses(s.status, s.errorText)}>
            <span className={s.statusText} title={d.error}>{t(`失敗: ${d.error ?? ''}`, `Failed: ${d.error ?? ''}`)}</span>
            <Button size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} disabled={running} onClick={(e) => { e.stopPropagation(); void generate([d.key]) }}>
              {t('やり直す', 'Retry')}
            </Button>
          </div>
        )
      case 'saved':
        return (
          <div className={mergeClasses(s.status, s.savedText)}>
            <CheckmarkCircleFilled />
            <span className={s.statusText}>{t(`保存済み(未起案): ${draftName(d)}`, `Saved (not started): ${draftName(d)}`)}</span>
          </div>
        )
      default:
        return <div className={s.status}>{t('未作成', 'Not created yet')}</div>
    }
  }

  const editable = (d: Draft) => d.state === 'idle' || d.state === 'failed' || d.state === 'done'

  return (
    <>
      <Dialog open onOpenChange={(_, v) => { if (!v.open) close() }}>
        <DialogSurface className={s.surface} aria-label={t('まとめて AI で作る', 'Create with AI in bulk')}>
          <div className={s.root}>
            <div className={s.titleRow}>
              <span className={s.title}>
                <AiIcon />
                {t(`まとめて AI で作る(最大 ${BULK_MAX} 本)`, `Create with AI in bulk (up to ${BULK_MAX})`)}
              </span>
              <Button appearance="subtle" icon={<DismissRegular />} aria-label={t('閉じる', 'Close')} onClick={close} />
            </div>
            {restored.length > 0 && (
              <MessageBar intent="info" layout="multiline" className={s.note}>
                <MessageBarBody>{t(`前回、保存しないまま閉じた下書きを ${restored.length} 本、戻しました。`, `Restored ${restored.length} draft(s) that were not saved last time.`)}</MessageBarBody>
              </MessageBar>
            )}
            {error && (
              <MessageBar intent="error" layout="multiline" className={s.note}>
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
            <div className={s.body}>
              <div className={s.left}>
                <div className={s.leftHead}>
                  {running ? (
                    <Button appearance="secondary" onClick={() => (cancelRef.current = true)}>
                      {t('作るのをやめる', 'Stop')}
                    </Button>
                  ) : (
                    <Button appearance="primary" icon={<AiIcon tone="white" />} disabled={ready.length === 0 || saving} onClick={() => void generate(ready.map((d) => d.key))}>
                      {t(`AI で作る(${ready.length} 本)`, `Create with AI (${ready.length})`)}
                    </Button>
                  )}
                  <span className={s.spacer} />
                  <Menu>
                    <MenuTrigger disableButtonEnhancement>
                      <Tooltip content={full ? t(`1 回に作れるのは ${BULK_MAX} 本までです`, `You can create up to ${BULK_MAX} at a time`) : t('作る行を足す', 'Add rows')} relationship="description">
                        <Button appearance="subtle" icon={<AddRegular />} disabledFocusable={full} iconPosition="before">
                          {t('行を足す', 'Add row')}
                          <ChevronDownRegular />
                        </Button>
                      </Tooltip>
                    </MenuTrigger>
                    <MenuPopover>
                      <MenuList>
                        <MenuItem onClick={addRow}>{t('1 行足す(次の日)', 'Add one row (next day)')}</MenuItem>
                        <MenuItem onClick={fillEmpty}>{t('見ている週の、空いている日で埋める', 'Fill the empty days of the shown week')}</MenuItem>
                      </MenuList>
                    </MenuPopover>
                  </Menu>
                </div>
                <div className={s.rows}>
                  {drafts.length === 0 && <div className={s.muted}>{t('「行を足す」で、作る配信を足してください', 'Use “Add row” to add deliveries to create')}</div>}
                  {drafts.map((d) => (
                    <div key={d.key} className={mergeClasses(s.row, d.key === selectedKey && s.rowOn, d.state === 'saved' && s.rowSaved)} onClick={() => select(d)}>
                      <div className={s.rowLine}>
                        <Input
                          className={s.date}
                          size="small"
                          type="datetime-local"
                          value={d.scheduledAt}
                          disabled={!editable(d) || running}
                          onChange={(_, v) => setRowField(d, 'scheduledAt', v.value)}
                          aria-label={t('配信日時', 'Send date & time')}
                        />
                        <Tooltip content={t('この行を消す', 'Remove this row')} relationship="label">
                          <Button size="small" appearance="subtle" icon={<DeleteRegular />} disabled={d.state === 'running' || d.state === 'saved'} onClick={(e) => { e.stopPropagation(); removeRow(d) }} />
                        </Tooltip>
                      </div>
                      <div className={s.rowLine}>
                        <Select className={s.sel} size="small" value={d.channel} disabled={!editable(d) || running} onChange={(_, v) => setRowField(d, 'channel', v.value)} aria-label={t('チャネル', 'Channel')}>
                          {channelOptions.map((o) => (
                            <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
                          ))}
                        </Select>
                        <Select className={s.sel} size="small" value={d.country} disabled={!editable(d) || running} onChange={(_, v) => setRowField(d, 'country', v.value)} aria-label={t('国', 'Country')}>
                          <option value="">{t('国: 未設定', 'Country: not set')}</option>
                          {countryOptions.map((o) => (
                            <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
                          ))}
                        </Select>
                        <Select className={s.selWide} size="small" value={d.department} disabled={!editable(d) || running} onChange={(_, v) => setRowField(d, 'department', v.value)} aria-label={t('種別', 'Type')}>
                          <option value="">{t('種別: 未設定', 'Type: not set')}</option>
                          {departmentOptions.map((o) => (
                            <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
                          ))}
                        </Select>
                      </div>
                      {rowStatus(d)}
                    </div>
                  ))}
                </div>
              </div>
              <div className={s.right}>
                <div className={s.toolbar}>
                  <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} aria-label={t('前へ', 'Previous')} onClick={() => step(-1)} />
                  <div className={s.range}>
                    <MiniCalendar
                      label={rangeLabel}
                      view={view}
                      month={month}
                      weekStart={weekStart}
                      dayCounts={dayCounts}
                      onPickMonth={(d) => { setView('month'); setMonth(d); setWeekStart(sundayOf(d)) }}
                      onPickWeek={(d) => { setView('week'); goToDay(d) }}
                      onPickDay={goToDay}
                    />
                  </div>
                  <Button size="small" appearance="subtle" icon={<ChevronRightRegular />} aria-label={t('次へ', 'Next')} onClick={() => step(1)} />
                  <Button size="small" onClick={() => goToDay(new Date())}>{t('今日', 'Today')}</Button>
                  <ToggleButton size="small" checked={view === 'week'} onClick={() => setView('week')}>{t('週', 'Week')}</ToggleButton>
                  <ToggleButton size="small" checked={view === 'month'} onClick={() => setView('month')}>{t('月', 'Month')}</ToggleButton>
                  <span className={s.spacer} />
                  <TabList size="small" selectedValue={tab} onTabSelect={(_, v) => setTab(v.value as Tab)}>
                    <Tab value="layout">{t('並び', 'Layout')}</Tab>
                    <Tab value="content">{t('中身', 'Content')}</Tab>
                    <Tab value="compare">{t('比べる', 'Compare')}</Tab>
                  </TabList>
                  {selected?.state === 'done' && (
                    <Button size="small" icon={<EditRegular />} onClick={() => setEditing(selected)}>
                      {t('開いて直す', 'Open & edit')}
                    </Button>
                  )}
                </div>
                <div className={s.pane}>{tab === 'layout' ? layoutPane() : tab === 'content' ? contentPane() : comparePane()}</div>
              </div>
            </div>
            <div className={s.actions}>
              <span className={s.count}>
                {t(`下書き ${unsaved.length} 本(保存に選んだもの ${checked.length} 本)・保存済み ${drafts.filter((d) => d.state === 'saved').length} 本`, `${unsaved.length} draft(s), ${checked.length} selected · ${drafts.filter((d) => d.state === 'saved').length} saved`)}
              </span>
              <Button icon={<DeleteRegular />} disabled={checked.length === 0 || saving || running} onClick={() => discard(checked)}>
                {t('選んだ下書きを破棄', 'Discard selected')}
              </Button>
              <Button appearance="primary" icon={saving ? <Spinner size="tiny" /> : <SaveRegular />} disabled={checked.length === 0 || saving || running} onClick={() => void saveDrafts(checked)}>
                {t(`選んだ ${checked.length} 本を保存`, `Save ${checked.length} selected`)}
              </Button>
              <Button onClick={close} disabled={saving}>{t('閉じる', 'Close')}</Button>
            </div>
          </div>
        </DialogSurface>
      </Dialog>

      {/* 保存していない下書きがあるときの、閉じる前の確認(保存していない下書きは、カレンダーに出さないので、ここで決めてもらう) */}
      <Dialog open={askClose} onOpenChange={(_, v) => setAskClose(v.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{t('保存していない下書きがあります', 'You have unsaved drafts')}</DialogTitle>
            <DialogContent>
              {running
                ? t('まだ作っている下書きがあります。閉じると、作るのをやめます。', 'Some drafts are still being created. Closing stops them.')
                : t(`保存していない下書きが ${unsaved.length} 本あります。保存しないと、カレンダーには出ません。`, `${unsaved.length} draft(s) are not saved. Unsaved drafts do not appear on the calendar.`)}
            </DialogContent>
            <DialogActions className={s.askActions}>
              <Button appearance="secondary" onClick={() => setAskClose(false)}>{t('パネルに戻る', 'Back to the panel')}</Button>
              <Button
                onClick={() => {
                  cancelRef.current = true
                  saveBackup([])
                  setAskClose(false)
                  onClose()
                }}
              >
                {t('破棄して閉じる', 'Discard and close')}
              </Button>
              <Button
                appearance="primary"
                disabled={running || unsaved.length === 0}
                onClick={async () => {
                  setAskClose(false)
                  if (await saveDrafts(unsaved)) {
                    saveBackup([])
                    onClose()
                  }
                }}
              >
                {t(`保存して閉じる(${unsaved.length} 本)`, `Save and close (${unsaved.length})`)}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {/* 開いて直す: 配信カードを上に重ねる。保存したら、その下書きは保存済みにする */}
      {editing && editing.result && (
        <CardDetail
          key={editing.key}
          defaults={{ name: draftName(editing), scheduledAt: editing.scheduledAt, country: editing.country, channel: editing.channel, department: editing.department }}
          draft={editing.result}
          products={products}
          heroes={heroes}
          otherThemes={[...cards.map((c) => c.theme ?? ''), ...live.filter((x) => x.key !== editing.key).map((x) => x.result?.theme ?? '')].filter(Boolean)}
          weeks={weeks}
          owners={owners}
          onBack={() => setEditing(null)}
          onSaved={onSaved}
          onCreated={(id) => {
            patch(editing.key, { state: 'saved', savedId: id, checked: false })
            void logEvent({ action: 'bulk_create', card: { id, name: draftName(editing), scheduledAt: new Date(editing.scheduledAt).toISOString() }, to: 'not_started' })
          }}
        />
      )}
    </>
  )
}
