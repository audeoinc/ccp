// 表 layout_template_versions の読み書き。サーバーの /api/data/layout_template_versions を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { LayoutTemplateVersion, LayoutTemplateVersionFields } from '../models/layoutTemplateVersions'
import { tableService } from '../gcp/services'

export const LayoutTemplateVersionsService = tableService<LayoutTemplateVersion, LayoutTemplateVersionFields>('layout_template_versions')
