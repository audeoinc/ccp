// ⚙ の「開発・管理」の見本のデータを作る(サーバーの /api/ads/sample・/api/impact/sample。中身は server/ccp/ads.py・impact.py)。
// 前に作った見本は置き換わり、取り込んだ本物のデータ・画面から記録した本物の記録は消さない
import { appPath } from '../appRoot'

/** 外部広告の見本(作った行の数) */
export async function createAdSamples(): Promise<{ success: boolean; data?: { rows: number } }> {
  const res = await fetch(appPath('/api/ads/sample'), { method: 'POST' })
  return (await res.json()) as { success: boolean; data?: { rows: number } }
}

/** 配信の効果の見本(AI に渡した学びの記録・ホールドアウトとの比べ。見本を作った配信の数) */
export async function createImpactSamples(): Promise<{ success: boolean; data?: { lifts: number } }> {
  const res = await fetch(appPath('/api/impact/sample'), { method: 'POST' })
  return (await res.json()) as { success: boolean; data?: { lifts: number } }
}
