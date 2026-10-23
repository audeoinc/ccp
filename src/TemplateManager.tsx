import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
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
import { AddRegular, ArrowRedoRegular, ArrowResetRegular, ArrowUndoRegular, ChevronDownRegular, ChevronLeftRegular, ChevronRightRegular, CopyRegular, DeleteRegular, DismissRegular, EditRegular, EyeOffRegular, EyeRegular, MailRegular, PhoneRegular, SubtractRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { locale, useT } from './i18n'
import { MAX_BUTTON_LABEL, deleteTemplate, resetBuiltin, restoreVersion, saveTemplate, setTemplateHidden } from './layoutTemplates'
import type { DeliveryCard } from './models/deliveryCards'
import type { Product } from './models/products'
import { productImage } from './images'
import { productMarket } from './market'
import { yen } from './items'
import { statusLabel, statusRank } from './status'
import { TemplateThumb } from './TemplateThumb'
import { PushThumb } from './PushThumb'
import { Splitter } from './Splitter'
import { useTableEditor } from './TemplateTableEditor'
import { toTableLayout } from './tables'
import {
  DEFAULT_PUSH_TEMPLATE,
  LINK_KINDS,
  buttonsAt,
  linkKindLabel,
  newButtonId,
  placedButtons,
  sectionKindLabel,
  setTemplateManagerOpen,
  templateIdOfCard,
  templateOptions,
  useTemplateManagerOpen,
  useTemplates,
  currentVersion,
  getTemplate,
  pastVersions,
  templateKey,
  builtinOriginal,
  type HeroKind,
  type HeroText,
  type TemplateChannel,
  type PushSpec,
  type LinkKind,
  type Section,
  type TemplateLayout,
} from './templates'

/**
 * 編集中の内容。構成は、表のセクションの並びだけで持つ(T8。docs/TEMPLATE_OBJECTS.md)。
 * 以前の種類のセクション・独立したボタンは、開いたときに表に直す(tables.ts の toTableLayout。保存すると、以後は表の形で持つ)
 */
interface Draft extends Pick<TemplateLayout, 'hero' | 'heroText' | 'topBar' | 'heroLink'> {
  /** 保存済みの行の ID(新規は undefined) */
  id?: string
  name: string
  description: string
  sections: Section[]
  /** ヒーローのすぐ下の表(ボタン・テキスト・画像。セクションの番号には数えない。T8 の 8.1) */
  heroTable?: Section
  /** アプリのテンプレート: 通知の形(メールのテンプレートでは undefined) */
  push?: PushSpec
  /** 変更のメモ(版の履歴に残す) */
  note?: string
}

/** 編集中の内容から、保存・見取り図に使う構成を作る */
const layoutOf = (d: Draft): TemplateLayout => ({ hero: d.hero, heroText: d.heroText, topBar: d.topBar, heroLink: d.heroLink, sections: d.sections, ...(d.heroTable ? { heroTable: d.heroTable } : {}) })

/** セクションの形(表に直して、部品の種類・位置・大きさ・見せ方)。ID・文言・見出しは比べない */
const sectionShape = (sec: Section) =>
  JSON.stringify([sec.cols, sec.rows, [...(sec.parts ?? [])].sort((a, b) => a.r - b.r || a.c - b.c).map((p) => [p.type, p.c, p.r, p.w, p.h, p.view ?? 'card'])])
/** 構成の形の並び。以前の種類のテンプレートも、表に直してから比べる(同じ見た目なら、同じ形になる) */
const shapesOf = (l: TemplateLayout) => {
  const t = toTableLayout(l)
  return [...(t.heroTable ? ['hero:' + sectionShape(t.heroTable)] : []), ...t.sections.map(sectionShape)]
}
/** 構成の形。同じなら、見た目の設定のほかは同じテンプレート */
const shapeOf = (l: TemplateLayout) => JSON.stringify(shapesOf(l))
/** 似ている度(0〜1): セクションの形の並びが、どれだけ同じ順に重なるか(最長共通部分列 ÷ 長いほうの数) */
const similarity = (a: TemplateLayout, b: TemplateLayout) => {
  const x = shapesOf(a)
  const y = shapesOf(b)
  if (x.length === 0 || y.length === 0) return 0
  const dp = Array.from({ length: x.length + 1 }, () => new Array<number>(y.length + 1).fill(0))
  for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) dp[i][j] = x[i - 1] === y[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1])
  return dp[x.length][y.length] / Math.max(x.length, y.length)
}
/** 編集中の列の幅(一覧・パーツ・右のタブ。キャンバスは残り)を覚えておく所(その人のブラウザだけ。列の並びを変えたので、以前の鍵とは別) */
const EDITOR_WIDTHS_KEY = 'ccp.templateEditorWidths2'
type EditorWidths = { list: number; palette: number; props: number }
const EDITOR_WIDTHS: EditorWidths = { list: 200, palette: 190, props: 330 }
const clampWidths = (w: EditorWidths): EditorWidths => ({
  list: Math.round(Math.min(400, Math.max(160, w.list))),
  palette: Math.round(Math.min(300, Math.max(150, w.palette))),
  props: Math.round(Math.min(560, Math.max(260, w.props))),
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

/** キャンバスの列の最小の幅(メールの形が読める大きさ)。ほかの列を広げても、これより狭くしない */
const CANVAS_MIN = 380
/** 列の間(境界 3 本 + 間隔 6 つ) */
const EDITOR_GAPS = 3 + 6 * 10
/** 編集中の左の一覧の開け閉めを覚えておく所(その人のブラウザだけ) */
const COMPARE_OPEN_KEY = 'ccp.templateCompareOpen'

/** 構成のプレビューの幅。一覧の見取り図(84px)では、枠の数や列が読み取りにくいため、大きく描く */
const PREVIEW_WIDTH = 220

/** 新規作成の初めの形(以前の新規作成と同じ見た目: ヒーローの下にボタン、2 × 2 の箱) */
const newDraft = (): Draft => ({
  name: '',
  description: '',
  hero: 'standard',
  heroText: 'below',
  ...(({ sections, heroTable }) => ({ sections, heroTable }))(toTableLayout({ hero: 'standard', sections: [{ kind: 'grid', slots: 4 }], buttonBlocks: [{ at: 0, buttons: [{ id: newButtonId() }] }] })),
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
  // 右のタブ「テンプレート」のまとまり
  tplTab: { display: 'grid', rowGap: '12px', minWidth: 0 },
  grp: { display: 'grid', rowGap: '8px', paddingBottom: '10px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  grpTitle: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  kv: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', columnGap: '8px', fontSize: '12px', minHeight: '24px' },
  kvLabel: { color: tokens.colorNeutralForeground3 },
  tree: { display: 'grid', rowGap: '2px' },
  treeItem: { textAlign: 'left', fontSize: '12px', padding: '4px 6px', border: 'none', borderRadius: tokens.borderRadiusMedium, backgroundColor: 'transparent', color: tokens.colorNeutralForeground1, cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  propsCol: { gridArea: 'fields', position: 'sticky', top: 0, maxHeight: 'calc((86vh / var(--ui-zoom, 1)) - 120px)', overflowY: 'auto', paddingRight: '4px', minWidth: 0 },
  compareThumb: { paddingLeft: '4px' },
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
export function TemplateManager({ cards, products = [], country, onChanged, onOpenCard }: { cards: DeliveryCard[]; products?: Product[]; country?: string; onChanged: () => Promise<void>; onOpenCard: (id: string) => void }) {
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
  // 列を並べた枠の幅。広げすぎてキャンバスが押しつぶされないように、ほかの列の上限を、ここから決める
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
      // 広げるのは、キャンバスが最小の幅を保てるところまで
      const room = gridW - EDITOR_GAPS - CANVAS_MIN - (listOpen ? next.list : 32) - next.palette - next.props
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
    setDraft(channel === 'push' ? { ...newDraft(), push: { image: true, buttons: [] } } : newDraft())
  }
  const startDuplicate = () => {
    if (!selected) return
    setError(null)
    setCompareId(null)
    setDraft({
      name: t(`${selected.label} のコピー`, `Copy of ${selected.label}`),
      description: selected.description,
      hero: selected.hero,
      heroText: selected.heroText,
      topBar: selected.topBar,
      heroLink: selected.heroLink,
      sections: toTableLayout(selected).sections,
      heroTable: toTableLayout(selected).heroTable,
      push: selected.push ? { ...selected.push, buttons: [...selected.push.buttons] } : undefined,
    })
    setSelectedId('')
  }
  // 自由な並び(free)は、決まった構成がないので、編集するものがない
  const canEdit = (o?: { id: string }) => !!o && o.id !== 'free'
  const startEdit = () => {
    if (!selected || !canEdit(selected)) return
    setError(null)
    setCompareId(null)
    setDraft({ id: selected.id, name: selected.label, description: selected.description, hero: selected.hero, heroText: selected.heroText, topBar: selected.topBar, heroLink: selected.heroLink, sections: toTableLayout(selected).sections, heroTable: toTableLayout(selected).heroTable, push: selected.push })
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
  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d))
  const setSections = (fn: (list: Section[]) => Section[]) => setDraft((d) => (d ? { ...d, sections: fn(d.sections) } : d))
  const setHeroTable = (sec: Section | undefined) => setDraft((d) => (d ? { ...d, heroTable: sec } : d))
  // 右のタブ「テンプレート」の、全体の見た目の欄(キャンバスのヒーローを押したときに、そこを見せる)
  const heroRef = useRef<HTMLDivElement>(null)
  // 見本の写真: ヘッダーの国の市場の商品(なければ、すべて)から、写真のあるものを 24 点まで(セールの見せ方を確かめられるように、元の価格があるものを先に)
  const samples = useMemo(() => {
    const market = country === 'US' || country === 'JP' ? country : undefined
    const pool = products.filter((p) => !!productImage(p) && (!market || productMarket(p) === market))
    return [...pool.filter((p) => p.regular_price), ...pool.filter((p) => !p.regular_price)].slice(0, 24).map((p) => ({
      src: productImage(p)!,
      name: p.name,
      price: yen(p.price, productMarket(p)),
      ...(p.regular_price ? { regular: yen(p.regular_price, productMarket(p)) } : {}),
    }))
  }, [products, country])
  const editor = useTableEditor({
    active: editing,
    sections: draft?.sections ?? [],
    heroTable: draft?.heroTable,
    setHeroTable,
    setSections,
    hero: draft?.hero ?? 'standard',
    heroText: draft?.heroText,
    topBar: draft?.topBar,
    samples,
    onSelectHero: () => window.setTimeout(() => heroRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0),
  })

  // 編集中の形と、ほかのテンプレートとの比べ(同じ構成を先に、あとは似ている順)
  const mine = draft ? layoutOf(draft) : null
  const others = mine
    ? options
        .filter((o) => o.id !== draft?.id && o.id !== 'free' && !o.hidden)
        .map((o) => ({ o, same: shapeOf(o) === shapeOf(mine), score: similarity(mine, o) }))
        .sort((a, b) => Number(b.same) - Number(a.same) || b.score - a.score)
    : []
  const sameAs = others.find((x) => x.same)

  /** 左の列: ほかのテンプレート(押すと、その下に大きく出して見比べる)。閉じると細い帯 */
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
          <div key={o.id} style={{ display: 'grid', rowGap: 4 }}>
            <div
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
            {/* 見比べる: 一覧の幅いっぱいに、大きく描く */}
            {compareId === o.id && (
              <div className={s.compareThumb}>
                <TemplateThumb layout={o} width={Math.max(140, colW.list - 16)} />
              </div>
            )}
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

  // 元に戻す・やり直す(入力欄の中では、ブラウザの元に戻すなどを、そのまま使う)。表の操作のキーは、表の編集(TemplateTableEditor)が受ける
  useEffect(() => {
    if (!draft) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const countParts = (type: string) => (draft?.sections ?? []).reduce((n, sec) => n + (sec.parts ?? []).filter((p) => p.type === type).length, 0)
  const boxCount = countParts('box')
  const valid = !!draft && draft.name.trim() !== '' && (draft.sections.length > 0 || !!draft.push)

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
      const id = await saveTemplate({ id: draft.id, name: draft.name, description: draft.description, ...layoutOf(draft), push: draft.push }, cards, draft.note ?? '')
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
  const summary = (layout: TemplateLayout) => {
    const blocks = placedButtons(layout)
    const at = (i: number) => buttonsAt(blocks, i, layout.sections.length).map((b) => t(`ボタン ${b.length}`, `${b.length} button(s)`))
    const flags = (sec: Section) => `${sec.categoryHeading ? t('(見出し付き)', ' (heading)') : ''}${sec.copy === false ? t('(コピーなし)', ' (no copy)') : ''}`
    const text = (sec: Section) => {
      if (sec.kind !== 'table') return `${sectionKindLabel(sec)}${t(` ${sec.slots}点`, ` ×${sec.slots}`)}${flags(sec)}`
      const buttons = (sec.parts ?? []).filter((p) => p.type === 'button').length
      return `${sec.name?.trim() ? `${sec.name.trim()} ` : ''}${sectionKindLabel(sec)}${t(` 商品 ${sec.slots}点`, ` ×${sec.slots}`)}${buttons ? t(`・ボタン ${buttons}`, `, ${buttons} button(s)`) : ''}${flags(sec)}`
    }
    return [...at(0), ...layout.sections.flatMap((sec, i) => [text(sec), ...at(i + 1)])].join(' → ')
  }

  /** 右のタブ「テンプレート」: 基本・通知・全体の見た目・状況・構成 */
  const templateTab = (d: Draft) => {
    const cur = d.id ? currentVersion(d.id) : 0
    const used = d.id ? usageOf(d.id).total : 0
    const kv = (label: string, value: React.ReactNode) => (
      <div className={s.kv}>
        <span className={s.kvLabel}>{label}</span>
        {value}
      </div>
    )
    return (
      <div className={s.tplTab}>
        <div className={s.grp}>
          <span className={s.grpTitle}>{t('基本', 'Basics')}</span>
          <Field label={t('テンプレート名', 'Template name')} required size="small">
            <Input size="small" value={d.name} onChange={(_, x) => patch({ name: x.value })} />
          </Field>
          {d.id && (
            <Field label={t(`変更のメモ(任意。版 ${cur + 1} の履歴に残ります)`, `Change note (optional; kept in the v${cur + 1} history)`)} size="small">
              <Input size="small" value={d.note ?? ''} placeholder={t('例: 2 列を 3 列に', 'e.g. 2 columns to 3')} onChange={(_, x) => patch({ note: x.value })} />
            </Field>
          )}
          <Field label={t('説明', 'Description')} size="small">
            <AutoTextarea rows={2} size="small" value={d.description} onChange={(_, x) => patch({ description: x.value })} />
          </Field>
        </div>

        {d.push && (
          <div className={s.grp}>
            <span className={s.grpTitle}>{t('通知', 'Notification')}</span>
            <span className={s.caption}>{t('アプリの通知の形。メッセージの本文は、キャンバスで組みます', 'The notification format. Build the in-app message on the canvas.')}</span>
            <Field label={t('通知の形', 'Format')} size="small">
              <div className={s.row} style={{ flexWrap: 'nowrap' }}>
                {(
                  [
                    ['text', t('テキストだけ', 'Text only')],
                    ['image', t('画像つき(メイン画像)', 'With image (main image)')],
                  ] as const
                ).map(([k, label]) => {
                  const on = k === 'image' ? d.push!.image : !d.push!.image
                  return (
                    <Button key={k} size="small" appearance={on ? 'primary' : 'outline'} aria-pressed={on} onClick={() => patch({ push: { ...d.push!, image: k === 'image' } })}>
                      {label}
                    </Button>
                  )
                })}
              </div>
            </Field>
            <Field label={t('通知のボタン(最大 2 つ。空なら、ボタンなし)', 'Notification buttons (up to 2; empty = none)')} size="small">
              <div className={s.row}>
                {[0, 1].map((i) => (
                  <Input
                    key={i}
                    size="small"
                    value={d.push!.buttons[i] ?? ''}
                    placeholder={i === 0 ? t('例: 見る', 'e.g. View') : t('例: あとで', 'e.g. Later')}
                    maxLength={MAX_BUTTON_LABEL}
                    onChange={(_, x) => {
                      const b = [d.push!.buttons[0] ?? '', d.push!.buttons[1] ?? '']
                      b[i] = x.value
                      patch({ push: { ...d.push!, buttons: b } }) // 空の欄は、保存のときに外す
                    }}
                  />
                ))}
              </div>
            </Field>
          </div>
        )}

        <div ref={heroRef} className={s.grp}>
          <span className={s.grpTitle}>{d.push ? t('メッセージの全体の見た目', 'Message look') : t('全体の見た目', 'Overall look')}</span>
          <Field label={t('ヒーロー(メイン画像)', 'Hero (main image)')} size="small">
            <div className={s.row} style={{ flexWrap: 'nowrap' }}>
              {(['standard', 'collab', 'offer'] as HeroKind[]).map((h) => (
                <Button key={h} size="small" appearance={d.hero === h ? 'primary' : 'outline'} aria-pressed={d.hero === h} onClick={() => patch({ hero: h })}>
                  {heroLabels[h]}
                </Button>
              ))}
            </div>
          </Field>
          <Field label={t('ヘッドラインの置き方', 'Headline placement')} size="small">
            <Select size="small" value={d.heroText ?? 'band'} onChange={(_, x) => patch({ heroText: x.value as HeroText })}>
              {(['below', 'overlay', 'band'] as HeroText[]).map((h) => (
                <option key={h} value={h}>{heroTextLabels[h]}</option>
              ))}
            </Select>
          </Field>
          <Field label={t('画像のリンク先(既定)', 'Image link (default)')} size="small">
            <Select size="small" value={d.heroLink ?? 'campaign'} onChange={(_, x) => patch({ heroLink: x.value === 'campaign' ? undefined : (x.value as LinkKind) })}>
              {LINK_KINDS.map((k) => (
                <option key={k} value={k}>{linkKindLabel(k)}</option>
              ))}
            </Select>
          </Field>
          <Checkbox label={t('お知らせ帯を、メールの最上部に置く', 'Show the top bar at the very top')} checked={!!d.topBar} onChange={(_, x) => patch({ topBar: x.checked === true || undefined })} />
        </div>

        <div className={s.grp}>
          <span className={s.grpTitle}>{t('状況', 'Status')}</span>
          {kv(t('商品の枠', 'Product slots'), <strong>{t(`${boxCount} 点`, `${boxCount}`)}</strong>)}
          {kv(t('ボタン · テキスト', 'Buttons · text'), <strong>{`${countParts('button')} · ${countParts('text')}`}</strong>)}
          {kv(t('版', 'Version'), <strong>{d.id ? t(`版 ${cur} → 保存で 版 ${cur + 1}`, `v${cur} → v${cur + 1} on save`) : t('新規(保存で 版 1)', 'New (v1 on save)')}</strong>)}
          {kv(t('使っている配信', 'Deliveries using it'), <strong>{t(`${used} 本`, `${used}`)}</strong>)}
          {kv(
            t('同じ構成のテンプレート', 'Template with the same layout'),
            sameAs ? (
              <Button
                size="small"
                appearance="transparent"
                onClick={() => {
                  setCompareId(sameAs.o.id)
                  if (!listOpen) toggleList()
                }}
              >
                {t(`「${sameAs.o.label}」を見比べる`, `Compare "${sameAs.o.label}"`)}
              </Button>
            ) : (
              <strong>{t('なし', 'None')}</strong>
            ),
          )}
        </div>

        <div className={s.grp} style={{ borderBottom: 'none' }}>
          <span className={s.grpTitle}>{t('構成(押すと、そこへ)', 'Outline (click to go there)')}</span>
          <div className={s.tree}>
            {d.sections.map((sec, si) => (
              <button key={sec.id ?? si} type="button" className={s.treeItem} onClick={() => sec.id && editor.goSection(sec.id)}>
                {`S${si + 1}${sec.name?.trim() ? ` ${sec.name.trim()}` : ''} · ${(sec.rows ?? 0) > 0 ? `${sec.cols} × ${sec.rows}` : t('空', 'empty')} · ${t(`商品 ${sec.slots}`, `${sec.slots} items`)}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

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
                // 一覧(たたむ) | パーツ | キャンバス | 右のタブ。境目はスプリッターで幅を変える(キャンバスは残りの幅)
                <div ref={gridRef} className={s.editor3} style={{ gridTemplateColumns: `${listOpen ? colW.list : 32}px 1px ${colW.palette}px 1px minmax(${CANVAS_MIN}px, 1fr) 1px ${colW.props}px` }}>
                  {compareCol()}
                  {/* 列の境界。つかんで幅を変える(一覧を閉じているときは、一覧の幅は変えない) */}
                  <div className={s.splitCell} style={{ gridArea: 's1' }}>{listOpen && <Splitter onDrag={resizeCol('list', 1)} />}</div>
                  <div className={s.splitCell} style={{ gridArea: 's2' }}>
                    <Splitter onDrag={resizeCol('palette', 1)} />
                  </div>
                  <div className={s.splitCell} style={{ gridArea: 's3' }}>
                    <Splitter onDrag={resizeCol('props', -1)} />
                  </div>
                  <aside className={s.paletteCol} aria-label={t('パーツ', 'Parts')}>
                    {editor.palette}
                  </aside>
                  <div className={s.areaCanvas}>
                    <div className={s.canvasHead}>
                      <Text size={200} weight="semibold">{t('キャンバス', 'Canvas')}</Text>
                      <span className={s.caption} style={{ marginLeft: 8 }}>{t(`商品の枠 ${boxCount} 点`, `${boxCount} product slots`)}</span>
                      <span className={s.grow} />
                      {editor.samplesToggle}
                      {editor.zoomBar}
                      <Tooltip relationship="label" content={t('元に戻す(Ctrl+Z)', 'Undo (Ctrl+Z)')}>
                        <Button size="small" appearance="subtle" icon={<ArrowUndoRegular />} disabled={histCount.past === 0} onClick={undo} />
                      </Tooltip>
                      <Tooltip relationship="label" content={t('やり直す(Ctrl+Shift+Z)', 'Redo (Ctrl+Shift+Z)')}>
                        <Button size="small" appearance="subtle" icon={<ArrowRedoRegular />} disabled={histCount.future === 0} onClick={redo} />
                      </Tooltip>
                    </div>
                    {editor.canvas}
                  </div>
                  <div className={s.propsCol}>{editor.rightPane(templateTab(draft))}</div>
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
