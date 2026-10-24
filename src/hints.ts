// 閉じた案内(Hint)の覚え(X72)。部品(Hint.tsx)と分けるのは、設定の画面(ST10)から resetHints を呼ぶため(部品のファイルから関数を出すと、画面の差し替え(fast refresh)が効かない)
import { loadPref, savePref } from './settings'
import { PREF } from './prefKeys'

const KEY = PREF.hintsDismissed
const listeners = new Set<() => void>()
let version = 0
export const subscribeHints = (f: () => void) => {
  listeners.add(f)
  return () => listeners.delete(f)
}
export const getHintsVersion = () => version

export const dismissedHints = (): string[] => loadPref<string[]>(KEY, [])

/** 閉じたヒントを、すべてもう一度出す(自分の設定の「ヒントをもう一度出す」) */
export function resetHints() {
  savePref<string[]>(KEY, [])
  version++
  listeners.forEach((f) => f())
}

/** 閉じたヒントの数(自分の設定で、戻すボタンを出すかに使う) */
export const dismissedHintCount = () => dismissedHints().length

/** ヒントを閉じた(次から出さない) */
export function dismissHint(key: string) {
  savePref(KEY, [...dismissedHints().filter((k) => k !== key), key])
}
