import type { CardNote } from './data/cardNotes'
import { isThreadRoot, stageOf, type NoteStage } from './notesStage'
import { tr } from './i18n'
import { loadPref, savePref } from './settings'
import { PREF } from './prefKeys'

/**
 * プレビュー上の場所に置く書き込み(ピン)の、画面どうしの受け渡し。
 * プレビュー(配信カードの中ペイン)と、やり取りの欄(右端のプロセスのペイン)は離れた部品なので、
 * 「いま置こうとしている場所」「光らせるスレッド」「書き込みが変わった」を、ここで共有する(props を何段も通さないため)
 */

/** プレビューで押した場所(まだ書き込んでいない) */
export interface PendingPin {
  cardId: string
  /** どの段階のやり取りに書くか(配信カードのプレビュー = plan、制作のページのプレビュー = production) */
  stage: NoteStage
  anchor: string
  x: number
  y: number
  view: string
  /** 商品の枠を押したとき、その商品(書き込みの「対象」にも入れる) */
  productId?: string
  /** 打ったときの、その場所の中身(pinSnapshot の snapshotOf。書き込みの anchor_snapshot に入れる。X65 (b)) */
  snapshot?: string
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
/** 解決したピンも出すか(X65 (c)。人ごとに覚える。配信カード・制作のページのプレビューで共通) */
const RESOLVED_KEY = PREF.pinsShowResolved
let showResolved = loadPref<boolean>(RESOLVED_KEY, false)
export const showResolvedPins = () => showResolved
export const setShowResolvedPins = (v: boolean) => {
  showResolved = v
  savePref(RESOLVED_KEY, v)
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

/** ピンを置ける書き込み(その段階の、スレッドの元で、場所のあるもの) */
export const isPinned = (n: CardNote, stage: NoteStage = 'plan') => !!n.anchor && isThreadRoot(n) && stageOf(n) === stage

/** ピンの番号(書いた順。見た目や解決に関わらず変わらないように、その段階の場所のある書き込み全体で数える) */
export function pinNumbers(notes: CardNote[], stage: NoteStage = 'plan'): Map<string, number> {
  const list = notes.filter((n) => isPinned(n, stage)).sort((a, b) => (a.created_on ?? '').localeCompare(b.created_on ?? ''))
  return new Map(list.map((n, i) => [n.id, i + 1]))
}

/**
 * セクションの場所は「section:番号@ID」で持つ(X65 (d)。2026-10-24)。番号は並びの順なので、テンプレートの構成を変えた版ではずれる。
 * ID(Preview.tsx の data-section-id。tables.ts の sectionIdsOf)があれば ID で探し、なければ番号で探す。前に書いた「section:番号」も、そのまま読む
 */
export function sectionOfAnchor(anchor: string): { index: number; id?: string } | null {
  const m = /^section:(\d+)(?:@(.+))?$/.exec(anchor)
  return m ? { index: Number(m[1]), id: m[2] } : null
}
/** いまのプレビューで、そのセクションのブロック(ID が見つかれば ID で、なければ番号で) */
export function findSectionBlock(root: ParentNode, anchor: string): Element | null {
  const sec = sectionOfAnchor(anchor)
  if (!sec) return null
  return (sec.id ? root.querySelector(`[data-section-id="${CSS.escape(sec.id)}"]`) : null) ?? root.querySelector(`[data-anchor="section:${sec.index}"]`)
}
/** ブロックから、書き込みの場所の名前を作る(セクションは ID を添える) */
export function anchorOfBlock(block: Element): string {
  const anchor = block.getAttribute('data-anchor') ?? 'preview'
  const id = block.getAttribute('data-section-id')
  return id && sectionOfAnchor(anchor) ? `${anchor}@${id}` : anchor
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
    case 'section': {
      // 構成を変えた版では、いまの番号(ID で探したブロックの番号)で呼ぶ
      const sec = sectionOfAnchor(anchor)
      const now = sec?.id && typeof document !== 'undefined' ? document.querySelector(`[data-section-id="${CSS.escape(sec.id)}"]`)?.getAttribute('data-anchor') : null
      const n = (now ? (sectionOfAnchor(now)?.index ?? sec?.index) : (sec?.index ?? Number(arg))) ?? 0
      return tr(`セクション ${n + 1}`, `Section ${n + 1}`)
    }
    case 'product':
      return productName ? tr(`商品: ${productName}`, `Product: ${productName}`) : tr('商品', 'Product')
    case 'footer':
      return tr('フッター', 'Footer')
    case 'push':
      return tr('アプリの通知', 'App notification')
    case 'page':
      return tr('HTML の中', 'In the HTML')
    default:
      return tr('プレビュー', 'Preview')
  }
}

/** 見た目の名前(書いたときと違う幅で見ているときに添える) */
export function viewLabel(view?: string): string {
  const [ch, device, variant] = (view ?? '').split('|')
  const parts = [ch === 'html-made' ? tr('制作した HTML', 'Production HTML') : ch === 'html-plan' ? tr('企画の見本', 'Plan sample') : ch === 'push' ? tr('アプリ', 'App') : device === 'pc' ? 'PC' : device === 'mobile' ? tr('スマホ', 'Mobile') : '', variant && variant !== 'A' ? tr(`${variant} 案`, `Variant ${variant}`) : '']
  return parts.filter(Boolean).join('・')
}
