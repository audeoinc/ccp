// 表 card_assets(素材)の読み書き。サーバーの /api/data/card_assets を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { CardAsset, CardAssetFields } from '../models/cardAssets'
import { tableService } from '../gcp/services'

export const CardAssetsService = tableService<CardAsset, CardAssetFields>('card_assets')
