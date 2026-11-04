// 撮影・デモ用: 設定の型(src/data/settingsTemplate.ts)の身代わり。読み込むと、データの取り込みの設定が確認待ちになる
import type { SettingsTemplateService as Real } from '../data/settingsTemplate'
import { mockSetTemplatePending } from './appSettings'
import { mockTurnOffSchedule } from './dataImport'

const wait = () => new Promise((r) => setTimeout(r, 500))

export const SettingsTemplateService: typeof Real = {
  export: async () => ({
    data: {
      kind: 'ccp-settings-template',
      version: 1,
      exportedAt: new Date().toISOString(),
      dropped: [],
      groups: { ai: { model: 'gemini-3.5-flash', thinking: 'low', concurrency: 4, outlet_url: '', outlet_timeout: 120 }, bq: { project: 'sample-project', spu: 'sample-project.ccp_export.spu' }, 'bq.sync': { enabled: false, intervals: {} } },
    },
  }),
  import: async (template) => {
    await wait()
    if ((template as { kind?: string })?.kind !== 'ccp-settings-template') return { error: '設定の型のファイルではありません' }
    mockSetTemplatePending(true)
    mockTurnOffSchedule()
    return { data: { dropped: ['ai.outlet_url'], pending: true } }
  },
  confirm: async () => {
    await wait()
    mockSetTemplatePending(false)
    return { data: { pending: false } }
  },
}
