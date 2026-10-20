// 表 process_checks の読み書き。サーバーの /api/data/process_checks を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ProcessCheck, ProcessCheckFields } from '../models/processChecks'
import { tableService } from '../gcp/services'

export const ProcessChecksService = tableService<ProcessCheck, ProcessCheckFields>('process_checks')
