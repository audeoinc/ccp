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
