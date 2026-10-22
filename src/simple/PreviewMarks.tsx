import { useEffect, useState, type RefObject } from 'react'
import { Tooltip, makeStyles, tokens } from '@fluentui/react-components'
import { partElement, partKey, type PartRef } from './parts'

const DOT = 10

const useStyles = makeStyles({
  // プレビューの枠の中に重ねる。層は押せない(点だけ押せる)。部品を選ぶ層より上、ピン・アラートの印と同じ高さ
  layer: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', zIndex: 4 },
  dot: {
    position: 'absolute',
    width: `${DOT}px`,
    height: `${DOT}px`,
    marginLeft: `-${DOT / 2}px`,
    marginTop: `-${DOT / 2}px`,
    padding: 0,
    borderRadius: '50%',
    border: `2px solid ${tokens.colorNeutralBackground1}`,
    boxShadow: tokens.shadow4,
    cursor: 'pointer',
    pointerEvents: 'auto',
  },
})

/** 目印の 1 つ(部品と、色・説明) */
export interface Mark {
  part: PartRef
  color: string
  label: string
}

/**
 * プレビューの部品の右上に置く、小さな目印の点(SU1 ⑭)。目印の種類ごとに出し分けるのは、画面の側(「目印」の切り替え)。
 * プレビューの部品そのものは変えず、目印(data-part・data-item-key)を読んで重ねる(ピン・アラートの印と同じやり方)。点を押すと、その部品を選ぶ
 */
export function PreviewMarks({ boxRef, marks, onSelect }: { boxRef: RefObject<HTMLDivElement | null>; marks: Mark[]; onSelect: (p: PartRef) => void }) {
  const s = useStyles()
  const [spots, setSpots] = useState<{ key: string; left: number; top: number; mark: Mark }[]>([])
  const marksKey = marks.map((m) => `${partKey(m.part)}|${m.color}`).join(',')

  // 位置は、プレビューの中身・倍率・枠の大きさで変わるので、間隔を空けて測り直す
  useEffect(() => {
    const update = () => {
      const box = boxRef.current
      if (!box) return
      const b = box.getBoundingClientRect()
      const k = box.offsetWidth > 0 ? b.width / box.offsetWidth : 1
      // 同じ部品に 2 つ以上の目印があるときは、左へずらして並べる
      const count = new Map<string, number>()
      const next = marks.flatMap((mark) => {
        const el = partElement(box, mark.part)
        if (!el) return []
        const r = el.getBoundingClientRect()
        if (r.width === 0 && r.height === 0) return []
        const pk = partKey(mark.part)
        const n = count.get(pk) ?? 0
        count.set(pk, n + 1)
        return [{ key: `${pk}#${n}`, left: (r.right - b.left) / k + box.scrollLeft - 6 - n * (DOT + 2), top: (r.top - b.top) / k + box.scrollTop + 6, mark }]
      })
      setSpots((old) => (JSON.stringify(old.map((x) => [x.key, x.left, x.top])) === JSON.stringify(next.map((x) => [x.key, x.left, x.top])) ? old : next))
    }
    update()
    const timer = window.setInterval(update, 400)
    return () => window.clearInterval(timer)
    // marks は marksKey に畳んでいる(描画のたびに作り直される配列のため)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marksKey, boxRef])

  return (
    <div className={s.layer} data-no-pick>
      {spots.map((x) => (
        <Tooltip key={x.key} content={x.mark.label} relationship="label">
          <button type="button" className={s.dot} style={{ left: x.left, top: x.top, backgroundColor: x.mark.color }} onClick={() => onSelect(x.mark.part)} />
        </Tooltip>
      ))}
    </div>
  )
}
