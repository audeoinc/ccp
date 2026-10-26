import { tr } from './i18n'
import { CELL_VIEWS, type CellView } from './cells'
import { BOX_FIELDS, MEDIA_RATIOS, gridColumns, placedButtons, type BoxField, type ButtonBlock, type ButtonColor, type MediaRatio, type SectionBg, type TextAlign, type ButtonSpec, type LinkKind, type PartType, type Section, type TablePart, type TemplateLayout } from './templates'

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

const PREFIX: Record<PartType, string> = { box: 'box', button: 'btn', text: 'txt', media: 'med', line: 'line', spacer: 'spc', empty: 'emp' }
// ID は、種類の頭 + 短いランダムな文字。テンプレートの中で重ならなければよい(比べるときは、いつもテンプレート ID と組で見る)
const rand = () => Math.random().toString(36).slice(2, 8)
export const newPartId = (type: PartType) => `${PREFIX[type]}_${rand()}`
export const newSectionId = () => `sec_${rand()}`

/** 新しい部品(種類ごとの設定は、既定の値なので持たない) */
export const newPart = (type: PartType, c: number, r: number, w = 1, h = 1): TablePart => ({ id: newPartId(type), type, c, r, w, h })

export const isTable = (sec: Section) => sec.kind === 'table'
export const partsOf = (sec: Section): TablePart[] => sec.parts ?? []
const byPosition = (a: { r: number; c: number }, b: { r: number; c: number }) => a.r - b.r || a.c - b.c

// ---- 箱の見せ方(出すもの・価格の見せ方・バッジ)

/** 見せ方ごとの、出すものの既定(以前の描き方と同じになるように) */
const DEFAULT_FIELDS: Record<CellView, BoxField[]> = {
  card: ['name', 'price'],
  photo: [],
  detail: ['name', 'desc', 'price', 'button'],
  story: ['name', 'price', 'desc'],
}
/** 箱に出すもの(設定がなければ、見せ方の既定) */
export const boxFields = (p: Pick<TablePart, 'view' | 'fields'>): BoxField[] => p.fields ?? DEFAULT_FIELDS[p.view ?? 'card']
export const boxFieldLabel = (f: BoxField): string =>
  ({ name: tr('名前', 'Name'), price: tr('価格', 'Price'), swatches: tr('カラーチップ', 'Color chips'), rating: tr('レビュー', 'Reviews'), badge: tr('バッジ', 'Badge'), desc: tr('説明', 'Description'), button: tr('ボタン', 'Button') })[f]
export const priceStyleLabel = (v?: TablePart['priceStyle']): string =>
  v === 'sale' ? tr('セール(元の価格に取り消し線)', 'Sale (original price struck through)') : v === 'from' ? tr('〜から', 'From …') : tr('ふつう', 'Regular')

/** 箱の見本(よく使う組み合わせ。押すと、出すもの・価格の見せ方・バッジをまとめて入れる) */
export interface BoxPreset {
  id: string
  label: () => string
  view?: CellView
  fields: BoxField[]
  priceStyle?: TablePart['priceStyle']
  badge?: string
}
export const BOX_PRESETS: BoxPreset[] = [
  { id: 'standard', label: () => tr('標準(名前・価格)', 'Standard (name, price)'), fields: ['name', 'price'] },
  { id: 'simple', label: () => tr('価格だけ', 'Price only'), fields: ['price'] },
  { id: 'photo', label: () => tr('写真だけ', 'Photo only'), view: 'photo', fields: [] },
  { id: 'sale', label: () => tr('セール(セール価格・SALE)', 'Sale (sale price, SALE)'), fields: ['name', 'price', 'badge'], priceStyle: 'sale', badge: 'SALE' },
  { id: 'new', label: () => tr('新作(NEW)', 'New (NEW)'), fields: ['name', 'price', 'badge'], badge: 'NEW' },
  { id: 'detail', label: () => tr('詳しく(説明・ボタン)', 'Detailed (description, button)'), fields: ['name', 'price', 'desc', 'button'] },
]
/** 見本を当てたときの、箱の設定(見せ方は、写真だけの見本のときと、写真だけから戻すときだけ変える) */
export function presetPatch(p: TablePart, preset: BoxPreset): Partial<TablePart> {
  const view = preset.view ?? (p.view === 'photo' ? undefined : p.view)
  return { view, fields: preset.fields, priceStyle: preset.priceStyle, badge: preset.badge }
}
/** いまの設定が、どの見本と同じか(なければ undefined) */
export const presetOf = (p: TablePart): BoxPreset | undefined =>
  BOX_PRESETS.find((x) => (x.view ?? 'card') === (p.view === 'photo' ? 'photo' : x.view ?? 'card') && JSON.stringify(x.fields) === JSON.stringify(boxFields(p)) && (x.priceStyle ?? '') === (p.priceStyle ?? '') && (x.badge ?? '') === (p.badge ?? ''))

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
  const even = [...new Set(sec.evenRows ?? [])].filter((r) => Number.isInteger(r) && r >= 0 && r < rows && !out.some((p) => p.h > 1 && p.r <= r && p.r + p.h > r)).sort((a, b) => a - b)
  return withSlots({ ...sec, kind: 'table', id: sec.id || newSectionId(), cols, rows, parts: out, evenRows: even.length > 0 ? even : undefined })
}

/** 均等の行の番号を、行の増減に合わせてずらす(fn が undefined を返した行は外す) */
const shiftEven = (sec: Section, fn: (r: number) => number | undefined): number[] | undefined => {
  const next = (sec.evenRows ?? []).map(fn).filter((r): r is number => r !== undefined)
  return next.length > 0 ? next : undefined
}

/** 均等に並べる行か */
export const isEvenRow = (sec: Section, r: number) => (sec.evenRows ?? []).includes(r)

/** 行を均等に並べる・やめる(縦に結合した部品がかかる行は、均等にできない) */
export function toggleEvenRow(sec: Section, r: number): TableOp {
  if (isEvenRow(sec, r)) return { sec: { ...sec, evenRows: shiftEven(sec, (x) => (x === r ? undefined : x)) } }
  if (partsOf(sec).some((p) => p.h > 1 && p.r <= r && p.r + p.h > r)) return { error: tr('縦に結合したマスがかかっている行は、均等に並べられません', "A row with a vertically merged cell can't be spread evenly") }
  // 中身のある部品を左に詰める(データの並び = メールの見た目の並びにする。位置で比べるときに、列の番号で迷わないように。ID はそのまま)
  let cur = 0
  const packed = partsOf(sec)
    .filter((p) => p.r === r && p.type !== 'empty')
    .sort((a, b) => a.c - b.c)
    .map((p) => {
      const q = { ...p, c: cur }
      cur += p.w
      return q
    })
  const others = partsOf(sec).filter((p) => p.r !== r)
  return { sec: normalizeTable({ ...sec, parts: [...others, ...packed], evenRows: [...(sec.evenRows ?? []), r].sort((a, b) => a - b) }) }
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
  const { view, aiNote, fields, priceStyle, badge, label, style, color, link, track, text, overridable, align, ratio, src, imageId, video, alt, swap } = p
  return Object.fromEntries(Object.entries({ view, aiNote, fields, priceStyle, badge, label, style, color, link, track, text, overridable, align, ratio, src, imageId, video, alt, swap }).filter(([, v]) => v !== undefined))
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
  const next = filled({ ...sec, rows: rows + 1, parts: added ? [...parts, added] : parts, evenRows: shiftEven(sec, (x) => (x >= i ? x + 1 : x)) })
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
  return { sec: filled({ ...sec, rows: rows - 1, parts, evenRows: shiftEven(sec, (x) => (x === r ? undefined : x > r ? x - 1 : x)) }) }
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
  return { sec: { ...sec, parts, evenRows: shiftEven(sec, (x) => (x === r ? o : x === o ? r : x)) }, sel: { a: [0, o], b: [(sec.cols ?? 1) - 1, o] } }
}

export function moveCol(sec: Section, c: number, d: number): TableOp {
  const o = c + d
  if (o < 0 || o >= (sec.cols ?? 1)) return { error: '' }
  if (partsOf(sec).some((p) => p.w > 1 && ((p.c <= c && p.c + p.w > c) || (p.c <= o && p.c + p.w > o)))) return { error: tr('結合したマスがまたがっているので、この列は動かせません', "A merged cell spans this column, so it can't be moved") }
  const parts = partsOf(sec).map((p) => (p.c === c ? { ...p, c: o } : p.c === o ? { ...p, c } : p))
  return { sec: { ...sec, parts }, sel: { a: [o, 0], b: [o, (sec.rows ?? 1) - 1] } }
}

/** r 行目を複製して、すぐ下に入れる(写した部品は、形を写した別のものなので新しい ID。縦に結合したマスがかかる行は複製できない) */
export function duplicateRow(sec: Section, r: number): TableOp {
  const rows = sec.rows ?? 0
  if (rows >= MAX_TABLE_ROWS) return { error: tr(`行は ${MAX_TABLE_ROWS} 行まで`, `Up to ${MAX_TABLE_ROWS} rows`) }
  if (partsOf(sec).some((p) => p.h > 1 && p.r <= r && p.r + p.h > r)) return { error: tr('縦に結合したマスがかかっている行は、複製できません', "A row with a vertically merged cell can't be duplicated") }
  const parts = partsOf(sec).map((p) => (p.r > r ? { ...p, r: p.r + 1 } : p))
  const copies = partsOf(sec)
    .filter((p) => p.r === r)
    .map((p) => ({ ...p, id: newPartId(p.type), r: r + 1 }))
  const shifted = shiftEven(sec, (x) => (x > r ? x + 1 : x))
  const evenRows = isEvenRow(sec, r) ? [...(shifted ?? []), r + 1] : shifted
  return { sec: filled({ ...sec, rows: rows + 1, parts: [...parts, ...copies], evenRows }), sel: { a: [0, r + 1], b: [(sec.cols ?? 1) - 1, r + 1] } }
}

/** 写した部品(左上からの位置で持つ。貼るときに、新しい ID にする) */
export interface Clip {
  w: number
  h: number
  parts: TablePart[]
}
/** 選んだ範囲を写す(範囲に丸ごと入る部品だけ。空きは写さない) */
export function copyCells(sec: Section, sel: CellSel): Clip {
  const rc = rectOf(sec, sel)
  const parts = partsOf(sec)
    .filter((p) => p.type !== 'empty' && p.c >= rc.c && p.r >= rc.r && p.c + p.w <= rc.c + rc.w && p.r + p.h <= rc.r + rc.h)
    .map((p) => ({ ...p, c: p.c - rc.c, r: p.r - rc.r }))
  return { w: rc.w, h: rc.h, parts }
}
/** 写した部品を、(c, r) を左上にして貼る。貼る所は、空きのマスだけ(中身のある部品を上書きしない。パーツと同じ「足すだけ」) */
export function pasteCells(sec: Section, c: number, r: number, clip: Clip): TableOp {
  if (clip.parts.length === 0) return { error: tr('写したものがありません(空きのマスは写しません)', 'Nothing copied (empty cells are not copied)') }
  if (c + clip.w > (sec.cols ?? 1) || r + clip.h > (sec.rows ?? 0)) return { error: tr('貼る所が表からはみ出します。行・列を足してから貼ってください', "It doesn't fit here. Add rows or columns first") }
  const placed = clip.parts.map((p) => ({ ...p, id: newPartId(p.type), c: p.c + c, r: p.r + r }))
  if (placed.some((p) => partsOf(sec).some((q) => q.type !== 'empty' && hit(q, p)))) return { error: tr('貼る所が空いていません(中身のあるマスには貼りません)', 'The target cells are not empty') }
  const covered = partsOf(sec).filter((q) => placed.some((p) => hit(q, p)))
  if (covered.some((q) => !placed.some((p) => q.c >= p.c && q.r >= p.r && q.c + q.w <= p.c + p.w && q.r + q.h <= p.r + p.h))) return { error: tr('貼る所の空きの形が合いません(結合した空きがはみ出します)', "The empty cells don't match the pasted shape") }
  return { sec: filled({ ...sec, parts: [...partsOf(sec).filter((q) => !covered.includes(q)), ...placed] }), sel: { a: [c, r], b: [c + clip.w - 1, r + clip.h - 1] } }
}

// ---- ボタンの色(メールの中の色なので固定の値)
export const BUTTON_COLORS: Record<ButtonColor, string> = { black: '#222222', red: '#d32f2f', navy: '#1f3a5f', green: '#2e7d4f', gray: '#6b6b6b' }
export const buttonColorLabel = (c: ButtonColor): string => ({ black: tr('黒', 'Black'), red: tr('赤', 'Red'), navy: tr('紺', 'Navy'), green: tr('緑', 'Green'), gray: tr('グレー', 'Gray') })[c]
/** ボタンの色を求める(色を選んでいなければ、期間限定のヒーローでは赤、ほかは黒。以前の見た目と同じ) */
export const buttonColor = (p: Pick<TablePart, 'color'>, offer: boolean): string => BUTTON_COLORS[p.color ?? (offer ? 'red' : 'black')]

// ---- セクションの見た目(背景・余白・区切り線)。メールの中の色なので固定の値
export const SECTION_BG: Record<SectionBg, string> = { gray: '#f4f4f5', beige: '#f6f1ea', blue: '#eef4fb', pink: '#fbeff1' }
export const sectionBgLabel = (b?: SectionBg): string =>
  b ? ({ gray: tr('グレー', 'Gray'), beige: tr('ベージュ', 'Beige'), blue: tr('ブルー', 'Blue'), pink: tr('ピンク', 'Pink') })[b] : tr('白', 'White')
/** 上下の余白(px) */
export const sectionSpace = (s?: Section['space']): number => (s === 'tight' ? 6 : s === 'wide' ? 32 : 16)
export const ratioLabel = (r?: MediaRatio): string =>
  r ? ({ square: tr('正方形(1:1)', 'Square (1:1)'), portrait: tr('縦長(3:4)', 'Portrait (3:4)'), landscape: tr('横長(4:3)', 'Landscape (4:3)'), wide: tr('横に広い(2:1)', 'Wide (2:1)') })[r] : tr('既定', 'Default')
export const alignLabel = (a: TextAlign): string => ({ left: tr('左', 'Left'), center: tr('中央', 'Center'), right: tr('右', 'Right') })[a]

/** 空のセクション(見出しだけ。最初の行は、列の数を選んで作る) */
export const emptySection = (): Section => ({ kind: 'table', id: newSectionId(), cols: 2, rows: 0, parts: [], slots: 0, categoryHeading: true })

/** 空のセクションの最初の行を、n 列で作る */
export const firstRow = (sec: Section, n: number): TableOp => ({ sec: filled({ ...sec, cols: n, rows: 1, parts: [], evenRows: undefined }), sel: { a: [0, 0], b: [n - 1, 0] } })

/** よく使う行(1 行まとめて置く)。parts は [種類, 列, 行, 幅(0 は行いっぱい), 高さ] */
export interface RowPreset {
  id: string
  label: () => string
  cols: number
  rows: number
  parts: [PartType, number, number, number?, number?][]
  /** 置いた行を、均等に並べる */
  even?: boolean
  /** 均等の行に、縦の区切り線を引く */
  sep?: boolean
  /** 種類ごとに、置いた部品に入れる設定(文字のリンク・正方形の画像など) */
  init?: Partial<Record<PartType, Partial<TablePart>>>
}
export const ROW_PRESETS: RowPreset[] = [
  { id: 'x2', label: () => tr('箱 × 2', 'Box × 2'), cols: 2, rows: 1, parts: [['box', 0, 0], ['box', 1, 0]] },
  { id: 'x3', label: () => tr('箱 × 3', 'Box × 3'), cols: 3, rows: 1, parts: [['box', 0, 0], ['box', 1, 0], ['box', 2, 0]] },
  { id: 'big', label: () => tr('大 1 + 小 2', '1 large + 2 small'), cols: 2, rows: 2, parts: [['box', 0, 0, 1, 2], ['box', 1, 0], ['box', 1, 1]] },
  { id: 'tb', label: () => tr('文 + 箱', 'Text + box'), cols: 2, rows: 1, parts: [['text', 0, 0], ['box', 1, 0]] },
  { id: 'btn', label: () => tr('ボタンの行', 'Button row'), cols: 0, rows: 1, parts: [['button', 0, 0, 0, 1]] },
  { id: 'btn2', label: () => tr('ボタン × 2(均等)', 'Button × 2 (even)'), cols: 2, rows: 1, parts: [['button', 0, 0], ['button', 1, 0]], even: true },
  // 8.9 で足した行
  { id: 'line', label: () => tr('区切り線', 'Divider'), cols: 0, rows: 1, parts: [['line', 0, 0, 0, 1]] },
  { id: 'links', label: () => tr('文字のリンク × 3(縦線で区切る)', 'Text links × 3 (vertical dividers)'), cols: 3, rows: 1, parts: [['button', 0, 0], ['button', 1, 0], ['button', 2, 0]], even: true, sep: true, init: { button: { style: 'text' } } },
  { id: 'icons', label: () => tr('アイコンの行(SNS など)', 'Icon row (social, etc.)'), cols: 4, rows: 1, parts: [['media', 0, 0], ['media', 1, 0], ['media', 2, 0], ['media', 3, 0]], even: true, init: { media: { ratio: 'square' } } },
  { id: 'iconText', label: () => tr('アイコン + 文 × 3', 'Icon + text × 3'), cols: 3, rows: 2, parts: [['media', 0, 0], ['media', 1, 0], ['media', 2, 0], ['text', 0, 1], ['text', 1, 1], ['text', 2, 1]], init: { media: { ratio: 'square' }, text: { align: 'center' } } },
]

/** よく使う行を、i 行目に差し込む(列が足りなければ、セクションの列を増やす。余るマスは空き) */
export function insertPreset(sec: Section, i: number, preset: RowPreset): TableOp {
  const rows = sec.rows ?? 0
  if (rows + preset.rows > MAX_TABLE_ROWS) return { error: tr(`行は ${MAX_TABLE_ROWS} 行まで`, `Up to ${MAX_TABLE_ROWS} rows`) }
  const cols = rows === 0 ? Math.max(1, preset.cols) : Math.max(sec.cols ?? 1, preset.cols)
  const parts = partsOf(sec).map((p) => (p.r >= i ? { ...p, r: p.r + preset.rows } : p.r + p.h > i ? { ...p, h: p.h + preset.rows } : p))
  const added = preset.parts.map(([type, c, r, w = 1, h = 1]) => ({ ...newPart(type, c, i + r, w || cols, h), ...preset.init?.[type], ...(preset.sep ? { sep: true } : {}) }))
  const shifted = rows === 0 ? undefined : shiftEven(sec, (x) => (x >= i ? x + preset.rows : x))
  const evenRows = preset.even ? [...(shifted ?? []), i] : shifted
  return { sec: filled({ ...sec, cols, rows: rows + preset.rows, parts: [...parts, ...added], evenRows }), sel: { a: [0, i], b: [cols - 1, i + preset.rows - 1] } }
}

/** r 行目から下を、新しいセクションに分ける */
export function splitSection(sec: Section, r: number): { error: string } | { top: Section; bottom: Section } {
  if (r <= 0) return { error: tr('いちばん上の行では分けられません', "Can't split at the top row") }
  if (partsOf(sec).some((p) => p.r < r && p.r + p.h > r)) return { error: tr('結合したマスがまたがっているので、ここでは分けられません', "A merged cell spans this row, so it can't be split here") }
  const top = withSlots({ ...sec, rows: r, parts: partsOf(sec).filter((p) => p.r < r), evenRows: shiftEven(sec, (x) => (x < r ? x : undefined)) })
  const bottom = withSlots({ kind: 'table', id: newSectionId(), cols: sec.cols, rows: (sec.rows ?? 0) - r, categoryHeading: true, slots: 0, parts: partsOf(sec).filter((p) => p.r >= r).map((p) => ({ ...p, r: p.r - r })), evenRows: shiftEven(sec, (x) => (x >= r ? x - r : undefined)) })
  return { top, bottom }
}

/** 下のセクションを、上のセクションにまとめる(列の数は多いほうに合わせる。見出し・名前は上のもの) */
export function mergeSections(up: Section, cur: Section): Section {
  const upRows = up.rows ?? 0
  return filled({ ...up, cols: Math.max(up.cols ?? 1, cur.cols ?? 1), rows: upRows + (cur.rows ?? 0), parts: [...partsOf(up), ...partsOf(cur).map((p) => ({ ...p, r: p.r + upRows }))], evenRows: [...(up.evenRows ?? []), ...(cur.evenRows ?? []).map((x) => x + upRows)] })
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
  // 2026-10-22〜23 の版は、ヒーローの直後のボタンを、いちばん上の「ボタンだけのセクション」(sec_0)として持っていた。
  // セクションの番号がずれるので、編集で開いたときに、ヒーローの下の表へ移す(保存済みの版そのものは変えない)
  const legacyHead = layout.sections[0]?.kind === 'table' && layout.sections[0].id === 'sec_0' && isHeadOnly(layout.sections[0])
  const body = legacyHead ? layout.sections.slice(1) : layout.sections
  const blocks = placedButtons({ ...layout, sections: body })
  const n = body.length
  const at = (i: number) => blocks.filter((b) => Math.max(0, Math.min(b.at, n)) === i).flatMap((b) => [b.buttons])
  const sections = body.map((sec, i) => at(i + 1).reduce(appendButtons, toTableSection({ ...sec, buttons: undefined }, i)))
  // ヒーローの下の表: すでにあればそれ、なければ以前の形のヒーローの直後のボタン(と、移した sec_0)から作る
  const top = at(0)
  let heroTable = layout.heroTable ? normalizeTable({ ...layout.heroTable, id: HERO_TABLE_ID }) : undefined
  if (!heroTable && legacyHead) heroTable = normalizeTable({ ...layout.sections[0], id: HERO_TABLE_ID, categoryHeading: undefined, copy: false })
  if (!heroTable && top.length > 0) heroTable = top.reduce(appendButtons, { kind: 'table', id: HERO_TABLE_ID, cols: Math.max(...top.map((b) => b.length)), rows: 0, parts: [], slots: 0, copy: false } as Section)
  return { hero: layout.hero, heroText: layout.heroText, topBar: layout.topBar, heroLink: layout.heroLink, sections, ...(heroTable ? { heroTable } : {}) }
}

/** ヒーローの下の表の ID */
export const HERO_TABLE_ID = 'sec_hero'

/** 箱・見出し・コピーのない、ボタンなどだけの表か(以前の sec_0 を見分ける) */
const isHeadOnly = (sec: Section) => !sec.categoryHeading && sec.copy === false && partsOf(sec).every((p) => p.type !== 'box')

/** テンプレートのセクションの ID の並び(配信カードの見出し・コピーの番号を、版をまたいで読み替えるため)。以前の種類は、表に直したときの ID(sec_番号) */
export const sectionIdsOf = (layout: TemplateLayout): string[] => layout.sections.map((sec, i) => (sec.kind === 'table' && sec.id ? sec.id : `sec_${i + 1}`))

/**
 * 同じテンプレートの版を替えたとき、番号で持っている文(セクションの見出し・コピー)を、セクションの ID で読み替える。
 * 2026-10-22〜23 の版の、いちばん上のボタンだけのセクション(sec_0)の分のずれも、これで戻る。ID が 1 つも重ならなければ、そのまま
 */
export function remapSectionTexts(from: TemplateLayout, to: TemplateLayout, texts: string[]): string[] {
  const a = sectionIdsOf(from)
  const b = sectionIdsOf(to)
  if (!a.some((id) => b.includes(id))) return texts
  return b.map((id) => {
    const i = a.indexOf(id)
    return i >= 0 ? (texts[i] ?? '') : ''
  })
}

/** 表の中のボタンを、セクションの後のボタンとして返す(リンク先の一覧で、以前のボタンと同じに扱う) */
export function tableButtonBlocks(layout: TemplateLayout): ButtonBlock[] {
  // ヒーローの下の表は、ヒーローの直後(at 0)。そのあと、セクションの順
  const list: [Section, number][] = [...(layout.heroTable ? [[layout.heroTable, 0] as [Section, number]] : []), ...layout.sections.map((sec, i): [Section, number] => [sec, i + 1])]
  return list.flatMap(([sec, at]) => {
    // 画像・動画も、押して飛ぶ先を配信ごとに決めるので、ボタンと同じ一覧に入れる(名前は代わりの文)
    const buttons = partsOf(sec)
      .filter((p) => p.type === 'button' || p.type === 'media')
      .sort(byPosition)
      .map((p): ButtonSpec => ({
        id: p.id,
        ...(p.type === 'media' ? { label: p.alt || (p.video ? tr('動画', 'Video') : tr('画像', 'Image')) } : p.label ? { label: p.label } : {}),
        ...(p.style === 'fill' || p.style === 'outline' ? { style: p.style } : {}),
        ...(p.link ? { link: p.link } : {}),
      }))
    return isTable(sec) && buttons.length > 0 ? [{ at, buttons }] : []
  })
}

// ---- 保存・読み込み(layoutTemplates.ts)

const LINKS: LinkKind[] = ['campaign', 'category', 'top', 'custom']
const TYPES: PartType[] = ['box', 'button', 'text', 'media', 'line', 'spacer', 'empty']
const ALIGNS: TextAlign[] = ['left', 'center', 'right']
/** 画像・動画の URL は、http(s) か、アプリの中の道(/ で始まる)だけ(javascript: などを入れさせない) */
const url = (v: unknown): string | undefined => (typeof v === 'string' && /^(https?:\/\/|\/)/i.test(v.trim()) ? v.trim().slice(0, 1000) : undefined)
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? v.slice(0, max) : undefined)

/** ボタンの文言に、矢印(›)を付ける(T8 の 8.7) */
export const buttonText = (p: Pick<TablePart, 'label' | 'icon'>, fallback: string): string => {
  const label = p.label || fallback
  return p.icon === 'right' ? `${label} ›` : p.icon === 'left' ? `› ${label}` : label
}
/** ボタンの角の丸み(px。丸は 999) */
export const buttonRadius = (p: Pick<TablePart, 'shape'>): number => (p.shape === 'square' ? 0 : p.shape === 'rounded' ? 6 : 999)

// ---- 区切り線・余白・縦の区切り線(T8 の 8.9。メールの中の色なので、決まった色から)
export const LINE_COLORS = { light: '#e2e2e2', gray: '#9e9e9e', black: '#222222' } as const
/** 余白の高さの選択肢(px) */
export const SPACER_HEIGHTS = [8, 16, 24, 32, 48]
/** 区切り線の描き方(色・太さ・上下の余白・長さ) */
export const lineLook = (p: Pick<TablePart, 'lineWidth' | 'lineColor' | 'lineShort' | 'lineSpace'>) => ({
  color: LINE_COLORS[p.lineColor ?? 'light'],
  width: p.lineWidth ?? 1,
  pad: p.lineSpace === 'tight' ? 4 : p.lineSpace === 'wide' ? 20 : 10,
  length: p.lineShort ? '40%' : '100%',
})
/** テキストの向きの書き方(縦書き・90 度回す。8.8)。横は空 */
export const textDirStyle = (dir?: TablePart['dir']): { writingMode?: 'vertical-rl'; textOrientation?: 'upright' | 'mixed' } =>
  dir === 'vertical' ? { writingMode: 'vertical-rl', textOrientation: 'upright' } : dir === 'rotate' ? { writingMode: 'vertical-rl', textOrientation: 'mixed' } : {}
/** 縦の区切り線の色 */
export const SEP_COLOR = '#cfcfcf'
/** 均等の行に、縦の区切り線を引くか */
export const isSepRow = (sec: Section, r: number) => partsOf(sec).some((p) => p.r === r && p.sep)
/** 均等の行の縦の区切り線を、引く・やめる(行の中身のある部品すべてに印を付ける・外す) */
export const toggleSepRow = (sec: Section, r: number): Section => {
  const on = !isSepRow(sec, r)
  return { ...sec, parts: partsOf(sec).map((p) => (p.r === r && p.type !== 'empty' ? { ...p, sep: on || undefined } : p)) }
}

/** 保存してよい要素の名前(種類ごと。箱は、出すものを外しても設定は残す。elements.ts の partElements と合わせる) */
const ELEMENT_KEYS: Record<PartType, string[]> = {
  box: ['image', 'name', 'price', 'swatches', 'rating', 'badge', 'desc', 'button'],
  button: ['label', 'image'],
  text: ['text'],
  media: ['image'],
  line: [],
  spacer: [],
  empty: [],
}

/** 要素ごとの設定を読む(知らない要素・空の設定は外す) */
function parseEls(type: PartType, raw: unknown): TablePart['els'] {
  if (!raw || typeof raw !== 'object') return undefined
  const out: NonNullable<TablePart['els']> = {}
  for (const k of ELEMENT_KEYS[type]) {
    const o = (raw as Record<string, unknown>)[k] as Record<string, unknown> | undefined
    if (!o || typeof o !== 'object') continue
    const desc = str(o.desc, 200)
    const spec = { ...(desc ? { desc } : {}), ...(typeof o.click === 'boolean' ? { click: o.click } : {}) }
    if (Object.keys(spec).length > 0) out[k] = spec
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** 保存されている部品を読む(知らない値は外す) */
export function parsePart(raw: unknown): TablePart | null {
  const o = raw as Record<string, unknown> | null
  if (!o || typeof o !== 'object' || typeof o.id !== 'string' || !TYPES.includes(o.type as PartType)) return null
  const nums = [o.c, o.r, o.w, o.h]
  if (!nums.every((n) => typeof n === 'number' && Number.isFinite(n))) return null
  const type = o.type as PartType
  const part: TablePart = { id: o.id.slice(0, 40), type, c: o.c as number, r: o.r as number, w: o.w as number, h: o.h as number }
  // 説明と要素ごとの設定(8.4)。空きのマスは持たない
  const desc = type !== 'empty' ? str(o.desc, 200) : undefined
  if (desc) part.desc = desc
  const els = parseEls(type, o.els)
  if (els) part.els = els
  // 均等の行の縦の区切り線・枠で囲む(8.9)
  if (o.sep === true && type !== 'empty') part.sep = true
  if ((type === 'text' || type === 'button' || type === 'media') && (o.frame === 'solid' || o.frame === 'dashed')) part.frame = o.frame
  if (type === 'line') {
    if (o.lineWidth === 2 || o.lineWidth === 4) part.lineWidth = o.lineWidth
    if (o.lineColor === 'gray' || o.lineColor === 'black') part.lineColor = o.lineColor
    if (o.lineShort === true) part.lineShort = true
    if (o.lineSpace === 'tight' || o.lineSpace === 'wide') part.lineSpace = o.lineSpace
  }
  if (type === 'spacer' && SPACER_HEIGHTS.includes(o.height as number) && o.height !== 24) part.height = o.height as number
  if (type === 'box') {
    if (CELL_VIEWS.includes(o.view as CellView) && o.view !== 'card') part.view = o.view as CellView
    const note = str(o.aiNote, 300)
    if (note) part.aiNote = note
    if (Array.isArray(o.fields)) part.fields = BOX_FIELDS.filter((f) => (o.fields as unknown[]).includes(f))
    if (o.priceStyle === 'sale' || o.priceStyle === 'from') part.priceStyle = o.priceStyle
    const badge = str(o.badge, 12)
    if (badge) part.badge = badge
    if (MEDIA_RATIOS.includes(o.ratio as MediaRatio)) part.ratio = o.ratio as MediaRatio
    if (o.swatchShape === 'square') part.swatchShape = 'square'
    if (typeof o.swatchMax === 'number' && Number.isInteger(o.swatchMax) && o.swatchMax >= 1 && o.swatchMax <= 12 && o.swatchMax !== 5) part.swatchMax = o.swatchMax
    if (o.ratingShow === 'stars' || o.ratingShow === 'starsCount') part.ratingShow = o.ratingShow
    if (typeof o.ratingMin === 'number' && Number.isInteger(o.ratingMin) && o.ratingMin >= 0 && o.ratingMin <= 1000 && o.ratingMin !== 3) part.ratingMin = o.ratingMin
    if (typeof o.ratingFloor === 'number' && o.ratingFloor > 0 && o.ratingFloor <= 5) part.ratingFloor = o.ratingFloor
  } else if (type === 'button') {
    const label = str(o.label, 30)
    if (label) part.label = label
    if (o.style === 'outline' || o.style === 'text') part.style = o.style
    if (o.shape === 'rounded' || o.shape === 'square' || o.shape === 'underline') part.shape = o.shape
    if (o.size === 'small' || o.size === 'large') part.size = o.size
    if (o.fit === true) part.fit = true
    if (o.icon === 'right' || o.icon === 'left') part.icon = o.icon
    if (o.face === 'image' || o.face === 'both') {
      part.face = o.face
      const src = url(o.src)
      if (src) part.src = src
      if (typeof o.imageId === 'string' && o.imageId) part.imageId = o.imageId.slice(0, 60)
      const alt = str(o.alt, 120)
      if (alt) part.alt = alt
      if (o.swap === false) part.swap = false
    }
    if (typeof o.color === 'string' && o.color !== 'black' && o.color in BUTTON_COLORS) part.color = o.color as ButtonColor
    if (ALIGNS.includes(o.align as TextAlign) && o.align !== 'center') part.align = o.align as TextAlign
    if (LINKS.includes(o.link as LinkKind) && o.link !== 'campaign') part.link = o.link as LinkKind
    const track = str(o.track, 60)
    if (track) part.track = track
  } else if (type === 'text') {
    const text = str(o.text, 1000)
    if (text) part.text = text
    if (o.overridable === false) part.overridable = false
    if (o.dir === 'vertical' || o.dir === 'rotate') part.dir = o.dir
    if (ALIGNS.includes(o.align as TextAlign) && o.align !== 'left') part.align = o.align as TextAlign
  } else if (type === 'media') {
    const src = url(o.src)
    if (src) part.src = src
    if (typeof o.imageId === 'string' && o.imageId) part.imageId = o.imageId.slice(0, 60)
    const video = url(o.video)
    if (video) part.video = video
    const alt = str(o.alt, 120)
    if (alt) part.alt = alt
    if (MEDIA_RATIOS.includes(o.ratio as MediaRatio) && o.ratio !== 'wide') part.ratio = o.ratio as MediaRatio
    if (LINKS.includes(o.link as LinkKind) && o.link !== 'campaign') part.link = o.link as LinkKind
    const track = str(o.track, 60)
    if (track) part.track = track
    if (o.swap === true) part.swap = true
  }
  return part
}

/** 部品を保存する形にする(既定の値は書かない) */
export const storedPart = (p: TablePart): TablePart => parsePart(p) ?? p

/** 表に箱・ボタン・テキストが 1 つもないか(空のセクションは、保存しない) */
export const isBlankTable = (sec: Section) => isTable(sec) && partsOf(sec).every((p) => p.type === 'empty')
