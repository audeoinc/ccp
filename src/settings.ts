const AUTO_KEY = 'cardDetail.autoDraft'

/** カードを開いたときの自動下書きの設定(既定はオン)。アプリ全体の設定で、ブラウザごとに保存する */
export function loadAutoDraft(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveAutoDraft(on: boolean) {
  try {
    localStorage.setItem(AUTO_KEY, on ? 'on' : 'off')
  } catch {
    // 保存できなくても動作には影響しない
  }
}

/** 画面の表示の好み(表示の切り替え・列の選択など)を、ブラウザごとに覚える。読めないときは既定値 */
export function loadPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : (JSON.parse(v) as T)
  } catch {
    return fallback
  }
}

export function savePref<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 保存できなくても動作には影響しない
  }
}

const SIMPLE_KEY = 'simpleCard.on'

/** シンプルな配信カード(SU1)で開くか。人の設定(当面はブラウザごと。ST1 の人の設定ができたら、そちらへ)。既定はオフ(今の配信カード) */
export const loadSimpleCard = (): boolean => loadPref<boolean>(SIMPLE_KEY, false)
export const saveSimpleCard = (on: boolean) => savePref(SIMPLE_KEY, on)
