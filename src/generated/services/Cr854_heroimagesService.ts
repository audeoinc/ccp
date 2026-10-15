// テーブル cr854_heroimages の読み書き。サーバーの /api/data/cr854_heroimages を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { Cr854_heroimages, Cr854_heroimagesBase } from '../models/Cr854_heroimagesModel'
import { tableService } from '../../gcp/services'

export const Cr854_heroimagesService = tableService<Cr854_heroimages, Cr854_heroimagesBase>('cr854_heroimages')
