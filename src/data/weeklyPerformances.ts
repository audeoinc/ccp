// 表 weekly_performances の読み書き。サーバーの /api/data/weekly_performances を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { WeeklyPerformance, WeeklyPerformanceFields } from '../models/weeklyPerformances'
import { tableService } from '../gcp/services'

export const WeeklyPerformancesService = tableService<WeeklyPerformance, WeeklyPerformanceFields>('weekly_performances')
