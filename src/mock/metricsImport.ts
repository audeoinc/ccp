// 撮影・デモ用: 指標の CSV の取り込み(src/data/metricsImport.ts)の身代わり。本物(server/ccp/metrics.py)と同じく、
// ファイルにある週 × 市場の行を置き換える。細かい確かめ(月曜か・数字か)は本物だけが行う(ここは見た目の確認用)
import { parseCsv } from '../csv'
import { tables } from './db'
import { guid } from './seed'
import type { MetricsImportResult } from '../data/metricsImport'

const num = (v?: string) => {
  const s = (v ?? '').trim().replace(/[,¥$]/g, '')
  if (!s) return undefined
  return s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s)
}

export async function importMetricsCsv(filename: string, content: string): Promise<MetricsImportResult> {
  const rows = parseCsv(content)
  const head = Object.keys(rows[0] ?? {})
  const kind = head.includes('product_code') ? 'product' : head.includes('category') ? 'category' : undefined
  if (!kind) return { error: 'product_code か category の列がありません' }
  const key = kind === 'product' ? 'product_code' : 'category'
  const table = tables[kind === 'product' ? 'ProductMetricsService' : 'CategoryMetricsService']
  const weeks = new Set(rows.map((r) => `${r.week_start}|${(r.market ?? '').toUpperCase()}`))
  for (let i = table.length - 1; i >= 0; i--) if (weeks.has(`${table[i].week_start}|${table[i].market}`)) table.splice(i, 1)
  const now = new Date().toISOString()
  for (const r of rows) {
    table.push({
      id: guid(`metric:${kind}:${r.week_start}:${r[key]}:${r.metric}:${now}`),
      week_start: r.week_start,
      market: (r.market ?? '').toUpperCase(),
      [key]: r[key],
      metric: (r.metric ?? '').toLowerCase(),
      value: num(r.value),
      rank: num(r.rank),
      rank_of: num(r.rank_of),
      wow: num(r.wow),
      mom: num(r.mom),
      yoy: num(r.yoy),
      source_file: filename,
      imported_at: now,
    })
  }
  return { kind, count: rows.length, problems: [], weeks: [...weeks].map((w) => ({ week_start: w.split('|')[0], market: w.split('|')[1], rows: rows.filter((r) => `${r.week_start}|${(r.market ?? '').toUpperCase()}` === w).length })) }
}
