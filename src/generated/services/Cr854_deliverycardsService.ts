// テーブル cr854_deliverycards の読み書き。サーバーの /api/data/cr854_deliverycards を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { Cr854_deliverycards, Cr854_deliverycardsBase } from '../models/Cr854_deliverycardsModel'
import { tableService } from '../../gcp/services'

export const Cr854_deliverycardsService = tableService<Cr854_deliverycards, Cr854_deliverycardsBase>('cr854_deliverycards')
