import type { PartRef } from './parts'
import type { SimpleEditor } from './editor'

/**
 * 商品の一覧で押した商品(key: 載せた商品か候補)を、選んでいる枠に置く(SU1 ⑩)。
 * 商品の枠なら入れ替え、空いた枠なら入れる(空いた枠は前から埋まるので、載せた商品はいちばん後ろへ、候補は末尾に足す)
 */
export function placeInPart(e: SimpleEditor, part: PartRef, key: string) {
  const it = e.items.find((i) => i.key === key)
  const cand = it ? undefined : e.candidates.find((c) => c.key === key)
  if (part.kind === 'product') {
    if (part.itemKey === key) return
    if (it) e.swapItems(part.itemKey, it.key)
    else if (cand) e.swapWithCandidate(part.itemKey, cand.key, '')
  } else if (part.kind === 'slot') {
    if (it) e.moveItem(e.items.indexOf(it), e.items.length - 1)
    else if (cand) e.addProduct(cand.productId, e.items.length)
  }
}
