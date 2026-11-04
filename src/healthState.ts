// 設定の健康診断(settings.setup)の、⚙ の赤い点。足りない・確認に失敗がある間、管理する人にだけ出す。
// 「設定の状態」で確かめた数も、ここに入れて点をそろえる(直したのに点が残る、をなくす)
import { useEffect, useSyncExternalStore } from 'react'
import { HealthService, type HealthStatus } from './data/health'

let last: Record<HealthStatus, number> | null = null
const listeners = new Set<() => void>()
export function setHealthCounts(c: Record<HealthStatus, number> | null): void {
  last = c
  listeners.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => void listeners.delete(f)
}

// サーバーは起動のとき・最後に確かめた結果を覚えていて、古ければ軽く確かめ直す(AI は呼ばない)。点のためなので、短くしない
const POLL_MS = 30 * 60_000

/** ⚙ の赤い点。on = 機能が公開されていて、管理する人のとき(それ以外は読まない) */
export function useHealthAttention(on: boolean): boolean {
  const c = useSyncExternalStore(subscribe, () => last)
  useEffect(() => {
    if (!on) return
    let alive = true
    const read = async () => {
      if (document.hidden) return
      const r = await HealthService.summary()
      if (alive && r.data) setHealthCounts(r.data)
    }
    void read()
    const id = window.setInterval(() => void read(), POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [on])
  return on && !!c && c.missing + c.failed > 0
}
