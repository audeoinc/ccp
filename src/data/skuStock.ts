// 表 sku_stock(SKU の在庫。正しい出どころは BigQuery)の読み書き。サーバーの /api/data/sku_stock を呼ぶ(src/gcp/services.ts)。
// 画面から書くのは、⚙ の「見本の SKU を作る」(src/skuSample.ts)だけ。撮影・デモ用のビルドでは、サンプルデータに差し替える。
import type { SkuStock, SkuStockFields } from '../models/skuStock'
import { tableService } from '../gcp/services'

export const SkuStockService = tableService<SkuStock, SkuStockFields>('sku_stock')
