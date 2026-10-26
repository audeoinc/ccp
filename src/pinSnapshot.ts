import { toBlob, toCanvas } from 'html-to-image'
import { CreativeFiles } from './data/creativeFiles'
import { CardNotesService } from './data/cardNotes'
import { findSectionBlock } from './pinStore'

/**
 * ピンを書いたときの、その場所の様子を残す(X65 (b)。2026-10-24 利用者: どう直ったかを確かめるために、元の状態が見たい。
 * 2026-10-25 から、開発へのリクエストのピンにも)。
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

/** 作った画像を、素材の置き場所に置く。置けなければ null(書き込みは画像なしで残す) */
const store = (blob: Blob | null) => (blob ? CreativeFiles.upload(new File([blob], 'pin-snapshot.png', { type: 'image/png' })).then((u) => u.stored) : Promise.resolve(null))

function begin(key: string, made: () => Promise<Blob | null>) {
  captures.clear()
  captures.set(key, made().then(store).catch(() => null))
}

/** ブロックの画像を作り、素材の置き場所に置き始める */
export function startCapture(key: string, el: HTMLElement) {
  begin(key, () =>
    toBlob(el, {
      pixelRatio: 1,
      backgroundColor: '#ffffff',
      // ピン・選んだ印の層は写さない(プレビューの中身だけ)
      filter: (node) => !(node instanceof Element && node.hasAttribute('data-pin-id')),
    }),
  )
}

// 開発へのリクエストの写す大きさの目安(画面のどこでも打てるので、写すのは打った所のまわりだけ)
const AROUND = { w: 800, h: 500 }
// 大きさ 0 の要素(入れ物だけの層など)は写しても空なので、収まるとみなさない
const fits = (r: DOMRect) => r.width > 0 && r.height > 0 && r.width <= AROUND.w && r.height <= AROUND.h

/**
 * 画面の点のまわりの画像を作り始める(開発へのリクエストのピン)。
 * 目印の要素(mark)が目安に収まれば、それを写す。収まらなければ、押した要素から外へたどって、目安に収まるいちばん大きい部品を写す。
 * 押した要素からして大きいとき(広い背景など)は、その要素を写して、点のまわりの目安の大きさだけを切り出す。
 * skip は写さないもの(ピンの層など)。メニューが消えてから写すため、2 回の描画を待つ
 */
export function startCaptureAt(key: string, x: number, y: number, mark: Element | null, skip: (el: Element) => boolean) {
  begin(key, async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    // ピン・ピンのフロート・右クリックのメニューも写さない
    const own = (node: Element) => skip(node) || node.matches('[data-pin-id], [data-pin-thread], [role="menu"]')
    const filter = (node: Node) => !(node instanceof Element && own(node))
    // 待つ間に、打ったピン(＋)がその点に出るので、いちばん上の要素はピンの層になる。重なった要素から、ピンの層・メニューの中でない、いちばん上のものを使う
    // (以前は elementFromPoint で、ピンの層の入れ物(大きさ 0)を写して、空の画像になっていた。2026-10-26 本番の報告)
    const inOwn = (el: Element) => {
      for (let a: Element | null = el; a; a = a.parentElement) if (own(a)) return true
      return false
    }
    const hit = document.elementsFromPoint(x, y).find((el) => !inOwn(el) && el !== document.documentElement && el !== document.body)
    if (!hit) return null
    let el: Element | null = mark && fits(mark.getBoundingClientRect()) ? mark : null
    if (!el && fits(hit.getBoundingClientRect())) {
      el = hit
      while (el.parentElement && el.parentElement !== document.body && fits(el.parentElement.getBoundingClientRect())) el = el.parentElement
    }
    if (el) return toBlob(el as HTMLElement, { pixelRatio: 1, backgroundColor: '#ffffff', filter })
    const r = hit.getBoundingClientRect()
    const w = Math.min(AROUND.w, r.width)
    const h = Math.min(AROUND.h, r.height)
    const left = Math.min(Math.max(x - w / 2, r.left), r.right - w)
    const top = Math.min(Math.max(y - h / 2, r.top), r.bottom - h)
    const whole = await toCanvas(hit as HTMLElement, { pixelRatio: 1, backgroundColor: '#ffffff', filter })
    // 写した画像は、表示の大きさ(CSS の zoom。X60)を掛ける前の大きさ。測った点・枠は掛けたあとの px なので、切り出す所を画像の大きさに直す
    const k = r.width > 0 ? whole.width / r.width : 1
    const out = document.createElement('canvas')
    out.width = Math.round(w * k)
    out.height = Math.round(h * k)
    out.getContext('2d')?.drawImage(whole, (left - r.left) * k, (top - r.top) * k, w * k, h * k, 0, 0, w * k, h * k)
    return new Promise<Blob | null>((ok) => out.toBlob(ok, 'image/png'))
  })
}

/**
 * 書き込みに、作った画像を付ける(書くのは待たせない。画像は、できたら save で書き込みに入れて、ピンとフロートを読み直す)。
 * 初めての画像は、字の形(フォント)の読み込みなどで数秒かかることがあるため
 */
export function attachCapture(key: string, save: (stored: string) => Promise<{ success: boolean }>, onDone: () => void) {
  const p = captures.get(key)
  if (!p) return
  captures.delete(key)
  void p.then(async (stored) => {
    if (!stored) return
    const r = await save(stored)
    if (r.success) onDone()
  })
}

/** 書き込みの表(card_notes)の anchor_image に入れる */
export const saveNoteImage = (noteId: string) => (stored: string) => CardNotesService.update(noteId, { anchor_image: stored })

/** 場所の名前から、いまのプレビューのブロック(商品は、その枠の data-item-key) */
export function blockOfAnchor(anchor: string, itemKey?: string): HTMLElement | null {
  if (anchor === 'product') return itemKey ? document.querySelector<HTMLElement>(`[data-item-key="${CSS.escape(itemKey)}"]`) : null
  if (anchor.startsWith('section:')) return findSectionBlock(document, anchor) as HTMLElement | null
  return document.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(anchor)}"]`)
}

/** 打った場所の鍵(打った所が同じなら同じ) */
export const captureKey = (cardId: string, anchor: string, x: number, y: number) => `${cardId}|${anchor}|${x}|${y}`
