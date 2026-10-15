// テーブル cr854_deliveryproducts の読み書き。サーバーの /api/data/cr854_deliveryproducts を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { Cr854_deliveryproducts, Cr854_deliveryproductsBase } from '../models/Cr854_deliveryproductsModel'
import { tableService } from '../../gcp/services'

export const Cr854_deliveryproductsService = tableService<Cr854_deliveryproducts, Cr854_deliveryproductsBase>('cr854_deliveryproducts')
