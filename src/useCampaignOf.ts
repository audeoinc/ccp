// 配信カードの親のキャンペーン(X79)を読む。カレンダーなどの一覧の読み込みに頼らず、開いたカードの分だけ
import { useEffect, useState } from 'react'
import type { Campaign } from './models/campaigns'
import { CampaignsService } from './data/campaigns'

// 一度読んだキャンペーン。きょうだいの配信カードに切り替えると配信カードを付け直すので、読み終わるまで帯が消えて、
// 上の高さが変わってチカっと見えていた(2026-10-28 利用者)。前に読んだものを先に出し、裏で読み直す
const cache = new Map<string, Campaign | null>()

/** 入っていなければ(読めなければ)null */
export function useCampaignOf(campaignId?: string | null): Campaign | null {
  // 読んだときの id と組で持ち、別のカードに替わったら、読み終わるまで前のキャンペーンを出さない
  const [loaded, setLoaded] = useState<{ id: string; campaign: Campaign | null } | null>(() => (campaignId && cache.has(campaignId) ? { id: campaignId, campaign: cache.get(campaignId) ?? null } : null))
  useEffect(() => {
    if (!campaignId) return
    let alive = true
    void CampaignsService.get(campaignId).then((r) => {
      const campaign = r.success ? r.data : null
      cache.set(campaignId, campaign)
      if (alive) setLoaded({ id: campaignId, campaign })
    })
    return () => {
      alive = false
    }
  }, [campaignId])
  return campaignId && loaded?.id === campaignId ? loaded.campaign : null
}
