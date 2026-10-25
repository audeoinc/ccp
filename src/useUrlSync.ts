import { useEffect } from 'react'
import { hasFloat, linkSearch, parseLink, type LinkState } from './deepLink'
import { useStableCallback } from './useStableCallback'

// どのフロートを開いているか(配信カード・結果・制作のページ・アラート)。替わったら、履歴に積む
const floatKey = (l: Partial<LinkState>) => [l.card, l.result, l.production, l.alerts].join('|')

/**
 * 画面の状態を URL に持たせる(X36。App から分けた。整理 第 3 段)。
 * 状態が変わったら URL を書き換え、ブラウザの「戻る」「進む」では、URL の状態を onPop に渡して、画面を戻してもらう
 */
export function useUrlSync(linkState: LinkState, onPop: (l: Partial<LinkState>) => void): void {
  const search = linkSearch(linkState)
  const currentFloat = floatKey(linkState)
  useEffect(() => {
    if (search === window.location.search) return
    const url = `${window.location.pathname}${search}${window.location.hash}`
    // フロートを新しく開いた(別のものに替えた)ときは履歴に積み、「戻る」で閉じられるようにする。ほかは書き換えるだけ
    const before = parseLink(window.location.search)
    if (hasFloat(linkState) && floatKey(before) !== currentFloat) window.history.pushState(null, '', url)
    else window.history.replaceState(null, '', url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])
  const popped = useStableCallback(onPop)
  useEffect(() => {
    const on = () => popped(parseLink(window.location.search))
    window.addEventListener('popstate', on)
    return () => window.removeEventListener('popstate', on)
  }, [popped])
}
