// テーブル cr854_layouttemplates の読み書き。サーバーの /api/data/cr854_layouttemplates を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { Cr854_layouttemplates, Cr854_layouttemplatesBase } from '../models/Cr854_layouttemplatesModel'
import { tableService } from '../../gcp/services'

export const Cr854_layouttemplatesService = tableService<Cr854_layouttemplates, Cr854_layouttemplatesBase>('cr854_layouttemplates')
