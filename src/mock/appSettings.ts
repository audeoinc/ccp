// 撮影・デモ用: 仕事の設定(src/data/appSettings.ts)の身代わり。BigQuery の表の場所は、見本の名前(実在しない)で、
// 起動したときに環境変数から写した、という見本の記録を持つ。保存・接続の確認は、このメモリの中だけで動く
import type { AppSettingsService as Real, SettingsGroup, SettingsView } from '../data/appSettings'

const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const OUTPUTS = ['spu', 'sku', 'sku_stock', 'weekly', 'forecast', 'ranking']
const ENV: Record<string, string> = { spu: 'BQ_SPU', sku: 'BQ_SKU', sku_stock: 'BQ_SKU_STOCK', weekly: 'BQ_WEEKLY', forecast: 'BQ_FORECAST', ranking: 'BQ_RANKING' }

const state: Record<SettingsGroup, Omit<SettingsView, 'saved' | 'choices'>> = {
  bq: {
    values: {
      project: 'sample-project',
      ...Object.fromEntries(OUTPUTS.flatMap((n) => [[n, n === 'ranking' ? '' : `sample-project.ccp_export.${n}`], [`${n}_watch`, n === 'sku_stock' ? 'sample-project.raw.stock' : '']])),
    },
    defaults: Object.fromEntries(['project', ...OUTPUTS.flatMap((n) => [n, `${n}_watch`])].map((k) => [k, ''])),
    env: { project: 'BQ_PROJECT', ...Object.fromEntries(OUTPUTS.flatMap((n) => [[n, ENV[n]], [`${n}_watch`, `${ENV[n]}_WATCH`]])) },
    updatedAt: ago(3 * 24 * 60),
    updatedBy: '環境変数から',
    copiedFromEnvAt: ago(3 * 24 * 60),
    history: [{ at: ago(3 * 24 * 60), by: '環境変数から', source: 'env', changes: ['project', 'spu', 'sku', 'sku_stock', 'sku_stock_watch', 'weekly', 'forecast'] }],
  },
  ai: {
    values: { model: 'gemini-3.5-flash', thinking: 'low', concurrency: 4, outlet_url: '', outlet_timeout: 120 },
    defaults: { model: 'gemini-3.5-flash', thinking: 'low', concurrency: 4, outlet_url: '', outlet_timeout: 120 },
    env: { model: 'GEMINI_MODEL', thinking: 'GEMINI_THINKING', concurrency: 'GEMINI_CONCURRENCY', outlet_url: 'AI_OUTLET_URL', outlet_timeout: 'AI_OUTLET_TIMEOUT' },
    updatedAt: ago(3 * 24 * 60),
    updatedBy: '環境変数から',
    copiedFromEnvAt: ago(3 * 24 * 60),
    history: [{ at: ago(3 * 24 * 60), by: '環境変数から', source: 'env', changes: ['model', 'thinking'] }],
  },
}

const view = (g: SettingsGroup): SettingsView => ({ ...structuredClone(state[g]), saved: true, choices: g === 'ai' ? { thinking: ['minimal', 'low', 'medium', 'high'] } : {} })
const wait = () => new Promise((r) => setTimeout(r, 500))
// 見本: 一覧にあるモデルは呼べる、ほかは見つからない。出口は 127.0.0.1 だけ届く
const MODELS = ['gemini-3.5-flash', 'gemini-3.5-pro', 'gemini-3-flash', 'gemini-2.5-flash', 'gemini-2.5-pro']
const tried = (v: Record<string, string | number>) => {
  const outlet = String(v.outlet_url ?? '')
  const via = outlet ? ('outlet' as const) : ('gemini' as const)
  const ok = outlet ? outlet.startsWith('http://127.0.0.1') : MODELS.includes(String(v.model))
  const message = ok ? '' : outlet ? 'AI の出口(⚙ →「AI の設定」の URL)に届きませんでした: ConnectionError' : 'このモデルは、この環境(プロジェクト・地域)で見つかりません。名前か、GOOGLE_CLOUD_LOCATION を確かめてください。(NotFound: 404)'
  return { ok, seconds: ok ? 1.4 : 0.6, message, via, model: String(v.model) }
}
const shape = (v: string) => !v || (v.split('.').length >= 3 && !/\s/.test(v))

export const AppSettingsService: typeof Real = {
  get: async (g) => ({ data: view(g) }),
  save: async (g, values, force) => {
    await wait()
    if (g === 'ai' && !force && ['model', 'thinking', 'outlet_url', 'outlet_timeout'].some((k) => String(values[k]) !== String(state.ai.values[k]))) {
      const r = tried(values)
      if (!r.ok) return { error: `試しに呼べなかったので、保存していません: ${r.message}`, code: 'try_failed' }
    }
    for (const [k, v] of Object.entries(values)) if (g === 'bq' && k !== 'project' && !shape(String(v))) return { error: `表の場所は <プロジェクト>.<データセット>.<テーブルかビュー> の形で書いてください: ${v}` }
    const s = state[g]
    const changes = Object.keys(values).filter((k) => String(values[k]) !== String(s.values[k]))
    if (!changes.length) return { data: view(g) }
    s.values = { ...s.values, ...values }
    s.updatedAt = new Date().toISOString()
    s.updatedBy = 'Mika Tanaka'
    s.history.unshift({ at: s.updatedAt, by: s.updatedBy, source: 'screen', changes })
    return { data: view(g) }
  },
  tryBq: async (values, names) => {
    await wait()
    const outputs = OUTPUTS.filter((n) => values[n] && (!names?.length || names.includes(n))).map((n) => {
      const v = String(values[n])
      // 見本: 「sample-project.ccp_export.<名前>」の形なら読める、ほかは見つからない
      const found = v === `sample-project.ccp_export.${n}`
      return {
        name: n,
        label: n,
        ok: found,
        rows: found ? 1000 : null,
        // 見本: 在庫だけビュー(更新の合図に見る元の表が要る)、ほかは表
        kind: found ? (n === 'sku_stock' ? 'VIEW' : 'TABLE') : undefined,
        dataAsOf: found ? ago(30) : null,
        issues: found ? [] : [{ level: 'NG', text: `BigQuery を読めません(NotFound: 表 ${v} が見つかりません)` }],
      }
    })
    return { data: { configured: outputs.length > 0, checkedAt: new Date().toISOString(), outputs } }
  },
  aiModels: async (refresh) => {
    await wait()
    return { data: { models: MODELS, at: refresh ? new Date().toISOString() : ago(5 * 60), live: true, error: '', builtin: false } }
  },
  tryAi: async (values) => {
    await wait()
    return { data: tried({ ...state.ai.values, ...values }) }
  },
}
