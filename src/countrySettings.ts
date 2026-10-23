// 国ごとの設定(ST2。BACKLOG 13 章の「国」の段)。何を問題とみなすかは国の基準なので、ブラウザではなく国ごとに持つ。
// いまは「アラートの基準」(在庫僅少の週数・週の上限・販売順位の上位の線)。変えると国の全員に効くので、変えた人・日時を残す
// (表 country_settings に、変えるたびに 1 行足す。いちばん新しい行が、いまの値)。
// 見る人の絞り込み(対象の種類・担当・出すアラートの種類)は、人ごとのまま(src/alertSettings.ts)
import { useSyncExternalStore } from 'react'
import { CountrySettingsService } from './data/countrySettings'

export interface CountryCriteria {
  /** 在庫が、配信日に何週分を切ったら「在庫僅少」にするか */
  lowWeeks: number
  /** 週の上限(同じ商品を、同じ週に何本の配信まで載せてよいか。C3)。マーケティングの決まりに「上限 週 N 回」があれば、そちらが優先(src/weeklyLimit.ts) */
  weeklyLimit: number
  /** 販売順位で「上位」とみなす線(Top N)。EC のランキングのページの件数などに合わせる */
  rankTopN: number
}

export const DEFAULT_CRITERIA: CountryCriteria = { lowWeeks: 2, weeklyLimit: 2, rankTopN: 60 }

/** 変えた記録 1 件 */
export interface CriteriaEntry {
  criteria: CountryCriteria
  by: string
  at: string
}

const NAME = 'criteria'
// 国 → 変えた記録(新しい順)
let history = new Map<string, CriteriaEntry[]>()
let version = 0
const listeners = new Set<() => void>()
const notify = () => {
  version += 1
  for (const l of listeners) l()
}

const parse = (v?: string): CountryCriteria => {
  try {
    const o = JSON.parse(v ?? '{}') as Partial<CountryCriteria>
    const num = (x: unknown, d: number) => (typeof x === 'number' && x > 0 ? x : d)
    return { lowWeeks: num(o.lowWeeks, DEFAULT_CRITERIA.lowWeeks), weeklyLimit: num(o.weeklyLimit, DEFAULT_CRITERIA.weeklyLimit), rankTopN: num(o.rankTopN, DEFAULT_CRITERIA.rankTopN) }
  } catch {
    return DEFAULT_CRITERIA
  }
}

/** 国の設定を読む(開いたとき・変えたあと) */
export async function loadCountrySettings(): Promise<void> {
  const r = await CountrySettingsService.getAll({ filter: `name eq '${NAME}'`, orderBy: ['created_on desc'], top: 2000 })
  if (!r.success) return
  const next = new Map<string, CriteriaEntry[]>()
  for (const row of r.data ?? []) {
    const co = row.country ?? ''
    next.set(co, [...(next.get(co) ?? []), { criteria: parse(row.value), by: row.changed_by ?? '', at: row.created_on ?? '' }])
  }
  history = next
  notify()
}

/** その国の基準(設定がなければ既定値)。描画の外でも使える。描画の中で変わりを受け取るときは useCountrySettings も呼ぶ */
export const criteriaFor = (country?: string | null): CountryCriteria => (country ? history.get(country)?.[0]?.criteria : undefined) ?? DEFAULT_CRITERIA

/** その国の、変えた記録(新しい順) */
export const criteriaHistory = (country: string): CriteriaEntry[] => history.get(country) ?? []

/** 国の設定が読み直されたら、描き直す(返す値は、読み直した回数) */
export function useCountrySettings(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => version,
  )
}

/** 国の基準を変える(1 行足す。国の全員に効く) */
export async function saveCriteria(country: string, next: CountryCriteria, by: string): Promise<void> {
  const r = await CountrySettingsService.create({ name: NAME, country, value: JSON.stringify(next), changed_by: by })
  if (!r.success) throw new Error(r.error?.message ?? 'Could not save')
  await loadCountrySettings()
}

/**
 * このブラウザに残っている、前の値(国の設定に移す前は、アラートの条件と販売順位の線をブラウザごとに覚えていた)。
 * 既定と違うものだけを返す(なければ null)。国の設定に 1 回取り込めるように
 */
export function browserCriteria(): Partial<CountryCriteria> | null {
  const out: Partial<CountryCriteria> = {}
  try {
    const a = JSON.parse(localStorage.getItem('alerts.settings') ?? '{}') as Partial<CountryCriteria>
    if (typeof a.lowWeeks === 'number' && a.lowWeeks !== DEFAULT_CRITERIA.lowWeeks) out.lowWeeks = a.lowWeeks
    if (typeof a.weeklyLimit === 'number' && a.weeklyLimit !== DEFAULT_CRITERIA.weeklyLimit) out.weeklyLimit = a.weeklyLimit
    const n = Number(localStorage.getItem('results.rankTopN'))
    if (Number.isInteger(n) && n >= 1 && n !== DEFAULT_CRITERIA.rankTopN) out.rankTopN = n
  } catch {
    return null
  }
  return Object.keys(out).length ? out : null
}
