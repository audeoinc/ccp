// 表 production_requests の読み書き。サーバーの /api/data/production_requests を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ProductionRequest, ProductionRequestFields } from '../models/productionRequests'
import { tableService } from '../gcp/services'

export const ProductionRequestsService = tableService<ProductionRequest, ProductionRequestFields>('production_requests')
