import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { partElement, partFromElement, partKey, partsInOrder, samePart, type PartRef } from './simple/parts'

const useStyles = makeStyles({
  // プレビューの枠(スクロールする箱)の中に重ねる。層は押せない(押すのは下のプレビュー)
  layer: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', zIndex: 3 },
  box: { position: 'absolute', borderRadius: tokens.borderRadiusMedium, boxSizing: 'border-box' },
  // 淡い色は、下の文字が読めるよう、薄く重ねる(色はテーマの色)
  selected: {
    border: `2px solid ${tokens.colorBrandStroke1}`,
    boxShadow: `0 0 0 3px ${tokens.colorBrandBackground2}`,
    '::before': { content: '""', position: 'absolute', inset: 0, borderRadius: 'inherit', backgroundColor: tokens.colorBrandBackground2, opacity: 0.35 },
  },
  hover: { border: `1px dashed ${tokens.colorBrandStroke2}` },
})

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

interface Props {
  /** プレビューの枠(スクロールする箱。position: relative) */
  boxRef: RefObject<HTMLDivElement | null>
  selected: PartRef | null
  onSelect: (p: PartRef | null) => void
  /** 選べないとき(保存中・ほかの層で場所を選んでいる間など) */
  disabled?: boolean
}

/**
 * プレビューの部品を押して選ぶ層(SU1。docs/SIMPLE_CARD.md の 5 章)。プレビューの目印(data-item-key・data-part・data-anchor)を読むだけで、
 * プレビューの部品そのものは変えない(書き込みのピン PreviewPins と同じ作り。制作のページ・結果でも使えるように、配信カードには依存しない)。
 * 選んだ部品には枠と淡い色、マウスを乗せた部品には薄い枠を重ねる。Tab / Shift+Tab で次・前の部品、Esc で選ぶのをやめる
 */
export function PreviewPartPicker({ boxRef, selected, onSelect, disabled }: Props) {
  const s = useStyles()
  const [hover, setHover] = useState<PartRef | null>(null)
  const [rects, setRects] = useState<{ sel: Rect | null; hover: Rect | null }>({ sel: null, hover: null })
  const selectedRef = useRef(selected)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])

  /** 要素の外形を、箱の中の位置に直す(表示の大きさ X60 で縮んでいても、本来の大きさで。ピンと同じ計算) */
  const rectOf = useCallback(
    (p: PartRef | null): Rect | null => {
      const box = boxRef.current
      const el = p && box ? partElement(box, p) : null
      if (!box || !el) return null
      const b = box.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return null
      const k = box.offsetWidth > 0 ? b.width / box.offsetWidth : 1
      return { left: (r.left - b.left) / k + box.scrollLeft, top: (r.top - b.top) / k + box.scrollTop, width: r.width / k, height: r.height / k }
    },
    [boxRef],
  )

  // 位置は、プレビューの中身・倍率・枠の大きさで変わるので、間隔を空けて測り直す(ピン・アラートの印と同じ)
  useEffect(() => {
    const update = () => {
      const next = { sel: rectOf(selected), hover: hover && !samePart(hover, selected) ? rectOf(hover) : null }
      setRects((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next))
    }
    update()
    const timer = window.setInterval(update, 300)
    return () => window.clearInterval(timer)
  }, [selected, hover, rectOf])

  // 選んだ部品が見えるようにスクロールする(画面の外に出ないように)
  const selKey = selected ? partKey(selected) : ''
  useEffect(() => {
    const box = boxRef.current
    if (!box || !selectedRef.current) return
    partElement(box, selectedRef.current)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selKey, boxRef])

  // 押した所・マウスの下の部品を見分ける。プレビューの側の押したときの動き(商品を選ぶ など)は、そのまま動かす
  useEffect(() => {
    const box = boxRef.current
    if (!box || disabled) return
    const onClick = (e: MouseEvent) => {
      // 重ねた印(アラートなど)と、プレビューの中の操作のボタン(iOS / Android の切り替えなど)は、部品を選び直さない
      if ((e.target as Element).closest('[data-no-pick], button')) return
      const p = partFromElement(e.target as Element, box)
      onSelect(p)
    }
    const onMove = (e: MouseEvent) => {
      const p = partFromElement(e.target as Element, box)
      setHover((old) => (samePart(old, p) ? old : p))
    }
    const onLeave = () => setHover(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 配信カード(ダイアログ)が閉じないように、ここで止める
        e.stopPropagation()
        e.preventDefault()
        onSelect(null)
        return
      }
      if (e.key !== 'Tab') return
      const list = partsInOrder(box)
      if (list.length === 0) return
      e.preventDefault()
      const cur = selectedRef.current ? list.findIndex((p) => samePart(p, selectedRef.current)) : -1
      const next = cur < 0 ? (e.shiftKey ? list.length - 1 : 0) : (cur + (e.shiftKey ? -1 : 1) + list.length) % list.length
      onSelect(list[next])
    }
    box.addEventListener('click', onClick)
    box.addEventListener('mousemove', onMove)
    box.addEventListener('mouseleave', onLeave)
    box.addEventListener('keydown', onKey)
    return () => {
      box.removeEventListener('click', onClick)
      box.removeEventListener('mousemove', onMove)
      box.removeEventListener('mouseleave', onLeave)
      box.removeEventListener('keydown', onKey)
    }
  }, [boxRef, disabled, onSelect])

  return (
    <div className={s.layer} aria-hidden>
      {rects.hover && <div className={mergeClasses(s.box, s.hover)} style={rects.hover} />}
      {rects.sel && <div className={mergeClasses(s.box, s.selected)} style={rects.sel} />}
    </div>
  )
}
