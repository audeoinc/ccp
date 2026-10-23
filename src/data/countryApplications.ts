// 表 country_applications の読み書き。サーバーの /api/data/country_applications を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { CountryApplication, CountryApplicationFields } from '../models/countryApplications'
import { tableService } from '../gcp/services'

export const CountryApplicationsService = tableService<CountryApplication, CountryApplicationFields>('country_applications')
