// プレビューの商品を、見たままの向き(格子の上下左右)に動かす(シンプルな配信カード。2026-10-26 利用者:
// 商品は上下左右に並ぶので、「前へ・後ろへ」の矢印では、やりたいことを表せない)。
// 並びの番号の前後ではなく、プレビューに描いた位置から、その向きのいちばん近い商品を探し、位置を入れ替える(swapItems)

export type MoveDir = 'up' | 'down' | 'left' | 'right'

/** プレビューの中の商品の枠(重ねた印の層は除く)。鍵ごとに 1 つ */
function productRects(box: HTMLElement): Map<string, DOMRect> {
  const out = new Map<string, DOMRect>()
  for (const el of box.querySelectorAll<HTMLElement>('[data-item-key]')) {
    if (el.closest('[data-no-pick]')) continue
    const key = el.getAttribute('data-item-key')
    if (key && !out.has(key)) out.set(key, el.getBoundingClientRect())
  }
  return out
}

/**
 * itemKey の商品から見て、dir の向きでいちばん近い商品の鍵(なければ null)。
 * その向きに中心が 4px 以上進んでいるものから、進む量 + 横ずれ × 2 が小さいものを選ぶ(同じ行・列にあるものを先に選ぶため)
 */
export function neighborItem(box: HTMLElement, itemKey: string, dir: MoveDir): string | null {
  const rects = productRects(box)
  const from = rects.get(itemKey)
  if (!from) return null
  const cx = from.left + from.width / 2
  const cy = from.top + from.height / 2
  let best: { key: string; score: number } | null = null
  for (const [key, r] of rects) {
    if (key === itemKey) continue
    const dx = r.left + r.width / 2 - cx
    const dy = r.top + r.height / 2 - cy
    const along = dir === 'right' ? dx : dir === 'left' ? -dx : dir === 'down' ? dy : -dy
    const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx)
    if (along < 4) continue
    const score = along + across * 2
    if (!best || score < best.score) best = { key, score }
  }
  return best?.key ?? null
}

/** 矢印のキーの向き */
export const dirOfKey = (key: string): MoveDir | null =>
  key === 'ArrowUp' ? 'up' : key === 'ArrowDown' ? 'down' : key === 'ArrowLeft' ? 'left' : key === 'ArrowRight' ? 'right' : null
