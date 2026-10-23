import { useEffect, useRef, useState } from 'react'
import type { PositioningImperativeRef, PositioningVirtualElement } from '@fluentui/react-components'

/** iframe の中の要素は、枠の位置を足した仮の要素にする(フロートは親の文書に出すため) */
function anchorOf(el: Element): Element | PositioningVirtualElement {
  const frame = el.ownerDocument.defaultView?.frameElement
  if (!frame || el.ownerDocument === document) return el
  return {
    contextElement: frame,
    getBoundingClientRect: () => {
      const f = frame.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      // 枠ごと縮めて見せている(表示の大きさ)ときは、その比で合わせる
      const k = (frame as HTMLElement).offsetWidth > 0 ? f.width / (frame as HTMLElement).offsetWidth : 1
      return DOMRect.fromRect({ x: f.left + frame.clientLeft * k + r.left * k, y: f.top + frame.clientTop * k + r.top * k, width: r.width * k, height: r.height * k })
    },
  }
}

/**
 * ピンのフロートを付ける先(data-pin-id の要素)を探す。ピンは間隔を空けて描き直されるので、見つかるまで探す(打った直後・書いた直後は、まだ無い)。
 * iframe の中のスクロール・倍率の変化は、フロートの位置の自動の追従に入らないので、間隔を空けて置き直す(positioningRef をフロートに渡す)
 */
export function usePinAnchor(findRoot: () => ParentNode | null, pinKey: string) {
  const [anchorEl, setAnchorEl] = useState<Element | null>(null)
  const rootRef = useRef(findRoot)
  useEffect(() => {
    rootRef.current = findRoot
  })
  const positioningRef = useRef<PositioningImperativeRef>(null)
  useEffect(() => {
    const find = () => {
      const el = rootRef.current()?.querySelector(`[data-pin-id="${CSS.escape(pinKey)}"]`) ?? null
      setAnchorEl((o) => (o === el ? o : el))
      positioningRef.current?.updatePosition()
    }
    find()
    const timer = window.setInterval(find, 200)
    return () => window.clearInterval(timer)
  }, [pinKey])
  const [target, setTarget] = useState<Element | PositioningVirtualElement | null>(null)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTarget(anchorEl ? anchorOf(anchorEl) : null)
  }, [anchorEl])
  return { target, positioningRef }
}
