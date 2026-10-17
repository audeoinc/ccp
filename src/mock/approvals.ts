// 撮影・デモ用の、承認の窓口(/api/approvals)の身代わり。src/data/approvals.ts と同じ形で呼べる(vite.mock.config.ts が差し替える)。
// 判定は、本番のサーバー(server/ccp/approvals.py)と同じ src/approvals.ts を使う。表はメモリ上(src/mock/db.ts の tables)
import { eligibleReviewers, requestOutcome } from '../approvals'
import type { Actor, ApprovalView, DecideInput, RequestInput } from '../data/approvals'
import type { ApprovalRequest } from '../models/approvalRequests'
import type { ApprovalReviewer } from '../models/approvalReviewers'
import { tables } from './db'
import { guid, type Row } from './seed'

type Result<T> = { success: boolean; data?: T; error?: { message: string } }
const ng = <T,>(message: string): Result<T> => ({ success: false, error: { message } })
const LIVE = new Set(['open', 'approved', 'changes_requested'])
const now = () => new Date().toISOString()
const newId = (key: string) => guid(`${key}:${Math.random()}:${Date.now()}`)

const reviewersOf = (requestId: string) => tables.ApprovalReviewersService.filter((r) => r.approval_request_id === requestId) as unknown as ApprovalReviewer[]
const view = (req: Row, requestId: string): ApprovalView => ({ request: structuredClone(req) as unknown as ApprovalRequest, reviewers: structuredClone(reviewersOf(requestId)) })

function setCardStatus(card: Row, status: string) {
  card.status = status
  card.modified_on = now()
}

function logEvent(action: string, actor: Actor, card: Row, weekStart: string | undefined, from: string, to: string, note?: string) {
  tables.EventsService.push({ id: newId('event'), action, week_start: weekStart, delivery_card_id: card.id, card_name: card.name, from_status: from, to_status: to, actor: actor.name, note, created_on: now() })
}

function staleLive(cardId: string) {
  for (const r of tables.ApprovalRequestsService) {
    if (r.delivery_card_id === cardId && LIVE.has(String(r.status))) {
      r.status = 'stale'
      r.closed_at = now()
    }
  }
}

export const ApprovalsService = {
  async request(input: RequestInput): Promise<Result<ApprovalView>> {
    if (!input.actor?.id) return ng('「あなた」を選んでください(承認の依頼・承認には、ユーザーの選択が要ります)')
    if (input.group_ids.length === 0 && input.user_ids.length === 0) return ng('承認グループか承認者を、1 つ以上選んでください')
    if (input.user_ids.includes(input.actor.id)) return ng('自分を承認者にはできません(自分で依頼した配信は、自分では承認できません)')
    const card = tables.DeliveryCardsService.find((c) => c.id === input.delivery_card_id)
    if (!card) return ng('配信カードが見つかりません')
    if (card.status === 'confirmed') return ng('確定した週の配信です。変えるときは、配信カードで理由を入れて保存してください(週がレビューに戻ります)')
    const names = (table: Row[], ids: string[], bad: string) => {
      const out: { id: string; name: string }[] = []
      for (const id of new Set(ids)) {
        const row = table.find((r) => r.id === id && (r.status ?? 'active') === 'active')
        if (!row) throw new Error(bad)
        out.push({ id, name: String(row.name ?? '') })
      }
      return out
    }
    let groups: { id: string; name: string }[]
    let users: { id: string; name: string }[]
    try {
      groups = names(tables.ApprovalGroupsService, input.group_ids, '使えない承認グループが含まれています(消された、または無効)')
      users = names(tables.UsersService, input.user_ids, '使えない承認者が含まれています(消された、または無効)')
    } catch (e) {
      return ng(e instanceof Error ? e.message : String(e))
    }
    staleLive(card.id as string)
    const at = now()
    const req: Row = {
      id: newId('request'),
      delivery_card_id: card.id,
      card_name: card.name,
      requested_by: input.actor.id,
      requested_by_name: input.actor.name,
      rule: input.rule,
      status: 'open',
      requested_at: at,
      note: input.note?.trim() || undefined,
      created_on: at,
    }
    tables.ApprovalRequestsService.push(req)
    for (const g of groups) tables.ApprovalReviewersService.push({ id: newId('reviewer'), approval_request_id: req.id, approval_group_id: g.id, reviewer_name: g.name, decision: 'pending', created_on: at })
    for (const u of users) tables.ApprovalReviewersService.push({ id: newId('reviewer'), approval_request_id: req.id, user_id: u.id, reviewer_name: u.name, decision: 'pending', created_on: at })
    const before = String(card.status ?? 'not_started')
    if (before !== 'reviewing') setCardStatus(card, 'reviewing')
    const all = [...groups, ...users].map((x) => x.name).join(' / ')
    logEvent('request', input.actor, card, input.week_start, before, 'reviewing', `${all}(${input.rule === 'all' ? '全員' : '1 人'})${input.note?.trim() ? ` — ${input.note.trim()}` : ''}`)
    return { success: true, data: view(req, req.id as string) }
  },

  async decide(requestId: string, input: DecideInput): Promise<Result<ApprovalView>> {
    if (!input.actor?.id) return ng('「あなた」を選んでください(承認の依頼・承認には、ユーザーの選択が要ります)')
    const note = input.note?.trim() || undefined
    if (input.decision === 'changes_requested' && !note) return ng('差し戻しには、理由が要ります')
    const req = tables.ApprovalRequestsService.find((r) => r.id === requestId)
    if (!req) return ng('承認の依頼が見つかりません')
    if (req.status !== 'open') return ng('この依頼は、もう受け付けていません(承認済み・差し戻し・古い依頼・取り下げ)')
    if (input.actor.id === req.requested_by) return ng('自分で依頼した配信は、自分では承認できません')
    const reviewers = reviewersOf(requestId)
    const myGroups = tables.ApprovalGroupMembersService.filter((m) => m.user_id === input.actor.id).map((m) => String(m.approval_group_id))
    const able = eligibleReviewers(reviewers, input.actor.id, myGroups, String(req.requested_by ?? ''))
    if (able.length === 0) return ng('この配信の承認者に指名されていません(または、もう決めています)')
    if (input.reviewer_id && !able.includes(input.reviewer_id)) return ng('その相手の分は、あなたは決められません')
    const target = tables.ApprovalReviewersService.find((r) => r.id === (input.reviewer_id ?? able[0]))!
    const at = now()
    Object.assign(target, { decision: input.decision, decided_by: input.actor.id, decided_by_name: input.actor.name, decided_at: at, note, modified_on: at })
    const outcome = requestOutcome(req.rule === 'any' ? 'any' : 'all', reviewersOf(requestId).map((r) => r.decision))
    const card = tables.DeliveryCardsService.find((c) => c.id === req.delivery_card_id)
    if (!card) return ng('配信カードが見つかりません')
    const before = String(card.status ?? 'not_started')
    const slot = String(target.reviewer_name ?? '')
    if (outcome === 'approved') {
      Object.assign(req, { status: 'approved', closed_at: at })
      setCardStatus(card, 'approved')
      logEvent('approve', input.actor, card, input.week_start, before, 'approved', `${slot} — これで承認がそろった`)
    } else if (outcome === 'changes_requested') {
      Object.assign(req, { status: 'changes_requested', closed_at: at })
      tables.CardNotesService.push({ id: newId('comment'), delivery_card_id: card.id, kind: 'comment', author: input.actor.name, body: note, resolved: 0, created_on: at })
      logEvent('reject', input.actor, card, input.week_start, before, before, `${slot} — ${note}`)
    } else {
      logEvent('approve', input.actor, card, input.week_start, before, before, `${slot}(ほかの相手の承認待ち)`)
    }
    return { success: true, data: view(req, requestId) }
  },

  async withdraw(requestId: string, input: { actor: Actor; note?: string; week_start?: string }): Promise<Result<ApprovalView>> {
    if (!input.actor?.id) return ng('「あなた」を選んでください(承認の依頼・承認には、ユーザーの選択が要ります)')
    const req = tables.ApprovalRequestsService.find((r) => r.id === requestId)
    if (!req) return ng('承認の依頼が見つかりません')
    if (req.status !== 'open' && req.status !== 'changes_requested') return ng('この依頼は、取り下げられません(承認済み・古い依頼・取り下げ)')
    if (input.actor.id !== req.requested_by) return ng('依頼を取り下げられるのは、依頼した人だけです')
    Object.assign(req, { status: 'withdrawn', closed_at: now() })
    const card = tables.DeliveryCardsService.find((c) => c.id === req.delivery_card_id)
    if (card) {
      const before = String(card.status ?? 'not_started')
      const after = before === 'reviewing' ? 'not_started' : before
      if (after !== before) setCardStatus(card, after)
      logEvent('withdraw', input.actor, card, input.week_start, before, after, input.note?.trim() || undefined)
    }
    return { success: true, data: view(req, requestId) }
  },

  async reset(input: { delivery_card_id: string }): Promise<Result<{ stale: number }>> {
    const before = tables.ApprovalRequestsService.filter((r) => r.delivery_card_id === input.delivery_card_id && LIVE.has(String(r.status))).length
    staleLive(input.delivery_card_id)
    return { success: true, data: { stale: before } }
  },
}
