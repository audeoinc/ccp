// 配信カードの親のキャンペーン(X79)を読む。カレンダーなどの一覧の読み込みに頼らず、開いたカードの分だけ
import { useEffect, useState } from 'react'
import type { Campaign } from './models/campaigns'
import { CampaignsService } from './data/campaigns'

/** 入っていなければ(読めなければ)null */
export function useCampaignOf(campaignId?: string | null): Campaign | null {
  // 読んだときの id と組で持ち、別のカードに替わったら、読み終わるまで前のキャンペーンを出さない
  const [loaded, setLoaded] = useState<{ id: string; campaign: Campaign | null } | null>(null)
  useEffect(() => {
    if (!campaignId) return
    let alive = true
    void CampaignsService.get(campaignId).then((r) => {
      if (alive) setLoaded({ id: campaignId, campaign: r.success ? r.data : null })
    })
    return () => {
      alive = false
    }
  }, [campaignId])
  return campaignId && loaded?.id === campaignId ? loaded.campaign : null
}
