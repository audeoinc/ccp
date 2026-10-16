// 表 product_policies の読み書き。サーバーの /api/data/product_policies を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { ProductPolicy, ProductPolicyFields } from '../models/productPolicies'
import { tableService } from '../gcp/services'

export const ProductPoliciesService = tableService<ProductPolicy, ProductPolicyFields>('product_policies')
