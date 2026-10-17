// 週の帯の、まとめての承認の操作(バックログ U6)。配信カード 1 本ずつと同じ窓口(ApprovalsService)を、順に呼ぶだけ。
// 「レビューに出す」「まとめて承認」(W2・W9。依頼を見ずにステータスだけ変えていた)を、依頼の仕組みに合わせて置き換えた
import { ApprovalsService, type Actor } from './data/approvals'
import type { DeliveryCard } from './models/deliveryCards'
import { parseIds } from './approvals'
import { isCancelled } from './cancel'
import { activeUsers, ruleFor, type People } from './people'
import { statusRank } from './status'
import type { InboxItem } from './useApprovalInbox'
import { tr } from './i18n'

const STATUS_APPROVED = 'approved'

/** まだ承認されておらず、依頼中の依頼もない配信(まとめて依頼の対象) */
export const needsRequest = (cards: DeliveryCard[], hasOpen: (cardId: string) => boolean) =>
  cards.filter((c) => !isCancelled(c) && statusRank(c.status) < statusRank(STATUS_APPROVED) && !hasOpen(c.id))

/**
 * 週の未依頼の配信を、種別ごとの既定の相手と決まりで、まとめて依頼する。
 * 既定がない種別の配信は飛ばして、名前を返す(配信カードで相手を選んで依頼してもらう)
 */
export async function requestAll(cards: DeliveryCard[], people: People, actor: Actor, weekStart: string): Promise<{ done: string[]; skipped: string[] }> {
  const done: string[] = []
  const skipped: string[] = []
  const users = new Set(activeUsers(people).map((u) => u.id))
  const groups = new Set(people.groups.filter((g) => (g.status ?? 'active') === 'active').map((g) => g.id))
  for (const c of cards) {
    const def = ruleFor(people, c.department)
    const group_ids = parseIds(def?.group_ids).filter((id) => groups.has(id))
    const user_ids = parseIds(def?.user_ids).filter((id) => id !== actor.id && users.has(id))
    if (group_ids.length === 0 && user_ids.length === 0) {
      skipped.push(c.name)
      continue
    }
    const r = await ApprovalsService.request({ delivery_card_id: c.id, actor, rule: def?.rule ?? 'all', group_ids, user_ids, week_start: weekStart })
    if (!r.success) throw new Error(`${c.name}: ${r.error?.message ?? tr('依頼できませんでした', 'Could not request')}`)
    done.push(c.name)
  }
  return { done, skipped }
}

/** 自分宛ての依頼を、まとめて承認する(1 件ずつ、同じ窓口で。途中で失敗したら、そこで止めて理由を返す) */
export async function approveMine(items: InboxItem[], actor: Actor, weekStart: string): Promise<string[]> {
  const done: string[] = []
  for (const m of items) {
    const r = await ApprovalsService.decide(m.request.id, { actor, decision: 'approved', reviewer_id: m.reviewerIds[0], week_start: weekStart })
    if (!r.success) throw new Error(`${m.request.card_name ?? ''}: ${r.error?.message ?? tr('承認できませんでした', 'Could not approve')}`)
    done.push(m.request.card_name ?? '')
  }
  return done
}
