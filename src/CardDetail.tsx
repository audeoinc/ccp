import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  ToggleButton,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { AddRegular, ArrowNextRegular, BeakerRegular, CheckmarkCircleRegular, ChevronLeftRegular, ChevronRightRegular, DataBarVerticalRegular, DesktopRegular, DismissRegular, MailRegular, PhoneRegular, SaveRegular, SubtractRegular } from '@fluentui/react-icons'
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
import { ChannelBadge } from './ChannelBadge'
import { CopyLinkButton } from './CopyLinkButton'
import { FaceBadge } from './FaceBadge'
import { THEME_TYPES, themeTypeLabel, type ThemeType } from './themeTypes'
import { AGE_BANDS, AUDIENCES, TARGET_GENDERS, ageLabel, audienceLabel, fitsTarget, formatAges, genderLabel, parseAges, targetText, type TargetGender } from './target'
import { ContentPane } from './ContentPane'
import { Preview } from './Preview'
import { DEFAULT_PUSH_TEMPLATE, DEFAULT_TEMPLATE, TEMPLATE_VALUES, channelOf, sectionIndexAt, sectionsOf, templateFromValue, type EmailTemplateId, type TemplateChannel, baseTemplateId, currentVersion, splitTemplateKey, templateKeyOfCard } from './templates'
import { parsePushLink, tapComplete, type PushLink } from './pushLink'
import { Splitter } from './Splitter'
import { DND_ITEM, DND_PRODUCT, SOURCE_AI, SOURCE_MANUAL, STATE_CANDIDATE, STATE_SELECTED, type Candidate, type Item } from './items'
import type { AiCard, CopyLanguage, ProposedHero } from './aiSelect'
import { progressOf } from './progress'
import { ResizeHandles } from './ResizeHandles'
import { campaignSlug, encodeLinks, fcmText, linkSlots, linksComplete, parseLinks, productUrl, screenOf, withUtm, type LinkSlot, type Links, utmFor, variantCampaign } from './links'
import { LinkOverlay } from './LinkOverlay'
import { loadAutoDraft, loadPref, savePref } from './settings'
import { runAutoDraft, type AutoDraftResult } from './autoDraft'
import { useAiDrafts } from './useAiDrafts'
import { WeeksService, type WeekRow } from './data/weeks'
import { CardNotesService } from './data/cardNotes'
import { confirmedWeekOf } from './weekLock'
import { logEvent, myName } from './history'
import { ProcessPane, ProcessRail, type TalkTab } from './ProcessPane'
import type { TopTab } from './ContentPane'
import { ApprovalsService } from './data/approvals'
import { CHANNEL_PUSH, channelOptions, countryOptions, statusColor, statusOptions, statusRank } from './status'
import { LearningsBar } from './LearningsBar'
import { CardMenu } from './CardMenu'
import { CardAlertsBar } from './CardAlertsBar'
import { AbDecidedBar, AbTestBar } from './AbTestBar'
import { HeroUploadDialog } from './HeroUploadDialog'
import { CreativeAssets } from './CreativeAssets'
import { isUsableHero } from './heroRights'
import { AbCompare } from './AbCompare'
import { draftVariant } from './abAi'
import { allVariants, encodeAbTest, isChoose, metricLabel, newAbTest, nextVariant, ownsHero, ownsAnyText, ownsProducts, ownsSubject, ownsText, parseAbTest, parseDecision, targetLabel, type AbDecision, type AbPurpose, type AbTarget, type AbTest, type RejectedVariant, type VariantKey, type VariantText } from './abTest'
import { ProductActionFloat, type SwapOption } from './ProductActionFloat'
import { ItemAlertOverlay } from './ItemAlertOverlay'
import type { StockModel } from './alerts'
import { CARD_ALERT_ORDER, type CardAlert } from './cardAlerts'
import { viewHeight, viewWidth } from './uiScale'

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
  onOpenProduction?: (cardId: string) => void
  /** 題名の左に出す、配信の段階の帯(計画・制作・結果を行き来する。StageNav)。新規作成のときはなく、面の札を出す */
  stageNav?: ReactNode
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

interface Form {
  name: string
  scheduledAt: string
  country: string
  channel: string
  /** Type = テーマの種類(theme_type。値下げ・セール・新作 など。X41。これまでの種別 department は使わない) */
  themeType: string
  status: string
  owner: string
  /** 配信の対象(X40): 性別(women / men / 空 = 指定なし)と年代(カンマ区切り) */
  targetGender: string
  targetAges: string
  /** アプリ: 通知のタイトル・本文 */
  pushTitle: string
  pushBody: string
  /** メール: 件名(空は配信名)・プリヘッダー(X2) */
  subject: string
  preheader: string
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
  w: Math.round(Math.min(viewWidth(), Math.max(MIN_DIALOG.w, s.w))),
  h: Math.round(Math.min(viewHeight(), Math.max(MIN_DIALOG.h, s.h))),
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
}

/** AB テストの、いま編集していない案の中身(X55。編集中の案は items・heroId・heroReason にある) */
interface VariantData {
  items: Item[]
  heroId?: string
  heroReason: string
  /** 文言(比べる要素が all のとき。X57) */
  texts?: VariantText
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
  deviceSwitch: { display: 'inline-flex', columnGap: '2px', marginLeft: '4px' },
  deviceBtn: { minWidth: 'auto', height: '24px', padding: '0 8px', fontWeight: tokens.fontWeightRegular },
  previewHead: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap', minWidth: 0 },
  // 配信の対象(X40)
  targetBox: { display: 'grid', rowGap: '6px', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2 },
  targetRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px' },
  savedNote: { alignSelf: 'center', fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteGreenForeground1 },
  targetChip: { minWidth: 'auto', height: '24px', padding: '0 10px', fontWeight: tokens.fontWeightRegular },
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

export function CardDetail({ card, defaults, draft, onCreated, onReopen, onHeroesChanged, weekUse, products, heroes, otherThemes, owners = [], weeks = [], onBack, onSaved, onOpenResults, alerts = [], focusProductId, stockModel, onOpenAlerts, onOpenProduction, stageNav, initialTab, onTabChange, next, onNext }: Props) {
  const t = useT()
  const styles = useStyles()
  const [form, setForm] = useState<Form>(() => (card ? toForm(card) : draft ? toForm(draft.card) : { ...toForm(), ...defaults }))
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
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'pc'>(() => loadPref<'mobile' | 'pc'>('cardDetail.previewDevice', 'mobile'))
  const pickDevice = (d: 'mobile' | 'pc') => {
    setPreviewDevice(d)
    savePref('cardDetail.previewDevice', d)
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
  const [heroUpload, setHeroUpload] = useState(false)
  // AB テスト(X55)。ab = 設定(null = しない)、active = いま編集している案、stash = 編集していない案の中身(A を含む)
  const [ab, setAb] = useState<AbTest | null>(() => parseAbTest(card?.ab_test ?? draft?.card.ab_test))
  const [active, setActive] = useState<VariantKey>('A')
  const [stash, setStash] = useState<Partial<Record<VariantKey, VariantData>>>(() => {
    const a = parseAbTest(card?.ab_test ?? draft?.card.ab_test)
    const out: Partial<Record<VariantKey, VariantData>> = {}
    for (const k of a?.variants ?? []) out[k] = { items: [], heroId: a?.heroes[k]?.heroId, heroReason: a?.heroes[k]?.heroReason ?? '', texts: a?.texts?.[k] }
    return out
  })
  const [widths, setWidths] = useState<Widths>(loadWidths)
  const [links, setLinks] = useState<Links>(() => parseLinks(card?.links))
  // リンク先のタブを開いているか・設定の欄で選んでいる場所(プレビューに、番号と枠を重ねる。W12)
  const [linksTab, setLinksTab] = useState(false)
  // プロセスのペインのタブを開く頼み(左の「制作への引き継ぎ」を押すと、「引き継ぎ」のタブを開く)
  const [tabRequest, setTabRequest] = useState<{ tab: TalkTab; seq: number } | undefined>(undefined)
  // 中ペインの工程のタブを開く頼み(プロセスのペインの「⑥ で直す」で、制作指示を開く)
  // リンクから開いたときは、そのタブで始める(seq 1 で、最初に 1 回だけ開く)
  const [stepRequest, setStepRequest] = useState<{ tab: TopTab; seq: number } | undefined>(() => (initialTab ? { tab: initialTab as TopTab, seq: 1 } : undefined))
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
  const sizeStyle = size && viewWidth() >= 900 ? (() => { const c = clampSize(size); return { width: `${c.w}px`, height: `${c.h}px`, maxHeight: `${c.h}px` } })() : undefined
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
          }
          const variant = r.variant ?? ''
          snap.set(base.rowId!, { reason: base.reason, source: base.source, state, section, order: r.sort_order ?? 0, variant })
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
  // AB テストの配信は、いま編集している案の印を campaign に付ける(X55)
  const linkVariant = ab ? active : null
  const linkUtm = utmFor(links, linkCampaign, linkVariant)
  const fcmCampaign = variantCampaign(linkCampaign, linkVariant)
  // アプリの配信は、URL の代わりに、開く画面(FCM の data)を出す
  const linkUrlOf = (slot: LinkSlot) => {
    if (previewTab === 'push') {
      const d = fcmText(screenOf(links, slot), fcmCampaign)
      return d ? `data: ${d}` : ''
    }
    const url = ((slot.kind === 'hero' ? links.hero : links.buttons?.[slot.key]) ?? '').trim() || slot.defaultUrl
    return url ? withUtm(url, linkUtm) : ''
  }
  const productLinkOf = (itemKey: string) => {
    const it = items.find((x) => x.key === itemKey)
    const p = it && products.find((x) => x.id === it.productId)
    if (!p) return undefined
    if (previewTab === 'push') return { name: p.name, url: p.product_code ? `data: ${fcmText({ kind: 'product', value: p.product_code }, fcmCampaign)}` : '' }
    return { name: p.name, url: withUtm(productUrl(p), linkUtm) }
  }
  const stepZoom = (d: number) => setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((shownZoom + d) * 20) / 20)))

  const panesRef = useRef<HTMLDivElement>(null)
  // 中央の上限: ダイアログの中の幅から、左・商品情報・境界線・プレビューの最小幅を引いた残り
  const midMax = (w: Widths) => {
    const total = panesRef.current?.clientWidth ?? viewWidth()
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
      department: '',
      themeType: form.themeType ? themeTypeLabel(form.themeType as ThemeType) : undefined,
      target: targetText({ gender: form.targetGender, ages: form.targetAges, audience: templateChannel === 'push' ? audience : '' }),
      theme: form.theme,
      headline: form.headline,
      copy: form.copy,
      instructions: form.instructions,
    }
  }

  // 商品・メイン画像は、配信カードの国に合う市場のものだけを、選定の対象にする(すでに載せた他の市場の商品は、表示のために残す)
  const market = cardMarket(form.country)
  // 配信の対象の性別が決まっていれば、それに合う商品だけ(女性向けなら、ウィメンズとユニセックス。X40)
  const poolProducts = useMemo(() => products.filter((p) => (!market || productMarket(p) === market) && fitsTarget(p, form.targetGender)), [products, market, form.targetGender])
  // 使える期限を過ぎた画像は、選ぶ候補・AI の候補から外す(いま使っている画像は残す。X59)
  const poolHeroes = useMemo(() => heroes.filter((h) => (!market || heroMarket(h) === market) && (isUsableHero(h) || h.id === heroId)), [heroes, market, heroId])

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

  // ---- AB テスト(X55)・案から選ぶ(X57): 案の中身の出し入れ。編集中の案は items・heroId・heroReason・文言の state、それ以外は stash
  // 案ごとに持たないもの(比べる要素でないもの)は、全案で共通 = いまの state そのもの
  const curText = (): VariantText => ({ headline: form.headline, copy: form.copy, pushTitle: form.pushTitle, pushBody: form.pushBody, sectionTitles, sectionCopies, subject: form.subject, preheader: form.preheader })
  const itemsOf = (k: VariantKey): Item[] => (k === active || !ownsProducts(ab) ? items : (stash[k]?.items ?? []))
  const heroOf = (k: VariantKey): { heroId?: string; heroReason: string } =>
    k === active || !ownsHero(ab) ? { heroId, heroReason } : { heroId: stash[k]?.heroId, heroReason: stash[k]?.heroReason ?? '' }
  // 件名だけを比べるときも、文言を案ごとに持つ(読むのは件名・プリヘッダーだけ)
  const textsOf = (k: VariantKey): VariantText => (k === active || !ownsAnyText(ab) ? curText() : (stash[k]?.texts ?? curText()))
  /** 保存する設定(B・C 案のメイン画像・文言を入れる) */
  const abForSave = (): AbTest | null => {
    if (!ab) return null
    const heroes = ownsHero(ab) ? Object.fromEntries(ab.variants.map((k) => [k, heroOf(k)])) : {}
    const texts = ownsAnyText(ab) ? Object.fromEntries(ab.variants.map((k) => [k, textsOf(k)])) : undefined
    return { ...ab, heroes, ...(texts ? { texts } : {}) }
  }
  /** 文言を画面に出す(ヘッドライン・コピー・通知の文・セクションの見出しとコピー) */
  /** 文言を画面に出す。full でなければ(件名だけを比べるとき)件名・プリヘッダーだけ */
  const showText = (x: VariantText, full = true) => {
    setForm((f) => ({
      ...f,
      ...(full ? { headline: x.headline, copy: x.copy, pushTitle: x.pushTitle, pushBody: x.pushBody } : {}),
      subject: x.subject ?? f.subject,
      preheader: x.preheader ?? f.preheader,
    }))
    if (full) {
      setSectionTitles(x.sectionTitles)
      setSectionCopies(x.sectionCopies)
    }
  }

  /** いま編集している案を stash に置き、to の案の中身を出す(案ごとに持つものだけ。共通のものはそのまま) */
  const loadVariant = (to: VariantKey, data: VariantData, base: AbTest | null) => {
    setStash((prev) => ({ ...prev, [active]: { items, heroId, heroReason, texts: curText() } }))
    if (ownsProducts(base)) {
      setItems(data.items)
      setSelectedKey(null)
    }
    if (ownsHero(base)) {
      setHeroId(data.heroId)
      setHeroReason(data.heroReason)
    }
    if (ownsAnyText(base) && data.texts) showText(data.texts, ownsText(base))
    setActive(to)
  }
  const switchVariant = (to: VariantKey) => {
    if (to === active) return
    loadVariant(to, stash[to] ?? { items: [], heroReason: '' }, ab)
  }
  /** A 案の写し(商品は新しい行として。行 ID は持たない) */
  const copyOfA = (): VariantData => {
    const h = heroOf('A')
    const x = textsOf('A')
    return {
      items: itemsOf('A').map((i) => ({ ...i, key: crypto.randomUUID(), rowId: undefined })),
      heroId: h.heroId,
      heroReason: h.heroReason,
      texts: { ...x, sectionTitles: [...x.sectionTitles], sectionCopies: [...x.sectionCopies] },
    }
  }
  const startAbTest = (purpose: AbPurpose = 'test') => {
    setStash({ B: copyOfA() })
    setAb(newAbTest(purpose))
  }
  const addVariant = () => {
    if (!ab) return
    const k = nextVariant(ab)
    if (!k) return
    const nextAb = { ...ab, variants: [...ab.variants, k].sort() as VariantKey[] }
    setAb(nextAb)
    loadVariant(k, copyOfA(), nextAb)
  }
  /** A 案に戻す */
  const backToA = () => {
    if (active !== 'A') loadVariant('A', stash.A ?? { items: [], heroReason: '' }, ab)
  }
  const removeVariant = (k: VariantKey) => {
    if (!ab) return
    backToA()
    const rest = ab.variants.filter((x) => x !== k)
    setStash((prev) => {
      const next = { ...prev }
      delete next[k]
      return next
    })
    setAb(rest.length ? { ...ab, variants: rest } : null)
  }
  // 「この案を AI で作る」と「並べて比べる」(X55 段階 3)
  const [abAiBusy, setAbAiBusy] = useState(false)
  const [comparing, setComparing] = useState<'live' | 'decided' | null>(null)
  const draftActiveVariant = async () => {
    if (!ab || active === 'A') return
    if (!form.theme.trim()) {
      setError(tr('AI で案を作るには、先にテーマを決めてください', 'Set a theme before drafting a variant with AI'))
      return
    }
    const key = active
    const others = ab.variants.filter((k) => k !== key)
    setAbAiBusy(true)
    setError(null)
    try {
      const res = await draftVariant({
        ab,
        key,
        card: buildAiCard(),
        template,
        aProductIds: itemsOf('A').map((i) => i.productId),
        aHeroId: heroOf('A').heroId,
        otherProductIds: others.flatMap((k) => itemsOf(k).map((i) => i.productId)),
        otherHeroIds: others.map((k) => heroOf(k).heroId).filter((x): x is string => !!x),
        products: poolProducts,
        heroes: poolHeroes,
        sectionTitles,
        sectionCopies,
        language,
      })
      if (res.hero) {
        setHeroId(res.hero.heroId)
        setHeroReason(res.hero.reason)
      }
      if (res.sections) {
        setItems(res.sections.flat().map((r) => ({ key: crypto.randomUUID(), productId: r.productId, reason: r.reason, source: SOURCE_AI })))
        setSelectedKey(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setAbAiBusy(false)
    }
  }
  const stopAbTest = () => {
    backToA()
    setStash({})
    setAb(null)
  }
  /** 比べる要素を変える。A 案に戻してから変え、新しく案ごとに持つものは、A の写しで始める */
  const changeTarget = (target: AbTarget) => {
    if (!ab) return
    backToA()
    const next = { ...ab, target }
    const a = copyOfA()
    setStash((prev) => {
      const out = { ...prev }
      for (const k of ab.variants) {
        const cur = out[k] ?? { items: [], heroReason: '' }
        const addProducts = ownsProducts(next) && !ownsProducts(ab)
        const addHero = ownsHero(next) && !ownsHero(ab)
        const addText = ownsAnyText(next) && !ownsAnyText(ab)
        out[k] = {
          items: addProducts ? a.items.map((i) => ({ ...i, key: crypto.randomUUID() })) : cur.items,
          heroId: addHero ? a.heroId : cur.heroId,
          heroReason: addHero ? a.heroReason : cur.heroReason,
          texts: addText ? a.texts : cur.texts,
        }
      }
      return out
    })
    setAb(next)
  }
  /**
   * 案から選ぶ(X57): この案に決める。決めた案が配信の中身(A)になり、ほかの案は「配信しなかった案」として中身ごと残す(保存で確定)。
   * 誰でも決められる(利用者 2026-10-20: とりあえず誰でも)
   */
  // 決めたときの比べる要素から、案ごとに持っていたものを判定する(ownsProducts などは設定の形で受け取るため)
  const asTarget = (target: AbTarget): AbTest => ({ ...newAbTest(), target })
  const [decision, setDecision] = useState<AbDecision | null>(() => parseDecision(card?.ab_test ?? draft?.card.ab_test))
  const decideVariant = (k: VariantKey) => {
    if (!ab) return
    const others = allVariants(ab).filter((x) => x !== k)
    if (!window.confirm(tr(`${k} 案に決めます。配信するのは ${k} 案だけになり、${others.join('・')} 案は「配信しなかった案」として残します(保存で確定)。よろしいですか?`, `Go with variant ${k}? Only ${k} will be sent; ${others.join(', ')} will be kept as variants not sent (on save).`))) return
    const rejected: RejectedVariant[] = others.map((x) => ({
      key: x,
      ...(ownsHero(ab) ? heroOf(x) : {}),
      productIds: ownsProducts(ab) ? itemsOf(x).map((i) => i.productId) : [],
      ...(ownsAnyText(ab) ? { texts: textsOf(x) } : {}),
    }))
    const chosen: VariantData = { items: itemsOf(k), ...heroOf(k), texts: textsOf(k) }
    // 決めた案の中身を、配信そのもの(A)にする。B・C 案の行は、保存で A の行になる(行 ID はそのまま使い、variant を空に)
    if (ownsProducts(ab)) setItems(chosen.items)
    if (ownsHero(ab)) {
      setHeroId(chosen.heroId)
      setHeroReason(chosen.heroReason)
    }
    if (ownsAnyText(ab) && chosen.texts) showText(chosen.texts, ownsText(ab))
    setSelectedKey(null)
    setStash({})
    setActive('A')
    setDecision({ variant: k, at: new Date().toISOString(), by: myName() || form.owner || '', target: ab.target, rejected })
    setAb(null)
    setAlertNotes((prev) => [
      ...prev,
      tr(`案から選ぶ: ${k} 案に決めた。${others.join('・')} 案は配信しない(中身は配信カードの「配信しなかった案」に残す)`, `Chose variant ${k}. ${others.join(', ')} will not be sent (kept as variants not sent in the delivery card).`),
    ])
  }

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
      ...(ab && ownsProducts(ab)
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
      }
      let res
      if (d.it.rowId) {
        const old = before.get(d.it.rowId)
        if (old && old.reason === d.it.reason && old.source === d.it.source && old.state === d.state && old.section === d.section && old.order === d.order && old.variant === d.variant) continue
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
        email_template: TEMPLATE_VALUES[baseTemplateId(template)],
        // テンプレートの ID と、使った版の番号を分けて書く(いまの版を選んだときは、いまの版の番号)
        layout_key: baseTemplateId(template),
        layout_version: splitTemplateKey(template).version ?? currentVersion(template),
        section_titles: textsOf('A').sectionTitles.join('\n').replace(/\n+$/, ''),
        section_copies: encodeCopies(textsOf('A').sectionCopies),
        // AI でまとめて作った中身を、人が配信カードで確かめて保存したら、未確認の印を外す(W14)
        ...(card?.ai_unchecked_at ? { ai_unchecked_at: null as never } : {}),
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
    return JSON.stringify({ ...rest, items: itemsOf('A').map((i) => i.productId), variants: ab && ownsProducts(ab) ? ab.variants.map((k) => itemsOf(k).map((i) => i.productId)) : [] })
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
  // ---- アラートへの対応(上の帯・プレビューの商品の枠・商品情報の行から開く。差し替えは、この配信カードの中で置き換えて、保存で確定)
  const [actAlert, setActAlert] = useState<CardAlert | null>(null)
  // 商品の行(中の「選定済み」・右の商品情報)から開いた、商品の対応のフロートの行(X54。アラートから開いたときは actAlert)
  const [productOpen, setProductOpen] = useState<string | null>(null)
  // 差し替えた理由(保存したときに、配信のメモ(種類 change)に残す。アラートの画面で差し替えたときと同じ記録)。
  // アラートへの対応と、商品のフロートで残りの候補と入れ替えたとき(X47)の両方
  const [alertNotes, setAlertNotes] = useState<string[]>([])
  // 商品ごとの、いちばん強いアラート(商品の枠の印・商品情報のラベルに使う)
  const alertByProduct = new Map<string, CardAlert>()
  // 差し替えなどでこの配信から外した商品のアラートは、保存の前でも出さない(保存すると、アラートは計算し直される)
  const liveAlerts = alerts.filter((a) => !a.productId || items.some((i) => i.productId === a.productId))
  for (const k of CARD_ALERT_ORDER.slice().reverse()) for (const a of liveAlerts) if (a.kind === k && a.productId) alertByProduct.set(a.productId, a)
  const itemAlertKinds = new Map(items.filter((i) => alertByProduct.has(i.productId)).map((i) => [i.key, alertByProduct.get(i.productId)!.kind] as const))
  const openAlertFor = (productId: string) => {
    const a = alertByProduct.get(productId)
    if (a) {
      setProductOpen(null)
      setActAlert(a)
    }
  }
  // アラートへの対応で使う配信(保存した配信か、作業画面から開いた、まだ保存していない案)
  const alertCard = card ?? draft?.card
  const replaceForAlert = (alert: CardAlert, to: Product, reason = '') => {
    const from = products.find((p) => p.id === alert.productId)
    // 保存では、行の商品 ID は書き換えない(並び・理由だけを直す)ので、差し替えた枠は行 ID を外して、新しい行として保存する(元の行は消える)
    setItems((prev) => prev.map((i) => (i.productId === alert.productId ? { ...i, rowId: undefined, productId: to.id, reason: tr(`${alert.label} の代わり(アラートへの対応)`, `Replaces ${alert.label} (alert)`), source: SOURCE_MANUAL } : i)))
    const why = reason.trim()
    setAlertNotes((prev) => [...prev, tr(`${from?.name ?? alert.label}: ${alert.detail}。${to.name} に差し替えた${why ? `。理由: ${why}` : ''}`, `${from?.name ?? alert.label}: ${alert.detail}. Replaced with ${to.name}.${why ? ` Reason: ${why}` : ''}`)])
    setActAlert(null)
  }
  // 商品のフロートの「ほかの候補から選ぶ」(X47): 選定済みの商品と、残りの候補を入れ替える(中ペインの「選ぶ」と同じく、外した商品は候補に戻す)。
  // どちらの行も行 ID のまま状態(選定 / 候補)だけが変わるので、保存で商品 ID を書き換えずに済む。確定は保存のとき
  const swapWithCandidate = (itemKey: string, candKey: string, reason: string) => {
    const it = items.find((i) => i.key === itemKey)
    const c = candidates.find((x) => x.key === candKey)
    if (!it || !c) return
    const from = products.find((p) => p.id === it.productId)
    const to = products.find((p) => p.id === c.productId)
    const why = reason.trim()
    setItems((prev) => prev.map((i) => (i.key === itemKey ? { key: c.key, rowId: c.rowId, productId: c.productId, reason: c.reason, source: c.source } : i)))
    setCandidates((prev) => [{ ...it, section: c.section }, ...prev.filter((x) => x.key !== candKey)])
    setAlertNotes((prev) => [
      ...prev,
      why
        ? tr(`${from?.name ?? ''} を ${to?.name ?? ''} に差し替えた。理由: ${why}`, `Replaced ${from?.name ?? ''} with ${to?.name ?? ''}. Reason: ${why}`)
        : tr(`${from?.name ?? ''} を ${to?.name ?? ''} に差し替えた`, `Replaced ${from?.name ?? ''} with ${to?.name ?? ''}.`),
    ])
  }
  // 商品の対応のフロート(X54)で、AI の案・検索で選んだ商品に置き換える(アラートからのときは replaceForAlert)。
  // 保存では行の商品 ID を書き換えないので、置き換えた枠は行 ID を外して、新しい行として保存する
  const replaceItemWith = (itemKey: string, to: Product, reason: string) => {
    const it = items.find((i) => i.key === itemKey)
    if (!it) return
    const from = products.find((p) => p.id === it.productId)
    const why = reason.trim()
    setItems((prev) => prev.map((i) => (i.key === itemKey ? { ...i, rowId: undefined, productId: to.id, reason: why || tr(`${from?.name ?? ''} の代わり(人が選んだ)`, `Replaces ${from?.name ?? ''} (chosen by hand)`), source: SOURCE_MANUAL } : i)))
    setAlertNotes((prev) => [
      ...prev,
      why ? tr(`${from?.name ?? ''} を ${to.name} に差し替えた。理由: ${why}`, `Replaced ${from?.name ?? ''} with ${to.name}. Reason: ${why}`) : tr(`${from?.name ?? ''} を ${to.name} に差し替えた`, `Replaced ${from?.name ?? ''} with ${to.name}.`),
    ])
  }
  // 商品 ID → いちばん強いアラートの種類(中ペインの選定済みの行と、商品情報の行の札)
  const productAlertKinds = new Map([...alertByProduct].map(([id, a]) => [id, a.kind] as const))
  const postponeForAlert = () => {
    setActAlert(null)
    // 左の配信日時の欄へ移って、光らせる(延期も、ここで直して保存する)
    window.setTimeout(() => {
      const input = surfaceRef.current?.querySelector<HTMLInputElement>('input[type="datetime-local"]')
      input?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      input?.focus()
    }, 50)
  }
  const openAlertsScreen = (productId?: string) => {
    // 変更の有無は、state の changed で見る(ref を読む isDirty は、描画の中で渡す関数から呼べないため)
    if (changed && !window.confirm(tr('保存していない変更があります。破棄して、アラートの画面を開きますか?', 'You have unsaved changes. Discard them and open the Alerts screen?'))) return
    setActAlert(null)
    onOpenAlerts?.(productId)
  }
  // 開いてから内容を変えたか(承認済み・確定した週の帯は、変えたときだけ出す。ふだんの説明は、右のプロセスのペインの状態の下)
  const [changed, setChanged] = useState(false)
  const currentKey = contentKey()
  useEffect(() => {
    setChanged(baseline.current !== null && baseline.current !== currentKey)
  }, [currentKey])
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
        return
      }
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
    push: templateChannel === 'push' ? { title: form.pushTitle, body: form.pushBody } : undefined,
  })
  const hero = heroes.find((h) => h.id === heroId)

  return (
    <Dialog open onOpenChange={(_, d) => { if (!d.open && !saving) onBack() }}>
      <DialogSurface ref={surfaceRef} className={styles.surface} style={sizeStyle} aria-label={card ? card.name : draft ? draft.card.name : t('配信カードの新規作成', 'New delivery card')}>
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
            {card && <CopyLinkButton />}
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

          {card?.ai_unchecked_at && (
            <MessageBar layout="multiline" intent="info" className={styles.locked}>
              <MessageBarBody>
                {t(
                  'この配信の中身は、週の枠から AI でまとめて作ったもので、まだ誰も確かめていません。中身を確かめて保存すると、「AI 下書き・未確認」の印が外れます。',
                  'This content was created by AI in bulk from a week slot and nobody has checked it yet. Check it and save to clear the “AI draft, unchecked” mark.',
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

          {/* 商品の対応のフロート(X54): アラートの札・商品の行の、どこから開いても、これ 1 つ */}
          {(actAlert || productOpen) && (() => {
            const item = actAlert ? items.find((i) => i.productId === actAlert.productId) : items.find((i) => i.key === productOpen)
            const product = products.find((p) => p.id === (item?.productId ?? actAlert?.productId))
            const idx = item ? items.indexOf(item) : -1
            const section = idx >= 0 ? sectionIndexAt(sectionsOf(template), idx) : -1
            const options: SwapOption[] = candidates.filter((c) => c.section === section).flatMap((c) => {
              const p = products.find((x) => x.id === c.productId)
              return p ? [{ key: c.key, product: p, reason: c.reason, source: c.source }] : []
            })
            const closeAction = () => {
              setActAlert(null)
              setProductOpen(null)
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
                onClose={closeAction}
              />
            )
          })()}
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
          {/* これまでの学び(同じテンプレート・テーマの種類の、過去の配信のメモ)。保存済みの配信だけ */}
          {card && (
            <LearningsBar card={card} templateId={template} country={form.country} channel={form.channel} name={form.name} theme={form.theme} headline={form.headline} themeType={form.themeType} />
          )}

          {heroUpload && (
            <HeroUploadDialog
              market={cardMarket(form.country)}
              cardId={card?.id}
              me={myName() || form.owner}
              onClose={() => setHeroUpload(false)}
              onDone={async (h) => {
                await onHeroesChanged?.()
                setHeroId(h.id)
                setHeroReason(tr('持っている画像を上げて使った', 'Uploaded and used'))
                setHeroUpload(false)
              }}
            />
          )}
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
          {ab && comparing === 'live' && (
            <AbCompare
              ab={ab}
              base={{ id: card?.id ?? 'draft', ...buildContent(), hero_image_id: null } as DeliveryCard}
              variants={allVariants(ab).map((k) => ({ key: k, productIds: itemsOf(k).map((i) => i.productId), heroId: heroOf(k).heroId, texts: ownsAnyText(ab) ? textsOf(k) : undefined }))}
              products={products}
              heroes={heroes}
              onEdit={switchVariant}
              onClose={() => setComparing(null)}
            />
          )}
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
              <Field label={t('配信名', 'Delivery name')} required>
                <Input size="small" required value={form.name} onChange={(_, d) => set('name')(d.value)} />
              </Field>
              <Field label={t('配信日時', 'Send date & time')} required>
                <Input size="small" required type="datetime-local" value={form.scheduledAt} onChange={(_, d) => set('scheduledAt')(d.value)} />
              </Field>
              <div className={styles.twoCol}>
                <OptionSelect label={t('国', 'Country')} value={form.country} options={countryOptions} onChange={set('country')} />
                <OptionSelect label={t('チャネル', 'Channel')} value={form.channel} options={channelOptions} onChange={set('channel')} />
                <OptionSelect label={t('種類', 'Type')} value={form.themeType} options={THEME_TYPES.map((v) => ({ value: v, label: themeTypeLabel(v) }))} onChange={set('themeType')} />
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
              {/* 配信の対象(X40): 誰に向けて作るか。最初に決め、AI の下書きと商品の候補をこれに合わせる */}
              <Field label={t('配信の対象', 'Target')} hint={t('AI の下書きと商品の候補が、これに合わせます', 'AI drafts and product candidates follow this')}>
                <div className={styles.targetBox}>
                  <div className={styles.targetRow}>
                    <span className={styles.targetLabel}>{t('性別', 'Gender')}</span>
                    {(['', ...TARGET_GENDERS] as TargetGender[]).map((g) => (
                      <ToggleButton key={g || 'none'} className={styles.targetChip} size="small" shape="circular" checked={form.targetGender === g} appearance={form.targetGender === g ? 'primary' : 'outline'} onClick={() => set('targetGender')(g)}>
                        {genderLabel(g)}
                      </ToggleButton>
                    ))}
                  </div>
                  <div className={styles.targetRow}>
                    <span className={styles.targetLabel}>{t('年代', 'Age')}</span>
                    <ToggleButton className={styles.targetChip} size="small" shape="circular" checked={!form.targetAges} appearance={!form.targetAges ? 'primary' : 'outline'} onClick={() => set('targetAges')('')}>
                      {t('指定なし', 'Not specified')}
                    </ToggleButton>
                    {AGE_BANDS.map((a) => {
                      const on = parseAges(form.targetAges).includes(a)
                      return (
                        <ToggleButton
                          key={a}
                          className={styles.targetChip}
                          size="small"
                          shape="circular"
                          checked={on}
                          appearance={on ? 'primary' : 'outline'}
                          onClick={() => {
                            const now = parseAges(form.targetAges)
                            set('targetAges')(formatAges(on ? now.filter((x) => x !== a) : [...now, a]))
                          }}
                        >
                          {ageLabel(a)}
                        </ToggleButton>
                      )
                    })}
                  </div>
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
                </div>
              </Field>
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
              {/* 制作指示は、作るのは中ペインの「⑥ 制作指示」、引き継ぐ前に確かめるのは右のプロセスのペインの「渡す制作指示」。左には置かない(書き換える場所を 1 つにする。X26) */}
            </div>

            <Splitter onDrag={resize(0)} onDone={saveWidths} />

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
                linkVariant={linkVariant}
                onLinksTab={setLinksTab}
                onLinkFocus={setLinkFocus}
                onTabChange={onTabChange}
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
                    subjectLine={form.subject}
                    preheader={form.preheader}
                    device={previewDevice}
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
                {card && itemAlertKinds.size > 0 && (
                  <ItemAlertOverlay
                    boxRef={previewBoxRef}
                    kinds={itemAlertKinds}
                    onOpen={(key) => {
                      const it = items.find((i) => i.key === key)
                      if (it) openAlertFor(it.productId)
                    }}
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
            {/* 保存(閉じない)と、保存して閉じる(X52。保存のたびに閉じると、続けて直しにくいため) */}
            {justSaved && <span className={styles.savedNote}>{t('保存しました', 'Saved')}</span>}
            <Button type="button" icon={<SaveRegular />} disabled={saving || (changeReason !== null && lockedWeeks.length > 0)} onClick={saveAndStay}>
              {saving && saveMode === 'stay' ? t('保存中...', 'Saving...') : lockedWeeks.length > 0 ? t('理由を入力して保存', 'Save with a reason') : t('保存', 'Save')}
            </Button>
            <Button type="submit" appearance="primary" icon={<SaveRegular />} disabled={saving || (changeReason !== null && lockedWeeks.length > 0)}>
              {saving && saveMode === 'close' ? t('保存中...', 'Saving...') : t('保存して閉じる', 'Save & close')}
            </Button>
          </div>
        </form>
      </DialogSurface>
    </Dialog>
  )
}
