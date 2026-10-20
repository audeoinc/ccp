// 表 process_interviews の読み書き。サーバーの /api/data/process_interviews を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ProcessInterview, ProcessInterviewFields } from '../models/processInterviews'
import { tableService } from '../gcp/services'

export const ProcessInterviewsService = tableService<ProcessInterview, ProcessInterviewFields>('process_interviews')
