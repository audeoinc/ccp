// 設定の型(settings.setup)。サーバーは server/ccp/settings_template.py の /api/settings/template(管理する人だけ)。
// 秘密と DB のつなぎ先は入らない。撮影・デモ用のビルドでは、身代わり(src/mock/settingsTemplate.ts)に差し替える
import { callApi } from '../gcp/services'

export interface TemplateResult {
  /** 型に入らなかったので、入れ直す項目(ai.outlet_url) */
  dropped: string[]
  /** BigQuery が確認待ちになった */
  pending: boolean
}

type Res<T> = { data?: T; error?: string }

async function call<T>(method: string, url: string, body?: unknown): Promise<Res<T>> {
  const r = await callApi<T>(method, url, body)
  return r.success && r.data !== undefined ? { data: r.data } : { error: r.error?.message ?? 'error' }
}

export const SettingsTemplateService = {
  export: () => call<Record<string, unknown>>('GET', '/api/settings/template'),
  import: (template: unknown) => call<TemplateResult>('POST', '/api/settings/template', template),
  /** いまの表の場所を実際に読んで、NG がなければ確認待ちを解く */
  confirm: () => call<{ pending: boolean }>('POST', '/api/settings/template/confirm'),
}
