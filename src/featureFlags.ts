// 機能の公開・非公開の判定(X87。段 ① は 2026-10-29、3.1 の作り替えも同じ日に利用者と決めた)。入口を出す所は、すべて isOn('ID') を通す。
// 決まり(docs/FEATURE_FLAGS.md の 3.1):
// - 版が always の機能は、いつも公開。dev の機能は、開発者だけ。開発者には、すべて出す(「一般の人として見る」の間は、一般の人と同じ)。
// - 機能ごとの上書き(表 feature_settings の mode): 止める(stop)なら非公開、先に出す(early)なら公開、版に従う(follow・行なし)なら版の公開に従う。
// - 版は、付け替えた版(feature_settings の version)があればそれ、なければコード(features.ts)の値。版の公開は表 feature_versions。
//   版の公開に従うので、あとで版に足した・付け替えた機能も、版が公開なら見える。
// - 親(中・大)を止めると、子も非公開。前提(requires)は判定に入れない(管理の画面で知らせるだけ)。
// - 設定を読み込む前・読めないときは、公開として扱う(いまの見え方を変えないため)
import { useSyncExternalStore } from 'react'
import { FEATURES, FEATURE_GROUPS, type FeatureDef, type FeatureVersion } from './features'
import { FeatureSettingsService } from './data/featureSettings'
import { FeatureVersionsService } from './data/featureVersions'
import type { FeatureMode, FeatureSetting } from './models/featureSettings'
import { myUserId, onMeChange } from './history'
import { peopleNow, subscribePeople } from './people'
import { loadPref, savePref } from './settings'
import { PREF } from './prefKeys'

interface State {
  loaded: boolean
  /** feature_id → 上書き(版・やり方・理由・行の id) */
  overrides: Map<string, FeatureSetting>
  /** 版 → 公開か(行の id も) */
  versions: Map<string, { published: boolean; id: string }>
}

let state: State = { loaded: false, overrides: new Map(), versions: new Map() }
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
  const [o, v] = await Promise.all([FeatureSettingsService.getAll(), FeatureVersionsService.getAll()])
  if (!o.success || !v.success) return
  // 段 ① の形の名残('*' の行・enabled だけの行)は読まない
  const overrides = new Map((o.data ?? []).filter((r) => r.feature_id !== '*').map((r) => [r.feature_id, r]))
  const versions = new Map((v.data ?? []).map((r) => [r.version, { published: (r.published ?? 0) === 1, id: r.id }]))
  state = { loaded: true, overrides, versions }
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

export const settingsLoaded = () => state.loaded
/** 機能(大・中も)の上書きの行 */
export const overrideOf = (id: string): FeatureSetting | undefined => state.overrides.get(id)
/** 上書きのやり方(行がなければ版に従う) */
export const modeOf = (id: string): FeatureMode => state.overrides.get(id)?.mode ?? 'follow'
/** いまの版(付け替えた版か、コードの値) */
export function versionOf(f: FeatureDef): FeatureVersion {
  const v = state.overrides.get(f.id)?.version
  return (v as FeatureVersion | undefined) || f.version
}
/** 付け替えてあるか(コードの値と違う) */
export const retargeted = (f: FeatureDef) => versionOf(f) !== f.version
/** 版が公開か(読み込む前・行がなければ公開) */
export const versionPublished = (v: string) => !state.loaded || (state.versions.get(v)?.published ?? true)
export const versionRowId = (v: string) => state.versions.get(v)?.id

/** 機能そのものが見えるか(親は見ない) */
function selfPublic(f: FeatureDef): boolean {
  const v = versionOf(f)
  if (v === 'always') return true
  if (v === 'dev') return false
  const mode = modeOf(f.id)
  if (mode === 'stop') return false
  if (mode === 'early') return true
  return versionPublished(v)
}
/** 中・大が止められていないか(中・大は止めるだけ。版は持たない) */
const groupOpen = (id: string) => modeOf(id) !== 'stop'

/** 一般の人に出るか(開発者かどうかによらない。管理の画面・「非公開」の印で使う) */
export function isPublic(id: string): boolean {
  const def = byId.get(id)
  if (!def) {
    // 中・大の id(管理の画面の木の行)
    const area = groupArea.get(id)
    return groupOpen(id) && (!area || groupOpen(area))
  }
  if (versionOf(def) === 'always') return true
  const area = groupArea.get(def.group)
  return selfPublic(def) && groupOpen(def.group) && (!area || groupOpen(area))
}

/** この機能の入口を出すか(開発者には非公開の機能も出す)。知らない ID は出す(書き間違いで画面が消えないように。管理の画面で見つける) */
export function isOn(id: string): boolean {
  const def = byId.get(id)
  if (!def) return true
  if (versionOf(def) === 'always') return true
  if (seesEverything()) return true
  return isPublic(id)
}

/** 開発者だから出ている(一般の人には出ない)か。入口の横に「非公開」の小さい印を出すため */
export const shownOnlyToDeveloper = (id: string) => byId.has(id) && seesEverything() && !isPublic(id)

/** 版ごとの数(版の一覧の「公開(1 つ止めている)」)。その版にいる機能のうち、止めている・先に出している数 */
export function versionCounts(v: FeatureVersion): { total: number; stopped: number; early: number } {
  const list = FEATURES.filter((f) => versionOf(f) === v)
  return { total: list.length, stopped: list.filter((f) => modeOf(f.id) === 'stop').length, early: list.filter((f) => modeOf(f.id) === 'early').length }
}

/** 部品の中で使う(設定・「あなた」が変わったら描き直す) */
export function useFeature(id: string): boolean {
  useSyncExternalStore(subscribe, snapshot)
  return isOn(id)
}

/** 判定の変わり目を受け取る(管理の画面・印など) */
export function useFeatureVersion(): string {
  return useSyncExternalStore(subscribe, snapshot)
}
