// 画面全体の表示の大きさ(X60。利用者の要望 2026-10-21: ノート PC で見ると、作業の領域がかなり狭くなる)。
// 文字も部品もまとめて縮める・広げる(html に CSS の zoom を掛ける。ダイアログ・フロートも body の中なので、同じく効く)。ブラウザごとに覚える
import { PREF } from './prefKeys'
import { readRaw, writeRaw } from './settings'
import { createStore } from './store'

// 70% は、利用者の要望(2026-10-21: もう一回り小さく)で足した
export const UI_SCALES = [0.7, 0.8, 0.9, 1, 1.1] as const
export type UiScale = (typeof UI_SCALES)[number]

// 自動で選ぶ候補(大きい順)。70% は小さすぎて読みにくく、110% は広い画面でも要らないので、自分で選んだときだけ(settings.me.autoscale。2026-11-02 利用者)
const AUTO_SCALES = [1, 0.9, 0.8] as const
/** 自動で選ぶときの目安: 割り戻した広さが、配信カードの窓がちょうど収まるこの大きさ以上になること */
export const AUTO_FIT = { w: 1440, h: 820 }

/**
 * ブラウザの中の幅・高さから、自動の大きさを決める。物理のピクセルでは測らない(OS・ブラウザの拡大とウィンドウの大きさが、すべて込みの値で決めるため)。
 * 収まる倍率のうち、いちばん大きいもの。どれでも収まらなければ、下限の 80%
 */
export function autoScaleFor(width: number, height: number): UiScale {
  return AUTO_SCALES.find((s) => width / s >= AUTO_FIT.w && height / s >= AUTO_FIT.h) ?? 0.8
}

/** 自分で選んで覚えた値(なければ null = 自動) */
function stored(): UiScale | null {
  const v = Number(readRaw(PREF.uiScale) ?? NaN)
  return (UI_SCALES as readonly number[]).includes(v) ? (v as UiScale) : null
}

const scale = createStore<UiScale>(stored() ?? 1)
// 自動で決めた大きさか(右上のメニューの「自動(80%)」と、最初の 1 回のお知らせに使う)
const auto = createStore<boolean>(false)

/** いまの大きさを、画面に効かせる(起動のときと、変えたとき) */
export function applyUiScale() {
  const html = document.documentElement
  const current = scale.get()
  html.style.zoom = current === 1 ? '' : String(current)
  // 画面の高さ・幅(vh / vw)で決めている大きさは、この値で割って、画面いっぱいを保つ(zoom を掛けると、中の 100vh が画面の 80% などになるため)
  html.style.setProperty('--ui-zoom', String(current))
}

/**
 * 起動のとき(最初の描画の前)。覚えた値があればそれ、なければ autoOn のときだけ画面に合わせて決める(非公開なら、いままでどおり 100%)。
 * 決めるのは開いたときだけ。使っている途中にウィンドウの大きさを変えても、変えない(急に文字の大きさが変わると戸惑うため)
 */
export function startUiScale(autoOn: boolean) {
  const v = stored()
  auto.set(v === null && autoOn)
  scale.set(v ?? (autoOn ? autoScaleFor(window.innerWidth, window.innerHeight) : 1))
  applyUiScale()
}

/** 画面の幅・高さを、中の px で(zoom を掛けた分を戻す)。ペインの既定の幅・フロートの大きさの上限に使う */
export const viewWidth = () => window.innerWidth / scale.get()
export const viewHeight = () => window.innerHeight / scale.get()

export function setUiScale(v: UiScale) {
  // 覚えられなくても、この画面では効かせる
  writeRaw(PREF.uiScale, String(v))
  auto.set(false)
  scale.set(v)
  applyUiScale()
}

/** 「自動(おすすめ)」に戻す: 覚えた値を消し、いまの画面で測り直す(次に開いたときも測る) */
export function setUiScaleAuto() {
  writeRaw(PREF.uiScale, null)
  auto.set(true)
  scale.set(autoScaleFor(window.innerWidth, window.innerHeight))
  applyUiScale()
}

/** 自動が非公開になったとき(公開の設定を読み終えたあと): いままでどおりの 100% に戻す。覚えた値は無いままにする */
export function dropUiScaleAuto() {
  if (!auto.get()) return
  auto.set(false)
  scale.set(1)
  applyUiScale()
}

export const getUiScale = scale.get

export const useUiScale = (): UiScale => scale.use()
export const useUiScaleAuto = (): boolean => auto.use()
export const isUiScaleAuto = auto.get
