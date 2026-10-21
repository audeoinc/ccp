// 表 sku(SKU。正しい出どころは BigQuery)の読み書き。サーバーの /api/data/sku を呼ぶ(src/gcp/services.ts)。
// 画面から書くのは、⚙ の「見本の SKU を作る」(src/skuSample.ts)だけ。撮影・デモ用のビルドでは、サンプルデータに差し替える。
import type { Sku, SkuFields } from '../models/sku'
import { tableService } from '../gcp/services'

export const SkuService = tableService<Sku, SkuFields>('sku')
