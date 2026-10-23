import { forwardRef, useImperativeHandle, useRef, type ComponentProps } from 'react'
import { DialogSurface } from '@fluentui/react-components'
import { ResizeHandles } from './ResizeHandles'
import { useFloatSize, type FloatSize } from './floatLayout'

type Props = ComponentProps<typeof DialogSurface> & {
  /** 大きさを覚える鍵(フロートの種類ごと。localStorage の `float.<sizeKey>.size`) */
  sizeKey: string
  /** これより小さくしない(既定 420 × 280) */
  min?: FloatSize
}

/**
 * 大きさを変えられるフロート(2026-10-23 利用者と決めた: フロートは、すべて端・角をつかんで広げられ、大きさを種類ごとに覚える)。
 * DialogSurface の代わりに使う。辺・角のつまみ(ResizeHandles)と、大きさを覚える(floatLayout の useFloatSize)を、場所ごとに作らないためにまとめる。
 * ダブルクリックで既定の大きさに戻す。狭い画面(900px 未満)では、つまみを出さず、既定の大きさのまま。
 * 小さい確かめの窓・小さいポップアップは固定でよい(利用者に確かめ済み。ARCHITECTURE の「見た目の約束事」)
 */
export const ResizableSurface = forwardRef<HTMLDivElement, Props>(function ResizableSurface({ sizeKey, min = { w: 420, h: 280 }, style, children, ...rest }, ref) {
  const inner = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => inner.current as HTMLDivElement)
  const float = useFloatSize(`float.${sizeKey}.size`, inner, min)
  return (
    <DialogSurface ref={inner} {...rest} style={{ ...style, ...float.style }}>
      {children}
      <ResizeHandles {...float.handles} />
    </DialogSurface>
  )
})
