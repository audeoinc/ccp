import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Button, Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { ArrowSwapRegular, LockClosedRegular } from '@fluentui/react-icons'
import { useT } from './i18n'
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
  // テンプレートで決まっていて、この配信では中身を直せない部品(ボタンの文言・テンプレートの画像・文)。うすい点線と鍵の印(レビューの 9)
  locked: { border: `1px dotted ${tokens.colorNeutralStroke1}` },
  lock: { position: 'absolute', top: '2px', right: '2px', display: 'inline-flex', padding: '2px', borderRadius: tokens.borderRadiusSmall, backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground3, fontSize: '12px' },
  // 商品の枠の右上の「入れ替える」(SU9)。層は押せないので、この印だけ押せるようにする
  swap: { position: 'absolute', pointerEvents: 'auto', boxShadow: tokens.shadow8 },
})

/** 中身がテンプレートで決まっている部品(ボタン・テンプレートの画像・文。リンク先は、ボタンと画像は配信ごとに決められる) */
const lockedPart = (p: PartRef) => p.kind === 'button' || p.kind === 'image' || p.kind === 'text'

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
  /** 商品の枠にマウスを乗せたとき、右上に「入れ替える」(⇄)を出す(SU9。シンプルな配信カード) */
  onSwap?: (itemKey: string) => void
  /** 部品を選んでいるときに Enter: その部品のペインの入力欄へ移る */
  onEnter?: () => void
}

/**
 * プレビューの部品を押して選ぶ層(SU1。docs/SIMPLE_CARD.md の 5 章)。プレビューの目印(data-item-key・data-part・data-anchor)を読むだけで、
 * プレビューの部品そのものは変えない(書き込みのピン PreviewPins と同じ作り。制作のページ・結果でも使えるように、配信カードには依存しない)。
 * 選んだ部品には枠と淡い色、マウスを乗せた部品には薄い枠を重ねる。Tab / Shift+Tab で次・前の部品、Esc で選ぶのをやめる
 */
export function PreviewPartPicker({ boxRef, selected, onSelect, disabled, onSwap, onEnter }: Props) {
  const s = useStyles()
  const onEnterRef = useRef(onEnter)
  useEffect(() => {
    onEnterRef.current = onEnter
  })
  const t = useT()
  const [hover, setHover] = useState<PartRef | null>(null)
  const [rects, setRects] = useState<{ sel: Rect | null; hover: Rect | null; swap: Rect | null }>({ sel: null, hover: null, swap: null })
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
      // 入れ替えの印は、選んでいる商品にマウスを乗せたときも出す
      const next = { sel: rectOf(selected), hover: hover && !samePart(hover, selected) ? rectOf(hover) : null, swap: onSwap && hover?.kind === 'product' && !disabled ? rectOf(hover) : null }
      setRects((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next))
    }
    update()
    const timer = window.setInterval(update, 300)
    return () => window.clearInterval(timer)
  }, [selected, hover, rectOf, onSwap, disabled])

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
      // 入れ替えの印の上では、その商品に乗せたままにする(印は商品の枠の外の層にあるため)
      if ((e.target as Element).closest('[data-swap-badge]')) return
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
      // Enter で、選んだ部品のペインへ移る(直す欄に入る)
      if (e.key === 'Enter') {
        if (!selectedRef.current || !onEnterRef.current) return
        e.preventDefault()
        onEnterRef.current()
        return
      }
      // ↑ ↓ で、前・次の部品へ(端では止まる)。Tab はプレビューから出る(以前は Tab で部品を回り、プレビューの外へ出られなかった。レビューの 6)
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const list = partsInOrder(box)
      if (list.length === 0) return
      e.preventDefault()
      const up = e.key === 'ArrowUp'
      const cur = selectedRef.current ? list.findIndex((p) => samePart(p, selectedRef.current)) : -1
      const next = cur < 0 ? (up ? list.length - 1 : 0) : Math.min(list.length - 1, Math.max(0, cur + (up ? -1 : 1)))
      onSelect(list[next])
      // 選んだ部品のペインの入力欄が、開いたときに選ばれる(autoFocus)ので、キーで動かしているときは、プレビューに戻す(続けて ↑ ↓ を押せるように)
      window.setTimeout(() => box.focus({ preventScroll: true }), 0)
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
    <div className={s.layer}>
      {rects.hover && (
        <div className={mergeClasses(s.box, hover && lockedPart(hover) ? s.locked : s.hover)} style={rects.hover} aria-hidden>
          {hover && lockedPart(hover) && (
            <span className={s.lock}>
              <LockClosedRegular />
            </span>
          )}
        </div>
      )}
      {rects.sel && <div className={mergeClasses(s.box, s.selected)} style={rects.sel} aria-hidden />}
      {rects.swap && hover?.kind === 'product' && (
        <Tooltip content={t('入れ替える', 'Replace')} relationship="label">
          <Button
            data-swap-badge
            data-no-pick
            className={s.swap}
            style={{ left: rects.swap.left + rects.swap.width - 34, top: rects.swap.top + 6 }}
            size="small"
            shape="circular"
            appearance="primary"
            icon={<ArrowSwapRegular />}
            onClick={() => onSwap?.(hover.itemKey)}
          />
        </Tooltip>
      )}
    </div>
  )
}
