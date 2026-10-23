// 開発用の画面の、ペインの境目のドラッグ(幅・高さを変える)。
// 押した部品がポインタを捕まえる(setPointerCapture)ので、窓の外で離しても、終わりを必ず受け取る。
// 以前は、ドラッグの間だけページ全体の文字選択を止めていたが、終わりを受け取れないと止めたまま残り、
// 会話の文字が選べなくなった(2026-10-23)。押したときの既定の動き(選択の始まり)を止めるだけにする
import { useEffect, useState } from 'react'
import type React from 'react'

/** ドラッグを始める。onMove には、押した位置からの動き(dx, dy)を渡す */
export function startDrag(e: React.PointerEvent<HTMLElement>, onMove: (dx: number, dy: number) => void): void {
  e.preventDefault()
  const el = e.currentTarget
  const x0 = e.clientX
  const y0 = e.clientY
  const id = e.pointerId
  el.setPointerCapture(id)
  const move = (ev: PointerEvent) => onMove(ev.clientX - x0, ev.clientY - y0)
  const end = () => {
    el.removeEventListener('pointermove', move)
    el.removeEventListener('pointerup', end)
    el.removeEventListener('pointercancel', end)
    el.removeEventListener('lostpointercapture', end)
    if (el.hasPointerCapture(id)) el.releasePointerCapture(id)
  }
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', end)
  el.addEventListener('pointercancel', end)
  el.addEventListener('lostpointercapture', end)
}

/** この画面を開いている人のブラウザに覚える高さ(ペインの境目で変えたもの) */
export function useStoredHeight(key: string, initial: number): [number, (h: number) => void] {
  const [h, setH] = useState(() => {
    try {
      const v = Number(window.localStorage.getItem(key))
      return v > 0 ? v : initial
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem(key, String(Math.round(h)))
    } catch {
      // 覚えられない環境では、毎回はじめの高さ
    }
  }, [key, h])
  return [h, setH]
}
