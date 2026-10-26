// キャンペーン(配信カードの親。X79)を読む。月のカレンダー(キャンペーン単位)と時間帯別(札のキャンペーン名・線の色)が使う。
// カードの campaign_id の組が変わったら読み直す(キャンペーンを作った・カードを入れたとき。名前は変わることが少ないので、毎回は読まない)
import { useEffect, useMemo, useState } from 'react'
import type { Campaign } from './models/campaigns'
import type { DeliveryCard } from './models/deliveryCards'
import { CampaignsService } from './data/campaigns'

export function useCampaigns(cards: Pick<DeliveryCard, 'campaign_id'>[]): Map<string, Campaign> {
  const key = useMemo(() => [...new Set(cards.map((c) => c.campaign_id).filter(Boolean))].sort().join(','), [cards])
  const [rows, setRows] = useState<Campaign[]>([])
  useEffect(() => {
    if (!key) return
    let alive = true
    void CampaignsService.getAll().then((r) => {
      if (alive && r.success) setRows(r.data ?? [])
    })
    return () => {
      alive = false
    }
  }, [key])
  return useMemo(() => new Map(rows.map((c) => [c.id, c])), [rows])
}
