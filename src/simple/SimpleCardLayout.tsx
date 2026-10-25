import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { Button, CounterBadge, InfoLabel, MessageBar, MessageBarBody, Tab, TabList, ToggleButton, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Popover, PopoverSurface, PopoverTrigger, Spinner, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, AlertRegular, ArrowUndoRegular, MailRegular, BoxMultipleArrowRightRegular, ImageMultipleRegular, CheckmarkRegular, ErrorCircleRegular, CommentAddRegular, ColumnTripleRegular, CommentRegular, SettingsRegular, ChevronDoubleLeftRegular, ChevronRightRegular, DesktopRegular, DismissRegular, HistoryRegular, LightbulbRegular, WarningRegular, LayoutColumnTwoRegular, PersonAvailableRegular, PhoneRegular, SaveRegular, SubtractRegular } from '@fluentui/react-icons'
import { ChannelBadge } from '../ChannelBadge'
import { AiIcon } from '../AiMark'
import { ProductInfoPane } from '../ProductInfoPane'
import { PreviewPartPicker } from '../PreviewPartPicker'
import { PreviewPins } from '../PreviewPins'
import { ResolvedPinsToggle } from '../ResolvedPinsToggle'
import { pinView } from '../pinStore'
import { CommPane, type CommCounts, type CommSection } from './CommPane'
import { CardAlertsBar } from '../CardAlertsBar'
import { Hint } from '../Hint'
import { PinFloat } from '../PinFloat'
import { focusSoon, type ContextItem } from '../ContextMenu'
import { previewMenuItems } from '../previewMenu'
import { usePreviewPins } from '../usePreviewPins'
import { heroImage } from '../images'
import { productUrl } from '../links'
import { MoreHorizontalRegular, ArrowSwapRegular, DeleteRegular, ArrowClockwiseRegular } from '@fluentui/react-icons'
import { Splitter } from '../Splitter'
import { useStoredWidths } from '../floatLayout'
import { Row, productMeta } from '../ProductRow'
import { ALERT_COLOR } from '../alertColors'
import { productImage } from '../images'
import { locale, useT } from '../i18n'
import { loadPref, savePref } from '../settings'
import { PREF } from '../prefKeys'
import { getTemplate, slotsOf } from '../templates'
import { statusRank } from '../status'
import { ReadinessList } from './ReadinessList'
import { readinessIssues, readinessOf, type ReadinessTarget } from './readiness'
import { NextAction } from './NextAction'
import { myNextStep, type NextStep } from './nextStep'
import { ApprovalBadge } from './ApprovalBadge'
import { PartPane } from './PartPane'
import { ProductSwap, type SwapAt } from './ProductSwap'
import { placeInPart } from './actions'
import { partFromElement, partKey, partOfAnchor, samePart, type PartRef } from './parts'
import { usePreviewNav } from './usePreviewNav'
import { StageHeader } from './StageHeader'
import { HandoffSheet } from './HandoffSheet'
import { CreativeAssets } from '../CreativeAssets'
import { addDroppedAssets, canDropAsset } from './assetDrop'
import { myName, onMeChange } from '../history'
import { CardAssetsService } from '../data/cardAssets'
import { PreviewMarks, type Mark } from './PreviewMarks'
import type { SimpleEditor } from './editor'
import type { PartTurn } from './partAi'
import { SenderName } from '../SenderName'
import { confirmDialog } from '../confirm'
import { PaneRail } from '../PaneRail'
import { typo } from '../typo'

// プレビュー(スマホ / PC の幅ごと)・商品の一覧のペインの幅と、商品の一覧の開閉(人の設定。ARCHITECTURE の 8 章)。
// プレビューは、メールの幅に合わせた幅にし、余りは選んだ部品のペインに回す(AI の入力欄と案を置くため。v2 で、プレビューを残りの幅から固定の幅に改めた)
const WIDTH_KEY = PREF.simplePaneWidths
const PRODUCTS_KEY = PREF.simpleProductsOpen
const RAIL_W = 32
type Widths = { mobile: number; pc: number; list: number; comm: number; hand: number }
const DEFAULT_WIDTHS: Widths = { mobile: 470, pc: 760, list: 300, comm: 320, hand: 400 }
// 左のバーと、開くパネル(SU4。2026-10-24 利用者と決めた。以前は右端にあり、気づかれなかった)。
// 配信の全体にかかわる情報とメニュー(やり取り・承認の様子・素材・渡すもの・変更の記録)をここにまとめ、真ん中は作業する場所にする。
// VS Code の左のアイコンの並びと同じく、押したものを 1 つだけ開き、同じものをもう一度押すと閉じる。どれを開いていたかと幅は、人ごとに覚える
const SIDE_KEY = PREF.simpleSidePanel
type Side = CommSection | 'alerts' | 'learn' | 'assets' | 'handoff' | null
const isComm = (v: Side): v is CommSection => v === 'talk' || v === 'approval' || v === 'history'
// 右端にあったころの「comm」は、やり取りとして開く
const loadSide = (): Side => {
  const v = loadPref<Side | 'comm'>(SIDE_KEY, null)
  return v === 'comm' ? 'talk' : v
}
const SIDE_W = 56
// 覚えた幅が数でなければ(壊れた設定)、既定の幅に戻す
const clampPreview = (v: number) => (Number.isFinite(v) ? Math.min(1200, Math.max(360, v)) : DEFAULT_WIDTHS.mobile)
const clampList = (v: number) => (Number.isFinite(v) ? Math.min(640, Math.max(240, v)) : DEFAULT_WIDTHS.list)

// 狭い画面の割り振り(simple-ui-review-1 の 4。1,366〜1,440px のノート PC で、商品の一覧が開いたまま幅 0 に潰れていた)。
// 選んだ部品のペインの最低の幅と、プレビューの下限。境目の線(1px)は 3 本
const PART_MIN = 280
const PREVIEW_MIN = 360
const LINES = 3
/**
 * 列の幅が足りないとき、次の順で収める: ① 商品の一覧を細い帯にする(insist = 人が自動で畳んだのを開き直したときは、しない)
 * ② プレビューを下限まで縮める ③ 開いた左のパネルを、プレビューの上に重ねて出す(列の幅は 0 にし、その分をプレビューに戻す)。
 * 覚えている幅・開閉は変えない(幅が戻れば、元の割り振りに戻る)
 */
function fitPanes(total: number, w: { side: number; preview: number; list: number; listOpen: boolean; insist: boolean }) {
  const need = (side: number, preview: number, list: number) => SIDE_W + side + preview + PART_MIN + list + LINES
  if (!total) return { listOpen: w.listOpen, preview: w.preview, overlay: false, auto: false, fits: true }
  const fits = need(w.side, w.preview, w.listOpen ? w.list : RAIL_W) <= total
  const auto = w.listOpen && !w.insist && need(w.side, w.preview, w.list) > total
  const listOpen = w.listOpen && !auto
  const list = listOpen ? w.list : RAIL_W
  let preview = w.preview
  if (need(w.side, preview, list) > total) preview = Math.max(PREVIEW_MIN, total - (SIDE_W + w.side + PART_MIN + list + LINES))
  const overlay = w.side > 0 && need(w.side, preview, list) > total
  if (overlay) preview = Math.min(w.preview, Math.max(PREVIEW_MIN, total - (SIDE_W + PART_MIN + list + LINES)))
  return { listOpen, preview, overlay, auto, fits }
}

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  topField: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '6px',
    minWidth: 0,
    padding: '2px 8px',
    border: '1px solid transparent',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover, borderTopColor: tokens.colorNeutralStroke2, borderRightColor: tokens.colorNeutralStroke2, borderBottomColor: tokens.colorNeutralStroke2, borderLeftColor: tokens.colorNeutralStroke2 },
  },
  on: { backgroundColor: tokens.colorBrandBackground2, borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1 },
  name: { fontSize: tokens.fontSizeBase500, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '360px' },
  // 配信名だけは、狭いときに縮めて「…」にする(ほかの項目とボタンは、縮めない)
  nameField: { flexShrink: 1, minWidth: '80px' },
  grow: { flexGrow: 1 },
  state: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  saveFailed: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', whiteSpace: 'nowrap' },
  saveFailedText: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteRedForeground1, fontWeight: tokens.fontWeightSemibold },
  reasonPop: { display: 'grid', rowGap: '8px', width: '320px' },
  saved: { color: tokens.colorPaletteGreenForeground1 },
  notices: { display: 'grid', rowGap: '4px' },
  panes: {
    flexGrow: 1,
    minHeight: 0,
    display: 'grid',
    // 左のバー + 開くパネル | プレビュー | 選んだ部品 | 商品の一覧。開いたパネルは、つかんで決めた幅のまま(縮めると、幅を変えても広がらないため)。
    // 狭い画面では、選んだ部品のペインと商品の一覧が縮む
    gridTemplateColumns: `${SIDE_W}px var(--ws) 1px var(--wv) 1px minmax(280px, 1fr) 1px minmax(0, var(--wl))`,
    gridTemplateRows: 'minmax(0, 1fr)',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    // パネルを開く・しまう間だけ、列の幅を動かす(引き出しのように、左のバーへしまわれる)
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
  },
  pane: { minHeight: 0, overflow: 'auto', padding: '12px 14px', backgroundColor: tokens.colorNeutralBackground1 },
  // 上から 道具の行・(AB テストの知らせ)・受信箱の 1 行・プレビュー。行の数が変わってもプレビューが残りの高さを取るよう、縦の flex
  previewPane: { display: 'flex', flexDirection: 'column', rowGap: '6px', minHeight: 0, minWidth: 0, padding: '8px 12px 10px', backgroundColor: tokens.colorNeutralBackground2 },
  toolbar: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  // 受信箱の 1 行(差出人・件名・プリヘッダー)。プレビューに写らないものを押して直せるように
  // 受信箱・通知での見え方(SU5)。ラベルは並べない(行が長くうるさくなるため)。アプリの通知は 1 行(左に差出人を太字、右に「タイトル ― 本文」をうすく)
  inboxWrap: { display: 'grid', rowGap: '2px', minWidth: 0 },
  inboxHead: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  inbox: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, boxShadow: tokens.shadow2, minWidth: 0 },
  sender: { fontWeight: tokens.fontWeightBold, fontSize: tokens.fontSizeBase300, flexShrink: 0, width: '96px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  inboxDash: { color: tokens.colorNeutralForeground4, flexShrink: 0 },
  // 入れ忘れの印(押すと、その欄を開いて、すぐ書ける)
  inboxMissing: { color: tokens.colorPaletteDarkOrangeForeground1, fontWeight: tokens.fontWeightSemibold, textDecorationLine: 'underline', textDecorationStyle: 'dashed', textUnderlineOffset: '3px' },
  // アプリの通知の 1 行(スマホの通知の見た目)
  pushIcon: { width: '20px', height: '20px', borderRadius: '5px', display: 'grid', placeItems: 'center', flexShrink: 0, color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorBrandBackground, fontSize: '12px' },
  inboxPart: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 6px', borderRadius: tokens.borderRadiusSmall, border: '1px solid transparent', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase300, cursor: 'pointer', textAlign: 'left', color: tokens.colorNeutralForeground1, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  inboxSub: { color: tokens.colorNeutralForeground3, flexShrink: 1 },
  // メールの受信箱は、スマホのメールのアプリの 3 行(差出人 / 件名 / プリヘッダー。SU10)。1 行に並べると長いと両方切れるので、行を分けて折り返し、全部読めるようにする
  inboxMail: { display: 'grid', justifyItems: 'start', rowGap: '1px', padding: '6px 4px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, boxShadow: tokens.shadow2, minWidth: 0 },
  mailSender: { padding: '0 6px', fontWeight: tokens.fontWeightBold, fontSize: tokens.fontSizeBase300, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  mailLine: { maxWidth: '100%', whiteSpace: 'normal', overflowWrap: 'anywhere', overflow: 'visible' },
  mailPre: { fontSize: tokens.fontSizeBase200 },
  // プレビューの枠。ピン・印と同じく、重ねる層の基準にする(position: relative)。押したら Tab・Esc が効くよう、フォーカスを受け取る
  boxWrap: { position: 'relative', flexGrow: 1, minHeight: 0, display: 'grid' },
  // ピンを打つ状態のあいだの案内の帯(X73。マウスの形だけでは、何を待っているか分からないため)
  // 左上・右上のボタンに重ならないよう、ボタンの下に出す
  placingBar: { position: 'absolute', left: '50%', top: '44px', transform: 'translateX(-50%)', zIndex: 6, maxWidth: 'calc(100% - 28px)', boxShadow: tokens.shadow8 },
  tipSub: { display: 'block', marginTop: '2px', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  pinBox: { position: 'absolute', right: '14px', top: '6px', zIndex: 5, display: 'flex', padding: '2px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  viewBox: { position: 'absolute', left: '6px', top: '6px', zIndex: 5, display: 'flex', columnGap: '2px', padding: '2px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow4 },
  // 部品の外の地は、つかんで動かせる(手のひら)。部品は押して選ぶ(指)
  box: {
    position: 'relative',
    overflow: 'auto',
    minHeight: 0,
    paddingTop: '8px',
    paddingBottom: '48px',
    outline: 'none',
    cursor: 'grab',
    '& [data-part], & [data-item-key]': { cursor: 'pointer' },
  },
  boxPanning: { cursor: 'grabbing', userSelect: 'none', '& [data-part], & [data-item-key]': { cursor: 'grabbing' } },
  boxSpace: { cursor: 'grab', '& [data-part], & [data-item-key]': { cursor: 'grab' } },
  // 倍率の箱: 画像を見るソフトと同じく、プレビューの右下に重ねる
  zoomBox: {
    position: 'absolute',
    right: '14px',
    bottom: '10px',
    zIndex: 5,
    display: 'flex',
    alignItems: 'center',
    columnGap: '2px',
    padding: '2px',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow8,
  },
  zoomLabel: { minWidth: '44px', padding: '0 2px', border: 'none', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground1, cursor: 'pointer', textAlign: 'center', fontVariantNumeric: 'tabular-nums' },
  commPane: { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: 0, backgroundColor: tokens.colorNeutralBackground1 },
  railDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, border: 'none', padding: 0, cursor: 'pointer' },
  listHead: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '-6px' },
  colTitle: { ...typo.heading, marginBottom: '10px' },
  panesMoving: { transitionProperty: 'grid-template-columns', transitionDuration: '200ms', transitionTimingFunction: 'ease-out', '@media (prefers-reduced-motion: reduce)': { transitionDuration: '0ms' } },
  // 左のバーと、開くパネル
  sideOverlay: { position: 'relative', zIndex: 3, boxShadow: tokens.shadow16, borderRight: `1px solid ${tokens.colorNeutralStroke2}` },
  sidePane: { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: 0, minWidth: 0, overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground1 },
  sideHead: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '6px 6px 6px 12px', ...typo.heading, borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, whiteSpace: 'nowrap', overflow: 'hidden' },
  sideBody: { display: 'grid', minHeight: 0, minWidth: 0, overflow: 'hidden' },
  sideRail: { display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: '4px', paddingTop: '8px', borderRight: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2, overflowY: 'auto' },
  sideGap: { width: '32px', height: '1px', margin: '4px 0', backgroundColor: tokens.colorNeutralStroke2, flexShrink: 0 },
  sideBtn: { display: 'grid', justifyItems: 'center', rowGap: '2px', width: '48px', padding: '6px 0', border: 'none', borderRadius: tokens.borderRadiusMedium, backgroundColor: 'transparent', fontFamily: 'inherit', color: tokens.colorNeutralForeground2, cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover, color: tokens.colorNeutralForeground1 } },
  sideOn: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  sideIcon: { position: 'relative', fontSize: '20px', lineHeight: 1 },
  sideBadge: { position: 'absolute', top: '-7px', right: '-13px' },
  sideDot: { position: 'absolute', top: '-3px', left: '-6px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tokens.colorPaletteRedBackground3 },
  sideLabel: { fontSize: '10px', lineHeight: 1.2 },
  // 画像・URL を落とせる所(ドラッグ中)
  sideDrop: { outline: `2px dashed ${tokens.colorBrandStroke1}`, outlineOffset: '-2px', backgroundColor: tokens.colorBrandBackground2 },
  dropNote: { fontSize: '16px' },
  candHead: { marginTop: '16px', paddingBottom: '4px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  // 候補の行と、マウスを乗せたときの「⇄ 入れる」(SU9)
  // 「入れる」は、マウスを乗せたとき・フォーカスがあるときだけ見せる(一覧をうるさくしない)
  candList: { display: 'grid', rowGap: '6px', marginTop: '6px' },
  candWrap: { '& [data-row-action]': { visibility: 'hidden' }, ':hover [data-row-action]': { visibility: 'visible' }, ':focus-within [data-row-action]': { visibility: 'visible' } },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  // 案のタブ(SU2)
  // 上の帯の AB テストの案(SU8)。面のタブのあとに、線で区切って並べる
  abBar: { display: 'flex', alignItems: 'center', columnGap: '4px', minWidth: 0, flexShrink: 0, paddingLeft: '10px', marginLeft: '2px', borderLeft: `1px solid ${tokens.colorNeutralStroke2}` },
  abWarn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
  abDiff: { boxShadow: `inset 0 -2px 0 ${tokens.colorPaletteDarkOrangeBorder2}` },
})

interface Props {
  editor: SimpleEditor
  /** 開いたとき・前に反映したときから、内容が変わったか(承認の前の確かめ。ref を読むので、まとまりとは別に渡す) */
  isDirty: () => boolean
  /** プレビューの枠(CardDetail の倍率の計算が測る箱) */
  boxRef: RefObject<HTMLDivElement | null>
  /** 別の部品を選んだときの反映(変わっていなければ何もしない。確定した週の配信は反映しない) */
  onCommit: () => Promise<void>
  /** 反映のボタン(確定した週の配信は、理由の入力欄を出す) */
  onApply: () => void
  onUndo: () => void
  onRunNext: (step: NextStep) => void
  onClose: () => void
}

/** 保存した時刻(上の帯の「保存済み · 12:03」。今日でなければ日付も) */
const savedTime = (iso: string) => {
  const d = new Date(iso)
  const today = new Date().toDateString() === d.toDateString()
  return d.toLocaleString(locale(), today ? { hour: '2-digit', minute: '2-digit' } : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/**
 * シンプルな配信カード(SU1。docs/SIMPLE_CARD.md)。プレビューが主役で、部品を押すと、その部品だけを直すペインが出る。
 * 状態と保存は CardDetail のもの(editor)をそのまま使う。ここは並べ方と、部品の選び方・反映の時機だけを持つ
 */
export function SimpleCardLayout({ editor: e, boxRef, isDirty, onCommit, onApply, onUndo, onRunNext, onClose }: Props) {
  const t = useT()
  const s = useStyles()
  // 商品の引き当ては、1 つの表で(打つたびの描き直しで、一覧を何度も端から探さないように)
  const productById = useMemo(() => new Map(e.products.map((p) => [p.id, p])), [e.products])
  const [part, setPart] = useState<PartRef | null>(null)
  // 商品の一覧で押した商品(選んでいる枠と見比べる)
  const [compareKey, setCompareKey] = useState<string | null>(null)
  // 部品ごとの AI とのやり取り(開いている間だけ)
  const [chats, setChats] = useState<Record<string, PartTurn[]>>({})
  const setChat = (key: string, f: (prev: PartTurn[]) => PartTurn[]) => setChats((c) => ({ ...c, [key]: f(c[key] ?? []) }))
  const { widths, setWidths, onDone: saveWidths } = useStoredWidths<Widths>(WIDTH_KEY, (saved) => {
    const v = saved as Partial<Widths> | null
    return { mobile: clampPreview(Number(v?.mobile ?? DEFAULT_WIDTHS.mobile)), pc: clampPreview(Number(v?.pc ?? DEFAULT_WIDTHS.pc)), list: clampList(Number(v?.list ?? DEFAULT_WIDTHS.list)), comm: clampList(Number(v?.comm ?? DEFAULT_WIDTHS.comm)), hand: clampList(Number(v?.hand ?? DEFAULT_WIDTHS.hand)) }
  })
  // アプリの配信は、スマホの幅
  const widthKey: 'mobile' | 'pc' = e.channel === 'email' && e.device === 'pc' ? 'pc' : 'mobile'
  const nav = usePreviewNav(boxRef, e.zoom)
  // 「A と違う」の目印(B・C 案を直しているとき)
  const diffMarks: Mark[] = e.abDiffParts.map((part) => ({ part, color: tokens.colorPaletteDarkOrangeBackground3, label: t('A と違う', 'Differs from A') }))
  const [productsOpen, setProductsOpen] = useState(() => loadPref<boolean>(PRODUCTS_KEY, true))
  // 自動で畳んだ商品の一覧を、人が開き直した(幅が足りるようになるまで、自動では畳まない)
  const [insist, setInsist] = useState(false)
  const [abSettingsOpen, setAbSettingsOpen] = useState(false)
  // 商品の入れ替えの引き出しを開いている所(SU9)。入口(プレビューの ⇄・右クリック・選んだ部品のペイン・真ん中の行・右の行・商品のフロート)は違っても、引き出しは 1 つ
  const [swapAt, setSwapAt] = useState<SwapAt | null>(null)

  /** 部品を選ぶ。別の部品に移るときに、それまでの変更を反映(保存)する(SU1 ⑫) */
  const select = (p: PartRef | null) => {
    if (samePart(p, part)) return
    void onCommit()
    setPart(p)
    setCompareKey(null)
    // 部品を移ったら、開いていた入れ替えの引き出しは閉じる(戻ったときに勝手に開いていないように)
    setSwapAt(null)
  }
  // 部品を選ぶ層には、変わらない関数を渡す(押すたびに、いまの値で select を呼ぶ)
  const selectRef = useRef(select)
  useEffect(() => {
    selectRef.current = select
  })
  const onPick = useCallback((p: PartRef | null) => selectRef.current(p), [])
  /** その商品を選び、選んだ部品のペインの箱の真下の引き出しを開く(プレビューの ⇄・右クリック・商品のフロートから) */
  const openSwap = (itemKey: string) => {
    select({ kind: 'product', itemKey })
    setSwapAt({ itemKey, at: 'pane' })
  }
  const openSwapRef = useRef(openSwap)
  useEffect(() => {
    openSwapRef.current = openSwap
  })
  const onSwapBadge = useCallback((itemKey: string) => openSwapRef.current(itemKey), [])
  /** 入れ替えたあと。候補と入れ替えると行の鍵が変わるので、その商品を選んだままにする(select を通すと、入れ替える前の中身で保存してしまう) */
  const swapped = (from: string, to: string) => {
    setSwapAt(null)
    if (from !== to && part?.kind === 'product' && part.itemKey === from) setPart({ kind: 'product', itemKey: to })
  }

  const resizePreview = (dx: number) => setWidths((w) => ({ ...w, [widthKey]: clampPreview(w[widthKey] + dx) }))
  const resizeList = (dx: number) => setWidths((w) => ({ ...w, list: clampList(w.list - dx) }))
  const [side, setSide] = useState<Side>(loadSide)
  /** サイドパネルを開く(open: 必ず開く。省略は、開いている方を押したら閉じる) */
  const showSide = (v: Exclude<Side, null>, open = false) => {
    const next = !open && side === v ? null : v
    setSide(next)
    savePref(SIDE_KEY, next)
    if (isComm(next)) setCommSection(next)
    if (next) setLastSide(next)
    if (next !== side) {
      setMoving(true)
      window.setTimeout(() => setMoving(false), 260)
    }
  }
  // 送る前の確かめ(承認を依頼する・制作に渡す の前の一覧。中身は readiness.ts。2026-10-25 利用者と決めた)
  const checkInput = {
    channel: e.channel,
    subject: e.form.subject,
    name: e.form.name,
    preheader: e.form.preheader,
    pushTitle: e.form.pushTitle,
    pushBody: e.form.pushBody,
    headline: e.form.headline,
    copy: e.form.copy,
    hasHero: !!e.hero,
    items: e.items,
    slots: slotsOf(e.template),
    alerts: e.alerts,
    status: e.form.status,
    productionOwner: e.form.productionOwner,
    productionDue: e.form.productionDue,
  }
  const approvalChecks = readinessOf({ ...checkInput, purpose: 'approval' })
  const handoffChecks = readinessOf({ ...checkInput, purpose: 'handoff' })
  // 行を押したら、その部品を選ぶ。アラート・承認はそのパネル、担当・締め切りは渡すもの(欄へは HandoffSheet が動く)
  const pickCheck = (target: ReadinessTarget) => {
    if (target.kind === 'panel') showSide(target.panel, true)
    else if (target.kind === 'handoffField') showSide('handoff', true)
    else select(target)
  }
  // しまっている間も、最後に開いたパネルの中身を描いておく(しまう動きの間に、中身が先に消えないように)
  const [lastSide, setLastSide] = useState<Exclude<Side, null>>(() => loadSide() ?? 'talk')
  const panel = side ?? lastSide
  const [moving, setMoving] = useState(false)
  // パネルは左にあるので、境目を右へ動かすと広がる
  const resizeSide = (dx: number) => setWidths((w) => (isComm(side) ? { ...w, comm: clampList(w.comm + dx) } : { ...w, hand: clampList(w.hand + dx) }))
  // 列の並びの幅を見て、狭いときの割り振りを決める(fitPanes)
  const panesRef = useRef<HTMLDivElement>(null)
  const [panesW, setPanesW] = useState(0)
  useLayoutEffect(() => {
    const el = panesRef.current
    if (!el) return
    const measure = () => setPanesW(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const sideW = isComm(side) ? widths.comm : side ? widths.hand : 0
  const fit = fitPanes(panesW, { side: sideW, preview: widths[widthKey], list: widths.list, listOpen: productsOpen, insist })
  // 幅が足りるようになったら、「開き直した」は忘れる(次に狭くなったら、また自動で畳む)。描くときに直す(effect で直すと、1 回余計に描くため)
  if (insist && fitPanes(panesW, { side: sideW, preview: widths[widthKey], list: widths.list, listOpen: true, insist: false }).fits) setInsist(false)
  // やり取りの部品は、閉じていても描いておき、バーの数と点を合わせる。最後に開いた見方を覚える(書きかけの文を、見方の間で共にするため 1 つの部品)
  const [commSection, setCommSection] = useState<CommSection>(() => {
    const v = loadSide()
    return isComm(v) ? v : 'talk'
  })
  const [counts, setCounts] = useState<CommCounts>({ open: 0, tasks: 0, mine: false, myTurn: false, waiting: false, changesRequested: false, reviewers: 0, approved: 0, changes: 0 })
  // 開け閉めは人に任せる(自動では開かない。自分宛てがあれば、バーのアイコンの赤い点で知らせる。2026-10-23 利用者)
  const onCounts = useCallback((c: CommCounts) => setCounts(c), [])
  // 右上の青いボタンは、自分がやることがあるときだけ(SU11)。作った人 = 担当。担当が空か、自分の名前を決めていないときは、作った人とみなす(だれも出せなくならないように)
  const meName = useSyncExternalStore(onMeChange, myName)
  const author = !e.form.owner || !meName || e.form.owner === meName
  const myStep = myNextStep(e.nextStep, { author, myTurn: counts.myTurn, changesRequested: counts.changesRequested })
  // 左のバーの「渡すもの」に、画像・資料・URL を落として、参考の素材に入れる(列を開かずに書き留めるため)
  const [assetsVersion, setAssetsVersion] = useState(0)
  const [dropOver, setDropOver] = useState<'assets' | 'handoff' | null>(null)
  const [dropNote, setDropNote] = useState<{ ok: boolean; text: string } | null>(null)
  const dropAssets = async (dt: DataTransfer) => {
    setDropOver(null)
    try {
      const r = await addDroppedAssets(e.card.id, myName() || e.form.owner || '', dt)
      setDropNote(r.error ? { ok: false, text: r.error } : { ok: true, text: t(`${r.added} 件を参考の素材に入れました`, `Added ${r.added} to reference assets`) })
      if (r.added > 0) setAssetsVersion((v) => v + 1)
    } catch (err) {
      setDropNote({ ok: false, text: err instanceof Error ? err.message : String(err) })
    }
    window.setTimeout(() => setDropNote(null), 4000)
  }
  // 帯に出す、参考の素材の数(帯の数を合わせるため、開いていなくても数える)
  const [assetCount, setAssetCount] = useState(0)
  useEffect(() => {
    let alive = true
    void CardAssetsService.getAll({ filter: `delivery_card_id eq ${e.card.id}` }).then((r) => {
      if (alive && r.success) setAssetCount((r.data ?? []).length)
    })
    return () => {
      alive = false
    }
  }, [e.card.id, side, assetsVersion])
  // 渡す前に、制作の担当か締め切りが空いている(帯の「渡すもの」に点を付ける。渡す準備ができていないことに気づけるように)
  const handoffMissing = !e.form.handedOffAt && (!e.form.productionOwner.trim() || !e.form.productionDue)
  // プレビューの場所を押してコメントを書く(PreviewPins の覆い)。打ったピン・押したピンは、その横のフロート(PinFloat)で書く・読む・返す。
  // 右の帯のやり取りは開かない(2026-10-23 利用者: ほとんどのコメントはピン経由なので、ピンだけで進められるように)
  const { placing, setPlacing, endPlacing, target: pinTarget, setTarget: setPinTarget, openThreads, close: closePin } = usePreviewPins()
  // 右クリックの「画像を入れ替える」(メイン画像のペインの「入れ替える」を開く)
  const [heroReplace, setHeroReplace] = useState(0)
  /**
   * プレビューの右クリックの項目(「ここにピンを打つ」のあと)。押した所の部品について、部品のペイン・商品のフロートのボタンと同じ処理を呼ぶ。
   * 反映中は、中身を変える項目を押せなくする(ボタンと同じ)
   */
  const previewMenu = (under: Element): ContextItem[] => {
    const root = boxRef.current
    const p = root ? partFromElement(under, root) : null
    if (!p) return []
    const it = p.kind === 'product' ? e.items.find((i) => i.key === p.itemKey) : undefined
    return previewMenuItems({
      // ボタンと同じく、反映中だけ押せなくする
      busy: e.saving,
      edit: () => select(p),
      ai:
        p.kind !== 'slot'
          ? () => {
              select(p)
              focusSoon('[data-part-ai-input]')
            }
          : undefined,
      product:
        p.kind === 'product'
          ? {
              swapLabel: t('入れ替える', 'Replace'),
              url: productUrl(productById.get(it?.productId ?? '')),
              swap: () => openSwap(p.itemKey),
              // 部品のペインの「外す(候補に戻す)」と同じ
              remove: () => {
                e.removeItem(p.itemKey)
                if (part && samePart(part, p)) select(null)
              },
            }
          : undefined,
      hero:
        p.kind === 'hero'
          ? {
              src: heroImage(e.hero),
              replace: () => {
                select(p)
                setHeroReplace((n) => n + 1)
              },
            }
          : undefined,
    })
  }
  const stepZoom = e.zoom.step
  const toggleProducts = () => {
    // 自動で畳んでいるときは、覚えている開閉(開く)はそのままで、開き直す
    if (fit.auto) {
      setInsist(true)
      return
    }
    setInsist(false)
    setProductsOpen(!productsOpen)
    savePref(PRODUCTS_KEY, !productsOpen)
  }

  /**
   * 押した商品を、選んでいる枠に置く。選んでいるのは「枠」なので、置いたあとも同じ枠(いまはその商品)を選んだままにする。
   * 反映は、次に別の部品を選んだとき(ここで select を通すと、置く前の中身で保存してしまうため)
   */
  const placed = (target: PartRef, key: string) => {
    placeInPart(e, target, key)
    if (target.kind === 'product') setPart({ kind: 'product', itemKey: key })
    setCompareKey(null)
  }

  /** 商品の一覧の行を押したとき: 枠を選んでいれば見比べ、そうでなければ今と同じ商品のフロート */
  const openFromList = (key: string) => {
    const target = part && (part.kind === 'product' || part.kind === 'slot') && !(part.kind === 'product' && part.itemKey === key) ? part : null
    if (!target) {
      // 載せている商品なら、フロートの「入れ替える」で同じ引き出しを開く(SU9 (h))
      e.openProduct(key, undefined, e.items.some((i) => i.key === key) ? () => openSwap(key) : undefined)
      return
    }
    setCompareKey(key)
    e.openProduct(key, {
      label: target.kind === 'product' ? t('この枠の商品と入れ替える', 'Replace with the product in this slot') : t('この枠に入れる', 'Put in this slot'),
      run: () => placed(target, key),
    })
  }

  const isOn = (p: PartRef) => samePart(p, part)
  const field = (p: PartRef, children: React.ReactNode, title?: string, className?: string) => (
    <button type="button" className={mergeClasses(s.topField, isOn(p) && s.on, className)} onClick={() => select(p)} title={title}>
      {children}
    </button>
  )
  const tpl = getTemplate(e.template)
  const when = e.form.scheduledAt ? new Date(e.form.scheduledAt).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : t('配信日時(未設定)', 'No send date')

  const sideTitle = (v: Exclude<Side, null>) =>
    ({ alerts: t('この配信のアラート', 'Alerts for this delivery'), learn: t('これまでの学び', 'Learnings so far'), talk: t('やり取り(承認者と)', 'Conversation'), approval: t('承認の様子', 'Approval'), history: t('変更の履歴', 'Change history'), assets: t('素材', 'Assets'), handoff: t('渡すもの(制作へ)', 'Handoff (to production)') })[v]
  /** 左のバーの並び(アイコンの下に名前。数は数の丸、気づいてほしいことは点。drop: 画像・URL を落として素材に入れられる。gap: この上に線) */
  const rails: { v: Exclude<Side, null>; icon: React.ReactElement; label: string; tip: string; count: number; color?: 'danger' | 'informative'; dot?: 'red' | 'amber'; drop?: boolean; gap?: boolean }[] = [
    // アラート = 直さないといけないもの(赤い数の丸。0 件なら出さない)、学び = 参考にするもの(灰色の数の丸)。性質が違うので、別のアイコンにする(SU6)
    { v: 'alerts', icon: <WarningRegular />, label: t('アラート', 'Alerts'), tip: t('アラート(在庫切れ・在庫が少ない・方針・日程など、直さないといけないもの)', 'Alerts (out of stock, low stock, policy, dates: things to fix)'), count: e.alerts.length, color: 'danger' },
    { v: 'learn', icon: <LightbulbRegular />, label: t('学び', 'Learnings'), tip: t('これまでの学び(過去の配信の「次に生かすメモ」。参考にするもの。AI の下書きにも渡す)', 'Learnings (notes from past deliveries, for reference; also passed to AI drafts)'), count: e.learnCount, color: 'informative' },
    { v: 'talk', gap: true, icon: <CommentRegular />, label: t('やり取り', 'Conversation'), tip: t('やり取り(承認者と。書き込み・タスク)', 'Conversation (with approvers: comments and tasks)'), count: counts.open + counts.tasks, dot: counts.mine ? 'red' : undefined },
    {
      v: 'approval',
      icon: <PersonAvailableRegular />,
      label: t('承認', 'Approval'),
      tip: counts.myTurn ? t('承認の様子。あなたが承認する番です', 'Approval. It is your turn to review') : t('承認の様子(依頼・取り下げ・相手ごとの状態)', 'Approval (request, withdraw, reviewers)'),
      count: 0,
      dot: counts.myTurn ? 'red' : counts.waiting ? 'amber' : undefined,
    },
    { v: 'assets', icon: <ImageMultipleRegular />, label: t('素材', 'Assets'), tip: t('素材(承認のときのイメージにも、制作の参考にも。画像・資料・URL を落としても足せる)', 'Assets (images, files and URLs for approvers and production; drop to add)'), count: assetCount, drop: true },
    {
      v: 'handoff',
      icon: <BoxMultipleArrowRightRegular />,
      label: t('渡すもの', 'Handoff'),
      tip: handoffMissing ? t('渡すもの(制作へ)。制作の担当か締め切りが、まだ空いています', 'Handoff (to production). Assignee or due date is still empty') : t('渡すもの(制作へ。文章・参考の画像と URL・担当と締め切り)', 'Handoff (to production: notes, reference images and URLs, assignee and due date)'),
      count: 0,
      dot: handoffMissing ? 'amber' : undefined,
      drop: true,
    },
    { v: 'history', icon: <HistoryRegular />, label: t('履歴', 'History'), tip: t('変更の履歴(入れ替えの理由・ステータスの変化)', 'Change history (replacement reasons, status changes)'), count: 0, gap: true },
  ]

  /**
   * AB テストの案(SU8。2026-10-24 利用者と決めた)。AB に分けるのは配信の大前提で、プレビュー(1 つの案)の話ではないので、上の帯に置く。
   * 案が 1 つのときは「＋ AB テストの案を足す」だけ、2 つ以上のときは「案 A | 案 B」のタブ(押すと、プレビューと中身がその案になる)。
   * アイコンに頼らず文字で書き、何をするものかは ⓘ(InfoLabel)に
   */
  const addVariantMenu = (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} disabled={e.saving || e.ab?.busy}>
          {e.ab ? t('案を足す', 'Add a variant') : t('AB テストの案を足す', 'Add an A/B test variant')}
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {(e.ab?.keys ?? ['A']).map((k) => (
            <MenuItem key={k} onClick={() => (void onCommit(), e.abAdd(k))}>
              {t(`案 ${k} を写して直す`, `Copy variant ${k} and edit`)}
            </MenuItem>
          ))}
          <MenuItem icon={<AiIcon size={16} />} onClick={() => (void onCommit(), e.abAdd('ai'))}>
            {t('AI で別の案を作る', 'Let AI make another variant')}
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  )
  const abBar = (
    <div className={s.abBar}>
      <InfoLabel
        size="small"
        info={t('同じ配信を、見出しや画像を変えて複数作り、どれがよいかを比べます。タブを押すと、プレビューと中身がその案に切り替わります', 'Make several versions of the same delivery with different headlines or images, and compare which works better. Pick a tab to switch the preview and content to that variant.')}
      >
        {e.ab ? t('AB テスト', 'A/B test') : ''}
      </InfoLabel>
      {e.ab && (
        <TabList size="small" selectedValue={e.ab.active} onTabSelect={(_, d) => d.value !== e.ab?.active && (void onCommit(), e.abSwitch(d.value as typeof e.ab.active))}>
          {e.ab.keys.map((k) => (
            <Tab key={k} value={k}>
              {t(`案 ${k}`, `Variant ${k}`)}
            </Tab>
          ))}
        </TabList>
      )}
      {(!e.ab || e.ab.canAdd) && addVariantMenu}
      {e.ab && (
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button type="button" size="small" appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('AB テストの操作', 'A/B test actions')} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem icon={<ColumnTripleRegular />} onClick={e.abCompare}>
                {t('案を並べて比べる', 'Compare variants side by side')}
              </MenuItem>
              <MenuItem icon={<SettingsRegular />} onClick={() => setAbSettingsOpen(true)}>
                {t('テストの設定', 'Test settings')}
              </MenuItem>
              {e.ab.active !== 'A' && (
                <MenuItem icon={<DeleteRegular />} onClick={async () => {
                  if (e.ab && (await confirmDialog(t(`案 ${e.ab.active} を消します(保存で確定)。よろしいですか?`, `Remove variant ${e.ab.active}? (on save)`)))) e.abRemove(e.ab.active)
                }}>
                  {t(`案 ${e.ab.active} を消す`, `Remove variant ${e.ab.active}`)}
                </MenuItem>
              )}
            </MenuList>
          </MenuPopover>
        </Menu>
      )}
      {/* テストの設定(⋯ から開く。中身は CardDetail の AbSettings) */}
      <Popover open={abSettingsOpen} onOpenChange={(_, d) => setAbSettingsOpen(d.open)} positioning="below-end" withArrow>
        <PopoverTrigger disableButtonEnhancement>
          <span />
        </PopoverTrigger>
        <PopoverSurface>{e.abSettings}</PopoverSurface>
      </Popover>
      {e.ab?.busy && <Spinner size="extra-tiny" label={t('AI が案を作っています', 'AI is drafting')} labelPosition="after" />}
    </div>
  )

  // 受信箱の行に出す文言(AI の案を写している間は、その案。保存する中身は変えない)
  const shown = { ...e.form, ...(e.previewTexts ?? {}) }
  return (
    <div className={s.root}>
      <StageHeader
        title={
          <>
            <ChannelBadge channel={e.form.channel} />
            {field({ kind: 'meta', field: 'name' }, <span className={s.name}>{e.form.name || t('(配信名未入力)', '(No name)')}</span>, t('配信名を直す', 'Edit the name'), s.nameField)}
            {field({ kind: 'meta', field: 'scheduledAt' }, <span>{when}</span>, t('配信日時を直す', 'Edit the send date'))}
            {/* 承認の状態の札(SU11)。押すと左のバーの承認のパネル */}
            <ApprovalBadge status={e.form.status} waiting={counts.waiting} changesRequested={counts.changesRequested} reviewers={counts.reviewers} approved={counts.approved} onOpen={() => showSide('approval', true)} />
          </>
        }
        actions={
          <>
            {/* 保存の様子をいつも出す: 保存中… / 未保存 / 保存済み · 12:03(入力が止まって約 1.5 秒で自動で保存する) */}
            {e.saving ? (
              <Spinner size="extra-tiny" label={t('保存中…', 'Saving…')} labelPosition="after" />
            ) : e.saveConflict ? (
              // ほかの人が先に保存していた: 黙って上書きせず、どうするかを聞く
              <span className={s.saveFailed}>
                <Tooltip
                  content={t(
                    `ほかの人が、この配信を先に保存しました${e.saveConflict.at ? `(${e.saveConflict.at})` : ''}。上書きすると、その変更は消えます。閉じて読み直すと、ほかの人の中身を開けます(こちらの変更は消えます)`,
                    `Someone else saved this delivery first${e.saveConflict.at ? ` (${e.saveConflict.at})` : ''}. Overwriting discards their changes; closing and reloading discards yours.`,
                  )}
                  relationship="description"
                >
                  <span className={s.saveFailedText}>{t('ほかの人が先に保存しました', 'Someone else saved first')}</span>
                </Tooltip>
                <Button type="button" size="small" appearance="subtle" onClick={e.saveConflict.overwrite}>
                  {t('上書きする', 'Overwrite')}
                </Button>
                <Button type="button" size="small" appearance="subtle" onClick={e.saveConflict.reload}>
                  {t('閉じて読み直す', 'Close and reload')}
                </Button>
              </span>
            ) : e.saveError ? (
              // 保存の失敗は、作業している所から見える上の帯に(以前はペインのいちばん下で、画面の外になっていた)
              <span className={s.saveFailed}>
                <Tooltip content={e.saveError} relationship="description">
                  <span className={s.saveFailedText}>{t('保存できませんでした', 'Could not save')}</span>
                </Tooltip>
                <Button type="button" size="small" appearance="subtle" icon={<ArrowClockwiseRegular />} onClick={e.retrySave}>
                  {t('再試行', 'Retry')}
                </Button>
              </span>
            ) : e.dirty ? (
              <span className={s.state}>{t('未保存', 'Unsaved')}</span>
            ) : e.savedAt ? (
              <span className={mergeClasses(s.state, e.justSaved && s.saved)}>
                {t(`保存済み · ${savedTime(e.savedAt)}`, `Saved · ${savedTime(e.savedAt)}`)}
              </span>
            ) : null}
            <Tooltip content={t('元に戻す: 前に保存した中身に戻します(開いている間の履歴)', 'Undo: go back to the content before the last save (history while open)')} relationship="description">
              <Button type="button" size="small" appearance="subtle" icon={<ArrowUndoRegular />} disabled={!e.canUndo || e.saving} onClick={onUndo} aria-label={t('元に戻す', 'Undo')} />
            </Tooltip>
            {/* 保存のボタンは、確定した週の配信だけ(ほかは自動で保存する。理由を入れてから保存する) */}
            {/* 理由の入力は、このボタンの真下に出す(操作を止める確かめなので、小さな Popover。外を押すと、やめる) */}
            {e.locked && (e.dirty || e.reasonOpen) && (
              <Popover open={e.reasonOpen} onOpenChange={(_, d) => !d.open && e.cancelReason()} positioning="below-end" withArrow trapFocus>
                <PopoverTrigger disableButtonEnhancement>
                  <Tooltip content={t('確定した週の配信です。変えた理由を入力してから保存します', 'Confirmed week: enter a reason to save')} relationship="description">
                    <Button type="button" size="small" icon={<SaveRegular />} disabled={e.saving} onClick={onApply}>
                      {t('理由を入力して保存', 'Save with a reason')}
                    </Button>
                  </Tooltip>
                </PopoverTrigger>
                <PopoverSurface className={s.reasonPop}>{e.reasonForm}</PopoverSurface>
              </Popover>
            )}
            {myStep && (
              <NextAction
                step={myStep}
                issues={myStep === 'requestApproval' ? readinessIssues(approvalChecks) : myStep === 'requestProduction' ? readinessIssues(handoffChecks) : 0}
                busy={e.saving}
                // 承認は左のバーの「承認」、制作への依頼は「渡すもの」で行う。制作のページは、CardDetail の側
                onRun={(step) => (step === 'requestProduction' ? showSide('handoff', true) : step === 'requestApproval' || step === 'review' ? showSide('approval', true) : onRunNext(step))}
              />
            )}
            {e.viewSwitch}
            {e.menu}
            <Button type="button" appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
          </>
        }
        // 面のタブ(PLAN | PRODUCTION | RESULTS)。配信が主役で、面はその見方なので、題名の下に
        tabs={e.stageNav}
        // AB テストの案(SU8)。1 段目に置くと配信名が縮むので、同じ帯の 2 段目、面のタブの右に
        tabsExtra={abBar}
      />
      <div className={s.notices}>
        {e.notices}
      </div>

      <div ref={panesRef} className={mergeClasses(s.panes, moving && s.panesMoving)} style={{ '--wv': `${fit.preview}px`, '--wl': `${fit.listOpen ? widths.list : RAIL_W}px`, '--ws': `${fit.overlay ? 0 : sideW}px` } as React.CSSProperties}>
        {/* 左のバー。上から、プロセスの順(承認者とのやり取り → 承認 → 素材 → 制作へ渡すもの)、線の下に記録。数と点で、開かなくても様子が分かる */}
        <nav className={s.sideRail} aria-label={t('配信の全体の情報とメニュー', 'Delivery info and menus')}>
          {rails.map((r) => (
            <span key={r.v} style={{ display: 'contents' }}>
              {r.gap && <span className={s.sideGap} />}
              <Tooltip content={r.tip} relationship="description" positioning="after">
                <button
                  type="button"
                  className={mergeClasses(s.sideBtn, side === r.v && s.sideOn, r.drop && dropOver === r.v && s.sideDrop)}
                  aria-pressed={side === r.v}
                  onClick={() => showSide(r.v)}
                  onDragOver={(ev) => {
                    if (!r.drop || !canDropAsset(ev.dataTransfer)) return
                    ev.preventDefault()
                    setDropOver(r.v === 'assets' ? 'assets' : 'handoff')
                  }}
                  onDragLeave={() => r.drop && setDropOver(null)}
                  onDrop={(ev) => {
                    if (!r.drop) return
                    ev.preventDefault()
                    void dropAssets(ev.dataTransfer)
                  }}
                >
                  <span className={s.sideIcon}>
                    {r.icon}
                    {r.count > 0 && <CounterBadge className={s.sideBadge} count={r.count} size="small" color={r.color ?? 'brand'} />}
                    {r.dot && <span className={s.sideDot} style={r.dot === 'amber' ? { backgroundColor: tokens.colorPaletteMarigoldBackground3 } : undefined} />}
                  </span>
                  <span className={s.sideLabel}>{r.label}</span>
                </button>
              </Tooltip>
            </span>
          ))}
          {/* 落としたものを入れた・入れられなかったを、バーの下に短く知らせる */}
          {dropNote && (
            <Tooltip content={dropNote.text} relationship="label" positioning="after" visible>
              <span className={s.dropNote} style={{ color: dropNote.ok ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>
                {dropNote.ok ? <CheckmarkRegular /> : <ErrorCircleRegular />}
              </span>
            </Tooltip>
          )}
        </nav>

        {/* 開いているパネル(1 つ)。しまったときも列には残し、幅 0 にする(display: none にすると、グリッドの列から外れ、プレビュー以下が 1 列ずつ左の細い列にずれる。2026-10-24 本番で起きた)。
            しまっている間は inert で、Tab で中に入らないようにする。やり取りの部品は、バーの数を合わせるため、いつも描く */}
        {/* 狭くて収まらないときは、列の幅を 0 にしたまま、パネルをプレビューの上に重ねて出す(fitPanes の ③) */}
        <div className={mergeClasses(s.sidePane, fit.overlay && s.sideOverlay)} style={fit.overlay ? { width: sideW } : undefined} inert={!side} aria-hidden={!side}>
          <div className={s.sideHead}>
            <span style={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{sideTitle(panel)}</span>
            {/* × で閉じるのではなく、左のバーへしまう(2026-10-24 利用者) */}
            <Tooltip content={t('パネルをしまう(バーのアイコンをもう一度押しても、しまえます)', 'Collapse the panel (or click its icon in the bar again)')} relationship="label">
              <Button type="button" size="small" appearance="subtle" icon={<ChevronDoubleLeftRegular />} onClick={() => side && showSide(side)} />
            </Tooltip>
          </div>
          <div className={s.sideBody}>
            <div style={isComm(panel) ? { display: 'grid', minHeight: 0 } : { display: 'none' }}>
              <CommPane
                section={commSection}
                card={e.card}
                part={part}
                onPick={select}
                items={e.items}
                productName={(id) => productById.get(id)?.name ?? ''}
                products={e.products}
                view={pinView(e.channel, e.device, e.ab?.active ?? 'A')}
                handoff={{ productionOwner: e.form.productionOwner, handedOffAt: e.form.handedOffAt, productionDue: e.form.productionDue }}
                people={e.people}
                onCommit={onCommit}
                isDirty={isDirty}
                busy={e.saving}
                onChanged={e.reload}
                canReview={e.canReview}
                onOpenProduction={e.openProduction}
                onCounts={onCounts}
                // 承認の前だけ(承認が済んだら、確かめは渡すものの側で)
                checks={statusRank(e.form.status) < statusRank('approved') ? <ReadinessList items={approvalChecks} onPick={pickCheck} /> : undefined}
              />
            </div>
            {panel === 'alerts' && (
              <div style={{ minHeight: 0, overflowY: 'auto' }}>
                <CardAlertsBar
                  panel
                  alerts={e.alerts}
                  onAct={e.actAlert}
                  selectedProductId={part?.kind === 'product' ? e.items.find((i) => i.key === part.itemKey)?.productId : undefined}
                  // 押すと、プレビューのその商品を選ぶ(SU6 ③)
                  onSelectProduct={(pid) => {
                    const it = e.items.find((i) => i.productId === pid)
                    if (it) select({ kind: 'product', itemKey: it.key })
                  }}
                />
              </div>
            )}
            {/* 学びは、閉じていても描く(AI の依頼に学びを渡すのは、この部品の役目のため) */}
            <div style={panel === 'learn' ? { minHeight: 0, overflowY: 'auto' } : { display: 'none' }}>{e.learnings}</div>
            {panel === 'assets' && (
              // 素材: 承認のときのイメージにも、制作の参考にも使う(渡すものの中の素材と同じもの)
              <div className={s.pane}>
                <Hint hintKey="simpleCard.assets">{t('承認のときのイメージにも、制作の参考にもなる画像・資料・URL。ここに落としても足せます。', 'Images, files and URLs that show the idea to approvers and guide production. Drop them here to add.')}</Hint>
                <CreativeAssets
                  key={assetsVersion}
                  cardId={e.card.id}
                  stage="plan"
                  title=" "
                  hideCaption
                  compactAdd
                  owner={e.card.owner}
                  people={e.people}
                  cardName={e.form.name}
                  productionOwner={e.form.productionOwner}
                  productionDue={e.form.productionDue}
                  productIds={e.items.map((i) => i.productId)}
                  products={e.products}
                  onCount={setAssetCount}
                />
              </div>
            )}
            {panel === 'handoff' && (
              // 渡すもの(制作へ)。PLAN の途中で思いついたイメージを書き留め、承認のあと(または前でも)制作に渡す
              <div className={s.pane}>
                <HandoffSheet editor={e} onCommit={onCommit} assetsVersion={assetsVersion} assetCount={assetCount} onAssetCount={setAssetCount} checks={handoffChecks} onPickCheck={pickCheck} />
              </div>
            )}
          </div>
        </div>
        <Splitter onDrag={side ? resizeSide : () => undefined} onDone={saveWidths} />

        {/* プレビュー(いちばん広い) */}
        <div className={s.previewPane}>
          <div className={s.toolbar}>
            {/* テンプレートの札(押すと、選んだ部品のペインにテンプレート。選び直しは段階 b) */}
            {/* AB テストで、この案のテンプレートが A と違えば、ほかの部品と同じ下線の目印(SU2 ⑤) */}
            <Button
              type="button"
              size="small"
              appearance={isOn({ kind: 'template' }) ? 'primary' : 'outline'}
              icon={<LayoutColumnTwoRegular />}
              className={e.abDiffParts.some((p) => p.kind === 'template') ? s.abDiff : undefined}
              title={e.abDiffParts.some((p) => p.kind === 'template') ? t('この案のテンプレートは A と違います', 'This variant uses a different template from A') : undefined}
              onClick={() => select({ kind: 'template' })}
            >
              {t(`テンプレート: ${tpl.label}`, `Template: ${tpl.label}`)}
            </Button>
          </div>
          {/* 違いが多いときは知らせる(止めない)。案から選ぶときは、違ってよいので出さない */}
          {e.ab && e.ab.purpose === 'test' && e.ab.active !== 'A' && e.abDiffParts.length >= 3 && (
            <span className={s.abWarn}>{t(`A と違う所が ${e.abDiffParts.length} か所あります。結果の原因を切り分けにくくなります`, `${e.abDiffParts.length} places differ from A. It will be harder to tell what caused the result.`)}</span>
          )}
          {/* テンプレートを替えたうえに、ほかの所も違うときは、数によらず知らせる(SU2 ④。テンプレートの差と中身の差を分けられなくなるため) */}
          {e.ab && e.ab.purpose === 'test' && e.ab.active !== 'A' && e.abDiffParts.length < 3 && e.abDiffParts.length > 1 && e.abDiffParts.some((p) => p.kind === 'template') && (
            <span className={s.abWarn}>{t('テンプレートと、ほかの所も A と違います。結果がテンプレートの差か中身の差か、分けにくくなります', 'Both the template and other parts differ from A. It will be hard to tell which caused the result.')}</span>
          )}
          {/* 受信箱・通知での見え方(SU5)。プレビューに写らない件名・プリヘッダーを、押して直せるように。差出人の名前は、設定の画面の全社の既定か国の上書き(ST10) */}
          {e.channel === 'email' ? (
            <div className={s.inboxWrap}>
              <span className={s.inboxHead}>
                <MailRegular />
                {t('受信箱での見え方', 'How it looks in the inbox')}
              </span>
              {/* スマホのメールのアプリの 3 行: 差出人(太字)/ 件名 / プリヘッダー(うすく)。入れ忘れの点線は、その行に出す(SU10) */}
              <div className={s.inboxMail}>
                <span className={s.mailSender} title={t('差出人の名前(設定の画面で決める)', 'Sender name (set in Settings)')}>
                  <SenderName country={e.form.country} />
                </span>
                <button type="button" className={mergeClasses(s.inboxPart, s.mailLine, isOn({ kind: 'subject' }) && s.on, e.abDiffParts.some((p) => p.kind === 'subject') && s.abDiff, !(shown.subject || e.form.name) && s.inboxMissing)} onClick={() => select({ kind: 'subject' })} title={t('件名を直す', 'Edit the subject')}>
                  {shown.subject || e.form.name || t('件名未入力', 'No subject')}
                </button>
                <button type="button" className={mergeClasses(s.inboxPart, s.mailLine, s.mailPre, shown.preheader ? s.inboxSub : s.inboxMissing, isOn({ kind: 'preheader' }) && s.on, e.abDiffParts.some((p) => p.kind === 'preheader') && s.abDiff)} onClick={() => select({ kind: 'preheader' })} title={shown.preheader ? t('プリヘッダーを直す', 'Edit the preheader') : t('プリヘッダーが入っていません。押すと入力できます(受信箱で件名の下に出る文)', 'No preheader yet. Click to write it (shown below the subject in the inbox)')}>
                  {shown.preheader || t('プリヘッダー未入力', 'No preheader')}
                </button>
              </div>
            </div>
          ) : (
            <div className={s.inboxWrap}>
              <span className={s.inboxHead}>
                <AlertRegular />
                {t('スマホの通知での見え方', 'How it looks as a phone notification')}
              </span>
              <div className={s.inbox}>
                <span className={s.pushIcon} aria-hidden>
                  <SenderName country={e.form.country} initial />
                </span>
                <span className={s.sender} style={{ width: 'auto' }}>
                  <SenderName country={e.form.country} />
                </span>
                <button type="button" className={mergeClasses(s.inboxPart, isOn({ kind: 'pushTitle' }) && s.on, !shown.pushTitle && s.inboxMissing)} style={{ flexShrink: 0, maxWidth: '50%', fontWeight: 600 }} onClick={() => select({ kind: 'pushTitle' })} title={t('通知のタイトルを直す', 'Edit the notification title')}>
                  {shown.pushTitle || t('タイトル未入力', 'No title')}
                </button>
                <span className={s.inboxDash}>―</span>
                <button type="button" className={mergeClasses(s.inboxPart, shown.pushBody ? s.inboxSub : s.inboxMissing, isOn({ kind: 'pushBody' }) && s.on)} onClick={() => select({ kind: 'pushBody' })} title={t('通知の本文を直す', 'Edit the notification body')}>
                  {shown.pushBody || t('本文未入力', 'No body')}
                </button>
              </div>
            </div>
          )}
          <div className={s.boxWrap}>
          {/* プレビューの左上 = 見え方(スマホ / PC の幅)、右上 = 書き込む(場所を押してコメント)。役割で分け、場所を取らないようアイコンだけ */}
          {e.channel === 'email' && (
            <div className={s.viewBox}>
              {(['mobile', 'pc'] as const).map((d) => (
                <Tooltip key={d} content={d === 'mobile' ? t('スマホの幅', 'Mobile width') : t('PC の幅', 'Desktop width')} relationship="label">
                  <ToggleButton type="button" size="small" appearance={e.device === d ? 'primary' : 'subtle'} checked={e.device === d} icon={d === 'mobile' ? <PhoneRegular /> : <DesktopRegular />} onClick={() => e.setDevice(d)} />
                </Tooltip>
              ))}
            </div>
          )}
          <div className={s.pinBox}>
            {/* バルーンは 2 行(X73。1 行目に何ができるか、2 行目に打ち方。右クリックでも打てることを知らせる) */}
            <Tooltip
              content={
                placing ? (
                  t('コメントを書く場所を押してください(Esc でやめる)', 'Click where to comment (Esc to cancel)')
                ) : (
                  <>
                    {t('ピンを打って、コメントを書く', 'Pin and write a comment')}
                    <span className={s.tipSub}>{t('押してから、プレビューの場所を押す。右クリックでも打てます', 'Press this, then click a spot in the preview. Right-click also works')}</span>
                  </>
                )
              }
              relationship="label"
            >
              <ToggleButton type="button" size="small" appearance={placing ? 'primary' : 'subtle'} checked={placing} icon={<CommentAddRegular />} onClick={() => setPlacing(!placing)} />
            </Tooltip>
            <ResolvedPinsToggle />
          </div>
          {placing && (
            <MessageBar intent="info" className={s.placingBar}>
              <MessageBarBody>{t('コメントを書く場所を押してください(Esc でやめる)', 'Click where to write a comment (Esc to cancel)')}</MessageBarBody>
            </MessageBar>
          )}
          <div ref={boxRef} className={mergeClasses(s.box, nav.spaceDown && s.boxSpace, nav.panning && s.boxPanning)} tabIndex={0} aria-label={t('プレビュー(押した部品を直します。Tab で次の部品、Esc で選ぶのをやめる)', 'Preview (click a part to edit it; Tab for the next part, Esc to stop)')}>
            {e.preview}
            {e.alertOverlay}
            <PreviewPins boxRef={boxRef} cardId={e.card.id} view={pinView(e.channel, e.device, e.ab?.active ?? 'A')} items={e.items} placing={placing} onPlacingEnd={endPlacing} onOpenThreads={openThreads} menuItems={previewMenu} />
            {pinTarget && (
              <PinFloat
                cardId={e.card.id}
                cardOwner={e.card.owner}
                stage="plan"
                root={() => boxRef.current}
                target={pinTarget}
                productName={(id) => productById.get(id)?.name ?? ''}
                onTarget={setPinTarget}
                onClose={closePin}
                editSpot={(anchor, productId) => {
                  const p = partOfAnchor(anchor, (pid) => e.items.find((i) => i.productId === pid)?.key, productId)
                  return p ? () => select(p) : null
                }}
              />
            )}
            {diffMarks.length > 0 && <PreviewMarks boxRef={boxRef} marks={diffMarks} onSelect={select} />}
            <PreviewPartPicker boxRef={boxRef} selected={part && part.kind !== 'meta' && part.kind !== 'overview' ? part : null} onSelect={onPick} disabled={e.saving || placing} onSwap={onSwapBadge} />
          </div>
          {/* 倍率(Ctrl + ホイールでも。数字を押すと、全体表示と 100% を行き来する) */}
          <div className={s.zoomBox}>
            <Button type="button" size="small" appearance="subtle" icon={<SubtractRegular />} onClick={() => stepZoom(-0.1)} aria-label={t('縮小', 'Zoom out')} />
            <Tooltip content={e.zoom.mode === 'fit' ? t('100% にする', 'Set to 100%') : t('全体を表示', 'Fit the whole email')} relationship="description">
              <button type="button" className={s.zoomLabel} onClick={() => e.zoom.set(e.zoom.mode === 'fit' ? 1 : 'fit')}>
                {e.zoom.mode === 'fit' ? t('全体', 'Fit') : `${Math.round(e.zoom.shown * 100)}%`}
              </button>
            </Tooltip>
            <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} onClick={() => stepZoom(0.1)} aria-label={t('拡大', 'Zoom in')} />
          </div>
          </div>
        </div>

        <Splitter onDrag={resizePreview} onDone={saveWidths} />

        {/* 選んだ部品のペイン */}
        <div className={s.pane} key={part ? partKey(part) : 'none'}>
          <PartPane editor={e} part={part} compareKey={compareKey} onPlace={(key) => part && placed(part, key)} onCompareDone={() => setCompareKey(null)} onPick={select} chats={chats} setChat={setChat} heroReplace={heroReplace} swapAt={swapAt} onSwapAt={setSwapAt} onSwapped={swapped} />
          {e.footer}
        </div>

        <Splitter onDrag={fit.listOpen ? resizeList : () => undefined} onDone={saveWidths} />

        {/* 商品の一覧(畳める)。畳んでいても、商品ごとの点とアラートの色を出す */}
        {fit.listOpen ? (
          <div className={s.pane}>
            <div className={s.listHead}>
              <Button type="button" size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={toggleProducts} aria-label={t('商品の一覧を畳む', 'Collapse the product list')} />
            </div>
            <ProductInfoPane
              template={e.template}
              sectionTitles={e.sectionTitles}
              items={e.items}
              products={e.products}
              onHover={e.hoverProduct}
              alertKinds={e.alertKinds}
              onOpenProduct={openFromList}
              hint={t('行を押すと詳細が開きます。行にマウスを乗せると出る ⇄ で入れ替えられます。プレビューで枠を選んでいれば、その枠の商品と見比べて入れ替えられます。', 'Click a row for details. Use the ⇄ that appears on hover to replace it. If a slot is selected in the preview, you can compare and replace it.')}
              // 右の一覧に置くのは入れ替えだけ(並べ替え・外すは真ん中だけ。SU9 (g))
              rowAction={(key) => {
                const on = swapAt?.at === 'info' && swapAt.itemKey === key
                return (
                  <Tooltip content={t('入れ替える', 'Replace')} relationship="label">
                    <ToggleButton size="small" appearance="subtle" icon={<ArrowSwapRegular />} checked={on} disabled={e.saving} onClick={() => setSwapAt(on ? null : { itemKey: key, at: 'info' })} />
                  </Tooltip>
                )
              }}
              rowActionOn={(key) => swapAt?.at === 'info' && swapAt.itemKey === key}
              rowBelow={(key) => (
                <ProductSwap editor={e} itemKey={key} open={swapAt?.at === 'info' && swapAt.itemKey === key} onOpenChange={(o) => setSwapAt(o ? { itemKey: key, at: 'info' } : null)} chats={chats} setChat={setChat} onDone={(k) => swapped(key, k)} trigger={false} />
              )}
            />
            {e.candidates.length > 0 && (
              <>
                <div className={s.candHead}>{t(`候補(${e.candidates.length})`, `Candidates (${e.candidates.length})`)}</div>
                <div className={s.candList}>
                {e.candidates.map((c) => {
                  const p = productById.get(c.productId)
                  return p ? (
                    <Row
                      key={c.key}
                      dense
                      className={s.candWrap}
                      image={productImage(p)}
                      title={p.name}
                      meta={productMeta(p)}
                      reason={c.reason}
                      onClick={() => openFromList(c.key)}
                      actions={
                        // 候補(載せていない商品)は「⇄ 入れる」。どの枠の商品と入れ替えるかを、載せている商品から選ぶ(SU9 (f))
                        e.items.length > 0 && (
                          <span data-row-action>
                              <Menu positioning="below-end">
                                <MenuTrigger disableButtonEnhancement>
                                  <Button size="small" appearance="secondary" icon={<ArrowSwapRegular />} disabled={e.saving}>
                                    {t('入れる', 'Put in')}
                                  </Button>
                                </MenuTrigger>
                                <MenuPopover>
                                  <MenuList>
                                    {e.items.map((it, i) => (
                                      <MenuItem key={it.key} icon={<ArrowSwapRegular />} onClick={() => e.swapWithCandidate(it.key, c.key, '')}>
                                        {t(`${i + 1}. ${productById.get(it.productId)?.name ?? ''} と入れ替える`, `${i + 1}. Replace ${productById.get(it.productId)?.name ?? ''}`)}
                                      </MenuItem>
                                    ))}
                                  </MenuList>
                                </MenuPopover>
                              </Menu>
                          </span>
                        )
                      }
                    />
                  ) : null
                })}
                </div>
              </>
            )}
          </div>
        ) : (
          <PaneRail label={t('商品の一覧', 'Products')} onOpen={toggleProducts}>
            {e.items.map((it) => {
              const kind = e.alertKinds.get(it.productId)
              const name = productById.get(it.productId)?.name ?? ''
              return (
                <Tooltip key={it.key} content={name} relationship="label">
                  <button type="button" className={s.railDot} style={{ backgroundColor: kind ? ALERT_COLOR[kind] : tokens.colorNeutralStroke1 }} onClick={() => select({ kind: 'product', itemKey: it.key })} />
                </Tooltip>
              )
            })}
          </PaneRail>
        )}
      </div>
    </div>
  )
}
