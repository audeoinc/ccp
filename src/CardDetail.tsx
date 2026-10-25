import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useStableCallback } from './useStableCallback'
import {
  Badge,
  Button,
  Caption1,
  Dialog,
  Field,
  MenuItem,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  ProgressBar,
  Select,
  Slider,
  Spinner,
  Switch,
  Text,
  ToggleButton,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { AddRegular, ArrowNextRegular, BeakerRegular, CheckmarkCircleRegular, CommentAddRegular, ChevronRightRegular, DataBarVerticalRegular, DesktopRegular, DismissRegular, MailRegular, PhoneRegular, SaveRegular, SubtractRegular } from '@fluentui/react-icons'
import { locale, tr, useT } from './i18n'
import { AiIcon } from './AiMark'
import { ProductInfoPane } from './ProductInfoPane'
import { cardMarket, heroMarket, productMarket } from './market'
import { AutoTextarea } from './AutoTextarea'
import { DeliveryCardsService } from './data/deliveryCards'
import type { DeliveryCard } from './models/deliveryCards'
import { DeliveryProductsService } from './data/deliveryProducts'
import type { Product } from './models/products'
import type { HeroImage } from './models/heroImages'
import { ChannelBadge } from './ChannelBadge'
import { CopyLinkButton } from './CopyLinkButton'
import { FaceBadge } from './FaceBadge'
import { THEME_TYPES, themeTypeLabel, type ThemeType } from './themeTypes'
import { AUDIENCES, audienceLabel, fitsTarget, targetText } from './target'
import { ContentPane } from './ContentPane'
import { Preview } from './Preview'
import { DEFAULT_PUSH_TEMPLATE, DEFAULT_TEMPLATE, TEMPLATE_VALUES, channelOf, sectionIndexAt, sectionsOf, templateFromValue, type EmailTemplateId, type TemplateChannel, baseTemplateId, currentVersion, getTemplate, splitTemplateKey, templateKeyOfCard, templateMissing, templatesSettled, useTemplates } from './templates'
import { remapSectionTexts } from './tables'
import { parsePushLink, tapComplete, type PushLink } from './pushLink'
import { Splitter } from './Splitter'
import { useStoredWidths } from './floatLayout'
import { DND_ITEM, DND_PRODUCT, SOURCE_AI, SOURCE_MANUAL, STATE_CANDIDATE, STATE_SELECTED, type Candidate, type Item } from './items'
import type { AiCard, CopyLanguage, ProposedHero } from './aiSelect'
import { progressOf } from './progress'
import { ResizableSurface } from './ResizableSurface'
import { campaignId, campaignSlug, encodeLinks, productContent, fcmText, linkSlots, linksComplete, parseLinks, productUrl, screenOf, withUtm, type LinkSlot, type Links, utmFor, variantCampaign } from './links'
import { LinkOverlay } from './LinkOverlay'
import { loadAutoDraft, loadPref, loadSimpleCard, readRaw, savePref, saveSimpleCard, writeRaw } from './settings'
import { PREF } from './prefKeys'
import { runAutoDraft, type AutoDraftResult } from './autoDraft'
import { useAiDrafts } from './useAiDrafts'
import { useAbVariants, type VariantData } from './useAbVariants'
import { useCardAlerts } from './useCardAlerts'
import type { Form } from './cardForm'
import type { WeekRow } from './data/weeks'
import { CardNotesService } from './data/cardNotes'
import { confirmedWeekOf, reopenWeek, scopeOfCard } from './weekLock'
import { logEvent, myName } from './history'
import { ProcessPane, ProcessRail, type TalkTab } from './ProcessPane'
import type { TopTab } from './ContentPane'
import { ApprovalsService } from './data/approvals'
import { CHANNEL_PUSH, channelOptions, countryOptions, statusOptions, statusRank } from './status'
import { LearningsBar } from './LearningsBar'
import { CardMenu } from './CardMenu'
import { ResolvedPinsToggle } from './ResolvedPinsToggle'
import { CardAlertsBar } from './CardAlertsBar'
import { AbDecidedBar, AbTestBar } from './AbTestBar'
import { HeroUploadDialog } from './HeroUploadDialog'
import { CreativeAssets } from './CreativeAssets'
import { isUsableHero } from './heroRights'
import { AbCompare } from './AbCompare'
import { templateUse } from './templateUse'
import { allVariants, encodeAbTest, isChoose, metricLabel, nextVariant, ownsHero, ownsAnyText, ownsProducts, ownsSubject, ownsTemplate, targetLabel, type VariantKey } from './abTest'
import { ProductActionFloat, type SwapOption } from './ProductActionFloat'
import { ItemAlertOverlay } from './ItemAlertOverlay'
import { ChoiceField, NameField, OwnerField, ScheduledAtField, StatusField, TargetField } from './DeliveryInfoFields'
import { confirmDialog } from './confirm'
import { PreviewPins } from './PreviewPins'
import { pinView } from './pinStore'
import type { StockModel } from './alerts'
import type { CardAlert } from './cardAlerts'
import { viewWidth } from './uiScale'
import { SimpleCardLayout } from './simple/SimpleCardLayout'
import type { AiPreview, SimpleEditor } from './simple/editor'
import { nextStepOf, type NextStep } from './simple/nextStep'
import { useUndo } from './simple/useUndo'
import { ViewSwitch } from './simple/ViewSwitch'
import { AbSettings } from './simple/AbSettings'
import { PinFloat } from './PinFloat'
import { focusSoon, type ContextItem } from './ContextMenu'
import { usePreviewPins } from './usePreviewPins'
import { heroImage } from './images'
import { previewMenuItems } from './previewMenu'
import { PaneRail } from './PaneRail'

/** 新規作成のときに、最初から入れておく値(カレンダーで押した日付、絞り込み中の国・チャネル・種別。まとめて作った下書きを開くときは、名前も) */
export type NewCardDefaults = Partial<Pick<Form, 'name' | 'scheduledAt' | 'country' | 'channel' | 'themeType'>>

interface Props {
  /** undefined のときは新規作成 */
  card?: DeliveryCard
  /** 新規作成のときだけ使う */
  defaults?: NewCardDefaults
  /**
   * 新規作成で、中身まで入れて開く(まとめて作る作業画面の、まだ保存していない AI の案)。
   * 保存すると新しい配信カードになり、onCreated で id を返す(作業画面が、その案を保存済みにする)
   */
  draft?: { card: DeliveryCard; items: Item[]; candidates: Candidate[] }
  onCreated?: (id: string) => void
  /** 新しい配信を「保存」(閉じない)したとき、保存した配信として開き直す(X52) */
  onReopen?: (id: string) => void
  /** メイン画像のライブラリを読み直す(画像を上げたあと。X59) */
  onHeroesChanged?: () => Promise<void>
  /** この配信の週に、商品を載せる配信の数(週の上限超えのアラートの差し替えで、上限に届いた商品を候補から除く) */
  weekUse?: Map<string, number>
  products: Product[]
  heroes: HeroImage[]
  /** 他の配信で使われているテーマ(テーマ案の重複回避用) */
  otherThemes: string[]
  /** すべての配信(テンプレートの最近の使用回数を数える。X4) */
  allCards?: DeliveryCard[]
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
  /** 在庫の見込み(アラートへの対応で、差し替えの候補を選ぶのに使う) */
  stockModel?: StockModel
  /** アラートの画面を開く(その商品のアラートを選んで。配信カードは閉じる) */
  onOpenAlerts?: (productId?: string) => void
  /** 制作のページを開く(プロセスのペインの「制作の依頼」の札から。PR4) */
  onOpenProduction?: (cardId: string, opts?: { request?: boolean }) => void
  /** 題名の左に出す、配信の段階の帯(計画・制作・結果を行き来する。StageNav)。新規作成のときはなく、面の札を出す */
  stageNav?: ReactNode
  /** 同じ段階の帯の、タブの見せ方(シンプルな配信カードの上の帯の 2 段目。StageHeader) */
  stageTabs?: ReactNode
  /** 最初に開く工程のタブ(リンクから開いたとき。X36) */
  initialTab?: string
  /** 工程のタブが変わったとき(URL に持たせる) */
  onTabChange?: (tab: string) => void
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


// 空の項目は、DB から null で届く。String(null) は「null」という文字になり、保存すると「使えない値」になるので、空の文字にする
const str = (v?: string | null) => (v === undefined || v === null ? '' : String(v))

const toForm = (c?: DeliveryCard): Form => ({
  name: c?.name ?? '',
  scheduledAt: toLocalInput(c?.scheduled_at),
  country: str(c?.country),
  channel: str(c?.channel),
  themeType: str(c?.theme_type),
  status: c?.status === undefined || c.status === null ? String(statusOptions[0].value) : String(c.status),
  owner: c?.owner ?? '',
  targetGender: str(c?.target_gender),
  targetAges: str(c?.target_ages),
  pushTitle: c?.push_title ?? '',
  subject: c?.subject ?? '',
  preheader: c?.preheader ?? '',
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

// 既定を「全体(fit)」に変えたので、キーの版を上げて、以前に保存した倍率は使わない(鍵は prefKeys.ts)
const ZOOM_KEY = PREF.cardPreviewZoom
const ZOOM_MIN = 0.15  // 長いテンプレートも、「全体」で収まるように、小さくできる
const ZOOM_MAX = 1.2

/** プレビューの倍率: 数値(1 = 現在のサイズ)または 'fit'(メール全体を画面の高さに収める) */
function loadZoom(): number | 'fit' {
  // 読めなければ既定値を使う
  const v = loadPref<unknown>(ZOOM_KEY, null)
  if (v === 'fit') return 'fit'
  if (typeof v === 'number' && v >= ZOOM_MIN && v <= ZOOM_MAX) return v
  // 既定は、メール全体が見える倍率(作り始めに、構成の全体を見渡せるように)
  return 'fit'
}

/** 自動下書きを済ませたカード(同じカードを開き直しても、再実行しない) */
const autoDrafted = new Set<string>()

// 4 つめの幅(右端のプロセスのペイン)を足したので、版を上げた(2026-10-17)
const WIDTH_KEY = PREF.cardPaneWidths
// ダイアログの大きさ(辺・角のドラッグで変える。ResizableSurface。鍵は以前からの cardDetail.size)
const MIN_DIALOG = { w: 900, h: 560 }
// 既定を「開く」に変えたので、キーの版を上げて、以前に保存した開閉は使わない
const INFO_KEY = PREF.cardInfoOpen
const RAIL_W = 32
// 右端のプロセスのペイン(状態・承認・やり取り)の開閉。既定は開く
const PROCESS_KEY = PREF.cardProcessOpen

/** 商品情報ペインを開くか。保存がなければ、開いておく(選んだ商品の売上・在庫を、すぐ確かめられるように) */
// 保存は 'open' / 'closed' の文字のまま(以前からの形)。読めないときは、既定(開く)にする
const loadInfoOpen = (): boolean => readRaw(INFO_KEY) !== 'closed'
const MIN_W = 220
const MAX_W = 640
const clamp = (v: number) => Math.min(MAX_W, Math.max(MIN_W, v))
// 中央(コンテンツ生成)は、プレビューと商品情報がつぶれない範囲で、いくらでも広げられる
// (上限は、ドラッグのときに、その時のダイアログの幅から求める。CSS でも、プレビューの最小幅を残すよう抑える)
const MIN_PREVIEW = 320
const clampMid = (v: number, max = 4000) => Math.min(Math.max(MIN_W, max), Math.max(MIN_W, v))

const loadOpen = (key: string): boolean => readRaw(key) !== 'closed'

type Widths = [number, number, number, number]
function readWidths(v: unknown): Widths {
  if (Array.isArray(v) && v.length === 4) return [clamp(Number(v[0])), clampMid(Number(v[1])), clamp(Number(v[2])), clamp(Number(v[3]))]
  // 既定値: ダイアログの幅(最大 1800px)に合わせる。左 18%・中 26%・商品情報 15%・プロセス(右端)17%・プレビューは残り
  const total = Math.min(1800, viewWidth() * 0.98)
  return [clamp(Math.round(total * 0.18)), clamp(Math.round(total * 0.26)), clamp(Math.round(total * 0.15)), clamp(Math.round(total * 0.17))]
}

/** 読み込み時点の配信商品の行(保存時の差分判定用) */
interface RowSnap {
  reason: string
  source: string
  state: string
  section: number
  order: number
  /** AB テストの案(空 = A。X55) */
  variant: string
  /** この配信で使う画像(X64) */
  image: string
}


/** 元に戻す(SU1 ⑫)の 1 つ分: 反映の前の、配信カードの中身 */
interface Snapshot {
  form: Form
  items: Item[]
  candidates: Candidate[]
  heroId?: string
  heroReason: string
  sectionTitles: string[]
  sectionCopies: string[]
  template: EmailTemplateId
  links: Links
  pushLink: PushLink | null
  audience: string
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
    width: 'min(1800px, (98vw / var(--ui-zoom, 1)))',
    height: 'calc(92vh / var(--ui-zoom, 1))',
    maxHeight: 'calc(92vh / var(--ui-zoom, 1))',
    '@media (max-width: 899px)': {
      width: 'calc(100vw / var(--ui-zoom, 1))',
      height: 'calc(100vh / var(--ui-zoom, 1))',
      maxHeight: 'calc(100vh / var(--ui-zoom, 1))',
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
  titleRow: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '12px 12px 12px 24px', backgroundColor: tokens.colorNeutralBackground1 },
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
  caption: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightRegular },
  lead: { fontWeight: tokens.fontWeightSemibold },
  captionTight: { marginTop: '-4px' },
  success: { color: tokens.colorPaletteGreenForeground1 },
  fullWidth: { width: '100%', flexShrink: 0, minHeight: '32px' },
  sectionHead: { marginTop: '12px' },
  deviceSwitch: { display: 'inline-flex', columnGap: '2px', marginLeft: '4px' },
  deviceBtn: { minWidth: 'auto', height: '24px', padding: '0 8px', fontWeight: tokens.fontWeightRegular },
  previewHead: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap', minWidth: 0 },
  // 配信の対象(X40)
  targetRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' },
  savedNote: { alignSelf: 'center', fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteGreenForeground1 },
  targetLabel: { width: '44px', flexShrink: 0, fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
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

export function CardDetail({ card, defaults, draft, onCreated, onReopen, onHeroesChanged, weekUse, products, heroes, otherThemes, allCards, owners = [], weeks = [], onBack, onSaved, onOpenResults, alerts = [], focusProductId, stockModel, onOpenAlerts, onOpenProduction, stageNav, stageTabs, initialTab, onTabChange, next, onNext }: Props) {
  const t = useT()
  const styles = useStyles()
  const [form, setForm] = useState<Form>(() => (card ? toForm(card) : draft ? toForm(draft.card) : { ...toForm(), ...defaults }))
  // シンプルな配信カード(SU1)で描くか。上の帯の「シンプル | 詳しい」で切り替え、最後に選んだ方を次も使う(人の設定)。
  // 保存済みの配信だけ(新規作成・まとめて作った案は、自動の反映で新しい配信を作らないよう、詳しい画面)
  const [simpleView, setSimpleView] = useState(loadSimpleCard)
  const simpleOn = simpleView && !!card
  /** 見せ方を替える。remember が false のとき(次にやることのボタンで、承認・依頼のために詳しい画面へ移るとき)は、次に開くときの見せ方を変えない */
  const changeView = (v: boolean, remember = true) => {
    setSimpleView(v)
    if (remember) saveSimpleCard(v)
  }
  const [items, setItems] = useState<Item[]>(() => draft?.items ?? [])
  // 選定候補(配信商品テーブルの「候補」の行。セクションごと)
  const [candidates, setCandidates] = useState<Candidate[]>(() => draft?.candidates ?? [])
  // 読み込み時点の配信商品(保存時に差分を取る)。読み込めなかったときは保存で消さないよう null のまま
  const [original, setOriginal] = useState<Map<string, RowSnap> | null>(card ? null : new Map())
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // プレビューは、配信カードのチャネルに合わせる(配信カードはチャネルごとに分けるので、切り替えは置かない)。
  // チャネルが未設定のときは、メールで表示する
  const previewTab: 'email' | 'push' = form.channel === String(CHANNEL_PUSH) ? 'push' : 'email'
  const [showHeadings, setShowHeadings] = useState(true)
  // プレビューの倍率(15〜120%)。'fit' は、メール全体が画面の高さに収まる倍率に自動で合わせる
  const [zoom, setZoom] = useState<number | 'fit'>(loadZoom)
  // メールのプレビューの幅(X3。スマホ / PC。ブラウザごとに覚える)
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'pc'>(() => loadPref<'mobile' | 'pc'>(PREF.cardPreviewDevice, 'mobile'))
  const pickDevice = (d: 'mobile' | 'pc') => {
    setPreviewDevice(d)
    savePref(PREF.cardPreviewDevice, d)
  }
  const [fitZoom, setFitZoom] = useState(1)
  // 「すべてAIで下書き」の進み具合(実行中だけ、画面全体に「推論中」を出す)
  const [autoEnabled] = useState(loadAutoDraft) // 設定は、画面上部のバーで切り替える
  const [auto, setAuto] = useState<{ label: string; done: number; total: number } | null>(null)
  const cancelRef = useRef(false)
  // 保存のあとに、閉じずに次の配信を開くか(「保存して次へ」で立てる。確定した週の、理由を入力する流れでも引き継ぐ)
  const goNextRef = useRef(false)
  // 「保存」(閉じない)か「保存して閉じる」か(X52)
  const stayRef = useRef(false)
  const [justSaved, setJustSaved] = useState(false)
  // どちらのボタンで保存中か(ボタンの文字を「保存中...」にするため)
  const [saveMode, setSaveMode] = useState<'stay' | 'close'>('close')
  const aliveRef = useRef(true)
  const previewBoxRef = useRef<HTMLDivElement>(null)
  const previewInnerRef = useRef<HTMLDivElement>(null)
  // コピー・ヘッドラインの言語(AI に渡す。保存はしない)
  // コピー・ヘッドラインの言語は、配信の国に合わせる(US は英語、JP は日本語)。以前は切り替えられたが、2026-10-16 に外した
  const language: CopyLanguage = 'auto'
  const [template, setTemplate] = useState<EmailTemplateId>(
    // 使った版で開く(テンプレートが編集されていても、この配信は、使った版の形のまま)
    () => (card ? templateKeyOfCard(card) : draft ? templateKeyOfCard(draft.card) : templateFromValue(undefined)),
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
  // 持っている画像を上げる(X59)
  // true = 空で開く、File = そのファイルを上げながら開く(シンプルの「アップロード」のタブに落としたとき)
  const [heroUpload, setHeroUpload] = useState<boolean | File>(false)
  const { widths, setWidths, onDone: saveWidths } = useStoredWidths<Widths>(WIDTH_KEY, readWidths)
  const [links, setLinks] = useState<Links>(() => parseLinks(card?.links))
  // リンク先のタブを開いているか・設定の欄で選んでいる場所(プレビューに、番号と枠を重ねる。W12)
  const [linksTab, setLinksTab] = useState(false)
  // プロセスのペインのタブを開く頼み(左の「制作への引き継ぎ」を押すと、「引き継ぎ」のタブを開く)
  const [tabRequest, setTabRequest] = useState<{ tab: TalkTab; seq: number } | undefined>(undefined)
  // プレビュー上の場所を指して書き込む(ピン)。選んでいる間は、プレビューを押しても編集しない
  // 打ったピン・押したピンは、その横のフロート(PinFloat)で書く・読む・返す(右のやり取りの欄は、全部の流れとして残す)
  const { placing: placingPin, setPlacing: setPlacingPin, endPlacing: endPlacingPin, target: pinTarget, setTarget: setPinTarget, openThreads: openPinThreads, close: closePin } = usePreviewPins()
  // 中ペインの工程のタブを開く頼み(プロセスのペインの「⑥ で直す」で、制作指示を開く)
  // リンクから開いたときは、そのタブで始める(seq 1 で、最初に 1 回だけ開く)
  const [stepRequest, setStepRequest] = useState<{ tab: TopTab; seq: number } | undefined>(() => (initialTab ? { tab: initialTab as TopTab, seq: 1 } : undefined))
  const [linkFocus, setLinkFocus] = useState<string | null>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  // 商品情報の行にマウスが乗っている商品(プレビューで光らせる)と、商品情報ペインの開閉
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [infoOpen, setInfoOpen] = useState<boolean>(loadInfoOpen)
  const [processOpen, setProcessOpen] = useState<boolean>(() => loadOpen(PROCESS_KEY))
  const toggleProcess = () =>
    setProcessOpen((open) => {
      writeRaw(PROCESS_KEY, open ? 'closed' : 'open')
      return !open
    })
  const toggleInfo = () =>
    setInfoOpen((open) => {
      writeRaw(INFO_KEY, open ? 'closed' : 'open')
      return !open
    })
  const [saving, setSaving] = useState(false)
  // 確定した週の変更: 保存の前に、理由を入力してもらう(null = 入力欄を出していない)
  const [changeReason, setChangeReason] = useState<string | null>(null)
  // 差し戻しの理由(null = 入力欄を出していない)
  // 承認・差し戻しの履歴に残す名前(週の状態の帯・コメントと共通)
  const [error, setError] = useState<string | null>(null)
  // 使ったテンプレートが見つからなかった配信(見せるテンプレートの名前と、AI で下書きし直したか)
  const [missingTemplate, setMissingTemplate] = useState<{ key: string; redrafted: boolean } | null>(null)
  // テンプレートの読み込みが済んだら、下の自動の下書きの判定をし直す
  const templatesVersion = useTemplates()
  // 差し替えた理由(保存したときに、配信のメモ(種類 change)に残す。アラートの画面で差し替えたときと同じ記録)。
  // アラートへの対応と、商品のフロートで残りの候補と入れ替えたとき(X47)の両方
  const [alertNotes, setAlertNotes] = useState<string[]>([])
  // 商品・メイン画像は、配信カードの国に合う市場のものだけを、選定の対象にする(すでに載せた他の市場の商品は、表示のために残す)
  const market = cardMarket(form.country)
  // 配信の対象の性別が決まっていれば、それに合う商品だけ(女性向けなら、ウィメンズとユニセックス。X40)
  const poolProducts = useMemo(() => products.filter((p) => (!market || productMarket(p) === market) && fitsTarget(p, form.targetGender)), [products, market, form.targetGender])
  // 使える期限を過ぎた画像は、選ぶ候補・AI の候補から外す(いま使っている画像は残す。X59)
  const poolHeroes = useMemo(() => heroes.filter((h) => (!market || heroMarket(h) === market) && (isUsableHero(h) || h.id === heroId)), [heroes, market, heroId])
  // AB テスト(X55)・案から選ぶ(X57)・シンプルな画面の AB テスト(SU2)の、案の中身と操作(useAbVariants.ts)
  const { ab, setAb, active, stash, setStash, itemsOf, heroOf, textsOf, templateOfV, abForSave, switchVariant, startAbTest, addVariant, removeVariant, abAiBusy, comparing, setComparing, draftActiveVariant, stopAbTest, changeTarget, asTarget, decision, decideVariant, abAuto, saveTarget, savedTargetAb, abAddSimple, abUpgradedRef, abDiff } = useAbVariants({
    card, draft, form, setForm, items, setItems, heroId, setHeroId, heroReason, setHeroReason, sectionTitles, setSectionTitles, sectionCopies, setSectionCopies,
    template, setTemplate, setCandidates, setSelectedKey, setError, setAlertNotes, poolProducts, poolHeroes, language, templateChannel, simpleOn, original,
    // 押したときに呼ぶので、この下で作る関数でよい
    buildAiCard: () => buildAiCard(),
  })

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
        const byVariant = new Map<string, Item[]>()
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
            ...(r.image_url ? { imageUrl: r.image_url, imageSource: r.image_source ?? '' } : {}),
          }
          const variant = r.variant ?? ''
          snap.set(base.rowId!, { reason: base.reason, source: base.source, state, section, order: r.sort_order ?? 0, variant, image: r.image_url ?? '' })
          if (state === STATE_CANDIDATE) cands.push({ ...base, section })
          else if (variant) byVariant.set(variant, [...(byVariant.get(variant) ?? []), base])
          else sel.push(base)
        }
        setItems(sel)
        // B・C 案の商品(X55)
        if (byVariant.size > 0)
          setStash((prev) => {
            const next = { ...prev }
            for (const [k, list] of byVariant) next[k as VariantKey] = { heroReason: '', ...next[k as VariantKey], items: list }
            return next
          })
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
  }, [card, focusProductId, setStash])

  // 左ペインで手で書き換えたら、採用した案の補足は消す
  const STALE: Partial<Record<keyof Form, keyof Form>> = { theme: 'themeReason', headline: 'copyAngle', copy: 'copyAngle', instructions: 'instructionsAngle' }
  // いまの form に重ねる(描いたときの form に重ねると、同じ流れで先に変えた欄を、古い値で戻してしまうため)
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => {
    const stale = STALE[k]
    setForm((f) => ({ ...f, [k]: v, ...(stale ? { [stale]: '' } : {}) }))
  }
  const num = (v: string) => (v === '' ? undefined : (v as never))
  // 商品の引き当ては、1 つの表で(打つたびの描き直しで、一覧を何度も端から探さないように)
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const productName = (id: string) => productById.get(id)?.name ?? ''

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
    const cat = (i: Item) => productById.get(i.productId)?.category_name ?? ''
    const order = [...new Set(items.map(cat))]
    setItems([...items].sort((a, b) => order.indexOf(cat(a)) - order.indexOf(cat(b))))
  }

  useEffect(() => {
    savePref(ZOOM_KEY, zoom)
  }, [zoom])

  // 全体表示: 倍率 1 での高さを測り、プレビューの枠に収まる倍率を求める(内容や窓の大きさが変わったら、測り直す)。
  // 内容の変化は、中身の大きさの変化で知る(文言・商品などを effect の依存に並べると、打つたびに測り直し、並べ忘れると測り直さないため)
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
    // 中身(倍率をかける前のメール)の大きさ。倍率を変えても、この大きさは変わらないので、測り直しが続くことはない
    const content = inner.firstElementChild
    if (content) ro.observe(content)
    return () => {
      ro.disconnect()
      inner.style.zoom = ''
    }
  }, [zoom, previewTab, simpleOn])

  const shownZoom = zoom === 'fit' ? fitZoom : zoom

  // プレビューのリンクの場所と、その URL(リンク先の設定の欄と同じ決め方。W12)
  const linkCampaign = campaignSlug(form.name, form.scheduledAt)
  const linkSpots = useMemo(() => linkSlots(template, items, products, linkCampaign, form.country), [template, items, products, linkCampaign, form.country])
  // AB テストの配信は、いま編集している案の印を campaign に付ける(X55)
  const linkVariant = ab ? active : null
  // utm_campaign の既定値は、配信日 + 配信カードの ID(links.ts の「UTM の決まり」)。リンク先のページの名前(linkCampaign)とは分ける
  const utmCampaign = campaignId(card?.id, form.scheduledAt)
  const linkUtm = utmFor(links, utmCampaign, linkVariant)
  const fcmCampaign = variantCampaign(linkCampaign, linkVariant)
  // アプリの配信は、URL の代わりに、開く画面(FCM の data)を出す
  const linkUrlOf = (slot: LinkSlot) => {
    if (previewTab === 'push') {
      const d = fcmText(screenOf(links, slot), fcmCampaign)
      return d ? `data: ${d}` : ''
    }
    const url = ((slot.kind === 'hero' ? links.hero : links.buttons?.[slot.key]) ?? '').trim() || slot.defaultUrl
    return url ? withUtm(url, linkUtm, slot.content) : ''
  }
  const productLinkOf = (itemKey: string) => {
    const index = items.findIndex((x) => x.key === itemKey)
    const it = items[index]
    const p = it && productById.get(it.productId)
    if (!p) return undefined
    if (previewTab === 'push') return { name: p.name, url: p.product_code ? `data: ${fcmText({ kind: 'product', value: p.product_code }, fcmCampaign)}` : '' }
    return { name: p.name, url: withUtm(productUrl(p), linkUtm, productContent(index, p.product_code)) }
  }
  const stepZoom = (d: number) => setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((shownZoom + d) * 20) / 20)))

  const panesRef = useRef<HTMLDivElement>(null)
  // 中央の上限: ダイアログの中の幅から、左・商品情報・境界線・プレビューの最小幅を引いた残り
  // (中の幅は、ドラッグのたびに、幅を変える前に測る。幅を決める関数の中では ref を読まない)
  const midMax = (w: Widths, total: number) => total - w[0] - (infoOpen ? w[2] : RAIL_W) - (processOpen ? w[3] : RAIL_W) - 4 - MIN_PREVIEW
  const resizeLeft = (dx: number) => setWidths((w) => [clamp(w[0] + dx), w[1], w[2], w[3]])
  const resizeMid = (dx: number) => {
    const total = panesRef.current?.clientWidth ?? viewWidth()
    setWidths((w) => [w[0], clampMid(Math.min(w[1], midMax(w, total)) + dx, midMax(w, total)), w[2], w[3]])
  }
  const resizeInfo = (dx: number) => setWidths((w) => [w[0], w[1], clamp(w[2] - dx), w[3]])
  const resizeProcess = (dx: number) => setWidths((w) => [w[0], w[1], w[2], clamp(w[3] - dx)])

  // エージェントに渡す、配信カードの現在の入力内容
  const buildAiCard = (): AiCard => {
    const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => String(o.value) === v)?.label ?? ''
    return {
      name: form.name,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : '',
      country: label(countryOptions, form.country),
      channel: label(channelOptions, form.channel),
      department: '',
      themeType: form.themeType ? themeTypeLabel(form.themeType as ThemeType) : undefined,
      target: targetText({ gender: form.targetGender, ages: form.targetAges, audience: templateChannel === 'push' ? audience : '' }),
      theme: form.theme,
      headline: form.headline,
      copy: form.copy,
      instructions: form.instructions,
    }
  }


  // テンプレートの最近の使用回数(X4。② テンプレートで選ぶとき。この配信の配信日・国を基準に)
  const templateUseMap = useMemo(() => (allCards ? templateUse(allCards, form.scheduledAt || undefined, form.country || undefined, card?.id) : undefined), [allCards, form.scheduledAt, form.country, card?.id])

  // AI の案の状態と生成(案は採用するまで、配信カードには反映しない)
  const drafts = useAiDrafts(
    {
      buildCard: buildAiCard,
      products: poolProducts,
      heroes: poolHeroes,
      otherThemes,
      template,
      items,
      candidates,
      sectionTitles,
      sectionCopies,
      heroId,
      heroReason,
      language,
      subject: form.subject,
      // AB テストで件名を案ごとに持ち、B・C 案を編集中なら、A 案と違う切り口の件名にする
      subjectAb: () =>
        ab && active !== 'A' && ownsSubject(ab)
          ? { key: active, compareWith: { subject: textsOf('A').subject || form.name, preheader: textsOf('A').preheader ?? '' }, hypothesis: ab.hypothesis.trim() }
          : null,
    },
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
      { card: buildAiCard(), language, otherThemes, products: poolProducts, heroes: poolHeroes, channel: templateChannel, country: form.country || undefined },
      (label, done, total) => setAuto({ label, done, total }),
      () => cancelRef.current || !aliveRef.current,
    )
    if (!cancelRef.current && aliveRef.current) applyAutoResult(res)
    setAuto(null)
  }

  const hasContent = !!(form.theme.trim() || form.headline.trim() || form.copy.trim() || form.instructions.trim() || items.length > 0 || heroId)

  async function runAllManual() {
    if (hasContent && !(await confirmDialog(t('現在のテーマ・ヘッドライン・コピー・商品・メイン画像・制作指示を、AIの下書きで置き換えます。よろしいですか?', 'This replaces the current theme, headline, copy, products, hero image, and production notes with an AI draft. Continue?')))) return
    void startAutoDraft()
  }

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  // 既存のカードを開いたとき、自動で下書きを作る(同じカードで、1 回だけ):
  // ・内容が空のとき
  // ・使ったテンプレートが登録に見つからないとき(削除された・版が残っていない。代わりのテンプレートで描くので、保存した見出し・商品の枠がずれる。
  //   SU1。2026-10-23 利用者 OK)。テンプレートも AI が選び直す。保存するまでは、キャンセルで元に戻せる
  // どちらも、テンプレートの読み込みが済んでから判定する(済む前は、作ったテンプレートがまだ登録にない)
  useEffect(() => {
    if (!card || original === null) return
    if (products.length === 0 || heroes.length === 0 || !templatesSettled()) return
    if (autoDrafted.has(card.id)) return
    autoDrafted.add(card.id)
    const missing = templateMissing(templateKeyOfCard(card))
    if (missing) {
      // 版だけがないときは、テンプレートの名前と版の番号で見せる(ID より分かりやすい)。テンプレートごとないときは ID のまま
      const { id, version: v } = splitTemplateKey(templateKeyOfCard(card))
      const label = !templateMissing(id) && v !== undefined ? t(`${getTemplate(id).label} の版 ${v}`, `${getTemplate(id).label}, version ${v}`) : id
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMissingTemplate({ key: label, redrafted: autoEnabled })
    }
    if (autoEnabled && (!hasContent || missing)) void startAutoDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, original, products.length, heroes.length, templatesVersion])

  // テンプレートを変えると、セクションの構成が変わるので、候補と商品選定の案は破棄する
  const changeTemplate = (id: EmailTemplateId) => {
    if (id === template) return
    // 同じテンプレートの版を替えるときは、番号で持っている見出し・コピーを、セクションの ID で読み替える
    // (セクションの並びが版で違っても、文が別のセクションへずれないように。T8 の 8.1。AB テストのほかの案の文も同じ)
    if (baseTemplateId(id) === baseTemplateId(template)) {
      const from = getTemplate(template)
      const to = getTemplate(id)
      setSectionTitles((prev) => remapSectionTexts(from, to, prev))
      setSectionCopies((prev) => remapSectionTexts(from, to, prev))
      // テンプレートを案ごとに持つときは、ほかの案はそれぞれのテンプレートのまま(読み替えない)
      if (!ownsTemplate(ab)) {
        setStash((prev) =>
          Object.fromEntries(
            Object.entries(prev).map(([k, v]) => [
              k,
              v?.texts ? { ...v, texts: { ...v.texts, sectionTitles: remapSectionTexts(from, to, v.texts.sectionTitles), sectionCopies: remapSectionTexts(from, to, v.texts.sectionCopies) } } : v,
            ]),
          ) as Partial<Record<VariantKey, VariantData>>,
        )
      }
    }
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
    const desired: { it: Item; state: typeof STATE_SELECTED | typeof STATE_CANDIDATE; section: number; order: number; variant: string }[] = [
      ...itemsOf('A').map((it, idx) => ({ it, state: STATE_SELECTED as typeof STATE_SELECTED, section: sectionIndexAt(sections, idx), order: idx + 1, variant: '' })),
      ...candidates.map((c, i) => ({ it: c as Item, state: STATE_CANDIDATE as typeof STATE_CANDIDATE, section: c.section, order: 1000 + i, variant: '' })),
      // AB テストで、案ごとに商品を持つとき: B・C 案の商品も、variant を付けて保存する(X55)
      ...(ab && ownsProducts(savedTargetAb())
        ? ab.variants.flatMap((k) => itemsOf(k).map((it, idx) => ({ it, state: STATE_SELECTED as typeof STATE_SELECTED, section: sectionIndexAt(sections, idx), order: idx + 1, variant: k })))
        : []),
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
        variant: d.variant,
        image_url: d.it.imageUrl ?? '',
        image_source: d.it.imageUrl ? (d.it.imageSource ?? '') : '',
      }
      let res
      if (d.it.rowId) {
        const old = before.get(d.it.rowId)
        if (old && old.reason === d.it.reason && old.source === d.it.source && old.state === d.state && old.section === d.section && old.order === d.order && old.variant === d.variant && old.image === (d.it.imageUrl ?? '')) continue
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
  const lockedWeeks = [confirmedWeekOf(weeks, card?.scheduled_at, scopeOfCard(card ?? form)), confirmedWeekOf(weeks, form.scheduledAt, scopeOfCard(form))].filter(
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
    stayRef.current = false
    setSaveMode('close')
    requestSave()
  }

  /** 保存して、開いたまま続ける(X52。「保存して閉じる」とは別) */
  function saveAndStay() {
    goNextRef.current = false
    stayRef.current = true
    setSaveMode('stay')
    requestSave()
  }

  /** 保存して、次の配信を開く(週のレビュー・確定で、閉じてカレンダーで探し直さずに済むように。FLOWS.md の C-1) */
  function saveAndNext() {
    goNextRef.current = true
    stayRef.current = false
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
        theme_type: form.themeType || (null as never),
        owner: form.owner.trim(),
        production_due: form.productionDue || (null as never),
        links: encodeLinks(links),
        push_link: pushLink ? JSON.stringify(pushLink) : '',
        audience: audience,
        target_gender: (form.targetGender || null) as never,
        target_ages: form.targetAges,
        // 件名を案ごとに持つときは、A 案の件名を配信の列に(X2・AB テスト)
        subject: ownsSubject(ab) ? (textsOf('A').subject ?? '') : form.subject,
        preheader: ownsSubject(ab) ? (textsOf('A').preheader ?? '') : form.preheader,
        push_title: textsOf('A').pushTitle,
        push_body: textsOf('A').pushBody,
        production_owner: form.productionOwner.trim(),
        handed_off_at: form.handedOffAt || (null as never),
        theme: form.theme,
        // 文言を案ごとに持つとき(X57)は、A 案の文言を配信の中身として保存する
        headline: textsOf('A').headline,
        products: itemsOf('A').map((i) => productName(i.productId)).filter(Boolean).join(' / '),
        copy: textsOf('A').copy,
        instructions: form.instructions,
        theme_reason: form.themeReason,
        copy_angle: form.copyAngle,
        instructions_angle: form.instructionsAngle,
        hero_reason: heroOf('A').heroReason,
        ab_test: encodeAbTest(abForSave(), decision),
        // 標準のテンプレートは、以前の選択肢の列にも書く(互換)。作ったテンプレートは、layoutkey だけ
        email_template: TEMPLATE_VALUES[baseTemplateId(templateOfV('A'))],
        // テンプレートの ID と、使った版の番号を分けて書く(いまの版を選んだときは、いまの版の番号)。B・C 案を直している間も、A のもの
        layout_key: baseTemplateId(templateOfV('A')),
        layout_version: splitTemplateKey(templateOfV('A')).version ?? currentVersion(baseTemplateId(templateOfV('A'))),
        section_titles: textsOf('A').sectionTitles.join('\n').replace(/\n+$/, ''),
        section_copies: encodeCopies(textsOf('A').sectionCopies),
        // 外したときは null を送ってルックアップを空にする
        hero_image_id: heroOf('A').heroId
          ? heroOf('A').heroId
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
    return JSON.stringify({ ...rest, items: itemsOf('A').map((i) => i.productId), variants: ab && ownsProducts(savedTargetAb()) ? ab.variants.map((k) => itemsOf(k).map((i) => i.productId)) : [] })
  }
  const baseline = useRef<string | null>(null)
  // 基準にした時点の中身(シンプルな配信カードの「元に戻す」で、反映の前に戻す)
  const committedSnap = useRef<Snapshot | null>(null)
  // 基準を取り直した回数(保存して開いたままのとき、「変えたか」を測り直すため)
  const [baseVersion, setBaseVersion] = useState(0)
  const takeSnapshot = (): Snapshot => ({ form, items, candidates, heroId, heroReason, sectionTitles, sectionCopies, template, links, pushLink, audience })
  useEffect(() => {
    // 掲載商品を読み込んだ時点(自動の下書きより前)の内容を、基準にする
    if (card && original !== null && baseline.current === null) {
      baseline.current = contentKey()
      committedSnap.current = takeSnapshot()
      setBaseVersion((v) => v + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, original])
  const savedStatus = card?.status ?? STATUS_NOT_STARTED
  const approvedBefore = !!card && statusRank(savedStatus) >= statusRank(STATUS_APPROVED)
  // 開いた時点から内容が変わったか(承認・依頼の前に、保存してもらうため。基準は ref なので、描画の中では読まず、関数で渡す)
  const isDirty = () => baseline.current !== null && baseline.current !== contentKey()
  // ---- アラートへの対応(上の帯・プレビューの商品の枠・商品情報の行から開く。差し替えは、この配信カードの中で置き換えて、保存で確定)
  const { actAlert, setActAlert, productOpen, setProductOpen, slotAction, setSlotAction, floatSwap, setFloatSwap, liveAlerts, itemAlertKinds, openAlertFor, alertCard, replaceForAlert, swapWithCandidate, setItemImage, replaceItemWith, productAlertKinds, postponeForAlert, openAlertsScreen } = useCardAlerts({ alerts, items, setItems, candidates, setCandidates, productById, card, draft, setAlertNotes, surfaceRef, onOpenAlerts, hasChanges: () => changed })
  // 開いてから内容を変えたか(承認済み・確定した週の帯は、変えたときだけ出す。ふだんの説明は、右のプロセスのペインの状態の下)
  const [changed, setChanged] = useState(false)
  const currentKey = contentKey()
  useEffect(() => {
    setChanged(baseline.current !== null && baseline.current !== currentKey)
  }, [currentKey, baseVersion])
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
  async function save(reason?: string): Promise<boolean> {
    const goNext = goNextRef.current
    const stay = stayRef.current
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
      // 作業画面の案を、ここで新規作成として保存した(作業画面で、その案を保存済みにする)
      if (!card) onCreated?.(cardId)
      if (reason !== undefined) {
        for (const w of lockedWeeks) {
          const r = await reopenWeek(w, w.country ? { country: w.country, channel: w.channel } : scopeOfCard(form))
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
      // アラートへの対応で差し替えた理由を、配信のメモ(種類 change)に残す
      if (cardId && alertNotes.length > 0) {
        for (const body of alertNotes) await CardNotesService.create({ kind: 'change', body, author: myName() || form.owner || '', delivery_card_id: cardId })
        setAlertNotes([])
      }
      await onSaved()
      goNextRef.current = false
      stayRef.current = false
      if (stay) {
        // 開いたまま続ける: 保存した内容を、変更の基準にし直す(掲載商品は、読み直した配信カードから読み直される)
        baseline.current = null
        setForm((f) => ({ ...f, status: String(status) }))
        setChangeReason(null)
        setJustSaved(true)
        window.setTimeout(() => setJustSaved(false), 3000)
        // 新しい配信は、保存した配信として開き直す
        if (!card) onReopen?.(cardId)
        return true
      }
      if (goNext && next && onNext) onNext()
      else onBack()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return false
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
    push: templateChannel === 'push' ? { title: form.pushTitle, body: form.pushBody } : undefined,
  })
  const hero = heroes.find((h) => h.id === heroId)

  // ---- 2 つの画面(今の配信カード・シンプルな配信カード SU1)で共通の部品
  const noticesNode = (
    <>
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

    {approvedBefore && lockedWeeks.length === 0 && changed && (
      <MessageBar layout="multiline" intent="info" className={styles.locked}>
        <MessageBarBody>
          {t(
            '承認済みの配信の内容を変えています。保存すると「承認待ち」に戻り、承認の依頼からやり直しになります。',
            'You are changing an approved delivery. Saving puts it back to awaiting approval and needs a new approval request.',
          )}
        </MessageBarBody>
      </MessageBar>
    )}
    {lockedWeeks.length > 0 && changed && (
      <MessageBar layout="multiline" intent="warning" className={styles.locked}>
        <MessageBarBody>
          {t(
            `確定した週(${lockedWeeks.map(weekRange).join('、')})の配信を変えています。保存するときは、理由を入力します。保存すると、この配信は「承認待ち」に戻り、週の確定は解けます。`,
            `You are changing a delivery in a confirmed week (${lockedWeeks.map(weekRange).join(', ')}). To save, enter a reason. Saving puts this delivery back to awaiting approval and the week is no longer confirmed.`,
          )}
        </MessageBarBody>
      </MessageBar>
    )}
    </>
  )
  const productFloat = (
    <>
    {/* 商品の対応のフロート(X54): アラートの札・商品の行の、どこから開いても、これ 1 つ */}
    {(actAlert || productOpen) && (() => {
      const item = actAlert ? items.find((i) => i.productId === actAlert.productId) : items.find((i) => i.key === productOpen)
      // シンプルな配信カードの商品の一覧では、候補の行からも開く(詳しい情報を見るだけ。差し替えは、選んだ枠への操作で)
      const cand = !actAlert && !item ? candidates.find((c) => c.key === productOpen) : undefined
      const product = productById.get(item?.productId ?? cand?.productId ?? actAlert?.productId ?? '')
      const idx = item ? items.indexOf(item) : -1
      const section = idx >= 0 ? sectionIndexAt(sectionsOf(template), idx) : -1
      const options: SwapOption[] = candidates.filter((c) => c.section === section).flatMap((c) => {
        const p = productById.get(c.productId)
        return p ? [{ key: c.key, product: p, reason: c.reason, source: c.source }] : []
      })
      const closeAction = () => {
        setActAlert(null)
        setProductOpen(null)
        setSlotAction(null)
        setFloatSwap(null)
      }
      return (
        <ProductActionFloat
          key={`${actAlert ? `alert:${actAlert.kind}:${actAlert.productId ?? ''}` : `item:${productOpen}`}`}
          product={product}
          alert={actAlert ?? undefined}
          card={alertCard}
          scheduledAt={form.scheduledAt}
          inCard={new Set(items.map((i) => i.productId))}
          products={products}
          poolProducts={poolProducts}
          model={stockModel}
          weekUse={weekUse}
          alertKinds={productAlertKinds}
          options={options}
          image={item?.imageUrl}
          delivery={{ theme: form.theme, headline: form.headline, copy: form.copy, themeType: form.themeType ? themeTypeLabel(form.themeType as ThemeType) : '' }}
          onImage={item ? (url, source) => setItemImage(item.key, url, source) : undefined}
          onSwapCandidate={
            item
              ? (candKey, reason) => {
                  swapWithCandidate(item.key, candKey, reason)
                  closeAction()
                }
              : undefined
          }
          onReplace={
            item
              ? (to, reason) => {
                  if (actAlert) replaceForAlert(actAlert, to, reason)
                  else replaceItemWith(item.key, to, reason)
                  closeAction()
                }
              : undefined
          }
          onPostpone={() => {
            setProductOpen(null)
            postponeForAlert()
          }}
          onOpenAlerts={actAlert ? () => openAlertsScreen(actAlert.productId) : undefined}
          aiCard={buildAiCard}
          angle={form.copyAngle}
          onOpenSwap={
            floatSwap && floatSwap.key === productOpen && !actAlert && !slotAction
              ? () => {
                  closeAction()
                  floatSwap.run()
                }
              : undefined
          }
          slotAction={
            slotAction && !actAlert
              ? {
                  label: slotAction.label,
                  run: () => {
                    slotAction.run()
                    closeAction()
                  },
                }
              : undefined
          }
          onClose={closeAction}
        />
      )
    })()}
    </>
  )
  const alertsNode = (
    <>
    {/* この配信のアラート(在庫・方針・日程)。ふだんは 1 行にたたむ。アラートの画面から開いたときは、開いておく */}
    {liveAlerts.length > 0 && (
      <CardAlertsBar
        alerts={liveAlerts}
        onAct={alertCard ? setActAlert : undefined}
        defaultOpen={!!focusProductId}
        selectedProductId={items.find((i) => i.key === selectedKey)?.productId}
        onSelectProduct={(pid) => {
          const it = items.find((i) => i.productId === pid)
          if (it) setSelectedKey(it.key)
        }}
      />
    )}
    </>
  )
  const heroUploadNode = (
    <>
    {heroUpload && (
      <HeroUploadDialog
        market={cardMarket(form.country)}
        cardId={card?.id}
        me={myName() || form.owner}
        file={heroUpload instanceof File ? heroUpload : undefined}
        onClose={() => setHeroUpload(false)}
        onDone={async (h) => {
          await onHeroesChanged?.()
          setHeroId(h.id)
          setHeroReason(tr('持っている画像を上げて使った', 'Uploaded and used'))
          setHeroUpload(false)
        }}
      />
    )}
    </>
  )

  const zoomBox = (
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
  )
  useEffect(() => {
    if (!abUpgradedRef.current || !abAuto) return
    abUpgradedRef.current = false
    if (!changed) {
      baseline.current = contentKey()
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBaseVersion((v) => v + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abAuto, stash])
  const abCompareNode = (
    <>
      {ab && comparing === 'live' && (
        <AbCompare
          ab={ab}
          base={{ id: card?.id ?? 'draft', ...buildContent(), hero_image_id: null } as DeliveryCard}
          variants={allVariants(ab).map((k) => ({ key: k, productIds: itemsOf(k).map((i) => i.productId), heroId: heroOf(k).heroId, texts: ownsAnyText(ab) ? textsOf(k) : undefined, template: templateOfV(k) }))}
          products={products}
          heroes={heroes}
          onEdit={switchVariant}
          onClose={() => setComparing(null)}
        />
      )}
    </>
  )

  // ---- シンプルな配信カード(SU1。docs/SIMPLE_CARD.md)。状態と保存は、上のものをそのまま使い、描き方だけを替える
  const undoStack = useUndo<Snapshot>()
  // AI の案(メイン画像・商品)を、プレビューにだけ仮に写す(保存する中身は変えない)
  const [aiPreview, setAiPreview] = useState<AiPreview | null>(null)
  // これまでの学びの件数(シンプルな画面の「目印」に出す)
  const [learnCount, setLearnCount] = useState(0)
  const shownHero = aiPreview?.heroId ? heroes.find((h) => h.id === aiPreview.heroId) : hero
  const previewItem = aiPreview?.item
  const shownItems = previewItem
    ? previewItem.key
      ? items.map((i) => (i.key === previewItem.key ? { ...i, productId: previewItem.productId, imageUrl: undefined } : i))
      : [...items, { key: '__ai_preview', productId: previewItem.productId, reason: '', source: SOURCE_AI }]
    : items
  const [pendingUndoSave, setPendingUndoSave] = useState(false)
  // 承認済みの配信を自動で反映すると承認待ちに戻るので、最初の反映の前に一度だけ確かめる
  const revokeOk = useRef(false)
  // 確定した週の配信で、元に戻すの保存を、理由の入力を待って行うとき(履歴に積まない)
  const undoingRef = useRef(false)
  const locked = lockedWeeks.length > 0
  /** 反映(保存して開いたまま)。成功したら、反映の前の中身を、元に戻すの履歴に積む */
  const saveStaying = async (reason?: string, push = true) => {
    const before = committedSnap.current
    goNextRef.current = false
    stayRef.current = true
    setSaveMode('stay')
    const ok = await save(reason)
    if (ok && push && before) undoStack.push(before)
  }
  /** 確定した週の配信は、すぐには保存せず、理由の入力欄を出す(保存は、理由の欄のボタンから saveStaying) */
  const askReason = () => {
    goNextRef.current = false
    stayRef.current = true
    setSaveMode('stay')
    setChangeReason((r) => r ?? '')
  }
  const confirmRevoke = async () => {
    if (!approvedBefore || revokeOk.current) return true
    if (!(await confirmDialog(tr('承認済みの配信です。変更を反映すると「承認待ち」に戻り、承認の依頼からやり直しになります。反映しますか?(以後、この配信を開いている間は聞きません)', 'This delivery is approved. Saving the change puts it back to awaiting approval and needs a new request. Save? (Not asked again while this card is open.)')))) return false
    revokeOk.current = true
    return true
  }
  /** 別の部品を選んだときの反映。変わっていなければ何もしない。確定した週の配信は、反映のボタンで */
  const commitSimple = async () => {
    if (saving || locked || !isDirty()) return
    if (!(await confirmRevoke())) return
    await saveStaying()
  }
  const applySimple = () => {
    if (saving) return
    if (locked) askReason()
    else void commitSimple()
  }
  /** 元に戻す: 前に反映したときの中身に戻して、保存する(行 ID は、いまも残っている行だけ使う。消えた行は新しい行として作り直す) */
  const undoSimple = () => {
    if (saving) return
    const snap = undoStack.pop()
    if (!snap) return
    const alive = <T extends Item>(x: T): T => (x.rowId && original?.has(x.rowId) ? x : { ...x, rowId: undefined })
    // ステータスは戻さない(承認のやり直しを、元に戻すで飛ばさないように)
    setForm({ ...snap.form, status: form.status })
    setItems(snap.items.map(alive))
    setCandidates(snap.candidates.map(alive))
    setHeroId(snap.heroId)
    setHeroReason(snap.heroReason)
    setSectionTitles(snap.sectionTitles)
    setSectionCopies(snap.sectionCopies)
    setTemplate(snap.template)
    setLinks(snap.links)
    setPushLink(snap.pushLink)
    setAudience(snap.audience)
    setPendingUndoSave(true)
  }
  // 戻した中身で保存する(state を戻した次の描画の save を使うため、effect で呼ぶ)
  useEffect(() => {
    if (!pendingUndoSave) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingUndoSave(false)
    if (lockedWeeks.length > 0) {
      undoingRef.current = true
      askReason()
    } else void saveStaying(undefined, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingUndoSave])
  /** 確定した週の、理由の欄の保存のボタン */
  const saveWithReason = (reason: string) => {
    if (!simpleOn) {
      void save(reason)
      return
    }
    const push = !undoingRef.current
    undoingRef.current = false
    void saveStaying(reason, push)
  }
  const nextStep = nextStepOf({ status: form.status, handedOff: !!form.handedOffAt })
  /** 詳しい画面(今の配信カード)で続ける。コミュニケーションの段階(d)ができるまで、承認・制作への依頼はこちらで */
  const openDetailed = (tab?: TalkTab) => {
    changeView(false, false)
    if (!processOpen) toggleProcess()
    if (tab) setTabRequest((r) => ({ tab, seq: (r?.seq ?? 0) + 1 }))
  }
  const runNext = (step: NextStep) => {
    if (step === 'openProduction') {
      if (card) {
        void commitSimple()
        onOpenProduction?.(card.id)
      }
    } else openDetailed(step === 'requestProduction' ? 'handoff' : undefined)
  }
  /** 閉じる: 変更があれば反映してから閉じる(確定した週の配信は、捨てるかを聞く) */
  const closeSimple = async () => {
    if (saving) return
    if (!isDirty()) {
      onBack()
      return
    }
    if (locked) {
      if (await confirmDialog(tr('確定した週の配信の変更を、反映せずに閉じます。よろしいですか?(反映するときは「理由を入力して反映」)', 'Close without saving the changes to this confirmed-week delivery? (To save, use “Save with a reason”.)'))) onBack()
      return
    }
    if (!(await confirmRevoke())) return
    goNextRef.current = false
    stayRef.current = false
    setSaveMode('close')
    void save()
  }
  const swapItems = (a: string, b: string) => {
    const i = items.findIndex((x) => x.key === a)
    const j = items.findIndex((x) => x.key === b)
    if (i < 0 || j < 0 || i === j) return
    const next = [...items]
    ;[next[i], next[j]] = [next[j], next[i]]
    setItems(next)
  }
  // プレビュー(memo)に渡す関数は、いつも同じものを渡す(打つたびに、プレビューまで描き直さないように)
  const previewSectionTitle = useStableCallback(setSectionTitle)
  const previewSectionCopy = useStableCallback(setSectionCopy)
  const previewClearHero = useCallback(() => setHeroId(undefined), [])
  const previewNoSelect = useCallback(() => undefined, [])
  const previewRemove = useStableCallback(removeItem)
  const previewMove = useStableCallback((key: string, d: number) => {
    const i = items.findIndex((x) => x.key === key)
    moveItem(i, i + d)
  })
  const previewDropAt = useStableCallback(dropAt)
  // 詳しい画面とシンプルな画面のプレビューに、同じく渡すもの(違うのは、商品・選んだ枠・テンプレート・画像・押したとき・部品を選ぶ見せ方)
  const previewCommon = {
    channel: previewTab,
    country: form.country,
    pushLinkKind: pushLink?.kind,
    pushTitle: form.pushTitle,
    pushBody: form.pushBody,
    subject: form.name,
    subjectLine: form.subject,
    preheader: form.preheader,
    device: previewDevice,
    headline: form.headline,
    copy: form.copy,
    products,
    hoverKey,
    showHeadings,
    scheduledAt: form.scheduledAt,
    sectionTitles,
    onSectionTitle: previewSectionTitle,
    sectionCopies,
    onSectionCopy: previewSectionCopy,
    onDropHero: setHeroId,
    onClearHero: previewClearHero,
    onRemove: previewRemove,
    onMove: previewMove,
    onDropAt: previewDropAt,
  }
  const simplePreview = (
    <>
      <div ref={previewInnerRef} style={{ zoom: zoom === 'fit' ? undefined : zoom }}>
        <Preview
          {...previewCommon}
          items={shownItems}
          // 選んだ部品の枠は、部品を選ぶ層が描く(二重に光らせない)
          selectedKey={null}
          template={aiPreview?.templateId ?? template}
          hero={shownHero}
          onSelect={previewNoSelect}
          pickMode
        />
      </div>
    </>
  )
  const footerNode = (
    <>
    {missingTemplate && (
      <MessageBar layout="multiline" intent="warning" className={styles.error}>
        <MessageBarBody>
          {missingTemplate.redrafted
            ? t(
                `この配信が使っていたテンプレート(${missingTemplate.key})が見つからないため、AI がテンプレートを選び直して下書きし直しました。保存するまでは、キャンセルで元に戻せます。`,
                `The template this delivery used (${missingTemplate.key}) was not found, so AI chose a template and redrafted it. Cancel to discard before saving.`,
              )
            : t(
                `この配信が使っていたテンプレート(${missingTemplate.key})が見つからないため、代わりのテンプレートで表示しています。見出し・商品の枠がずれていることがあります。`,
                `The template this delivery used (${missingTemplate.key}) was not found, so it is shown with a substitute. Headings and product slots may be off.`,
              )}
        </MessageBarBody>
        {/* 自動の下書きを切っているときは、ここから作り直す(シンプルな配信カードには「すべてAIで下書き」のボタンがないため) */}
        {!missingTemplate.redrafted && (
          <MessageBarActions>
            <Button
              size="small"
              disabled={auto !== null}
              onClick={() => {
                setMissingTemplate({ ...missingTemplate, redrafted: true })
                void startAutoDraft()
              }}
            >
              {t('AI で下書きし直す', 'Redraft with AI')}
            </Button>
          </MessageBarActions>
        )}
      </MessageBar>
    )}
    {error && (
      <MessageBar layout="multiline" intent="error" className={styles.error}>
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    )}
    {changeReason !== null && lockedWeeks.length > 0 && (
      <div className={styles.reasonBox}>
        <Field label={t('確定後の変更の理由', 'Reason for changing a confirmed week')} required size="small">
          <AutoTextarea heightKey="CardDetail.changeReason"
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
          <Button type="button" size="small" appearance="primary" icon={<SaveRegular />} disabled={saving || !changeReason.trim()} onClick={() => saveWithReason(changeReason)}>
            {t('保存して、レビューに戻す', 'Save and send back to review')}
          </Button>
        </div>
      </div>
    )}
    </>
  )
  /**
   * 詳しい画面のプレビューの右クリックの項目(「ここにピンを打つ」のあと)。押した所について、工程のタブ・商品のフロート・プレビューの「外す」と同じ処理を呼ぶ。
   * 直す・AI に頼むは、その部品を直す工程のタブを開く(AI は、そのタブの AI チャットの入力欄へ)。保存中は、中身を変える項目を押せなくする
   */
  const detailPreviewMenu = (under: Element): ContextItem[] => {
    const itemKey = under.closest('[data-item-key]')?.getAttribute('data-item-key') ?? undefined
    const anchor = under.closest('[data-anchor]')?.getAttribute('data-anchor') ?? ''
    const kind = anchor.split(':')[0]
    const tab: TopTab | null = itemKey ? 'sections' : kind === 'hero' || kind === 'herotext' || kind === 'subject' ? 'hero' : kind === 'section' ? 'sections' : kind === 'button' ? 'links' : kind === 'push' ? 'notice' : null
    const openTab = (to: TopTab) => setStepRequest((r) => ({ tab: to, seq: (r?.seq ?? 0) + 1 }))
    const it = itemKey ? items.find((i) => i.key === itemKey) : undefined
    return previewMenuItems({
      // ボタンと同じく、保存中だけ押せなくする
      busy: saving,
      edit: tab ? () => openTab(tab) : undefined,
      ai: tab
        ? () => {
            openTab(tab)
            focusSoon('[data-ai-chat-input]')
          }
        : undefined,
      product: itemKey
        ? {
            swapLabel: t('商品を差し替える', 'Swap the product'),
            url: productUrl(productById.get(it?.productId ?? '')),
            // 商品の箱を押したときと同じ、商品のフロート
            swap: () => {
              setActAlert(null)
              setSlotAction(null)
              setProductOpen(itemKey)
            },
            remove: () => removeItem(itemKey),
          }
        : undefined,
      hero: !itemKey && kind === 'hero' ? { src: heroImage(hero), replace: () => openTab('hero') } : undefined,
    })
  }
  // 商品の枠のアラートの印(押すと、その商品のアラートへの対応を開く)。詳しい画面とシンプルな画面で同じ
  const itemAlertOverlay = (
    <ItemAlertOverlay
      boxRef={previewBoxRef}
      kinds={itemAlertKinds}
      onOpen={(key) => {
        const it = items.find((i) => i.key === key)
        if (it) openAlertFor(it.productId)
      }}
    />
  )
  /** 配信カードの ⋯ のメニュー(複製・取りやめ・削除。保存済みの配信だけ)。シンプルな画面は、項目を足して使う */
  const cardMenu = (extra?: ReactNode) =>
    card && (
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
        // 複製した配信を読み込んでから、それに開き直す(onReopen は開く配信を差し替える)
        onDuplicated={async (id) => {
          await onSaved()
          onReopen?.(id)
        }}
        extra={extra}
      />
    )
  const simpleAlertOverlay = (
    <>
    {itemAlertKinds.size > 0 && (
      // アラートの印を押しても、部品を選び直さない
      <div data-no-pick>{itemAlertOverlay}</div>
    )}
    </>
  )
  const simpleEditor: SimpleEditor | null = card
    ? {
        card,
        form,
        aiCard: buildAiCard,
        setField: (k, v) => set(k)(v),
        channel: previewTab,
        template,
        ab: ab ? { keys: allVariants(ab), active, purpose: ab.purpose ?? 'test', canAdd: !!nextVariant(ab), busy: abAiBusy } : null,
        abSwitch: switchVariant,
        abAdd: abAddSimple,
        abRemove: removeVariant,
        abCompare: () => setComparing('live'),
        abSettings: ab ? <AbSettings ab={ab} active={active} target={saveTarget() ?? ab.target} onChange={setAb} onDecide={decideVariant} onStop={stopAbTest} /> : null,
        abDiffParts: abDiff?.parts ?? [],
        items,
        candidates,
        products,
        poolProducts,
        poolHeroes,
        hero,
        heroReason,
        heroCandidates,
        setHero: (id, reason) => {
          setHeroId(id)
          setHeroReason(reason)
        },
        uploadHero: (file?: File) => setHeroUpload(file ?? true),
        sectionTitles,
        sectionCopies,
        setSectionTitle,
        setSectionCopy,
        applyTexts: (x) => {
          setForm((f) => ({
            ...f,
            ...(x.subject !== undefined ? { subject: x.subject } : {}),
            ...(x.preheader !== undefined ? { preheader: x.preheader } : {}),
            ...(x.headline !== undefined ? { headline: x.headline } : {}),
            ...(x.copy !== undefined ? { copy: x.copy } : {}),
            ...(x.pushTitle !== undefined ? { pushTitle: x.pushTitle } : {}),
            ...(x.pushBody !== undefined ? { pushBody: x.pushBody } : {}),
          }))
          if (x.sectionTitles) setSectionTitles(x.sectionTitles)
          if (x.sectionCopies) setSectionCopies(x.sectionCopies)
        },
        links,
        setLinks,
        linkSpots,
        alertKinds: productAlertKinds,
        addProduct,
        removeItem,
        moveItem,
        swapItems,
        swapWithCandidate,
        openProduct: (key, action, swap) => {
          setActAlert(null)
          setSlotAction(action ?? null)
          setFloatSwap(swap ? { key, run: swap } : null)
          setProductOpen(key)
        },
        hoverProduct: setHoverKey,
        replaceItem: (itemKey, productId, reason) => {
          const to = productById.get(productId)
          if (to) replaceItemWith(itemKey, to, reason)
        },
        setAiPreview,
        setTemplate: changeTemplate,
        saving,
        dirty: changed,
        locked,
        justSaved,
        canUndo: undoStack.canUndo,
        nextStep,
        menu: cardMenu(
          <>
            <MenuItem icon={<AiIcon size={16} />} disabled={!!auto || saving} onClick={runAllManual}>
              {t('すべて AI で下書き', 'Draft everything with AI')}
            </MenuItem>
            {next !== undefined && (
              <MenuItem icon={<ArrowNextRegular />} disabled={saving || !next} onClick={saveAndNext}>
                {next ? t(`保存して次へ(${next.name})`, `Save and next (${next.name})`) : t('保存して次へ(次の配信はありません)', 'Save and next (no next delivery)')}
              </MenuItem>
            )}
            {onOpenResults && card.scheduled_at && new Date(card.scheduled_at) < new Date() && (
              <MenuItem icon={<DataBarVerticalRegular />} onClick={() => onOpenResults(card.id)}>
                {t('結果を見る', 'View results')}
              </MenuItem>
            )}
          </>,
        ),
        stageNav: stageTabs ?? stageNav,
        viewSwitch: <ViewSwitch simple onChange={changeView} />,
        preview: simplePreview,
        device: previewDevice,
        setDevice: pickDevice,
        zoom: { mode: zoom, shown: shownZoom, set: setZoom, min: ZOOM_MIN, max: ZOOM_MAX, step: stepZoom },
        // アラートは左のバーの「アラート」に出す(SU6。上の帯に置くと、作業する場所を狭めるため)
        notices: noticesNode,
        footer: footerNode,
        alertOverlay: simpleAlertOverlay,
        alerts: liveAlerts,
        actAlert: alertCard ? setActAlert : undefined,
        setHandoff: (k, v) => setForm((f) => ({ ...f, [k]: v })),
        remaining: progress.remaining,
        people: owners,
        canReview,
        reload: onSaved,
        openProduction: onOpenProduction && card ? (opts) => onOpenProduction(card.id, opts) : undefined,
        learnings: <LearningsBar card={card} templateId={template} country={form.country} channel={form.channel} name={form.name} theme={form.theme} headline={form.headline} themeType={form.themeType} onCount={setLearnCount} panel />,
        learnCount,
      }
    : null

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open && !saving) onBack() }}>
      <ResizableSurface ref={surfaceRef} sizeKey="cardDetail" prefKey={PREF.cardSize} min={MIN_DIALOG} className={styles.surface} aria-label={card ? card.name : draft ? draft.card.name : t('配信カードの新規作成', 'New delivery card')}>
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
          {simpleOn ? (
            <>
              {productFloat}
              {heroUploadNode}
              {abCompareNode}
              {simpleEditor && <SimpleCardLayout editor={simpleEditor} boxRef={previewBoxRef} isDirty={isDirty} onCommit={commitSimple} onApply={applySimple} onUndo={undoSimple} onRunNext={runNext} onClose={closeSimple} />}
            </>
          ) : (
          <>
          <div className={styles.titleRow}>
            {/* メールかアプリかを、開いた瞬間に分かるように、題名の左に札を置く */}
            {stageNav ?? <FaceBadge face="calendar" />}
            <ChannelBadge channel={form.channel} />
            <Text as="h2" size={500} weight="semibold" className={styles.titleText}>{card ? card.name : draft ? draft.card.name : t('配信カードの新規作成', 'New delivery card')}</Text>
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
            {/* この配信カードを開くリンク(保存済みの配信だけ。X36) */}
            {card && <ViewSwitch simple={false} onChange={changeView} />}
            {card && <CopyLinkButton />}
            {/* 複製・取りやめ・削除(保存済みの配信だけ) */}
            {cardMenu()}
            <Button type="button" appearance="subtle" icon={<DismissRegular />} onClick={onBack} aria-label={t('閉じる', 'Close')} />
          </div>
          {noticesNode}
          {productFloat}
          {alertsNode}
          {/* これまでの学び(同じテンプレート・テーマの種類の、過去の配信のメモ)。保存済みの配信だけ */}
          {card && (
            <LearningsBar card={card} templateId={template} country={form.country} channel={form.channel} name={form.name} theme={form.theme} headline={form.headline} themeType={form.themeType} />
          )}

          {heroUploadNode}
          {/* AB テストの帯(X55): 案の切り替えと、テストの設定 */}
          {ab && (
            <AbTestBar
              ab={ab}
              active={active}
              onSwitch={switchVariant}
              onChange={setAb}
              onAdd={addVariant}
              onRemove={removeVariant}
              onStop={stopAbTest}
              onTarget={changeTarget}
              onAiDraft={() => void draftActiveVariant()}
              aiBusy={abAiBusy}
              onCompare={() => setComparing('live')}
              onDecide={decideVariant}
            />
          )}
          {/* 案から選んだあと(X57): 決めた案と、配信しなかった案の入り口 */}
          {!ab && decision && <AbDecidedBar decision={decision} onView={() => setComparing('decided')} />}
          {abCompareNode}
          {!ab && decision && comparing === 'decided' && (
            <AbCompare
              ab={null}
              target={decision.target}
              base={{ id: card?.id ?? 'draft', ...buildContent() } as DeliveryCard}
              variants={[
                { key: decision.variant, productIds: items.map((i) => i.productId), heroId, tag: t('配信した案', 'Sent') },
                ...decision.rejected.map((r) => ({
                  key: r.key,
                  // 案ごとに持たなかったもの(比べる要素でないもの)は、配信の中身と同じ。持っていたものは、空でもその案の中身のまま
                  productIds: ownsProducts(asTarget(decision.target)) ? r.productIds : items.map((i) => i.productId),
                  heroId: ownsHero(asTarget(decision.target)) ? r.heroId : heroId,
                  texts: r.texts,
                  template: r.template,
                  tag: t('配信しなかった', 'Not sent'),
                })),
              ]}
              products={products}
              heroes={heroes}
              onClose={() => setComparing(null)}
            />
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
              <NameField value={form.name} onChange={set('name')} />
              <ScheduledAtField value={form.scheduledAt} onChange={set('scheduledAt')} />
              <div className={styles.twoCol}>
                <ChoiceField label={t('国', 'Country')} value={form.country} options={countryOptions} onChange={set('country')} />
                <ChoiceField label={t('チャネル', 'Channel')} value={form.channel} options={channelOptions} onChange={set('channel')} />
                <ChoiceField label={t('種類', 'Type')} value={form.themeType} options={THEME_TYPES.map((v) => ({ value: v, label: themeTypeLabel(v) }))} onChange={set('themeType')} />
                <StatusField value={form.status} onChange={set('status')} />
              </div>
              {/* 配信の対象(X40): 誰に向けて作るか。最初に決め、AI の下書きと商品の候補をこれに合わせる */}
              <TargetField gender={form.targetGender} ages={form.targetAges} onGender={set('targetGender')} onAges={set('targetAges')}>
                {/* アプリの送る相手(これまでの ⑥ 時刻・相手 から移した) */}
                {templateChannel === 'push' && (
                  <div className={styles.targetRow}>
                    <span className={styles.targetLabel}>{t('送る相手', 'Send to')}</span>
                    <Select size="small" className={styles.grow} value={audience} onChange={(_, d) => setAudience(d.value)}>
                      <option value="" disabled>{t('選んでください', 'Choose')}</option>
                      {AUDIENCES.map((v) => (
                        <option key={v} value={v}>{audienceLabel(v)}</option>
                      ))}
                    </Select>
                  </div>
                )}
              </TargetField>
              <div className={styles.twoCol}>
                <OwnerField value={form.owner} onChange={set('owner')} owners={owners} />
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
              {/* AB テスト(X55)・案から選ぶ(X57)。始めると、題名の下に案の切り替えと設定の帯が出る */}
              <Field label={t('案(AB テスト・案から選ぶ)', 'Variants (A/B test or choose one)')}>
                {ab && isChoose(ab) ? (
                  <Caption1 className={styles.caption}>
                    {t(`${['A', ...ab.variants].join('・')} の ${ab.variants.length + 1} 案から、1 案に決めて配信する(${targetLabel(ab.target)}を案ごとに)。上の帯で決める`, `Choose one of ${ab.variants.length + 1} variants to send (${targetLabel(ab.target).toLowerCase()} per variant). Decide in the bar above.`)}
                  </Caption1>
                ) : ab ? (
                  <Caption1 className={styles.caption}>
                    {t(
                      `${['A', ...ab.variants].join('・')} の ${ab.variants.length + 1} 案で、${targetLabel(ab.target)}を比べる(判定: ${metricLabel(ab.metric)})。設定と案の切り替えは、上の帯で`,
                      `${ab.variants.length + 1} variants (${['A', ...ab.variants].join(', ')}) comparing the ${targetLabel(ab.target).toLowerCase()} (judged by ${metricLabel(ab.metric).toLowerCase()}). Settings and switching are in the bar above.`,
                    )}
                  </Caption1>
                ) : (
                  <div className={styles.targetRow}>
                    <Button type="button" size="small" icon={<BeakerRegular />} onClick={() => startAbTest('test')} title={t('A 案(いまの配信)の写しから B 案を作り、メイン画像や商品を比べます。全案を、受信者を分けて送ります(C 案まで)', 'Create variant B as a copy of A to compare the hero image or products. All variants are sent to split recipients (up to C)')}>
                      {t('AB テストにする', 'Make it an A/B test')}
                    </Button>
                    <Button type="button" size="small" icon={<CheckmarkCircleRegular />} onClick={() => startAbTest('choose')} title={t('A 案の写しから B 案を作り、クリエイティブ全体(画像・商品・文言)を変えて比べ、決めた 1 案だけを配信します(C 案まで)', 'Create variant B as a copy of A, vary the whole creative (image, products, text), and send only the one you choose (up to C)')}>
                      {t('案を出して選ぶ', 'Make variants to choose from')}
                    </Button>
                    {decision && <Caption1 className={styles.caption}>{t(`前回は ${decision.variant} 案に決めた(上の帯)`, `Last time: went with ${decision.variant} (bar above)`)}</Caption1>}
                  </div>
                )}
              </Field>
              <Text weight="semibold" size={300} className={styles.sectionHead}>{t('工程', 'Steps')}</Text>
              <Field label={t('テーマ(配信全体の前提。メールには出ません)', 'Theme (premise for the whole delivery; not shown in the email)')}>
                <AutoTextarea heightKey="CardDetail.form_theme"
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
                <AutoTextarea heightKey="CardDetail.form_headline"
                  size="small"
                  rows={1}
                                    className={form.headline ? styles.filled : undefined}
                  value={form.headline}
                  onChange={(_, d) => set('headline')(d.value)}
                />
              </Field>
              <Field label={t('コピー(ヘッドラインの下の導入文)', 'Copy (intro text below the headline)')}>
                <AutoTextarea heightKey="CardDetail.form_copy"
                  size="small"
                  rows={2}
                                    className={form.copy ? styles.filled : undefined}
                  value={form.copy}
                  onChange={(_, d) => set('copy')(d.value)}
                />
              </Field>
              {(form.headline || form.copy) && form.copyAngle && <Caption1 className={styles.caption}><span className={styles.lead}>{t('切り口:', 'Angle:')}</span>{` ${form.copyAngle}`}</Caption1>}
              {/* 制作指示は、作るのは中ペインの「⑥ 制作指示」、引き継ぐ前に確かめるのは右のプロセスのペインの「渡す制作指示」。左には置かない(書き換える場所を 1 つにする。X26) */}
            </div>

            <Splitter onDrag={resizeLeft} onDone={saveWidths} />

            {/* 中: コンテンツ生成(テーマ・商品選定・コピー・制作指示) */}
            <div className={mergeClasses(styles.pane, styles.paneMid)}>
              <ContentPane
                theme={form.theme}
                headline={form.headline}
                copy={form.copy}
                subject={form.subject}
                preheader={form.preheader}
                deliveryName={form.name}
                subjectAbKey={ab && active !== 'A' && ownsSubject(ab) ? active : undefined}
                instructions={form.instructions}
                themeReason={form.themeReason}
                copyAngle={form.copyAngle}
                instructionsAngle={form.instructionsAngle}
                onField={(key, value) => setForm((f) => ({ ...f, [key]: value }))}
                template={template}
                onTemplate={changeTemplate}
                country={form.country}
                templateUse={templateUseMap}
                sectionTitles={sectionTitles}
                onSectionTitle={setSectionTitle}
                sectionCopies={sectionCopies}
                onSectionCopy={setSectionCopy}
                products={products}
                heroes={heroes}
                poolProducts={poolProducts}
                poolHeroes={poolHeroes}
                onUploadHero={() => setHeroUpload(true)}
                assetsSlot={
                  <CreativeAssets
                    cardId={card?.id}
                    stage="plan"
                    title={t('参考の素材(制作に使ってほしい画像・資料・ページ)', 'Reference assets (images, documents and pages for production)')}
                    owner={card?.owner}
                    people={owners}
                    cardName={form.name}
                    productionOwner={form.productionOwner}
                    productionDue={form.productionDue}
                    productIds={items.map((i) => i.productId)}
                    products={products}
                  />
                }
                items={items}
                setItems={setItems}
                candidates={candidates}
                setCandidates={setCandidates}
                alertKinds={productAlertKinds}
                onAlert={alertCard ? openAlertFor : undefined}
                onOpenProduct={(key) => {
                  setActAlert(null)
                  setProductOpen(key)
                }}
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
                pushTitle={form.pushTitle}
                pushBody={form.pushBody}
                onPush={(k, v) => setForm((f) => ({ ...f, [k]: v }))}
                scheduledAt={form.scheduledAt}
                campaign={campaignSlug(form.name, form.scheduledAt)}
                utmCampaign={utmCampaign}
                linkVariant={linkVariant}
                onLinksTab={setLinksTab}
                onLinkFocus={setLinkFocus}
                onTabChange={onTabChange}
              />
            </div>

            <Splitter onDrag={resizeMid} onDone={saveWidths} />

            {/* 右: プレビュー */}
            <div className={mergeClasses(styles.pane, styles.panePreview)}>
              <div className={styles.toolbar}>
                <div className={mergeClasses(styles.grow, styles.previewHead)}>
                  {previewTab === 'push' ? <PhoneRegular /> : <MailRegular />}
                  <Text weight="semibold" size={300}>{previewTab === 'push' ? t('アプリのプレビュー', 'App preview') : t('メールのプレビュー', 'Email preview')}</Text>
                  {!form.channel && <Caption1 className={styles.caption}>{t('チャネルが未設定のため、メールで表示しています', 'No channel set — showing the email')}</Caption1>}
                  {previewTab !== 'push' && (
                    <span className={styles.deviceSwitch} role="tablist" aria-label={t('プレビューの幅', 'Preview width')}>
                      {(['mobile', 'pc'] as const).map((d) => (
                        <Button key={d} type="button" size="small" role="tab" aria-selected={previewDevice === d} appearance={previewDevice === d ? 'primary' : 'subtle'} className={styles.deviceBtn} icon={d === 'mobile' ? <PhoneRegular /> : <DesktopRegular />} onClick={() => pickDevice(d)}>
                          {d === 'mobile' ? t('スマホ', 'Mobile') : t('PC', 'Desktop')}
                        </Button>
                      ))}
                    </span>
                  )}
                  {ab && (
                    <Badge appearance="filled" color="brand">
                      {t(`${active} 案`, `Variant ${active}`)}
                    </Badge>
                  )}
                </div>
                {zoomBox}
                <Tooltip
                  relationship="description"
                  content={card ? t('プレビューの場所を押して、そこへの書き込み(承認者のコメント・制作への問い合わせなど)を始めます。Esc でやめます。', 'Click a spot in the preview to start a comment there (approver feedback, questions to production, etc.). Esc to cancel.') : t('配信カードを保存すると、使えます', 'Save the delivery card first')}
                >
                  <ToggleButton type="button" size="small" appearance={placingPin ? 'primary' : 'subtle'} checked={placingPin} icon={<CommentAddRegular />} disabled={!card} onClick={() => setPlacingPin((v) => !v)}>
                    {placingPin ? t('場所を押す…', 'Click a spot…') : t('コメントを置く', 'Place comment')}
                  </ToggleButton>
                </Tooltip>
                {card && <ResolvedPinsToggle />}
                {previewTab === 'email' && template === 'free' && (
                  <>
                    <Switch label={t('カテゴリ見出し', 'Category headings')} checked={showHeadings} onChange={(_, d) => setShowHeadings(d.checked)} />
                    <Button type="button" size="small" appearance="subtle" onClick={groupByCategory} disabled={items.length < 2}>{t('カテゴリでまとめる', 'Group by category')}</Button>
                  </>
                )}
              </div>
              <div ref={previewBoxRef} className={styles.previewBox}>
                <div ref={previewInnerRef} style={{ zoom: zoom === 'fit' ? undefined : zoom }}>
                  <Preview {...previewCommon} items={items} selectedKey={selectedKey} template={template} hero={hero} onSelect={setSelectedKey} />
                </div>
                {card && itemAlertKinds.size > 0 && itemAlertOverlay}
                <PreviewPins
                  boxRef={previewBoxRef}
                  cardId={card?.id}
                  view={pinView(previewTab, previewDevice, ab ? active : 'A')}
                  items={items}
                  placing={placingPin}
                  onPlacingEnd={endPlacingPin}
                  onOpenThreads={openPinThreads}
                  menuItems={detailPreviewMenu}
                />
                {card && pinTarget && (
                  <PinFloat
                    cardId={card.id}
                    cardOwner={form.owner}
                    stage="plan"
                    root={() => previewBoxRef.current}
                    target={pinTarget}
                    productName={(id) => productById.get(id)?.name ?? ''}
                    onTarget={setPinTarget}
                    onClose={closePin}
                  />
                )}
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
                  alertKinds={productAlertKinds}
                  onAlert={alertCard ? openAlertFor : undefined}
                  onOpenProduct={(key) => {
                    setActAlert(null)
                    setProductOpen(key)
                  }}
                />
              </div>
            ) : (
              <PaneRail label={t('商品情報', 'Product info')} onOpen={toggleInfo} />
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
                  onOpenProduction={onOpenProduction}
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

          {footerNode}
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
            {/* 保存(閉じない)と、保存して閉じる(X52。保存のたびに閉じると、続けて直しにくいため) */}
            {justSaved && <span className={styles.savedNote}>{t('保存しました', 'Saved')}</span>}
            <Button type="button" icon={<SaveRegular />} disabled={saving || (changeReason !== null && lockedWeeks.length > 0)} onClick={saveAndStay}>
              {saving && saveMode === 'stay' ? t('保存中...', 'Saving...') : lockedWeeks.length > 0 ? t('理由を入力して保存', 'Save with a reason') : t('保存', 'Save')}
            </Button>
            <Button type="submit" appearance="primary" icon={<SaveRegular />} disabled={saving || (changeReason !== null && lockedWeeks.length > 0)}>
              {saving && saveMode === 'close' ? t('保存中...', 'Saving...') : t('保存して閉じる', 'Save & close')}
            </Button>
          </div>
          </>
          )}
        </form>
      </ResizableSurface>
    </Dialog>
  )
}
