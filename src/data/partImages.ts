// 表 part_images(部品の画像。X59 ③)の読み書き。サーバーの /api/data/part_images を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { PartImage, PartImageFields } from '../models/partImages'
import { tableService } from '../gcp/services'

export const PartImagesService = tableService<PartImage, PartImageFields>('part_images')
