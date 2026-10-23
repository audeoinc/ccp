// 共通のマスタ + 国ごとの適用(ST7。BACKLOG 13 章)。テンプレート(ST1)・学び(ST5)・ポリシー(ST8)で同じ形にそろえる。
// それぞれの表に国の列を足すと、国ごとに写しを作ることになり、直すときに全部の写しを直す羽目になる。
// マスタは共通で 1 つ持ち、「どの国で使うか」だけを表 country_applications に持つ。
// 変えるたびに 1 行足す(種類・マスタの id・国の組で、いちばん新しい行が、いまの値。前の行は、変えた人・日時の履歴)。
// 行がなければ種類ごとの既定なので、今あるデータは何もしなくてもそのまま動く
import { useSyncExternalStore } from 'react'
import { CountryApplicationsService } from './data/countryApplications'
import type { CountryApplicationKind, CountryApplicationMode } from './models/countryApplications'

export type ApplyKind = CountryApplicationKind

/**
 * 行がないときに使うか(種類ごと)。テンプレートは、全部の国で使う(今あるテンプレートが、どの国でも出なくならないように)。
 * 学びは、出元の国によって既定が変わる(出元の国は使う・ほかの国は使わない)ので、呼ぶ側が appliesIn の fallback で渡す
 */
const DEFAULT_USE: Record<ApplyKind, boolean> = { template: true, learning: true, policy: true }

/** 変えた記録 1 件 */
export interface ApplyEntry {
  use: boolean
  by: string
  at: string
}

// 「種類|id|国」→ 変えた記録(新しい順)
let history = new Map<string, ApplyEntry[]>()
let version = 0
const listeners = new Set<() => void>()
const notify = () => {
  version += 1
  for (const l of listeners) l()
}
const keyOf = (kind: ApplyKind, id: string, country: string) => `${kind}|${id}|${country}`

/** 国の適用を読む(開いたとき・変えたあと) */
export async function loadCountryApply(): Promise<void> {
  const r = await CountryApplicationsService.getAll({ orderBy: ['created_on desc'], top: 5000 })
  if (!r.success) return
  const next = new Map<string, ApplyEntry[]>()
  for (const row of r.data ?? []) {
    const k = keyOf(row.kind, row.item_id, row.country ?? '')
    next.set(k, [...(next.get(k) ?? []), { use: row.mode !== 'skip', by: row.changed_by ?? '', at: row.created_on ?? '' }])
  }
  history = next
  notify()
}

/**
 * その国で使うか。国を渡さない(すべての国)ときは、使う。
 * fallback: 決めていないときの値(種類の既定と違うときに渡す。学びは、出元の国だけ使うので、ほかの国では false)
 */
export const appliesIn = (kind: ApplyKind, id: string, country?: string | null, fallback: boolean = DEFAULT_USE[kind]): boolean =>
  !country ? true : (history.get(keyOf(kind, id, country))?.[0]?.use ?? fallback)

/** 学びを、その国で使うか(ST5)。出元の国は決めていなければ使う。ほかの国は、人が「使う」と決めたときだけ(国で客層が違うため) */
export const learningUsableIn = (id: string, origin: string, country: string) => appliesIn('learning', id, country, origin === country)

/** 国で使うかを、決めたか(行があるか)。決めていなければ既定 */
export const applyDecided = (kind: ApplyKind, id: string, country: string): boolean => history.has(keyOf(kind, id, country))

/** その国の、変えた記録(マスタの id → 新しい順) */
export function applyHistory(kind: ApplyKind, country: string): { id: string; entry: ApplyEntry }[] {
  const head = `${kind}|`
  const tail = `|${country}`
  return [...history.entries()]
    .filter(([k]) => k.startsWith(head) && k.endsWith(tail))
    .flatMap(([k, list]) => list.map((entry) => ({ id: k.slice(head.length, k.length - tail.length), entry })))
    .sort((a, b) => b.entry.at.localeCompare(a.entry.at))
}

/** 国の適用が読み直されたら、描き直す(返す値は、読み直した回数) */
export function useCountryApply(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
}

/** 国で使う・使わないを変える(変えたものだけ、1 行ずつ足す。国の全員に効く) */
export async function saveApply(kind: ApplyKind, country: string, changes: { id: string; use: boolean }[], by: string): Promise<void> {
  for (const c of changes) {
    const mode: CountryApplicationMode = c.use ? 'use' : 'skip'
    const r = await CountryApplicationsService.create({ kind, item_id: c.id, country, mode, changed_by: by })
    if (!r.success) throw new Error(r.error?.message ?? 'Could not save')
  }
  await loadCountryApply()
}
