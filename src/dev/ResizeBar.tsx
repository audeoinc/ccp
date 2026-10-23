import { makeStyles, tokens } from '@fluentui/react-components'
import { startDrag } from './drag'

const useStyles = makeStyles({
  // 上のペインの下の境目。ドラッグで上のペインの高さを変える(左右のペインの境目と同じ見た目・動き)
  bar: {
    height: '8px',
    flexShrink: 0,
    cursor: 'row-resize',
    touchAction: 'none',
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ':hover': { backgroundColor: tokens.colorNeutralStroke2 },
    '::after': { content: '""', width: '36px', height: '2px', borderRadius: '1px', backgroundColor: tokens.colorNeutralStroke1 },
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
  return (
    <div
      className={s.bar}
      role="separator"
      aria-orientation="horizontal"
      title={reset ? 'ドラッグで高さを変える(ダブルクリックで元に戻す)' : 'ドラッグで高さを変える'}
      onPointerDown={(e) => {
        const h0 = height
        startDrag(e, (_, dy) => onHeight(Math.min(Math.max(h0 + dy, min), max)))
      }}
      onDoubleClick={() => reset && onHeight(reset)}
    />
  )
}
