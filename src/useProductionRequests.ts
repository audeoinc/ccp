// 制作の依頼(production_requests)を、画面全体で読んで、配信ごとの最新の版にまとめる(バックログ PR4)。
// Production の面の配信の箱の色・締め切りの印と、配信カードの「制作の依頼」の札に使う
import { useCallback, useEffect, useMemo, useState } from 'react'
import { tokens } from '@fluentui/react-components'
import { ProductionRequestsService } from './data/productionRequests'
import type { ProductionRequest } from './models/productionRequests'
import type { DeliveryCard } from './models/deliveryCards'
import { statusRank } from './status'
import { tr } from './i18n'

/** 制作の面での状態(依頼の版がない承認済みの配信は「依頼する前」、承認前は「承認待ち」) */
export type ProductionView = 'not_approved' | 'draft' | 'requested' | 'in_progress' | 'done' | 'sent' | 'stale'

export function productionView(card: DeliveryCard, req?: ProductionRequest): ProductionView {
  if (req?.status === 'sent' || req?.status === 'done' || req?.status === 'in_progress' || req?.status === 'requested') return req.status
  if (statusRank(card.status) < statusRank('approved')) return 'not_approved'
  return req?.status === 'stale' ? 'stale' : 'draft'
}

/** 状態の名前(「いま、だれの番か」。docs/PROCESS.md 2 章) */
export const productionLabel = (v: ProductionView): string =>
  ({
    not_approved: tr('承認待ち(制作の前)', 'Awaiting approval (before production)'),
    draft: tr('制作に依頼する前', 'Not requested yet'),
    requested: tr('依頼済み(受け取り待ち)', 'Requested'),
    in_progress: tr('制作している', 'In production'),
    done: tr('制作が終わった', 'Production done'),
    sent: tr('配信のしくみに送った', 'Sent to delivery system'),
    stale: tr('企画が変わりました', 'Plan changed'),
  })[v]

/** 状態の色(カレンダーの箱の線と背景。承認前は薄いグレー) */
export const productionColor = (v: ProductionView): string =>
  ({
    not_approved: tokens.colorNeutralStroke1,
    draft: tokens.colorPaletteMarigoldBorderActive,
    requested: tokens.colorPaletteBlueBorderActive,
    in_progress: tokens.colorPaletteBlueBorderActive,
    done: tokens.colorPaletteGreenBorderActive,
    sent: tokens.colorPaletteGreenBorderActive,
    stale: tokens.colorPaletteRedBorderActive,
  })[v]

export function useProductionRequests(version: unknown) {
  const [rows, setRows] = useState<ProductionRequest[]>([])
  const reload = useCallback(async () => {
    const r = await ProductionRequestsService.getAll()
    setRows(r.success ? (r.data ?? []) : [])
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload, version])
  // 配信ごとの、いちばん新しい版
  const latest = useMemo(() => {
    const m = new Map<string, ProductionRequest>()
    for (const r of rows) {
      const id = r.delivery_card_id ?? ''
      const cur = m.get(id)
      if (!cur || Number(r.version ?? 0) > Number(cur.version ?? 0)) m.set(id, r)
    }
    return m
  }, [rows])
  return { latest, reload }
}
