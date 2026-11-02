import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Textarea, makeStyles, mergeClasses, tokens, type TextareaProps } from '@fluentui/react-components'
import { loadPref, savePref } from './settings'
import { textareaHeightKey } from './prefKeys'
import { getUiScale } from './uiScale'

type Props = TextareaProps & {
  /**
   * 高さを覚える鍵(欄の種類ごと。localStorage の `textarea.<heightKey>.height`)。
   * 渡さない欄も、端をつかんで高さを変えられる(開いている間だけ)
   */
  heightKey?: string
  /**
   * 高さを変えるつまみを、欄の上の端に置く(上に引くと上に伸びる)。高さの決まった枠のいちばん下に置く欄
   * (AI とのチャットの書く欄)では、下の端を引いても、伸びた分だけ上の記録が縮んで上の端が上がり、手の動きと逆になるため(2026-11-03 利用者)
   */
  growUp?: boolean
}

const useStyles = makeStyles({
  // 上の端のつまみを重ねるための枠(className は、この枠に付ける)
  upWrap: { position: 'relative', display: 'grid', minWidth: 0 },
  // 上の端のつまみ。乗せると、つかめると分かる短い線を出す
  upGrip: {
    position: 'absolute',
    top: '-3px',
    left: 0,
    right: 0,
    height: '8px',
    zIndex: 1,
    cursor: 'ns-resize',
    touchAction: 'none',
    '::after': {
      content: '""',
      position: 'absolute',
      top: '2px',
      left: 'calc(50% - 14px)',
      width: '28px',
      height: '3px',
      borderRadius: '2px',
      backgroundColor: tokens.colorNeutralStroke1,
      opacity: 0.6,
    },
    ':hover::after': { backgroundColor: tokens.colorBrandStroke1, opacity: 1 },
  },
})

/**
 * 内容の行数に合わせて高さが伸びる複数行入力(rows は最小の行数)。入力が見切れない。
 * 下の端をつかんで高さを変えられる(2026-10-23 利用者と決めた)。広げた高さは「最低の高さ」として覚え、それより文字が増えれば、さらに伸びる。
 * growUp なら、つまみは上の端(上に引くと上に伸びる)
 */
export function AutoTextarea({ value, rows = 1, textarea, heightKey, growUp = false, className, ...rest }: Props) {
  const s = useStyles()
  const ref = useRef<HTMLTextAreaElement>(null)
  const prefKey = heightKey ? textareaHeightKey(heightKey) : null
  // 人が決めた最低の高さ(px)。描画には使わないので ref で持つ(最初の値だけ、覚えた値から)
  const [savedMin] = useState(() => (prefKey ? loadPref<number>(prefKey, 0) : 0))
  const minHeight = useRef(savedMin)
  // つかんで高さを変えている間は、内容に合わせ直さない(合わせ直すと、つかんだ高さが戻ってしまう)
  const dragging = useRef(false)

  const fit = () => {
    const el = ref.current
    if (!el || dragging.current) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, minHeight.current)}px`
  }
  const remember = (h: number) => {
    minHeight.current = h
    if (prefKey) savePref(prefKey, h)
  }

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    fit()
    // 幅が変わると折り返しが変わるので、ペインの幅の変更にも追従する
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    if (growUp) return () => ro.disconnect()
    let startHeight = 0
    const down = () => {
      dragging.current = true
      startHeight = el.offsetHeight
    }
    const up = () => {
      if (!dragging.current) return
      dragging.current = false
      const h = el.offsetHeight
      // 高さが変わっていたら(下の端をつかんだ)、その高さを最低の高さとして覚える
      if (Math.abs(h - startHeight) > 2) remember(h)
      fit()
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointerup', up)
    return () => {
      ro.disconnect()
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointerup', up)
    }
    // fit・remember は ref だけを読む
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, prefKey, growUp])

  // 上の端のつまみ: 上に動かした分だけ高くする(下の端は動かない)
  const startGrowUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    e.preventDefault()
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)
    dragging.current = true
    const startY = e.clientY
    const startHeight = el.offsetHeight
    const move = (ev: PointerEvent) => {
      // 表示の大きさ(X60)を掛けた分、マウスの動きを中の大きさに直す
      const h = Math.max(32, startHeight + (startY - ev.clientY) / getUiScale())
      el.style.height = `${h}px`
    }
    const end = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', end)
      grip.removeEventListener('pointercancel', end)
      dragging.current = false
      if (Math.abs(el.offsetHeight - startHeight) > 2) remember(el.offsetHeight)
      fit()
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', end)
    grip.addEventListener('pointercancel', end)
  }

  const input = <Textarea {...rest} className={growUp ? undefined : className} value={value} rows={rows} resize={growUp ? 'none' : 'vertical'} textarea={{ ...(typeof textarea === 'object' ? textarea : {}), ref }} />
  if (!growUp) return input
  return (
    <div className={mergeClasses(s.upWrap, className)}>
      <div className={s.upGrip} aria-hidden onPointerDown={startGrowUp} title="" />
      {input}
    </div>
  )
}
