import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { getUiScale } from './uiScale'

/** ドラッグできる辺・角 */
type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface Props {
  /** ドラッグ中、幅・高さの変化量(px)ごとに呼ばれる */
  onResize: (dw: number, dh: number) => void
  onDone?: () => void
  /** ダブルクリックで、既定の大きさに戻す */
  onReset?: () => void
}

const EDGE = 6 // 掴める幅(px)
const useStyles = makeStyles({
  base: { position: 'absolute', zIndex: 20, touchAction: 'none', '@media (max-width: 899px)': { display: 'none' } },
  n: { top: 0, left: `${EDGE}px`, right: `${EDGE}px`, height: `${EDGE}px`, cursor: 'ns-resize' },
  s: { bottom: 0, left: `${EDGE}px`, right: `${EDGE}px`, height: `${EDGE}px`, cursor: 'ns-resize' },
  e: { right: 0, top: `${EDGE}px`, bottom: `${EDGE}px`, width: `${EDGE}px`, cursor: 'ew-resize' },
  w: { left: 0, top: `${EDGE}px`, bottom: `${EDGE}px`, width: `${EDGE}px`, cursor: 'ew-resize' },
  ne: { top: 0, right: 0, width: `${EDGE * 2}px`, height: `${EDGE * 2}px`, cursor: 'nesw-resize' },
  sw: { bottom: 0, left: 0, width: `${EDGE * 2}px`, height: `${EDGE * 2}px`, cursor: 'nesw-resize' },
  nw: { top: 0, left: 0, width: `${EDGE * 2}px`, height: `${EDGE * 2}px`, cursor: 'nwse-resize' },
  se: { bottom: 0, right: 0, width: `${EDGE * 2}px`, height: `${EDGE * 2}px`, cursor: 'nwse-resize' },
})

/**
 * ダイアログの辺と角に置く、大きさを変えるつまみ。
 * ダイアログは画面の中央に置いているので、両側が同時に広がる。つまみがポインタに付いてくるよう、移動量の 2 倍を変化量にする。
 */
export function ResizeHandles({ onResize, onDone, onReset }: Props) {
  const styles = useStyles()

  const start = (edge: Edge) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    let lastX = e.clientX
    let lastY = e.clientY
    const sx = edge.includes('e') ? 2 : edge.includes('w') ? -2 : 0
    const sy = edge.includes('s') ? 2 : edge.includes('n') ? -2 : 0
    const move = (ev: PointerEvent) => {
      // 表示の大きさ(X60)を掛けた分、マウスの動きを中の大きさに直す
      onResize(((ev.clientX - lastX) * sx) / getUiScale(), ((ev.clientY - lastY) * sy) / getUiScale())
      lastX = ev.clientX
      lastY = ev.clientY
    }
    const end = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', end)
      onDone?.()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
  }

  return (
    <>
      {EDGES.map((edge) => (
        <div key={edge} aria-hidden className={mergeClasses(styles.base, styles[edge])} onPointerDown={start(edge)} onDoubleClick={onReset} />
      ))}
    </>
  )
}
