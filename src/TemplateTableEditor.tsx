import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Checkbox, Field, Input, Menu, MenuDivider, MenuItem, MenuList, MenuPopover, MenuTrigger, Popover, PopoverSurface, PopoverTrigger, Portal, Select, Slider, Tab, TabList, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { AddRegular, ArrowDownRegular, ArrowUpRegular, ChevronDownRegular, ChevronRightRegular, CopyRegular, DeleteRegular, MoreHorizontalRegular, SettingsRegular, SubtractRegular } from '@fluentui/react-icons'
import { AutoTextarea } from './AutoTextarea'
import { SelBar } from './SelBar'
import { useT } from './i18n'
import { CELL_VIEWS, cellViewLabel, isTextView, type CellView } from './cells'
import { MAX_SECTIONS } from './layoutTemplates'
import { getUiScale } from './uiScale'
import { BOX_PLACES, type BoxPlace, BOX_FIELDS, LINK_KINDS, MEDIA_RATIOS, ratioValue, defaultButtonLabel, type HeroStyle, type ButtonColor, type MediaRatio, type SectionBg, type TextAlign, linkKindLabel, type HeroKind, type BoxField, type HeroText, type LinkKind, type PartType, type Section, type TablePart } from './templates'
import * as T from './tables'
import { PartImagePick } from './PartImagePick'
import { elementClickable, elementDesc, elementLabel, partContent, partElements } from './elements'
import { STAR_COLOR } from './swatches'

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
const SAMPLES_KEY = 'ccp.templateCanvasSamples'

const useStyles = makeStyles({
  // ---- 右のタブの設定のまとまり(見出し付き・畳める)と、2〜3 択の横並びのボタン(2026-10-26 利用者が見本を見て決めた)
  grp: { display: 'grid', rowGap: '8px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: '10px', paddingBottom: '2px', ':first-child': { borderTop: 'none', paddingTop: '2px' } },
  grpHead: { display: 'flex', alignItems: 'center', columnGap: '4px', padding: 0, border: 'none', backgroundColor: 'transparent', cursor: 'pointer', fontSize: '13px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground1, textAlign: 'left' },
  grpBody: { display: 'grid', rowGap: '10px', '& .fui-Field .fui-Field__label': { fontSize: '12px', color: tokens.colorNeutralForeground3 } },
  grpWrap: { display: 'grid', rowGap: '12px' },
  two: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', columnGap: '8px', alignItems: 'start' },
  seg: { display: 'inline-flex', flexWrap: 'wrap', border: `1px solid ${tokens.colorNeutralStroke1}`, borderRadius: tokens.borderRadiusMedium, overflow: 'hidden', justifySelf: 'start' },
  segBtn: { border: 'none', borderRight: `1px solid ${tokens.colorNeutralStroke2}`, padding: '3px 9px', fontSize: '12px', lineHeight: '18px', backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1, cursor: 'pointer', ':last-child': { borderRight: 'none' }, ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover } },
  segOn: { backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand, ':hover': { backgroundColor: tokens.colorBrandBackgroundHover } },
  hdActs: { display: 'inline-flex', alignItems: 'center', columnGap: '0px', flexShrink: 0 },
  openRight: { justifySelf: 'start' },

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
  // 札(S1)と、その横のセクションの削除。札の大きさは名前で変わるので、横に並べる
  tagRow: { position: 'absolute', top: '2px', left: 0, display: 'flex', alignItems: 'center', columnGap: '2px', maxWidth: '85%' },
  tagDel: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 3px',
    border: 'none',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground3,
    fontSize: '13px',
    cursor: 'pointer',
    opacity: 0.6,
    ':hover': { opacity: 1, color: tokens.colorPaletteRedForeground1, backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  tag: {
    minWidth: 0,
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
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  shead: { textAlign: 'center', padding: '2px 0 6px', display: 'grid', rowGap: '2px' },
  sheadTitle: { fontSize: '12px', fontWeight: 700, letterSpacing: '2px' },
  sheadCopy: { fontSize: '10px', color: MAIL.sub },
  // 見出し・コピーの帯(× で消す)と、消えている所の「＋ 見出し」「＋ コピー」(キャンバスの上で出し入れする)
  sheadItem: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', columnGap: '4px', justifySelf: 'center' },
  sheadX: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0 2px',
    border: 'none',
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground3,
    fontSize: '11px',
    lineHeight: '14px',
    cursor: 'pointer',
    opacity: 0.5,
    ':hover': { opacity: 1, color: tokens.colorPaletteRedForeground1, backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  sheadAdd: { display: 'flex', justifyContent: 'center', columnGap: '6px' },
  sheadAddBtn: {
    fontSize: '10px',
    lineHeight: '14px',
    padding: '0 6px',
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusSmall,
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground3,
    cursor: 'pointer',
    opacity: 0.55,
    ':hover': { opacity: 1, color: tokens.colorBrandForeground1, border: `1px dashed ${tokens.colorBrandStroke1}` },
  },
  barIcon: { display: 'inline-flex', alignItems: 'center', columnGap: '2px' },
  // 右のタブの部品の行の削除(空きにする)
  pdel: { display: 'inline-flex', alignItems: 'center', padding: '2px', borderRadius: tokens.borderRadiusSmall, color: tokens.colorNeutralForeground3, cursor: 'pointer', ':hover': { color: tokens.colorPaletteRedForeground1, backgroundColor: tokens.colorNeutralBackground1Hover } },
  // 表の幅に収める(狭いときは 2 段に折り返す。キャンバスの外にはみ出して、横のスクロールが出ないように)
  bar: { display: 'flex', alignItems: 'center', columnGap: '2px', whiteSpace: 'nowrap', padding: '2px 4px', borderRadius: tokens.borderRadiusMedium, backgroundColor: tokens.colorNeutralBackground1, boxShadow: tokens.shadow8, border: `1px solid ${tokens.colorNeutralStroke2}`, pointerEvents: 'auto' },
  // 帯を置く層(表のマスの範囲いっぱい。帯だけが押せる)
  barLayer: { position: 'relative', pointerEvents: 'none', zIndex: 4, minWidth: 0 },
  barHead: { fontWeight: tokens.fontWeightSemibold, color: tokens.colorBrandForeground1 },
  barBtn: { fontSize: '11px', lineHeight: '18px', padding: '1px 6px', border: 'none', borderRadius: tokens.borderRadiusSmall, backgroundColor: 'transparent', color: tokens.colorNeutralForeground1, cursor: 'pointer', ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover }, ':disabled': { color: tokens.colorNeutralForegroundDisabled, cursor: 'default', backgroundColor: 'transparent' } },
  barSep: { width: '1px', height: '14px', backgroundColor: tokens.colorNeutralStroke2, margin: '0 2px' },
  heroSec: { margin: '6px 10px 0', padding: '18px 0 4px', borderTop: `1px dashed ${MAIL.line}` },
  heroTag: { position: 'absolute', top: '2px', left: 0, fontSize: '10px', color: tokens.colorNeutralForeground3 },
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
  evenStrip: { display: 'grid', columnGap: `${GAP}px`, alignItems: 'stretch', minWidth: 0 },
  evenEmpty: { display: 'grid', placeItems: 'center', fontSize: '10px', color: tokens.colorNeutralForeground3, border: `1px dashed ${tokens.colorNeutralStroke2}`, borderRadius: '3px' },
  evenPlus: { padding: 0, fontSize: '12px', border: `1px dashed ${tokens.colorNeutralStroke1}`, borderRadius: '3px', backgroundColor: 'transparent', color: tokens.colorNeutralForeground3, cursor: 'pointer', ':hover': { color: tokens.colorBrandForeground1, border: `1px dashed ${tokens.colorBrandStroke1}` }, ':disabled': { opacity: 0.4, cursor: 'default' } },
  cellSel: { outline: `2px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px' },
  peek: { boxShadow: `0 0 0 3px ${tokens.colorPaletteYellowBorderActive}` },
  hot: { boxShadow: `inset 0 0 0 2px ${tokens.colorBrandStroke1}`, backgroundColor: tokens.colorBrandBackground2 },
  eTop: { boxShadow: `inset 0 4px 0 ${tokens.colorBrandBackground}` },
  eBottom: { boxShadow: `inset 0 -4px 0 ${tokens.colorBrandBackground}` },
  eLeft: { boxShadow: `inset 4px 0 0 ${tokens.colorBrandBackground}` },
  eRight: { boxShadow: `inset -4px 0 0 ${tokens.colorBrandBackground}` },
  tile: { position: 'relative', backgroundColor: MAIL.tile, borderRadius: '3px', display: 'grid', alignContent: 'end', overflow: 'hidden' },
  quickSurface: { width: '300px', display: 'grid', rowGap: '8px' },
  quickHead: { fontSize: '13px', fontWeight: tokens.fontWeightSemibold },
  boxBadge: { position: 'absolute', top: '3px', left: '22px', fontSize: '9px', fontWeight: 700, lineHeight: '14px', padding: '0 5px', borderRadius: '3px', color: '#fff' },
  miniCta: { justifySelf: 'start', fontSize: '9px', padding: '1px 6px', borderRadius: '3px', backgroundColor: MAIL.ink, color: '#fff' },
  tileNo: { position: 'absolute', top: '3px', left: '3px', minWidth: '16px', height: '16px', borderRadius: '8px', backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '10px', lineHeight: '16px', textAlign: 'center' },
  cap: { backgroundColor: 'rgba(255,255,255,0.9)', padding: '3px 6px', fontSize: '10px', display: 'grid', color: MAIL.ink },
  split: { display: 'grid', gridTemplateColumns: '1fr 1fr', backgroundColor: MAIL.panel, borderRadius: '3px', overflow: 'hidden', position: 'relative' },
  splitText: { display: 'grid', alignContent: 'center', rowGap: '3px', padding: '6px', fontSize: '10px', color: MAIL.sub },
  pill: { justifySelf: 'center', alignSelf: 'center', maxWidth: '100%', minWidth: '60%', padding: '5px 12px', borderRadius: '999px', fontSize: '11px', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', backgroundColor: MAIL.ink, color: '#fff' },
  pillText: { backgroundColor: 'transparent', minWidth: 0, padding: '5px 4px', fontWeight: 600, letterSpacing: '1px' },
  media: { position: 'relative', display: 'grid', placeItems: 'center', textAlign: 'center', padding: '4px', fontSize: '10px', color: MAIL.sub, backgroundColor: MAIL.img, backgroundSize: 'cover', backgroundPosition: 'center', borderRadius: '3px', overflow: 'hidden' },
  play: { width: '30px', height: '30px', borderRadius: '50%', display: 'grid', placeItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '12px' },
  swapTag: { position: 'absolute', top: '3px', left: '3px', fontSize: '9px', padding: '0 5px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.9)', color: MAIL.ink },
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
  pcardDim: { opacity: 0.55 },
  pcardCur: { backgroundColor: tokens.colorBrandBackground2 },
  tBox: { borderLeftColor: tokens.colorPaletteBlueBorderActive },
  tButton: { borderLeftColor: tokens.colorNeutralForeground1 },
  tText: { borderLeftColor: tokens.colorPaletteGreenBorderActive },
  tMedia: { borderLeftColor: tokens.colorPaletteBerryBorderActive },
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
  swatch: { display: 'inline-flex', alignItems: 'center', columnGap: '4px', fontSize: '11px', padding: '2px 6px', borderRadius: tokens.borderRadiusMedium, border: `1px solid ${tokens.colorNeutralStroke2}`, backgroundColor: tokens.colorNeutralBackground1, cursor: 'pointer', '& span': { width: '12px', height: '12px', borderRadius: '50%' } },
  swatchOn: { border: `2px solid ${tokens.colorBrandStroke1}` },
  pid: { fontFamily: tokens.fontFamilyMonospace, fontSize: '11px', color: tokens.colorNeutralForeground3 },
  spacer: { display: 'grid', placeItems: 'center', height: '100%', fontSize: '10px', color: tokens.colorNeutralForeground4, backgroundImage: `repeating-linear-gradient(45deg, transparent 0 6px, ${tokens.colorNeutralBackground3} 6px 7px)` },
  elHead: { fontSize: '12px', fontWeight: tokens.fontWeightSemibold, color: tokens.colorNeutralForeground3, marginTop: '4px' },
  elRow: { display: 'grid', rowGap: '2px', paddingLeft: '6px', borderLeft: `2px solid ${tokens.colorNeutralStroke2}` },
  elTop: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', columnGap: '6px', minWidth: 0 },
})

export interface TableEditorArgs {
  /** ヒーローのすぐ下の表(なければ、空の表として扱う。セクションの並びには入れない。T8 の 8.1) */
  heroTable?: Section
  setHeroTable: (sec: Section | undefined) => void
  /** 編集中か(編集していないときは、キー操作を受けない) */
  active: boolean
  sections: Section[]
  /** セクションの並びを変える(元に戻すは、呼ぶ側の編集中の内容の履歴で行う) */
  setSections: (fn: (list: Section[]) => Section[]) => void
  hero: HeroKind
  /** ヒーローの細かい見た目(キャンバスの絵に写す) */
  heroStyle?: HeroStyle
  heroText?: HeroText
  topBar?: boolean
  /** 見本の写真(T8 の確認 4・案 A): 箱に、商品のデータの写真・名前・価格を仮に入れて見せる(保存しない。並びの順に使い回す) */
  samples?: { src: string; name: string; price: string; regular?: string }[]
  /** ヒーローを押した(右のテンプレートのタブの、全体の見た目へ) */
  onSelectHero: () => void
}

/**
 * 表の編集。パーツの列・キャンバス・右のタブ(テンプレート / セクションと部品)を返す(並べ方とスプリッターは、呼ぶ側が決める)。
 * テンプレートのタブの中身は、呼ぶ側が作って rightPane に渡す
 */
export function useTableEditor({ active, sections, setSections, heroTable, setHeroTable, hero, heroStyle, heroText, topBar, samples = [], onSelectHero }: TableEditorArgs) {
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
  // 写した部品(Ctrl+C)。この画面の中だけで持つ
  const [clip, setClip] = useState<T.Clip | null>(null)
  // 右のタブ: 自分でタブを押したら固定。押していなければ、選んだものがあれば「セクションと部品」
  const [tab, setTab] = useState<'tpl' | 'obj'>('tpl')
  const [pinned, setPinned] = useState(false)
  // 右のカードの開け閉め。選んでいるものは自動で開くが、その選び方のあいだは、閉じたら閉じたまま(key: 閉じたときの選び方)
  const [fold, setFold] = useState<Record<string, { open: boolean; key: string }>>({})

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
  const [showSamples, setShowSamples] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SAMPLES_KEY) === '1'
    } catch {
      return false
    }
  })
  const toggleSamples = () =>
    setShowSamples((v) => {
      try {
        localStorage.setItem(SAMPLES_KEY, v ? '0' : '1')
      } catch {
        // 覚えられなくても、切り替えはできる
      }
      return !v
    })
  const sampleOf = (n: number) => (showSamples && samples.length > 0 ? samples[(Math.max(1, n) - 1) % samples.length] : undefined)
  const samplesToggle = (
    <Button size="small" appearance={showSamples ? 'primary' : 'subtle'} aria-pressed={showSamples} disabled={samples.length === 0} onClick={toggleSamples} title={t('箱に、商品のデータの写真・名前・価格を仮に入れて見せる(保存はしない)', 'Fill boxes with sample product photos, names and prices (not saved)')}>
      {t('見本の写真', 'Sample photos')}
    </Button>
  )
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

  // ヒーローの下の表(なければ空)。表の操作は、ほかのセクションと同じものを使う
  const heroSec: Section = heroTable ?? { kind: 'table', id: T.HERO_TABLE_ID, cols: 1, rows: 0, parts: [], slots: 0, copy: false }
  const isHero = (id?: string) => id === T.HERO_TABLE_ID
  const secOf = (id?: string) => (isHero(id) ? heroSec : sections.find((x) => x.id === id))
  const selSec = sel ? secOf(sel.sec) : undefined
  const selRect = sel?.kind === 'cells' && selSec ? T.rectOf(selSec, sel) : null
  const selParts = sel?.kind === 'cells' && selSec ? T.partsIn(selSec, sel) : []
  // 箱の番号(商品の載る順)は、テンプレート全体で通す
  const boxNo = new Map<string, number>()
  sections.forEach((sec) => T.boxesOf(sec).forEach((p) => boxNo.set(p.id, boxNo.size + 1)))

  const replace = (id: string, next: Section) => (isHero(id) ? setHeroTable(next) : setSections((list) => list.map((x) => (x.id === id ? next : x))))
  /** ヒーローの下には、箱(商品)は置かない(商品の枠の順・セクションの番号を変えないため) */
  const noBoxInHero = (secId: string | undefined, key: string): boolean => {
    const preset = key.startsWith('row:') ? T.ROW_PRESETS.find((x) => x.id === key.slice(4)) : undefined
    const hasBox = key === 'box' || !!preset?.parts.some(([type]) => type === 'box')
    if (isHero(secId) && hasBox) {
      setToast(t('ヒーローの下には、箱(商品)は置けません。ボタン・テキスト・画像を置けます', 'Boxes (products) can’t go under the hero. Use buttons, text or images'))
      return true
    }
    return false
  }
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
    if (isHero(id)) return
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
    if (isHero(id)) {
      setHeroTable(undefined)
      setSel(null)
      return
    }
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
    if (!sec || noBoxInHero(secId, type)) return
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
    if (noBoxInHero(sec?.id, key)) return
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
      // 置いたものと同じ 1 列で作る(列は右の + で足せる。以前は箱だけ 2 列にしていて、勝手に 2 列になった)
      const first = T.firstRow(sec, 1)
      if ('error' in first) return
      const p0 = T.partAt(first.sec, 0, 0)!
      res = { sec: T.setPartType(first.sec, p0.id, type), sel: { a: [0, 0], b: [0, 0] } }
    } else res = T.insertRow(sec, sec.rows ?? 0, type, type === 'box' ? { c: 0, w: 1 } : undefined)
    if ('error' in res) {
      if (res.error) setToast(res.error)
      return
    }
    const next = res.sec
    if (isHero(next.id)) setHeroTable(next)
    else setSections((list) => (isNew ? [...list, next] : list.map((x) => (x.id === next.id ? next : x))))
    if (res.sel) setSel({ kind: 'cells', sec: next.id!, ...res.sel })
  }

  /** パーツを落とした */
  const dropPart = (key: string, tg: DropTarget) => {
    if (tg.kind === 'gap') return addSection(tg.at)
    if (tg.kind === 'first') return addPart(key, tg.sec)
    const sec = secOf(tg.sec)
    if (!sec || noBoxInHero(tg.sec, key)) return
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
    { label: t('この行を複製(すぐ下に)', 'Duplicate this row (below)'), onClick: () => run(sec.id!, (x) => T.duplicateRow(x, r)) },
    {
      label: T.isEvenRow(sec, r) ? t('均等に並べるのをやめる(列に合わせる)', 'Stop spreading evenly (align to columns)') : t('この行を均等に並べる(中身のある部品を同じ幅で)', 'Spread this row evenly (same width for each filled part)'),
      onClick: () => run(sec.id!, (x) => T.toggleEvenRow(x, r)),
    },
    { label: t('この行から下を、新しいセクションに', 'Split into a new section from this row'), disabled: r === 0 || isHero(sec.id), onClick: () => splitAt(sec.id!, r) },
    { label: t('行を削除', 'Delete row'), onClick: () => run(sec.id!, (x) => T.deleteRow(x, r)) },
  ]
  const cellMenu = (sec: Section, ps: TablePart[], rc: T.Rect): MenuItem[] => [
    { label: t('コピー(Ctrl+C)', 'Copy (Ctrl+C)'), disabled: !ps.some((p) => p.type !== 'empty'), onClick: () => copy(sec, { a: [rc.c, rc.r], b: [rc.c + rc.w - 1, rc.r + rc.h - 1] }) },
    { label: t('貼り付け(Ctrl+V。空きのマスに)', 'Paste (Ctrl+V, into empty cells)'), disabled: !clip, onClick: () => paste(sec.id!, rc.c, rc.r) },
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
    { label: t('画像・動画', 'Image / video'), onClick: () => placeType(sec.id!, p.id, 'media') },
    { label: t('区切り線', 'Divider'), onClick: () => placeType(sec.id!, p.id, 'line') },
    { label: t('余白', 'Spacer'), onClick: () => placeType(sec.id!, p.id, 'spacer') },
  ]

  // ---- コピーと貼り付け(写すのは、範囲に丸ごと入る中身のある部品。貼るのは空きのマスだけ。貼った部品は新しい ID)
  const copy = (sec: Section, cs: T.CellSel) => {
    const c = T.copyCells(sec, cs)
    if (c.parts.length === 0) return setToast(t('写すものがありません(空きのマスは写しません)', 'Nothing to copy (empty cells are not copied)'))
    setClip(c)
    setToast(t(`${c.parts.length} 個の部品を写しました。空きのマスを選んで Ctrl+V で貼れます`, `Copied ${c.parts.length} part(s). Select empty cells and press Ctrl+V`))
  }
  const paste = (secId: string, c: number, r: number) => clip && run(secId, (x) => T.pasteCells(x, c, r, clip))

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
      } else if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        copy(selSec, sel)
      } else if (mod && e.key.toLowerCase() === 'v') {
        e.preventDefault()
        paste(sel.sec, selRect.c, selRect.r)
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
  const typeName = (type: PartType) => ({ box: t('箱', 'Box'), button: t('ボタン', 'Button'), text: t('テキスト', 'Text'), media: t('画像', 'Image'), line: t('区切り線', 'Divider'), spacer: t('余白', 'Spacer'), empty: t('空き', 'Empty') })[type]
  /**
   * ボタン・画像の utm_content(T8 の 8.10)。計測は要素の ID で数えるので、手で付ける名前(以前の「計測用の名前」track)はやめて、決まる値を見せるだけにした。
   * 保存済みの track は読み込んで残す(以前の版のアプリのため)が、URL には使わない
   */
  const utmField = (p: TablePart) => (
    <Field label={t('計測の utm_content(自動。押されたときに URL に付く)', 'Tracking utm_content (automatic; added to the URL on click)')} size="small">
      <span className={s.pid}>{partContent(p)}</span>
    </Field>
  )
  const partName = (p: TablePart) =>
    p.type === 'box' ? t(`${boxNo.get(p.id)} 番目`, `No. ${boxNo.get(p.id)}`) : p.type === 'button' ? p.label || defaultButtonLabel(0) : p.type === 'text' ? (p.text ?? '').split('\n')[0] || t('(文なし)', '(no text)') : p.type === 'media' ? p.alt || (p.video ? t('動画', 'Video') : p.src ? t('画像', 'Image') : t('(画像なし)', '(no image)')) : p.type === 'line' ? t('区切り線', 'Divider') : p.type === 'spacer' ? t(`余白 ${p.height ?? 24}px`, `Spacer ${p.height ?? 24}px`) : t('空き', 'Empty')
  const secLabel = (sec: Section, si: number) => `S${si + 1}${sec.name?.trim() ? ` · ${sec.name.trim()}` : ''}`

  const colW = (sec: Section) => (mailW - 20 - HEAD - ADD - 2 * GAP - ((sec.cols ?? 1) - 1) * GAP) / (sec.cols ?? 1)
  const rowHeights = (sec: Section) => {
    const cw = colW(sec)
    // 箱の行は、以前と同じ決め方(写真の形を選んでいない箱)。写真の形を選んだ箱・画像は、その形の高さにする。
    // キャンバスが縦に長くなりすぎないよう、上限を付ける
    const sized = (p: TablePart): number | undefined => {
      const wpx = p.w * cw + (p.w - 1) * GAP
      if (p.type === 'media') return wpx / ratioValue(p.ratio ?? 'wide')
      if (p.type === 'box' && p.ratio && !T.isSideBox(p)) return wpx / ratioValue(p.ratio) + (T.boxFields(p).some((f) => f !== 'badge') ? 28 : 0)
      return undefined
    }
    return Array.from({ length: sec.rows ?? 0 }, (_, r) => {
      const on = (sec.parts ?? []).filter((p) => r >= p.r && r < p.r + p.h)
      const fixed = on.filter((p) => p.h === 1).map(sized).filter((x): x is number => x !== undefined)
      const base = on.some((p) => p.type === 'box' && T.isSideBox(p))
        ? Math.max(90, Math.min(cw * 0.6, 160))
        : on.some((p) => p.type === 'box')
          ? Math.max(64, Math.min(cw * ((sec.cols ?? 1) === 1 ? 0.5 : 0.9), 200))
          : on.some((p) => p.type === 'text')
            ? 60
            : on.some((p) => p.type === 'spacer')
              ? Math.max(20, ...on.filter((p) => p.type === 'spacer').map((p) => p.height ?? 24))
              : 36
      return Math.round(Math.min(280, Math.max(base, ...fixed)))
    })
  }

  const edgeClass = (id: string) => {
    const tg = drag?.target
    if (!tg || tg.kind !== 'cell' || tg.id !== id) return undefined
    return tg.edge === 'top' ? s.eTop : tg.edge === 'bottom' ? s.eBottom : tg.edge === 'left' ? s.eLeft : tg.edge === 'right' ? s.eRight : s.hot
  }

  const patch = (sec: Section, p: TablePart, x: Partial<TablePart>) => replace(sec.id!, T.patchPart(sec, p.id, x))
  // 箱の見せ方として、ほかの箱にそろえる項目(AI への一言は、枠ごとに中身が違うのでそろえない)
  const lookOf = (p: TablePart): Partial<TablePart> => ({ view: p.view, place: p.place, fields: p.fields, priceStyle: p.priceStyle, badge: p.badge, ratio: p.ratio, swatchShape: p.swatchShape, swatchMax: p.swatchMax, ratingShow: p.ratingShow, ratingMin: p.ratingMin, ratingFloor: p.ratingFloor })
  /** 箱の設定を、いくつかの箱にまとめて入れる(形は変わらないので、ID はそのまま) */
  const patchBoxes = (sec: Section, ps: TablePart[], x: Partial<TablePart> | ((q: TablePart) => Partial<TablePart>)) => {
    const ids = new Set(ps.map((q) => q.id))
    replace(sec.id!, { ...sec, parts: (sec.parts ?? []).map((q) => (ids.has(q.id) ? { ...q, ...(typeof x === 'function' ? x(q) : x), id: q.id, type: q.type } : q)) })
  }
  /** 1 つの箱の見せ方を、ほかの箱にも当てる(同じ行 / このセクション / すべてのセクション) */
  const applyLook = (sec: Section, p: TablePart, scope: 'row' | 'section' | 'all') => {
    const look = lookOf(p)
    const target = (sx: Section, q: TablePart) => q.type === 'box' && q.id !== p.id && (scope === 'all' || sx.id === sec.id) && (scope !== 'row' || q.r === p.r)
    const n = sections.reduce((k, sx) => k + (sx.parts ?? []).filter((q) => target(sx, q)).length, 0)
    if (n === 0) return setToast(t('当てる箱がありません', 'No other boxes to apply to'))
    setSections((list) => list.map((sx) => ({ ...sx, parts: (sx.parts ?? []).map((q) => (target(sx, q) ? { ...q, ...look } : q)) })))
    setToast(t(`${n} 個の箱に、同じ見せ方を当てました(Ctrl+Z で戻す)`, `Applied the same look to ${n} box(es) (Ctrl+Z to undo)`))
  }
  /**
   * 箱の設定(見本・見せ方・写真の形・出すもの・価格の見せ方・バッジ・AI への一言)。右のタブと、キャンバスの ⚙(ダブルクリック)の両方で同じものを出す。
   * いくつかの箱を選んでいるときは、まとめて直す(値が箱ごとに違う項目は「ばらばら」と出す)。名前・価格の文言は、商品のデータから出すので、ここでは打たない。
   * 1 つの箱では、要素の「押せる」もここに出す(UTM に効くので、見せ方と一緒に見えるように。2026-10-26 利用者の決め)。
   * look のときは見せ方だけ(右のタブの「見せ方」のまとまりと ⚙。AI への一言は別のまとまり、ほかの箱に当てるは行の「…」)
   */
  /** 要素の「押せる」を切り替える(既定と同じなら、持たない) */
  const setElClick = (sec: Section, p: TablePart, key: string, click: boolean | undefined) => {
    const spec = Object.fromEntries(Object.entries({ ...(p.els?.[key] ?? {}), click }).filter(([, v]) => v !== undefined))
    const els = { ...(p.els ?? {}), [key]: spec }
    if (Object.keys(spec).length === 0) delete els[key]
    patch(sec, p, { els: Object.keys(els).length > 0 ? els : undefined })
  }
  const boxSettings = (sec: Section, ps: TablePart[], opts?: { look?: boolean; where?: string }) => {
    const p = ps[0]
    // 1 つの Field に並べたチェックは、Field が同じ ID を付けるので、ラベルを押すと先頭のチェックが切り替わっていた。チェックごとに ID を付ける
    // (右のタブと ⚙ で同じ箱を同時に出すことがあるので、出す場所も ID に入れる)
    const idPre = `${opts?.where ?? 'pane'}-${ps.map((q) => q.id).join('_')}`
    const many = ps.length > 1
    const MIXED = '__mixed__'
    const common = <V,>(fn: (q: TablePart) => V): V | typeof MIXED => {
      const vs = ps.map((q) => JSON.stringify(fn(q) ?? null))
      return vs.every((v) => v === vs[0]) ? fn(p) : MIXED
    }
    const view = common((q) => q.view ?? 'card')
    const place = common((q) => T.boxPlace(q) ?? 'below')
    // 見せ方から決まる場所と同じなら、持たない(見せ方を変えたときに、場所も一緒に変わるように)
    const placeFor = (q: TablePart, v: BoxPlace): BoxPlace | undefined => (T.boxPlace({ ...q, place: undefined }) === v ? undefined : v)
    const ratio = common((q) => q.ratio ?? '')
    const priceStyle = common((q) => q.priceStyle ?? '')
    const badge = common((q) => q.badge ?? '')
    const has = (f: BoxField) => ps.filter((q) => T.boxFields(q).includes(f)).length
    const cur = common((q) => T.presetOf(q)?.id ?? '')
    const toggle = (f: BoxField, on: boolean) => patchBoxes(sec, ps, (q) => ({ fields: BOX_FIELDS.filter((x) => (x === f ? on : T.boxFields(q).includes(x))) }))
    const mixedOption = <option value={MIXED} disabled>{t('(ばらばら)', '(mixed)')}</option>
    return (
      <>
        {many && <span className={s.hint}>{t(`選んだ ${ps.length} 個の箱を、まとめて直します`, `Editing ${ps.length} boxes together`)}</span>}
        <Field label={t('見本(押すと、まとめて入れる)', 'Presets (click to apply)')} size="small">
          <div className={s.row2}>
            {T.BOX_PRESETS.map((x) => (
              <Button key={x.id} size="small" appearance={cur === x.id ? 'primary' : 'outline'} aria-pressed={cur === x.id} onClick={() => patchBoxes(sec, ps, (q) => T.presetPatch(q, x))}>
                {x.label()}
              </Button>
            ))}
          </div>
        </Field>
        <Field label={t('見せ方', 'Look')} size="small">
          <Select size="small" value={view} onChange={(_, d) => patchBoxes(sec, ps, { view: d.value === 'card' ? undefined : (d.value as CellView) })}>
            {view === MIXED && mixedOption}
            {CELL_VIEWS.map((v) => (
              <option key={v} value={v}>{cellViewLabel(v)}</option>
            ))}
          </Select>
        </Field>
        {!ps.every((q) => q.view === 'story') && (
          <Field label={t('名前・価格などの置き場所', 'Where the name, price, etc. go')} hint={t('バッジは、いつも写真の左上です', 'The badge is always at the photo’s top left')} size="small">
            <Select size="small" value={place} onChange={(_, d) => patchBoxes(sec, ps, (q) => ({ place: placeFor(q, d.value as BoxPlace) }))}>
              {place === MIXED && mixedOption}
              {BOX_PLACES.map((v) => (
                <option key={v} value={v}>{T.boxPlaceLabel(v)}</option>
              ))}
            </Select>
          </Field>
        )}
        {!ps.every((q) => isTextView(q.view)) && (
          <Field label={t('写真の形', 'Photo shape')} size="small">
            <Select size="small" value={ratio} onChange={(_, d) => patchBoxes(sec, ps, { ratio: (d.value || undefined) as MediaRatio | undefined })}>
              {ratio === MIXED && mixedOption}
              <option value="">{t('既定(箱は縦長・写真だけはマスの形)', 'Default (portrait; photo-only fills the cell)')}</option>
              {MEDIA_RATIOS.map((r) => (
                <option key={r} value={r}>{T.ratioLabel(r)}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('出すもの(写真のほか)', 'Show (besides the photo)')} size="small">
          <div className={s.row2}>
            {BOX_FIELDS.map((f) => (
              <Checkbox key={f} id={`${idPre}-show-${f}`} label={T.boxFieldLabel(f)} checked={has(f) === ps.length ? true : has(f) > 0 ? 'mixed' : false} onChange={(_, d) => toggle(f, d.checked === true)} />
            ))}
          </div>
        </Field>
        {!many && (
          <Field label={t('押せる(メールの中で、それぞれ別のリンクになる。utm_content はその要素の ID)', 'Clickable (each is its own link in the email; utm_content is the element ID)')} size="small">
            <div className={s.row2}>
              {partElements(p).map((e) => (
                <Checkbox key={e.key} id={`${idPre}-click-${e.key}`} label={elementLabel(e.key)} checked={elementClickable(p, e)} onChange={(_, d) => setElClick(sec, p, e.key, (d.checked === true) === e.click ? undefined : d.checked === true)} />
              ))}
            </div>
          </Field>
        )}
        {has('price') > 0 && (
          <Field label={t('価格の見せ方', 'Price style')} hint={priceStyle === 'sale' ? t('元の価格は、商品のデータ(元の価格)から出します。ない商品は、赤い価格だけです', 'The original price comes from the product data; items without one show only the red price') : undefined} size="small">
            <Select size="small" value={priceStyle} onChange={(_, d) => patchBoxes(sec, ps, { priceStyle: d.value === 'sale' || d.value === 'from' ? d.value : undefined })}>
              {priceStyle === MIXED && mixedOption}
              {(['', 'sale', 'from'] as const).map((v) => (
                <option key={v} value={v}>{T.priceStyleLabel(v || undefined)}</option>
              ))}
            </Select>
          </Field>
        )}
        {has('swatches') > 0 && (
          <Field label={t('カラーチップ(商品の SKU の色を並べる)', 'Color chips (the colors of the product SKUs)')} size="small">
            <div className={s.row2}>
              <Select size="small" value={common((q) => q.swatchShape ?? '') === MIXED ? MIXED : (p.swatchShape ?? '')} onChange={(_, d) => patchBoxes(sec, ps, { swatchShape: d.value === 'square' ? 'square' : undefined })}>
                {common((q) => q.swatchShape ?? '') === MIXED && mixedOption}
                <option value="">{t('丸', 'Round')}</option>
                <option value="square">{t('四角', 'Square')}</option>
              </Select>
              <Select size="small" value={common((q) => q.swatchMax ?? 5) === MIXED ? MIXED : String(p.swatchMax ?? 5)} onChange={(_, d) => patchBoxes(sec, ps, { swatchMax: Number(d.value) === 5 ? undefined : Number(d.value) })}>
                {common((q) => q.swatchMax ?? 5) === MIXED && mixedOption}
                {[3, 4, 5, 6, 8].map((n) => (
                  <option key={n} value={n}>{t(`${n} 色まで`, `Up to ${n}`)}</option>
                ))}
              </Select>
            </div>
          </Field>
        )}
        {has('rating') > 0 && (
          <Field label={t('レビュー(商品の平均点・件数から)', 'Reviews (from the product rating and count)')} hint={t('件数が少ない・点が低い商品では、レビューを出しません', 'Hidden for items with few reviews or a low rating')} size="small">
            <Select size="small" value={common((q) => q.ratingShow ?? '') === MIXED ? MIXED : (p.ratingShow ?? '')} onChange={(_, d) => patchBoxes(sec, ps, { ratingShow: d.value === 'stars' || d.value === 'starsCount' ? d.value : undefined })}>
              {common((q) => q.ratingShow ?? '') === MIXED && mixedOption}
              <option value="">{t('★ 4.2 (128)', '★ 4.2 (128)')}</option>
              <option value="starsCount">{t('★ (128)', '★ (128)')}</option>
              <option value="stars">{t('★ だけ', 'Stars only')}</option>
            </Select>
            <div className={s.row2}>
              <Select size="small" value={common((q) => q.ratingMin ?? 3) === MIXED ? MIXED : String(p.ratingMin ?? 3)} onChange={(_, d) => patchBoxes(sec, ps, { ratingMin: Number(d.value) === 3 ? undefined : Number(d.value) })}>
                {common((q) => q.ratingMin ?? 3) === MIXED && mixedOption}
                {[1, 3, 5, 10, 30].map((n) => (
                  <option key={n} value={n}>{t(`${n} 件以上で出す`, `Show with ${n}+ reviews`)}</option>
                ))}
              </Select>
              <Select size="small" value={common((q) => q.ratingFloor ?? 0) === MIXED ? MIXED : String(p.ratingFloor ?? 0)} onChange={(_, d) => patchBoxes(sec, ps, { ratingFloor: Number(d.value) || undefined })}>
                {common((q) => q.ratingFloor ?? 0) === MIXED && mixedOption}
                <option value="0">{t('点では隠さない', 'Any rating')}</option>
                {[3, 3.5, 4].map((n) => (
                  <option key={n} value={n}>{t(`${n} 点以上で出す`, `Show at ${n}+`)}</option>
                ))}
              </Select>
            </div>
          </Field>
        )}
        {has('badge') > 0 && (
          <Field label={t('バッジの文言', 'Badge text')} size="small">
            <Input size="small" value={badge === MIXED ? '' : badge} placeholder={badge === MIXED ? t('(ばらばら)', '(mixed)') : 'NEW'} maxLength={12} onChange={(_, d) => patchBoxes(sec, ps, { badge: d.value || undefined })} />
          </Field>
        )}
        {!many && !opts?.look && (
          <Field label={t('AI に伝える一言(この枠に、どんな商品を置くか)', 'Note for AI (what to put in this slot)')} size="small">
            <AutoTextarea rows={2} size="small" value={p.aiNote ?? ''} placeholder={t('例: 主役の新作を置く', 'e.g. The lead new arrival')} onChange={(_, d) => patch(sec, p, { aiNote: d.value || undefined })} />
          </Field>
        )}
        {!many && !opts?.look && (
          <Menu positioning="below-start">
            <MenuTrigger disableButtonEnhancement>
              <Button size="small" icon={<CopyRegular />}>
                {t('この見せ方を、ほかの箱にも当てる', 'Apply this look to other boxes')}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem onClick={() => applyLook(sec, p, 'row')}>{t('同じ行の箱', 'Boxes in this row')}</MenuItem>
                <MenuItem onClick={() => applyLook(sec, p, 'section')}>{t('このセクションの箱', 'Boxes in this section')}</MenuItem>
                <MenuItem onClick={() => applyLook(sec, p, 'all')}>{t('テンプレートのすべての箱', 'All boxes in the template')}</MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        )}
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
      const sample = sampleOf(n)
      // 写真のほかに出すもの(名前・価格・説明・ボタン)を、メールと同じ並びで、仮の文字で見せる
      const lines = (
        <>
          {fields.includes('name') && <span style={{ color: MAIL.ink, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sample?.name ?? t('商品名', 'Product')}</span>}
          {fields.includes('price') && (
            <span>
              {sale && <s style={{ color: MAIL.sub, marginRight: 4 }}>{sample?.regular ?? t('元の価格', 'Was')}</s>}
              <span style={{ color: sale || hero === 'offer' ? '#d32f2f' : MAIL.sub, fontWeight: sale ? 700 : 400 }}>{sample ? (p.priceStyle === 'from' ? t(`${sample.price}〜`, `From ${sample.price}`) : sample.price) : p.priceStyle === 'from' ? t('価格〜', 'From price') : sale ? t('セール価格', 'Sale price') : t('価格', 'Price')}</span>
            </span>
          )}
          {fields.includes('swatches') && (
            <span style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {['#222222', '#d8c7a8', '#1f2a44'].map((c) => (
                <i key={c} style={{ width: 8, height: 8, borderRadius: p.swatchShape === 'square' ? 1 : '50%', backgroundColor: c, border: '1px solid #ccc' }} />
              ))}
            </span>
          )}
          {fields.includes('rating') && <span style={{ color: STAR_COLOR }}>★★★★☆{p.ratingShow !== 'stars' && p.ratingShow !== 'starsCount' && <span style={{ color: MAIL.sub }}> 4.2</span>}{p.ratingShow !== 'stars' && <span style={{ color: MAIL.sub }}> (128)</span>}</span>}
          {fields.includes('desc') && <span>{t('説明', 'Description')}</span>}
          {fields.includes('button') && <span className={s.miniCta}>{t('詳細はこちら', 'View details')}</span>}
        </>
      )
      const hasText = fields.some((f) => f !== 'badge')
      const badge = fields.includes('badge') && <span className={s.boxBadge} style={{ backgroundColor: sale || /sale|限定|off/i.test(p.badge ?? '') ? '#d32f2f' : MAIL.ink }}>{p.badge?.trim() || 'NEW'}</span>
      // 名前・価格などの置き場所(T12。決めていなければ見せ方から。メールのプレビューと同じ決め方)
      const place = T.boxPlace(p)
      const photoBg = sample ? { backgroundImage: `url("${sample.src.replace(/"/g, '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}
      if (p.view === 'story' || place === 'left' || place === 'right') {
        const text = <div className={s.splitText}>{lines}</div>
        const img = <div style={{ backgroundColor: MAIL.img, position: 'relative', ...photoBg }}>{badge}</div>
        return (
          <div className={s.split}>
            {(p.view === 'story' ? n % 2 === 0 : place === 'left') ? (
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
          </div>
        )
      }
      // 写真の下: 写真の所と、白地の文の所に分ける
      if (place === 'below') {
        return (
          <div className={s.tile} style={{ gridTemplateRows: hasText ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)', alignContent: 'stretch', backgroundColor: MAIL.panel }}>
            <div style={{ position: 'relative', minHeight: 0, backgroundColor: p.w * p.h > 1 ? MAIL.img : MAIL.tile, ...photoBg }}>{badge}</div>
            <span className={s.tileNo}>{n}</span>
            {hasText && <div className={s.cap} style={{ backgroundColor: MAIL.panel }}>{lines}</div>}
          </div>
        )
      }
      // 写真に重ねる(上・中央・下)
      return (
        <div className={s.tile} style={{ alignContent: place === 'top' ? 'start' : place === 'middle' ? 'center' : 'end', backgroundColor: p.w * p.h > 1 ? MAIL.img : MAIL.tile, ...photoBg }}>
          <span className={s.tileNo}>{n}</span>
          {badge}
          {hasText && <div className={s.cap} style={place === 'top' && badge ? { marginTop: 22 } : undefined}>{lines}</div>}
        </div>
      )
    }
    if (p.type === 'button') {
      const color = T.buttonColor(p, hero === 'offer')
      const align = p.align ?? 'center'
      const text = p.style === 'text' || p.shape === 'underline'
      const label = T.buttonText(p, defaultButtonLabel(0))
      const fontSize = p.size === 'small' ? 10 : p.size === 'large' ? 13 : 11
      // 画像のボタン: 画像を敷いて(画像の上に文字なら、文字を重ねる)
      if (p.face) {
        return (
          <div
            className={s.pill}
            style={{ justifySelf: p.fit ? (align === 'left' ? 'start' : align === 'right' ? 'end' : 'center') : 'stretch', minWidth: p.fit ? undefined : 0, minHeight: 24, borderRadius: Math.min(T.buttonRadius(p), 8), color: p.src ? '#fff' : MAIL.sub, backgroundColor: MAIL.img, fontSize, ...(p.src ? { backgroundImage: `url("${p.src.replace(/"/g, '%22')}")`, backgroundSize: 'cover', backgroundPosition: 'center', textShadow: '0 1px 3px rgba(0,0,0,0.5)' } : {}) }}
          >
            {p.face === 'both' ? label : p.src ? '' : t('ボタンの画像', 'Button image')}
          </div>
        )
      }
      return (
        <div
          className={mergeClasses(s.pill, p.style === 'outline' && !text && s.pillOutline, text && s.pillText)}
          style={{
            justifySelf: align === 'left' ? 'start' : align === 'right' ? 'end' : 'center',
            borderRadius: T.buttonRadius(p),
            fontSize,
            ...(p.fit ? { minWidth: 0 } : {}),
            ...(p.size === 'large' ? { padding: '8px 16px' } : p.size === 'small' ? { padding: '3px 10px' } : {}),
            ...(text ? { color, ...(p.shape === 'underline' ? { textDecoration: 'underline' } : {}) } : p.style === 'outline' ? { borderColor: color, color } : { backgroundColor: color }),
          }}
        >
          {label}
        </div>
      )
    }
    if (p.type === 'text') return <div className={s.ptext} style={{ textAlign: p.align ?? 'left', ...T.textDirStyle(p.dir), ...(p.dir ? { justifySelf: 'center' } : {}) }}>{p.text || t('(テキスト。ダブルクリックで書く)', '(Text — double-click to write)')}</div>
    if (p.type === 'line') {
      const lk = T.lineLook(p)
      return (
        <div style={{ display: 'grid', alignContent: 'center', justifyItems: 'center', height: '100%' }}>
          <div style={{ width: lk.length, borderTop: `${lk.width}px solid ${lk.color}` }} />
        </div>
      )
    }
    if (p.type === 'spacer') return <div className={s.spacer}>{t(`余白 ${p.height ?? 24}px`, `Spacer ${p.height ?? 24}px`)}</div>
    if (p.type === 'media') {
      return (
        <div className={s.media} style={p.src ? { backgroundImage: `url("${p.src.replace(/"/g, '%22')}")` } : undefined}>
          {!p.src && <span>{p.video ? t('動画(サムネイルの画像を選ぶ)', 'Video (pick a thumbnail image)') : t('画像(選んで、帯の ⚙ 画像で選ぶ)', 'Image (select, then ⚙ Image on the bar)')}</span>}
          {p.video && <span className={s.play}>▶</span>}
          {p.swap && <span className={s.swapTag}>{t('配信ごと', 'Per delivery')}</span>}
        </div>
      )
    }
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

  /**
   * セクションの見出しと、AI が配信ごとに書くコピーの帯。キャンバスの上で出し入れする(× で消す・「＋ 見出し」「＋ コピー」で入れる)。
   * 値は右のタブのチェックと同じ(categoryHeading・copy)。セクションの数・順番は変わらないので、配信カードの見出し・コピーの番号はずれない
   */
  const sectionHead = (sec: Section) => {
    const heading = !!sec.categoryHeading
    const copyOn = sec.copy !== false
    const x = (label: string, onClick: () => void) => (
      <button type="button" className={s.sheadX} title={label} aria-label={label} onPointerDown={(e) => e.stopPropagation()} onClick={onClick}>
        ×
      </button>
    )
    const add = (label: string, onClick: () => void) => (
      <button type="button" className={s.sheadAddBtn} onPointerDown={(e) => e.stopPropagation()} onClick={onClick}>
        {label}
      </button>
    )
    return (
      <div className={s.shead}>
        {heading && (
          <span className={s.sheadItem}>
            <span className={s.sheadTitle}>{t('セクションの見出し', 'Section heading')}</span>
            {x(t('見出しを消す', 'Remove the heading'), () => replace(sec.id!, { ...sec, categoryHeading: undefined }))}
          </span>
        )}
        {copyOn && (
          <span className={s.sheadItem}>
            <span className={s.sheadCopy}>{t('AI が配信ごとに書くコピー', 'Copy written by AI per delivery')}</span>
            {x(t('コピーを消す', 'Remove the copy'), () => replace(sec.id!, { ...sec, copy: false }))}
          </span>
        )}
        {(!heading || !copyOn) && (
          <span className={s.sheadAdd}>
            {!heading && add(t('＋ 見出し', '+ Heading'), () => replace(sec.id!, { ...sec, categoryHeading: true }))}
            {!copyOn && add(t('＋ コピー', '+ Copy'), () => replace(sec.id!, { ...sec, copy: undefined }))}
          </span>
        )}
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

  /**
   * 操作の帯(T8 の 8.2): 選んだマスのすぐ上に、よく使う操作を並べる(右クリックを知らなくても操作できるように。
   * Google ドキュメント・Figma の、選ぶと出る道具の帯と同じ考え)。右クリックとキーの操作は、そのまま
   */
  /**
   * 操作の帯(T8 の 8.2。2026-10-26 に作り直した): 選んだマスに付いて動く 1 本の帯(位置は SelBar)。
   * 先頭に、選んだものの設定(箱「⚙ 見せ方」・画像「⚙ 画像」・ボタンとテキスト「✎ 文字を直す」)、続けて よく使う 結合 / 分割・削除。
   * 残り(コピー・貼り付け・行 / 列の挿入・均等・縦線)は「…」のメニュー。右クリックのメニューとキーの操作は、そのまま
   */
  const actionBar = (sec: Section, rc: T.Rect) => {
    const ps = selParts
    const boxes = ps.filter((p) => p.type === 'box').sort((x, y) => x.r - y.r || x.c - y.c)
    const single = ps.length === 1 ? ps[0] : undefined
    const media = single?.type === 'media' ? single : undefined
    const textual = single && (single.type === 'button' || single.type === 'text') ? single : undefined
    const one = rc.h === 1
    const stop = (e: React.SyntheticEvent) => e.stopPropagation()
    const btn = (label: ReactNode, onClick: () => void, title?: string, disabled = false, className?: string) => (
      <button
        type="button"
        className={mergeClasses(s.barBtn, className)}
        disabled={disabled}
        title={title ?? (typeof label === 'string' ? label : undefined)}
        onPointerDown={stop}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
      >
        {label}
      </button>
    )
    const cs: T.CellSel = { a: [rc.c, rc.r], b: [rc.c + rc.w - 1, rc.r + rc.h - 1] }
    // セクション全体を選んでいるときの「削除」は、セクションを消す(ヒーローの下の表は、中身を空きにするだけ)
    const whole = !isHero(sec.id) && rc.c === 0 && rc.r === 0 && rc.w === (sec.cols ?? 1) && rc.h === (sec.rows ?? 0)
    const del = <span className={s.barIcon}><DeleteRegular />{t('削除', 'Delete')}</span>
    // 先頭の設定: 箱・画像は、帯の ⚙ からその場のポップアップ(ダブルクリックでも開く。開いているのは quickId)
    const quickFor = boxes[0] ?? media
    const head = quickFor ? (
      <Popover open={quickId === quickFor.id} onOpenChange={(_, d) => setQuickId(d.open ? quickFor.id : null)} positioning="below-start" withArrow>
        <PopoverTrigger disableButtonEnhancement>
          <button
            type="button"
            className={mergeClasses(s.barBtn, s.barHead)}
            title={boxes.length > 1 ? t('選んだ箱の見せ方をまとめて直す(ダブルクリックでも開く)', 'Edit the look of the selected boxes (or double-click)') : media ? t('画像・動画の設定(ダブルクリックでも開く)', 'Image / video settings (or double-click)') : t('箱の見せ方(ダブルクリックでも開く)', 'Box display (or double-click)')}
            onPointerDown={stop}
          >
            <span className={s.barIcon}>
              <SettingsRegular />
              {media ? t('画像', 'Image') : t('見せ方', 'Look')}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverSurface className={s.quickSurface} onPointerDown={stop}>
          {media ? (
            <>
              <span className={s.quickHead}>{t('画像・動画', 'Image / video')}</span>
              {mediaLook(sec, media)}
            </>
          ) : (
            <>
              <span className={s.quickHead}>{boxes.length > 1 ? t(`選んだ ${boxes.length} 個の箱の見せ方`, `Display of ${boxes.length} boxes`) : t(`箱 ${boxNo.get(boxes[0].id) ?? ''} の見せ方`, `Box ${boxNo.get(boxes[0].id) ?? ''} display`)}</span>
              {boxSettings(sec, boxes, { look: true, where: 'quick' })}
              {openRightLink(sec, boxes[0])}
            </>
          )}
        </PopoverSurface>
      </Popover>
    ) : textual ? (
      btn(<span className={s.barIcon}>✎ {t('文字を直す', 'Edit text')}</span>, () => startEdit(textual), t('その場で文字を直す(Enter・ダブルクリックでも)', 'Edit the text in place (or Enter / double-click)'), false, s.barHead)
    ) : null
    return (
      <SelBar key="bar" ids={ps.map((p) => p.id)} below={rc.r === 0} className={s.bar} layerClass={s.barLayer} style={{ gridColumn: `2 / span ${sec.cols ?? 1}`, gridRow: `2 / span ${Math.max(1, sec.rows ?? 1)}` }}>
        {head}
        {head && <span className={s.barSep} />}
        {ps.length > 1 && btn(t('結合', 'Merge'), () => run(sec.id!, (x) => T.mergeCells(x, cs)), t('結合(Ctrl+M)', 'Merge (Ctrl+M)'))}
        {ps.some((p) => p.w * p.h > 1) && btn(t('分割', 'Split'), () => run(sec.id!, (x) => T.splitCells(x, ps.map((p) => p.id))))}
        {whole
          ? btn(del, () => removeSection(sec.id!), t('このセクションを削除(Ctrl+Z で戻す)', 'Delete this section (Ctrl+Z to undo)'))
          : btn(del, () => replace(sec.id!, T.clearCells(sec, ps.map((p) => p.id))), t('選んだ部品を削除して空きにする(Delete)', 'Delete the selected parts, leaving empty cells (Delete)'), !ps.some((p) => p.type !== 'empty'))}
        <Menu positioning="below-end">
          <MenuTrigger disableButtonEnhancement>
            <button type="button" className={s.barBtn} aria-label={t('ほかの操作', 'More actions')} title={t('ほかの操作(コピー・貼り付け・行と列の挿入・均等)', 'More (copy, paste, insert rows/columns, spread)')} onPointerDown={stop}>
              <MoreHorizontalRegular />
            </button>
          </MenuTrigger>
          <MenuPopover onPointerDown={stop}>
            <MenuList>
              <MenuItem disabled={!ps.some((p) => p.type !== 'empty')} secondaryContent="Ctrl+C" onClick={() => copy(sec, cs)}>{t('コピー', 'Copy')}</MenuItem>
              <MenuItem disabled={!clip} secondaryContent="Ctrl+V" onClick={() => paste(sec.id!, rc.c, rc.r)}>{t('空きのマスに貼り付け', 'Paste into empty cells')}</MenuItem>
              <MenuDivider />
              <MenuItem onClick={() => run(sec.id!, (x) => T.insertRow(x, rc.r))}>{t('上に行を挿入', 'Insert row above')}</MenuItem>
              <MenuItem onClick={() => run(sec.id!, (x) => T.insertRow(x, rc.r + rc.h))}>{t('下に行を挿入', 'Insert row below')}</MenuItem>
              <MenuItem onClick={() => run(sec.id!, (x) => T.insertCol(x, rc.c))}>{t('左に列を挿入', 'Insert column left')}</MenuItem>
              <MenuItem onClick={() => run(sec.id!, (x) => T.insertCol(x, rc.c + rc.w))}>{t('右に列を挿入', 'Insert column right')}</MenuItem>
              {one && (
                <>
                  <MenuDivider />
                  <MenuItem onClick={() => run(sec.id!, (x) => T.toggleEvenRow(x, rc.r))}>{T.isEvenRow(sec, rc.r) ? t('均等に並べるのをやめる', 'Stop spreading evenly') : t('この行を均等に並べる', 'Spread this row evenly')}</MenuItem>
                  {T.isEvenRow(sec, rc.r) && <MenuItem onClick={() => replace(sec.id!, T.toggleSepRow(sec, rc.r))}>{T.isSepRow(sec, rc.r) ? t('縦の区切り線をやめる', 'Remove vertical dividers') : t('部品の間に縦の区切り線', 'Vertical dividers between parts')}</MenuItem>}
                </>
              )}
            </MenuList>
          </MenuPopover>
        </Menu>
      </SelBar>
    )
  }

  const table = (sec: Section) => {
    const cols = sec.cols ?? 1
    const rows = sec.rows ?? 0
    const rh = rowHeights(sec)
    const mine = sel?.kind === 'cells' && sel.sec === sec.id ? selRect : null
    const fullCol = mine && mine.r === 0 && mine.h === rows
    const fullRow = mine && mine.c === 0 && mine.w === cols
    const tg = drag?.target
    const even = sec.evenRows ?? []
    const cellEl = (p: TablePart, place: React.CSSProperties, extra?: string) => (
      <div
        key={p.id}
        data-cell={p.id}
        data-type={p.type}
        className={mergeClasses(s.cell, peek === p.id && s.peek, edgeClass(p.id), extra)}
        style={place}
        onPointerDown={(e) => startSelect(e, sec, p)}
        onDoubleClick={() => (p.type === 'box' || p.type === 'media' ? setQuickId(p.id) : startEdit(p))}
        onContextMenu={(e) => {
          // Shift + 右クリックは、ブラウザのメニューのまま(調べる・写すなど。よくある決まり)
          if (e.shiftKey) return
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
    )
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
            title={T.isEvenRow(sec, r) ? t(`行 ${r + 1}(均等に並べる。メールでは、中身のある部品を同じ幅で並べます)`, `Row ${r + 1} (spread evenly: filled parts get equal widths in the email)`) : t(`行 ${r + 1}`, `Row ${r + 1}`)}
            onClick={(e) => {
              setSel({ kind: 'cells', sec: sec.id!, a: [0, r], b: [cols - 1, r] })
              // 行のメニューは、行の帯の右横に出す(押した行が隠れないように)
              const b = e.currentTarget.getBoundingClientRect()
              openMenu(b.right + 4, b.top - 4, rowMenu(sec, r))
            }}
          >
            {T.isEvenRow(sec, r) ? '＝' : '…'}
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
        {(sec.parts ?? []).filter((p) => !even.includes(p.r)).map((p) => cellEl(p, { gridColumn: `${p.c + 2} / span ${p.w}`, gridRow: `${p.r + 2} / span ${p.h}` }))}
        {/* 均等に並べる行: メールと同じく、中身のある部品を同じ幅で並べる(空きは隠し、右端の + で、空いているマスに置く) */}
        {even.map((r) => {
          const row = (sec.parts ?? []).filter((p) => p.r === r)
          const filledParts = row.filter((p) => p.type !== 'empty').sort((a, b) => a.c - b.c)
          const free = row.filter((p) => p.type === 'empty').sort((a, b) => a.c - b.c)[0]
          return (
            <div key={`even${r}`} className={s.evenStrip} style={{ gridColumn: `2 / span ${cols}`, gridRow: r + 2, gridTemplateColumns: `${filledParts.length > 0 ? `repeat(${filledParts.length}, minmax(0, 1fr)) ` : 'minmax(0, 1fr) '}20px` }}>
              {filledParts.length === 0 && <span className={s.evenEmpty}>{t('均等の行(右の + で部品を置く)', 'Even row (use + to add parts)')}</span>}
              {filledParts.map((p, i) => cellEl(p, i > 0 && T.isSepRow(sec, r) ? { boxShadow: `-5px 0 0 -4px ${T.SEP_COLOR}` } : {}, selParts.some((x) => x.id === p.id) ? s.cellSel : undefined))}
              <button
                type="button"
                className={s.evenPlus}
                disabled={!free}
                title={free ? t('この行に部品を足す(均等に並べ直す)', 'Add a part to this row (re-spread evenly)') : t('この行に空きがありません(列を足すと置けます)', 'No empty cell in this row (add a column first)')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  if (!free) return
                  selectCell(sec.id!, free.c, free.r)
                  const b = e.currentTarget.getBoundingClientRect()
                  openMenu(b.left, b.bottom + 2, placeMenu(sec, free))
                }}
              >
                +
              </button>
            </div>
          )
        })}
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
        {mine && actionBar(sec, mine)}
        {mine && !(mine.h === 1 && even.includes(mine.r)) && <div className={s.selRect} style={{ gridColumn: `${mine.c + 2} / span ${mine.w}`, gridRow: `${mine.r + 2} / span ${mine.h}` }} />}
      </div>
    )
  }

  /** 空の表(最初の行がまだない)。パーツを落とすか、「＋ 置く」で選ぶと、その部品で最初の行ができる(T8 の 8.3) */
  const firstBlock = (sec: Section) => {
    const hero = isHero(sec.id)
    const items: MenuItem[] = [
      { header: t('最初の行に置く', 'Place in the first row') },
      ...(hero ? [] : [{ label: t('箱(商品 1 点)', 'Box (1 product)'), onClick: () => addPart('box', sec.id) }]),
      { label: t('ボタン', 'Button'), onClick: () => addPart('button', sec.id) },
      { label: t('テキスト', 'Text'), onClick: () => addPart('text', sec.id) },
      { label: t('画像・動画', 'Image / video'), onClick: () => addPart('media', sec.id) },
      { label: t('区切り線', 'Divider'), onClick: () => addPart('line', sec.id) },
      { label: t('余白', 'Spacer'), onClick: () => addPart('spacer', sec.id) },
      { header: t('よく使う行', 'Common rows') },
      ...T.ROW_PRESETS.filter((x) => !hero || !x.parts.some(([type]) => type === 'box')).map((x) => ({ label: x.label(), onClick: () => addPart(`row:${x.id}`, sec.id) })),
    ]
    return (
      <div data-first={sec.id} className={mergeClasses(s.first, drag?.target?.kind === 'first' && drag.target.sec === sec.id && s.firstHot)}>
        {hero ? t('ボタン・テキスト・画像を置けます(左のパーツを落とすか、＋ 置く)', 'Add buttons, text or images (drop a part, or + Place)') : t('左のパーツを落とすか、＋ 置く で、最初の行を作ります', 'Drop a part from the left, or use + Place, to create the first row')}
        <Button
          size="small"
          appearance="outline"
          onClick={(e) => {
            const b = e.currentTarget.getBoundingClientRect()
            openMenu(b.left, b.bottom + 2, items)
          }}
        >
          {t('＋ 置く', '+ Place')}
        </Button>
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
          style={{
            backgroundColor: MAIL.hero[hero],
            // 写真の形を選んでいれば、その形の高さ(キャンバスが縦に長くなりすぎないよう上限)
            ...(heroStyle?.ratio ? { height: Math.round(Math.min(300, Math.max(80, (mailW - 20) / ratioValue(heroStyle.ratio)))) } : {}),
            // ヘッドラインの位置を、絵の中の文字の位置で見せる(写真の下のときは、横だけ)
            ...(heroText !== 'below'
              ? { alignItems: heroStyle?.v === 'top' ? 'start' : heroStyle?.v === 'middle' || (!heroStyle?.v && heroText === 'overlay') ? 'center' : 'end', justifyItems: heroStyle?.h === 'right' ? 'end' : heroStyle?.h === 'center' || (!heroStyle?.h && heroText === 'overlay') ? 'center' : 'start', padding: 10 }
              : {}),
            color: heroStyle?.color === 'dark' ? MAIL.ink : heroText === 'below' ? MAIL.ink : '#fff',
            textShadow: heroText !== 'below' && heroStyle?.color !== 'dark' ? '0 1px 4px rgba(0,0,0,0.45)' : 'none',
          }}
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
        <div
          data-sec={T.HERO_TABLE_ID}
          className={mergeClasses(s.sec, s.heroSec, sel?.kind === 'section' && isHero(sel.sec) && s.secSel)}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) setSel({ kind: 'section', sec: T.HERO_TABLE_ID })
          }}
        >
          <span className={s.heroTag}>{t('ヒーローの下(ボタン・テキスト・画像。セクションの番号には数えない)', 'Under the hero (buttons, text, images; not counted as a section)')}</span>
          {(heroSec.rows ?? 0) === 0 ? firstBlock(heroSec) : table(heroSec)}
        </div>
        {gap(0)}
        {sections.map((sec, si) => {
          const secSel = sel?.kind === 'section' && sel.sec === sec.id
          return (
            <Fragment key={sec.id}>
              <div
                data-sec={sec.id}
                className={mergeClasses(s.sec, secSel && s.secSel, drag?.section === sec.id && s.secMoving)}
                style={{ ...(sec.bg ? { backgroundColor: T.SECTION_BG[sec.bg], paddingLeft: 6, paddingRight: 6 } : {}), paddingBottom: 4 + T.sectionSpace(sec.space) / 2, ...(sec.divider ? { borderTop: `1px solid ${MAIL.line}` } : {}) }}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) setSel({ kind: 'section', sec: sec.id! })
                }}
              >
                <span className={s.tagRow}>
                  <button
                    type="button"
                    className={s.tag}
                    title={t('押して選ぶ・つかんで動かす', 'Click to select, drag to move')}
                    onPointerDown={(e) => startDrag(e, 'section', t(`${secLabel(sec, si)} を動かす`, `Move ${secLabel(sec, si)}`), () => setSel({ kind: 'section', sec: sec.id! }), sec.id)}
                  >
                    ⠿ {secLabel(sec, si)}
                    {sec.mobile === 'stack' ? t('・スマホは縦に', ' · stacks on phones') : ''}
                  </button>
                  <button
                    type="button"
                    className={s.tagDel}
                    title={t('セクションを削除(Ctrl+Z で戻す)', 'Delete section (Ctrl+Z to undo)')}
                    aria-label={t(`${secLabel(sec, si)} を削除`, `Delete ${secLabel(sec, si)}`)}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => removeSection(sec.id!)}
                  >
                    <DeleteRegular />
                  </button>
                </span>
                {sectionHead(sec)}
                {(sec.rows ?? 0) === 0 ? firstBlock(sec) : table(sec)}
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
    if (k === 'media') return <span style={{ width: 20, height: 12, background: tokens.colorPaletteBerryBorderActive, borderRadius: 2 }} />
    if (k === 'box') return <span style={{ width: 12, height: 14, background: tokens.colorPaletteBlueBorderActive, borderRadius: 2 }} />
    if (k === 'button') return <span style={{ width: 20, height: 6, background: tokens.colorNeutralForeground1, borderRadius: 6 }} />
    if (k === 'text') return <span style={{ width: 18, height: 2, background: tokens.colorPaletteGreenBorderActive, boxShadow: `0 4px 0 ${tokens.colorPaletteGreenBorderActive}` }} />
    if (k === 'line') return <span style={{ width: 22, height: 1, background: tokens.colorNeutralForeground2 }} />
    if (k === 'spacer') return <span style={{ width: 20, height: 10, border: `1px dashed ${tokens.colorNeutralStroke1}` }} />
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
            background: type === 'box' ? tokens.colorPaletteBlueBorderActive : type === 'button' ? tokens.colorNeutralForeground1 : type === 'media' ? tokens.colorPaletteBerryBorderActive : type === 'line' ? tokens.colorNeutralForeground2 : tokens.colorPaletteGreenBorderActive,
            ...(type === 'button' ? { height: 5, alignSelf: 'center' } : type === 'text' ? { height: 2, alignSelf: 'center' } : type === 'line' ? { height: 1, alignSelf: 'center' } : {}),
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
      {palItem('media', t('画像・動画(バナー・タイル)', 'Image / video (banner, tile)'), icon('media'))}
      {palItem('line', t('区切り線', 'Divider'), icon('line'))}
      {palItem('spacer', t('余白', 'Spacer'), icon('spacer'))}
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
  const selKey = sel ? `${sel.kind}:${sel.sec}:${selParts.map((p) => p.id).join(',')}` : ''
  /** カードが開いているか(auto: 選んでいるので、ふだんは開く) */
  const isOpen = (id: string, auto: boolean) => {
    const f = fold[id]
    if (auto) return f && f.key === selKey ? f.open : true
    return f ? f.open : false
  }
  const setOpen = (id: string, open: boolean) => setFold((prev) => ({ ...prev, [id]: { open, key: selKey } }))
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
  /** 部品の場所の呼び名(説明の自動の文に使う。例「S1 箱 1」「H ボタン」) */
  const whereOf = (sec: Section, p: TablePart) =>
    `${isHero(sec.id) ? 'H' : `S${sections.findIndex((x) => x.id === sec.id) + 1}`} ${typeName(p.type)}${p.type === 'box' ? ` ${boxNo.get(p.id)}` : ''}`
  /**
   * 部品の説明と、要素(写真・名前・価格・文言…)の ID・説明・押せるか(T8 の 8.4)。
   * ID は「部品 ID.要素の名前」で、説明を書き直しても変わらない(計測・ピン・分析は ID で数える)
   */
  const elementsBlock = (sec: Section, p: TablePart) => {
    const where = whereOf(sec, p)
    const setEl = (key: string, x: { desc?: string; click?: boolean }) => {
      const spec = Object.fromEntries(Object.entries({ ...(p.els?.[key] ?? {}), ...x }).filter(([, v]) => v !== undefined))
      const els = { ...(p.els ?? {}), [key]: spec }
      if (Object.keys(spec).length === 0) delete els[key]
      patch(sec, p, { els: Object.keys(els).length > 0 ? els : undefined })
    }
    return (
      <>
        <Field label={t('部品の説明(任意。分析・計測の対応表・制作への指示に出す)', 'Part description (optional; shown in reports, the tracking map and production notes)')} size="small">
          <Input size="small" value={p.desc ?? ''} placeholder={where} maxLength={200} onChange={(_, d) => patch(sec, p, { desc: d.value || undefined })} />
        </Field>
        <span className={s.elHead}>
          {p.type === 'box'
            ? t('要素(ID は計測・ピンで使う。説明を変えても ID は変わらない。押せるかは「見せ方」で切り替える)', 'Elements (IDs are used for tracking and pins; editing a description keeps the ID. Toggle clickable under Look)')
            : t('要素(ID は計測・ピンで使う。説明を変えても ID は変わらない)', 'Elements (IDs are used for tracking and pins; editing a description keeps the ID)')}
        </span>
        {partElements(p).map((e) => (
          <div key={e.key} className={s.elRow}>
            <div className={s.elTop}>
              <span className={s.pid} title={e.id}>{e.id}</span>
              {p.type !== 'box' && <Checkbox label={t('押せる', 'Clickable')} checked={elementClickable(p, e)} onChange={(_, d) => setEl(e.key, { click: (d.checked === true) === e.click ? undefined : d.checked === true })} />}
            </div>
            <Input size="small" value={p.els?.[e.key]?.desc ?? ''} placeholder={elementDesc({ ...p, els: undefined }, e, p.desc?.trim() || where)} maxLength={200} onChange={(_, d) => setEl(e.key, { desc: d.value || undefined })} />
          </div>
        ))}
      </>
    )
  }
  // ---- 右のタブ: 操作は見出しの行の右端、設定は見出し付きのまとまり(畳める。開いた状態は覚える)。2026-10-26 利用者が見本を見て決めた
  const [groups, setGroups] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem('ccp.paneGroups') ?? '{}') as Record<string, boolean>
    } catch {
      return {}
    }
  })
  const grp = (key: string, title: string, body: ReactNode, dflt = true) => {
    const open = groups[key] ?? dflt
    const flip = () =>
      setGroups((g) => {
        const next = { ...g, [key]: !open }
        try {
          localStorage.setItem('ccp.paneGroups', JSON.stringify(next))
        } catch {
          // 覚えられなくても、畳む・開くは効く
        }
        return next
      })
    return (
      <div className={s.grp}>
        <button type="button" className={s.grpHead} aria-expanded={open} onClick={flip}>
          {open ? <ChevronDownRegular /> : <ChevronRightRegular />}
          {title}
        </button>
        {open && <div className={s.grpBody}>{body}</div>}
      </div>
    )
  }
  /** 2〜3 択は横並びのボタン(セグメント) */
  const seg = <V extends string | number | undefined>(value: V, opts: [V, string][], on: (v: V) => void) => (
    <div className={s.seg} role="group">
      {opts.map(([v, l]) => (
        <button key={String(v ?? '')} type="button" className={mergeClasses(s.segBtn, value === v && s.segOn)} aria-pressed={value === v} onClick={() => on(v)}>
          {l}
        </button>
      ))}
    </div>
  )
  const stop = (e: React.SyntheticEvent) => e.stopPropagation()
  const iconBtn = (icon: React.ReactElement, label: string, onClick: () => void, disabled = false) => (
    <Button size="small" appearance="subtle" icon={icon} aria-label={label} title={label} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick() }} />
  )
  /** セクションの見出しの行の右端: 上へ・下へ・複製と「…」(上とまとめる・削除) */
  const secActions = (sec: Section, si: number) => (
    <span className={s.hdActs} onClick={stop}>
      {iconBtn(<ArrowUpRegular />, t('上へ', 'Up'), () => moveSection(sec.id!, si - 1), si === 0)}
      {iconBtn(<ArrowDownRegular />, t('下へ', 'Down'), () => moveSection(sec.id!, si + 2), si === sections.length - 1)}
      {iconBtn(<CopyRegular />, t('複製', 'Duplicate'), () => duplicate(sec.id!))}
      <Menu positioning="below-end">
        <MenuTrigger disableButtonEnhancement>
          <Button size="small" appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('ほかの操作', 'More')} onClick={stop} />
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            <MenuItem disabled={si === 0} onClick={() => mergeUp(sec.id!)}>{t('上のセクションとまとめる', 'Merge with the section above')}</MenuItem>
            <MenuItem icon={<DeleteRegular />} onClick={() => removeSection(sec.id!)}>{t('セクションを削除', 'Delete section')}</MenuItem>
          </MenuList>
        </MenuPopover>
      </Menu>
    </span>
  )
  /** 部品の行の「…」: 分割・見せ方をほかの箱にも当てる(削除は、隣のごみ箱) */
  const partMenu = (sec: Section, p: TablePart) =>
    (p.w * p.h > 1 || p.type === 'box') && (
      <span className={s.hdActs} onClick={stop}>
        <Menu positioning="below-end">
          <MenuTrigger disableButtonEnhancement>
            <Button size="small" appearance="subtle" icon={<MoreHorizontalRegular />} aria-label={t('ほかの操作', 'More')} onClick={stop} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {p.w * p.h > 1 && <MenuItem onClick={() => run(sec.id!, (x) => T.splitCells(x, [p.id]))}>{t('分割', 'Split')}</MenuItem>}
              {p.type === 'box' && (
                <>
                  <MenuItem icon={<CopyRegular />} onClick={() => applyLook(sec, p, 'row')}>{t('見せ方を、同じ行の箱にも当てる', 'Apply look to boxes in this row')}</MenuItem>
                  <MenuItem onClick={() => applyLook(sec, p, 'section')}>{t('見せ方を、このセクションの箱にも当てる', 'Apply look to boxes in this section')}</MenuItem>
                  <MenuItem onClick={() => applyLook(sec, p, 'all')}>{t('見せ方を、すべての箱に当てる', 'Apply look to all boxes')}</MenuItem>
                </>
              )}
            </MenuList>
          </MenuPopover>
        </Menu>
      </span>
    )
  /** ⚙ のポップアップの下の「右のタブで開く」 */
  // キャンバスの ⚙ のポップアップ(この下で作る canvas)から呼ぶので、関数の宣言にする(const だと、定義の前に呼ぶことになる)
  function openRightLink(sec: Section, p: TablePart) {
    return (
    <Button
      size="small"
      appearance="transparent"
      className={s.openRight}
      onClick={() => {
        setQuickId(null)
        setPinned(false)
        selectCell(sec.id!, p.c, p.r)
        setOpen(p.id, true)
      }}
    >
      {t('ほかの設定は、右のタブで開く ›', 'More settings in the right tab ›')}
    </Button>
    )
  }
  const linkFields = (sec: Section, p: TablePart) => (
    <>
      <Field label={t('リンク先の種類(実際の URL は配信ごと)', 'Link kind (the actual URL is set per delivery)')} size="small">
        <Select size="small" value={p.link ?? 'campaign'} onChange={(_, d) => patch(sec, p, { link: d.value === 'campaign' ? undefined : (d.value as LinkKind) })}>
          {LINK_KINDS.map((k) => (
            <option key={k} value={k}>{linkKindLabel(k)}</option>
          ))}
        </Select>
      </Field>
      {utmField(p)}
    </>
  )
  const frameField = (sec: Section, p: TablePart) => (
    <Field label={t('枠で囲む', 'Frame')} size="small">
      {seg(p.frame, [[undefined, t('なし', 'None')], ['solid', t('線', 'Solid')], ['dashed', t('点線', 'Dashed')]], (v) => patch(sec, p, { frame: v }))}
    </Field>
  )
  const alignSeg = (sec: Section, p: TablePart, fallback: TextAlign) => (
    <Field label={t('揃え', 'Alignment')} size="small">
      {seg(p.align ?? fallback, (['left', 'center', 'right'] as TextAlign[]).map((a) => [a, T.alignLabel(a)] as [TextAlign, string]), (a) => patch(sec, p, { align: a === fallback ? undefined : a }))}
    </Field>
  )
  function imageFields(sec: Section, p: TablePart, label: string) {
    return (
    <Field label={label} size="small">
      <PartImagePick onPick={(img) => patch(sec, p, { src: img.url, imageId: img.id, alt: p.alt || img.alt || undefined })} />
      <Input size="small" value={p.src ?? ''} placeholder="https://…" onChange={(_, d) => patch(sec, p, { src: d.value.trim() || undefined, imageId: undefined })} />
    </Field>
    )
  }
  /** 画像・動画の ⚙ のポップアップ(見せ方だけ: 画像と形) */
  function mediaLook(sec: Section, p: TablePart) {
    return (
    <>
      {imageFields(sec, p, t('画像', 'Image'))}
      <Field label={t('形', 'Shape')} size="small">
        <Select size="small" value={p.ratio ?? 'wide'} onChange={(_, d) => patch(sec, p, { ratio: d.value === 'wide' ? undefined : (d.value as MediaRatio) })}>
          {MEDIA_RATIOS.map((r) => (
            <option key={r} value={r}>{T.ratioLabel(r)}</option>
          ))}
        </Select>
      </Field>
      {openRightLink(sec, p)}
    </>
    )
  }
  const secDetail = (sec: Section) => (
    <div className={mergeClasses(s.secFields, s.grpWrap)}>
      {grp(
        'sec.content',
        t('中身', 'Content'),
        <>
          <Field label={t('名前(キャンバスの札と構成に出る)', 'Name (canvas tag and outline)')} size="small">
            <Input size="small" value={sec.name ?? ''} placeholder={t('例: 新作', 'e.g. New arrivals')} maxLength={40} onChange={(_, d) => replace(sec.id!, { ...sec, name: d.value || undefined })} />
          </Field>
          <Field label={t('AI が配信ごとに書くもの', 'Written by AI per delivery')} size="small">
            <div className={s.two}>
              <Checkbox id={`sec-${sec.id}-heading`} label={t('見出し', 'Heading')} checked={!!sec.categoryHeading} onChange={(_, d) => replace(sec.id!, { ...sec, categoryHeading: d.checked === true || undefined })} />
              <Checkbox id={`sec-${sec.id}-copy`} label={t('コピー', 'Copy')} checked={sec.copy !== false} onChange={(_, d) => replace(sec.id!, { ...sec, copy: d.checked === true ? undefined : false })} />
            </div>
          </Field>
          <Field label={t('AI の切り口のメモ', 'Angle for AI')} size="small">
            <AutoTextarea rows={2} size="small" value={sec.aiNote ?? ''} placeholder={t('例: セール対象を、価格の安い順に', 'e.g. Sale items, cheapest first')} onChange={(_, d) => replace(sec.id!, { ...sec, aiNote: d.value || undefined })} />
          </Field>
        </>,
      )}
      {grp(
        'sec.look',
        t('見た目', 'Look'),
        <>
          <Field label={t('背景の色', 'Background')} size="small">
            <div className={s.row2}>
              {([undefined, 'gray', 'beige', 'blue', 'pink'] as (SectionBg | undefined)[]).map((b) => {
                const on = sec.bg === b
                return (
                  <button key={b ?? 'white'} type="button" className={mergeClasses(s.swatch, on && s.swatchOn)} aria-pressed={on} onClick={() => replace(sec.id!, { ...sec, bg: b })}>
                    <span style={{ backgroundColor: b ? T.SECTION_BG[b] : '#fff', border: `1px solid ${tokens.colorNeutralStroke2}` }} />
                    {T.sectionBgLabel(b)}
                  </button>
                )
              })}
            </div>
          </Field>
          <div className={s.two}>
            <Field label={t('上下の余白', 'Spacing')} size="small">
              {seg(sec.space, [['tight', t('狭い', 'Tight')], [undefined, t('ふつう', 'Normal')], ['wide', t('広い', 'Wide')]], (v) => replace(sec.id!, { ...sec, space: v }))}
            </Field>
            <Field label={t('スマホ', 'On phones')} size="small">
              {seg(sec.mobile, [[undefined, t('列のまま', 'Columns')], ['stack', t('縦に積む', 'Stack')]], (v) => replace(sec.id!, { ...sec, mobile: v }))}
            </Field>
          </div>
          <Checkbox label={t('上に区切り線', 'Divider above')} checked={!!sec.divider} onChange={(_, d) => replace(sec.id!, { ...sec, divider: d.checked === true || undefined })} />
        </>,
      )}
      {grp('sec.detail', t('詳しい', 'Details'), kv(t('セクション ID', 'Section ID'), <span className={s.pid}>{sec.id}</span>), false)}
    </div>
  )
  const partDetail = (sec: Section, p: TablePart) => {
    const details = grp(
      `${p.type}.detail`,
      // 箱の「押せる」は見せ方のまとまりにあるので、箱の見出しには書かない
      p.type === 'box' ? t('詳しい(説明・要素の ID・位置)', 'Details (description, element IDs, position)') : p.type === 'empty' ? t('詳しい(位置)', 'Details (position)') : t('詳しい(説明・要素の ID・押せる・位置)', 'Details (description, element IDs, clickable, position)'),
      <>
        {p.type !== 'empty' && elementsBlock(sec, p)}
        {kv(t('位置 · 大きさ', 'Position · size'), <span>{t(`列 ${p.c + 1} 行 ${p.r + 1} · ${p.w} × ${p.h}`, `Col ${p.c + 1} row ${p.r + 1} · ${p.w} × ${p.h}`)}</span>)}
        {kv(t('部品 ID', 'Part ID'), <span className={s.pid}>{p.id}</span>)}
      </>,
      false,
    )
    let body: ReactNode
    if (p.type === 'box') {
      body = (
        <>
          {grp('box.look', t('見せ方', 'Look'), boxSettings(sec, [p], { look: true }))}
          {grp(
            'box.ai',
            t('AI への一言', 'Note for AI'),
            <AutoTextarea rows={2} size="small" value={p.aiNote ?? ''} placeholder={t('例: 主役の新作を置く', 'e.g. The lead new arrival')} onChange={(_, d) => patch(sec, p, { aiNote: d.value || undefined })} />,
          )}
        </>
      )
    } else if (p.type === 'button') {
      body = (
        <>
          {grp(
            'button.content',
            t('中身', 'Content'),
            <>
              <Field label={t('文言', 'Label')} size="small">
                <Input size="small" value={p.label ?? ''} placeholder={defaultButtonLabel(0)} maxLength={30} onChange={(_, d) => patch(sec, p, { label: d.value || undefined })} />
              </Field>
              {p.face !== 'image' && (
                <Checkbox label={t('文言を配信ごとに書き換えてよい', 'Label can be rewritten per delivery')} checked={p.overridable !== false} onChange={(_, d) => patch(sec, p, { overridable: d.checked === true ? undefined : false })} />
              )}
              <Field label={t('文字 / 画像', 'Text / image')} size="small">
                {seg(p.face, [[undefined, t('文字', 'Text')], ['image', t('画像', 'Image')], ['both', t('画像に文字', 'Both')]], (v) => patch(sec, p, { face: v }))}
              </Field>
              {p.face && (
                <>
                  {imageFields(sec, p, t('ボタンの画像', 'Button image'))}
                  <Field label={t('代わりの文', 'Alt text')} size="small">
                    <Input size="small" value={p.alt ?? ''} placeholder={p.label || defaultButtonLabel(0)} maxLength={120} onChange={(_, d) => patch(sec, p, { alt: d.value || undefined })} />
                  </Field>
                  <Checkbox label={t('配信ごとに画像を差し替えてよい', 'Image can be swapped per delivery')} checked={p.swap !== false} onChange={(_, d) => patch(sec, p, { swap: d.checked === true ? undefined : false })} />
                </>
              )}
            </>,
          )}
          {grp(
            'button.look',
            t('見た目', 'Look'),
            <>
              <Field label={t('塗り方', 'Style')} size="small">
                {seg(p.style, [[undefined, t('塗り', 'Filled')], ['outline', t('枠線', 'Outline')], ['text', t('文字のリンク', 'Text link')]], (v) => patch(sec, p, { style: v }))}
              </Field>
              <Field label={t('形', 'Shape')} size="small">
                {seg(p.shape, [[undefined, t('丸', 'Pill')], ['rounded', t('角丸', 'Rounded')], ['square', t('四角', 'Square')], ['underline', t('下線', 'Underline')]], (v) => patch(sec, p, { shape: v }))}
              </Field>
              <div className={s.two}>
                <Field label={t('大きさ', 'Size')} size="small">
                  {seg(p.size, [['small', t('小', 'S')], [undefined, t('中', 'M')], ['large', t('大', 'L')]], (v) => patch(sec, p, { size: v }))}
                </Field>
                <Field label={t('幅', 'Width')} size="small">
                  {seg(p.fit ? 'fit' : undefined, [[undefined, t('いっぱい', 'Fill')], ['fit', t('文字幅', 'Fit')]], (v) => patch(sec, p, { fit: v === 'fit' || undefined }))}
                </Field>
              </div>
              <div className={s.two}>
                <Field label={t('矢印(›)', 'Arrow (›)')} size="small">
                  {seg(p.icon, [[undefined, t('なし', 'None')], ['left', t('左', 'Left')], ['right', t('右', 'Right')]], (v) => patch(sec, p, { icon: v }))}
                </Field>
                {alignSeg(sec, p, 'center')}
              </div>
              <Field label={t('色', 'Color')} size="small">
                <div className={s.row2}>
                  {(Object.keys(T.BUTTON_COLORS) as ButtonColor[]).map((c) => {
                    const on = (p.color ?? 'black') === c
                    return (
                      <button key={c} type="button" className={mergeClasses(s.swatch, on && s.swatchOn)} aria-pressed={on} title={T.buttonColorLabel(c)} onClick={() => patch(sec, p, { color: c === 'black' ? undefined : c })}>
                        <span style={{ backgroundColor: T.BUTTON_COLORS[c] }} />
                        {T.buttonColorLabel(c)}
                      </button>
                    )
                  })}
                </div>
              </Field>
              {frameField(sec, p)}
            </>,
          )}
          {grp('button.link', t('リンク', 'Link'), linkFields(sec, p))}
        </>
      )
    } else if (p.type === 'text') {
      body = (
        <>
          {grp(
            'text.content',
            t('中身', 'Content'),
            <>
              <Field label={t('固定の文', 'Fixed text')} size="small">
                <AutoTextarea rows={3} size="small" value={p.text ?? ''} onChange={(_, d) => patch(sec, p, { text: d.value || undefined })} />
              </Field>
              <Checkbox label={t('配信ごとに書き換えてよい', 'Can be rewritten per delivery')} checked={p.overridable !== false} onChange={(_, d) => patch(sec, p, { overridable: d.checked === true ? undefined : false })} />
            </>,
          )}
          {grp(
            'text.look',
            t('見た目', 'Look'),
            <>
              <div className={s.two}>
                <Field label={t('向き', 'Direction')} size="small">
                  {seg(p.dir, [[undefined, t('横', 'Horiz.')], ['vertical', t('縦書き', 'Vertical')], ['rotate', t('90°', '90°')]], (v) => patch(sec, p, { dir: v }))}
                </Field>
                {alignSeg(sec, p, 'left')}
              </div>
              {frameField(sec, p)}
            </>,
          )}
        </>
      )
    } else if (p.type === 'media') {
      body = (
        <>
          {grp(
            'media.content',
            t('中身', 'Content'),
            <>
              {imageFields(sec, p, t('画像', 'Image'))}
              <Field label={t('動画の URL(任意。メールでは画像に ▶ を重ねる)', 'Video URL (optional)')} size="small">
                <Input size="small" value={p.video ?? ''} placeholder="https://…" onChange={(_, d) => patch(sec, p, { video: d.value.trim() || undefined })} />
              </Field>
              <Field label={t('代わりの文', 'Alt text')} size="small">
                <Input size="small" value={p.alt ?? ''} maxLength={120} onChange={(_, d) => patch(sec, p, { alt: d.value || undefined })} />
              </Field>
              <Checkbox label={t('配信ごとに差し替える', 'Swap per delivery')} checked={!!p.swap} onChange={(_, d) => patch(sec, p, { swap: d.checked === true || undefined })} />
            </>,
          )}
          {grp(
            'media.look',
            t('見た目', 'Look'),
            <>
              <Field label={t('形', 'Shape')} size="small">
                <Select size="small" value={p.ratio ?? 'wide'} onChange={(_, d) => patch(sec, p, { ratio: d.value === 'wide' ? undefined : (d.value as MediaRatio) })}>
                  {MEDIA_RATIOS.map((r) => (
                    <option key={r} value={r}>{T.ratioLabel(r)}</option>
                  ))}
                </Select>
              </Field>
              {frameField(sec, p)}
            </>,
          )}
          {grp('media.link', t('リンク', 'Link'), linkFields(sec, p))}
        </>
      )
    } else if (p.type === 'line') {
      body = grp(
        'line.look',
        t('見た目', 'Look'),
        <>
          <div className={s.two}>
            <Field label={t('太さ', 'Weight')} size="small">
              {seg(p.lineWidth, [[undefined, t('細い', 'Thin')], [2, t('ふつう', 'Regular')], [4, t('太い', 'Thick')]], (v) => patch(sec, p, { lineWidth: v }))}
            </Field>
            <Field label={t('長さ', 'Length')} size="small">
              {seg(p.lineShort ? 'short' : undefined, [[undefined, t('全幅', 'Full')], ['short', t('真ん中', 'Center')]], (v) => patch(sec, p, { lineShort: v === 'short' || undefined }))}
            </Field>
          </div>
          <Field label={t('色', 'Color')} size="small">
            {seg(p.lineColor, [[undefined, t('薄いグレー', 'Light gray')], ['gray', t('グレー', 'Gray')], ['black', t('黒', 'Black')]], (v) => patch(sec, p, { lineColor: v }))}
          </Field>
          <Field label={t('上下の余白', 'Spacing')} size="small">
            {seg(p.lineSpace, [['tight', t('狭い', 'Tight')], [undefined, t('ふつう', 'Normal')], ['wide', t('広い', 'Wide')]], (v) => patch(sec, p, { lineSpace: v }))}
          </Field>
        </>,
      )
    } else if (p.type === 'spacer') {
      body = grp(
        'spacer.look',
        t('見た目', 'Look'),
        <Field label={t('高さ', 'Height')} size="small">
          {seg(p.height === 24 ? undefined : p.height, T.SPACER_HEIGHTS.map((h) => [h === 24 ? undefined : h, `${h}px`] as [number | undefined, string]), (v) => patch(sec, p, { height: v }))}
        </Field>,
      )
    } else {
      body = <span className={s.hint}>{t('空きのマス。左のパーツを落とすと、そのパーツになります。メールでは何も出ない余白です。', 'An empty cell. Drop a part here to fill it. It shows as blank space in the email.')}</span>
    }
    return (
      <div className={mergeClasses(s.pbody, s.grpWrap)}>
        {body}
        {details}
      </div>
    )
  }

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
            {selSec && selParts.filter((p) => p.type === 'box').length > 1 && boxSettings(selSec, selParts.filter((p) => p.type === 'box').sort((x, y) => x.r - y.r || x.c - y.c))}
          </div>
        )}
        {[...((heroSec.rows ?? 0) > 0 ? [heroSec] : []), ...sections].map((sec) => {
          const si = sections.indexOf(sec)
          const cur = sel?.sec === sec.id
          const open = isOpen(sec.id!, cur)
          const n = (type: PartType) => (sec.parts ?? []).filter((p) => p.type === type).length
          return (
            <div key={sec.id} className={mergeClasses(s.scard, sel?.kind === 'section' && cur && s.scardCur)}>
              <div
                className={s.shd}
                onClick={() => {
                  // 選んでいるセクションの見出しをもう一度押したら、閉じる(開くのは、選んだとき)
                  if (sel?.kind === 'section' && cur && open) return setOpen(sec.id!, false)
                  setSel({ kind: 'section', sec: sec.id! })
                  setFold((prev) => ({ ...prev, [sec.id!]: { open: true, key: '' } }))
                  document.querySelector(`[data-sec="${CSS.escape(sec.id!)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                }}
              >
                <span
                  className={s.chev}
                  onClick={(e) => {
                    e.stopPropagation()
                    setOpen(sec.id!, !open)
                  }}
                >
                  {open ? <ChevronDownRegular /> : <ChevronRightRegular />}
                </span>
                <span className={s.sbadge}>{si < 0 ? 'H' : `S${si + 1}`}</span>
                <span className={s.sname}>{si < 0 ? t('ヒーローの下', 'Under the hero') : sec.name?.trim() || t('(名前なし)', '(no name)')}</span>
                <span className={s.smeta}>{(sec.rows ?? 0) > 0 ? t(`${sec.cols}×${sec.rows} · 商品 ${n('box')}`, `${sec.cols}×${sec.rows} · ${n('box')} items`) : t('空', 'Empty')}</span>
                {si >= 0 && secActions(sec, si)}
              </div>
              {open && (
                <div className={s.sbody}>
                  {sel?.kind === 'section' && cur && si >= 0 && secDetail(sec)}
                  {[...(sec.parts ?? [])]
                    .sort((a, b) => a.r - b.r || a.c - b.c)
                    .map((p) => {
                      const pOpen = isOpen(p.id, p.id === one)
                      // 均等の行の空きは、メールに出ない余白なので薄く出す(分析・位置の数え方でも数えない)
                      const evenEmpty = p.type === 'empty' && T.isEvenRow(sec, p.r)
                      return (
                        <div
                          key={p.id}
                          className={mergeClasses(s.pcard, p.type === 'box' ? s.tBox : p.type === 'button' ? s.tButton : p.type === 'text' ? s.tText : p.type === 'media' ? s.tMedia : s.tEmpty, selIds.has(p.id) && s.pcardCur, evenEmpty && s.pcardDim)}
                          onMouseEnter={() => setPeek(p.id)}
                          onMouseLeave={() => setPeek(null)}
                        >
                          <div
                            className={s.phd}
                            onClick={() => {
                              // 選んでいる部品の行をもう一度押したら、閉じる
                              if (p.id === one && pOpen) return setOpen(p.id, false)
                              setOpen(p.id, true)
                              selectCell(sec.id!, p.c, p.r)
                              document.querySelector(`[data-cell="${CSS.escape(p.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                            }}
                          >
                            {mini(sec, p)}
                            <span className={s.tchip}>{typeName(p.type)}</span>
                            <span className={s.pn}>{evenEmpty ? t('均等の行の空き(メールには出ない)', 'Spare cell in an even row (not in the email)') : partName(p)}</span>
                            <span className={s.ps}>{p.w * p.h > 1 ? `${p.w}×${p.h}` : ''}</span>
                            {partMenu(sec, p)}
                            {p.type !== 'empty' && (
                              <span
                                role="button"
                                tabIndex={0}
                                className={s.pdel}
                                title={t('この部品を削除して空きにする(Ctrl+Z で戻す)', 'Delete this part, leaving an empty cell (Ctrl+Z to undo)')}
                                aria-label={t(`${partName(p)} を削除`, `Delete ${partName(p)}`)}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  replace(sec.id!, T.clearCells(sec, [p.id]))
                                }}
                                onKeyDown={(e) => {
                                  if (e.key !== 'Enter' && e.key !== ' ') return
                                  e.preventDefault()
                                  e.stopPropagation()
                                  replace(sec.id!, T.clearCells(sec, [p.id]))
                                }}
                              >
                                <DeleteRegular />
                              </span>
                            )}
                            <span
                              className={s.chev}
                              onClick={(e) => {
                                e.stopPropagation()
                                setOpen(p.id, !pOpen)
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

  return { palette, canvas, zoomBar, samplesToggle, rightPane, goSection, clearSelection: () => setSel(null) }
}
