// 表 ad_spends(外部広告の出稿の記録。X49)の読み書き。サーバーの /api/data/ad_spends を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { AdSpend, AdSpendFields } from '../models/adSpends'
import { tableService } from '../gcp/services'

export const AdSpendsService = tableService<AdSpend, AdSpendFields>('ad_spends')
