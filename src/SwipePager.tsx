import { useEffect, useRef, useState, type ReactNode } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: { position: 'relative', overflowX: 'hidden', minWidth: 0 },
  // 引いているあいだは、文字を選ばない(つかんで動かしているのが分かるように、手の形にする)
  dragging: { userSelect: 'none', cursor: 'grabbing' },
})

// つかんだまま、この距離を横に動かしたら「引いている」とみなす(クリックや文字の選択と区別する)
const START = 8
// 離したときに、表示の幅のこの割合(か、下の距離)を超えて動かしていれば、前後に移る
const RATIO = 0.22
const MIN_PX = 120
// トラックパッドの横スワイプ: これだけ横に動かしたら移る。続けて何度も移らないよう、少し間を置く
const WHEEL_PX = 140
const WHEEL_REST_MS = 500

// ここから始めたドラッグは、その部品の操作(カードを開く・動かす、入力する)なので、前後の移動にしない
const OWN = 'button, a, input, textarea, select, label, [role="button"], [role="slider"], [role="option"], [draggable="true"], [contenteditable="true"], [data-no-swipe]'

/** 中に、横にスクロールできる箱があれば、その箱の横スクロールを優先する(トラックパッドの横スワイプ) */
function scrollsX(from: EventTarget | null, root: HTMLElement): boolean {
  for (let el = from as HTMLElement | null; el && el !== root; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const ox = getComputedStyle(el).overflowX
      if (ox === 'auto' || ox === 'scroll') return true
    }
  }
  return false
}

interface Props {
  /** 前(右に引いたとき)・次(左に引いたとき)へ移る */
  onPrev: () => void
  onNext: () => void
  /** false なら、引いても動かない(一覧・比べるなど、横に移る意味がない表示) */
  enabled?: boolean
  children: ReactNode
}

/**
 * 週・月の表示を、地の部分をつかんで横に引くと、前後の週・月に移る(2026-10-20、利用者の要望: Outlook のように、つかんで送りたい)。
 * 右に引く = 前、左に引く = 次(ページをめくる向き)。引いているあいだは表示が指についてきて、離したときに足りなければ元に戻る。
 * カード・ボタン・入力の上から始めたドラッグは、その部品の操作のまま(時刻の格子のカードを動かすドラッグとぶつからないように)。
 * トラックパッドの 2 本指の横スワイプでも移る
 */
export function SwipePager({ onPrev, onNext, enabled = true, children }: Props) {
  const s = useStyles()
  const root = useRef<HTMLDivElement>(null)
  const [dx, setDx] = useState(0)
  const [anim, setAnim] = useState(false)
  // 引いているか(手の形・文字を選ばない)と、そのときの表示の幅(離れるほど薄くするのに使う)
  const [dragging, setDragging] = useState(false)
  const [width, setWidth] = useState(600)
  const drag = useRef<{ id: number; x: number; y: number; on: boolean } | null>(null)
  // 引いたあとの click は捨てる(離した場所の部品が押されないように)
  const swallowClick = useRef(false)
  const wheel = useRef({ sum: 0, rest: 0 })
  const nav = useRef({ onPrev, onNext })
  useEffect(() => {
    nav.current = { onPrev, onNext }
  }, [onPrev, onNext])

  const go = (dir: -1 | 1) => {
    const w = root.current?.clientWidth ?? 600
    // 引いた向きへ流し切ってから移り、移った先は、反対側から少しだけ滑り込ませる
    setAnim(true)
    setDx(dir === -1 ? w : -w)
    window.setTimeout(() => {
      if (dir === -1) nav.current.onPrev()
      else nav.current.onNext()
      setAnim(false)
      setDx(dir === -1 ? -w * 0.15 : w * 0.15)
      requestAnimationFrame(() => {
        setAnim(true)
        setDx(0)
      })
    }, 160)
  }

  // トラックパッドの横スワイプ(React の onWheel は passive なので、addEventListener で受ける)
  useEffect(() => {
    const el = root.current
    if (!el || !enabled) return
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) || scrollsX(e.target, el)) return
      e.preventDefault()
      const now = Date.now()
      if (now < wheel.current.rest) return
      wheel.current.sum += e.deltaX
      if (Math.abs(wheel.current.sum) >= WHEEL_PX) {
        const dir = wheel.current.sum > 0 ? 1 : -1
        wheel.current = { sum: 0, rest: now + WHEEL_REST_MS }
        go(dir)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [enabled])

  const end = (e: React.PointerEvent) => {
    const d = drag.current
    drag.current = null
    if (!d || d.id !== e.pointerId || !d.on) return
    setDragging(false)
    swallowClick.current = true
    if (Math.abs(dx) >= Math.min(MIN_PX, width * RATIO)) {
      go(dx > 0 ? -1 : 1)
    } else {
      setAnim(true)
      setDx(0)
    }
  }

  return (
    <div
      ref={root}
      className={mergeClasses(s.root, dragging && s.dragging)}
      onPointerDown={(e) => {
        // 前に引いたあと click が来なかったときに、次のふつうのクリックを捨てないよう、押すたびに戻す
        swallowClick.current = false
        if (!enabled || e.button !== 0 || (e.target as HTMLElement).closest(OWN)) return
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d || d.id !== e.pointerId) return
        const mx = e.clientX - d.x
        const my = e.clientY - d.y
        if (!d.on) {
          // 縦に動かしている(スクロールしている)なら、引くのをやめる
          if (Math.abs(my) > START && Math.abs(my) > Math.abs(mx)) {
            drag.current = null
            return
          }
          if (Math.abs(mx) < START) return
          d.on = true
          root.current?.setPointerCapture(e.pointerId)
          setWidth(root.current?.clientWidth ?? 600)
          setDragging(true)
          setAnim(false)
        }
        setDx(mx)
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onClickCapture={(e) => {
        if (!swallowClick.current) return
        swallowClick.current = false
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      <div style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: anim ? 'transform 160ms ease-out' : undefined, opacity: dx ? Math.max(0.55, 1 - Math.abs(dx) / (width * 1.6)) : undefined }}>{children}</div>
    </div>
  )
}
