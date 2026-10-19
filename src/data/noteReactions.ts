// 表 note_reactions の読み書き。サーバーの /api/data/note_reactions を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { NoteReaction, NoteReactionFields } from '../models/noteReactions'
import { tableService } from '../gcp/services'

export const NoteReactionsService = tableService<NoteReaction, NoteReactionFields>('note_reactions')
