import { toBlob } from 'html-to-image'
import { CreativeFiles } from './data/creativeFiles'
import { CardNotesService } from './data/cardNotes'
import { findSectionBlock } from './pinStore'

/**
 * ピンを書いたときの、その場所の様子を残す(X65 (b)。2026-10-24 利用者: どう直ったかを確かめるために、元の状態が見たい)。
 * 2 つ残す: (1) ブロックの画像(PNG。素材と同じ置き場所)、(2) 文字と画像の URL(いまの中身と比べて「変わった」の印を出す用)。
 * よそのサーバーの画像は、ブラウザの決まり(CORS)で画像に写らないことがある。そのときも (2) の比べ方は動く
 */

/** 比べる用の中身(文字と画像の URL)。長いブロックでも列が大きくならないよう、先頭だけ */
export function snapshotOf(el: Element): string {
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  const images = [...el.querySelectorAll('img')].map((img) => img.getAttribute('src') ?? '').filter(Boolean)
  return [text, ...images].join('\n').slice(0, 1000)
}

/** 書いたときの中身と、いまの中身が違うか(書いたときの記録がない古い書き込みは、違うとは言わない) */
export const changedSince = (el: Element, snapshot?: string) => !!snapshot && snapshotOf(el) !== snapshot

// 打ってから書くまでの間に、画像を作って置いておく(書くときに待たないように)。鍵は、打った場所
const captures = new Map<string, Promise<string | null>>()

/** ブロックの画像を作り、素材の置き場所に置き始める。置けなければ null(書き込みは画像なしで残す) */
export function startCapture(key: string, el: HTMLElement) {
  captures.clear()
  captures.set(
    key,
    toBlob(el, {
      pixelRatio: 1,
      backgroundColor: '#ffffff',
      // ピン・選んだ印の層は写さない(プレビューの中身だけ)
      filter: (node) => !(node instanceof Element && node.hasAttribute('data-pin-id')),
    })
      .then(async (blob) => (blob ? (await CreativeFiles.upload(new File([blob], 'pin-snapshot.png', { type: 'image/png' }))).stored : null))
      .catch(() => null),
  )
}

/**
 * 書き込みに、作った画像を付ける(書くのは待たせない。画像は、できたら書き込みの anchor_image に入れて、ピンとフロートを読み直す)。
 * 初めての画像は、字の形(フォント)の読み込みなどで数秒かかることがあるため
 */
export function attachCapture(key: string, noteId: string, onDone: () => void) {
  const p = captures.get(key)
  if (!p) return
  captures.delete(key)
  void p.then(async (stored) => {
    if (!stored) return
    const r = await CardNotesService.update(noteId, { anchor_image: stored })
    if (r.success) onDone()
  })
}

/** 場所の名前から、いまのプレビューのブロック(商品は、その枠の data-item-key) */
export function blockOfAnchor(anchor: string, itemKey?: string): HTMLElement | null {
  if (anchor === 'product') return itemKey ? document.querySelector<HTMLElement>(`[data-item-key="${CSS.escape(itemKey)}"]`) : null
  if (anchor.startsWith('section:')) return findSectionBlock(document, anchor) as HTMLElement | null
  return document.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(anchor)}"]`)
}

/** 打った場所の鍵(打った所が同じなら同じ) */
export const captureKey = (cardId: string, anchor: string, x: number, y: number) => `${cardId}|${anchor}|${x}|${y}`
