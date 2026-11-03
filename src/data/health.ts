// 設定の健康診断(settings.setup)。サーバーは server/ccp/health.py の /api/settings/health(管理する人だけ)。
// python -m ccp.cli check と同じ行を返す。撮影・デモ用のビルドでは、見本の結果を返す身代わり(src/mock/health.ts)に差し替える
import { callApi } from '../gcp/services'

/** ok = 済み / missing = 足りない / failed = 確認に失敗 / warn = 注意 */
export type HealthStatus = 'ok' | 'missing' | 'failed' | 'warn'

export interface HealthItem {
  /** 組(db / google / ai / bq / sync / assets / guard / static) */
  area: string
  status: HealthStatus
  text: string
  /** 直し方 */
  fix: string
  /** ⚙ で直す所(ai / dataimport)。空なら、サーバーの設定で直す */
  goto: string
}

export interface HealthReport {
  items: HealthItem[]
  counts: Record<HealthStatus, number>
  checkedAt: number
}

type Res<T> = { data?: T; error?: string }

async function call<T>(url: string): Promise<Res<T>> {
  const r = await callApi<T>('GET', url)
  return r.success && r.data !== undefined ? { data: r.data } : { error: r.error?.message ?? 'error' }
}

export const HealthService = {
  /** すべて確かめる(AI を 1 回呼び、BigQuery の表を読む。数秒〜十数秒) */
  check: () => call<HealthReport>('/api/settings/health'),
  /** ⚙ の赤い点のための数(起動のとき・最後に確かめた結果。AI は呼ばない) */
  summary: () => call<Record<HealthStatus, number>>('/api/settings/health/summary'),
}
