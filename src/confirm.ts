// 確かめの窓(整理 第2段 ⑤)。window.confirm の代わりに、Fluent の Dialog で聞く(画面の見た目と言葉にそろえる。
// ブラウザの窓は、画面の倍率・テーマ・英語の表示に合わず、ボタンの文言も選べないため)。
// React の外(取り込みの手順など)からも呼べるように、関数で開き、答えを Promise で返す。窓は ConfirmHost(App に 1 つ)が描く
import { useEffect, useSyncExternalStore } from 'react'

export interface Ask {
  message: string
  okLabel?: string
  resolve: (ok: boolean) => void
}

let current: Ask | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((f) => f())
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}
// 窓を描く所があるか(ない画面(開発用の画面など)では、ブラウザの窓で聞く)
let hosts = 0

/**
 * はい / いいえ を聞く。OK なら true。
 * 書き方: `if (!(await confirmDialog(tr('…消します。よろしいですか?', 'Delete …?')))) return`
 */
export function confirmDialog(message: string, opts: { okLabel?: string } = {}): Promise<boolean> {
  if (hosts === 0) return Promise.resolve(window.confirm(message))
  return new Promise((resolve) => {
    // 前の問いが残っていれば、やめたことにする(2 つを重ねて出さない)
    current?.resolve(false)
    current = { message, okLabel: opts.okLabel, resolve }
    emit()
  })
}

/** 答える(窓のボタンから) */
export const answerConfirm = (ok: boolean) => {
  const a = current
  current = null
  emit()
  a?.resolve(ok)
}

/** いま聞いていること(窓を描く所が使う)。描く所があることも、ここで数える */
export function useConfirmAsk(): Ask | null {
  useEffect(() => {
    hosts++
    return () => {
      hosts--
    }
  }, [])
  return useSyncExternalStore(subscribe, () => current)
}
