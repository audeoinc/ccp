// アラートの条件(バックログ A6)。何週分を切ったら知らせるか、どの種別・担当の配信を対象にするか、どの種類を出すか。
// ブラウザごとに覚える(人ごとに「自分が知らせてほしいもの」を決める)。ヘッダーの件数にも効く。
// 在庫の見込みそのものは、すべての配信で計算する(ほかの人の配信も在庫を減らすため)。条件は、出す配信を絞るだけ
import { THEME_TYPES, themeTypeOf } from './themeTypes'
import { useSyncExternalStore } from 'react'
import type { DeliveryCard } from './models/deliveryCards'
import type { ChangeAlert, StockAlert } from './alerts'
import { PREF } from './prefKeys'
import { loadPref, savePref } from './settings'

export interface AlertSettings {
  /** 対象にする種別(配信の部署。空は、すべて) */
  departments: string[]
  /** 対象にする担当(企画・制作のどちらか。空は、すべて) */
  owners: string[]
  /** 出す種類 */
  kinds: { outOfStock: boolean; lowStock: boolean; policyChanged: boolean; dateChanged: boolean }
}
// 在庫僅少の週数・週の上限は、国の基準に移した(ST2。src/countrySettings.ts。何を問題とみなすかは国の基準のため)

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  departments: [],
  owners: [],
  kinds: { outOfStock: true, lowStock: true, policyChanged: true, dateChanged: true },
}

const listeners = new Set<() => void>()
let current: AlertSettings = load()

function load(): AlertSettings {
  try {
    const o = loadPref<Partial<AlertSettings> | null>(PREF.alertSettings, null)
    if (!o) return DEFAULT_ALERT_SETTINGS
    // 種別は、以前は数値で覚えていた。文字の値でないものは捨てる(絞り込みが外れるだけ)
    // 対象の種類(X41。これまでの種別の値 promotion などは、種類にないので捨てる)
    const departments = (o.departments ?? []).filter((d) => typeof d === 'string' && (THEME_TYPES as string[]).includes(d))
    // 前に覚えていた lowWeeks・weeklyLimit は使わない(国の基準に移した。国の設定の画面で、1 回だけ取り込める)
    return { departments, owners: o.owners ?? [], kinds: { ...DEFAULT_ALERT_SETTINGS.kinds, ...o.kinds } }
  } catch {
    return DEFAULT_ALERT_SETTINGS
  }
}

export function setAlertSettings(next: AlertSettings) {
  current = next
  // 覚えられなくても、この画面では効かせる
  savePref(PREF.alertSettings, next)
  for (const l of listeners) l()
}

export function useAlertSettings(): AlertSettings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => current,
  )
}

/** 既定から変えているか(画面に「条件で絞り込み中」と出すため) */
export const isCustomized = (s: AlertSettings) => JSON.stringify(s) !== JSON.stringify(DEFAULT_ALERT_SETTINGS)

/** 条件に合う配信か(種別・担当) */
export function inScope(s: AlertSettings, c: DeliveryCard): boolean {
  if (s.departments.length > 0 && !s.departments.includes(themeTypeOf(c).type)) return false
  if (s.owners.length > 0 && !s.owners.some((o) => o === c.owner?.trim() || o === c.production_owner?.trim())) return false
  return true
}

/** 条件で、在庫のアラートを絞る(影響する配信を条件に合うものだけにし、なくなったアラートは出さない) */
export function filterStockAlerts(s: AlertSettings, alerts: StockAlert[]): StockAlert[] {
  return alerts
    .filter((a) => s.kinds[a.kind])
    .map((a) => ({ ...a, deliveries: a.deliveries.filter((d) => inScope(s, d.card)) }))
    .filter((a) => a.deliveries.length > 0)
}

/**
 * 条件で、変更のアラートを絞る。
 * 日程の変更は、移した配信が条件に合うときに出す(重なる配信は、ほかの人の配信でも出す。重なりは、相手の配信にも関わるため)。
 * 方針の変更は、影響する配信を条件に合うものだけにする。配信のない「主力になった」知らせは、種別・担当で絞っていないときだけ出す
 */
export function filterChangeAlerts(s: AlertSettings, alerts: ChangeAlert[]): ChangeAlert[] {
  const scoped = s.departments.length > 0 || s.owners.length > 0
  return alerts
    .filter((a) => s.kinds[a.kind])
    .flatMap((a) => {
      if (a.kind === 'dateChanged') return a.card && inScope(s, a.card) ? [a] : []
      const deliveries = a.deliveries.filter((d) => inScope(s, d.card))
      if (deliveries.length > 0) return [{ ...a, deliveries }]
      return a.deliveries.length === 0 && !scoped ? [a] : []
    })
}
