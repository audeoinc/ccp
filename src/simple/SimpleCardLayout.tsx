import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Button, ToggleButton, Menu, MenuItem, MenuItemCheckbox, MenuList, MenuPopover, MenuTrigger, Popover, PopoverSurface, PopoverTrigger, Spinner, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, ArrowUndoRegular, BoxMultipleArrowRightRegular, ImageMultipleRegular, CheckmarkRegular, ErrorCircleRegular, CommentAddRegular, ColumnTripleRegular, CommentRegular, SettingsRegular, ChevronLeftRegular, ChevronRightRegular, DesktopRegular, DismissRegular, FlagRegular, LayoutColumnTwoRegular, PhoneRegular, SaveRegular, SubtractRegular } from '@fluentui/react-icons'
import { ChannelBadge } from '../ChannelBadge'
import { AiIcon } from '../AiMark'
import { ProductInfoPane } from '../ProductInfoPane'
import { PreviewPartPicker } from '../PreviewPartPicker'
import { PreviewPins } from '../PreviewPins'
import { pinView } from '../pinStore'
import { CommPane } from './CommPane'
import { PinFloat, type PinTarget } from '../PinFloat'
import { focusSoon, type ContextItem } from '../ContextMenu'
import { focusPin } from '../pinStore'
import { forgetLinkedPin, linkedPin } from '../pinActions'
import { heroImage } from '../images'
import { productUrl } from '../links'
import { EditRegular, ImageEditRegular, OpenRegular, ArrowSwapRegular, DeleteRegular, SparkleRegular } from '@fluentui/react-icons'
import { Splitter } from '../Splitter'
import { ImageThumb } from '../ImageThumb'
import { ALERT_COLOR } from '../alertColors'
import { productImage } from '../images'
import { locale, useT } from '../i18n'
import { loadPref, savePref } from '../settings'
import { getTemplate, sectionsOf } from '../templates'
import { NextAction } from './NextAction'
import type { NextStep } from './nextStep'
import { PartPane } from './PartPane'
import { placeInPart } from './actions'
import { partFromElement, partKey, partOfAnchor, samePart, type PartRef } from './parts'
import { usePreviewNav } from './usePreviewNav'
import { StageHeader } from './StageHeader'
import { HandoffSheet } from './HandoffSheet'
import { CreativeAssets } from '../CreativeAssets'
import { addDroppedAssets, canDropAsset } from './assetDrop'
import { myName } from '../history'
import { CardAssetsService } from '../data/cardAssets'
import { PreviewMarks, type Mark } from './PreviewMarks'
import type { SimpleEditor } from './editor'
import type { PartTurn } from './partAi'

// プレビュー(スマホ / PC の幅ごと)・商品の一覧のペインの幅と、商品の一覧の開閉(人の設定。ARCHITECTURE の 8 章)。
// プレビューは、メールの幅に合わせた幅にし、余りは選んだ部品のペインに回す(AI の入力欄と案を置くため。v2 で、プレビューを残りの幅から固定の幅に改めた)
const WIDTH_KEY = 'simpleCard.paneWidths.v2'
const PRODUCTS_KEY = 'simpleCard.productsOpen'
const RAIL_W = 32
type Widths = { mobile: number; pc: number; list: number; comm: number; hand: number }
const DEFAULT_WIDTHS: Widths = { mobile: 470, pc: 760, list: 300, comm: 320, hand: 400 }
// コミュニケーションのペインの開閉(既定は畳む。自分宛てのものがあれば、開いたときに広げる)
// 右端のサイドパネル(2026-10-23 利用者と決めた): アイコンの帯 1 本に「やり取り(承認者と)」「渡すもの(制作へ)」をプロセスの順に並べ、
// 押した方を 1 つだけ開く(もう片方は入れ替わる。開いている方を押すと閉じる)。どれを開いていたかは人ごとに覚える
const SIDE_KEY = 'simpleCard.sidePanel'
type Side = 'comm' | 'assets' | 'handoff' | null
const SIDE_W = 56
const clampPreview = (v: number) => Math.min(1200, Math.max(360, v))
const clampList = (v: number) => Math.min(640, Math.max(240, v))
// 目印の出し分け(人の設定)。学びは帯で場所を取るので、既定は隠す(隠していても、AI の依頼には渡す)
const MARKS_KEY = 'simpleCard.marks'
type MarkKind = 'unchecked' | 'alert' | 'learn'
const DEFAULT_MARKS: MarkKind[] = ['unchecked', 'alert']

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
  saved: { color: tokens.colorPaletteGreenForeground1 },
  notices: { display: 'grid', rowGap: '4px' },
  panes: {
    flexGrow: 1,
    minHeight: 0,
    display: 'grid',
    // 狭い画面では、商品の一覧とサイドパネルが縮む(右端のアイコンの帯は、いつも見えるように)
    gridTemplateColumns: `var(--wv) 1px minmax(280px, 1fr) 1px minmax(0, var(--wl)) 1px minmax(0, var(--ws)) ${SIDE_W}px`,
    gridTemplateRows: 'minmax(0, 1fr)',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
  },
  pane: { minHeight: 0, overflow: 'auto', padding: '12px 14px', backgroundColor: tokens.colorNeutralBackground1 },
  previewPane: { display: 'grid', gridTemplateRows: 'auto auto auto auto minmax(0, 1fr)', rowGap: '6px', minHeight: 0, minWidth: 0, padding: '8px 12px 10px', backgroundColor: tokens.colorNeutralBackground2 },
  toolbar: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  // 受信箱の 1 行(差出人・件名・プリヘッダー)。プレビューに写らないものを押して直せるように
  inbox: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  sender: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200, flexShrink: 0 },
  inboxPart: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 6px', borderRadius: tokens.borderRadiusSmall, border: '1px solid transparent', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase300, cursor: 'pointer', textAlign: 'left', color: tokens.colorNeutralForeground1, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  inboxSub: { color: tokens.colorNeutralForeground3, flexShrink: 1 },
  // プレビューの枠。ピン・印と同じく、重ねる層の基準にする(position: relative)。押したら Tab・Esc が効くよう、フォーカスを受け取る
  boxWrap: { position: 'relative', minHeight: 0, display: 'grid' },
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
  rail: { display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: '8px', paddingTop: '10px', minHeight: 0, overflow: 'hidden', backgroundColor: tokens.colorNeutralBackground2 },
  commPane: { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: 0, backgroundColor: tokens.colorNeutralBackground1 },
  railLabel: { writingMode: 'vertical-rl', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, letterSpacing: '0.1em' },
  railDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, border: 'none', padding: 0, cursor: 'pointer' },
  listHead: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: '-6px' },
  colTitle: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold, marginBottom: '10px' },
  // 右端のサイドパネルと、アイコンの帯
  sidePane: { display: 'grid', minHeight: 0, minWidth: 0, overflow: 'hidden' },
  sideRail: { display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: '4px', paddingTop: '8px', borderLeft: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground2 },
  sideBtn: { display: 'grid', justifyItems: 'center', rowGap: '2px', width: '48px', padding: '6px 0', border: 'none', borderRadius: tokens.borderRadiusMedium, backgroundColor: 'transparent', fontFamily: 'inherit', color: tokens.colorNeutralForeground2, cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover, color: tokens.colorNeutralForeground1 } },
  sideOn: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, ':hover': { backgroundColor: tokens.colorBrandBackground2Hover } },
  sideIcon: { position: 'relative', fontSize: '20px', lineHeight: 1 },
  sideBadge: { position: 'absolute', top: '-6px', right: '-12px', minWidth: '16px', height: '16px', padding: '0 4px', boxSizing: 'border-box', borderRadius: '8px', fontSize: '10px', lineHeight: '16px', textAlign: 'center', color: tokens.colorNeutralForegroundOnBrand, backgroundColor: tokens.colorBrandBackground },
  sideDot: { position: 'absolute', top: '-3px', left: '-6px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tokens.colorPaletteRedBackground3 },
  sideLabel: { fontSize: '10px', lineHeight: 1.2 },
  // 画像・URL を落とせる所(ドラッグ中)
  sideDrop: { outline: `2px dashed ${tokens.colorBrandStroke1}`, outlineOffset: '-2px', backgroundColor: tokens.colorBrandBackground2 },
  dropNote: { fontSize: '16px' },
  candHead: { marginTop: '16px', paddingBottom: '4px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  candRow: { display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: '8px', alignItems: 'center', width: '100%', padding: '6px 4px', border: 'none', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground2 } },
  candName: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  candMeta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  // 案のタブ(SU2)
  abRow: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '4px', rowGap: '4px', minHeight: '28px' },
  abTab: { display: 'inline-flex', alignItems: 'center', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1 },
  abTabOn: { borderTopColor: tokens.colorBrandStroke1, borderRightColor: tokens.colorBrandStroke1, borderBottomColor: tokens.colorBrandStroke1, borderLeftColor: tokens.colorBrandStroke1, backgroundColor: tokens.colorBrandBackground2 },
  abTabBtn: { border: 'none', backgroundColor: 'transparent', padding: '3px 10px', fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, cursor: 'pointer', color: tokens.colorNeutralForeground1 },
  abTabX: { border: 'none', backgroundColor: 'transparent', padding: '0 8px 0 0', fontFamily: 'inherit', cursor: 'pointer', color: tokens.colorNeutralForeground3 },
  abWarn: { fontSize: tokens.fontSizeBase200, color: tokens.colorPaletteDarkOrangeForeground1 },
  abDiff: { boxShadow: `inset 0 -2px 0 ${tokens.colorPaletteDarkOrangeBorder2}` },
  applyBox: { display: 'grid', rowGap: '6px', marginTop: '14px', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground2 },
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

/**
 * シンプルな配信カード(SU1。docs/SIMPLE_CARD.md)。プレビューが主役で、部品を押すと、その部品だけを直すペインが出る。
 * 状態と保存は CardDetail のもの(editor)をそのまま使う。ここは並べ方と、部品の選び方・反映の時機だけを持つ
 */
export function SimpleCardLayout({ editor: e, boxRef, isDirty, onCommit, onApply, onUndo, onRunNext, onClose }: Props) {
  const t = useT()
  const s = useStyles()
  const [part, setPart] = useState<PartRef | null>(null)
  // 商品の一覧で押した商品(選んでいる枠と見比べる)
  const [compareKey, setCompareKey] = useState<string | null>(null)
  // 部品ごとの AI とのやり取り(開いている間だけ)
  const [chats, setChats] = useState<Record<string, PartTurn[]>>({})
  const setChat = (key: string, f: (prev: PartTurn[]) => PartTurn[]) => setChats((c) => ({ ...c, [key]: f(c[key] ?? []) }))
  const [widths, setWidths] = useState<Widths>(() => {
    const v = loadPref<Partial<Widths> | null>(WIDTH_KEY, null)
    return { mobile: clampPreview(Number(v?.mobile ?? DEFAULT_WIDTHS.mobile)), pc: clampPreview(Number(v?.pc ?? DEFAULT_WIDTHS.pc)), list: clampList(Number(v?.list ?? DEFAULT_WIDTHS.list)), comm: clampList(Number(v?.comm ?? DEFAULT_WIDTHS.comm)), hand: clampList(Number(v?.hand ?? DEFAULT_WIDTHS.hand)) }
  })
  // アプリの配信は、スマホの幅
  const widthKey: 'mobile' | 'pc' = e.channel === 'email' && e.device === 'pc' ? 'pc' : 'mobile'
  const nav = usePreviewNav(boxRef, e.zoom)
  const [marks, setMarks] = useState<MarkKind[]>(() => loadPref<MarkKind[]>(MARKS_KEY, DEFAULT_MARKS))
  const markOn = (k: MarkKind) => marks.includes(k)
  // AI 下書き・未確認の目印: AI が作った部品(文言・メイン画像・商品)の右上に点。見つからない部品(テンプレートにない枠)は出ない
  const uncheckedMarks: Mark[] =
    e.card.ai_unchecked_at && markOn('unchecked')
      ? [
          ...(['headline', 'copy', 'hero', 'pushTitle', 'pushBody'] as const).map((kind) => ({ part: { kind } as PartRef })),
          ...sectionsOf(e.template).flatMap((_, index) => [{ part: { kind: 'sectionTitle', index } as PartRef }, { part: { kind: 'sectionCopy', index } as PartRef }]),
          ...e.items.map((it) => ({ part: { kind: 'product', itemKey: it.key } as PartRef })),
        ].map((x) => ({ ...x, color: tokens.colorPaletteBerryBackground3, label: t('AI 下書き・未確認(確かめたら、上の「確認した」)', 'AI draft, unchecked (press “Mark as checked” above when done)') }))
      : []
  // 「A と違う」の目印(B・C 案を直しているとき)
  const diffMarks: Mark[] = e.abDiffParts.map((part) => ({ part, color: tokens.colorPaletteDarkOrangeBackground3, label: t('A と違う', 'Differs from A') }))
  const [productsOpen, setProductsOpen] = useState(() => loadPref<boolean>(PRODUCTS_KEY, true))

  /** 部品を選ぶ。別の部品に移るときに、それまでの変更を反映(保存)する(SU1 ⑫) */
  const select = (p: PartRef | null) => {
    if (samePart(p, part)) return
    void onCommit()
    setPart(p)
    setCompareKey(null)
  }
  // 部品を選ぶ層には、変わらない関数を渡す(押すたびに、いまの値で select を呼ぶ)
  const selectRef = useRef(select)
  useEffect(() => {
    selectRef.current = select
  })
  const onPick = useCallback((p: PartRef | null) => selectRef.current(p), [])

  const resizePreview = (dx: number) => setWidths((w) => ({ ...w, [widthKey]: clampPreview(w[widthKey] + dx) }))
  const resizeList = (dx: number) => setWidths((w) => ({ ...w, list: clampList(w.list - dx) }))
  const [side, setSide] = useState<Side>(() => loadPref<Side>(SIDE_KEY, null))
  /** サイドパネルを開く(open: 必ず開く。省略は、開いている方を押したら閉じる) */
  const showSide = (v: 'comm' | 'assets' | 'handoff', open = false) => {
    const next = !open && side === v ? null : v
    setSide(next)
    savePref(SIDE_KEY, next)
  }
  const resizeSide = (dx: number) => setWidths((w) => (side === 'comm' ? { ...w, comm: clampList(w.comm - dx) } : { ...w, hand: clampList(w.hand - dx) }))
  const [counts, setCounts] = useState<{ open: number; tasks: number; mine: boolean; waiting: boolean }>({ open: 0, tasks: 0, mine: false, waiting: false })
  // 開け閉めは人に任せる(自動では開かない。自分宛てがあれば、帯のアイコンの赤い点で知らせる。2026-10-23 利用者)
  const onCounts = useCallback((c: { open: number; tasks: number; mine: boolean; waiting: boolean }) => setCounts(c), [])
  // 右端の帯の「渡すもの」に、画像・資料・URL を落として、参考の素材に入れる(列を開かずに書き留めるため)
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
  const [placing, setPlacing] = useState(false)
  const endPlacing = useCallback(() => setPlacing(false), [])
  // リンク(pin=…)で開いたときは、そのピンのフロートを開いて始める
  const [pinTarget, setPinTarget] = useState<PinTarget | null>(() => {
    const id = linkedPin()
    return id ? { noteId: id } : null
  })
  useEffect(() => {
    const id = linkedPin()
    if (id) focusPin(id)
  }, [])
  const openThreads = useCallback((noteId?: string) => setPinTarget(noteId ? { noteId } : { pending: true }), [])
  const closePin = () => {
    forgetLinkedPin()
    setPinTarget(null)
  }
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
    const askAi = () => {
      select(p)
      focusSoon('[data-part-ai-input]')
    }
    const list: ContextItem[] = [{ key: 'edit', label: t('この部品を直す', 'Edit this part'), icon: <EditRegular />, onSelect: () => select(p) }]
    if (p.kind !== 'slot') list.push({ key: 'ai', label: t('この部品について AI に頼む', 'Ask AI about this part'), icon: <SparkleRegular />, onSelect: askAi })
    // ボタンと同じく、反映中だけ押せなくする(確定した週は、保存のときに理由を聞く)
    const busy = e.saving
    if (p.kind === 'product') {
      const it = e.items.find((i) => i.key === p.itemKey)
      const url = productUrl(e.products.find((x) => x.id === it?.productId))
      list.push(
        { key: 'swap', label: t('商品を差し替える', 'Swap the product'), icon: <ArrowSwapRegular />, divider: true, disabled: busy, onSelect: () => e.openProduct(p.itemKey) },
        { key: 'page', label: t('商品ページを開く', 'Open the product page'), icon: <OpenRegular />, disabled: !url, onSelect: () => window.open(url, '_blank', 'noreferrer') },
        {
          key: 'remove',
          label: t('この商品を外す', 'Remove this product'),
          icon: <DeleteRegular />,
          disabled: busy,
          // 部品のペインの「外す(候補に戻す)」と同じ
          onSelect: () => {
            e.removeItem(p.itemKey)
            if (part && samePart(part, p)) select(null)
          },
        },
      )
    }
    if (p.kind === 'hero') {
      const src = heroImage(e.hero)
      list.push(
        {
          key: 'replace',
          label: t('画像を入れ替える', 'Replace the image'),
          icon: <ImageEditRegular />,
          divider: true,
          disabled: busy,
          onSelect: () => {
            select(p)
            setHeroReplace((n) => n + 1)
          },
        },
        { key: 'tab', label: t('画像を新しいタブで開く', 'Open the image in a new tab'), icon: <OpenRegular />, disabled: !src, onSelect: () => window.open(src, '_blank', 'noreferrer') },
      )
    }
    return list
  }
  const stepZoom = (d: number) => e.zoom.set(Math.max(e.zoom.min, Math.min(e.zoom.max, Math.round((e.zoom.shown + d) * 20) / 20)))
  const saveWidths = () => savePref(WIDTH_KEY, widths)
  const toggleProducts = () => {
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
      e.openProduct(key)
      return
    }
    setCompareKey(key)
    e.openProduct(key, {
      label: target.kind === 'product' ? t('この枠の商品と入れ替える', 'Swap with the product in this slot') : t('この枠に入れる', 'Put in this slot'),
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
  const when = e.form.scheduledAt ? new Date(e.form.scheduledAt).toLocaleString(locale(), { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' }) : t('配信日時 未設定', 'No send date')


  return (
    <div className={s.root}>
      <StageHeader
        title={
          <>
            <ChannelBadge channel={e.form.channel} />
            {field({ kind: 'meta', field: 'name' }, <span className={s.name}>{e.form.name || t('(配信名未入力)', '(No name)')}</span>, t('配信名を直す', 'Edit the name'), s.nameField)}
            {field({ kind: 'meta', field: 'scheduledAt' }, <span>{when}</span>, t('配信日時を直す', 'Edit the send date'))}
          </>
        }
        actions={
          <>
            {/* 反映の様子: 保存中 / 保存しました */}
            {e.saving ? (
              <Spinner size="extra-tiny" label={t('反映しています', 'Saving')} labelPosition="after" />
            ) : e.justSaved ? (
              <span className={mergeClasses(s.state, s.saved)}>{t('反映しました', 'Saved')}</span>
            ) : null}
            <Tooltip content={t('元に戻す: 前に反映した中身に戻します(開いている間の履歴)', 'Undo: go back to the content before the last save (history while open)')} relationship="description">
              <Button type="button" size="small" appearance="subtle" icon={<ArrowUndoRegular />} disabled={!e.canUndo || e.saving} onClick={onUndo} aria-label={t('元に戻す', 'Undo')} />
            </Tooltip>
            {e.dirty && (
              <Tooltip content={e.locked ? t('確定した週の配信です。変えた理由を入力してから反映します', 'Confirmed week: enter a reason to save') : t('まだ反映していない変更があります。ほかの部品を押しても反映します', 'Unsaved changes. Picking another part also saves them')} relationship="description">
                <Button type="button" size="small" icon={<SaveRegular />} disabled={e.saving} onClick={onApply}>
                  {t('反映', 'Save')}
                </Button>
              </Tooltip>
            )}
            <NextAction
              step={e.nextStep}
              busy={e.saving}
              // 承認はやり取りの列(⋯ から依頼)、制作への依頼は渡すものの列で行う。確認した・制作のページは、CardDetail の側
              onRun={(step) => (step === 'requestProduction' ? showSide('handoff', true) : step === 'requestApproval' || step === 'watchApproval' ? showSide('comm', true) : onRunNext(step))}
            />
            {e.viewSwitch}
            {e.menu}
            <Button type="button" appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
          </>
        }
        // 面のタブ(PLAN | PRODUCTION | RESULTS)。配信が主役で、面はその見方なので、題名の下に
        tabs={e.stageNav}
      />
      <div className={s.notices}>
        {e.notices}
        {/* 学びの帯は、隠していても描く(AI の依頼に学びを渡すのは、この帯の役目のため) */}
        <div style={markOn('learn') ? undefined : { display: 'none' }}>{e.learnings}</div>
      </div>

      <div className={s.panes} style={{ '--wv': `${widths[widthKey]}px`, '--wl': `${productsOpen ? widths.list : RAIL_W}px`, '--ws': `${side === 'comm' ? widths.comm : side ? widths.hand : 0}px` } as React.CSSProperties}>
        {/* プレビュー(いちばん広い) */}
        <div className={s.previewPane}>
          <div className={s.toolbar}>
            {/* テンプレートの札(押すと、選んだ部品のペインにテンプレート。選び直しは段階 b) */}
            <Button type="button" size="small" appearance={isOn({ kind: 'template' }) ? 'primary' : 'outline'} icon={<LayoutColumnTwoRegular />} onClick={() => select({ kind: 'template' })}>
              {t(`テンプレート: ${tpl.label}`, `Template: ${tpl.label}`)}
            </Button>
            <Menu
              checkedValues={{ marks }}
              onCheckedValueChange={(_, d) => {
                const next = d.checkedItems as MarkKind[]
                setMarks(next)
                savePref(MARKS_KEY, next)
              }}
            >
              <MenuTrigger disableButtonEnhancement>
                <Button type="button" size="small" appearance="subtle" icon={<FlagRegular />}>
                  {t('目印', 'Marks')}
                </Button>
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItemCheckbox name="marks" value="unchecked" disabled={!e.card.ai_unchecked_at} secondaryContent={e.card.ai_unchecked_at ? undefined : t('なし', 'None')}>
                    {t('AI 下書き・未確認', 'AI draft, unchecked')}
                  </MenuItemCheckbox>
                  <MenuItemCheckbox name="marks" value="alert" secondaryContent={String(new Set(e.items.filter((i) => e.alertKinds.has(i.productId)).map((i) => i.productId)).size)}>
                    {t('アラート(在庫など)', 'Alerts (stock etc.)')}
                  </MenuItemCheckbox>
                  <MenuItemCheckbox name="marks" value="learn" secondaryContent={String(e.learnCount)}>
                    {t('これまでの学び', 'Learnings so far')}
                  </MenuItemCheckbox>
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
          {/* 案のタブ(SU2): A | B | C | ＋。切り替えると、プレビューとペインがその案の中身になる */}
          <div className={s.abRow}>
            {e.ab ? (
              e.ab.keys.map((k) => (
                <span key={k} className={mergeClasses(s.abTab, e.ab?.active === k && s.abTabOn)}>
                  <button type="button" className={s.abTabBtn} onClick={() => k !== e.ab?.active && (void onCommit(), e.abSwitch(k))} aria-pressed={e.ab?.active === k}>
                    {t(`${k} 案`, `Variant ${k}`)}
                  </button>
                  {k !== 'A' && e.ab?.active === k && (
                    <button
                      type="button"
                      className={s.abTabX}
                      aria-label={t(`${k} 案を消す`, `Remove variant ${k}`)}
                      onClick={() => window.confirm(t(`${k} 案を消します(保存で確定)。よろしいですか?`, `Remove variant ${k}? (on save)`)) && e.abRemove(k)}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))
            ) : (
              <span className={s.hint}>{t('案は 1 つ', 'One variant')}</span>
            )}
            {(!e.ab || e.ab.canAdd) && (
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button type="button" size="small" appearance="subtle" icon={<AddRegular />} disabled={e.saving || e.ab?.busy}>
                    {e.ab ? t('案を足す', 'Add variant') : t('案を足す(AB テスト)', 'Add variant (A/B)')}
                  </Button>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    {(e.ab?.keys ?? ['A']).map((k) => (
                      <MenuItem key={k} onClick={() => (void onCommit(), e.abAdd(k))}>
                        {t(`${k} 案を写して直す`, `Copy variant ${k} and edit`)}
                      </MenuItem>
                    ))}
                    <MenuItem icon={<AiIcon size={16} />} onClick={() => (void onCommit(), e.abAdd('ai'))}>
                      {t('AI で別の案を作る', 'Let AI make another variant')}
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            )}
            {e.ab && (
              <>
                <Button type="button" size="small" appearance="subtle" icon={<ColumnTripleRegular />} onClick={e.abCompare}>
                  {t('並べて比べる', 'Compare')}
                </Button>
                <Popover positioning="below-start" withArrow>
                  <PopoverTrigger disableButtonEnhancement>
                    <Button type="button" size="small" appearance="subtle" icon={<SettingsRegular />} aria-label={t('テストの設定', 'Test settings')} />
                  </PopoverTrigger>
                  <PopoverSurface>{e.abSettings}</PopoverSurface>
                </Popover>
              </>
            )}
            {e.ab?.busy && <Spinner size="extra-tiny" label={t('AI が案を作っています', 'AI is drafting')} labelPosition="after" />}
          </div>
          {/* 違いが多いときは知らせる(止めない)。案から選ぶときは、違ってよいので出さない */}
          {e.ab && e.ab.purpose === 'test' && e.ab.active !== 'A' && e.abDiffParts.length >= 3 && (
            <span className={s.abWarn}>{t(`A と違う所が ${e.abDiffParts.length} か所あります。結果の原因を切り分けにくくなります`, `${e.abDiffParts.length} places differ from A. It will be harder to tell what caused the result.`)}</span>
          )}
          {e.channel === 'email' ? (
            <div className={s.inbox}>
              <span className={s.sender}>SHOP</span>
              <button type="button" className={mergeClasses(s.inboxPart, isOn({ kind: 'subject' }) && s.on, e.abDiffParts.some((p) => p.kind === 'subject') && s.abDiff)} style={{ fontWeight: 600 }} onClick={() => select({ kind: 'subject' })} title={t('件名を直す', 'Edit the subject')}>
                {e.form.subject || e.form.name || t('(件名未入力)', '(No subject)')}
              </button>
              <button type="button" className={mergeClasses(s.inboxPart, s.inboxSub, isOn({ kind: 'preheader' }) && s.on, e.abDiffParts.some((p) => p.kind === 'preheader') && s.abDiff)} onClick={() => select({ kind: 'preheader' })} title={t('プリヘッダーを直す', 'Edit the preheader')}>
                {e.form.preheader || t('(プリヘッダー未入力)', '(No preheader)')}
              </button>
            </div>
          ) : (
            <span className={s.hint}>{t('通知のタイトル・本文・画像・商品は、プレビューを押して直します', 'Click the preview to edit the notification title, body, image and products')}</span>
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
            <Tooltip content={placing ? t('コメントを書く場所を押してください(Esc でやめる)', 'Click where to comment (Esc to cancel)') : t('プレビューの場所を押して、コメントを書く', 'Click a spot in the preview to comment')} relationship="label">
              <ToggleButton type="button" size="small" appearance={placing ? 'primary' : 'subtle'} checked={placing} icon={<CommentAddRegular />} onClick={() => setPlacing(!placing)} />
            </Tooltip>
          </div>
          <div ref={boxRef} className={mergeClasses(s.box, nav.spaceDown && s.boxSpace, nav.panning && s.boxPanning)} tabIndex={0} aria-label={t('プレビュー(押した部品を直します。Tab で次の部品、Esc で選ぶのをやめる)', 'Preview (click a part to edit it; Tab for the next part, Esc to stop)')}>
            {e.preview}
            {markOn('alert') && e.alertOverlay}
            <PreviewPins boxRef={boxRef} cardId={e.card.id} view={pinView(e.channel, e.device, e.ab?.active ?? 'A')} items={e.items} placing={placing} onPlacingEnd={endPlacing} onOpenThreads={openThreads} menuItems={previewMenu} />
            {pinTarget && (
              <PinFloat
                cardId={e.card.id}
                cardOwner={e.card.owner}
                stage="plan"
                root={() => boxRef.current}
                target={pinTarget}
                productName={(id) => e.products.find((p) => p.id === id)?.name ?? ''}
                onTarget={setPinTarget}
                onClose={closePin}
                editSpot={(anchor, productId) => {
                  const p = partOfAnchor(anchor, (pid) => e.items.find((i) => i.productId === pid)?.key, productId)
                  return p ? () => select(p) : null
                }}
              />
            )}
            {uncheckedMarks.length + diffMarks.length > 0 && <PreviewMarks boxRef={boxRef} marks={[...uncheckedMarks, ...diffMarks]} onSelect={select} />}
            <PreviewPartPicker boxRef={boxRef} selected={part && part.kind !== 'meta' && part.kind !== 'overview' ? part : null} onSelect={onPick} disabled={e.saving || placing} />
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
          <PartPane editor={e} part={part} compareKey={compareKey} onPlace={(key) => part && placed(part, key)} onCompareDone={() => setCompareKey(null)} onPick={select} chats={chats} setChat={setChat} heroReplace={heroReplace} />
          {e.dirty && (
            <div className={s.applyBox}>
              <span className={s.hint}>
                {e.locked
                  ? t('確定した週の配信です。変えた理由を入力してから反映します。', 'This delivery is in a confirmed week. Enter a reason to save.')
                  : t('ほかの部品を押すと、自動で反映(保存)します。すぐに反映するときは、ここで。', 'Changes are saved when you pick another part. To save now, use this button.')}
              </span>
              <Button type="button" size="small" icon={<SaveRegular />} disabled={e.saving} onClick={onApply}>
                {e.locked ? t('理由を入力して反映', 'Save with a reason') : t('反映', 'Save')}
              </Button>
            </div>
          )}
          {e.footer}
        </div>

        <Splitter onDrag={productsOpen ? resizeList : () => undefined} onDone={saveWidths} />

        {/* 商品の一覧(畳める)。畳んでいても、商品ごとの点とアラートの色を出す */}
        {productsOpen ? (
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
              hint={t('行を押すと詳細が開きます。プレビューで枠を選んでいれば、その枠の商品と見比べて入れ替えられます。', 'Click a row for details. If a slot is selected in the preview, you can compare and swap it in.')}
            />
            {e.candidates.length > 0 && (
              <>
                <div className={s.candHead}>{t(`候補(${e.candidates.length})`, `Candidates (${e.candidates.length})`)}</div>
                {e.candidates.map((c) => {
                  const p = e.products.find((x) => x.id === c.productId)
                  return p ? (
                    <button key={c.key} type="button" className={s.candRow} onClick={() => openFromList(c.key)} title={c.reason}>
                      <ImageThumb src={productImage(p)} alt={p.name} width={32} height={40} />
                      <span style={{ display: 'grid', minWidth: 0 }}>
                        <span className={s.candName}>{p.name}</span>
                        <span className={s.candMeta}>{`${p.product_code ?? ''} ・ ${t('在庫', 'Stock ')}${p.stock ?? '-'}`}</span>
                      </span>
                    </button>
                  ) : null
                })}
              </>
            )}
          </div>
        ) : (
          <div className={s.rail}>
            <Button type="button" size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={toggleProducts} aria-label={t('商品の一覧を開く', 'Open the product list')} />
            {e.items.map((it) => {
              const kind = e.alertKinds.get(it.productId)
              const name = e.products.find((p) => p.id === it.productId)?.name ?? ''
              return (
                <Tooltip key={it.key} content={name} relationship="label">
                  <button type="button" className={s.railDot} style={{ backgroundColor: kind ? ALERT_COLOR[kind] : tokens.colorNeutralStroke1 }} onClick={() => select({ kind: 'product', itemKey: it.key })} />
                </Tooltip>
              )
            })}
            <span className={s.railLabel}>{t('商品の一覧', 'Products')}</span>
          </div>
        )}


        <Splitter onDrag={side ? resizeSide : () => undefined} onDone={saveWidths} />

        {/* サイドパネル(開いている 1 つ)。やり取りは、閉じていても帯の数を合わせるため、中身は描いたまま隠す */}
        <div className={s.sidePane}>
          <div className={s.commPane} style={side === 'comm' ? undefined : { display: 'none' }}>
            <CommPane
              card={e.card}
              part={part}
              onPick={select}
              items={e.items}
              productName={(id) => e.products.find((p) => p.id === id)?.name ?? ''}
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
            />
          </div>
          {side === 'assets' && (
            // 素材: 承認のときのイメージにも、制作の参考にも使う(渡すものの中の素材と同じもの)
            <div className={s.pane}>
              <div className={s.colTitle}>{t('素材', 'Assets')}</div>
              <span className={s.hint}>{t('承認のときのイメージにも、制作の参考にもなる画像・資料・URL。ここに落としても足せます。', 'Images, files and URLs that show the idea to approvers and guide production. Drop them here to add.')}</span>
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
          {side === 'handoff' && (
            // 渡すもの(制作へ)。PLAN の途中で思いついたイメージを書き留め、承認のあと(または前でも)制作に渡す
            <div className={s.pane}>
              <div className={s.colTitle}>{t('渡すもの(制作へ)', 'For production')}</div>
              <HandoffSheet editor={e} onCommit={onCommit} assetsVersion={assetsVersion} assetCount={assetCount} onAssetCount={setAssetCount} />
            </div>
          )}
        </div>

        {/* 右端のアイコンの帯。上から、プロセスの順(承認者とのやり取り → 制作へ渡すもの)。数と赤い点で、開かなくても様子が分かる */}
        <nav className={s.sideRail} aria-label={t('サイドパネル', 'Side panels')}>
          <Tooltip content={t('やり取り(承認者と。書き込み・タスク・承認)', 'Conversation (with approvers: comments, tasks, approval)')} relationship="description" positioning="before">
            <button type="button" className={mergeClasses(s.sideBtn, side === 'comm' && s.sideOn)} aria-pressed={side === 'comm'} onClick={() => showSide('comm')}>
              <span className={s.sideIcon}>
                <CommentRegular />
                {counts.open + counts.tasks > 0 && <span className={s.sideBadge}>{counts.open + counts.tasks}</span>}
                {(counts.mine || counts.waiting) && <span className={s.sideDot} style={counts.mine ? undefined : { backgroundColor: tokens.colorPaletteMarigoldBackground3 }} />}
              </span>
              <span className={s.sideLabel}>{t('やり取り', 'Talk')}</span>
            </button>
          </Tooltip>
          <Tooltip content={t('素材(承認のときのイメージにも、制作の参考にも。画像・資料・URL を落としても足せる)', 'Assets (images, files and URLs for approvers and production; drop to add)')} relationship="description" positioning="before">
            <button
              type="button"
              className={mergeClasses(s.sideBtn, side === 'assets' && s.sideOn, dropOver === 'assets' && s.sideDrop)}
              aria-pressed={side === 'assets'}
              onClick={() => showSide('assets')}
              onDragOver={(ev) => {
                if (!canDropAsset(ev.dataTransfer)) return
                ev.preventDefault()
                setDropOver('assets')
              }}
              onDragLeave={() => setDropOver(null)}
              onDrop={(ev) => {
                ev.preventDefault()
                void dropAssets(ev.dataTransfer)
              }}
            >
              <span className={s.sideIcon}>
                <ImageMultipleRegular />
                {assetCount > 0 && <span className={s.sideBadge}>{assetCount}</span>}
              </span>
              <span className={s.sideLabel}>{t('素材', 'Assets')}</span>
            </button>
          </Tooltip>
          <Tooltip content={handoffMissing ? t('渡すもの(制作へ)。制作の担当か締め切りが、まだ空いています', 'Handoff (to production). Assignee or due date is still empty') : t('渡すもの(制作へ。文章・参考の画像と URL・担当と締め切り)', 'For production (notes, reference images and URLs, assignee and due date)')} relationship="description" positioning="before">
            <button
              type="button"
              className={mergeClasses(s.sideBtn, side === 'handoff' && s.sideOn, dropOver === 'handoff' && s.sideDrop)}
              aria-pressed={side === 'handoff'}
              onClick={() => showSide('handoff')}
              onDragOver={(ev) => {
                if (!canDropAsset(ev.dataTransfer)) return
                ev.preventDefault()
                setDropOver('handoff')
              }}
              onDragLeave={() => setDropOver(null)}
              onDrop={(ev) => {
                ev.preventDefault()
                void dropAssets(ev.dataTransfer)
              }}
            >
              <span className={s.sideIcon}>
                <BoxMultipleArrowRightRegular />
                {handoffMissing && <span className={s.sideDot} style={{ backgroundColor: tokens.colorPaletteMarigoldBackground3 }} />}
              </span>
              <span className={s.sideLabel}>{t('渡すもの', 'Handoff')}</span>
            </button>
          </Tooltip>
          {/* 落としたものを入れた・入れられなかったを、帯の下に短く知らせる */}
          {dropNote && (
            <Tooltip content={dropNote.text} relationship="label" positioning="before" visible>
              <span className={s.dropNote} style={{ color: dropNote.ok ? tokens.colorPaletteGreenForeground1 : tokens.colorPaletteRedForeground1 }}>
                {dropNote.ok ? <CheckmarkRegular /> : <ErrorCircleRegular />}
              </span>
            </Tooltip>
          )}
        </nav>
      </div>
    </div>
  )
}
