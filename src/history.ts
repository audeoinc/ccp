import type { DeliveryCardStatus } from './models/deliveryCards'
// 承認の履歴(バックログ W6)の、記録の入り口。週の操作・配信のステータスの変更から呼ぶ。
// 記録に失敗しても、本来の操作(保存・週の確定)は止めない(履歴は、あとから経緯を追うためのもので、操作の条件ではないため)
import { EventsService, type EventAction } from './data/events'
import { loadPref, savePref } from './settings'
import { weekKeyOf } from './weekLock'
import { PREF } from './prefKeys'

// 操作した人の名前。ログインで人を見分けないので、画面で選んだ(入れた)名前を、ブラウザごとに覚えて使う(コメントを書く人と共通)。
// U2 から、ユーザーマスタから選んだ人の id も覚える(me.user)。記録には、これまでどおり名前の文字を残す(ログインが入るまでの形。docs/APPROVAL.md)
const NAME_KEY = PREF.myName
const USER_KEY = PREF.myUser
const meListeners = new Set<() => void>()
export const myName = (): string => loadPref<string>(NAME_KEY, '') || loadPref<string>(PREF.legacyCommentAuthor, '')
export const myUserId = (): string => loadPref<string>(USER_KEY, '')
export const setMyName = (name: string) => {
  savePref(NAME_KEY, name.trim())
  meListeners.forEach((f) => f())
}
/** ユーザーマスタから「あなた」を選ぶ(名前も一緒に覚える。外すときは undefined) */
export const setMe = (user?: { id: string; name: string }) => {
  savePref(USER_KEY, user?.id ?? '')
  setMyName(user?.name ?? '')
}
/**
 * ログインしている人(U7)。サーバーの /api/me が返したときだけ入り、「あなた」はその人に固定される(選び直せない)。
 * registered = そのメールアドレスのユーザーが登録されているか(なければ、承認の依頼・承認はできない)
 */
export interface MeLock {
  email: string
  registered: boolean
}
let lock: MeLock | null = null
export const meLock = (): MeLock | null => lock
export const setMeLock = (v: MeLock | null) => {
  lock = v
  meListeners.forEach((f) => f())
}
/** 「あなた」が変わったら知らせる(週の帯と配信カードなど、別の場所で選び直しても、そろえるため) */
export const onMeChange = (f: () => void) => {
  meListeners.add(f)
  return () => {
    meListeners.delete(f)
  }
}

export interface EventInput {
  action: EventAction
  /** 週の初め(YYYY-MM-DD)。配信の出来事なら、配信日時から求める */
  weekStart?: string
  card?: { id: string; name?: string; scheduledAt?: string }
  from?: DeliveryCardStatus
  to?: DeliveryCardStatus
  note?: string
}

export async function logEvent(e: EventInput): Promise<void> {
  const week = e.weekStart ?? (e.card?.scheduledAt ? weekKeyOf(new Date(e.card.scheduledAt)) : undefined)
  try {
    await EventsService.create({
      action: e.action,
      week_start: week,
      ...(e.card ? { delivery_card_id: e.card.id, card_name: e.card.name } : {}),
      from_status: e.from,
      to_status: e.to,
      actor: myName(),
      note: e.note,
    })
  } catch {
    // 記録できなくても、操作は続ける(上の説明)
  }
}
