// 依頼中の承認(approval_requests の open)と、その相手の行を、画面全体で 1 回読んで持つ(バックログ U5・U6)。
// ヘッダーの「自分宛ての依頼」と、週の帯の「まとめて依頼」「自分宛てをまとめて承認」の数に使う。
// 「自分宛て」は、通知の表(送る箱)ではなく、いまの依頼から計算する(通知の行は写しで、だれかが済ませたあとも残るため)
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ApprovalRequestsService } from './data/approvalRequests'
import { ApprovalReviewersService } from './data/approvalReviewers'
import type { ApprovalRequest } from './models/approvalRequests'
import type { ApprovalReviewer } from './models/approvalReviewers'
import { eligibleReviewers } from './approvals'
import { myUserId, onMeChange } from './history'
import { groupsOf, usePeople } from './people'

export interface InboxItem {
  request: ApprovalRequest
  /** 自分が決められる相手の行(本人の指名 → グループの順) */
  reviewerIds: string[]
  /** その相手の名前(「MD として」と見せるため) */
  slot: string
}

export interface ApprovalInbox {
  loaded: boolean
  /** 依頼中の依頼(配信ごとに 1 つ) */
  open: ApprovalRequest[]
  /** 自分宛て(自分が決められる依頼) */
  mine: InboxItem[]
  /** 配信に依頼中の依頼があるか */
  hasOpen: (cardId: string) => boolean
  /** 自分宛てのうち、その配信の分 */
  mineFor: (cardIds: Iterable<string>) => InboxItem[]
  reload: () => Promise<void>
  /** 「あなた」のユーザーの id(空なら未選択) */
  meId: string
}

const subscribeMe = (f: () => void) => onMeChange(f)

/** 配信の一覧が変わったとき(読み直し)と、「あなた」を選び直したときに読み直す */
export function useApprovalInbox(cardsVersion: unknown): ApprovalInbox {
  const people = usePeople()
  const meId = useSyncExternalStore(subscribeMe, myUserId)
  const [open, setOpen] = useState<ApprovalRequest[] | null>(null)
  const [reviewers, setReviewers] = useState<ApprovalReviewer[]>([])

  const reload = useCallback(async () => {
    const r = await ApprovalRequestsService.getAll({ filter: `status eq 'open'`, orderBy: ['requested_at desc'] })
    const list = r.success ? (r.data ?? []) : []
    // 相手の行は、依頼ごとに読む(依頼中の数は多くても週に数十なので、まとめて 1 回では読まない)
    const rows = await Promise.all(list.map((q) => ApprovalReviewersService.getAll({ filter: `approval_request_id eq '${q.id}'`, orderBy: ['created_on'] })))
    setOpen(list)
    setReviewers(rows.flatMap((x) => (x.success ? (x.data ?? []) : [])))
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload, cardsVersion])

  const myGroups = useMemo(() => groupsOf(people, meId), [people, meId])
  const mine = useMemo<InboxItem[]>(() => {
    if (!open || !meId) return []
    return open.flatMap((q) => {
      const rows = reviewers.filter((r) => r.approval_request_id === q.id)
      const ids = eligibleReviewers(rows, meId, myGroups, q.requested_by)
      if (ids.length === 0) return []
      return [{ request: q, reviewerIds: ids, slot: rows.find((r) => r.id === ids[0])?.reviewer_name ?? '' }]
    })
  }, [open, reviewers, meId, myGroups])
  const openCards = useMemo(() => new Set((open ?? []).map((q) => q.delivery_card_id ?? '')), [open])

  return {
    loaded: open !== null,
    open: open ?? [],
    mine,
    hasOpen: (cardId) => openCards.has(cardId),
    mineFor: (cardIds) => {
      const set = new Set(cardIds)
      return mine.filter((m) => set.has(m.request.delivery_card_id ?? ''))
    },
    reload,
    meId,
  }
}
