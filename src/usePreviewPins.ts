import { useCallback, useEffect, useState } from 'react'
import type { PinTarget } from './PinFloat'
import { focusPin } from './pinStore'
import { forgetLinkedPin, linkedPin } from './pinActions'

/**
 * プレビューのピン(場所を指して書く書き込み)の、画面ごとの状態。配信カード・シンプルな配信カード・制作のページで同じ。
 * - placing: 場所を選んでいる間(プレビューを押しても編集しない)
 * - target: 開いているピンのフロート(PinFloat)。リンク(pin=…)で開いたときは、そのピンのフロートを開いて始める
 *   (その画面の段階のピンでなければ、ピンが見つからず出ない)
 */
export function usePreviewPins() {
  const [placing, setPlacing] = useState(false)
  const endPlacing = useCallback(() => setPlacing(false), [])
  const [target, setTarget] = useState<PinTarget | null>(() => {
    const id = linkedPin()
    return id ? { noteId: id } : null
  })
  useEffect(() => {
    const id = linkedPin()
    if (id) focusPin(id)
  }, [])
  // ピンを押した(noteId)・場所を打った(pending)ときに、フロートを開く
  const openThreads = useCallback((noteId?: string) => setTarget(noteId ? { noteId } : { pending: true }), [])
  // 閉じたら、リンクで開いたピンも忘れる(開き直したときに、また開かないように)
  const close = useCallback(() => {
    forgetLinkedPin()
    setTarget(null)
  }, [])
  return { placing, setPlacing, endPlacing, target, setTarget, openThreads, close }
}
