import { cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Button, Menu, MenuItem, MenuItemCheckbox, MenuList, MenuPopover, MenuTrigger, Popover, PopoverSurface, PopoverTrigger, Spinner, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, ArrowUndoRegular, ColumnTripleRegular, CommentRegular, PersonAvailableRegular, SettingsRegular, TaskListSquareLtrRegular, ChevronLeftRegular, ChevronRightRegular, DesktopRegular, DismissRegular, FlagRegular, LayoutColumnTwoRegular, PhoneRegular, SaveRegular, SubtractRegular } from '@fluentui/react-icons'
import { ChannelBadge } from '../ChannelBadge'
import { AiIcon } from '../AiMark'
import { ProductInfoPane } from '../ProductInfoPane'
import { PreviewPartPicker } from '../PreviewPartPicker'
import { PreviewPins } from '../PreviewPins'
import { pinView } from '../pinStore'
import { CommPane } from './CommPane'
import { Splitter } from '../Splitter'
import { ImageThumb } from '../ImageThumb'
import { ALERT_COLOR } from '../alertColors'
import { productImage } from '../images'
import { locale, useT } from '../i18n'
import { loadPref, savePref } from '../settings'
import { statusRank } from '../status'
import { getTemplate, sectionsOf } from '../templates'
import { NextAction } from './NextAction'
import type { NextStep } from './nextStep'
import { PartPane } from './PartPane'
import { placeInPart } from './actions'
import { partKey, samePart, type PartRef } from './parts'
import { usePreviewNav } from './usePreviewNav'
import { HandoffSheet } from './HandoffSheet'
import { ProductionRequestsService } from '../data/productionRequests'
import { PreviewMarks, type Mark } from './PreviewMarks'
import type { SimpleEditor } from './editor'
import type { PartTurn } from './partAi'

// プレビュー(スマホ / PC の幅ごと)・商品の一覧のペインの幅と、商品の一覧の開閉(人の設定。ARCHITECTURE の 8 章)。
// プレビューは、メールの幅に合わせた幅にし、余りは選んだ部品のペインに回す(AI の入力欄と案を置くため。v2 で、プレビューを残りの幅から固定の幅に改めた)
const WIDTH_KEY = 'simpleCard.paneWidths.v2'
const PRODUCTS_KEY = 'simpleCard.productsOpen'
const RAIL_W = 32
type Widths = { mobile: number; pc: number; list: number; comm: number }
const DEFAULT_WIDTHS: Widths = { mobile: 470, pc: 760, list: 300, comm: 320 }
// コミュニケーションのペインの開閉(既定は畳む。自分宛てのものがあれば、開いたときに広げる)
const COMM_KEY = 'simpleCard.commOpen'
// PLAN(配信カード)の中の見せ方: 直す(AI の下書きを直す・承認者とのやり取り)/ 渡す(制作に渡すもの)。
// 制作・結果は、上の段の帯(PLAN › PRODUCTION › RESULTS)の側で、別のページに移る
type Stage = 'plan' | 'handoff'
const clampPreview = (v: number) => Math.min(1200, Math.max(360, v))
const clampList = (v: number) => Math.min(640, Math.max(240, v))
// 目印の出し分け(人の設定)。学びは帯で場所を取るので、既定は隠す(隠していても、AI の依頼には渡す)
const MARKS_KEY = 'simpleCard.marks'
type MarkKind = 'unchecked' | 'alert' | 'learn'
const DEFAULT_MARKS: MarkKind[] = ['unchecked', 'alert']

const useStyles = makeStyles({
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  // 上の帯: 配信名・配信日時・チャネル・ステータス と、次にやること・⋯
  top: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '10px 12px 10px 20px', minWidth: 0 },
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
    gridTemplateColumns: 'var(--wv) 1px minmax(320px, 1fr) 1px var(--wl) 1px var(--wc)',
    gridTemplateRows: 'minmax(0, 1fr)',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    overflow: 'hidden',
  },
  pane: { minHeight: 0, overflow: 'auto', padding: '12px 14px', backgroundColor: tokens.colorNeutralBackground1 },
  previewPane: { display: 'grid', gridTemplateRows: 'auto auto auto auto minmax(0, 1fr)', rowGap: '6px', minHeight: 0, minWidth: 0, padding: '8px 12px 10px', backgroundColor: tokens.colorNeutralBackground2 },
  toolbar: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  deviceBtn: { minWidth: 'auto', height: '24px', padding: '0 8px', fontWeight: tokens.fontWeightRegular },
  // 受信箱の 1 行(差出人・件名・プリヘッダー)。プレビューに写らないものを押して直せるように
  inbox: { display: 'flex', alignItems: 'center', columnGap: '10px', padding: '6px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, border: `1px solid ${tokens.colorNeutralStroke2}`, minWidth: 0 },
  sender: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200, flexShrink: 0 },
  inboxPart: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '2px 6px', borderRadius: tokens.borderRadiusSmall, border: '1px solid transparent', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase300, cursor: 'pointer', textAlign: 'left', color: tokens.colorNeutralForeground1, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  inboxSub: { color: tokens.colorNeutralForeground3, flexShrink: 1 },
  // プレビューの枠。ピン・印と同じく、重ねる層の基準にする(position: relative)。押したら Tab・Esc が効くよう、フォーカスを受け取る
  boxWrap: { position: 'relative', minHeight: 0, display: 'grid' },
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
  commRail: { border: 'none', fontFamily: 'inherit', cursor: 'pointer', color: tokens.colorNeutralForeground2, ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover } },
  railIcon: { color: tokens.colorBrandForeground1, fontSize: '16px' },
  railCount: { display: 'grid', justifyItems: 'center', fontSize: tokens.fontSizeBase100, color: tokens.colorNeutralForeground2 },
  railMine: { width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tokens.colorPaletteRedBackground3 },
  commPane: { display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', minHeight: 0, backgroundColor: tokens.colorNeutralBackground1 },
  commHead: { display: 'flex', justifyContent: 'flex-end', padding: '2px 4px 0' },
  railLabel: { writingMode: 'vertical-rl', color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, letterSpacing: '0.1em' },
  railDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, border: 'none', padding: 0, cursor: 'pointer' },
  listHead: { display: 'flex', justifyContent: 'flex-end', marginBottom: '-6px' },
  candHead: { marginTop: '16px', paddingBottom: '4px', fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, borderBottom: `1px solid ${tokens.colorNeutralStroke1}` },
  candRow: { display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr)', columnGap: '8px', alignItems: 'center', width: '100%', padding: '6px 4px', border: 'none', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: 'transparent', fontFamily: 'inherit', textAlign: 'left', cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground2 } },
  candName: { fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  candMeta: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  hint: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  // PLAN の中の「直す | 渡す」(段の帯の PLAN の札のすぐ右)
  stages: { display: 'inline-flex', alignItems: 'center', columnGap: '2px', flexShrink: 0, marginLeft: '2px', padding: '2px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  stageBtn: { border: 'none', padding: '3px 10px', borderRadius: '999px', backgroundColor: 'transparent', fontFamily: 'inherit', fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3, cursor: 'pointer', whiteSpace: 'nowrap', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover, color: tokens.colorNeutralForeground1 } },
  stageOn: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
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
  // 段階(2026-10-22 利用者と決めた): 企画(AI の下書きを直す・承認者とのやり取り)→ 渡す(制作に渡すもの)→ 制作(渡したあと)。
  // 承認されたら「渡す」に切り替えるが、承認の前でも、いつでも切り替えられる(人がいない・先に進めたいときがあるため)
  const [stage, setStage] = useState<Stage>(() => (statusRank(e.card.status) >= statusRank('approved') ? 'handoff' : 'plan'))
  const stageChosen = useRef(false)
  const chooseStage = (v: Stage) => {
    stageChosen.current = true
    setStage(v)
  }
  // 制作に依頼してあれば、開いたときは「渡す」(渡したものを読むだけで見せる)
  useEffect(() => {
    let alive = true
    void ProductionRequestsService.getAll({ filter: `delivery_card_id eq '${e.card.id}'` }).then((r) => {
      if (!alive || !r.success || stageChosen.current) return
      const latest = [...(r.data ?? [])].sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0))[0]
      if (latest && ['requested', 'in_progress', 'done', 'checked', 'sent'].includes(latest.status ?? '')) setStage('handoff')
    })
    return () => {
      alive = false
    }
  }, [e.card.id])
  // 開いている間に承認されたら、「渡す」に切り替える
  const prevStatus = useRef(e.card.status)
  useEffect(() => {
    const before = prevStatus.current
    prevStatus.current = e.card.status
    if (statusRank(before) < statusRank('approved') && statusRank(e.card.status) >= statusRank('approved')) setStage('handoff')
  }, [e.card.status])
  // 商品の一覧で押した商品(選んでいる枠と見比べる)
  const [compareKey, setCompareKey] = useState<string | null>(null)
  // 部品ごとの AI とのやり取り(開いている間だけ)
  const [chats, setChats] = useState<Record<string, PartTurn[]>>({})
  const setChat = (key: string, f: (prev: PartTurn[]) => PartTurn[]) => setChats((c) => ({ ...c, [key]: f(c[key] ?? []) }))
  const [widths, setWidths] = useState<Widths>(() => {
    const v = loadPref<Partial<Widths> | null>(WIDTH_KEY, null)
    return { mobile: clampPreview(Number(v?.mobile ?? DEFAULT_WIDTHS.mobile)), pc: clampPreview(Number(v?.pc ?? DEFAULT_WIDTHS.pc)), list: clampList(Number(v?.list ?? DEFAULT_WIDTHS.list)), comm: clampList(Number(v?.comm ?? DEFAULT_WIDTHS.comm)) }
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
    if (p && stage !== 'plan') chooseStage('plan')
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
  const resizeComm = (dx: number) => setWidths((w) => ({ ...w, comm: clampList(w.comm - dx) }))
  const [commOpen, setCommOpen] = useState(() => loadPref<boolean>(COMM_KEY, false))
  const toggleComm = (v = !commOpen) => {
    setCommOpen(v)
    savePref(COMM_KEY, v)
  }
  const [counts, setCounts] = useState<{ open: number; tasks: number; mine: boolean; waiting: boolean }>({ open: 0, tasks: 0, mine: false, waiting: false })
  // 自分宛ての書き込み・承認の番があれば、開いたときに一度だけ広げる(設定は変えない)
  const autoOpened = useRef(false)
  const onCounts = useCallback((c: { open: number; tasks: number; mine: boolean; waiting: boolean }) => {
    setCounts(c)
    if (c.mine && !autoOpened.current) {
      autoOpened.current = true
      setCommOpen(true)
    }
  }, [])
  // 渡す・制作の段階では、コミュニケーションは畳んでおく(開けば使える)。企画に戻ったら、人の設定に戻す
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCommOpen(stage === 'plan' ? loadPref<boolean>(COMM_KEY, false) : false)
  }, [stage])
  const noop = useCallback(() => undefined, [])
  // プレビューの書き込みの番号を押したら、コミュニケーションを開く
  const openThreads = useCallback(() => {
    setCommOpen(true)
    savePref(COMM_KEY, true)
  }, [])
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

  const modeSwitch = (
    <span className={s.stages} role="tablist" aria-label={t('配信カードの見せ方', 'Card mode')}>
      {(
        [
          ['plan', t('直す', 'Edit'), t('AI の下書きを直し、承認者とやり取りする', 'Edit the AI draft and work with approvers')],
          ['handoff', t('渡す', 'Hand off'), t('制作に渡すもの(文章・参考の画像と URL・担当と締め切り)。承認の前でも開けます', 'What goes to production (notes, reference images and URLs, assignee and due date). Available before approval')],
        ] as const
      ).map(([v, label, hint]) => (
        <Tooltip key={v} content={hint} relationship="description">
          <button type="button" role="tab" aria-selected={stage === v} className={mergeClasses(s.stageBtn, stage === v && s.stageOn)} onClick={() => chooseStage(v)}>
            {label}
          </button>
        </Tooltip>
      ))}
    </span>
  )

  return (
    <div className={s.root}>
      <div className={s.top}>
        {/* 段の帯(PLAN › PRODUCTION › RESULTS)の PLAN の中に、「直す | 渡す」を入れる(帯を 2 本にしない。ステータスも PLAN の札に出ているので、ここには出さない) */}
        {isValidElement<{ planSlot?: ReactNode }>(e.stageNav) ? cloneElement(e.stageNav, { planSlot: modeSwitch }) : (
          <>
            {e.stageNav}
            {modeSwitch}
          </>
        )}
        <ChannelBadge channel={e.form.channel} />
        {field({ kind: 'meta', field: 'name' }, <span className={s.name}>{e.form.name || t('(配信名未入力)', '(No name)')}</span>, t('配信名を直す', 'Edit the name'), s.nameField)}
        {field({ kind: 'meta', field: 'scheduledAt' }, <span>{when}</span>, t('配信日時を直す', 'Edit the send date'))}
        <span className={s.grow} />
        {/* 反映の様子: 保存中 / 保存しました / 未反映の変更あり */}
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
          // 承認・制作への依頼は、コミュニケーションのペインで行う(承認は ⋯、引き継ぎは制作の札)。確認した・制作のページは、CardDetail の側
          onRun={(step) => (step === 'requestApproval' || step === 'watchApproval' || step === 'requestProduction' ? toggleComm(true) : onRunNext(step))}
        />
        {e.viewSwitch}
        {e.menu}
        <Button type="button" appearance="subtle" icon={<DismissRegular />} onClick={onClose} aria-label={t('閉じる', 'Close')} />
      </div>
      <div className={s.notices}>
        {e.notices}
        {/* 学びの帯は、隠していても描く(AI の依頼に学びを渡すのは、この帯の役目のため) */}
        <div style={markOn('learn') ? undefined : { display: 'none' }}>{e.learnings}</div>
      </div>

      <div className={s.panes} style={{ '--wv': `${widths[widthKey]}px`, '--wl': `${productsOpen ? widths.list : RAIL_W}px`, '--wc': `${commOpen ? widths.comm : RAIL_W}px`, ...(stage !== 'plan' ? { gridTemplateColumns: 'var(--wv) 1px minmax(320px, 1fr) 1px var(--wc)' } : {}) } as React.CSSProperties}>
        {/* プレビュー(いちばん広い) */}
        <div className={s.previewPane}>
          <div className={s.toolbar}>
            {e.channel === 'email' && (
              <span role="tablist" aria-label={t('プレビューの幅', 'Preview width')} style={{ display: 'inline-flex', columnGap: 2 }}>
                {(['mobile', 'pc'] as const).map((d) => (
                  <Button key={d} type="button" size="small" role="tab" aria-selected={e.device === d} appearance={e.device === d ? 'primary' : 'subtle'} className={s.deviceBtn} icon={d === 'mobile' ? <PhoneRegular /> : <DesktopRegular />} onClick={() => e.setDevice(d)}>
                    {d === 'mobile' ? t('スマホ', 'Mobile') : t('PC', 'Desktop')}
                  </Button>
                ))}
              </span>
            )}
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
          <div ref={boxRef} className={mergeClasses(s.box, nav.spaceDown && s.boxSpace, nav.panning && s.boxPanning)} tabIndex={0} aria-label={t('プレビュー(押した部品を直します。Tab で次の部品、Esc で選ぶのをやめる)', 'Preview (click a part to edit it; Tab for the next part, Esc to stop)')}>
            {e.preview}
            {markOn('alert') && e.alertOverlay}
            <PreviewPins boxRef={boxRef} cardId={e.card.id} view={pinView(e.channel, e.device, e.ab?.active ?? 'A')} items={e.items} placing={false} onPlacingEnd={noop} onOpenThreads={openThreads} />
            {uncheckedMarks.length + diffMarks.length > 0 && <PreviewMarks boxRef={boxRef} marks={[...uncheckedMarks, ...diffMarks]} onSelect={select} />}
            <PreviewPartPicker boxRef={boxRef} selected={part && part.kind !== 'meta' && part.kind !== 'overview' ? part : null} onSelect={onPick} disabled={e.saving} />
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

        {stage === 'plan' ? (
          <>
        {/* 選んだ部品のペイン */}
        <div className={s.pane} key={part ? partKey(part) : 'none'}>
          <PartPane editor={e} part={part} compareKey={compareKey} onPlace={(key) => part && placed(part, key)} onCompareDone={() => setCompareKey(null)} onPick={select} chats={chats} setChat={setChat} />
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

          </>
        ) : (
          // 渡す・制作: 制作に渡すもの(文章・参考の画像と URL・担当と締め切り)の 1 枚。プレビューは見本として残す
          <div className={s.pane}>
            <HandoffSheet editor={e} onCommit={onCommit} />
          </div>
        )}

        <Splitter onDrag={commOpen ? resizeComm : () => undefined} onDone={saveWidths} />

        {/* コミュニケーション(段階 d): 状態と次に動く人・1 本の流れ・書く欄 1 つ。畳むと、件数だけの帯 */}
        {commOpen ? (
          <div className={s.commPane}>
            <div className={s.commHead}>
              <Button type="button" size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={() => toggleComm(false)} aria-label={t('コミュニケーションを畳む', 'Collapse communication')} />
            </div>
            <CommPane
              card={e.card}
              part={part}
              onPick={select}
              items={e.items}
              productName={(id) => e.products.find((p) => p.id === id)?.name ?? ''}
              products={e.products}
              view={pinView(e.channel, e.device, e.ab?.active ?? 'A')}
              handoff={{ productionOwner: e.form.productionOwner, handedOffAt: e.form.handedOffAt, productionDue: e.form.productionDue }}
              onHandoff={e.setHandoff}
              remaining={e.remaining}
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
        ) : (
          <button type="button" className={mergeClasses(s.rail, s.commRail)} onClick={() => toggleComm(true)} title={t('コミュニケーションを開く', 'Open communication')}>
            <ChevronLeftRegular />
            {counts.waiting && <PersonAvailableRegular className={s.railIcon} />}
            {counts.open > 0 && (
              <span className={s.railCount}>
                <CommentRegular />
                {counts.open}
              </span>
            )}
            {counts.tasks > 0 && (
              <span className={s.railCount}>
                <TaskListSquareLtrRegular />
                {counts.tasks}
              </span>
            )}
            {counts.mine && <span className={s.railMine} />}
            <span className={s.railLabel}>{t('コミュニケーション', 'Communication')}</span>
          </button>
        )}
      </div>
    </div>
  )
}
