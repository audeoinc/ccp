import type { DeliveryCardStatus } from './models/deliveryCards'
// 承認の履歴(バックログ W6)の、記録の入り口。週の操作・配信のステータスの変更から呼ぶ。
// 記録に失敗しても、本来の操作(保存・週の確定)は止めない(履歴は、あとから経緯を追うためのもので、操作の条件ではないため)
import { EventsService, type EventAction } from './data/events'
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
