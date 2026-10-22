import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Checkbox, Field, Input, Popover, PopoverSurface, PopoverTrigger, Portal, Select, Slider, Tab, TabList, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, ArrowDownRegular, ArrowUpRegular, ChevronDownRegular, ChevronRightRegular, CopyRegular, DeleteRegular, SettingsRegular, SubtractRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { useT } from './i18n'
import { CELL_VIEWS, cellViewLabel, isTextView, type CellView } from './cells'
import { MAX_SECTIONS } from './layoutTemplates'
import { getUiScale } from './uiScale'
import { BOX_FIELDS, LINK_KINDS, defaultButtonLabel, linkKindLabel, type HeroKind, type BoxField, type HeroText, type LinkKind, type PartType, type Section, type TablePart } from './templates'
import * as T from './tables'

// テンプレートの編集画面の、表の部分(T8。docs/TEMPLATE_OBJECTS.md の 5.2。触れる試作で利用者と決めた形)。
// パーツ(足すだけ)・表のキャンバス(押す・なぞるで選ぶ、右クリック・行と列の帯で操作)・右の「セクションと部品」のタブを作る。
// 状態(セクションの並び)は呼ぶ側(TemplateManager の編集中の内容)が持ち、ここは選んでいるもの・ドラッグ中のものだけを持つ

/** 選んでいるもの: マスの範囲 / セクション */
type Sel = ({ kind: 'cells'; sec: string } & T.CellSel) | { kind: 'section'; sec: string } | null

/** パーツを落とす先 */
type DropTarget =
  | { kind: 'gap'; at: number }
  | { kind: 'add'; sec: string; dir: 'row' | 'col' }
  | { kind: 'first'; sec: string }
  | { kind: 'cell'; sec: string; id: string; edge?: 'top' | 'bottom' | 'left' | 'right' }

type MenuItem = { label: string; onClick: () => void; disabled?: boolean } | { header: string }

// キャンバスは、受信側のメールの見た目を写すので、メールの中だけは固定の配色にする(見取り図・プレビューと同じ)
const MAIL = { ink: '#222', sub: '#666', line: '#d8dbe0', tile: '#e3e6eb', img: '#cfd4dc', panel: '#f1f2f4', hero: { standard: '#cfd2dc', collab: '#b9a9d6', offer: '#f0a5a0' } as Record<HeroKind, string> }
const GAP = 6
const HEAD = 18
const ADD = 22
/** キャンバスの大きさ: 100% のときのメールの幅と、変えられる範囲 */
const MAIL_BASE = 600
const ZOOM_MIN = 0.5
const ZOOM_MAX = 1.6
const CANVAS_ZOOM_KEY = 'ccp.templateCanvasZoom'

const useStyles = makeStyles({
  // ---- パーツ
  pal: { display: 'grid', rowGap: '4px', alignContent: 'start' },
  palHead: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3, marginTop: '6px' },
  palItem: {
    display: 'grid',
    gridTemplateColumns: '34px minmax(0, 1fr)',
    columnGap: '8px',
    alignItems: 'center',
    padding: '5px 8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    fontSize: '12px',
    cursor: 'grab',
    userSelect: 'none',
    touchAction: 'none',
    ':hover': { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  },
  palOff: { opacity: 0.4, cursor: 'not-allowed' },
  palIcon: { display: 'grid', placeItems: 'center', height: '22px', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3 },
  rowThumb: { display: 'grid', gap: '2px', width: '30px', height: '18px' },
  hint: { fontSize: '11px', lineHeight: '16px', color: tokens.colorNeutralForeground3 },
  kbd: { fontSize: '11px', lineHeight: '18px', color: tokens.colorNeutralForeground3 },
  // ---- キャンバス
  // 大きくして列の幅を超えたら、横にスクロールする(左端が切れないように safe center)
  canvas: { minWidth: 0, display: 'grid', justifyItems: 'safe center', paddingBottom: '24px', overflowX: 'auto' },
  zoomBar: { display: 'flex', alignItems: 'center', columnGap: '2px' },
  zoomSlider: { width: '80px', minWidth: '80px' },
  zoomLabel: { width: '36px', textAlign: 'right', fontSize: '12px' },
  mail: { backgroundColor: '#fff', border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, paddingBottom: '12px', color: MAIL.ink },
  mailHead: { backgroundColor: MAIL.ink, color: '#fff', textAlign: 'center', fontSize: '11px', letterSpacing: '4px', padding: '6px 0', borderRadius: `${tokens.borderRadiusMedium} ${tokens.borderRadiusMedium} 0 0` },
  topBar: { backgroundColor: '#555', height: '10px' },
  hero: { margin: '8px 10px 0', height: '120px', display: 'grid', placeItems: 'center', fontSize: '12px', color: MAIL.ink, borderRadius: '4px', cursor: 'pointer', outline: '2px solid transparent', ':hover': { outline: `2px dashed ${tokens.colorBrandStroke1}` } },
  gap: { position: 'relative', height: '18px', display: 'grid', placeItems: 'center' },
  gapHot: { '::before': { content: '""', position: 'absolute', left: '10px', right: '10px', top: '7px', height: '4px', borderRadius: '2px', backgroundColor: tokens.colorBrandBackground } },
  gapPlus: {
    position: 'relative',
    zIndex: 1,
    width: '18px',
    height: '18px',
    padding: 0,
    borderRadius: '50%',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground3,
    fontSize: '12px',
    lineHeight: '16px',
    cursor: 'pointer',
    opacity: 0.5,
    ':hover': { opacity: 1, color: tokens.colorBrandForeground1, border: `1px solid ${tokens.colorBrandStroke1}` },
  },
  sec: { position: 'relative', margin: '0 10px', padding: '22px 0 4px', borderRadius: '4px', outline: '1px dashed transparent', ':hover': { outline: `1px dashed ${MAIL.line}` } },
  secSel: { outline: `2px solid ${tokens.colorBrandStroke1}`, ':hover': { outline: `2px solid ${tokens.colorBrandStroke1}` } },
  secMoving: { opacity: 0.4 },
  tag: {
    position: 'absolute',
    top: '2px',
    left: 0,
    fontSize: '11px',
    lineHeight: '16px',
    padding: '0 6px',
    borderRadius: tokens.borderRadiusSmall,
    border: 'none',
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorBrandForeground1,
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'grab',
    touchAction: 'none',
    maxWidth: '70%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  shead: { textAlign: 'center', padding: '2px 0 6px', display: 'grid', rowGap: '2px' },
  sheadTitle: { fontSize: '12px', fontWeight: 700, letterSpacing: '2px' },
  sheadCopy: { fontSize: '10px', color: MAIL.sub },
  first: { margin: `0 ${ADD}px 0 ${HEAD}px`, padding: '10px', border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: '4px', fontSize: '12px', color: tokens.colorNeutralForeground3, display: 'grid', rowGap: '6px', justifyItems: 'center' },
  firstHot: { border: `2px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  firstOpts: { display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'center' },
  tbl: { display: 'grid', columnGap: `${GAP}px`, rowGap: `${GAP}px`, position: 'relative' },
  colHead: { position: 'relative', fontSize: '10px', color: tokens.colorNeutralForeground4, textAlign: 'center', lineHeight: '16px', cursor: 'pointer', borderRadius: '3px', ':hover': { backgroundColor: tokens.colorNeutralBackground3 } },
  rowHead: { position: 'relative', fontSize: '10px', color: tokens.colorNeutralForeground4, display: 'grid', placeItems: 'center', cursor: 'pointer', borderRadius: '3px', ':hover': { backgroundColor: tokens.colorNeutralBackground3 } },
  headOn: { backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 },
  ins: {
    position: 'absolute',
    zIndex: 2,
    width: '14px',
    height: '14px',
    padding: 0,
    borderRadius: '50%',
    border: `1px solid ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorBrandForeground1,
    fontSize: '11px',
    lineHeight: '12px',
    cursor: 'pointer',
    opacity: 0,
    ':hover': { opacity: 1 },
  },
  cell: { position: 'relative', minWidth: 0, minHeight: 0, borderRadius: '3px', cursor: 'cell', userSelect: 'none', touchAction: 'none', display: 'grid' },
  peek: { boxShadow: `0 0 0 3px ${tokens.colorPaletteYellowBorderActive}` },
  hot: { boxShadow: `inset 0 0 0 2px ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  eTop: { boxShadow: `inset 0 4px 0 ${tokens.colorBrandBackground}` },
  eBottom: { boxShadow: `inset 0 -4px 0 ${tokens.colorBrandBackground}` },
  eLeft: { boxShadow: `inset 4px 0 0 ${tokens.colorBrandBackground}` },
  eRight: { boxShadow: `inset -4px 0 0 ${tokens.colorBrandBackground}` },
  tile: { position: 'relative', backgroundColor: MAIL.tile, borderRadius: '3px', display: 'grid', alignContent: 'end', overflow: 'hidden' },
  quickBtn: { position: 'absolute', top: '3px', right: '3px', zIndex: 2, width: '22px', height: '22px', padding: 0, display: 'grid', placeItems: 'center', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorBrandForeground1, cursor: 'pointer', fontSize: '14px' },
  quickSurface: { width: '300px', display: 'grid', rowGap: '8px' },
  quickHead: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  boxBadge: { position: 'absolute', top: '3px', left: '22px', fontSize: '9px', fontWeight: 700, lineHeight: '14px', padding: '0 5px', borderRadius: '3px', color: '#fff' },
  miniCta: { justifySelf: 'start', fontSize: '9px', padding: '1px 6px', borderRadius: '3px', backgroundColor: MAIL.ink, color: '#fff' },
  tileNo: { position: 'absolute', top: '3px', left: '3px', minWidth: '16px', height: '16px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '10px', lineHeight: '16px', textAlign: 'center' },
  cap: { backgroundColor: 'rgba(255,255,255,0.9)', padding: '3px 6px', fontSize: '10px', display: 'grid', color: MAIL.ink },
  split: { display: 'grid', gridTemplateColumns: '1fr 1fr', backgroundColor: MAIL.panel, borderRadius: '3px', overflow: 'hidden', position: 'relative' },
  splitText: { display: 'grid', alignContent: 'center', rowGap: '3px', padding: '6px', fontSize: '10px', color: MAIL.sub },
  pill: { justifySelf: 'center', alignSelf: 'center', maxWidth: '100%', minWidth: '60%', padding: '5px 12px', borderRadius: '999px', fontSize: '11px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', backgroundColor: MAIL.ink, color: '#fff' },
  pillOutline: { backgroundColor: '#fff', color: MAIL.ink, border: `1px solid ${MAIL.ink}` },
  ptext: { alignSelf: 'center', fontSize: '11px', lineHeight: 1.5, color: MAIL.sub, whiteSpace: 'pre-wrap', overflow: 'hidden', padding: '2px 4px' },
  empty: { border: `1px dashed ${MAIL.line}`, borderRadius: '3px', display: 'grid', placeItems: 'center' },
  fillBtn: { fontSize: '10px', padding: '1px 6px', border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: '10px', backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground3, cursor: 'pointer', ':hover': { color: tokens.colorBrandForeground1, border: `1px solid ${tokens.colorBrandStroke1}` } },
  editInput: { width: '100%', boxSizing: 'border-box', fontSize: '11px', fontFamily: 'inherit', border: `1px solid ${tokens.colorBrandStroke1}`, borderRadius: '3px', padding: '2px 4px', resize: 'none' },
  addCol: { display: 'grid', placeItems: 'center', fontSize: '12px', color: tokens.colorNeutralForeground4, border: `1px dashed ${tokens.colorNeutralStroke2}`, borderRadius: '3px', cursor: 'pointer', ':hover': { color: tokens.colorBrandForeground1, border: `1px dashed ${tokens.colorBrandStroke1}` } },
  addRow: { display: 'grid', placeItems: 'center', fontSize: '11px', color: tokens.colorNeutralForeground4, border: `1px dashed ${tokens.colorNeutralStroke2}`, borderRadius: '3px', cursor: 'pointer', ':hover': { color: tokens.colorBrandForeground1, border: `1px dashed ${tokens.colorBrandStroke1}` } },
  selRect: { pointerEvents: 'none', border: `2px solid ${tokens.colorBrandStroke1}`, borderRadius: '4px', backgroundColor: 'rgba(15, 108, 189, 0.08)', zIndex: 1 },
  toast: { position: 'sticky', top: 0, zIndex: 3, justifySelf: 'center', fontSize: '12px', padding: '4px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackgroundInverted, color: tokens.colorNeutralForegroundInverted, marginBottom: '6px' },
  floater: { position: 'fixed', zIndex: 1000000, pointerEvents: 'none', fontSize: '12px', padding: '3px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand, boxShadow: tokens.shadow8, whiteSpace: 'nowrap' },
  menu: { position: 'fixed', zIndex: 1000000, minWidth: '190px', padding: '4px', display: 'grid', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow16, border: `1px solid ${tokens.colorNeutralStroke2}` },
  menuHead: { fontSize: '11px', color: tokens.colorNeutralForeground3, padding: '4px 8px 2px' },
  menuItem: {
    textAlign: 'left',
    fontSize: '12px',
    padding: '5px 8px',
    border: 'none',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
    ':disabled': { color: tokens.colorNeutralForegroundDisabled, cursor: 'default', backgroundColor: 'transparent' },
  },
  // ---- 右のタブ
  tabs: { display: 'grid', rowGap: '10px', alignContent: 'start', minWidth: 0 },
  autoLink: { justifySelf: 'start', minWidth: 0, fontSize: '12px' },
  selBox: { display: 'grid', rowGap: '6px', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorBrandBackground2 },
  row2: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  scard: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, minWidth: 0 },
  scardCur: { border: `1px solid ${tokens.colorBrandStroke1}` },
  shd: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '6px 8px', cursor: 'pointer', minWidth: 0 },
  chev: { display: 'inline-flex', color: tokens.colorNeutralForeground3, cursor: 'pointer', flexShrink: 0 },
  sbadge: { fontSize: '11px', fontWeight: tokens.fontWeightSemibold, padding: '0 6px', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand, flexShrink: 0 },
  sname: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexGrow: 1 },
  smeta: { fontSize: '11px', color: tokens.colorNeutralForeground3, flexShrink: 0 },
  sbody: { display: 'grid', rowGap: '4px', padding: '0 8px 8px' },
  secFields: { display: 'grid', rowGap: '8px', padding: '6px 0 8px', borderBottom: `1px dashed ${tokens.colorNeutralStroke2}`, marginBottom: '4px' },
  pcard: { borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, borderLeftWidth: '3px', minWidth: 0 },
  pcardCur: { backgroundColor: tokens.colorBrandBackground2 },
  tBox: { borderLeftColor: tokens.colorPaletteBlueBorderActive },
  tButton: { borderLeftColor: tokens.colorNeutralForeground1 },
  tText: { borderLeftColor: tokens.colorPaletteGreenBorderActive },
  tEmpty: { borderLeftColor: tokens.colorNeutralStroke1 },
  phd: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '4px 6px', cursor: 'pointer', minWidth: 0 },
  mini: { display: 'grid', gap: '1px', width: '28px', height: '20px', flexShrink: 0 },
  miniCell: { backgroundColor: tokens.colorNeutralStroke2, borderRadius: '1px' },
  miniMe: { backgroundColor: tokens.colorBrandBackground },
  tchip: { fontSize: '10px', padding: '0 5px', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground2, flexShrink: 0 },
  pn: { fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flexGrow: 1 },
  ps: { fontSize: '11px', color: tokens.colorNeutralForeground3, flexShrink: 0 },
  pbody: { display: 'grid', rowGap: '8px', padding: '4px 8px 8px' },
  kv: { display: 'flex', justifyContent: 'space-between', columnGap: '8px', fontSize: '12px' },
  kvLabel: { color: tokens.colorNeutralForeground3 },
  pid: { fontFamily: tokens.fontFamilyMonospace, fontSize: '11px', color: tokens.colorNeutralForeground3 },
})

export interface TableEditorArgs {
  /** 編集中か(編集していないときは、キー操作を受けない) */
  active: boolean
  sections: Section[]
  /** セクションの並びを変える(元に戻すは、呼ぶ側の編集中の内容の履歴で行う) */
  setSections: (fn: (list: Section[]) => Section[]) => void
  hero: HeroKind
  heroText?: HeroText
  topBar?: boolean
  /** ヒーローを押した(右のテンプレートのタブの、全体の見た目へ) */
  onSelectHero: () => void
}

/**
 * 表の編集。パーツの列・キャンバス・右のタブ(テンプレート / セクションと部品)を返す(並べ方とスプリッターは、呼ぶ側が決める)。
 * テンプレートのタブの中身は、呼ぶ側が作って rightPane に渡す
 */
export function useTableEditor({ active, sections, setSections, hero, heroText, topBar, onSelectHero }: TableEditorArgs) {
  const t = useT()
  const s = useStyles()
  const [sel, setSel] = useState<Sel>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [drag, setDrag] = useState<{ label: string; x: number; y: number; target: DropTarget | null; section?: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [peek, setPeek] = useState<string | null>(null)
  // キャンバスの箱の ⚙ で開いている箱(見せ方をその場で直す)
  const [quickId, setQuickId] = useState<string | null>(null)
  // 右のタブ: 自分でタブを押したら固定。押していなければ、選んだものがあれば「セクションと部品」
  const [tab, setTab] = useState<'tpl' | 'obj'>('tpl')
  const [pinned, setPinned] = useState(false)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(id)
  }, [toast])

  // キャンバスの幅(メールの幅を、列の幅に合わせる)
  const [canvasW, setCanvasW] = useState(560)
  const obs = useRef<ResizeObserver | null>(null)
  const canvasRef = useCallback((el: HTMLDivElement | null) => {
    obs.current?.disconnect()
    obs.current = null
    if (!el) return
    setCanvasW(el.clientWidth)
    obs.current = new ResizeObserver(() => setCanvasW(el.clientWidth))
    obs.current.observe(el)
  }, [])
  // キャンバスの大きさ(利用者の指示で付けた。テンプレートの一覧のプレビューと同じ操作)。全体('fit')は、列の幅に合わせる。
  // CSS の zoom ではなく、メールの幅を変えて描く(マスを押す・なぞる位置がずれないように)。その人のブラウザに覚える
  const [zoom, setZoom] = useState<number | 'fit'>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(CANVAS_ZOOM_KEY) ?? 'null')
      return typeof v === 'number' && v >= ZOOM_MIN && v <= ZOOM_MAX ? v : 'fit'
    } catch {
      return 'fit'
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(CANVAS_ZOOM_KEY, JSON.stringify(zoom))
    } catch {
      // 覚えられなくても、大きさは変えられる
    }
  }, [zoom])
  const fitW = Math.max(300, Math.min(640, canvasW - 8))
  const mailW = zoom === 'fit' ? fitW : Math.round(MAIL_BASE * zoom)
  const shownZoom = mailW / MAIL_BASE
  const stepZoom = (d: number) => setZoom(Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, shownZoom + d)) * 100) / 100)
  const zoomBar = (
    <div className={s.zoomBar}>
      <Button size="small" appearance="subtle" icon={<SubtractRegular />} onClick={() => stepZoom(-0.1)} aria-label={t('縮小', 'Zoom out')} />
      <Slider size="small" className={s.zoomSlider} min={ZOOM_MIN * 100} max={ZOOM_MAX * 100} step={5} value={Math.round(shownZoom * 100)} onChange={(_, d) => setZoom(d.value / 100)} aria-label={t('キャンバスの大きさ', 'Canvas size')} />
      <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => stepZoom(0.1)} aria-label={t('拡大', 'Zoom in')} />
      <span className={s.zoomLabel}>{Math.round(shownZoom * 100)}%</span>
      <Button size="small" appearance={zoom === 'fit' ? 'primary' : 'outline'} onClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')} aria-label={zoom === 'fit' ? t('100% の大きさにする', 'Set to 100%') : t('列の幅に合わせる', 'Fit to the column')}>
        {zoom === 'fit' ? '100%' : t('全体', 'Fit')}
      </Button>
    </div>
  )

  const secOf = (id?: string) => sections.find((x) => x.id === id)
  const selSec = sel ? secOf(sel.sec) : undefined
  const selRect = sel?.kind === 'cells' && selSec ? T.rectOf(selSec, sel) : null
  const selParts = sel?.kind === 'cells' && selSec ? T.partsIn(selSec, sel) : []
  // 箱の番号(商品の載る順)は、テンプレート全体で通す
  const boxNo = new Map<string, number>()
  sections.forEach((sec) => T.boxesOf(sec).forEach((p) => boxNo.set(p.id, boxNo.size + 1)))

  const replace = (id: string, next: Section) => setSections((list) => list.map((x) => (x.id === id ? next : x)))
  /** 表の操作を行う(できなければ、理由を知らせる) */
  const run = (secId: string, op: (sec: Section) => T.TableOp) => {
    const sec = secOf(secId)
    if (!sec) return
    const res = op(sec)
    if ('error' in res) {
      if (res.error) setToast(res.error)
      return
    }
    replace(secId, res.sec)
    if (res.sel) setSel({ kind: 'cells', sec: secId, ...res.sel })
  }
  const selectCell = (secId: string, c: number, r: number) => setSel({ kind: 'cells', sec: secId, a: [c, r], b: [c, r] })

  // ---- セクション
  const addSection = (at: number) => {
    if (sections.length >= MAX_SECTIONS) {
      setToast(t(`セクションは ${MAX_SECTIONS} つまで`, `Up to ${MAX_SECTIONS} sections`))
      return
    }
    const sec = T.emptySection()
    setSections((list) => [...list.slice(0, at), sec, ...list.slice(at)])
    setSel({ kind: 'section', sec: sec.id! })
  }
  const moveSection = (id: string, to: number) => {
    setSections((list) => {
      const from = list.findIndex((x) => x.id === id)
      if (from < 0) return list
      const next = [...list]
      const [x] = next.splice(from, 1)
      next.splice(to > from ? to - 1 : to, 0, x)
      return next
    })
    setSel({ kind: 'section', sec: id })
  }
  const removeSection = (id: string) => {
    setSections((list) => list.filter((x) => x.id !== id))
    setSel(null)
    setToast(t('セクションを削除しました(Ctrl+Z で戻す)', 'Section removed (Ctrl+Z to undo)'))
  }
  const duplicate = (id: string) => {
    const sec = secOf(id)
    if (!sec) return
    if (sections.length >= MAX_SECTIONS) {
      setToast(t(`セクションは ${MAX_SECTIONS} つまで`, `Up to ${MAX_SECTIONS} sections`))
      return
    }
    const copy = T.duplicateSection(sec)
    setSections((list) => {
      const i = list.findIndex((x) => x.id === id)
      return [...list.slice(0, i + 1), copy, ...list.slice(i + 1)]
    })
    setSel({ kind: 'section', sec: copy.id! })
  }
  const mergeUp = (id: string) => {
    const i = sections.findIndex((x) => x.id === id)
    if (i <= 0) return
    const merged = T.mergeSections(sections[i - 1], sections[i])
    setSections((list) => [...list.slice(0, i - 1), merged, ...list.slice(i + 1)])
    setSel({ kind: 'section', sec: merged.id! })
    setToast(t('上のセクションとまとめました(見出しは上のもの)', 'Merged into the section above (its heading is kept)'))
  }
  const splitAt = (id: string, r: number) => {
    const sec = secOf(id)
    if (!sec) return
    if (sections.length >= MAX_SECTIONS) {
      setToast(t(`セクションは ${MAX_SECTIONS} つまで`, `Up to ${MAX_SECTIONS} sections`))
      return
    }
    const res = T.splitSection(sec, r)
    if ('error' in res) {
      setToast(res.error)
      return
    }
    setSections((list) => list.flatMap((x) => (x.id === id ? [res.top, res.bottom] : [x])))
    setSel({ kind: 'section', sec: res.bottom.id! })
  }

  // ---- マス
  const merge = () => sel?.kind === 'cells' && run(sel.sec, (sec) => T.mergeCells(sec, sel))
  const split = (ids = selParts.map((p) => p.id)) => sel && run(sel.sec, (sec) => T.splitCells(sec, ids))
  const clear = (ids = selParts.map((p) => p.id)) => {
    if (!sel || ids.length === 0) return
    const sec = secOf(sel.sec)
    if (sec) replace(sel.sec, T.clearCells(sec, ids))
  }
  const placeType = (secId: string, id: string, type: PartType) => {
    const sec = secOf(secId)
    if (!sec) return
    const old = sec.parts?.find((x) => x.id === id)
    replace(secId, T.setPartType(sec, id, type))
    if (old) selectCell(secId, old.c, old.r)
  }

  /** 左のパーツを押した・空のセクションに落とした: 選んでいるセクション(なければ最後)のいちばん下に、1 行足す */
  const addPart = (key: string, secId?: string) => {
    if (key === 'section') {
      const i = sel ? sections.findIndex((x) => x.id === sel.sec) : -1
      return addSection(i >= 0 ? i + 1 : sections.length)
    }
    let sec = secId ? secOf(secId) : sel ? secOf(sel.sec) : sections[sections.length - 1]
    let isNew = false
    if (!sec) {
      if (sections.length >= MAX_SECTIONS) return
      sec = T.emptySection()
      isNew = true
    }
    const preset = key.startsWith('row:') ? T.ROW_PRESETS.find((p) => p.id === key.slice(4)) : undefined
    const type = key as PartType
    let res: T.TableOp
    if (preset) res = T.insertPreset(sec, sec.rows ?? 0, preset)
    else if ((sec.rows ?? 0) === 0) {
      const first = T.firstRow(sec, type === 'box' ? 2 : 1)
      if ('error' in first) return
      const p0 = T.partAt(first.sec, 0, 0)!
      res = { sec: T.setPartType(first.sec, p0.id, type), sel: { a: [0, 0], b: [0, 0] } }
    } else res = T.insertRow(sec, sec.rows ?? 0, type, type === 'box' ? { c: 0, w: 1 } : undefined)
    if ('error' in res) {
      if (res.error) setToast(res.error)
      return
    }
    const next = res.sec
    setSections((list) => (isNew ? [...list, next] : list.map((x) => (x.id === next.id ? next : x))))
    if (res.sel) setSel({ kind: 'cells', sec: next.id!, ...res.sel })
  }

  /** パーツを落とした */
  const dropPart = (key: string, tg: DropTarget) => {
    if (tg.kind === 'gap') return addSection(tg.at)
    if (tg.kind === 'first') return addPart(key, tg.sec)
    const sec = secOf(tg.sec)
    if (!sec) return
    const preset = key.startsWith('row:') ? T.ROW_PRESETS.find((p) => p.id === key.slice(4)) : undefined
    const type = key as PartType
    const p = tg.kind === 'cell' ? sec.parts?.find((x) => x.id === tg.id) : undefined
    if (preset) return run(sec.id!, (x) => T.insertPreset(x, p ? (tg.kind === 'cell' && tg.edge === 'top' ? p.r : p.r + p.h) : (x.rows ?? 0), preset))
    if (tg.kind === 'add') return run(sec.id!, (x) => (tg.dir === 'row' ? T.insertRow(x, x.rows ?? 0, type, type === 'box' ? { c: 0, w: 1 } : undefined) : T.insertCol(x, x.cols ?? 1, type, type === 'box' ? { r: 0, h: 1 } : undefined)))
    if (!p) return
    if (!tg.edge) return placeType(sec.id!, p.id, type)
    if (tg.edge === 'top' || tg.edge === 'bottom') return run(sec.id!, (x) => T.insertRow(x, tg.edge === 'top' ? p.r : p.r + p.h, type, { c: p.c, w: p.w }))
    return run(sec.id!, (x) => T.insertCol(x, tg.edge === 'left' ? p.c : p.c + p.w, type, { r: p.r, h: p.h }))
  }

  // ---- ドラッグ(パーツ・セクションの札)。押したまま 5px 動いたらドラッグ、動かなければ押した扱い
  const findTarget = (x: number, y: number, key: string): DropTarget | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null
    if (!el) return null
    if (key === 'section') {
      const g = el.closest<HTMLElement>('[data-gap]')
      return g ? { kind: 'gap', at: Number(g.dataset.gap) } : null
    }
    const preset = key.startsWith('row:')
    const tbl = el.closest<HTMLElement>('[data-tbl]')
    const add = el.closest<HTMLElement>('[data-drop]')
    if (add && tbl && !(preset && add.dataset.drop === 'col')) return { kind: 'add', sec: tbl.dataset.tbl!, dir: add.dataset.drop === 'col' ? 'col' : 'row' }
    const first = el.closest<HTMLElement>('[data-first]')
    if (first) return { kind: 'first', sec: first.dataset.first! }
    const cell = el.closest<HTMLElement>('[data-cell]')
    if (!cell || !tbl) return null
    if (cell.dataset.type === 'empty' && !preset) return { kind: 'cell', sec: tbl.dataset.tbl!, id: cell.dataset.cell! }
    // 中身のあるマス: いちばん近い端の側に、行(上下)か列(左右)を差し込む。行の見本は、上下だけ
    const b = cell.getBoundingClientRect()
    const fx = (x - b.left) / b.width
    const fy = (y - b.top) / b.height
    const d = { top: fy, bottom: 1 - fy, left: fx, right: 1 - fx }
    const sides = preset ? (['top', 'bottom'] as const) : (['top', 'bottom', 'left', 'right'] as const)
    const edge = sides.reduce<(typeof sides)[number]>((m, k) => (d[k] < d[m] ? k : m), sides[0])
    return { kind: 'cell', sec: tbl.dataset.tbl!, id: cell.dataset.cell!, edge }
  }
  const startDrag = (e: React.PointerEvent, key: string, label: string, onClick: () => void, sectionId?: string) => {
    if (e.button !== 0) return
    e.preventDefault()
    const x0 = e.clientX
    const y0 = e.clientY
    let started = false
    let target: DropTarget | null = null
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return
        started = true
        setMenu(null)
      }
      target = findTarget(ev.clientX, ev.clientY, sectionId ? 'section' : key)
      // 動かすセクションのすぐ上・下の間は、動かないので外す
      if (sectionId && target?.kind === 'gap') {
        const i = sections.findIndex((x) => x.id === sectionId)
        if (target.at === i || target.at === i + 1) target = null
      }
      setDrag({ label, x: ev.clientX, y: ev.clientY, target, section: sectionId })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setDrag(null)
      if (!started) return onClick()
      if (!target) return
      if (sectionId) {
        if (target.kind === 'gap') moveSection(sectionId, target.at)
      } else dropPart(key, target)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  /** マスを押す・なぞる(Shift+押すで、範囲を広げる) */
  const startSelect = (e: React.PointerEvent, sec: Section, p: TablePart) => {
    if (e.button !== 0 || editing) return
    e.preventDefault()
    setMenu(null)
    const secId = sec.id!
    const a: [number, number] = e.shiftKey && sel?.kind === 'cells' && sel.sec === secId ? sel.a : [p.c, p.r]
    let b: [number, number] = [p.c, p.r]
    setSel({ kind: 'cells', sec: secId, a, b })
    const move = (ev: PointerEvent) => {
      const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-cell]')
      if (!el || el.closest<HTMLElement>('[data-tbl]')?.dataset.tbl !== secId) return
      const q = sec.parts?.find((x) => x.id === el.dataset.cell)
      if (!q) return
      const r = el.getBoundingClientRect()
      const nb: [number, number] = [ev.clientX > r.left + r.width / 2 ? q.c + q.w - 1 : q.c, ev.clientY > r.top + r.height / 2 ? q.r + q.h - 1 : q.r]
      if (nb[0] !== b[0] || nb[1] !== b[1]) {
        b = nb
        setSel({ kind: 'cells', sec: secId, a, b })
      }
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // ---- メニュー(行・列の帯、右クリック)。マウス・部品の位置は画面の座標なので、画面全体の拡大・縮小(html の zoom)の分を戻して置く
  const openMenu = (x: number, y: number, items: MenuItem[]) => {
    const z = getUiScale()
    setMenu({ x: x / z, y: y / z, items })
  }
  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement | null)?.closest('[data-tbl-menu]')) setMenu(null)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])
  const colMenu = (sec: Section, c: number): MenuItem[] => [
    { header: t(`列 ${c + 1}`, `Column ${c + 1}`) },
    { label: t('左に列を挿入', 'Insert column left'), onClick: () => run(sec.id!, (x) => T.insertCol(x, c)) },
    { label: t('右に列を挿入', 'Insert column right'), onClick: () => run(sec.id!, (x) => T.insertCol(x, c + 1)) },
    { label: t('左へ移動', 'Move left'), disabled: c === 0, onClick: () => run(sec.id!, (x) => T.moveCol(x, c, -1)) },
    { label: t('右へ移動', 'Move right'), disabled: c === (sec.cols ?? 1) - 1, onClick: () => run(sec.id!, (x) => T.moveCol(x, c, 1)) },
    { label: t('列を削除', 'Delete column'), onClick: () => run(sec.id!, (x) => T.deleteCol(x, c)) },
  ]
  const rowMenu = (sec: Section, r: number): MenuItem[] => [
    { header: t(`行 ${r + 1}`, `Row ${r + 1}`) },
    { label: t('上に行を挿入', 'Insert row above'), onClick: () => run(sec.id!, (x) => T.insertRow(x, r)) },
    { label: t('下に行を挿入', 'Insert row below'), onClick: () => run(sec.id!, (x) => T.insertRow(x, r + 1)) },
    { label: t('上へ移動', 'Move up'), disabled: r === 0, onClick: () => run(sec.id!, (x) => T.moveRow(x, r, -1)) },
    { label: t('下へ移動', 'Move down'), disabled: r === (sec.rows ?? 1) - 1, onClick: () => run(sec.id!, (x) => T.moveRow(x, r, 1)) },
    { label: t('この行から下を、新しいセクションに', 'Split into a new section from this row'), disabled: r === 0, onClick: () => splitAt(sec.id!, r) },
    { label: t('行を削除', 'Delete row'), onClick: () => run(sec.id!, (x) => T.deleteRow(x, r)) },
  ]
  const cellMenu = (sec: Section, ps: TablePart[], rc: T.Rect): MenuItem[] => [
    { label: t('結合(Ctrl+M)', 'Merge (Ctrl+M)'), disabled: ps.length < 2, onClick: () => run(sec.id!, (x) => T.mergeCells(x, { a: [rc.c, rc.r], b: [rc.c + rc.w - 1, rc.r + rc.h - 1] })) },
    { label: t('分割', 'Split'), disabled: !ps.some((p) => p.w * p.h > 1), onClick: () => run(sec.id!, (x) => T.splitCells(x, ps.map((p) => p.id))) },
    { label: t('空きにする(Delete)', 'Make empty (Delete)'), onClick: () => replace(sec.id!, T.clearCells(sec, ps.map((p) => p.id))) },
    { header: t('挿入', 'Insert') },
    { label: t('上に行', 'Row above'), onClick: () => run(sec.id!, (x) => T.insertRow(x, rc.r)) },
    { label: t('下に行', 'Row below'), onClick: () => run(sec.id!, (x) => T.insertRow(x, rc.r + rc.h)) },
    { label: t('左に列', 'Column left'), onClick: () => run(sec.id!, (x) => T.insertCol(x, rc.c)) },
    { label: t('右に列', 'Column right'), onClick: () => run(sec.id!, (x) => T.insertCol(x, rc.c + rc.w)) },
  ]
  const placeMenu = (sec: Section, p: TablePart): MenuItem[] => [
    { header: t('このマスに置く', 'Place in this cell') },
    { label: t('箱(商品 1 点)', 'Box (1 product)'), onClick: () => placeType(sec.id!, p.id, 'box') },
    { label: t('ボタン', 'Button'), onClick: () => placeType(sec.id!, p.id, 'button') },
    { label: t('テキスト', 'Text'), onClick: () => placeType(sec.id!, p.id, 'text') },
  ]

  // ---- 文字を、その場で直す(ダブルクリック・Enter)
  const startEdit = (p?: TablePart) => {
    if (p && (p.type === 'button' || p.type === 'text')) setEditing(p.id)
  }
  const finishEdit = (sec: Section, p: TablePart, value: string) => {
    setEditing(null)
    replace(sec.id!, T.patchPart(sec, p.id, p.type === 'button' ? { label: value.trim() || undefined } : { text: value || undefined }))
  }

  // ---- キー操作(入力欄の中では、ブラウザの操作をそのまま使う)
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape') {
        setMenu(null)
        setSel(null)
        return
      }
      if (sel?.kind === 'section') {
        const i = sections.findIndex((x) => x.id === sel.sec)
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          const d = e.key === 'ArrowUp' ? -1 : 1
          if (i + d >= 0 && i + d < sections.length) moveSection(sel.sec, d < 0 ? i - 1 : i + 2)
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          removeSection(sel.sec)
        }
        return
      }
      if (sel?.kind !== 'cells' || !selSec || !selRect) return
      if (mod && e.key.toLowerCase() === 'm') {
        e.preventDefault()
        merge()
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        clear()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        startEdit(selParts.length === 1 ? selParts[0] : undefined)
      } else {
        const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key]
        if (!d) return
        e.preventDefault()
        if (e.altKey) {
          run(sel.sec, (x) => (d[1] ? T.insertRow(x, d[1] > 0 ? selRect.r + selRect.h : selRect.r) : T.insertCol(x, d[0] > 0 ? selRect.c + selRect.w : selRect.c)))
          return
        }
        const cur = e.shiftKey ? sel.b : sel.a
        const p = T.partAt(selSec, cur[0], cur[1])
        if (!p) return
        const nx = d[0] > 0 ? p.c + p.w : d[0] < 0 ? p.c - 1 : cur[0]
        const ny = d[1] > 0 ? p.r + p.h : d[1] < 0 ? p.r - 1 : cur[1]
        if (nx < 0 || ny < 0 || nx >= (selSec.cols ?? 1) || ny >= (selSec.rows ?? 0)) return
        setSel(e.shiftKey ? { ...sel, b: [nx, ny] } : { ...sel, a: [nx, ny], b: [nx, ny] })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---- 描く
  const typeName = (type: PartType) => ({ box: t('箱', 'Box'), button: t('ボタン', 'Button'), text: t('テキスト', 'Text'), empty: t('空き', 'Empty') })[type]
  const partName = (p: TablePart) =>
    p.type === 'box' ? t(`${boxNo.get(p.id)} 番目`, `No. ${boxNo.get(p.id)}`) : p.type === 'button' ? p.label || defaultButtonLabel(0) : p.type === 'text' ? (p.text ?? '').split('\n')[0] || t('(文なし)', '(no text)') : t('余白', 'Spacer')
  const secLabel = (sec: Section, si: number) => `S${si + 1}${sec.name?.trim() ? ` · ${sec.name.trim()}` : ''}`

  const colW = (sec: Section) => (mailW - 20 - HEAD - ADD - 2 * GAP - ((sec.cols ?? 1) - 1) * GAP) / (sec.cols ?? 1)
  const rowHeights = (sec: Section) => {
    const cw = colW(sec)
    return Array.from({ length: sec.rows ?? 0 }, (_, r) => {
      const on = (sec.parts ?? []).filter((p) => r >= p.r && r < p.r + p.h)
      if (on.some((p) => p.type === 'box' && isTextView(p.view))) return Math.round(Math.max(90, Math.min(cw * 0.6, 160)))
      if (on.some((p) => p.type === 'box')) return Math.round(Math.max(64, Math.min(cw * ((sec.cols ?? 1) === 1 ? 0.5 : 0.9), 200)))
      if (on.some((p) => p.type === 'text')) return 60
      return 36
    })
  }

  const edgeClass = (id: string) => {
    const tg = drag?.target
    if (!tg || tg.kind !== 'cell' || tg.id !== id) return undefined
    return tg.edge === 'top' ? s.eTop : tg.edge === 'bottom' ? s.eBottom : tg.edge === 'left' ? s.eLeft : tg.edge === 'right' ? s.eRight : s.hot
  }

  const patch = (sec: Section, p: TablePart, x: Partial<TablePart>) => replace(sec.id!, T.patchPart(sec, p.id, x))
  /**
   * 箱の設定(見本・見せ方・出すもの・価格の見せ方・バッジ・AI への一言)。右のタブと、キャンバスの ⚙(ダブルクリック)の両方で同じものを出す。
   * 名前・価格の文言は、商品のデータから出すので、ここでは打たない
   */
  const boxSettings = (sec: Section, p: TablePart) => {
    const fields = T.boxFields(p)
    const cur = T.presetOf(p)
    const toggle = (f: BoxField, on: boolean) => patch(sec, p, { fields: BOX_FIELDS.filter((x) => (x === f ? on : fields.includes(x))) })
    return (
      <>
        <Field label={t('見本(押すと、まとめて入れる)', 'Presets (click to apply)')} size="small">
          <div className={s.row2}>
            {T.BOX_PRESETS.map((x) => (
              <Button key={x.id} size="small" appearance={cur?.id === x.id ? 'primary' : 'outline'} aria-pressed={cur?.id === x.id} onClick={() => patch(sec, p, T.presetPatch(p, x))}>
                {x.label()}
              </Button>
            ))}
          </div>
        </Field>
        <Field label={t('見せ方', 'Look')} size="small">
          <Select size="small" value={p.view ?? 'card'} onChange={(_, d) => patch(sec, p, { view: d.value === 'card' ? undefined : (d.value as CellView) })}>
            {CELL_VIEWS.map((v) => (
              <option key={v} value={v}>{cellViewLabel(v)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('出すもの(写真のほか)', 'Show (besides the photo)')} size="small">
          <div className={s.row2}>
            {BOX_FIELDS.map((f) => (
              <Checkbox key={f} label={T.boxFieldLabel(f)} checked={fields.includes(f)} onChange={(_, d) => toggle(f, d.checked === true)} />
            ))}
          </div>
        </Field>
        {fields.includes('price') && (
          <Field label={t('価格の見せ方', 'Price style')} hint={p.priceStyle === 'sale' ? t('元の価格は、商品のデータ(元の価格)から出します。ない商品は、赤い価格だけです', 'The original price comes from the product data; items without one show only the red price') : undefined} size="small">
            <Select size="small" value={p.priceStyle ?? ''} onChange={(_, d) => patch(sec, p, { priceStyle: d.value === 'sale' || d.value === 'from' ? d.value : undefined })}>
              {(['', 'sale', 'from'] as const).map((v) => (
                <option key={v} value={v}>{T.priceStyleLabel(v || undefined)}</option>
              ))}
            </Select>
          </Field>
        )}
        {fields.includes('badge') && (
          <Field label={t('バッジの文言', 'Badge text')} size="small">
            <Input size="small" value={p.badge ?? ''} placeholder="NEW" maxLength={12} onChange={(_, d) => patch(sec, p, { badge: d.value || undefined })} />
          </Field>
        )}
        <Field label={t('AI に伝える一言(この枠に、どんな商品を置くか)', 'Note for AI (what to put in this slot)')} size="small">
          <AutoTextarea rows={2} size="small" value={p.aiNote ?? ''} placeholder={t('例: 主役の新作を置く', 'e.g. The lead new arrival')} onChange={(_, d) => patch(sec, p, { aiNote: d.value || undefined })} />
        </Field>
      </>
    )
  }

  const cellBody = (sec: Section, p: TablePart) => {
    if (editing === p.id && (p.type === 'button' || p.type === 'text')) {
      const commit = (v: string) => finishEdit(sec, p, v)
      return p.type === 'button' ? (
        <input
          className={s.editInput}
          style={{ alignSelf: 'center' }}
          autoFocus
          defaultValue={p.label ?? ''}
          placeholder={defaultButtonLabel(0)}
          maxLength={30}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur()
          }}
        />
      ) : (
        <textarea
          className={s.editInput}
          autoFocus
          defaultValue={p.text ?? ''}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Escape') {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
        />
      )
    }
    if (p.type === 'box') {
      const n = boxNo.get(p.id) ?? 0
      const fields = T.boxFields(p)
      const sale = p.priceStyle === 'sale'
      // 写真のほかに出すもの(名前・価格・説明・ボタン)を、メールと同じ並びで、仮の文字で見せる
      const lines = (
        <>
          {fields.includes('name') && <span style={{ color: MAIL.ink, fontWeight: 600 }}>{t('商品名', 'Product')}</span>}
          {fields.includes('price') && (
            <span>
              {sale && <s style={{ color: MAIL.sub, marginRight: 4 }}>{t('元の価格', 'Was')}</s>}
              <span style={{ color: sale || hero === 'offer' ? '#d32f2f' : MAIL.sub, fontWeight: sale ? 700 : 400 }}>{p.priceStyle === 'from' ? t('価格〜', 'From price') : sale ? t('セール価格', 'Sale price') : t('価格', 'Price')}</span>
            </span>
          )}
          {fields.includes('desc') && <span>{t('説明', 'Description')}</span>}
          {fields.includes('button') && <span className={s.miniCta}>{t('詳細はこちら', 'View details')}</span>}
        </>
      )
      const hasText = fields.some((f) => f !== 'badge')
      const badge = fields.includes('badge') && <span className={s.boxBadge} style={{ backgroundColor: sale || /sale|限定|off/i.test(p.badge ?? '') ? '#d32f2f' : MAIL.ink }}>{p.badge?.trim() || 'NEW'}</span>
      const one = selParts.length === 1 && selParts[0].id === p.id
      // 選んだ箱の右上の ⚙: 押すと、その場で見せ方を直す(右のタブまで行かなくて済むように。ダブルクリックでも開く)
      const quick = (one || quickId === p.id) && (
        <Popover open={quickId === p.id} onOpenChange={(_, d) => setQuickId(d.open ? p.id : null)} positioning="after-top" withArrow>
          <PopoverTrigger disableButtonEnhancement>
            <button type="button" className={s.quickBtn} aria-label={t('この箱の見せ方', 'Box display settings')} title={t('この箱の見せ方(ダブルクリックでも開く)', 'Box display settings (or double-click)')} onPointerDown={(e) => e.stopPropagation()}>
              <SettingsRegular />
            </button>
          </PopoverTrigger>
          <PopoverSurface className={s.quickSurface} onPointerDown={(e) => e.stopPropagation()}>
            <span className={s.quickHead}>{t(`箱 ${n} の見せ方`, `Box ${n} display`)}</span>
            {boxSettings(sec, p)}
          </PopoverSurface>
        </Popover>
      )
      if (isTextView(p.view)) {
        const text = <div className={s.splitText}>{lines}</div>
        const img = <div style={{ backgroundColor: MAIL.img, position: 'relative' }}>{badge}</div>
        return (
          <div className={s.split}>
            {p.view === 'story' && n % 2 === 0 ? (
              <>
                {text}
                {img}
              </>
            ) : (
              <>
                {img}
                {text}
              </>
            )}
            <span className={s.tileNo}>{n}</span>
            {quick}
          </div>
        )
      }
      return (
        <div className={s.tile} style={{ backgroundColor: p.w * p.h > 1 ? MAIL.img : MAIL.tile }}>
          <span className={s.tileNo}>{n}</span>
          {badge}
          {quick}
          {hasText && <div className={s.cap}>{lines}</div>}
        </div>
      )
    }
    if (p.type === 'button') return <div className={mergeClasses(s.pill, p.style === 'outline' && s.pillOutline)} style={hero === 'offer' && p.style !== 'outline' ? { backgroundColor: '#d32f2f' } : undefined}>{p.label || defaultButtonLabel(0)}</div>
    if (p.type === 'text') return <div className={s.ptext}>{p.text || t('(テキスト。ダブルクリックで書く)', '(Text — double-click to write)')}</div>
    return (
      <div className={s.empty}>
        <button
          type="button"
          className={s.fillBtn}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            selectCell(sec.id!, p.c, p.r)
            const r = e.currentTarget.getBoundingClientRect()
            openMenu(r.left, r.bottom + 2, placeMenu(sec, p))
          }}
        >
          {t('＋ 置く', '+ Place')}
        </button>
      </div>
    )
  }

  const gap = (i: number) => (
    <div data-gap={i} className={mergeClasses(s.gap, drag?.target?.kind === 'gap' && drag.target.at === i && s.gapHot)}>
      <button type="button" className={s.gapPlus} onClick={() => addSection(i)} aria-label={t('ここに空のセクションを足す', 'Add an empty section here')} title={t('ここに空のセクションを足す', 'Add an empty section here')}>
        +
      </button>
    </div>
  )

  const table = (sec: Section) => {
    const cols = sec.cols ?? 1
    const rows = sec.rows ?? 0
    const rh = rowHeights(sec)
    const mine = sel?.kind === 'cells' && sel.sec === sec.id ? selRect : null
    const fullCol = mine && mine.r === 0 && mine.h === rows
    const fullRow = mine && mine.c === 0 && mine.w === cols
    const tg = drag?.target
    return (
      <div data-tbl={sec.id} className={s.tbl} style={{ gridTemplateColumns: `${HEAD}px repeat(${cols}, minmax(0, 1fr)) ${ADD}px`, gridTemplateRows: `16px ${rh.map((h) => `${h}px`).join(' ')} ${ADD}px` }}>
        {Array.from({ length: cols }, (_, c) => (
          <div
            key={`c${c}`}
            className={mergeClasses(s.colHead, !!fullCol && c >= mine.c && c < mine.c + mine.w && s.headOn)}
            style={{ gridColumn: c + 2, gridRow: 1 }}
            title={t(`列 ${c + 1}`, `Column ${c + 1}`)}
            onClick={(e) => {
              setSel({ kind: 'cells', sec: sec.id!, a: [c, 0], b: [c, rows - 1] })
              const r = e.currentTarget.getBoundingClientRect()
              openMenu(r.left, r.bottom + 2, colMenu(sec, c))
            }}
          >
            …
            {c > 0 && (
              <button
                type="button"
                className={s.ins}
                style={{ left: -GAP / 2 - 7, top: 1 }}
                title={t('ここに列を挿入', 'Insert a column here')}
                onClick={(e) => {
                  e.stopPropagation()
                  run(sec.id!, (x) => T.insertCol(x, c))
                }}
              >
                +
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={`r${r}`}
            className={mergeClasses(s.rowHead, !!fullRow && r >= mine.r && r < mine.r + mine.h && s.headOn)}
            style={{ gridColumn: 1, gridRow: r + 2 }}
            title={t(`行 ${r + 1}`, `Row ${r + 1}`)}
            onClick={(e) => {
              setSel({ kind: 'cells', sec: sec.id!, a: [0, r], b: [cols - 1, r] })
              // 行のメニューは、行の帯の右横に出す(押した行が隠れないように)
              const b = e.currentTarget.getBoundingClientRect()
              openMenu(b.right + 4, b.top - 4, rowMenu(sec, r))
            }}
          >
            …
            {r > 0 && (
              <button
                type="button"
                className={s.ins}
                style={{ top: -GAP / 2 - 7, left: 2 }}
                title={t('ここに行を挿入', 'Insert a row here')}
                onClick={(e) => {
                  e.stopPropagation()
                  run(sec.id!, (x) => T.insertRow(x, r))
                }}
              >
                +
              </button>
            )}
          </div>
        ))}
        {(sec.parts ?? []).map((p) => (
          <div
            key={p.id}
            data-cell={p.id}
            data-type={p.type}
            className={mergeClasses(s.cell, peek === p.id && s.peek, edgeClass(p.id))}
            style={{ gridColumn: `${p.c + 2} / span ${p.w}`, gridRow: `${p.r + 2} / span ${p.h}` }}
            onPointerDown={(e) => startSelect(e, sec, p)}
            onDoubleClick={() => (p.type === 'box' ? setQuickId(p.id) : startEdit(p))}
            onContextMenu={(e) => {
              e.preventDefault()
              let ps = mine && selParts.some((x) => x.id === p.id) ? selParts : [p]
              let rc = mine && selParts.some((x) => x.id === p.id) ? mine : { c: p.c, r: p.r, w: p.w, h: p.h }
              if (ps.length === 1) {
                selectCell(sec.id!, p.c, p.r)
                ps = [p]
                rc = { c: p.c, r: p.r, w: p.w, h: p.h }
              }
              openMenu(e.clientX, e.clientY, cellMenu(sec, ps, rc))
            }}
          >
            {cellBody(sec, p)}
          </div>
        ))}
        <div
          data-drop="col"
          className={mergeClasses(s.addCol, tg?.kind === 'add' && tg.sec === sec.id && tg.dir === 'col' && s.hot)}
          style={{ gridColumn: cols + 2, gridRow: `2 / span ${Math.max(1, rows)}` }}
          title={t('列を足す', 'Add a column')}
          onClick={() => run(sec.id!, (x) => T.insertCol(x, cols))}
        >
          +
        </div>
        <div
          data-drop="row"
          className={mergeClasses(s.addRow, tg?.kind === 'add' && tg.sec === sec.id && tg.dir === 'row' && s.hot)}
          style={{ gridColumn: `2 / span ${cols}`, gridRow: rows + 2 }}
          title={t('行を足す', 'Add a row')}
          onClick={() => run(sec.id!, (x) => T.insertRow(x, rows))}
        >
          {t('+ 行を足す', '+ Add a row')}
        </div>
        {mine && <div className={s.selRect} style={{ gridColumn: `${mine.c + 2} / span ${mine.w}`, gridRow: `${mine.r + 2} / span ${mine.h}` }} />}
      </div>
    )
  }

  const canvas = (
    <div ref={canvasRef} className={s.canvas} onPointerDown={(e) => e.target === e.currentTarget && setSel(null)}>
      {toast && <div className={s.toast} role="status">{toast}</div>}
      <div className={s.mail} style={{ width: mailW }}>
        <div className={s.mailHead}>SHOP</div>
        {topBar && <div className={s.topBar} />}
        <div
          className={s.hero}
          style={{ backgroundColor: MAIL.hero[hero] }}
          onClick={() => {
            // ヒーローの設定は、テンプレートのタブにある
            setSel(null)
            setPinned(false)
            onSelectHero()
          }}
          title={t('押すと、テンプレートのタブで見た目を直せます', 'Click to edit the look in the Template tab')}>
          {t('メイン画像', 'Main image')}
          {heroText === 'below' ? t('(ヘッドラインは写真の下)', ' (headline below)') : heroText === 'overlay' ? t('(ヘッドラインを大きく重ねる)', ' (large headline overlay)') : t('(ヘッドラインを帯で重ねる)', ' (headline band)')}
        </div>
        {gap(0)}
        {sections.map((sec, si) => {
          const secSel = sel?.kind === 'section' && sel.sec === sec.id
          return (
            <Fragment key={sec.id}>
              <div
                data-sec={sec.id}
                className={mergeClasses(s.sec, secSel && s.secSel, drag?.section === sec.id && s.secMoving)}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) setSel({ kind: 'section', sec: sec.id! })
                }}
              >
                <button
                  type="button"
                  className={s.tag}
                  title={t('押して選ぶ・つかんで動かす', 'Click to select, drag to move')}
                  onPointerDown={(e) => startDrag(e, 'section', t(`${secLabel(sec, si)} を動かす`, `Move ${secLabel(sec, si)}`), () => setSel({ kind: 'section', sec: sec.id! }), sec.id)}
                >
                  ⠿ {secLabel(sec, si)}
                </button>
                {(sec.categoryHeading || sec.copy !== false) && (
                  <div className={s.shead}>
                    {sec.categoryHeading && <span className={s.sheadTitle}>{t('セクションの見出し', 'Section heading')}</span>}
                    {sec.copy !== false && <span className={s.sheadCopy}>{t('AI が配信ごとに書くコピー', 'Copy written by AI per delivery')}</span>}
                  </div>
                )}
                {(sec.rows ?? 0) === 0 ? (
                  <div data-first={sec.id} className={mergeClasses(s.first, drag?.target?.kind === 'first' && drag.target.sec === sec.id && s.firstHot)}>
                    {t('最初の行を作る(列の数を選ぶ。左のパーツを落としても作れる)', 'Create the first row (pick the number of columns, or drop a part here)')}
                    <div className={s.firstOpts}>
                      {[1, 2, 3, 4].map((n) => (
                        <Button key={n} size="small" appearance="outline" onClick={() => run(sec.id!, (x) => T.firstRow(x, n))}>
                          {t(`${n} 列`, `${n} col`)}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  table(sec)
                )}
              </div>
              {gap(si + 1)}
            </Fragment>
          )
        })}
      </div>
      {/* メニューとドラッグの札は、ダイアログの外(Portal)に置く。ダイアログの枠は、開くときの動きのために scale を持ち、その中では position: fixed が枠を基準にずれるため */}
      {drag && (
        <Portal>
        <div className={s.floater} style={{ left: drag.x / getUiScale() + 12, top: drag.y / getUiScale() + 12 }}>
          {drag.target?.kind === 'cell' && drag.target.edge
            ? t(`${drag.label} を${{ top: '上', bottom: '下', left: '左', right: '右' }[drag.target.edge]}に差し込む`, `Insert ${drag.label} ${drag.target.edge}`)
            : drag.label}
        </div>
        </Portal>
      )}
      {menu && (
        <Portal>
        <div data-tbl-menu className={s.menu} role="menu" style={{ left: Math.min(menu.x, window.innerWidth / getUiScale() - 210), top: Math.min(menu.y, window.innerHeight / getUiScale() - 280) }}>
          {menu.items.map((m, i) =>
            'header' in m ? (
              <span key={i} className={s.menuHead}>{m.header}</span>
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={s.menuItem}
                disabled={m.disabled}
                onClick={() => {
                  setMenu(null)
                  m.onClick()
                }}
              >
                {m.label}
              </button>
            ),
          )}
        </div>
        </Portal>
      )}
    </div>
  )

  // ---- パーツ(足すだけ。押すと、選んでいるセクションのいちばん下に 1 行足す)
  const icon = (k: string) => {
    if (k === 'box') return <span style={{ width: 12, height: 14, background: tokens.colorPaletteBlueBorderActive, borderRadius: 2 }} />
    if (k === 'button') return <span style={{ width: 20, height: 6, background: tokens.colorNeutralForeground1, borderRadius: 6 }} />
    if (k === 'text') return <span style={{ width: 18, height: 2, background: tokens.colorPaletteGreenBorderActive, boxShadow: `0 4px 0 ${tokens.colorPaletteGreenBorderActive}` }} />
    return <span style={{ width: 22, height: 2, background: tokens.colorNeutralForeground3 }} />
  }
  const presetThumb = (p: T.RowPreset) => (
    <span className={s.rowThumb} style={{ gridTemplateColumns: `repeat(${Math.max(1, p.cols)}, 1fr)`, gridTemplateRows: `repeat(${p.rows}, 1fr)` }}>
      {p.parts.map(([type, c, r, w = 1, h = 1], i) => (
        <span
          key={i}
          style={{
            gridColumn: `${c + 1} / span ${w || Math.max(1, p.cols)}`,
            gridRow: `${r + 1} / span ${h}`,
            borderRadius: type === 'button' ? 5 : 1,
            background: type === 'box' ? tokens.colorPaletteBlueBorderActive : type === 'button' ? tokens.colorNeutralForeground1 : tokens.colorPaletteGreenBorderActive,
            ...(type === 'button' ? { height: 5, alignSelf: 'center' } : type === 'text' ? { height: 2, alignSelf: 'center' } : {}),
          }}
        />
      ))}
    </span>
  )
  const palItem = (key: string, label: string, thumb: ReactNode) => {
    const off = key === 'section' && sections.length >= MAX_SECTIONS
    return (
      <div
        key={key}
        role="button"
        tabIndex={0}
        aria-disabled={off}
        className={mergeClasses(s.palItem, off && s.palOff)}
        title={t('空きのマスに入れる・中身のあるマスの端に落とすと、その側に差し込む・押すと、いちばん下に足す', 'Drop on an empty cell, or on the edge of a filled cell to insert beside it. Click to add at the bottom')}
        onPointerDown={(e) => !off && startDrag(e, key, label, () => addPart(key))}
        onKeyDown={(e) => {
          if (!off && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            addPart(key)
          }
        }}
      >
        <span className={s.palIcon}>{thumb}</span>
        <span>{label}</span>
      </div>
    )
  }
  const palette = (
    <div className={s.pal}>
      <span className={s.palHead} style={{ marginTop: 0 }}>{t('パーツ', 'Parts')}</span>
      {palItem('box', t('箱(商品 1 点)', 'Box (1 product)'), icon('box'))}
      {palItem('button', t('ボタン', 'Button'), icon('button'))}
      {palItem('text', t('テキスト', 'Text'), icon('text'))}
      <span className={s.palHead}>{t('よく使う行(1 行まとめて置く)', 'Common rows (place a whole row)')}</span>
      {T.ROW_PRESETS.map((p) => palItem(`row:${p.id}`, p.label(), presetThumb(p)))}
      <span className={s.palHead}>{t('セクション', 'Section')}</span>
      {palItem('section', t('空のセクション', 'Empty section'), icon('section'))}
      <span className={s.hint}>{t('空きのマスに入れる。中身のあるマスの端に落とすと、その側に差し込む。押すと、いちばん下に足す。', 'Drop on an empty cell; drop on the edge of a filled cell to insert beside it. Click to add at the bottom.')}</span>
      <span className={s.kbd}>
        {t(
          'マスを押す・なぞる(Shift+押す)で選ぶ。右クリックで結合・分割・挿入。←↑→↓ 移動・Shift+矢印 範囲・Alt+矢印 挿入(セクションを選んでいれば上下へ移動)・Ctrl+M 結合・Delete 空きに・Enter 文字を直す・Ctrl+Z 戻す',
          'Click or drag (Shift+click) to select. Right-click to merge, split or insert. Arrows move · Shift+arrows extend · Alt+arrows insert (move a selected section) · Ctrl+M merge · Delete empty · Enter edit text · Ctrl+Z undo',
        )}
      </span>
    </div>
  )

  // ---- 右のタブ: セクションと部品(セクションのカードと、部品の行。利用者の指示で「オブジェクト」から改名。中身はセクションの内容なので)
  const toggleOpen = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const mini = (sec: Section, p: TablePart) => (
    <span className={s.mini} style={{ gridTemplateColumns: `repeat(${sec.cols ?? 1}, 1fr)`, gridTemplateRows: `repeat(${Math.max(1, sec.rows ?? 1)}, 1fr)` }}>
      {(sec.parts ?? []).map((q) => (
        <i key={q.id} className={mergeClasses(s.miniCell, q.id === p.id && s.miniMe)} style={{ gridColumn: `${q.c + 1} / span ${q.w}`, gridRow: `${q.r + 1} / span ${q.h}` }} />
      ))}
    </span>
  )
  const kv = (label: string, value: ReactNode) => (
    <div className={s.kv}>
      <span className={s.kvLabel}>{label}</span>
      {value}
    </div>
  )
  const partDetail = (sec: Section, p: TablePart) => (
    <div className={s.pbody}>
      {p.type === 'box' && boxSettings(sec, p)}
      {p.type === 'button' && (
        <>
          <Field label={t('文言', 'Label')} size="small">
            <Input size="small" value={p.label ?? ''} placeholder={defaultButtonLabel(0)} maxLength={30} onChange={(_, d) => patch(sec, p, { label: d.value || undefined })} />
          </Field>
          <Field label={t('見た目', 'Style')} size="small">
            <Select size="small" value={p.style ?? 'fill'} onChange={(_, d) => patch(sec, p, { style: d.value === 'outline' ? 'outline' : undefined })}>
              <option value="fill">{t('塗り', 'Filled')}</option>
              <option value="outline">{t('枠線', 'Outline')}</option>
            </Select>
          </Field>
          <Field label={t('リンク先の種類(実際の URL は配信ごと)', 'Link kind (the actual URL is set per delivery)')} size="small">
            <Select size="small" value={p.link ?? 'campaign'} onChange={(_, d) => patch(sec, p, { link: d.value === 'campaign' ? undefined : (d.value as LinkKind) })}>
              {LINK_KINDS.map((k) => (
                <option key={k} value={k}>{linkKindLabel(k)}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('計測用の名前(クリックの集計で使う)', 'Tracking name (for click reports)')} size="small">
            <Input size="small" value={p.track ?? ''} placeholder={t('例: new_more', 'e.g. new_more')} maxLength={60} onChange={(_, d) => patch(sec, p, { track: d.value || undefined })} />
          </Field>
        </>
      )}
      {p.type === 'text' && (
        <>
          <Field label={t('固定の文', 'Fixed text')} size="small">
            <AutoTextarea rows={3} size="small" value={p.text ?? ''} onChange={(_, d) => patch(sec, p, { text: d.value || undefined })} />
          </Field>
          <Checkbox label={t('配信ごとに書き換えてよい', 'Can be rewritten per delivery')} checked={p.overridable !== false} onChange={(_, d) => patch(sec, p, { overridable: d.checked === true ? undefined : false })} />
        </>
      )}
      {p.type === 'empty' && <span className={s.hint}>{t('空きのマス。左のパーツを落とすと、そのパーツになります。メールでは何も出ない余白です。', 'An empty cell. Drop a part here to fill it. It shows as blank space in the email.')}</span>}
      {kv(t('位置 · 大きさ', 'Position · size'), <span>{t(`列 ${p.c + 1} 行 ${p.r + 1} · ${p.w} × ${p.h}`, `Col ${p.c + 1} row ${p.r + 1} · ${p.w} × ${p.h}`)}</span>)}
      {kv(t('部品 ID', 'Part ID'), <span className={s.pid}>{p.id}</span>)}
      <div className={s.row2}>
        {p.w * p.h > 1 && (
          <Button size="small" onClick={() => run(sec.id!, (x) => T.splitCells(x, [p.id]))}>
            {t('分割', 'Split')}
          </Button>
        )}
        {p.type !== 'empty' && (
          <Button size="small" onClick={() => replace(sec.id!, T.clearCells(sec, [p.id]))}>
            {t('空きにする', 'Make empty')}
          </Button>
        )}
      </div>
    </div>
  )
  const secDetail = (sec: Section, si: number) => (
    <div className={s.secFields}>
      <Field label={t('名前(キャンバスの札と構成に出る)', 'Name (shown on the canvas tag and in the outline)')} size="small">
        <Input size="small" value={sec.name ?? ''} placeholder={t('例: 新作', 'e.g. New arrivals')} maxLength={40} onChange={(_, d) => replace(sec.id!, { ...sec, name: d.value || undefined })} />
      </Field>
      <Checkbox label={t('見出しを置く(AI が配信ごとに書く)', 'Show a heading (AI writes it per delivery)')} checked={!!sec.categoryHeading} onChange={(_, d) => replace(sec.id!, { ...sec, categoryHeading: d.checked === true || undefined })} />
      <Checkbox label={t('コピーを置く(AI が配信ごとに書く)', 'Show copy (AI writes it per delivery)')} checked={sec.copy !== false} onChange={(_, d) => replace(sec.id!, { ...sec, copy: d.checked === true ? undefined : false })} />
      <Field label={t('AI の切り口のメモ(商品を選ぶ・見出しを書くときに渡す)', 'Angle for AI (used when picking products and writing headings)')} size="small">
        <AutoTextarea rows={2} size="small" value={sec.aiNote ?? ''} placeholder={t('例: セール対象を、価格の安い順に', 'e.g. Sale items, cheapest first')} onChange={(_, d) => replace(sec.id!, { ...sec, aiNote: d.value || undefined })} />
      </Field>
      {kv(t('部品 ID', 'Part ID'), <span className={s.pid}>{sec.id}</span>)}
      <div className={s.row2}>
        <Button size="small" icon={<ArrowUpRegular />} disabled={si === 0} onClick={() => moveSection(sec.id!, si - 1)}>
          {t('上へ', 'Up')}
        </Button>
        <Button size="small" icon={<ArrowDownRegular />} disabled={si === sections.length - 1} onClick={() => moveSection(sec.id!, si + 2)}>
          {t('下へ', 'Down')}
        </Button>
        <Button size="small" icon={<CopyRegular />} onClick={() => duplicate(sec.id!)}>
          {t('複製', 'Duplicate')}
        </Button>
        <Button size="small" disabled={si === 0} onClick={() => mergeUp(sec.id!)}>
          {t('上とまとめる', 'Merge up')}
        </Button>
        <Button size="small" icon={<DeleteRegular />} onClick={() => removeSection(sec.id!)}>
          {t('削除', 'Delete')}
        </Button>
      </div>
    </div>
  )
  const objects = () => {
    const selIds = new Set(selParts.map((p) => p.id))
    const one = selParts.length === 1 ? selParts[0].id : null
    return (
      <>
        {selParts.length > 1 && sel?.kind === 'cells' && (
          <div className={s.selBox}>
            <strong>{t(`${selParts.length} マスを選んでいます`, `${selParts.length} cells selected`)}</strong>
            <div className={s.row2}>
              <Button size="small" appearance="primary" onClick={merge}>
                {t('結合', 'Merge')}
              </Button>
              <Button size="small" onClick={() => clear()}>
                {t('空きにする', 'Make empty')}
              </Button>
              {selParts.some((p) => p.w * p.h > 1) && (
                <Button size="small" onClick={() => split()}>
                  {t('分割', 'Split')}
                </Button>
              )}
            </div>
          </div>
        )}
        {sections.map((sec, si) => {
          const cur = sel?.sec === sec.id
          const open = cur || openIds.has(sec.id!)
          const n = (type: PartType) => (sec.parts ?? []).filter((p) => p.type === type).length
          return (
            <div key={sec.id} className={mergeClasses(s.scard, sel?.kind === 'section' && cur && s.scardCur)}>
              <div
                className={s.shd}
                onClick={() => {
                  setSel({ kind: 'section', sec: sec.id! })
                  document.querySelector(`[data-sec="${CSS.escape(sec.id!)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                }}
              >
                <span
                  className={s.chev}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleOpen(sec.id!)
                  }}
                >
                  {open ? <ChevronDownRegular /> : <ChevronRightRegular />}
                </span>
                <span className={s.sbadge}>S{si + 1}</span>
                <span className={s.sname}>{sec.name?.trim() || t('(名前なし)', '(no name)')}</span>
                <span className={s.smeta}>{(sec.rows ?? 0) > 0 ? t(`${sec.cols}×${sec.rows} · 商品 ${n('box')}`, `${sec.cols}×${sec.rows} · ${n('box')} items`) : t('空', 'Empty')}</span>
              </div>
              {open && (
                <div className={s.sbody}>
                  {sel?.kind === 'section' && cur && secDetail(sec, si)}
                  {[...(sec.parts ?? [])]
                    .sort((a, b) => a.r - b.r || a.c - b.c)
                    .map((p) => {
                      const pOpen = p.id === one || openIds.has(p.id)
                      return (
                        <div
                          key={p.id}
                          className={mergeClasses(s.pcard, p.type === 'box' ? s.tBox : p.type === 'button' ? s.tButton : p.type === 'text' ? s.tText : s.tEmpty, selIds.has(p.id) && s.pcardCur)}
                          onMouseEnter={() => setPeek(p.id)}
                          onMouseLeave={() => setPeek(null)}
                        >
                          <div
                            className={s.phd}
                            onClick={() => {
                              selectCell(sec.id!, p.c, p.r)
                              document.querySelector(`[data-cell="${CSS.escape(p.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                            }}
                          >
                            {mini(sec, p)}
                            <span className={s.tchip}>{typeName(p.type)}</span>
                            <span className={s.pn}>{partName(p)}</span>
                            <span className={s.ps}>{p.w * p.h > 1 ? `${p.w}×${p.h}` : ''}</span>
                            <span
                              className={s.chev}
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleOpen(p.id)
                              }}
                            >
                              {pOpen ? <ChevronDownRegular /> : <ChevronRightRegular />}
                            </span>
                          </div>
                          {pOpen && partDetail(sec, p)}
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
          )
        })}
      </>
    )
  }

  const shownTab = pinned ? tab : sel ? 'obj' : 'tpl'
  /** 右のペイン: テンプレート(呼ぶ側の中身) / セクションと部品。キャンバスで選ぶと、セクションと部品に切り替わる(自分でタブを押したら、そのまま) */
  const rightPane = (templateTab: ReactNode) => (
    <div className={s.tabs}>
      <TabList
        size="small"
        selectedValue={shownTab}
        onTabSelect={(_, d) => {
          setTab(d.value as 'tpl' | 'obj')
          setPinned(true)
        }}
      >
        <Tab value="tpl">{t('テンプレート', 'Template')}</Tab>
        <Tab value="obj">{t('セクションと部品', 'Sections & parts')}</Tab>
      </TabList>
      {pinned && (
        <Button size="small" appearance="transparent" className={s.autoLink} onClick={() => setPinned(false)}>
          {t('選んだら自動でタブを切り替える', 'Switch tabs automatically when selecting')}
        </Button>
      )}
      {shownTab === 'obj' ? objects() : templateTab}
    </div>
  )

  /** 構成の一覧(テンプレートのタブ)で押した: そのセクションを選んで、キャンバスをそこへ */
  const goSection = (id: string) => {
    setSel({ kind: 'section', sec: id })
    document.querySelector(`[data-sec="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }

  return { palette, canvas, zoomBar, rightPane, goSection, clearSelection: () => setSel(null) }
}
