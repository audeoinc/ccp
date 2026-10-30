// プレビューの倍率(15〜120%。'fit' はメール全体が枠に収まる倍率に自動で合わせる)。
// 配信カード(CardDetail)と制作のシンプルな画面(X86)で同じものを使う。倍率は画面ごとの鍵で覚える
import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { loadPref, savePref } from '../settings'
import type { PreviewZoom } from './usePreviewNav'

export const ZOOM_MIN = 0.15 // 長いテンプレートも、「全体」で収まるように、小さくできる
export const ZOOM_MAX = 1.2

/** 覚えた倍率: 数値(1 = 現在のサイズ)または 'fit'。読めなければ、既定のメール全体が見える倍率(作り始めに、構成の全体を見渡せるように) */
function loadZoom(key: string): number | 'fit' {
  const v = loadPref<unknown>(key, null)
  if (v === 'fit') return 'fit'
  if (typeof v === 'number' && v >= ZOOM_MIN && v <= ZOOM_MAX) return v
  return 'fit'
}

/**
 * boxRef = スクロールする枠、innerRef = 倍率をかける中身(最初の子がメール)。remeasure が変わったら測り直す(チャネルの切り替えなど)。
 * 中身には style={{ zoom: zoom.mode === 'fit' ? undefined : zoom.mode }} を付ける('fit' のときは、ここで直接かける)
 */
export function usePreviewZoom(boxRef: RefObject<HTMLDivElement | null>, innerRef: RefObject<HTMLDivElement | null>, key: string, remeasure?: unknown): PreviewZoom {
  const [zoom, setZoom] = useState<number | 'fit'>(() => loadZoom(key))
  const [fitZoom, setFitZoom] = useState(1)
  useEffect(() => {
    savePref(key, zoom)
  }, [key, zoom])

  // 全体表示: 倍率 1 での高さを測り、プレビューの枠に収まる倍率を求める(内容や窓の大きさが変わったら、測り直す)。
  // 内容の変化は、中身の大きさの変化で知る(文言・商品などを effect の依存に並べると、打つたびに測り直し、並べ忘れると測り直さないため)
  useLayoutEffect(() => {
    const box = boxRef.current
    const inner = innerRef.current
    if (zoom !== 'fit' || !box || !inner) return
    const calc = () => {
      // いちばん小さい倍率で測る(倍率 1 で測ると、枠の幅でメールが細くなり、そのぶん背も低く測れる。小さい倍率をかけると、
      // メールは本来の幅(PC 640px など)に広がって背が伸び、収まらずにスクロールが出ていた。2026-10-30 制作の画面で利用者が見つけた)。
      // offsetHeight / offsetWidth は、自分にかけた zoom を含まない大きさなので、そのまま使える
      inner.style.zoom = String(ZOOM_MIN)
      const h = inner.offsetHeight
      // 高さだけでなく、幅にも収める(ペインを狭めたとき、横にはみ出さないように)
      const w = (inner.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0
      // 枠の余白は画面ごとに違うので、決め打ちせず、枠の実際の余白を引く(制作の画面は上下 32px で、決め打ちの 16px ではスクロールが出た)
      const cs = getComputedStyle(box)
      const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
      const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0)
      const byHeight = h > 0 ? (box.clientHeight - padY - 4) / h : 1
      const byWidth = w > 0 ? (box.clientWidth - padX - 4) / w : 1
      const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, byHeight, byWidth))
      inner.style.zoom = String(z)
      setFitZoom(z)
    }
    calc()
    const ro = new ResizeObserver(calc)
    ro.observe(box)
    // 中身(倍率をかける前のメール)の大きさ。倍率を変えても、この大きさは変わらないので、測り直しが続くことはない
    const content = inner.firstElementChild
    if (content) ro.observe(content)
    return () => {
      ro.disconnect()
      inner.style.zoom = ''
    }
  }, [zoom, remeasure, boxRef, innerRef])

  const shown = zoom === 'fit' ? fitZoom : zoom
  return { mode: zoom, shown, set: setZoom, min: ZOOM_MIN, max: ZOOM_MAX, step: (d: number) => setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round((shown + d) * 20) / 20))) }
}
