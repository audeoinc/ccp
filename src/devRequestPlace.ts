import type { LinkState } from './deepLink'
import type { DevRequest } from './models/devRequests'
import type { DevRequestVote } from './models/devRequestVotes'
import { DevRequestVotesService } from './data/devRequestVotes'
import { DevRequestsService } from './data/devRequests'
import { confirmDialog } from './confirm'
import { anchorLabel } from './pinStore'
import { loadPref, savePref } from './settings'
import { tr } from './i18n'
import { PREF } from './prefKeys'

/**
 * 開発へのリクエストのピンの、場所の記録と探し方(2026-10-23 利用者と決めた)。
 * 場所は 3 つで持つ: 画面の鍵(screen。同じ画面を開いたときにピンを出す)、目印の要素と、その中の割合(anchor・anchor_x/y)、
 * 画面の中の割合(view_x/y。目印がない所)。加えて、人が読める文(place_text)。画面の作りが変わって目印が見つからなくても、文で分かるように
 */

/** 画面の鍵。開いているフロート(配信カード・制作のページ・結果・アラート)があれば、それ。なければ面と見せ方 */
export function screenKey(l: Partial<LinkState>): string {
  if (l.production) return `production:${l.production}`
  if (l.card) return `card:${l.card}`
  if (l.result) return `result:${l.result}`
  if (l.alerts !== undefined) return 'alerts'
  return `${l.page ?? 'calendar'}:${l.view ?? ''}`
}

const pageName = (p?: string) => ({ calendar: tr('計画', 'Plan'), production: tr('制作', 'Production'), results: tr('結果', 'Results'), alerts: tr('アラート', 'Alerts') })[p ?? 'calendar'] ?? p ?? ''
const viewName = (v?: string) =>
  v ? ({ month: tr('月の表示', 'Month'), week: tr('週の表示', 'Week'), list: tr('一覧', 'List'), compare: tr('比べる', 'Compare'), products: tr('商品別', 'By product'), impact: tr('効果', 'Impact') }[v] ?? v) : ''

/** 画面の名前(場所の文の前半)。例: 計画 > 月の表示 > 配信カード「Fall Arrivals」 */
export function screenLabel(l: Partial<LinkState>, cardName: (id: string) => string): string {
  const parts = [pageName(l.page), viewName(l.view)]
  if (l.card) parts.push(tr(`配信カード「${cardName(l.card)}」`, `Delivery card "${cardName(l.card)}"`))
  if (l.production) parts.push(tr(`制作のページ「${cardName(l.production)}」`, `Production page "${cardName(l.production)}"`))
  if (l.result) parts.push(tr(`結果「${cardName(l.result)}」`, `Results "${cardName(l.result)}"`))
  if (l.alerts !== undefined) parts.push(tr('アラートの一覧', 'Alerts'))
  return parts.filter(Boolean).join(' > ')
}

// 目印にする印(上から順に見る)。data-anchor・data-part は、プレビューのピンと同じ目印
const MARKS = ['data-dev-anchor', 'data-part', 'data-anchor', 'data-item-key', 'data-card-id'] as const

/** 押した点の場所。目印の要素があれば、その中の割合。なければ、画面の中の割合だけ */
export interface CapturedPlace {
  anchor: string
  anchor_x?: number
  anchor_y?: number
  view_x: number
  view_y: number
  /** 場所の文の後半(部品の名前など) */
  partLabel: string
}

const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000
const snippet = (text: string) => {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > 24 ? `${one.slice(0, 24)}…` : one
}

/** data-part の値(src/simple/parts.ts の鍵)を、人が読める名前に */
function partLabelOf(v: string): string {
  const [kind, arg] = v.split(':')
  const n = Number(arg) + 1
  switch (kind) {
    case 'hero':
      return anchorLabel('hero')
    case 'headline':
      return tr('見出し', 'Headline')
    case 'copy':
      return tr('コピー', 'Copy')
    case 'sectionTitle':
      return tr(`セクション ${n} の見出し`, `Section ${n} title`)
    case 'sectionCopy':
      return tr(`セクション ${n} の文`, `Section ${n} copy`)
    case 'slot':
      return tr(`商品の枠 ${n}`, `Product slot ${n}`)
    case 'button':
      return tr('ボタン', 'Button')
    case 'pushTitle':
    case 'pushBody':
      return tr('アプリの通知', 'App notification')
    default:
      return v
  }
}

export function capturePlace(x: number, y: number, cardName: (id: string) => string): CapturedPlace {
  const el = document.elementFromPoint(x, y)
  const view_x = round(x / (window.innerWidth || 1))
  const view_y = round(y / (window.innerHeight || 1))
  let anchorEl: Element | null = null
  let mark = ''
  for (const m of MARKS) {
    const hit = el?.closest(`[${m}]`)
    if (hit) {
      anchorEl = hit
      mark = m
      break
    }
  }
  // 部品の名前: 目印があれば、その名前。なければ、押した所のボタン・見出しの文
  let partLabel = ''
  if (anchorEl) {
    const v = anchorEl.getAttribute(mark) ?? ''
    if (mark === 'data-anchor') partLabel = anchorLabel(v)
    else if (mark === 'data-card-id') partLabel = tr(`配信「${cardName(v)}」`, `Delivery "${cardName(v)}"`)
    else if (mark === 'data-item-key') partLabel = tr('商品の枠', 'Product slot')
    else partLabel = partLabelOf(v)
  } else if (el) {
    const named = el.closest('[aria-label], button, a, [role="tab"], h1, h2, h3, label')
    // 名前の付いた部品がなければ、押した要素そのものの文字だけ(中に部品を持つ大きな枠の文字を、まるごと使わない)
    const text = named?.getAttribute('aria-label') || named?.textContent || (el.children.length === 0 ? el.textContent : '') || ''
    partLabel = snippet(text)
  }
  if (!anchorEl) return { anchor: '', view_x, view_y, partLabel }
  const r = anchorEl.getBoundingClientRect()
  const value = anchorEl.getAttribute(mark) ?? ''
  return { anchor: `[${mark}="${CSS.escape(value)}"]`, anchor_x: round((x - r.left) / (r.width || 1)), anchor_y: round((y - r.top) / (r.height || 1)), view_x, view_y, partLabel }
}

/** ピンを出す点(画面の座標)。目印が見つからない(画面の作りが変わった・いまは出ていない)ときは null */
export function locate(q: Pick<DevRequest, 'anchor' | 'anchor_x' | 'anchor_y' | 'view_x' | 'view_y'>): { left: number; top: number } | null {
  if (!q.anchor) return { left: Number(q.view_x ?? 0.5) * window.innerWidth, top: Number(q.view_y ?? 0.5) * window.innerHeight }
  let el: Element | null = null
  try {
    el = document.querySelector(q.anchor)
  } catch {
    return null
  }
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width === 0 && r.height === 0) return null
  return { left: r.left + r.width * Number(q.anchor_x ?? 0.5), top: r.top + r.height * Number(q.anchor_y ?? 0.5) }
}

/**
 * その点で、ピンを出してよいか(ほかのダイアログ・メニューに隠れていないか)。ピンの層はいちばん上に重ねるので、
 * 下の画面の上にダイアログが開いたときに、隠れた所のピンを出さないために見る。層(layer)の中の要素は数えない
 */
export function uncovered(left: number, top: number, anchor: string | undefined, layer: Element | null, inFloat: boolean): boolean {
  const topEl = document.elementsFromPoint(left, top).find((el) => !layer?.contains(el))
  if (!topEl) return false
  if (anchor) {
    let a: Element | null = null
    try {
      a = document.querySelector(anchor)
    } catch {
      return false
    }
    return !!a && (a === topEl || a.contains(topEl))
  }
  // 目印のないピン: 配信カードなどのフロートの画面ならダイアログの中、そうでなければダイアログの外にあるときだけ
  return !!topEl.closest('[role="dialog"]') === inFloat
}

/** 画面の版(ビルドしたときの日付とコミット。vite.config.ts) */
export const buildId = (): string => String(import.meta.env.VITE_BUILD_ID ?? '')

// ---- リクエスト用の名前(CCP の名前の設定とは別。ブラウザごとに覚える。ログイン(U7)が入ったら、ログインの名前を先に使う形にする)
const NAME_KEY = PREF.devRequestName
const nameListeners = new Set<() => void>()
export const devRequestName = (): string => loadPref<string>(NAME_KEY, '')
export function setDevRequestName(v: string) {
  savePref(NAME_KEY, v.trim())
  nameListeners.forEach((f) => f())
}
export const onDevRequestName = (f: () => void) => {
  nameListeners.add(f)
  return () => {
    nameListeners.delete(f)
  }
}

/** 一覧の「この画面を開く」で開いたときの、開くリクエスト(URL の devreq。読み込んだ時点の値を覚える。pinActions の pin と同じ) */
let initialRequest: string | null = new URLSearchParams(window.location.search).get('devreq')
export const linkedRequest = () => initialRequest
export const forgetLinkedRequest = () => {
  initialRequest = null
}

// ---- 一覧を開く(ヘッダーの「リクエスト」と、ヘッダーを隠すフロートの「⋯」の項目から。開くのは App)
const openListeners = new Set<() => void>()
export const openDevRequestList = () => openListeners.forEach((f) => f())
export const onOpenDevRequestList = (f: () => void) => {
  openListeners.add(f)
  return () => {
    openListeners.delete(f)
  }
}

// ---- 書いた・状態を変えたら、ピンの層・フロート・一覧が読み直す(離れた部品なので、ここで知らせる)
let version = 0
const listeners = new Set<() => void>()
export const devRequestsVersion = () => version
export const subscribeDevRequests = (f: () => void) => {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}
export function bumpDevRequests() {
  version += 1
  listeners.forEach((f) => f())
}

// ---- 賛同(いいね)。1 人 1 回。同じ名前でもう一度押すと取り消す(フロートと一覧で同じ処理)
/** そのリクエストへの賛同(古い順) */
export const votesOf = (votes: DevRequestVote[], id: string) => votes.filter((v) => v.dev_request_id === id).sort((a, b) => (a.created_on ?? '').localeCompare(b.created_on ?? ''))

export async function toggleVote(id: string, name: string, votes: DevRequestVote[]) {
  const mine = votes.filter((v) => v.dev_request_id === id && (v.voter_name ?? '').trim() === name.trim())
  if (mine.length) for (const v of mine) await DevRequestVotesService.delete(v.id)
  else {
    const r = await DevRequestVotesService.create({ dev_request_id: id, voter_name: name.trim() })
    if (!r.success) throw new Error(r.error?.message ?? tr('賛同できませんでした', 'Could not add your vote'))
  }
  bumpDevRequests()
}

// ---- 削除(フロートと一覧で同じ処理)。いまはテストで入れたものも多いので、ログインしている人なら誰でも消せる(書いた人に限らない。2026-10-26 利用者)
/**
 * リクエストを、返信(source_request がその ID の行)と一緒に消す。賛同は、表の決まり(CASCADE)で一緒に消える。
 * 消す前に確かめの窓を出し、やめたら false。書いたときの様子の画像のファイルは、素材の置き場所に残る
 */
export async function deleteDevRequest(id: string, rows: DevRequest[]): Promise<boolean> {
  if (!(await confirmDialog(tr('このリクエストと返信を削除します。元に戻せません', 'Delete this request and its replies? This cannot be undone.'), { okLabel: tr('削除', 'Delete') }))) return false
  // 返信を先に消す(元を先に消すと、途中で失敗したときに、元のない返信が残るため)
  for (const r of rows.filter((q) => q.source_request === id)) await DevRequestsService.delete(r.id)
  await DevRequestsService.delete(id)
  bumpDevRequests()
  return true
}
