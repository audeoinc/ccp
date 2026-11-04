// 入力が止まって約 1.5 秒で自動で保存する(計画・制作・結果で同じ待ち時間。optimize-survey の 2 章の順 3。2026-11-03)。
// pending は「まだ保存していない打ちかけ」(ないときは null)。変わるたびに数え直し、enabled が false の間は待たない。
// flush は、閉じる・段を切り替える前に、打ちかけをすぐ保存する
import { useEffect, useRef } from 'react'

export const AUTOSAVE_MS = 1500

export function useDebouncedSave<T>(pending: T | null | undefined, save: (value: T) => unknown, enabled = true) {
  // 保存は、待ち終わったときの最新の中身で行う(待ち始めた描画の中身では、間に変わった分が抜けるため)
  const saveRef = useRef(save)
  useEffect(() => {
    saveRef.current = save
  })
  useEffect(() => {
    if (!enabled || pending === null || pending === undefined) return
    const id = window.setTimeout(() => void saveRef.current(pending), AUTOSAVE_MS)
    return () => window.clearTimeout(id)
  }, [pending, enabled])
  return {
    flush: async () => {
      if (enabled && pending !== null && pending !== undefined) await saveRef.current(pending)
    },
  }
}
