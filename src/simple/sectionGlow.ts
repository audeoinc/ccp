// プレビューのセクションに枠を付けて光らせる(X81 の 9)。「○○の商品を AI で選ぶ」にマウスを載せたとき・案を試しているあいだ、
// どのセクションが変わるのかを見せる。ボタンは選んだ部品のペインに、プレビューは別の所にあるので、光らせるセクションは画面で 1 つの値として持つ
import { useSyncExternalStore } from 'react'

let glowing: number | null = null
const listeners = new Set<() => void>()
/** 光らせるセクション(null で消す) */
export function setSectionGlow(index: number | null) {
  if (glowing === index) return
  glowing = index
  listeners.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => void listeners.delete(f)
}
/** いま光らせるセクション */
export const useGlowing = () => useSyncExternalStore(subscribe, () => glowing)

