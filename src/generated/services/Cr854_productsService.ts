// テーブル cr854_products の読み書き。サーバーの /api/data/cr854_products を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { Cr854_products, Cr854_productsBase } from '../models/Cr854_productsModel'
import { tableService } from '../../gcp/services'

export const Cr854_productsService = tableService<Cr854_products, Cr854_productsBase>('cr854_products')
