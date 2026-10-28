// プレビューのセクションの名札(2026-10-28 利用者)。セクションにマウスを乗せると、枠の左上に「グリッド・4 枠」の札を出し、押すとセクションの全体を選ぶ。
// セクションの中を押すと中の部品(見出し・商品)が選ばれるので、セクションの全体を選ぶ入口をここに分ける(デザインのツールのフレーム名と同じ形)
import { useEffect, useState, type RefObject } from 'react'
import { Button, makeStyles, tokens } from '@fluentui/react-components'
import { useT } from '../i18n'
import type { SectionInfo } from '../templates'
import type { PartRef } from './parts'

const useStyles = makeStyles({
  // 層は押せない(押すのは下のプレビュー)。札だけ押せる。部品を選ぶ層・光の枠より上
  layer: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', zIndex: 5 },
  tag: {
    position: 'absolute',
    pointerEvents: 'auto',
    minWidth: 0,
    height: '20px',
    paddingLeft: '6px',
    paddingRight: '6px',
    fontSize: tokens.fontSizeBase100,
    whiteSpace: 'nowrap',
    boxShadow: tokens.shadow4,
  },
})

interface Rect {
  left: number
  top: number
}

const TAG_H = 22

/** プレビューの枠(boxRef)の中のセクション(data-anchor="section:N")に、名札を重ねる */
export function SectionTagLayer({ boxRef, sections, selected, onSelect, disabled }: { boxRef: RefObject<HTMLDivElement | null>; sections: SectionInfo[]; selected: PartRef | null; onSelect: (p: PartRef) => void; disabled?: boolean }) {
  const s = useStyles()
  const t = useT()
  const [hover, setHover] = useState<number | null>(null)
  // セクションの全体を選んでいるあいだは、マウスが離れても札を出したままにする
  const pinned = selected?.kind === 'section' ? selected.index : null
  const index = hover ?? pinned
  const [rect, setRect] = useState<Rect | null>(null)

  useEffect(() => {
    const box = boxRef.current
    if (!box || disabled) return
    const onMove = (e: MouseEvent) => {
      const target = e.target as Element
      // 札の上では、そのセクションに乗せたままにする(札はセクションの外の層にあるため)
      if (target.closest('[data-section-tag]')) return
      const el = target.closest('[data-anchor^="section:"]')
      const n = el && box.contains(el) ? Number(el.getAttribute('data-anchor')?.split(':')[1]) : NaN
      setHover(Number.isInteger(n) ? n : null)
    }
    const onLeave = () => setHover(null)
    box.addEventListener('mousemove', onMove)
    box.addEventListener('mouseleave', onLeave)
    return () => {
      box.removeEventListener('mousemove', onMove)
      box.removeEventListener('mouseleave', onLeave)
    }
  }, [boxRef, disabled])

  useEffect(() => {
    if (index === null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRect(null)
      return
    }
    // 位置は、プレビューの中身・倍率・スクロールで変わるので、出しているあいだは測り直す(光の枠と同じ計算)
    const update = () => {
      const box = boxRef.current
      const el = box?.querySelector(`[data-anchor="section:${index}"]`)
      if (!box || !el) return setRect(null)
      const b = box.getBoundingClientRect()
      const k = box.offsetWidth > 0 ? b.width / box.offsetWidth : 1
      const r = el.getBoundingClientRect()
      const top = (r.top - b.top) / k + box.scrollTop
      // 枠の上の外側に出す。上に余白がなければ、枠の内側に
      const next = { left: (r.left - b.left) / k + box.scrollLeft, top: top >= TAG_H + box.scrollTop ? top - TAG_H : top + 2 }
      setRect((old) => (old && old.left === next.left && old.top === next.top ? old : next))
    }
    update()
    const id = window.setInterval(update, 300)
    return () => window.clearInterval(id)
  }, [index, boxRef])

  const sec = index !== null ? sections[index] : undefined
  if (!rect || !sec || disabled) return null
  const label = Number.isFinite(sec.slots) ? t(`${sec.label}・${sec.slots} 枠`, `${sec.label} · ${sec.slots} slots`) : sec.label
  return (
    <div className={s.layer}>
      <Button
        data-section-tag
        data-no-pick
        className={s.tag}
        style={rect}
        size="small"
        shape="rounded"
        appearance={pinned === index ? 'primary' : 'secondary'}
        title={t('押すと、このセクションの全体を選びます', 'Click to select this whole section')}
        onClick={() => onSelect({ kind: 'section', index: index! })}
      >
        {label}
      </Button>
    </div>
  )
}
