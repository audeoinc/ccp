// 表 delivery_cards の読み書き。サーバーの /api/data/delivery_cards を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { DeliveryCard, DeliveryCardFields } from '../models/deliveryCards'
import { tableService } from '../gcp/services'

export const DeliveryCardsService = tableService<DeliveryCard, DeliveryCardFields>('delivery_cards')
