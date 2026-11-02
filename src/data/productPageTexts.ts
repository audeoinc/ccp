// 表 product_page_texts の読み書き。サーバーの /api/data/product_page_texts を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ProductPageText, ProductPageTextFields } from '../models/productPageTexts'
import { tableService } from '../gcp/services'

export const ProductPageTextsService = tableService<ProductPageText, ProductPageTextFields>('product_page_texts')
