import { tr } from './i18n'
import { CELL_VIEWS, type CellView } from './cells'
import { gridColumns, placedButtons, type ButtonBlock, type ButtonSpec, type LinkKind, type PartType, type Section, type TablePart, type TemplateLayout } from './templates'

// 表のセクション(種類 'table'。T8、docs/TEMPLATE_OBJECTS.md)の計算と操作。
// 部品は {列 c, 行 r, 幅 w, 高さ h} で、表をすき間なく敷き詰める(空いた所は「空き」の部品)。
// 操作は、もとのセクションを変えずに、新しいセクションを返す(編集画面の「元に戻す」が、前の形をそのまま持てるように)

/** 列の上限(メールの幅で、1 マスが小さくなりすぎないように) */
export const MAX_TABLE_COLS = 4
export const MAX_TABLE_ROWS = 8

/** マスの範囲(列 c・行 r から、横 w・縦 h マス) */
export interface Rect {
  c: number
  r: number
  w: number
  h: number
}
/** 選んでいるマス(押した所 a から、なぞった所 b まで。[列, 行]) */
export interface CellSel {
  a: [number, number]
  b: [number, number]
}
/** 操作の結果。できないときは、理由(画面に出す) */
export type TableOp = { sec: Section; sel?: CellSel } | { error: string }

const PREFIX: Record<PartType, string> = { box: 'box', button: 'btn', text: 'txt', empty: 'emp' }
// ID は、種類の頭 + 短いランダムな文字。テンプレートの中で重ならなければよい(比べるときは、いつもテンプレート ID と組で見る)
const rand = () => Math.random().toString(36).slice(2, 8)
export const newPartId = (type: PartType) => `${PREFIX[type]}_${rand()}`
export const newSectionId = () => `sec_${rand()}`

/** 新しい部品(種類ごとの設定は、既定の値なので持たない) */
export const newPart = (type: PartType, c: number, r: number, w = 1, h = 1): TablePart => ({ id: newPartId(type), type, c, r, w, h })

export const isTable = (sec: Section) => sec.kind === 'table'
export const partsOf = (sec: Section): TablePart[] => sec.parts ?? []
const byPosition = (a: { r: number; c: number }, b: { r: number; c: number }) => a.r - b.r || a.c - b.c

/** 箱(商品の枠)を、商品の載る順(上の行から、同じ行は左から)に */
export const boxesOf = (sec: Section): TablePart[] => partsOf(sec).filter((p) => p.type === 'box').sort(byPosition)

/** マス (c, r) を含む部品 */
export const partAt = (sec: Section, c: number, r: number): TablePart | undefined => partsOf(sec).find((p) => c >= p.c && c < p.c + p.w && r >= p.r && r < p.r + p.h)

export const hit = (p: Rect, rc: Rect) => p.c < rc.c + rc.w && rc.c < p.c + p.w && p.r < rc.r + rc.h && rc.r < p.r + p.h

/** 枠の数(slots)を、箱の数に合わせる。以前の版のアプリは、知らない種類をグリッドとして、この数で読む */
const withSlots = (sec: Section): Section => ({ ...sec, slots: partsOf(sec).filter((p) => p.type === 'box').length })

/**
 * 表を整える: 列・行を上限に収め、はみ出した部品・重なった部品を外し、空いたマスを空きの部品で埋める。
 * idOf を渡すと、埋めた空きの ID を、その位置から決める(保存されたデータを読むとき。読むたびに同じ ID になるように)
 */
export function normalizeTable(sec: Section, idOf?: (c: number, r: number) => string): Section {
  const cols = Math.min(MAX_TABLE_COLS, Math.max(1, Math.round(sec.cols ?? 2)))
  const rows = Math.min(MAX_TABLE_ROWS, Math.max(0, Math.round(sec.rows ?? 0)))
  const used = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false))
  const out: TablePart[] = []
  const seen = new Set<string>()
  for (const p of partsOf(sec)) {
    const c = Math.round(p.c)
    const r = Math.round(p.r)
    const w = Math.round(p.w)
    const h = Math.round(p.h)
    if (!(c >= 0 && r >= 0 && w >= 1 && h >= 1 && c + w <= cols && r + h <= rows) || !p.id || seen.has(p.id)) continue
    let free = true
    for (let i = r; i < r + h && free; i++) for (let j = c; j < c + w; j++) if (used[i][j]) free = false
    if (!free) continue
    for (let i = r; i < r + h; i++) for (let j = c; j < c + w; j++) used[i][j] = true
    seen.add(p.id)
    out.push({ ...p, c, r, w, h })
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) if (!used[i][j]) out.push({ id: idOf ? idOf(j, i) : newPartId('empty'), type: 'empty', c: j, r: i, w: 1, h: 1 })
  return withSlots({ ...sec, kind: 'table', id: sec.id || newSectionId(), cols, rows, parts: out })
}

/** 空きのマスを埋める(操作のあと) */
const filled = (sec: Section): Section => normalizeTable(sec)

/** 押した所からなぞった所までの範囲。結合したマスにかかると、その部品が丸ごと入るまで広げる */
export function rectOf(sec: Section, sel: CellSel): Rect {
  const rc: Rect = { c: Math.min(sel.a[0], sel.b[0]), r: Math.min(sel.a[1], sel.b[1]), w: Math.abs(sel.a[0] - sel.b[0]) + 1, h: Math.abs(sel.a[1] - sel.b[1]) + 1 }
  for (let changed = true; changed; ) {
    changed = false
    for (const p of partsOf(sec)) {
      if (!hit(p, rc)) continue
      const c0 = Math.min(rc.c, p.c)
      const r0 = Math.min(rc.r, p.r)
      const c1 = Math.max(rc.c + rc.w, p.c + p.w)
      const r1 = Math.max(rc.r + rc.h, p.r + p.h)
      if (c0 !== rc.c || r0 !== rc.r || c1 !== rc.c + rc.w || r1 !== rc.r + rc.h) {
        Object.assign(rc, { c: c0, r: r0, w: c1 - c0, h: r1 - r0 })
        changed = true
      }
    }
  }
  return rc
}

/** 選んでいる範囲にかかる部品 */
export const partsIn = (sec: Section, sel: CellSel): TablePart[] => {
  const rc = rectOf(sec, sel)
  return partsOf(sec).filter((p) => hit(p, rc))
}

/** 種類を変えた部品(形が変わるので新しい ID。前の種類の設定は持ち越さない) */
const retype = (p: TablePart, type: PartType): TablePart => ({ id: newPartId(type), type, c: p.c, r: p.r, w: p.w, h: p.h })

/** 種類ごとの設定だけを写す(分割したマスに、もとの見せ方・文言を残すため) */
const settingsOf = (p: TablePart): Partial<TablePart> => {
  const { view, aiNote, label, style, link, track, text, overridable } = p
  return Object.fromEntries(Object.entries({ view, aiNote, label, style, link, track, text, overridable }).filter(([, v]) => v !== undefined))
}

/** 選んだ範囲を 1 つの部品にまとめる。中身は、左上(空きなら、最初の中身のある部品)のものを残し、新しい ID にする */
export function mergeCells(sec: Section, sel: CellSel): TableOp {
  const rc = rectOf(sec, sel)
  const ps = partsOf(sec).filter((p) => hit(p, rc))
  if (ps.length < 2) return { error: tr('2 つ以上のマスを選んでから結合します', 'Select two or more cells to merge') }
  const sorted = [...ps].sort(byPosition)
  const keep = sorted.find((p) => p.type !== 'empty') ?? sorted[0]
  const merged: TablePart = { ...settingsOf(keep), id: newPartId(keep.type), type: keep.type, ...rc }
  return { sec: filled({ ...sec, parts: [...partsOf(sec).filter((p) => !ps.includes(p)), merged] }), sel: { a: [rc.c, rc.r], b: [rc.c, rc.r] } }
}

/** 結合した部品を 1 マスずつに分ける(分けた部品は、もとの種類と設定で、それぞれ新しい ID) */
export function splitCells(sec: Section, ids: string[]): TableOp {
  const big = partsOf(sec).filter((p) => ids.includes(p.id) && p.w * p.h > 1)
  if (big.length === 0) return { error: tr('結合したマスを選ぶと、分割できます', 'Select a merged cell to split it') }
  const units = big.flatMap((p) => Array.from({ length: p.w * p.h }, (_, k) => ({ ...settingsOf(p), ...newPart(p.type, p.c + (k % p.w), p.r + Math.floor(k / p.w)) })))
  return { sec: filled({ ...sec, parts: [...partsOf(sec).filter((p) => !big.includes(p)), ...units] }) }
}

/** 空きにする(形はそのまま。種類が変わるので新しい ID) */
export function clearCells(sec: Section, ids: string[]): Section {
  return withSlots({ ...sec, parts: partsOf(sec).map((p) => (ids.includes(p.id) && p.type !== 'empty' ? retype(p, 'empty') : p)) })
}

/** 部品の種類を変える(空きのマスに「置く」・パーツを落とす) */
export function setPartType(sec: Section, id: string, type: PartType): Section {
  return withSlots({ ...sec, parts: partsOf(sec).map((p) => (p.id === id && p.type !== type ? retype(p, type) : p)) })
}

/** 部品の設定を変える(形は変わらないので、ID はそのまま) */
export function patchPart(sec: Section, id: string, patch: Partial<TablePart>): Section {
  return { ...sec, parts: partsOf(sec).map((p) => (p.id === id ? { ...p, ...patch, id: p.id, type: p.type } : p)) }
}

/**
 * i 行目に行を差し込む。ふだんは空きのマス。type を渡すと、その部品を 1 つ置く(place: 置く列と幅。省略は行いっぱい)。
 * 差し込む位置をまたぐ結合したマスは、縦に 1 行伸びる
 */
export function insertRow(sec: Section, i: number, type: PartType = 'empty', place?: { c: number; w: number }): TableOp {
  const rows = sec.rows ?? 0
  if (rows >= MAX_TABLE_ROWS) return { error: tr(`行は ${MAX_TABLE_ROWS} 行まで`, `Up to ${MAX_TABLE_ROWS} rows`) }
  const parts = partsOf(sec).map((p) => (p.r >= i ? { ...p, r: p.r + 1 } : p.r + p.h > i ? { ...p, h: p.h + 1 } : p))
  const cols = sec.cols ?? 1
  const added = type !== 'empty' ? newPart(type, place ? place.c : 0, i, place ? place.w : cols, 1) : null
  const next = filled({ ...sec, rows: rows + 1, parts: added ? [...parts, added] : parts })
  return { sec: next, sel: added ? { a: [added.c, i], b: [added.c, i] } : { a: [0, i], b: [cols - 1, i] } }
}

/** i 列目に列を差し込む(place: 置く行と高さ。省略は列いっぱい) */
export function insertCol(sec: Section, i: number, type: PartType = 'empty', place?: { r: number; h: number }): TableOp {
  const cols = sec.cols ?? 1
  if (cols >= MAX_TABLE_COLS) return { error: tr(`列は ${MAX_TABLE_COLS} 列まで(メールの幅で、1 マスが小さくなりすぎないように)`, `Up to ${MAX_TABLE_COLS} columns (so cells don't get too small in an email)`) }
  const parts = partsOf(sec).map((p) => (p.c >= i ? { ...p, c: p.c + 1 } : p.c + p.w > i ? { ...p, w: p.w + 1 } : p))
  const rows = sec.rows ?? 0
  const added = type !== 'empty' ? newPart(type, i, place ? place.r : 0, 1, place ? place.h : rows) : null
  const next = filled({ ...sec, cols: cols + 1, parts: added ? [...parts, added] : parts })
  return { sec: next, sel: added ? { a: [i, added.r], b: [i, added.r] } : { a: [i, 0], b: [i, rows - 1] } }
}

/** r 行目を消す(その行だけの部品は消え、またぐ結合したマスは 1 行縮む) */
export function deleteRow(sec: Section, r: number): TableOp {
  const rows = sec.rows ?? 0
  if (rows <= 1) return { error: tr('最後の 1 行は消せません(セクションごと消すときは、「セクションと部品」のタブから)', "The last row can't be removed (remove the whole section from the Sections & parts tab)") }
  const parts = partsOf(sec)
    .filter((p) => !(p.r === r && p.h === 1))
    .map((p) => (p.r > r ? { ...p, r: p.r - 1 } : p.r + p.h > r ? { ...p, h: p.h - 1 } : p))
  return { sec: filled({ ...sec, rows: rows - 1, parts }) }
}

export function deleteCol(sec: Section, c: number): TableOp {
  const cols = sec.cols ?? 1
  if (cols <= 1) return { error: tr('最後の 1 列は消せません', "The last column can't be removed") }
  const parts = partsOf(sec)
    .filter((p) => !(p.c === c && p.w === 1))
    .map((p) => (p.c > c ? { ...p, c: p.c - 1 } : p.c + p.w > c ? { ...p, w: p.w - 1 } : p))
  return { sec: filled({ ...sec, cols: cols - 1, parts }) }
}

/** 行を上下に入れ替える(結合したマスがまたがっていると、入れ替えられない) */
export function moveRow(sec: Section, r: number, d: number): TableOp {
  const o = r + d
  if (o < 0 || o >= (sec.rows ?? 0)) return { error: '' }
  if (partsOf(sec).some((p) => p.h > 1 && ((p.r <= r && p.r + p.h > r) || (p.r <= o && p.r + p.h > o)))) return { error: tr('結合したマスがまたがっているので、この行は動かせません', "A merged cell spans this row, so it can't be moved") }
  const parts = partsOf(sec).map((p) => (p.r === r ? { ...p, r: o } : p.r === o ? { ...p, r } : p))
  return { sec: { ...sec, parts }, sel: { a: [0, o], b: [(sec.cols ?? 1) - 1, o] } }
}

export function moveCol(sec: Section, c: number, d: number): TableOp {
  const o = c + d
  if (o < 0 || o >= (sec.cols ?? 1)) return { error: '' }
  if (partsOf(sec).some((p) => p.w > 1 && ((p.c <= c && p.c + p.w > c) || (p.c <= o && p.c + p.w > o)))) return { error: tr('結合したマスがまたがっているので、この列は動かせません', "A merged cell spans this column, so it can't be moved") }
  const parts = partsOf(sec).map((p) => (p.c === c ? { ...p, c: o } : p.c === o ? { ...p, c } : p))
  return { sec: { ...sec, parts }, sel: { a: [o, 0], b: [o, (sec.rows ?? 1) - 1] } }
}

/** 空のセクション(見出しだけ。最初の行は、列の数を選んで作る) */
export const emptySection = (): Section => ({ kind: 'table', id: newSectionId(), cols: 2, rows: 0, parts: [], slots: 0, categoryHeading: true })

/** 空のセクションの最初の行を、n 列で作る */
export const firstRow = (sec: Section, n: number): TableOp => ({ sec: filled({ ...sec, cols: n, rows: 1, parts: [] }), sel: { a: [0, 0], b: [n - 1, 0] } })

/** よく使う行(1 行まとめて置く)。parts は [種類, 列, 行, 幅(0 は行いっぱい), 高さ] */
export interface RowPreset {
  id: string
  label: () => string
  cols: number
  rows: number
  parts: [PartType, number, number, number?, number?][]
}
export const ROW_PRESETS: RowPreset[] = [
  { id: 'x2', label: () => tr('箱 × 2', 'Box × 2'), cols: 2, rows: 1, parts: [['box', 0, 0], ['box', 1, 0]] },
  { id: 'x3', label: () => tr('箱 × 3', 'Box × 3'), cols: 3, rows: 1, parts: [['box', 0, 0], ['box', 1, 0], ['box', 2, 0]] },
  { id: 'big', label: () => tr('大 1 + 小 2', '1 large + 2 small'), cols: 2, rows: 2, parts: [['box', 0, 0, 1, 2], ['box', 1, 0], ['box', 1, 1]] },
  { id: 'tb', label: () => tr('文 + 箱', 'Text + box'), cols: 2, rows: 1, parts: [['text', 0, 0], ['box', 1, 0]] },
  { id: 'btn', label: () => tr('ボタンの行', 'Button row'), cols: 0, rows: 1, parts: [['button', 0, 0, 0, 1]] },
]

/** よく使う行を、i 行目に差し込む(列が足りなければ、セクションの列を増やす。余るマスは空き) */
export function insertPreset(sec: Section, i: number, preset: RowPreset): TableOp {
  const rows = sec.rows ?? 0
  if (rows + preset.rows > MAX_TABLE_ROWS) return { error: tr(`行は ${MAX_TABLE_ROWS} 行まで`, `Up to ${MAX_TABLE_ROWS} rows`) }
  const cols = rows === 0 ? Math.max(1, preset.cols) : Math.max(sec.cols ?? 1, preset.cols)
  const parts = partsOf(sec).map((p) => (p.r >= i ? { ...p, r: p.r + preset.rows } : p.r + p.h > i ? { ...p, h: p.h + preset.rows } : p))
  const added = preset.parts.map(([type, c, r, w = 1, h = 1]) => newPart(type, c, i + r, w || cols, h))
  return { sec: filled({ ...sec, cols, rows: rows + preset.rows, parts: [...parts, ...added] }), sel: { a: [0, i], b: [cols - 1, i + preset.rows - 1] } }
}

/** r 行目から下を、新しいセクションに分ける */
export function splitSection(sec: Section, r: number): { error: string } | { top: Section; bottom: Section } {
  if (r <= 0) return { error: tr('いちばん上の行では分けられません', "Can't split at the top row") }
  if (partsOf(sec).some((p) => p.r < r && p.r + p.h > r)) return { error: tr('結合したマスがまたがっているので、ここでは分けられません', "A merged cell spans this row, so it can't be split here") }
  const top = withSlots({ ...sec, rows: r, parts: partsOf(sec).filter((p) => p.r < r) })
  const bottom = withSlots({ kind: 'table', id: newSectionId(), cols: sec.cols, rows: (sec.rows ?? 0) - r, categoryHeading: true, slots: 0, parts: partsOf(sec).filter((p) => p.r >= r).map((p) => ({ ...p, r: p.r - r })) })
  return { top, bottom }
}

/** 下のセクションを、上のセクションにまとめる(列の数は多いほうに合わせる。見出し・名前は上のもの) */
export function mergeSections(up: Section, cur: Section): Section {
  const upRows = up.rows ?? 0
  return filled({ ...up, cols: Math.max(up.cols ?? 1, cur.cols ?? 1), rows: upRows + (cur.rows ?? 0), parts: [...partsOf(up), ...partsOf(cur).map((p) => ({ ...p, r: p.r + upRows }))] })
}

/** セクションを複製する(形を写した別のものなので、セクションも部品も新しい ID) */
export const duplicateSection = (sec: Section): Section => ({ ...sec, id: newSectionId(), parts: partsOf(sec).map((p) => ({ ...p, id: newPartId(p.type) })) })

// ---- 以前の種類からの変換(テンプレートを編集画面で開くとき。docs/TEMPLATE_OBJECTS.md の 4.1)

/** 以前の種類のセクションを、同じ見た目の表に直す。ID は、セクションの番号と部品の順番から決める(読むたびに同じ ID になる) */
export function toTableSection(sec: Section, si: number): Section {
  if (sec.kind === 'table') return normalizeTable(sec, (c, r) => `emp_${si + 1}_${c + 1}_${r + 1}`)
  const id = `sec_${si + 1}`
  let k = 0
  const box = (c: number, r: number, w = 1, h = 1, view?: CellView): TablePart => ({ id: `box_${si + 1}_${++k}`, type: 'box', c, r, w, h, ...(view && view !== 'card' ? { view } : {}) })
  let cols = 1
  let parts: TablePart[] = []
  switch (sec.kind) {
    case 'grid':
    case 'photos': {
      cols = gridColumns(sec)
      const view = sec.kind === 'photos' ? 'photo' : undefined
      parts = Array.from({ length: sec.slots }, (_, j) => box(j % cols, Math.floor(j / cols), 1, 1, view))
      break
    }
    case 'mosaic':
      // 3 点で 1 組: 大きい 1 点が縦 2 マス。左右は flip で入れ替える
      cols = 2
      for (let g = 0; g * 3 < sec.slots; g++) {
        const r = g * 2
        const big = sec.flip ? 1 : 0
        parts.push(box(big, r, 1, 2), box(1 - big, r), box(1 - big, r + 1))
      }
      break
    case 'cells':
      cols = sec.cols ?? 2
      parts = (sec.cells ?? []).map((x) => box(x.c, x.r, x.w, x.h, sec.view))
      break
    default:
      // wide・story・feature: 1 列に 1 点ずつ
      parts = Array.from({ length: sec.slots }, (_, j) => box(0, j, 1, 1, sec.kind === 'story' ? 'story' : sec.kind === 'feature' ? 'detail' : undefined))
  }
  const rows = parts.reduce((n, p) => Math.max(n, p.r + p.h), 0)
  return normalizeTable(
    { kind: 'table', id, cols, rows, parts, slots: 0, ...(sec.categoryHeading ? { categoryHeading: true } : {}), ...(sec.copy === false ? { copy: false } : {}) },
    (c, r) => `emp_${si + 1}_${c + 1}_${r + 1}`,
  )
}

/** ボタンを、表の部品にする(ID は、もとのボタンの ID のまま。配信カードのボタンごとの URL が外れないように) */
const buttonPart = (b: ButtonSpec, c: number, r: number, w: number): TablePart => ({
  id: b.id,
  type: 'button',
  c,
  r,
  w,
  h: 1,
  ...(b.label ? { label: b.label } : {}),
  ...(b.style === 'outline' ? { style: 'outline' as const } : {}),
  ...(b.link && b.link !== 'campaign' ? { link: b.link } : {}),
})

/** ボタンの並びを、表の下に 1 行ずつ足す(列の数で割り切れるなら横に並べ、割り切れなければ 1 つずつ行いっぱいに) */
function appendButtons(sec: Section, buttons: ButtonSpec[]): Section {
  if (buttons.length === 0) return sec
  const cols = sec.cols ?? 1
  let rows = sec.rows ?? 0
  const parts = [...partsOf(sec)]
  if (cols % buttons.length === 0) {
    const w = cols / buttons.length
    buttons.forEach((b, i) => parts.push(buttonPart(b, i * w, rows, w)))
    rows += 1
  } else {
    for (const b of buttons) parts.push(buttonPart(b, 0, rows++, cols))
  }
  return withSlots({ ...sec, rows, parts })
}

/**
 * テンプレートの構成を、表だけの形に直す(編集画面で開くとき)。
 * 独立したボタンの部品は、その前のセクションの表の下に、ボタンの行として足す。ヒーローの直後のボタンは、いちばん上のボタンだけのセクションにする
 */
export function toTableLayout(layout: TemplateLayout): TemplateLayout {
  const blocks = placedButtons(layout)
  const n = layout.sections.length
  const at = (i: number) => blocks.filter((b) => Math.max(0, Math.min(b.at, n)) === i).flatMap((b) => [b.buttons])
  const sections = layout.sections.map((sec, i) => at(i + 1).reduce(appendButtons, toTableSection({ ...sec, buttons: undefined }, i)))
  const top = at(0)
  if (top.length > 0) {
    const head = top.reduce(appendButtons, { kind: 'table', id: 'sec_0', cols: Math.max(...top.map((b) => b.length)), rows: 0, parts: [], slots: 0, copy: false } as Section)
    sections.unshift(head)
  }
  return { hero: layout.hero, heroText: layout.heroText, topBar: layout.topBar, heroLink: layout.heroLink, sections }
}

/** 表の中のボタンを、セクションの後のボタンとして返す(リンク先の一覧で、以前のボタンと同じに扱う) */
export function tableButtonBlocks(layout: TemplateLayout): ButtonBlock[] {
  return layout.sections.flatMap((sec, i) => {
    const buttons = partsOf(sec)
      .filter((p) => p.type === 'button')
      .sort(byPosition)
      .map((p): ButtonSpec => ({ id: p.id, ...(p.label ? { label: p.label } : {}), ...(p.style ? { style: p.style } : {}), ...(p.link ? { link: p.link } : {}) }))
    return isTable(sec) && buttons.length > 0 ? [{ at: i + 1, buttons }] : []
  })
}

// ---- 保存・読み込み(layoutTemplates.ts)

const LINKS: LinkKind[] = ['campaign', 'category', 'top', 'custom']
const TYPES: PartType[] = ['box', 'button', 'text', 'empty']
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined)

/** 保存されている部品を読む(知らない値は外す) */
export function parsePart(raw: unknown): TablePart | null {
  const o = raw as Record<string, unknown> | null
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !TYPES.includes(o.type as PartType)) return null
  const nums = [o.c, o.r, o.w, o.h]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const type = o.type as PartType
  const part: TablePart = { id: o.id.slice(0, 40), type, c: o.c as number, r: o.r as number, w: o.w as number, h: o.h as number }
  if (type === 'box') {
    if (CELL_VIEWS.includes(o.view as CellView) && o.view !== 'card') part.view = o.view as CellView
    const note = str(o.aiNote, 300)
    if (note) part.aiNote = note
  } else if (type === 'button') {
    const label = str(o.label, 30)
    if (label) part.label = label
    if (o.style === 'outline') part.style = 'outline'
    if (LINKS.includes(o.link as LinkKind) && o.link !== 'campaign') part.link = o.link as LinkKind
    const track = str(o.track, 60)
    if (track) part.track = track
  } else if (type === 'text') {
    const text = str(o.text, 1000)
    if (text) part.text = text
    if (o.overridable === false) part.overridable = false
  }
  return part
}

/** 部品を保存する形にする(既定の値は書かない) */
export const storedPart = (p: TablePart): TablePart => parsePart(p) ?? p

/** 表に箱・ボタン・テキストが 1 つもないか(空のセクションは、保存しない) */
export const isBlankTable = (sec: Section) => isTable(sec) && partsOf(sec).every((p) => p.type === 'empty')
