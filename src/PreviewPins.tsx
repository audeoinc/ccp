import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react'
import { Tooltip, makeStyles, mergeClasses, tokens } from '@fluentui/react-components'
import { CardNotesService, type CardNote } from './data/cardNotes'
import type { Item } from './items'
import { useT } from './i18n'
import { focusPin, focusedPin, isPinned, notesVersion, pendingPin, pinNumbers, sameSurface, setPendingPin, subscribePins } from './pinStore'

const PIN = 22

const useStyles = makeStyles({
  // プレビューの枠(スクロールする箱)の中に重ねる。層は押せない(ピンだけ押せる)。アラートの印より上に出す
  layer: { position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', zIndex: 4 },
  // 場所を選ぶ間だけ、プレビュー全体を覆って、押した場所を受け取る(下の入力欄・ドラッグを動かさないため)
  catcher: { position: 'absolute', left: 0, top: 0, pointerEvents: 'auto', cursor: 'crosshair', backgroundColor: 'rgba(0,0,0,0.04)' },
  pin: {
    position: 'absolute',
    width: `${PIN}px`,
    height: `${PIN}px`,
    marginLeft: `-${PIN / 2}px`,
    marginTop: `-${PIN}px`,
    display: 'grid',
    placeItems: 'center',
    padding: 0,
    // 吹き出しの形(左下を尖らせる)で、押した点を指す
    borderRadius: `${PIN / 2}px ${PIN / 2}px ${PIN / 2}px 2px`,
    border: `2px solid ${tokens.colorNeutralForegroundOnBrand}`,
    backgroundColor: tokens.colorPaletteDarkOrangeBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: tokens.fontWeightBold,
    boxShadow: tokens.shadow8,
    cursor: 'pointer',
    pointerEvents: 'auto',
    transitionProperty: 'transform',
    transitionDuration: tokens.durationFaster,
    ':hover': { transform: 'scale(1.15)' },
  },
  resolved: { backgroundColor: tokens.colorNeutralBackground5, color: tokens.colorNeutralForeground2 },
  focused: { outline: `3px solid ${tokens.colorBrandStroke1}`, outlineOffset: '1px', transform: 'scale(1.2)' },
  pending: { backgroundColor: tokens.colorBrandBackground, cursor: 'default' },
})

interface Props {
  /** プレビューの枠(スクロールする箱。position: relative) */
  boxRef: RefObject<HTMLDivElement | null>
  cardId?: string
  /** いまの見た目(pinView。チャネル|幅|AB の案) */
  view: string
  /** プレビューの商品の枠(data-item-key → 商品) */
  items: Item[]
  /** 場所を選んでいる間 */
  placing: boolean
  /** 場所を選んだ・やめたとき */
  onPlacingEnd: () => void
  /** ピンを押した・場所を選んだとき(やり取りの欄を開く) */
  onOpenThreads: () => void
}

interface Spot {
  id: string
  left: number
  top: number
}

/**
 * プレビュー上の書き込み(ピン)。書き込みの場所(card_notes の anchor)の目印のブロック(Preview.tsx の data-anchor・商品の枠)を探して、
 * その中の割合の位置にピンを重ねる。プレビューの部品はほかの画面とも共通なので、目印を読むだけにする(アラートの印と同じやり方)。
 * 場所を選ぶ間は、プレビューを覆う層で押した点を受け取り、その下のブロックを目印にする
 */
export function PreviewPins({ boxRef, cardId, view, items, placing, onPlacingEnd, onOpenThreads }: Props) {
  const s = useStyles()
  const t = useT()
  const version = useSyncExternalStore(subscribePins, notesVersion)
  const pending = useSyncExternalStore(subscribePins, pendingPin)
  const focus = useSyncExternalStore(subscribePins, focusedPin)
  const [notes, setNotes] = useState<CardNote[]>([])
  const [spots, setSpots] = useState<Spot[]>([])
  const [size, setSize] = useState({ w: 0, h: 0 })
  const layerRef = useRef<HTMLDivElement>(null)

  // やり取りの欄が読み直すたびに(書いた・解決した)、ピンも読み直す
  useEffect(() => {
    if (!cardId) return
    let alive = true
    void CardNotesService.getAll({ filter: `delivery_card_id eq ${cardId}`, orderBy: ['created_on asc'] }).then((res) => {
      if (alive && res.success) setNotes(res.data ?? [])
    })
    return () => {
      alive = false
    }
  }, [cardId, version])

  const numbers = pinNumbers(notes)
  // 出すのは、同じチャネル・案の、未解決のもの。解決したものも、いま光らせているものは出す
  const shown = notes.filter((n) => isPinned(n) && sameSurface(n.anchor_view, view) && (!n.resolved || focus?.noteId === n.id))
  const myPending = pending && pending.cardId === cardId ? pending : null

  /** 目印のブロックを探す。商品は、その商品の最初の枠(並べ替えても、商品について行く) */
  const findBlock = useCallback(
    (anchor: string, productId?: string): Element | null => {
      const root = boxRef.current
      if (!root) return null
      if (anchor === 'product') {
        const it = items.find((i) => i.productId === productId)
        return it ? root.querySelector(`[data-item-key="${CSS.escape(it.key)}"]`) : null
      }
      return root.querySelector(`[data-anchor="${CSS.escape(anchor)}"]`)
    },
    [boxRef, items],
  )

  const pointIn = useCallback(
    (el: Element, x: number, y: number) => {
      const box = boxRef.current
      if (!box) return null
      const b = box.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      if (r.width === 0 && r.height === 0) return null
      // 開くときの拡大のアニメーションの途中でも、位置がずれないよう、画面上の幅と本来の幅の比で割り戻す(アラートの印と同じ)
      const k = box.offsetWidth > 0 ? b.width / box.offsetWidth : 1
      return { left: (r.left + r.width * x - b.left) / k + box.scrollLeft, top: (r.top + r.height * y - b.top) / k + box.scrollTop }
    },
    [boxRef],
  )

  // 位置は、プレビューの中身・倍率・枠の大きさが変わるたびに変わるので、間隔を空けて測り直す
  const key = shown.map((n) => n.id).join(',') + (myPending ? `|${myPending.anchor}:${myPending.x}:${myPending.y}` : '')
  useEffect(() => {
    const update = () => {
      const box = boxRef.current
      if (box) setSize((o) => (o.w === box.scrollWidth && o.h === box.scrollHeight ? o : { w: box.scrollWidth, h: box.scrollHeight }))
      const next: Spot[] = []
      for (const n of shown) {
        const el = findBlock(n.anchor ?? '', n.product_id)
        const p = el && pointIn(el, Number(n.anchor_x ?? 0.5), Number(n.anchor_y ?? 0.5))
        if (p) next.push({ id: n.id, ...p })
      }
      if (myPending) {
        const el = findBlock(myPending.anchor, myPending.productId)
        const p = el && pointIn(el, myPending.x, myPending.y)
        if (p) next.push({ id: '', ...p })
      }
      setSpots((old) => (JSON.stringify(old) === JSON.stringify(next) ? old : next))
    }
    update()
    const timer = window.setInterval(update, 400)
    return () => window.clearInterval(timer)
    // shown・myPending は key に畳んでいる(毎回の描画で作り直される配列のため)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, findBlock, pointIn, boxRef])

  // ピンを押した・スレッドの「場所」を押したとき、そのピンが見える位置までスクロールする
  useEffect(() => {
    if (!focus) return
    const timer = window.setTimeout(() => layerRef.current?.querySelector(`[data-pin-id="${CSS.escape(focus.noteId)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
    return () => window.clearTimeout(timer)
  }, [focus])

  // Esc で、場所を選ぶのをやめる
  useEffect(() => {
    if (!placing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onPlacingEnd()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing, onPlacingEnd])

  const place = (e: React.MouseEvent) => {
    const box = boxRef.current
    if (!box || !cardId) return
    // 覆いの下の要素を探す(覆いとピンの層は除く)
    const under = document.elementsFromPoint(e.clientX, e.clientY).find((el) => box.contains(el) && !layerRef.current?.contains(el))
    if (!under) return
    const item = under.closest('[data-item-key]')
    const block = item && box.contains(item) ? item : under.closest('[data-anchor]')
    if (!block || !box.contains(block)) return
    const r = block.getBoundingClientRect()
    const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000
    const x = clamp((e.clientX - r.left) / (r.width || 1))
    const y = clamp((e.clientY - r.top) / (r.height || 1))
    const productId = item ? items.find((i) => i.key === item.getAttribute('data-item-key'))?.productId : undefined
    setPendingPin({ cardId, anchor: productId ? 'product' : (block.getAttribute('data-anchor') ?? 'preview'), x, y, view, productId })
    onPlacingEnd()
    onOpenThreads()
  }

  const byId = new Map(notes.map((n) => [n.id, n]))
  return (
    <div ref={layerRef} className={s.layer}>
      {placing && <div className={s.catcher} style={{ width: size.w, height: size.h }} onClick={place} role="presentation" />}
      {spots.map((p) => {
        if (!p.id)
          return (
            <span key="pending" className={mergeClasses(s.pin, s.pending)} style={{ left: p.left, top: p.top }} aria-label={t('ここに書き込みます', 'Posting here')}>
              +
            </span>
          )
        const n = byId.get(p.id)
        if (!n) return null
        const first = (n.body ?? '').split('\n')[0]
        return (
          <Tooltip key={p.id} relationship="description" content={`${n.author || t('(名前なし)', '(no name)')}: ${first}`}>
            <button
              type="button"
              data-pin-id={p.id}
              className={mergeClasses(s.pin, !!n.resolved && s.resolved, focus?.noteId === p.id && s.focused)}
              style={{ left: p.left, top: p.top }}
              onClick={(e) => {
                e.stopPropagation()
                focusPin(p.id)
                onOpenThreads()
              }}
              aria-label={t(`書き込み ${numbers.get(p.id)} を開く`, `Open comment ${numbers.get(p.id)}`)}
            >
              {numbers.get(p.id)}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
