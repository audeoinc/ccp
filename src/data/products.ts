// 表 products の読み書き。サーバーの /api/data/products を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { Product, ProductFields } from '../models/products'
import { tableService } from '../gcp/services'

export const ProductsService = tableService<Product, ProductFields>('products')
