import { useMemo } from 'react'
import type { CardNote } from './data/cardNotes'
import { todayYmd } from './dates'

/** やり取り(card_notes)から、配信カードごとに数えたもの */
export interface CardNoteStats {
  /** 未解決の質問の数(一覧の列) */
  questionCounts: Map<string, number>
  /** 未解決の質問の宛先・質問した人と、未完了のタスクの担当(絞り込みの「担当」で、その人がかかわる配信も出すため) */
  noteParties: Map<string, Set<string>>
  /** 未完了のタスクの数(一覧の列・週の表示) */
  taskCounts: Map<string, number>
  /** 期日を過ぎた未完了のタスクの数(週の表示で、問題として目立たせる) */
  overdueTasks: Map<string, number>
  /** 未対応のレビューのコメントの数(週の表示・確認の一覧) */
  commentCounts: Map<string, number>
  /** 未対応のレビューのコメント(週の資料に、本文を載せる) */
  openComments: Map<string, CardNote[]>
  /** 確定した週の配信を変えたときの理由(週の状態の帯に、確定後の変更として出す) */
  changeNotes: CardNote[]
}

export function cardNoteStats(notes: CardNote[], today: string): CardNoteStats {
  const counts = new Map<string, number>()
  const tasks = new Map<string, number>()
  const overdue = new Map<string, number>()
  const comments = new Map<string, number>()
  const commentNotes = new Map<string, CardNote[]>()
  const parties = new Map<string, Set<string>>()
  const addParty = (id: string, name?: string) => {
    if (name?.trim()) parties.set(id, (parties.get(id) ?? new Set()).add(name.trim()))
  }
  for (const n of notes) {
    const id = n.delivery_card_id
    if (!id || n.resolved) continue
    // 変更の理由は記録、コメントへの返信はスレッドの一部なので、質問・タスクの数には入れない
    if (n.kind === 'change' || n.kind === 'reply') continue
    if (n.kind === 'comment') {
      // やり取り(2026-10-17 に質問と 1 つにした)は宛先を持てるので、「担当」の絞り込みの候補に足す
      addParty(id, n.assignee)
      comments.set(id, (comments.get(id) ?? 0) + 1)
      commentNotes.set(id, [...(commentNotes.get(id) ?? []), n])
      continue
    }
    if (n.kind === 'task') {
      addParty(id, n.assignee)
      tasks.set(id, (tasks.get(id) ?? 0) + 1)
      if (n.due && n.due.slice(0, 10) < today) overdue.set(id, (overdue.get(id) ?? 0) + 1)
    }
    else {
      // 質問: 誰からでも、誰にでも(宛先は assignee の列)。週の資料では、コメントと同じ「未解決のやり取り」に並べる
      addParty(id, n.author)
      addParty(id, n.assignee)
      counts.set(id, (counts.get(id) ?? 0) + 1)
      commentNotes.set(id, [...(commentNotes.get(id) ?? []), n])
    }
  }
  return {
    questionCounts: counts,
    noteParties: parties,
    taskCounts: tasks,
    overdueTasks: overdue,
    commentCounts: comments,
    openComments: commentNotes,
    changeNotes: notes.filter((n) => n.kind === 'change'),
  }
}

/** やり取りを読み直したときだけ、数え直す(期日を過ぎたかは、読み直した日で決める) */
export function useCardNoteStats(notes: CardNote[]): CardNoteStats {
  return useMemo(() => cardNoteStats(notes, todayYmd()), [notes])
}
