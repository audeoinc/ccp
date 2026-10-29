// 表 feature_logs(機能の公開・非公開の記録。X87 の 3.1)の読み書き。サーバーの /api/data/feature_logs を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { FeatureLog, FeatureLogFields } from '../models/featureLogs'
import { tableService } from '../gcp/services'

export const FeatureLogsService = tableService<FeatureLog, FeatureLogFields>('feature_logs')
