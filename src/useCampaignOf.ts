// 配信カードの親のキャンペーン(X79)を読む。カレンダーなどの一覧の読み込みに頼らず、開いたカードの分だけ
import { useEffect, useState } from 'react'
import type { Campaign } from './models/campaigns'
import { CampaignsService } from './data/campaigns'

// 一度読んだキャンペーン。きょうだいの配信カードに切り替えると配信カードを付け直すので、読み終わるまで帯が消えて、
// 上の高さが変わってチカっと見えていた(2026-10-28 利用者)。前に読んだものを先に出し、裏で読み直す
const cache = new Map<string, Campaign | null>()

/**
 * 一覧で読んだキャンペーンを、先に入れておく(useCampaigns から)。配信カード・制作の画面を最初に開いたとき、キャンペーンを読み終わってから
 * 帯が出て、上の高さが変わり、プレビューの倍率も合わせ直してチラついていた(2026-10-30 利用者)。一覧で読んであれば、開いた最初の描画から帯を出す
 */
export function primeCampaigns(rows: Campaign[]) {
  for (const c of rows) cache.set(c.id, c)
}

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
  // 読み終わる前でも、前に読んだもの(一覧で入れたものも)があれば、それを出す
  if (!campaignId) return null
  return loaded?.id === campaignId ? loaded.campaign : (cache.get(campaignId) ?? null)
}
