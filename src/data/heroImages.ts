// 表 hero_images の読み書き。サーバーの /api/data/hero_images を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { HeroImage, HeroImageFields } from '../models/heroImages'
import { tableService } from '../gcp/services'

export const HeroImagesService = tableService<HeroImage, HeroImageFields>('hero_images')
