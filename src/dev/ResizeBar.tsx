import { useRef } from 'react'
import { makeStyles } from '@fluentui/react-components'
import { Splitter } from '../Splitter'

const useStyles = makeStyles({
  // 境目そのものは画面と同じ Splitter(上下の向き)。前のつまみと同じ 8px の間を残し、上下のペインの間隔を変えない
  bar: {
    height: '8px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
})

interface Props {
  height: number
  onHeight: (h: number) => void
  min?: number
  max?: number
  /** ダブルクリックで戻す高さ */
  reset?: number
}

/** 高さを変える境目(上のペインのすぐ下に置く) */
export function ResizeBar({ height, onHeight, min = 80, max = 2000, reset }: Props) {
  const s = useStyles()
  // Splitter は動いた分ずつ知らせるので、始めたときの高さに足していく
  const drag = useRef({ h0: height, dy: 0 })
  return (
    <div className={s.bar}>
      <Splitter
        direction="row"
        label={reset ? 'ドラッグで高さを変える(ダブルクリックで元に戻す)' : 'ドラッグで高さを変える'}
        onStart={() => (drag.current = { h0: height, dy: 0 })}
        onDrag={(d) => {
          drag.current.dy += d
          onHeight(Math.min(Math.max(drag.current.h0 + drag.current.dy, min), max))
        }}
        onReset={reset ? () => onHeight(reset) : undefined}
      />
    </div>
  )
}
