// 表 country_settings の読み書き。サーバーの /api/data/country_settings を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { CountrySetting, CountrySettingFields } from '../models/countrySettings'
import { tableService } from '../gcp/services'

export const CountrySettingsService = tableService<CountrySetting, CountrySettingFields>('country_settings')
