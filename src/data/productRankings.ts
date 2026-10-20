// 表 product_rankings の読み書き。サーバーの /api/data/product_rankings を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ProductRanking, ProductRankingFields } from '../models/productRankings'
import { tableService } from '../gcp/services'

export const ProductRankingsService = tableService<ProductRanking, ProductRankingFields>('product_rankings')
