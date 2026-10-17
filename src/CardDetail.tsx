import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Badge,
  Button,
  Caption1,
  Dialog,
  DialogSurface,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  ProgressBar,
  Select,
  Slider,
  Spinner,
  Switch,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { AddRegular, ArrowNextRegular, ChevronLeftRegular, ChevronRightRegular, DataBarVerticalRegular, DismissRegular, MailRegular, PhoneRegular, SaveRegular, SubtractRegular } from '@fluentui/react-icons'
import { locale, optionLabel, tr, useT } from './i18n'
import { AiIcon } from './AiMark'
import { ProductInfoPane } from './ProductInfoPane'
import { cardMarket, heroMarket, productMarket } from './market'
import { AutoTextarea } from './AutoTextarea'
import { DeliveryCardsService } from './data/deliveryCards'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { ContentPane } from './ContentPane'
import { Preview } from './Preview'
import { DEFAULT_PUSH_TEMPLATE, DEFAULT_TEMPLATE, TEMPLATE_VALUES, channelOf, sectionIndexAt, sectionsOf, templateFromValue, type EmailTemplateId, type TemplateChannel } from './templates'
import { parsePushLink, tapComplete, type PushLink } from './pushLink'
import { Splitter } from './Splitter'
import { DND_ITEM, DND_PRODUCT, SOURCE_AI, SOURCE_MANUAL, STATE_CANDIDATE, STATE_SELECTED, type Candidate, type Item } from './items'
import type { AiCard, CopyLanguage, ProposedHero } from './aiSelect'
import { progressOf } from './progress'
import { ResizeHandles } from './ResizeHandles'
import { NotesEditor } from './NotesEditor'
import { campaignSlug, defaultUtm, encodeLinks, fcmText, linkSlots, linksComplete, parseLinks, productUrl, screenOf, withUtm, type LinkSlot, type Links } from './links'
import { LinkOverlay } from './LinkOverlay'
import { loadAutoDraft, loadPref, savePref } from './settings'
import { runAutoDraft, type AutoDraftResult } from './autoDraft'
import { useAiDrafts } from './useAiDrafts'
import { WeeksService, type WeekRow } from './data/weeks'
import { CardNotesService } from './data/cardNotes'
import { confirmedWeekOf } from './weekLock'
import { logEvent } from './history'
import { ProcessPane, ProcessRail, type TalkTab } from './ProcessPane'
import type { TopTab } from './ContentPane'
import { ApprovalsService } from './data/approvals'
import { CHANNEL_PUSH, channelOptions, countryOptions, departmentOptions, statusColor, statusOptions, statusRank } from './status'
import { LearningsBar } from './LearningsBar'
import { CardMenu } from './CardMenu'
import { CardAlertsBar } from './CardAlertsBar'
import { CARD_ALERT_ORDER, type CardAlert } from './cardAlerts'

/** 新規作成のときに、最初から入れておく値(カレンダーで押した日付、絞り込み中の国・チャネル・種別。まとめて作った下書きを開くときは、名前も) */
export type NewCardDefaults = Partial<Pick<Form, 'name' | 'scheduledAt' | 'country' | 'channel' | 'department'>>

interface Props {
  /** undefined のときは新規作成 */
  card?: DeliveryCard
  /** 新規作成のときだけ使う */
  defaults?: NewCardDefaults
  products: Product[]
  heroes: HeroImage[]
  /** 他の配信で使われているテーマ(テーマ案の重複回避用) */
  otherThemes: string[]
  /** これまでに入れた担当者の名前(入力の候補) */
  owners?: string[]
  /** 週の計画(確定した週の配信は、理由を残さないと保存できない) */
  weeks?: WeekRow[]
  onBack: () => void
  onSaved: () => Promise<void>
  /** この配信の結果を、上に重ねて見る(送ったあとの配信だけ、ボタンを出す) */
  onOpenResults?: (id: string) => void
  /** この配信のアラート(題名の下に帯で出す) */
  alerts?: CardAlert[]
  /** 開いたときに選んでおく商品(アラートの画面から開いたとき。問題の商品を、プレビューで強調する) */
  focusProductId?: string
  /** 新規作成で、最初に入れておく AI の下書き(まとめて作った下書きを「開いて直す」とき。W14) */
  draft?: AutoDraftResult
  /** 新規作成で保存したとき、作った配信カードの id を知らせる */
  onCreated?: (id: string) => void
  /** 「保存して次へ」で開く配信(同じ週、または週の確認の項目で選んだ配信の、次の 1 本)。null は次がない。undefined はボタンを出さない */
  next?: { name: string; position: string } | null
  /** 保存したあとに、次の配信を開く(閉じる代わりに呼ぶ) */
  onNext?: () => void
}

const pad = (n: number) => String(n).padStart(2, '0')
// 配信のステータス(選択肢の値)。承認・差し戻し・再承認の判定に使う
const STATUS_NOT_STARTED = 'not_started'
const STATUS_REVIEW = 'reviewing'
const STATUS_APPROVED = 'approved'
// ISO文字列 → datetime-local の値(ローカル時刻)
const toLocalInput = (v?: string) => {
  if (!v) return ''
  const d = new Date(v)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

interface Form {
  name: string
  scheduledAt: string
  country: string
  channel: string
  department: string
  status: string
  owner: string
  /** アプリ: 通知のタイトル・本文 */
  pushTitle: string
  pushBody: string
  /** 制作の締め切り(YYYY-MM-DD) */
  productionDue: string
  productionOwner: string
  /** 制作に引き継いだ日時(ISO。空は、まだ) */
  handedOffAt: string
  theme: string
  headline: string
  copy: string
  instructions: string
  /** 採用したAIの案の補足(テーマの理由、コピー・制作指示の切り口)。手で書き換えたら消す */
  themeReason: string
  copyAngle: string
  instructionsAngle: string
}

// 空の項目は、DB から null で届く。String(null) は「null」という文字になり、保存すると「使えない値」になるので、空の文字にする
const str = (v?: string | null) => (v === undefined || v === null ? '' : String(v))

const toForm = (c?: DeliveryCard): Form => ({
  name: c?.name ?? '',
  scheduledAt: toLocalInput(c?.scheduled_at),
  country: str(c?.country),
  channel: str(c?.channel),
  department: str(c?.department),
  status: c?.status === undefined || c.status === null ? String(statusOptions[0].value) : String(c.status),
  owner: c?.owner ?? '',
  pushTitle: c?.push_title ?? '',
  pushBody: c?.push_body ?? '',
  productionDue: c?.production_due?.slice(0, 10) ?? '',
  productionOwner: c?.production_owner ?? '',
  handedOffAt: c?.handed_off_at ?? '',
  theme: c?.theme ?? '',
  headline: c?.headline ?? '',
  copy: c?.copy ?? '',
  instructions: c?.instructions ?? '',
  themeReason: c?.theme_reason ?? '',
  copyAngle: c?.copy_angle ?? '',
  instructionsAngle: c?.instructions_angle ?? '',
})

function OptionSelect({ label, value, options, onChange }: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  const t = useT()
  return (
    <Field label={label}>
      <Select size="small" value={value} onChange={(_, d) => onChange(d.value)}>
        <option value="">{t('未設定', 'Not set')}</option>
        {options.map((o) => (
          <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
        ))}
      </Select>
    </Field>
  )
}

// 既定を「全体(fit)」に変えたので、キーの版を上げて、以前に保存した倍率は使わない
const ZOOM_KEY = 'cardDetail.previewZoom.v2'
const ZOOM_MIN = 0.15  // 長いテンプレートも、「全体」で収まるように、小さくできる
const ZOOM_MAX = 1.2

/** プレビューの倍率: 数値(1 = 現在のサイズ)または 'fit'(メール全体を画面の高さに収める) */
function loadZoom(): number | 'fit' {
  try {
    const v = JSON.parse(localStorage.getItem(ZOOM_KEY) ?? 'null')
    if (v === 'fit') return 'fit'
    if (typeof v === 'number' && v >= ZOOM_MIN && v <= ZOOM_MAX) return v
  } catch {
    // 読めなければ既定値を使う
  }
  // 既定は、メール全体が見える倍率(作り始めに、構成の全体を見渡せるように)
  return 'fit'
}

/** 自動下書きを済ませたカード(同じカードを開き直しても、再実行しない) */
const autoDrafted = new Set<string>()

// 4 つめの幅(右端のプロセスのペイン)を足したので、版を上げた(2026-10-17)
const WIDTH_KEY = 'cardDetail.paneWidths.v6'
// ダイアログの大きさ(辺・角のドラッグで変える。null は既定の大きさ)
const SIZE_KEY = 'cardDetail.size'
const MIN_DIALOG = { w: 900, h: 560 }
type DialogSize = { w: number; h: number }
const clampSize = (s: DialogSize): DialogSize => ({
  w: Math.round(Math.min(window.innerWidth, Math.max(MIN_DIALOG.w, s.w))),
  h: Math.round(Math.min(window.innerHeight, Math.max(MIN_DIALOG.h, s.h))),
})
// 既定を「開く」に変えたので、キーの版を上げて、以前に保存した開閉は使わない
const INFO_KEY = 'cardDetail.infoOpen.v2'
const RAIL_W = 32
// 右端のプロセスのペイン(状態・承認・やり取り)の開閉。既定は開く
const PROCESS_KEY = 'cardDetail.processOpen.v1'

/** 商品情報ペインを開くか。保存がなければ、開いておく(選んだ商品の売上・在庫を、すぐ確かめられるように) */
function loadInfoOpen(): boolean {
  try {
    const v = localStorage.getItem(INFO_KEY)
    if (v === 'open') return true
    if (v === 'closed') return false
  } catch {
    // 保存を読めないときは、既定(開く)にする
  }
  return true
}
const MIN_W = 220
const MAX_W = 640
const clamp = (v: number) => Math.min(MAX_W, Math.max(MIN_W, v))
// 中央(コンテンツ生成)は、プレビューと商品情報がつぶれない範囲で、いくらでも広げられる
// (上限は、ドラッグのときに、その時のダイアログの幅から求める。CSS でも、プレビューの最小幅を残すよう抑える)
const MIN_PREVIEW = 320
const clampMid = (v: number, max = 4000) => Math.min(Math.max(MIN_W, max), Math.max(MIN_W, v))

function loadOpen(key: string): boolean {
  try {
    const v = localStorage.getItem(key)
    if (v === 'open') return true
    if (v === 'closed') return false
  } catch {
    // 保存を読めないときは、既定(開く)にする
  }
  return true
}

type Widths = [number, number, number, number]
function loadWidths(): Widths {
  try {
    const v = JSON.parse(localStorage.getItem(WIDTH_KEY) ?? 'null')
    if (Array.isArray(v) && v.length === 4) return [clamp(Number(v[0])), clampMid(Number(v[1])), clamp(Number(v[2])), clamp(Number(v[3]))]
  } catch {
    // 保存値が読めなければ既定値を使う
  }
  // 既定値: ダイアログの幅(最大 1800px)に合わせる。左 18%・中 26%・商品情報 15%・プロセス(右端)17%・プレビューは残り
  const total = Math.min(1800, window.innerWidth * 0.98)
  return [clamp(Math.round(total * 0.18)), clamp(Math.round(total * 0.26)), clamp(Math.round(total * 0.15)), clamp(Math.round(total * 0.17))]
}

/** 読み込み時点の配信商品の行(保存時の差分判定用) */
interface RowSnap {
  reason: string
  source: string
  state: string
  section: number
  order: number
}

/** 各セクションのコピーは、改行を含みうるので JSON の配列で保存する(古い形式の改行区切りも読む) */
function parseCopies(v?: string): string[] {
  if (!v) return []
  try {
    const a = JSON.parse(v)
    if (Array.isArray(a)) return a.map(String)
  } catch {
    // JSON でなければ、改行区切りとして読む
  }
  return v.split('\n')
}
const encodeCopies = (a: string[]) => (a.some(Boolean) ? JSON.stringify(a) : '')

const useStyles = makeStyles({
  surface: {
    // fixed + inset 0 + margin auto で、画面の中央に置く(relative にすると、標準の中央寄せが効かず、上端に貼りつく)。中の絶対配置の基準にもなる
    position: 'fixed',
    inset: 0,
    margin: 'auto',
    padding: 0,
    overflow: 'hidden',
    maxWidth: 'none',
    width: 'min(1800px, 98vw)',
    height: '92vh',
    maxHeight: '92vh',
    '@media (max-width: 899px)': {
      width: '100vw',
      height: '100vh',
      maxHeight: '100vh',
      borderRadius: 0,
    },
  },
  form: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  overlay: {
    position: 'absolute',
    inset: 0,
    zIndex: 20,
    display: 'grid',
    placeContent: 'center',
    justifyItems: 'center',
    rowGap: '16px',
    paddingLeft: '24px',
    paddingRight: '24px',
    textAlign: 'center',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  overlayBar: { width: '320px' },
  titleRow: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '12px 12px 12px 24px', backgroundColor: tokens.colorNeutralBackground1 },
  titleText: { flexGrow: 1, minWidth: 0 },
  panes: {
    flexGrow: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: '1fr',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'auto',
    '@media (min-width: 900px)': {
      gridTemplateColumns: `var(--w0) 1px min(var(--w1), max(${MIN_W}px, calc(100% - var(--w0) - var(--w2) - var(--w3) - 4px - ${MIN_PREVIEW}px))) 1px minmax(0, 1fr) 1px var(--w2) 1px var(--w3)`,
      gridTemplateRows: 'minmax(0, 1fr)',
      overflow: 'hidden',
    },
  },
  pane: {
    padding: '16px',
    overflow: 'auto',
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    rowGap: '12px',
    backgroundColor: tokens.colorNeutralBackground1,
    alignContent: 'start',
  },
  // 中ペインは、余白と、スクロールを内側(ContentPane)に任せる: 上に内容、下にチャットを固定する
  paneMid: { backgroundColor: tokens.colorNeutralBackground1, padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  panePreview: { gridTemplateRows: 'auto minmax(0, 1fr)' },
  infoToolbar: { display: 'flex', justifyContent: 'flex-end', marginBottom: '-8px' },
  // 商品情報ペインを閉じたときの、細い帯(押すと開く)
  rail: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    rowGap: '10px',
    paddingTop: '10px',
    minHeight: 0,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  railLabel: { writingMode: 'vertical-rl', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, letterSpacing: '0.1em' },
  caption: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular },
  lead: { fontWeight: tokens.fontWeightSemibold },
  captionTight: { marginTop: '-4px' },
  success: { color: tokens.colorPaletteGreenForeground1 },
  fullWidth: { width: '100%', flexShrink: 0, minHeight: '32px' },
  sectionHead: { marginTop: '12px' },
  previewHead: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap', minWidth: 0 },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: '12px', rowGap: '12px' },
  // 左の「制作への引き継ぎ」(表示だけ。押すと、やり取りの「引き継ぎ」のタブが開く)
  handoffField: { gridColumn: '1 / -1' },
  handoffSummary: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: '12px',
    rowGap: '2px',
    width: '100%',
    minHeight: '32px',
    padding: '4px 8px',
    textAlign: 'left',
    fontFamily: 'inherit',
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  handoffItem: { whiteSpace: 'nowrap' },
  handoffLink: { marginLeft: '6px', color: tokens.colorBrandForegroundLink, whiteSpace: 'nowrap' },
  statusRow: { display: 'flex', alignItems: 'center', columnGap: '6px' },
  dot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  grow: { flexGrow: 1 },
  filled: { borderBottomColor: tokens.colorPaletteGreenBorder2 },
  toolbar: { display: 'flex', alignItems: 'center', columnGap: '8px', rowGap: '4px', flexWrap: 'wrap' },
  zoomBox: { display: 'flex', alignItems: 'center', columnGap: '2px' },
  slider: { width: '90px', minWidth: '90px' },
  zoomLabel: { width: '34px', textAlign: 'right' },
  // position: relative は、リンクの場所の番号・URL の吹き出し(LinkOverlay)を、プレビューに重ねて置くため
  previewBox: { position: 'relative', overflow: 'auto', minHeight: 0, paddingTop: '8px', paddingBottom: '8px' },
  error: { margin: '12px 12px 0' },
  // 確定した週の配信: 上の知らせと、保存の前の理由の入力欄
  locked: { margin: '0 24px 8px' },
  reasonBox: { display: 'grid', rowGap: '8px', margin: '12px 24px 0', padding: '12px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorPaletteMarigoldBorder2}`, backgroundColor: tokens.colorPaletteMarigoldBackground1 },
  reasonActions: { display: 'flex', justifyContent: 'flex-end', columnGap: '8px' },
  actions: { display: 'flex', justifyContent: 'flex-end', columnGap: '8px', padding: '12px 24px' },
  // 承認・差し戻しは、保存・キャンセルと離して左に置く(押し間違えないように)
})

export function CardDetail({ card, defaults, products, heroes, otherThemes, owners = [], weeks = [], onBack, onSaved, onOpenResults, alerts = [], focusProductId, draft, onCreated, next, onNext }: Props) {
  const t = useT()
  const styles = useStyles()
  const [form, setForm] = useState<Form>(() => (card ? toForm(card) : { ...toForm(), ...defaults }))
  const [items, setItems] = useState<Item[]>([])
  // 選定候補(配信商品テーブルの「候補」の行。セクションごと)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  // 読み込み時点の配信商品(保存時に差分を取る)。読み込めなかったときは保存で消さないよう null のまま
  const [original, setOriginal] = useState<Map<string, RowSnap> | null>(card ? null : new Map())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // プレビューは、配信カードのチャネルに合わせる(配信カードはチャネルごとに分けるので、切り替えは置かない)。
  // チャネルが未設定のときは、メールで表示する
  const previewTab: 'email' | 'push' = form.channel === String(CHANNEL_PUSH) ? 'push' : 'email'
  const [showHeadings, setShowHeadings] = useState(true)
  // プレビューの倍率(15〜120%)。'fit' は、メール全体が画面の高さに収まる倍率に自動で合わせる
  const [zoom, setZoom] = useState<number | 'fit'>(loadZoom)
  const [fitZoom, setFitZoom] = useState(1)
  // 「すべてAIで下書き」の進み具合(実行中だけ、画面全体に「推論中」を出す)
  const [autoEnabled] = useState(loadAutoDraft) // 設定は、画面上部のバーで切り替える
  const [auto, setAuto] = useState<{ label: string; done: number; total: number } | null>(null)
  const cancelRef = useRef(false)
  // 保存のあとに、閉じずに次の配信を開くか(「保存して次へ」で立てる。確定した週の、理由を入力する流れでも引き継ぐ)
  const goNextRef = useRef(false)
  const aliveRef = useRef(true)
  const previewBoxRef = useRef<HTMLDivElement>(null)
  const previewInnerRef = useRef<HTMLDivElement>(null)
  // コピー・ヘッドラインの言語(AI に渡す。保存はしない)
  // コピー・ヘッドラインの言語は、配信の国に合わせる(US は英語、JP は日本語)。以前は切り替えられたが、2026-10-16 に外した
  const language: CopyLanguage = 'auto'
  const [template, setTemplate] = useState<EmailTemplateId>(
    () => card?.layout_key || (card?.channel === CHANNEL_PUSH ? DEFAULT_PUSH_TEMPLATE : templateFromValue(card?.email_template)),
  )
  // アプリ: 通知を押したときに開く画面と、送る相手
  const [pushLink, setPushLink] = useState<PushLink | null>(() => parsePushLink(card?.push_link))
  const [audience, setAudience] = useState<string>(card?.audience ?? '')
  const templateChannel: TemplateChannel = form.channel === String(CHANNEL_PUSH) ? 'push' : 'email'
  // チャネルを変えたら、テンプレートも、そのチャネルのものにする(メールのテンプレートでアプリの通知は作れないため)
  useEffect(() => {
    if (channelOf(template) === templateChannel) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTemplate(templateChannel === 'push' ? DEFAULT_PUSH_TEMPLATE : DEFAULT_TEMPLATE)
  }, [templateChannel, template])
  // カテゴリ系テンプレートの見出し(セクションの順。保存は 1 行 1 見出し)
  const [sectionTitles, setSectionTitles] = useState<string[]>(() => (card?.section_titles ? card.section_titles.split('\n') : []))
  // 各セクションのコピー(セクションの順)
  const [sectionCopies, setSectionCopies] = useState<string[]>(() => parseCopies(card?.section_copies))
  // メイン画像の候補(AI が案を出したときの分。保存はしない)
  const [heroCandidates, setHeroCandidates] = useState<ProposedHero[]>([])
  const [heroId, setHeroId] = useState<string | undefined>(card?.hero_image_id ?? undefined)
  const [heroReason, setHeroReason] = useState(card?.hero_reason ?? '')
  const [widths, setWidths] = useState<Widths>(loadWidths)
  const [links, setLinks] = useState<Links>(() => parseLinks(card?.links))
  // リンク先のタブを開いているか・設定の欄で選んでいる場所(プレビューに、番号と枠を重ねる。W12)
  const [linksTab, setLinksTab] = useState(false)
  // プロセスのペインのタブを開く頼み(左の「制作への引き継ぎ」を押すと、「引き継ぎ」のタブを開く)
  const [tabRequest, setTabRequest] = useState<{ tab: TalkTab; seq: number } | undefined>(undefined)
  // 中ペインの工程のタブを開く頼み(プロセスのペインの「⑥ で直す」で、制作指示を開く)
  const [stepRequest, setStepRequest] = useState<{ tab: TopTab; seq: number } | undefined>(undefined)
  const [linkFocus, setLinkFocus] = useState<string | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<DialogSize | null>(() => loadPref<DialogSize | null>(SIZE_KEY, null))
  const resizeDialog = (dw: number, dh: number) =>
    setSize((s) => {
      // まだ既定の大きさなら、今の大きさから始める
      const r = surfaceRef.current?.getBoundingClientRect()
      const cur = s ?? (r ? { w: r.width, h: r.height } : null)
      return cur ? clampSize({ w: cur.w + dw, h: cur.h + dh }) : s
    })
  // 画面より大きく保存されていても、画面に収める(狭い画面では、既定の全画面表示のまま)
  const sizeStyle = size && window.innerWidth >= 900 ? (() => { const c = clampSize(size); return { width: `${c.w}px`, height: `${c.h}px`, maxHeight: `${c.h}px` } })() : undefined
  // 商品情報の行にマウスが乗っている商品(プレビューで光らせる)と、商品情報ペインの開閉
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState<boolean>(loadInfoOpen)
  const [processOpen, setProcessOpen] = useState<boolean>(() => loadOpen(PROCESS_KEY))
  const toggleProcess = () =>
    setProcessOpen((open) => {
      try {
        localStorage.setItem(PROCESS_KEY, open ? 'closed' : 'open')
      } catch {
        // 保存できなくても動作には影響しない
      }
      return !open
    })
  const toggleInfo = () =>
    setInfoOpen((open) => {
      try {
        localStorage.setItem(INFO_KEY, open ? 'closed' : 'open')
      } catch {
        // 保存できなくても動作には影響しない
      }
      return !open
    })
  const [saving, setSaving] = useState(false)
  // 確定した週の変更: 保存の前に、理由を入力してもらう(null = 入力欄を出していない)
  const [changeReason, setChangeReason] = useState<string | null>(null)
  // 差し戻しの理由(null = 入力欄を出していない)
  // 承認・差し戻しの履歴に残す名前(週の状態の帯・コメントと共通)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!card) return
    let cancelled = false
    DeliveryProductsService.getAll({
      filter: `delivery_card_id eq ${card.id}`,
      orderBy: ['sort_order asc'],
    })
      .then((res) => {
        if (cancelled) return
        if (!res.success) throw new Error(res.error?.message ?? tr('掲載商品の取得に失敗しました', 'Failed to load the products in this delivery'))
        const sel: Item[] = []
        const cands: Candidate[] = []
        const snap = new Map<string, RowSnap>()
        for (const r of res.data ?? []) {
          const state = r.state ?? STATE_SELECTED
          const section = r.section ?? 0
          const base: Item = {
            key: r.id,
            rowId: r.id,
            productId: r.product_id ?? '',
            reason: r.reason ?? '',
            source: r.source ?? SOURCE_MANUAL,
          }
          snap.set(base.rowId!, { reason: base.reason, source: base.source, state, section, order: r.sort_order ?? 0 })
          if (state === STATE_CANDIDATE) cands.push({ ...base, section })
          else sel.push(base)
        }
        setItems(sel)
        setCandidates(cands)
        setOriginal(snap)
        // アラートの画面から開いたときは、問題の商品を選んでおく(プレビューのその枠が強調され、見える位置までスクロールする)
        const focus = focusProductId ? sel.find((i) => i.productId === focusProductId) : undefined
        if (focus) setSelectedKey(focus.key)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
    // 選んでおく商品は、開いたときにだけ使う(配信カードは、配信ごとに作り直されるので、ここで読み直すことはない)
  }, [card, focusProductId])

  // 左ペインで手で書き換えたら、採用した案の補足は消す
  const STALE: Partial<Record<keyof Form, keyof Form>> = { theme: 'themeReason', headline: 'copyAngle', copy: 'copyAngle', instructions: 'instructionsAngle' }
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => {
    const stale = STALE[k]
    setForm({ ...form, [k]: v, ...(stale ? { [stale]: '' } : {}) })
  }
  const num = (v: string) => (v === '' ? undefined : (v as never))
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? ''

  const addProduct = (productId: string, at = items.length) => {
    if (items.some((i) => i.productId === productId)) return
    // 候補にあった商品なら、候補から選定へ移す(理由も引き継ぐ)
    const cand = candidates.find((c) => c.productId === productId)
    if (cand) setCandidates(candidates.filter((c) => c.key !== cand.key))
    const it: Item = cand
      ? { key: cand.key, rowId: cand.rowId, productId, reason: cand.reason, source: cand.source }
      : { key: crypto.randomUUID(), productId, reason: '', source: SOURCE_MANUAL }
    setItems([...items.slice(0, at), it, ...items.slice(at)])
    setSelectedKey(it.key)
  }

  // プレビューへのドロップ: 並べ替え(DND_ITEM)か、候補からの追加(DND_PRODUCT)
  const dropAt = (index: number, dt: DataTransfer) => {
    const itemKey = dt.getData(DND_ITEM)
    const productId = dt.getData(DND_PRODUCT)
    if (itemKey) {
      const from = items.findIndex((i) => i.key === itemKey)
      if (from < 0) return
      moveItem(from, Math.min(index, items.length - 1))
    } else if (productId) {
      addProduct(productId, index)
    }
  }

  // from の商品を to の位置へ移す(間の商品は1つずつずれる)
  const moveItem = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return
    const next = [...items]
    const [it] = next.splice(from, 1)
    next.splice(to, 0, it)
    setItems(next)
  }

  // 同じカテゴリの商品を隣り合わせにする(カテゴリの並びは、現在の登場順を保つ)
  const groupByCategory = () => {
    const cat = (i: Item) => products.find((p) => p.id === i.productId)?.category_name ?? ''
    const order = [...new Set(items.map(cat))]
    setItems([...items].sort((a, b) => order.indexOf(cat(a)) - order.indexOf(cat(b))))
  }

  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, JSON.stringify(zoom))
    } catch {
      // 保存できなくても動作には影響しない
    }
  }, [zoom])

  // 全体表示: 倍率 1 での高さを測り、プレビューの枠に収まる倍率を求める(内容や窓の大きさが変わったら、測り直す)
  useLayoutEffect(() => {
    const box = previewBoxRef.current
    const inner = previewInnerRef.current
    if (zoom !== 'fit' || !box || !inner) return
    const calc = () => {
      inner.style.zoom = '1'
      const h = inner.offsetHeight
      // 高さだけでなく、幅にも収める(ペインを狭めたとき、横にはみ出さないように)
      const w = (inner.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
      const byHeight = h > 0 ? (box.clientHeight - 16) / h : 1
      const byWidth = w > 0 ? (box.clientWidth - 8) / w : 1
      const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, byHeight, byWidth))
      inner.style.zoom = String(z)
      setFitZoom(z)
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(box)
    return () => {
      ro.disconnect()
      inner.style.zoom = ''
    }
  }, [zoom, previewTab, template, items, form.headline, form.copy, sectionTitles, sectionCopies, heroId])

  const shownZoom = zoom === 'fit' ? fitZoom : zoom

  // プレビューのリンクの場所と、その URL(リンク先の設定の欄と同じ決め方。W12)
  const linkCampaign = campaignSlug(form.name, form.scheduledAt)
  const linkSpots = useMemo(() => linkSlots(template, items, products, linkCampaign), [template, items, products, linkCampaign])
  const linkUtm = { ...defaultUtm(linkCampaign), ...Object.fromEntries(Object.entries(links.utm ?? {}).filter(([, v]) => v)) }
  // アプリの配信は、URL の代わりに、開く画面(FCM の data)を出す
  const linkUrlOf = (slot: LinkSlot) => {
    if (previewTab === 'push') {
      const d = fcmText(screenOf(links, slot), linkCampaign)
      return d ? `data: ${d}` : ''
    }
    const url = ((slot.kind === 'hero' ? links.hero : links.buttons?.[slot.key]) ?? '').trim() || slot.defaultUrl
    return url ? withUtm(url, linkUtm) : ''
  }
  const productLinkOf = (itemKey: string) => {
    const it = items.find((x) => x.key === itemKey)
    const p = it && products.find((x) => x.id === it.productId)
    if (!p) return undefined
    if (previewTab === 'push') return { name: p.name, url: p.product_code ? `data: ${fcmText({ kind: 'product', value: p.product_code }, linkCampaign)}` : '' }
    return { name: p.name, url: withUtm(productUrl(p), linkUtm) }
  }
  const stepZoom = (d: number) => setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((shownZoom + d) * 20) / 20)))

  const panesRef = useRef<HTMLDivElement>(null)
  // 中央の上限: ダイアログの中の幅から、左・商品情報・境界線・プレビューの最小幅を引いた残り
  const midMax = (w: Widths) => {
    const total = panesRef.current?.clientWidth ?? window.innerWidth
    return total - w[0] - (infoOpen ? w[2] : RAIL_W) - (processOpen ? w[3] : RAIL_W) - 4 - MIN_PREVIEW
  }
  const resize = (i: 0 | 1 | 2) => (dx: number) =>
    setWidths((w) => {
      const next: Widths = [w[0], w[1], w[2], w[3]]
      if (i === 1) next[1] = clampMid(Math.min(next[1], midMax(w)) + dx, midMax(w))
      else next[i] = clamp(next[i] + dx)
      return next
    })
  const resizeInfo = (dx: number) => setWidths((w) => [w[0], w[1], clamp(w[2] - dx), w[3]])
  const resizeProcess = (dx: number) => setWidths((w) => [w[0], w[1], w[2], clamp(w[3] - dx)])
  const saveWidths = () => {
    try {
      localStorage.setItem(WIDTH_KEY, JSON.stringify(widths))
    } catch {
      // 保存できなくても動作には影響しない
    }
  }

  // エージェントに渡す、配信カードの現在の入力内容
  const buildAiCard = (): AiCard => {
    const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => String(o.value) === v)?.label ?? ''
    return {
      name: form.name,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : '',
      country: label(countryOptions, form.country),
      channel: label(channelOptions, form.channel),
      department: label(departmentOptions, form.department),
      theme: form.theme,
      headline: form.headline,
      copy: form.copy,
      instructions: form.instructions,
    }
  }

  // 商品・メイン画像は、配信カードの国に合う市場のものだけを、選定の対象にする(すでに載せた他の市場の商品は、表示のために残す)
  const market = cardMarket(form.country)
  const poolProducts = useMemo(() => (market ? products.filter((p) => productMarket(p) === market) : products), [products, market])
  const poolHeroes = useMemo(() => (market ? heroes.filter((h) => heroMarket(h) === market) : heroes), [heroes, market])

  // AI の案の状態と生成(案は採用するまで、配信カードには反映しない)
  const drafts = useAiDrafts(
    { buildCard: buildAiCard, products: poolProducts, heroes: poolHeroes, otherThemes, template, items, candidates, sectionTitles, sectionCopies, heroId, heroReason, language },
    setError,
  )

  // ---- すべてAIで下書き(テーマ → テンプレート・メイン画像 → ヘッドライン・コピー → 各セクション → 制作指示)
  const applyAutoResult = (res: AutoDraftResult) => {
    if (res.template) setTemplate(res.template)
    setForm((f) => ({
      ...f,
      theme: res.theme ?? f.theme,
      themeReason: res.theme ? (res.themeIdeas[0]?.reason ?? '') : f.themeReason,
      headline: res.headline ?? f.headline,
      copy: res.copy ?? f.copy,
      copyAngle: res.headline ? (res.copyIdeas[0]?.angle ?? '') : f.copyAngle,
      instructions: res.instructions ?? f.instructions,
      instructionsAngle: res.instructions ? (res.instructionIdeas[0]?.angle ?? '') : f.instructionsAngle,
      pushTitle: res.pushTitle ?? f.pushTitle,
      pushBody: res.pushBody ?? f.pushBody,
    }))
    const toItem = (r: { productId: string; reason: string }): Item => ({ key: crypto.randomUUID(), productId: r.productId, reason: r.reason, source: SOURCE_AI })
    if (res.sections.some((sec) => sec.selected.length > 0)) {
      setItems(res.sections.flatMap((sec) => sec.selected.map(toItem)))
      setCandidates(res.sections.flatMap((sec, i) => sec.candidates.map((r) => ({ ...toItem(r), section: i }))))
    }
    if (res.sections.length > 0) {
      setSectionTitles(res.sections.map((sec) => sec.title))
      setSectionCopies(res.sections.map((sec) => sec.copy))
    }
    if (res.hero) {
      if (res.hero.hero) {
        setHeroId(res.hero.hero.heroId)
        setHeroReason(res.hero.hero.reason)
      }
      setHeroCandidates(res.hero.candidates)
    }
    drafts.applyAuto({
      themeIdeas: res.themeIdeas,
      copyIdeas: res.copyIdeas,
      instructionIdeas: res.instructionIdeas,
      pushIdeas: res.pushIdeas,
      titleCandidates: Object.fromEntries(res.sections.map((sec, i) => [i, sec.titles])),
      sectionCopyCandidates: Object.fromEntries(res.sections.map((sec, i) => [i, sec.copies])),
    })
    setSelectedKey(null)
    if (res.errors.length > 0) setError(t(`一部の工程で失敗しました: ${res.errors.join(' / ')}`, `Some steps failed: ${res.errors.join(' / ')}`))
  }

  async function startAutoDraft() {
    if (!form.scheduledAt) {
      setError(t('すべてAIで下書きするには、先に配信日時を入力してください', 'Enter the send date & time first to draft everything with AI'))
      return
    }
    cancelRef.current = false
    setError(null)
    setAuto({ label: t('準備しています', 'Getting ready'), done: 0, total: 7 })
    const res = await runAutoDraft(
      { card: buildAiCard(), language, otherThemes, products: poolProducts, heroes: poolHeroes, channel: templateChannel },
      (label, done, total) => setAuto({ label, done, total }),
      () => cancelRef.current || !aliveRef.current,
    )
    if (!cancelRef.current && aliveRef.current) applyAutoResult(res)
    setAuto(null)
  }

  const hasContent = !!(form.theme.trim() || form.headline.trim() || form.copy.trim() || form.instructions.trim() || items.length > 0 || heroId)

  function runAllManual() {
    if (hasContent && !window.confirm(t('現在のテーマ・ヘッドライン・コピー・商品・メイン画像・制作指示を、AIの下書きで置き換えます。よろしいですか?', 'This replaces the current theme, headline, copy, products, hero image, and production notes with an AI draft. Continue?'))) return
    void startAutoDraft()
  }

  // まとめて作った下書きを開いたときは、「すべてAIで下書き」の結果と同じように、最初に反映する(1 回だけ)
  const draftApplied = useRef(false)
  useEffect(() => {
    if (!draft || card || draftApplied.current) return
    draftApplied.current = true
    applyAutoResult(draft)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, card])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // 内容が空の既存のカードを開いたときは、自動で下書きを作る(同じカードで、1 回だけ)
  useEffect(() => {
    if (!card || !autoEnabled || original === null) return
    if (products.length === 0 || heroes.length === 0) return
    if (autoDrafted.has(card.id)) return
    autoDrafted.add(card.id)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!hasContent) void startAutoDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, original, products.length, heroes.length])

  // テンプレートを変えると、セクションの構成が変わるので、候補と商品選定の案は破棄する
  const changeTemplate = (id: EmailTemplateId) => {
    if (id === template) return
    setTemplate(id)
    setCandidates([])
    drafts.discardProposals()
  }

  const setSectionTitle = (i: number, text: string) =>
    setSectionTitles((prev) => {
      const next = [...prev]
      while (next.length <= i) next.push('')
      next[i] = text
      return next
    })

  const setSectionCopy = (i: number, text: string) =>
    setSectionCopies((prev) => {
      const next = [...prev]
      while (next.length <= i) next.push('')
      next[i] = text
      return next
    })

  const removeItem = (key: string) => {
    const idx = items.findIndex((i) => i.key === key)
    if (idx >= 0) {
      const section = sectionIndexAt(sectionsOf(template), idx)
      setCandidates([{ ...items[idx], section }, ...candidates])
    }
    setItems(items.filter((i) => i.key !== key))
    if (selectedKey === key) setSelectedKey(null)
  }

  // 差分を配信商品テーブルへ反映する(選定済み + 候補。削除 → 更新/追加)
  async function syncItems(cardId: string, cardName: string, before: Map<string, RowSnap>) {
    const sections = sectionsOf(template)
    const desired: { it: Item; state: typeof STATE_SELECTED | typeof STATE_CANDIDATE; section: number; order: number }[] = [
      ...items.map((it, idx) => ({ it, state: STATE_SELECTED as typeof STATE_SELECTED, section: sectionIndexAt(sections, idx), order: idx + 1 })),
      ...candidates.map((c, i) => ({ it: c as Item, state: STATE_CANDIDATE as typeof STATE_CANDIDATE, section: c.section, order: 1000 + i })),
    ]
    const keep = new Set(desired.map((d) => d.it.rowId).filter((id): id is string => !!id))
    for (const id of before.keys()) {
      if (!keep.has(id)) await DeliveryProductsService.delete(id)
    }
    for (const d of desired) {
      const fields = {
        sort_order: d.order,
        reason: d.it.reason,
        source: d.it.source,
        state: d.state,
        section: d.section,
      }
      let res
      if (d.it.rowId) {
        const old = before.get(d.it.rowId)
        if (old && old.reason === d.it.reason && old.source === d.it.source && old.state === d.state && old.section === d.section && old.order === d.order) continue
        res = await DeliveryProductsService.update(d.it.rowId, fields)
      } else {
        res = await DeliveryProductsService.create({
          ...fields,
          name: `${cardName} / ${productName(d.it.productId)}`,
          delivery_card_id: cardId,
          product_id: d.it.productId,
          state_code: 0,
        })
      }
      if (!res.success) throw new Error(res.error?.message ?? tr('掲載商品の保存に失敗しました', 'Failed to save the products in this delivery'))
    }
  }

  // 確定した週に入っている配信か(配信日時を変えるときは、移す前と移したあとの両方の週)。同じ週は 1 つにまとめる
  const lockedWeeks = [confirmedWeekOf(weeks, card?.scheduled_at), confirmedWeekOf(weeks, form.scheduledAt)].filter(
    (w, i, all): w is WeekRow => !!w && all.findIndex((x) => x?.id === w.id) === i,
  )
  const weekRange = (w: WeekRow) => {
    const s = new Date(`${w.week_start?.slice(0, 10)}T00:00:00`)
    const e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6)
    const f = (d: Date) => d.toLocaleDateString(locale(), { month: 'short', day: 'numeric' })
    return `${f(s)}–${f(e)}`
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    goNextRef.current = false
    requestSave()
  }

  /** 保存して、次の配信を開く(週のレビュー・確定で、閉じてカレンダーで探し直さずに済むように。FLOWS.md の C-1) */
  function saveAndNext() {
    goNextRef.current = true
    requestSave()
  }

  function requestSave() {
    // 確定した週の配信は、すぐには保存しない。理由を入力してもらってから、保存して、週をレビューに戻す
    if (lockedWeeks.length > 0) {
      setChangeReason((r) => r ?? '')
      return
    }
    void save()
  }

  /** 保存する内容(ステータスを除く)。保存と、承認済みの配信の内容が変わったかの判定(再承認)の両方で使う */
  function buildContent() {
    return {
        name: form.name,
        scheduled_at: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
        country: num(form.country),
        channel: num(form.channel),
        department: num(form.department),
        owner: form.owner.trim(),
        production_due: form.productionDue || (null as never),
        links: encodeLinks(links),
        push_link: pushLink ? JSON.stringify(pushLink) : '',
        audience: audience,
        push_title: form.pushTitle,
        push_body: form.pushBody,
        production_owner: form.productionOwner.trim(),
        handed_off_at: form.handedOffAt || (null as never),
        theme: form.theme,
        headline: form.headline,
        products: items.map((i) => productName(i.productId)).filter(Boolean).join(' / '),
        copy: form.copy,
        instructions: form.instructions,
        theme_reason: form.themeReason,
        copy_angle: form.copyAngle,
        instructions_angle: form.instructionsAngle,
        hero_reason: heroReason,
        // 標準のテンプレートは、以前の選択肢の列にも書く(互換)。作ったテンプレートは、layoutkey だけ
        email_template: TEMPLATE_VALUES[template],
        layout_key: template,
        section_titles: sectionTitles.join('\n').replace(/\n+$/, ''),
        section_copies: encodeCopies(sectionCopies),
        // 外したときは null を送ってルックアップを空にする
        hero_image_id: heroId
          ? heroId
          : card?.hero_image_id
            ? (null as never)
            : undefined,
    }
  }
  // 再承認の判定に使う、内容の要約。商品の名前の列は、商品の一覧の読み込みで変わるので、商品 ID の並びで比べる。
  // 開いたときの値(下の baseline)と比べる(保存済みの行と比べると、表し方の違いだけで「変わった」になるため)
  const contentKey = () => {
    const { products: _names, ...rest } = buildContent()
    void _names
    return JSON.stringify({ ...rest, items: items.map((i) => i.productId) })
  }
  const baseline = useRef<string | null>(null)
  useEffect(() => {
    // 掲載商品を読み込んだ時点(自動の下書きより前)の内容を、基準にする
    if (card && original !== null && baseline.current === null) baseline.current = contentKey()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, original])
  const savedStatus = card?.status ?? STATUS_NOT_STARTED
  const approvedBefore = !!card && statusRank(savedStatus) >= statusRank(STATUS_APPROVED)
  // 開いた時点から内容が変わったか(承認・依頼の前に、保存してもらうため。基準は ref なので、描画の中では読まず、関数で渡す)
  const isDirty = () => baseline.current !== null && baseline.current !== contentKey()
  // 承認(依頼・承認・差し戻し)を出すか: 保存済みで、確定していない配信(確定した週の配信は、確定後の変更の流れ)
  const canReview = !!card && lockedWeeks.length === 0 && statusRank(savedStatus) <= statusRank(STATUS_APPROVED)
  // 承認の依頼・承認で、サーバーが配信のステータスを変えたら、入力欄のステータスもそろえる(次の保存で、古いステータスを書き戻さないように)
  useEffect(() => {
    if (!card?.status) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((f) => (f.status === String(card.status) ? f : { ...f, status: String(card.status) }))
  }, [card?.status])

  /**
   * 保存する。reason を渡したとき(確定した週の変更)は、配信を「承認待ち」に戻し、週をレビュー中に戻して、理由を記録する。
   * 承認済みの配信の内容を変えたときは、承認のやり直しが必要なので「承認待ち」に戻し、いまの承認の依頼を古いものにする。
   * 承認・差し戻しそのものは、ここではなく ApprovalBar(サーバーの窓口 /api/approvals)で行う(U4)
   */
  async function save(reason?: string) {
    const goNext = goNextRef.current
    setSaving(true)
    setError(null)
    try {
      const formStatus = num(form.status) as DeliveryCard['status']
      const revoke = reason === undefined && approvedBefore && formStatus === card?.status && baseline.current !== null && baseline.current !== contentKey()
      // 確定後に変えた配信・承認済みの内容を変えた配信は、もう一度承認を受けるので「承認待ち」(reviewing)にする
      const status = reason !== undefined || revoke ? STATUS_REVIEW : formStatus
      const fields = { ...buildContent(), status: status as DeliveryCard['status'] }
      const res = card
        ? await DeliveryCardsService.update(card.id, fields)
        : await DeliveryCardsService.create({ ...fields, state_code: 0 })
      if (!res.success) throw new Error(res.error?.message ?? tr('保存に失敗しました', 'Failed to save'))
      const cardId = card?.id ?? res.data?.id
      if (!cardId) throw new Error(tr('配信カードのIDを取得できませんでした', 'Could not get the delivery card ID'))
      if (original) await syncItems(cardId, form.name, original)
      if (!card) onCreated?.(cardId)
      if (reason !== undefined) {
        const now = new Date().toISOString()
        for (const w of lockedWeeks) {
          const r = await WeeksService.update(w.id, { status: 'review', submitted_at: now })
          if (!r.success) throw new Error(r.error?.message ?? tr('週をレビュー中に戻せませんでした', 'Could not put the week back in review'))
        }
        const n = await CardNotesService.create({
          kind: 'change',
          body: reason.trim(),
          author: form.owner.trim(),
          delivery_card_id: cardId,
        })
        if (!n.success) throw new Error(n.error?.message ?? tr('変更の理由を記録できませんでした', 'Could not record the reason for the change'))
      }
      // 内容が変わったので、いまの承認の依頼は古いものにする(依頼し直してもらう。U4)
      if (card && (reason !== undefined || revoke)) {
        const a = await ApprovalsService.reset({ delivery_card_id: cardId })
        if (!a.success) throw new Error(a.error?.message ?? tr('承認の依頼を古いものにできませんでした', 'Could not mark the approval request as stale'))
      }
      // 承認の履歴(W6): 保存済みの配信のステータスが変わったら、誰が・いつ・何から何にしたかを残す
      if (card && (reason !== undefined || card.status !== fields.status)) {
        await logEvent({
          action: reason !== undefined ? 'reopen' : revoke ? 'revoke' : 'status',
          card: { id: cardId, name: form.name, scheduledAt: fields.scheduled_at },
          from: card.status,
          to: fields.status,
          note: reason?.trim(),
        })
      }
      await onSaved()
      goNextRef.current = false
      if (goNext && next && onNext) onNext()
      else onBack()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const progress = progressOf({
    theme: form.theme,
    template,
    heroId,
    headline: form.headline,
    items,
    instructions: form.instructions,
    links: linksComplete(linkSpots, links, templateChannel === 'push' ? { tapDone: tapComplete(pushLink) } : undefined),
    push: templateChannel === 'push' ? { title: form.pushTitle, body: form.pushBody, timing: !!audience } : undefined,
  })
  const hero = heroes.find((h) => h.id === heroId)

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open && !saving) onBack() }}>
      <DialogSurface ref={surfaceRef} className={styles.surface} style={sizeStyle} aria-label={card ? card.name : t('配信カードの新規作成', 'New delivery card')}>
        <ResizeHandles
          onResize={resizeDialog}
          onDone={() =>
            setSize((s) => {
              savePref(SIZE_KEY, s)
              return s
            })
          }
          onReset={() => {
            setSize(null)
            savePref(SIZE_KEY, null)
          }}
        />
        <form onSubmit={submit} className={styles.form}>
          {auto && (
            <div className={styles.overlay}>
              <Spinner size="large" />
              <Text as="h2" size={500} weight="semibold">{t('AIが下書きを作っています', 'AI is drafting')}</Text>
              <Text>{auto.label}({Math.min(auto.done + 1, auto.total)} / {auto.total})</Text>
              <ProgressBar className={styles.overlayBar} value={Math.min(1, auto.done / auto.total)} />
              <Caption1 className={styles.caption}>
                {t('結果は画面に反映されるだけで、保存はされません。気に入らなければ、保存せずに閉じられます。', 'Results are only applied on screen and are not saved. If you do not like them, close without saving.')}
              </Caption1>
              <Button
                type="button"
                appearance="subtle"
                onClick={() => {
                  cancelRef.current = true
                  setAuto(null)
                }}
              >
                {t('スキップして開く', 'Skip and open')}
              </Button>
            </div>
          )}
          <div className={styles.titleRow}>
            <Text as="h2" size={500} weight="semibold" className={styles.titleText}>{card ? card.name : t('配信カードの新規作成', 'New delivery card')}</Text>
            <Tooltip
              relationship="description"
              content={progress.remaining.length ? t(`未完了: ${progress.remaining.join('、')}`, `Incomplete: ${progress.remaining.join(', ')}`) : t('すべての工程が完了しています', 'All steps are complete')}
            >
              <Badge appearance="tint" color={progress.done === progress.total ? 'success' : 'informative'} size="large">
                {t(`工程 ${progress.done} / ${progress.total}`, `Steps ${progress.done} / ${progress.total}`)}
              </Badge>
            </Tooltip>
            {card && onOpenResults && card.scheduled_at && new Date(card.scheduled_at) < new Date() && (
              <Button type="button" size="small" appearance="secondary" icon={<DataBarVerticalRegular />} onClick={() => onOpenResults(card.id)}>
                {t('結果を見る', 'View results')}
              </Button>
            )}
            {/* 取りやめ・削除(保存済みの配信だけ) */}
            {card && (
              <CardMenu
                card={card}
                weeks={weeks}
                onChanged={async () => {
                  await onSaved()
                  onBack()
                }}
                onDeleted={async () => {
                  await onSaved()
                  onBack()
                }}
              />
            )}
            <Button type="button" appearance="subtle" icon={<DismissRegular />} onClick={onBack} aria-label={t('閉じる', 'Close')} />
          </div>
          {card?.cancelled_at && (
            <MessageBar layout="multiline" intent="warning" className={styles.locked}>
              <MessageBarBody>
                {t(
                  `この配信は取りやめ済みです(${new Date(card.cancelled_at).toLocaleString(locale())})。理由: ${card.cancel_reason || '—'}。元に戻すときは、右上の「…」から「取りやめを取り消す」`,
                  `This delivery was cancelled (${new Date(card.cancelled_at).toLocaleString(locale())}). Reason: ${card.cancel_reason || '—'}. To restore it, use "…" > "Undo cancellation".`,
                )}
              </MessageBarBody>
            </MessageBar>
          )}

          {approvedBefore && lockedWeeks.length === 0 && (
            <MessageBar layout="multiline" intent="info" className={styles.locked}>
              <MessageBarBody>
                {t(
                  'この配信は承認済みです。内容を変えて保存すると「承認待ち」に戻り、承認の依頼からやり直しになります。',
                  'This delivery is approved. If you change the content and save, it goes back to awaiting approval and needs a new approval request.',
                )}
              </MessageBarBody>
            </MessageBar>
          )}
          {lockedWeeks.length > 0 && (
            <MessageBar layout="multiline" intent="warning" className={styles.locked}>
              <MessageBarBody>
                {t(
                  `この配信の週(${lockedWeeks.map(weekRange).join('、')})は確定済みです。変更を保存するときは、理由を入力します。保存すると、この配信は「承認待ち」に戻り、週の確定は解けます。`,
                  `The week of this delivery (${lockedWeeks.map(weekRange).join(', ')}) is confirmed. To save changes, enter a reason. Saving puts this delivery back to awaiting approval and the week is no longer confirmed.`,
                )}
              </MessageBarBody>
            </MessageBar>
          )}

          {/* この配信のアラート(在庫・方針・日程)。どこに問題があるかを、開いた瞬間にわかるように */}
          {alerts.length > 0 && (
            <CardAlertsBar
              alerts={alerts}
              selectedProductId={items.find((i) => i.key === selectedKey)?.productId}
              onSelectProduct={(pid) => {
                const it = items.find((i) => i.productId === pid)
                if (it) setSelectedKey(it.key)
              }}
            />
          )}
          {/* これまでの学び(同じテンプレート・テーマの種類の、過去の配信のメモ)。保存済みの配信だけ */}
          {card && (
            <LearningsBar card={card} templateId={template} country={form.country} channel={form.channel} name={form.name} theme={form.theme} headline={form.headline} />
          )}

          <div ref={panesRef} className={styles.panes} style={{ '--w0': `${widths[0]}px`, '--w1': `${widths[1]}px`, '--w2': `${infoOpen ? widths[2] : RAIL_W}px`, '--w3': `${processOpen ? widths[3] : RAIL_W}px` } as React.CSSProperties}>
            {/* 左: 配信の情報 */}
            <div className={styles.pane}>
              <Button
                appearance="primary"
                icon={<AiIcon tone="white" size={18} />}
                onClick={runAllManual}
                disabled={!!auto || saving}
                className={styles.fullWidth}
              >
                {t('すべてAIで下書き', 'Draft everything with AI')}
              </Button>
              <Caption1 className={mergeClasses(styles.caption, styles.captionTight)}>
                {t('テーマ・メイン画像・ヘッドライン・セクション・制作指示を、まとめてAIが下書きします', 'AI drafts the theme, hero image, headline, sections, and production notes all at once')}
              </Caption1>
              <Text weight="semibold" size={300}>{t('配信情報', 'Delivery info')}</Text>
              <Field label={t('配信名', 'Delivery name')} required>
                <Input size="small" required value={form.name} onChange={(_, d) => set('name')(d.value)} />
              </Field>
              <Field label={t('配信日時', 'Send date & time')} required>
                <Input size="small" required type="datetime-local" value={form.scheduledAt} onChange={(_, d) => set('scheduledAt')(d.value)} />
              </Field>
              <div className={styles.twoCol}>
                <OptionSelect label={t('国', 'Country')} value={form.country} options={countryOptions} onChange={set('country')} />
                <OptionSelect label={t('チャネル', 'Channel')} value={form.channel} options={channelOptions} onChange={set('channel')} />
                <OptionSelect label={t('種別', 'Type')} value={form.department} options={departmentOptions} onChange={set('department')} />
                <Field label={t('ステータス', 'Status')}>
                  <div className={styles.statusRow}>
                    <span className={styles.dot} style={{ backgroundColor: statusColor(form.status) }} />
                    <Select size="small" className={styles.grow} value={form.status} onChange={(_, d) => set('status')(d.value)}>
                      {statusOptions.map((o) => (
                        <option key={o.value} value={String(o.value)}>{optionLabel(o.label)}</option>
                      ))}
                      {/* 確定した週の配信の値(confirmed)は、画面の選択肢にはない(確定は週の言葉)ので、その値のときだけ出す */}
                      {form.status === 'confirmed' && <option value="confirmed">{t('承認済み(週が確定)', 'Approved (week confirmed)')}</option>}
                    </Select>
                  </div>
                </Field>
              </div>
              <div className={styles.twoCol}>
                <Field label={t('担当者', 'Owner')}>
                  <Input size="small" list="ccp-owners" value={form.owner} onChange={(_, d) => set('owner')(d.value)} />
                  <datalist id="ccp-owners">
                    {owners.map((o) => <option key={o} value={o} />)}
                  </datalist>
                </Field>
                {/* 制作の担当者・締め切り・引き継ぎ済みは、右端のプロセスのペインの「引き継ぎ」だけで決める(2 か所で入力しない。FLOWS の C-3)。ここは表示だけで、押すとそのタブが開く(閉じていれば開く) */}
                <Field label={t('制作への引き継ぎ', 'Handoff to production')} className={styles.handoffField}>
                  <button type="button" className={styles.handoffSummary} onClick={() => {
                    if (!processOpen) toggleProcess()
                    setTabRequest((r) => ({ tab: 'handoff', seq: (r?.seq ?? 0) + 1 }))
                  }} title={t('引き継ぎのタブで決める', 'Set in the Handoff tab')}>
                    <span>
                      <span className={styles.caption}>{t('担当 ', 'Assignee ')}</span>
                      {form.productionOwner.trim() || <span className={styles.caption}>{t('(未設定)', '(not set)')}</span>}
                      <span className={styles.caption}>{t(' ・ 締め切り ', ' · Due ')}</span>
                      {form.productionDue ? form.productionDue.replace(/-/g, '/') : <span className={styles.caption}>{t('(未設定)', '(not set)')}</span>}
                    </span>
                    <span>
                      {form.handedOffAt ? (
                        <span className={mergeClasses(styles.success, styles.handoffItem)}>{t('引き継ぎ済み ', 'Handed off ')}{new Date(form.handedOffAt).toLocaleString(locale(), { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      ) : (
                        <span className={styles.caption}>{t('まだ引き継いでいない', 'Not handed off yet')}</span>
                      )}
                      <span className={styles.handoffLink}>{t('引き継ぎのタブで決める ›', 'Set in the Handoff tab ›')}</span>
                    </span>
                  </button>
                </Field>
              </div>
              <Text weight="semibold" size={300} className={styles.sectionHead}>{t('工程', 'Steps')}</Text>
              <Field label={t('テーマ(配信全体の前提。メールには出ません)', 'Theme (premise for the whole delivery; not shown in the email)')}>
                <AutoTextarea
                  size="small"
                  rows={2}
                                    className={form.theme ? styles.filled : undefined}
                  value={form.theme}
                  onChange={(_, d) => set('theme')(d.value)}
                />
              </Field>
              {form.theme && form.themeReason && <Caption1 className={styles.caption}><span className={styles.lead}>{t('AIの理由:', 'AI rationale:')}</span>{` ${form.themeReason}`}</Caption1>}
              <Caption1 className={items.length ? styles.success : styles.caption}>
                {t(`掲載商品: ${items.length}件(中央の「セクション」タブで選びます)`, `Products in this delivery: ${items.length} (choose them in the Sections tab in the middle)`)}
              </Caption1>
              <Field label={t('ヘッドライン(メイン画像に載せる大見出し)', 'Headline (the large heading on the hero image)')}>
                <AutoTextarea
                  size="small"
                  rows={1}
                                    className={form.headline ? styles.filled : undefined}
                  value={form.headline}
                  onChange={(_, d) => set('headline')(d.value)}
                />
              </Field>
              <Field label={t('コピー(ヘッドラインの下の導入文)', 'Copy (intro text below the headline)')}>
                <AutoTextarea
                  size="small"
                  rows={2}
                                    className={form.copy ? styles.filled : undefined}
                  value={form.copy}
                  onChange={(_, d) => set('copy')(d.value)}
                />
              </Field>
              {(form.headline || form.copy) && form.copyAngle && <Caption1 className={styles.caption}><span className={styles.lead}>{t('切り口:', 'Angle:')}</span>{` ${form.copyAngle}`}</Caption1>}
              <Field label={t('制作指示', 'Production notes')}>
                {/* 中央の「⑥ 制作指示」と同じエディタ(値は 1 つ。どちらで書き換えても、両方が変わる) */}
                <NotesEditor value={form.instructions} onChange={set('instructions')} minHeight="120px" />
              </Field>
              {form.instructions && form.instructionsAngle && <Caption1 className={styles.caption}><span className={styles.lead}>{t('切り口:', 'Angle:')}</span>{` ${form.instructionsAngle}`}</Caption1>}
            </div>

            <Splitter onDrag={resize(0)} onDone={saveWidths} />

            {/* 中: コンテンツ生成(テーマ・商品選定・コピー・制作指示) */}
            <div className={mergeClasses(styles.pane, styles.paneMid)}>
              <ContentPane
                theme={form.theme}
                headline={form.headline}
                copy={form.copy}
                instructions={form.instructions}
                themeReason={form.themeReason}
                copyAngle={form.copyAngle}
                instructionsAngle={form.instructionsAngle}
                onField={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
                template={template}
                onTemplate={changeTemplate}
                sectionTitles={sectionTitles}
                onSectionTitle={setSectionTitle}
                sectionCopies={sectionCopies}
                onSectionCopy={setSectionCopy}
                products={products}
                heroes={heroes}
                poolProducts={poolProducts}
                poolHeroes={poolHeroes}
                items={items}
                setItems={setItems}
                candidates={candidates}
                setCandidates={setCandidates}
                heroId={heroId}
                setHeroId={setHeroId}
                heroReason={heroReason}
                setHeroReason={setHeroReason}
                heroCandidates={heroCandidates}
                setHeroCandidates={setHeroCandidates}
                drafts={drafts}
                disabled={saving}
                links={links}
                onLinks={setLinks}
                handoff={{ productionOwner: form.productionOwner, handedOffAt: form.handedOffAt, productionDue: form.productionDue }}
                onHandoff={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                tabRequest={stepRequest}
                people={owners}
                cardId={card?.id}
                owner={form.owner}
                cardName={form.name}
                channel={templateChannel}
                pushLink={pushLink}
                onPushLink={setPushLink}
                audience={audience}
                onAudience={setAudience}
                pushTitle={form.pushTitle}
                pushBody={form.pushBody}
                onPush={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                scheduledAt={form.scheduledAt}
                campaign={campaignSlug(form.name, form.scheduledAt)}
                onLinksTab={setLinksTab}
                onLinkFocus={setLinkFocus}
              />
            </div>

            <Splitter onDrag={resize(1)} onDone={saveWidths} />

            {/* 右: プレビュー */}
            <div className={mergeClasses(styles.pane, styles.panePreview)}>
              <div className={styles.toolbar}>
                <div className={mergeClasses(styles.grow, styles.previewHead)}>
                  {previewTab === 'push' ? <PhoneRegular /> : <MailRegular />}
                  <Text weight="semibold" size={300}>{previewTab === 'push' ? t('アプリのプレビュー', 'App preview') : t('メールのプレビュー', 'Email preview')}</Text>
                  {!form.channel && <Caption1 className={styles.caption}>{t('チャネルが未設定のため、メールで表示しています', 'No channel set — showing the email')}</Caption1>}
                </div>
                <div className={styles.zoomBox}>
                  <Button type="button" size="small" appearance="subtle" icon={<SubtractRegular />} onClick={() => stepZoom(-0.1)} aria-label={t('縮小', 'Zoom out')} />
                  <Slider
                    size="small"
                    className={styles.slider}
                    min={ZOOM_MIN * 100}
                    max={ZOOM_MAX * 100}
                    step={5}
                    value={Math.round(shownZoom * 100)}
                    onChange={(_, d) => setZoom(d.value / 100)}
                    aria-label={t('プレビューの倍率', 'Preview zoom')}
                  />
                  <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} onClick={() => stepZoom(0.1)} aria-label={t('拡大', 'Zoom in')} />
                  <Caption1 className={styles.zoomLabel}>{Math.round(shownZoom * 100)}%</Caption1>
                  {/* ボタンの文字は、押したときの動きを表す: 全体表示にする前は「全体」、全体表示のときは「100%」(押すと100%に戻る) */}
                  <Button
                    type="button"
                    size="small"
                    appearance={zoom === 'fit' ? 'primary' : 'outline'}
                    onClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')}
                    aria-label={zoom === 'fit' ? t('100% の倍率に戻す', 'Reset to 100%') : t('メール全体を表示', 'Fit the whole email')}
                  >
                    {zoom === 'fit' ? '100%' : t('全体', 'Fit')}
                  </Button>
                </div>
                {previewTab === 'email' && template === 'free' && (
                  <>
                    <Switch label={t('カテゴリ見出し', 'Category headings')} checked={showHeadings} onChange={(_, d) => setShowHeadings(d.checked)} />
                    <Button type="button" size="small" appearance="subtle" onClick={groupByCategory} disabled={items.length < 2}>{t('カテゴリでまとめる', 'Group by category')}</Button>
                  </>
                )}
              </div>
              <div ref={previewBoxRef} className={styles.previewBox}>
                <div ref={previewInnerRef} style={{ zoom: zoom === 'fit' ? undefined : zoom }}>
                  <Preview
                    channel={previewTab}
                    pushLinkKind={pushLink?.kind}
                    pushTitle={form.pushTitle}
                    pushBody={form.pushBody}
                    subject={form.name}
                    headline={form.headline}
                    copy={form.copy}
                    items={items}
                    products={products}
                    selectedKey={selectedKey}
                    hoverKey={hoverKey}
                    showHeadings={showHeadings}
                    template={template}
                    scheduledAt={form.scheduledAt}
                    sectionTitles={sectionTitles}
                    onSectionTitle={setSectionTitle}
                    sectionCopies={sectionCopies}
                    onSectionCopy={setSectionCopy}
                    hero={hero}
                    onDropHero={setHeroId}
                    onClearHero={() => setHeroId(undefined)}
                    onSelect={setSelectedKey}
                    onRemove={removeItem}
                    onMove={(key, d) => {
                      const i = items.findIndex((x) => x.key === key)
                      moveItem(i, i + d)
                    }}
                    onDropAt={dropAt}
                  />
                </div>
                <LinkOverlay boxRef={previewBoxRef} slots={linkSpots} urlOf={linkUrlOf} productLink={productLinkOf} linksMode={linksTab} focusKey={linkFocus} />
              </div>
            </div>

            <Splitter onDrag={infoOpen ? resizeInfo : () => undefined} onDone={saveWidths} />

            {/* 右端: 商品情報(参照用。操作はしない) */}
            {infoOpen ? (
              <div className={styles.pane}>
                <div className={styles.infoToolbar}>
                  <Button type="button" size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={toggleInfo} aria-label={t('商品情報を閉じる', 'Collapse product info')} />
                </div>
                <ProductInfoPane
                  template={template}
                  sectionTitles={sectionTitles}
                  items={items}
                  products={products}
                  onHover={setHoverKey}
                  alertKinds={new Map(CARD_ALERT_ORDER.slice().reverse().flatMap((k) => alerts.filter((a) => a.kind === k && a.productId).map((a) => [a.productId!, k] as const)))}
                />
              </div>
            ) : (
              <div className={styles.rail}>
                <Button type="button" size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={toggleInfo} aria-label={t('商品情報を開く', 'Open product info')} />
                <span className={styles.railLabel}>{t('商品情報', 'Product info')}</span>
              </div>
            )}

            <Splitter onDrag={processOpen ? resizeProcess : () => undefined} onDone={saveWidths} />

            {/* 右端: プロセス(状態・承認・引き継ぎ・質問・タスク・コメント)。作る(左〜商品情報)と、進めるを分ける */}
            {processOpen ? (
              <div className={mergeClasses(styles.pane, styles.paneMid)}>
                <div className={styles.infoToolbar} style={{ padding: '4px 4px 0', marginBottom: 0 }}>
                  <Button type="button" size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={toggleProcess} aria-label={t('プロセスを閉じる', 'Collapse process')} />
                </div>
                <ProcessPane
                  card={card}
                  status={form.status}
                  canReview={canReview}
                  locked={lockedWeeks.length > 0}
                  isDirty={isDirty}
                  busy={saving}
                  onChanged={onSaved}
                  handoff={{ productionOwner: form.productionOwner, handedOffAt: form.handedOffAt, productionDue: form.productionDue }}
                  onHandoff={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                  instructions={form.instructions}
                  onEditInstructions={() => setStepRequest((r) => ({ tab: 'instructions', seq: (r?.seq ?? 0) + 1 }))}
                  remaining={progress.remaining}
                  people={owners}
                  cardName={form.name}
                  productIds={items.map((it) => it.productId)}
                  products={products}
                  tabRequest={tabRequest}
                />
              </div>
            ) : (
              <ProcessRail card={card} status={form.status} onOpen={toggleProcess} />
            )}
          </div>

          {error && (
            <MessageBar layout="multiline" intent="error" className={styles.error}>
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}
          {changeReason !== null && lockedWeeks.length > 0 && (
            <div className={styles.reasonBox}>
              <Field label={t('確定後の変更の理由', 'Reason for changing a confirmed week')} required size="small">
                <AutoTextarea
                  rows={2}
                  size="small"
                  autoFocus
                  value={changeReason}
                  onChange={(_, d) => setChangeReason(d.value)}
                  placeholder={t('例: 在庫切れのため、商品を差し替え', 'e.g. Swapped a product that went out of stock')}
                />
              </Field>
              <div className={styles.reasonActions}>
                <Button
                  type="button"
                  size="small"
                  onClick={() => {
                    goNextRef.current = false
                    setChangeReason(null)
                  }}
                  disabled={saving}
                >
                  {t('やめる', 'Back')}
                </Button>
                <Button type="button" size="small" appearance="primary" icon={<SaveRegular />} disabled={saving || !changeReason.trim()} onClick={() => void save(changeReason)}>
                  {t('保存して、レビューに戻す', 'Save and send back to review')}
                </Button>
              </div>
            </div>
          )}
          <div className={styles.actions}>
            <Button type="button" onClick={onBack} disabled={saving}>{t('キャンセル', 'Cancel')}</Button>
            {/* 次がないときも消さずに、選べないだけにする(ボタンの位置を変えない。PRINCIPLES.md 2-2) */}
            {next !== undefined && (
              <Tooltip
                relationship="description"
                content={next ? t(`保存して、次の配信「${next.name}」を開きます(${next.position})`, `Save and open the next delivery "${next.name}" (${next.position})`) : t('次の配信はありません(この週・この確認の項目の、最後の配信です)', 'No next delivery (this is the last one in this week or check item)')}
              >
                <Button type="button" icon={<ArrowNextRegular />} iconPosition="after" disabled={saving || !next || (changeReason !== null && lockedWeeks.length > 0)} onClick={saveAndNext}>
                  {t('保存して次へ', 'Save and next')}
                </Button>
              </Tooltip>
            )}
            <Button type="submit" appearance="primary" icon={<SaveRegular />} disabled={saving || (changeReason !== null && lockedWeeks.length > 0)}>
              {saving ? t('保存中...', 'Saving...') : lockedWeeks.length > 0 ? t('理由を入力して保存', 'Save with a reason') : t('保存', 'Save')}
            </Button>
          </div>
        </form>
      </DialogSurface>
    </Dialog>
  )
}
