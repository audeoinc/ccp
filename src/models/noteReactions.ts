// 表 note_reactions(やり取りの書き込みへのリアクション。PR6)の、1 行の型と選択肢。列を変えたら、server/schema.json と一緒に直す。
// Teams のような軽い返事。状態は変えない(「受け取った」のような、状態を進めるものは、制作のページのボタン)

export const NoteReactionKind = {
  ok: '了解',
  looking: '見ています',
  doing: '対応します',
  thanks: 'ありがとう',
  question: '確認したい',
} as const
export type NoteReactionKind = keyof typeof NoteReactionKind

/** 書き込める列 */
export interface NoteReactionFields {
  card_note_id?: string
  user_id?: string
  /** 押した人の、その時の名前 */
  user_name?: string
  kind?: NoteReactionKind
}

/** 読んだ 1 行 */
export interface NoteReaction extends NoteReactionFields {
  id: string
  created_on?: string
}
