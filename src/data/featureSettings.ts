// 表 feature_settings(機能ごとの上書き。X87)の読み書き。サーバーの /api/data/feature_settings を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { FeatureSetting, FeatureSettingFields } from '../models/featureSettings'
import { tableService } from '../gcp/services'

export const FeatureSettingsService = tableService<FeatureSetting, FeatureSettingFields>('feature_settings')
