import { useEffect, useState } from 'react'
import type { SwapRender } from '../ProductActionFloat'
import type { SimpleEditor } from './editor'
import type { PartTurn } from './partAi'
import { FloatSwap } from './ProductSwap'

/** 商品のフロートの中に出す引き出しが読む、いまの画面の値 */
export interface Live {
  editor: SimpleEditor
  chats: Record<string, PartTurn[]>
  setChat: (key: string, f: (prev: PartTurn[]) => PartTurn[]) => void
  onSwapped: (from: string, to: string) => void
}

/** 画面の値を、商品のフロート(配信カードの側に描く)へ届ける入れ物。描くたびに入れ替え、読んでいる引き出しを描き直す */
function liveStore(first: Live) {
  let value = first
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (v: Live) => {
      value = v
      for (const l of listeners) l()
    },
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => {
        listeners.delete(l)
      }
    },
  }
}
export type LiveStore = ReturnType<typeof liveStore>

/**
 * 商品のフロートの「入れ替える」で、フロートの中に出す引き出し(どの入口でも同じ ProductSwap。2026-10-26 利用者と決めた)。
 * フロートは配信カードの側に描くので、開いたときの値のままにならないよう、いまの値(配信の中身・AI とのやり取り)を入れ物で届ける
 */
export function useFloatSwap(live: Live): (itemKey: string) => SwapRender {
  const [store] = useState(() => liveStore(live))
  useEffect(() => {
    store.set(live)
  })
  return (itemKey) => (back, close) => <FloatSwap store={store} itemKey={itemKey} back={back} close={close} />
}
