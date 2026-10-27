import { PREF } from './prefKeys'

// ブラウザ(localStorage)に覚える人の設定の、読み書きの入口(2026-10-24 の整理で、直接 localStorage を呼ぶ所をここに寄せた)。
// 鍵の一覧は prefKeys.ts。読めない・書けない(プライベートブラウズなど)ときは、既定値で動く

/** 値を、そのままの文字で読む(JSON にしていない古い形の設定。なければ null) */
export function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** 値を、そのままの文字で書く(null で消す) */
export function writeRaw(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    // 保存できなくても動作には影響しない
  }
}

/** カードを開いたときの自動下書きの設定(既定はオン)。アプリ全体の設定で、ブラウザごとに保存する */
export const loadAutoDraft = (): boolean => readRaw(PREF.autoDraft) !== 'off'

export const saveAutoDraft = (on: boolean) => writeRaw(PREF.autoDraft, on ? 'on' : 'off')

/** 新規作成・一括作成で最後に選んだ国。ヘッダーが「すべての国」のとき、国の初期値に使う('' = まだない) */
export const loadLastNewCountry = (): string => loadPref<string>(PREF.lastNewCountry, '')
export const saveLastNewCountry = (country: string) => {
  if (country) savePref(PREF.lastNewCountry, country)
}

/** 画面の表示の好み(表示の切り替え・列の選択など)を、ブラウザごとに覚える。読めないときは既定値 */
export function loadPref<T>(key: string, fallback: T): T {
  const v = readRaw(key)
  if (v === null) return fallback
  try {
    return JSON.parse(v) as T
  } catch {
    return fallback
  }
}

export const savePref = <T>(key: string, value: T) => writeRaw(key, JSON.stringify(value))

/** シンプルな配信カード(SU1)で開くか。人の設定(当面はブラウザごと。ST1 の人の設定ができたら、そちらへ)。既定はオフ(今の配信カード) */
export const loadSimpleCard = (): boolean => loadPref<boolean>(PREF.simpleCard, false)
export const saveSimpleCard = (on: boolean) => savePref(PREF.simpleCard, on)
