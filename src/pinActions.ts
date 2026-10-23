import { CardNotesService, type CardNote } from './data/cardNotes'
import { bumpNotes } from './pinStore'

/**
 * ピン(プレビューの場所への書き込み)への操作のうち、ピンのフロートと右クリックのメニューの両方から呼ぶもの。
 * 同じことをする処理を 2 か所に持たないために、ここに置く
 */

/** 解決にする・未解決に戻す。解決にした人と日時も残す(やり取りの欄の「解決(だれ・いつ)」に出る) */
export async function setNoteResolved(n: CardNote, resolved: boolean, me: string) {
  const res = await CardNotesService.update(n.id, resolved ? { resolved: 1, replied_by: me, replied_at: new Date().toISOString() } : { resolved: 0 })
  bumpNotes()
  return res
}

/** そのピンのやり取りを開くリンク(いまの画面の URL に pin=<書き込みの ID> を足す。開いた人の画面で、そのピンのフロートが開く) */
export function pinLink(noteId: string): string {
  const q = new URLSearchParams(window.location.search)
  q.set('pin', noteId)
  return `${window.location.origin}${window.location.pathname}?${q.toString()}`
}

/**
 * リンクで開いたときの、開くピン(URL の pin)。画面の状態を URL に書き戻すと消える(deepLink は pin を知らない)うえ、
 * 配信カードはデータを読んだあとに開くので、読み込んだ時点の値を覚えておく。フロートを閉じたら忘れる(開き直すたびに出ないように)
 */
let initialPin: string | null = new URLSearchParams(window.location.search).get('pin')
export const linkedPin = (): string | null => initialPin
export const forgetLinkedPin = () => {
  initialPin = null
}
