// プレビューのセクションに重ねる光の枠(光らせるセクションは sectionGlow.ts)
import { useEffect, useState, type RefObject } from 'react'
import { makeStyles, tokens } from '@fluentui/react-components'
import { setSectionGlow, useGlowing } from './sectionGlow'

const useStyles = makeStyles({
  // プレビューの中身は変えず、上に重ねる(押せない。部品を選ぶ層より上)
  glow: {
    position: 'absolute',
    pointerEvents: 'none',
    zIndex: 4,
    borderRadius: tokens.borderRadiusMedium,
    outline: `2px solid ${tokens.colorBrandStroke1}`,
    boxShadow: `0 0 0 4px ${tokens.colorBrandBackground2}`,
  },
})

/** プレビューの枠(boxRef)の中の、光らせるセクション(data-anchor="section:N")に枠を重ねる */
export function SectionGlowLayer({ boxRef }: { boxRef: RefObject<HTMLDivElement | null> }) {
  const s = useStyles()
  const index = useGlowing()
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  useEffect(() => {
    if (index === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null)
      return
    }
    // 位置は、プレビューの中身・倍率・スクロールで変わるので、光らせているあいだは測り直す
    const update = () => {
      const box = boxRef.current
      const el = box?.querySelector(`[data-anchor="section:${index}"]`)
      if (!box || !el) return setRect(null)
      const b = box.getBoundingClientRect()
      const k = box.offsetWidth > 0 ? b.width / box.offsetWidth : 1
      const r = el.getBoundingClientRect()
      const next = { left: (r.left - b.left) / k + box.scrollLeft, top: (r.top - b.top) / k + box.scrollTop, width: r.width / k, height: r.height / k }
      setRect((old) => (old && old.left === next.left && old.top === next.top && old.width === next.width && old.height === next.height ? old : next))
    }
    update()
    // 見えていなければ、そのセクションが見える所までスクロールする
    boxRef.current?.querySelector(`[data-anchor="section:${index}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    const id = window.setInterval(update, 300)
    return () => window.clearInterval(id)
  }, [index, boxRef])
  // プレビューが消えたとき(カードを閉じたなど)に、光が残らないように
  useEffect(() => () => setSectionGlow(null), [])
  return rect ? <div className={s.glow} style={rect} /> : null
}
