// 配信の型(ST9)の見本。⚙ →「見本のデータ」から作る(利用者の依頼 2026-10-23。本番にも用意する)。
// その国の型がもうあれば、何も作らない(人が作った型を変えないため)
import { DeliveryPatternsService } from './data/deliveryPatterns'
import type { DeliveryPatternFields } from './models/deliveryPatterns'

/**
 * US の見本。アメリカの EC のメール・アプリでよくある 1 週間の流れ:
 * 月曜の朝に新作、週の半ばに特集、木曜の夕方にアプリで期間限定、金曜の朝に週末のセール、土曜にアプリで再入荷、日曜の夕方に会員向け
 */
function usPatterns(): DeliveryPatternFields[] {
  return [
    { name: 'Monday New Arrivals', country: 'US', weekday: 1, time: '09:00', channel: 'email', theme_type: 'new', layout_key: 'standard4', sort_order: 0 },
    { name: 'Midweek Edit', country: 'US', weekday: 3, time: '11:00', channel: 'email', theme_type: 'season', layout_key: 'story', sort_order: 0 },
    { name: 'Thursday Flash Deal', country: 'US', weekday: 4, time: '18:00', channel: 'app', theme_type: 'limited', layout_key: 'push-sale', sort_order: 0 },
    { name: 'Weekend Sale Preview', country: 'US', weekday: 5, time: '09:00', channel: 'email', theme_type: 'sale', layout_key: 'sale', sort_order: 0 },
    { name: 'Back in Stock', country: 'US', weekday: 6, time: '10:00', channel: 'app', theme_type: 'restock', layout_key: 'push-product', sort_order: 0 },
    { name: "Sunday Members' Picks", country: 'US', weekday: 0, time: '17:00', channel: 'email', theme_type: 'member', layout_key: 'spotlight', sort_order: 0 },
  ]
}

/** US の型の見本を作る。作った数(US の型がもうあれば 0)を返す */
export async function createUsSamplePatterns(): Promise<number> {
  const have = await DeliveryPatternsService.getAll({ filter: "country eq 'US'", top: 1 })
  if (!have.success) throw new Error(have.error?.message ?? 'Could not read patterns')
  if ((have.data ?? []).length > 0) return 0
  let n = 0
  for (const p of usPatterns()) {
    const r = await DeliveryPatternsService.create(p)
    if (!r.success) throw new Error(r.error?.message ?? 'Could not create a pattern')
    n += 1
  }
  return n
}
