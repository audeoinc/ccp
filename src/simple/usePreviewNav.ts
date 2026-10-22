import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** プレビューの倍率(CardDetail の倍率をそのまま使う。'fit' は全体表示) */
export interface PreviewZoom {
  mode: number | 'fit'
  /** いま見えている倍率(全体表示のときは、計算した倍率) */
  shown: number
  set: (z: number | 'fit') => void
  min: number
  max: number
}

/** 押して選ぶ部品と、並べ替えでつかむ商品の枠(ここでは移動を始めない) */
const PICKABLE = '[data-part], [data-item-key], button, input, textarea, select, a'

/**
 * プレビューを、画像を見るソフトのように動かす(SU1 の見直し 5)。
 * - Ctrl + ホイール(トラックパッドのピンチも同じ): マウスの位置を中心に拡大・縮小。ホイールだけは、ふつうのスクロール(長いメールを読むため)
 * - つかんで移動: 部品の外(メールの外の地など)をドラッグ。スペースを押しながら・中ボタンなら、部品の上からでも動かせる
 * 動かしたあとの「押した」は、部品を選ぶ層に渡さない(移動のつもりで部品を選び直さないように)
 */
export function usePreviewNav(boxRef: RefObject<HTMLDivElement | null>, zoom: PreviewZoom) {
  const [panning, setPanning] = useState(false)
  const [spaceDown, setSpaceDown] = useState(false)
  // 拡大の前の、マウスの下にあった中身の位置(倍率が変わったあとに、同じ所がマウスの下に来るようにスクロールする)
  const anchor = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null)
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  })

  // Ctrl + ホイール。ふつうのスクロールを止める必要があるので、passive でない登録にする
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const z = zoomRef.current
      const next = Math.min(z.max, Math.max(z.min, z.shown * Math.exp(-e.deltaY * 0.0015)))
      if (Math.abs(next - z.shown) < 0.001) return
      const r = box.getBoundingClientRect()
      const cx = e.clientX - r.left
      const cy = e.clientY - r.top
      anchor.current = { x: (box.scrollLeft + cx) / z.shown, y: (box.scrollTop + cy) / z.shown, cx, cy }
      z.set(Math.round(next * 100) / 100)
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  }, [boxRef])

  useLayoutEffect(() => {
    const box = boxRef.current
    const a = anchor.current
    if (!box || !a) return
    anchor.current = null
    box.scrollLeft = a.x * zoom.shown - a.cx
    box.scrollTop = a.y * zoom.shown - a.cy
  }, [zoom.shown, boxRef])

  // スペースを押している間は、どこをつかんでも移動(入力欄で打っているときは、ふつうの空白)
  useEffect(() => {
    const editing = () => {
      const el = document.activeElement
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable)
    }
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || editing()) return
      // プレビューの箱にいるときは、箱のスクロール(空白キーで下へ)を止める
      if (boxRef.current?.contains(document.activeElement)) e.preventDefault()
      setSpaceDown(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [boxRef])

  // つかんで移動。pointer capture は使わない(使うと、動かさずに離したときの「押した」が箱そのものに付き、部品の選択が外れるため)
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element
      const middle = e.button === 1
      if (e.button !== 0 && !middle) return
      if (!middle && !spaceDown && target.closest(PICKABLE)) return
      e.preventDefault()
      const start = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop }
      let moved = false
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x
        const dy = ev.clientY - start.y
        if (!moved && Math.hypot(dx, dy) < 4) return
        if (!moved) setPanning(true)
        moved = true
        box.scrollLeft = start.left - dx
        box.scrollTop = start.top - dy
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        setPanning(false)
        if (!moved) return
        // 動かしたあとの「押した」は、部品を選ぶ層(箱の上の、泡立ちの段階で受ける)に届けない
        const swallow = (ce: MouseEvent) => {
          ce.stopPropagation()
          ce.preventDefault()
        }
        box.addEventListener('click', swallow, { capture: true, once: true })
        window.setTimeout(() => box.removeEventListener('click', swallow, { capture: true }), 0)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    box.addEventListener('pointerdown', onDown)
    return () => box.removeEventListener('pointerdown', onDown)
  }, [boxRef, spaceDown])

  return { panning, spaceDown }
}
