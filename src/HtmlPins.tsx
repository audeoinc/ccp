import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { tokens } from '@fluentui/react-components'
import { CardNotesService, type CardNote } from './data/cardNotes'
import { tr } from './i18n'
import { focusPin, focusedPin, isPinned, notesVersion, pendingPin, pinNumbers, sameSurface, setPendingPin, subscribePins, type PendingPin } from './pinStore'

const PIN = 22

interface Props {
  /** 制作のページのプレビューの枠(HtmlPreviewFrame の iframe) */
  frame: HTMLIFrameElement | null
  cardId?: string
  /** いまの見た目(pinView。html-made / html-plan と AB の案) */
  view: string
  /** 場所を選んでいる間 */
  placing: boolean
  onPlacingEnd: () => void
  /** ピンを押した・場所を選んだとき(制作のやり取りを開く) */
  onOpenThreads: () => void
}

/** メールの箱(本文の最初の、見える要素)。制作ツールで作った HTML には目印がないので、ピンはこの箱の中の割合で持つ */
function mailBox(doc: Document): HTMLElement | null {
  const body = doc.body
  if (!body) return null
  const first = Array.from(body.children).find((el) => !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(el.tagName) && (el as HTMLElement).offsetHeight > 0)
  return (first as HTMLElement | undefined) ?? body
}

/** Fluent の色(CSS 変数)を、枠の外で値にする(枠の中の文書には、アプリの CSS 変数がないため) */
const resolve = (el: Element, token: string) => {
  const name = /var\((--[^,)]+)/.exec(token)?.[1]
  return (name && getComputedStyle(el).getPropertyValue(name).trim()) || token
}

interface MountArgs {
  cardId: string
  notes: CardNote[]
  pending: PendingPin | null
  focus: { noteId: string; seq: number } | null
  /** 最後にスクロールした光らせる番号(同じものを何度もスクロールしないため) */
  lastFocus: { seq: number }
  placing: boolean
  view: string
  handlers: { onPlacingEnd: () => void; onOpenThreads: () => void }
}

/** 枠の中の文書に、ピンの層を足す(戻り値で外す)。React の外の DOM なので、部品の外の関数にする */
function mountPins(frame: HTMLIFrameElement, { cardId, notes, pending, focus, lastFocus, placing, view, handlers }: MountArgs): (() => void) | undefined {
  const doc = frame.contentDocument
  const box = doc && mailBox(doc)
  if (!doc || !box) return undefined
  const numbers = pinNumbers(notes, 'production')
  const shown = notes.filter((n) => isPinned(n, 'production') && n.anchor === 'page' && sameSurface(n.anchor_view, view) && (!n.resolved || focus?.noteId === n.id))
  const myPending = pending && pending.cardId === cardId && pending.stage === 'production' && sameSurface(pending.view, view) ? pending : null

  const orange = resolve(frame, tokens.colorPaletteDarkOrangeBackground3)
  const brand = resolve(frame, tokens.colorBrandBackground)
  const ring = resolve(frame, tokens.colorBrandStroke1)
  const grey = resolve(frame, tokens.colorNeutralBackground5)
  const greyText = resolve(frame, tokens.colorNeutralForeground2)

  if (getComputedStyle(box).position === 'static') box.style.position = 'relative'
  const layer = doc.createElement('div')
  layer.setAttribute('data-ccp-pins', '')
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:2147483000'
  const inner: HTMLElement[] = []
  const pin = (x: number, y: number, label: string, bg: string, color: string) => {
    // 置き場所(大きさ 0)と、見える印に分ける。印だけを倍率の逆数で拡大して、プレビューを縮めても同じ大きさに見せる
    const at = doc.createElement('div')
    at.style.cssText = `position:absolute;left:${x * 100}%;top:${y * 100}%;width:0;height:0`
    const b = doc.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.style.cssText = `position:absolute;left:-${PIN / 2}px;top:-${PIN}px;width:${PIN}px;height:${PIN}px;padding:0;display:grid;place-items:center;border-radius:${PIN / 2}px ${PIN / 2}px ${PIN / 2}px 2px;border:2px solid #fff;background:${bg};color:${color};font:700 11px/1 system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;pointer-events:auto`
    at.appendChild(b)
    layer.appendChild(at)
    inner.push(b)
    return b
  }
  for (const n of shown) {
    const b = pin(Number(n.anchor_x ?? 0.5), Number(n.anchor_y ?? 0.5), String(numbers.get(n.id) ?? ''), n.resolved ? grey : orange, n.resolved ? greyText : '#fff')
    b.title = `${n.author || tr('(名前なし)', '(no name)')}: ${(n.body ?? '').split('\n')[0]}`
    b.setAttribute('aria-label', tr(`書き込み ${numbers.get(n.id)} を開く`, `Open comment ${numbers.get(n.id)}`))
    if (focus?.noteId === n.id) b.style.outline = `3px solid ${ring}`
    b.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      focusPin(n.id)
      handlers.onOpenThreads()
    })
    if (focus && focus.noteId === n.id && focus.seq !== lastFocus.seq) {
      lastFocus.seq = focus.seq
      window.setTimeout(() => b.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120)
    }
  }
  if (myPending) {
    const b = pin(myPending.x, myPending.y, '+', brand, '#fff')
    b.style.cursor = 'default'
  }
  box.appendChild(layer)

  // 倍率(HtmlPreviewFrame が文書の zoom に書く)が変わるたびに、印の大きさを合わせ直す
  const fit = () => {
    const z = parseFloat(doc.documentElement.style.zoom) || 1
    for (const b of inner) b.style.zoom = String(1 / z)
  }
  fit()
  const mo = new MutationObserver(fit)
  mo.observe(doc.documentElement, { attributes: true, attributeFilter: ['style'] })

  // 場所を選ぶ間は、押した点をメールの箱の中の割合にする(HTML の中のリンクは開かない)
  const onPick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const r = box.getBoundingClientRect()
    const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000
    setPendingPin({ cardId, stage: 'production', anchor: 'page', x: clamp((e.clientX - r.left) / (r.width || 1)), y: clamp((e.clientY - r.top) / (r.height || 1)), view })
    handlers.onPlacingEnd()
    handlers.onOpenThreads()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') handlers.onPlacingEnd()
  }
  if (placing) {
    doc.documentElement.style.cursor = 'crosshair'
    doc.addEventListener('click', onPick, true)
    doc.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onKey)
  }
  return () => {
    mo.disconnect()
    layer.remove()
    doc.documentElement.style.cursor = ''
    doc.removeEventListener('click', onPick, true)
    doc.removeEventListener('keydown', onKey)
    window.removeEventListener('keydown', onKey)
  }
}

/**
 * 制作のページのプレビュー(iframe の HTML)の上の書き込み(ピン)。
 * 枠の中の文書に、ピンの層を直接足す(拡大・縮小・スクロールに、ブラウザがそのまま合わせてくれるため)。保存する HTML には入らない(表示の中だけ)。
 * 場所は「メールの箱の中の割合」(anchor = page)。目印のブロックは使えない(制作した HTML は、制作ツールで作り直されることがある)
 */
export function HtmlPins({ frame, cardId, view, placing, onPlacingEnd, onOpenThreads }: Props) {
  const version = useSyncExternalStore(subscribePins, notesVersion)
  const pending = useSyncExternalStore(subscribePins, pendingPin)
  const focus = useSyncExternalStore(subscribePins, focusedPin)
  const [notes, setNotes] = useState<CardNote[]>([])
  // HTML を描き直す(srcDoc が変わる)と、枠の中の文書が新しくなるので、描き直しの回数で層を付け直す
  const [loads, setLoads] = useState(0)
  const lastFocus = useRef({ seq: 0 })
  const handlers = useRef({ onPlacingEnd, onOpenThreads })
  useEffect(() => {
    handlers.current = { onPlacingEnd, onOpenThreads }
  }, [onPlacingEnd, onOpenThreads])

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

  useEffect(() => {
    if (!frame) return
    const onLoad = () => setLoads((n) => n + 1)
    frame.addEventListener('load', onLoad)
    return () => frame.removeEventListener('load', onLoad)
  }, [frame])

  useEffect(() => {
    if (!frame || !cardId) return
    return mountPins(frame, { cardId, notes, pending, focus, lastFocus: lastFocus.current, placing, view, handlers: handlers.current })
  }, [frame, loads, notes, pending, focus, placing, view, cardId])

  return null
}
