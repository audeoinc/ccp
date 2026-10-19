// やり取りが、どの段階の話か(バックログ PR6。docs/PRODUCTION.md)。
// plan = 何を配信するか(企画 ↔ レビュー・承認者。計画の配信カード)/ production = どう見せるか(企画 ↔ 制作。制作のページ)。
// 列 stage が空の古い書き込みは、種類から決める(レビューのコメント = 企画、質問 = 制作。2026-10-17 まで、ちょうどそう分かれていた)
import type { CardNote } from './data/cardNotes'

export type NoteStage = 'plan' | 'production'

export const stageOf = (n: CardNote): NoteStage => n.stage ?? (n.kind === 'comment' ? 'plan' : 'production')

/** スレッドの元になる書き込みか(以前の「質問」と「レビューのコメント」の両方。種類のない古い行は質問) */
export const isThreadRoot = (n: CardNote) => n.kind === 'comment' || (n.kind ?? 'question') === 'question'
