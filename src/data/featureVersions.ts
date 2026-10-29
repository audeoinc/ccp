// 表 feature_versions(版ごとの公開。X87 の 3.1)の読み書き。サーバーの /api/data/feature_versions を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { FeatureVersionRow, FeatureVersionRowFields } from '../models/featureVersions'
import { tableService } from '../gcp/services'

export const FeatureVersionsService = tableService<FeatureVersionRow, FeatureVersionRowFields>('feature_versions')
