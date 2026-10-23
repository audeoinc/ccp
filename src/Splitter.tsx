import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { getUiScale } from './uiScale'

interface Props {
  /** ドラッグ中、ポインタの移動量(px)ごとに呼ばれる(左右の境目は横の動き、上下の境目は縦の動き) */
  onDrag: (delta: number) => void
  onDone?: () => void
  /** ドラッグを始めたとき(畳んだペインを開くときなど) */
  onStart?: () => void
  /** ダブルクリックで既定の幅・高さに戻す */
  onReset?: () => void
  /** 'col' は左右のペインの境目(既定)、'row' は上下のペインの境目 */
  direction?: 'col' | 'row'
  /** 読み上げと、ホバーの説明 */
  label?: string
}

const useStyles = makeStyles({
  root: {
    touchAction: 'none',
    position: 'relative',
    flexShrink: 0,
    backgroundColor: tokens.colorNeutralStroke2,
    transitionProperty: 'background-color',
    transitionDuration: tokens.durationFast,
    ':hover': { backgroundColor: tokens.colorBrandStroke1 },
    ':active': { backgroundColor: tokens.colorBrandStroke1 },
  },
  // 線は 1px のまま、つかめる所を両側に 3px 広げる
  col: {
    cursor: 'col-resize',
    width: '1px',
    // 並べる枠が上そろえ(align-items: start)でも、境目は上から下まで引く
    alignSelf: 'stretch',
    '::after': { content: '""', position: 'absolute', top: 0, bottom: 0, left: '-3px', right: '-3px' },
    // 狭い画面では、ペインが縦に並ぶので出さない
    '@media (max-width: 899px)': { display: 'none' },
  },
  // 上下の境目は、横の線だけでは動かせると気づきにくいので、中央に「つまみ」を付け、つかめる所も広めにする
  row: {
    cursor: 'row-resize',
    height: '1px',
    backgroundColor: tokens.colorNeutralStroke1,
    '::before': {
      content: '""',
      position: 'absolute',
      left: '50%',
      top: '-2px',
      width: '44px',
      height: '5px',
      marginLeft: '-22px',
      borderRadius: '3px',
      backgroundColor: tokens.colorNeutralStroke1Pressed,
      boxShadow: `0 0 0 2px ${tokens.colorNeutralBackground1}`,
    },
    '::after': { content: '""', position: 'absolute', left: 0, right: 0, top: '-6px', bottom: '-6px' },
    ':hover::before': { backgroundColor: tokens.colorBrandStroke1 },
  },
})

/** ペインの境目。ドラッグで幅(上下の境目なら高さ)を変える。左右の境目は 900px 以上でのみ表示 */
export function Splitter({ onDrag, onDone, onStart, onReset, direction = 'col', label }: Props) {
  const styles = useStyles()
  const row = direction === 'row'

  function start(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const el = e.currentTarget
    const id = e.pointerId
    el.setPointerCapture(id)
    const pos = (ev: { clientX: number; clientY: number }) => (row ? ev.clientY : ev.clientX)
    let last = pos(e)
    onStart?.()
    const move = (ev: PointerEvent) => {
      // 表示の大きさ(X60)を掛けた分、マウスの動きを中の大きさに直す
      onDrag((pos(ev) - last) / getUiScale())
      last = pos(ev)
    }
    // 捕まえたポインタを失ったとき(窓の外で離した・別の部品に移った)も終える。終わりを受け取れないと、ドラッグのまま残る(2026-10-23、開発用の画面で起きた)
    const end = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', end)
      el.removeEventListener('lostpointercapture', end)
      if (el.hasPointerCapture(id)) el.releasePointerCapture(id)
      onDone?.()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
    el.addEventListener('lostpointercapture', end)
  }

  return (
    <div
      role="separator"
      aria-orientation={row ? 'horizontal' : 'vertical'}
      aria-label={label}
      title={label}
      onPointerDown={start}
      onDoubleClick={onReset}
      className={mergeClasses(styles.root, row ? styles.row : styles.col)}
    />
  )
}
