// 選定済みの商品の並び(items)と、テンプレートのセクションの枠の対応。
// 並びの何番目かが、そのまま何番目の枠(sectionsOf の start / slots)になる。前のセクションが埋まっていないのに後ろのセクションへ商品を置くと、
// そのままでは前の枠に詰まってしまうので、埋まっていない枠を「空いた枠」の行(gap)として並びに持つ(2026-10-27 利用者と決めた案 A)。
// 空いた枠は画面の中だけのもので、保存しない(保存は sort_order を「枠の位置 + 1」にし、空いた枠の番号は飛ぶ)。
// 決まり: 空いた枠は、埋まっていないセクションの後ろにだけ置き、後ろのセクションに商品があるときだけ置く(最後の商品より後ろには置かない)。
// 商品を外すと、そのセクションの中だけ詰め、ほかのセクションは動かさない
import { SOURCE_MANUAL, STATE_CANDIDATE, type Item } from './items'
import { sectionIndexAt, sectionRange, type SectionInfo } from './templates'

/** 空いた枠の行か */
export const isGap = (it: { gap?: boolean } | undefined): boolean => it?.gap === true

/** 空いた枠を除いた、商品だけの並び(数える・AI に渡す・一覧に出すときに使う) */
export const filled = <T extends { gap?: boolean }>(list: T[]): T[] => list.filter((i) => !isGap(i))

const gapItem = (): Item => ({ key: `gap-${crypto.randomUUID()}`, productId: '', reason: '', source: SOURCE_MANUAL, gap: true })

/** 並びを、セクションごとの商品の並び(空いた枠を除く)に分ける。セクションがないテンプレートは 1 つにまとめる */
export function splitSections(items: Item[], sections: SectionInfo[]): Item[][] {
  if (sections.length === 0) return [filled(items)]
  return sections.map((sec) => {
    const [from, to] = sectionRange(sections, sec, items.length)
    return filled(items.slice(from, to))
  })
}

/**
 * セクションごとの商品の並びを、1 本の並びに戻す。埋まっていないセクションは、後ろのセクションに商品があるときだけ、空いた枠で埋める。
 * 枠より多い商品(いっぱいのセクションに入れたとき)は、次のセクションの先頭へ送る(最後のセクションは枠外として残す。いままでと同じ)
 */
export function joinSections(lists: Item[][], sections: SectionInfo[]): Item[] {
  if (sections.length <= 1) return lists.flat()
  const work = sections.map((_, i) => [...(lists[i] ?? [])])
  // 余りを後ろへ送る(最後のセクションは送らない)
  for (let i = 0; i < work.length - 1; i++) {
    const slots = sections[i].slots
    if (Number.isFinite(slots) && work[i].length > slots) work[i + 1].unshift(...work[i].splice(slots))
  }
  const lastFilled = work.reduce((n, l, i) => (l.length ? i : n), -1)
  const out: Item[] = []
  work.forEach((l, i) => {
    out.push(...l)
    const slots = sections[i].slots
    if (i < lastFilled && Number.isFinite(slots)) for (let k = l.length; k < slots; k++) out.push(gapItem())
  })
  return out
}

/** 決まりの形にそろえる(セクションの中の空いた枠を後ろへ寄せ、要らない空いた枠を消す) */
export const compactSlots = (items: Item[], sections: SectionInfo[]): Item[] => joinSections(splitSections(items, sections), sections)

/** 並びの位置 at が、どのセクションの何番目か(at は空いた枠の位置でもよい。範囲の外は最後のセクションの末尾) */
function sectionOfPosition(sections: SectionInfo[], lists: Item[][], at: number): { s: number; offset: number } {
  if (sections.length === 0) return { s: 0, offset: Math.max(0, Math.min(at, lists[0]?.length ?? 0)) }
  const s = sectionIndexAt(sections, Math.max(0, at))
  return { s, offset: Math.max(0, Math.min(at - sections[s].start, lists[s].length)) }
}

/** 並びの位置 at(空いた枠の位置でもよい)に、商品を入れる。そのセクションの中で前から詰めて入れる */
export function insertAt(items: Item[], sections: SectionInfo[], at: number, it: Item): Item[] {
  const lists = splitSections(items, sections)
  const { s, offset } = sectionOfPosition(sections, lists, at)
  lists[s].splice(offset, 0, it)
  return joinSections(lists, sections)
}

/** 商品を外す(そのセクションの中だけ詰める) */
export function removeKey(items: Item[], sections: SectionInfo[], key: string): Item[] {
  return joinSections(
    splitSections(items, sections).map((l) => l.filter((i) => i.key !== key)),
    sections,
  )
}

/** 商品 key を、並びの位置 to(空いた枠の位置でもよい)へ移す */
export function moveTo(items: Item[], sections: SectionInfo[], key: string, to: number): Item[] {
  const it = items.find((i) => i.key === key)
  if (!it || isGap(it)) return items
  // 外す前の位置で、入れる先のセクションを決める(同じセクションの中で後ろへ移すときに、1 つずれないように)
  const lists = splitSections(items, sections)
  const { s, offset } = sectionOfPosition(sections, lists, to)
  const from = lists.findIndex((l) => l.includes(it))
  const fromOffset = from >= 0 ? lists[from].indexOf(it) : -1
  if (from >= 0) lists[from].splice(fromOffset, 1)
  const adj = from === s && fromOffset >= 0 && fromOffset < offset ? offset - 1 : offset
  lists[s].splice(Math.min(adj, lists[s].length), 0, it)
  return joinSections(lists, sections)
}

/** セクション i の商品を、next に置き換える(ほかのセクションは動かさない) */
export function replaceSection(items: Item[], sections: SectionInfo[], i: number, next: Item[]): Item[] {
  const lists = splitSections(items, sections)
  if (!lists[i]) return items
  lists[i] = next
  return joinSections(lists, sections)
}

/**
 * 保存した行(sort_order の順)から、並びを作る。sort_order が 1 から始まる保存(配信カード・まとめて作る・AB の案・複製が書く形)は、
 * 「sort_order - 1」の位置に置き、飛んだ番号は空いた枠にする(いままでの保存は番号が続いているので、並びはいままでと同じ)。
 * 0 から始まる番号を含む保存(初期データの見本)は、いままでどおり、順に詰めて並べる。
 * テンプレートの読み込みの前に呼ばれてもずれないように、ここではセクションを見ない(空いた枠をそろえるのは、次に商品を動かしたとき)
 */
export function slotsFromRows<R extends { sort_order?: number | null }>(rows: R[], toItem: (r: R) => Item): Item[] {
  const items = rows.map(toItem)
  if (!rows.every((r) => typeof r.sort_order === 'number' && Number.isInteger(r.sort_order) && r.sort_order >= 1)) return items
  const placed: Item[] = []
  rows.forEach((r, n) => {
    const at = (r.sort_order as number) - 1
    while (placed.length < at) placed.push(gapItem())
    // 同じ番号が 2 つあれば(ふつうはない)、後ろに詰めて並べる
    placed.push(items[n])
  })
  return placed
}

// ---- 開いていない配信の、枠の位置つきの商品の並び(一覧ののぞき見・週・結果・制作などのプレビュー用)
// 配信ごとの商品(cardProducts)は、数える・アラートに使うので、商品だけの並びのまま。プレビューを描くときだけ、ここから空いた枠('')つきの並びを引く
let positional = new Map<string, string[]>()
/** 読み込んだ行から作った、配信ごとの枠の位置つきの並び(useAppData が入れる) */
export const setCardSlots = (m: Map<string, string[]>) => {
  positional = m
}
/**
 * 配信 cardId の、プレビュー用の並び(空いた枠は '')。productIds が、読み込んだ配信の商品と同じときだけ、枠の位置つきにする
 * (AB の案・制作の写しなど、ほかの並びを描くときは、渡されたまま)
 */
export function slotIdsOf(cardId: string | undefined, productIds: string[]): string[] {
  const p = cardId ? positional.get(cardId) : undefined
  if (!p || p.length === productIds.length) return productIds
  const real = p.filter(Boolean)
  return real.length === productIds.length && real.every((x, i) => x === productIds[i]) ? p : productIds
}

// ---- 商品 ID の並び(空いた枠は '')と、行の並びの行き来(制作の写し・プレビューなど、ID だけで持つ所)
export const idsToItems = (ids: string[]): Item[] => ids.map((pid, i) => (pid ? { key: `${pid}-${i}`, productId: pid, reason: '', source: SOURCE_MANUAL } : { key: `gap-${i}`, productId: '', reason: '', source: SOURCE_MANUAL, gap: true }))
export const itemsToIds = (items: Item[]): string[] => items.map((i) => (isGap(i) ? '' : i.productId))

/**
 * 1 つの配信の保存した行(選定・候補・B・C 案が混ざったまま)から、案 variant(A は '')の選定の並びを作る。
 * 候補の行(sort_order は 1000 番台)は枠の位置ではないので、ここでは使わない(候補は、候補の並びとして別に読む)
 */
export function selectedSlots<R extends { state?: string | null; variant?: string | null; sort_order?: number | null }>(rows: R[], variant: string, toItem: (r: R) => Item): Item[] {
  const mine = rows.filter((r) => r.state !== STATE_CANDIDATE && (r.variant ?? '') === variant).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  return slotsFromRows(mine, toItem)
}
