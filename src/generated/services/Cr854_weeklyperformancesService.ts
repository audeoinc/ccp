// テーブル cr854_weeklyperformances の読み書き。サーバーの /api/data/cr854_weeklyperformances を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { Cr854_weeklyperformances, Cr854_weeklyperformancesBase } from '../models/Cr854_weeklyperformancesModel'
import { tableService } from '../../gcp/services'

export const Cr854_weeklyperformancesService = tableService<Cr854_weeklyperformances, Cr854_weeklyperformancesBase>('cr854_weeklyperformances')
