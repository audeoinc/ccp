// 表 delivery_products の読み書き。サーバーの /api/data/delivery_products を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { DeliveryProduct, DeliveryProductFields } from '../models/deliveryProducts'
import { tableService } from '../gcp/services'

export const DeliveryProductsService = tableService<DeliveryProduct, DeliveryProductFields>('delivery_products')
