import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  MessageBar,
  MessageBarActions,
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
import { AddRegular, ArrowRedoRegular, ArrowResetRegular, ArrowUndoRegular, ChevronDownRegular, ChevronRightRegular, CopyRegular, DeleteRegular, EditRegular, EyeOffRegular, EyeRegular, MailRegular, PhoneRegular, SubtractRegular } from '@fluentui/react-icons'
import { AiButton } from './AiButton'
import { AutoTextarea } from './AutoTextarea'
import { shapeOf, similarity } from './templateShape'
import { ImportSectionMenu, SimilarTemplates } from './SimilarTemplates'
import { TemplateCompareFloat } from './TemplateCompare'
import { TemplateAiDialog } from './TemplateAiDialog'
import { TemplateAiEditDialog } from './TemplateAiEditDialog'
import type { TemplateEditOut } from './templateEdit'
import { LabeledValue } from './LabeledValue'
import { typo } from './typo'
import type { TemplateDraftOut } from './templateDraft'
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
import { usePaneWidths } from './floatLayout'
import { PREF } from './prefKeys'
import { BigFloat } from './BigFloat'
import { useTableEditor } from './TemplateTableEditor'
import { duplicateSection, ratioLabel, toTableLayout } from './tables'
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
  type HeroStyle,
  type MediaRatio,
  MEDIA_RATIOS,
} from './templates'

/**
 * 編集中の内容。構成は、表のセクションの並びだけで持つ(T8。docs/TEMPLATE_OBJECTS.md)。
 * 以前の種類のセクション・独立したボタンは、開いたときに表に直す(tables.ts の toTableLayout。保存すると、以後は表の形で持つ)
 */
interface Draft extends Pick<TemplateLayout, 'hero' | 'heroText' | 'topBar' | 'heroLink' | 'heroStyle'> {
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
const layoutOf = (d: Draft): TemplateLayout => ({ hero: d.hero, heroText: d.heroText, topBar: d.topBar, heroLink: d.heroLink, sections: d.sections, ...(d.heroTable ? { heroTable: d.heroTable } : {}), ...(d.heroStyle ? { heroStyle: d.heroStyle } : {}) })

/** 編集中の列の幅(一覧・パーツ・右のタブ。キャンバスは残り)を覚えておく所(その人のブラウザだけ。列の並びを変えたので、以前の鍵とは別) */
const EDITOR_WIDTHS_KEY = 'ccp.templateEditorWidths2'
type EditorWidths = { palette: number; props: number }
const EDITOR_WIDTHS: EditorWidths = { palette: 190, props: 330 }
const clampWidths = (w: EditorWidths): EditorWidths => ({
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
/** 列の間(境界 2 本 + 間隔 4 つ) */
const EDITOR_GAPS = 2 + 4 * 10

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
  // 設定の画面の中では、右の欄の残りの高さいっぱいに(一覧と詳しい欄は、それぞれの中で送る)
  inline: { display: 'flex', flexDirection: 'column', minHeight: '480px', flexGrow: 1, border: `1px solid ${tokens.colorNeutralStroke2}`, borderRadius: tokens.borderRadiusMedium, overflow: 'hidden' },
  head: { display: 'flex', alignItems: 'center', columnGap: '8px', padding: '12px 16px', borderBottom: `1px solid ${tokens.colorNeutralStroke2}` },
  grow: { flexGrow: 1 },
  // 一覧 | 境目 | 詳しい欄。一覧の幅は境目をつかんで変え、覚える(usePaneWidths。列は --cols で渡す)。詳しい欄は残りの幅
  split: { flexGrow: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'var(--cols)' },
  // 一覧は、広ければ 2 列、狭くしたら 1 列(カードが細くつぶれないように、1 枚の幅の下限を決める)。
  // 見比べやすいように、見取り図と説明を、同じ高さのカードに並べる
  list: {
    minHeight: 0,
    overflowY: 'auto',
    padding: '12px',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
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
  // 詳しい欄が狭いとき(一覧を広げたとき・設定の画面の中)は、プレビューを下に回す(横に並べたままだと、説明の文字が 1 文字ずつ縦に折り返して重なるため。T11)
  editorGrid: { display: 'flex', flexWrap: 'wrap', columnGap: '16px', rowGap: '14px', alignItems: 'flex-start' },
  fields: { display: 'grid', rowGap: '14px', minWidth: 0, flex: '1 1 260px' },
  // 縦長の見取り図をスクロールしても、編集欄と並べて見られるように、上に貼り付ける
  preview: { display: 'grid', rowGap: '6px', justifyItems: 'start', position: 'sticky', top: 0, flex: '0 0 auto', maxWidth: '100%' },
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
  // 編集中: 2 列の大きな一覧の代わりに、部品 | キャンバス | 設定と構成の一覧 の 3 列にする(ほかのテンプレートとの比べは、右のタブの「似ているテンプレート」。2026-10-28)。
  // 部品は、主な落とし先のキャンバスの左隣に、設定は右に置く(左から取って、中で組み、右で整える。2026-10-22 利用者の指示)
  splitEditing: { gridTemplateColumns: 'minmax(0, 1fr)' },
  listHidden: { display: 'none' },
  editor3: {
    display: 'grid',
    // 列の幅は、境目をつかんで変わるので、描くときに style で決める
    gridTemplateAreas: '"palette s2 canvas s3 fields"',
    columnGap: '10px',
    alignItems: 'start',
  },
  // 拡大したとき、隣の列にはみ出さず、枠の中で横にスクロールするように(グリッドの子は、既定では中身より狭くならない)
  areaCanvas: { gridArea: 'canvas', minWidth: 0 },
  canvasScroll: { width: '100%', boxSizing: 'border-box' },
  // 境界の線は、いちばん長い列(設定)の高さまで伸ばす
  splitCell: { alignSelf: 'stretch', display: 'grid' },
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
  // 狭いときは、文字を縦に折らずに、行を折り返す(「キャ / ン / バ / ス」「AI / で / 直 / す」のように細く並ぶと、読めず、ボタンにも見えないため。2026-10-28 利用者)
  canvasHead: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '2px', rowGap: '2px', width: '100%', whiteSpace: 'nowrap' },
  // 「AI で直す」は、直す相手(キャンバス)の見出しの先頭に、文字のすぐ右に置く(ほかの AI のボタンと同じく、直す相手のすぐそば)
  canvasAi: { marginLeft: '8px', marginRight: '4px' },
  // AI の直しを試しているときの帯(キャンバスのすぐ上)
  // キャンバスを下に送っても、確定・やめるが見えるように、上に貼り付ける
  trialBar: { marginBottom: '8px', position: 'sticky', top: 0, zIndex: 3 },
  trialHead: { ...typo.heading, display: 'block' },
  trialText: { display: 'block', marginTop: '2px' },
  trialFacts: { display: 'flex', flexWrap: 'wrap', columnGap: '16px', rowGap: '2px', marginTop: '4px' },
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
export function TemplateManager({ cards, products = [], country, onChanged, onOpenCard, inline }: { cards: DeliveryCard[]; products?: Product[]; country?: string; onChanged: () => Promise<void>; onOpenCard: (id: string) => void; /** 設定の画面(ST10)の中に描く(窓・閉じるボタンを出さない。配信カードの「テンプレートを管理」からは窓) */ inline?: boolean }) {
  const open = useTemplateManagerOpen()
  useTemplates() // 登録が変わったら、一覧を描き直す
  const t = useT()
  const s = useStyles()
  // 一覧の幅(T11。詳しい欄を広くしたいときは、一覧を狭める)。既定は 1 列の幅(詳しい欄を広く。広げれば 2 列になる)
  const panes = usePaneWidths(PREF.templateListWidth, [320, 0], 1, { min: 240, max: 760 })
  // 設定の画面の中は幅が狭いことがあるので、覚えた幅のままだと詳しい欄がはみ出す。詳しい欄に 320px は残す(一覧は 240px まで縮む)
  const listCols = `min(${panes.widths[0]}px, max(240px, calc(100% - 321px))) 1px minmax(0, 1fr)`
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
  // AI で直すの、頼むフロートと、試している直し。編集を始めるたびに捨てる(前の編集で試していた直しを、持ち越さない)
  const [aiEditOpen, setAiEditOpen] = useState(false)
  const [aiTrial, setAiTrial] = useState<{ before: Draft; out: TemplateEditOut; request: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selected = options.find((o) => o.id === selectedId) ?? options[0]
  const editing = draft !== null
  // 見比べるフロートで、今の編集中と並べているテンプレート(似ているテンプレートの「見比べる」)
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
  }, [zoom, draft, selectedId, viewKey]) // 列の幅が変わったときは、枠の大きさの変化(ResizeObserver)で測り直す
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
      const room = gridW - EDITOR_GAPS - CANVAS_MIN - next.palette - next.props
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
    setAiTrial(null)
    setError(null)
    setSelectedId('')
    setCompareId(null)
    setDraft(channel === 'push' ? { ...newDraft(), push: { image: true, buttons: [] } } : newDraft())
  }
  /** そのテンプレートを複製して、編集(新規)を始める(一覧で選んだもの・AI で作るの「近いテンプレート」) */
  const duplicateFrom = (o: (typeof options)[number]) => {
    setAiTrial(null)
    setError(null)
    setCompareId(null)
    setDraft({
      name: t(`${o.label} のコピー`, `Copy of ${o.label}`),
      description: o.description,
      hero: o.hero,
      heroText: o.heroText,
      topBar: o.topBar,
      heroLink: o.heroLink,
      heroStyle: o.heroStyle,
      sections: toTableLayout(o).sections,
      heroTable: toTableLayout(o).heroTable,
      push: o.push ? { ...o.push, buttons: [...o.push.buttons] } : undefined,
    })
    setSelectedId('')
  }
  const startDuplicate = () => {
    if (selected) duplicateFrom(selected)
  }
  // AI でテンプレートを作る(T9)。AI の下書きは保存せず、編集(新規)に入れるだけ(保存は人が確かめてから)
  const [aiOpen, setAiOpen] = useState(false)
  const startFromAi = (d: TemplateDraftOut) => {
    setAiTrial(null)
    setAiOpen(false)
    setError(null)
    setCompareId(null)
    setSelectedId('')
    setDraft({ name: d.name, description: d.description, hero: d.hero, heroText: d.heroText, sections: d.sections, ...(d.heroTable ? { heroTable: d.heroTable } : {}) })
  }
  // AI で直す(TEMPLATE_OBJECTS.md の 11 章)。返答はキャンバスに仮に当て(元に戻すの履歴には乗せない)、「確定」で取り込む
  // 印を付けるマス: 設定が変わった・足した部品(動いただけのものには付けない。行を足すと下の行がすべて動くため)
  const aiMarks = useMemo(() => (aiTrial ? new Set([...aiTrial.out.diff.changed, ...aiTrial.out.diff.added]) : undefined), [aiTrial])
  // 自由な並び(free)は、決まった構成がないので、編集するものがない
  const canEdit = (o?: { id: string }) => !!o && o.id !== 'free'
  const startEdit = () => {
    setAiTrial(null)
    if (!selected || !canEdit(selected)) return
    setError(null)
    setCompareId(null)
    setDraft({ id: selected.id, name: selected.label, description: selected.description, hero: selected.hero, heroText: selected.heroText, topBar: selected.topBar, heroLink: selected.heroLink, heroStyle: selected.heroStyle, sections: toTableLayout(selected).sections, heroTable: toTableLayout(selected).heroTable, push: selected.push })
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
  /** AI の直しを、キャンバスに仮に当てる(元に戻すの履歴には乗せない) */
  const tryAiEdit = (out: TemplateEditOut, request: string) => {
    if (!draft) return
    setAiEditOpen(false)
    const before = aiTrial?.before ?? draft
    setAiTrial({ before, out, request })
    hist.current.skip = true
    setDraft({ ...before, sections: out.sections, heroTable: out.heroTable })
  }
  /** やめる: 直す前の形に戻す */
  const cancelAiEdit = () => {
    if (!aiTrial) return
    hist.current.skip = true
    setDraft(aiTrial.before)
    setAiTrial(null)
  }
  /** 確定: 今の形(AI の直し)のまま、元に戻すの履歴に直す前の形を 1 つ足す(Ctrl+Z で戻せる) */
  const confirmAiEdit = () => {
    if (!aiTrial) return
    const h = hist.current
    h.past = [...h.past.slice(-99), aiTrial.before]
    h.future = []
    setHistCount({ past: h.past.length, future: 0 })
    setAiTrial(null)
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
    // AI の直しを試しているあいだは、キャンバスのキー操作を受けない(確定・やめるのどちらかを選んでから)
    active: editing && !aiTrial,
    marks: aiMarks,
    sections: draft?.sections ?? [],
    heroTable: draft?.heroTable,
    setHeroTable,
    setSections,
    hero: draft?.hero ?? 'standard',
    heroText: draft?.heroText,
    topBar: draft?.topBar,
    heroStyle: draft?.heroStyle,
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

  const optionOf = (id: string) => options.find((o) => o.id === id)
  /** 相手のセクションを、新しい ID で今の下書きの末尾に足す(部品の ID も新しく。UTM・ピン・配信の中身が、相手のテンプレートの部品とつながらないように)。Ctrl+Z で戻せる */
  const importSection = (sec: Section) => {
    const copy = duplicateSection(sec)
    setSections((list) => [...list, copy])
    if (copy.id) window.setTimeout(() => editor.goSection(copy.id!), 0)
  }
  /** 似ているテンプレートを開く(編集をやめて、その詳しい欄へ。編集した内容があれば、捨ててよいか確かめる) */
  const openOther = (id: string) => {
    setCompareId(null)
    choose(id)
  }
  /** 似ているテンプレートを複製して、新しく直し始める */
  const duplicateOther = (id: string) => {
    const o = optionOf(id)
    if (!o) return
    if (histCount.past > 0 && !window.confirm(t('編集中の内容を破棄して、複製から始めます。よろしいですか?', 'Discard the current edits and start from a copy?'))) return
    duplicateFrom(o)
  }
  // 右のタブの「似ているテンプレート」の欄(状況の「同じ構成のテンプレート」から、そこへ動く)
  const similarRef = useRef<HTMLDivElement>(null)
  const compared = compareId ? others.find((x) => x.o.id === compareId) : undefined

  // 元に戻す・やり直す(入力欄の中では、ブラウザの元に戻すなどを、そのまま使う)。表の操作のキーは、表の編集(TemplateTableEditor)が受ける
  useEffect(() => {
    if (!draft) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return
      // AI の直しを試しているあいだは、元に戻さない(「やめる」で戻す)
      if (aiTrial) return
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
    const hs = d.heroStyle ?? {}
    // ヒーローの細かい見た目を直す(空になった項目は持たない)
    const setHs = (x: Partial<HeroStyle>) => {
      const next = Object.fromEntries(Object.entries({ ...hs, ...x }).filter(([, v]) => v !== undefined)) as HeroStyle
      patch({ heroStyle: Object.keys(next).length > 0 ? next : undefined })
    }
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
          {/* ヒーローの細かい見た目(T8 の 8.6) */}
          <Field label={t('写真の形', 'Photo shape')} size="small">
            <Select size="small" value={hs.ratio ?? ''} onChange={(_, x) => setHs({ ratio: (x.value || undefined) as MediaRatio | undefined })}>
              <option value="">{t('既定(ヘッドラインの置き方に合わせる)', 'Default (follows the headline placement)')}</option>
              {MEDIA_RATIOS.map((r) => (
                <option key={r} value={r}>{ratioLabel(r)}</option>
              ))}
            </Select>
          </Field>
          {(d.heroText ?? 'band') !== 'below' && (
            <Field label={t('ヘッドラインの位置(縦)', 'Headline position (vertical)')} size="small">
              <div className={s.row}>
                {(['top', 'middle', 'bottom'] as const).map((v) => {
                  const on = (hs.v ?? ((d.heroText ?? 'band') === 'band' ? 'bottom' : 'middle')) === v
                  return (
                    <Button key={v} size="small" appearance={on ? 'primary' : 'outline'} aria-pressed={on} onClick={() => setHs({ v })}>
                      {{ top: t('上', 'Top'), middle: t('中央', 'Middle'), bottom: t('下', 'Bottom') }[v]}
                    </Button>
                  )
                })}
              </div>
            </Field>
          )}
          <Field label={t('ヘッドラインの位置(横)', 'Headline position (horizontal)')} size="small">
            <div className={s.row}>
              {(['left', 'center', 'right'] as const).map((h) => {
                const on = (hs.h ?? ((d.heroText ?? 'band') === 'band' ? 'left' : 'center')) === h
                return (
                  <Button key={h} size="small" appearance={on ? 'primary' : 'outline'} aria-pressed={on} onClick={() => setHs({ h })}>
                    {{ left: t('左', 'Left'), center: t('中央', 'Center'), right: t('右', 'Right') }[h]}
                  </Button>
                )
              })}
            </div>
          </Field>
          {(d.heroText ?? 'band') !== 'below' && (
            <>
              <Field label={t('文字の色', 'Text color')} size="small">
                <div className={s.row}>
                  {(['light', 'dark'] as const).map((c) => (
                    <Button key={c} size="small" appearance={(hs.color ?? 'light') === c ? 'primary' : 'outline'} aria-pressed={(hs.color ?? 'light') === c} onClick={() => setHs({ color: c === 'light' ? undefined : c })}>
                      {c === 'light' ? t('白', 'White') : t('黒', 'Black')}
                    </Button>
                  ))}
                </div>
              </Field>
              <Field label={(d.heroText ?? 'band') === 'band' ? t('帯の濃さ', 'Band strength') : t('写真に重ねる暗さ', 'Darken the photo')} size="small">
                <Select size="small" value={String(hs.shade ?? ((d.heroText ?? 'band') === 'band' ? 2 : 0))} onChange={(_, x) => setHs({ shade: Number(x.value) as 0 | 1 | 2 | 3 })}>
                  <option value="0">{t('なし', 'None')}</option>
                  <option value="1">{t('薄く', 'Light')}</option>
                  <option value="2">{t('ふつう', 'Normal')}</option>
                  <option value="3">{t('濃く', 'Strong')}</option>
                </Select>
              </Field>
            </>
          )}
          <Checkbox label={t('お知らせ帯を、メールの最上部に置く', 'Show the top bar at the very top')} checked={!!d.topBar} onChange={(_, x) => patch({ topBar: x.checked === true || undefined })} />
          {d.topBar && (
            <Field label={t('お知らせ帯の文言(空は配信名)', 'Top bar text (empty uses the delivery name)')} size="small">
              <Input size="small" value={hs.barText ?? ''} maxLength={60} onChange={(_, x) => setHs({ barText: x.value || undefined })} />
            </Field>
          )}
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
              <Button size="small" appearance="transparent" onClick={() => similarRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>
                {t(`「${sameAs.o.label}」(似ているテンプレートへ)`, `"${sameAs.o.label}" (see similar templates)`)}
              </Button>
            ) : (
              <strong>{t('なし', 'None')}</strong>
            ),
          )}
        </div>

        {!d.push && (
          <div ref={similarRef} className={s.grp}>
            <SimilarTemplates entries={others} onCompare={setCompareId} onImport={(_, sec) => importSection(sec)} onOpen={openOther} onDuplicate={duplicateOther} />
          </div>
        )}

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

  // 題(編集中は、一覧に戻れるパンくず)
  const title = (
    <>
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
    </>
  )

  const content = (
    <>
          <div className={mergeClasses(s.split, editing && s.splitEditing)} style={editing ? undefined : ({ '--cols': listCols } as CSSProperties)}>
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
                {channel === 'email' && (
                  <AiButton busy={false} onClick={() => setAiOpen(true)} disabled={editing}>
                    {t('AI で作る', 'Create with AI')}
                  </AiButton>
                )}
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
            {/* 編集中は一覧を隠すので、境目も出さない */}
            {!editing && <Splitter onDrag={panes.onDrag(0)} onDone={panes.onDone} label={t('一覧の幅を変える', 'Resize the list')} />}

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
                // パーツ | キャンバス | 右のタブ。境目はスプリッターで幅を変える(キャンバスは残りの幅)
                <div ref={gridRef} className={s.editor3} style={{ gridTemplateColumns: `${colW.palette}px 1px minmax(${CANVAS_MIN}px, 1fr) 1px ${colW.props}px` }}>
                  {/* 列の境界。つかんで幅を変える */}
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
                      {!draft.push && (
                        <span className={s.canvasAi}>
                          <AiButton busy={false} onClick={() => setAiEditOpen(true)} disabled={!!aiTrial}>
                            {t('AI で直す', 'Edit with AI')}
                          </AiButton>
                        </span>
                      )}
                      <span className={s.caption} style={{ marginLeft: 8 }}>{t(`商品の枠 ${boxCount} 点`, `${boxCount} product slots`)}</span>
                      <span className={s.grow} />
                      {editor.samplesToggle}
                      {editor.zoomBar}
                      <Tooltip relationship="label" content={t('元に戻す(Ctrl+Z)', 'Undo (Ctrl+Z)')}>
                        <Button size="small" appearance="subtle" icon={<ArrowUndoRegular />} disabled={histCount.past === 0 || !!aiTrial} onClick={undo} />
                      </Tooltip>
                      <Tooltip relationship="label" content={t('やり直す(Ctrl+Shift+Z)', 'Redo (Ctrl+Shift+Z)')}>
                        <Button size="small" appearance="subtle" icon={<ArrowRedoRegular />} disabled={histCount.future === 0 || !!aiTrial} onClick={redo} />
                      </Tooltip>
                    </div>
                    {/* AI の直しを試しているとき: 何を変えたかと、確定・やめる(試す → 確定。保存はいつもの「保存」) */}
                    {aiTrial && (
                      <MessageBar intent="info" layout="multiline" className={s.trialBar}>
                        <MessageBarBody>
                          <span className={s.trialHead}>{t('AI の直しを試しています(まだ取り込んでいません)', 'Trying the AI change (not applied yet)')}</span>
                          {aiTrial.out.summary && <span className={s.trialText}>{aiTrial.out.summary}</span>}
                          <span className={s.trialFacts}>
                            <LabeledValue label={t('変えた部品', 'Changed')}>{aiTrial.out.diff.changed.length}</LabeledValue>
                            <LabeledValue label={t('足した部品', 'Added')}>{aiTrial.out.diff.added.length}</LabeledValue>
                            <LabeledValue label={t('消した部品', 'Removed')}>{aiTrial.out.diff.removed.length}</LabeledValue>
                            {aiTrial.out.diff.reordered && <LabeledValue label={t('セクションの並び', 'Section order')}>{t('変わった', 'Changed')}</LabeledValue>}
                          </span>
                        </MessageBarBody>
                        <MessageBarActions>
                          <Button size="small" appearance="primary" onClick={confirmAiEdit}>
                            {t('確定', 'Confirm')}
                          </Button>
                          <Button size="small" onClick={cancelAiEdit}>
                            {t('やめる', 'Cancel')}
                          </Button>
                          <Button size="small" appearance="subtle" onClick={() => setAiEditOpen(true)}>
                            {t('頼み直す', 'Ask again')}
                          </Button>
                        </MessageBarActions>
                      </MessageBar>
                    )}
                    {/* 試しているあいだは、キャンバスを触れない(確定・やめるのどちらかを選んでから直す) */}
                    <div inert={!!aiTrial || undefined}>{editor.canvas}</div>
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
          </div>
          {draft && (
            <div className={s.actions}>
              <span className={s.grow} />
              <Button appearance="secondary" onClick={() => { setDraft(null); setError(null) }} disabled={busy}>{t('キャンセル', 'Cancel')}</Button>
              <Button appearance="primary" onClick={() => void save()} disabled={!valid || busy || !!aiTrial}>{busy ? t('保存中...', 'Saving...') : t('保存', 'Save')}</Button>
            </div>
          )}
      {draft && mine && compared && (
        <TemplateCompareFloat
          onClose={() => setCompareId(null)}
          items={[
            { key: 'mine', label: draft.name || t('新しいテンプレート', 'New template'), layout: mine, note: draft.id ? t('編集中', 'Editing') : t('編集中(新規)', 'Editing (new)') },
            {
              key: compared.o.id,
              label: compared.o.label,
              layout: compared.o,
              note: compared.same ? t('同じ構成', 'Same layout') : t(`似ている度 ${Math.round(compared.score * 100)}%`, `${Math.round(compared.score * 100)}% similar`),
              actions: (
                <>
                  <ImportSectionMenu layout={compared.o} onImport={importSection} />
                  <Button size="small" appearance="subtle" onClick={() => openOther(compared.o.id)}>
                    {t('開く', 'Open')}
                  </Button>
                  <Button size="small" appearance="subtle" onClick={() => duplicateOther(compared.o.id)}>
                    {t('複製して直す', 'Duplicate and edit')}
                  </Button>
                </>
              ),
            },
          ]}
        />
      )}
      {aiEditOpen && draft && (
        <TemplateAiEditDialog
          // 頼み直すときも、直す前の形に頼む(試している形に重ねて直さない)
          current={aiTrial?.before ?? draft}
          initial={aiTrial?.request}
          onResult={tryAiEdit}
          onClose={() => setAiEditOpen(false)}
        />
      )}
      {aiOpen && (
        <TemplateAiDialog
          options={options.filter((o) => !o.hidden)}
          onUse={(id) => {
            setAiOpen(false)
            choose(id)
          }}
          onDuplicate={(id) => {
            const o = options.find((x) => x.id === id)
            setAiOpen(false)
            if (o) duplicateFrom(o)
          }}
          onDraft={startFromAi}
          onClose={() => setAiOpen(false)}
        />
      )}
    </>
  )
  if (inline)
    return (
      <div className={s.inline}>
        {/* 設定の画面では、見出しは設定の画面が出すので、編集中のパンくずだけを出す */}
        {draft && <div className={s.head}>{title}</div>}
        {content}
      </div>
    )
  // 配信カードから開く窓も、設定の画面からのフロート(TemplateFloat)と同じ大きな作業のフロート(大きさを変えられ・動かせ・画面いっぱいまで広げられる。大きさは同じ鍵で覚える。T11)
  return open ? (
    <BigFloat sizeKey="templateManager" title={title} onClose={close}>
      {content}
    </BigFloat>
  ) : null
}
