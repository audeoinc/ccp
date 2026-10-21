// 画面全体の表示の大きさ(X60。利用者の要望 2026-10-21: ノート PC で見ると、作業の領域がかなり狭くなる)。
// 文字も部品もまとめて縮める・広げる(html に CSS の zoom を掛ける。ダイアログ・フロートも body の中なので、同じく効く)。ブラウザごとに覚える
import { useSyncExternalStore } from 'react'

// 70% は、利用者の要望(2026-10-21: もう一回り小さく)で足した
export const UI_SCALES = [0.7, 0.8, 0.9, 1, 1.1] as const
export type UiScale = (typeof UI_SCALES)[number]

const KEY = 'ui.scale'
const listeners = new Set<() => void>()

function load(): UiScale {
  try {
    const v = Number(localStorage.getItem(KEY))
    return (UI_SCALES as readonly number[]).includes(v) ? (v as UiScale) : 1
  } catch {
    return 1
  }
}

let current: UiScale = load()

/** いまの大きさを、画面に効かせる(起動のときと、変えたとき) */
export function applyUiScale() {
  const html = document.documentElement
  html.style.zoom = current === 1 ? '' : String(current)
  // 画面の高さ・幅(vh / vw)で決めている大きさは、この値で割って、画面いっぱいを保つ(zoom を掛けると、中の 100vh が画面の 80% などになるため)
  html.style.setProperty('--ui-zoom', String(current))
}

/** 画面の幅・高さを、中の px で(zoom を掛けた分を戻す)。ペインの既定の幅・フロートの大きさの上限に使う */
export const viewWidth = () => window.innerWidth / current
export const viewHeight = () => window.innerHeight / current

export function setUiScale(v: UiScale) {
  current = v
  try {
    localStorage.setItem(KEY, String(v))
  } catch {
    // 覚えられなくても、この画面では効かせる
  }
  applyUiScale()
  for (const l of listeners) l()
}

export const getUiScale = () => current

export function useUiScale(): UiScale {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}
