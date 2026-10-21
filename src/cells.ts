import { tr } from './i18n'

/**
 * マス目の部品(セクションの種類 'cells')の枠。列 c・行 r(0 から)に置き、横 w・縦 h マス分を使う。
 * 枠の並び(商品の載る順)は、上の行から、同じ行は左から。保存するときも、この順に並べる
 */
export interface Cell {
  c: number
  r: number
  w: number
  h: number
}

/** マス目の列の数の上限(メールの幅で、1 マスが小さくなりすぎないように) */
export const MAX_CELL_COLS = 4
/** マス目の行の数の上限 */
export const MAX_CELL_ROWS = 6

/** 行の数(いちばん下の枠の下端) */
export const cellRows = (cells: Cell[]): number => cells.reduce((n, x) => Math.max(n, x.r + x.h), 0)

const byPosition = (a: Cell, b: Cell) => a.r - b.r || a.c - b.c

/** 1 マスずつの枠で埋めたマス目 */
export const plainCells = (cols: number, rows: number): Cell[] =>
  Array.from({ length: rows * cols }, (_, i) => ({ c: i % cols, r: Math.floor(i / cols), w: 1, h: 1 }))

/**
 * マス目を整える: はみ出した枠・重なった枠を外し、空いたマスを 1 マスの枠で埋め、並びの順にする。
 * どんな入力(保存された値・編集の途中)でも、マス目をすき間なく埋めた形にするため
 */
export function normalizeCells(cols: number, rows: number, cells: Cell[]): Cell[] {
  const used = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false))
  const out: Cell[] = []
  for (const x of [...cells].sort(byPosition)) {
    const c = Math.round(x.c)
    const r = Math.round(x.r)
    const w = Math.round(x.w)
    const h = Math.round(x.h)
    if (!(c >= 0 && r >= 0 && w >= 1 && h >= 1 && c + w <= cols && r + h <= rows)) continue
    let free = true
    for (let i = r; i < r + h && free; i++) for (let j = c; j < c + w; j++) if (used[i][j]) free = false
    if (!free) continue
    for (let i = r; i < r + h; i++) for (let j = c; j < c + w; j++) used[i][j] = true
    out.push({ c, r, w, h })
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) if (!used[i][j]) out.push({ c: j, r: i, w: 1, h: 1 })
  return out.sort(byPosition)
}

/** なぞった四角を 1 つの枠にまとめる(重なる枠は外し、外した枠のはみ出した分は 1 マスの枠に戻す) */
export function mergeCells(cols: number, rows: number, cells: Cell[], rect: Cell): Cell[] {
  const hit = (x: Cell) => x.c < rect.c + rect.w && rect.c < x.c + x.w && x.r < rect.r + rect.h && rect.r < x.r + x.h
  return normalizeCells(cols, rows, [rect, ...cells.filter((x) => !hit(x))])
}

/** 枠を 1 マスずつに分ける */
export function splitCell(cols: number, rows: number, cells: Cell[], index: number): Cell[] {
  return normalizeCells(
    cols,
    rows,
    cells.filter((_, i) => i !== index),
  )
}

/** マスの (列, 行) を含む枠の番号 */
export const cellAt = (cells: Cell[], c: number, r: number): number => cells.findIndex((x) => c >= x.c && c < x.c + x.w && r >= x.r && r < x.r + x.h)

/** 見本のマス目(パレットに並べる。置いたあと、マス目を直せる) */
export interface CellPreset {
  id: string
  cols: number
  cells: Cell[]
  label: () => string
  help: () => string
}

export const CELL_PRESETS: CellPreset[] = [
  {
    id: 'g3x2',
    cols: 3,
    cells: plainCells(3, 2),
    label: () => tr('3 列 × 2 行', '3 cols × 2 rows'),
    help: () => tr('3 列のマス目。行を足せば、点数を増やせる', 'A 3-column grid. Add rows to show more items'),
  },
  {
    id: 'bigL',
    cols: 2,
    cells: [
      { c: 0, r: 0, w: 1, h: 2 },
      { c: 1, r: 0, w: 1, h: 1 },
      { c: 1, r: 1, w: 1, h: 1 },
    ],
    label: () => tr('左に縦長 1 + 右に 2', 'Tall left + 2 right'),
    help: () => tr('左の縦 2 マスを 1 枠に。主役を左に大きく', 'Left two cells merged into one. A big lead item on the left'),
  },
  {
    id: 'big4',
    cols: 4,
    cells: [
      { c: 0, r: 0, w: 2, h: 2 },
      { c: 2, r: 0, w: 1, h: 1 },
      { c: 3, r: 0, w: 1, h: 1 },
      { c: 2, r: 1, w: 1, h: 1 },
      { c: 3, r: 1, w: 1, h: 1 },
    ],
    label: () => tr('大 1 + 小 4', '1 large + 4 small'),
    help: () => tr('大きい 1 点の横に、小さい 4 点。新作と色違いを並べるときに', 'One large item with four small ones beside it. For a new item and its colors'),
  },
  {
    id: 'wideTop',
    cols: 2,
    cells: [
      { c: 0, r: 0, w: 2, h: 1 },
      { c: 0, r: 1, w: 1, h: 1 },
      { c: 1, r: 1, w: 1, h: 1 },
    ],
    label: () => tr('上に横長 1 + 下に 2', 'Wide top + 2 below'),
    help: () => tr('上の横 2 マスを 1 枠に。主役のあとに 2 点', 'Top two cells merged into one, then two items'),
  },
  {
    id: 'bigR3',
    cols: 3,
    cells: [
      { c: 0, r: 0, w: 1, h: 1 },
      { c: 1, r: 0, w: 2, h: 2 },
      { c: 0, r: 1, w: 1, h: 1 },
      { c: 0, r: 2, w: 1, h: 1 },
      { c: 1, r: 2, w: 1, h: 1 },
      { c: 2, r: 2, w: 1, h: 1 },
    ],
    label: () => tr('右に大 1 + まわりに 5', 'Large right + 5 around'),
    help: () => tr('右上に大きい 1 点、まわりに小さい 5 点', 'One large item top right with five small ones around it'),
  },
]

export const cellPreset = (id: string): CellPreset | undefined => CELL_PRESETS.find((p) => p.id === id)
