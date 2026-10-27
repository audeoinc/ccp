import { forwardRef, useImperativeHandle, useRef, type ComponentProps, type PointerEvent as ReactPointerEvent } from 'react'
import { DialogSurface, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ResizeHandles } from './ResizeHandles'
import { useFloatSize, type FloatSize } from './floatLayout'
import { floatSizeKey } from './prefKeys'
import { isGrabbable, useFloatMove } from './floatMove'
import { getUiScale } from './uiScale'

type Props = ComponentProps<typeof DialogSurface> & {
  /** 大きさを覚える鍵(フロートの種類ごと。localStorage の `float.<sizeKey>.size`) */
  sizeKey: string
  /** これより小さくしない(既定 420 × 280) */
  min?: FloatSize
  /** 以前から別の鍵で覚えていたフロート(配信カードの cardDetail.size・制作のページの productionPage.size)は、その鍵をそのまま使う(覚えた大きさを引き継ぐ) */
  prefKey?: string
  /** 画面いっぱいに広げる(覚えた大きさ・動かした位置は使わず、辺・角のつまみも出さない。BigFloat の切り替え) */
  maximized?: boolean
}

/**
 * 大きさを変えられるフロート(2026-10-23 利用者と決めた: フロートは、すべて端・角をつかんで広げられ、大きさを種類ごとに覚える)。
 * DialogSurface の代わりに使う。辺・角のつまみ(ResizeHandles)と、大きさを覚える(floatLayout の useFloatSize)を、場所ごとに作らないためにまとめる。
 * ダブルクリックで既定の大きさに戻す。狭い画面(900px 未満)では、つまみを出さず、既定の大きさのまま。
 * 小さい確かめの窓・小さいポップアップは固定でよい(利用者に確かめ済み。ARCHITECTURE の「見た目の約束事」)。
 * 題の行をつかむと動かせる(2026-10-26 利用者と決めた。floatMove)。題の行 = DialogTitle か data-float-title の付いた所、
 * なければフロートの上の端から GRAB px まで(フロートごとに題の行の作りが違うので、場所ごとに印を付けなくても動くように)
 */
const useStyles = makeStyles({
  // Fluent の既定の高さの上限(100vh)は、表示の大きさ(html の zoom)を掛けると画面の 70〜80% などになり、窓の枠が中身より短くなる。倍率で割って、画面いっぱいまでにする
  surface: { maxHeight: 'calc(100vh / var(--ui-zoom, 1))' },
})

/** 画面いっぱいの大きさ(表示の大きさ(zoom)で割って、画面の端から端まで) */
const FULL = { width: 'calc(100vw / var(--ui-zoom, 1))', height: 'calc(100vh / var(--ui-zoom, 1))', maxWidth: 'none', maxHeight: 'none', borderRadius: 0 } as const

/** 題の行とみなす、フロートの上の端からの高さ(px) */
const GRAB = 52

export const ResizableSurface = forwardRef<HTMLDivElement, Props>(function ResizableSurface({ sizeKey, min = { w: 420, h: 280 }, prefKey, maximized = false, style, className, children, ...rest }, ref) {
  const s = useStyles()
  const inner = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => inner.current as HTMLDivElement)
  const float = useFloatSize(prefKey ?? floatSizeKey(sizeKey), inner, min)
  const move = useFloatMove(inner)
  const inTitle = (e: { target: EventTarget | null; clientY: number }) => {
    const el = inner.current
    if (!el || !isGrabbable(e.target)) return false
    if ((e.target as Element).closest('.fui-DialogTitle, [data-float-title]')) return true
    return e.clientY - el.getBoundingClientRect().top <= GRAB * getUiScale()
  }
  return (
    <DialogSurface
      ref={inner}
      {...rest}
      className={mergeClasses(s.surface, className)}
      style={maximized ? { ...style, ...FULL } : { ...style, ...float.style, ...move.style }}
      onPointerDown={(e: ReactPointerEvent<HTMLDivElement>) => {
        rest.onPointerDown?.(e)
        if (!maximized && !e.defaultPrevented && inTitle(e)) move.startMove(e)
      }}
      // 題の行に乗せたら、動かせると分かるカーソルに
      onPointerMove={(e: ReactPointerEvent<HTMLDivElement>) => {
        rest.onPointerMove?.(e)
        if (e.buttons === 0 && inner.current) inner.current.style.cursor = !maximized && inTitle(e) ? 'move' : ''
      }}
    >
      {children}
      {!maximized && <ResizeHandles {...float.handles} />}
    </DialogSurface>
  )
})
