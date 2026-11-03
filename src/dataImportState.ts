// データの取り込みの管理(settings.dataimport)の、画面の中で共有する様子。
// ⚙ の赤い点(止めた・古い出力がある)は、管理する人にだけ出す。管理の画面で読んだ状態も、ここに入れて点をそろえる
import { useEffect, useSyncExternalStore } from 'react'
import { DataImportService, type ImportStatus } from './data/dataImport'
import { usePeople } from './people'
import { myUserId, onMeChange } from './history'

/** 管理する人(管理者か開発者。FeaturesManager の canEdit と、サーバーの admin_denied と同じ) */
export function useCanManage(): boolean {
  const people = usePeople()
  const meId = useSyncExternalStore(onMeChange, myUserId)
  const me = people.users.find((u) => u.id === meId)
  return !!me && (me.role === 'admin' || me.is_developer === 1)
}

/** 目を向けてほしい出力があるか(止めた・古い) */
export const needsAttention = (s: ImportStatus | null | undefined): boolean => !!s?.outputs.some((o) => o.status === 'error' || o.stale)

let last: ImportStatus | null = null
const listeners = new Set<() => void>()
export function setImportStatus(s: ImportStatus | null): void {
  last = s
  listeners.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => void listeners.delete(f)
}

// 点のための読み直しの間隔。定期の取り込みの記録を見るだけなので、短くしない(DB を起こし続けないように)
const POLL_MS = 10 * 60_000

/** ⚙ の赤い点。on = 機能が公開されていて、管理する人のとき(それ以外は読まない) */
export function useImportAttention(on: boolean): boolean {
  const s = useSyncExternalStore(subscribe, () => last)
  useEffect(() => {
    if (!on) return
    let alive = true
    const read = async () => {
      if (document.hidden) return
      const r = await DataImportService.status()
      if (alive && r.data) setImportStatus(r.data)
    }
    void read()
    const id = window.setInterval(() => void read(), POLL_MS)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [on])
  return on && needsAttention(s)
}
