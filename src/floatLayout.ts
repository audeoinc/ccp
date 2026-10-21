// フロート(大きなダイアログ)の大きさと、その中のペインの幅を変えて覚える、共通のしくみ(2026-10-19、利用者の要望: 計画の配信カードと同じ動きを全体でそろえる)。
// つまみは ResizeHandles(辺・角)と Splitter(ペインの境界)。ここは、その変化量を受けて、大きさ・幅を決め、ブラウザに覚える。
// 配信カード(CardDetail)は、これより前から同じ動きを自前で持っている。新しいフロートは、これを使う
import { useState, type CSSProperties, type RefObject } from 'react'
import { loadPref, savePref } from './settings'
import { viewHeight, viewWidth } from './uiScale'

export type FloatSize = { w: number; h: number }

/**
 * フロートの大きさ。辺・角のドラッグで変え、離したときに覚える。ダブルクリックで既定の大きさに戻す。
 * 狭い画面(900px 未満)では、既定の全画面のまま(つまみも出ない)。surfaceRef は、フロートの枠(まだ既定の大きさのときに、いまの大きさを測る)
 */
export function useFloatSize(key: string, surfaceRef: RefObject<HTMLElement | null>, min: FloatSize = { w: 900, h: 560 }) {
  const clampSize = (s: FloatSize): FloatSize => ({
    w: Math.round(Math.min(viewWidth(), Math.max(min.w, s.w))),
    h: Math.round(Math.min(viewHeight(), Math.max(min.h, s.h))),
  })
  const [size, setSize] = useState<FloatSize | null>(() => loadPref<FloatSize | null>(key, null))
  const onResize = (dw: number, dh: number) =>
    setSize((s) => {
      // まだ既定の大きさなら、いまの大きさから始める
      const r = surfaceRef.current?.getBoundingClientRect()
      const cur = s ?? (r ? { w: r.width, h: r.height } : null)
      return cur ? clampSize({ w: cur.w + dw, h: cur.h + dh }) : s
    })
  const onDone = () =>
    setSize((s) => {
      savePref(key, s)
      return s
    })
  const onReset = () => {
    savePref(key, null)
    setSize(null)
  }
  // 画面より大きく覚えていても、画面に収める
  const style: CSSProperties | undefined =
    size && viewWidth() >= 900 ? (() => { const c = clampSize(size); return { width: `${c.w}px`, height: `${c.h}px`, maxHeight: `${c.h}px` } })() : undefined
  return { style, handles: { onResize, onDone, onReset } }
}

/**
 * ペインの幅。flex 番目のペインだけ残りの幅を取り(1fr)、ほかは px で持つ。
 * 境界 i(i 番目と i+1 番目のあいだ)をドラッグすると、伸び縮みする側でないペインの幅を変える
 */
export function usePaneWidths(key: string, defaults: number[], flex: number, range: { min: number; max: number } = { min: 200, max: 900 }) {
  const clamp = (v: number) => Math.min(range.max, Math.max(range.min, Math.round(v)))
  const [widths, setWidths] = useState<number[]>(() => {
    const v = loadPref<number[] | null>(key, null)
    return Array.isArray(v) && v.length === defaults.length ? v.map(clamp) : defaults
  })
  const onDrag = (i: number) => (dx: number) =>
    setWidths((w) => {
      const next = [...w]
      // 境界の左が伸び縮みしないペインなら、それを広げる。そうでなければ、右のペインを狭める
      if (i !== flex) next[i] = clamp(next[i] + dx)
      else next[i + 1] = clamp(next[i + 1] - dx)
      return next
    })
  const onDone = () =>
    setWidths((w) => {
      savePref(key, w)
      return w
    })
  /** CSS の grid-template-columns(ペインのあいだに 1px の境界を挟む) */
  const columns = widths.map((w, i) => (i === flex ? 'minmax(280px, 1fr)' : `${w}px`)).join(' 1px ')
  return { widths, onDrag, onDone, columns }
}
