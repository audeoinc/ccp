// 閉じた案内(Hint)の覚え(X72)。部品(Hint.tsx)と分けるのは、設定の画面(ST10)から resetHints を呼ぶため(部品のファイルから関数を出すと、画面の差し替え(fast refresh)が効かない)
import { loadPref, savePref } from './settings'
import { PREF } from './prefKeys'
import { createSignal } from './store'

const KEY = PREF.hintsDismissed
// 戻したら、案内を描き直す(閉じた印は localStorage にあるので、ここは版の番号だけ)
const changed = createSignal()
export const subscribeHints = changed.subscribe
export const getHintsVersion = changed.version

export const dismissedHints = (): string[] => loadPref<string[]>(KEY, [])

/** 閉じたヒントを、すべてもう一度出す(自分の設定の「ヒントをもう一度出す」) */
export function resetHints() {
  savePref<string[]>(KEY, [])
  changed.notify()
}

/** 閉じたヒントの数(自分の設定で、戻すボタンを出すかに使う) */
export const dismissedHintCount = () => dismissedHints().length

/** ヒントを閉じた(次から出さない) */
export function dismissHint(key: string) {
  savePref(KEY, [...dismissedHints().filter((k) => k !== key), key])
}
