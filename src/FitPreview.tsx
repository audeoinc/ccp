import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { viewHeight } from './uiScale'

/**
 * 中身(メールのプレビュー)を、スクロールせずに全体が見える大きさに縮めて表示する。
 * 週の表示の「プレビュー」(マウスを重ねたとき)で使う。細かく見るときは、配信カードを開く。
 * 中身の本来の高さを測り、画面の高さ(maxHeight)と幅(maxWidth)に収まる倍率を求める。画像の読み込みで高さが変わっても、合わせ直す。
 */
export function FitPreview({ children, width = 600, maxWidth = 380, maxHeight }: { children: ReactNode; width?: number; maxWidth?: number; maxHeight?: number }) {
  const inner = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  useLayoutEffect(() => {
    const el = inner.current
    if (!el) return
    const measure = () => setHeight(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const limitH = maxHeight ?? Math.round(viewHeight() * 0.88)
  const scale = height > 0 ? Math.min(maxWidth / width, limitH / height) : maxWidth / width
  return (
    <div style={{ width: width * scale, height: height * scale, overflow: 'hidden', backgroundColor: '#ffffff' }}>
      {/* transform は、レイアウト上の大きさを変えないので、外側の箱を、縮めた大きさにしておく */}
      <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  )
}
