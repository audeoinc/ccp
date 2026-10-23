// 表 delivery_patterns の読み書き。サーバーの /api/data/delivery_patterns を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { DeliveryPattern, DeliveryPatternFields } from '../models/deliveryPatterns'
import { tableService } from '../gcp/services'

export const DeliveryPatternsService = tableService<DeliveryPattern, DeliveryPatternFields>('delivery_patterns')
