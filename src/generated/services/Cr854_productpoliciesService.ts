// テーブル cr854_productpolicies の読み書き。サーバーの /api/data/cr854_productpolicies を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { Cr854_productpolicies, Cr854_productpoliciesBase } from '../models/Cr854_productpoliciesModel'
import { tableService } from '../../gcp/services'

export const Cr854_productpoliciesService = tableService<Cr854_productpolicies, Cr854_productpoliciesBase>('cr854_productpolicies')
