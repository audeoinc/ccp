// 表 dev_request_votes(開発へのリクエストへの賛同)の読み書き。サーバーの /api/data/dev_request_votes を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { DevRequestVote, DevRequestVoteFields } from '../models/devRequestVotes'
import { tableService } from '../gcp/services'

export const DevRequestVotesService = tableService<DevRequestVote, DevRequestVoteFields>('dev_request_votes')
