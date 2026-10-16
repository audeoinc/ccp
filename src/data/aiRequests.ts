// AI の依頼。表ではなく、サーバーの /api/ask(Gemini)に問い合わせる(src/gcp/ai.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルの返答に差し替える。
import { makeAiRequestService } from '../gcp/ai'

export const AiRequestsService = makeAiRequestService()
