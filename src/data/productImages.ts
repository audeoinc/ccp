// 表 product_images の読み書き。サーバーの /api/data/product_images を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ProductImage, ProductImageFields } from '../models/productImages'
import { tableService } from '../gcp/services'

export const ProductImagesService = tableService<ProductImage, ProductImageFields>('product_images')
