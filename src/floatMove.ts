// フロートを、題の行をつかんで動かす共通のしくみ(2026-10-26 利用者と決めた: フロートに隠れて画面の内容を確かめられないため)。
// 位置は覚えない(開くたびに、いつもの場所に出す)。題の行をダブルクリックで、もとの場所に戻す。画面の外には出さない(題の行が画面に残る)。
// 動かすのは CSS の translate(transform とは別の値)。Fluent の位置合わせ(ピンのフロートの Popover)が transform を使うので、ぶつからないように
import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { getUiScale, viewWidth } from './uiScale'

/** 題の行の中でも、押して使う所(ここをつかんでも動かさない) */
const INTERACTIVE = 'button, a, input, textarea, select, label, [role=tab], [role=button], [role=menuitem], [role=combobox], [contenteditable=true], [data-no-drag]'

/** 画面の端に残す幅(題の行がこれだけは見えているように) */
const KEEP = 80

/** つかんでよい所か(押して使う部品の上でなければ) */
export const isGrabbable = (target: EventTarget | null) => target instanceof Element && !target.closest(INTERACTIVE)

export function useFloatMove(surfaceRef: RefObject<HTMLElement | null>) {
  const [off, setOff] = useState({ x: 0, y: 0 })
  // 前に題の行を押した時刻と場所(ダブルクリックを見分ける。押したときに既定の動きを止めるので、ブラウザの dblclick は届かない)
  const lastDown = useRef({ at: 0, x: 0, y: 0 })
  /** 題の行で押したとき。動かし終わるまで追う */
  const startMove = (e: ReactPointerEvent<HTMLElement>) => {
    const el = surfaceRef.current
    // 狭い画面(900px 未満)では、フロートは画面いっぱいなので動かさない
    if (e.button !== 0 || !el || viewWidth() < 900 || !isGrabbable(e.target)) return
    // 文字が選ばれないように止める(そのため dblclick は来ないので、続けて 2 回押したら、もとの場所に戻す)
    e.preventDefault()
    const prev = lastDown.current
    lastDown.current = { at: e.timeStamp, x: e.clientX, y: e.clientY }
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    if (e.timeStamp - prev.at < 400 && Math.abs(e.clientX - prev.x) < 6 && Math.abs(e.clientY - prev.y) < 6) {
      lastDown.current = { at: 0, x: 0, y: 0 }
      // 戻すのは離したとき(押した時点で戻すと、離した点がフロートの外になり、外を押したとみなされてピンのフロートが閉じるため)
      handle.addEventListener('pointerup', () => setOff({ x: 0, y: 0 }), { once: true })
      return
    }
    const sx = e.clientX
    const sy = e.clientY
    const start = off
    const r = el.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      // 画面の外に出さない: 上の端は画面の中、下は題の行が残る所まで、左右は KEEP だけ残す(測った値は画面の px)
      const dx = Math.min(window.innerWidth - KEEP - r.left, Math.max(KEEP - r.right, ev.clientX - sx))
      const dy = Math.min(window.innerHeight - 40 - r.top, Math.max(-r.top, ev.clientY - sy))
      // 置く値は、表示の大きさ(X60 の zoom)を掛ける前の px
      setOff({ x: start.x + dx / getUiScale(), y: start.y + dy / getUiScale() })
    }
    const end = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }
  const style: CSSProperties | undefined = off.x || off.y ? { translate: `${off.x}px ${off.y}px` } : undefined
  return { style, startMove }
}
