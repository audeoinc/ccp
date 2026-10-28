// 機能の公開・非公開の判定(X87 段 ①。2026-10-29 利用者と決めた)。入口を出す所は、すべて isOn('ID') を通す(段 ② で入れていく)。
// 決まり:
// - 版が always の機能は、いつも公開。dev の機能は、開発者だけ。
// - 開発者には、非公開の機能も出す(「一般の人として見る」をオンにしている間は、一般の人と同じ)。
// - 公開の設定は表 feature_settings(環境ごと)。行のない機能は、'*' の行の値(起動のときに「公開」で入る)。
//   版を当てるとき(管理の画面)に、全部の機能の行を書き、'*' を非公開にする(そのあと足した機能が、黙って出ないように)。
// - 親(中・大)が非公開なら、子も非公開。前提(requires)は判定に入れない(管理の画面で知らせるだけ)。
// - 設定を読み込む前・読めないときは、公開として扱う(いまの見え方を変えないため)
import { useSyncExternalStore } from 'react'
import { FEATURES, FEATURE_GROUPS, type FeatureDef } from './features'
import { FeatureSettingsService } from './data/featureSettings'
import { myUserId, onMeChange } from './history'
import { peopleNow, subscribePeople } from './people'
import { loadPref, savePref } from './settings'
import { PREF } from './prefKeys'

/** 行のない機能の扱い('*' の行の feature_id) */
export const DEFAULT_KEY = '*'

interface State {
  loaded: boolean
  /** feature_id → 公開か */
  settings: Map<string, boolean>
  /** 行の id(書き換えるときに使う) */
  rowIds: Map<string, string>
}

let state: State = { loaded: false, settings: new Map(), rowIds: new Map() }
let viewAsUser = loadPref<boolean>(PREF.featuresViewAsUser, false)
let version = 0
const listeners = new Set<() => void>()
const emit = () => {
  version += 1
  listeners.forEach((f) => f())
}
let started = false

/** 公開の設定を読み直す(管理の画面で変えたあとも呼ぶ) */
export async function reloadFeatureSettings(): Promise<void> {
  started = true
  const r = await FeatureSettingsService.getAll()
  if (!r.success) return
  const settings = new Map<string, boolean>()
  const rowIds = new Map<string, string>()
  for (const row of r.data ?? []) {
    settings.set(row.feature_id, (row.enabled ?? 0) === 1)
    rowIds.set(row.feature_id, row.id)
  }
  state = { loaded: true, settings, rowIds }
  emit()
}

const subscribe = (f: () => void) => {
  listeners.add(f)
  if (!started) void reloadFeatureSettings()
  // 「あなた」・ユーザーが変わると、開発者かどうかが変わる
  const offMe = onMeChange(f)
  const offPeople = subscribePeople(f)
  return () => {
    listeners.delete(f)
    offMe()
    offPeople()
  }
}
const snapshot = () => `${version}|${myUserId()}|${peopleNow().users.length}`

/** いまの「あなた」が開発者か(ユーザーの is_developer。ログインが入るまでは、選んだ人で決まる) */
export function isDeveloper(): boolean {
  const id = myUserId()
  return !!id && peopleNow().users.some((u) => u.id === id && u.is_developer === 1)
}

/** 開発者が「一般の人として見る」をオンにしているか(ブラウザごとに覚える) */
export const viewingAsUser = () => viewAsUser
export function setViewingAsUser(v: boolean) {
  viewAsUser = v
  savePref(PREF.featuresViewAsUser, v)
  emit()
}

/** 開発者として見ているか(非公開の機能も出す) */
export const seesEverything = () => isDeveloper() && !viewAsUser

const byId = new Map(FEATURES.map((f) => [f.id, f]))
const groupArea = new Map(FEATURE_GROUPS.map((g) => [g.id, g.area]))

/** 設定の値(行がなければ '*'、'*' もなければ公開) */
export function settingOf(id: string): boolean {
  if (!state.loaded) return true
  return state.settings.get(id) ?? state.settings.get(DEFAULT_KEY) ?? true
}
/** その機能・中・大の行があるか(管理の画面で「既定のまま」を見分ける) */
export const hasSetting = (id: string) => state.settings.has(id)
export const settingRowId = (id: string) => state.rowIds.get(id)
export const settingsLoaded = () => state.loaded

/** 一般の人に出るか(開発者かどうかによらない。管理の画面・「非公開」の印で使う) */
export function isPublic(id: string): boolean {
  const def: FeatureDef | undefined = byId.get(id)
  if (!def) {
    // 中・大の id(管理の画面の木の行)
    const area = groupArea.get(id)
    return settingOf(id) && (!area || settingOf(area))
  }
  if (def.version === 'always') return true
  if (def.version === 'dev') return false
  const area = groupArea.get(def.group)
  return settingOf(def.id) && settingOf(def.group) && (!area || settingOf(area))
}

/** この機能の入口を出すか(開発者には非公開の機能も出す)。知らない ID は出す(書き間違いで画面が消えないように。管理の画面で見つける) */
export function isOn(id: string): boolean {
  const def = byId.get(id)
  if (!def) return true
  if (def.version === 'always') return true
  if (seesEverything()) return true
  return isPublic(id)
}

/** 開発者だから出ている(一般の人には出ない)か。入口の横に「非公開」の小さい印を出すため */
export const shownOnlyToDeveloper = (id: string) => byId.has(id) && seesEverything() && !isPublic(id)

/** 部品の中で使う(設定・「あなた」が変わったら描き直す) */
export function useFeature(id: string): boolean {
  useSyncExternalStore(subscribe, snapshot)
  return isOn(id)
}

/** 判定の変わり目を受け取る(管理の画面・印など) */
export function useFeatureVersion(): string {
  return useSyncExternalStore(subscribe, snapshot)
}
