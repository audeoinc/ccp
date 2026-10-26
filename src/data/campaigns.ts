// 表 campaigns の読み書き。サーバーの /api/data/campaigns を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { Campaign, CampaignFields } from '../models/campaigns'
import { tableService } from '../gcp/services'

export const CampaignsService = tableService<Campaign, CampaignFields>('campaigns')
