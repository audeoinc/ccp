// 商品・カテゴリの週の指標(X48)の CSV の取り込み。サーバーの /api/metrics/import を呼ぶ(読み分けと置き換えは server/ccp/metrics.py)。
// 撮影・デモ用のビルドでは、同じ置き換えをメモリ上で行う身代わり(src/mock/metricsImport.ts)に差し替える。
import { appPath } from '../appRoot'
import { dropSharedReads } from '../gcp/readShare'

export interface MetricsImportResult {
  kind?: 'product' | 'category'
  count?: number
  problems?: { line: number; message: string; where?: string }[]
  weeks?: { week_start: string; market: string; rows: number }[]
  error?: string
}

export async function importMetricsCsv(filename: string, content: string): Promise<MetricsImportResult> {
  try {
    const res = await fetch(appPath('/api/metrics/import'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename, content }) })
    dropSharedReads() // 書いたので、途中の読み込みに相乗りさせない(gcp/readShare.ts)
    const json = (await res.json().catch(() => null)) as { success: boolean; data?: MetricsImportResult; error?: { message: string } } | null
    if (!json) return { error: `${res.status}` }
    return json.success ? { ...json.data } : { ...json.data, error: json.error?.message ?? 'error' }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
