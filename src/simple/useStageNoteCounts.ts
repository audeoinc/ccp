// 左のバーの「やり取り」に出す数(その段の、まだ済んでいない書き込みと、済んでいないタスク)。制作・結果の面で同じ数え方(optimize-survey の 2 章。2026-11-02)。
// 欄を開け閉めしたとき(deps)と、タスクを足した・済みにしたとき(bump)に数え直す。開いているやり取りの欄が数を知らせてきたら setTalk で合わせる
import { useEffect, useState } from 'react'
import { CardNotesService } from '../data/cardNotes'
import { isThreadRoot, stageOf } from '../notesStage'

export function useStageNoteCounts(cardId: string, stage: 'production' | 'results', deps: readonly unknown[]) {
  const [counts, setCounts] = useState({ talk: 0, tasks: 0 })
  const [version, setVersion] = useState(0)
  useEffect(() => {
    let alive = true
    CardNotesService.getAll({ filter: `delivery_card_id eq ${cardId}`, orderBy: ['created_on asc'] })
      .then((r) => {
        if (!alive) return
        const notes = r.success ? (r.data ?? []) : []
        setCounts({ talk: notes.filter((x) => !x.resolved && isThreadRoot(x) && stageOf(x) === stage).length, tasks: notes.filter((x) => !x.resolved && x.kind === 'task').length })
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId, stage, version, ...deps])
  return {
    counts,
    /** 開いているやり取りの欄が知らせてきた、未解決の書き込みの数 */
    setTalk: (n: number) => setCounts((c) => ({ ...c, talk: n })),
    /** 数え直す */
    bump: () => setVersion((v) => v + 1),
  }
}
