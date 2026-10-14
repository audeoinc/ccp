// 承認の履歴(バックログ W6)の、記録の入り口。週の操作・配信のステータスの変更から呼ぶ。
// 記録に失敗しても、本来の操作(保存・週の確定)は止めない(履歴は、あとから経緯を追うためのもので、操作の条件ではないため)
import { Cr854_eventsService, type EventAction } from './gcpdata/Cr854_eventsService'
import { loadPref, savePref } from './settings'
import { weekKeyOf } from './weekLock'

// 操作した人の名前。ログインで人を見分けないので、画面で入れた名前を、ブラウザごとに覚えて使う(コメントを書く人と共通)
const NAME_KEY = 'me.name'
export const myName = (): string => loadPref<string>(NAME_KEY, '') || loadPref<string>('comment.author', '')
export const setMyName = (name: string) => savePref(NAME_KEY, name.trim())

export interface EventInput {
  action: EventAction
  /** 週の初め(YYYY-MM-DD)。配信の出来事なら、配信日時から求める */
  weekStart?: string
  card?: { id: string; name?: string; scheduledAt?: string }
  from?: number
  to?: number
  note?: string
}

export async function logEvent(e: EventInput): Promise<void> {
  const week = e.weekStart ?? (e.card?.scheduledAt ? weekKeyOf(new Date(e.card.scheduledAt)) : undefined)
  try {
    await Cr854_eventsService.create({
      cr854_action: e.action,
      cr854_weekstart: week,
      ...(e.card ? { 'cr854_deliverycard@odata.bind': `/cr854_deliverycards(${e.card.id})`, cr854_cardname: e.card.name } : {}),
      cr854_fromstatus: e.from,
      cr854_tostatus: e.to,
      cr854_actor: myName(),
      cr854_note: e.note,
    })
  } catch {
    // 記録できなくても、操作は続ける(上の説明)
  }
}
