import type { CardNote } from './data/cardNotes'
import { isThreadRoot, stageOf } from './notesStage'
import { tr } from './i18n'

/**
 * プレビュー上の場所に置く書き込み(ピン)の、画面どうしの受け渡し。
 * プレビュー(配信カードの中ペイン)と、やり取りの欄(右端のプロセスのペイン)は離れた部品なので、
 * 「いま置こうとしている場所」「光らせるスレッド」「書き込みが変わった」を、ここで共有する(props を何段も通さないため)
 */

/** プレビューで押した場所(まだ書き込んでいない) */
export interface PendingPin {
  cardId: string
  anchor: string
  x: number
  y: number
  view: string
  /** 商品の枠を押したとき、その商品(書き込みの「対象」にも入れる) */
  productId?: string
}

let pending: PendingPin | null = null
let focus: { noteId: string; seq: number } | null = null
let version = 0
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())

export const subscribePins = (f: () => void) => {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}
export const pendingPin = () => pending
export const setPendingPin = (p: PendingPin | null) => {
  pending = p
  emit()
}
/** 光らせるスレッド(ピンを押したとき・スレッドの「場所」を押したとき)。seq は、同じものを続けて押しても動くように */
export const focusedPin = () => focus
export const focusPin = (noteId: string) => {
  focus = { noteId, seq: (focus?.seq ?? 0) + 1 }
  emit()
}
/** やり取りを読み直したとき(ピンも読み直す) */
export const notesVersion = () => version
export const bumpNotes = () => {
  version += 1
  emit()
}

/** 見た目の鍵(チャネル|幅|AB の案)。ピンは、同じチャネル・同じ案のプレビューにだけ出す(幅は割合で合わせるので、違っても出す) */
export const pinView = (channel: string, device: string, variant: string) => `${channel}|${channel === 'push' ? '' : device}|${variant || 'A'}`
export const sameSurface = (a?: string, b?: string) => {
  const [ca, , va] = (a ?? '').split('|')
  const [cb, , vb] = (b ?? '').split('|')
  return ca === cb && (va || 'A') === (vb || 'A')
}

/** ピンを置ける書き込み(企画の段階の、スレッドの元で、場所のあるもの) */
export const isPinned = (n: CardNote) => !!n.anchor && isThreadRoot(n) && stageOf(n) === 'plan'

/** ピンの番号(書いた順。見た目や解決に関わらず変わらないように、場所のある書き込み全体で数える) */
export function pinNumbers(notes: CardNote[]): Map<string, number> {
  const list = notes.filter(isPinned).sort((a, b) => (a.created_on ?? '').localeCompare(b.created_on ?? ''))
  return new Map(list.map((n, i) => [n.id, i + 1]))
}

/** 場所の名前(スレッドの札・入力欄に出す) */
export function anchorLabel(anchor: string, productName?: string): string {
  const [kind, arg] = anchor.split(':')
  switch (kind) {
    case 'subject':
      return tr('件名・プリヘッダー', 'Subject / preheader')
    case 'topbar':
      return tr('お知らせ帯', 'Top bar')
    case 'header':
      return tr('ロゴの帯', 'Logo bar')
    case 'hero':
      return tr('メイン画像', 'Main image')
    case 'herotext':
      return tr('ヘッドライン・コピー', 'Headline / copy')
    case 'button':
      return tr('ボタン', 'Button')
    case 'section':
      return tr(`セクション ${Number(arg) + 1}`, `Section ${Number(arg) + 1}`)
    case 'product':
      return productName ? tr(`商品: ${productName}`, `Product: ${productName}`) : tr('商品', 'Product')
    case 'footer':
      return tr('フッター', 'Footer')
    case 'push':
      return tr('アプリの通知', 'App notification')
    default:
      return tr('プレビュー', 'Preview')
  }
}

/** 見た目の名前(書いたときと違う幅で見ているときに添える) */
export function viewLabel(view?: string): string {
  const [ch, device, variant] = (view ?? '').split('|')
  const parts = [ch === 'push' ? tr('アプリ', 'App') : device === 'pc' ? 'PC' : device === 'mobile' ? tr('スマホ', 'Mobile') : '', variant && variant !== 'A' ? tr(`${variant} 案`, `Variant ${variant}`) : '']
  return parts.filter(Boolean).join('・')
}
