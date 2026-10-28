// プレビューのセクションの名札(2026-10-28 利用者)。どのセクションにも、枠の左上に「グリッド・4 枠」の札を出し、押すとセクションの全体を選ぶ。
// セクションの中を押すと中の部品(見出し・商品)が選ばれるので、セクションの全体を選ぶ入口をここに分ける(デザインのツールのフレーム名と同じ形)。
// 札は、いつも薄く出す(乗せたときだけ出すと、出たことに気づかず、札へ動かす途中で消えた)。乗せているセクションは、札を濃くし、全体に点線の枠を付ける
import { useEffect, useRef, useState, type RefObject } from 'react'
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
    fontWeight: tokens.fontWeightRegular,
    height: '18px',
    lineHeight: '16px',
    paddingLeft: '6px',
    paddingRight: '6px',
    boxSizing: 'border-box',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase100,
    whiteSpace: 'nowrap',
    opacity: 0.85,
    // 押せる範囲を札の見た目より少し広げる(小さい札を狙わなくてよいように)
    '::before': { content: '""', position: 'absolute', inset: '-6px -8px' },
  },
  // 乗せているセクションの全体(どこまでがそのセクションか)。中の部品の枠より外側に、薄い点線で
  outline: { position: 'absolute', boxSizing: 'border-box', border: `1px dashed ${tokens.colorBrandStroke2}`, borderRadius: tokens.borderRadiusMedium },
})

interface Rect {
  left: number
  top: number
  width: number
  height: number
  /** メールの本文の左の境界(札の右端をここに付ける) */
  edge: number
  /** 札の幅(左に余白が足りないときに、切れないよう寄せるため) */
  tagW: number
}

// 乗せている札は濃く(青の枠線)、選んでいる札は青で塗る。Button の見た目の決まり(appearance)より確実に勝たせるため、style で当てる
const TAG_HOVER = { opacity: 1, borderColor: tokens.colorBrandStroke1, backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorBrandForeground1, boxShadow: tokens.shadow4 }
const TAG_ON = { opacity: 1, borderColor: tokens.colorBrandBackground, backgroundColor: tokens.colorBrandBackground, color: tokens.colorNeutralForegroundOnBrand }
// 札をセクションの上端からどれだけ上に出すか(札の高さ 18px のうち、ほとんどをセクションの間の余白に)
const TAG_RISE = 14
// マウスが離れてから札を戻すまで(札へ動かす途中で消えないように)
const LEAVE_MS = 500

/** プレビューの枠(boxRef)の中のセクション(data-anchor="section:N")に、名札を重ねる */
export function SectionTagLayer({ boxRef, sections, selected, onSelect, disabled }: { boxRef: RefObject<HTMLDivElement | null>; sections: SectionInfo[]; selected: PartRef | null; onSelect: (p: PartRef) => void; disabled?: boolean }) {
  const s = useStyles()
  const t = useT()
  const [hover, setHover] = useState<number | null>(null)
  const leaveTimer = useRef<number | undefined>(undefined)
  const on = selected?.kind === 'section' ? selected.index : null
  const [rects, setRects] = useState<Map<number, Rect>>(new Map())

  useEffect(() => {
    const box = boxRef.current
    if (!box || disabled) return
    const set = (n: number | null) => {
      window.clearTimeout(leaveTimer.current)
      if (n !== null) return setHover(n)
      leaveTimer.current = window.setTimeout(() => setHover(null), LEAVE_MS)
    }
    const onMove = (e: MouseEvent) => {
      const target = e.target as Element
      const tag = target.closest('[data-section-tag]')
      if (tag) return set(Number(tag.getAttribute('data-section-tag')))
      const el = target.closest('[data-anchor^="section:"]')
      const n = el && box.contains(el) ? Number(el.getAttribute('data-anchor')?.split(':')[1]) : NaN
      set(Number.isInteger(n) ? n : null)
    }
    const onLeave = () => set(null)
    box.addEventListener('mousemove', onMove)
    box.addEventListener('mouseleave', onLeave)
    return () => {
      window.clearTimeout(leaveTimer.current)
      box.removeEventListener('mousemove', onMove)
      box.removeEventListener('mouseleave', onLeave)
    }
  }, [boxRef, disabled])

  useEffect(() => {
    // 位置は、プレビューの中身・倍率・スクロールで変わるので、測り直す(光の枠と同じ計算)
    const update = () => {
      const box = boxRef.current
      const next = new Map<number, Rect>()
      if (box) {
        const b = box.getBoundingClientRect()
        const k = box.offsetWidth > 0 ? b.width / box.offsetWidth : 1
        for (const el of box.querySelectorAll('[data-anchor^="section:"]')) {
          const n = Number(el.getAttribute('data-anchor')?.split(':')[1])
          const r = el.getBoundingClientRect()
          if (!Number.isInteger(n) || next.has(n) || (r.width === 0 && r.height === 0)) continue
          // 札は、メールの本文(白い枠)の左の境界の外に貼る。本文は、セクションを囲む、はみ出しを隠す箱
          let body: Element | null = el.parentElement
          while (body && body !== box && getComputedStyle(body).overflow !== 'hidden') body = body.parentElement
          const edge = body && body !== box ? body.getBoundingClientRect().left : r.left
          next.set(n, { left: (r.left - b.left) / k + box.scrollLeft, top: (r.top - b.top) / k + box.scrollTop, width: r.width / k, height: r.height / k, edge: (edge - b.left) / k + box.scrollLeft, tagW: (box.querySelector(`[data-section-tag="${n}"]`) as HTMLElement | null)?.offsetWidth ?? 0 })
        }
      }
      setRects((old) => (JSON.stringify([...old]) === JSON.stringify([...next]) ? old : next))
    }
    update()
    const id = window.setInterval(update, 300)
    return () => window.clearInterval(id)
  }, [boxRef])

  if (disabled || rects.size === 0) return null
  const hoverRect = hover !== null && hover !== on ? rects.get(hover) : undefined
  return (
    <div className={s.layer}>
      {hoverRect && <div className={s.outline} style={{ left: hoverRect.left, top: hoverRect.top, width: hoverRect.width, height: hoverRect.height }} aria-hidden />}
      {[...rects].map(([n, r]) => {
        const sec = sections[n]
        if (!sec) return null
        const label = Number.isFinite(sec.slots) ? t(`${sec.label}・${sec.slots} 枠`, `${sec.label} · ${sec.slots} ${sec.slots === 1 ? 'slot' : 'slots'}`) : sec.label
        // 本文の左の縁をまたいで貼る(半分は外、半分は本文の上。全部を外に出すと、はみ出し過ぎに見えた。2026-10-28 利用者)。
        // 本文に重なる側が中身の文字を隠さないよう、セクションの上端より上(セクションの間の余白)に寄せる。左に余白が足りないときは、切れないよう左端に寄せる
        const left = Math.max(r.edge - r.tagW / 2, 0)
        const top = Math.max(r.top - TAG_RISE, 0)
        return (
          <Button
            key={n}
            size="small"
            appearance="transparent"
            data-section-tag={n}
            data-no-pick
            className={s.tag}
            style={{ left, top, ...(n === on ? TAG_ON : n === hover ? TAG_HOVER : undefined) }}
            title={t('押すと、このセクションの全体を選びます', 'Click to select this whole section')}
            onClick={() => onSelect({ kind: 'section', index: n })}
          >
            {label}
          </Button>
        )
      })}
    </div>
  )
}
