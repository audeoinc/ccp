// 撮影・デモ用: データの取り込みの管理(src/data/dataImport.ts)の身代わり。BigQuery がなくても画面を確かめられるように、
// 6 つの出力のうち 5 つを設定済みにし、在庫は取り込めている・SKU は止めた・天気予報は古い、などの見本の状態をメモリ上に持つ。
// 取り込み・確認だけ・設定の変更は、このメモリの中だけで動く(本物の判定は server/ccp/bq_import.py だけが行う)
import type { DataImportService as Real, ImportCheck, ImportOutput, ImportRecord, ImportSettings, ImportStatus, ImportSyncResult } from '../data/dataImport'

const CHOICES = [2, 5, 15, 30, 60, 180, 360, 1440]
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()
const later = (iso: string | null | undefined, min: number) => (iso ? new Date(new Date(iso).getTime() + min * 60_000).toISOString() : null)

const settings = { enabled: true, intervals: { spu: 60, sku: 60, sku_stock: 5, weekly: 60, forecast: 60, ranking: 60 } as Record<string, number> }

const DEST: Record<string, string> = { spu: 'products', sku: 'sku', sku_stock: 'sku_stock', weekly: 'weekly_performances', forecast: 'weather_forecast', ranking: 'product_rankings' }
const base = (name: string, label: string, env: string, o: Partial<ImportOutput>): ImportOutput => ({
  name, label, env, dest: DEST[name], status: 'ok', message: '', intervalMin: 60, stale: false, trigger: 'auto', actor: null, repeat: 1, ...o,
})

const outputs: ImportOutput[] = [
  base('spu', '商品(SPU)', 'BQ_SPU', { dataAsOf: ago(180), importedAt: ago(170), rows: 1284, rowsBefore: 1279, triedAt: ago(170), sourceModified: ago(175), checkedAt: ago(12) }),
  base('sku', 'SKU', 'BQ_SKU', {
    status: 'error', message: 'SKU の 31 行が、どの商品(SPU)にも当たりません(例: SK-20931-BLK)。取り込みを止めました',
    dataAsOf: ago(26 * 60), importedAt: ago(25 * 60), rows: 8810, rowsBefore: 8790, triedAt: ago(20), sourceModified: ago(40), checkedAt: ago(20), repeat: 3,
  }),
  base('sku_stock', '在庫', 'BQ_SKU_STOCK', { dataAsOf: ago(8), importedAt: ago(3), rows: 8790, rowsBefore: 8790, triedAt: ago(3), sourceModified: ago(8), checkedAt: ago(3) }),
  base('weekly', '週ごとの実績', 'BQ_WEEKLY', { dataAsOf: ago(3 * 24 * 60), importedAt: ago(3 * 24 * 60 - 30), rows: 5120, rowsBefore: 4980, triedAt: ago(3 * 24 * 60 - 30), sourceModified: ago(3 * 24 * 60), checkedAt: ago(40) }),
  base('forecast', '天気予報', 'BQ_FORECAST', { dataAsOf: ago(2 * 24 * 60), importedAt: ago(2 * 24 * 60 - 10), rows: 336, rowsBefore: 336, triedAt: ago(2 * 24 * 60 - 10), sourceModified: ago(2 * 24 * 60), checkedAt: ago(30), stale: true }),
]
const unconfigured = [{ name: 'ranking', label: '販売チャネルごとの順位', env: 'BQ_RANKING', dest: DEST.ranking }]

const records: ImportRecord[] = [
  { source: 'sku_stock', status: 'ok', dataAsOf: ago(8), sourceModified: ago(8), rows: 8790, message: '8790 行', importedAt: ago(3), checkedAt: ago(3), repeat: 1, trigger: 'auto' },
  { source: 'sku', status: 'error', sourceModified: ago(40), message: outputs[1].message, importedAt: ago(60), checkedAt: ago(20), repeat: 3, trigger: 'auto' },
  { source: 'sku_stock', status: 'ok', dataAsOf: ago(14), sourceModified: ago(14), rows: 8790, message: '8790 行', importedAt: ago(9), checkedAt: ago(9), repeat: 1, trigger: 'auto' },
  { source: 'spu', status: 'ok', dataAsOf: ago(180), sourceModified: ago(175), rows: 1284, message: '1284 行(新しい商品 5)', importedAt: ago(170), checkedAt: ago(170), repeat: 1, trigger: 'manual', actor: '見本 管理者' },
  { source: 'sku', status: 'ok', dataAsOf: ago(26 * 60), sourceModified: ago(26 * 60), rows: 8810, message: '8810 行', importedAt: ago(25 * 60), checkedAt: ago(25 * 60), repeat: 1, trigger: 'startup' },
  { source: 'forecast', status: 'ok', dataAsOf: ago(2 * 24 * 60), sourceModified: ago(2 * 24 * 60), rows: 336, message: '336 行', importedAt: ago(2 * 24 * 60 - 10), checkedAt: ago(2 * 24 * 60 - 10), repeat: 1, trigger: 'auto' },
  { source: 'weekly', status: 'ok', dataAsOf: ago(3 * 24 * 60), sourceModified: ago(3 * 24 * 60), rows: 5120, message: '5120 行', importedAt: ago(3 * 24 * 60 - 30), checkedAt: ago(3 * 24 * 60 - 30), repeat: 1, trigger: 'auto' },
]

function status(): ImportStatus {
  const active = settings.enabled
  return {
    configured: true,
    outputs: outputs.map((o) => {
      const interval = settings.intervals[o.name] ?? 60
      return { ...o, intervalMin: interval, nextCheckAt: active ? later(o.checkedAt, interval) : null }
    }),
    unconfigured,
    auto: { enabled: settings.enabled, envDisabled: false, active, intervals: { ...settings.intervals }, choices: CHOICES },
  }
}

const settingsOut = (): ImportSettings => ({ enabled: settings.enabled, intervals: { ...settings.intervals }, envDisabled: false, choices: CHOICES })
const wait = () => new Promise((r) => setTimeout(r, 600))

export const DataImportService: typeof Real = {
  status: async () => ({ data: status() }),
  sync: async ({ force, names } = {}) => {
    await wait()
    const now = new Date().toISOString()
    const imported: ImportSyncResult['imported'] = []
    const failed: ImportSyncResult['failed'] = []
    for (const o of outputs) {
      if (names?.length && !names.includes(o.name)) continue
      o.checkedAt = now
      // 止めた SKU は、元のデータが直っていないので、何度試しても同じ理由で止まる(回数だけ進む)
      if (o.status === 'error') {
        o.triedAt = now
        o.repeat = (o.repeat ?? 1) + 1
        o.trigger = 'manual'
        failed.push({ name: o.name, message: o.message })
        continue
      }
      if (!force && o.name !== 'sku_stock') continue
      o.rowsBefore = o.rows
      o.importedAt = o.triedAt = now
      o.trigger = 'manual'
      o.stale = false
      if (o.name === 'forecast') o.dataAsOf = now
      imported.push({ name: o.name, rows: o.rows ?? 0, summary: `${o.rows} 行` })
      records.unshift({ source: o.name, status: 'ok', dataAsOf: o.dataAsOf, sourceModified: o.sourceModified, rows: o.rows, message: `${o.rows} 行`, importedAt: now, checkedAt: now, repeat: 1, trigger: 'manual', actor: '見本 管理者' })
    }
    return { data: { ...status(), imported, failed } }
  },
  check: async (names) => {
    await wait()
    const out: ImportCheck['outputs'] = outputs
      .filter((o) => !names?.length || names.includes(o.name))
      .map((o) => ({
        name: o.name,
        label: o.label,
        ok: o.status !== 'error',
        rows: o.name === 'sku' ? 8841 : (o.rows ?? null),
        dataAsOf: o.dataAsOf ?? null,
        issues:
          o.name === 'sku'
            ? [
                { level: 'NG', text: o.message },
                { level: '注意', text: '色の名前が空の行が 12 行あります' },
              ]
            : o.name === 'forecast'
              ? [{ level: '注意', text: '予報の発表時刻が 2 日前です(元のデータの更新が止まっているかもしれません)' }]
              : [],
      }))
    return { data: { configured: true, checkedAt: new Date().toISOString(), outputs: out } }
  },
  history: async (source, limit = 50) => ({ data: records.filter((r) => !source || r.source === source).slice(0, limit) }),
  settings: async () => ({ data: settingsOut() }),
  saveSettings: async (v) => {
    settings.enabled = v.enabled
    Object.assign(settings.intervals, v.intervals)
    return { data: settingsOut() }
  },
}
