// スポットライト(X83)。「？ 聞く」の答えの手順にある画面の名前([[名前]])を、いまの画面の中で探して光らせる。
// 「ここを開く」で画面を移ったあと・「画面で示す」を押したときに使う。光らせる層は SpotlightLayer.tsx(上の帯が持つ)。
// 目印(data-el など)を部品ごとに付けていく代わりに、ボタン・タブ・欄の見えている名前で探す(答えの名前は、画面の文言の一覧にあるものだけなので、
// 画面に出ていれば当たる)。答えのフロートの中の文字には当てない
import { useSyncExternalStore } from 'react'

let names: string[] = []
let version = 0
const listeners = new Set<() => void>()
const bump = () => {
  version++
  listeners.forEach((f) => f())
}

/** 光らせる名前を決める(空で消す) */
export function setSpotlight(next: string[]) {
  names = [...new Set(next.map((n) => n.trim()).filter((n) => n && !n.includes('…')))]
  bump()
}
export const spotlightNames = () => names
export function useSpotlight(): { names: string[]; version: number } {
  const v = useSyncExternalStore(
    (f) => {
      listeners.add(f)
      return () => void listeners.delete(f)
    },
    () => version,
  )
  return { names, version: v }
}

/** 手順と答えの文から、[[名前]] を取り出す */
export function namesInAnswer(lines: string[]): string[] {
  const out: string[] = []
  for (const line of lines) for (const m of line.matchAll(/\[\[([^\]]+)\]\]/g)) out.push(m[1].trim())
  return [...new Set(out)]
}

// 名前を持つ部品(押すもの・選ぶもの・欄の名前・見出し)
const CANDIDATES = 'button, a, [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="option"], [role="switch"], [role="checkbox"], label, h1, h2, h3, h4, [aria-label]'
const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

/** いまの画面で、名前に当たる部品を探す(見えているものだけ。同じ部品の中の入れ子は、外側の 1 つに) */
export function findByNames(list: string[], skip: (el: Element) => boolean): Element[] {
  if (list.length === 0) return []
  const wanted = list.map(norm)
  const hits: Element[] = []
  for (const el of document.querySelectorAll(CANDIDATES)) {
    if (skip(el)) continue
    const label = norm(el.getAttribute('aria-label') ?? '')
    const text = norm(el.textContent ?? '')
    // 件数の札が付いたボタン(アラート 2 など)にも当たるよう、名前のあとに数字だけが続くものも当たりにする
    const ok = wanted.some((w) => label === w || text === w || (text.startsWith(w) && /^[\s\d]*$/.test(text.slice(w.length))))
    if (!ok) continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (hits.some((h) => h.contains(el))) continue
    // 先に入れた内側の部品があれば、外側の部品に置き換える
    for (let i = hits.length - 1; i >= 0; i--) if (el.contains(hits[i])) hits.splice(i, 1)
    hits.push(el)
    if (hits.length >= 12) break
  }
  return hits
}
