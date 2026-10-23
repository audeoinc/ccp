// 表 dev_requests(開発へのリクエスト)の読み書き。サーバーの /api/data/dev_requests を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { DevRequest, DevRequestFields } from '../models/devRequests'
import { tableService } from '../gcp/services'

export const DevRequestsService = tableService<DevRequest, DevRequestFields>('dev_requests')
