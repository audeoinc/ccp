import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Select,
  Slider,
  Tab,
  TabList,
  Text,
  Tooltip,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components'
import { AddRegular, ArrowDownRegular, ArrowRedoRegular, ArrowResetRegular, ArrowUndoRegular, ArrowUpRegular, ChevronDownRegular, ChevronLeftRegular, ChevronRightRegular, CopyRegular, DeleteRegular, DismissRegular, EditRegular, EyeOffRegular, EyeRegular, MailRegular, PhoneRegular, ReOrderDotsVerticalRegular, SubtractRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { locale, useT } from './i18n'
import { MAX_BUTTON_BLOCKS, MAX_BUTTON_LABEL, MAX_SECTIONS, MAX_SLOTS, deleteTemplate, fitSlots, resetBuiltin, restoreVersion, saveTemplate, setTemplateHidden } from './layoutTemplates'
import type { DeliveryCard } from './models/deliveryCards'
import { statusLabel, statusRank } from './status'
import { PartThumb, TemplateThumb } from './TemplateThumb'
import { PushThumb } from './PushThumb'
import { Splitter } from './Splitter'
import { CellEditor } from './CellEditor'
import { CELL_PRESETS, cellPreset, type CellPreset } from './cells'
import {
  DEFAULT_PUSH_TEMPLATE,
  LINK_KINDS,
  MAX_BUTTONS_PER_BLOCK,
  buttonsAt,
  defaultButtonLabel,
  gridColumns,
  linkKindLabel,
  newButtonId,
  placedButtons,
  sectionKindLabel,
  setTemplateManagerOpen,
  slotStep,
  templateIdOfCard,
  templateOptions,
  useTemplateManagerOpen,
  useTemplates,
  currentVersion,
  getTemplate,
  pastVersions,
  templateKey,
  builtinOriginal,
  type ButtonBlock,
  type ButtonSpec,
  type HeroKind,
  type HeroText,
  type TemplateChannel,
  type PushSpec,
  type LinkKind,
  type Section,
  type SectionKind,
  type TemplateLayout,
} from './templates'

/**
 * 編集中の構成は、上から順の部品(セクション・ボタン)の並びで持つ。
 * 保存するときに、セクションの並び(商品の枠の計算に使う)と、ボタンの置く位置(at)に分ける。
 * key は、並べ替えても入力欄の状態が入れ替わらないようにするための、画面だけの ID
 */
type Part = { key: string; type: 'section'; sec: Section } | { key: string; type: 'buttons'; buttons: ButtonSpec[] }

interface Draft extends Pick<TemplateLayout, 'hero' | 'heroText' | 'topBar' | 'heroLink'> {
  /** 保存済みの行の ID(新規は undefined) */
  id?: string
  name: string
  description: string
  parts: Part[]
  /** アプリのテンプレート: 通知の形(メールのテンプレートでは undefined) */
  push?: PushSpec
  /** 変更のメモ(版の履歴に残す) */
  note?: string
}

let partSeq = 0
const partKey = () => `p${++partSeq}`

/**
 * テンプレートを、部品の並びに直す。以前の形のボタン(ヒーローのボタンの数、セクションの後のボタンの数)は、
 * ここで独立したボタンの部品に置き換える(保存すると、以後は部品として持つ)
 */
function toParts(layout: TemplateLayout): Part[] {
  const blocks = placedButtons(layout)
  const at = (i: number): Part[] => buttonsAt(blocks, i, layout.sections.length).map((buttons) => ({ key: partKey(), type: 'buttons', buttons: buttons.map((x) => ({ ...x })) }))
  return [...at(0), ...layout.sections.flatMap((sec, i): Part[] => [{ key: partKey(), type: 'section', sec: { ...sec, buttons: undefined } }, ...at(i + 1)])]
}

/** 部品の並びから、保存・見取り図に使う構成を作る */
function fromParts(d: Draft): TemplateLayout {
  const sections: Section[] = []
  const buttonBlocks: ButtonBlock[] = []
  for (const p of d.parts) {
    if (p.type === 'section') sections.push(p.sec)
    else if (p.buttons.length > 0) buttonBlocks.push({ at: sections.length, buttons: p.buttons })
  }
  return { hero: d.hero, heroText: d.heroText, topBar: d.topBar, heroLink: d.heroLink, sections, buttonBlocks }
}

/**
 * 種類の選択肢。データでは、種類(kind)と、列の数(columns)・左右(flip)の組み合わせで表す。
 * 選び直したときは、その種類で 1 行(1 組)になる枠の数に合わせる(3 列なら 3 点、モザイクなら 3 点)
 */
// cells: マス目(自由に組む)。cells:見本の ID は、パレットの見本から置くとき
type SectionLayout = 'grid' | 'grid3' | 'photos' | 'photos3' | 'wide' | 'mosaic' | 'mosaicR' | 'story' | 'feature' | 'cells' | `cells:${string}`
const LAYOUTS: SectionLayout[] = ['grid', 'grid3', 'photos', 'photos3', 'wide', 'mosaic', 'mosaicR', 'story', 'feature', 'cells']
const layoutValue = (sec: Section): SectionLayout => {
  if (sec.kind === 'grid' || sec.kind === 'photos') return gridColumns(sec) === 3 ? `${sec.kind}3` : sec.kind
  if (sec.kind === 'mosaic') return sec.flip ? 'mosaicR' : 'mosaic'
  return sec.kind
}
/** 構成の形(セクションの種類・列・左右・枠の数と、ボタンの位置・数)。同じなら、見た目の設定のほかは同じテンプレート */
const shapeOf = (l: TemplateLayout) =>
  JSON.stringify([
    l.sections.map((sec) => [layoutValue(sec), sec.slots, sec.kind === 'cells' ? [sec.cols, sec.cells] : null]),
    // 標準の古い形(ヒーローの後・セクションの後のボタンの数)も、置いた位置のボタンに直してから比べる
    placedButtons(l).filter((b) => b.buttons.length > 0).map((b) => [Math.max(0, Math.min(b.at, l.sections.length)), b.buttons.length]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
  ])
/** 似ている度(0〜1): セクションの形の並びが、どれだけ同じ順に重なるか(最長共通部分列 ÷ 長いほうの数) */
const similarity = (a: TemplateLayout, b: TemplateLayout) => {
  const x = a.sections.map(layoutValue)
  const y = b.sections.map(layoutValue)
  if (x.length === 0 || y.length === 0) return 0
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[x.length][y.length] / Math.max(x.length, y.length)
}
/** 見比べるときの、キャンバスと、並べるテンプレートの幅(2 つ並べても、ダイアログに収まるように少し小さく) */
const COMPARE_WIDTH = 240
/** 編集中の列の幅(一覧・キャンバス・部品。設定の列は残り)を覚えておく所(その人のブラウザだけ) */
const EDITOR_WIDTHS_KEY = 'ccp.templateEditorWidths'
type EditorWidths = { list: number; canvas: number; palette: number }
// キャンバスは、見取り図 300px + 余白(押す・つかむ箱が小さすぎないように、一覧の見取り図より大きく)
const EDITOR_WIDTHS: EditorWidths = { list: 200, canvas: 324, palette: 200 }
const clampWidths = (w: EditorWidths): EditorWidths => ({
  list: Math.round(Math.min(400, Math.max(160, w.list))),
  canvas: Math.round(Math.min(760, Math.max(220, w.canvas))),
  palette: Math.round(Math.min(340, Math.max(160, w.palette))),
})
function loadEditorWidths(): EditorWidths {
  try {
    const v = JSON.parse(localStorage.getItem(EDITOR_WIDTHS_KEY) ?? 'null') as Partial<EditorWidths> | null
    if (v && typeof v === 'object') return clampWidths({ ...EDITOR_WIDTHS, ...v })
  } catch {
    // 読めなければ既定の幅
  }
  return EDITOR_WIDTHS
}
/** プレビュー・キャンバスの倍率(その人のブラウザに覚える)。全体('fit')は、枠の高さ(と幅)に収まる大きさ */
const ZOOM_KEY = 'ccp.templatePreviewZoom'
const ZOOM_MIN = 0.25 // キャンバスの列を広げていても、「全体」で収まるように、小さくできる
const ZOOM_MAX = 2.5
function loadZoom(): number | 'fit' {
  try {
    const v = JSON.parse(localStorage.getItem(ZOOM_KEY) ?? 'null')
    if (v === 'fit') return 'fit'
    if (typeof v === 'number' && v >= ZOOM_MIN && v <= ZOOM_MAX) return v
  } catch {
    // 読めなければ 100%
  }
  return 1
}
/** 倍率を広げたときの、一覧で見ているプレビューの最大の幅(設定の欄を押しつぶさないように) */
const PREVIEW_MAX = 560

/** 設定の列の最小の幅(ボタンの行が収まる幅)。ほかの列を広げても、これより狭くしない */
const FIELDS_MIN = 340
/** 列の間(境界 3 本 + 間隔 6 つ) */
const EDITOR_GAPS = 3 + 6 * 10
/** 編集中の左の一覧の開け閉めを覚えておく所(その人のブラウザだけ) */
const COMPARE_OPEN_KEY = 'ccp.templateCompareOpen'

/** 見本のマス目から、セクションを作る */
const cellsSection = (p: CellPreset): Section => ({ kind: 'cells', cols: p.cols, cells: p.cells.map((x) => ({ ...x })), slots: p.cells.length })
const layoutSection = (v: SectionLayout): Section => {
  switch (v) {
    case 'grid3':
      return { kind: 'grid', columns: 3, slots: 3 }
    case 'photos3':
      return { kind: 'photos', columns: 3, slots: 6 }
    case 'mosaicR':
      return { kind: 'mosaic', flip: true, slots: 3 }
    case 'cells':
      return cellsSection(CELL_PRESETS[0])
    default: {
      if (v.startsWith('cells:')) return cellsSection(cellPreset(v.slice(6)) ?? CELL_PRESETS[0])
      return { kind: v as Exclude<SectionKind, 'cells'>, slots: v === 'mosaic' ? 3 : v === 'wide' ? 1 : 2 }
    }
  }
}
const layoutPatch = (v: SectionLayout, sec: Section): Section => {
  const next = layoutSection(v)
  // 並び方だけを変える。見出し・コピーの設定は、そのまま残す
  return { ...next, categoryHeading: sec.categoryHeading, copy: sec.copy }
}

/** 構成のプレビューの幅。一覧の見取り図(84px)では、枠の数や列が読み取りにくいため、大きく描く */
const PREVIEW_WIDTH = 220

const newDraft = (): Draft => ({
  name: '',
  description: '',
  hero: 'standard',
  heroText: 'below',
  parts: [
    { key: partKey(), type: 'buttons', buttons: [{ id: newButtonId() }] },
    { key: partKey(), type: 'section', sec: { kind: 'grid', slots: 4 } },
  ],
})

const useStyles = makeStyles({
  surface: { width: '1360px', maxWidth: 'calc(96vw / var(--ui-zoom, 1))', height: 'calc(86vh / var(--ui-zoom, 1))', maxHeight: 'calc(86vh / var(--ui-zoom, 1))', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' },
  body: { display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1, padding: 0, rowGap: 0 },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '12px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  grow: { flexGrow: 1 },
  split: { flexGrow: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(360px, 520px) minmax(0, 1fr)' },
  // 一覧は 2 列。見比べやすいように、見取り図と説明を、同じ高さのカードに並べる
  list: {
    minHeight: 0,
    overflowY: 'auto',
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    padding: '12px',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
    alignContent: 'start',
    backgroundColor: tokens.colorNeutralBackground2,
  },
  fullRow: { gridColumn: '1 / -1' },
  // 使わないテンプレートの開け閉め。一覧は高さの決まったスクロールの格子で、ボタンは overflow: hidden なので、
  // 高さを決めておかないと、行がつぶれる(2026-10-21 利用者の指摘)
  inactiveToggle: { minHeight: '32px', justifyContent: 'flex-start', marginTop: '6px' },
  listHead: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  groupLabel: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, fontWeight: tokens.fontWeightSemibold, marginTop: '6px' },
  item: {
    display: 'flex',
    columnGap: '8px',
    padding: '8px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    minWidth: 0,
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  itemSelected: { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  itemText: { minWidth: 0, display: 'grid', rowGap: '2px', alignContent: 'start' },
  itemTags: { display: 'flex', alignItems: 'center', columnGap: '6px', flexWrap: 'wrap' },
  // 版の履歴・使っている配信
  history: { display: 'grid', rowGap: '4px', paddingTop: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  historyHead: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  historyRow: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '2px 6px', borderRadius: tokens.borderRadiusMedium, minWidth: 0 },
  historyOn: { backgroundColor: tokens.colorBrandBackground2 },
  historyVer: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, minWidth: '40px' },
  usedGroup: { display: 'grid', rowGap: '2px' },
  usedRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    columnGap: '10px',
    alignItems: 'center',
    textAlign: 'left',
    padding: '4px 6px',
    border: 'none',
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  usedName: { fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  usedToggle: { justifyContent: 'flex-start', minWidth: 0, minHeight: '24px', paddingLeft: 0, fontWeight: tokens.fontWeightRegular, color: tokens.colorNeutralForeground2 },
  itemName: { fontWeight: tokens.fontWeightSemibold, fontSize: tokens.fontSizeBase200, overflowWrap: 'anywhere' },
  // カードの高さをそろえるため、説明は 5 行で省略する(全文は、選ぶと右に出る)
  clamp: { display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  caption: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200, lineHeight: '16px' },
  editor: { minHeight: 0, overflowY: 'auto', padding: '16px', display: 'grid', rowGap: '14px', alignContent: 'start', minWidth: 0 },
  // プレビューの欄は、見取り図の大きさ(枠線・余白を含む)に合わせる。固定の幅だと、見取り図の右端が欠ける
  editorGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: '16px', alignItems: 'start' },
  fields: { display: 'grid', rowGap: '14px', minWidth: 0 },
  // 縦長の見取り図をスクロールしても、編集欄と並べて見られるように、上に貼り付ける
  preview: { display: 'grid', rowGap: '6px', justifyItems: 'start', position: 'sticky', top: 0 },
  // 縦長の見取り図は、それだけでスクロールできるようにする(長いテンプレートでも、編集しながら下まで見られる)
  // 高さを決めておく(倍率「全体」は、この高さに収める)。広げたときは、縦横にスクロール
  previewScroll: { height: 'calc((86vh / var(--ui-zoom, 1)) - 190px)', overflow: 'auto', paddingRight: '4px' },
  previewZoomBox: { maxWidth: `${PREVIEW_MAX + 8}px` },
  zoomTarget: { flexShrink: 0 },
  zoomBar: { display: 'flex', alignItems: 'center', columnGap: '2px' },
  zoomSlider: { width: '80px', minWidth: '80px' },
  zoomLabel: { width: '36px', textAlign: 'right', fontSize: '12px' },
  row: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'end' },
  // 部品(ヒーロー・セクション・ボタン)のカード
  card: { border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, minWidth: 0 },
  cardButtons: { backgroundColor: tokens.colorNeutralBackground2 },
  cardHead: { display: 'flex', alignItems: 'center', columnGap: '6px', padding: '4px 6px 4px 10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}`, minHeight: '32px' },
  cardTitle: { fontSize: tokens.fontSizeBase300, fontWeight: tokens.fontWeightSemibold },
  // セクションの 4 つの設定を、1 行に並べる(狭いときは折り返す)
  // マス目の編集は、設定の行の幅いっぱいに置く
  cellsField: { gridColumn: '1 / -1', order: 10 },
  foldButton: { minWidth: '20px', width: '20px', padding: 0 },
  foldSummary: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  foldAll: { display: 'flex', justifyContent: 'flex-end', columnGap: '2px', marginTop: '-4px' },
  infoBody: { padding: '10px', display: 'grid', rowGap: '10px' },
  sectionBody: { padding: '10px', display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr)', gap: '10px 12px', alignItems: 'start' },
  // Select の既定の最小幅で、隣の欄に重ならないようにする
  fill: { width: '100%', minWidth: 0 },
  heroBody: { padding: '10px', display: 'flex', flexWrap: 'wrap', gap: '10px 16px', alignItems: 'start' },
  heroSelect: { width: '180px' },
  buttonRows: { padding: '10px', display: 'grid', rowGap: '8px' },
  // 一覧を開いて見比べているときは、設定の列が狭くなるので、最小の幅を小さめにする
  buttonRow: { display: 'grid', gridTemplateColumns: '18px minmax(80px, 1fr) 76px minmax(100px, 160px) 28px', columnGap: '6px', alignItems: 'center' },
  partList: { display: 'grid', rowGap: '8px' },
  // 編集中: 2 列の大きな一覧の代わりに、一覧(閉じられる) | 部品 | キャンバス | 設定と構成の一覧 の 4 列にする。
  // 部品は、主な落とし先のキャンバスの左隣に、設定は右に置く(左から取って、中で組み、右で整える。2026-10-22 利用者の指示)
  splitEditing: { gridTemplateColumns: 'minmax(0, 1fr)' },
  listHidden: { display: 'none' },
  editor3: {
    display: 'grid',
    // 列の幅は、一覧の開け閉め・見比べで変わるので、描くときに style で決める
    gridTemplateAreas: '"list s1 palette s2 canvas s3 fields"',
    columnGap: '10px',
    alignItems: 'start',
  },
  // 拡大したとき、隣の列にはみ出さず、枠の中で横にスクロールするように(グリッドの子は、既定では中身より狭くならない)
  areaCanvas: { gridArea: 'canvas', minWidth: 0 },
  canvasScroll: { width: '100%', boxSizing: 'border-box' },
  // 境界の線は、いちばん長い列(設定)の高さまで伸ばす
  splitCell: { alignSelf: 'stretch', display: 'grid' },
  compareCol: { gridArea: 'list', position: 'sticky', top: 0, display: 'grid', rowGap: '6px', alignContent: 'start', maxHeight: 'calc((86vh / var(--ui-zoom, 1)) - 120px)', overflowY: 'auto', paddingRight: '4px' },
  compareHead: { display: 'flex', alignItems: 'flex-start', columnGap: '2px' },
  compareItem: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    columnGap: '8px',
    alignItems: 'start',
    padding: '6px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    ':hover': { border: `1px solid ${tokens.colorBrandStroke1}` },
  },
  // 閉じた一覧: 細い帯に、縦書きの「テンプレート」を残す(押せば開く)
  rail: { gridArea: 'list', position: 'sticky', top: 0 },
  railButton: { minWidth: 0, width: '32px', padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', rowGap: '6px', backgroundColor: tokens.colorNeutralBackground3 },
  railLabel: { writingMode: 'vertical-rl', fontSize: '12px', letterSpacing: '2px' },
  canvasRow: { display: 'flex', columnGap: '12px', alignItems: 'flex-start' },
  compareBox: { display: 'grid', rowGap: '4px', flexShrink: 0 },
  compareBoxHead: { display: 'flex', alignItems: 'center', columnGap: '2px', minWidth: 0 },
  compareBoxName: { flexGrow: 1, fontSize: '12px', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  sameNote: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: '12px', padding: '2px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorPaletteYellowBackground1, color: tokens.colorNeutralForeground1 },
  crumbs: { display: 'flex', alignItems: 'center', columnGap: '6px', minWidth: 0 },
  crumbLink: { minWidth: 0, padding: '0 2px', fontSize: 'inherit', fontWeight: 'inherit', color: tokens.colorBrandForeground1 },
  crumbName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  areaFields: { gridArea: 'fields' },
  paletteCol: { gridArea: 'palette', position: 'sticky', top: 0, display: 'grid', rowGap: '8px', alignContent: 'start', maxHeight: 'calc((86vh / var(--ui-zoom, 1)) - 120px)', overflowY: 'auto', paddingRight: '4px' },
  meter: { display: 'flex', flexWrap: 'wrap', gap: '4px' },
  meterItem: { fontSize: '11px', padding: '1px 6px', borderRadius: tokens.borderRadiusCircular, backgroundColor: tokens.colorNeutralBackground3, color: tokens.colorNeutralForeground2 },
  meterFull: { backgroundColor: tokens.colorPaletteDarkOrangeBackground1, color: tokens.colorPaletteDarkOrangeForeground1 },
  paletteGroup: { display: 'grid', rowGap: '4px' },
  paletteGroupHead: { fontSize: '11px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3, marginTop: '4px' },
  paletteItem: {
    display: 'grid',
    gridTemplateColumns: '60px minmax(0, 1fr)',
    columnGap: '8px',
    alignItems: 'center',
    padding: '4px 6px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'grab',
    userSelect: 'none',
    ':hover': { border: `1px solid ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  },
  paletteThumb: { display: 'grid', placeItems: 'center', padding: '2px', backgroundColor: '#fff', borderRadius: tokens.borderRadiusSmall, maxHeight: '64px', overflow: 'hidden' },
  paletteName: { fontSize: '12px', overflowWrap: 'anywhere' },
  canvasHead: { display: 'flex', alignItems: 'center', columnGap: '2px', width: '100%' },
  toast: { display: 'flex', alignItems: 'center', columnGap: '6px', fontSize: '12px', padding: '2px 8px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground3 },
  toolCount: { fontSize: '12px', minWidth: '14px', textAlign: 'center' },
  // 部品のパレット(ドラッグして構成に入れる)
  palette: { display: 'grid', rowGap: '6px', padding: '8px 10px', borderRadius: tokens.borderRadiusMedium, border: `1px dashed ${tokens.colorNeutralStroke1}`, backgroundColor: tokens.colorNeutralBackground2 },
  paletteHead: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3 },
  paletteItems: { display: 'flex', flexWrap: 'wrap', gap: '6px' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    columnGap: '4px',
    padding: '3px 10px',
    fontSize: '12px',
    borderRadius: tokens.borderRadiusCircular,
    border: `1px solid ${tokens.colorBrandStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorBrandForeground1,
    cursor: 'grab',
    userSelect: 'none',
    ':hover': { backgroundColor: tokens.colorBrandBackground2 },
  },
  chipButtons: { border: `1px solid ${tokens.colorNeutralStroke1}`, color: tokens.colorNeutralForeground2 },
  chipOff: { opacity: 0.4, cursor: 'not-allowed' },
  // 構成の部品: つかむ所・入れる位置の線・いちばん下に入れる所
  handle: { display: 'inline-flex', alignItems: 'center', cursor: 'grab', color: tokens.colorNeutralForeground3, fontSize: '16px', ':hover': { color: tokens.colorNeutralForeground1 } },
  dropWrap: { display: 'grid', rowGap: '4px', borderRadius: tokens.borderRadiusMedium },
  // プレビューの箱と同じ部品を選んでいるとき
  partSelected: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '2px' },
  dragging: { opacity: 0.45 },
  dropLine: { height: '3px', borderRadius: '2px', backgroundColor: tokens.colorBrandBackground },
  dropEnd: { minHeight: '28px', display: 'grid', placeItems: 'center', fontSize: '12px', color: tokens.colorNeutralForeground3, borderRadius: tokens.borderRadiusMedium },
  dropEndOn: { border: `1.5px dashed ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground1 },
  num: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  actions: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '10px 16px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
})

type Usage = { total: number; fixed: number; reviewing: number; draft: number; byVersion: Map<number, DeliveryCard[]> }
const emptyUsage = (): Usage => ({ total: 0, fixed: 0, reviewing: 0, draft: 0, byVersion: new Map<number, DeliveryCard[]>() })

/** 配信の一覧から、テンプレートごとの使っている数(状態ごと・版ごと)を数える */
function buildUsage(cards: DeliveryCard[]): Map<string, Usage> {
  // テンプレートの ID でまとめる(どの版を使っていても、同じテンプレートとして数える)
  const m = new Map<string, { total: number; fixed: number; reviewing: number; draft: number; byVersion: Map<number, DeliveryCard[]> }>()
  for (const c of cards) {
    const id = templateIdOfCard(c)
    const u = m.get(id) ?? { total: 0, fixed: 0, reviewing: 0, draft: 0, byVersion: new Map<number, DeliveryCard[]>() }
    u.total += 1
    const v = c.layout_version ?? currentVersion(id)
    u.byVersion.set(v, [...(u.byVersion.get(v) ?? []), c])
    const r = statusRank(c.status)
    if (r >= statusRank('approved')) u.fixed += 1
    else if (r >= statusRank('reviewing')) u.reviewing += 1
    else u.draft += 1
    m.set(id, u)
  }
  return m
}

/**
 * テンプレートの管理(一覧・新規・複製・編集・版の履歴・使っている配信・使わない(無効)・削除)。
 * テンプレートは版で持つ(配信のもとになるマスターなので): 保存するたびに新しい版になり、配信カードは、テンプレートの ID と使った版の番号を持つ。
 * 編集しても、すでにある配信は使った版の形のまま(見た目・見出し・商品の位置は変わらない)。前の版に戻すときも、新しい版として上に積む。
 * 標準も編集できる(コードの定義が版 0。上書きの行で置き換える)。使っているテンプレートは削除せず、使わない(無効)にする
 */
export function TemplateManager({ cards, country, onChanged, onOpenCard }: { cards: DeliveryCard[]; country?: string; onChanged: () => Promise<void>; onOpenCard: (id: string) => void }) {
  const open = useTemplateManagerOpen()
  useTemplates() // 登録が変わったら、一覧を描き直す
  const t = useT()
  const s = useStyles()
  // メール用 / アプリ用を、タブで分ける(配信カードは、チャネルごとに、そのチャネルのテンプレートだけを選ぶ)
  const [channel, setChannel] = useState<TemplateChannel>('email')
  // 使わない(無効)のものも出す(一覧の下にたたむ)。過去の版は出さない(詳しい欄の、版の履歴に出す)
  const options = templateOptions(channel, true)
  const [showHidden, setShowHidden] = useState(false)
  // テンプレートごとの、使っている配信の数(状態ごと・版ごと)。
  // 削除・使わない・保存の前の確かめは、すべての国の分で決める(ほかの国で使っている配信を、見落とさないように)。
  // 画面の一覧・数は、ヘッダーで選んだ国の分だけ出す(X33。国を選んでいなければ、すべて)
  const usage = useMemo(() => buildUsage(cards), [cards])
  const usageHere = useMemo(() => buildUsage(country ? cards.filter((c) => c.country === country) : cards), [cards, country])
  const hereOf = (id?: string) => (id ? usageHere.get(id) : undefined) ?? emptyUsage()
  // 使っている配信の一覧で、開いている版。いまの版も含めて、最初は閉じておく(一覧が長いと、ほかの欄が下に押し出されるため。2026-10-21 利用者の指示)
  const [openVersions, setOpenVersions] = useState<Set<number>>(new Set())
  const usageOf = (id?: string) => (id ? usage.get(id) : undefined) ?? emptyUsage()
  const usageText = (id?: string) => {
    const u = usageOf(id)
    return t(
      `${u.total} 本の配信で使っています(承認済み・確定 ${u.fixed} 本、承認待ち ${u.reviewing} 本、未起案 ${u.draft} 本)`,
      `Used by ${u.total} deliveries (approved/confirmed ${u.fixed}, awaiting approval ${u.reviewing}, not started ${u.draft})`,
    )
  }
  const [selectedId, setSelectedId] = useState<string>('standard4')
  // 詳しい欄で見ている過去の版の鍵(null は、いまの版)
  const [viewKey, setViewKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null) // 編集中(新規・複製・編集)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = options.find((o) => o.id === selectedId) ?? options[0]
  const editing = draft !== null
  // 編集中の左の一覧(ほかのテンプレートを見比べて、被りに気づけるように)。開け閉めは、その人のブラウザに覚えさせる
  const [listOpen, setListOpen] = useState(() => {
    try {
      return localStorage.getItem(COMPARE_OPEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleList = () =>
    setListOpen((v) => {
      try {
        localStorage.setItem(COMPARE_OPEN_KEY, v ? '0' : '1')
      } catch {
        // 覚えられなくても、開け閉めはできる
      }
      return !v
    })
  // キャンバスの隣に並べて見比べているテンプレート
  const [compareId, setCompareId] = useState<string | null>(null)
  // プレビュー・キャンバスの倍率。見取り図の幅を変えて大きくする(CSS の zoom ではなく幅で。箱を押す・つかむ位置がずれないように)
  const [zoom, setZoom] = useState<number | 'fit'>(loadZoom)
  const [fitZoom, setFitZoom] = useState(1)
  useEffect(() => {
    try {
      localStorage.setItem(ZOOM_KEY, JSON.stringify(zoom))
    } catch {
      // 覚えられなくても、倍率は変えられる
    }
  }, [zoom])
  const shownZoom = zoom === 'fit' ? fitZoom : zoom
  const stepZoom = (d: number) => setZoom(Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, shownZoom + d)) * 100) / 100)
  /** 倍率をかけた幅 */
  const zoomed = (base: number) => Math.round(base * shownZoom)
  // 全体: 見取り図の縦横の比を測り、枠に収まる倍率を求める(内容・列の幅・窓の大きさが変わったら、測り直す)
  const zoomBoxRef = useRef<HTMLDivElement>(null)
  const zoomBaseRef = useRef(1)
  useLayoutEffect(() => {
    const box = zoomBoxRef.current
    if (zoom !== 'fit' || !box) return
    const calc = () => {
      const el = box.querySelector<HTMLElement>('[data-zoom-target]')
      if (!el || el.offsetWidth === 0) return
      const ratio = el.offsetHeight / el.offsetWidth
      // 一覧のプレビューの枠は、中身に合わせて幅が変わるので、枠の幅ではなく上限で決める(枠の幅で決めると、測るたびに縮む)
      const maxW = el.dataset.zoomTarget === 'pair' ? (box.clientWidth - 16) / 2 : el.dataset.zoomTarget === 'grow' ? PREVIEW_MAX : box.clientWidth - 8
      // 高さには余白を残す(キャンバスの「いちばん下に入れる所」など、倍率に比例しない高さがあるため)
      const w = Math.min(maxW, (box.clientHeight - 32) / ratio)
      const z = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, w / zoomBaseRef.current))
      // 幅の丸めで値がわずかに揺れ、描き直しが続かないように、小さな差では変えない
      setFitZoom((v) => (Math.abs(v - z) < 0.01 ? v : z))
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(box)
    return () => ro.disconnect()
  }, [zoom, draft, selectedId, viewKey, compareId, listOpen]) // 列の幅が変わったときは、枠の大きさの変化(ResizeObserver)で測り直す
  /** 倍率の操作(配信カードのプレビューと同じ並び) */
  const zoomBar = () => (
    <div className={s.zoomBar}>
      <Button size="small" appearance="subtle" icon={<SubtractRegular />} onClick={() => stepZoom(-0.1)} aria-label={t('縮小', 'Zoom out')} />
      <Slider size="small" className={s.zoomSlider} min={ZOOM_MIN * 100} max={ZOOM_MAX * 100} step={5} value={Math.round(shownZoom * 100)} onChange={(_, d) => setZoom(d.value / 100)} aria-label={t('プレビューの倍率', 'Preview zoom')} />
      <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => stepZoom(0.1)} aria-label={t('拡大', 'Zoom in')} />
      <span className={s.zoomLabel}>{Math.round(shownZoom * 100)}%</span>
      {/* ボタンの文字は、押したときの動き: 全体表示の前は「全体」、全体表示のときは「100%」 */}
      <Button size="small" appearance={zoom === 'fit' ? 'primary' : 'outline'} onClick={() => setZoom(zoom === 'fit' ? 1 : 'fit')} aria-label={zoom === 'fit' ? t('100% の倍率に戻す', 'Reset to 100%') : t('全体を表示', 'Fit the whole layout')}>
        {zoom === 'fit' ? '100%' : t('全体', 'Fit')}
      </Button>
    </div>
  )

  // 列の幅。配信カードと同じく、境界(スプリッター)をつかんで変え、その人のブラウザに覚えさせる
  const [colW, setColW] = useState<EditorWidths>(loadEditorWidths)
  useEffect(() => {
    try {
      localStorage.setItem(EDITOR_WIDTHS_KEY, JSON.stringify(colW))
    } catch {
      // 覚えられなくても、幅は変えられる
    }
  }, [colW])
  // 列を並べた枠の幅。広げすぎて設定の列が押し出されないように、ほかの列の上限を、ここから決める
  const [gridW, setGridW] = useState(0)
  const gridObs = useRef<ResizeObserver | null>(null)
  // 描くたびに付け直さないように、同じ関数を使う
  const gridRef = useCallback((el: HTMLDivElement | null) => {
    gridObs.current?.disconnect()
    gridObs.current = null
    if (!el) return
    setGridW(el.clientWidth)
    gridObs.current = new ResizeObserver(() => setGridW(el.clientWidth))
    gridObs.current.observe(el)
  }, [])
  const resizeCol = (key: keyof EditorWidths, sign: 1 | -1) => (dx: number) =>
    setColW((w) => {
      const next = clampWidths({ ...w, [key]: w[key] + sign * dx })
      if (!gridW) return next
      // 広げるのは、設定の列が最小の幅を保てるところまで
      const room = gridW - EDITOR_GAPS - FIELDS_MIN - (listOpen ? next.list : 32) - next.canvas - next.palette
      return room >= 0 || sign * dx < 0 ? next : { ...next, [key]: Math.max(w[key], next[key] + room) }
    })

  const heroLabels: Record<HeroKind, string> = {
    standard: t('標準', 'Standard'),
    collab: t('コラボ', 'Collab'),
    offer: t('期間限定', 'Limited offer'),
  }
  const heroTextLabels: Record<HeroText, string> = {
    band: t('写真の下部に帯で重ねる', 'Band over the photo'),
    overlay: t('写真に大きく重ねる', 'Large over the photo'),
    below: t('写真の下に置く', 'Below the photo'),
  }
  const layoutLabel = (v: SectionLayout) =>
    v === 'cells' ? t('マス目(自由に組む)', 'Grid cells (build your own)') : v.startsWith('cells:') ? (cellPreset(v.slice(6))?.label() ?? '') : sectionKindLabel(layoutSection(v))
  const styleLabel = (b: ButtonSpec) => (b.style === 'outline' ? t('枠線', 'Outline') : t('塗り', 'Filled'))

  const close = () => {
    setTemplateManagerOpen(false)
    setDraft(null)
    setError(null)
  }

  const choose = (id: string) => {
    setViewKey(null)
    setOpenVersions(new Set())
    if (editing && !window.confirm(t('編集中の内容を破棄して、別のテンプレートを開きます。よろしいですか?', 'Discard the current edits and open another template?'))) return
    setDraft(null)
    setError(null)
    setSelectedId(id)
  }

  const startNew = () => {
    setError(null)
    setSelectedId('')
    setCompareId(null)
    setFolded(new Set()) // 開くたびに、すべて開いた形から
    setDraft(channel === 'push' ? { ...newDraft(), push: { image: true, buttons: [] } } : newDraft())
  }
  const startDuplicate = () => {
    if (!selected) return
    setError(null)
    setCompareId(null)
    setFolded(new Set()) // 開くたびに、すべて開いた形から
    setDraft({
      name: t(`${selected.label} のコピー`, `Copy of ${selected.label}`),
      description: selected.description,
      hero: selected.hero,
      heroText: selected.heroText,
      topBar: selected.topBar,
      heroLink: selected.heroLink,
      parts: toParts(selected),
      push: selected.push ? { ...selected.push, buttons: [...selected.push.buttons] } : undefined,
    })
    setSelectedId('')
  }
  // 自由な並び(free)は、決まった構成がないので、編集するものがない
  const canEdit = (o?: { id: string }) => !!o && o.id !== 'free'
  const startEdit = () => {
    setSelectedKey(null)
    if (!selected || !canEdit(selected)) return
    setError(null)
    setCompareId(null)
    setFolded(new Set()) // 開くたびに、すべて開いた形から
    setDraft({ id: selected.id, name: selected.label, description: selected.description, hero: selected.hero, heroText: selected.heroText, topBar: selected.topBar, heroLink: selected.heroLink, parts: toParts(selected), push: selected.push })
  }

  // ---- 元に戻す・やり直す。編集中の内容が変わるたびに、前の内容を残す(続けて打った文字は 0.6 秒の間をまとめて 1 つにする)
  const hist = useRef<{ past: Draft[]; future: Draft[]; prev: Draft | null; at: number; skip: boolean }>({ past: [], future: [], prev: null, at: 0, skip: false })
  const [histCount, setHistCount] = useState({ past: 0, future: 0 })
  useEffect(() => {
    const h = hist.current
    if (!draft) {
      h.past = []
      h.future = []
      h.prev = null
    } else if (h.skip) {
      h.skip = false
      h.prev = draft
    } else if (h.prev && h.prev !== draft) {
      const now = Date.now()
      if (now - h.at > 600) h.past = [...h.past.slice(-99), h.prev]
      h.at = now
      h.future = []
      h.prev = draft
    } else {
      h.prev = draft
    }
    setHistCount({ past: h.past.length, future: h.future.length })
  }, [draft])
  const undo = () => {
    const h = hist.current
    const back = h.past.pop()
    if (!back || !draft) return
    h.future.push(draft)
    h.skip = true
    setDraft(back)
  }
  const redo = () => {
    const h = hist.current
    const fwd = h.future.pop()
    if (!fwd || !draft) return
    h.past.push(draft)
    h.skip = true
    setDraft(fwd)
  }
  // 部品を消したときは、すぐ下に「元に戻す」を出す(押し間違いを、その場で取り消せるように)
  const [removedAt, setRemovedAt] = useState<number | null>(null)
  useEffect(() => {
    if (removedAt === null) return
    const id = window.setTimeout(() => setRemovedAt(null), 6000)
    return () => window.clearTimeout(id)
  }, [removedAt])

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const setParts = (fn: (parts: Part[]) => Part[]) => setDraft((d) => (d ? { ...d, parts: fn(d.parts) } : d))
  const patchSection = (key: string, p: Partial<Section>) => setParts((list) => list.map((x) => (x.key === key && x.type === 'section' ? { ...x, sec: { ...x.sec, ...p } } : x)))
  const setButtons = (key: string, fn: (buttons: ButtonSpec[]) => ButtonSpec[]) =>
    setParts((list) => list.map((x) => (x.key === key && x.type === 'buttons' ? { ...x, buttons: fn(x.buttons) } : x)))
  const patchButton = (key: string, id: string, p: Partial<ButtonSpec>) => setButtons(key, (list) => list.map((b) => (b.id === id ? { ...b, ...p } : b)))
  const movePart = (i: number, delta: number) =>
    setParts((list) => {
      const j = i + delta
      if (j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  const removePart = (key: string) => {
    setParts((list) => list.filter((x) => x.key !== key))
    setRemovedAt((n) => (n ?? 0) + 1)
  }
  /** 部品を複製して、すぐ後ろに置く(同じ形のセクションを続けて置きたいとき) */
  const duplicatePart = (key: string) =>
    setParts((list) => {
      const i = list.findIndex((x) => x.key === key)
      if (i < 0) return list
      const p = list[i]
      if (p.type === 'section' ? list.filter((x) => x.type === 'section').length >= MAX_SECTIONS : list.filter((x) => x.type === 'buttons').length >= MAX_BUTTON_BLOCKS) return list
      const copy: Part = p.type === 'section' ? { key: partKey(), type: 'section', sec: { ...p.sec } } : { key: partKey(), type: 'buttons', buttons: p.buttons.map((b) => ({ ...b, id: newButtonId() })) }
      const next = [...list]
      next.splice(i + 1, 0, copy)
      return next
    })

  // ---- ドラッグ&ドロップ: パレットの部品を構成の好きな位置に入れる・構成の部品を並べ替える。
  // つかんでいるもの(構成の部品の key か、パレットの「new:種類」)と、入れる位置(その前に入れる番号)を持つ
  const [dragKey, setDragKey] = useState<string | null>(null)
  // 選んでいる部品(プレビューの箱を押す・左のカードを押す)。プレビューの箱に枠と道具、左のカードに枠を出し、左はその位置までスクロールする
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  // 右の設定の、閉じているまとまり(info・push・hero・部品の key)。キャンバスで選んだ部品は開く
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const toggleFold = (key: string) =>
    setFolded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  /** まとまりの開け閉めのボタン(見出しの先頭に置く) */
  const foldButton = (key: string) => (
    <Button
      size="small"
      appearance="transparent"
      className={s.foldButton}
      icon={folded.has(key) ? <ChevronRightRegular /> : <ChevronDownRegular />}
      aria-expanded={!folded.has(key)}
      aria-label={folded.has(key) ? t('開く', 'Expand') : t('閉じる', 'Collapse')}
      onClick={(e) => {
        e.stopPropagation()
        toggleFold(key)
      }}
    />
  )
  const selectPart = (key: string, scroll: boolean) => {
    setSelectedKey(key)
    setFolded((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    if (scroll) window.setTimeout(() => document.getElementById(`tplpart-${key}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0)
  }
  const [dropAt, setDropAt] = useState<number | null>(null)
  const endDrag = () => {
    setDragKey(null)
    setDropAt(null)
  }
  /** パレットの部品から、構成の部品を作る */
  const newPart = (kind: SectionLayout | 'buttons'): Part =>
    kind === 'buttons' ? { key: partKey(), type: 'buttons', buttons: [{ id: newButtonId(), style: 'outline' }] } : { key: partKey(), type: 'section', sec: layoutSection(kind) }
  /** 上限(セクション 6・ボタンの部品 8)まで来ていれば、足せない */
  const canAdd = (kind: SectionLayout | 'buttons') => (kind === 'buttons' ? blockCount < MAX_BUTTON_BLOCKS : sectionCount < MAX_SECTIONS)
  const addPart = (kind: SectionLayout | 'buttons', at?: number) => {
    if (!canAdd(kind)) return
    setParts((list) => {
      const next = [...list]
      next.splice(at ?? next.length, 0, newPart(kind))
      return next
    })
  }
  /** 落とした: パレットの部品なら足し、構成の部品なら動かす */
  const drop = () => {
    const key = dragKey
    const at = dropAt
    endDrag()
    if (!key || at === null) return
    if (key.startsWith('new:')) {
      addPart(key.slice(4) as SectionLayout | 'buttons', at)
      return
    }
    setParts((list) => {
      const from = list.findIndex((x) => x.key === key)
      if (from < 0) return list
      const next = [...list]
      const [moved] = next.splice(from, 1)
      next.splice(from < at ? at - 1 : at, 0, moved)
      return next
    })
  }
  // 編集中の形と、ほかのテンプレートとの比べ(同じ構成を先に、あとは似ている順)
  const mine = draft ? fromParts(draft) : null
  const others = mine
    ? options
        .filter((o) => o.id !== draft?.id && o.id !== 'free' && !o.hidden)
        .map((o) => ({ o, same: shapeOf(o) === shapeOf(mine), score: similarity(mine, o) }))
        .sort((a, b) => Number(b.same) - Number(a.same) || b.score - a.score)
    : []
  const sameAs = others.find((x) => x.same)
  const compared = compareId ? options.find((o) => o.id === compareId) : undefined
  // キャンバスの列の幅から、見取り図の幅を決める。見比べるときは 2 つ並べるので、列を広げて半分ずつ
  const canvasRoom = gridW ? gridW - EDITOR_GAPS - FIELDS_MIN - (listOpen ? colW.list : 32) - colW.palette : Infinity
  const canvasCol = Math.max(220, Math.min(compared ? Math.max(colW.canvas, COMPARE_WIDTH * 2 + 36) : colW.canvas, canvasRoom))
  const canvasBase = compared ? Math.floor((canvasCol - 36) / 2) : canvasCol - 24
  const canvasWidth = zoomed(canvasBase)

  /** 左の列: ほかのテンプレート(押すと、キャンバスの隣に並べて見比べる)。閉じると細い帯 */
  const compareCol = () =>
    listOpen ? (
      <aside className={s.compareCol} aria-label={t('ほかのテンプレート', 'Other templates')}>
        <div className={s.compareHead}>
          <span className={s.paletteHead}>{t('ほかのテンプレート(似ている順。押すと見比べる)', 'Other templates (most similar first; click to compare)')}</span>
          <Tooltip relationship="label" content={t('一覧を閉じる', 'Close the list')}>
            <Button size="small" appearance="subtle" icon={<ChevronLeftRegular />} onClick={toggleList} />
          </Tooltip>
        </div>
        {others.map(({ o, same, score }) => (
          <div
            key={o.id}
            role="button"
            tabIndex={0}
            aria-pressed={compareId === o.id}
            className={mergeClasses(s.compareItem, compareId === o.id && s.itemSelected)}
            onClick={() => setCompareId((v) => (v === o.id ? null : o.id))}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setCompareId((v) => (v === o.id ? null : o.id))
              }
            }}
          >
            {o.push ? <PushThumb spec={o.push} width={64} /> : <TemplateThumb layout={o} maxHeight={110} />}
            <span className={s.itemText}>
              <span className={s.itemName}>{o.label}</span>
              {same ? (
                <Badge size="small" appearance="tint" color="warning">
                  {t('同じ構成', 'Same layout')}
                </Badge>
              ) : (
                score >= 0.6 && (
                  <Badge size="small" appearance="outline" color="informative">
                    {t('似ている', 'Similar')}
                  </Badge>
                )
              )}
            </span>
          </div>
        ))}
      </aside>
    ) : (
      <aside className={s.rail}>
        <Tooltip relationship="label" content={t('ほかのテンプレートを開いて見比べる', 'Open other templates to compare')}>
          <Button appearance="subtle" className={s.railButton} onClick={toggleList}>
            <ChevronRightRegular />
            <span className={s.railLabel}>{t('テンプレート', 'Templates')}</span>
          </Button>
        </Tooltip>
      </aside>
    )

  /** パレットの部品の、まとまり・説明(マウスを重ねると出す) */
  const PALETTE_GROUPS: { label: string; items: (SectionLayout | 'buttons')[] }[] = [
    { label: t('商品を並べる', 'List products'), items: ['grid', 'grid3', 'feature'] },
    { label: t('写真で見せる', 'Show photos'), items: ['photos', 'photos3', 'wide', 'mosaic', 'mosaicR'] },
    // マス目は、見本から置いて、マス目を直して自由に組む
    { label: t('マス目で組む(見本)', 'Grid cells (samples)'), items: CELL_PRESETS.map((p): SectionLayout => `cells:${p.id}`) },
    { label: t('読ませる', 'Tell a story'), items: ['story'] },
    { label: t('ボタン', 'Buttons'), items: ['buttons'] },
  ]
  const partHelp = (k: SectionLayout | 'buttons'): string =>
    k.startsWith('cells:')
      ? `${cellPreset(k.slice(6))?.help() ?? ''}${t('(置いたあと、マス目を直せます)', ' (you can edit the cells after placing it)')}`
      : ({
      grid: t('名前・価格つきで、2 列に並べる。いちばん使う形', 'Two columns with names and prices. The most common layout'),
      grid3: t('名前・価格つきで、3 列に並べる。点数を多く見せたいとき', 'Three columns with names and prices. To show more items'),
      feature: t('写真と説明を横に並べて、1 点ずつ紹介する', 'Photo and text side by side, one item at a time'),
      photos: t('写真だけを 2 列に。雰囲気で見せたいとき', 'Photos only, two columns. For mood'),
      photos3: t('写真だけを 3 列に。たくさんの色・柄を見せたいとき', 'Photos only, three columns. For many colors or patterns'),
      wide: t('全幅で 1 点ずつ大きく。主役の商品に', 'Full width, one item each. For hero products'),
      mosaic: t('大 1 点 + 小 2 点。新作を 1 点大きく見せたいとき(左が大)', 'One large + two small (large on the left). To feature one new item'),
      mosaicR: t('大 1 点 + 小 2 点(右が大)。モザイクを続けるときに左右を変える', 'One large + two small (large on the right). Alternate with the left one'),
      story: t('写真と商品の説明を、左右交互に。読ませる特集に', 'Photo and description, alternating sides. For editorial features'),
      buttons: t('ボタンを置く(1〜2 個)。セクションの間の好きな位置に', 'Place buttons (1–2) anywhere between sections'),
      cells: t('列と行を決め、マスをなぞって枠をまとめる', 'Choose columns and rows, then drag to merge cells'),
    } as Record<string, string>)[k] ?? ''
  /** 部品の列(一覧の右): 上限の目盛りと、絵つきの部品のパレット(構成・キャンバスへドラッグ。押すと、いちばん下に足す) */
  const paletteCol = () => (
    <aside className={s.paletteCol} aria-label={t('部品', 'Parts')}>
      <div className={s.meter}>
        <span className={mergeClasses(s.meterItem, sectionCount >= MAX_SECTIONS && s.meterFull)}>{t(`セクション ${sectionCount}/${MAX_SECTIONS}`, `Sections ${sectionCount}/${MAX_SECTIONS}`)}</span>
        <span className={mergeClasses(s.meterItem, blockCount >= MAX_BUTTON_BLOCKS && s.meterFull)}>{t(`ボタン ${blockCount}/${MAX_BUTTON_BLOCKS}`, `Buttons ${blockCount}/${MAX_BUTTON_BLOCKS}`)}</span>
        <span className={s.meterItem}>{t(`商品の枠 ${totalSlots} 点`, `${totalSlots} product slots`)}</span>
      </div>
      <span className={s.paletteHead}>{t('部品(キャンバスや構成へドラッグ。押すと、いちばん下に足す)', 'Parts (drag onto the canvas or the layout; click to add at the bottom)')}</span>
      {PALETTE_GROUPS.map((g) => (
        <div key={g.label} className={s.paletteGroup}>
          <span className={s.paletteGroupHead}>{g.label}</span>
          {g.items.map((k) => (
            <Tooltip key={k} relationship="description" positioning="after" content={canAdd(k) ? partHelp(k) : t('上限まで使っています', 'Limit reached')}>
              <div
                role="button"
                tabIndex={0}
                draggable={canAdd(k)}
                aria-disabled={!canAdd(k)}
                className={mergeClasses(s.paletteItem, !canAdd(k) && s.chipOff)}
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = 'copy'
                  e.dataTransfer.setData('text/plain', `new:${k}`)
                  setDragKey(`new:${k}`)
                }}
                onDragEnd={endDrag}
                onClick={() => addPart(k)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    addPart(k)
                  }
                }}
              >
                <span className={s.paletteThumb}>
                  {k === 'buttons' ? <PartThumb buttons={[{ id: 'a' }, { id: 'b', style: 'outline' }]} width={56} /> : <PartThumb sec={layoutSection(k)} width={56} />}
                </span>
                <span className={s.paletteName}>{k === 'buttons' ? t('ボタン', 'Buttons') : layoutLabel(k)}</span>
              </div>
            </Tooltip>
          ))}
        </div>
      ))}
    </aside>
  )

  /** 部品の上をドラッグしているとき: 上半分ならその前、下半分ならその後に入れる */
  const overPart = (e: DragEvent<HTMLDivElement>, i: number) => {
    if (!dragKey) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    setDropAt(e.clientY < r.top + r.height / 2 ? i : i + 1)
  }

  useEffect(() => {
    if (!draft) return
    const onKey = (e: KeyboardEvent) => {
      // 入力欄の中では、ブラウザの元に戻すなどを、そのまま使う
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return
      const mod = e.ctrlKey || e.metaKey
      const i = draft.parts.findIndex((p) => p.key === selectedKey)
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      } else if (mod && e.key.toLowerCase() === 'd' && i >= 0) {
        e.preventDefault()
        duplicatePart(draft.parts[i].key)
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && i >= 0) {
        const p = draft.parts[i]
        if (p.type === 'section' && draft.parts.filter((x) => x.type === 'section').length <= 1) return
        e.preventDefault()
        removePart(p.key)
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && i >= 0) {
        e.preventDefault()
        const d = e.key === 'ArrowUp' ? -1 : 1
        if (e.altKey) movePart(i, d)
        else if (draft.parts[i + d]) selectPart(draft.parts[i + d].key, true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const sectionCount = draft?.parts.filter((p) => p.type === 'section').length ?? 0
  const blockCount = draft?.parts.filter((p) => p.type === 'buttons').length ?? 0
  const totalSlots = (draft?.parts ?? []).reduce((n, p) => n + (p.type === 'section' ? p.sec.slots : 0), 0)
  const valid = !!draft && draft.name.trim() !== '' && (sectionCount > 0 || !!draft.push)

  /** 操作をまとめて行う(失敗したら知らせる。配信を付け替えたら、配信を読み直す) */
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!draft || !valid) return
    const used = draft.id ? usageOf(draft.id).total : 0
    const next = draft.id ? currentVersion(draft.id) + 1 : 1
    // 使っている配信があるときは、保存しても、その配信は使った版の形のままであることを知らせて、確かめる
    if (
      used > 0 &&
      !window.confirm(
        t(
          `${usageText(draft.id)}。\n\n保存すると、版 ${next} になります。これらの配信は、使った版の形のままです(見た目・見出し・商品の位置は変わりません)。これから作る配信と、テンプレートを選び直した配信から、版 ${next} になります。\n\n保存しますか?`,
          `${usageText(draft.id)}.\n\nSaving creates v${next}. These deliveries keep the version they used (look, headings and product positions stay). New deliveries, and ones that re-select this template, get v${next}.\n\nSave?`,
        ),
      )
    )
      return
    await run(async () => {
      const id = await saveTemplate({ id: draft.id, name: draft.name, description: draft.description, ...fromParts(draft), push: draft.push }, cards, draft.note ?? '')
      if (used > 0) await onChanged()
      setSelectedId(id)
      setDraft(null)
    })
  }

  /** 作成したテンプレートで、どの版もどの配信でも使っていないものだけ、削除できる(版の履歴も消す) */
  const remove = async () => {
    if (!selected || selected.builtin || editing || usageOf(selected.id).total > 0) return
    if (!window.confirm(t(`「${selected.label}」を削除します。どの版も、どの配信でも使っていません。版の履歴も消えます。よろしいですか?`, `Delete "${selected.label}"? No delivery uses any version of it. Its version history is deleted too.`))) return
    await run(async () => {
      await deleteTemplate(selected.id)
      setSelectedId(channel === 'push' ? DEFAULT_PUSH_TEMPLATE : 'standard4')
    })
  }

  /** 使わない(無効)にする・また使う(配信カードの選択肢から外すだけ。使っている配信は、そのまま) */
  const toggleHidden = async (hide: boolean) => {
    if (!selected || editing) return
    if (hide && !window.confirm(t(`「${selected.label}」を使わない(無効)にします。配信カードのテンプレートの選択肢に出なくなります。使っている配信は、そのままです。あとで「また使う」で戻せます。よろしいですか?`, `Make "${selected.label}" inactive? It will no longer be offered in delivery cards. Deliveries that use it stay as they are. You can reactivate it later.`))) return
    await run(() => setTemplateHidden(selected.id, hide))
  }

  /** 標準を最初の形に戻す(最初の形を、新しい版として保存する。使っている配信は、使った版のまま) */
  const reset = async () => {
    if (!selected?.edited || editing) return
    const used = usageOf(selected.id).total
    if (!window.confirm(t(`「${selected.label}」を、最初の形に戻します(版 ${currentVersion(selected.id) + 1} として保存)。${used > 0 ? `${usageText(selected.id)}。これらの配信は、使った版の形のままです。` : ''}よろしいですか?`, `Reset "${selected.label}" to the original (saved as v${currentVersion(selected.id) + 1})? ${used > 0 ? `${usageText(selected.id)}. They keep the version they used. ` : ''}Continue?`))) return
    await run(async () => {
      await resetBuiltin(selected.id, cards)
      if (used > 0) await onChanged()
    })
  }

  /** 前の版に戻す(その版の中身を、新しい版として保存する。履歴は消さない) */
  const restore = async (key: string, v: number) => {
    if (!selected || editing) return
    const used = usageOf(selected.id).total
    if (!window.confirm(t(`版 ${v} の形に戻します(版 ${currentVersion(selected.id) + 1} として保存)。${used > 0 ? `${usageText(selected.id)}。これらの配信は、使った版の形のままです。` : ''}よろしいですか?`, `Restore v${v} (saved as v${currentVersion(selected.id) + 1})? ${used > 0 ? `${usageText(selected.id)}. They keep the version they used. ` : ''}Continue?`))) return
    await run(async () => {
      await restoreVersion(selected.id, key, cards)
      if (used > 0) await onChanged()
      setViewKey(null)
    })
  }

  const dateText = (iso?: string) => (iso ? new Date(iso).toLocaleDateString(locale(), { year: 'numeric', month: 'numeric', day: 'numeric' }) : '')
  /** 版の履歴(新しい順)。版ごとに、保存した日・人・メモ・使っている配信の数。過去の版は「見る」「この版に戻す」 */
  const versionHistory = (id: string) => {
    const cur = currentVersion(id)
    const u = hereOf(id)
    const rows = [
      ...pastVersions(id).filter((v) => (v.version ?? 0) !== cur),
      // 標準の版 0(コードの定義)は、版の表にないので足す
      ...(builtinOriginal(id) && cur !== 0 && !pastVersions(id).some((v) => v.version === 0) ? [{ ...builtinOriginal(id)!, version: 0, note: t('最初の形(コードの定義)', 'Original (built-in)') }] : []),
    ].sort((a, b) => (b.version ?? 0) - (a.version ?? 0))
    const curRow = pastVersions(id).find((v) => v.version === cur)
    return (
      <div className={s.history}>
        <span className={s.historyHead}>{t('版の履歴', 'Version history')}</span>
        <div className={s.historyRow}>
          <span className={s.historyVer}>{t(`版 ${cur}`, `v${cur}`)}</span>
          <Badge size="small" appearance="tint" color="brand">{t('いまの版', 'Latest')}</Badge>
          <span className={s.caption}>{[dateText(curRow?.savedAt), curRow?.author, curRow?.note].filter(Boolean).join(' ・ ')}</span>
          <span className={s.grow} />
          <span className={s.caption}>{t(`${u.byVersion.get(cur)?.length ?? 0} 本`, `${u.byVersion.get(cur)?.length ?? 0} uses`)}</span>
          {viewKey && (
            <Button size="small" appearance="subtle" onClick={() => setViewKey(null)}>
              {t('見る', 'View')}
            </Button>
          )}
        </div>
        {rows.length === 0 && <span className={s.caption}>{t('過去の版はありません。', 'No earlier versions.')}</span>}
        {rows.map((v) => {
          const key = templateKey(id, v.version)
          return (
            <div key={key} className={mergeClasses(s.historyRow, viewKey === key && s.historyOn)}>
              <span className={s.historyVer}>{t(`版 ${v.version}`, `v${v.version}`)}</span>
              <span className={s.caption}>{[dateText(v.savedAt), v.author, v.note].filter(Boolean).join(' ・ ')}</span>
              <span className={s.grow} />
              <span className={s.caption}>{t(`${u.byVersion.get(v.version ?? 0)?.length ?? 0} 本`, `${u.byVersion.get(v.version ?? 0)?.length ?? 0} uses`)}</span>
              <Button size="small" appearance="subtle" onClick={() => setViewKey(viewKey === key ? null : key)}>
                {viewKey === key ? t('閉じる', 'Close') : t('見る', 'View')}
              </Button>
              <Button size="small" appearance="subtle" icon={<ArrowResetRegular />} disabled={busy || editing} onClick={() => void restore(key, v.version ?? 0)}>
                {t('この版に戻す', 'Restore')}
              </Button>
            </div>
          )
        })}
      </div>
    )
  }
  /** 使っている配信(版ごと)。ヘッダーの国の分だけ。いまの版は開き、過去の版はたたむ(押すと開く)。押すと配信カードを開く */
  const usedBy = (id: string) => {
    const u = hereOf(id)
    const all = usageOf(id).total
    if (u.total === 0 && all === 0) return null
    const cur = currentVersion(id)
    const versions = [...u.byVersion.keys()].sort((a, b) => b - a)
    return (
      <div className={s.history}>
        <span className={s.historyHead}>
          {country ? t(`使っている配信(${country}: ${u.total} 本)`, `Deliveries using it (${country}: ${u.total})`) : t(`使っている配信(${u.total} 本)`, `Deliveries using it (${u.total})`)}
        </span>
        {/* ほかの国でも使っていれば、数だけ知らせる(削除・使わないの判断は、すべての国の分で行う) */}
        {country && all > u.total && <span className={s.caption}>{t(`ほかの国でも ${all - u.total} 本で使っています(ヘッダーの国を変えると見られます)`, `Also used by ${all - u.total} in other countries (switch the country in the header to see them)`)}</span>}
        {versions.map((v) => {
          const list = [...(u.byVersion.get(v) ?? [])].sort((a, b) => (b.scheduled_at ?? '').localeCompare(a.scheduled_at ?? ''))
          const opened = openVersions.has(v)
          return (
            <div key={v} className={s.usedGroup}>
              <Button
                size="small"
                appearance="transparent"
                className={s.usedToggle}
                icon={opened ? <ChevronDownRegular /> : <ChevronRightRegular />}
                onClick={() =>
                  setOpenVersions((prev) => {
                    const next = new Set(prev)
                    if (next.has(v)) next.delete(v)
                    else next.add(v)
                    return next
                  })
                }
              >
                {v === cur ? t(`版 ${v}(いまの版)・${list.length} 本`, `v${v} (latest) · ${list.length}`) : t(`版 ${v}・${list.length} 本`, `v${v} · ${list.length}`)}
              </Button>
              {opened &&
                list.map((c) => (
                  <button key={c.id} type="button" className={s.usedRow} onClick={() => onOpenCard(c.id)}>
                    <span className={s.usedName}>{c.name}</span>
                    <span className={s.caption}>{dateText(c.scheduled_at)}</span>
                    <span className={s.caption}>{statusLabel(c.status)}</span>
                  </button>
                ))}
            </div>
          )
        })}
      </div>
    )
  }

  const customs = options.filter((o) => !o.builtin && !o.hidden)
  const builtins = options.filter((o) => o.builtin && !o.hidden)
  const hiddenList = options.filter((o) => o.hidden)

  const renderItem = (o: (typeof options)[number]) => (
    <div key={o.id} className={mergeClasses(s.item, !editing && o.id === selected?.id && s.itemSelected)} onClick={() => choose(o.id)} role="button" tabIndex={0}>
      {o.push ? <PushThumb spec={o.push} width={96} /> : <TemplateThumb layout={o} free={o.id === 'free'} maxHeight={150} zoom />}
      <div className={s.itemText}>
        <span className={s.itemName}>{o.label}</span>
        <span className={mergeClasses(s.caption, s.clamp)} title={o.description}>{o.description}</span>
        <span className={s.itemTags}>
          {o.edited && (
            <Badge size="small" appearance="tint" color="brand">
              {t('編集済み', 'Edited')}
            </Badge>
          )}
          {o.hidden && (
            <Badge size="small" appearance="outline" color="subtle">
              {t('使わない', 'Inactive')}
            </Badge>
          )}
          <span className={s.caption}>{hereOf(o.id).total > 0 ? t(`${hereOf(o.id).total} 本で使用`, `Used by ${hereOf(o.id).total}`) : t('未使用', 'Not used')}</span>
        </span>
      </div>
    </div>
  )

  /** 構成の要約(上から順に。ボタンも、置いた位置に並べる) */
  const summary = (layout: TemplateLayout) =>
    toParts(layout)
      .map((p) =>
        p.type === 'section'
          ? `${sectionKindLabel(p.sec)}${t(` ${p.sec.slots}点`, ` ×${p.sec.slots}`)}${p.sec.categoryHeading ? t('(見出し付き)', ' (heading)') : ''}${p.sec.copy === false ? t('(コピーなし)', ' (no copy)') : ''}`
          : t(`ボタン ${p.buttons.length}`, `${p.buttons.length} button(s)`),
      )
      .join(' → ')

  // ---- 部品のカード
  const partActions = (i: number, p: Part) => (
    <>
      <Button size="small" appearance="subtle" icon={<CopyRegular />} onClick={() => duplicatePart(p.key)} aria-label={t('複製', 'Duplicate')} />
      <Button size="small" appearance="subtle" icon={<ArrowUpRegular />} disabled={i === 0} onClick={() => movePart(i, -1)} aria-label={t('上へ', 'Move up')} />
      <Button size="small" appearance="subtle" icon={<ArrowDownRegular />} disabled={i === (draft?.parts.length ?? 0) - 1} onClick={() => movePart(i, 1)} aria-label={t('下へ', 'Move down')} />
      <Button
        size="small"
        appearance="subtle"
        icon={<DeleteRegular />}
        disabled={p.type === 'section' && sectionCount <= 1}
        onClick={() => removePart(p.key)}
        aria-label={p.type === 'section' ? t('このセクションを削除', 'Remove this section') : t('このボタンの部品を削除', 'Remove these buttons')}
      />
    </>
  )

  const sectionCard = (p: Extract<Part, { type: 'section' }>, i: number, no: number) => {
    const sec = p.sec
    return (
      <div key={p.key} className={s.card}>
        <div className={s.cardHead}>
          <span
            className={s.handle}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', p.key)
              setDragKey(p.key)
            }}
            onDragEnd={endDrag}
            title={t('つかんで動かす', 'Drag to move')}
            aria-hidden
          >
            <ReOrderDotsVerticalRegular />
          </span>
          {foldButton(p.key)}
          <Badge size="small" appearance="tint" color="brand">{t(`セクション ${no}`, `Section ${no}`)}</Badge>
          <span className={s.caption}>{`${sectionKindLabel(sec)} · ${t(`${sec.slots} 点`, `${sec.slots} items`)}`}</span>
          <span className={s.grow} />
          {partActions(i, p)}
        </div>
        {!folded.has(p.key) && (
        <div className={s.sectionBody}>
          <Field label={t('商品の並び方', 'Product layout')}>
            <Select size="small" className={s.fill} value={layoutValue(sec)} onChange={(_, d) => patchSection(p.key, layoutPatch(d.value as SectionLayout, sec))}>
              {LAYOUTS.map((v) => (
                <option key={v} value={v}>{layoutLabel(v)}</option>
              ))}
            </Select>
          </Field>
          {sec.kind === 'cells' ? (
            <div className={s.cellsField}>
              <CellEditor cols={sec.cols ?? 2} cells={sec.cells ?? []} maxSlots={MAX_SLOTS} onChange={(cols, cells) => patchSection(p.key, { cols, cells, slots: cells.length })} />
            </div>
          ) : (
          <Field label={t('商品の枠の数', 'Product slots')}>
            <Select size="small" className={s.fill} value={String(sec.slots)} onChange={(_, d) => patchSection(p.key, { slots: fitSlots(sec.kind, Number(d.value)) })}>
              {Array.from({ length: Math.floor(MAX_SLOTS / slotStep(sec.kind)) }, (_, k) => (k + 1) * slotStep(sec.kind)).map((n) => (
                <option key={n} value={n}>{t(`${n} 点`, `${n} items`)}</option>
              ))}
            </Select>
          </Field>
          )}
          <Field label={t('見出し', 'Heading')}>
            <Checkbox label={t('AI で付ける', 'Add (AI)')} checked={!!sec.categoryHeading} onChange={(_, d) => patchSection(p.key, { categoryHeading: d.checked === true })} />
          </Field>
          <Field label={t('コピー', 'Copy')}>
            <Checkbox label={t('置く', 'Show')} checked={sec.copy !== false} onChange={(_, d) => patchSection(p.key, { copy: d.checked === true ? undefined : false })} />
          </Field>
        </div>
        )}
      </div>
    )
  }

  const buttonsCard = (p: Extract<Part, { type: 'buttons' }>, i: number) => (
    <div key={p.key} className={mergeClasses(s.card, s.cardButtons)}>
      <div className={s.cardHead}>
        <span
          className={s.handle}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            e.dataTransfer.setData('text/plain', p.key)
            setDragKey(p.key)
          }}
          onDragEnd={endDrag}
          title={t('つかんで動かす', 'Drag to move')}
          aria-hidden
        >
          <ReOrderDotsVerticalRegular />
        </span>
        {foldButton(p.key)}
        <Badge size="small" appearance="tint" color="informative">{t('ボタン', 'Buttons')}</Badge>
        <span className={s.caption}>{p.buttons.map((b, k) => t(`${b.label?.trim() || defaultButtonLabel(k)}(${styleLabel(b)})`, `${b.label?.trim() || defaultButtonLabel(k)} (${styleLabel(b)})`)).join(t('、', ', '))}</span>
        <span className={s.grow} />
        {partActions(i, p)}
      </div>
      {!folded.has(p.key) && (
      <div className={s.buttonRows}>
        <div className={s.buttonRow}>
          <span />
          <span className={s.caption}>{t('文言', 'Label')}</span>
          <span className={s.caption}>{t('見た目', 'Style')}</span>
          <span className={s.caption}>{t('リンク先(既定)', 'Link (default)')}</span>
          <span />
        </div>
        {p.buttons.map((b, k) => (
          <div key={b.id} className={s.buttonRow}>
            <span className={s.num}>{k + 1}</span>
            <Input
              size="small"
              value={b.label ?? ''}
              placeholder={defaultButtonLabel(k)}
              maxLength={MAX_BUTTON_LABEL}
              aria-label={t(`ボタン ${k + 1} の文言`, `Button ${k + 1} label`)}
              onChange={(_, d) => patchButton(p.key, b.id, { label: d.value })}
            />
            <Select size="small" value={b.style ?? 'fill'} aria-label={t('見た目', 'Style')} onChange={(_, d) => patchButton(p.key, b.id, { style: d.value === 'outline' ? 'outline' : undefined })}>
              <option value="fill">{t('塗り', 'Filled')}</option>
              <option value="outline">{t('枠線', 'Outline')}</option>
            </Select>
            <Select size="small" value={b.link ?? 'campaign'} aria-label={t('リンク先', 'Link')} onChange={(_, d) => patchButton(p.key, b.id, { link: d.value as LinkKind })}>
              {LINK_KINDS.map((k2) => (
                <option key={k2} value={k2}>{linkKindLabel(k2)}</option>
              ))}
            </Select>
            <Button
              size="small"
              appearance="subtle"
              icon={<DismissRegular />}
              disabled={p.buttons.length <= 1}
              onClick={() => setButtons(p.key, (list) => list.filter((x) => x.id !== b.id))}
              aria-label={t('このボタンを外す', 'Remove this button')}
            />
          </div>
        ))}
        {p.buttons.length < MAX_BUTTONS_PER_BLOCK && (
          <div>
            <Button size="small" appearance="subtle" icon={<AddRegular />} onClick={() => setButtons(p.key, (list) => [...list, { id: newButtonId(), style: 'outline' }])}>
              {t('横にボタンを追加', 'Add a button beside')}
            </Button>
          </div>
        )}
      </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface className={s.surface}>
        <DialogBody className={s.body}>
          <div className={s.head}>
            <DialogTitle className={s.grow}>
              {draft ? (
                <span className={s.crumbs}>
                  {/* 見出しから一覧に戻れるように(編集した内容があれば、捨ててよいか確かめる) */}
                  <Button
                    appearance="transparent"
                    className={s.crumbLink}
                    onClick={() => {
                      if (histCount.past > 0 && !window.confirm(t('編集中の内容を破棄します。よろしいですか?', 'Discard the current edits?'))) return
                      setDraft(null)
                      setError(null)
                    }}
                  >
                    {t('テンプレート', 'Templates')}
                  </Button>
                  <ChevronRightRegular />
                  <span className={s.crumbName}>{draft.name || t('新しいテンプレート', 'New template')}</span>
                  <span className={s.caption}>{draft.id ? t('を編集中', '(editing)') : t('(新規)', '(new)')}</span>
                </span>
              ) : (
                t('テンプレート', 'Templates')
              )}
            </DialogTitle>
            <Button appearance="subtle" icon={<DismissRegular />} onClick={close} aria-label={t('閉じる', 'Close')} />
          </div>
          <DialogContent className={mergeClasses(s.split, editing && s.splitEditing)} style={{ padding: 0 }}>
            <div className={mergeClasses(s.list, editing && s.listHidden)}>
              <TabList
                size="small"
                className={s.fullRow}
                selectedValue={channel}
                onTabSelect={(_, d) => {
                  if (editing && !window.confirm(t('編集中の内容を破棄します。よろしいですか?', 'Discard the current edits?'))) return
                  const next = d.value as TemplateChannel
                  setDraft(null)
                  setChannel(next)
                  setSelectedId(next === 'push' ? DEFAULT_PUSH_TEMPLATE : 'standard4')
                }}
              >
                <Tab value="email" icon={<MailRegular />}>{t('メール', 'Email')}</Tab>
                <Tab value="push" icon={<PhoneRegular />}>{t('アプリ', 'App')}</Tab>
              </TabList>
              <div className={mergeClasses(s.listHead, s.fullRow)}>
                <Button size="small" appearance="primary" icon={<AddRegular />} onClick={startNew}>{t('新規作成', 'New')}</Button>
                <Button size="small" appearance="outline" icon={<CopyRegular />} onClick={startDuplicate} disabled={!selected || (editing && !draft?.id && selectedId === '')}>{t('複製', 'Duplicate')}</Button>
              </div>
              <span className={mergeClasses(s.groupLabel, s.fullRow)}>{t('作成したテンプレート', 'Your templates')}</span>
              {customs.length === 0 && <span className={mergeClasses(s.caption, s.fullRow)}>{t('まだありません。「新規作成」か、標準のテンプレートの「複製」から作れます。', 'None yet. Create one with "New", or duplicate a standard template.')}</span>}
              {customs.map(renderItem)}

              <span className={mergeClasses(s.groupLabel, s.fullRow)}>{t('標準', 'Standard')}</span>
              {builtins.map(renderItem)}

              {/* 使わない(無効)のものは、一覧の下にたたむ(配信カードの選択肢には出ない。ここから「また使う」で戻せる) */}
              {hiddenList.length > 0 && (
                <Button size="small" appearance="subtle" className={mergeClasses(s.fullRow, s.inactiveToggle)} icon={<EyeOffRegular />} onClick={() => setShowHidden((v) => !v)}>
                  {showHidden ? t(`使わないテンプレートをたたむ(${hiddenList.length})`, `Collapse inactive templates (${hiddenList.length})`) : t(`使わないテンプレート(${hiddenList.length})`, `Inactive templates (${hiddenList.length})`)}
                </Button>
              )}
              {showHidden && hiddenList.map(renderItem)}
            </div>

            <div className={s.editor}>
              {error && (
                <MessageBar layout="multiline" intent="error">
                  <MessageBarBody>{error}</MessageBarBody>
                </MessageBar>
              )}

              {/* 使っている配信があるテンプレートを編集しているときは、保存しても、その配信は今の形のままと知らせる */}
              {draft?.id && usageOf(draft.id).total > 0 && (
                <MessageBar layout="multiline" intent="warning">
                  <MessageBarBody>
                    {t(
                      `${usageText(draft.id)}。保存しても、これらの配信は今の形のままです。これから作る配信と、テンプレートを選び直した配信から、新しい形になります。`,
                      `${usageText(draft.id)}. Saving keeps those deliveries on the current version. New deliveries and ones that re-select this template get the new version.`,
                    )}
                  </MessageBarBody>
                </MessageBar>
              )}
              {draft ? (
                <div ref={gridRef} className={s.editor3} style={{ gridTemplateColumns: `${listOpen ? colW.list : 32}px 1px ${colW.palette}px 1px ${canvasCol}px 1px minmax(${FIELDS_MIN}px, 1fr)` }}>
                  {compareCol()}
                  {/* 列の境界。つかんで幅を変える(一覧を閉じているときは、一覧の幅は変えない) */}
                  <div className={s.splitCell} style={{ gridArea: 's1' }}>{listOpen && <Splitter onDrag={resizeCol('list', 1)} />}</div>
                  <div className={s.splitCell} style={{ gridArea: 's2' }}>
                    <Splitter onDrag={resizeCol('palette', 1)} />
                  </div>
                  <div className={s.splitCell} style={{ gridArea: 's3' }}>
                    <Splitter onDrag={resizeCol('canvas', 1)} />
                  </div>
                  {paletteCol()}
                  <div className={mergeClasses(s.fields, s.areaFields)}>
                    <div className={s.card}>
                      <div className={s.cardHead}>
                        {foldButton('info')}
                        <span className={s.cardTitle}>{t('テンプレートの情報', 'Template info')}</span>
                        {folded.has('info') && <span className={mergeClasses(s.caption, s.foldSummary)}>{draft.name || t('(名前なし)', '(no name)')}</span>}
                      </div>
                      {!folded.has('info') && (
                      <div className={s.infoBody}>
                    <Field label={t('テンプレート名', 'Template name')} required>
                      <Input size="small" value={draft.name} onChange={(_, d) => patch({ name: d.value })} />
                    </Field>
                    {draft.id && (
                      <Field label={t(`変更のメモ(任意。版 ${currentVersion(draft.id) + 1} の履歴に残ります)`, `Change note (optional; kept in the v${currentVersion(draft.id) + 1} history)`)}>
                        <Input size="small" value={draft.note ?? ''} placeholder={t('例: グリッドを 3 列に', 'e.g. Grid to 3 columns')} onChange={(_, d) => patch({ note: d.value })} />
                      </Field>
                    )}
                    <Field label={t('説明', 'Description')}>
                      <AutoTextarea rows={2} size="small" value={draft.description} onChange={(_, d) => patch({ description: d.value })} />
                    </Field>
                      </div>
                      )}
                    </div>

                    {draft.push && (
                      <div className={s.card}>
                        <div className={s.cardHead}>
                          {foldButton('push')}
                          <span className={s.cardTitle}>{t('通知', 'Notification')}</span>
                          <span className={s.caption}>{t('アプリの通知の形。メッセージの本文は、下の部品で組みます', 'The notification format. Build the in-app message with the parts below.')}</span>
                        </div>
                        {!folded.has('push') && (
                        <div className={s.heroBody}>
                          <Field label={t('通知の形', 'Format')}>
                            <div className={s.row} style={{ flexWrap: 'nowrap' }}>
                              {(
                                [
                                  ['text', t('テキストだけ', 'Text only')],
                                  ['image', t('画像つき(メイン画像)', 'With image (main image)')],
                                ] as const
                              ).map(([k, label]) => {
                                const on = k === 'image' ? draft.push!.image : !draft.push!.image
                                return (
                                  <Button
                                    key={k}
                                    size="small"
                                    appearance={on ? 'primary' : 'outline'}
                                    aria-pressed={on}
                                    onClick={() => patch({ push: { ...draft.push!, image: k === 'image' } })}
                                  >
                                    {label}
                                  </Button>
                                )
                              })}
                            </div>
                          </Field>
                          <Field label={t('通知のボタン(最大 2 つ。空なら、ボタンなし)', 'Notification buttons (up to 2; empty = none)')}>
                            <div className={s.row}>
                              {[0, 1].map((i) => (
                                <Input
                                  key={i}
                                  size="small"
                                  value={draft.push!.buttons[i] ?? ''}
                                  placeholder={i === 0 ? t('例: 見る', 'e.g. View') : t('例: あとで', 'e.g. Later')}
                                  maxLength={MAX_BUTTON_LABEL}
                                  onChange={(_, d) => {
                                    const b = [draft.push!.buttons[0] ?? '', draft.push!.buttons[1] ?? '']
                                    b[i] = d.value
                                    patch({ push: { ...draft.push!, buttons: b } }) // 空の欄は、保存のときに外す
                                  }}
                                />
                              ))}
                            </div>
                          </Field>
                        </div>
                        )}
                      </div>
                    )}

                    <div id="tplpart-hero" className={mergeClasses(s.card, selectedKey === 'hero' && s.partSelected)} onClickCapture={() => setSelectedKey('hero')}>
                      <div className={s.cardHead}>
                        {foldButton('hero')}
                        <span className={s.cardTitle}>{draft.push ? t('メッセージ: ヒーロー(メイン画像)', 'Message: hero (main image)') : t('ヒーロー(メイン画像)', 'Hero (main image)')}</span>
                      </div>
                      {!folded.has('hero') && (
                      <div className={s.heroBody}>
                        <Field label={t('種類', 'Type')}>
                          <div className={s.row} style={{ flexWrap: 'nowrap' }}>
                            {(['standard', 'collab', 'offer'] as HeroKind[]).map((h) => (
                              <Button key={h} size="small" appearance={draft.hero === h ? 'primary' : 'outline'} aria-pressed={draft.hero === h} onClick={() => patch({ hero: h })}>
                                {heroLabels[h]}
                              </Button>
                            ))}
                          </div>
                        </Field>
                        <Field label={t('ヘッドラインの見せ方', 'Headline placement')}>
                          <Select size="small" className={s.heroSelect} value={draft.heroText ?? 'band'} onChange={(_, d) => patch({ heroText: d.value as HeroText })}>
                            {(['below', 'overlay', 'band'] as HeroText[]).map((h) => (
                              <option key={h} value={h}>{heroTextLabels[h]}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={t('画像のリンク先(既定)', 'Image link (default)')}>
                          <Select size="small" className={s.heroSelect} value={draft.heroLink ?? 'campaign'} onChange={(_, d) => patch({ heroLink: d.value === 'campaign' ? undefined : (d.value as LinkKind) })}>
                            {LINK_KINDS.map((k) => (
                              <option key={k} value={k}>{linkKindLabel(k)}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label={t('お知らせ帯', 'Top bar')}>
                          <Checkbox label={t('メールの最上部に置く', 'Show at the very top')} checked={!!draft.topBar} onChange={(_, d) => patch({ topBar: d.checked === true || undefined })} />
                        </Field>
                      </div>
                      )}
                    </div>

                    <Field
                      label={t(`構成(上から順に。商品の枠は合計 ${totalSlots} 点)`, `Layout (top to bottom; ${totalSlots} product slots in total)`)}
                      hint={t('部品は、⠿ をつかんで上下に動かせます(矢印でも動かせます)。ボタンは、セクションとは別の部品です。リンク先は既定の種類で、実際の URL は配信ごとに決めます。', 'Drag ⠿ to reorder parts (or use the arrows). Buttons are separate parts. Links are default kinds; the actual URLs are set per delivery.')}
                    >
                      <div className={s.partList}>
                        {/* 部品が多いと長くなるので、まとめて閉じる・開く(キャンバスで選んだ部品は、閉じていても開く) */}
                        <div className={s.foldAll}>
                          <Button size="small" appearance="subtle" icon={<ChevronRightRegular />} onClick={() => setFolded(new Set(['info', 'push', 'hero', ...draft.parts.map((x) => x.key)]))}>
                            {t('すべて閉じる', 'Collapse all')}
                          </Button>
                          <Button size="small" appearance="subtle" icon={<ChevronDownRegular />} onClick={() => setFolded(new Set())}>
                            {t('すべて開く', 'Expand all')}
                          </Button>
                        </div>
                        {(() => {
                          let no = 0
                          return draft.parts.map((p, i) => (
                            <div
                              key={p.key}
                              id={`tplpart-${p.key}`}
                              className={mergeClasses(s.dropWrap, dragKey === p.key && s.dragging, selectedKey === p.key && s.partSelected)}
                              onClickCapture={() => selectPart(p.key, false)}
                              onDragOver={(e) => overPart(e, i)}
                              onDrop={(e) => { e.preventDefault(); drop() }}
                            >
                              {dropAt === i && <div className={s.dropLine} />}
                              {p.type === 'section' ? sectionCard(p, i, ++no) : buttonsCard(p, i)}
                              {i === draft.parts.length - 1 && dropAt === draft.parts.length && <div className={s.dropLine} />}
                            </div>
                          ))
                        })()}
                        {/* いちばん下(部品がないときも)に入れる所 */}
                        <div
                          className={mergeClasses(s.dropEnd, !!dragKey && s.dropEndOn)}
                          onDragOver={(e) => {
                            if (!dragKey) return
                            e.preventDefault()
                            setDropAt(draft.parts.length)
                          }}
                          onDrop={(e) => {
                            e.preventDefault()
                            drop()
                          }}
                        >
                          {dragKey ? t('ここに入れる(いちばん下)', 'Drop here (bottom)') : draft.parts.length === 0 ? t('上の部品を、ここへドラッグしてください', 'Drag a part here') : ''}
                        </div>
                      </div>
                    </Field>
                  </div>
                  <div className={mergeClasses(s.preview, s.areaCanvas)}>
                    <div className={s.canvasHead}>
                      <Text size={200} weight="semibold">{t('キャンバス(箱を押して選ぶ・つかんで動かす)', 'Canvas (click to select, drag to move)')}</Text>
                      <span className={s.grow} />
                      <Tooltip relationship="label" content={t('元に戻す(Ctrl+Z)', 'Undo (Ctrl+Z)')}>
                        <Button size="small" appearance="subtle" icon={<ArrowUndoRegular />} disabled={histCount.past === 0} onClick={undo} />
                      </Tooltip>
                      <Tooltip relationship="label" content={t('やり直す(Ctrl+Shift+Z)', 'Redo (Ctrl+Shift+Z)')}>
                        <Button size="small" appearance="subtle" icon={<ArrowRedoRegular />} disabled={histCount.future === 0} onClick={redo} />
                      </Tooltip>
                    </div>
                    {zoomBar()}
                    {removedAt !== null && (
                      <div className={s.toast}>
                        <span>{t('部品を削除しました', 'Part removed')}</span>
                        <Button
                          size="small"
                          appearance="transparent"
                          onClick={() => {
                            undo()
                            setRemovedAt(null)
                          }}
                        >
                          {t('元に戻す', 'Undo')}
                        </Button>
                      </div>
                    )}
                    <span className={s.caption}>{t('↑↓ で選ぶ部品を移る・Alt+↑↓ で動かす・Delete で消す・Ctrl+D で複製', '↑↓ select · Alt+↑↓ move · Delete remove · Ctrl+D duplicate')}</span>
                    {/* 構成がほかのテンプレートと同じになったら知らせる(保存は止めない。ヒーローや見た目だけ違う使い分けもあるため) */}
                    {sameAs && (
                      <div className={s.sameNote}>
                        <span>{t(`「${sameAs.o.label}」と同じ構成です`, `Same layout as "${sameAs.o.label}"`)}</span>
                        {compareId !== sameAs.o.id && (
                          <Button size="small" appearance="transparent" onClick={() => setCompareId(sameAs.o.id)}>
                            {t('見比べる', 'Compare')}
                          </Button>
                        )}
                      </div>
                    )}
                    <div
                      ref={(el) => {
                        zoomBoxRef.current = el
                        zoomBaseRef.current = canvasBase
                      }}
                      className={mergeClasses(s.previewScroll, s.canvasRow, s.canvasScroll)}
                    >
                      {/* プレビューの箱を、そのまま操作できる(押して選ぶ・つかんで並べ替える・パレットの部品を箱の間に落とす) */}
                      <div data-zoom-target={compared ? 'pair' : 'one'} className={s.zoomTarget} style={{ width: canvasWidth }}>
                      <TemplateThumb
                        layout={fromParts(draft)}
                        width={canvasWidth}
                        edit={{
                          selected: draft.parts.findIndex((p) => p.key === selectedKey) >= 0 ? draft.parts.findIndex((p) => p.key === selectedKey) : null,
                          dragging: dragKey && !dragKey.startsWith('new:') ? draft.parts.findIndex((p) => p.key === dragKey) : null,
                          dropAt,
                          active: !!dragKey,
                          // 落とす前の姿: パレットの部品なら、その形。構成の部品なら、その部品
                          ghost: (() => {
                            if (!dragKey) return undefined
                            if (dragKey.startsWith('new:')) {
                              const k = dragKey.slice(4) as SectionLayout | 'buttons'
                              return k === 'buttons' ? { buttons: [{ id: 'g', style: 'outline' as const }] } : { sec: layoutSection(k) }
                            }
                            const p = draft.parts.find((x) => x.key === dragKey)
                            return p ? (p.type === 'section' ? { sec: p.sec } : { buttons: p.buttons }) : undefined
                          })(),
                          heroSelected: selectedKey === 'hero',
                          onSelectHero: () => selectPart('hero', true),
                          onSelect: (i) => draft.parts[i] && selectPart(draft.parts[i].key, true),
                          partProps: (i) => ({
                            draggable: true,
                            onDragStart: (e) => {
                              e.dataTransfer.effectAllowed = 'move'
                              e.dataTransfer.setData('text/plain', draft.parts[i].key)
                              setDragKey(draft.parts[i].key)
                            },
                            onDragEnd: endDrag,
                            onDragOver: (e) => overPart(e, i),
                            onDrop: (e) => {
                              e.preventDefault()
                              drop()
                            },
                          }),
                          endProps: {
                            onDragOver: (e) => {
                              if (!dragKey) return
                              e.preventDefault()
                              setDropAt(draft.parts.length)
                            },
                            onDrop: (e) => {
                              e.preventDefault()
                              drop()
                            },
                          },
                          tools: (i) => {
                            const p = draft.parts[i]
                            const sec = p.type === 'section' ? p.sec : null
                            const step = sec ? slotStep(sec.kind) : 1
                            return (
                              <>
                                {/* よく使う設定は、キャンバスの上で(右の設定を見なくても済むように) */}
                                {sec && (sec.kind === 'grid' || sec.kind === 'photos') && (
                                  <Tooltip relationship="label" content={t('2 列 / 3 列', '2 / 3 columns')}>
                                    <Button size="small" appearance="subtle" onClick={(e) => { e.stopPropagation(); patchSection(p.key, { columns: gridColumns(sec) === 3 ? undefined : 3 }) }}>
                                      {gridColumns(sec) === 3 ? t('3列', '3 col') : t('2列', '2 col')}
                                    </Button>
                                  </Tooltip>
                                )}
                                {sec && sec.kind !== 'cells' && (
                                  <>
                                    <Button size="small" appearance="subtle" icon={<SubtractRegular />} disabled={sec.slots <= step} onClick={(e) => { e.stopPropagation(); patchSection(p.key, { slots: fitSlots(sec.kind, sec.slots - step) }) }} aria-label={t('枠を減らす', 'Fewer slots')} />
                                    <span className={s.toolCount}>{sec.slots}</span>
                                    <Button size="small" appearance="subtle" icon={<AddRegular />} disabled={sec.slots + step > MAX_SLOTS} onClick={(e) => { e.stopPropagation(); patchSection(p.key, { slots: fitSlots(sec.kind, sec.slots + step) }) }} aria-label={t('枠を増やす', 'More slots')} />
                                  </>
                                )}
                                <Button size="small" appearance="subtle" icon={<CopyRegular />} onClick={(e) => { e.stopPropagation(); duplicatePart(p.key) }} aria-label={t('複製', 'Duplicate')} />
                                <Button size="small" appearance="subtle" icon={<ArrowUpRegular />} disabled={i === 0} onClick={(e) => { e.stopPropagation(); movePart(i, -1) }} aria-label={t('上へ', 'Move up')} />
                                <Button size="small" appearance="subtle" icon={<ArrowDownRegular />} disabled={i === draft.parts.length - 1} onClick={(e) => { e.stopPropagation(); movePart(i, 1) }} aria-label={t('下へ', 'Move down')} />
                                <Button
                                  size="small"
                                  appearance="subtle"
                                  icon={<DeleteRegular />}
                                  disabled={p.type === 'section' && sectionCount <= 1}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    removePart(p.key)
                                  }}
                                  aria-label={p.type === 'section' ? t('このセクションを削除', 'Remove this section') : t('このボタンの部品を削除', 'Remove these buttons')}
                                />
                              </>
                            )
                          },
                        }}
                      />
                      </div>
                      {compared && (
                        <div className={s.compareBox}>
                          <div className={s.compareBoxHead}>
                            <span className={s.compareBoxName}>{compared.label}</span>
                            <Button size="small" appearance="subtle" icon={<DismissRegular />} onClick={() => setCompareId(null)} aria-label={t('見比べるのをやめる', 'Stop comparing')} />
                          </div>
                          {compared.push && <PushThumb spec={compared.push} width={160} />}
                          <TemplateThumb layout={compared} width={canvasWidth} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : selected ? (
                <div className={s.editorGrid}>
                  <div className={s.fields}>
                    <div style={{ display: 'flex', alignItems: 'center', columnGap: 8, flexWrap: 'wrap' }}>
                      <Text weight="semibold" size={400}>{selected.label}</Text>
                      <Badge size="small" appearance="tint" color={selected.builtin ? 'informative' : 'brand'}>
                        {selected.builtin ? (selected.edited ? t('標準(編集済み)', 'Standard (edited)') : t('標準', 'Standard')) : t('作成したテンプレート', 'Your template')}
                      </Badge>
                      {selected.hidden && (
                        <Badge size="small" appearance="outline" color="subtle">
                          {t('使わない', 'Inactive')}
                        </Badge>
                      )}
                      {selected.id !== 'free' && (
                        <Badge size="small" appearance="outline">
                          {t(`いまの版: 版 ${currentVersion(selected.id)}`, `Latest: v${currentVersion(selected.id)}`)}
                        </Badge>
                      )}
                    </div>
                    <span className={s.caption}>{usageOf(selected.id).total > 0 ? usageText(selected.id) : t('どの配信でも使っていません', 'Not used by any delivery')}</span>
                    <span className={s.caption}>{selected.description || t('(説明なし)', '(No description)')}</span>
                    {selected.push && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 12, rowGap: 4 }}>
                        <span className={s.caption}>{t('通知の中身', 'Contents')}</span>
                        <span style={{ fontSize: tokens.fontSizeBase200 }}>
                          {[t('タイトル', 'Title'), t('本文', 'Body'), selected.push.image ? t('メイン画像', 'Main image') : '']
                            .filter(Boolean)
                            .join(t('、', ', '))}
                        </span>
                        <span className={s.caption}>{t('ボタン', 'Buttons')}</span>
                        <span style={{ fontSize: tokens.fontSizeBase200 }}>{selected.push.buttons.length ? selected.push.buttons.join(t('、', ', ')) : t('なし', 'None')}</span>
                      </div>
                    )}
                    {(
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 12, rowGap: 4 }}>
                      <span className={s.caption}>{t('ヒーロー', 'Hero')}</span>
                      <span style={{ fontSize: tokens.fontSizeBase200 }}>
                        {[heroLabels[selected.hero], heroTextLabels[selected.heroText ?? 'band'], selected.topBar ? t('お知らせ帯あり', 'top bar') : '']
                          .filter(Boolean)
                          .join(t('、', ', '))}
                      </span>
                      <span className={s.caption}>{t('構成', 'Layout')}</span>
                      <span style={{ fontSize: tokens.fontSizeBase200 }}>
                        {selected.id === 'free' ? t('自由な並び(枠の数は決まっていません)', 'Free-form (no fixed number of slots)') : summary(selected)}
                      </span>
                    </div>
                    )}
                    {selected.id === 'free' && (
                      <MessageBar layout="multiline" intent="info">
                        <MessageBarBody>
                          {t(
                            '使いどころ: 点数が毎回変わる配信や、カテゴリごとに見せたい配信(新作まとめ・セール対象の一覧など)。載せた商品を 2 列で並べ、同じカテゴリが続く所に見出しを付けます。配信カードのプレビューの上で、見出しを出す・出さないと、「カテゴリでまとめる」(同じカテゴリを隣どうしに並べ直す)が使えます。決まった構成がないので、編集はできません。',
                            'Use it when the number of items varies, or to show items by category (new-arrivals roundups, sale lists). Products go in two columns with a heading wherever the category changes. Above the delivery card preview you can turn headings on or off and "Group by category". It has no fixed layout, so it cannot be edited.',
                          )}
                        </MessageBarBody>
                      </MessageBar>
                    )}
                    {/* 標準も、作成したものも、同じボタン。使っているものは削除できないので、使わない(無効)にする */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {canEdit(selected) && (
                        <Button size="small" appearance="primary" icon={<EditRegular />} onClick={startEdit} disabled={busy}>
                          {t('編集', 'Edit')}
                        </Button>
                      )}
                      <Button size="small" appearance="outline" icon={<CopyRegular />} onClick={startDuplicate} disabled={busy}>
                        {t('複製', 'Duplicate')}
                      </Button>
                      {selected.hidden ? (
                        <Button size="small" appearance="outline" icon={<EyeRegular />} onClick={() => void toggleHidden(false)} disabled={busy}>
                          {t('また使う', 'Reactivate')}
                        </Button>
                      ) : !selected.builtin && usageOf(selected.id).total === 0 ? (
                        <Button size="small" appearance="outline" icon={<DeleteRegular />} onClick={() => void remove()} disabled={busy}>
                          {t('削除', 'Delete')}
                        </Button>
                      ) : (
                        <Button size="small" appearance="outline" icon={<EyeOffRegular />} onClick={() => void toggleHidden(true)} disabled={busy}>
                          {t('使わないにする', 'Make inactive')}
                        </Button>
                      )}
                      {selected.edited && (
                        <Button size="small" appearance="subtle" icon={<ArrowResetRegular />} onClick={() => void reset()} disabled={busy}>
                          {t('最初の形に戻す', 'Reset to original')}
                        </Button>
                      )}
                    </div>
                    <span className={s.caption}>
                      {selected.builtin
                        ? t('標準のテンプレートも編集できます(コードの定義が版 0)。保存するたびに新しい版になり、使っている配信は、使った版の形のままです。標準は削除できないので、要らなければ「使わないにする」。', 'Standard templates can be edited too (the built-in definition is v0). Each save creates a new version; deliveries keep the version they used. Standards cannot be deleted; make them inactive instead.')
                        : usageOf(selected.id).total > 0
                          ? t('使っている配信があるので、削除の代わりに「使わないにする」(配信カードの選択肢から外れます。使っている配信は、そのまま)。', 'In use, so make it inactive instead of deleting it (it leaves the delivery card choices; deliveries keep it).')
                          : t('どの版も、どの配信でも使っていないので、削除できます。', 'No version is in use, so it can be deleted.')}
                    </span>
                    {selected.id !== 'free' && versionHistory(selected.id)}
                    {usedBy(selected.id)}
                  </div>
                  <div className={s.preview}>
                    <Text size={200} weight="semibold">
                      {viewKey ? t(`構成のプレビュー(版 ${getTemplate(viewKey).version} を見ています)`, `Layout preview (viewing v${getTemplate(viewKey).version})`) : t('構成のプレビュー', 'Layout preview')}
                    </Text>
                    {zoomBar()}
                    <div
                      ref={(el) => {
                        zoomBoxRef.current = el
                        zoomBaseRef.current = PREVIEW_WIDTH
                      }}
                      className={mergeClasses(s.previewScroll, s.previewZoomBox)}
                    >
                      {(viewKey ? getTemplate(viewKey) : selected).push && <PushThumb spec={(viewKey ? getTemplate(viewKey) : selected).push!} width={160} />}
                      <div data-zoom-target="grow" className={s.zoomTarget} style={{ width: zoomed(PREVIEW_WIDTH) }}>
                        <TemplateThumb layout={viewKey ? getTemplate(viewKey) : selected} free={selected.id === 'free'} width={zoomed(PREVIEW_WIDTH)} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </DialogContent>
          {draft && (
            <div className={s.actions}>
              <span className={s.grow} />
              <Button appearance="secondary" onClick={() => { setDraft(null); setError(null) }} disabled={busy}>{t('キャンセル', 'Cancel')}</Button>
              <Button appearance="primary" onClick={() => void save()} disabled={!valid || busy}>{busy ? t('保存中...', 'Saving...') : t('保存', 'Save')}</Button>
            </div>
          )}
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
