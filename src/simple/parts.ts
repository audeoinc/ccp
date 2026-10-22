/**
 * シンプルな配信カード(SU1)の「部品」。プレビューの上で押して選ぶ単位(docs/SIMPLE_CARD.md の 5 章)。
 * React を使わない(制作のページ・結果でも、同じ見分け方を使えるように)。
 *
 * プレビューの目印は 3 つ: 商品の枠の data-item-key、部品の data-part、ピンの場所の data-anchor。
 * data-anchor はピン(X65)の場所の目印なので名前を変えない。細かく見分けたい所には data-part を足す(Preview.tsx)
 */
export type PartRef =
  | { kind: 'subject' }
  | { kind: 'preheader' }
  | { kind: 'pushTitle' }
  | { kind: 'pushBody' }
  | { kind: 'headline' }
  | { kind: 'copy' }
  | { kind: 'hero' }
  | { kind: 'sectionTitle'; index: number }
  | { kind: 'sectionCopy'; index: number }
  | { kind: 'product'; itemKey: string }
  // 空いた枠。index は、商品の並び全体の中の位置(そこへ入れると、その位置の商品になる)
  | { kind: 'slot'; index: number }
  | { kind: 'button'; id: string }
  | { kind: 'template' }
  | { kind: 'overview'; field?: string }
  | { kind: 'meta'; field: string }

/** 部品の名前(data-part の値・比べるときの鍵)。商品は、枠の鍵 */
export function partKey(p: PartRef): string {
  switch (p.kind) {
    case 'sectionTitle':
    case 'sectionCopy':
      return `${p.kind}:${p.index}`
    case 'slot':
      return `slot:${p.index}`
    case 'product':
      return `product:${p.itemKey}`
    case 'button':
      return `button:${p.id}`
    case 'overview':
      return p.field ? `overview:${p.field}` : 'overview'
    case 'meta':
      return `meta:${p.field}`
    default:
      return p.kind
  }
}

export const samePart = (a: PartRef | null, b: PartRef | null) => (a && b ? partKey(a) === partKey(b) : a === b)

const SIMPLE_KINDS = ['subject', 'preheader', 'pushTitle', 'pushBody', 'headline', 'copy', 'hero', 'template'] as const

/** data-part の値から部品へ(読めない値は null) */
export function parsePart(v: string | null | undefined): PartRef | null {
  if (!v) return null
  if ((SIMPLE_KINDS as readonly string[]).includes(v)) return { kind: v as (typeof SIMPLE_KINDS)[number] }
  const at = v.indexOf(':')
  if (at < 0) return v === 'overview' ? { kind: 'overview' } : null
  const head = v.slice(0, at)
  const rest = v.slice(at + 1)
  const n = Number(rest)
  if ((head === 'sectionTitle' || head === 'sectionCopy') && Number.isInteger(n)) return { kind: head, index: n }
  if (head === 'slot' && Number.isInteger(n)) return { kind: 'slot', index: n }
  if (head === 'product' && rest) return { kind: 'product', itemKey: rest }
  if (head === 'button' && rest) return { kind: 'button', id: rest }
  if (head === 'overview') return { kind: 'overview', field: rest || undefined }
  if (head === 'meta' && rest) return { kind: 'meta', field: rest }
  return null
}

/** data-part のない古い目印(data-anchor)からの読み替え。ピンの目印は、部品より粗いので、近いものに寄せる */
function fromAnchor(v: string | null): PartRef | null {
  if (!v) return null
  if (v === 'hero') return { kind: 'hero' }
  if (v === 'subject') return { kind: 'subject' }
  if (v === 'herotext') return { kind: 'headline' }
  if (v === 'push') return { kind: 'pushTitle' }
  if (v === 'topbar') return { kind: 'meta', field: 'name' }
  if (v.startsWith('button:')) return { kind: 'button', id: v.slice('button:'.length) }
  return null
}

/** 押した要素から部品を見分ける(商品の枠 → data-part → data-anchor の順。root の外は見ない) */
export function partFromElement(el: Element | null, root: Element): PartRef | null {
  if (!el || !root.contains(el)) return null
  const item = el.closest('[data-item-key]')
  if (item && root.contains(item)) return { kind: 'product', itemKey: item.getAttribute('data-item-key') ?? '' }
  const part = el.closest('[data-part]')
  if (part && root.contains(part)) {
    const p = parsePart(part.getAttribute('data-part'))
    if (p) return p
  }
  const anchor = el.closest('[data-anchor]')
  return anchor && root.contains(anchor) ? fromAnchor(anchor.getAttribute('data-anchor')) : null
}

/** 部品の要素を探す(最初の 1 つ) */
export function partElement(root: Element, p: PartRef): Element | null {
  if (p.kind === 'product') return root.querySelector(`[data-item-key="${CSS.escape(p.itemKey)}"]`)
  return root.querySelector(`[data-part="${CSS.escape(partKey(p))}"]`)
}

/** プレビューの中の、選べる部品を上から順に(Tab で次の部品へ移るため) */
export function partsInOrder(root: Element): PartRef[] {
  const out: PartRef[] = []
  const seen = new Set<string>()
  for (const el of root.querySelectorAll('[data-item-key], [data-part]')) {
    const p = el.hasAttribute('data-item-key') ? ({ kind: 'product', itemKey: el.getAttribute('data-item-key') ?? '' } as PartRef) : parsePart(el.getAttribute('data-part'))
    if (!p) continue
    const k = partKey(p)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(p)
  }
  return out
}

/** 部品の、プレビュー上の書き込みの目印(PreviewPins が読む data-anchor の名前。商品は product_id で持つ)。目印のない部品は null */
export function anchorOfPart(p: PartRef | null, productIdOf: (itemKey: string) => string | undefined): { anchor: string; productId?: string } | null {
  if (!p) return null
  switch (p.kind) {
    case 'hero':
      return { anchor: 'hero' }
    case 'headline':
    case 'copy':
      return { anchor: 'herotext' }
    case 'subject':
    case 'preheader':
      return { anchor: 'subject' }
    case 'pushTitle':
    case 'pushBody':
      return { anchor: 'push' }
    case 'sectionTitle':
    case 'sectionCopy':
      return { anchor: `section:${p.index}` }
    case 'button':
      return { anchor: `button:${p.id}` }
    case 'product': {
      const productId = productIdOf(p.itemKey)
      return productId ? { anchor: 'product', productId } : null
    }
    default:
      return null
  }
}
