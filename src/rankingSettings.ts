// 商品の販売順位で「上位」とみなす線(Top N)。EC のランキングのページの件数などに合わせて変わりうるので、決め打ちにしない。
// ブラウザごとに覚える(アラートの条件と同じ。見る人が、自分の見たい線で読む)。
import { useSyncExternalStore } from 'react'

export const DEFAULT_TOP_N = 60

const KEY = 'results.rankTopN'
const listeners = new Set<() => void>()
let current = load()

function load(): number {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isInteger(v) && v >= 1 ? v : DEFAULT_TOP_N
  } catch {
    return DEFAULT_TOP_N
  }
}

export function setRankTopN(n: number) {
  if (!Number.isInteger(n) || n < 1) return
  current = n
  try {
    localStorage.setItem(KEY, String(n))
  } catch {
    // 覚えられなくても、この画面では効かせる
  }
  for (const l of listeners) l()
}

export function useRankTopN(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
