// 表 layout_templates の読み書き。サーバーの /api/data/layout_templates を呼ぶ(src/gcp/services.ts)。
// 撮影・デモ用のビルド(vite.mock.config.ts)では、サンプルデータに差し替える。
import type { LayoutTemplate, LayoutTemplateFields } from '../models/layoutTemplates'
import { tableService } from '../gcp/services'

export const LayoutTemplatesService = tableService<LayoutTemplate, LayoutTemplateFields>('layout_templates')
