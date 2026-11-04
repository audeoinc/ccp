// BigQuery の表の場所の値と保存(⚙ →「データの取り込み」に 1 つ)。画面の部品は BqLocations.tsx
// 値と保存はここの 1 つだけを使い、行ごとに持たない(どの行で保存しても、ほかの行の値を巻き戻さないように)
import { useCallback, useEffect, useState } from 'react'
import { AppSettingsService, type SettingsView } from './data/appSettings'
import type { ImportCheck } from './data/dataImport'

export interface BqLocationsState {
  view: SettingsView | null
  form: Record<string, string>
  busy: string | null
  error: string
  /** 保存した直後の項目(行に「保存しました」を出す) */
  savedKeys: string[]
  tried: Record<string, ImportCheck['outputs'][number]>
  set: (key: string, v: string) => void
  dirty: (keys: string[]) => boolean
  tryOutputs: (names?: string[]) => Promise<void>
  save: (keys: string[]) => Promise<void>
  /** 値を読み直す(確認待ちを解いたあとなど) */
  reload: () => Promise<void>
}

/** 表の場所の値と保存(パネルに 1 つ)。onSaved = 取り込みの状態を読み直す(設定した出力が変わるため) */
export function useBqLocations(onSaved: () => void): BqLocationsState {
  const [view, setView] = useState<SettingsView | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [savedKeys, setSavedKeys] = useState<string[]>([])
  const [tried, setTried] = useState<Record<string, ImportCheck['outputs'][number]>>({})

  const take = (v: SettingsView) => {
    setView(v)
    setForm(Object.fromEntries(Object.entries(v.values).map(([k, x]) => [k, String(x ?? '')])))
  }
  useEffect(() => {
    let alive = true
    void AppSettingsService.get('bq').then((r) => {
      if (!alive) return
      if (r.data) take(r.data)
      else setError(r.error ?? '')
    })
    return () => {
      alive = false
    }
  }, [])

  const reload = useCallback(async () => {
    const r = await AppSettingsService.get('bq')
    if (r.data) setView(r.data)
  }, [])

  const set = useCallback((key: string, v: string) => {
    setForm((f) => ({ ...f, [key]: v }))
    setSavedKeys([])
  }, [])
  const dirty = (keys: string[]) => !!view && keys.some((k) => (form[k] ?? '') !== String(view.values[k] ?? ''))
  const tryOutputs = async (names?: string[]) => {
    setBusy(`try:${names?.join(',') ?? '*'}`)
    setError('')
    const r = await AppSettingsService.tryBq(form, names)
    setBusy(null)
    if (!r.data) return setError(r.error ?? '')
    setTried((prev) => ({ ...prev, ...Object.fromEntries(r.data!.outputs.map((o) => [o.name, o])) }))
  }
  // 保存は、その行の項目だけを変える(ほかの行で書きかけの値は、保存した値に混ぜない)
  const save = async (keys: string[]) => {
    if (!view) return
    setBusy(`save:${keys.join(',')}`)
    setError('')
    const values = { ...Object.fromEntries(Object.entries(view.values).map(([k, x]) => [k, String(x ?? '')])), ...Object.fromEntries(keys.map((k) => [k, form[k] ?? ''])) }
    const r = await AppSettingsService.save('bq', values)
    setBusy(null)
    if (!r.data) return setError(r.error ?? '')
    const keep = Object.fromEntries(Object.entries(form).filter(([k]) => !keys.includes(k)))
    setView(r.data)
    setForm({ ...Object.fromEntries(Object.entries(r.data.values).map(([k, x]) => [k, String(x ?? '')])), ...keep })
    setSavedKeys(keys)
    onSaved()
  }
  return { view, form, busy, error, savedKeys, tried, set, dirty, tryOutputs, save, reload }
}
