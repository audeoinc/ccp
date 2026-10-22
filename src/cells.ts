import { tr } from './i18n'

/**
 * 箱の部品(セクションの種類 'cells')の枠。列 c・行 r(0 から)に置き、横 w・縦 h マス分を使う。
 * 枠の並び(配列の順)が、商品の載る順。初めは上の行から、同じ行は左から。番号は入れ替えられる
 */
export interface Cell {
  c: number
  r: number
  w: number
  h: number
}

/**
 * 箱の中の見せ方。card: 写真に名前・価格を重ねる / photo: 写真だけ / detail: 写真の横に名前・説明・価格(特集) /
 * story: 写真と説明を、枠ごとに左右を入れ替えて並べる。以前の部品(グリッド・写真だけ・特集・ストーリー)を、箱 1 つで作れるように
 */
export type CellView = 'card' | 'photo' | 'detail' | 'story'
export const CELL_VIEWS: CellView[] = ['card', 'photo', 'detail', 'story']
export const cellViewLabel = (v: CellView): string =>
  ({
    card: tr('写真 + 名前・価格', 'Photo + name and price'),
    photo: tr('写真だけ', 'Photo only'),
    detail: tr('写真の横に説明(特集)', 'Photo with text beside it (feature)'),
    story: tr('写真と説明を左右交互(ストーリー)', 'Photo and text, alternating (story)'),
  })[v]
/** 説明を並べる見せ方は、マスを正方形にせず、文の高さに合わせる */
export const isTextView = (v?: CellView) => v === 'detail' || v === 'story'

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
 * マス目を整える: はみ出した枠・重なった枠を外し、空いたマスを 1 マスの枠で埋める。
 * 残った枠の順(番号)は変えず、埋めた枠は後ろに足す(上から、左から)。どんな入力でも、すき間なく埋めた形にするため
 */
export function normalizeCells(cols: number, rows: number, cells: Cell[]): Cell[] {
  const used = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false))
  const out: Cell[] = []
  for (const x of cells) {
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
  const holes: Cell[] = []
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) if (!used[i][j]) holes.push({ c: j, r: i, w: 1, h: 1 })
  return [...out, ...holes.sort(byPosition)]
}

/** なぞった四角を 1 つの枠にまとめる。まとめた枠は、重なった枠のうち最も若い番号に入る(はみ出した分は 1 マスの枠に戻す) */
export function mergeCells(cols: number, rows: number, cells: Cell[], rect: Cell): Cell[] {
  const hit = (x: Cell) => x.c < rect.c + rect.w && rect.c < x.c + x.w && x.r < rect.r + rect.h && rect.r < x.r + x.h
  const first = cells.findIndex(hit)
  const rest = cells.filter((x) => !hit(x))
  const at = first < 0 ? rest.length : cells.slice(0, first).filter((x) => !hit(x)).length
  rest.splice(at, 0, rect)
  return normalizeCells(cols, rows, rest)
}

/** 枠を 1 マスずつに分ける(分けた枠は、その番号の位置に、上から・左から並ぶ) */
export function splitCell(cols: number, rows: number, cells: Cell[], index: number): Cell[] {
  const x = cells[index]
  if (!x) return cells
  const units = Array.from({ length: x.w * x.h }, (_, k) => ({ c: x.c + (k % x.w), r: x.r + Math.floor(k / x.w), w: 1, h: 1 }))
  return normalizeCells(cols, rows, [...cells.slice(0, index), ...units, ...cells.slice(index + 1)])
}

/** 枠の番号を入れ替える(商品の載る順を変える。例: 右上の大きい枠を 1 番に) */
export function moveCell(cells: Cell[], index: number, to: number): Cell[] {
  if (index < 0 || index >= cells.length || to < 0 || to >= cells.length || index === to) return cells
  const next = [...cells]
  const [x] = next.splice(index, 1)
  next.splice(to, 0, x)
  return next
}

/** マスの (列, 行) を含む枠の番号 */
export const cellAt = (cells: Cell[], c: number, r: number): number => cells.findIndex((x) => c >= x.c && c < x.c + x.w && r >= x.r && r < x.r + x.h)

/** 箱の見本(1 つの箱。パレットの「サンプル」に、組み合わせの見本と並べる) */
export interface BoxSample {
  id: string
  cols: number
  cells: Cell[]
  view?: CellView
  label: () => string
  help: () => string
}

const tall2: Cell[] = [
  { c: 0, r: 0, w: 1, h: 2 },
  { c: 1, r: 0, w: 1, h: 1 },
  { c: 1, r: 1, w: 1, h: 1 },
]
const big4: Cell[] = [
  { c: 0, r: 0, w: 2, h: 2 },
  { c: 2, r: 0, w: 1, h: 1 },
  { c: 3, r: 0, w: 1, h: 1 },
  { c: 2, r: 1, w: 1, h: 1 },
  { c: 3, r: 1, w: 1, h: 1 },
]
const wideTop: Cell[] = [
  { c: 0, r: 0, w: 2, h: 1 },
  { c: 0, r: 1, w: 1, h: 1 },
  { c: 1, r: 1, w: 1, h: 1 },
]

export const BOX_SAMPLES: BoxSample[] = [
  { id: 'grid2', cols: 2, cells: plainCells(2, 2), label: () => tr('2 列 × 2 行', '2 × 2'), help: () => tr('名前・価格つきの基本の並び', 'The basic layout with names and prices') },
  { id: 'grid3', cols: 3, cells: plainCells(3, 2), label: () => tr('3 列 × 2 行', '3 × 2'), help: () => tr('点数を多く見せたいとき', 'To show more items') },
  { id: 'photo3', cols: 3, cells: plainCells(3, 2), view: 'photo', label: () => tr('写真だけ 3 列', 'Photos, 3 columns'), help: () => tr('色・柄を写真で並べる', 'Show colors and patterns with photos only') },
  { id: 'feature2', cols: 1, cells: plainCells(1, 2), view: 'detail', label: () => tr('特集 2 点', '2 features'), help: () => tr('写真の横に説明。1 点ずつ紹介する', 'Photo with text beside it, one item at a time') },
  { id: 'story3', cols: 1, cells: plainCells(1, 3), view: 'story', label: () => tr('ストーリー 3 点', 'Story, 3 items'), help: () => tr('写真と説明を左右交互に。読ませる特集に', 'Photo and text, alternating. For editorial features') },
  { id: 'wide1', cols: 1, cells: plainCells(1, 1), label: () => tr('大きく 1 点', '1 large item'), help: () => tr('全幅で 1 点。主役の商品に', 'One full-width item for the lead product') },
  { id: 'tall2', cols: 2, cells: tall2, label: () => tr('左に縦長 1 + 右に 2', 'Tall left + 2 right'), help: () => tr('主役を左に大きく', 'A big lead item on the left') },
  { id: 'big4', cols: 4, cells: big4, label: () => tr('大 1 + 小 4', '1 large + 4 small'), help: () => tr('新作と色違いを並べる', 'A new item and its colors') },
  { id: 'wideTop', cols: 2, cells: wideTop, label: () => tr('上に横長 1 + 下に 2', 'Wide top + 2 below'), help: () => tr('主役のあとに 2 点', 'A lead item, then two more') },
]

export const boxSample = (id: string): BoxSample | undefined => BOX_SAMPLES.find((p) => p.id === id)
