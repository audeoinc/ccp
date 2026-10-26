// テンプレートの編集のキャンバスの、操作の帯を置く部品(TemplateTableEditor.tsx。2026-10-26)
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

/**
 * 操作の帯を、選んだマスに付けて置く。選んだ範囲の左端にそろえ、右の端にはみ出すときは右の端にそろえる。
 * いちばん上の行のときは、マスの下に出す(上はセクションの見出しに重なるため)。位置は描いたあとに測る(マスの大きさは中身で変わるため)
 */
export function SelBar({ ids, below, className, layerClass, style, children }: { ids: string[]; below: boolean; className: string; layerClass: string; style: CSSProperties; children: ReactNode }) {
  const layer = useRef<HTMLDivElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const key = ids.join(' ')
  useLayoutEffect(() => {
    const el = layer.current
    const b = bar.current
    if (!el || !b) return
    const place = () => {
      const base = el.getBoundingClientRect()
      // キャンバスの拡大・縮小(transform)の分を割り戻す(getBoundingClientRect は拡大を含み、offsetWidth は含まない)
      const k = el.offsetWidth > 0 ? base.width / el.offsetWidth : 1
      const tbl = el.parentElement
      const rects = key
        .split(' ')
        .map((id) => tbl?.querySelector(`[data-cell="${CSS.escape(id)}"]`)?.getBoundingClientRect())
        .filter((r): r is DOMRect => !!r && r.width > 0)
      if (rects.length === 0) return
      const left = (Math.min(...rects.map((r) => r.left)) - base.left) / k
      const top = (Math.min(...rects.map((r) => r.top)) - base.top) / k
      const bottom = (Math.max(...rects.map((r) => r.bottom)) - base.top) / k
      const x = Math.max(0, Math.min(left, el.offsetWidth - b.offsetWidth))
      const y = below ? bottom + 4 : top - b.offsetHeight - 4
      setPos((p) => (p && p.left === x && p.top === y ? p : { left: x, top: y }))
    }
    place()
    // 表・選んだマス・帯の大きさが変わったら測り直す(行の高さは中身・写真の読み込みで変わり、フロートが開く途中でも動くため)。
    // 描いた次の時にも、もう一度測る(開く動きの途中で測った位置が残らないように)
    const ro = new ResizeObserver(place)
    ro.observe(el)
    ro.observe(b)
    if (el.parentElement) ro.observe(el.parentElement)
    for (const id of key.split(' ')) {
      const c = el.parentElement?.querySelector(`[data-cell="${CSS.escape(id)}"]`)
      if (c) ro.observe(c)
    }
    const raf = requestAnimationFrame(place)
    const late = window.setTimeout(place, 400)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
      window.clearTimeout(late)
    }
  }, [key, below])
  return (
    <div ref={layer} className={layerClass} style={style}>
      <div ref={bar} className={className} style={{ position: 'absolute', left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </div>
  )
}
